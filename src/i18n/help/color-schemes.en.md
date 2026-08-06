# Color schemes

A color scheme defines the app's colors: the interface (backgrounds, text, accent, bars, tabs) and the rendered content (headings, links, quotes, code, tables). The colors run through a curated list of named color slots that feed the theme colors. One scheme is active per mode; the light/dark toggle (status bar icon, View → Appearance → Light/Dark/System) switches between the light and the dark scheme.

## Slots and groups

A slot is a named color, not direct access to internal details. The slots are arranged in five groups: Surfaces (Background, Surface, Muted surface, Toolbar), Text (Main text, Muted text), Accent and borders (Accent, Accent text, Border, Strong border), Tabs (Tab bar, Active tab) and Content (Code background, Warning color). The rendered content follows the surface slots: links carry the accent, headings the main text, the heading rule and the table borders the border, the quote bar the strong border.

## Managing schemes

The scheme management opens under Settings → Color schemes.

- **Mode assignment:** at the top you choose an active scheme for each mode (Scheme for light, Scheme for dark).
- **Built-in schemes** are read-only and serve as templates: Standard Light and Dark, High Contrast Light and Dark, Sepia, plus four further pairs with a light and a dark version each — Steel Blue (cool), Forest Green (muted green), Amber (warm) and Graphite (neutral grey).
- **Your own scheme:** "New from template" or "Duplicate" creates an editable copy. Your own scheme can be renamed and deleted; when the active scheme is deleted, the mode falls back to the preset scheme.
- **Slot editor:** one color picker per slot; "Reset" restores the template value. Changes take effect immediately across the app (live preview), and in other windows after applying.

The editor always edits the active scheme of the mode the app is currently running in: in light mode the light scheme, in dark mode the dark scheme. To adjust the other mode's scheme, first switch the app to that mode via the theme icon in the status bar (or View → Appearance → Light/Dark/System). This way every color change takes effect immediately in exactly the mode it applies to (live preview).

## Contrast and limits

The readability of your own schemes is in your own hands: there is no automatic contrast check. The live preview shows the effect immediately, and "Reset" per slot returns to a template value. A few colors deliberately remain outside the slots: the colors of the tab groups and the syntax highlighting of code blocks still follow the theme. The PDF export stays light and takes the colors of the active light scheme.
