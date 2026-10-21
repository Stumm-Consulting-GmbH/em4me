// @vitest-environment jsdom
// 4T-002227 (Epic 3E-000356, Story 4S-000028): Unit-Prüfungen der Seite
// «Arbeitsbereiche», die das Pop-up «Arbeitsbereiche verwalten» ablöst.
//
// Gemessen wird, was ohne gebautes Programm messbar ist: die Registrierung und
// das Öffnen als pfadloser Reiter samt zweitem Öffnen (AK1), das Tor des
// Öffners und das Neuzeichnen beim Aus- und Wiedereinschalten der Erweiterung
// (AK9), der Aufbau der Zeile mit der Pfad-Zeile nur bei Bindung (AK2), die
// leere Liste (AK8), der Bedienweg der Pfeile — genau eine Bewegung je
// Auslösung, danach der Fokus am verschobenen Eintrag (AK4) — und das Halten
// des Fokus, wenn ein anderes Fenster die Liste ändert (AK5).
//
// **Was hier nicht gemessen wird und wo es steht.** Gestalt, Umbruch im
// schmalen Fenster und die Auslösung eines Knopfs durch Eingabe- oder
// Leertaste sind Leistungen des Browsers und der Stil-Kaskade, die jsdom nicht
// kennt; sie tragen die Ablauf-Fälle WS-05 bis WS-14 in
// test/e2e/funktionen/arbeitsbereiche.spec.js und arbeitsbereiche-seite.spec.js.
// Die Gruppe «Bedienweg der Aufrufer» liest ausschließlich Quelltext (die
// Dispatcher-Module sind im Unit-Kontext nicht ladbar, Begründung in
// kommando-dispatcher.test.js); ihre Wirkung weist WS-09 nach.
//
// Der Preload ist gemockt (Muster memory-page.test.js: window.api-Stub plus
// Spalten-Markup VOR dem Modul-Import). Ohne geladenes Wörterbuch liefert t()
// den Schlüssel selbst; geprüft wird deshalb gegen Schlüssel und Struktur.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
      <section class="pane pane-mindmap"></section>
    </div>
  `;
}
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};
// jsdom kennt CSS.escape nicht; die Seite adressiert ihre Zeilen darüber
// (Kennungen aus der Ablage). Für die Kennungen dieser Fälle genügt das
// Maskieren von Anführungszeichen und Rückstrich.
if (!globalThis.CSS) globalThis.CSS = {};
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (wert) => String(wert).replace(/["\\]/g, '\\$&');
}

// Ablage und Aufrufe des Hauptprozesses, so weit die Seite sie anfasst.
let ablage = [];
let listenRufe = 0;
const verschoben = [];
const geoeffnet = [];
let geaendert = null;
window.api.workspacesList = async () => {
  listenRufe += 1;
  return ablage.map((w) => ({ ...w }));
};
window.api.workspaceReorder = async (auftrag) => {
  verschoben.push(auftrag);
  return { ok: true };
};
window.api.workspaceOpen = async (id) => {
  geoeffnet.push(id);
  return { ok: true };
};
window.api.workspaceConfirmDelete = async () => ({ confirmed: false });
window.api.workspaceDelete = async () => ({ ok: true });
window.api.onWorkspacesChanged = (handler) => {
  geaendert = handler;
};

const seitenModul = await import('../../../src/renderer/modules/app/workspaces-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

// Die Seite registriert sich beim Laden des Moduls (Vorbild
// datenbank-uebersicht-seite.js); der Import oben hat das schon getan.

const ID = seitenModul.WORKSPACES_PAGE_ID;

function ws(id, name, extra = {}) {
  return {
    id,
    name,
    color: 'blue',
    open: false,
    lastOpenedAt: null,
    areaPath: null,
    ...extra,
  };
}

// Mehrere Mikrotask-Runden: Abruf der Liste und der anschließende Neuaufbau.
async function warteAufAufbau() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// Lebenszyklus wie beim echten Öffnen: onOpen setzt den frischen Zustand, der
// Container trägt den Besitz-Merker, den renderSystemPane setzt, und mount
// baut auf.
async function mountPage() {
  const def = systemPages.systemPageById(ID);
  def.onOpen();
  const container = document.createElement('div');
  container.dataset.systemPage = ID;
  document.body.appendChild(container);
  def.mount(container);
  await warteAufAufbau();
  return container;
}

// Reiter der Seite aus allen Spalten nehmen, damit jeder Fall frisch beginnt.
function schliesseReiter() {
  for (const pane of state.panes) pane.tabs = pane.tabs.filter((tb) => tb.systemPage !== ID);
  const def = systemPages.systemPageById(ID);
  def.onClose();
}

beforeEach(() => {
  schliesseReiter();
  lebenszyklus.resetExtensionStateForTests();
  ablage = [];
  listenRufe = 0;
  verschoben.length = 0;
  geoeffnet.length = 0;
});

describe('Registrierung und Öffnen als pfadloser Reiter (AK1)', () => {
  it('ist unter der Kennung workspaces registriert und trägt den Titel-Schlüssel', () => {
    const def = systemPages.systemPageById(ID);
    expect(def).toBeTruthy();
    expect(def.id).toBe('workspaces');
    expect(def.titleKey).toBe('workspace.page.title');
    expect(typeof def.onOpen).toBe('function');
    expect(typeof def.onClose).toBe('function');
  });

  it('öffnet einen pfadlosen Reiter, und das zweite Öffnen legt keinen zweiten an', () => {
    seitenModul.openWorkspacesPage();
    const treffer = systemPages.findSystemTabAcrossPanes(ID);
    expect(treffer, 'kein Reiter der Seite').toBeTruthy();
    const tab = state.panes[treffer.paneIdx].tabs[treffer.tabIdx];
    expect(tab.path).toBe(null);
    expect(tab.systemPage).toBe('workspaces');

    const vorher = systemPages.systemPageOpenCount(ID);
    seitenModul.openWorkspacesPage();
    expect(systemPages.systemPageOpenCount(ID)).toBe(vorher + 1);
    expect(systemPages.findSystemTabAcrossPanes(ID)).toEqual(treffer);
    const reiter = state.panes.flatMap((p) => p.tabs).filter((tb) => tb.systemPage === ID);
    expect(reiter).toHaveLength(1);
  });
});

describe('Tor des Öffners und Neuzeichnen beim Umschalten (AK9)', () => {
  it('öffnet im Aus-Zustand der Erweiterung nichts', async () => {
    await lebenszyklus.applyExtensionsState(['workspaces'], { persist: false });
    const vorher = systemPages.systemPageOpenCount(ID);
    seitenModul.openWorkspacesPage();
    expect(systemPages.findSystemTabAcrossPanes(ID)).toBe(null);
    // Nicht einmal die Anforderung kommt an: Das Tor steht vor openSystemPage.
    expect(systemPages.systemPageOpenCount(ID)).toBe(vorher);
  });

  it('zeigt bei offener Seite im Aus-Zustand den Hinweis und keine Schaltfläche, danach wieder die Liste', async () => {
    ablage = [ws('a', 'Alpha'), ws('b', 'Beta')];
    const container = await mountPage();
    expect(container.querySelectorAll('.workspace-row')).toHaveLength(2);

    await lebenszyklus.applyExtensionsState(['workspaces'], { persist: false });
    await warteAufAufbau();
    expect(container.querySelector('.workspaces-page-off').textContent).toBe(
      'workspace.page.extensionOff',
    );
    expect(container.querySelectorAll('.workspace-row')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    // Kopf und Satz bleiben stehen: Die Seite ist geöffnet, nur ohne Liste.
    expect(container.querySelector('.workspaces-page-heading').textContent).toBe(
      'workspace.page.title',
    );

    // Eine Änderung im Aus-Zustand ändert die Anzeige nicht.
    ablage = [ws('a', 'Alpha'), ws('b', 'Beta'), ws('c', 'Gamma')];
    await lebenszyklus.applyExtensionsState([], { persist: false });
    await warteAufAufbau();
    expect(container.querySelector('.workspaces-page-off')).toBe(null);
    const namen = [...container.querySelectorAll('.workspace-row-name')].map((n) => n.textContent);
    expect(namen).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('Aufbau der Zeilen (AK2, AK8)', () => {
  it('führt Name, Pfad und Zustand in dieser Folge und die Pfad-Zeile nur bei Bindung', async () => {
    ablage = [
      ws('a', 'Alpha', { open: true, areaPath: 'C:\\Ablage\\Tief\\Verschachtelt\\Projekt' }),
      ws('b', 'Beta'),
    ];
    const container = await mountPage();
    const zeilen = [...container.querySelectorAll('.workspace-row')];
    expect(zeilen).toHaveLength(2);

    const teile = [...zeilen[0].querySelector('.workspace-row-text').children].map(
      (n) => n.className,
    );
    expect(teile).toEqual(['workspace-row-name', 'workspace-row-path', 'workspace-row-meta']);
    expect(zeilen[0].querySelector('.workspace-row-path').textContent).toBe(
      'workspace.manager.area',
    );
    expect(zeilen[0].querySelector('.workspace-dot').classList.contains('open')).toBe(true);
    expect(zeilen[0].querySelector('.workspace-row-meta').textContent).toBe(
      'workspace.manager.stateOpen',
    );
    // Ohne Bindung keine Pfad-Zeile, kein Platzhalter.
    expect(zeilen[1].querySelector('.workspace-row-path')).toBe(null);
    expect(zeilen[1].querySelector('.workspace-dot').classList.contains('open')).toBe(false);
  });

  it('stellt die Schaltflächen in der Reihenfolge des Pop-ups und blendet die Ränder ab', async () => {
    ablage = [ws('a', 'Alpha'), ws('b', 'Beta'), ws('c', 'Gamma')];
    const container = await mountPage();
    const zeilen = [...container.querySelectorAll('.workspace-row')];
    const beschriftung = [...zeilen[1].querySelectorAll('.workspace-row-actions .btn')].map(
      (k) => k.getAttribute('aria-label') || k.textContent,
    );
    expect(beschriftung).toEqual([
      'workspace.manager.open',
      'workspace.manager.rename',
      'workspace.manager.delete',
      'workspace.manager.moveUp',
      'workspace.manager.moveDown',
    ]);
    expect(zeilen[0].querySelector('[data-workspace-move="up"]').disabled).toBe(true);
    expect(zeilen[0].querySelector('[data-workspace-move="down"]').disabled).toBe(false);
    expect(zeilen[2].querySelector('[data-workspace-move="down"]').disabled).toBe(true);
    // Der zugängliche Name nennt Richtung und Arbeitsbereich.
    const ab = zeilen[1].querySelector('[data-workspace-move="down"]');
    const [selbst, name] = ab.getAttribute('aria-labelledby').split(' ');
    expect(selbst).toBe(ab.id);
    expect(document.getElementById(name).textContent).toBe('Beta');
    // Keine Schaltflächen-Leiste: Jede Schaltfläche gehört zu einer Zeile.
    const alle = container.querySelectorAll('button');
    const inZeilen = container.querySelectorAll('.workspace-row button');
    expect(alle.length).toBe(inZeilen.length);
  });

  it('zeigt ohne Arbeitsbereich den Hinweis statt einer Liste', async () => {
    const container = await mountPage();
    expect(container.querySelector('.workspaces-page-placeholder').textContent).toBe(
      'workspace.manager.empty',
    );
    expect(container.querySelectorAll('.workspace-row')).toHaveLength(0);
    expect(container.querySelector('.workspaces-page-note').textContent).toBe(
      'workspace.page.note',
    );
  });
});

describe('Bedienweg der Pfeile und Halten des Fokus (AK4, AK5)', () => {
  it('löst je Auslösung genau eine Bewegung aus und stellt danach den Fokus am Eintrag her', async () => {
    ablage = [ws('a', 'Alpha'), ws('b', 'Beta'), ws('c', 'Gamma')];
    const container = await mountPage();
    const ab = container.querySelector(
      '.workspace-row[data-workspace-id="a"] [data-workspace-move="down"]',
    );
    ab.focus();
    ab.click();
    await warteAufAufbau();
    expect(verschoben).toEqual([{ id: 'a', direction: 'down' }]);

    // Der Hauptprozess meldet die Änderung; die Seite baut neu auf.
    ablage = [ws('b', 'Beta'), ws('a', 'Alpha'), ws('c', 'Gamma')];
    geaendert();
    await warteAufAufbau();
    const aktiv = document.activeElement;
    expect(aktiv.dataset.workspaceMove).toBe('down');
    expect(aktiv.closest('.workspace-row').dataset.workspaceId).toBe('a');

    // Am Rand übernimmt die Gegenrichtung derselben Zeile.
    aktiv.click();
    ablage = [ws('b', 'Beta'), ws('c', 'Gamma'), ws('a', 'Alpha')];
    geaendert();
    await warteAufAufbau();
    expect(verschoben).toHaveLength(2);
    expect(document.activeElement.dataset.workspaceMove).toBe('up');
    expect(document.activeElement.closest('.workspace-row').dataset.workspaceId).toBe('a');
  });

  it('hält den Fokus auf derselben Aktion, wenn ein anderes Fenster die Liste ändert', async () => {
    ablage = [ws('a', 'Alpha'), ws('b', 'Beta')];
    const container = await mountPage();
    container
      .querySelector('.workspace-row[data-workspace-id="b"] [data-workspace-action="rename"]')
      .focus();

    ablage = [ws('a', 'Alpha umbenannt'), ws('b', 'Beta')];
    geaendert();
    await warteAufAufbau();
    expect(container.querySelector('.workspace-row-name').textContent).toBe('Alpha umbenannt');
    expect(document.activeElement.dataset.workspaceAction).toBe('rename');
    expect(document.activeElement.closest('.workspace-row').dataset.workspaceId).toBe('b');
  });

  it('zeichnet nicht in einen Container, den inzwischen eine andere Seite besitzt', async () => {
    ablage = [ws('a', 'Alpha')];
    const container = await mountPage();
    container.dataset.systemPage = 'settings';
    container.innerHTML = '<div class="fremde-seite"></div>';
    const vorher = listenRufe;
    geaendert();
    await warteAufAufbau();
    // Die Liste wird nachgeholt, gezeichnet wird nicht.
    expect(listenRufe).toBe(vorher + 1);
    expect(container.querySelector('.fremde-seite')).toBeTruthy();
    expect(container.querySelector('.workspaces-page')).toBe(null);
  });

  it('öffnet über «Öffnen» den Arbeitsbereich der Zeile', async () => {
    ablage = [ws('a', 'Alpha'), ws('b', 'Beta')];
    const container = await mountPage();
    container
      .querySelector('.workspace-row[data-workspace-id="b"] [data-workspace-action="open"]')
      .click();
    expect(geoeffnet).toEqual(['b']);
  });
});

// Liest ausschließlich Quelltext: Die Dispatcher-Module ziehen beim Import den
// halben Anzeige-Prozess nach sich. Die Wirkung beider Wege weist WS-09 nach.
describe('Bedienweg der Aufrufer (AK1, AK10)', () => {
  const HIER = path.dirname(fileURLToPath(import.meta.url));
  const lies = (rel) => fs.readFileSync(path.resolve(HIER, '..', '..', '..', rel), 'utf8');

  it('Kommando und Menü-Kanal rufen den Öffner der Seite', () => {
    const kommandos = lies('src/renderer/modules/app/app-commands.js');
    expect(kommandos).toMatch(/'workspace\.manage': \(\) => \{\s*openWorkspacesPage\(\);\s*\}/);
    const menue = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(menue).toContain('api.onMenuWorkspaceManage(() => openWorkspacesPage());');
  });

  it('das Pop-up ist aus Markup und Code verschwunden', () => {
    for (const datei of [
      'src/renderer/index.html',
      'src/renderer/modules/app/workspaces.js',
      'src/renderer/modules/app/app-commands.js',
      'src/renderer/modules/app/app-menu-bindings.js',
    ]) {
      const text = lies(datei);
      expect(text, datei).not.toContain('workspace-manager');
      expect(text, datei).not.toContain('showWorkspaceManager');
    }
  });
});
