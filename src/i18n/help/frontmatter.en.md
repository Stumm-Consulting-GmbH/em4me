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

## Properties sidebar

The properties sidebar shows the frontmatter fields live-editable. The field type is inferred from the value: text, list, date, number, boolean or multiline. New fields are created via "+ Add property"; changes follow the auto-save setting.

When writing, the block round-trips cleanly: comments, field order and the style of unchanged fields are not reformatted, and CRLF line endings stay stable.

On a YAML syntax error the sidebar shows the error message and locks adding until the block is fixed in the editor.

## Creation and modification time

Two fields can be maintained automatically when saving: the creation time from the file's creation date and the modification time from the moment of saving.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Both fields can be switched on independently and their names are freely selectable. The format is either date only or date and time, always in local time. An existing creation time is never overwritten; the modification time moves along with every save.

Missing fields are only created when the corresponding option is active. Otherwise only fields that are already present in the block are maintained, and the document stays unchanged apart from that. Access and switch are listed in the [functions table](functions.md).
