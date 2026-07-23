# Sidebar

Die Sidebar bündelt die Panels der App — von Lesezeichen, Inhaltsverzeichnis und Bereich über Properties, Tags und Backlinks bis zu Kalender, Erinnerungen und Datei-Graph (die vollständige Liste zeigt die [Funktions-Tabelle](functions.md)). Jede Spalte hat eine Sidebar-Fläche links und rechts vom Inhalt. Welche Panels sichtbar sind, wird pro Spalte geschaltet; die Anordnung der Panels (Seite, Reihenfolge, Gruppen) gilt für die ganze App.

## Panels ein- und ausblenden

Jedes Panel hat ein Statusbar-Icon und einen Eintrag im Untermenü Ansicht → Panels (Standard-Kürzel in der [Tastenkürzel-Übersicht](shortcuts.md)); der Schalter wirkt auf die aktive Spalte. Beide Orte führen dieselben Panels in derselben Reihenfolge; die Reihenfolge lässt sich unter Einstellungen → Panel-Reihenfolge frei sortieren und wirkt auf Menü und Statusbar gleichzeitig. Die Inhalte der einzelnen Panels beschreiben die [Funktions-Tabelle](functions.md) sowie die Seiten [Vernetzung](linking.md) (Tags, Backlinks, Outgoing-Links), [Frontmatter und Properties](frontmatter.md), [Dokument-Notizen](notes.md) (Notizen-Panel) und [Applikationen, Fenster und Bereiche](apps-windows.md) (Bereichs-Panel).

## Spalten ein- und ausklappen

Über die einzelnen Panel-Schalter hinaus lässt sich eine ganze Sidebar-Spalte auf einmal ein- und ausklappen, wenn kurz mehr Platz für den Text gebraucht wird. Das Einklappen legt sich als eigener Zustand über die Panel-Sichtbarkeiten, ohne sie zu verändern; das Ausklappen stellt genau den vorherigen Stand wieder her.

- **Kopf-Symbol:** In der obersten Kopfzeile jeder Spalte sitzt am inneren Rand, dort wo die Spalte an den Text stößt, ein Sidebar-Symbol. Ein Klick klappt die Spalte ein. Das Symbol steht in der linken Spalte rechtsbündig und in der rechten gespiegelt linksbündig; es erscheint gleichermaßen im Sektions-Kopf und in der Reiterleiste einer Gruppe sowie in der Text- wie in der Symbol-Darstellung der Überschriften.
- **Eingeklappt:** Eine eingeklappte Spalte bleibt als schmaler Strich am Fensterrand sichtbar. Beim Überfahren mit der Maus erscheint dort das Symbol; ein Klick klappt die Spalte wieder aus. Der Tooltip wechselt dabei zwischen Einklappen und Ausklappen.
- **Menü und Kommandos:** Ansicht → Linke Sidebar einklappen und Ansicht → Rechte Sidebar einklappen schalten dieselben Zustände. Beide Kommandos stehen auch in der Kommando-Palette und lassen sich unter Einstellungen → Tastenkürzel mit einem Kürzel belegen; eine Vorbelegung gibt es nicht.

In der geteilten Ansicht schaltet jede Editor-Spalte ihre beiden Sidebars eigenständig; ein Einklappen wirkt nur auf die eigene Spalte. Der zuletzt eingestellte Zustand wird global gespeichert und gilt beim nächsten Start weiter.

Eine Spalte ohne sichtbares Panel bleibt unverändert und verschwindet wie bisher ganz, ohne Strich und ohne Symbol. Der Fokus-Modus blendet die Sidebar zusätzlich rein visuell aus und lässt den Einklapp-Zustand unberührt; beim Verlassen gilt er unverändert weiter.

## Anordnung: Seite und Reihenfolge

Jedes Panel kann links oder rechts stehen, die Reihenfolge ist frei wählbar. Zwei Wege führen zur Wunsch-Anordnung:

- **Drag-and-Drop:** den Panel-Titel (bei Gruppen den Reiter) ziehen. Das obere bzw. untere Drittel eines Panels sortiert davor bzw. dahinter, die Mitte bildet eine Reiter-Gruppe, die Freifläche einer Sidebar hängt das Panel dort an — bei einer leeren Seite erscheint während des Ziehens ein schmaler Ablage-Streifen. Ziel-Zonen werden farblich markiert, Esc bricht ab. Änderungen wirken sofort, auch in anderen Fenstern.
- **Einstellungen → Sidebar:** beide Seiten als Listen mit Aktionen zum Verschieben (nach oben, nach unten, Seitenwechsel), Gruppieren und Lösen sowie ein Zurücksetzen auf die Standard-Anordnung. Änderungen wirken bei Anwenden oder OK.

Die **Standard-Anordnung** verteilt die Panels auf beide Seiten und bündelt sie in thematischen Reiter-Gruppen: links die Einstiegs-, Struktur- und Termin-Panels, rechts Notizen sowie die Metadaten- und Link-Panels. Sie gilt, solange keine eigene Anordnung eingestellt ist; „Auf Standard-Anordnung zurücksetzen" stellt genau diese Verteilung wieder her.

## Varianten

Die aktuelle Anordnung lässt sich als **benannte Variante** speichern — samt der Panel-Sichtbarkeit beider Spalten, also dem kompletten Aufbau der Sidebar. Beliebig viele Varianten sind möglich, etwa eine für Konzeptarbeit und eine für Tagesarbeit.

- **Speichern:** Ansicht → Sidebar-Anordnungen → „Aktuelle Anordnung speichern …" oder der gleichnamige Knopf unter Einstellungen → Sidebar, Abschnitt Varianten. Der Name wird im Dialog vergeben; Speichern unter einem vorhandenen Namen aktualisiert diese Variante.
- **Anwenden:** per Klick im Untermenü Ansicht → Sidebar-Anordnungen, über das Auswahl-Popup des Kommandos „Sidebar-Variante anwenden" oder in den Varianten-Listen der Einstellungen. Anwenden ersetzt die aktuelle Anordnung sofort; spätere Umbauten ändern die Variante nicht — „Überschreiben" übernimmt die aktuelle Anordnung ausdrücklich in eine bestehende Variante.
- **Verwalten:** Einstellungen → Sidebar, Abschnitt Varianten listet die globalen Varianten mit Anwenden, Umbenennen, Überschreiben und Löschen.

**Bereichs-Varianten** gehören zu einem Bereich: sie liegen in dessen Bereichsdatei, wandern mit dem Bereichs-Ordner und erscheinen nur bei geöffnetem Bereich, im Menü getrennt als eigene Gruppe mit dem Bereichs-Namen. Ihre Verwaltung samt eigenem Speichern-Knopf liegt im Einstellungs-Bereich „Sidebar-Varianten" der Gruppe „Aktueller Bereich"; beim Speichern über Menü oder Kommando wählt eine Option im Dialog das Ziel (global oder Bereich). Gleiche Namen in beiden Gruppen sind erlaubt. Der Eintrag „Standard-Anordnung" im Untermenü stellt jederzeit die mitgelieferte Verteilung wieder her.

Varianten sind von den Arbeitsbereichen unabhängig: ein Arbeitsbereich merkt sich Fenster und Tabs, eine Sidebar-Variante ausschließlich den Aufbau der Sidebar.

## Reiter-Gruppen

Mehrere Panels an derselben Position teilen sich den Platz als Reiter-Gruppe: eine Reiterleiste ersetzt die Panel-Titel, sichtbar ist jeweils das aktive Panel. Das Einblenden eines gruppierten Panels aktiviert dessen Reiter; der aktive Reiter wird gemerkt.

## Breiten

Jede Seite hat eine eigene Breite (180 bis 500 Pixel), ziehbar am Splitter zwischen Sidebar und Inhalt. Die Breite gilt je Seite für beide Spalten und bleibt gespeichert.

## Panel-Höhen

Stehen mehrere Panels gestapelt auf einer Sidebar-Seite, sitzt zwischen je zwei Panels ein Zieh-Griff. Er stellt die Höhe des Panels darüber ein: den Griff mit der Maus nach oben oder unten ziehen. Eingestellte Höhen bleiben gespeichert und werden beim Start wiederhergestellt; ein Doppelklick auf den Griff stellt die automatische Höhe wieder her.

Das unterste Panel einer Seite hat keinen Griff, weil hinter ihm kein weiteres folgt. Es folgt deshalb immer der Höhe seines Inhalts und nimmt den Platz, den die Panels darüber ihm lassen. Ein Rollbalken erscheint dort nur, wenn dieser Platz für den Inhalt nicht ausreicht.

## Überschriften als Symbol

Die Panel-Überschriften lassen sich von Text auf das Symbol des jeweiligen Panels umstellen (Einstellungen → Sidebar). Die Umstellung wirkt auf die Sektions-Köpfe und auf die Reiter gruppierter Panels gleichermaßen; der Panel-Name bleibt als Kurzhinweis am Zeiger und für Screenreader erhalten. Wie die Anordnung wirkt der Schalter erst mit Anwenden oder OK.
