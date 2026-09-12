# Exporting and importing settings

Your own setup is work: color schemes, keyboard shortcuts, the layout of the format toolbar, custom buttons and macros, the arrangement of the sidebar, template rules, bookmarks. This setup can be **written to a file** and **read back in** elsewhere — on a second machine, after a reinstallation or as a backup before a larger rebuild. Both paths sit in the File → Settings menu: "Export…" and "Import…". The feature belongs to the "Settings export and import" extension; in the disabled state the submenu is absent.

A third use case stands alongside them on equal terms and has nothing to do with backups: **passing on a single [calendar system](custom-calendars.md)** from one [area](apps-windows.md) to another.

## Exporting

"File → Settings → Export…" opens a selection. It carries one row per data kind with its name and the number of its entries; only what actually contains something is offered. Everything is preselected — the most common case is the complete backup. Anyone who wants to take less along unticks selectively; without a single selection no file is created, and the selection stays open with a hint.

Then the familiar save dialog asks for location and name. A descriptive name with the day's date is suggested.

These data kinds are available:

| Data kind | Content |
|---|---|
| Settings | Behavior and appearance: language, appearance, editor and view options, automatic saving, history, attachments, export options, the configuration of tasks, reminders and calendar display as well as the column preferences of the panels |
| Color schemes | the schemes you created yourself together with the assignment of which one applies in light and which in dark mode |
| Keyboard shortcuts | your own reassignments of the commands |
| Format toolbar | your own layout of the button bar |
| Status bar buttons and macros | your own access points in the status bar, the context menu section, the hide list and the macros you built yourself |
| Extension on/off state | which extensions are switched on and which are switched off |
| Sidebar arrangement | panel choice, order, tab groups and widths together with your own layout variants |
| Template folder and rules | the template folder and the ordered chain of folder rules |
| Bookmarks | the tree of the general bookmarks with folders and entries |
| Calendar systems of the area | the time reckoning blocks of the open area |

### Selecting a single calendar system

Calendar systems are the one exception in this list: they do not belong to the app but to the open area, and therefore travel with its folder anyway. They stand here because their **passing on** is a purpose of its own — anyone who has built up a calendar system should be able to give it to another area without it being rebuilt there.

For that, this row has two levels: below the data kind stands **a row of its own for each block**, with its name and the number of its time reckonings, each with its own tick. The same path thus carries both cases — all blocks for the backup, a single one for passing on. The switch of the data kind says "all" or "nothing" and switches its blocks along with it; if only some are selected, it shows an indeterminate state.

What is chosen is the **block**, not the single time reckoning. The reason lies in the model: time reckonings of the same block can be mapped to one another, and a derived time reckoning builds on another one of **its** block. A time reckoning taken out on its own would tear that connection; a whole block takes it along untouched.

Without an open area the data kind does not appear at all — there are none then.

## What never goes along

Only what belongs to the data kinds above is written out. Everything else stays behind, and not by accident but as an assurance:

- **Access secrets of any kind never go along.** The storage space in which an external extension keeps its own data is excluded from the export as a whole — even when nobody knows what is in it. Precisely because the app does not know this content, it is not passed on. Their on/off state, that is whether an extension is switched on or off, does go along; that is setup and not a secret.
- **Session state** such as open tabs, window size and position as well as the recent lists. They carry absolute paths of the machine of origin, which point nowhere else.
- **Machine-bound entries** such as the workspaces and areas that are set up with their paths, the introductions already seen and the decision whether a particular external extension is trusted on this machine. That decision is to be made per machine; taking it along would mean anticipating it elsewhere.
- **Running states** such as alarm, timer and stopwatch.

Nor can any person be read from the file itself: the header names program and version, not user or machine.

## The file

The exchange file is an ordinary **Markdown file**. That is deliberate: it can be opened in this app, read in any editor, compared and versioned. Its header names the version of the format, the moment of the output and the origin; below it follows a section of its own per data kind, with a heading and a code block whose content carries the values.

````text
---
em4me: "setup"
formatVersion: 1
created: "2026-09-09T10:43:12Z"
origin:
  program: "EM4me"
  version: "…"
---

## Color schemes

```json em4me:colorSchemes
{ … }
```
````

The field `em4me` marks the file as a settings file of this app and protects against accidentally choosing an arbitrary Markdown file when reading in. The entry after the marker in the code block — here `em4me:colorSchemes` — names the data kind of the section. The headings above them are there for the reader; the data kind is read from the marker.

## Importing

"File → Settings → Import…" asks for the file. The dialog is not bound to an open area — a settings file typically lies precisely outside, on a stick or in the downloads folder.

**Nothing is written straight away.** First a **preview** appears which names, per data kind, what would happen: what is added, what is replaced, what is renamed and what is skipped. Only "Apply" carries it out; afterwards a report shows the same list as the result. The preview also holds the "Back up current state…" button, which writes the current state of the affected data kinds into a file of its own before anything is changed.

Nothing is passed over silently: every deviation from the straightforward case stands in the preview and in the report.

### What happens to existing values

**One** rule applies to all data kinds:

> What you created as a named object is added. What is a setting or an arrangement is replaced.

Added are therefore your own color schemes, the macros, the layout variants of the sidebar, the bookmarks and the calendar blocks: they step **alongside** what is there, and the existing stock is not touched in the process. Replaced are the settings, the keyboard shortcut assignment, the format toolbar, the template rules and the on/off state of the extensions: a value knows no plural, and two interleaved arrangements would yield a third that nobody set up.

**With an identical name the existing entry stays unchanged**, and the one read in comes alongside it with a distinguishing addition: "Sample" becomes "Sample (2)". The preview names every such renaming by name. References follow along — a macro read in that receives a new identifier is still found by its button.

Two special cases follow from the object: a bookmark to a file that is already remembered is skipped instead of being created twice — a bookmark folder, by contrast, always comes along as a whole, because it is your ordering work. And a calendar block whose definition is incomplete is rejected and named, instead of creating half an entry.

Some of the settings only take effect after a restart of the app; the preview says so when that is the case.

### Files from a different program version

A file from an **older** version is read. That is exactly what the path is meant for: a backup that could no longer be read in after the next program update would miss its purpose. Data kinds that no longer exist by now appear as skipped — they are reported, not concealed.

A file from a **newer** version is read as well, with a hint: whatever this version does not know is skipped and named. The same applies within a known data kind whose structure has changed — whatever does not fit the expected form is discarded and listed in the preview, instead of letting foreign structure into the settings.

If the file is damaged or not a settings file at all, the app says so and writes nothing.

## Passing on a calendar system

The path as a whole, as an example:

1. In the **source area** choose "File → Settings → Export…".
2. Remove all ticks except the one for the desired calendar block and save the file.
3. Open the **target area** and choose "File → Settings → Import…" there.
4. Choose the file, read the preview, apply.

The block then stands in the target area alongside what was already there, and its time reckonings can be used in the document straight away. If it carries the name of an existing block — the normal case when the same system already arrived there once — the existing one stays and the new one appears with its addition.

Writing always goes into the area that is currently open. If none is open at all, the data kind is skipped and the reason is named.
