---
title: Tables
tags: [demo, tables]
chapter: 3
topic: tables
---

# Tables

Three flavours, from simplest to most capable. Back to [[00 Welcome]].

## Pipe table

Standard Markdown; the colons in the separator row set alignment.

```markdown
| Item   | Qty | Price |
|:-------|:---:|------:|
| Coffee |  2  |  8.00 |
| Tea    |  1  |  3.50 |
```

| Item   | Qty | Price |
|:-------|:---:|------:|
| Coffee |  2  |  8.00 |
| Tea    |  1  |  3.50 |

## Perspective Table — multi-line block cells

A `perspective-table` block puts lists, paragraphs or code inside a single cell. `|-` starts a new row, `!` marks a header cell, `|` a data cell.

```perspective-table
{|
|+ Release checklist
|-
! Phase
! Tasks
|-
| Prepare
| Steps before the build:

- Bump the version
- Write the notes
|-
| Ship
| Tag the commit and archive the build.
|}
```

Edit it directly in **Split** view or **Live** mode.

## Datatable — typed, computable data

A `perspective-datatable` gives columns fixed types, a live aggregate row and computed columns (here `Total = Price * Qty`).

```perspective-datatable
columns: Item:text, Price:number(2), Qty:number, Total:number(2) = Price * Qty
aggregate: Total:sum
| Coffee | 4.00 | 2 |
| Tea | 3.50 | 1 |
| Cake | 5.25 | 3 |
```

Click a cell to edit it; the total recalculates as you type.

A column identifier has to stay short, because aggregates and computed columns
address it by name. For a heading that reads well, write it in double quotes
behind the identifier — and `types: hidden` drops the type line under the
headings:

```perspective-datatable
columns: Price "Price per cup (in euro)":number(2), Qty "How many":number, Total "Total, gross":number(2) = Price * Qty
aggregate: Total:sum
types: hidden
| 4.00 | 2 |
| 3.50 | 1 |
```

More structure awaits in [[04 Links and Structure]].
