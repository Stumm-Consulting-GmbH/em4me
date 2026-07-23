# Vernetzung

Wiki-Links, Anker, Embeds und Tags verbinden Markdown-Dateien zu einem Netz. Die Beispiele dieser Seite zeigen die Syntax; ihre Ziele existieren im Handbuch nicht, in eigenen Dateien öffnen die Links die Ziel-Datei als Tab.

## Wiki-Links

`[[Ziel]]` verlinkt eine Datei über ihren Namen, ohne Pfad und ohne Endung; gesucht wird im Ordner der Datei und bis zu zwei Unterordner-Ebenen tief. Die `.md`-Endung darf entfallen oder mitgeschrieben werden.

```markdown
[[Projektplan]] öffnet projektplan.md aus dem Suchraum.
[[Projektplan|den Plan]] zeigt eigenen Anzeigetext.
```

Trifft der Name keine Datei direkt, greifen zwei Fallbacks: der Index-Treffer über den Suchraum und die [Alias-Auflösung](frontmatter.md) über das Frontmatter-Feld `aliases:`; bei mehreren Kandidaten fragt ein Auswahl-Dialog nach. In Pipe-Tabellen-Zellen das Pipe des Anzeigetexts als `\|` escapen.

## Heading- und Block-Anker

Links können auf eine Überschrift oder einen Block innerhalb der Ziel-Datei zeigen:

```markdown
[[Projektplan#Meilensteine]]     springt zur Überschrift
[[Projektplan#^entscheidung-1]]  springt zum Block-Anker
[[#Wiki-Links]]                  Anker im selben Dokument
```

Block-Anker werden mit `^id` am Zeilenende gesetzt und ankern den umschließenden Block (Absatz, Listen-Eintrag, Tabelle, Code-Block):

```markdown
Diese Entscheidung ist verbindlich. ^entscheidung-1
```

Defekte Anker-Ziele markiert der [Markdown-Linter](tools.md) im Editor.

## Markdown-Links auf Dateien

Auch klassische Markdown-Links öffnen `.md`-Ziele als Tab; Anker funktionieren ebenso. Dokument-interne Anker-Links springen innerhalb der Seite — hier live: [zum Tags-Kapitel](#tags).

```markdown
[Plan](unterordner/projektplan.md#meilensteine)
```

## Dateinamen mit Leerzeichen

Enthält ein Datei-Name Leerzeichen, hängt die Schreibweise vom Link-Typ ab. Wiki-Links tragen das Leerzeichen direkt:

```markdown
[[Meine Notiz]]
```

Markdown- und Bild-Links setzen das Ziel in spitze Klammern oder kodieren das Leerzeichen als `%20`:

```markdown
[Text](<Meine Notiz.md>)
![Alt](<Bild 01.png>)
[Text](Meine%20Notiz.md)
```

Ein rohes Leerzeichen ohne spitze Klammern beendet das Ziel, sodass der Link nicht erkannt wird (CommonMark). Beim Umbenennen einer Datei schreibt das Link-Update Ziele mit Leerzeichen in der `<…>`-Form; bereits `%`-kodierte Ziele behalten ihre Form.

## Wiki-Embeds

`![[Ziel]]` bettet Inhalte ein statt zu verlinken:

```markdown
![[bild.png]]            Bild, optional mit Breite: ![[bild.png|300]]
![[notizen.md]]          Markdown-Datei als gerenderter Block
![[handbuch.pdf]]        PDF im interaktiven Viewer
![[notizen.md#Kapitel]]  nur der Abschnitt unter der Überschrift
![[notizen.md#^block]]   nur der verankerte Block
```

Bei Block-Ankern wird der vollständige umschließende Block eingebettet (Listen-Eintrag mit Unterlisten, Fenced Code, Tabellen-Zeile, Blockquote). Eingebettetes Markdown rendert mit eigener Quelle als Basis; Links darin lösen gegen die eingebettete Datei auf.

## Tags

`#tag` im Fließtext und das `tags:`-Feld im [Frontmatter](frontmatter.md) werden als Tags erkannt; Schrägstriche bilden Hierarchien wie `#projekt/markdown`. Tags sind in der Lese-Ansicht und im Live-Modus klickbar und filtern die Tag-Sidebar. Hex-Farbcodes, reine Zahlen und Anker-Links sind von der Erkennung ausgenommen.

```markdown
Status: #projekt/markdown #review
```

## Autocomplete

Beim Tippen im Edit-Modus öffnet sich ein Vorschlags-Dropdown:

- `[[` schlägt Datei-Namen und Aliases vor,
- `[[Datei#` Heading-Anker, `[[Datei#^` Block-IDs,
- `#` im Fließtext bekannte Tags.

Pfeil-Tasten navigieren, Enter oder Tab wählt aus, Esc schließt.

## Sidebars zum Netz

Drei Sidebar-Sektionen zeigen das Netz der aktiven Datei: **Backlinks** (eingehende Links, inklusive „via Alias"), **Outgoing-Links** (alle ausgehenden Verweise in Dokument-Reihenfolge) und **Tags** (alle Tags des Suchraums mit Häufigkeit). Zugänge stehen in der [Funktions-Tabelle](functions.md).

## Adresse in eine Auswahl einfügen

Ist Text markiert und die Zwischenablage enthält eine einzelne Adresse, entsteht beim Einfügen ein Link aus beidem, statt dass die Auswahl ersetzt wird. Aus der Auswahl `Projektseite` und der Adresse `https://example.org` wird:

```markdown
[Projektseite](https://example.org)
```

Enthält die Adresse Leerzeichen oder Klammern, wird das Ziel in die spitze Form gesetzt; eine `www.`-Adresse erhält das `https://`-Präfix:

```markdown
[Eintrag](<https://example.org/Titel_(Zusatz)>)
```

Ohne Auswahl, bei einem Zwischenablage-Inhalt, der nicht als einzelne Adresse erkennbar ist, sowie innerhalb von Quelltext-Bereichen bleibt es beim normalen Einfügen. Ein Rückgängig-Schritt nimmt die Umwandlung vollständig zurück. Zugang und Schalter stehen in der [Funktions-Tabelle](functions.md).
