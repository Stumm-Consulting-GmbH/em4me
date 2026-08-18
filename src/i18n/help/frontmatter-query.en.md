# Perspective Query

The Perspective query embeds a **dynamic, clickable file list or table** directly in the document. A code block with the language tag `perspective-query` contains a query over frontmatter properties and file fields; when rendered, the result across all files of the search scope appears in its place. Every match is clickable and opens the target file. The result keeps itself current with the file set.

Properties thus become navigable overviews: a topic start page that lists all related files stays up to date without manual work.

## Structure of a query

The simplest form is a bare condition; it yields the alphabetical result list:

````markdown
```perspective-query
area = "Private"
```
````

The full form consists of **clauses**: first the optional output type (`LIST` or `TABLE`), then, in any order and each at most once, `FROM` (sources), `WHERE` (condition), `SORT` (ordering), `LIMIT` (cap) and `COLUMNS` (column layout of the list). Line breaks count as spaces; keywords are case-insensitive.

````markdown
```perspective-query
TABLE status AS "Status", file.mtime
FROM "Projects" AND #active
WHERE file.mtime >= date(today) - dur(30 days)
SORT file.mtime DESC, file.name
LIMIT 20
```
````

A bare condition without a clause keyword is read as `LIST WHERE condition`; existing queries keep working unchanged. Field names that happen to match clause keywords (such as `limit`) remain usable in this short form.

## Output types

- **`LIST`** — clickable file list (default). An optional expression after it (`LIST status WHERE …`) appears as a muted suffix behind every match.
- **`TABLE column [AS "Title"], …`** — table with freely definable columns from fields or expressions. Without an alias the expression itself serves as the column title. The first column is the clickable file link; `TABLE WITHOUT ID …` hides it. List values appear comma-separated, dates in ISO format, link values stay clickable.

## Block level (`BLOCKS`)

The scope addition `BLOCKS` directly after `LIST` or `TABLE` evaluates the query over **block properties** — the per-anchor properties from the [Block properties](block-properties.md) page. Hits are then blocks instead of files: each hit appears as a clickable target of the form `File#^anchor`; clicking opens the file and jumps to the block.

````markdown
```perspective-query
LIST BLOCKS WHERE status = "offen" SORT updated DESC
```
````

- **Field resolution**: Bare field names match the block properties first and otherwise fall back to the frontmatter properties of the carrying file — a block «inherits» its file context. `file.*` fields and `FROM` sources still refer to the carrying file.
- **`updated`**: Time of the last change to the block properties, as a date value for comparisons and sorting (unless the block carries its own `updated` property).
- **Tables**: `TABLE BLOCKS column, …` shows the clickable block target in the first column; `WITHOUT ID` comes after `BLOCKS`. Further columns typically come from block properties.
- **Hit set**: Only blocks whose anchor exists in the document count; orphaned entries (properties without an anchor in the text) are not hits. Documents without block properties simply yield no hits.

````markdown
```perspective-query
TABLE BLOCKS status AS "Status", updated
FROM "Projects"
WHERE prio > 2
```
````

## Task level (`TASKS`)

The scope addition `TASKS` directly after `LIST` or `TABLE` evaluates the query over the **tasks** of the search scope (checkbox lines as on the [Task lists](tasks.md) page; the extension's Global filter applies here too). Hits are individual task lines with a state box, description, marker badges and file origin; clicking the description opens the source file at that line. The state box, the postpone button and the edit button write back directly into the source file — details on the Task lists page.

````markdown
```perspective-query
LIST TASKS
FROM "Projects"
WHERE status.type = "TODO" AND due <= date(eow)
```
````

Bare field names match the fixed task fields first and otherwise fall back to the frontmatter properties of the carrying file; `file.*` fields and `FROM` sources still refer to the carrying file.

| Field | Content |
|---|---|
| `due`, `scheduled`, `start` | manual dates as date values (missing or invalid: empty) |
| `created`, `done`, `cancelled` | automatic dates as date values |
| `due.set`, `due.invalid`, … | per date field: marker present or calendrically invalid (`"true"`/`"false"`) |
| `happens` | earliest value among due, scheduled and start |
| `priority`, `priority.rank` | priority level as a name or as a rank number (0 = highest) |
| `status`, `status.type` | status character or status type (`TODO`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `NON_TASK`) |
| `description`, `heading`, `tags` | description text, heading of the surrounding section, tags of the line |
| `recurrence` | recurrence rule as text |
| `id`, `dependson`, `id.set`, `id.duplicate` | task ID, predecessor list, "has ID", "ID assigned more than once" |
| `blocked`, `blocking` | blocked by open predecessors, or blocks others (`WHERE blocked = "true"`) |
| `urgency` | urgency score (formula on the Task lists page) |
| `line` | line number in the source file |

Boolean task fields filter via string comparison (`blocked = "true"`), like boolean frontmatter values.

**Date convenience:** in addition to `today`, `now` and fixed dates, the `date(...)` literals know the relative words `tomorrow`, `yesterday` as well as the period boundaries `sow`/`eow` (start of week Monday, end of week), `som`/`eom` (month) and `soy`/`eoy` (year). Start words stand for 00:00 of the day, end words for the day's end — `due <= date(eow)` includes the whole of Sunday.

**Sorting:** without `SORT` the task list orders by status type (ongoing first, done and discarded at the end), then urgency descending, due date, priority and path. `SORT` (such as `SORT urgency DESC` or `SORT due`) overrides this default.

**Grouping (`GROUP BY`):** `GROUP BY expression, …` structures the task output under group headings; each further expression creates a nesting level. Hits without a value form the last group. In this form the clause applies only to `LIST TASKS`.

````markdown
```perspective-query
LIST TASKS GROUP BY heading, priority
```
````

**Layout (`HIDE`/`SHOW`/`SHORT`):** `HIDE element, …` hides output building blocks, `SHOW` reveals ones hidden by default, `SHORT` shows marker badges as a symbol only (full value in the tooltip). Elements: the six date kinds, `priority`, `recurrence`, `id`, `dependson`, `tags`, `backlink` (file origin), `count` (hit counter), `urgency` (score badge, only via `SHOW`), `edit` and `postpone` (the two action buttons).

````markdown
```perspective-query
LIST TASKS SHOW urgency HIDE backlink, created SHORT
```
````

**Global query:** the settings section **Tasks** can store `FROM`/`WHERE` parts that are implicitly prepended to every `TASKS` query (a folder or status filter for the whole section, say). A faulty global query reports itself at the fence with its own notice.

## Sources (`FROM`)

`FROM` narrows the result space before the condition is checked:

| Source | Meaning |
|---|---|
| `"Folder/Subfolder"` | files in this folder (relative to the query root), including subfolders |
| `#tag` | files with this tag; also matches sub-tags such as `#tag/sub` |
| `[[File]]` | files linking to `File` |
| `outgoing([[File]])` | files that `File` links to |
| `[[]]` | files linking to the host file (section «Self-reference») |
| `outgoing([[]])` | files that the host file links to |

Sources can be combined with `AND`, `OR`, parentheses and the negation prefix `-`:

````markdown
```perspective-query
FROM ("Projects" OR #important) AND -#archive
```
````

## Conditions (`WHERE`)

| Category | Syntax | Meaning |
|---|---|---|
| Comparison | `field = "value"`, `field != "value"` | equal, not equal (case-insensitive) |
| Ordering | `field < value`, `<=`, `>`, `>=` | type-aware: numbers numerically, dates chronologically, text alphabetically |
| Set | `field IN ("a", "b")`, `field NOT IN (…)` | matches one of the values, or none of them |
| Logic | `AND`, `OR`, `NOT` | and, or, not (precedence: `NOT` before `AND` before `OR`) |
| Grouping | `( … )` | parentheses group sub-expressions |
| Function | `contains(tags, "red")` | function calls are allowed as conditions |

Value semantics: a scalar field is compared directly; for a **list field** (e.g. `tags`), `=` checks membership and `IN` checks a non-empty intersection. For a **missing field**, `=` and `IN` are false, `!=` and `NOT IN` are true. Only top-level frontmatter fields are queryable; numeric values compare numerically in ordering comparisons (`10` is above `5`).

## Fields

Besides frontmatter properties (bare name, e.g. `status`), implicit file fields are available under the `file.` namespace:

| Field | Content |
|---|---|
| `file.name` | logical file name (without extension) |
| `file.day` | date from the ISO prefix of the name (`2026-04-18 Meeting`), empty otherwise |
| `file.folder`, `file.path` | folder or path, relative to the query root |
| `file.ext` | file extension |
| `file.size` | size in bytes |
| `file.ctime`, `file.mtime` | creation and modification time |
| `file.tags`, `file.aliases` | tags and aliases as lists |
| `file.inlinks`, `file.outlinks` | files linking here, and linked files |
| `file.link` | the file itself as a clickable link (for table columns) |

## Self-reference (`this.`)

The `this.` prefix refers to the **host file** of the query, that is to the document holding the block, instead of to the individual hit. It covers file fields and frontmatter properties alike: `this.X` is what `X` would yield in the host file.

````markdown
```perspective-query
LIST WHERE area = this.area AND file.path != this.file.path
```
````

- **Same meaning on every level**: in `BLOCKS` and `TASKS` queries too, `this.` means the host file of the block, never the individual block or task line.
- **Precedence**: the `this.` rule wins over a frontmatter property of the same name, just as the `file.` namespace does.
- **Without a host file**: if it cannot be resolved, every `this.` access yields an empty value; a bare `this` without a dot stays empty like any unknown field name.

As a **source**, the empty wiki link means that same file: `FROM [[]]` collects the files linking to it, `FROM outgoing([[]])` the opposite direction. The host file is never a hit of its own; without a resolvable host file the set stays empty instead of growing to every file.

## Literals and arithmetic

- **Numbers** are written without quotes (`prio > 2`); **strings** go in double or single quotes.
- **Date**: `date(today)` (start of day), `date(now)`, `date(2026-12-31)` or with a time `date(2026-12-31 14:30)`.
- **Duration**: `dur(7 days)`, `dur(1 day 2 hours)`, short `dur(2w)`. Units: `s`, `min`, `h`, `d`, `w`, `mo`, `y` plus long forms; a month counts as 30 days, a year as 365 days.
- **Arithmetic**: `+`, `-`, `*`, `/` with the usual precedence; date ± duration yields a date, date − date a duration. Operators between field names need spaces (`a - 1`, not `a-1` — the latter is a field name).
- **Text concatenation**: if `+` does not work out numerically and one side is a string, it joins the display forms of both sides; this is how composed columns such as `file.day + " — " + status` come about. Purely numeric additions stay numeric (`5 + "3"` yields 8), and a missing value stays missing and leaves the cell empty.

A typical pattern — "modified within the last 7 days":

````markdown
```perspective-query
WHERE file.mtime >= date(today) - dur(7 days)
```
````

## Functions

| Function | Example | Meaning |
|---|---|---|
| `contains(x, w)` | `contains(title, "Plan")` | substring in a string or element in a list (case-sensitive) |
| `icontains(x, w)` | `icontains(title, "plan")` | like `contains`, case-insensitive |
| `length(x)` | `length(tags) > 2` | length of a string or list |
| `lower(s)`, `upper(s)` | `lower(status) = "open"` | lower or upper case |
| `startswith(s, p)`, `endswith(s, p)` | `startswith(file.name, "Project")` | start or end of a string |
| `default(x, d)` | `default(prio, 0) > 2` | fallback value when the field is missing |
| `choice(b, a, c)` | `choice(prio > 5, "high", "normal")` | if-then-else |
| `number(x)`, `string(x)` | `number(value) * 2` | conversion to number or text |
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | format a date (tokens `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` plus `MMMM`/`MMM`, `EEEE`/`EEE` for month and weekday names in the language set for the program and `d`, `M` without a leading zero; square brackets keep text literal: `"[week] ww"`) |
| `days(x)` | `days(date(today) - file.day)` | a duration as a number of whole days; rounded so that a clock change does not shift it by a day |
| `numberformat(x[, n])` | `numberformat(amount, 2)` | render a number localised: without a second argument by the language default, otherwise with exactly n decimals |
| `currencyformat(x[, c])` | `currencyformat(amount, "CHF")` | render an amount localised: in euros without a code, and as the unformatted number for an unknown currency code |
| `infolder(l, "Folder")` | `length(infolder(file.inlinks, "Projects")) = 0` | the sublist of link values whose target lies in the folder or below it |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(values) = 6` | aggregates over number lists |
| `bold(x)` | `bold(status)` | render a value highlighted (section «Highlighting») |

An unknown function or a wrong number of arguments shows an error notice at the block.

**Language of the formatters:** `dateformat`, `numberformat` and `currencyformat` follow the program language chosen in the settings, not the language of the operating system. Where no document stands behind them, such as in computed datatable columns and in inline calculations, the language of the environment still applies.

## Highlighting

`bold(value)` renders a value highlighted, alike in table cells, in the extra field of a list entry and in a group title. The marking survives concatenation: `bold` may enclose just a **part** of a composed expression, and the rest stays plain.

````markdown
```perspective-query
TABLE bold(status) AS "Status", file.mtime
```
````

Cell contents evaluate no Markdown: an asterisk in the text appears literally, and a highlight arises solely from this call. Comparison, sorting and grouping work on the plain text and therefore behave exactly as without the marking; a missing value stays empty instead of producing an empty highlight.

## Example: the last contact

Together, the building blocks of this page yield an overview that shows, on a person's note, when that person last appeared in a dated note and how long ago that was:

````markdown
```perspective-query
TABLE WITHOUT ID file.link AS "Note",
  file.day + " — " + bold(days(date(today) - file.day) + " days") AS "Last contact"
FROM [[]]
SORT file.day DESC
LIMIT 1
```
````

`FROM [[]]` collects the notes linking to this file. `file.day` reads their date from the file name, `date(today) - file.day` yields the duration up to today and `days(…)` the number of whole days. The plus sign assembles date, dash and day count into one cell, and `bold(…)` highlights the distance: «2026-04-18 — **48 days**». Notes without a date in the name sort to the end regardless of the direction and do not displace the hit.

## Sorting and limit

`SORT field [ASC|DESC], field2 …` sorts the result on multiple keys, type-aware (numbers numerically, dates chronologically, text alphabetically by language rules); missing values go last regardless of direction. Without `SORT` the alphabetical order remains. `LIMIT n` caps the result after sorting.

## Multi-column lists

`COLUMNS n` (1 to 8) lets the result list flow across several columns — pure presentation, no data change. With `TABLE`, `COLUMNS` is ignored and reported as a notice at the block.

````markdown
```perspective-query
LIST FROM #bookmarks COLUMNS 3
```
````

## Display and interaction

- **Clickable matches**: every match appears with its logical file name; the full path sits in the tooltip. A click opens the target file in a tab, exactly like a wiki link — including link values in table cells.
- **Live updates**: new, changed and deleted files propagate to visible results without manual reloading as soon as the index has picked them up.
- **Empty result**: if the query matches no file, a short notice appears instead of an empty area.
- **Invalid query**: a syntax error shows an error notice with the position instead of a result.

The three views Rendered, Split and Live show the same result. In the pure source view the block stays visible as code.

## Search scope

The search scope is the same as for the file index:

- **With an active area** it covers the whole area; link relations (`FROM [[…]]`, `file.inlinks`) are complete there.
- **Without an area** it covers the file's folder plus two sublevels.

Files outside the search scope do not appear in the result. A file that has not been saved yet has no search scope; the query then shows a notice that it becomes available after saving. Unsaved changes in an open file, by contrast, are included in the result right away; nothing needs to be saved for that.

## Export

- **PDF export**: the result is printed as a static snapshot of render time, including table and column layout. Entries appear as text; they are not clickable in the PDF.
- **Portable Markdown**: the export leaves the `perspective-query` block unchanged as source. When reopened in this program it is evaluated dynamically again; other Markdown programs show it as a code block.

For free evaluations beyond the clause language — such as recursive structures or computed overviews — the [script blocks](scripts.md) are available; their pq API uses the same field and block model as the query.
