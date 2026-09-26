(() => {
  "use strict";

  // ---------------------------------------------------------------
  //  Timeline (aus timing.js, im Kalibriermodus lokal verschiebbar)
  // ---------------------------------------------------------------
  const CALIBRATE = new URLSearchParams(location.search).has("calibrate");
  const T = Object.assign({}, window.BEAT_TIMING);
  if (CALIBRATE) {
    try {
      const o = JSON.parse(localStorage.getItem("sib.timingOverride") || "null");
      if (o) Object.assign(T, o);
    } catch (e) {}
  }

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  audio.src = T.audioFile;

  const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

  let words = [];   // [{hz, py}]
  let rounds = [];  // [[idx x8], ...]
  let cues = [];    // ROUND_START-Zeiten (Sekunden in der MP3)

  function buildCues() {
    const sh = T.shift || 0;
    cues = T.roundStarts.map((x) => x + sh);
  }
  buildCues();

  // Zeitpunkte innerhalb einer Runde (relativ zu ROUND_START)
  const markerEnd = () => 7 * T.markerStep + T.lastWordHold;   // Marker verschwindet
  const previewAt = () => T.previewAfter;                        // ROUND_PREVIEW der nächsten Runde

  // ---------------------------------------------------------------
  //  Zustand zu Zeitpunkt t – rein aus audio.currentTime berechnet.
  //  Keine Umrechnung mit dem Tempo: playbackRate verändert nur, wie
  //  schnell audio.currentTime läuft – die Timeline bleibt gleich.
  // ---------------------------------------------------------------
  function stateAt(t) {
    if (!cues.length) return { round: 0, marker: -1, phase: "intro", frac: 0 };
    let k = -1;
    for (let i = 0; i < cues.length; i++) { if (cues[i] <= t) k = i; else break; }

    if (k === -1) {
      // Intro: Runde 1 ist schon sichtbar, kein Marker
      const lead = (cues.length > 1 ? cues[1] - cues[0] : 5.3) - previewAt();
      const frac = 1 - (cues[0] - t) / lead;
      return { round: 0, marker: -1, phase: "intro", frac };
    }
    const into = t - cues[k];
    if (into < markerEnd()) {
      // ROUND_START … Wort ⑧: gelber Marker läuft
      return { round: k, marker: Math.min(7, Math.floor(into / T.markerStep)), phase: "speak" };
    }
    if (k + 1 >= cues.length) return { round: k, marker: -1, phase: "end" };
    if (into < previewAt()) {
      // kurze Lücke zwischen Ende von ⑧ und ROUND_PREVIEW
      return { round: k, marker: -1, phase: "gap" };
    }
    // ROUND_PREVIEW: nächste Runde sichtbar, kein Marker, bis zum nächsten ROUND_START
    const p0 = cues[k] + previewAt();
    return { round: k + 1, marker: -1, phase: "prep", frac: (t - p0) / (cues[k + 1] - p0) };
  }

  // Glatte Zeit: audio.currentTime + Interpolation zwischen seinen Updates
  let lastCT = 0, lastStamp = 0;
  function audioTime() {
    const ct = audio.currentTime, now = performance.now();
    if (audio.paused || ct !== lastCT) { lastCT = ct; lastStamp = now; return ct; }
    return ct + Math.min((now - lastStamp) / 1000, 0.08) * audio.playbackRate;
  }

  // ---------------------------------------------------------------
  //  Tempo (audio.playbackRate)
  // ---------------------------------------------------------------
  let tempo = T.defaultTempo || 1;
  try {
    const saved = parseFloat(localStorage.getItem("sib.tempo"));
    if (T.tempos.includes(saved)) tempo = saved;
  } catch (e) {}

  function setTempo(r) {
    tempo = r;
    audio.defaultPlaybackRate = r;
    audio.playbackRate = r;
    try { localStorage.setItem("sib.tempo", String(r)); } catch (e) {}
    document.querySelectorAll(".tempo button").forEach((b) => b.classList.toggle("on", +b.dataset.rate === r));
  }
  document.querySelectorAll(".tempo").forEach((box) => {
    box.innerHTML = T.tempos.map((r) =>
      `<button type="button" data-rate="${r}">${r.toFixed(2).replace(".", ",")}×</button>`).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      setTempo(+b.dataset.rate);
      b.blur();   // damit SPACE weiter Pause/Weiter bleibt
    });
  });
  setTempo(tempo);

  // ---------------------------------------------------------------
  //  Vokabeln einlesen
  // ---------------------------------------------------------------
  const TONES = { a: "āáǎàa", e: "ēéěèe", i: "īíǐìi", o: "ōóǒòo", u: "ūúǔùu", "ü": "ǖǘǚǜü" };
  function numToTone(syl) {
    const m = syl.match(/^([a-züv:]+)([1-5])$/i);
    if (!m) return syl;
    let s = m[1].replace(/v|u:/gi, "ü");
    const tone = +m[2];
    const low = s.toLowerCase();
    let pos = low.search(/[ae]/);
    if (pos < 0) pos = low.indexOf("ou");
    if (pos < 0) { for (let i = low.length - 1; i >= 0; i--) if ("iouü".includes(low[i])) { pos = i; break; } }
    if (pos < 0) return s;
    const v = low[pos];
    return s.slice(0, pos) + TONES[v][tone - 1] + s.slice(pos + 1);
  }
  function fixPinyin(py) { return py.split(/(\s+)/).map(numToTone).join(""); }

  function parseVocab(text) {
    const seen = new Set();
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let hz, py;
      const sep = l.match(/\s*[|\t;｜]\s*/);
      if (sep) { hz = l.slice(0, sep.index); py = l.slice(sep.index + sep[0].length); }
      else { const p = l.split(/\s+/); hz = p.shift(); py = p.join(" "); }
      return { hz: hz.trim(), py: fixPinyin(py.trim()) };
    }).filter((w) => !seen.has(w.hz) && seen.add(w.hz));   // doppelte Einträge nur einmal
  }

  // ---------------------------------------------------------------
  //  Wortmuster-Generator
  //  Zufällig ist nur, WELCHE Wörter ein Paar bilden und in welcher
  //  Reihenfolge die Paare kommen. Die 8 Positionen folgen immer
  //  einem einfachen rhythmischen Muster.
  //  Der ganze Pool (beliebig viele Wörter) wird gemischt und in Paare
  //  zerlegt – jedes Wort kommt dran, bevor der Pool neu gemischt wird.
  // ---------------------------------------------------------------
  const BASIC = ["XXXXYYYY", "XXYYYYXX"];               // XXXX/YYYY, XXYY/YYXX
  const HARDER = ["XYXYYXYX", "XXYXYYXY", "XYYXYXXY", "XXXYYYYX"];

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Beim Neumischen soll das erste Paar möglichst kein Wort des letzten Paares enthalten
  const overlaps = (p, q, n) => p && q && (n >= 4 ? p.some((x) => q.includes(x))
    : (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]));

  // Alle Wörter zufällig zu Paaren zusammenstellen (jedes Wort kommt vor)
  function makePairs(n, avoid) {
    let pairs = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const idx = shuffle([...Array(n).keys()]);
      pairs = [];
      for (let i = 0; i < n; i += 2) {
        if (i + 1 < n) pairs.push([idx[i], idx[i + 1]]);
        else {
          // ungerade Anzahl: letztes Wort bekommt einen zufälligen Partner
          const others = idx.filter((x) => x !== idx[i]);
          pairs.push([idx[i], others.length ? others[Math.floor(Math.random() * others.length)] : idx[i]]);
        }
      }
      if (!overlaps(pairs[0], avoid, n)) break;
    }
    return pairs;
  }

  function applyPattern(p, x, y) { return [...p].map((c) => (c === "X" ? x : y)); }

  function generateRounds(n, total) {
    const out = [];
    let cycle = 0, last = null;
    while (out.length < total) {
      for (const [x, y] of makePairs(n, last)) {
        if (out.length >= total) break;
        const pats = cycle === 0 ? BASIC : shuffle([...HARDER]).slice(0, 2);
        for (const p of pats) if (out.length < total) out.push(applyPattern(p, x, y));
        last = [x, y];
      }
      cycle++;
    }
    return out;
  }

  // ---------------------------------------------------------------
  //  Teacher-UI
  // ---------------------------------------------------------------
  const vocabEl = $("vocab");
  const DEFAULT_VOCAB = "累 | lèi\n忙 | máng\n饿 | è\n渴 | kě";
  try { vocabEl.value = localStorage.getItem("sib.vocab") || DEFAULT_VOCAB; }
  catch (e) { vocabEl.value = DEFAULT_VOCAB; }

  function updateInfo() {
    const w = parseVocab(vocabEl.value);
    const info = $("vocabInfo");
    if (w.length < 2) {
      info.textContent = `${w.length} Vokabel – bitte mindestens 2 verschiedene eingeben.`;
      info.className = "info bad";
    } else {
      info.textContent = `${w.length} Vokabeln im Pool: ` + w.map((x) => `${x.hz} ${x.py}`).join(" · ");
      info.className = "info";
    }
    return w;
  }
  vocabEl.addEventListener("input", () => { updateInfo(); $("btnStart").disabled = true; $("preview").innerHTML = ""; });

  function generate() {
    const w = updateInfo();
    if (w.length < 2) return;
    words = w;
    try { localStorage.setItem("sib.vocab", vocabEl.value); } catch (e) {}
    rounds = generateRounds(words.length, cues.length);
    $("preview").innerHTML = rounds.map((r, i) => {
      const L = r.map((x) => words[x].hz);
      return `<div class="pr"><b>Runde ${i + 1}</b> <small>${cues[i].toFixed(2)} s</small>
        <div class="row">${L.slice(0, 4).join("")}<br>${L.slice(4).join("")}</div></div>`;
    }).join("");
    $("btnStart").disabled = false;
  }
  $("btnGenerate").addEventListener("click", generate);
  $("btnStart").addEventListener("click", start);

  function showAudioWarn() {
    const el = $("timingWarn");
    el.textContent = `Musik nicht gefunden: ${T.audioFile}`;
    el.classList.toggle("hidden", !audio.error);
  }
  audio.addEventListener("error", showAudioWarn);
  audio.addEventListener("loadedmetadata", showAudioWarn);
  updateInfo();

  // ---------------------------------------------------------------
  //  Challenge-Bildschirm
  // ---------------------------------------------------------------
  const grid = $("grid");
  const cells = NUMS.map((n) => {
    const c = document.createElement("div");
    c.className = "cell";
    c.innerHTML = `<span class="num">${n}</span><span class="hz"></span><span class="py"></span>`;
    grid.appendChild(c);
    return c;
  });
  const dots = $("prepDots");
  dots.innerHTML = "<i></i>".repeat(8);

  let shownRound = -1, shownMarker = -2, shownPhase = "", shownDots = -1;
  let running = false;

  function fillRound(k) {
    const r = rounds[k] || rounds[rounds.length - 1];
    r.forEach((wi, i) => {
      const w = words[wi];
      const hz = cells[i].children[1], py = cells[i].children[2];
      hz.textContent = w.hz;
      py.textContent = w.py;
      const len = [...w.hz].length;
      hz.style.fontSize = `min(19vh, ${36 / len}vh, ${20 / len}vw)`;
    });
    grid.classList.remove("fresh"); void grid.offsetWidth; grid.classList.add("fresh");
  }

  const PHASE_TEXT = { intro: "Gleich geht's los …", speak: "SAY IT!", gap: "SAY IT!", prep: "Nächste Runde – anschauen!", end: "" };

  function render() {
    if (!running) return;
    const t = audioTime();
    const s = stateAt(t);

    if (s.round !== shownRound) { fillRound(s.round); shownRound = s.round; }
    if (s.marker !== shownMarker) {
      cells.forEach((c, i) => c.classList.toggle("active", i === s.marker));
      shownMarker = s.marker;
    }
    if (s.phase !== shownPhase) {
      const pl = $("phaseLabel");
      pl.textContent = PHASE_TEXT[s.phase];
      pl.className = s.phase === "speak" || s.phase === "gap" ? "speak" : "";
      $("endOverlay").classList.toggle("hidden", s.phase !== "end");
      shownPhase = s.phase;
    }
    $("roundLabel").textContent = `Runde ${s.round + 1} / ${cues.length}`;

    // graue Countdown-Punkte bis zum nächsten ROUND_START (kein Wort-Marker!)
    let d = 0;
    if ((s.phase === "prep" || s.phase === "intro") && s.frac > 0) d = Math.min(8, Math.ceil(s.frac * 8));
    if (d !== shownDots) {
      [...dots.children].forEach((x, i) => x.classList.toggle("on", i < d));
      shownDots = d;
    }

    if (CALIBRATE) drawCalib(t, s);
    requestAnimationFrame(render);
  }

  function resetShown() { shownRound = -1; shownMarker = -2; shownPhase = ""; shownDots = -1; }

  function start() {
    if (!rounds.length) generate();
    if (!rounds.length) return;
    if (document.activeElement) document.activeElement.blur();
    $("setup").classList.remove("active");
    $("challenge").classList.add("active");
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    $("calib").classList.toggle("hidden", !CALIBRATE);
    running = true;
    resetShown();
    audio.currentTime = 0;
    audio.playbackRate = tempo;
    audio.play().catch(() => {});
    $("pauseOverlay").classList.add("hidden");
    $("endOverlay").classList.add("hidden");
    requestAnimationFrame(render);
  }

  function quit() {
    running = false;
    audio.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $("challenge").classList.remove("active");
    $("setup").classList.add("active");
  }

  function togglePause() {
    if (audio.paused) { audio.play().catch(() => {}); } else { audio.pause(); }
  }
  audio.addEventListener("pause", () => { if (running && !audio.ended) $("pauseOverlay").classList.remove("hidden"); });
  audio.addEventListener("play", () => $("pauseOverlay").classList.add("hidden"));
  audio.addEventListener("ended", () => { $("endOverlay").classList.remove("hidden"); });

  function restart() {
    $("endOverlay").classList.add("hidden");
    resetShown();
    audio.currentTime = 0;
    audio.playbackRate = tempo;
    audio.play().catch(() => {});
  }

  // ←/→: zum ROUND_PREVIEW der vorherigen/nächsten Runde springen
  function jumpRound(dir) {
    if (!cues.length) return;
    const s = stateAt(audioTime());
    const target = Math.max(0, Math.min(cues.length - 1, s.round + dir));
    const t = target === 0 ? 0 : cues[target - 1] + previewAt() + 0.01;
    $("endOverlay").classList.add("hidden");
    resetShown();
    audio.currentTime = Math.max(0, t);
  }

  document.addEventListener("keydown", (e) => {
    if (!running) return;
    if (CALIBRATE && calibKey(e)) return;
    switch (e.code) {
      case "Space": e.preventDefault(); togglePause(); break;
      case "KeyR": restart(); break;
      case "ArrowLeft": e.preventDefault(); jumpRound(-1); break;
      case "ArrowRight": e.preventDefault(); jumpRound(1); break;
      case "KeyQ": quit(); break;
    }
  });

  // ---------------------------------------------------------------
  //  Kalibriermodus: index.html?calibrate
  //  [ ] = ganze Timeline ∓10 ms (Shift ∓50 ms)
  //  S = lokal speichern, C = Wert für timing.js kopieren
  // ---------------------------------------------------------------
  function calibKey(e) {
    const step = e.shiftKey ? 0.05 : 0.01;
    switch (e.code) {
      case "BracketLeft": T.shift = (T.shift || 0) - step; rebuild(); return true;
      case "BracketRight": T.shift = (T.shift || 0) + step; rebuild(); return true;
      case "KeyS":
        try { localStorage.setItem("sib.timingOverride", JSON.stringify({ shift: T.shift || 0 })); } catch (err) {}
        return true;
      case "KeyC":
        if (navigator.clipboard) navigator.clipboard.writeText(`shift: ${(T.shift || 0).toFixed(3)},`).catch(() => {});
        return true;
    }
    return false;
  }
  function rebuild() { buildCues(); resetShown(); }
  function drawCalib(t, s) {
    $("calib").textContent =
      `KALIBRIERUNG   t = ${t.toFixed(3)} s   Tempo ${audio.playbackRate}×   Phase ${s.phase}   Runde ${s.round + 1}   Marker ${s.marker + 1}\n` +
      `shift ${(T.shift || 0).toFixed(3)} s   [ ] = Timeline ∓10ms (Shift 50ms)   S = lokal speichern   C = Wert kopieren`;
  }
})();
