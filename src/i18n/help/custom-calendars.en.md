# Calendar systems

Freely definable time reckonings for fantasy worlds and special use cases: every area can keep its own calendar blocks, whose calendars may be built completely differently from the familiar standard calendar — with their own month lengths, leap rules, week cycles and epochs. The feature belongs to the "Calendar systems" extension and applies only in the area context: without an open area, the settings section and the insert command are inactive.

## Concept

### Blocks

A block is a self-contained time world with a name and any number of calendars. Calendars of the same block run in parallel, can be mapped to one another and converted into each other. Different blocks deliberately have nothing to do with one another — between them there is neither conversion nor comparability.

### Calendars and levels

A calendar consists of an ordered list of levels, smallest first (for example second → minute → hour → day → month → year), grouped into named level groups (in the standard template "Time" and "Date"). Each level describes its relationship to the next-smaller one with one of five relation types:

- **Fixed factor** — a fixed number of smaller units, for example 60 seconds per minute.
- **Length table** — units with individual lengths, for example three months with 30, 30 and 35 days; the row names of the table are at the same time the position names (month names). A leap rule above it can run through the table several times per instance: two passes over twelve rows give a year with 24 months.
- **Leap rule** — determines the leap years either **by divisibility**, with cycle rules along the pattern "leap every 4, except every 100, except every 400", or **by pattern**: a cycle length in years and the positions of the leap years within it, counted from 1 — for example 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 in a cycle of 30 years. In both cases the extended unit and the extension belong to it.
- **Independent cycle** — the week pattern: a cycle of fixed length runs across month and year boundaries, anchored to a reference date, optionally with a numbering rule (the cycle number follows the year in which the decisive day of the cycle falls).
- **Grouping** — a purely computational aggregation, for example quarters of three months each.

Position names apply position by position, at a level as well as at a cycle or a grouping. Where the number of positions is fixed, for example twelve months per year, seven days per week or four quarters, the program takes exactly that many names: surplus names are dropped when the definition is read in, missing ones leave the positions after them unnamed. An empty name is allowed too and leaves only its own position unnamed. An unnamed position of a level shows its number in the value, for example 05 for the fifth month.

### Epochs

Every calendar has exactly one open past epoch (it counts backwards), any number of closed intermediate epochs and one open future epoch. The boundaries join seamlessly and lie on a date without a time component; year counting starts at 1 in each epoch, there is no year 0. An epoch boundary may fall in the middle of the year — year 1 of the new epoch is then a partial year.

### Conversion via the block axis

Every block has a neutral time axis. Every calendar is mapped onto this axis via an anchor (the calendar point in time that lies on the axis zero point) and a scale (the duration of its smallest unit in axis units, as a fraction of numerator and denominator). Conversions between calendars always run via the block axis and round deterministically down to the smallest level of the target calendar; the command «Convert date» shows the result (section of the same name).

Two time reckonings of a block for which neither anchor nor scale is given start at the same point on the block axis; conversions between them are then only correct if that is what you intend. So that this does not go unnoticed when creating one, the settings show a note in the group «Block axis (conversion)» below the scale fields as long as the anchor point in time, numerator and denominator of a time reckoning are empty and the block contains another time reckoning; the note names the first other time reckoning of the block. It disappears as soon as one of the fields is filled in. If you mean a different position, set the anchor. A time reckoning inserted from a template shows no note, because the template brings its position on the axis with it.

## Maintenance in the settings

The settings section "Calendar systems" shows the blocks of the open area in two stages: the overview manages the blocks (add, rename, open, remove), the detail view of a block shows its calendars as forms with editors for levels, epochs, cycles, groupings and the block axis.

- The drop-down menu **«Insert template …»** creates a fully filled-in time reckoning from the bundled templates (section «Bundled templates»). To start without a template, **«Add calendar»** creates an empty time reckoning.
- **Plural:** next to the name of every level there is the field «Plural», likewise at the cycle («Cycle name (plural)») and at every grouping («Grouping name (plural)»). A span shows the singular for exactly one unit and the plural otherwise, for example «1 month, 2 weeks, 4 days»; without a plural the singular always applies.
- **«Always write the epoch abbreviation»:** the checkbox at the end of the «Epochs» group writes the abbreviation into the value in the latest epoch as well. This is useful if further epochs are added later: values already saved then keep their meaning. A value of the latest epoch means the same day with and without the abbreviation. What happens to values without an abbreviation when an epoch is added later is described in the section «Adding an epoch later».
- **«Passes of the length table per instance»:** if a length table lies below a leap rule, this field at the leap rule determines how often the table is run through in one instance; the default is 1. The note next to it gives the units per instance, that is passes times rows. Adding or removing a row keeps the passes, and the number of units follows. The names of positions beyond the rows (with two passes over twelve rows, months 13 to 24) are not shown in the table; they are kept from the saved definition, and a row created with «Add entry» takes over the name of its position. An empty name field leaves the position unnamed.
- **Position names of a cycle:** the field takes one name per line; a comma is part of the name, as in «Mon, early». An empty line in the middle of the list leaves the position at that point unnamed; the names after it keep their positions. In the picker grid, an unnamed position shows its number as the column header, as an unnamed position of a level does.
- The **live preview** shows a freely chosen example value canonically and with names; as long as a definition is incomplete, the editor reports it as a hint (soft validation), only applying checks strictly.
- The definitions are stored in the area file (file `Area_Settings.mdda`) and apply to all windows of the area.

Editing is deliberately never locked: structural changes to calendars already in use are allowed. Values in the document that become invalid as a result are preserved unchanged and are visibly marked. Only saving an invalid definition is blocked: when applying, a message appears and nothing is saved. If, for example, the extended unit of a leap rule is not within the units per instance, the leap rule reports this while you type and names the permitted positions.

### Adding an epoch later

A value of the latest epoch stands in the document without an abbreviation, and a value without an abbreviation is always read as a value of the latest epoch. When a time reckoning gets a new latest epoch, saved values of the previously latest one would therefore denote a different day or become invalid. If the area contains such values, the application asks on applying, before it saves, and states their number:

- **«Secure values and apply»** saves the change and rewrites every affected value so that it denotes the same day as before. A value before the start of the new epoch gets the abbreviation of the previous one: `@{Calendar name: 30-06-01}` becomes `@{Calendar name: 30-06-01 AZ}`. A value from the start of the new epoch onward gets its year number: if it starts in year 31 of the previous one, `@{Calendar name: 32-01-15}` becomes `@{Calendar name: 2-01-15}`. This also applies to a value that already carries the abbreviation of the previous epoch and would otherwise become invalid.
- **«Apply without securing»** saves the change and leaves the values as they are.
- **«Cancel»** leaves settings and documents unchanged.

Every text position with an affected value is secured, in the Markdown documents of the area and in the document notes, including canvas cards, Kanban boards and code sections. Before changing a document, the application stores its previous state in the document history; an open document with unsaved changes receives the change in its unsaved state and is secured only once it is saved; the report marks it. Document notes have no history.

At the end, a report states the number of secured values per document and, separately, the documents that could not be changed: split documents, documents open with unsaved changes in another window, and documents that changed since the count. There the values have to be corrected by hand. Earlier states in the document history remain as they were saved.

In a very large area whose text the area search does not keep available, the application can neither count nor secure the values; the prompt says so and offers only «Apply» and «Cancel».

If further epochs are to be expected from the outset, switch on «Always write the epoch abbreviation»: every new value then carries its abbreviation, and only values from the start of the new epoch onward remain to be secured.

## Bundled templates

The drop-down menu **«Insert template …»** in the detail view of a block offers the bundled calendars in this order:

1. Gregorian calendar
2. Julian calendar
3. Hijri calendar (tabular)
4. Hijri calendar (Umm al-Qura)
5. Persian calendar
6. Hebrew calendar
7. Chinese calendar
8. Indian National Calendar
9. Buddhist calendar
10. Ethiopic calendar
11. Coptic calendar
12. Japanese calendar
13. Minguo calendar

The selection creates the time reckoning in the open block straight away, fully filled in and without further input; afterwards the menu returns to its first entry. The time reckoning carries the name from the menu; if that name is already taken in the area, it gets an appended number, for example «Gregorian calendar 2». Like every change in this section, it is saved with **«Apply»**.

Every template brings the time levels second, minute and hour, a seven-day week and singular and plural for its units. The Gregorian calendar in addition shows all relation types in one definition: twelve months, leap rule, week cycle, quarters and half-years. All templates lie on the same day axis: time reckonings created from templates convert into one another within the same block without further input.

### What a created template is

A created template is an ordinary time reckoning of the area. Afterwards it can be edited, renamed, extended and deleted like any other; the template is the starting point, not a permanent tie. A program update therefore does not reach a time reckoning that has already been created. The exception is month and year of the four templates with a structure that varies by year (next section): there the time reckoning refers to the bundled rule or table instead of copying it, and a program update with an updated table also reaches time reckonings that have already been created.

The other date functions of the application remain Gregorian: task markers, journals, query comparisons and datatable types know no time reckonings of their own.

### Templates with a structure that varies by year

In the Hebrew, the Persian and the Chinese calendar and in the Hijri calendar according to Umm al-Qura, every year is composed differently: the number of months, the length of each month and the start of the year are determined year by year. The Hebrew calendar follows its fixed calculation rule and applies without a time limit. The other three follow a bundled, verified table and apply for a fixed period:

| Template | First day | Last day |
|---|---|---|
| Hijri calendar (Umm al-Qura) | 30 April 1900 (1 Muharram 1318 AH) | 16 November 2077 (30 Dhuʻl-Hijjah 1500 AH) |
| Persian calendar | 21 March 1900 (1 Farvardin 1279 AP) | 20 March 2101 (29 Esfand 1479 AP) |
| Chinese calendar | 19 February 1901 (first day of the year 1901) | 28 January 2101 (last day of the year 2100) |

Before and after that, the program says «not known» instead of showing an approximate date: in the picker, for a value in the document and in the dialog «Convert date». The tables are part of the program; no internet connection is needed for them. They are updated before their period runs out and after a correction by the responsible authority.

- **Leap months** are months of their own. In a value, every month keeps its number in every year; a leap month carries the number of the month it follows and an appended `L`. Adar I of the Hebrew year 5784 thus appears in the document as `5784-05L-01`, Adar II as `5784-06-01`, and the leap month of the Chinese year 2023 as `2023-02L-01`. A stored value therefore means the same month in every year.
- **In the settings**, month and year of these time reckonings are read-only; names, weeks and eras remain editable. They cannot be chosen as the reference of a derived time reckoning (section «Derived time reckonings»).
- **The day** begins at midnight, as with all templates; the program does not model the start of the day at sunset in the Hebrew and the Islamic calendar.

### Readings and limits

- **Hijri calendar (tabular)** — follows the tabular reading: twelve months alternating between 30 and 29 days, in a leap year the twelfth month (Dhuʻl-Hijjah) has 30 days; leap years are the years 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 and 29 of every cycle of 30 years, counted from the civil epoch. This calculation applies equally to every year. The date observed in religious practice, by contrast, follows the sighting of the crescent moon and may differ by one day, rarely by two. Days begin at midnight, not at sunset.
- **Hijri calendar (Umm al-Qura)** — the official calendar of Saudi Arabia for administrative purposes. The months begin according to the data of the Saudi authority KACST (King Abdulaziz City for Science and Technology), not according to a fixed calculation rule; each month has 29 or 30 days, the year 354 or 355. Month names and the year count «AH» are those of the tabular reading, which calculates with a fixed sequence and may differ from the official calendar by one or two days. The table has been checked month by month against the official edition of the authority; it ends with the year 1500 AH because the official edition reaches no further. Dates before 1423 AH (before 15 March 2002) are today's official back-calculation; the calendar in force in Saudi Arabia at the time followed other rules and could differ by one day.
- **Persian calendar** — the official Iranian reading: the year begins on the day of the spring equinox if it falls before noon Tehran time, otherwise on the day after. The first six months have 31 days, the next five 30, the last one (Esfand) 29, or 30 in a leap year; years are counted «AP». The table has been checked against the leap year table of the Calendar Center of the University of Tehran.
- **Hebrew calendar** — calculates according to the fixed rule of the calendar, even in very distant years. In 7 out of 19 years, Adar I is added as an extra month, and Adar is then called Adar II. Years are counted «AM»; before year 1, the epoch «before AM» counts backwards. From 10 November 2045 to 29 November 2046 the program follows the calculation rule; some other programs show a date shifted by one day for these days.
- **Chinese calendar** — the traditional lunisolar calendar. The year number is the Gregorian year in which the Chinese year begins: `2025-01-01` is 29 January 2025, and the year 2026 ends on 5 February 2027. The template does not show the name of the year in the cycle of 60 years. The months are called «Month 1» to «Month 12», a leap month «Leap month» with the number of the month it follows, shown with names for example as `2023-Leap month 2-01`; as with every template, the names can be changed. The table is an astronomical calculation of the new moons and solar terms in Beijing time, checked against the official calendar files of the Hong Kong government for 2023 to 2028 and over the whole period against a second, independent calculation. The 9th month of 2057 begins on 28 September, as in the table of the Hong Kong Observatory; the authority itself marks this day as uncertain because the new moon falls only seconds before midnight. Other programs may differ on individual days, for example for the New Year 2027, which officially falls on 6 February.
- **Buddhist calendar** — the Buddhist year count as used in Thailand: Gregorian months and leap years, with the year number 543 higher than the Gregorian one. Until 1940 the Thai year began on 1 April; the template consistently counts with the year starting on 1 January and therefore shows, before 1941, a year one higher than in the usage of the time from January to March, and the same year from April.
- **Indian National Calendar** and **Minguo calendar** — both also count backwards before their introduction (Indian National Calendar 1957, Minguo calendar 1912). For that period the sources do not attest them as valid; before 1912 the sources often give month and day according to the lunar calendar.
- **Japanese calendar** — Gregorian months and leap years with the eras Meiji (from 23 October 1868), Taishō (from 30 July 1912), Shōwa (from 25 December 1926), Heisei (from 8 January 1989) and Reiwa (from 1 May 2019); year 1 of an era runs from its start to 31 December. Before that, the epoch «before Meiji» counts backwards; older eras are missing because they are based on the lunar calendar. Before 1873 Japan used the lunar calendar: dates before 1873 are therefore Gregorian dates calculated backwards and differ from historical usage in month and day, sometimes also in the year. The template always writes the era (checkbox «Always write the epoch abbreviation» switched on): 30 September 2026 appears in the document as `8-09-30 Reiwa`.

### Adding a new Japanese era

When a new era begins in Japan, the next program version after its announcement adds it to the «Japanese calendar» template. A time reckoning that has already been created is not reached by this; there the era is added by hand:

1. In the settings, go to the «Calendar systems» section and open the block with **«Open»**.
2. In the Japanese time reckoning, under «Epochs», choose **«Add epoch»**.
3. In the new, last epoch, enter the name of the era under both **«Name»** and **«Abbreviation»**, and under **«Start»** its first day according to the Gregorian calendar.
4. Choose **«Apply»**.

Because the template always writes the era abbreviation, values already saved before the start of the new era keep their meaning: `8-09-30 Reiwa` remains 30 September 2026. A value from the start of the new era onward that is still counted in the previous one would become invalid; the application asks on applying and, if desired, converts it to the year count of the new era (section «Adding an epoch later»).

## Values in the document

A calendar value appears in canonical form in the source text:

```text
@{Calendar name: Year-Month-Day}
@{Calendar name: Year-Month-Day Epoch abbreviation}
@{Calendar name: Year-Month-Day Hour:Minute:Second}
```

The first colon separates the calendar name from the value. The date segments run from large to small; the epoch abbreviation is omitted in the most recent epoch unless «Always write the epoch abbreviation» is switched on for the time reckoning, the time part is omitted when all time segments are at their minimum. In the rendered view, live mode and portable export, the value appears as a badge with the names from the definition (for example month names and epoch abbreviation).

If the named calendar is not defined in the area or the value is invalid, the source text stays unchanged and the value is visibly marked — like this example, whose calendar does not exist on this manual page:

@{Example calendar: 500-2-09 ZZ}

If a value lies outside the validity period of its time reckoning (section «Templates with a structure that varies by year»), the source text likewise stays unchanged. The value then does not count as invalid: its tooltip says «Name: not known».

In code blocks and code spans the syntax stays untouched: `@{Example calendar: 500-2-09 ZZ}`.

## Inserting and editing

- **Inserting:** the command "Insert calendar date" (command palette; a shortcut can be assigned) opens the picker and inserts the chosen point in time canonically at the cursor. It is active as soon as the open area defines at least one calendar.
- **Editing:** values are clickable in source and live mode; the click opens the picker pre-filled with the value, committing replaces it in place in a single undo step. On the line holding the cursor, **Ctrl-click** opens the picker while a plain click places the cursor there.

## Picker

The picker for custom calendars works analogously to the standard date picker:

- Header selections for **block**, **calendar** and **epoch** (selections with only one entry are omitted). A calendar change converts the chosen point in time; a block change jumps to the anchor of the target calendar.
- The **grid** arises from the level structure: with a defined week cycle as a column grid (cycle length = number of columns, position names as header, number column with a numbering rule), without a cycle as a continuous day list of the unit.
- **Navigation:** the outer arrow buttons move the largest unit (the year), the inner ones the grid unit (the month); arrow keys navigate day by day, Enter commits, Escape cancels. **"To anchor"** jumps to the reference point in time of the calendar.
- **Time levels** appear as individually settable segments with arrow and digit input — invalid values cannot be entered by design.
- **Validity period:** For a time reckoning with a table, paging stops at the edge of its period. Opened on a value outside it, the picker stands on its first known day and states «Name: not known». A leap month appears in the header with name and code, for example «Leap month 2 (02L)».

### Conversion display

Below the grid the picker shows the chosen point in time in all parallel calendars of the block. A click on an equivalent switches the active calendar there. Calendars of different blocks are deliberately not convertible.

## Convert date

The command «Convert date» shows which point in time in the other calendars of a block a date corresponds to. It is available in the command palette and in the editor context menu; a shortcut can be assigned under File → Settings… → Keyboard shortcuts. It is active as soon as the open area defines at least one calendar, including in the reading view.

The dialog offers the selections **«Block»** (only with several blocks) and **«Calendar»**, the field **«Date»** for a value in canonical notation without the calendar name (section «Values in the document») and the button **«Choose …»**, which opens the picker. Below it, the list **«Corresponds to»** shows one row «Name: value» for every other calendar of the block. A click or Enter on a row makes its calendar the starting point; this way conversion works in every direction. The dialog is pre-filled from the selection in the text: if it touches a calendar value or the cursor is inside one, with that value's calendar and value. If single-line text without a calendar value is selected, it counts as a value in canonical notation in the first calendar of the area in which it is valid; if it is valid in none, it appears in the first calendar with the message «Not a valid date in this calendar.». Other notations such as «3.10.2026» are not interpreted.

Every row with a result carries the buttons **«Copy»** and **«Insert»**; both take over the equivalent as a calendar value with its name, `@{Name: value}`, just as «Insert calendar date» writes it. «Copy» puts it on the clipboard; the dialog stays open, and the button briefly shows «Copied». «Insert» writes it into the document in a single undo step and closes the dialog: a selection is replaced, and if the cursor sits inside a calendar value without a selection, the equivalent goes after it. This is only possible when the dialog was opened from a document in edit mode; otherwise the button is disabled and its tooltip gives the reason. «Copy» always works. On its own the dialog changes nothing in the document; only «Insert» writes. This is how a date is replaced by its equivalent: select the whole calendar value or a date as text, call «Convert date» and choose «Insert» on the desired row.

Where there is no result, a notice appears instead of a value:

- A date that does not exist in the chosen calendar is reported as «Not a valid date in this calendar.»; the list is then omitted.
- If a calendar cannot represent the point in time, its row reads «Name: outside the representable range».
- If the point in time lies outside the validity period of a time reckoning (section «Templates with a structure that varies by year»), its row reads «Name: not known»; the other rows show their value. If the entered date itself lies outside, the dialog reports «Name: not known».
- If the block has only one calendar, the dialog says that a second one is missing.

Conversion only happens within one block; the notice line of the dialog points this out. Calendars that should be converted into one another therefore belong in the same block. A time reckoning cannot be moved to another block: create it anew in the target block or insert it there as a template. The result is as good as the anchor and scale of the calendars involved: the bundled templates lie on the same day axis by themselves; for calendars you define yourself, the group «Block axis (conversion)» in the settings sets their position.

## Derived time reckonings

A derived time reckoning counts from a zero point of your own: how long it is until a date, or how long ago something happened. It needs no definition of its own, only a reference time reckoning and a zero point.

### Creating one

In the settings section «Calendar systems», the button **«Add derived time reckoning»** creates a short form:

- **Reference time reckoning** — a calendar of the same block or the built-in standard time reckoning. Counting down to a date therefore needs no calendar of your own. Time reckonings with a structure that varies by year cannot be chosen as the reference, because their counting cannot be shifted; counting from a given day works through the Gregorian time reckoning of the same block.
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

What is displayed is the span in the chosen depth, without parts of length zero, for example «1 month, 2 weeks, 4 days». The tooltip additionally names the canonical value and the corresponding point of the reference time reckoning. If the derived reckoning rests on the standard time reckoning, the units appear in singular and plural; with self-defined calendars the «Plural» field of the unit applies, and without a plural the singular always stands.

### Picker

The picker of a derived time reckoning shows the grid of its reference: you choose an ordinary date, and the count is inserted. **«To anchor»** jumps to the zero point.

### Changes to the reference time reckoning

A value is a coordinate of its time reckoning. If the reference changes, the values of its derived reckonings shift with it. The editor points out existing derived reckonings permanently and asks for confirmation when applying; a time reckoning with derived ones cannot be deleted while they exist. Pure naming — names and plurals of levels, cycles and groupings as well as month and weekday names — shifts no value and requires no confirmation.
