# Spaltenkopf

```perspective-datatable
columns: Betrag "Betrag (brutto, in Euro)":number(2), Gesamt "Gesamt = Betrag mal zwei":number(2) = Betrag * 2
aggregate: Betrag:sum
types: hidden
| 12.5 |
| 3 |
```
