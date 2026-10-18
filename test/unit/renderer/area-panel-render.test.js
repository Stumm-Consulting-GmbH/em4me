// @vitest-environment jsdom
// 4T-000612 (Epic 3E-000115, PO-Testbefund EXE 0.91.0.919): Regressionstest gegen
// die doppelte Ordner-Struktur im Bereichs-Panel. renderAreaPanel ist async und
// haengte seine Baum-Zeilen ueber mehrere await-Punkte an; zwei ueberlappende
// Laeufe derselben Pane (der Bereichs-Wechsel-Push refreshAreaPanels und das
// Slot-Mounting der Startsequenz applyAllLayouts rufen beide renderAreaPanel)
// leerten den Baum nur je zu Beginn und haengten danach beide an — die Struktur
// erschien doppelt. Der Fix baut in ein losgeloestes Fragment und setzt es nur
// ein, wenn der Lauf nicht von einem juengeren ueberholt wurde (Generation).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
const { t } = await import('../../../src/renderer/i18n.js');

beforeEach(() => {
  state.areaPath = 'C:\\Bereich';
  state.areaName = 'Bereich';
  state.areaPanel.selectedDirByPane[0] = null;
  state.areaPanel.expandedByPane[0] = [];
  pane0.querySelector('.area-tree').innerHTML = '';
  pane0.querySelector('.area-files').innerHTML = '';
});

describe('renderAreaPanel Concurrency (4T-000612)', () => {
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

// 4T-001775 (Epic 3E-000304, Entscheidung des Product Owners vom 2026-09-17):
// Die Dateiliste beschriftet ihre Zeilen OHNE Markdown-Endung. Geprueft wird
// hier die ANWENDUNG der gemeinsamen Beschriftungs-Funktion im Aufbau der
// Liste — dass die Zeile den gekuerzten Text traegt, ihr Kurzhinweis dagegen
// den vollen Pfad, und dass zwei gleichstaemmige Dateien beide dastehen (E8).
// Die Kuerzungs-Regel selbst und ihre Randfaelle pruefen die Unit-Faelle zu
// `fileLabelFromBasename` in test/unit/subpages.test.js.
describe('Dateiliste ohne Markdown-Endung (4T-001775)', () => {
  // Die Plattform wird festgelegt, weil der Kurzhinweis den zusammengesetzten
  // Pfad traegt und dessen Trenner sonst vom ausfuehrenden Betriebssystem
  // abhinge (Muster des Linux-Falls unten).
  async function rendereMit(dateien) {
    setPlatformForTests('win32');
    window.api.areaListDir = async () => ({ ok: true, dirs: [], files: dateien });
    invalidateAreaListings();
    try {
      await renderAreaPanel(0);
    } finally {
      setPlatformForTests(undefined);
      window.api.areaListDir = async () => ({ ok: true, dirs: [], files: [] });
      invalidateAreaListings();
    }
    return [...pane0.querySelectorAll('.area-file-row')];
  }

  it('kuerzt die Markdown-Endung in der Beschriftung', async () => {
    const zeilen = await rendereMit(['Konzept.md', 'Notiz.markdown']);
    expect(zeilen.map((z) => z.textContent)).toEqual(['Konzept', 'Notiz']);
  });

  it('haelt den vollen Pfad im Kurzhinweis', async () => {
    const zeilen = await rendereMit(['Konzept.md']);
    // Der Kurzhinweis ist die Auskunft ueber den echten Dateinamen; ohne ihn
    // waere die Kuerzung ein Verlust statt einer Ersparnis.
    expect(zeilen[0].getAttribute('title')).toBe('C:\\Bereich\\Konzept.md');
  });

  it('zeigt zwei gleichstaemmige Dateien mit gleicher Beschriftung, aber eigenem Kurzhinweis', async () => {
    // Variante A: Beide Eintraege bleiben sichtbar und werden ueber den
    // Kurzhinweis unterschieden — keiner verschwindet und keiner wird ergaenzt.
    const zeilen = await rendereMit(['Notiz.markdown', 'Notiz.md']);
    expect(zeilen.map((z) => z.textContent)).toEqual(['Notiz', 'Notiz']);
    expect(zeilen.map((z) => z.getAttribute('title'))).toEqual([
      'C:\\Bereich\\Notiz.markdown',
      'C:\\Bereich\\Notiz.md',
    ]);
  });

  it('laesst eine fremde Endung stehen', async () => {
    // Im Bereichs-Listing erscheinen fremde Dateiarten heute nicht (der
    // Hauptprozess filtert auf Markdown); die Regel gilt im Aufbau dennoch,
    // damit eine Erweiterung des Listings nicht still die Endung verliert.
    const zeilen = await rendereMit(['Liste.txt', '.md']);
    expect(zeilen.map((z) => z.textContent)).toEqual(['Liste.txt', '.md']);
  });
});

// 4T-001225 (Epic 3E-000122, Befund F1 des Linux-Lauffaehigkeits-Nachweises):
// joinPath verkettete hart mit Backslash; unter Linux entstand fuer den
// aufgeklappten Unterordner `/bereich\ordner`, dessen readdir im Main still
// scheiterte — Baum und Dateiliste blieben leer («Keine Markdown-Dateien»).
// Der Trenner kommt jetzt aus dem zentralen Plattform-Modul.
describe('joinPath je Plattform (4T-001225)', () => {
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

// 4T-002067 (Epic 3E-000341): Eine offene Eingabe fuer eine neue Datei oder
// einen neuen Ordner verschwand samt getipptem Namen, sobald das Panel neu
// aufgebaut wurde — der Neuaufbau leert Baum und Dateiliste, und genau dort
// haengen die Eingaben. Ausgeloest wird er von jeder Aenderung am Bestand
// (Verzeichnis-Waechter, `area:changed`), auch vom Echo der eigenen Anlage.
// Der Fall stellt den Neuaufbau so nach, wie ihn der Empfaenger der Meldung
// faehrt: Listings verwerfen, dann rendern. Geprueft wird der Erhalt samt
// Wert, Fokus und Schreibmarke, und die Regel fuer den fehlenden Ort: die
// Eingabe wird verworfen, und der Anwender bekommt einen Hinweis.
describe('Offene Eingabe ueberlebt den Neuaufbau (4T-002067)', () => {
  const dateiEingabe = () => pane0.querySelector('.area-new-file-input');
  const ordnerEingabe = () => pane0.querySelector('.area-new-folder-input');
  const hinweis = () => document.getElementById('statusbar-hint');
  const zeileVon = (pfad) =>
    [...pane0.querySelectorAll('.area-dir-row')].find((z) => z.title === pfad);

  // Bestand: Wurzel mit Unterordner «Kapitel» und einer Datei. `mitKapitel`
  // schaltet den Unterordner ab, um «von aussen geloescht» nachzustellen.
  let mitKapitel = true;
  beforeEach(() => {
    setPlatformForTests('win32');
    mitKapitel = true;
    window.api.areaListDir = async (dirPath) =>
      dirPath === 'C:\\Bereich'
        ? { ok: true, dirs: mitKapitel ? ['Kapitel'] : [], files: ['a.md'] }
        : { ok: true, dirs: [], files: [] };
    invalidateAreaListings();
    hinweis().textContent = '';
    hinweis().classList.remove('visible');
  });
  afterEach(() => {
    setPlatformForTests(undefined);
    window.api.areaListDir = async () => ({ ok: true, dirs: [], files: [] });
    invalidateAreaListings();
    // Die Eingaben haengen ausserhalb dessen, was der globale beforeEach
    // leert, nur dann, wenn ein Fall vorzeitig scheitert; aufraeumen schadet nie.
    pane0.querySelectorAll('.area-new-file-input, .area-new-folder-row').forEach((e) => e.remove());
  });

  // Neuaufbau wie der Empfaenger von `area:changed` (area-panel.js).
  async function neuaufbau() {
    invalidateAreaListings();
    await renderAreaPanel(0);
  }

  // Eintrag im Kontextmenue einer Ordner-Zeile waehlen.
  async function ordnerMenue(pfad, menuId) {
    zeileVon(pfad).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    document.querySelector(`#context-menu [data-menu-id="${menuId}"]`).click();
  }

  it('Datei-Eingabe ueber den Plus-Knopf behaelt Wert, Fokus und Schreibmarke', async () => {
    await renderAreaPanel(0);
    pane0.querySelector('.area-new-file-btn').click();
    await vi.waitFor(() => expect(dateiEingabe()).not.toBeNull());
    const vorher = dateiEingabe();
    vorher.value = 'Mein Entwurf';
    vorher.setSelectionRange(2, 6);
    expect(document.activeElement).toBe(vorher);

    await neuaufbau();

    const nachher = dateiEingabe();
    expect(nachher).not.toBeNull();
    expect(nachher.value).toBe('Mein Entwurf');
    expect(document.activeElement).toBe(nachher);
    expect([nachher.selectionStart, nachher.selectionEnd]).toEqual([2, 6]);
    // Vorn in der Dateiliste, vor den neu gebauten Zeilen.
    expect(pane0.querySelector('.area-files').firstElementChild).toBe(nachher);
    expect(pane0.querySelectorAll('.area-file-row').length).toBe(1);
    expect(hinweis().classList.contains('visible')).toBe(false);
  });

  it('Datei-Eingabe ueber das Ordner-Menue behaelt Wert, Fokus und Schreibmarke', async () => {
    await renderAreaPanel(0);
    await ordnerMenue('C:\\Bereich\\Kapitel', 'area-dir-new-file');
    await vi.waitFor(() => expect(dateiEingabe()).not.toBeNull());
    dateiEingabe().value = 'Zeta';
    dateiEingabe().setSelectionRange(4, 4);

    await neuaufbau();

    expect(dateiEingabe()).not.toBeNull();
    expect(dateiEingabe().value).toBe('Zeta');
    expect(document.activeElement).toBe(dateiEingabe());
    expect([dateiEingabe().selectionStart, dateiEingabe().selectionEnd]).toEqual([4, 4]);
  });

  it('Ordner-Eingabe behaelt Wert, Fokus, Schreibmarke und ihren Platz unter der Ordner-Zeile', async () => {
    await renderAreaPanel(0);
    await ordnerMenue('C:\\Bereich', 'area-dir-new-folder');
    await vi.waitFor(() => expect(ordnerEingabe()).not.toBeNull());
    ordnerEingabe().value = 'Neuer Teil';
    ordnerEingabe().setSelectionRange(0, 5);

    await neuaufbau();

    const nachher = ordnerEingabe();
    expect(nachher).not.toBeNull();
    expect(nachher.value).toBe('Neuer Teil');
    expect(document.activeElement).toBe(nachher);
    expect([nachher.selectionStart, nachher.selectionEnd]).toEqual([0, 5]);
    // Unmittelbar hinter der Zeile des Ziel-Ordners, wie beim Oeffnen.
    expect(zeileVon('C:\\Bereich').nextElementSibling).toBe(nachher.parentElement);
  });

  it('eine Eingabe ohne Fokus bekommt beim Neuaufbau keinen Fokus', async () => {
    await renderAreaPanel(0);
    pane0.querySelector('.area-new-file-btn').click();
    await vi.waitFor(() => expect(dateiEingabe()).not.toBeNull());
    dateiEingabe().value = 'Ohne Fokus';
    dateiEingabe().blur();

    await neuaufbau();

    expect(dateiEingabe().value).toBe('Ohne Fokus');
    expect(document.activeElement).not.toBe(dateiEingabe());
  });

  it('Ordner-Eingabe ohne Ziel-Ordner wird mit Hinweis verworfen', async () => {
    await renderAreaPanel(0);
    await ordnerMenue('C:\\Bereich\\Kapitel', 'area-dir-new-folder');
    await vi.waitFor(() => expect(ordnerEingabe()).not.toBeNull());
    ordnerEingabe().value = 'Verwaist';
    mitKapitel = false; // «Kapitel» von aussen geloescht

    await neuaufbau();

    expect(ordnerEingabe()).toBeNull();
    expect(pane0.querySelector('.area-new-folder-row')).toBeNull();
    expect(hinweis().classList.contains('visible')).toBe(true);
    expect(hinweis().textContent).toBe(t('areaPanel.inputDiscarded'));
  });

  it('Datei-Eingabe ohne Ziel-Ordner wird mit Hinweis verworfen', async () => {
    await renderAreaPanel(0);
    await ordnerMenue('C:\\Bereich\\Kapitel', 'area-dir-new-file');
    await vi.waitFor(() => expect(dateiEingabe()).not.toBeNull());
    dateiEingabe().value = 'Verwaist';
    mitKapitel = false;

    await neuaufbau();

    expect(dateiEingabe()).toBeNull();
    expect(hinweis().classList.contains('visible')).toBe(true);
    expect(hinweis().textContent).toBe(t('areaPanel.inputDiscarded'));
  });

  it('Datei-Eingabe wird mit Hinweis verworfen, wenn die Liste einen anderen Ordner zeigt', async () => {
    await renderAreaPanel(0);
    await ordnerMenue('C:\\Bereich\\Kapitel', 'area-dir-new-file');
    await vi.waitFor(() => expect(dateiEingabe()).not.toBeNull());
    dateiEingabe().value = 'Woanders';
    state.areaPanel.selectedDirByPane[0] = 'C:\\Bereich';

    await neuaufbau();

    expect(dateiEingabe()).toBeNull();
    expect(hinweis().textContent).toBe(t('areaPanel.inputDiscarded'));
  });
});
