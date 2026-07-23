---
title: Queries
tags: [demo, data]
chapter: 8
topic: data
---

# Queries

A `perspective-query` block runs a live query over the whole area and drops the result right here. Every hit below is a real file or task from this demo — click one to open it. Back to [[00 Welcome]].

## Every page, as a table

Sorted by the `chapter` property from each file's frontmatter:

```perspective-query
TABLE chapter AS "Ch.", topic AS "Topic"
FROM #demo
SORT chapter
```

## Just the planning pages

`FROM #planning` narrows to the files tagged that way:

```perspective-query
LIST FROM #planning SORT file.name
```

## Pages on a given topic

```perspective-query
LIST topic WHERE topic = "syntax"
```

## Open tasks across the area

The `TASKS` scope collects checkbox lines instead of files:

```perspective-query
LIST TASKS WHERE status.type = "TODO"
```

## Everything that links back to Welcome

```perspective-query
LIST FROM [[00 Welcome]] SORT file.name
```

Queries keep themselves current: edit a tag or tick a task and watch a result change. Visuals come next in [[09 Diagrams and Formulas]].
