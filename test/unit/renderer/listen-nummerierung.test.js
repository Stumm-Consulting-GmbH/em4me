// @vitest-environment jsdom
// 4T-000655 (Epic 3E-000112): Nummerierungs-Invariante — Trigger-Bedingungen des
// Transaktions-Filters. Geprüft wird ohne EditorView, allein über
// EditorState.update: der Filter hängt an der Transaktion und wirkt damit
// auch hier. Die Bedienung über die Tastatur deckt FB-12 in
// test/e2e/funktionen/bearbeitung-und-ansicht.spec.js ab.
import { describe, it, expect, afterEach } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const listTools = await import('../../../src/renderer/modules/editor/editor-list-tools.js');
// 4T-002343: Haupt-Editor mit den Belegungen der Anwendung, Erweiterungs-Schalter
// und Render-Pipeline für den Gleichlauf von Quelltext und Anzeige.
const { EditorView, runScopeHandlers } = await import('@codemirror/view');
const { createEditorState } = await import('../../../src/renderer/modules/editor/editor.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const { renderMarkdown } = await import('../../../src/shared/markdown/markdown.js');

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

describe('Nummerierungs-Invariante (4T-000655)', () => {
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
    // programmatische Aenderung dieses Tests (Befund aus 4T-000640). Die
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
    // listRestartPlugin die Nummer am ersten Punkt zuruecksetzt (4T-000660).
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
    // Anzeige zeigt seit 4T-000660 dieselbe Nummer.
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

// 4T-002343 (Epic 3E-000365, Story 4S-001099, AK2 bis AK5): Eine Leerzeile in
// einem eingerückten Code-Block eines nummerierten Punkts ist keine Grenze der
// Liste. Gemessen am Tastendruck einer echten Editor-Ansicht (Bauart
// listen-zeilenumbruch.test.js), mit und ohne «Listen-Struktur»; der Editor
// wird beschreibbar geöffnet, sonst bliebe jeder Tastendruck wirkungslos. Der
// Gleichlauf mit der Anzeige wird an der Render-Pipeline geprüft: Jeder
// nummerierte Punkt zeigt dort dieselbe Nummer wie im Quelltext.
describe('Code-Block mit Leerzeile in einer nummerierten Liste (4T-002343)', () => {
  const offen = [];
  afterEach(() => {
    while (offen.length) offen.pop().destroy();
  });

  async function ansicht(doc, marke, { listenStruktur }) {
    lebenszyklus.resetExtensionStateForTests();
    await lebenszyklus.applyExtensionsState(listenStruktur ? [] : ['outliner'], { persist: false });
    const view = new EditorView({
      state: createEditorState({ content: doc, readOnly: false }),
      parent: document.body,
    });
    offen.push(view);
    view.dispatch({ selection: { anchor: view.state.doc.line(marke[0]).from + marke[1] } });
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    return view;
  }

  function taste(view, shift = false) {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true });
    return runScopeHandlers(view, event, 'editor');
  }

  // Angezeigte Nummer je nummeriertem Punkt der Anzeige neben der Nummer im
  // Quelltext derselben Zeile (Zeilen-Zuordnung über data-source-line).
  function nummernVergleich(quelltext) {
    const zeilen = quelltext.split('\n');
    const dom = new DOMParser().parseFromString(renderMarkdown(quelltext, 'de'), 'text/html');
    const paare = [];
    for (const ol of dom.querySelectorAll('ol')) {
      let nummer = (ol.hasAttribute('start') ? Number(ol.getAttribute('start')) : 1) - 1;
      for (const li of ol.children) {
        nummer = li.hasAttribute('value') ? Number(li.getAttribute('value')) : nummer + 1;
        const zeile = zeilen[Number(li.getAttribute('data-source-line')) - 1];
        paare.push({ anzeige: nummer, quelltext: parseInt(zeile.trim(), 10) });
      }
    }
    return paare;
  }

  const block = (einzug, zeilen) => zeilen.map((z) => (z ? einzug + z : z)).join('\n');

  for (const listenStruktur of [true, false]) {
    const art = listenStruktur ? 'mit' : 'ohne';
    for (const zaun of ['```', '~~~']) {
      it(`${art} «Listen-Struktur», Zaun «${zaun}»: nach Tab auf «2. B» heißt die letzte Zeile «2. C», Umschalt+Tab stellt alles her`, async () => {
        const inhalt = [zaun, 'eins', '', '', 'zwei', zaun];
        const doc = `1. A\n2. B\n${block('   ', inhalt)}\n3. C`;
        const view = await ansicht(doc, [2, 4], { listenStruktur });
        expect(taste(view)).toBe(true);
        const nachTab = view.state.doc.toString();
        expect(nachTab).toBe(`1. A\n   1. B\n${block('      ', inhalt)}\n2. C`);
        for (const paar of nummernVergleich(nachTab)) expect(paar.anzeige).toBe(paar.quelltext);
        expect(taste(view, true)).toBe(true);
        expect(view.state.doc.toString()).toBe(doc);
        for (const paar of nummernVergleich(doc)) expect(paar.anzeige).toBe(paar.quelltext);
      });
    }

    it(`${art} «Listen-Struktur»: Zeilen im Block, die wie nummerierte Punkte aussehen, bleiben unberührt`, async () => {
      const inhalt = ['```', '5. kein Punkt', '', '9. auch keiner', '```'];
      const doc = `1. A\n2. B\n${block('   ', inhalt)}\n3. C`;
      const view = await ansicht(doc, [2, 4], { listenStruktur });
      expect(taste(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(`1. A\n   1. B\n${block('      ', inhalt)}\n2. C`);
    });

    it(`${art} «Listen-Struktur»: eine Leerzeile außerhalb des Blocks trennt weiter (AK4)`, async () => {
      const doc = `1. A\n2. B\n${block('   ', ['```', 'x', '```'])}\n\n1. C\n2. D`;
      const view = await ansicht(doc, [2, 4], { listenStruktur });
      expect(taste(view)).toBe(true);
      const nachTab = view.state.doc.toString();
      expect(nachTab).toBe(`1. A\n   1. B\n${block('      ', ['```', 'x', '```'])}\n\n1. C\n2. D`);
      for (const paar of nummernVergleich(nachTab)) expect(paar.anzeige).toBe(paar.quelltext);
    });
  }

  // Gegenprobe des Vergleichs: Der Quelltext, den die Nummerierung vor
  // 4T-002343 hinterließ, zeigt im Quelltext «3.», in der Anzeige 2.
  it('der Vergleich mit der Anzeige erkennt den früheren Fehl-Stand (Nicht-Vakuität)', () => {
    const alt = `1. A\n   1. B\n${block('      ', ['```', 'eins', '', 'zwei', '```'])}\n3. C`;
    expect(nummernVergleich(alt)).toContainEqual({ anzeige: 2, quelltext: 3 });
  });

  it('eine im Block geleerte Zeile beginnt keine neue Liste dahinter', () => {
    const state = stateFor('1. A\n2. B\n   ```\n   eins\n   zwei\n   ```\n3. C\n4. D\n');
    const zeile = state.doc.line(4);
    const tr = state.update({
      changes: { from: zeile.from, to: zeile.to },
      userEvent: 'delete.backward',
    });
    expect(tr.state.doc.toString()).toBe('1. A\n2. B\n   ```\n\n   zwei\n   ```\n3. C\n4. D\n');
  });
});
