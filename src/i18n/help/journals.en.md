# Journals

Journals are series of periodic documents in an area: each journal has one **granularity** (day, week, month, quarter or year), a **folder pattern** and a **name pattern** built from date placeholders, an optional template and automatic date properties in the frontmatter. **Shelves** group several journals, for example day through year of a diary. Entries are opened or created on first access — via the commands, the calendar panel or the navigation block.

Journals only exist within an area: the configuration lives in the area file, all paths are relative to the area root. Without an area, commands and panel show a hint. The functionality is switchable as the "Journals" extension (Settings → Extensions).

## Defining journals and shelves

Settings → Journals shows the shelves of the area; "Open" on a shelf leads to its journals, "Close shelf" back to the overview (the "No shelf" row collects unassigned journals). Per journal:

- **Name** and optionally a **shelf**.
- **Granularity**: day, week, month, quarter or year.
- **Folder pattern** and **name pattern**: literals plus the date placeholders of the templates (`{{date::…}}`), evaluated at the period start. A live preview shows the example path of today's period.
- **Template** (optional) from the template folder; creation runs the full placeholder evaluation including dialogs.
- **Start/end date** (optional): no entries are created before or after, navigation stops there.
- **Field names** of the automatic date properties.

Example of a weekly journal with year subfolders:

| Field | Value |
| --- | --- |
| Granularity | Week |
| Folder pattern | `Diary/{{date::yyyy}}` |
| Name pattern | `{{date::kkkk-KWww}}` |

The entry for calendar week 28 of 2026 then lives at `Diary/2026/2026-KW28.md`. Two additional format tokens exist for calendar weeks: `ww` (ISO calendar week, two digits) and `kkkk` (week-based year, which can differ from the calendar year at the turn of the year); uppercase letters such as `KW` remain literal. For quarters the token `q` yields the quarter number (1–4), for example `{{date::yyyy-Qq}}` → `2026-Q3`.

A changed pattern does not rename existing files; calendar dots and entry detection follow the new pattern. Existing periodic files match automatically when folder and name pattern are configured identically to them.

## Opening and creating entries

- **Today's Journal Entry** (File menu → More File Functions): opens or creates today's entry of a daily journal; with a picker if several daily journals exist.
- **Journal Entry for Date…** (File menu → More File Functions): asks for a date (YYYY-MM-DD) and the journal; the period is that of the date in the journal's granularity.
- **Carry Over Open Tasks to the Current Journal Entry** (File menu → More File Functions): opens or creates the entry of the current period and carries the open tasks of the last entry over into it; see the section "Carrying over open tasks".

Creation produces the folder chain, the filled template content (an empty entry without a template) and the journal properties in the frontmatter. An entry carries **four** properties regardless of its granularity: the name of the journal (`journal`), the period date (`journal-date`), the period start (`journal-start-date`) and the period end (`journal-end-date`). The period date is always the **beginning** of the period, so for daily entries all three date values coincide. The field names are configurable per journal and are available to the Perspective query — because every entry carries the same set, a query does not have to distinguish by granularity. Date placeholders of the template are evaluated at the period start — `{{date}}` yields the period date in the entry, not the creation time. Cancelling any template dialog aborts the creation; no file is created.

An **existing** entry is completed when properties are missing — for instance because it comes from another application or was created by hand. This happens in two ways. When **opening** it via command, calendar or navigation block, missing properties are added silently; if the entry is already complete, the file is left untouched. The command **Add journal properties…** brings all existing entries of a journal to the same state at once; it states the number of entries checked beforehand and asks for confirmation.

Creating and completing behave deliberately differently: When **creating**, the application sets the properties and overrides fields of the same name from the template. When **completing**, only what is missing is added; an existing value stays, even if it deviates from the period — it may be a deliberate correction. Foreign fields and the remaining content are untouched in both cases, and a damaged frontmatter is left alone.

## Carrying over open tasks

The application carries the open tasks of the last existing entry of a journal over into the entry of the current period: for a daily journal into today's entry, for a weekly journal into the entry of the current week. This applies to journals of every granularity, even if the last entry lies days back. The source is always the most recent earlier entry of the same journal; entries in the future do not count.

**Settings.** In the editor of a journal under Settings → Journals, the group "Carry over open tasks" holds three settings:

- **Carry over automatically when the entry is created** (off by default): when the switch is on, tasks are carried over as soon as the entry of the current period is newly created, whichever way: via the commands, the calendar panel, the navigation or timeline block, or the date of a card on a Kanban board. Merely opening an existing entry, or creating an entry for another period, does nothing.
- **In the previous entry**: "mark as carried over" (default) sets the carried-over task there to the "Carried over" state (`- [»] …`, page [Task lists](tasks.md)); "remove" deletes it there.
- **Only from section** (empty by default): the text of a heading. If the field is filled in, only the tasks under this heading and its sub-headings are carried over; if it is empty, all open tasks of the entry.

**Command by hand.** **Carry Over Open Tasks to the Current Journal Entry** (File menu → More File Functions, also in the command palette) carries over into the entry of the current period at any time, even when the switch is off, and also into an entry that already exists; if the entry is missing, it is created. With several journals the command asks which one is meant. A second run carries nothing over twice, because the carried-over tasks are marked or removed in the previous entry.

**Where the tasks land.** Each task goes into the new entry under the heading it stood under in the previous one, at the end of that section. Same name means the same text, regardless of upper and lower case and of the heading level; if the heading occurs more than once in the new entry, the first one applies. If it is missing there, it is created together with the tasks at the end of the entry. Tasks that stood before the first heading in the previous entry go to the end of the new one. The order is kept.

**Sub-items.** A task moves with everything indented directly below it, up to the next blank line: open and done subtasks, their sub-items and note lines. Whatever continues indented after a blank line no longer belongs to it and stays in the previous entry. With "mark as carried over", every task line of the moved block is marked in the previous entry, including a done subtask; with "remove", the whole block is dropped. An open task below a done or cancelled one, with no open task above it, moves on its own and stands outdented in the new entry.

**What counts as open.** Tasks whose state is of type Open, In progress or On hold (page [Task lists](tasks.md), section "Custom states, type and follow-up symbol"); a box with a character for which no state is set up also counts as open. Done and cancelled tasks and lines of type Not a task stay where they are. A line marked "Carried over" is never carried over again, even if this state is switched off. Boxes in code blocks, quotes and tables are not tasks and stay put. A Global filter that is set applies here as well.

Example with "mark as carried over". The previous entry before:

```markdown
## Work
- [ ] Write the quote
  - [x] Get the figures
  - [ ] Draft the text
- [x] Check the invoice

## Personal
- [ ] Take the bike to the shop
```

The new entry, created from the template:

```markdown
## Work

## Personal
```

The new entry after the carry-over:

```markdown
## Work

- [ ] Write the quote
  - [x] Get the figures
  - [ ] Draft the text

## Personal

- [ ] Take the bike to the shop
```

The previous entry after the carry-over:

```markdown
## Work
- [»] Write the quote
  - [»] Get the figures
  - [»] Draft the text
- [x] Check the invoice

## Personal
- [»] Take the bike to the shop
```

With "remove", only the two headings and "Check the invoice" would remain in the previous entry afterwards.

**Details.**

- **Unsaved changes:** if the previous or the new entry has unsaved changes in any window, nothing is carried over, and the status bar names the entry. With the automatic carry-over the new entry is then created without the tasks; after saving, the command by hand catches up on the carry-over.
- **Switched-off functions:** if the "Tasks" extension is off, nothing is carried over, because then nothing counts as a task; the command says so in the status bar. If the "Journals" extension is off, the command and the settings are gone, and nothing is carried over.
- **Only the last entry:** the source is exactly the most recent earlier entry. Whatever stayed open in even older entries stays there.
- **Task already there:** if the template brings a task along every day and the same task is still open in the previous entry, it does not come into the new entry a second time; in the previous entry it is still marked or removed. This applies only if the line is identical character for character, stands under the same heading and has nothing below it in the previous entry. If it has gained sub-items there, it moves with them and then stands twice in the new entry.
- **Section not found:** if "Only from section" names a heading the previous entry does not have, nothing is carried over, and the status bar says so, also with the automatic carry-over.
- **Messages:** after a carry-over the status bar names the number of tasks and the entry they came from. That there is no earlier entry or no open task is reported only by the command by hand.
- **Numbered lists and empty headings:** a task from a numbered list keeps its number; nothing is renumbered. If a heading without content remains in the previous entry after "remove", it stays.
- **Limits:** at most 500 tasks per carry-over, entries up to 5 MB and at most 20,000 Markdown files in the folders of the journal; beyond that nothing is carried over, and the status bar says so.
- **Way back:** there is no dedicated undo command. Both entries get an entry in their [Document history](history.md) where it is switched on for the document; with "mark as carried over", a click on the box reopens the task in the previous entry.
- **No link:** the marked line in the previous entry gets no link to the new entry.

## Calendar panel

The calendar panel (status bar calendar symbol) shows the monthly view of the area:

- Weekday header with **Monday start**, the **ISO calendar-week column** on the left.
- **Dots** mark days with an existing daily entry; **today** is highlighted.
- Clicking a **day** opens or creates the daily entry, clicking the **week cell** the weekly entry; with several matching journals a picker appears.
- The header filter narrows down to **all journals**, one **shelf** or a **single journal**; arrows page through the months, the today button jumps back.

## Navigation block

The navigation block sits in the entry as a code block, typically via the journal template:

````markdown
```perspective-journal-nav
```
````

Inside a journal entry it shows the current period prominently (below it the temporal placement: “Today” or “This week” for the running period, otherwise its distance — “yesterday”, “3 weeks ago”, “in 2 years”, always in the unit of the period), above it the parent periods of the same shelf (month, quarter, year — where a journal exists; gaps are skipped) and arrows to the previous and next period. Clicks open the entries and create missing ones; navigation stops at the journal's date bounds. **The two arrows page within the same tab:** the previous entry gives way to the new one, and the tab keeps its view mode, edit mode, zoom, group and position. If it carries unsaved changes, the same prompt appears as when closing; if the neighbouring entry is already open, its tab is activated. The links to the parent periods, by contrast, open a tab of their own, because they change level instead of paging. **Each arrow carries the name of its target period next to it**, so you can see where it leads; when the block gets narrow that name gives way and the button stays. **A dot beneath a period means: this entry already exists** — the same marker as in the calendar panel and the timeline. It appears on every period of the block, including the parent ones and both neighbours; where it is missing, the click creates the entry. Right here on the manual page the same block shows the hint for documents outside a journal:

```perspective-journal-nav
```

Both journal blocks, this one and the timeline below, also check whether they refer to the entry currently shown. If they do not, or if the entry no longer exists, an error message replaces the display: a wrong period would not be recognizable as wrong and is therefore suppressed.

In the PDF and portable export the block is replaced by the static period label without creation links.

## Timeline block

The timeline block shows the period overview as a calendar inside the entry. It knows four modes:

````markdown
```perspective-journal-timeline
mode: month
```
````

| Mode | Display |
|---|---|
| `week` | the entry's week as a single row |
| `month` | one month calendar |
| `quarter` | three month calendars side by side |
| `year` | twelve month calendars as a year grid |

`calendar` is the equivalent spelling for `year` (it comes from imported material). Without a `mode` setting, `month` applies. An unknown value shows up as a note inside the block, so a typo does not go unnoticed.

**Layout.** The week-number column is on the left, the weekday header on top, starting on Monday. Days with an existing entry carry a dot, today is highlighted. The header line shows the periods above the calendar level, and the mode's own level is highlighted: week mode highlights the calendar week, month mode the month, quarter mode the quarter, year mode the year.

**Clicking.** Every element opens its period: the day opens the daily entry, the calendar week the weekly entry, the month name and the header labels their respective period. Missing entries are created along the way. What counts are the journals of the shelf the entry belongs to; where that shelf has no journal for a level, the label is display only. Outside a journal's date limits no entry is created.

Which period the block shows follows the entry it sits in, not today: inside the weekly note of a past week, `month` shows that week's month.

Like the navigation block, this block appears as a note outside a journal entry:

```perspective-journal-timeline
mode: week
```

The PDF export prints the calendar as it appears on screen. The portable export turns it into one table per month, with a dot on days that have an entry and without creation links.

## Week rules

Weeks strictly follow ISO 8601: the week starts on Monday, and the first calendar week of a year is the week containing the first Thursday. The week-based year (`kkkk`) can therefore differ from the calendar year (`yyyy`) at the turn of the year — 1 January 2021, for example, belongs to week 53 of week-based year 2020.
