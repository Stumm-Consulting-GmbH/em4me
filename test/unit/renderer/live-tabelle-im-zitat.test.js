// @vitest-environment jsdom
// 4T-002055 (Epic 3E-000360, Stories 4S-000112 und 4S-000858): Eine Tabelle in
// einem Zitat oder einer Hinweis-Box erscheint im Live-Modus als Tabelle.
// Entschieden ist Weg A (Product Owner, 2026-10-03): Die Zitat-Präfixe werden
// für das Widget abgestreift und beim Zurückschreiben wieder angefügt.
//
// Geprüft wird an einem echten Editor-Zustand mit dem Markdown-Syntax-Baum,
// denselben Bausteinen, die der Aufbau der Block-Widgets benutzt (Muster
// live-diagramm-vorspann.test.js): der Schnitt des Widgets (Text ohne Präfixe,
// ersetzter Bereich im Dokument, Schlüssel), dass der Text als Tabelle gerendert
// wird, die Rückrechnung von Stellen und das Zurückschreiben einer Zelle und
// einer neuen Zeile mit erhaltenen Präfixen. Tabellen und Code-Blöcke außerhalb
// eines Zitats behalten ihren Schnitt (AK4). Rot-Probe im Lösungs-Kapitel der
// Aufgabe.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

import { TabelleImZitat } from '../../../src/renderer/modules/editor/tabelle-im-zitat.js';

import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { parsePipeTable } from '../../../src/shared/markdown/table-edit.js';
import {
  blockAmAnker,
  blockStelle,
  blockTextNachUebernahme,
  dokStelle,
  neueZeileFuerBlock,
  zellBereich,
  zellePosZuDokumentStelle,
} from '../../../src/renderer/modules/live/live-table-zell-kern.js';

const { buildBlockWidgetValue } =
  await import('../../../src/renderer/modules/live/live-block-field.js');
const { tabellenQuelleAm } = await import('../../../src/renderer/modules/live/live-table-zelle.js');

const Z = '`'.repeat(3);
const RASTER = ['| Monat | Umsatz |', '|---|---|', '| Januar | 10 |', '| Februar | 20 |'];

function zustand(doc) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [LezerTable, TabelleImZitat] })],
  });
  let schutz = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && schutz++ < 400) {
    /* weiter */
  }
  return state;
}

// Die Block-Widgets eines Dokuments: ersetzter Bereich, Text, Schlüssel und
// Länge im Dokument. Die Schreibmarke steht am Textende, außerhalb der Blöcke.
function widgets(doc) {
  const state = zustand(doc + '\n\nEnde');
  const auswahl = state.update({ selection: { anchor: state.doc.length } }).state;
  const liste = [];
  buildBlockWidgetValue(auswahl).deco.between(0, auswahl.doc.length, (von, bis, deko) => {
    const w = deko.spec.widget;
    if (w && w.source != null) {
      liste.push({ von, bis, source: w.source, key: String(w.cacheKey), dokLaenge: w.dokLaenge });
    }
  });
  return { state: auswahl, liste };
}

const zitat = (zeilen, praefix = '> ') => zeilen.map((z) => praefix + z).join('\n');

describe('Schnitt des Widgets: Tabelle im Zitat ohne Präfixe (AK2)', () => {
  it('einfaches Zitat: Text ohne Präfixe, ersetzt wird der Bereich im Dokument', () => {
    const doc = ['> Umsatz im ersten Quartal', '>', zitat(RASTER)].join('\n');
    const { state, liste } = widgets(doc);
    expect(liste).toHaveLength(1);
    const [w] = liste;
    expect(w.source).toBe(RASTER.join('\n'));
    expect(state.doc.sliceString(w.von, w.bis)).toBe(zitat(RASTER).slice(2));
    expect(w.dokLaenge).toBe(w.bis - w.von);
    expect(renderMarkdown(w.source, 'de')).toContain('<table');
  });

  it('doppeltes Zitat', () => {
    const { liste } = widgets(zitat(RASTER, '> > '));
    expect(liste).toHaveLength(1);
    expect(liste[0].source).toBe(RASTER.join('\n'));
    expect(renderMarkdown(liste[0].source, 'de')).toContain('<table');
  });

  it('Hinweis-Box: dieselbe Regel', () => {
    const doc = [
      '> [!note] Hinweis',
      zitat(['| Posten | Wert |', '|---|---|', '| Miete | 800 |']),
    ].join('\n');
    const { liste } = widgets(doc);
    const tabelle = liste.find((w) => w.key.startsWith('table:'));
    expect(tabelle).toBeTruthy();
    expect(tabelle.source).toBe('| Posten | Wert |\n|---|---|\n| Miete | 800 |');
    expect(renderMarkdown(tabelle.source, 'de')).toContain('<table');
  });

  it('Tabelle direkt unter einer Textzeile im Zitat ist eine Tabelle (Syntax-Baum)', () => {
    const doc = ['> Umsatz im ersten Quartal', zitat(RASTER)].join('\n');
    const { liste } = widgets(doc);
    expect(liste).toHaveLength(1);
    expect(liste[0].source).toBe(RASTER.join('\n'));
  });

  it('eine Zeile mit Strich ohne Trennzeile darunter bleibt Text', () => {
    const doc = zitat(['Text', 'a | b', 'weiter']);
    expect(widgets(doc).liste).toHaveLength(0);
  });

  it('Code-Block im Zitat: Text ohne Präfixe, die Einrückung im Code bleibt', () => {
    const doc = zitat([`${Z}js`, 'if (a) {', '  b();', '}', Z]);
    const { liste } = widgets(doc);
    expect(liste).toHaveLength(1);
    expect(liste[0].source).toBe([`${Z}js`, 'if (a) {', '  b();', '}', Z].join('\n'));
  });

  it('zwei gleiche Tabellen in verschiedener Zitat-Tiefe haben verschiedene Schlüssel', () => {
    const doc = [zitat(RASTER), '', 'Zwischen.', '', zitat(RASTER, '> > ')].join('\n');
    const { liste } = widgets(doc);
    expect(liste).toHaveLength(2);
    expect(liste[0].source).toBe(liste[1].source);
    expect(liste[0].key).not.toBe(liste[1].key);
  });
});

describe('Außerhalb eines Zitats unverändert (AK4)', () => {
  it('Tabelle: Text, Bereich und Schlüssel wie bisher', () => {
    const doc = RASTER.join('\n');
    const { liste } = widgets(doc);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ von: 0, bis: doc.length, source: doc, dokLaenge: doc.length });
    expect(liste[0].key).not.toContain(':zitat:');
  });

  it('Tabelle in einem Listen-Eintrag behält ihre Einrückung', () => {
    const doc = ['- Punkt', '', '  | a | b |', '  |---|---|', '  | 1 | 2 |'].join('\n');
    const tabelle = widgets(doc).liste.find((w) => w.key.startsWith('table:'));
    expect(tabelle.source).toBe('| a | b |\n  |---|---|\n  | 1 | 2 |');
    expect(tabelle.key).not.toContain(':zitat:');
  });

  it('Tabelle direkt unter einer Textzeile ohne Zitat: wie bisher eine Tabelle', () => {
    const doc = ['Umsatz', ...RASTER].join('\n');
    const { liste } = widgets(doc);
    expect(liste).toHaveLength(1);
    expect(liste[0].source).toBe(RASTER.join('\n'));
  });

  it('Code-Block', () => {
    const doc = [`${Z}js`, 'let a;', Z].join('\n');
    const { liste } = widgets(doc);
    expect(liste[0].source).toBe(doc);
    expect(liste[0].key).not.toContain(':zitat:');
  });
});

describe('Rückrechnung und Zurückschreiben im Zitat (AK3)', () => {
  const DOC = ['> Vorspann', '>', zitat(RASTER), '', 'Danach.'].join('\n');
  const state = zustand(DOC);
  const von = DOC.indexOf('| Monat');
  const source = RASTER.join('\n');
  const modell = parsePipeTable(RASTER);

  it('der Block wird im Dokument bestätigt und trägt die Präfixe', () => {
    const block = blockAmAnker(state.doc, von, source);
    expect(block).toBeTruthy();
    expect(block.praefixe).toEqual(['', '> ', '> ', '> ']);
    expect(state.doc.sliceString(block.from, block.to)).toBe(zitat(RASTER).slice(2));
  });

  it('der Zell-Bereich trifft die Zelle im Dokument', () => {
    const block = blockAmAnker(state.doc, von, source);
    const bereich = zellBereich(block, modell, { rowKind: 'body', rowIndex: 0, col: 1 });
    expect(state.doc.sliceString(bereich.from, bereich.to)).toBe('10');
    const kopf = zellBereich(block, modell, { rowKind: 'header', rowIndex: 0, col: 0 });
    expect(state.doc.sliceString(kopf.from, kopf.to)).toBe('Monat');
  });

  it('eine Eingabe lässt alle Präfixe stehen', () => {
    const block = blockAmAnker(state.doc, von, source);
    const bereich = zellBereich(block, modell, { rowKind: 'body', rowIndex: 0, col: 1 });
    const nach = state.update({ changes: { from: bereich.from, to: bereich.to, insert: '105' } });
    const text = nach.state.doc.toString();
    expect(text).toContain('> | Januar | 105 |');
    expect(
      text
        .split('\n')
        .slice(0, 6)
        .every((z) => z.startsWith('>')),
    ).toBe(true);
    expect(blockTextNachUebernahme(block, bereich, '105')).toBe(
      RASTER.join('\n').replace('| 10 |', '| 105 |'),
    );
  });

  it('eine neue Zeile am Ende bekommt das Präfix, die Schreibmarke ihre erste Zelle', () => {
    const block = blockAmAnker(state.doc, von, source);
    const anlage = neueZeileFuerBlock(block, source, modell.columnCount);
    expect(anlage.einfuegen.startsWith('\n> |')).toBe(true);
    const nach = state.update({ changes: { from: block.to, insert: anlage.einfuegen } }).state;
    const zeilen = nach.doc.toString().split('\n');
    expect(zeilen[6]).toMatch(/^> \|/);
    expect(zeilen[7]).toBe('');
    // Die Schreibmarke steht in der ersten Zelle der neuen Zeile.
    const zeile7 = nach.doc.line(7);
    expect(anlage.anker).toBeGreaterThan(zeile7.from + 2);
    expect(anlage.anker).toBeLessThanOrEqual(zeile7.to);
  });

  it('der Zellsprung rechnet über die Präfixe', () => {
    const imBlock = source.indexOf('Februar');
    expect(
      state.doc.sliceString(dokStelle(von, ['', '> ', '> ', '> '], source, imBlock)).slice(0, 7),
    ).toBe('Februar');
  });

  it('eine Stelle im Dokument findet ihre Zelle; eine Stelle im Präfix den Zeilenanfang', () => {
    const block = blockAmAnker(state.doc, von, source);
    const dokText = state.doc.sliceString(block.from, block.to);
    const stelle = DOC.indexOf('Februar') - von;
    const relativ = blockStelle(block.praefixe, dokText, stelle);
    expect(source.slice(relativ, relativ + 7)).toBe('Februar');
    const treffer = zellePosZuDokumentStelle(RASTER, modell, relativ);
    expect(treffer.pos).toEqual({ rowKind: 'body', rowIndex: 1, col: 0 });
    const imPraefix = DOC.indexOf('> | Februar') - von;
    expect(blockStelle(block.praefixe, dokText, imPraefix)).toBe(source.indexOf('| Februar'));
  });

  it('der Quelltext aus dem Syntax-Baum ist ohne Präfixe, wie das Widget ihn zeigt', () => {
    expect(tabellenQuelleAm(state, von)).toBe(source);
  });
});
