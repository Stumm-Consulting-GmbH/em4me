// @vitest-environment jsdom
// 4T-000295 (Epic 3E-000052): Bereich „Erweiterungen" der Einstellungs-Seite —
// Bereichs-Registrierung, Schalter-Zeilen mit Abhängigkeits-Hinweis,
// Entwurfs-/Anwenden-Semantik, dynamisches Verschwinden erweiterungs-
// eigener Bereiche (Task-Status) und Rückfall auf den Bereich
// „Erweiterungen", wenn der offene Bereich wegfällt.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { allExtensions } from '../../../src/shared/extensions/extensions.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

// Vorherige Mounts abraeumen: doppelte Element-IDs aus Vor-Tests lassen
// jsdom ID-Selektoren sonst am falschen (alten) Container aufloesen.
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

function navIds(container) {
  return [...container.querySelectorAll('.settings-nav-entry')].map((b) => b.dataset.sectionId);
}

function activateSection(container, id) {
  const btn = container.querySelector(`.settings-nav-entry[data-section-id="${id}"]`);
  btn.click();
}

describe('Bereich Erweiterungen (4T-000295)', () => {
  beforeEach(() => {
    lifecycle.resetExtensionStateForTests();
  });

  it('Bereich ist registriert; Task-Status erscheint als erweiterungs-eigener Bereich', () => {
    const ids = settingsPage.settingsSections().map((s) => s.id);
    expect(ids).toContain('extensions');
    expect(ids).toContain('taskStates');
  });

  it('rendert eine Schalter-Zeile pro Erweiterung, gruppiert nach Kategorie', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const rows = container.querySelectorAll('.settings-extension-row');
    expect(rows.length).toBe(allExtensions().length);
    expect(container.querySelectorAll('.settings-extensions-group-title').length).toBe(3);
    const katexToggle = container.querySelector('#settings-extension-katex');
    expect(katexToggle.checked).toBe(true);
  });

  it('Abwählen von wiki-links sperrt wiki-embeds mit Abhängigkeits-Hinweis (nur Entwurf)', () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const wikiToggle = container.querySelector('#settings-extension-wiki-links');
    wikiToggle.checked = false;
    wikiToggle.dispatchEvent(new Event('change'));
    const embedsRow = container.querySelector(
      '.settings-extension-row[data-extension-id="wiki-embeds"]',
    );
    const embedsToggle = embedsRow.querySelector('.settings-extension-toggle');
    expect(embedsToggle.checked).toBe(false);
    expect(embedsToggle.disabled).toBe(true);
    expect(embedsRow.querySelector('.settings-extension-dependency-hint')).toBeTruthy();
    // Entwurfs-Semantik: noch nichts angewendet.
    expect(lifecycle.isExtensionActive('wiki-links')).toBe(true);
    expect(settingsPage.settingsPageStateForTests().draft.extensionsDisabled).toContain(
      'wiki-links',
    );
  });

  it('Anwenden schaltet um; deaktivierte task-states nimmt ihren Bereich mit', async () => {
    const container = mountPage();
    activateSection(container, 'extensions');
    const toggle = container.querySelector('#settings-extension-task-states');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(await settingsPage.applySettingsPage()).toBe(true);
    expect(lifecycle.isExtensionActive('task-states')).toBe(false);
    expect(settingsPage.settingsSections().some((s) => s.id === 'taskStates')).toBe(false);
  });

  it('faellt auf den Bereich Erweiterungen zurueck, wenn der offene Bereich wegfaellt', async () => {
    const container = mountPage();
    activateSection(container, 'taskStates');
    expect(settingsPage.settingsPageStateForTests().activeSectionId).toBe('taskStates');
    // Deaktivierung von aussen (z.B. Broadcast eines anderen Fensters).
    await lifecycle.applyExtensionsState(['task-states'], { persist: false });
    // Re-Mount wie beim Pane-Re-Render einer System-Seite.
    container.remove();
    const remounted = mountPageWithoutReset();
    expect(settingsPage.settingsPageStateForTests().activeSectionId).toBe('extensions');
    expect(navIds(remounted)).not.toContain('taskStates');
  });
});

// Re-Mount ohne onOpen (der Entwurf bleibt erhalten — Verhalten von
// renderSystemPane bei Sprachwechsel/Re-Render).
function mountPageWithoutReset() {
  removeStaleContainers();
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  const container = document.createElement('div');
  container.dataset.testSettings = '1';
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}
