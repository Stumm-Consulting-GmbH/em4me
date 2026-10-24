---
title: Library Form
db-form:
  table: Library
---

# Book

**Title:** {{field:title}}

**Author:** {{field:author}}

**Pages:** {{field:pages}}

Reading time at 40 pages a day: {{value:pages / 40}} days

**Acquired:** {{field:acquired}}

**On loan:** {{field:onLoan}}

{{when:onloan}}
## Out on loan

This section only shows while the book is out. Note who has it:

**Loan note:** {{field:loanNote}}

{{when:pages > 500}}
A long book: the loan may take a while.
{{end}}
{{end}}

## Loans

{{list:Loans List}}

This is the default form of [[Library]]: the table definition names this file with `form: Library Form`. The reading time is not a field. The form computes it from the pages every time it shows a book, and while you edit, it follows each input without saving. The section **Out on loan** is a conditional section between `\{{when:onloan}}` and `\{{end}}`: it appears only while **On loan** is ticked, and while you edit, it appears and disappears with the checkbox without saving. The loan note inside keeps its value even while the section is hidden, and the inner section about long books only shows together with the outer one. For a quick look at the same book, switch to [[Library Short Form]]; **Back** in its header returns here. Compare with [[Library#^r-00002]] (Foucault's Pendulum): a record link in the form text opens that record's form, and **Back** returns here. The section **Loans** is a line items section: `\{{list:Loans List}}` embeds [[Loans List]], restricted to the loans of the book shown. While you edit the book, you change, add and delete its loans there; they are only marked and are written together with the book when you save the form, all or nothing, and **Discard** drops them all.
