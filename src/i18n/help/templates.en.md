# Templates

Templates are ordinary Markdown files in a configurable **templates folder**. When applied, the app evaluates curated **placeholders**: date and time with offset and format, title and folder of the target file, input and selection dialogs, the clipboard, and a cursor target position. Templates create new files with a ready-made structure or insert recurring building blocks at the cursor position; **folder rules** fill new files automatically.

The functionality can be toggled as the "Templates" extension (Settings → Extensions); when off, the commands, the settings section, the folder rules, and the exclusion of templates from queries disappear.

## Templates folder

The templates folder is configured in the settings (Settings → Templates):

- **Globally**, the app-wide folder is the basis for all windows.
- **Per area**, a dedicated configuration can be set ("Use area configuration" in the "Templates" entry of the "Current area" navigation group, only visible when an area is open; with a book open the group is called **Current book**, with a bookshelf open **Current bookshelf**); it is stored in the area file and **overrides the global one completely** (folder and rules, no mixed resolution). Folder entries are relative to the area root; absolute paths remain allowed.

Every Markdown file in the folder (including subfolders) is a template. Subfolders appear as groups in the picker popup. Configuration changes take effect immediately, without a restart.

**Templates in queries.** Whatever lies in the templates folder, subfolders included, is a hit in no [Perspective Query](frontmatter-query.md), at none of its levels, and supplies no values for value sets and collection fields of the [Property Profiles](property-profiles.md) either. So the content of a template, such as a sample task, appears in no overview. To query templates, name the folder explicitly in `FROM`, for instance `FROM "Templates"`. What counts is the folder that also determines the template picker, that is the area configuration before the global one; the templates folder of a linked area does not count.

## Applying templates

Two paths lead to a template:

- **New File from Template** (File menu → More File Functions): pick a template in the filterable popup, assign a file name (`/` creates a subpage), answer the dialog chain. The file is created with the filled content in the folder of the active file (without an active file in the area root; without either, a folder dialog asks for the target), opens as a tab, and the cursor jumps to the first `{{cursor}}` target.
- **Insert Template** (editor context menu → Insert): the filled result is inserted at the cursor position as a single editing step (one undo removes everything).

Multiple input and selection placeholders appear **one after the other** in the order of their first occurrence; identical questions are asked only once. Cancelling any dialog aborts the whole application: no file and no inserted text is created.

## Placeholder reference

Placeholders are written in double curly braces. `\{{` writes a literal `{{` into the template.

| Placeholder | Effect |
| --- | --- |
| `{{date}}` / `{{time}}` | date or time of applying (`2026-07-09` or `14:30`) |
| `{{date:+7d}}` | date with offset; units of the query language (`s`, `min`, `h`, `d`, `w`, `mo`, `y`, also combined: `1d 12h`), sign optional |
| `{{date::dd.MM.yyyy}}` | date with a custom format; tokens `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` plus `MMMM`/`MMM` (month name long/short), `EEEE`/`EEE` (weekday name long/short) and `d`, `M` (no leading zero), names follow the interface language (like the query function `dateformat`); square brackets keep text literal: `{{date::EEEE[, the] d MMMM yyyy}}` → "Wednesday, the 12 August 2026"; offset and format combine: `{{date:+7d:dd.MM.yyyy}}` |
| `{{time:-30min:HH:mm:ss}}` | time takes offset and format as well |
| `{{title}}` | title of the target file (for subpages the logical form with `/`) |
| `{{folder}}` | folder of the target file (root-relative within an area) |
| `{{prompt:Question}}` | input dialog; optional default value: `{{prompt:Question:Default}}` |
| `{{select:Question:a,b,c}}` | selection dialog with the options `a`, `b`, `c` |
| `{{clipboard}}` | current clipboard text |
| `{{cursor}}` | cursor target after applying; multiple numbered targets with `{{cursor:2}}`, the lowest is the jump target |

Example template:

````markdown
# {{title}}

Date: {{date}}, next appointment: {{date:+7d:dd.MM.yyyy}}
Topic: {{prompt:Topic}}
Priority: {{select:Priority:High,Medium,Low}}

## Notes

{{cursor}}
````

Unknown placeholders or broken parameters abort the application with a status bar message; no half-filled file is created.

## Folder rules

Folder rules fill new files automatically: each rule maps a **target folder** to a **template** (Settings → Templates). When a file is created via the app (area panel, new subpage), the template runs with full placeholder evaluation, including dialogs.

- The **deepest matching folder wins**; subfolders count as matches. An empty folder entry is the root rule.
- The **templates folder itself is excluded** — new templates stay empty.
- If you explicitly choose "New File from Template", the chosen template takes precedence; the rule does not apply additionally.
- Cancelling a dialog creates the file **empty** (the creation itself was intended) and shows a hint.
- Files created outside the app (for example in the file manager) do not pass through the rules.
