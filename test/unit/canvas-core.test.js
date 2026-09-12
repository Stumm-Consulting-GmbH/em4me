// 4T-001652 (Epic 3E-000287): Unit-Tests des Canvas-Kerns — Grammatik der
// Fence `perspective-canvas`, Rundlauf, Vorwärts-Verträglichkeit, Fehler-
// Semantik und Prozess-Neutralität.
//
// Die Rundlauf-Proben sind der Kern dieser Datei: AK3 der Aufgabe und AK5 der
// Story 4S-000915 verlangen Byte-Gleichheit, nicht Modell-Gleichheit. Geprüft
// wird deshalb an Eingaben, die eine Normalform-Ausgabe **nicht** trifft —
// abweichende Abstände, CRLF, unbekannte Marker, ein Code-Block im
// Karten-Inhalt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseCanvasFence,
  serializeCanvasFence,
  findCanvasFences,
  istCanvasDokument,
  canvasFenceBlock,
  canvasFlaechenTitel,
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
} from '../../src/shared/canvas/canvas-core.js';
// 4T-001655: Die acht Farben der Verbindungen sind genau die acht der
// Reiter-Gruppen; der Vergleich hält die beiden Sätze zusammen.
import { TAB_GROUP_COLOR_KEYS } from '../../src/shared/tab-group-colors.js';

// Eine gewöhnliche Fläche: zwei Karten, eine gerichtete Verbindung.
const RUMPF = [
  '!karte k1 x=-320 y=-140 b=260 h=120',
  '## Ausgangslage',
  '',
  'Der Import liest heute nur eine Quelle.',
  '',
  '!karte k2 x=40 y=-140 b=260 h=120',
  '## Zielbild',
  '',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'ergibt',
].join('\n');

function rundlauf(rumpf) {
  return serializeCanvasFence(parseCanvasFence(rumpf));
}

describe('canvas-core — Lesen der Grammatik (AK2)', () => {
  it('liest Karten mit Kennung, Lage, Größe und Inhalt', () => {
    const model = parseCanvasFence(RUMPF);
    expect(model.errors).toEqual([]);
    const karten = model.elemente.filter((e) => e.art === 'karte');
    expect(karten.map((k) => k.id)).toEqual(['k1', 'k2']);
    expect(karten[0]).toMatchObject({ x: -320, y: -140, b: 260, h: 120 });
    expect(karten[0].inhalt).toBe('## Ausgangslage\n\nDer Import liest heute nur eine Quelle.\n');
    expect(karten[1].inhalt).toBe('## Zielbild\n');
  });

  it('liest Verbindungen mit Enden, Richtung, Seiten und Beschriftung', () => {
    const linie = parseCanvasFence(RUMPF).elemente.find((e) => e.art === 'linie');
    expect(linie).toMatchObject({ id: 'e1', von: 'k1', nach: 'k2', gerichtet: true });
    expect(linie.attrs).toMatchObject({ von: 'rechts', nach: 'links' });
    expect(linie.inhalt).toBe('ergibt');
  });

  it('unterscheidet gerichtet und ungerichtet am Pfeil (G4)', () => {
    const model = parseCanvasFence('!linie e1 a -- b');
    expect(model.elemente[0].gerichtet).toBe(false);
  });

  // Befund 2 des Product Owners vom 2026-09-10: «Es soll auch die Möglichkeit
  // geben, einen Pfeil in beide Richtungen zu zeichnen.»
  it('liest die drei Richtungs-Formen als `richtung` und leitet `gerichtet` ab', () => {
    const faelle = [
      ['->', 'vor', true],
      ['<->', 'beide', true],
      ['--', 'keine', false],
    ];
    for (const [pfeil, richtung, gerichtet] of faelle) {
      const model = parseCanvasFence(`!linie e1 a ${pfeil} b`);
      // Die beiden Enden zeigen ins Leere, das ist hier nicht der Gegenstand;
      // am Pfeil selbst darf nichts zu beanstanden sein.
      expect(model.errors.map((e) => e.code)).not.toContain('ungueltigerPfeil');
      expect(model.elemente[0]).toMatchObject({ richtung, gerichtet });
    }
  });

  it('liest einen unbekannten Pfeil als Befund und als `vor`', () => {
    // Unverändert gegenüber dem Stand vor Befund 2: Eine defekte Zeile darf
    // ihre Aussage nicht wechseln, nur weil eine dritte Form hinzugekommen ist.
    const model = parseCanvasFence('!linie e1 a => b');
    expect(model.errors.map((e) => e.code)).toContain('ungueltigerPfeil');
    expect(model.elemente[0]).toMatchObject({ richtung: 'vor', gerichtet: true });
  });

  it('schreibt eine Linie ohne `richtung` nach ihrem `gerichtet` zurück', () => {
    // Ein Element aus einem Programmteil, der die dritte Form nicht kennt: Es
    // darf beim Schreiben nicht still zu `--` werden.
    const model = parseCanvasFence('!linie e1 a -> b');
    delete model.elemente[0].richtung;
    model.elemente[0].geaendert = true;
    expect(serializeCanvasFence(model)).toBe('!linie e1 a -> b');
  });

  it('hält die Reihenfolge der Fence als Stapel-Reihenfolge (G3)', () => {
    const model = parseCanvasFence(RUMPF);
    expect(model.elemente.map((e) => e.id)).toEqual(['k1', 'k2', 'e1']);
    expect(Object.keys(model.elemente[0])).not.toContain('z');
  });

  it('liest die Farbe einer Verbindung als Namen aus dem festen Satz (4T-001655)', () => {
    // Entscheidung V1 des Product Owners vom 2026-09-10: An der Linie steht ein
    // Name, nie ein Farbwert — er zeigt auf das Farb-Paar des Themes.
    const linie = parseCanvasFence('!linie e1 a -> b farbe=türkis').elemente[0];
    expect(linie.farbe).toBe('türkis');
    expect(LINIEN_FARBEN[linie.farbe]).toBe('cyan');
    expect(LINIEN_FARB_NAMEN).toHaveLength(8);
    // Die acht Namen sind genau die acht Schlüssel der Reiter-Gruppen.
    expect(Object.values(LINIEN_FARBEN).sort()).toEqual([...TAB_GROUP_COLOR_KEYS].sort());
  });

  it('ohne Angabe trägt die Verbindung keine Farbe (4T-001655)', () => {
    expect(parseCanvasFence('!linie e1 a -> b').elemente[0].farbe).toBeUndefined();
  });

  it('eine Farbe an der Karte ist weiterhin eine unbekannte Angabe (4T-001655)', () => {
    // Der Satz gilt der Verbindung; an der Karte bleibt `farbe` das, was G1
    // mit jeder unbekannten Angabe tut — mitführen, nicht beurteilen.
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 farbe="tiefes blau"');
    expect(model.errors).toEqual([]);
    expect(model.elemente[0].attrs.farbe).toBe('tiefes blau');
  });

  it('schreibt eine gesetzte Farbe und streicht eine entfernte (4T-001655)', () => {
    const model = parseCanvasFence('!linie e1 a -> b von=rechts');
    const linie = model.elemente[0];
    linie.attrs.farbe = 'rot';
    linie.attrFolge.push('farbe');
    linie.geaendert = true;
    expect(serializeCanvasFence(model)).toBe('!linie e1 a -> b von=rechts farbe=rot');
    delete linie.attrs.farbe;
    linie.attrFolge = linie.attrFolge.filter((n) => n !== 'farbe');
    expect(serializeCanvasFence(model)).toBe('!linie e1 a -> b von=rechts');
  });

  it('liest einen Wert in Anführungszeichen samt Escapes', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 titel="a \\"b\\" c\\\\d"');
    expect(model.elemente[0].attrs.titel).toBe('a "b" c\\d');
  });
});

describe('canvas-core — Rundlauf ist byte-gleich (AK3)', () => {
  it('gibt eine gewöhnliche Fläche unverändert zurück', () => {
    expect(rundlauf(RUMPF)).toBe(RUMPF);
  });

  it('erhält abweichende Schreibweise, die eine Normalform zerstören würde', () => {
    // Doppelte Leerzeichen, andere Attribut-Reihenfolge, ein quotierter Wert,
    // wo keine Quotes nötig wären, und eine Leerzeile vor dem ersten Marker.
    const roh = [
      '',
      '!karte  k1   y=-140 x=-320 h="120" b=260',
      'Text',
      '',
      '!linie e1 k1 -- k1',
    ].join('\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('erhält CRLF, statt die Datei still auf LF umzuschreiben', () => {
    const roh = RUMPF.split('\n').join('\r\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('erhält einen Code-Block im Karten-Inhalt', () => {
    const roh = ['!karte k1 x=0 y=0 b=200 h=200', '```js', 'const a = 1;', '```'].join('\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('erhält den leeren Rumpf', () => {
    expect(rundlauf('')).toBe('');
  });

  it('gibt die beidseitige Form zeichengenau zurück (Befund 2)', () => {
    const roh = ['!karte k1 x=0 y=0 b=10 h=10', '!linie e1 k1 <-> k1 von=oben nach=unten'].join(
      '\n',
    );
    expect(rundlauf(roh)).toBe(roh);
  });
});

describe('canvas-core — Vorwärts-Verträglichkeit (AK4, G1)', () => {
  it('führt unbekannte Marker späterer Stufen mit und schreibt sie zurück', () => {
    const roh = [
      '!karte k1 x=0 y=0 b=10 h=10',
      'A',
      '!form s1 x=380 y=120 art=stern rand=#c0392b',
      '!gruppe g1 x=-360 y=-180 b=720 h=200',
      'Analyse',
    ].join('\n');
    const model = parseCanvasFence(roh);
    expect(model.elemente.map((e) => e.art)).toEqual(['karte', 'unbekannt', 'unbekannt']);
    expect(model.errors.map((f) => f.code)).toEqual(['unbekannterMarker', 'unbekannterMarker']);
    expect(serializeCanvasFence(model)).toBe(roh);
  });

  it('erhält eine unbekannte Angabe auch dann, wenn das Element geändert wird', () => {
    // Die Rot-Probe zur Nicht-Vakuität: Ohne Erhalt stünde `glanz` nicht mehr
    // da. Genau dieser Fall — eine ältere Fassung verschiebt eine Karte, die
    // eine neuere angelegt hat — ist der Anlass für AK4.
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=10 h=10 glanz=matt');
    const karte = model.elemente[0];
    karte.x = 99;
    karte.geaendert = true;
    const neu = serializeCanvasFence(model);
    expect(neu).toContain('glanz=matt');
    expect(neu).toContain('x=99');
    expect(parseCanvasFence(neu).elemente[0].attrs.glanz).toBe('matt');
  });

  it('schreibt ein geändertes Element in kanonischer Form', () => {
    const model = parseCanvasFence('!karte  k1   x=0 y=0 b=10 h=10');
    model.elemente[0].geaendert = true;
    expect(serializeCanvasFence(model)).toBe('!karte k1 x=0 y=0 b=10 h=10');
  });
});

describe('canvas-core — Notausgang für zeilenführende Marker', () => {
  it('liest eine geschützte Inhalts-Zeile als Klartext und schreibt sie zurück', () => {
    const roh = ['!karte k1 x=0 y=0 b=10 h=10', '\\!karte ist hier Text', '\\\\!auch das'].join(
      '\n',
    );
    const model = parseCanvasFence(roh);
    expect(model.elemente).toHaveLength(1);
    expect(model.elemente[0].inhalt).toBe('!karte ist hier Text\n\\!auch das');
    expect(serializeCanvasFence(model)).toBe(roh);
  });

  it('schützt beim Schreiben eine Inhalts-Zeile, die mit einem Marker beginnt', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=10 h=10');
    model.elemente[0].inhalt = '!karte\n\\!schon geschützt\nnormal';
    model.elemente[0].geaendert = true;
    const neu = serializeCanvasFence(model);
    expect(neu.split('\n').slice(1)).toEqual(['\\!karte', '\\\\!schon geschützt', 'normal']);
    expect(parseCanvasFence(neu).elemente[0].inhalt).toBe(model.elemente[0].inhalt);
  });
});

describe('canvas-core — defekte Eingaben sind Befunde, kein Absturz (AK5)', () => {
  const faelle = [
    ['defekte Marker-Zeile', '!', 'defekteMarkerZeile'],
    ['fehlende Kennung', '!karte x=0 y=0 b=1 h=1', 'fehlendeKennung'],
    ['unbrauchbare Zahl', '!karte k1 x=abc y=0 b=1 h=1', 'ungueltigeZahl'],
    ['fehlender Pfeil', '!linie e1 k1 k2', 'ungueltigerPfeil'],
    [
      'unbekannte Seite',
      '!karte k1 x=0 y=0 b=1 h=1\n!linie e1 k1 -> k1 von=schraeg',
      'ungueltigeSeite',
    ],
    ['doppelte Kennung', '!karte k1 x=0 y=0 b=1 h=1\n!karte k1 x=1 y=1 b=1 h=1', 'doppelteKennung'],
    ['Ende ins Leere', '!linie e1 k1 -> k9', 'unbekanntesEnde'],
    // 4T-001655: Ein Name außerhalb des Satzes ist ein Befund; die Linie
    // bleibt stehen und wird in der gewohnten Farbe gezeichnet.
    [
      'unbekannte Farbe',
      '!karte k1 x=0 y=0 b=1 h=1\n!linie e1 k1 -> k1 farbe=neongrün',
      'ungueltigeFarbe',
    ],
    ['Inhalt vor dem ersten Marker', 'lose Zeile\n!karte k1 x=0 y=0 b=1 h=1', 'inhaltVorMarker'],
  ];

  for (const [name, rumpf, code] of faelle) {
    it(`meldet ${name}, ohne zu werfen und ohne zu verlieren`, () => {
      let model;
      expect(() => {
        model = parseCanvasFence(rumpf);
      }).not.toThrow();
      expect(model.errors.map((f) => f.code)).toContain(code);
      // Kein stiller Datenverlust: Der Rundlauf bleibt trotz Befund byte-gleich.
      expect(serializeCanvasFence(model)).toBe(rumpf);
    });
  }

  it('verkraftet null und undefined', () => {
    expect(parseCanvasFence(null).elemente).toEqual([]);
    expect(parseCanvasFence(undefined).errors).toEqual([]);
  });
});

describe('canvas-core — Fences im Dokument (E2, AK1/AK4 der Story)', () => {
  const dok = ['# Titel', '', '```perspective-canvas', '!karte k1 x=0 y=0 b=1 h=1', '```', ''].join(
    '\n',
  );

  it('erkennt ein Dokument mit der Fence als Canvas, eines ohne sie nicht', () => {
    expect(istCanvasDokument(dok)).toBe(true);
    expect(istCanvasDokument('# Titel\n\n```js\nconst a = 1;\n```')).toBe(false);
    expect(istCanvasDokument('')).toBe(false);
  });

  it('liefert Lage und Rumpf der Fence', () => {
    const [treffer] = findCanvasFences(dok);
    expect(treffer).toMatchObject({ startZeile: 3, endeZeile: 5 });
    expect(treffer.rumpf).toBe('!karte k1 x=0 y=0 b=1 h=1');
  });

  it('erkennt eine Fence mit längerem Zaun samt Code-Block im Inhalt', () => {
    const text = [
      '````perspective-canvas',
      '!karte k1 x=0 y=0 b=1 h=1',
      '```js',
      'x',
      '```',
      '````',
    ].join('\n');
    const [treffer] = findCanvasFences(text);
    expect(treffer.rumpf.split('\n')).toHaveLength(4);
  });
});

describe('canvas-core — Zaun-Länge bestimmt der Schreibweg', () => {
  it('nimmt drei Rückstriche, solange der Rumpf keine längere Folge trägt', () => {
    expect(canvasFenceBlock('!karte k1 x=0 y=0 b=1 h=1')).toMatch(/^```perspective-canvas\n/);
  });

  it('wächst über die längste Folge im Rumpf hinaus und bleibt lesbar', () => {
    const rumpf = '!karte k1 x=0 y=0 b=1 h=1\n```js\nx\n```';
    const block = canvasFenceBlock(rumpf);
    expect(block.startsWith('````perspective-canvas\n')).toBe(true);
    expect(findCanvasFences(block)[0].rumpf).toBe(rumpf);
  });
});

describe('canvas-core — Prozess-Neutralität (AK6)', () => {
  it('läuft in reiner Node-Umgebung ohne DOM und ohne Electron', () => {
    // Der Import oben ist der Wächter: das Modul lädt ohne Browser-Globals
    // (Vitest-Umgebung "node"). Muster calendar-core.test.js.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(parseCanvasFence('').elemente).toEqual([]);
  });

  it('lädt weder Electron noch ein DOM-Modul und greift nicht auf Dateien zu', () => {
    const quelle = readFileSync(
      new URL('../../src/shared/canvas/canvas-core.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual([]);
  });
});

describe('Titel einer Fläche: abgeleitet statt angegeben (4T-001677)', () => {
  // Ein Dokument kann mehrere Flächen tragen, und die Reiter, die sie
  // erreichbar machen, brauchen einen Namen. Eine ausdrückliche Angabe an der
  // Fence wäre eine Erweiterung des Speicherformats und damit eine
  // Entscheidung des Product Owners; die Ableitung kommt ohne sie aus.
  const titelVon = (rumpf) => canvasFlaechenTitel(parseCanvasFence(rumpf));
  const KOPF = '!karte k1 x=0 y=0 b=1 h=1';

  it('nimmt die Überschrift der ersten Karte, ohne die Rautezeichen', () => {
    expect(titelVon(KOPF + '\n## Ausgangslage\n\nText.')).toBe('Ausgangslage');
    expect(titelVon(KOPF + '\n# Eins\n')).toBe('Eins');
    expect(titelVon(KOPF + '\n###### Sechs')).toBe('Sechs');
  });

  it('nimmt die erste nichtleere Zeile, wenn keine Überschrift dasteht', () => {
    expect(titelVon(KOPF + '\n\n\nEinfach Text')).toBe('Einfach Text');
  });

  it('streift den Aufzählungs-Strich ab', () => {
    expect(titelVon(KOPF + '\n- Erster Punkt')).toBe('Erster Punkt');
    expect(titelVon(KOPF + '\n* Stern')).toBe('Stern');
  });

  it('nimmt die erste Karte, nicht die erste Zeile der Fence', () => {
    // Eine Verbindung kann vor einer Karte stehen; ihr Beschriftungs-Text ist
    // nicht der Titel der Fläche.
    const rumpf = '!linie e1 a -> b\nverbindet\n\n' + KOPF + '\n# Die Karte';
    expect(titelVon(rumpf)).toBe('Die Karte');
  });

  it('liefert leeren Text statt einer erfundenen Bezeichnung', () => {
    // Der Rückfall auf eine Zählung gehört der Anzeige: Er muss übersetzt
    // werden, und der Kern kennt keine Sprache.
    expect(titelVon(KOPF)).toBe('');
    expect(titelVon(KOPF + '\n\n   \n')).toBe('');
    expect(titelVon('!linie e1 a -> b')).toBe('');
    expect(canvasFlaechenTitel(null)).toBe('');
    expect(canvasFlaechenTitel({})).toBe('');
  });
});
