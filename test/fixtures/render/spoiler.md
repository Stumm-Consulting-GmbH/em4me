Achtung ||geheimer Text|| im Satz.

Mit Markup: ||hier **fett** und *kursiv* verborgen||.

Escape bleibt Text: \||kein Spoiler\|| im Satz.

Spoiler-Versuch in einer Pipe-Tabellen-Zelle (unescapte Pipes trennen
Zellen, GFM verwirft die überzähligen):

| Spalte A | Spalte B | C | D |
|---|---|---|---|
| a ||sp|| b | x | y | z |

Mit escapten Pipes bleibt die Zeile vierzellig und der Spoiler
funktioniert in der Zelle:

| Spalte A | Spalte B | C | D |
|---|---|---|---|
| a \|\|sp\|\| b | x | y | z |

Einzelne Pipe | bleibt Text; [[Ziel|Label]] bleibt Wiki-Link.
