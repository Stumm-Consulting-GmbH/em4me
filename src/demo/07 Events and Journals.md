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

Use the toggle above the block to switch between table, dashboard, month, week and timeline. Add and edit rows straight in the grid (Split or Live view).

## Journals

Journals are periodic documents — a daily, weekly or monthly note series. They are set up per area under **Settings → Journals** (granularity, folder pattern, name pattern), so they cannot ship as a plain file. Once configured, open today's entry via **File → Today's Journal Entry** or the calendar panel in the status bar.

A journal entry usually embeds a navigation block:

```perspective-journal-nav
```

Outside a journal it shows a short hint (as it does right above); inside one it links to the previous, next and parent periods.

Turn all these dates into overviews on [[08 Queries]].
