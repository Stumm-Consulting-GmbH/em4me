// 4T-001833 (Epic 3E-000254): Unit-Tests des Segment-Moduls
// (src/shared/database/record-segment.js) — wo der Datensatz-Block einer Datei
// beginnt und wo er endet.
//
// **Warum eine eigene Prüfdatei.** Bis 4T-001833 deckte allein die Erfassung
// des Index-Bestands das Modul mittelbar ab, und keiner ihrer Fälle trug einen
// Zaun, der länger war als drei Zeichen. Genau dort lag der Fehler: Der Leser
// beendete den Block an der ersten Zaun-Zeile mit demselben ZEICHEN und
// verglich die LÄNGE nicht, sodass jeder Datensatz hinter einer inneren,
// kürzeren Zaun-Zeile verschwand.
//
// **Gemessen wird an der realen Gestalt**: Kopf-Datei mit Definition im
// Frontmatter, Prosa vor und hinter dem Block; Folge-Segment mit
// Zuordnungs-Zeile. Der Nachweis läuft jeweils über `datensatzRumpf` UND
// `parseRecordBlock`, denn erst beide zusammen sagen, ob ein Datensatz fehlt.
import { describe, it, expect } from 'vitest';
import {
  ROLLE_KOPF,
  ROLLE_FOLGE,
  datensatzRumpf,
  folgeRumpf,
} from '../../src/shared/database/record-segment.js';
import { parseRecordBlock } from '../../src/shared/database/record-block.js';

// Drei Felder in fester Reihenfolge; die Reihenfolge IST der Vertrag (E3.3).
const FELDER = [{ name: 'name' }, { name: 'ort' }, { name: 'menge' }];

// Eine Kopf-Datei aus Zeilen, damit die Zäune ohne Maskierung dastehen.
function kopfDatei(zaun, rumpf, vorBlock = []) {
  return [
    '---',
    'title: Adressen',
    'db-table:',
    '  fields:',
    '    - name: name',
    '    - name: ort',
    '    - name: menge',
    '---',
    '',
    '# Adressen',
    '',
    'Prosa vor dem Block.',
    '',
    ...vorBlock,
    zaun + 'perspective-records',
    ...rumpf,
    zaun,
    '',
    'Prosa nach dem Block.',
    '',
  ].join('\n');
}

// Ein Folge-Segment: keine Marke `db-table`, dafür die Zuordnungs-Zeile, und
// der Rumpf beginnt unmittelbar mit einem Datensatz-Marker (E26.3).
function folgeSegment(rumpf) {
  return ['---', 'doc-part: v1|2|Adressen', 'db-fields: name | ort | menge', '---', ...rumpf].join(
    '\n',
  );
}

// Drei Datensätze; der mittlere trägt einen Wert mit Zaun-Zeilen, damit die
// Stelle VOR und HINTER weiteren Datensätzen liegt.
function dreiSaetze(innen) {
  return [
    '|- id="r-00001"',
    '| Anna',
    '| Basel',
    '| 3',
    '|- id="r-00002"',
    '| Bert',
    '| Bern',
    ...innen,
    '| 5',
    '|- id="r-00003"',
    '| Carla',
    '| Chur',
    '| 7',
  ];
}

// Liest eine Datei wie jeder Verbraucher: Rumpf herausschneiden, dann parsen.
function lies(text) {
  const rumpf = datensatzRumpf(text);
  if (rumpf === null) return null;
  return { ...rumpf, ...parseRecordBlock(rumpf.rumpf, FELDER) };
}

function kennungen(gelesen) {
  return gelesen.records.map((r) => r.id);
}

function zaunBefunde(gelesen) {
  return gelesen.hints.filter((h) => h.code === 'recordFenceLine').map((h) => h.record);
}

describe('Segment-Modul: Kopf-Datei mit gewachsenem Zaun (4T-001833, AK1, AK2)', () => {
  // 4T-001833: Nachweis 1, vier Backticks als Zaun, drei im Wert.
  it('liest den ganzen Rumpf hinter einer inneren kürzeren Backtick-Zeile', () => {
    const rumpf = dreiSaetze(['```', 'code', '```']);
    const text = kopfDatei('````', rumpf);
    const gelesen = lies(text);

    expect(gelesen.rolle).toBe(ROLLE_KOPF);
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(text.split('\n')[gelesen.vonZeile]).toBe('|- id="r-00001"');
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(gelesen.records[1].cells[1].text).toBe('Bern\n```\ncode\n```');
    // Der Befund steht am richtigen Datensatz, je Zeile einmal.
    expect(zaunBefunde(gelesen)).toEqual([1, 1]);
  });

  // 4T-001833: Nachweis 2, dieselbe Lage mit Tilden.
  it('liest den ganzen Rumpf hinter einer inneren kürzeren Tilden-Zeile', () => {
    const rumpf = dreiSaetze(['~~~', 'code', '~~~']);
    const gelesen = lies(kopfDatei('~~~~', rumpf));
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(zaunBefunde(gelesen)).toEqual([1, 1]);
  });

  // 4T-001833: Nachweis 2, gemischt; ein anderes Zeichen schließt nie.
  it('lässt eine Tilden-Zeile einen Backtick-Zaun nicht schließen, auch wenn länger', () => {
    const rumpf = dreiSaetze(['~~~~', 'code', '~~~~~']);
    const gelesen = lies(kopfDatei('```', rumpf));
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
  });

  // 4T-001833: Nachweis 3, eine Sprach-Angabe schließt nie (AK1).
  it('lässt eine Zaun-Zeile mit Sprach-Angabe nicht schließen, auch wenn lang genug', () => {
    const rumpf = dreiSaetze(['`````js', 'code']);
    const gelesen = lies(kopfDatei('````', rumpf));
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(zaunBefunde(gelesen)).toEqual([1]);

    // Und dasselbe beim kürzesten Zaun, wo die Zeile gleich lang ist.
    const kurz = dreiSaetze(['```js', 'code']);
    expect(kennungen(lies(kopfDatei('```', kurz)))).toEqual(['r-00001', 'r-00002', 'r-00003']);
  });

  // 4T-001833: Die schließende Zeile darf länger sein und Leerraum tragen.
  it('schließt mit einer längeren Zaun-Zeile und mit Leerraum dahinter', () => {
    const rumpf = dreiSaetze([]);
    const laenger = kopfDatei('```', rumpf).replace('\n```\n\nProsa', '\n`````   \n\nProsa');
    expect(lies(laenger).rumpf).toBe(rumpf.join('\n'));
  });

  // 4T-001833: AK8, die Datei im Bestands-Format liest sich unverändert.
  it('liest eine Datei mit drei Backticks und ohne Zaun-Zeilen im Wert wie bisher', () => {
    const rumpf = dreiSaetze([]);
    const gelesen = lies(kopfDatei('```', rumpf));
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(gelesen.hints).toEqual([]);
  });
});

describe('Segment-Modul: fremder Code-Block vor dem Datensatz-Block (4T-001833, AK3)', () => {
  // 4T-001833: Nachweis 4, der fremde Block wird nach derselben Regel übersprungen.
  it('überspringt einen fremden Block mit längerem Zaun samt innerer kürzerer Zeile', () => {
    const rumpf = dreiSaetze([]);
    const fremd = ['`````md', '```', '|- id="r-09999"', '`````', ''];
    const gelesen = lies(kopfDatei('```', rumpf, fremd));
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
  });

  // 4T-001833: Auch eine Sprach-Angabe schließt den fremden Block nicht.
  it('lässt eine Zeile mit Sprach-Angabe den fremden Block nicht schließen', () => {
    const rumpf = dreiSaetze([]);
    const fremd = ['~~~', '~~~perspective-records', '|- id="r-09999"', '~~~', ''];
    const gelesen = lies(kopfDatei('```', rumpf, fremd));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
  });
});

describe('Segment-Modul: Folge-Segment (4T-001833, AK4, B5)', () => {
  // 4T-001833: Nachweis 5a, das mittlere Segment trägt keinen Zaun.
  it('liest ein mittleres Segment ohne Zaun bis zum Datei-Ende', () => {
    const rumpf = dreiSaetze([]);
    const gelesen = lies(folgeSegment([...rumpf, '']));
    expect(gelesen.rolle).toBe(ROLLE_FOLGE);
    expect(gelesen.rumpf).toBe([...rumpf, ''].join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(gelesen.hints).toEqual([]);
  });

  // 4T-001833: Nachweis 5b, eine Zaun-Zeile im Wert beendet nicht.
  it('schließt allein an der letzten Zeile, nicht an einer Zaun-Zeile im Wert', () => {
    const rumpf = dreiSaetze(['```', 'code', '```']);
    const text = folgeSegment([...rumpf, '```', '']);
    const gelesen = lies(text);
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(gelesen.records[1].cells[1].text).toBe('Bern\n```\ncode\n```');
    expect(zaunBefunde(gelesen)).toEqual([1, 1]);
  });

  // 4T-001833: Nachweis 5c, eine letzte Zeile mit Sprach-Angabe schließt nicht.
  it('liest eine letzte Zaun-Zeile mit Sprach-Angabe als Inhalt, mit Befund', () => {
    const rumpf = dreiSaetze([]);
    const text = folgeSegment([...rumpf, '```js']);
    const gelesen = lies(text);
    expect(gelesen.rumpf).toBe([...rumpf, '```js'].join('\n'));
    expect(kennungen(gelesen)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(gelesen.records[2].cells[2].text).toBe('7\n```js');
    expect(zaunBefunde(gelesen)).toEqual([2]);
  });

  // 4T-001833: Nachweis 5d, Leerzeilen hinter dem schließenden Zaun.
  it('schließt an der letzten nicht-leeren Zeile, auch hinter Leerzeilen', () => {
    const rumpf = dreiSaetze([]);
    const text = folgeSegment([...rumpf, '~~~~', '', '   ', '']);
    const gelesen = lies(text);
    expect(gelesen.rumpf).toBe(rumpf.join('\n'));
    expect(gelesen.hints).toEqual([]);
  });

  // 4T-001833: Die Grenze in Zeilen, wie die Bereichs-Suche sie nimmt.
  it('liefert die Grenzen in Zeilen der Datei', () => {
    const zeilen = ['---', 'doc-part: v1|2|Adressen', '---', '|- id="r-00001"', '| A', '```', ''];
    expect(folgeRumpf(zeilen, 3)).toEqual({ von: 3, bis: 5 });
    expect(folgeRumpf(zeilen.slice(0, 5), 3)).toEqual({ von: 3, bis: 5 });
    expect(folgeRumpf([...zeilen.slice(0, 5), '```text'], 3)).toEqual({ von: 3, bis: 6 });
  });
});
