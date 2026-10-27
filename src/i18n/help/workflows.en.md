# Workflows

A **workflow** writes down recurring steps as a fixed sequence: create, rename, move and copy files and folders, append or insert text, set properties in the front matter, run commands, macros and other workflows. A workflow is an **ordinary Markdown file**; what it does is written in a block of fixed commands, one line per step. The file therefore stays readable without the app, can be passed on and can be edited like any other document.

A workflow is started **by hand**: from the menu, the command palette, with a keyboard shortcut, a button above the block or the context menu of the area panel. **Before the first step runs, the app checks the whole workflow**; an error is shown above the block with line and reason, and nothing runs.

## The extension "Workflows"

The feature belongs to the [built-in extensions](extensions.md) ("Workflows", group **Tools**) and is switched on in the working mode **Full**, off in the modes **Beginner** and **Advanced**. When it is switched off, a `workflow` block is an ordinary code block without highlighting, check display and button; there are no workflow commands, no **Workflows** submenu, no **Workflow runs** page and no **Workflows** settings sections. A workflow file is then an ordinary document. Nothing is lost: files, run states and the workflows folder setting are unchanged once the extension is switched on again.

## Structure of a workflow file

A file is a workflow if its front matter carries the marker `workflow: true`. What the workflow does is written in **exactly one** code block with the language `workflow`. The rest of the text is the description for people; its sections can serve as the source of a content (section "Sources of a content" below).

````markdown
---
workflow: true
name: Weekly review
description: Creates the review of the week and records it in the log.
---

# Weekly review

```workflow
# Create the review from the template and open it
create "Reviews/{{date}} Week.md" from-template "Review.md"
open "Reviews/{{date}} Week.md"
insert "Log.md" under "Reviews" from-section "Entry"
notify "Review created"
```

## Entry

- Weekly review created.
````

The front matter only carries marker, name, trigger and description:

| Key | Required | Meaning |
| --- | --- | --- |
| `workflow` | yes | `true` marks the file as a workflow. |
| `name` | no | Name of the workflow in menu, command palette and notices; without it, the file name without extension applies. |
| `trigger` | no | Trigger; without it, `manual` applies, the start by hand. |
| `description` | no | Short description; the **Workflow runs** page shows it as a tooltip on the name. |

A trigger other than `manual` is shown as "not yet supported", and the workflow does not run; the file stays unchanged. A file with two or more `workflow` blocks, or none, does not run either. A block that contains only comments is valid and does nothing.

## Command lines

The lines of the block follow a fixed form:

- **One line is one command.** Empty lines and lines starting with `#` are comments. There is no comment after a command, and no continuation across several lines.
- **First the keyword, then the arguments**, separated by spaces. The keywords are English and written in lower case: `create`, not `Create`.
- **Paths and texts** stand in straight double quotes. A quote inside a text is written `\"`; every other backslash stays as it is. Typographic quotes, as a word processor inserts them when copying, count as an error.
- **Numbers and command IDs** stand without quotes: `wait 2`, `command view.modeSplit`.
- **Named options** are a pair of option and value, such as `from-template "Day.md"` or `under "Log"`, or a single word such as `at-start`. They follow the other arguments in any order, at most one of each kind.
- **Paths** are relative to the root of the area in which the workflow is started; the separator is the slash `/`. An absolute path and a path with `..` are not allowed. The path after `from-template` names a template and is relative to the [templates folder](templates.md).

```workflow
# Comment: create the folder for a new project
mkdir "Projects/{{prompt:Project name?}}/Notes"
replace "{{file}}" "Status: open" "Status: \"in progress\""
insert "{{file}}" at-start from-file "Snippets/Header.md"
```

## Checking before running

Before the first step, the app checks the whole file, together with every workflow it calls. Among other things, it reports:

- unknown commands and commands of a later stage,
- missing, surplus and wrongly written arguments, unknown or duplicate options,
- paths outside the area, empty paths and texts, invalid new names,
- a waiting time above ten seconds,
- unknown commands, macros and workflows, and names carried by several macros or workflows,
- a workflow that calls itself, also by way of another one, and nesting deeper than five levels,
- faulty placeholders, unreadable templates and templates switched off.

A finding stops the run **before the first step**; a faulty workflow file thus does not run at all instead of running in part. The check reports all findings at once; the line given is the line in the document as the editor counts it, front matter included.

What only an earlier step can bring about is checked by the app at the step itself: whether a file, a section or a heading exists. If it is missing then, the step fails.

## Commands

The commands of the first stage, ordered by what they act on. Paths are relative to the area root.

### Files and folders

| Command | Meaning | Arguments | Example |
| --- | --- | --- | --- |
| `create` | create a file, empty or with content | path; optionally a source | `create "Journal/{{date}}.md" from-template "Day.md"` |
| `rename` | rename a file or folder | path, new name | `rename "Draft.md" "Note {{date}}.md"` |
| `move` | move a file or folder into a folder; links are updated | path, target folder | `move "{{file}}" "Archive/2026"` |
| `copy` | copy a file | path, target | `copy "Patterns/Checklist.md" "Projects/New/Checklist.md"` |
| `mkdir` | create a folder, nested too | path | `mkdir "Projects/New/Notes"` |
| `open` | open a file in the window or switch to it | path | `open "Journal/{{date}}.md"` |
| `close` | close an open document | path | `close "{{file}}"` |

- **Existing target:** if the target of `create`, `copy`, `rename` or `move` already exists, the step fails; nothing is overwritten.
- **Missing target folder:** `create`, `copy` and `move` create it inside the area.
- **Moving and renaming** take the same route as in the area panel: links to the file are updated, subpages and the companion file move along.
- `mkdir` on an existing folder and `close` on a document that is not open succeed without changing anything. `close` on an unsaved document shows the usual save prompt; "Cancel" ends the run at this line.

### Content and front matter

| Command | Meaning | Arguments | Example |
| --- | --- | --- | --- |
| `append` | put content at the end of a file | path, source | `append "{{file}}" from-section "Open points"` |
| `insert` | insert content under a heading or at the start | path, place (`under "Heading"` or `at-start`), source | `insert "{{file}}" under "Log" from-section "Entry"` |
| `replace` | replace every occurrence of a text | path, search text, replacement | `replace "{{file}}" "PROJECT" "{{prompt:Project name?}}"` |
| `set-property` | set or change a property in the front matter | path, name, value | `set-property "{{file}}" status "done"` |
| `remove-property` | remove a property from the front matter | path, name | `remove-property "{{file}}" draft` |

- `insert … under` inserts directly below the heading, before its previous content; `insert … at-start` inserts at the start of the text, after the front matter. If the heading is missing or occurs more than once, the step fails.
- `replace` replaces every occurrence, like "Replace all" in the editor; if it finds none, the step fails.
- `set-property` and `remove-property` leave the other properties in their order. `remove-property` on a property that does not exist succeeds without a change.
- **Open files:** if the target file is open in a window and unsaved, the change goes to that window and appears there as a change in the editor; unsaved work is kept. Otherwise the file is written directly.

### App and flow

| Command | Meaning | Arguments | Example |
| --- | --- | --- | --- |
| `command` | run a command of the app | command ID | `command view.modeSplit` |
| `macro` | run a macro from the settings | name of the macro | `macro "Start of day"` |
| `workflow` | run another workflow of the workflows folder | name of the workflow | `workflow "Create folders"` |
| `wait` | pause in seconds, at most 10 | number | `wait 2` |
| `notify` | show a text as a notice in the status bar | text | `notify "Weekly review created"` |
| `stop` | end the run with a text | text | `stop "Nothing to do"` |

- `command` takes the fixed ID of a command, such as `view.modeSplit`, `view.modeLive` or `file.save`, and runs it in the starting window. If it cannot be run at the moment, the step fails. Macros and workflows do not run through `command` but through their own commands.
- `macro` and `workflow` may be nested at most five levels deep. A called workflow returns after its last step; if a step fails in it, the whole run ends.
- `stop` ends the whole run, also from a called workflow; the status bar shows "Workflow ‹Name› stopped at line N: text".

### Sources of a content

`create`, `append` and `insert` take their content from one of three sources. A content never stands as running text in the command line.

| Option | Content |
| --- | --- |
| `from-template "path"` | a template from the templates folder, filled as when applying a template; its input dialogs appear before the first step |
| `from-file "path"` | the content of another file of the area, verbatim, as it is at the step |
| `from-section "Heading"` | the content of a section of the workflow file itself, verbatim |

A section is the text under its heading up to the next heading of the same or a higher level, without the heading itself; subsections belong to it. It is found as with a link `[[File#Heading]]`. `from-file` and `from-section` copy verbatim: placeholders in them stay as they are. Only a template is filled. If the extension "Templates" is switched off, the check reports "Templates are turned off" for `from-template`; workflows without templates keep running.

## Placeholders

Placeholders work in every argument of a command line. Templates and workflows share the same set; the notation with offset and format is described on the [Templates](templates.md) page.

| Placeholder | Value in a command line |
| --- | --- |
| `{{date}}`, `{{time}}` | date and time of the start, also with offset and format: `{{date:+7d:dd.MM.yyyy}}` |
| `{{file}}` | path of the document active at the start, relative to the area root, such as `Projects/Plan.md` |
| `{{title}}` | title of the document active at the start |
| `{{folder}}` | folder of the document active at the start, relative to the area root |
| `{{area}}` | name of the area |
| `{{prompt:Question}}`, `{{prompt:Question:Default}}` | input dialog |
| `{{select:Question:a,b,c}}` | choice dialog |

- **All dialogs before the first step:** the input and choice dialogs of the whole run appear one after the other before anything happens, including those of the templates used and of the called workflows. The same question is asked once and applies everywhere. Cancelling a dialog cancels the run, and no step runs.
- **One point in time per run:** `{{date}}` and `{{time}}` have the same value in all lines, also across midnight.
- **In a template used by a workflow**, `{{title}}` and `{{folder}}` mean the new file as usual, while `{{file}}` and `{{area}}` mean the active document and the area.
- `{{cursor}}` is not allowed in a command line, `{{clipboard}}` is available there only in a later stage. `\{{` writes a literal `{{`.
- If `{{folder}}` is empty in the root folder, `"{{folder}}/New.md"` becomes the path `New.md`. Without an active document, `{{file}}` is empty, and a path made from it is a finding.

## Starting a workflow

A workflow starts only in an open area, and its paths apply in that area, even if the file comes from the app-wide workflows folder. The ways:

| Way | Effect |
| --- | --- |
| **File → Workflows** | every workflow of the workflows folder as an entry, subfolders as submenus |
| **Command palette** (default `Ctrl+K`) | every workflow of the workflows folder as a command under its name |
| **Status bar and context menu** | the command of a workflow, placed through [command placement](command-placement.md) |
| **Keyboard shortcut** | assigned to the command of a workflow under "Settings → Keyboard shortcuts" |
| **"Run" button above the block** | in the live view, the rendered view and the split view, on the right of the block's header line; runs any workflow file, also outside the workflows folder, with the state in the editor |
| **"Run" in the area panel** | at the top of the context menu of every workflow file of the area |
| **"Workflow runs" page** | "Run" button in the row of every workflow |

The button above the block is disabled while the check reports a finding. For a document that has never been saved it shows "Save first", outside an area "Can only run inside an open area".

The command of a workflow gets its ID from the path of the file in the workflows folder; two workflows of the same name in different subfolders thus stay distinguishable. **Renaming a workflow in the application or moving it within the workflows folder keeps its assignments:** a keyboard shortcut, a place in the status bar, context menu or format toolbar and a macro step that calls it move along. **Outside the application**, for example in the file manager, the application does not notice the renaming; the assignments then lose their target and have to be set again. A workflow moved out of the workflows folder is no longer a command; its assignments stay saved and work again as soon as it returns to the same place.

## Course of a run

1. The app checks the workflow together with the workflows it calls.
2. The dialogs of all placeholders appear one after the other.
3. The steps run strictly one after the other; each waits for the previous one.
4. The first failure ends the run. The status bar shows "Workflow ‹Name› aborted at line N: reason".

Steps carried out stay carried out; there is no undo across several steps. **At most one workflow runs per window**; a second start during a run is turned down with a notice.

## Workflows folder and menu

As with templates, there is a **workflows folder**, set on two levels under "File → Settings…":

- **App-wide** in the section **Extensions (internal) → Workflows**.
- **Per area** in the section **Current area → Workflows** with the switch "Use area configuration" and the button "Browse…". The folder is saved relative to the area root in the area file and **replaces** the app-wide one completely.

The submenu **File → Workflows** sits directly after the submenu **Area**. It shows the files of the folder that carry the marker, alphabetically by name on each level; subfolders appear as submenus, files without the marker are left out. After a separator follow:

- **Show workflow runs** — opens the **Workflow runs** page.
- **New Workflow…** — asks for the name, creates a file in the workflows folder with front matter, a description line and an empty `workflow` block with two comment lines, and opens it. Without a folder set, it first asks for the folder and keeps it, in the settings of the area when an area is open. It never overwrites an existing file. The entry is also in the command palette.
- **Set Workflows Folder…** — opens the settings at the section **Workflows**.

Without a folder set, the submenu shows "No workflows folder set", for an empty folder "No workflows in the workflows folder", for one that cannot be reached "Workflows folder not found". The submenu and the commands follow every change in the folder.

## Run state and the "Workflow runs" page

After every run, the app records in the **companion file** of the workflow (`.mdd`, section `workflow`) the point in time, the result, if applicable the aborted line, and the number of runs; the text of the workflow file stays untouched. The run state travels along when the file is renamed or moved, not when it is copied.

The **Workflow runs** page opens through "View → Show workflow runs", through "File → Workflows → Show workflow runs" and through the command palette. It lists **all workflows of the area**, also those outside the workflows folder, with the columns **Workflow**, **Location**, **Last run**, **Result** and **Runs** and a "Run" button per row. A workflow that has never run is listed as "never run".

| Result | Meaning |
| --- | --- |
| completed | all steps have run |
| aborted at line N: reason | a finding or a failure ended the run |
| stopped at line N | the command `stop` ended the run |
| Input canceled, no step carried out | a dialog was cancelled |

After a run in this window, the page shows the same reason as the status bar. The companion file keeps only the line and the kind of reason; after a restart and for a run from another window, single details such as a file name therefore appear as "…". The page updates after every run; the "Refresh" button reads it again.

## Support in the editor

- **Highlighting:** in the command lines, the keyword is bold, text in quotes coloured and placeholders italic, in the editor as in the reading view.
- **Check display:** the live view, the rendered view and the split view show the result of the check above the block: green "ready" or red "Line N: reason", with "(+N more)" for several findings. The notices about several blocks and about a trigger not yet supported appear there too. The display follows the text shortly after every change and shows the same finding the start reports. In printing, in an export and for an embedded file the header line does not appear.

Highlighting and display do not change the text of the file.

## Limits

- **Only in the area:** no command reads or writes outside the root of the area in which the workflow was started, not even through a placeholder.
- **No deleting, no network, no external programs.**
- **By hand only:** a workflow never starts by itself and runs only while the app is running.
- `notify` shows its text in the status bar; there is no notification of the operating system.
- **Macros** stay as they are and can be called as a step; a macro is a sequence of commands in the settings, a workflow a procedure as a document. **[Script blocks](scripts.md)** remain read-only; a workflow is not a general scripting language but a fixed catalogue of commands.

## Later stages

Further stages are planned, with scope and timing not yet fixed: a start on a schedule, maintenance commands such as deleting with confirmation, setting and removing tags or ticking off tasks, a start on events in the area, conditions and repetitions, and commands for the [database](database.md). The check already knows the keywords of these commands and reports them as "only available in a later stage", so that such a file does not run in part.
