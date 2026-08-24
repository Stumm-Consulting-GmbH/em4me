# Manual

![EM4me](../assets/em4me-logo.svg)

_extended memory for me_

Welcome to the EM4me manual. This overview page is the entry point; each section opens as its own tab and behaves like any other tab — move it, place it in the second column, or keep it open next to your own work.

**First time here?** The product tour covers ten stations in the running program, showing what sets this application apart and pointing at the control in question each time. It starts by itself on the first program launch; afterwards "Help → Product Tour" starts it again, and it can be cancelled at any time. The manual answers the specific questions that follow.

## Reference

- [Benefits and ways of working](benefits.md) — what the app is good for: the ways of working from tabs to bookshelves, and the scope of the Markdown language.
- [Features](functions.md) — every app feature as a table: what it does and how to reach it.
- [Keyboard shortcuts](shortcuts.md) — the currently effective shortcuts, including your own rebindings.

## Writing Markdown

- [Markdown basics](markdown-basics.md) — the Markdown core: headings, emphasis, lists, tables, links, plus CommonMark specialties.
- [Editor context menu](context-menu.md) — formatting by right-click: menu structure, selection semantics, toggles with check marks, read-only and live mode.
- [Format toolbar](toolbar.md) — formatting by button: visibility in edit mode, state display, heading menu, table grid, custom assignment.
- [Block constructs](blocks.md) — callouts, custom containers, definition lists, line blocks, footnotes.
- [Inline constructs](inline.md) — highlight, sub-/superscript, underline, spoiler, Critic Markup, spans and abbreviations.
- [Images](images.md) — image syntax, size hints, implicit figures.
- [Attachments](attachments.md) — pasting and dragging files in: storage location and setting, naming, opening in the default program.
- [Math and diagrams](math-diagrams.md) — KaTeX formulas, Mermaid diagrams, code blocks with syntax highlighting.
- [Emoji](emoji.md) — how shortcodes work, plus a curated code selection.
- [Perspective Table](perspective-table.md) — tables with multi-line block cells: syntax, examples, sorting, export.

## Tasks, appointments and time

- [Task lists](tasks.md) — task lists with standard and extended states.
- [Reminders](reminders.md) — notification times on tasks with ⏰: notification and catch-up dialog, reminder list; the announcement runs only while the app is running.
- [Events](events.md) — appointments, birthdays and anniversaries in the document: event block with tiered time differences, milestones, filters and four views, aggregation via frontmatter, links.
- [Calendar systems](custom-calendars.md) — freely definable time reckonings per area: blocks with parallel calendars, levels with five relation types, epochs, conversion, value syntax in the document and picker.

## Metadata, data and queries

- [Frontmatter and properties](frontmatter.md) — YAML metadata and the properties sidebar.
- [Property Profiles](property-profiles.md) — central field definitions with type, value range and default value: profile files, assignment by field, tag and folder, default profile, inheritance between profiles, value sets from note and query, profile symbol at the document, effect in both property editors.
- [Block properties](block-properties.md) — typed properties per block anchor: panel following the cursor, orphaned data, anchor renaming, indicator on the block.
- [Perspective Query](frontmatter-query.md) — dynamic file lists and tables: clause language, sources, file fields, functions, sorting, multi-column layout, export.
- [Perspective Datatable](datatable.md) — typed data table with calculation functions: column types, aggregates, computed columns, grid editing, sorting and filtering.
- [Script blocks](scripts.md) — JavaScript in the document: isolated sandbox, trust model with default off, read-only pq API with data, output, and helper functions, examples.

## Connecting and organizing

- [Linking](linking.md) — wiki links, anchors, embeds, tags and autocomplete.
- [Subpages](subpages.md) — page hierarchy via file names: separator ∕ (U+2215), relative links, breadcrumb and renaming with cascade.
- [Graph view](graph.md) — link relations as an interactive graph: area graph as a tab, file graph as a panel with depth and direction.
- [Bookmarks](bookmarks.md) — keeping files in two sections: general and area-bound bookmarks with relative paths, adding, converting, order.
- [Templates](templates.md) — applying Markdown templates: templates folder with area override, placeholders with dialogs, cursor target, folder rules.
- [Journals](journals.md) — periodic documents per area: shelves and granularities, folder and name patterns, calendar panel, navigation block, automatic date properties.
- [Books](books.md) — several files as a book with a declared reading order: book folder with companion file, table of contents with structure maintenance, reading across chapter boundaries, moving with follow-up, repairing missing chapters.
- [Applications, windows and areas](apps-windows.md) — multiple starts, window management and the title system.
- [Document history](history.md) — recording changes: Markdown data companion file, switches on three levels, comparing and restoring revisions.
- [Document notes](notes.md) — one note per document: sidebar panel with toggleable preview, automatic saving in the companion file, distinction from the history.

## Interface, tools and extensions

- [Views and display](views-display.md) — views per tab and the appearance of the app: the five modes including live mode, editor display, theme and focus mode, zoom, content width and fonts, settings, language and menu bar.
- [Mind map view](mindmap.md) — headings and lists of a document as a map: root position in five directions, collapsing, zoom, notes on the node, jump to the source, default per document.
- [Sidebar](sidebar.md) — arranging panels: side, order, tab groups, widths.
- [Color schemes](color-schemes.md) — colors via named slots: mode assignment, own schemes as copies, live preview, limits.
- [Tools](tools.md) — Markdown linter, search with regex, search and replace, table editor.
- [Command placement](command-placement.md) — commands as permanent custom access points: status bar buttons, hide list, context menu entries, macros.
- [Extensions](extensions.md) — enable or disable features individually: categories, dependencies, effect of the disabled state.
- [Creating extensions](extensions-dev.md) — develop your own external extensions: manifest, extension API, reference example, security notes.

## Usage tips

- All manual pages are read-only; the views (Rendered, Split, Source, Live and Mind map) are freely selectable.
- The **split view** shows Markdown source and rendered result side by side — ideal for comparing the syntax examples on the topic pages with their output.
- The **table of contents** in the sidebar navigates within a page; **full-text search** (default `Ctrl+F`) searches it.
- When you switch the language in the status bar, open manual pages switch along immediately.
- News, roadmap and the current version are on the product website [em4me.ch](https://em4me.ch/). The link opens in the default browser.
