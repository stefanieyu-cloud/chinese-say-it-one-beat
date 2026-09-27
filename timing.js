// ============================================================
//  FESTE TIMELINE DER APP – gehört zur MP3 und wird nicht mehr geändert.
//  Alle Zeiten in Sekunden, gemessen in der MP3 (audio.currentTime).
//  Quelle: frameweise Analyse des Referenzvideos.
// ============================================================
window.BEAT_TIMING = {
  audioFile: "audio/say-it-on-beat.mp3",

  // ROUND_START: Zeitpunkt, an dem der gelbe Marker bei Wort ① beginnt
  roundStarts: [
     6.240,
    11.545,
    16.917,
    22.122,
    27.361,
    32.533,
    37.704,
    42.976,
    48.382,
    53.587
  ],

  // Abstand des Markers von Wort zu Wort (① +0.000 … ⑧ +2.100)
  markerStep: 0.300,

  // Explizite Marker-Zeitpunkte ①–⑧ für einzelne Runden (Index 0 = Runde 1).
  // Runde 1 und 2: die Musik liegt dort 0,129 s bzw. 0,075 s später als in
  // Runde 4/5 (per Kreuzkorrelation aus der MP3 gemessen). Die Cues liegen
  // deshalb auf denselben hörbaren Einsätzen wie in Runde 4/5.
  // Ab Runde 3 gilt unverändert: roundStart + markerStep × (0 … 7).
  markerCues: {
    0: [6.369, 6.669, 6.969, 7.269, 7.569, 7.869, 8.169, 8.469],
    1: [11.620, 11.920, 12.220, 12.520, 12.820, 13.120, 13.420, 13.720]
  },

  // Wie lange Wort ⑧ gelb bleibt (danach verschwindet der Marker)
  lastWordHold: 0.300,

  // ROUND_PREVIEW: so viele Sekunden nach ROUND_START erscheint die
  // nächste 8er-Gruppe (Runde 1: 6.240 + 2.430 = 8.670 s)
  previewAfter: 2.430,

  // Verschiebt die gesamte Timeline (Sekunden). Positiv = alles später.
  shift: 0,

  // Tempo-Auswahl (audio.playbackRate). Die Timeline wird NICHT umgerechnet.
  tempos: [0.75, 0.85, 1.00, 1.15, 1.25],
  defaultTempo: 1.00
};
