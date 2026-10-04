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

The full form consists of **clauses**: first the optional output type (`LIST` or `TABLE`), then, in any order and each at most once, `FROM` (sources), `WHERE` (condition), `GROUP BY` (grouping), `HAVING` (condition on the group), `SORT` (ordering), `LIMIT` (cap), `COLUMNS` (column layout of the list) and `DISPLAY` (presentation form). Line breaks count as spaces; keywords are case-insensitive.

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

**Grouping (`GROUP BY`):** `GROUP BY expression, …` structures the task output under group headings; each further expression creates a nesting level, and hits without a value form the last group. Grouping, aggregates and the condition on the group apply at every level; they are described in the section «Grouping and aggregation».

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

## Record level (`RECORDS`)

The scope addition `RECORDS` directly after `LIST` or `TABLE` evaluates the query over the **records** of database tables (page [Database](database.md)). Hits are individual records: each appears with its display form, without one with its internal identifier, and a click opens its **form** instead of the table file.

````markdown
```perspective-query
TABLE RECORDS author, pages
FROM "Books"
WHERE pages > 500
SORT author
```
````

- **Source**: `FROM` names the table as a string, by the name of its file without extension and regardless of case (`"Books"`) or as a path relative to the area root including the extension (`"Archive/Books.md"`), like the setting `table` of a reference column. Several tables are combined with `OR`, `AND`, parentheses and `-` as usual. At least one table or one hierarchy (section «Hierarchies» below) must be named without negation; a tag, a wiki link, `outgoing(…)` and the empty wiki link produce an error message at this level. A table that does not exist yields no hits. Neither does a table whose file lies in the templates folder, unless `FROM` names it by its path through that folder, such as `"Templates/Books.md"`; its name alone is not enough (section «Sources»).
- **Fields and values**: Bare names are the fields of the table, regardless of case. Every value has the type of its column, so condition and sorting treat numbers as numbers and dates chronologically; a boolean is checked with `field = "true"` or `field = "false"`. If a cell's content does not fit its type, the value counts as missing. A name the table does not carry stays empty and does not fall back on the frontmatter of the table file.
- **Own details**: `record.id` is the internal identifier of the record, `record.table` the name of its table; both take precedence over a field literally named that way. `file.*` means the table file, `this.` the host file of the query.
- **Tables**: `TABLE RECORDS …` shows the hit in the first column «Record»; `WITHOUT ID` comes after `RECORDS`. A column title is the alias, otherwise the label of the field in the selected program language following the fallback chain of the [Database](database.md) page, otherwise the expression itself, for instance with a path.
- **Reference values**: A reference field shows the display form of its target, without one its identifier, and a click opens the form of the target. An empty reference and one pointing nowhere remain an empty cell.
- **Order**: Without `SORT` the hits are ordered by their display form regardless of case, with equal display forms by identifier, and records without a display form come last.
- **Two click targets**: A record in the result of a query opens the form, whereas a reference in running text such as `[[Books#^r-00042]]` opens the table file at the row of the record. The form shows the saved state.
- **Unsaved state**: Changes to an open table are included in the result right away, without saving.
- **Not at this level**: `bold()` in a column or in an expression of `GROUP BY` produces an error message, because a database value carries no markup; in condition and sorting it remains allowed. `HIDE`, `SHOW` and `SHORT` apply only to `LIST TASKS` and report themselves here as on the file and block level.
- **Empty result and database switched off**: Without hits, «No record matches this query» appears. If the «Database» extension is switched off, the list stays empty, a note appears above it, and no error message is shown.

### Linking through reference fields

A **path** through a reference field reads the fields of the record it points to: in a loan, `book.title` is the title of the referenced book, and `book.publisher.city` goes one level further into a third table. Paths work in columns, in `WHERE` and in `SORT`:

````markdown
```perspective-query
TABLE RECORDS book.title AS "Title", book.author AS "Author", returned
FROM "Loans"
WHERE book.pages > 300
SORT book.title
```
````

- A field literally named like the path, such as `book.title`, takes precedence.
- An empty reference, one pointing nowhere and one whose key value fits several records give an empty value; for the ambiguous one, a note additionally appears above the result. A path through a field that is not a reference stays empty as well.
- If a path ends on a reference field, the cell again shows a reference that opens the form.

The **opposite direction** needs no notation of its own. Which loans point at a book is told by a condition on the reference field:

````markdown
```perspective-query
LIST RECORDS FROM "Loans" WHERE book = "r-00005"
```
````

The comparison works the way a reference cell is read: an identifier matches in both notations (`r-5` and `r-00005`), any other text is compared with the single-part business key of the target, character by character. The display form only counts if it is the key at the same time. `!=`, `IN` and `NOT IN` follow the same rule, and `SORT` by a reference field orders by the display form of the target.

### Hierarchies (`ancestors`, `descendants`)

Two sources collect records across **any number of levels** of a reference field, for instance the staff of an organisation through the field `manager`:

````markdown
```perspective-query
LIST RECORDS FROM descendants([[Team#^r-00001]], manager) WHERE since > 2015
```
````

- `descendants(target, field, …)` returns all records that point at the target through the named fields, directly or through intermediate levels; `ancestors(target, field, …)` the opposite direction, that is, the chain of records the target points at, up to the top.
- The **target** is a record reference in the notation of running text. The table is given by name or as a path, also without extension; after `#` follows the identifier, with or without `^` and also in its short form, or the value of the single-part business key, such as `[[Team#Clara]]`. An alias after `|` does not count.
- **Fields**: one or several reference fields, separated by commas, such as `father, mother`; a name with spaces goes in quotation marks. The hierarchy follows all named fields, also across table boundaries.
- The **target itself is not part** of the result, and every record appears in it at most once. There is no depth limit. If the references form a cycle, the search still ends, and a note appears above the result instead of an error message.
- The set works like any source: `WHERE`, `SORT`, `LIMIT` and columns apply, `AND "Table"` restricts it to one table, `-` excludes it. Named on its own, a hierarchy is a complete source; only negated, it produces an error message, because it then restricts no table.
- A target that does not exist yields no hits. If the key value of the target fits several records, the result stays empty and the note on the ambiguous reference appears above it.
- Both sources exist only at the record level; at the other levels they produce an error message.

A hierarchy appears as an indented tree with the setting `DISPLAY tree BY field` (section «Presentation form»).

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
| `descendants([[Table#^r-00001]], field)` | records that point at the target record through `field`, across all levels (record level only, section «Hierarchies») |
| `ancestors([[Table#^r-00001]], field)` | records the target record points at through `field`, across all levels (record level only) |

At the record level a string names a table instead of a folder (section «Record level»).

**Templates are no hits.** Whatever lies in the templates folder of the [Templates](templates.md) page, subfolders included, appears in the result at no level: neither the file nor its blocks and tasks nor the records of a table in it. If `FROM` names the templates folder or one of its subfolders explicitly, the query shows exactly the content of the named folder: `FROM "Templates"` all templates, `FROM "Projects" OR "Templates"` the projects and the templates. Not a naming are a parent folder such as the area root `""`, a negated folder such as `-"Templates"`, a tag and a link. If the «Templates» extension is switched off, the exclusion does not apply.

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

- **Same meaning on every level**: in `BLOCKS`, `TASKS` and `RECORDS` queries too, `this.` means the host file of the block, never the individual block, task line or record.
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
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(values) = 6` | aggregates over number lists; over a group they combine the values of all its hits (section «Grouping and aggregation») |
| `count(x)` | `count(tags) > 2` | number of present values: for a list its elements, for a single value 1, without a value 0; `count()` without a field counts the hits of a group |
| `bold(x)` | `bold(status)` | render a value highlighted (section «Highlighting») |

An unknown function or a wrong number of arguments shows an error notice at the block.

**Language of the formatters:** `dateformat`, `numberformat` and `currencyformat` follow the program language chosen in the settings, not the language of the operating system. Where no document stands behind them, such as in computed datatable columns and in inline calculations, the language of the environment still applies.

## Highlighting

`bold(value)` renders a value highlighted, alike in table cells, in the extra field of a list entry and in the value of a group. The marking survives concatenation: `bold` may enclose just a **part** of a composed expression, and the rest stays plain.

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

`SORT field [ASC|DESC], field2 …` sorts the result on multiple keys, type-aware (numbers numerically, dates chronologically, text alphabetically by language rules); missing values go last regardless of direction. Without `SORT` the alphabetical order remains; tasks and records follow the default of their section. `LIMIT n` caps the result after sorting. In a grouped table, `SORT` and `LIMIT` order and cap the groups instead of the hits (section «Grouping and aggregation»).

## Grouping and aggregation (`GROUP BY`, `HAVING`)

`GROUP BY expression, …` gathers the hits into groups by the value of an expression, at every level: for files, blocks, tasks and records. Each further expression forms a level below the previous one. The groups are ordered by their value, and hits without a value come last in the group «(no value)». A list value such as `file.tags` forms one group per combination, so `[red, blue]` and `[blue, red]` are two; there is no splitting by single list elements. A reference field at the record level groups by the record it points at: two books with the same title give two groups, each shows the display form of its book, and a click on it opens that book's form.

- **List**: `LIST … GROUP BY …` shows a heading per group with its hits below, each level indented one step further. A hit appears and responds to a click as in the list without grouping.
- **Table**: `TABLE … GROUP BY …` shows one row per group, with several levels one per group of the lowest level; individual hits do not appear. In front stands one column per expression of `GROUP BY` with the group value, in place of the column «File» or «Record». Its title is the label of the field at the record level, otherwise the expression itself; `WITHOUT ID` hides these columns. The other columns show values over the group.

````markdown
```perspective-query
TABLE RECORDS count() AS "Books", sum(pages) AS "Pages"
FROM "Books"
GROUP BY author
HAVING count() > 1
SORT count() DESC, author
```
````

**Row or group.** An aggregate function takes its meaning from the place where it stands. **Aggregate places** are the columns and `SORT` of a grouped table as well as `HAVING`; there it computes over all hits of the group. Everywhere else it computes over the value of the single hit, that is in `WHERE`, in the expressions of `GROUP BY`, in the columns of a table without `GROUP BY`, in the extra field of the list and in `SORT` of a grouped list. Three examples:

| Query | Meaning |
|---|---|
| `TABLE sum(values)` | per file the sum of its list `values` (row) |
| `TABLE sum(values) GROUP BY status` | per status the sum of all values of all files with this status (group) |
| `LIST GROUP BY status HAVING count() > 2` | only the statuses with more than two files, their files below (condition on the group) |

**Over the group**, `count()` counts the hits and `count(x)` the hits in which `x` has a value. `sum`, `average`, `min` and `max` combine the values of all hits, a list with all its elements; `min` and `max` also take date values there and then return a date. Computing over aggregates is allowed, for instance `sum(pages) / count()`. The aggregate over the list of a single hit cannot be reached at an aggregate place. In the aggregate row of the [Perspective Datatable](datatable.md) the average is called `avg`, in the query `average`.

**Allowed at an aggregate place** are an expression equal to an expression of `GROUP BY` (the case of field names does not count), literals, aggregates and any arithmetic or function over them, for instance `upper(author) + ": " + count()`. An error message results, by contrast, from:

- another field in a column or in `SORT` of a grouped table, a self-reference with `this.` included; the message names the column and points to `LIST`, which shows the individual hits;
- another field in `HAVING`; the message names the field and points to `WHERE`, which filters the individual hits;
- an aggregate inside an aggregate, for instance `sum(count(x))`;
- `count()` without a field at a row place, for instance in `WHERE` or in a table without `GROUP BY`;
- `HAVING` without `GROUP BY`.

**Condition on the group (`HAVING`).** `HAVING` tests the groups as `WHERE` tests the hits: it is a truth expression as after `WHERE`, stands only together with `GROUP BY` at any position among the clauses, and works in list and table. With several levels it tests the groups of the lowest level. A group above that keeps no subgroup is dropped, and the remaining ones keep only the hits of their remaining subgroups.

**Order.** In the grouped table, `WHERE` filters the hits, then the groups are formed, `HAVING` tests them, `SORT` orders them (without `SORT` by their value), and `LIMIT` caps the number of rows. With several levels, `SORT` orders the groups of each level among themselves. In the grouped list, by contrast, `SORT` and `LIMIT` order and cap the hits before the groups are formed, and `HAVING` works afterwards; the groups themselves are ordered by their value there.

**Limits.** A table without `GROUP BY` computes per hit; there is no grand total over all hits without grouping. `HIDE`, `SHOW` and `SHORT` remain reserved for the task list. The tree (`DISPLAY tree`) fits no grouped query. As the source of a value set or a collection field, a grouped query yields the same hits as without grouping (page [Property Profiles](property-profiles.md)).

## Multi-column lists

`COLUMNS n` (1 to 8) lets the result list flow across several columns — pure presentation, no data change. With `TABLE`, `COLUMNS` is ignored and reported as a notice at the block.

````markdown
```perspective-query
LIST FROM #bookmarks COLUMNS 3
```
````

## Presentation form (`DISPLAY`)

The setting `DISPLAY` with the name of a form chooses the form in which the result appears. It is a clause like the others and usually comes last; without it, the result appears as a list or a table, depending on the output type. List and table themselves are chosen by `LIST` and `TABLE`, not by `DISPLAY`; `DISPLAY list` and `DISPLAY table` therefore count as unknown forms.

````markdown
```perspective-query
LIST RECORDS FROM "Team" DISPLAY tree BY manager
```
````

The form to choose is the **tree** (`DISPLAY tree BY field`). It shows the records of a record query indented along the named reference field:

- A record hangs below the record its field points at if that one is in the result. Otherwise it is a **root** and stands on the far left: without a reference, with a reference pointing nowhere or at a record the condition filters out. With `descendants(…)` the records directly below the target are therefore the roots, because the target itself is not part of the result.
- Roots and siblings stand in the order of the result, which `SORT` determines.
- Every record appears exactly once, even if the references form a cycle. A cycle without a root follows after the other roots and starts with its first record in the order of the result.
- Only the field after `BY` takes effect. If a table carries two parent fields such as father and mother, the tree follows the named one; which records are in the result is still determined by the source.
- A node shows the display form like a list entry, with `LIST` followed by the additional field; with `TABLE` the tree shows no columns. A click opens the form.
- Nothing is indented deeper than 32 levels; deeper nodes stand in full on the 32nd level.

**Fallback**: If a form is unknown or does not fit the query, the result appears without it, that is, as a list or a table, with a note naming the form above it and no error message. The tree fits only at the record level and only with a field after `BY` that is a reference field in at least one table of the result. It never fits a grouped query; the grouped output then appears with the note. An empty result shows its empty notice and no form. If the name of the form is missing after `DISPLAY` or the field after `BY`, the query is invalid.

## Display and interaction

- **Clickable matches**: every match appears with its logical file name; the full path sits in the tooltip. A click opens the target file in a tab, exactly like a wiki link — including link values in table cells. At the record level a match is named after its display form, and a click opens its form.
- **Live updates**: new, changed and deleted files propagate to visible results without manual reloading as soon as the index has picked them up.
- **Empty result**: if the query matches no file and no record, a short notice appears instead of an empty area.
- **Invalid query**: a syntax error shows an error notice with the position instead of a result.

The three views Rendered, Split and Live show the same result. In the pure source view the block stays visible as code.

## Search scope

The search scope is the same as for the file index:

- **With an active area** it covers the whole area; link relations (`FROM [[…]]`, `file.inlinks`) are complete there.
- **Without an area** it covers the file's folder plus two sublevels.

Files outside the search scope do not appear in the result, nor does whatever lies in the templates folder, unless the query names it (section «Sources»). A file that has not been saved yet has no search scope; the query then shows a notice that it becomes available after saving. Unsaved changes in an open file, a database table included, are by contrast included in the result right away; nothing needs to be saved for that.

## Export

- **PDF export**: the result is printed as a static snapshot of render time, including table and column layout. Entries appear as text; they are not clickable in the PDF.
- **Portable Markdown**: the export leaves the `perspective-query` block unchanged as source. When reopened in this program it is evaluated dynamically again; other Markdown programs show it as a code block.

For free evaluations beyond the clause language — such as recursive structures or computed overviews — the [script blocks](scripts.md) are available; their pq API uses the same field and block model as the query.
