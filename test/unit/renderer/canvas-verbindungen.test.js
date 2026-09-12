// @vitest-environment jsdom
// 4T-001655 (Epic 3E-000287): Prüffälle der Verbindungen — Anlegen am
// Anschluss-Griff, Richtung, Umkehren, Farbe und Beschriftung an der gewählten
// Linie, Löschen, das Folgen beim Verschieben und die Verbindung ins Leere.
//
// Geprüft wird an der zusammengesetzten Ansicht (`createCanvasView`) und nicht
// an der Bedienung allein: Gegenstand des Tasks ist die Handlung des Nutzers,
// und die beginnt an einem gezeichneten Element (Muster
// canvas-bedienung.test.js). Der Schreibweg endet an einem Rückruf; die
// Einbettung in das Dokument prüft canvas-pane.test.js.
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt.
import { describe, it, expect } from 'vitest';
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
  erzeugeLinie,
  freieLinienKennung,
  kehreUm,
  setzeLinienFarbe,
} from '../../../src/renderer/modules/canvas/canvas-verbindungen.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;

// Zwei Karten nebeneinander, dazwischen eine gerichtete Verbindung mit
// Beschriftung. k1 liegt auf x -300..-100, k2 auf x 100..300, beide y -100..0.
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

function flaechenAus(rumpf) {
  const model = parseCanvasFence(rumpf);
  return [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, nummer: 1, rumpf }];
}

function baueAnsicht(rumpf = RUMPF) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  const menue = { offen: false, eintraege: [] };
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown: (text) => `<p>${text}</p>`,
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
  view.setFlaechen(flaechenAus(rumpf), {});
  // Ohne Einpassung sind Klick-Punkt und Flächen-Koordinate dieselbe Zahl.
  view.reset();
  return { container, view, buehne, geschrieben, menue };
}

const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const linieMit = (c, id) => c.querySelector(`.canvas-linie[data-canvas-id="${id}"]`);
const pfadVon = (c, id) => linieMit(c, id).querySelector('.canvas-linie-pfad');
const leiste = (c) => c.querySelector('.canvas-linie-leiste');
const eingabe = (c) => c.querySelector('.canvas-linie-eingabe');
const flaeche = (c) => c.querySelector('.canvas-view');

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key, opts = {}) =>
  new window.KeyboardEvent('keydown', { bubbles: true, key, ...opts });

function klick(ziel, x = 0, y = 0) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: x, clientY: y }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: y }));
}

// Zug mit gedrückter Maustaste, von einem Element aus über das Fenster.
function ziehe(ziel, von, nach) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: von.x, clientY: von.y }));
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: nach.x, clientY: nach.y }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: nach.x, clientY: nach.y }));
}

// Karte wählen und den Anschluss-Griff einer Seite holen.
function anschluss(container, kartenId, seite) {
  klick(karteMit(container, kartenId), 10, 10);
  return karteMit(container, kartenId).querySelector(`.canvas-anschluss-${seite}`);
}

function waehleLinie(container, id) {
  linieMit(container, id).dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
}

const letzterRumpf = (geschrieben) => geschrieben[geschrieben.length - 1].rumpf;
const zeilen = (geschrieben) => letzterRumpf(geschrieben).split('\n');
const linieAus = (geschrieben, id) =>
  parseCanvasFence(letzterRumpf(geschrieben)).elemente.find(
    (el) => el.art === 'linie' && el.id === id,
  );

describe('Canvas-Verbindungen: Anlegen am Anschluss-Griff (4T-001655, AK1)', () => {
  it('die gewählte Karte zeigt vier Griffe, die übrigen keinen', () => {
    const { container } = baueAnsicht();
    klick(karteMit(container, 'k1'), 10, 10);
    expect(karteMit(container, 'k1').querySelectorAll('.canvas-anschluss')).toHaveLength(4);
    expect(karteMit(container, 'k2').querySelectorAll('.canvas-anschluss')).toHaveLength(0);
  });

  it('das Ziehen von Karte zu Karte legt die Verbindung an', () => {
    const { container, geschrieben } = baueAnsicht();
    const griff = anschluss(container, 'k1', 'rechts');
    // Losgelassen mitten auf k2 (x 100..300, y -100..0).
    ziehe(griff, { x: -100, y: -50 }, { x: 200, y: -50 });
    expect(geschrieben).toHaveLength(1);
    // Gerichtet, die Seite der Quelle ist die des Griffs, die des Ziels
    // bestimmt die Zeichnung (V2). Kennung ist die erste freie.
    expect(zeilen(geschrieben)[8]).toBe('!linie e2 k1 -> k2 von=rechts nach=auto');
  });

  it('alle übrigen Zeilen bleiben Zeichen für Zeichen stehen (G2)', () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe(anschluss(container, 'k1', 'unten'), { x: -200, y: 0 }, { x: 200, y: -50 });
    expect(zeilen(geschrieben).slice(0, 8)).toEqual(RUMPF.split('\n'));
    expect(zeilen(geschrieben)[8]).toBe('!linie e2 k1 -> k2 von=unten nach=auto');
  });

  it('die Kennung ist die erste freie, auch wenn eine Lücke besteht', () => {
    const { container, geschrieben } = baueAnsicht(
      [
        '!karte k1 x=-300 y=-100 b=200 h=100',
        'A',
        '',
        '!karte k2 x=100 y=-100 b=200 h=100',
        'B',
      ].join('\n'),
    );
    ziehe(anschluss(container, 'k1', 'rechts'), { x: -100, y: -50 }, { x: 200, y: -50 });
    expect(linieAus(geschrieben, 'e1')).toBeTruthy();
  });

  it('während des Zuges hängt eine Vorschau am Zeiger, danach nicht mehr', () => {
    const { container } = baueAnsicht();
    const griff = anschluss(container, 'k1', 'rechts');
    griff.dispatchEvent(maus('mousedown', { button: 0, clientX: -100, clientY: -50 }));
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 0, clientY: 0 }));
    const vorschau = container.querySelector('.canvas-linie-vorschau');
    expect(vorschau).not.toBeNull();
    expect(vorschau.getAttribute('d')).toBe('M -100 -50 L 0 0');
    window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 0, clientY: 0 }));
    expect(container.querySelector('.canvas-linie-vorschau')).toBeNull();
  });

  it('im Leeren losgelassen entsteht nichts', () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe(anschluss(container, 'k1', 'rechts'), { x: -100, y: -50 }, { x: 600, y: 300 });
    expect(geschrieben).toHaveLength(0);
  });

  it('auf der eigenen Karte losgelassen entsteht nichts', () => {
    // Eine Verbindung einer Karte mit sich selbst wäre in dieser Stufe eine
    // Linie ohne Aussage.
    const { container, geschrieben } = baueAnsicht();
    ziehe(anschluss(container, 'k1', 'rechts'), { x: -100, y: -50 }, { x: -200, y: -50 });
    expect(geschrieben).toHaveLength(0);
  });

  it('der Griff verschiebt die Karte nicht und zieht die Fläche nicht', () => {
    const { container, view, geschrieben } = baueAnsicht();
    const vorher = view.getStats();
    ziehe(anschluss(container, 'k1', 'rechts'), { x: -100, y: -50 }, { x: 600, y: 300 });
    expect(karteMit(container, 'k1').style.left).toBe('-300px');
    expect(view.getStats()).toMatchObject({ tx: vorher.tx, ty: vorher.ty });
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Verbindungen: Auswahl und Leiste (4T-001655, AK2)', () => {
  it('ein Klick wählt die Linie, erkennbar in Klasse und Zustand', () => {
    const { container, view } = baueAnsicht();
    waehleLinie(container, 'e1');
    expect(view.getStats().gewaehlteLinie).toBe('e1');
    expect(linieMit(container, 'e1').getAttribute('class')).toContain('canvas-linie-gewaehlt');
    expect(linieMit(container, 'e1').getAttribute('aria-selected')).toBe('true');
  });

  it('Karte und Linie wählen sich gegenseitig ab', () => {
    // Genau ein Element ist gewählt (V3); sonst wüsste `Entf` nicht, was gemeint
    // ist.
    const { container, view } = baueAnsicht();
    klick(karteMit(container, 'k1'), 10, 10);
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    waehleLinie(container, 'e1');
    expect(view.getStats()).toMatchObject({ gewaehlteKarte: null, gewaehlteLinie: 'e1' });
    expect(container.querySelectorAll('.canvas-karte-gewaehlt')).toHaveLength(0);
    klick(karteMit(container, 'k2'), 10, 10);
    expect(view.getStats()).toMatchObject({ gewaehlteKarte: 'k2', gewaehlteLinie: null });
  });

  it('ein Klick auf den Hintergrund hebt auch die Linien-Wahl auf', () => {
    const { container, view, buehne } = baueAnsicht();
    waehleLinie(container, 'e1');
    buehne.dispatchEvent(maus('mousedown', { button: 0, clientX: 600, clientY: 300 }));
    expect(view.getStats().gewaehlteLinie).toBeNull();
    expect(leiste(container)).toBeNull();
  });

  it('Escape hebt die Linien-Wahl auf und wird nicht weitergereicht', () => {
    const { container, view } = baueAnsicht();
    waehleLinie(container, 'e1');
    const ereignis = taste('Escape', { cancelable: true });
    flaeche(container).dispatchEvent(ereignis);
    expect(view.getStats().gewaehlteLinie).toBeNull();
    expect(ereignis.defaultPrevented).toBe(true);
  });

  it('an der gewählten Linie steht die Leiste mit allen Schaltern', () => {
    const { container } = baueAnsicht();
    waehleLinie(container, 'e1');
    const bar = leiste(container);
    expect(bar).not.toBeNull();
    expect([...bar.querySelectorAll('.canvas-linie-knopf')].map((el) => el.dataset.aktion)).toEqual(
      ['richtung', 'umkehren', 'beschriftung'],
    );
    // Acht Farben plus «keine Farbe».
    expect(bar.querySelectorAll('.canvas-linie-farbe')).toHaveLength(9);
  });

  it('die Leiste sitzt am Mittelpunkt des Pfades', () => {
    // Beide Karten liegen auf gleicher Höhe; die Mitte liegt genau zwischen
    // ihren Anschlusspunkten (-100 und 100 bei y -50).
    const { container } = baueAnsicht();
    waehleLinie(container, 'e1');
    expect(leiste(container).style.left).toBe('0px');
    expect(leiste(container).style.top).toBe('-50px');
  });

  it('die Beschriftungen der Leiste kommen aus dem Katalog', () => {
    const { container } = baueAnsicht();
    waehleLinie(container, 'e1');
    const titel = [...leiste(container).querySelectorAll('.canvas-linie-knopf')].map(
      (el) => el.title,
    );
    expect(titel).toEqual([
      de['canvas.linieRichtung'],
      de['canvas.linieUmkehren'],
      de['canvas.linieBeschriftung'],
    ]);
    const blau = leiste(container).querySelector('.canvas-linie-farbe[data-farbe="blau"]');
    expect(blau.title).toBe(de['tabGroup.color.blue']);
    expect(leiste(container).querySelector('.canvas-linie-farbe-keine').title).toBe(
      de['canvas.linieKeineFarbe'],
    );
  });

  it('ohne Auswahl gibt es keine Leiste', () => {
    const { container } = baueAnsicht();
    expect(leiste(container)).toBeNull();
  });
});

describe('Canvas-Verbindungen: Richtung, Umkehren und Farbe (4T-001655, AK2/AK3)', () => {
  function loese(container, aktion) {
    leiste(container)
      .querySelector(`.canvas-linie-knopf[data-aktion="${aktion}"]`)
      .dispatchEvent(maus('click', { cancelable: true }));
  }

  // Befund 2 des Product Owners vom 2026-09-10: Der Umschalter kennt seither
  // drei Zustände statt zwei und läuft im Kreis. Die Prüffälle messen den Kreis
  // als Ganzes — ein einzelner Schritt sagte nicht, ob er wieder herauskommt.
  it('der Umschalter läuft im Kreis: vor, beide, keine, wieder vor', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    loese(container, 'richtung');
    expect(geschrieben).toHaveLength(1);
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 <-> k2 von=rechts nach=links');
    loese(container, 'richtung');
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -- k2 von=rechts nach=links');
    loese(container, 'richtung');
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -> k2 von=rechts nach=links');
    expect(geschrieben).toHaveLength(3);
  });

  it('das Zeichen am Knopf zeigt den jetzigen Zustand, nicht den nächsten', () => {
    const { container } = baueAnsicht();
    waehleLinie(container, 'e1');
    const zeichen = () =>
      leiste(container).querySelector('.canvas-linie-knopf[data-aktion="richtung"]').textContent;
    expect(zeichen()).toBe('→');
    loese(container, 'richtung');
    expect(zeichen()).toBe('↔');
    loese(container, 'richtung');
    expect(zeichen()).toBe('—');
  });

  it('AK3: eine Spitze bei vor, zwei bei beide, keine bei ungerichtet', () => {
    const { container } = baueAnsicht();
    expect(container.querySelectorAll('.canvas-linie-spitze')).toHaveLength(1);
    waehleLinie(container, 'e1');
    loese(container, 'richtung');
    expect(container.querySelectorAll('.canvas-linie-spitze')).toHaveLength(2);
    loese(container, 'richtung');
    expect(container.querySelectorAll('.canvas-linie-spitze')).toHaveLength(0);
  });

  it('Umkehren tauscht die Enden samt ihrer Anschluss-Seiten', () => {
    // Ohne den Tausch der Seiten liefe die Linie danach aus der falschen Kante.
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    loese(container, 'umkehren');
    expect(geschrieben).toHaveLength(1);
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k2 -> k1 von=links nach=rechts');
  });

  it('ein Farb-Punkt setzt die Farbe ans Ende der Angaben', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    leiste(container)
      .querySelector('.canvas-linie-farbe[data-farbe="grün"]')
      .dispatchEvent(maus('click', { cancelable: true }));
    expect(geschrieben).toHaveLength(1);
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -> k2 von=rechts nach=links farbe=grün');
  });

  it('«keine Farbe» streicht die Angabe wieder', () => {
    const { container, geschrieben } = baueAnsicht(
      RUMPF.replace('von=rechts nach=links', 'von=rechts nach=links farbe=rot'),
    );
    waehleLinie(container, 'e1');
    leiste(container)
      .querySelector('.canvas-linie-farbe-keine')
      .dispatchEvent(maus('click', { cancelable: true }));
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -> k2 von=rechts nach=links');
  });

  it('dieselbe Farbe noch einmal schreibt nicht', () => {
    // Eine Übernahme ohne Änderung wäre ein leerer Rückgängig-Schritt.
    const { container, geschrieben } = baueAnsicht(
      RUMPF.replace('von=rechts nach=links', 'von=rechts nach=links farbe=rot'),
    );
    waehleLinie(container, 'e1');
    leiste(container)
      .querySelector('.canvas-linie-farbe[data-farbe="rot"]')
      .dispatchEvent(maus('click', { cancelable: true }));
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Verbindungen: Beschriftung (4T-001655, AK2)', () => {
  function oeffne(container) {
    waehleLinie(container, 'e1');
    leiste(container)
      .querySelector('.canvas-linie-knopf[data-aktion="beschriftung"]')
      .dispatchEvent(maus('click', { cancelable: true }));
  }

  it('die Schaltfläche öffnet den Rohtext der Linie, wie ihn der Parser liefert', () => {
    // Die Beschriftung SIND die Inhalts-Zeilen der Verbindung; einen zweiten
    // Editor dafür gibt es nicht.
    const { container } = baueAnsicht();
    oeffne(container);
    expect(eingabe(container)).not.toBeNull();
    expect(eingabe(container).value).toBe('ergibt');
  });

  it('der Doppelklick auf die Linie öffnet dieselbe Eingabe', () => {
    const { container } = baueAnsicht();
    linieMit(container, 'e1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(eingabe(container)).not.toBeNull();
    expect(eingabe(container).value).toBe('ergibt');
  });

  it('der Fokus-Verlust übernimmt den geänderten Text als Inhalts-Zeilen', async () => {
    const { container, geschrieben } = baueAnsicht();
    oeffne(container);
    eingabe(container).value = 'führt zu\nzwei Zeilen';
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(geschrieben).toHaveLength(1);
    expect(zeilen(geschrieben).slice(6)).toEqual([
      '!linie e1 k1 -> k2 von=rechts nach=links',
      'führt zu',
      'zwei Zeilen',
    ]);
  });

  it('Escape verwirft, ohne zu schreiben', () => {
    const { container, geschrieben } = baueAnsicht();
    oeffne(container);
    eingabe(container).value = 'Verworfen';
    eingabe(container).dispatchEvent(taste('Escape', { cancelable: true }));
    expect(eingabe(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
  });

  it('Strg+Enter übernimmt, das schlichte Enter bleibt eine neue Zeile', () => {
    const { container, geschrieben } = baueAnsicht();
    oeffne(container);
    eingabe(container).value = 'kurz';
    eingabe(container).dispatchEvent(taste('Enter', { cancelable: true }));
    expect(eingabe(container)).not.toBeNull();
    eingabe(container).dispatchEvent(taste('Enter', { ctrlKey: true, cancelable: true }));
    expect(eingabe(container)).toBeNull();
    expect(linieAus(geschrieben, 'e1').inhalt).toBe('kurz');
  });

  it('unveränderter Text löst keinen Schreibvorgang aus', async () => {
    const { container, geschrieben } = baueAnsicht();
    oeffne(container);
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(geschrieben).toHaveLength(0);
    expect(eingabe(container)).toBeNull();
  });

  it('Entf in der Eingabe löscht Text und nicht die Verbindung', () => {
    const { container, view, geschrieben } = baueAnsicht();
    oeffne(container);
    eingabe(container).dispatchEvent(taste('Delete'));
    expect(view.getStats().linien).toBe(1);
    expect(geschrieben).toHaveLength(0);
  });

  it('die Beschriftung wird als Text am Mittelpunkt gezeichnet', () => {
    const { container } = baueAnsicht();
    const text = linieMit(container, 'e1').querySelector('.canvas-linie-text');
    expect(text).not.toBeNull();
    expect(text.textContent).toBe('ergibt');
    expect(text.getAttribute('x')).toBe('0');
    // Ein Grund-Rechteck darunter, sonst wäre der Text an einer Kreuzung
    // zweier Linien unlesbar.
    expect(linieMit(container, 'e1').querySelector('.canvas-linie-grund')).not.toBeNull();
  });

  it('eine Verbindung ohne Text bekommt keine Beschriftung', () => {
    const { container } = baueAnsicht(RUMPF.split('\n').slice(0, 7).join('\n'));
    expect(container.querySelectorAll('.canvas-linie-text')).toHaveLength(0);
  });

  it('eine Neu-Übergabe wartet, solange die Eingabe offen ist', () => {
    const { container, view } = baueAnsicht();
    oeffne(container);
    view.setFlaechen(flaechenAus(`${RUMPF}\n\n!karte k3 x=0 y=200 b=100 h=50\nNeu`), {});
    expect(eingabe(container)).not.toBeNull();
    expect(view.getStats().karten).toBe(2);
    eingabe(container).dispatchEvent(taste('Escape', { cancelable: true }));
    expect(view.getStats().karten).toBe(3);
  });
});

describe('Canvas-Verbindungen: Folgen, Löschen und Befunde (4T-001655)', () => {
  it('AK4: die Linie folgt der Karte schon während des Ziehens, ohne zu schreiben', () => {
    const { container, geschrieben } = baueAnsicht();
    const vorher = pfadVon(container, 'e1').getAttribute('d');
    const karte = karteMit(container, 'k1');
    karte.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 0, clientY: 120 }));
    expect(pfadVon(container, 'e1').getAttribute('d')).not.toBe(vorher);
    // Mitten im Zug wandert allein die Zeichnung — eine Transaktion je Handlung.
    expect(geschrieben).toHaveLength(0);
    window.dispatchEvent(new window.MouseEvent('mouseup', {}));
    expect(geschrieben).toHaveLength(1);
  });

  it('AK5: das Löschen der Karte nimmt die Verbindung samt Beschriftung mit', () => {
    const { container, geschrieben } = baueAnsicht();
    klick(karteMit(container, 'k1'), 10, 10);
    flaeche(container).dispatchEvent(taste('Delete'));
    const model = parseCanvasFence(letzterRumpf(geschrieben));
    expect(model.elemente.map((el) => el.id)).toEqual(['k2']);
    expect(letzterRumpf(geschrieben)).not.toContain('ergibt');
    expect(model.errors).toEqual([]);
  });

  it('AK6: Entf löscht die gewählte Verbindung, die Karten bleiben byte-gleich', () => {
    const { container, view, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    flaeche(container).dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(1);
    expect(letzterRumpf(geschrieben)).toBe(RUMPF.split('\n').slice(0, 6).join('\n'));
    expect(view.getStats()).toMatchObject({ karten: 2, linien: 0, gewaehlteLinie: null });
  });

  it('AK6: ohne Auswahl bewirkt Entf nichts', () => {
    const { container, geschrieben } = baueAnsicht();
    flaeche(container).dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
  });

  it('AK7: eine Verbindung auf eine nicht vorhandene Karte ist ein Befund und wird nicht gezeichnet', () => {
    // Von Hand in die Fence geschrieben: `k9` gibt es nicht. Der Kern meldet
    // sie und behält sie, die Zeichnung lässt sie aus, und der Rundlauf bleibt
    // byte-gleich — sonst verlöre ein Rückgängig seine Grundlage.
    const verfaelscht = `${RUMPF}\n\n!linie e2 k1 -> k9 von=unten nach=auto\nins Leere`;
    const { container, view } = baueAnsicht(verfaelscht);
    const model = parseCanvasFence(verfaelscht);
    expect(model.errors.map((f) => f.code)).toContain('unbekanntesEnde');
    expect(serializeCanvasFence(model)).toBe(verfaelscht);
    expect(view.getStats()).toMatchObject({ linien: 2, befunde: 1 });
    expect(container.querySelectorAll('.canvas-linie')).toHaveLength(1);
    expect(linieMit(container, 'e2')).toBeNull();
  });

  it('der Rundlauf über mehrere Handlungen bleibt stabil', async () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe(anschluss(container, 'k1', 'unten'), { x: -200, y: 0 }, { x: 200, y: -50 });
    waehleLinie(container, 'e2');
    leiste(container)
      .querySelector('.canvas-linie-farbe[data-farbe="lila"]')
      .dispatchEvent(maus('click', { cancelable: true }));
    leiste(container)
      .querySelector('.canvas-linie-knopf[data-aktion="beschriftung"]')
      .dispatchEvent(maus('click', { cancelable: true }));
    eingabe(container).value = 'zweite Spur';
    eingabe(container).dispatchEvent(new window.FocusEvent('blur'));
    await new Promise((fertig) => setTimeout(fertig, 0));
    const rumpf = letzterRumpf(geschrieben);
    expect(serializeCanvasFence(parseCanvasFence(rumpf))).toBe(rumpf);
    expect(parseCanvasFence(rumpf).errors).toEqual([]);
    expect(rumpf.split('\n').slice(8)).toEqual([
      '!linie e2 k1 -> k2 von=unten nach=auto farbe=lila',
      'zweite Spur',
    ]);
  });
});

describe('Canvas-Verbindungen: Farben nur aus dem Theme (4T-001655, AK2)', () => {
  it('eine benannte Farbe wird zur Theme-Variablen der Reiter-Gruppen', () => {
    const { container } = baueAnsicht(
      RUMPF.replace('von=rechts nach=links', 'von=rechts nach=links farbe=türkis'),
    );
    expect(pfadVon(container, 'e1').style.stroke).toBe('var(--tab-group-cyan)');
    expect(linieMit(container, 'e1').querySelector('.canvas-linie-spitze').style.fill).toBe(
      'var(--tab-group-cyan)',
    );
  });

  it('ohne Angabe bleibt die gewohnte Linienfarbe des Stilblatts', () => {
    const { container } = baueAnsicht();
    expect(pfadVon(container, 'e1').style.stroke).toBe('');
    const css = lies('src/renderer/styles/canvas.css');
    const block = /\.canvas-linie-pfad \{([^}]*)\}/.exec(css);
    expect(block, 'Regel .canvas-linie-pfad nicht gefunden').not.toBeNull();
    expect(block[1]).toMatch(/stroke:\s*var\(--border-strong\)/);
  });

  it('ein unbekannter Farb-Name ist ein Befund, kein Verlust', () => {
    // Die Linie bleibt stehen, wird in Standardfarbe gezeichnet, und ihr
    // Rohtext kommt zeichengenau zurück (G1/G2).
    const roh = RUMPF.replace('von=rechts nach=links', 'von=rechts nach=links farbe=neongrün');
    const model = parseCanvasFence(roh);
    expect(model.errors.map((f) => f.code)).toContain('ungueltigeFarbe');
    expect(serializeCanvasFence(model)).toBe(roh);
    const { container, view } = baueAnsicht(roh);
    expect(view.getStats().linien).toBe(1);
    expect(pfadVon(container, 'e1').style.stroke).toBe('');
  });

  it('die neuen Regeln des Stilblatts beziehen ihre Farben aus Theme-Variablen', () => {
    const css = lies('src/renderer/styles/canvas.css');
    for (const regel of [
      '.canvas-linie-grund',
      '.canvas-linie-text',
      '.canvas-linie-vorschau',
      '.canvas-anschluss',
      '.canvas-linie-leiste',
    ]) {
      const block = new RegExp(`\\${regel} \\{([^}]*)\\}`).exec(css);
      expect(block, `Regel ${regel} nicht gefunden`).not.toBeNull();
      expect(block[1], `${regel} ohne Theme-Variable`).toMatch(/var\(--/);
    }
  });
});

describe('Canvas-Verbindungen: Kontextmenü an der Linie (4T-001655, T6)', () => {
  function rechtsklick(container, id) {
    const ziel = linieMit(container, id);
    ziel.dispatchEvent(maus('mousedown', { button: 2, clientX: 0, clientY: 0 }));
    ziel.dispatchEvent(
      maus('contextmenu', { button: 2, clientX: 0, clientY: 0, cancelable: true }),
    );
  }
  const loese = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).action();

  it('zeigt die vier Einträge und wählt die Linie', () => {
    const { container, view, menue } = baueAnsicht();
    rechtsklick(container, 'e1');
    expect(menue.eintraege.map((e) => e.dataId)).toEqual([
      'canvas-line-direction',
      'canvas-line-reverse',
      'canvas-line-label',
      'canvas-line-delete',
    ]);
    expect(view.getStats().gewaehlteLinie).toBe('e1');
  });

  it('die Beschriftungen stehen im Katalog', () => {
    const { container, menue } = baueAnsicht();
    rechtsklick(container, 'e1');
    expect(menue.eintraege.map((e) => e.label)).toEqual([
      de['canvas.linieRichtung'],
      de['canvas.linieUmkehren'],
      de['canvas.linieBeschriftung'],
      de['canvas.linieLoeschen'],
    ]);
  });

  it('«Richtung umschalten» wirkt wie der Schalter der Leiste, samt Kreis', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(container, 'e1');
    loese(menue, 'canvas-line-direction');
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 <-> k2 von=rechts nach=links');
  });

  it('«Richtung umkehren» tauscht die Enden', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(container, 'e1');
    loese(menue, 'canvas-line-reverse');
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k2 -> k1 von=links nach=rechts');
  });

  it('«Beschriftung bearbeiten» öffnet dieselbe Eingabe wie der Doppelklick', () => {
    const { container, menue } = baueAnsicht();
    rechtsklick(container, 'e1');
    loese(menue, 'canvas-line-label');
    expect(eingabe(container).value).toBe('ergibt');
  });

  it('«Verbindung löschen» entfernt nur die Linie', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(container, 'e1');
    loese(menue, 'canvas-line-delete');
    expect(letzterRumpf(geschrieben)).toBe(RUMPF.split('\n').slice(0, 6).join('\n'));
  });

  it('der Rechtsklick startet kein Anlegen und schreibt nichts', () => {
    const { container, geschrieben } = baueAnsicht();
    rechtsklick(container, 'e1');
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 300, clientY: 300 }));
    window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 300, clientY: 300 }));
    expect(container.querySelector('.canvas-linie-vorschau')).toBeNull();
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Verbindungen: Modell-Werkzeuge ohne DOM (4T-001655)', () => {
  it('die freie Kennung weicht allen belegten aus, nicht nur denen der Linien', () => {
    const model = parseCanvasFence('!karte e1 x=0 y=0 b=1 h=1\nA\n\n!linie e2 e1 -> e1');
    expect(freieLinienKennung(model)).toBe('e3');
    expect(freieLinienKennung(parseCanvasFence(''))).toBe('e1');
  });

  it('die neue Linie steht in genau der Form, die der Kern zurückschreibt', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1\n\n!karte k2 x=9 y=0 b=1 h=1');
    model.elemente.push(erzeugeLinie({ id: 'e1', von: 'k1', nach: 'k2', seite: 'oben' }));
    const rumpf = serializeCanvasFence(model);
    expect(rumpf.split('\n').pop()).toBe('!linie e1 k1 -> k2 von=oben nach=auto');
    expect(parseCanvasFence(rumpf).errors).toEqual([]);
  });

  it('das Umkehren einer Linie ohne Seiten-Angaben lässt die Angaben weg', () => {
    const el = parseCanvasFence('!linie e1 a -- b').elemente[0];
    expect(kehreUm(el)).toBe(true);
    expect(el).toMatchObject({ von: 'b', nach: 'a', gerichtet: false });
    expect(el.attrFolge).toEqual([]);
  });

  it('eine unbekannte Farbe wird nicht gesetzt und die vorhandene nicht angetastet', () => {
    const el = parseCanvasFence('!linie e1 a -> b farbe=blau').elemente[0];
    expect(setzeLinienFarbe(el, 'neongrün')).toBe(true);
    // Kein Name aus dem Satz heißt: keine Farbe. Eine erfundene Angabe stünde
    // sonst im Dokument und wäre beim nächsten Lesen ein Befund.
    expect(el.attrs.farbe).toBeUndefined();
    expect(el.attrFolge).toEqual([]);
  });
});

describe('Canvas-Verbindungen: Bauweise (4T-001655)', () => {
  it('beide neuen Module bleiben frei von Renderer-Zustand', () => {
    // Injektions-Bauweise E4: weder api noch i18n noch app-state — nur der
    // prozessneutrale Kern, die Geometrie und die Nachbarn im Canvas-Ordner.
    for (const rel of [
      'src/renderer/modules/canvas/canvas-linien.js',
      'src/renderer/modules/canvas/canvas-verbindungen.js',
    ]) {
      const bezuege = [...lies(rel).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(bezuege.length).toBeGreaterThan(0);
      for (const bezug of bezuege) {
        expect(bezug, `unerlaubter Import ${bezug} in ${rel}`).toMatch(
          /^(?:\.\.\/\.\.\/\.\.\/shared\/canvas\/|\.\/canvas-)/,
        );
      }
    }
  });

  it('der Farb-Satz steht im Kern und wird nicht zweimal gehalten', () => {
    // Ansicht und Bedienung lesen denselben Satz; eine zweite Liste im
    // Renderer liefe beim nächsten Namen auseinander.
    const kern = lies('src/shared/canvas/canvas-core.js');
    expect(kern).toContain('const LINIEN_FARBEN');
    for (const modul of ['canvas-linien.js', 'canvas-verbindungen.js']) {
      const quelle = lies(`src/renderer/modules/canvas/${modul}`);
      expect(quelle).toMatch(/LINIEN_FARB/);
      expect(quelle).not.toMatch(/blau:|türkis:/);
    }
  });

  it('die Zeichnung setzt keinen Farbwert', () => {
    const farbmuster = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:red|blue|green|black|white)\b/;
    const funde = lies('src/renderer/modules/canvas/canvas-linien.js')
      .split('\n')
      .filter((z) => farbmuster.test(z))
      .filter((z) => !z.trimStart().startsWith('//') && !z.trimStart().startsWith('*'));
    expect(funde, `Farbwerte in canvas-linien.js:\n${funde.join('\n')}`).toEqual([]);
  });

  it('die Texte der Verbindungen stehen in allen fünf Sprachfassungen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const katalog = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of [
        'canvas.linieRichtung',
        'canvas.linieUmkehren',
        'canvas.linieBeschriftung',
        'canvas.linieLoeschen',
        'canvas.linieKeineFarbe',
        // Befund 3 vom 2026-09-10: Beschriftung und Werte der beiden
        // Auswahlfelder. Nachgesehen am selben Tag: Für die vier Seiten gab es
        // keinen wiederverwendbaren Bestands-Schlüssel.
        'canvas.linieVonSeite',
        'canvas.linieNachSeite',
        'canvas.seiteAuto',
        'canvas.seiteLinks',
        'canvas.seiteRechts',
        'canvas.seiteOben',
        'canvas.seiteUnten',
      ]) {
        expect(katalog[key], `Schlüssel ${key} fehlt in ${sprache}.json`).toBeTruthy();
      }
    }
  });

  it('geschrieben wird über den Griff der Karten-Bedienung', () => {
    // Ein eigener Schreibweg wäre ein zweiter Ort für den Abgleich mit dem
    // Dokument-Stand — genau die Stelle, an der zwei Wege auseinanderlaufen.
    const quelle = lies('src/renderer/modules/canvas/canvas-verbindungen.js');
    expect(quelle).toContain('bedienung.schreibe()');
    expect(quelle).not.toContain('serializeCanvasFence');
  });
});

// Befund 3 des Product Owners vom 2026-09-10: «Ich kann angeben, von welcher
// der vier Seiten eines Rechtecks die Linie startet, aber nicht, an welcher der
// vier Seiten des Ziels sie endet.» Zwei Wege, beide gebaut: die Ziel-Zonen
// beim Ziehen und die beiden Auswahlfelder an der Leiste.
describe('Canvas-Verbindungen: Ziel-Seite beim Anlegen (4T-001655, Befund 3)', () => {
  // Ohne Einpassung ist der Klick-Punkt zugleich die Flächen-Koordinate; k2
  // liegt auf x 100..300, y -100..0.
  function beginneZug(container) {
    const griff = anschluss(container, 'k1', 'rechts');
    griff.dispatchEvent(maus('mousedown', { button: 0, clientX: -100, clientY: -50 }));
    return griff;
  }

  const bewege = (x, y) =>
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: y }));
  const lasseLos = (x, y) =>
    window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: y }));

  it('während des Zuges trägt die Karte unter dem Zeiger vier Zonen', () => {
    const { container } = baueAnsicht();
    beginneZug(container);
    bewege(105, -50);
    expect(karteMit(container, 'k2').querySelectorAll('.canvas-zielzone')).toHaveLength(4);
    expect(karteMit(container, 'k1').querySelectorAll('.canvas-zielzone')).toHaveLength(0);
    expect(container.querySelector('.canvas-zielzone-aktiv').dataset.seite).toBe('links');
    lasseLos(105, -50);
  });

  it('auf dem Körper der Karte ist keine Zone hervorgehoben', () => {
    const { container } = baueAnsicht();
    beginneZug(container);
    bewege(200, -50);
    expect(container.querySelectorAll('.canvas-zielzone')).toHaveLength(4);
    expect(container.querySelector('.canvas-zielzone-aktiv')).toBeNull();
    lasseLos(200, -50);
  });

  it('Loslassen auf einer Ziel-Zone schreibt `nach=<seite>`', () => {
    const { container, geschrieben } = baueAnsicht();
    beginneZug(container);
    bewege(105, -50);
    lasseLos(105, -50);
    expect(letzterRumpf(geschrieben)).toContain('!linie e2 k1 -> k2 von=rechts nach=links');
  });

  it('Loslassen am oberen Rand schreibt `nach=oben`', () => {
    const { container, geschrieben } = baueAnsicht();
    beginneZug(container);
    bewege(200, -98);
    lasseLos(200, -98);
    expect(letzterRumpf(geschrieben)).toContain('!linie e2 k1 -> k2 von=rechts nach=oben');
  });

  it('Loslassen auf dem Karten-Körper bleibt bei `nach=auto`', () => {
    const { container, geschrieben } = baueAnsicht();
    beginneZug(container);
    bewege(200, -50);
    lasseLos(200, -50);
    expect(letzterRumpf(geschrieben)).toContain('!linie e2 k1 -> k2 von=rechts nach=auto');
  });

  it('nach dem Loslassen bleibt keine Zone im Baum stehen', () => {
    const { container } = baueAnsicht();
    beginneZug(container);
    bewege(105, -50);
    lasseLos(105, -50);
    expect(container.querySelectorAll('.canvas-zielzone')).toHaveLength(0);
  });

  it('im Leeren losgelassen entsteht weder Linie noch Zonen-Rest', () => {
    const { container, geschrieben } = baueAnsicht();
    beginneZug(container);
    bewege(500, 300);
    lasseLos(500, 300);
    expect(geschrieben).toHaveLength(0);
    expect(container.querySelectorAll('.canvas-zielzone')).toHaveLength(0);
  });
});

describe('Canvas-Verbindungen: Auswahlfelder der Seiten (4T-001655, Befund 3)', () => {
  const feld = (container, angabe) =>
    leiste(container).querySelector(`.canvas-linie-seite[data-angabe="${angabe}"]`);

  function waehleSeite(container, angabe, wert) {
    const el = feld(container, angabe);
    el.value = wert;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  it('die Leiste trägt beide Felder mit den fünf Werten', () => {
    const { container } = baueAnsicht();
    waehleLinie(container, 'e1');
    for (const angabe of ['von', 'nach']) {
      const el = feld(container, angabe);
      expect([...el.options].map((o) => o.value)).toEqual([
        'auto',
        'links',
        'rechts',
        'oben',
        'unten',
      ]);
    }
    expect(feld(container, 'von').value).toBe('rechts');
    expect(feld(container, 'nach').value).toBe('links');
  });

  it('die Ziel-Seite schreibt byte-gleich in die eine Zeile, in einer Transaktion', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    waehleSeite(container, 'nach', 'oben');
    expect(geschrieben).toHaveLength(1);
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -> k2 von=rechts nach=oben');
    // Alles andere bleibt Zeichen für Zeichen stehen (G2).
    expect(zeilen(geschrieben)[0]).toBe('!karte k1 x=-300 y=-100 b=200 h=100');
  });

  it('die Start-Seite ebenso, ohne die Ziel-Seite anzufassen', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    waehleSeite(container, 'von', 'unten');
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -> k2 von=unten nach=links');
  });

  it('`automatisch` wird ausdrücklich geschrieben und nicht gestrichen', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    waehleSeite(container, 'nach', 'auto');
    expect(zeilen(geschrieben)[6]).toBe('!linie e1 k1 -> k2 von=rechts nach=auto');
  });

  it('derselbe Wert noch einmal gewählt schreibt nicht', () => {
    // Eine Übernahme ohne Änderung wäre ein leerer Rückgängig-Schritt.
    const { container, geschrieben } = baueAnsicht();
    waehleLinie(container, 'e1');
    waehleSeite(container, 'nach', 'links');
    expect(geschrieben).toHaveLength(0);
  });

  it('ein unbekannter Wert bleibt Befund und wird nicht still geschrieben', () => {
    const roh = RUMPF.replace('nach=links', 'nach=schräg');
    const { container, geschrieben, view } = baueAnsicht(roh);
    expect(view.getStats().befunde).toBeGreaterThan(0);
    waehleLinie(container, 'e1');
    // Das Feld zeigt `auto`, weil es den Wert nicht kennt — die Zeile im
    // Dokument bleibt davon unberührt, solange niemand wählt.
    expect(feld(container, 'nach').value).toBe('auto');
    expect(geschrieben).toHaveLength(0);
  });
});
