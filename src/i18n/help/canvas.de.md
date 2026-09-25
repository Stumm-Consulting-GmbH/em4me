# Canvas-Fläche

Eine **Canvas** ist eine räumliche Arbeitsfläche in einem gewöhnlichen Markdown-Dokument: **Karten** mit eigenem Text liegen frei angeordnet darauf, **Verbindungen** ziehen Beziehungen zwischen ihnen, **Formen** setzen Zeichen daneben und **Gruppen** fassen zusammen, was zusammengehört. Eine Karte trägt dabei entweder eigenen Text, oder sie zeigt den Inhalt eines anderen Dokuments oder ein Bild aus dem Bereich an. Wer Alternativen nebeneinanderlegt, einen Ablauf skizziert oder Gedanken erst einmal sortiert, ordnet hier nach Lage statt nach Reihenfolge.

Getragen wird die Fläche von einem Code-Block mit dem Sprach-Tag `perspective-canvas`. Ein Dokument darf beliebig viele davon enthalten, und alles Übrige darin bleibt gewöhnliches Markdown.

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Canvas-Ansicht"). Ist sie abgeschaltet, bleibt der Block ein regulärer Code-Block, der Ansichts-Modus entfällt, und die Kommandos für Fläche, Karte, Verweis-Karte, Bild-Karte, Form, Gruppe und Reihenfolge verschwinden — mit ihnen der Eintrag **Canvas-Fläche bearbeiten** im Menü **Ansicht**, der ohne sie nicht leer stehen bleibt. Das Dokument bleibt dabei unverändert lesbar; es geht nichts verloren.

## Abgrenzung zur Graphenansicht

Beide zeigen Kästchen und Linien und meinen dabei Verschiedenes:

| Frage | [Graphenansicht](graph.md) | Canvas |
| ----- | -------------------------- | ------ |
| Woher kommen die Knoten? | aus den Dateien des Bereichs | vom Anwender angelegt |
| Woher kommen die Linien? | aus vorhandenen Verweisen | vom Anwender gezogen |
| Woher kommt die Anordnung? | die Anwendung **rechnet** sie | der Anwender **bestimmt** sie |
| Was ist das Ergebnis? | eine Auswertung des Bestands | eine Arbeitsfläche mit eigenem Inhalt |

Kurz: Die Graphenansicht **wertet aus** und rechnet ihre Anordnung selbst; die Canvas **lässt anordnen** und merkt sich, was angeordnet wurde. Eine verschobene Karte bleibt liegen, ein verschobener Knoten des Graphen nicht.

Dasselbe gilt gegenüber der [Mindmap-Ansicht](mindmap.md): Sie leitet ihren Baum aus Überschriften und Listen des Dokuments ab und ändert den Text nicht. Die Canvas trägt ihren Inhalt selbst und schreibt ihn beim Bearbeiten in das Dokument zurück.

## Fläche anlegen

Das Kommando **„Canvas-Fläche"** fügt an der Schreibmarke eine leere Fläche ein. Zwei Wege führen hin: die Kommando-Palette (Standard `Strg+K`) und das Editor-Kontextmenü → Einfügen → Canvas-Fläche. Ein Tastenkürzel ist nicht vorbelegt und lässt sich in den Einstellungen vergeben.

Das Kommando setzt ein änderbares Dokument voraus; fehlt es, sagt die Statusleiste das, statt still nichts zu tun. Eingefügt wird ein leerer Block:

````markdown
```perspective-canvas
```
````

## Canvas-Ansicht öffnen

Die Canvas ist der sechste Ansichts-Modus, neben Quellcode, Geteilt, Gerendert, Live und Mindmap: **Ansicht → Canvas**, die Schaltfläche in der Statusleiste oder Standard `Strg+6`. Wie bei den übrigen Modi gilt die Wahl je geöffnetem Dokument, nicht für die ganze Anwendung.

**Er ist dokument-abhängig, wie die Tafel-Ansicht.** Wählbar ist er nur, wenn das Dokument eine Canvas-Fläche enthält — eine Canvas-Ansicht ohne Fläche zeigte nichts als einen Hinweis. Fehlt die Fläche, bleiben Schaltfläche und Menü-Eintrag **sichtbar und gedämpft** stehen; der Grund steht im Titel der Schaltfläche. Der Weg über Tastenkürzel und Kommando-Palette führt dann nicht hinein und wirft auch nicht aus der aktuellen Ansicht. Entsteht eine Fläche im Text oder fällt sie weg, zieht der Zugang nach. Ein Dokument, das beim Beenden in der Canvas-Ansicht offen war und dessen Fläche inzwischen fehlt, öffnet in der Lese-Ansicht.

## Mehrere Flächen in einem Dokument

Enthält ein Dokument mehr als eine Fläche, erscheint oberhalb der Fläche eine Leiste mit einem **Reiter** je Fläche; ein Klick darauf wechselt die gezeigte Fläche und passt sie ein. Bei genau einer Fläche gibt es keine Leiste.

Die Beschriftung wird abgeleitet und nicht angegeben: die erste sinnvolle Zeile der ersten Karte, sonst eine Zählung („Fläche 2"). Im Dokument steht dafür nichts. Welche Fläche gewählt ist, gilt je geöffnetem Dokument, überlebt das Tippen und den Ansichts-Wechsel und wird nicht gespeichert — eine reine Ansichts-Handlung soll das Dokument nicht ändern.

## Karten

### Anlegen

- **Doppelklick** auf den freien Hintergrund legt eine Karte an der Klick-Stelle an und öffnet sofort ihre Text-Eingabe.
- **Rechtsklick** auf den Hintergrund → „Karte auf der Fläche anlegen" tut dasselbe an der Klick-Stelle.
- Das Kommando **„Karte auf der Fläche anlegen"** (Kommando-Palette, Ansicht → Canvas-Fläche bearbeiten, belegbares Kürzel) legt sie in der Mitte des sichtbaren Ausschnitts an. Außerhalb der Canvas-Ansicht meldet es in der Statusleiste, dass Karten nur dort entstehen.

### Auswählen, verschieben, Größe ändern

- Ein **Klick** wählt eine Karte, ein Klick auf den Hintergrund hebt die Auswahl auf. Gewählt ist immer höchstens ein Element — eine Karte, eine Verbindung, eine Form oder eine Gruppe.
- **Ziehen** verschiebt die Karte; ihre Verbindungen folgen schon während des Zuges. Ein Raster gibt es nicht.
- Der **Griff an der unteren rechten Ecke** ändert die Größe. Sie ist unabhängig vom Inhalt: Passt der Text nicht, wird in der Karte gescrollt — sie wächst nie von selbst.

### Text schreiben

**Doppelklick in eine Karte** schaltet sie auf ihren Rohtext um. Dort steht gewöhnliches Markdown, das in der Karte gerendert erscheint — Überschriften, Hervorhebungen, Listen, Tabellen, Formeln und Diagramme inbegriffen.

| Eingabe | Wirkung |
| ------- | ------- |
| Klick außerhalb der Karte | übernimmt |
| `Strg+Enter` | übernimmt |
| `Escape` | verwirft |

Ein unveränderter Text schreibt nichts in das Dokument.

### Verweis-Karten

Statt eigenen Text zu tragen, zeigt eine Karte wahlweise den Inhalt eines **anderen Dokuments** an — ganz, ab einer Überschrift oder ab einem Block. Der Inhalt bleibt dabei, wo er steht: Die Karte hält keine Kopie und lässt sich an dieser Stelle nicht ändern. Passt er nicht in die Karte, wird in ihr gescrollt.

- **Anlegen** — das Kommando **„Verweis-Karte auf der Fläche anlegen"** (Kommando-Palette, Ansicht → Canvas-Fläche bearbeiten) legt sie in der Mitte des sichtbaren Ausschnitts an, der Rechtsklick auf den freien Hintergrund an der Klick-Stelle. Beide fragen zuerst nach dem Ziel: `Enter` legt die Karte an, `Escape` bricht ab. Ohne Ziel entsteht keine Karte.
- **Ziel setzen, wechseln, entfernen** — eine gewählte Karte trägt eine **Leiste** mit dem Feld „Verweis-Ziel"; beim Tippen bietet es die Dokumente des Bereichs an. So wird eine Text-Karte zur Verweis-Karte und über „Verweis entfernen" wieder zur Text-Karte — ihr eigener Text bleibt dabei stehen. Dieselben Handlungen liegen im **Kontextmenü** der Karte.
- **Ziel öffnen** — ein **Doppelklick auf den angezeigten Inhalt** öffnet das verwiesene Dokument an der verwiesenen Stelle, ebenso „Ziel öffnen" in Leiste und Kontextmenü. Das bleibt auch in der reinen Anzeige erlaubt, weil Öffnen nichts ändert.
- **Kopfzeile** — sie nennt die **Beschriftung** der Karte, also ihren eigenen Text, und sonst das Ziel samt Anker. Ein Doppelklick auf die Kopfzeile bearbeitet die Beschriftung wie den Text jeder anderen Karte.

Lässt sich das Ziel nicht finden, bleibt die Karte stehen und nennt an der Stelle des Inhalts, wonach sie gesucht hat; in der Datei ändert sich dabei nichts. Wird das Ziel in einem anderen geöffneten Dokument bearbeitet, zieht die Karte sofort nach; eine Änderung an einer nirgends geöffneten Datei erscheint, sobald die Fläche das nächste Mal gezeichnet wird.

### Bild-Karten

Ebenso zeigt eine Karte wahlweise ein **Bild** aus dem Bereich. Auch hier hält sie keine Kopie: Das Bild bleibt eine Datei, die Karte verweist darauf — über einen Pfad relativ zum Dokument oder über den bloßen Dateinamen. Es wird in die Karte **eingepasst** und behält dabei seine Proportionen; gescrollt wird in einer Bild-Karte nicht.

Bedient wird sie wie die Verweis-Karte: das Kommando **„Bild-Karte auf der Fläche anlegen"** und derselbe Eintrag im Kontextmenü der Fläche, in der Leiste der gewählten Karte das Feld „Bild" — mit den Bild-Dateien des Bereichs als Vorschlägen — sowie „Bild entfernen" und „Ziel öffnen". Ein Doppelklick auf das Bild öffnet die Datei so, wie die Anwendung jede [Anlage](attachments.md) öffnet. Die Kopfzeile nennt die Beschriftung und sonst den Namen der Bild-Datei.

Findet sich das Bild nicht, ist es zu groß oder trägt es keine Bild-Endung, sagt die Karte das an der Stelle des Bildes. **Eine Karte zeigt entweder ein Dokument oder ein Bild;** stehen beide Angaben nebeneinander, gilt das Dokument.

### Löschen

`Entf` löscht die gewählte Karte, ebenso „Karte löschen" in ihrem Kontextmenü. Verbindungen, deren Ende auf sie zeigt, verschwinden mit ihr — in einem Schritt, der sich als Ganzes zurücknehmen lässt.

## Verbindungen

### Anlegen

An einer gewählten Karte erscheinen vier **Anschluss-Griffe**, einer je Seite. Ein Zug von einem Griff auf eine andere Karte legt die Verbindung an; eine Vorschau-Linie folgt dabei dem Zeiger. Die Karte unter dem Zeiger zeigt währenddessen vier **Ziel-Zonen** an ihren Rändern: Loslassen auf einer Zone legt die Ziel-Seite fest, Loslassen auf der Fläche der Karte überlässt sie der Anwendung. Ein Zug ins Leere oder zurück auf die eigene Karte legt nichts an.

### Ändern

Eine gewählte Verbindung trägt in der Mitte ihres Verlaufs eine kleine **Leiste**:

- **Richtung umschalten** — im Kreis: Pfeil zum Ziel (→), Pfeil an beiden Enden (↔), ohne Pfeilspitze (—). Das Zeichen am Knopf zeigt den jetzigen Zustand.
- **Richtung umkehren** — tauscht Anfang und Ende samt ihren Anschluss-Seiten.
- **Farbe** — acht Farben des Farbschemas, dazu „Keine Farbe".
- **Start-Seite** und **Ziel-Seite** — automatisch, links, rechts, oben oder unten. „Automatisch" wählt die Seite nach der Lage der beiden Karten; eine ausdrücklich gewählte Seite bleibt auch beim Verschieben stehen.
- **Beschriftung** — öffnet dieselbe Text-Eingabe wie ein Doppelklick auf die Verbindung. Der Text steht danach am Verlauf der Linie.

Dieselben Handlungen liegen im **Kontextmenü** der Verbindung (Rechtsklick). `Entf` löscht die gewählte Verbindung.

## Formen

Neben Karten trägt die Fläche **geometrische Formen**. Sie tragen keinen Inhalt, sondern gliedern: Sie heben einen Bereich hervor, markieren einen Schritt in einem Ablauf oder setzen ein Zeichen neben eine Karte.

### Anlegen

- **Rechtsklick** auf den freien Hintergrund → „Form einfügen" öffnet ein Untermenü mit den sechs Arten und setzt die gewählte an der Klick-Stelle ab.
- Das Kommando **„Form auf der Fläche anlegen"** (Kommando-Palette, Ansicht → Canvas-Fläche bearbeiten, belegbares Kürzel) legt ein Rechteck in der Mitte des sichtbaren Ausschnitts an.

Zur Wahl stehen sechs Arten: **Rechteck**, **abgerundetes Rechteck**, **Oval**, **Dreieck**, **Raute** und **Stern**. Ein Werkzeug für freie Striche gibt es nicht.

### Auswählen, verschieben, Größe ändern

Wie bei einer Karte: Ein Klick wählt die Form, Ziehen verschiebt sie, der Griff an der unteren rechten Ecke ändert die Größe. Der Umriss füllt dabei sein Rechteck aus und behält die Seitenverhältnisse nicht — ein in die Breite gezogenes Oval bleibt breit.

Angefasst wird die **gezeichnete Figur** und nicht das Rechteck um sie herum: Ein Klick in die leere Ecke neben einem Dreieck trifft, was dahinter liegt.

### Art, Farben und Beschriftung

Eine gewählte Form trägt eine **Leiste**:

- **Art der Form** — wechselt zwischen den sechs Arten; Lage und Größe bleiben stehen.
- **Randfarbe** — acht Farben des Farbschemas. Ohne Wahl gilt die Standardfarbe.
- **Füllfarbe** — dieselben acht Farben, getönt gezeichnet, dazu „Keine Füllung".
- **Beschriftung bearbeiten** — öffnet dieselbe Eingabe wie ein Doppelklick auf die Form.

Die **Beschriftung** ist **einfacher Text**, mittig in der Form. Anders als in einer Karte wird darin kein Markdown gerendert und nicht gescrollt: Die Form gliedert, die Karte trägt Inhalt. `Strg+Enter` und ein Klick daneben übernehmen, `Escape` verwirft; ein geleerter Text nimmt die Beschriftung wieder weg.

Dieselben Handlungen liegen im **Kontextmenü** der Form.

### Löschen

`Entf` löscht die gewählte Form, ebenso „Form löschen" in ihrem Kontextmenü. Eine Verbindung lässt sich an einer Form nicht anschließen; Verbindungen verlaufen ausschließlich zwischen Karten.

## Gruppen

Eine **Gruppe** ist ein Rechteck, das einen Teil der Fläche zusammenfasst und benennt — „Analyse", „verworfen", „erste Fassung". Ihr Inneres bleibt dabei bedienbar: Karten und Formen darin lassen sich weiterhin anfassen, und ein Doppelklick mitten in die Gruppe legt wie überall sonst eine Karte an.

### Anlegen

- **Rechtsklick** auf den freien Hintergrund → „Gruppe einfügen" setzt sie an der Klick-Stelle ab.
- Das Kommando **„Gruppe auf der Fläche anlegen"** legt sie in der Mitte des sichtbaren Ausschnitts an.

Eine neue Gruppe entsteht **ganz hinten** und verdeckt damit nichts.

### Beschriftung und Farbe

Eine gewählte Gruppe trägt eine Leiste mit der **Farbe der Gruppe** — acht Farben des Farbschemas, dazu „Standardfarbe", die die Angabe wieder entfernt — und mit **Beschriftung bearbeiten**. Die Beschriftung steht oben links am Rahmen und ist wie bei der Form einfacher Text. Dieselben Handlungen liegen im **Kontextmenü** der Gruppe.

### Mitglieder

**Mitglied ist, was vollständig in der Gruppe liegt.** Es steht nirgends geschrieben — das Rechteck selbst ist die Aussage, und es gibt keine zweite Liste, die davon abweichen könnte. Die Ränder zählen dazu; was über die Kante hinausragt, ist nicht Mitglied. Eine Gruppe in einer Gruppe ist Mitglied und wandert mit.

Daraus folgen die drei Handlungen:

| Handlung | Wirkung auf die Mitglieder |
| -------- | -------------------------- |
| Gruppe verschieben | die Mitglieder wandern mit, ihre Anordnung zueinander bleibt unverändert |
| Größe ändern | nichts wird verschoben; wer Mitglied ist, richtet sich danach neu |
| Gruppe löschen | die Mitglieder bleiben stehen |

Wer mitwandert, steht zum **Beginn des Zuges** fest: Was beim Anfassen in der Gruppe lag, kommt mit — auch wenn die Gruppe unterwegs weit über ihre eigene Stelle hinausfährt. Der ganze Zug ist **ein** Rückgängig-Schritt.

Eine Verbindung ist nie Mitglied; sie folgt ohnehin ihren Karten.

## Reihenfolge auf der Fläche

Karten, Formen und Gruppen liegen in **einer gemeinsamen Reihenfolge**. Überlagern sich zwei Elemente, entscheidet sie, welches oben liegt; keine Art liegt dauerhaft über einer anderen.

Für das gewählte Element gibt es vier Befehle:

| Befehl | Wirkung |
| ------ | ------- |
| Ganz nach vorn | über alle übrigen Elemente |
| Eine Stufe vor | vor das nächste Element davor |
| Eine Stufe zurück | hinter das nächste Element dahinter |
| Ganz nach hinten | unter alle übrigen Elemente |

Zwei Wege führen hin: das **Kontextmenü** des Elements und **Ansicht → Canvas-Fläche bearbeiten → Reihenfolge auf der Fläche**. Dieselben Befehle stehen in der Kommando-Palette (Standard `Strg+K`); Kürzel sind nicht vorbelegt und lassen sich in den Einstellungen vergeben.

**Neue Elemente haben ihren Platz:** Eine neue Gruppe entsteht ganz hinten, eine neue Form und eine neue Karte ganz vorn.

**Verbindungen sind davon nicht berührt.** Sie werden in einer eigenen Ebene unter allen Elementen gezeichnet und lassen sich nicht in der Reihenfolge bewegen.

## Rückgängig

`Strg+Z` nimmt die letzte Handlung auf der Fläche zurück, `Strg+Y` und `Strg+Umschalt+Z` stellen sie wieder her. Jede Handlung ist genau ein Schritt: eine verschobene Karte, eine geänderte Größe, eine angelegte Verbindung, ein geänderter Text. Steht die Text-Eingabe einer Karte oder einer Verbindung offen, gilt `Strg+Z` dort dem getippten Text.

## Navigation

- **Verschieben** — den freien Hintergrund mit gedrückter Maustaste ziehen.
- **Zoom** — Mausrad über der Fläche, zentriert um den Zeiger.
- **Einpassen** — beim Wechsel in die Ansicht und beim Wechsel der Fläche passt sich der Ausschnitt selbst ein.

## Karten-Liste und Bedienung ohne Maus

Neben der Fläche lässt sich eine **Karten-Liste** einblenden. Sie führt auf, was auf der gerade gezeigten Fläche liegt, und macht die Fläche damit **aufzählbar**: Ein Element außerhalb des Ausschnitts ist über die Liste zu finden, ohne die Fläche abzusuchen, und eine Verbindung, die unter einer Karte verläuft, ist dort sicher zu treffen.

Drei Wege blenden die Liste ein und aus, wie bei jedem anderen Panel der [Sidebar](sidebar.md): die **Schaltfläche** in der Statusleiste, **Ansicht → Sidebar → Panels → Karten-Liste** und die Kommando-Palette (Standard `Strg+K`). Ein Tastenkürzel ist nicht vorbelegt und lässt sich in den Einstellungen vergeben. Der Zustand gilt je Spalte und bleibt über den Wechsel des Dokuments und über einen Neustart erhalten. Ist die Canvas-Ansicht als [interne Erweiterung](extensions.md) abgeschaltet, gibt es die Liste nicht — weder die Schaltfläche noch den Menü-Eintrag noch den Eintrag in der Kommando-Palette.

### Was die Liste zeigt

- **Alle Element-Arten** — Karten, Formen und Gruppen, jede Zeile an ihrer Art erkennbar.
- **Unter jeder Karte ihre Verbindungen**, je mit Richtung und Gegenstelle. Ein Klapp-Griff an der Karte blendet sie ein und aus.
- **Die Reihenfolge der Liste ist die Stapel-Reihenfolge:** Was weiter unten in der Liste steht, liegt auf der Fläche weiter vorn. Eine zweite Anzeige der Reihenfolge braucht es damit nicht.
- Trägt das Dokument **mehrere Flächen**, gehört die Liste zu der, die gerade angezeigt wird; ein Wechsel über die Reiterleiste wechselt die Liste mit.
- Eine Zeile über der Liste nennt die **Zahl der Elemente** — oder sagt an ihrer Stelle, dass kein Dokument offen ist, dass das Dokument keine Fläche trägt oder dass die Fläche noch leer ist.

**Auswahl und Liste zeigen dasselbe, in beide Richtungen.** Was auf der Fläche gewählt ist, ist in der Liste hervorgehoben; was in der Liste gewählt wird, ist auf der Fläche hervorgehoben und rückt **zentriert in den Ausschnitt** — die Vergrößerung bleibt dabei, wie sie ist. Steht das Dokument nicht in der Canvas-Ansicht, führt das Wählen eines Eintrags zuerst dorthin; trägt das Dokument gar keine Fläche, sagt die Statusleiste, dass es die Ansicht dafür nicht gibt.

### Die Tasten in der Liste

| Taste | Wirkung |
| ----- | ------- |
| `Pfeil auf`, `Pfeil ab` | zur vorigen oder nächsten Zeile; die Fläche wählt mit und rückt das Element in die Mitte |
| `Pos1`, `Ende` | zur ersten oder letzten Zeile |
| `Eingabe` | bearbeitet das gewählte Element — den Text einer Karte, die Beschriftung von Form, Gruppe oder Verbindung |
| `Entf` | löscht das gewählte Element |
| Kontextmenü-Taste, `Umschalt+F10` | öffnet das Kontextmenü des Elements; ohne gewähltes Element das Menü der Fläche mit den Anlege-Wegen |
| `Escape` | hebt die Auswahl auf |

Bearbeiten und Löschen setzen ein änderbares Dokument und eine offene Canvas-Ansicht voraus. Fehlt eine der beiden Bedingungen, sagt die Statusleiste das, statt still nichts zu tun; im nicht änderbaren Dokument zeigt und wählt die Liste weiterhin.

### Eine Verbindung ohne Maus anlegen

Der Eintrag **„Verbindung auf der Fläche anlegen…"** im Kontextmenü einer Karte startet die **Ziel-Wahl in der Liste**. Sie läuft in zwei Schritten, weil eine Verbindung zwei Enden hat und es ohne Zeiger keine Stelle gibt, an der sich die Gegenstelle nebenbei benennen ließe:

1. Ausgangs-Karte ist die gewählte Karte.
2. Die Liste wandert danach nur noch über die **übrigen Karten**, und die Zeile über ihr sagt, dass ein Ziel zu wählen ist. `Eingabe` bestätigt, ein Klick auf eine Karten-Zeile ebenso, `Escape` bricht ab und stellt den Stand davor wieder her.

Die Anschluss-Seiten bestimmt die Anwendung dabei aus der Lage der beiden Karten; ändern lassen sie sich danach an der Leiste der gewählten Verbindung. Gibt es keine zweite Karte, sagt die Statusleiste das.

### Suchen in der Fläche

Im Kopf der Liste steht ein **Filter-Feld**. Es engt die Liste auf die Elemente ein, die den eingegebenen Text enthalten. Durchsucht werden

- der **Text** einer Karte sowie die Beschriftung von Form und Gruppe,
- das **Verweis-Ziel** einer Verweis-Karte und der **Bild-Name** einer Bild-Karte,
- die **Beschriftung** einer Verbindung.

Gesucht wird als eine zusammenhängende Zeichenfolge, ohne Rücksicht auf Groß- und Kleinschreibung — dieselbe Regel wie in der Kommando-Palette; Muster und unscharfe Treffer gibt es nicht. Die Fundstellen sind in der Zeile hervorgehoben, die Zeile über der Liste zählt die Treffer, und bleibt nichts übrig, sagt sie das, statt die Liste wortlos zu leeren. Eine Karte bleibt stehen, wenn eine ihrer Verbindungen trifft; trifft die Karte selbst, bleiben alle ihre Verbindungen bei ihr. Solange ein Filter läuft, sind die Karten aufgeklappt — ein Treffer unter einer zugeklappten Karte wäre keiner.

| Eingabe | Wirkung |
| ------- | ------- |
| `Eingabe` | springt zum Treffer: gewählt, zentriert, Fokus in der Liste. Genommen wird die gewählte Zeile, wenn sie unter den Treffern steht, sonst die erste |
| `Pfeil ab` | dasselbe; von dort wandern die Pfeiltasten durch die übrigen Treffer |
| `Escape` | leert das Feld, ohne die Auswahl anzufassen. Bei leerem Feld greift es nicht |

**`Strg+F` führt in der Canvas-Ansicht in dieses Feld** und nicht in die Suchleiste. Der Grund: Wer in dieser Ansicht sucht, sucht auf der Fläche vor sich; die Suchleiste dagegen durchsucht den Dokument-Text und zeigt ihre Treffer dort, wo in dieser Ansicht nichts zu sehen ist. In jeder anderen Ansicht öffnet `Strg+F` unverändert die Suchleiste, und ist die Canvas-Erweiterung abgeschaltet, gibt es die Ansicht nicht und damit auch diese Weiche nicht.

## Nur ansehen

Die Fläche folgt der Änderbarkeit ihres Dokuments. Steht das Dokument in der reinen Anzeige, ohne eingeschalteten Bearbeiten-Modus, ist die Fläche **nur ansehbar**: keine Griffe, kein Ziehen, kein Anlegen, keine Text-Eingabe, keine Leiste, keine Umordnung, und das Kontextmenü bleibt ohne Einträge. Das gilt für jede Art — Karte, Verbindung, Form und Gruppe. Auch der Weg über Kommando-Palette und Menü führt dann nicht daran vorbei; der Fehlschlag wird in der Statusleiste gesagt und nicht verschwiegen. Ausschnitt verschieben, zoomen und ein Element per Klick auswählen bleiben erlaubt, weil sie das Dokument nicht anfassen.

Der Bearbeiten-Modus gibt die Bedienung frei — Stift in der Statusleiste, Standard `Strg+E`; die Einzelheiten beschreibt die Seite [Ansichten und Darstellung](views-display.md).

## Die Fläche außerhalb der Canvas-Ansicht

Weil die Fläche in einem gewöhnlichen Markdown-Dokument liegt, begegnet sie in jeder Ansicht dieses Dokuments:

| Ansicht | Was erscheint |
| ------- | ------------- |
| Quellcode | der Block im Klartext — diese Ansicht **ist** die Quelle |
| Geteilt | links der Klartext, rechts der Übersichts-Block |
| Gerendert | **der Übersichts-Block**: Art, Umfang in Karten, Verbindungen, Formen und Gruppen, eine Vorschau der Karten-Texte und der Knopf „Canvas-Ansicht öffnen" |
| Live | derselbe Block; berührt die Schreibmarke den Block, klappt er zum Klartext auf und ist dort änderbar |
| Mindmap | eine kurze Notiz mit Art und Umfang statt des Rohtexts |
| Canvas | die Fläche selbst |

Die Vorschau zeigt höchstens sechs Karten; darunter steht, wie viele weitere es gibt. Der Block lässt sich **zuklappen**, seine Kopfzeile bleibt dabei stehen; dieser Zustand gilt für die laufende Sitzung und wird nicht in das Dokument geschrieben. Drucken und PDF-Export folgen der gerenderten Ansicht, ohne die beiden Knöpfe des Blocks mitzudrucken.

## Die Fläche im portablen Export

**Datei → Weitere Datei-Funktionen → Exportieren → Portables Markdown…** schreibt eine Fassung des Dokuments, die auch ohne diese Anwendung etwas hergibt. An der Stelle jeder Fläche steht darin ihre **Markdown-Entsprechung**: derselbe Inhalt und dasselbe Geflecht, in gewöhnlichem Markdown. Ohne sie bekäme der Empfänger einen Code-Block voller Koordinaten-Zeilen, mit dem er nichts anfangen kann.

| Auf der Fläche | Im Export |
| -------------- | --------- |
| die Fläche selbst | eine fette Kopf-Zeile aus ihrem Titel — der ersten Zeile ihrer ersten Karte — und ihrem Umfang, dieselbe Angabe wie in der Kopfzeile des Blocks |
| eine Karte | ihr Text, **unverändert**; Überschriften darin bleiben stehen, und über der Karte entsteht keine erfundene Überschrift |
| eine Verweis-Karte | ihre Beschriftung, darunter der Verweis in derselben Schreibweise wie im übrigen Text des Dokuments |
| eine Bild-Karte | ihre Beschriftung, darunter das Bild als Einbettung |
| eine Gruppe | eine fette Zeile mit ihrem Namen; unmittelbar darunter stehen die Elemente, die in ihr liegen |
| eine Form mit Beschriftung | ein Aufzählungs-Punkt aus ihrer Art und ihrer Beschriftung; eine Form ohne Beschriftung entfällt |
| die Verbindungen | **eine** Liste am Ende der Fläche, je Zeile die beiden Karten mit dem Zeichen ihrer Richtung und, sofern vorhanden, der Beschriftung |
| eine fehlerhafte Angabe | eine Hinweis-Zeile beim betroffenen Element — oder am Ende der Fläche, wenn sie keinem Element zuzuordnen ist |

Die Reihenfolge ist die des Blocks und damit die Stapel-Reihenfolge, die auch die Karten-Liste zeigt. **Gekürzt wird nichts:** Alle Karten erscheinen vollständig, anders als in der gedeckelten Vorschau des Blocks. Trägt das Dokument mehrere Flächen, bekommt jede ihren eigenen Kopf und ihre eigene Verbindungs-Liste.

Diese Fläche

````markdown
```perspective-canvas
!gruppe g1 x=-300 y=-160 b=600 h=200 farbe=blau
Analyse

!karte k1 x=-260 y=-120 b=240 h=120
Ausgangslage

!karte k2 x=40 y=-120 b=240 h=120
Zielbild

!karte k3 x=-100 y=140 b=240 h=120 doc="Konzepte/Import.md#Zielbild"
Zielbild im Konzept

!form f1 x=220 y=140 b=120 h=120 art=stern rand=rot
Kernaussage

!linie e1 k1 -> k2 von=rechts nach=links
ergibt
```
````

steht im portablen Export so da:

```markdown
**Ausgangslage · 3 Karten, 1 Verbindung, 1 Form, 1 Gruppe**

**Analyse**

Ausgangslage

Zielbild

Zielbild im Konzept

[[Konzepte/Import.md#Zielbild]]

- Stern: Kernaussage

**Verbindungen**

- Ausgangslage → Zielbild: ergibt
```

**Was nicht mitreist, ist die räumliche Anordnung.** Der Export gibt Inhalt und Geflecht wieder, kein Bild: Was nebeneinanderlag und was weit auseinander, steht nicht darin. Die Gruppen sind das Einzige, was von der Anordnung hinübergeht, weil sie die gedankliche Gliederung der Fläche tragen. Und die Entsprechung ist eine **Ausgabe, keine zweite Speicherform** — aus ihr lässt sich keine Fläche zurückgewinnen. Das Original bleibt unberührt im eigenen Dokument: Der Export liest die Fläche und schreibt nicht in sie hinein.

**Drucken und PDF-Export sind davon nicht berührt.** Sie folgen weiter der gerenderten Ansicht und zeigen die Fläche als Block, wie im Kapitel darüber beschrieben.

**Ist die Canvas-Ansicht als [interne Erweiterung](extensions.md) abgeschaltet**, bleibt die Fläche auch im Export ein lesbarer Code-Block — dieselbe Aussage, die diese Seite für die gerenderte Ansicht bereits trifft: Das Dokument bleibt lesbar, und es geht nichts verloren.

## Austausch mit anderen Werkzeugen

Eine Fläche muss nicht in dieser Anwendung bleiben. Sie lässt sich als Datei im offenen Format **JSON Canvas** sichern — Endung `.canvas` —, die auch andere Werkzeuge lesen; umgekehrt lässt sich eine solche Datei hier einlesen. Wer mit jemandem zusammenarbeitet, der ein anderes Werkzeug benutzt, kann seine Fläche damit übergeben, statt sie zu beschreiben.

**Die eigene Ablage bleibt die Markdown-Datei.** Die ausgegebene Datei ist ein Austausch-Erzeugnis und kein zweites Speicherformat: Sie wird nicht fortgeschrieben, wenn sich die Fläche später ändert, und beim Einlesen wird sie gelesen und nicht übernommen.

**Eine Fläche ausgeben** — in vier Schritten:

1. Die Canvas-Ansicht öffnen. Trägt das Dokument mehrere Flächen, den Reiter der gewünschten wählen: Ausgegeben wird die Fläche, die gerade zu sehen ist.
2. **Datei → Weitere Datei-Funktionen → Exportieren → Canvas-Fläche als JSON Canvas…** wählen.
3. Im Speichern-Dialog steht der Name des Dokuments mit der Endung `.canvas` im Ordner des Dokuments bereit; Name und Ort lassen sich ändern.
4. Nach dem Schreiben erscheint die Meldung mit dem, was übertragen wurde und was nicht.

Der Eintrag ist nur wählbar, solange die Canvas-Ansicht eine Fläche zeigt; sonst steht er sichtbar, aber ausgegraut da. Das Dokument selbst bleibt unberührt, und trägt es weitere Flächen, nennt die Meldung deren Zahl.

**Eine Datei einlesen** — in vier Schritten:

1. **Datei → Weitere Datei-Funktionen → Importieren → JSON-Canvas-Datei…** wählen. Dafür braucht es weder eine offene Fläche noch ein offenes Dokument.
2. Im Öffnen-Dialog eine oder mehrere Dateien mit der Endung `.canvas` wählen; bei geöffnetem Bereich müssen sie darin liegen.
3. Je gewählter Datei entsteht **neben ihr** ein neues Dokument mit ihrem Namen und der Endung `.md`. Ist dieser Name schon belegt, wird eine Zahl angehängt: Aus `Plan.canvas` wird dann `Plan-2.md`. Jedes neue Dokument wird geöffnet und zeigt die Canvas-Ansicht.
4. Danach erscheint **eine** Meldung über alle gewählten Dateien, mit einem Abschnitt je Datei.

Die gewählten Dateien bleiben unverändert liegen. **Verweise finden ihre Dateien**, wenn die eingelesene Datei an ihrem Platz im übernommenen Ordner liegt — der übliche Fall, wenn ein ganzer fremder Bestand übernommen wird; ein Ziel, das sich so nicht finden lässt, steht danach mit seinem bloßen Dateinamen auf der Karte und wird in der Meldung genannt.

**Nach jedem Vorgang sagt die Anwendung, was übertragen wurde und was nicht** — je mit Anzahl, und auch dann, wenn alles mitgekommen ist. Die Meldung ist keine Fehlermeldung, sondern der Beleg des Austauschs: Beide Formate decken sich nicht vollständig, und was nicht deckungsgleich ist, soll nicht stillschweigend geschehen.

**Was beim Ausgeben aus der Fläche wird:**

| Auf der Fläche | Was daraus wird |
| -------------- | --------------- |
| eine Karte, eine Gruppe, eine Verbindung | dasselbe drüben, mit Lage, Größe, Reihenfolge, Farbe und Beschriftung |
| eine Form | eine Text-Karte an derselben Stelle in derselben Größe, mit der Beschriftung als Text und der Randfarbe als Farbe der Karte; dass es eine Form war, und ihre Füllung stehen nirgends mehr |
| die Beschriftung einer Verweis- oder Bild-Karte | ein Rahmen mit Titel um diese Karte |
| die Farben Blau und Pink | ein Farbwert, weil das andere Format für diese beiden keinen Namen führt |
| eine Anschluss-Seite, welche die Anwendung selbst wählt | keine Angabe; das andere Werkzeug wählt die Seite selbst |
| weitere Flächen desselben Dokuments | nichts — die Datei trägt genau eine Fläche; die Meldung nennt die Zahl der übrigen |
| ein fehlerhaftes oder unbekanntes Element | nichts; es wird gezählt |

**Was beim Einlesen aus der Datei wird:**

| In der Datei | Was daraus wird |
| ------------ | --------------- |
| eine Text-Karte, eine Gruppe, eine Verbindung | dasselbe hier, mit Lage, Größe, Reihenfolge, Farbe und Beschriftung |
| ein einfacher Zeilenumbruch im Text einer Karte | ein fester Zeilenumbruch; die Karte zeigt dieselben Zeilen wie im anderen Werkzeug |
| eine Karte, die auf ein Dokument oder ein Bild zeigt | eine Verweis- beziehungsweise eine Bild-Karte; ein Ziel auf eine Überschrift oder einen Block bleibt erhalten |
| eine Karte mit einer Web-Adresse | eine Text-Karte mit der Adresse als anklickbarem Verweis |
| eine Karte auf eine andere Dateiart | eine Text-Karte mit einem Verweis auf die Datei |
| die Farbe einer Karte | nichts — eine Karte trägt hier keine Farbe |
| ein freier Farbwert an Gruppe oder Verbindung | die nächstliegende der acht Farben |
| eine Verbindung, die an einer Gruppe beginnt oder endet | nichts; Verbindungen laufen hier nur zwischen Karten |
| ein Pfeil nur am Anfang | eine gewöhnliche gerichtete Verbindung, Anfang und Ende getauscht — ohne Verlust |
| ein Hintergrundbild einer Gruppe | nichts |

**Der Weg hin und zurück führt nicht zum Ausgangspunkt.** Eine ausgegebene und wieder eingelesene Fläche kommt **nicht identisch** zurück: Aus einer Form ist eine Text-Karte geworden und bleibt es, aus der Beschriftung einer Verweis-Karte ein Rahmen. Das ist der Preis des Austauschs und keine Lücke — versteckte Kennungen, an denen sich das ursprüngliche Element wiedererkennen ließe, gibt es bewusst nicht, weil sie in jedem anderen Werkzeug als Datenmüll sichtbar wären.

**Ist die Canvas-Ansicht als [interne Erweiterung](extensions.md) abgeschaltet**, stehen beide Wege nicht zur Verfügung: Der Eintrag zum Ausgeben und der Eintrag zum Einlesen verschwinden aus dem Menü, und über die Kommando-Palette sind die beiden Befehle ebenso wenig erreichbar.

## Verweise im Netz des Bereichs

Eine Verweis-Karte ist ein **Verweis wie einer im Fließtext** — nur eben auf einer Fläche. Sie erscheint deshalb überall dort, wo die Anwendung Verweise zeigt:

| Ort | Was erscheint |
| --- | ------------- |
| Rückverweise des Ziels | die Fläche als Quelle, gekennzeichnet mit „auf einer Fläche"; als Ausschnitt steht die Beschriftung der Karte |
| ausgehende Verweise des Dokuments | ein Eintrag der Art „Verweis-Karte auf einer Fläche", mit `C` gekennzeichnet |
| [Graphenansicht](graph.md) | eine Kante wie jeder andere Verweis |

Rückverweise und ausgehende Verweise beschreibt die Seite [Vernetzung](linking.md) im Zusammenhang.

Wird das Ziel **umbenannt oder verschoben**, zieht die Angabe in der Karte nach, wie ein Verweis im Fließtext; dasselbe gilt für das Bild einer Bild-Karte.

Zwei Dinge zählen nicht mit: Ein **Bild** bekommt keinen Knoten im Verweis-Graph, so wenig wie ein Bild im Fließtext. Und ein Verweis im **eigenen Text** einer Karte bleibt außen vor — gewertet wird allein das Ziel der Karte.

## Das Speicherformat

Die Fläche liegt im Klartext im Dokument. Sie ist damit auch ohne diese Anwendung deutbar — und was in den Karten steht, ist in jedem Text-Werkzeug lesbar.

### Aufbau

Innerhalb des Blocks beginnt jedes Element mit einem **Marker in Spalte 0**. Auf der Marker-Zeile stehen seine Angaben; die folgenden Zeilen bis zum nächsten Marker sind sein Inhalt.

Eine Angabe hat die Form `name=wert`. Ein Wert ist entweder ein Wort ohne Leerzeichen oder eine Zeichenkette in doppelten Anführungszeichen, in der `\"` für ein Anführungszeichen und `\\` für einen Rückstrich steht. Kennungen bestehen aus Buchstaben, Ziffern, Bindestrich und Unterstrich.

### Karten

```text
!karte <kennung> x=<zahl> y=<zahl> b=<zahl> h=<zahl>
```

| Angabe | Bedeutung |
| ------ | --------- |
| `x`, `y` | linke obere Ecke der Karte |
| `b`, `h` | Breite und Höhe |

Alle vier sind **ganze Zahlen** und zählen in Bildpunkten bei Zoom 1. Der **Ursprung liegt in der Mitte der Fläche**: Negative Werte liegen links davon beziehungsweise darüber. Die Zeilen unter dem Marker sind der Karten-Text.

Zwei weitere Angaben machen aus der Karte eine **Verweis-** oder eine **Bild-Karte**:

```text
!karte <kennung> x=<zahl> y=<zahl> b=<zahl> h=<zahl> doc="<ziel>"
!karte <kennung> x=<zahl> y=<zahl> b=<zahl> h=<zahl> bild="<bild>"
```

`doc=` zeigt den Inhalt eines Dokuments an. Das Ziel nimmt dieselben Formen wie das Ziel einer Einbettung: den Dokumentnamen oder einen Pfad relativ zum eigenen Dokument, wahlweise gefolgt von `#Überschrift` oder `#^block-id`.

`bild=` zeigt ein Bild an. Der Wert ist ein Pfad relativ zum Dokument oder der bloße Dateiname einer Bild-Datei des Bereichs; zulässig sind die Endungen `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp` und `ico`.

Stehen beide Angaben an derselben Karte, gilt `doc=`. Ein leerer Wert und eine Endung außerhalb der Liste sind ein **Befund**; die Angabe bleibt trotzdem unverändert in der Datei stehen. Die Zeilen unter dem Marker sind auch hier der eigene Text der Karte — bei einer Verweis- und einer Bild-Karte ihre **Beschriftung**.

### Verbindungen

```text
!linie <kennung> <erstes Ende> <pfeil> <zweites Ende> von=<seite> nach=<seite> farbe=<name>
```

Die beiden Enden sind Karten-Kennungen, und der **Pfeil zwischen ihnen trägt die Richtung**:

| Pfeil | Bedeutung |
| ----- | --------- |
| `->` | gerichtet, Pfeilspitze am zweiten Ende |
| `<->` | Pfeilspitze an beiden Enden |
| `--` | ohne Pfeilspitze |

`von=` nennt die Anschluss-Seite am ersten Ende, `nach=` die am zweiten; zulässig sind `links`, `rechts`, `oben`, `unten` und `auto`. `farbe=` färbt die Linie; zulässig sind `blau`, `rot`, `grün`, `gelb`, `lila`, `orange`, `türkis` und `pink`. Ohne diese Angabe wird die Linie in der Standardfarbe des Farbschemas gezeichnet. Die Zeilen unter dem Marker sind die **Beschriftung**.

### Formen

```text
!form <kennung> x=<zahl> y=<zahl> b=<zahl> h=<zahl> art=<name> rand=<farbe> füllung=<farbe>
```

Lage und Größe zählen wie bei der Karte. `art=` ist einer von sechs Namen: `rechteck`, `abgerundet`, `oval`, `dreieck`, `raute` und `stern`. `rand=` und `füllung=` nehmen dieselben acht Farbnamen wie die Verbindung, `füllung=keine` lässt die Form ungefüllt. Ohne `art` gilt `rechteck`, ohne `rand` die Standardfarbe, ohne `füllung` bleibt die Form ungefüllt — eine Vorgabe wird nicht ausgeschrieben, weil ihre Abwesenheit sie bereits sagt. Die Zeilen unter dem Marker sind die **Beschriftung**.

Ein unbekannter Name bei `art` oder bei einer der beiden Farben ist ein **Befund**: Die Form bleibt erhalten, wird als Rechteck beziehungsweise in der Standardfarbe gezeichnet, und ihr Text steht unverändert in der Datei.

### Gruppen

```text
!gruppe <kennung> x=<zahl> y=<zahl> b=<zahl> h=<zahl> farbe=<name>
```

Lage und Größe beschreiben das Rechteck, `farbe=` nimmt einen der acht Farbnamen; ohne Angabe gilt die Standardfarbe. Die Zeilen unter dem Marker sind die **Beschriftung**. **Eine Mitglieder-Liste steht nicht in der Datei** — wer in der Gruppe liegt, ergibt sich aus den Rechtecken und sonst nichts.

### Die Reihenfolge im Block

Die **Reihenfolge im Block ist zugleich die Stapel-Reihenfolge** über Karten, Formen und Gruppen: Was weiter unten steht, liegt weiter vorn. Verbindungen stehen zwar in derselben Folge, sind davon aber nicht berührt; sie werden in einer eigenen Ebene unter allen Elementen gezeichnet.

### Zwei Regeln, die die Datei schützen

- **Der Notausgang für das Ausrufezeichen.** Eine Inhalts-Zeile, die mit `!` beginnt, bekommt beim Schreiben einen Rückstrich davor und verliert ihn beim Lesen wieder: Im Dokument steht `\!Achtung`, in der Karte erscheint `!Achtung`. Soll die Zeile literal `\!Achtung` lauten, steht `\\!Achtung` im Dokument.
- **Unbekanntes bleibt erhalten.** Ein Marker oder eine Angabe, die die Anwendung nicht kennt, wird mitgeführt und unverändert zurückgeschrieben; ein unverändertes Element wird wörtlich ausgegeben. Wer eine Fläche öffnet und ohne Änderung speichert, bekommt dieselbe Datei zurück. Auch eine fehlerhafte Angabe wirft nichts weg: Das Element wird dann auffällig oder gar nicht gezeichnet, verschwindet aber nie aus der Datei.

### Ein Beispiel

````markdown
```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analyse

!karte k1 x=-320 y=-140 b=260 h=120
## Ausgangslage

Der Import liest heute nur eine Quelle.

!karte k2 x=40 y=-140 b=260 h=120
## Zielbild

Mehrere Quellen, eine Zusammenführung.

!karte k3 x=-140 y=120 b=260 h=160
## Offene Frage

Wie werden Konflikte aufgelöst?

!karte k4 x=420 y=-200 b=240 h=160 doc="Konzepte/Import.md#Zielbild"
Zielbild im Konzept

!karte k5 x=420 y=-20 b=240 h=140 bild="Anlagen/Skizze.png"
Skizze der Oberfläche

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Kernaussage

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
ergibt

!linie e2 k3 -- k1
Skizze dazu

!linie e3 k2 <-> k3 von=unten nach=oben
bedingen einander
```
````

Gerendert erscheint an dieser Stelle der Übersichts-Block, und der Knopf darin führt auf die Fläche:

```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analyse

!karte k1 x=-320 y=-140 b=260 h=120
## Ausgangslage

Der Import liest heute nur eine Quelle.

!karte k2 x=40 y=-140 b=260 h=120
## Zielbild

Mehrere Quellen, eine Zusammenführung.

!karte k3 x=-140 y=120 b=260 h=160
## Offene Frage

Wie werden Konflikte aufgelöst?

!karte k4 x=420 y=-200 b=240 h=160 doc="Konzepte/Import.md#Zielbild"
Zielbild im Konzept

!karte k5 x=420 y=-20 b=240 h=140 bild="Anlagen/Skizze.png"
Skizze der Oberfläche

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Kernaussage

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
ergibt

!linie e2 k3 -- k1
Skizze dazu

!linie e3 k2 <-> k3 von=unten nach=oben
bedingen einander
```

## Grenzen

- Der **angezeigte Inhalt** einer Verweis-Karte lässt sich in der Karte nicht ändern; geändert wird er in dem Dokument, auf das sie zeigt. Formen und Gruppen tragen gar keinen gerenderten Inhalt, sondern höchstens eine Beschriftung aus einfachem Text.
- **Einbettungen im angezeigten Inhalt werden nicht aufgelöst.** Zeigt eine Verweis-Karte ein Dokument, das seinerseits etwas einbettet, bleibt diese Stelle in der Karte leer; alles Übrige erscheint unverändert.
- Eine Änderung am Ziel erscheint **sofort**, solange das Ziel in einem anderen geöffneten Dokument bearbeitet wird; wird eine nirgends geöffnete Datei geändert, erscheint das, sobald die Fläche das nächste Mal gezeichnet wird.
- **Freies Zeichnen gibt es nicht.** Die Fläche kennt die sechs Formen-Arten und sonst keine Geometrie; Freihand-Striche, selbst gezogene Pfeile und Stift-Eingabe gehören nicht zum Umfang.
- Eine **Verbindung** verläuft ausschließlich zwischen Karten; an einer Form oder einer Gruppe lässt sie sich nicht anschließen.
- Ein Verweis im **eigenen Text** einer Karte erscheint nicht im Verweis-Graph und nicht in den Rückverweisen; gewertet wird allein das Ziel einer Verweis-Karte. Ein Bild bekommt im Verweis-Graph keinen Knoten.
- **Freies Ziehen und Zoomen gibt es über die Tastatur nicht.** Die Karten-Liste wählt aus, bearbeitet, löscht und legt an; die Lage eines Elements ändert die Tastatur allein über die vier Befehle der Reihenfolge. Verschieben, Größe ändern und den Ausschnitt bewegen bleiben der Maus vorbehalten.
- **Die Liste macht die Fläche bedienbar, nicht anschaulich.** Sie zählt auf, was daliegt, und ersetzt dabei nicht, was die räumliche Anordnung zeigt.
- **Die Suche im Bereich findet ein Dokument mit Fläche weiterhin über seinen Text**, weil die Fläche im Klartext darin steht; ein eigener Treffer-Lieferant ist sie nicht. Einzelne Karten, Formen und Gruppen erscheinen deshalb nicht als eigene Treffer — sie findet das Filter-Feld der Karten-Liste.
- **Der portable Export gibt die Fläche als Text wieder, nicht als Bild.** Die räumliche Anordnung reist nicht mit, und aus der Entsprechung lässt sich keine Fläche zurückgewinnen; hinüber gehen Inhalt, Gruppen und das Geflecht der Verbindungen.
- **Ein fehlerhaftes Element wird im Export nicht stillschweigend weggelassen**, sondern mit dem von ihm Lesbaren ausgegeben und mit einer Hinweis-Zeile versehen. Eine Form ohne Beschriftung entfällt dagegen, weil von ihr ohne die räumliche Darstellung nichts bliebe.
- **Der Austausch mit dem offenen Format ist kein verlustfreier Rückweg.** Eine ausgegebene und wieder eingelesene Fläche kommt nicht identisch zurück: Eine Form kehrt als Text-Karte wieder, die Beschriftung einer Verweis-Karte als Rahmen.
- **Eine Datei des fremden Formats wird nicht als Dokument geöffnet, sondern eingelesen.** Sie bleibt dabei unverändert liegen; die Fläche trägt danach das neue Dokument neben ihr, und was dort geändert wird, wandert nicht in die Datei zurück.
- Eine Fläche gehört zu ihrem Dokument. Karten lassen sich nicht von einer Fläche auf eine andere ziehen.
