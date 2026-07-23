# Vorlagen

Vorlagen sind gewöhnliche Markdown-Dateien in einem konfigurierbaren **Vorlagen-Ordner**. Beim Anwenden wertet die App kuratierte **Platzhalter** aus: Datum und Zeit mit Offset und Format, Titel und Ordner der Zieldatei, Eingabe- und Auswahl-Dialoge, die Zwischenablage und eine Cursor-Zielposition. Vorlagen erzeugen neue Dateien mit fertiger Struktur oder fügen wiederkehrende Bausteine an der Cursor-Position ein; **Ordner-Regeln** füllen neue Dateien automatisch.

Die Funktionalität ist als Erweiterung «Vorlagen» schaltbar (Einstellungen → Erweiterungen); im Aus-Zustand entfallen die Kommandos, der Einstellungs-Bereich und die Ordner-Regeln.

## Vorlagen-Ordner

Der Vorlagen-Ordner wird in den Einstellungen konfiguriert (Einstellungen → Vorlagen):

- **Global** gilt der App-weite Ordner als Grundlage für alle Fenster.
- **Pro Bereich** kann eine eigene Konfiguration gesetzt werden («Bereichs-Konfiguration verwenden» im Eintrag «Vorlagen» der Navigations-Gruppe «Aktueller Bereich», nur bei geöffnetem Bereich sichtbar); sie wird in der Bereichsdatei des Bereichs gespeichert und **übersteuert die globale vollständig** (Ordner und Regeln, keine Misch-Auflösung). Ordner-Angaben sind dabei relativ zur Bereichs-Wurzel, absolute Pfade bleiben erlaubt.

Jede Markdown-Datei im Ordner (inklusive Unterordnern) ist eine Vorlage. Unterordner erscheinen im Auswahl-Popup als Gruppen. Änderungen an der Konfiguration wirken sofort, ohne Neustart.

## Vorlagen anwenden

Zwei Wege führen zur Vorlage:

- **Neue Datei aus Vorlage** (Menü Datei): Vorlage im filterbaren Auswahl-Popup wählen, Dateinamen vergeben (`/` legt eine Unterseite an), Dialog-Kette beantworten. Die Datei entsteht mit dem gefüllten Inhalt im Ordner der aktiven Datei (ohne aktive Datei in der Bereichs-Wurzel; ohne beides fragt ein Ordner-Dialog nach dem Ziel), öffnet als Tab, und der Cursor springt auf das erste `{{cursor}}`-Ziel.
- **Vorlage einfügen** (Editor-Kontextmenü → Einfügen): Das gefüllte Ergebnis wird an der Cursor-Position eingefügt, als ein einziger Bearbeitungs-Schritt (ein Rückgängig entfernt alles).

Mehrere Eingabe- und Auswahl-Platzhalter erscheinen **nacheinander** in der Reihenfolge ihres ersten Vorkommens; identische Fragen werden nur einmal gestellt. Ein Abbruch irgendeines Dialogs bricht das gesamte Anwenden ab: Es entsteht keine Datei und kein Einfüge-Text.

## Platzhalter-Referenz

Platzhalter stehen in doppelten geschweiften Klammern. `\{{` schreibt ein literales `{{` in die Vorlage.

| Platzhalter | Wirkung |
| --- | --- |
| `{{date}}` / `{{time}}` | Datum bzw. Uhrzeit des Anwendens (`2026-07-09` bzw. `14:30`) |
| `{{date:+7d}}` | Datum mit Offset; Einheiten der Abfrage-Sprache (`s`, `min`, `h`, `d`, `w`, `mo`, `y`, auch kombiniert: `1d 12h`), Vorzeichen optional |
| `{{date::dd.MM.yyyy}}` | Datum mit eigenem Format; Token `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` (wie die Abfrage-Funktion `dateformat`); Offset und Format kombinierbar: `{{date:+7d:dd.MM.yyyy}}` |
| `{{time:-30min:HH:mm:ss}}` | auch die Zeit nimmt Offset und Format |
| `{{title}}` | Titel der Zieldatei (bei Unterseiten die logische Form mit `/`) |
| `{{folder}}` | Ordner der Zieldatei (im Bereich wurzel-relativ) |
| `{{prompt:Frage}}` | Eingabe-Dialog; optionaler Vorgabe-Wert: `{{prompt:Frage:Vorgabe}}` |
| `{{select:Frage:a,b,c}}` | Auswahl-Dialog mit den Optionen `a`, `b`, `c` |
| `{{clipboard}}` | aktueller Text der Zwischenablage |
| `{{cursor}}` | Cursor-Zielposition nach dem Anwenden; mehrere nummerierte Ziele mit `{{cursor:2}}`, das niedrigste ist das Sprungziel |

Beispiel-Vorlage:

````markdown
# {{title}}

Datum: {{date}}, nächster Termin: {{date:+7d:dd.MM.yyyy}}
Thema: {{prompt:Thema}}
Priorität: {{select:Priorität:Hoch,Mittel,Niedrig}}

## Notizen

{{cursor}}
````

Unbekannte Platzhalter oder defekte Parameter brechen das Anwenden mit einer Meldung in der Statusleiste ab; es entsteht keine halb gefüllte Datei.

## Ordner-Regeln

Ordner-Regeln füllen neue Dateien automatisch: Jede Regel ordnet einem **Zielordner** eine **Vorlage** zu (Einstellungen → Vorlagen). Beim Anlegen einer Datei über die App (Bereichs-Panel, neue Unterseite) läuft die Vorlage mit der vollen Platzhalter-Auswertung inklusive Dialogen.

- Der **tiefste passende Ordner gewinnt**; Unterordner zählen zum Treffer. Ein leerer Ordner-Eintrag ist die Wurzel-Regel.
- Der **Vorlagen-Ordner selbst ist ausgenommen** — neue Vorlagen bleiben leer.
- Wählt man explizit «Neue Datei aus Vorlage», hat die gewählte Vorlage Vorrang; die Regel greift nicht zusätzlich.
- Ein Dialog-Abbruch legt die Datei **leer** an (die Anlage selbst war gewollt) und meldet einen Hinweis.
- Dateien, die außerhalb der App entstehen (etwa im Datei-Explorer), durchlaufen die Regeln nicht.
