# Linking

Wiki links, anchors, embeds and tags connect Markdown files into a network. The examples on this page show the syntax; their targets do not exist in the manual, in your own files the links open the target file as a tab.

## Wiki links

`[[Target]]` links a file by its name, without path and without extension; the search covers the file's folder and up to two sub-folder levels. The `.md` extension may be omitted or written out.

```markdown
[[Project plan]] opens project plan.md from the search scope.
[[Project plan|the plan]] shows custom display text.
```

If the name does not hit a file directly, two fallbacks apply: the index hit across the search scope and the [alias resolution](frontmatter.md) via the frontmatter field `aliases:`; with several candidates a picker dialog asks. In pipe table cells escape the display-text pipe as `\|`.

## Heading and block anchors

Links can point to a heading or a block inside the target file:

```markdown
[[Project plan#Milestones]]    jumps to the heading
[[Project plan#^decision-1]]   jumps to the block anchor
[[#Wiki links]]                anchor within the same document
```

Block anchors are set with `^id` at the end of a line and anchor the surrounding block (paragraph, list item, table, code block):

```markdown
This decision is binding. ^decision-1
```

Broken anchor targets are flagged by the [Markdown linter](tools.md) in the editor.

## Markdown links to files

Classic Markdown links also open `.md` targets as tabs; anchors work the same. In-document anchor links jump within the page — live here: [to the Tags chapter](#tags).

```markdown
[Plan](subfolder/project-plan.md#milestones)
```

## Filenames with spaces

If a filename contains spaces, the notation depends on the link type. Wiki links carry the space directly:

```markdown
[[My Note]]
```

Markdown and image links put the target in angle brackets or encode the space as `%20`:

```markdown
[Text](<My Note.md>)
![Alt](<Image 01.png>)
[Text](My%20Note.md)
```

A raw space without angle brackets ends the target, so the link is not recognised (CommonMark). When you rename a file, the link update writes targets with spaces in the `<…>` form; targets that are already `%`-encoded keep their form.

## Wiki embeds

`![[Target]]` embeds content instead of linking:

```markdown
![[image.png]]           image, optionally with width: ![[image.png|300]]
![[notes.md]]            Markdown file as a rendered block
![[manual.pdf]]          PDF in the interactive viewer
![[notes.md#Chapter]]    only the section below the heading
![[notes.md#^block]]     only the anchored block
```

For block anchors the full surrounding block is embedded (list item with sub-lists, fenced code, table row, blockquote). Embedded Markdown renders with its own source as base; links inside resolve against the embedded file.

## Tags

`#tag` in body text and the `tags:` field in the [frontmatter](frontmatter.md) are recognised as tags; slashes build hierarchies like `#project/markdown`. Tags are clickable in Reading view and Live mode and filter the tags sidebar. Hex colour codes, plain numbers and anchor links are excluded from recognition.

```markdown
Status: #project/markdown #review
```

## Autocomplete

While typing in edit mode a suggestion dropdown opens:

- `[[` suggests file names and aliases,
- `[[File#` heading anchors, `[[File#^` block IDs,
- `#` in body text known tags.

Arrow keys navigate, Enter or Tab selects, Esc closes.

## Sidebars for the network

Three sidebar sections show the network of the active file: **Backlinks** (incoming links, including "via alias"), **Outgoing links** (all outgoing references in document order) and **Tags** (all tags of the search scope with counts). Access paths are listed in the [features table](functions.md).

## Inserting an address into a selection

When text is selected and the clipboard holds a single address, pasting creates a link from both instead of replacing the selection. The selection `Project page` together with the address `https://example.org` becomes:

```markdown
[Project page](https://example.org)
```

If the address contains spaces or brackets, the target is written in the angle form; a `www.` address receives the `https://` prefix:

```markdown
[Entry](<https://example.org/Title_(Extra)>)
```

Without a selection, with clipboard content that is not recognisable as a single address, and inside source code areas normal pasting applies. A single undo step reverts the conversion completely. Access and switch are listed in the [functions table](functions.md).
