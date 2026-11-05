# Notenrechner

Der IHK-Notenschlüssel, umgerechnet auf jede Höchstpunktzahl:
<https://mamrehn.github.io/notenrechner/>

- Notengrenzen in **halben oder ganzen Punkten**
- Note, Anteil und IHK-Dezimalnote zu einer erreichten Punktzahl
- Tabelle mit der Note für jede mögliche Punktzahl
- Klasse auswerten: Liste einfügen, Notenspiegel, Durchschnitt, Ergebnisliste für Excel
- Zusatzpunkte (Bonusaufgaben)
- Teilbare Links, Druckansicht, dunkles Design, funktioniert offline

## Grundlage

§ 24 „Bewertungsschlüssel“ der *Musterprüfungsordnung für die Durchführung von
Abschluss- und Umschulungsprüfungen* (Richtlinie des Hauptausschusses des BIBB
vom 07.10.2025, BAnz AT 07.11.2025 S3,
[PDF](https://www.bibb.de/dokumente/pdf/HA120.pdf)):

| Note | IHK-Punkte |
|---|---|
| 1 sehr gut | 100–92 |
| 2 gut | 91–81 |
| 3 befriedigend | 80–67 |
| 4 ausreichend | 66–50 |
| 5 mangelhaft | 49–30 |
| 6 ungenügend | 29–0 |

Die Dezimalnoten (100 → 1,0, 92 → 1,4, 50 → 4,4 …) stammen aus derselben Tabelle.

## Rechenweg

Die Prüfungsordnung legt den Schlüssel auf ganze Punkte von 100 fest und regelt
keine andere Höchstpunktzahl. Der Rechner verwendet deshalb diese Regel:

1. Note *n* gibt es ab demselben Anteil wie im 100-Punkte-Schlüssel (92 %, 81 %,
   67 %, 50 %, 30 %).
2. Jede Grenze wird auf den nächsten halben bzw. ganzen Punkt **aufgerundet**.
   Bei 13 Punkten: 92 % × 13 = 11,96, also „sehr gut“ ab 12 Punkten.
   Niemand bekommt eine Note, deren Anteil nicht erreicht ist.
3. Zusatzpunkte verschieben keine Grenze. Sie verlängern nur „sehr gut“ nach oben.
4. Für die Dezimalnote wird der Anteil auf ganze IHK-Punkte abgerundet, passend
   zu Regel 2.

Bei 100 Punkten ergibt das genau die Tabelle oben.

## Links mit Werten

| Parameter | Bedeutung |
|---|---|
| `max` | Höchstpunktzahl (Standard 100) |
| `p` | erreichte Punkte (markiert die Zeile, zeigt die Note) |
| `step` | `1` für ganze Punkte (Standard: halbe Punkte) |
| `bonus` | Zusatzpunkte |

Beispiel: `?max=13&p=11.5`. Ältere Links mit `smax` (Höchstpunktzahl inklusive
Zusatzpunkten) werden weiter gelesen.

## Entwicklung

Keine Abhängigkeiten, kein Build. `index.html` direkt öffnen oder einen
beliebigen statischen Server verwenden.

| Datei | Inhalt |
|---|---|
| `grading.js` | Notenschlüssel und Rechenregeln (ohne DOM, getestet) |
| `app.js` | Oberfläche, URL-Synchronisierung |
| `app.css` | wenige app-spezifische Regeln, nur Design-Tokens |
| `style.css`, `b3.js`, `fonts/` | B3-Styleguide v6.2, **unverändert** übernommen |

Tests (Node ≥ 18):

```sh
node --test
```

Styleguide aktualisieren: `style.css`, `b3.js` und den Ordner `fonts/` als Ganzes
aus dem Styleguide-Repository ersetzen, nie einzelne Abschnitte bearbeiten.

Kein offizielles Angebot einer IHK oder Schule. Alle Angaben ohne Gewähr.
