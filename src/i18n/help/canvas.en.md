# Canvas surface

A **canvas** is a spatial working surface inside an ordinary Markdown document: **cards** carrying their own text are placed freely on it, and **connections** draw the relations between them. Whenever alternatives are laid side by side, a workflow is sketched or thoughts are sorted out first, the order here comes from position rather than from sequence.

The surface is carried by a code block with the language tag `perspective-canvas`. A document may contain any number of them, and everything else in it remains ordinary Markdown.

The function belongs to the [internal extensions](extensions.md) (“Canvas view”). Switched off, the block stays an ordinary code block, the view mode disappears, and the commands for surface and card are gone. The document remains fully readable; nothing is lost.

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

- A **click** selects a card, a click on the background clears the selection. At most one element is selected at a time — a card or a connection.
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

## Undo

`Ctrl+Z` takes back the last action on the surface, `Ctrl+Y` and `Ctrl+Shift+Z` restore it. Every action is exactly one step: a card moved, a size changed, a connection created, a text edited. While the text entry of a card or a connection is open, `Ctrl+Z` applies to the text being typed there.

## Navigating

- **Pan** — drag the empty background with the mouse button held down.
- **Zoom** — mouse wheel over the surface, centred on the pointer.
- **Fit** — on entering the view and on switching the surface, the section fits itself to the content.

## Viewing only

The surface follows the editability of its document. While the document is in plain display, with the edit mode switched off, the surface is **view-only**: no handles, no dragging, no creating, no text entry, no toolbar, and the context menu stays empty. Panning, zooming and selecting an element by click remain allowed, because they do not touch the document.

The edit mode releases the handling — pen icon in the status bar, default `Ctrl+E`; the details are on the page [Views and display](views-display.md).

## The surface outside the canvas view

Because the surface lies in an ordinary Markdown document, it turns up in every view of that document:

| View | What appears |
| ---- | ------------ |
| Source | the block in plain text — this view **is** the source |
| Split | plain text on the left, the summary block on the right |
| Rendered | **the summary block**: kind, size in cards and connections, a preview of the card texts and the button “Open canvas view” |
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

The **order inside the block is also the stacking order**: what stands further down lies further to the front.

### Two rules that protect the file

- **The escape for the exclamation mark.** A content line that starts with `!` gets a backslash in front of it when written and loses it again when read: the document holds `\!Careful`, the card shows `!Careful`. If the line is meant to read literally `\!Careful`, the document holds `\\!Careful`.
- **What is unknown is kept.** A marker or an attribute the app does not know is carried along and written back unchanged; an element that has not been changed is written out verbatim. Open a surface, save it without a change, and you get the same file back. A faulty attribute throws nothing away either: the element is then drawn conspicuously or not at all, but it never disappears from the file.

### An example

````markdown
```perspective-canvas
!karte k1 x=-320 y=-140 b=260 h=120
## Starting point

The import reads only one source today.

!karte k2 x=40 y=-140 b=260 h=120
## Target picture

Several sources, one merge.

!karte k3 x=-140 y=120 b=260 h=160
## Open question

How are conflicts resolved?

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
!karte k1 x=-320 y=-140 b=260 h=120
## Starting point

The import reads only one source today.

!karte k2 x=40 y=-140 b=260 h=120
## Target picture

Several sources, one merge.

!karte k3 x=-140 y=120 b=260 h=160
## Open question

How are conflicts resolved?

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
leads to

!linie e2 k3 -- k1
sketch for it

!linie e3 k2 <-> k3 von=unten nach=oben
depend on each other
```

## Limits

- A card carries **its own text**; there are no other kinds of card. Geometric shapes and group frames are not part of the surface.
- A link in the text of a card does **not** appear in the link graph or in the backlinks: the area index skips the content of code blocks.
- The surface is operated with the mouse; the keyboard carries undo, delete and the text entries.
- A surface belongs to its document. Cards cannot be dragged from one surface to another.
