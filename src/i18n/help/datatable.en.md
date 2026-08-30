# Perspective Datatable

The Perspective Datatable is a **typed data table with calculation functions**: columns have fixed value types, cells only accept type-conforming values, aggregate rows calculate live, and computed columns evaluate expressions per row. Editing happens directly in the rendered grid; all data lives as plain text in the document.

Scope: The [Perspective Table](perspective-table.md) targets rich text content (multi-line block cells, spans, status highlighting). The Datatable targets **structured, computable data** — small data sets such as expenses, time tracking, or inventory lists. The data table belongs to the [internal extensions](extensions.md) and can be disabled there; disabled, the block remains a regular code block.

## Block structure

A code block with the language tag `perspective-datatable` contains header directives and data rows:

````markdown
```perspective-datatable
columns: Name:text, Date:date, Amount:number(2), Done:boolean
aggregate: Amount:sum+avg, Done:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```
````

Rendered, the grid appears with header row, type symbols, and aggregate row:

```perspective-datatable
columns: Name:text, Date:date, Amount:number(2), Done:boolean
aggregate: Amount:sum+avg, Done:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```

- **`columns:`** (required) declares the columns as `Name:type`, comma-separated. Column names may contain spaces.
- **`aggregate:`** (optional) assigns aggregate functions to columns; combine several per column with `+`.
- **`types:`** (optional) switches the type shown beneath the headings: `shown` or `hidden`. Without the line it appears.
- **Data rows** use pipe notation (`| … | … |`), one line per record. A `|` inside text is written as `\|`.


### A heading of your own per column

The column identifier doubles as the heading. It has to stay short and free of separators, because aggregates and computed columns address it by name. For a heading that reads well, put it in double quotes behind the identifier:

```
columns: Amount:number(2), Total "Total (gross, in €)":number(2) = Amount * 2
```

The display text may carry any characters, including spaces, commas, colons and equals signs; a quote inside it is written twice. The column is still addressed by its identifier only, and that identifier stays reachable as a tooltip on the column heading.

## Column types and formats

| Type | Storage form | Example |
|---|---|---|
| `text` | free text | `Anna` |
| `number` | decimal point notation | `12.5`, `-3` |
| `date` | `YYYY-MM-DD` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (true) or empty (false) | `x` |

`number` supports an optional display format: `Amount:number(2)` shows two decimal places. Display and storage form deliberately stay identically readable (no locale reformatting); empty cells are valid for all types. A value that does not match the column type is marked as an **error cell** — the text is preserved, a tooltip explains the expected format, and the value does not flow into aggregates.

## Aggregates

Available functions per column type:

| Function | Meaning | Allowed on |
|---|---|---|
| `sum` | sum | `number` |
| `avg` | average (rounded to the column format) | `number` |
| `min` / `max` | smallest/largest value | `number`, `date`, `time` |
| `count` | number of non-empty cells (for `boolean`: number of true ones) | all types |

Empty and erroneous cells are excluded. The aggregate row appears below the data and recalculates on every change; with a filtered view it calculates over the visible rows.

## Computed columns

A column with `= expression` after the type computes its value per row from other columns:

```perspective-datatable
columns: Item:text, Price:number(2), Qty:number, Total:number(2) = Price * Qty
aggregate: Total:sum
| Pen | 1.20 | 10 |
| Pad | 3.50 | 4 |
```

- The expression language is the same as in the [Perspective Query](frontmatter-query.md): arithmetic, comparisons, `choice(…)`, `default(…)`, text functions, and more.
- Column names in the expression refer to the values of the respective row; other computed columns can be used in any declaration order (evaluation resolves the dependencies). Circular references are reported as structural errors.
- The result must match the declared column type, otherwise the cell shows an error.
- Computed values are **never stored in the source** — they are always calculated fresh and therefore have no data cell in the pipe rows. Aggregates over computed columns calculate on the computed values.

## Editing in the grid

In the **split view** and in **live mode** the grid is directly editable; the reading view and manual pages show it read-only. Every commit writes back into the code block in the source — the document becomes unsaved as usual, and undo/redo work as expected.

- **Edit a cell**: Click the cell (or `Enter`/`F2` when the cell is focused) to open a type-appropriate input field. `Enter` or losing focus commits, `Esc` discards, `Tab`/`Shift+Tab` commits and moves to the next or previous cell.
- **Type enforcement**: A value that does not match the column type is rejected (hint in the status bar); the cell stays open for correction.
- **Boolean**: Clicking the cell (or pressing space) toggles the value directly.
- **Rows**: The button below the table appends a row at the end of the data; the × symbol at the start of a row deletes it.
- Cells of computed columns are not editable; entries in their input columns update them immediately.
- A table with structural errors (see below) cannot be edited in the grid until the error is fixed in the source.

## Sorting and filtering (view)

Sorting and filtering affect **the view only** — the source stays unchanged, nothing is saved or exported; after reopening the file the view is neutral.

- **Sorting**: Clicking the column header sorts type-appropriately ascending, a second click descending, a third removes the sorting. Missing values sort to the end.
- **Filtering**: The toggle at the right table edge shows the filter row: text columns filter by containment search, boolean columns via a three-state toggle (all/yes/no). A note shows "n of m rows"; the aggregate row calculates over the visible rows.
- Editing remains possible in a sorted or filtered view and always hits the correct source row.

## Errors

- **Structural errors** (unknown type, duplicate column names, mismatched cell count, invalid expressions) appear as a list above the grid with the line number within the block.
- **Cell errors** (value does not match the type) mark only the affected cell; the text is preserved.

## Export

The portable export and the PDF export output the table as a static table in document order — with all rows, the calculated values of the computed columns, and the aggregate row, without interactivity.

## Limits

From 1000 data rows on, the grid shows only the header area and aggregates with a note; the aggregates still calculate over all rows. Very large data sets belong in a dedicated data tool.
