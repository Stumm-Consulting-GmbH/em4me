# Benefits and ways of working

This page does not answer **how** something works, but **what it is good for**. It has two halves: the first half shows which **ways of working** the app opens up, from a single document to a named working space. The second half shows what a Markdown file can **express** beyond the Markdown standard. Wherever things get concrete, a link at the end of each section leads to the page that covers the subject in detail.

## One document, the way you need it right now

Reading, writing and checking are different activities, and they need different presentations of the same text. Instead of forcing a compromise, the app keeps seven views ready, and one keystroke switches between them: the finished page for reading, the source text for precise work, both side by side for comparing, live mode for fluent writing, the mind map for a look at the outline, the canvas for cards on a surface, and the board for tasks in columns. Switching costs nothing and never changes the file.

- **Rendered** for reading, **source** for precise work on the syntax.
- **Split** shows source and result side by side, for constructs with pitfalls.
- **Live** formats as you type and shows the Markdown characters only in the current line.
- **Mind map** turns the heading outline into a tree.
- **Canvas** shows a surface with cards and connections that lives inside the document itself.
- **Board** puts the tasks of the document side by side, as cards in columns.

In detail: [Views and display](views-display.md), [Mind map view](mindmap.md), [Canvas surface](canvas.md), [Kanban board](kanban.md).

## Many documents side by side

A train of thought rarely lives in a single file. That is why several documents are open at once, in tabs that can be arranged: coloured groups hold together what belongs together, the second column places two documents side by side, and the sidebar keeps the table of contents, backlinks, notes or tasks in view while you write. All of this is your decision, not the program's: panels move between the left and the right side, and widths and heights stay as you set them.

- **Tabs** for any number of open documents, with multiple selection and a chosen position.
- **Tab groups** bundle related documents by colour.
- **Two columns** in the same window for source and target, draft and template, chapter and note.
- **Sidebar panels** on the left or the right, with order, width and height freely set.

In detail: [Applications, windows and areas](apps-windows.md), [Sidebar](sidebar.md).

## More than one window, more than one context

Anyone working on several things at once will not get far with a single window. A tab moves into a new window through the context menu, and several windows belong to one application, the shared working context. Several of those can run: each application has its own windows and its own numbering, so two undertakings never get in each other's way, even though both use the same app. On the next start, session restore brings everything back together.

- **Windows** in any number, with tabs moving between them.
- **Applications** as independent working contexts with their own windows.
- **Session restore** brings applications, windows and tabs back.

In detail: [Applications, windows and areas](apps-windows.md).

## Order through boundaries, order through memory

Two different kinds of order are available, and the difference is worth knowing. An **area** binds an application to a folder and turns it into a boundary: the open dialog, the recent list, saving and searching all stay inside it, so a confidential project never frays into another one by accident. A **workspace**, by contrast, remembers a state: all windows, tabs, groups and drafts under one name, kept current without a save step. Open it weeks later and you are sitting exactly where you left off. The two can be combined.

- **Area** means a folder boundary: what lies outside does not come in — with exactly one exception, and you set it.
- **Workspace** means a stored working state, named and marked with a colour.
- **Both together** give a named working state with a fixed folder boundary.
- **Linked areas** are that exception: a prefix you enter, one direction, a link that carries across. A door, not an open boundary.

In detail: [Applications, windows and areas](apps-windows.md).

## A network instead of a filing cabinet

Knowledge rarely grows in folders. It grows in connections: one note points to a second, a third picks up both, and after a year your material carries more context than any folder structure could represent. That context is kept and can be read from two sides — as a surface showing what connects to what, and as a tree showing what hangs below an entry point, and at what depth.

- **Links in both directions**: what this document names, and who names this document.
- **The network** shows the surroundings of a document, **the tree** from a chosen root the order below it.
- **Every file exactly once** in the tree, on its shortest path to the root; a click opens it.
- **What nothing links to** does not stay hidden: area statistics name those files.

In detail: [Linking](linking.md) and [Graph view](graph.md).

## When sequence is no longer enough

Some thoughts have no sequence. Laying alternatives side by side, sketching a workflow or sorting out how things relate needs surface instead of lines — and it needs you to decide what goes where. A canvas is exactly that: a surface inside an ordinary Markdown file on which you arrange cards carrying their own text freely and join them with labelled, coloured lines. Unlike the graph view it works nothing out, it holds on to what you have laid down — and because it sits inside the document, the card texts stay readable in any other text program as well.

- **Cards with their own text**, freely placed and adjustable in size; their content is ordinary Markdown.
- **Connections with direction, colour and label** — an arrow at both ends included, with a selectable side to attach to.
- **Your arrangement stays yours**: the surface works out no positions, it remembers what you laid down.
- **Plain text inside the document**: the surface sits in a code block of the Markdown file and is readable without EM4me too.
- **Without a mouse as well**: a list beside the surface names every element and lets you create, label, connect and delete them from the keyboard — and search them.
- **Open to the outside**: a surface can be saved in the open JSON Canvas format and read back in from it — for exchange with other tools.

In detail: [Canvas surface](canvas.md).

## Tasks you can push along

Anyone juggling many tasks at once does not want to read what needs doing, but to see where it stands. A Kanban board arranges the tasks of a document in columns — to do, in progress, done, or whatever else you call the steps of your workflow — and its cards can be pushed from one column to the next with the mouse; a column can be set to tick off every task dragged into it. All of it stays ordinary text in the document: the columns are its headings, the cards are its task lines, and what is ticked off on the board is ticked off in every other view as well. A board written with the widely used board tool for Markdown notes opens here, can be edited here, and can be used there afterwards.

In detail: [Kanban board](kanban.md).

## Files become a book

A longer work consists of many files, and their order otherwise sits in the file name or the folder position, where every rename puts it up for grabs again. A book turns this around and writes its structure down explicitly: the chapters remain ordinary Markdown files that can be read without the app, but their order and nesting are fixed, the table of contents shows them, and reading navigation pages through the whole work across chapter boundaries. Bookshelves group several books.

- **Declared reading order** instead of alphabetical sorting by file name.
- **Chapters stay files**, readable on their own and usable elsewhere.
- **Reading navigation** pages through continuously, the contents reorder by drag or keyboard.
- **Bookshelves** group several books.

In detail: [Books](books.md).

## When a document outgrows a single file

A document sometimes grows beyond what can be edited smoothly. Instead of imposing a limit on you, the application splits such a document into several files when saving and puts it back together when opening. You notice nothing of it: one continuous text, one undo history, one search hit. Cuts are made only at headings so that no construct is torn apart, and every part file remains an ordinary Markdown file, readable without the application.

- **Size stops being a limit** — even very large documents stay workable.
- **Invisible in your workflow**: one tab, one text, one search result.
- **Cuts are made at headings**, never in the middle of a table, list or code block.
- **Reversible**: a menu command turns the parts back into a single file.

In detail: [Splitting large documents](document-parts.md).

## Data and prose in the same files

A folder of Markdown files can be a database at the same time, and you do not declare it one: as soon as a document describes the database, the area holds a database, and an overview of its own answers in one place what lies in it, that is name and description, the tables each with the number of their fields, and the issues in plain words. The tables themselves are ordinary files: the definition sits in the file's header, the records sit in the body below, and with that a table is complete in a single file. The real gain lies beside it. From any text of the area you refer to a single row of a table, just as you refer to a file elsewhere; the note about a meeting then points at the record of the person it talks about.

- **The area becomes a database** as soon as a document describes one, and gets an overview of its own as a read-only view.
- **The table sits in its file**: fields in the header, records in the body. Renaming and moving change nothing about that, outside the application as well.
- **Eight column types**, with labels that may be present in several languages.
- **The reference to a single record** is written like an anchor and behaves like every other reference: the Markdown linter shows whether it holds, and a click opens the table file.
- **Large data sets stay one table**: from roughly 0.7 MB on, the application spreads the records across several sibling files when saving, without a single reference being touched.

What this first stage does not bring yet: records are still entered in the text of the file, there is no input form, no check of the values while writing and no query across the records.

In detail: [Database](database.md).

## The application adapts — and comes along

Anyone who works with a program for long enough shapes it: colours, keyboard shortcuts, buttons, templates and bookmarks grow with the way you work, and at some point the language the interface speaks belongs to that too. Until now that work was tied to one computer and to the languages that ship with the application. Both are open: your setup can be written into a readable file and read back in elsewhere, and anyone who needs a sixth language translates the interface themselves. On top of that comes the view of the whole — one page that shows all your workspaces, areas, books and bookshelves side by side, including the ones that are not attached right now.

- **Your setup as a file**: export it, take it along, read it back in elsewhere — in full or in part, with a preview that says beforehand what will happen.
- **A sixth language: your own.** Translate a template, load it in, pick it in the status bar; whatever is missing from it appears in English instead of as a raw key.
- **Every container in one place**: entered by hand rather than collected automatically, with figures and the moment those figures were taken.
- **Nothing happens behind your back**: no drive is scanned, and no import writes anything before you have confirmed.

In detail: [Exporting and importing settings](setup-exchange.md), [Your own interface language](custom-locale.md), [My Extended Memory](my-extended-memory.md).

## Tables that hold more than a line

This is where the question of ways of working ends and the question of what a file can express begins. The Markdown standard needs no explanation here; what matters is what goes beyond it, and that starts with the table. A standard table is line-based and therefore only takes short text. A Perspective Table takes whole blocks into a cell: nested lists, several paragraphs, code blocks, images, even a table inside the table. The table becomes a structuring tool for real content instead of a collection of keywords.

- **Block cells** with lists, paragraphs, code and images instead of single-line fields.
- **Nesting**, spans and alignment for demanding layouts.
- **Sorting and status highlighting** right in the rendered table.
- **Readable elsewhere too:** the block stays a clean code block in other Markdown programs instead of tearing up the text.

In detail: [Perspective Table](perspective-table.md).

## Tables that calculate

For numbers rather than text there is the second kind of table. The Perspective Datatable is a typed data table: every column has a value type, cells only accept matching values, aggregate rows calculate live, and computed columns evaluate an expression per row. Editing happens right in the rendered grid, without the detour through the source text. That carries expenses, time tracking or inventory lists without turning into a database file, because everything stays plain text in the document.

- **Fixed value types** per column, so numbers stay numbers and dates stay dates.
- **Aggregates** that calculate live, and **computed columns** per row.
- **Editing in the grid**, without switching to the source text.
- **Calculating in running text too:** inline calculations use the same expression language mid-sentence.
- **Plain text stays plain text:** the data sits unchanged in the Markdown file.

In detail: [Perspective Datatable](datatable.md).

## Document kinds that build on each other

Many documents of an area share the same fields: a status, a date, a category. Property profiles describe these fields once, centrally, with type, permitted values and default; the property editors suggest them and offer the value ranges as pick lists. Profiles inherit from each other: a base profile states what applies to all, and a document kind such as article or meeting only adds its own share, excludes inherited fields where needed or overrides them. Deviations produce hints instead of locks. Which profile applies need not be written in the document: a tag or its folder is enough, and a symbol on the document shows which one it turned out to be. The permitted values of a field may likewise come from your own material instead of the definition.

- **Describe fields once** instead of anew in every document: suggestions, pick lists and types come from the profile.
- **Inheritance with exclusion and overriding:** shared fields in the parent profile, own fields in the document kind.
- **Soft hints instead of locks:** deviations are named, nothing is blocked.
- **Assignment without an entry in the document:** a tag or the folder decides which profile applies.
- **Value lists that keep themselves current:** the permitted values come either from a note or from a query over your material.
- **Fields that carry a structure:** A meeting with three participants needs one field instead of three parallel lists for name, role and company — in the metadata block it stays ordinary, readable YAML.

In detail: [Property Profiles](property-profiles.md).

## Lists that keep themselves current

Anyone keeping many files otherwise maintains overviews by hand, and they go stale the day they are written. A Perspective Query instead describes **what** is wanted, and the result appears right there in the document: a clickable list or table across the collection, filtered by properties, tags and file fields, down to individual text blocks and tasks. When the collection changes, the output changes, with nobody updating anything.

- **Topic pages** that list their related files themselves.
- **Filters** across frontmatter properties, tags and file fields.
- **Block and task level**, not just whole files.
- **Every hit clickable**, leading straight to its target.

In detail: [Perspective Query](frontmatter-query.md).

## When a query is not enough: scripts

Some evaluations cannot be phrased as a condition, such as a recursive tree along the links or an overview that calculates as it goes. Script blocks cover that: a block runs a small program, reads the same collection as the query, and outputs lists, tables or finished text into the document. Because that means more freedom, the feature is bound to an explicit trust model and to runtime limits, and it is not simply active out of the box.

- **Free evaluations** over the same data as the query.
- **Recursive structures** and computed overviews that cannot be expressed declaratively.
- **Explicit trust model** and runtime limits instead of silent execution.

In detail: [Script blocks](scripts.md).

## And the rest of the language

Beyond the four large constructs, the language brings more than fifty extensions: callouts and footnotes for the text, formulas and diagrams for the presentation, links, tags and embeds for the connections, tasks, reminders and events for the working day, plus templates and journals. None of it is compulsory: every extension has its own switch, and whatever is turned off disappears from menus, commands and display instead of getting in the way.

- **Text extensions** for callouts, footnotes, highlighting and abbreviations.
- **Presentation** with formulas, diagrams and highlighted code; on a portable export a diagram travels along as a finished image and is visible even where EM4me is not installed.
- **References within the text** through anchors, embeds and tags.
- **The working day** with tasks, reminders, events, templates and journals.
- **Individually switchable** and open to your own extensions through a documented interface.

In detail: [Features](functions.md), [Extensions](extensions.md), [Creating extensions](extensions-dev.md).

## Working together with an AI assistant

Ask an AI assistant to write files and you usually get ordinary Markdown: the model does not know the extended language of EM4me. That is why EM4me also ships the description of its own Markdown language in a form a model can read. Hand it to your assistant and you get files with queries, data tables, events and surfaces instead of mere paragraphs, with no need to rework them by hand.

- **A syntax reference in a single file**: the whole language, written for a model. It ships with the program and is on the web at a fixed address, `em4me.ch/<language>/manual/em4me-syntax.md`.
- **Every manual page as Markdown as well**, at its own address, for a question about a single topic.
- **An index file `llms.txt` per language** following the widely used pattern, through which an assistant finds the pages itself.
- **Always at the state that was shipped**: all of it is produced afresh at every build from the manual. There is no second source that could go stale.
