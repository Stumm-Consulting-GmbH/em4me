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
| `type` | `string`, `multistring`, `number`, `boolean`, `date`, `multiline`, `link` (link to a file) or `time` (time of day); defaults to `string` |
| `values` | optional: fixed value range as a list of values (for `string`, `multistring`, `number` and `date`) |
| `multiple` | optional: several values — the value is a list. Applies to every type except `boolean` and `multiline`; only for the text field does the type switch to `multistring`, otherwise the type name stays (a link field with several targets is `link` with `multiple`) |
| `default` | optional: preset when the field is created via the editor |
| `valuesFrom` | optional: source of the value pool with `note` (path of a values note) and/or `query`; together with `values`, `values` applies |
| `options` | optional: type-specific settings as a sub-object, see the table below |
| `fields` | optional: nested child definitions following the same schema, reserved for structured types |

A `multistring` field with `values` is automatically a multiple choice. **The field name is the only required property**: every other property is optional, and existing profile files remain valid unchanged. `valuesFrom`, `options` and nested `fields` are already part of the format but are not yet evaluated in this version (section «Limits»). Defective individual definitions (such as an unknown type or a duplicate field name) only suspend themselves; the remaining definitions of the profile stay effective. The profile list in the settings shows the hints written out under the respective profile — with the affected definition, the faulty property and what was expected in its place, for child definitions with the path to the parent field — and opens the profile file on click.

### Type-specific options

The sub-object `options` carries the settings that apply to one type only:

| Type | Setting | Meaning |
| --- | --- | --- |
| `number` | `step`, `min`, `max` | step size and limits of the number field |
| `date` | `shift` | shift in days; it presets an **empty** field on first focus, an existing date stays untouched |
| `link` | `restrictTo`, `display`, `sort` | folder path (or list) the suggestions are limited to; frontmatter field of the target as display name; order `name` or `path` |
| choice field | `control: cycle` | the single choice becomes a button that switches to the next value on click; the stored value stays the same as without the option |

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

## Soft validation

Deviations never block and never change the value: a value outside the value range or a value that does not match the defined type merely produces a hint icon at the field; the tooltip names the reason. Markdown and frontmatter remain freely editable — including directly in the source.

## Limits

- The format already provides for type-specific options (`options`), value pool sources (`valuesFrom`) and nested child definitions; they are not yet evaluated in this version. Such a property is not an error, it simply has no effect until the expansion.
- Renaming a profile file does not change the assignment values in the documents; they then point to a non-existent profile (the settings mark a missing default profile).
- Profiles live directly in the profile folder; subfolders are not included.
- The definitions apply in the two property editors; calculated field types or types derived from other files are not part of the profiles.
- Binding a profile to a bookmark group and assignment via a query are deliberately deferred; tag and folder cover the documented cases and stay explainable.
