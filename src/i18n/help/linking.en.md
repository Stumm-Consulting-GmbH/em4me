# Linking

Wiki links, anchors, embeds and tags connect Markdown files into a network. The examples on this page show the syntax; their targets do not exist in the manual, in your own files the links open the target file as a tab.

**How a link looks depends on the view.** In live view it is underlined permanently, so that while writing you can see without hovering that a piece of text holds a link; the rendered view underlines it only on hover. Details are on the page [Views and display](views-display.md).

## Wiki links

`[[Target]]` links a file by its name, without path and without extension; the search covers the file's folder and up to two sub-folder levels. The `.md` extension may be omitted or written out.

```markdown
[[Project plan]] opens project plan.md from the search scope.
[[Project plan|the plan]] shows custom display text.
```

If the name does not hit a file directly, two fallbacks apply: the index hit across the search scope and the [alias resolution](frontmatter.md) via the frontmatter field `aliases:`; with several candidates a picker dialog asks. In pipe table cells escape the display-text pipe as `\|`.

## Heading and block anchors

Links can point to a heading or a block inside the target file:

```markdown
[[Project plan#Milestones]]    jumps to the heading
[[Project plan#^decision-1]]   jumps to the block anchor
[[#Wiki links]]                anchor within the same document
```

Block anchors are set with `^id` at the end of a line and anchor the surrounding block (paragraph, list item, table, code block):

```markdown
This decision is binding. ^decision-1
```

The anchor looks different from view to view. The rendered view does not show it at all — there the block is merely a jump target. **Live mode** replaces it with a discreet marker at the end of the line: hovering names the identifier, a click puts the caret at the end of the line and reveals the raw text for editing. When the caret is already in that line, the anchor stays visible as usual. That live mode shows more than the rendered view is deliberate: an anchor is an address others point to, and while restructuring a document you should be able to see that it exists. If the same block carries [properties](block-properties.md), their marker sits next to it.

Broken anchor targets are flagged by the [Markdown linter](tools.md) in the editor.

In a table file of the [database](database.md), `#^` also points at the identifier of a single record: `[[Personen#^r-00042]]`. Such a reference holds if the table carries that record; a block anchor of the same name keeps precedence.

## Markdown links to files

Classic Markdown links also open `.md` targets as tabs; anchors work the same. In-document anchor links jump within the page — live here: [to the Tags chapter](#tags).

```markdown
[Plan](subfolder/project-plan.md#milestones)
```

## Filenames with spaces

If a filename contains spaces, the notation depends on the link type. Wiki links carry the space directly:

```markdown
[[My Note]]
```

Markdown and image links put the target in angle brackets or encode the space as `%20`:

```markdown
[Text](<My Note.md>)
![Alt](<Image 01.png>)
[Text](My%20Note.md)
```

A raw space without angle brackets ends the target, so the link is not recognised (CommonMark). When you rename a file, the link update writes targets with spaces in the `<…>` form; targets that are already `%`-encoded keep their form.

## Wiki embeds

`![[Target]]` embeds content instead of linking:

```markdown
![[image.png]]           image, optionally with width: ![[image.png|300]]
![[notes.md]]            Markdown file as a rendered block
![[manual.pdf]]          PDF in the interactive viewer
![[notes.md#Chapter]]    only the section below the heading
![[notes.md#^block]]     only the anchored block
```

For block anchors the full surrounding block is embedded (list item with sub-lists, fenced code, table row, blockquote). Embedded Markdown renders with its own source as base; links inside resolve against the embedded file.

**Where the target is looked for.** The app searches in three steps, the same way for every file type: first the path relative to your own file, then the subpage spelling, finally the plain **name** across the whole area. So `![[image.png]]` finds the file even when it sits in a different folder — you do not have to get the path right. The search ends at the area root: anything outside is not embedded. Without a bound area, the folder of your own file remains the limit.

If a Markdown file carries the same name as an attachment, the Markdown file wins; written with its extension (`![[image.png]]`) the case is unambiguous. Plain Markdown images `![](path.png)` are unaffected — their spelling means a path, not a name.
## Area links

Two areas can be linked so that a reference leads across the area boundary. This is set up under **Settings → Current area → Area links**: it holds the folder of the other area and a **prefix** under which that area is addressed from now on.

The prefix applies **only in this area and only in this direction**. How the other area refers back to this one is set there and may differ. Letters, digits, hyphen and underscore are allowed; upper and lower case make no difference.

In text the prefix precedes the target:

```markdown
[[@zt:Note]]             file “Note” in the linked area “zt”
[[@zt:Folder/Note]]      target by its path in the linked area
[[@zt:Note#Chapter]]     with an anchor, as with any wiki link
[[@zt:Note|Label]]       with a different display text
```

The target is looked up at the given path first and, if nothing is there, by name across the whole linked area — just like an ordinary wiki link within your own area. Clicking opens the target in the same window.

**Templates of the linked area** can be offered alongside your own; there is a switch per link. The template picker then shows both sets, and every entry from elsewhere names its origin. Without the switch a link does not change the set of templates.

### When a linked area cannot be found

When an area is opened it checks its links, and a finding never prevents it from opening:

- **The folder has moved** — its parent location is reachable, the folder itself is not. A message asks for the new path. Until it is given, references using that prefix count as invalid and are marked in the editor.
- **The storage location is unavailable**, for example because a drive is disconnected. Then only a note appears: the link remains in place and **nothing** is marked invalid. A disconnected drive never destroys a link.

You enter the new path in the same place where the link is defined.

### What does not cross the boundary

An area link leads **there**, not back. Deliberately not carried across the area boundary:

- **backlinks** — they only show references from within your own area,
- the metric **“files without incoming references”** of the area statistics,
- the **graph view**,
- the **area-wide search**,
- and **link updating on rename**: when a file is renamed, references from a linked area stay unchanged. The editor marks them as invalid afterwards — that is the net which makes them visible.

Area links are an [extension](extensions.md) and can be switched off. A prefixed reference is then left unresolved, the check on opening does not run, and the links you entered remain — what is switched off is the effect, not the entry.

## Tags

`#tag` in body text and the `tags:` field in the [frontmatter](frontmatter.md) are recognised as tags; slashes build hierarchies like `#project/markdown`. Tags are clickable in Reading view and Live mode and filter the tags sidebar. Hex colour codes, plain numbers, anchor links and hashes inside a web address are excluded from recognition: in `https://example.org/#chapter`, `#chapter` is part of the address, not a tag.

```markdown
Status: #project/markdown #review
```

### Renaming a tag

Right-clicking an entry in the tags sidebar renames the tag across all its occurrences in the area — in body text as well as in the `tags:` field, in every file, including those that are not open.

**Sub-tags move along.** If `#project` becomes `#work`, then `#project/markdown` becomes `#work/markdown`. That is intentional, not a side effect: queries treat a tag as a prefix of its children, and renaming without them would break exactly those queries. A tag that merely starts with the same word stays untouched — `#projectile` is not a child of `#project`, the slash is missing.

**A preview comes before any writing.** It lists every match with its line, marks the sub-tags that move along, and lets you deselect individual matches. Only confirming in the bar above the list writes anything; cancelling leaves everything as it was.

Writing stays inside the area boundary, and the previous state of every changed file goes into the [version history](history.md) — whether or not history is switched on. A file with unsaved changes receives the rename in its tab rather than on disk; a report at the end names every file and, where something did not work, the reason.

## Autocomplete

While typing in edit mode a suggestion dropdown opens:

- `[[` suggests file names and aliases,
- `[[File#` heading anchors, `[[File#^` block IDs,
- `#` in body text known tags.

Arrow keys navigate, Enter or Tab selects, Esc closes.

As long as nothing is typed after `[[`, the most recently changed files of the area appear at the top, the newest first. Once you filter, match quality leads again; the change time then only decides between suggestions of equal rank.

After `#`, the tags used more often in the area appear at the top, the most frequent first; here too match quality leads as soon as something is typed, and frequency then decides between equals. The number behind each suggestion states it.

Accepting a file or alias suggestion also writes the closing brackets and places the cursor behind them. If they are already there, no second pair appears.

## Sidebars for the network

Three sidebar sections show the network of the active file: **Backlinks** (incoming links, including "via alias"), **Outgoing links** (all outgoing references in document order) and **Tags** (all tags of the search scope with counts). Access paths are listed in the [features table](functions.md). Backlinks and Tags name their files without the Markdown extension and carry the full path in the tooltip; Outgoing links show the reference exactly as it is written in the document.

## Inserting an address into a selection

When text is selected and the clipboard holds a single address, pasting creates a link from both instead of replacing the selection. The selection `Project page` together with the address `https://example.org` becomes:

```markdown
[Project page](https://example.org)
```

If the address contains spaces or brackets, the target is written in the angle form; a `www.` address receives the `https://` prefix:

```markdown
[Entry](<https://example.org/Title_(Extra)>)
```

Without a selection, with clipboard content that is not recognisable as a single address, and inside source code areas normal pasting applies. A single undo step reverts the conversion completely. Access and switch are listed in the [functions table](functions.md).
