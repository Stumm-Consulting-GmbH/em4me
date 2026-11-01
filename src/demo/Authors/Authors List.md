---
db-query:
  editable: true
  allow: [update]
---

# Authors List

This page is a **list form** over the card index [[Authors]]. It works as it does over a table file: the cards appear as rows of a grid with a count line, and `allow` permits changing them in place. Double-click a row or choose **Edit** in the column **Actions**; **Enter** saves and writes only the changed field lines into the frontmatter of the card.

```perspective-query
TABLE RECORDS name, born
FROM "Authors"
SORT name
```

Click the column **Record** of a row to open the author in the form of the table. There, **Open card** leads to the card itself, and the command **Open in form** in the command palette leads back from the card to the form. A click on an author anywhere else, on a search result, on a record in a query or on a reference, opens the card directly.

New authors are not created here, because a card index creates its records with **New card** in the database overview; this list therefore allows only changes.
