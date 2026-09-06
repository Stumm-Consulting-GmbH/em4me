# Document history

The document history records changes to a Markdown document as a **revision history**: if you maintain a document over a longer period, you can see which changes were made when, compare two states line by line, and bring back an earlier state. The history lives in a **companion file** next to the document and travels with it when both files are copied or moved together.

## Markdown data files (.mdd)

A document `Notes.md` gets the companion file `Notes.mdd` ("Markdown data") in the same folder. It is created on the first save with history recording active and contains the complete history: the initial state, all change packets, and, at intervals, full intermediate states as anchor points. The format is readable plain text (JSON) and deliberately transparent; a `.mdd` cannot be opened as a document.

The same companion file also holds a document's [document note](notes.md) next to the history, in its own section. Unlike the history, however, the note has no revisions and no restore.

Two things are worth knowing:

- If the document is **renamed or moved** outside the app, the companion file has to be taken along manually; otherwise the history loses its connection and starts over.
- In folders that are **synchronized, backed up, or versioned** with other programs, the `.mdd` files travel along. This is intentional (the history belongs to the document), but be aware: the complete change history of a document travels with the companion file.

## Switching on: three levels

By default, history recording is **off**. It is switched on three levels; the more specific level wins, and unset levels inherit from the next more general one:

| Level | Location | Effect |
|---|---|---|
| Document | YAML property `history` in the frontmatter | overrides area and app |
| Area | area file `Area_Settings.mdda` in the area root folder | overrides the app setting, applies to all documents in the area |
| App | Settings → Behavior → Document history | base setting for everything else |

The document level lives in the frontmatter:

```yaml
---
history: true
---
```

`history: false` switches off; a missing property inherits. The easiest way to set the property is the click menu of the statusbar icon (enable, disable, use inherited value). The area default is set in the "Document history" settings entry of the "Current area" navigation group (only visible when an area is open); the area file is only created when the default is first set.

**Switching off deletes nothing.** Recording merely pauses; the companion file is kept. When switched back on, the gap is recorded as one combined packet, so the history remains traceable without breaks.

## Change packets

So that frequent saving (for example with auto-save) does not flood the history with tiny steps, the app combines consecutive saves into a **change packet**. Two time windows control this (Settings → Behavior):

- **Maximum packet duration** (default 5 minutes): after this, a new packet starts even while working continuously.
- **Inactivity cutoff** (default 2 minutes): after a pause without changes, the next save starts a new packet.

Each packet carries timestamps and the detected trigger: **Edit** (saved in the app) or **External** (the file was changed by another program; the app detects this on open and before each save and records the difference instead of letting the history break).

## Origin of a change

Every change packet also records **which login name** and **which machine** it originated from. The history view shows both in two separate columns, so the distinction between person and device stays visible. If you work on several machines, you can see where a change was made; once a body of documents is shared, also by whom.

The entry is a **statement of fact at the time of the change**, not a managed user account. It is read, not assigned, and it is never rewritten afterwards: if a login name is renamed later, existing entries stay as they are. If either value cannot be determined, the column stays empty instead of inventing a substitute.

Entries from before this feature carry no origin, and it cannot be added afterwards because it cannot be reconstructed. A change made **outside** the app likewise carries no origin: the app only notices it and does not know who made it.

**When you pass a document on, the entry travels with it.** Anyone who shares the companion file along with the document also shares the login names it contains. There is no separate way to strip them beforehand; if you do not want this, switch document history off (see the three levels above). Without history there is no origin either.

## Statusbar

The clock icon in the statusbar shows the state of the active document:

- **Active** (filled): changes are being recorded.
- **Paused** (outlined): history recording is effectively off, a companion file exists.
- **Inactive**: history recording is off, no companion file exists.

The tooltip additionally names the level that determines the setting (file, area, or app). A click opens the menu with the history view and the switches for the document level.

## History view

"View → Document history" (or the statusbar menu) opens the revision list of the active document as its own read-only tab: newest revision on top, below it all packets with time, trigger, and extent of changes (+inserted/−removed lines), and at the bottom the initial state. The tab sits immediately to the right of the document's tab. There is exactly one history view per window; opening it for another document moves that same tab next to the other document's tab.

- **View** shows the complete state of a revision below the list.
- **Compare** contrasts two selected states line by line (columns "From" and "To", optionally against the current state): removed lines red, inserted lines green, with ellipsis markers for unchanged passages in between.
- **Restore** loads the selected state into the document's editor tab. The document then counts as modified; only saving makes the restore effective and creates a **new** revision in doing so. Earlier revisions are never deleted or overwritten.
