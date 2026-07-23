# Creating extensions

External extensions are self-built packages that extend the app's rendering and interface through a defined, versioned interface (extension API v1). This page describes the package layout, the complete API, and the path from installation to activation.

> [!warning] Security note
> An activated external extension is third-party code with **full access to your documents and the entire app**. There is no technical safety layer (no sandbox); the protection is your deliberate decision in the warning dialog. Only activate extensions whose source you trust and whose code you know or can review.

## Package layout

An extension package is a folder inside the extensions directory of your user profile. The "Open folder" action in the Extensions (external) settings section opens the directory in the file explorer.

```text
<user profile>/extensions/
└── my-extension/
    ├── manifest.json     (required: describes the package)
    ├── main.js           (UI entry point, ES module)
    └── markdown.js       (render contribution, markdown-it plugin)
```

The folder name must match the extension ID. Additional files are allowed; `main.js` may load them via relative `import` statements.

## Manifest reference

The `manifest.json` describes the package:

```json
{
  "id": "my-extension",
  "name": "My extension",
  "version": "1.0",
  "apiVersion": "1.0",
  "description": "Short description for the settings section.",
  "entry": "main.js",
  "markdownPlugin": "markdown.js"
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identifier in lowercase with hyphens (kebab-case); must match the folder name. |
| `name` | yes | Display name in the settings section and the warning dialog. |
| `version` | yes | Package version (`major.minor.patch`). The trust confirmation applies per version; after a version change a new confirmation is required. |
| `apiVersion` | yes | API version the package is built against (see versioning). |
| `entry` | one of the two | UI entry point: ES module with `activate(ctx)`. |
| `markdownPlugin` | one of the two | Render contribution: file exporting a markdown-it plugin. |
| `description` | no | Short description for the settings section. |

`entry` and `markdownPlugin` are plain file names inside the package folder (no paths). At least one of the two fields is required.

## Installation and activation

1. Copy the package folder into the extensions directory.
2. In the Extensions (external) settings section, click "Refresh" — the package appears with the status "Not activated". Newly detected packages always start disabled.
3. "Activate…" opens the warning dialog. Code runs only after confirmation; the confirmation is stored per extension and version.
4. The extension takes effect immediately and in all windows; the state survives a restart.

"Deactivate" withdraws all contributions immediately (the confirmation stays stored; re-activating the same version does not ask again). "Remove…" permanently deletes the package folder after its own confirmation.

## Render contribution: markdown-it plugin

The file named in `markdownPlugin` exports a markdown-it plugin function:

```js
'use strict';
module.exports = function myPlugin(md) {
  md.inline.ruler.after('emphasis', 'my-smiley', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== ':-)') return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      token.content = '<span class="ext-beispiel-smiley">☺</span>';
    }
    state.pos += 3;
    return true;
  });
};
```

The file runs in its own, empty environment: `module` and `exports` exist, but there is **no** `require`, no `process`, and no DOM. The plugin is applied to both render instances (display and portable export), after all built-in registrations. If the plugin throws during registration, the extension is disabled automatically and the error text is shown in the settings section.

## UI entry point

The file named in `entry` is an ES module. Its default export provides `activate(ctx)` and optionally `deactivate()`:

```js
export default {
  activate(ctx) {
    // register contributions (see ctx reference)
  },
  deactivate() {
    // optional: your own cleanup; registered contributions are
    // withdrawn by the app itself on deactivation
  },
};
```

`activate` runs at app start (when the extension is active) and on every activation. If `activate` throws, all contributions registered so far are rolled back and the extension is disabled automatically.

### ctx reference (API v1)

| Member | Meaning |
|---|---|
| `ctx.apiVersion` | API version of the app (e.g. `1.0`). |
| `ctx.manifest` | Frozen copy of `id`, `name`, `version`, `description`. |
| `ctx.registerSidebarPanel(def)` | Contribute a sidebar panel (see below). |
| `ctx.registerCommand(def)` | Contribute a command, with an optional default shortcut. |
| `ctx.registerSettingsSection(def)` | Contribute your own settings section. |
| `ctx.addTranslations(bundles, defaultLocale)` | Register your own translations. |
| `ctx.t(key)` | Resolve a translation: active language → default language → key. |
| `ctx.getLanguage()` | Active interface language (`de`, `en`, `fr`, `es`, `it`). |
| `ctx.getTheme()` | Active theme (`light` or `dark`). |
| `ctx.getThemeVariable(name)` | Value of a theme CSS variable, e.g. `--render-font-size`. |
| `ctx.storage.get(key)` / `ctx.storage.set(key, value)` | Persistence namespace of the extension (asynchronous). |

Anything not listed here is not part of the public API — even if technically reachable — and may change at any time.

### Sidebar panel

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, paneIdx) {
    body.textContent = 'Panel content';
  },
});
```

The panel gets its own section per column and is visible while the extension is active. Placement, side, and tab groups follow the normal sidebar layout (see the Sidebar manual page) and are persisted. Instead of `titleKey` (recommended, multilingual via `addTranslations`), a fixed `title` string is also possible.

### Command

```js
ctx.registerCommand({
  id: 'count',
  titleKey: 'command.title',
  defaultBinding: 'CmdOrCtrl+Alt+9',
  run() {
    // action
  },
});
```

The command appears in the keyboard shortcuts editor (group "General") and can be rebound there; `defaultBinding` is optional. Menu entries and entries on the generated shortcuts manual page are not part of v1.

### Settings section

```js
ctx.registerSettingsSection({
  id: 'settings',
  titleKey: 'settings.title',
  render(container) {
    const input = document.createElement('input');
    ctx.storage.get('value').then((v) => {
      input.value = typeof v === 'string' ? v : '';
    });
    input.addEventListener('change', () => ctx.storage.set('value', input.value));
    container.appendChild(input);
  },
});
```

The section appears in the settings navigation while the extension is active. Values belong in the `ctx.storage` namespace; they are kept when the extension is deactivated.

### Translations

```js
ctx.addTranslations(
  {
    de: { 'panel.title': 'Mein Panel' },
    en: { 'panel.title': 'My panel' },
  },
  'en',
);
```

`ctx.t('panel.title')` resolves in the active language and falls back to the extension's default language (second argument), finally to the key itself. Keys used in `titleKey` fields are resolved through the same mechanism and follow the app's language switch.

## Versioning and compatibility

The extension API carries its own semantic version number. A package declares in `apiVersion` which API version it is built against. It is compatible if the major version matches the app and the declared minor version is not newer than the app's. Incompatible packages are never loaded and are listed in the settings section with a clear message.

Stability promise: the signatures documented on this page stay stable within the same major version.

## Troubleshooting

- If an extension throws while loading (manifest error, import error, `activate`, plugin registration), it is disabled automatically; the settings section shows the status "Error" with the error text — also after a restart.
- Invalid manifests are listed with diagnostic details and never loaded.
- Runtime errors in commands or while drawing a panel do not crash the app; details appear in the console log.
- "Activate…" after an error retries loading (the error text is reset).

## Quality notes

Error isolation catches crashes, not poor quality. In particular, the following is your responsibility:

- **Rendering performance:** markdown-it rules run on every render; expensive rules slow down typing and preview.
- **Clean output:** generated HTML should match the document style and must not load remote resources (demo links to `example.org`).
- **Cleanup:** your own timers, listeners outside the registered contributions, and global state belong in `deactivate()`.

The reference extension `beispiel` serves as a runnable template with all contribution types on this page; its structure matches the examples above exactly.
