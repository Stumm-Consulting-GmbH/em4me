---
title: Kanban
tags: [demo, planning]
chapter: 13
topic: planning
kanban-plugin: board
---

The last stop is a board. This page is an ordinary Markdown file: every heading below is a column, every checkbox line under it a card, and the indented lines are what a card shows underneath its text. Press `Ctrl+7` (View → Board) to see it as a board, switch on edit mode with `Ctrl+E`, then drag a card from one column into the next — the line moves in this very file. Back to [[00 Welcome]].

This page carries no title heading on purpose: a heading would be read as one more column. What makes the file a board is the `kanban-plugin` entry in its frontmatter — switch to source view and look at the very first lines.

The cards carry more than their text. Due dates show as badges below it; right-click a card and choose Set date… to pick another one, and View → Kanban board → Show dates as relative reads them from today. View → Kanban board → Tags in card footer moves the tags to the foot of the card. The column In progress allows two cards and holds three, so its counter lights up — without blocking anything. `Ctrl+F` on the board filters the cards, `Escape` ends the filter. Right-click a card and choose Archive card to move it with a timestamp into the archive section below the line at the end of this file.

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:

## To do

- [ ] Read this page in source view
  Everything the board shows is right there in the text. Nothing is stored beside it.
- [ ] Drag this card into the next column
  The drag rewrites one line of this file, and `Ctrl+Z` takes the whole move back in one step.
- [ ] Water the plants 🔁 every week 📅 2099-04-05
  A recurring task. Drop it into Done and the next instance appears right here, where the work is still open.
- [ ] Call the print shop 📅 2099-04-07 10:30
  A due date with a time, written as an ordinary task marker. Click the date badge to change it.
- [ ] Sort the holiday photos #planning
  A tag in the card text. Switch on Tags in card footer and it moves to the foot of the card.


## In progress (2)

- [/] Rename a column
  Double-click a column title, or reach for its context menu. The limit in brackets stays where it is.
- [ ] Add a column of your own
  The button at the end of the strip creates one; leave the title empty and nothing is created.
- [ ] Set a limit of your own
  Right-click a column head and choose Set limit… — this column allows two cards and holds three.


## Done

**Complete**

- [x] Open the board for the first time


***

## Archive

- [x] 2026-09-01 09:15 Sketch the first board
