---
title: Diagrams and Formulas
tags: [demo, visual]
chapter: 9
topic: visual
---

# Diagrams and formulas

Mermaid draws diagrams, KaTeX typesets maths — both render live in Reading, Split and Live view. Back to [[00 Welcome]].

## Flowchart

```mermaid
flowchart LR
  A[Write] --> B{Review}
  B -->|ok| C[Publish]
  B -->|changes| A
```

## Sequence diagram

```mermaid
sequenceDiagram
  participant U as User
  participant A as App
  U->>A: open a file
  A-->>U: rendered view
```

## Inline formula

```markdown
The area of a circle is $A = \pi r^2$.
```

The area of a circle is $A = \pi r^2$.

## Block formula

```markdown
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

Attachments are next: [[10 Attachments]].
