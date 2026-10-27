---
workflow: true
name: Add Log Entry
description: Appends the section Entry of this file to the log at the end of stop 16.
---

# Add Log Entry

Appends the content of the section **Entry** below to the end of [[16 Workflows]], which closes with its log. A section is copied word for word, without its heading.

```workflow
append "16 Workflows.md" from-section "Entry"
notify "Log entry added to 16 Workflows"
```

## Entry

- A workflow added this line.
