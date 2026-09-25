# Mind map view

The mind map view shows the structure of **one** document as a map: headings and list items become nodes of a tree, and the body text below them becomes the note of its node. It is a view of the same document, not a second document, and never changes the text.

The view belongs to the **Mind map view** extension and can be switched off under Settings → Extensions. With it off, the menu entry disappears, and a tab that was last open as a map returns to the reading view.

## Opening

The mind map is a tab's fifth view mode, alongside Source, Split, Rendered and Live: View → Mind map or default `Ctrl+5`. The mode applies per tab, so one document may be open as a map while a second is edited as source next to it. The map follows the document: add a heading in the source and it appears in the map moments later.

## What becomes a node

| In the document | In the map |
| --------------- | ---------- |
| headings | the upper levels of the tree |
| list items | continue the hierarchy below their node |
| paragraphs, tables, code blocks, images | note of their parent node |

The root is the first-level heading if the document carries exactly one; otherwise the file name carries the root and all first-level headings become its children. A skipped level produces no empty node: a node attaches to the nearest existing ancestor.

## Root position

The direction of growth is a choice because it depends on the document and the screen: a deep tree reads better from left to right, a flat and wide one from top to bottom, and the central position makes the best use of a wide screen.

| Position | Picture |
| -------- | ------- |
| **Left** | root on the left, all branches grow to the right |
| **Centre** | root in the middle, branches spread to both sides |
| **Right** | root on the right, all branches grow to the left |
| **Top** | root at the top, the tree grows downwards |
| **Bottom** | root at the bottom, the tree grows upwards |

The node text stays horizontal in every position; the arrangement is rotated, not the label. In the central position the main branches keep their document order and are split at one point: the leading branches go to the right, the rest to the left, and the split falls where both sides come out as equal in height as possible. The same document therefore always yields the same picture.

## Using the map

- **Collapse** — the circle at the end of a branch folds the subtree away and back. With `Ctrl` the click applies to the whole subtree below.
- **Zoom** — mouse wheel over the surface, centred on the pointer.
- **Pan** — drag the surface with the mouse button held down. Switching into the view fits the map into the frame by itself; switching in again brings it back after free zooming and panning.
- **Notes** — nodes with body text carry a sheet symbol; clicking it shows the text in a box next to the node. A click on the empty surface closes it again.
- **Jump to the source** — clicking the node text switches to the split view and puts the cursor on the matching line.

The collapse state applies to the running session and is written neither into the document nor into a companion file: pure display state should not burden a format that stays readable without the application.

## Searching the map

In the mind map view the search (default `Ctrl+F`) looks through the map itself rather than the text behind it; the left of the search bar then reads “Search in the mind map”. It finds what the map carries: the title of a node and the text of its note. Each node counts once, even when title and note both match, and the toggles for regular expressions and case sensitivity apply as everywhere in the search.

- **Result** — every matching node is shaded in colour, the current one more strongly and outlined, and the map moves it to the centre without changing the zoom. The counter in the search bar names the current match and the total, such as `2 / 5`; if no node matches, it reads “No matches”.
- **Match in the note** — if the match lies in the note, the node's sheet symbol is coloured, and pointing at the node shows the hint “Match in the note”. Clicking the symbol shows the note as usual.
- **Moving on** — `Enter` or `F3` jumps to the next match, `Shift+Enter` or `Shift+F3` to the previous one; after the last it continues with the first.
- **Collapsed branches** — if a match lies in a collapsed subtree, the branch unfolds when the match is reached and stays open after the search ends.
- **Ending** — `Escape` or closing the search bar removes the highlighting, and so does switching to another view; zoom and position of the map stay as they are.

The search does not change the document, and replacing is locked in this view. **In an open area** the same applies: `Ctrl+F` in the mind map view searches the map, not the area. The search across all files of the area with its list of matches remains available in the other views of the document, such as the reading view; see [Tools](tools.md).

## Setting the appearance

The Mind map section of the settings is the **default for all documents**:

- **Root position** — the five directions above.
- **Line style** — curved or straight connections.
- **Freeze branch colour from level** — up to which level a new branch gets its own colour; below it the whole subtree inherits the colour of its main branch.
- **Initially expanded depth** — how deep the map starts open; `-1` expands everything.
- **Maximum node width** — the width at which a long title wraps.

## Default per document

Any document may override the default for itself, in the YAML header under the key `mindmap`:

```yaml
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

The entry applies to this document only; all others keep following the setting. Allowed values for `layout` are `links`, `mitte`, `rechts`, `oben` and `unten`, for `linienfuehrung` the values `geschwungen` and `gerade`; plus the numbers `farbEinfrierEbene`, `anfangsTiefe` and `hoechstBreite`. Anything not understood falls back to the default silently, so the file stays readable. The remaining header entries are described on the page [Frontmatter and properties](frontmatter.md).

## Limits

- The map is a **representation**, not an editor: nodes cannot be moved or renamed in it. Changes happen in the document, and the map follows.
- It shows **one** document. Relations between files are shown by the [graph view](graph.md).
- Very large documents are truncated at 3000 nodes; a note below the map states how many nodes are shown.
- A document without headings and lists has no structure for a map and shows a note instead of one.
