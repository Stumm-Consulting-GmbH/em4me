# Dashboards

Ein **Dashboard** ordnet **Kacheln** in Zeilen an. Jede Kachel führt eine [Perspective-Abfrage](frontmatter-query.md) aus und zeigt ihr Ergebnis als Kennzahl, Liste, Tabelle, Balken- oder Kreis-Diagramm, oder sie trägt eigenen Text. **Filter** am Kopf grenzen die Abfragen aller Kacheln zugleich ein. So entsteht eine Übersicht, die sich mit dem Bestand des Bereichs von selbst aktuell hält: offene Aufgaben je Status, Seiten je Thema, die längsten Bücher einer Datenbank-Tabelle, alles auf einen Blick.

**Nicht zu verwechseln mit der Ansicht «Dashboard» der Ereignisse.** Ein [Ereignis-Block](events.md) kennt unter seinen Ansichten eine, die ebenfalls «Dashboard» heißt (`view: dashboard`): Sie bündelt die anstehenden Ereignisse, Meilensteine und die Kategorie-Verteilung **dieses einen Blocks**. Diese Seite beschreibt etwas anderes: den eigenen Code-Block `perspective-dashboard`, dessen Kacheln beliebige Abfragen über den ganzen Bereich zeigen.

Getragen wird ein Dashboard von einem Code-Block mit dem Sprach-Tag `perspective-dashboard`. Ein Dokument darf beliebig viele davon enthalten, und alles Übrige darin bleibt gewöhnliches Markdown.

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) («Dashboard») und ist ab dem Arbeitsmodus **Fortgeschritten** eingeschaltet. Sie hängt von keiner anderen Erweiterung ab, auch nicht vom «Diagramm einer Abfrage». Ist sie abgeschaltet, erscheint der Block als Quelltext mit einem Hinweis darüber, und das Kommando «Dashboard einfügen» entfällt. Das Dokument bleibt unverändert, und nach dem Einschalten erscheint das Dashboard wieder.

## Dashboard einfügen

Das Kommando **«Dashboard einfügen»** setzt an der Schreibmarke ein Gerüst ein. Zwei Wege führen hin: die Kommando-Palette (Standard `Strg+K`) und das Editor-Kontextmenü → Einfügen → Dashboard einfügen. Ein Tastenkürzel ist nicht vorbelegt und lässt sich in den Einstellungen vergeben. Das Kommando setzt ein änderbares Dokument voraus.

Eingefügt wird eine Zeile mit einer Kennzahl über alle Dokumente des Suchraums; ihr Titel folgt der eingestellten Programmsprache:

````markdown
```perspective-dashboard
!zeile
!kachel kennzahl titel="Anzahl"
LIST
```
````

Die Abfrage `LIST` ist danach ausgewählt, weil sie als Erstes ersetzt wird.

## Aufbau des Blocks

Innerhalb des Blocks beginnt jedes Element mit einer **Marker-Zeile**: Sie steht in Spalte 0 und beginnt mit `!` und einem Wort. Auf der Marker-Zeile stehen seine Angaben; die folgenden Zeilen bis zum nächsten Marker sind sein Inhalt. Es gibt drei Elemente:

| Marker | Schreibweise | Inhalts-Zeilen |
|---|---|---|
| `!filter` | `!filter <name> [titel="…"] [eigenschaft=<feld>] [vorbelegung=<wert>]` | aufgezählte Werte, einer je Zeile |
| `!zeile` | `!zeile` | keine |
| `!kachel` | `!kachel <art> [titel="…"] [breite=<anteil>] [abfrage="<Abfrage-Datei>"]` | die Abfrage, bei der Art `text` Markdown |

- **Angaben** haben die Form `name=wert`. Ein Wert ist ein Wort ohne Leerzeichen oder eine Zeichenkette in doppelten Anführungszeichen, in der `\"` für ein Anführungszeichen und `\\` für einen Rückstrich steht.
- **Wortschatz:** Die Wörter des Blocks sind deutsch, wie die der [Canvas-Fläche](canvas.md), und gelten in jeder Programmsprache gleich. Marker, Kachel-Arten und Breiten-Wörter stehen klein geschrieben; `!Kachel` ist ein unbekannter Marker. Allein die Namen der Filter sind frei in der Schreibung.
- **Schutz:** Eine Inhalts-Zeile, die in Spalte 0 mit `!` beginnen soll, wird mit `\!` geschützt, etwa eine Abfrage-Zeile, die mit `!=` anfängt.
- **Reihenfolge:** Filter dürfen überall im Block stehen und erscheinen gesammelt am Kopf, in der Reihenfolge des Blocks. Zeilen und Kacheln folgen der Reihenfolge des Blocks.
- **Unbekanntes bleibt erhalten.** Ein Marker oder eine Angabe, die die Anwendung nicht kennt, bleibt mit ihrem Text im Block stehen, und ein unverändertes Element wird wörtlich zurückgeschrieben. Ein Fehler wirft nie etwas weg: Er erscheint als Hinweis, und der Text bleibt, wie er ist.

## Filter (`!filter`)

Ein Filter wird am Kopf des Dashboards zu einem **Auswahlfeld**. Was darin gewählt ist, setzt die Anwendung in jede Abfrage ein, die seinen Platzhalter trägt (Abschnitt «Platzhalter in den Abfragen»).

````markdown
```perspective-dashboard
!filter status titel="Status" vorbelegung=offen
!filter prio titel="Priorität"
hoch
mittel
niedrig
```
````

- **Name:** Buchstaben, Ziffern und Unterstrich, am Anfang keine Ziffer; Umlaute sind erlaubt, Bindestrich und Punkt nicht. Groß- und Kleinschreibung zählen nicht. Der Name ist zugleich der Name des Platzhalters.
- **`titel=`** beschriftet das Auswahlfeld; ohne Angabe steht dort der Name.
- **Woher die Werte kommen:** Trägt der Filter Inhalts-Zeilen, sind die Werte **aufgezählt**: jede nicht leere Zeile ein Wert, Leerraum am Rand abgeschnitten. Sonst nennt **`eigenschaft=`** die Frontmatter-Eigenschaft, deren im Bereich vergebene Werte angeboten werden; ein Listen-Wert zählt je Element, und was im Vorlagen-Ordner liegt, zählt nicht. Fehlt beides, gilt die Eigenschaft gleichen Namens: `!filter status` allein ist vollständig. Stehen aufgezählte Werte und `eigenschaft=` zugleich da, gelten die aufgezählten, mit einem Hinweis am Feld.
- **Die Auswahl** beginnt immer mit dem Eintrag **«alle»**. Danach folgen die aufgezählten Werte in ihrer Reihenfolge oder die Werte aus dem Bestand alphabetisch nach der eingestellten Programmsprache. Kommt eine Eigenschaft im Bereich nicht vor, bietet das Feld nur «alle» an, ohne Hinweis.
- **`vorbelegung=`** bestimmt den Wert, mit dem das Feld beginnt; ohne Angabe ist es «alle». Bei aufgezählten Werten muss die Vorbelegung einer davon sein (ohne Rücksicht auf die Schreibung), sonst beginnt das Feld mit «alle», und am Feld steht ein Hinweis. Bei Werten aus dem Bestand gilt die Vorbelegung auch, wenn der Wert gerade nirgends vorkommt.
- **Die Wahl ist keine Änderung.** Sie gilt, solange das Dokument geöffnet ist, je Spalte der geteilten Ansicht eigens, und wird nie in die Datei geschrieben; das Dokument bekommt kein Änderungs-Zeichen. Nach dem Schließen und erneuten Öffnen beginnt das Feld wieder mit der Vorbelegung. Ändert sich die Reihe der Filter im Block, beginnen die Felder ebenfalls neu.
- **Nur, was betroffen ist, lädt neu.** Nach einer neuen Wahl werden allein die Kacheln neu ausgewertet, deren Abfrage den Platzhalter dieses Filters trägt; die übrigen bleiben stehen.
- **Die Werte bleiben aktuell.** Kommt im Bereich ein Wert hinzu oder fällt einer weg, zieht das Auswahlfeld nach. Ein gewählter Wert, der aus dem Bestand verschwunden ist, bleibt gewählt; die Kacheln zeigen dann keine Treffer, bis eine andere Wahl getroffen wird.
- **Grenzen der Felder:** Höchstens 20 Filter bekommen ein Auswahlfeld, und Werte mit mehr als 500 Zeichen werden nicht angeboten.
- **Fehlerfälle:** Ein Filter ohne gültigen Namen entfällt, ein zweiter Filter gleichen Namens ebenso; es gilt der erste. Beide nennt der Sammel-Hinweis am Fuß des Dashboards.

## Platzhalter in den Abfragen

In der Abfrage einer Kachel steht **`$name`** für die Wahl des Filters dieses Namens, ohne Rücksicht auf die Schreibung. Ein Platzhalter steht nur in `WHERE` und `HAVING`, dort aber an jeder Stelle eines Ausdrucks: als Seite eines Vergleichs, in einer `IN`-Liste oder als Argument einer Funktion wie `contains(tags, $tag)`.

````markdown
```perspective-dashboard
!filter status
!kachel kennzahl titel="Treffer"
LIST FROM "Aufgaben" WHERE prioritaet = "hoch" OR status = $status
```
````

- **Ein gewählter Wert** wird wie eine Zeichenkette verglichen, `status = $status` also genau wie `status = "offen"`: ohne Rücksicht auf die Schreibung, bei einer Listen-Eigenschaft als Mitgliedschaft. Der Wert wird nie als Abfrage-Text gelesen.
- **Steht der Filter auf «alle»,** entfällt die kleinste Bedingung, die den Platzhalter trägt, und gilt als erfüllt; ein `NOT` direkt davor entfällt mit. `AND` und `OR` darüber rechnen gewöhnlich weiter: Im Beispiel liefert «alle» deshalb alle Aufgaben, weil die rechte Seite des `OR` erfüllt ist. Eine Eigenschaft, die wörtlich den Wert «alle» trägt, gerät damit nicht in Konflikt.
- **Ein Name ohne Filter** gilt als «alle»; über dem Ergebnis der Kachel steht dann ein Hinweis mit dem Namen.

Wie sich Platzhalter außerhalb eines Dashboards verhalten, etwa in einer Abfrage im Fließtext oder in einer allein geöffneten Abfrage-Datei, beschreibt die Seite [Perspective-Abfrage](frontmatter-query.md), Abschnitt «Platzhalter».

## Zeilen (`!zeile`)

`!zeile` beginnt eine neue Zeile des Rasters; Angaben trägt es nicht. Kacheln vor dem ersten `!zeile` bilden eine erste Zeile, sodass ein Dashboard aus einer Zeile ohne diesen Marker auskommt. Ein `!zeile` ohne Kachel danach bleibt leer. Text in den Zeilen unter `!zeile` hat keine Bedeutung, bleibt stehen und wird im Sammel-Hinweis genannt.

## Kacheln (`!kachel`)

Eine Kachel nennt zuerst ihre **Art**, danach wahlweise Titel, Breite und eine Abfrage-Datei. Ohne Art ist sie nicht vollständig; eine Vorgabe-Art gibt es nicht.

- **`titel=`** steht über der Kachel. Ohne Angabe bleibt die Titelzeile leer, und eine Kennzahl zeigt nur ihre Zahl.
- **Datenquelle, genau eine:** Entweder sind die Inhalts-Zeilen die Abfrage, oder `abfrage=` nennt eine Abfrage-Datei (Abschnitt «Kachel mit Abfrage-Datei»).
- Weitere Wörter hinter der Art, etwa `!kachel kennzahl Offene`, haben keine Bedeutung; die Kachel bleibt gültig, und über ihr steht ein Hinweis auf die Angabe `titel=`. Dasselbe gilt für Wörter hinter dem Namen eines Filters.

### Breite

| Angabe | Anteil an der Zeile |
|---|---|
| `breite=ganz` | 12/12 |
| `breite=halb` | 6/12 |
| `breite=drittel` | 4/12 |
| `breite=viertel` | 3/12 |
| `breite=n/12` (n von 1 bis 12) | n/12; ein nacktes `n` gilt gleich |

- **Kacheln ohne Angabe** teilen sich zu gleichen Teilen, was die Kacheln mit Angabe in ihrer Zeile übrig lassen. Ohne jede Angabe teilen sich alle Kacheln die volle Breite.
- **Mehr als zwölf Zwölftel** in einer Zeile brechen ohne Hinweis in die nächste Zeile um.
- **Ein schmales Dashboard** stellt die Kacheln untereinander, ebenso die Auswahlfelder am Kopf. Maßgeblich ist die Breite des Blocks, nicht die des Fensters, damit es auch in einer Spalte der geteilten Ansicht lesbar bleibt.
- Ein unbekannter Wert ergibt einen Hinweis über der Kachel, und sie verhält sich wie ohne Angabe.

### Die sechs Kachel-Arten

Die Art bestimmt die Darstellung. Ein `DISPLAY` in der Abfrage wird übergangen, ohne Hinweis.

| Art | Erwartet | Zeigt | Passt nicht |
|---|---|---|---|
| `kennzahl` | jede Abfrage | eine große Zahl oder eine Zahl je Gruppe (unten) | gruppierte Tabelle oder Gesamt-Wert, jeweils ohne Zahl: Tabelle mit Hinweis |
| `liste` | `LIST`, auch mit `TASKS` und `BLOCKS` | die Liste wie im Fließtext | `TABLE`: Tabelle mit Hinweis |
| `tabelle` | `TABLE` | die Tabelle wie im Fließtext | `LIST`: Liste mit Hinweis |
| `balken` | `TABLE` mit einer Spalte voller Zahlen | ein Balken-Diagramm wie mit `DISPLAY bar` | Tabelle mit dem Grund als Hinweis |
| `kreis` | `TABLE` mit einer Spalte voller Zahlen | ein Kreis-Diagramm wie mit `DISPLAY pie` | Tabelle mit dem Grund als Hinweis |
| `text` | keine Abfrage | den Markdown der Inhalts-Zeilen | — |

Balken und Kreis lesen die Tabelle nach den Regeln der Diagramme auf der Seite [Perspective-Abfrage](frontmatter-query.md), Abschnitt «Darstellungsform». Sie hängen an der Erweiterung «Diagramm einer Abfrage»; ist sie aus, zeigen sie die Tabelle mit dem Hinweis, dass die Diagramm-Darstellung ausgeschaltet ist.

Liste und Tabelle zeigen das Ergebnis einer Datensatz-Abfrage, deren Abfrage-Datei die [Listen-Maske](database.md) einschaltet, als Gitter wie im Fließtext; die Kennzahl zeigt auch dann nur ihre Zahl.

**Die Kennzahl** gewinnt ihre Zahl je nach Abfrage:

- Eine Tabelle, deren Spalten ausschließlich Aggregate sind, ohne `GROUP BY` (der **Gesamt-Wert**, etwa `TABLE WITHOUT ID sum(aufwand)`): ihr erster Wert.
- Jede andere Abfrage ohne Gruppierung: die Zahl der Treffer, nach `LIMIT`.
- Eine gruppierte Tabelle: je Gruppe der Wert der ersten Spalte, die eine Zahl trägt; fehlt er einer Gruppe, steht dort ein Strich, und ein Text in dieser Spalte erscheint als Text.
- Eine gruppierte Liste: je Gruppe die Zahl ihrer Treffer.

Eine einzige Gruppe ergibt eine große Zahl, mehrere ergeben je Gruppe eine Zahl mit Beschriftung; bei mehreren Stufen stehen die Gruppen-Werte mit « › » verbunden, wie in der Beschriftung eines Diagramms. Ohne Treffer steht `0`. Als Zahl zählt auch ein Datum oder eine Dauer, sodass `min(…)` und `max(…)` über Daten den frühesten oder spätesten Tag zeigen. Zahlen, Daten und Dauern erscheinen im Format der eingestellten Programmsprache.

### Text-Kacheln

Eine Kachel der Art `text` zeigt den Markdown ihrer Inhalts-Zeilen, mit Verweisen, Hervorhebungen und Listen wie im übrigen Dokument. Drei Besonderheiten:

- **Überschriften in einer Text-Kachel** sehen aus wie Überschriften, gehören aber nicht zur Gliederung des Dokuments: Sie erscheinen nicht im Inhaltsverzeichnis, tragen keine Nummerierung und sind kein Sprungziel.
- **Datentabellen, Fußnoten und Block-Anker** in einer Text-Kachel bekommen eigene Kennungen und Zählungen, die mit denen des übrigen Dokuments zusammenfallen können.
- **Ein Dashboard-Block in einer Text-Kachel** bleibt Quelltext. Seine Marker-Zeilen brauchen dort den Schutz `\!`, weil der äußere Block sonst jede Zeile mit `!` in Spalte 0 als eigenes Element liest.

Eine Text-Kachel hat keine Abfrage; eine Angabe `abfrage=` an ihr wird mit einem Hinweis übergangen.

### Kachel mit Abfrage-Datei

Statt einer eigenen Abfrage kann eine Kachel eine **Abfrage-Datei** nennen, eine Datei mit der Marke `db-query` und genau einem Abfrage-Block (Seite [Datenbank](database.md), Abschnitt «Abfrage-Dateien»). Mehrere Dashboards teilen sich so eine Abfrage, die an einer Stelle gepflegt wird.

````markdown
```perspective-dashboard
!kachel liste titel="Gemeinsame Abfrage" abfrage="Abfragen/Zuletzt geändert"
```
````

- **Ziel:** der Dokumentname oder ein Pfad relativ zum Dashboard, dieselben Formen wie bei `doc=` einer Karte der [Canvas-Fläche](canvas.md).
- **Bezug:** Die Abfrage läuft so, als stünde sie in der Abfrage-Datei. `this.` und der leere Wiki-Link meinen die Abfrage-Datei, nicht das Dashboard.
- **Platzhalter** in der Abfrage-Datei wirken wie in einer Abfrage im Block. Ohne Platzhalter bleibt die Kachel von den Filtern unberührt.
- **Verweis im Bereich:** Die Angabe zählt als Verweis auf die Abfrage-Datei. Das Dashboard erscheint deshalb in den [Backlinks](linking.md) der Abfrage-Datei, die Kachel unter den Outgoing-Links des Dashboards als Einbettung, und wird die Abfrage-Datei umbenannt oder verschoben, zieht die Angabe mit, samt Vorschau der Umbenennung. Ein Ziel, das es nicht gibt, bleibt ein offener Verweis.
- **Fehlerfälle:** Ist das Ziel nicht zu finden, ist es keine Abfrage-Datei, enthält es keinen oder mehr als einen Abfrage-Block, zeigt die Kachel einen Hinweis mit dem genannten Namen.
- **Nur eine Quelle:** Stehen unter der Kachel Abfrage-Zeilen und zugleich `abfrage=`, wird keine von beiden ausgeführt; die Kachel wird zur Fehler-Kachel.

## Kommentar-Zeilen

Eine Zeile, die in Spalte 0 mit `%%` beginnt und mit `%%` endet, ist ein **Kommentar**. Sie darf vor dem ersten Element, zwischen den Elementen und zwischen den Zeilen einer Abfrage stehen; vor der Auswertung fällt sie heraus, und angezeigt wird sie nirgends. In einer Text-Kachel gelten für `%%` die Regeln der Erweiterung «Kommentare» wie im übrigen Dokument.

## Hinweise und Fehler-Kacheln

Ein Fehler im Block bricht das Dashboard nicht ab; jeder Befund erscheint dort, wo er hingehört:

- **Eine Fehler-Kachel** steht an ihrem Platz im Raster, gestrichelt umrandet, mit Titel, Hinweis und der Zeile im Block, gezählt ab 1. Zur Fehler-Kachel wird eine Kachel mit unbekannter oder fehlender Art und eine Kachel einer Daten-Art ohne gültige Quelle: weder Abfrage noch Abfrage-Datei, beides zugleich oder eine Abfrage-Datei, die sich nicht nutzen lässt.
- **Hinweise einer gültigen Kachel**, etwa zu einer unbekannten Breite, stehen über ihrem Inhalt.
- **Ein Syntaxfehler der Abfrage** erscheint mit seiner Position an der Stelle des Ergebnisses der Kachel, wie bei einer Abfrage im Fließtext.
- **Hinweise eines Filters** stehen unter seinem Auswahlfeld: aufgezählte Werte und `eigenschaft=` zugleich, eine unbekannte Vorbelegung, Wörter ohne Bedeutung.
- **Der Sammel-Hinweis** «Hinweise zu diesem Dashboard» am Fuß nennt, was keinen eigenen Platz hat, je mit der Zeile im Block: einen unbekannten Marker, Text vor dem ersten Element, Text unter `!zeile` und einen Filter, der entfällt. Ein unbekannter Marker erscheint selbst nicht, damit er das Raster nicht verschiebt.
- **Ein Dashboard ohne Kachel** zeigt statt des Rasters eine Hinweis-Fläche, die erklärt, wie eine Kachel entsteht; die Filter am Kopf bleiben stehen.

Ein Dashboard-Block, der selbst in einem äußeren Code-Block steht, bleibt wörtlicher Text.

## Ansichten, Druck und Export

- **Ansichten:** Gerendert, Geteilt und Live zeigen dasselbe Dashboard mit denselben Werten. Im Live-Modus klappt der Block zum Quelltext auf, sobald die Schreibmarke ihn berührt, und beim Verlassen wieder zum Dashboard zu. In der reinen Quelltext-Ansicht bleibt er Code.
- **Einbettung:** Ein Dashboard in einem eingebetteten Dokument oder Abschnitt erscheint wie im Original, und seine Auswahlfelder bleiben bedienbar, weil eine Wahl nichts am Dokument ändert.
- **Live-Aktualisierung:** Neue, geänderte und gelöschte Dateien schlagen auf die Kacheln durch, sobald der Index sie erfasst hat, ebenso ungespeicherte Änderungen an einer geöffneten Datei.
- **Drucken und PDF-Export** zeigen die Kacheln mit der **aktuellen Wahl** der Filter, in ihrer Anordnung und ohne die Auswahlfelder. Diagramme erscheinen dort hell, auch wenn die Anwendung dunkel läuft.
- **Portables Markdown** (**Datei → Weitere Datei-Funktionen → Exportieren → Portables Markdown…**) ersetzt den Block durch einen statischen Stand mit der **Vorbelegung** der Filter, nicht mit der aktuellen Wahl. Oben steht eine Zeile «Stand der Vorbelegung: …», die jeden Filter mit Titel und Wert nennt, «alle» für einen Filter ohne Vorbelegung; ein Dashboard ohne Filter hat diese Zeile nicht. Darunter folgen die Kacheln **untereinander**, weil gewöhnliches Markdown kein Raster kennt, jede mit ihrem Titel als Überschrift: die Kennzahl als Text, die Liste als Aufzählung, die Tabelle als Markdown-Tabelle, Balken und Kreis als helles Bild, die Text-Kachel als Markdown. Eine Fehler-Kachel erscheint als Überschrift mit ihrem Hinweis samt Zeile im Block, und eine Kachel, deren Auswertung nicht rechtzeitig fertig wird, mit einem Hinweis darauf. Auswahlfelder gibt es im Export nicht. Ist die Erweiterung abgeschaltet, bleibt der Block im Export ein Code-Block.

## Suchraum

Der Suchraum der Kacheln ist derselbe wie bei jeder Abfrage: mit aktivem Bereich der ganze Bereich, ohne Bereich der Ordner des Dokuments samt zwei Unterebenen. Was im Vorlagen-Ordner liegt, ist kein Treffer, außer eine Abfrage nennt ihn. Ein noch nicht gespeichertes Dokument hat keinen Suchraum; seine Kacheln zeigen dann den Hinweis, dass die Abfrage erst nach dem Speichern verfügbar ist.

## Ein vollständiges Beispiel

````markdown
```perspective-dashboard
%% Projekt-Überblick, Stand 2026-11 %%
!filter status titel="Status" vorbelegung=offen
!filter prio titel="Priorität"
hoch
mittel
niedrig

!kachel text breite=ganz
## Projekt-Überblick
Offene Arbeit nach Status und Priorität; Details in [[Projekt-Regeln]].

!zeile
!kachel kennzahl titel="Offene Aufgaben" breite=drittel
LIST FROM "Aufgaben" WHERE status = $status AND prioritaet = $prio
!kachel kennzahl titel="Aufwand gesamt" breite=drittel
TABLE WITHOUT ID sum(aufwand) AS "Aufwand" FROM "Aufgaben" WHERE status = $status
!kachel kennzahl titel="Je Priorität" breite=drittel
TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE status = $status GROUP BY prioritaet

!zeile
!kachel balken titel="Aufgaben je Status" breite=halb
TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE prioritaet = $prio GROUP BY status
!kachel kreis titel="Anteil je Kategorie" breite=halb
TABLE count() AS "Anzahl" FROM "Aufgaben" WHERE status = $status GROUP BY kategorie

!zeile
!kachel tabelle titel="Die zehn ältesten" breite=8/12
TABLE status, prioritaet FROM "Aufgaben" WHERE status = $status SORT file.ctime ASC LIMIT 10
!kachel liste titel="Gemeinsame Abfrage" abfrage="Abfragen/Zuletzt geändert"
```
````

- Der Kommentar in der ersten Zeile erscheint nirgends. Der Filter «Status» bietet die Werte der Eigenschaft `status` aus dem Bereich an und beginnt mit `offen`; der Filter «Priorität» bietet die drei aufgezählten Werte an und beginnt mit «alle».
- Die Text-Kachel steht vor dem ersten `!zeile` und bildet allein die erste Zeile; ihre Überschrift gehört nicht zur Gliederung des Dokuments.
- «Offene Aufgaben» zählt die Treffer, «Aufwand gesamt» zeigt den Gesamt-Wert ohne Gruppierung, «Je Priorität» eine Zahl je Priorität mit Beschriftung.
- «Aufgaben je Status» hängt allein am Filter Priorität und lädt deshalb nicht neu, wenn der Status gewechselt wird.
- Die letzte Kachel hat keine Breiten-Angabe und füllt die übrigen 4/12. Sie bleibt von den Filtern unberührt, solange ihre Abfrage-Datei keinen Platzhalter trägt.

Ein lauffähiges Dashboard über die Dateien der Demo-Area zeigt deren Seite «17 Dashboards».

## Grenzen

- **Die Werte eines Filters aus dem Bestand** kommen aus den Frontmatter-Eigenschaften der Dokumente des Bereichs, nicht aus den Feldern von Datensätzen oder Aufgaben; für sie gibt es die aufgezählten Werte.
- **Ein Filter wählt genau einen Wert** oder «alle»; eine Mehrfach-Wahl gibt es nicht.
- **Ein Platzhalter steht nur in `WHERE` und `HAVING`.** In `FROM`, in Spalten, in `SORT`, `GROUP BY` und `LIMIT` ist er ein Syntaxfehler.
- **Die Kachel-Arten wählt allein die Art,** nicht `DISPLAY`; der Baum (`DISPLAY tree`) ist in einer Kachel nicht erreichbar.
- **`!zeile` trägt keine Angaben,** und eine Kachel hat keine wählbare Höhe; die Höhe folgt ihrem Inhalt.
- **Das Diagramm einer Kachel ist ein Bild ohne Bedienung;** ein Klick darauf öffnet keinen Treffer. Treffer einer Liste oder Tabelle sind dagegen anklickbar wie im Fließtext.
- **Die Wahl der Filter wird nicht gespeichert.** Wer einen bestimmten Stand dauerhaft sehen will, setzt ihn als Vorbelegung in den Block.
- **Ein Dashboard in einem Zitat oder einer Liste** kann beim Wechsel in den Live-Modus die Wahl seiner Filter verlieren und auf die Vorbelegung zurückfallen.
