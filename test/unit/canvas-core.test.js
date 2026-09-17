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
  canvasListe,
  canvasUmfang,
  FORM_ARTEN,
  LINIEN_FARBEN,
  LINIEN_FARB_NAMEN,
} from '../../src/shared/canvas/canvas-core.js';
// 4T-001700: Die Gegenrichtung — Anlegen, Ändern, Löschen und Umordnen der
// Elemente im Modell. Sie steht eine Datei weiter und wird hier mitgeprüft,
// weil sie dieselbe Fachlichkeit trägt: die Reihenfolge in der Fence.
import {
  STAPEL_BEFEHLE,
  freieKennung,
  erzeugeForm,
  erzeugeGruppe,
  fuegeElementEin,
  entferneElement,
  verschiebeImStapel,
  setzeFormArt,
  setzeFormRand,
  setzeFormFuellung,
  setzeGruppenFarbe,
} from '../../src/shared/canvas/canvas-elemente.js';
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
    // 4T-001700: Bis zur Stufe 2 standen hier `!form` und `!gruppe`. Sie sind
    // seither bekannt, also prüft der Fall jetzt mit Markern, die es in keiner
    // Stufe gibt — die Zusage gilt jedem künftigen Marker, nicht zweien.
    const roh = [
      '!karte k1 x=0 y=0 b=10 h=10',
      'A',
      '!wolke w1 x=380 y=120 dichte=hoch',
      '!spur p1 von=k1',
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
    // 4T-001700: dieselbe Semantik für die beiden Marker der Stufe 2 — ein
    // Befund verwirft nie ein Element, und der Rundlauf bleibt byte-gleich.
    ['unbekannte Art der Form', '!form s1 x=0 y=0 b=1 h=1 art=wolke', 'ungueltigeArt'],
    ['unbekannter Rand der Form', '!form s1 x=0 y=0 b=1 h=1 rand=neongrün', 'ungueltigeFarbe'],
    ['unbekannte Füllung der Form', '!form s1 x=0 y=0 b=1 h=1 füllung=beige', 'ungueltigeFarbe'],
    ['fehlende Größe der Form', '!form s1 x=0 y=0', 'ungueltigeZahl'],
    ['unbekannte Farbe der Gruppe', '!gruppe g1 x=0 y=0 b=1 h=1 farbe=ocker', 'ungueltigeFarbe'],
    ['fehlende Kennung der Gruppe', '!gruppe x=0 y=0 b=1 h=1', 'fehlendeKennung'],
    // 4T-001746: dieselbe Semantik für die drei Befunde der Stufe 3 (G7, G8).
    ['leeren Dokument-Verweis', '!karte k1 x=0 y=0 b=1 h=1 doc=""', 'leererVerweis'],
    ['leeren Bild-Verweis', '!karte k1 x=0 y=0 b=1 h=1 bild="   "', 'leererVerweis'],
    [
      'beide Verweise an derselben Karte',
      '!karte k1 x=0 y=0 b=1 h=1 doc="Ziel.md" bild="Skizze.png"',
      'doppelterVerweis',
    ],
    [
      'unzulässige Bild-Endung',
      '!karte k1 x=0 y=0 b=1 h=1 bild="Anlagen/Bericht.pdf"',
      'ungueltigeBildEndung',
    ],
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
    // 4T-001746: Der Kern lädt seither **genau ein** Modul — den geteilten Satz
    // der Bild-Endungen für G8. Er ist reine Daten und damit prozess-neutral
    // wie der Kern selbst; die Zusage der Prüfung ist unverändert, dass hier
    // kein Renderer-Modul, kein Electron und kein Datei-Zugriff hereinkommt.
    const quelle = readFileSync(
      new URL('../../src/shared/canvas/canvas-core.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(importe).toEqual(['../bild-endungen.js']);
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

// ---------------------------------------------------------------------------
// 4T-001700 (Epic 3E-000288): Formen und Gruppen — Grammatik G5 und G6, die
// gemeinsame Stapel-Reihenfolge über alle Element-Arten (G3 nach der
// Entscheidung «Weg 2» des Product Owners vom 2026-09-12) und die Funktionen,
// mit denen Zeichnung und Bedienung die Liste ändern.
// ---------------------------------------------------------------------------

describe('canvas-core — Grammatik der Form (G5, AK2)', () => {
  const VOLL = '!form s1 x=380 y=120 b=90 h=90 art=stern rand=rot füllung=gelb';

  it('liest Kennung, Lage, Größe, Art, Rand und Füllung samt Beschriftung', () => {
    const model = parseCanvasFence(VOLL + '\nKernsatz\nzweite Zeile');
    expect(model.errors).toEqual([]);
    expect(model.elemente[0]).toMatchObject({
      art: 'form',
      id: 's1',
      x: 380,
      y: 120,
      b: 90,
      h: 90,
      formArt: 'stern',
      artUnbekannt: false,
      rand: 'rot',
      fuellung: 'gelb',
    });
    expect(model.elemente[0].inhalt).toBe('Kernsatz\nzweite Zeile');
  });

  it('kennt genau die sechs Arten der Entscheidung F2', () => {
    expect(FORM_ARTEN).toEqual(['rechteck', 'abgerundet', 'oval', 'dreieck', 'raute', 'stern']);
    for (const art of FORM_ARTEN) {
      const model = parseCanvasFence(`!form s1 x=0 y=0 b=1 h=1 art=${art}`);
      expect(model.errors).toEqual([]);
      expect(model.elemente[0].formArt).toBe(art);
    }
  });

  it('setzt ohne Angabe die Vorgaben: Rechteck, Standardfarbe, ungefüllt', () => {
    const el = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1').elemente[0];
    expect(el.formArt).toBe('rechteck');
    // Die Abwesenheit wird **nicht** zu einem erfundenen Wert: Welche Farbe die
    // Standardfarbe ist, weiß das Farbschema und nicht der Kern.
    expect(el.rand).toBeUndefined();
    expect(el.fuellung).toBeUndefined();
    expect(el.attrs.rand).toBeUndefined();
  });

  it('liest eine ausdrücklich leere Füllung als ungefüllt und behält den Wortlaut', () => {
    const roh = '!form s1 x=0 y=0 b=1 h=1 füllung=keine';
    const model = parseCanvasFence(roh);
    expect(model.errors).toEqual([]);
    expect(model.elemente[0].fuellung).toBeUndefined();
    expect(rundlauf(roh)).toBe(roh);
  });

  it('meldet eine unbekannte Art, führt sie als Rechteck und behält den Rohtext', () => {
    // Die Rückfall-Regel aus 6.3: gezeichnet wird ein Rechteck, geschrieben
    // wird weiterhin die unbekannte Angabe — auch wenn die Form bewegt wird.
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1 art=wolke glanz=matt');
    const el = model.elemente[0];
    expect(model.errors).toEqual([{ code: 'ungueltigeArt', zeile: 1, detail: 'wolke' }]);
    expect(el.formArt).toBe('rechteck');
    expect(el.artUnbekannt).toBe(true);
    el.x = 42;
    el.geaendert = true;
    expect(serializeCanvasFence(model)).toBe('!form s1 x=42 y=0 b=1 h=1 art=wolke glanz=matt');
  });

  it('meldet einen unbekannten Farbnamen und zeichnet in der Standardfarbe', () => {
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1 rand=neongrün füllung=ocker');
    expect(model.errors.map((f) => f.detail)).toEqual(['neongrün', 'ocker']);
    expect(model.elemente[0].rand).toBeUndefined();
    expect(model.elemente[0].fuellung).toBeUndefined();
    expect(model.elemente[0].attrs.rand).toBe('neongrün');
  });

  it('nimmt die Farbnamen aus demselben Satz wie die Verbindungen', () => {
    for (const name of LINIEN_FARB_NAMEN) {
      const model = parseCanvasFence(`!form s1 x=0 y=0 b=1 h=1 rand=${name} füllung=${name}`);
      expect(model.errors).toEqual([]);
      expect(model.elemente[0]).toMatchObject({ rand: name, fuellung: name });
    }
  });
});

describe('canvas-core — Grammatik der Gruppe (G6, AK2)', () => {
  it('liest Kennung, Lage, Größe und Farbe samt Beschriftung', () => {
    const model = parseCanvasFence('!gruppe g1 x=-360 y=-180 b=720 h=200 farbe=blau\nAnalyse');
    expect(model.errors).toEqual([]);
    expect(model.elemente[0]).toMatchObject({
      art: 'gruppe',
      id: 'g1',
      x: -360,
      y: -180,
      b: 720,
      h: 200,
      farbe: 'blau',
    });
    expect(model.elemente[0].inhalt).toBe('Analyse');
  });

  it('führt keine Mitglieder-Liste — das Rechteck ist die Aussage', () => {
    // Eine zweite Quelle derselben Aussage könnte auseinanderlaufen; Mitglied
    // ist, was geometrisch darin liegt, und das rechnet die Zeichnung.
    const el = parseCanvasFence('!gruppe g1 x=0 y=0 b=10 h=10').elemente[0];
    expect(Object.keys(el)).not.toContain('mitglieder');
    expect(el.farbe).toBeUndefined();
  });

  it('erlaubt eine mehrzeilige Beschriftung samt Notausgang', () => {
    const roh = ['!gruppe g1 x=0 y=0 b=10 h=10', 'Analyse', '\\!karte ist hier Text'].join('\n');
    const model = parseCanvasFence(roh);
    expect(model.elemente[0].inhalt).toBe('Analyse\n!karte ist hier Text');
    expect(serializeCanvasFence(model)).toBe(roh);
  });
});

describe('canvas-core — Rundlauf über Formen und Gruppen (AK3)', () => {
  it('erhält eine Schreibweise, die eine Normalform zerstören würde', () => {
    // Bewusst normalform-fern: andere Reihenfolge der Angaben, doppelte
    // Abstände, ein quotierter Wert ohne Not, unbekannte Angaben, defekte Art.
    const roh = [
      '!form  s1   art="stern" h=90 b=90 y=120 x=380 glanz=matt',
      'Beschriftung mit Sonderzeichen: «&» und —',
      '!gruppe g1 farbe=blau x=-360 y=-180 b=720 h=200 rand=doppelt',
      'Analyse',
      '!form s2 x=0 y=0 b=1 h=1 art=wolke rand=neongrün',
    ].join('\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('erhält CRLF über einer Fläche mit Formen und Gruppen', () => {
    const roh = [
      '!gruppe g1 x=0 y=0 b=10 h=10',
      'Analyse',
      '!form s1 x=0 y=0 b=1 h=1 art=raute',
      '!karte k1 x=0 y=0 b=10 h=10',
    ].join('\r\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('schreibt eine geänderte Form und eine geänderte Gruppe kanonisch', () => {
    const model = parseCanvasFence('!form  s1 x=0 y=0 b=1 h=1\n!gruppe  g1 x=0 y=0 b=1 h=1');
    for (const el of model.elemente) el.geaendert = true;
    expect(serializeCanvasFence(model)).toBe(
      '!form s1 x=0 y=0 b=1 h=1\n!gruppe g1 x=0 y=0 b=1 h=1',
    );
  });

  it('lässt eine Fläche der Stufe 1 unverändert', () => {
    // Die Gegenprobe zur Erweiterung: Was gestern richtig geschrieben wurde,
    // wird heute zeichengleich geschrieben.
    expect(rundlauf(RUMPF)).toBe(RUMPF);
  });
});

describe('canvas-core — ein Leser der Stufe 1 verliert nichts (AK6, G1)', () => {
  // Der Leser der Stufe 1 ist **dieser** Code mit dem Marker-Satz von damals;
  // ohne diesen Zugang ließe sich die Zusage nur behaupten statt prüfen.
  const STUFE_1 = { bekannteMarker: new Set(['karte', 'linie']) };
  const FLAECHE = [
    '!karte k1 x=-320 y=-140 b=260 h=120',
    '## Ausgangslage',
    '',
    '!gruppe g1 x=-360 y=-180 b=720 h=200 farbe=blau',
    'Analyse',
    '!form s1 x=380 y=120 b=90 h=90 art=stern rand=rot füllung=gelb',
    'Ziel',
    '!linie e1 k1 -> k1 farbe=türkis',
  ].join('\n');

  it('führt Formen und Gruppen als unbekannte Elemente mit', () => {
    const model = parseCanvasFence(FLAECHE, STUFE_1);
    expect(model.elemente.map((e) => e.art)).toEqual(['karte', 'unbekannt', 'unbekannt', 'linie']);
    expect(model.errors.map((f) => f.code)).toEqual(['unbekannterMarker', 'unbekannterMarker']);
  });

  it('schreibt sie byte-gleich zurück, statt sie still zu löschen', () => {
    expect(serializeCanvasFence(parseCanvasFence(FLAECHE, STUFE_1))).toBe(FLAECHE);
  });

  it('behält sie auch dann, wenn er eine Karte derselben Fläche verschiebt', () => {
    // Der eigentliche Schadensfall: zwei Programmfassungen an einer Datei. Die
    // ältere bewegt eine Karte und speichert — die Formen müssen stehen bleiben.
    const model = parseCanvasFence(FLAECHE, STUFE_1);
    const karte = model.elemente[0];
    karte.x = 0;
    karte.geaendert = true;
    const neu = serializeCanvasFence(model);
    expect(neu).toContain('!gruppe g1 x=-360 y=-180 b=720 h=200 farbe=blau');
    expect(neu).toContain('!form s1 x=380 y=120 b=90 h=90 art=stern rand=rot füllung=gelb');
    expect(neu.replace('x=0 y=-140', 'x=-320 y=-140')).toBe(FLAECHE);
  });
});

describe('canvas-core — eine Liste über alle Element-Arten (G3, AK10)', () => {
  const GEMISCHT = [
    '!gruppe g1 x=0 y=0 b=10 h=10',
    '!karte k1 x=0 y=0 b=10 h=10',
    '!form s1 x=0 y=0 b=1 h=1',
    '!linie e1 k1 -> k1',
    '!karte k2 x=0 y=0 b=10 h=10',
  ].join('\n');

  it('hält die Abfolge über Karten, Formen, Gruppen und Verbindungen', () => {
    const model = parseCanvasFence(GEMISCHT);
    expect(model.elemente.map((e) => `${e.art}:${e.id}`)).toEqual([
      'gruppe:g1',
      'karte:k1',
      'form:s1',
      'linie:e1',
      'karte:k2',
    ]);
    expect(serializeCanvasFence(model)).toBe(GEMISCHT);
  });

  it('führt kein eigenes Ordnungs-Attribut', () => {
    for (const el of parseCanvasFence(GEMISCHT).elemente) {
      expect(Object.keys(el)).not.toContain('z');
    }
  });

  it('zählt Karten, Verbindungen, Formen und Gruppen für die Umfang-Zeile (AK8)', () => {
    expect(canvasUmfang(parseCanvasFence(GEMISCHT))).toEqual({
      karten: 2,
      linien: 1,
      formen: 1,
      gruppen: 1,
      befunde: 0,
    });
  });
});

// 4T-001769 (Epic 3E-000290): Die Fläche als Liste — die zweite Ansicht
// desselben Modells (Story 4S-000948, AK1).
describe('canvasListe — die Fläche als Liste (4T-001769)', () => {
  const FLAECHE = [
    '!karte k1 x=0 y=0 b=200 h=100',
    'Fließtext davor',
    '## Erste Karte',
    '!form f1 x=300 y=0 b=80 h=80 art=oval',
    'Ein Oval',
    '!gruppe g1 x=-20 y=-20 b=600 h=600',
    'Alles zusammen',
    '!karte k2 x=0 y=300 b=200 h=100',
    '!linie l1 k1 -> k2',
    'hängt zusammen',
    '!linie l2 k2 <-> k1',
  ].join('\n');

  const liste = () => canvasListe(parseCanvasFence(FLAECHE));

  it('liefert die Elemente der Stapel-Ebene in Fence-Reihenfolge, mit ihrer Art', () => {
    // Die Reihenfolge in der Fence IST die Stapel-Reihenfolge (G3); die
    // Verbindungen fehlen mit Absicht — sie sind eine eigene Ebene und stehen
    // unter ihren Karten.
    expect(liste().map((e) => `${e.art}:${e.id}`)).toEqual([
      'karte:k1',
      'form:f1',
      'gruppe:g1',
      'karte:k2',
    ]);
  });

  it('nennt je Element seinen Anzeige-Text', () => {
    const [karte, form, gruppe, ohneText] = liste();
    // Die Karte folgt der Titel-Regel der Vorschau: Eine Überschrift hat
    // Vorrang vor der ersten Zeile.
    expect(karte.text).toBe('Erste Karte');
    // Form und Gruppe tragen ihre Beschriftung als Inhalts-Zeilen (G5, G6).
    expect(form.text).toBe('Ein Oval');
    expect(gruppe.text).toBe('Alles zusammen');
    // Ohne Beschriftung wird nichts erfunden; die Anzeige entscheidet, was sie
    // an diese Stelle setzt.
    expect(ohneText.text).toBe('');
  });

  it('gibt je Karte ihre Verbindungen mit Gegenstelle und Richtung', () => {
    const [k1, , , k2] = liste();
    expect(k1.verbindungen).toEqual([
      { id: 'l1', richtung: 'vor', ausgehend: true, gegenstelle: 'k2', text: 'hängt zusammen' },
      { id: 'l2', richtung: 'beide', ausgehend: false, gegenstelle: 'k2', text: '' },
    ]);
    expect(k2.verbindungen.map((v) => `${v.id}:${v.ausgehend}`)).toEqual(['l1:false', 'l2:true']);
    // Form und Gruppe haben keine Verbindungen: Sie hängen an keiner Linie.
    expect(liste()[1].verbindungen).toEqual([]);
  });

  it('nennt das Ziel einer Verweis-Karte und die Art einer Form', () => {
    const [karte, form] = canvasListe(
      parseCanvasFence(
        [
          '!karte k1 x=0 y=0 b=10 h=10 doc="Import.md#Ziel"',
          '# Mit Verweis',
          '!form f1 x=0 y=0 b=10 h=10 art=stern',
        ].join('\n'),
      ),
    );
    expect(karte.ziel).toBe('Import.md#Ziel');
    expect(form.formArt).toBe('stern');
    // Ohne Angabe gilt die Vorgabe-Art; erfunden wird auch hier nichts.
    expect(canvasListe(parseCanvasFence('!form f2 x=0 y=0 b=1 h=1'))[0].formArt).toBe('rechteck');
  });

  it('eine Verbindung auf sich selbst erscheint genau einmal', () => {
    // Zwei Zeilen für dieselbe Linie wären in der Liste eine Dublette.
    const eigen = canvasListe(parseCanvasFence('!karte k1 x=0 y=0 b=10 h=10\n!linie l1 k1 -> k1'));
    expect(eigen[0].verbindungen).toHaveLength(1);
    expect(eigen[0].verbindungen[0]).toMatchObject({ ausgehend: true, gegenstelle: 'k1' });
  });

  it('eine leere Fläche und ein fehlendes Modell liefern eine leere Liste', () => {
    expect(canvasListe(parseCanvasFence(''))).toEqual([]);
    expect(canvasListe(null)).toEqual([]);
    expect(canvasListe({})).toEqual([]);
  });

  it('ein defektes Element bleibt in der Liste stehen (Fehler-Semantik 6.3)', () => {
    // Eine Karte ohne gültige Größe ist ein Befund und kein Grund zu
    // verschwinden — sonst wäre die Liste unvollständig, gerade wo sie hilft.
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=nichts h=10\n# Trotzdem da');
    expect(model.errors.length).toBeGreaterThan(0);
    expect(canvasListe(model).map((e) => e.id)).toEqual(['k1']);
  });
});

describe('canvas-elemente — Anlegen und Löschen (AK11)', () => {
  // Eine frisch eingefügte, leere Fläche: kein Element und keine Präambel.
  const leer = () => ({ elemente: [], errors: [], praeambel: [], zeilenende: '\n' });

  it('legt eine Form mit Art und Rand an und schreibt sie kanonisch', () => {
    const model = leer();
    fuegeElementEin(
      model,
      erzeugeForm({ id: 's1', x: 10, y: 20, b: 90, h: 90, formArt: 'oval', rand: 'rot' }),
    );
    expect(serializeCanvasFence(model)).toBe('!form s1 x=10 y=20 b=90 h=90 art=oval rand=rot');
    // Die Gegenprobe am Leser: Was der Schreiber baut, liest der Leser zurück.
    expect(parseCanvasFence(serializeCanvasFence(model)).elemente[0]).toMatchObject({
      formArt: 'oval',
      rand: 'rot',
      fuellung: undefined,
    });
  });

  it('schreibt die Vorgaben nicht aus, weil die Abwesenheit sie bereits sagt', () => {
    const model = leer();
    fuegeElementEin(model, erzeugeForm({ id: 's1', x: 0, y: 0, b: 60, h: 60 }));
    fuegeElementEin(model, erzeugeGruppe({ id: 'g1', x: 0, y: 0, b: 200, h: 200 }));
    expect(serializeCanvasFence(model)).toBe(
      '!gruppe g1 x=0 y=0 b=200 h=200\n!form s1 x=0 y=0 b=60 h=60',
    );
  });

  it('setzt eine neue Gruppe ganz hinten, Form und Karte ganz vorn', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=10 h=10');
    fuegeElementEin(model, erzeugeForm({ id: 's1', x: 0, y: 0, b: 60, h: 60 }));
    fuegeElementEin(model, erzeugeGruppe({ id: 'g1', x: 0, y: 0, b: 200, h: 200 }));
    fuegeElementEin(model, { art: 'karte', id: 'k2', attrs: {}, attrFolge: [], inhalt: '' });
    expect(model.elemente.map((e) => e.id)).toEqual(['g1', 'k1', 's1', 'k2']);
  });

  it('vergibt die erste freie Kennung je Art und weicht Belegtem aus', () => {
    const model = parseCanvasFence('!karte s1 x=0 y=0 b=1 h=1\n!linie g1 s1 -> s1');
    expect(freieKennung(model, 'form')).toBe('s2');
    expect(freieKennung(model, 'gruppe')).toBe('g2');
    expect(freieKennung(model, 'karte')).toBe('k1');
  });

  it('löscht ein Element und nimmt die Verbindungen einer Karte mit', () => {
    const model = parseCanvasFence(
      ['!karte k1 x=0 y=0 b=1 h=1', '!form s1 x=0 y=0 b=1 h=1', '!linie e1 k1 -> k1'].join('\n'),
    );
    expect(entferneElement(model, 's1')).toBe(true);
    expect(model.elemente.map((e) => e.id)).toEqual(['k1', 'e1']);
    expect(entferneElement(model, 'k1')).toBe(true);
    expect(model.elemente).toEqual([]);
    expect(entferneElement(model, 'k1')).toBe(false);
  });
});

describe('canvas-elemente — die vier Stapel-Befehle (Story 4S-000932)', () => {
  const bau = () =>
    parseCanvasFence(
      [
        '!karte k1 x=0 y=0 b=1 h=1',
        '!linie e1 k1 -> k1',
        '!form s1 x=0 y=0 b=1 h=1',
        '!gruppe g1 x=0 y=0 b=1 h=1',
      ].join('\n'),
    );
  const folge = (model) => model.elemente.map((e) => e.id).join(',');

  it('kennt genau die vier Befehle in der Reihenfolge der Entscheidung', () => {
    expect(STAPEL_BEFEHLE).toEqual([
      'ganzNachVorn',
      'eineStufeVor',
      'eineStufeZurueck',
      'ganzNachHinten',
    ]);
  });

  it('holt eine Form über eine Karte und stellt sie wieder darunter', () => {
    const model = bau();
    expect(verschiebeImStapel(model, 'k1', 'eineStufeVor')).toBe(true);
    expect(folge(model)).toBe('s1,e1,k1,g1');
    expect(verschiebeImStapel(model, 'k1', 'eineStufeZurueck')).toBe(true);
    expect(folge(model)).toBe('k1,e1,s1,g1');
  });

  it('bringt ein Element ganz nach vorn und ganz nach hinten', () => {
    const model = bau();
    expect(verschiebeImStapel(model, 'k1', 'ganzNachVorn')).toBe(true);
    expect(folge(model)).toBe('e1,s1,g1,k1');
    // Zurück an die hinterste **Stapel**-Stelle: Die Verbindung behält ihren
    // Platz in der Datei, weil sie im Stapel keinen hat.
    expect(verschiebeImStapel(model, 'k1', 'ganzNachHinten')).toBe(true);
    expect(folge(model)).toBe('e1,k1,s1,g1');
  });

  it('lässt Verbindungen unberührt und bewegt sie selbst nicht', () => {
    const model = bau();
    verschiebeImStapel(model, 'g1', 'ganzNachHinten');
    expect(folge(model)).toBe('g1,k1,e1,s1');
    // Die Verbindung liegt in einer eigenen Ebene; sie kennt keinen Platz im
    // Stapel und nimmt auch keinen ein.
    expect(verschiebeImStapel(model, 'e1', 'eineStufeVor')).toBe(false);
    expect(folge(model)).toBe('g1,k1,e1,s1');
  });

  it('meldet die Grenze des Stapels, statt still nichts zu tun', () => {
    const model = bau();
    // k1 liegt schon ganz hinten, g1 schon ganz vorn.
    expect(verschiebeImStapel(model, 'k1', 'eineStufeZurueck')).toBe(false);
    expect(verschiebeImStapel(model, 'k1', 'ganzNachHinten')).toBe(false);
    expect(verschiebeImStapel(model, 'g1', 'eineStufeVor')).toBe(false);
    expect(verschiebeImStapel(model, 'g1', 'ganzNachVorn')).toBe(false);
    expect(verschiebeImStapel(model, 'weg', 'ganzNachVorn')).toBe(false);
    expect(verschiebeImStapel(model, 'k1', 'seitwärts')).toBe(false);
  });

  it('schreibt die neue Reihenfolge, ohne den Rohtext anzufassen (G2)', () => {
    // Eine Umordnung ändert die Stelle und nicht den Text: Ein Element mit
    // normalform-ferner Schreibweise kommt zeichengleich zurück.
    const roh = ['!karte  k1   y=0 x=0 h=1 b=1', '!form  s1 x=0 y=0 b=1 h=1 art="oval"'].join('\n');
    const model = parseCanvasFence(roh);
    expect(verschiebeImStapel(model, 's1', 'ganzNachHinten')).toBe(true);
    expect(model.elemente.every((el) => el.geaendert === false)).toBe(true);
    expect(serializeCanvasFence(model)).toBe(roh.split('\n').reverse().join('\n'));
  });
});

describe('canvas-elemente — Ändern von Art und Farben', () => {
  const form = () => parseCanvasFence('!form s1 x=0 y=0 b=1 h=1').elemente[0];

  it('setzt die Art und schreibt sie in die Marker-Zeile', () => {
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1');
    expect(setzeFormArt(model.elemente[0], 'raute')).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!form s1 x=0 y=0 b=1 h=1 art=raute');
    expect(setzeFormArt(model.elemente[0], 'raute')).toBe(false);
  });

  it('weist eine unbekannte Art zurück, statt sie zu schreiben', () => {
    const el = form();
    expect(setzeFormArt(el, 'wolke')).toBe(false);
    expect(el.formArt).toBe('rechteck');
    expect(el.geaendert).toBe(false);
  });

  it('schreibt die Vorgabe aus, sobald sie eine Wahl war', () => {
    // Wer eine unbekannte Art auf das Rechteck zurücksetzt, soll das in der
    // Datei sehen — sonst bliebe die alte Angabe stehen und widerspräche dem Bild.
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1 art=wolke');
    expect(setzeFormArt(model.elemente[0], 'rechteck')).toBe(true);
    expect(model.elemente[0].artUnbekannt).toBe(false);
    expect(serializeCanvasFence(model)).toBe('!form s1 x=0 y=0 b=1 h=1 art=rechteck');
  });

  it('setzt Rand und Füllung und streicht beide wieder', () => {
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1');
    const el = model.elemente[0];
    expect(setzeFormRand(el, 'rot')).toBe(true);
    expect(setzeFormFuellung(el, 'gelb')).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!form s1 x=0 y=0 b=1 h=1 rand=rot füllung=gelb');
    expect(setzeFormFuellung(el, null)).toBe(true);
    expect(setzeFormRand(el, null)).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!form s1 x=0 y=0 b=1 h=1');
  });

  it('behandelt eine ausdrücklich leere Füllung wie eine fehlende', () => {
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1 füllung=gelb');
    expect(setzeFormFuellung(model.elemente[0], 'keine')).toBe(true);
    expect(model.elemente[0].fuellung).toBeUndefined();
    expect(serializeCanvasFence(model)).toBe('!form s1 x=0 y=0 b=1 h=1');
  });

  it('weist einen Farbnamen außerhalb des Satzes zurück', () => {
    const el = form();
    expect(setzeFormRand(el, 'neongrün')).toBe(false);
    expect(el.geaendert).toBe(false);
  });

  it('setzt die Farbe einer Gruppe', () => {
    const model = parseCanvasFence('!gruppe g1 x=0 y=0 b=1 h=1');
    expect(setzeGruppenFarbe(model.elemente[0], 'türkis')).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!gruppe g1 x=0 y=0 b=1 h=1 farbe=türkis');
    expect(setzeGruppenFarbe(model.elemente[0], 'ocker')).toBe(false);
  });
});

describe('canvas-elemente — Prozess-Neutralität (AK7)', () => {
  it('lädt nur geteilte Module ohne Prozess-Bindung', () => {
    const quelle = readFileSync(
      new URL('../../src/shared/canvas/canvas-elemente.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    // 4T-001746: dazu der geteilte Satz der Bild-Endungen, an dem die Prüfung
    // einer gesetzten Bild-Angabe hängt (G8).
    expect(importe).toEqual(['./canvas-core.js', '../bild-endungen.js', './canvas-geometrie.js']);
  });
});
