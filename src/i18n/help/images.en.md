# Images

Images load from local files whose path is given relative to the Markdown file, or from data embedded in the text. Images with a web address (`http(s)`) are deliberately not shown, because for security the application loads no content from the web; place such an image as a file next to the document instead. The manual bundles no demo images; the examples therefore show the syntax as code blocks with the result described — in your own files they render directly.

## Image syntax

The alt text in the square brackets describes the image (important for accessibility; a missing alt text is flagged by the [Markdown linter](tools.md)).

```markdown
![Architecture diagram](images/architecture.png)
```

Relative paths resolve against the folder of the Markdown file. For security, only images within a fixed boundary resolve: the root of the area while one is open, otherwise the folder of the Markdown file. No `../` leads beyond it. Supported formats: PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

## Image sizes

A size suffix after the URL sets width and/or height in pixels:

```markdown
![Alt](image.png =300x200)   width 300, height 200
![Alt](image.png =300x)      width only, height proportional
![Alt](image.png =x200)      height only, width proportional
```

Invalid suffixes stay raw text and are not interpreted.

## Implicit figures

An image standing **alone in a paragraph** becomes a figure with the alt text as a centred caption. Images in running text stay unchanged.

```markdown
Paragraph before.

![Quarterly figures compared](chart.png)

Paragraph after.
```

Result: the image appears with the caption "Quarterly figures compared" centred below it.

## Embedding images via wiki embed

Alternatively `![[image.png]]` embeds an image through the wiki syntax, including the size modifier `![[image.png|300]]` — details on the [Linking](linking.md) page.

## Enlarging an image

A click on an image in the “Rendered” view — likewise in its half of the “Split” view — shows it enlarged over the whole window. The background is dimmed, and the image appears as large as the window and its own resolution allow: complete, undistorted and never beyond its own size. A small image therefore stays at its own size in the middle. A size hint in the document (`=300x`) does not limit the enlargement. This applies to every displayed image, including those in tables, callouts and embeds, and also to an image that is itself a link.

Below the image is its caption — the alt text or, where it is missing, the file name — and below that two buttons:

- **Open in default program** opens the image file in the program the operating system assigns to it, within the same limits as any [attachment](attachments.md). The enlarged view stays open. An image that is written into the text as data and has no file of its own does not show this button.
- **Close** closes the enlarged view.

There are three ways to close it, all with the same effect: the “Close” button, the `Escape` key or a click on the dimmed area beside the image. With the keyboard, `Tab` moves between the two buttons without leaving the enlarged view.

An image the view does not display — for example because its file is missing — opens no enlarged view. In the “Live” view a click opens no enlarged view; there a double click opens the image in the default program.
