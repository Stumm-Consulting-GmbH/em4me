---
db-table:
  fields:
    - name: name
      label: Name
    - name: menge
      type: number
      options:
        decimals: 2
    - name: erledigt
      type: boolean
    - name: faellig
      type: date
---

# Bestellungen

```perspective-records
|- id="r-00001"
| Anna
| 12.5
| x
| 2026-09-07
|- id="r-00002"
| Bert
| -3
|
| 2026-10-01
|- id="r-00003"
| Cleo
| zwoelf
| x
| 2026-02-31
|- id="r-00004"
| Dora
```
