# Books

A book ties several Markdown files into a **declared reading order**. The folder tree of an [area](apps-windows.md) sorts alphabetically, [subpages](subpages.md) carry their hierarchy in the file name; a book, by contrast, writes its outline down explicitly, in a companion file inside the book folder. The chapters themselves stay ordinary Markdown files and remain readable on their own, without the app.

## What a book is

A book lives in a folder of its own. Three things sit inside it:

- the **book file**, an ordinary Markdown file holding the text of the book; properties and an image reference go into the [frontmatter](frontmatter.md) as everywhere else,
- the **companion file** `Book_Settings.mdda`, which names the book file and carries the chapter tree,
- the **chapters** as Markdown files, directly in the book folder or in subfolders of any depth.

A book folder therefore looks roughly like this:

```text
Journey to Ithaca/
  Book_Settings.mdda
  Journey to Ithaca.md
  Part 1/
    Departure.md
    The Harbour.md
  Part 2/
    Homecoming.md
```

### The companion file

The companion file is readably indented JSON. It names the book file and describes the chapter tree; the paths are relative to the book folder:

```json
{
  "schemaVersion": 1,
  "book": { "file": "Journey to Ithaca.md" },
  "chapters": [
    {
      "path": "Part 1/Departure.md",
      "children": [{ "path": "Part 1/The Harbour.md", "children": [] }]
    },
    { "path": "Part 2/Homecoming.md", "children": [] }
  ]
}
```

Two properties of the model follow from this. First, the app recognises a book **from the companion file alone**: a Markdown file is a book file exactly when the companion file of its folder names it. Nothing is written into the Markdown file for that purpose, it carries no back-reference. Second, the **folder location makes no statement about the structure**: where a chapter file sits is free to choose and can be changed at any time, the outline lives solely in the chapter tree.

A chapter belongs to exactly one book and hangs there exactly once. Linking the same file in more than once is not provided for.

## Opening and creating a book

Both ways sit in the **File** menu, next to the area entries:

- **Open Book…** asks for the book folder. If it holds no companion file naming a book file, the app reports that the folder is not a book and changes nothing.
- **New Book…** asks for a parent folder and a name. The app creates the book folder inside it, together with the book file of the same name and the companion file, and opens the book.
- **Close Book** closes the book together with its window and tabs; unsaved changes prompt just as when closing a window.

An open book behaves **like an area**: it opens as its own application with its own window, the window title carries the book name, and the book folder with its subfolders is the working space of that window. Whatever lies outside the book folder is neither visible nor usable there; images and attachments of a book therefore belong inside the book folder. Two books are never in the same window: if the book is already running, the app jumps to its window, and a second book opens its own. On opening, the book file appears as a tab, the table of contents is shown, and an open book is restored on the next start. A chapter can also be opened in the ordinary way, without any book context; it stays a normal Markdown file.

## The table of contents

The **Book** panel shows the chapter tree in its declared order. A click opens a chapter, the one currently being read is highlighted. In front of every name sits a marker, which doubles as the handle for maintenance. The panel is toggled like any other: via the button in the status-bar strip or via View → Sidebar → Panels → Book. Side, order and tab groups follow the rules of the [sidebar](sidebar.md).

### Files that are not linked in

Below the tree sits the section **Not linked in** with the Markdown files of the book folder that hang in no chapter. They are not hidden but stay visible and operable, so that it is clear what is still waiting for its place. The book file itself never appears there, it is not a chapter.

## Maintaining the chapter structure

All three ways change **only the declaration** in the companion file. No file is moved, renamed or deleted in the process.

### Dragging

The marker in front of a chapter name drags the chapter together with its sub-chapters. Where it lands is decided by the spot above the target row: the upper third places it before, the lower third after, the middle links it in as a sub-chapter. A drop on the free area of the panel appends to the end of the top level. An entry from “Not linked in” travels into the tree the same way. Dragging a chapter under one of its own sub-chapters is ruled out.

### Keyboard

While a row has the focus, these fixed inputs act on the chapter together with its sub-chapters:

| Input | Effect |
|---|---|
| `Alt+↑` / `Alt+↓` | one position up or down within the level |
| `Alt+→` | nest: becomes the last sub-chapter of its predecessor |
| `Alt+←` | unnest: moves one level up, behind its former parent chapter |
| `Enter` / `Space` | open the chapter |

At the edge of a level the tree stays unchanged and reports nothing: there simply is no target.

### Context menu

A right-click on a row offers:

- **New chapter** creates a file and links it in right away. The name is typed directly in the panel; the file is created in the folder of the parent chapter, at the top level in the book folder.
- **Unlink** takes the entry out of the tree. The file remains and afterwards appears under “Not linked in”.
- **Link in** is the reverse way on a file that is not linked in; it moves to the end of the top level.

On the free area of the panel, a right-click creates a new chapter at the top level.

## Reading across chapter boundaries

Two buttons in the panel header page one position forward and back; the same steps are available as commands in the palette and by default on `Ctrl+Alt+Page Down` and `Ctrl+Alt+Page Up`. The guidance follows the reading order of the tree: a chapter comes before its sub-chapters, then its siblings follow.

There is no wrap-around at the ends. Instead of silently jumping to the other end, the status line reports that the start or the end of the book has been reached; the buttons are disabled there. Files that are not linked in stay outside the guidance.

## Moving chapter files

Because the folder location is free, changing it has a command of its own: **Move chapter file…** in the context menu of an entry. It asks for a target folder inside the book folder and moves the file there. Two things follow along:

- the **references** to the file from other documents,
- the **chapter tree**, whose entry keeps the same place and the same sub-chapters.

A target outside the book folder is rejected, as is a target that already holds a file of that name. The book file itself cannot be moved. Renaming a chapter file works as for any other file and updates the chapter tree just the same.

## Repairing missing chapters

If a chapter file is moved or deleted outside the app, its entry points into the void. It does not vanish but stays in the table of contents and is marked as **missing**; it cannot be clicked, because there is nothing to open.

If a file of the same name exists elsewhere in the book folder, the row additionally carries a search sign as a re-finding suggestion. It is never carried out on its own. The context menu of the entry offers two ways:

- **Reassign…** opens a choice below the row. A single find with the same name is highlighted and preselected there; next to it, “Choose another file…” leads to a free choice inside the book folder.
- **Unlink** removes the entry when the chapter really is gone.

As soon as the assignment is in place, the row loses its marking.

## Bookshelves

A bookshelf groups books. It lives in its own folder holding the **shelf file** (an ordinary Markdown file with the shelf's descriptive text; properties and the `cover` image reference sit in the [frontmatter](frontmatter.md) as everywhere), the **companion file** `Shelf_Settings.mdda`, and the **books** as book folders directly below. The hierarchy ends at the shelf; there are no shelves inside shelves.

```json
{
  "schemaVersion": 1,
  "shelf": { "file": "My Library.md" },
  "books": ["Journey to Ithaca", "Cookbook"]
}
```

The companion file names the shelf file and lists the assigned books in their order. As with books, the application recognises a shelf **by the companion file alone**; the shelf file carries no back reference.

### Opening and creating a shelf

The entries sit in the **File** menu, next to the book entries: **Open Bookshelf…** asks for the shelf folder (a folder without a named shelf file is rejected with a message), **New Bookshelf…** creates folder, shelf file and companion file, **Close Bookshelf** closes the shelf together with its window. Opening the shelf file itself also opens the shelf.

An open shelf behaves **like an area**, exactly as a book does: it opens as its own application with its own window, the window title carries the shelf name, and the shelf folder is the working space of that window. If the shelf is already running, the app jumps to its window. An open shelf is restored on the next start.

The shelf window holds the **shelf level** only: every reach into a book, be it the book file or a chapter file, leads to that book's window, and the file opens there. In the shelf window itself, only files directly inside the shelf folder open, such as the shelf file with its description text. That way chapters of different books never share a window.

### The shelf view

An open shelf appears as its own page in the tab system. Two layouts are available, switchable in the view and remembered per shelf: **tiles** show the book images as a grid; a book without an image reference gets a placeholder tile with its title. **Rows** show image, name, chapter count, author and description. A click opens the book in its own window; the shelf stays behind as the overview.

Below the stock sits the section **Not assigned** with the book folders of the shelf folder that are not yet assigned to the shelf; **Add to shelf** assigns them, **Remove** takes an assignment away without touching the book folder. An assigned book whose folder is missing stays visible and is marked as missing.

## Switching on and off

Books and bookshelves together are a switchable extension (Settings → [Extensions](extensions.md), group Tools) and are on out of the box. In the off state the menu entries, the commands, the panel and the shelf view disappear; book and shelf files then open like any other Markdown file. Book file, shelf file, companion files and chapters stay untouched, and switching back on brings the state back unchanged.
