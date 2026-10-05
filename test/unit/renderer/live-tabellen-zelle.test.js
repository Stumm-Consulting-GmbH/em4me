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
import { ChangeSet, EditorState, Text } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
// live-deco.js haengt am Renderer-Modulgraphen; der Stub stellt den
// Preload-Namensraum bereit, den dessen Modulkoepfe erwarten (Muster
// book-panel.test.js). Der rechnende Kern selbst braucht ihn nicht.
import './api-stub.js';

import { blockIsActive, blockKlapptAuf } from '../../../src/renderer/modules/live/live-deco.js';
import {
  ankerNachAenderung,
  blockAmAnker,
  blockImDokument,
  blockTextNachUebernahme,
  legtTabulatorZeileAn,
  maskiereZellText,
  nachbarZelle,
  neueZeileAmEnde,
  tabellenMasse,
  zellBereich,
  zellePosZuDokumentStelle,
  zellTextAn,
} from '../../../src/renderer/modules/live/live-table-zell-kern.js';
import { parsePipeTable } from '../../../src/shared/markdown/table-edit.js';
import { tabellenQuelleAm } from '../../../src/renderer/modules/live/live-table-zelle.js';

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

// 4T-001712 (Epic 3E-000300): Die Übernahme findet ihren Block über eine
// Dokument-Stelle, die jede Änderung fortschreibt — nicht mehr über den
// Anzeige-Knoten, den der Editor beim Neuzeichnen der Zeile austauscht.
describe('Dokument-Anker des Blocks (Übernahme auf jedem Weg, 4T-001712)', () => {
  const VORSPANN = 'Vorspann\n\n';
  const DOC = VORSPANN + QUELLE + '\n\nNachspann\n';
  const VON = VORSPANN.length;

  // Wendet eine Änderung auf das Dokument an und schreibt den Anker fort —
  // genau das, was der Beobachter der Zell-Eingabe bei jeder Transaktion tut.
  function aendere(spec) {
    const doc = Text.of(DOC.split('\n'));
    const changes = ChangeSet.of(spec, doc.length);
    const neu = changes.apply(doc);
    const anker = ankerNachAenderung(VON, changes);
    return { anker, block: blockAmAnker(neu, anker, QUELLE) };
  }

  it('findet den Block an seiner Stelle, solange dort derselbe Text steht', () => {
    const block = blockAmAnker(Text.of(DOC.split('\n')), VON, QUELLE);
    expect(block).toEqual({ from: VON, to: VON + QUELLE.length, zeilen: TABELLE });
  });

  it('folgt einer Einfügung vor dem Block', () => {
    const { anker, block } = aendere({ from: 0, insert: 'Neu: ' });
    expect(anker).toBe(VON + 5);
    expect(block.from).toBe(VON + 5);
  });

  it('folgt einer Löschung vor dem Block', () => {
    const { anker, block } = aendere({ from: 0, to: 4 });
    expect(anker).toBe(VON - 4);
    expect(block.zeilen).toEqual(TABELLE);
  });

  it('bleibt vor einer Einfügung genau an seiner Stelle stehen, die ihn nach hinten schiebt', () => {
    const { anker, block } = aendere({ from: VON, insert: 'Absatz\n\n' });
    expect(anker).toBe(VON + 'Absatz\n\n'.length);
    expect(block).not.toBeNull();
  });

  it('bleibt bei einer Änderung dahinter unverändert', () => {
    const { anker, block } = aendere({ from: DOC.length - 1, insert: 'Ende' });
    expect(anker).toBe(VON);
    expect(block.from).toBe(VON);
  });

  it('schreibt nichts, wenn die Tabelle selbst von anderer Seite geändert wurde (AK6)', () => {
    const stelle = VON + QUELLE.indexOf('b1');
    const { anker, block } = aendere({ from: stelle, to: stelle + 2, insert: 'X1' });
    expect(anker).toBe(VON);
    expect(block).toBeNull();
  });

  it('nennt den Text der Zelle an einer logischen Stelle, auch nach fremder Änderung', () => {
    const geaendert = QUELLE.replace('| a1 |', '| A1 |').split('\n');
    expect(zellTextAn(geaendert, { rowKind: 'body', rowIndex: 0, col: 1 })).toBe('b1');
    expect(zellTextAn(geaendert, { rowKind: 'body', rowIndex: 0, col: 0 })).toBe('A1');
    expect(zellTextAn(TABELLE, { rowKind: 'header', rowIndex: 0, col: 2 })).toBe('C');
  });

  it('liefert keine Zelle, die die Tabelle nicht mehr hat, statt zu klemmen', () => {
    expect(zellTextAn(TABELLE, { rowKind: 'body', rowIndex: 1, col: 0 })).toBeNull();
    expect(zellTextAn(TABELLE, { rowKind: 'body', rowIndex: 0, col: 3 })).toBeNull();
    expect(zellTextAn(['kein Tisch'], { rowKind: 'body', rowIndex: 0, col: 0 })).toBeNull();
  });

  it('verwirft eine ungültige oder zu späte Stelle', () => {
    const doc = Text.of(DOC.split('\n'));
    expect(blockAmAnker(doc, -1, QUELLE)).toBeNull();
    expect(blockAmAnker(doc, undefined, QUELLE)).toBeNull();
    expect(blockAmAnker(doc, doc.length - 3, QUELLE)).toBeNull();
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

// 4T-001711 (Epic 3E-000300, E1): Der Tabulator in der letzten Zelle der
// letzten Zeile legt eine neue Zeile an, wie der Zellsprung im Quelltext.
describe('legtTabulatorZeileAn (wann der Tabulator eine Zeile anlegt, 4T-001711)', () => {
  const masse = { zeilen: 2, spalten: 3 };
  const kopf = (col) => ({ rowKind: 'header', rowIndex: 0, col });
  const datenzeile = (rowIndex, col) => ({ rowKind: 'body', rowIndex, col });

  it('legt in der letzten Zelle der letzten Zeile eine Zeile an (AK1)', () => {
    expect(legtTabulatorZeileAn(masse, datenzeile(1, 2), 'Tab', 'vor')).toBe(true);
  });

  it('springt in der letzten Zelle einer mittleren Zeile weiter, statt anzulegen (AK4)', () => {
    expect(legtTabulatorZeileAn(masse, datenzeile(0, 2), 'Tab', 'vor')).toBe(false);
    expect(legtTabulatorZeileAn(masse, kopf(2), 'Tab', 'vor')).toBe(false);
  });

  it('legt rueckwaerts nie eine Zeile an, auch nicht in der ersten Kopfzelle (AK5)', () => {
    expect(legtTabulatorZeileAn(masse, kopf(0), 'Tab', 'zurueck')).toBe(false);
    expect(legtTabulatorZeileAn(masse, datenzeile(1, 2), 'Tab', 'zurueck')).toBe(false);
  });

  it('legt mit der Pfeiltaste am Tabellenende keine Zeile an', () => {
    expect(legtTabulatorZeileAn(masse, datenzeile(1, 2), 'ArrowRight', 'vor')).toBe(false);
  });

  it('legt in einer Tabelle nur mit Kopfzeile in deren letzter Zelle an (AK9)', () => {
    const nurKopf = { zeilen: 0, spalten: 3 };
    expect(legtTabulatorZeileAn(nurKopf, kopf(2), 'Tab', 'vor')).toBe(true);
    expect(legtTabulatorZeileAn(nurKopf, kopf(1), 'Tab', 'vor')).toBe(false);
  });
});

describe('neueZeileAmEnde (die angelegte Zeile im Quelltext, 4T-001711)', () => {
  it('haengt eine leere Zeile mit der Spaltenzahl der Tabelle an (AK2)', () => {
    const anlage = neueZeileAmEnde(QUELLE, 3);
    expect(anlage.einfuegen).toBe('\n| | | |');
    const danach = (QUELLE + anlage.einfuegen).split('\n');
    const modell = parsePipeTable(danach);
    // Die Tabelle bleibt gueltig: drei Spalten, jetzt zwei Datenzeilen.
    expect(modell.columnCount).toBe(3);
    expect(modell.rows).toEqual([
      ['a1', 'b1', 'c1'],
      ['', '', ''],
    ]);
    expect(anlage.ziel).toEqual({ rowKind: 'body', rowIndex: 1, col: 0 });
  });

  it('setzt die Zielstelle in die erste Zelle der neuen Zeile (AK1)', () => {
    const anlage = neueZeileAmEnde(QUELLE, 3);
    // Wie beim Zellsprung im Quelltext: hinter die erste Pipe und ihr Leerzeichen.
    expect(anlage.zielOffset).toBe(QUELLE.length + 1 + 2);
    const danach = QUELLE + anlage.einfuegen;
    expect(danach.slice(anlage.zielOffset - 2, anlage.zielOffset + 1)).toBe('| |');
  });

  it('gibt einer Tabelle nur mit Kopfzeile ihre erste Datenzeile (AK9)', () => {
    const nurKopf = '| A | B |\n| --- | --- |';
    const anlage = neueZeileAmEnde(nurKopf, 2);
    const danach = (nurKopf + anlage.einfuegen).split('\n');
    expect(danach).toEqual(['| A | B |', '| --- | --- |', '| | |']);
    expect(anlage.ziel).toEqual({ rowKind: 'body', rowIndex: 0, col: 0 });
    expect(parsePipeTable(danach).rows).toHaveLength(1);
  });

  it('rechnet auf dem Block-Text nach der Zell-Uebernahme (AK3)', () => {
    // Die letzte Zelle bekommt vor der Anlage neuen Text; die Zielstelle muss
    // hinter dem LAENGEREN Block-Text liegen, weil beide Aenderungen in einer
    // Transaktion gelten.
    const block = { from: 100, zeilen: TABELLE };
    const modell = parsePipeTable(TABELLE);
    const bereich = zellBereich(block, modell, { rowKind: 'body', rowIndex: 0, col: 2 });
    const textDanach = blockTextNachUebernahme(block, bereich, 'Ende');
    const anlage = neueZeileAmEnde(textDanach, modell.columnCount);
    expect((textDanach + anlage.einfuegen).split('\n')).toEqual([
      '| A | B | C |',
      '| --- | --- | --- |',
      '| a1 | b1 | Ende |',
      '| | | |',
    ]);
    expect(anlage.zielOffset).toBe(textDanach.length + 1 + 2);
  });

  it('traegt eine Spaltenzahl von mindestens eins', () => {
    expect(neueZeileAmEnde('| A |\n| --- |', 0).einfuegen).toBe('\n| |');
  });
});

// 4T-002048 (Nachbesserung F5): Der Ausweichweg der Übernahme liest die Tabelle
// aus dem Syntaxbaum. Der nimmt eine Anker-Zeile direkt unter der Tabelle als
// letzte Tabellenzeile auf; das Widget zeigt sie nicht. Die Quelle endet
// deshalb vor ihr, sonst spränge der Tabulator in die nicht angezeigte Zeile
// und eine neue Zeile am Ende käme hinter die Anker-Zeile.
describe('tabellenQuelleAm mit Anker-Zeile unter der Tabelle (4T-002048)', () => {
  const text = `${QUELLE}\n^x\n\nAbsatz danach.`;
  const state = EditorState.create({
    doc: text,
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const quelle = tabellenQuelleAm(state, 0);

  it('die Quelle endet vor der Anker-Zeile', () => {
    expect(quelle).toBe(QUELLE);
  });

  it('Tabulator in der letzten Zelle der letzten angezeigten Zeile legt eine Zeile an', () => {
    const masse = tabellenMasse(parsePipeTable(quelle.split('\n')));
    const pos = { rowKind: 'body', rowIndex: 0, col: 2 };
    expect(legtTabulatorZeileAn(masse, pos, 'Tab', 'vor')).toBe(true);
    expect(nachbarZelle(masse, pos, 'vor')).toBeNull();
  });

  it('die neue Zeile am Ende steht vor der Anker-Zeile', () => {
    const block = blockAmAnker(state.doc, 0, quelle);
    const anlage = neueZeileAmEnde(quelle, 3);
    const danach = text.slice(0, block.to) + anlage.einfuegen + text.slice(block.to);
    expect(danach.split('\n').slice(2, 5)).toEqual(['| a1 | b1 | c1 |', '| | | |', '^x']);
  });
});
