# Applications, windows and areas

The app organizes your work on three levels: **applications** (independent working contexts), **windows** (any number per application) and **tabs**. This page covers multiple starts, window management, the title system, **areas** (a folder as the exclusive working space of an application) and **workspaces** (named, permanently stored applications with all their windows).

## Applications

The program can be started multiple times: each additional start of the program file creates a new application — an independent working context with its own windows and its own window numbering. "File → New application" does the same.

All applications run in one shared program process and share the settings. Session restore (Help → Restore Session) reopens all applications with their windows and tabs on the next launch.

## Unsaved drafts

New documents that were never saved (untitled tabs with content) survive quitting the app: their content is stored when the app closes and reopened as untitled tabs on the next start. This works independently of session restore, so it also applies when session restore is turned off.

The buffer only takes effect when the app or a window closes, not when a single tab is closed (Ctrl+W); a single draft is deliberately discarded through the save dialog. Already-saved files are unaffected and keep their save dialog on quit.

Turn it off under "Settings → Behavior" with "Keep unsaved new documents on quit" (default: on).

## Windows

Within an application you can open any number of windows: via the tab context menu ("Move to" / "Copy to" → "New window") a tab moves into a new window of the same application. With several windows open, the submenu lists all other windows as targets; as soon as several applications are running, the target entries carry the application context.

## Position of new tabs

A tab created **from within another one** opens immediately to its right. This covers every click inside a document's content — wiki link, query result, event source, journal navigation, diagram link — and likewise the document history, which appears next to the tab of its document. The connection between origin and target stays visible, and the way back is short.

If one action opens several files at once, they line up behind the origin in their own order. If the target file is already open, only its tab is activated; the order of the strip never changes for that.

All openings **without** an origin still go to the end of the tab strip: file dialog, command palette, bookmarks, panels, the area's file list, as well as the manual and the settings.

## Tab groups

Tabs can be combined into named, colored groups: the members sit together behind a colored **group header** in the tab bar, and their tabs carry an underline in the group color.

- **Create:** context menu of a tab → "New group with this tab". The group gets a default name and the next free color; the rename dialog with color choice (fixed eight-color palette, tuned for the light and dark theme) opens right away.
- **Fill:** "Add to group" in the tab context menu, or drag a tab onto the group header or between two members. "Remove from group" or dragging a tab out of the block ends the membership; groups always stay contiguous.
- **Move in sets:** when several tabs are selected (see "Multiple tab selection"), the three group entries of the context menu act on the whole selection, and dragging one selected tab onto the header makes the whole set join. It attaches to the end of the group block in its bar order; when leaving, it sits directly behind the block.
- **Follow-up files:** when a click within the content of a grouped document opens another file (wiki link, query result, event row, journal navigation), the new tab joins the same group, at its position next to the origin (see "Position of new tabs"). The block stays contiguous. Openings outside the document content — file list, panels, bookmarks, command palette, dialogs — stay ungrouped; target files that are already open are only activated.
- **Collapse:** a click on the header collapses the group — only the header with the member count remains visible. That also holds when the active tab is inside the group: it stays active, its content stays in the window, and the header carries the same marking as an active tab. The group only expands on a click; an activation from elsewhere (wiki link, command palette, keyboard tab switch) leaves it collapsed.
- **Hover instead of expanding:** hovering the header of a collapsed group brings up a list of its tabs after a short delay; a click in it switches to that file without expanding the group. The active tab is marked in the list, and unsaved files carry their change dot.
- **Manage:** context menu of the header — "Rename and color…", "Ungroup" (the tabs stay open), and "Close group" (all members with the usual save prompts). Dragging the header moves the whole group along the bar.

Groups belong to their tab bar (one per side in split view); a tab that moves to the other bar leaves its group. Name, color, members, and collapsed state survive session restore. The feature can be turned off as the "Tab groups" extension; the groups are preserved and reappear unchanged when it is turned back on.

## Multiple tab selection

Several tabs can be selected at once and then moved in a single step.

- **Select:** **Ctrl** and click adds a tab to the selection and removes it again, **Shift** and click selects the span from the active tab to the clicked one. Selected tabs are highlighted; the selection becomes visible from two members on.
- **Move:** dragging a selected tab moves the whole set, within the bar and onto a group header. Across the column boundary, however, only the dragged tab travels.
- **Context menu:** the group entries act on the selection as soon as the clicked tab belongs to it. Entries that mean exactly one file — rename, bookmark, move or copy to a window — stay with the clicked tab, as does middle-click to close.
- **End of the selection:** a click without a modifier key, switching the column, or closing the session. The selection belongs to a single tab bar and is not saved.

## Tab shape

Tabs and group headers have either square or rounded top corners (File → Settings… → Appearance). When rounded, a narrow gap replaces the vertical separator between tabs; the active-tab marker, the group color bars and the active-column indicator stay unchanged. The setting applies to the whole application and takes effect immediately in all open windows.

## Title system

The window title shows in parentheses where a window belongs — only as much as necessary:

| Situation | Title suffix |
|---|---|
| One application, one window | *(no suffix)* |
| One application, several windows | `(Window 2)` |
| Several applications, one window each | `(App 2)` |
| Several applications and windows | `(App 2, Window 3)` |
| Area application | `(Area Notes)` or `(Area Notes, Window 2)` |
| Workspace | `(Workspace Alpha)` or combined `(Workspace Alpha, Area Notes, Window 2)` |

Numbers close ranks when something is closed: if application 1 closes, application 2 becomes the new number 1; the same applies to window numbers within an application. Area applications carry no app number; they always show the name of their area folder. Workspaces show their workspace name, combined with the area name when an area is bound.

## Areas

An **area** binds an application to a folder: everything in this folder including its subfolders is the working space, nothing else. "File → Open Area…" picks the folder; "File → Close Area" ends the work in the area and closes all windows of the area application (with the usual save prompts). The binding is fixed: an area cannot be switched, only closed.

Three rules apply when opening:

- If the application is empty (no open file), it adopts the area.
- If the application already has an open file, a new application is created for the area.
- If the area is already running, focus jumps to a window of the running area application; the same area never runs twice.

**Demo-Area:** "File → Create Demo-Area…" copies a bundled English-language example collection — Markdown pages together with image and PDF attachments that demonstrate the most important functions — into an empty folder and opens it directly as an area: a sandbox for risk-free experimentation. Non-empty target folders are rejected, and existing files are never overwritten. The feature can be turned off as the "Demo-Area" extension; demo folders that have already been created are ordinary areas and remain unaffected.

### Hard boundaries

Within an area application the area is the boundary: the open dialog starts in the area and rejects selections outside it, "Recent" only shows area files, "Save As" only accepts targets inside the area, and no foreign file gets in via drag and drop either. Files from the file explorer always open in an application without an area.

Links whose target lies outside the area are marked with a warning underline; the tooltip shows the full target path. A click does not open the target but reports the reason in the status bar. Embedded images are still displayed even if they lie outside; the boundary applies to opening files, not to rendering.

### Search scope and index

In an area application the search scope for backlinks, tags, autocomplete and the linter covers the **entire** area instead of just the folder of the active file. So that the area is ready quickly when opened, the app creates the file **`Area_Cache.mdda`** in the area root folder. It is a pure cache of the index and can be deleted safely; it is rebuilt the next time the area is opened.

### Area panel

The "Area" panel shows the area as a folder structure in the sidebar (dockable left or right like any panel; the switch is the folder icon in the status bar or View → Panels → Area): the folder tree on top, below it the Markdown files of the selected folder; other file types do not appear. Clicking a file opens it as a tab, all entries show the full path as a tooltip, and external changes (file created, deleted, renamed) appear automatically. The "+" button at the head of the file list creates a new Markdown file in the selected folder and opens it. In a freshly opened, still empty area application the panel is visible automatically.

### Area statistics

"View → Area statistics" opens a figures page for the open area as its own tab; the same entry point sits in the context menu of the area panel. The page is read-only and shows six sections: **Files and storage** (Markdown and non-Markdown files split into images, PDF and other, folder count, storage used with its shares), **Properties** and **Tags** (the number of files per entry, sortable by name or count), **Companion files** (the `.mdd` per document and the area files `.mdda`), **Content** (tasks by state, wiki and Markdown links, aliases, files without an incoming link) and **Notable files** (the largest, the most recently changed and the most linked ones). Clicking a file name in the last three lists opens that file.

What is counted are **files, not occurrences**: if the tag `#project` shows 180, then 180 files carry that tag; how often it appears in their text is not stated. Long lists start with 25 rows and can be expanded in full.

The figures carry a timestamp at the top and are collected **on request**, not continuously: the "Refresh" button collects them again, as does invoking the menu entry once more. Without an open area there is no bounded set of files, so the entry is greyed out. The feature can be switched off as the "Area statistics" extension.

### Recent areas

"File → Recent Areas" lists the recently opened areas by their folder name. A click opens the area with the usual rules. Areas are restored with the session; if an area folder is missing at startup, the corresponding application is not restored and a notice is shown.

## Workspaces

A **workspace** is a named, permanently stored application: it comprises all of its windows with panes, tabs including their view settings, tab groups, an optional area binding and the unsaved drafts. An open workspace keeps its state up to date **automatically**, without any manual save step; when you reopen it, work continues exactly where it left off. Access: the submenu "File → Workspaces" with the list of all workspaces (the color dot also shows the state: filled = open, ring = closed) and the four actions below it; the same actions are available as commands in the command palette.

**Area and workspace are two different things:** an *area* binds an application to a **folder** and limits its working space (see above). A *workspace* is a named, reopenable **window collection** — a stored working state. Both can be combined: a workspace whose application has an area bound carries that binding along in its stored entry.

**Title bar color:** windows of an open workspace carry its color in the window title bar — a vivid variant in the light theme, a pastel palette variant in the dark theme, each with a matching title text color. The coloring follows the lifecycle: it appears on opening, changes immediately with the color in the management dialog, disappears on closing or deleting, and is dropped when the "Workspaces" extension is turned off. It requires Windows 11; without this support the standard title bar remains, and the app is unaffected.

### Lifecycle

- **Creating:** "Save as workspace…" names the running application with all its windows (the dialog asks for name and color; the colors come from the eight-color palette of the tab groups). "New workspace…" creates an empty workspace and immediately opens its first window.
- **Opening:** clicking a list entry restores all windows at their last state. The same workspace is never open twice; if it is already open, focus moves to its most recently active window.
- **Closing:** "Close workspace" (or closing the last window) freezes the state and closes all windows of the workspace. Unsaved changes to named files go through the usual save prompts; canceling stops the closing. Unsaved untitled tabs move into the stored entry without prompting and return the next time the workspace is opened.
- **Renaming and color:** at any time via "Manage workspaces…"; the window title follows immediately.
- **Deleting:** after a confirmation, removes only the stored entry, never Markdown files. A currently open workspace is not closed by this; it continues as an ordinary unnamed application, and its still stored drafts move into the general draft store.

### Management

"Manage workspaces…" opens a dialog with all workspaces: color dot, name, state (open or closed) and the time of the last opening. Each entry offers the actions **Open**, **Rename and color…** and **Delete**.

### Session restore and edge cases

With session restore active, the next start brings back the unnamed applications **and** all workspaces that were open when the app was closed. If restore is switched off, an empty window starts as usual; the stored entries remain fully intact and can be opened from the submenu at any time. If the bound area folder of a workspace is missing when opening, a notice appears and the opening is skipped; the stored entry remains unchanged.

The feature can be switched off as the "Workspaces" extension: the submenu, the commands and the management dialog disappear, while the stored entries and open workspaces remain untouched; switching it back on brings everything back unchanged.
