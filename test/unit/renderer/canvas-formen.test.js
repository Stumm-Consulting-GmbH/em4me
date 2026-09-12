// @vitest-environment jsdom
// 4T-001701 (Epic 3E-000288): Prüffälle der geometrischen Formen auf der
// Canvas-Fläche — Zeichnung der sechs Arten, Farben und Tönung, die gemeinsame
// Element-Ebene, Anlegen über beide Wege, Leiste, Beschriftung, Löschen und die
// vier Stapel-Befehle auf Karte **und** Form.
//
// Geprüft wird an der zusammengesetzten Ansicht (`createCanvasView`) und nicht
// an der Bedienung allein: Der Gegenstand ist die Handlung des Nutzers, und die
// beginnt an einem gezeichneten Element. Der Schreibweg endet hier an einem
// Rückruf-Doppel — die Einbettung in das Dokument prüft canvas-pane.test.js.
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt
// (Muster canvas-bedienung.test.js).
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

// Eine Fläche mit allen drei Element-Arten der Stufe 2 in bewusst gemischter
// Reihenfolge: Karte, Form, Karte. Sie ist der Prüfstein der gemeinsamen
// Element-Ebene — läge die Form in einer eigenen Ebene, wäre `s1` entweder
// immer über oder immer unter beiden Karten.
const RUMPF = [
  '!karte k1 x=-300 y=-100 b=200 h=100',
  'Erste',
  '',
  '!form s1 x=-60 y=-80 b=180 h=120 art=oval rand=rot füllung=gelb',
  'Kernpunkt',
  '',
  '!karte k2 x=200 y=-100 b=200 h=100',
  'Zweite',
  '',
  '!linie e1 k1 -> k2',
].join('\n');

function flaechenAus(rumpf) {
  const model = parseCanvasFence(rumpf);
  return [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, nummer: 1, rumpf }];
}

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

function baueAnsicht(rumpf = RUMPF, { aenderbar = true } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  const menue = { offen: false, eintraege: [] };
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
  stelleMasse(buehne, 800, 400);
  view.setFlaechen(flaechenAus([rumpf][0]), {});
  // Ausgangslage ohne Einpassung: So sind Klick-Punkt und Flächen-Koordinate
  // dieselbe Zahl, und die Erwartungen bleiben lesbar.
  view.reset();
  return { container, view, buehne, geschrieben, menue, zustand };
}

const formMit = (c, id) => c.querySelector(`.canvas-form[data-canvas-id="${id}"]`);
// Die Abfolge der Element-Ebene. Gefiltert auf die Elemente selbst: In
// derselben Ebene liegen auch Leiste und Eingabe, und die tragen die Kennung
// ihres Elements — ungefiltert erschiene eine gewählte Form doppelt.
const ebenenFolge = (c) =>
  [...c.querySelector('.canvas-karten').children]
    .filter((el) => el.classList.contains('canvas-karte') || el.classList.contains('canvas-form'))
    .map((el) => el.dataset.canvasId);
const umriss = (c, id) => formMit(c, id).querySelector('.canvas-form-flaeche');
const leiste = (c) => c.querySelector('.canvas-form-leiste');
const eingabe = (c) => c.querySelector('.canvas-form-eingabe');

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key, opts = {}) =>
  new window.KeyboardEvent('keydown', { bubbles: true, key, ...opts });

const letztesModell = (geschrieben) => parseCanvasFence(geschrieben[geschrieben.length - 1].rumpf);
const elementAus = (geschrieben, id) =>
  letztesModell(geschrieben).elemente.find((el) => el.id === id);
const kennungen = (menue) => menue.eintraege.filter((e) => !e.separator).map((e) => e.dataId);
const loese = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).action();
const untermenue = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).submenu;

// Ein Zug mit Maus-Ereignissen; die Schwelle des Klicks liegt bei 3 Pixeln.
function ziehe(start, dx, dy) {
  start.ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: start.x, clientY: start.y }));
  window.dispatchEvent(maus('mousemove', { clientX: start.x + dx, clientY: start.y + dy }));
  window.dispatchEvent(maus('mouseup', { clientX: start.x + dx, clientY: start.y + dy }));
}

describe('Canvas-Formen: Zeichnung der sechs Arten (4T-001701, AK1 von 4S-000930)', () => {
  it('zeichnet die Form als positionierte Hülle mit SVG darin', () => {
    const { container } = baueAnsicht();
    const huelle = formMit(container, 's1');
    expect(huelle).not.toBeNull();
    expect(huelle.style.left).toBe('-60px');
    expect(huelle.style.top).toBe('-80px');
    expect(huelle.style.width).toBe('180px');
    expect(huelle.style.height).toBe('120px');
    const svg = huelle.querySelector('.canvas-form-svg');
    expect(svg.getAttribute('width')).toBe('180');
    expect(svg.getAttribute('height')).toBe('120');
  });

  it('gibt je Art den Knoten der Geometrie', () => {
    const arten = [
      ['rechteck', 'rect'],
      ['abgerundet', 'rect'],
      ['oval', 'ellipse'],
      ['dreieck', 'polygon'],
      ['raute', 'polygon'],
      ['stern', 'polygon'],
    ];
    for (const [art, tag] of arten) {
      const { container } = baueAnsicht(`!form s1 x=0 y=0 b=100 h=80 art=${art}`);
      expect(umriss(container, 's1').tagName.toLowerCase(), `Art ${art}`).toBe(tag);
    }
  });

  it('das abgerundete Rechteck trägt einen Radius, das gewöhnliche nicht', () => {
    // Die Gegenprobe gehört dazu: Ohne sie wäre nicht gemessen, dass sich die
    // beiden Rechteck-Arten überhaupt unterscheiden.
    const rund = baueAnsicht('!form s1 x=0 y=0 b=100 h=80 art=abgerundet');
    expect(umriss(rund.container, 's1').getAttribute('rx')).toBe('14');
    const eckig = baueAnsicht('!form s1 x=0 y=0 b=100 h=80 art=rechteck');
    expect(umriss(eckig.container, 's1').getAttribute('rx')).toBeNull();
  });

  it('eine unbekannte Art wird als Rechteck gezeichnet und bleibt ein Befund', () => {
    const { container, view } = baueAnsicht('!form s1 x=0 y=0 b=100 h=80 art=wolke');
    expect(umriss(container, 's1').tagName.toLowerCase()).toBe('rect');
    expect(view.getStats().befunde).toBe(1);
  });

  it('die Beschriftung steht als einfacher Text in der Form', () => {
    const { container } = baueAnsicht();
    const text = formMit(container, 's1').querySelector('.canvas-form-text');
    // Klartext ohne Markdown-Rendern (F3) — das bleibt der Unterschied zur
    // Karte, die hier ein <p> bekäme.
    expect(text.textContent).toBe('Kernpunkt');
    expect(text.querySelector('p')).toBeNull();
  });

  it('eine Form ohne Beschriftung bekommt kein leeres Textfeld', () => {
    const { container } = baueAnsicht('!form s1 x=0 y=0 b=100 h=80');
    expect(formMit(container, 's1').querySelector('.canvas-form-text')).toBeNull();
  });
});

describe('Canvas-Formen: Farben aus den Theme-Variablen (AK5 von 4S-000930)', () => {
  it('Rand deckend, Füllung getönt — beide über die Variable der Reiter-Gruppe', () => {
    const { container } = baueAnsicht();
    const figur = umriss(container, 's1');
    expect(figur.style.stroke).toBe('var(--tab-group-red)');
    expect(figur.style.fill).toBe('var(--tab-group-yellow)');
    // Die Tönung macht das Stilblatt über die Klasse, nicht die Zeichnung über
    // einen eigenen Farbwert: Sonst stimmte sie in genau einem der beiden
    // Farbschemas.
    expect(figur.getAttribute('class')).toContain('canvas-form-gefuellt');
    expect(figur.style.fillOpacity).toBe('');
  });

  it('ohne Füllung bleibt die Form ungefüllt', () => {
    const { container } = baueAnsicht('!form s1 x=0 y=0 b=100 h=80 rand=blau');
    const figur = umriss(container, 's1');
    expect(figur.getAttribute('class')).toBe('canvas-form-flaeche');
    expect(figur.style.fill).toBe('');
  });

  it('«füllung=keine» ist dieselbe Aussage wie eine fehlende Angabe', () => {
    const { container } = baueAnsicht('!form s1 x=0 y=0 b=100 h=80 füllung=keine');
    expect(umriss(container, 's1').getAttribute('class')).toBe('canvas-form-flaeche');
  });

  it('ein unbekannter Farbname fällt auf die Standardfarbe des Stilblatts zurück', () => {
    const { container, view } = baueAnsicht('!form s1 x=0 y=0 b=100 h=80 rand=magenta');
    expect(umriss(container, 's1').style.stroke).toBe('');
    expect(view.getStats().befunde).toBe(1);
  });

  it('das Stilblatt setzt keinen eigenen Farbwert für die Formen', () => {
    // Dieselbe Zusage wie bei den Verbindungen: Farben kommen ausschliesslich
    // aus Theme-Variablen, sonst stimmt genau ein Farbschema.
    const css = lies('src/renderer/styles/canvas.css');
    const block = css.slice(css.indexOf('.canvas-form {'), css.indexOf('.canvas-hinweis'));
    expect(block).toContain('stroke: var(--border-strong)');
    expect(block).toContain('fill-opacity');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('Canvas-Formen: die gemeinsame Element-Ebene (AK6/AK11 von 4S-000930)', () => {
  it('zeichnet Karten und Formen in EINE Ebene, in der Reihenfolge der Fence', () => {
    const { container } = baueAnsicht();
    expect(ebenenFolge(container)).toEqual(['k1', 's1', 'k2']);
  });

  it('die Reihenfolge im Baum ist die einzige Ordnung — kein z-index im Spiel', () => {
    // Ein zweiter Ordnungs-Träger neben der Reihenfolge könnte auseinander-
    // laufen; genau das vermeidet G3.
    const { container } = baueAnsicht();
    for (const el of container.querySelectorAll('.canvas-karte, .canvas-form')) {
      expect(el.style.zIndex).toBe('');
    }
    expect(lies('src/renderer/styles/canvas.css')).not.toMatch(
      /\.canvas-(form|karte)[^{]*\{[^}]*z-index/,
    );
  });

  it('die Verbindungen bleiben eine eigene Ebene unter den Elementen', () => {
    const { container } = baueAnsicht();
    const kinder = [...container.querySelector('.canvas-buehne').children].map((el) =>
      el.getAttribute('class'),
    );
    expect(kinder.indexOf('canvas-svg')).toBeLessThan(kinder.indexOf('canvas-karten'));
    expect(container.querySelectorAll('.canvas-karten .canvas-linie')).toHaveLength(0);
    expect(container.querySelectorAll('.canvas-svg .canvas-linie')).toHaveLength(1);
  });

  it('beide Ebenen tragen dieselbe Verschiebung und Vergrösserung', () => {
    // Die Deckungsgleichheit beim Zoomen ist die Zusage von E4 und darf durch
    // die Element-Ebene nicht verloren gehen.
    const { container, buehne } = baueAnsicht();
    buehne.dispatchEvent(
      new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200 }),
    );
    const svg = container.querySelector('.canvas-viewport').getAttribute('transform');
    const ebene = container.querySelector('.canvas-karten').style.transform;
    const zahlen = (s) => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    expect(zahlen(ebene)).toEqual(zahlen(svg));
  });
});

describe('Canvas-Formen: Anlegen über beide Wege (AK2/AK3 von 4S-000930)', () => {
  it('das Kommando legt ein Rechteck in der Mitte des Ausschnitts an', () => {
    const { view, geschrieben } = baueAnsicht();
    expect(view.formAnlegen()).toBe(true);
    const neu = elementAus(geschrieben, 's2');
    // Mitte des 800x400-Ausschnitts, mittig unter dem Punkt (Form 180x120).
    expect(neu).toMatchObject({ art: 'form', x: 310, y: 140, b: 180, h: 120 });
    expect(neu.formArt).toBe('rechteck');
  });

  it('das Kontextmenü bietet die sechs Arten an der Klick-Stelle an', () => {
    const { buehne, menue, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('contextmenu', { button: 2, clientX: 100, clientY: 40 }));
    expect(kennungen(menue)).toContain('canvas-add-shape');
    const arten = untermenue(menue, 'canvas-add-shape');
    expect(arten.map((e) => e.dataId)).toEqual([
      'canvas-add-shape-rechteck',
      'canvas-add-shape-abgerundet',
      'canvas-add-shape-oval',
      'canvas-add-shape-dreieck',
      'canvas-add-shape-raute',
      'canvas-add-shape-stern',
    ]);
    expect(arten[0].label).toBe(de['canvas.formArtRechteck']);
    arten.find((e) => e.dataId === 'canvas-add-shape-stern').action();
    const neu = elementAus(geschrieben, 's2');
    // Mittig unter dem Klick-Punkt, wie bei der Karte.
    expect(neu).toMatchObject({ x: 10, y: -20, formArt: 'stern' });
    expect(neu.attrs.art).toBe('stern');
  });

  it('eine neue Form entsteht ganz vorn und ist gewählt', () => {
    const { view, geschrieben } = baueAnsicht();
    view.formAnlegen();
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual([
      'k1',
      's1',
      'k2',
      'e1',
      's2',
    ]);
    expect(view.getStats().gewaehlteForm).toBe('s2');
  });

  it('die Vorgabe-Art wird nicht ausgeschrieben, eine gewählte schon', () => {
    // Die Abwesenheit IST die Vorgabe (G5); ein ausgeschriebenes
    // «art=rechteck» widerspräche später einer geänderten Vorgabe.
    const { view, geschrieben } = baueAnsicht();
    view.formAnlegen();
    expect(geschrieben[0].rumpf).toContain('!form s2 x=310 y=140 b=180 h=120');
    expect(geschrieben[0].rumpf).not.toContain('art=rechteck');
    // Gegenprobe: Eine ausdrücklich gewählte Art steht in der Zeile. Ohne sie
    // wäre nicht gemessen, dass die Angabe überhaupt je geschrieben wird.
    const mitArt = baueAnsicht();
    mitArt.view.formAnlegen({ formArt: 'raute' });
    expect(mitArt.geschrieben[0].rumpf).toContain('art=raute');
  });
});

describe('Canvas-Formen: Auswahl, Zug und Löschen (AK7 bis AK9 von 4S-000930)', () => {
  it('ein Klick auf den Umriss wählt die Form und hebt jede andere Wahl auf', () => {
    const { container, view } = baueAnsicht();
    container
      .querySelector('.canvas-karte[data-canvas-id="k1"]')
      .dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(view.getStats()).toMatchObject({
      gewaehlteForm: 's1',
      gewaehlteKarte: null,
      gewaehlteLinie: null,
    });
    expect(formMit(container, 's1').getAttribute('aria-selected')).toBe('true');
  });

  it('die Wahl einer Karte hebt die Wahl der Form wieder auf', () => {
    const { container, view } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    container
      .querySelector('.canvas-karte[data-canvas-id="k1"]')
      .dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(view.getStats()).toMatchObject({ gewaehlteKarte: 'k1', gewaehlteForm: null });
  });

  it('ein Klick auf den Hintergrund hebt die Wahl der Form auf', () => {
    const { container, buehne, view } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    buehne.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(view.getStats().gewaehlteForm).toBeNull();
    expect(leiste(container)).toBeNull();
  });

  it('das Ziehen verschiebt die Form und schreibt die neue Lage', () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe({ ziel: umriss(container, 's1'), x: 0, y: 0 }, 40, 25);
    expect(elementAus(geschrieben, 's1')).toMatchObject({ x: -20, y: -55 });
  });

  it('ein Klick unter der Schwelle schreibt nichts', () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe({ ziel: umriss(container, 's1'), x: 0, y: 0 }, 1, 1);
    expect(geschrieben).toHaveLength(0);
  });

  it('der Griff ändert die Größe und schreibt sie', () => {
    const { container, geschrieben } = baueAnsicht();
    const griff = formMit(container, 's1').querySelector('.canvas-form-griff');
    ziehe({ ziel: griff, x: 0, y: 0 }, 20, 30);
    expect(elementAus(geschrieben, 's1')).toMatchObject({ b: 200, h: 150 });
  });

  it('Entf löscht die gewählte Form, die übrigen Elemente bleiben', () => {
    const { container, view, geschrieben } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual(['k1', 'k2', 'e1']);
    expect(view.getStats().gewaehlteForm).toBeNull();
  });

  it('Escape hebt allein die Auswahl auf und schreibt nichts', () => {
    const { container, view, geschrieben } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    container.querySelector('.canvas-view').dispatchEvent(taste('Escape'));
    expect(view.getStats().gewaehlteForm).toBeNull();
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Formen: Leiste an der gewählten Form (AK4/AK5 von 4S-000930)', () => {
  function waehle(container) {
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
  }

  it('erscheint erst mit der Auswahl, über der Oberkante der Form', () => {
    const { container } = baueAnsicht();
    expect(leiste(container)).toBeNull();
    waehle(container);
    const l = leiste(container);
    expect(l).not.toBeNull();
    expect(l.style.left).toBe('30px');
    expect(l.style.top).toBe('-86px');
  });

  it('führt die sechs Arten und zeigt die jetzige', () => {
    const { container } = baueAnsicht();
    waehle(container);
    const feld = leiste(container).querySelector('.canvas-form-art');
    expect([...feld.options].map((o) => o.value)).toEqual([
      'rechteck',
      'abgerundet',
      'oval',
      'dreieck',
      'raute',
      'stern',
    ]);
    expect(feld.value).toBe('oval');
  });

  it('eine gewählte Art wird geschrieben und sofort gezeichnet', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container);
    const feld = leiste(container).querySelector('.canvas-form-art');
    feld.value = 'raute';
    feld.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(elementAus(geschrieben, 's1').formArt).toBe('raute');
    expect(umriss(container, 's1').tagName.toLowerCase()).toBe('polygon');
  });

  it('führt acht Randfarben und acht Füllfarben plus «keine»', () => {
    const { container } = baueAnsicht();
    waehle(container);
    const reihen = leiste(container).querySelectorAll('.canvas-form-farben');
    expect(reihen).toHaveLength(2);
    expect(reihen[0].dataset.angabe).toBe('rand');
    expect(reihen[0].querySelectorAll('.canvas-form-farbe')).toHaveLength(8);
    expect(reihen[1].dataset.angabe).toBe('fuellung');
    expect(reihen[1].querySelectorAll('.canvas-form-farbe')).toHaveLength(9);
    expect(reihen[1].querySelector('.canvas-form-farbe-keine')).not.toBeNull();
  });

  it('markiert die gesetzten Farben', () => {
    // Ohne Markierung wäre an einer Leiste mit zwei Reihen nicht ablesbar, was
    // die Form gerade trägt.
    const { container } = baueAnsicht();
    waehle(container);
    const aktiv = [...leiste(container).querySelectorAll('.canvas-form-farbe-aktiv')].map(
      (el) => `${el.dataset.angabe}:${el.dataset.farbe}`,
    );
    expect(aktiv).toEqual(['rand:rot', 'fuellung:gelb']);
  });

  it('ein Klick auf eine Randfarbe schreibt sie, ohne die Füllung anzufassen', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container);
    leiste(container)
      .querySelector('.canvas-form-farbe[data-angabe="rand"][data-farbe="lila"]')
      .dispatchEvent(maus('click', { button: 0 }));
    const el = elementAus(geschrieben, 's1');
    expect(el.attrs.rand).toBe('lila');
    expect(el.attrs['füllung']).toBe('gelb');
  });

  it('«keine Füllung» streicht die Angabe, statt einen Wert zu erfinden', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container);
    leiste(container)
      .querySelector('.canvas-form-farbe-keine')
      .dispatchEvent(maus('click', { button: 0 }));
    expect(geschrieben[0].rumpf).not.toContain('füllung=');
    expect(elementAus(geschrieben, 's1').fuellung).toBeUndefined();
  });

  it('die Beschriftungen der Leiste stehen im Katalog', () => {
    const { container } = baueAnsicht();
    waehle(container);
    const l = leiste(container);
    expect(l.querySelector('.canvas-form-art').title).toBe(de['canvas.formArt']);
    expect(l.querySelector('.canvas-form-knopf').title).toBe(de['canvas.formBeschriftung']);
    expect(l.querySelector('.canvas-form-farbe[data-angabe="rand"][data-farbe="blau"]').title).toBe(
      de['canvas.formRandFarbe'].replace('{farbe}', de['tabGroup.color.blue']),
    );
    expect(l.querySelector('.canvas-form-farbe-keine').title).toBe(de['canvas.formKeineFuellung']);
  });
});

describe('Canvas-Formen: Beschriftung als Rohtext (AK6 von 4S-000930)', () => {
  it('der Doppelklick öffnet den Rohtext über der Form', () => {
    const { container } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('dblclick'));
    const feld = eingabe(container);
    expect(feld).not.toBeNull();
    expect(feld.value).toBe('Kernpunkt\n');
    expect(feld.style.width).toBe('180px');
    // Während geschrieben wird, tritt die Leiste zurück — sie säße sonst auf
    // der Eingabe.
    expect(leiste(container)).toBeNull();
  });

  it('der Klick daneben übernimmt', async () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = 'Zwei\nZeilen';
    buehne.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(elementAus(geschrieben, 's1').inhalt).toBe('Zwei\nZeilen');
    expect(formMit(container, 's1').querySelector('.canvas-form-text').textContent).toBe(
      'Zwei\nZeilen',
    );
  });

  it('Escape verwirft und lässt das Dokument unberührt', () => {
    const { container, geschrieben } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = 'weg damit';
    eingabe(container).dispatchEvent(taste('Escape'));
    expect(eingabe(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
  });

  it('eine geleerte Beschriftung verschwindet auch aus dem Bild', async () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = '';
    buehne.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(elementAus(geschrieben, 's1').inhalt).toBe('');
    expect(formMit(container, 's1').querySelector('.canvas-form-text')).toBeNull();
  });

  it('Sonderzeichen und ein vorangestellter Marker überstehen den Rundlauf', async () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = '!karte «gefälscht» — 50 %';
    buehne.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(geschrieben[0].rumpf).toContain('\\!karte «gefälscht» — 50 %');
    expect(elementAus(geschrieben, 's1').inhalt).toBe('!karte «gefälscht» — 50 %');
  });
});

describe('Canvas-Formen: das Kontextmenü der Form (B6)', () => {
  function rechtsklick(container) {
    umriss(container, 's1').dispatchEvent(
      maus('contextmenu', { button: 2, clientX: 0, clientY: 0 }),
    );
  }

  it('wählt die Form und führt ihre Handlungen samt Stapel-Block', () => {
    const { container, view, menue } = baueAnsicht();
    rechtsklick(container);
    expect(view.getStats().gewaehlteForm).toBe('s1');
    expect(kennungen(menue)).toEqual([
      'canvas-shape-kind',
      'canvas-shape-stroke',
      'canvas-shape-fill',
      'canvas-shape-label',
      'canvas-shape-delete',
      'canvas-stack-ganzNachVorn',
      'canvas-stack-eineStufeVor',
      'canvas-stack-eineStufeZurueck',
      'canvas-stack-ganzNachHinten',
    ]);
  });

  it('die Untermenüs bieten sechs Arten, acht Randfarben und neun Füllungen', () => {
    const { container, menue } = baueAnsicht();
    rechtsklick(container);
    expect(untermenue(menue, 'canvas-shape-kind')).toHaveLength(6);
    expect(untermenue(menue, 'canvas-shape-stroke')).toHaveLength(8);
    expect(untermenue(menue, 'canvas-shape-fill')).toHaveLength(9);
  });

  it('sie rufen dieselbe Wirkung wie die Leiste', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(container);
    untermenue(menue, 'canvas-shape-kind')
      .find((e) => e.dataId === 'canvas-shape-kind-dreieck')
      .action();
    expect(elementAus(geschrieben, 's1').formArt).toBe('dreieck');
    rechtsklick(container);
    untermenue(menue, 'canvas-shape-fill')
      .find((e) => e.dataId === 'canvas-shape-fuellung-keine')
      .action();
    expect(elementAus(geschrieben, 's1').fuellung).toBeUndefined();
  });

  it('«Form löschen» entfernt sie, «Beschriftung» öffnet den Rohtext', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(container);
    loese(menue, 'canvas-shape-label');
    expect(eingabe(container)).not.toBeNull();
    eingabe(container).dispatchEvent(taste('Escape'));
    rechtsklick(container);
    loese(menue, 'canvas-shape-delete');
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual(['k1', 'k2', 'e1']);
  });

  it('die Beschriftungen stehen in allen fünf Sprachfassungen', () => {
    const schluessel = [
      'canvas.formEinfuegen',
      'canvas.formArt',
      'canvas.formArtRechteck',
      'canvas.formArtAbgerundet',
      'canvas.formArtOval',
      'canvas.formArtDreieck',
      'canvas.formArtRaute',
      'canvas.formArtStern',
      'canvas.formRand',
      'canvas.formFuellung',
      'canvas.formRandFarbe',
      'canvas.formFuellFarbe',
      'canvas.formKeineFuellung',
      'canvas.formBeschriftung',
      'canvas.formLoeschen',
      'canvas.keineAuswahl',
      'canvas.nurInAnsicht',
      'canvas.nurLesbar',
      'command.canvas.addShape',
      'command.canvas.stackFront',
      'command.canvas.stackForward',
      'command.canvas.stackBackward',
      'command.canvas.stackBack',
      'menu.view.canvasStack',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of schluessel) {
        expect(texte[key], `${key} fehlt in ${sprache}.json`).toBeTruthy();
      }
    }
  });
});

describe('Canvas-Formen: die vier Stapel-Befehle (Story 4S-000932)', () => {
  function waehle(container, wahl, id) {
    const el =
      wahl === 'form'
        ? umriss(container, id)
        : container.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
    el.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
  }

  it('wirken auf eine Form und schreiben die neue Reihenfolge', () => {
    const { container, view, geschrieben } = baueAnsicht();
    waehle(container, 'form', 's1');
    expect(view.verschiebeImStapel('ganzNachVorn')).toBe(true);
    // Die Verbindung behält ihre Stelle in der Datei; die Stapel-Elemente
    // stehen danach in der Ordnung k1, k2, s1 (4T-001700, Entscheidung 6).
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual([
      'k1',
      'k2',
      's1',
      'e1',
    ]);
    // Und das Bild folgt unmittelbar (AK6 der Story).
    expect(ebenenFolge(container)).toEqual(['k1', 'k2', 's1']);
  });

  it('wirken ebenso auf eine Karte (AK5 der Story)', () => {
    const { container, view, geschrieben } = baueAnsicht();
    waehle(container, 'karte', 'k2');
    expect(view.verschiebeImStapel('ganzNachHinten')).toBe(true);
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual([
      'k2',
      'k1',
      's1',
      'e1',
    ]);
  });

  it('bringen drei überlappende Elemente in jede gewünschte Ordnung (AK7)', () => {
    const { container, view } = baueAnsicht();
    waehle(container, 'form', 's1');
    view.verschiebeImStapel('eineStufeVor');
    expect(view.getStats().stapel).toEqual(['k1', 'k2', 's1']);
    view.verschiebeImStapel('eineStufeZurueck');
    expect(view.getStats().stapel).toEqual(['k1', 's1', 'k2']);
    view.verschiebeImStapel('eineStufeZurueck');
    expect(view.getStats().stapel).toEqual(['s1', 'k1', 'k2']);
    view.verschiebeImStapel('ganzNachVorn');
    expect(view.getStats().stapel).toEqual(['k1', 'k2', 's1']);
  });

  it('lassen die Verbindung unberührt (AK9)', () => {
    const { container, view, geschrieben } = baueAnsicht();
    waehle(container, 'form', 's1');
    view.verschiebeImStapel('ganzNachHinten');
    const model = letztesModell(geschrieben);
    expect(model.elemente.filter((el) => el.art === 'linie').map((el) => el.id)).toEqual(['e1']);
    expect(container.querySelectorAll('.canvas-svg .canvas-linie')).toHaveLength(1);
  });

  it('ohne Auswahl geschieht nichts', () => {
    const { view, geschrieben } = baueAnsicht();
    expect(view.gewaehltesElement()).toBeNull();
    expect(view.verschiebeImStapel('ganzNachVorn')).toBe(false);
    expect(geschrieben).toHaveLength(0);
  });

  it('am Ende des Stapels meldet der Befehl «nichts geändert»', () => {
    // Der Unterschied zu «nichts gewählt» ist die Aussage, an der die
    // Einbettung ihren Hinweis entscheidet.
    const { container, view, geschrieben } = baueAnsicht();
    waehle(container, 'karte', 'k2');
    expect(view.gewaehltesElement()).toBe('k2');
    expect(view.verschiebeImStapel('ganzNachVorn')).toBe(false);
    expect(geschrieben).toHaveLength(0);
  });

  it('die Umordnung lässt den Rohtext der übrigen Elemente unangetastet', () => {
    // G2: Ein normalform-fern geschriebenes Element übersteht das Umordnen
    // byte-gleich, weil es nicht als geändert vermerkt wird.
    const rumpf = [
      '!karte  k1   x=0 y=0   b=200 h=100',
      'Erste',
      '',
      '!form s1 h=80 b=100 y=10 x=10 art=raute',
    ].join('\n');
    const { container, view, geschrieben } = baueAnsicht(rumpf);
    waehle(container, 'form', 's1');
    view.verschiebeImStapel('ganzNachHinten');
    expect(geschrieben[0].rumpf).toContain('!karte  k1   x=0 y=0   b=200 h=100');
    expect(geschrieben[0].rumpf).toContain('!form s1 h=80 b=100 y=10 x=10 art=raute');
  });
});

describe('Canvas-Formen: keine Verbindung an einer Form (AK15 von 4S-000930)', () => {
  it('die gewählte Form bekommt keine Anschluss-Griffe', () => {
    const { container } = baueAnsicht();
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(formMit(container, 's1').querySelector('.canvas-anschluss')).toBeNull();
    expect(container.querySelectorAll('.canvas-anschluss')).toHaveLength(0);
  });

  it('ein Zug vom Anschluss-Griff einer Karte endet nicht an der Form', () => {
    // Die Form liegt auf x -60..120, y -80..40; der Zug endet mitten in ihr.
    const { container, view, geschrieben } = baueAnsicht();
    container
      .querySelector('.canvas-karte[data-canvas-id="k1"]')
      .dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    // Den Zug der Karte beenden, bevor der Zug der Verbindung beginnt: Sonst
    // liefen zwei Handlungen zugleich, und gemessen würde die falsche.
    window.dispatchEvent(maus('mouseup', { clientX: 0, clientY: 0 }));
    const griff = container.querySelector('.canvas-anschluss-rechts');
    griff.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    window.dispatchEvent(maus('mousemove', { clientX: 30, clientY: -30 }));
    window.dispatchEvent(maus('mouseup', { clientX: 30, clientY: -30 }));
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().linien).toBe(1);
  });
});

describe('Canvas-Formen: nur ansehbar im nicht änderbaren Dokument (E3, AK14)', () => {
  it('zeichnet die Form, aber keinen Griff', () => {
    const { container } = baueAnsicht(RUMPF, { aenderbar: false });
    expect(formMit(container, 's1')).not.toBeNull();
    expect(formMit(container, 's1').querySelector('.canvas-form-griff')).toBeNull();
  });

  it('die Auswahl bleibt, die Leiste entsteht nicht', () => {
    // Auswählen schreibt nichts und bleibt deshalb erlaubt (E3).
    const { container, view } = baueAnsicht(RUMPF, { aenderbar: false });
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(view.getStats().gewaehlteForm).toBe('s1');
    expect(leiste(container)).toBeNull();
  });

  it('weder Zug noch Doppelklick noch Entf schreiben etwas', () => {
    const { container, geschrieben } = baueAnsicht(RUMPF, { aenderbar: false });
    ziehe({ ziel: umriss(container, 's1'), x: 0, y: 0 }, 40, 25);
    umriss(container, 's1').dispatchEvent(maus('dblclick'));
    expect(eingabe(container)).toBeNull();
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
    // Und die Lage im Bild ist unverändert.
    expect(formMit(container, 's1').style.left).toBe('-60px');
  });

  it('weder Anlegen noch Umordnen wirken', () => {
    const { container, view, geschrieben } = baueAnsicht(RUMPF, { aenderbar: false });
    expect(view.formAnlegen()).toBe(false);
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(view.verschiebeImStapel('ganzNachVorn')).toBe(false);
    expect(geschrieben).toHaveLength(0);
  });

  it('das Kontextmenü bleibt leer', () => {
    const { container, menue } = baueAnsicht(RUMPF, { aenderbar: false });
    umriss(container, 's1').dispatchEvent(
      maus('contextmenu', { button: 2, clientX: 0, clientY: 0 }),
    );
    expect(menue.offen).toBe(false);
  });

  it('nach dem Moduswechsel kommen Griffe und Leiste zurück', () => {
    const { container, view, zustand } = baueAnsicht(RUMPF, { aenderbar: false });
    zustand.aenderbar = true;
    view.setFlaechen(flaechenAus(RUMPF), {});
    expect(formMit(container, 's1').querySelector('.canvas-form-griff')).not.toBeNull();
    umriss(container, 's1').dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    expect(leiste(container)).not.toBeNull();
  });
});

describe('Canvas-Formen: Bauweise der neuen Module (E4)', () => {
  it('bleiben frei von Renderer-Zustand', () => {
    // Injektions-Bauweise wie die Nachbarn: weder api noch i18n noch
    // app-state — sonst zöge der Canvas-Ordner in den grossen Datei-Zyklus des
    // Renderers, den der Ordner-Import-Wächter als Ratsche eingefroren hat.
    for (const modul of [
      'canvas-formen.js',
      'canvas-formen-leiste.js',
      'canvas-formen-bedienung.js',
    ]) {
      const quelle = lies(`src/renderer/modules/canvas/${modul}`);
      const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(bezuege.length, modul).toBeGreaterThan(0);
      for (const bezug of bezuege) {
        expect(bezug, `unerlaubter Import ${bezug} in ${modul}`).toMatch(
          /^(?:\.\.\/\.\.\/\.\.\/shared\/canvas\/|\.\/canvas-)/,
        );
      }
    }
  });

  it('die Modell-Änderungen laufen über den prozessneutralen Kern', () => {
    // Keine zweite Modell-Logik in der Oberfläche: Anlegen, Entfernen,
    // Umordnen und die Setzer sind Aussagen des Speicherformats (4T-001700).
    const quelle = lies('src/renderer/modules/canvas/canvas-formen-bedienung.js');
    expect(quelle).toContain("from '../../../shared/canvas/canvas-elemente.js'");
    for (const name of ['erzeugeForm', 'fuegeElementEin', 'entferneElement', 'setzeFormArt']) {
      expect(quelle, `${name} wird nicht gerufen`).toContain(name);
    }
    expect(quelle).not.toMatch(/m\.elemente\.(push|splice)/);
  });
});
