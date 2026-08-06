# Document notes

Every document can carry **one** note, kept separate from the document content. It collects working and meta knowledge about the document (open points, context, reminders) that does not belong in the text itself. The note is written in its own sidebar panel and stored in the document's **companion file**, the same `.mdd` file next to the document that also holds the history.

## The notes panel

The "Notes" panel is toggled like any sidebar panel: via the View → Sidebar → Panels → Notes menu, the note-sheet icon in the status bar, or a shortcut you assign yourself (none is set out of the box; you assign it in the settings). The toggle affects the active column; side, order, and tab groups follow the rules of the [Sidebar](sidebar.md).

A note always belongs to the active document. A still **unnamed** (never saved) document has no place for the companion file, so the panel then shows a hint instead of an input field; after the first save the note is available.

## Writing and preview

The input field accepts Markdown. A toggle in the panel header switches between **editing** and a **rendered preview** of the note text. The preview is active at first; whether a panel opens in editing or preview is set by "Show note preview by default" (Settings → Appearance). The toggle applies per column and for the current session.

Here is what a note can look like:

```markdown
- [ ] Follow up on chapter three
- [x] Sources checked

Context: **draft**, not yet approved.
```

- [ ] Follow up on chapter three
- [x] Sources checked

Context: **draft**, not yet approved.

## Formatting like in the editor

The editing field offers the same formatting helpers as the main editor: the **right-click context menu** with the sections Format, Paragraph, Insert, and Clipboard, plus the matching shortcuts (such as `Ctrl+B` for bold, `Ctrl+I` for italic, or inserting a timestamp). The [Editor context menu](context-menu.md) describes these functions in detail; they work in the note field just as in the document.

## Automatic saving

The note is saved **automatically**, without a save button: shortly after typing, as well as when you leave the field, switch the document, or close the window. The note is not part of the document content, so it does **not** mark the document tab as modified, and saving the document is independent of it.

## Storage and distinction from the history

The note lives in the `.mdd` companion file, in its own section next to the [Document history](history.md). Both travel with the companion file when document and `.mdd` are copied or moved together; **renaming inside the app** takes the companion file, and thus the note, along automatically.

Unlike the history, the note has **no revisions and no restore**: only the current state counts, an earlier text is not kept. If the companion file is damaged, the note is suspended and the panel points this out instead of overwriting an unclear state.

## Multiple windows

If the same document is open in several windows, a note saved elsewhere is adopted here as long as the field is unchanged. If a foreign change meets your **own, not yet saved** state, the panel points out that the note was changed in another window, and your text is kept so that nothing is overwritten unnoticed.
