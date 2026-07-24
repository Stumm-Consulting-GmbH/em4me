# Bookmarks

Bookmarks keep frequently used files within reach, no matter which folder is currently open. They live in their own sidebar panel as a tree of folders and file entries. There are two kinds: **general bookmarks**, which apply across the app, and **area bookmarks**, which belong to an [area](apps-windows.md) and travel with it.

## The bookmarks panel

The “Bookmarks” panel is toggled like any sidebar panel: via the status-bar star, the View → Panels → Bookmarks menu (default `Ctrl+Shift+L`) or a shortcut you assign yourself. The toggle acts on the active column; side, order and tab groups follow the rules of the [sidebar](sidebar.md). The status-bar star also shows whether the active file is already bookmarked.

A click on an entry opens the file. If a bookmarked file is missing from its expected location, the entry says so instead of leading nowhere. Even in the empty app state with no open document, the list stays usable, so bookmarked files can be opened directly.

## Two sections: general and area-bound

While an area is open, the panel splits into two sections with their own headings: **Area bookmarks** and **Bookmarks**. Without an open area, the panel shows only the general bookmarks, with no section headings, that is, in the familiar single-section layout.

- **General bookmarks** live in the app-wide settings and store absolute paths. They are always available.
- **Area bookmarks** belong to the open area and live in its area file. Their targets are stored relative to the area root; they appear only while the area is open and disappear from the panel again when the area is closed.

Which section is on top is set by the “Area bookmarks on top” option (Settings → Behavior). By default the area bookmarks are on top; turning the option off puts the general ones on top. Without an open area the setting has no visible effect.

## Why relative paths

An area bookmark does not remember its target as a full path but relative to the root of the area, with forward slashes. This keeps the bookmarks valid when the whole area folder is moved or copied to another machine: they are resolved fresh against the current area root every time the area opens. For this relativity to hold, an area bookmark can only point to files inside the area. A target outside the area is not possible; the app rejects it.

## Adding bookmarks

### General bookmarks

The active file is bookmarked via the File menu (default `Ctrl+D`) or the star. If no area is open, or the file is outside the open area, a general bookmark is created without asking.

If, however, an area is open and the active file is inside it, `Ctrl+D` opens a small choice menu at the star with the targets “General bookmark” and “Area bookmark”. That way it is clear on every addition which section the bookmark goes into.

### Area bookmarks directly

Two context menus create an area bookmark without the detour through the target choice:

- The **file row in the area panel** offers “Add as area bookmark” on right-click; the files there are inside the area anyway.
- The **context menu of a file tab** offers “Add as general bookmark” and, while an area is open with the file inside, additionally “Add as area bookmark”.

## Converting between the sections

An existing bookmark can be moved to the other kind via its context menu: “Convert to area bookmark” or “Convert to general bookmark”. This also works for a whole folder including its subtree, which is then carried over with structure and order.

When converting to an area bookmark, the app checks whether all affected targets are inside the area. If they are not, the whole operation is rejected and points out that the conversion contains targets outside the area. This keeps the relative-path rule intact.

## Organizing and maintaining

Both sections share the same tools. The right-click menu of an entry creates new folders and subfolders; entries can be renamed, moved into a folder and removed. Folders contain folders again, so the collection can be structured freely.

Drag-and-drop sorts within a section and files entries into folders. Dragging deliberately stays within its own section: an entry is not dragged across the boundary between area and general bookmarks. To switch sections, use conversion.

When a bookmarked file is renamed within the app, or its folder is renamed, the bookmarks follow automatically, in both sections: the general model via the absolute paths, the area tree via the relative ones.

## Without an open area

Without an open area, only the general section is visible, with no heading and no area section. The area bookmarks are not lost then but wait in the area file; as soon as the area is opened again, they reappear in the panel.
