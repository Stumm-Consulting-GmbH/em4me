# Block-Konstrukte

Block-Erweiterungen über den Markdown-Kern hinaus. Jedes Kapitel zeigt die Syntax als Code-Block und direkt darunter das gerenderte Ergebnis; in der geteilten Ansicht stehen beide nebeneinander.

## Callouts

Hinweis-Boxen: `> [!typ]` als erste Zeile eines Blockquote-Blocks, optional mit eigenem Titel. Zehn Typen mit eigenem Icon und Akzentfarbe: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `example`, `quote`. Unbekannte Typen meldet der [Markdown-Linter](tools.md).

```markdown
> [!tip] Eigener Titel
> Inhalt der Box, normales Markdown erlaubt.
```

> [!tip] Eigener Titel
> Inhalt der Box, normales Markdown erlaubt.

Ein `+` oder `-` hinter dem Typ macht den Callout klappbar: `+` startet geöffnet, `-` eingeklappt — das Auf- und Zuklappen funktioniert auch im Handbuch.

```markdown
> [!note]- Eingeklappt gestartet
> Erst nach Klick auf den Titel sichtbar.
```

> [!note]- Eingeklappt gestartet
> Erst nach Klick auf den Titel sichtbar.

Die Schreibweise des Typs spielt keine Rolle: `[!note]`, `[!Note]` und `[!NOTE]` erzeugen dieselbe Box mit demselben Icon, derselben Akzentfarbe und demselben Standard-Titel; `+`, `-` und ein eigener Titel wirken genauso. Der Text in der Datei bleibt dabei, wie er geschrieben ist — auch eine aus anderen Markdown-Programmen übernommene Großschreibung wird nicht umgeschrieben. Die Liste der zehn Typen bleibt dieselbe: Namen außerhalb davon, etwa `[!IMPORTANT]`, sind in jeder Schreibweise unbekannte Typen.

```markdown
> [!WARNING]
> Groß geschrieben — dieselbe Box wie mit `[!warning]`.
```

> [!WARNING]
> Groß geschrieben — dieselbe Box wie mit `[!warning]`.

## Custom Containers

Container-Blöcke zwischen `::: typ` und `:::`. Die zehn Callout-Typen erscheinen in Callout-Optik, unbekannte Namen als neutrale Box mit dem Namen als Titel.

```markdown
::: warning
Inhalt in Callout-Optik.
:::
```

::: warning
Inhalt in Callout-Optik.
:::

Die Schreibweise des Namens spielt keine Rolle: `::: warning`, `::: Warning` und `::: WARNING` erzeugen dieselbe Box, `::: Meine-Box` dieselbe neutrale Box wie `::: meine-box`, und `::: COLUMNS 2` setzt den Inhalt ebenso zweispaltig wie `::: columns 2`. Der Text in der Datei bleibt dabei, wie er geschrieben ist; eine neutrale Box zeigt den Namen so als Titel, wie er dasteht. Die Liste der zehn Callout-Typen bleibt dieselbe.

```markdown
::: WARNING
Groß geschrieben — dieselbe Box wie mit `::: warning`.
:::
```

::: WARNING
Groß geschrieben — dieselbe Box wie mit `::: warning`.
:::

## Mehrspalten-Block

Ein Container `::: columns <n>` setzt den eingeschlossenen Inhalt mehrspaltig; gültig sind 2 bis 5 Spalten. Der Text fließt automatisch und ausgeglichen über die Spalten; eine Zeile `+++` erzwingt den Wechsel in die nächste Spalte. Ungültige Spaltenzahlen (fehlend, 1, mehr als 5, nicht numerisch) fallen auf die neutrale Container-Box zurück; außerhalb eines Mehrspalten-Blocks ist `+++` wirkungslos.

```markdown
::: columns 2
Erste Spalte mit fließendem Text.

+++

Ab hier die zweite Spalte.
:::
```

::: columns 2
Erste Spalte mit fließendem Text.

+++

Ab hier die zweite Spalte.
:::

Breite Inhalte (Tabellen, Diagramme, lange Code-Zeilen) können eine Spalte sprengen; bei sehr kurzen Blöcken kann der automatische Ausgleich ungleich wirken. Im Live-Modus erscheint der Block in neutraler Container-Optik mit sichtbaren Marker-Zeilen; der mehrspaltige Satz gilt für die gerenderte Ansicht und den PDF-Export.

## Definitionslisten

Begriff auf einer Zeile, Definition darunter mit `: ` eingeleitet; auch `~` ist als Marker erlaubt. Mehrere Definitionen pro Begriff sind möglich.

```markdown
Cutover
: Umstellung eines Systems auf den Produktivbetrieb.

Rollback
: Rückkehr zum Stand vor der Umstellung.
```

Cutover
: Umstellung eines Systems auf den Produktivbetrieb.

Rollback
: Rückkehr zum Stand vor der Umstellung.

## Line Blocks

Zeilen, die mit `| ` beginnen, behalten Zeilenumbrüche und führende Leerzeichen — gedacht für Adressen und Gedichte.

```markdown
| Stumm-Consulting GmbH
|   4410 Liestal
|   Schweiz
```

| Stumm-Consulting GmbH
|   4410 Liestal
|   Schweiz

## Fußnoten

Drei Formen: Verweis `[^id]` im Fließtext mit Definition `[^id]: Text` (üblicherweise am Datei-Ende) sowie die Inline-Form `^[Direkt-Text]` ohne separate Definition. Im Render erscheint eine hochgestellte Zahl; die Definitionen sammeln sich am Seitenende mit Rücksprung-Pfeilen.

```markdown
Eine Aussage mit Beleg[^1] und eine mit Inline-Fußnote^[Direkt notiert].

[^1]: Die Definition steht am Datei-Ende.
```

Eine Aussage mit Beleg[^1] und eine mit Inline-Fußnote^[Direkt notiert].

[^1]: Die Definition steht am Datei-Ende.

## Inhaltsverzeichnis-Block

Ein Code-Block mit der Kennung `toc` zeigt an seiner Stelle die Überschriften des Dokuments als eingerückte Liste; jeder Eintrag ist ein Verweis, ein Klick springt zur Überschrift. Eine Zeile `depth: N` im Block begrenzt das Verzeichnis auf die Ebenen 1 bis N, gültig sind die Werte 1 bis 6; ohne diese Zeile erscheinen alle Ebenen. Andere Zeilen und Werte außerhalb von 1 bis 6 bleiben wirkungslos.

````markdown
```toc
depth: 2
```
````

Gerendert, für diese Seite:

```toc
depth: 2
```

Das Verzeichnis folgt jeder Änderung von selbst: Neue, umbenannte und gelöschte Überschriften sind sofort nachgeführt, in der gerenderten Ansicht wie im Live-Modus. Die Einträge springen auf dieselben Anker wie Verweise auf die Überschriften, auch bei gleichlautenden Überschriften und bei eigenen IDs mit `{#id}`. Ist die [automatische Nummerierung](markdown-basics.md) der Überschriften aktiv, stehen die Nummern mit im Verzeichnis. Überschriften in Code-Blöcken und im Frontmatter erscheinen nicht. Hat das Dokument keine Überschrift, zeigt der Block den Hinweis «Dieses Dokument hat keine Überschriften.». Mehrere Blöcke im selben Dokument zeigen dasselbe Verzeichnis.

Eingefügt wird der Block über das [Editor-Kontextmenü](context-menu.md): **Einfügen → Inhaltsverzeichnis-Block** setzt einen Block `toc` ohne Zeile `depth:` auf eine eigene Zeile; die Tiefe kommt bei Bedarf von Hand dazu.

Druck, PDF-Export und HTML-Export enthalten das Verzeichnis so, wie die gerenderte Ansicht es zeigt. Der portable Export schreibt es als gewöhnliche Markdown-Liste mit Verweisen auf die Überschriften, ohne Nummern; ein Dokument ohne Überschriften bekommt an dieser Stelle eine Leerzeile. In einer [Präsentation](presentation.md) wird jede Folie für sich gezeigt; ein Block auf einer Folie listet die Überschriften dieser Folie.

Der Block gehört zur [internen Erweiterung](extensions.md) «Inhaltsverzeichnis-Block», die ab dem Arbeitsmodus **Einsteiger** eingeschaltet ist. Ist sie aus, steht der Block als gewöhnlicher Code-Block mit seinem Text da, und das Kontextmenü bietet **Inhaltsverzeichnis-Block** nicht an; das Dokument bleibt unverändert, und nach dem Einschalten erscheint das Verzeichnis wieder.

Das Panel «Inhaltsverzeichnis» der [Sidebar](sidebar.md) ist davon unabhängig: Es zeigt die Überschriften des geöffneten Dokuments neben dem Text und gehört nicht zum Dokument. Der Block steht dagegen im Dokument selbst und erscheint deshalb auch in Druck und Export.
