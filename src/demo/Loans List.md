---
title: Loans List
tags: [demo, data]
topic: data
db-query:
  editable: true
  form: Loans Form
  allow: [create, update, delete]
---

# Loans List

This page is a **list form**: a query file whose container `db-query` carries `editable: true`. Instead of a plain result table, the loans of [[Loans]] appear as a grid with a count line, fifty rows per page, and you maintain them right here. `allow` permits creating, changing and deleting rows, and `form` names [[Loans Form]] as the form that opens for a row.

```perspective-query
TABLE RECORDS book, borrower, lent, due, returned
FROM "Loans"
SORT lent
```

Click the column **Record** of a row to open the loan in [[Loans Form]]. Double-click a row or choose **Edit** in the column **Actions** to change it in place: **Enter** saves, **Escape** cancels, and nothing is locked until you start editing. **New row** next to the count line starts a new loan at the top of the page; fill in book, borrower and both dates, because a due date before the date of lending is rejected. **Delete** asks before it removes a loan. A loan marked as returned stays read-only, because the definition of [[Loans]] says `editable: NOT returned`.

[[Library Form]] embeds this file as a line items section, so the form of a book lists its own loans below its fields.
