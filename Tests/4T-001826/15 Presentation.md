---
title: Presentation
tags: [demo, visual]
chapter: 15
topic: visual
presentation: true
theme: light
paginate: true
footer: Demo-Area · Presentation
---

# A presentation

The last stop is a slide deck. This page is an ordinary Markdown file: the flag `presentation: true` in its front matter makes it a presentation.

Press `Ctrl+8` (View → Slides) to see it slide by slide, then `F5` for the slide show. `Esc` ends it.

%% Speaker note: welcome everybody and say what the deck is about. %%

---

# One rule, one new slide

A line of three hyphens with a blank line before it starts the next slide.

***

Three asterisks, like the line above, stay a rule **on** the slide.

<!-- Speaker note: HTML comments are notes as well, and they stay notes in other slide tools too. -->

---

![bg right:40%](attachments/demo-image.png)

# Picture and text

An image whose alternative text starts with `bg` becomes the background. With `bg right:40%` it fills the right side, and the text moves to the left.

---

# Make it your own

The front matter of this page picks the theme and switches on the page number and the footer. Try `theme: dark` or `theme: accent` in source view, or override a single colour:

```yaml
theme:
  name: dark
  accent: "#ffd166"
```

---

# Take it with you

**File → More File Functions → Export** writes the slides as a PDF with one slide per page, or as a folder of HTML pages any browser can show. Speaker notes stay behind.

That is the whole tour — head back to [[00 Welcome]] and start editing. :tada:
