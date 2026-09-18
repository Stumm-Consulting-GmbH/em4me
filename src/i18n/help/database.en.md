# Database

A Markdown file can declare that it is a **database table** and name the fields this table has. The definition sits in the frontmatter of the same file that also carries the records; the table is thereby complete in one file and survives every file operation, including renaming and moving outside the application.

Distinction: the [Perspective Datatable](datatable.md) is a typed table **inside a document** for small, calculable data sets, whereas the database table is a named table **with its own file** whose records are referenced from other files.

The definition format is the same as with the [Property Profiles](property-profiles.md): the same settings per field, the same lenient line on errors. A table definition is nevertheless **not** a property profile, and a table file does not appear in the profile list of the settings.

## The table file

The container `db-table` in the frontmatter marks the file as a table and carries one entry per column under `fields`:

```yaml
---
db-table:
  fields:
    - name: title
      type: string
      label: Title
      required: true
      options:
        maxLength: 120
    - name: pages
      type: number
      options:
        decimals: 0
    - name: status
      type: string
      values: [available, on loan, missing]
      default: available
    - name: author
      type: record
      options:
        table: Authors
  key: title
  display: title
  lastId: 42
---
```

The mere **presence** of the key makes the file a table, regardless of whether its content is usable. A table with a typo in its definition therefore does not quietly disappear from the database, but stays a table that reports an error.

## Settings per column

| Setting | Meaning |
| --- | --- |
| `name` | **Required.** The technical name of the column. It stays language-neutral because it appears in references and in the order of the records |
| `type` | one of the eight column types below; without it `string` applies |
| `label` | the label for the display, as text or as a mapping from language to text |
| `required` | `true` if the column demands a value |
| `values` | fixed value range as a list |
| `default` | default value of the column |
| `options` | type-specific settings, see below |

The name is the **only required setting**; every other setting can be omitted individually.

## Column types

| Type | Meaning |
| --- | --- |
| `string` | text, the default type |
| `multiline` | multi-line text |
| `number` | number |
| `boolean` | true/false |
| `date` | date |
| `time` | time of day |
| `link` | reference to a **file** |
| `record` | reference to a **record** of another table |

The record reference is the type through which two tables enter into a relationship: a `link` points to a file, but a record is not a file, it is a row in a table.

**An interim state applies to both reference types.** The display shows the value of a column of type `link` or `record` as text and does not resolve the reference; it is not clickable there. The resolution comes with a later stage. Untouched by this is the reference to a single record, which is written in running text and has a section of its own further down.

**Three things are excluded in a table column**, and the message names the reason in each case instead of only the fact:

- **computed fields** (`formula`, `lookup`) — a table carries no computed columns; calculating happens in queries over the data.
- **structured values** (`object`, `objectlist`) — what an object expresses in a cell is otherwise expressed by a dependent table through a relationship.
- **multi-valued columns** (`multistring` as type, `multiple: true` on another type) — a multiple column is a relationship disguised as a column.

As settings of a **document field** all three stay permitted unchanged; they are excluded in a table column alone.

## Type-specific settings

The sub-object `options` carries the settings that apply to one specific type only. They are the same as with the [Property Profiles](property-profiles.md), extended by one setting that exists on a column only:

| Type | Setting | Meaning |
| --- | --- | --- |
| `string` | `maxLength` | maximum length in characters. A longer value is reported and **not truncated** |
| `number` | `decimals` | expected decimal places, zero to ten. A value with more places is reported and **not rounded** |
| `record` | `table` | name of the table the record reference points to |

Maximum length and decimal places belong to the shared pool of settings and therefore apply in the same way to ordinary document properties. Both are a **hint at the field** and never change the stored value.

## Labels in several languages

The label sits at the key `label`, either as plain text or as a mapping from language to text:

```yaml
- name: title
  label:
    de: Titel
    en: Title
    fr: Titre
```

The field **name** stays untouched by this: were it translatable, a database passed on to someone else would fall apart at the first change of language. If a mapping is faulty in itself, the whole label is dropped and the display falls back to the technical name instead of showing some languages and letting others quietly disappear.

## Record identifier, business key and display form

Every record carries an **internal identifier** of the form `r-00042`: the marker `r-` for record and a number with at least five digits. The width is a minimum width and not a limit; `r-99999` is followed by `r-100000`. Both spellings are read, `r-42` and `r-00042` denote the same record.

A reference to a record names the table and the identifier, written like a block anchor: `[[Personen#^r-00042]]`. What such a reference does and when it holds is described further down in the section on findability.

Three settings of the definition belong to this:

| Setting | Meaning |
| --- | --- |
| `lastId` | high-water mark: the highest number ever issued by the table. The next identifier arises from it and not from the existing records, so that the number of a deleted record is never issued a second time |
| `key` | the business key: a field name or a list of field names. Optional, because a transaction or measurement table has no meaningful human-readable key |
| `display` | the field a record is designated by. Without it a single-part business key applies, without either the internal identifier |

If the business key names a field the definition does not know, the **whole** key is dropped: half a key would be a false promise of uniqueness.

## The records in the file

The records live in the body of the same file, inside a block of their own:

````markdown
```perspective-records
|- id="r-00001"
| The Name of the Rose
| 640
| available
|- id="r-00002"
| Foucault's Pendulum
| 880
| on loan
```
````

The rules are kept short, because the file is technical storage:

- A line starting with `|-` in **column 0** opens a record. Its internal identifier follows.
- A line starting with `| ` in column 0 opens a cell. Every further line belongs to the current cell, so a value may span several lines.
- There is **no header row**. The cells stand for the fields of the definition, in order; that order is the contract.
- Only column 0 counts. An indented line is always content, even if it looks like a marker.
- If a line is to begin with `|` or `!` itself, it is preceded by a backslash: `\| this is how a value starts with a bar`.

**No character is ever lost.** If a record has too few cells, the remaining fields stay empty; if it has too many, the surplus ones are left untouched. Both are reported, but nothing is silently written away — that is the one mistake a data store must not make.

## Display of the records

In reading view and in edit mode the block appears as a table with the columns of the definition. Every value is rendered according to the type of its column: numbers right-aligned and with the declared decimals, boolean values as a check mark, multi-line values with their line breaks. If a value does not match its type, the cell shows its original text and is marked in colour instead of being replaced.

From **2000 records** on, the view shows an excerpt and states underneath what it is an excerpt of. That is a window, not a silent truncation: you can see that there is more. The limit was measured, not decreed — up to it the table appears without a noticeable wait.

In the **portable export**, by contrast, the table is complete, without a window. A file you pass on must not withhold anything: the recipient does not have the application and would not see that something is missing.

Records are not edited in this view. The table file is technical storage — it stays readable by hand and, in an emergency, correctable by hand, but in regular operation you do not work inside it.

## Findability: search and links

A search across the **area** takes in a table document without its records. The explanatory text above the data block stays searchable, a match behind it still leads to the right place, and the records themselves are not found this way.

The reason lies with the area and not with the table: the search space keeps the texts of all Markdown files in memory and carries an upper limit across the **whole** area for that. Even a few tables of a few megabytes break it, and from then on every search reads from disk again, including every search across an ordinary document. The records in the search space would therefore cost not themselves but the whole area its speed.

**This is an interim state.** Until records get a match type of their own, they cannot be found through the area search. Two ways still lead to them:

- **Search inside the open document.** Anyone who has the table file in front of them and searches inside it (default `Ctrl+F`) searches the text in front of them and finds its records unchanged. The limit above concerns the search across the area alone.
- **Link to a record directly**, as described in the next section.

### Reference to a single record

A reference names the table and the internal identifier, written like a block anchor:

```markdown
[[Personen#^r-00042]]
```

The reference **holds** if the table named carries that record, and it is broken if it does not. It thus behaves like every other reference in the application. It also holds when the record is not in the first file of the table but in one of its follow-up files: for whoever writes it, the table is one, and how it is spread across files is none of their concern.

Checking is done against the **saved** state of the table, as with every other anchor. A reference to a record that has just been created and not yet saved therefore does not hold yet.

Whether a reference holds is shown by the [Markdown linter](tools.md): a broken target gets a wavy underline in the editor, that is in the Source, Split and Live view. The plain reading view does not depict validity; there, valid and broken references look alike.

A click opens the table file. It does not yet jump to the individual record.

## Splitting large data sets

Once the data grows beyond roughly **0.7 MB**, the application spreads it across several sibling files when saving and keeps treating them as **one** table. You open the first file and see all records; a reference to a record does not know the difference.

Four promises apply, and three of them say what does **not** happen:

- Cuts are made **between two records** only, never inside one.
- A record **never moves** to another file. New records are appended, nothing is redistributed — so no link to a record ever breaks.
- An **existing split is never rebuilt**, even if it was created with a different threshold.
- Every follow-up file names the **field names** in its front matter so that it stays readable on its own. That list is a reading aid, not a contract: if it contradicts the definition of the first file, the definition prevails, and the next save puts the list right.

The mechanism behind this is the same as for [splitting large documents](document-parts.md); for table files only the threshold and the cutting point differ.

## The fact sheet of the database

A database describes itself in the container `db-database` in the frontmatter of a document of its own:

```yaml
---
db-database:
  name: Library
  description: Holdings, loans and readers of the house library
  schemaVersion: '1.0'
  fallbackLocale: en
---
```

- **`name`** and **`description`** are labels and therefore likewise possible as a mapping from language to text.
- **`schemaVersion`** is text and stands in quotation marks. Without them YAML would read `1.0` as a number, and the version `1.0` would become the version `1` on reading.
- **`fallbackLocale`** is the language a label falls back to when it does not carry the language of the interface. Without it the first language occurring in the fact sheet itself applies.

Each of these settings can be missing on its own, and none is a prerequisite for the tables: every table carries its definition itself and stays fully interpretable even without a fact sheet.

## The area as a database

As soon as one document in the stock of an area carries the fact sheet, the application treats that area as a **database area**. You do not declare it separately: the fact sheet is the declaration. The statement thus stands in one place instead of two that could contradict each other.

A database area gets two things an ordinary area does not have.

**The overview of the database objects** answers in one place what lies in this area: the fact sheet with name and description, the tables each with the number of their fields, and the issues from reading the definitions, in plain words instead of as a code. It opens as a tab of its own and is a pure reading view; nothing is edited in it. Three ways lead to it:

- **View → Database overview**,
- the **context menu of the area panel**,
- the **command palette**.

In an area without a database none of these ways is offered.

**The settings section «Database»** sits in the navigation group «Current area» (File → Settings… → Current area → Database). It shows the same information in short form, that is name and description of the database, the number of its tables and the number of issues, and it carries one option: **«Show the overview when the area is opened»**. If it is set, the overview opens by itself as soon as the area is bound. The option lives in the area file and travels with the area folder.

## Faulty settings

The lenient line of the house applies to the whole definition: a faulty **individual setting** is dropped and reported, the entry stays effective; a faulty **entry** is dropped, the remaining columns stay. The message names the place, that is the affected column, the faulty setting and what was expected in its stead.

The one exception is the **type**: a type outside the set above causes the whole entry to be dropped, because a column without an interpretable type is not a column.

A setting the application does not know is dropped individually with a hint and does no harm.

## Switching the database off

The entire database is an [internal extension](extensions.md) named «Database» in the category Tools and can be switched off with a single switch. It requires the [Property Profiles](property-profiles.md), because the shape of a table definition is described and checked through an internal profile; if the basis is switched off, the database goes off with it.

When switched off, the following applies:

- The **record block stays an ordinary code block**, in the reading view, in edit mode and in the portable export. Its content stays readable; what is switched off is the display as a table, not the data.
- **Overview and settings section are dropped**, together with the access points in the view menu, in the context menu of the area panel and in the command palette. An overview that is already open stays until you close it, like any other system page.
- A **reference to a single record** is no longer marked as broken. Without definitions there is nothing to check it against, and a warning without a check would be a mere claim.
- The **search across the area stays unchanged**. Records stay excluded from the full text, because that boundary belongs to the table file and not to the switch; the section «Findability» above therefore continues to apply.

**The files remain untouched.** Switching off takes away the interpretation, not the data: not a single character is changed, and switching it on brings everything back. The area index is rebuilt once in the process; in large holdings that takes a moment.
