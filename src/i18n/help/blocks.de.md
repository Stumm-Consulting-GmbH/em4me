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
