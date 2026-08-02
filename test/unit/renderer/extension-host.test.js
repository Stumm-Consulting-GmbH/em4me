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
// 4T-0825: dazu das Render-Gerüst, das der Andockpunkt abfragt — Ansicht-
// Klasse am .content, Render-Ziel spezifisch unter .pane-rendered.
for (const group of document.querySelectorAll('.pane-group')) {
  const aside = document.createElement('aside');
  aside.className = 'pane-sidebar pane-sidebar-left';
  group.appendChild(aside);
  const content = document.createElement('div');
  content.className = 'content view-rendered';
  content.innerHTML =
    '<section class="pane pane-rendered"><article class="markdown-body"></article></section>';
  group.appendChild(content);
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

// 4T-0825 (Epic 3E-0103): Render-Andockpunkt der API v1.1.
describe('extension-host: Render-Andockpunkt (4T-0825)', () => {
  // Eigener Zugriffs-Helfer: die Indizierung direkt am querySelectorAll-
  // Ergebnis bricht der Formatierer so um, dass ESLint sie als mehrzeiligen
  // Property-Zugriff anmahnt (no-unexpected-multiline).
  const groupOf = (paneIdx) => document.querySelectorAll('.pane-group')[paneIdx];
  const contentOf = (paneIdx) => groupOf(paneIdx).querySelector('.content');
  const targetOf = (paneIdx) => groupOf(paneIdx).querySelector('.pane-rendered .markdown-body');

  // Der Observer meldet als Microtask, die Buendelung haengt einen weiteren
  // an — ein Makrotask wartet beide sicher ab.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function aktiviereUndHoleCtx() {
    host.resetExternalHostForTests([makeEntry('test-ext', ENTRY_SRC)]);
    await host.applyExternalStateForTests({
      enabled: ['test-ext'],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    return globalThis.__extHostCtx;
  }

  beforeEach(() => {
    for (const paneIdx of [0, 1]) {
      contentOf(paneIdx).className = 'content view-rendered';
      targetOf(paneIdx).innerHTML = '';
    }
  });

  it('getRenderRoot liefert das Render-Ziel der genannten Spalte', async () => {
    const ctx = await aktiviereUndHoleCtx();
    expect(ctx.getRenderRoot(0)).toBe(targetOf(0));
    expect(ctx.getRenderRoot(1)).toBe(targetOf(1));
    expect(ctx.getRenderRoot(0)).not.toBe(targetOf(1));
  });

  it('getRenderRoot liefert null ohne gerenderte Ansicht und bei unbekannter Spalte', async () => {
    const ctx = await aktiviereUndHoleCtx();
    // Geteilte Ansicht zeigt das Render-Ziel ebenfalls.
    contentOf(0).className = 'content view-split';
    expect(ctx.getRenderRoot(0)).toBe(targetOf(0));
    for (const mode of ['view-source', 'view-live', 'view-system']) {
      contentOf(0).className = `content ${mode}`;
      expect(ctx.getRenderRoot(0)).toBeNull();
    }
    expect(ctx.getRenderRoot(7)).toBeNull();
  });

  it('onRenderUpdated feuert je Neuaufbau einmal, mit der richtigen Spalte', async () => {
    const ctx = await aktiviereUndHoleCtx();
    const gesehen = [];
    ctx.onRenderUpdated((paneIdx) => gesehen.push(paneIdx));

    // Mehrere Kind-Knoten in einem Zug: ein Ereignis, nicht drei.
    targetOf(0).innerHTML = '<p>a</p><p>b</p><p>c</p>';
    await tick();
    expect(gesehen).toEqual([0]);

    targetOf(1).innerHTML = '<p>x</p>';
    await tick();
    expect(gesehen).toEqual([0, 1]);
  });

  it('der Ansichts-Wechsel meldet auch ohne Neuaufbau des Render-DOM', async () => {
    const ctx = await aktiviereUndHoleCtx();
    const gesehen = [];
    ctx.onRenderUpdated((paneIdx) => gesehen.push(paneIdx));

    // Weg in die Quelltext-Ansicht: die gerenderte Ansicht verschwindet.
    contentOf(0).className = 'content view-source';
    await tick();
    expect(gesehen).toEqual([0]);
    expect(ctx.getRenderRoot(0)).toBeNull();

    // Wechsel zwischen zwei Ansichten ohne Render-Pane ist kein Ereignis.
    contentOf(0).className = 'content view-live';
    await tick();
    expect(gesehen).toEqual([0]);

    // Rückweg: das Render-DOM bleibt unberührt (Skip-Cache), trotzdem muss
    // die Erweiterung erfahren, dass ihr Ziel wieder da ist.
    contentOf(0).className = 'content view-rendered';
    await tick();
    expect(gesehen).toEqual([0, 0]);
    expect(ctx.getRenderRoot(0)).toBe(targetOf(0));
  });

  it('werfender Callback bricht weder Host noch die übrigen Callbacks ab', async () => {
    const ctx = await aktiviereUndHoleCtx();
    const gesehen = [];
    ctx.onRenderUpdated(() => {
      throw new Error('Absichtlich defekt');
    });
    ctx.onRenderUpdated(() => gesehen.push('zweiter'));
    targetOf(0).innerHTML = '<p>a</p>';
    await tick();
    expect(gesehen).toEqual(['zweiter']);
    expect(host.isExternalExtensionActive('test-ext')).toBe(true);
  });

  it('die zurückgegebene Abmelde-Funktion stoppt weitere Meldungen', async () => {
    const ctx = await aktiviereUndHoleCtx();
    const gesehen = [];
    const off = ctx.onRenderUpdated((paneIdx) => gesehen.push(paneIdx));
    targetOf(0).innerHTML = '<p>a</p>';
    await tick();
    off();
    targetOf(0).innerHTML = '<p>b</p>';
    await tick();
    expect(gesehen).toEqual([0]);
  });

  it('Deaktivieren meldet ohne Zutun der Erweiterung ab', async () => {
    const ctx = await aktiviereUndHoleCtx();
    const gesehen = [];
    ctx.onRenderUpdated((paneIdx) => gesehen.push(paneIdx));
    await host.applyExternalStateForTests({
      enabled: [],
      trusted: { 'test-ext': '1.0.0' },
      errors: {},
    });
    targetOf(0).innerHTML = '<p>nach dem Deaktivieren</p>';
    await tick();
    expect(gesehen).toEqual([]);
  });

  it('ohne registrierten Callback entsteht keine Meldung', async () => {
    const ctx = await aktiviereUndHoleCtx();
    expect(typeof ctx.onRenderUpdated).toBe('function');
    targetOf(0).innerHTML = '<p>a</p>';
    await tick();
    // Kein Zuhoerer, kein Fehler — der Fall ist der Normalzustand jeder
    // Erweiterung, die den Andockpunkt nicht nutzt.
    expect(host.isExternalExtensionActive('test-ext')).toBe(true);
  });

  it('onRenderUpdated ohne Callback ist ein Fehler', async () => {
    const ctx = await aktiviereUndHoleCtx();
    expect(() => ctx.onRenderUpdated()).toThrow(/Callback/);
  });
});
