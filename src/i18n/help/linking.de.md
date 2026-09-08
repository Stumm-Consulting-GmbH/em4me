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

In den Ansichten sieht der Anker verschieden aus. Die gerenderte Ansicht zeigt ihn gar nicht — der Block ist dort nur ein Sprungziel. Der **Live-Modus** ersetzt ihn durch ein dezentes Zeichen am Zeilenende: Zeigen darauf nennt die Kennung, ein Klick setzt die Schreibmarke ans Zeilenende und klappt den Roh-Text zum Bearbeiten auf. Steht die Schreibmarke ohnehin in der Zeile, ist der Anker unverändert sichtbar. Dass der Live-Modus mehr zeigt als die gerenderte Ansicht, ist Absicht: Ein Anker ist eine Adresse, auf die von außen gezeigt wird, und beim Umbauen eines Dokuments soll sichtbar bleiben, dass es sie gibt. Trägt derselbe Block [Eigenschaften](block-properties.md), steht deren Zeichen daneben.

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

**Wo das Ziel gesucht wird.** Die Anwendung sucht in drei Schritten, und zwar für jede Datei-Art gleich: zuerst am Pfad relativ zur eigenen Datei, dann in der Schreibweise der Unterseiten, zuletzt über den bloßen **Namen** im ganzen Bereich. `![[bild.png]]` findet die Datei also auch dann, wenn sie in einem anderen Ordner liegt — der Pfad muss nicht getroffen werden. Der Suchraum endet an der Bereichs-Wurzel: Was außerhalb liegt, wird nicht eingebettet. Ohne gebundenen Bereich bleibt es beim Ordner der eigenen Datei.

Trägt eine Markdown-Datei denselben Namen wie eine Anlage, gewinnt die Markdown-Datei; mit Endung geschrieben (`![[bild.png]]`) ist die Sache eindeutig. Gewöhnliche Markdown-Bilder `![](pfad.png)` bleiben davon unberührt — ihre Schreibweise meint einen Pfad und keinen Namen.
## Bereichs-Verknüpfungen

Zwei Bereiche lassen sich verknüpfen, damit ein Verweis über die Bereichs-Grenze führt. Eingerichtet wird das unter **Einstellungen → Aktueller Bereich → Bereichs-Verknüpfungen**: Dort stehen der Ordner des anderen Bereichs und ein **Kürzel**, unter dem dieser Bereich künftig angesprochen wird.

Das Kürzel gilt **nur in diesem Bereich und nur in dieser Richtung**. Wie der andere Bereich umgekehrt auf diesen verweist, wird dort eingetragen und darf anders lauten. Erlaubt sind Buchstaben, Ziffern, Bindestrich und Unterstrich; Groß- und Kleinschreibung spielt keine Rolle.

Im Text steht das Kürzel vor dem Ziel:

```markdown
[[@zt:Notiz]]            Datei «Notiz» im verknüpften Bereich «zt»
[[@zt:Ordner/Notiz]]     Ziel über seinen Pfad im verknüpften Bereich
[[@zt:Notiz#Kapitel]]    mit Anker, wie bei jedem Wiki-Link
[[@zt:Notiz|Anzeige]]    mit abweichendem Anzeige-Text
```

Gesucht wird zuerst am angegebenen Pfad und, falls dort nichts liegt, über den Namen im ganzen verknüpften Bereich — wie ein gewöhnlicher Wiki-Link im eigenen Bereich. Der Klick öffnet das Ziel im selben Fenster.

**Vorlagen des verknüpften Bereichs** lassen sich zusätzlich zu den eigenen anbieten; dafür gibt es je Verknüpfung einen Schalter. In der Vorlagen-Auswahl erscheinen dann beide Bestände, und jeder fremde Eintrag nennt seine Herkunft. Ohne den Schalter ändert eine Verknüpfung den Vorlagen-Bestand nicht.

### Wenn ein verknüpfter Bereich nicht auffindbar ist

Beim Öffnen prüft ein Bereich seine Verknüpfungen, und ein Befund verhindert das Öffnen nie:

- **Der Ordner ist verschoben** — der übergeordnete Ablage-Ort ist erreichbar, der Ordner selbst nicht. Ein Hinweis bittet um den neuen Pfad. Solange er fehlt, gelten Verweise über dieses Kürzel als ungültig und werden im Editor markiert.
- **Der Ablage-Ort ist nicht erreichbar**, etwa weil ein Laufwerk getrennt ist. Dann erscheint nur ein Hinweis: Die Verknüpfung bleibt bestehen, und **nichts** wird als ungültig markiert. Ein getrenntes Laufwerk zerstört keine Verknüpfung.

Den neuen Pfad tragen Sie an derselben Stelle ein, an der die Verknüpfung steht.

### Was nicht über die Grenze trägt

Ein Verknüpfungs-Link führt **hin**, nicht zurück. Bewusst nicht über die Bereichs-Grenze tragen:

- die **Backlinks** — sie zeigen nur Verweise aus dem eigenen Bereich,
- die Kennzahl **«Dateien ohne eingehenden Verweis»** der Bereichs-Statistik,
- die **Graphenansicht**,
- die **bereichsweite Suche**,
- und die **Nachführung beim Umbenennen**: Wird eine Datei umbenannt, bleiben Verweise aus einem verknüpften Bereich unverändert. Der Editor markiert sie danach als ungültig — das ist das Netz, das sie sichtbar macht.

Die Bereichs-Verknüpfungen sind eine [Erweiterung](extensions.md) und lassen sich abschalten. Dann bleibt ein Kürzel-Verweis unaufgelöst, die Prüfung beim Öffnen unterbleibt, und die eingetragenen Verknüpfungen bleiben erhalten — abgeschaltet wird die Wirkung, nicht die Angabe.

## Tags

`#tag` im Fließtext und das `tags:`-Feld im [Frontmatter](frontmatter.md) werden als Tags erkannt; Schrägstriche bilden Hierarchien wie `#projekt/markdown`. Tags sind in der Lese-Ansicht und im Live-Modus klickbar und filtern die Tag-Sidebar. Hex-Farbcodes, reine Zahlen, Anker-Links und Rauten innerhalb einer Web-Adresse sind von der Erkennung ausgenommen: In `https://example.org/#kapitel` ist `#kapitel` der Adress-Teil und kein Tag.

```markdown
Status: #projekt/markdown #review
```

### Ein Tag umbenennen

Ein Rechtsklick auf einen Eintrag der Tag-Sidebar benennt den Tag über alle seine Vorkommen im Bereich um — im Fließtext wie im `tags:`-Feld, in allen Dateien, auch in denen, die gerade nicht geöffnet sind.

**Untergeordnete Tags wandern mit.** Wird `#projekt` zu `#arbeit`, dann wird `#projekt/markdown` zu `#arbeit/markdown`. Das ist Absicht und nicht Nebenwirkung: Abfragen werten einen Tag als Vorsilbe seiner Kinder aus, und eine Umbenennung ohne sie zerlegte genau diese Abfragen. Ein Tag, der nur mit demselben Wort beginnt, bleibt unberührt — `#projektil` ist kein Kind von `#projekt`, dafür fehlt der Schrägstrich.

**Vor dem Schreiben steht die Vorschau.** Sie listet jede Fundstelle mit ihrer Zeile, weist die mitwandernden Kinder aus und lässt einzelne Stellen abwählen. Erst die Zusage im Balken über der Liste schreibt; ein Abbruch lässt den Bestand, wie er war.

Geschrieben wird innerhalb der Bereichs-Grenze, und von jeder geänderten Datei liegt der Stand davor in der [Versionshistorie](history.md) — unabhängig davon, ob die Historisierung eingeschaltet ist. Eine Datei mit ungespeicherten Änderungen bekommt die Umbenennung auf ihren Reiter statt auf die Platte; ein Bericht am Ende nennt jede Datei und, wo etwas nicht ging, den Grund.

## Autocomplete

Beim Tippen im Edit-Modus öffnet sich ein Vorschlags-Dropdown:

- `[[` schlägt Datei-Namen und Aliases vor,
- `[[Datei#` Heading-Anker, `[[Datei#^` Block-IDs,
- `#` im Fließtext bekannte Tags.

Pfeil-Tasten navigieren, Enter oder Tab wählt aus, Esc schließt.

Solange nach `[[` nichts getippt ist, stehen die zuletzt geänderten Dateien des Bereichs oben, die jüngste zuerst. Sobald gefiltert wird, führt wieder die Treffer-Güte; die Änderungszeit entscheidet dann nur noch zwischen gleichrangigen Vorschlägen.

Nach `#` stehen die im Bereich häufiger vergebenen Schlagworte oben, das häufigste zuerst; auch hier führt die Treffer-Güte, sobald etwas getippt ist, und die Häufigkeit entscheidet dann zwischen Gleichrangigen. Die Zahl hinter jedem Vorschlag nennt sie.

Die Übernahme eines Datei- oder Zweitnamen-Vorschlags schreibt die schließenden Klammern mit und setzt die Schreibmarke dahinter. Stehen sie schon da, entsteht kein zweites Paar.

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
