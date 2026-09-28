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

The feature belongs to the [internal extensions](extensions.md) (“Board view (Kanban)”). When it is switched off, the view mode goes away, the commands for card, column and board disappear, and with them the submenu **Kanban board** in the **View** menu, which does not stay behind empty, and the **Kanban board** section of the settings. The document remains readable exactly as it was; nothing is ever written in the disabled state, and columns and cards stay in the text.

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
| Set or change the date | click on the due-date badge, unless the date leads to the journal entry | — | **Set date…** | — |
| Remove the date | — | — | **Remove date** | — |
| Create a note from the card | — | — | **Create note from card…** | **Create note from card…** |
| Open the target of a link | click on the link in the card text | — | — | — |
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

**Setting and removing the date.** The context menu of a card offers **Set date…** and, as soon as the card carries a due date, **Remove date**; a click on the due-date badge also leads to setting it, unless the date leads to the journal entry for the day (see “Links and date on the card”). You choose in the date picker of the tasks, optionally with a time and preset with the existing date. The date is written into the card line in the task notation of the application:

```markdown
- [ ] Send the quote 📅 2026-10-02 14:00
```

It therefore also appears in the reading view and in the task queries. Every setting and removing is one undo step; if the document changes while the date picker is open, the choice is discarded and the status bar says so.

**Relative display.** With the switch **View → Kanban board → Show dates as relative**, due, scheduled and start dates read from today: “today”, “tomorrow”, “in 3 days”, “2 days ago”, in the language of the interface and with the time appended. The exact date then stands in the tooltip of the badge. Created, done and cancelled dates stay absolute, because they record when something happened. The switch is off by default, sets the default for all boards in all windows and changes nothing in the document; a single board can override it for itself (see “Board settings”).

**Dates in the notation of the other tool.** The board tool the format comes from writes a due date as `@{…}` and a time as `@@{…}` into the card line. The board reads both and shows them as a due-date badge with a dashed border; its tooltip names the origin. **The first time the card is edited, such a date is rewritten into the task notation** — when a changed card text is applied as well as when the date is set or removed. The first line becomes the second:

```markdown
- [ ] Send the quote @{2026-10-02} @@{14:00}
- [ ] Send the quote 📅 2026-10-02 14:00
```

**This comes at a price:** in the other tool the rewritten date then appears only as text of the task and no longer as the date of the card. Whoever keeps a board in both tools should know this before editing such a card here. Without editing, nothing is rewritten: opening, changing the state, moving and archiving leave the line as it is. A date in this notation that cannot be read — a date that does not exist, or a time without a date — stays in the card text and additionally appears as an invalid badge whose tooltip gives the reason. A [calendar value](custom-calendars.md) of the application in the same bracket form is not such a date and stays untouched.

## Tags at the card footer

On the card, tags first stand where they are written: in the card text, rendered as in the reading view. With the switch **View → Kanban board → Tags in card footer** they leave the displayed text and stand gathered in a row of their own at the foot of the card — including the tags from indented follow-up lines, each once and in the order of its occurrence. The switch is off by default, sets the default for all boards in all windows and changes nothing in the document: the tags stay in the line where they stand. A single board can override it for itself.

A click on a tag of the card — at the footer as in the text — filters the tags sidebar by it, as in the reading view; selection and editing of the card stay unaffected. While a card is being edited its tag row is hidden, because the input shows the raw text including the tags. Both display switches can be chosen only in the open board view.

## Limit per column

A column can carry a **limit**: the number of cards it is meant to hold at most. In the document it stands in brackets at the end of the column title, such as `## In progress (3)`; on the board it appears not in the title but in the counter: `2/3`.

It is set and changed through **Set limit…** in the context menu of the column head. The input appears in place of the counter and, like a column title, is applied with `Enter` or a click beside it and discarded with `Escape`. An empty input or `0` removes the limit, as does the entry **Remove limit**, which the menu offers as soon as one is set.

**The limit does not block.** If the column carries more cards than it provides for, its counter is highlighted and its tooltip says “limit exceeded”; cards can still be dragged in and created. The board shows what is and leaves the decision to you. A `(0)` written by hand does not count as a limit and stays part of the title.

## Archive

**Archive card** in the context menu of a card, or the command **Archive card on board** for the selected card, takes the card together with its indented follow-up lines out of its column and writes it to the end of the **archive section** of the same document. A timestamp of date and time is placed before its text as long as the setting **Archive with timestamp** applies, as it does by default; its state and its other details stay as they are:

```markdown
***

## Archive

- [x] 2026-09-23 14:05 Record the requirement
```

If the section is missing, it is created behind the last column, with the heading the other tool also writes in the language of the interface; an existing section is continued with its heading and its contents.

**By default the archive keeps the latest 100 cards.** If one is added when it is full, the oldest drops out; an archive that another tool left behind with more cards is cut to the latest ones the first time a card is archived. The number can be set, and `0` means unlimited (see “Board settings”).

**An archived card cannot be brought back on the board**, because the archive does not appear there. Archiving is, however, exactly one undo step, and in the document the card still stands in plain text. Afterwards the selection moves to the next card in the column, as with deleting; without a selected card the command has no effect.

## Searching and filtering cards

In the board view the search command (default `Ctrl+F`) opens a **filter field** above the columns instead of the search in the text. Already while you type, the board hides every card whose text does not contain the search term; the columns stay, and their counter shows the matches and the total, such as `1/3`. If no card matches, a notice below the field says so.

What is searched is the text of the card and its indented follow-up lines, including the tags and dates in them; upper and lower case do not matter. The search term is looked for as one continuous string: `check the quote` finds “Check the quote”, `quote check` does not. It is the same rule as in the filter field of the card list of a [canvas surface](canvas.md).

**The document stays unchanged**, because the filter only hides; it therefore also works in a document that cannot be changed. A hidden card does not stay selected, so that no key acts on a card that cannot be seen. The highlighting of an exceeded limit stays during the filter, because it counts all cards of the column.

`Escape` in the field ends the filter and shows all cards again; so does switching to another view or to another document. If the board draws itself anew in the meantime, search text and input focus are kept.

## Board settings

The behaviour of the board can be set on two levels: as a **default** for all boards and **per board** with a value of its own. A value of its own takes precedence over the default; a board without values of its own follows the defaults in everything.

**The defaults** are found under **File → Settings… → Kanban board**, in the block **Extensions (internal)**:

| Setting | by default |
| ------- | ---------- |
| **Tags in card footer** | off |
| **Show dates as relative** | off |
| **Archive with timestamp** | on |
| **Archive limit in cards (0 = unlimited)** | 100 |
| **Date leads to the journal entry for the day** | off |

The two check marks in the menu **View → Kanban board** show and set the same defaults as the first two rows. A default never writes into a document.

**Per board**, **Settings for this board…** opens a dialog — in the menu **View → Kanban board**, in the context menu of a column head and in the command palette. The free area of the board has no context menu of its own; the entry therefore sits at the column head.

| Setting | Choice in the dialog | “as default” means |
| ------- | -------------------- | ------------------ |
| the four switches of the table above | **as default (on)** or **as default (off)**, **on**, **off** | the value of the settings page, named in the brackets |
| **Archive limit (cards)** | **as default (…)** or **own value** with a number | the limit of the settings page |
| **Folder for new notes** | **as default (folder of the board)** or **own value** via **Choose folder…** | the folder the board sits in |
| **Template for new notes** | **as default (choose when creating)** or **own value** via **Choose template…** | folder rule or choice when creating |
| **Details of the linked note** | **as default (no details)** or **own value** with one row per detail | the cards show no details |

The choice itself shows where a value comes from: **as default** follows the settings page and changes along with it; everything else applies to this board only. To reset, choose **as default** again. A limit of its own of `0` or less means unlimited.

For the details of the linked note, every row carries the **Key in the document header**, a **Display name (optional)** and the checkbox **Hide name**; **Remove** takes the row out, **Add detail** adds one. A row without a key is dropped when you apply.

The folder is chosen in the folder dialog of the application. It has to lie within the open area — otherwise a notice says “The folder is outside the area.” — and is stored relative to the area's root, the root itself as `/`; without an open area, relative to the folder of the board. The template comes from the template selection of the application and is stored with its path in the templates folder.

**Apply** writes only the changed settings into the settings block at the end of the board document, as **one** undo step; if the block is missing, it is created in the process. **Cancel**, `Escape` and a click beside the dialog change nothing. The effect is visible at once, without reopening the document. The dialog requires the open board view and a changeable document; if the document has changed while it was open, applying is discarded and the status bar says so. If the block cannot be read, the board writes nothing and says: “The settings block at the end of the board cannot be read — the settings were not written.”

## Note from a card

**Create note from card…** turns a card into a note of its own, in the context menu of the card or for the selected card through the command palette. The card text without its markers — tags, task markers and a due date in the notation of the other tool — becomes the name of the note, and on the card the link to it takes the place of the text. The markers stay in their order, and so do the indented follow-up lines; the first line becomes the second:

```markdown
- [ ] Write the quote #customer 📅 2026-10-02
- [ ] [[Write the quote]] #customer 📅 2026-10-02
```

A link in the card text goes into the name with its display text. Slashes and the characters a file name cannot carry become `_`; no subpage is created in the process. If nothing usable is left of the text, the application asks for the name. A card whose text is empty without its markers does not offer the entry.

**Where the note goes:** into the folder for new notes from the board settings, otherwise into the folder of the board. If the folder that is set does not exist, a notice says so, and the folder dialog lets you choose another one; a missing folder is never created.

**If the name already exists**, nothing is ever overwritten. The application asks “A document ‘Name’ already exists. How do you want to continue?” and offers **Choose another name…** — the name prompt, preset with the name — and **Link to the existing document**: then no file is created, the card gets the link to the existing document, and it is not opened. `Escape` cancels.

**Which template applies**, in this order:

1. the template from the board settings; if it cannot be found, a notice says so, and the selection follows;
2. otherwise the [folder rule](templates.md) of the target folder;
3. otherwise the selection of templates with **No template (empty note)** in first place.

If no templates are set up or the “Templates” extension is switched off, an empty note is created without a selection. A chosen template is filled in as with **New File from Template…**, with the name of the note as its title.

**Afterwards** the application creates the file, replaces the card text and opens the new note as a document of its own; the board stays open next to it. A due date in the notation of the other tool is rewritten in the process, as when the card is edited. If creating fails, the card stays unchanged. If the board has changed while the dialogs were open, the card likewise stays unchanged, but the note is created and opened, and a notice says both.

**Undo** restores the card text in one step; the created note remains as a file.

## Details of the linked note

If a card carries a link to a note, it can show details from that note's **document header** — such as status, owners or a cover image. Which ones is determined by the board setting **Details of the linked note**; by default a card shows none.

**Which link counts:** the first wiki link with a target, in the card line or its follow-up lines. A pure section link such as `[[#Section]]` and the embedding of an image do not count; the embedding of a document does.

**How the details appear:** as lines “Name: value” below the card text, before badges and tags. The name is the display name from the setting, otherwise the key; with **Hide name** only the value stands there. Only keys with a value appear, in the order of the setting. A list is joined with commas. A detail is limited to two lines; the full value stands in the tooltip.

**Images:** if a value as a whole is a path with an image extension or a link such as `[[image.png]]` or `![[image.png|200]]`, the image appears in its place at card width and with limited height. It is looked for relative to the linked note, within the open area; without an area, in the folder of the note and below. If the image is missing, the detail is dropped; a web address never becomes an image.

The details are only read, never written, and the cards appear at once — the details follow as soon as they have been read. They are **up to date** the next time the board is drawn anew: after switching the view, after a change to the board or on returning to its document. If the note is changed while the board stays visible next to it, the new state appears only the next time the board is drawn anew.

## Links and date on the card

**A link in the card text opens its target**, like a click in the reading view: a wiki link with and without display text, a link to a target that does not exist yet, an ordinary Markdown link and a web address behave as they do there. The click does not select the card and also works in a document that cannot be changed; an open input is applied first. A double-click on a link does not start editing — you edit with a double-click beside the link, with `Enter`, `F2` or through the context menu.

**The date leads to the journal entry for the day** when the setting **Date leads to the journal entry for the day** applies to the board (off by default) and the open area has at least one [journal](journals.md) with the granularity “day”. The due-date badge is then underlined, the pointer turns into a hand, and the tooltip reads “Open the journal entry for this day”. A click opens the entry for that day and creates it if it does not exist yet — like **Today's Journal Entry** for today's; with several such journals you are asked which one. The time plays no role. This also holds for a due date in the notation of the other tool and in a document that cannot be changed, because the board changes nothing in the process. The date is then changed through **Set date…** in the context menu of the card.

Without an open area or without a journal with the granularity “day”, the badge stays what it was: the click opens the date picker, and no notice appears. The same holds when the setting is off.

## Undo

`Ctrl+Z` takes back the last action on the board, `Ctrl+Y` and `Ctrl+Shift+Z` restore it. Every action is exactly one step: a created card, a changed text, a state change, a drag including the marking, a deleted column with all its cards, a set or removed date, a changed limit, an archived card, an application in the dialog **Settings for this board…**, the replacement of the card text by the link to a created note — whose file remains in the process. While the input of a card or a column title is open, `Ctrl+Z` applies to the typed text there.

If the document changes elsewhere in the meantime — because the same document is being edited next to it, say — the started action is discarded instead of written blindly; the status bar says so, and the board draws itself anew.

## View only

The board follows the changeability of its document. While the document is in plain display, without edit mode switched on, the board is **view-only**: no buttons, no dragging, no input, no clickable checkbox, and the context menu stays without entries. The way through command palette and menu does not get around this either; the failure is stated in the status bar and not kept quiet. Looking, selecting, scrolling and filtering the cards remain allowed, because they do not touch the document; so do the two display switches, the click on a link and the click on a date that leads to the journal entry for the day. Otherwise the due-date badge is display only here. **Settings for this board…** and **Create note from card…** write into the document and are therefore not available.

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

**The archive section and the settings block are not shown on the board.** The settings block is changed only through the dialog **Settings for this board…**, the archive section only when a card is archived; otherwise both stay in the file as they are, and whoever opens a board and closes it again without a change gets back the very same file — including the line endings, a missing final line break and every entry this application does not know.

One exception with a good reason: if the settings block holds the list of which columns are collapsed, that list follows along when a column is created, deleted or moved. If it stayed as it was, the other tool would afterwards have collapsed the wrong columns. Everything else in the block stays character for character as it was, until a setting of the board is changed — and even then only its own entry changes (see “Working together with other tools”).

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

**What happens differently here:** by default archiving sets a timestamp and keeps the archive at 100 cards; the other tool does both only when it is set up that way. For the details of the linked note, the **first** link of a card counts here and the last one in the other tool; a card with several links therefore shows the details of different notes in the two tools.

### The settings in the settings block

The settings of a board stand in the settings block at the end of the file, in the notation of the other tool; both tools read and write the same entries:

| Setting here | Entry in the block |
| ------------ | ------------------ |
| Tags in card footer | `move-tags` |
| Show dates as relative | `show-relative-date` |
| Archive with timestamp | `archive-with-date` |
| Archive limit | `max-archive-size` (`-1` means unlimited) |
| Date leads to the journal entry for the day | `link-date-to-daily-note` |
| Folder for new notes | `new-note-folder` |
| Template for new notes | `new-note-template` |
| Details of the linked note | `metadata-keys` |

An example of the line in the block, with an entry of the other tool's own at the front:

```json
{"kanban-plugin":"board","move-tags":true,"max-archive-size":-1}
```

**Writing happens per entry.** If the dialog changes a setting, only its entry changes; order, notation and all other entries of the block stay character for character, including those this application does not know, such as a date format or colours for tags. A new entry goes to the end of the line. **as default** removes the entry; a block that becomes empty as a result stays behind as `{}`. If the block is missing, it is created at the end of the file on the first apply. An entry whose value does not fit the setting counts as not set; the default applies. A limit of its own of `0` or less is written as `-1`, the value the other tool knows for unlimited.

## Limits

- **One document carries one board.** Several boards in one file do not exist; the columns of the document are the columns of the one board.
- **Only an empty document is turned into a board.** A document with content is not declared a board, because text would be lost; whoever wants to carry an existing list over creates a board and moves the text there themselves.
- **Moving is done with the mouse.** There is no keyboard gesture for moving cards and columns.
- **A card carries one line.** What you edit is the text of the task line; its indented follow-up lines appear on the card but are changed in the document and not on it.
- **What is read is the default notation of the other tool:** a due date in the form `@{YYYY-MM-DD}` and a time in the form `@@{HH:mm}`, each the first occurrence in the card line. A differently configured format, a second occurrence and the link form `@[[…]]` stay text.
- **There is no way back from the archive on the board.** Archived cards do not appear there and can only be brought back in the document itself; by default the archive keeps the latest 100 cards.
- **Details of the linked note are text.** Markdown in a value is not rendered; only a value that as a whole points to an image file appears as an image, not a list of images and not the image notation `![](…)`. Search and filter of the board do not include the details.
- **The details do not follow the link everywhere.** A link into a linked area and a note that could only be found through its alias stay without details; if there are several notes of the same name, the first one counts. The details become up to date the next time the board is drawn anew, not when the note is saved.
- **The date leads only to a journal with the granularity “day”.** Without an open area or without such a journal the date stays an ordinary badge whose click opens the date picker.
- **The name of a created note is a file name.** Slashes become underscores, no subpage is created; a date marker in the middle of the text with more text after it counts as text and becomes part of the name.
- **A column without a heading does not exist.** Task lines that stand before the first heading belong to no column and therefore do not appear on the board; in the document they stay where they are.
