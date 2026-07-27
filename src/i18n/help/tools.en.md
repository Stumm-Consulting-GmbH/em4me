# Tools

Nine helpers for daily text work: linter, search, search and replace, table editor, PDF export, command palette, date and time entry, clock with alarms, timer, stopwatch and month calendar, title line. Access paths and default shortcuts are listed in the [features table](functions.md).

## Markdown linter

The linter subtly marks seven typical issues in the editor (Source, Split and Live view); hovering over a mark shows the explanation. The examples sit in code blocks so this page itself stays mark-free.

| Rule | Violation | Fix |
|---|---|---|
| Bare URL | `See https://example.org for details.` | `See [example](https://example.org) for details.` |
| Empty link text | `[](https://example.org)` | `[Example](https://example.org)` |
| Missing alt text | `![](image.png)` | `![Architecture sketch](image.png)` |
| Wiki link without target | `[[Typo-name]]` | `[[Project plan]]` (existing file) |
| Broken wiki anchor | `[[Project plan#Missing]]` | `[[Project plan#Milestones]]` (existing anchor) |
| Unknown callout type | `> [!importantly] Title` | `> [!warning] Title` (type from the whitelist) |
| Unpaired comment marker | `Text %% without closing` | `Text %%private%% more` or `\%%` for a literal `%%` |

## Full-text search

The search (default `Ctrl+F`) finds live while typing; the search scope follows the view (source text or preview). Two toggles extend it: `.*` for regular expressions, `Aa` for case sensitivity. `F3` and `Shift+F3` jump between matches, in the search bar also `Enter` / `Shift+Enter`.

The question mark in the search bar opens a regex quick reference; the most important patterns:

| Pattern | Meaning |
|---|---|
| `.` | any character |
| `*` / `+` / `?` | 0+, 1+ or 0–1 repetitions |
| `^` / `$` | start / end of line |
| `\d` / `\w` / `\s` | digit / word character / whitespace |
| `[abc]` / `[^abc]` | one / none of the characters |
| `a\|b` | a or b |

## Search and replace

In edit mode (default `Ctrl+H`) a replace row appears. With the regex toggle active, backreferences work in the replacement text: `$1`, `$2` for capture groups. "Replace All" is a single transaction, one `Ctrl+Z` undoes everything together.

```text
Search:   (\d{2})\.(\d{2})\.(\d{4})
Replace:  $3-$2-$1
Effect:   12.06.2026 → 2026-06-12
```

## Table editor

In pipe tables `Tab` jumps to the next and `Shift+Tab` to the previous cell. At the end of the last row, `Tab` or `Enter` create a new table row with the same column count; pressing `Enter` twice on an empty row leaves the table. Borderless tables (without outer pipes) are recognised as well. Structural operations (moving, inserting and deleting rows and columns, alignment, transposing) are offered by the **Table** submenu in the [Editor context menu](context-menu.md).
## PDF export

"File → Export as PDF…" (default `Ctrl+Shift+P`) prints the content of the active tab to a PDF file. The export follows the active view: the source view prints the raw Markdown with syntax highlighting, including line numbers when they are enabled in the tab; rendered, split and live mode print the formatted document (split and live switch internally to the rendered view for printing and restore the view afterwards). The PDF is always light, even when the app runs in the dark theme; Mermaid diagrams are redrawn in light colours and remain vector graphics. Formulas, code highlighting, callouts and perspective tables appear as in the preview.

Page size, orientation and margins are set in the "Export" section of the settings (File → Settings…); the default is A4 in portrait with normal margins. When content flows across pages, code blocks, tables, diagrams, formulas and callouts stay together where possible; headings do not end up alone at the bottom of a page.

## Command palette

"View → Command palette" (default `Ctrl+K`) opens a filterable popup of all the app's commands. Typing filters the list by substring over the command names; the arrow keys move the selection, `Enter` or a click runs the command and closes the popup, `Esc` cancels. To the right of each command sits the currently effective keyboard shortcut, including your own rebindings from the "Keyboard shortcuts" settings section. Commands that are not available in the current context (for example, area commands without an open area) appear dimmed and cannot be run.

The palette is the fleeting keyboard access to the command registry; for permanent custom access points — status bar buttons, context menu entries and macros — see the [Command placement](command-placement.md) page.

## Date and time entry

A calendar popup inserts a date and time at the cursor position, including in the note field. Three commands open it: default `Ctrl+Alt+T` for date and time, default `Ctrl+Alt+D` for date only, default `Ctrl+Alt+U` for time only. The inserted formats are `2026-07-10`, `14:30` or combined `2026-07-10 14:30`.

### Operating the popup

On the left is a month calendar with a calendar-week column and Monday as the start of the week; the arrows page through the months, `Today` jumps to the current day. On the right, the time appears as four individually adjustable digits (tens and units of the hours, tens and units of the minutes) with a colon in between; `Now` sets the current time. Date and time can be enabled individually, with at least one part staying active.

The keyboard drives the calendar: the arrow keys move by one day (left, right) or one week (up, down), `Page Up` and `Page Down` by one month, `Enter` confirms, `Esc` cancels. A click outside the popup also cancels.

For the time, a click selects one of the four digits: the arrow buttons ▲/▼ and the Up/Down arrow keys step the active digit with wrap-around, Left/Right switch the digit, and digit keys set it directly and move on to the next. Invalid times simply cannot be entered this way.

### Typing trigger

Two semicolons `;;` in the editor open the combined picker at that spot. Confirming replaces the two characters with the chosen value, `Esc` leaves them in place. In code, formulas and frontmatter the sequence does nothing; inside the cells of a Perspective table it does work, because there the sequence is content rather than code.

### Clickable values in the editor

In the editor, in source as well as live mode, the app recognises values in the three formats and underlines them with a subtle dotted line. A click opens the picker pre-filled with the value, the switches following its form; confirming replaces it in place. Values are not clickable

- in code, formulas and frontmatter,
- on the line the cursor is currently on,
- in wiki-link targets,
- behind the date markers of the [task lists](tasks.md), which appear there as a badge.

The line holding the cursor deliberately stays undecorated: normal text editing happens there, and the value becomes clickable again as soon as the cursor leaves the line. Read-only views have no clickable values.

Recognition deliberately also catches hand-typed values: every date and time in these formats thus becomes editable.

### Extension

This function belongs to the switchable extension "Date and time entry" (Settings → Extensions). When it is switched off, the commands, typing trigger and click decoration are gone; the values stay plain text. The formats match the date markers of the task lists, so both functions share the same notation.

## Clock, alarms, timer, stopwatch and calendar

A sidebar panel shows the time as an analog clock, as a digital readout and with a date line; size, dial style, second hand, hour and date format as well as the calendar week can be chosen in the settings. A bar at the top of the panel switches between five views: clock, alarm, timer, stopwatch and calendar. The choice applies per sidebar column and survives a restart.

### Size

Three steps scale dial and text together so the panel reads as one image. The setting sits in the "Display" block of the settings and applies even when the dial is turned off and only the digital readout is running. Time, date line and calendar week grow together and keep their proportions.

The small step is meant for narrow sidebar columns, the large one for a column dragged wide. If a line does not fit the column it is not wrapped but clipped on the left and right; the middle stays readable. To see all of it, drag the column wider or choose a smaller step.

### Alarms

The alarm mode holds any number of alarms. Creating one asks for the time, a name and the repeat pattern: once, daily or on selected weekdays. The time comes from a digit control, so an invalid entry is not possible. Each alarm can be armed separately without deleting it; a one-off alarm disarms itself after firing.

A due alarm shows a notice that can be confirmed or snoozed by a configurable duration (Settings → Clock). If the window is not in front, a system notification is added; clicking it brings the window forward.

### Timer and stopwatch

The timer mode lists the timers with remaining time and a progress bar. Three buttons start common durations right away, custom durations come from a control for hours, minutes and seconds. Start, pause and reset act per timer. The remaining time is computed from timestamps rather than counted down: a timer therefore keeps running correctly even if the window was in the background or the app was closed in between. An elapsed timer shows a notice and can be confirmed or started again.

The stopwatch counts up, with hundredths. Besides start, pause and reset it records lap times; the most recent lap is on top.

### Month calendar

The calendar mode shows a month as a grid: weekdays in the header, Monday first, the current day highlighted, days of the neighbouring months dimmed. The calendar-week column on the left can be switched off and on again in the settings under "Calendar".

The navigation sits above the table. The single arrows page one month, the double ones one year; "Today" returns to the current month. Clicking the month label opens the year entry: four digit positions that can be stepped with the arrow keys, switched with left and right and set directly by typing digits. An invalid year cannot be entered, and Enter or the check mark applies it.

The days are display only. The calendar is for looking things up, such as the question which weekday a distant date falls on; it does not lead into journals or appointments. The journals' calendar panel is there for that.

### Limit

Alarms and timers only fire while the app is running. With the app closed there is no notice, and an alarm time that passed meanwhile is not made up for at the next start. A running timer, by contrast, keeps counting correctly and fires as soon as the remaining time is up.

### Extension

The clock belongs to the switchable extension “Clock” (Settings → Extensions). When it is off, panel, status bar button, menu entry and the settings area are gone; no alarms or timers are watched either.

## Title line

Above the document, the file name without extension sits as a compact title line in heading style — without a line number, fixed while scrolling and in all four views (in the split view once, above the source column). Subpages show their full logical name in slash notation, unnamed documents the "Untitled" placeholder. Manual and system pages have no title line.

### Rename directly

A click on the title (or `Enter` or `F2` on the focused line) makes it editable; `Enter` or a click outside confirms, `Esc` discards, unchanged text ends silently. Confirming renames the file through the normal rename mechanism: links to the file are updated according to the "Update links in other files" setting, the companion file moves along, a page with subpages takes its entire subpage tree with it. Unsaved changes are saved beforehand. The rename dialog (File → Rename…) remains available as a route with preview and result report.

Invalid names (empty, disallowed characters) and name collisions are shown by a hint directly below the title; the file then stays unchanged. For unnamed documents, confirming a name triggers "Save As" with that name pre-filled.

### Extension

The title line belongs to the switchable extension "Title line" (Settings → Extensions). When it is switched off, the line disappears entirely; the file name stays visible via the tab title and window title, and renaming stays reachable through the dialog.
