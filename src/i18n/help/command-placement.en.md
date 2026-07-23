# Command placement

Every action of the app is a command in the central registry. Command placement turns commands into permanent custom access points: command buttons in the status bar, a hide list for the default buttons, custom entries in the editor context menu and macros as command sequences. Everything is maintained in one shared section: "File → Settings… → Command placement". The four functions belong to the switchable "Command placement" extension (category Tools).

## Status bar buttons

Custom command buttons appear as their own segment in the status bar, to the right of the view buttons. Creation takes three steps: choose a command via filter search, pick an icon from the curated internal set, optionally assign a display name. The button's tooltip shows the display name followed by the original command in parentheses; without a display name it shows the command itself. In the list of the settings section, buttons can be reordered (up/down), edited and removed.

If the status bar runs out of space — for example with narrow windows — surplus buttons move from the right into an overflow menu: a dots button at the end of the segment opens the stowed entries as a menu from which they can still be run.

Buttons whose command belongs to a disabled extension do not appear (the configuration is kept and returns with the extension).

## Hide default buttons

Every default element of the status bar can be hidden individually: the panel toggles, the three editor toggles (fold gutter, line numbers, word wrap), the four view buttons and the elements on the right side (word statistics, zoom display, edit, scroll sync, document history, theme, language). Only the hint line always stays visible — it is the only channel for short messages such as the save status.

Hiding only clears away the access point, the function itself remains: everything hidden stays reachable through the menu, the command palette and keyboard shortcuts. The "Show all" button restores the default status bar.

## Editor context menu

Custom command entries appear as an additional section at the end of the editor context menu, in source as well as live mode. They are maintained in a second list of the settings section — same creation flow and same entry model as the status bar buttons, but with their own order. Each entry shows its icon and its display name.

Entries whose command cannot run in the current context (for example an area command without an open area) appear disabled instead of vanishing — consistent with the rest of the menu. Without configured entries the section is omitted entirely. The section belongs to the main editor; the context menu of the note field stays unchanged.

## Macros

A macro bundles an ordered series of steps under its own name and icon. Two step types are available: "Run command" (a command from the registry, including another macro) and "Delay" (zero to ten seconds, for example to give a view time to build up). The steps run strictly one after another; each step waits for the previous one.

If a step fails or its command cannot run in the current context, the sequence aborts and the status bar shows a notice with the macro name and step number. When a macro calls another macro, the call chain is limited; nesting too deeply (including a macro that calls itself) aborts with its own notice. Macros never start automatically, only through their access points.

The decisive trick: each macro is itself registered as a regular command. That makes it findable in the command palette, assignable a shortcut of its own in the "Keyboard shortcuts" settings section, and placeable via status bar buttons and context menu entries — without any special treatment.

The step editor lives in the same settings section: per macro a collapsible step list with reordering and deletion, plus a test run button. The test run executes the current editing state immediately — in the context of the settings tab, so context-bound steps abort there with the notice, as expected.

## Distinction from the command palette

The [command palette](tools.md) and command placement work on the same command registry but serve different situations: the palette is the fleeting keyboard access — open, type, run, without setting anything up. Placement creates permanent access points for recurring moves: a click in the status bar, a right-click in the editor, a shortcut on a macro.

## Disabled state

When the "Command placement" extension is disabled, the status bar shows the default state again: no custom buttons, no hidden buttons, no context menu section; the macro commands are deregistered and the settings section is hidden. The entire configuration stays saved and applies unchanged after re-enabling.
