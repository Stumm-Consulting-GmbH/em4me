---
title: Canvas
tags: [demo, visual]
chapter: 12
topic: visual
---

# Canvas

A `perspective-canvas` block turns a piece of a document into a **spatial working surface**: cards carry their own Markdown, lines carry the relations between them, groups tie together what belongs together, and shapes set marks beside them. A card can also show another document or an image from the area instead of its own text. Nothing leaves the file — the whole surface is plain text in this very page. Back to [[00 Welcome]].

## The surface below

This is what it looks like in the source:

````markdown
```perspective-canvas
!gruppe g1 x=-380 y=-210 b=760 h=230 farbe=blau
Before writing

!karte k1 x=-340 y=-170 b=260 h=130
## Collect

Everything that turns up goes here first, unsorted.

!karte k2 x=60 y=-170 b=260 h=130
## Sort

Group by topic, throw away duplicates.

!karte k5 x=-340 y=240 b=300 h=170 doc="04 Links and Structure.md#Backlinks and outgoing links"
What backlinks are

!karte k6 x=20 y=240 b=260 h=170 bild="attachments/demo-image.png"
The demo image

!form f1 x=400 y=60 b=130 h=130 art=stern rand=gelb füllung=gelb
Do this first
```
````

Rendered, the block below shows what the surface holds and offers a way into it. Switch to the canvas view with `Ctrl+6` — or use the button in the block — and then drag a card, pull a line from one of its handles, or double-click the empty background to add a card of your own. Drag the blue group and watch the two cards inside it come along. The two cards in the bottom row carry no text of their own: one shows a section of another page, the other the demo image — a double-click on what they show opens it.

```perspective-canvas
!gruppe g1 x=-380 y=-210 b=760 h=230 farbe=blau
Before writing

!karte k1 x=-340 y=-170 b=260 h=130
## Collect

Everything that turns up goes here first, unsorted.

!karte k2 x=60 y=-170 b=260 h=130
## Sort

Group by topic, throw away duplicates.

!karte k3 x=-340 y=60 b=260 h=130
## Write

One page per topic, in the order that reads best.

!karte k4 x=60 y=60 b=260 h=130
## Review

Read it again after a night. Cut what repeats.

!karte k5 x=-340 y=240 b=300 h=170 doc="04 Links and Structure.md#Backlinks and outgoing links"
What backlinks are

!karte k6 x=20 y=240 b=260 h=170 bild="attachments/demo-image.png"
The demo image

!form f1 x=400 y=60 b=130 h=130 art=stern rand=gelb füllung=gelb
Do this first

!form f2 x=400 y=-170 b=180 h=130 art=abgerundet rand=türkis

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
first pass

!linie e2 k3 <-> k4 von=rechts nach=links
back and forth
```

## The list beside the surface

A surface grows, and what lies outside the visible section is hard to find by eye. The **canvas list** puts everything on the displayed surface into one list — cards, shapes and groups in stacking order, and under each card the connections attached to it. Open it with the list button in the status bar or through **View → Sidebar → Panels → Canvas list**.

Click a row and the element is selected on the surface and moved into the centre; select something on the surface and its row lights up. From the list the surface can be worked without a mouse:

| Key | What it does |
| --- | ------------ |
| `Arrow up` / `Arrow down` | walk through the rows; the surface follows |
| `Home` / `End` | jump to the first or the last row |
| `Enter` | edit the selected element |
| `Del` | delete it |
| context-menu key or `Shift+F10` | open its context menu — try “Add connection to canvas…” and pick the target with the arrow keys |
| `Escape` | drop the selection |

Type into the filter field at the head of the list to narrow it down: `sort` finds one card above, `backlinks` finds the link card by its target. In the canvas view `Ctrl+F` goes straight into that field instead of opening the search bar.

## How to read the block

Every element starts with a marker in column 0; the lines below it are its content.

| Piece | Meaning |
| ----- | ------- |
| `!karte k1 x=… y=… b=… h=…` | a card, its top left corner and its size in pixels, counted from the centre of the surface |
| `!linie e1 k1 -> k2` | a line from card `k1` to card `k2`, with an arrow head at `k2` |
| `<->` instead of `->` | an arrow head at both ends; `--` draws no arrow head at all |
| `von=` / `nach=` | which side of each card the line attaches to: `links`, `rechts`, `oben`, `unten` or `auto` |
| `farbe=blau` | one of eight named colours from the colour scheme |
| `!form f1 … art=stern` | a shape, one of `rechteck`, `abgerundet`, `oval`, `dreieck`, `raute` and `stern` |
| `rand=` / `füllung=` | outline and fill of a shape, from the same eight names; `füllung=keine` leaves it unfilled |
| `!gruppe g1 x=… y=… b=… h=…` | a group rectangle; whatever lies completely inside it travels along when the group is moved |
| `doc="…"` on a card | the card shows the content of that document instead of its own text — the whole of it, or from a heading or a block onwards |
| `bild="…"` on a card | the card shows that image, fitted and keeping its proportions |
| the order of the markers | the stacking order across cards, shapes and groups: further down means further to the front |
| the lines under a marker | the card text, or the label of a line, a shape, a group, a link card or an image card |

Insert an empty surface of your own with **Insert → Canvas** from the editor context menu, then fill it. The canvas view is switchable under **Settings → Extensions**; turned off, the block above is an ordinary code block and nothing is lost.

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:
