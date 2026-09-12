# Canvas surface

A **canvas** is a spatial working surface inside an ordinary Markdown document: **cards** carrying their own text are placed freely on it, **connections** draw the relations between them, **shapes** set marks beside them, and **groups** tie together what belongs together. Whenever alternatives are laid side by side, a workflow is sketched or thoughts are sorted out first, the order here comes from position rather than from sequence.

The surface is carried by a code block with the language tag `perspective-canvas`. A document may contain any number of them, and everything else in it remains ordinary Markdown.

The function belongs to the [internal extensions](extensions.md) (“Canvas view”). Switched off, the block stays an ordinary code block, the view mode disappears, and the commands for surface, card, shape, group and stacking order are gone. The document remains fully readable; nothing is lost.

## How this differs from the graph view

Both show boxes and lines, and they mean different things:

| Question | [Graph view](graph.md) | Canvas |
| -------- | ---------------------- | ------ |
| Where do the nodes come from? | from the files of the area | created by you |
| Where do the lines come from? | from existing links | drawn by you |
| Where does the arrangement come from? | the app **computes** it | you **decide** it |
| What is the result? | an analysis of what exists | a working surface with content of its own |

In short: the graph view **analyses** and computes its own arrangement; the canvas **lets you arrange** and remembers what you arranged. A card you move stays where you put it, a graph node does not.

The same holds against the [mind map view](mindmap.md): it derives its tree from the headings and lists of the document and never changes the text. The canvas carries its content itself and writes it back into the document as you edit.

## Creating a surface

The command **“Canvas”** inserts an empty surface at the cursor. Two ways lead there: the command palette (default `Ctrl+K`) and the editor context menu → Insert → Canvas. No keyboard shortcut is preassigned; one can be given in the settings.

The command needs an editable document; without one the status bar says so instead of quietly doing nothing. What gets inserted is an empty block:

````markdown
```perspective-canvas
```
````

## Opening the canvas view

The canvas is the sixth view mode, next to Source, Split, Rendered, Live and Mind map: **View → Canvas**, the button in the status bar or default `Ctrl+6`. As with the other modes, the choice applies per open document, not to the whole application.

**It is the only one of the six modes that depends on the document.** It can be chosen only if the document contains a canvas surface — a canvas view without a surface would show nothing but a notice. Without a surface, button and menu entry stay **visible and dimmed**; the reason is given in the button’s tooltip. The way in through keyboard shortcut and command palette then does nothing and does not throw you out of your current view either. As soon as a surface appears in the text or disappears from it, the access follows. A document that was open in the canvas view when the app was closed and whose surface has meanwhile gone opens in the reading view.

## Several surfaces in one document

If a document holds more than one surface, a bar with one **tab** per surface appears above the surface; a click switches the surface shown and fits it into view. With exactly one surface there is no bar.

The label is derived rather than stated: the first meaningful line of the first card, otherwise a count (“Canvas 2”). Nothing is stored in the document for it. Which surface is selected applies per open document, survives typing and a change of view, and is not saved — a pure viewing action must not change the document.

## Cards

### Creating

- A **double-click** on the empty background creates a card at the click position and opens its text entry right away.
- A **right-click** on the background → “Add card to canvas” does the same at the click position.
- The command **“Add card to canvas”** (command palette, View menu, assignable shortcut) places it in the middle of the visible section. Outside the canvas view it reports in the status bar that cards can only be added there.

### Selecting, moving, resizing

- A **click** selects a card, a click on the background clears the selection. At most one element is selected at a time — a card, a connection, a shape or a group.
- **Dragging** moves the card; its connections follow while you drag. There is no grid.
- The **handle at the bottom right corner** changes the size. The size is independent of the content: if the text does not fit, the card scrolls — it never grows by itself.

### Writing text

A **double-click inside a card** switches it to its raw text. That text is ordinary Markdown and is rendered inside the card — headings, emphasis, lists, tables, formulas and diagrams included.

| Input | Effect |
| ----- | ------ |
| Click outside the card | applies |
| `Ctrl+Enter` | applies |
| `Escape` | discards |

Text that has not changed writes nothing to the document.

### Deleting

`Del` deletes the selected card, and so does “Delete card” in its context menu. Connections that end on it disappear with it — in one step that can be taken back as a whole.

## Connections

### Creating

A selected card shows four **connection handles**, one per side. Dragging from a handle onto another card creates the connection; a preview line follows the pointer. While you drag, the card under the pointer shows four **target zones** along its edges: releasing on a zone fixes the target side, releasing on the body of the card leaves that side to the app. Dragging into empty space or back onto the same card creates nothing.

### Changing

A selected connection carries a small **toolbar** at the middle of its path:

- **Toggle direction** — in a cycle: arrow to the target (→), arrow at both ends (↔), no arrow head (—). The sign on the button shows the current state.
- **Reverse direction** — swaps start and end together with their connection sides.
- **Colour** — eight colours of the colour scheme, plus “No colour”.
- **Start side** and **Target side** — automatic, left, right, top or bottom. “Automatic” picks the side from the positions of the two cards; a side chosen explicitly stays put even when a card is moved.
- **Label** — opens the same text entry as a double-click on the connection. The text then sits along the line.

The same actions are in the **context menu** of the connection (right-click). `Del` deletes the selected connection.

## Shapes

Besides cards, the surface carries **geometric shapes**. They do not carry content, they structure: they highlight an area, mark a step in a workflow or set a sign beside a card.

### Creating

- A **right-click** on the empty background → “Insert shape” opens a submenu with the six kinds and places the chosen one at the click position.
- The command **“Add shape to canvas”** (command palette, View menu, assignable shortcut) places a rectangle in the middle of the visible section.

Six kinds are on offer: **rectangle**, **rounded rectangle**, **ellipse**, **triangle**, **diamond** and **star**. There is no tool for freehand strokes.

### Selecting, moving, resizing

As with a card: a click selects the shape, dragging moves it, the handle at the bottom right corner changes the size. The outline fills its rectangle and does not keep its proportions — an ellipse pulled wide stays wide.

What you grab is the **drawn figure**, not the rectangle around it: a click into the empty corner beside a triangle hits whatever lies behind it.

### Kind, colours and label

A selected shape carries a **toolbar**:

- **Shape kind** — switches between the six kinds; position and size stay put.
- **Outline colour** — eight colours of the colour scheme. Without a choice the default colour applies.
- **Fill colour** — the same eight colours, drawn as a tint, plus “No fill”.
- **Edit label** — opens the same entry as a double-click on the shape.

The **label** is **plain text**, centred in the shape. Unlike in a card, no Markdown is rendered in it and it does not scroll: the shape structures, the card carries content. `Ctrl+Enter` and a click beside it apply, `Escape` discards; an emptied text removes the label again.

The same actions are in the **context menu** of the shape.

### Deleting

`Del` deletes the selected shape, and so does “Delete shape” in its context menu. A connection cannot be attached to a shape; connections run between cards only.

## Groups

A **group** is a rectangle that ties a part of the surface together and names it — “Analysis”, “discarded”, “first draft”. Its inside stays operable: cards and shapes within it can still be picked up, and a double-click in the middle of a group creates a card just as it does anywhere else.

### Creating

- A **right-click** on the empty background → “Insert group” places it at the click position.
- The command **“Add group to canvas”** places it in the middle of the visible section.

A new group appears **at the very back** and therefore covers nothing.

### Label and colour

A selected group carries a toolbar with the **group colour** — eight colours of the colour scheme, plus “Default colour”, which removes the attribute again — and with **Edit label**. The label sits at the top left of the frame and is plain text, as with a shape. The same actions are in the **context menu** of the group.

### Members

**A member is whatever lies completely inside the group.** It is written nowhere — the rectangle itself is the statement, and there is no second list that could drift away from it. The edges count as inside; whatever sticks out over an edge is not a member. A group inside a group is a member and travels along.

The three actions follow from that:

| Action | Effect on the members |
| ------ | --------------------- |
| Moving the group | the members travel along, their arrangement towards each other stays unchanged |
| Resizing | nothing is moved; who counts as a member is worked out anew afterwards |
| Deleting the group | the members stay where they are |

Who travels along is fixed **at the start of the drag**: whatever lay inside the group when you grabbed it comes along — even if the group travels far beyond its own place on the way. The whole drag is **one** undo step.

A connection is never a member; it follows its cards anyway.

## Stacking order on the surface

Cards, shapes and groups lie in **one common order**. Where two elements overlap, it decides which of them is on top; no kind lies permanently above another.

For the selected element there are four commands:

| Command | Effect |
| ------- | ------ |
| Bring to front | above all remaining elements |
| Bring forward | in front of the next element ahead of it |
| Send backward | behind the next element behind it |
| Send to back | below all remaining elements |

Two ways lead there: the **context menu** of the element and **View → Canvas stacking order**. The same commands are in the command palette (default `Ctrl+K`); no shortcuts are preassigned, and they can be given in the settings.

**New elements have their place:** a new group appears at the very back, a new shape and a new card at the very front.

**Connections are not affected.** They are drawn in a layer of their own below all elements and cannot be moved within the order.

## Undo

`Ctrl+Z` takes back the last action on the surface, `Ctrl+Y` and `Ctrl+Shift+Z` restore it. Every action is exactly one step: a card moved, a size changed, a connection created, a text edited. While the text entry of a card or a connection is open, `Ctrl+Z` applies to the text being typed there.

## Navigating

- **Pan** — drag the empty background with the mouse button held down.
- **Zoom** — mouse wheel over the surface, centred on the pointer.
- **Fit** — on entering the view and on switching the surface, the section fits itself to the content.

## Viewing only

The surface follows the editability of its document. While the document is in plain display, with the edit mode switched off, the surface is **view-only**: no handles, no dragging, no creating, no text entry, no toolbar, no reordering, and the context menu stays empty. That holds for every kind — card, connection, shape and group. The way through command palette and menu does not get past it either; the failure is said in the status bar rather than kept quiet. Panning, zooming and selecting an element by click remain allowed, because they do not touch the document.

The edit mode releases the handling — pen icon in the status bar, default `Ctrl+E`; the details are on the page [Views and display](views-display.md).

## The surface outside the canvas view

Because the surface lies in an ordinary Markdown document, it turns up in every view of that document:

| View | What appears |
| ---- | ------------ |
| Source | the block in plain text — this view **is** the source |
| Split | plain text on the left, the summary block on the right |
| Rendered | **the summary block**: kind, size in cards, connections, shapes and groups, a preview of the card texts and the button “Open canvas view” |
| Live | the same block; when the cursor touches the block, it unfolds into plain text and can be edited there |
| Mind map | a short note with kind and size instead of the raw text |
| Canvas | the surface itself |

The preview shows at most six cards; below it stands how many more there are. The block can be **collapsed**, its header line staying in place; that state applies to the running session and is not written into the document. Printing and PDF export follow the rendered view, without printing the two buttons of the block.

## The storage format

The surface lies in the document as plain text. It can therefore be understood without this application — and what stands in the cards is readable in any text tool.

### Structure

Inside the block every element starts with a **marker in column 0**. Its attributes stand on the marker line; the lines that follow, up to the next marker, are its content.

An attribute has the form `name=value`. A value is either a word without spaces or a string in double quotes, in which `\"` stands for a quotation mark and `\\` for a backslash. Identifiers consist of letters, digits, hyphen and underscore.

### Cards

```text
!karte <id> x=<number> y=<number> b=<number> h=<number>
```

| Attribute | Meaning |
| --------- | ------- |
| `x`, `y` | top left corner of the card |
| `b`, `h` | width and height |

All four are **whole numbers** counted in pixels at zoom 1. The **origin lies at the centre of the surface**: negative values are to the left of it or above it. The lines below the marker are the card text.

### Connections

```text
!linie <id> <first end> <arrow> <second end> von=<side> nach=<side> farbe=<name>
```

The two ends are card identifiers, and the **arrow between them carries the direction**:

| Arrow | Meaning |
| ----- | ------- |
| `->` | directed, arrow head at the second end |
| `<->` | arrow head at both ends |
| `--` | without an arrow head |

`von=` names the connection side at the first end, `nach=` the one at the second; allowed are `links` (left), `rechts` (right), `oben` (top), `unten` (bottom) and `auto`. `farbe=` colours the line; allowed are `blau`, `rot`, `grün`, `gelb`, `lila`, `orange`, `türkis` and `pink` — blue, red, green, yellow, purple, orange, turquoise and pink. Without that attribute the line is drawn in the default colour of the colour scheme. The lines below the marker are the **label**.

### Shapes

```text
!form <id> x=<number> y=<number> b=<number> h=<number> art=<name> rand=<colour> füllung=<colour>
```

Position and size count as they do for a card. `art=` is one of six names: `rechteck` (rectangle), `abgerundet` (rounded), `oval` (ellipse), `dreieck` (triangle), `raute` (diamond) and `stern` (star). `rand=` and `füllung=` take the same eight colour names as the connection, and `füllung=keine` leaves the shape unfilled. Without `art` the rectangle applies, without `rand` the default colour, and without `füllung` the shape stays unfilled — a default is not written out, because its absence already says it. The lines below the marker are the **label**.

An unknown name in `art` or in one of the two colours is a **finding**: the shape is kept, drawn as a rectangle or in the default colour, and its text stands unchanged in the file.

### Groups

```text
!gruppe <id> x=<number> y=<number> b=<number> h=<number> farbe=<name>
```

Position and size describe the rectangle, `farbe=` takes one of the eight colour names; without it the default colour applies. The lines below the marker are the **label**. **No list of members stands in the file** — who lies inside the group follows from the rectangles and from nothing else.

### The order inside the block

The **order inside the block is also the stacking order** across cards, shapes and groups: what stands further down lies further to the front. Connections stand in the same sequence but are not affected by it; they are drawn in a layer of their own below all elements.

### Two rules that protect the file

- **The escape for the exclamation mark.** A content line that starts with `!` gets a backslash in front of it when written and loses it again when read: the document holds `\!Careful`, the card shows `!Careful`. If the line is meant to read literally `\!Careful`, the document holds `\\!Careful`.
- **What is unknown is kept.** A marker or an attribute the app does not know is carried along and written back unchanged; an element that has not been changed is written out verbatim. Open a surface, save it without a change, and you get the same file back. A faulty attribute throws nothing away either: the element is then drawn conspicuously or not at all, but it never disappears from the file.

### An example

````markdown
```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analysis

!karte k1 x=-320 y=-140 b=260 h=120
## Starting point

The import reads only one source today.

!karte k2 x=40 y=-140 b=260 h=120
## Target picture

Several sources, one merge.

!karte k3 x=-140 y=120 b=260 h=160
## Open question

How are conflicts resolved?

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Key point

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
leads to

!linie e2 k3 -- k1
sketch for it

!linie e3 k2 <-> k3 von=unten nach=oben
depend on each other
```
````

Rendered, the summary block appears here, and the button inside it leads to the surface:

```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analysis

!karte k1 x=-320 y=-140 b=260 h=120
## Starting point

The import reads only one source today.

!karte k2 x=40 y=-140 b=260 h=120
## Target picture

Several sources, one merge.

!karte k3 x=-140 y=120 b=260 h=160
## Open question

How are conflicts resolved?

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Key point

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
leads to

!linie e2 k3 -- k1
sketch for it

!linie e3 k2 <-> k3 von=unten nach=oben
depend on each other
```

## Limits

- A card carries **its own text**; there are no other kinds of card. Shapes and groups are part of the surface, but they carry no rendered content — at most a label of plain text.
- **There is no free drawing.** The surface knows the six shape kinds and no other geometry; freehand strokes, hand-drawn arrows and pen input are not part of it.
- A **connection** runs between cards only; it cannot be attached to a shape or a group.
- A link in the text of a card does **not** appear in the link graph or in the backlinks: the area index skips the content of code blocks.
- The surface is operated with the mouse; the keyboard carries undo, delete and the text entries.
- A surface belongs to its document. Cards cannot be dragged from one surface to another.
