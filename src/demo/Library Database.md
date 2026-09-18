---
title: Library Database
tags: [demo, data]
topic: data
db-database:
  name: Library
  description: The books of this demo area — author, length, date of acquisition and loan status.
  schemaVersion: '1.0'
  fallbackLocale: en
---

# Library Database

This page carries one thing only: a **fact sheet**, the container `db-database` in the frontmatter above. It names the database, describes it in one line, records the version of its schema and says which language its labels fall back to. Switch to source view to see the whole of it.

That small block is what makes this folder a **database area**. Nothing is declared twice and nothing is switched on anywhere else: as soon as a single document carries the fact sheet, the area holds a database, and every table in it — here the one in [[Library]] — belongs to that database.

Two things appear once that is the case:

- **View → Database overview** opens a tab of its own: the fact sheet with name and description, every table with the number of its fields, and anything that went wrong while reading the definitions, in plain words. It is a reading view; nothing is edited in it. The same tab is reachable from the context menu of the area panel and from the command palette.
- **File → Settings… → Current area → Database** shows the same in short form and carries one option, which opens the overview by itself whenever the area is opened.

Like most extras, all of this is switchable: **Settings → Extensions → Database** turns it off. A record block then stays an ordinary code block, overview and settings section disappear, and not one character of these files changes — switching it back on brings everything back.

## See also

- [[Library]] — the table itself, definition and records in a single file
- [[00 Welcome]] — back to the start of the tour
