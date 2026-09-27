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

## Display of the records

In reading view and in edit mode the block appears as a table with the columns of the definition. Every value is rendered according to the type of its column: numbers right-aligned and with the declared decimals, boolean values as a check mark, multi-line values with their line breaks. If a value does not match its type, the cell shows its original text and is marked in colour instead of being replaced.

From **2000 records** on, the view shows an excerpt and states underneath what it is an excerpt of. That is a window, not a silent truncation: you can see that there is more. The limit was measured, not decreed — up to it the table appears without a noticeable wait.

In the **portable export**, by contrast, the table is complete, without a window. A file you pass on must not withhold anything: the recipient does not have the application and would not see that something is missing.

Records are not edited in this view but in their **form**, which the next section describes; the button at the start of each row opens it. The table file is technical storage — it stays readable by hand and, in an emergency, correctable by hand, but in regular operation you do not work inside it.

## Editing records in the form

Every record has a **form**: a page of its own that shows its fields one below the other in the order of the definition, each with its label. The application generates it from the definition of the table; there is nothing to build. In the form you create records, change them and delete them.

### Opening and creating

An existing record is opened by the button **«Open record»** at the start of its row, in front of the button for the change records, in reading view as well as in Live mode. With the keyboard, the left arrow key leads to it from the change-record button.

Three ways create a new record:

- the button **«New record»** below every table, including an empty one,
- the button **«New record»** in the row of every table in the database overview,
- the command **«New record in the active table»** in the command palette. It acts on the table file in the active tab; if none is open there, the status bar says so.

The form opens as a tab of its own whose title names the file and the record. There is one per window: if you open another record, the same tab shows it. If the current editing has not been saved yet, the form first asks whether it should be discarded.

A new record receives its internal identifier as soon as the form opens: it stands in the header, and the high-water mark `lastId` of the table has already been advanced. The fields are empty, and the record only reaches the file with the first save.

### Reading and editing

The form opens **for reading**. The values stand there as text, a boolean value as a check mark, and a required field is marked as such. The header carries the actions **«Edit»**, **«Delete»** and **«Change records»**; the last one opens the change records of the record.

**«Edit»** turns every field into an input in the form of its type:

| Type | Input |
| --- | --- |
| `string`, `link`, `record` | single-line text input, for `record` with value help |
| `multiline` | multi-line text input |
| `number`, `date`, `time` | input for a number, a date or a time |
| `boolean` | check box |

A value that does not match its type gets the plain text input instead, so that you can see and correct what stands in the file; a number input would otherwise drop it silently.

**«Save»** writes the change and returns to reading, **«Discard»** returns to the state that was read without writing anything. Only the fields you have changed are written. If you have changed nothing, there is nothing to save, and the status bar says so.

If a record cannot be edited under the condition of its table, **«Edit»** and **«Delete»** are missing, and a sentence in the form names the reason, with the message text of the condition if it has one.

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

The next time it opens, the form shows the text of the file. The header then says which file the form comes from, and the command is no longer offered; the database overview names the file in the column **«Form»**. If the file is deleted, the form shows the generated version again.

**Only the field placeholder is read.** A field the file does not name is not shown by the form, and on saving it stays untouched; a new record fills only the fields that are named. Any other placeholder and a field name the table does not know stay as text and are reported, as described in the section «Faulty settings».

## Saving by the application

Records are created, changed and deleted in the form described in the section above. It saves through a path of the application that is the same for every change to records; what this section describes therefore applies to each of them.

Every change passes through a path that checks it before writing. A value that does not match the type of its field is rejected, and so is an empty field that requires a value. In both cases nothing is written.

On top of that come the rules from the definition of the table that are described in the sections above. A change is also rejected if

- a **business key** would afterwards be assigned twice,
- a **reference** hits no record or more than one, or its target table is missing,
- a record is to be deleted that is still **referred to**,
- a value or a record violates a **validation rule**,
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

## Locks

When several people work in the same database area, for instance on a shared network drive, a lock makes sure that no two of them edit the same record at the same time.

### What is locked, and when

What is locked is the individual **record**, at the very moment its editing begins. It is released as soon as the editing ends, on saving just as on discarding. Mere viewing locks nothing: otherwise a list of hundreds of records would lock all of them at once with every glance.

In the form, editing begins with **«Edit»** or with **«Delete»**, which takes the lock before its confirmation question. It ends on saving, with **«Discard»**, with **«Reload»**, when the deletion question is cancelled, when switching to another record and when the tab of the form is closed. If the application rejects a save, the lock stays, because the editing continues. Opening the form and creating a new record lock nothing.

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

## Consistency check

When the application saves, every change is checked. Whatever reaches the files by another route, for instance by hand in an editor, nobody checks along the way, and some rules do not act on reading at all. The **consistency check** therefore goes through the whole stock and says where it contradicts the rules of the database.

It sits in the database overview: **«Check consistency»** in the header checks all tables, **«Check»** in the row of a table only that one. The command **«Check database consistency»** in the command palette also checks all tables; it opens the overview for that.

The result stands in the section **«Consistency check»** of the overview: the duration, per table the number of its records and findings, and below them the findings with table, record, field and a sentence in plain words. A click on the record opens its form. The list shows at most the first 500 findings and then says how many there are in total.

What is found:

- a business key that is issued more than once, with one finding per record involved, and an identifier that stands more than once in the table;
- a reference that hits no record, that hits several or that points via a key value to a table with a multi-part key, and a reference column whose target table is missing or not given;
- a value that does not match its type, violates a field rule or is missing as a required value, and a record that violates a rule under `checks`;
- a record with more or fewer cells than the table has fields;
- in a form file, an unknown field, an unknown placeholder or an unknown table;
- a table whose definition cannot be read; its records then stay unchecked, and the check goes on with the remaining tables.

**The check changes nothing.** It only reads, and a function that tidies up findings by itself deliberately does not exist: which of two records with the same key is the right one, you decide in the form. The result stays in place as long as the overview is open; after a correction you check again.

The check is fast: with a few thousand records it takes a few dozen milliseconds. If the index of the area is still being built, it says so and asks you to try again shortly.

## Usage of tables and records

The **usage** says who uses a table or a record. It is read only when you ask for it, and nothing is changed.

**For a table** the action **«Usage»** stands in its row of the overview. Under «Used by» it names the tables that point to this table with a reference column, each with the names of those columns, and the form files of the table. If nobody uses it, it says «Not used».

**For a record** the action **«Used by»** stands in the header of its form while the form is reading. It lists the records that refer to it, each with table, field, display form and identifier; a click opens the form of the referring record. For a new record the action is missing, because nobody can refer to a record that has not been saved yet.

**The list at the record is the preview of the deletion protection.** It searches exactly like the check on deleting, including via the short form of the identifier, via the value of a single-part key and in the continuation files of a table. If a record stands in it, the one shown cannot be deleted. A record that refers to itself does not appear, because it does not prevent its own deletion. As with the deletion protection, only the reference column counts; a reference in running text, such as `[[Customers#^r-00001]]`, is not a usage.

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

**The overview of the database objects** answers in one place what lies in this area: the fact sheet with name and description, the tables each with the number of their fields, and the issues from reading the definitions, in plain words instead of as a code. It opens as a tab of its own, and nothing is edited in the overview itself; its actions lead into the form and into the checks. Three ways lead to it:

- **View → Database overview**,
- the **context menu of the area panel**,
- the **command palette**.

In an area without a database none of these ways is offered.

In the list of tables, the column **«Form»** names the form file of a table and stays empty for the generated form. In addition the overview carries four actions: **«Check consistency»** in the header for all tables, and in the row of every table **«New record»**, **«Check»** and **«Usage»**. What they do is described in the sections «Editing records in the form», «Consistency check» and «Usage of tables and records». The issues also include the hints on form files, named after the file.

**The settings section «Database»** sits in the navigation group «Current area» (File → Settings… → Current area → Database). It shows the same information in short form, that is name and description of the database, the number of its tables and the number of issues, and it carries one option: **«Show the overview when the area is opened»**. If it is set, the overview opens by itself as soon as the area is bound. The option lives in the area file and travels with the area folder. In addition there is the field **«Name of the lock folder»**; it is described in the section «Locks».

In addition, the application keeps the small file `Area_Database.mdda` in the root of the area. It holds the current count of the operation identifiers, appears in no file list and travels with the area folder; there is nothing for you to do with it. If it is missing, the application recovers the count from the change records.

## Faulty settings

The lenient line of the house applies to the whole definition: a faulty **individual setting** is dropped and reported, the entry stays effective; a faulty **entry** is dropped, the remaining columns stay. The message names the place, that is the affected column, the faulty setting and what was expected in its stead.

The one exception is the **type**: a type outside the set above causes the whole entry to be dropped, because a column without an interpretable type is not a column.

A setting the application does not know is dropped individually with a hint and does no harm.

For the entry `changeLog` of the change records three faults of its own apply. If `changeLog` itself is not an object, this table keeps no limits of its own, and the application defaults apply. If `maxBytes` or `maxPerRecord` is neither a whole number above zero nor the word `unlimited`, that single entry is dropped, and its default applies. Each of these is reported; none is passed over silently.

The same lenient line applies to the validation rules and to the editability condition, rule by rule. An unusable rule under `check` or `checks` is dropped individually, and the other rules, the field and the table remain; reported are an entry that is neither text nor an object with `rule`, an invalid regular expression, an invalid expression, a field rule with a reference other than `value`, an unknown rule name and a rule under `checks` that names an unknown field. If `checks` is not a list, all rules under `checks` are dropped. An unusable setting `editable` is dropped as well, and the table stays editable. A message text that cannot be interpreted is dropped on its own; its rule or condition goes on checking.

The same lenient line applies to form files. If the container `db-form` names no table, or one that does not exist in the database, the file stays an ordinary document. If a table has several form files, the first by path applies, and the others are not used. These three cases stand among the issues of the overview. A placeholder that is not a field placeholder and a field name the table does not know stay as text; the form reports them with their line in its header, and the consistency check lists them as findings.

## Switching the database off

The entire database is an [internal extension](extensions.md) named «Database» in the category Tools and can be switched off with a single switch. It requires the [Property Profiles](property-profiles.md), because the shape of a table definition is described and checked through an internal profile; if the basis is switched off, the database goes off with it.

When switched off, the following applies:

- The **record block stays an ordinary code block**, in the reading view, in edit mode and in the portable export. Its content stays readable; what is switched off is the display as a table, not the data.
- **Overview and settings section are dropped**, together with the access points in the view menu, in the context menu of the area panel and in the command palette. An overview that is already open stays until you close it, like any other system page.
- With the record block, its buttons **«Open record»** and **«New record»** are dropped, with the overview its actions **«Check consistency»**, **«Check»** and **«Usage»**, and the commands **«New record in the active table»** and **«Check database consistency»** disappear from the command palette. The **form** can thus no longer be reached either, and the application no longer supplies data to it, to the consistency check or to the usage.
- A **reference to a single record** is no longer marked as broken. Without definitions there is nothing to check it against, and a warning without a check would be a mere claim.
- The **search across the area stays unchanged**. Records stay excluded from the full text, because that boundary belongs to the table file and not to the switch; the section «Findability» above therefore continues to apply.
- **Nothing is written.** The application creates, changes and deletes no records, takes no lock and produces no change record; nor does it complete a save operation left unfinished while it is switched off.

**The files remain untouched.** Switching off takes away the interpretation, not the data: not a single character is changed, and switching it on brings everything back. The area index is rebuilt once in the process; in large holdings that takes a moment.
