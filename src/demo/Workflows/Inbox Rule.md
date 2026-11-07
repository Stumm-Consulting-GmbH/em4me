---
workflow: true
name: Inbox Rule
description: Tags every new note in the folder Inbox and marks it as new, once it is armed.
trigger: event
event: file-created in "Inbox" matching "*.md"
---

# Inbox Rule

A workflow **on an event**: whenever a new note arrives in the folder `Inbox` — created in the app, dropped in with the file manager or brought by a sync — it gives the note the tag `inbox` and, unless the note already has a status, sets `status: new`. It runs on its own only while the app and this area are open, and only after you have **armed** it, as described in [[16 Workflows]]; until then it runs by hand like any other workflow. What the workflow writes itself never starts it again.

```workflow
add-tag "{{file}}" "inbox"
if-property "{{file}}" status
  notify "New in the inbox: {{file}}"
else
  set-property "{{file}}" status "new"
  notify "New in the inbox, marked as new: {{file}}"
end
```
