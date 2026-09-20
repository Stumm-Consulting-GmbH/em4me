# Canvas surface

A **canvas** is a spatial working surface inside an ordinary Markdown document: **cards** carrying their own text are placed freely on it, **connections** draw the relations between them, **shapes** set marks beside them, and **groups** tie together what belongs together. A card either carries its own text or shows the content of another document or an image from the area. Whenever alternatives are laid side by side, a workflow is sketched or thoughts are sorted out first, the order here comes from position rather than from sequence.

The surface is carried by a code block with the language tag `perspective-canvas`. A document may contain any number of them, and everything else in it remains ordinary Markdown.

The function belongs to the [internal extensions](extensions.md) (“Canvas view”). Switched off, the block stays an ordinary code block, the view mode disappears, and the commands for surface, card, link card, image card, shape, group and stacking order are gone — and with them the **Edit canvas** entry in the **View** menu, which does not stay behind empty. The document remains fully readable; nothing is lost.

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
- The command **“Add card to canvas”** (command palette, View → Edit canvas, assignable shortcut) places it in the middle of the visible section. Outside the canvas view it reports in the status bar that cards can only be added there.

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

### Link cards

Instead of carrying its own text, a card can show the content of **another document** — the whole of it, or from a heading or a block onwards. The content stays where it is: the card holds no copy and cannot be changed in this place. If it does not fit into the card, the card scrolls.

- **Creating** — the command **“Add link card to canvas”** (command palette, View → Edit canvas) places it in the middle of the visible section, a right-click on the empty background at the click position. Both ask for the target first: `Enter` creates the card, `Escape` cancels. Without a target no card is created.
- **Setting, changing, removing the target** — a selected card carries a **toolbar** with the field “Link target”; while typing it offers the documents of the area. That turns a text card into a link card, and “Remove link” turns it back into a text card — its own text stays in place. The same actions are in the **context menu** of the card.
- **Opening the target** — a **double-click on the shown content** opens the linked document at the linked place, and so does “Open target” in toolbar and context menu. That stays allowed in the pure display as well, because opening changes nothing.
- **Header line** — it names the **label** of the card, that is its own text, and otherwise the target including the anchor. A double-click on the header line edits the label like the text of any other card.

If the target cannot be found, the card stays and names, in place of the content, what it looked for; nothing changes in the file. If the target is edited in another open document, the card follows right away; a change to a file that is open nowhere appears the next time the surface is drawn.

### Image cards

A card can just as well show an **image** from the area. Here, too, it holds no copy: the image stays a file and the card points to it — through a path relative to the document or through the bare file name. It is **fitted** into the card and keeps its proportions; an image card does not scroll.

It is operated like the link card: the command **“Add image card to canvas”** and the same entry in the context menu of the surface, in the toolbar of the selected card the field “Image” — with the image files of the area as suggestions — as well as “Remove image” and “Open target”. A double-click on the image opens the file the way the application opens any [attachment](attachments.md). The header line names the label and otherwise the name of the image file.

If the image cannot be found, is too large or carries no image extension, the card says so in place of the image. **A card shows either a document or an image;** if both attributes stand side by side, the document applies.

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
- The command **“Add shape to canvas”** (command palette, View → Edit canvas, assignable shortcut) places a rectangle in the middle of the visible section.

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

Two ways lead there: the **context menu** of the element and **View → Edit canvas → Canvas stacking order**. The same commands are in the command palette (default `Ctrl+K`); no shortcuts are preassigned, and they can be given in the settings.

**New elements have their place:** a new group appears at the very back, a new shape and a new card at the very front.

**Connections are not affected.** They are drawn in a layer of their own below all elements and cannot be moved within the order.

## Undo

`Ctrl+Z` takes back the last action on the surface, `Ctrl+Y` and `Ctrl+Shift+Z` restore it. Every action is exactly one step: a card moved, a size changed, a connection created, a text edited. While the text entry of a card or a connection is open, `Ctrl+Z` applies to the text being typed there.

## Navigating

- **Pan** — drag the empty background with the mouse button held down.
- **Zoom** — mouse wheel over the surface, centred on the pointer.
- **Fit** — on entering the view and on switching the surface, the section fits itself to the content.

## Card list and operation without a mouse

Beside the surface a **canvas list** can be shown. It lists what lies on the surface currently displayed and thereby makes the surface **enumerable**: an element outside the visible section can be found through the list without searching the surface, and a connection that runs underneath a card can be hit there reliably.

Three ways show and hide the list, as with every other panel of the [sidebar](sidebar.md): the **button** in the status bar, **View → Sidebar → Panels → Canvas list** and the command palette (default `Ctrl+K`). No shortcut is preassigned; one can be given in the settings. The state holds per column and survives a change of document as well as a restart. With the canvas view switched off as an [internal extension](extensions.md) the list is gone — neither the button nor the menu entry nor the entry in the command palette remains.

### What the list shows

- **Every kind of element** — cards, shapes and groups, each row recognisable by its kind.
- **Below each card its connections**, each with direction and counterpart. A fold handle on the card shows and hides them.
- **The order of the list is the stacking order:** what stands further down in the list lies further to the front on the surface. A second display of the order is therefore not needed.
- If the document carries **several surfaces**, the list belongs to the one currently displayed; switching through the tab strip switches the list along.
- A row above the list names the **number of elements** — or says in its place that no document is open, that the document carries no surface, or that the surface is still empty.

**Selection and list show the same thing, in both directions.** What is selected on the surface is highlighted in the list; what is selected in the list is highlighted on the surface and moves **into the centre of the section** — the zoom level stays as it is. If the document is not in the canvas view, selecting an entry leads there first; if the document carries no surface at all, the status bar says that there is no such view for it.

### The keys in the list

| Key | Effect |
| --- | ------ |
| `Arrow up`, `Arrow down` | to the previous or next row; the surface selects along and moves the element into the centre |
| `Home`, `End` | to the first or last row |
| `Enter` | edits the selected element — the text of a card, the label of a shape, a group or a connection |
| `Del` | deletes the selected element |
| context-menu key, `Shift+F10` | opens the context menu of the element; without a selected element the menu of the surface with its ways of creating |
| `Escape` | drops the selection |

Editing and deleting require an editable document and an open canvas view. If one of the two is missing, the status bar says so rather than quietly doing nothing; in a document that cannot be changed the list still shows and selects.

### Adding a connection without a mouse

The entry **“Add connection to canvas…”** in the context menu of a card starts the **target selection in the list**. It runs in two steps, because a connection has two ends and without a pointer there is no place where the counterpart could be named in passing:

1. The starting card is the selected card.
2. The list then walks over the **remaining cards** only, and the row above it says that a target is to be chosen. `Enter` confirms, a click on a card row does the same, `Escape` cancels and restores the state from before.

The attachment sides are determined by the application from the position of the two cards; they can be changed afterwards on the toolbar of the selected connection. If there is no second card, the status bar says so.

### Searching within the surface

At the head of the list stands a **filter field**. It narrows the list to the elements that contain the text entered. Searched are

- the **text** of a card as well as the label of a shape and of a group,
- the **link target** of a link card and the **image name** of an image card,
- the **label** of a connection.

The search runs as one contiguous string, without regard to upper and lower case — the same rule as in the command palette; patterns and fuzzy matches do not exist. The matches are highlighted in the row, the row above the list counts them, and if nothing remains it says so rather than emptying the list without a word. A card stays when one of its connections matches; when the card itself matches, all its connections stay with it. While a filter is running the cards are unfolded — a match under a folded card would be none.

| Input | Effect |
| ----- | ------ |
| `Enter` | jumps to the match: selected, centred, focus in the list. Taken is the selected row if it is among the matches, otherwise the first one |
| `Arrow down` | the same; from there the arrow keys walk through the remaining matches |
| `Escape` | clears the field without touching the selection. With an empty field it does not take effect |

**`Ctrl+F` leads into this field in the canvas view** and not into the search bar. The reason: whoever searches in this view searches on the surface in front of them; the search bar, by contrast, searches the document text and shows its matches where nothing is to be seen in this view. In every other view `Ctrl+F` opens the search bar unchanged, and with the canvas extension switched off there is no such view and therefore no such switch either.

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

## The surface in the portable export

**File → More File Functions → Export → Portable Markdown…** writes a version of the document that says something even without this application. In it, every surface stands as its **Markdown equivalent**: the same content and the same web of relations, in ordinary Markdown. Without it the recipient would get a code block full of coordinate lines and nothing to do with it.

| On the surface | In the export |
| -------------- | ------------- |
| the surface itself | a bold head line from its title — the first line of its first card — and its size, the same statement as in the header line of the block |
| a card | its text, **unchanged**; headings inside it stay as they are, and no invented heading appears above the card |
| a link card | its label, below it the link in the same notation as in the rest of the document text |
| an image card | its label, below it the image as an embed |
| a group | a bold line with its name; directly below it stand the elements that lie inside it |
| a shape with a label | a bullet point from its kind and its label; a shape without a label is left out |
| the connections | **one** list at the end of the surface, each line with both cards, the sign of their direction and, where present, the label |
| a faulty attribute | a note line at the element concerned — or at the end of the surface, if it belongs to no element |

The order is that of the block and thus the stacking order that the canvas list shows as well. **Nothing is shortened:** every card appears in full, unlike in the capped preview of the block. If the document holds several surfaces, each one gets its own head line and its own list of connections.

This surface

````markdown
```perspective-canvas
!gruppe g1 x=-300 y=-160 b=600 h=200 farbe=blau
Analysis

!karte k1 x=-260 y=-120 b=240 h=120
Starting point

!karte k2 x=40 y=-120 b=240 h=120
Target picture

!karte k3 x=-100 y=140 b=240 h=120 doc="Concepts/Import.md#Target picture"
Target picture in the concept

!form f1 x=220 y=140 b=120 h=120 art=stern rand=rot
Key point

!linie e1 k1 -> k2 von=rechts nach=links
leads to
```
````

reads like this in the portable export:

```markdown
**Starting point · 3 cards, 1 connection, 1 shape, 1 group**

**Analysis**

Starting point

Target picture

Target picture in the concept

[[Concepts/Import.md#Target picture]]

- Star: Key point

**Connections**

- Starting point → Target picture: leads to
```

**What does not travel along is the spatial arrangement.** The export renders content and relations, not a picture: what lay side by side and what lay far apart is not in it. The groups are the only thing that carries over from the arrangement, because they hold the mental structure of the surface. And the equivalent is an **output, not a second storage form** — no surface can be won back from it. The original stays untouched in your own document: the export reads the surface and does not write into it.

**Printing and PDF export are not affected by this.** They still follow the rendered view and show the surface as a block, as described in the chapter above.

**If the canvas view is switched off as an [internal extension](extensions.md)**, the surface stays a readable code block in the export too — the same statement this page already makes for the rendered view: the document stays readable, and nothing is lost.

## Exchanging with other tools

A surface does not have to stay inside this application. It can be saved as a file in the open **JSON Canvas** format — extension `.canvas` — which other tools read as well; conversely, such a file can be read in here. Anyone working with someone who uses a different tool can hand a surface over instead of describing it.

**The storage stays the Markdown file.** The written file is an exchange product and not a second storage format: it is not kept up to date when the surface changes later, and when read in it is read and not adopted.

**Writing a surface out** — in four steps:

1. Open the canvas view. If the document carries several surfaces, pick the tab of the one you want: what is written out is the surface currently on screen.
2. Choose **File → More File Functions → Export → Canvas as JSON Canvas…**.
3. The save dialog offers the name of the document with the extension `.canvas` in the folder of the document; name and place can be changed.
4. Once the file is written, a message appears with what was transferred and what was not.

The entry can only be chosen while the canvas view shows a surface; otherwise it stands there visible but greyed out. The document itself stays untouched, and if it carries further surfaces, the message names how many.

**Reading a file in** — in four steps:

1. Choose **File → More File Functions → Import → JSON Canvas file…**. Neither an open surface nor an open document is needed for this.
2. In the open dialog pick one or more files with the extension `.canvas`; with an area open they have to lie inside it.
3. For each chosen file a new document is created **next to it**, with its name and the extension `.md`. If that name is already taken, a number is appended: `Plan.canvas` then becomes `Plan-2.md`. Every new document is opened and shows the canvas view.
4. Afterwards **one** message covers all chosen files, with a section for each of them.

The chosen files stay where they are, unchanged. **Links find their files** when the file read in lies in its place inside the folder taken over — the usual case when a whole foreign collection is adopted; a target that cannot be found that way afterwards stands on the card with its bare file name and is named in the message.

**After every exchange the application says what was transferred and what was not** — each with a count, and also when everything came along. The message is not an error message but the receipt of the exchange: the two formats do not cover each other completely, and what does not match should not happen silently.

**What becomes of the surface when writing out:**

| On the surface | What becomes of it |
| -------------- | ------------------ |
| a card, a group, a connection | the same over there, with position, size, order, colour and caption |
| a shape | a text card in the same place and the same size, with its caption as text and its outline colour as the colour of the card; that it was a shape, and its fill, are nowhere any more |
| the caption of a link or image card | a titled frame around that card |
| the colours blue and pink | a colour value, because the other format carries no name for these two |
| an attachment side the application picks itself | no entry at all; the other tool picks the side |
| further surfaces of the same document | nothing — the file carries exactly one surface; the message names how many were left out |
| a faulty or unknown element | nothing; it is counted |

**What becomes of the file when reading in:**

| In the file | What becomes of it |
| ----------- | ------------------ |
| a text card, a group, a connection | the same over here, with position, size, order, colour and caption |
| a simple line break in the text of a card | a hard line break; the card shows the same lines as in the other tool |
| a card pointing at a document or an image | a link card or an image card; a target on a heading or a block is kept |
| a card with a web address | a text card with the address as a link to click |
| a card pointing at another kind of file | a text card with a link to that file |
| the colour of a card | nothing — a card carries no colour here |
| a free colour value on a group or a connection | the nearest of the eight colours |
| a connection starting or ending at a group | nothing; connections run between cards only here |
| an arrow head at the start only | an ordinary directed connection with start and end swapped — without loss |
| a background image of a group | nothing |

**The way out and back does not lead to the starting point.** A surface written out and read in again does **not** come back identical: a shape has become a text card and stays one, the caption of a link card has become a frame. That is the price of the exchange and not a gap — hidden markers by which the original element could be recognised again deliberately do not exist, because they would show up as data rubbish in every other tool.

**If the canvas view is switched off as an [internal extension](extensions.md)**, neither way is available: the entry for writing out and the entry for reading in disappear from the menu, and the two commands cannot be reached through the command palette either.

## Links in the network of the area

A link card is a **link like one in running text** — only on a surface. It therefore appears everywhere the application shows links:

| Place | What appears |
| ----- | ------------ |
| backlinks of the target | the surface as the source, marked with “on a canvas”; the excerpt is the label of the card |
| outgoing links of the document | an entry of the kind “Link card on a canvas”, marked with `C` |
| [Graph view](graph.md) | an edge like any other link |

Backlinks and outgoing links are described in context on the page [Linking](linking.md).

If the target is **renamed or moved**, the attribute in the card follows, like a link in running text; the same holds for the image of an image card.

Two things do not count: an **image** gets no node in the link graph, no more than an image in running text does. And a link in the **own text** of a card stays outside — only the target of the card counts.

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

Two further attributes turn the card into a **link card** or an **image card**:

```text
!karte <id> x=<number> y=<number> b=<number> h=<number> doc="<target>"
!karte <id> x=<number> y=<number> b=<number> h=<number> bild="<image>"
```

`doc=` shows the content of a document. The target takes the same forms as the target of an embed: the document name or a path relative to the own document, optionally followed by `#Heading` or `#^block-id`.

`bild=` shows an image. The value is a path relative to the document or the bare file name of an image file of the area; the permitted extensions are `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp` and `ico`.

If both attributes stand on the same card, `doc=` applies. An empty value and an extension outside the list are a **finding**; the attribute nevertheless stays unchanged in the file. The lines below the marker are the own text of the card here as well — with a link card and an image card, its **label**.

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

!karte k4 x=420 y=-200 b=240 h=160 doc="Concepts/Import.md#Target picture"
Target picture in the concept

!karte k5 x=420 y=-20 b=240 h=140 bild="attachments/sketch.png"
Sketch of the interface

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

!karte k4 x=420 y=-200 b=240 h=160 doc="Concepts/Import.md#Target picture"
Target picture in the concept

!karte k5 x=420 y=-20 b=240 h=140 bild="attachments/sketch.png"
Sketch of the interface

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

- The **shown content** of a link card cannot be changed inside the card; it is changed in the document the card points to. Shapes and groups carry no rendered content at all — at most a label of plain text.
- **Embeds inside the shown content are not resolved.** If a link card shows a document that embeds something itself, that place stays empty in the card; everything else appears unchanged.
- A change to the target appears **right away** as long as the target is being edited in another open document; if a file that is open nowhere is changed, that appears the next time the surface is drawn.
- **There is no free drawing.** The surface knows the six shape kinds and no other geometry; freehand strokes, hand-drawn arrows and pen input are not part of it.
- A **connection** runs between cards only; it cannot be attached to a shape or a group.
- A link in the **own text** of a card does not appear in the link graph or in the backlinks; only the target of a link card counts. An image gets no node in the link graph.
- **Free dragging and zooming do not exist through the keyboard.** The canvas list selects, edits, deletes and creates; the position of an element is changed by the keyboard only through the four commands of the order. Moving, resizing and panning the section stay reserved for the mouse.
- **The list makes the surface operable, not vivid.** It enumerates what lies there and does not replace what the spatial arrangement shows.
- **The search in the area still finds a document with a surface through its text**, because the surface stands in plain text inside it; a source of matches of its own it is not. Single cards, shapes and groups therefore do not appear as matches of their own — those are found by the filter field of the canvas list.
- **The portable export renders the surface as text, not as a picture.** The spatial arrangement does not travel along, and no surface can be won back from the equivalent; what carries over is content, groups and the web of connections.
- **A faulty element is not silently dropped in the export**, but written out with whatever is readable in it and marked with a note line. A shape without a label is left out, though, because nothing of it would remain without the spatial rendering.
- **The exchange with the open format is not a lossless round trip.** A surface written out and read in again does not come back identical: a shape returns as a text card, the caption of a link card as a frame.
- **A file of the foreign format is not opened as a document but read in.** It stays where it is, unchanged; the surface is then carried by the new document next to it, and what is changed there does not travel back into the file.
- A surface belongs to its document. Cards cannot be dragged from one surface to another.
