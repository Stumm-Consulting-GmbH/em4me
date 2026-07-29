# Attachments

An attachment is a file that belongs to a document: a screenshot, a report, a spreadsheet. Pasting or dragging one in no longer means saving and linking it by hand. The file is stored, and the matching reference appears in the text.

## Pasting an attachment

A file or image from the clipboard is inserted with `Ctrl+V`. The file is stored at the configured location, and the reference appears at the cursor.

An image becomes an image reference, any other file a plain link:

```markdown
![Minutes_20260729-143022](Minutes/Minutes_20260729-143022.png)
[Report](Minutes/Report.pdf)
```

`Ctrl+Shift+V` remains plain pasting and stores nothing.

## Dragging an attachment in

A file can also be dragged in from the file manager. Where it is dropped decides the outcome:

| Drop location | Result |
|---|---|
| Editor pane | Attachment, reference at the pointer position |
| Rendered pane | Attachment, reference at the end of the document |
| Tab bar, sidebar, empty window | The file is opened |

While dragging, the overlay states which of the two outcomes applies. This also allows a Markdown file to be attached deliberately instead of opened.

Several files dragged at once produce several references. Pasting or dragging counts as **one** step: `Ctrl+Z` removes the reference. The stored file remains in place and can be deleted in the file manager if needed.

## Where the file is stored

The storage location is set under Settings → Attachments and can additionally be set per area (Settings → Current area → Attachments).

| Storage location | Where the file goes |
|---|---|
| Folder named after the document | into a subfolder carrying the document's name (default) |
| Fixed subfolder | into a subfolder with the configured name |
| Next to the document | into the same folder as the document |
| Central folder of the area | into a folder directly in the area's root |

The central folder is only offered while an area is open, as it would have no reference point otherwise. The folder name applies to the two forms that need one; it is a single name without path segments.

An existing file name is never overwritten. Instead the new file receives a counter, for example `Image-2.png` next to `Image.png`. Attachments without a name of their own, such as a screenshot from the clipboard, are named after the document and the moment.

A document that has never been saved offers no place for an attachment. In that case a note appears in the status bar and nothing is stored.

## Opening an attachment

A reference to an attachment opens it in the program the operating system assigns to it. For an embedded image the gesture depends on the view:

| View | Gesture |
|---|---|
| Reading and rendered view | single click |
| Editing and live view | double click |

In the editor the single click stays reserved for placing the cursor; writing next to an image should not launch another program.

Only targets inside the area are opened, or, without an area, inside the document's folder. For files that can execute program code when opened, a confirmation appears first, showing the name and the full path.

## Attachments and area boundaries

While an area is open, images from anywhere in that area are visible, even above the document's own folder. That is what makes the central attachment folder usable. Without an area, the document's folder and its subfolders remain the boundary; see also the page [Images](images.md).
