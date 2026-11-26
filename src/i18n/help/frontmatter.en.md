# Frontmatter and properties

A YAML block at the top of a file carries metadata. It appears in Reading view as a collapsed frontmatter line, is shown subtly set off in the source editor, and maintained form-style via the properties sidebar.

## YAML block

The block sits between two `---` lines and must be the very first line of the file — which is why this manual page shows it as a code block instead of live:

```markdown
---
title: Project plan
aliases: [Plan, Roadmap]
tags: [project/markdown, planning]
review: 2026-07-01
final: false
---
```

## Display in the rendered view

At the top of the rendered view the frontmatter appears as a subtle collapsed line with the field count. Hovering expands the plain YAML (including comments), moving away collapses it again; clicking the line pins it, another click releases. The line can be operated by keyboard (focus, then Enter or Space) and is display-only — editing happens via the properties sidebar or the source text. On a YAML syntax error the line shows the raw text without a field count.

In live mode the same line replaces the YAML lines while the cursor is outside; entering with the cursor or clicking into the expanded YAML switches to editable source, leaving collapses it again.

The display can be turned off under File → Settings… → Appearance (default: on). The additional switch "Show frontmatter expanded" there (default: off) keeps the block permanently open — in the rendered view, in live mode and therefore also in the PDF export.

## Special fields

- `aliases:` makes the file linkable under additional names via `[[Alias]]`; backlinks find it through any alias and mark hits with "via alias" (see [Linking](linking.md)).
- `tags:` adds tags in addition to the `#tags` in body text; both sources end up in the tags sidebar.

## Editor view per document

The three editor-view toggles — folding gutter, line numbers and word wrap — are stored per document in the frontmatter and travel with the file, even when copied or opened on another machine:

```markdown
---
fold-gutter: false
line-numbers: true
word-wrap: true
---
```

Only real `true`/`false` values take effect; other values are ignored. Resolution follows this order: the frontmatter key before the global default (File → Settings… → Appearance) before the built-in default (folding on, line numbers on, word wrap off).

Toggling via the status bar or the View menu writes the new value directly into the frontmatter of the active document: the file thereby becomes modified and is saved via the normal save path. If a document has no frontmatter yet, toggling creates the block.

Special cases: in read-only targets (such as manual pages) and with malformed YAML the toggle only takes effect transiently for the running session. In Untitled tabs it is likewise transient; on the first save the app carries the values that differ from the default into the frontmatter of the new file.

## Cover image

The property `cover` places an image at the top of the document: across the full width of the content, cropped to an adjustable height and never distorted. Two more properties set the height and the visible part:

```markdown
---
cover: images/beach.jpg
cover-height: 240
cover-position: top
---
```

The image can be given in two ways:

- **as a path relative to the document**, as with an ordinary image: `cover: images/beach.jpg`. The same boundary, the same formats and the same 20 MB limit apply as on the [Images](images.md) page.
- **as a name in double square brackets, in quotation marks**: `cover: "[[beach.jpg]]"`. The application then finds the image by its name, whichever folder of the area it is in.

If the image is renamed, the application does not adjust the value of `cover`; enter the new name by hand.

`cover-height` is the height in pixels, default 200; values below 80 or above 600 are set to the nearest limit. `cover-position` picks the visible part of the image: a number from 0 to 100, measured from the top (0 shows the top edge, 100 the bottom edge), or one of the words `top`, `center` and `bottom`; the default is the middle. Anything not understood falls back to the default silently.

The cover image appears in the rendered view, in its half of the split view and in live mode, below the [title line](tools.md) with the file name and above the frontmatter line. In live mode it stays in place even while the cursor is in the YAML lines, and a change to `cover` shows the new image at once. The cover image does not depend on the frontmatter display and appears even when the display is turned off; a block with a YAML syntax error produces no cover image.

Printing, PDF export and HTML export contain the cover image as the rendered view shows it. The [presentation](presentation.md), embedded documents, cards and previews show no cover image.

If the application cannot find the image — the file is missing, lies outside the boundary, is not an image file or is larger than 20 MB —, the unobtrusive note «Cover image not found» takes its place, without an error message. The same applies in a document that has never been saved, until it is saved. An address from the internet (`http:` or `https:`) is not loaded; in its place a note asks to put the image into the area as a file. Printing and export leave the notes out; a cover image without an image is dropped there entirely.

Book and shelf files carry their cover image in the same property `cover` (see [Books](books.md)); when such a file is opened as a document, the image also appears at the top above its content.

The cover image belongs to the [internal extension](extensions.md) «Cover image», which is switched on from the working mode **Advanced**. When it is off, neither image nor note appears; the properties stay unchanged in the document and in the properties sidebar, and after switching the extension back on the cover image is there again.

## Mind map per document

The key `mindmap` decides how the [mind map view](mindmap.md) draws this particular document and thereby overrides the default under File → Settings… → Mind map:

```markdown
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

`layout` takes the root position (`links`, `mitte`, `rechts`, `oben`, `unten`), `linienfuehrung` the values `geschwungen` and `gerade`; added to these are the numbers `farbEinfrierEbene`, `anfangsTiefe` and `hoechstBreite`. Anything not understood falls back to the default silently.

## Properties sidebar

The properties sidebar shows the frontmatter fields live-editable. The field type is inferred from the value: text, list, date, number, boolean or multiline. New fields are created via "+ Add property"; changes follow the auto-save setting.

Clicking a value field offers the values already used for that property in the area, in alphabetical order; each character typed narrows the list, and a value of your own remains freely typable. Where a property profile defines a set of values, both origins appear together and stay distinguishable — the values from existing entries are marked as such. If the property occurs nowhere in the area, no list appears. Can be switched off under File → Settings… → Extensions.

When writing, the block round-trips cleanly: comments, field order and the style of unchanged fields are not reformatted, and CRLF line endings stay stable. Single-line lists in square brackets are written without inner spaces (`[a, b]`); a list written as `[ a, b ]` switches to this form once on the first save and stays unchanged afterwards.

On a YAML syntax error the sidebar shows the error message and locks adding until the block is fixed in the editor.

## Creation and modification time

Two fields can be maintained automatically when saving: the creation time from the file's creation date and the modification time from the moment of saving.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Both fields can be switched on independently and their names are freely selectable. The format is either date only or date and time, always in local time. An existing creation time is never overwritten; the modification time moves along with every save. If a save sets a new modification time, a `Ctrl+Z` right afterwards takes back the time together with the last change before it, also after automatic saving.

Missing fields are only created when the corresponding option is active. Otherwise only fields that are already present in the block are maintained, and the document stays unchanged apart from that. Access and switch are listed in the [functions table](functions.md).
