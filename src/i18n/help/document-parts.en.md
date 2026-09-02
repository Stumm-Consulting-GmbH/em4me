# Splitting large documents

Very large documents are split into several files when saving and joined back into a single document when opening. In the tab you work as usual: you see one continuous text, undo runs across the boundaries, and search finds the document as a whole.

The reason is usability. A document that grows beyond a certain size makes switching to edit mode sluggish. Splitting keeps the individual file manageable without imposing a size limit on you.

## When splitting happens

Splitting happens when **saving**, once the document exceeds about one megabyte. Viewing and reading are never affected.

The first split of a document is announced. You can decline it: the file then stays undivided, and the tab is set to read only until you open it again. Once the parts exist, further ones are added silently.

If automatic saving runs in the background, nothing is split unasked. The tab simply stays modified until you save manually once and answer the question.

## Where the cut is made

Cuts are only made before a **heading of the top two levels**, that is, before a line starting with one or two hashes:

```markdown
# First chapter

Text …

## A section
```

This means no construct ever spans a boundary: no code block, table, list or callout is torn apart. Headings inside a code block or a quote do not count as a cut point.

**If no such heading exists, nothing is split.** A very large document without headings stays a single file; the status bar tells you once why. The price is deliberate: cutting at an arbitrary place would land in the middle of text that belongs together.

## What the parts are called

The first file keeps the document name unchanged. The following parts carry the same name with an addition:

```text
Travel report.md
Travel report•part-00002.md
Travel report•part-00003.md
```

The separator is the **bullet** `•`. It is deliberately different from the one used by [subpages](subpages.md), which use the division slash `∕`: a part is not a subpage, and the two should be distinguishable at a glance.

Every part file is an ordinary Markdown file and readable on its own. Its head carries a technical line recording where it belongs and which position it holds:

```yaml
doc-part: v1|2|Travel report
```

This line is the binding statement about what belongs together — not the file name. Move a part file to another folder and the document will no longer find it.

## What you see of it in the program

Little, and that is the intention:

- **Tab and editor** show one continuous document.
- **The area file list** shows only the document, not its parts.
- **Search** reports a hit from a later part as a hit of the document; the jump opens it at that spot.
- **Renaming** takes all parts along.
- **The head of the first file** carries the assignment line. It is the visible trace of the split and also appears in the properties.

In your operating system's file manager you still see the parts — they are real files in your folder.

## When a part is missing

If a part is missing when opening, because it was deleted, moved or not yet synchronised, the document opens **read only** and names the missing position. Saving is blocked while the gap exists: writing from the incomplete text would lose the missing part for good.

There are two ways out. Put the missing file back, and the document is complete and writable again the next time you open it, without you having to reset anything. Or delete the document's `.mdd` companion file if you want to continue without the part — it holds the list of parts that makes the gap visible in the first place.

If a part was **changed** outside the application, saving reports a conflict and overwrites nothing.

## Rejoining the parts

The menu item **File → More file functions → Rejoin parts…** turns the parts back into a single file and deletes the part files. This only happens on that request, never on its own.

If the rejoined document is larger than the threshold, the command warns beforehand: the next save would split it again immediately. No content is lost, but the command would have no lasting effect.

If a part is missing, the command refuses to run — it would delete the remaining parts and make the loss permanent.
