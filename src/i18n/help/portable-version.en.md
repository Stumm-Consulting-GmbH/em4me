# Portable version

EM4me comes as an installed and as a portable version. The portable version is not installed: it is a single program file that you start from any location, and it keeps everything it stores in a folder next to itself. This lets you carry it on a USB stick and use it on another computer without setting anything up there. The portable version is delivered for Windows; under Linux, EM4me keeps its data in the user profile.

## Starting

The portable version is the program file `EM4me-<Version>-Portable.exe`. Place it in a location where you have write access, for example in a folder of its own in your Documents folder or on a USB stick, and start it there.

Nothing is installed: neither an entry in the Windows program list nor an association of file extensions with EM4me is created.

## The data folder

At the first start, EM4me creates the folder `Data` next to the program file. It takes in everything EM4me stores: settings, session, drafts, your own interface languages, external extensions and temporary files. If the folder is already there, EM4me keeps using it.

**Therefore do not delete or rename the `Data` folder.** If it is missing at start-up, EM4me creates it again, empty, and begins as at the first start; whatever lay in the previous folder is then not used.

Taking it along means copying the program file together with the `Data` folder, most simply the folder in which both lie, for example onto a USB stick or to another computer. Settings and session come along with it.

## Where the data lies

In the portable version, "Help → About…" shows the line "Portable version – your data is stored in:" with the full path of the `Data` folder. The "Open data folder" button below it opens the folder in the file manager. In the installed version, the line and the button are absent.

## The first start

The portable version takes over nothing from the computer it runs on. Its first start begins with the default settings, even if the installed version is set up on the same computer: the portable version does not read its settings, recent lists and areas. It is the first start of a new setup — the product tour starts, and EM4me begins in the Beginner working mode ([Extensions](extensions.md)).

### Taking your own setup along

Whoever wants to keep using the setup of the installed version takes it along via an exchange file:

1. In the **installed** version, choose "File → Settings → Export…", select the data kinds you want and save the file, for example directly onto the USB stick.
2. In the **portable** version, choose "File → Settings → Import…", select the file, read the preview and choose "Apply".

Both paths belong to the extension "Settings export and import", which is only switched on in the Full working mode. In a freshly started portable version the submenu is therefore missing at first; it is switched on under "File → Settings… → Extensions", with the Full working mode or with the extension's individual switch. The same applies in the installed version if a smaller working mode is set there.

What the file takes along and what it does not is described on the page [Exporting and importing settings](setup-exchange.md). Your own interface languages and external extension packages are not part of it: an own language is loaded again in the portable version ([Your own interface language](custom-locale.md)), an extension package is copied into its extensions directory ([Creating extensions](extensions-dev.md)).

## When EM4me cannot write

If EM4me cannot create the `Data` folder next to the program file or cannot write to it, for example on a write-protected USB stick or in a protected system folder, it reports this at start-up with "EM4me cannot start" and quits. It then stores nothing anywhere, not even in the user profile as a fallback. The message appears in the language of the operating system, because the settings have not yet been read at that moment.

Remedy: place the program file in a location where you have write access, for example your Documents folder or a writable USB stick, and start it there.

## What the portable version leaves on the computer

The portable version is not installed. Everything EM4me stores lies in the `Data` folder next to the program file: settings, session, drafts and temporary files as well. Take the program file with the `Data` folder with you, for example on a USB stick, and you take everything with you.

**What the program file does at start-up.** At start-up, the program file unpacks the actual program into the Windows temporary folder and starts it from there; on quitting, it removes it again. If EM4me is terminated forcibly, for example via the Task Manager, this copy can remain there. This is a property of this form of delivery and concerns only the program itself, never your data.

Your documents lie where you put them. In the folder of an area that you open, EM4me creates its area files as usual.

**What Windows records.** Windows keeps its own records about every program; EM4me cannot switch this off. From them it can be read that EM4me ran on the computer, from which location it was started and which folders you visited in its file dialogs. These include, for example, the display name of the program, the remembered folder views and the last visited folder of the file dialog, a graphics cache and the modification time of two spelling files. The list is not complete. Contents of your documents and the names of your files appear in none of the measured records.

**What EM4me does about it.** The portable version adds nothing to the list of recently used files, remembers the last visited folder only while it is running, and adds no words to the dictionary; spell checking itself works as usual.

## What is different in the portable version

Two things deliberately behave differently in the portable version than in the installed one, because they would otherwise write or read outside the `Data` folder:

- **Dictionary.** Spell checking marks words and makes suggestions as in the installed version. Words cannot be added to the dictionary, however: the editor context menu does not offer "Add to dictionary", and under "Settings → Spell checking" the removal of individual words is absent. Both would write into the dictionary of the Windows user, that is onto the computer instead of into the `Data` folder. More about the check on the page [Tools](tools.md), section "Spell checking".
- **File dialogs.** After start-up, the dialogs for opening and saving begin in the "Documents" folder, unless the action itself proposes a location. EM4me remembers the last visited folder only while the program is running; after quitting it is forgotten, and the next start begins in "Documents" again. What Windows itself remembers about these dialogs, EM4me does not read.

The lists of recently opened files and areas within EM4me remain available; they lie in the `Data` folder.
