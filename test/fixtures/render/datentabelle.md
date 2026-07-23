# Perspective Datatable

Voll ausgebaute Tabelle mit allen Typen, Format, berechneter Spalte und Aggregaten:

```perspective-datatable
columns: Name:text, Datum:date, Start:time, Betrag:number(2), Erledigt:boolean, Doppelt:number = Betrag * 2
aggregate: Betrag:sum+avg, Datum:min+max, Erledigt:count
| Anna | 2026-07-08 | 09:30 | 12.50 | x |
| Bert | 2025-12-31 | 23:10 | -3 |  |
| P\|pe |  |  |  | x |
```

Zweite Tabelle im selben Dokument (Fence-Index 1) mit Fehler-Zellen:

```perspective-datatable
columns: N:number, D:date
| kaputt | 2026-02-30 |
```

Struktur-Fehler (unbekannter Typ, doppelte Spalte):

```perspective-datatable
columns: A:zahl, B:number, b:text
| 1 |
```
