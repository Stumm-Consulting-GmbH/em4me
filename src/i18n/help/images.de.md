# Bilder

Bilder laden aus Pfaden relativ zur Markdown-Datei oder von `http(s)`-URLs. Das Handbuch bündelt keine Demo-Bilder; die Beispiele zeigen deshalb die Syntax als Code-Block mit beschriebenem Ergebnis — in eigenen Dateien rendern sie direkt.

## Bild-Syntax

Der Alt-Text in den eckigen Klammern beschreibt das Bild (wichtig für Barrierefreiheit; ein fehlender Alt-Text wird vom [Markdown-Linter](tools.md) markiert).

```markdown
![Diagramm der Architektur](bilder/architektur.png)
```

Relative Pfade lösen gegen den Ordner der Markdown-Datei auf; aus Sicherheitsgründen bleiben nur Bilder unterhalb dieses Ordners auflösbar (kein `../`-Ausbruch). Unterstützte Formate: PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

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
