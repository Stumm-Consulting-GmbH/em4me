# Ansichten und Darstellung

Wie ein Dokument erscheint, entscheiden zwei Ebenen. Die **Ansicht** gehört zum einzelnen Reiter: Sie legt fest, ob das Dokument gerendert, als Quelltext, geteilt oder live gezeigt wird. Das **Erscheinungsbild** gilt für die ganze Anwendung: Theme, Zoom, Inhalts-Breite und Schriften. Diese Seite führt beide Ebenen zusammen und nennt zu jeder Einstellung ihren Ort.

## Die fünf Ansichten

Jeder Reiter steht in genau einer von fünf Ansichten. Der gewählte Modus gilt pro Reiter, nicht global: Ein Dokument darf gerendert offen sein, während daneben ein zweites im Quelltext bearbeitet wird.

| Ansicht       | Was sie zeigt                                          | Standard-Kürzel |
| ------------- | ------------------------------------------------------ | --------------- |
| **Gerendert** | nur das formatierte Ergebnis                           | `Strg+1`        |
| **Geteilt**   | Quelltext und Ergebnis nebeneinander                   | `Strg+2`        |
| **Quellcode** | nur den Markdown-Quelltext                             | `Strg+3`        |
| **Live**      | den Quelltext, formatiert direkt in der Bearbeitung    | `Strg+4`        |
| **Mindmap**   | die Struktur des Dokuments als Karte statt als Text    | `Strg+5`        |

Umgeschaltet wird über die Schaltflächen in der Statusleiste oder über den Kopf des Ansicht-Menüs; die Mindmap steht im Menü und auf ihrem Kürzel, nicht in der Statusleiste. Welche Ansicht ein neu geöffneter Reiter bekommt, stellt der Bereich „Verhalten" der Einstellungen ein.

### Live-Modus

Der Live-Modus rendert das Markdown unmittelbar im Editor: Fett und kursiv, Links, Tabellen, Code, Bilder, KaTeX-Formeln und Mermaid-Diagramme erscheinen so, wie sie im gerenderten Ergebnis aussehen. Steht der Cursor in einer Zeile, zeigt genau diese Zeile ihre rohe Quelle und bleibt damit bearbeitbar. So entfällt der Wechsel zwischen Schreiben und Nachsehen.

### Mindmap

Die Mindmap zeigt Überschriften und Listen des Dokuments als Baum, den Fließtext als Notiz am Knoten. Sie gehört zur gleichnamigen Erweiterung und entfällt mit ihr; Aufbau, Bedienung, die fünf Lagen der Wurzel und die Vorgabe je Dokument beschreibt die Seite [Mindmap-Ansicht](mindmap.md).

### Bearbeiten

Der Bearbeiten-Modus schaltet den Editor scharf und wirkt in der Quellcode-, der geteilten und der Live-Ansicht (Standard `Strg+E`, Stift in der Statusleiste, Ansicht → Bearbeiten). Ein Klick auf den Stift in der reinen Lese-Ansicht wechselt selbsttätig in die geteilte Ansicht und aktiviert den Editor dort. Womit sich im Bearbeiten-Modus formatieren lässt, beschreiben die Seiten [Editor-Kontextmenü](context-menu.md) und [Format-Toolbar](toolbar.md).

## Editor-Darstellung

Das Untermenü Ansicht → Editor-Darstellung bündelt die fünf Schalter, die den Editor selbst betreffen. Dieselben Schalter liegen als Symbole in der Statusleiste.

- **Gliederung** blendet die Falt-Spur am linken Rand ein: Überschriften, Listen und Blöcke lassen sich dort zuklappen, und die Hierarchie bleibt als Spur sichtbar.
- **Zeilennummern** zeigt die Nummern-Spalte.
- **Zeilenumbruch** bricht lange Zeilen am Fensterrand um, statt waagerecht zu rollen.
- **Scroll-Synchronisation** koppelt in der geteilten Ansicht beide Hälften: Beim Rollen im Quelltext folgt das Ergebnis inhaltlich und umgekehrt. Der Schalter gilt pro Reiter.
- **Typewriter-Scroll** hält die Cursor-Zeile vertikal in der Mitte, sobald der Cursor bewegt wird. Er wirkt nur im Bearbeiten-Modus.

Die ersten drei Schalter sind **dokument-gebunden**: Ihr Wert wandert in das Frontmatter der Datei (`fold-gutter`, `line-numbers`, `word-wrap`) und reist mit ihr. Das Umschalten schreibt den neuen Wert dort hinein und macht die Datei änderungsbedürftig; ein Dokument ohne eigene Angabe folgt der Voreinstellung unter Datei → Einstellungen… → Darstellung. Die Auflösungs-Reihenfolge beschreibt die Seite [Frontmatter und Properties](frontmatter.md).

## Erscheinungsbild

### Hell, dunkel und System

Die Anwendung läuft in einem hellen oder einem dunklen Theme; die Vorgabe folgt dem Theme des Betriebssystems. Umgestellt wird über das Theme-Symbol in der Statusleiste oder über Ansicht → Erscheinungsbild → Hell/Dunkel/System. Welche Farben das jeweilige Theme verwendet, ist über Farbschemas frei bestimmbar, siehe [Farbschemas](color-schemes.md).

### Fokus-Modus

Der Fokus-Modus blendet Reiterleiste, Statusleiste und Sidebar aus und lässt allein das Dokument stehen (Ansicht → Erscheinungsbild → Fokus-Modus, Standard `Strg+Umschalt+F`). Die Menüleiste bleibt über `Alt` erreichbar. `Esc` verlässt den Modus, sofern nicht gerade ein Dialog oder ein Menü offen ist. Ein eingeklappter Sidebar-Zustand bleibt davon unberührt und gilt nach dem Verlassen unverändert weiter.

### Aktive Zeile

Die Zeile mit dem Cursor wird im Bearbeiten-Modus dezent hinterlegt, im Quellcode- wie im Live-Modus und samt Zeilennummern-Spalte. In der reinen Lese-Ansicht bleibt sie unmarkiert, weil dort kein Cursor steht. Die Tönung ist halbtransparent und legt sich damit über jedes Farbschema; Auswahl, Suchtreffer und Linter-Markierungen bleiben darüber sichtbar. Schalter: Datei → Einstellungen… → Darstellung.

### Zoom

Der Inhalt jedes Reiters lässt sich unabhängig in Zehn-Prozent-Schritten vergrößern und verkleinern (Standard `Strg + +`, `Strg + −`, `Strg + 0`, dazu `Strg` mit dem Mausrad). Weicht der Faktor von hundert Prozent ab, zeigt ihn die Statusleiste an; ein Klick darauf setzt zurück. Der Zoom ist flüchtig und überlebt das Schließen des Fensters nicht.

### Inhalts-Breite

Die Inhalts-Breite bestimmt als Prozent-Wert, wie viel Platz die gerenderte Darstellung nutzt (20 bis 100, Vorgabe 80). Schmalere Werte bleiben mittig. Sie gilt für die gerenderte und die geteilte Ansicht; der PDF-Export nutzt unabhängig davon die volle Druckbreite. Einstellung: Datei → Einstellungen… → Darstellung.

### Schriftart und Schriftgröße

Schriftart und Schriftgröße lassen sich getrennt für die Bearbeiten-Fläche und für die gerenderte Ansicht wählen; die Größe liegt zwischen 8 und 32. Die Werte gelten für alle Dokumente und greifen sofort in allen offenen Fenstern. Einstellung: Datei → Einstellungen… → Darstellung.

## Fenster-Zustand

Position, Größe und Maximiert-Zustand eines Fensters werden beim Beenden gemerkt und beim nächsten Start wiederhergestellt. Dafür ist nichts einzustellen. Was darüber hinaus eine ganze Sitzung mit ihren Reitern zurückholt, beschreibt die Seite [Applikationen, Fenster und Bereiche](apps-windows.md).

## Wort-Statistik

Die Statusleiste zeigt Wörter, Zeichen und die geschätzte Lesezeit der aktiven Datei. Ist im Editor etwas markiert, wechselt die Anzeige auf die Auswahl. Ein Klick öffnet einen Detail-Dialog mit Absätzen, Sätzen und der Zahl der Überschriften je Ebene. Frontmatter, Code-Blöcke und KaTeX-Formeln zählen nicht mit.

## Einstellungen

Die Einstellungen öffnen als eigener Reiter (Datei → Einstellungen…, Standard `Strg+,`). Ihre Navigation gliedert sich in vier Blöcke:

- **Allgemein** — alles, was für die ganze Anwendung gilt, etwa Darstellung, Verhalten, Tastenkürzel und Export.
- **Aktueller Bereich** — die Einstellungen des geöffneten Bereichs. Der Block erscheint nur, solange ein Bereich offen ist.
- **Erweiterungen (intern)** — das Ein- und Ausschalten der mitgelieferten Erweiterungen samt ihren eigenen Bereichen.
- **Erweiterungen (extern)** — die Verwaltung selbst installierter Erweiterungs-Pakete.

Änderungen wirken zunächst als Entwurf mit Live-Vorschau der Darstellung. Anwenden und OK speichern; beide sind nur bei ungesicherten Änderungen hervorgehoben, ohne Änderungen ist Anwenden abgeblendet. Abbrechen oder das Schließen des Reiters verwirft den Entwurf. Gespeicherte Werte gelten sofort in allen offenen Fenstern. Mehr zu den beiden Erweiterungs-Blöcken steht auf der Seite [Erweiterungen](extensions.md).

## Sprache

Die Oberfläche steht in Deutsch, Englisch, Französisch, Spanisch und Italienisch bereit. Gewechselt wird über die Sprach-Auswahl in der Statusleiste; offene Handbuch-Seiten wechseln unmittelbar mit.

## Menüleiste

Die Menüleiste führt die drei Menüs Datei, Ansicht und Hilfe. `Alt` schaltet die Tastatursteuerung ein, und die unterstrichenen Buchstaben springen direkt in das jeweilige Menü, etwa `Alt+D` für Datei. Die aktuell wirksamen Kürzel aller Kommandos listet die Seite [Tastenkürzel](shortcuts.md).

Ganz am Ende des Ansicht-Menüs stehen die Entwickler-Tools. Sie liegen bewusst fest auf `F12` und sind nicht umbelegbar: Sie sind ein Werkzeug zur Fehlersuche und kein Bestandteil der täglichen Arbeit.
