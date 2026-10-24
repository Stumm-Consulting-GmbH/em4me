---
title: Long Books
tags: [demo, data]
topic: data
db-query:
minpages: 500
---

# Long Books

This page is a **query file**. The mark `db-query` in its frontmatter says so, and the one query block below is the query; everything else on the page, like this paragraph, describes it. The database overview lists the file under **Queries**, and [[08 Queries]] embeds it.

The query keeps the books of [[Library]] with more than `minpages` pages, the longest first. `this.minpages` reads that number from the frontmatter of this file, even where the file is embedded in another page. Change it in source view and the list follows.

This file shows its result read-only. With `editable: true` in its container `db-query`, a query file becomes a list form whose rows can be maintained in place; [[Loans List]] is one.

```perspective-query
TABLE RECORDS author, pages
FROM "Library"
WHERE pages > this.minpages
SORT pages DESC
```
