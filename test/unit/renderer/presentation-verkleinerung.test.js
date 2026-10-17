// @vitest-environment jsdom
// 4T-002280 (Epic 3E-000348): Parität der Verkleinerung und Vollständigkeit
// der Exporte (AK3, AK5 des Tasks) — dieselbe übervolle Folie erscheint in
// Ansicht «Folien», Vorführung, Referenten-Ansicht (aktuelle und nächste
// Folie), Übersicht, Druck-Fläche beider Exporte und Dokument des
// Publikums-Fensters mit demselben Faktor; die Druck-Fläche zeigt jede Folie
// vollständig aufgedeckt, auch während einer Vorführung.
//
// jsdom misst nicht: Für die Artikel der Folien stellt ein Messmodell am
// Prototyp die Höhen (Inhalt 900 Folien-Pixel bei «Viel», sonst 300; der
// Artikel ist bei Faktor f 720 / f hoch). Die Export-Umgebung ist gemockt wie
// in presentation-export.test.js.
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const de = JSON.parse(readFileSync(path.join(wurzel, 'src/i18n/de.json'), 'utf8'));

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => de[key] ?? key,
  intlLocale: () => 'de',
}));
vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  withPrintPreparation: async () => ({ ok: true }),
}));
vi.mock('../../../src/renderer/modules/render-mermaid.js', () => ({
  applyTeilbaumSchritte: () => {},
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: () => {},
}));
const paneEls = { content: null };
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
  getPaneEls: () => paneEls,
  tabDisplayName: () => 'Vortrag',
  withDialog: (fn) => fn(),
}));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: (text, opts) =>
    lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),
  setWindowFullScreen: vi.fn(async () => false),
  onWindowLeftFullScreen: vi.fn(),
  openPresentationWindow: vi.fn(async () => ({ ok: true })),
  closePresentationWindow: vi.fn(async () => true),
  sendPresentationSlide: vi.fn(async () => true),
  onPresentationWindowInput: vi.fn(),
  onPresentationWindowClosed: vi.fn(),
};

const { blaettere, initPresentationPane, renderPresentation } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');
const { VERKLEINERUNG_ATTR, UEBERLAUF_ZUSTAND } =
  await import('../../../src/renderer/modules/presentation/presentation-folie.js');
const { beendeVorfuehrung, starteVorfuehrung } =
  await import('../../../src/renderer/modules/presentation/presentation-vorfuehrung.js');
const { beendeReferentenAnsicht, starteReferentenAnsicht } =
  await import('../../../src/renderer/modules/presentation/presentation-referent.js');
const { schalteUebersicht } =
  await import('../../../src/renderer/modules/presentation/presentation-uebersicht.js');
const { baueDruckFlaeche, baueFolienDokument } =
  await import('../../../src/renderer/modules/views/folien-export.js');

// Folie 1 schlicht, Folie 2 übervoll mit Aufdeck-Liste, Folie 3 schlicht.
const DECK = [
  '---',
  'presentation: true',
  '---',
  '',
  '# Eins',
  '',
  '---',
  '',
  '# Viel',
  '',
  '* A',
  '* B',
  '',
  '---',
  '',
  '# Drei',
  '',
].join('\n');

// Messmodell am Prototyp, nur für die Artikel der Folien.
const ARTIKEL = 'praesentation-folie';
const faktorVon = (el) => Number(el.getAttribute(VERKLEINERUNG_ATTR)) || 1;
const vorher = {};
beforeAll(() => {
  for (const name of ['clientHeight', 'scrollHeight']) {
    vorher[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return this.classList.contains(ARTIKEL) ? 720 / faktorVon(this) : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (!this.classList.contains(ARTIKEL)) return 0;
      const inhalt = this.textContent.includes('Viel') ? 900 : 300;
      return Math.max(inhalt, this.clientHeight);
    },
  });
});
afterAll(() => {
  for (const [name, beschreibung] of Object.entries(vorher)) {
    if (beschreibung) Object.defineProperty(HTMLElement.prototype, name, beschreibung);
    else delete HTMLElement.prototype[name];
  }
});

let container;
let tab;
const ruhe = () => new Promise((r) => setTimeout(r, 0));
const modell = () => lesePraesentation(DECK, { md: markdownModul.md });
const render = (md) => renderMarkdown(md, 'de', { frontmatterBlock: false });
const artikelIn = (wurzel) => wurzel.querySelector(`.${ARTIKEL}`);
const gezeigt = () => artikelIn(container.querySelector('.praesentation-buehne'));

beforeEach(() => {
  document.body.className = '';
  document.body.replaceChildren();
  const spalte = document.createElement('section');
  spalte.className = 'pane-group';
  container = document.createElement('section');
  container.className = 'pane pane-presentation';
  const inhalt = document.createElement('div');
  spalte.append(container, inhalt);
  document.body.append(spalte);
  paneEls.content = inhalt;
  tab = { content: DECK, viewMode: 'presentation', path: 'C:/Notizen/Vortrag.md' };
  initPresentationPane({
    getPaneEls: () => ({ presentationEl: container }),
    aktivesDokument: () => tab,
    schreibmarkenZeile: () => 1,
  });
  renderPresentation(0);
});

afterEach(() => {
  beendeReferentenAnsicht();
  beendeVorfuehrung();
});

// Der Faktor, den die übervolle Folie allein erhält.
function erwarteterFaktor() {
  const flaeche = baueDruckFlaeche({
    ziel: paneEls.content,
    folien: modell().folien,
    kopf: modell().kopf,
    render,
  });
  const f = faktorVon(flaeche.querySelectorAll(`.${ARTIKEL}`)[1]);
  flaeche.remove();
  return f;
}

describe('Verkleinerung in allen Darstellungen gleich (AK5)', () => {
  it('Ansicht, Vorführung, Referenten-Ansicht, Übersicht und Druck-Fläche tragen denselben Faktor', async () => {
    const f = erwarteterFaktor();
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(0.795);

    // Ansicht «Folien».
    expect(faktorVon(gezeigt())).toBe(1);
    blaettere(0, 'weiter');
    expect(faktorVon(gezeigt())).toBe(f);
    expect(gezeigt().closest('.presentation-slide').classList).not.toContain(UEBERLAUF_ZUSTAND);

    // Übersicht: die Kachel der übervollen Folie.
    schalteUebersicht(0);
    const kacheln = container.querySelectorAll('.praesentation-uebersicht-kachel');
    expect(faktorVon(artikelIn(kacheln[1]))).toBe(f);
    expect(faktorVon(artikelIn(kacheln[0]))).toBe(1);
    schalteUebersicht(0);

    // Vorführung im Vollbild.
    starteVorfuehrung(0);
    expect(faktorVon(gezeigt())).toBe(f);
    beendeVorfuehrung();

    // Referenten-Ansicht: aktuelle Folie und, eine Folie davor, die nächste.
    blaettere(0, 'zurueck');
    starteReferentenAnsicht(0);
    await ruhe();
    const vorschau = container.querySelector('.praesentation-referent-vorschau');
    expect(faktorVon(artikelIn(vorschau))).toBe(f);
    blaettere(0, 'weiter');
    expect(faktorVon(gezeigt())).toBe(f);
  });

  it('das Dokument des Publikums-Fensters trägt die Verkleinerung im Klon', async () => {
    const flaeche = baueDruckFlaeche({
      ziel: paneEls.content,
      folien: modell().folien,
      kopf: modell().kopf,
      render,
    });
    const huelle = flaeche.querySelectorAll('.presentation-slide-huelle')[1];
    const f = faktorVon(artikelIn(huelle));
    const dok = await baueFolienDokument(huelle, { basisStile: [] });
    expect(dok.html).toContain(`${VERKLEINERUNG_ATTR}="${f.toFixed(4)}"`);
    expect(dok.html).toContain(`scale(${f})`);
  });
});

describe('Exporte zeigen jede Folie vollständig (AK3)', () => {
  it('die Druck-Fläche beider Exporte deckt alles auf, auch während einer Vorführung', () => {
    blaettere(0, 'weiter');
    starteVorfuehrung(0);
    // In der Vorführung ist die gezeigte Folie zugedeckt …
    expect(gezeigt().querySelectorAll('[data-aufdeck-verborgen]')).toHaveLength(2);
    // … die Druck-Fläche nicht.
    const flaeche = baueDruckFlaeche({
      ziel: paneEls.content,
      folien: modell().folien,
      kopf: modell().kopf,
      render,
    });
    const punkte = [...flaeche.querySelectorAll('li')];
    expect(punkte.map((li) => li.textContent.trim())).toEqual(['A', 'B']);
    for (const li of punkte) {
      expect(li.hasAttribute('data-aufdeck-verborgen')).toBe(false);
      expect(li.style.visibility).toBe('');
    }
  });
});
