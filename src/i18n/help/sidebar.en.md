# Sidebar

The sidebar bundles the app's panels — from bookmarks, table of contents and area, through properties, tags and backlinks, to calendar, reminders and file graph (the full list is in the [function table](functions.md)). Each column has a sidebar area to the left and right of the content. Which panels are visible is switched per column; the arrangement of the panels (side, order, groups) applies to the whole app.

## Showing and hiding panels

Each panel has a status bar icon and an entry in the View → Panels submenu (default shortcuts in the [shortcut overview](shortcuts.md)); the toggle affects the active column. Both places list the same panels in the same order; the order can be freely sorted under Settings → Panel order and affects the menu and the status bar at the same time. The contents of the individual panels are described in the [function table](functions.md) as well as on the pages [Linking](linking.md) (tags, backlinks, outgoing links), [Frontmatter and properties](frontmatter.md), [Document notes](notes.md) (notes panel), and [Applications, windows and areas](apps-windows.md) (area panel).

## Collapsing and expanding columns

Beyond the individual panel toggles, an entire sidebar column can be collapsed and expanded at once when a little more room for the text is needed briefly. Collapsing lays a separate state over the panel visibilities without changing them; expanding restores exactly the previous state.

- **Header icon:** In the topmost header of each column, at the inner edge where the column meets the text, sits a sidebar icon. A click collapses the column. The icon is right-aligned in the left column and mirrored, left-aligned, in the right column; it appears in the section head as well as in the tab bar of a group, and in both the text and the icon rendering of the headings.
- **Collapsed:** A collapsed column stays visible as a narrow strip at the window edge. Hovering over it reveals the icon; a click expands the column again. The tooltip switches between collapse and expand.
- **Menu and commands:** View → Collapse Left Sidebar and View → Collapse Right Sidebar switch the same states. Both commands are also in the command palette and can be assigned a shortcut under Settings → Keyboard shortcuts; there is no default binding.

In a split view, each editor column switches its two sidebars on its own; collapsing affects only that column. The most recently set state is saved globally and still applies on the next start.

A column without a visible panel stays unchanged and disappears entirely as before, without a strip or an icon. Focus mode additionally hides the sidebar purely visually and leaves the collapse state untouched; on leaving it, that state still applies.

## Arrangement: side and order

Each panel can sit on the left or right, and the order is freely selectable. Two ways lead to the desired arrangement:

- **Drag and drop:** drag the panel title (for groups, the tab). The upper or lower third of a panel sorts before or after it, the middle forms a tab group, and the free area of a sidebar appends the panel there — on an empty side, a narrow drop strip appears while dragging. Drop zones are highlighted in color; Esc cancels. Changes take effect immediately, including in other windows.
- **Settings → Sidebar:** both sides as lists with actions for moving (up, down, switch side), grouping and ungrouping, plus a reset to the default arrangement. Changes take effect on Apply or OK.

The **default arrangement** distributes the panels across both sides and bundles them into thematic tab groups: on the left the entry, structure and scheduling panels, on the right the notes plus the metadata and link panels. It applies as long as no custom arrangement is set; "Reset to default arrangement" restores exactly this distribution.

## Variants

The current arrangement can be saved as a **named variant** — including the panel visibility of both columns, that is, the sidebar's entire layout. Any number of variants is possible, for example one for drafting and one for everyday work.

- **Save:** View → Sidebar arrangements → "Save current arrangement…", or the button of the same name under Settings → Sidebar, Variants section. The name is entered in the dialog; saving under an existing name updates that variant.
- **Apply:** by clicking in the View → Sidebar arrangements submenu, via the selection popup of the "Apply sidebar variant" command, or in the variants lists in the settings. Applying replaces the current arrangement immediately; later rearrangements do not change the variant — "Overwrite" deliberately transfers the current arrangement into an existing variant.
- **Manage:** Settings → Sidebar, Variants section lists the global variants with Apply, Rename, Overwrite and Delete.

**Area variants** belong to an area: they live in its area file, travel with the area folder and appear only when that area is open, separated in the menu into their own group labeled with the area name. Their management, including a dedicated Save button, is located in the "Sidebar variants" settings section of the "Current area" group; when saving via menu or command, an option in the dialog chooses the target (global or area). Identical names in both groups are allowed. The "Default arrangement" entry in the submenu restores the built-in distribution at any time.

Variants are independent of workspaces: a workspace remembers windows and tabs, a sidebar variant only the sidebar's layout.

## Tab groups

Several panels at the same position share the space as a tab group: a tab bar replaces the panel titles, and only the active panel is visible. Showing a grouped panel activates its tab; the active tab is remembered.

## Widths

Each side has its own width (180 to 500 pixels), draggable at the splitter between sidebar and content. The width applies per side to both columns and is saved.

## Panel heights

When several panels are stacked on one sidebar side, a drag handle sits between each pair of panels. It sets the height of the panel above it: drag the handle up or down with the mouse. Set heights are saved and restored on start; a double-click on the handle restores the automatic height.

The bottom panel of a side has no handle, because no further panel follows it. It therefore always follows the height of its content and takes the space the panels above leave it. A scrollbar appears there only when that space is not enough for the content.

If the set heights together require more room than the side has, the whole column becomes vertically scrollable. No panel disappears in the process: each keeps at least its header, and the lower ones are reachable by scrolling. To get the previous state back, shrink the panel that was dragged too large, or set it to the automatic height with a double-click on its handle.

## Height per panel or per group

What the height of a block depends on can be chosen (Settings → Sidebar).

With **Height per panel** each panel keeps its own height. In a tab group the height of the displayed panel applies; paging through it therefore changes the height of the block, and the panels below move along. This is the default.

With **Fixed height per group** a tab group keeps its height across tab changes. All panels of the group appear equally tall, and whatever lies below stays in place. The drag handle below the group then sets its shared height; a double-click restores the automatic height of the whole group.

Panels standing on their own behave the same in both cases. The heights of both settings are remembered separately: switching back reveals the earlier panel heights unchanged.

## Headings as icon

The panel headings can be switched from text to the icon of the respective panel (Settings → Sidebar). The switch affects section heads and the tabs of grouped panels alike; the panel name remains available as a tooltip and for screen readers. Like the arrangement, the switch takes effect on Apply or OK.
