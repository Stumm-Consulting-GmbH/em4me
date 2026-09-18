---
titel: Bestellungen
db-table:
  name: Bestellungen
  fields:
    - name: kunde
      label: Kunde
    - name: menge
      type: number
      options:
        decimals: 2
    - name: geliefert
      type: boolean
    - name: termin
      type: date
    - name: bemerkung
      type: multiline
---

# Datensatz-Block

Die Spalten stehen in der Definition im Frontmatter dieser Datei, nicht im
Block: Der Block trägt allein die Datensätze.

```perspective-records
|- id="r-00001"
| Anna Beispiel
| 12.5
| x
| 2026-03-01
| Erste Lieferung,
zweite Zeile derselben Zelle.
|- id="r-00002"
| Bert Muster
| 3
|
| 2026-04-15
| Eine Zelle, deren zweite Zeile mit einem maskierten Marker beginnt:
\| das bleibt Inhalt.
```

Text nach dem Block bleibt gewöhnlicher Fließtext.
