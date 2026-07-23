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
