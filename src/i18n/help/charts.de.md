# Diagramme zu Tabellen

Ein **Diagramm zu einer Tabelle** zeigt die Werte einer [Perspective Datatable](datatable.md) als Linien-, Balken-, Kreis- oder Donut-Diagramm. Das Diagramm ist ein **eigener Code-Block** im Dokument, der seine Tabelle beim Namen nennt. Es hält **keine eigenen Zahlen**: Der Block sagt nur, welche Tabelle und welche ihrer Spalten oder Zeilen gezeigt werden, und das Diagramm folgt der Tabelle bei jeder Änderung — schon beim Tippen, im Quelltext ebenso wie im Grid, auch bevor das Dokument gespeichert ist.

Das Diagramm steht, wo man es hinsetzt: über der Tabelle, unter ihr oder an einer ganz anderen Stelle des Dokuments. Zu einer Tabelle dürfen mehrere Diagramme gehören, etwa zwei Blickwinkel auf dieselben Zahlen. Tabelle und Diagramm sind gleichzeitig zu sehen; einen Umschalter an der Tabelle gibt es nicht. Diagramme erscheinen in der Lese-Ansicht, in der geteilten Ansicht und im Live-Modus.

## Ein Beispiel

Eine Datentabelle mit dem Namen `Umsatz` und ein Balken-Diagramm darauf:

````markdown
```perspective-datatable
table: Umsatz
columns: Monat:text, Einnahmen:number, Ausgaben:number
aggregate: Einnahmen:sum, Ausgaben:sum
| Januar | 1200 | 800 |
| Februar | 1350 | 900 |
| März | 1100 | 950 |
| April | 1500 | 1000 |
```

```perspective-chart
table: Umsatz
type: bar
labels: Monat
values: Einnahmen, Ausgaben
title: Einnahmen und Ausgaben
```
````

Gerendert erscheinen Tabelle und Diagramm:

```perspective-datatable
table: Umsatz
columns: Monat:text, Einnahmen:number, Ausgaben:number
aggregate: Einnahmen:sum, Ausgaben:sum
| Januar | 1200 | 800 |
| Februar | 1350 | 900 |
| März | 1100 | 950 |
| April | 1500 | 1000 |
```

```perspective-chart
table: Umsatz
type: bar
labels: Monat
values: Einnahmen, Ausgaben
title: Einnahmen und Ausgaben
```

Jede Werte-Spalte ist eine Datenreihe, jeder Monat eine Rubrik auf der Achse. Die Aggregat-Zeile mit den Summen gehört nicht dazu.

## Der Name der Tabelle

Den Namen einer Datentabelle trägt die Zeile `table:` in ihrem Block, bei den Kopf-Angaben vor den Datenzeilen, im Beispiel als erste Zeile. Das Diagramm nennt ihn in derselben Schreibweise in seiner Angabe `table:`. Erlaubt sind Buchstaben (auch Umlaute und ß), Ziffern, Bindestrich und Unterstrich, kein Leerzeichen und kein Punkt; Groß- und Kleinschreibung zählen, `Umsatz` und `umsatz` sind zwei Namen. Der Name ist zugleich die Kennung der Tabelle als Block: Ein Verweis wie `[[Bericht#^Umsatz]]` springt zu ihr, eine Einbettung zeigt sie, und ihre [Block-Eigenschaften](block-properties.md) hängen an ihm. In der gerenderten Ansicht, im Druck und im PDF ist die Zeile nicht zu sehen.

- Kommt ein Name mehrfach vor, gilt das **erste Vorkommen** im Dokument.
- Ein Name in einem Code-Block oder im Frontmatter benennt nichts; Beispiele in Code-Blöcken stören deshalb nicht.
- Verletzt der Name die Regel oder steht die Zeile zweimal im Block, meldet die Tabelle den Fehler mit Zeilennummer; ihre Werte bleiben sichtbar.
- Eine Zeile `^name` unmittelbar unter der Tabelle, wie sie ältere Dokumente tragen, gilt weiter als Name.
- Wird der Name über das Panel [Block-Eigenschaften](block-properties.md) umbenannt, ziehen die Diagramme **im selben Dokument** mit.

## Die Angaben des Blocks

Der Block `perspective-chart` trägt eine Angabe je Zeile in der Form `schlüssel: wert`:

| Angabe | Bedeutung |
|---|---|
| `table:` | die Tabelle: ihr Name im selben Dokument, etwa `Umsatz`, oder `[[Datei#^Umsatz]]` für eine Tabelle in einem anderen |
| `type:` | die Art: `line`, `bar`, `pie` oder `donut` |
| `series:` | woraus die Datenreihen kommen: `columns` (Spalten) oder `rows` (Zeilen); ohne die Zeile gilt `columns` |
| `labels:` | die Beschriftungs-Spalte |
| `values:` | die Werte-Spalten, durch Komma getrennt |
| `rows:` | die Zeilen, über ihren Eintrag in der Beschriftungs-Spalte, durch Komma getrennt (nur bei `series: rows`) |
| `title:` | ein Titel am Diagramm; ohne die Zeile erscheint keiner |

Die Schlüssel-Wörter und die Namen der Arten sind in jeder Sprache der Oberfläche dieselben; ein Dokument bedeutet damit überall dasselbe. Spalten werden über ihre **Kennung** genannt, wie in den Aggregaten der Datentabelle, nicht über eine eigene Überschrift; Groß- und Kleinschreibung spielt dabei keine Rolle. Steht eine Angabe doppelt, gilt die erste. Zeilen, die das Diagramm nicht kennt, übergeht es; sie bleiben unverändert stehen.

## Die vier Arten

- **Linie** (`line`) und **Balken** (`bar`) tragen eine oder mehrere Datenreihen; bei mehreren Reihen stehen die Balken einer Rubrik nebeneinander. Negative Werte werden gezeichnet.
- **Kreis** (`pie`) und **Donut** (`donut`) tragen genau eine Datenreihe; jedes Stück ist mit dem Namen seiner Rubrik beschriftet. Bei sehr vielen Stücken zeigt ein Kreis- oder Donut-Diagramm nur die Beschriftungen, die Platz haben.

Die Zahlen an der Werte-Achse stehen wie in der Datentabelle mit Dezimalpunkt und ohne Tausender-Trennzeichen.

## Datenreihen aus Spalten oder aus Zeilen

**Aus Spalten** (`series: columns`, der Normalfall): Jede Werte-Spalte ist eine Datenreihe. Die Rubriken kommen aus der Beschriftungs-Spalte, ein Eintrag je Zeile der Tabelle — so wie im Beispiel oben.

**Aus Zeilen** (`series: rows`): Jede genannte Zeile ist eine Datenreihe und trägt den Namen ihres Eintrags in der Beschriftungs-Spalte. Das Diagramm nennt eine Zeile über diesen Eintrag, nicht über ihre Lage in der Tabelle; der Eintrag muss genau so geschrieben sein, wie die Tabelle ihn zeigt, auch in Groß- und Kleinschreibung. Enthält ein Eintrag selbst ein Komma, steht es als `\,`. Die Rubriken sind die Überschriften der Werte-Spalten; ohne Angabe `values:` sind es alle Zahl-Spalten außer der Beschriftungs-Spalte.

````markdown
```perspective-chart
table: Umsatz
type: donut
series: rows
labels: Monat
rows: April
title: April
```
````

Gerendert, auf dieselbe Tabelle wie oben:

```perspective-chart
table: Umsatz
type: donut
series: rows
labels: Monat
rows: April
title: April
```

Für beide Richtungen gilt:

- **Werte kommen nur aus Zahl-Spalten**, berechnete Zahl-Spalten eingeschlossen, mit ihren berechneten Werten. Die Beschriftungs-Spalte darf jeden Typ haben.
- Wo eine Reihe oder Rubrik nach einer Spalte benannt ist, trägt sie die **Überschrift**, die die Tabelle in ihrem Spaltenkopf zeigt.
- Reihen und Rubriken stehen in der **Reihenfolge der Tabelle**, nicht in der Reihenfolge der Nennung.
- Die **Aggregat-Zeile** gehört weder zu den Datenreihen noch zu den Rubriken.
- Maßgeblich ist der geschriebene Inhalt der Tabelle: **Sortieren und Filtern** der Datentabelle in der Ansicht ändern das Diagramm nicht.

## Eine Tabelle in einem anderen Dokument

Ein Diagramm kann auch eine Datentabelle in einem anderen Dokument nennen, in der Schreibweise eines Verweises auf einen benannten Block:

```markdown
table: [[Bericht#^Umsatz]]
```

So entsteht etwa eine Übersichts-Seite mit Diagrammen zu Tabellen aus mehreren Notizen. Für ein solches Diagramm gilt alles, was für ein Diagramm im selben Dokument gilt. Dazu:

- **Gesucht wird das andere Dokument wie bei einer Einbettung** desselben Ziels (siehe [Vernetzung](linking.md)): nach denselben Regeln und innerhalb derselben Grenzen des Bereichs. Die Endung `.md` darf fehlen.
- **Ist das andere Dokument geöffnet**, zeigt das Diagramm dessen geschriebenen Stand, auch den noch ungespeicherten, schon beim Tippen — gleich, ob es im selben oder in einem anderen Fenster geöffnet ist. Ist es nicht geöffnet, gilt der gespeicherte Stand.
- **Wird die Datei von außen geändert** und bemerkt die Anwendung das, zeichnet das Diagramm mit dem neuen Stand, ohne dass das Dokument neu geöffnet werden muss. Einbettungen desselben Ziels frischen ebenso auf.
- **Wird die Datei umbenannt**, zieht die Angabe `table:` im Diagramm nach.
- **Der Bezug ist ein Verweis**: In den Rückverweisen, in den ausgehenden Verweisen und im Graphen zählt er wie eine Einbettung.
- Das Diagramm **liest** das andere Dokument nur; es verändert es nie.

## Wenn ein Diagramm nicht gezeichnet werden kann

Eignet sich eine Tabelle gerade nicht für ein Diagramm, steht an seiner Stelle ein Hinweis mit der Überschrift **Das Diagramm kann nicht gezeichnet werden** und einem Satz, der den Grund nennt. Die Gründe, in ihrer festen Reihenfolge:

1. Das genannte **andere Dokument fehlt**.
2. **Der Name kommt im Dokument nicht vor** — oder das Diagramm nennt gar keine Tabelle.
3. Der Name gehört **nicht zu einer Datentabelle**, sondern etwa zu einer gewöhnlichen Tabelle, einer Perspective Table oder einem anderen Block.
4. Die Datentabelle meldet selbst einen **Fehler in ihrem Aufbau** — auch dann, wenn sie trotz der Meldung noch Werte zeigt. Das Diagramm erscheint, sobald der Fehler in der Tabelle behoben ist.
5. Eine genannte **Spalte fehlt**, ein genannter Zeilen-Eintrag trifft **keine oder mehrere Zeilen**, oder eine nötige Angabe fehlt im Diagramm oder hat einen unbekannten Wert.
6. Eine als Werte genannte Spalte ist **keine Zahl-Spalte**.
7. Die gewählten Datenreihen enthalten **keine einzige Zahl**.
8. Die **Art verträgt die Daten nicht**: Ein Kreis oder Donut bekommt negative Werte, besteht aus lauter Nullen oder trägt mehr als eine Datenreihe — oder die Art fehlt oder ist unbekannt.

Liegen mehrere Gründe zugleich vor, nennt der Hinweis den ersten. Wird der Grund behoben, erscheint das Diagramm an Stelle des Hinweises, schon beim Tippen. Der Hinweis steht in der Sprache der Oberfläche und verändert das Dokument nicht.

### Ausgelassene Werte

Sind nur einzelne Zellen der gewählten Datenreihen **leer** oder **Fehler-Zellen** — Werte, die nicht zum Typ der Spalte passen —, wird ohne diese Werte gezeichnet. Eine Zeile unter dem Diagramm nennt ihre Zahl, zum Beispiel:

> 2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.

Ohne ausgelassene Werte erscheint diese Zeile nicht; wird eine Zelle ausgefüllt oder berichtigt, sinkt die Zahl. Eine Tabelle, die gerade ausgefüllt wird, erscheint so schon mit der ersten Zahl als Diagramm. Linien und Balken aus lauter Nullen werden gezeichnet, denn Nullen sind Zahlen.

## Farben

Die Datenreihen tragen die Farben des aktiven [Farbschemas](color-schemes.md): Jedes Farbschema hat in der Gruppe **Diagramme** zehn Farben, **Datenreihe 1** bis **Datenreihe 10**. Die erste Datenreihe trägt die erste Farbe, die zweite die zweite und so fort; bei Kreis und Donut gilt das je Stück. Ab der elften Reihe beginnen die Farben wieder mit der ersten.

Ändert man eine dieser Farben, wechselt das Farbschema oder zwischen Hell und Dunkel, folgt das Diagramm sofort. Beschriftungen und Achsen nehmen die Textfarben des Farbschemas.

## Drucken, PDF und portabler Export

**Drucken und PDF-Export** (siehe [Werkzeuge](tools.md)) zeigen das Diagramm, wenn sie aus der Lese-Ansicht, der geteilten Ansicht oder dem Live-Modus heraus ausgeben. Gezeichnet wird dort **hell**, mit den Diagramm-Farben des hellen Farbschemas, auch wenn die Anwendung dunkel läuft; danach zeigt die Anwendung wieder ihre eigenen Farben. Ein nicht zeichenbares Diagramm erscheint mit seinem Hinweis, wie auf dem Bildschirm, und ein Diagramm bleibt beim Seitenumbruch samt Hinweis und Zeile der ausgelassenen Werte nach Möglichkeit beisammen. Liegt die Tabelle in einem anderen Dokument, wartet die Ausgabe, bis sie gelesen ist; gelingt das nicht rechtzeitig, steht an der Stelle des Diagramms der Hinweis «Die Tabelle konnte nicht rechtzeitig gelesen werden.». Aus der Quelltext-Ansicht geben Drucken und PDF-Export das Roh-Markdown aus.

Der **portable Export** schreibt das Diagramm als **Bild** in die Datei, hell gezeichnet, sodass ein Empfänger es ohne diese Anwendung sieht. Die Tabelle bleibt im Export eine Tabelle; das Bild tritt allein an die Stelle des Diagramm-Blocks. Mussten Werte ausgelassen werden, steht unter dem Bild dieselbe Zeile wie auf dem Bildschirm. Ein nicht zeichenbares Diagramm bleibt als unveränderter Block stehen. Das Bild ist in die Datei eingebettet; der Betrachter des Empfängers muss solche Bilder darstellen können, wie bei den Mermaid-Diagrammen auf der Seite [Mathematik und Diagramme](math-diagrams.md).

Ausgegeben werden überall die Werte, die das Diagramm im Augenblick der Ausgabe zeigt, auch ungespeicherte und die aus einem anderen Dokument. Drucken und Export verändern das Dokument nicht.

## Diagramm einfügen und bearbeiten

Ein Diagramm muss man nicht von Hand schreiben. Zwei Kommandos mit einem gemeinsamen Dialog fügen es an einer Datentabelle ein und ändern es später, ohne dass man die Angaben des Blocks, den Namen der Tabelle oder die Kennungen ihrer Spalten kennen muss: **Diagramm zu dieser Tabelle einfügen** und **Diagramm bearbeiten**.

### Einfügen

**Diagramm zu dieser Tabelle einfügen** steht an vier Stellen:

- im **Kontextmenü der Datentabelle**: Rechtsklick auf das Grid im Live-Modus oder in der gerenderten Hälfte der geteilten Ansicht, auf eine Zelle, eine Spalten-Überschrift oder den Rand um das Grid. Die Tabelle bleibt dabei als Grid stehen, und das Menü trägt nur diesen einen Eintrag.
- im [Kontextmenü des Editors](context-menu.md), wenn die Schreibmarke in einer Datentabelle steht, etwa nach einem Rechtsklick in ihren Quelltext;
- im Menü **Ansicht → Diagramm**;
- in der **Kommando-Palette** (Standard `Strg+K`).

Wählbar ist das Kommando nur, wenn das Dokument änderbar ist und feststeht, an welcher Datentabelle es wirkt: Die Schreibmarke steht in einer Datentabelle, oder die Tabelle ist angeklickt — weil gerade in einer ihrer Zellen gearbeitet wird oder weil der Rechtsklick sie getroffen hat. Solange eine Zelle der Datentabelle bearbeitet wird, ist es deshalb auch über das Menü und die Kommando-Palette wählbar. Eine gewöhnliche Markdown-Tabelle oder eine Perspective Table zählt nicht als Datentabelle. Ein Rechtsklick in eine gerade geöffnete Zell-Eingabe zeigt kein Menü; die Eingabe bleibt offen.

Das Kommando öffnet den Dialog, der unten beschrieben ist. Nach dem Bestätigen gilt:

- **Der Name der Tabelle.** Trägt die Tabelle noch keinen, bekommt sie als erste Zeile ihres Blocks `table: tabelle-1`, mit der kleinsten Zahl, die im Dokument noch frei ist: Ist `tabelle-1` schon vergeben, wird es `tabelle-2`, und so fort. Unter die Tabelle wird nichts geschrieben. Trägt sie bereits einen Namen, bleibt sie unverändert, und das Diagramm nennt diesen.
- **Der Ort.** Der Diagramm-Block steht unmittelbar unter der Tabelle; ein Diagramm, das dort schon steht, rückt nach unten. Ein weiteres Diagramm zur selben Tabelle nennt denselben Namen.
- **Die Anzeige.** Tabelle und neues Diagramm stehen sofort gezeichnet da; im Live-Modus ist das neue Diagramm danach ausgewählt.
- **Rückgängig.** Ein einziger Rückgängig-Schritt (`Strg+Z`) nimmt das Diagramm und einen dabei vergebenen Namen zusammen zurück.

Wer den Dialog abbricht, ändert nichts: Es entsteht weder ein Diagramm noch ein Name.

### Der Dialog

Der Dialog trägt die Überschrift des Kommandos, beim Einfügen **Diagramm zu dieser Tabelle einfügen**, beim Bearbeiten **Diagramm bearbeiten**; beim Bearbeiten nennt er darunter die Tabelle, etwa **Tabelle: Umsatz**. Er bietet nur an, was die Tabelle hergibt, sodass keine ungültige Angabe entstehen kann. Die Felder, von oben nach unten:

| Feld | Was es anbietet |
|---|---|
| **Diagramm-Art** | Linie, Balken, Kreis oder Donut |
| **Datenreihen aus** | Spalten oder Zeilen; eine Richtung, bei der keine Datenreihe übrig bliebe, ist nicht wählbar |
| **Beschriftungs-Spalte** | jede Spalte der Tabelle, mit ihrer Überschrift; nicht wählbar ist eine Spalte, neben der keine Datenreihe übrig bliebe |
| **Datenreihen (Werte-Spalten)** | bei Datenreihen aus Spalten: die Zahl-Spalten außer der Beschriftungs-Spalte, berechnete eingeschlossen und mit «berechnet» gekennzeichnet |
| **Datenreihen (Zeilen)** | bei Datenreihen aus Zeilen: die Zeilen, jede mit ihrem Eintrag in der Beschriftungs-Spalte |
| **Titel (optional)** | ein freier Text; bleibt er leer, erscheint kein Titel |

Darunter stehen die Knöpfe **Abbrechen** und **Einfügen** bzw. **Übernehmen**. Dazu:

- Bei **Linie** und **Balken** lassen sich mehrere Datenreihen ankreuzen; eine bleibt immer angekreuzt. Bei **Kreis** und **Donut** ist genau eine zu wählen, und der Dialog sagt es: «Ein Kreis- oder Donut-Diagramm zeigt genau eine Datenreihe.»
- Zeilen, deren Eintrag in der Beschriftungs-Spalte leer oder nicht eindeutig ist, stehen nicht zur Wahl; ein Satz unter der Liste nennt ihre Zahl.
- Beim Einfügen ist vorbelegt: Balken, Datenreihen aus Spalten, als Beschriftung die erste Spalte, die keine Zahl-Spalte ist (sonst die erste wählbare), und alle wählbaren Zahl-Spalten.
- **Ohne Maus:** Beim Öffnen steht der Fokus auf der Diagramm-Art; der Tabulator führt durch die Felder und bleibt im Dialog. `Enter` bestätigt aus einem Feld heraus, `Esc` bricht ab, ebenso ein Klick neben den Dialog.
- Es ist immer nur ein Dialog offen. Ein zweiter Aufruf eines der beiden Kommandos, etwa aus der Kommando-Palette, holt den offenen Dialog nach vorn.

### Bearbeiten

**Diagramm bearbeiten** wirkt auf das ausgewählte Diagramm. Ausgewählt ist ein Diagramm, wenn die Schreibmarke in seinem Block steht, im Live-Modus auch, wenn es angeklickt ist: Ein Klick hebt es hervor, es bleibt gezeichnet, und die Schreibmarke bleibt, wo sie war. `Esc` oder ein Klick in den Text daneben hebt die Auswahl wieder auf. Den Quelltext des Blocks erreicht man weiterhin mit den Pfeiltasten.

Das Kommando steht an denselben vier Stellen:

- im **Kontextmenü des Diagramms**: Rechtsklick auf das gezeichnete Diagramm im Live-Modus oder in der gerenderten Hälfte der geteilten Ansicht. Das Diagramm bleibt dabei gezeichnet, und das Menü trägt nur diesen einen Eintrag.
- im [Kontextmenü des Editors](context-menu.md), wenn die Schreibmarke im Block des Diagramms steht;
- im Menü **Ansicht → Diagramm**;
- in der **Kommando-Palette**.

Wählbar ist es nur, wenn ein Diagramm ausgewählt und das Dokument änderbar ist. Es öffnet denselben Dialog wie das Einfügen, vorbelegt mit den Angaben des Blocks; angeboten werden die Spalten und Zeilen der Tabelle, die das Diagramm nennt. Nach dem Bestätigen trägt der Block die geänderten Angaben, und das Diagramm erscheint sofort mit ihnen. Dabei gilt:

- Der Name, den das Diagramm nennt, und die Tabelle selbst bleiben unverändert; geschrieben wird allein der Diagramm-Block.
- Angaben im Block, die der Dialog nicht kennt, bleiben erhalten.
- Bestätigen ohne Änderung schreibt nichts, Abbrechen ändert nichts.
- Ein einziger Rückgängig-Schritt nimmt die Änderung zurück.

**Eine Tabelle in einem anderen Dokument.** Auch ein Diagramm mit der Angabe `table: [[Datei#^name]]` lässt sich so bearbeiten. Der Dialog liest die Spalten und Zeilen aus dem anderen Dokument und nennt es unter der Überschrift, etwa **Tabelle: Umsatz im Dokument «Bericht»**. Geschrieben wird nur der Block im eigenen Dokument; das andere Dokument bleibt unverändert. Einfügen lässt sich ein solches Diagramm über das Kommando nicht, denn es wirkt immer an der Tabelle, an der es aufgerufen wird; ein Diagramm auf eine Tabelle in einem anderen Dokument entsteht durch Schreiben (siehe «Eine Tabelle in einem anderen Dokument» oben).

### Wann statt des Dialogs eine Meldung erscheint

Kann zu der Tabelle kein Diagramm entstehen, öffnet sich kein Dialog; stattdessen nennt eine Meldung in der Statusleiste den Grund, etwa «Zu dieser Tabelle lässt sich kein Diagramm einfügen. Die Tabelle hat keine Zahl-Spalte.» Das geschieht:

- beim Einfügen wie beim Bearbeiten, wenn die Tabelle **keine Zahl-Spalte** hat, keine ihrer Spalten und Zeilen eine Datenreihe ergibt oder sie einen **Fehler in ihrem Aufbau** meldet, und wenn der Block der Tabelle oder des Diagramms nicht geschlossen ist;
- beim Bearbeiten außerdem, wenn die Tabelle, die das Diagramm nennt, **nicht auffindbar** ist — der Name kommt nicht vor, oder das andere Dokument fehlt — oder wenn der Name **nicht zu einer Datentabelle** gehört. Wird das andere Dokument gerade noch erfasst, bittet die Meldung, es gleich noch einmal zu versuchen.

Werden Tabelle oder Diagramm geändert, während der Dialog offen ist, schreibt das Bestätigen nichts, und eine Meldung sagt es; ebenso, wenn inzwischen Bearbeiten ausgeschaltet wurde oder ein anderes Dokument an die Stelle des Dokuments getreten ist.

### Wo die Kommandos nicht wählbar sind

- In der **Lese-Ansicht** ist das Dokument nicht änderbar: Ein Rechtsklick auf Datentabelle oder Diagramm zeigt kein Menü, und keines der beiden Kommandos ist wählbar.
- Ist **Bearbeiten ausgeschaltet** (Ansicht → Bearbeiten), gilt dasselbe im Live-Modus und in der geteilten Ansicht; ein Klick wählt dann auch kein Diagramm aus.
- Eine Datentabelle oder ein Diagramm in einer Einbettung, in der Ausgabe eines Skript-Blocks oder auf einer Karte einer Canvas-Fläche bietet beim Rechtsklick keinen dieser Einträge an.

### Mit der Tastatur

Im Live-Modus ist das Grid der Datentabelle mit der Tastatur nicht erreichbar. Der Weg ohne Maus führt über die Schreibmarke: mit den Pfeiltasten in den Block der Tabelle oder des Diagramms, der dann seinen Quelltext zeigt, und danach das Kommando aus der Kommando-Palette oder dem Menü **Ansicht → Diagramm**. In der gerenderten Hälfte der geteilten Ansicht erreicht der Tabulator die Zellen der Datentabelle; eine Zelle mit dem Fokus gilt wie eine angeklickte. Der Dialog selbst ist ganz ohne Maus bedienbar.

## Die Erweiterung «Diagramm zu einer Datentabelle»

Die Diagramme gehören zu den [internen Erweiterungen](extensions.md) und sind im Arbeitsmodus **Voll** eingeschaltet. Ist die Erweiterung aus, erscheint der Block als gewöhnlicher Code-Block, auch in Druck, PDF und portablem Export; das Dokument bleibt unverändert, und nach dem Einschalten erscheint das Diagramm wieder. Die beiden Kommandos gibt es dann nicht, weder im Menü noch in der Kommando-Palette noch in einem Kontextmenü.

Die Diagramme bauen auf der Erweiterung **Perspective Datatable** auf: Solange sie eingeschaltet sind, lässt sich die Datentabelle nicht abschalten. Ist die Datentabelle aus, sind die Diagramme es ebenfalls.

## Grenzen

- **Quelle ist ausschließlich die Datentabelle.** Eine gewöhnliche Markdown-Tabelle, eine Perspective Table, Ergebnisse einer Abfrage und Datensätze der Datenbank sind keine Quelle eines Diagramms.
- **Bearbeitet wird die Tabelle, nicht das Diagramm.** Das Diagramm ist eine Grafik; Werte lassen sich an ihm weder ändern noch beim Überfahren anzeigen. Ändern lassen sich am Diagramm allein seine Angaben, mit «Diagramm bearbeiten» oder im Quelltext.
- **Keine eigenen Rechnungen.** Das Diagramm bildet keine Summen oder Durchschnitte über Reihen; wer sie zeigen will, rechnet sie in einer berechneten Spalte der Tabelle.
- **Vier Arten.** Flächen, gestapelte Balken und weitere Arten gibt es nicht.
- **Farben gehören zum Farbschema**, nicht zum einzelnen Diagramm.
- **Änderungen von außen an einem anderen Dokument** bemerkt die Anwendung nur, wenn sie die Datei beobachtet: liegt das Dokument in einem Bereich, die ganze Bereichs-Wurzel, sonst den Ordner des Dokuments bis zwei Ebenen tief — und erst, nachdem die Anwendung diesen Ordner einmal vollständig eingelesen hat.
- **Ein anderes Dokument in einem verknüpften Bereich** (Schreibweise `[[@zt:Datei#^name]]`) wird nicht gefunden; an Stelle des Diagramms steht der Hinweis zum fehlenden Dokument, so wie eine Einbettung desselben Ziels nicht erscheint.
- **Umbenennen des Namens einer Tabelle** zieht nur die Diagramme im selben Dokument nach. Diagramme in anderen Dokumenten ziehen nicht nach, ebenso wenig eine Angabe, die das eigene Dokument in der Schreibweise `[[Datei#^name]]` nennt.
- **Eine Datentabelle in einem Zitat** oder in einer tiefer eingerückten Liste trägt keinen Namen, den Diagramm, Verweis oder Einbettung finden.
