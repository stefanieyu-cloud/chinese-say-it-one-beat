// ============================================================
//  FESTES TIMING DER APP – einmal eingemessen, gehört zur MP3.
//  Alle Zeiten in Sekunden, gemessen in der MP3 (audio.currentTime).
// ============================================================
window.BEAT_TIMING = {
  audioFile: "audio/say-it-on-beat.mp3",

  // Beat-Raster, aus der MP3 gemessen (91,53 BPM, 8-Beat-Loop).
  // Bei Beat 92 (~62,0 s) verschiebt sich die Musik um ca. 0,09 s –
  // deshalb wird jeder Beat einzeln gespeichert statt nur ein Tempo.
  beatTimes: [
     1.614,  2.270,  2.925,  3.581,  4.236,  4.892,  5.547,  6.203,  6.858,  7.514,
     8.169,  8.825,  9.480, 10.136, 10.791, 11.447, 12.102, 12.758, 13.413, 14.069,
    14.724, 15.380, 16.035, 16.691, 17.346, 18.002, 18.657, 19.313, 19.968, 20.624,
    21.279, 21.935, 22.590, 23.246, 23.901, 24.557, 25.212, 25.868, 26.523, 27.179,
    27.834, 28.490, 29.145, 29.801, 30.456, 31.112, 31.767, 32.423, 33.078, 33.734,
    34.389, 35.045, 35.700, 36.356, 37.011, 37.667, 38.322, 38.978, 39.633, 40.289,
    40.944, 41.600, 42.255, 42.911, 43.566, 44.222, 44.877, 45.533, 46.188, 46.844,
    47.499, 48.155, 48.811, 49.466, 50.122, 50.777, 51.433, 52.088, 52.744, 53.399,
    54.055, 54.710, 55.366, 56.021, 56.677, 57.332, 57.988, 58.643, 59.299, 59.954,
    60.610, 61.265, 62.030, 62.686, 63.342, 63.998, 64.654, 65.310, 65.966, 66.622
  ],

  // Index (in beatTimes, ab 0 gezählt) des ERSTEN gesprochenen Beats = Wort ① Runde 1.
  // 11 → 8,825 s: Auftakt + ein ganzer 8-Beat-Loop Intro, dann Einsatz.
  firstSpeakBeat: 11,

  speakBeats: 8,   // Beats pro Sprechphase (① … ⑧)
  prepBeats: 8,    // Beats Pause/Vorbereitung zwischen zwei Runden

  // Verschiebt das ganze Raster (Sekunden). Positiv = Marker später.
  shift: 0,

  // null = so viele Runden, wie die Musik hergibt
  maxRounds: null,

  // Nur falls beatTimes fehlt: Ersatz-Raster aus Tempo
  bpm: 91.533,
  firstBeat: 8.825,

  calibrated: true
};
