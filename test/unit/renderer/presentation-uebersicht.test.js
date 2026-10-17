// @vitest-environment jsdom
// 4T-002280 (Epic 3E-000348): Prüffälle der Folien-Übersicht (Story 4S-001076,
// AK1 und AK6 des Tasks) — Raster aller Folien mit Nummer, Auswahl auf der
// gezeigten Folie, Klick und Enter wechseln, Esc schließt ohne Wechsel, die
// Pfeiltasten bewegen die Auswahl, jede Kachel zeigt ihre Folie vollständig,
// und die Verdrahtung über Registry, Verfügbarkeit, Erweiterung, Menü,
// Menü-Horcher und Dispatcher.
//
// Die Fläche läuft echt (presentation-pane.js) mit dem echten Format-Kern
// hinter der Preload-Brücke; jsdom misst nicht, die Lage der Kacheln wird je
// Fall über `offsetTop` gestellt (Muster presentation-darstellung.test.js).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));

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
};

const { blaettere, initPresentationPane, renderPresentation } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');
const { passeFolieEin } =
  await import('../../../src/renderer/modules/presentation/presentation-folie.js');
const { beendeVorfuehrung, starteVorfuehrung } =
  await import('../../../src/renderer/modules/presentation/presentation-vorfuehrung.js');
const {
  GEWAEHLT_KLASSE,
  KACHEL_BUEHNE_KLASSE,
  KACHEL_KLASSE,
  KACHEL_NUMMER_KLASSE,
  UEBERSICHT_KLASSE,
  UEBERSICHT_ZUSTAND,
  gewaehlteKachel,
  istUebersichtOffen,
  schalteUebersicht,
  spaltenZahl,
} = await import('../../../src/renderer/modules/presentation/presentation-uebersicht.js');

const VIER = [
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
  '* Erster Punkt',
  '* Zweiter Punkt',
  '',
  '---',
  '',
  '# Drei',
  '',
  '---',
  '',
  '# Vier',
  '',
].join('\n');

let spalte;
let container;
let dokumente;
let kaskade;

const zaehler = () => container.querySelector('.praesentation-zaehler').textContent;
const flaeche = () => container.querySelector('.praesentation-flaeche');
const raster = () => container.querySelector(`.${UEBERSICHT_KLASSE}`);
const kacheln = () => [...container.querySelectorAll(`.${KACHEL_KLASSE}`)];

function taste(key, ziel = document.activeElement) {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  ziel.dispatchEvent(ereignis);
  return ereignis;
}

beforeEach(() => {
  document.body.className = '';
  document.body.replaceChildren();
  spalte = document.createElement('section');
  spalte.className = 'pane-group';
  container = document.createElement('section');
  container.className = 'pane pane-presentation';
  spalte.append(container);
  document.body.append(spalte);
  dokumente = [{ content: VIER, viewMode: 'presentation', path: 'C:/Notizen/Vortrag.md' }];
  initPresentationPane({
    getPaneEls: () => ({ presentationEl: container }),
    aktivesDokument: (i) => dokumente[i] || null,
    schreibmarkenZeile: () => 1,
  });
  kaskade = vi.fn();
  window.addEventListener('keydown', kaskade);
  renderPresentation(0);
});

afterEach(() => {
  beendeVorfuehrung();
  window.removeEventListener('keydown', kaskade);
});

describe('Folien-Übersicht: Raster und Bedienung (4S-001076, AK1)', () => {
  it('zeigt alle Folien als Raster mit Nummer, die Auswahl auf der gezeigten Folie', () => {
    blaettere(0, 'weiter');
    expect(schalteUebersicht(0)).toBe(true);
    expect(istUebersichtOffen(0)).toBe(true);
    expect(flaeche().classList).toContain(UEBERSICHT_ZUSTAND);
    expect(raster().getAttribute('role')).toBe('listbox');
    expect(raster().getAttribute('aria-label')).toBe(de['presentation.uebersicht.flaeche']);
    const k = kacheln();
    expect(k).toHaveLength(4);
    expect(k.map((el) => el.querySelector(`.${KACHEL_NUMMER_KLASSE}`).textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(k[2].getAttribute('aria-label')).toBe('Folie 3');
    expect(k.map((el) => el.querySelector('h1').textContent)).toEqual([
      'Eins',
      'Zwei',
      'Drei',
      'Vier',
    ]);
    expect(gewaehlteKachel(0)).toBe(1);
    expect(k[1].classList).toContain(GEWAEHLT_KLASSE);
    expect(k[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(k[1]);
  });

  it('ein Klick auf eine Kachel wechselt zu ihrer Folie und schließt die Übersicht', () => {
    schalteUebersicht(0);
    kacheln()[2].querySelector('h1').click();
    expect(istUebersichtOffen(0)).toBe(false);
    expect(flaeche().classList).not.toContain(UEBERSICHT_ZUSTAND);
    expect(zaehler()).toBe('3 / 4');
    expect(container.querySelector('.praesentation-buehne h1').textContent).toBe('Drei');
  });

  it('Enter und die Leertaste wechseln zur gewählten Folie', () => {
    schalteUebersicht(0);
    taste('ArrowRight');
    taste('ArrowRight');
    taste('Enter');
    expect(istUebersichtOffen(0)).toBe(false);
    expect(zaehler()).toBe('3 / 4');
    schalteUebersicht(0);
    taste('ArrowLeft');
    taste(' ');
    expect(zaehler()).toBe('2 / 4');
  });

  it('Esc schließt ohne Wechsel; die Tasten erreichen weder Blättern noch Escape-Kaskade', () => {
    schalteUebersicht(0);
    taste('ArrowRight');
    taste('ArrowRight');
    expect(zaehler()).toBe('1 / 4');
    const esc = taste('Escape');
    expect(esc.defaultPrevented).toBe(true);
    expect(istUebersichtOffen(0)).toBe(false);
    expect(zaehler()).toBe('1 / 4');
    expect(kaskade).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(flaeche());
  });

  it('die Pfeiltasten bewegen die Auswahl: eine Kachel, eine Zeile, Pos1 und Ende', () => {
    schalteUebersicht(0);
    // Zwei Kacheln je Zeile.
    kacheln().forEach((k, i) => {
      Object.defineProperty(k, 'offsetTop', { configurable: true, value: i < 2 ? 0 : 120 });
    });
    expect(spaltenZahl(kacheln())).toBe(2);
    taste('ArrowDown');
    expect(gewaehlteKachel(0)).toBe(2);
    taste('ArrowRight');
    expect(gewaehlteKachel(0)).toBe(3);
    taste('ArrowRight');
    expect(gewaehlteKachel(0)).toBe(3);
    taste('ArrowDown');
    expect(gewaehlteKachel(0)).toBe(3);
    taste('ArrowUp');
    expect(gewaehlteKachel(0)).toBe(1);
    taste('Home');
    expect(gewaehlteKachel(0)).toBe(0);
    taste('ArrowLeft');
    expect(gewaehlteKachel(0)).toBe(0);
    taste('End');
    expect(gewaehlteKachel(0)).toBe(3);
    // Die Auswahl allein wechselt die Folie nicht.
    expect(zaehler()).toBe('1 / 4');
  });

  it('das Mausrad im Raster blättert nicht in der Fläche', () => {
    schalteUebersicht(0);
    raster().dispatchEvent(new window.WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(zaehler()).toBe('1 / 4');
  });

  it('das Kommando schaltet: ein zweiter Aufruf schließt ohne Wechsel', () => {
    blaettere(0, 'letzte');
    expect(schalteUebersicht(0)).toBe(true);
    taste('Home');
    expect(schalteUebersicht(0)).toBe(false);
    expect(istUebersichtOffen(0)).toBe(false);
    expect(zaehler()).toBe('4 / 4');
  });

  it('ohne gezeigte Präsentation öffnet sie nicht', () => {
    dokumente[0].viewMode = 'rendered';
    expect(schalteUebersicht(0)).toBe(false);
    expect(raster()).toBeNull();
  });

  it('der Start der Vorführung schließt die Übersicht', () => {
    schalteUebersicht(0);
    expect(starteVorfuehrung(0)).toBe(true);
    expect(istUebersichtOffen(0)).toBe(false);
  });
});

describe('Folien-Übersicht: Kacheln (AK1, AK3)', () => {
  it('jede Kachel zeigt ihre Folie vollständig, auch die Aufdeck-Liste', () => {
    schalteUebersicht(0);
    const punkte = [...kacheln()[1].querySelectorAll('li')];
    expect(punkte).toHaveLength(2);
    for (const li of punkte) {
      expect(li.hasAttribute('data-aufdeck-verborgen')).toBe(false);
      expect(li.style.visibility).toBe('');
    }
  });

  it('die Kachel ist eine Bühne ohne Rand im Seitenverhältnis der Folie', () => {
    schalteUebersicht(0);
    const buehne = kacheln()[0].querySelector(`.${KACHEL_BUEHNE_KLASSE}`);
    expect(buehne.dataset.folienRand).toBe('0');
    expect(buehne.style.aspectRatio).toBe('1280 / 720');
    Object.defineProperty(buehne, 'clientWidth', { configurable: true, value: 256 });
    Object.defineProperty(buehne, 'clientHeight', { configurable: true, value: 144 });
    expect(passeFolieEin(buehne)).toBeCloseTo(0.2, 6);
    expect(buehne.querySelector('.presentation-slide').style.transform).toBe('scale(0.2)');
  });
});

describe('Folien-Übersicht: Kommando und Verdrahtung (AK6)', () => {
  const eintrag = COMMANDS.find((c) => c.id === 'presentation.overview');

  it('ist registriert, im Menü, ohne Vorgabe-Kürzel, mit Katalog-Texten', () => {
    expect(eintrag).toBeDefined();
    expect(eintrag.menu).toBe(true);
    expect(eintrag.defaultBindings).toEqual([]);
    expect(eintrag.labelKey).toBe('menu.view.presentationOverview');
    expect(eintrag.descKey).toBe('help.shortcut.presentationOverview');
    expect(de[eintrag.labelKey]).toBe('Folien-Übersicht');
    expect(de[eintrag.descKey]).toBeTruthy();
  });

  it('ist allein in der Ansicht «Folien» einer Präsentation verfügbar', () => {
    const faelle = [
      [{ praesentationTab: true, viewMode: 'presentation' }, true],
      [{ praesentationTab: true, viewMode: 'rendered' }, false],
      [{ praesentationTab: true, viewMode: 'split' }, false],
      [{ praesentationTab: false, viewMode: 'presentation' }, false],
      [{ praesentationTab: true, viewMode: 'presentation', systemTab: true }, false],
    ];
    for (const [roh, soll] of faelle) {
      const ctx = availabilityContext({ hasTab: true, ...roh });
      expect(isAvailable(eintrag.availability, ctx), JSON.stringify(roh)).toBe(soll);
    }
  });

  it('hängt an der Erweiterung und entfällt im Aus-Zustand', () => {
    expect(extensionById('presentation').commands).toContain('presentation.overview');
    expect(disabledCommandIdSet(['presentation']).has('presentation.overview')).toBe(true);
  });

  it('Menü, Menü-Horcher und Dispatcher führen zur Übersicht der aktiven Spalte', () => {
    const menu = lies('src/main/menu/menu.js');
    const untermenue = menu.indexOf("submenuOrNull('menu.view.presentationMenu', [");
    const ort = menu.indexOf("unless('presentation.overview', {");
    expect(ort).toBeGreaterThan(untermenue);
    expect(menu.slice(ort, ort + 300)).toContain("click: send('menu:presentationOverview')");
    expect(lies('src/main/preload.js')).toContain(
      "onMenuPresentationOverview: (cb) => ipcRenderer.on('menu:presentationOverview', () => cb())",
    );
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuPresentationOverview(() => schalteUebersicht(state.activePaneIndex))',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'presentation.overview': () => schalteUebersicht(state.activePaneIndex)",
    );
  });
});
