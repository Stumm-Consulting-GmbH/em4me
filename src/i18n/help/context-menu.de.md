# Editor-Kontextmenü

Ein Rechtsklick im Editor öffnet ein Kontextmenü, das die Formatierungs-, Absatz- und Einfüge-Konstrukte direkt am Text zugänglich macht. Es steht im Quelltext- und im Live-Modus zur Verfügung. Die Zugänge und Standard-Kürzel stehen in der [Funktions-Tabelle](functions.md).

## Aufbau

Das Menü gliedert sich von oben nach unten in sechs Gruppen:

- **Link** — die Markierung als Wiki-Link oder als externen Link umschließen.
- **Format** — Zeichen-Ebene: Fett, Kursiv, Durchgestrichen, Hervorheben, Quelltext, Mathe, Kommentar und „Formatierung entfernen".
- **Absatz** — Zeilen-Ebene: Aufzählung, nummerierte Liste, Aufgabenliste, Überschrift 1 bis 6, Keine Überschrift und Zitat.
- **Einfügen** — Schablonen: Fußnote, Tabelle, Hinweisblock, horizontale Linie und Quelltext-Block.
- **Tabelle** — Bearbeitungs-Operationen für die Tabelle am Cursor; erscheint nur, wenn der Cursor in einer Tabelle steht.
- **Zwischenablage** — Ausschneiden, Kopieren, Einfügen, Alles auswählen.

Die Standard-Kürzel für Fett (`Strg+B`) und Kursiv (`Strg+I`) wirken auch ohne das Menü; alle übrigen Aktionen lassen sich in den Einstellungen mit einem Kürzel belegen.

## Selektions-Semantik

Die Zeichen-Formate richten sich nach der Markierung:

- Mit Markierung wirkt die Aktion auf die markierten Zeichen.
- Ohne Markierung nimmt sie das Wort unter dem Cursor.
- Steht der Cursor nicht in einem Wort, wird ein leeres Marker-Paar eingefügt und der Cursor dazwischen gesetzt.

Führende und folgende Leerzeichen bleiben außerhalb der Marker.

## Umschalter und Häkchen

Alle Format- und Absatz-Aktionen sind Umschalter: Ist das Format bereits gesetzt, entfernt dieselbe Aktion es wieder. Beim Wechsel des Listen-Typs wird der bestehende Präfix ersetzt statt gestapelt. Das Absatz-Untermenü zeigt mit einem Häkchen, welcher Zustand für die Cursor-Zeile aktiv ist, etwa eine bestimmte Überschrift-Ebene oder „Keine Überschrift".

## Mehrere Zeilen

Umfasst die Markierung mehrere Zeilen, wirkt eine Absatz-Aktion auf alle diese Zeilen. Eine nummerierte Liste wird dabei fortlaufend nummeriert.

## Untermenü Tabelle

Steht der Cursor in einer Tabelle, erscheint zusätzlich die Gruppe **Tabelle** mit einem Untermenü; außerhalb von Tabellen fehlt sie. Die Operationen wirken auf die Tabelle am Cursor und funktionieren in beiden Tabellenarten, der Pipe-Tabelle und der [Perspective Table](perspective-table.md):

- **Ausrichtung** — Spalte linksbündig, zentriert oder rechtsbündig ausrichten; ein Häkchen zeigt die aktuelle Ausrichtung der Cursor-Spalte.
- **Zeilen** — nach oben oder unten verschieben, unterhalb einfügen, löschen.
- **Spalten** — nach links oder rechts verschieben, rechts einfügen, löschen.
- **Transponieren** — Zeilen und Spalten tauschen; die Kopfzeile wird zur ersten Spalte.

Jede Operation ist ein einzelner Undo-Schritt. Nicht mögliche Ziele erscheinen gedimmt: Die Kopf- und die Trennzeile einer Pipe-Tabelle lassen sich nicht verschieben oder löschen, die letzte Spalte lässt sich nicht löschen. Pipe-Tabellen werden beim Eingriff formatiert zurückgeschrieben (Rand-Pipes, Spalten mit Leerzeichen ausgerichtet); das gilt auch für randlose Tabellen. Bei Perspective-Tabellen arbeiten die Zeilen-Operationen auf den `|-`-Abschnitten; Spalten-Operationen und Transponieren sind dort nur ohne `colspan`/`rowspan` möglich und werden sonst mit einem Hinweis abgelehnt. Alle Operationen stehen auch in der Kommando-Palette und lassen sich mit Kürzeln belegen; die Erweiterung „Tabellen-Werkzeuge" schaltet das Untermenü samt Kommandos ab.

## Schutz in Links und Quelltext

Innerhalb eines Wiki-Link-Ziels und innerhalb von Inline-Quelltext bleiben die Format-Aktionen bewusst wirkungslos, weil die Marker dort die Struktur zerstören würden. „Formatierung entfernen" räumt an solchen Stellen dagegen weiter auf.

## Schreibgeschützter Editor

Ist der Editor schreibgeschützt, also eine Ansicht ohne Edit-Modus, zeigt das Menü nur Kopieren und Alles auswählen; die Link-, Format-, Absatz- und Einfüge-Gruppen entfallen.
