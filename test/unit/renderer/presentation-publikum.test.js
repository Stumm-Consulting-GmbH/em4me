// @vitest-environment jsdom
// 4T-002278 (Epic 3E-000348): Prüffälle der Vorführung im eigenen Fenster —
// die Seite des Hauptfensters (presentation-publikum.js) und die Seite des
// Publikums-Fensters (publikum-seite.js).
//
// Die Fläche läuft echt (presentation-pane.js) mit festem Modell hinter der
// Preload-Brücke (Muster presentation-vorfuehrung.test.js); die Kanäle des
// Publikums-Fensters sind Attrappen, deren echte Gegenstücke im Hauptprozess
// test/unit/praesentation-fenster.test.js misst. Der Bauer des
// Folien-Dokuments ist eine Attrappe; der echte (folien-export.js) zieht den
// halben Renderer nach.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';

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

let meldeEingabe = null;
let meldeGeschlossen = null;
let oeffnenAntwort = { ok: true, vollbild: false, schonOffen: false };
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: null,
  setWindowFullScreen: vi.fn(async () => false),
  onWindowLeftFullScreen: vi.fn(),
  openPresentationWindow: vi.fn(async () => oeffnenAntwort),
  closePresentationWindow: vi.fn(async () => true),
  sendPresentationSlide: vi.fn(async () => true),
  onPresentationWindowInput: vi.fn((cb) => {
    meldeEingabe = cb;
  }),
  onPresentationWindowClosed: vi.fn((cb) => {
    meldeGeschlossen = cb;
  }),
};

const { initPresentationPane, renderPresentation, blaettere } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');
const { beendeVorfuehrung, istVorfuehrungAktiv, pruefeVorfuehrung, starteVorfuehrung } =
  await import('../../../src/renderer/modules/presentation/presentation-vorfuehrung.js');
const {
  SENDE_VERZOEGERUNG_MS,
  beende,
  istFensterVorfuehrungAktiv,
  registriereFolienDokumentBauer,
  sendeFolie,
  starteVorfuehrungImFenster,
  verarbeiteEingabe,
} = await import('../../../src/renderer/modules/presentation/presentation-publikum.js');
const { einpassFaktor, eingabeAusTaste, eingabeAusRad, starte } =
  await import('../../../src/renderer/modules/presentation/publikum-seite.js');

const DREI = '---\npresentation: true\n---\n\n# Eins\n\n---\n\n# Zwei\n\n---\n\n# Drei\n';
const MODELL_DREI = {
  istPraesentation: true,
  folien: [
    { index: 0, vonZeile: 4, bisZeile: 6, quelltext: '\n# Eins\n', notizen: [] },
    { index: 1, vonZeile: 8, bisZeile: 10, quelltext: '\n# Zwei\n', notizen: [] },
    { index: 2, vonZeile: 12, bisZeile: 14, quelltext: '\n# Drei\n', notizen: [] },
  ],
};

let container;
let dokumente;
const ruhe = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const zaehler = () => container.querySelector('.praesentation-zaehler').textContent;
// Der Bauer liefert den Text der Folie als Dokument.
const bauer = vi.fn(async (huelle) => ({
  html: `<doc>${huelle.textContent.trim()}</doc>`,
  breite: 1280,
  hoehe: 720,
}));

beforeEach(() => {
  window.api.lesePraesentation = vi.fn(() => MODELL_DREI);
  window.api.openPresentationWindow.mockClear();
  window.api.closePresentationWindow.mockClear();
  window.api.sendPresentationSlide.mockClear();
  window.api.setWindowFullScreen.mockClear();
  oeffnenAntwort = { ok: true, vollbild: false, schonOffen: false };
  bauer.mockClear();
  registriereFolienDokumentBauer(bauer);
  document.body.className = '';
  document.body.replaceChildren();
  const spalten = [0, 1].map(() => {
    const s = document.createElement('section');
    s.className = 'pane-group';
    const c = document.createElement('section');
    c.className = 'pane pane-presentation';
    s.append(c);
    document.body.append(s);
    return s;
  });
  container = spalten[0].querySelector('.pane-presentation');
  dokumente = [{ content: DREI, viewMode: 'presentation', path: 'C:/Notizen/Vortrag.md' }];
  initPresentationPane({
    getPaneEls: (i) => ({ presentationEl: spalten[i].querySelector('.pane-presentation') }),
    aktivesDokument: (i) => dokumente[i] || null,
    schreibmarkenZeile: () => 1,
  });
  renderPresentation(0);
});

afterEach(() => {
  beende({ fensterZu: true });
  beendeVorfuehrung();
});

describe('Start und Ende der Vorführung im eigenen Fenster (AK1, AK3)', () => {
  it('öffnet das Publikums-Fenster und sendet die gezeigte Folie', async () => {
    expect(starteVorfuehrungImFenster(0)).toBe(true);
    expect(istFensterVorfuehrungAktiv()).toBe(true);
    expect(window.api.openPresentationWindow).toHaveBeenCalledTimes(1);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide).toHaveBeenCalledWith({
      html: '<doc>Eins</doc>',
      index: 0,
      gesamt: 3,
      breite: 1280,
      hoehe: 720,
    });
  });

  it('ohne gezeigte Präsentation startet sie nicht', () => {
    dokumente[0].viewMode = 'rendered';
    expect(starteVorfuehrungImFenster(0)).toBe(false);
    expect(window.api.openPresentationWindow).not.toHaveBeenCalled();
  });

  it('Blättern im Hauptfenster schickt die neue Folie (Beobachter an der Fläche)', async () => {
    starteVorfuehrungImFenster(0);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    window.api.sendPresentationSlide.mockClear();
    blaettere(0, 'weiter');
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide).toHaveBeenCalledTimes(1);
    expect(window.api.sendPresentationSlide.mock.calls[0][0]).toMatchObject({
      html: '<doc>Zwei</doc>',
      index: 1,
    });
  });

  it('eine unveränderte Folie wird nicht erneut gesendet', async () => {
    starteVorfuehrungImFenster(0);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(await sendeFolie()).toBe(false);
  });

  it('Eingaben des Publikums-Fensters blättern nach den Regeln der Fläche', async () => {
    starteVorfuehrungImFenster(0);
    expect(typeof meldeEingabe).toBe('function');
    meldeEingabe({ art: 'taste', key: 'ArrowRight', shiftKey: false });
    expect(zaehler()).toBe('2 / 3');
    meldeEingabe({ art: 'klick' });
    expect(zaehler()).toBe('3 / 3');
    meldeEingabe({ art: 'taste', key: ' ', shiftKey: true });
    expect(zaehler()).toBe('2 / 3');
    expect(verarbeiteEingabe({ art: 'rad', deltaY: -10 })).toBe(true);
    expect(zaehler()).toBe('1 / 3');
    // Die Rad-Sperre gehört dem Lauf: ein zweiter Rad-Schub sofort danach blättert nicht.
    expect(verarbeiteEingabe({ art: 'rad', deltaY: 10 })).toBe(false);
    expect(zaehler()).toBe('1 / 3');
    expect(verarbeiteEingabe({ art: 'taste', key: 'a' })).toBe(false);
  });

  it('Esc aus dem Publikums-Fenster beendet und schließt das Fenster', () => {
    starteVorfuehrungImFenster(0);
    meldeEingabe({ art: 'beenden' });
    expect(istFensterVorfuehrungAktiv()).toBe(false);
    expect(window.api.closePresentationWindow).toHaveBeenCalledTimes(1);
  });

  it('Esc auf der Fläche des Hauptfensters beendet', () => {
    starteVorfuehrungImFenster(0);
    const flaeche = container.querySelector('.praesentation-flaeche');
    const ereignis = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    flaeche.dispatchEvent(ereignis);
    expect(ereignis.defaultPrevented).toBe(true);
    expect(istFensterVorfuehrungAktiv()).toBe(false);
  });

  it('Esc außerhalb der Fläche bleibt, wo es ist', () => {
    starteVorfuehrungImFenster(0);
    const ereignis = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(ereignis);
    expect(ereignis.defaultPrevented).toBe(false);
    expect(istFensterVorfuehrungAktiv()).toBe(true);
  });

  it('das Schließen des Publikums-Fensters beendet, ohne es erneut zu schließen', () => {
    starteVorfuehrungImFenster(0);
    meldeGeschlossen();
    expect(istFensterVorfuehrungAktiv()).toBe(false);
    expect(window.api.closePresentationWindow).not.toHaveBeenCalled();
  });

  it('scheitert das Öffnen, endet der Lauf', async () => {
    oeffnenAntwort = { ok: false };
    starteVorfuehrungImFenster(0);
    await ruhe();
    expect(istFensterVorfuehrungAktiv()).toBe(false);
  });

  it('das Kommando «Vorführung beenden» beendet auch diese Art', () => {
    starteVorfuehrungImFenster(0);
    expect(beendeVorfuehrung()).toBe(true);
    expect(istFensterVorfuehrungAktiv()).toBe(false);
    expect(window.api.closePresentationWindow).toHaveBeenCalledTimes(1);
  });

  it('beide Arten schließen einander aus', () => {
    starteVorfuehrungImFenster(0);
    expect(starteVorfuehrung(0)).toBe(false);
    expect(istVorfuehrungAktiv()).toBe(false);
    beende();
    expect(starteVorfuehrung(0)).toBe(true);
    expect(starteVorfuehrungImFenster(0)).toBe(false);
  });

  it('der Wegfall der Präsentation in ihrer Spalte beendet, ein Spalten-Wechsel allein nicht', () => {
    starteVorfuehrungImFenster(0);
    expect(pruefeVorfuehrung(1)).toBe(false);
    expect(istFensterVorfuehrungAktiv()).toBe(true);
    dokumente[0].viewMode = 'rendered';
    expect(pruefeVorfuehrung(0)).toBe(true);
    expect(istFensterVorfuehrungAktiv()).toBe(false);
  });
});

describe('Fokus (AK6)', () => {
  it('ein Wechsel des Fokus beendet die Vorführung im eigenen Fenster nicht', () => {
    starteVorfuehrungImFenster(0);
    window.dispatchEvent(new Event('blur'));
    expect(istFensterVorfuehrungAktiv()).toBe(true);
    // Das Hauptfenster geht dabei nicht ins Vollbild.
    expect(window.api.setWindowFullScreen).not.toHaveBeenCalled();
  });
});

describe('Kommandos, Menü und Erweiterung (AK7)', () => {
  const start = COMMANDS.find((c) => c.id === 'presentation.startWindow');
  const stopp = COMMANDS.find((c) => c.id === 'presentation.stop');

  it('«Vorführung im eigenen Fenster» als Kommando im Menü, ohne Kürzel', () => {
    expect(start).toBeTruthy();
    expect(start.menu).toBe(true);
    expect(start.defaultBindings).toEqual([]);
    expect(start.labelKey).toBe('menu.view.presentationStartWindow');
    expect(de['menu.view.presentationStartWindow']).toBe('Vorführung im eigenen Fenster');
  });

  it('beide verfügbar allein in der gezeigten Präsentations-Ansicht', () => {
    for (const cmd of [start, stopp]) {
      const an = availabilityContext({
        hasTab: true,
        praesentationTab: true,
        viewMode: 'presentation',
      });
      const aus = availabilityContext({
        hasTab: true,
        praesentationTab: true,
        viewMode: 'rendered',
      });
      expect(isAvailable(cmd.availability, an), cmd.id).toBe(true);
      expect(isAvailable(cmd.availability, aus), cmd.id).toBe(false);
    }
  });

  it('beide gehören zur Erweiterung presentation und entfallen mit ihr', () => {
    const liste = extensionById('presentation').commands;
    expect(liste).toContain('presentation.startWindow');
    expect(liste).toContain('presentation.stop');
    const aus = disabledCommandIdSet(['presentation']);
    expect(aus.has('presentation.startWindow')).toBe(true);
    expect(aus.has('presentation.stop')).toBe(true);
  });

  it('Menü, Brücke, Menü-Horcher und Dispatcher sind verdrahtet', () => {
    const menue = lies('src/main/menu/menu.js');
    expect(menue).toMatch(/unless\('presentation\.startWindow'/);
    expect(menue).toMatch(/send\('menu:presentationStartWindow'\)/);
    expect(menue).toMatch(/unless\('presentation\.stop'/);
    expect(menue).toMatch(/send\('menu:presentationStop'\)/);
    const bindungen = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(bindungen).toMatch(/onMenuPresentationStartWindow\(/);
    expect(bindungen).toMatch(/onMenuPresentationStop\(\(\) => beendeVorfuehrung\(\)\)/);
    const dispatcher = lies('src/renderer/modules/app/app-commands.js');
    expect(dispatcher).toMatch(
      /'presentation\.startWindow': \(\) => starteVorfuehrungImFenster\(state\.activePaneIndex\)/,
    );
  });
});

describe('Seite des Publikums-Fensters (publikum-seite.js)', () => {
  it('passt die Folie gleichmäßig ein', () => {
    expect(einpassFaktor(1920, 1080, 1280, 720)).toBe(1.5);
    expect(einpassFaktor(1000, 1000, 1280, 720)).toBeCloseTo(1000 / 1280);
    expect(einpassFaktor(0, 0, 1280, 720)).toBe(0);
  });

  it('Esc wird «beenden», andere Tasten gehen ohne Strg/Alt/Meta weiter', () => {
    expect(eingabeAusTaste({ key: 'Escape' })).toEqual({ art: 'beenden' });
    expect(eingabeAusTaste({ key: 'ArrowRight', shiftKey: false })).toMatchObject({
      art: 'taste',
      key: 'ArrowRight',
    });
    expect(eingabeAusTaste({ key: 'r', ctrlKey: true })).toBe(null);
    expect(eingabeAusRad({ deltaY: 4 })).toEqual({ art: 'rad', deltaY: 4, ctrlKey: false });
    expect(eingabeAusRad({ deltaY: 4, ctrlKey: true })).toBe(null);
    expect(eingabeAusRad({ deltaY: 0 })).toBe(null);
  });

  it('zeigt die gelieferte Folie im Rahmen und meldet Eingaben', async () => {
    document.body.innerHTML =
      '<div class="publikum-buehne"><iframe class="publikum-folie" sandbox="" hidden></iframe></div>';
    let folieCb = null;
    const bruecke = {
      bereit: vi.fn(async () => ({
        html: '<p>X</p>',
        index: 0,
        gesamt: 1,
        breite: 1280,
        hoehe: 720,
      })),
      onFolie: vi.fn((cb) => {
        folieCb = cb;
      }),
      eingabe: vi.fn(async () => true),
    };
    expect(starte(window, bruecke)).toBeTruthy();
    await ruhe();
    const rahmen = document.querySelector('.publikum-folie');
    expect(rahmen.getAttribute('srcdoc')).toBe('<p>X</p>');
    expect(rahmen.hidden).toBe(false);
    expect(rahmen.style.width).toBe('1280px');
    folieCb({ html: '<p>Y</p>', index: 1, gesamt: 2, breite: 960, hoehe: 720 });
    expect(rahmen.getAttribute('srcdoc')).toBe('<p>Y</p>');
    const taste = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    window.dispatchEvent(taste);
    expect(taste.defaultPrevented).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new MouseEvent('click'));
    expect(bruecke.eingabe.mock.calls.map((c) => c[0].art)).toEqual(['taste', 'beenden', 'klick']);
  });
});
