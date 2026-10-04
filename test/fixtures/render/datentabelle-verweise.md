# Perspective Datatable mit Verweisen

Text-Zellen mit Wiki-Verweis, Alias, Anker, Markdown-Link, Schlagwort,
Einbettung und Inline-Code; daneben eine Zahl-Spalte, eine Fehler-Zelle und
eine Zelle ohne Verweis:

```perspective-datatable
columns: Name:text, Betrag:number(2), Notiz:text
aggregate: Betrag:sum
| [[Ziel]] | 12.50 | [[Ziel\|Alias]] und [[Ziel#Kapitel]] |
| [Bericht](Bericht.md) | 3 | #projekt #1 C# |
| ![[Bild.png]] | kaputt | `[[wörtlich]]` **fett** $x$ |
| Anna | 1 | [Web](https://example.org/a#b) |
```
