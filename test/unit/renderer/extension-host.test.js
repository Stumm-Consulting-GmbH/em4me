// @vitest-environment jsdom
// 4T-0299/4T-0298 (Epic 3E-0053): Host der externen Erweiterungen —
// API-v1-Fassade (Beitrags-Registrierung und Rollback), Aktivierungs-
// Zustand, Fehler-Isolation mit automatischer Deaktivierung und der
// Vertrauens-Ablauf (Warn-Dialog-Ergebnis, Persistenz je Version).
// Einstiegs-Module kommen als data:-URLs (derselbe dynamische import()-
// Pfad wie die file://-URLs der echten Pakete, Spike 4T-0298).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Sidebar-Container je Pane ergänzen (api-stub baut nur die Pane-Gruppen).
for (const group of document.querySelectorAll('.pane-group')) {
  const aside = document.createElement('aside');
  aside.className = 'pane-sidebar pane-sidebar-left';
  group.appendChild(aside);
}

window.api.scanExternalExtensions = async () => [];
window.api.configureExternalMarkdownPlugins = async () => ({});
window.api.confirmExternalExtensionTrust = async () => true;

const host = await import('../../../src/renderer/modules/extension-host.js');
const { sidebarPanelById } = await import('../../../src/renderer/modules/sidebar-layout.js');
const { COMMANDS } = await import('../../../src/shared/commands.js');
const { tExtension } = await import('../../../src/renderer/i18n.js');
const { extensionById } = await import('../../../src/shared/extensions.js');
const { EXTERNAL_ENABLED_KEY, EXTERNAL_ERRORS_KEY, EXTERNAL_TRUSTED_KEY } =
  await import('../../../src/shared/extensions-external.js');

const ENTRY_SRC = `
let deactivated = false;
export default {
  activate(ctx) {
    globalThis.__extHostCtx = ctx;
    ctx.addTranslations(
      {
        de: { 'panel.title': 'Test-Panel' },
        en: { 'panel.title': 'Test panel', 'command.title': 'Test command' },
      },
      'en',
    );
    ctx.registerSidebarPanel({
      id: 'p',
      titleKey: 'panel.title',
      render(body) { body.textContent = 'PANEL-INHALT'; },
    });
    ctx.registerCommand({
      id: 'c',
      titleKey: 'command.title',
      defaultBinding: 'CmdOrCtrl+Alt+9',
      run() { globalThis.__extHostCommandRan = true; },
    });
    ctx.registerSettingsSection({
      id: 's',
      title: 'Literaler Titel',
      render(el) { el.textContent = 'SETTINGS-INHALT'; },
    });
  },
  deactivate() { globalThis.__extHostDeactivated = true; },
};
`;

function toDataUrl(src) {
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}

function makeEntry(id, src, manifestOverrides = {}) {
  return {
    ok: true,
    dirName: id,
    manifest: {
      id,
      name: `Erweiterung ${id}`,
      version: '1.0.0',
      apiVersion: '1.0',
      entry: 'main.js',
      ...manifestOverrides,
    },
    entryUrl: toDataUrl(src),
  };
}

function makeRuntime() {
  const sections = new Map();
  return {
    commandHandlers: {},
    sections,
    registerSettingsSection: (def) => sections.set(def.id, def),
    unregisterSettingsSection: (id) => sections.delete(id),
  };
}

let runtime;
let persisted;

beforeEach(() => {
  host.resetExternalHostForTests();
  runtime = makeRuntime();
  host.attachExtensionHostRuntime(runtime);
  persisted = [];
  host.attachExternalPersistence(async (key, value) => {
    persisted.push([key, JSON.parse(JSON.stringify(value))]);
    return true;
  });
  delete globalThis.__extHostCommandRan;
  delete globalThis.__extHostDeactivated;
  window.api.configureExternalMarkdownPlugins = async () => ({});
  window.api.confirmExternalExtensionTrust = async () => true;
});

describe('extension-host: Aktivierung und Beiträge (4T-0299)', () => {
  it('aktiviert und registriert alle Beitrags-Arten der API v1', async () => {
    host.resetExternalHostForTests([makeEntry('test-ext', ENTRY_SRC)]);
    const changed = await host.applyExternalStateForTests({
      enabled: ['test-ext'],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    expect(changed).toContain('test-ext');
    expect(host.isExternalExtensionActive('test-ext')).toBe(true);
    // Registry-Anbindung mit Herkunfts-Kennzeichnung.
    expect(extensionById('test-ext')).toMatchObject({ origin: 'external' });
    // Panel: eine Sektion je Pane plus Registry-Eintrag.
    const sections = document.querySelectorAll('.sidebar-section-ext-test-ext-p');
    expect(sections).toHaveLength(2);
    expect(sections[0].querySelector('.sidebar-section-body').textContent).toBe('PANEL-INHALT');
    expect(sidebarPanelById('ext-test-ext-p')).toBeTruthy();
    // Kommando: Registry-Eintrag plus Handler über den Laufzeit-Andockpunkt.
    expect(COMMANDS.some((c) => c.id === 'ext.test-ext.c')).toBe(true);
    runtime.commandHandlers['ext.test-ext.c']();
    expect(globalThis.__extHostCommandRan).toBe(true);
    // Einstellungs-Bereich (mit literalem Titel über synthetischen Key).
    const section = runtime.sections.get('ext-test-ext-s');
    expect(section).toBeTruthy();
    expect(tExtension('test-ext', '__settings.s.title')).toBe('Literaler Titel');
    // Übersetzungen: aktive Sprache (en) mit Fallback-Kette.
    expect(tExtension('test-ext', 'panel.title')).toBe('Test panel');
    // Status für den Einstellungs-Bereich.
    expect(host.externalExtensionEntries()[0].status).toBe('active');
  });

  it('deaktiviert mit vollständigem Rollback aller Beiträge', async () => {
    host.resetExternalHostForTests([makeEntry('test-ext', ENTRY_SRC)]);
    await host.applyExternalStateForTests({
      enabled: ['test-ext'],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    const changed = await host.applyExternalStateForTests({
      enabled: [],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    expect(changed).toContain('test-ext');
    expect(globalThis.__extHostDeactivated).toBe(true);
    expect(host.isExternalExtensionActive('test-ext')).toBe(false);
    expect(document.querySelectorAll('.sidebar-section-ext-test-ext-p')).toHaveLength(0);
    expect(sidebarPanelById('ext-test-ext-p')).toBeNull();
    expect(COMMANDS.some((c) => c.id === 'ext.test-ext.c')).toBe(false);
    expect(runtime.commandHandlers['ext.test-ext.c']).toBeUndefined();
    expect(runtime.sections.has('ext-test-ext-s')).toBe(false);
    expect(extensionById('test-ext')).toBeNull();
    expect(host.externalExtensionEntries()[0].status).toBe('inactive');
  });

  it('werfende activate(): Rollback, Fehlertext und automatische Deaktivierung', async () => {
    const src = `export default { activate() { throw new Error('Absichtlich defekt'); } };`;
    host.resetExternalHostForTests([makeEntry('defekt', src)]);
    const changed = await host.applyExternalStateForTests({
      enabled: ['defekt'],
      trusted: { defekt: '1.0.0' },
      errors: {},
    });
    expect(changed).toEqual([]);
    expect(host.isExternalExtensionActive('defekt')).toBe(false);
    const entry = host.externalExtensionEntries()[0];
    expect(entry.status).toBe('error');
    expect(entry.lastError).toContain('Absichtlich defekt');
    // Persistiert: Fehlertext plus bereinigte Enabled-Liste (Auto-Disable).
    expect(persisted.some(([k, v]) => k === EXTERNAL_ERRORS_KEY && v.defekt)).toBe(true);
    expect(persisted.some(([k, v]) => k === EXTERNAL_ENABLED_KEY && !v.includes('defekt'))).toBe(
      true,
    );
    // Kein halber Zustand übrig.
    expect(extensionById('defekt')).toBeNull();
    expect(document.querySelectorAll('[class*="ext-defekt"]')).toHaveLength(0);
  });

  it('inkompatible apiVersion wird nie geladen', async () => {
    host.resetExternalHostForTests([makeEntry('inkompatibel', ENTRY_SRC, { apiVersion: '2.0' })]);
    const changed = await host.applyExternalStateForTests({
      enabled: ['inkompatibel'],
      trusted: { inkompatibel: '1.0.0' },
      errors: {},
    });
    expect(changed).toEqual([]);
    expect(host.externalExtensionEntries()[0].status).toBe('incompatible');
  });

  it('ID-Kollision mit interner Erweiterung ist ein Lade-Fehler', async () => {
    host.resetExternalHostForTests([makeEntry('katex', ENTRY_SRC)]);
    await host.applyExternalStateForTests({
      enabled: ['katex'],
      trusted: { katex: '1.0.0' },
      errors: {},
    });
    expect(host.isExternalExtensionActive('katex')).toBe(false);
    expect(host.externalExtensionEntries()[0].status).toBe('error');
  });
});

describe('extension-host: Vertrauens-Ablauf (4T-0298)', () => {
  it('Aktivierung ohne bestätigten Dialog passiert nicht', async () => {
    host.resetExternalHostForTests([makeEntry('test-ext', ENTRY_SRC)]);
    window.api.confirmExternalExtensionTrust = async () => false;
    expect(await host.enableExternalExtension('test-ext')).toBe('canceled');
    expect(host.isExternalExtensionActive('test-ext')).toBe(false);
    expect(persisted).toEqual([]);
  });

  it('Bestätigung persistiert Vertrauen je Version und aktiviert', async () => {
    host.resetExternalHostForTests([makeEntry('test-ext', ENTRY_SRC)]);
    let dialogCalls = 0;
    window.api.confirmExternalExtensionTrust = async () => {
      dialogCalls += 1;
      return true;
    };
    expect(await host.enableExternalExtension('test-ext')).toBe('active');
    expect(dialogCalls).toBe(1);
    expect(
      persisted.some(([k, v]) => k === EXTERNAL_TRUSTED_KEY && v['test-ext'] === '1.0.0'),
    ).toBe(true);
    expect(persisted.some(([k, v]) => k === EXTERNAL_ENABLED_KEY && v.includes('test-ext'))).toBe(
      true,
    );
    // Erneutes Aktivieren derselben bestätigten Version fragt nicht erneut.
    await host.disableExternalExtension('test-ext');
    expect(await host.enableExternalExtension('test-ext')).toBe('active');
    expect(dialogCalls).toBe(1);
  });

  it('meldet aktive Markdown-Plugins an den Preload-Loader', async () => {
    host.resetExternalHostForTests([
      makeEntry('test-ext', ENTRY_SRC, { markdownPlugin: 'markdown.js' }),
    ]);
    const configured = [];
    window.api.configureExternalMarkdownPlugins = async (list) => {
      configured.push(list);
      return {};
    };
    await host.applyExternalStateForTests({
      enabled: ['test-ext'],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    expect(configured.at(-1)).toEqual([{ id: 'test-ext', version: '1.0.0' }]);
  });

  it('Plugin-Fehler aus dem Preload-Loader deaktiviert die Erweiterung', async () => {
    host.resetExternalHostForTests([
      makeEntry('test-ext', ENTRY_SRC, { markdownPlugin: 'markdown.js' }),
    ]);
    window.api.configureExternalMarkdownPlugins = async (list) =>
      list.length > 0 ? { 'test-ext': 'Plugin kaputt' } : {};
    await host.applyExternalStateForTests({
      enabled: ['test-ext'],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    expect(host.isExternalExtensionActive('test-ext')).toBe(false);
    const entry = host.externalExtensionEntries()[0];
    expect(entry.status).toBe('error');
    expect(entry.lastError).toContain('Plugin kaputt');
  });
});
