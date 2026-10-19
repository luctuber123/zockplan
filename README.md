# Zockplan

Gemeinsamer Zock-Kalender für zwei: Zeiten eintragen, Tage grün/orange/rot markieren,
+1 geben, Spiele abstimmen, Termine fest ausmachen, Serien (z. B. „jeden Montag Tanzen“),
Kommentare und Berliner Feiertage.

## Aufbau
- **index.html, app.css, app.js** – die App (Oberfläche und Logik)
- **shim.js** – Verbindung zu Firebase (Google-Login + Firestore-Datenbank)
- **config.js** – Firebase-Werte und die erlaubten Google-Konten
- **firestore.rules** – Sicherheitsregeln (in der Firebase-Konsole unter Firestore → Regeln einfügen)
- **manifest.webmanifest, sw.js, pwa.js, icons/** – App-Installation aufs Handy und Offline-Zwischenspeicher

## Veröffentlichen
GitHub Pages: Settings → Pages → Branch `main`, Ordner `/ (root)`.
Danach in Firebase unter Authentication → Einstellungen → Autorisierte Domains
`luctuber123.github.io` eintragen.

## Daten
Eure Einträge liegen nicht in diesem Repository, sondern geschützt in Firestore.
Nur die in `config.js` und `firestore.rules` eingetragenen Konten haben Zugriff.
