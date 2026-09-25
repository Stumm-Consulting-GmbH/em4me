# Kanban board

A **Kanban board** arranges the tasks of **one** document in space: every named list of the document stands side by side as a **column**, every task line within it as a **card**. Dragging a card from one column into the next moves its line inside the document — the board is a working surface, not an evaluation.

The board is **another view of the same document** and not a file format of its own. Everything on it sits in the file as ordinary Markdown; the other views show the same headings and task lists as before, and switching between them never changes the text.

## How a board is recognised

By the **header marker** `kanban-plugin` in the header section of the document:

```markdown
---
kanban-plugin: board
---
```

What counts is the **presence** of the key, not its value: `board`, `list` or anything else — every document with this key is a board, and the value found there stays untouched. A document without the key is not a board, even if it carries headings and task lists.

## The “Kanban” extension

The feature belongs to the [internal extensions](extensions.md) (“Board view (Kanban)”). When it is switched off, the view mode goes away, the commands for card, column and board disappear, and with them the submenu **Kanban board** in the **View** menu, which does not stay behind empty. The document remains readable exactly as it was; nothing is ever written in the disabled state, and columns and cards stay in the text.

The board requires the **Tasks** extension, because a card **is** a task line. If that one is switched off, the board is too.

## Creating a board

Two ways, both in the menu **View → Kanban board** and in the command palette (default `Ctrl+K`):

| Way | Effect |
| --- | ------ |
| **New Kanban board** | creates a new, still unnamed document, fills it with a starter board and opens it straight away in the board view |
| **Turn empty document into Kanban board** | writes the same starter board into the open document |

**New Kanban board** is always available — it is the way to the first board and needs none itself.

**Turning a document** is available only for an **empty** document that is not already a board; otherwise the entry stays visible and dimmed. The reason is the safety of your files: a document with content would be overwritten. The entry follows along while you type — with the first character it loses its basis, with the last one deleted it gets it back. It also requires a changeable document; if one of the conditions is missing, the status bar says so instead of quietly doing nothing.

The starter board carries three columns — **To do**, **In progress** and **Done** — and the last one is set to mark cards dragged into it as done. The titles are in the language of the interface; they can be changed like any other column title.

## Opening the board view

The board is the seventh view mode, alongside Source, Split, Rendered, Live, Mind map and Canvas: **View → Board**, the button in the status bar or default `Ctrl+7`. As with the other modes the choice applies per open document, not to the whole application, and it is restored on the next start.

**The mode depends on the document.** It can be chosen only if the open document is a board — a board view without a board would show nothing but a notice. Without the header marker, button and menu entry stay **visible and dimmed**; the reason is given in the button's tooltip. The way in through keyboard shortcut and command palette then does nothing and does not throw you out of your current view either. As soon as the marker appears in the text or disappears from it, the access follows, and a document that was open in the board view when the app was closed and is no longer a board opens in the reading view. The [canvas surface](canvas.md) has the same property; the remaining five modes are available on every document.

## What the board shows

- **Columns** side by side, each with its title and the number of its cards; if the column carries a limit, the counter shows both, such as `2/3`. If they do not fit next to each other, the column strip scrolls horizontally; a long column scrolls vertically on its own.
- **Cards** below one another in the order of their lines in the document. The card text is **rendered**: links, tags, emphasis and images appear as they do in the reading view. Tags stand in the text where they are written, or optionally gathered at the card footer.
- **Indented follow-up lines** of a task appear as an addition on its card.
- The **details of the task** — due date and time, priority, recurrence and the other markers — stand as badges below the card text.
- The **state** of the task appears as a checkbox on the card, with the character that stands in the document — including a custom state character.
- A column that marks cards dragged into it as done carries a mark for that next to its card counter.

A board without columns and a column without cards say so in their place instead of showing an empty area. If part of the board cannot be read, a notice box stands above it with the line number and one sentence per finding; whatever could be read still appears below.

## Cards

| Action | Mouse | Keyboard | Context menu | Command |
| ------ | ----- | -------- | ------------ | ------- |
| Create | button **Add card** at the foot of the column | — | — | **Add card to board** |
| Select | click on the card | — | — | — |
| Edit | double-click on the card | `Enter` or `F2` | **Edit card** | — |
| Apply | click outside the card | `Enter` | — | — |
| Discard | — | `Escape` | — | — |
| Change state | click on the checkbox | `Space` | — | — |
| Set or change the date | click on the due-date badge | — | **Set date…** | — |
| Remove the date | — | — | **Remove date** | — |
| Archive | — | — | **Archive card** | **Archive card on board** |
| Delete | — | `Del` | **Delete card** | — |

**A new card can be typed on immediately** and appears at the foot of the column it was created in. If its text stays empty, no card is created — neither in the document nor as an undo step.

**What you edit is the raw card text**, in a single line. Whoever writes a card writes Markdown and should see it while doing so. The markers of the task line — due date, time, priority and recurrence — belong to the line and stay untouched while editing; so do indented follow-up lines. A due date in the notation of the other tool, by contrast, sits in the text and is rewritten when you apply (see “Details on the card”). Unchanged text writes nothing into the document.

**Changing the state takes the same path as a click on the checkbox in the reading view**, including the state chain, automatic dates and recurrence. There is no second state logic.

**Deleting happens without a confirmation.** The action is a single undo step away, and a question on every card would be one click too many. Afterwards the selection moves to the next card in the column, otherwise to the previous one.

## Columns

| Action | Mouse | Keyboard | Context menu | Command |
| ------ | ----- | -------- | ------------ | ------- |
| Create | button **Add column** at the end of the strip | — | — | **Add column to board** |
| Rename | double-click on the column title | — | **Rename column** | — |
| Apply | click outside the field | `Enter` | — | — |
| Discard | — | `Escape` | — | — |
| Set or change the limit | — | — | **Set limit…** | — |
| Remove the limit | — | — | **Remove limit** | — |
| Delete | — | — | **Delete column** | — |
| Switch marking on and off | — | — | **Marks cards dragged into it as done** (with a check mark) | — |

The button **Add column** is there even on a board without any column; otherwise there would be no way to the first one. If the title stays empty, no column is created.

**Renaming touches only the heading line** — indentation, hashes and spacing stay, a limit stays in the notation in which it was found, and the cards of the column stay untouched.

**Deleting asks as soon as the column carries cards.** An empty column disappears without a question; a filled one names its title and its card count in the question and is preset to **Cancel**. The reason for the difference: deleting a column removes more than the action announces, namely its cards as well.

The two creation commands — for the card and for the column — and archiving the selected card sit in the menu **View → Kanban board** and in the command palette. No keyboard shortcut is preset for them; one can be assigned in the settings.

## Moving with the mouse

**A card is dragged by the card, a column by its head.** During the drag the dragged item steps back and a marker shows where it will be dropped. With the pointer at the edge, the surface under it keeps scrolling — the column strip horizontally, the card list vertically.

Which column is meant is decided by the horizontal position alone: a pointer below the last card still means that column.

The drag ends when you let go. `Escape`, losing the window and letting go outside any column cancel it without changing the document; the same holds when the card lands back on its own place. After dropping, the moved card is selected.

While a card or a column title is being edited no drag starts, and in a document that cannot be changed none starts either. **Moving is not possible without a mouse**; every other action on the board can also be reached through keyboard and menu.

## A column that marks cards as done

Every column carries the setting **Marks cards dragged into it as done**, switched through its context menu. When it is set:

- A card dragged **into** it that is still open gets marked as done.
- A card marked as done that is dragged **out** of such a column into an ordinary one is opened again.
- Re-sorting between two ordinary columns leaves the state untouched.

Moving and marking together are **one** action and therefore a single undo step. Which state is set is decided by the state chain of the tasks, and the completion date appears and disappears just as it does in the reading view.

**If the card carries a recurrence rule**, marking it as done creates the next instance of the task, as it does everywhere. On the board that instance lands **in the column the card was dragged out of**, at the place of the old card — not in the done column. An open task in the done column would be exactly the contradiction a board is there to resolve. When re-sorting within the same column, the instance stays there and moves to the card's old place.

## Details on the card

Below the card text stands a row of **badges** with the details of the task: the due date with its time, the scheduled and start dates, priority, recurrence and the other task markers. They are the same badges as in the reading view, with the same marking for overdue and invalid details. A card without details carries no such row.

**Setting and removing the date.** The context menu of a card offers **Set date…** and, as soon as the card carries a due date, **Remove date**; a click on the due-date badge also leads to setting it. You choose in the date picker of the tasks, optionally with a time and preset with the existing date. The date is written into the card line in the task notation of the application:

```markdown
- [ ] Send the quote 📅 2026-10-02 14:00
```

It therefore also appears in the reading view and in the task queries. Every setting and removing is one undo step; if the document changes while the date picker is open, the choice is discarded and the status bar says so.

**Relative display.** With the switch **View → Kanban board → Show dates as relative**, due, scheduled and start dates read from today: “today”, “tomorrow”, “in 3 days”, “2 days ago”, in the language of the interface and with the time appended. The exact date then stands in the tooltip of the badge. Created, done and cancelled dates stay absolute, because they record when something happened. The switch is off by default, applies to all boards in all windows and changes nothing in the document.

**Dates in the notation of the other tool.** The board tool the format comes from writes a due date as `@{…}` and a time as `@@{…}` into the card line. The board reads both and shows them as a due-date badge with a dashed border; its tooltip names the origin. **The first time the card is edited, such a date is rewritten into the task notation** — when a changed card text is applied as well as when the date is set or removed. The first line becomes the second:

```markdown
- [ ] Send the quote @{2026-10-02} @@{14:00}
- [ ] Send the quote 📅 2026-10-02 14:00
```

**This comes at a price:** in the other tool the rewritten date then appears only as text of the task and no longer as the date of the card. Whoever keeps a board in both tools should know this before editing such a card here. Without editing, nothing is rewritten: opening, changing the state, moving and archiving leave the line as it is. A date in this notation that cannot be read — a date that does not exist, or a time without a date — stays in the card text and additionally appears as an invalid badge whose tooltip gives the reason. A [calendar value](custom-calendars.md) of the application in the same bracket form is not such a date and stays untouched.

## Tags at the card footer

On the card, tags first stand where they are written: in the card text, rendered as in the reading view. With the switch **View → Kanban board → Tags in card footer** they leave the displayed text and stand gathered in a row of their own at the foot of the card — including the tags from indented follow-up lines, each once and in the order of its occurrence. The switch is off by default, applies to all boards in all windows and changes nothing in the document: the tags stay in the line where they stand.

A click on a tag of the card — at the footer as in the text — filters the tags sidebar by it, as in the reading view; selection and editing of the card stay unaffected. While a card is being edited its tag row is hidden, because the input shows the raw text including the tags. Both display switches can be chosen only in the open board view.

## Limit per column

A column can carry a **limit**: the number of cards it is meant to hold at most. In the document it stands in brackets at the end of the column title, such as `## In progress (3)`; on the board it appears not in the title but in the counter: `2/3`.

It is set and changed through **Set limit…** in the context menu of the column head. The input appears in place of the counter and, like a column title, is applied with `Enter` or a click beside it and discarded with `Escape`. An empty input or `0` removes the limit, as does the entry **Remove limit**, which the menu offers as soon as one is set.

**The limit does not block.** If the column carries more cards than it provides for, its counter is highlighted and its tooltip says “limit exceeded”; cards can still be dragged in and created. The board shows what is and leaves the decision to you. A `(0)` written by hand does not count as a limit and stays part of the title.

## Archive

**Archive card** in the context menu of a card, or the command **Archive card on board** for the selected card, takes the card together with its indented follow-up lines out of its column and writes it to the end of the **archive section** of the same document. A timestamp of date and time is placed before its text; its state and its other details stay as they are:

```markdown
***

## Archive

- [x] 2026-09-23 14:05 Record the requirement
```

If the section is missing, it is created behind the last column, with the heading the other tool also writes in the language of the interface; an existing section is continued with its heading and its contents.

**The archive keeps the latest 100 cards.** If one is added when it is full, the oldest drops out; an archive that another tool left behind with more cards is cut to the latest 100 the first time a card is archived.

**An archived card cannot be brought back on the board**, because the archive does not appear there. Archiving is, however, exactly one undo step, and in the document the card still stands in plain text. Afterwards the selection moves to the next card in the column, as with deleting; without a selected card the command has no effect.

## Searching and filtering cards

In the board view the search command (default `Ctrl+F`) opens a **filter field** above the columns instead of the search in the text. Already while you type, the board hides every card whose text does not contain the search term; the columns stay, and their counter shows the matches and the total, such as `1/3`. If no card matches, a notice below the field says so.

What is searched is the text of the card and its indented follow-up lines, including the tags and dates in them; upper and lower case do not matter. The search term is looked for as one continuous string: `check the quote` finds “Check the quote”, `quote check` does not. It is the same rule as in the filter field of the card list of a [canvas surface](canvas.md).

**The document stays unchanged**, because the filter only hides; it therefore also works in a document that cannot be changed. A hidden card does not stay selected, so that no key acts on a card that cannot be seen. The highlighting of an exceeded limit stays during the filter, because it counts all cards of the column.

`Escape` in the field ends the filter and shows all cards again; so does switching to another view or to another document. If the board draws itself anew in the meantime, search text and input focus are kept.

## Undo

`Ctrl+Z` takes back the last action on the board, `Ctrl+Y` and `Ctrl+Shift+Z` restore it. Every action is exactly one step: a created card, a changed text, a state change, a drag including the marking, a deleted column with all its cards, a set or removed date, a changed limit, an archived card. While the input of a card or a column title is open, `Ctrl+Z` applies to the typed text there.

If the document changes elsewhere in the meantime — because the same document is being edited next to it, say — the started action is discarded instead of written blindly; the status bar says so, and the board draws itself anew.

## View only

The board follows the changeability of its document. While the document is in plain display, without edit mode switched on, the board is **view-only**: no buttons, no dragging, no input, no clickable checkbox, and the context menu stays without entries. The way through command palette and menu does not get around this either; the failure is stated in the status bar and not kept quiet. Looking, selecting, scrolling and filtering the cards remain allowed, because they do not touch the document; so do the two display switches. The due-date badge is display only here.

Edit mode releases the handling — the pen in the status bar, default `Ctrl+E`; the details are described on the page [Views and display](views-display.md).

## Board and task query

The board and the [task query](tasks.md) both show tasks and mean different things:

| Question | Task query | Kanban board |
| -------- | ---------- | ------------ |
| Where do the lines come from? | from **all** files of the search scope | from **one** document |
| Where does the order come from? | from filter, sorting and grouping of the query | from the place where the line sits in the document |
| What does rearranging do? | nothing — the query recalculates | the line moves inside the document |
| What is the result? | a view of your files | a working surface with an order of its own |

In short: the query **collects** across your files and orders by rules; the board **arranges** the lines of one document by hand and remembers that arrangement, because it sits in the text. The two do not exclude each other — the tasks of a board appear in a query like any other task line.

## The storage format

A board sits in plain text inside its document. It is therefore readable without this application as well, and whoever opens the file in a text tool sees an ordinary task list per column.

### Structure

| Part | How it stands in the document |
| ---- | ----------------------------- |
| Marker | the key `kanban-plugin` in the header section |
| Column | a **heading** with the title of the column |
| Done setting | directly below the heading, a line consisting of nothing but a **bold phrase** |
| Limit | a number in brackets at the end of the heading, such as `## In progress (3)` |
| Card | a **task line** below that heading |
| Due date of a card | the due-date marker `📅` with a date and optionally a time in the task line |
| Addition to a card | the **indented** lines directly below its task line |
| Archive | everything after a separator line of three asterisks: a heading, below it the archived cards with a timestamp |
| Settings | a private comment between `%%` markers at the end of the file |

An example:

```markdown
---
kanban-plugin: board
---

## To do

- [ ] Check the quote #purchasing
  Question to purchasing is still open
- [ ] Confirm the appointment 📅 2026-10-02 14:00


## In progress (2)

- [/] Write the manual chapter


## Done

**Complete**

- [x] Record the requirement


***

## Archive

- [x] 2026-09-01 09:15 Draft the template
```

**The heading level is not fixed.** Two hashes are written; every level is read, and a newly created column takes over the level of the first existing one. A board written by hand is therefore not rejected.

**The done marker is the bold text itself**, not a particular word: it is recognised by its form and carried along in the spelling that stands in the file. When the application creates such a column itself, it first writes the wording that already occurs in this board, and otherwise the wording of the selected interface language.

**Blank lines belong to the form:** one blank line stands below the heading or below the done marker, two stand before the next heading. An empty column without a marker therefore carries three blank lines in a row.

**The archive** stands behind the last column and begins with the separator line; it is recognised by that line, not by the wording of its heading. Every archived card carries a timestamp in the form `YYYY-MM-DD HH:mm` before its text.

### What stays untouched

**The archive section and the settings block are not shown on the board.** The settings block is never changed, the archive section only when a card is archived; otherwise both stay in the file as they are, and whoever opens a board and closes it again without a change gets back the very same file — including the line endings, a missing final line break and every entry this application does not know.

One exception with a good reason: if the settings block holds the list of which columns are collapsed, that list follows along when a column is created, deleted or moved. If it stayed as it was, the other tool would afterwards have collapsed the wrong columns. Everything else in the block stays character for character as it was.

Only the range of lines that really changes is ever written — not the whole document. The cursor and the folds of the editor therefore stay where they are.

## Working together with other tools

The format comes from a widely used board tool for Markdown notes, and compatibility with it is an explicit promise: a board written there can be opened and edited here, and a board edited here can be used there again.

**What is read and preserved:**

- the header marker together with its value, whatever it is,
- columns, cards and their indented follow-up lines,
- the limit in the column title, also in the notation without a space before the bracket,
- due dates and times in the notation of the other tool, until their card is first edited (see below),
- the done marker in **its** language, even when that is not the language of the interface,
- the archive section behind the separator line together with its heading and its cards,
- the settings block at the end of the file with all entries, including unknown ones,
- everything beyond that which stands in the file: it travels along unchanged.

**What changes when you edit:** a due date in the notation of the other tool is rewritten into the task notation of the application the first time its card is edited (see “Details on the card”). **In the other tool it then appears only as text** and no longer as the date of the card. All other details of a task — date markers, priority, recurrence, tags — stay in their line and keep working everywhere else, in the reading view and in the task queries.

**What happens differently here:** archiving always sets a timestamp and keeps the archive at 100 cards; the other tool does both only when it is set up that way. Entries of its settings block, such as a different date format or a different archive limit, are not evaluated by the board.

## Limits

- **One document carries one board.** Several boards in one file do not exist; the columns of the document are the columns of the one board.
- **Only an empty document is turned into a board.** A document with content is not declared a board, because text would be lost; whoever wants to carry an existing list over creates a board and moves the text there themselves.
- **Moving is done with the mouse.** There is no keyboard gesture for moving cards and columns.
- **A card carries one line.** What you edit is the text of the task line; its indented follow-up lines appear on the card but are changed in the document and not on it.
- **What is read is the default notation of the other tool:** a due date in the form `@{YYYY-MM-DD}` and a time in the form `@@{HH:mm}`, each the first occurrence in the card line. A differently configured format, a second occurrence and the link form `@[[…]]` stay text.
- **There is no way back from the archive on the board.** Archived cards do not appear there and can only be brought back in the document itself; the archive keeps a fixed number of the latest 100 cards.
- **There are no settings per board.** The two display switches apply to all boards; the settings block is read and preserved, but its entries have no effect on the board.
- **A card is not a note.** No note of its own is created from a card, the card shows no fields or images of a linked note, and a date on the card does not open a daily note.
- **A column without a heading does not exist.** Task lines that stand before the first heading belong to no column and therefore do not appear on the board; in the document they stay where they are.
