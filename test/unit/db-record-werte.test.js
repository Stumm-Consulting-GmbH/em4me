// 4T-001559 (Epic 3E-000251, E5): Unit-Tests der Wert-Auslegung einer Zelle —
// je Typ mit gültigem Wert, unpassendem Text und leerer Zelle.
//
// Die tragende Zusage ist, dass **kein Text verlorengeht**: Ein Wert, der zum
// erklärten Typ nicht passt, fällt auf leer und trägt seinen Befund, der Rohtext
// bleibt unangetastet. Die Prüffälle laufen deshalb doppelt, direkt gegen die
// Auslegung und durch den Datensatz-Block hindurch, weil dort ihre Wirkung
// entsteht.
import { describe, it, expect } from 'vitest';
import {
  CELL_ERRORS,
  TEXT_TYPES,
  istDatum,
  zellWert,
} from '../../src/shared/database/record-values.js';
import {
  parseRecordBlock,
  zellenNachFeldern,
  serializeRecordBlock,
} from '../../src/shared/database/record-block.js';
import { DB_COLUMN_TYPES } from '../../src/shared/database/table-columns.js';
import { parseTableDefinition } from '../../src/shared/database/table-definition.js';

// Eine Tabelle, die jeden der acht Typen genau einmal führt.
const ALLE_TYPEN = DB_COLUMN_TYPES.map((type) => ({ name: type, type }));

describe('Zell-Wert je Typ (4T-001559, E5)', () => {
  it('kennt jeden der acht Spalten-Typen', () => {
    // Ein neuer Typ ohne Auslegung fiele sonst still auf «Text» zurück.
    for (const type of DB_COLUMN_TYPES) {
      const { error } = zellWert(type, '');
      expect(error, `leere Zelle vom Typ ${type}`).toBeNull();
    }
    expect(DB_COLUMN_TYPES).toHaveLength(8);
  });

  it('gibt bei Text-Typen den Text unverändert zurück', () => {
    for (const type of TEXT_TYPES) {
      expect(zellWert(type, '  mit Leerzeichen  ')).toEqual({
        value: '  mit Leerzeichen  ',
        error: null,
      });
    }
    // Ein Datenspeicher, der eine Zeichenkette still beschneidet, ändert Daten.
    expect(TEXT_TYPES).toContain('string');
    expect(TEXT_TYPES).toContain('multiline');
  });

  it('trägt bei den beiden Verweis-Typen den Verweis-Text als Wert', () => {
    // Ob das Ziel existiert, ist eine Frage der Auflösung und nicht des Formats.
    expect(zellWert('link', '[[Handbuch]]')).toEqual({ value: '[[Handbuch]]', error: null });
    expect(zellWert('record', 'r-00042')).toEqual({ value: 'r-00042', error: null });
    expect(zellWert('record', 'gibt es nicht')).toEqual({ value: 'gibt es nicht', error: null });
  });

  it('liest Zahlen als Punkt-Dezimal und meldet alles andere', () => {
    expect(zellWert('number', '12.50')).toEqual({ value: 12.5, error: null });
    expect(zellWert('number', '-3')).toEqual({ value: -3, error: null });
    expect(zellWert('number', ' 7 ')).toEqual({ value: 7, error: null });
    expect(zellWert('number', '12,50')).toEqual({ value: null, error: CELL_ERRORS.number });
    expect(zellWert('number', '1e3')).toEqual({ value: null, error: CELL_ERRORS.number });
  });

  it('prüft das Datum kalendarisch und nicht nur der Form nach', () => {
    // Der 31. Februar trifft das Muster und ist trotzdem kein Tag. Ein
    // Datenspeicher darf ihn nicht annehmen.
    expect(zellWert('date', '2026-09-07')).toEqual({ value: '2026-09-07', error: null });
    expect(zellWert('date', '2026-02-31')).toEqual({ value: null, error: CELL_ERRORS.date });
    expect(zellWert('date', '07.09.2026')).toEqual({ value: null, error: CELL_ERRORS.date });
    expect(istDatum('2024-02-29')).toBe(true);
    expect(istDatum('2025-02-29')).toBe(false);
  });

  it('nimmt die Uhrzeit mit und ohne Sekunden', () => {
    // E19 verlangt EIN Definitions-Format: Eine Uhrzeit, die als Vorgabewert
    // derselben Spalte zulässig ist, darf in einer Zelle nicht abgewiesen werden.
    expect(zellWert('time', '09:30')).toEqual({ value: '09:30', error: null });
    expect(zellWert('time', '09:30:15')).toEqual({ value: '09:30:15', error: null });
    expect(zellWert('time', '24:00')).toEqual({ value: null, error: CELL_ERRORS.time });
    expect(zellWert('time', '9:30')).toEqual({ value: null, error: CELL_ERRORS.time });
  });

  it('liest den Wahrheitswert als x oder leer', () => {
    expect(zellWert('boolean', 'x')).toEqual({ value: true, error: null });
    expect(zellWert('boolean', 'X')).toEqual({ value: true, error: null });
    expect(zellWert('boolean', '')).toEqual({ value: false, error: null });
    expect(zellWert('boolean', 'ja')).toEqual({ value: null, error: CELL_ERRORS.boolean });
  });

  it('macht die leere Zelle bei jedem Typ gültig', () => {
    expect(zellWert('string', '')).toEqual({ value: '', error: null });
    expect(zellWert('boolean', '')).toEqual({ value: false, error: null });
    for (const type of ['number', 'date', 'time']) {
      expect(zellWert(type, ''), `leere Zelle vom Typ ${type}`).toEqual({
        value: null,
        error: null,
      });
    }
  });

  it('lässt einen unbekannten Typ die Zelle nicht ungültig machen', () => {
    // Eine Datei für eine spätere Stufe darf heute schon dastehen.
    expect(zellWert('waehrung', 'CHF 5')).toEqual({ value: 'CHF 5', error: null });
  });
});

describe('Zell-Wert im Datensatz-Block (4T-001559)', () => {
  const rumpf = [
    '|- id="r-00001"',
    '| Anna',
    '| lang',
    '| 12.50',
    '| x',
    '| 2026-09-07',
    '| 09:30',
    '| [[Handbuch]]',
    '| r-00007',
  ].join('\n');

  it('legt jede Zelle nach dem Typ ihres Feldes aus', () => {
    const { records } = parseRecordBlock(rumpf, ALLE_TYPEN);
    const zellen = zellenNachFeldern(records[0], ALLE_TYPEN);
    expect(zellen.map((z) => z.value)).toEqual([
      'Anna',
      'lang',
      12.5,
      true,
      '2026-09-07',
      '09:30',
      '[[Handbuch]]',
      'r-00007',
    ]);
    expect(zellen.every((z) => z.error === null)).toBe(true);
  });

  it('behält den Rohtext einer unpassenden Zelle und meldet sie', () => {
    const kaputt =
      '|- id="r-00001"\n| Anna\n| lang\n| zwoelf\n| x\n| 2026-02-31\n| 09:30\n| a\n| b';
    const { records } = parseRecordBlock(kaputt, ALLE_TYPEN);
    const zellen = zellenNachFeldern(records[0], ALLE_TYPEN);
    expect(zellen[2]).toMatchObject({ text: 'zwoelf', value: null, error: CELL_ERRORS.number });
    expect(zellen[4]).toMatchObject({ text: '2026-02-31', value: null, error: CELL_ERRORS.date });
    // Der Rundlauf bleibt davon unberührt: Nichts wird weggeschrieben.
    const { records: r2, vorspann } = parseRecordBlock(kaputt, ALLE_TYPEN);
    expect(serializeRecordBlock(r2, vorspann)).toBe(kaputt);
  });

  it('gibt einer überzähligen Zelle keinen Wert und lässt ihren Text stehen', () => {
    const { records } = parseRecordBlock(rumpf + '\n| ueberzaehlig', ALLE_TYPEN);
    const letzte = records[0].cells[8];
    expect(letzte).toEqual({ text: 'ueberzaehlig', value: null, error: null });
  });

  it('legt ohne Definition nichts aus, statt einen Typ zu raten', () => {
    const { records } = parseRecordBlock('|-\n| 12.50', []);
    expect(records[0].cells[0]).toEqual({ text: '12.50', value: null, error: null });
  });
});

// --- 4T-001931: Pflicht-Angabe und Feld-Regeln beim Lesen, weich (E22.2, AK5) -------------

describe('Zell-Wert beim Lesen: Pflicht-Angabe und Feld-Regeln (4T-001931, AK5)', () => {
  // Die Felder entstehen über das echte Lesen der Definition, damit die Regeln
  // in der Gestalt ankommen, in der der Datensatz-Block sie bekommt.
  function felder(eintraege) {
    const gelesen = parseTableDefinition({ 'db-table': { fields: eintraege } });
    expect(gelesen.hints).toEqual([]);
    return gelesen.fields;
  }

  const MIT_REGELN = felder([
    { name: 'Name', required: true },
    { name: 'Plz', check: '/^\\d{4}$/' },
    { name: 'Menge', type: 'number', check: 'value > 0' },
    { name: 'Bezahlt', type: 'boolean', required: true },
  ]);

  it('kennt die beiden Codes der Lese-Seite', () => {
    expect(CELL_ERRORS.check).toBe('check');
    expect(CELL_ERRORS.required).toBe('required');
  });

  it('markiert eine verletzte Feld-Regel mit Wert null und behält den Text', () => {
    const rumpf = '|- id="r-00001"\n| Anna\n| 40a\n| -2\n|';
    const { records } = parseRecordBlock(rumpf, MIT_REGELN);
    expect(records[0].cells.slice(1, 3)).toEqual([
      { text: '40a', value: null, error: CELL_ERRORS.check },
      { text: '-2', value: null, error: CELL_ERRORS.check },
    ]);
    // Weich heißt: nichts wird geschrieben, der Rundlauf bleibt zeichengleich.
    const { records: r2, vorspann } = parseRecordBlock(rumpf, MIT_REGELN);
    expect(serializeRecordBlock(r2, vorspann)).toBe(rumpf);
  });

  it('markiert eine leere Pflicht-Zelle mit Wert null, den leeren Wahrheitswert nicht', () => {
    // Die leere Zelle eines Wahrheitswerts ist der geschriebene Wert «nein»
    // und kein fehlender (Entscheidung des Product Owners vom 2026-09-20).
    const { records } = parseRecordBlock('|- id="r-00001"\n|  \n| 4051\n| 3\n|', MIT_REGELN);
    const zellen = zellenNachFeldern(records[0], MIT_REGELN);
    expect(zellen[0]).toMatchObject({ text: ' ', value: null, error: CELL_ERRORS.required });
    expect(zellen[3]).toMatchObject({ text: '', value: false, error: null });
  });

  it('lässt gültige Werte mit ihrem Wert stehen, auch in der letzten Zelle vor dem Trennabstand', () => {
    const felderLetzte = felder([{ name: 'Name' }, { name: 'Plz', check: '/^\\d{4}$/' }]);
    const rumpf = '|- id="r-00001"\n| Anna\n| 4051\n\n|- id="r-00002"\n| Bert\n| 3000';
    const { records } = parseRecordBlock(rumpf, felderLetzte);
    // Der Trennabstand hängt am Text der letzten Zelle, gehört aber nicht zum
    // Wert, den die Regel prüft.
    expect(records[0].cells[1]).toMatchObject({ text: '4051\n', error: null });
    expect(records[1].cells[1]).toMatchObject({ text: '3000', value: '3000', error: null });
  });

  it('lässt einen Typ-Fehler vor der Feld-Regel stehen', () => {
    const { records } = parseRecordBlock('|-\n| Anna\n| 4051\n| zwölf\n|', MIT_REGELN);
    expect(records[0].cells[2]).toEqual({
      text: 'zwölf',
      value: null,
      error: CELL_ERRORS.number,
    });
  });

  it('lässt eine regelfreie Tabelle unverändert', () => {
    const OHNE_REGELN = felder([
      { name: 'Name' },
      { name: 'Plz' },
      { name: 'Menge', type: 'number' },
      { name: 'Bezahlt', type: 'boolean' },
    ]);
    const { records } = parseRecordBlock('|-\n|\n| 40a\n| -2\n|', OHNE_REGELN);
    expect(records[0].cells).toEqual([
      { text: '', value: '', error: null },
      { text: '40a', value: '40a', error: null },
      { text: '-2', value: -2, error: null },
      { text: '', value: false, error: null },
    ]);
  });
});
