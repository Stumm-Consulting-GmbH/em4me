// 4T-002293 (Epic 3E-000349): Unit-Tests des PowerPoint-Containers (AK2 bis
// AK6): Teil-Liste und Inhaltstypen, Beziehungen in beiden Richtungen,
// Wohlgeformtheit jedes XML-Teils, Folien- und Notizen-Größe je Format, Bild
// in voller Folien-Größe, Notizen samt Maskierung und Absatz-Trennung, Folie
// ohne Notizen, Metadaten, Fehlerfälle, Prozessneutralität und eine
// Beispiel-Datei mit zwei Folien gegen die versionierte Erwartung unter
// test/fixtures/presentation/.
//
// Geöffnet wird mit dem unabhängigen Leser zip-leser-helfer.js; die
// Wohlgeformtheit prüft der XML-Leser von jsdom (Entwicklungs-Abhängigkeit).
// Die Erwartungs-Datei ist eine Datei-Momentaufnahme von Vitest: Ändert sich
// eine Vorlage gewollt, wird sie mit `-u` neu geschrieben und ihr Diff
// gelesen, nie blind (Test-README, Snapshot-Regeln).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { JSDOM } from 'jsdom';
import {
  erstellePptx,
  xmlText,
  FOLIEN_FORMATE,
} from '../../src/shared/presentation/pptx-writer.js';
import { zipInhalt } from './zip-leser-helfer.js';

const DOM_PARSER = new new JSDOM('').window.DOMParser();
const ERSTELLT = new Date(Date.UTC(2026, 9, 17, 12, 30, 22, 456));

/** Ein gültiges PNG aus einem Pixel; `farbe` macht die Bilder unterscheidbar. */
function png(farbe) {
  const block = (typ, daten) => {
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(daten.length);
    const typDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
    const pruef = Buffer.alloc(4);
    pruef.writeUInt32BE(crc32(typDaten));
    return Buffer.concat([laenge, typDaten, pruef]);
  };
  const kopf = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const zeile = Buffer.from([0, farbe, 0x80, 0x40]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      block('IHDR', kopf),
      block('IDAT', deflateRawSync(zeile)),
      block('IEND', Buffer.alloc(0)),
    ]),
  );
}

function eingabe(ueber = {}) {
  return {
    folien: [
      { bild: png(10), notizen: ['Notiz zu Folie 1'] },
      { bild: png(20), notizen: [] },
    ],
    format: '16:9',
    titel: 'Vortrag',
    erzeuger: 'EM4me 1.150.0',
    erstellt: ERSTELLT,
    deflate: deflateRawSync,
    ...ueber,
  };
}

function oeffne(e) {
  return zipInhalt(erstellePptx(e));
}

const xml = (teile, name) =>
  DOM_PARSER.parseFromString(teile.get(name).toString('utf8'), 'application/xml');
const attr = (doc, tag, name) => doc.getElementsByTagName(tag)[0].getAttribute(name);
const texte = (doc, tag) => Array.from(doc.getElementsByTagName(tag), (k) => k.textContent);

/** Beziehungen eines `.rels`-Teils mit aufgelösten Ziel-Teilen. */
function beziehungen(teile, relsName) {
  const quelleOrdner = posix.dirname(posix.dirname(relsName));
  return Array.from(xml(teile, relsName).getElementsByTagName('Relationship'), (r) => ({
    id: r.getAttribute('Id'),
    typ: r.getAttribute('Type').split('/').pop(),
    teil: posix.normalize(posix.join(quelleOrdner, r.getAttribute('Target'))),
  }));
}

function relsVon(teil) {
  return posix.join(posix.dirname(teil), '_rels', `${posix.basename(teil)}.rels`);
}

/** Absätze des Platzhalters `body`: Text der Läufe je `a:p`. */
function notizAbsaetze(teile, nr) {
  const doc = xml(teile, `ppt/notesSlides/notesSlide${nr}.xml`);
  const body = Array.from(doc.getElementsByTagName('p:sp')).find(
    (sp) => sp.getElementsByTagName('p:ph')[0].getAttribute('type') === 'body',
  );
  return Array.from(body.getElementsByTagName('a:p'), (p) =>
    Array.from(p.getElementsByTagName('a:t'), (t) => t.textContent).join(''),
  );
}

function teilListe(n) {
  const jeFolie = [];
  for (let i = 1; i <= n; i += 1) {
    jeFolie.push(
      `ppt/slides/slide${i}.xml`,
      `ppt/slides/_rels/slide${i}.xml.rels`,
      `ppt/notesSlides/notesSlide${i}.xml`,
      `ppt/notesSlides/_rels/notesSlide${i}.xml.rels`,
      `ppt/media/image${i}.png`,
    );
  }
  return [
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/core.xml',
    'docProps/app.xml',
    'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels',
    'ppt/presProps.xml',
    'ppt/viewProps.xml',
    'ppt/tableStyles.xml',
    'ppt/theme/theme1.xml',
    'ppt/slideMasters/slideMaster1.xml',
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    'ppt/slideLayouts/slideLayout1.xml',
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    'ppt/theme/theme2.xml',
    'ppt/notesMasters/notesMaster1.xml',
    'ppt/notesMasters/_rels/notesMaster1.xml.rels',
    ...jeFolie,
  ];
}

const DREI = eingabe({
  folien: [
    { bild: png(10), notizen: ['eins'] },
    { bild: png(20), notizen: [] },
    { bild: png(30), notizen: ['zwei', 'drei'] },
  ],
});

describe('Teile, Inhaltstypen und Beziehungen (AK2)', () => {
  it.each([
    ['zwei', eingabe(), 2],
    ['drei', DREI, 3],
  ])('liefert für %s Folien genau die Teil-Liste, Inhaltstypen zuerst', (_n, e, n) => {
    expect([...oeffne(e).keys()]).toEqual(teilListe(n));
  });

  it('gibt jedem Teil einen Inhaltstyp und jeder Überschreibung einen Teil', () => {
    const teile = oeffne(DREI);
    const typen = xml(teile, '[Content_Types].xml');
    const vorgaben = new Map(
      Array.from(typen.getElementsByTagName('Default'), (d) => [
        d.getAttribute('Extension'),
        d.getAttribute('ContentType'),
      ]),
    );
    expect(vorgaben.get('rels')).toBe('application/vnd.openxmlformats-package.relationships+xml');
    expect(vorgaben.get('png')).toBe('image/png');
    const ueber = new Map(
      Array.from(typen.getElementsByTagName('Override'), (o) => [
        o.getAttribute('PartName').slice(1),
        o.getAttribute('ContentType'),
      ]),
    );
    for (const name of ueber.keys()) expect(teile.has(name), name).toBe(true);
    for (const name of teile.keys()) {
      if (name === '[Content_Types].xml') continue;
      const endung = name.split('.').pop();
      if (endung === 'rels' || endung === 'png') expect(ueber.has(name), name).toBe(false);
      else expect(ueber.has(name), name).toBe(true);
    }
    expect(ueber.get('ppt/presentation.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    );
    expect(ueber.get('ppt/slides/slide3.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
    );
    expect(ueber.get('ppt/notesSlides/notesSlide2.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
    );
  });

  it('lässt jede Beziehung auf einen Teil zeigen und erreicht jeden Teil', () => {
    const teile = oeffne(DREI);
    const erreicht = new Set();
    for (const name of teile.keys()) {
      if (!name.endsWith('.rels')) continue;
      const quelle = name === '_rels/.rels' ? null : name.replace(/_rels\/(.*)\.rels$/, '$1');
      if (quelle) expect(teile.has(quelle), `Quelle von ${name}`).toBe(true);
      const ids = new Set();
      for (const b of beziehungen(teile, name)) {
        expect(teile.has(b.teil), `${name} → ${b.teil}`).toBe(true);
        expect(ids.has(b.id), `${name}: ${b.id} doppelt`).toBe(false);
        ids.add(b.id);
        erreicht.add(b.teil);
      }
    }
    const offen = [...teile.keys()].filter(
      (n) => n !== '[Content_Types].xml' && !n.endsWith('.rels') && !erreicht.has(n),
    );
    expect(offen).toEqual([]);
  });

  it('verknüpft Folie, Bild und Notizen-Folie paarweise', () => {
    const teile = oeffne(DREI);
    for (const nr of [1, 2, 3]) {
      const folie = `ppt/slides/slide${nr}.xml`;
      const rels = beziehungen(teile, relsVon(folie));
      expect(rels.map((b) => [b.id, b.typ, b.teil])).toEqual([
        ['rId1', 'slideLayout', 'ppt/slideLayouts/slideLayout1.xml'],
        ['rId2', 'image', `ppt/media/image${nr}.png`],
        ['rId3', 'notesSlide', `ppt/notesSlides/notesSlide${nr}.xml`],
      ]);
      const zurueck = beziehungen(teile, relsVon(`ppt/notesSlides/notesSlide${nr}.xml`));
      expect(zurueck.map((b) => b.teil)).toEqual(['ppt/notesMasters/notesMaster1.xml', folie]);
      expect(attr(xml(teile, folie), 'a:blip', 'r:embed')).toBe('rId2');
    }
  });

  // Befund 4T-002293: Teilen Folien- und Notizen-Master ein Theme, öffnet
  // PowerPoint 16 die Datei nur mit Reparatur (HRESULT 0x80070570).
  it('gibt jedem Master sein eigenes Theme', () => {
    const teile = oeffne(DREI);
    const themeVon = (master) =>
      beziehungen(teile, relsVon(master))
        .filter((b) => b.typ === 'theme')
        .map((b) => b.teil);
    const folienMaster = themeVon('ppt/slideMasters/slideMaster1.xml');
    const notizenMaster = themeVon('ppt/notesMasters/notesMaster1.xml');
    expect(folienMaster).toEqual(['ppt/theme/theme1.xml']);
    expect(notizenMaster).toEqual(['ppt/theme/theme2.xml']);
    const verwendet = new Map();
    for (const name of teile.keys()) {
      if (!name.endsWith('.rels')) continue;
      for (const b of beziehungen(teile, name)) {
        if (b.typ !== 'theme' || name === 'ppt/_rels/presentation.xml.rels') continue;
        verwendet.set(b.teil, [...(verwendet.get(b.teil) || []), name]);
      }
    }
    for (const [theme, quellen] of verwendet) expect(quellen, theme).toHaveLength(1);
  });

  it('führt die Folien in Reihenfolge mit Kennungen ab 256', () => {
    const teile = oeffne(DREI);
    const praes = xml(teile, 'ppt/presentation.xml');
    const ids = Array.from(praes.getElementsByTagName('p:sldId'), (s) => [
      s.getAttribute('id'),
      s.getAttribute('r:id'),
    ]);
    const ziele = new Map(
      beziehungen(teile, 'ppt/_rels/presentation.xml.rels').map((b) => [b.id, b.teil]),
    );
    expect(ids.map(([id]) => id)).toEqual(['256', '257', '258']);
    expect(ids.map(([, rid]) => ziele.get(rid))).toEqual([
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/slide3.xml',
    ]);
    expect(ziele.get(attr(praes, 'p:sldMasterId', 'r:id'))).toBe(
      'ppt/slideMasters/slideMaster1.xml',
    );
    expect(ziele.get(attr(praes, 'p:notesMasterId', 'r:id'))).toBe(
      'ppt/notesMasters/notesMaster1.xml',
    );
  });

  it('schreibt jeden XML-Teil wohlgeformt', () => {
    const titel = `<&>"' \u0001`;
    const teile = oeffne(eingabe({ titel, folien: [{ bild: png(1), notizen: [titel] }] }));
    for (const [name, daten] of teile) {
      if (name.endsWith('.png')) continue;
      const doc = DOM_PARSER.parseFromString(daten.toString('utf8'), 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length, name).toBe(0);
      expect(daten.toString('utf8').startsWith('<?xml version="1.0" encoding="UTF-8"'), name).toBe(
        true,
      );
    }
  });
});

describe('Größen und Bild (AK3)', () => {
  it.each([
    ['16:9', '12192000', '6858000'],
    ['4:3', '9144000', '6858000'],
  ])(
    'setzt bei %s Folien- und Notizen-Größe und das Bild auf die volle Folie',
    (format, cx, cy) => {
      const teile = oeffne(eingabe({ format }));
      const praes = xml(teile, 'ppt/presentation.xml');
      expect([attr(praes, 'p:sldSz', 'cx'), attr(praes, 'p:sldSz', 'cy')]).toEqual([cx, cy]);
      expect([attr(praes, 'p:notesSz', 'cx'), attr(praes, 'p:notesSz', 'cy')]).toEqual([
        '6858000',
        '9144000',
      ]);
      const folie = xml(teile, 'ppt/slides/slide1.xml');
      const pic = folie.getElementsByTagName('p:pic')[0];
      const off = pic.getElementsByTagName('a:off')[0];
      const ext = pic.getElementsByTagName('a:ext')[0];
      expect([off.getAttribute('x'), off.getAttribute('y')]).toEqual(['0', '0']);
      expect([ext.getAttribute('cx'), ext.getAttribute('cy')]).toEqual([cx, cy]);
      expect(pic.getElementsByTagName('a:stretch')[0].firstElementChild.tagName).toBe('a:fillRect');
      expect(attr(folie, 'p:cNvPr', 'name')).toBe('');
      expect(pic.getElementsByTagName('p:cNvPr')[0].getAttribute('name')).toBe('Folie 1');
    },
  );

  it('legt jedes Bild unverändert ab, eines je Folie', () => {
    const e = DREI;
    const teile = oeffne(e);
    const bilder = [...teile.keys()].filter((n) => n.startsWith('ppt/media/'));
    expect(bilder).toEqual([
      'ppt/media/image1.png',
      'ppt/media/image2.png',
      'ppt/media/image3.png',
    ]);
    e.folien.forEach((f, i) => expect(teile.get(bilder[i]).equals(Buffer.from(f.bild))).toBe(true));
  });

  it('übernimmt einen hereingereichten Bild-Namen, maskiert', () => {
    const teile = oeffne(eingabe({ bildName: 'Slide <A>' }));
    const pic = xml(teile, 'ppt/slides/slide2.xml').getElementsByTagName('p:pic')[0];
    expect(pic.getElementsByTagName('p:cNvPr')[0].getAttribute('name')).toBe('Slide <A> 2');
  });

  it('kennt genau die beiden Formate', () => {
    expect(Object.keys(FOLIEN_FORMATE)).toEqual(['16:9', '4:3']);
  });
});

describe('Notizen (AK4)', () => {
  it('schreibt jede Zeile als Absatz und trennt Notizen durch einen leeren Absatz', () => {
    const teile = oeffne(
      eingabe({
        folien: [{ bild: png(1), notizen: ['Erste', 'Zeile 1\r\nZeile 2\rZeile 3\n\nEnde'] }],
      }),
    );
    expect(notizAbsaetze(teile, 1)).toEqual([
      'Erste',
      '',
      'Zeile 1',
      'Zeile 2',
      'Zeile 3',
      '',
      'Ende',
    ]);
  });

  it('maskiert Sonderzeichen und entfernt in XML unzulässige Zeichen', () => {
    const roh = 'a < b && c > "d" \'e\' \u0001\u000B\uFFFE\uD800 Tab\tEnde';
    const teile = oeffne(eingabe({ folien: [{ bild: png(1), notizen: [roh] }] }));
    expect(notizAbsaetze(teile, 1)).toEqual(['a < b && c > "d" \'e\'  Tab\tEnde']);
    const quelle = teile.get('ppt/notesSlides/notesSlide1.xml').toString('utf8');
    expect(quelle).toContain('a &lt; b &amp;&amp; c &gt; &quot;d&quot; &apos;e&apos;');
    expect(quelle).not.toContain('\u0001');
    expect(quelle).not.toContain('\u000B');
    expect(xmlText('\uD83D\uDE00')).toBe('\uD83D\uDE00');
  });

  it('gibt einer Folie ohne Notizen eine Notizen-Folie mit leerem body', () => {
    const teile = oeffne(eingabe());
    expect(teile.has('ppt/notesSlides/notesSlide2.xml')).toBe(true);
    expect(notizAbsaetze(teile, 2)).toEqual(['']);
    const doc = xml(teile, 'ppt/notesSlides/notesSlide2.xml');
    expect(doc.getElementsByTagName('a:r').length).toBe(0);
    expect(notizAbsaetze(teile, 1)).toEqual(['Notiz zu Folie 1']);
  });

  it('setzt die Platzhalter sldImg und body (idx 1) in jede Notizen-Folie', () => {
    const doc = xml(oeffne(eingabe()), 'ppt/notesSlides/notesSlide1.xml');
    const ph = Array.from(doc.getElementsByTagName('p:ph'), (p) => [
      p.getAttribute('type'),
      p.getAttribute('idx'),
    ]);
    expect(ph).toEqual([
      ['sldImg', null],
      ['body', '1'],
    ]);
  });
});

describe('Metadaten (AK5)', () => {
  it('nennt Titel, Erzeuger und Erstellzeit als W3CDTF', () => {
    const teile = oeffne(eingabe({ titel: 'Q3 & <Plan>' }));
    const kern = xml(teile, 'docProps/core.xml');
    expect(texte(kern, 'dc:title')).toEqual(['Q3 & <Plan>']);
    expect(texte(kern, 'dc:creator')).toEqual(['EM4me 1.150.0']);
    expect(texte(kern, 'cp:lastModifiedBy')).toEqual(['EM4me 1.150.0']);
    expect(texte(kern, 'dcterms:created')).toEqual(['2026-10-17T12:30:22Z']);
    expect(texte(kern, 'dcterms:modified')).toEqual(['2026-10-17T12:30:22Z']);
    expect(attr(kern, 'dcterms:created', 'xsi:type')).toBe('dcterms:W3CDTF');
  });

  it('nennt Anwendung, Zahl der Folien und der Folien mit Notizen', () => {
    const app = xml(oeffne(DREI), 'docProps/app.xml');
    expect(texte(app, 'Application')).toEqual(['EM4me 1.150.0']);
    expect(texte(app, 'Slides')).toEqual(['3']);
    expect(texte(app, 'Notes')).toEqual(['2']);
  });
});

describe('Fehlerfälle', () => {
  it.each([
    ['ein unbekanntes Format', { format: '16:10' }, /Format 16:10 unbekannt/],
    ['ein geerbter Schlüssel als Format', { format: 'toString' }, /unbekannt/],
    ['keine Folien', { folien: [] }, /keine Folien/],
    ['Folien ohne Liste', { folien: 'x' }, /keine Folien/],
    [
      'ein Bild ohne PNG-Signatur',
      { folien: [{ bild: new Uint8Array(20), notizen: [] }] },
      /kein PNG/,
    ],
    ['ein Bild als Text', { folien: [{ bild: 'png', notizen: [] }] }, /kein PNG/],
    ['Notizen ohne Liste', { folien: [{ bild: png(1), notizen: 'x' }] }, /keine Liste/],
    [
      'eine Notiz ohne Text',
      { folien: [{ bild: png(1), notizen: ['a', 3] }] },
      /Notiz 2 der Folie 1 ist kein Text/,
    ],
    ['ein Titel ohne Text', { titel: undefined }, /Titel/],
    ['ein leerer Erzeuger', { erzeuger: '' }, /Erzeuger fehlt/],
    ['eine ungültige Erstellzeit', { erstellt: new Date('x') }, /Erstellzeit/],
    ['ein fehlendes deflate', { deflate: undefined }, /deflate fehlt/],
    ['ein leerer Bild-Name', { bildName: '' }, /Bild-Name/],
  ])('weist %s ab', (_fall, ueber, meldung) => {
    expect(() => erstellePptx(eingabe(ueber))).toThrow(meldung);
  });

  it('weist eine fehlende Eingabe ab', () => {
    expect(() => erstellePptx()).toThrow(TypeError);
  });
});

describe('Prozessneutral, ohne Abhängigkeit (AK6)', () => {
  const quelle = (name) =>
    readFileSync(
      fileURLToPath(new URL(`../../src/shared/presentation/${name}`, import.meta.url)),
      'utf8',
    );

  it.each([
    ['zip-writer.js', []],
    ['pptx-templates.js', []],
    ['pptx-writer.js', ['./pptx-templates', './zip-writer']],
  ])('%s lädt nur die Nachbar-Module und greift auf nichts Prozess-Eigenes zu', (name, erlaubt) => {
    const text = quelle(name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const geladen = [...text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => m[1])
      .sort();
    expect(geladen).toEqual(erlaubt);
    // Ohne Zeichenketten geprüft: Die Vorlagen enthalten etwa `val="window"`.
    const code = text.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
    expect(code).not.toMatch(
      /\bimport\b|\bBuffer\b|\bprocess\b|\bdocument\b|\bwindow\b|\belectron\b/,
    );
  });
});

describe('Beispiel-Datei gegen die versionierte Erwartung (AK2)', () => {
  it('hält Teil-Liste und Inhalt jedes Teils fest', async () => {
    const teile = oeffne(
      eingabe({
        folien: [
          { bild: png(10), notizen: ['Begrüßung', 'Zweite Notiz\nmit Zeile <&>'] },
          { bild: png(20), notizen: [] },
        ],
      }),
    );
    const erwartung = {};
    for (const [name, daten] of teile) {
      erwartung[name] = name.endsWith('.png')
        ? `PNG, ${daten.length} Bytes`
        : daten.toString('utf8');
    }
    await expect(`${JSON.stringify(erwartung, null, 2)}\n`).toMatchFileSnapshot(
      '../fixtures/presentation/pptx-zwei-folien.json',
    );
  });
});
