# Perspective Table

Perspective Table is an extension to the Markdown standard available in this viewer. It enables **tables with multi-line block cells**: nested lists, multiple paragraphs, code blocks, and images inside a single table cell. Standard Markdown tables (pipe syntax) are line-based and cannot do this.

The syntax is its own line-based notation. It is embedded as a fenced code block with the language tag `perspective-table`. In other Markdown applications the block remains visible as a regular code block — graceful degradation instead of broken source.

## Basic syntax

| Token   | Meaning                                          |
|---------|--------------------------------------------------|
| `{\|`   | Table start (first line in the code block)       |
| `\|+`   | Optional table caption                           |
| `\|-`   | Row separator between table rows                 |
| `!`     | Header cell                                      |
| `\|`    | Data cell                                        |
| `\|}`   | Table end                                        |

A cell begins at the start of a source line with `|` or `!`. Following lines without these markers belong to the current cell. This produces multi-line cells without per-line markup.

## Minimal example

Source:

````markdown
```perspective-table
{|
|+ Three variants compared
|-
! Variant
! Price
|-
| Basic
| EUR 10
|-
| Premium
| EUR 50
|}
```
````

Result:

```perspective-table
{|
|+ Three variants compared
|-
! Variant
! Price
|-
| Basic
| EUR 10
|-
| Premium
| EUR 50
|}
```

## Extended example with lists and code block

One cell contains a nested list, another a code block. The outer fence uses **four backticks** so that the inner three-backtick code block remains valid.

Source:

`````markdown
````perspective-table
{|
|-
! Phase
! Tasks
|-
| Design
| Gather requirements:

- Clarify main structure
  - Required fields
  - Optional fields
- Layout sketch
- Stakeholder review
|-
| Build
| Code skeleton:

```bash
mkdir src
npm init -y
```
|}
````
`````

Result:

````perspective-table
{|
|-
! Phase
! Tasks
|-
| Design
| Gather requirements:

- Clarify main structure
  - Required fields
  - Optional fields
- Layout sketch
- Stakeholder review
|-
| Build
| Code skeleton:

```bash
mkdir src
npm init -y
```
|}
````

## Spans and alignment

Cells can carry attributes for spanning multiple columns or rows and for aligning cell content.

### Attribute overview

| Attribute | Allowed values                | Effect                                                  |
|-----------|-------------------------------|---------------------------------------------------------|
| `colspan` | positive integer              | Cell spans multiple columns                             |
| `rowspan` | positive integer              | Cell spans multiple rows                                |
| `align`   | `left` / `center` / `right`   | Horizontal alignment of cell content                    |
| `valign`  | `top` / `middle` / `bottom`   | Vertical alignment in multi-line block cells            |

Attributes appear between two pipes at the cell start: `| attr="val" attr="val" | content`.

### Example with colspan, rowspan and align

Source:

````markdown
```perspective-table
{|
|+ Effort estimate
|-
! Area
! Task
! align="right" | Hours
|-
| rowspan="2" | Design
| Gather requirements
| align="right" | 8
|-
| Layout sketch
| align="right" | 4
|-
| colspan="2" align="center" | Subtotal
| align="right" | 12
|}
```
````

Result:

```perspective-table
{|
|+ Effort estimate
|-
! Area
! Task
! align="right" | Hours
|-
| rowspan="2" | Design
| Gather requirements
| align="right" | 8
|-
| Layout sketch
| align="right" | 4
|-
| colspan="2" align="center" | Subtotal
| align="right" | 12
|}
```

### Tips for spans and alignment

- Attributes may appear in any order: `| colspan="2" align="center" | content` and `| align="center" colspan="2" | content` are equivalent.
- Invalid values are silently ignored (e.g. `colspan="abc"`, `align="up"`).
- Cells without an attribute block render as normal cells.

### Accessibility

Header cells (`!`) automatically receive the appropriate `scope` attribute: `scope="col"` for headers in the table header row, `scope="row"` for headers inside data rows. This lets screen readers associate data cells with their headers.

## Nested tables and HTML export

Perspective tables can be nested inside each other, and a file with Perspective tables can be exported as "portable Markdown" with inline HTML tables, so it also renders as a real table in other Markdown applications.

### Nested tables

A cell can itself contain a Perspective table — up to three levels deep. Important: each outer code fence must have at least one more backtick than the next inner one (CommonMark standard).

| Level | Outer fence       | Example content                                                       |
|-------|-------------------|-----------------------------------------------------------------------|
| 1     | three backticks   | just the table, no embedded code block                                |
| 2     | four backticks    | table with an inner table (three backticks)                           |
| 3     | five backticks    | table with an inner table (four backticks) which itself contains another table (three backticks) |

A fourth level no longer renders as a table but as a code block (depth-limit protection against pathological inputs).

Source example with two levels:

`````markdown
````perspective-table
{|
|+ Outer table
|-
| Effort per position
| ```perspective-table
{|
|-
! Position
! Hours
|-
| Requirements
| 8
|}
```
|}
````
`````

Result:

````perspective-table
{|
|+ Outer table
|-
| Effort per position
| ```perspective-table
{|
|-
! Position
! Hours
|-
| Requirements
| 8
|}
```
|}
````

### HTML export for third-party Markdown renderers

`.md` files with Perspective tables only render as tables in this viewer. In other Markdown applications the `perspective-table` code block appears unchanged as source text.

Use **File → More File Functions → Export → Portable Markdown…** to save a variant of the file in which Perspective tables are replaced with inline HTML tables. These HTML tables render as real tables in practically any Markdown application.

- **Save-As dialog** with default name `<basename>-portable.md` in the source file's directory. Path and name are freely editable.
- **Original file** stays unchanged; the export always writes to a new file.
- **KaTeX formulas** (`$...$`) in table cells are kept as formula source text on export — rendered KaTeX HTML would look broken for recipients without the KaTeX stylesheet.
- **Cell attributes** (`colspan`, `rowspan`, `align`, `valign`) translate to HTML standard attributes and inline styles.
- **Accessibility `scope`** on header cells is preserved.
- **Nesting**: up to three levels are converted recursively.
- **Inline formatting in cells** (bold, italic, code, links) is converted to HTML so it appears correctly in third-party renderers too.

#### Marker for the viewer's display

To make the exported file also render **as a table in the EM4me viewer** (instead of as source text with `<table>` tags), the converter inserts the marker `<!-- perspective-portable -->` at the start of the file. The viewer detects this marker and switches the file into an HTML-capable render mode.

**Security note**: regular `.md` files still open without HTML rendering — no HTML from the Markdown is executed. Only the marker unlocks HTML rendering. For a third-party `.md` file carrying this marker (edge case), you must trust the source, since the HTML content there would be executed.

## Sorting, status highlighting and column default

Perspective tables can be tinted with status classes per cell or row, given a default alignment per column, and made click-sortable by column header.

### Status highlighting

Before a cell's content or directly after `|-`, a status class can appear in dot notation:

| Class      | Meaning                            |
|------------|------------------------------------|
| `.error`   | Error, critical                    |
| `.warn`    | Warning, attention                 |
| `.ok`      | OK, done, positive                 |
| `.info`    | Hint, neutral-informative          |
| `.neutral` | Marker without rating              |

- **Cell**: `|.error content`
- **Row** (applies to all cells of the row): `|-.warn`
- **Cell status wins** over row status.
- Invalid values are silently ignored.

Example:

```perspective-table
{|
|-
! Service
! Status
|-.warn
| Mail service
| Maintenance
|-
| Web server
|.error Outage
|-
| Database
|.ok Running
|}
```

### Column-default alignment

In the table header line, `cols="…"` sets a default alignment per column:

- Syntax: `{|+cols="left right right"`
- Values are `left`, `center` or `right`.
- A cell with an explicit `align` attribute (from stage 2) overrides the default.
- For `colspan` no default is applied (cell spans multiple columns).

Example:

```perspective-table
{|+cols="left right right"
|-
! Product
! Price
! Stock
|-
| Keyboard
| 49
| 12
|-
| Mouse
| 25
| 8
|-
| Monitor
| 280
| 3
|}
```

### Sortable tables

`+sortable` in the header line makes the table click-sortable:

- Syntax: `{|+sortable` (combinable with `cols=`: `{|+sortable cols="left right"`)
- Click on a header to sort ascending, second click descending, third click resets to original order.
- **Sort heuristic**: numeric first (`Number()` on the first line of the cell), otherwise lexicographic with locale (`localeCompare`, accents sorted correctly).
- **Multi-line cells**: sorted by the first line.
- **Dates**: ISO format (2026-05-19) sorts lexicographically correctly. Convert other date formats to ISO first.
- **`colspan`/`rowspan` automatically disable sorting** (layout risk too high).
- **In portable export** sorting is not included (no JavaScript in third-party Markdown renderers).

Example:

```perspective-table
{|+sortable
|-
! Name
! Age
! City
|-
| Mueller
| 42
| Berlin
|-
| Schmidt
| 28
| Hamburg
|-
| Becker
| 35
| Munich
|}
```

## Editing via the context menu

A right-click in the block opens the **Table** submenu in the [Editor context menu](context-menu.md). Row operations (move, insert, delete) work on the `|-` sections and preserve the raw text of the cells unchanged, including attributes, status classes and multi-line content; they are always possible, even with existing spans.

Column operations and transposing move whole cell blocks (marker line plus following lines) and are only available without `colspan`/`rowspan` — with spans the column assignment would be ambiguous, so the operation is rejected with a status bar hint. When transposing, the header row becomes the first column; the cell markers (`!` or `|`) travel with their cells.

The alignment entries set the column-default alignment in the `cols` attribute of the `{|` line (see the "Column-default alignment" section); columns without a setting receive the placeholder `-`, and the `align` attributes of individual cells stay untouched.

## Tips

**`|-` is required between table rows.** Without `|-` any following `|` cells are interpreted as additional cells in the same row, not a new row. Most common beginner pitfall.

**Four-backtick outer fence** whenever a cell contains a three-backtick code block. Otherwise the inner code block prematurely closes the outer fence.

**One cell per source line start.** Following lines without leading `|`, `!`, `|-` or `|}` belong to the current cell.

**Whitespace** at the start and end of a cell is stripped when rendered. List indentation inside the cell is preserved.

**Inline formatting, wiki links, and images** work in cells like anywhere else (`**bold**`, `*italic*`, `` `code` ``, `[[Wiki link]]`, `![alt](image.png)`).

## Portability

`.md` files with `perspective-table` blocks only render as tables in this viewer. In other Markdown applications the block appears as a regular code block. This is a deliberate design choice, not a bug — content stays readable everywhere instead of becoming syntactically broken source.

## Feature status

The planned feature set of Perspective tables is now complete: basic syntax, spans and alignment, nesting and HTML export, sorting, status highlighting and column default, as well as the editing operations via the context menu.
