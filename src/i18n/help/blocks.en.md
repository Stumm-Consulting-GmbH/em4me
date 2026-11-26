# Block constructs

Block extensions beyond the Markdown core. Each chapter shows the syntax as a code block and the rendered result directly below; the split view puts both side by side.

## Callouts

Hint boxes: `> [!type]` as the first line of a blockquote, optionally with a custom title. Ten types with their own icon and accent colour: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `example`, `quote`. Unknown types are flagged by the [Markdown linter](tools.md).

```markdown
> [!tip] Custom title
> Box content, normal Markdown allowed.
```

> [!tip] Custom title
> Box content, normal Markdown allowed.

A `+` or `-` after the type makes the callout collapsible: `+` starts open, `-` collapsed — folding works here in the manual too.

```markdown
> [!note]- Started collapsed
> Visible only after clicking the title.
```

> [!note]- Started collapsed
> Visible only after clicking the title.

The spelling of the type does not matter: `[!note]`, `[!Note]` and `[!NOTE]` produce the same box with the same icon, accent colour and default title; `+`, `-` and a custom title work the same way. The text in the file stays exactly as written — capitals carried over from other Markdown programs are not rewritten. The list of ten types stays the same: names outside it, such as `[!IMPORTANT]`, are unknown types in any spelling.

```markdown
> [!WARNING]
> Written in capitals — the same box as with `[!warning]`.
```

> [!WARNING]
> Written in capitals — the same box as with `[!warning]`.

## Custom containers

Container blocks between `::: type` and `:::`. The ten callout types render in callout style, unknown names as a neutral box with the name as title.

```markdown
::: warning
Content in callout style.
:::
```

::: warning
Content in callout style.
:::

The spelling of the name does not matter: `::: warning`, `::: Warning` and `::: WARNING` produce the same box, `::: My-Box` the same neutral box as `::: my-box`, and `::: COLUMNS 2` sets the content in two columns just like `::: columns 2`. The text in the file stays exactly as written; a neutral box shows the name as its title just as it appears there. The list of ten callout types stays the same.

```markdown
::: WARNING
Written in capitals — the same box as with `::: warning`.
:::
```

::: WARNING
Written in capitals — the same box as with `::: warning`.
:::

## Multi-column block

A `::: columns <n>` container renders the enclosed content in multiple columns; valid values are 2 to 5. Text flows automatically and balanced across the columns; a `+++` line forces the break into the next column. Invalid column counts (missing, 1, more than 5, non-numeric) fall back to the neutral container box; outside a multi-column block, `+++` has no effect.

```markdown
::: columns 2
First column with flowing text.

+++

The second column starts here.
:::
```

::: columns 2
First column with flowing text.

+++

The second column starts here.
:::

Wide content (tables, diagrams, long code lines) can overflow a column; with very short blocks the automatic balancing may look uneven. In live mode the block appears as a neutral container with visible marker lines; the multi-column layout applies to the rendered view and the PDF export.

## Definition lists

Term on one line, definition below introduced with `: `; `~` is allowed as marker too. Multiple definitions per term are possible.

```markdown
Cutover
: Switching a system over to productive operation.

Rollback
: Returning to the state before the switch.
```

Cutover
: Switching a system over to productive operation.

Rollback
: Returning to the state before the switch.

## Line blocks

Lines starting with `| ` keep line breaks and leading spaces — meant for addresses and poems.

```markdown
| Stumm-Consulting GmbH
|   4410 Liestal
|   Switzerland
```

| Stumm-Consulting GmbH
|   4410 Liestal
|   Switzerland

## Footnotes

Three forms: reference `[^id]` in the body with a definition `[^id]: text` (usually at the end of the file), plus the inline form `^[direct text]` without a separate definition. The render shows a superscript number; the definitions gather at the end of the page with backlink arrows.

```markdown
A statement with a source[^1] and one with an inline footnote^[noted directly].

[^1]: The definition lives at the end of the file.
```

A statement with a source[^1] and one with an inline footnote^[noted directly].

[^1]: The definition lives at the end of the file.

## Table of contents block

A code block with the identifier `toc` shows the headings of the document at its position as an indented list; every entry is a link, and a click jumps to the heading. A line `depth: N` in the block limits the table of contents to levels 1 to N, with valid values from 1 to 6; without this line, all levels appear. Other lines and values outside 1 to 6 have no effect.

````markdown
```toc
depth: 2
```
````

Rendered, for this page:

```toc
depth: 2
```

The table of contents follows every change by itself: new, renamed and deleted headings are updated at once, in the rendered view as well as in live mode. The entries jump to the same anchors as links to the headings, including headings with identical text and custom IDs with `{#id}`. When the [automatic numbering](markdown-basics.md) of headings is active, the numbers appear in the table of contents too. Headings in code blocks and in the frontmatter do not appear. If the document has no heading, the block shows the note «This document has no headings.». Several blocks in the same document show the same table of contents.

The block is inserted from the [editor context menu](context-menu.md): **Insert → Table of contents block** puts a `toc` block without a `depth:` line on a line of its own; add the depth by hand if needed.

Printing, PDF export and HTML export contain the table of contents as the rendered view shows it. The portable export writes it as an ordinary Markdown list with links to the headings, without numbers; a document without headings gets an empty line at this position. In a [presentation](presentation.md), each slide is shown on its own; a block on a slide lists the headings of that slide.

The block belongs to the [internal extension](extensions.md) «Table of contents block», which is switched on from the working mode **Beginner**. When it is off, the block appears as an ordinary code block with its text, and the context menu does not offer **Table of contents block**; the document stays unchanged, and after switching the extension back on the table of contents appears again.

The «Table of Contents» panel of the [sidebar](sidebar.md) is independent of this: it shows the headings of the open document next to the text and is not part of the document. The block, by contrast, sits in the document itself and therefore also appears in print and export.
