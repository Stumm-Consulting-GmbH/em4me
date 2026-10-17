// @vitest-environment jsdom
// 4T-002162 (Epic 3E-000149): Prüffälle der Vorführung — Start an der gezeigten
// Folie samt Ausblendung und Vollbild-Brücke, die Tasten-Tabelle, der Mausklick,
// das Ende auf jedem Weg (Esc, Kommando, Vollbild außerhalb der Anwendung
// verlassen, Fenster- und Dokument-Wechsel) mit Rückkehr auf den Zustand davor,
// das Nebeneinander mit dem Fokus-Modus und die Verdrahtung über Registry,
// Erweiterung, Menü, Brücke und Dispatcher (Story 4S-001050).
//
// Die Fläche läuft echt (presentation-pane.js) mit festem Modell hinter der
// Preload-Brücke; die Vollbild-Brücke ist eine Attrappe, deren Antwort der
// Zustand davor ist — wie der Kanal im Hauptprozess, dessen echter Handler in
// test/unit/praesentation-vollbild-kanal.test.js geprüft wird. Erweiterungs-
// Lebenszyklus und Übersetzung sind gemockt (Muster presentation-pane.test.js).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
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

// Die Brücke, gestellt VOR dem Laden der Module, weil `api.js` `window.api`
// beim Laden bindet. Die Vollbild-Attrappe hält ihren Zustand und antwortet
// wie der Kanal mit dem Zustand davor.
let vollbild = false;
let meldeVollbildVerlassen = null;
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: null,
  setWindowFullScreen: vi.fn(async (an) => {
    const vorher = vollbild;
    vollbild = an === true;
    return vorher;
  }),
  onWindowLeftFullScreen: vi.fn((cb) => {
    meldeVollbildVerlassen = cb;
  }),
};

const { RAD_SPERRE_MS, blaettere, initPresentationPane, renderPresentation, richtungAusTaste } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');
const { passeFolieEin } =
  await import('../../../src/renderer/modules/presentation/presentation-folie.js');
const {
  SPALTE_KLASSE,
  beendeVorfuehrung,
  istVorfuehrungAktiv,
  pruefeVorfuehrung,
  starteVorfuehrung,
} = await import('../../../src/renderer/modules/presentation/presentation-vorfuehrung.js');

const DREI = '---\npresentation: true\n---\n\n# Eins\n\n---\n\n# Zwei\n\n---\n\n# Drei\n';
const MODELL_DREI = {
  istPraesentation: true,
  folien: [
    { index: 0, vonZeile: 4, bisZeile: 6, quelltext: '\n# Eins\n', notizen: [] },
    { index: 1, vonZeile: 8, bisZeile: 10, quelltext: '\n# Zwei\n', notizen: [] },
    { index: 2, vonZeile: 12, bisZeile: 14, quelltext: '\n# Drei\n', notizen: [] },
  ],
};

let spalten;
let container;
let dokumente;
let zugang;
let kaskade;

const zaehler = () => container.querySelector('.praesentation-zaehler').textContent;
const folieText = () => container.querySelector('.praesentation-folie').textContent.trim();
const flaeche = () => container.querySelector('.praesentation-flaeche');
// Mikro-Takte abwarten, bis die Antworten der Vollbild-Brücke durch sind.
const ruhe = () => new Promise((r) => setTimeout(r, 0));

function taste(key, optionen = {}) {
  const ereignis = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...optionen,
  });
  flaeche().dispatchEvent(ereignis);
  return ereignis;
}

function rad(deltaY, optionen = {}) {
  const ereignis = new window.WheelEvent('wheel', {
    deltaY,
    bubbles: true,
    cancelable: true,
    ...optionen,
  });
  flaeche().dispatchEvent(ereignis);
  return ereignis;
}

beforeEach(() => {
  vollbild = false;
  window.api.setWindowFullScreen.mockClear();
  window.api.lesePraesentation = vi.fn(() => MODELL_DREI);
  document.body.className = '';
  document.body.replaceChildren();
  // Zwei Spalten wie im Dokument-Gerüst, die Präsentation in der ersten.
  spalten = [0, 1].map((i) => {
    const s = document.createElement('section');
    s.className = 'pane-group';
    s.dataset.pane = String(i);
    const c = document.createElement('section');
    c.className = 'pane pane-presentation';
    s.append(c);
    document.body.append(s);
    return s;
  });
  container = spalten[0].querySelector('.pane-presentation');
  dokumente = [{ content: DREI, viewMode: 'presentation', path: 'C:/Notizen/Vortrag.md' }];
  zugang = {
    getPaneEls: (i) => ({ presentationEl: spalten[i].querySelector('.pane-presentation') }),
    aktivesDokument: (i) => dokumente[i] || null,
    schreibmarkenZeile: () => 1,
  };
  initPresentationPane(zugang);
  // Die Escape-Kaskade des Fensters (app-input-bindings.js) als Zuhörer in
  // der Blase: Sie verließe den Fokus-Modus.
  kaskade = vi.fn((e) => {
    if (e.key === 'Escape') document.body.classList.remove('focus-mode');
  });
  window.addEventListener('keydown', kaskade);
  renderPresentation(0);
});

afterEach(() => {
  beendeVorfuehrung();
  window.removeEventListener('keydown', kaskade);
});

describe('Start der Vorführung (4S-001050, AK1/AK2/AK6)', () => {
  it('setzt die Klassen, ruft die Vollbild-Brücke und öffnet kein Fenster', () => {
    expect(starteVorfuehrung(0)).toBe(true);
    expect(istVorfuehrungAktiv()).toBe(true);
    expect(document.body.classList).toContain('presentation-vorfuehrung');
    expect(spalten[0].classList).toContain(SPALTE_KLASSE);
    expect(spalten[1].classList).not.toContain(SPALTE_KLASSE);
    expect(window.api.setWindowFullScreen).toHaveBeenCalledTimes(1);
    expect(window.api.setWindowFullScreen).toHaveBeenCalledWith(true);
    // AK6: Es gibt keinen Weg zu einem zweiten Fenster; die Brücke kennt nur
    // das eigene.
    expect(window.api.openNewWindow).toBeUndefined();
  });

  it('startet an der gerade gezeigten Folie, nicht an der ersten', () => {
    blaettere(0, 'weiter');
    expect(zaehler()).toBe('2 / 3');
    starteVorfuehrung(0);
    expect(zaehler()).toBe('2 / 3');
    expect(folieText()).toBe('Zwei');
  });

  it('startet nicht ohne gezeigte Präsentation und nicht ein zweites Mal', () => {
    dokumente[0].viewMode = 'rendered';
    expect(starteVorfuehrung(0)).toBe(false);
    expect(document.body.classList).not.toContain('presentation-vorfuehrung');
    dokumente[0].viewMode = 'presentation';
    expect(starteVorfuehrung(0)).toBe(true);
    expect(starteVorfuehrung(0)).toBe(false);
    expect(window.api.setWindowFullScreen).toHaveBeenCalledTimes(1);
  });

  it('die Schaltfläche der Leiste startet die Vorführung ihrer Spalte', () => {
    const knopf = container.querySelector('.praesentation-vorfuehren');
    expect(knopf).not.toBeNull();
    expect(knopf.textContent).toBe('Vorführung starten');
    expect(knopf.disabled).toBe(false);
    knopf.click();
    expect(istVorfuehrungAktiv()).toBe(true);
    expect(spalten[0].classList).toContain(SPALTE_KLASSE);
  });

  it('die Schaltfläche ist ohne Folien deaktiviert', () => {
    window.api.lesePraesentation = vi.fn(() => ({ folien: [] }));
    dokumente[0] = { ...dokumente[0], content: `${DREI}\n` };
    renderPresentation(0);
    expect(container.querySelector('.praesentation-vorfuehren').disabled).toBe(true);
  });

  it('die Folie passt sich in der Vorführung ohne Rand ein', () => {
    const buehne = container.querySelector('.praesentation-buehne');
    Object.defineProperty(buehne, 'clientWidth', { configurable: true, value: 1280 });
    Object.defineProperty(buehne, 'clientHeight', { configurable: true, value: 720 });
    // Außerhalb mit Rand von 24 px ringsum: kleiner als 1.
    expect(passeFolieEin(buehne)).toBeLessThan(1);
    starteVorfuehrung(0);
    expect(passeFolieEin(buehne)).toBe(1);
  });
});

describe('Blättern in der Vorführung (4S-001050, AK3/AK4)', () => {
  it('Pfeile, Leertaste, Bild auf/ab, Pos1 und Ende blättern', () => {
    starteVorfuehrung(0);
    taste('ArrowRight');
    expect(zaehler()).toBe('2 / 3');
    taste(' ');
    expect(zaehler()).toBe('3 / 3');
    taste(' ', { shiftKey: true });
    expect(zaehler()).toBe('2 / 3');
    taste('PageUp');
    expect(zaehler()).toBe('1 / 3');
    taste('PageDown');
    expect(zaehler()).toBe('2 / 3');
    taste('ArrowLeft');
    expect(zaehler()).toBe('1 / 3');
    taste('End');
    expect(zaehler()).toBe('3 / 3');
    taste('Home');
    expect(zaehler()).toBe('1 / 3');
  });

  it('AK4: an der ersten und letzten Folie bleibt es stehen, die Vorführung läuft weiter', () => {
    starteVorfuehrung(0);
    taste('ArrowLeft');
    expect(zaehler()).toBe('1 / 3');
    taste('End');
    taste('ArrowRight');
    taste(' ');
    expect(zaehler()).toBe('3 / 3');
    expect(istVorfuehrungAktiv()).toBe(true);
  });

  it('ein Mausklick blättert vorwärts', () => {
    starteVorfuehrung(0);
    container.querySelector('.praesentation-folie').click();
    expect(zaehler()).toBe('2 / 3');
    document.body.click();
    expect(zaehler()).toBe('3 / 3');
  });

  it('die Tasten erreichen weder Fläche noch Fenster-Kaskade doppelt', () => {
    starteVorfuehrung(0);
    const ereignis = taste('ArrowRight');
    expect(ereignis.defaultPrevented).toBe(true);
    // Ein Schritt, nicht zwei: Der Zuhörer der Fläche bekommt die Taste nicht.
    expect(zaehler()).toBe('2 / 3');
    expect(kaskade).not.toHaveBeenCalled();
  });

  it('eine fremde Taste bleibt unberührt', () => {
    starteVorfuehrung(0);
    const ereignis = taste('a');
    expect(ereignis.defaultPrevented).toBe(false);
    expect(kaskade).toHaveBeenCalledTimes(1);
  });

  describe('Mausrad (Abnahme 2026-10-10)', () => {
    let uhr;
    beforeEach(() => {
      uhr = 50_000;
      vi.spyOn(Date, 'now').mockImplementation(() => uhr);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('Rad nach unten blättert vor, nach oben zurück, genau einen Schritt', () => {
      starteVorfuehrung(0);
      const ereignis = rad(100);
      expect(ereignis.defaultPrevented).toBe(true);
      // Ein Schritt, nicht zwei: Der Zuhörer der Fläche bekommt das Rad nicht.
      expect(zaehler()).toBe('2 / 3');
      uhr += RAD_SPERRE_MS;
      rad(-100);
      expect(zaehler()).toBe('1 / 3');
    });

    it('zwei Ereignisse innerhalb der Sperre blättern einmal', () => {
      starteVorfuehrung(0);
      rad(40);
      uhr += 120;
      expect(rad(40).defaultPrevented).toBe(true);
      expect(zaehler()).toBe('2 / 3');
      uhr += RAD_SPERRE_MS;
      rad(40);
      expect(zaehler()).toBe('3 / 3');
      expect(istVorfuehrungAktiv()).toBe(true);
    });

    it('horizontales Rollen und Strg+Rad bleiben unberührt', () => {
      starteVorfuehrung(0);
      expect(rad(0, { deltaX: 120 }).defaultPrevented).toBe(false);
      expect(rad(100, { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(zaehler()).toBe('1 / 3');
    });

    it('nach dem Ende blättert das Rad wieder allein über die Fläche', () => {
      starteVorfuehrung(0);
      beendeVorfuehrung();
      rad(100);
      expect(zaehler()).toBe('2 / 3');
      const quelle = lies('src/renderer/modules/presentation/presentation-vorfuehrung.js');
      expect(quelle).toContain('richtungAusRad(ereignis, lauf.radSperre)');
      expect(quelle).not.toMatch(/deltaY/);
    });
  });

  it('die Tasten-Tabelle ist die eine der Fläche', () => {
    // Keine zweite Tabelle im Modul der Vorführung: Es fragt richtungAusTaste.
    const quelle = lies('src/renderer/modules/presentation/presentation-vorfuehrung.js');
    expect(quelle).toContain('richtungAusTaste(ereignis)');
    expect(quelle).not.toMatch(/'ArrowRight'|'PageDown'|'Home'/);
    expect(richtungAusTaste({ key: ' ', shiftKey: true })).toBe('zurueck');
    expect(richtungAusTaste({ key: 'Escape' })).toBe(null);
  });
});

describe('Ende der Vorführung (4S-001050, AK5/AK8)', () => {
  it('Esc beendet, stellt zurück und lässt die Ansicht auf derselben Folie', async () => {
    starteVorfuehrung(0);
    taste('ArrowRight');
    taste('ArrowRight');
    await ruhe();
    const ereignis = taste('Escape');
    expect(ereignis.defaultPrevented).toBe(true);
    expect(istVorfuehrungAktiv()).toBe(false);
    expect(document.body.classList).not.toContain('presentation-vorfuehrung');
    expect(spalten[0].classList).not.toContain(SPALTE_KLASSE);
    await ruhe();
    expect(window.api.setWindowFullScreen).toHaveBeenLastCalledWith(false);
    expect(vollbild).toBe(false);
    expect(zaehler()).toBe('3 / 3');
    expect(folieText()).toBe('Drei');
    // Nach dem Ende blättern die Tasten wieder allein über die Fläche.
    taste('ArrowLeft');
    expect(zaehler()).toBe('2 / 3');
  });

  it('Esc wird abgefangen: Der Fokus-Modus bleibt, wie er war', async () => {
    document.body.classList.add('focus-mode');
    starteVorfuehrung(0);
    expect(document.body.classList).toContain('focus-mode');
    taste('Escape');
    expect(kaskade).not.toHaveBeenCalled();
    expect(document.body.classList).toContain('focus-mode');
    expect(istVorfuehrungAktiv()).toBe(false);
  });

  it('ein Esc wartet auf die Antwort der Brücke und stellt dann zurück', async () => {
    starteVorfuehrung(0);
    // Noch vor der Antwort beendet.
    taste('Escape');
    await ruhe();
    expect(window.api.setWindowFullScreen.mock.calls).toEqual([[true], [false]]);
    expect(vollbild).toBe(false);
  });

  it('war das Fenster vorher im Vollbild, bleibt es dort', async () => {
    vollbild = true;
    starteVorfuehrung(0);
    await ruhe();
    beendeVorfuehrung();
    await ruhe();
    expect(window.api.setWindowFullScreen.mock.calls).toEqual([[true]]);
    expect(vollbild).toBe(true);
  });

  it('das Kommando beendet ebenso, ohne laufende Vorführung bleibt es ohne Wirkung', () => {
    expect(beendeVorfuehrung()).toBe(false);
    starteVorfuehrung(0);
    expect(beendeVorfuehrung()).toBe(true);
    expect(istVorfuehrungAktiv()).toBe(false);
  });

  it('das Verlassen des Vollbilds außerhalb der Anwendung beendet die Vorführung', async () => {
    starteVorfuehrung(0);
    await ruhe();
    expect(window.api.onWindowLeftFullScreen).toHaveBeenCalled();
    vollbild = false;
    meldeVollbildVerlassen();
    expect(istVorfuehrungAktiv()).toBe(false);
    expect(document.body.classList).not.toContain('presentation-vorfuehrung');
    // Eine Meldung ohne laufende Vorführung bleibt ohne Wirkung.
    expect(() => meldeVollbildVerlassen()).not.toThrow();
  });

  it('der Wechsel in ein anderes Fenster beendet die Vorführung', () => {
    starteVorfuehrung(0);
    window.dispatchEvent(new Event('blur'));
    expect(istVorfuehrungAktiv()).toBe(false);
  });

  it('der Wechsel von Dokument, Spalte oder Ansicht beendet die Vorführung', () => {
    starteVorfuehrung(0);
    expect(pruefeVorfuehrung(0)).toBe(false);
    expect(istVorfuehrungAktiv()).toBe(true);
    expect(pruefeVorfuehrung(1)).toBe(true);
    expect(istVorfuehrungAktiv()).toBe(false);

    starteVorfuehrung(0);
    dokumente[0] = { ...dokumente[0] };
    expect(pruefeVorfuehrung(0)).toBe(true);

    starteVorfuehrung(0);
    dokumente[0].viewMode = 'rendered';
    expect(pruefeVorfuehrung(0)).toBe(true);
    expect(pruefeVorfuehrung(0)).toBe(false);
  });

  it('das Schließen des vorgeführten Dokuments beendet die Vorführung (Befund 2026-10-10)', () => {
    // closeTab zeichnet die Leisten über syncToolbarToActiveTab neu; dort
    // fragt pruefeVorfuehrung, ob die Spalte das Dokument noch zeigt.
    starteVorfuehrung(0);
    dokumente = [];
    expect(pruefeVorfuehrung(0)).toBe(true);
    expect(istVorfuehrungAktiv()).toBe(false);
    expect(document.body.classList).not.toContain('presentation-vorfuehrung');
    expect(spalten[0].classList).not.toContain(SPALTE_KLASSE);
  });

  it('AK8: wiederholtes Starten und Beenden hinterlässt jedes Mal den Zustand davor', async () => {
    for (let i = 0; i < 3; i += 1) {
      starteVorfuehrung(0);
      await ruhe();
      expect(vollbild).toBe(true);
      taste('Escape');
      await ruhe();
      expect(vollbild).toBe(false);
      expect(document.body.className).toBe('');
      expect(spalten[0].className).toBe('pane-group');
    }
  });
});

describe('Kommandos und Verdrahtung (4T-002162, AK1/AK6)', () => {
  const start = COMMANDS.find((c) => c.id === 'presentation.start');
  const stopp = COMMANDS.find((c) => c.id === 'presentation.stop');

  it('Start mit F5, Menü-Eintrag und Katalog-Schlüsseln', () => {
    expect(start).toBeTruthy();
    expect(start.defaultBindings).toEqual(['F5']);
    expect(start.menu).toBe(true);
    expect(start.editorScoped).toBe(false);
    expect(start.labelKey).toBe('menu.view.presentationStart');
    expect(start.descKey).toBe('help.shortcut.presentationStart');
    expect(start.categoryKey).toBe('help.group.view');
    expect(start.availability).toBe('praesentationsAnsichtAktiv');
  });

  // 4T-002278: seit der Vorführung im eigenen Fenster auch im Menü, weil das
  // Hauptfenster dabei sein Menü behält.
  it('Ende ohne Kürzel, in Palette und Menü', () => {
    expect(stopp).toBeTruthy();
    expect(stopp.defaultBindings).toEqual([]);
    expect(stopp.menu).toBe(true);
    expect(stopp.labelKey).toBe('presentation.vorfuehrungBeenden');
    expect(stopp.availability).toBe('praesentationsAnsichtAktiv');
  });

  it('F5 ist genau einmal belegt', () => {
    const belegt = COMMANDS.filter((c) => (c.defaultBindings || []).includes('F5'));
    expect(belegt.map((c) => c.id)).toEqual(['presentation.start']);
  });

  it('AK1: verfügbar allein in der gezeigten Präsentations-Ansicht', () => {
    const faelle = [
      [{ praesentationTab: true, viewMode: 'presentation' }, true],
      [{ praesentationTab: true, viewMode: 'rendered' }, false],
      [{ praesentationTab: true, viewMode: 'split' }, false],
      [{ praesentationTab: false, viewMode: 'presentation' }, false],
      [{ praesentationTab: true, viewMode: 'presentation', systemTab: true }, false],
      [{ tafelTab: true, viewMode: 'kanban' }, false],
    ];
    for (const [roh, soll] of faelle) {
      const ctx = availabilityContext({ hasTab: true, ...roh });
      expect(isAvailable(start.availability, ctx), JSON.stringify(roh)).toBe(soll);
    }
  });

  it('AK6: beide hängen an der Erweiterung und entfallen im Aus-Zustand', () => {
    const commands = extensionById('presentation').commands;
    expect(commands).toContain('presentation.start');
    expect(commands).toContain('presentation.stop');
    const aus = disabledCommandIdSet(['presentation']);
    expect(aus.has('presentation.start')).toBe(true);
    expect(aus.has('presentation.stop')).toBe(true);
  });

  it('Menü: Untermenü «Präsentation» hinter dem der Tafel, mit Kanal und Freigabe', () => {
    const menu = lies('src/main/menu/menu.js');
    const untermenue = menu.indexOf("submenuOrNull('menu.view.presentationMenu', [");
    expect(untermenue).toBeGreaterThan(menu.indexOf("submenuOrNull('menu.view.kanbanBoard', ["));
    // 4T-002163: Vor dem Start steht seither «Neue Präsentation…» samt Trenner.
    const block = menu.slice(untermenue, untermenue + 700);
    expect(block).toContain("unless('presentation.start', {");
    expect(block).toContain("label: t('menu.view.presentationStart')");
    expect(block).toContain("enabled: avail('presentation.start')");
    expect(block).toContain("accelerator: acc('presentation.start')");
    expect(block).toContain("click: send('menu:presentationStart')");
  });

  it('Menü-Horcher, Dispatcher, Schaltfläche und Leisten-Abgleich führen die Vorführung', () => {
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuPresentationStart(() => starteVorfuehrung(state.activePaneIndex))',
    );
    const befehle = lies('src/renderer/modules/app/app-commands.js');
    expect(befehle).toContain(
      "'presentation.start': () => starteVorfuehrung(state.activePaneIndex)",
    );
    expect(befehle).toContain("'presentation.stop': () => beendeVorfuehrung()");
    expect(lies('src/renderer/modules/presentation/presentation-vorfuehrung.js')).toContain(
      'registriereVorfuehrungsStart(starteVorfuehrung);',
    );
    expect(lies('src/renderer/modules/tabs/tabs.js')).toMatch(
      /export function syncToolbarToActiveTab\(\) \{\s*pruefeVorfuehrung\(state\.activePaneIndex\);/,
    );
  });

  it('das Stilblatt blendet die Leisten aus und legt die Fläche schwarz über das Fenster', () => {
    const css = lies('src/renderer/styles/presentation.css');
    for (const sel of [
      '.tabbar',
      '.statusbar',
      '.pane-sidebar',
      '.splitter',
      '.format-toolbar',
      '.title-line',
      '.pane-group:not(.presentation-vorfuehrung-spalte)',
      '.praesentation-leiste',
    ]) {
      expect(css, sel).toContain(`body.presentation-vorfuehrung ${sel}`);
    }
    expect(css).toMatch(
      /body\.presentation-vorfuehrung \.presentation-vorfuehrung-spalte \.praesentation-flaeche \{[^}]*position: fixed;[^}]*inset: 0;[^}]*background: #000;/,
    );
    // Die Überlauf-Markierung bleibt in der Vorführung verborgen (4T-002161).
    expect(css).toContain('body.presentation-vorfuehrung .presentation-slide-ueberlauf');
  });

  it('die Texte stehen im Katalog aller fünf Sprachen', () => {
    for (const code of ['de', 'en', 'fr', 'es', 'it']) {
      const katalog = JSON.parse(lies(`src/i18n/${code}.json`));
      for (const key of [
        'menu.view.presentationMenu',
        'menu.view.presentationStart',
        'presentation.vorfuehrungBeenden',
        'help.shortcut.presentationStart',
      ]) {
        expect(katalog[key], `${code}: ${key}`).toBeTruthy();
        expect(katalog[key]).not.toContain('"');
      }
    }
  });
});
