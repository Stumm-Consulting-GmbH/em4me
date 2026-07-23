# Applikationen, Fenster und Bereiche

Die App organisiert die Arbeit in drei Ebenen: **Applikationen** (eigenständige Arbeitskontexte), **Fenster** (beliebig viele pro Applikation) und **Tabs**. Diese Seite beschreibt den Mehrfachstart, die Fenster-Verwaltung, die Titel-Systematik, die **Bereiche** (ein Ordner als ausschließlicher Arbeitsraum einer Applikation) und die **Arbeitsbereiche** (benannte, dauerhaft gespeicherte Applikationen samt aller Fenster).

## Applikationen

Das Programm kann mehrfach gestartet werden: Jeder weitere Start der Programmdatei legt eine neue Applikation an, einen eigenständigen Arbeitskontext mit eigenen Fenstern und eigener Fenster-Nummerierung. Dasselbe leistet „Datei → Neue Applikation".

Alle Applikationen laufen in einem gemeinsamen Programm-Prozess und teilen sich die Einstellungen. Die Sitzungs-Wiederherstellung (Hilfe → Sitzung wiederherstellen) stellt beim nächsten Start alle Applikationen samt Fenstern und Tabs wieder her.

## Ungespeicherte Entwürfe

Neue, nie gespeicherte Dokumente (Unbenannt-Tabs mit Inhalt) überleben das Beenden der App: Ihre Inhalte werden beim App-Ende zwischengespeichert und beim nächsten Start wieder als Unbenannt-Tabs geöffnet. Das gilt unabhängig von der Sitzungs-Wiederherstellung, also auch dann, wenn diese ausgeschaltet ist.

Der Zwischenspeicher greift nur beim Beenden der App oder eines Fensters, nicht beim einzelnen Schließen eines Tabs (Strg+W); ein einzelner Entwurf wird bewusst über den Speichern-Dialog verworfen. Bereits gespeicherte Dateien sind nicht betroffen und behalten beim Beenden ihren Speichern-Dialog.

Abschalten unter „Einstellungen → Verhalten" mit „Ungespeicherte neue Dokumente beim Beenden behalten" (Standard: an).

## Fenster

Innerhalb einer Applikation lassen sich beliebig viele Fenster öffnen: Über das Tab-Kontextmenü („Verschieben in" / „Kopieren in" → „Neues Fenster") wandert ein Tab in ein neues Fenster derselben Applikation. Bei mehreren offenen Fenstern listet das Untermenü alle anderen Fenster als Ziel; sobald mehrere Applikationen laufen, tragen die Ziel-Einträge den Applikations-Zusatz.

## Position neuer Tabs

Ein Tab, der **aus einem anderen heraus** entsteht, öffnet sich unmittelbar rechts neben diesem. Das betrifft jeden Klick im Inhalt eines Dokuments — Wiki-Link, Treffer einer Abfrage, Ereignis-Quelle, Journal-Navigation, Diagramm-Link — und ebenso die Dokument-Historie, die neben dem Tab ihres Dokuments erscheint. Der Zusammenhang zwischen Herkunft und Ziel bleibt damit sichtbar, und der Weg zurück ist kurz.

Öffnet ein Aufruf mehrere Dateien auf einmal, stehen sie in ihrer Reihenfolge hinter der Herkunft. Ist die Ziel-Datei bereits offen, wird nur ihr Tab aktiviert; die Reihenfolge der Leiste ändert sich dabei nie.

Alle Öffnungen **ohne** Herkunft hängen wie gewohnt ans Ende der Tab-Leiste: Datei-Dialog, Kommando-Palette, Lesezeichen, Panels, Datei-Liste des Bereichs sowie das Handbuch und die Einstellungen.

## Tab-Gruppen

Tabs lassen sich zu benannten, farbigen Gruppen zusammenfassen: Die Mitglieder stehen zusammenhängend hinter einem farbigen **Gruppen-Kopf** im Tab-Streifen, ihre Reiter tragen eine Unterstreichung in der Gruppen-Farbe.

- **Anlegen:** Kontextmenü eines Tabs → „Neue Gruppe mit diesem Tab". Die Gruppe erhält einen Standard-Namen und die nächste freie Farbe; der Dialog zum Umbenennen mit Farbwahl (feste Acht-Farben-Palette, auf helles und dunkles Theme abgestimmt) öffnet sich direkt.
- **Befüllen:** „Zu Gruppe hinzufügen" im Tab-Kontextmenü, oder einen Tab auf den Gruppen-Kopf beziehungsweise zwischen zwei Mitglieder ziehen. „Aus Gruppe entfernen" oder das Herausziehen aus dem Block beendet die Mitgliedschaft; Gruppen bleiben immer zusammenhängend.
- **Folge-Dateien:** Öffnet ein Klick im Inhalt eines gruppierten Dokuments eine weitere Datei (Wiki-Link, Abfrage-Treffer, Ereignis-Zeile, Journal-Navigation), tritt der neue Tab derselben Gruppe bei, und zwar an seiner Position neben der Herkunft (siehe „Position neuer Tabs"). Der Block bleibt dabei zusammenhängend. Öffnungen außerhalb des Dokument-Inhalts — Datei-Liste, Panels, Lesezeichen, Kommando-Palette, Dialoge — bleiben ungruppiert; bereits offene Ziel-Dateien werden nur aktiviert.
- **Klappen:** Ein Klick auf den Kopf klappt die Gruppe zu — sichtbar bleibt nur der Kopf mit der Mitglieder-Zahl; ein betroffener aktiver Tab wechselt zum nächsten sichtbaren. Ein weiterer Klick oder das Aktivieren eines Mitglieds (etwa beim Datei-Öffnen) klappt wieder auf.
- **Verwalten:** Kontextmenü des Kopfs — „Umbenennen und Farbe…", „Gruppe auflösen" (die Tabs bleiben offen) und „Gruppe schließen" (alle Mitglieder mit den üblichen Speichern-Nachfragen). Das Ziehen des Kopfs verschiebt die ganze Gruppe im Streifen.

Gruppen gehören zur jeweiligen Tab-Leiste (bei geteilter Ansicht je Seite); ein Tab, der die Leiste wechselt, verlässt seine Gruppe. Name, Farbe, Mitglieder und Klapp-Zustand überleben die Sitzungs-Wiederherstellung. Die Funktion ist als Erweiterung „Tab-Gruppen" abschaltbar; die Gruppen bleiben dabei erhalten und erscheinen beim Wieder-Einschalten unverändert.

## Form der Reiter

Reiter und Gruppen-Köpfe stehen wahlweise eckig oder mit abgerundeten oberen Ecken (Datei → Einstellungen… → Darstellung). Abgerundet ersetzt ein schmaler Abstand die senkrechte Trennlinie zwischen den Reitern; die Kennzeichnung des aktiven Reiters, die Farbstreifen der Gruppen und die Markierung der aktiven Spalte bleiben unverändert. Die Einstellung gilt für die ganze Anwendung und wirkt sofort in allen offenen Fenstern.

## Titel-Systematik

Der Fenstertitel zeigt in Klammern, wohin ein Fenster gehört, und zwar nur so viel wie nötig:

| Situation | Titel-Zusatz |
|---|---|
| Eine Applikation, ein Fenster | *(kein Zusatz)* |
| Eine Applikation, mehrere Fenster | `(Fenster 2)` |
| Mehrere Applikationen, je ein Fenster | `(App 2)` |
| Mehrere Applikationen und Fenster | `(App 2, Fenster 3)` |
| Bereichs-Applikation | `(Bereich Notizen)` bzw. `(Bereich Notizen, Fenster 2)` |
| Arbeitsbereich | `(Arbeitsbereich Alpha)` bzw. kombiniert `(Arbeitsbereich Alpha, Bereich Notizen, Fenster 2)` |

Die Nummern rücken beim Schließen lückenlos nach: Schließt Applikation 1, wird aus Applikation 2 die neue Nummer 1; dasselbe gilt für Fenster-Nummern innerhalb einer Applikation. Bereichs-Applikationen tragen keine App-Nummer, sondern immer den Namen ihres Bereichs-Ordners; Arbeitsbereiche tragen ihren Arbeitsbereichs-Namen, bei gebundenem Bereich kombiniert mit dem Bereichsnamen.

## Bereiche

Ein **Bereich** bindet eine Applikation an einen Ordner: Alles in diesem Ordner inklusive Unterordner ist der Arbeitsraum, sonst nichts. „Datei → Bereich öffnen…" wählt den Ordner; „Datei → Bereich schließen" beendet die Arbeit im Bereich und schließt alle Fenster der Bereichs-Applikation (mit den üblichen Speichern-Nachfragen). Die Bindung ist fest: Ein Bereich kann nicht gewechselt, nur geschlossen werden.

Beim Öffnen gelten drei Regeln:

- Ist die Applikation leer (keine geöffnete Datei), übernimmt sie den Bereich.
- Hat die Applikation bereits eine geöffnete Datei, entsteht eine neue Applikation für den Bereich.
- Läuft der Bereich bereits, wechselt der Fokus in ein Fenster der laufenden Bereichs-Applikation; derselbe Bereich läuft nie doppelt.

**Demo-Area:** „Datei → Demo-Area erstellen…" kopiert eine mitgelieferte englischsprachige Beispiel-Sammlung — Markdown-Seiten samt Bild- und PDF-Anlagen, die die wichtigsten Funktionen zeigen — in einen leeren Ordner und öffnet ihn direkt als Bereich: eine Sandbox zum gefahrlosen Ausprobieren. Nicht-leere Zielordner werden abgelehnt, vorhandene Dateien werden niemals überschrieben. Die Funktion ist als Erweiterung „Demo-Area" abschaltbar; bereits erstellte Demo-Ordner sind gewöhnliche Bereiche und bleiben davon unberührt.

### Harte Grenzen

Innerhalb einer Bereichs-Applikation ist der Bereich die Grenze: Der Öffnen-Dialog startet im Bereich und weist eine Auswahl außerhalb ab, „Zuletzt geöffnet" zeigt nur Bereichs-Dateien, „Speichern unter" akzeptiert nur Ziele im Bereich, und auch per Drag & Drop kommt keine fremde Datei herein. Dateien aus dem Datei-Explorer öffnen sich immer in einer Applikation ohne Bereich.

Links, deren Ziel außerhalb des Bereichs liegt, werden mit einer Warn-Unterstreichung markiert; der Tooltip nennt den vollen Ziel-Pfad. Ein Klick öffnet nicht, sondern meldet den Grund in der Statusbar. Eingebettete Bilder werden weiterhin angezeigt, auch wenn sie außerhalb liegen; die Grenze gilt für das Öffnen von Dateien, nicht für das Rendern.

### Suchraum und Index

In einer Bereichs-Applikation umfasst der Suchraum für Backlinks, Tags, Autocomplete und den Linter den **gesamten** Bereich statt nur des Ordners der aktiven Datei. Damit der Bereich beim Öffnen schnell bereitsteht, legt die App im Bereichs-Wurzelordner die Datei **`Area_Cache.mdda`** an. Sie ist ein reiner Zwischenspeicher des Index und kann gefahrlos gelöscht werden; beim nächsten Öffnen wird sie neu aufgebaut.

### Bereichs-Panel

Das Panel „Bereich" zeigt den Bereich als Ordnerstruktur in der Sidebar (links oder rechts andockbar wie jedes Panel; Schalter ist das Ordner-Icon in der Statusbar oder Ansicht → Panels → Bereich): oben der Ordnerbaum, darunter die Markdown-Dateien des ausgewählten Ordners; andere Datei-Typen erscheinen nicht. Ein Klick auf eine Datei öffnet sie als Tab, alle Einträge zeigen den vollen Pfad als Tooltip, und externe Änderungen (Datei angelegt, gelöscht, umbenannt) erscheinen automatisch. Der Knopf „+" am Kopf der Dateiliste legt eine neue Markdown-Datei im ausgewählten Ordner an und öffnet sie. In einer frisch geöffneten, noch leeren Bereichs-Applikation ist das Panel automatisch sichtbar.

### Zuletzt geöffnete Bereiche

„Datei → Zuletzt geöffnete Bereiche" listet die zuletzt geöffneten Bereiche mit ihrem Ordnernamen. Ein Klick öffnet den Bereich nach den üblichen Regeln. Bereiche werden mit der Sitzung wiederhergestellt; fehlt ein Bereichs-Ordner beim Start, wird die zugehörige Applikation nicht wiederhergestellt und ein Hinweis gezeigt.

## Arbeitsbereiche

Ein **Arbeitsbereich** ist eine benannte, dauerhaft gespeicherte Applikation: Er umfasst alle ihre Fenster mit Panes, Tabs samt Ansichts-Einstellungen, Tab-Gruppen, einer eventuellen Bereichs-Bindung und den ungespeicherten Entwürfen. Ein geöffneter Arbeitsbereich hält seinen Stand **automatisch** aktuell, ohne manuellen Speicher-Schritt; beim erneuten Öffnen geht die Arbeit exakt am letzten Stand weiter. Zugang: das Untermenü „Datei → Arbeitsbereiche" mit der Liste aller Arbeitsbereiche (der Farbpunkt zeigt zugleich den Zustand: gefüllt = geöffnet, Ring = geschlossen) und den vier Aktionen darunter; dieselben Aktionen stehen als Kommandos in der Kommando-Palette bereit.

**Bereich und Arbeitsbereich sind zwei verschiedene Dinge:** Ein *Bereich* bindet eine Applikation an einen **Ordner** und begrenzt ihren Arbeitsraum (siehe oben). Ein *Arbeitsbereich* ist eine benannte, wieder öffenbare **Fenster-Sammlung**, also ein gespeicherter Arbeitszustand. Beides lässt sich kombinieren: Ein Arbeitsbereich, dessen Applikation einen Bereich gebunden hat, nimmt diese Bindung in seine Ablage mit auf.

**Titelleisten-Farbe:** Fenster eines geöffneten Arbeitsbereichs tragen dessen Farbkennung in der Fenster-Titelleiste — im hellen Theme als kräftige, im dunklen Theme als pastellige Paletten-Variante, jeweils mit passender Titel-Textfarbe. Die Färbung folgt dem Lebenszyklus: Sie erscheint beim Öffnen, wechselt sofort mit der Farbe in der Verwaltung, verschwindet beim Schließen oder Löschen und entfällt mit dem Ausschalten der Erweiterung „Arbeitsbereiche". Sie setzt Windows 11 voraus; ohne diese Unterstützung bleibt die Standard-Titelleiste, die App ist davon nicht beeinträchtigt.

### Lebenszyklus

- **Anlegen:** „Als Arbeitsbereich speichern…" benennt die laufende Applikation samt aller Fenster (der Dialog fragt Name und Farbe ab; die Farben stammen aus der Acht-Farben-Palette der Tab-Gruppen). „Neuer Arbeitsbereich…" legt einen leeren Arbeitsbereich an und öffnet sofort dessen erstes Fenster.
- **Öffnen:** Ein Klick auf einen Listen-Eintrag stellt alle Fenster am letzten Stand wieder her. Derselbe Arbeitsbereich ist nie doppelt geöffnet; ist er bereits offen, wechselt der Fokus auf sein zuletzt aktives Fenster.
- **Schließen:** „Arbeitsbereich schließen" (oder das Schließen des letzten Fensters) friert den Stand ein und schließt alle Fenster des Arbeitsbereichs. Ungespeicherte Änderungen benannter Dateien laufen über die üblichen Speichern-Nachfragen; ein Abbruch stoppt das Schließen. Ungespeicherte Unbenannt-Tabs wandern ohne Nachfrage in die Ablage und kehren beim nächsten Öffnen des Arbeitsbereichs zurück.
- **Umbenennen und Farbe:** jederzeit über „Arbeitsbereiche verwalten…"; der Fenster-Titel zieht sofort nach.
- **Löschen:** entfernt nach einer Bestätigung nur die Ablage, niemals Markdown-Dateien. Ein gerade geöffneter Arbeitsbereich wird dabei nicht geschlossen, sondern läuft als gewöhnliche unbenannte Applikation weiter; seine noch gespeicherten Entwürfe gehen in den allgemeinen Entwurfs-Zwischenspeicher über.

### Verwaltung

„Arbeitsbereiche verwalten…" öffnet einen Dialog mit allen Arbeitsbereichen: Farbpunkt, Name, Zustand (geöffnet oder geschlossen) und Zeitpunkt des letzten Öffnens. Pro Eintrag stehen die Aktionen **Öffnen**, **Umbenennen und Farbe…** sowie **Löschen** bereit.

### Sitzungs-Wiederherstellung und Grenzfälle

Bei aktiver Sitzungs-Wiederherstellung kehren beim nächsten Start die unbenannten Applikationen **und** alle beim Beenden geöffneten Arbeitsbereiche zurück. Ist die Wiederherstellung ausgeschaltet, startet wie gewohnt ein leeres Fenster; die Ablagen bleiben vollständig erhalten und lassen sich jederzeit über das Untermenü öffnen. Fehlt der gebundene Bereichs-Ordner eines Arbeitsbereichs beim Öffnen, erscheint ein Hinweis und das Öffnen unterbleibt; die Ablage bleibt unverändert.

Die Funktion ist als Erweiterung „Arbeitsbereiche" abschaltbar: Untermenü, Kommandos und Verwaltung verschwinden dann, die Ablagen und geöffnete Arbeitsbereiche bleiben unangetastet; beim Wieder-Einschalten ist alles unverändert da.
