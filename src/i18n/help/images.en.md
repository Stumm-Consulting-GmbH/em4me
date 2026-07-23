# Images

Images load from paths relative to the Markdown file or from `http(s)` URLs. The manual bundles no demo images; the examples therefore show the syntax as code blocks with the result described — in your own files they render directly.

## Image syntax

The alt text in the square brackets describes the image (important for accessibility; a missing alt text is flagged by the [Markdown linter](tools.md)).

```markdown
![Architecture diagram](images/architecture.png)
```

Relative paths resolve against the folder of the Markdown file; for security, only images below that folder resolve (no `../` escape). Supported formats: PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

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
