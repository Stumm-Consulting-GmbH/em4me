# Ereignisse

Die Ereignis-Verwaltung hält **Termine, Geburtstage, Jahrestage und Projekt-Daten** direkt im Dokument: als eingebetteter Ereignis-Block mit eigenen Datenzeilen oder als Aggregation über Frontmatter-Eigenschaften aus den Dateien des Bereichs. Jeder Eintrag zeigt die **Zeitdifferenz zum heutigen Tag** in vier Staffelungen, dazu Meilensteine, Jahres-Wiederkehr, Filter, fünf Zusatz-Ansichten und Verknüpfungen zwischen Ereignissen.

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Ereignisse") und setzt die [Eigenschafts-Profile](property-profiles.md) voraus — wird deren Erweiterung deaktiviert, schaltet sich die Ereignis-Verwaltung mit ab. Deaktiviert bleibt der Block ein regulärer Code-Block.

## Aufbau des Blocks

Ein Code-Block mit dem Sprach-Tag `perspective-events` enthält optionale Kopf-Direktiven und Datenzeilen; das Kommando „Ereignis-Block einfügen" (über die Kommando-Palette, ein Kürzel ist in den Einstellungen belegbar) fügt einen leeren Block an der Cursor-Position ein:

````markdown
```perspective-events
| 2020-01-01 | | Projektstart Alpha | projekt | Kickoff-Notiz | | | | |
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Projekt-Phase | projekt | | | | | |
```
````

Gerendert erscheint die Ereignis-Tabelle mit Kategorie-Badges und Zeitdifferenz-Spalte:

```perspective-events
| 2020-01-01 | | Projektstart Alpha | projekt | Kickoff-Notiz | | | | |
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Projekt-Phase | projekt | | | | | |
```

Jede Datenzeile trägt neun Zellen in fester Reihenfolge:

| Zelle | Feld | Inhalt |
|---|---|---|
| 1 | Zeitpunkt | Datum `JJJJ-MM-TT` |
| 2 | Ende | optionales Datum für Zeitspannen |
| 3 | Ereignis | der Ereignis-Text (Pflichteingabe) |
| 4 | Kategorie | einer der acht Kategorie-Werte |
| 5 | Notizen | mehrzeilig, Zeilenumbruch als `\n` |
| 6 | jährlich | `x` = jährliche Wiederkehr |
| 7 | Kennung | automatisch vergeben, sobald der Eintrag verknüpft wird |
| 8 | Vorgänger | Kennungs-Liste, kommagetrennt |
| 9 | Nachfolger | Kennungs-Liste, kommagetrennt |

Ein `|` im Text wird als `\|` geschrieben, ein Backslash als `\\`. Wert-Probleme einzelner Einträge (fehlender oder ungültiger Zeitpunkt, Ende vor Beginn, unbekannte Kategorie) sind **weiche Hinweise** — der Eintrag bleibt sichtbar. Struktur-Fehler des Blocks (unbekannte Direktive, zu viele Zellen) sperren die Pflege, bis der Quelltext korrigiert ist.

## Feld-Modell: das interne Profil

Die Ereignis-Felder sind als festes, **internes Eigenschafts-Profil** namens `Ereignis` definiert. Es erscheint automatisch in der Profil-Auflösung und in der Profil-Liste der Einstellungen (gekennzeichnet, nicht änderbar) und wirkt auch ohne konfigurierten Profil-Ordner. Details zur Profil-Mechanik auf der Seite [Eigenschafts-Profile](property-profiles.md).

| Feld | Typ |
|---|---|
| `event-date` | Datum |
| `event-end` | Datum |
| `event-text` | Text |
| `event-category` | Auswahl aus den acht Kategorie-Werten |
| `event-notes` | mehrzeiliger Text |
| `event-recurring` | Wahrheitswert |
| `event-predecessors` | Liste |
| `event-successors` | Liste |

Die acht Kategorie-Werte sind `geburtstag`, `todestag`, `jahrestag`, `jubilaeum`, `projekt`, `termin`, `erinnerung` und `sonstiges` — technische Werte im Quelltext, angezeigt werden lokalisierte Namen als farbige Badges.

## Pflege in der Tabelle

Die Tabelle ist in der geteilten Ansicht, im Live-Modus **und in der Lese-Ansicht** direkt pflegbar (Handbuch-Seiten und Embeds bleiben schreibgeschützt). Jede Übernahme schreibt in den Code-Block zurück, als ein Undo-Schritt.

- **Anlegen**: Formularzeile unter der Tabelle; der Ereignis-Text ist die Pflichteingabe, das 📅-Symbol öffnet einen Kalender-Picker für die Datums-Felder.
- **Bearbeiten**: Stift-Aktion der Zeile öffnet die Eingabefelder; `Enter` übernimmt, `Esc` verwirft.
- **Duplizieren**: erzeugt eine Kopie des Eintrags, bewusst ohne Verknüpfungen.
- **Löschen**: nach Bestätigung; Verknüpfungen anderer Einträge auf den gelöschten werden mit bereinigt.

### Zeitdifferenz-Spalte

Die Differenz zum heutigen Tag erscheint in vier Staffelungen — Jahre, Monate, Wochen und Tage, kalender-genau gerechnet — mit der Richtung „vergangen", „bevorstehend" oder „heute". Ist ein Ende gesetzt, zeigt die Spalte zusätzlich die Dauer der Zeitspanne. Bei jährlicher Wiederkehr läuft ein Countdown zum nächsten Vorkommen; der 29. Februar fällt in Nicht-Schaltjahren auf den 28.

### Meilensteine

Ereignisse melden runde Distanzen als Meilensteine: Tausender-Vielfache in Tagen, Hunderter-Vielfache in Wochen, Hunderter-Vielfache in Monaten, volle Jahre sowie die Jubiläums-Jahre 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90 und 100.

## Sortierung und Filter

Ein Klick auf den Spalten-Kopf sortiert nach Zeitpunkt, Ende, Ereignis oder Kategorie (erneuter Klick dreht die Richtung; Standard ist Zeitpunkt absteigend, leere Werte stehen am Ende). Die Filter-Leiste kombiniert Text-Suche, Kategorie-Auswahl, Zeitraum (mit Presets wie „Heute", „Diese Woche", „Nächste 30 Tage") und die Flags „nur mit Notizen", „nur wiederkehrend", „nur mit Zeitspanne"; ein Zähler zeigt die sichtbaren Einträge.

Benannte Filter lassen sich als `filter:`-Direktive im Block speichern und über die Leiste anwenden:

````markdown
```perspective-events
filter: Wiederkehrend := recurring=x
filter: Geburtstage := categories=geburtstag; from=2026-01-01
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
```
````

Die Direktive trägt `Name := Schlüssel=Wert`-Paare, mit `;` getrennt: `text`, `categories` (kommagetrennt, `none` = ohne Kategorie), `from`, `to` sowie die Flags `notes`, `recurring` und `timespan` (`x` = an). Ein `;` im Wert wird als `\;` geschrieben.

## Ansichten

Der Umschalter über dem Block wechselt zwischen **Tabelle, Dashboard, Monats-Kalender, Wochen-Kalender, Timeline und Gantt**; die Wahl wird als `view:`-Direktive in den Block geschrieben (`table`, `dashboard`, `month`, `week`, `timeline`, `gantt`). Ein Klick auf ein Ereignis in einer Zusatz-Ansicht springt zur Tabellen-Zeile.

```perspective-events
view: dashboard
| 1990-03-10 | | Geburtstag Anna | geburtstag | | x | | | |
| 2026-07-20 | | Workshop | termin | | | | | |
| 2026-08-30 | | Sommerfest | jahrestag | | x | | | |
```

Das Dashboard bündelt anstehende Ereignisse, erreichte und nahende Meilensteine und die Kategorie-Verteilung; die Kalender legen die Einträge auf ein Monats- bzw. Wochen-Raster mit Heute-Markierung; die Timeline gruppiert chronologisch.

### Gantt

Die Gantt-Ansicht legt die Ereignisse als Balken auf eine gemeinsame Zeitachse, eine Zeile je Eintrag, sortiert nach Zeitpunkt. Ein Eintrag mit Ende wird zum Balken über seine Dauer, ein Eintrag ohne Ende zur Raute an seinem Zeitpunkt; die Farbe kommt aus der Kategorie. Gestrichelte Linien verbinden Vorgänger und Nachfolger, eine senkrechte Linie markiert den heutigen Tag.

```perspective-events
view: gantt
| 2026-07-06 | 2026-07-31 | Konzeptphase | projekt | | | e1 | | e2 |
| 2026-08-03 | 2026-09-11 | Umsetzung | projekt | | | e2 | e1 | |
| 2026-08-01 | | Freigabe | termin | | | | | |
```

Die Gliederung der Achse ergibt sich aus der Spanne: kurze Spannen zeigen Tage, mittlere Wochen, lange Monate. Wer eine feinere Auflösung braucht, engt den Zeitraum über den Filter ein. Wiederkehrende Ereignisse stehen an ihrem **nächsten Vorkommen** und tragen das Zeichen ↻, damit die Achse nicht bis ins Ursprungsjahr zurückreicht. Neben dem Namen zeigen ★ einen erreichten Meilenstein und ⛓ die Zahl der Verknüpfungen. Einträge ohne gültigen Zeitpunkt erscheinen nur in der Tabelle. Balken lassen sich nicht ziehen; Zeitpunkte ändert die Tabellen-Ansicht.

## Aggregation über Frontmatter

Statt eigener Datenzeilen kann der Block die Ereignisse **aus den Dateien des Bereichs** einsammeln: eine `query:`-Direktive kennzeichnet die Aggregation, Datenzeilen sind dann nicht erlaubt. Grundmenge sind alle Bereichs-Dateien, deren Zuordnungs-Feld das Profil `Ereignis` nennt; die Ereignis-Daten stammen aus deren Frontmatter-Feldern (`event-date`, `event-text`, …).

````markdown
```perspective-events
query: WHERE event-category = 'geburtstag'
```
````

Der Abfrage-Text nutzt die Klausel-Sprache der [Perspective-Abfrage](frontmatter-query.md) (`FROM`, `WHERE`, Vergleiche, Funktionen); eine leere Abfrage sammelt alle Dateien mit Ereignis-Profil. Text-Werte stehen in Quotes (`'geburtstag'`) — ein nacktes Wort wäre eine Feld-Referenz.

- **Zeilen-Klick** öffnet die Quell-Datei; die Herkunft jedes Eintrags bleibt sichtbar.
- **Pflege schreibt zurück**: Bearbeitungen in der aggregierten Tabelle landen im Frontmatter der Quell-Datei, auch wenn sie nicht geöffnet ist. Ist die Quell-Datei mit ungespeicherten Änderungen geöffnet, verweist ein Hinweis dorthin; wurde sie zwischenzeitlich auf der Platte geändert, wird nichts geschrieben (Konflikt-Hinweis).
- **Grenzen**: Anlegen und Löschen gibt es in der Aggregation nicht — neue Ereignis-Dateien entstehen als reguläre Dokumente mit Ereignis-Profil. Die Aggregation braucht einen geöffneten Bereich mit Index.

## Verknüpfungen

Ereignisse lassen sich als **Vorgänger und Nachfolger** verketten — im Block über automatisch vergebene Kennungen (Zelle 7 bis 9), in der Aggregation über die Listen-Felder `event-predecessors`/`event-successors` mit Datei-Verweisen. Beide Seiten werden immer gemeinsam gepflegt.

- Der **Verknüpfungs-Indikator** in der Zeitpunkt-Spalte öffnet ein Popup mit den Bezügen: Sprung zum verknüpften Eintrag bzw. Öffnen der verknüpften Datei, im editierbaren Kontext dazu Suche und Vorgänger-/Nachfolger-Umschalter.
- Kennungen entstehen erst mit der ersten Verknüpfung; Duplizieren übernimmt keine Verknüpfungen, Löschen bereinigt beide Seiten.
- Verknüpfungen verbinden nur Einträge derselben Welt — Block-Einträge untereinander oder Dateien untereinander, nicht über die Grenze hinweg.
- Verwaiste Verweise (Ziel gelöscht oder umbenannt) erscheinen als weicher Hinweis mit Löse-Knopf.

## Export

Der Portable-Export wandelt eingebettete Ereignis-Blöcke in statische Tabellen mit fertigen Texten in der Export-Sprache (die Zeitdifferenz-Spalte rechnet zum Export-Zeitpunkt); Aggregations-Blöcke bleiben als Code-Block erhalten, weil ihr Inhalt vom Bereich abhängt.
