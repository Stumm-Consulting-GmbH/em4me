// @vitest-environment jsdom
// 4T-0612 (Epic 3E-0115, PO-Testbefund EXE 0.91.0.919): Regressionstest gegen
// die doppelte Ordner-Struktur im Bereichs-Panel. renderAreaPanel ist async und
// haengte seine Baum-Zeilen ueber mehrere await-Punkte an; zwei ueberlappende
// Laeufe derselben Pane (der Bereichs-Wechsel-Push refreshAreaPanels und das
// Slot-Mounting der Startsequenz applyAllLayouts rufen beide renderAreaPanel)
// leerten den Baum nur je zu Beginn und haengten danach beide an — die Struktur
// erschien doppelt. Der Fix baut in ein losgeloestes Fragment und setzt es nur
// ein, wenn der Lauf nicht von einem juengeren ueberholt wurde (Generation).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Bereichs-Sektion in Pane 0 einhaengen, BEVOR area-panel.js laedt — getPaneEls
// memoisiert die Element-Referenzen beim ersten Zugriff (Modul-Ladezeit).
const pane0 = document.querySelector('.pane-group[data-pane="0"]');
pane0.innerHTML = `
  <section class="sidebar-section sidebar-area">
    <div class="area-empty" hidden></div>
    <div class="area-split">
      <div class="area-tree"></div>
      <div class="area-files-title"></div>
      <button class="area-new-file-btn"></button>
      <div class="area-files"></div>
    </div>
  </section>
`;

// Verzeichnis-Listing: eine Wurzel ohne Unterordner. Jede renderAreaPanel-Runde
// haengt damit genau eine Baum-Zeile (die Wurzel) an. areaListDir wird als
// echtes (Mikrotask-aufgeloestes) Promise zurueckgegeben, sodass zwei parallel
// gestartete Laeufe tatsaechlich interleaven.
window.api.areaListDir = async () => ({ ok: true, dirs: [], files: [] });

const { invalidateAreaListings, renderAreaPanel } =
  await import('../../../src/renderer/modules/area-panel.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { setPlatformForTests } = await import('../../../src/shared/platform.js');

beforeEach(() => {
  state.areaPath = 'C:\\Bereich';
  state.areaName = 'Bereich';
  state.areaPanel.selectedDirByPane[0] = null;
  state.areaPanel.expandedByPane[0] = [];
  pane0.querySelector('.area-tree').innerHTML = '';
  pane0.querySelector('.area-files').innerHTML = '';
});

describe('renderAreaPanel Concurrency (4T-0612)', () => {
  it('zwei ueberlappende Laeufe verdoppeln die Baum-Liste nicht', async () => {
    const tree = pane0.querySelector('.area-tree');
    // Zwei Laeufe gleichzeitig starten (ohne Await dazwischen) — genau der
    // Renn-Fall aus Bereichs-Wechsel-Push und Startsequenz.
    const p1 = renderAreaPanel(0);
    const p2 = renderAreaPanel(0);
    await Promise.all([p1, p2]);
    // Ohne den Fix stuenden hier zwei Wurzel-Zeilen (additives Anhaengen).
    expect(tree.querySelectorAll('.area-dir-row').length).toBe(1);
  });

  it('ein einzelner Lauf rendert die Baum-Liste genau einmal', async () => {
    const tree = pane0.querySelector('.area-tree');
    await renderAreaPanel(0);
    expect(tree.querySelectorAll('.area-dir-row').length).toBe(1);
  });

  it('mehrere aufeinanderfolgende Laeufe bleiben idempotent', async () => {
    const tree = pane0.querySelector('.area-tree');
    await renderAreaPanel(0);
    await renderAreaPanel(0);
    await renderAreaPanel(0);
    expect(tree.querySelectorAll('.area-dir-row').length).toBe(1);
  });
});

// 4T-1225 (Epic 3E-0122, Befund F1 des Linux-Lauffaehigkeits-Nachweises):
// joinPath verkettete hart mit Backslash; unter Linux entstand fuer den
// aufgeklappten Unterordner `/bereich\ordner`, dessen readdir im Main still
// scheiterte — Baum und Dateiliste blieben leer («Keine Markdown-Dateien»).
// Der Trenner kommt jetzt aus dem zentralen Plattform-Modul.
describe('joinPath je Plattform (4T-1225)', () => {
  it('fragt Unterordner unter Linux mit Schraegstrich an', async () => {
    setPlatformForTests('linux');
    const angefragt = [];
    window.api.areaListDir = async (dirPath) => {
      angefragt.push(dirPath);
      return dirPath === '/Bereich'
        ? { ok: true, dirs: ['Notizen'], files: [] }
        : { ok: true, dirs: [], files: [] };
    };
    invalidateAreaListings();
    state.areaPath = '/Bereich';
    state.areaName = 'Bereich';
    state.areaPanel.expandedByPane[0] = ['/Bereich'];
    try {
      await renderAreaPanel(0);
    } finally {
      setPlatformForTests(undefined);
      window.api.areaListDir = async () => ({ ok: true, dirs: [], files: [] });
      invalidateAreaListings();
    }
    expect(angefragt).toContain('/Bereich/Notizen');
    expect(angefragt.some((p) => p.includes('\\'))).toBe(false);
  });
});
