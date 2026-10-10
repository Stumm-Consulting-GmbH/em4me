---
title: Calendar Systems
tags: [demo, planning]
chapter: 14
topic: planning
---

# Calendar Systems

A calendar system is a way of counting days: where the year begins, how the months run, how the years are numbered. The calendar on the wall is one of them; others count the very same days differently. An area can keep several of them side by side, grouped into **blocks**, and every calendar in a block describes the same days — so a value written in one of them can be read in all the others. Back to [[00 Welcome]].

## Two calendars, one day

A value sits in the text as `@{name of the calendar: value}`: the name says which calendar it belongs to, and the value is always written the same way, largest unit first. This demo area keeps one block, `Demo calendars`, with two calendars made from the bundled templates: the Gregorian calendar and the Japanese calendar. This is what the values below look like in the source:

```markdown
- @{Gregorian calendar: 2026-09-30} is @{Japanese calendar: 8-09-30 Reiwa}
- @{Gregorian calendar: 2019-05-01} is @{Japanese calendar: 1-05-01 Reiwa}
- @{Gregorian calendar: 2019-04-30} is @{Japanese calendar: 31-04-30 Heisei}
```

Rendered, each value shows as a badge with the month spelt out; hover it to see its calendar and the value as it is stored.

- @{Gregorian calendar: 2026-09-30} is @{Japanese calendar: 8-09-30 Reiwa} — the eighth year of the Reiwa era.
- @{Gregorian calendar: 2019-05-01} is @{Japanese calendar: 1-05-01 Reiwa} — the first day of Reiwa.
- @{Gregorian calendar: 2019-04-30} is @{Japanese calendar: 31-04-30 Heisei} — the last day of the era before it.

The Japanese calendar counts its years within an era and always writes the era along, so a stored value keeps its meaning when a new era is added one day.

## The same day in the other calendar

Switch to the live view with `Ctrl+4` and turn on edit mode with `Ctrl+E`, then click one of the values above — on the line with the cursor, hold `Ctrl` while clicking. The calendar picker opens on that day. Further down in the picker, under **Equivalents in the block**, it shows the same day in the other calendar: the first Gregorian value appears there as `Japanese calendar: 8-09-30 Reiwa`, the Japanese one next to it as `Gregorian calendar: 2026-09-30`. A click on that line moves the picker into the other calendar; **Cancel** closes it and leaves the value as it is.

Without the picker, **Convert date** from the command palette or the right-click menu shows a date in every other calendar of the block — the value at the cursor or a selected date. **Copy** puts an equivalent on the clipboard; **Insert** writes it into the page, in place of a selected date.

To write a value of your own, choose **Insert calendar date** from the command palette (`Ctrl+K`).

## More calendars from the templates

The calendars are kept with the area, under **File → Settings… → Current area → Calendar systems**. Open the block `Demo calendars` with **Open**, pick a calendar from the menu **Insert template …** and save with **Apply** or **OK**. Nine calendars are bundled, in the order of the menu:

1. Gregorian calendar
2. Julian calendar
3. Hijri calendar (tabular)
4. Indian National Calendar
5. Buddhist calendar
6. Ethiopic calendar
7. Coptic calendar
8. Japanese calendar
9. Minguo calendar

Each one arrives fully filled in under its own name — the name a value then starts with — and converts into the other calendars of the same block straight away. What comes from a template is an ordinary definition of the area: rename it, change it, or build one of your own with **Add calendar**.

## When the calendars are missing

Calendar systems belong to the **Full** working mode. In Beginner and Advanced mode they are switched off: the values on this page then stay plain text, exactly as written, and the settings section is not shown — the calendars kept with the area stay untouched all the same. Turn them on under **Settings → Extensions** with the switch **Calendar systems**, or choose the working mode Full there.

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:
