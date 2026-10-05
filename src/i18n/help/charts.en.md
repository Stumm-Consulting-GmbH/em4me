# Charts for tables

A **chart for a table** shows the values of a [Perspective Datatable](datatable.md) as a line, bar, pie or donut chart. The chart is a **code block of its own** in the document that refers to its table by name. It holds **no numbers of its own**: the block only says which table and which of its columns or rows are shown, and the chart follows the table on every change — as you type, in the source as well as in the grid, even before the document is saved.

The chart stands wherever you put it: above the table, below it or somewhere else in the document entirely. A table may have several charts, for example two angles on the same numbers. Table and chart are visible at the same time; there is no switch on the table. Charts appear in the reading view, in the split view and in live mode.

## An example

A data table named `Sales` and a bar chart on it:

````markdown
```perspective-datatable
table: Sales
columns: Month:text, Income:number, Expenses:number
aggregate: Income:sum, Expenses:sum
| January | 1200 | 800 |
| February | 1350 | 900 |
| March | 1100 | 950 |
| April | 1500 | 1000 |
```

```perspective-chart
table: Sales
type: bar
labels: Month
values: Income, Expenses
title: Income and expenses
```
````

Rendered, table and chart appear:

```perspective-datatable
table: Sales
columns: Month:text, Income:number, Expenses:number
aggregate: Income:sum, Expenses:sum
| January | 1200 | 800 |
| February | 1350 | 900 |
| March | 1100 | 950 |
| April | 1500 | 1000 |
```

```perspective-chart
table: Sales
type: bar
labels: Month
values: Income, Expenses
title: Income and expenses
```

Each value column is a data series, each month a category on the axis. The aggregate row with the sums is not part of it.

## The name of the table

The name of a data table is carried by the line `table:` in its block, among the header directives before the data rows, in the example as the first line. The chart gives it in the same spelling in its entry `table:`. Letters (including accented letters and ß), digits, hyphen and underscore are allowed, no space and no full stop; upper and lower case count, `Sales` and `sales` are two names. The name is at the same time the identifier of the table as a block: a link such as `[[Report#^Sales]]` jumps to it, an embed shows it, and its [block properties](block-properties.md) are attached to it. In the rendered view, in printouts and in PDFs the line is not visible.

- If a name occurs more than once, the **first occurrence** in the document counts.
- A name inside a code block or in the front matter names nothing; examples in code blocks therefore do no harm.
- If the name breaks the rule or the line appears twice in the block, the table reports the error with its line number; its values stay visible.
- A line `^name` directly below the table, as older documents carry it, still counts as its name.
- If the name is renamed through the [Block properties](block-properties.md) panel, the charts **in the same document** follow.

## The entries of the block

The block `perspective-chart` carries one entry per line in the form `key: value`:

| Entry | Meaning |
|---|---|
| `table:` | the table: its name in the same document, for example `Sales`, or `[[File#^Sales]]` for a table in another one |
| `type:` | the type: `line`, `bar`, `pie` or `donut` |
| `series:` | where the data series come from: `columns` or `rows`; without the line, `columns` applies |
| `labels:` | the label column |
| `values:` | the value columns, separated by commas |
| `rows:` | the rows, by their entry in the label column, separated by commas (only with `series: rows`) |
| `title:` | a title on the chart; without the line there is none |

The keys and the names of the types are the same in every interface language, so a document means the same everywhere. Columns are named by their **identifier**, as in the aggregates of the data table, not by a heading of their own; upper and lower case do not matter. If an entry appears twice, the first one applies. Lines the chart does not know are skipped and stay unchanged.

## The four types

- **Line** (`line`) and **bar** (`bar`) carry one or more data series; with several series, the bars of a category stand side by side. Negative values are drawn.
- **Pie** (`pie`) and **donut** (`donut`) carry exactly one data series; each slice is labelled with the name of its category. With a very large number of slices, a pie or donut chart shows only the labels that have room.

The numbers on the value axis are written as in the data table, with a decimal point and without thousands separators.

## Data series from columns or from rows

**From columns** (`series: columns`, the usual case): each value column is a data series. The categories come from the label column, one entry per row of the table — as in the example above.

**From rows** (`series: rows`): each named row is a data series and carries the name of its entry in the label column. The chart names a row by that entry, not by its position in the table; the entry has to be written exactly as the table shows it, including upper and lower case. If an entry itself contains a comma, write it as `\,`. The categories are the headings of the value columns; without an entry `values:`, they are all number columns except the label column.

````markdown
```perspective-chart
table: Sales
type: donut
series: rows
labels: Month
rows: April
title: April
```
````

Rendered, on the same table as above:

```perspective-chart
table: Sales
type: donut
series: rows
labels: Month
rows: April
title: April
```

For both directions:

- **Values only come from number columns**, computed number columns included, with their computed values. The label column may be of any type.
- Where a series or category is named after a column, it carries the **heading** the table shows in its column header.
- Series and categories appear in the **order of the table**, not in the order in which they are named.
- The **aggregate row** belongs neither to the data series nor to the categories.
- What counts is the written content of the table: **sorting and filtering** the data table in the view do not change the chart.

## A table in another document

A chart can also refer to a data table in another document, written like a link to a named block:

```markdown
table: [[Report#^Sales]]
```

This way you can, for example, build an overview page with charts for tables from several notes. Everything that applies to a chart in the same document applies to such a chart as well. In addition:

- **The other document is looked up like an embed** of the same target (see [Linking](linking.md)): by the same rules and within the same limits of the area. The extension `.md` may be left out.
- **If the other document is open**, the chart shows its written state, including unsaved changes, as you type — whether it is open in the same window or in another one. If it is not open, the saved state applies.
- **If the file is changed from outside** and the application notices, the chart is redrawn with the new state without reopening the document. Embeds of the same target refresh as well.
- **If the file is renamed**, the entry `table:` in the chart follows.
- **The reference is a link**: in the backlinks, the outgoing links and the graph it counts like an embed.
- The chart only **reads** the other document; it never changes it.

## When a chart cannot be drawn

If a table does not suit a chart at the moment, a notice with the heading **The chart cannot be drawn** and a sentence naming the reason takes the chart's place. The reasons, in their fixed order:

1. The named **other document is missing**.
2. **The name does not occur in the document** — or the chart names no table at all.
3. The name does **not belong to a data table** but, for example, to an ordinary table, a Perspective Table or another block.
4. The data table itself reports an **error in its structure** — even if it still shows values despite the message. The chart appears as soon as the error in the table is fixed.
5. A named **column is missing**, a named row entry matches **no row or several rows**, or a required entry is missing from the chart or has an unknown value.
6. A column named as values is **not a number column**.
7. The selected data series contain **not a single number**.
8. The **type does not suit the data**: a pie or donut gets negative values, consists of zeros only or carries more than one data series — or the type is missing or unknown.

If several reasons apply at once, the notice names the first one. Once the reason is fixed, the chart appears in place of the notice, as you type. The notice is shown in the interface language and does not change the document.

### Values left out

If only single cells of the selected data series are **empty** or **error cells** — values that do not match the type of the column —, the chart is drawn without these values. A line below the chart states their number, for example:

> 2 values were left out because their cells are empty or unreadable.

Without values left out, this line does not appear; when a cell is filled in or corrected, the number goes down. A table that is still being filled in thus appears as a chart from its first number on. Lines and bars made of zeros only are drawn, because zeros are numbers.

## Colors

The data series carry the colors of the active [color scheme](color-schemes.md): in the group **Charts**, every color scheme has ten colors, **Data series 1** to **Data series 10**. The first data series carries the first color, the second the second and so on; for pie and donut this applies per slice. From the eleventh series on, the colors start again with the first.

If you change one of these colors, switch the color scheme or switch between light and dark, the chart follows at once. Labels and axes take the text colors of the color scheme.

## Printing, PDF and portable export

**Printing and PDF export** (see [Tools](tools.md)) show the chart when they output from the reading view, the split view or live mode. There the chart is drawn **light**, with the chart colors of the light color scheme, even if the application runs dark; afterwards the application shows its own colors again. A chart that cannot be drawn appears with its notice, as on screen, and at a page break a chart stays together with its notice and its line of values left out where possible. If the table lies in another document, the output waits until it has been read; if that does not happen in time, the notice “The table could not be read in time.” takes the place of the chart. From the source view, printing and PDF export output the raw Markdown.

The **portable export** writes the chart into the file as an **image**, drawn light, so that a recipient sees it without this application. The table stays a table in the export; the image only takes the place of the chart block. If values had to be left out, the same line as on screen appears below the image. A chart that cannot be drawn stays as an unchanged block. The image is embedded in the file; the recipient's viewer has to be able to display such images, as with the Mermaid diagrams on the page [Math and diagrams](math-diagrams.md).

Everywhere, the output contains the values the chart shows at the moment of output, including unsaved ones and those from another document. Printing and exporting do not change the document.

## Inserting and editing a chart

You do not have to write a chart by hand. Two commands with a shared dialog insert it at a data table and change it later, without you having to know the entries of the block, the name of the table or the identifiers of its columns: **Insert chart for this table** and **Edit chart**.

### Inserting

**Insert chart for this table** is available in four places:

- in the **context menu of the data table**: right-click the grid in live mode or in the rendered half of the split view, on a cell, a column heading or the margin around the grid. The table stays a grid, and the menu carries only this one entry.
- in the [editor context menu](context-menu.md) when the cursor is in a data table, for example after a right-click into its source;
- in the menu **View → Chart**;
- in the **command palette** (default `Ctrl+K`).

The command can only be chosen when the document can be changed and it is clear which data table it acts on: the cursor is in a data table, or the table has been clicked — because you are working in one of its cells or because the right-click hit it. While a cell of the data table is being edited, the command can therefore also be chosen from the menu and the command palette. An ordinary Markdown table or a Perspective Table does not count as a data table. A right-click into a cell input that is currently open shows no menu; the input stays open.

The command opens the dialog described below. After confirming:

- **The name of the table.** If the table has no name yet, it gets `table: tabelle-1` as the first line of its block, with the smallest number still free in the document: if `tabelle-1` is already taken, it becomes `tabelle-2`, and so on. Nothing is written below the table. If it already has a name, it stays unchanged, and the chart gives that name.
- **The position.** The chart block stands directly below the table; a chart already standing there moves down. Another chart for the same table gives the same name.
- **The display.** Table and new chart appear drawn at once; in live mode the new chart is selected afterwards.
- **Undo.** A single undo step (`Ctrl+Z`) takes back the chart together with a name assigned along the way.

Cancelling the dialog changes nothing: neither a chart nor a name is created.

### The dialog

The dialog carries the title of the command, **Insert chart for this table** when inserting and **Edit chart** when editing; when editing, it names the table below, for example **Table: Sales**. It only offers what the table provides, so no invalid entry can arise. The fields, from top to bottom:

| Field | What it offers |
|---|---|
| **Chart type** | Line, Bar, Pie or Donut |
| **Data series from** | Columns or Rows; a direction that would leave no data series cannot be chosen |
| **Label column** | every column of the table, with its heading; a column next to which no data series would remain cannot be chosen |
| **Data series (value columns)** | with data series from columns: the number columns except the label column, computed ones included and marked “computed” |
| **Data series (rows)** | with data series from rows: the rows, each with its entry in the label column |
| **Title (optional)** | free text; if it stays empty, no title appears |

Below are the buttons **Cancel** and **Insert** or **Apply**. In addition:

- With **Line** and **Bar**, several data series can be ticked; one always stays ticked. With **Pie** and **Donut**, exactly one must be chosen, and the dialog says so: “A pie or donut chart shows exactly one data series.”
- Rows whose entry in the label column is empty or not unique cannot be selected; a sentence below the list gives their number.
- When inserting, the dialog is preset to: Bar, data series from columns, as label the first column that is not a number column (otherwise the first one that can be chosen), and all number columns that can be chosen.
- **Without a mouse:** when the dialog opens, the focus is on the chart type; the Tab key moves through the fields and stays inside the dialog. `Enter` confirms from within a field, `Esc` cancels, as does a click outside the dialog.
- Only one dialog is ever open. Calling one of the two commands again, for example from the command palette, brings the open dialog to the front.

### Editing

**Edit chart** acts on the selected chart. A chart is selected when the cursor is in its block, and in live mode also when it has been clicked: a click highlights it, it stays drawn, and the cursor stays where it was. `Esc` or a click into the text next to it removes the selection again. The source of the block remains reachable with the arrow keys.

The command is available in the same four places:

- in the **context menu of the chart**: right-click the drawn chart in live mode or in the rendered half of the split view. The chart stays drawn, and the menu carries only this one entry.
- in the [editor context menu](context-menu.md) when the cursor is in the block of the chart;
- in the menu **View → Chart**;
- in the **command palette**.

It can only be chosen when a chart is selected and the document can be changed. It opens the same dialog as inserting, preset with the entries of the block; it offers the columns and rows of the table the chart refers to. After confirming, the block carries the changed entries, and the chart appears with them at once. The following applies:

- The name the chart gives and the table itself stay unchanged; only the chart block is written.
- Entries in the block that the dialog does not know are kept.
- Confirming without a change writes nothing, cancelling changes nothing.
- A single undo step takes back the change.

**A table in another document.** A chart with the entry `table: [[File#^name]]` can be edited this way as well. The dialog reads the columns and rows from the other document and names it below the title, for example **Table: Sales in the document “Report”**. Only the block in your own document is written; the other document stays unchanged. Such a chart cannot be inserted through the command, because the command always acts on the table at which it is called; a chart for a table in another document is created by writing it (see “A table in another document” above).

### When a message appears instead of the dialog

If no chart can be created for the table, no dialog opens; instead a message in the status bar gives the reason, for example “No chart can be inserted for this table. The table has no number column.” This happens:

- when inserting and when editing, if the table has **no number column**, none of its columns and rows yields a data series or it reports an **error in its structure**, and if the block of the table or of the chart is not closed;
- when editing, in addition, if the table the chart refers to **cannot be found** — the name does not occur, or the other document is missing — or if the name **does not belong to a data table**. If the other document is still being indexed, the message asks you to try again in a moment.

If the table or the chart is changed while the dialog is open, confirming writes nothing, and a message says so; the same applies if edit mode has been switched off in the meantime or another document has taken the place of the document.

### Where the commands cannot be chosen

- In the **reading view** the document cannot be changed: a right-click on a data table or a chart shows no menu, and neither of the two commands can be chosen.
- When **edit mode is off** (View → Edit), the same applies in live mode and in the split view; a click then does not select a chart either.
- A data table or a chart in an embed, in the output of a script block or on a card of a canvas offers none of these entries on right-click.

### With the keyboard

In live mode the grid of the data table cannot be reached with the keyboard. The way without a mouse leads through the cursor: with the arrow keys into the block of the table or the chart, which then shows its source, and then the command from the command palette or the menu **View → Chart**. In the rendered half of the split view the Tab key reaches the cells of the data table; a cell with the focus counts as a clicked one. The dialog itself can be operated entirely without a mouse.

## The extension “Chart for a data table”

Charts belong to the [internal extensions](extensions.md) and are switched on in the working mode **Full**. When the extension is off, the block appears as an ordinary code block, in printing, PDF and portable export as well; the document stays unchanged, and after switching it back on the chart appears again. The two commands are then not available, neither in the menu nor in the command palette nor in any context menu.

Charts build on the extension **Perspective Datatable**: as long as they are switched on, the data table cannot be switched off. If the data table is off, the charts are off too.

## Limits

- **The only source is the data table.** An ordinary Markdown table, a Perspective Table, query results and records of the database are not a source for a chart.
- **You edit the table, not the chart.** The chart is a graphic; values can neither be changed on it nor shown on hover. The only thing that can be changed on the chart is its entries, with “Edit chart” or in the source.
- **No calculations of its own.** The chart forms no sums or averages across series; to show them, calculate them in a computed column of the table.
- **Four types.** Area charts, stacked bars and other types do not exist.
- **Colors belong to the color scheme**, not to the individual chart.
- **Changes from outside to another document** are only noticed if the application watches the file: if the document lies in an area, the whole area root, otherwise the folder of the document down to two levels — and only after the application has read that folder completely once.
- **Another document in a linked area** (written as `[[@zt:File#^name]]`) is not found; the notice about the missing document takes the place of the chart, just as an embed of the same target does not appear.
- **Renaming the name of a table** only updates the charts in the same document. Charts in other documents do not follow, nor does an entry that names the own document in the form `[[File#^name]]`.
- **A data table in a quote** or in a more deeply indented list carries no name that a chart, a link or an embed finds.
