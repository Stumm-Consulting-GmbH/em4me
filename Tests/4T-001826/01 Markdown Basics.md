---
title: Markdown Basics
tags: [demo, syntax]
chapter: 1
topic: syntax
---

# Markdown basics

Back to [[00 Welcome]]. This page walks through the CommonMark core. Switch between **Reading**, **Split** and **Live** view (View menu) to compare how each one looks.

## Headings

```markdown
## Chapter
### Subchapter
```

Every heading gets an automatic anchor for links and the outline (View → Outline).

## Emphasis

```markdown
**bold**, *italic*, ~~strikethrough~~, `inline code`
```

**bold**, *italic*, ~~strikethrough~~, `inline code`

## Lists

A sub-item belongs to the item above it when it starts where that item's content starts: two characters under `- `, three under `1. `.

```markdown
- Groceries
  - Apples
  - Bread
1. First step
   1. Sub-step
   2. Another sub-step
2. Second step
```

- Groceries
  - Apples
  - Bread

1. First step
   1. Sub-step
   2. Another sub-step
2. Second step

In editing mode you can restructure a list from the keyboard: `Alt+Arrow Up`
and `Alt+Arrow Down` move an item with all its sub-items, `Tab` and
`Shift+Tab` change its level, and numbered lists renumber themselves. A blank
line starts a new list.

## Blockquote and horizontal rule

```markdown
> A quote spanning
> two lines.

---
```

> A quote spanning
> two lines.

---

## Links

```markdown
[Example](https://example.org) and <https://example.org>
```

[Example](https://example.org) and <https://example.org>

Links to other files use double brackets — the whole network lives in [[04 Links and Structure]].

## Code blocks

A language tag after the fence turns on syntax highlighting:

````markdown
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```
````

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

Ready for more? Head to [[02 Extended Syntax]].
