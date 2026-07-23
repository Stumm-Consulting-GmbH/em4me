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

- **Today's Journal Entry** (File menu): opens or creates today's entry of a daily journal; with a picker if several daily journals exist.
- **Journal Entry for Date…** (File menu): asks for a date (YYYY-MM-DD) and the journal; the period is that of the date in the journal's granularity.

Creation produces the folder chain, the filled template content (an empty entry without a template) and the date properties in the frontmatter: daily journals get the date (`journal-date`), multi-day periods start and end (`journal-start-date`, `journal-end-date`); the field names are configurable per journal and are available to the Perspective query. Date placeholders of the template are evaluated at the period start — `{{date}}` yields the period date in the entry, not the creation time. Cancelling any template dialog aborts the creation; no file is created.

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

Inside a journal entry it shows the current period prominently (with an extra line such as "This week" for the current period), above it the parent periods of the same shelf (month, quarter, year — where a journal exists; gaps are skipped) and arrows to the previous and next period. Clicks open the entries and create missing ones; navigation stops at the journal's date bounds. Right here on the manual page the same block shows the hint for documents outside a journal:

```perspective-journal-nav
```

In the PDF and portable export the block is replaced by the static period label without creation links.

## Week rules

Weeks strictly follow ISO 8601: the week starts on Monday, and the first calendar week of a year is the week containing the first Thursday. The week-based year (`kkkk`) can therefore differ from the calendar year (`yyyy`) at the turn of the year — 1 January 2021, for example, belongs to week 53 of week-based year 2020.
