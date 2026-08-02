# Notiz-Merker — Beispiel für eine externe Erweiterung

Referenz-Erweiterung für die Erweiterungs-API v1.1. Sie ist lauffähig und zugleich als Vorlage gedacht: Jeder Teil der API kommt genau einmal vor, und die Teile hängen fachlich zusammen, statt nur nebeneinander zu stehen.

## Was sie tut

Beim Lesen oder Schreiben eines längeren Dokuments markiert `>>Text<<` eine Stelle als Merker. Im Gerenderten erscheint sie hervorgehoben; ein Panel in der Seitenleiste sammelt alle Merker des angezeigten Dokuments als Liste, und ein Klick springt zur Stelle. Darunter liegt eine freie Notizfläche, deren Inhalt dauerhaft erhalten bleibt.

```markdown
Der Abschnitt zur Preisliste ist >>noch mit dem Fachbereich abzustimmen<<.
Die Zahlen im zweiten Absatz stammen aus >>Quelle prüfen<<.
```

## Installation

1. Den Ordner `notiz-merker` in das Erweiterungs-Verzeichnis des Nutzerprofils kopieren. Der Zugang „Ordner öffnen" im Einstellungs-Bereich Erweiterungen (extern) öffnet es.
2. Im selben Bereich auf „Aktualisieren" klicken; das Paket erscheint mit dem Status „Nicht aktiviert".
3. „Aktivieren…" öffnet den Warn-Dialog. Erst nach der Bestätigung wird Code ausgeführt.

## Aufbau

| Datei | Läuft wo | Inhalt |
|---|---|---|
| `manifest.json` | — | Kennung, Version, API-Version, Einstiegspunkte |
| `markdown.js` | Render-Umgebung, ohne DOM | Inline-Regel für `((Text))` |
| `main.js` | Oberfläche | Panel, Kommando, Einstellungen, Übersetzungen |

## Was das Beispiel an der API vorführt

- **Render-Beitrag** mit eigenem Token und eigener Renderer-Regel statt rohem HTML. Das ist etwas länger, überlässt das Escapen aber der Render-Engine; ein vergessenes Escape wäre eine Sicherheitslücke im Dokument des Anwenders.
- **Die Wahl des Start-Zeichens.** Eine Inline-Regel wird nur an bestimmten Zeichen überhaupt aufgerufen; alles dazwischen verarbeitet die eingebaute Text-Regel am Stück. Eine Syntax auf einem anderen Zeichen greift dann nur am Absatz-Anfang und mitten im Satz nie. Wer eine eigene Syntax wählt, prüft das zuerst; die Kommentare in `markdown.js` nennen den Grund an Ort und Stelle.
- **Sidebar-Panel** je Spalte, mit anspringbarer Liste und einem eigenen, gespeicherten Inhalt.
- **Kommando mit Standard-Kürzel** (`Strg`+`Alt`+`M`), im Tastenkürzel-Editor umbelegbar.
- **Einstellungs-Bereich** mit zwei Optionen, die an verschiedenen Orten wirken: die Farbe im Dokument, die Sortierung im Panel.
- **Speicher** über `ctx.storage` für Notiztext, Farbe und Sortierung.
- **Theme-Zugriff** über `ctx.getThemeVariable`, jeweils mit einem Rückfallwert. Variablen-Namen sind keine zugesagte Schnittstelle; zu jedem Lesezugriff gehört ein Wert, der auch ohne sie trägt.
- **Übersetzungen** in Deutsch und Englisch, Standard-Sprache Englisch. Läuft die Anwendung auf Französisch, Spanisch oder Italienisch, greift sichtbar der Rückfall. Das ist Absicht: Eine vollständig übersetzte Vorlage würde diesen Mechanismus verbergen.
- **Render-Andockpunkt** `ctx.getRenderRoot` und `ctx.onRenderUpdated`. Er ist der einzige Berührungspunkt mit dem Dokument, und darin sucht die Erweiterung ausschließlich nach ihrer eigenen Marken-Klasse.

## Grenzen, die von der API kommen

Diese drei Punkte sind keine Lücken des Beispiels, sondern Eigenschaften der Schnittstelle. Wer eine eigene Erweiterung baut, trifft auf dieselben.

- **Der Render-Beitrag wirkt in der gerenderten Ansicht und im portablen Export, nicht im Live-Modus.** Dort arbeitet die Anwendung mit Editor-Dekorationen, für die die API keinen Beitrag kennt. Eine eigene Syntax bleibt im Editor unmarkiert.
- **Ein Merker steht im Fließtext, nicht am Zeilenanfang.** Beginnt eine Zeile mit `>>`, ist das für Markdown ein verschachteltes Zitat, und die Block-Ebene entscheidet vor der Inline-Ebene. Das ist keine Eigenheit dieses Beispiels, sondern gilt für jede eigene Syntax, deren Zeichen auf Block-Ebene bereits eine Bedeutung hat.
- **Die Notizfläche gilt global, nicht je Dokument.** Die API führt keine Dokument-Kennung, es gibt also nichts, woran eine dokumentbezogene Notiz hängen könnte.
- **Es gibt keine „aktive" Spalte.** Das Kommando springt deshalb in der ersten Spalte, die Merker zeigt.

## Weiterverwenden

Der Code steht unter derselben Lizenz wie die Anwendung. Wer eine eigene Erweiterung beginnt, kopiert den Ordner, ändert `id` und `name` im Manifest (die `id` muss dem Ordnernamen entsprechen) und ersetzt den Inhalt. Die vollständige Beschreibung der API steht in der Anwendung selbst unter Hilfe, Handbuch-Seite „Erweiterungen erstellen".
