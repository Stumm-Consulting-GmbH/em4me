# Presentation

A **presentation** is an ordinary Markdown document whose content is divided into **slides**. The application shows it slide by slide in the **Slides** view, shows it full screen as a slide show and exports the slides as a PDF or as HTML pages.

The presentation is **another view of the same document** and not a file format of its own. Writing happens in the Markdown views; the **Slides** view only shows and never changes anything in the text.

## How a presentation is recognised

By the **flag** `presentation: true` in the front matter of the document:

```markdown
---
presentation: true
---

# Title of the first slide
```

The value must be `true`; `presentation: false`, a text such as `"true"` or a missing key do not make a presentation document. `marp: true` is recognised as well, so that presentations from another slide tool open here without any change (see “Working together with other tools” further below). The application never writes this key itself.

A document without the flag stays an ordinary document: `---` is a horizontal rule there, as everywhere.

## Creating a presentation

**View → Presentation → New Presentation** creates a new, still unnamed document and opens it straight away in the **Slides** view. It carries the flag, the theme `light` and the page number, plus three sample slides: a title slide, a slide with a list and a speaker note, and a slide that shows how to write image and text side by side. It is saved like any new document, on the first save. The command is also in the command palette (default `Ctrl+K`).

To turn an existing document into a presentation, add the flag to its front matter yourself.

## Separating slides

A line of three hyphens `---` separates two slides, exactly where it is a horizontal rule according to CommonMark. It is safest with a blank line before and after it:

```markdown
# First slide

Text of the first slide.

---

# Second slide
```

**What does not separate:**

- `---` directly below a line of text: that is a heading underline (Setext), not a rule.
- `---` in a code block, in a quote, indented in a list item or with four spaces in front.
- `---` in a comment.
- The two lines that enclose the front matter.
- `***` and `___`: they stay rules **on** the slide, so that a slide can carry a dividing line of its own.

The separator line belongs to no slide. Two separator lines in a row produce an empty slide, as does a separator line directly after the front matter or at the end of the document; a document without a separator line is a single slide.

## The front matter: control keys

Besides the flag, the front matter takes five control keys; all of them are optional:

| Key | Effect | Default |
| --- | ------ | ------- |
| `theme` | design of the slides: `light`, `dark` or `accent`, optionally with values of your own (see below) | `light` |
| `paginate` | `true` shows the page number at the bottom right of every slide | `false` |
| `header` | text of the header line on every slide | none |
| `footer` | text of the footer line on every slide | none |
| `size` | format of the slides: `16:9` or `4:3` | `16:9` |

A complete front matter:

```markdown
---
presentation: true
theme: dark
paginate: true
header: Quarterly report
footer: "**Sales department** · internal"
size: 4:3
---
```

Other keys in the front matter, such as `title` or `tags`, stay untouched and work as in any other document. If a value is invalid, the default applies. For an unknown or invalid theme and for an unknown format, a **notice line** above the slide names the reason.

## Design

### The three themes

| Theme | Appearance |
| ----- | ---------- |
| `light` | dark text on white, accent in blue |
| `dark` | light text on near black, accent in light blue |
| `accent` | white text on strong blue, accent in yellow |

The slides look the same under every colour scheme of the application: the theme belongs to the presentation, not to the interface.

### Overriding single values

Instead of a name, `theme` takes a block. The entry `name` chooses the theme to build on (without `name` it is `light`); the other entries override single values:

```yaml
theme:
  name: dark
  accent: "#ff6b6b"
  font: Georgia, serif
```

| Entry | Effect |
| ----- | ------ |
| `background` | background of the slide |
| `text` | colour of the body text |
| `heading` | colour of the headings |
| `accent` | colour of links and quote bars |
| `font` | font of the slide |
| `header-footer` | colour of header and footer |
| `page-number` | colour of the page number |

Colours, gradients and font lists in CSS notation are allowed. A value that would load a file or an address is not taken over. An unknown entry is ignored, an invalid value is replaced by the value of the theme; the notice line names both. Code blocks and highlights follow the brightness of the base theme; if you change the background considerably, choose a light or dark base theme to match.

### Background image and split layout

An image becomes the background of the slide when the first word of its alternative text is `bg`:

```markdown
![bg](images/landscape.jpg)
![bg contain](images/chart.png)
![bg left:40%](images/portrait.jpg)
```

| Notation | Effect |
| -------- | ------ |
| `bg` or `bg cover` | fills the slide; whatever sticks out is cropped |
| `bg contain` or `bg fit` | shows the whole image; free areas show the background of the slide |
| `bg auto` | shows the image at its own size |
| `bg 50%` | shows the image at the given size |
| `bg left`, `bg right` | **split layout**: the image fills the left or right half, the text moves to the other side |
| `bg left:40%`, `bg right:33%` | split layout with a width of your own for the image side |

Several background images of one slide stand side by side, with `vertical` on the first image one above the other; in a split layout they share the image side. Header, footer and page number then stand on the text side. An image that cannot be loaded, for instance because its file is missing, is left out; the slide appears without it. Background images are loaded the same way as any other image in the document and follow the same rules.

### Overfull slides

Every slide has a fixed format, 16:9 or 4:3, and is fitted evenly into the available area; the text grows and shrinks with it. Whatever does not fit on the slide is cut off at the edge, and a **hatched bar** at the bottom edge marks the overfull slide. The bar does not appear in the slide show or in the exports. The remedy is one more slide.

## Page number, header and footer

`paginate: true` shows the number of each slide at its bottom right. `header` and `footer` put a line at the top or bottom of every slide; simple markup such as bold, italic or a link appears formatted. An empty value shows no line, a text that is too long ends with an ellipsis. The settings apply equally to all slides.

## Speaker notes

Comments on a slide are its **speaker notes**. Both forms count:

```markdown
# Results

- Revenue up
- Costs down

%% Mention last year's figures here. %%

<!-- Refer to the appendix for questions. -->
```

Notes live in the source text only: not on the slide, not in the slide show, not in the PDF and not in the HTML pages. In the editor they stay visible. If the “Comments” extension is switched off, `%%` is ordinary text and appears on the slide; HTML comments stay notes even then. More about private comments with `%%` is on the page [Inline constructs](inline.md).

## The “Slides” view

The presentation is the eighth view mode, next to Rendered, Split, Source, Live, Mind map, Canvas and Board: **View → Slides**, the **Slides** button in the status bar or default `Ctrl+8`. As with the other modes, the choice applies per open document, and it is restored on the next start.

**The mode depends on the document.** It can be chosen only for a document with the flag. Otherwise button and menu entry stay visible and dimmed, and the title of the button names the reason: “This document is not a presentation”. A document that is shown in the **Slides** view, or was open in it on exit, and no longer carries the flag appears in the reading view.

The view shows one slide, above it the counter, for instance “3 / 12”, and the buttons **Previous**, **Next** and **Start slide show**. On switching into the view, the slide that holds the cursor is shown. What is shown is always the current state of the document, including unsaved changes.

**Paging** works with the buttons, with the **mouse wheel** over the slide (down for next, up for previous, one slide per wheel movement) and with the keyboard as soon as the slide area has the focus:

| Key | Effect |
| --- | ------ |
| `Arrow right`, `Page Down`, `Space` | next slide |
| `Arrow left`, `Page Up`, `Shift+Space` | previous slide |
| `Home`, `End` | first or last slide |

At the first and at the last slide, paging stops.

## Slide show

The slide show shows the presentation **full screen**: the window goes full screen, all bars of the application disappear, and only the slide is to be seen, as large as the screen holds it. It is started in the **Slides** view:

- via **View → Presentation → Start slide show**,
- with default `F5`,
- with the **Start slide show** button above the slide.

The command palette offers the command as well. The slide show starts at the slide the view is currently showing. Paging uses the same keys as in the view; in addition, a **mouse click** moves on by one slide, and the **mouse wheel** moves one slide per wheel movement, down for next and up for previous.

It is **ended** with `Esc`. It also ends when full screen is left in another way, when another window comes to the front or when the document or the view changes. Afterwards the view stands on the slide shown last. The window leaves full screen again, unless it was already in full screen before the slide show.

## Exporting the slides

Both exports are under **File → More File Functions → Export** and in the command palette. They can be chosen for every presentation document, whichever view it is currently shown in; for a document without the flag they stay dimmed. Every slide appears in them as the view shows it, with theme, background images, page number, header and footer, diagrams and formulas, but without speaker notes and without the bar of overfull slides. If the dialog is cancelled, nothing is created. After the export, the status bar reports the number of slides and, if something was left out, what.

### As PDF

**Export Slides as PDF…** asks for the target, suggesting the name of the document with the extension `.pdf` in the same folder, and writes a PDF file with **one slide per page**. The page has the format of the slide, 16:9 or 4:3, and no margin. The settings for paper format and margins of the ordinary PDF export have no effect here.

### As HTML pages

**Export Slides as HTML…** asks for a folder and creates **one HTML page per slide** in it: `folie-001.html`, `folie-002.html` and so on, plus `index.html` as the start page with the first slide. If the chosen folder is empty or contains an earlier export, the pages are created in it; otherwise a subfolder with the name of the document and the suffix `-slides` is created, and the files already present stay untouched.

Any browser opens the pages, without the application and without a network connection. Every page is complete on its own: images, diagrams and formulas are embedded in it, so the folder can be moved or passed on as a whole. Below the slide stand **Previous**, the counter and **Next**, in the language the interface had at the time of the export; paging also works with the same keys as in the slide show, and the slide adapts to the size of the browser window. Links and images follow the rules of the HTML export of a document (see [Tools](tools.md)): a link to another document stays as text, and an image that cannot be embedded stands as its text; such a background image is left out.

## The “Presentation view” extension

The feature belongs to the [internal extensions](extensions.md) (“Presentation view”, group “Rendering”) and to the **Advanced** working mode: in **Beginner** mode it is off, in **Advanced** and **Full** it is on.

When it is switched off, the **Slides** view, the **Presentation** submenu in the **View** menu, the two export commands and their entries in the command palette and the key bindings go away. The flag then has no effect: a presentation document is an ordinary Markdown document, and `---` is a horizontal rule in it. A document that was open in the **Slides** view appears in the reading view. Nothing is lost, and switching off and on never writes anything; after switching back on, the presentation is there unchanged.

## Working together with other tools

Flag, control keys, separator lines and the image notation with `bg` follow a widespread tool that creates slides from Markdown and marks its files with `marp: true`. The compatibility is an explicit commitment: a presentation written there opens here as a presentation, without anything in the file having to be changed.

**What applies here as there:** the flag `marp: true`, the separation at `---`, the keys `paginate`, `header`, `footer` and `size`, the image notation `![bg …](…)` including the split layout, and HTML comments as speaker notes. Comments with control directives of the other tool do not count as notes here or there.

**Where the application differs:**

- **`***` and `___` do not separate slides here.** The other tool starts a new slide at them as well. Anyone who wants a file divided the same way in both tools separates with `---` only and does not write rules on a slide as `***` or `___`.
- **The other tool does not know `%%` notes** and shows them as text on the slide. Anyone who needs notes in both tools writes them as an HTML comment `<!-- … -->`; these work in both directions.
- **Control directives per slide have no effect here.** Comments such as `<!-- _paginate: false -->` or `<!-- _class: lead -->`, with which the other tool styles single slides differently, stay in the document but are not carried out; the settings of the front matter apply to all slides. Nor does the front matter key `headingDivider` take effect, with which the other tool starts a new slide at headings: a file that uses it results in fewer slides here. Both come with a later stage of expansion.

**What else to keep in mind:**

- The application never writes `marp: true` itself. Anyone who wants to show the file in the other tool as well adds it next to `presentation: true`.
- The theme names differ. A theme name of the other tool is unknown here; the slides then appear in the theme `light`, and the notice line names the name. The block under `theme:` with values of your own is a notation of this application.
- The word `bg` must be the **first** word of the alternative text here. Further words, such as image filters, are not interpreted.

## Limits

- **Notes appear only in the source text.** There is no presenter view with notes, next slide and clock, and no notes in the PDF or in the HTML pages either.
- **A slide overview** as a grid of all slides does not exist; you page between the slides.
- **Themes of your own** come about only through the block under `theme:` in the front matter; there is no theme editor in the settings.
- **The exports are PDF and HTML pages.** No file in the pptx format is created.
- **Design applies to the whole set of slides.** A theme, a background or a header of its own for a single slide cannot be given, and a heading does not start a new slide by itself.
- **Editing happens in the Markdown views**, not on the slide.

Presenter view, slide overview, theme editor, settings per slide, splitting at headings and the export as a pptx file are planned for later stages of expansion.
