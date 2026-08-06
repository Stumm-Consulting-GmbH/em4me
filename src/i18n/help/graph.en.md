# Graph view

The graph view makes the link relations of Markdown files visible: every file is a node, every link a directed edge. There are two forms with the same interaction: the **area graph** as its own tab for the entire area, and the **file graph** as a sidebar panel for the neighborhood of the active file.

Both forms belong to the **Graph view** extension and can be switched off together under Settings → Extensions.

## Area graph (tab)

The area graph shows all Markdown files of the opened area together with their links on the large canvas of its own tab. It opens via the menu View → Area graph or via the context menu of the area panel; there is one graph tab per window, opening it again activates the existing one. The tab is a read-only view without an edit mode; its title carries the area name. Without an open area the entry is not available.

The toolbar at the top of the tab offers:

- **Direction** — “Both directions” shows the complete graph. “Incoming” or “Outgoing” restrict the display to the files reachable from the active file via links of the chosen direction (at any depth). If no file is active, the graph still shows all edges and says so.
- **File counter** — the number of currently displayed nodes.
- **Re-arrange** — recalculates the layout and discards manually moved node positions.

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
- For very large areas (more than 1500 files) the graph shows the most connected nodes and points out the hidden ones.
- The area graph requires an open area; the file panel also works without an area, then with a limited search space.
