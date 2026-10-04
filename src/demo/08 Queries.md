---
title: Queries
tags: [demo, data]
chapter: 8
topic: data
---

# Queries

A `perspective-query` block runs a live query over the whole area and drops the result right here. Every hit below is a real file, task or record from this demo — click one to open it. Back to [[00 Welcome]].

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

## Pages that link here

An empty wiki link stands for the page the query sits in, so this block carries no file name of its own — copy it anywhere and it reports that page's backlinks. `bold()` highlights a value inside the cell:

```perspective-query
TABLE bold(title) AS "Page", topic AS "Topic"
FROM [[]]
SORT chapter
```

## Everything after this chapter

The `this.` prefix reads a property of the page holding the query instead of the page being tested:

```perspective-query
LIST FROM #demo WHERE chapter > this.chapter SORT chapter
```

## Records of the library database

With `RECORDS` after `LIST` or `TABLE`, a query runs over the records of a database table instead of over files: `FROM` names the table, and every field keeps the type of its column. A hit here is a record, and clicking it opens its form rather than the table file.

### Long books, by author

Numbers compare as numbers, so `pages > 500` keeps the books of [[Library]] with more than five hundred pages:

```perspective-query
TABLE RECORDS author, pages
FROM "Library"
WHERE pages > 500
SORT author
```

### Each loan with its book

`book` in [[Loans]] points at a record of [[Library]], and `book.title` reads the title of that book:

```perspective-query
TABLE RECORDS book.title AS "Title", book.author AS "Author", due
FROM "Loans"
SORT due
```

### The loans of one book

The other direction is a condition on the reference field. The title is the key of the library, so it names the book just as well as its identifier `r-00005` would:

```perspective-query
LIST RECORDS FROM "Loans" WHERE book = "A Wizard of Earthsea"
```

### Everyone below the director

`descendants` follows `manager` in [[Staff]] down through every level. The director herself is not one of her own descendants:

```perspective-query
LIST RECORDS role FROM descendants([[Staff#^r-00001]], manager)
```

### Only those who joined after 2015

A hierarchy filters and sorts like any other source:

```perspective-query
LIST RECORDS since FROM descendants([[Staff#^r-00001]], manager) WHERE since > 2015 SORT since
```

### Up the chain

`ancestors` walks the other way. Here the target is named by its key, the name of the person:

```perspective-query
LIST RECORDS role FROM ancestors([[Staff#Finn Larsen]], manager)
```

### The whole team as a tree

`DISPLAY tree BY manager` draws the hierarchy indented: Ada at the top, the two heads below her, and their people below them.

```perspective-query
LIST RECORDS role FROM "Staff" DISPLAY tree BY manager
```

### A presentation form that does not exist

An unknown presentation form is no error: the result appears as it would without the setting, with a note above it.

```perspective-query
LIST RECORDS FROM "Staff" DISPLAY cards
```

## Groups and totals

`GROUP BY` gathers the hits of a query into groups, at every level. In a table each group becomes one row, and functions such as `count()` and `sum()` add up over the group; in a list the hits stand under a heading per group.

### Books per author

How many books each author has in [[Library]], and how many pages they add up to. `HAVING` keeps only the authors with more than one book, and `SORT` puts those with the most books first:

```perspective-query
TABLE RECORDS count() AS "Books", sum(pages) AS "Pages"
FROM "Library"
GROUP BY author
HAVING count() > 1
SORT count() DESC, author
```

### Loans per book

Grouped by the reference field `book`, each row of [[Loans]] stands for one book, and a click on its title opens the form of that book. `max(due)` picks the latest due date in the group:

```perspective-query
TABLE RECORDS count() AS "Loans", max(due) AS "Due last"
FROM "Loans"
GROUP BY book
```

### Pages by topic

A grouped list puts the pages under a heading per `topic`. `HAVING count() > 1` drops the topics with a single page, and `SORT` orders the pages within each group:

```perspective-query
LIST FROM #demo
GROUP BY topic
HAVING count() > 1
SORT file.name
```

### A query in a file of its own

[[Long Books]] is a **query file**: the mark `db-query` in its frontmatter and a single query block. It shows its result when opened, the database overview lists it under **Queries**, and it can be embedded anywhere, as here. Its `this.` still means the query file, so the setting `minpages` comes from there:

![[Long Books]]

Queries keep themselves current: edit a tag or tick a task and watch a result change. Visuals come next in [[09 Diagrams and Formulas]].
