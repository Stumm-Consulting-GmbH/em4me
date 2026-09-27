---
title: The Harbour
tags: [book, chapter]
---

# 02 — The Harbour

Gulls, rope, wet stone, and the particular impatience of people waiting for weather. The harbour is where a journey stops being a plan.

## A sub-chapter in a subfolder

This file lives in `Parts`, one level below the book folder. In the table of contents it appears indented under [[01 Setting Out]] — not because of the folder, but because the companion file says so:

```json
{
  "path": "01 Setting Out.md",
  "children": [{ "path": "Parts/02 The Harbour.md", "children": [] }]
}
```

Paths are always written relative to the book folder, with forward slashes.

## Try it

- Focus this row in the panel and press `Alt+←`. The chapter moves up one level, behind its former parent. `Alt+→` puts it back under its predecessor.
- Right-click the row and choose **Move chapter file…**. Pick the book folder itself. The file leaves `Parts`, the outline does not flinch, and the links pointing here are rewritten.

On to [[03 Storms and Detours]].
