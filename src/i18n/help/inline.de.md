# Inline-Konstrukte

Auszeichnungen innerhalb einer Zeile, über fett/kursiv hinaus. Syntax jeweils als Code-Block, darunter das Ergebnis.

## Highlight

```markdown
Das ==Wichtige== hervorheben; \== bleibt Klartext.
```

Das ==Wichtige== hervorheben; \== bleibt Klartext.

## Tief- und Hochstellen

Tiefstellen mit `~…~`, Hochstellen mit `^^…^^` (Doppel-Caret, weil das einzelne `^` durch Fußnoten und Block-Anker belegt ist).

```markdown
H~2~O und x^^2^^
```

H~2~O und x^^2^^

## Unterstreichen

```markdown
++unterstrichener Text++
```

++unterstrichener Text++

## Spoiler

Verdeckter Text, Aufdecken per Maus-Hover oder Tastatur-Fokus. In Pipe-Tabellen-Zellen die Pipes als `\|` escapen, sonst zerschneidet die Zellen-Trennung den Spoiler.

```markdown
Die Lösung: ||42||
```

Die Lösung: ||42||

## Critic Markup

Änderungs-Auszeichnung mit fünf Formen: Einfügung, Löschung, Ersetzung, Markierung, Kommentar.

```markdown
{++eingefügt++} {--gelöscht--} {~~alt~>neu~~} {==markiert==} {>>Kommentar<<}
```

{++eingefügt++} {--gelöscht--} {~~alt~>neu~~} {==markiert==} {>>Kommentar<<}

## Kommentare

Text zwischen `%%`-Markern ist ein privater Kommentar: Er bleibt im Quelltext erhalten, erscheint aber in keiner gerenderten Ansicht und keinem Export. Kommentare funktionieren innerhalb einer Zeile und über mehrere Zeilen; ein öffnendes `%%` ohne Schließung wirkt bis zum Dokument-Ende. In Code-Blöcken und Code-Spans bleibt `%%` gewöhnlicher Text; `\%%` ergibt ein wörtliches `%%` im Fließtext (jeder Marker wird einzeln escaped). Im Editor sind Kommentar-Bereiche dezent eingefärbt (Quelltext- und Live-Ansicht). Der sichtbare Critic-Markup-Kommentar `{>>…<<}` aus dem Abschnitt darüber ist davon unabhängig: Er dient der Abstimmung und wird gerendert, der `%%`-Kommentar bleibt privat.

```markdown
Sichtbarer Text %%privater Kommentar%% und weiter im Satz.

%%
Mehrzeiliger Kommentar: alles bis zum
schließenden Marker bleibt privat.
%%
```

Diese Zeile demonstriert das Verhalten live, zwischen „hier" und „weiter" steht ein Kommentar: hier %%für Leser unsichtbar%% weiter.

## Bracketed Spans und Heading-Attribute

Inline-Spans mit Attributen: `[Text]{.klasse #id}`; erlaubt sind nur `id` und `class`. Überschriften erhalten mit `{#meine-id}` eine eigene Anker-ID, die gegen den automatischen Anker gewinnt (nützlich für stabile Links bei wechselnden Titeln, siehe [Vernetzung](linking.md)).

```markdown
Ein [markierter Abschnitt]{#span-demo} im Fließtext.

### Überschrift mit fester ID {#feste-id}
```

Ein [markierter Abschnitt]{#span-demo} im Fließtext.

### Überschrift mit fester ID {#feste-id}

## Abkürzungen

Definitionszeile `*[Kürzel]: Langtext`; jedes Vorkommen des Kürzels erhält eine gepunktete Unterstreichung mit dem Langtext als Tooltip (Maus über das Kürzel halten).

```markdown
*[HTML]: Hyper Text Markup Language

Die App erzeugt beim Rendern HTML.
```

*[HTML]: Hyper Text Markup Language

Die App erzeugt beim Rendern HTML.

## Inline-Berechnungen

Rechenausdrücke zwischen `{=` und `=}` an beliebiger Stelle im Fließtext: Die gerenderte Ansicht, der Live-Modus und die Exporte zeigen das **Ergebnis**, der Quelltext behält den Ausdruck; der Roh-Ausdruck erscheint als Tooltip (Maus über das Ergebnis halten). Im Live-Modus zeigt die Cursor-Zeile den Roh-Ausdruck zum Bearbeiten, ein Klick auf das Ergebnis setzt den Cursor hinein. Gerechnet wird mit der Ausdrucks-Sprache der [Perspective-Abfrage](frontmatter-query.md): Zahlen, Klammern, Zeichenketten, Datums- und Dauer-Werte sowie der Funktions-Katalog. Feld-Zugriffe (z.B. `file.name`) stehen in Inline-Berechnungen nicht zur Verfügung.

```markdown
Summe {= 2+3*4 =}, Datum {= date(2026-01-01) + dur(30d) =}, Text {= upper('abc') =}
```

Summe {= 2+3*4 =}, Datum {= date(2026-01-01) + dur(30d) =}, Text {= upper('abc') =}

Regeln und Besonderheiten:

- **Operatoren**: `+`, `-`, `*`, `/` mit Punkt-vor-Strich und Klammern; Vergleiche `=`, `!=`, `<`, `<=`, `>`, `>=` sowie `AND`, `OR`, `NOT` ergeben `true`/`false`. Zwischen Zahlen braucht das Minus ein Leerzeichen (`4 - 1`, nicht `4-1` — Letzteres liest die Ausdrucks-Sprache als Feldnamen).
- **Datum und Dauer**: `date(...)` und `dur(...)` wie in der Abfrage-Sprache; Datum ± Dauer ergibt ein Datum, Datum − Datum eine Dauer.
- **Funktionen**: der Funktions-Katalog der Abfrage-Sprache (`number`, `string`, `lower`, `upper`, `length`, `startswith`, `endswith`, `contains`, `default`, `choice`, `dateformat`, `days`, `numberformat`, `currencyformat`, `sum`, `min`, `max`, `average`). Funktionen, die einen Datei-Bezug brauchen, wirken hier nicht: Es gibt kein Dokument, auf das sie sich beziehen könnten.
- **Fehler**: Ein nicht auswertbarer Ausdruck zeigt ein dezentes ⚠︎ mit dem Fehlerhinweis im Tooltip; der Quelltext bleibt unverändert.
- **Escape**: `\{=` ergibt ein wörtliches `{=` im Fließtext.

```markdown
Vergleich {= 10/4 >= 2 =}, Bedingung {= choice(1 = 2, 'ja', 'nein') =}, Fehler {= 2+ =}
```

Vergleich {= 10/4 >= 2 =}, Bedingung {= choice(1 = 2, 'ja', 'nein') =}, Fehler {= 2+ =}
