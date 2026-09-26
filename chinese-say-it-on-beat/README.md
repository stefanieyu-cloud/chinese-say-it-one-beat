# Chinese Say It On Beat

Statische Web-App (HTML/CSS/JS), läuft auf GitHub Pages. Kein Login, keine Datenbank.

## Ablauf im Unterricht
1. URL öffnen
2. 4 oder 8 Vokabeln eingeben (`累 | lèi`, auch `lei4` wird zu `lèi`)
3. **GENERATE CHALLENGE** → **START CHALLENGE**

Tasten: SPACE Pause/Weiter · R Restart · ESC Fullscreen verlassen · ← → Runde · Q zurück zur Eingabe

## Dateien
- `audio/say-it-on-beat.mp3` – die feste Musik (Master Clock)
- `timing.js` – festes Timing (Beat-Raster + Einsatz). Wird einmal eingestellt.
- `app.js` – der gesamte Zustand wird aus `audio.currentTime` berechnet.

## Timing (fest eingemessen)
`timing.js` enthält alle 100 Beat-Zeitpunkte der MP3 (91,5 BPM). Wort ① von Runde 1 = Beat 11 (8,825 s).
Ablauf: Intro → 6 Runden à 8 Beats Sprechen + 8 Beats Vorbereitung → Ende bei 66,6 s.

Nachjustieren (nur falls nötig): `index.html?calibrate` öffnen und starten.
- **[ ]** ganzes Raster ∓10 ms (Shift: 50 ms)
- **, .** Einsatz einen Beat früher/später
- **C** kopiert die Werte → in `timing.js` eintragen

## GitHub Pages
Ordnerinhalt in ein Repository hochladen → Settings → Pages → Branch `main`, Ordner `/root`.
