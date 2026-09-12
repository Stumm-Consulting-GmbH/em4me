// @vitest-environment jsdom
// 4T-001654 (Epic 3E-000287), Befund 1 des Product Owners vom 2026-09-10 am
// Bau 202609101150: «Im Anzeige-Modus kann man versuchen eine Linie zu ziehen.
// Klicken und Ziehen geht, nur nach dem Loslassen verschwindet sie.»
//
// **Was hier geprüft wird.** Die Fläche ist im nicht änderbaren Dokument nur
// ansehbar: Sie bietet keine Handlung an, die am Ende verworfen würde. Das ist
// eine Aussage über zweierlei, und beides steht in dieser Datei — über das
// **Gezeichnete** (keine Griffe, keine Leiste, kein Menü) und über die
// **Wirkung** (kein Zug, kein Anlegen, kein Löschen, kein Schreiben). Eine der
// beiden Hälften allein trüge nicht: Ein Griff, den nur CSS versteckt, bleibt
// anfassbar, und eine Sperre ohne sichtbares Zeichen wäre für den Anwender ein
// Fehler und keine Aussage.
//
// Geprüft wird an der zusammengesetzten Ansicht (Muster
// canvas-verbindungen.test.js), weil der Gegenstand die Handlung des Nutzers
// ist und die an einem gezeichneten Element beginnt. Der t-Stub liest die
// echte de.json, damit ein fehlender Schlüssel auffällt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasFlaechenTitel, parseCanvasFence } from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;

// Dieselbe Fläche wie in canvas-verbindungen.test.js: k1 auf x -300..-100,
// k2 auf x 100..300, beide y -100..0, dazwischen eine gerichtete Verbindung.
const RUMPF = [
  '!karte k1 x=-300 y=-100 b=200 h=100',
  'Erste',
  '',
  '!karte k2 x=100 y=-100 b=200 h=100',
  'Zweite',
  '',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'ergibt',
].join('\n');

function baueAnsicht({ aenderbar = false } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  const menue = { offen: false, eintraege: [] };
  // Ein Kasten statt eines festen Wertes: Der Modus wechselt zur Laufzeit, und
  // genau dieser Wechsel ist der letzte Prüffall dieser Datei.
  const zustand = { aenderbar };
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown: (text) => `<p>${text}</p>`,
    istAenderbar: () => zustand.aenderbar,
    beiAenderung: (daten) => {
      geschrieben.push(daten);
      return true;
    },
    zeigeKontextmenue: ({ eintraege }) => {
      Object.assign(menue, { offen: true, eintraege });
    },
    schliesseKontextmenue: () => {
      menue.offen = false;
    },
    kontextmenueOffen: () => menue.offen,
  });
  const buehne = container.querySelector('.canvas-buehne');
  // Die Bühne hat in jsdom kein Layout; ein Sichtfenster wird deshalb gestellt.
  buehne.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 400,
    right: 800,
    bottom: 400,
  });
  const model = parseCanvasFence(RUMPF);
  view.setFlaechen([{ model, titel: canvasFlaechenTitel(model), startZeile: 1, rumpf: RUMPF }], {});
  // Ohne Einpassung sind Klick-Punkt und Flächen-Koordinate dieselbe Zahl.
  view.reset();
  return { container, view, buehne, geschrieben, menue, zustand };
}

const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const linieMit = (c, id) => c.querySelector(`.canvas-linie[data-canvas-id="${id}"]`);
const flaeche = (c) => c.querySelector('.canvas-view');

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key) => new window.KeyboardEvent('keydown', { bubbles: true, key });

function klick(ziel, x = 0, y = 0) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: x, clientY: y }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: y }));
}

function ziehe(ziel, von, nach) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: von.x, clientY: von.y }));
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: nach.x, clientY: nach.y }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: nach.x, clientY: nach.y }));
}

describe('Canvas ohne Änderbarkeit: nichts wird angeboten (Befund 1)', () => {
  it('die Fläche sagt es an der Wurzel und in ihrem Zustand', () => {
    const { container, view } = baueAnsicht();
    expect(view.getStats().aenderbar).toBe(false);
    expect(flaeche(container).classList.contains('canvas-nur-ansicht')).toBe(true);
  });

  it('keine Karte trägt einen Größe-Griff', () => {
    // Nicht «unsichtbar», sondern nicht vorhanden: Ein versteckter Griff bliebe
    // anfassbar, und genau das war der gemeldete Fehler.
    const { container } = baueAnsicht();
    expect(container.querySelectorAll('.canvas-karte-griff')).toHaveLength(0);
  });

  it('die gewählte Karte trägt keine Anschluss-Griffe', () => {
    const { container } = baueAnsicht();
    klick(karteMit(container, 'k1'), 10, 10);
    expect(container.querySelectorAll('.canvas-anschluss')).toHaveLength(0);
  });

  it('Auswählen bleibt erlaubt, weil es nichts schreibt', () => {
    const { container, view, geschrieben } = baueAnsicht();
    klick(karteMit(container, 'k1'), 10, 10);
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    expect(geschrieben).toHaveLength(0);
  });

  it('eine Karte lässt sich nicht ziehen: Lage unverändert, nichts geschrieben', () => {
    const { container, geschrieben } = baueAnsicht();
    const karte = karteMit(container, 'k1');
    ziehe(karte, { x: -200, y: -50 }, { x: 0, y: 120 });
    expect(karte.style.left).toBe('-300px');
    expect(karte.style.top).toBe('-100px');
    expect(geschrieben).toHaveLength(0);
  });

  it('ein Doppelklick auf den Hintergrund legt keine Karte an', () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 200 }));
    expect(geschrieben).toHaveLength(0);
    expect(container.querySelectorAll('.canvas-karte')).toHaveLength(2);
  });

  it('ein Doppelklick in eine Karte öffnet keine Rohtext-Eingabe', () => {
    const { container } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: -200, clientY: -50 }));
    expect(container.querySelector('.canvas-karte-eingabe')).toBeNull();
  });

  it('`Entf` löscht die gewählte Karte nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    klick(karteMit(container, 'k1'), 10, 10);
    flaeche(container).dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
    expect(container.querySelectorAll('.canvas-karte')).toHaveLength(2);
  });

  it('der Kommando-Weg legt keine Karte an', () => {
    // Die Reißleine der Ansicht; den gesagten Hinweis dazu prüft
    // canvas-pane.test.js, wo die Statusleiste erreichbar ist.
    const { view, geschrieben } = baueAnsicht();
    expect(view.karteAnlegen({ x: 0, y: 0 })).toBe(false);
    expect(geschrieben).toHaveLength(0);
  });

  it('das Kontextmenü erscheint gar nicht, weder auf Karte noch auf Hintergrund', () => {
    const { container, buehne, menue } = baueAnsicht();
    buehne.dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(menue.offen).toBe(false);
    karteMit(container, 'k1').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(menue.offen).toBe(false);
    linieMit(container, 'e1').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(menue.offen).toBe(false);
  });

  it('die gewählte Verbindung bekommt keine Leiste', () => {
    const { container, view } = baueAnsicht();
    linieMit(container, 'e1').dispatchEvent(maus('mousedown', { button: 0 }));
    // Gewählt ist sie trotzdem — auch das schreibt nichts.
    expect(view.getStats().gewaehlteLinie).toBe('e1');
    expect(container.querySelector('.canvas-linie-leiste')).toBeNull();
  });

  it('ein Doppelklick auf die Verbindung öffnet keine Beschriftungs-Eingabe', () => {
    const { container } = baueAnsicht();
    linieMit(container, 'e1').dispatchEvent(maus('dblclick'));
    expect(container.querySelector('.canvas-linie-eingabe')).toBeNull();
  });

  it('`Entf` löscht die gewählte Verbindung nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    linieMit(container, 'e1').dispatchEvent(maus('mousedown', { button: 0 }));
    flaeche(container).dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
    expect(linieMit(container, 'e1')).not.toBeNull();
  });
});

describe('Canvas mit Änderbarkeit: der Wechsel bringt die Griffe zurück (Befund 1)', () => {
  it('nach dem Umschalten und Neuzeichnen sind Griffe und Leiste wieder da', () => {
    // Der Moduswechsel ändert den Dokument-Text nicht; die Neu-Anzeige stößt
    // deshalb die Ansicht an (views.js, siehe Bauart-Prüffall unten).
    const { container, view, zustand } = baueAnsicht();
    expect(container.querySelectorAll('.canvas-karte-griff')).toHaveLength(0);
    zustand.aenderbar = true;
    view.waehleFlaeche(0);
    view.reset();
    // waehleFlaeche zeichnet nur bei echtem Wechsel neu; hier genügt der Weg
    // über die Neu-Übergabe der Flächen, den auch renderCanvas nimmt.
    const model = parseCanvasFence(RUMPF);
    view.setFlaechen(
      [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, rumpf: RUMPF }],
      {},
    );
    expect(view.getStats().aenderbar).toBe(true);
    expect(flaeche(container).classList.contains('canvas-nur-ansicht')).toBe(false);
    expect(container.querySelectorAll('.canvas-karte-griff')).toHaveLength(2);
    klick(karteMit(container, 'k1'), 10, 10);
    expect(container.querySelectorAll('.canvas-anschluss')).toHaveLength(4);
    linieMit(container, 'e1').dispatchEvent(maus('mousedown', { button: 0 }));
    expect(container.querySelector('.canvas-linie-leiste')).not.toBeNull();
  });

  it('mit Änderbarkeit schreibt der Zug wieder, wie vor dem Befund', () => {
    const { container, geschrieben } = baueAnsicht({ aenderbar: true });
    ziehe(karteMit(container, 'k1'), { x: -200, y: -50 }, { x: -100, y: -50 });
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0].rumpf.split('\n')[0]).toBe('!karte k1 x=-200 y=-100 b=200 h=100');
  });
});

describe('Canvas ohne Änderbarkeit: Herkunft der Antwort (Befund 1)', () => {
  it('die Antwort kommt aus dem Reiter-Zustand UND aus der EditorView', () => {
    // Beides muss stimmen: `tab.editMode` allein sagt nichts über ein
    // schreibgeschütztes Dokument, `view.state.readOnly` allein nichts über den
    // Anzeige-Modus. Genau diese beiden Bedingungen prüft auch der Schreibweg
    // darunter, bevor er dispatcht.
    const quelle = lies('src/renderer/modules/app-init.js');
    expect(quelle).toContain('istAenderbar: (paneIdx) => {');
    expect(quelle).toMatch(/tab\.editMode && !!view && !view\.state\.readOnly/);
  });

  it('der Moduswechsel zeichnet die Fläche neu', () => {
    // Ohne diesen Anstoß bliebe die Fläche auf dem Stand von vorher stehen: Der
    // Wechsel ändert den Dokument-Text nicht, und der Editor-Beobachter hängt
    // an `docChanged`.
    const quelle = lies('src/renderer/modules/views/views.js');
    expect(quelle).toContain("if (tab.viewMode === 'canvas') renderCanvas(state.activePaneIndex);");
  });

  it('ohne den Rückruf bleibt die Fläche änderbar wie vor dem Befund', () => {
    // Die Ausnahme von der Fail-closed-Regel, bewusst so: Der Schreibweg ist
    // über `beiAenderung` eigens gesichert; diese Frage entscheidet allein, ob
    // eine Handlung ANGEBOTEN wird.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const model = parseCanvasFence(RUMPF);
    const view = createCanvasView(container, { t: tStub });
    view.setFlaechen(
      [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, rumpf: RUMPF }],
      {},
    );
    expect(view.getStats().aenderbar).toBe(true);
    expect(container.querySelectorAll('.canvas-karte-griff')).toHaveLength(2);
    view.destroy();
  });

  it('der Hinweis des Kommando-Weges steht in allen fünf Sprachfassungen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const katalog = JSON.parse(lies(`src/i18n/${sprache}.json`));
      expect(
        katalog['canvas.nichtAenderbar'],
        `Schlüssel canvas.nichtAenderbar fehlt in ${sprache}.json`,
      ).toBeTruthy();
    }
  });
});
