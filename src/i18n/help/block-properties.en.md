# Block properties

What frontmatter does for the whole document, block properties do for individual blocks: structured, typed key-value data, such as a meeting status per paragraph or a due date per action item. The carrier is the **block anchor**; the data is stored in the document's **companion file** (Markdown Data, `.mdd`), the same file that carries the [document history](history.md) and the [document notes](notes.md). The document text itself remains untouched.

## The block anchor as carrier

A block anchor is a freely chosen identifier at the end of a block:

```markdown
This paragraph carries an anchor. ^meeting-1
```

In the rendered view the anchor is invisible; it makes the block addressable. Letters (including accented ones), digits, hyphen and underscore are allowed. The properties attach to this identifier: as long as the anchor is present in the text, the data belongs to this block, no matter where the block is moved within the document.

## The block properties panel

The "Block properties" panel is toggled like any sidebar panel: via the View → Sidebar → Panels → Block properties menu, the braces icon in the status bar, or a custom keyboard shortcut (none is assigned by default). Side, order and tab groups follow the rules of the [sidebar](sidebar.md).

The panel **follows the cursor**: it shows the properties of the block the cursor is in. The header names the active anchor and offers a selector of all anchors in the file for jumping; anchors that carry properties are marked. If the cursor is in a block **without** an anchor, the panel offers "Create anchor" and writes a short random identifier, unique within the file, to the end of the block.

The property rows work like in the document properties panel: each row has a freely chosen key, a type (text, list, number, true/false, date, multiline) and a matching value field. For the key, the panel suggests the block keys already used in the document. Saving happens **automatically** shortly after typing; the document tab is not marked as modified, because the data lives in the companion file, not in the text. In read-only views the panel only displays the data.

## Renaming an anchor

The pencil icon next to the anchor selector renames the active anchor. The anchor in the text, the data entry in the companion file and the incoming references **within the same document** are updated together:

```markdown
See the first item: [[#^meeting-1]]
```

References from other files are not adjusted; rename with care if you link across files.

## Orphaned data

If an anchor disappears from the text, its properties are **not lost**: they remain in the companion file and appear in the panel's "Orphaned data" section. From there they can be assigned to an existing anchor without data, or deleted for good. If a file carries the same anchor more than once, the first occurrence counts; the panel points out the duplicate.

## Visibility on the block

Blocks with properties carry a subtle indicator at the end of the block in the rendered view and in live mode. Hovering over it shows the key-value list; a click opens the panel with that anchor. The indicator does not appear in the PDF export.

## Referring to blocks

A block with an anchor can be referenced from the same or from other documents; clicking jumps to the block:

```markdown
[[Minutes#^meeting-1]]
```

The [linking](linking.md) page describes the reference syntax in detail. Via the [Perspective Query](frontmatter-query.md), blocks can also be queried by their properties (scope addition `BLOCKS`).

## Storage location and limits

The properties live in their own section of the `.mdd` companion file and travel along when document and companion file are copied or moved together; **renaming within the app** takes the companion file along automatically. The anchor is the sole identity: if the block content changes, the data stays attached to the anchor.

Two limits are worth knowing. Other Markdown programs are not aware of the companion-file coupling: if the text is restructured outside the app and anchors disappear, the affected data ends up in the orphaned-data section (nothing is lost silently). And if a block is moved to a **different file**, its properties do not move along automatically, because the companion file is bound to the document; recreate them in the target file, while they remain as orphaned data to clean up in the source file.
