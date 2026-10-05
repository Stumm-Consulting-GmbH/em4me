---
title: Tables
tags: [demo, tables]
chapter: 3
topic: tables
---

# Tables

Three flavours, from simplest to most capable. Back to [[00 Welcome]].

## Pipe table

Standard Markdown; the colons in the separator row set alignment. In live view the table
below stays laid out while you work in it: click a cell and type, then move on with Tab or
the arrow keys. Tab in the last cell adds a new row, what you type is kept however you leave
the cell, and typing `[[` or `#` in a cell brings up the same suggestion list as in body text.
For the raw syntax — the separator row, for instance — switch to the source
or the split view.

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
table: Orders
columns: Item:text, Price:number(2), Qty:number, Total:number(2) = Price * Qty
aggregate: Total:sum
| Coffee | 4.00 | 2 |
| Tea | 3.50 | 1 |
| Cake | 5.25 | 3 |
| Biscuits #snack, more in [[04 Links and Structure]] | 1.80 | 4 |
```

Click a cell to edit it; the total recalculates as you type.

Links and tags in a text cell work as in body text, as the last row shows: a click
follows them, and they count among the backlinks and tags. To edit such a cell, click
beside the link or press Enter or F2. While you edit a text cell, typing `[[` or `#` brings
up the suggestion list.

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

## Chart — the table as a picture

The line `table: Orders` at the top of the table gives it a name. A `perspective-chart` block names the table with the same line and draws the values of the table — change a price or a quantity above, and the chart follows as you type:

```perspective-chart
table: Orders
type: bar
labels: Item
values: Total
title: Total per item
```

More structure awaits in [[04 Links and Structure]].
