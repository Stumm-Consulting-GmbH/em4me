// 4T-000589 (Epic 3E-000109): Unit-Matrix für den Pipe-Tabellen-Bearbeitungs-Kern
// (src/shared/markdown/table-edit.js). Deckt Voll-Parser (Ausrichtungs-Zeile,
// randlose Form, escapte Pipes, Auffüllung), Serialisierer (Rand-Pipe-
// Normalisierung, Spalten-Padding, Round-Trip), alle Operationen inklusive
// Kanten (erste/letzte Zeile/Spalte, Kopf-Schutz, letzte Spalte) sowie
// Cursor-Lokalisierung, Verfügbarkeits-Matrix und den High-Level-Einstieg
// editPipeTable ab.
import { describe, it, expect } from 'vitest';
import {
  isSeparatorLine,
  parsePipeTable,
  serializePipeTable,
  locatePipeCell,
  pipeOpAvailability,
  applyPipeOp,
  editPipeTable,
} from '../../src/shared/markdown/table-edit.js';

const BASIC = ['| A | B | C |', '| --- | :-: | ---: |', '| a1 | b1 | c1 |', '| a2 | b2 | c2 |'];

function edit(lines, cursor, op) {
  return editPipeTable(lines, cursor, op);
}

describe('isSeparatorLine', () => {
  it('erkennt Trenn-Zeilen mit allen Ausrichtungs-Markern', () => {
    expect(isSeparatorLine('| --- | :--- | :---: | ---: |')).toBe(true);
    expect(isSeparatorLine('|-|:-:|')).toBe(true);
  });
  it('lehnt Inhalts- und Leer-Zeilen ab', () => {
    expect(isSeparatorLine('| a | b |')).toBe(false);
    expect(isSeparatorLine('| --- | b |')).toBe(false);
    expect(isSeparatorLine('')).toBe(false);
  });
});

describe('parsePipeTable', () => {
  it('liest Kopf, Ausrichtung und Zeilen', () => {
    const m = parsePipeTable(BASIC);
    expect(m.header).toEqual(['A', 'B', 'C']);
    expect(m.align).toEqual([null, 'center', 'right']);
    expect(m.rows).toEqual([
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
    ]);
    expect(m.columnCount).toBe(3);
    expect(m.hasSeparator).toBe(true);
  });
  it('liest die randlose Form (virtuelle Randzellen)', () => {
    const m = parsePipeTable(['A | B', '--- | :---', 'a1 | b1']);
    expect(m.header).toEqual(['A', 'B']);
    expect(m.align).toEqual([null, 'left']);
    expect(m.rows).toEqual([['a1', 'b1']]);
  });
  it('toleriert eine fehlende Trenn-Zeile (Tabelle im Aufbau)', () => {
    const m = parsePipeTable(['| A | B |', '| a1 | b1 |']);
    expect(m.hasSeparator).toBe(false);
    expect(m.align).toEqual([null, null]);
    expect(m.rows).toEqual([['a1', 'b1']]);
  });
  it('füllt unterschiedliche Zellen-Anzahlen auf die maximale Spaltenzahl auf', () => {
    const m = parsePipeTable(['| A |', '| --- |', '| a1 | b1 | c1 |']);
    expect(m.columnCount).toBe(3);
    expect(m.header).toEqual(['A', '', '']);
    expect(m.rows[0]).toEqual(['a1', 'b1', 'c1']);
  });
  it('erhält escapte Pipes im Zell-Text', () => {
    const m = parsePipeTable(['| a \\| b | c |', '| --- | --- |']);
    expect(m.header).toEqual(['a \\| b', 'c']);
  });
  it('liefert null ohne erkennbare Tabelle', () => {
    expect(parsePipeTable([])).toBe(null);
    expect(parsePipeTable(['kein Inhalt'])).toBe(null);
  });
});

describe('serializePipeTable', () => {
  it('normalisiert auf die Rand-Pipe-Form mit Spalten-Padding', () => {
    const m = parsePipeTable(['A | B', '--- | ---', 'lang | b']);
    expect(serializePipeTable(m)).toEqual(['| A    | B   |', '| ---- | --- |', '| lang | b   |']);
  });
  it('schreibt die Ausrichtungs-Marker in voller Spaltenbreite', () => {
    const m = parsePipeTable(['| Kopf | Mitte | Rechts |', '| :--- | :---: | ---: |']);
    expect(serializePipeTable(m)[1]).toBe('| :--- | :---: | -----: |');
  });
  it('ergänzt eine fehlende Trenn-Zeile', () => {
    const m = parsePipeTable(['| A | B |', '| a1 | b1 |']);
    expect(serializePipeTable(m)[1]).toBe('| --- | --- |');
  });
  it('Round-Trip erhält Inhalt und Ausrichtung, Serialisierung ist idempotent', () => {
    const once = serializePipeTable(parsePipeTable(BASIC));
    const twice = serializePipeTable(parsePipeTable(once));
    expect(twice).toEqual(once);
    const m = parsePipeTable(once);
    expect(m.header).toEqual(['A', 'B', 'C']);
    expect(m.align).toEqual([null, 'center', 'right']);
    expect(m.rows[1]).toEqual(['a2', 'b2', 'c2']);
  });
});

describe('locatePipeCell', () => {
  const m = parsePipeTable(BASIC);
  it('ordnet Kopf-, Trenn- und Datenzeilen zu', () => {
    expect(locatePipeCell(BASIC, m, 0, 2)).toEqual({ rowKind: 'header', rowIndex: 0, col: 0 });
    expect(locatePipeCell(BASIC, m, 1, 2)).toEqual({ rowKind: 'separator', rowIndex: 0, col: 0 });
    expect(locatePipeCell(BASIC, m, 3, 7)).toEqual({ rowKind: 'body', rowIndex: 1, col: 1 });
  });
  it('klemmt Zeilen- und Spalten-Offsets an die Ränder', () => {
    expect(locatePipeCell(BASIC, m, 9, 0).rowIndex).toBe(1);
    expect(locatePipeCell(BASIC, m, 2, 999).col).toBe(2);
  });
});

describe('pipeOpAvailability', () => {
  const m = parsePipeTable(BASIC);
  it('schützt Kopf-/Trenn-Zeile vor Zeilen-Verschieben und -Löschen', () => {
    const a = pipeOpAvailability(m, { rowKind: 'header', rowIndex: 0, col: 0 });
    expect(a.rowUp).toBe(false);
    expect(a.rowDown).toBe(false);
    expect(a.rowDelete).toBe(false);
    expect(a.rowInsert).toBe(true);
    expect(a.transpose).toBe(true);
  });
  it('deaktiviert Richtungen an den Rändern', () => {
    expect(pipeOpAvailability(m, { rowKind: 'body', rowIndex: 0, col: 0 })).toMatchObject({
      rowUp: false,
      rowDown: true,
      colLeft: false,
      colRight: true,
    });
    expect(pipeOpAvailability(m, { rowKind: 'body', rowIndex: 1, col: 2 })).toMatchObject({
      rowUp: true,
      rowDown: false,
      colLeft: true,
      colRight: false,
    });
  });
  it('schützt die letzte Spalte vor dem Löschen', () => {
    const single = parsePipeTable(['| A |', '| --- |', '| a |']);
    expect(pipeOpAvailability(single, { rowKind: 'body', rowIndex: 0, col: 0 }).colDelete).toBe(
      false,
    );
  });
});

describe('applyPipeOp: Ausrichtung', () => {
  const m = parsePipeTable(BASIC);
  it('setzt die Spalten-Ausrichtung der Cursor-Spalte', () => {
    const r = applyPipeOp(m, 'alignLeft', { rowKind: 'body', rowIndex: 0, col: 0 });
    expect(r.model.align).toEqual(['left', 'center', 'right']);
    const r2 = applyPipeOp(m, 'alignCenter', { rowKind: 'header', rowIndex: 0, col: 2 });
    expect(r2.model.align).toEqual([null, 'center', 'center']);
    const r3 = applyPipeOp(m, 'alignRight', { rowKind: 'separator', rowIndex: 0, col: 0 });
    expect(r3.model.align).toEqual(['right', 'center', 'right']);
  });
  it('lässt das Eingabe-Modell unverändert (reine Funktion)', () => {
    applyPipeOp(m, 'alignLeft', { rowKind: 'body', rowIndex: 0, col: 0 });
    expect(m.align).toEqual([null, 'center', 'right']);
  });
});

describe('applyPipeOp: Zeilen', () => {
  const m = parsePipeTable(BASIC);
  it('verschiebt Datenzeilen und führt den Cursor mit', () => {
    const up = applyPipeOp(m, 'rowUp', { rowKind: 'body', rowIndex: 1, col: 1 });
    expect(up.model.rows).toEqual([
      ['a2', 'b2', 'c2'],
      ['a1', 'b1', 'c1'],
    ]);
    expect(up.cursor).toEqual({ rowKind: 'body', rowIndex: 0, col: 1 });
    const down = applyPipeOp(m, 'rowDown', { rowKind: 'body', rowIndex: 0, col: 0 });
    expect(down.model.rows[1]).toEqual(['a1', 'b1', 'c1']);
    expect(down.cursor.rowIndex).toBe(1);
  });
  it('No-op an den Rändern, Ablehnung auf Kopf-/Trenn-Zeile', () => {
    expect(applyPipeOp(m, 'rowUp', { rowKind: 'body', rowIndex: 0, col: 0 })).toBe(null);
    expect(applyPipeOp(m, 'rowDown', { rowKind: 'body', rowIndex: 1, col: 0 })).toBe(null);
    expect(applyPipeOp(m, 'rowUp', { rowKind: 'header', rowIndex: 0, col: 0 })).toEqual({
      rejected: 'header',
    });
    expect(applyPipeOp(m, 'rowDelete', { rowKind: 'separator', rowIndex: 0, col: 0 })).toEqual({
      rejected: 'header',
    });
  });
  it('fügt eine Leerzeile nach der Cursor-Zeile ein (Kopf: als erste Datenzeile)', () => {
    const r = applyPipeOp(m, 'rowInsert', { rowKind: 'body', rowIndex: 0, col: 2 });
    expect(r.model.rows).toEqual([
      ['a1', 'b1', 'c1'],
      ['', '', ''],
      ['a2', 'b2', 'c2'],
    ]);
    expect(r.cursor).toEqual({ rowKind: 'body', rowIndex: 1, col: 0 });
    const fromHeader = applyPipeOp(m, 'rowInsert', { rowKind: 'header', rowIndex: 0, col: 0 });
    expect(fromHeader.model.rows[0]).toEqual(['', '', '']);
    expect(fromHeader.cursor.rowIndex).toBe(0);
  });
  it('löscht Datenzeilen und klemmt den Cursor', () => {
    const r = applyPipeOp(m, 'rowDelete', { rowKind: 'body', rowIndex: 1, col: 1 });
    expect(r.model.rows).toEqual([['a1', 'b1', 'c1']]);
    expect(r.cursor).toEqual({ rowKind: 'body', rowIndex: 0, col: 1 });
    const only = parsePipeTable(['| A |', '| --- |', '| a |']);
    const last = applyPipeOp(only, 'rowDelete', { rowKind: 'body', rowIndex: 0, col: 0 });
    expect(last.model.rows).toEqual([]);
    expect(last.cursor.rowKind).toBe('header');
  });
});

describe('applyPipeOp: Spalten', () => {
  const m = parsePipeTable(BASIC);
  it('verschiebt Spalten samt Ausrichtung und führt den Cursor mit', () => {
    const left = applyPipeOp(m, 'colLeft', { rowKind: 'body', rowIndex: 0, col: 1 });
    expect(left.model.header).toEqual(['B', 'A', 'C']);
    expect(left.model.align).toEqual(['center', null, 'right']);
    expect(left.model.rows[0]).toEqual(['b1', 'a1', 'c1']);
    expect(left.cursor.col).toBe(0);
    const right = applyPipeOp(m, 'colRight', { rowKind: 'header', rowIndex: 0, col: 1 });
    expect(right.model.header).toEqual(['A', 'C', 'B']);
    expect(right.model.align).toEqual([null, 'right', 'center']);
    expect(right.cursor.col).toBe(2);
  });
  it('No-op an den Spalten-Rändern', () => {
    expect(applyPipeOp(m, 'colLeft', { rowKind: 'body', rowIndex: 0, col: 0 })).toBe(null);
    expect(applyPipeOp(m, 'colRight', { rowKind: 'body', rowIndex: 0, col: 2 })).toBe(null);
  });
  it('fügt eine leere Spalte nach der Cursor-Spalte ein', () => {
    const r = applyPipeOp(m, 'colInsert', { rowKind: 'body', rowIndex: 0, col: 0 });
    expect(r.model.header).toEqual(['A', '', 'B', 'C']);
    expect(r.model.align).toEqual([null, null, 'center', 'right']);
    expect(r.model.rows[1]).toEqual(['a2', '', 'b2', 'c2']);
    expect(r.model.columnCount).toBe(4);
    expect(r.cursor.col).toBe(1);
  });
  it('löscht die Cursor-Spalte, schützt die letzte Spalte', () => {
    const r = applyPipeOp(m, 'colDelete', { rowKind: 'body', rowIndex: 0, col: 1 });
    expect(r.model.header).toEqual(['A', 'C']);
    expect(r.model.align).toEqual([null, 'right']);
    expect(r.model.rows[0]).toEqual(['a1', 'c1']);
    expect(r.cursor.col).toBe(1);
    const single = parsePipeTable(['| A |', '| --- |']);
    expect(applyPipeOp(single, 'colDelete', { rowKind: 'header', rowIndex: 0, col: 0 })).toEqual({
      rejected: 'lastColumn',
    });
  });
});

describe('applyPipeOp: Transponieren', () => {
  it('macht die Kopfzeile zur ersten Spalte und setzt Ausrichtungen zurück', () => {
    const m = parsePipeTable(BASIC);
    const r = applyPipeOp(m, 'transpose', { rowKind: 'body', rowIndex: 1, col: 1 });
    expect(r.model.header).toEqual(['A', 'a1', 'a2']);
    expect(r.model.rows).toEqual([
      ['B', 'b1', 'b2'],
      ['C', 'c1', 'c2'],
    ]);
    expect(r.model.align).toEqual([null, null, null]);
    expect(r.model.columnCount).toBe(3);
    expect(r.cursor).toEqual({ rowKind: 'header', rowIndex: 0, col: 0 });
  });
  it('doppeltes Transponieren stellt die Struktur wieder her', () => {
    const m = parsePipeTable(BASIC);
    const once = applyPipeOp(m, 'transpose', { rowKind: 'header', rowIndex: 0, col: 0 });
    const twice = applyPipeOp(once.model, 'transpose', { rowKind: 'header', rowIndex: 0, col: 0 });
    expect(twice.model.header).toEqual(m.header);
    expect(twice.model.rows).toEqual(m.rows);
  });
});

describe('editPipeTable (High-Level)', () => {
  it('liefert neue Block-Zeilen samt Cursor in der Ziel-Zelle', () => {
    const r = edit(BASIC, { line: 3, ch: 7 }, 'rowUp');
    expect(r.lines).toEqual([
      '| A   | B   | C   |',
      '| --- | :-: | --: |',
      '| a2  | b2  | c2  |',
      '| a1  | b1  | c1  |',
    ]);
    expect(r.cursor.line).toBe(2);
    expect(r.lines[r.cursor.line].slice(r.cursor.ch)).toMatch(/^b2/);
  });
  it('normalisiert eine randlose Tabelle beim ersten Eingriff', () => {
    const r = edit(['A | B', '--- | ---', 'a | b'], { line: 0, ch: 0 }, 'alignRight');
    expect(r.lines).toEqual(['| A   | B   |', '| --: | --- |', '| a   | b   |']);
  });
  it('reicht Ablehnungen und No-ops durch', () => {
    expect(edit(BASIC, { line: 0, ch: 2 }, 'rowUp')).toEqual({ rejected: 'header' });
    expect(edit(BASIC, { line: 2, ch: 2 }, 'rowUp')).toBe(null);
    expect(edit(['kein Inhalt'], { line: 0, ch: 0 }, 'rowUp')).toBe(null);
  });
  it('setzt den Cursor beim Einfügen in die neue Zeile', () => {
    const r = edit(BASIC, { line: 2, ch: 2 }, 'rowInsert');
    expect(r.lines[3]).toBe('|     |     |     |');
    expect(r.cursor.line).toBe(3);
  });
  it('erhält escapte Pipes über eine Operation hinweg', () => {
    const lines = ['| a \\| x | b |', '| --- | --- |', '| c | d |'];
    const r = edit(lines, { line: 2, ch: 2 }, 'colRight');
    expect(r.lines[0]).toContain('a \\| x');
  });
});
