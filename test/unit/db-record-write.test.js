// 4T-001819 (Epic 3E-000254, E3, E5.1): Unit-Tests des Zurückschreibens von
// Datensatz-Zeilen — die drei Operationen einzeln und gemeinsam (AK1), die
// weichen Fälle des Formats (AK7), beide Rollen einer Datei (AK4), das
// Fortschreiben des Hochwasserstands (AK3), die mitwachsende Fence-Länge (AK6),
// der Befund auf eine unbekannte Kennung (AK9) und die Wächter über
// Prozess-Neutralität und den einen Parser (AK8, AK10).
//
// Die Zeichengleichheit alles Unberührten (AK2, AK5, AK11) prüft die
// Schwester-Datei db-record-write-rundlauf.test.js; getrennt, weil dort jeder
// Fall denselben Gegenstand hat und hier jeder einen eigenen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ART_ANLEGEN,
  ART_AENDERN,
  ART_LOESCHEN,
  schreibeDatensaetze,
  schreibeHochwasserstand,
  zellTexte,
} from '../../src/shared/database/record-write.js';
import { parseRecordBlock } from '../../src/shared/database/record-block.js';
import { datensatzRumpf } from '../../src/shared/database/record-segment.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// Bestands-Lesungen gehören in den Modulkopf (test/README).
const QUELLE = fs.readFileSync(
  path.join(ROOT, 'src', 'shared', 'database', 'record-write.js'),
  'utf8',
);

// Die Wächter messen den CODE und nicht die Prosa darüber: Der Kopf-Kommentar
// nennt gerade das, was NICHT entstehen soll, und ein Wächter, der darüber
// stolperte, verböte die Begründung statt der Sache.
const CODE = QUELLE.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map((zeile) => (zeile.trimStart().startsWith('//') ? '' : zeile))
  .join('\n');

// Drei Felder in fester Reihenfolge; die Reihenfolge IST der Vertrag (E3.3).
const FELDER = [{ name: 'name' }, { name: 'ort' }, { name: 'menge' }];

const ZAUN = '```';

function datei(zeilen) {
  return zeilen.join('\n');
}

// Eine Kopf-Datei mit Definition, Prosa vor und nach dem Block und zwei
// Datensätzen. Aufgebaut aus Zeilen statt aus einer Vorlage, damit die Zäune
// ohne Maskierung dastehen.
function kopfDatei(rumpf, kopfZusatz = ['  lastId: 2']) {
  return datei([
    '---',
    'title: Adressen',
    'db-table:',
    '  name: Adressen',
    '  fields:',
    '    - name: name',
    '      type: string',
    '    - name: ort',
    '      type: string',
    '    - name: menge',
    '      type: number',
    ...kopfZusatz,
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
  ]);
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

// Ein Folge-Segment: Es trägt die Marke `db-table` nicht, sondern die
// Zuordnungs-Zeile, und beginnt hinter seinem Frontmatter unmittelbar mit
// Datensätzen (E26.3).
function folgeSegment(rumpf) {
  return datei([
    '---',
    'doc-part: v1|2|Adressen',
    'db-fields: name | ort | menge',
    '---',
    ...rumpf,
  ]);
}

// Die Datensätze einer Datei, wie sie nach dem Schreiben dastehen.
function gelesen(text) {
  const rumpf = datensatzRumpf(text);
  return rumpf === null ? [] : parseRecordBlock(rumpf.rumpf, FELDER).records;
}

function zellenVon(text, id) {
  const record = gelesen(text).find((r) => r.id === id);
  return record === undefined ? null : record.cells.map((zelle) => zelle.text);
}

describe('Datensatz-Schreibweg: die drei Operationen (4T-001819, AK1)', () => {
  it('AK1 ändert die Zellen eines vorhandenen Datensatzes', () => {
    const vorher = kopfDatei(ZWEI);
    const { ok, text, ergebnisse } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Chur', '9'] },
    ]);

    expect(ok).toBe(true);
    expect(zellenVon(text, 'r-00002')).toEqual(['Bert', 'Chur', '9']);
    expect(zellenVon(text, 'r-00001')).toEqual(['Anna', 'Basel', '3']);
    // Die Zeile im NEUEN Text, damit der Aufrufer den Datensatz anspringen kann.
    expect(text.split('\n')[ergebnisse[0].zeile]).toBe('|- id="r-00002"');
  });

  it('AK1 legt einen Datensatz am Ende des Rumpfes an, mit einer Zelle je Feld', () => {
    const { ok, text } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla'] },
    ]);

    expect(ok).toBe(true);
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    // Die fehlenden Werte stehen als leere Zellen da: Die positionsbasierte
    // Zuordnung trägt damit auch dann noch, wenn die letzten Werte leer sind.
    expect(zellenVon(text, 'r-00003')).toEqual(['Carla', '', '']);
  });

  it('AK1 löscht einen Datensatz samt seiner trennenden Leerzeile', () => {
    const mitAbstand = [...ZWEI.slice(0, 4), '', ...ZWEI.slice(4)];
    const { ok, text } = schreibeDatensaetze(kopfDatei(mitAbstand), FELDER, [
      { art: ART_LOESCHEN, id: 'r-00001' },
    ]);

    expect(ok).toBe(true);
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00002']);
    // Keine verwaiste Leerzeile am Blockanfang: Sie hat den Datensatz getrennt
    // und gehört keinem Wert.
    expect(text).toContain(ZAUN + 'perspective-records\n|- id="r-00002"');
  });

  it('AK1 nimmt mehrere Operationen in einem Durchgang an', () => {
    const drei = [...ZWEI, '|- id="r-00003"', '| Carla', '| Chur', '| 7'];
    const { ok, text, ergebnisse } = schreibeDatensaetze(kopfDatei(drei), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Bern', '4'] },
      { art: ART_LOESCHEN, id: 'r-00002' },
      { art: ART_ANLEGEN, id: 'r-00004', zellen: ['Dora', 'Davos', '1'] },
    ]);

    expect(ok).toBe(true);
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001', 'r-00003', 'r-00004']);
    expect(zellenVon(text, 'r-00001')).toEqual(['Anna', 'Bern', '4']);
    // Ein Ergebnis je Operation, in ihrer Reihenfolge; das Löschen nennt keine
    // Zeile, weil es keine mehr gibt.
    expect(ergebnisse.map((e) => e.art)).toEqual([ART_AENDERN, ART_LOESCHEN, ART_ANLEGEN]);
    expect(ergebnisse[1].zeile).toBeNull();
    for (const ergebnis of [ergebnisse[0], ergebnisse[2]])
      expect(text.split('\n')[ergebnis.zeile]).toBe(`|- id="${ergebnis.id}"`);
  });

  it('AK1 findet Anlegen und Ändern desselben Datensatzes in einem Lauf zusammen', () => {
    // Die Zeilen-Bereiche werden in EINEM Durchgang berechnet (B1); der zweite
    // Auftrag arbeitet deshalb auf dem noch nicht geschriebenen Datensatz und
    // nicht auf einer Zeilen-Nummer, die der erste verschoben hat.
    const { ok, text, ergebnisse } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla', 'Chur', '7'] },
      { art: ART_AENDERN, id: 'r-00003', zellen: ['Carla', 'Chur', '8'] },
    ]);

    expect(ok).toBe(true);
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(zellenVon(text, 'r-00003')).toEqual(['Carla', 'Chur', '8']);
    expect(ergebnisse.map((e) => e.zeile)).toEqual([ergebnisse[0].zeile, ergebnisse[0].zeile]);
  });

  it('AK1 nimmt die kurze Schreibweise der Kennung an und schreibt die aufgefüllte', () => {
    // E5.1: Gelesen werden beide Schreibweisen; ein Aufrufer mit `r-2` fände
    // sonst das `r-00002` der Datei nicht.
    const { ok, text } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_AENDERN, id: 'r-2', zellen: ['Bert', 'Chur', '9'] },
    ]);
    expect(ok).toBe(true);
    expect(zellenVon(text, 'r-00002')).toEqual(['Bert', 'Chur', '9']);
  });
});

describe('Datensatz-Schreibweg: die weichen Fälle des Formats (4T-001819, AK7)', () => {
  it('AK7 lässt eine überzählige Zelle stehen', () => {
    // E3.7: Der Datenverlust durch stilles Wegschreiben ist der eine Fehler,
    // den ein Datenspeicher nicht machen darf.
    const rumpf = ['|- id="r-00001"', '| Anna', '| Basel', '| 3', '| aus einer fernen Spalte'];
    const { ok, text } = schreibeDatensaetze(kopfDatei(rumpf), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Bern', '4'] },
    ]);

    expect(ok).toBe(true);
    expect(zellenVon(text, 'r-00001')).toEqual(['Anna', 'Bern', '4', 'aus einer fernen Spalte']);
  });

  it('AK7 lässt eine fehlende Zelle leer, statt sie zu erfinden', () => {
    const rumpf = ['|- id="r-00001"', '| Anna'];
    const { ok, text } = schreibeDatensaetze(kopfDatei(rumpf), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Bea'] },
    ]);

    expect(ok).toBe(true);
    // Der Auftrag nennt eine Zelle, und nur sie ändert sich: Die Datei behält
    // ihre Gestalt, statt beim ersten Schreiben aufgefüllt zu werden.
    expect(zellenVon(text, 'r-00001')).toEqual(['Bea']);
  });

  it('AK7 lässt die Vorspann-Zeilen eines Datensatzes mit ihm mitreisen', () => {
    const rumpf = ['|- id="r-00001"', 'loser Text am Datensatz', '| Anna', '| Basel', '| 3'];
    const { ok, text } = schreibeDatensaetze(kopfDatei(rumpf), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Bern', '4'] },
    ]);

    expect(ok).toBe(true);
    expect(text).toContain('|- id="r-00001"\nloser Text am Datensatz\n| Anna\n| Bern\n| 4');
  });
});

describe('Datensatz-Schreibweg: Ziel und Befund (4T-001819, AK9, B3)', () => {
  it('AK9 liefert einen Befund auf eine unbekannte Kennung und lässt den Text unverändert', () => {
    const vorher = kopfDatei(ZWEI);
    const ergebnis = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00099', zellen: ['X'] },
    ]);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('nichtGefunden');
    expect(ergebnis.error).toMatch(/Kennung/);
    expect(ergebnis.text).toBeUndefined();
  });

  it('AK9 lässt auch die übrigen Operationen des Auftrags aus, wenn eine scheitert', () => {
    // Alles oder nichts: Ein halb ausgeführter Auftrag wäre der teurere
    // Ausgang, weil niemand ihm ansieht, wo er abgebrochen ist.
    const vorher = kopfDatei(ZWEI);
    const ergebnis = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Bern', '4'] },
      { art: ART_LOESCHEN, id: 'r-00099' },
    ]);

    expect(ergebnis.ok).toBe(false);
    expect(schreibeDatensaetze(vorher, FELDER, []).text).toBe(vorher);
  });

  it('B3 weist ein mehrdeutiges Ziel ab', () => {
    // Beide Schreibweisen meinen denselben Datensatz; welche der beiden Zeilen
    // gemeint ist, weiß niemand.
    const rumpf = [...ZWEI, '|- id="r-1"', '| Anna zwei', '| Basel', '| 3'];
    const ergebnis = schreibeDatensaetze(kopfDatei(rumpf), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Bern', '4'] },
    ]);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('mehrdeutig');
  });

  it('B3 weist das Anlegen einer bereits vorhandenen Kennung ab', () => {
    const ergebnis = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_ANLEGEN, id: 'r-00002', zellen: ['Bert'] },
    ]);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('bereitsVorhanden');

    // Auch zweimal in einem Lauf: Der zweite Auftrag sieht den ersten.
    const zweimal = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla'] },
      { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Clara'] },
    ]);
    expect(zweimal.code).toBe('bereitsVorhanden');
  });

  it('B3 arbeitet weiter, wenn eine FREMDE Zeile einen Befund des Parsers trägt', () => {
    // Eine von Hand beschädigte Zeile machte die Tabelle sonst für alle
    // übrigen Datensätze unbearbeitbar; der Schreibweg verschlimmert sie nicht,
    // weil er zeichengleich auf Zeilen-Bereichen arbeitet.
    const rumpf = ['|- id="xyz"', '| kaputt', '| Basel', '| 3', ...ZWEI];
    const vorher = kopfDatei(rumpf);
    const { ok, text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['Bert', 'Chur', '9'] },
    ]);

    expect(ok).toBe(true);
    expect(zellenVon(text, 'r-00002')).toEqual(['Bert', 'Chur', '9']);
    expect(text).toContain('|- id="xyz"\n| kaputt\n| Basel\n| 3\n');
  });

  it('weist eine unbrauchbare Operation ab, bevor irgendetwas geschieht', () => {
    const vorher = kopfDatei(ZWEI);
    expect(schreibeDatensaetze(vorher, FELDER, 'keine Liste').code).toBe('operationen');
    expect(schreibeDatensaetze(vorher, FELDER, [null]).code).toBe('operation');
    expect(schreibeDatensaetze(vorher, FELDER, [{ art: 'ersetzen', id: 'r-1' }]).code).toBe('art');
    expect(schreibeDatensaetze(vorher, FELDER, [{ art: ART_AENDERN, id: 'xyz' }]).code).toBe(
      'kennung',
    );
  });
});

describe('Datensatz-Schreibweg: Datei ohne Datensatz-Block (4T-001819, B2)', () => {
  const ohneBlock = datei([
    '---',
    'db-table:',
    '  name: Adressen',
    '  fields:',
    '    - name: name',
    '      type: string',
    '---',
    '',
    '# Adressen',
    '',
  ]);

  it('B2 legt den Block samt Zaun am Ende des Dokuments an, abgesetzt durch eine Leerzeile', () => {
    const { ok, text } = schreibeDatensaetze(
      ohneBlock,
      [{ name: 'name' }],
      [{ art: ART_ANLEGEN, id: 'r-00001', zellen: ['Anna'] }],
    );

    expect(ok).toBe(true);
    expect(text).toBe(
      ohneBlock.replace(/\n+$/, '\n') +
        datei(['', ZAUN + 'perspective-records', '|- id="r-00001"', '| Anna', ZAUN, '']),
    );
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001']);
  });

  it('B2 legt keinen ZWEITEN Zaun in eine Datei mit leerem Block', () => {
    // Der Zustand nach dem Löschen des letzten Datensatzes: Der Zaun steht, der
    // Rumpf ist leer. Ein zweiter Block wäre hier der Fehler.
    const geleert = schreibeDatensaetze(
      kopfDatei(['|- id="r-00001"', '| Anna', '| Basel', '| 3']),
      FELDER,
      [{ art: ART_LOESCHEN, id: 'r-00001' }],
    );
    expect(geleert.ok).toBe(true);

    const wieder = schreibeDatensaetze(geleert.text, FELDER, [
      { art: ART_ANLEGEN, id: 'r-00002', zellen: ['Bert', 'Bern', '5'] },
    ]);
    expect(wieder.ok).toBe(true);
    expect(wieder.text.match(/perspective-records/g)).toHaveLength(1);
    expect(zellenVon(wieder.text, 'r-00002')).toEqual(['Bert', 'Bern', '5']);
  });

  // 4T-001833 (Epic 3E-000254): Die Öffnung des leeren Blocks wird hinter
  // fremden Code-Blöcken nach der Standard-Regel gesucht; eine Zeile
  // ```` ```perspective-records ```` IN einem fremden Block ist keine Öffnung.
  it('B2 legt im echten leeren Block an, nicht in einem fremden Block davor', () => {
    const vorher = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: name',
      '    - name: ort',
      '    - name: menge',
      '---',
      '',
      '````md',
      ZAUN + 'perspective-records',
      '|- id="r-09999"',
      ZAUN,
      '````',
      '',
      ZAUN + 'perspective-records',
      ZAUN,
      '',
      'Prosa nach dem Block.',
      '',
    ];
    const { ok, text } = schreibeDatensaetze(datei(vorher), FELDER, [
      { art: ART_ANLEGEN, id: 'r-00001', zellen: ['Anna', 'Basel', '3'] },
    ]);

    expect(ok).toBe(true);
    const echt = 14; // Zeilen-Index der echten Öffnung in `vorher`
    expect(text.split('\n')).toEqual([
      ...vorher.slice(0, echt + 1),
      '|- id="r-00001"',
      '| Anna',
      '| Basel',
      '| 3',
      ...vorher.slice(echt + 1),
    ]);
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001']);
  });

  it('B2 weist Ändern und Löschen ohne Block ab, weil ihr Ziel nicht existiert', () => {
    for (const art of [ART_AENDERN, ART_LOESCHEN])
      expect(schreibeDatensaetze(ohneBlock, FELDER, [{ art, id: 'r-00001' }]).code).toBe(
        'keinBlock',
      );
  });

  it('weist eine Datei ab, die keine Tabellen-Datei ist', () => {
    const fremd = datei(['---', 'title: Notiz', '---', '', '# Notiz', '']);
    expect(schreibeDatensaetze(fremd, FELDER, [{ art: ART_ANLEGEN, id: 'r-1' }]).code).toBe(
      'keineTabelle',
    );
  });
});

describe('Datensatz-Schreibweg: Kopf-Datei und Folge-Segment (4T-001819, AK4)', () => {
  it('AK4 bedient das Folge-Segment, ohne dass der Aufrufer die Rolle behauptet', () => {
    const vorher = folgeSegment(['|- id="r-00003"', '| Carla', '| Chur', '| 7']);
    const { ok, text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00003', zellen: ['Carla', 'Davos', '8'] },
    ]);

    expect(ok).toBe(true);
    expect(zellenVon(text, 'r-00003')).toEqual(['Carla', 'Davos', '8']);
    // Das Frontmatter des Segments bleibt zeichengleich; die Rolle kam aus dem
    // Text und nicht aus einer Angabe des Aufrufers.
    expect(text.split('\n').slice(0, 4)).toEqual(vorher.split('\n').slice(0, 4));
  });

  it('AK4 fügt im Folge-Segment am Ende an, auch ohne schließenden Zaun', () => {
    const { ok, text } = schreibeDatensaetze(
      folgeSegment(['|- id="r-00003"', '| Carla', '| Chur', '| 7', '']),
      FELDER,
      [{ art: ART_ANLEGEN, id: 'r-00004', zellen: ['Dora', 'Davos', '1'] }],
    );

    expect(ok).toBe(true);
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00003', 'r-00004']);
  });

  it('AK4 hält den Hochwasserstand der Kopf-Datei vor: das Segment trägt ihn nicht', () => {
    const ergebnis = schreibeHochwasserstand(folgeSegment(['|- id="r-00003"', '| Carla']), 7);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('keinBehaelter');
  });
});

describe('Datensatz-Schreibweg: Hochwasserstand im Frontmatter (4T-001819, AK3)', () => {
  it('AK3 ersetzt eine vorhandene Angabe und lässt das übrige Frontmatter zeichengleich', () => {
    const vorher = kopfDatei(ZWEI);
    const { ok, text, eingefuegt } = schreibeHochwasserstand(vorher, 17);

    expect(ok).toBe(true);
    expect(eingefuegt).toBe(false);
    expect(text.split('\n').filter((z) => z.includes('lastId'))).toEqual(['  lastId: 17']);
    // Zeichengenau: Genau eine Zeile unterscheidet sich, alle anderen sind
    // Zeichen für Zeichen dieselben.
    const alt = vorher.split('\n');
    expect(text.split('\n').filter((z, i) => z !== alt[i])).toEqual(['  lastId: 17']);
  });

  // 4T-001924 (Nachzügler zu 4T-001819): Befund aus dem Bau der Teilung. Das
  // Muster der Angabe endet mit `(.*)$`, und `.` nimmt keinen Wagenrücklauf;
  // auf der rohen CRLF-Zeile fand es nichts, und jede Neuanlage in einer
  // CRLF-Tabelle endete mit einem Wurf statt mit einem Ergebnis.
  it('ersetzt die Angabe auch in einer CRLF-Datei und behält den Wagenrücklauf jeder Zeile', () => {
    const vorher = kopfDatei(ZWEI).replace(/\n/g, '\r\n');
    const { ok, text, eingefuegt } = schreibeHochwasserstand(vorher, 17);

    expect(ok).toBe(true);
    expect(eingefuegt).toBe(false);
    expect(text.split('\n').filter((z) => z.includes('lastId'))).toEqual(['  lastId: 17\r']);
    for (const zeile of text.split('\n').slice(0, -1)) expect(zeile.endsWith('\r')).toBe(true);
    const alt = vorher.split('\n');
    expect(text.split('\n').filter((z, i) => z !== alt[i])).toEqual(['  lastId: 17\r']);
  });

  it('AK3 fügt eine fehlende Angabe am Ende des Behälters ein', () => {
    const vorher = kopfDatei(ZWEI, []);
    const { ok, text, eingefuegt } = schreibeHochwasserstand(vorher, 2);

    expect(ok).toBe(true);
    expect(eingefuegt).toBe(true);
    // Eingerückt wie die übrigen Angaben des Behälters, und eingefügt hinter
    // seiner letzten Zeile statt am Anfang.
    expect(text).toContain('      type: number\n  lastId: 2\n---');
    expect(text.split('\n').filter((z) => !vorher.split('\n').includes(z))).toEqual([
      '  lastId: 2',
    ]);
  });

  it('AK3 lässt einen Kommentar hinter der Angabe stehen', () => {
    const vorher = kopfDatei(ZWEI, ['  lastId: 2 # von Hand gesetzt']);
    const { text } = schreibeHochwasserstand(vorher, 9);
    expect(text).toContain('  lastId: 9 # von Hand gesetzt');
  });

  it('AK3 schreibt den Stand im selben Zug wie die Datensätze fort', () => {
    const { ok, text, ergebnisse } = schreibeDatensaetze(
      kopfDatei(ZWEI),
      FELDER,
      [{ art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla', 'Chur', '7'] }],
      { lastId: 3 },
    );

    expect(ok).toBe(true);
    expect(text).toContain('  lastId: 3');
    // Die gemeldete Zeile zeigt auch dann auf den Datensatz, wenn die
    // eingefügte Angabe die Datei um eine Zeile verlängert hat.
    expect(text.split('\n')[ergebnisse[0].zeile]).toBe('|- id="r-00003"');

    const ohneAngabe = schreibeDatensaetze(
      kopfDatei(ZWEI, []),
      FELDER,
      [{ art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla'] }],
      { lastId: 3 },
    );
    expect(ohneAngabe.text).toContain('  lastId: 3');
    expect(ohneAngabe.text.split('\n')[ohneAngabe.ergebnisse[0].zeile]).toBe('|- id="r-00003"');
  });

  it('AK3 weist einen unbrauchbaren Stand und eine Datei ohne Frontmatter ab', () => {
    const vorher = kopfDatei(ZWEI);
    for (const unbrauchbar of [-1, 1.5, '7', null, undefined])
      expect(schreibeHochwasserstand(vorher, unbrauchbar).code, String(unbrauchbar)).toBe('stand');
    // Null ist dagegen ein gültiger Stand: die frisch angelegte Tabelle.
    expect(schreibeHochwasserstand(vorher, 0).ok).toBe(true);
    expect(schreibeHochwasserstand('# Ohne Frontmatter\n', 3).code).toBe('keinFrontmatter');
  });

  it('AK3 weist einen Behälter in Fluss-Schreibweise ab, statt ihn umzuformen', () => {
    const fluss = datei(['---', 'db-table: { name: Adressen, lastId: 2 }', '---', '']);
    expect(schreibeHochwasserstand(fluss, 3).code).toBe('behaelterInline');
  });
});

// 4T-001833 (Epic 3E-000254, B3): Der Abschnitt ist umgestellt. Bis dahin wuchs
// der Zaun mit einem Wert, der eine Zaun-Zeile trug; seither maskiert der
// Serialisierer die Zeile, der Zaun bleibt bei drei, und der Nachweis läuft über
// das erneute Lesen statt über den Text.
describe('Datensatz-Schreibweg: die Fence-Länge bleibt fest (4T-001819 AK6, 4T-001833 B3)', () => {
  it('AK6 maskiert die Zaun-Zeile eines Wertes, statt den Zaun wachsen zu lassen', () => {
    // 4T-001833: vorher `zaun` = { vorher: 3, nachher: 4, angepasst: true } und
    // vier Backticks an beiden Zaun-Zeilen; jetzt `zaun` = null, drei Backticks.
    const { ok, text, zaun } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', ZAUN + '\ncode\n' + ZAUN, '3'] },
    ]);

    expect(ok).toBe(true);
    expect(zaun).toBeNull();
    expect(text).toContain('\n' + ZAUN + 'perspective-records\n');
    expect(text).not.toContain('````');
    expect(text).toContain(`|- id="r-00001"\n| Anna\n| ${ZAUN}\ncode\n\\${ZAUN}\n| 3\n`);
    // Der Nachweis über das erneute Lesen (AK5 von 4T-001833): alle Datensätze
    // sind da, und der Wert kommt demaskiert zurück.
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001', 'r-00002']);
    expect(zellenVon(text, 'r-00001')).toEqual(['Anna', ZAUN + '\ncode\n' + ZAUN, '3']);
    expect(zellenVon(text, 'r-00002')).toEqual(['Bert', 'Bern', '5']);
  });

  it('AK6 lässt den Zaun in Ruhe, solange kein Wert ihn schlösse', () => {
    const { zaun, text } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'ein `Wort` in Code', '3'] },
    ]);
    expect(zaun).toBeNull();
    expect(text).toContain(ZAUN + 'perspective-records\n');
  });

  it('AK6 meldet im Folge-Segment keinen Bedarf mehr, weil die Zeile maskiert ist', () => {
    // 4T-001833: vorher `zaun` = { vorher: null, nachher: 4, angepasst: false };
    // der Zaun der Kopf-Datei müsste nie mehr wachsen, `zaun` ist null.
    const { ok, zaun, text } = schreibeDatensaetze(
      folgeSegment(['|- id="r-00003"', '| Carla', '| Chur', '| 7']),
      FELDER,
      [{ art: ART_AENDERN, id: 'r-00003', zellen: ['Carla', ZAUN + '\ncode\n' + ZAUN, '7'] }],
    );

    expect(ok).toBe(true);
    expect(zaun).toBeNull();
    expect(zellenVon(text, 'r-00003')).toEqual(['Carla', ZAUN + '\ncode\n' + ZAUN, '7']);
  });

  it('AK6 lässt eine um vier Leerzeichen eingerückte Backtick-Zeile den Zaun nicht verlängern', () => {
    // 4T-001833 (Epic 3E-000254): Die Zeile ist keine Zaun-Zeile, wird nicht
    // maskiert und zählt seither auch in der Fence-Länge nicht mehr mit.
    const { ok, zaun, text } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['Anna', 'Basel\n    ````', '3'] },
    ]);
    expect(ok).toBe(true);
    expect(zaun).toBeNull();
    expect(text).toContain('| Basel\n    ````\n');
    expect(text).toContain('\n' + ZAUN + 'perspective-records\n');
    expect(zellenVon(text, 'r-00001')).toEqual(['Anna', 'Basel\n    ````', '3']);
  });

  it('AK6 lässt eine Wert-Zeile aus Tilden den Zaun ebenso wenig verlängern', () => {
    // 4T-001833 (B1): Tilden sind zaun-artig wie Backticks und werden maskiert.
    const { ok, zaun, text } = schreibeDatensaetze(kopfDatei(ZWEI), FELDER, [
      { art: ART_ANLEGEN, id: 'r-00003', zellen: ['Carla', 'Chur\n~~~~', '7'] },
    ]);
    expect(ok).toBe(true);
    expect(zaun).toBeNull();
    expect(text).toContain('| Chur\n\\~~~~\n');
    expect(gelesen(text).map((r) => r.id)).toEqual(['r-00001', 'r-00002', 'r-00003']);
    expect(zellenVon(text, 'r-00003')).toEqual(['Carla', 'Chur\n~~~~', '7']);
  });
});

describe('Datensatz-Schreibweg: Wächter über Schnitt und Herkunft (4T-001819, AK8, AK10)', () => {
  it('AK8 greift prozess-neutral weder auf das Dateisystem noch auf Electron zu', () => {
    for (const wort of ['node:fs', 'node:path', "require('fs", 'electron', 'document', 'window'])
      expect(CODE.includes(wort), wort).toBe(false);
  });

  it('AK8 lädt nichts aus dem Haupt-Prozess und nichts aus dem Renderer', () => {
    for (const muster of [/require\('[^']*src\/main/, /require\('[^']*\/main\//, /renderer/])
      expect(muster.test(CODE), String(muster)).toBe(false);
  });

  it('AK10 nimmt Parser und Serialisierer aus dem Format und führt keine eigenen', () => {
    expect(CODE).toMatch(/require\('\.\/record-block\.js'\)/);
    // Kein zweiter Parser, kein zweiter Serialisierer, keine zweite Maskierung:
    // Die Marker des Formats kommen in diesem Modul gar nicht vor.
    for (const wort of ['maskiere', 'demaskiere', "'|-'", "'|'", 'RECORD_MARKER', 'CELL_MARKER'])
      expect(CODE.includes(wort), wort).toBe(false);
  });

  it('AK10 schreibt den Block nicht als Ganzes neu, sondern ersetzt Zeilen-Bereiche', () => {
    // Der eine Aufruf von `baueRecordFence` steht im Fall B2, in dem der Block
    // überhaupt erst entsteht; `serializeRecordBlock` läuft je Datensatz.
    expect((CODE.match(/baueRecordFence\(/g) || []).length).toBe(1);
    expect(CODE).toMatch(/serializeRecordBlock\(\[gebaut\], \[\]\)/);
  });
});

// --- 4T-001821: der Trennabstand hinter einem Datensatz ---------------------------------

// **Die Fehlerbehebung.** Eine trennende Leerzeile zwischen zwei Datensätzen
// landet beim Lesen als abschließender Zeilenumbruch im Text der LETZTEN Zelle
// des Datensatzes davor; das Modul schrieb ihn als Wert zurück UND erhielt die
// Leerzeile zusätzlich über seinen Zeilen-Bereich. Ergebnis war eine
// zusätzliche Leerzeile je berührtem Datensatz, bei jedem Schreibvorgang
// erneut.
//
// **Warum die Bestands-Fälle das nicht gefunden haben:** Weder die Fixture
// `ZWEI` oben noch die Demo-Tabelle `src/demo/Library.md` trennt ihre
// Datensätze durch Leerzeilen. Die Fälle hier bringen genau die Gestalt mit,
// die eine von Hand geschriebene Tabelle hat.

// Zwei Felder statt dreier: Der Fehler zeigt sich an der LETZTEN Zelle, und mit
// zwei Feldern liegt sie unmittelbar hinter der ersten.
const ZWEI_FELDER = [{ name: 'a' }, { name: 'b' }];

// Datensätze, getrennt durch `abstand` Leerzeilen.
function mitAbstand(records, abstand) {
  const zeilen = [];
  records.forEach((record, i) => {
    if (i > 0) for (let n = 0; n < abstand; n += 1) zeilen.push('');
    zeilen.push(`|- id="${record.id}"`, ...record.zellen.map((wert) => `| ${wert}`));
  });
  return zeilen;
}

function abstandsDatei(records, abstand, felder) {
  return datei([
    '---',
    'db-table:',
    '  fields:',
    ...felder.map((feld) => `    - name: ${feld.name}`),
    '  lastId: 3',
    '---',
    '',
    ZAUN + 'perspective-records',
    ...mitAbstand(records, abstand),
    ZAUN,
    '',
  ]);
}

const DREI_RECORDS = [
  { id: 'r-00001', zellen: ['eins', 'zwei'] },
  { id: 'r-00002', zellen: ['drei', 'vier'] },
  { id: 'r-00003', zellen: ['fuenf', 'sechs'] },
];

// Wie viele Leerzeilen trägt die Datei? Der Schaden war ihr WACHSEN.
function leerzeilen(text) {
  return text.split('\n').filter((zeile) => zeile.trim() === '').length;
}

describe('Datensatz-Schreibweg: der Trennabstand wird nicht verdoppelt (4T-001821)', () => {
  it('lässt die trennende Leerzeile beim Ändern der ERSTEN Zelle stehen, genau einmal', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const { ok, text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['EINS'] },
    ]);
    expect(ok).toBe(true);
    expect(text).toBe(vorher.replace('| eins', '| EINS'));
  });

  it('lässt sie beim Ändern der LETZTEN Zelle stehen', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const zellen = [];
    zellen[1] = 'ZWEI';
    const { text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen },
    ]);
    expect(text).toBe(vorher.replace('| zwei', '| ZWEI'));
  });

  it('lässt sie beim Ändern des MITTLEREN Datensatzes stehen', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const { text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00002', zellen: ['DREI', 'VIER'] },
    ]);
    expect(text).toBe(vorher.replace('| drei', '| DREI').replace('| vier', '| VIER'));
  });

  it('lässt sie beim Ändern des LETZTEN Datensatzes stehen', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const { text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00003', zellen: ['FUENF', 'SECHS'] },
    ]);
    expect(text).toBe(vorher.replace('| fuenf', '| FUENF').replace('| sechs', '| SECHS'));
  });

  it('hält auch einen Abstand von ZWEI Leerzeilen', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 2, ZWEI_FELDER);
    const { text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['EINS'] },
    ]);
    expect(text).toBe(vorher.replace('| eins', '| EINS'));
  });

  it('hält den Abstand bei DREI Feldern', () => {
    const records = [
      { id: 'r-00001', zellen: ['Anna', 'Basel', '3'] },
      { id: 'r-00002', zellen: ['Bert', 'Bern', '5'] },
    ];
    const vorher = abstandsDatei(records, 1, FELDER);
    const { text } = schreibeDatensaetze(vorher, FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['ANNA'] },
    ]);
    expect(text).toBe(vorher.replace('| Anna', '| ANNA'));
  });

  it('bleibt über zwei Schreibvorgänge hintereinander stabil', () => {
    // Der eigentliche Schaden war das WIEDERHOLTE Wachsen: Jeder Lauf hängte
    // eine weitere Leerzeile an.
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const erster = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['EINS'] },
    ]).text;
    const zweiter = schreibeDatensaetze(erster, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: ['NOCHMAL'] },
    ]).text;

    expect(leerzeilen(erster)).toBe(leerzeilen(vorher));
    expect(leerzeilen(zweiter)).toBe(leerzeilen(vorher));
    expect(zweiter).toBe(vorher.replace('| eins', '| NOCHMAL'));
  });

  it('nimmt beim Löschen genau einen Trennabstand mit', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const { text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_LOESCHEN, id: 'r-00002' },
    ]);
    expect(text).toBe(abstandsDatei([DREI_RECORDS[0], DREI_RECORDS[2]], 1, ZWEI_FELDER));
  });

  it('fügt beim Anlegen hinter dem letzten leerzeilen-getrennten Datensatz an', () => {
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    const { text } = schreibeDatensaetze(vorher, ZWEI_FELDER, [
      { art: ART_ANLEGEN, id: 'r-00004', zellen: ['sieben', 'acht'] },
    ]);
    // Der neue Datensatz folgt unmittelbar; einen Trennabstand erfindet das
    // Modul nicht, weil die Datei ihren eigenen führt (unverändertes Verhalten).
    expect(text).toContain('| sechs\n|- id="r-00004"\n| sieben\n| acht');
    expect(leerzeilen(text)).toBe(leerzeilen(vorher));
  });

  it('gibt den Wert einer letzten Zelle ohne ihren Trennabstand zurück', () => {
    // Die benannte Grenze: Das Format kann einen ECHTEN mehrzeiligen Wert, der
    // auf eine Leerzeile endet, nicht vom Trennabstand unterscheiden. Der
    // Umbruch gilt deshalb als Abstand.
    const vorher = abstandsDatei(DREI_RECORDS, 1, ZWEI_FELDER);
    expect(zellTexte(gelesen(vorher)[0])).toEqual(['eins', 'zwei']);
  });

  it('lässt einen mehrzeiligen Wert MITTEN im Datensatz unangetastet', () => {
    // Die Gegenprobe zur Grenze: Nur die letzte Zelle trägt den Abstand; eine
    // Leerzeile vor einer weiteren Zelle gehört zum Wert und bleibt.
    const mehrzeilig = datei([
      '---',
      'db-table:',
      '  fields:',
      '    - name: a',
      '    - name: b',
      '---',
      '',
      ZAUN + 'perspective-records',
      '|- id="r-00001"',
      '| erste',
      '',
      'dritte',
      '| zwei',
      ZAUN,
      '',
    ]);
    expect(zellTexte(gelesen(mehrzeilig)[0])).toEqual(['erste\n\ndritte', 'zwei']);
    const { text } = schreibeDatensaetze(mehrzeilig, ZWEI_FELDER, [
      { art: ART_AENDERN, id: 'r-00001', zellen: [] },
    ]);
    expect(text).toBe(mehrzeilig);
  });
});
