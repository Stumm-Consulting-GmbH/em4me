# Inline-Berechnungen

Einfache Arithmetik: {= 2+3*4 =} und mit Klammern {= (2+3) * (4 - 1) =}.

Zwei pro Zeile: {= 1+1 =} und {= 10/4 =}.

Vergleich im Ausdruck: {= 1 = 1 =} sowie {= 2 >= 3 =} und logisch {= 1 = 1 AND 2 = 2 =}.

Text: {= "Mark" + "down" =} und {= upper('abc') =} und {= length('Wort') =}.

Datum und Dauer: {= date(2026-01-01) + dur(30d) =} und {= date(2026-01-31) - date(2026-01-01) =} und {= dur(1d) + dur(2h) =}.

Relativ: {= date(today) =}.

Funktionen: {= sum(5) =}, {= number('42') =}, {= choice(1 = 2, 'ja', 'nein') =}, {= dateformat(date(2026-01-01), 'dd.MM.yyyy') =}, {= default(1/0, 99) =}.

Fehler: Syntax {= 2+ =}, Funktion {= foo(1) =}, Wert {= 1/0 =}, Feld {= file.size =}.

Escape bleibt Literal: \{= 2+2 =}.

Direkt nach Element: *kursiv*{= 2+2 =}.

| Spalte | Wert |
|---|---|
| Rechnung | {= 6*7 =} |

> [!note]
> Im Callout: {= 3*3 =}

- In der Liste: {= 6/2 =}

Critic bleibt Critic: {== markiert ==} und {>>Anmerkung<<} und {~~alt~>neu~~}.

Leer bleibt Literal: {= =} mittig im Satz, unvollständig auch: {= 2+3 offen.
