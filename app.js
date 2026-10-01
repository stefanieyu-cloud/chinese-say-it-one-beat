(() => {
  "use strict";
  // Versionskennung (Browser-Konsole: F12) – zeigt, ob die aktuelle Datei geladen ist
  const APP_VERSION = "2026-10-02-pinyin-0927";
  console.info("Chinese Say It On Beat – app.js " + APP_VERSION);

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
  let cues = [];    // pro Runde: { start, marks[8], off, preview }

  // ---------------------------------------------------------------
  //  Timeline pro Runde (alle Zeiten absolut in der MP3):
  //  start   = ROUND_START (Marker bei ①)
  //  marks   = Zeitpunkte ①–⑧ (explizite Cues aus timing.js oder start + step·i)
  //  off     = Marker verschwindet (spätestens beim Preview)
  //  preview = ROUND_PREVIEW der nächsten Runde
  // ---------------------------------------------------------------
  function buildCues() {
    const sh = T.shift || 0, mc = T.markerCues || {};
    cues = T.roundStarts.map((start, k) => {
      const marks = Array.isArray(mc[k]) && mc[k].length === 8
        ? mc[k].map((x) => x + sh)
        : Array.from({ length: 8 }, (_, i) => start + sh + i * T.markerStep);
      const preview = start + sh + T.previewAfter;
      return { start: marks[0], marks, preview, off: Math.min(marks[7] + T.lastWordHold, preview) };
    });
  }
  buildCues();

  // ---------------------------------------------------------------
  //  Zustand zu Zeitpunkt t – rein aus audio.currentTime berechnet.
  //  Keine Umrechnung mit dem Tempo: playbackRate verändert nur, wie
  //  schnell audio.currentTime läuft – die Timeline bleibt gleich.
  // ---------------------------------------------------------------
  function stateAt(t) {
    if (!cues.length) return { round: 0, marker: -1, phase: "intro", frac: 0 };
    let k = -1;
    for (let i = 0; i < cues.length; i++) { if (cues[i].start <= t) k = i; else break; }

    if (k === -1) {
      // Intro: Runde 1 ist schon sichtbar, kein Marker
      const lead = cues.length > 1 ? cues[1].start - cues[0].preview : 2.8;
      const frac = 1 - (cues[0].start - t) / lead;
      return { round: 0, marker: -1, phase: "intro", frac };
    }
    const c = cues[k];
    if (t < c.off) {
      // ROUND_START … Wort ⑧: gelber Marker läuft
      let m = 0;
      while (m < 7 && c.marks[m + 1] <= t) m++;
      return { round: k, marker: m, phase: "speak" };
    }
    if (k + 1 >= cues.length) return { round: k, marker: -1, phase: "end" };
    if (t < c.preview) {
      // kurze Lücke zwischen Ende von ⑧ und ROUND_PREVIEW
      return { round: k, marker: -1, phase: "gap" };
    }
    // ROUND_PREVIEW: nächste Runde sichtbar, kein Marker, bis zum nächsten ROUND_START
    return { round: k + 1, marker: -1, phase: "prep", frac: (t - c.preview) / (cues[k + 1].start - c.preview) };
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
  // Eine Silbe (Buchstaben ohne Zahl) + Tonzahl → Silbe mit Tonzeichen.
  // Ton 1–4 = Tonzeichen, Ton 5 / 0 = neutraler Ton (ohne Zeichen).
  function numToTone(letters, tone) {
    const s = letters.replace(/u:|v/g, "ü").replace(/U:|V/g, "Ü");
    if (tone < 1 || tone > 4) return s;
    // Regeln: a oder e bekommt das Zeichen; bei „ou“ das o; sonst der letzte Vokal
    const low = s.toLowerCase();
    let pos = low.search(/[ae]/);
    if (pos < 0) pos = low.indexOf("ou");
    if (pos < 0) { for (let i = low.length - 1; i >= 0; i--) if ("iouü".includes(low[i])) { pos = i; break; } }
    if (pos < 0) return s;
    const marked = TONES[low[pos]][tone - 1];
    return s.slice(0, pos) + (s[pos] === low[pos] ? marked : marked.toUpperCase()) + s.slice(pos + 1);
  }
  // Jede Silbe mit Tonzahl einzeln umwandeln – mit oder ohne Leerzeichen:
  // „huo3che1zhan4“ → „huǒchēzhàn“, „fu4 jin4“ → „fù jìn“.
  // Pinyin, das schon Tonzeichen hat (ohne Zahl), bleibt unverändert.
  function fixPinyin(py) {
    return py.replace(/([a-zü]+(?::[a-zü]*)?)([0-5])/gi, (_, letters, tone) => numToTone(letters, +tone));
  }

  // ---------------------------------------------------------------
  //  Großschreibung von Eigennamen (Orte, Länder, Sprachen).
  //  Nur bei sicher erkannten Ausdrücken – sonst bleibt die Schreibung
  //  des Benutzers erhalten (es wird nie geraten oder kleingeschrieben).
  // ---------------------------------------------------------------
  const PROPER = new Set((
    // Länder, Kontinente, Regionen
    "中国 美国 英国 法国 德国 日本 韩国 朝鲜 奥地利 瑞士 意大利 西班牙 葡萄牙 俄罗斯 加拿大 澳大利亚 新西兰 " +
    "印度 泰国 越南 新加坡 马来西亚 印度尼西亚 菲律宾 蒙古 巴西 墨西哥 阿根廷 埃及 南非 荷兰 比利时 瑞典 " +
    "挪威 丹麦 芬兰 波兰 捷克 匈牙利 希腊 土耳其 爱尔兰 欧洲 亚洲 非洲 美洲 台湾 香港 澳门 " +
    // Städte
    "北京 上海 天津 重庆 广州 深圳 南京 杭州 西安 成都 武汉 苏州 青岛 大连 厦门 昆明 哈尔滨 沈阳 拉萨 " +
    "桂林 长沙 郑州 济南 福州 合肥 乌鲁木齐 维也纳 柏林 巴黎 伦敦 纽约 东京 首尔 罗马 莫斯科 萨尔茨堡 " +
    "格拉茨 林茨 因斯布鲁克 圣珀尔滕 " +
    // Provinzen
    "广东 四川 山东 江苏 浙江 河北 河南 湖北 湖南 云南 贵州 福建 安徽 江西 山西 陕西 甘肃 青海 海南 " +
    "辽宁 吉林 黑龙江 西藏 新疆 内蒙古 广西 宁夏 " +
    // Sehenswürdigkeiten, Flüsse, Sprachen
    "长城 长江 黄河 天安门 故宫 中文 汉语 普通话 英语 英文 德语 德文 法语 法文 日语 日文 韩语 西班牙语"
  ).split(" "));
  // Zusammensetzungen aus Eigenname + Endung: 北京人 Běijīngrén, 中国菜 Zhōngguócài
  const PROPER_SUFFIX = ["人", "菜", "话", "大学", "市", "省"];
  function isProper(hz) {
    hz = hz.trim();
    if (PROPER.has(hz)) return true;
    return PROPER_SUFFIX.some((s) => hz.endsWith(s) && PROPER.has(hz.slice(0, -s.length)));
  }
  function properCase(hz, py) {
    if (!isProper(hz)) return py;
    const i = py.search(/\S/);
    return i < 0 ? py : py.slice(0, i) + py[i].toUpperCase() + py.slice(i + 1);
  }

  function parseVocab(text) {
    const seen = new Set();
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let hz, py;
      const sep = l.match(/\s*[|\t;｜]\s*/);
      if (sep) { hz = l.slice(0, sep.index); py = l.slice(sep.index + sep[0].length); }
      else { const p = l.split(/\s+/); hz = p.shift(); py = p.join(" "); }
      return { hz: hz.trim(), py: properCase(hz, fixPinyin(py.trim())) };
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
  //  first = Wörter, die bevorzugt zuerst drankommen (noch nicht verwendet)
  function makePairs(n, avoid, first) {
    let pairs = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const pre = first ? shuffle([...first]) : [];
      const idx = pre.concat(shuffle([...Array(n).keys()].filter((i) => !pre.includes(i))));
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

  function generateRounds(n, total, fresh) {
    const out = [];
    let cycle = 0, last = null;
    while (out.length < total) {
      for (const [x, y] of makePairs(n, last, cycle === 0 ? fresh : null)) {
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
  const DEFAULT_VOCAB = "一 | yī\n二 | èr\n三 | sān\n四 | sì";
  const OLD_DEFAULT = "累 | lèi\n忙 | máng\n饿 | è\n渴 | kě";   // früheres Beispiel
  try {
    const saved = localStorage.getItem("sib.vocab");
    vocabEl.value = saved && saved.trim() !== OLD_DEFAULT ? saved : DEFAULT_VOCAB;
  } catch (e) { vocabEl.value = DEFAULT_VOCAB; }

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

    // Wörter, die in früheren Challenges schon dran waren, kommen zuletzt
    let used = new Set();
    try { used = new Set(JSON.parse(localStorage.getItem("sib.usedWords") || "[]")); } catch (e) {}
    const fresh = words.map((x, i) => i).filter((i) => !used.has(words[i].hz));
    rounds = generateRounds(words.length, cues.length, fresh.length < words.length ? fresh : null);

    // merken; sind alle Wörter des Pools einmal dran gewesen, beginnt es von vorn
    rounds.flat().forEach((i) => used.add(words[i].hz));
    const allUsed = words.every((x) => used.has(x.hz));
    const inChallenge = new Set(rounds.flat()).size;
    try { localStorage.setItem("sib.usedWords", JSON.stringify(allUsed ? [] : words.map((x) => x.hz).filter((h) => used.has(h)))); } catch (e) {}
    const open = allUsed ? 0 : words.filter((x) => !used.has(x.hz)).length;
    $("vocabInfo").textContent += `   —   in dieser Challenge: ${inChallenge} Wörter` +
      (open ? ` · noch nicht dran gewesen: ${open} (kommen beim nächsten Generate zuerst)` : "");
    $("preview").innerHTML = rounds.map((r, i) => {
      const L = r.map((x) => words[x].hz);
      return `<div class="pr"><b>Runde ${i + 1}</b> <small>${cues[i].start.toFixed(2)} s</small>
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
      py.style.fontSize = `min(5.5vh, ${Math.min(4.5, 34 / Math.max(1, w.py.length))}vw)`;
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
    enterFullscreen();
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
    leaveFullscreen();
    $("challenge").classList.remove("active");
    $("setup").classList.add("active");
  }

  // Fullscreen nur, wenn das Gerät es kann – nie mit Fehler (z. B. iPhone)
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = req.call(el);
      if (p && p.then) {
        p.then(() => {
          // auf Handys nach Möglichkeit ins Querformat drehen
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {}
  }
  function leaveFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit || !(document.fullscreenElement || document.webkitFullscreenElement)) return;
    try {
      const p = exit.call(document);
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
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
    const t = target === 0 ? 0 : cues[target - 1].preview + 0.01;
    $("endOverlay").classList.add("hidden");
    resetShown();
    audio.currentTime = Math.max(0, t);
  }

  // Touch/Maus: Spielfeld antippen = Pause-Menü, Buttons in den Overlays
  grid.addEventListener("click", () => { if (running) togglePause(); });
  $("pauseOverlay").addEventListener("click", (e) => {
    if (!e.target.closest("button")) audio.play().catch(() => {});
  });
  document.querySelectorAll(".ov-btns").forEach((box) => box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !running) return;
    e.stopPropagation();
    b.blur();   // damit SPACE weiter Pause/Weiter bleibt
    switch (b.dataset.act) {
      case "play": audio.play().catch(() => {}); break;
      case "restart": restart(); break;
      case "prev": jumpRound(-1); break;
      case "next": jumpRound(1); break;
      case "quit": quit(); break;
    }
  }));

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
