# Notenrechner

Der IHK-Notenschlüssel, umgerechnet auf jede Höchstpunktzahl:
<https://mamrehn.github.io/notenrechner/>

- Notengrenzen in **halben Punkten, ganzen Punkten oder auf 0,01 genau** (mebis), mit Punkt-
  und Prozentbereich je Note
- Note, Prozent und Dezimalnote zu einer erreichten Punktzahl, auch mit
  Nachkommastellen (z. B. 13,353 aus mebis), Komma oder Punkt
- Ergebnis **als Text kopieren** (für E-Mail oder Messenger) oder als Link teilen
- Ausdruck mit Titel der Prüfung und optional dem Namen
- Für Lehrkräfte: **Punkte zusammenzählen** mit Höchstpunkten je Aufgabe, gebaut für
  eine ganze Klasse am Stück:
  - <kbd>Enter</kbd>, <kbd>Leertaste</kbd> oder <kbd>+</kbd> zur nächsten Aufgabe, nach der
    letzten zur nächsten Person; <kbd>⇧ Enter</kbd> oder <kbd>Rücktaste</kbd> im leeren Feld
    zurück; Pfeiltasten wie in einer Tabelle; Einfügen aus Excel füllt mehrere Zellen
  - große Anzeige von Summe und Note der aktuellen Person (bleibt nach der letzten Aufgabe
    stehen, bis die nächste Person beginnt), Liste der offenen Zeilen, „Weiter bei Nr. …“
  - meldet fehlende Aufgaben und unmögliche Werte (über dem Maximum, nicht im Raster aus
    halben, ganzen oder 0,01 Punkten); Durchschnitt je Aufgabe in der Fußzeile
  - bleibt beim Neuladen erhalten (sessionStorage), verschwindet mit dem Tab
- Für Lehrkräfte: Klasse auswerten (nur Punkte, keine Namen, beliebig getrennt, z. B.
  „2 3  32 26 3.5 5,8“): Durchschnitt und Median, Standardabweichung, Spannweite;
  Notenspiegel mit gekippter Oberkante: Sie zeigt, ob die Ergebnisse einer Note eher an der
  besseren (links höher) oder an der schlechteren Nachbarnote liegen (rechts höher),
  um bis zu 45°; gepunktet der normale Balken, hell der Keil, den das Kippen anhebt;
  Noten im selben Layout zurück nach Excel; **Präsentieren** zeigt Notenspiegel und
  Kennzahlen im Vollbild für den Beamer (ohne Spannweite, damit niemand am niedrigsten
  Ergebnis erkennbar wird; <kbd>Esc</kbd> schließt)
- Zusatzpunkte, Farbschema automatisch / hell / dunkel (ein Knopf), funktioniert offline

## Grundlage

§ 24 „Bewertungsschlüssel“ der *Musterprüfungsordnung für die Durchführung von
Abschluss- und Umschulungsprüfungen* (Richtlinie des Hauptausschusses des BIBB
vom 07.10.2025, BAnz AT 07.11.2025 S3,
[PDF](https://www.bibb.de/dokumente/pdf/HA120.pdf)):

| Note | Punkte von 100 |
|---|---|
| 1 sehr gut | 100–92 |
| 2 gut | 91–81 |
| 3 befriedigend | 80–67 |
| 4 ausreichend | 66–50 |
| 5 mangelhaft | 49–30 |
| 6 ungenügend | 29–0 |

Die Dezimalnoten (100 → 1,0, 92 → 1,4, 50 → 4,4 …) stammen aus derselben
Tabelle. Sie sind eine feste Zuordnung, keine Formel: Innerhalb einer Note steigt
die Dezimalnote in fast gleichen Schritten, die Noten umfassen aber 9 („sehr
gut“) bis 30 („ungenügend“) Prozentpunkte. Insgesamt ist das eine Kurve.

## Rechenweg

Die Prüfungsordnung legt den Schlüssel nur für ganze Punkte von 100 fest. Für
andere Höchstpunktzahlen gilt hier:

1. **Der Prozentwert entscheidet:** „sehr gut“ ab 92 %, „gut“ ab 81 % usw.
2. **Prozentbereiche:** Die untere Grenze gehört zur Note, die obere nicht
   („81 – unter 92“). Nur 100 % gehören noch zur obersten Zeile.
3. **Punktbereiche der Tabelle:** Jede Untergrenze wird auf den nächsten halben
   Punkt, ganzen Punkt oder Hundertstelpunkt aufgerundet. Bei 13 Punkten:
   92 % × 13 = 11,96, also „sehr gut“ ab 12 (halbe Punkte) bzw. ab 11,96
   (0,01). Für Punktzahlen in diesem Raster stimmen Tabelle und Prozentwert
   immer überein.
4. **Mehr Nachkommastellen** (z. B. 13,353): Der genaue Prozentwert ordnet ein.
   11,97 von 13 sind 92,07 %, also „sehr gut“, obwohl die Punktspalte in halben
   Punkten erst bei 12 beginnt. Die Seite weist in diesem Fall darauf hin.
5. **Anzeige:** Prozentwerte werden auf zwei Nachkommastellen abgerundet
   (91,996 % → 91,99 %), für die Dezimalnote auf ganze Prozent. Keine Anzeige
   wirkt besser als das Ergebnis.
6. Zusatzpunkte verschieben keine Grenze, sie verlängern nur „sehr gut“ nach oben.

Bei 100 Punkten ergibt das genau die Tabelle oben.

Noten werden ohne Ampelfarben gezeigt: Sie sind eine Information über die
Leistung, kein Urteil über die Person. Die Seite enthält bewusst keine
Lob- oder Defizit-Formulierungen (etwa „Dir fehlen noch …“).

## Links mit Werten

| Parameter | Bedeutung |
|---|---|
| `max` | Höchstpunktzahl (Standard 100) |
| `p` | erreichte Punkte, auch mit Nachkommastellen |
| `step` | `1` für ganze Punkte, `0.01` für Hundertstel (Standard: halbe Punkte) |
| `bonus` | Zusatzpunkte |
| `title` | Titel der Prüfung |
| `tasks` | Höchstpunkte je Aufgabe, z. B. `10_8_12_10` |

Beispiel: `?title=2.+Schulaufgabe&max=15&p=13.353`. Der Name steht nie in der
Adresse und wird nirgends gespeichert. Ältere Links mit `smax` (Höchstpunktzahl
inklusive Zusatzpunkten) werden weiter gelesen.

## Entwicklung

Keine Abhängigkeiten, kein Build. `index.html` direkt öffnen oder einen
beliebigen statischen Server verwenden.

| Datei | Inhalt |
|---|---|
| `grading.js` | Notenschlüssel und Rechenregeln (ohne DOM, getestet) |
| `app.js` | Oberfläche, URL-Synchronisierung, Kopieren, Druck |
| `app.css` | wenige app-spezifische Regeln, nur Design-Tokens |
| `style.css`, `b3.js`, `fonts/` | B3-Styleguide v6.3, **unverändert** übernommen |

Tests (Node ≥ 18):

```sh
node --test
```

Styleguide aktualisieren: `style.css`, `b3.js` und den Ordner `fonts/` als Ganzes
aus dem Styleguide-Repository ersetzen, nie einzelne Abschnitte bearbeiten.

Kein offizielles Angebot einer IHK oder Schule. Alle Angaben ohne Gewähr.
