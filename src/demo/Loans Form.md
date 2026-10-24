---
title: Loans Form
db-form:
  table: Loans
---

# Loan

**Book:** {{field:book}}

Title of the book: {{value:book.title}}

**Borrower:** {{field:borrower}}

**Lent:** {{field:lent}}

**Due:** {{field:due}}

**Returned:** {{field:returned}}

{{when:book.onloan}}
The library still lists this book as out on loan.
{{end}}

This is the default form of [[Loans]]: the table definition names this file with `form: Loans Form`, and [[Loans List]] opens it for a row. The title of the book is not a field of the loan. `book.title` reads it through the reference field `book` from [[Library]], a moment after the form shows the loan, and while you create a new loan, it follows the choice of a book without saving; the book of an existing loan stays read-only, because the field `book` carries `editable: false`. The last sentence above is a conditional section between `\{{when:book.onloan}}` and `\{{end}}`: it reads the field **On loan** of the book through the same reference and only shows while that box is ticked in [[Library]].
