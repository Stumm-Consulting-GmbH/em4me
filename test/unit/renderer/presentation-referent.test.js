// @vitest-environment jsdom
// 4T-002279 (Epic 3E-000348): Prüffälle der Referenten-Ansicht
// (presentation-referent.js) — Zustand, Blättern aus beiden Fenstern,
// Notizen gerendert und in Reihenfolge, Zeitgeber mit gestellter Uhr, Ende auf
// allen Wegen, Rückkehr in die gewöhnliche Präsentations-Ansicht und
// Dokument-Änderung mit entfallener Folie.
//
// Die Fläche und die Vorführung im eigenen Fenster laufen echt
// (presentation-pane.js, presentation-publikum.js) mit festem Modell hinter
// der Preload-Brücke und echter Markdown-Pipeline (Muster
// presentation-publikum.test.js); die Kanäle des Publikums-Fensters und der
// Bauer des Folien-Dokuments sind Attrappen. Die Texte der Referenten-Ansicht
// erscheinen als Schlüssel-Namen, solange der Katalog sie nicht führt.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const de = JSON.parse(readFileSync(path.join(wurzel, 'src/i18n/de.json'), 'utf8'));

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

const { initPresentationPane, renderPresentation } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');
const { beendeVorfuehrung, pruefeVorfuehrung, starteVorfuehrung } =
  await import('../../../src/renderer/modules/presentation/presentation-vorfuehrung.js');
const {
  SENDE_VERZOEGERUNG_MS,
  beende,
  istFensterVorfuehrungAktiv,
  registriereFolienDokumentBauer,
  starteVorfuehrungImFenster,
} = await import('../../../src/renderer/modules/presentation/presentation-publikum.js');
const {
  REFERENT_KLASSE,
  REFERENT_ZUSTAND,
  ZEIT_TAKT_MS,
  beendeReferentenAnsicht,
  formatiereDauer,
  formatiereUhrzeit,
  istReferentenAnsichtAktiv,
  referentenStand,
  schalteZeitgeber,
  setzeZeitgeberZurueck,
  starteReferentenAnsicht,
} = await import('../../../src/renderer/modules/presentation/presentation-referent.js');

const DREI = '---\npresentation: true\n---\n\n# Eins\n\n---\n\n# Zwei\n\n---\n\n# Drei\n';
const NOTIZEN_EINS = [
  { text: '- Punkt **fett**\n- [Verweis](https://example.org)', herkunft: 'prozent' },
  { text: 'Danach *betont*', herkunft: 'html' },
];
const modellDrei = (zweiText = 'Zwei') => ({
  istPraesentation: true,
  folien: [
    { index: 0, vonZeile: 4, bisZeile: 6, quelltext: '\n# Eins\n', notizen: NOTIZEN_EINS },
    { index: 1, vonZeile: 8, bisZeile: 10, quelltext: `\n# ${zweiText}\n`, notizen: [] },
    {
      index: 2,
      vonZeile: 12,
      bisZeile: 14,
      quelltext: '\n# Drei\n',
      notizen: [{ text: '<b>roh</b> bleibt Text', herkunft: 'prozent' }],
    },
  ],
});
const MODELL_ZWEI = {
  istPraesentation: true,
  folien: [
    { index: 0, vonZeile: 4, bisZeile: 6, quelltext: '\n# Eins\n', notizen: [] },
    { index: 1, vonZeile: 8, bisZeile: 10, quelltext: '\n# Zwei\n', notizen: [] },
  ],
};

let container;
let dokumente;
let modell;
const ruhe = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const zaehler = () => container.querySelector('.praesentation-zaehler').textContent;
const flaeche = () => container.querySelector('.praesentation-flaeche');
const seite = () => container.querySelector(`.${REFERENT_KLASSE}`);
const teil = (klasse) => seite().querySelector(`.${klasse}`);
const notizen = () => [...seite().querySelectorAll('.praesentation-referent-notiz')];
const vorschauText = () => teil('praesentation-referent-vorschau').textContent.trim();
const taste = (key, ziel = flaeche()) => {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  ziel.dispatchEvent(ereignis);
  return ereignis;
};
const bauer = vi.fn(async (huelle) => ({
  html: `<doc>${huelle.textContent.trim()}</doc>`,
  breite: 1280,
  hoehe: 720,
}));

beforeEach(() => {
  modell = modellDrei();
  window.api.lesePraesentation = vi.fn(() => modell);
  window.api.openPresentationWindow.mockClear();
  window.api.closePresentationWindow.mockClear();
  window.api.sendPresentationSlide.mockClear();
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
  beendeReferentenAnsicht();
  beende({ fensterZu: true });
  beendeVorfuehrung();
  vi.useRealTimers();
});

describe('Start und Aufbau (AK1)', () => {
  it('öffnet das Publikums-Fenster und zeigt aktuelle und nächste Folie, Notizen und Zeit', async () => {
    expect(starteReferentenAnsicht(0)).toBe(true);
    expect(istReferentenAnsichtAktiv()).toBe(true);
    expect(istFensterVorfuehrungAktiv()).toBe(true);
    expect(window.api.openPresentationWindow).toHaveBeenCalledTimes(1);
    expect(flaeche().classList.contains(REFERENT_ZUSTAND)).toBe(true);
    // Die aktuelle Folie bleibt die der Bühne, die nächste steht daneben.
    expect(container.querySelector('.praesentation-buehne').textContent).toContain('Eins');
    expect(vorschauText()).toBe('Zwei');
    expect(teil('praesentation-referent-ende').hidden).toBe(true);
    expect(notizen()).toHaveLength(2);
    expect(teil('praesentation-referent-verstrichen').textContent).toBe('0:00');
    expect(teil('praesentation-referent-uhrzeit').textContent).not.toBe('');
    expect(zaehler()).toBe('1 / 3');
    expect(referentenStand()).toMatchObject({ paneIdx: 0, index: 0, aufdeckSchritt: 0 });
    // Gesendet wird die aktuelle Folie, nicht die Seite der Referenten-Ansicht.
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide).toHaveBeenCalledTimes(1);
    expect(window.api.sendPresentationSlide.mock.calls[0][0]).toMatchObject({
      html: '<doc>Eins</doc>',
      index: 0,
      gesamt: 3,
    });
  });

  it('ohne gezeigte Präsentation startet sie nicht', () => {
    dokumente[0].viewMode = 'rendered';
    expect(starteReferentenAnsicht(0)).toBe(false);
    expect(istReferentenAnsichtAktiv()).toBe(false);
    expect(window.api.openPresentationWindow).not.toHaveBeenCalled();
  });

  it('läuft bereits eine Vorführung, startet sie nicht', () => {
    expect(starteVorfuehrung(0)).toBe(true);
    expect(starteReferentenAnsicht(0)).toBe(false);
    expect(seite()).toBeNull();
    beendeVorfuehrung();
    expect(starteVorfuehrungImFenster(0)).toBe(true);
    expect(starteReferentenAnsicht(0)).toBe(false);
    expect(istReferentenAnsichtAktiv()).toBe(false);
  });

  it('auf der letzten Folie steht «Ende» statt der nächsten Folie', () => {
    starteReferentenAnsicht(0);
    taste('End');
    expect(zaehler()).toBe('3 / 3');
    expect(teil('praesentation-referent-vorschau').hidden).toBe(true);
    const ende = teil('praesentation-referent-ende');
    expect(ende.hidden).toBe(false);
    expect(ende.textContent).toBe(de['presentation.referent.ende'] ?? 'presentation.referent.ende');
  });

  it('scheitert das Öffnen des Publikums-Fensters, endet auch die Referenten-Ansicht', async () => {
    oeffnenAntwort = { ok: false };
    starteReferentenAnsicht(0);
    await ruhe();
    expect(istReferentenAnsichtAktiv()).toBe(false);
    expect(seite()).toBeNull();
  });
});

describe('Notizen (AK2)', () => {
  it('erscheinen gerendert und in Dokument-Reihenfolge', () => {
    starteReferentenAnsicht(0);
    const [erste, zweite] = notizen();
    expect(erste.querySelectorAll('li')).toHaveLength(2);
    expect(erste.querySelector('strong').textContent).toBe('fett');
    expect(erste.querySelector('a').getAttribute('href')).toBe('https://example.org');
    expect(erste.dataset.herkunft).toBe('prozent');
    expect(zweite.querySelector('em').textContent).toBe('betont');
    expect(zweite.dataset.herkunft).toBe('html');
    expect(teil('praesentation-referent-leer').hidden).toBe(true);
  });

  it('ohne Notizen erscheint ein leiser Hinweis', () => {
    starteReferentenAnsicht(0);
    taste('ArrowRight');
    expect(notizen()).toHaveLength(0);
    expect(teil('praesentation-referent-notizen-inhalt').hidden).toBe(true);
    expect(teil('praesentation-referent-leer').hidden).toBe(false);
  });

  it('Roh-HTML in einer Notiz bleibt Text', () => {
    starteReferentenAnsicht(0);
    taste('End');
    const [notiz] = notizen();
    expect(notiz.querySelector('b')).toBeNull();
    expect(notiz.textContent).toContain('<b>roh</b>');
  });
});

describe('Blättern in beiden Fenstern (AK3)', () => {
  it('Pfeiltaste in der Referenten-Ansicht ändert Index und Aufdeck-Schritt und sendet die Folie', async () => {
    starteReferentenAnsicht(0);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    window.api.sendPresentationSlide.mockClear();
    const ereignis = taste('ArrowRight');
    expect(ereignis.defaultPrevented).toBe(true);
    expect(zaehler()).toBe('2 / 3');
    expect(referentenStand()).toMatchObject({ index: 1, aufdeckSchritt: 0 });
    expect(vorschauText()).toBe('Drei');
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide).toHaveBeenCalledTimes(1);
    expect(window.api.sendPresentationSlide.mock.calls[0][0]).toMatchObject({
      html: '<doc>Zwei</doc>',
      index: 1,
    });
  });

  it('eine Eingabe im Publikums-Fenster zieht die Referenten-Ansicht mit', () => {
    starteReferentenAnsicht(0);
    meldeEingabe({ art: 'taste', key: 'ArrowRight', shiftKey: false });
    expect(referentenStand().index).toBe(1);
    expect(vorschauText()).toBe('Drei');
    meldeEingabe({ art: 'klick' });
    expect(referentenStand().index).toBe(2);
    expect(notizen()).toHaveLength(1);
    meldeEingabe({ art: 'taste', key: 'ArrowLeft', shiftKey: false });
    expect(referentenStand().index).toBe(1);
    expect(zaehler()).toBe('2 / 3');
  });

  it('die Knöpfe der Leiste blättern ebenso', () => {
    starteReferentenAnsicht(0);
    container.querySelector('.praesentation-weiter').click();
    expect(referentenStand().index).toBe(1);
    container.querySelector('.praesentation-zurueck').click();
    expect(referentenStand().index).toBe(0);
    expect(vorschauText()).toBe('Zwei');
  });
});

describe('Zeitgeber (AK4)', () => {
  it('formatiert Dauer und Uhrzeit', () => {
    expect(formatiereDauer(0)).toBe('0:00');
    expect(formatiereDauer(65_000)).toBe('1:05');
    expect(formatiereDauer(3_725_000)).toBe('1:02:05');
    expect(formatiereDauer(-5)).toBe('0:00');
    expect(formatiereUhrzeit(new Date(2026, 9, 15, 10, 15, 30), 'de')).toBe('10:15');
  });

  it('zählt ab dem Start, hält an, setzt fort und setzt zurück', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 10, 15, 0));
    document.documentElement.lang = 'de';
    starteReferentenAnsicht(0);
    const verstrichen = () => teil('praesentation-referent-verstrichen').textContent;
    expect(verstrichen()).toBe('0:00');
    expect(teil('praesentation-referent-uhrzeit').textContent).toBe('10:15');
    await vi.advanceTimersByTimeAsync(65 * ZEIT_TAKT_MS);
    expect(verstrichen()).toBe('1:05');
    expect(teil('praesentation-referent-uhrzeit').textContent).toBe('10:16');

    teil('praesentation-referent-anhalten').click();
    expect(referentenStand().laeuft).toBe(false);
    expect(teil('praesentation-referent-anhalten').getAttribute('aria-pressed')).toBe('true');
    await vi.advanceTimersByTimeAsync(10 * ZEIT_TAKT_MS);
    expect(verstrichen()).toBe('1:05');

    expect(schalteZeitgeber()).toBe(true);
    await vi.advanceTimersByTimeAsync(5 * ZEIT_TAKT_MS);
    expect(verstrichen()).toBe('1:10');

    teil('praesentation-referent-zuruecksetzen').click();
    expect(verstrichen()).toBe('0:00');
    await vi.advanceTimersByTimeAsync(3 * ZEIT_TAKT_MS);
    expect(verstrichen()).toBe('0:03');
    // Zurücksetzen im angehaltenen Zustand lässt ihn angehalten.
    schalteZeitgeber();
    expect(setzeZeitgeberZurueck()).toBe(true);
    await vi.advanceTimersByTimeAsync(4 * ZEIT_TAKT_MS);
    expect(verstrichen()).toBe('0:00');
    document.documentElement.lang = '';
  });

  it('der Takt des Zeitgebers löst kein Senden an das Publikums-Fenster aus', async () => {
    vi.useFakeTimers();
    starteReferentenAnsicht(0);
    await vi.advanceTimersByTimeAsync(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * ZEIT_TAKT_MS);
    expect(window.api.sendPresentationSlide).toHaveBeenCalledTimes(1);
  });

  it('ohne Referenten-Ansicht wirken die Knöpfe nicht', () => {
    expect(schalteZeitgeber()).toBeNull();
    expect(setzeZeitgeberZurueck()).toBe(false);
    expect(referentenStand()).toBeNull();
  });
});

describe('Änderung während des Vortrags (AK5)', () => {
  it('zeichnet beide Fenster neu und behält den Folien-Index', async () => {
    starteReferentenAnsicht(0);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    window.api.sendPresentationSlide.mockClear();
    modell = modellDrei('Zwei neu');
    dokumente[0].content = `${DREI}\n`;
    renderPresentation(0);
    expect(referentenStand().index).toBe(0);
    expect(vorschauText()).toBe('Zwei neu');
    taste('ArrowRight');
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide.mock.calls.at(-1)[0]).toMatchObject({
      html: '<doc>Zwei neu</doc>',
      index: 1,
    });
  });

  it('ist die aktuelle Folie entfallen, springt der Index auf die letzte vorhandene', async () => {
    starteReferentenAnsicht(0);
    taste('End');
    expect(referentenStand().index).toBe(2);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    window.api.sendPresentationSlide.mockClear();
    modell = MODELL_ZWEI;
    dokumente[0].content = '---\npresentation: true\n---\n\n# Eins\n\n---\n\n# Zwei\n';
    renderPresentation(0);
    expect(zaehler()).toBe('2 / 2');
    expect(referentenStand().index).toBe(1);
    expect(teil('praesentation-referent-ende').hidden).toBe(false);
    expect(teil('praesentation-referent-leer').hidden).toBe(false);
    await ruhe(SENDE_VERZOEGERUNG_MS + 20);
    expect(window.api.sendPresentationSlide.mock.calls.at(-1)[0]).toMatchObject({
      html: '<doc>Zwei</doc>',
      index: 1,
      gesamt: 2,
    });
  });
});

describe('Ende und Rückkehr (AK6)', () => {
  // Nach dem Ende: keine Seite, keine Klasse, gewöhnliche Fläche auf der
  // zuletzt gezeigten Folie, Ansichts-Modus unverändert.
  const erwarteRueckkehr = (index) => {
    expect(istReferentenAnsichtAktiv()).toBe(false);
    expect(istFensterVorfuehrungAktiv()).toBe(false);
    expect(seite()).toBeNull();
    expect(flaeche().classList.contains(REFERENT_ZUSTAND)).toBe(false);
    expect(dokumente[0].viewMode).toBe('presentation');
    expect(zaehler()).toBe(`${index + 1} / 3`);
    expect(container.querySelector('.praesentation-vorfuehren')).not.toBeNull();
  };

  it('Esc auf der Fläche des Hauptfensters', () => {
    starteReferentenAnsicht(0);
    taste('ArrowRight');
    const ereignis = taste('Escape', teil('praesentation-referent-notizen-inhalt'));
    expect(ereignis.defaultPrevented).toBe(true);
    erwarteRueckkehr(1);
    expect(window.api.closePresentationWindow).toHaveBeenCalledTimes(1);
  });

  it('Esc im Publikums-Fenster', () => {
    starteReferentenAnsicht(0);
    meldeEingabe({ art: 'beenden' });
    erwarteRueckkehr(0);
    expect(window.api.closePresentationWindow).toHaveBeenCalledTimes(1);
  });

  it('das Kommando «Vorführung beenden»', () => {
    starteReferentenAnsicht(0);
    expect(beendeVorfuehrung()).toBe(true);
    erwarteRueckkehr(0);
  });

  it('das Schließen des Publikums-Fensters, ohne es erneut zu schließen', () => {
    starteReferentenAnsicht(0);
    meldeGeschlossen();
    erwarteRueckkehr(0);
    expect(window.api.closePresentationWindow).not.toHaveBeenCalled();
  });

  it('der Zeitgeber endet mit der Ansicht', () => {
    vi.useFakeTimers();
    starteReferentenAnsicht(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    beendeReferentenAnsicht();
    vi.runOnlyPendingTimers();
    expect(vi.getTimerCount()).toBe(0);
    expect(referentenStand()).toBeNull();
  });

  it('der Wegfall der Präsentation in ihrer Spalte beendet ohne Rückstand', () => {
    starteReferentenAnsicht(0);
    dokumente[0].viewMode = 'rendered';
    expect(pruefeVorfuehrung(0)).toBe(true);
    expect(istReferentenAnsichtAktiv()).toBe(false);
    expect(seite()).toBeNull();
    // Zurück in der Präsentations-Ansicht steht die gewöhnliche Fläche.
    dokumente[0].viewMode = 'presentation';
    renderPresentation(0);
    expect(flaeche().classList.contains(REFERENT_ZUSTAND)).toBe(false);
    expect(seite()).toBeNull();
  });

  it('ein zweiter Start nach dem Ende baut die Ansicht neu auf', () => {
    starteReferentenAnsicht(0);
    beendeReferentenAnsicht();
    expect(starteReferentenAnsicht(0)).toBe(true);
    expect(seite()).not.toBeNull();
    expect(referentenStand().verstrichenMs).toBeLessThan(1000);
  });
});
