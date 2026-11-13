# Workflows

Ein **Workflow** schreibt wiederkehrende Handgriffe als feste Folge von Schritten auf: Dateien und Ordner anlegen, umbenennen, verschieben, kopieren und in den Papierkorb legen, Text anhängen oder einfügen, Eigenschaften und Schlagwörter im Dateikopf setzen, Aufgaben abhaken, Kommandos, Makros und andere Workflows ausführen. Bedingungen und Wiederholungen bestimmen, welche Schritte laufen und für welche Dateien; ein Skript-Schritt rechnet einen Wert aus, ohne etwas zu schreiben. Datenbank-Befehle legen Datensätze an, ändern und löschen sie, schreiben das Ergebnis einer Abfrage in eine Datei, öffnen Masken und prüfen die Konsistenz. Ein Workflow ist eine **gewöhnliche Markdown-Datei**; was er tut, steht in einem Block fester Befehle, eine Zeile je Schritt. Die Datei bleibt damit ohne die Anwendung lesbar, lässt sich weitergeben und wie jedes andere Dokument bearbeiten.

Gestartet wird ein Workflow **von Hand**: aus dem Menü, der Kommando-Palette, über ein Tastenkürzel, einen Knopf über dem Block oder das Kontextmenü des Bereichs-Panels. Ein Workflow mit Zeitplan läuft außerdem **nach Zeitplan**, ein Workflow mit Ereignis **bei einem Ereignis** im Bereich, etwa einer neuen Datei in einem Ordner, jeweils sobald er scharf geschaltet ist. **Bevor der erste Schritt läuft, prüft die Anwendung den ganzen Workflow**; ein Fehler steht mit Zeile und Grund über dem Block, und es läuft nichts.

## Die Erweiterung „Workflows"

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Workflows", Gruppe **Werkzeuge**) und ist im Arbeitsmodus **Voll** eingeschaltet, in den Modi **Einsteiger** und **Fortgeschritten** aus. Ist sie abgeschaltet, ist ein `workflow`-Block ein gewöhnlicher Code-Block ohne Hervorhebung, Prüf-Anzeige und Knöpfe; es gibt keine Kommandos der Workflows, kein Untermenü **Workflows**, keine Seite **Workflow-Läufe**, kein Statusleisten-Element **Workflows**, keine Einstellungs-Abschnitte **Workflows**, keinen Lauf nach Zeitplan und keinen Lauf bei Ereignissen. Eine Workflow-Datei ist dann ein gewöhnliches Dokument. Verloren geht nichts: Dateien, Lauf-Stände samt Scharf-Zustand und die Festlegung des Workflow-Ordners sind nach dem Einschalten unverändert da.

## Aufbau einer Workflow-Datei

Eine Datei ist ein Workflow, wenn ihr Dateikopf das Kennzeichen `workflow: true` trägt. Was der Workflow tut, steht in **genau einem** Code-Block mit der Kennung `workflow`. Der übrige Text ist die Beschreibung für Menschen; seine Abschnitte können als Quelle eines Inhalts dienen (Abschnitt „Quellen eines Inhalts" unten).

````markdown
---
workflow: true
name: Wochenrückblick
description: Legt den Rückblick der Woche an und trägt ihn im Protokoll ein.
---

# Wochenrückblick

```workflow
# Rückblick aus der Vorlage anlegen und öffnen
create "Rückblicke/{{date}} Woche.md" from-template "Rückblick.md"
open "Rückblicke/{{date}} Woche.md"
insert "Protokoll.md" under "Rückblicke" from-section "Eintrag"
notify "Rückblick angelegt"
```

## Eintrag

- Wochenrückblick angelegt.
````

Der Dateikopf trägt Kennzeichen, Namen, Auslöser, Beschreibung und, je nach Auslöser, den Zeitplan oder das Ereignis:

| Schlüssel | Pflicht | Bedeutung |
| --- | --- | --- |
| `workflow` | ja | `true` kennzeichnet die Datei als Workflow. |
| `name` | nein | Name des Workflows in Menü, Kommando-Palette und Hinweisen; ohne Angabe gilt der Dateiname ohne Endung. |
| `trigger` | nein | Auslöser: `manual` für den Start von Hand, `schedule` für den Lauf nach Zeitplan, `event` für den Lauf bei einem Ereignis; ohne Angabe gilt `manual`. |
| `schedule` | bei `trigger: schedule` | Zeitplan in einer Zeile, etwa `every weekday at 08:00` (Abschnitt „Zeitplan und Scharf-Schaltung"). |
| `missed` | nein | Umgang mit verpassten Läufen: `run-once` holt einmal nach, `skip` lässt verfallen; ohne Angabe gilt `run-once`. |
| `event` | bei `trigger: event` | Ereignis in einer Zeile, etwa `file-created in "Eingang"` (Abschnitt „Ereignisse"). |
| `description` | nein | Kurzbeschreibung; die Seite **Workflow-Läufe** zeigt sie als Tooltip am Namen. |

Ein anderer Auslöser als `manual`, `schedule` oder `event` wird als „noch nicht unterstützt" angezeigt, und der Workflow läuft nicht; die Datei bleibt dabei unverändert. Trägt eine Datei zwei oder mehr `workflow`-Blöcke oder keinen, läuft sie ebenfalls nicht. Ein Block, der nur Kommentare enthält, ist gültig und tut nichts.

## Befehls-Zeilen

Die Zeilen des Blocks folgen einer festen Form:

- **Eine Zeile ist ein Befehl.** Leere Zeilen und Zeilen, die mit `#` beginnen, sind Kommentare. Einen Kommentar hinter einem Befehl gibt es nicht, ebenso wenig eine Fortsetzung über mehrere Zeilen.
- **Zuerst das Schlüsselwort, dann die Angaben**, getrennt durch Leerzeichen. Die Schlüsselwörter sind englisch und klein geschrieben: `create`, nicht `Create`.
- **Pfade und Texte** stehen in geraden doppelten Anführungszeichen. Ein Anführungszeichen im Text schreibt sich `\"`; jeder andere Rückstrich bleibt stehen, wie er ist. Typografische Anführungszeichen, wie sie eine Textverarbeitung beim Kopieren einsetzt, gelten als Fehler.
- **Zahlen und Kommando-Kennungen** stehen ohne Anführungszeichen: `wait 2`, `command view.modeSplit`.
- **Benannte Optionen** sind ein Wortpaar aus Option und Wert, etwa `from-template "Tag.md"` oder `under "Protokoll"`, oder ein einzelnes Wort wie `at-start`. Sie folgen den übrigen Angaben in beliebiger Reihenfolge, je Art höchstens eine.
- **Pfade** sind relativ zur Wurzel des Bereichs, in dem der Workflow gestartet wird; Trennzeichen ist der Schrägstrich `/`. Ein absoluter Pfad und ein Pfad mit `..` sind nicht erlaubt. Der Pfad hinter `from-template` nennt eine Vorlage und ist relativ zum [Vorlagen-Ordner](templates.md).

```workflow
# Kommentar: Ordner für ein neues Projekt anlegen
mkdir "Projekte/{{prompt:Projektname?}}/Notizen"
replace "{{file}}" "Status: offen" "Status: \"in Arbeit\""
insert "{{file}}" at-start from-file "Bausteine/Kopf.md"
```

## Prüfen vor dem Laufen

Vor dem ersten Schritt prüft die Anwendung die ganze Datei, dazu jeden Workflow, den sie aufruft. Gemeldet werden unter anderem:

- unbekannte Befehle und Befehle einer späteren Ausbaustufe,
- fehlende, überzählige und falsch geschriebene Angaben, unbekannte oder doppelte Optionen,
- Pfade außerhalb des Bereichs, leere Pfade und Texte, ungültige neue Namen,
- eine Wartezeit über zehn Sekunden,
- unbekannte Kommandos, Makros und Workflows sowie Namen, die mehrere Makros oder Workflows tragen,
- ein Workflow, der sich selbst aufruft, auch auf dem Umweg über einen anderen, und eine Verschachtelung über fünf Ebenen,
- fehlerhafte Platzhalter, nicht lesbare Vorlagen und ausgeschaltete Vorlagen,
- ein nicht lesbarer Zeitplan, eine fehlende oder unerlaubte Uhrzeit, `schedule` ohne `trigger: schedule` und umgekehrt sowie ein unbekannter Wert bei `missed`,
- eine nicht lesbare Ereignis-Zeile, ein unbekanntes Ereignis, ein Ordner außerhalb des Bereichs, ein ungültiges Muster, `event` ohne `trigger: event` und umgekehrt, mehr als eine Zeile `event` und ein Platzhalter, den das Ereignis nicht liefert,
- ein fehlendes oder überzähliges `end`, ein `else` ohne Bedingung oder ein zweites `else`, Blöcke über drei Ebenen, eine Schleife in einer Schleife, ein ungültiges Muster bei `for-each` und `{{item}}` außerhalb einer Schleife,
- beim Skript-Schritt ein fehlender, mehrfacher oder skriptloser Abschnitt, ein ungültiger oder doppelter Name, ein Ergebnis, das erst eine spätere Zeile liefert, und ausgeschaltete Skript-Blöcke.

Ein Befund hält den Lauf **vor dem ersten Schritt** an; eine fehlerhafte Workflow-Datei läuft damit gar nicht statt teilweise. Die Prüfung meldet alle Befunde zugleich; die Zeilen-Angabe ist die Zeile im Dokument, wie sie der Editor zählt, mit dem Dateikopf. Eine Ausnahme bildet der Befund „Nur von Hand" (Abschnitte „Zeitplan und Scharf-Schaltung" und „Ereignisse"): Er verhindert allein die Scharf-Schaltung, der Start von Hand bleibt möglich.

Was erst ein früherer Schritt herstellen kann, prüft die Anwendung beim Schritt selbst: ob eine Datei, ein Abschnitt oder eine Überschrift vorhanden ist. Fehlt sie dann, schlägt der Schritt fehl.

## Befehle

Die Befehle, nach ihrem Gegenstand geordnet. Die Pfade sind relativ zur Bereichs-Wurzel.

### Dateien und Ordner

| Befehl | Bedeutung | Angaben | Beispiel |
| --- | --- | --- | --- |
| `create` | anlegen: Datei leer oder mit Inhalt anlegen | Pfad; wahlweise eine Quelle | `create "Journal/{{date}}.md" from-template "Tag.md"` |
| `rename` | umbenennen: Datei oder Ordner umbenennen | Pfad, neuer Name | `rename "Entwurf.md" "Notiz {{date}}.md"` |
| `move` | verschieben: Datei oder Ordner in einen Ordner verschieben; Verweise werden nachgezogen | Pfad, Ziel-Ordner | `move "{{file}}" "Archiv/2026"` |
| `copy` | kopieren: Datei kopieren | Pfad, Ziel | `copy "Muster/Checkliste.md" "Projekte/Neu/Checkliste.md"` |
| `mkdir` | Ordner anlegen, auch verschachtelt | Pfad | `mkdir "Projekte/Neu/Notizen"` |
| `open` | öffnen: Datei im Fenster öffnen oder zu ihr wechseln | Pfad | `open "Journal/{{date}}.md"` |
| `close` | schließen: geöffnetes Dokument schließen | Pfad | `close "{{file}}"` |

- **Vorhandenes Ziel:** Gibt es das Ziel von `create`, `copy`, `rename` oder `move` schon, schlägt der Schritt fehl; nichts wird überschrieben.
- **Fehlender Ziel-Ordner:** `create`, `copy` und `move` legen ihn innerhalb des Bereichs an.
- **Verschieben und Umbenennen** gehen denselben Weg wie im Bereichs-Panel: Verweise auf die Datei werden nachgezogen, Unterseiten und die Begleitdatei ziehen mit.
- `mkdir` auf einen vorhandenen Ordner und `close` auf ein nicht geöffnetes Dokument gelingen, ohne etwas zu ändern. `close` auf ein ungespeichertes Dokument zeigt die gewohnte Speicher-Rückfrage; „Abbrechen" beendet den Lauf an dieser Zeile.

### Inhalt und Dateikopf

| Befehl | Bedeutung | Angaben | Beispiel |
| --- | --- | --- | --- |
| `append` | anhängen: Inhalt an das Ende einer Datei setzen | Pfad, Quelle | `append "{{file}}" from-section "Offene Punkte"` |
| `insert` | einfügen: Inhalt unter einer Überschrift oder am Anfang einfügen | Pfad, Stelle (`under "Überschrift"` oder `at-start`), Quelle | `insert "{{file}}" under "Protokoll" from-section "Eintrag"` |
| `replace` | ersetzen: jedes Vorkommen eines Texts ersetzen | Pfad, Suchtext, Ersatz | `replace "{{file}}" "PROJEKT" "{{prompt:Projektname?}}"` |
| `set-property` | Eigenschaft im Dateikopf setzen oder ändern | Pfad, Name, Wert | `set-property "{{file}}" status "erledigt"` |
| `remove-property` | Eigenschaft aus dem Dateikopf entfernen | Pfad, Name | `remove-property "{{file}}" entwurf` |

- `insert … under` fügt direkt unter der Überschrift ein, vor ihrem bisherigen Inhalt; `insert … at-start` fügt am Anfang des Texts ein, hinter dem Dateikopf. Fehlt die Überschrift oder kommt sie mehrfach vor, schlägt der Schritt fehl.
- `replace` ersetzt wie „Alle ersetzen" im Editor jedes Vorkommen; findet er keines, schlägt der Schritt fehl.
- `set-property` und `remove-property` lassen die übrigen Eigenschaften in ihrer Reihenfolge stehen. `remove-property` auf eine Eigenschaft, die es nicht gibt, gelingt ohne Änderung.
- **Geöffnete Dateien:** Ist die Ziel-Datei in einem Fenster geöffnet und ungespeichert, geht die Änderung in dieses Fenster und erscheint dort als Änderung im Editor; ungespeicherte Arbeit bleibt erhalten. Sonst wird die Datei direkt geschrieben.

### Anwendung und Ablauf

| Befehl | Bedeutung | Angaben | Beispiel |
| --- | --- | --- | --- |
| `command` | Kommando: ein Kommando der Anwendung ausführen | Kommando-Kennung | `command view.modeSplit` |
| `macro` | Makro: ein Makro aus den Einstellungen ausführen | Name des Makros | `macro "Tagesstart"` |
| `workflow` | Workflow: einen anderen Workflow des Workflow-Ordners ausführen | Name des Workflows | `workflow "Ordner anlegen"` |
| `wait` | warten: Pause in Sekunden, höchstens 10 | Zahl | `wait 2` |
| `notify` | Hinweis: Text als Hinweis zeigen | Text | `notify "Wochenrückblick angelegt"` |
| `stop` | anhalten: den Lauf mit einem Text beenden | Text | `stop "Nichts zu tun"` |

- `command` nimmt die feste Kennung eines Kommandos, etwa `view.modeSplit`, `view.modeLive` oder `file.save`, und führt es im startenden Fenster aus. Ist es im Augenblick nicht ausführbar, schlägt der Schritt fehl. Makros und Workflows laufen nicht über `command`, sondern über ihre eigenen Befehle.
- `macro` und `workflow` dürfen höchstens fünf Ebenen tief verschachtelt sein. Ein aufgerufener Workflow kehrt nach seinem letzten Schritt zurück; schlägt in ihm ein Schritt fehl, endet der ganze Lauf.
- `notify` zeigt seinen Text in der Statusleiste, bei einem Lauf nach Zeitplan oder durch ein Ereignis zusätzlich als Benachrichtigung des Betriebssystems (Abschnitt „Ablauf eines Laufs").
- `stop` beendet den ganzen Lauf, auch aus einem aufgerufenen Workflow; die Statusleiste zeigt „Workflow ‹Name› beendet in Zeile N: Text".

### Pflege-Befehle

| Befehl | Bedeutung | Angaben | Beispiel |
| --- | --- | --- | --- |
| `delete` | löschen: Datei oder Ordner in den Papierkorb legen | Pfad | `delete "Entwürfe/Alt.md"` |
| `add-tag` | Schlagwort setzen: in die Liste `tags` des Dateikopfs aufnehmen | Pfad, Schlagwort | `add-tag "{{file}}" "erledigt"` |
| `remove-tag` | Schlagwort entfernen: aus der Liste `tags` des Dateikopfs nehmen | Pfad, Schlagwort | `remove-tag "{{file}}" "entwurf"` |
| `complete-task` | Aufgabe abhaken: die erste offene Aufgabe mit dem Suchtext | Pfad, Suchtext | `complete-task "Projekte/Plan.md" "Angebot senden"` |
| `confirm` | Rückfrage: eine Frage mit „Ja" und „Nein" stellen | Frage | `confirm "Alle Entwürfe archivieren?"` |

- **`delete`** legt das Ziel in den Papierkorb, wie das Löschen im Bereichs-Panel; ein Ordner geht als Ganzes. Mit einer Datei gehen ihre Begleitdatei (`.mdd`) samt Lauf-Stand und ihre Änderungsbelege (`.mddl`). Die Wurzel des Bereichs lässt sich nicht löschen. Zurückgeholt wird ein gelöschtes Ziel aus dem Papierkorb.
- **Eine Bestätigung je Lauf:** Enthält ein Lauf `delete`, nennt vor dem ersten Schritt **eine** Bestätigung alle Ziele des Laufs mit Pfad, auch die der aufgerufenen Workflows; „Nein" lässt keinen Schritt laufen, und der Lauf gilt als abgebrochene Eingabe. Ist ein Ziel in diesem Fenster geöffnet, wird es vor dem Schritt geschlossen; bei ungespeicherten Änderungen erscheint die gewohnte Speicher-Rückfrage, und „Abbrechen" beendet den Lauf an dieser Zeile.
- **`add-tag` und `remove-tag`** ändern allein die Liste `tags` im Dateikopf; ein schon vorhandenes beziehungsweise fehlendes Schlagwort ist kein Fehler. Ein führendes `#` wird weggelassen, und Groß- und Kleinschreibung zählt beim Vergleich nicht; ein leeres Schlagwort oder eines mit Leerzeichen ist ungültig. Entfernt `remove-tag` das letzte Schlagwort, bleibt die leere Liste `tags: []` stehen. Schlagwörter im Text (`#schlagwort`) bleiben unberührt; dafür gibt es `replace`.
- **`complete-task`** sucht unter den offenen Aufgaben der Datei, denselben, die die [Aufgaben-Abfrage](tasks.md) zeigt, die erste, deren Text den Suchtext enthält, mit Groß- und Kleinschreibung. Er hakt sie ab wie ein Klick in der Aufgaben-Abfrage, samt Erledigt-Datum nach den Einstellungen der Aufgaben. Findet er keine, schlägt der Schritt fehl.
- **`confirm`** zeigt die Frage mit „Ja" und „Nein". „Ja" setzt den Lauf fort; „Nein" beendet ihn ohne Fehlschlag, und die Statusleiste zeigt „Workflow ‹Name› beendet in Zeile N: «Frage» mit Nein beantwortet".
- **Geöffnete Dateien:** Auf eine in einem Fenster geöffnete, ungespeicherte Datei wirken `add-tag`, `remove-tag` und `complete-task` wie die Befehle für Inhalt über dieses Fenster.
- `delete` und `confirm` brauchen jemanden, der zusieht: In einem Workflow mit `trigger: schedule` oder `trigger: event` sind sie der Befund „Nur von Hand".

### Bedingungen, Wiederholungen und Skript

Diese Befehle öffnen einen **Block**, den eine Zeile `end` schließt; die Schritte dazwischen laufen nur, wenn die Bedingung zutrifft, oder einmal je Datei. `script` ist ein einzelner Schritt. Einzelheiten in den Abschnitten „Bedingungen und Wiederholungen" und „Skript-Schritt".

| Befehl | Bedeutung | Angaben | Beispiel |
| --- | --- | --- | --- |
| `if-exists` | wenn vorhanden: Block nur, wenn die Datei oder der Ordner vorhanden ist | Pfad | `if-exists "Protokoll.md"` |
| `if-missing` | wenn fehlend: Block nur, wenn die Datei oder der Ordner fehlt | Pfad | `if-missing "Journal/{{date}}.md"` |
| `if-property` | wenn Eigenschaft: Block nur, wenn die Eigenschaft im Dateikopf den Wert hat oder, ohne Wert, gesetzt ist | Pfad, Name, wahlweise Wert | `if-property "{{file}}" status "offen"` |
| `if-script` | wenn Skript: Block nur, wenn das Skript eines Abschnitts zutrifft | Überschrift | `if-script "Zählung"` |
| `else` | sonst: leitet den Teil ein, der gilt, wenn die Bedingung nicht zutrifft | keine | `else` |
| `end` | Ende: schließt den Block einer Bedingung oder Schleife | keine | `end` |
| `for-each` | für jede: Block einmal je Datei, die zum Muster passt | Ordner mit Datei-Muster | `for-each "Eingang/*.md"` |
| `script` | Skript: den Skript-Block eines Abschnitts ausführen und sein Ergebnis benennen | Überschrift, `as "Name"` | `script "Zählung" as "anzahl"` |

### Datenbank

Diese Befehle arbeiten mit den Datensätzen der [Datenbank](database.md) des Bereichs. Einzelheiten im Abschnitt „Datenbank-Befehle".

| Befehl | Bedeutung | Angaben | Beispiel |
| --- | --- | --- | --- |
| `db-create` | Datensatz anlegen | Tabelle, Paare `feld="Wert"`, wahlweise `as "Name"` | `db-create "Library" title="The Invincible" author="Stanisław Lem" pages="186"` |
| `db-update` | Datensatz ändern | Tabelle, Datensatz, Paare `feld="Wert"` | `db-update "Library" "Solaris" loanNote="verliehen"` |
| `db-delete` | Datensatz löschen | Tabelle, Datensatz | `db-delete "Library" "r-00024"` |
| `db-query` | Abfrage in eine Datei: das Ergebnis einer Abfrage-Datei als Tabelle schreiben | Abfrage-Datei, `into "Ziel"`, wahlweise `under "Überschrift"` | `db-query "Long Books.md" into "Leseliste.md" under "Lange Bücher"` |
| `db-for-each` | für jeden Datensatz: Block einmal je Datensatz einer Abfrage-Datei | Abfrage-Datei | `db-for-each "Long Books.md"` |
| `db-open` | Maske öffnen: einen Datensatz in seiner Standard-Maske zeigen oder ohne Datensatz eine Neuanlage beginnen | Tabelle, wahlweise Datensatz | `db-open "Library" "Solaris"` |
| `db-open-list` | Listen-Maske öffnen: eine Abfrage-Datei öffnen | Abfrage-Datei | `db-open-list "Loans List.md"` |
| `db-check` | Konsistenz prüfen: alle Tabellen oder eine | wahlweise Tabelle | `db-check "Library"` |

### Quellen eines Inhalts

`create`, `append` und `insert` nehmen ihren Inhalt aus einer von drei Quellen. Ein Inhalt steht nie als Fließtext in der Befehls-Zeile.

| Option | Inhalt |
| --- | --- |
| `from-template "Pfad"` | eine Vorlage aus dem Vorlagen-Ordner, gefüllt wie beim Anwenden einer Vorlage; ihre Eingabe-Dialoge erscheinen vor dem ersten Schritt |
| `from-file "Pfad"` | der Inhalt einer anderen Datei des Bereichs, wörtlich, so wie er beim Schritt vorliegt |
| `from-section "Überschrift"` | der Inhalt eines Abschnitts der Workflow-Datei selbst, wörtlich |

Ein Abschnitt ist der Text unter seiner Überschrift bis zur nächsten Überschrift gleichen oder höheren Rangs, ohne die Überschrift selbst; Unter-Abschnitte gehören dazu. Gefunden wird er wie bei einem Verweis `[[Datei#Überschrift]]`. `from-file` und `from-section` kopieren wörtlich: Platzhalter darin bleiben stehen. Nur eine Vorlage wird gefüllt. Ist die Erweiterung „Vorlagen" abgeschaltet, meldet die Prüfung bei `from-template` „Vorlagen sind ausgeschaltet"; Workflows ohne Vorlagen laufen weiter.

## Platzhalter

Platzhalter gelten in jeder Angabe einer Befehls-Zeile. Vorlagen und Workflows teilen denselben Satz; die Schreibweise mit Offset und Format beschreibt die Seite [Vorlagen](templates.md).

| Platzhalter | Wert in einer Befehls-Zeile |
| --- | --- |
| `{{date}}`, `{{time}}` | Datum und Uhrzeit des Starts, auch mit Offset und Format: `{{date:+7d:dd.MM.yyyy}}` |
| `{{file}}` | Pfad des beim Start aktiven Dokuments, relativ zur Bereichs-Wurzel, etwa `Projekte/Plan.md`; bei einem Lauf durch ein Ereignis die Datei des Ereignisses (Abschnitt „Ereignisse") |
| `{{title}}` | Titel des beim Start aktiven Dokuments |
| `{{folder}}` | Ordner des beim Start aktiven Dokuments, relativ zur Bereichs-Wurzel |
| `{{area}}` | Name des Bereichs |
| `{{clipboard}}` | Text der Zwischenablage beim Start; bei einem Lauf nach Zeitplan oder durch ein Ereignis der Inhalt, der gerade in der Zwischenablage liegt |
| `{{prompt:Frage}}`, `{{prompt:Frage:Vorgabe}}` | Eingabe-Dialog |
| `{{select:Frage:a,b,c}}` | Auswahl-Dialog |
| `{{from}}` | bei `file-moved` der bisherige Pfad der Datei |
| `{{task}}` | bei `task-done` der Text der erledigten Aufgabe |
| `{{item}}`, `{{item:name}}` | in einer Schleife `for-each` der Pfad der jeweiligen Datei und ihr Name ohne Endung |
| `{{script:name}}` | das Ergebnis des Skript-Schritts `script … as "name"` |
| `{{record:feld}}`, `{{record:id}}`, `{{record:table}}`, `{{record:file}}` | in einer Schleife `db-for-each` ein Feld des jeweiligen Datensatzes, seine Kennung, seine Tabelle und seine Datei (Abschnitt „Datenbank-Befehle") |
| `{{created:name}}` | die Kennung des Datensatzes, den `db-create … as "name"` angelegt hat |
| `{{db:Tabelle:Datensatz:Feld}}` | der Wert eines Felds aus der Datenbank, gelesen beim Schritt selbst |

- **Alle Dialoge vor dem ersten Schritt:** Die Eingabe- und Auswahl-Dialoge des ganzen Laufs erscheinen nacheinander, bevor etwas geschieht, die der eingesetzten Vorlagen und der aufgerufenen Workflows eingeschlossen. Eine gleiche Frage wird einmal gestellt und gilt überall. Wer einen Dialog abbricht, bricht den Lauf ab, und kein Schritt läuft.
- **Ein Zeitpunkt je Lauf:** `{{date}}` und `{{time}}` haben in allen Zeilen denselben Wert, auch über Mitternacht. Ebenso wird die Zwischenablage einmal zum Start gelesen, und `{{clipboard}}` hat in allen Zeilen denselben Inhalt.
- **In einer eingesetzten Vorlage** meinen `{{title}}` und `{{folder}}` wie gewohnt die neue Datei, `{{file}}` und `{{area}}` dagegen das aktive Dokument und den Bereich.
- **Nach Zeitplan und bei Ereignissen** gibt es niemanden, der einen Dialog beantwortet: Eingabe- und Auswahl-Platzhalter sind in einem Workflow mit `trigger: schedule` oder `trigger: event` der Befund „Nur von Hand".
- `{{item}}`, `{{item:name}}`, `{{script:name}}`, `{{record:…}}`, `{{created:…}}` und `{{db:…}}` erhalten ihren Wert erst im Lauf; im Namen eines Workflows oder Makros, im Pfad einer Vorlage und im Ziel von `delete` sind sie deshalb ein Befund.
- `{{record:…}}`, `{{created:…}}` und `{{db:…}}` gelten nur in Befehls-Zeilen. In einer Vorlage, auch in einer, die ein Workflow einsetzt, bleiben sie als Text stehen.
- `{{cursor}}` ist in einer Befehls-Zeile nicht erlaubt. `\{{` schreibt ein wörtliches `{{`.
- Bleibt `{{folder}}` im Wurzel-Ordner leer, entsteht aus `"{{folder}}/Neu.md"` der Pfad `Neu.md`. Ohne aktives Dokument ist `{{file}}` leer, und ein Pfad daraus ist ein Befund.

## Einen Workflow starten

Ein Workflow startet nur in einem geöffneten Bereich, und seine Pfade gelten in diesem Bereich, auch wenn die Datei aus dem anwendungsweiten Workflow-Ordner oder aus einem verknüpften Bereich kommt. Die Wege von Hand:

| Weg | Wirkung |
| --- | --- |
| **Datei → Workflows** | jeder Workflow des Workflow-Ordners als Eintrag, Unterordner als Untermenüs |
| **Kommando-Palette** (Standard `Strg+K`) | jeder Workflow des Workflow-Ordners als Kommando unter seinem Namen |
| **Statusleiste und Kontextmenü** | das Kommando eines Workflows, platziert über die [Kommando-Platzierung](command-placement.md) |
| **Tastenkürzel** | unter „Einstellungen → Tastenkürzel" für das Kommando eines Workflows vergeben |
| **Knopf „Starten" über dem Block** | in der Live-Ansicht, der gerenderten Ansicht und der geteilten Ansicht rechts in der Kopfzeile des Blocks; startet jede Workflow-Datei, auch außerhalb des Workflow-Ordners, mit dem Stand im Editor |
| **„Starten" im Bereichs-Panel** | zuoberst im Kontextmenü jeder Workflow-Datei des Bereichs |
| **Seite „Workflow-Läufe"** | Knopf „Starten" in der Zeile jedes Workflows |

Der Knopf über dem Block ist gesperrt, solange die Prüfung einen Befund meldet. Bei einem noch nie gespeicherten Dokument zeigt er „Zuerst speichern", außerhalb eines Bereichs „Nur in einem geöffneten Bereich startbar". Ein scharf geschalteter Workflow läuft zusätzlich von selbst nach seinem Zeitplan oder bei seinem Ereignis; der Start von Hand bleibt daneben jederzeit möglich.

Das Kommando eines Workflows erhält seine Kennung aus dem Pfad der Datei im Workflow-Ordner; zwei gleichnamige Workflows in verschiedenen Unterordnern bleiben so unterscheidbar. **Wer einen Workflow in der Anwendung umbenennt oder innerhalb des Workflow-Ordners verschiebt, behält seine Belegungen:** Ein Tastenkürzel, ein Platz in Statusleiste, Kontextmenü oder Format-Toolbar und ein Makro-Schritt, der ihn aufruft, ziehen mit. **Außerhalb der Anwendung**, etwa im Dateimanager, bemerkt die Anwendung die Umbenennung nicht; die Belegungen verlieren dann ihr Ziel und sind neu zu vergeben. Wird ein Workflow aus dem Workflow-Ordner hinaus verschoben, ist er kein Kommando mehr; seine Belegungen bleiben gespeichert und wirken wieder, sobald er an denselben Ort zurückkehrt.

## Ablauf eines Laufs

1. Die Anwendung prüft den Workflow samt den Workflows, die er aufruft.
2. Die Dialoge aller Platzhalter erscheinen nacheinander; enthält der Lauf `delete` oder `db-delete`, folgt die eine Bestätigung der Lösch-Ziele.
3. Die Schritte laufen strikt nacheinander; jeder wartet auf den vorigen. Bedingungen und Schleifen bestimmen, welche Schritte laufen und wie oft.
4. Der erste Fehlschlag beendet den Lauf. Die Statusleiste zeigt „Workflow ‹Name› abgebrochen in Zeile N: Grund".

Ausgeführte Schritte bleiben ausgeführt; eine Rücknahme eines Laufs gibt es nicht (Abschnitt „Was ein Lauf getan hat"). **Je Fenster läuft höchstens ein Workflow**; ein zweiter Start während eines Laufs wird mit einem Hinweis abgewiesen.

**Meldungen:** Bei einem Start von Hand zeigt `notify` seinen Text in der Statusleiste. Bei einem Lauf nach Zeitplan, auch einem nachgeholten, und bei einem Lauf durch ein Ereignis geht der Text zusätzlich als **Benachrichtigung des Betriebssystems** hinaus, mit dem Namen des Workflows als Titel; ebenso der Abbruch eines solchen Laufs mit Zeile und Grund, auch wenn der Workflow kein `notify` enthält. Die Benachrichtigung erscheint nur, wenn kein Fenster der Anwendung im Vordergrund ist, und je Meldung einmal; sonst genügt der Hinweis in der Statusleiste. Ob und wie das Betriebssystem sie zeigt, regeln seine eigenen Mitteilungs-Einstellungen.

## Bedingungen und Wiederholungen

Eine **Bedingung** lässt Schritte nur laufen, wenn etwas zutrifft; eine **Schleife** wiederholt Schritte für jede Datei eines Ordners. Beide öffnen einen Block, den eine Zeile `end` schließt:

```workflow
# Tagesnotiz nur anlegen, wenn sie fehlt
if-missing "Journal/{{date}}.md"
  create "Journal/{{date}}.md"
else
  notify "Die Tagesnotiz gibt es schon"
end
open "Journal/{{date}}.md"
```

### Bedingungen

- `if-exists "Pfad"` trifft zu, wenn die Datei oder der Ordner vorhanden ist, `if-missing "Pfad"`, wenn sie fehlen.
- `if-property "Pfad" name "Wert"` trifft zu, wenn die Eigenschaft im Dateikopf genau diesen Wert hat; Zahlen und Wahrheitswerte vergleichen mit ihrer Schreibweise. Bei einer **Liste** wie `tags` trifft sie zu, wenn die Liste den Wert enthält. Ohne Wert (`if-property "Pfad" name`) trifft sie zu, wenn die Eigenschaft gesetzt und nicht leer ist, bei einer Liste, wenn sie nicht leer ist. Eine Datei ohne Dateikopf trifft nicht zu; fehlt die Datei, schlägt der Schritt fehl.
- `if-script "Abschnitt"` trifft zu, wenn das Skript des Abschnitts zutrifft (Abschnitt „Skript-Schritt").
- Geprüft wird beim Erreichen der Zeile, mit dem Stand, den die vorigen Schritte hinterlassen haben; eine geöffnete, ungespeicherte Datei zählt mit ihrem Stand im Editor.

### Die Block-Form

- `else` leitet wahlweise den Teil ein, der gilt, wenn die Bedingung nicht zutrifft; je Bedingung gibt es höchstens ein `else`, eine Schleife kennt keines.
- `end` schließt den zuletzt geöffneten Block. `else` und `end` stehen je auf einer eigenen Zeile.
- **Einrückung** ist erlaubt und wird empfohlen, damit der Block lesbar bleibt; eine Bedeutung trägt sie nicht.
- Blöcke lassen sich bis zu **drei Ebenen** tief verschachteln, die Schleife mitgezählt.
- Ein fehlendes oder überzähliges `end`, ein `else` ohne Bedingung und eine zu tiefe Verschachtelung meldet die Prüfung vor dem ersten Schritt mit Zeile.

### Schleife über die Dateien eines Ordners

`for-each "Ordner/Muster"` wiederholt die Schritte bis `end` für jede Datei, die zum Muster passt. `{{item}}` ist dabei der Pfad der jeweiligen Datei, relativ zur Bereichs-Wurzel, `{{item:name}}` ihr Name ohne Endung:

```workflow
# Erledigte Notizen aus dem Eingang ins Archiv legen
for-each "Eingang/*.md"
  if-property "{{item}}" status "erledigt"
    add-tag "{{item}}" "archiv"
    move "{{item}}" "Archiv"
  end
end
```

- **Muster:** zuerst der Ordner, dann ein Muster des Datei-Namens mit `*` für beliebig viele und `?` für genau ein Zeichen, etwa `Eingang/*.md`. Ein `**` vor dem Datei-Muster nimmt die Unterordner hinzu (`Projekte/**/*.md`), ein `**` am Ende meint alle Dateien samt Unterordnern (`Eingang/**`). Groß- und Kleinschreibung zählt nicht; Platzhalter-Zeichen im Ordner-Teil sind ein Befund.
- **Feste Liste:** Die Dateien werden beim Eintritt in die Schleife festgestellt und alphabetisch abgearbeitet, Zahlen wie im Dateimanager (`2` vor `10`). Dateien, die der Lauf in der Schleife anlegt, kommen nicht hinzu. Dateien und Ordner, deren Name mit einem Punkt beginnt, zählen nicht mit.
- **Grenze:** höchstens **500 Dateien**. Bei mehr schlägt der Schritt vor der ersten Wiederholung fehl, mit „Mehr als 500 Dateien; keine Datei wurde bearbeitet". Ein fehlender Ordner ist ebenfalls ein Fehlschlag.
- Schleifen lassen sich nicht ineinander verschachteln; eine Bedingung in der Schleife ist erlaubt.
- `{{item}}` und `{{item:name}}` gelten nur innerhalb einer Schleife. Eingabe-Dialoge in der Schleife erscheinen einmal vor dem ersten Schritt, und die Antwort gilt für jede Datei.

## Skript-Schritt

Ein **Skript-Schritt** führt einen [Skript-Block](scripts.md) der Workflow-Datei aus und nutzt sein Ergebnis in den folgenden Zeilen oder als Bedingung. Das Skript rechnet und prüft; schreiben kann es nicht. Das Beispiel zählt die Dateien im Ordner „Aufgaben" mit `status: offen`:

````markdown
```workflow
script "Zählung" as "offen"
if-script "Zählung"
  notify "Offene Dateien im Ordner Aufgaben: {{script:offen}}"
else
  notify "Nichts offen"
end
```

## Zählung

```perspective-script
return pq.pages('Aufgaben').filter(function (p) { return p.status === 'offen'; }).length;
```
````

- **`script "Abschnitt" as "name"`** führt den ersten Skript-Block (`perspective-script`) unter der Überschrift „Abschnitt" der Workflow-Datei aus; gefunden wird der Abschnitt wie bei `from-section`. Sein **Ergebnis** steht danach als `{{script:name}}` in jeder folgenden Zeile: der Rückgabe-Wert des Skripts (ein Text, eine Zahl oder ein Wahrheitswert), sonst der Text seiner Ausgabe ohne Leerraum am Rand. Der Name besteht aus Buchstaben, Ziffern, `_` und `-`; Groß- und Kleinschreibung zählt nicht, und jeder Name wird nur einmal vergeben.
- **`if-script "Abschnitt"`** öffnet einen Block wie die übrigen Bedingungen. Er trifft zu, wenn das Skript `true`, einen nicht leeren Text oder eine Zahl ungleich null liefert; `false`, ein leerer Text, `0` und kein Wert treffen nicht zu.
- **Dieselbe Sandbox wie die Skript-Blöcke:** Das Skript liest die Daten des Bereichs über die pq-Schnittstelle, mit der Workflow-Datei als eigenem Dokument (`pq.current()`), und hat keinen Zugriff auf Dateien, Netz und Anwendung. Es ist **rein lesend**. Nach **5 Sekunden** wird es abgebrochen. Ein Fehler oder ein Abbruch ist ein Fehlschlag des Schritts und beendet den Lauf mit „Skript fehlgeschlagen" oder „Skript nach 5 Sekunden abgebrochen".
- **Einstellung „Skript-Blöcke ausführen":** Der Skript-Schritt folgt derselben Einstellung wie die Skript-Blöcke (**Einstellungen → Verhalten**, Vorgabe aus). Ist sie aus, meldet die Prüfung „Skript-Blöcke sind ausgeschaltet" mit Zeile; der Workflow läuft nicht und lässt sich nicht scharf schalten. Unmittelbar vor jedem Skript fragt die Anwendung die Einstellung erneut ab.
- Den Abschnitt sucht die Prüfung vor dem ersten Schritt: Fehlt er, gibt es ihn mehrfach oder enthält er keinen Skript-Block, ist das ein Befund. Ein `{{script:name}}` vor dem Schritt, der es liefert, ist ebenfalls ein Befund; ist der liefernde Schritt in einem Zweig nicht gelaufen, schlägt die Zeile fehl.

## Datenbank-Befehle

Mit den Datenbank-Befehlen arbeitet ein Workflow mit den Datensätzen der [Datenbank](database.md) des Bereichs: Er legt Datensätze an, ändert und löscht sie, schreibt das Ergebnis einer Abfrage-Datei als Tabelle in eine Datei, wiederholt Schritte für jeden Datensatz einer Abfrage, liest einzelne Feldwerte, öffnet Masken und prüft die Konsistenz. Das Beispiel trägt bei jedem langen Buch eine Ausleih-Notiz ein, schreibt die Liste der langen Bücher in eine Notiz und prüft danach die Tabelle:

````markdown
```workflow
db-for-each "Long Books.md"
  db-update "Library" "{{record:id}}" loanNote="lang: {{record:pages}} Seiten"
end
db-query "Long Books.md" into "Leseliste.md" under "Lange Bücher"
db-check "Library"
```
````

Die Datenbank-Befehle setzen die Erweiterung „Datenbank" voraus. Ist sie abgeschaltet, meldet die Prüfung bei jedem dieser Befehle „Datenbank ist ausgeschaltet", und der Workflow läuft nicht.

### Tabelle, Datensatz und Werte

- **Die Tabelle** steht als Name, wie bei `FROM` in einer Abfrage, oder als Pfad ihrer Datei: `"Library"` oder `"Library.md"`. Heißen zwei Tabellen gleich, meldet die Prüfung „Tabelle uneindeutig"; dann hilft der Pfad.
- **Der Datensatz** wird gefunden wie in einem Verweis: zuerst als Kennung, `r-00042` oder `r-42`, sonst über seine Anzeige-Form, etwa `"Solaris"`. Tragen mehrere Datensätze diese Anzeige-Form, schlägt der Schritt mit „uneindeutig" fehl und nimmt nie den ersten; findet sich keiner, mit „nicht gefunden".
- **Werte** stehen als Paare `feld="Wert"` und sind immer Text, auch eine Zahl wie `pages="224"`. Ob ein Wert zu seinem Feld passt, prüft die Datenbank beim Schreiben wie in der Maske.
- **Die Prüfung vor dem Lauf** kennt Tabellen und Felder: Eine unbekannte Tabelle, ein Feld, das die Tabelle nicht hat, und ein Feld, das in einer Zeile zweimal steht, sind ein Befund mit Zeile. Steht in der Angabe ein Platzhalter, prüft die Anwendung nach dem Füllen.

### Datensätze anlegen, ändern und löschen

- `db-create` legt einen Datensatz an, `db-update` ändert die genannten Felder eines Datensatzes, `db-delete` löscht einen. Beide ersten brauchen mindestens ein Paar.
- **Derselbe Weg wie die Maske:** Jeder Befehl schreibt mit allen Regeln der Tabelle, also Prüfregeln, Pflichtwerten, Schlüssel, Lösch-Schutz und Berechtigungen. Weist die Datenbank ab, schlägt der Schritt mit dem Satz fehl, den auch die Maske zeigt.
- **Frisch gelesen:** `db-update` und `db-delete` lesen den Datensatz unmittelbar vor dem Schreiben. Ändert ihn jemand anderes dazwischen, schlägt der Schritt fehl. Bearbeitet gerade jemand den Datensatz in einer Maske, schlägt der Schritt sofort fehl, ohne zu warten.
- **Die neue Kennung:** Nach `db-create "Library" title="The Invincible" as "neu"` steht die Kennung des angelegten Datensatzes in jeder folgenden Zeile als `{{created:neu}}` bereit, etwa in `db-open "Library" "{{created:neu}}"`. Der Name besteht aus Buchstaben, Ziffern, `_` und `-`; Groß- und Kleinschreibung zählt nicht, und jeder Name wird nur einmal vergeben. Ein `{{created:…}}` vor seiner Anlage ist ein Befund; ist die Anlage in einem Zweig nicht gelaufen, schlägt die Zeile fehl.
- In einer Tabelle in **Kartei-Form** legt `db-create` eine Karteikarte an; ihr Name ist der Wert des Schlüssels. Auch dort gilt die Pflicht-Angabe: Fehlt der Wert eines Pflichtfelds, schlägt der Schritt wie in Tabellen-Form mit Grund fehl, und es entsteht nichts.
- **Vor dem Löschen** fragt die Anwendung vor dem ersten Schritt einmal nach und nennt, was gelöscht wird; „Nein" lässt keinen Schritt laufen. Steht ein Ziel erst im Lauf fest, sagt die Bestätigung in Worten, was gelöscht wird, etwa „Den in diesem Lauf angelegten Datensatz der Tabelle 'Library'"; in einer Schleife über Datensätze nennt sie Abfrage, Tabelle und die Grenze von 500.
- **Ein Datensatz, auf den noch verwiesen wird,** lässt sich wie in der Maske nicht löschen.

### Abfrage in eine Datei

`db-query "Long Books.md" into "Leseliste.md" under "Lange Bücher"` führt eine [Abfrage-Datei](database.md) aus und schreibt ihr Ergebnis als feste Tabelle in eine Datei.

- **Die Quelle** ist eine Abfrage-Datei mit der Marke `db-query` und genau einem Abfrage-Block. Sie läuft wie in ihrer Lese-Ansicht, Angaben wie `this.minpages` eingeschlossen. Ist die Datei keine Abfrage-Datei, meldet die Prüfung „keine Abfrage-Datei", ist ihre Abfrage fehlerhaft, „Abfrage fehlerhaft".
- **Die Tabelle** trägt die Beschriftungen der Spalten als Kopfzeile und die Werte so, wie die Abfrage-Ansicht sie zeigt; ein Datensatz wird zu einem Verweis mit seiner Anzeige-Form als Text, etwa `[[Library#^r-00003|Solaris]]`, sodass die Notiz den Titel zeigt wie die Abfrage-Ansicht. Ohne Treffer steht eine Tabelle ohne Zeilen da, darunter der Satz, den auch die Abfrage-Ansicht zeigt.
- **Mit `under`** ersetzt die Tabelle den Inhalt dieses Abschnitts, die Überschrift bleibt; fehlt sie oder kommt sie mehrfach vor, schlägt der Schritt fehl wie bei `insert`. Ein zweiter Lauf ersetzt die Tabelle, statt eine zweite anzuhängen. **Ohne `under`** legt der Schritt die Datei neu an und schlägt fehl, wenn es sie schon gibt, wie bei `create`. Wer sammeln will, schreibt in eine datierte Datei: `into "Berichte/{{date}}.md"`.
- Datensätze, die ein früherer Schritt desselben Laufs geschrieben hat, stehen schon im Ergebnis.

### Schleife über Datensätze

`db-for-each` wiederholt die Schritte bis `end` für jeden Datensatz, den eine Abfrage-Datei liefert, in der Form der Schleife `for-each`:

````markdown
```workflow
db-for-each "Long Books.md"
  db-update "Library" "{{record:id}}" loanNote="lang: {{record:pages}} Seiten"
end
```
````

| Platzhalter | Wert je Wiederholung |
| --- | --- |
| `{{record:feld}}` | der Wert des Felds im jeweiligen Datensatz, etwa `{{record:pages}}` |
| `{{record:id}}` | die Kennung des Datensatzes |
| `{{record:table}}` | die Tabelle, in der er steht |
| `{{record:file}}` | die Datei, in der er steht: in der Kartei-Form seine Karteikarte, sonst die Tabellen-Datei |

- **Die Abfrage muss Datensätze liefern:** eine Abfrage `TABLE RECORDS`, nicht gruppiert. Sonst meldet die Prüfung „Abfrage liefert keine Datensätze".
- **Feste Liste:** Die Liste steht beim Eintritt in die Schleife fest und wird in der Reihenfolge der Abfrage abgearbeitet; jeder Datensatz genau einmal. Datensätze, die der Lauf in der Schleife anlegt, kommen nicht hinzu.
- **Frisch gelesen:** Ein Datensatz wird zu Beginn seiner Wiederholung gelesen und vor jedem weiteren Schritt, der eines seiner Felder nennt, erneut; so sieht ein Schritt, was ein früherer derselben Wiederholung geschrieben hat. Ist der Datensatz bis dahin verschwunden, endet der Lauf an dieser Zeile mit „nicht gefunden".
- **Grenzen:** Höchstens **500 Datensätze**; sind es mehr, schlägt der Schritt vor der ersten Wiederholung fehl, und kein Datensatz ist bearbeitet. Eine leere Menge ergibt keine Wiederholung und ist kein Fehlschlag. Keine Schleife in einer Schleife, gleich welcher Art; eine Bedingung in der Schleife ist erlaubt.
- `{{record:…}}` außerhalb einer Schleife über Datensätze ist ein Befund. Schlägt ein Schritt in der Schleife fehl, endet der Lauf; die schon bearbeiteten Datensätze bleiben bearbeitet.

### Feldwert als Platzhalter

`{{db:Library:Solaris:pages}}` liest das Feld `pages` des Datensatzes „Solaris" der Tabelle „Library", etwa in `notify "Seiten: {{db:Library:Solaris:pages}}"`.

- Die drei Angaben sind Tabelle, Datensatz und Feld; der Datensatz wird gefunden wie oben, als Kennung oder über seine Anzeige-Form.
- **Gelesen wird beim Schritt selbst**, nicht vor dem Lauf; so gilt ein Wert, den ein früherer Schritt desselben Laufs geschrieben hat.
- **Fehlschlag statt leer:** Findet sich der Datensatz nicht, ist er uneindeutig oder kennt die Tabelle das Feld nicht, schlägt der Schritt mit Grund fehl. Ein leerer Feldwert eines gefundenen Datensatzes ist ein leerer Text.
- Die Prüfung meldet vorab einen Platzhalter ohne genau drei Angaben, eine unbekannte Tabelle und ein unbekanntes Feld; den Datensatz sucht sie nicht, weil er erst zum Zeitpunkt des Schritts gilt.

### Masken öffnen und Konsistenz prüfen

- **`db-open "Library" "Solaris"`** zeigt den Datensatz in der Standard-Maske seiner Tabelle. **`db-open "Library"`** ohne Datensatz beginnt eine Neuanlage wie „Neuer Datensatz" und verlangt das Recht, in der Tabelle anzulegen; fehlt es, schlägt der Schritt mit Rolle und Tabelle fehl. In einer Tabelle in Kartei-Form gibt es diese Neuanlage nicht, und der Schritt schlägt mit Grund fehl; eine neue Karteikarte legt „Neue Karteikarte" in der Übersicht der Datenbank oder `db-create` an.
- Hat die Maske eine ungespeicherte Bearbeitung, fragt sie nach, bevor sie wechselt, und der Schritt wartet ohne Zeitgrenze auf die Antwort. „Verwerfen" öffnet das Ziel, und der Lauf geht weiter. „Weiter bearbeiten" lässt die Bearbeitung unverändert und beendet den Lauf an dieser Zeile mit Grund; ebenso endet er, wenn die Rückfrage ohne Antwort geschlossen wird, etwa mit dem Reiter der Maske.
- **`db-open-list "Loans List.md"`** öffnet eine Abfrage-Datei wie `open`; eine [Listen-Maske](database.md) zeigt dort ihr Gitter. Ist die Datei keine Abfrage-Datei, meldet die Prüfung „keine Abfrage-Datei".
- **`db-check`** prüft alle Tabellen, **`db-check "Library"`** eine, mit derselben Prüfung wie „Konsistenz prüfen" in der Übersicht der Datenbank. Das Ergebnis erscheint wie bei `notify`, etwa „Konsistenz: 3 Befunde in ‹Library›" oder „Konsistenz: keine Befunde"; ohne genannte Tabelle nennt es die Tabellen mit Befunden. **Ein Befund hält den Lauf nicht an**; wer danach nicht weitermachen will, setzt `db-check` an das Ende. Schlägt die Prüfung selbst fehl, ist das ein Fehlschlag des Schritts. Die Befunde im Einzelnen zeigt „Konsistenz prüfen" in der Übersicht der Datenbank. `db-check` schreibt nichts.

### Ohne Zuschauer, Abbruch und Spur

**Ein Workflow schreibt in die Datenbank mit Ihren Rechten; nach Zeitplan und bei Ereignissen legt er an und ändert, löscht aber nie.**

| Befehl | von Hand | nach Zeitplan und bei Ereignissen |
| --- | --- | --- |
| `db-create`, `db-update` | ja | ja |
| `db-delete` | ja, nach der Bestätigung | Befund „Nur von Hand" |
| `db-query`, `db-for-each`, `{{db:…}}` | ja | ja |
| `db-open` | ja | Befund „Nur von Hand" |
| `db-open-list`, `db-check` | ja | ja |

- **Bricht ein Workflow ab, bleiben die Datensätze, die er schon geschrieben hat.** Jeder Datenbank-Befehl, der Datensätze schreibt, ist ein eigener Speichervorgang, der ganz oder gar nicht wirkt; eine Rücknahme des Laufs gibt es nicht.
- **Spur im Journal:** Auf der Seite „Workflow-Läufe" nennt das Journal je Datenbank-Schritt Tabelle, Datensatz und Vorgangs-Kennung, etwa „Zeile 2: db-update – Tabelle Library, Datensatz r-00007, Vorgang 12". Dieselbe Vorgangs-Kennung tragen die [Änderungsbelege](database.md) dieses Schritts.
- **Keine Ereignisse:** Was ein Workflow in die Datenbank schreibt, löst kein Ereignis aus, weder an der Tabellen-Datei noch an einer Karteikarte.

## Zeitplan und Scharf-Schaltung

Ein Workflow mit `trigger: schedule` und einer Zeile `schedule` läuft von selbst zu den Terminen seines Zeitplans, sobald er **scharf geschaltet** ist:

```yaml
---
workflow: true
name: Tagesnotiz
trigger: schedule
schedule: every weekday at 08:00
missed: skip
---
```

### Die Zeitplan-Zeile

Der Zeitplan ist eine Zeile in englischen Wörtern, nach dem Muster der [wiederkehrenden Aufgaben](tasks.md):

| Form | Bedeutung | Beispiel |
| --- | --- | --- |
| `every N minutes` | alle N Minuten | `every 30 minutes` |
| `every N hours` | alle N Stunden | `every 2 hours` |
| `every day at HH:MM`, `every N days at HH:MM` | täglich oder alle N Tage zur Uhrzeit | `every day at 08:00` |
| `every weekday at HH:MM` | montags bis freitags zur Uhrzeit | `every weekday at 07:30` |
| `every <Wochentage> at HH:MM` | an den genannten Wochentagen | `every monday, thursday at 18:00` |
| `every N weeks on <Wochentage> at HH:MM` | jede N-te Woche an den Wochentagen | `every 2 weeks on monday at 08:00` |
| `every N months on the <Tag> at HH:MM` | jeden N-ten Monat am genannten Tag | `every month on the 1st at 09:00` |
| `every month on the last at HH:MM` | am letzten Tag des Monats | `every month on the last at 17:00` |

- **Uhrzeit:** `at HH:MM` ist Pflicht bei Tagen, Wochentagen, Wochen und Monaten und bei Minuten und Stunden nicht erlaubt; die Uhrzeit hat genau die Form `08:00`.
- **Schreibweise:** Ohne Zahl gilt `1` (`every day`, `every week`, `every month`); Einzahl und Mehrzahl gelten gleich. Wochentage stehen englisch (`monday` bis `sunday`), getrennt durch Komma oder `and`. Den Monatstag schreibt man `1st`, `2nd`, `3rd`, `15th` oder als bloße Zahl. Groß- und Kleinschreibung zählt nicht.
- **Zählung:** Ein Abstand wie `every 30 minutes` oder `every 2 weeks` zählt ab dem Ende des letzten Laufs, vor dem ersten Lauf ab der Scharf-Schaltung, nicht an einem festen Raster der Uhr.
- Eine Datei trägt genau eine Zeile `schedule`. Ein Fehler darin ist ein Befund mit Zeile im Dateikopf, etwa „Zeitplan nicht lesbar" oder „'at' fehlt".

### Auslegung

- **Lokale Uhrzeit:** Die Uhrzeit ist die Uhrzeit des Rechners, wie bei Erinnerungen und Weckern. `08:00` bleibt `08:00` über die Zeitumstellung hinweg; fällt eine Uhrzeit beim Vorstellen der Uhr aus, etwa `02:30`, läuft der Workflow zur nächsten vorhandenen Minute.
- **Woche:** Die Woche beginnt am Montag.
- **Monatsende:** `last` ist der letzte Tag des Monats. Ein Tag, den ein Monat nicht hat, etwa `31st` im April, wird in diesem Monat übersprungen; wer das Monatsende meint, schreibt `last`.

### Wann ein Workflow nach Zeitplan läuft

**Ein Workflow nach Zeitplan läuft, solange die Anwendung und sein Bereich geöffnet sind.** Es gibt keinen Hintergrund-Dienst, und die Anwendung startet sich nicht selbst. Sie sieht alle 30 Sekunden nach, ob ein Workflow fällig ist; ein Lauf beginnt deshalb bis zu einer halben Minute nach seinem Termin.

- Ein fälliger Workflow läuft in genau einem Fenster seines Bereichs, auch wenn der Bereich in mehreren Fenstern geöffnet ist. Läuft gerade ein anderer Workflow, wartet der fällige, bis ein Fenster des Bereichs frei ist.
- Nach jedem Lauf rechnet die Anwendung den nächsten Termin; die Seite **Workflow-Läufe** zeigt ihn in der Spalte **Nächster Lauf**.
- Ein Lauf nach Zeitplan läuft ohne Zuschauer und stellt keine Fragen. Eingabe- und Auswahl-Platzhalter, `confirm` und `delete` sind deshalb in einem Workflow mit `trigger: schedule` der Befund **„Nur von Hand"**: Er lässt sich nicht scharf schalten, von Hand aber weiter starten, und die Dialoge erscheinen dann wie gewohnt. Verlangt erst eine eingesetzte Vorlage oder ein aufgerufener Workflow eine Eingabe, bricht der Lauf nach Zeitplan vor dem ersten Schritt mit diesem Befund ab.

### Verpasste Läufe

Verpasst ist ein Termin, der fiel, während die Anwendung oder der Bereich geschlossen war oder der Rechner ruhte. Was dann geschieht, sagt das Feld `missed`:

- **`run-once`** (Vorgabe): Der Workflow läuft beim Öffnen des Bereichs **einmal** nach, auch wenn mehrere Termine verpasst sind. Die Statusleiste meldet „Workflow ‹Name› nachgeholt", und die Seite **Workflow-Läufe** zeigt hinter dem letzten Lauf „(nachgeholt)".
- **`skip`**: Der verpasste Termin verfällt, und der Workflow wartet auf den nächsten. Die Seite zeigt „verfallen:" mit dem verfallenen Termin.

### Scharf schalten

Ein Workflow mit `trigger: schedule` oder `trigger: event` ist nach dem Anlegen, Kopieren oder Hereinkommen **nicht scharf**; er läuft von selbst erst, wenn der Anwender ihn scharf schaltet. Der Scharf-Zustand liegt im Lauf-Stand der Begleitdatei und reist beim Kopieren nicht mit. Geschaltet wird an drei Orten, die alle nur bei `trigger: schedule` und `trigger: event` erscheinen:

- **Seite „Workflow-Läufe"**: das Kästchen in der Spalte **Scharf**,
- **über dem Block**: der Knopf „Scharf" neben „Starten", gedrückt „✓ Scharf",
- **Bereichs-Panel**: im Kontextmenü der Workflow-Datei „Scharf schalten" oder „Entschärfen".

Das Scharf-Schalten prüft den Workflow wie vor dem Laufen. Bei einem Befund wird es abgewiesen, und die Statusleiste zeigt „Nicht scharf geschaltet:" mit Grund und Zeile; sonst meldet sie „Workflow ‹Name› scharf, nächster Lauf" mit dem Termin. Entschärfen ist jederzeit möglich, auch bei einem Befund.

**Geänderte Definition:** Ändert sich nach der Scharf-Schaltung der `workflow`-Block, eine der Zeilen `trigger`, `schedule`, `missed` und `event` oder ein Skript-Block, den ein Skript-Schritt ausführt, auch ungespeichert im Editor, gilt der Workflow als „nicht scharf: Definition geändert" und läuft nicht mehr von selbst, bis er erneut scharf geschaltet ist. Name und Beschreibung zu ändern hat keine Wirkung. So läuft nie ein geänderter Inhalt ohne Zuschauer, den niemand freigegeben hat.

### Das Statusleisten-Element „Workflows"

Solange mindestens ein Workflow des Bereichs scharf ist, steht im rechten Teil der Statusleiste das Element **Workflows**. Es zeigt den jüngsten Lauf nach Zeitplan oder durch ein Ereignis mit Ergebnis-Zeichen, Name und Uhrzeit, etwa „✓ Tagesnotiz 08:00"; ein Lauf eines früheren Tages trägt dazu Tag und Monat. Die Zeichen sind `✓` für erfolgreich, `✗` für abgebrochen, `■` für beendet und `–` für eine abgebrochene Eingabe; ein Abbruch erscheint in der Farbe des Fehler-Hinweises. Ohne einen solchen Lauf steht dort „Workflows". Der Tooltip nennt Datum, Uhrzeit und Ergebnis, ein Klick öffnet die Seite **Workflow-Läufe**. Bei schmaler Statusleiste klappt das Element mit den übrigen Elementen ein.

## Ereignisse

Ein Workflow mit `trigger: event` und einer Zeile `event` läuft von selbst, wenn im Bereich sein **Ereignis** eintritt, sobald er scharf geschaltet ist. So entsteht etwa eine **Ordner-Regel**: Jede Notiz, die im Ordner „Eingang" ankommt, bekommt ein Schlagwort, gleich ob sie in der Anwendung angelegt, im Dateimanager hineingelegt oder von einer Synchronisation gebracht wird.

````markdown
---
workflow: true
name: Eingang verschlagworten
trigger: event
event: file-created in "Eingang" matching "*.md"
---

```workflow
add-tag "{{file}}" "eingang"
notify "Neu im Eingang: {{file}}"
```
````

### Die Ereignis-Zeile

Die Zeile hat die Form `event: <Ereignis> [in "<Ordner oder Datei>"] [matching "<Muster>"]`:

| Ereignis | tritt ein, wenn … | `{{file}}` ist … | Beispiel |
| --- | --- | --- | --- |
| `file-created` | eine Datei im Bereich angelegt wird, auch von außen | die neue Datei | `event: file-created in "Eingang"` |
| `file-changed` | eine Datei geändert wird, auch von außen; das Speichern in der Anwendung eingeschlossen | die geänderte Datei | `event: file-changed in "Projekte" matching "*.md"` |
| `file-moved` | eine Datei in der Anwendung umbenannt oder verschoben wird | der neue Pfad; der bisherige ist `{{from}}` | `event: file-moved in "Archiv"` |
| `task-done` | eine Aufgabe auf erledigt gesetzt wird | die Datei der Aufgabe; ihr Text ist `{{task}}` | `event: task-done in "Wochenplan.md"` |
| `area-opened` | der Bereich geöffnet und eingelesen ist | (keine Datei) | `event: area-opened` |
| `reminder-due` | eine Erinnerung des Bereichs fällig wird | die Datei der Erinnerung | `event: reminder-due` |

- **`in`** grenzt auf einen Ordner samt Unterordnern oder auf eine einzelne Datei ein, relativ zur Bereichs-Wurzel; ein Ordner `Eingang` trifft nie einen Ordner, dessen Name nur mit diesem Namen beginnt, wie `Eingangskorb`. **`matching`** grenzt auf ein Muster des Datei-Namens ein, mit `*` und `?`, ohne Ordner. Beides ist wahlweise; `in` steht vor `matching`, die Werte stehen in geraden Anführungszeichen, und Groß- und Kleinschreibung zählt nicht. Bei `file-moved` gilt der neue Ort.
- Bei `area-opened` und `reminder-due` sind `in` und `matching` nicht erlaubt.
- **Genau eine Zeile `event` je Datei.** Wer auf mehrere Ereignisse antworten will, schreibt je Ereignis einen kleinen Workflow, der einen gemeinsamen mit `workflow "Name"` aufruft.
- **Verschieben:** Ein Verschieben im Dateimanager erscheint als `file-created` am neuen Ort; `file-moved` kennt allein die Anwendung, weil nur sie weiß, woher eine Datei kam.
- **Aufgabe erledigt** heißt: Eine Aufgaben-Zeile wechselt auf einen Status der Art „erledigt", gleich ob per Klick auf das Kästchen, in der [Aufgaben-Abfrage](tasks.md), durch ein getipptes `x` oder durch eine Änderung von außen. Ein Klick oder ein getipptes `x` löst kurz danach aus, auch vor dem Speichern; das Speichern danach löst nicht ein zweites Mal aus. Eine abgebrochene Aufgabe ist nicht erledigt. `{{task}}` ist der Text der Aufgabe ohne Kästchen, Datumsangaben und Priorität.

### Was ein Lauf bei einem Ereignis darf

- Ein Lauf durch ein Ereignis läuft wie ein Lauf nach Zeitplan **ohne Zuschauer**: Eingabe- und Auswahl-Platzhalter, `confirm`, `delete`, `db-delete` und `db-open` sind der Befund „Nur von Hand". **Gelöscht wird bei Ereignissen nie.**
- `{{file}}`, `{{from}}` und `{{task}}` tragen die Werte des Ereignisses (Tafel oben). Einen Platzhalter, den das Ereignis nicht liefert, meldet die Prüfung: `{{file}}` bei `area-opened`, `{{from}}` außer bei `file-moved`, `{{task}}` außer bei `task-done`.

### Wann Ereignisse wirken

**Ereignisse wirken, solange die Anwendung und der Bereich in einem Fenster geöffnet sind, und werden nicht nachgeholt.** Was geschah, während der Bereich geschlossen war, löst beim Öffnen nichts aus; wer beim Öffnen aufräumen will, schreibt einen Workflow mit `area-opened` und `for-each`.

- **Entprellung:** Meldungen derselben Datei innerhalb von **2 Sekunden** ergeben ein Ereignis; ein Speichern, das mehrere Meldungen erzeugt, startet einen Workflow so nur einmal. Eine Datei, die fortlaufend beschrieben wird, löst spätestens nach 10 Sekunden aus.
- **Was nie auslöst:** Begleitdateien (`.mdd`, `.mddl`), der Sperr-Ordner sowie Dateien und Ordner, deren Name mit einem Punkt beginnt.
- **Reihenfolge:** Passt ein Ereignis auf mehrere scharfe Workflows, läuft jeder einmal, nacheinander in der Reihenfolge ihrer Pfade. Je Bereich läuft ein Lauf durch ein Ereignis nach dem anderen, in der Reihenfolge der Ereignisse und in genau einem Fenster; läuft dort gerade ein Workflow, wartet das Ereignis. Beim Schließen des Bereichs verfallen wartende Ereignisse.
- `area-opened` tritt je Öffnen einmal ein, auch für einen Bereich, den die Anwendung beim Start wieder öffnet. `reminder-due` tritt ein, wenn die Erinnerung zu ihrer Zeit fällig wird; Erinnerungen, die beim Öffnen des Bereichs nachgereicht werden, lösen nichts aus.

### Keine Ketten

**Ein Workflow reagiert auf das, was Sie oder andere Programme tun, nie auf das, was ein Workflow tut.** Was ein Lauf anlegt, ändert, verschiebt oder abhakt, auch ein Datensatz, den er in die Datenbank schreibt, löst kein Ereignis aus; ein Workflow, der bei einer neuen Datei in „Eingang" selbst eine Datei in „Eingang" anlegt, läuft deshalb nicht im Kreis. Wer eine Folge will, ruft den zweiten Workflow ausdrücklich mit `workflow "Name"` auf. Schreibt ein Schritt in ein geöffnetes, ungespeichertes Dokument, ist erst Ihr Speichern eine Änderung der Datei und löst `file-changed` aus; eine Aufgabe, die ein solcher Schritt im Dokument abhakt, löst `task-done` aus.

**Not-Bremse:** Läuft derselbe Workflow durch Ereignisse mehr als **20-mal in 5 Minuten**, etwa weil ein anderes Programm auf seine Änderungen antwortet, startet der 21. Lauf nicht mehr. Der Workflow wird entschärft, wartende Ereignisse für ihn verfallen, und die Statusleiste meldet „Workflow ‹Name› entschärft: mehr als 20 Läufe durch Ereignisse in 5 Minuten", ohne Fenster im Vordergrund zusätzlich als Benachrichtigung des Betriebssystems. Die Seite **Workflow-Läufe** zeigt unter dem Kästchen „nicht scharf: Not-Bremse" und den Grund in der Spalte **Ergebnis**. Nach erneutem Scharf-Schalten zählt die Bremse von vorn.

### Scharf schalten und Anzeige

Ein Workflow mit `trigger: event` wird an denselben drei Orten scharf geschaltet wie einer nach Zeitplan (Abschnitt „Scharf schalten"); zur Definition gehört dabei die Zeile `event`. Nach dem Scharf-Schalten meldet die Statusleiste etwa „Workflow ‹Name› scharf, läuft bei neuer Datei in ‹Eingang›". Auf der Seite **Workflow-Läufe** zeigt die Spalte **Nächster Lauf** das Ereignis in Worten, etwa „bei neuer Datei in ‹Eingang›", und die Spalte **Letzter Lauf** die Herkunft, etwa „Ereignis: neue Datei ‹Eingang/Scan.md›". `notify` und ein Abbruch gehen wie beim Zeitplan auch als Benachrichtigung des Betriebssystems hinaus, und das Statusleisten-Element **Workflows** zeigt auch den jüngsten Lauf durch ein Ereignis.

## Workflow-Ordner und Menü

Wie bei den Vorlagen gibt es einen **Workflow-Ordner**, festgelegt auf zwei Ebenen unter „Datei → Einstellungen…":

- **Anwendungsweit** im Abschnitt **Erweiterungen (intern) → Workflows**.
- **Je Bereich** im Abschnitt **Aktueller Bereich → Workflows** mit dem Schalter „Bereichs-Konfiguration verwenden" und der Schaltfläche „Wählen…". Der Ordner wird relativ zur Bereichs-Wurzel in der Bereichsdatei gespeichert und **ersetzt** den anwendungsweiten vollständig.

Der anwendungsweite Workflow-Ordner reist mit der Einrichtungs-Datei, als Datenart „Workflow-Ordner" der Seite [Einstellungen exportieren und importieren](setup-exchange.md), und wirkt nach dem Einlesen sofort. Der Ordner je Bereich steht in der Bereichsdatei und reist mit dem Bereich.

Das Untermenü **Datei → Workflows** steht unmittelbar nach dem Untermenü **Bereich**. Es zeigt die Dateien des Ordners, die das Kennzeichen tragen, je Ebene alphabetisch nach Name; Unterordner erscheinen als Untermenüs, Dateien ohne Kennzeichen fehlen. Nach den eigenen folgen, je hinter einem Trennstrich, die Workflows verknüpfter Bereiche mit Zustimmung (Abschnitt unten). Nach einem weiteren Trennstrich folgen:

- **Workflow-Läufe anzeigen** — öffnet die Seite **Workflow-Läufe**.
- **Neuer Workflow …** — fragt nach dem Namen, legt im Workflow-Ordner eine Datei mit Dateikopf, Beschreibungs-Zeile und einem leeren `workflow`-Block mit zwei Kommentar-Zeilen an und öffnet sie. Ohne festgelegten Ordner fragt er zuerst nach dem Ordner und hält ihn fest, bei geöffnetem Bereich in dessen Einstellungen. Eine vorhandene Datei überschreibt er nie. Der Eintrag steht auch in der Kommando-Palette.
- **Workflow-Ordner festlegen …** — öffnet die Einstellungen beim Abschnitt **Workflows**.

Ohne festgelegten Ordner zeigt das Untermenü „Kein Workflow-Ordner festgelegt", bei einem leeren Ordner „Keine Workflows im Workflow-Ordner", bei einem nicht erreichbaren „Workflow-Ordner nicht gefunden". Das Untermenü und die Kommandos folgen jeder Änderung im Ordner.

## Workflows verknüpfter Bereiche

Wie die Vorlagen lassen sich die Workflows eines [verknüpften Bereichs](linking.md) zusätzlich zu den eigenen anbieten. Dafür trägt jede Verknüpfung unter **Einstellungen → Aktueller Bereich → Bereichs-Verknüpfungen** neben „Vorlagen" das Kästchen **Workflows**; es ist zunächst aus und unabhängig von dem der Vorlagen.

- **Wo sie erscheinen:** Die Workflows aus dem Workflow-Ordner, den der verknüpfte Bereich für sich festgelegt hat, erscheinen im Untermenü **Datei → Workflows** nach den eigenen, in der Kommando-Palette und auf der Seite **Workflow-Läufe**, jeweils als „Name (@Kürzel)" mit dem Kürzel der Verknüpfung. Neue Workflows der Quelle erscheinen ohne Neustart.
- **Wo sie wirken:** Ein solcher Workflow läuft im **eigenen** Bereich. Alle Pfade gelten in der eigenen Bereichs-Wurzel; aus dem verknüpften Bereich wird allein die Workflow-Datei selbst gelesen, samt ihrer Abschnitte für `from-section`. Ein Aufruf `workflow "Name"` sucht im eigenen Bereich.
- **Nur von Hand:** Ein Workflow eines verknüpften Bereichs lässt sich nicht scharf schalten. In den fremden Bereich schreibt die Anwendung keinen Lauf-Stand; die Seite zeigt an seiner Stelle „aus Bereich ‹Kürzel›", und einen gelungenen Lauf meldet die Statusleiste mit „Workflow ‹Name› aus Bereich ‹Kürzel› erfolgreich gelaufen".
- **Ohne Zugriff:** Ist der verknüpfte Bereich, seine Bereichsdatei oder sein Workflow-Ordner nicht lesbar, entfallen seine Workflows ohne Meldung. Mit abgeschalteten Bereichs-Verknüpfungen erscheinen keine fremden Workflows.

## Lauf-Stand und die Seite „Workflow-Läufe"

Nach jedem Lauf hält die Anwendung in der **Begleitdatei** des Workflows (`.mdd`, Abschnitt `workflow`) den Zeitpunkt, das Ergebnis, gegebenenfalls die abgebrochene Zeile, die Zahl der Läufe, die Herkunft des Laufs und das Journal des letzten Laufs fest, bei einem Workflow nach Zeitplan oder Ereignis dazu den Scharf-Zustand, beim Zeitplan den nächsten Termin und bei einem Lauf durch ein Ereignis das auslösende Ereignis mit seiner Datei; der Text der Workflow-Datei bleibt unberührt. Der Lauf-Stand reist beim Umbenennen und Verschieben mit, beim Kopieren nicht.

Die Seite **Workflow-Läufe** öffnet über „Ansicht → Workflow-Läufe anzeigen", über „Datei → Workflows → Workflow-Läufe anzeigen", über die Kommando-Palette und über einen Klick auf das Statusleisten-Element **Workflows**. Sie listet **alle Workflows des Bereichs**, auch die außerhalb des Workflow-Ordners, und danach die Workflows verknüpfter Bereiche mit Zustimmung, mit diesen Spalten und einem Knopf „Starten" je Zeile:

| Spalte | Inhalt |
| --- | --- |
| **Workflow**, **Ort** | Name mit der Beschreibung als Tooltip, Ordner der Datei |
| **Scharf** | Kästchen zum Scharf-Schalten, nur bei `trigger: schedule` und `trigger: event`; bei geänderter Definition dazu „nicht scharf: Definition geändert", nach einem Eingriff der Not-Bremse „nicht scharf: Not-Bremse" |
| **Nächster Lauf** | Termin des nächsten Laufs nach Zeitplan, bei einem Workflow mit Ereignis das Ereignis in Worten, jeweils solange der Workflow scharf ist |
| **Letzter Lauf** | Zeitpunkt des letzten Laufs, bei einem nachgeholten mit „(nachgeholt)", bei einem Lauf durch ein Ereignis mit Ereignis und Datei, darunter gegebenenfalls „verfallen:" mit Termin; dazu der Knopf „Journal (N)" |
| **Ergebnis** | Ergebnis des letzten Laufs, Tafel unten |
| **Läufe** | Zahl der Läufe |

Ein Workflow, der noch nie lief, steht mit „noch nie gelaufen".

| Ergebnis | Bedeutung |
| --- | --- |
| erfolgreich | alle Schritte sind gelaufen |
| abgebrochen in Zeile N: Grund | ein Befund oder Fehlschlag hat den Lauf beendet |
| beendet in Zeile N | der Befehl `stop` oder ein „Nein" bei `confirm` hat den Lauf beendet |
| Eingabe abgebrochen, kein Schritt ausgeführt | ein Dialog oder die Bestätigung der Lösch-Ziele wurde abgebrochen |

Nach einem Lauf in diesem Fenster zeigt die Seite denselben Grund wie die Statusleiste. Die Begleitdatei hält nur Zeile und Art des Grunds; nach einem Neustart und für einen Lauf aus einem anderen Fenster erscheinen einzelne Angaben wie ein Dateiname deshalb als „…". Die Seite zieht nach jedem Lauf und jeder Scharf-Schaltung nach; der Knopf „Aktualisieren" liest sie neu.

### Was ein Lauf getan hat

Der Knopf „Journal (N)" klappt unter der Zeile das **Journal** des letzten Laufs auf: jede Datei und jeden Ordner, die er angelegt, geändert, verschoben, kopiert oder gelöscht hat, als „Zeile N: Befehl – Pfad", der Pfad relativ zur Bereichs-Wurzel; ein Datenbank-Schritt steht als „Zeile N: Befehl – Tabelle, Datensatz, Vorgang" (Abschnitt „Datenbank-Befehle"). Hat der Lauf nichts berührt, steht dort „Keine Datei berührt"; bei sehr vielen berührten Dateien ist das Journal gekürzt und sagt das.

Eine Rücknahme eines ganzen Laufs gibt es nicht. Zurückgenommen wird gezielt, mit den Mitteln, die es ohnehin gibt: Inhalts-Änderungen über die [Dokument-Historie](history.md) der berührten Datei, Gelöschtes aus dem Papierkorb, Angelegtes, Verschobenes und Kopiertes im Bereichs-Panel.

## Unterstützung im Editor

- **Hervorhebung:** In den Befehls-Zeilen sind das Schlüsselwort fett, Text in Anführungszeichen farbig und Platzhalter kursiv hervorgehoben, im Editor wie in der Darstellung. Die Block-Wörter der Bedingungen und Schleifen, `else` und `end` sind im Editor zusätzlich gepunktet unterstrichen.
- **Prüf-Anzeige:** Die Live-Ansicht, die gerenderte Ansicht und die geteilte Ansicht zeigen über dem Block das Ergebnis der Prüfung: grün „bereit" oder rot „Zeile N: Grund", bei mehreren Befunden mit „(+N weitere)". Dort stehen auch die Hinweise auf mehrere Blöcke und auf einen noch nicht unterstützten Auslöser sowie die Befunde des Zeitplans mit ihrer Zeile im Dateikopf. Die Anzeige folgt dem Text kurz nach jeder Änderung und zeigt denselben Befund, den der Start meldet. Im Druck, im Export und bei einer eingebetteten Datei erscheint die Kopfzeile nicht.
- **Knopf „Scharf":** Bei `trigger: schedule` und `trigger: event` steht in der Kopfzeile neben „Starten" der Knopf zum Scharf-Schalten (Abschnitt „Zeitplan und Scharf-Schaltung").

Hervorhebung und Anzeige ändern den Text der Datei nicht.

## Grenzen

- **Nur im Bereich:** Kein Befehl liest oder schreibt außerhalb der Wurzel des Bereichs, in dem der Workflow gestartet wurde, auch nicht über einen Platzhalter; das gilt auch für einen Workflow aus einem verknüpften Bereich.
- **Kein Netz, keine Fremdprogramme.** Dateien löscht nur `delete`, Datensätze nur `db-delete`, beide nur bei einem Start von Hand und nach einer Bestätigung; Dateien gehen in den Papierkorb.
- **Kein Lauf ohne geöffneten Bereich:** Ein Workflow nach Zeitplan läuft nur, solange die Anwendung und sein Bereich geöffnet sind; verpasste Termine holt er nach den Regeln von `missed` nach. Ereignisse wirken ebenso nur bei geöffnetem Bereich und werden nicht nachgeholt.
- **Keine Ketten:** Ein Workflow reagiert auf das, was Sie oder andere Programme tun, nie auf das, was ein Workflow tut. Wer eine Folge will, ruft den nächsten Workflow mit `workflow "Name"` auf; gegen eine Schleife über andere Programme hält die Not-Bremse einen Workflow nach mehr als 20 Läufen durch Ereignisse in 5 Minuten an (Abschnitt „Ereignisse").
- **Grenzen der Blöcke:** höchstens drei Ebenen Verschachtelung, keine Schleife in einer Schleife und höchstens 500 Dateien oder Datensätze je Schleife.
- **Datenbank:** Ein Workflow schreibt in die Datenbank mit Ihren Rechten; nach Zeitplan und bei Ereignissen legt er an und ändert, löscht aber nie. Bricht ein Workflow ab, bleiben die Datensätze, die er schon geschrieben hat. Was ein Workflow in die Datenbank schreibt, löst kein Ereignis aus.
- **Keine Rücknahme eines Laufs:** Ausgeführte Schritte bleiben ausgeführt; das Journal zeigt, was der letzte Lauf berührt hat, und zurückgenommen wird gezielt.
- **Makros** bleiben, wie sie sind, und sind als Schritt aufrufbar; ein Makro ist eine Folge von Kommandos in den Einstellungen, ein Workflow ein Ablauf als Dokument. **[Skript-Blöcke](scripts.md)** bleiben rein lesend, auch als Skript-Schritt; ein Workflow ist keine allgemeine Skript-Sprache, sondern ein fester Katalog von Befehlen.

## Spätere Ausbaustufen

Eine weitere Ausbaustufe ist vorgesehen, ohne dass Umfang und Zeitpunkt feststehen: Befehle für den Austausch von Tabellen-Daten der [Datenbank](database.md), `db-export` und `db-import`. Die Prüfung kennt diese beiden Schlüsselwörter schon und meldet sie als „gibt es erst in einer späteren Ausbaustufe", damit eine solche Datei nicht teilweise läuft.
