# Your own interface language

The interface comes in five built-in languages. Anyone who needs a sixth — a regional language, a language no program serves, or simply the wording of their own field — translates it themselves. The path has three steps: **download the template**, **translate it in your own editor**, **load it back in**. After that your own language sits in the language selection of the status bar alongside the built-in ones. All the paths are in the File → Your own language menu: "Download template…", "Load…", "Remove…" and "Update…".

The operating paths belong to the "Your own interface language" extension ([Extensions](extensions.md)); in the disabled state the submenu is absent. A language already loaded is untouched by this: it is still read and stays selected. The disabled state takes away a path, never a language.

## Downloading the template

"File → Your own language → Download template…" writes the complete text inventory of the application into a JSON file; the familiar save dialog asks for location and name. The template always carries **English**, regardless of the language set: English is the reference version against which a translation is measured later.

The file is a flat directory of keys and texts. At the very top sit two empty entries with which the language names itself; below them the English inventory follows entry by entry:

```json
{
  "@@locale": "",
  "@@name": "",
  "toolbar.open": "Open",
  "view.source": "Source",
  "view.split": "Split",
  …
}
```

The key is on the left, the text on the right. **Only the right-hand side is translated.** The keys stay unchanged — they are how the application finds its texts again.

What the file is called, by contrast, carries no meaning. It may take on any name when copied, downloaded a second time or renamed; which language it carries is written **inside** it and not in its name.

## Translating it in your own editor

The file is ordinary JSON and can be edited in any editor that saves text as UTF-8. Four things deserve attention.

### Naming the language

The two entries at the top are empty so that they are recognizable as an invitation:

- `@@locale` is the **code** of the language: two or three letters, optionally with a script or region suffix, so `nds` or `nds-DE`. What is checked is the form, not the existence — anyone translating a language no standard lists should still be able to name it. A code belonging to a built-in language is not permitted: your own language stands **beside** the built-in ones, it replaces none.
- `@@name` is the **display name**, exactly as it is to appear in the language selection, at most 40 characters. It is customary to give the name of the language in that language itself.

### Placeholders

Some texts carry placeholders in curly braces, such as `{name}` or `{n}`. The application inserts a value there at runtime — a file name, a count. Placeholders are carried over **unchanged**: same spelling, same set. Their **position in the sentence**, by contrast, is free, because no two sentence structures are alike.

### Markup

Part of the texts carries Markdown markup because it appears in a table in the manual: a word in code type, more rarely a link or an emphasis. The rule for it reads: a translated text may carry exactly the **kinds** of markup the original carries at **the same** entry — not the same number. Where the original has one code span, there may be two; where it has no link, none is added. And a link points at an ordinary target: `http`, `https`, `mailto` or a target inside the manual.

### Incomplete is allowed

A translation need not be finished to take effect. It is enough for the file to carry at least one known entry; everything else may stay English and be added later. What is missing appears in English — see the section "What is not yet translated".

## Loading and checking

"File → Your own language → Load…" asks for the file. The check runs **before** anything is stored: size and structure, then every entry for a text as its value, for unchanged placeholders, for permitted markup and permitted link targets, plus the two naming fields.

Two assurances apply here:

- **A rejection names the entry** it hangs on, along with the reason — for instance that the placeholders of a particular key differ from those of the original. That makes the spot findable in the editor instead of having to comb through the whole file.
- **Nothing is taken over by halves.** If the check finds a violation, the existing inventory stays untouched; no language comes into being that consists half of the file and half of nothing.

If the check passes, the confirmation names the language and the number of entries taken over. Keys the application does not know — leftovers from an older template — are skipped and counted in the same confirmation.

If your own language with the same code is already loaded, **the application asks first**; cancelling is the default. Replacing overwrites the previously loaded version; the file it came from stays untouched.

## Selecting your own language

It is selected like any other: through the language selection in the status bar ([Views and display](views-display.md)). Your own languages sit there in a group of their own, "Your own languages", below the built-in ones, carrying the name from `@@name`.

The choice takes effect immediately and everywhere: in the window, in the menus and in the dialogs of the operating system, and it does so in every open window. It persists across a restart — your own language is a setting like any other.

If the language file should ever be unavailable, the setting nevertheless stands: the interface shows English, and a hint says which of your own languages is missing. Once the file is back, the language takes effect again without further action.

## What is not yet translated

If an entry is missing from your own language file, the application shows the **English** text — entry by entry, not page by page or dialog by dialog. This is intended and not a fault: a half-translated interface is usable from the start, and the work can be done in stages.

So anyone who has set their own language and sees English labels beside it is seeing the **gaps in their translation** and not a program error. They close as soon as the entries concerned are in the file and it has been loaded again.

## After a new program version

An application that grows brings in texts that a file translated earlier cannot know. Your own language ages as a result, and the application says so: a hint in the status bar names the language and the **number of missing entries**. It appears once per state — the same state does not report again, whereas a changed number or a different program version does.

"File → Your own language → Update…" provides the means for it. The path saves your own language file at the state of the running version: naming and your own translations remain, and the missing entries stand in their place in English. Translate what is still English and load the file back in. The difference from the template is the source alone — here your own language instead of English.

A dialog offers the loaded languages for selection, even if there is only one; this is independent of which one is currently set. The confirmation names how many entries in the saved file are still English. If no language of your own is loaded at all, a hint says so instead of an empty dialog.

## Removing

"File → Your own language → Remove…" offers the loaded languages by name for selection; cancelling is the default. What is deleted is the language file in your user profile — the file it was loaded from stays where it lies.

If the removed language is the one currently set, the interface switches to English. That is the difference from the missing file above: whoever takes a language away themselves should not be reminded of it at every start.

## Where the language file lies

On loading, the application stores a copy in your **user profile**, in the `locales` folder beside its remaining data. Three assurances follow from that:

- Your own language **survives a reinstallation** of the program; it lies outside the program directory.
- **Nothing is written into the program directory.** The path therefore requires no elevated rights and also works where the program directory is write-protected.
- The stored file is **the same kind of file** as the one loaded: it carries its naming onwards and is named after the language code. Anyone wanting to back it up or pass it on copies it.

The file is read anew at every start and checked anew in the process — the folder is reachable with an editor, which is why checking does not happen only on loading.

## What the feature does not do

Three limits belong here so that expectations are right:

- **The manual stays in the five built-in languages.** What is translated is the interface, not the documentation; with your own language set, the manual pages appear in English.
- **There is no translation aid.** The application suggests nothing, translates nothing itself and checks no linguistic correctness. It checks the **form** of a file, not its content.
- **There is no exchange point.** Finished languages cannot be obtained from a collection point. A language file is an ordinary file and goes the way of any other: by storage medium, as an attachment, through a shared folder.
