---
title: Loans
tags: [demo, data]
topic: data
db-table:
  name: Loans
  form: Loans Form
  fields:
    - name: book
      type: record
      label: Book
      required: true
      editable: false
      options:
        table: Library
    - name: borrower
      type: string
      label: Borrower
      required: true
    - name: lent
      type: date
      label: Lent
      required: true
    - name: due
      type: date
      label: Due
    - name: returned
      type: boolean
      label: Returned
  display: borrower
  checks:
    - rule: due >= lent
      message: The due date lies before the date of lending.
  editable: NOT returned
  lastId: 3
---

# Loans

This file is a second **database table**, and its first column points into the first one: `book` has the type `record` and names [[Library]] as its target table. Each cell holds the identifier of a book, such as `r-00005`. The table has no business key of its own, because a loan is a movement rather than a thing; its records are named by the borrower.

Open a record with the button at the start of its row, or start a new loan with **New record** below the table. In the form, the book shows up with its title next to its identifier, and for a new loan the form offers the books of the library to choose from. Two rules of the definition come into play when saving: a due date before the date of lending is rejected, and a loan that is marked as returned can no longer be edited. The field `book` carries a lock of its own, `editable: false`: the book of a loan is chosen when the loan is created and never changes afterwards, so **Edit** shows it read-only, and lending another book is a new loan. The other way round, **Used by** in the form of a book in [[Library]] lists the loans that point at it, and as long as one does, that book cannot be deleted.

The same loans can also be maintained without opening each one: [[Loans List]] shows them as a list form, where a row is changed, added or deleted in place, and the form of a loan is [[Loans Form]], named with `form: Loans Form` in the definition above, which reads the title of the book through the reference field.

```perspective-records
|- id="r-00001"
| r-00001
| Clara Jensen
| 2026-08-18
| 2026-09-15
| x
|- id="r-00002"
| r-00005
| Tom Okafor
| 2026-09-01
| 2026-09-29
|
|- id="r-00003"
| r-00004
| Mia Lindqvist
| 2026-09-15
| 2026-10-13
|
```

## See also

- [[Library]] — the table the loans point at
- [[Loans List]] — the loans as a list form, maintained row by row
- [[Loans Form]] — the form of a loan, with the title of the book read through its reference
- [[Library Database]] — the fact sheet of the database and the overview of both tables
