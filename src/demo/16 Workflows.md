---
title: Workflows
tags: [demo, authoring]
chapter: 16
topic: authoring
---

# Workflows

A **workflow** writes down recurring steps as fixed commands, one line per step: create, move and copy files, append or insert text, set properties, run commands, macros and other workflows. It is an ordinary Markdown file, readable without the app. Back to [[00 Welcome]].

## Switch it on

Workflows belong to the **Full** working mode. In Beginner and Advanced mode they are switched off, and a workflow file is then a plain document with a plain code block. Turn them on under **Settings → Extensions** with the switch **Workflows**, or choose the working mode Full there.

## Six examples

This demo area sets its **workflows folder** to `Workflows`, so its six workflows show up right away under **File → Workflows** and in the command palette:

- [[New Meeting Note]] — asks for a title, creates a note from the template of [[11 Templates]] and opens it. It needs the template folder set as described there.
- [[Add Log Entry]] — appends a section of its own file to the log at the end of this page.
- [[Side by Side]] — runs an app command: the active document switches to source and preview side by side.
- [[Daily Note]] — runs on a schedule, every weekday at 08:00, once it is armed: it creates the note of the day and tags it.
- [[Inbox Rule]] — runs on an event, once it is armed: every new note in the folder `Inbox` gets the tag `inbox` and, if it has no status yet, `status: new`.
- [[Library Report]] — works with the database: it writes the long books of [[Library]] as a table into the section "Long books report" below and reports the consistency of the table. It changes no record.

Open one of them in the live view: above its `workflow` block the check shows green "ready", and the **Run** button on the right starts it. Change a keyword to something unknown, and the line turns red with line number and reason — a faulty workflow never runs halfway. Every run is recorded; **View → Show workflow runs** lists all workflows of the area with their last result.

## Running on a schedule

[[Daily Note]] carries `trigger: schedule` and the line `schedule: every weekday at 08:00` in its front matter. A workflow on a schedule is **not armed** when it arrives, and this demo area ships it that way. To arm it, open **View → Show workflow runs** and tick its box in the column **Armed**, or press the button **Armed** above its block. From then on it runs at its times while the app and this area are open, the column **Next run** shows when, and the status bar element **Workflows** shows its last run. Untick the box to disarm it; **Run** starts it by hand at any time.

## Running on an event

[[Inbox Rule]] carries `trigger: event` and the line `event: file-created in "Inbox" matching "*.md"` in its front matter. It, too, arrives **not armed**; arm it in the same places as [[Daily Note]], and the column **Next run** then shows its event in words. Create the folder `Inbox` and put a note into it, in the app or with the file manager: within a few seconds the note carries the tag `inbox`. Events count only while the app and this area are open, and nothing that happened in between is caught up. What a workflow writes itself never starts another run, so the rule cannot run in circles.

## Working with the database

Workflows also work with the records of the database: `db-create`, `db-update` and `db-delete` create, change and delete records by the same route as the form, `db-query` writes the result of a query file into a note, `db-for-each` repeats steps for every record of a query, and `{{db:Library:Solaris:pages}}` reads a single value. [[Library Report]] uses two of them and changes nothing: run it, and the section "Long books report" below fills with the books of [[Long Books]]; run it again, and the table is replaced, not repeated. On a schedule and on events a workflow may create and change records but never delete them, and what it writes never starts an event. The manual page **Workflows** describes every database command.

## What a workflow file looks like

The front matter marks the file, the `workflow` block holds the steps, and the rest is description:

````markdown
---
workflow: true
name: Add Log Entry
---

```workflow
append "16 Workflows.md" from-section "Entry"
notify "Log entry added to 16 Workflows"
```

## Entry

- A workflow added this line.
````

Paths are relative to the area root and never leave it; texts and paths stand in straight double quotes. Placeholders such as `{{date}}`, `{{file}}` or `{{prompt:Question}}` work in every line, and all questions are asked before the first step. The manual page **Workflows** lists every command.

Dashboards come next in [[17 Dashboards]].

## Long books report

- Run [[Library Report]] to fill this section with a table of the long books.

## Log

- The log of [[Add Log Entry]] starts here.
