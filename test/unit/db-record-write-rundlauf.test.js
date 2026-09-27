// 4T-001819 (Epic 3E-000254, E3): Der Rundlauf des Datensatz-Schreibwegs — die
// Zeichengleichheit alles Unberührten (AK2), Werte mit Zeilenumbruch und
// Marker-Zeichen (AK5) und der Nachweis an der ausgelieferten Demo-Tabelle
// (AK11).
//
// **Die tragende Zusage dieser Datei ist der zeichengenaue Vergleich.** Ein
// Prüffall, der nur die Zellen eines Datensatzes liest, wäre auch dann grün,
// wenn jede andere Zeile der Datei dabei neu formatiert würde — und genau das
// ist der Fehler, den dieser Schreibweg vermeiden soll: Der Serialisierer des
// Formats ist kanonisch und nicht spuren-treu, und eine Tabellen-Datei ist die
// Datei des Anwenders.
//
// **Gemessen wird am echten Bestand, nicht allein an eigens geschriebenen
// Beispielen.** Eine für den Prüffall geschriebene Datei trägt genau die
// Eigenheiten, an die der Autor gedacht hat; die Demo-Tabelle trägt ihre
// eigenen. Die von Hand verunstalteten Fassungen kommen deshalb zusätzlich und
// nicht anstelle.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ART_AENDERN,
  ART_ANLEGEN,
  ART_LOESCHEN,
  schreibeDatensaetze,
} from '../../src/shared/database/record-write.js';
import { parseRecordBlock } from '../../src/shared/database/record-block.js';
import { datensatzRumpf } from '../../src/shared/database/record-segment.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesungen gehören in den Modulkopf (test/README).
const LIBRARY = fs.readFileSync(path.join(ROOT, 'src', 'demo', 'Library.md'), 'utf8');

// Die Felder der Demo-Tabelle in der Reihenfolge ihrer Definition.
const LIBRARY_FELDER = [
  { name: 'title', type: 'string' },
  { name: 'author', type: 'string' },
  { name: 'pages', type: 'number' },
  { name: 'acquired', type: 'date' },
  { name: 'onLoan', type: 'boolean' },
];

const FELDER = [{ name: 'name' }, { name: 'ort' }, { name: 'menge' }];
const ZAUN = '```';

function datei(zeilen) {
  return zeilen.join('\n');
}

function records(text, felder) {
  const rumpf = datensatzRumpf(text);
  return rumpf === null ? [] : parseRecordBlock(rumpf.rumpf, felder).records;
}

function zellenVon(text, id, felder = FELDER) {
  const record = records(text, felder).find((r) => r.id === id);
  return record === undefined ? null : record.cells.map((zelle) => zelle.text);
}

// Die Zeilen eines Datensatzes in der Datei, samt seiner Anfangs-Zeile.
function bereichVon(text, id, felder) {
  const rumpf = datensatzRumpf(text);
  const gelesen = parseRecordBlock(rumpf.rumpf, felder).records;
  const position = gelesen.findIndex((r) => r.id === id);
  const naechster = gelesen[position + 1];
  const zeilen = rumpf.rumpf.split('\n');
  return {
    von: rumpf.vonZeile + gelesen[position].zeile,
    bis: naechster ? rumpf.vonZeile + naechster.zeile - 1 : rumpf.vonZeile + zeilen.length - 1,
  };
}

// Eine Kopf-Datei aus Zeilen, damit die Zäune ohne Maskierung dastehen.
function kopfDatei(rumpf, zeilenende = '\n') {
  return datei([
    '---',
    'title: Adressen',
    'db-table:',
    '  fields:',
    '    - name: name',
    '      type: string',
    '    - name: ort',
    '      type: string',
    '    - name: menge',
    '      type: number',
    '  lastId: 2',
    '---',
    '',
    '# Adressen',
    '',
    'Prosa vor dem Block.',
    '',
    ZAUN + 'perspective-records',
    ...rumpf,
    ZAUN,
    '',
    'Prosa nach dem Block.',
    '',
  ]).replace(/\n/g, zeilenende);
}

const ZWEI = [
  '|- id="r-00001"',
  '| Anna',
  '| Basel',
  '| 3',
  '|- id="r-00002"',
  '| Bert',
  '| Bern',
  '| 5',
];

// Der zeichengenaue Vergleich alles Unberührten: Jede Zeile vor dem Bereich des
// Datensatzes und jede Zeile hinter ihm ist Zeichen für Zeichen dieselbe.
function unberuehrtGleich(alt, neu, bereich, wachstum = 0) {
  const a = alt.split('\n');
  const n = neu.split('\n');
  expect(Buffer.from(n.slice(0, bereich.von).join('\n'))).toEqual(
    Buffer.from(a.slice(0, bereich.von).join('\n')),
  );
  expect(Buffer.from(n.slice(bereich.bis + 1 + wachstum).join('\n'))).toEqual(
    Buffer.from(a.slice(bereich.bis + 1).join('\n')),
  );
}

describe('Rundlauf: die ausgelieferte Demo-Tabelle (4T-001819, AK11)', () => {
  it('AK11 schreibt die unveränderten Werte eines Datensatzes byte-gleich zurück', () => {
    // Der schärfste Fall: Wer dieselben Werte schreibt, bekommt dieselbe Datei.
    // Jede Normalisierung, jede verschobene Leerzeile und jedes gedrehte
    // Zeilenende fiele hier auf.
    for (const id of ['r-00001', 'r-00012', 'r-00024']) {
      const zellen = zellenVon(LIBRARY, id, LIBRARY_FELDER);
      const { ok, text } = schreibeDatensaetze(LIBRARY, LIBRARY_FELDER, [
        { art: ART_AENDERN, id, zellen },
      ]);
      expect(ok, id).toBe(true);
      expect(Buffer.from(text), id).toEqual(Buffer.from(LIBRARY));
    }
  });

  it('AK2 lässt jedes Byte ausserhalb des Zeilen-Bereichs eines Datensatzes unverändert', () => {
    // Die Eigenschaft über ALLE 24 Datensätze und nicht über einen ausgewählten:
    // Der erste und der letzte sind die Ränder, an denen ein Bereichs-Fehler
    // sichtbar wird, die mittleren zeigen die Verschiebung.
    const alle = records(LIBRARY, LIBRARY_FELDER).map((r) => r.id);
    expect(alle).toHaveLength(24);

    for (const id of alle) {
      const bereich = bereichVon(LIBRARY, id, LIBRARY_FELDER);
      const zellen = zellenVon(LIBRARY, id, LIBRARY_FELDER);
      const { text } = schreibeDatensaetze(LIBRARY, LIBRARY_FELDER, [
        { art: ART_AENDERN, id, zellen: [zellen[0] + ' (neu)', ...zellen.slice(1)] },
      ]);
      unberuehrtGleich(LIBRARY, text, bereich);
      expect(zellenVon(text, id, LIBRARY_FELDER)[0], id).toBe(zellen[0] + ' (neu)');
    }
  });

  it('AK2 hält Prosa, Frontmatter und Zäune beim Anlegen und Löschen', () => {
    const angelegt = schreibeDatensaetze(
      LIBRARY,
      LIBRARY_FELDER,
      [
        {
          art: ART_ANLEGEN,
          id: 'r-00025',
          zellen: ['Neuzugang', 'Jemand', '100', '2026-09-20', ''],
        },
      ],
      { lastId: 25 },
    );
    expect(angelegt.ok).toBe(true);
    // Der Vorspann der Datei bis zum ersten Datensatz ist zeichengleich, bis
    // auf die eine Zeile des Hochwasserstands.
    const alt = LIBRARY.split('\n');
    const neu = angelegt.text.split('\n');
    expect(neu.filter((zeile, i) => zeile !== alt[i]).slice(0, 1)).toEqual(['  lastId: 25']);
    expect(angelegt.text.split('\n').slice(-5)).toEqual(LIBRARY.split('\n').slice(-5));

    const geloescht = schreibeDatensaetze(LIBRARY, LIBRARY_FELDER, [
      { art: ART_LOESCHEN, id: 'r-00012' },
    ]);
    const bereich = bereichVon(LIBRARY, 'r-00012', LIBRARY_FELDER);
    unberuehrtGleich(LIBRARY, geloescht.text, bereich, -(bereich.bis - bereich.von + 1));
    expect(records(geloescht.text, LIBRARY_FELDER)).toHaveLength(23);
  });
});

describe('Rundlauf: von Hand verunstaltete Fassungen (4T-001819, AK2)', () => {
  it('AK2 hält die Zeilenenden einer CRLF-Datei, auch an den neuen Zeilen', () => {
    const vorher = kopfDatei(ZWEI, '\r\n');
    const { ok, text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Chur', '9'] },
      { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla', 'Davos', '7'] },
    ]);

    expect(ok).toBe(true);
    // Keine einzige nackte Zeilenschaltung: Die neuen Zeilen folgen der
    // Konvention der Datei und nicht der des Serialisierers.
    expect(
      text
        .split('\n')
        .slice(0, -1)
        .every((zeile) => zeile.endsWith('\r')),
    ).toBe(true);
    expect(text.replace(/\r\n/g, '\n')).toBe(
      schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
        { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Chur', '9'] },
        { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla', 'Davos', '7'] },
      ]).text,
    );
    // Und der Wagenrücklauf landet nicht im Wert.
    expect(zellenVon(text.replace(/\r\n/g, '\n'), 'r-00002')).toEqual(['Bert', 'Bern', '5']);
  });

  it('AK2 kommt ohne abschließende Zeilenschaltung aus', () => {
    const vorher = kopfDatei(ZWEI).replace(/\n+$/, '');
    const { ok, text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Chur', '9'] },
    ]);

    expect(ok).toBe(true);
    expect(text.endsWith('Prosa nach dem Block.')).toBe(true);
    unberuehrtGleich(vorher, text, bereichVon(vorher, 'r-00002', FELDER));
  });

  it('AK2 lässt überzählige Leerzeilen und abweichenden Trennabstand stehen', () => {
    const verunstaltet = [
      '',
      '',
      '|- id="r-00001"',
      '| Anna',
      '| Basel',
      '| 3',
      '',
      '',
      '|- id="r-00002"',
      '| Bert',
      '| Bern',
      '| 5',
      '',
    ];
    const vorher = kopfDatei(verunstaltet);
    const { ok, text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Chur', '9'] },
    ]);

    expect(ok).toBe(true);
    unberuehrtGleich(vorher, text, bereichVon(vorher, 'r-00001', FELDER));
    // Der Trennabstand des Anwenders bleibt, wie er ist: zwei Leerzeilen.
    expect(text).toContain('| 9\n\n\n|- id="r-00002"');
  });

  it('AK2 lässt eine Zeile mit Parser-Befund zeichengleich stehen', () => {
    const mitBefund = ['loser Text vor allem', ...ZWEI, '|- id="xyz"', '| unbrauchbare Kennung'];
    const vorher = kopfDatei(mitBefund);
    const { ok, text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Chur', '9'] },
    ]);

    expect(ok).toBe(true);
    expect(text).toContain('loser Text vor allem\n|- id="r-00001"');
    expect(text).toContain('|- id="xyz"\n| unbrauchbare Kennung');
    unberuehrtGleich(vorher, text, bereichVon(vorher, 'r-00002', FELDER));
  });

  it('AK5 hält einen Wert mit Zeilenumbruch über den Rundlauf', () => {
    const mehrzeilig = [
      '|- id="r-00001"',
      '| Anna',
      '| Beispielweg 3',
      '4051 Basel',
      '| 3',
      ...ZWEI.slice(4),
    ];
    const vorher = kopfDatei(mehrzeilig);
    expect(zellenVon(vorher, 'r-00001')[1]).toBe('Beispielweg 3\n4051 Basel');

    const gleich = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: zellenVon(vorher, 'r-00001') },
    ]);
    expect(Buffer.from(gleich.text)).toEqual(Buffer.from(vorher));

    // Und ein neu geschriebener mehrzeiliger Wert kommt gelesen zurück.
    const neu = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Weg 7\n3011 Bern', '5'] },
    ]);
    expect(zellenVon(neu.text, 'r-00002')).toEqual(['Bert', 'Weg 7\n3011 Bern', '5']);
    unberuehrtGleich(vorher, neu.text, bereichVon(vorher, 'r-00002', FELDER), 1);
  });

  it('AK5 maskiert eine Folgezeile, die mit einem Marker-Zeichen beginnt', () => {
    // E3.4: Spalte 0 entscheidet, der Rückstrich ist der eine Weg daran vorbei.
    // Ohne Maskierung öffnete die zweite Zeile des Wertes eine neue Zelle.
    const werte = ['| beginnt mit Marker', '! auch das', '\\| schon maskiert', 'harmlos'];
    for (const wert of werte) {
      const { ok, text } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
        { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Basel\n' + wert, '3'] },
      ]);
      expect(ok, wert).toBe(true);
      expect(zellenVon(text, 'r-00001'), wert).toEqual(['Anna', 'Basel\n' + wert, '3']);
      expect(records(text, FELDER), wert).toHaveLength(2);
    }
  });

  it('AK5 hält eine vorgefundene Maskierung zeichengleich', () => {
    const maskiert = [
      '|- id="r-00001"',
      '| Anna',
      '| Basel',
      '\\| beginnt mit Marker',
      '\\\\| zwei Striche',
      '\\frac{1}{2}',
      '| 3',
      ...ZWEI.slice(4),
    ];
    const vorher = kopfDatei(maskiert);
    const { text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: zellenVon(vorher, 'r-00001') },
    ]);
    expect(Buffer.from(text)).toEqual(Buffer.from(vorher));
  });

  it('AK7 unterscheidet den leeren Wert von der fehlenden Zelle', () => {
    // Ein leerer Wert steht als nackter Marker da und ist eine Zelle; eine
    // fehlende Zelle gibt es gar nicht. Beides kommt unverändert zurück.
    const leer = ['|- id="r-00001"', '| Anna', '|', '| 3'];
    const fehlend = ['|- id="r-00002"', '| Bert'];
    const vorher = kopfDatei([...leer, ...fehlend]);

    expect(zellenVon(vorher, 'r-00001')).toEqual(['Anna', '', '3']);
    expect(zellenVon(vorher, 'r-00002')).toEqual(['Bert']);

    const { text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', '', '3'] },
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert'] },
    ]);
    expect(Buffer.from(text)).toEqual(Buffer.from(vorher));
  });
});

// --- 4T-001821: die Eigenschaft an einer leerzeilen-getrennten Tabelle -------------------

// **Die Demo-Tabelle deckt diesen Fall nachweislich nicht ab:** Sie trennt ihre
// Datensätze nicht durch Leerzeilen (nachgeprüft im Fall unten). Genau in dieser
// Lücke saß die Verdopplung des Trennabstands, und deshalb bekommt die
// Eigenschaft «jedes Byte außerhalb des Zeilen-Bereichs bleibt» hier eine
// eigene Fixture mit mehreren Feldern und trennenden Leerzeilen.

const ABSTAND_FELDER = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

const ABSTAND_DATEI = datei([
  '---',
  'title: Mit Abstand',
  'db-table:',
  '  fields:',
  '    - name: a',
  '    - name: b',
  '    - name: c',
  '  lastId: 3',
  '---',
  '',
  '# Mit Abstand',
  '',
  'Prosa vor dem Block.',
  '',
  ZAUN + 'perspective-records',
  '|- id="r-00001"',
  '| eins',
  '| zwei',
  '| drei',
  '',
  '|- id="r-00002"',
  '| vier',
  '| fuenf',
  '| sechs',
  '',
  '',
  '|- id="r-00003"',
  '| sieben',
  '| acht',
  '| neun',
  '',
  ZAUN,
  '',
  'Prosa nach dem Block.',
  '',
]);

describe('Rundlauf: Zeichengleichheit an leerzeilen-getrennten Datensätzen (4T-001821)', () => {
  it('belegt, dass die Demo-Tabelle diesen Fall nicht trägt', () => {
    // Die Begründung für die eigene Fixture, als Prüffall statt als Behauptung:
    // Im Datensatz-Block der Demo-Tabelle steht keine Leerzeile.
    const rumpf = datensatzRumpf(LIBRARY);
    expect(rumpf).not.toBeNull();
    expect(rumpf.rumpf.split('\n').some((zeile) => zeile.trim() === '')).toBe(false);
  });

  it('hält jedes Byte außerhalb des Zeilen-Bereichs des berührten Datensatzes', () => {
    for (const id of ['r-00001', 'r-00002', 'r-00003']) {
      const bereich = bereichVon(ABSTAND_DATEI, id, ABSTAND_FELDER);
      const { ok, text } = schreibeDatensaetze(ABSTAND_DATEI, ABSTAND_FELDER, [
        { art: ART_AENDERN, id, zellen: ['GEAENDERT'] },
      ]);
      expect(ok, id).toBe(true);

      const vorherZeilen = ABSTAND_DATEI.split('\n');
      const nachherZeilen = text.split('\n');
      // Gleiche Zeilen-Zahl: Der Trennabstand ist weder gewachsen noch
      // geschrumpft.
      expect(nachherZeilen.length, id).toBe(vorherZeilen.length);
      for (let i = 0; i < vorherZeilen.length; i += 1) {
        if (i >= bereich.von && i <= bereich.bis) continue;
        expect(nachherZeilen[i], `${id}, Zeile ${i}`).toBe(vorherZeilen[i]);
      }
      // Und im Bereich selbst steht genau die eine geänderte Zelle.
      expect(zellenVon(text, id, ABSTAND_FELDER).slice(0, 2), id).toEqual([
        'GEAENDERT',
        zellenVon(ABSTAND_DATEI, id, ABSTAND_FELDER)[1],
      ]);
    }
  });

  it('bleibt bei einem Schreibvorgang ohne geänderten Wert zeichengleich', () => {
    for (const id of ['r-00001', 'r-00002', 'r-00003']) {
      const { text } = schreibeDatensaetze(ABSTAND_DATEI, ABSTAND_FELDER, [
        { art: ART_AENDERN, id, zellen: [] },
      ]);
      expect(Buffer.from(text), id).toEqual(Buffer.from(ABSTAND_DATEI));
    }
  });
});

// --- 4T-001833 (Epic 3E-000254): Zaun-Zeilen in Werten über den Rundlauf -------------

// Eine von Hand geschriebene Kopf-Datei mit längerem Zaun, wie sie vor 4T-001833
// auch der Schreibweg selbst erzeugte. Aus Zeilen gebaut, damit die inneren
// Zaun-Zeilen unmaskiert dastehen.
function handDatei(zaun, rumpf) {
  return datei([
    '---',
    'title: Adressen',
    'db-table:',
    '  fields:',
    '    - name: name',
    '      type: string',
    '    - name: ort',
    '      type: string',
    '    - name: menge',
    '      type: number',
    '  lastId: 3',
    '---',
    '',
    'Prosa vor dem Block.',
    '',
    zaun + 'perspective-records',
    ...rumpf,
    zaun,
    '',
    'Prosa nach dem Block.',
    '',
  ]);
}

describe('Rundlauf: Zaun-Zeilen in Werten (4T-001833, AK5, B3)', () => {
  // 4T-001833: Nachweis 7, schreiben, erneut lesen, kein Datensatz fehlt.
  it('AK5 schreibt eine Zaun-Zeile maskiert, der Zaun bleibt drei, nichts fehlt', () => {
    const vorher = kopfDatei(ZWEI);
    const wert = 'Basel\n```\n~~~';
    const erster = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', wert, '3'] },
    ]);
    expect(erster.ok).toBe(true);
    expect(erster.zaun).toBeNull();
    expect(erster.text.split('\n').filter((z) => /^\s{0,3}(`{3,}|~{3,})/.test(z))).toEqual([
      ZAUN + 'perspective-records',
      ZAUN,
    ]);
    expect(records(erster.text, FELDER).map((r) => r.id)).toEqual(['r-00001', 'r-00002']);
    expect(zellenVon(erster.text, 'r-00001')).toEqual(['Anna', wert, '3']);
    unberuehrtGleich(vorher, erster.text, bereichVon(vorher, 'r-00001', FELDER), 2);

    // Ein zweiter Schreibvorgang auf dem Ergebnis: Der Datensatz HINTER dem
    // Wert mit den Zaun-Zeilen ist erreichbar, und der erste bleibt, wie er ist.
    const zweiter = schreibeDatensaetze(erster.text, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Bern', '6'] },
    ]);
    expect(zweiter.ok).toBe(true);
    expect(zweiter.zaun).toBeNull();
    expect(zellenVon(zweiter.text, 'r-00001')).toEqual(['Anna', wert, '3']);
    expect(zellenVon(zweiter.text, 'r-00002')).toEqual(['Bert', 'Bern', '6']);
    unberuehrtGleich(erster.text, zweiter.text, bereichVon(erster.text, 'r-00002', FELDER));
  });

  // 4T-001833: Nachweis 7, die Hand-Datei mit längerem Zaun (B3).
  it('B3 lässt den längeren Zaun einer Hand-Datei stehen und alles Unberührte gleich', () => {
    const vorher = handDatei('````', [
      '|- id="r-00001"',
      '| Anna',
      '| Basel',
      ZAUN,
      'code',
      ZAUN,
      '| 3',
      '|- id="r-00002"',
      '| Bert',
      '| Bern',
      '| 5',
      '|- id="r-00003"',
      '| Carla',
      '| Chur',
      '| 7',
    ]);
    // Vorbedingung: Der Leser findet alle drei Datensätze hinter der inneren
    // kürzeren Zaun-Zeile (AK2).
    expect(records(vorher, FELDER).map((r) => r.id)).toEqual(['r-00001', 'r-00002', 'r-00003']);

    const { ok, text, zaun } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Bern', '9'] },
    ]);
    expect(ok).toBe(true);
    expect(zaun).toBeNull();
    expect(text).toContain('\n````perspective-records\n');
    expect(text).toContain('\n````\n\nProsa nach dem Block.');
    unberuehrtGleich(vorher, text, bereichVon(vorher, 'r-00002', FELDER));
    expect(zellenVon(text, 'r-00001')).toEqual(['Anna', `Basel\n${ZAUN}\ncode\n${ZAUN}`, '3']);
    expect(zellenVon(text, 'r-00002')).toEqual(['Bert', 'Bern', '9']);
    expect(zellenVon(text, 'r-00003')).toEqual(['Carla', 'Chur', '7']);
  });
});
