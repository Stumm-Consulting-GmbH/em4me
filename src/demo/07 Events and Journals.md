---
title: Events and Journals
tags: [demo, planning]
chapter: 7
topic: planning
---

# Events and journals

Two ways to keep dates: an event table inside the document, and periodic journal entries across the area. Back to [[00 Welcome]].

## Event widget

A `perspective-events` block turns rows into a table with category badges and a live countdown to each date. Each row carries nine cells: date, end, text, category, notes, yearly (`x`), and three link cells.

```perspective-events
| 2020-06-01 | | App project kickoff | projekt | First commit | | | | |
| 2099-07-20 | | Team workshop | termin | | | | | |
| 2099-08-30 | | Summer party | jahrestag | Every year since 2020 | x | | | |
```

Use the toggle above the block to switch between table, dashboard, month, week, timeline and Gantt. Add and edit rows straight in the grid (Split or Live view).

## Gantt view

Rows with a start and an end become bars on a shared time axis, rows without an end become diamonds. The last two cells chain the entries as predecessor and successor, drawn as a dashed line.

```perspective-events
view: gantt
| 2099-03-02 | 2099-04-17 | Concept phase | projekt | | | e1 | | e2 |
| 2099-04-20 | 2099-06-12 | Implementation | projekt | | | e2 | e1 | |
| 2099-06-19 | | Handover | termin | | | | | |
```

## Journals

Journals are periodic documents — a daily, weekly or monthly note series. They are set up per area under **Settings → Journals** (granularity, folder pattern, name pattern), so they cannot ship as a plain file. Once configured, open today's entry via **File → Today's Journal Entry** or the calendar panel in the status bar.

A journal entry usually embeds a navigation block:

```perspective-journal-nav
```

Outside a journal it shows a short hint (as it does right above); inside one it links to the previous, next and parent periods.

The second journal block is the timeline: a period overview as a calendar, in four modes (`week`, `month`, `quarter` and `year`).

```perspective-journal-timeline
mode: month
```

Inside a journal entry this draws the month around the entry's period, with a week-number column, dots on days that already have an entry and today highlighted. Every cell opens its period and creates the entry if it is missing. Outside a journal it shows the same kind of hint as the navigation block.

Turn all these dates into overviews on [[08 Queries]].
