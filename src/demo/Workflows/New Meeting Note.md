---
workflow: true
name: New Meeting Note
description: Asks for a title, creates a meeting note from the template Meeting Note and opens it.
---

# New Meeting Note

Creates a note in the folder `Meetings` from the template `Meeting Note` and opens it. The title is asked once and used in both lines; the questions of the template follow right after it, all before the first step.

The template lives in the folder `Templates`. Point the template folder at it first, as described in [[11 Templates]]; otherwise the check stops the run before the first step and names the template it cannot read.

```workflow
# A note from the template, named after today's date and the title
create "Meetings/{{date}} {{prompt:Meeting title}}.md" from-template "Meeting Note.md"
open "Meetings/{{date}} {{prompt:Meeting title}}.md"
notify "Meeting note created"
```

Run it twice with the same title on the same day, and the second run stops at the first line: a workflow never overwrites an existing file.
