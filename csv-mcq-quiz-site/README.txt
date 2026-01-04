CSV Multiple-Choice Quiz (lokal, ohne Server)

Start:
1) Entpacke die ZIP in einen Ordner
2) Öffne index.html im Browser
3) Importiere eine CSV-Datei (oder füge CSV-Text ein) und starte das Quiz

Features:
- Quiz-Modus: Üben (sofort Feedback) oder Prüfung (Auswertung am Ende, Antworten änderbar)
- Markieren: Fragen markieren und im Ergebnis separat ansehen
- Suche vor Start: Fragen/Antworten filtern (Start wird deaktiviert bei 0 Treffern)
- Fortsetzen: laufendes Quiz wird lokal gespeichert (localStorage) und kann nach Reload fortgesetzt werden
- Export: falsche Antworten als CSV herunterladen

Tipps:
- Drag & Drop: Datei auf die Drop-Zone ziehen.
- CSV-Text: Wenn lokale Dateien blockiert werden, nutze „CSV‑Text einfügen“.
- Tastatur im Quiz: 1–4 / A–D wählen, Enter weiter, Pfeil links zurück, H Hinweis, Esc beenden.
- Design & Optionen: werden lokal im Browser gespeichert (localStorage).

CSV-Format:
- Trennzeichen: ; , oder Tab (wird automatisch erkannt)
- Spalten (empfohlen):
  - quiz (optional), question (Pflicht)
  - choice_A, choice_B, choice_C, choice_D (mind. A+B)
  - correct_letter (A-D) oder correct_index (0-basiert)
  - hint (optional)

Beispiel (Semikolon):
quiz;question;choice_A;choice_B;choice_C;choice_D;correct_letter;hint
Demo;Was ist 2+2?;3;4;5;;B;Grundrechenart

Beispiel (Komma):
quiz,question,choice_A,choice_B,choice_C,choice_D,correct_letter,hint
Demo,"Welche Farbe hat der Himmel?","Grün","Blau","Rot",,B,

Hinweis:
In seltenen Fällen blockiert der Browser lokale File-Features. Dann nutze einen lokalen Webserver:
  python -m http.server 8000
und öffne: http://localhost:8000
