# EM4me

A local Markdown editor for Windows and Linux. No account, no cloud, no
subscription: your notes stay files on your own disk.

EM4me edits the Markdown files you already have, in the folders where you
already keep them. Nothing is locked in a database, and what you write never
leaves the machine you write it on.

Downloads, screenshots, manual and roadmap: **[em4me.ch](https://em4me.ch)**

## What it does

- **Four views, one keystroke apart** — read the rendered page, edit the raw
  source, put both side by side, or work in the live view where formatting
  appears as you type and only the current line shows its Markdown.
- **Links that lead somewhere** — wiki links, headline and block anchors,
  embedded documents, tags and backlinks turn your notes into a connected
  set instead of a folder of loose files. Read that net from two sides: as
  a graph that shows it as a surface, or as a tree from a document you
  pick, which lays the same links out in order. A file can also be found by
  typing its name, and the area statistics list the files nothing points to.
  A tag can be renamed everywhere it occurs at once, its hierarchy included.
- **A surface for when order is not enough** — some thoughts have no
  sequence. A canvas is a surface inside an ordinary Markdown file: cards with
  their own text, placed where you put them and joined by labelled, coloured
  lines. Shapes in six types and labelled group rectangles that take their
  members along when moved sit on the same surface, and one stacking order
  decides what lies on top. A card can also show another document — the whole
  file or just one heading or block — or an image from your area, and such a
  reference counts in your network of links like any other. A list beside the
  surface names everything on it, so the surface can be worked entirely from
  the keyboard — create, label, connect, delete — and searched within. Hand the
  document on as portable Markdown and the surface comes along as readable
  text: every card with its own wording, groups and labelled shapes in the
  order they lie in, and a list of the connections; only the placement stays
  behind. A surface can also be written out as a file in the open JSON Canvas
  format and read back in from one, so it can be exchanged with other tools
  that speak that format; what the other side has no equivalent for gets the
  closest substitute, a report after every exchange names what came across and
  what did not, and there is no promise that nothing is lost. Unlike
  the graph it computes nothing, it keeps what you laid out, and because it
  lives as plain text inside the document, the cards stay readable anywhere.
- **Tables that calculate and query** — data tables with typed columns
  calculate live; queries embed file lists that keep themselves current,
  filtered by properties, tags or tasks. All of it stays plain text inside
  your file.
- **A database made of Markdown files** — a file can state in its own head
  that it is a table: which fields it has, of what type, with labels in
  several languages and a key of your choosing. The records live in the body
  of that same file, one line per record, and are shown as a typed table while
  you read and while you write. A link can point at a single record, and a
  table that grows large is spread over several files at the record boundary,
  never inside a record. Because the description travels with the data, a
  table stays complete when you rename it, move it or hand it on, and it stays
  readable in any editor. Records are still written as text in this stage:
  there is no input form and no check of your values on saving yet.
- **Journals from day to year** — daily, weekly, monthly, quarterly and
  yearly entries from your own folder and naming scheme, with built-in
  navigation through the periods.
- **Areas keep projects apart, and can still talk** — bind a window to a
  folder and it becomes a closed workspace: file dialogs, recent files and
  search stay inside it. An area can designate one of its files as a start
  page, so it opens where you want to begin, and its folder tree creates,
  copies, renames and deletes files without leaving the application — a copy
  is made in place with a running number in its name, and deletion goes
  to your system's recycle bin, never straight to nowhere. Where two areas
  belong together, you name the link yourself: give the other area a short
  handle and a link like `[[@handle:File]]` reaches across, templates
  included. The boundary stays closed otherwise — only what you entered is
  ever read. A door, not an open border.
- **Search and replace across a whole area** — searching reaches every file
  of the bound area, not only the open one, and so does replacing. The
  result list doubles as the preview: a checkbox in front of every match
  decides what is exchanged before anything is written. Each file that
  changes keeps its previous version in the document history, even when
  history is switched off, so an entire run can be taken back. The records
  inside a database table stay out of that search, so that a few large tables
  cannot slow down every other search of the area; open the table itself and
  you find them as before.
- **No size limit on a document** — a document that grows beyond about a
  megabyte is split across several files when saving and joined back into
  one when opening: one continuous text, one undo history, one search hit.
  Cuts are made only at headings, so no table, list or code block is ever
  torn apart; a database table is cut between two of its records instead. Every
  part stays an ordinary Markdown file.
- **Every change kept, if you want it** — optional per-document history
  recorded next to the file; compare versions line by line and restore any
  of them. Each entry also records the login name and the machine it came
  from, so a set of documents shared across devices or people stays
  traceable.
- **Saving is all or nothing** — a save writes a shadow copy next to the file
  and only then puts it in place. A crash or power cut in the middle leaves
  your document intact in its last complete state, never half-written; on
  network drives and in synchronisation folders the save retries rather than
  giving up at the first refusal.
- **On paper and on its way out** — print a document straight from the file
  menu through your system's print dialog, export it as PDF, or hand it on as
  portable Markdown with diagrams burned in as images, so the recipient sees
  them without owning the application.
- **Only the features you want** — extra functions are extensions with a
  switch of their own; what you turn off disappears from menus, commands
  and rendering.
- **Your setup travels with you** — colours, shortcuts, buttons, templates,
  bookmarks and the extension switches can be written into a readable Markdown
  file and read back in on another machine, in full or in part, with a preview
  that says beforehand what will be added, replaced, renamed or skipped. A
  page of its own lists every workspace, area, book and bookshelf you entered
  there, with figures on what each holds and the moment those figures were
  taken; nothing is gathered behind your back, and no drive is scanned.
- **Five languages, and a sixth if you need one** — English, German, French,
  Spanish and Italian, for the interface and the built-in manual alike. Beyond
  those, a template of the English text can be translated in your own editor
  and loaded back in; whatever is still missing falls back to English entry by
  entry, so an unfinished translation is already usable.

Markdown rendering follows CommonMark plus a set of extensions, with math
(KaTeX), diagrams (Mermaid) and syntax highlighting (highlight.js).

## Download

Ready-made builds for both platforms are available on the product website:
[em4me.ch](https://em4me.ch), each in two forms — with and without
installation. All builds are 64-bit and need no runtime.

- **Windows**: installer or portable executable. EM4me targets Windows 11;
  Windows 10 should work too.
- **Linux**: `.deb` package for regular installation on Debian and Ubuntu
  systems, or an AppImage that runs without installation. The AppImage
  requires the libfuse2 library, which recent distributions no longer ship
  by default. Runtime behaviour is verified on an Ubuntu 24.04 base with an
  XFCE desktop; anything beyond that is untested compatibility.

Every release ships with SHA256 checksums, published on the website and in
the release entries of this repository, so the files can be verified from
two independent places.

## Building from source

Requirements: Node.js 20 or newer, on Windows. The Linux targets are built
from Windows inside a container — the way electron-builder documents for
foreign targets — so Docker has to be running for that step.

```bash
npm install
npm start           # run the app in development mode
npm test            # unit and snapshot tests
npm run test:e2e    # end-to-end tests (Playwright)
npm run build       # Windows: installer and portable executable
npm run build:linux # Linux: AppImage and .deb package (needs Docker)
```

## Feedback

Bug reports and feature requests are welcome in the issue list of this
repository.

## License

EM4me is licensed under the Apache License 2.0, see [LICENSE](./LICENSE)
and [NOTICE](./NOTICE). Copyright © 2026 Stumm-Consulting GmbH.
