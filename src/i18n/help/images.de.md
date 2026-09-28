# Bilder

Bilder laden aus lokalen Dateien, deren Pfad relativ zur Markdown-Datei angegeben ist, oder aus im Text eingebetteten Daten. Bilder mit einer Adresse aus dem Netz (`http(s)`) zeigt die Anwendung bewusst nicht an, weil sie aus Sicherheitsgründen keine Inhalte aus dem Netz nachlädt; ein solches Bild wird stattdessen als Datei neben das Dokument gelegt. Das Handbuch bündelt keine Demo-Bilder; die Beispiele zeigen deshalb die Syntax als Code-Block mit beschriebenem Ergebnis — in eigenen Dateien rendern sie direkt.

## Bild-Syntax

Der Alt-Text in den eckigen Klammern beschreibt das Bild (wichtig für Barrierefreiheit; ein fehlender Alt-Text wird vom [Markdown-Linter](tools.md) markiert).

```markdown
![Diagramm der Architektur](bilder/architektur.png)
```

Relative Pfade lösen gegen den Ordner der Markdown-Datei auf. Aus Sicherheitsgründen bleiben nur Bilder innerhalb einer festen Grenze auflösbar: bei geöffnetem Arbeitsbereich ist das dessen Wurzel, sonst der Ordner der Markdown-Datei. Darüber hinaus führt kein `../` hinaus. Unterstützte Formate: PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

## Bild-Größen

Ein Größen-Suffix nach der URL legt Breite und/oder Höhe in Pixeln fest:

```markdown
![Alt](bild.png =300x200)   Breite 300, Höhe 200
![Alt](bild.png =300x)      nur Breite, Höhe proportional
![Alt](bild.png =x200)      nur Höhe, Breite proportional
```

Ungültige Suffixe bleiben Roh-Text und werden nicht interpretiert.

## Implicit Figures

Ein Bild, das **allein in einem Absatz** steht, wird zur Abbildung (`figure`) mit dem Alt-Text als zentrierter Bildunterschrift. Bilder im Fließtext bleiben unverändert.

```markdown
Absatz davor.

![Quartalszahlen im Vergleich](chart.png)

Absatz danach.
```

Ergebnis: das Bild erscheint mit der Unterschrift „Quartalszahlen im Vergleich" zentriert darunter.

## Bilder einbetten per Wiki-Embed

Alternativ bettet `![[bild.png]]` ein Bild über die Wiki-Syntax ein, inklusive Größen-Modifikator `![[bild.png|300]]` — Details auf der Seite [Vernetzung](linking.md).

## Bild vergrößern

Ein Klick auf ein Bild in der Ansicht „Gerendert" — ebenso in deren Hälfte der Ansicht „Geteilt" — zeigt es vergrößert über dem ganzen Fenster. Der Hintergrund wird abgedunkelt, und das Bild erscheint so groß, wie Fenster und eigene Auflösung es zulassen: vollständig, unverzerrt und nie über seine eigene Größe hinaus. Ein kleines Bild steht deshalb in seiner eigenen Größe in der Mitte. Eine Größen-Angabe im Dokument (`=300x`) begrenzt die Vergrößerung nicht. Das gilt für jedes angezeigte Bild, auch in Tabellen, Callouts und Einbettungen, und auch für ein Bild, das selbst ein Verweis ist.

Unter dem Bild steht seine Beschriftung — der Alt-Text oder, wo er fehlt, der Dateiname — und darunter zwei Schaltflächen:

- **Im Standardprogramm öffnen** öffnet die Bild-Datei im zuständigen Programm des Betriebssystems, mit denselben Grenzen wie jede [Anlage](attachments.md). Die Vergrößerung bleibt dabei offen. Ein Bild, das als Daten im Text steht und keine eigene Datei hat, zeigt diese Schaltfläche nicht.
- **Schließen** schließt die Vergrößerung.

Geschlossen wird auf drei Wegen mit derselben Wirkung: mit der Schaltfläche „Schließen", mit der Taste `Escape` oder mit einem Klick auf die abgedunkelte Fläche neben dem Bild. Mit der Tastatur wechselt `Tab` zwischen den beiden Schaltflächen, ohne die Vergrößerung zu verlassen.

Ein Bild, das die Ansicht nicht anzeigt — etwa weil seine Datei fehlt —, öffnet keine Vergrößerung. In der Ansicht „Live" öffnet ein Klick keine Vergrößerung; dort öffnet der Doppelklick das Bild im Standardprogramm.
