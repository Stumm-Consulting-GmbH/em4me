// @vitest-environment jsdom
// 4T-001345 (Epic 3E-000239): Die prüfbaren Kerne der stehenden Tabelle und
// ihrer Zell-Eingabe — die Aufklapp-Regel mit ihrer Tabellen-Ausnahme, die
// Bestätigung des Blocks im aktuellen Dokument, der Dokument-Bereich einer
// Zell-Übernahme und die Maskierung des Pipe-Zeichens.
//
// Der Weg im Ganzen braucht einen laufenden Editor und wird im E2E-Fall
// geprüft; hier stehen die vier Entscheidungen, in denen ein Irrtum still in
// die Datei des Anwenders ginge.
import { describe, it, expect } from 'vitest';
// live-deco.js haengt am Renderer-Modulgraphen; der Stub stellt den
// Preload-Namensraum bereit, den dessen Modulkoepfe erwarten (Muster
// book-panel.test.js). Der rechnende Kern selbst braucht ihn nicht.
import './api-stub.js';

import { blockIsActive, blockKlapptAuf } from '../../../src/renderer/modules/live/live-deco.js';
import {
  blockImDokument,
  maskiereZellText,
  nachbarZelle,
  zellBereich,
  zellePosZuDokumentStelle,
} from '../../../src/renderer/modules/live/live-table-zell-kern.js';
import { parsePipeTable } from '../../../src/shared/markdown/table-edit.js';

const TABELLE = ['| A | B | C |', '| --- | --- | --- |', '| a1 | b1 | c1 |'];
const QUELLE = TABELLE.join('\n');

// Minimaler Ersatz für die EditorView: Die geprüften Funktionen brauchen von
// ihr nur die DOM-Position des Widgets und den Dokument-Text.
function baueView(text, posAtDOM) {
  return {
    posAtDOM: () => posAtDOM,
    state: {
      doc: {
        length: text.length,
        sliceString: (from, to) => text.slice(from, to),
      },
    },
  };
}

describe('blockKlapptAuf (Aufklapp-Regel mit Tabellen-Ausnahme)', () => {
  const aktiv = new Set([7]);

  it('lässt eine Tabelle mit der Schreibmarke in ihr stehen (AK1)', () => {
    expect(blockKlapptAuf('Table', aktiv, 6, 9)).toBe(false);
  });

  it('klappt einen Code-Block mit der Schreibmarke in ihm weiterhin auf (AK10)', () => {
    expect(blockKlapptAuf('FencedCode', aktiv, 6, 9)).toBe(true);
  });

  it('lässt beide stehen, solange die Schreibmarke draußen ist', () => {
    const draussen = new Set([1]);
    expect(blockKlapptAuf('Table', draussen, 6, 9)).toBe(false);
    expect(blockKlapptAuf('FencedCode', draussen, 6, 9)).toBe(false);
  });

  it('ändert die Bestands-Regel nicht, auf der sie aufsetzt', () => {
    expect(blockIsActive(aktiv, 6, 9)).toBe(true);
    expect(blockIsActive(new Set([1]), 6, 9)).toBe(false);
  });
});

describe('blockImDokument (Bestätigung vor jeder Übernahme)', () => {
  it('findet den Block, wenn an der DOM-Position noch derselbe Text steht', () => {
    const doc = 'Vorspann\n\n' + QUELLE + '\n\nNachspann\n';
    const block = blockImDokument(baueView(doc, 10), null, QUELLE);
    expect(block).not.toBeNull();
    expect(block.from).toBe(10);
    expect(block.to).toBe(10 + QUELLE.length);
    expect(block.zeilen).toEqual(TABELLE);
  });

  it('verwirft, wenn das Dokument sich inzwischen unterscheidet (AK9)', () => {
    const doc = 'Vorspann\n\n' + QUELLE.replace('b1', 'X1') + '\n';
    expect(blockImDokument(baueView(doc, 10), null, QUELLE)).toBeNull();
  });

  it('verwirft, wenn der Block nicht mehr ins Dokument passt', () => {
    expect(blockImDokument(baueView('zu kurz', 0), null, QUELLE)).toBeNull();
  });

  it('verwirft, wenn die DOM-Position nicht ermittelbar ist', () => {
    const view = baueView(QUELLE, 0);
    view.posAtDOM = () => {
      throw new Error('nicht im Baum');
    };
    expect(blockImDokument(view, null, QUELLE)).toBeNull();
  });
});

describe('zellBereich (was eine Übernahme ersetzt)', () => {
  const block = { from: 100, zeilen: TABELLE };
  const modell = parsePipeTable(TABELLE);

  it('ersetzt genau den Inhalt der Datenzelle, nicht die Zeile (AK4)', () => {
    const { from, to } = zellBereich(block, modell, { rowKind: 'body', rowIndex: 0, col: 1 });
    const relativ = QUELLE.slice(from - 100, to - 100);
    expect(relativ).toBe('b1');
  });

  it('trifft ebenso die Kopfzelle', () => {
    const { from, to } = zellBereich(block, modell, { rowKind: 'header', rowIndex: 0, col: 2 });
    expect(QUELLE.slice(from - 100, to - 100)).toBe('C');
  });

  it('liefert bei leerer Zelle einen leeren Bereich im Padding', () => {
    const leer = ['| A | B |', '| --- | --- |', '|  |  |'];
    const lm = parsePipeTable(leer);
    const { from, to } = zellBereich({ from: 0, zeilen: leer }, lm, {
      rowKind: 'body',
      rowIndex: 0,
      col: 0,
    });
    expect(to).toBe(from);
    expect(leer.join('\n')[from]).toBe('|');
  });
});

describe('maskiereZellText (AK5)', () => {
  it('maskiert ein getipptes Pipe-Zeichen', () => {
    expect(maskiereZellText('a|b')).toBe('a\\|b');
  });

  it('lässt ein bereits maskiertes Pipe-Zeichen maskiert', () => {
    expect(maskiereZellText('a\\|b')).toBe('a\\|b');
  });

  it('rührt Text ohne Pipe nicht an', () => {
    expect(maskiereZellText('gewöhnlicher Text')).toBe('gewöhnlicher Text');
    expect(maskiereZellText('')).toBe('');
  });

  it('maskiert mehrere Pipe-Zeichen', () => {
    expect(maskiereZellText('a|b|c')).toBe('a\\|b\\|c');
  });
});

describe('nachbarZelle (Zellsprung, 4T-001346)', () => {
  // Zwei Datenzeilen, drei Spalten: Kopfzeile plus zwei Reihen.
  const masse = { zeilen: 2, spalten: 3 };
  const kopf = (col) => ({ rowKind: 'header', rowIndex: 0, col });
  const datenzeile = (rowIndex, col) => ({ rowKind: 'body', rowIndex, col });

  it('springt vorwaerts in derselben Zeile (AK1)', () => {
    expect(nachbarZelle(masse, kopf(0), 'vor')).toEqual(kopf(1));
    expect(nachbarZelle(masse, datenzeile(0, 0), 'vor')).toEqual(datenzeile(0, 1));
  });

  it('springt am Zeilenende in die erste Zelle der naechsten Zeile (AK2)', () => {
    expect(nachbarZelle(masse, datenzeile(0, 2), 'vor')).toEqual(datenzeile(1, 0));
  });

  it('erreicht von der Kopfzeile aus die erste Datenzeile, ohne Zwischenstopp (AK6)', () => {
    expect(nachbarZelle(masse, kopf(2), 'vor')).toEqual(datenzeile(0, 0));
  });

  it('springt rueckwaerts und ueber die Zeilen-Grenze zurueck (AK3)', () => {
    expect(nachbarZelle(masse, datenzeile(1, 0), 'zurueck')).toEqual(datenzeile(0, 2));
    expect(nachbarZelle(masse, datenzeile(0, 0), 'zurueck')).toEqual(kopf(2));
  });

  it('bleibt an den beiden Enden der Tabelle stehen (AK4)', () => {
    expect(nachbarZelle(masse, datenzeile(1, 2), 'vor')).toBeNull();
    expect(nachbarZelle(masse, kopf(0), 'zurueck')).toBeNull();
  });

  it('bleibt bei hoch und runter in der Spalte (AK5)', () => {
    expect(nachbarZelle(masse, kopf(1), 'runter')).toEqual(datenzeile(0, 1));
    expect(nachbarZelle(masse, datenzeile(0, 1), 'runter')).toEqual(datenzeile(1, 1));
    expect(nachbarZelle(masse, datenzeile(0, 1), 'hoch')).toEqual(kopf(1));
    expect(nachbarZelle(masse, datenzeile(1, 2), 'runter')).toBeNull();
    expect(nachbarZelle(masse, kopf(2), 'hoch')).toBeNull();
  });

  it('traegt eine Tabelle ohne Datenzeilen', () => {
    const nurKopf = { zeilen: 0, spalten: 2 };
    expect(nachbarZelle(nurKopf, kopf(0), 'vor')).toEqual(kopf(1));
    expect(nachbarZelle(nurKopf, kopf(1), 'vor')).toBeNull();
    expect(nachbarZelle(nurKopf, kopf(0), 'runter')).toBeNull();
  });

  it('klemmt eine Spalte ausserhalb der Tabelle', () => {
    expect(nachbarZelle(masse, kopf(99), 'zurueck')).toEqual(kopf(1));
  });
});

describe('zellePosZuDokumentStelle (der eine Weg in eine Zelle)', () => {
  const modell = parsePipeTable(TABELLE);
  const stelleVon = (text) => QUELLE.indexOf(text);

  it('findet die Datenzelle und die Stelle darin', () => {
    const treffer = zellePosZuDokumentStelle(TABELLE, modell, stelleVon('b1') + 1);
    expect(treffer.pos).toEqual({ rowKind: 'body', rowIndex: 0, col: 1 });
    expect(treffer.offset).toBe(1);
  });

  it('findet die Kopfzelle', () => {
    const treffer = zellePosZuDokumentStelle(TABELLE, modell, stelleVon('| C |') + 2);
    expect(treffer.pos).toEqual({ rowKind: 'header', rowIndex: 0, col: 2 });
  });

  it('gibt die Trennzeile an die Kopfzeile derselben Spalte weiter', () => {
    const trennzeile = QUELLE.indexOf(TABELLE[1]);
    const treffer = zellePosZuDokumentStelle(TABELLE, modell, trennzeile + 2);
    expect(treffer.pos.rowKind).toBe('header');
  });

  it('liefert nichts jenseits des Blocks', () => {
    expect(zellePosZuDokumentStelle(TABELLE, modell, QUELLE.length + 50)).toBeNull();
  });
});
