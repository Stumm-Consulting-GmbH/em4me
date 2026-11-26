---
title: Extended Syntax
tags: [demo, syntax]
chapter: 2
topic: syntax
---

# Extended syntax

Beyond the core ([[01 Markdown Basics]]), the app adds a handful of writing constructs. Back to [[00 Welcome]].

## Table of contents

A code block with the identifier `toc` lists the headings of this document as linked entries and follows every change by itself; click an entry to jump to its heading. The line `depth: 2` limits the list to the first two levels; without it, all levels appear. In the editor, the context menu adds a block via Insert → Table of contents block.

````markdown
```toc
depth: 2
```
````

```toc
depth: 2
```

## Callouts

```markdown
> [!tip] Custom title
> Box content, normal Markdown allowed.
```

> [!tip] Custom title
> Box content, normal Markdown allowed.

Types include `note`, `info`, `tip`, `success`, `warning`, `danger`, `example` and more. A `-` after the type folds the box shut:

> [!note]- Click to expand
> Hidden until you click the title.

## Highlight

```markdown
Mark the ==important part== of a sentence.
```

Mark the ==important part== of a sentence.

## Footnotes

```markdown
A claim with a source[^src] and one noted inline^[right here].

[^src]: The definition gathers at the bottom of the page.
```

A claim with a source[^src] and one noted inline^[right here].

[^src]: The definition gathers at the bottom of the page.

## Change tracking

Critic Markup records edits in five forms:

```markdown
{++inserted++} {--deleted--} {~~old~>new~~} {==marked==} {>>a comment<<}
```

{++inserted++} {--deleted--} {~~old~>new~~} {==marked==} {>>a comment<<}

## Private comments

Text between paired percent-sign markers stays in the source but never renders and never exports. The syntax, shown safely inside a code block:

```markdown
Visible %%hidden note%% and on we go.
```

And live — a private comment sits between "before" and "after"; you only see it in the editor: before %%this note is invisible in Reading view%% after.

## Emoji

```markdown
:rocket: :tada: :bulb: :+1: :fire:
```

:rocket: :tada: :bulb: :+1: :fire:

## Inline calculations

Calculation expressions between `{=` and `=}` anywhere in running text: the rendered view shows the result, the source keeps the expression (hover the result to see it). The expression language is the same as in queries — numbers, parentheses, strings, date and duration values, and the function catalog. A faulty expression shows a subtle warning sign instead.

```markdown
Sum {= 2+3*4 =}, date {= date(2026-01-01) + dur(30d) =}, text {= upper('abc') =}
```

Sum {= 2+3*4 =}, date {= date(2026-01-01) + dur(30d) =}, text {= upper('abc') =}

Next, put data into shape in [[03 Tables]].
