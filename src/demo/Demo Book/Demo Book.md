---
title: Demo Book
author: The Demo-Area
status: draft
cover: ../attachments/demo-image.png
tags: [book]
---

# Demo Book

This is the **book file**. It is an ordinary Markdown file holding the front matter of the book: title, author, status and a cover reference live in the frontmatter above, exactly as in any other document.

What makes this folder a book is the file next to it, `Book_Settings.mdda`. It names this file as the book file and carries the chapter tree. Nothing in the text below points back at it — the recognition runs one way only.

> [!tip] Open it as a book
> Use **File → Open Book…** and pick this folder. The table of contents appears in the sidebar, and the chapters below become a single reading path.

## What to try here

1. Walk the book with the forward and back buttons in the panel header, or with `Ctrl+Alt+Page Down` and `Ctrl+Alt+Page Up`. The path runs 01 → 02 → 03 → 04, even though the files sit in two different folders.
2. Drag a chapter by the marker in front of its name. The order changes, the files do not move.
3. Look at the bottom of the panel: `Notes to Self` sits under **Not linked in**, because no chapter claims it. Link it in from its context menu, then unlink it again.
4. Open `Book_Settings.mdda` in a text editor afterwards and compare it with what the panel shows.

## The chapters

- [[01 Setting Out]] — leaving, and what gets left behind
  - [[02 The Harbour]] — a sub-chapter, and it lives in the `Parts` subfolder
- [[03 Storms and Detours]] — the middle part, also in `Parts`
- [[04 Homecoming]] — the end, back in the book folder itself

The list above is written by hand, as ordinary links. The real outline is the one in the companion file; that is what the panel reads.
