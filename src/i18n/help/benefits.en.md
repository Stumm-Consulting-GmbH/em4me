# Benefits and ways of working

This page does not answer **how** something works, but **what it is good for**. It has two halves: the first five sections show which **ways of working** the app opens up, from a single document to a named working space. The second half shows what a Markdown file can **express** beyond the Markdown standard. Wherever things get concrete, a link at the end of each section leads to the page that covers the subject in detail.

## One document, the way you need it right now

Reading, writing and checking are different activities, and they need different presentations of the same text. Instead of forcing a compromise, the app keeps five views ready, and one keystroke switches between them: the finished page for reading, the source text for precise work, both side by side for comparing, live mode for fluent writing, and the mind map for a look at the outline. Switching costs nothing and never changes the file.

- **Rendered** for reading, **source** for precise work on the syntax.
- **Split** shows source and result side by side, for constructs with pitfalls.
- **Live** formats as you type and shows the Markdown characters only in the current line.
- **Mind map** turns the heading outline into a tree.

In detail: [Views and display](views-display.md), [Mind map view](mindmap.md).

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

- **Area** means a folder boundary: what lies outside does not come in.
- **Workspace** means a stored working state, named and marked with a colour.
- **Both together** give a named working state with a fixed folder boundary.

In detail: [Applications, windows and areas](apps-windows.md).

## Files become a book

A longer work consists of many files, and their order otherwise sits in the file name or the folder position, where every rename puts it up for grabs again. A book turns this around and writes its structure down explicitly: the chapters remain ordinary Markdown files that can be read without the app, but their order and nesting are fixed, the table of contents shows them, and reading navigation pages through the whole work across chapter boundaries. Bookshelves group several books.

- **Declared reading order** instead of alphabetical sorting by file name.
- **Chapters stay files**, readable on their own and usable elsewhere.
- **Reading navigation** pages through continuously, the contents reorder by drag or keyboard.
- **Bookshelves** group several books.

In detail: [Books](books.md).

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
- **Presentation** with formulas, diagrams and highlighted code.
- **Connections** through links, anchors, embeds and tags.
- **The working day** with tasks, reminders, events, templates and journals.
- **Individually switchable** and open to your own extensions through a documented interface.

In detail: [Features](functions.md), [Extensions](extensions.md), [Creating extensions](extensions-dev.md).
