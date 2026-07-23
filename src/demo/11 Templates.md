---
title: Templates
tags: [demo, authoring]
chapter: 11
topic: authoring
---

# Templates

Templates are ordinary Markdown files with **placeholders** the app fills in when you apply them. Back to [[00 Welcome]].

## The example template

This demo area ships one template in the `Templates` folder: `Meeting Note`. To use it, point the app at the folder once under **Settings → Templates** (turn on "Use area configuration" and set the folder to `Templates`). Then run **File → New File from Template** and pick it.

## Placeholders

They are written in double curly braces and resolved on apply:

```markdown
# {{title}}

Date: {{date}}
Topic: {{prompt:Topic}}
Priority: {{select:Priority:High,Medium,Low}}

## Notes

{{cursor}}
```

- `{{date}}` / `{{time}}` — current date or time, with optional offset and format
- `{{title}}` / `{{folder}}` — of the new file
- `{{prompt:Question}}` — asks for input; `{{select:Q:a,b,c}}` offers a choice
- `{{clipboard}}` — the current clipboard text
- `{{cursor}}` — where the cursor lands after applying

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:
