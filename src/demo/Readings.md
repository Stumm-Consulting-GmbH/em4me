---
title: Readings
tags: [demo, data]
topic: data
db-table:
  name: Readings
  fields:
    - name: author
      type: record
      label: Author
      required: true
      options:
        table: Authors
    - name: book
      type: record
      label: Book
      options:
        table: Library
    - name: held
      type: date
      label: Held
  lastId: 3
---

# Readings

This small table records the author readings held in the library. Both of its first columns are reference columns, and they point at two tables kept in different forms: `author` names [[Authors]], a card index whose records are documents of their own, and `book` names [[Library]], whose records live in a block. A reference makes no difference between the two. A cell holds the identifier of the target, such as `r-00002`, or the value of its business key, such as an author's name or a book's title; when the application saves a record, it writes the identifier.

```perspective-records
|- id="r-00001"
| Ursula K. Le Guin
| A Wizard of Earthsea
| 2025-03-20
|- id="r-00002"
| r-00002
| Solaris
| 2025-06-12
|- id="r-00003"
| Umberto Eco
| r-00001
| 2025-11-06
```
