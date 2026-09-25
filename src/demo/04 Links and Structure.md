---
title: Links and Structure
tags: [demo, structure]
chapter: 4
topic: structure
---

# Links and structure

Wiki links weave the files into a network. Back to [[00 Welcome]].

## Wiki links

```markdown
[[03 Tables]] links by file name.
[[03 Tables|the tables page]] sets custom display text.
```

[[03 Tables]] links by file name, and [[03 Tables|the tables page]] shows custom text. An anchor jumps inside a file: [[01 Markdown Basics#Lists]].

## Block anchors

A caret at the end of a line anchors the whole block, so a link can point at one single statement instead of a whole file:

```markdown
This decision is binding. ^decision-1
```

This decision is binding. ^decision-1

The link [[04 Links and Structure#^decision-1]] jumps straight to it. The rendered view hides the anchor entirely; the live view replaces it with a discreet marker at the end of the line — hover it to read the identifier, click it to edit the raw text. Anchors also carry [[05 Properties and Profiles|block properties]].

The same notation reaches a single row of a database table: [[Library#^r-00016]] points at one record of [[Library]] instead of the whole file. Such a link counts as valid as long as the table carries that record.

## Tags

```markdown
Filed under #demo and #structure, more precisely #structure/links.
```

Filed under #demo and #structure, more precisely #structure/links — click a tag to filter the Tags sidebar. These same tags feed the live lists on [[08 Queries]].

A slash builds a hierarchy: `#structure/links` sits below `#structure`, and a query for the parent finds the child as well. Right-click a tag in the sidebar to rename it across the whole area; the sub-tags come along, and a preview shows every occurrence before anything is written.

## Backlinks and outgoing links

Every page here links back to [[00 Welcome]], so its **Backlinks** panel lists them all. Open **View → Backlinks** and **View → Outgoing links** to see both directions for whichever file is active.

## Subpages

Pages can nest without moving files around. The separator in the file name is a special division slash you never type by hand — create subpages with **File → New Subpage…**. In links you just write a normal slash:

```markdown
[[04 Links and Structure/Details]]   a subpage of this page
[[/Details]]                         a subpage of the CURRENT page
[[..]]                               the parent page
```

Renaming a subpage changes only its own name segment — in the dialog as well as in the title line above the document, where the parent part stays dimmed and unchangeable. **File → Detach from parent page…** turns a subpage back into a standalone page and takes its own subpages along.

## The graph

**View → Area graph** draws every file as a node and every link as an arrow — a live map of this whole area. The **File graph** panel does the same for the neighbourhood of the active file.

## The mindmap

While the graph maps files against each other, the **mindmap** maps the inside of one file. Press `Ctrl+5` on this very page (or **View → Mind map**): every heading and list item becomes a node, and the paragraphs turn into notes you can open on the node. The circle at the end of a branch folds it away, a click on a node text jumps back to the line it came from, and **Settings → Mind map** decides where the root sits — left, centre, right, top or bottom. While the map is shown, `Ctrl+F` searches the map itself: type `link`, and every node whose title or note contains it is highlighted, the current one is brought to the centre, and `F3` moves on to the next.

Metadata comes next: [[05 Properties and Profiles]].
