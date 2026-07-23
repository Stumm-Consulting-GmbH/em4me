# Script blocks

A code block with the language tag `perspective-script` runs **JavaScript** and embeds the result into the rendered document. Scripts read the search space data (files with frontmatter and file fields, block properties) via the **pq API** and output lists, tables, elements, or Markdown. This enables free evaluations beyond the declarative [Perspective Query](frontmatter-query.md) — such as recursive structures or computed overviews.

The examples on this page are deliberately set as code blocks; the manual page itself does not run any scripts.

## Activation and trust model

Script execution is **off by default**. Without activation, a script block shows its source with a notice banner; no execution environment is created.

It is enabled under **Settings → Behavior → Run script blocks**. Activation is a deliberate trust decision: scripts come from the opened documents. Only enable it if your own documents are trustworthy. Toggling takes effect immediately in all windows, without a restart.

## Runtime limits

Scripts run **contained** in an isolated sandbox, never in the app context:

- **No file access, no network access, no module imports.** The sandbox has no access to the file system, app interfaces, or external addresses.
- **No access to the document DOM.** Scripts never write directly into the view; output travels as a structured description via the pq API and is translated in a controlled way (allowed are structural and text elements, the attributes `class`, `title`, and `colspan`/`rowspan` on cells).
- **Read-only.** The pq API delivers a data snapshot; files and metadata cannot be changed from scripts.
- **Time limit.** A run is aborted after 5 seconds; the block then shows an abort notice. The blocks of a window run one after another: a long-runner delays subsequent blocks only until its abort, and the app remains responsive throughout.
- **Output cap.** Very large outputs are truncated and marked with a notice.

## Basic structure

The script is the content of the code block; `pq` is the only predefined object. What the output functions report is displayed; the script's own return value is not shown. If the script returns a promise, the block waits for it to settle.

````markdown
```perspective-script
pq.out('Result: ' + (6 * 7));
```
````

## Reading data

All data functions are read-only and work on a snapshot of the index taken at the start of the run. If the file set changes, the block re-runs automatically.

- `pq.pages([source])` — all files of the search space as page objects, optionally filtered by a source.
- `pq.current()` — the page object of the own document (or `null`).
- `pq.file(ref)` — a page by absolute path, root-relative path, or logical name (case-insensitive); `null` if nothing matches.
- `pq.blocks([source])` — the block properties of the search space (see [Block properties](block-properties.md)); only active anchors count.
- `pq.indexStatus` — status of the data basis (`ready`; `none` without a searchable base).
- `pq.version` — version number of the pq API (currently `1`).

### Page objects

A page object carries the **frontmatter fields flat** (field names lowercase, e.g. `page.status`) plus the `file` object with the implicit file fields:

| Field | Content |
|---|---|
| `file.name` | logical name (file name without extension) |
| `file.folder` | folder relative to the search space root (`''` at the root) |
| `file.path` | root-relative path |
| `file.absPath` | absolute path (identity for `pq.link` and `pq.file`) |
| `file.ext` | file extension (lowercase, without dot) |
| `file.size` | size in bytes |
| `file.ctimeMs`, `file.mtimeMs` | creation/modification time in milliseconds |
| `file.tags` | tags of the file |
| `file.aliases` | aliases from the frontmatter |
| `file.inlinks`, `file.outlinks` | incoming and outgoing references, each `{ path, name }` |

### Sources

The optional `source` parameter filters like the query's source selection, in a simplified form:

- `'#tag'` — files with the tag, including hierarchy (`#project` also matches `project/alpha`).
- `'[[Name]]'` — files that reference the target (outgoing link).
- `'Folder'` or `'Folder/Subfolder'` — files below the folder path.

### Block properties

`pq.blocks()` returns per entry `{ file: { path, absPath, name }, anchor, values, updatedMs }`; `values` are the property values of the block. The source filter applies via the carrying file.

## Producing output

Output functions report content to the block (in call order):

- `pq.out(...contents)` — outputs values, builder nodes, or arrays of them; plain values become text.
- `pq.list(items)` — bullet list. An item is content or `{ content, children }` for tree structures (nestable to any depth).
- `pq.table(header, rows)` — table; `header` is an array of cell contents, `rows` an array of row arrays.

Builder functions create nodes **without** output of their own; they are used as content in `pq.out`, list items, and table cells:

- `pq.el(tag, content, attributes)` — an element from the allowed element list (e.g. `p`, `span`, `strong`, `code`, `ul`, `table`, `h1`–`h6`); disallowed elements and attributes are discarded.
- `pq.link(target, label, anchor)` — clickable internal reference. `target` is a page, `file`, or block object, or a path/name; block targets jump to their anchor automatically. Without `label`, the logical name is shown.
- `pq.md(text)` — Markdown via the normal render pipeline (emphasis, lists, links, etc.); embedded query and script blocks are not executed there.

## Helpers

- `pq.date(value)` — date from ISO-like strings (`2026-07-09`, `2026-07-09 14:30`), milliseconds, or date objects; interpreted locally, `null` for unreadable input.
- `pq.dur(text)` — duration in milliseconds from unit expressions like `'7 days'` or `'1h 30min'` (units as in the query's `dur(…)` literal; months/years as 30/365-day approximations).
- `pq.sort(list, selector, descending)` — sorted copy; `selector` is a function or a field path like `'file.name'`. Type-aware comparison: dates chronologically, numbers numerically, otherwise text without case distinction.

## Example: recursive link tree

Starting from the own document, a tree is built over the outgoing references; every target is clickable, already visited pages are not repeated:

````markdown
```perspective-script
function tree(page, seen) {
  return {
    content: pq.link(page),
    children: page.file.outlinks
      .map(function (l) { return pq.file(l.path); })
      .filter(function (p) { return p && seen.indexOf(p.file.absPath) < 0; })
      .map(function (p) { return tree(p, seen.concat([p.file.absPath])); }),
  };
}
var start = pq.current();
pq.list([tree(start, [start.file.absPath])]);
```
````

## Example: table over a tag source

````markdown
```perspective-script
var pages = pq.sort(pq.pages('#project'), 'prio');
pq.table(['File', 'Prio'], pages.map(function (p) {
  return [pq.link(p), p.prio];
}));
```
````

## Errors and aborts

A syntax or runtime error appears localized at the block, with the script's original message and, where determinable, the script line. A run exceeding the time limit is aborted and shown as such. Scripts run in strict mode: assignments to undeclared variables are errors.

## Export

The PDF export prints the visible state: with the setting active, the script result (the export waits for running scripts), otherwise the source display. When passing on the Markdown file, the script block remains plain source; whether it is executed at the recipient's side is decided by their setting.
