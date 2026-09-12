# My Extended Memory

Anyone who works with this application for a while accumulates containers: [areas](apps-windows.md) for projects, [books](books.md) for longer texts, bookshelves for entire collections, plus the [workspaces](apps-windows.md) you have set up. They are scattered across the disk, on sticks and on network drives, and no view of the application shows them together — every view applies to whatever is open right now.

**My Extended Memory is that shared view.** The page opens via “View → My Extended Memory” or from the command palette as its own tab; it is not editable. In four sections — workspaces, areas, books, bookshelves — each container gets one row with its name, its location and a few key figures.

## What the page shows — and what it does not do

**The page shows what you have added yourself.** It does not scan any drives, it finds nothing on its own, and it makes no claim to completeness. An area you never added is missing here, even if you worked in it yesterday.

That is intentional and not a gap. A search across all connected drives would take a long time, would find folders along the way that are nobody's business, and would depend on which drives happen to be connected. The list you keep yourself is short, dependable and your own order. The note at the top of the page says so permanently, even once the list is well filled.

## Adding a container

“Add container…” opens a block of suggestions.

**Suggested are the most recently opened containers** — areas, books and bookshelves from the recent lists — **and the workspaces you have set up**, grouped by kind. Whatever is already in the list no longer appears among the suggestions. “Add” next to a suggestion takes it in.

**“Choose folder…” is the complete way** and is always there, even when there is nothing to suggest. The familiar folder dialog asks for the folder of the container; the kind is determined by the application itself, in the order **bookshelf, book, area**: if the folder carries the companion file of a bookshelf, it is a bookshelf; if it carries that of a book, it is a book; otherwise it is an area.

Three cases lead to a message instead of an entry:

- The folder **cannot be reached right now** — an unplugged stick, a network drive that is not connected. Only what is readable at the time of adding is added; otherwise the kind cannot be determined.
- The chosen path points to a **file** rather than to a folder.
- The container is **already** in the list. A second entry for the same folder does not come about.

## Removing an entry

“Remove” takes the row out of the list — **and nothing else**. The folder, its files and its companion files remain untouched; a workspace also remains set up. What is removed is the entry, not the container. You can add it again at any time.

## The key figures

Each row carries a timestamp and a short selection: for an area the number of Markdown files, for a book the number of chapters, for a bookshelf the number of books, and in each case the storage occupied.

**The figures are not kept up to date continuously.** They are collected when the container is added and afterwards only when you ask for it: “Collect again” reads the container anew and sets a new timestamp. That is why the timestamp stands in every row — it says which point in time the figures refer to. Anyone who has worked in an area for a week first sees the figures from the week before last here; one click brings them up to today.

A **workspace** has no key figures and no collection button: it is not a folder but an arrangement. What it arranges stands in its row and in the detail view.

### A container that cannot be reached right now

It **stays in the list**, marked “unreachable” and with the last known figures along with their old timestamp. A stick lying in the desk drawer is no reason to lose the entry — the figures from back then are still the information you have. “Open” and “Collect again” have no effect in such a row and are therefore greyed out; “Details” and “Remove” still work.

### An area that is not open

For it, three key figures stay empty: **tags, tasks and the files without an incoming link**. They do not come from counting files but from the directory the application builds for an open area — and that directory exists only while the area is open. The row says so with the note “without index figures; open the area and collect again”.

A directory is **not** built specially for this page. That would cost a full pass for every added area and would turn an overview into a computation. Open the area and collect again afterwards, and all the figures are there.

## The detail view

“Details” unfolds a table below the row showing what the respective container has to offer:

| Kind | Key figures |
|---|---|
| Area | Markdown files, other files, folders, storage used, tags, tasks, files without an incoming link |
| Book | chapters, Markdown files, storage used, the bookshelf it belongs to |
| Bookshelf | books, of those not found, Markdown files, storage used |
| Workspace | area, book, bookshelf, windows, last used |

**Two kinds of emptiness, two signs.** “not available” means: nobody has collected this figure — the tags of an area that is not open, for instance. The dash means: this container has no such thing at all — the book of a workspace that carries none, for instance. **A zero never stands for either**; it is always a counted zero, and an area without subfolders shows it rightly.

For a **book**, the row “Bookshelf” names only a shelf that has itself been added. If the book lies in a shelf that is not listed here, the table says that it is not assigned to any bookshelf on the list — rather than claiming an assignment this page does not know about.

### Opening, and the way to the area statistics

**“Open” in the row** opens the container the familiar way: area, book and bookshelf by the usual rules, a workspace as a switch into it. The detail view has no second open button; the one in the row sits immediately above it.

**For an area, “Open area statistics” is added.** The full [area statistics](apps-windows.md) always apply to the area of **this** window — which is why the area has to be the open one first. If it already is, the statistics open right away. Otherwise the area is opened, and where it ends up depends on what is running: if this window takes it on, the statistics follow here. If it goes to another window — because an area application is already running there or because a new window comes about — a hint says exactly that: the area statistics are in the View menu over there. A jump here would otherwise show the figures of a different area.

## Exporting and importing your own setup

At the top of the page are “Export settings…” and “Import settings…”. They lead onto the same path as “File → Settings → Export…” and “Import…”; everything else — choosing the data kinds, the preview, the report — is on the page [Exporting and importing settings](setup-exchange.md).

The access is here because both serve the same question: what have I set up for myself, and how do I take it along? If the extension “Settings export and import” is switched off, the block is omitted.

**The list of added containers itself never goes along.** It consists of absolute paths of this machine that point nowhere on another one — like the workspaces you have set up and the recent lists, it belongs to what stays bound to the machine.

## Switching it off

The function can be switched off as the [extension](extensions.md) “My Extended Memory”. In the off state the menu entry and the command in the palette are gone; a tab that is already open stays until you close it.

**The list of added containers is kept.** Switching off takes away the access, not the data: after switching on again the list is there unchanged, with all its entries and their most recently collected figures.
