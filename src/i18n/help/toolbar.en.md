# Format toolbar

The format toolbar is a button bar above the editor for the frequent editing moves: character formats, headings, lists, quote, links and tables. Each button triggers a command from the central registry — the same commands that the editor context menu, keyboard shortcuts and command palette run. The bar belongs to the switchable "Format toolbar" extension (category Tools).

## Visibility

The bar appears exactly when the active tab is in edit mode and the view shows an editor (Source, Split or Live view). In the reading view, on manual and system pages and in focus mode it is invisible. In the split window layout each editor column carries its own bar; a click in the bar of the second column activates that column at the same time.

## Default assignment and state display

The default assignment groups with separators: the character formats (bold, italic, strikethrough, highlight, code), the heading menu, the list types (bulleted list, numbered list, task list), the quote, the two link actions (wiki link, external link) and the table button. Tooltips show the command name and the currently effective shortcut, custom display names precede them.

Pressed buttons show the state at the cursor position: list, heading and quote buttons follow the cursor line, the character-format buttons follow the selection or the word under the cursor. Pressed means: another click removes the format — display and toggle effect stay congruent.

## Heading menu

The heading button opens the level selection: heading level one to six plus "No heading", with a check mark on the level of the cursor line. The button itself appears pressed as soon as the cursor line is a heading.

## Table grid

The table button opens a selection grid in the style of word processors: sweeping across it marks rows by columns (the label shows the size, rows including the header row), a click inserts the empty table with a header row and separator row at the cursor. Undo removes the inserted table in one step. At all other access points (context menu, palette, shortcut) the table command inserts its compact default template unchanged.

## Overflow

If the assignment does not fit the width of the editor column, the trailing entries move into a more menu at the right edge of the bar. The menu entries show icon, name and state check mark; the heading menu appears there as a submenu, the table entry opens the selection grid.

## Customize the assignment

The "File → Settings… → Format toolbar" section maintains the assignment as a list: reorder entries (up/down), edit and remove them; new commands are created in a three-step dialog (command via filter search, icon from the curated set, optional display name). Separators and the heading menu are their own entry types; "Reset to default" restores the default assignment. Entries whose command belongs to a disabled extension do not appear in the bar — the configuration is kept and returns with the extension.

## Distinction

The format toolbar is the editing access in edit mode. The [custom status bar buttons](command-placement.md) of command placement are permanently visible, freely assignable access points in the status bar; the command palette (see [Tools](tools.md)) is the fleeting keyboard access to all commands.

## Disabled state

When the "Format toolbar" extension is disabled, the bar disappears completely and the settings section is hidden; all format commands stay reachable through context menu, shortcuts and palette. The assignment stays saved and applies unchanged after re-enabling.
