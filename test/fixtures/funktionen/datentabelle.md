# Datentabelle

```perspective-datatable
columns: Name:text, Betrag:number(2), Erledigt:boolean, Doppelt:number(2) = Betrag * 2
aggregate: Betrag:sum+avg, Erledigt:count
| Anna | 12.5 | x |
| Bert | -3 |  |
| Cleo | kaputt | x |
```

Zweite Tabelle:

```perspective-datatable
columns: N:number
| 7 |
```
