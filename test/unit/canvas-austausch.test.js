// 4T-001804 (Epic 3E-000292): Unit-Tests des Übersetzungs-Kerns zwischen der
// eigenen Fläche und dem offenen Format JSON Canvas (Stories 4S-000959 und
// 4S-000960, AK1 bis AK10).
//
// **Der Schnitt der Fälle folgt den beiden Übersetzungs-Tafeln** der
// Entscheidung F1 des Product Owners vom 2026-09-19: Jede Zeile beider Tafeln
// ist mindestens ein Fall, dazu die technischen Festlegungen des Epics zu
// Kennungen, Lage, Reihenfolge, Verbindungs-Form und Farben.
//
// **Das Paar aus Beispiel-Fläche und Beispiel-Datei** steht im Epic und ist
// dort als verbindlicher Fall benannt; es wird hier **zeichengenau** geprüft,
// einschließlich der Tabulator-Einrückung. Eine Abweichung ist damit kein
// Geschmacks-, sondern ein Regel-Verstoß.
//
// Der Renderer kommt nicht vor, und keine Datei wird geöffnet — genau das ist
// die Eigenschaft, die den Kern vom Export- und vom Import-Weg trennt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  VERLUST_POSTEN,
  AUSTAUSCH_FEHLER,
  flaecheNachJsonCanvas,
  jsonCanvasNachFlaeche,
  serialisiereJsonCanvas,
} from '../../src/shared/canvas/canvas-austausch.js';
import { parseCanvasFence } from '../../src/shared/canvas/canvas-core.js';
import { TAB_GROUP_COLOR_VALUES } from '../../src/shared/tab-group-colors.js';

// Der feste Zeilenumbruch, wie ihn das Einlesen setzt: ein einzelner
// Rückstrich am Zeilenende. Als Konstante, weil er in einem JavaScript-String
// doppelt geschrieben werden muss und die Fälle sonst schwer zu lesen wären.
const UMBRUCH = '\\';

// Die Beispiel-Fläche des Management-Summarys von 3E-000292, wörtlich.
const BEISPIEL_FLAECHE = [
  '!gruppe g1 x=-360 y=-200 b=700 h=280 farbe=grün',
  'Vorbereitung',
  '!karte k1 x=-320 y=-140 b=220 h=120',
  '## Zielbild',
  'Was am Ende dastehen soll',
  '!karte k2 x=40 y=-140 b=220 h=120 doc="Notizen/Konzept.md"',
  'Konzept nachlesen',
  '!karte k3 x=-320 y=160 b=220 h=140 bild="Bilder/Skizze.png"',
  '!form f1 x=40 y=160 b=200 h=100 art=raute rand=blau',
  'Entscheidung?',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'folgt aus',
  '!linie e2 k2 <-> k3 von=unten nach=oben',
  'hängt zusammen',
].join('\n');

// Die Ziele der Beispiel-Fläche sind im Beispiel bereits aufgelöst; der Kern
// löst nichts auf und bekommt sie deshalb hineingereicht.
const BEISPIEL_ZIELE = new Map([
  ['Notizen/Konzept.md', { file: 'Notizen/Konzept.md' }],
  ['Bilder/Skizze.png', { file: 'Bilder/Skizze.png' }],
]);

// Die Datei, die nach der Entscheidung F1 daraus entsteht — wörtlich aus dem
// Epic, mit Tabulatoren eingerückt.
const BEISPIEL_DATEI = `{
	"nodes": [
		{
			"id": "g1",
			"type": "group",
			"x": -360,
			"y": -200,
			"width": 700,
			"height": 280,
			"color": "4",
			"label": "Vorbereitung"
		},
		{
			"id": "k1",
			"type": "text",
			"x": -320,
			"y": -140,
			"width": 220,
			"height": 120,
			"text": "## Zielbild\\nWas am Ende dastehen soll"
		},
		{
			"id": "k2-titel",
			"type": "group",
			"x": 30,
			"y": -150,
			"width": 240,
			"height": 140,
			"label": "Konzept nachlesen"
		},
		{
			"id": "k2",
			"type": "file",
			"x": 40,
			"y": -140,
			"width": 220,
			"height": 120,
			"file": "Notizen/Konzept.md"
		},
		{
			"id": "k3",
			"type": "file",
			"x": -320,
			"y": 160,
			"width": 220,
			"height": 140,
			"file": "Bilder/Skizze.png"
		},
		{
			"id": "f1",
			"type": "text",
			"x": 40,
			"y": 160,
			"width": 200,
			"height": 100,
			"color": "#1a73e8",
			"text": "Entscheidung?"
		}
	],
	"edges": [
		{
			"id": "e1",
			"fromNode": "k1",
			"fromSide": "right",
			"toNode": "k2",
			"toSide": "left",
			"label": "folgt aus"
		},
		{
			"id": "e2",
			"fromNode": "k2",
			"fromSide": "bottom",
			"toNode": "k3",
			"toSide": "top",
			"fromEnd": "arrow",
			"label": "hängt zusammen"
		}
	]
}`;

function ausgabe(rumpf, optionen) {
  return flaecheNachJsonCanvas(rumpf, optionen);
}

// Der Bericht als Karte Schlüssel → Anzahl; die Fälle prüfen damit die Zahl und
// nicht die Reihenfolge der Liste.
function posten(verluste) {
  return Object.fromEntries(verluste.map((p) => [p.schluessel, p.anzahl]));
}

function knotenMit(canvas, id) {
  return canvas.nodes.find((k) => k.id === id);
}

describe('Ausgabe: die Knoten je Element-Art (AK2, AK3, AK4)', () => {
  it('macht aus einer Text-Karte einen Text-Knoten mit unverändertem Text', () => {
    const { canvas } = ausgabe('!karte k1 x=-10 y=20 b=200 h=100\n## Titel\nZweite Zeile');
    expect(canvas.nodes).toEqual([
      {
        id: 'k1',
        type: 'text',
        x: -10,
        y: 20,
        width: 200,
        height: 100,
        text: '## Titel\nZweite Zeile',
      },
    ]);
  });

  it('macht aus einer Gruppe einen Gruppen-Knoten mit Beschriftung und Farbe', () => {
    const { canvas } = ausgabe('!gruppe g1 x=0 y=0 b=400 h=300 farbe=rot\nVorbereitung');
    expect(canvas.nodes[0]).toEqual({
      id: 'g1',
      type: 'group',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      color: '1',
      label: 'Vorbereitung',
    });
  });

  it('lässt die Beschriftung einer Gruppe weg, wenn keine dasteht', () => {
    const { canvas } = ausgabe('!gruppe g1 x=0 y=0 b=400 h=300');
    expect(canvas.nodes[0]).not.toHaveProperty('label');
    expect(canvas.nodes[0]).not.toHaveProperty('color');
  });

  it('Tafel-Zeile «geometrische Form»: Text-Karte an derselben Stelle, Randfarbe als Farbe', () => {
    const { canvas, verluste } = ausgabe(
      '!form s1 x=40 y=160 b=200 h=100 art=raute rand=rot füllung=gelb\nEntscheidung?',
    );
    expect(canvas.nodes[0]).toEqual({
      id: 's1',
      type: 'text',
      x: 40,
      y: 160,
      width: 200,
      height: 100,
      color: '1',
      text: 'Entscheidung?',
    });
    // Art und Füllung haben im fremden Format keine Entsprechung.
    expect(JSON.stringify(canvas.nodes[0])).not.toContain('raute');
    expect(posten(verluste)).toEqual({ [VERLUST_POSTEN.formAlsTextkarte]: 1 });
  });

  it('Tafel-Zeile «Beschriftung einer Verweis-Karte»: Rahmen mit Titel vor der Karte', () => {
    const { canvas, verluste } = ausgabe(
      '!karte k2 x=40 y=-140 b=220 h=120 doc="Konzept.md"\nKonzept nachlesen',
      { ziele: { 'Konzept.md': { file: 'Konzept.md' } } },
    );
    expect(canvas.nodes.map((k) => k.id)).toEqual(['k2-titel', 'k2']);
    expect(canvas.nodes[0]).toEqual({
      id: 'k2-titel',
      type: 'group',
      x: 30,
      y: -150,
      width: 240,
      height: 140,
      label: 'Konzept nachlesen',
    });
    expect(posten(verluste)).toEqual({ [VERLUST_POSTEN.beschriftungAlsRahmen]: 1 });
  });

  it('gibt dieselbe Regel auch der Bild-Karte und lässt eine Karte ohne Beschriftung allein', () => {
    const { canvas, verluste } = ausgabe(
      [
        '!karte k1 x=0 y=0 b=200 h=100 bild="Skizze.png"',
        'Die Skizze',
        '!karte k2 x=300 y=0 b=200 h=100 bild="Ohne.png"',
      ].join('\n'),
      { ziele: { 'Skizze.png': { file: 'a/Skizze.png' }, 'Ohne.png': { file: 'b/Ohne.png' } } },
    );
    expect(canvas.nodes.map((k) => k.id)).toEqual(['k1-titel', 'k1', 'k2']);
    expect(knotenMit(canvas, 'k1').file).toBe('a/Skizze.png');
    expect(posten(verluste)).toEqual({ [VERLUST_POSTEN.beschriftungAlsRahmen]: 1 });
  });

  it('hält die Stapel-Reihenfolge der Fence als Reihenfolge des Arrays', () => {
    const { canvas } = ausgabe(
      [
        '!karte k1 x=0 y=0 b=200 h=100',
        '!gruppe g1 x=-400 y=-400 b=800 h=800',
        '!form s1 x=0 y=300 b=200 h=100',
      ].join('\n'),
    );
    expect(canvas.nodes.map((k) => k.id)).toEqual(['k1', 'g1', 's1']);
  });
});

describe('Ausgabe: Farben und Verbindungen (AK6, AK7)', () => {
  const SECHS = { rot: '1', orange: '2', gelb: '3', grün: '4', türkis: '5', lila: '6' };

  for (const [name, ziffer] of Object.entries(SECHS)) {
    it(`gibt die Farbe ${name} als Voreinstellung ${ziffer} aus`, () => {
      const { canvas } = ausgabe(`!gruppe g1 x=0 y=0 b=100 h=100 farbe=${name}`);
      expect(canvas.nodes[0].color).toBe(ziffer);
    });
  }

  it('Tafel-Zeile «Blau und Pink»: als Farbwert des hellen Schemas', () => {
    const blau = ausgabe('!gruppe g1 x=0 y=0 b=100 h=100 farbe=blau').canvas.nodes[0];
    const pink = ausgabe('!gruppe g1 x=0 y=0 b=100 h=100 farbe=pink').canvas.nodes[0];
    expect(blau.color).toBe(TAB_GROUP_COLOR_VALUES.blue);
    expect(pink.color).toBe(TAB_GROUP_COLOR_VALUES.pink);
  });

  it('bildet die drei Richtungs-Formen ab und lässt die Voreinstellungen weg', () => {
    const rumpf = [
      '!karte k1 x=0 y=0 b=200 h=100',
      '!karte k2 x=300 y=0 b=200 h=100',
      '!linie e1 k1 -> k2',
      '!linie e2 k1 <-> k2',
      '!linie e3 k1 -- k2',
    ].join('\n');
    const { canvas } = ausgabe(rumpf);
    expect(canvas.edges[0]).toEqual({ id: 'e1', fromNode: 'k1', toNode: 'k2' });
    expect(canvas.edges[1]).toEqual({
      id: 'e2',
      fromNode: 'k1',
      toNode: 'k2',
      fromEnd: 'arrow',
    });
    expect(canvas.edges[2]).toEqual({ id: 'e3', fromNode: 'k1', toNode: 'k2', toEnd: 'none' });
  });

  it('übersetzt die vier Anschluss-Seiten und lässt «auto» als fehlende Angabe weg', () => {
    const rumpf = [
      '!karte k1 x=0 y=0 b=200 h=100',
      '!karte k2 x=300 y=0 b=200 h=100',
      '!linie e1 k1 -> k2 von=oben nach=unten',
      '!linie e2 k1 -> k2 von=links nach=rechts',
      '!linie e3 k1 -> k2 von=auto nach=auto',
    ].join('\n');
    const { canvas } = ausgabe(rumpf);
    expect(canvas.edges[0]).toMatchObject({ fromSide: 'top', toSide: 'bottom' });
    expect(canvas.edges[1]).toMatchObject({ fromSide: 'left', toSide: 'right' });
    expect(canvas.edges[2]).not.toHaveProperty('fromSide');
    expect(canvas.edges[2]).not.toHaveProperty('toSide');
  });

  it('gibt eine mehrzeilige Beschriftung als Beschriftung mit Zeilenumbruch aus', () => {
    const rumpf = [
      '!karte k1 x=0 y=0 b=200 h=100',
      '!karte k2 x=300 y=0 b=200 h=100',
      '!linie e1 k1 -> k2 farbe=türkis',
      'erste Zeile',
      'zweite Zeile',
    ].join('\n');
    const { canvas } = ausgabe(rumpf);
    expect(canvas.edges[0].label).toBe('erste Zeile\nzweite Zeile');
    expect(canvas.edges[0].color).toBe('5');
  });
});

describe('Ausgabe: was entfällt und gezählt wird (AK2)', () => {
  it('Tafel-Zeile «fehlerhafte oder unbekannte Elemente»: ein unbekannter Marker entfällt', () => {
    const { canvas, verluste } = ausgabe('!wolke w1 x=0 y=0\nAus einer neueren Fassung');
    expect(canvas.nodes).toEqual([]);
    expect(posten(verluste)[VERLUST_POSTEN.unbekanntesElement]).toBe(1);
    // Der unbekannte Marker ist zugleich ein Befund des Kerns; auch er wird
    // gezählt und nicht ausgegeben.
    expect(posten(verluste)[VERLUST_POSTEN.befundeNichtUebertragen]).toBe(1);
  });

  it('zählt die Befunde der Fläche, ohne sie auszugeben', () => {
    const { canvas, verluste } = ausgabe('!karte k1 x=oben y=0 b=200 h=100\nTrotzdem lesbar');
    expect(canvas.nodes[0].text).toBe('Trotzdem lesbar');
    expect(posten(verluste)[VERLUST_POSTEN.befundeNichtUebertragen]).toBe(1);
    expect(JSON.stringify(canvas)).not.toContain('ungueltigeZahl');
  });

  it('zählt eine Präambel mit Inhalt und übergeht reine Leerzeilen', () => {
    const mitInhalt = ausgabe('Text vor dem ersten Marker\n!karte k1 x=0 y=0 b=200 h=100');
    expect(posten(mitInhalt.verluste)[VERLUST_POSTEN.praeambelNichtUebertragen]).toBe(1);
    const nurLeer = ausgabe('\n\n!karte k1 x=0 y=0 b=200 h=100');
    expect(posten(nurLeer.verluste)[VERLUST_POSTEN.praeambelNichtUebertragen]).toBeUndefined();
  });

  it('lässt eine Verbindung entfallen, deren Ende keine Karte ist', () => {
    const rumpf = [
      '!karte k1 x=0 y=0 b=200 h=100',
      '!gruppe g1 x=-400 y=-400 b=800 h=800',
      '!linie e1 k1 -> g1',
    ].join('\n');
    const { canvas, verluste } = ausgabe(rumpf);
    expect(canvas.edges).toEqual([]);
    expect(posten(verluste)[VERLUST_POSTEN.verbindungOhneKarte]).toBe(1);
  });

  it('meldet ein Ziel, für das keine Auflösung hineingereicht wurde', () => {
    const { canvas, verluste } = ausgabe('!karte k1 x=0 y=0 b=200 h=100 doc="Konzept.md#Zielbild"');
    expect(canvas.nodes[0]).toMatchObject({ file: 'Konzept.md', subpath: '#Zielbild' });
    expect(posten(verluste)[VERLUST_POSTEN.zielNichtAufgeloest]).toBe(1);
  });

  it('nimmt Pfad und Anker aus der hineingereichten Abbildung, ohne selbst aufzulösen', () => {
    const { canvas, verluste } = ausgabe('!karte k1 x=0 y=0 b=200 h=100 doc="Konzept#Ziel"', {
      ziele: new Map([['Konzept#Ziel', { file: 'Notizen/Konzept.md', subpath: '#Ziel' }]]),
    });
    expect(canvas.nodes[0]).toMatchObject({
      file: 'Notizen/Konzept.md',
      subpath: '#Ziel',
    });
    expect(verluste).toEqual([]);
  });
});

describe('Das Beispiel-Paar aus dem Epic 3E-000292 (AK3)', () => {
  it('erzeugt aus der Beispiel-Fläche zeichengenau die Beispiel-Datei', () => {
    const { canvas } = ausgabe(BEISPIEL_FLAECHE, { ziele: BEISPIEL_ZIELE });
    expect(serialisiereJsonCanvas(canvas)).toBe(BEISPIEL_DATEI);
  });

  it('liefert dazu genau den Bericht, den das Epic nennt', () => {
    const { verluste } = ausgabe(BEISPIEL_FLAECHE, { ziele: BEISPIEL_ZIELE });
    expect(verluste).toEqual([
      { schluessel: VERLUST_POSTEN.formAlsTextkarte, anzahl: 1 },
      { schluessel: VERLUST_POSTEN.beschriftungAlsRahmen, anzahl: 1 },
    ]);
  });

  it('rückt mit Tabulatoren ein und trägt nur die beiden Listen', () => {
    const text = serialisiereJsonCanvas({ nodes: [], edges: [] });
    expect(text).toBe('{\n\t"nodes": [],\n\t"edges": []\n}');
    expect(
      Object.keys(JSON.parse(serialisiereJsonCanvas(ausgabe(BEISPIEL_FLAECHE).canvas))),
    ).toEqual(['nodes', 'edges']);
  });
});

describe('Einlesen: die Knoten je Art (Tafel fremd → eigen, AK2, AK3)', () => {
  function lies(nodes, edges, optionen) {
    return jsonCanvasNachFlaeche({ nodes, edges }, optionen);
  }

  it('macht aus einem Text-Knoten eine Karte mit unverändertem Text', () => {
    const { rumpf, fehler } = lies([
      { id: 'k1', type: 'text', x: -10, y: 20, width: 200, height: 100, text: '# Titel\nZeile' },
    ]);
    expect(fehler).toBeNull();
    expect(rumpf).toBe('!karte k1 x=-10 y=20 b=200 h=100\n# Titel\nZeile');
  });

  it('macht aus einem Gruppen-Knoten eine Gruppe mit Beschriftung und Farbe', () => {
    const { rumpf } = lies([
      { id: 'g1', type: 'group', x: 0, y: 0, width: 400, height: 300, color: '4', label: 'Vorne' },
    ]);
    expect(rumpf).toBe('!gruppe g1 x=0 y=0 b=400 h=300 farbe=grün\nVorne');
  });

  it('Tafel-Zeile «Karte mit einer Web-Adresse»: Text-Karte mit Markdown-Verweis', () => {
    const { rumpf, verluste } = lies([
      { id: 'w1', type: 'link', x: 0, y: 0, width: 200, height: 100, url: 'https://example.org/a' },
    ]);
    expect(rumpf).toContain('[https://example.org/a](https://example.org/a)');
    expect(posten(verluste)[VERLUST_POSTEN.webkarteAlsTextkarte]).toBe(1);
  });

  it('Tafel-Zeile «Datei-Karte auf einen anderen Dateityp»: Text-Karte mit Verweis', () => {
    const { rumpf, verluste } = lies([
      { id: 'd1', type: 'file', x: 0, y: 0, width: 200, height: 100, file: 'Anlagen/Bericht.pdf' },
    ]);
    expect(rumpf).toContain('[Bericht.pdf](Bericht.pdf)');
    expect(posten(verluste)[VERLUST_POSTEN.fremderDateitypAlsTextkarte]).toBe(1);
  });

  it('macht aus einem Datei-Knoten auf Markdown eine Verweis-Karte, auf ein Bild eine Bild-Karte', () => {
    const { rumpf } = lies([
      { id: 'k1', type: 'file', x: 0, y: 0, width: 200, height: 100, file: 'Notizen/Konzept.md' },
      { id: 'k2', type: 'file', x: 0, y: 200, width: 200, height: 100, file: 'Bilder/Skizze.png' },
      { id: 'k3', type: 'file', x: 0, y: 400, width: 200, height: 100, file: 'Notizen/Ohne' },
    ]);
    expect(rumpf).toContain('!karte k1 x=0 y=0 b=200 h=100 doc="Konzept.md"');
    expect(rumpf).toContain('!karte k2 x=0 y=200 b=200 h=100 bild="Skizze.png"');
    // Ein Ziel ohne Endung ist ein Dokument-Verweis: der Auflöser hängt `.md` an.
    expect(rumpf).toContain('!karte k3 x=0 y=400 b=200 h=100 doc="Ohne"');
  });

  it('Tafel-Zeile «Verweis auf eine Überschrift oder einen Block»: der Anker bleibt erhalten', () => {
    const { rumpf } = lies([
      {
        id: 'k1',
        type: 'file',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        file: 'Konzept.md',
        subpath: '#^block-1',
      },
    ]);
    expect(rumpf).toContain('doc="Konzept.md#^block-1"');
  });

  it('übersetzt den fremden Pfad über die hineingereichte Funktion', () => {
    const { rumpf } = lies(
      [{ id: 'k1', type: 'file', x: 0, y: 0, width: 200, height: 100, file: 'Notizen/Konzept.md' }],
      [],
      { zielFuerPfad: (pfad) => `../${pfad}` },
    );
    expect(rumpf).toContain('doc="../Notizen/Konzept.md"');
  });

  it('Tafel-Zeile «Farbe einer Karte»: sie entfällt', () => {
    const { rumpf, verluste } = lies([
      { id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Da', color: '2' },
    ]);
    expect(rumpf).not.toContain('farbe');
    expect(posten(verluste)[VERLUST_POSTEN.kartenfarbeEntfallen]).toBe(1);
  });

  it('Tafel-Zeile «Hintergrundbild einer Gruppe»: es entfällt', () => {
    const { rumpf, verluste } = lies([
      {
        id: 'g1',
        type: 'group',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        background: 'Bilder/Grund.png',
        backgroundStyle: 'cover',
      },
    ]);
    expect(rumpf).not.toContain('Grund.png');
    expect(posten(verluste)[VERLUST_POSTEN.gruppenhintergrundEntfallen]).toBe(1);
  });

  it('überspringt einen Knoten ohne Pflichtfelder und einen unbekannter Art', () => {
    const { rumpf, verluste } = lies([
      { id: 'k1', type: 'text', x: 0, y: 0, width: 200, text: 'Ohne Höhe' },
      { id: 'k2', type: 'wolke', x: 0, y: 0, width: 200, height: 100 },
      { id: 'k3', type: 'file', x: 0, y: 0, width: 200, height: 100 },
      'kein Objekt',
    ]);
    expect(rumpf).toBe('');
    expect(posten(verluste)[VERLUST_POSTEN.knotenUebersprungen]).toBe(4);
  });
});

describe('Einlesen: Farben, Kennungen und Lage (AK4, AK5, AK7)', () => {
  function lies(nodes, edges) {
    return jsonCanvasNachFlaeche({ nodes, edges });
  }

  const SECHS = { 1: 'rot', 2: 'orange', 3: 'gelb', 4: 'grün', 5: 'türkis', 6: 'lila' };

  for (const [ziffer, name] of Object.entries(SECHS)) {
    it(`liest die Voreinstellung ${ziffer} als Farbe ${name}`, () => {
      const { rumpf } = lies([
        { id: 'g1', type: 'group', x: 0, y: 0, width: 100, height: 100, color: String(ziffer) },
      ]);
      expect(rumpf).toContain(`farbe=${name}`);
    });
  }

  it('Tafel-Zeile «freier Farbwert»: die nächstliegende der acht Farben', () => {
    // Exakt der helle Blau-Wert und ein leicht daneben liegender Pink-Ton.
    const genau = lies([
      {
        id: 'g1',
        type: 'group',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: TAB_GROUP_COLOR_VALUES.blue,
      },
    ]);
    expect(genau.rumpf).toContain('farbe=blau');
    expect(posten(genau.verluste)[VERLUST_POSTEN.farbwertGenaehert]).toBe(1);
    const nah = lies([
      { id: 'g1', type: 'group', x: 0, y: 0, width: 100, height: 100, color: '#d21a86' },
    ]);
    expect(nah.rumpf).toContain('farbe=pink');
  });

  it('lässt einen Farbwert ohne lesbare Form bei der Standardfarbe', () => {
    const { rumpf, verluste } = lies([
      { id: 'g1', type: 'group', x: 0, y: 0, width: 100, height: 100, color: 'rosa' },
    ]);
    expect(rumpf).toBe('!gruppe g1 x=0 y=0 b=100 h=100');
    expect(posten(verluste)[VERLUST_POSTEN.farbwertGenaehert]).toBeUndefined();
  });

  it('übernimmt Lage und Größe unverändert und rundet nicht-ganzzahlige Werte', () => {
    const { rumpf } = lies([
      { id: 'k1', type: 'text', x: -320.4, y: 160.6, width: 219.5, height: 12, text: 'Da' },
    ]);
    expect(rumpf).toBe('!karte k1 x=-320 y=161 b=220 h=12\nDa');
  });

  it('ersetzt eine Kennung außerhalb des eigenen Musters; die Verbindung folgt', () => {
    const { rumpf } = lies(
      [
        { id: 'a b#1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Eins' },
        { id: 'k9', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'Zwei' },
      ],
      [{ id: 'kante 1', fromNode: 'a b#1', toNode: 'k9' }],
    );
    expect(rumpf).toContain('!karte k1 x=0 y=0 b=200 h=100');
    expect(rumpf).toContain('!linie e1 k1 -> k9');
  });

  it('ersetzt eine doppelte Kennung und lässt die erste stehen', () => {
    const { rumpf } = lies([
      { id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Eins' },
      { id: 'k1', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'Zwei' },
    ]);
    const model = parseCanvasFence(rumpf);
    expect(model.elemente.map((el) => el.id)).toEqual(['k1', 'k2']);
    expect(model.errors).toEqual([]);
  });

  it('hält die Reihenfolge des Arrays als Stapel-Reihenfolge der Fence', () => {
    const { rumpf } = lies([
      { id: 'g1', type: 'group', x: 0, y: 0, width: 900, height: 900 },
      { id: 'k1', type: 'text', x: 10, y: 10, width: 200, height: 100, text: 'Eins' },
    ]);
    expect(parseCanvasFence(rumpf).elemente.map((el) => el.art)).toEqual(['gruppe', 'karte']);
  });
});

describe('Einlesen: Verbindungen (AK6)', () => {
  const KARTEN = [
    { id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Eins' },
    { id: 'k2', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'Zwei' },
  ];

  function liesKante(kante) {
    const { rumpf, verluste } = jsonCanvasNachFlaeche({ nodes: KARTEN, edges: [kante] });
    return { zeile: rumpf.split('\n').find((z) => z.startsWith('!linie')), verluste };
  }

  it('liest die drei Enden-Kombinationen als die drei eigenen Richtungs-Formen', () => {
    expect(liesKante({ id: 'e1', fromNode: 'k1', toNode: 'k2' }).zeile).toBe('!linie e1 k1 -> k2');
    expect(
      liesKante({ id: 'e1', fromNode: 'k1', toNode: 'k2', fromEnd: 'arrow', toEnd: 'arrow' }).zeile,
    ).toBe('!linie e1 k1 <-> k2');
    expect(
      liesKante({ id: 'e1', fromNode: 'k1', toNode: 'k2', fromEnd: 'none', toEnd: 'none' }).zeile,
    ).toBe('!linie e1 k1 -- k2');
  });

  it('Tafel-Zeile «Pfeil nur am Anfang»: Enden und Seiten werden getauscht, ohne Verlust', () => {
    const { zeile, verluste } = liesKante({
      id: 'e1',
      fromNode: 'k1',
      fromSide: 'right',
      toNode: 'k2',
      toSide: 'left',
      fromEnd: 'arrow',
      toEnd: 'none',
    });
    expect(zeile).toBe('!linie e1 k2 -> k1 von=links nach=rechts');
    expect(verluste).toEqual([]);
  });

  it('übersetzt die Anschluss-Seiten und lässt eine fehlende Angabe fehlen', () => {
    expect(
      liesKante({ id: 'e1', fromNode: 'k1', fromSide: 'top', toNode: 'k2', toSide: 'bottom' })
        .zeile,
    ).toBe('!linie e1 k1 -> k2 von=oben nach=unten');
    expect(liesKante({ id: 'e1', fromNode: 'k1', toNode: 'k2' }).zeile).not.toContain('von=');
  });

  it('nimmt Farbe und mehrzeilige Beschriftung mit', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: KARTEN,
      edges: [{ id: 'e1', fromNode: 'k1', toNode: 'k2', color: '6', label: 'erste\nzweite' }],
    });
    expect(rumpf).toContain('!linie e1 k1 -> k2 farbe=lila\nerste\nzweite');
  });

  it('Tafel-Zeile «Verbindung an einer Gruppe»: sie entfällt', () => {
    const { rumpf, verluste } = jsonCanvasNachFlaeche({
      nodes: [...KARTEN, { id: 'g1', type: 'group', x: -9, y: -9, width: 900, height: 900 }],
      edges: [
        { id: 'e1', fromNode: 'k1', toNode: 'g1' },
        { id: 'e2', fromNode: 'k1', toNode: 'k9' },
      ],
    });
    expect(rumpf).not.toContain('!linie');
    expect(posten(verluste)[VERLUST_POSTEN.verbindungOhneKarte]).toBe(2);
  });
});

describe('Einlesen: der Rumpf ist für den Kern lesbar (AK4, AK5)', () => {
  it('liest der Parser das Erzeugte ohne einen einzigen Befund', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: [
        { id: 'g1', type: 'group', x: -9, y: -9, width: 900, height: 900, color: '#d01884' },
        { id: 'kein muster', type: 'text', x: 0, y: 0, width: 200, height: 100, text: '!karte' },
        { id: 'k9', type: 'file', x: 300, y: 0, width: 200, height: 100, file: 'A.md' },
        { id: 'k9', type: 'file', x: 600, y: 0, width: 200, height: 100, file: 'B.png' },
        { id: 'w1', type: 'link', x: 900, y: 0, width: 200, height: 100, url: 'https://a.example' },
      ],
      edges: [{ id: 'e1', fromNode: 'k9', toNode: 'w1', fromSide: 'right', color: '3' }],
    });
    const model = parseCanvasFence(rumpf);
    expect(model.errors).toEqual([]);
    expect(model.elemente).toHaveLength(6);
  });

  it('schützt eine Inhalts-Zeile, die selbst wie ein Marker aussieht', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: [{ id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: '!form s1' }],
    });
    expect(rumpf).toBe('!karte k1 x=0 y=0 b=200 h=100\n\\!form s1');
    expect(parseCanvasFence(rumpf).elemente[0].inhalt).toBe('!form s1');
  });

  it('macht aus CRLF im fremden Text das Zeilenende der Fence', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: [{ id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'a\r\nb' }],
    });
    // Der Umbruch zwischen zwei Textzeilen wird dabei zum festen — die Wandlung
    // greift nach dem Einebnen des Zeilenendes und nicht davor.
    expect(rumpf).toBe(`!karte k1 x=0 y=0 b=200 h=100\na${UMBRUCH}\nb`);
  });
});

// 4T-001806 (Epic 3E-000292): Abnahme-Befund des Product Owners vom 2026-09-20.
// Eine im fremden Werkzeug zweizeilige Text-Karte erschien nach dem Einlesen
// als ein fortlaufender Absatz, weil das fremde Werkzeug den einfachen
// Zeilenumbruch als neue Zeile zeigt und Markdown ihn als Leerzeichen liest.
// Seither wird er beim Einlesen zum **festen** Umbruch.
describe('Einlesen: einfacher Zeilenumbruch im Karten-Text wird zum festen', () => {
  const karte = (text) =>
    jsonCanvasNachFlaeche({
      nodes: [{ id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text }],
    });
  const inhaltVon = (text) => parseCanvasFence(karte(text).rumpf).elemente[0].inhalt;

  it('wandelt den Umbruch zwischen zwei nicht-leeren Textzeilen', () => {
    expect(inhaltVon('Erste Zeile\nZweite Zeile')).toBe(`Erste Zeile${UMBRUCH}\nZweite Zeile`);
  });

  it('lässt die letzte Zeile ohne Umbruch, weil dahinter nichts steht', () => {
    expect(inhaltVon('Eins\nZwei\nDrei')).toBe(`Eins${UMBRUCH}\nZwei${UMBRUCH}\nDrei`);
  });

  it('lässt eine Leerzeile unberührt: der Absatz-Wechsel wirkt ohnehin', () => {
    expect(inhaltVon('Erster Absatz\n\nZweiter Absatz')).toBe('Erster Absatz\n\nZweiter Absatz');
  });

  it('lässt eine Liste unberührt: ihre Punkte stehen ohnehin je für sich', () => {
    expect(inhaltVon('Einkauf\n- Milch\n- Brot')).toBe('Einkauf\n- Milch\n- Brot');
  });

  it('lässt Überschrift, Zitat, Trennlinie und Tabelle unberührt', () => {
    expect(inhaltVon('## Titel\nText')).toBe('## Titel\nText');
    expect(inhaltVon('Text\n> Zitat')).toBe('Text\n> Zitat');
    expect(inhaltVon('Text\n---\nText')).toBe('Text\n---\nText');
    expect(inhaltVon('| a | b |\n| - | - |\n| 1 | 2 |')).toBe('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(inhaltVon('a | b\n--- | ---\n1 | 2')).toBe('a | b\n--- | ---\n1 | 2');
  });

  it('lässt den Inhalt eines Code-Zauns unberührt', () => {
    const text = ['Vorher', '```js', 'const a = 1;', 'const b = 2;', '```', 'Nachher'].join('\n');
    expect(inhaltVon(text)).toBe(text);
  });

  it('lässt eine Zeile unberührt, die den festen Umbruch schon trägt', () => {
    expect(inhaltVon(`Eins${UMBRUCH}\nZwei`)).toBe(`Eins${UMBRUCH}\nZwei`);
    expect(inhaltVon('Eins  \nZwei')).toBe('Eins  \nZwei');
  });

  it('greift nicht an Beschriftungen von Gruppen und Verbindungen', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: [
        { id: 'g1', type: 'group', x: 0, y: 0, width: 400, height: 400, label: 'Eins\nZwei' },
        { id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'a' },
        { id: 'k2', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'b' },
      ],
      edges: [{ id: 'e1', fromNode: 'k1', toNode: 'k2', label: 'Eins\nZwei' }],
    });
    const model = parseCanvasFence(rumpf);
    expect(model.elemente[0].inhalt).toBe('Eins\nZwei');
    expect(model.elemente.find((el) => el.art === 'linie').inhalt).toBe('Eins\nZwei');
  });

  it('greift nicht am Verweis-Text einer Web- und einer fremden Datei-Karte', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: [
        { id: 'k1', type: 'link', x: 0, y: 0, width: 200, height: 100, url: 'https://a.example' },
        { id: 'k2', type: 'file', x: 300, y: 0, width: 200, height: 100, file: 'Plan.xlsx' },
      ],
    });
    expect(rumpf).not.toContain(UMBRUCH);
  });

  it('schützt eine Marker-Zeile weiterhin und trägt den Umbruch dennoch', () => {
    const { rumpf } = jsonCanvasNachFlaeche({
      nodes: [
        { id: 'k1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: '!form s1\nDanach' },
      ],
    });
    expect(rumpf).toBe(`!karte k1 x=0 y=0 b=200 h=100\n\\!form s1${UMBRUCH}\nDanach`);
    expect(parseCanvasFence(rumpf).elemente[0].inhalt).toBe(`!form s1${UMBRUCH}\nDanach`);
  });

  it('bleibt für den Parser befundfrei und übersteht den Weg zurück', () => {
    const { rumpf } = karte('Erste Zeile\nZweite Zeile');
    const model = parseCanvasFence(rumpf);
    expect(model.errors).toEqual([]);
    // Beim Ausgeben bleibt der Text unverändert: Der feste Umbruch ist auch im
    // fremden Werkzeug gültig, ein Verlust-Posten entsteht nicht.
    const hin = flaecheNachJsonCanvas(rumpf);
    expect(hin.canvas.nodes[0].text).toBe(`Erste Zeile${UMBRUCH}\nZweite Zeile`);
    expect(hin.verluste).toEqual([]);
  });
});

describe('Rundlauf über beide Richtungen (AK8)', () => {
  it('bringt die Fläche mit genau den benannten Verlusten zurück', () => {
    const hin = flaecheNachJsonCanvas(BEISPIEL_FLAECHE, { ziele: BEISPIEL_ZIELE });
    const zurueck = jsonCanvasNachFlaeche(hin.canvas);
    const model = parseCanvasFence(zurueck.rumpf);
    expect(model.errors).toEqual([]);

    // Die benannten Verluste als **Erwartung**: Die Raute kehrt als Text-Karte
    // wieder, die Beschriftung als Gruppe. Versteckte Kennungs-Tricks, mit denen
    // sich das Ursprungs-Element zurückerkennen ließe, sind ausdrücklich nicht
    // vorgesehen (Architekturentscheidung des Epics).
    const arten = model.elemente.map((el) => el.art);
    expect(arten.filter((a) => a === 'form')).toHaveLength(0);
    expect(arten.filter((a) => a === 'gruppe')).toHaveLength(2);
    expect(arten.filter((a) => a === 'karte')).toHaveLength(4);
    expect(arten.filter((a) => a === 'linie')).toHaveLength(2);

    // Was **nicht** verloren geht: Lage, Größe, Kennungen, Reihenfolge, Ziele,
    // Beschriftungen und die Richtungen beider Verbindungen.
    expect(model.elemente.map((el) => el.id)).toEqual([
      'g1',
      'k1',
      'k2-titel',
      'k2',
      'k3',
      'f1',
      'e1',
      'e2',
    ]);
    expect(zurueck.rumpf).toContain(
      '!gruppe g1 x=-360 y=-200 b=700 h=280 farbe=grün\nVorbereitung',
    );
    expect(zurueck.rumpf).toContain('!karte k2 x=40 y=-140 b=220 h=120 doc="Konzept.md"');
    expect(zurueck.rumpf).toContain('!karte k3 x=-320 y=160 b=220 h=140 bild="Skizze.png"');
    expect(zurueck.rumpf).toContain('!linie e1 k1 -> k2 von=rechts nach=links\nfolgt aus');
    expect(zurueck.rumpf).toContain('!linie e2 k2 <-> k3 von=unten nach=oben\nhängt zusammen');

    expect(posten(hin.verluste)).toEqual({
      [VERLUST_POSTEN.formAlsTextkarte]: 1,
      [VERLUST_POSTEN.beschriftungAlsRahmen]: 1,
    });
    // Zurück fällt allein die Farbe der ehemaligen Form: Eine Karte trägt keine.
    expect(posten(zurueck.verluste)).toEqual({ [VERLUST_POSTEN.kartenfarbeEntfallen]: 1 });
  });

  it('läuft ohne Verlust, wo beide Formate dasselbe kennen', () => {
    const rumpf = [
      '!gruppe g1 x=-400 y=-400 b=800 h=800 farbe=gelb',
      'Sammlung',
      '!karte k1 x=0 y=0 b=200 h=100',
      'Eins',
      '!karte k2 x=300 y=0 b=200 h=100',
      'Zwei',
      '!linie e1 k1 <-> k2 von=rechts nach=links farbe=lila',
      'gehört zusammen',
    ].join('\n');
    const hin = flaecheNachJsonCanvas(rumpf);
    const zurueck = jsonCanvasNachFlaeche(hin.canvas);
    expect(hin.verluste).toEqual([]);
    expect(zurueck.verluste).toEqual([]);
    expect(zurueck.rumpf).toBe(rumpf);
  });
});

describe('Fehlerfälle und Robustheit (AK2)', () => {
  it('meldet ein Objekt ohne beide Listen mit einem Fehler-Kennzeichen statt einer Ausnahme', () => {
    for (const eingabe of [null, undefined, 42, 'text', {}, { nodes: 'keine Liste' }]) {
      const ergebnis = jsonCanvasNachFlaeche(eingabe);
      expect(ergebnis.fehler).toBe(AUSTAUSCH_FEHLER.keineListen);
      expect(ergebnis.rumpf).toBe('');
      expect(ergebnis.verluste).toEqual([]);
    }
  });

  it('nimmt eine Liste allein und liefert dann ein Ergebnis', () => {
    expect(jsonCanvasNachFlaeche({ nodes: [] }).fehler).toBeNull();
    expect(jsonCanvasNachFlaeche({ edges: [] }).fehler).toBeNull();
  });

  it('wirft bei keiner Eingabe der Ausgabe-Richtung', () => {
    for (const eingabe of [null, undefined, '', 42, {}]) {
      expect(() => flaecheNachJsonCanvas(eingabe)).not.toThrow();
    }
    expect(flaecheNachJsonCanvas('').canvas).toEqual({ nodes: [], edges: [] });
  });

  it('serialisiert auch ein unvollständiges Objekt zu gültigem Text', () => {
    expect(() => JSON.parse(serialisiereJsonCanvas(null))).not.toThrow();
    expect(JSON.parse(serialisiereJsonCanvas({ nodes: 'nein' }))).toEqual({ nodes: [], edges: [] });
  });
});

describe('Prozess-Neutralität und unveränderte Eingabe (AK1, AK9)', () => {
  it('bleibt prozessneutral: kein Electron, kein DOM, kein Datei-Zugriff', () => {
    const quelle = readFileSync(
      new URL('../../src/shared/canvas/canvas-austausch.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual([
      './canvas-core.js',
      './canvas-elemente.js',
      '../bild-endungen.js',
      '../tab-group-colors.js',
      '../markdown/link-scan.js',
    ]);
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('lässt das gelesene Modell der Ausgabe-Richtung unverändert', () => {
    const model = parseCanvasFence(BEISPIEL_FLAECHE);
    const vorher = JSON.stringify(model);
    flaecheNachJsonCanvas(model, { ziele: BEISPIEL_ZIELE });
    expect(JSON.stringify(model)).toBe(vorher);
  });

  it('lässt das fremde Objekt der Einlese-Richtung unverändert', () => {
    const quelle = flaecheNachJsonCanvas(BEISPIEL_FLAECHE, { ziele: BEISPIEL_ZIELE }).canvas;
    const vorher = JSON.stringify(quelle);
    jsonCanvasNachFlaeche(quelle);
    expect(JSON.stringify(quelle)).toBe(vorher);
  });

  it('liefert den Posten-Satz als eingefrorene Konstante', () => {
    expect(Object.isFrozen(VERLUST_POSTEN)).toBe(true);
    expect(Object.isFrozen(AUSTAUSCH_FEHLER)).toBe(true);
    // Jeder Schlüssel zeigt auf seinen eigenen Namen; die Wege setzen ihn vor
    // ihr i18n-Präfix, statt hier fertige Sätze zu erwarten.
    for (const [name, wert] of Object.entries(VERLUST_POSTEN)) expect(wert).toBe(name);
  });
});
