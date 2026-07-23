# Events

Event management keeps **appointments, birthdays, anniversaries and project dates** right in the document: as an embedded event block with its own data rows or as an aggregation over frontmatter properties from the files of the area. Each entry shows the **time difference to today** in four tiers, plus milestones, yearly recurrence, filters, four views and links between events.

The feature belongs to the [internal extensions](extensions.md) ("Events") and requires the [Property Profiles](property-profiles.md) — if that extension is disabled, event management switches off as well. Disabled, the block remains a regular code block.

## Block structure

A code block with the language tag `perspective-events` contains optional header directives and data rows; the command "Insert event block" (via the command palette, a shortcut can be assigned in the settings) inserts an empty block at the cursor position:

````markdown
```perspective-events
| 2020-01-01 | | Project start Alpha | projekt | Kickoff note | | | | |
| 1990-03-10 | | Anna's birthday | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Project phase | projekt | | | | | |
```
````

Rendered, the event table appears with category badges and a time difference column:

```perspective-events
| 2020-01-01 | | Project start Alpha | projekt | Kickoff note | | | | |
| 1990-03-10 | | Anna's birthday | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Project phase | projekt | | | | | |
```

Each data row carries nine cells in a fixed order:

| Cell | Field | Content |
|---|---|---|
| 1 | Date | date `YYYY-MM-DD` |
| 2 | End | optional date for time spans |
| 3 | Event | the event text (required) |
| 4 | Category | one of the eight category values |
| 5 | Notes | multi-line, line break as `\n` |
| 6 | yearly | `x` = yearly recurrence |
| 7 | Identifier | assigned automatically as soon as the entry is linked |
| 8 | Predecessor | identifier list, comma-separated |
| 9 | Successor | identifier list, comma-separated |

A `|` in the text is written as `\|`, a backslash as `\\`. Value problems of individual entries (missing or invalid date, end before start, unknown category) are **soft hints** — the entry stays visible. Structural errors of the block (unknown directive, too many cells) lock editing until the source is corrected.

## Field model: the internal profile

The event fields are defined as a fixed, **internal property profile** named `Ereignis`. It appears automatically in the profile resolution and in the profile list of the settings (marked, not editable) and works even without a configured profile folder. Details on the profile mechanics are on the [Property Profiles](property-profiles.md) page.

| Field | Type |
|---|---|
| `event-date` | Date |
| `event-end` | Date |
| `event-text` | Text |
| `event-category` | selection from the eight category values |
| `event-notes` | multi-line text |
| `event-recurring` | Boolean |
| `event-predecessors` | List |
| `event-successors` | List |

The eight category values are `geburtstag`, `todestag`, `jahrestag`, `jubilaeum`, `projekt`, `termin`, `erinnerung` and `sonstiges` — technical values in the source, displayed as localized names in colored badges.

## Editing in the table

The table is directly editable in the split view, in live mode **and in the reading view** (manual pages and embeds stay read-only). Every commit writes back into the code block, as a single undo step.

- **Add**: a form row below the table; the event text is the required field, the 📅 symbol opens a calendar picker for the date fields.
- **Edit**: the pencil action of the row opens the input fields; `Enter` commits, `Esc` discards.
- **Duplicate**: creates a copy of the entry, deliberately without links.
- **Delete**: after confirmation; links from other entries to the deleted one are cleaned up as well.

### Time difference column

The difference to today appears in four tiers — years, months, weeks and days, calculated to calendar accuracy — with the direction "past", "upcoming" or "today". If an end is set, the column additionally shows the duration of the time span. For yearly recurrence, a countdown runs to the next occurrence; February 29 falls on the 28th in non-leap years.

### Milestones

Events report round distances as milestones: multiples of a thousand in days, multiples of a hundred in weeks, multiples of a hundred in months, full years as well as the jubilee years 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90 and 100.

## Sorting and filtering

A click on the column header sorts by date, end, event or category (another click flips the direction; the default is date descending, empty values sort to the end). The filter bar combines text search, category selection, time range (with presets like "Today", "This week", "Next 30 days") and the flags "only with notes", "only recurring", "only with duration"; a counter shows the visible entries.

Named filters can be saved as a `filter:` directive in the block and applied via the bar:

````markdown
```perspective-events
filter: Recurring := recurring=x
filter: Birthdays := categories=geburtstag; from=2026-01-01
| 1990-03-10 | | Anna's birthday | geburtstag | | x | | | |
```
````

The directive carries `Name := Key=Value` pairs, separated by `;`: `text`, `categories` (comma-separated, `none` = no category), `from`, `to` as well as the flags `notes`, `recurring` and `timespan` (`x` = on). A `;` in the value is written as `\;`.

## Views

The toggle above the block switches between **Table, Dashboard, month calendar, week calendar and Timeline**; the choice is written into the block as a `view:` directive (`table`, `dashboard`, `month`, `week`, `timeline`). A click on an event in an additional view jumps to the table row.

```perspective-events
view: dashboard
| 1990-03-10 | | Anna's birthday | geburtstag | | x | | | |
| 2026-07-20 | | Workshop | termin | | | | | |
| 2026-08-30 | | Summer party | jahrestag | | x | | | |
```

The Dashboard bundles upcoming events, reached and approaching milestones and the category distribution; the calendars place the entries on a month or week grid with a today marker; the Timeline groups chronologically.

## Aggregation via frontmatter

Instead of its own data rows, the block can collect the events **from the files of the area**: a `query:` directive marks the aggregation, data rows are then not allowed. The base set is all area files whose assignment field names the `Ereignis` profile; the event data comes from their frontmatter fields (`event-date`, `event-text`, …).

````markdown
```perspective-events
query: WHERE event-category = 'geburtstag'
```
````

The query text uses the clause language of the [Perspective Query](frontmatter-query.md) (`FROM`, `WHERE`, comparisons, functions); an empty query collects all files with the `Ereignis` profile. Text values are in quotes (`'geburtstag'`) — a bare word would be a field reference.

- **Row click** opens the source file; the origin of each entry stays visible.
- **Editing writes back**: edits in the aggregated table land in the frontmatter of the source file, even if it is not open. If the source file is open with unsaved changes, a hint points there; if it was changed on disk in the meantime, nothing is written (conflict hint).
- **Limits**: adding and deleting do not exist in the aggregation — new event files arise as regular documents with the `Ereignis` profile. The aggregation needs an open area with an index.

## Links

Events can be chained as **predecessors and successors** — in the block via automatically assigned identifiers (cells 7 to 9), in the aggregation via the list fields `event-predecessors`/`event-successors` with file references. Both sides are always maintained together.

- The **link indicator** in the date column opens a popup with the references: jump to the linked entry or open the linked file, in the editable context also a search and a predecessor/successor toggle.
- Identifiers arise only with the first link; duplicating carries over no links, deleting cleans up both sides.
- Links connect only entries of the same world — block entries among themselves or files among themselves, not across the boundary.
- Orphaned references (target deleted or renamed) appear as a soft hint with a remove button.

## Export

The portable export converts embedded event blocks into static tables with finished texts in the export language (the time difference column calculates as of the export time); aggregation blocks remain as a code block, because their content depends on the area.
