# Views and display

How a document appears is decided on two levels. The **view** belongs to the individual tab: it determines whether the document is shown rendered, as source text, split or live. The **appearance** applies to the whole application: theme, zoom, content width and fonts. This page brings both levels together and names the place of every setting.

## The five views

Every tab is in exactly one of five views. The chosen mode applies per tab, not globally: one document may be open rendered while a second one is edited as source text next to it.

| View       | What it shows                                     | Default shortcut |
| ---------- | ------------------------------------------------- | ---------------- |
| **Rendered** | only the formatted result                       | `Ctrl+1`         |
| **Split**    | source text and result side by side             | `Ctrl+2`         |
| **Source**   | only the Markdown source text                   | `Ctrl+3`         |
| **Live**     | the source text, formatted right where you edit | `Ctrl+4`         |
| **Mind map** | the structure of the document as a map instead of text | `Ctrl+5`  |

Switching happens via the buttons in the status bar or via the top of the View menu; the mind map lives in the menu and on its shortcut, not in the status bar. Which view a newly opened tab receives is set in the “Behaviour” section of the settings.

### Live mode

Live mode renders the Markdown directly in the editor: bold and italic, links, tables, code, images, KaTeX formulas and Mermaid diagrams appear as they look in the rendered result. When the cursor sits in a line, exactly that line shows its raw source and stays editable. This removes the switch between writing and checking.

### Mind map

The mind map shows the headings and lists of the document as a tree and the body text as a note on the node. It belongs to the extension of the same name and goes with it; structure, handling, the five root positions and the default per document are described on the page [Mind map view](mindmap.md).

### Editing

Edit mode arms the editor and works in the source, the split and the live view (default `Ctrl+E`, pencil in the status bar, View → Edit). Clicking the pencil in the pure reading view automatically switches to the split view and activates the editor there. What is available for formatting in edit mode is described by the pages [Editor context menu](context-menu.md) and [Format toolbar](toolbar.md).

## Editor display

The submenu View → Editor Display bundles the five switches that concern the editor itself. The same switches sit as icons in the status bar.

- **Folding** shows the fold gutter at the left edge: headings, lists and blocks can be collapsed there, and the hierarchy stays visible as a trace.
- **Line Numbers** shows the number column.
- **Word Wrap** wraps long lines at the window edge instead of scrolling horizontally.
- **Scroll synchronisation** couples both halves in the split view: when you scroll the source, the result follows by content, and the other way round. The switch applies per tab.
- **Typewriter Scroll** keeps the cursor line vertically centred as soon as the cursor moves. It only works in edit mode.

The first three switches are **document-bound**: their value goes into the frontmatter of the file (`fold-gutter`, `line-numbers`, `word-wrap`) and travels with it. Toggling writes the new value there and marks the file as changed; a document without its own entry follows the default under File → Settings… → Appearance. The resolution order is described on the page [Frontmatter and properties](frontmatter.md).

## Appearance

### Light, dark and system

The application runs in a light or a dark theme; the default follows the theme of the operating system. It is switched via the theme icon in the status bar or via View → Appearance → Light/Dark/System. Which colors a theme uses is freely determined by color schemes, see [Color schemes](color-schemes.md).

### Focus mode

Focus mode hides the tab bar, the status bar and the sidebar and leaves only the document (View → Appearance → Focus Mode, default `Ctrl+Shift+F`). The menu bar stays reachable via `Alt`. `Esc` leaves the mode unless a dialog or a menu is currently open. A collapsed sidebar state is untouched by this and continues to apply after leaving.

### Active line

The line with the cursor is subtly tinted in edit mode, in the source as well as in the live view and including the line number column. In the pure reading view it stays unmarked, because there is no cursor there. The tint is semi-transparent and therefore lies over any color scheme; selection, search hits and linter markers stay visible on top of it. Switch: File → Settings… → Appearance.

### Zoom

The content of each tab can be enlarged and reduced independently in ten-percent steps (default `Ctrl + +`, `Ctrl + −`, `Ctrl + 0`, plus `Ctrl` with the mouse wheel). If the factor differs from one hundred percent, the status bar shows it; a click on it resets. The zoom is volatile and does not survive closing the window.

### Content width

The content width determines as a percentage how much room the rendered display uses (20 to 100, default 80). Narrower values stay centred. It applies to the rendered and the split view; the PDF export uses the full print width regardless. Setting: File → Settings… → Appearance.

### Font family and size

Font family and size can be chosen separately for the editing surface and for the rendered view; the size lies between 8 and 32. The values apply to all documents and take effect immediately in all open windows. Setting: File → Settings… → Appearance.

## Window state

Position, size and maximized state of a window are remembered on quit and restored on the next start. Nothing needs to be set for that. What brings back a whole session with its tabs beyond this is described on the page [Applications, windows and areas](apps-windows.md).

## Word statistics

The status bar shows words, characters and the estimated reading time of the active file. If something is selected in the editor, the display switches to the selection. A click opens a detail dialog with paragraphs, sentences and the number of headings per level. Frontmatter, code blocks and KaTeX formulas are not counted.

## Settings

The settings open as their own tab (File → Settings…, default `Ctrl+,`). Their navigation is divided into four blocks:

- **General** — everything that applies to the whole application, such as appearance, behaviour, keyboard shortcuts and export.
- **Current area** — the settings of the open area. The block only appears while an area is open.
- **Extensions (internal)** — switching the bundled extensions on and off, including their own sections.
- **Extensions (external)** — the management of extension packages you installed yourself.

Changes first act as a draft with live preview of the appearance. Apply and OK save them; both are highlighted only when there are unsaved changes, and without changes Apply is dimmed. Cancel or closing the tab discards the draft. Saved values apply immediately in all open windows. More on the two extension blocks is on the page [Extensions](extensions.md).

## Language

The interface is available in German, English, French, Spanish and Italian. It is switched via the language selector in the status bar; open manual pages switch along immediately.

## Menu bar

The menu bar carries the three menus File, View and Help. `Alt` turns on keyboard control, and the underlined letters jump straight into the respective menu, for example `Alt+F` for File. The currently effective shortcuts of all commands are listed on the page [Keyboard shortcuts](shortcuts.md).

At the very end of the View menu sit the developer tools. They are deliberately fixed to `F12` and cannot be rebound: they are a tool for troubleshooting and not part of daily work.
