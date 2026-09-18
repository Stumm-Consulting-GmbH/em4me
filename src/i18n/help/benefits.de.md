# Nutzen und Arbeitsweise

Diese Seite beantwortet nicht, **wie** etwas geht, sondern **wozu** es gut ist. Sie hat zwei Hälften: Die erste Hälfte zeigt, welche **Arbeitsformen** die Anwendung eröffnet, vom einzelnen Dokument bis zum benannten Arbeitsraum. Die zweite Hälfte zeigt, was sich in einer Markdown-Datei **ausdrücken** lässt, das über den Markdown-Standard hinausgeht. Wo es konkret wird, führt am Ende jedes Abschnitts ein Verweis auf die Seite, die den Gegenstand ausführlich behandelt.

## Ein Dokument, so wie Sie es gerade brauchen

Lesen, schreiben und prüfen sind verschiedene Tätigkeiten, und sie brauchen verschiedene Darstellungen desselben Textes. Statt einen Kompromiss zu erzwingen, hält die Anwendung sechs Ansichten bereit, zwischen denen ein Tastendruck wechselt: die fertige Seite zum Lesen, den Quelltext zum genauen Arbeiten, beides nebeneinander zum Vergleichen, den Live-Modus zum flüssigen Schreiben, die Mindmap für den Blick auf die Gliederung und die Canvas für Karten auf einer Fläche. Der Wechsel kostet nichts und verändert die Datei nicht.

- **Gerendert** zum Lesen, **Quellcode** für die genaue Arbeit an der Syntax.
- **Geteilt** zeigt Quelltext und Ergebnis nebeneinander, für Konstrukte mit Tücken.
- **Live** formatiert beim Tippen und zeigt die Markdown-Zeichen nur in der aktuellen Zeile.
- **Mindmap** macht aus der Überschriften-Gliederung eine Baumkarte.
- **Canvas** zeigt eine Fläche mit Karten und Verbindungen, die im Dokument selbst liegt.

Ausführlich: [Ansichten und Darstellung](views-display.md), [Mindmap](mindmap.md), [Canvas-Fläche](canvas.md).

## Viele Dokumente nebeneinander

Ein Gedanke steht selten in einer Datei. Deshalb sind mehrere Dokumente gleichzeitig offen, in Reitern, die sich ordnen lassen: farbige Gruppen halten zusammen, was zusammengehört, die zweite Spalte legt zwei Dokumente nebeneinander, und die Sidebar hält Inhaltsverzeichnis, Rückverweise, Notizen oder Aufgaben im Blick, während Sie schreiben. Alles davon ist Ihre Entscheidung, nicht die des Programms: Panels wandern zwischen linker und rechter Seite, Breiten und Höhen bleiben, wie Sie sie gestellt haben.

- **Reiter** für beliebig viele offene Dokumente, mit Mehrfach-Auswahl und wählbarer Position.
- **Reiter-Gruppen** bündeln zusammengehörende Dokumente farbig.
- **Zwei Spalten** im selben Fenster für Quelle und Ziel, Entwurf und Vorlage, Kapitel und Notiz.
- **Sidebar-Panels** links oder rechts, in Reihenfolge, Breite und Höhe frei gestellt.

Ausführlich: [Applikationen, Fenster und Bereiche](apps-windows.md), [Sidebar](sidebar.md).

## Mehr als ein Fenster, mehr als ein Kontext

Wer an mehreren Dingen zugleich arbeitet, kommt mit einem Fenster nicht aus. Ein Reiter wandert per Kontextmenü in ein neues Fenster, und mehrere Fenster gehören zu einer Applikation, dem gemeinsamen Arbeitskontext. Davon lassen sich mehrere starten: Jede Applikation hat ihre eigenen Fenster und ihre eigene Zählung, sodass zwei Vorhaben sich nicht ins Gehege kommen, auch wenn beide dieselbe Anwendung nutzen. Beim nächsten Start stellt die Sitzungs-Wiederherstellung alles zusammen wieder her.

- **Fenster** in beliebiger Zahl, Reiter wandern zwischen ihnen.
- **Applikationen** als eigenständige Arbeitskontexte mit eigenen Fenstern.
- **Sitzungs-Wiederherstellung** bringt Applikationen, Fenster und Reiter zurück.

Ausführlich: [Applikationen, Fenster und Bereiche](apps-windows.md).

## Ordnung durch Grenzen, Ordnung durch Gedächtnis

Zwei verschiedene Formen von Ordnung stehen bereit, und der Unterschied lohnt sich zu kennen. Ein **Bereich** bindet eine Applikation an einen Ordner und macht ihn zur Grenze: Öffnen-Dialog, Zuletzt-Liste, Speichern und Suche bleiben darin, sodass ein vertrauliches Projekt nicht versehentlich in ein anderes ausfranst. Ein **Arbeitsbereich** dagegen merkt sich einen Zustand: alle Fenster, Reiter, Gruppen und Entwürfe unter einem Namen, ohne Speicher-Schritt aktuell gehalten. Wer ihn Wochen später öffnet, sitzt wieder genau dort, wo er aufgehört hat. Beides lässt sich verbinden.

- **Bereich** heißt Ordner-Grenze: Was außerhalb liegt, kommt nicht herein — mit genau einer Ausnahme, die Sie selbst setzen.
- **Arbeitsbereich** heißt gespeicherter Arbeitszustand, benannt und farbig gekennzeichnet.
- **Beides zusammen** ergibt einen benannten Arbeitszustand mit fester Ordner-Grenze.
- **Verknüpfte Bereiche** sind diese Ausnahme: ein eingetragenes Kürzel, eine Richtung, ein Verweis, der hinüberträgt. Eine Tür, keine offene Grenze.

Ausführlich: [Applikationen, Fenster und Bereiche](apps-windows.md).

## Ein Netz statt einer Ablage

Wissen wächst selten in Ordnern. Es wächst in Verbindungen: Eine Notiz verweist auf eine zweite, die dritte greift beide auf, und nach einem Jahr trägt der Bestand mehr Zusammenhang, als eine Ordner-Struktur je abbilden könnte. Dieser Zusammenhang wird mitgeführt und ist von zwei Seiten lesbar — als Fläche, die zeigt, was womit zusammenhängt, und als Baum, der zeigt, was von einem Einstieg aus in welcher Tiefe darunter hängt.

- **Verweise in beide Richtungen**: was dieses Dokument nennt, und wer dieses Dokument nennt.
- **Das Netz** zeigt die Umgebung eines Dokuments, **der Baum** ab einer wählbaren Wurzel die Ordnung darunter.
- **Jede Datei genau einmal** im Baum, auf ihrem kürzesten Weg zur Wurzel; ein Klick öffnet sie.
- **Was niemand verweist**, bleibt nicht verborgen: Die Bereichs-Statistik nennt diese Dateien beim Namen.

Ausführlich: [Vernetzung](linking.md) und [Graphenansicht](graph.md).

## Wenn die Reihenfolge nicht mehr ausreicht

Manche Gedanken haben keine Reihenfolge. Wer Alternativen nebeneinanderlegt, einen Ablauf skizziert oder Zusammenhänge sortiert, braucht Fläche statt Zeilen — und muss selbst bestimmen, was wo liegt. Eine Canvas ist genau das: eine Fläche in einer gewöhnlichen Markdown-Datei, auf der Sie Karten mit eigenem Text frei anordnen und mit beschrifteten, farbigen Linien verbinden. Anders als die Graphenansicht rechnet sie nichts aus, sondern hält fest, was Sie gelegt haben — und weil sie im Dokument steht, bleiben die Karten-Texte auch in jedem anderen Text-Programm lesbar.

- **Karten mit eigenem Text**, frei platziert und in der Größe wählbar; ihr Inhalt ist gewöhnliches Markdown.
- **Verbindungen mit Richtung, Farbe und Beschriftung** — auch mit Pfeil an beiden Enden, mit wählbarer Anschluss-Seite.
- **Ihre Anordnung bleibt Ihre**: Die Fläche rechnet keine Positionen aus, sie merkt sich, was Sie gelegt haben.
- **Klartext im Dokument**: Die Fläche liegt in einem Code-Block der Markdown-Datei und ist auch ohne EM4me lesbar.
- **Auch ohne Maus**: Eine Liste neben der Fläche führt alle Elemente auf, lässt sie mit der Tastatur anlegen, beschriften, verbinden und löschen — und durchsuchen.

Ausführlich: [Canvas-Fläche](canvas.md).

## Aus Dateien wird ein Buch

Ein längeres Werk besteht aus vielen Dateien, und ihre Reihenfolge steckt sonst im Dateinamen oder in der Ordner-Lage, wo sie bei jeder Umbenennung wieder zur Disposition steht. Ein Buch dreht das um und schreibt seine Gliederung ausdrücklich auf: Die Kapitel bleiben gewöhnliche Markdown-Dateien, die auch ohne die Anwendung lesbar sind, aber ihre Ordnung und Verschachtelung liegt fest, das Inhaltsverzeichnis zeigt sie, und die Leseführung blättert über Kapitel-Grenzen hinweg durch das ganze Werk. Bücherregale fassen mehrere Bücher zusammen.

- **Erklärte Lese-Ordnung** statt alphabetischer Sortierung nach Dateinamen.
- **Kapitel bleiben Dateien**, einzeln lesbar und anderswo verwendbar.
- **Leseführung** blättert durchgehend, das Verzeichnis ordnet per Ziehen oder Tastatur um.
- **Bücherregale** gruppieren mehrere Bücher.

Ausführlich: [Bücher](books.md).

## Wenn ein Dokument größer wird als eine Datei

Ein Dokument wächst manchmal über das hinaus, was sich flüssig bearbeiten lässt. Statt Ihnen dafür eine Grenze zu setzen, teilt die Anwendung ein solches Dokument beim Speichern selbst in mehrere Dateien und setzt es beim Öffnen wieder zusammen. Sie merken davon nichts: ein durchgehender Text, ein Rückgängig-Verlauf, ein Suchtreffer. Geschnitten wird nur an Überschriften, damit kein Konstrukt auseinandergerissen wird, und jede Teil-Datei bleibt eine gewöhnliche Markdown-Datei, die auch ohne die Anwendung lesbar ist.

- **Die Größe hört auf, eine Grenze zu sein** — auch sehr umfangreiche Dokumente bleiben bedienbar.
- **Unsichtbar im Arbeitsfluss**: ein Reiter, ein Text, ein Suchergebnis.
- **Geschnitten wird an Überschriften**, nie mitten in Tabelle, Liste oder Code-Block.
- **Umkehrbar**: ein Menü-Befehl macht aus den Teilen wieder eine einzige Datei.

Ausführlich: [Teilung großer Dokumente](document-parts.md).

## Daten und Prosa in denselben Dateien

Ein Ordner mit Markdown-Dateien kann zugleich eine Datenbank sein, und Sie erklären ihn nicht eigens dazu: Sobald ein Dokument die Datenbank beschreibt, führt der Bereich eine Datenbank, und eine eigene Übersicht beantwortet an einer Stelle, was in ihm liegt, also Name und Beschreibung, die Tabellen mit der Zahl ihrer Felder und die Fehlerlagen im Klartext. Die Tabellen selbst sind gewöhnliche Dateien: Die Definition steht im Kopf, die Datensätze stehen im Körper darunter, und damit ist eine Tabelle in einer Datei vollständig. Der eigentliche Gewinn liegt daneben. Aus einem beliebigen Text des Bereichs heraus verweisen Sie auf eine einzelne Zeile einer Tabelle, so wie Sie sonst auf eine Datei verweisen; die Notiz über eine Besprechung zeigt damit auf den Datensatz der Person, über die sie spricht.

- **Der Bereich wird zur Datenbank**, sobald ein Dokument sie beschreibt, und bekommt seine eigene Übersicht als reine Lese-Ansicht.
- **Die Tabelle steht in ihrer Datei**: Felder im Kopf, Datensätze im Körper. Umbenennen und Verschieben ändern daran nichts, auch außerhalb der Anwendung.
- **Acht Spalten-Typen** mit Beschriftungen, die in mehreren Sprachen vorliegen dürfen.
- **Der Verweis auf einen einzelnen Datensatz** wird wie ein Anker geschrieben und verhält sich wie jeder andere Verweis: Der Linter zeigt an, ob er gilt, und ein Klick öffnet die Tabellen-Datei.
- **Große Bestände bleiben eine Tabelle**: Ab etwa 0,7 MB verteilt die Anwendung die Datensätze beim Speichern auf mehrere Dateien nebeneinander, ohne dass ein Verweis davon berührt wird.

Was dieser erste Ausbau noch nicht bringt: Erfasst werden Datensätze weiterhin im Text der Datei, es gibt keine Eingabe-Maske, keine Prüfung der Werte beim Schreiben und keine Abfrage über die Datensätze.

Ausführlich: [Datenbank](database.md).

## Die Anwendung passt sich an — und kommt mit

Wer lange mit einem Programm arbeitet, formt es: Farben, Tastenkürzel, Schaltflächen, Vorlagen und Lesezeichen wachsen mit der eigenen Arbeitsweise, und irgendwann gehört auch die Sprache dazu, in der die Oberfläche spricht. Diese Arbeit war bisher an einen Rechner gebunden und an die mitgelieferten Sprachen. Beides ist offen: Die eigene Einrichtung lässt sich in eine lesbare Datei schreiben und anderswo wieder einlesen, und wer eine sechste Sprache braucht, übersetzt die Oberfläche selbst. Dazu kommt der Blick auf das Ganze — eine Seite, die alle eigenen Arbeitsbereiche, Bereiche, Bücher und Bücherregale nebeneinander zeigt, auch die, die gerade nicht angeschlossen sind.

- **Die Einrichtung als Datei**: ausgeben, mitnehmen, anderswo einlesen — vollständig oder in Teilen, mit einer Vorschau, die vorher sagt, was geschieht.
- **Eine sechste Sprache: Ihre eigene.** Eine Vorlage übersetzen, einspielen, in der Statusleiste wählen; was darin fehlt, erscheint auf Englisch statt als roher Schlüssel.
- **Alle Gefäße an einem Ort**: eingetragen statt automatisch erfasst, mit Kennzahlen und dem Zeitpunkt, zu dem sie erhoben wurden.
- **Nichts geschieht ungefragt**: Kein Laufwerk wird durchsucht, und kein Einlesen schreibt, bevor Sie bestätigt haben.

Ausführlich: [Einstellungen exportieren und importieren](setup-exchange.md), [Eigene Oberflächen-Sprache](custom-locale.md), [My Extended Memory](my-extended-memory.md).

## Tabellen, die mehr tragen als eine Zeile

Damit endet die Frage nach den Arbeitsformen und beginnt die Frage, was sich in der Datei ausdrücken lässt. Der Markdown-Standard braucht hier keine Erklärung; interessant ist, was darüber hinausgeht, und das beginnt bei der Tabelle. Eine Standard-Tabelle ist zeilenbasiert und nimmt deshalb nur kurzen Text auf. Die Perspective Table nimmt ganze Blöcke in eine Zelle: geschachtelte Listen, mehrere Absätze, Code-Blöcke, Bilder, sogar eine Tabelle in der Tabelle. Aus der Tabelle wird damit ein Gliederungs-Werkzeug für echte Inhalte statt einer Sammlung von Stichworten.

- **Block-Zellen** mit Listen, Absätzen, Code und Bildern statt einzeiliger Felder.
- **Verschachtelung**, Zellverbünde und Ausrichtung für anspruchsvolle Aufstellungen.
- **Sortierung und Status-Hervorhebung** direkt in der gerenderten Tabelle.
- **Lesbar auch anderswo:** Der Block bleibt in anderen Markdown-Programmen ein sauberer Code-Block, statt den Text zu zerreißen.

Ausführlich: [Perspective Table](perspective-table.md).

## Tabellen, die rechnen

Für Zahlen statt Text gibt es die zweite Tabellen-Art. Die Perspective Datatable ist eine typisierte Datentabelle: Jede Spalte hat einen Wertetyp, Zellen nehmen nur passende Werte an, Aggregat-Zeilen rechnen live mit, und berechnete Spalten werten je Zeile einen Ausdruck aus. Bearbeitet wird direkt im gerenderten Gitter, ohne den Umweg über den Quelltext. Das trägt Ausgaben, Zeiterfassung oder Inventarlisten, ohne dass daraus eine Datenbank-Datei wird, denn alles bleibt Klartext im Dokument.

- **Feste Wertetypen** je Spalte, damit Zahlen Zahlen bleiben und Daten Daten.
- **Aggregate**, die live rechnen, und **berechnete Spalten** je Zeile.
- **Bearbeiten im Gitter**, ohne in den Quelltext zu wechseln.
- **Rechnen auch im Fließtext:** Inline-Berechnungen nutzen dieselbe Ausdrucks-Sprache mitten im Satz.
- **Klartext bleibt Klartext:** Die Daten stehen unverändert in der Markdown-Datei.

Ausführlich: [Perspective Datatable](datatable.md).

## Dokument-Arten, die sich aufeinander stützen

Viele Dokumente eines Bereichs teilen dieselben Felder: ein Status, ein Datum, eine Kategorie. Eigenschafts-Profile beschreiben diese Felder einmal zentral, mit Typ, zulässigen Werten und Vorgabe; die Eigenschafts-Editoren schlagen sie vor und bedienen die Wertebereiche als Auswahl-Listen. Profile erben voneinander: Ein Basis-Profil sagt, was für alle gilt, und eine Dokument-Art wie Artikel oder Sitzung ergänzt nur noch ihren eigenen Anteil, schließt Geerbtes bei Bedarf aus oder überschreibt es. Abweichungen erzeugen Hinweise statt Sperren. Welches Profil gilt, muss dabei nicht im Dokument stehen: Ein Schlagwort oder der Ordner genügt, und ein Symbol am Dokument zeigt, welches es geworden ist. Auch der zulässige Wertevorrat eines Feldes darf aus dem eigenen Bestand kommen statt aus der Definition.

- **Felder einmal beschreiben** statt in jedem Dokument neu: Vorschläge, Auswahl-Listen und Typen kommen aus dem Profil.
- **Vererbung mit Ausschluss und Überschreiben:** Gemeinsames im Eltern-Profil, Eigenes in der Dokument-Art.
- **Weiche Hinweise statt Sperren:** Abweichungen werden benannt, nichts wird blockiert.
- **Zuordnung ohne Eintrag im Dokument:** Ein Schlagwort oder der Ordner entscheidet, welches Profil gilt.
- **Wertelisten, die sich selbst pflegen:** Der Wertevorrat kommt wahlweise aus einer Notiz oder aus einer Abfrage über den Bestand.
- **Felder, die eine Struktur tragen:** Eine Sitzung mit drei Teilnehmern braucht ein Feld statt drei paralleler Listen für Name, Rolle und Firma — im Metadaten-Block bleibt sie gewöhnliches, lesbares YAML.

Ausführlich: [Eigenschafts-Profile](property-profiles.md).

## Listen, die sich selbst aktuell halten

Wer viele Dateien führt, pflegt sonst Übersichten von Hand, und sie veralten am Tag ihrer Erstellung. Eine Perspective-Abfrage beschreibt stattdessen, **was** gesucht ist, und das Ergebnis erscheint an Ort und Stelle im Dokument: eine klickbare Liste oder Tabelle über den Bestand, gefiltert nach Eigenschaften, Schlagwörtern, Datei-Feldern, bis hinunter auf einzelne Textblöcke und Aufgaben. Ändert sich der Bestand, ändert sich die Ausgabe, ohne dass jemand nachträgt.

- **Themen-Seiten**, die ihre zugehörigen Dateien selbst auflisten.
- **Filter** über Frontmatter-Eigenschaften, Schlagwörter und Datei-Felder.
- **Block- und Aufgaben-Ebene**, nicht nur ganze Dateien.
- **Jeder Treffer klickbar** und führt direkt zum Ziel.

Ausführlich: [Perspective-Abfrage](frontmatter-query.md).

## Wenn die Abfrage nicht reicht: Skripte

Manche Auswertung lässt sich nicht als Bedingung formulieren, etwa ein rekursiver Baum entlang der Verweise oder eine Übersicht, die unterwegs rechnet. Dafür gibt es Skript-Blöcke: Ein Block führt ein kleines Programm aus, liest denselben Bestand wie die Abfrage und gibt Listen, Tabellen oder fertig formatierten Text ins Dokument aus. Weil das mehr Freiheit bedeutet, ist die Funktion an ein ausdrückliches Vertrauens-Modell und an Laufzeit-Grenzen gebunden und ab Werk nicht einfach aktiv.

- **Freie Auswertungen** über denselben Datenbestand wie die Abfrage.
- **Rekursive Strukturen** und berechnete Übersichten, die deklarativ nicht ausdrückbar sind.
- **Ausdrückliches Vertrauens-Modell** und Laufzeit-Grenzen statt stiller Ausführung.

Ausführlich: [Skript-Blöcke](scripts.md).

## Und der Rest der Sprache

Über die vier großen Konstrukte hinaus bringt der Sprachumfang mehr als fünfzig Erweiterungen: Hinweisblöcke und Fußnoten für den Text, Formeln und Diagramme für die Darstellung, Verweise, Schlagwörter und Einbettungen für den Zusammenhang, Aufgaben, Erinnerungen und Termine für die Arbeit am Tag, dazu Vorlagen und Journale. Nichts davon ist Pflicht: Jede Erweiterung hat ihren eigenen Schalter, und was ausgeschaltet ist, verschwindet aus Menüs, Befehlen und Darstellung, statt im Weg zu stehen.

- **Text-Erweiterungen** für Hinweisblöcke, Fußnoten, Hervorhebungen und Abkürzungen.
- **Darstellung** mit Formeln, Diagrammen und hervorgehobenem Code; beim portablen Export reist ein Diagramm als fertiges Bild mit und ist auch dort zu sehen, wo EM4me nicht installiert ist.
- **Bezug im Text** über Anker, Einbettungen und Schlagwörter.
- **Arbeit am Tag** mit Aufgaben, Erinnerungen, Terminen, Vorlagen und Journalen.
- **Einzeln schaltbar** und offen für eigene Erweiterungen über eine dokumentierte Schnittstelle.

Ausführlich: [Funktionen](functions.md), [Erweiterungen](extensions.md), [Eigene Erweiterungen](extensions-dev.md).
