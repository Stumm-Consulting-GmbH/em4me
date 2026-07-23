// @vitest-environment jsdom
// 4T-0300 (Epic 3E-0053): Bereich „Erweiterungen (extern)" der
// Einstellungs-Seite — Registrierung als fester Bereich, Zeilen mit
// Status und Fehlertext, Aktions-Schaltflächen je Zustand (Aktivieren
// über den Warn-Dialog, Deaktivieren, Entfernen), Leer-Zustand und
// Fußzeilen-Aktionen (Aktualisieren, Ordner öffnen).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Sidebar-Container je Pane (der Host montiert Panel-Sektionen dorthin).
for (const group of document.querySelectorAll('.pane-group')) {
  const aside = document.createElement('aside');
  aside.className = 'pane-sidebar pane-sidebar-left';
  group.appendChild(aside);
}

window.api.scanExternalExtensions = async () => [];
window.api.configureExternalMarkdownPlugins = async () => ({});
window.api.confirmExternalExtensionTrust = async () => true;

const settingsPage = await import('../../../src/renderer/modules/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/system-pages.js');
const host = await import('../../../src/renderer/modules/extension-host.js');

function removeStaleContainers() {
  document.querySelectorAll('[data-test-settings]').forEach((el) => el.remove());
}

function mountPage() {
  removeStaleContainers();
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  container.dataset.testSettings = '1';
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

function activateSection(container, id) {
  container.querySelector(`.settings-nav-entry[data-section-id="${id}"]`).click();
}

const ENTRY_SRC = `export default { activate() {} };`;

function toDataUrl(src) {
  return 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}

function makeEntry(id, manifestOverrides = {}, entryOverrides = {}) {
  return {
    ok: true,
    dirName: id,
    dir: `C:/profil/extensions/${id}`,
    manifest: {
      id,
      name: `Erweiterung ${id}`,
      version: '1.0.0',
      apiVersion: '1.0',
      description: `Beschreibung ${id}`,
      entry: 'main.js',
      ...manifestOverrides,
    },
    entryUrl: toDataUrl(ENTRY_SRC),
    ...entryOverrides,
  };
}

beforeEach(() => {
  host.resetExternalHostForTests();
  host.attachExtensionHostRuntime({
    commandHandlers: {},
    registerSettingsSection: settingsPage.registerSettingsSection,
    unregisterSettingsSection: settingsPage.unregisterSettingsSection,
  });
  host.attachExternalPersistence(async () => true);
});

describe('Bereich Erweiterungen (extern) (4T-0300)', () => {
  it('ist als fester Bereich nach den internen Erweiterungen registriert', () => {
    const ids = settingsPage.settingsSections().map((s) => s.id);
    expect(ids).toContain('extensionsExternal');
    expect(ids.indexOf('extensionsExternal')).toBe(ids.indexOf('extensions') + 1);
  });

  it('zeigt den Leer-Zustand ohne installierte Pakete', () => {
    const container = mountPage();
    activateSection(container, 'extensionsExternal');
    expect(container.querySelector('.settings-extensions-external-empty')).toBeTruthy();
    // Fußzeilen-Aktionen existieren unabhängig vom Bestand.
    expect(container.querySelector('#btn-ext-external-rescan')).toBeTruthy();
    expect(container.querySelector('#btn-ext-external-open-dir')).toBeTruthy();
  });

  it('listet Einträge mit Status, Pfad und passenden Aktionen', async () => {
    host.resetExternalHostForTests([
      makeEntry('inaktiv'),
      makeEntry('inkompatibel', { apiVersion: '2.0' }),
      { ok: false, dirName: 'kaputt', dir: 'C:/profil/extensions/kaputt', error: 'JSON defekt' },
    ]);
    const container = mountPage();
    activateSection(container, 'extensionsExternal');
    const rows = container.querySelectorAll('.settings-extension-external-row');
    expect(rows).toHaveLength(3);

    const inaktiv = container.querySelector('[data-extension-id="inaktiv"]');
    expect(inaktiv.dataset.status).toBe('inactive');
    expect(inaktiv.querySelector('.settings-extension-external-path').textContent).toContain(
      'extensions/inaktiv',
    );
    expect(inaktiv.querySelector('#btn-ext-external-enable-inaktiv')).toBeTruthy();
    expect(inaktiv.querySelector('#btn-ext-external-remove-inaktiv')).toBeTruthy();

    // Inkompatibel: kein Aktivieren, Entfernen bleibt möglich.
    const inkompatibel = container.querySelector('[data-extension-id="inkompatibel"]');
    expect(inkompatibel.dataset.status).toBe('incompatible');
    expect(inkompatibel.querySelector('#btn-ext-external-enable-inkompatibel')).toBeNull();
    expect(inkompatibel.querySelector('#btn-ext-external-remove-inkompatibel')).toBeTruthy();

    // Ungültiges Manifest: Fehlertext, keine Aktionen (Aufräumen über
    // „Ordner öffnen").
    const kaputt = container.querySelector('[data-extension-id="kaputt"]');
    expect(kaputt.dataset.status).toBe('invalid');
    expect(kaputt.querySelector('.settings-extension-external-error').textContent).toContain(
      'JSON defekt',
    );
    expect(kaputt.querySelector('.settings-extension-external-actions')).toBeNull();
  });

  it('Aktivieren läuft über den Warn-Dialog; Abbrechen ändert nichts', async () => {
    host.resetExternalHostForTests([makeEntry('demo')]);
    let confirmCalls = 0;
    let confirmResult = false;
    window.api.confirmExternalExtensionTrust = async () => {
      confirmCalls += 1;
      return confirmResult;
    };
    const container = mountPage();
    activateSection(container, 'extensionsExternal');
    const enableBtn = container.querySelector('#btn-ext-external-enable-demo');
    enableBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(confirmCalls).toBe(1);
    expect(host.isExternalExtensionActive('demo')).toBe(false);

    confirmResult = true;
    container.querySelector('#btn-ext-external-enable-demo').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(host.isExternalExtensionActive('demo')).toBe(true);
  });

  it('Deaktivieren wirkt sofort und die Zeile wechselt den Status', async () => {
    host.resetExternalHostForTests([makeEntry('demo')]);
    await host.applyExternalStateForTests({
      enabled: ['demo'],
      trusted: { demo: '1.0.0' },
      errors: {},
    });
    const container = mountPage();
    activateSection(container, 'extensionsExternal');
    const row = container.querySelector('[data-extension-id="demo"]');
    expect(row.dataset.status).toBe('active');
    container.querySelector('#btn-ext-external-disable-demo').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(host.isExternalExtensionActive('demo')).toBe(false);
    const rerendered = container.querySelector('[data-extension-id="demo"]');
    expect(rerendered.dataset.status).toBe('inactive');
  });

  it('Fehler-Einträge zeigen den persistierten Fehlertext', async () => {
    host.resetExternalHostForTests([makeEntry('defekt')]);
    await host.applyExternalStateForTests({
      enabled: [],
      trusted: {},
      errors: { defekt: 'Absichtlich defekt (Test)' },
    });
    const container = mountPage();
    activateSection(container, 'extensionsExternal');
    const row = container.querySelector('[data-extension-id="defekt"]');
    expect(row.dataset.status).toBe('error');
    expect(row.querySelector('.settings-extension-external-error').textContent).toContain(
      'Absichtlich defekt',
    );
    // Erneutes Aktivieren bleibt als Aktion verfügbar (löscht den Fehler).
    expect(row.querySelector('#btn-ext-external-enable-defekt')).toBeTruthy();
  });
});
