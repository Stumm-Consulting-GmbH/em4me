# Werkzeuge

Neun Helfer für die tägliche Arbeit am Text: Linter, Suche, Suchen und Ersetzen, Tabellen-Editor, PDF-Export, Kommando-Palette, Datums- und Uhrzeit-Eingabe, Uhr mit Wecker, Timer, Stoppuhr und Monatskalender, Titelzeile. Die Zugänge und Standard-Kürzel stehen in der [Funktions-Tabelle](functions.md).

## Markdown-Linter

Der Linter markiert sieben typische Mängel dezent im Editor (Quellcode-, Geteilt- und Live-Ansicht); die Maus über einer Markierung zeigt die Erklärung. Die Beispiele stehen in Code-Blöcken, damit diese Seite selbst markierungsfrei bleibt.

| Regel | Verstoß | Korrektur |
|---|---|---|
| Bare URL | `Siehe https://example.org dazu.` | `Siehe [Beispiel](https://example.org) dazu.` |
| Leerer Link-Text | `[](https://example.org)` | `[Beispiel](https://example.org)` |
| Fehlender Alt-Text | `![](bild.png)` | `![Architektur-Skizze](bild.png)` |
| Wiki-Link ohne Ziel | `[[Tippfehler-Name]]` | `[[Projektplan]]` (existierende Datei) |
| Defekter Wiki-Anker | `[[Projektplan#Fehlt]]` | `[[Projektplan#Meilensteine]]` (existierender Anker) |
| Unbekannter Callout-Typ | `> [!wichtig] Titel` | `> [!warning] Titel` (Typ aus der Whitelist) |
| Unpaariger Kommentar-Marker | `Text %% ohne Schließung` | `Text %%privat%% weiter` oder `\%%` für ein wörtliches `%%` |

## Volltextsuche

Die Suche (Standard `Strg+F`) findet live beim Tippen; der Suchbereich folgt der Ansicht (Quelltext oder Vorschau). Zwei Schalter ergänzen sie: `.*` für reguläre Ausdrücke, `Aa` für Groß-/Kleinschreibung. `F3` und `Umschalt+F3` springen zwischen Treffern, in der Suchleiste auch `Enter` / `Umschalt+Enter`.

Das Fragezeichen in der Suchleiste öffnet eine Regex-Kurzreferenz; die wichtigsten Muster:

| Muster | Bedeutung |
|---|---|
| `.` | beliebiges Zeichen |
| `*` / `+` / `?` | 0+, 1+ bzw. 0–1 Wiederholungen |
| `^` / `$` | Zeilenanfang / Zeilenende |
| `\d` / `\w` / `\s` | Ziffer / Wortzeichen / Leerraum |
| `[abc]` / `[^abc]` | eines / keines der Zeichen |
| `a\|b` | a oder b |

## Suchen und Ersetzen

Im Edit-Modus (Standard `Strg+H`) kommt eine Ersetzen-Zeile dazu. Mit aktivem Regex-Schalter stehen Backreferences im Ersetzungstext zur Verfügung: `$1`, `$2` für Klammergruppen. „Alle ersetzen" ist eine einzelne Transaktion, ein `Strg+Z` macht alles zusammen rückgängig.

```text
Suchen:    (\d{2})\.(\d{2})\.(\d{4})
Ersetzen:  $3-$2-$1
Wirkung:   12.06.2026 → 2026-06-12
```

## Tabellen-Editor

In Pipe-Tabellen springt `Tab` zur nächsten und `Umschalt+Tab` zur vorherigen Zelle. Am Ende der letzten Zeile erzeugen `Tab` oder `Enter` eine neue Tabellenzeile mit derselben Spalten-Anzahl; zweimal `Enter` in einer leeren Zeile verlässt die Tabelle. Auch randlose Tabellen (ohne äußere Pipes) werden erkannt. Struktur-Operationen (Zeilen und Spalten verschieben, einfügen und löschen, Ausrichtung, Transponieren) bietet das Untermenü **Tabelle** im [Editor-Kontextmenü](context-menu.md).
## PDF-Export

„Datei → Als PDF exportieren…" (Standard `Strg+Umschalt+P`) druckt den Inhalt des aktiven Tabs in eine PDF-Datei. Der Export folgt der aktiven Ansicht: die Quelltext-Ansicht druckt das Roh-Markdown mit Syntax-Hervorhebung, inklusive Zeilennummern, wenn sie im Tab eingeschaltet sind; Gerendert, Geteilt und Live drucken das formatierte Dokument (Geteilt und Live wechseln für den Druck intern auf die gerenderte Darstellung und stellen die Ansicht danach wieder her). Das PDF ist immer hell, auch wenn die App im dunklen Theme läuft; Mermaid-Diagramme werden dafür hell neu gezeichnet und bleiben Vektorgrafik. Formeln, Code-Hervorhebung, Callouts und Perspective-Tabellen erscheinen wie in der Vorschau.

Seitenformat, Ausrichtung und Ränder stellt der Bereich „Export" der Einstellungen ein (Datei → Einstellungen…); Standard ist A4 im Hochformat mit normalen Rändern. Beim Umbruch über Seiten bleiben Code-Blöcke, Tabellen, Diagramme, Formeln und Callouts nach Möglichkeit zusammen; Überschriften stehen nicht allein am Seitenende.

## Kommando-Palette

„Ansicht → Kommando-Palette" (Standard `Strg+K`) öffnet ein filterbares Popup aller Kommandos der App. Tippen filtert die Liste per Teilstring über die Kommando-Namen; die Pfeiltasten bewegen die Auswahl, `Enter` oder ein Klick führt das Kommando aus und schließt das Popup, `Esc` bricht ab. Rechts neben jedem Kommando steht das aktuell wirksame Tastenkürzel, eigene Umbelegungen aus dem Einstellungs-Bereich „Tastenkürzel" eingeschlossen. Kommandos, die im aktuellen Kontext nicht verfügbar sind (zum Beispiel Bereichs-Kommandos ohne geöffneten Bereich), erscheinen gedimmt und lassen sich nicht ausführen.

Die Palette ist der flüchtige Tastatur-Zugriff auf die Kommando-Registry; für dauerhafte eigene Zugänge — Statusbar-Buttons, Kontextmenü-Einträge und Makros — siehe die Seite [Kommando-Platzierung](command-placement.md).

## Datums- und Uhrzeit-Eingabe

Ein Kalender-Popup fügt Datum und Uhrzeit an der Cursor-Position ein, auch im Notiz-Feld. Drei Kommandos öffnen es: Standard `Strg+Alt+T` für Datum und Uhrzeit, Standard `Strg+Alt+D` für nur Datum, Standard `Strg+Alt+U` für nur Uhrzeit. Eingefügt werden die Formate `2026-07-10`, `14:30` oder kombiniert `2026-07-10 14:30`.

### Popup bedienen

Links steht ein Monatskalender mit Kalenderwochen-Spalte und Wochenstart am Montag; die Pfeile blättern durch die Monate, `Heute` springt zum aktuellen Tag. Rechts steht die Uhrzeit als vier einzeln einstellbare Stellen (Stunden-Zehner und -Einer, Minuten-Zehner und -Einer) mit Doppelpunkt dazwischen; `Jetzt` setzt die aktuelle Zeit. Datum und Uhrzeit lassen sich einzeln zu- und abschalten, mindestens ein Teil bleibt aktiv.

Die Tastatur führt durch den Kalender: die Pfeiltasten verschieben um einen Tag (links, rechts) oder eine Woche (auf, ab), `Bild auf` und `Bild ab` um einen Monat, `Enter` übernimmt, `Esc` bricht ab. Ein Klick außerhalb des Popups bricht ebenfalls ab.

Bei der Uhrzeit wählt ein Klick eine der vier Stellen: die Pfeil-Knöpfe ▲/▼ und die Pfeiltasten Auf/Ab stellen die aktive Stelle mit Umlauf, Links/Rechts wechseln die Stelle, Ziffern-Tasten setzen sie direkt und rücken zur nächsten weiter. Ungültige Uhrzeiten lassen sich so gar nicht erst eingeben.

### Schreib-Trigger

Zwei Semikolons `;;` im Editor öffnen den kombinierten Picker an dieser Stelle. Das Übernehmen ersetzt die beiden Zeichen durch den gewählten Wert, `Esc` lässt sie stehen. In Code, Formeln und Frontmatter löst die Zeichenfolge nichts aus; in den Zellen einer Perspective-Tabelle dagegen schon, denn dort ist die Zeichenfolge Inhalt und kein Code.

### Klickbare Werte im Editor

Im Editor, im Quelltext- wie im Live-Modus, erkennt die App Werte in den drei Formaten und unterstreicht sie dezent gepunktet. Ein Klick öffnet den Picker mit dem Wert vorbelegt, die Schalter richten sich nach der Form des Werts; das Übernehmen ersetzt ihn an Ort und Stelle. Nicht klickbar sind Werte

- in Code, Formeln und Frontmatter,
- auf der Zeile, in der gerade der Cursor steht,
- in Wiki-Link-Zielen,
- hinter den Termin-Markern der [Aufgaben-Listen](tasks.md), die dort als Badge erscheinen.

Die Zeile mit dem Cursor bleibt bewusst ohne Dekoration: dort läuft die normale Text-Bearbeitung, und der Wert wird wieder klickbar, sobald der Cursor die Zeile verlässt. In schreibgeschützten Ansichten gibt es keine klickbaren Werte.

Die Erkennung greift bewusst auch bei von Hand getippten Werten: jedes Datum und jede Uhrzeit in diesen Formaten wird so pflegbar.

### Erweiterung

Die Funktion gehört zur schaltbaren Erweiterung „Datums- und Uhrzeit-Eingabe" (Einstellungen → Erweiterungen). Ist sie ausgeschaltet, entfallen Kommandos, Schreib-Trigger und Klick-Dekoration; die Werte bleiben normaler Text. Die Formate entsprechen den Termin-Markern der Aufgaben-Listen, sodass beide Funktionen dieselbe Schreibweise teilen.

## Uhr, Wecker, Timer, Stoppuhr und Kalender

Ein Sidebar-Panel zeigt die Zeit als analoge Uhr, als digitale Anzeige und mit Datumszeile; Größe, Zifferblatt-Art, Sekundenzeiger, Stunden- und Datumsformat sowie die Kalenderwoche sind in den Einstellungen wählbar. Eine Leiste am oberen Rand des Panels schaltet zwischen fünf Ansichten um: Uhr, Wecker, Timer, Stoppuhr und Kalender. Die Wahl gilt je Sidebar-Spalte und bleibt über den Neustart erhalten.

### Größe

Drei Stufen bemessen Zifferblatt und Schrift gemeinsam, damit das Panel als ein Bild wirkt. Die Auswahl steht im Block „Anzeige" der Einstellungen und gilt auch dann, wenn das Zifferblatt abgeschaltet ist und nur die digitale Anzeige läuft. Uhrzeit, Datumszeile und Kalenderwoche wachsen gemeinsam und behalten ihr Größenverhältnis.

Die kleine Stufe ist auf schmale Sidebar-Spalten ausgelegt, die große auf eine breit gezogene Spalte. Passt eine Zeile nicht in die Spalte, bricht sie nicht um, sondern wird links und rechts beschnitten; die Mitte bleibt lesbar. Wer sie vollständig sehen will, zieht die Spalte breiter oder wählt eine kleinere Stufe.

### Wecker

Der Wecker-Modus hält beliebig viele Wecker. Beim Anlegen werden Uhrzeit, eine Bezeichnung und das Wiederhol-Muster gewählt: einmalig, täglich oder an bestimmten Wochentagen. Die Uhrzeit kommt über eine Ziffern-Auswahl, eine ungültige Eingabe ist damit nicht möglich. Jeder Wecker lässt sich einzeln scharf schalten, ohne ihn zu löschen; ein einmaliger Wecker schaltet sich nach dem Auslösen selbst ab.

Ein fälliger Wecker meldet sich mit einem Hinweis, der bestätigt oder um eine einstellbare Dauer geschlummert werden kann (Einstellungen → Uhr). Ist das Fenster nicht im Vordergrund, kommt zusätzlich eine System-Benachrichtigung; ein Klick darauf holt das Fenster nach vorn.

### Timer und Stoppuhr

Der Timer-Modus zeigt die angelegten Timer mit Restzeit und Fortschrittsbalken. Drei Knöpfe starten geläufige Dauern sofort, eigene Dauern kommen über eine Steuerung für Stunden, Minuten und Sekunden. Start, Pause und Zurücksetzen wirken je Timer. Die Restzeit wird aus Zeitstempeln gerechnet, nicht heruntergezählt: Ein Timer läuft deshalb auch dann richtig weiter, wenn das Fenster im Hintergrund war oder die App zwischenzeitlich beendet wurde. Ein abgelaufener Timer meldet sich und lässt sich bestätigen oder erneut starten.

Die Stoppuhr misst vorwärts, mit Hundertsteln. Neben Start, Pause und Zurücksetzen nimmt sie Rundenzeiten auf; die jüngste Runde steht oben.

### Monatskalender

Der Kalender-Modus zeigt einen Monat als Gitter: Wochentage im Kopf, Montag zuerst, der heutige Tag hervorgehoben, Tage der Nachbarmonate gedämpft. Die Kalenderwochen-Spalte links lässt sich in den Einstellungen unter „Kalender" ab- und wieder anschalten.

Über der Tabelle steht die Navigation. Die einfachen Pfeile blättern einen Monat, die doppelten ein Jahr; „Heute" kehrt zum laufenden Monat zurück. Ein Klick auf die Monats-Bezeichnung klappt die Jahres-Eingabe auf: vier Ziffern-Stellen, die sich mit den Pfeiltasten stellen, mit Links und Rechts wechseln und mit Ziffern direkt setzen lassen. Ein ungültiges Jahr ist dabei nicht eingebbar, und Eingabetaste oder Häkchen übernehmen es.

Die Tage sind reine Anzeige. Der Kalender dient dem Nachschlagen, etwa der Frage, auf welchen Wochentag ein weit entferntes Datum fällt; er führt nicht in Journale oder Termine. Dafür gibt es das Kalender-Panel der Journale.

### Grenze

Wecker und Timer melden sich nur bei laufender App. Ist die App geschlossen, entfällt die Meldung; ein währenddessen verstrichener Weckzeitpunkt wird beim nächsten Start nicht nachgeholt. Ein laufender Timer dagegen rechnet korrekt weiter und meldet sich, sobald die verbleibende Zeit abgelaufen ist.

### Erweiterung

Die Uhr gehört zur schaltbaren Erweiterung „Uhr" (Einstellungen → Erweiterungen). Ist sie ausgeschaltet, entfallen Panel, Statusbar-Schalter, Menü-Eintrag und der Einstellungs-Bereich; es findet dann auch keine Überwachung von Weckern und Timern statt.

## Titelzeile

Über dem Dokument steht der Dateiname ohne Endung als kompakte Titelzeile in Überschrift-Optik — ohne Zeilennummer, scroll-fest und in allen vier Ansichten (in der Geteilt-Ansicht einmal, über der Quelltext-Spalte). Unterseiten zeigen ihren vollen logischen Namen in Schrägstrich-Schreibweise, unbenannte Dokumente den Unbenannt-Platzhalter. Handbuch- und Systemseiten haben keine Titelzeile.

### Direkt umbenennen

Ein Klick auf den Titel (oder `Enter` bzw. `F2` auf der fokussierten Zeile) macht ihn editierbar; `Enter` oder ein Klick außerhalb bestätigt, `Esc` verwirft, unveränderter Text beendet still. Das Bestätigen benennt die Datei über den normalen Umbenennen-Mechanismus um: Links auf die Datei werden gemäß der Einstellung „Links in anderen Dateien anpassen" aktualisiert, die Begleitdatei wandert mit, eine Seite mit Unterseiten nimmt ihren gesamten Unterseiten-Baum mit. Ungespeicherte Änderungen werden vorher gespeichert. Der Umbenennen-Dialog (Datei → Umbenennen…) bleibt als Weg mit Vorschau und Ergebnis-Bericht bestehen.

Ungültige Namen (leer, unzulässige Zeichen) und Namens-Kollisionen zeigt ein Hinweis direkt unter dem Titel; die Datei bleibt dann unverändert. Bei unbenannten Dokumenten stößt das Bestätigen eines Namens „Speichern unter" mit diesem Namen als Vorbelegung an.

### Erweiterung

Die Titelzeile gehört zur schaltbaren Erweiterung „Titelzeile" (Einstellungen → Erweiterungen). Ist sie ausgeschaltet, verschwindet die Zeile vollständig; der Dateiname bleibt über Tab-Titel und Fenster-Titel sichtbar, das Umbenennen über den Dialog erreichbar.
