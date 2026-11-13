---
workflow: true
name: Library Report
description: Writes the long books of the Library below the heading Long books report in 16 Workflows and checks the consistency of the table.
---

# Library Report

A workflow with **database commands**, started by hand. It runs the query file [[Long Books]] and writes its result as a table below the heading "Long books report" of [[16 Workflows]]; a second run replaces the table instead of adding another one. Then it checks the consistency of [[Library]] and reports the result in the status bar. It only reads the data and changes no record. It needs the extension **Database**, which belongs to the working mode Full like the workflows.

```workflow
db-query "Long Books.md" into "16 Workflows.md" under "Long books report"
db-check "Library"
```
