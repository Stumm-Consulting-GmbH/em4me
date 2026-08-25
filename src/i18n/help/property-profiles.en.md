# Property Profiles

Property profiles define property fields centrally for an area: per field a name, a type, optionally a fixed value range (single or multiple choice) and a default value. Profiles can inherit from each other (section «Inheritance»). The properties editor and the block properties panel suggest the defined fields, offer value ranges as pick lists and take the type from the definition. Profiles only exist in the area context: the configuration lives in the area file (Settings → Property profiles), the profiles themselves are regular Markdown files. The functionality can be toggled as the «Property profiles» extension (Settings → Extensions); without configuration or with the extension switched off, both editors behave as usual (type inference and standard suggestions).

## Profile files and definition format

A profile is a Markdown file in the configured profile folder; the profile name is the file name without the extension. The field definitions live in the frontmatter under the key `fields`, the file content below is free description:

```yaml
---
fields:
  - name: status
    values: [open, in progress, done]
    default: open
  - name: budget
    type: number
  - name: topics
    type: multistring
    values: [project, person, place]
  - name: due
    type: date
---
```

Attributes per definition:

| Attribute | Meaning |
| --- | --- |
| `name` | field name (required, unique per profile) |
| `type` | `string`, `multistring`, `number`, `boolean`, `date`, `multiline`, `link` (link to a file), `time` (time of day), `formula` and `lookup` (derived fields) or `object` and `objectlist` (structured fields); defaults to `string` |
| `values` | optional: fixed value range as a list of values (for `string`, `multistring`, `number` and `date`) |
| `multiple` | optional: several values — the value is a list. Applies to every type except `boolean` and `multiline`; only for the text field does the type switch to `multistring`, otherwise the type name stays (a link field with several targets is `link` with `multiple`) |
| `default` | optional: preset when the field is created via the editor |
| `valuesFrom` | optional: source of the value pool with `note` (path of a values note) and/or `query`; together with `values`, `values` applies |
| `options` | optional: type-specific settings as a sub-object, see the table below |
| `fields` | optional: nested child definitions following the same schema; served by `object` and `objectlist`. On any other type they remain permitted but have no effect |

A `multistring` field with `values` is automatically a multiple choice. **The field name is the only required property**: every other property is optional, and existing profile files remain valid unchanged. `valuesFrom`, `options` and nested `fields` are already part of the format but are not yet evaluated in this version (section «Limits»). Defective individual definitions (such as an unknown type or a duplicate field name) only suspend themselves; the remaining definitions of the profile stay effective. The profile list in the settings shows the hints written out under the respective profile — with the affected definition, the faulty property and what was expected in its place, for child definitions with the path to the parent field — and opens the profile file on click.

### Type-specific options

The sub-object `options` carries the settings that apply to one type only:

| Type | Setting | Meaning |
| --- | --- | --- |
| `number` | `step`, `min`, `max` | step size and limits of the number field |
| `date` | `shift` | shift in days; it presets an **empty** field on first focus, an existing date stays untouched |
| `link` | `restrictTo`, `display`, `sort` | folder path (or list) the suggestions are limited to; frontmatter field of the target as display name; order `name` or `path` |
| choice field | `control: cycle` | the single choice becomes a button that switches to the next value on click; the stored value stays the same as without the option |
| `formula` | `expression` | The calculation rule over the other fields of the same document |
| `lookup` | `from`, `relatedField` | Query narrowing the documents to ask (the whole area if omitted); field through which they point to this document |

An unknown or unsuitably filled setting is dropped individually with a hint; the field and the remaining settings stay effective. A setting intended for a later type may therefore already be present without causing harm.

## Value sets

The permitted value set of a choice field has three possible sources: the fixed list `values`, a **values note** or a **query**. `values` and `valuesFrom` exclude each other; if both are present, `values` applies and the profile list in the settings reports the contradiction.

```yaml
---
fields:
  - name: location
    valuesFrom:
      note: 90 Organisation/Values/Locations.md
  - name: project
    type: link
    valuesFrom:
      query: WHERE kind = "project"
---
```

A **values note** is an ordinary note with one value per line; its path is relative to the area. Empty lines and surrounding whitespace are dropped, a frontmatter block of the note is not part of the value set. It is refreshed like a profile file: a change takes effect without a restart, even when it comes from outside. That makes the value set ordinary content you can link, comment on and share.

A **query** delivers the values from the collection — the names of its matches. It is evaluated only once a field really needs its values, and remembered until the collection changes next; nothing is computed up front across everything. A document without a query field therefore costs no evaluation.

If a source is missing, empty or not evaluable, the **field stays usable**: the value set is empty, a note appears at the field, and custom values remain possible as everywhere.

## Assignment and default profile

Documents assign themselves via a frontmatter field; the field name is configurable per area (default `class`). The value is a profile name or a list of several profile names:

A document also finds its profile through a **tag** or its **folder**, without having to carry an assignment field. These bindings belong to the area and are set up under Settings → Property profiles: one row per profile, with its tags and its folder paths.

- **Tag**: it counts equally from the frontmatter (`tags`) and from the text (`#tag`) — for the assignment a tag is a tag. An unsaved change takes effect immediately as well.
- **Folder**: a bound path includes its subfolders, so that a later subdivision does not have to be maintained. The area-relative path is compared at whole folder names; «10 Projects Archive» therefore does not fall under «10 Projects».

```yaml
---
class:
  - project
  - person
---
```

In addition, a **default profile** can be chosen: its definitions apply to all files of the area, even without an assignment field. Profile names match regardless of case.

## Inheritance

A profile can inherit the definitions of another one. For this, the frontmatter of the profile file names at most one parent profile next to `fields`, and optionally field names to exclude:

```yaml
---
extends: project
exclude: [status]
fields:
  - name: phase
  - name: author
---
```

- `extends` names the parent profile; chains across several levels are possible, more than one parent profile does not exist.
- `exclude` excludes inherited fields. The exclusion applies within the inheritance chain it stands in, not for the whole document.
- An own field of the same name completely overrides the inherited one.

A cycle in the parent relation or a parent profile that does not exist only ends the affected chain and produces a hint in the profile list of the settings; the resolution keeps running.

## Internal profile

Alongside the profile files of the folder there is the **internal profile `Ereignis`** of the [Events](events.md) extension. It is automatically part of the profile resolution and of the profile list in the settings (marked as an internal profile there), defines the eight `event-*` fields and can neither be edited nor deleted; it is not offered as a default profile. It also works without a configured profile folder, with the default assignment field `class`; if a profile file has the same name, the internal profile takes precedence. With the Events extension disabled it disappears from resolution and list.

## Conflict rules

For a file, the union of all definitions from all profiles that reach it applies. The resolution is **one** ordered sequence in four steps, from the most explicit to the most general statement:

1. the **assignment field** of the document, in the order of naming
2. a **tag** of the document
3. the **folder** of the document
4. the **default profile** of the area

Per profile reached, first its own fields run, then those of its parent chain from bottom to top; each profile is processed exactly once across all steps. If more than one profile defines the same field name, the rules are deterministic:

1. The **first match of the sequence** wins — a path further up beats every path further down.
2. Among several profiles of the same step, the one named **first** wins (assignment list or order of the bindings).
3. Within a chain, the **inheriting profile** wins over its parents; an own field thus overrides the inherited one of the same name.

The paths **add to each other, they do not replace each other**: a document with an assignment field and a matching folder carries the fields from both. A path pointing at an already reached profile adds nothing — that follows from «each profile exactly once» and needs no rule of its own. And a contradiction between tag and folder is none: the order decides, there is neither a prompt nor a warning.

An example with four profiles: `all` (field `tags`), `project` (inherits from `all`; fields `phase`, `status`), `article` (inherits from `project`, excludes `status`; own fields `phase`, `author`) and `meeting` (fields `status`, `place`). A document with `class: [article, meeting]` and default profile `all` receives `phase` and `author` from `article`, `tags` via the chain from `all`, `status` and `place` from `meeting` — the exclusion in `article` only applies within its chain; via `meeting`, `status` still arrives.

## Profile symbol at the document

A profile can carry a **symbol** — a single character, usually an emoji, in the frontmatter of the profile file:

```yaml
---
icon: 📅
fields:
  - name: location
---
```

The header of the properties section shows the symbol of the profile that was resolved **first** for the document; the tooltip names it and the step it was found through. That is the actual purpose: as soon as tag and folder have a say, a document can carry fields of which nothing is stated in it — the symbol then answers why.

Without a profile or without a symbol nothing appears; no placeholder is created. An entry of more than one character is dropped with a hint, the profile stays effective.

## Effect in the editors

The definitions apply in the properties editor and identically in the block properties panel; blocks of a file inherit the resolution of their file.

- **Field suggestions**: «Add property» first shows the defined, not yet set fields (with the profile name as a badge), followed by the usual suggestions; «Custom field» at the end remains the free path. Selecting creates the field with the defined type and the default value.
- **Pick lists**: fields with a value range offer the defined values as a pick list (single choice) or as input suggestions of the chip bar (multiple choice); «Custom value…» still allows free input.
- **Type default**: defined fields show the defined type, the type switcher is locked and names the profile. If the existing value deviates from the type, the switcher stays free so the value can be converted to the defined type.
- **Link fields** offer the targets of the area as completion, mark a non-existent target and open it via the arrow — the same path as a click on a wiki link. With `multiple` they carry several targets in the chips bar.
- **Time fields** use the time control; the value is stored in quotes in the frontmatter, because `09:30` would otherwise be read as a number.
- Defined fields carry a subtle marker at the field name; the tooltip names the profile.

## Filling in all fields at once

The «Add property» suggestion menu is grouped by profile: under each **profile name** its not-yet-set fields appear indented, followed by the profile-less standard suggestions under «Other fields». A click on the **profile name** itself adds all still-missing fields of that profile in one step; a click on a single field still adds only that one.

The fill is deliberately additive:

- Only **missing** fields are created; existing values and the field order stay untouched, and no duplicates arise.
- A field with a default value receives that value; a field without a default is created empty per type: text, date and list stay empty, a number starts at `0`, a boolean at «false». You then edit the contents as usual.
- In the document frontmatter, empty fields appear as a plain key without a value (`field:`).

The whole fill is a single step and can be undone completely with one undo. It applies in the properties editor as well as the block properties panel and is gone when the «Property profiles» extension is switched off.

## Document field form

At the top the section shows the fields the document carries; below it an expandable area **“All fields of this document”** lists the fields its applicable profiles define and the document does not yet carry. Together the two answer in full what this document can carry; the union is split rather than duplicated, so no field appears twice.

**Origin per field.** Every field carries the symbol of the profile its definition comes from; the tooltip names the profile and the path. For an inherited definition that is the profile the definition really sits in — not the assigned one.

**The chain of applicable profiles** stands above the missing fields, because it answers the question the fields follow from in the first place. Each level shows the symbol, the profile name and the path by which the profile applies; inheritance depth appears as **indentation**. From the first inherited level onwards the line reads “inherited” instead of the path — an inherited profile applies by the same path as its child, and there inheritance is the statement that helps.

**Adoption per level.** Next to a level with missing fields sits a button that creates exactly those fields in one step: with a type-appropriate empty value, leaving existing values untouched and as a single undo step — the same path as filling in all fields at once. A level with no missing fields carries no button; it would promise an action that does nothing.

**A field the document does not yet carry stays out as long as it is empty.** Merely expanding the area therefore writes nothing into the frontmatter; only an entered value or the adoption turns the field into a field of the document.

With a broken frontmatter block the area does not appear — the same notice applies there as for “Add property”. It likewise does not appear without an applicable profile or with the “Property profiles” extension switched off; an empty area or a placeholder never appears.

**Three ways** lead to the form: the expandable area itself, the command “Open the document field form” and the entry “Open field form” in the tab context menu. The latter two make the section visible if it is hidden, expand the area and scroll it into view; the context menu entry refers to the tab that was clicked and activates it first.

## Per-profile view as a query

The question “which documents belong to this profile” is a query, and the command **“Insert profile query”** writes it out in full: it asks for the profile if more than one applies, and inserts an ordinary query block at the cursor position. No separate view is created — the output runs through the existing result display of the query language.

The generated query covers all three explicit assignment paths of the profile — the assignment field, every tag binding and every folder binding. A folder condition includes the subfolders, exactly as the binding itself does:

````markdown
```perspective-query
LIST
WHERE class = "project"
  OR icontains(file.tags, "project")
  OR (file.folder = "10 Projects" OR startswith(lower(file.folder), "10 projects/"))
```
````

Two cases differ:

- **The area's default profile** applies to everything that has no other assignment. For it the command therefore produces a query over all documents of the area instead of negating every binding — that would be long, opaque and would silently go wrong as soon as a binding is added.
- **Inheriting profiles stay out.** If `customer` inherits from `project`, customer documents do not appear in the query for `project`: they carry its fields but are not projects.

From then on the inserted block is ordinary content — it can be edited, extended with columns, sorting or a limit, moved and deleted like any other query. A document containing it is therefore also a saved view: it can be named, linked and bookmarked. Conversely: the query reflects the assignment **at the time it was generated**. If a binding is added later, the block already written does not follow; it is then generated again or extended by hand.

The command disappears when the “Property profiles” extension is switched off.

## Derived fields

Two kinds of field do not hold their value but receive it when displayed. A **formula field** calculates from the other fields of the same document, a **collection field** gathers the documents that point to this one through a named field:

```yaml
---
fields:
  - name: net
    type: number
  - name: tax
    type: number
  - name: gross
    type: formula
    options:
      expression: net + tax
  - name: items
    type: lookup
    options:
      from: FROM "Items"
      relatedField: project
---
```

A formula expression uses the same language and function set as a query column, including date and duration arithmetic; it may refer to any other field of the document, including another formula field. The order in the profile file does not matter.

**The value is not in the file.** It is produced when someone looks at it and disappears again afterwards — so opening a document does not change it, and the value is always current. In both property editors derived fields therefore appear as not editable, without a delete button and with a locked type; they are also never offered for adoption.

If a value stays empty, a note on the field says why: two fields refer to each other in a circle, a calculation rule names a field that does not exist here, the expression cannot be evaluated, or the rule is missing entirely. Nothing is ever blocked, and the other fields keep calculating.

A collection field queries the area index and is therefore only evaluated when displayed; the result holds until the content changes. A link counts in all notations — `[[target]]`, `[[target|label]]` and the bare name — and a link through an alias of this document matches as well.

**The trade-off is deliberate:** because a derived value is not in the file, it is not in the index either and carries no query condition. Where that matters, let the query calculate instead — it can do the same.

## Structured fields

A field can hold an **object** with named child fields or a **list of similar objects**. Without them, a "meeting with three participants" would need three parallel lists for name, role and company whose connection lies solely in their order:

```yaml
---
fields:
  - name: participants
    type: objectlist
    fields:
      - name: person
        type: link
      - name: role
        values: [Chair, Minutes, Guest]
---
```

The child definitions are nested and follow the same schema as the top level — they can carry any type, including another object, and have their own value ranges and options. An object type without `fields` is permitted; it then shows its value read-only.

Both property editors show such fields **stacked**: the child fields indented under their field, each with the control of its type; for a list every entry appears as its own group with a button to remove it, and below them one to add. A new entry starts empty, and **a child field that is not set yet stays visibly empty** instead of being prefilled — it is not written along either.

In the metadata block the values appear as an ordinary nested structure:

```yaml
---
class: Meeting
participants:
  - person: "[[Anna Example]]"
    role: Chair
  - person: "[[Bo Sample]]"
    role: Guest
---
```

They thus remain readable without the application. A child value that no definition explains is not lost in the process: it gets no control, but it is kept.

The same applies to the properties of a **paragraph** (block properties), with one difference: a structured value there does not appear in the area index and therefore carries no block query condition.

## Soft validation

Deviations never block and never change the value: a value outside the value range or a value that does not match the defined type merely produces a hint icon at the field; the tooltip names the reason. Markdown and frontmatter remain freely editable — including directly in the source.

## Limits

- A derived value cannot be fixed as an ordinary value; it stays calculated. There is no type for free nested content — the read-only display covers that.
- Renaming a profile file does not change the assignment values in the documents; they then point to a non-existent profile (the settings mark a missing default profile).
- Profiles live directly in the profile folder; subfolders are not included.
- The definitions apply in the two property editors. Field types that would be bound to a spatial canvas are deferred until there is one.
- Binding a profile to a bookmark group and assignment via a query are deliberately deferred; tag and folder cover the documented cases and stay explainable.
