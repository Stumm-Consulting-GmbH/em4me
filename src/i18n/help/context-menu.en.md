# Editor context menu

A right-click in the editor opens a context menu that makes the formatting, paragraph and insert constructs available directly at the text. It is available in source and live mode. The access paths and default shortcuts are listed in the [functions table](functions.md).

## Structure

From top to bottom, the menu is organised into seven groups:

- **Link** — wrap the selection as a wiki link or as an external link.
- **Format** — character level: bold, italic, strikethrough, highlight, code, math, comment and "clear formatting".
- **Paragraph** — line level: bulleted list, numbered list, task list, heading 1 to 6, no heading and quote.
- **Insert** — templates: footnote, table, callout, horizontal rule and code block.
- **Table** — editing operations for the table at the cursor; appears only when the cursor is inside a table.
- **Chart** — "Insert chart for this table" or "Edit chart"; appears only when the cursor is inside a data table or inside the block of a chart.
- **Clipboard** — cut, copy, paste, select all.

The default shortcuts for bold (`Ctrl+B`) and italic (`Ctrl+I`) also work without the menu; every other action can be bound to a shortcut in the settings.

## Selection semantics

The character formats follow the selection:

- With a selection, the action applies to the selected characters.
- Without a selection, it takes the word under the cursor.
- If the cursor is not inside a word, an empty marker pair is inserted and the cursor placed between them.

Leading and trailing spaces stay outside the markers.

## Toggles and check marks

All format and paragraph actions are toggles: if the format is already set, the same action removes it again. When switching the list type, the existing prefix is replaced rather than stacked. The paragraph submenu uses a check mark to show which state is active for the cursor line, such as a particular heading level or "no heading".

## Multiple lines

If the selection spans several lines, a paragraph action applies to all of them. A numbered list is numbered consecutively.

## Table submenu

When the cursor is inside a table, the **Table** group additionally appears with a submenu; outside tables it is absent. The operations act on the table at the cursor and work in both kinds of table, the pipe table and the [Perspective Table](perspective-table.md):

- **Alignment** — align the column left, center or right; a check mark shows the current alignment of the cursor column.
- **Rows** — move up or down, insert below, delete.
- **Columns** — move left or right, insert to the right, delete.
- **Transpose** — swap rows and columns; the header row becomes the first column.

Each operation is a single undo step. Targets that are not possible appear dimmed: the header row and separator row of a pipe table cannot be moved or deleted, and the last column cannot be deleted. On each change, pipe tables are written back formatted (outer pipes, columns padded with spaces); this also applies to borderless tables. In Perspective tables the row operations work on the `|-` sections; column operations and transposing are only possible there without `colspan`/`rowspan` and are otherwise rejected with a hint. All operations are also in the command palette and can be bound to shortcuts; the "Table tools" extension turns off the submenu and its commands. In live mode, a right-click in a cell places the cursor in exactly that cell; the operations then act at the clicked spot, and cell input in progress is kept.

## Charts for tables

If the cursor is inside a [Perspective Datatable](datatable.md), the entry **Insert chart for this table** appears after the **Table** group and before the clipboard; if it is inside the block of a chart, the entry **Edit chart** appears. Both appear only when the document can be changed and the extension "Chart for a data table" is switched on. They open the dialog described on the page [Charts for tables](charts.md).

On the **grid of a data table** and on a **drawn chart** — in live mode and in the rendered half of the split view — a right-click opens, instead of this menu, a short menu with exactly the one matching entry. Table and chart stay drawn, and the cursor stays where it was. In the reading view and with edit mode off, no menu appears there. A right-click into an open cell input shows none either; the input stays open.

## Protection in links and code

Inside a wiki link target and inside inline code, the format actions deliberately have no effect, because the markers would destroy the structure there. "Clear formatting", on the other hand, still cleans up in such places.

## Read-only editor

If the editor is read-only, that is, a view without edit mode, the menu shows only copy and select all; the link, format, paragraph and insert groups are omitted.
