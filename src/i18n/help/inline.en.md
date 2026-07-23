# Inline constructs

Markup within a line, beyond bold/italic. Syntax as a code block, the result below.

## Highlight

```markdown
Emphasise the ==important part==; \== stays plain text.
```

Emphasise the ==important part==; \== stays plain text.

## Subscript and superscript

Subscript with `~…~`, superscript with `^^…^^` (double caret, because the single `^` is taken by footnotes and block anchors).

```markdown
H~2~O and x^^2^^
```

H~2~O and x^^2^^

## Underline

```markdown
++underlined text++
```

++underlined text++

## Spoiler

Concealed text, revealed on mouse hover or keyboard focus. In pipe table cells escape the pipes as `\|`, otherwise the cell separation cuts the spoiler apart.

```markdown
The answer: ||42||
```

The answer: ||42||

## Critic Markup

Change tracking with five forms: insertion, deletion, substitution, highlight, comment.

```markdown
{++inserted++} {--deleted--} {~~old~>new~~} {==highlighted==} {>>comment<<}
```

{++inserted++} {--deleted--} {~~old~>new~~} {==highlighted==} {>>comment<<}

## Comments

Text between `%%` markers is a private comment: it stays in the source but appears in no rendered view and no export. Comments work within a line and across several lines; an opening `%%` without a closing one takes effect until the end of the document. In code blocks and code spans `%%` remains ordinary text; `\%%` yields a literal `%%` in running text (each marker is escaped individually). In the editor, comment areas are subtly coloured (source and live view). The visible Critic Markup comment `{>>…<<}` from the section above is independent of this: it serves review and is rendered, while the `%%` comment stays private.

```markdown
Visible text %%private comment%% and on with the sentence.

%%
Multi-line comment: everything up to the
closing marker stays private.
%%
```

This line demonstrates the behaviour live; between "here" and "there" sits a comment: here %%invisible to readers%% there.

## Bracketed spans and heading attributes

Inline spans with attributes: `[text]{.class #id}`; only `id` and `class` are allowed. Headings get a custom anchor ID with `{#my-id}`, which wins over the automatic anchor (useful for stable links when titles change, see [Linking](linking.md)).

```markdown
A [marked section]{#span-demo} in running text.

### Heading with a fixed ID {#fixed-id}
```

A [marked section]{#span-demo} in running text.

### Heading with a fixed ID {#fixed-id}

## Abbreviations

Definition line `*[abbr]: long text`; every occurrence of the abbreviation gets a dotted underline with the long text as tooltip (hover over the abbreviation).

```markdown
*[HTML]: Hyper Text Markup Language

The app produces HTML when rendering.
```

*[HTML]: Hyper Text Markup Language

The app produces HTML when rendering.

## Inline calculations

Calculation expressions between `{=` and `=}` anywhere in running text: the rendered view, the live mode and the exports show the **result**, the source keeps the expression; the raw expression appears as tooltip (hover over the result). In live mode the cursor line shows the raw expression for editing; clicking the result places the cursor inside it. Calculation uses the expression language of the [Perspective Query](frontmatter-query.md): numbers, parentheses, strings, date and duration values as well as the function catalogue. Field accesses (e.g. `file.name`) are not available in inline calculations.

```markdown
Sum {= 2+3*4 =}, Date {= date(2026-01-01) + dur(30d) =}, Text {= upper('abc') =}
```

Sum {= 2+3*4 =}, Date {= date(2026-01-01) + dur(30d) =}, Text {= upper('abc') =}

Rules and specifics:

- **Operators**: `+`, `-`, `*`, `/` with the usual precedence and parentheses; comparisons `=`, `!=`, `<`, `<=`, `>`, `>=` as well as `AND`, `OR`, `NOT` yield `true`/`false`. Between numbers the minus needs a space (`4 - 1`, not `4-1` — the latter is read by the expression language as a field name).
- **Date and duration**: `date(...)` and `dur(...)` as in the query language; date ± duration yields a date, date − date a duration.
- **Functions**: the function catalogue of the query language (`number`, `string`, `lower`, `upper`, `length`, `startswith`, `endswith`, `contains`, `default`, `choice`, `dateformat`, `sum`, `min`, `max`, `average`).
- **Error**: An expression that cannot be evaluated shows a subtle ⚠︎ with the error notice in the tooltip; the source stays unchanged.
- **Escape**: `\{=` yields a literal `{=` in running text.

```markdown
Comparison {= 10/4 >= 2 =}, Condition {= choice(1 = 2, 'yes', 'no') =}, Error {= 2+ =}
```

Comparison {= 10/4 >= 2 =}, Condition {= choice(1 = 2, 'yes', 'no') =}, Error {= 2+ =}
