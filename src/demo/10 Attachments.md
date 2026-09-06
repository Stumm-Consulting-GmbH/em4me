---
title: Attachments
tags: [demo, media]
chapter: 10
topic: media
---

# Attachments

Images and PDFs embed straight into the page. The binary files live in the `attachments` folder next to these notes. Back to [[00 Welcome]].

## Embed an image

`![[file]]` embeds a file; add a width after a pipe. The target is looked for in
three steps — the path relative to this note, the subpage spelling, and finally
the plain name anywhere in the area. Naming the folder, as done here with
`attachments`, is therefore the precise way, not the only one: `![[demo-image]]`
finds the same file.

```markdown
![[attachments/demo-image.png]]
![[attachments/demo-image.png|320]]
```

![[attachments/demo-image.png]]

## Standard image link

The classic Markdown form works too, with a relative path and alt text:

```markdown
![A sample diagram](attachments/demo-image.png)
```

## Add your own attachment

The references above point to files that already exist. You can also let the app
create them: copy an image to the clipboard and press `Ctrl+V`, or drag a file
from the file manager onto the editor or the rendered pane. The file is stored
and the matching reference appears right where you are writing.

Try it below this line:

Where the file lands is up to you (Settings → Attachments). By default each
document gets its own folder named after it. Clicking a reference opens the
attachment in the program your system assigns to it.

## Embed a PDF

```markdown
![[demo-document.pdf]]
```

![[demo-document.pdf]]

The PDF opens in an interactive viewer right inside the page. Details on paths and sizing live in the manual (Help → Images).

Reusable building blocks close the tour: [[11 Templates]].
