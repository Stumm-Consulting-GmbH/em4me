# Property Profiles

Property profiles define property fields centrally for an area: per field a name, a type, optionally a fixed value range (single or multiple choice) and a default value. The properties editor and the block properties panel suggest the defined fields, offer value ranges as pick lists and take the type from the definition. Profiles only exist in the area context: the configuration lives in the area file (Settings → Property profiles), the profiles themselves are regular Markdown files. The functionality can be toggled as the «Property profiles» extension (Settings → Extensions); without configuration or with the extension switched off, both editors behave as usual (type inference and standard suggestions).

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
| `type` | `string`, `multistring`, `number`, `boolean`, `date` or `multiline`; defaults to `string` |
| `values` | optional: fixed value range as a list of values (for `string`, `multistring`, `number` and `date`) |
| `multiple` | optional, only with `values`: multiple choice — the value is a list, the type `multistring` |
| `default` | optional: preset when the field is created via the editor |

A `multistring` field with `values` is automatically a multiple choice. Defective individual definitions (such as an unknown type, a duplicate field name or `multiple` without `values`) only suspend themselves; the remaining definitions of the profile stay effective. The profile list in the settings shows such hints per profile and opens the profile file on click.

## Assignment and default profile

Documents assign themselves via a frontmatter field; the field name is configurable per area (default `class`). The value is a profile name or a list of several profile names:

```yaml
---
class:
  - project
  - person
---
```

In addition, a **default profile** can be chosen: its definitions apply to all files of the area, even without an assignment field. Profile names match regardless of case.

## Internal profile

Alongside the profile files of the folder there is the **internal profile `Ereignis`** of the [Events](events.md) extension. It is automatically part of the profile resolution and of the profile list in the settings (marked as an internal profile there), defines the eight `event-*` fields and can neither be edited nor deleted; it is not offered as a default profile. It also works without a configured profile folder, with the default assignment field `class`; if a profile file has the same name, the internal profile takes precedence. With the Events extension disabled it disappears from resolution and list.

## Conflict rules

For a file, the union of all definitions from the assigned profiles plus the default profile applies. If more than one profile defines the same field name, the rules are deterministic:

1. An **assigned profile** wins over the **default profile**.
2. Among several assigned profiles, the one named **first** in the assignment list wins.

## Effect in the editors

The definitions apply in the properties editor and identically in the block properties panel; blocks of a file inherit the resolution of their file.

- **Field suggestions**: «Add property» first shows the defined, not yet set fields (with the profile name as a badge), followed by the usual suggestions; «Custom field» at the end remains the free path. Selecting creates the field with the defined type and the default value.
- **Pick lists**: fields with a value range offer the defined values as a pick list (single choice) or as input suggestions of the chip bar (multiple choice); «Custom value…» still allows free input.
- **Type default**: defined fields show the defined type, the type switcher is locked and names the profile. If the existing value deviates from the type, the switcher stays free so the value can be converted to the defined type.
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

- Renaming a profile file does not change the assignment values in the documents; they then point to a non-existent profile (the settings mark a missing default profile).
- Profiles live directly in the profile folder; subfolders are not included.
- The definitions apply in the two property editors; calculated field types or types derived from other files are not part of the profiles.
