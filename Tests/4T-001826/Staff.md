---
title: Staff
tags: [demo, data]
topic: data
db-table:
  name: Staff
  fields:
    - name: name
      type: string
      label: Name
      required: true
    - name: role
      type: string
      label: Role
    - name: manager
      type: record
      label: Manager
      options:
        table: Staff
    - name: since
      type: number
      label: Since
      options:
        decimals: 0
  key: name
  display: name
  lastId: 7
---

# Staff

This file is a third **database table**: the people who run the library. Its field `manager` has the type `record`, and its target table is this very table — every person points at the person they report to. A table that refers to itself is how an organisation, a family tree or a bill of materials is stored, and it is what the hierarchy queries on [[08 Queries]] work on.

Ada Brennan leads the library and points at nobody. Ben Okoro and Chloe Martin report to her, and each of them heads two people of their own, which makes three levels. The cell of `manager` holds the identifier of the manager, such as `r-00001`.

```perspective-records
|- id="r-00001"
| Ada Brennan
| Director
|
| 2009
|- id="r-00002"
| Ben Okoro
| Head of Collections
| r-00001
| 2013
|- id="r-00003"
| Chloe Martin
| Head of Lending
| r-00001
| 2016
|- id="r-00004"
| Dev Patel
| Cataloguer
| r-00002
| 2019
|- id="r-00005"
| Elena Rossi
| Archivist
| r-00002
| 2012
|- id="r-00006"
| Finn Larsen
| Desk Clerk
| r-00003
| 2021
|- id="r-00007"
| Grace Liu
| Desk Clerk
| r-00003
| 2018
```

## See also

- [[08 Queries]] — the whole team as a tree, and everyone below a given person
- [[Library]] and [[Loans]] — the two other tables of the [[Library Database]]
