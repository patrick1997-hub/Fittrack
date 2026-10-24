# FitTrack

Persönliche Fitness-App fürs iPhone als Web-App (PWA): Training mit Gewichten pro Satz und Ernährung mit Kalorienziel.

## Funktionen

- **Training:** beliebig viele Pläne (Start: Training A/B/C), eigene Übungen, Gewicht und Wiederholungen pro Satz, „Vorher“-Werte vom letzten Mal, Pausentimer
- **Fortschritt:** Körpergewicht, schwerster Satz und geschätztes 1RM pro Übung als Diagramm
- **Ernährung:** Tagesziel aus Körperdaten, offene Kalorien und Makros pro Tag, Mahlzeiten
  - Barcode-Scan → Nährwerte von Open Food Facts (kostenlos)
  - Foto oder Beschreibung → Schätzung durch die Claude-API (eigener API-Schlüssel, Abrechnung über das API-Guthaben)
  - Suche, zuletzt verwendet, manuelle Eingabe
- **Daten:** bleiben nur auf dem Gerät (IndexedDB); Sicherung als JSON über das Teilen-Menü

## Lokal starten

```bash
python3 -m http.server 8765 --directory fitness-app
```

Dann http://localhost:8765 öffnen. Die Kamera funktioniert nur über HTTPS, also erst nach dem Hosting.

## Aufs iPhone

1. Den Ordner auf einem HTTPS-Host veröffentlichen (z. B. GitHub Pages oder Netlify).
2. Die Adresse in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
3. In der App unter **Profil** die Körperdaten eintragen und den API-Schlüssel hinterlegen.

## Hinweise

- Die Online-Textsuche von Open Food Facts ist zeitweise nicht erreichbar. Barcode, KI-Schätzung und die lokal gemerkten Lebensmittel funktionieren trotzdem.
- Nach einem Update `CACHE` in `sw.js` hochzählen, damit das iPhone die neue Version lädt.
