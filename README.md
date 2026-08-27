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
  set instead of a folder of loose files.
- **Tables that calculate and query** — data tables with typed columns
  calculate live; queries embed file lists that keep themselves current,
  filtered by properties, tags or tasks. All of it stays plain text inside
  your file.
- **Journals from day to year** — daily, weekly, monthly, quarterly and
  yearly entries from your own folder and naming scheme, with built-in
  navigation through the periods.
- **Areas keep projects apart** — bind a window to a folder and it becomes
  a closed workspace: file dialogs, recent files and search stay inside it.
- **Every change kept, if you want it** — optional per-document history
  recorded next to the file; compare versions line by line and restore any
  of them.
- **Only the features you want** — extra functions are extensions with a
  switch of their own; what you turn off disappears from menus, commands
  and rendering.
- **Five languages** — English, German, French, Spanish and Italian, for
  the interface and the built-in manual alike.

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
