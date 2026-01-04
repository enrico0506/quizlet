CSV Multiple-Choice Quiz (lokal, ohne Server)

1) Entpacke die ZIP in einen Ordner
2) Öffne index.html im Browser
3) Importiere eine CSV-Datei (oder füge CSV-Text ein) und starte das Quiz

CSV-Spalten (empfohlen):
- quiz (optional), question (Pflicht)
- choice_A, choice_B, choice_C, choice_D (mind. A+B)
- correct_letter (A-D) oder correct_index (0-basiert)
- hint (optional)

Tipps:
- Drag & Drop: Datei auf die Drop-Zone ziehen.
- CSV-Text: Wenn lokale Dateien blockiert werden, nutze „CSV‑Text einfügen“.
- Tastatur im Quiz: 1–4 / A–D wählen, Enter weiter, Pfeil links zurück, H Hinweis, Esc beenden.
- Design & Optionen: werden lokal im Browser gespeichert (localStorage).

Hinweis:
In seltenen Fällen blockiert der Browser lokale File-Features. Dann nutze einen lokalen Webserver:
  python -m http.server 8000
und öffne: http://localhost:8000
