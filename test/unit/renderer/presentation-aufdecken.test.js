// @vitest-environment jsdom
// 4T-002280 (Epic 3E-000348): Prüffälle des schrittweisen Aufdeckens (Story
// 4S-001077, AK2 und AK3 des Tasks) — in Vorführung und Referenten-Ansicht
// decken «weiter» und «zurück» die gekennzeichneten Listen-Punkte einzeln auf
// und zu, bevor die Folie wechselt; eine rückwärts betretene Folie erscheint
// vollständig; die Ansicht «Folien», die nächste Folie der Referenten-Ansicht
// und das Ende der Vorführung zeigen die Folie vollständig; der Schritt reist
// im gesendeten Dokument an das Publikums-Fenster.
//
// Die Fläche läuft echt mit dem echten Format-Kern hinter der Preload-Brücke
// (Aufdeck-Schritte aus `*` und `1)`); Vollbild- und Fenster-Brücke sind
// Attrappen (Muster presentation-referent.test.js).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
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
}));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: (text, opts) =>
    lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),
  setWindowFullScreen: vi.fn(async () => false),
  onWindowLeftFullScreen: vi.fn(),
  openPresentationWindow: vi.fn(async () => ({ ok: true, vollbild: false, schonOffen: false })),
  closePresentationWindow: vi.fn(async () => true),
  sendPresentationSlide: vi.fn(async () => true),
  onPresentationWindowInput: vi.fn(),
  onPresentationWindowClosed: vi.fn(),
};

const { blaettere, initPresentationPane, renderPresentation } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');
const { beendeVorfuehrung, starteVorfuehrung } =
  await import('../../../src/renderer/modules/presentation/presentation-vorfuehrung.js');
const {
  SENDE_VERZOEGERUNG_MS,
  beende: beendeFenster,
  registriereFolienDokumentBauer,
  starteVorfuehrungImFenster,
} = await import('../../../src/renderer/modules/presentation/presentation-publikum.js');
const { beendeReferentenAnsicht, referentenStand, starteReferentenAnsicht } =
  await import('../../../src/renderer/modules/presentation/presentation-referent.js');
const {
  AUFDECK_ATTR,
  VERBORGEN_ATTR,
  aufdeckSchritteVon,
  blaetterZiel,
  istAufdeckenAktiv,
  setzeAufdeckModus,
  wendeAufdeckenAn,
} = await import('../../../src/renderer/modules/presentation/presentation-aufdecken.js');

// Folie 2 trägt einen festen Punkt (`-`) und vier Aufdeck-Schritte: A, B, der
// verschachtelte B1 und der nummerierte «Erstens».
const DECK = [
  '---',
  'presentation: true',
  '---',
  '',
  '# Eins',
  '',
  '---',
  '',
  '# Zwei',
  '',
  '- fest',
  '* A',
  '* B',
  '  * B1',
  '',
  '1) Erstens',
  '',
  '---',
  '',
  '# Drei',
  '',
].join('\n');

let container;
let dokumente;
const ruhe = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const zaehler = () => container.querySelector('.praesentation-zaehler').textContent;
const buehne = () => container.querySelector('.praesentation-buehne');
const punkte = (wurzel = buehne()) => [...wurzel.querySelectorAll('li')];
// Sichtbar ist ein Punkt, wenn weder er noch ein Eltern-Punkt verborgen ist.
const sichtbar = (li) => !li.closest(`[${VERBORGEN_ATTR}]`);
const sichtbareTexte = (wurzel = buehne()) =>
  punkte(wurzel)
    .filter(sichtbar)
    .map((li) => li.firstChild.textContent.trim());
const ALLE = ['fest', 'A', 'B', 'B1', 'Erstens'];
const bauer = vi.fn(async (huelle) => ({
  html: huelle.outerHTML,
  breite: 1280,
  hoehe: 720,
}));

beforeEach(() => {
  document.body.className = '';
  document.body.replaceChildren();
  const spalte = document.createElement('section');
  spalte.className = 'pane-group';
  container = document.createElement('section');
  container.className = 'pane pane-presentation';
  spalte.append(container);
  document.body.append(spalte);
  dokumente = [{ content: DECK, viewMode: 'presentation', path: 'C:/Notizen/Vortrag.md' }];
  initPresentationPane({
    getPaneEls: () => ({ presentationEl: container }),
    aktivesDokument: (i) => dokumente[i] || null,
    schreibmarkenZeile: () => 1,
  });
  window.api.sendPresentationSlide.mockClear();
  bauer.mockClear();
  registriereFolienDokumentBauer(bauer);
  renderPresentation(0);
});

afterEach(() => {
  beendeReferentenAnsicht();
  beendeFenster();
  beendeVorfuehrung();
});

describe('Ansicht «Folien»: jede Folie vollständig (AK3)', () => {
  it('zeigt alle Punkte und blättert ohne Aufdecken', () => {
    blaettere(0, 'weiter');
    expect(zaehler()).toBe('2 / 3');
    expect(sichtbareTexte()).toEqual(ALLE);
    expect(container.querySelector('.praesentation-folie').getAttribute(AUFDECK_ATTR)).toBe('4');
    blaettere(0, 'weiter');
    expect(zaehler()).toBe('3 / 3');
    expect(istAufdeckenAktiv(0)).toBe(false);
  });
});

describe('Vorführung im Vollbild: Aufdecken und Zudecken (AK2)', () => {
  it('«weiter» deckt jeden Punkt einzeln auf, erst danach kommt die nächste Folie', () => {
    blaettere(0, 'weiter');
    starteVorfuehrung(0);
    expect(istAufdeckenAktiv(0)).toBe(true);
    expect(zaehler()).toBe('2 / 3');
    expect(sichtbareTexte()).toEqual(['fest']);
    // Der Platz bleibt: verborgen über visibility, nicht entfernt.
    expect(punkte()).toHaveLength(5);
    expect(punkte()[1].style.visibility).toBe('hidden');
    const erwartet = [['fest', 'A'], ['fest', 'A', 'B'], ['fest', 'A', 'B', 'B1'], ALLE];
    for (const soll of erwartet) {
      blaettere(0, 'weiter');
      expect(zaehler()).toBe('2 / 3');
      expect(sichtbareTexte()).toEqual(soll);
    }
    blaettere(0, 'weiter');
    expect(zaehler()).toBe('3 / 3');
  });

  it('«zurück» verbirgt den zuletzt aufgedeckten Punkt, dann die vorige Folie', () => {
    blaettere(0, 'weiter');
    starteVorfuehrung(0);
    blaettere(0, 'weiter');
    blaettere(0, 'weiter');
    expect(sichtbareTexte()).toEqual(['fest', 'A', 'B']);
    blaettere(0, 'zurueck');
    expect(sichtbareTexte()).toEqual(['fest', 'A']);
    blaettere(0, 'zurueck');
    expect(sichtbareTexte()).toEqual(['fest']);
    blaettere(0, 'zurueck');
    expect(zaehler()).toBe('1 / 3');
  });

  it('eine rückwärts betretene Folie erscheint vollständig', () => {
    starteVorfuehrung(0);
    blaettere(0, 'letzte');
    expect(zaehler()).toBe('3 / 3');
    blaettere(0, 'zurueck');
    expect(zaehler()).toBe('2 / 3');
    expect(sichtbareTexte()).toEqual(ALLE);
    // Von dort zurück: zuerst zudecken.
    blaettere(0, 'zurueck');
    expect(zaehler()).toBe('2 / 3');
    expect(sichtbareTexte()).toEqual(['fest', 'A', 'B', 'B1']);
  });

  it('Tasten der Vorführung gehen denselben Weg', () => {
    blaettere(0, 'weiter');
    starteVorfuehrung(0);
    const pfeil = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    window.dispatchEvent(pfeil);
    expect(sichtbareTexte()).toEqual(['fest', 'A']);
  });

  it('nach dem Ende zeigt die Ansicht die Folie wieder vollständig', () => {
    blaettere(0, 'weiter');
    starteVorfuehrung(0);
    blaettere(0, 'weiter');
    beendeVorfuehrung();
    expect(istAufdeckenAktiv(0)).toBe(false);
    expect(zaehler()).toBe('2 / 3');
    expect(sichtbareTexte()).toEqual(ALLE);
  });

  it('ein neuer Start deckt die gezeigte Folie wieder zu', () => {
    blaettere(0, 'weiter');
    starteVorfuehrung(0);
    blaettere(0, 'weiter');
    blaettere(0, 'weiter');
    beendeVorfuehrung();
    starteVorfuehrung(0);
    expect(sichtbareTexte()).toEqual(['fest']);
  });
});

describe('Vorführung im eigenen Fenster und Referenten-Ansicht (AK2, AK3)', () => {
  it('der Aufdeck-Schritt reist im gesendeten Dokument mit', async () => {
    blaettere(0, 'weiter');
    starteVorfuehrungImFenster(0);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    const erstes = window.api.sendPresentationSlide.mock.calls.at(-1)[0];
    expect(erstes.index).toBe(1);
    expect((erstes.html.match(/visibility: hidden/g) || []).length).toBe(4);
    blaettere(0, 'weiter');
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    const zweites = window.api.sendPresentationSlide.mock.calls.at(-1)[0];
    expect(zweites.index).toBe(1);
    expect((zweites.html.match(/visibility: hidden/g) || []).length).toBe(3);
    beendeFenster();
    expect(sichtbareTexte()).toEqual(ALLE);
  });

  it('die Referenten-Ansicht führt den Schritt, die nächste Folie ist vollständig', async () => {
    expect(starteReferentenAnsicht(0)).toBe(true);
    await ruhe();
    expect(referentenStand().aufdeckSchritt).toBe(0);
    const vorschau = container.querySelector('.praesentation-referent-vorschau');
    expect(sichtbareTexte(vorschau)).toEqual(ALLE);
    blaettere(0, 'weiter');
    expect(referentenStand().index).toBe(1);
    expect(sichtbareTexte()).toEqual(['fest']);
    blaettere(0, 'weiter');
    blaettere(0, 'weiter');
    expect(referentenStand()).toMatchObject({ index: 1, aufdeckSchritt: 2 });
    expect(sichtbareTexte()).toEqual(['fest', 'A', 'B']);
    beendeReferentenAnsicht();
    expect(sichtbareTexte()).toEqual(ALLE);
  });
});

describe('Bausteine des Aufdeckens', () => {
  const folien = [
    { aufdeckSchritte: { zahl: 0, punkte: [] } },
    { aufdeckSchritte: { zahl: 2, punkte: [] } },
    {},
  ];
  const tab = {};

  afterEach(() => setzeAufdeckModus(7, false, tab));

  it('ohne Vorführung blättert jeder Schritt eine Folie; eine Zahl springt', () => {
    expect(blaetterZiel({ paneIdx: 7, tab, folien, jetzt: 0, richtung: 'weiter' })).toEqual({
      index: 1,
      geaendert: true,
    });
    expect(blaetterZiel({ paneIdx: 7, tab, folien, jetzt: 1, richtung: 'weiter' }).index).toBe(2);
    expect(blaetterZiel({ paneIdx: 7, tab, folien, jetzt: 2, richtung: 'weiter' })).toEqual({
      index: 2,
      geaendert: false,
    });
    expect(blaetterZiel({ paneIdx: 7, tab, folien, jetzt: 2, richtung: 0 }).index).toBe(0);
    expect(blaetterZiel({ paneIdx: 7, tab, folien, jetzt: 0, richtung: 9 }).index).toBe(2);
    expect(blaetterZiel({ paneIdx: 7, tab, folien, jetzt: 1, richtung: 'erste' }).index).toBe(0);
  });

  it('mit Vorführung: vorwärts betreten zugedeckt, rückwärts vollständig', () => {
    setzeAufdeckModus(7, true, tab);
    const schritt = (jetzt, richtung) => blaetterZiel({ paneIdx: 7, tab, folien, jetzt, richtung });
    expect(schritt(0, 'weiter')).toEqual({ index: 1, geaendert: true });
    expect(schritt(1, 'weiter')).toEqual({ index: 1, geaendert: true });
    expect(schritt(1, 'weiter')).toEqual({ index: 1, geaendert: true });
    expect(schritt(1, 'weiter')).toEqual({ index: 2, geaendert: true });
    expect(schritt(2, 'zurueck')).toEqual({ index: 1, geaendert: true });
    // Vollständig betreten: das erste «zurück» deckt zu, bleibt auf der Folie.
    expect(schritt(1, 'zurueck')).toEqual({ index: 1, geaendert: true });
  });

  it('liest fehlende Aufdeck-Schritte als keine', () => {
    expect(aufdeckSchritteVon(null)).toEqual({ zahl: 0, punkte: [] });
    expect(aufdeckSchritteVon({ aufdeckSchritte: { punkte: [{ punkt: 0 }] } }).zahl).toBe(1);
  });

  it('ohne Aufdeck-Schritte trägt der Artikel keine Angabe und keinen verborgenen Punkt', () => {
    const artikel = document.createElement('article');
    artikel.innerHTML = '<ul><li>x</li></ul>';
    artikel.setAttribute(AUFDECK_ATTR, '1');
    wendeAufdeckenAn(artikel, { aufdeckSchritte: { zahl: 0, punkte: [] } }, 0);
    expect(artikel.hasAttribute(AUFDECK_ATTR)).toBe(false);
    expect(artikel.querySelector(`[${VERBORGEN_ATTR}]`)).toBeNull();
  });
});
