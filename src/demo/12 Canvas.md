---
title: Canvas
tags: [demo, visual]
chapter: 12
topic: visual
---

# Canvas

A `perspective-canvas` block turns a piece of a document into a **spatial working surface**: cards carry their own Markdown, lines carry the relations between them. Nothing leaves the file — the whole surface is plain text in this very page. Back to [[00 Welcome]].

## The surface below

This is what it looks like in the source:

````markdown
```perspective-canvas
!karte k1 x=-340 y=-170 b=260 h=130
## Collect

Everything that turns up goes here first, unsorted.

!karte k2 x=60 y=-170 b=260 h=130
## Sort

Group by topic, throw away duplicates.
```
````

Rendered, the block below shows what the surface holds and offers a way into it. Switch to the canvas view with `Ctrl+6` — or use the button in the block — and then drag a card, pull a line from one of its handles, or double-click the empty background to add a card of your own.

```perspective-canvas
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

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
first pass

!linie e2 k3 <-> k4 von=rechts nach=links
back and forth
```

## How to read the block

Every element starts with a marker in column 0; the lines below it are its content.

| Piece | Meaning |
| ----- | ------- |
| `!karte k1 x=… y=… b=… h=…` | a card, its top left corner and its size in pixels, counted from the centre of the surface |
| `!linie e1 k1 -> k2` | a line from card `k1` to card `k2`, with an arrow head at `k2` |
| `<->` instead of `->` | an arrow head at both ends; `--` draws no arrow head at all |
| `von=` / `nach=` | which side of each card the line attaches to: `links`, `rechts`, `oben`, `unten` or `auto` |
| `farbe=blau` | one of eight named colours from the colour scheme |
| the lines under a marker | the card text, or the label of a line |

Insert an empty surface of your own with **Insert → Canvas** from the editor context menu, then fill it. The canvas view is switchable under **Settings → Extensions**; turned off, the block above is an ordinary code block and nothing is lost.

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:
