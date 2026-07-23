# Markdown-Basis

Die App rendert Markdown auf Grundlage des CommonMark-Standards, erweitert um Tabellen, Task-Listen, Durchstreichen und Auto-Links. Diese Seite zeigt den Kern; die Spezial-Konstrukte haben eigene Seiten ([Block-Konstrukte](blocks.md), [Inline-Konstrukte](inline.md), [Vernetzung](linking.md)).

## Überschriften

Sechs Ebenen mit `#` bis `######`; jede Überschrift erhält automatisch einen Anker für Links und Inhaltsverzeichnis.

```markdown
## Kapitel
### Unterkapitel
```

Alternativ gibt es die Setext-Form für die Ebenen 1 und 2: eine Textzeile mit einer Unterstreichung aus `===` (H1) oder `---` (H2).

```markdown
Kapitel in Setext-Form
----------------------
```

### Automatische Nummerierung

Überschriften lassen sich automatisch mit hierarchischen Nummern versehen (1, dann 1.1, 1.2 und so weiter). Die Nummern erscheinen im Render-Pane, im Live-Modus, in der Gliederung und in den Exporten; der Quelltext bleibt unverändert.

Gesteuert wird auf drei Ebenen, die einander in dieser Reihenfolge übersteuern: die einzelne Überschrift vor dem Dokument, das Dokument vor der globalen Einstellung. Global schaltet die Einstellung „Überschriften nummerieren" die Nummern ein und legt die Start-Ebene fest (H1 oder H2). Pro Dokument übersteuert der Frontmatter-Schlüssel `numbered-headings` die globale Einstellung:

```markdown
---
numbered-headings: true
---
```

Pro Überschrift wirkt ein Marker am Zeilenende: `{-}` nimmt eine Überschrift aus, `{+}` bezieht sie ein, jeweils auch gegen die globale Einstellung. Ein vorangestellter Backslash schützt den Marker als Literal-Text (`\{-}` erscheint als `{-}`).

```markdown
## Anhang {-}
## Wichtig {+}
```

Ausgenommene Überschriften zählen nicht mit und setzen keine Unterzähler zurück; ihre Unter-Überschriften zählen unter der letzten nummerierten Überschrift weiter. Wird eine Ebene übersprungen, etwa von H1 direkt auf H3, zählt die fehlende Zwischenebene als eins.

## Betonung

```markdown
**fett**, *kursiv*, ~~durchgestrichen~~, `Inline-Code`
```

**fett**, *kursiv*, ~~durchgestrichen~~, `Inline-Code`

## Listen

Ungeordnete Listen mit `-`, `*` oder `+`, geordnete mit `1.`. Ein Unterpunkt gehört zum Punkt darüber, wenn er dort beginnt, wo dessen Inhalt beginnt: unter `- ` zwei Zeichen, unter `1. ` drei, unter `10. ` vier.

```markdown
- Erster Punkt
  - Unterpunkt
1. Erster Schritt
   1. Teilschritt
```

- Erster Punkt
  - Unterpunkt

1. Erster Schritt
   1. Teilschritt

### Struktur bearbeiten

Im Bearbeitungs-Modus lässt sich die Gliederung mit der Tastatur ändern. Die Tiefe ergibt sich dabei immer aus dem Punkt darüber, du musst sie nicht selbst abzählen.

- `Alt+Pfeil auf` und `Alt+Pfeil ab` verschieben einen Punkt samt aller Unterpunkte. Der Sprung geht über den ganzen Nachbar-Ast, die Ebene bleibt gleich. Außerhalb von Listen bewegen die Kürzel die einzelne Zeile.
- `Tab` und `Umschalt+Tab` rücken den Punkt samt Unterpunkten ein und aus. Eingerückt wird nur dort, wo ein Punkt darüber steht, unter den der eigene rutschen kann.
- Sind mehrere Zeilen markiert, wirken beide Tasten auf genau den markierten Bereich.
- Das Kommando „Teilbaum auswählen" markiert einen Punkt mit allem, was darunter hängt.

### Nummerierung

Nummerierte Listen zählen im Quelltext von selbst durch, sobald du in ihnen arbeitest. Die Startnummer bleibt erhalten: Eine bei `3.` beginnende Liste zählt mit `4.` weiter.

Eine Leerzeile beginnt eine neue Liste. Entsteht sie durch deine Bearbeitung, zählt die Liste dahinter wieder ab 1; war sie schon vorher da, behält die zweite Liste ihre eigene Startnummer. Quelltext und Anzeige zeigen dieselben Nummern.

```markdown
1. Erste Liste
2. Zweite Zeile

1. Neue Liste
2. Zweite Zeile
```

1. Erste Liste
2. Zweite Zeile

1. Neue Liste
2. Zweite Zeile

### Fortsetzen und beenden

Die Eingabetaste setzt eine Liste fort und ergänzt Aufzählungszeichen, fortlaufende Nummer oder leeres Kontrollkästchen. Auf einem leeren Unterpunkt rückt sie eine Ebene aus, auf der obersten Ebene beendet sie die Liste.

## Tabellen

Pipe-Tabellen mit Kopfzeile und Trennerzeile; Doppelpunkte in der Trennerzeile steuern die Ausrichtung. Für mehrzeilige Block-Zellen gibt es [Perspective Table](perspective-table.md), für Komfort beim Tippen den Tabellen-Editor (siehe [Werkzeuge](tools.md)). Zum Umbauen bestehender Tabellen (Zeilen und Spalten verschieben, einfügen und löschen, Ausrichtung, Transponieren) dient das Untermenü **Tabelle** im [Editor-Kontextmenü](context-menu.md).

```markdown
| Links | Zentriert | Rechts |
|:------|:---------:|-------:|
| a     | b         | 12     |
```

| Links | Zentriert | Rechts |
|:------|:---------:|-------:|
| a     | b         | 12     |

## Blockquote und Trennlinie

```markdown
> Zitat über
> mehrere Zeilen

---
```

> Zitat über
> mehrere Zeilen

---

## Links und Auto-Links

Markdown-Links mit `[Text](ziel)`; URLs in spitzen Klammern werden zu Auto-Links. Auch nackte URLs im Fließtext werden erkannt, der [Markdown-Linter](tools.md) empfiehlt dort aber die explizite Link-Form.

```markdown
[Beispiel](https://example.org) und <https://example.org>
```

[Beispiel](https://example.org) und <https://example.org>

Die Referenz-Form trennt Link-Stelle und Ziel-Definition:

```markdown
Siehe [Beispielseite][ref].

[ref]: https://example.org
```

Siehe [Beispielseite][ref].

[ref]: https://example.org

## Harte Zeilenumbrüche

Zwei Leerzeichen am Zeilenende oder ein Backslash erzwingen einen Zeilenumbruch innerhalb eines Absatzes.

```markdown
Erste Zeile\
Zweite Zeile
```

Erste Zeile\
Zweite Zeile

## Code

Inline mit Backticks, Blöcke als Fenced Code mit drei Backticks; ein Sprach-Tag aktiviert Syntax-Highlighting (siehe [Mathematik und Diagramme](math-diagrams.md)). Daneben gilt die CommonMark-Form „Indented Code": Zeilen mit vier Leerzeichen Einrückung werden zum Code-Block.

## Typografie

Der Typographer ersetzt Zeichenfolgen durch typografische Zeichen: `--` wird zum Gedankenstrich (–), `...` zu Auslassungspunkten (…), gerade Anführungszeichen werden zu typografischen.

```markdown
Ein Gedanke -- und noch einer ...
```

Ein Gedanke -- und noch einer ...
