# Markdown basics

The app renders Markdown based on the CommonMark standard, extended with tables, task lists, strikethrough, and autolinks. This page covers the core; the special constructs have their own pages ([Block constructs](blocks.md), [Inline constructs](inline.md), [Linking](linking.md)).

## Headings

Six levels with `#` to `######`; every heading automatically gets an anchor for links and the table of contents.

```markdown
## Chapter
### Subchapter
```

Alternatively there is the Setext form for levels 1 and 2: a text line underlined with `===` (H1) or `---` (H2).

```markdown
Chapter in Setext form
----------------------
```

### Automatic numbering

Headings can be numbered automatically with hierarchical numbers (1, then 1.1, 1.2, and so on). The numbers appear in the render pane, the live mode, the outline, and the exports; the source text stays unchanged.

Control happens on three levels that override each other in this order: the individual heading before the document, the document before the global setting. Globally, the setting 'Number headings' turns numbering on and sets the start level (H1 or H2). Per document, the frontmatter key `numbered-headings` overrides the global setting:

```markdown
---
numbered-headings: true
---
```

Per heading, a marker at the end of the line applies: `{-}` excludes a heading, `{+}` includes it, each also against the global setting. A leading backslash keeps the marker as literal text (`\{-}` appears as `{-}`).

```markdown
## Appendix {-}
## Important {+}
```

Excluded headings are not counted and do not reset the sub-counters; their sub-headings continue counting under the last numbered heading. If a level is skipped, for example from H1 directly to H3, the missing intermediate level counts as one.

## Emphasis

```markdown
**bold**, *italic*, ~~strikethrough~~, `inline code`
```

**bold**, *italic*, ~~strikethrough~~, `inline code`

## Lists

Unordered lists with `-`, `*` or `+`, ordered lists with `1.`. A sub-item belongs to the item above it when it starts where that item's content starts: two characters under `- `, three under `1. `, four under `10. `.

```markdown
- First item
  - Sub-item
1. First step
   1. Sub-step
```

- First item
  - Sub-item

1. First step
   1. Sub-step

### Editing the structure

In editing mode the outline can be changed from the keyboard. The depth always follows the item above, so you never have to count spaces yourself.

- `Alt+Arrow Up` and `Alt+Arrow Down` move an item together with all its sub-items. The jump spans the whole neighbouring branch and the level stays the same. Outside lists the shortcuts move the single line.
- `Tab` and `Shift+Tab` indent and outdent the item together with its sub-items. Indenting only works where there is an item above for the current one to move under.
- With several lines selected, both keys act on exactly the selected range.
- The command "Select subtree" marks an item with everything below it.

### Numbering

Numbered lists renumber themselves in the source as soon as you work in them. The starting number is kept: a list beginning at `3.` continues with `4.`.

A blank line begins a new list. If it arises from your edit, the list below starts again at 1; if it was already there, the second list keeps its own starting number. Source text and rendered view show the same numbers.

```markdown
1. First list
2. Second line

1. New list
2. Second line
```

1. First list
2. Second line

1. New list
2. Second line

### Continuing and ending

The Enter key continues a list and adds a bullet, a consecutive number or an empty checkbox. On an empty sub-item it outdents by one level; on the top level it ends the list.

## Tables

Pipe tables with a header row and a separator row; colons in the separator row control alignment. For multi-line block cells there is [Perspective Table](perspective-table.md), for typing comfort the table editor (see [Tools](tools.md)). To restructure existing tables (moving, inserting and deleting rows and columns, alignment, transposing), use the **Table** submenu in the [Editor context menu](context-menu.md).

```markdown
| Left | Centred | Right |
|:-----|:-------:|------:|
| a    | b       | 12    |
```

| Left | Centred | Right |
|:-----|:-------:|------:|
| a    | b       | 12    |

## Blockquote and horizontal rule

```markdown
> A quote spanning
> several lines

---
```

> A quote spanning
> several lines

---

## Links and autolinks

Markdown links with `[text](target)`; URLs in angle brackets become autolinks. Bare URLs in running text are recognised as well, but the [Markdown linter](tools.md) recommends the explicit link form there.

```markdown
[Example](https://example.org) and <https://example.org>
```

[Example](https://example.org) and <https://example.org>

The reference form separates the link site from the target definition:

```markdown
See the [example page][ref].

[ref]: https://example.org
```

See the [example page][ref].

[ref]: https://example.org

## Hard line breaks

Two trailing spaces or a backslash force a line break within a paragraph.

```markdown
First line\
Second line
```

First line\
Second line

## Code

Inline with backticks, blocks as fenced code with three backticks; a language tag enables syntax highlighting (see [Math and diagrams](math-diagrams.md)). The CommonMark form "indented code" also applies: lines indented by four spaces become a code block.

## Typography

The typographer replaces character sequences with typographic characters: `--` becomes an en dash (–), `...` becomes an ellipsis (…), straight quotes become typographic ones.

```markdown
A thought -- and another one ...
```

A thought -- and another one ...
