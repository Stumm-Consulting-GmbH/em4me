---
title: Properties and Profiles
tags: [demo, metadata]
chapter: 5
topic: metadata
status: published
priority: 2
final: false
---

# Properties and profiles

Look at the very top of this file in the editor: a YAML **frontmatter** block carries the metadata. Back to [[00 Welcome]].

## Frontmatter

The block sits between two `---` lines and must be the first thing in the file — which is why it is shown here as a code block rather than live:

```markdown
---
title: Properties and Profiles
tags: [demo, metadata]
status: published
priority: 2
final: false
---
```

In Reading view it collapses to a single line with the field count; hover to expand it. The `tags:` and `status:` fields on this page are exactly the kind of thing [[08 Queries]] filters on.

## Editor view per document

Three frontmatter keys pin the editor view of a document, so the preference travels with the file — copy it to another machine and it still applies:

```markdown
---
fold-gutter: false
line-numbers: true
word-wrap: true
---
```

Only real `true`/`false` values count. Toggling folding, line numbers or word wrap via the statusbar or the View menu writes the new value straight into the frontmatter, which marks the file as modified; documents without these keys follow the global default under **Settings → Appearance**.

## The properties panel

Instead of editing YAML by hand, open the **Properties** sidebar panel (View → Properties). It shows each field as a form control, infers the type — text, list, date, number or boolean — and adds new fields via **+ Add property**.

## Property profiles

An area can define fields centrally so the panel suggests them with fixed value ranges. A profile is a Markdown file whose frontmatter lists the fields:

```yaml
---
fields:
  - name: status
    values: [draft, published, archived]
    default: draft
  - name: priority
    type: number
---
```

Documents opt in with a `class:` field naming the profile. Profiles can also inherit from each other: `extends` names a parent profile, `exclude` skips inherited fields, and only the field name is required — every other property is optional. The profile folder is set under **Settings → Property profiles** (an area setting), so it is a one-time setup rather than a shipped file. Without it, the panel still works with plain type inference.

Beyond the field name, a definition can carry type-specific options, draw its value set from a note or a query, and a profile can bind itself to a tag or a folder so documents need no `class:` field at all. Where a profile carries an `icon:`, the properties panel header shows it — that is how a document says which profile applies when nothing in it does.

Two more things sit on top of that. The properties panel has an expandable area **All fields of this document**, which lists the fields the applicable profiles define and this document does not carry yet, together with the chain of profiles that apply and where each one comes from; the fields of one level can be adopted in a single step. And the command **Insert profile query** writes out the query for a profile's documents at the cursor — an ordinary query block you can edit afterwards, which is why [[08 Queries]] is where it leads.

Two kinds of field go beyond a single stored value. **Derived fields** do not hold their value but receive it when displayed: `type: formula` calculates from the other fields of the same document, `type: lookup` gathers the documents pointing here through a named field. Neither is written to the file — opening a document never changes it, and the value is always current. **Structured fields** hold an object or a list of similar objects: `type: object` and `type: objectlist` carry nested child definitions, so "meeting with three participants" needs one field instead of three parallel lists. In the metadata block they appear as ordinary nested YAML and stay readable without this application.

On to planning: [[06 Tasks and Reminders]].
