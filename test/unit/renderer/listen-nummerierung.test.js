// @vitest-environment jsdom
// 4T-0655 (Epic 3E-0112): Nummerierungs-Invariante — Trigger-Bedingungen des
// Transaktions-Filters. Geprüft wird ohne EditorView, allein über
// EditorState.update: der Filter hängt an der Transaktion und wirkt damit
// auch hier. Die Bedienung über die Tastatur deckt FB-12 in
// test/e2e/funktionen/bearbeitung-und-ansicht.spec.js ab.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const listTools = await import('../../../src/renderer/modules/editor-list-tools.js');

function stateFor(doc, { readOnly = false } = {}) {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({ extensions: [LezerTable] }),
      EditorState.readOnly.of(readOnly),
      EditorState.transactionFilter.of(listTools.listRenumberFilter),
    ],
  });
  // Budgetiertes Parsen wie im Lint-Pfad (Muster struktur-und-state.test.js).
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter */
  }
  return state;
}

// Entfernt den Zeilenumbruch vor der Leerzeile mit der Nummer `line`, führt
// also die beiden angrenzenden Blöcke zusammen.
function removeBlankLine(state, line, userEvent = 'delete.backward') {
  const from = state.doc.line(line - 1).to;
  const to = state.doc.line(line).to;
  return state.update({ changes: { from, to }, userEvent });
}

const ZWEI_LISTEN = '1. Erste A\n2. Erste B\n\n1. Zweite A\n2. Zweite B\n';

describe('Nummerierungs-Invariante (4T-0655)', () => {
  it('zaehlt nach dem Verschmelzen zweier Listen durch', () => {
    const tr = removeBlankLine(stateFor(ZWEI_LISTEN), 3);
    expect(tr.state.doc.toString()).toBe('1. Erste A\n2. Erste B\n3. Zweite A\n4. Zweite B\n');
  });

  it('greift nicht bei Rueckgaengig und Wiederherstellen', () => {
    // Sonst waere die Korrektur selbst nicht zurueckzunehmen.
    const tr = removeBlankLine(stateFor(ZWEI_LISTEN), 3, 'undo');
    expect(tr.state.doc.toString()).toBe('1. Erste A\n2. Erste B\n1. Zweite A\n2. Zweite B\n');
  });

  it('greift nicht ohne Nutzer-Ereignis (etwa beim Laden einer Datei)', () => {
    const state = stateFor(ZWEI_LISTEN);
    const from = state.doc.line(2).to;
    const to = state.doc.line(3).to;
    const tr = state.update({ changes: { from, to } });
    expect(tr.state.doc.toString()).toBe('1. Erste A\n2. Erste B\n1. Zweite A\n2. Zweite B\n');
  });

  it('greift nicht im Schreibschutz', () => {
    // EditorState.readOnly blockiert nur den Eingabepfad, nicht die
    // programmatische Aenderung dieses Tests (Befund aus 4T-0640). Die
    // Leerzeile verschwindet hier deshalb, die Nummern bleiben aber
    // unangetastet — genau das prueft der Fall.
    const tr = removeBlankLine(stateFor(ZWEI_LISTEN, { readOnly: true }), 3);
    expect(tr.state.doc.toString()).toBe('1. Erste A\n2. Erste B\n1. Zweite A\n2. Zweite B\n');
  });

  it('korrigiert eine Luecke beim Loeschen einer Zeile mitten in der Liste', () => {
    const state = stateFor('1. A\n2. B\n3. C\n');
    const from = state.doc.line(1).to;
    const to = state.doc.line(2).to;
    const tr = state.update({ changes: { from, to }, userEvent: 'delete.forward' });
    expect(tr.state.doc.toString()).toBe('1. A\n2. C\n');
  });

  it('beginnt beim Einfuegen einer Leerzeile eine neue Liste bei 1', () => {
    // Die Leerzeile trennt (PO-Festlegung). Weil sie eben erst entstanden
    // ist, sind die Nummern dahinter Reste der vorherigen Zaehlung: Die neue
    // Liste beginnt deshalb bei 1. Die Anzeige zeigt dasselbe, weil
    // listRestartPlugin die Nummer am ersten Punkt zuruecksetzt (4T-0660).
    const state = stateFor('1. A\n2. B\n3. C\n4. D\n');
    const tr = state.update({
      changes: { from: state.doc.line(2).to, insert: '\n' },
      userEvent: 'input',
    });
    expect(tr.state.doc.toString()).toBe('1. A\n2. B\n\n1. C\n2. D\n');
  });

  it('behandelt jede Liste hinter einem Absatz getrennt', () => {
    const state = stateFor('1. A\n2. B\n\nAbsatz\n\n7. C\n9. D\n');
    const from = state.doc.line(6).to;
    const tr = state.update({ changes: { from, insert: ' x' }, userEvent: 'input' });
    expect(tr.state.doc.toString()).toBe('1. A\n2. B\n\nAbsatz\n\n7. C x\n8. D\n');
  });

  it('setzt die Liste hinter einer frisch geleerten Zeile auf 1 zurueck', () => {
    // Befund des Product Owners: Aus einer durchgehenden Liste entsteht per
    // Eingabetaste ein Punkt, dessen Marker sofort wieder geloescht wird. Die
    // zurueckbleibende Leerzeile trennt; die Nummern dahinter stammen aus der
    // vorherigen Zaehlung und sind keine bewusst gesetzte Startnummer.
    const state = stateFor('1. A\n2. B\n3. \n4. C\n5. D\n');
    const line = state.doc.line(3);
    const tr = state.update({
      changes: { from: line.from, to: line.to },
      userEvent: 'delete.forward',
    });
    expect(tr.state.doc.toString()).toBe('1. A\n2. B\n\n1. C\n2. D\n');
  });

  it('haelt die Startnummer einer Liste hinter einer bestehenden Leerzeile', () => {
    // Aus dem zweiten Befund des Product Owners: Enter erzeugt einen Punkt,
    // dessen Marker wieder geloescht wird. Die Zeilen darunter bilden damit
    // eine eigene Liste, die bei ihrer vorgefundenen Nummer beginnt — die
    // Anzeige zeigt seit 4T-0660 dieselbe Nummer.
    const state = stateFor('1. Alpha\n2. Bravo\n\n4. Charlie\n6. Delta\n');
    const from = state.doc.line(4).to;
    const tr = state.update({ changes: { from, insert: '!' }, userEvent: 'input' });
    expect(tr.state.doc.toString()).toBe('1. Alpha\n2. Bravo\n\n4. Charlie!\n5. Delta\n');
  });

  it('laesst Ziffernzeilen in Code-Bloecken unberuehrt', () => {
    const state = stateFor('1. A\n\n```\n3. kein Punkt\n4. auch nicht\n```\n\n2. B\n');
    const tr = removeBlankLine(state, 7);
    expect(tr.state.doc.toString()).toContain('3. kein Punkt\n4. auch nicht');
  });

  it('erhaelt die Startnummer der ersten Liste', () => {
    const state = stateFor('5. A\n6. B\n\n1. C\n2. D\n');
    const tr = removeBlankLine(state, 3);
    expect(tr.state.doc.toString()).toBe('5. A\n6. B\n7. C\n8. D\n');
  });
});
