# Canvas-Fläche

Eine **Canvas** ist eine räumliche Arbeitsfläche in einem gewöhnlichen Markdown-Dokument: **Karten** mit eigenem Text liegen frei angeordnet darauf, **Verbindungen** ziehen Beziehungen zwischen ihnen, **Formen** setzen Zeichen daneben und **Gruppen** fassen zusammen, was zusammengehört. Wer Alternativen nebeneinanderlegt, einen Ablauf skizziert oder Gedanken erst einmal sortiert, ordnet hier nach Lage statt nach Reihenfolge.

Getragen wird die Fläche von einem Code-Block mit dem Sprach-Tag `perspective-canvas`. Ein Dokument darf beliebig viele davon enthalten, und alles Übrige darin bleibt gewöhnliches Markdown.

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Canvas-Ansicht"). Ist sie abgeschaltet, bleibt der Block ein regulärer Code-Block, der Ansichts-Modus entfällt, und die Kommandos für Fläche, Karte, Form, Gruppe und Reihenfolge verschwinden. Das Dokument bleibt dabei unverändert lesbar; es geht nichts verloren.

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

**Als einziger der sechs Modi ist er dokument-abhängig.** Wählbar ist er nur, wenn das Dokument eine Canvas-Fläche enthält — eine Canvas-Ansicht ohne Fläche zeigte nichts als einen Hinweis. Fehlt die Fläche, bleiben Schaltfläche und Menü-Eintrag **sichtbar und gedämpft** stehen; der Grund steht im Titel der Schaltfläche. Der Weg über Tastenkürzel und Kommando-Palette führt dann nicht hinein und wirft auch nicht aus der aktuellen Ansicht. Entsteht eine Fläche im Text oder fällt sie weg, zieht der Zugang nach. Ein Dokument, das beim Beenden in der Canvas-Ansicht offen war und dessen Fläche inzwischen fehlt, öffnet in der Lese-Ansicht.

## Mehrere Flächen in einem Dokument

Enthält ein Dokument mehr als eine Fläche, erscheint oberhalb der Fläche eine Leiste mit einem **Reiter** je Fläche; ein Klick darauf wechselt die gezeigte Fläche und passt sie ein. Bei genau einer Fläche gibt es keine Leiste.

Die Beschriftung wird abgeleitet und nicht angegeben: die erste sinnvolle Zeile der ersten Karte, sonst eine Zählung („Fläche 2"). Im Dokument steht dafür nichts. Welche Fläche gewählt ist, gilt je geöffnetem Dokument, überlebt das Tippen und den Ansichts-Wechsel und wird nicht gespeichert — eine reine Ansichts-Handlung soll das Dokument nicht ändern.

## Karten

### Anlegen

- **Doppelklick** auf den freien Hintergrund legt eine Karte an der Klick-Stelle an und öffnet sofort ihre Text-Eingabe.
- **Rechtsklick** auf den Hintergrund → „Karte auf der Fläche anlegen" tut dasselbe an der Klick-Stelle.
- Das Kommando **„Karte auf der Fläche anlegen"** (Kommando-Palette, Ansicht-Menü, belegbares Kürzel) legt sie in der Mitte des sichtbaren Ausschnitts an. Außerhalb der Canvas-Ansicht meldet es in der Statusleiste, dass Karten nur dort entstehen.

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
- Das Kommando **„Form auf der Fläche anlegen"** (Kommando-Palette, Ansicht-Menü, belegbares Kürzel) legt ein Rechteck in der Mitte des sichtbaren Ausschnitts an.

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

Zwei Wege führen hin: das **Kontextmenü** des Elements und **Ansicht → Reihenfolge auf der Fläche**. Dieselben Befehle stehen in der Kommando-Palette (Standard `Strg+K`); Kürzel sind nicht vorbelegt und lassen sich in den Einstellungen vergeben.

**Neue Elemente haben ihren Platz:** Eine neue Gruppe entsteht ganz hinten, eine neue Form und eine neue Karte ganz vorn.

**Verbindungen sind davon nicht berührt.** Sie werden in einer eigenen Ebene unter allen Elementen gezeichnet und lassen sich nicht in der Reihenfolge bewegen.

## Rückgängig

`Strg+Z` nimmt die letzte Handlung auf der Fläche zurück, `Strg+Y` und `Strg+Umschalt+Z` stellen sie wieder her. Jede Handlung ist genau ein Schritt: eine verschobene Karte, eine geänderte Größe, eine angelegte Verbindung, ein geänderter Text. Steht die Text-Eingabe einer Karte oder einer Verbindung offen, gilt `Strg+Z` dort dem getippten Text.

## Navigation

- **Verschieben** — den freien Hintergrund mit gedrückter Maustaste ziehen.
- **Zoom** — Mausrad über der Fläche, zentriert um den Zeiger.
- **Einpassen** — beim Wechsel in die Ansicht und beim Wechsel der Fläche passt sich der Ausschnitt selbst ein.

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

- Eine Karte trägt **eigenen Text**; andere Karten-Arten gibt es nicht. Formen und Gruppen gehören zur Fläche, tragen aber keinen gerenderten Inhalt, sondern höchstens eine Beschriftung aus einfachem Text.
- **Freies Zeichnen gibt es nicht.** Die Fläche kennt die sechs Formen-Arten und sonst keine Geometrie; Freihand-Striche, selbst gezogene Pfeile und Stift-Eingabe gehören nicht zum Umfang.
- Eine **Verbindung** verläuft ausschließlich zwischen Karten; an einer Form oder einer Gruppe lässt sie sich nicht anschließen.
- Ein Verweis im Text einer Karte erscheint **nicht** im Verweis-Graph und nicht in den Rückverweisen: Der Bereichs-Index überspringt den Inhalt von Code-Blöcken.
- Die Fläche wird mit der Maus bedient; über die Tastatur laufen Rückgängig, Löschen und die Text-Eingaben.
- Eine Fläche gehört zu ihrem Dokument. Karten lassen sich nicht von einer Fläche auf eine andere ziehen.
