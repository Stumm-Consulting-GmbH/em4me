---
title: Library Database
tags: [demo, data]
topic: data
db-database:
  name: Library
  description: The books of this demo area, their loans and the library staff — author, length and date of acquisition of each book, who borrowed it until when, and who reports to whom.
  schemaVersion: '1.0'
  fallbackLocale: en
  roles:
    librarian: all
    assistant:
      Library: [update]
      Loans: [create, update, delete]
      Staff: []
  defaultRole: librarian
---

# Library Database

This page carries one thing only: a **fact sheet**, the container `db-database` in the frontmatter above. It names the database, describes it in one line, records the version of its schema and says which language its labels fall back to. Switch to source view to see the whole of it.

That small block is what makes this folder a **database area**. Nothing is declared twice and nothing is switched on anywhere else: as soon as a single document carries the fact sheet, the area holds a database, and every table in it — here [[Library]], [[Loans]] and [[Staff]] — belongs to that database. Queries reach into these tables too: [[08 Queries]] lists records, follows the references between them, draws the team as a tree and counts the books per author. [[Long Books]] keeps one such query in a file of its own.

Two things appear once that is the case:

- **View → Database overview** opens a tab of its own: the fact sheet with name and description, every table with the number of its fields, every query file under **Queries**, and anything that went wrong while reading the definitions, in plain words. Nothing is edited in the overview itself, but its actions lead on: **New record** opens the form of a new record, **Check consistency** goes through all records and lists what contradicts the rules of the tables, **Usage** shows which tables point at a table, and **Open** opens a query file. The same tab is reachable from the context menu of the area panel and from the command palette.
- **File → Settings… → Current area → Database** shows the same in short form and carries one option, which opens the overview by itself whenever the area is opened.

The fact sheet also names **roles**, which say per table what may be done: `librarian` may do everything, `assistant` may change books, create, change and delete loans, and nothing at all in [[Staff]]. `defaultRole: librarian` gives everyone who opens this area the role `librarian`, so nothing is restricted here; the overview shows your role in the line **Own role**, together with your login name, and the permissions of that role below each table. To see a restriction, switch to source view, change `defaultRole` to `assistant` and save: the form of a record in [[Staff]] shows its fields read-only and offers neither **Edit** nor **Delete**, **New record** disappears below that table, and a book can be changed but not deleted. Because `assistant` lacks the permission `define`, the application then no longer saves a change to this fact sheet. To switch back, turn the extension off as described below, set `defaultRole` back to `librarian`, save and turn it on again, or make that change with another editor. Roles prevent mistakes in operation, not misuse: anyone who can read these files reads and changes them with any editor.

Like most extras, all of this is switchable: **Settings → Extensions → Database** turns it off. A record block then stays an ordinary code block, overview and settings section disappear, and not one character of these files changes — switching it back on brings everything back.

## See also

- [[Library]] — the table itself, definition and records in a single file
- [[Library#^r-00001]] — a link to a single record; it opens the form of *The Name of the Rose*, and the form's **Show in table document** leads to its row
- [[Loans]] — a second table whose first column points at a record of [[Library]]
- [[Library Form]] — the default form of a book, with a computed value and a link to [[Library Short Form]]
- [[Staff]] — a third table whose field `manager` points back into the same table
- [[Long Books]] — a query kept in a file of its own, listed in the overview under Queries
- [[00 Welcome]] — back to the start of the tour
