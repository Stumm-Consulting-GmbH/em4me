# Prozent-Kommentare

## Inline-Kommentar mitten im Satz

Dieser Satz bleibt sichtbar %%dieser Teil ist privat und verschwindet%% und geht hier weiter.

## Inline-Kommentar mit Markdown im Inneren

Sichtbarer Text %%*fett* geheim `code` [link](https://example.org)%% Ende der Zeile.

## Mehrzeiliger Kommentar-Block

Absatz vor dem Kommentar bleibt sichtbar.

%%
Dieser komplette Block ist ein privater Kommentar.
Er reicht über mehrere Zeilen und erscheint nirgends.
%%

Absatz nach dem Kommentar bleibt sichtbar.

## Mehrzeiliger Kommentar verschluckt eine Tabelle

Vor der verschluckten Tabelle steht sichtbarer Text.

%%
| Spalte A | Spalte B |
| -------- | -------- |
| privat 1 | privat 2 |
| privat 3 | privat 4 |
%%

Nach der verschluckten Tabelle steht wieder sichtbarer Text.

## Escape im Fließtext

Ein wörtliches \%% bleibt als Zeichenfolge sichtbar und startet keinen Kommentar.

## Code-Fence mit Backticks bleibt Literal

```text
Hier steht %% literal %% und wird nicht als Kommentar entfernt.
```

## Code-Fence mit Tilden bleibt Literal

~~~text
Auch hier bleibt %% literal %% als Zeichenfolge erhalten.
~~~

## Inline-Code-Span bleibt Literal

Der Ausdruck `%%literal%%` in einem Code-Span bleibt vollständig sichtbar.

## Unpaariges Kommentar-Ende

Sichtbarer Text vor dem offenen Marker. %%Ab hier ist alles privat bis zum Dokument-Ende.

Dieser Absatz darf nicht erscheinen.

# Überschrift, die nicht erscheinen darf
