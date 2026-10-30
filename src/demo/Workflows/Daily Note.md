---
workflow: true
name: Daily Note
description: Creates the note of the day in the folder Daily and tags it, on weekday mornings once it is armed.
trigger: schedule
schedule: every weekday at 08:00
missed: skip
---

# Daily Note

A workflow **on a schedule**: every weekday at 08:00 it creates the note of the day in the folder `Daily` from the section **Day** below and adds the tag `daily` to it. It runs on its own only while the app and this area are open, and only after you have **armed** it, as described in [[16 Workflows]]; until then it runs by hand like any other workflow. A missed morning lapses (`missed: skip`), so no note is created late for a day that has passed.

```workflow
create "Daily/{{date}}.md" from-section "Day"
add-tag "Daily/{{date}}.md" "daily"
notify "Daily note created"
```

## Day

### Plan

- First thing to do today

### Notes
