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
- **In Mengen bewegen:** Sind mehrere Reiter ausgewählt (siehe „Mehrfach-Auswahl von Reitern"), beziehen sich die drei Gruppen-Einträge des Kontextmenüs auf die ganze Auswahl, und das Ziehen eines ausgewählten Reiters auf den Kopf lässt die ganze Menge beitreten. Sie hängt sich in ihrer Reihenfolge aus der Leiste ans Ende des Gruppen-Blocks; beim Austritt steht sie unmittelbar hinter ihm.
- **Folge-Dateien:** Öffnet ein Klick im Inhalt eines gruppierten Dokuments eine weitere Datei (Wiki-Link, Abfrage-Treffer, Ereignis-Zeile, Journal-Navigation), tritt der neue Tab derselben Gruppe bei, und zwar an seiner Position neben der Herkunft (siehe „Position neuer Tabs"). Der Block bleibt dabei zusammenhängend. Öffnungen außerhalb des Dokument-Inhalts — Datei-Liste, Panels, Lesezeichen, Kommando-Palette, Dialoge — bleiben ungruppiert; bereits offene Ziel-Dateien werden nur aktiviert.
- **Klappen:** Ein Klick auf den Kopf klappt die Gruppe zu — sichtbar bleibt nur der Kopf mit der Mitglieder-Zahl. Das gilt auch, wenn der aktive Reiter in der Gruppe liegt: Er bleibt aktiv, sein Inhalt bleibt im Fenster, und der Kopf trägt dieselbe Kennzeichnung wie ein aktiver Reiter. Die Gruppe klappt nur auf Klick wieder auf; eine Aktivierung von außen (Wiki-Link, Kommando-Palette, Reiter-Wechsel per Tastatur) lässt sie zu.
- **Zeigen statt Aufklappen:** Wer auf den Kopf einer zugeklappten Gruppe zeigt, bekommt nach kurzer Verzögerung eine Liste ihrer Reiter; ein Klick darin wechselt zu der Datei, ohne die Gruppe aufzuklappen. Der aktive Reiter ist in der Liste markiert, ungespeicherte Dateien tragen ihren Änderungs-Punkt.
- **Verwalten:** Kontextmenü des Kopfs — „Umbenennen und Farbe…", „Gruppe auflösen" (die Tabs bleiben offen) und „Gruppe schließen" (alle Mitglieder mit den üblichen Speichern-Nachfragen). Das Ziehen des Kopfs verschiebt die ganze Gruppe im Streifen.

Gruppen gehören zur jeweiligen Tab-Leiste (bei geteilter Ansicht je Seite); ein Tab, der die Leiste wechselt, verlässt seine Gruppe. Name, Farbe, Mitglieder und Klapp-Zustand überleben die Sitzungs-Wiederherstellung. Die Funktion ist als Erweiterung „Tab-Gruppen" abschaltbar; die Gruppen bleiben dabei erhalten und erscheinen beim Wieder-Einschalten unverändert.

## Mehrfach-Auswahl von Reitern

Mehrere Reiter lassen sich zugleich auswählen und dann in einem Schritt bewegen.

- **Auswählen:** **Strg** und Klick nimmt einen Reiter in die Auswahl auf und wieder heraus, **Umschalt** und Klick wählt die Spanne vom aktiven Reiter bis zum angeklickten. Ausgewählte Reiter sind farbig hinterlegt; ab zwei Mitgliedern ist die Auswahl sichtbar.
- **Bewegen:** Das Ziehen eines ausgewählten Reiters bewegt die ganze Menge, innerhalb der Leiste und auf einen Gruppen-Kopf. Über die Spaltengrenze wandert dagegen nur der gezogene Reiter.
- **Kontextmenü:** Die Gruppen-Einträge wirken auf die Auswahl, sobald der angeklickte Reiter zu ihr gehört. Einträge, die genau eine Datei meinen — Umbenennen, Lesezeichen, Verschieben oder Kopieren in ein Fenster —, bleiben beim angeklickten Reiter, ebenso der Mittelklick zum Schließen.
- **Ende der Auswahl:** ein Klick ohne Zusatztaste, der Wechsel der Spalte oder das Schließen der Sitzung. Die Auswahl gehört zur einzelnen Reiterleiste und wird nicht gespeichert.

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

Ein **Bereich** bindet eine Applikation an einen Ordner: Alles in diesem Ordner inklusive Unterordner ist der Arbeitsraum, sonst nichts. „Datei → Bereich → Bereich öffnen…" wählt den Ordner; „Datei → Bereich → Bereich schließen" beendet die Arbeit im Bereich und schließt alle Fenster der Bereichs-Applikation (mit den üblichen Speichern-Nachfragen). Die Bindung ist fest: Ein Bereich kann nicht gewechselt, nur geschlossen werden.

Beim Öffnen gelten drei Regeln:

- Ist die Applikation leer (keine geöffnete Datei), übernimmt sie den Bereich.
- Hat die Applikation bereits eine geöffnete Datei, entsteht eine neue Applikation für den Bereich.
- Läuft der Bereich bereits, wechselt der Fokus in ein Fenster der laufenden Bereichs-Applikation; derselbe Bereich läuft nie doppelt.

**Demo-Area:** „Datei → Bereich → Demo-Area erstellen…" kopiert eine mitgelieferte englischsprachige Beispiel-Sammlung — Markdown-Seiten samt Bild- und PDF-Anlagen, die die wichtigsten Funktionen zeigen — in einen leeren Ordner und öffnet ihn direkt als Bereich: eine Sandbox zum gefahrlosen Ausprobieren. Nicht-leere Zielordner werden abgelehnt, vorhandene Dateien werden niemals überschrieben. Die Funktion ist als Erweiterung „Demo-Area" abschaltbar; bereits erstellte Demo-Ordner sind gewöhnliche Bereiche und bleiben davon unberührt.

**Was die Sammlung mitbringt:** Zwei benannte Arbeitsbereiche entstehen beim Anlegen als Einträge unter „Datei → Arbeitsbereiche“, ohne sich von selbst zu öffnen. „Astronomy“ führt zwei Fenster mit den farbigen Reiter-Gruppen „Hierarchy“ und „Scales“, „Getting Started“ ein Fenster für den Einstieg. Der astronomische Themenbereich zeigt zugleich eine vierstufige Unterseiten-Hierarchie von der Galaxie über den Stern und den Planeten bis zum Mond, dazu Seiten zu Lichtgeschwindigkeit, Entfernungen und Alter.

### Harte Grenzen

Innerhalb einer Bereichs-Applikation ist der Bereich die Grenze: Der Öffnen-Dialog startet im Bereich und weist eine Auswahl außerhalb ab, „Zuletzt geöffnet" zeigt nur Bereichs-Dateien, „Speichern unter" akzeptiert nur Ziele im Bereich, und auch per Drag & Drop kommt keine fremde Datei herein. Dateien aus dem Datei-Explorer öffnen sich immer in einer Applikation ohne Bereich.

Links, deren Ziel außerhalb des Bereichs liegt, werden mit einer Warn-Unterstreichung markiert; der Tooltip nennt den vollen Ziel-Pfad. Ein Klick öffnet nicht, sondern meldet den Grund in der Statusbar. Eingebettete Bilder werden weiterhin angezeigt, auch wenn sie außerhalb liegen; die Grenze gilt für das Öffnen von Dateien, nicht für das Rendern.

### Suchraum und Index

In einer Bereichs-Applikation umfasst der Suchraum für Backlinks, Tags, Autocomplete und den Linter den **gesamten** Bereich statt nur des Ordners der aktiven Datei. Damit der Bereich beim Öffnen schnell bereitsteht, legt die App im Bereichs-Wurzelordner die Datei **`Area_Cache.mdda`** an. Sie ist ein reiner Zwischenspeicher des Index und kann gefahrlos gelöscht werden; beim nächsten Öffnen wird sie neu aufgebaut.

### Bereichs-Panel

Das Panel „Bereich" zeigt den Bereich als Ordnerstruktur in der Sidebar (links oder rechts andockbar wie jedes Panel; Schalter ist das Ordner-Icon in der Statusbar oder Ansicht → Sidebar → Panels → Bereich): oben der Ordnerbaum, darunter die Markdown-Dateien des ausgewählten Ordners; andere Datei-Typen erscheinen nicht. Ein Klick auf eine Datei öffnet sie als Tab, alle Einträge zeigen den vollen Pfad als Tooltip, und externe Änderungen (Datei angelegt, gelöscht, umbenannt) erscheinen automatisch. Der Knopf „+" am Kopf der Dateiliste legt eine neue Markdown-Datei im ausgewählten Ordner an und öffnet sie. In einer frisch geöffneten, noch leeren Bereichs-Applikation ist das Panel automatisch sichtbar.

### Bereichs-Statistik

„Ansicht → Bereichs-Statistik" öffnet eine Kennzahlen-Seite des geöffneten Bereichs als eigenen Reiter; derselbe Einstieg liegt im Kontextmenü des Bereichs-Panels. Die Seite ist nicht änderbar und zeigt sechs Abschnitte: **Dateien und Speicher** (Markdown- und Nicht-Markdown-Dateien nach Bildern, PDF und Sonstigem, Ordner-Anzahl, belegter Speicher mit seinen Anteilen), **Eigenschaften** und **Tags** (je Eintrag die Zahl der Dateien, sortierbar nach Name oder Anzahl), **Begleitdateien** (die `.mdd` je Dokument und die Bereichs-Dateien `.mdda`), **Inhalte** (Aufgaben nach Zustand, Wiki- und Markdown-Verweise, Aliase, Dateien ohne eingehenden Verweis) und **Auffälligkeiten** (die größten, die zuletzt geänderten und die meistverlinkten Dateien). Ein Klick auf einen Dateinamen der letzten drei Listen öffnet die Datei.

Gezählt werden **Dateien, nicht Fundstellen**: Steht beim Tag `#projekt` die Zahl 180, tragen 180 Dateien diesen Tag; wie oft er in ihrem Text vorkommt, bleibt offen. Lange Listen zeigen zunächst 25 Zeilen und lassen sich vollständig aufklappen.

Die Zahlen tragen oben einen Stand-Zeitstempel und werden **auf Anforderung** erhoben, nicht laufend: Der Knopf „Aktualisieren" erhebt neu, ebenso der erneute Aufruf des Menü-Eintrags. Ohne geöffneten Bereich gibt es keinen abgegrenzten Datei-Raum; der Eintrag ist dann ausgegraut. Die Funktion ist als Erweiterung „Bereichs-Statistik" abschaltbar.

### Zuletzt geöffnete Bereiche

„Datei → Bereich → Zuletzt geöffnete Bereiche" listet die zuletzt geöffneten Bereiche mit ihrem Ordnernamen. Ein Klick öffnet den Bereich nach den üblichen Regeln. Bereiche werden mit der Sitzung wiederhergestellt; fehlt ein Bereichs-Ordner beim Start, wird die zugehörige Applikation nicht wiederhergestellt und ein Hinweis gezeigt.

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
