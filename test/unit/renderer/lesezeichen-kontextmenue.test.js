// @vitest-environment jsdom
// 4T-002176 (Epic 3E-000352): Kontextmenue des Lesezeichen-Panels am Bedienweg.
//
// Seit der Zweiteilung des Panels hingen die Kontextmenues allein an den beiden
// Abschnitts-Gruppen. Die sind nur so hoch wie ihr Inhalt; ein Rechtsklick in
// die freie Flaeche darunter traf den Panel-Rumpf, an dem kein Handler mehr
// hing, und oeffnete nichts. Ohne vorhandenen Ordner liess sich damit kein
// erster Ordner anlegen. Geprueft wird hier am Bedienweg selbst, also am
// Rechtsklick auf den Rumpf, auf eine Gruppe und auf eine Lesezeichen-Zeile:
//
//   1. Die freie Flaeche oeffnet "Neuer Ordner" und legt ihn in der Wurzel an.
//   2. Ein Lesezeichen bietet "Neuer Ordner" an erster Stelle an und legt den
//      Ordner auf seiner Ebene an, in der Wurzel wie in einem Ordner
//      (Entscheidung des Product Owners vom 2026-10-08).
//   3. Die freie Flaeche gehoert dem naechstgelegenen sichtbaren Abschnitt.
//
// Der reale Klickweg an einer Koordinate der freien Flaeche liegt im
// Ablauf-Fall BL-08 (test/e2e/funktionen/bereichs-lesezeichen.spec.js); jsdom
// kennt kein Layout und damit keine Flaeche unterhalb einer Gruppe.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Der Baum-Aufbau prueft je Datei-Lesezeichen, ob das Ziel noch existiert.
window.api.fileExists = async () => true;
// Das Anlegen holt das Panel nach vorn und meldet dabei den Menue-Zustand.
window.api.reportMenuState = () => {};

// Panel-Markup VOR dem Modul-Import, weil getPaneEls die Element-Referenzen
// beim ersten Zugriff memoisiert (Muster book-panel.test.js). Aufbau wie in
// src/renderer/index.html.
const pane0 = document.querySelector('.pane-group[data-pane="0"]');
pane0.innerHTML = `
  <section class="sidebar-section sidebar-bookmarks">
    <header class="sidebar-section-header">
      <h2 class="sidebar-section-title">Lesezeichen</h2>
    </header>
    <div class="sidebar-section-body">
      <div class="bookmarks-group bookmarks-group-area" hidden>
        <div class="bookmarks-group-head">Bereichs-Lesezeichen</div>
        <div class="bookmarks-area-empty" hidden></div>
        <ul class="bookmarks-area-tree"></ul>
      </div>
      <div class="bookmarks-group bookmarks-group-general">
        <div class="bookmarks-group-head" hidden>Lesezeichen</div>
        <div class="bookmarks-empty"></div>
        <ul class="bookmarks-tree"></ul>
      </div>
    </div>
  </section>
`;

const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { renderBookmarks, freeAreaSectionKind } =
  await import('../../../src/renderer/modules/bookmarks/bookmarks-render.js');
const { SECTION_AREA, SECTION_GENERAL } =
  await import('../../../src/renderer/modules/bookmarks/bookmarks-tree.js');

const rumpf = pane0.querySelector('.sidebar-bookmarks .sidebar-section-body');
const gruppeBereich = pane0.querySelector('.bookmarks-group-area');
const gruppeAllgemein = pane0.querySelector('.bookmarks-group-general');

function rechtsklick(ziel, clientY = 400) {
  const ev = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 50,
    clientY,
  });
  ziel.dispatchEvent(ev);
  return ev;
}

function menueKennungen() {
  return [...document.querySelectorAll('#context-menu .context-menu-item')].map(
    (el) => el.dataset.menuId || '',
  );
}

async function waehle(kennung) {
  const eintrag = document.querySelector(`#context-menu [data-menu-id="${kennung}"]`);
  expect(eintrag).not.toBeNull();
  eintrag.click();
  // createNewFolderUI ist asynchron (Speichern, Panel nach vorn holen).
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

const ordner = (liste) => liste.filter((n) => n.type === 'folder');

beforeEach(() => {
  state.areaPath = null;
  state.bookmarks.editingId = null;
  state.bookmarks.editingIsNew = false;
  state.bookmarks.tree = [
    {
      type: 'folder',
      id: 'f-ablage',
      name: 'Ablage',
      expanded: true,
      children: [{ type: 'file', id: 'b-innen', filePath: 'C:/notizen/innen.md' }],
    },
    { type: 'file', id: 'b-wurzel', filePath: 'C:/notizen/wurzel.md' },
  ];
  renderBookmarks(0);
  document.getElementById('context-menu').innerHTML = '';
});

describe('Lesezeichen-Panel: Rechtsklick in die freie Flaeche (4T-002176)', () => {
  it('oeffnet "Neuer Ordner" am Panel-Rumpf ausserhalb der Gruppen', () => {
    const ev = rechtsklick(rumpf);
    expect(ev.defaultPrevented).toBe(true);
    expect(menueKennungen()).toEqual(['bookmark-new-folder']);
  });

  it('legt den Ordner in der Wurzel an', async () => {
    rechtsklick(rumpf);
    await waehle('bookmark-new-folder');
    expect(ordner(state.bookmarks.tree).map((n) => n.id)).toHaveLength(2);
    expect(ordner(state.bookmarks.tree[0].children)).toHaveLength(0);
    expect(state.bookmarks.editingIsNew).toBe(true);
  });

  it('bindet den Rumpf-Handler nur einmal, auch nach erneutem Aufbau', () => {
    renderBookmarks(0);
    renderBookmarks(0);
    rechtsklick(rumpf);
    expect(menueKennungen()).toEqual(['bookmark-new-folder']);
  });
});

describe('Lesezeichen-Panel: "Neuer Ordner" im Menue eines Lesezeichens (4T-002176)', () => {
  it('steht an erster Stelle, die uebrigen Eintraege bleiben', () => {
    const zeile = pane0.querySelector('li[data-id="b-wurzel"] > .bookmark-row');
    rechtsklick(zeile);
    const kennungen = menueKennungen();
    expect(kennungen[0]).toBe('bookmark-new-folder');
    expect(kennungen.length).toBeGreaterThanOrEqual(4);
  });

  it('legt den Ordner bei einem Lesezeichen in der Wurzel in der Wurzel an', async () => {
    rechtsklick(pane0.querySelector('li[data-id="b-wurzel"] > .bookmark-row'));
    await waehle('bookmark-new-folder');
    expect(ordner(state.bookmarks.tree)).toHaveLength(2);
    expect(ordner(state.bookmarks.tree[0].children)).toHaveLength(0);
  });

  it('legt den Ordner bei einem Lesezeichen in einem Ordner in diesem Ordner an', async () => {
    rechtsklick(pane0.querySelector('li[data-id="b-innen"] > .bookmark-row'));
    await waehle('bookmark-new-folder');
    expect(ordner(state.bookmarks.tree)).toHaveLength(1);
    const ablage = state.bookmarks.tree.find((n) => n.id === 'f-ablage');
    expect(ordner(ablage.children)).toHaveLength(1);
  });

  it('das Menue eines Ordners bleibt bei "Neuer Unterordner"', () => {
    rechtsklick(pane0.querySelector('li[data-id="f-ablage"] > .bookmark-row'));
    expect(menueKennungen()).not.toContain('bookmark-new-folder');
    expect(menueKennungen()[0]).toBe('bookmark-new-subfolder');
  });
});

describe('Lesezeichen-Panel: Abschnitt der freien Flaeche (4T-002176)', () => {
  function mitBereich(bereichOben) {
    gruppeBereich.hidden = false;
    if (bereichOben) rumpf.insertBefore(gruppeBereich, gruppeAllgemein);
    else rumpf.insertBefore(gruppeAllgemein, gruppeBereich);
    const [erste] = [...rumpf.children];
    erste.getBoundingClientRect = () => ({ top: 100, bottom: 160, left: 0, right: 200 });
  }

  it('ohne Bereich gehoert die Flaeche dem allgemeinen Abschnitt', () => {
    gruppeBereich.hidden = true;
    expect(freeAreaSectionKind(rumpf, 20)).toBe(SECTION_GENERAL);
    expect(freeAreaSectionKind(rumpf, 600)).toBe(SECTION_GENERAL);
  });

  it('unterhalb der Eintraege dem unteren, oberhalb dem oberen Abschnitt', () => {
    mitBereich(true);
    expect(freeAreaSectionKind(rumpf, 600)).toBe(SECTION_GENERAL);
    expect(freeAreaSectionKind(rumpf, 50)).toBe(SECTION_AREA);
    mitBereich(false);
    expect(freeAreaSectionKind(rumpf, 600)).toBe(SECTION_AREA);
    expect(freeAreaSectionKind(rumpf, 50)).toBe(SECTION_GENERAL);
    gruppeBereich.hidden = true;
    rumpf.insertBefore(gruppeBereich, gruppeAllgemein);
  });
});
