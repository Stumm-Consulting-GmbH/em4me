# Nutzen und Arbeitsweise

Diese Seite beantwortet nicht, **wie** etwas geht, sondern **wozu** es gut ist. Sie hat zwei Hälften: Die ersten fünf Abschnitte zeigen, welche **Arbeitsformen** die Anwendung eröffnet, vom einzelnen Dokument bis zum benannten Arbeitsraum. Die zweite Hälfte zeigt, was sich in einer Markdown-Datei **ausdrücken** lässt, das über den Markdown-Standard hinausgeht. Wo es konkret wird, führt am Ende jedes Abschnitts ein Verweis auf die Seite, die den Gegenstand ausführlich behandelt.

## Ein Dokument, so wie Sie es gerade brauchen

Lesen, schreiben und prüfen sind verschiedene Tätigkeiten, und sie brauchen verschiedene Darstellungen desselben Textes. Statt einen Kompromiss zu erzwingen, hält die Anwendung fünf Ansichten bereit, zwischen denen ein Tastendruck wechselt: die fertige Seite zum Lesen, den Quelltext zum genauen Arbeiten, beides nebeneinander zum Vergleichen, den Live-Modus zum flüssigen Schreiben und die Mindmap für den Blick auf die Gliederung. Der Wechsel kostet nichts und verändert die Datei nicht.

- **Gerendert** zum Lesen, **Quellcode** für die genaue Arbeit an der Syntax.
- **Geteilt** zeigt Quelltext und Ergebnis nebeneinander, für Konstrukte mit Tücken.
- **Live** formatiert beim Tippen und zeigt die Markdown-Zeichen nur in der aktuellen Zeile.
- **Mindmap** macht aus der Überschriften-Gliederung eine Baumkarte.

Ausführlich: [Ansichten und Darstellung](views-display.md), [Mindmap](mindmap.md).

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

- **Bereich** heißt Ordner-Grenze: Was außerhalb liegt, kommt nicht herein.
- **Arbeitsbereich** heißt gespeicherter Arbeitszustand, benannt und farbig gekennzeichnet.
- **Beides zusammen** ergibt einen benannten Arbeitszustand mit fester Ordner-Grenze.

Ausführlich: [Applikationen, Fenster und Bereiche](apps-windows.md).

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
- **Darstellung** mit Formeln, Diagrammen und hervorgehobenem Code.
- **Zusammenhang** über Verweise, Anker, Einbettungen und Schlagwörter.
- **Arbeit am Tag** mit Aufgaben, Erinnerungen, Terminen, Vorlagen und Journalen.
- **Einzeln schaltbar** und offen für eigene Erweiterungen über eine dokumentierte Schnittstelle.

Ausführlich: [Funktionen](functions.md), [Erweiterungen](extensions.md), [Eigene Erweiterungen](extensions-dev.md).
