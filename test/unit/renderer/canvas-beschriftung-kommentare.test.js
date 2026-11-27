// @vitest-environment jsdom
// 4T-002797 (Epic 3E-000449), Sicherheits-Review Runde 1, Hinweis 3: Die
// Beschriftungen von Form, Gruppe und Verbindung und der Name einer Fläche
// zeigen keinen privaten Kommentar (Story 4S-001259, AK6). Der Karten-Text war
// schon befreit; die Beschriftungen lasen den Rohtext.
//
// Geprüft an beiden Ansichten der Fläche: an der gezeichneten Fläche, der die
// Einbettung den Schalter als `ohneKommentare` hereinreicht (Injektions-
// Bauweise E4), und an der Listen-Ansicht samt Flächen-Name aus dem Kern.
// Gegenprobe: Ohne den Schalter bleiben die Marker gewöhnlicher Text.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  canvasBeschriftung,
  canvasFlaechenTitel,
  canvasListe,
  parseCanvasFence,
} from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';

// Für die Fälle an der Einbettung (canvas-pane.js): ihre beiden echten Importe
// und der Schalt-Zustand der Erweiterungen als Attrappen, Vorbild
// canvas-pane.test.js. Die Zeichen-Module der Fläche laden keinen von ihnen.
vi.mock('../../../src/renderer/i18n.js', () => ({ t: (key) => key }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: { renderMarkdown: (text) => text },
  $: () => null,
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({ showStatusbarHint: () => {} }));
const istAktiv = vi.fn(() => true);
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));
const { canvasZustandAus, destroyCanvas, initCanvasPane, renderCanvas } =
  await import('../../../src/renderer/modules/canvas/canvas-pane.js');

const GEHEIM = 'GEHEIMVERMERK';
const OHNE = { ohneKommentare: true };

const RUMPF = [
  '!karte k1 x=0 y=0 b=200 h=100',
  `%%${GEHEIM}%%`,
  'Start',
  '!karte k2 x=300 y=0 b=200 h=100',
  'Ziel',
  '!form f1 x=0 y=200 b=100 h=100',
  `Prüfen %%${GEHEIM}%%`,
  '!gruppe g1 x=-50 y=-50 b=700 h=400',
  `%%${GEHEIM}%%`,
  'Ablauf',
  '!linie l1 k1 -> k2',
  `weiter %%${GEHEIM}%%`,
].join('\n');

let container = null;

afterEach(() => {
  if (container) container.remove();
  container = null;
});

function element(id) {
  return parseCanvasFence(RUMPF).elemente.find((el) => el.id === id);
}

// Die gezeichnete Fläche; der Karten-Text läuft wie in der Anwendung über das
// hereingereichte `renderMarkdown`, hier ein Doppel, das ihn wörtlich zeigt.
// Geprüft werden deshalb nur die Beschriftungen, nicht die Karten.
function gezeichneteBeschriftungen(ohneKommentare) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const view = createCanvasView(container, {
    t: (key) => key,
    renderMarkdown: () => '<p></p>',
    ...(ohneKommentare === undefined ? {} : { ohneKommentare: () => ohneKommentare }),
  });
  const model = parseCanvasFence(RUMPF);
  view.setFlaechen([{ model, titel: '', startZeile: 1, nummer: 1, rumpf: RUMPF }], {});
  const text = (wahl) => [...container.querySelectorAll(wahl)].map((el) => el.textContent);
  return {
    form: text('.canvas-form[data-canvas-id="f1"]'),
    gruppe: text('.canvas-gruppe[data-canvas-id="g1"]'),
    linie: text('.canvas-linie[data-canvas-id="l1"]'),
  };
}

describe('Canvas-Fläche: Beschriftungen ohne privaten Kommentar (4T-002797)', () => {
  it('die gezeichnete Form, Gruppe und Verbindung zeigen keinen Kommentar', () => {
    const gezeigt = gezeichneteBeschriftungen(true);
    expect(gezeigt.form.join('')).toContain('Prüfen');
    expect(gezeigt.gruppe.join('')).toContain('Ablauf');
    expect(gezeigt.linie.join('')).toContain('weiter');
    expect(JSON.stringify(gezeigt)).not.toContain(GEHEIM);
  });

  it('ohne den Schalter der Einbettung bleiben die Marker gewöhnlicher Text', () => {
    for (const schalter of [false, undefined]) {
      const gezeigt = gezeichneteBeschriftungen(schalter);
      expect(gezeigt.form.join('')).toContain(GEHEIM);
      expect(gezeigt.linie.join('')).toContain(GEHEIM);
      container.remove();
    }
  });

  it('eine Zeile nur mit Kommentar fällt weg, eine schon leere Zeile bleibt', () => {
    expect(canvasBeschriftung(element('g1'), OHNE)).toBe('Ablauf');
    expect(canvasBeschriftung({ inhalt: `oben\n\n%%${GEHEIM}%%\nunten` }, OHNE)).toBe(
      'oben\n\nunten',
    );
    expect(canvasBeschriftung(element('g1'))).toContain(GEHEIM);
  });

  it('Listen-Ansicht und Flächen-Name zeigen keinen Kommentar', () => {
    const model = parseCanvasFence(RUMPF);
    const liste = canvasListe(model, OHNE);
    expect(JSON.stringify(liste)).not.toContain(GEHEIM);
    expect(liste.find((e) => e.id === 'f1').text).toBe('Prüfen');
    expect(liste.find((e) => e.id === 'g1').text).toBe('Ablauf');
    expect(liste.find((e) => e.id === 'k1').verbindungen[0].text).toBe('weiter');
    expect(canvasFlaechenTitel(model, OHNE)).toBe('Start');
    // Gegenprobe ohne die Option.
    expect(canvasListe(model).find((e) => e.id === 'f1').text).toContain(GEHEIM);
    expect(canvasFlaechenTitel(model)).toContain(GEHEIM);
  });
});

// Zweitblick Runde 2, Hinweis Z8: Auch die Kopfzeile einer Verweis- und einer
// Bild-Karte zeigt die eigene Beschriftung; sie liest denselben Schalter. Die
// Kopfzeile wird beim Zeichnen gesetzt und nach dem Laden des Ziels erneut;
// geprüft werden beide Stände samt dem Titel der Kopfzeile.
describe('Canvas-Fläche: Kopfzeile von Verweis- und Bild-Karte (4T-002797, Z8)', () => {
  const KARTEN = [
    '!karte v1 x=0 y=0 b=200 h=100 doc="Ziel.md"',
    `Mein Ziel %%${GEHEIM}%%`,
    '!karte b1 x=300 y=0 b=200 h=100 bild="Anlagen/Skizze.png"',
    `Skizze %%${GEHEIM}%%`,
  ].join('\n');

  function koepfe(ohneKommentare) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const view = createCanvasView(container, {
      t: (key) => key,
      renderMarkdown: () => '<p></p>',
      leseEinbettung: () => Promise.resolve({ ok: false, error: 'not found' }),
      leseBild: () => Promise.resolve({ ok: false, error: 'not found' }),
      ohneKommentare: () => ohneKommentare,
    });
    view.setFlaechen(
      [{ model: parseCanvasFence(KARTEN), titel: '', startZeile: 1, nummer: 1, rumpf: KARTEN }],
      {},
    );
    return () =>
      ['v1', 'b1'].map((id) => {
        const kopf = container.querySelector(
          `.canvas-karte[data-canvas-id="${id}"] .canvas-karte-kopf`,
        );
        return { text: kopf.textContent, titel: kopf.title };
      });
  }

  it('zeigt die Beschriftung ohne Kommentar, auch nach dem Laden des Ziels', async () => {
    const lies = koepfe(true);
    const vorher = lies();
    expect(vorher.map((k) => k.text)).toEqual(['Mein Ziel', 'Skizze']);
    expect(JSON.stringify(vorher)).not.toContain(GEHEIM);
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(JSON.stringify(lies())).not.toContain(GEHEIM);
  });

  it('ohne den Schalter bleiben die Marker gewöhnlicher Text', () => {
    const gezeigt = koepfe(false)();
    expect(gezeigt[0].text).toContain(GEHEIM);
    expect(gezeigt[1].text).toContain(GEHEIM);
  });
});

// 4T-002797 (Epic 3E-000449), Zweitblick Runde 2, Hinweis Z8: Die Einbettung
// reicht den Schalter der Erweiterung «Private Kommentare» an die gezeichnete
// Fläche und an den Namen der Fläche. Gegenprobe: Ausgeschaltet bleiben die
// Marker Text.
describe('Canvas-Einbettung: privater Kommentar (4T-002797, Z8)', () => {
  const RUMPF_EINBETTUNG = [
    '!karte k1 x=0 y=0 b=200 h=100',
    `%%${GEHEIM}%%`,
    'Start',
    '!form f1 x=0 y=200 b=100 h=100',
    `Prüfen %%${GEHEIM}%%`,
  ].join('\n');
  const TEXT = ['# Titel', '', '```perspective-canvas', RUMPF_EINBETTUNG, '```', ''].join('\n');
  const kommentareAus = () => istAktiv.mockImplementation((id) => id !== 'comments');

  afterEach(() => {
    istAktiv.mockImplementation(() => true);
  });

  it('der Name der Fläche zeigt keinen Kommentar', () => {
    expect(canvasZustandAus(TEXT).flaechen[0].titel).toBe('Start');
    kommentareAus();
    expect(canvasZustandAus(TEXT).flaechen[0].titel).toContain(GEHEIM);
  });

  it('die gezeichnete Fläche bekommt den Schalter der Erweiterung', () => {
    const form = (aus) => {
      if (aus) kommentareAus();
      const canvasEl = document.createElement('div');
      document.body.appendChild(canvasEl);
      initCanvasPane({
        getPaneEls: () => ({ canvasEl }),
        aktivesDokument: () => ({ viewMode: 'canvas', content: TEXT, path: 'F.md' }),
        schreibeDokument: () => true,
      });
      renderCanvas(9);
      const text = canvasEl.querySelector('.canvas-form[data-canvas-id="f1"]').textContent;
      destroyCanvas(9);
      canvasEl.remove();
      return text;
    };
    expect(form(false)).toContain('Prüfen');
    expect(form(false)).not.toContain(GEHEIM);
    expect(form(true)).toContain(GEHEIM);
  });
});
