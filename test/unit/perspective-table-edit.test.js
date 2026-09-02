// 4T-000591 (Epic 3E-000109): Unit-Matrix für die Perspective-Table-Operationen
// (src/shared/markdown/perspective-table-edit.js). Deckt den zeilenbasierten
// Scan (Abschnitte, Zell-Blöcke, mehrzeilige Zellen, eingebettete Fences),
// die Span-Erkennung, alle Zeilen-Operationen mit byte-genauem Roh-Erhalt,
// die Spalten-Operationen und Transponieren ohne Spans, die Span-Ablehnung
// sowie das cols-Attribut-Schreiben der Spalten-Ausrichtung ab.
import { describe, it, expect } from 'vitest';
import {
  scanPerspectiveTable,
  hasSpanAttributes,
  locatePerspectiveCell,
  perspectiveOpAvailability,
  writeColsAttribute,
  editPerspectiveTable,
} from '../../src/shared/markdown/perspective-table-edit.js';

const BODY = [
  '{|',
  '|+ Beispiel',
  '|-',
  '! K1',
  '! K2',
  '|-.warn',
  '| a1',
  '| a2',
  'noch a2',
  '|-',
  '| b1',
  '| b2',
  '|}',
];

const SPAN_BODY = ['{|', '|-', '! colspan="2" | Kopf', '|-', '| x', '| y', '|}'];

function edit(lines, cursor, op) {
  return editPerspectiveTable(lines, cursor, op);
}

describe('scanPerspectiveTable', () => {
  it('liest Abschnitte und Zell-Blöcke inklusive mehrzeiliger Zellen', () => {
    const scan = scanPerspectiveTable(BODY);
    expect(scan.headerLine).toBe(0);
    expect(scan.endLine).toBe(12);
    expect(scan.rows.length).toBe(3);
    expect(scan.rows[0]).toMatchObject({ markerLine: 2, endLine: 4 });
    expect(scan.rows[0].cells).toEqual([
      { startLine: 3, endLine: 3 },
      { startLine: 4, endLine: 4 },
    ]);
    // Zweiter Abschnitt: Zelle a2 ist mehrzeilig (Fortsetzungszeile).
    expect(scan.rows[1].cells).toEqual([
      { startLine: 6, endLine: 6 },
      { startLine: 7, endLine: 8 },
    ]);
  });
  it('schützt Marker-Zeichen in eingebetteten Code-Fences', () => {
    const body = ['{|', '|-', '| ```', '|- kein Marker im Code', '```', '| zweite Zelle', '|}'];
    const scan = scanPerspectiveTable(body);
    expect(scan.rows.length).toBe(1);
    expect(scan.rows[0].cells).toEqual([
      { startLine: 2, endLine: 4 },
      { startLine: 5, endLine: 5 },
    ]);
  });
  it('liefert null ohne {|-Kopfzeile', () => {
    expect(scanPerspectiveTable(['| a |', '| b |'])).toBe(null);
    expect(scanPerspectiveTable([])).toBe(null);
  });
  it('toleriert einen fehlenden |}-Abschluss (Tabelle im Aufbau)', () => {
    const scan = scanPerspectiveTable(['{|', '|-', '| a']);
    expect(scan.endLine).toBe(null);
    expect(scan.rows[0].cells).toEqual([{ startLine: 2, endLine: 2 }]);
  });
});

describe('hasSpanAttributes', () => {
  it('erkennt colspan und rowspan, auch hinter einer Status-Klasse', () => {
    expect(hasSpanAttributes(SPAN_BODY)).toBe(true);
    expect(hasSpanAttributes(['{|', '|-', '|.ok rowspan="2" | Z', '|}'])).toBe(true);
  });
  it('zählt align/valign nicht als Span', () => {
    expect(hasSpanAttributes(['{|', '|-', '| align="right" | Z', '|}'])).toBe(false);
    expect(hasSpanAttributes(BODY)).toBe(false);
  });
});

describe('locatePerspectiveCell', () => {
  const scan = scanPerspectiveTable(BODY);
  it('ordnet Kopf-Bereich, Abschnitte und Zell-Blöcke zu', () => {
    expect(locatePerspectiveCell(scan, 0).area).toBe('head');
    expect(locatePerspectiveCell(scan, 1).area).toBe('head');
    expect(locatePerspectiveCell(scan, 4)).toEqual({ area: 'row', rowIndex: 0, col: 1 });
    expect(locatePerspectiveCell(scan, 8)).toEqual({ area: 'row', rowIndex: 1, col: 1 });
    expect(locatePerspectiveCell(scan, 5).col).toBe(0);
  });
  it('zählt Zeilen hinter dem letzten Abschnitt zum letzten Abschnitt', () => {
    expect(locatePerspectiveCell(scan, 12).rowIndex).toBe(2);
  });
});

describe('perspectiveOpAvailability', () => {
  const scan = scanPerspectiveTable(BODY);
  it('dimmt Ränder ohne Spans', () => {
    expect(
      perspectiveOpAvailability(scan, { area: 'row', rowIndex: 0, col: 0 }, false),
    ).toMatchObject({
      rowUp: false,
      rowDown: true,
      colLeft: false,
      colRight: true,
      colDelete: true,
    });
    expect(
      perspectiveOpAvailability(scan, { area: 'row', rowIndex: 2, col: 1 }, false),
    ).toMatchObject({ rowUp: true, rowDown: false, colLeft: true, colRight: false });
  });
  it('lässt Spalten-Operationen mit Spans anklickbar (Hinweis bei Ausführung)', () => {
    const spanScan = scanPerspectiveTable(SPAN_BODY);
    const a = perspectiveOpAvailability(spanScan, { area: 'row', rowIndex: 0, col: 0 }, true);
    expect(a.colLeft).toBe(true);
    expect(a.colDelete).toBe(true);
    expect(a.transpose).toBe(true);
  });
});

describe('editPerspectiveTable: Zeilen-Operationen', () => {
  it('rowUp verschiebt den Abschnitt byte-genau (Status, Mehrzeiligkeit)', () => {
    const r = edit(BODY, { line: 7, ch: 2 }, 'rowUp');
    expect(r.lines).toEqual([
      '{|',
      '|+ Beispiel',
      '|-.warn',
      '| a1',
      '| a2',
      'noch a2',
      '|-',
      '! K1',
      '! K2',
      '|-',
      '| b1',
      '| b2',
      '|}',
    ]);
    expect(r.cursor).toEqual({ line: 4, ch: 2 });
  });
  it('rowDown ist am letzten Abschnitt ein No-op, rowUp am ersten', () => {
    expect(edit(BODY, { line: 10, ch: 0 }, 'rowDown')).toBe(null);
    expect(edit(BODY, { line: 3, ch: 0 }, 'rowUp')).toBe(null);
  });
  it('Zeilen-Operationen bleiben mit Spans erlaubt', () => {
    const r = edit(SPAN_BODY, { line: 4, ch: 0 }, 'rowUp');
    expect(r.lines).toEqual(['{|', '|-', '| x', '| y', '|-', '! colspan="2" | Kopf', '|}']);
  });
  it('rowInsert fügt einen leeren Abschnitt nach dem Cursor-Abschnitt ein', () => {
    const r = edit(BODY, { line: 3, ch: 0 }, 'rowInsert');
    expect(r.lines.slice(5, 8)).toEqual(['|-', '| ', '| ']);
    expect(r.cursor).toEqual({ line: 6, ch: 2 });
    // Aus dem Kopf-Bereich: als erster Abschnitt.
    const fromHead = edit(BODY, { line: 1, ch: 0 }, 'rowInsert');
    expect(fromHead.lines.slice(2, 5)).toEqual(['|-', '| ', '| ']);
  });
  it('rowDelete entfernt den Abschnitt komplett', () => {
    const r = edit(BODY, { line: 7, ch: 0 }, 'rowDelete');
    expect(r.lines).toEqual([
      '{|',
      '|+ Beispiel',
      '|-',
      '! K1',
      '! K2',
      '|-',
      '| b1',
      '| b2',
      '|}',
    ]);
  });
});

describe('editPerspectiveTable: Spalten-Operationen und Transponieren', () => {
  it('colRight tauscht Zell-Blöcke in allen Abschnitten (mehrzeilig inklusive)', () => {
    const r = edit(BODY, { line: 6, ch: 2 }, 'colRight');
    expect(r.lines).toEqual([
      '{|',
      '|+ Beispiel',
      '|-',
      '! K2',
      '! K1',
      '|-.warn',
      '| a2',
      'noch a2',
      '| a1',
      '|-',
      '| b2',
      '| b1',
      '|}',
    ]);
    expect(r.cursor.line).toBe(8);
  });
  it('colInsert und colDelete wirken über alle Abschnitte', () => {
    const ins = edit(BODY, { line: 3, ch: 0 }, 'colInsert');
    expect(ins.lines.filter((l) => l === '| ').length).toBe(3);
    expect(ins.cursor).toEqual({ line: 4, ch: 2 });
    const del = edit(BODY, { line: 4, ch: 0 }, 'colDelete');
    expect(del.lines).toEqual([
      '{|',
      '|+ Beispiel',
      '|-',
      '! K1',
      '|-.warn',
      '| a1',
      '|-',
      '| b1',
      '|}',
    ]);
  });
  it('Ränder sind No-ops, die letzte Spalte bleibt erhalten', () => {
    expect(edit(BODY, { line: 3, ch: 0 }, 'colLeft')).toBe(null);
    expect(edit(BODY, { line: 4, ch: 0 }, 'colRight')).toBe(null);
    expect(edit(['{|', '|-', '| solo', '|}'], { line: 2, ch: 0 }, 'colDelete')).toBe(null);
  });
  it('transpose spiegelt die Block-Matrix, Kopf und Caption bleiben', () => {
    const r = edit(BODY, { line: 6, ch: 0 }, 'transpose');
    expect(r.lines).toEqual([
      '{|',
      '|+ Beispiel',
      '|-',
      '! K1',
      '| a1',
      '| b1',
      '|-',
      '! K2',
      '| a2',
      'noch a2',
      '| b2',
      '|}',
    ]);
    expect(r.cursor).toEqual({ line: 0, ch: 0 });
  });
  it('Span-Ablehnung: Spalten-Operationen, Ausrichtung und Transponieren', () => {
    expect(edit(SPAN_BODY, { line: 2, ch: 0 }, 'colRight')).toEqual({ rejected: 'spans' });
    expect(edit(SPAN_BODY, { line: 2, ch: 0 }, 'colDelete')).toEqual({ rejected: 'spans' });
    expect(edit(SPAN_BODY, { line: 2, ch: 0 }, 'transpose')).toEqual({ rejected: 'spans' });
    expect(edit(SPAN_BODY, { line: 2, ch: 0 }, 'alignRight')).toEqual({ rejected: 'spans' });
  });
});

describe('editPerspectiveTable: Spalten-Ausrichtung (+cols)', () => {
  it('legt das cols-Attribut an, wenn es fehlt', () => {
    const r = edit(BODY, { line: 4, ch: 0 }, 'alignRight');
    expect(r.lines[0]).toBe('{|+cols="- right"');
  });
  it('ersetzt einen vorhandenen Wert und erhält sortable', () => {
    const body = ['{|+sortable cols="left right"', '|-', '! A', '! B', '|}'];
    const r = edit(body, { line: 2, ch: 0 }, 'alignCenter');
    expect(r.lines[0]).toBe('{|+sortable cols="center right"');
  });
  it('kürzt Platzhalter am Ende', () => {
    const body = ['{|+cols="- right"', '|-', '! A', '! B', '|}'];
    const r = edit(body, { line: 3, ch: 0 }, 'alignLeft');
    // Spalte 1 wird left; Spalte 0 bleibt Platzhalter.
    expect(r.lines[0]).toBe('{|+cols="- left"');
  });
});

describe('writeColsAttribute', () => {
  it('deckt die Schreibformen ab', () => {
    expect(writeColsAttribute('{|', ['left'])).toBe('{|+cols="left"');
    expect(writeColsAttribute('{|+sortable', [null, 'right'])).toBe('{|+sortable cols="- right"');
    expect(writeColsAttribute('{|+cols="left"', ['center'])).toBe('{|+cols="center"');
    expect(writeColsAttribute('{|+cols="left"', [null])).toBe('{|');
    expect(writeColsAttribute('{|+sortable cols="left"', [])).toBe('{|+sortable');
  });
});
