---
title: Dashboards
tags: [demo, data]
chapter: 17
topic: data
---

# Dashboards

A `perspective-dashboard` block arranges **tiles** in rows. Every tile runs a query and shows its result as a key figure, a list, a table or a chart, or it carries text of its own; the selection fields at the top narrow every tile that asks for them, all at once. Nothing is kept anywhere else: the whole dashboard is plain text in this page. Back to [[00 Welcome]].

## The dashboard below

```perspective-dashboard
%% The tour at a glance. Change the two fields at the top and watch the tiles follow. %%
!filter topic titel="Topic"
!filter state titel="Task state" vorbelegung=TODO
TODO
IN_PROGRESS
DONE

!zeile
!kachel kennzahl titel="Tour pages" breite=viertel
LIST FROM #demo WHERE chapter >= 0 AND topic = $topic
!kachel kennzahl titel="Tasks" breite=viertel
LIST TASKS WHERE status.type = $state
!kachel kreis titel="Tour pages per topic" breite=halb
TABLE count() AS "Pages" FROM #demo WHERE chapter >= 0 GROUP BY topic

!zeile
!kachel tabelle titel="Pages of the topic" breite=8/12
TABLE chapter AS "Ch.", title AS "Title" FROM #demo WHERE chapter >= 0 AND topic = $topic SORT chapter
!kachel text
**How to read it.** Each tile is a query like those in [[08 Queries]]. The pie chart does not ask for the topic, so it stays as it is when the topic changes.

!zeile
!kachel tabelle titel="Long books" abfrage="Long Books"
```

Set **Topic** to `planning`: the first key figure and the table follow, the pie chart stays. **Task state** starts at `TODO`, the value the block gives it, and counts the checkboxes of the whole area; most of them sit in [[06 Tasks and Reminders]]. Both fields also offer the entry that stands for every value. The choice lasts while this page is open and is never written into the file.

## How it is written

Switch to source view to see the block. Every element starts with a line in column 0 that begins with `!`; the lines below it, up to the next such line, are its content. The words of the block are German, like those of a canvas.

- `!filter topic titel="Topic"` makes a selection field. Without values of its own it offers what the property `topic` holds across the area. The field **Task state** lists its values on the lines below instead, and `vorbelegung=TODO` sets the value it starts with.
- `!zeile` starts a new row. The tiles before the first one form a row of their own.
- `!kachel kennzahl` makes a tile. Its kind comes first: `kennzahl` (key figure), `liste` (list), `tabelle` (table), `balken` (bars), `kreis` (pie) or `text`. `titel=` sets the title above it.
- `breite=` sets the width: `ganz` (all of it), `halb` (half), `drittel` (a third), `viertel` (a quarter) or twelfths such as `8/12`. A tile without it shares what is left of its row, which is why the text tile takes the last four twelfths and the last tile takes a whole row.
- `$topic` in a query stands for the current choice of the field named `topic`. When the field stands on every value, the condition with it simply drops out.
- `abfrage="Long Books"` runs the query of a query file instead of a query of its own, here [[Long Books]]. Its `this.minpages` still reads the frontmatter of that file.
- A line that begins and ends with `%%` is a comment and appears nowhere.

The command **Insert dashboard** in the command palette and in the editor context menu puts an empty skeleton at the cursor. Dashboards are an extension of the working mode **Advanced** and can be switched under **Settings → Extensions**; the manual page **Dashboards** explains every word of the block.

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:
