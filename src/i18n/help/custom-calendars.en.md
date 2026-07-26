# Calendar systems

Freely definable time reckonings for fantasy worlds and special use cases: every area can keep its own calendar blocks, whose calendars may be built completely differently from the familiar standard calendar — with their own month lengths, leap rules, week cycles and epochs. The feature belongs to the "Calendar systems" extension and applies only in the area context: without an open area, the settings section and the insert command are inactive.

## Concept

### Blocks

A block is a self-contained time world with a name and any number of calendars. Calendars of the same block run in parallel, can be mapped to one another and converted into each other. Different blocks deliberately have nothing to do with one another — between them there is neither conversion nor comparability.

### Calendars and levels

A calendar consists of an ordered list of levels, smallest first (for example second → minute → hour → day → month → year), grouped into named level groups (in the standard template "Time" and "Date"). Each level describes its relationship to the next-smaller one with one of five relation types:

- **Fixed factor** — a fixed number of smaller units, for example 60 seconds per minute.
- **Length table** — units with individual lengths, for example three months with 30, 30 and 35 days; the row names of the table are at the same time the position names (month names).
- **Leap rule** — cycle rules along the pattern "leap every 4, except every 100, except every 400", stating the extended unit and the extension.
- **Independent cycle** — the week pattern: a cycle of fixed length runs across month and year boundaries, anchored to a reference date, optionally with a numbering rule (the cycle number follows the year in which the decisive day of the cycle falls).
- **Grouping** — a purely computational aggregation, for example quarters of three months each.

### Epochs

Every calendar has exactly one open past epoch (it counts backwards), any number of closed intermediate epochs and one open future epoch. The boundaries join seamlessly and lie on a date without a time component; year counting starts at 1 in each epoch, there is no year 0. An epoch boundary may fall in the middle of the year — year 1 of the new epoch is then a partial year.

### Conversion via the block axis

Every block has a neutral time axis. Every calendar is mapped onto this axis via an anchor (the calendar point in time that lies on the axis zero point) and a scale (the duration of its smallest unit in axis units, as a fraction of numerator and denominator). Conversions between calendars always run via the block axis and round deterministically down to the smallest level of the target calendar.

## Maintenance in the settings

The settings section "Calendar systems" shows the blocks of the open area in two stages: the overview manages the blocks (add, rename, open, remove), the detail view of a block shows its calendars as forms with editors for levels, epochs, cycles, groupings and the block axis.

- The **"Insert standard calendar as template"** button creates a full definition with twelve months, a leap rule and a seven-day cycle — as a starting point for adaptation and as a living example of all relation types.
- The **live preview** shows a freely chosen example value canonically and with names; as long as a definition is incomplete, the editor reports it as a hint (soft validation), only applying checks strictly.
- The definitions are stored in the area file (file `Area_Settings.mdda`) and apply to all windows of the area.

Editing is deliberately never locked: structural changes to calendars already in use are allowed. Values in the document that become invalid as a result are preserved unchanged and are visibly marked.

## Values in the document

A calendar value appears in canonical form in the source text:

```text
@{Calendar name: Year-Month-Day}
@{Calendar name: Year-Month-Day Epoch abbreviation}
@{Calendar name: Year-Month-Day Hour:Minute:Second}
```

The first colon separates the calendar name from the value. The date segments run from large to small; the epoch abbreviation is omitted in the most recent epoch, the time part is omitted when all time segments are at their minimum. In the rendered view, live mode and portable export, the value appears as a badge with the names from the definition (for example month names and epoch abbreviation).

If the named calendar is not defined in the area or the value is invalid, the source text stays unchanged and the value is visibly marked — like this example, whose calendar does not exist on this manual page:

@{Example calendar: 500-2-09 ZZ}

In code blocks and code spans the syntax stays untouched: `@{Example calendar: 500-2-09 ZZ}`.

## Inserting and editing

- **Inserting:** the command "Insert calendar date" (command palette; a shortcut can be assigned) opens the picker and inserts the chosen point in time canonically at the cursor. It is active as soon as the open area defines at least one calendar.
- **Editing:** values are clickable in source and live mode; the click opens the picker pre-filled with the value, committing replaces it in place in a single undo step.

## Picker

The picker for custom calendars works analogously to the standard date picker:

- Header selections for **block**, **calendar** and **epoch** (selections with only one entry are omitted). A calendar change converts the chosen point in time; a block change jumps to the anchor of the target calendar.
- The **grid** arises from the level structure: with a defined week cycle as a column grid (cycle length = number of columns, position names as header, number column with a numbering rule), without a cycle as a continuous day list of the unit.
- **Navigation:** the outer arrow buttons move the largest unit (the year), the inner ones the grid unit (the month); arrow keys navigate day by day, Enter commits, Escape cancels. **"To anchor"** jumps to the reference point in time of the calendar.
- **Time levels** appear as individually settable segments with arrow and digit input — invalid values cannot be entered by design.

### Conversion display

Below the grid the picker shows the chosen point in time in all parallel calendars of the block. A click on an equivalent switches the active calendar there. Calendars of different blocks are deliberately not convertible.

## Derived time reckonings

A derived time reckoning counts from a zero point of your own: how long it is until a date, or how long ago something happened. It needs no definition of its own, only a reference time reckoning and a zero point.

### Creating one

In the settings section «Calendar systems», the button **«Add derived time reckoning»** creates a short form:

- **Reference time reckoning** — a calendar of the same block or the built-in standard time reckoning. Counting down to a date therefore needs no calendar of your own.
- **Zero point (day 1)** — the date in the notation of the reference, optionally chosen through the picker; it always sits on a whole day.
- **Breakdown depth** — how finely the span is broken down, from the smallest unit alone up to years.
- **Direction labels** — two short words for the time before and after the zero point.

Editors for levels, cycles, groupings and epochs do not appear here, because none of them can be overridden.

### What is inherited

The derived reckoning takes over the units of its reference and shifts their boundaries onto the zero point. If that falls on a 23rd, every derived month starts on the 23rd and every derived year on the same day; weeks start on the weekday of the zero point. Each unit therefore keeps the length it has in the reference, and a leap day falls into the right year by itself. The names move along: if counting starts in July, the first month is still called July. If the zero point falls on a day that not every month has, the boundary moves to the last day available.

### Values in the document

The value counts away from the zero point in both directions: coarser units as a complete count from 0, the smallest as an ordinal from 1. Before the zero point the same form applies, with the direction label.

```text
@{Reckoning: 0-0-1}             the zero point itself
@{Reckoning: 0-1-18}            one month and seventeen days after it
@{Reckoning: 0-0-15 before GL}  fifteen days before it
```

What is displayed is the span in the chosen depth, without parts of length zero, for example «1 month, 2 weeks, 4 days». The tooltip additionally names the canonical value and the corresponding point of the reference time reckoning. If the derived reckoning rests on the standard time reckoning, the units appear in singular and plural; with self-defined calendars the names stand as they were entered there.

### Picker

The picker of a derived time reckoning shows the grid of its reference: you choose an ordinary date, and the count is inserted. **«To anchor»** jumps to the zero point.

### Changes to the reference time reckoning

A value is a coordinate of its time reckoning. If the reference changes, the values of its derived reckonings shift with it. The editor points out existing derived reckonings permanently and asks for confirmation when applying; a time reckoning with derived ones cannot be deleted while they exist.
