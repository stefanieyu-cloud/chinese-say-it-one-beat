(() => {
  "use strict";

  // ---------------------------------------------------------------
  //  Timing (aus timing.js, im Kalibriermodus lokal überschreibbar)
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

  const LETTERS = "ABCDEFGH";
  const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

  let words = [];   // [{hz, py}]
  let rounds = [];  // [[idx x8], ...]
  let cues = [];    // [{s, start}] – Beat-Index und Zeit des Wortes ① jeder Runde

  // ---------------------------------------------------------------
  //  Beat-Raster: Zeit des Beats Nr. i (fest in timing.js gespeichert)
  // ---------------------------------------------------------------
  function beatTime(i) {
    const B = T.beatTimes, sh = T.shift || 0;
    if (Array.isArray(B) && B.length > 8) {
      if (i < 0) return B[0] + i * (B[8] - B[0]) / 8 + sh;
      if (i < B.length) return B[i] + sh;
      const n = B.length, p = (B[n - 1] - B[n - 9]) / 8;
      return B[n - 1] + (i - n + 1) * p + sh;
    }
    return T.firstBeat + (i - T.firstSpeakBeat) * 60 / T.bpm + sh;
  }

  // Cue-Liste: welche Beats sind Wort ① einer Sprechphase?
  function buildCues() {
    cues = [];
    const dur = isFinite(audio.duration) ? audio.duration : Infinity;
    const cycle = T.speakBeats + T.prepBeats;
    for (let k = 0; k < 500; k++) {
      const s = T.firstSpeakBeat + k * cycle;
      // Runde nur, wenn der 8. Beat noch vollständig in der Musik liegt
      if (beatTime(s + T.speakBeats - 1) + 0.3 > dur) break;
      if (dur === Infinity && k >= 40) break;
      cues.push({ s, start: beatTime(s) });
    }
    if (T.maxRounds) cues = cues.slice(0, T.maxRounds);
  }

  // wie viele der Beats s .. s+n-1 haben zum Zeitpunkt t schon begonnen?
  function beatsDone(s, n, t) {
    let c = 0;
    while (c < n && beatTime(s + c) <= t) c++;
    return c;
  }

  // ---------------------------------------------------------------
  //  Zustand zu Zeitpunkt t – rein aus audio.currentTime berechnet
  // ---------------------------------------------------------------
  function stateAt(t) {
    if (!cues.length) return { round: 0, marker: -1, phase: "intro", prepDone: 0 };
    let k = -1;
    for (let i = 0; i < cues.length; i++) { if (cues[i].start <= t) k = i; else break; }

    if (k === -1) {
      // Intro: Runde 1 ist schon sichtbar, kein Marker
      return { round: 0, marker: -1, phase: "intro", prepDone: beatsDone(cues[0].s - T.prepBeats, T.prepBeats, t) };
    }
    const c = cues[k];
    const done = beatsDone(c.s, T.speakBeats + 1, t);
    if (done <= T.speakBeats) {
      return { round: k, marker: done - 1, phase: "speak" };
    }
    if (k + 1 < cues.length) {
      // Vorbereitung: nächste Runde sofort sichtbar, kein Marker
      return { round: k + 1, marker: -1, phase: "prep", prepDone: beatsDone(c.s + T.speakBeats, T.prepBeats, t) };
    }
    return { round: k, marker: -1, phase: "end" };
  }

  // Glatte Zeit: audio.currentTime + Interpolation zwischen seinen Updates
  let lastCT = 0, lastStamp = 0;
  function audioTime() {
    const ct = audio.currentTime, now = performance.now();
    if (audio.paused || ct !== lastCT) { lastCT = ct; lastStamp = now; return ct; }
    return ct + Math.min((now - lastStamp) / 1000, 0.08) * audio.playbackRate;
  }

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
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let hz, py;
      const sep = l.match(/\s*[|\t;｜]\s*/);
      if (sep) { hz = l.slice(0, sep.index); py = l.slice(sep.index + sep[0].length); }
      else { const p = l.split(/\s+/); hz = p.shift(); py = p.join(" "); }
      return { hz: hz.trim(), py: fixPinyin(py.trim()) };
    });
  }

  // ---------------------------------------------------------------
  //  Runden erzeugen: erst feste Übungen, dann echte Zufallsrunden
  // ---------------------------------------------------------------
  function generateRounds(n, total) {
    const out = [];
    const fill = (arr) => Array.from({ length: 8 }, (_, i) => arr[i % arr.length]);
    // Paare A/B, C/D, (E/F, G/H bei 8 Wörtern nur als gemischte Runde)
    const pairs = n >= 8 ? [[0, 1], [2, 3]] : [];
    if (n < 8) for (let i = 0; i + 1 < n; i += 2) pairs.push([i, i + 1]);
    for (const [x, y] of pairs) {
      out.push([x, x, x, x, y, y, y, y]);
      out.push([x, x, y, y, y, y, x, x]);
    }
    if (n >= 8) out.push([4, 4, 5, 5, 6, 6, 7, 7]);
    if (n === 1) out.push(fill([0]));
    out.push(fill([...Array(n).keys()]));  // A B C D (E F G H)
    while (out.length < total) {
      out.push(Array.from({ length: 8 }, () => Math.floor(Math.random() * n)));
    }
    return out.slice(0, total);
  }

  // ---------------------------------------------------------------
  //  Teacher-UI
  // ---------------------------------------------------------------
  const vocabEl = $("vocab");
  try { vocabEl.value = localStorage.getItem("sib.vocab") || "累 | lèi\n忙 | máng\n饿 | è\n渴 | kě"; }
  catch (e) { vocabEl.value = "累 | lèi\n忙 | máng\n饿 | è\n渴 | kě"; }

  function updateInfo() {
    const w = parseVocab(vocabEl.value);
    const info = $("vocabInfo");
    if (w.length < 1 || w.length > 8) {
      info.textContent = `${w.length} Wörter – bitte 1 bis 8 (empfohlen: 4 oder 8).`;
      info.className = "info bad";
    } else {
      info.textContent = w.map((x, i) => `${LETTERS[i]} = ${x.hz} ${x.py}`).join("   ");
      info.className = "info";
    }
    return w;
  }
  vocabEl.addEventListener("input", () => { updateInfo(); $("btnStart").disabled = true; $("preview").innerHTML = ""; });

  function generate() {
    const w = updateInfo();
    if (w.length < 1 || w.length > 8) return;
    words = w;
    try { localStorage.setItem("sib.vocab", vocabEl.value); } catch (e) {}
    buildCues();
    rounds = generateRounds(words.length, Math.max(cues.length, 1));
    $("preview").innerHTML = rounds.map((r, i) => {
      const L = r.map((x) => LETTERS[x]);
      return `<div class="pr"><b>Runde ${i + 1}</b> <small>${cues[i] ? cues[i].start.toFixed(2) + " s" : ""}</small>
        <div class="row">${L.slice(0, 4).join(" ")}<br>${L.slice(4).join(" ")}</div></div>`;
    }).join("");
    $("btnStart").disabled = false;
  }
  $("btnGenerate").addEventListener("click", generate);
  $("btnStart").addEventListener("click", start);

  function showTimingWarn() {
    const el = $("timingWarn");
    if (audio.error) {
      el.textContent = `Musik nicht gefunden: ${T.audioFile} – bitte die MP3 dort ablegen.`;
      el.classList.remove("hidden");
    } else if (!T.calibrated && !CALIBRATE) {
      el.textContent = "Hinweis: Timing ist noch ein Platzhalter (timing.js → calibrated: false).";
      el.classList.remove("hidden");
    } else el.classList.add("hidden");
  }
  audio.addEventListener("loadedmetadata", () => { buildCues(); if (words.length) generate(); showTimingWarn(); });
  audio.addEventListener("error", showTimingWarn);
  updateInfo();
  showTimingWarn();

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

  function render() {
    if (!running) return;
    const t = audioTime() - (T.visualOffset || 0);
    const s = stateAt(t);

    if (s.round !== shownRound) { fillRound(s.round); shownRound = s.round; }
    if (s.marker !== shownMarker) {
      cells.forEach((c, i) => c.classList.toggle("active", i === s.marker));
      shownMarker = s.marker;
    }
    if (s.phase !== shownPhase) {
      const pl = $("phaseLabel");
      pl.textContent = { intro: "Gleich geht's los …", speak: "SAY IT!", prep: "Nächste Runde – anschauen!", end: "" }[s.phase];
      pl.className = s.phase === "speak" ? "speak" : "";
      $("endOverlay").classList.toggle("hidden", s.phase !== "end");
      shownPhase = s.phase;
    }
    $("roundLabel").textContent = `Runde ${Math.min(s.round + 1, cues.length)} / ${cues.length}`;

    // graue Vorbereitungs-Punkte (kein Wort-Marker!)
    const d = s.prepDone || 0;
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
    audio.play().catch(() => {});
    $("pauseOverlay").classList.add("hidden");
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
    audio.play().catch(() => {});
  }

  // ←/→: zur Vorbereitungsphase der vorherigen/nächsten Runde springen
  function jumpRound(dir) {
    if (!cues.length) return;
    const s = stateAt(audioTime());
    const target = Math.max(0, Math.min(cues.length - 1, s.round + dir));
    const t = target === 0 ? 0 : beatTime(cues[target - 1].s + T.speakBeats);
    $("endOverlay").classList.add("hidden");
    resetShown();
    audio.currentTime = Math.max(0, t + 0.01);
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
  //  [ ] = ganzes Raster ∓10 ms (Shift ∓50 ms)
  //  , . = Einsatz (Wort ①) einen Beat früher/später
  //  S = lokal speichern, C = Werte für timing.js kopieren
  // ---------------------------------------------------------------
  function calibKey(e) {
    const step = e.shiftKey ? 0.05 : 0.01;
    switch (e.code) {
      case "BracketLeft": T.shift = (T.shift || 0) - step; rebuild(); return true;
      case "BracketRight": T.shift = (T.shift || 0) + step; rebuild(); return true;
      case "Comma": T.firstSpeakBeat = Math.max(0, T.firstSpeakBeat - 1); rebuild(); return true;
      case "Period": T.firstSpeakBeat += 1; rebuild(); return true;
      case "KeyS":
        try { localStorage.setItem("sib.timingOverride", JSON.stringify({ shift: T.shift || 0, firstSpeakBeat: T.firstSpeakBeat })); } catch (err) {}
        return true;
      case "KeyC":
        if (navigator.clipboard) navigator.clipboard.writeText(`firstSpeakBeat: ${T.firstSpeakBeat},
shift: ${(T.shift || 0).toFixed(3)},`).catch(() => {});
        return true;
    }
    return false;
  }
  function rebuild() { buildCues(); resetShown(); }
  function drawCalib(t, s) {
    let bi = 0;
    while (beatTime(bi + 1) <= t) bi++;
    $("calib").textContent =
      `KALIBRIERUNG   t = ${t.toFixed(3)} s   Beat-Nr. ${bi}   Phase ${s.phase}   Marker ${s.marker + 1}   Runden ${cues.length}
` +
      `firstSpeakBeat ${T.firstSpeakBeat} (= ${beatTime(T.firstSpeakBeat).toFixed(3)} s)   shift ${(T.shift || 0).toFixed(3)} s
` +
      `[ ] = Raster ∓10ms (Shift 50ms)   , . = Einsatz ∓1 Beat   S = lokal speichern   C = Werte kopieren`;
  }
})();
