// @vitest-environment jsdom
// 4T-001654 (Epic 3E-000287): Prüffälle der Karten-Bedienung — Auswählen,
// Anlegen, Ziehen, Größe-Ändern, Beschreiben und Löschen, dazu der Rundlauf
// über den Schreibweg.
//
// Geprüft wird an der zusammengesetzten Ansicht (`createCanvasView`) und nicht
// an der Bedienung allein: Der Gegenstand dieses Tasks ist die Handlung des
// Nutzers, und die beginnt an einem gezeichneten Element. Der Schreibweg endet
// hier an einem Rückruf-Doppel — die Einbettung in das Dokument prüft
// canvas-pane.test.js.
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt
// (Muster canvas-view.test.js).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canvasFlaechenTitel,
  parseCanvasFence,
  serializeCanvasFence,
} from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';
import {
  freieKartenKennung,
  entferneKarte,
} from '../../../src/renderer/modules/canvas/canvas-bedienung.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const de = JSON.parse(readFileSync(path.join(wurzel, 'src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const RUMPF = [
  '!karte k1 x=-320 y=-140 b=260 h=120',
  '## Ausgangslage',
  '',
  'Der Import liest heute nur eine Quelle.',
  '',
  '!karte k2 x=40 y=-140 b=260 h=120',
  'Zielbild',
  '',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'ergibt',
  '',
  '!linie e2 k2 -- k1',
].join('\n');

function flaechenAus(rumpfe) {
  return rumpfe.map((r, i) => {
    const model = parseCanvasFence(r);
    return {
      model,
      titel: canvasFlaechenTitel(model),
      startZeile: i * 100 + 1,
      nummer: i + 1,
      rumpf: r,
    };
  });
}

// Die Bühne hat in jsdom kein Layout; ein Sichtfenster wird deshalb gestellt.
// Ohne das läge die Mitte des Ausschnitts immer im Ursprung, und der
// Kommando-Weg wäre vom Doppelklick-Weg nicht zu unterscheiden.
function stelleMasse(buehne, breite, hoehe) {
  buehne.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: breite,
    height: hoehe,
    right: breite,
    bottom: hoehe,
  });
}

function baueAnsicht(rumpf = RUMPF, opts = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  const beiAenderung =
    opts.beiAenderung ||
    ((daten) => {
      geschrieben.push(daten);
      return true;
    });
  // 4T-001654: Die Historie lebt im Editor der Spalte; die Fläche reicht die
  // Taste nur weiter. Hier stehen an ihrer Stelle zwei Zähler.
  const historie = { zurueck: 0, vor: 0 };
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown: (text) => `<p>${text}</p>`,
    beiAenderung,
    rueckgaengig: () => {
      historie.zurueck += 1;
      return true;
    },
    wiederholen: () => {
      historie.vor += 1;
      return true;
    },
  });
  const buehne = container.querySelector('.canvas-buehne');
  stelleMasse(buehne, opts.breite || 800, opts.hoehe || 400);
  view.setFlaechen(flaechenAus([rumpf]), {});
  // Ausgangslage ohne Einpassung: So sind Klick-Punkt und Flächen-Koordinate
  // dieselbe Zahl, und die Erwartungen bleiben lesbar.
  view.reset();
  return { container, view, buehne, geschrieben, historie };
}

const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const eingabe = (c) => c.querySelector('.canvas-karte-eingabe');

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key, opts = {}) =>
  new window.KeyboardEvent('keydown', { bubbles: true, key, ...opts });

// Der zuletzt geschriebene Rumpf, zurückgelesen als Modell.
function modellAus(geschrieben) {
  return parseCanvasFence(geschrieben[geschrieben.length - 1].rumpf);
}
function karteAus(geschrieben, id) {
  return modellAus(geschrieben).elemente.find((el) => el.art === 'karte' && el.id === id);
}

// Zug mit gedrückter Maustaste: von einem Element aus über das Fenster.
function ziehe(ziel, von, nach) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: von.x, clientY: von.y }));
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: nach.x, clientY: nach.y }));
  window.dispatchEvent(new window.MouseEvent('mouseup', {}));
}

describe('Canvas-Bedienung: Auswahl einer Karte (4T-001654)', () => {
  it('ein Klick wählt die Karte, erkennbar in Klasse und Zustand', () => {
    const { container, view, geschrieben } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 100, y: 100 }, { x: 100, y: 100 });
    const karte = karteMit(container, 'k1');
    expect(karte.classList.contains('canvas-karte-gewaehlt')).toBe(true);
    expect(karte.getAttribute('aria-selected')).toBe('true');
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    // Ein Klick ist keine Änderung: Das Dokument bleibt unberührt.
    expect(geschrieben).toHaveLength(0);
  });

  it('genau eine Karte ist gewählt', () => {
    const { container, view } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 10, y: 10 }, { x: 10, y: 10 });
    ziehe(karteMit(container, 'k2'), { x: 10, y: 10 }, { x: 10, y: 10 });
    expect(view.getStats().gewaehlteKarte).toBe('k2');
    expect(container.querySelectorAll('.canvas-karte-gewaehlt')).toHaveLength(1);
  });

  it('ein Klick auf den Hintergrund hebt die Wahl auf', () => {
    const { container, view, buehne } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 10, y: 10 }, { x: 10, y: 10 });
    buehne.dispatchEvent(maus('mousedown', { button: 0, clientX: 5, clientY: 5 }));
    expect(view.getStats().gewaehlteKarte).toBeNull();
    expect(container.querySelectorAll('.canvas-karte-gewaehlt')).toHaveLength(0);
  });

  it('die Wahl überlebt eine Neu-Übergabe der Flächen', () => {
    // Ohne das verlöre jede Live-Aktualisierung die Auswahl — und damit das
    // Ziel von Löschen und Größe-Ändern, mitten in der Bedienung.
    const { container, view } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 10, y: 10 }, { x: 10, y: 10 });
    view.setFlaechen(flaechenAus([RUMPF]), {});
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    expect(karteMit(container, 'k1').getAttribute('aria-selected')).toBe('true');
  });

  it('Escape ohne offene Eingabe hebt die Wahl auf und wird nicht weitergereicht', () => {
    const { container, view } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 10, y: 10 }, { x: 10, y: 10 });
    const ereignis = taste('Escape', { cancelable: true });
    const gestoppt = vi.spyOn(ereignis, 'stopPropagation');
    container.querySelector('.canvas-view').dispatchEvent(ereignis);
    expect(view.getStats().gewaehlteKarte).toBeNull();
    expect(gestoppt).toHaveBeenCalled();
  });
});

describe('Canvas-Bedienung: Karte anlegen (4T-001654, AK1)', () => {
  it('der Doppelklick auf die leere Fläche legt die Karte dort an', () => {
    const { buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(geschrieben).toHaveLength(1);
    // Mittig unter dem Klick-Punkt: Angeklickt wird die Stelle, an der die
    // Karte stehen soll, nicht die Lage ihrer Ecke.
    expect(karteAus(geschrieben, 'k3')).toMatchObject({ x: -120, y: -60, b: 240, h: 120 });
  });

  it('der Rumpf wächst um genau eine Zeile, alles Übrige bleibt wörtlich (G2)', () => {
    const { buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(geschrieben[0].rumpf).toBe(`${RUMPF}\n!karte k3 x=-120 y=-60 b=240 h=120`);
  });

  it('die neue Karte steht am Ende der Element-Liste (G3)', () => {
    const { buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    const ids = modellAus(geschrieben).elemente.map((el) => el.id);
    expect(ids[ids.length - 1]).toBe('k3');
  });

  it('die Kennung ist die erste freie, auch wenn eine Lücke besteht', () => {
    const { buehne, geschrieben } = baueAnsicht(
      '!karte k1 x=0 y=0 b=100 h=50\nA\n\n!karte k3 x=200 y=0 b=100 h=50\nB',
    );
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(karteAus(geschrieben, 'k2')).toBeTruthy();
  });

  it('der Kommando-Weg legt die Karte in der Mitte des sichtbaren Ausschnitts an', () => {
    // Das Kommando kennt keinen Zeiger; sein Ort ist die Mitte dessen, was der
    // Nutzer gerade sieht (Sichtfenster 800x400, Zoom 1, keine Verschiebung).
    const { view, geschrieben } = baueAnsicht();
    expect(view.karteAnlegen()).toBe(true);
    expect(karteAus(geschrieben, 'k3')).toMatchObject({ x: 280, y: 140 });
  });

  it('die neue Karte öffnet sofort ihre Rohtext-Eingabe', () => {
    // Wer eine Karte anlegt, will sie beschreiben; ein zweiter Doppelklick
    // dafür wäre ein Handgriff ohne Aussage.
    const { container, buehne } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(eingabe(container)).not.toBeNull();
    expect(karteMit(container, 'k3').classList.contains('canvas-karte-bearbeitet')).toBe(true);
  });

  it('auf leerer Fläche entsteht die erste Karte (AK1)', () => {
    const { buehne, geschrieben } = baueAnsicht('');
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(geschrieben).toHaveLength(1);
    expect(karteAus(geschrieben, 'k1')).toBeTruthy();
  });
});

describe('Canvas-Bedienung: Verschieben (4T-001654, AK3)', () => {
  it('das Ziehen ändert Lage in ganzen Zahlen und schreibt erst am Loslassen', () => {
    const { container, geschrieben } = baueAnsicht();
    const karte = karteMit(container, 'k1');
    karte.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 60, clientY: 30 }));
    // Mitten im Zug wandert allein das Element — eine Transaktion je Handlung.
    expect(geschrieben).toHaveLength(0);
    expect(karteMit(container, 'k1').style.left).toBe('-260px');
    window.dispatchEvent(new window.MouseEvent('mouseup', {}));
    expect(geschrieben).toHaveLength(1);
    expect(karteAus(geschrieben, 'k1')).toMatchObject({ x: -260, y: -110, b: 260, h: 120 });
  });

  it('unter einer Vergrößerung folgt die Karte dem Zeiger und nicht den Pixeln', () => {
    // Der Zeiger bewegt sich in Bildschirm-Pixeln, die Karte in Flächen-
    // Einheiten; ohne die Teilung durch den Zoom liefe sie dem Zeiger davon.
    const { container, view, buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -240, bubbles: true }));
    const { scale } = view.getStats();
    expect(scale).toBeGreaterThan(1);
    ziehe(karteMit(container, 'k1'), { x: 0, y: 0 }, { x: 100, y: 50 });
    expect(karteAus(geschrieben, 'k1')).toMatchObject({
      x: Math.round(-320 + 100 / scale),
      y: Math.round(-140 + 50 / scale),
    });
  });

  it('unterhalb der Klick-Schwelle wird nur gewählt und nicht geschrieben', () => {
    const { container, view, geschrieben } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 100, y: 100 }, { x: 101, y: 101 });
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    expect(karteMit(container, 'k1').style.left).toBe('-320px');
  });

  it('das Ziehen einer Karte verschiebt die Fläche nicht', () => {
    const { container, view } = baueAnsicht();
    const vorher = view.getStats();
    ziehe(karteMit(container, 'k1'), { x: 0, y: 0 }, { x: 200, y: 200 });
    expect(view.getStats().tx).toBe(vorher.tx);
    expect(view.getStats().ty).toBe(vorher.ty);
  });
});

describe('Canvas-Bedienung: Größe ändern (4T-001654, AK4)', () => {
  it('der Griff ändert Breite und Höhe und schreibt am Loslassen', () => {
    const { container, geschrieben } = baueAnsicht();
    const griff = karteMit(container, 'k1').querySelector('.canvas-karte-griff');
    expect(griff).not.toBeNull();
    ziehe(griff, { x: 0, y: 0 }, { x: 40, y: 20 });
    expect(karteAus(geschrieben, 'k1')).toMatchObject({ x: -320, y: -140, b: 300, h: 140 });
  });

  it('die Untergrenzen der Geometrie greifen', () => {
    // Eine Karte, die auf null gezogen werden könnte, wäre danach nicht mehr
    // anfassbar — dieselbe Begründung wie bei der Zeichnung.
    const { container, geschrieben } = baueAnsicht();
    const griff = karteMit(container, 'k1').querySelector('.canvas-karte-griff');
    ziehe(griff, { x: 0, y: 0 }, { x: -900, y: -900 });
    expect(karteAus(geschrieben, 'k1')).toMatchObject({ b: 40, h: 24 });
  });

  it('der Griff verschiebt die Karte nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    const griff = karteMit(container, 'k1').querySelector('.canvas-karte-griff');
    ziehe(griff, { x: 0, y: 0 }, { x: 40, y: 20 });
    expect(karteAus(geschrieben, 'k1')).toMatchObject({ x: -320, y: -140 });
  });
});

describe('Canvas-Bedienung: Löschen (4T-001654, AK5)', () => {
  it('Entf entfernt die gewählte Karte samt ihrer Verbindungen', () => {
    // Eine Verbindung ohne ihre Karte bliebe als Befund in der Datei stehen.
    const { container, geschrieben } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 10, y: 10 }, { x: 10, y: 10 });
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(1);
    const model = modellAus(geschrieben);
    expect(model.elemente.map((el) => el.id)).toEqual(['k2']);
    expect(model.errors).toEqual([]);
  });

  it('nach dem Löschen ist nichts mehr gewählt', () => {
    const { container, view } = baueAnsicht();
    ziehe(karteMit(container, 'k1'), { x: 10, y: 10 }, { x: 10, y: 10 });
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    expect(view.getStats().gewaehlteKarte).toBeNull();
    expect(view.getStats().karten).toBe(1);
  });

  it('ohne Auswahl bewirkt Entf nichts', () => {
    const { container, geschrieben } = baueAnsicht();
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Bedienung: Text in der Karte (4T-001654, AK2)', () => {
  it('der Doppelklick öffnet den Rohtext, wie ihn der Parser liefert', () => {
    const { container } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(eingabe(container).value).toBe(
      '## Ausgangslage\n\nDer Import liest heute nur eine Quelle.\n',
    );
  });

  it('Escape stellt die Karte wieder her, ohne zu schreiben', () => {
    const { container, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).value = 'Verworfen';
    eingabe(container).dispatchEvent(taste('Escape', { cancelable: true }));
    expect(eingabe(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
    expect(karteMit(container, 'k1').textContent).toContain('Ausgangslage');
  });

  it('der Fokus-Verlust übernimmt den geänderten Text', async () => {
    const { container, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).value = '# Neu\n\nZweite Zeile';
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    // Die Übernahme wartet einen Zyklus (Muster live-table-zelle.js): Ohne den
    // Aufschub käme der blur des Öffnens der Bearbeitung zuvor.
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(geschrieben).toHaveLength(1);
    expect(karteAus(geschrieben, 'k1').inhalt).toBe('# Neu\n\nZweite Zeile');
  });

  it('unveränderter Text löst keinen Schreibvorgang aus', async () => {
    const { container, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(geschrieben).toHaveLength(0);
    expect(eingabe(container)).toBeNull();
  });

  it('Strg+Enter übernimmt, das schlichte Enter bleibt eine neue Zeile', () => {
    const { container, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).value = 'Kurz';
    eingabe(container).dispatchEvent(taste('Enter', { cancelable: true }));
    expect(eingabe(container)).not.toBeNull();
    eingabe(container).dispatchEvent(taste('Enter', { ctrlKey: true, cancelable: true }));
    expect(eingabe(container)).toBeNull();
    expect(karteAus(geschrieben, 'k1').inhalt).toBe('Kurz');
  });

  it('während die Eingabe offen ist, beginnt kein Zug', () => {
    // Sonst ließe sich in der Karte weder die Schreibmarke setzen noch Text
    // markieren, und die Fläche wanderte beim Schreiben davon.
    const { container, view, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    const vorher = view.getStats();
    ziehe(eingabe(container), { x: 0, y: 0 }, { x: 200, y: 200 });
    expect(view.getStats().tx).toBe(vorher.tx);
    expect(geschrieben).toHaveLength(0);
    expect(eingabe(container)).not.toBeNull();
  });

  it('Entf in der Eingabe löscht Text und nicht die Karte', () => {
    const { container, view, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).dispatchEvent(taste('Delete'));
    expect(view.getStats().karten).toBe(2);
    expect(geschrieben).toHaveLength(0);
  });

  it('eine Neu-Übergabe wartet, solange die Eingabe offen ist', () => {
    // Der eigene Schreibvorgang stößt die Neu-Anzeige an; käme sie sofort,
    // zerstörte sie die gerade geöffnete Eingabe der neuen Karte.
    const { container, view, buehne } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(eingabe(container)).not.toBeNull();
    view.setFlaechen(flaechenAus([RUMPF]), {});
    expect(eingabe(container)).not.toBeNull();
    expect(view.getStats().karten).toBe(3);
    // Mit dem Ende der Bearbeitung kommt der wartende Stand.
    eingabe(container).dispatchEvent(taste('Escape', { cancelable: true }));
    expect(view.getStats().karten).toBe(2);
  });
});

describe('Canvas-Bedienung: Rückgängig auf der Fläche (4T-001654, AK7)', () => {
  // **Anlass.** Der Product Owner meldete am 2026-09-10 an der gebauten
  // Programmdatei: «Strg-Z funktioniert nicht». Rückgängig lag ausschließlich
  // im Tastenkürzel-Verzeichnis der EditorView, und die ist in dieser Ansicht
  // versteckt und ohne Fokus — der Tastendruck erreichte sie nie. Die Fläche
  // nimmt ihn seither selbst entgegen und reicht ihn an die Historie weiter.
  const flaeche = (c) => c.querySelector('.canvas-view');

  it('Strg+Z auf der Fläche geht genau einmal an die Historie', () => {
    const { container, historie } = baueAnsicht();
    flaeche(container).dispatchEvent(taste('z', { ctrlKey: true, cancelable: true }));
    expect(historie).toEqual({ zurueck: 1, vor: 0 });
  });

  it('es greift auch ohne gewählte Karte', () => {
    // Rückgängig gilt dem Dokument und nicht einer Karte; die Auswahl-Prüfung
    // der übrigen Tasten darf ihm deshalb nicht vorausgehen.
    const { container, view, historie } = baueAnsicht();
    expect(view.getStats().gewaehlteKarte).toBeNull();
    flaeche(container).dispatchEvent(taste('z', { ctrlKey: true, cancelable: true }));
    expect(historie.zurueck).toBe(1);
  });

  it('Cmd+Z zählt ebenso', () => {
    const { container, historie } = baueAnsicht();
    flaeche(container).dispatchEvent(taste('z', { metaKey: true, cancelable: true }));
    expect(historie.zurueck).toBe(1);
  });

  it('Strg+Y und Strg+Umschalt+Z wiederholen', () => {
    // Beide Formen, weil die eine unter Windows und die andere unter macOS die
    // gewohnte ist; keine der beiden Erwartungen soll ins Leere laufen.
    const { container, historie } = baueAnsicht();
    flaeche(container).dispatchEvent(taste('y', { ctrlKey: true, cancelable: true }));
    flaeche(container).dispatchEvent(
      taste('Z', { ctrlKey: true, shiftKey: true, cancelable: true }),
    );
    expect(historie).toEqual({ zurueck: 0, vor: 2 });
  });

  it('der Tastendruck wird angehalten, damit ihn niemand zweimal auswertet', () => {
    const { container } = baueAnsicht();
    const ereignis = taste('z', { ctrlKey: true, cancelable: true });
    const gestoppt = vi.spyOn(ereignis, 'stopPropagation');
    flaeche(container).dispatchEvent(ereignis);
    expect(gestoppt).toHaveBeenCalled();
    expect(ereignis.defaultPrevented).toBe(true);
  });

  it('in der offenen Rohtext-Eingabe gehört Strg+Z der Eingabe', () => {
    // Sonst nähme ein Rückgängig im Textfeld die ganze vorige Handlung zurück,
    // statt das zuletzt Getippte.
    const { container, historie } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).dispatchEvent(taste('z', { ctrlKey: true, cancelable: true }));
    expect(historie.zurueck).toBe(0);
  });

  it('ein schlichtes z bleibt ein z', () => {
    const { container, historie } = baueAnsicht();
    flaeche(container).dispatchEvent(taste('z', { cancelable: true }));
    expect(historie).toEqual({ zurueck: 0, vor: 0 });
  });

  it('ohne Historie-Zugang bleibt die Taste folgenlos statt zu scheitern', () => {
    // Der Stand der reinen Zeichnungs-Prüffälle: eine Fläche ohne Einbettung.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = createCanvasView(container, { t: tStub });
    view.setFlaechen(flaechenAus([RUMPF]), {});
    expect(() =>
      container.querySelector('.canvas-view').dispatchEvent(taste('z', { ctrlKey: true })),
    ).not.toThrow();
    view.destroy();
  });

  it('nach dem Schließen der Eingabe trägt die Fläche wieder den Fokus', () => {
    // Ohne den Rückgriff läge der Fokus auf dem Dokument-Rumpf, und das
    // nächste Strg+Z ginge wieder ins Leere — genau der gemeldete Befund.
    const { container } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).dispatchEvent(taste('Escape', { cancelable: true }));
    expect(document.activeElement).toBe(flaeche(container));
  });

  it('der Eintritt in die Ansicht holt den Fokus auf die Fläche', () => {
    const { container, view } = baueAnsicht();
    document.body.focus();
    view.fokussiere();
    expect(document.activeElement).toBe(flaeche(container));
  });
});

describe('Canvas-Bedienung: Byte-Gleichheit und Rundlauf (4T-001654, AK6)', () => {
  const FREMD = [
    '!karte k1 x=0 y=0 b=100 h=50 farbe="tiefes blau" rand=3',
    'Erste',
    '',
    '!form f1 ecken=6',
    'Eine Form, die dieses Programm nicht kennt.',
    '',
    '!karte k2 x=200 y=0 b=100 h=50',
    'Zweite',
  ].join('\n');

  it('fremde und unbekannte Angaben an nicht berührten Elementen bleiben wörtlich (G1/G2)', () => {
    const { container, geschrieben } = baueAnsicht(FREMD);
    ziehe(karteMit(container, 'k2'), { x: 0, y: 0 }, { x: 50, y: 0 });
    const zeilen = geschrieben[0].rumpf.split('\n');
    // Alles vor der bewegten Karte steht Zeichen für Zeichen wie zuvor.
    expect(zeilen.slice(0, 6)).toEqual(FREMD.split('\n').slice(0, 6));
    expect(zeilen[6]).toBe('!karte k2 x=250 y=0 b=100 h=50');
  });

  it('eine geänderte Karte behält ihre fremden Angaben in der Reihenfolge', () => {
    const { container, geschrieben } = baueAnsicht(FREMD);
    ziehe(karteMit(container, 'k1'), { x: 0, y: 0 }, { x: 0, y: 60 });
    expect(geschrieben[0].rumpf.split('\n')[0]).toBe(
      '!karte k1 x=0 y=60 b=100 h=50 farbe="tiefes blau" rand=3',
    );
  });

  it('anlegen, verschieben, größer ziehen, beschreiben und löschen ergeben einen stabilen Rumpf', async () => {
    // AK6 als Rundlauf: Was geschrieben wurde, muss sich unverändert wieder
    // lesen und schreiben lassen — sonst verlöre ein Schließen und Öffnen
    // still Inhalt.
    const { container, view, buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).value = '# Dritte\n\nText.';
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    await new Promise((fertig) => setTimeout(fertig, 0));
    ziehe(karteMit(container, 'k3'), { x: 0, y: 0 }, { x: 100, y: 40 });
    ziehe(
      karteMit(container, 'k3').querySelector('.canvas-karte-griff'),
      { x: 0, y: 0 },
      { x: 60, y: 30 },
    );
    ziehe(karteMit(container, 'k2'), { x: 10, y: 10 }, { x: 10, y: 10 });
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));

    const rumpf = geschrieben[geschrieben.length - 1].rumpf;
    expect(serializeCanvasFence(parseCanvasFence(rumpf))).toBe(rumpf);
    const model = parseCanvasFence(rumpf);
    expect(model.errors).toEqual([]);
    // k2 und beide Verbindungen sind fort, k1 wörtlich, k3 mit seinem Stand.
    expect(model.elemente.map((el) => el.id)).toEqual(['k1', 'k3']);
    expect(model.elemente[0].roh.marker).toBe('!karte k1 x=-320 y=-140 b=260 h=120');
    expect(model.elemente[1]).toMatchObject({ x: -20, y: -20, b: 300, h: 150 });
    expect(model.elemente[1].inhalt).toBe('# Dritte\n\nText.');
    expect(view.getStats().karten).toBe(2);
  });

  it('eine Inhalts-Zeile mit führendem Ausrufezeichen überlebt den Rundlauf', async () => {
    // Der Notausgang des Kerns: Ohne ihn würde die Zeile beim nächsten Lesen
    // zu einem Marker und die Karte zerrisse.
    const { container, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).value = '!karte gefaelscht';
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    await new Promise((fertig) => setTimeout(fertig, 0));
    const rumpf = geschrieben[0].rumpf;
    expect(rumpf.split('\n')[1]).toBe('\\!karte gefaelscht');
    expect(karteAus(geschrieben, 'k1').inhalt).toBe('!karte gefaelscht');
  });
});

describe('Canvas-Bedienung: Modell-Werkzeuge ohne DOM (4T-001654)', () => {
  it('die freie Kennung weicht allen belegten aus, nicht nur denen der Karten', () => {
    // Eine Verbindung darf k2 heißen; eine doppelte Kennung wäre ein Befund.
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1\nA\n\n!linie k2 k1 -> k1');
    expect(freieKartenKennung(model)).toBe('k3');
    expect(freieKartenKennung(parseCanvasFence(''))).toBe('k1');
  });

  it('das Entfernen meldet, wenn es nichts zu entfernen gab', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1\nA');
    expect(entferneKarte(model, 'k9')).toBe(false);
    expect(entferneKarte(model, 'k1')).toBe(true);
    expect(model.elemente).toEqual([]);
  });
});
