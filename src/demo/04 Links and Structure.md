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

## Tags

```markdown
Filed under #demo and #structure.
```

Filed under #demo and #structure — click a tag to filter the Tags sidebar. These same tags feed the live lists on [[08 Queries]].

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

Metadata comes next: [[05 Properties and Profiles]].
