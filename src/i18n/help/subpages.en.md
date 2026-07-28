# Subpages

Pages can have subpages at any depth, for example `Process-A/Draft` or `Process-A/Implementation/Detail`. The hierarchy is a logical structure and independent of which folders the files live in. This also allows subpages with the same name under different pages, such as a `Draft` for `Process-A` and one for `Process-B`.

## Naming convention

The file name carries the hierarchy: the **subpage separator is `∕` (Unicode U+2215, "division slash")**. It looks like a slash but is allowed in Windows file names and practically never occurs in normal names — which is exactly what makes it unambiguous that a file is a subpage.

```text
Process-A.md                        page
Process-A∕Draft.md                  subpage of Process-A
Process-A∕Implementation∕Detail.md  second level
```

You never need to type the character: new subpages are created via **File → New Subpage…** (a dialog asks for the name; the file is created in the folder of the active file and opens as a tab). For creating files manually in the file explorer, copy the character from this page: `∕`

## Links to subpages

In wiki links you always write the normal slash; the app translates it into the file name. Relative targets point to the page's own subpage or its parent page and therefore work regardless of the current page's name:

```markdown
[[Process-A/Draft]]     opens the Draft subpage of Process-A
[[/Draft]]              Draft subpage of the CURRENT page
[[..]]                  parent page of the current subpage
![[Process-A/Draft]]    embeds the subpage
```

Resolution first looks for a real folder path (`[[subfolder/File]]` remains a path link), then for the subpage file — in the file's own folder and across the search scope. If both exist, the [Markdown linter](tools.md) marks the target as ambiguous. After `[[`, autocomplete suggests subpages in slash notation; after `[[/`, the subpages of the current page.

## Navigation

When a subpage is active, a **breadcrumb** above the document (reading, split and live view) shows the parent chain with clickable levels; intermediate levels that do not exist are dotted-underlined and not clickable. The **Subpages** sidebar section (View → Panels → Subpages, or the subpages icon in the status bar) lists the direct subpages of the active file; clicking opens them.

## Renaming

**File → Rename…** (also in the tab context menu) renames the active file. Open tabs, bookmarks, the recent-files list and the [history companion file](history.md) follow along.

- Renaming a page **with subpages** takes its whole subpage tree along; the dialog states the count beforehand.
- Renaming a **subpage** changes only its own name segment; the parent chain is preserved. This holds at both places, including the [title line](tools.md) above the document: there the parent part sits dimmed and unchangeable in front of the editable segment.
- **Change the full name:** The option of that name in the rename dialog also releases the parent name parts of a subpage. It is deliberately off by default, because a change there moves the page under a different parent page and affects all of its own subpages.
- **Update links:** The "Update links in other files" checkbox rewrites incoming wiki links, embeds and relative Markdown links to the new name; in the cascade also the references to every renamed subpage. A second checkbox shows a **preview** of the affected files beforehand; after the run a **report** summarises the renamed, updated and non-updatable files. The defaults are under Settings → Behavior → "Links when renaming".
- Open documents follow along; a document with **unsaved changes** receives the update in the editor as its own undo step, while on disk only the last saved state is updated.
- With the [document history](history.md) enabled, every update is traceable as a revision and can be undone; without history there is no rollback.
- In an area application the update covers the whole area; without an area the known search scope, and the linter remains the safety net for the rest.

## Detaching

**File → Detach from parent page…** (also in the tab context menu of a subpage) turns a subpage into a standalone page: `Prozess-A/Entwurf` becomes `Entwurf`.

- The dialog states the target and the number of **own subpages** that move along beforehand. `Prozess-A/Entwurf/Tief` becomes `Entwurf/Tief`, so the hierarchy below is preserved.
- **Links stay valid:** Incoming links are updated the same way as when renaming, with the same checkboxes for preview and report.
- The **target name can be changed in the dialog**. That helps when a file of that name already exists at the target level: nothing is renamed in that case, and a different name gets through on the second attempt.
- A slash is not allowed in the target name, because the result is a standalone page. Moving a page under a **different** parent page is not part of this; whoever needs it changes the full name in the rename dialog.
