# Workflows

A **workflow** writes down recurring steps as a fixed sequence: create, rename, move, copy and move to the trash files and folders, append or insert text, set properties and tags in the front matter, tick off tasks, run commands, macros and other workflows. A workflow is an **ordinary Markdown file**; what it does is written in a block of fixed commands, one line per step. The file therefore stays readable without the app, can be passed on and can be edited like any other document.

A workflow is started **by hand**: from the menu, the command palette, with a keyboard shortcut, a button above the block or the context menu of the area panel. A workflow with a schedule also runs **on schedule** once it is armed. **Before the first step runs, the app checks the whole workflow**; an error is shown above the block with line and reason, and nothing runs.

## The extension "Workflows"

The feature belongs to the [built-in extensions](extensions.md) ("Workflows", group **Tools**) and is switched on in the working mode **Full**, off in the modes **Beginner** and **Advanced**. When it is switched off, a `workflow` block is an ordinary code block without highlighting, check display and buttons; there are no workflow commands, no **Workflows** submenu, no **Workflow runs** page, no **Workflows** status bar element, no **Workflows** settings sections and no run on schedule. A workflow file is then an ordinary document. Nothing is lost: files, run states including the armed state and the workflows folder setting are unchanged once the extension is switched on again.

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

The front matter carries marker, name, trigger, description and, for a run on schedule, the schedule:

| Key | Required | Meaning |
| --- | --- | --- |
| `workflow` | yes | `true` marks the file as a workflow. |
| `name` | no | Name of the workflow in menu, command palette and notices; without it, the file name without extension applies. |
| `trigger` | no | Trigger: `manual` for the start by hand, `schedule` for the run on schedule; without it, `manual` applies. |
| `schedule` | with `trigger: schedule` | Schedule in one line, such as `every weekday at 08:00` (section "Schedule and arming"). |
| `missed` | no | Handling of missed runs: `run-once` catches up once, `skip` lets them lapse; without it, `run-once` applies. |
| `description` | no | Short description; the **Workflow runs** page shows it as a tooltip on the name. |

A trigger other than `manual` or `schedule` is shown as "not yet supported", and the workflow does not run; the file stays unchanged. A file with two or more `workflow` blocks, or none, does not run either. A block that contains only comments is valid and does nothing.

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
- faulty placeholders, unreadable templates and templates switched off,
- an unreadable schedule, a missing or disallowed time, `schedule` without `trigger: schedule` and the other way round, and an unknown value for `missed`.

A finding stops the run **before the first step**; a faulty workflow file thus does not run at all instead of running in part. The check reports all findings at once; the line given is the line in the document as the editor counts it, front matter included. The one exception is the finding "Manual only" (section "Schedule and arming"): it only prevents arming, the start by hand stays possible.

What only an earlier step can bring about is checked by the app at the step itself: whether a file, a section or a heading exists. If it is missing then, the step fails.

## Commands

The commands, ordered by what they act on. Paths are relative to the area root.

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
| `notify` | show a text as a notice | text | `notify "Weekly review created"` |
| `stop` | end the run with a text | text | `stop "Nothing to do"` |

- `command` takes the fixed ID of a command, such as `view.modeSplit`, `view.modeLive` or `file.save`, and runs it in the starting window. If it cannot be run at the moment, the step fails. Macros and workflows do not run through `command` but through their own commands.
- `macro` and `workflow` may be nested at most five levels deep. A called workflow returns after its last step; if a step fails in it, the whole run ends.
- `notify` shows its text in the status bar, for a run on schedule also as a notification of the operating system (section "Course of a run").
- `stop` ends the whole run, also from a called workflow; the status bar shows "Workflow ‹Name› stopped at line N: text".

### Maintenance commands

| Command | Meaning | Arguments | Example |
| --- | --- | --- | --- |
| `delete` | delete: move a file or folder to the trash | path | `delete "Drafts/Old.md"` |
| `add-tag` | add a tag to the list `tags` in the front matter | path, tag | `add-tag "{{file}}" "done"` |
| `remove-tag` | remove a tag from the list `tags` in the front matter | path, tag | `remove-tag "{{file}}" "draft"` |
| `complete-task` | tick off the first open task containing the search text | path, search text | `complete-task "Projects/Plan.md" "Send offer"` |
| `confirm` | ask a question with "Yes" and "No" | question | `confirm "Archive all drafts?"` |

- **`delete`** moves the target to the trash, like deleting in the area panel; a folder goes as a whole. Together with a file go its companion file (`.mdd`) including the run state and its change records (`.mddl`). The root of the area cannot be deleted. A deleted target is restored from the trash.
- **One confirmation per run:** if a run contains `delete`, **one** confirmation before the first step names all targets of the run with their path, including those of the called workflows; "No" lets no step run, and the run counts as cancelled input. If a target is open in this window, it is closed before the step; with unsaved changes the usual save prompt appears, and "Cancel" ends the run at this line.
- **`add-tag` and `remove-tag`** change only the list `tags` in the front matter; a tag that is already there or missing is not an error. A leading `#` is dropped, and case does not count in the comparison; an empty tag or one containing spaces is invalid. If `remove-tag` removes the last tag, the empty list `tags: []` remains. Tags in the text (`#tag`) stay untouched; `replace` is there for those.
- **`complete-task`** looks among the open tasks of the file, the same ones the [task query](tasks.md) shows, for the first one whose text contains the search text, case-sensitively. It ticks it off like a click in the task query, including the completion date according to the task settings. If it finds none, the step fails.
- **`confirm`** shows the question with "Yes" and "No". "Yes" continues the run; "No" ends it without a failure, and the status bar shows "Workflow ‹Name› stopped at line N: «question» answered with No".
- **Open files:** on a file that is open and unsaved in a window, `add-tag`, `remove-tag` and `complete-task` act through that window, like the content commands.
- `delete` and `confirm` need someone watching: in a workflow with `trigger: schedule` they are the finding "Manual only".

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
| `{{clipboard}}` | text of the clipboard at the start; for a run on schedule, whatever is in the clipboard at that moment |
| `{{prompt:Question}}`, `{{prompt:Question:Default}}` | input dialog |
| `{{select:Question:a,b,c}}` | choice dialog |

- **All dialogs before the first step:** the input and choice dialogs of the whole run appear one after the other before anything happens, including those of the templates used and of the called workflows. The same question is asked once and applies everywhere. Cancelling a dialog cancels the run, and no step runs.
- **One point in time per run:** `{{date}}` and `{{time}}` have the same value in all lines, also across midnight. Likewise the clipboard is read once at the start, and `{{clipboard}}` has the same content in all lines.
- **In a template used by a workflow**, `{{title}}` and `{{folder}}` mean the new file as usual, while `{{file}}` and `{{area}}` mean the active document and the area.
- **On schedule** nobody is there to answer a dialog: input and choice placeholders are the finding "Manual only" in a workflow with `trigger: schedule`.
- `{{cursor}}` is not allowed in a command line. `\{{` writes a literal `{{`.
- If `{{folder}}` is empty in the root folder, `"{{folder}}/New.md"` becomes the path `New.md`. Without an active document, `{{file}}` is empty, and a path made from it is a finding.

## Starting a workflow

A workflow starts only in an open area, and its paths apply in that area, even if the file comes from the app-wide workflows folder or from a linked area. The ways by hand:

| Way | Effect |
| --- | --- |
| **File → Workflows** | every workflow of the workflows folder as an entry, subfolders as submenus |
| **Command palette** (default `Ctrl+K`) | every workflow of the workflows folder as a command under its name |
| **Status bar and context menu** | the command of a workflow, placed through [command placement](command-placement.md) |
| **Keyboard shortcut** | assigned to the command of a workflow under "Settings → Keyboard shortcuts" |
| **"Run" button above the block** | in the live view, the rendered view and the split view, on the right of the block's header line; runs any workflow file, also outside the workflows folder, with the state in the editor |
| **"Run" in the area panel** | at the top of the context menu of every workflow file of the area |
| **"Workflow runs" page** | "Run" button in the row of every workflow |

The button above the block is disabled while the check reports a finding. For a document that has never been saved it shows "Save first", outside an area "Can only run inside an open area". An armed workflow additionally runs by itself on its schedule; the start by hand remains possible at any time alongside.

The command of a workflow gets its ID from the path of the file in the workflows folder; two workflows of the same name in different subfolders thus stay distinguishable. **Renaming a workflow in the application or moving it within the workflows folder keeps its assignments:** a keyboard shortcut, a place in the status bar, context menu or format toolbar and a macro step that calls it move along. **Outside the application**, for example in the file manager, the application does not notice the renaming; the assignments then lose their target and have to be set again. A workflow moved out of the workflows folder is no longer a command; its assignments stay saved and work again as soon as it returns to the same place.

## Course of a run

1. The app checks the workflow together with the workflows it calls.
2. The dialogs of all placeholders appear one after the other; if the run contains `delete`, the one confirmation of the targets to delete follows.
3. The steps run strictly one after the other; each waits for the previous one.
4. The first failure ends the run. The status bar shows "Workflow ‹Name› aborted at line N: reason".

Steps carried out stay carried out; there is no undo of a run (section "What a run has done"). **At most one workflow runs per window**; a second start during a run is turned down with a notice.

**Messages:** for a start by hand, `notify` shows its text in the status bar. For a run on schedule, also a caught-up one, the text additionally goes out as a **notification of the operating system**, with the name of the workflow as its title; so does the abort of such a run with line and reason, even if the workflow contains no `notify`. The notification appears only when no window of the app is in the foreground, and once per message; otherwise the notice in the status bar suffices. Whether and how the operating system shows it is governed by its own notification settings.

## Schedule and arming

A workflow with `trigger: schedule` and a `schedule` line runs by itself at the times of its schedule once it is **armed**:

```yaml
---
workflow: true
name: Daily note
trigger: schedule
schedule: every weekday at 08:00
missed: skip
---
```

### The schedule line

The schedule is one line of English words, following the pattern of [recurring tasks](tasks.md):

| Form | Meaning | Example |
| --- | --- | --- |
| `every N minutes` | every N minutes | `every 30 minutes` |
| `every N hours` | every N hours | `every 2 hours` |
| `every day at HH:MM`, `every N days at HH:MM` | daily or every N days at the time | `every day at 08:00` |
| `every weekday at HH:MM` | Monday to Friday at the time | `every weekday at 07:30` |
| `every <weekdays> at HH:MM` | on the weekdays named | `every monday, thursday at 18:00` |
| `every N weeks on <weekdays> at HH:MM` | every Nth week on the weekdays | `every 2 weeks on monday at 08:00` |
| `every N months on the <day> at HH:MM` | every Nth month on the day named | `every month on the 1st at 09:00` |
| `every month on the last at HH:MM` | on the last day of the month | `every month on the last at 17:00` |

- **Time:** `at HH:MM` is required for days, weekdays, weeks and months and not allowed for minutes and hours; the time has exactly the form `08:00`.
- **Spelling:** without a number, `1` applies (`every day`, `every week`, `every month`); singular and plural count the same. Weekdays are English (`monday` to `sunday`), separated by a comma or `and`. The day of the month is written `1st`, `2nd`, `3rd`, `15th` or as a bare number. Case does not count.
- **Counting:** an interval such as `every 30 minutes` or `every 2 weeks` counts from the end of the last run, before the first run from arming, not on a fixed grid of the clock.
- A file carries exactly one `schedule` line. An error in it is a finding with its line in the front matter, such as "Schedule … cannot be read" or "'at' is missing".

### Interpretation

- **Local time:** the time is the time of the computer, as with reminders and alarms. `08:00` stays `08:00` across the change to and from daylight saving time; if a time does not exist when the clock goes forward, such as `02:30`, the workflow runs at the next existing minute.
- **Week:** the week begins on Monday.
- **End of month:** `last` is the last day of the month. A day a month does not have, such as `31st` in April, is skipped in that month; whoever means the end of the month writes `last`.

### When a workflow runs on schedule

**A workflow on schedule runs while the app and its area are open.** There is no background service, and the app does not start itself. It checks every 30 seconds whether a workflow is due; a run therefore begins up to half a minute after its time.

- A due workflow runs in exactly one window of its area, even if the area is open in several windows. If another workflow is running, the due one waits until a window of the area is free.
- After every run, the app calculates the next time; the **Workflow runs** page shows it in the column **Next run**.
- A run on schedule runs without anyone watching and asks no questions. Input and choice placeholders, `confirm` and `delete` are therefore the finding **"Manual only"** in a workflow with `trigger: schedule`: it cannot be armed, but can still be started by hand, and the dialogs then appear as usual. If only a template used or a called workflow asks for input, the run on schedule aborts before the first step with this finding.

### Missed runs

A time is missed if it fell while the app or the area was closed or the computer was asleep. What happens then is set by the field `missed`:

- **`run-once`** (default): the workflow catches up **once** when the area is opened, even if several times were missed. The status bar reports "Workflow ‹Name› caught up", and the **Workflow runs** page shows "(caught up)" after the last run.
- **`skip`**: the missed time lapses, and the workflow waits for the next one. The page shows "skipped:" with the lapsed time.

### Arming

A workflow with `trigger: schedule` is **not armed** after being created, copied or received; it runs on schedule only once the user arms it. The armed state lies in the run state of the companion file and does not travel along when the file is copied. Arming is done in three places, all of which appear only with `trigger: schedule`:

- **"Workflow runs" page**: the checkbox in the column **Armed**,
- **above the block**: the button "Armed" next to "Run", pressed "✓ Armed",
- **area panel**: in the context menu of the workflow file, "Arm" or "Disarm".

Arming checks the workflow as before running. If there is a finding, arming is turned down, and the status bar shows "Not armed:" with reason and line; otherwise it reports "Workflow ‹Name› armed, next run" with the time. Disarming is possible at any time, even with a finding.

**Changed definition:** if, after arming, the `workflow` block or one of the lines `trigger`, `schedule` and `missed` changes, even unsaved in the editor, the workflow counts as "not armed: definition changed" and no longer runs on schedule until it is armed again. Changing name and description has no effect. This way, changed content that nobody has approved never runs without anyone watching.

### The status bar element "Workflows"

While at least one workflow of the area is armed, the element **Workflows** sits in the right part of the status bar. It shows the latest run on schedule with result sign, name and time, such as "✓ Daily note 08:00"; a run from an earlier day also carries day and month. The signs are `✓` for completed, `✗` for aborted, `■` for stopped and `–` for cancelled input; an abort appears in the colour of the error notice. Without a run on schedule so far, it reads "Workflows". The tooltip gives date, time and result, a click opens the **Workflow runs** page. In a narrow status bar the element collapses together with the other elements.

## Workflows folder and menu

As with templates, there is a **workflows folder**, set on two levels under "File → Settings…":

- **App-wide** in the section **Extensions (internal) → Workflows**.
- **Per area** in the section **Current area → Workflows** with the switch "Use area configuration" and the button "Browse…". The folder is saved relative to the area root in the area file and **replaces** the app-wide one completely.

The app-wide workflows folder travels with the setup file, as the data kind "Workflows folder" of the page [Exporting and importing settings](setup-exchange.md), and takes effect immediately after importing. The folder per area lies in the area file and travels with the area.

The submenu **File → Workflows** sits directly after the submenu **Area**. It shows the files of the folder that carry the marker, alphabetically by name on each level; subfolders appear as submenus, files without the marker are left out. After the own ones follow, each behind a separator, the workflows of linked areas with consent (section below). After a further separator follow:

- **Show workflow runs** — opens the **Workflow runs** page.
- **New Workflow…** — asks for the name, creates a file in the workflows folder with front matter, a description line and an empty `workflow` block with two comment lines, and opens it. Without a folder set, it first asks for the folder and keeps it, in the settings of the area when an area is open. It never overwrites an existing file. The entry is also in the command palette.
- **Set Workflows Folder…** — opens the settings at the section **Workflows**.

Without a folder set, the submenu shows "No workflows folder set", for an empty folder "No workflows in the workflows folder", for one that cannot be reached "Workflows folder not found". The submenu and the commands follow every change in the folder.

## Workflows of linked areas

Like the templates, the workflows of a [linked area](linking.md) can be offered alongside your own. For this, every link under **Settings → Current area → Area links** carries the checkbox **Workflows** next to "Templates"; it is off at first and independent of the one for templates.

- **Where they appear:** the workflows from the workflows folder that the linked area has set for itself appear in the submenu **File → Workflows** after your own, in the command palette and on the **Workflow runs** page, each as "Name (@prefix)" with the prefix of the link. New workflows of the source appear without a restart.
- **Where they act:** such a workflow runs in your **own** area. All paths apply in your own area root; from the linked area only the workflow file itself is read, including its sections for `from-section`. A call `workflow "Name"` looks in your own area.
- **By hand only:** a workflow of a linked area cannot be armed. The app writes no run state into the other area; the page shows "from area ‹prefix›" in its place, and the status bar reports a successful run with "Workflow ‹Name› from area ‹prefix› ran successfully".
- **Without access:** if the linked area, its area file or its workflows folder cannot be read, its workflows are left out without a message. With area links switched off, no workflows of other areas appear.

## Run state and the "Workflow runs" page

After every run, the app records in the **companion file** of the workflow (`.mdd`, section `workflow`) the point in time, the result, if applicable the aborted line, the number of runs, the origin of the run and the journal of the last run, for a workflow on schedule also the armed state and the next time; the text of the workflow file stays untouched. The run state travels along when the file is renamed or moved, not when it is copied.

The **Workflow runs** page opens through "View → Show workflow runs", through "File → Workflows → Show workflow runs", through the command palette and with a click on the status bar element **Workflows**. It lists **all workflows of the area**, also those outside the workflows folder, followed by the workflows of linked areas with consent, with these columns and a "Run" button per row:

| Column | Content |
| --- | --- |
| **Workflow**, **Location** | name with the description as a tooltip, folder of the file |
| **Armed** | checkbox for arming, only with `trigger: schedule`; with a changed definition also "not armed: definition changed" |
| **Next run** | time of the next run on schedule, while the workflow is armed |
| **Last run** | point in time of the last run, for a caught-up one with "(caught up)", below it if applicable "skipped:" with the time; plus the button "Journal (N)" |
| **Result** | result of the last run, table below |
| **Runs** | number of runs |

A workflow that has never run is listed as "never run".

| Result | Meaning |
| --- | --- |
| completed | all steps have run |
| aborted at line N: reason | a finding or a failure ended the run |
| stopped at line N | the command `stop` or a "No" for `confirm` ended the run |
| Input canceled, no step carried out | a dialog or the confirmation of the targets to delete was cancelled |

After a run in this window, the page shows the same reason as the status bar. The companion file keeps only the line and the kind of reason; after a restart and for a run from another window, single details such as a file name therefore appear as "…". The page updates after every run and every arming; the "Refresh" button reads it again.

### What a run has done

The button "Journal (N)" unfolds the **journal** of the last run below the row: every file and folder it has created, changed, moved, copied or deleted, as "Line N: command – path", the path relative to the area root. If the run touched nothing, it reads "No file touched"; with very many touched files the journal is truncated and says so.

There is no undo of a whole run. Undoing is done selectively, with the means that exist anyway: content changes through the [document history](history.md) of the file touched, deleted items from the trash, created, moved and copied items in the area panel.

## Support in the editor

- **Highlighting:** in the command lines, the keyword is bold, text in quotes coloured and placeholders italic, in the editor as in the reading view.
- **Check display:** the live view, the rendered view and the split view show the result of the check above the block: green "ready" or red "Line N: reason", with "(+N more)" for several findings. The notices about several blocks and about a trigger not yet supported appear there too, as do the findings of the schedule with their line in the front matter. The display follows the text shortly after every change and shows the same finding the start reports. In printing, in an export and for an embedded file the header line does not appear.
- **"Armed" button:** with `trigger: schedule`, the header line carries the button for arming next to "Run" (section "Schedule and arming").

Highlighting and display do not change the text of the file.

## Limits

- **Only in the area:** no command reads or writes outside the root of the area in which the workflow was started, not even through a placeholder; this also applies to a workflow from a linked area.
- **No network, no external programs.** Deleting happens only with `delete`, only for a start by hand, after a confirmation and into the trash.
- **No run without an open area:** a workflow on schedule runs only while the app and its area are open; it catches up on missed times according to the rules of `missed`.
- **No undo of a run:** steps carried out stay carried out; the journal shows what the last run has touched, and undoing is done selectively.
- **Macros** stay as they are and can be called as a step; a macro is a sequence of commands in the settings, a workflow a procedure as a document. **[Script blocks](scripts.md)** remain read-only; a workflow is not a general scripting language but a fixed catalogue of commands.

## Later stages

Further stages are planned, with scope and timing not yet fixed: a start on events in the area, conditions and repetitions, and commands for the [database](database.md). The check already knows the keywords of these commands and reports them as "only available in a later stage", so that such a file does not run in part.
