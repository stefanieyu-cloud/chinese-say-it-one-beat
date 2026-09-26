# Chinese Say It On Beat

Statische Web-App (HTML/CSS/JS), läuft auf GitHub Pages. Kein Login, keine Datenbank.

## Ablauf im Unterricht
1. URL öffnen
2. 4 oder 8 Vokabeln eingeben (`累 | lèi`, auch `lei4` wird zu `lèi`)
3. **GENERATE CHALLENGE** → **START CHALLENGE**

Tasten: SPACE Pause/Weiter · R Restart · ESC Fullscreen verlassen · ← → Runde · Q zurück zur Eingabe

## Dateien
- `audio/say-it-on-beat.mp3` – die feste Musik (Master Clock)
- `timing.js` – feste Timeline: Startzeit von Wort ① jeder Runde, Marker-Abstand, Preview-Zeitpunkt
- `app.js` – der gesamte Zustand wird aus `audio.currentTime` berechnet

## Timeline (aus dem Referenzvideo)
- ROUND_START (Marker bei ①): 6.240 · 11.545 · 16.917 · 22.122 · 27.361 · 32.533 · 37.704 · 42.976 · 48.382 · 53.587 s
- Marker: ① +0.000 … ⑧ +2.100 s (Abstand 0,30 s), ⑧ bleibt 0,30 s gelb
- ROUND_PREVIEW: nächste Gruppe erscheint 2,43 s nach ROUND_START (Runde 1: 8,67 s)

## Tempo
0,75× · 0,85× · 1,00× · 1,15× · 1,25× über `audio.playbackRate`. Die Timeline wird nicht umgerechnet,
weil alle Zustände aus `audio.currentTime` kommen – Musik und Marker bleiben bei jedem Tempo synchron.

## Wortmuster
Zufällig gewählte Wortpaare, rhythmische Muster: `XXXX/YYYY`, `XXYY/YYXX`, später `XYXY/YXYX` u. ä.
Jedes eingegebene Wort kommt vor, bevor sich Paare wiederholen.

## Nachjustieren (nur falls nötig)
`index.html?calibrate` öffnen und starten: **[ ]** verschiebt die ganze Timeline um ∓10 ms (Shift: 50 ms),
**C** kopiert den Wert → als `shift` in `timing.js` eintragen.

## GitHub Pages
Ordnerinhalt in ein Repository hochladen → Settings → Pages → Branch `main`, Ordner `/root`.
