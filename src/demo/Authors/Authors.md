---
title: Authors
db-table:
  name: Authors
  storage: cards
  fields:
    - name: name
      type: string
      label: Name
      required: true
    - name: born
      type: date
      label: Born
  key: name
  display: name
  views:
    - Books by this author
  lastId: 3
---

# Authors

This table keeps its records differently from [[Library]]: `storage: cards` in the definition above makes it a **card index**. Each author is a document of its own in this folder, a **card**, which carries the identifier of its record as `db-record` in its frontmatter, the fields of the table next to it and free text below. This file holds the definition and nothing else, so it has no record block. The card form suits records with an identity of their own, such as a person, a project or a customer, that deserve a page with notes and attachments; it is not meant for many uniform rows such as loans or measurements, which stay in a table like [[Loans]].

The three cards are [[Ursula K. Le Guin]], [[Stanisław Lem]] and [[Umberto Eco]]. The database overview lists this table with the storage **Card index** and the number of its cards, and **New card** there creates the next one: it asks for the name, which also becomes the file name. A query reaches the cards like the rows of any table, and [[Readings]] points at them through a reference column. Open a card in reading view and the view [[Books by this author]], named under `views` above, appears below its frontmatter with the books of that author from [[Library]]; inside it `this.name` means the card. [[Authors List]] shows the same cards as a list form, and a click on an author in a search result, a query or a reference opens the card itself, while **Open in form** in the command palette leads to its form. Every other document placed in this folder would be reported by **Check consistency**, because it carries no identifier; keep such documents elsewhere. Query files such as the two above are files of the database, not cards, and may stay here.
