# Dashboards

A **dashboard** arranges **tiles** in rows. Each tile runs a [Perspective Query](frontmatter-query.md) and shows its result as a key figure, a list, a table, a bar or a pie chart, or it carries text of its own. **Filters** at the top narrow the queries of all tiles at once. The result is an overview that keeps itself current with the contents of the area: open tasks by status, pages by topic, the longest books of a database table, all at a glance.

**Not to be confused with the "Dashboard" view of events.** An [event block](events.md) has, among its views, one that is also called "Dashboard" (`view: dashboard`): it bundles the upcoming events, milestones and the category distribution **of that one block**. This page describes something else: the code block `perspective-dashboard` of its own, whose tiles show any queries over the whole area.

A dashboard is carried by a code block with the language tag `perspective-dashboard`. A document may contain any number of them, and everything else in it remains ordinary Markdown.

The function belongs to the [internal extensions](extensions.md) ("Dashboard") and is switched on from the working mode **Advanced** upwards. It depends on no other extension, not even on "Chart of a query". Switched off, the block appears as source text with a note above it, and the command "Insert dashboard" is gone. The document stays unchanged, and once the extension is switched on again, the dashboard reappears.

## Inserting a dashboard

The command **"Insert dashboard"** puts a skeleton at the cursor. Two ways lead there: the command palette (default `Ctrl+K`) and the editor context menu → Insert → Insert dashboard. No keyboard shortcut is preassigned; one can be given in the settings. The command requires an editable document.

What it inserts is one row with a key figure over all documents of the search scope; its title follows the program language that is set:

````markdown
```perspective-dashboard
!zeile
!kachel kennzahl titel="Count"
LIST
```
````

The query `LIST` is selected afterwards, because it is the first thing to replace.

## Structure of the block

Inside the block, every element begins with a **marker line**: it stands in column 0 and begins with `!` and a word. The marker line carries the element's settings; the following lines up to the next marker are its content. There are three elements:

| Marker | Notation | Content lines |
|---|---|---|
| `!filter` | `!filter <name> [titel="…"] [eigenschaft=<field>] [vorbelegung=<value>]` | listed values, one per line |
| `!zeile` | `!zeile` | none |
| `!kachel` | `!kachel <kind> [titel="…"] [breite=<share>] [abfrage="<query file>"]` | the query, for the kind `text` Markdown |

- **Settings** have the form `name=value`. A value is a word without spaces or a string in double quotes, in which `\"` stands for a quotation mark and `\\` for a backslash.
- **Vocabulary:** The words of the block are German, like those of the [canvas surface](canvas.md), and are the same in every program language: `!filter` is a filter, `!zeile` a row, `!kachel` a tile, `titel=` the title, `eigenschaft=` the property, `vorbelegung=` the preset, `breite=` the width and `abfrage=` the query file. Markers, tile kinds and width words are written in lower case; `!Kachel` is an unknown marker. Only the names of the filters are free in their spelling.
- **Protection:** A content line that is to begin with `!` in column 0 is protected with `\!`, for instance a query line that starts with `!=`.
- **Order:** Filters may stand anywhere in the block and appear gathered at the top, in the order of the block. Rows and tiles follow the order of the block.
- **The unknown is kept.** A marker or a setting the application does not know stays in the block with its text, and an unchanged element is written back verbatim. An error never throws anything away: it appears as a note, and the text stays as it is.

## Filters (`!filter`)

At the top of the dashboard, a filter becomes a **selection field**. What is chosen there, the application puts into every query that carries its placeholder (section "Placeholders in the queries").

````markdown
```perspective-dashboard
!filter status titel="Status" vorbelegung=open
!filter prio titel="Priority"
high
medium
low
```
````

- **Name:** letters, digits and underscore, no digit at the start; letters with accents are allowed, hyphen and dot are not. Upper and lower case do not matter. The name is also the name of the placeholder.
- **`titel=`** labels the selection field; without it, the name stands there.
- **Where the values come from:** If the filter carries content lines, the values are **listed**: every non-empty line one value, white space at the edges cut off. Otherwise **`eigenschaft=`** names the frontmatter property whose values given in the area are offered; a list value counts per element, and whatever lies in the templates folder does not count. If both are missing, the property of the same name applies: `!filter status` alone is complete. If listed values and `eigenschaft=` stand there at once, the listed ones apply, with a note at the field.
- **The choice** always begins with the entry **"all"**. Then follow the listed values in their order or the values from the area, alphabetically by the program language that is set. If a property does not occur in the area, the field offers only "all", without a note.
- **`vorbelegung=`** sets the value the field starts with; without it, it is "all". With listed values the preset must be one of them (regardless of case), otherwise the field starts with "all" and a note stands at the field. With values from the area, the preset applies even if the value occurs nowhere at the moment.
- **A choice is not a change.** It applies as long as the document is open, separately for each column of the split view, and is never written into the file; the document gets no change marker. After closing and reopening, the field starts with the preset again. If the sequence of filters in the block changes, the fields start afresh as well.
- **Only what is affected reloads.** After a new choice, only the tiles whose query carries the placeholder of that filter are evaluated again; the others stay as they are.
- **The values stay current.** If a value is added to the area or one disappears, the selection field follows. A chosen value that has disappeared from the area stays chosen; the tiles then show no hits until another choice is made.
- **Limits of the fields:** At most 20 filters get a selection field, and values with more than 500 characters are not offered.
- **Error cases:** A filter without a valid name is dropped, and so is a second filter of the same name; the first one applies. The summary note at the foot of the dashboard names both.

## Placeholders in the queries

In the query of a tile, **`$name`** stands for the choice of the filter of that name, regardless of case. A placeholder stands only in `WHERE` and `HAVING`, but there at any place of an expression: as one side of a comparison, in an `IN` list or as the argument of a function such as `contains(tags, $tag)`.

````markdown
```perspective-dashboard
!filter status
!kachel kennzahl titel="Hits"
LIST FROM "Tasks" WHERE priority = "high" OR status = $status
```
````

- **A chosen value** is compared like a string, so `status = $status` behaves exactly like `status = "open"`: regardless of case, and for a list property as membership. The value is never read as query text.
- **If the filter stands at "all",** the smallest condition that carries the placeholder drops out and counts as fulfilled; a `NOT` directly in front of it drops out with it. `AND` and `OR` above it compute as usual: in the example, "all" therefore yields all tasks, because the right-hand side of the `OR` is fulfilled. A property that literally carries the value "all" does not get into conflict with this.
- **A name without a filter** counts as "all"; a note with the name then stands above the result of the tile.

How placeholders behave outside a dashboard, for instance in a query in running text or in a query file opened on its own, is described on the page [Perspective Query](frontmatter-query.md), section "Placeholders".

## Rows (`!zeile`)

`!zeile` begins a new row of the grid; it takes no settings. Tiles before the first `!zeile` form a first row, so that a dashboard of one row does without this marker. A `!zeile` without a tile after it stays empty. Text in the lines below `!zeile` has no meaning, stays in place and is named in the summary note.

## Tiles (`!kachel`)

A tile first names its **kind**, then optionally title, width and a query file. Without a kind it is not complete; there is no default kind.

- **`titel=`** stands above the tile. Without it, the title line stays empty, and a key figure shows only its number.
- **Data source, exactly one:** Either the content lines are the query, or `abfrage=` names a query file (section "Tile with a query file").
- Further words after the kind, for instance `!kachel kennzahl Open`, have no meaning; the tile stays valid, and a note above it points to the setting `titel=`. The same holds for words after the name of a filter.

### Width

| Setting | Share of the row |
|---|---|
| `breite=ganz` (whole) | 12/12 |
| `breite=halb` (half) | 6/12 |
| `breite=drittel` (third) | 4/12 |
| `breite=viertel` (quarter) | 3/12 |
| `breite=n/12` (n from 1 to 12) | n/12; a bare `n` counts the same |

- **Tiles without a setting** share equally what the tiles with a setting leave over in their row. Without any setting, all tiles share the full width.
- **More than twelve twelfths** in one row wrap into the next line without a note.
- **A narrow dashboard** puts the tiles below one another, and likewise the selection fields at the top. What counts is the width of the block, not that of the window, so that it stays readable in a column of the split view too.
- An unknown value results in a note above the tile, and it behaves as without the setting.

### The six tile kinds

The kind decides the presentation. A `DISPLAY` in the query is passed over, without a note.

| Kind | Expects | Shows | Does not fit |
|---|---|---|---|
| `kennzahl` (key figure) | any query | one large number or one number per group (below) | grouped table or grand total, in either case without a number: table with a note |
| `liste` (list) | `LIST`, also with `TASKS` and `BLOCKS` | the list as in running text | `TABLE`: table with a note |
| `tabelle` (table) | `TABLE` | the table as in running text | `LIST`: list with a note |
| `balken` (bars) | `TABLE` with a column of numbers | a bar chart as with `DISPLAY bar` | table with the reason as a note |
| `kreis` (pie) | `TABLE` with a column of numbers | a pie chart as with `DISPLAY pie` | table with the reason as a note |
| `text` | no query | the Markdown of the content lines | — |

Bars and pie read the table by the rules of the charts on the page [Perspective Query](frontmatter-query.md), section "Presentation form". They depend on the extension "Chart of a query"; if it is off, they show the table with the note that the chart presentation is switched off.

List and table show the result of a record query whose query file switches on the [list form](database.md) as a grid, as in running text; the key figure shows only its number even then.

**The key figure** obtains its number depending on the query:

- A table whose columns are exclusively aggregates, without `GROUP BY` (the **grand total**, for instance `TABLE WITHOUT ID sum(effort)`): its first value.
- Any other query without grouping: the number of hits, after `LIMIT`.
- A grouped table: per group the value of the first column that carries a number; if a group lacks it, a dash stands there, and a text in this column appears as text.
- A grouped list: per group the number of its hits.

A single group yields one large number, several yield one number with a label per group; with several levels the group values stand joined with " › ", as in the label of a chart. Without hits, `0` stands there. A date or a duration also counts as a number, so that `min(…)` and `max(…)` over dates show the earliest or latest day. Numbers, dates and durations appear in the format of the program language that is set.

### Text tiles

A tile of the kind `text` shows the Markdown of its content lines, with links, emphasis and lists as in the rest of the document. Three particulars:

- **Headings in a text tile** look like headings but do not belong to the outline of the document: they do not appear in the table of contents, carry no numbering and are no jump target.
- **Data tables, footnotes and block anchors** in a text tile get identifiers and counts of their own, which may coincide with those of the rest of the document.
- **A dashboard block in a text tile** stays source text. Its marker lines need the protection `\!` there, because the outer block otherwise reads every line with `!` in column 0 as an element of its own.

A text tile has no query; a setting `abfrage=` on it is passed over with a note.

### Tile with a query file

Instead of a query of its own, a tile can name a **query file**, a file with the mark `db-query` and exactly one query block (page [Database](database.md), section "Query files"). Several dashboards can thus share one query that is maintained in one place.

````markdown
```perspective-dashboard
!kachel liste titel="Shared query" abfrage="Queries/Recently changed"
```
````

- **Target:** the document name or a path relative to the dashboard, the same forms as with `doc=` of a card on the [canvas surface](canvas.md).
- **Reference:** The query runs as if it stood in the query file. `this.` and the empty wiki link mean the query file, not the dashboard.
- **Placeholders** in the query file work as in a query in the block. Without placeholders the tile stays untouched by the filters.
- **Link in the area:** The setting counts as a link to the query file. The dashboard therefore appears among the [backlinks](linking.md) of the query file, the tile among the outgoing links of the dashboard as an embed, and if the query file is renamed or moved, the setting follows, including the preview of the renaming. A target that does not exist stays an open link.
- **Error cases:** If the target cannot be found, is not a query file, or contains no or more than one query block, the tile shows a note with the name given.
- **Only one source:** If query lines stand below the tile and `abfrage=` at the same time, neither of the two is run; the tile becomes an error tile.

## Comment lines

A line that begins in column 0 with `%%` and ends with `%%` is a **comment**. It may stand before the first element, between the elements and between the lines of a query; it drops out before the evaluation and is shown nowhere. In a text tile, `%%` follows the rules of the extension "Comments" as in the rest of the document.

## Notes and error tiles

An error in the block does not break off the dashboard; every finding appears where it belongs:

- **An error tile** stands at its place in the grid, with a dashed border, with title, note and the line in the block, counted from 1. A tile becomes an error tile if its kind is unknown or missing, and a tile of a data kind without a valid source: neither query nor query file, both at once, or a query file that cannot be used.
- **Notes of a valid tile**, for instance on an unknown width, stand above its content.
- **A syntax error of the query** appears with its position in the place of the tile's result, as with a query in running text.
- **Notes of a filter** stand below its selection field: listed values and `eigenschaft=` at once, an unknown preset, words without meaning.
- **The summary note** "Notes on this dashboard" at the foot names what has no place of its own, each with its line in the block: an unknown marker, text before the first element, text below `!zeile` and a filter that is dropped. An unknown marker itself does not appear, so that it does not shift the grid.
- **A dashboard without a tile** shows, instead of the grid, a note area that explains how a tile comes about; the filters at the top remain.

A dashboard block that itself stands in an outer code block stays literal text.

## Views, printing and export

- **Views:** Rendered, Split and Live show the same dashboard with the same values. In Live mode, the block unfolds to source text as soon as the cursor touches it, and folds back to the dashboard on leaving. In the pure source view it remains code.
- **Embedding:** A dashboard in an embedded document or section appears as in the original, and its selection fields remain usable, because a choice changes nothing in the document.
- **Live update:** New, changed and deleted files show up in the tiles as soon as the index has picked them up, and so do unsaved changes in an open file.
- **Printing and PDF export** show the tiles with the **current choice** of the filters, in their arrangement and without the selection fields. Charts appear light there, even if the application runs dark.
- **Portable Markdown** (**File → More File Functions → Export → Portable Markdown…**) replaces the block with a static state using the **preset** of the filters, not the current choice. At the top stands a line "Preset as of: …" that names each filter with title and value, "all" for a filter without a preset; a dashboard without filters does not have this line. Below follow the tiles **one below the other**, because ordinary Markdown knows no grid, each with its title as a heading: the key figure as text, the list as a bulleted list, the table as a Markdown table, bars and pie as a light image, the text tile as Markdown. An error tile appears as a heading with its note including the line in the block, and a tile whose evaluation is not finished in time with a note saying so. There are no selection fields in the export. If the extension is switched off, the block stays a code block in the export.

## Search scope

The search scope of the tiles is the same as for any query: with an active area the whole area, without an area the folder of the document plus two sublevels. Whatever lies in the templates folder is no hit, unless a query names it. A document that has not been saved yet has no search scope; its tiles then show the notice that the query becomes available after saving.

## A complete example

````markdown
```perspective-dashboard
%% Project overview, as of 2026-11 %%
!filter status titel="Status" vorbelegung=open
!filter prio titel="Priority"
high
medium
low

!kachel text breite=ganz
## Project overview
Open work by status and priority; details in [[Project rules]].

!zeile
!kachel kennzahl titel="Open tasks" breite=drittel
LIST FROM "Tasks" WHERE status = $status AND priority = $prio
!kachel kennzahl titel="Total effort" breite=drittel
TABLE WITHOUT ID sum(effort) AS "Effort" FROM "Tasks" WHERE status = $status
!kachel kennzahl titel="Per priority" breite=drittel
TABLE count() AS "Count" FROM "Tasks" WHERE status = $status GROUP BY priority

!zeile
!kachel balken titel="Tasks per status" breite=halb
TABLE count() AS "Count" FROM "Tasks" WHERE priority = $prio GROUP BY status
!kachel kreis titel="Share per category" breite=halb
TABLE count() AS "Count" FROM "Tasks" WHERE status = $status GROUP BY category

!zeile
!kachel tabelle titel="The ten oldest" breite=8/12
TABLE status, priority FROM "Tasks" WHERE status = $status SORT file.ctime ASC LIMIT 10
!kachel liste titel="Shared query" abfrage="Queries/Recently changed"
```
````

- The comment in the first line appears nowhere. The filter "Status" offers the values of the property `status` from the area and starts with `open`; the filter "Priority" offers the three listed values and starts with "all".
- The text tile stands before the first `!zeile` and forms the first row on its own; its heading does not belong to the outline of the document.
- "Open tasks" counts the hits, "Total effort" shows the grand total without grouping, "Per priority" one number per priority with a label.
- "Tasks per status" depends only on the filter Priority and therefore does not reload when the status is changed.
- The last tile has no width setting and fills the remaining 4/12. It stays untouched by the filters as long as its query file carries no placeholder.

A working dashboard over the files of the Demo-Area is shown on its page "17 Dashboards".

## Limits

- **The values of a filter from the area** come from the frontmatter properties of the documents of the area, not from the fields of records or tasks; for those there are the listed values.
- **A filter chooses exactly one value** or "all"; there is no multiple choice.
- **A placeholder stands only in `WHERE` and `HAVING`.** In `FROM`, in columns, in `SORT`, `GROUP BY` and `LIMIT` it is a syntax error.
- **The tile kinds are chosen by the kind alone,** not by `DISPLAY`; the tree (`DISPLAY tree`) cannot be reached in a tile.
- **`!zeile` takes no settings,** and a tile has no height to choose; the height follows its content.
- **The chart of a tile is an image without controls;** a click on it opens no hit. The hits of a list or table, by contrast, can be clicked as in running text.
- **The choice of the filters is not saved.** Whoever wants to see a particular state permanently sets it as the preset in the block.
- **A dashboard in a quote or a list** can lose the choice of its filters when switching to Live mode and fall back to the preset.
