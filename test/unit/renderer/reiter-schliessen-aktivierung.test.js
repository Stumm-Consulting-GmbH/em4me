// @vitest-environment jsdom
// 4T-002106 (Story 4S-001042): Nach dem Schließen des aktiven Dokuments wird das
// Dokument derselben Spalte aktiv, das zuletzt vor ihm aktiv war; ist keines
// mehr geöffnet, gilt die bisherige Regel (Nachbar im Dokument-Streifen).
//
// Geprüft an der echten Schließ-Regel (`activateTab` und `closeTab` aus
// tabs.js) je Fall der Story, mit dem Bestands-Markup, so weit die Spalten es
// anfassen (Muster datenbank-uebersicht-beim-binden.test.js). Die Reiter sind
// unbenannte Dokumente ohne Pfad, damit kein Datei-Kanal berührt wird.
import { describe, it, expect, beforeEach } from 'vitest';
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
// Die Spalten zeichnen beim Aktivieren neu; der Inhalt ist nicht Gegenstand.
window.api.renderMarkdown = () => '';
// jsdom misst keine Text-Bereiche; der Editor fragt beim Neuzeichnen danach.
const leer = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
Range.prototype.getClientRects = () => [];
Range.prototype.getBoundingClientRect = () => leer;

const { state, createTab } = await import('../../../src/renderer/modules/app/app-state.js');
const { activateTab, closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');

// Legt in der Spalte die Reiter mit den Namen an und aktiviert sie der Reihe
// nach, wie es das Öffnen nacheinander tut.
function oeffne(paneIdx, ...namen) {
  while (state.panes.length <= paneIdx) state.panes.push({ tabs: [], activeIndex: -1 });
  const pane = state.panes[paneIdx];
  for (const name of namen) {
    const tab = createTab(null, `# ${name}\n`, { viewMode: 'rendered' });
    tab.name = name;
    pane.tabs.push(tab);
    activateTab(paneIdx, pane.tabs.length - 1);
  }
}

function aktiv(paneIdx) {
  const pane = state.panes[paneIdx];
  return pane && pane.tabs[pane.activeIndex] ? pane.tabs[pane.activeIndex].name : null;
}

function index(paneIdx, name) {
  return state.panes[paneIdx].tabs.findIndex((t) => t.name === name);
}

async function schliesse(paneIdx, name) {
  await closeTab(paneIdx, index(paneIdx, name), { skipDirtyCheck: true });
}

beforeEach(async () => {
  for (let p = state.panes.length - 1; p >= 0; p--) {
    for (let i = state.panes[p].tabs.length - 1; i >= 0; i--) {
      await closeTab(p, i, { skipDirtyCheck: true });
    }
  }
  state.panes.length = 1;
  state.panes[0].tabs = [];
  state.panes[0].activeIndex = -1;
  state.activePaneIndex = 0;
});

describe('Schließen: das zuvor aktive Dokument wird aktiv (4T-002106)', () => {
  it('AK1: nach dem Schließen des aktiven ist das zuvor aktive wieder aktiv, nicht der Nachbar', async () => {
    oeffne(0, 'A', 'B', 'C');
    activateTab(0, index(0, 'B'));
    oeffne(0, 'D');
    expect(aktiv(0)).toBe('D');
    await schliesse(0, 'D');
    expect(aktiv(0)).toBe('B');
  });

  it('AK1: auch wenn das geschlossene Dokument in der Mitte des Streifens stand', async () => {
    oeffne(0, 'A', 'B', 'C');
    activateTab(0, index(0, 'A'));
    activateTab(0, index(0, 'B'));
    // Bisherige Regel: der rechte Nachbar C. Neue Regel: das zuvor aktive A.
    await schliesse(0, 'B');
    expect(aktiv(0)).toBe('A');
  });

  it('AK3: ist das zuvor aktive geschlossen, wird das davor aktive gewählt', async () => {
    oeffne(0, 'A', 'B', 'C', 'D');
    activateTab(0, index(0, 'A'));
    activateTab(0, index(0, 'B'));
    activateTab(0, index(0, 'D'));
    await schliesse(0, 'B'); // nicht aktiv
    expect(aktiv(0)).toBe('D');
    // Bisherige Regel: der linke Nachbar C. Neue Regel: das davor aktive A.
    await schliesse(0, 'D');
    expect(aktiv(0)).toBe('A');
  });

  it('AK3: ohne zuvor aktives Dokument gilt die bisherige Regel', async () => {
    oeffne(0, 'A', 'B');
    // Ein Reiter, der ohne Aktivierung in den Streifen kam (wie bei der
    // Wiederherstellung der Sitzung), und der Rest der Folge ist geschlossen.
    const ohne = createTab(null, '# X\n', { viewMode: 'rendered' });
    ohne.name = 'X';
    state.panes[0].tabs.splice(0, 0, ohne);
    state.panes[0].activeIndex = index(0, 'B');
    await schliesse(0, 'A');
    expect(aktiv(0)).toBe('B');
    await schliesse(0, 'B');
    expect(aktiv(0)).toBe('X');
  });

  it('AK4: das Schließen eines nicht aktiven Dokuments ändert das aktive nicht', async () => {
    oeffne(0, 'A', 'B', 'C');
    activateTab(0, index(0, 'B'));
    await schliesse(0, 'A');
    expect(aktiv(0)).toBe('B');
    await schliesse(0, 'C');
    expect(aktiv(0)).toBe('B');
  });

  it('AK5: die Regel gilt je Spalte', async () => {
    oeffne(0, 'A', 'B');
    oeffne(1, 'P', 'Q', 'R');
    activateTab(1, index(1, 'P'));
    activateTab(1, index(1, 'R'));
    activateTab(0, index(0, 'A'));
    await schliesse(1, 'R');
    expect(aktiv(1)).toBe('P');
    expect(aktiv(0)).toBe('A');
  });

  it('AK2: eine System-Seite nimmt ohne Sonderregel teil', async () => {
    oeffne(0, 'A', 'B', 'C');
    activateTab(0, index(0, 'B'));
    const seite = createTab(null, '', { viewMode: 'rendered' });
    seite.name = 'Einstellungen';
    seite.systemPage = 'nicht-registriert';
    state.panes[0].tabs.push(seite);
    activateTab(0, state.panes[0].tabs.length - 1);
    await schliesse(0, 'Einstellungen');
    expect(aktiv(0)).toBe('B');
  });
});
