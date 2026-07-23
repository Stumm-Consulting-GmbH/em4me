# Extensions

Many features of the app are built-in extensions and can be enabled or disabled individually. The core — editor, tabs and windows, file handling, view modes, sidebar frame, settings, manual, theme, languages and the CommonMark base rendering — is deliberately not switchable; the app therefore always stays functional.

## Switching

The Extensions settings section (File → Settings → Extensions) lists all built-in extensions in three categories:

- **Rendering** — Markdown constructs such as callouts, footnotes, highlight, typography, Perspective tables, KaTeX math, Mermaid diagrams or syntax highlighting.
- **Linking** — wiki links, wiki embeds, tags and autocomplete.
- **Tools** — Markdown linter, bookmarks, focus mode with typewriter scroll, word statistics and the code copy button.

Each row shows a name and a short description. Changes take effect on Apply or OK — immediately, without restart, and in all windows.

## Effect of the disabled state

- **Rendering extensions:** the syntax renders as plain text or standard Markdown. `==highlighted==` stays visible plain text, for example, and a Mermaid block becomes an ordinary code block.
- **Panels and access points:** related sidebar panels, status bar buttons, menu entries and shortcuts disappear; no dead controls remain.
- **Settings sections:** if an extension brings its own settings section (for example task states), it only appears in the section navigation while the extension is active.

## Dependencies

Some extensions build on each other: wiki embeds need wiki links. If the foundation is disabled, dependent extensions are disabled along with it; the section then shows the hint "Disabled via dependency". The dependent extension keeps its own switch state and takes effect again as soon as the foundation is re-enabled.

## Data is preserved

Disabling deletes nothing: the bookmark tree, task state definitions, panel visibilities, custom shortcuts and all other settings remain stored and return when the extension is enabled again.

## External extensions

Besides the internal extensions, the app also loads self-built, external extension packages. They are managed in the Extensions (external) settings section: newly detected packages start disabled, activation requires an explicit confirmation in the warning dialog (third-party code gets full access to documents and app), and faulty packages are disabled automatically. How to build your own package is described on the page [Creating extensions](extensions-dev.md).
