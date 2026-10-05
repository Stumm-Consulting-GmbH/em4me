# Diagramme zu Tabellen

Ein Diagramm vor seiner Tabelle:

```perspective-chart
table: ^umsatz
type: bar
labels: Monat
values: Einnahmen, Ausgaben
title: Umsatz <2026> & "Plan"
```

```perspective-datatable
columns: Monat:text, Einnahmen "Einnahmen (netto)":number(2), Ausgaben:number
aggregate: Einnahmen:sum
| Januar  | 120.5 | 80 |
| Februar | 99    | 95 |
```
^umsatz

Ein zweites Diagramm auf dieselbe Tabelle, mit Zeilen als Reihen:

```perspective-chart
table: ^umsatz
type: line
series: rows
labels: Monat
rows: Januar, Februar
```

Ein Diagramm auf eine Tabelle in einem anderen Dokument:

```perspective-chart
table: [[Bericht#^kosten]]
type: pie
labels: Posten
values: Betrag
```
