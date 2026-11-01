---
db-query:
---

# Books by this author

This page is a **view** of the card index [[Authors]]: a query file that the definition of that table names under `views`. Open a card such as [[Umberto Eco]] in reading view, and this query appears below its frontmatter, before its free text, with the books of that author from [[Library]].

Inside the view, `this.name` means the card being shown, not this file, so every card lists its own books. Nothing is written to the card, and the Live view shows no view. Opened on its own, `this.name` reads this file, which has no field `name`, so the list below stays empty here.

```perspective-query
TABLE RECORDS title, pages
FROM "Library"
WHERE author = this.name
SORT title
```
