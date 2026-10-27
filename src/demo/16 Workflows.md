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

## Three examples

This demo area sets its **workflows folder** to `Workflows`, so its three workflows show up right away under **File → Workflows** and in the command palette:

- [[New Meeting Note]] — asks for a title, creates a note from the template of [[11 Templates]] and opens it. It needs the template folder set as described there.
- [[Add Log Entry]] — appends a section of its own file to the log at the end of this page.
- [[Side by Side]] — runs an app command: the active document switches to source and preview side by side.

Open one of them in the live view: above its `workflow` block the check shows green "ready", and the **Run** button on the right starts it. Change a keyword to something unknown, and the line turns red with line number and reason — a faulty workflow never runs halfway. Every run is recorded; **View → Show workflow runs** lists all workflows of the area with their last result.

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

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:

## Log

- The log of [[Add Log Entry]] starts here.
