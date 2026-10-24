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

## Relationships between tables

A column of type `record` is a **reference column**. Its setting `table` names the target table by the name of its file without the extension, regardless of upper and lower case, and every cell of the column points to a record of that table:

```yaml
- name: author
  type: record
  options:
    table: Authors
```

A cell may hold one of two things:

- the **identifier** of the target, also in its short form: `r-00007` and `r-7` point to the same record;
- the **value of the business key** of the target, if that key consists of a single field, for instance `Umberto Eco`. It is compared character by character, like the key itself.

A text in the form of an identifier is always read as an identifier. The notation `[[Authors#^r-00007]]` of a reference in running text does not belong in the cell; there it counts as an ordinary key value. An empty cell is not a reference and is not checked; whether it must be filled is decided by `required`.

**When the application saves, every reference is checked and written as an identifier.** The target table has to exist in the area, and the cell content has to hit exactly one record that exists after the change; a record created in the same change counts, one deleted in it does not. If it hits none or several, the change is rejected. Resolving via the key value only works if the target table has a single-part business key; with a multi-part key the identifier is the only way. Whatever has been resolved, the application writes into the cell as the padded identifier, whether the key value or the short form stood there; if the key value of the target changes later, the reference stays valid. A record may also refer to itself.

**A record that is still referred to cannot be deleted.** This applies to every reference column of the area that points to its table, including one in the same table, and to references via the identifier as well as via the value of a single-part key. The message names the referring table, its reference columns, the number of referring records and the first of them. The application deletes nothing along with it and empties no reference. Anyone who wants to delete a header together with its line items deletes both in **one** change; likewise, a reference no longer counts if the same change sets it to another target or to empty. A reference in running text, such as `[[Authors#^r-00007]]`, does not protect, by contrast: it may break like a link to a deleted file.

Both checks need the overview of the tables of the area. If the tables have not been fully read yet, the application rejects a change that sets a reference or deletes a record, and the message asks you to try again in a moment.

Relationships are evaluated with a record query: a path such as `author.name` reads the field of the referenced record, a condition on the reference field finds the opposite direction, and `ancestors(…)` and `descendants(…)` follow references across any number of levels. How many records point at a record is counted by a grouped query such as `TABLE RECORDS count() FROM "Loans" GROUP BY book`. The [Perspective Query](frontmatter-query.md) page describes both in the sections «Record level» and «Grouping and aggregation».

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
| `lastId` | high-water mark: the highest number ever issued by the table. The next identifier lies above it and above the highest identifier among the existing records, so that the number of a deleted record is never issued a second time and no identifier is issued twice even without a high-water mark or with one that is too low |
| `key` | the business key: a field name or a list of field names. Optional, because a transaction or measurement table has no meaningful human-readable key |
| `display` | the field a record is designated by. Without it a single-part business key applies, without either the internal identifier |

If the business key names a field the definition does not know, the **whole** key is dropped: half a key would be a false promise of uniqueness.

**When the application saves, the business key stays unique.** The application checks it against all records of the table, including those in its follow-up files, and rejects a change after which two records would carry the same key; nothing is written then. The message distinguishes three situations:

- The same key appears **twice in the same change**.
- The key is **already assigned to a record**. The message names that record with its identifier and display form.
- The key is **already assigned more than once in the existing records**. Then the existing records have to be cleaned up first; the message names the records that carry it.

A multi-part key only counts as a duplicate if all of its parts match. If a part is empty, the key is not checked; whether the field must be filled is decided by the setting `required`. The comparison is character by character: `Müller` and `MÜLLER` are two different keys, and a leading space counts. A change that leaves the key of a record unchanged does not check it; a record from an existing duplicate thus stays changeable in its other fields. Deleting and re-creating the same key in one change is allowed, and so is swapping the keys of two records.

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

## Validation rules

A validation rule determines which values a table accepts. It stands in the definition, in one of two places depending on its reach:

- **`check` at the entry of a column** checks the one value of that column.
- **`checks` at the top level of the container** is a list of conditions over several fields of a record.

```yaml
db-table:
  fields:
    - name: zip
      check: '/^\d{4}$/'
    - name: quantity
      type: number
      check:
        - value > 0
        - rule: value <= 100
          message: At most 100 pieces per line item.
    - name: start
      type: date
    - name: end
      type: date
  checks:
    - rule: end >= start
      message: The end lies before the start.
```

A rule is a text or an object `{ rule, message }` with a message of its own; at a field a list of both forms is also allowed. The text of a field rule has one of three forms:

- A **regular expression** stands between slashes, optionally followed by flags, for instance `/^\d{4}$/` or `/^[a-z]+$/i`. The flags `g` and `y` are excluded. A slash in the pattern needs no backslash, because the pattern reaches up to the last slash.
- A **single word** is the name of a built-in rule. The application does not know any yet; an unknown name is dropped with a hint.
- **Any other text** is a condition of the query language in which the own value is called `value`, for instance `value > 0 AND value <= 100`. It must not name another field; a condition over several fields belongs under `checks`.

A rule under `checks` is always a condition of the query language. It names the fields by their names, regardless of upper and lower case.

Values are compared as in any query: a number as a number, a date and a time of day chronologically, also against a date of the form `date(2026-01-01)`, a text regardless of upper and lower case.

**One trap is worth knowing.** The query language does not know the words `true`, `false` and `null`; it reads them as field names, and the rule is dropped with a hint. A true/false value is checked with `value` alone or with `NOT value`, under `checks` with the field name alone or with `NOT` in front of it. Whether a field is filled is decided by `required` and not by a validation rule.

**No field rule checks an empty value**, nor a value that does not match its type; that one is already reported by the type check. The exception is the true/false value: its empty cell means «no», and `value` therefore requires a set tick. A rule under `checks`, by contrast, is always checked; a comparison with an empty field is then not satisfied. A rule that cannot be evaluated, for instance because of a division by zero, counts as violated.

**When the application saves, the rules act strictly.** What is checked is the record as it would stand after the change, with all of its fields and not only the changed ones. If it violates a rule, the change is rejected. For a field rule the message names the field, the value and the rule, for a rule under `checks` the record and the rule, and it appends the message text if the rule has one. Deleting checks no rule.

**When reading, they act leniently.** A value that violates a field rule is marked in the display like a value that does not match its type; the cell shows its text unchanged, the record stays visible, and nothing in the file changes. An empty cell of a field with `required` is marked in the same way. Rules under `checks` have no effect when reading, because they have no single cell that could be marked.

## Conditional editability

The setting `editable` at the top level of the container determines under which condition a record may still be edited, for instance so that a posted invoice stays unchanged:

```yaml
db-table:
  fields:
    - name: status
      values: [open, posted]
  editable:
    rule: status != "posted"
    message: A posted invoice is no longer changed.
```

The condition is an expression of the query language over the field names of the table, as text or as an object `{ rule, message }` with a message of its own. A table has exactly one condition; anyone who needs several combines them in the expression.

When the application saves, the following holds:

- The condition applies to **changing and deleting** a record. **Creating** always stays free.
- It is measured against the **saved** state of the record before the change, not against the new values. Anyone who resets the status in the same change is therefore still blocked.
- If the condition is not satisfied, the change is rejected. The message names the record and the condition and appends the message text.
- A condition that cannot be evaluated blocks.
- An unusable setting is dropped with a hint, and the table stays editable.

Without the setting every record is editable.

**The same setting on a field.** A single field carries `editable` in its own entry and can then be changed only under this condition; the record stays visible and editable in its other fields:

```yaml
db-table:
  fields:
    - name: book
      type: record
      editable: false
    - name: due
      type: date
      editable: NOT returned
    - name: returned
      type: boolean
```

- The condition has the same form as on the table, as text or as an object `{ rule, message }`, and may name any field of the table. `false` locks the field permanently, `true` releases it explicitly; both words apply only on a field, not on the table.
- It applies only to **changing**. When a record is created every field is free, and deleting is not affected. As on the table, it is measured against the saved state before the change.
- If a save changes the value of a locked field, it is rejected; the message names field, record and rule, for the permanent lock the rule «false». An unchanged value in a locked field is not an error. If the record is already locked under the condition of its table, only that message appears.
- While editing in the form and in a row of the list form, a locked field stays read-only, and a tooltip says that it cannot be changed at the moment according to the condition of the definition. Once the condition is satisfied after a save, the field is free the next time you edit.
- An unusable condition is dropped with a hint, and the field stays editable.

Editability and permissions work together and are still two different things: `editable` depends on the record and applies to everyone, permissions depend on the role (section «Permissions»).

## Display of the records

In reading view and in edit mode the block appears as a table with the columns of the definition. Every value is rendered according to the type of its column: numbers right-aligned and with the declared decimals, boolean values as a check mark, multi-line values with their line breaks. If a value does not match its type, the cell shows its original text and is marked in colour instead of being replaced.

From **2000 records** on, the view shows an excerpt and states underneath what it is an excerpt of. That is a window, not a silent truncation: you can see that there is more. The limit was measured, not decreed — up to it the table appears without a noticeable wait.

In the **portable export**, by contrast, the table is complete, without a window. A file you pass on must not withhold anything: the recipient does not have the application and would not see that something is missing.

Records are not edited in this view but in their **form**, which the next section describes; the button at the start of each row opens it. The table file is technical storage — it stays readable by hand and, in an emergency, correctable by hand, but in regular operation you do not work inside it.

## Editing records in the form

Every record has a **form**: a page of its own that shows its fields one below the other in the order of the definition, each with its label. The application generates it from the definition of the table; there is nothing to build. In the form you create records, change them and delete them.

### Opening and creating

An existing record is opened by the button **«Open record»** at the start of its row, in front of the button for the change records, in reading view as well as in Live mode. With the keyboard, the left arrow key leads to it from the change-record button.

From the result of a record query, a click on a record or on a reference opens the form as well (page [Perspective Query](frontmatter-query.md)). It shows the saved state, even if the query displays an unsaved one. In a list form, the click opens the form the list names (section «List form»). A reference to a record in the text of a document (section «Reference to a single record») and a record match of the search across the area (section «Findability: search and links») open the form as well.

Three ways create a new record:

- the button **«New record»** below every table, including an empty one,
- the button **«New record»** in the row of every table in the database overview,
- the command **«New record in the active table»** in the command palette. It acts on the table file in the active tab; if none is open there, the status bar says so.

The form opens as a tab of its own whose title names the file and the record. There is one per window: if you open another record, the same tab shows it. If the current editing has not been saved yet, the form first asks whether it should be discarded.

A new record receives its internal identifier as soon as the form opens: it stands in the header, and the high-water mark `lastId` of the table has already been advanced. The fields are empty, and the record only reaches the file with the first save.

### Reading and editing

The form opens **for reading**. The values stand there as text, a boolean value as a check mark, and a required field is marked as such. The header carries the actions **«Edit»**, **«Delete»** and **«Change records»**; the last one opens the change records of the record.

Behind them stands the action **«Show in table document»**. It opens the table file and brings the row of the record into view, even when the record is in a follow-up file: in reading view the display scrolls to its row, provided it is among the 2000 records the view shows; in the Live and Source view the cursor is placed on that row. For a new record the action is missing, because the record is not yet in the file.

**«Edit»** turns every field into an input in the form of its type:

| Type | Input |
| --- | --- |
| `string`, `link`, `record` | single-line text input, for `record` with value help |
| `multiline` | multi-line text input |
| `number`, `date`, `time` | input for a number, a date or a time |
| `boolean` | check box |

A value that does not match its type gets the plain text input instead, so that you can see and correct what stands in the file; a number input would otherwise drop it silently.

**«Save»** writes the change and returns to reading, **«Discard»** returns to the state that was read without writing anything. Only the fields you have changed are written. If you have changed nothing, there is nothing to save, and the status bar says so.

If a record cannot be edited under the condition of its table, **«Edit»** and **«Delete»** are missing, and a sentence in the form names the reason, with the message text of the condition if it has one. If your role does not allow changing, «Edit» is missing and the sentence names the role; if it does not allow deleting, «Delete» is missing (section «Permissions»).

### Reference fields and value help

A field of type `record` shows, when reading, the display form of its target and its identifier, for instance `Umberto Eco (r-00007)`, even when the short form `r-7` stands in the file. If the value does not hit exactly one record of the target table, a hint at the field says so.

When editing, the field offers a **value help**: a list of the records of the target table, each with its display form and identifier. Typing narrows the list, a selection enters the identifier, and the Escape key closes the list. If more than fifty entries match, the list says how many more there are.

You do not have to choose. A short form of the identifier or a value of the single-part business key entered by hand stays in place, and on saving the application writes the padded identifier in its stead, as described in the section «Relationships between tables». If the definition names no target table or it does not exist, the field is read-only.

### Messages and changes by others

If the application rejects a change, nothing is written; the form stays in editing, and your input stays in place. Every message stands where it belongs. If it concerns a field, it stands at that field, the field is marked, and the first affected field receives the focus. A violated rule under `checks` marks all of its fields and stands in the header of the form, as does every message that belongs to no field, for instance that of the deletion protection.

Even when reading, the form marks a value that does not match its type, violates a field rule or is missing as a required value, with a message at the field.

If someone has changed the record since the form read it, for instance by hand in the table file, the application does not save for the time being. The form then shows the block **«The record has been changed in the meantime»** with two ways:

- **«Reload»** discards your editing and shows the state that was found.
- **«Save anyway»** writes your version. A change record of the kind **Changed outside** holds the difference that was found, so that nothing disappears unnoticed.

The second way also checks all rules of the table; no rule can be bypassed with it.

### Deleting

**«Delete»** asks first: **«Delete this record?»** With **«Yes, delete»** the record is deleted, and the form closes; **«No»** leaves everything as it is. A record that a reference column still points to cannot be deleted here either. Which records refer to it, the usage further below shows in advance.

### The form as a file

The generated form can be designed. The command **«Save form as file»** in the header of the form writes it as an ordinary document next to the table file, under that file's name with the suffix ` Form`, so for `Customers.md` it is `Customers Form.md`. An existing file of that name is never overwritten. The new file starts with the generated version:

```markdown
---
title: Customers Form
db-form:
  table: Customers
---

# Customers

**Name:** {{field:Name}}

**Quantity:** {{field:Quantity}}
```

The container `db-form` names the table, and for every field a **field placeholder** `{{field:<name>}}` stands in the text. Around the placeholders everything is ordinary Markdown: a heading between two fields or an explanatory sentence appears in the form just as it stands in the file. A backslash in front of the curly braces turns a placeholder into ordinary text.

**Two meanings of `table`.** In the frontmatter of the database, in the container `db-form` as in the setting `options.table` of a reference column, `table` names a database table. In a block of the [Perspective Datatable](datatable.md), on the other hand, the line `table:` gives that datatable itself a name by which charts and links reach it. Only the word is the same: a datatable is not a database table.

The next time it opens, the form shows the text of the file. The header then says which file the form comes from, and the command is no longer offered; the database overview names the file in the column **«Form»**. If the file is deleted, the form shows the generated version again.

**What the file names is shown.** A field the file does not name is not shown by the form, and on saving it stays untouched; a new record fills only the fields that are named. A placeholder that is neither a field nor a value placeholder and a field name the table does not know stay as text and are reported, as described in the section «Faulty settings».

The **value placeholder** `{{value:<expression>}}` shows a value that the form computes from the fields of the record shown, such as `{{value:quantity * price}}` for the amount of an item or `{{value:lent + dur(14 days)}}` for the date fourteen days after the field `lent`. The expression is one of the [query language](frontmatter-query.md), as in a validation rule: it names fields by their name, a date field computes as a date, and the same operators and functions apply. The value appears as in a table query, a number for example as `7.5`, a date as `2026-10-15`, a duration as `10d` and a boolean as `true` or `false`. While editing, the form recomputes it with every input, without saving. The value itself is never saved; it is not a field of the record.

If the expression yields no value for a record, for example because a field is empty, the spot stays empty and is marked; a tooltip says so, and nothing is reported. An invalid expression, for example with a typo, leaves the spot empty as well and is reported with its line in the header of the form; the rest of the form stays usable.

**The value stands in the sentence** when the placeholder stands within a line of text: `Due on {{value:lent + dur(14 days)}}` shows «Due on 2026-10-15» in one line. If the placeholder stands alone on its line, the value gets a line of its own. A field placeholder always stands on a line of its own.

**Conditional sections.** A section between the markers `{{when:<condition>}}` and `{{end}}` appears only if the condition holds. Both markers stand alone on their line; a section therefore spans whole paragraphs, headings, tables, lists and the placeholders in them, never half lines. The condition is an expression of the [query language](frontmatter-query.md) over the fields of the record shown, as in a validation rule: `{{when:onloan}}` shows the section for a book on loan, `{{when:pages > 500}}` for a thick one. Sections may lie inside one another; an inner one appears only if the outer one appears as well. While editing, a section appears and disappears with every input, without saving; when reading, the saved state applies.

```markdown
**On loan:** {{field:onLoan}}

{{when:onloan}}
## Out on loan

**Loan note:** {{field:loanNote}}
{{end}}
```

**The condition affects only the display, never the value.** A field in a hidden section keeps its content and is saved along with the rest; the condition exempts it neither from saving nor from the validation rules. If a rule rejects such a field, the message stands in the header of the form and names the field; the section stays hidden. There is no else branch and there are no loops: an opposite case is written as a second section with the negated condition, such as `{{when:NOT onloan}}`. A backslash in front of the braces turns a marker into ordinary text as well.

**Reference paths.** Value placeholders and conditions also read the fields of the referenced record through a reference field: in a form for loans, `{{value:book.title}}` shows the title of the lent book, and `{{when:book.onloan}}` shows a section as long as the book is marked as on loan. Before the dot stands the reference field, after it a field of the target table. The application computes such a path after a short delay, and until the answer arrives, the previous value stays; while editing, the path follows every input, including the choice of another reference, without saving. If the reference is empty or matches no record, the spot stays empty and marked, without a message, and a section stays hidden. If the path names no reference field of the table or no field of the target table, the spot stays empty as well, and the form reports it with its line in the header.

**Line items.** The placeholder `{{list:<query file>}}` shows in the form the records of another table that point at the record shown, and saves them together with it; the section «Line items in the form» describes it.

**Form file and template.** A form file looks like a [template](templates.md), because both write their placeholders in double curly braces, and yet it does something else. A template is applied once: `{{date}}` is replaced by the date when a file is created, and afterwards text stands there. A form file is never applied: the form resolves `{{field:Name}}` and `{{value:quantity * price}}` against the record shown every time it is displayed, and the file keeps its placeholders. A form file therefore belongs next to its table and not in the templates folder.

### After a restart

If session restore is switched on (Help → Restore Session) and the form is open on exit, it returns at the next start: to its place among the open documents of its column, with the same record in the same form file. If it was the document shown in its column, it is again. A new record that has not yet been saved does not return. The path for «Back» starts anew after the restart.

**If the record no longer exists**, for instance because it was deleted between exit and restart, the form does not disappear. It shows the note that the record no longer exists in its table and that the form stays open until you close it, and carries the action **«Open table»** in its header, which opens the table file.

**If the database is switched off at start**, the form does not return, but its entry is not lost: it rests and is kept across further restarts as well. After switching the database on, the form returns to its place with the next start. If its column held nothing but the form, it returns in the remaining column, behind its documents.

### Several forms and the default form

A table can have several form files, for example a detailed one and a short one. Which one appears when a record is opened, the **default form**, is set by `form` in the table definition, with the name of the form file without extension, like the target of a wiki link:

```yaml
db-table:
  form: Customers Form
  fields:
    - name: Name
      type: string
```

Without the setting, the first form file of the table by path applies, and if there is none, the generated form; a single form file therefore works without any setting. The other form files remain forms of the table: a link from a form leads into them, as the next section describes.

In the database overview, the column **«Form»** names the default form of each table and after it the number of further form files, such as «+1 more». If the default form is deleted or renamed without the setting being updated, the overview reports it, and the rule without the setting applies again.

### Switching between forms

A link in the text of a form file, as a wiki link such as `[[Customers Short]]` or as a Markdown link, acts in the form according to its target:

- If the target is **another form file of the same table**, the form shows the same record in that form.
- If the target is the **form file of another table**, a sentence below the header says that a record is missing for it; nothing is opened or created.
- If the target is a **record**, as a wiki link such as `[[Customers#^r-00002]]`, the form shows that record in the default form of its table. If the reference matches no record unambiguously, it opens the table file; a Markdown link to a table file opens it as a document.
- **Any other link** opens its document, as everywhere in the application.

A filled **reference field** can be clicked when reading: a click opens the referenced record in the default form of its table. If the value matches no record, a sentence below the header says so, and the form stays where it is. An empty reference field cannot be clicked, and when editing, the field remains the input with value help.

Every change via a link, a reference field, a record reference in the text or «Used by» remembers the record it came from. **«Back»** above the heading in the header returns to it in its form, also over several steps; without a previous step the button does not appear. If you open a record from outside, for example from its row or from the overview, the path starts anew, and closing the form ends it. If the editing is not saved, the form asks before every change, also before «Back»: **«Discard»** changes, **«Keep editing»** stays with all inputs.

## Saving by the application

Records are created, changed and deleted in the form described in the section above. It saves through a path of the application that is the same for every change to records; what this section describes therefore applies to each of them.

Every change passes through a path that checks it before writing. A value that does not match the type of its field is rejected, and so is an empty field that requires a value. In both cases nothing is written.

On top of that come the rules from the definition of the table that are described in the sections above. A change is also rejected if

- the own **role** does not allow the operation on the table (section «Permissions»),
- a **business key** would afterwards be assigned twice,
- a **reference** hits no record or more than one, or its target table is missing,
- a record is to be deleted that is still **referred to**,
- a value or a record violates a **validation rule**,
- a **field** is changed that is locked under its own condition,
- a record is **not editable** according to the condition of its table, or
- the tables of the area have **not been fully read yet** and the change sets a reference or deletes a record.

The application reports the reasons from these rules together, not only the first one.

**A save operation takes effect completely or not at all**, even when it touches several tables and several files: afterwards either all of its changes are in place or none. It writes its change records within the same operation, and all change records of one operation carry the same **operation identifier**.

Before the new versions of the files take effect, the application flushes them through to the storage medium. A power failure or a dropped network connection therefore leaves no half-finished operation behind. (On Linux this holds with one restriction: there the application does not flush the folder entries separately, so a power failure at the very moment of saving can leave the operation unfinished until the area is next opened.) That takes time: a save operation lasts about a tenth of a second on a local disk, and a quarter to half a second on a network drive.

Anyone reading at the same time while a save operation is running may see an intermediate state, for instance the header of an invoice without its line items. That is a known case, accepted deliberately.

If a crash leaves a save operation unfinished, the application completes it at the next save in this area or when the area is opened. Until then the tables concerned accept no changes and say so in a message. Nothing is lost in the process.

## Change records

Whoever creates, changes or deletes a record through the application leaves a trail: next to the table file the application keeps a second file in which every one of these changes stands as a **change record**. It answers the question who changed which field, when, and from which value to which.

### What they are and where they live

The table file `Customers.md` has the file `Customers.mddl` beside it, in the same folder. The application creates it and keeps writing to it; you need to do nothing for that, and you should do nothing to it.

Five properties are worth knowing:

- It **appears in no file list** of the application and cannot be opened as a document. It is technical storage beside the table.
- It is **only appended to** and never rewritten. A record once written stays there character for character; the only operation that touches it is the merging described below.
- It **moves along** when you rename or move the table file inside the application, and it goes to the trash of the operating system together with the table when you delete it. From there you bring both back together.
- Whoever **changes or deletes it by hand** loses the trail irretrievably. There is no second store from which it could be restored.
- All change records of one save operation carry **the same operation identifier**. That keeps it recognisable in the file that several changes belong together, for instance the header of an invoice and its line items.

### The view at the record

In reading view and in Live mode every record row carries a button **«Show change records»** at its start. A click on it opens the page **«Change records»** as a tab of its own. Without a mouse, Tab leads into the table, the arrow keys change the row, Home and End lead to the first and the last one, and Enter or the space bar opens the page.

The page shows the change records of that record, the **most recent first**. Each one carries the point in time in your time zone, the kind (**Created**, **Changed**, **Deleted**), the user, the computer and, for every field touched, the value **Before** and **After**. A missing value is shown as «not present», an empty one as «empty»; the two are not the same.

Two kinds are marked separately:

- **Changed outside** means that the application found a difference at its next own write that it had not caused itself. No author is known then, and the record says so.
- **Merged** means that the merging has pulled a span of several changes together into one record. It names how many changes it replaces, how far back the span reaches and which kinds lay inside it.

Where the trail breaks, the page says so at the place where it stands out. There are two such situations. The previous value of a field **differs**, then the record does not connect to its predecessor. Or a record **cannot be read**, then what it changed is unknown, and the check starts afresh behind it. If the whole file cannot be read, the page says that too and leaves its contents untouched.

The page **only reads**, nothing is changed in it; the button «Refresh» fetches the state anew. With very many change records it shows an excerpt and writes above it what that excerpt is a part of.

### The merging

A file of change records grows with every change. So that it does not grow without bound, the application merges the oldest change records of heavily edited records once a double threshold is reached, instead of deleting them. Without an entry of your own, **0.7 MB** for the whole file and **200 change records per record** apply.

Both limits can be set for each table, in the front matter of the table file under the entry `changeLog`:

```yaml
---
db-table:
  fields:
    - name: title
  changeLog:
    maxBytes: 2000000
    maxPerRecord: unlimited
---
```

`maxBytes` is the size of the file in bytes, `maxPerRecord` the number of change records per record. The word `unlimited` switches the respective limit off. Every entry stands on its own, an omitted one keeps its default, and an unusable one is reported as a fault, upon which the default applies as well.

**The merging has a price.** A merged record says from which value to which a span led, how many changes it replaces and whether a creation or a deletion lay inside it. It no longer says who changed what, and when, individually; that part of the trail is gone afterwards. One promise holds without exception: nothing is ever merged across a record of the kind **Changed outside**. It ends the span and stays there unchanged.

### The limit, named honestly

A change that you make by hand in an editor on the table file produces **no** change record. The application does not see it at the moment it happens.

What it does instead: at its next own write it compares the state it finds with the state it expected. If they differ, it does not save the new change for the time being, so that the current version can be looked at; if the change is saved after all, a record of the kind **Changed outside** holds the difference. Nothing disappears unnoticed that way. The point in time and the author of that change, however, the record does not name, because neither of the two is known.

**On this route, permissions protect only the definition.** If you save a changed definition in the editor of the application, the application checks your role (section «Permissions»). A change to the record block, by contrast, it checks there neither against the role nor against the rules of the table, and with another editor neither of the two checks applies.

## Locks

A lock makes sure that a record is not edited in two places at the same time, for instance in two windows of the application. Locks and change records are designed to prepare for shared access by several people; that access will come with EM4us, the future server component. EM4me itself is a tool for one person working alone and locally. Using several computers in the same area on a network drive is not supported.

### What is locked, and when

What is locked is the individual **record**, at the very moment its editing begins. It is released as soon as the editing ends, on saving just as on discarding. Mere viewing locks nothing: otherwise a list of hundreds of records would lock all of them at once with every glance.

In the form, editing begins with **«Edit»** or with **«Delete»**, which takes the lock before its confirmation question. It ends on saving, with **«Discard»**, with **«Reload»**, when the deletion question is cancelled, when switching to another record and when the tab of the form is closed. If the application rejects a save, the lock stays, because the editing continues. Opening the form and creating a new record lock nothing. In a list form, the editing of a row begins with «Edit», the double click or «Delete» and ends with «Save», «Cancel», the answer to the deletion question and at the latest when the document is closed, the view is switched or another open document is shown; a new row locks nothing. A row in the line items section of a form keeps its lock until the form is saved or discarded.

When the **definition of a table** is changed, the definition is locked for that time, because a change to the columns touches every record of the table.

### When a record is already locked

The application never overwrites silently. It reports **who** holds the record, **on which computer** and **since when**, and leaves you two ways: **only read** the record or **break** the lock.

In the form this notice appears as the block **«The record is locked»**, and the form stays in reading. **«Read only»** closes the block. **«Break lock»** only appears once the span below has passed, and after the break leads straight into editing; if the lock has changed in the meantime, the break is rejected, and the block shows the freshly read details.

Someone else's lock can be broken only once it is **older than four hours**. The span is deliberately coarse: the clocks of two computers may drift apart without a running edit appearing orphaned. Even after the span has passed, the application never removes someone else's lock by itself. It only offers the break, and you decide. Whoever's lock was broken learns of that as soon as their own editing ends.

**Holder unknown.** If there is a lock that names no holder, for instance because it was written incompletely when it was created, the block says exactly that instead of inventing details. Here too you can only read the record, and the lock can be broken only once the same span has passed.

If **another window** of this application is editing the record, the block says that as well. There only «Read only» is offered, because the lock of one of your own windows cannot be broken.

### After a crash

If a lock of **your own** is left behind after a crash of the application, it does not stand in your way: the application recognises that the lock comes from this computer and that the program which held it is no longer running, and takes it over without asking. If, by contrast, a second window of the application holds the record, it counts as locked there as it does for anyone else.

### What a lock does not do

A lock is an agreement among the applications working in this area, not a property of the file. Whoever changes the table file by hand in an editor sees no lock. That is why the application additionally checks on **every** save whether the record still stands as it read it, even when it holds the lock.

### The lock folder

The locks live as small files in a folder in the root of the area, by default `.area-locks`. It comes into being with the first lock, and the application keeps it: it appears in no file list, not in the search and not in the statistics. Unlike the change records it holds nothing lasting. When nobody is working, it is empty and may be absent. During a save operation the application additionally places a small log of the operation there, which disappears again when the operation ends; if a crash leaves the operation unfinished, the log stays until the application has completed the operation. Delete nothing from it by hand while someone is working or a log lies in it.

You change the **name of the folder** under **File → Settings… → Current area → Database** in the field **«Name of the lock folder»**. The following applies:

- The name applies **to the area** and therefore to everyone working in it. It lives in the area file and travels with the area folder.
- The name **has to start with a dot**, because that is exactly how the application recognises that a folder does not belong in the index, the search and the statistics. Also inadmissible are path separators, characters forbidden on Windows and reserved device names such as `CON`, and nothing else may yet lie under that name in the root of the area.
- The change renames the existing folder instead of creating a second one. It succeeds only **as long as nobody is editing a record**. Otherwise the message names who is working right now, and everything stays as it was.

## Permissions

**Permissions prevent mistakes in operation, not misuse.** They are a working agreement like the lock and no promise of confidentiality. There is no read permission: anyone who can read the files of the area reads them with any editor and can change them there as well, without any role being asked. The only boundary that can be enforced is that of the operating system, that is, who may access the folder.

Within the application, permissions determine who may change what. For this the fact sheet carries named **roles**, and each role says per table which actions are allowed. The most important separation is the one between maintaining the data and changing the definition: whoever operates a delivered database as a data maintainer should not change its schema by accident. This helps even when only one person works with the database.

### Roles in the fact sheet

The roles stand under `roles` in the container `db-database`, next to them the default role and the assignment of login names:

```yaml
db-database:
  name: Library
  roles:
    librarian: all
    assistant:
      Books: [update]
      Loans: [create, update, delete]
  defaultRole: assistant
  users:
    mstumm: librarian
```

Each role carries either the word `all` or a mapping from table names to a list of the permitted operations:

| Operation | Meaning |
| --- | --- |
| `create` | create records |
| `update` | change records |
| `delete` | delete records |
| `define` | change the definition of the table |

The word `all` applies in three places: as the value of a role for all four operations on all tables, as a table name for all tables and as an entry of a list for all four operations. A table that a role does not name allows it nothing, and so does an empty list. Operations and table names apply regardless of upper and lower case, role names exactly as they are written.

**Without `roles` everything is allowed**, as in a database without permissions. The database overview shows the section **«Roles»** in the fact sheet block, with one line per role and its permissions per table. If a role names a table that does not exist or an unknown operation, the whole role counts as not set; the overview names each of its errors among the issues.

### Which role applies

Under `users` the fact sheet assigns a role to login names, and `defaultRole` names the **default role** for everyone else. What counts is the login name under which you are signed in to the operating system, the same one the change records name as the user. It is compared character by character: `MStumm` and `mstumm` are two names. There is no maintenance interface; the assignment is maintained by hand in the fact sheet, like the definition.

The first rule that matches applies:

1. Without roles everything is allowed.
2. If your login name stands under `users`, the role assigned to it applies.
3. Otherwise the default role applies.
4. Without a default role everything is allowed.

Which role applies to you is shown by the overview in the line **«Own role»**, with the login name verbatim: the assigned role, the default role or «everything allowed (no assignment)». Anyone entering an assignment is safest copying the name from there. If `users` or `defaultRole` names a role that does not exist, that setting counts as not set and is reported as well.

### Checked when writing

Every change to records runs through the path described in the section «Saving by the application», and there the application checks the role first, per record with table and operation. If the permission is missing, the whole operation is rejected, and the message names role, table and action. Starting a new record also requires `create`: without this permission the application rejects the new record, for instance with the command «New record in the active table», and the status bar names the reason. If the permissions cannot be determined, because the tables of the area have not been fully read yet or the fact sheet cannot be read, nothing is written either, and the message asks you to try again in a moment.

### Checked when saving the definition

The definition is the container `db-table` of a table file and the fact sheet `db-database`. If saving a file changes its definition, the application requires `define`: on that table for a table file, on all tables for the fact sheet. This applies when saving in the editor, to **«Save As…»** onto an existing or a new file and to area-wide replace. If the permission is missing, nothing is written. When saving, the error dialog **«Write error»** appears with a sentence that names role and table, and the text stays unsaved in the editor; area-wide replace lists the file in its report under **«Not replaced»**.

What does not touch the definition stays free: the record block and the rest of the text of the file, as well as form and query files. A different indentation or a different order of the settings does not count as a change, whereas the order of the fields does, because it determines the columns. The high-water mark `lastId` is kept up to date by the application itself; it never counts as a change.

### In forms and overview

The forms offer only what your role allows; whoever designs a form writes nothing into it for this.

- In the **form**, without `update` the action «Edit» is missing, the fields stay read-only, and a sentence names the role that may not change records of this table. Without `delete` «Delete» is missing.
- Without `create` the button **«New record»** is missing below the table and in the row of the table in the overview.
- A **list form** and a line items section offer only the actions that `allow` and the role permit together. If `allow` permits changing and the role does not, a tooltip of the row names the role; a row left without any action appears dimmed.
- The **overview** names the permissions of your role below each table, for instance «Permissions: create, change», provided the fact sheet carries roles.

The forms show, the decision is made when writing: whoever triggers an action by another route is rejected by the check above.

### Not locking yourself out

Whoever changes the fact sheet so that the own role does not have `define` on all tables can no longer change it in the application afterwards, not even back. That is the intended separation, but in single-user operation it hits you yourself. Three routes lead back: you open the file of the fact sheet with another editor and remove or correct the role settings there. You switch off the extension «Database», correct the fact sheet in the application and switch it on again; while it is switched off, saving checks no role (section «Switching the database off»). Or, before restricting roles, you assign your own login name under `users` to a role with `define` on all tables, for instance a role with `all`.

### Passing on and login names in the file

The roles are part of the definition and travel with the fact sheet. The assignment under `users` stands in the same file: the login names there are readable by anyone who can open the file, and a copy of the folder takes them along. The application offers no way of passing on that leaves the assignment out; whoever passes on an area removes the assignment beforehand if it is not to go along. At the recipient an assignment matches only if their login name is exactly the same; otherwise the default role applies to them or, without one, everything is allowed.

## Consistency check

When the application saves, every change is checked. Whatever reaches the files by another route, for instance by hand in an editor, nobody checks along the way, and some rules do not act on reading at all. The **consistency check** therefore goes through the whole stock and says where it contradicts the rules of the database.

It sits in the database overview: **«Check consistency»** in the header checks all tables, **«Check»** in the row of a table only that one. The command **«Check database consistency»** in the command palette also checks all tables; it opens the overview for that.

The result stands in the section **«Consistency check»** of the overview: the duration, per table the number of its records and findings, and below them the findings with table, record, field and a sentence in plain words. A click on the record opens its form. The list shows at most the first 500 findings and then says how many there are in total.

What is found:

- a business key that is issued more than once, with one finding per record involved, and an identifier that stands more than once in the table;
- a reference that hits no record, that hits several or that points via a key value to a table with a multi-part key, and a reference column whose target table is missing or not given;
- a value that does not match its type, violates a field rule or is missing as a required value, and a record that violates a rule under `checks`;
- a record with more or fewer cells than the table has fields;
- in a form file, an unknown field, an unknown placeholder, an invalid expression of a value placeholder, a marker of a conditional section without its counterpart, an invalid condition or an unknown table, and in a table definition a setting `form` that names no form file of this table;
- in a form file, in addition, a path that names no reference field or no field of the target table, and a line items section whose query file is missing or does not carry `editable: true`, whose line items have no reference field or no unambiguous one to the table of the form, or whose query cannot be extended by the relation;
- in a query file, an unusable setting in the container `db-query`, an unknown action in `allow` and a setting `form` that names no form file of the database; such a finding names the file instead of a table in the column «Source»;
- when all tables are checked, an unusable setting in the fact sheet under `roles`, `defaultRole` or `users`, for instance a role with an unknown table or operation or an assignment to a role that does not exist; the overview names the reason among the issues;
- as a hint, a table that holds records but no high-water mark `lastId` or one that is too low; the next new record then draws above the highest existing identifier and raises it;
- a table whose definition cannot be read; its records then stay unchecked, and the check goes on with the remaining tables.

**The check changes nothing.** It only reads, and a function that tidies up findings by itself deliberately does not exist: which of two records with the same key is the right one, you decide in the form. The result stays in place as long as the overview is open; after a correction you check again.

The check is fast: with a few thousand records it takes a few dozen milliseconds. If the index of the area is still being built, it says so and asks you to try again shortly.

## Usage of tables and records

The **usage** says who uses a table or a record. It is read only when you ask for it, and nothing is changed.

**For a table** the action **«Usage»** stands in its row of the overview. Under «Used by» it names the tables that point to this table with a reference column, each with the names of those columns, and the form files of the table. If nobody uses it, it says «Not used».

**For a record** the action **«Used by»** stands in the header of its form while the form is reading. It lists the records that refer to it, each with table, field, display form and identifier; a click opens the form of the referring record, and «Back» returns to the record shown. For a new record the action is missing, because nobody can refer to a record that has not been saved yet.

**The list at the record is the preview of the deletion protection.** It searches exactly like the check on deleting, including via the short form of the identifier, via the value of a single-part key and in the continuation files of a table. If a record stands in it, the one shown cannot be deleted. A record that refers to itself does not appear, because it does not prevent its own deletion. As with the deletion protection, only the reference column counts; a reference in running text, such as `[[Customers#^r-00001]]`, is not a usage.

## Findability: search and links

A search across the **area** finds records as matches of their own. In the «Search results» panel, behind the groups of the documents, each table has a group of its own with the name of the table and the addition «Records». Each row names the record with its display form and the field in which the search term stands, and shows its value with the match highlighted. A click opens the record in the default form of its table. The search covers the field values in all files of a table, including its follow-up files, and for an open table its unsaved state. The count above the list counts document and record matches together. While the replace row is open, the record groups are left out, because replacing across the area does not write into records.

The record block itself, by contrast, is not part of the full-text search space: a search term that stands only in the records of a table file yields no match for that document, only the record matches. The explanatory text above the data block stays searchable as a document, and a match behind it still leads to the right place. The reason lies with the area and not with the table: the search space keeps the texts of all Markdown files in memory and carries an upper limit across the **whole** area for that. Even a few tables of a few megabytes break it, and from then on every search reads from disk again, including every search across an ordinary document. The records in the search space would therefore cost not themselves but the whole area its speed.

Besides, three ways lead to records:

- **Search inside the open document.** Anyone who has the table file in front of them and searches inside it (default `Ctrl+F`) searches the text in front of them and finds its records unchanged. The limit above concerns the search across the area alone.
- **Run a record query.** A `perspective-query` block with `LIST RECORDS` or `TABLE RECORDS` finds records by their fields, for instance all books by one author; the [Perspective Query](frontmatter-query.md) page describes it. A query needed more often can be kept as a query file (section «Query files»).
- **Link to a record directly**, as described in the next section.

### Reference to a single record

A reference names the table and the internal identifier, written like a block anchor:

```markdown
[[Personen#^r-00042]]
```

**Two further spellings** hold as well: the short form of the identifier, `[[Personen#^r-42]]`, and the display form of the record, `[[Personen#^Anna Muster]]`. A display form in a reference consists of letters, digits, spaces and the characters underscore, hyphen, full stop, apostrophe, comma and round brackets; with any other character, such as `&`, it does not resolve. It is compared without leading and trailing spaces, but with regard to upper and lower case. The application does not rewrite the reference: what is written is what is saved.

**Resolution follows a fixed order.** If the table file carries a block anchor with exactly this name, the reference goes to it, and the linter points out that the block anchor hides a record; likewise the click leads to a heading of the same name. Otherwise the identifier comes first, long or short, then the display form. If several records carry the same display form, the reference still holds, the linter marks it as an ambiguous record name, and the click opens the table file; the identifier makes it unique.

**The suggestion list helps with writing.** After `[[Table#^` it offers, behind the block anchors of the file, the records of the table, each with its display form and the addition «Record», at most 30 entries together. Typing narrows the list by display form and identifier, and the selection writes the long identifier, for instance `[[Personen#^r-00042]]`.

The reference **holds** if the table named carries that record, and it is broken if it does not. It thus behaves like every other reference in the application. It also holds when the record is not in the first file of the table but in one of its follow-up files: for whoever writes it, the table is one, and how it is spread across files is none of their concern.

Checking is done against the **saved** state of the table, as with every other anchor. A reference to a record that has just been created and not yet saved therefore does not hold yet, and a changed display form only resolves after saving.

Whether a reference holds is shown by the [Markdown linter](tools.md): a broken target gets a wavy underline in the editor, that is in the Source, Split and Live view. The plain reading view does not depict validity; there, valid and broken references look alike.

**A click opens the form of the record**, in the default form of its table. The action **«Show in table document»** in the header of the form leads to the row in the table file (section «Reading and editing»). If a reference matches no record unambiguously, the click opens the table file. Outside an open area, the click opens the table file and brings the row of the record into view. In the result of a record query, a click on a record likewise opens its form.

**A reference in the text does not hold on to the record.** If the record is deleted, the reference breaks like every other reference in the application, and the linter shows it. The deletion protection is carried by the reference column alone (section «Usage of tables and records»).

## Query files

A query needed more often gets a document of its own: if it carries the mark `db-query` in its frontmatter and exactly one query block in its text, it is a **query file**. The rest of the text describes the query and appears as in any document.

````markdown
---
db-query:
minpages: 500
---

# Long books

Books with more than `minpages` pages, the longest first.

```perspective-query
TABLE RECORDS author, pages FROM "Books" WHERE pages > this.minpages SORT pages DESC
```
````

- **The mark is enough.** The file is recognised by the mark alone, `db-query:` without a value is enough; the query names its table itself in `FROM`. The query may address any level, files as well as records. With the settings `editable`, `form` and `allow` in the container, the file becomes a list form, which the next section describes.
- **Opening and embedding.** Opened, the file shows its result like any document with a query block. Another document embeds it with `![[Long books]]` and shows the same result, because `this.` then means the query file and not the embedding document. A query that reads values of the embedding document therefore does not exist.
- **Creating.** There is no command of its own for it: a query file is written by hand or from a [template](templates.md) of your own.
- **Without the mark**, a document with a query block stays a query in running text and does not appear in the overview.
- **In the overview** of the database, every query file stands in the section «Queries» (section «The area as a database»); no query block or several are reported among the issues (section «Faulty settings»).

**Two meanings of `editable`.** In the definition of a table, in the container `db-table`, `editable` is a condition that says for each record separately whether it may still be edited (section «Conditional editability»). In the container `db-query` of a query file, `editable` is a yes or no and turns the file into a list form. Both work together: a list form offers editing only for the rows whose record meets the condition of its table.

## List form

A query file becomes a **list form** when its container `db-query` carries the setting `editable: true`. It then shows its records as a grid in which rows can be opened, changed, created and deleted; the rest of the file's text describes the list as in any query file.

````markdown
---
db-query:
  editable: true
  form: Loans Form
  allow: [create, update, delete]
---

# Open loans

```perspective-query
TABLE RECORDS book, borrower, lent, due FROM "Loans" WHERE NOT returned SORT due
```
````

| Setting | Meaning |
| --- | --- |
| `editable` | `true` turns the query file into a list form. Without the setting or with `false` it stays an ordinary query file |
| `form` | the name of the form file without extension that a click on a row opens. Without the setting, the default form of the table applies |
| `allow` | the permitted actions as a list of `create`, `update` (change) and `delete`. Without the setting only `update` applies, an empty list permits none |

`form` and `allow` only take effect together with `editable: true`.

### Viewing and opening

In every view that shows the result, that is in the Rendered, Split and Live views, the grid stands in place of the result table: the same columns, the column «Record» in front, above it a count line such as «Rows 1 to 50 of 120». A page shows a fixed 50 rows; with more rows, **«Next»** and **«Back»** turn the pages.

A click on a row opens its record in the form that `form` names, otherwise in the default form of its table. If `form` names a form file that does not exist or that belongs to another table, the click also opens the default form, and the overview shows a hint among the issues of the query file. In a row that can be edited, a single click on an editable cell does not open the form, because there the double click begins the editing; the form is then opened by the column «Record» and by the read-only cells. If the query carries `WITHOUT ID`, the column «Record» is missing, and in such a row only a read-only cell opens the form. A reference in a cell opens the form of its target, as everywhere.

**Viewing locks nothing.** Otherwise a list with hundreds of records would lock them all with every glance; only the row whose editing begins is locked.

A list form reads exactly one table. Only the columns that name exactly one field of this table can be edited; a computed column, a path through a reference field and `record.id` stay read-only. The whole list stays read-only if it is grouped or chooses a display form with `DISPLAY`: a sentence says so, and below it the output appears as in any query. A query over files, blocks or tasks instead of records and a query whose hits come from several tables show the ordinary result table.

### Editing rows

If `allow` permits changing, the grid carries the column **«Actions»** at the end of the row. **«Edit»** there or a double click in the row begins the editing: the application locks the record, reads its current state from the file and turns the editable cells into inputs in the form of their type, as in the form. **«Save»** or the Enter key writes, in a multi-line field Shift+Enter makes a line break; **«Cancel»** or the Escape key discards. Merely leaving the row does not save. Writing takes the same path as in the form, with all rules of the table.

One row is edited at a time: as long as it is open, paging and the actions of the other rows are blocked. If the document is closed, the view is switched or another open document is shown, the editing ends without saving, and the lock is released.

If the application rejects the change, the row stays in editing. If the message concerns a field, it stands at its cell; a rule over several fields stands in the column «Actions». If someone has changed the record since the row read it, the same block as in the form appears below the row, with **«Reload»** and **«Save anyway»**. If another place holds the record locked, the notice from the section «Locks» appears below the row. If you have changed nothing, there is nothing to save, and the row returns to reading.

Whether a record may be changed is decided by the setting `editable` of its table **for each row**: a row whose record cannot be changed under this condition appears dimmed, without «Edit» and without «Delete», and a tooltip names the reason.

### Creating and deleting

With `create` in `allow`, the button **«New row»** stands next to the count line. It places an empty row at the top of the page shown, which shows «New» in the column «Record», and begins the editing there. The new record receives its identifier right away, as in the form; it reaches the file only with **«Save»**, and afterwards it stands where the sorting of the query places it, possibly on another page. **«Cancel»** removes the row again.

With `delete` in `allow`, every row that can be changed carries **«Delete»**. The application locks the record and asks below the row, like the form: **«Yes, delete»** deletes, and the list then shows the records without it; **«No»** leaves everything as it is. A record that a reference column still points to cannot be deleted here either: the message stands below the row, and the row stays.

Without `update`, «Edit» and the double click are missing, and a click on any cell opens the form; «New row» and «Delete» remain as far as `allow` permits them.

## Line items in the form

Besides the fields of its record, a form can show the records of another table that point at it, such as the line items of an invoice or the loans of a book. For this the form file carries the placeholder `{{list:<query file>}}` alone on its line, with the name of a list form without extension:

```markdown
**Title:** {{field:title}}

## Loans

{{list:Open loans}}
```

The **line items section** shows the grid of this list form, restricted to the records whose reference field points at the record shown. For this the application extends the query by that condition; columns, sorting and the other conditions of the query file still apply. If the table of the line items has exactly one reference field to the table of the form, that one is meant; if it has several, `{{list:<query file> BY <reference field>}}` names the one meant. In the middle of a line of text the placeholder stays text and is reported.

**While the form is reading, the section is read-only:** a click on a row opens the line item in its form. **While editing**, the section offers the actions that `allow` of the query file permits, like the standalone list. A saved row, however, is only **marked**: it shows its new state, a tooltip says «Marked; will be saved with the form.», and its lock stays; a row marked for deletion stays in place, flagged. A new line item gets the reference to the record shown without any input, even if that record is itself being created right now.

**It is saved with the form, all or nothing.** **«Save»** of the form writes the header and all marked line items in one operation. If a row of the section is still being edited, it is marked first; if it is rejected in doing so, the form does not save and says so. If the application rejects the operation, nothing is written, and everything stays; the message about a line item stands in the header of the form and begins with «Line item» and its number among the marked rows. After saving, all locks are released.

**«Discard»** discards header and line items together and releases all locks. A marked new row can be edited again, but not withdrawn on its own; it goes back only with «Discard». Marked line items count as unsaved editing: before switching to another record, the form asks.

If the section cannot be built, a hint with the line of the form file stands in its place; the section «Faulty settings» names the cases.

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
- **`roles`**, **`defaultRole`** and **`users`** carry the roles of the database, the default role and the assignment of login names; the section «Permissions» describes them. Without them everything is allowed in the database.

Each of these settings can be missing on its own, and none is a prerequisite for the tables: every table carries its definition itself and stays fully interpretable even without a fact sheet.

## The area as a database

As soon as one document in the stock of an area carries the fact sheet, the application treats that area as a **database area**. You do not declare it separately: the fact sheet is the declaration. The statement thus stands in one place instead of two that could contradict each other.

A database area gets two things an ordinary area does not have.

**The overview of the database objects** answers in one place what lies in this area: the fact sheet with name and description, the tables each with the number of their fields, the query files, and the issues from reading the definitions, in plain words instead of as a code. It opens as a tab of its own, and nothing is edited in the overview itself; its actions lead into the form and into the checks. Three ways lead to it:

- **View → Database overview**,
- the **context menu of the area panel**,
- the **command palette**.

In an area without a database none of these ways is offered.

In the list of tables, the column **«Form»** names the form file of a table and stays empty for the generated form. In addition the overview carries four actions: **«Check consistency»** in the header for all tables, and in the row of every table **«New record»**, **«Check»** and **«Usage»**. What they do is described in the sections «Editing records in the form», «Consistency check» and «Usage of tables and records». The section **«Queries»** names every query file with its name and its location, the folder relative to the root of the area, and **«Open»** opens it like any document; if the area holds none, an explanatory sentence stands there. The issues also include the hints on form and query files, named after the file. The column **«Kind»** of the section «Queries» tells an ordinary «Query» from a «List form» and names the permitted actions for the latter; if it permits none, it reads «List form, read only». In the fact sheet block the overview also names the own role and, if the fact sheet carries roles, these too with their permissions, and below each table the permissions of the own role (section «Permissions»).

**The settings section «Database»** sits in the navigation group «Current area» (File → Settings… → Current area → Database; with a book open the group is called **Current book**, with a bookshelf open **Current bookshelf**). It shows the same information in short form, that is name and description of the database, the number of its tables and the number of issues, and it carries one option: **«Show the overview when the area is opened»**. If it is set, the overview opens by itself as soon as the area is bound. The option lives in the area file and travels with the area folder. In addition there is the field **«Name of the lock folder»**; it is described in the section «Locks».

In addition, the application keeps the small file `Area_Database.mdda` in the root of the area. It holds the current count of the operation identifiers, appears in no file list and travels with the area folder; there is nothing for you to do with it. If it is missing, the application recovers the count from the change records.

## Faulty settings

The lenient line of the house applies to the whole definition: a faulty **individual setting** is dropped and reported, the entry stays effective; a faulty **entry** is dropped, the remaining columns stay. The message names the place, that is the affected column, the faulty setting and what was expected in its stead.

The one exception is the **type**: a type outside the set above causes the whole entry to be dropped, because a column without an interpretable type is not a column.

A setting the application does not know is dropped individually with a hint and does no harm.

For the entry `changeLog` of the change records three faults of its own apply. If `changeLog` itself is not an object, this table keeps no limits of its own, and the application defaults apply. If `maxBytes` or `maxPerRecord` is neither a whole number above zero nor the word `unlimited`, that single entry is dropped, and its default applies. Each of these is reported; none is passed over silently.

The same lenient line applies to the validation rules and to the editability condition, rule by rule. An unusable rule under `check` or `checks` is dropped individually, and the other rules, the field and the table remain; reported are an entry that is neither text nor an object with `rule`, an invalid regular expression, an invalid expression, a field rule with a reference other than `value`, an unknown rule name and a rule under `checks` that names an unknown field. If `checks` is not a list, all rules under `checks` are dropped. An unusable setting `editable` is dropped as well, and the table stays editable. A message text that cannot be interpreted is dropped on its own; its rule or condition goes on checking. An unusable setting `editable` on a field is dropped as well, and the field stays editable.

The same lenient line applies to form files. If the container `db-form` names no table, or one that does not exist in the database, the file stays an ordinary document. Both cases stand among the issues of the overview; several form files of one table, by contrast, are not an issue but the case of the section «Several forms and the default form». A placeholder that is neither a field nor a value placeholder and a field name the table does not know stay as text, and a value placeholder with an invalid expression leaves its spot empty; the form reports all three with their line in its header, and the consistency check lists them as findings. A marker `{{end}}` without an open section is skipped, a section without `{{end}}` shows its content as if it were outside the section, and a section with an invalid condition stays hidden; the form reports these three, too, with their line in its header, and the consistency check lists them as findings. A marker that does not stand alone on its line is no marker and stays text as an unknown placeholder. If the setting `form` of the table definition names no form file, one that does not exist for this table, or the form file of another table, a notice stands among the issues of the overview, and the default form without the setting applies; the consistency check additionally lists the last two cases as findings at the table. A path that names no reference field of the table or no field of the target table leaves its spot empty and is reported with its line in the same way. For the line items section there are five cases: the named query file does not exist; it does not carry `editable: true`; the line items have no reference field to the table of the form; they have several, and `BY` names none of them; or the query names no single table or cannot be extended by the relation. In the second case the section stays read-only, otherwise empty; each case stands as a hint with its line in the place of the section, and the consistency check lists it as a finding of the form file.

The same lenient line applies to query files. If a document with the mark `db-query` carries no query block or several, it stays an ordinary document, and every block in it is evaluated. The overview still lists it in the section «Queries» and names the case among the issues, named after the file. The same line applies to the settings of a list form, setting by setting: an `editable` that is not a truth value counts as `false`; a `form` that names no name is dropped; an `allow` that is neither an action nor a list falls back to `update`, and an unknown word in it is dropped on its own. `form` or `allow` without `editable: true` have no effect, and any other setting in the container is passed over. If `form` names a form file that does not exist in the database or that belongs to a table other than the one of the query, a click on a row opens the default form of the table. Each of these cases stands as a hint among the issues of the overview.

The same soft line applies to roles, default role and assignment in the fact sheet. A role with an unknown table, an unknown operation or a setting on a table that is neither `all` nor a list counts as not set, and each of its errors is reported. A default role or an assignment that names no existing role likewise counts as not set, and the next rule of the section «Permissions» applies. All of these cases stand among the issues of the overview.

If a table holds records but no high-water mark `lastId` or one that is too low, the application still issues no identifier twice: a new record draws the next number above the highest existing identifier and then updates the high-water mark. The consistency check names the case as a hint.

## Switching the database off

The entire database is an [internal extension](extensions.md) named «Database» in the category Tools and can be switched off with a single switch. It requires the [Property Profiles](property-profiles.md), because the shape of a table definition is described and checked through an internal profile; as long as the database is switched on, that basis therefore cannot be switched off.

When switched off, the following applies:

- The **record block stays an ordinary code block**, in the reading view, in edit mode and in the portable export. Its content stays readable; what is switched off is the display as a table, not the data.
- **Overview and settings section are dropped**, together with the access points in the view menu, in the context menu of the area panel and in the command palette. An overview that is already open stays until you close it, like any other system page.
- With the record block, its buttons **«Open record»** and **«New record»** are dropped, with the overview its actions **«Check consistency»**, **«Check»** and **«Usage»**, and the commands **«New record in the active table»** and **«Check database consistency»** disappear from the command palette. The **form** can thus no longer be reached either, and the application no longer supplies data to it, to the consistency check or to the usage.
- A **record query** no longer reads any table: it shows an empty list with the note that the extension is switched off, and no error message. The same applies to paths through reference fields, to hierarchies and to the tree.
- A **query file** stays an ordinary document: its query block is still evaluated, over records with the empty list and the note just described, and its section «Queries» goes away with the overview. A list form then shows no grid and offers no action.
- A **reference to a single record** is no longer marked as broken. Without definitions there is nothing to check it against, and a warning without a check would be a mere claim. A click opens the table file without jumping to the row instead of the form, and the suggestion list offers no records.
- The **search across the area yields no record matches**. Records stay excluded from the full text, because that boundary belongs to the table file and not to the switch; across the area, records then cannot be found.
- A **form** that was open on exit does not return at start. Its entry in the session rests and brings it back with the next start after switching on (section «After a restart»).
- **Roles, default role and assignment** stay mere frontmatter of the fact sheet, as does a setting `editable` on a field: there is no resolution and no check, not even when a changed definition is saved.
- **Nothing is written.** The application creates, changes and deletes no records, takes no lock and produces no change record; nor does it complete a save operation left unfinished while it is switched off.

**The files remain untouched.** Switching off takes away the interpretation, not the data: not a single character is changed, and switching it on brings everything back. The area index is rebuilt once in the process; in large holdings that takes a moment.
