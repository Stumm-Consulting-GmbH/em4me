# Extensions

Many features of the app are built-in extensions and can be enabled or disabled individually. The core — editor, tabs and windows, file handling, view modes, sidebar frame, settings, manual, theme, languages and the CommonMark base rendering — is deliberately not switchable; the app therefore always stays functional.

## Switching

The Extensions settings section (File → Settings → Extensions) lists all built-in extensions in three categories:

- **Rendering** — Markdown constructs such as callouts, footnotes, highlight, typography, Perspective tables, KaTeX math, Mermaid diagrams or syntax highlighting.
- **Linking** — wiki links, wiki embeds, tags and autocomplete.
- **Tools** — Markdown linter, bookmarks, focus mode with typewriter scroll, word statistics and the code copy button.

Each row shows a name and a short description. Changes take effect on Apply or OK — immediately, without restart, and in all windows.

## Working modes

Above the switch list sits the Working mode section. A working mode sets the switches of the built-in extensions as one bundle — one decision instead of many individual ones. Three fixed modes are available, and they are nested: whatever the smaller one contains, the larger one contains as well.

- **Beginner** — writing and linking. Included are the common Markdown repertoire (among others callouts, footnotes, highlight, typography, emoji, images with size, Perspective tables and syntax highlighting), the linking through wiki links, tags and autocomplete, plus the tools of everyday writing: task lists, templates, bookmarks, spell checking, format toolbar, table editor, title line, date picker, word statistics, focus mode and the demo area.
- **Advanced** — all of that and, in addition, organising and planning: books, journals, property profiles, reminders, events, graph view, mindmap, outliner, workspaces, tab groups, clock, formulas and diagrams, plus the rarer Markdown constructs such as custom containers, definition lists, abbreviations, spoilers, comments, heading numbering and extended task states.
- **Full** — all built-in extensions, that is additionally canvas areas, database, Perspective Datatable, charts for tables, inline calculation, Critic Markup, line blocks, heading attributes, custom calendar systems, custom interface language, My Extended Memory, custom status bar buttons and the exchange of your own setup.

Like every other change on this page, the choice takes effect on Apply or OK — then immediately, without restart and in all open windows.

**A mode is a starting point, not a lock.** After switching, every single switch stays adjustable as before, and no mode takes away anything that could not be switched on again. Below the three buttons it says which mode matches the current switch state; if it matches none of them because individual switches differ, it says **Custom** there. The mode name thus describes the state instead of pinning it down — and as soon as the state matches exactly one mode again, that mode is shown as active again.

The dependency protection applies unchanged: no mode creates a state that switching off an individual extension would forbid.

### The first launch

A new setup starts in Beginner mode. The choice is offered where the application is seen for the first time: the guided product tour, which starts by itself on the very first program launch, carries a station of its own with the three modes. Beginner is preselected there, and a click takes effect immediately — the tour need neither be finished nor a window reloaded for it. Whoever skips the station or cancels the tour stays in Beginner mode.

An existing setup keeps its switch state: there the tour does not start on launch, and the range of functions does not change. If the tour is called up manually later, the station shows the state that actually applies and resets nothing unasked.

### Custom modes

Below the three fixed modes, the current switch state can be kept under a name of your own: "Save current state as mode…" asks for the name. The number of custom modes is not limited.

Each custom mode carries four operations: a click on its name **applies** it, **Rename** gives it a different name, **Overwrite** sets it to the current switch state, **Delete** removes it. Rename and delete do not change the switch state in force. The three fixed modes are untouched by this — they can be neither overwritten nor renamed nor deleted.

If a name is already taken, a question comes back instead of a silent overwrite; an empty name is rejected. A saved mode records the state of the moment: changing individual switches afterwards does not change the mode — that is what overwriting is for.

**A saved mode records which extensions are switched off.** That is why it survives additions and removals: an extension that no longer exists is dropped when the mode is applied; one that was added after saving and does not appear in the mode stays on.

Custom modes apply in all areas and travel with your own setup — see [Exporting and importing settings](setup-exchange.md).

## Effect of the disabled state

- **Rendering extensions:** the syntax renders as plain text or standard Markdown. `==highlighted==` stays visible plain text, for example, and a Mermaid block becomes an ordinary code block.
- **Panels and access points:** related sidebar panels, status bar buttons, menu entries and shortcuts disappear; no dead controls remain.
- **Settings sections:** if an extension brings its own settings section (for example task states), it only appears in the section navigation while the extension is active.

## Dependencies

Some extensions build on each other: wiki embeds and area links need wiki links, reminders need tasks, events and the database need the property profiles, charts for tables need the Perspective Datatable. As long as such a dependent extension is enabled, its foundation cannot be disabled: the foundation's switch is locked, and below its description it reads "Cannot be disabled — required by:" together with the names of the dependants; several of them appear together in one sentence. A click on the locked row briefly shows the same hint in the status bar and changes nothing about the switch. To disable the foundation, disable its dependants first; after that its switch is free.

Locking only applies where the dependent extension cannot work at all without its foundation. Where disabling an extension merely impoverishes another one — a control disappears, a suggestion stays empty, a check stays silent, while the extension otherwise keeps running — the switch stays free.

If a setup brought in from elsewhere carries a disabled foundation while a dependent extension is enabled, that state stays as it is: the dependent extension acts as disabled and shows the hint "Disabled via dependency"; it keeps its own switch state and takes effect again as soon as the foundation is enabled.

## Data is preserved

Disabling deletes nothing: the bookmark tree, task state definitions, panel visibilities, custom shortcuts and all other settings remain stored and return when the extension is enabled again.

## External extensions

Besides the internal extensions, the app also loads self-built, external extension packages. They are managed in the Extensions (external) settings section: newly detected packages start disabled, activation requires an explicit confirmation in the warning dialog (third-party code gets full access to documents and app), and faulty packages are disabled automatically. How to build your own package is described on the page [Creating extensions](extensions-dev.md).
