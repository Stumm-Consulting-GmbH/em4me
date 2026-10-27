---
workflow: true
name: Side by Side
description: Shows the active document as source and preview side by side.
---

# Side by Side

Runs a command of the app: the document that is active when the workflow starts switches to the split view, source on one side and preview on the other. Any command of the command palette can be a step; the line names it by its fixed ID.

```workflow
command view.modeSplit
wait 1
notify "Source and preview side by side"
```
