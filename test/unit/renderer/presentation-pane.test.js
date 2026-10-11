// @vitest-environment jsdom
// 4T-002160 (Epic 3E-000149): Prüffälle der Präsentations-Fläche — Zähler,
// Blättern per Schaltfläche und Tastatur, Startfolie an der Schreibmarke,
// Rückfall beim verlorenen Kennzeichen und der Nachzug beim Tippen.
//
// Der Format-Kern steht hinter der Preload-Brücke `api.lesePraesentation`; die
// meisten Fälle stellen sie als Attrappe mit festem Modell, damit sie allein die
// Fläche messen. Ein Fall reicht den echten Kern durch die Brücke, damit die
// vereinbarte Schnittstelle auch gegenständlich trägt. Erweiterungs-Lebenszyklus
// und Übersetzung sind gemockt (Muster kanban-modus.test.js, kanban-tafel.test.js).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));

const aktiv = new Map();
const istAktiv = vi.fn((id) => (aktiv.has(id) ? aktiv.get(id) : true));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));
vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => de[key] ?? key,
}));

// Die Prozess-Brücke, gestellt VOR dem Laden der Fläche, weil `api.js`
// `window.api` beim Laden bindet. Das Objekt bleibt dasselbe; die Fälle
// tauschen nur seine Funktionen.
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: null,
};

// Die Brücke wie im Preload: der echte Kern mit der Markdown-Instanz der
// Anwendung, die entscheidet, wo `---` eine thematische Linie ist.
const echteBruecke = (text, opts) =>
  lesePraesentation(text, { ...(opts || {}), md: markdownModul.md });

const {
  blaettere,
  fokussierePraesentation,
  folieAnZeile,
  initPresentationPane,
  raeumePraesentationAuf,
  registrierePraesentationsTeilbaumSchritte,
  renderPresentation,
  RAD_SPERRE_MS,
  richtungAusRad,
  richtungAusTaste,
  schedulePresentationRender,
} = await import('../../../src/renderer/modules/presentation/presentation-pane.js');

// Ein echtes Präsentations-Dokument — die Verfügbarkeit fragt den echten Kern.
const DREI = [
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
  '---',
  '',
  '# Drei',
  '',
].join('\n');
const OHNE_KENNZEICHEN = DREI.replace('presentation: true', 'tags:');

// Festes Modell der Attrappe, in der Zählung des Kerns (eins-basiert).
const MODELL_DREI = {
  istPraesentation: true,
  folien: [
    { index: 0, vonZeile: 4, bisZeile: 6, quelltext: '\n# Eins\n', notizen: [] },
    { index: 1, vonZeile: 8, bisZeile: 10, quelltext: '\n# Zwei\n', notizen: [] },
    { index: 2, vonZeile: 12, bisZeile: 14, quelltext: '\n# Drei\n', notizen: [] },
  ],
};

let flaechen;
let dokumente;
let zugang;

function baueZugang(zusatz = {}) {
  zugang = {
    getPaneEls: (paneIdx) => ({ presentationEl: flaechen[paneIdx] }),
    aktivesDokument: (paneIdx) => dokumente[paneIdx] || null,
    beiVerfuegbarkeitsWechsel: vi.fn(),
    beiRueckfall: vi.fn(),
    schreibmarkenZeile: vi.fn(() => 1),
    ...zusatz,
  };
  initPresentationPane(zugang);
}

const zaehler = (paneIdx = 0) =>
  flaechen[paneIdx].querySelector('.praesentation-zaehler').textContent;
const folieText = (paneIdx = 0) =>
  flaechen[paneIdx].querySelector('.praesentation-folie').textContent.trim();
const knopf = (klasse, paneIdx = 0) => flaechen[paneIdx].querySelector(`.${klasse}`);

function rad(deltaY, optionen = {}) {
  const flaeche = flaechen[0].querySelector('.praesentation-flaeche');
  const ereignis = new window.WheelEvent('wheel', {
    deltaY,
    bubbles: true,
    cancelable: true,
    ...optionen,
  });
  flaeche.dispatchEvent(ereignis);
  return ereignis;
}

function taste(key, optionen = {}) {
  const flaeche = flaechen[0].querySelector('.praesentation-flaeche');
  const ereignis = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...optionen,
  });
  flaeche.dispatchEvent(ereignis);
  return ereignis;
}

beforeEach(() => {
  aktiv.clear();
  flaechen = [document.createElement('section'), document.createElement('section')];
  dokumente = [{ content: DREI, viewMode: 'presentation', path: 'C:/Notizen/Vortrag.md' }];
  window.api.lesePraesentation = vi.fn(() => MODELL_DREI);
  baueZugang();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Präsentations-Fläche: Folie und Zähler (4S-001049, AK1/AK2/AK9)', () => {
  it('zeigt eine Folie als gerenderten Inhalt und darüber den Zähler', () => {
    expect(renderPresentation(0)).toBe(flaechen[0]);
    expect(zaehler()).toBe('1 / 3');
    expect(folieText()).toBe('Eins');
    expect(flaechen[0].querySelector('.praesentation-folie h1')).not.toBeNull();
    // Gerendert wird mit der bestehenden Pipeline in einen Markdown-Rumpf.
    expect(flaechen[0].querySelector('.praesentation-folie').classList).toContain('markdown-body');
  });

  it('der Zähler-Text kommt aus dem Katalog mit beiden Platzhaltern', () => {
    expect(de['presentation.zaehler']).toBe('{aktuell} / {gesamt}');
  });

  it('AK9: eine Präsentation mit nur einer Folie zeigt «1 / 1» und bleibt beim Blättern stehen', () => {
    window.api.lesePraesentation = vi.fn(() => ({ folien: [MODELL_DREI.folien[0]] }));
    renderPresentation(0);
    expect(zaehler()).toBe('1 / 1');
    expect(knopf('praesentation-zurueck').disabled).toBe(true);
    expect(knopf('praesentation-weiter').disabled).toBe(true);
    expect(blaettere(0, 'weiter')).toBe(0);
    expect(blaettere(0, 'zurueck')).toBe(0);
    expect(zaehler()).toBe('1 / 1');
  });

  it('ein Modell ohne Folien zeigt «0 / 0» ohne Fehler', () => {
    window.api.lesePraesentation = vi.fn(() => ({ folien: [] }));
    renderPresentation(0);
    expect(zaehler()).toBe('0 / 0');
    expect(folieText()).toBe('');
    expect(blaettere(0, 'weiter')).toBe(0);
  });

  it('fragt den Kern mit dem Schalt-Zustand der Kommentare', () => {
    renderPresentation(0);
    expect(window.api.lesePraesentation).toHaveBeenLastCalledWith(DREI, { kommentareAktiv: true });
    aktiv.set('comments', false);
    dokumente[0] = { ...dokumente[0], content: `${DREI}\n` };
    renderPresentation(0);
    expect(window.api.lesePraesentation).toHaveBeenLastCalledWith(`${DREI}\n`, {
      kommentareAktiv: false,
    });
  });

  it('liest bei unverändertem Puffer nicht neu und rendert nicht neu', () => {
    const render = vi.spyOn(window.api, 'renderMarkdown');
    renderPresentation(0);
    renderPresentation(0);
    expect(window.api.lesePraesentation).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    render.mockRestore();
  });

  it('die Folie durchläuft den Schritt-Satz des erzeugten Teilbaums', () => {
    const schritte = vi.fn();
    registrierePraesentationsTeilbaumSchritte(schritte);
    renderPresentation(0);
    expect(schritte).toHaveBeenCalledTimes(1);
    const [knoten, pfad, optionen] = schritte.mock.calls[0];
    expect(knoten.classList).toContain('praesentation-folie');
    expect(pfad).toBe('C:/Notizen/Vortrag.md');
    expect(optionen).toEqual({ dokumentText: DREI });
  });

  it('greift nur im eigenen Modus', () => {
    dokumente[0].viewMode = 'rendered';
    expect(renderPresentation(0)).toBeNull();
    expect(flaechen[0].childElementCount).toBe(0);
  });

  it('trägt den echten Format-Kern durch die Brücke', () => {
    // Die Brücke im Preload reicht die Markdown-Instanz mit; ohne sie liefert
    // der Kern eine einzige Folie (Befund keinParser).
    expect(lies('src/main/preload.js').replace(/\s+/g, ' ')).toContain(
      'lesePraesentation: (text, opts) => lesePraesentation(text, { ...(opts || {}), md: markdownModul.md }),',
    );
    window.api.lesePraesentation = echteBruecke;
    renderPresentation(0);
    expect(zaehler()).toBe('1 / 3');
    expect(folieText()).toBe('Eins');
    blaettere(0, 'letzte');
    expect(zaehler()).toBe('3 / 3');
    expect(folieText()).toBe('Drei');
  });
});

describe('Präsentations-Fläche: Blättern (4S-001049, AK3)', () => {
  it('die beiden Schaltflächen blättern und sperren sich an den Enden', () => {
    renderPresentation(0);
    expect(knopf('praesentation-zurueck').disabled).toBe(true);
    knopf('praesentation-weiter').click();
    expect(zaehler()).toBe('2 / 3');
    expect(folieText()).toBe('Zwei');
    knopf('praesentation-weiter').click();
    expect(zaehler()).toBe('3 / 3');
    expect(knopf('praesentation-weiter').disabled).toBe(true);
    knopf('praesentation-zurueck').click();
    expect(zaehler()).toBe('2 / 3');
  });

  it('die Tasten der Vorführung blättern bei Fokus auf der Fläche', () => {
    renderPresentation(0);
    expect(taste('ArrowRight').defaultPrevented).toBe(true);
    expect(zaehler()).toBe('2 / 3');
    taste('ArrowLeft');
    expect(zaehler()).toBe('1 / 3');
    taste(' ');
    expect(zaehler()).toBe('2 / 3');
    taste(' ', { shiftKey: true });
    expect(zaehler()).toBe('1 / 3');
    taste('PageDown');
    expect(zaehler()).toBe('2 / 3');
    taste('PageUp');
    expect(zaehler()).toBe('1 / 3');
    taste('End');
    expect(zaehler()).toBe('3 / 3');
    taste('Home');
    expect(zaehler()).toBe('1 / 3');
  });

  it('bleibt an der ersten und der letzten Folie ohne Fehler stehen', () => {
    renderPresentation(0);
    taste('ArrowLeft');
    taste('PageUp');
    expect(zaehler()).toBe('1 / 3');
    taste('End');
    taste('ArrowRight');
    taste(' ');
    expect(zaehler()).toBe('3 / 3');
  });

  it('eine Taste mit Strg, Alt oder Meta gehört einem Kürzel und nicht der Fläche', () => {
    renderPresentation(0);
    const ereignis = taste('ArrowRight', { ctrlKey: true });
    expect(ereignis.defaultPrevented).toBe(false);
    expect(zaehler()).toBe('1 / 3');
    expect(richtungAusTaste({ key: 'End', altKey: true })).toBeNull();
    expect(richtungAusTaste({ key: 'End', metaKey: true })).toBeNull();
    expect(richtungAusTaste({ key: 'a' })).toBeNull();
  });

  it('die Fläche ist fokussierbar und nimmt den Fokus an', () => {
    document.body.append(flaechen[0]);
    renderPresentation(0);
    fokussierePraesentation(0);
    const flaeche = flaechen[0].querySelector('.praesentation-flaeche');
    expect(flaeche.tabIndex).toBe(0);
    expect(document.activeElement).toBe(flaeche);
    flaechen[0].remove();
  });
});

describe('Präsentations-Fläche: Blättern mit dem Mausrad (Abnahme 2026-10-10)', () => {
  let uhr;
  beforeEach(() => {
    uhr = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => uhr);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Rad nach unten blättert vor, nach oben zurück, und die Fläche rollt nicht', () => {
    renderPresentation(0);
    expect(rad(100).defaultPrevented).toBe(true);
    expect(zaehler()).toBe('2 / 3');
    uhr += RAD_SPERRE_MS;
    expect(rad(-100).defaultPrevented).toBe(true);
    expect(zaehler()).toBe('1 / 3');
  });

  it('zwei Ereignisse innerhalb der Sperre blättern einmal', () => {
    renderPresentation(0);
    rad(40);
    uhr += 100;
    const zweites = rad(40);
    // Abgefangen, aber nicht geblättert.
    expect(zweites.defaultPrevented).toBe(true);
    expect(zaehler()).toBe('2 / 3');
    uhr += RAD_SPERRE_MS;
    rad(40);
    expect(zaehler()).toBe('3 / 3');
  });

  it('horizontales Rollen und Strg+Rad bleiben unberührt', () => {
    renderPresentation(0);
    const quer = rad(0, { deltaX: 120 });
    expect(quer.defaultPrevented).toBe(false);
    expect(zaehler()).toBe('1 / 3');
    const zoom = rad(100, { ctrlKey: true });
    expect(zoom.defaultPrevented).toBe(false);
    expect(zaehler()).toBe('1 / 3');
  });

  it('richtungAusRad: Richtung, Sperre und die Ausnahmen', () => {
    const sperre = { bis: 0 };
    expect(RAD_SPERRE_MS).toBe(250);
    expect(richtungAusRad({ deltaY: 3 }, sperre)).toBe('weiter');
    expect(sperre.bis).toBe(uhr + 250);
    expect(richtungAusRad({ deltaY: -3 }, sperre)).toBe('gesperrt');
    uhr += 250;
    expect(richtungAusRad({ deltaY: -3 }, sperre)).toBe('zurueck');
    expect(richtungAusRad({ deltaY: 0, deltaX: 5 }, { bis: 0 })).toBeNull();
    expect(richtungAusRad({ deltaY: 5, ctrlKey: true }, { bis: 0 })).toBeNull();
    expect(richtungAusRad(null, { bis: 0 })).toBeNull();
  });
});

describe('Präsentations-Fläche: leer ohne gezeigte Präsentation (Befund 2026-10-10)', () => {
  const inhalt = () => flaechen[0].querySelector('.praesentation-flaeche');

  it('nach dem Schließen des letzten Dokuments ist die Fläche leer', () => {
    renderPresentation(0);
    blaettere(0, 'weiter');
    expect(inhalt()).not.toBeNull();
    dokumente = [];
    expect(raeumePraesentationAuf(0)).toBe(true);
    expect(flaechen[0].childElementCount).toBe(0);
    expect(flaechen[0].querySelector('.praesentation-zaehler')).toBeNull();
    expect(flaechen[0].querySelector('.praesentation-folie')).toBeNull();
    // Ein zweiter Aufruf findet nichts mehr zu leeren.
    expect(raeumePraesentationAuf(0)).toBe(false);
  });

  it('nach dem Wechsel in eine andere Ansicht ebenso; beim Wiedereintritt steht die Folie wieder', () => {
    renderPresentation(0);
    blaettere(0, 'weiter');
    dokumente[0].viewMode = 'rendered';
    expect(raeumePraesentationAuf(0)).toBe(true);
    expect(inhalt()).toBeNull();
    dokumente[0].viewMode = 'presentation';
    renderPresentation(0);
    expect(zaehler()).toBe('2 / 3');
    expect(folieText()).toBe('Zwei');
    // Die Zuhörer des Containers tragen weiter: Blättern nach dem Neubau.
    knopf('praesentation-weiter').click();
    expect(zaehler()).toBe('3 / 3');
  });

  it('eine gezeigte Präsentation bleibt unberührt', () => {
    renderPresentation(0);
    expect(raeumePraesentationAuf(0)).toBe(false);
    expect(inhalt()).not.toBeNull();
  });

  it('angeschlossen beim Zeichnen jeder Spalte und beim Ansichts-Wechsel; ohne Dokument keine Ansichts-Klasse', () => {
    const render = lies('src/renderer/modules/views/pane-render.js');
    const leer = render.slice(render.indexOf('export function renderPaneContent('));
    expect(leer.indexOf('raeumePraesentationAuf(paneIdx);')).toBeGreaterThan(-1);
    expect(leer.indexOf('raeumePraesentationAuf(paneIdx);')).toBeLessThan(
      leer.indexOf('if (!pane || pane.activeIndex < 0) {'),
    );
    const zweig = leer.slice(
      leer.indexOf('if (!pane || pane.activeIndex < 0) {'),
      leer.indexOf('const tab = pane.tabs[pane.activeIndex];'),
    );
    expect(zweig).toContain("applyContentViewClass(els.content, '');");
    expect(lies('src/renderer/modules/views/views.js')).toMatch(
      /tab\.viewMode = mode;[\s\S]{0,400}raeumePraesentationAuf\(state\.activePaneIndex\);/,
    );
  });
});

describe('Präsentations-Fläche: Startfolie an der Schreibmarke', () => {
  it('beim Eintritt steht die Folie, in der die Schreibmarke steht', () => {
    zugang.schreibmarkenZeile.mockReturnValue(9);
    renderPresentation(0, { anSchreibmarke: true });
    expect(zaehler()).toBe('2 / 3');
    expect(folieText()).toBe('Zwei');
  });

  it('folieAnZeile: Kopf, Folien-Inneres, Trennzeile und Ende', () => {
    const folien = MODELL_DREI.folien;
    expect(folieAnZeile(folien, 2)).toBe(0); // im Kopf
    expect(folieAnZeile(folien, 5)).toBe(0);
    expect(folieAnZeile(folien, 7)).toBe(0); // Trennzeile: die vordere Folie
    expect(folieAnZeile(folien, 8)).toBe(1);
    expect(folieAnZeile(folien, 13)).toBe(2);
    expect(folieAnZeile(folien, 99)).toBe(2);
    expect(folieAnZeile(folien, null)).toBe(0);
    expect(folieAnZeile([], 5)).toBe(0);
  });

  it('ohne Eintritt bleibt die gezeigte Folie, auch über einen Dokument-Wechsel', () => {
    renderPresentation(0);
    blaettere(0, 'letzte');
    // Ein neuer Takt ändert die Folie nicht, auch wenn die Schreibmarke woanders steht.
    zugang.schreibmarkenZeile.mockReturnValue(5);
    renderPresentation(0);
    expect(zaehler()).toBe('3 / 3');
    // Ein anderes Dokument in derselben Spalte, dann zurück: Jedes behält seine Folie.
    const erstes = dokumente[0];
    dokumente[0] = { content: DREI, viewMode: 'presentation', path: 'C:/Notizen/Zweiter.md' };
    renderPresentation(0);
    expect(zaehler()).toBe('1 / 3');
    dokumente[0] = erstes;
    renderPresentation(0);
    expect(zaehler()).toBe('3 / 3');
  });
});

describe('Präsentations-Fläche: Rückfall und Nachzug (4S-001049, AK4/AK7)', () => {
  it('AK7: verliert das Dokument sein Kennzeichen, fällt die Spalte in die Lese-Ansicht', () => {
    renderPresentation(0);
    dokumente[0].content = OHNE_KENNZEICHEN;
    const vorher = dokumente[0].content;
    expect(renderPresentation(0)).toBeNull();
    expect(dokumente[0].viewMode).toBe('rendered');
    expect(zugang.beiRueckfall).toHaveBeenCalledWith(0);
    // Geschrieben wird nichts: Der Rückfall ändert nur den Modus.
    expect(dokumente[0].content).toBe(vorher);
  });

  it('AK7: ebenso bei abgeschalteter Erweiterung', () => {
    aktiv.set('presentation', false);
    expect(renderPresentation(0)).toBeNull();
    expect(dokumente[0].viewMode).toBe('rendered');
    expect(zugang.beiRueckfall).toHaveBeenCalledWith(0);
  });

  it('der Rückfall der Spalte zeichnet und meldet (Verdrahtung)', () => {
    const init = lies('src/renderer/modules/app-init.js');
    const block = /initPresentationPane\(\{[\s\S]*?\n {2}\}\);/.exec(init);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/beiRueckfall:[\s\S]*renderPaneContent\(paneIdx\)/);
    expect(block[0]).toMatch(/reportMenuStateNow\(\)/);
    expect(block[0]).toMatch(/persistState\(\)/);
    expect(block[0]).toMatch(
      /schreibmarkenZeile:[\s\S]*lineAt\(view\.state\.selection\.main\.head\)\.number/,
    );
  });

  it('AK4: eine Änderung im Quelltext erscheint nach dem Nachzug auf der Folie', () => {
    vi.useFakeTimers();
    window.api.lesePraesentation = echteBruecke;
    renderPresentation(0);
    expect(folieText()).toBe('Eins');
    dokumente[0].content = DREI.replace('# Eins', '# Erste Folie');
    schedulePresentationRender(0);
    vi.runAllTimers();
    expect(folieText()).toBe('Erste Folie');
  });

  it('meldet den Wechsel der Verfügbarkeit genau einmal je Wechsel', () => {
    vi.useFakeTimers();
    dokumente[0] = { content: OHNE_KENNZEICHEN, viewMode: 'rendered' };
    schedulePresentationRender(0);
    vi.runAllTimers();
    expect(zugang.beiVerfuegbarkeitsWechsel.mock.calls).toEqual([[0, false]]);
    // Das Kennzeichen wird getippt: ein Wechsel, eine Meldung.
    dokumente[0].content = DREI;
    schedulePresentationRender(0);
    vi.runAllTimers();
    expect(zugang.beiVerfuegbarkeitsWechsel.mock.calls).toEqual([
      [0, false],
      [0, true],
    ]);
    schedulePresentationRender(0);
    vi.runAllTimers();
    expect(zugang.beiVerfuegbarkeitsWechsel).toHaveBeenCalledTimes(2);
  });
});
