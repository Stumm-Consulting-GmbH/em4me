# Graph view

The graph view makes the link relations of Markdown files visible: every file is a node, every link a directed edge. There are two entry points with the same interaction: the **area graph** as its own tab for the entire area, and the **file graph** as a sidebar panel for the neighborhood of the active file. The area graph presents its data either as a **network** or as a **tree**.

Both forms belong to the **Graph view** extension and can be switched off together under Settings → Extensions.

## Area graph (tab)

The area graph shows all Markdown files of the opened area together with their links on the large canvas of its own tab. It opens via the menu View → Area graph or via the context menu of the area panel; there is one graph tab per window, opening it again activates the existing one. The tab is a read-only view without an edit mode; its title carries the area name. Without an open area the entry is not available.

The toolbar at the top of the tab offers:

- **View** — switches between **network** and **tree**. The choice applies to the open tab; the next time it opens it starts with the network again. Direction and “Re-arrange” apply to the network only.
- **Direction** — “Both directions” shows the complete graph. “Incoming” or “Outgoing” restrict the display to the files reachable from the active file via links of the chosen direction (at any depth). If no file is active, the graph still shows all edges and says so.
- **File counter** — the number of currently displayed nodes.
- **Re-arrange** — recalculates the layout and discards manually moved node positions.

### Reference tree

The tree answers the question of **order** that the network leaves open: what hangs below an entry point, and at what depth. It shows the same data — the same files, the same links, the same area boundary — only directed from a root and expandable.

**The root** is initially the start page of the area; if none is set, the tree is rooted in the file that was active when the view was opened. It can be changed in two ways: via the root display in the toolbar, which opens the same name picker as “Open file by name”, or via the entry “As root of the reference tree” in the context menu of a file in the area panel. The chosen root applies to the open tab; the start page is not affected.

**Every file appears exactly once.** If it can be reached by several paths, it sits on its **shortest** path to the root; if two paths are equally long, the alphabetically first parent wins. So a file you do not find where you expect it is further up. Cycles cause no repetition.

**Expansion is stepwise:** on opening, the first level is visible, deeper levels on a click on the triangle; “Expand all” and “Collapse all” act on the whole tree. The number after a name gives its children. A click on the name opens the file.

**The footer** gives the number of files that **cannot** be reached from this root. That is not an error but a property of your material: the tree shows what hangs below the root, not the whole area. If there is no such file, the line stays away.

## File graph (panel)

The “File graph” panel shows the link neighborhood of the active file and follows automatically when you switch tabs. It is toggled via the menu View → Sidebar → Panels → File graph, the graph icon in the status bar, or a custom keyboard shortcut; side, order and tab groups follow the rules of the [sidebar](sidebar.md).

Two controls sit in the panel header:

- **Depth** (1 to 5) — how many link steps around the active file are included. Depth 1 shows only the direct neighbors, larger values extend the neighborhood step by step.
- **Direction** — “Outgoing” follows only links leading out of the file, “Incoming” only links pointing to the file, “Both directions” combines both.

Both settings apply per column for the current session. A file without link relations appears as a single node with a hint. Outside an area the panel works with the limited search space around the file’s folder and shows a subtle hint; the complete graph is provided by the area.

## Interaction

- **Zoom** — mouse wheel over the canvas, centered on the pointer.
- **Pan** — drag the canvas with the mouse button held down.
- **Drag nodes** — individual nodes can be repositioned with the mouse; the position is kept for the duration of the session, even when the graph refreshes.
- **Highlight** — when hovering a node, the node itself, its direct neighbors and the involved edges stand out while the rest is dimmed.
- **Open** — clicking a node opens the file (or jumps to the already open tab). The active file is highlighted in color.
- **Duplicate names** — if several files share the same name, a tooltip on the node shows the full path.

## Arrow semantics

Edges are directed: the arrow points from the linking to the linked document. If two files reference each other, both links merge into **one** edge with arrowheads on both ends (double arrow). The graph includes wiki links (including alias resolution) and Markdown links to files of the search space; multiple links between the same two files count as one edge.

## Limits

- Nodes are exclusively **Markdown files**; tags, attachments or individual blocks do not appear in the graph.
- For very large areas (more than 1500 files) **the network** shows the most connected nodes and points out the hidden ones. The tree does not know this limit: it only draws the expanded branches and therefore stays complete.
- The area graph requires an open area; the file panel also works without an area, then with a limited search space.
