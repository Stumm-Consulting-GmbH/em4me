---
title: Attachments
tags: [demo, media]
chapter: 10
topic: media
---

# Attachments

Images and PDFs embed straight into the page. The binary files live in the `attachments` folder next to these notes. Back to [[00 Welcome]].

## Embed an image

`![[file]]` embeds by name; add a width after a pipe.

```markdown
![[demo-image.png]]
![[demo-image.png|320]]
```

![[demo-image.png]]

## Standard image link

The classic Markdown form works too, with a relative path and alt text:

```markdown
![A sample diagram](attachments/demo-image.png)
```

## Embed a PDF

```markdown
![[demo-document.pdf]]
```

![[demo-document.pdf]]

The PDF opens in an interactive viewer right inside the page. Details on paths and sizing live in the manual (Help → Images).

Reusable building blocks close the tour: [[11 Templates]].
