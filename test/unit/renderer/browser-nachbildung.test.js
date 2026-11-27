// @vitest-environment jsdom
// 4T-002945 (Epic 3E-000452): Prüffälle der Ergänzung der Browser-Nachbildung
// (test/browser-nachbildung.js).
//
// Nachgestellt wird der rote Lauf vom 2026-11-21: Die Editor-Bibliothek fragt
// in ihrem Mess-Schritt Layout-Funktionen an Text-Bereichen ab, die der
// Browser-Nachbildung fehlen. Im Programm und im
// roten Lauf läuft der Mess-Schritt in einem Rückruf des nächsten Bilds; hier
// wird er unmittelbar angestoßen (`view.measure()`), damit der Fall nicht an
// der Zeit hängt.
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ergaenzeTextBereiche } from '../../browser-nachbildung.js';

const FUNKTIONEN = ['getClientRects', 'getBoundingClientRect'];
// In der Unit-Suite hat die gemeinsame Vorbereitung die Funktionen schon
// ergänzt, und der Aufruf ändert nichts. Die Eingaben-Messung des Commit-Tors
// fährt eine Prüfdatei ohne die gemeinsame Vorbereitung
// (test/vitest.messung.config.mjs); dort ergänzt die Prüfdatei selbst. Dass
// die Vorbereitung ergänzt, belegt der Lauf am realen Aufbau in
// test/unit/bild-rueckrufe.test.js.
ergaenzeTextBereiche();
const ansichten = [];
const gemerkt = new Map(FUNKTIONEN.map((name) => [name, Range.prototype[name]]));

function ansicht(doc = 'kurz\n\nzweite Zeile\n') {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc }), parent });
  ansichten.push(view);
  return view;
}

// Stellt die Nachbildung in den Zustand ohne die Vorbereitung: Die Funktionen
// fehlen.
function nimmWeg() {
  for (const name of FUNKTIONEN) delete Range.prototype[name];
}

// Die Editor-Bibliothek fängt Fehler ihres Mess-Schritts teils selbst und
// meldet sie an das Fenster; beide Wege werden eingesammelt.
function fehlerBei(handlung) {
  const fehler = [];
  const hoerer = (ereignis) => {
    fehler.push(String(ereignis.error?.message ?? ereignis.message));
    ereignis.preventDefault();
  };
  window.addEventListener('error', hoerer);
  const konsole = console.error;
  console.error = (...args) => fehler.push(args.map(String).join(' '));
  try {
    handlung();
  } catch (e) {
    fehler.push(String(e?.message ?? e));
  } finally {
    console.error = konsole;
    window.removeEventListener('error', hoerer);
  }
  return fehler;
}

function inDenBlickUndMessen(view) {
  view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
  view.measure();
}

function klickInDenText(view) {
  const zeile = view.contentDOM.querySelector('.cm-line');
  zeile.dispatchEvent(
    new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
  );
}

afterEach(() => {
  for (const view of ansichten.splice(0)) view.destroy();
  for (const [name, funktion] of gemerkt) {
    if (funktion) Range.prototype[name] = funktion;
    else delete Range.prototype[name];
  }
  document.body.replaceChildren();
});

describe('Ergänzung der Browser-Nachbildung: Layout-Funktionen an Text-Bereichen', () => {
  it('Text-Bereiche haben beide Funktionen und antworten wie Elemente der Nachbildung', () => {
    for (const name of FUNKTIONEN) expect(typeof Range.prototype[name]).toBe('function');
    const bereich = document.createRange();
    const element = document.createElement('div');
    // Die Nachbildung liefert für Elemente eine leere Liste und eine
    // Gesamt-Fläche aus Nullen; Text-Bereiche antworten genauso.
    expect(Array.from(bereich.getClientRects())).toEqual(Array.from(element.getClientRects()));
    expect(bereich.getClientRects()).toHaveLength(0);
    const flaeche = element.getBoundingClientRect();
    expect(bereich.getBoundingClientRect()).toMatchObject({
      left: flaeche.left,
      top: flaeche.top,
      width: flaeche.width,
      height: flaeche.height,
    });
    expect(bereich.getBoundingClientRect()).toMatchObject({ width: 0, height: 0 });
  });

  it('ergänzt nur, was fehlt, und nichts ohne Text-Bereiche', () => {
    // Schon vorhanden: nichts wird überschrieben.
    const vorher = Range.prototype.getClientRects;
    expect(ergaenzeTextBereiche()).toEqual([]);
    expect(Range.prototype.getClientRects).toBe(vorher);
    // Fehlen sie, kommen beide dazu.
    nimmWeg();
    expect(ergaenzeTextBereiche()).toEqual(FUNKTIONEN);
    // Eine Umgebung ohne Browser-Nachbildung kennt keine Text-Bereiche.
    expect(ergaenzeTextBereiche({})).toEqual([]);
  });

  it('Nachstellung des roten Laufs: ohne die Funktionen wirft der Mess-Schritt des Editors', () => {
    nimmWeg();
    const view = ansicht();
    const fehler = fehlerBei(() => inDenBlickUndMessen(view));
    expect(fehler.join('\n')).toMatch(/getClientRects is not a function/);
  });

  it('mit den Funktionen läuft der Mess-Schritt ohne Fehler', () => {
    const view = ansicht();
    expect(fehlerBei(() => inDenBlickUndMessen(view))).toEqual([]);
  });

  // Auch der Klick in den Text meldet mit den ergänzten Funktionen keinen
  // Fehler.
  it('Klick in den Text nach einem Mess-Schritt meldet keinen Fehler', () => {
    const view = ansicht();
    inDenBlickUndMessen(view);
    expect(fehlerBei(() => klickInDenText(view))).toEqual([]);
  });
});
