# Workflows

Ein **Workflow** schreibt wiederkehrende Handgriffe als feste Folge von Schritten auf: Dateien und Ordner anlegen, umbenennen, verschieben und kopieren, Text anhängen oder einfügen, Eigenschaften im Dateikopf setzen, Kommandos, Makros und andere Workflows ausführen. Ein Workflow ist eine **gewöhnliche Markdown-Datei**; was er tut, steht in einem Block fester Befehle, eine Zeile je Schritt. Die Datei bleibt damit ohne die Anwendung lesbar, lässt sich weitergeben und wie jedes andere Dokument bearbeiten.

Gestartet wird ein Workflow **von Hand**: aus dem Menü, der Kommando-Palette, über ein Tastenkürzel, einen Knopf über dem Block oder das Kontextmenü des Bereichs-Panels. **Bevor der erste Schritt läuft, prüft die Anwendung den ganzen Workflow**; ein Fehler steht mit Zeile und Grund über dem Block, und es läuft nichts.

## Die Erweiterung „Workflows"

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Workflows", Gruppe **Werkzeuge**) und ist im Arbeitsmodus **Voll** eingeschaltet, in den Modi **Einsteiger** und **Fortgeschritten** aus. Ist sie abgeschaltet, ist ein `workflow`-Block ein gewöhnlicher Code-Block ohne Hervorhebung, Prüf-Anzeige und Knopf; es gibt keine Kommandos der Workflows, kein Untermenü **Workflows**, keine Seite **Workflow-Läufe** und keine Einstellungs-Abschnitte **Workflows**. Eine Workflow-Datei ist dann ein gewöhnliches Dokument. Verloren geht nichts: Dateien, Lauf-Stände und die Festlegung des Workflow-Ordners sind nach dem Einschalten unverändert da.

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

Der Dateikopf trägt nur Kennzeichen, Namen, Auslöser und Beschreibung:

| Schlüssel | Pflicht | Bedeutung |
| --- | --- | --- |
| `workflow` | ja | `true` kennzeichnet die Datei als Workflow. |
| `name` | nein | Name des Workflows in Menü, Kommando-Palette und Hinweisen; ohne Angabe gilt der Dateiname ohne Endung. |
| `trigger` | nein | Auslöser; ohne Angabe gilt `manual`, der Start von Hand. |
| `description` | nein | Kurzbeschreibung; die Seite **Workflow-Läufe** zeigt sie als Tooltip am Namen. |

Ein anderer Auslöser als `manual` wird als „noch nicht unterstützt" angezeigt, und der Workflow läuft nicht; die Datei bleibt dabei unverändert. Trägt eine Datei zwei oder mehr `workflow`-Blöcke oder keinen, läuft sie ebenfalls nicht. Ein Block, der nur Kommentare enthält, ist gültig und tut nichts.

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
- fehlerhafte Platzhalter, nicht lesbare Vorlagen und ausgeschaltete Vorlagen.

Ein Befund hält den Lauf **vor dem ersten Schritt** an; eine fehlerhafte Workflow-Datei läuft damit gar nicht statt teilweise. Die Prüfung meldet alle Befunde zugleich; die Zeilen-Angabe ist die Zeile im Dokument, wie sie der Editor zählt, mit dem Dateikopf.

Was erst ein früherer Schritt herstellen kann, prüft die Anwendung beim Schritt selbst: ob eine Datei, ein Abschnitt oder eine Überschrift vorhanden ist. Fehlt sie dann, schlägt der Schritt fehl.

## Befehle

Die Befehle der ersten Ausbaustufe, nach ihrem Gegenstand geordnet. Die Pfade sind relativ zur Bereichs-Wurzel.

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
| `notify` | Hinweis: Text als Hinweis in der Statusleiste zeigen | Text | `notify "Wochenrückblick angelegt"` |
| `stop` | anhalten: den Lauf mit einem Text beenden | Text | `stop "Nichts zu tun"` |

- `command` nimmt die feste Kennung eines Kommandos, etwa `view.modeSplit`, `view.modeLive` oder `file.save`, und führt es im startenden Fenster aus. Ist es im Augenblick nicht ausführbar, schlägt der Schritt fehl. Makros und Workflows laufen nicht über `command`, sondern über ihre eigenen Befehle.
- `macro` und `workflow` dürfen höchstens fünf Ebenen tief verschachtelt sein. Ein aufgerufener Workflow kehrt nach seinem letzten Schritt zurück; schlägt in ihm ein Schritt fehl, endet der ganze Lauf.
- `stop` beendet den ganzen Lauf, auch aus einem aufgerufenen Workflow; die Statusleiste zeigt „Workflow ‹Name› beendet in Zeile N: Text".

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
| `{{file}}` | Pfad des beim Start aktiven Dokuments, relativ zur Bereichs-Wurzel, etwa `Projekte/Plan.md` |
| `{{title}}` | Titel des beim Start aktiven Dokuments |
| `{{folder}}` | Ordner des beim Start aktiven Dokuments, relativ zur Bereichs-Wurzel |
| `{{area}}` | Name des Bereichs |
| `{{prompt:Frage}}`, `{{prompt:Frage:Vorgabe}}` | Eingabe-Dialog |
| `{{select:Frage:a,b,c}}` | Auswahl-Dialog |

- **Alle Dialoge vor dem ersten Schritt:** Die Eingabe- und Auswahl-Dialoge des ganzen Laufs erscheinen nacheinander, bevor etwas geschieht, die der eingesetzten Vorlagen und der aufgerufenen Workflows eingeschlossen. Eine gleiche Frage wird einmal gestellt und gilt überall. Wer einen Dialog abbricht, bricht den Lauf ab, und kein Schritt läuft.
- **Ein Zeitpunkt je Lauf:** `{{date}}` und `{{time}}` haben in allen Zeilen denselben Wert, auch über Mitternacht.
- **In einer eingesetzten Vorlage** meinen `{{title}}` und `{{folder}}` wie gewohnt die neue Datei, `{{file}}` und `{{area}}` dagegen das aktive Dokument und den Bereich.
- `{{cursor}}` ist in einer Befehls-Zeile nicht erlaubt, `{{clipboard}}` gibt es dort erst in einer späteren Ausbaustufe. `\{{` schreibt ein wörtliches `{{`.
- Bleibt `{{folder}}` im Wurzel-Ordner leer, entsteht aus `"{{folder}}/Neu.md"` der Pfad `Neu.md`. Ohne aktives Dokument ist `{{file}}` leer, und ein Pfad daraus ist ein Befund.

## Einen Workflow starten

Ein Workflow startet nur in einem geöffneten Bereich, und seine Pfade gelten in diesem Bereich, auch wenn die Datei aus dem anwendungsweiten Workflow-Ordner kommt. Die Wege:

| Weg | Wirkung |
| --- | --- |
| **Datei → Workflows** | jeder Workflow des Workflow-Ordners als Eintrag, Unterordner als Untermenüs |
| **Kommando-Palette** (Standard `Strg+K`) | jeder Workflow des Workflow-Ordners als Kommando unter seinem Namen |
| **Statusleiste und Kontextmenü** | das Kommando eines Workflows, platziert über die [Kommando-Platzierung](command-placement.md) |
| **Tastenkürzel** | unter „Einstellungen → Tastenkürzel" für das Kommando eines Workflows vergeben |
| **Knopf „Starten" über dem Block** | in der Live-Ansicht, der gerenderten Ansicht und der geteilten Ansicht rechts in der Kopfzeile des Blocks; startet jede Workflow-Datei, auch außerhalb des Workflow-Ordners, mit dem Stand im Editor |
| **„Starten" im Bereichs-Panel** | zuoberst im Kontextmenü jeder Workflow-Datei des Bereichs |
| **Seite „Workflow-Läufe"** | Knopf „Starten" in der Zeile jedes Workflows |

Der Knopf über dem Block ist gesperrt, solange die Prüfung einen Befund meldet. Bei einem noch nie gespeicherten Dokument zeigt er „Zuerst speichern", außerhalb eines Bereichs „Nur in einem geöffneten Bereich startbar".

Das Kommando eines Workflows erhält seine Kennung aus dem Pfad der Datei im Workflow-Ordner; zwei gleichnamige Workflows in verschiedenen Unterordnern bleiben so unterscheidbar. **Wer einen Workflow in der Anwendung umbenennt oder innerhalb des Workflow-Ordners verschiebt, behält seine Belegungen:** Ein Tastenkürzel, ein Platz in Statusleiste, Kontextmenü oder Format-Toolbar und ein Makro-Schritt, der ihn aufruft, ziehen mit. **Außerhalb der Anwendung**, etwa im Dateimanager, bemerkt die Anwendung die Umbenennung nicht; die Belegungen verlieren dann ihr Ziel und sind neu zu vergeben. Wird ein Workflow aus dem Workflow-Ordner hinaus verschoben, ist er kein Kommando mehr; seine Belegungen bleiben gespeichert und wirken wieder, sobald er an denselben Ort zurückkehrt.

## Ablauf eines Laufs

1. Die Anwendung prüft den Workflow samt den Workflows, die er aufruft.
2. Die Dialoge aller Platzhalter erscheinen nacheinander.
3. Die Schritte laufen strikt nacheinander; jeder wartet auf den vorigen.
4. Der erste Fehlschlag beendet den Lauf. Die Statusleiste zeigt „Workflow ‹Name› abgebrochen in Zeile N: Grund".

Ausgeführte Schritte bleiben ausgeführt; eine Rücknahme über mehrere Schritte gibt es nicht. **Je Fenster läuft höchstens ein Workflow**; ein zweiter Start während eines Laufs wird mit einem Hinweis abgewiesen.

## Workflow-Ordner und Menü

Wie bei den Vorlagen gibt es einen **Workflow-Ordner**, festgelegt auf zwei Ebenen unter „Datei → Einstellungen…":

- **Anwendungsweit** im Abschnitt **Erweiterungen (intern) → Workflows**.
- **Je Bereich** im Abschnitt **Aktueller Bereich → Workflows** mit dem Schalter „Bereichs-Konfiguration verwenden" und der Schaltfläche „Wählen…". Der Ordner wird relativ zur Bereichs-Wurzel in der Bereichsdatei gespeichert und **ersetzt** den anwendungsweiten vollständig.

Das Untermenü **Datei → Workflows** steht unmittelbar nach dem Untermenü **Bereich**. Es zeigt die Dateien des Ordners, die das Kennzeichen tragen, je Ebene alphabetisch nach Name; Unterordner erscheinen als Untermenüs, Dateien ohne Kennzeichen fehlen. Nach einem Trennstrich folgen:

- **Workflow-Läufe anzeigen** — öffnet die Seite **Workflow-Läufe**.
- **Neuer Workflow …** — fragt nach dem Namen, legt im Workflow-Ordner eine Datei mit Dateikopf, Beschreibungs-Zeile und einem leeren `workflow`-Block mit zwei Kommentar-Zeilen an und öffnet sie. Ohne festgelegten Ordner fragt er zuerst nach dem Ordner und hält ihn fest, bei geöffnetem Bereich in dessen Einstellungen. Eine vorhandene Datei überschreibt er nie. Der Eintrag steht auch in der Kommando-Palette.
- **Workflow-Ordner festlegen …** — öffnet die Einstellungen beim Abschnitt **Workflows**.

Ohne festgelegten Ordner zeigt das Untermenü „Kein Workflow-Ordner festgelegt", bei einem leeren Ordner „Keine Workflows im Workflow-Ordner", bei einem nicht erreichbaren „Workflow-Ordner nicht gefunden". Das Untermenü und die Kommandos folgen jeder Änderung im Ordner.

## Lauf-Stand und die Seite „Workflow-Läufe"

Nach jedem Lauf hält die Anwendung in der **Begleitdatei** des Workflows (`.mdd`, Abschnitt `workflow`) den Zeitpunkt, das Ergebnis, gegebenenfalls die abgebrochene Zeile und die Zahl der Läufe fest; der Text der Workflow-Datei bleibt unberührt. Der Lauf-Stand reist beim Umbenennen und Verschieben mit, beim Kopieren nicht.

Die Seite **Workflow-Läufe** öffnet über „Ansicht → Workflow-Läufe anzeigen", über „Datei → Workflows → Workflow-Läufe anzeigen" und über die Kommando-Palette. Sie listet **alle Workflows des Bereichs**, auch die außerhalb des Workflow-Ordners, mit den Spalten **Workflow**, **Ort**, **Letzter Lauf**, **Ergebnis** und **Läufe** und einem Knopf „Starten" je Zeile. Ein Workflow, der noch nie lief, steht mit „noch nie gelaufen".

| Ergebnis | Bedeutung |
| --- | --- |
| erfolgreich | alle Schritte sind gelaufen |
| abgebrochen in Zeile N: Grund | ein Befund oder Fehlschlag hat den Lauf beendet |
| beendet in Zeile N | der Befehl `stop` hat den Lauf beendet |
| Eingabe abgebrochen, kein Schritt ausgeführt | ein Dialog wurde abgebrochen |

Nach einem Lauf in diesem Fenster zeigt die Seite denselben Grund wie die Statusleiste. Die Begleitdatei hält nur Zeile und Art des Grunds; nach einem Neustart und für einen Lauf aus einem anderen Fenster erscheinen einzelne Angaben wie ein Dateiname deshalb als „…". Die Seite zieht nach jedem Lauf nach; der Knopf „Aktualisieren" liest sie neu.

## Unterstützung im Editor

- **Hervorhebung:** In den Befehls-Zeilen sind das Schlüsselwort fett, Text in Anführungszeichen farbig und Platzhalter kursiv hervorgehoben, im Editor wie in der Darstellung.
- **Prüf-Anzeige:** Die Live-Ansicht, die gerenderte Ansicht und die geteilte Ansicht zeigen über dem Block das Ergebnis der Prüfung: grün „bereit" oder rot „Zeile N: Grund", bei mehreren Befunden mit „(+N weitere)". Dort stehen auch die Hinweise auf mehrere Blöcke und auf einen noch nicht unterstützten Auslöser. Die Anzeige folgt dem Text kurz nach jeder Änderung und zeigt denselben Befund, den der Start meldet. Im Druck, im Export und bei einer eingebetteten Datei erscheint die Kopfzeile nicht.

Hervorhebung und Anzeige ändern den Text der Datei nicht.

## Grenzen

- **Nur im Bereich:** Kein Befehl liest oder schreibt außerhalb der Wurzel des Bereichs, in dem der Workflow gestartet wurde, auch nicht über einen Platzhalter.
- **Kein Löschen, kein Netz, keine Fremdprogramme.**
- **Nur von Hand:** Ein Workflow startet nie von selbst und läuft nur, solange die Anwendung läuft.
- `notify` zeigt seinen Text in der Statusleiste; eine Benachrichtigung des Betriebssystems gibt es nicht.
- **Makros** bleiben, wie sie sind, und sind als Schritt aufrufbar; ein Makro ist eine Folge von Kommandos in den Einstellungen, ein Workflow ein Ablauf als Dokument. **[Skript-Blöcke](scripts.md)** bleiben rein lesend; ein Workflow ist keine allgemeine Skript-Sprache, sondern ein fester Katalog von Befehlen.

## Spätere Ausbaustufen

Weitere Ausbaustufen sind vorgesehen, ohne dass Umfang und Zeitpunkt feststehen: ein Start nach Zeitplan, Befehle zur Pflege wie Löschen mit Bestätigung, Schlagwörter setzen und entfernen oder Aufgaben abhaken, ein Start bei Ereignissen im Bereich, Bedingungen und Wiederholungen sowie Befehle für die [Datenbank](database.md). Die Prüfung kennt die Schlüsselwörter dieser Befehle schon und meldet sie als „gibt es erst in einer späteren Ausbaustufe", damit eine solche Datei nicht teilweise läuft.
