# Lesezeichen

Lesezeichen halten häufig gebrauchte Dateien griffbereit, unabhängig davon, welcher Ordner gerade geöffnet ist. Sie stehen in einem eigenen Sidebar-Panel als Baum aus Ordnern und Datei-Einträgen. Es gibt zwei Arten: **allgemeine Lesezeichen**, die app-weit gelten, und **Bereichs-Lesezeichen**, die zu einem [Bereich](apps-windows.md) gehören und mit ihm reisen.

## Das Lesezeichen-Panel

Das Panel „Lesezeichen" wird wie jedes Sidebar-Panel geschaltet: über den Stern in der Statusbar, das Menü Ansicht → Sidebar → Panels → Lesezeichen (Standard `Strg+Umschalt+L`) oder ein selbst vergebenes Kürzel. Der Schalter wirkt auf die aktive Spalte; Seite, Reihenfolge und Reiter-Gruppen folgen den Regeln der [Sidebar](sidebar.md). Der Stern in der Statusbar zeigt zusätzlich an, ob die aktive Datei bereits gemerkt ist.

Ein Klick auf einen Eintrag öffnet die Datei. Fehlt eine gemerkte Datei am erwarteten Ort, weist der Eintrag darauf hin, statt still ins Leere zu führen. Auch im leeren App-Zustand ohne offenes Dokument bleibt die Liste bedienbar, sodass gemerkte Dateien direkt geöffnet werden können.

## Zwei Abschnitte: allgemein und bereichsgebunden

Bei geöffnetem Bereich teilt sich das Panel in zwei Abschnitte mit eigenen Köpfen: **Bereichs-Lesezeichen** und **Lesezeichen**. Ohne geöffneten Bereich zeigt das Panel nur die allgemeinen Lesezeichen, ganz ohne Abschnitts-Köpfe, also im gewohnten Ein-Abschnitts-Bild.

- **Allgemeine Lesezeichen** liegen in den app-weiten Einstellungen und speichern absolute Pfade. Sie sind immer verfügbar.
- **Bereichs-Lesezeichen** gehören zum geöffneten Bereich und liegen in dessen Bereichsdatei. Ihre Ziele sind relativ zur Bereichs-Wurzel gespeichert; sie erscheinen nur, solange der Bereich geöffnet ist, und verschwinden beim Schließen des Bereichs wieder aus dem Panel.

Welcher Abschnitt oben steht, legt die Einstellung „Bereichs-Lesezeichen oben" fest (Einstellungen → Verhalten). Im Standard stehen die Bereichs-Lesezeichen oben; wird die Option ausgeschaltet, stehen die allgemeinen oben. Ohne geöffneten Bereich hat die Einstellung keine sichtbare Wirkung.

## Warum relative Pfade

Ein Bereichs-Lesezeichen merkt sich sein Ziel nicht als vollständigen Pfad, sondern relativ zur Wurzel des Bereichs, mit Vorwärts-Schrägstrichen. Dadurch bleiben die Lesezeichen gültig, wenn der ganze Bereichs-Ordner verschoben oder auf einen anderen Rechner kopiert wird: Sie werden beim Öffnen jedes Mal frisch gegen die aktuelle Bereichs-Wurzel aufgelöst. Damit die Relativität trägt, kann ein Bereichs-Lesezeichen nur auf Dateien innerhalb des Bereichs zeigen. Ein Ziel außerhalb des Bereichs ist nicht möglich; die App weist es ab.

## Lesezeichen anlegen

### Allgemeine Lesezeichen

Die aktive Datei wird über Datei → Weitere Datei-Funktionen → Aktive Datei als Lesezeichen merken (Standard `Strg+D`) oder den Stern gemerkt. Ist kein Bereich geöffnet oder liegt die Datei außerhalb des geöffneten Bereichs, entsteht ohne Nachfrage ein allgemeines Lesezeichen.

Ist dagegen ein Bereich geöffnet und liegt die aktive Datei innerhalb, öffnet `Strg+D` am Stern ein kleines Auswahl-Menü mit den Zielen „Allgemeines Lesezeichen" und „Bereichs-Lesezeichen". So ist bei jeder Anlage klar, in welchen Abschnitt das Lesezeichen wandert.

### Bereichs-Lesezeichen direkt

Zwei Kontextmenüs legen ein Bereichs-Lesezeichen ohne den Umweg über die Ziel-Wahl an:

- Die **Datei-Zeile im Bereichs-Panel** bietet per Rechtsklick „Als Bereichs-Lesezeichen" an; die Dateien dort liegen ohnehin im Bereich.
- Das **Kontextmenü eines Datei-Tabs** bietet „Als allgemeines Lesezeichen" und, bei geöffnetem Bereich mit der Datei innerhalb, zusätzlich „Als Bereichs-Lesezeichen".

## Umwandeln zwischen den Abschnitten

Ein bestehendes Lesezeichen lässt sich über sein Kontextmenü in die jeweils andere Art überführen: „In Bereichs-Lesezeichen umwandeln" bzw. „In allgemeine Lesezeichen umwandeln". Das gilt auch für einen ganzen Ordner samt seinem Unterbaum, der dann mit Struktur und Reihenfolge übernommen wird.

Beim Umwandeln in ein Bereichs-Lesezeichen prüft die App, ob alle betroffenen Ziele innerhalb des Bereichs liegen. Trifft das nicht zu, wird der ganze Vorgang abgelehnt und weist darauf hin, dass die Umwandlung Ziele außerhalb des Bereichs enthält. So bleibt die Regel der relativen Pfade gewahrt.

## Ordnen und pflegen

Beide Abschnitte teilen dieselben Werkzeuge. Über das Rechtsklick-Menü eines Eintrags entstehen neue Ordner und Unterordner; Einträge lassen sich umbenennen, in einen Ordner verschieben und entfernen. Ordner enthalten wieder Ordner, sodass sich die Sammlung frei gliedern lässt.

Per Drag-and-Drop wird innerhalb eines Abschnitts sortiert und in Ordner einsortiert. Das Ziehen bleibt bewusst auf den eigenen Abschnitt beschränkt: Ein Eintrag wird nicht über die Grenze zwischen Bereichs- und allgemeinen Lesezeichen gezogen. Für den Wechsel des Abschnitts dient das Umwandeln.

Wird eine gemerkte Datei innerhalb der App umbenannt oder ihr Ordner umbenannt, ziehen die Lesezeichen automatisch nach, in beiden Abschnitten: das allgemeine Modell über die absoluten Pfade, der Bereichs-Baum über die relativen.

## Ohne geöffneten Bereich

Ohne geöffneten Bereich bleibt allein der allgemeine Abschnitt sichtbar, ohne Kopf und ohne Bereichs-Abschnitt. Die Bereichs-Lesezeichen sind dann nicht verloren, sondern warten in der Bereichsdatei; sobald der Bereich wieder geöffnet wird, erscheinen sie erneut im Panel.
