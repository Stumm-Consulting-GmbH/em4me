# Presentation

A **presentation** is an ordinary Markdown document whose content is divided into **slides**. The application shows it slide by slide in the **Slides** view, shows it as a slide show full screen or in a separate window, gives the speaker a **presenter view** with notes and time, and exports the slides as a PDF or as HTML pages.

The presentation is **another view of the same document** and not a file format of its own. Writing happens in the Markdown views; the **Slides** view only shows and never changes anything in the text. The one exception is the **Design of this presentation…** dialog, which writes the design into the front matter of the file on request.

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

### Separating at headings

With the key `headingDivider` in the front matter, a new slide additionally starts **before every heading** up to the given level. The value is a number from 1 to 6:

```markdown
---
presentation: true
headingDivider: 2
---

# First part

## A sub-point

## Another sub-point
```

Here every heading of levels 1 and 2 gets a slide of its own, that is three slides without a single separator line. The heading stands at the top of its new slide. If nothing but blank lines and comments stands before it on the slide, no further slide starts; separator lines and headings can therefore be mixed without empty slides coming about. Headings in code blocks, quotes and lists do not separate.

The setting applies to the whole set of slides, even when it stands in a comment further down (see “Settings per slide”); if there are several, the last one applies. An invalid value is ignored, and the notice line names it. The list notation, such as `[1, 3]`, has no effect.

## The front matter: control keys

Besides the flag, the front matter takes six control keys; all of them are optional:

| Key | Effect | Default |
| --- | ------ | ------- |
| `theme` | design of the slides: `light`, `dark`, `accent` or the name of a custom theme, optionally with values of your own (see below) | `light` |
| `paginate` | `true` shows the page number at the bottom right of every slide | `false` |
| `header` | text of the header line on every slide | none |
| `footer` | text of the footer line on every slide | none |
| `size` | format of the slides: `16:9` or `4:3` | `16:9` |
| `headingDivider` | number from 1 to 6: every heading up to this level starts a new slide (see above) | none |

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

Other keys in the front matter, such as `title` or `tags`, stay untouched and work as in any other document. If a value is invalid, the default applies. For an unknown or invalid theme, for an unknown format and for an invalid value of `headingDivider`, a **notice line** above the slide names the reason. Theme, colours, header, footer and page number can be set differently for single slides (see “Settings per slide”).

## Design

### The three themes

| Theme | Appearance |
| ----- | ---------- |
| `light` | dark text on white, accent in blue |
| `dark` | light text on near black, accent in light blue |
| `accent` | white text on strong blue, accent in yellow |

The slides look the same under every colour scheme of the application: the theme belongs to the presentation, not to the interface. If you need a design more often, create it as a **custom theme** and choose it by its name (see “Custom themes”).

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

Every slide has a fixed format, 16:9 or 4:3, and is fitted evenly into the available area; the text grows and shrinks with it. If the content of a slide does not fit, it is **reduced automatically** until it fits, down to half its size at most. Header, footer and page number keep their size, and the margin of the slide stays the same. The reduction works the same everywhere: in the view, in the slide show and the presenter view, in the slide overview and in both exports.

Only what does not fit even at half size is cut off at the edge, and a **hatched bar** at the bottom edge marks the overfull slide. The bar does not appear in the slide show or in the exports. The remedy is one more slide.

## Custom themes

A **custom theme** is a named design that builds on one of the three supplied themes and sets some of the seven values differently. It applies in every presentation that names it in the front matter:

```yaml
theme: Company
```

The name is found regardless of upper and lower case; `theme: company` therefore chooses the theme “Company” as well. A custom theme can be built on with a block whose entry `name` names it, like any other theme. If the named theme does not exist, for instance on another computer, the slides appear in the theme `light`, and the notice line names the name.

Custom themes belong to the settings of the application, not to the file. They apply in all windows, and they travel with the file of your own setup (see [Exporting and importing settings](setup-exchange.md)).

### The “Slide themes” section of the settings

Under **File → Settings… → Slide themes** in the block “Extensions (internal)”, the custom themes are managed:

- **New** creates a theme that builds on the design `light`, `dark` or `accent` chosen under **Template**; at first it is called “New theme”.
- **Duplicate** creates a copy of the chosen theme, **Delete** removes it.
- The **Name** field renames the theme. A name must not be empty, must not belong to a supplied theme and must not be taken already, not even in different upper and lower case; a violation is named at once, and Apply and OK stay blocked until it is fixed.

Below them stand the seven values from the table “Overriding single values”, one row each: the colours have a colour picker and a text field that accepts any CSS notation, the font has a text field with suggestions. **Reset** returns a row to the value of the underlying theme. An invalid value is marked and not taken over. A **preview slide** shows the design with every input. Saving is done with **Apply** or **OK**; the change takes effect at once in all open presentations.

### Design of this presentation

**View → Presentation → Design of this presentation…** sets the design of a single file without writing the front matter by hand. The command can be chosen for every presentation that can be changed, whichever view it is shown in, and it is in the command palette.

At the top, the dialog names the theme, chosen from the supplied and the custom themes; an unknown name from the front matter stays selectable as “Name (unknown)”. Below, it shows for each value whether it applies **as theme**, with the value of the theme in brackets, or as **own value**. An input sets the row to “own value”, **Reset** back to “as theme”.

**OK** writes the choice into the front matter of the file: without own values as `theme:` with the name, otherwise as a block with `name:` and the own values. The step can be undone as a whole. The other entries of the front matter stay unchanged, and if you have changed nothing, nothing changes in the file. If the document changed while the dialog was open, nothing is written, and the status bar says so.

Two further buttons lead beyond the single file:

- **Save as theme…** asks for a name, creates a custom theme from the chosen theme and the own values, and writes only `theme:` with this name into the file. If the name is cancelled, everything stays as it was.
- **Copy theme values into the file** can be chosen with a custom theme. It writes all seven values as a block into the front matter, built on the supplied theme below it. The file then looks the same even where the custom theme does not exist, for instance after passing it on to others.

## Page number, header and footer

`paginate: true` shows the number of each slide at its bottom right. `header` and `footer` put a line at the top or bottom of every slide; simple markup such as bold, italic or a link appears formatted. An empty value shows no line, a text that is too long ends with an ellipsis. In the front matter, the settings apply equally to all slides; for single slides they can be set differently (see “Settings per slide”).

## Settings per slide

Single slides can be designed differently from the rest. For this, an HTML comment with one or more keys stands on the slide:

```markdown
# Interim status

<!-- _backgroundColor: "#fff3bf" -->
<!-- _paginate: false -->
```

**The scope depends on the underscore:**

- With `_` in front of the key, the setting applies **to this slide only**.
- Without `_`, it applies **from this slide on** to all following ones, until a new setting of the same key comes.
- Only `headingDivider` always applies to the whole set of slides (see “Separating at headings”).

**These keys are interpreted:**

| Key | Effect |
| --- | ------ |
| `theme` | changes the theme, with the name of a supplied or custom theme |
| `backgroundColor`, `backgroundImage` | background of the slide, such as a colour or a gradient |
| `color` | colour of the body text |
| `header`, `footer` | text of the header and the footer line; an empty text hides the line |
| `paginate` | `true` shows the page number, `false` hides it and keeps counting, `hold` shows it without counting on, `skip` hides it without counting on |
| `background`, `text`, `heading`, `accent`, `font`, `header-footer`, `page-number` | the seven values from the table “Overriding single values” |

A change of theme replaces the theme together with the own values from the block in the front matter; colours and font set by comment keep applying across the change. Values that would load a file or an address are not taken over, as in the front matter; a background image is set with the `bg` notation (see “Background image and split layout”). If a value is invalid or a theme unknown, the previous value keeps applying, and the notice line names the reason on this slide.

Such comments are not speaker notes. Further keys of the same notation, such as `class` or `style`, stay in the document but have no effect here (see “Working together with other tools”).

## Speaker notes

Comments on a slide are its **speaker notes**. Both forms count:

```markdown
# Results

- Revenue up
- Costs down

%% Mention last year's figures here. %%

<!-- Refer to the appendix for questions. -->
```

Notes do not appear on the slide or in the slide show. The **presenter view** shows them to the speaker, formatted like text on a slide, that is with bold, italic, lists and links; HTML in a note appears there as text. In the PDF and the HTML pages they appear only when switched on (see “Including speaker notes”). In the editor they stay visible. If the “Comments” extension is switched off, `%%` is ordinary text and appears on the slide; HTML comments stay notes even then. More about private comments with `%%` is on the page [Inline constructs](inline.md).

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

## Slide overview

**View → Presentation → Slide overview** shows all slides as a **grid** in the **Slides** view, each as a small picture with its number. At first, the slide the view is currently showing is selected.

| Input | Effect |
| ----- | ------ |
| `Arrow left`, `Arrow right` | one slide back or on |
| `Arrow up`, `Arrow down` | one row of the grid up or down |
| `Home`, `End` | first or last slide |
| Click, `Enter`, `Space` | go to the selected slide and close the overview |
| `Esc` | close the overview without changing the slide |

The mouse wheel scrolls the grid. Calling the command a second time also closes the overview, as does starting a slide show. The overview shows the state at the time of opening; opening it again shows changes to the document. The command is also in the command palette.

## Slide show

The slide show shows the presentation **full screen**: the window goes full screen, all bars of the application disappear, and only the slide is to be seen, as large as the screen holds it. It is started in the **Slides** view:

- via **View → Presentation → Start slide show**,
- with default `F5`,
- with the **Start slide show** button above the slide.

The command palette offers the command as well. The slide show starts at the slide the view is currently showing. Paging uses the same keys as in the view; in addition, a **mouse click** moves on by one slide, and the **mouse wheel** moves one slide per wheel movement, down for next and up for previous. Lists whose items are to appear step by step are described under “Revealing lists item by item”.

It is **ended** with `Esc`. It also ends when full screen is left in another way, when another window comes to the front or when the document or the view changes. Afterwards the view stands on the slide shown last. The window leaves full screen again, unless it was already in full screen before the slide show.

This slide show always runs in the window of the application, even when a second display is connected. For presenting with a projector or a second display, there are the slide show in a separate window and the presenter view (see “Presenting with two displays”).

## Revealing lists item by item

The items of a list can be **revealed one by one** in the slide show. What counts is how the list is written:

```markdown
* appears with the first step
* appears with the second step

1) numbered lists as well
2) with a bracket instead of a full stop

- appears at once
1. appears at once as well
```

Items with `*` and numbered items with `)` are revealed, items with `-` or `+` and numbered items with `.` are there at once. Every item is a step, an indented one as well; an indented item stays hidden as long as its parent item is.

In the slide show, whether full screen or in a separate window, and in the presenter view, “next” reveals the next item, and only after the last one comes the next slide; “previous” hides the item revealed last. A slide entered backwards appears complete, a slide entered forwards with its items hidden. Hidden items keep their space, so the slide does not jump while revealing.

In the **Slides** view, in the slide overview, in the preview of the next slide and in both exports, all items appear at once.

## Presenting with two displays

For a talk with a projector or a second display, a **separate window** shows the audience only the slide, while the window of the application stays usable. Both commands can be chosen in the **Slides** view, in the **View → Presentation** submenu and in the command palette; they have no default shortcut, one can be assigned under Settings → Keyboard shortcuts.

**The display:** if two or more displays are connected, the window opens full screen on a display on which the window of the application does not stand. With a single display it opens as an ordinary window that can be moved and resized. The window has neither menu nor tabs, does not count among the windows of the application and does not come back after a restart.

### Slide show in a separate window

**View → Presentation → Slide show in separate window** opens the window for the audience and shows in it the slide the view is currently showing. Paging works in both windows with the same keys as in the view; in the audience window, mouse click and mouse wheel page as well. Both windows always show the same slide. Changes to the document appear at once for the audience as well.

It is **ended** with `Esc` in either of the two windows, with **View → Presentation → End slide show** or by closing the window for the audience. It also ends when the document no longer stands in the **Slides** view. Only one slide show runs at a time.

### Presenter view

**View → Presentation → Presenter view** starts the slide show in a separate window and turns the window of the application into the speaker's place. There you find:

- on the left the **current slide**, as the audience sees it;
- on the top right the **next slide**, on the last slide the word “End” instead;
- below it the **speaker notes** of the current slide, formatted and scrollable for long notes; without notes a short hint;
- below them the **elapsed time** since the start and the **clock time**, together with the buttons **Pause** or **Resume** and **Reset**.

Above both, the counter and the buttons **Previous** and **Next** stand as usual. The time starts with the start of the presenter view; **Reset** sets it to zero, a running time keeps running afterwards, a paused one stays paused.

Paging works as in the slide show in a separate window, in both windows with the same keys; lists with items to reveal are revealed step by step by “next”. If the document is changed during the talk, current slide, next slide and notes follow at once; if the slide shown is removed, the view stands on the last one remaining.

The presenter view is **ended** in the same ways as the slide show in a separate window. Afterwards the time is gone, and the **Slides** view stands on the slide shown last.

## Exporting the slides

Both exports are under **File → More File Functions → Export** and in the command palette. They can be chosen for every presentation document, whichever view it is currently shown in; for a document without the flag they stay dimmed. Every slide appears in them as the view shows it, with theme, settings per slide, background images, page number, header and footer, diagrams and formulas, but without the bar of overfull slides. Speaker notes come along only when switched on (see below). If the dialog is cancelled, nothing is created. After the export, the status bar reports the number of slides and, if something was left out, what.

### As PDF

**Export Slides as PDF…** asks for the target, suggesting the name of the document with the extension `.pdf` in the same folder, and writes a PDF file with **one slide per page**. The page has the format of the slide, 16:9 or 4:3, and no margin. The settings for paper format and margins of the ordinary PDF export have no effect here.

### As HTML pages

**Export Slides as HTML…** asks for a folder and creates **one HTML page per slide** in it: `folie-001.html`, `folie-002.html` and so on, plus `index.html` as the start page with the first slide. If the chosen folder is empty or contains an earlier export, the pages are created in it; otherwise a subfolder with the name of the document and the suffix `-slides` is created, and the files already present stay untouched.

Any browser opens the pages, without the application and without a network connection. Every page is complete on its own: images, diagrams and formulas are embedded in it, so the folder can be moved or passed on as a whole. Below the slide stand **Previous**, the counter and **Next**, in the language the interface had at the time of the export; paging also works with the same keys as in the slide show, and the slide adapts to the size of the browser window. Links and images follow the rules of the HTML export of a document (see [Tools](tools.md)): a link to another document stays as text, and an image that cannot be embedded stands as its text; such a background image is left out.

### Including speaker notes

Whether the notes go into the export is decided by the switch **Include speaker notes** under **File → Settings… → Export**, group **Slide deck**. It is off at first, so that passing a file on never includes notes unnoticed, and it applies to both exports.

- **In the PDF**, every slide with notes is followed by a **notes page** in the format of the slide, headed “Slide N – Notes”, below it the notes formatted on a white background. Longer notes continue on further pages of the same format.
- **In the HTML pages**, every slide with notes has a collapsed **Notes** area between the slide and the paging bar. Opened, it lies over the slide, up to half the height of the browser window at most, and can be scrolled.

Slides without notes get neither a notes page nor a notes area. With the switch on, the message after the export names the number of notes included; with it off, it reports that speaker notes are not included.

## The “Presentation view” extension

The feature belongs to the [internal extensions](extensions.md) (“Presentation view”, group “Rendering”) and to the **Advanced** working mode: in **Beginner** mode it is off, in **Advanced** and **Full** it is on.

When it is switched off, the **Slides** view, the **Presentation** submenu in the **View** menu with all its commands, the two export commands, their entries in the command palette and the key bindings, and the **Slide themes** section of the settings go away. The flag then has no effect: a presentation document is an ordinary Markdown document, and `---` is a horizontal rule in it. A document that was open in the **Slides** view appears in the reading view. Nothing is lost, and switching off and on never writes anything; after switching back on, the presentation and the custom themes are there unchanged.

## Working together with other tools

Flag, control keys, separator lines, the settings per slide and the image notation with `bg` follow a widespread tool that creates slides from Markdown and marks its files with `marp: true`. The compatibility is an explicit commitment: a presentation written there opens here as a presentation, without anything in the file having to be changed.

**What applies here as there:**

- the flag `marp: true` and the separation at `---`;
- the keys `paginate`, `header`, `footer` and `size` in the front matter and `headingDivider` with a number;
- the settings per slide in the same notation, with `_` for the own slide only and without `_` from this slide on, for `backgroundColor`, `backgroundImage`, `color`, `header`, `footer` and `paginate`;
- the image notation `![bg …](…)` including the split layout;
- lists with `*` and with `1)` whose items appear one by one in the slide show;
- HTML comments as speaker notes. Comments with settings per slide do not count as notes here or there.

**Where the application differs:**

- **`***` and `___` do not separate slides here.** The other tool starts a new slide at them as well. Anyone who wants a file divided the same way in both tools separates with `---` only and does not write rules on a slide as `***` or `___`.
- **The other tool does not know `%%` notes** and shows them as text on the slide. Anyone who needs notes in both tools writes them as an HTML comment `<!-- … -->`; these work in both directions.
- **The themes of the other tool do not exist here.** `default`, `gaia` and `uncover` are unknown here; the slides then appear in the theme `light`, and the notice line names the name. A **custom theme** may carry exactly such a name, though, and then takes effect: if you create a custom theme named `gaia`, you see the file here in that design without changing it.
- **`theme` in a comment applies here from its slide on.** The other tool always applies a theme to the whole set of slides. Anyone who wants to see a file the same in both tools chooses the theme in the front matter.
- **Some settings per slide have no effect:** `class`, `style`, `backgroundPosition`, `backgroundRepeat` and `backgroundSize`, as well as `lang` and `math`. They stay in the document and are not carried out, without a notice. A background image via `backgroundImage` with a file or an address is not loaded; for that there is the `bg` notation.
- **`headingDivider` as a list**, such as `[1, 3]`, has no effect; a file that uses it results in fewer slides here.
- **The comment `<!-- fit -->`**, with which the other tool brings a heading to the width of the slide, has no effect. Here, an overfull slide is reduced as a whole instead.

**What else to keep in mind:**

- The application never writes `marp: true` itself. Anyone who wants to show the file in the other tool as well adds it next to `presentation: true`.
- The block under `theme:` with values of your own and the seven values as a setting per slide, such as `<!-- accent: "#ff6b6b" -->`, are a notation of this application.
- The word `bg` must be the **first** word of the alternative text here. Further words, such as image filters, are not interpreted.

## Limits

- **The exports are PDF and HTML pages.** No file in the pptx format is created.
- **Design works through the themes and their seven values.** Style rules of your own in CSS, slide layouts beyond the split layout, and animations and transitions between slides do not exist.
- **Only list items are revealed**, no other parts of a slide.
- **Reduction goes down to half at most.** Whatever still does not fit is cut off.
- **Editing happens in the Markdown views**, not on the slide.

The export as a pptx file is planned for a later stage of expansion.
