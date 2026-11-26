// 4T-002617 (Epic 3E-000391): Lage der Schreibmarke zu einem Code-Block
// (src/renderer/modules/editor/editor-zaun-kontext.js, V6 des Epics, AK2).
// Geprüft wird an einem echten Editor-Zustand mit Markdown-Sprache: außerhalb,
// im Körper, Öffner- und Schluss-Zeile, offener Block am Dokument-Ende,
// Vorspann, Kommentar-Zeile, `graph`, fremde Sprache, eingerückter Block und ein
// langes Dokument.
import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
// Steuert den Stub von ensureSyntaxTree: Bei `unfertig` liefert er null wie
// ein Baum, der in der Frist nicht fertig wird.
const { baumSteuerung } = vi.hoisted(() => ({ baumSteuerung: { unfertig: false } }));
vi.mock('@codemirror/language', async (original) => {
  const echt = await original();
  return {
    ...echt,
    ensureSyntaxTree: (...args) => (baumSteuerung.unfertig ? null : echt.ensureSyntaxTree(...args)),
  };
});

import { zaunAnStelle } from '../../../src/renderer/modules/editor/editor-zaun-kontext.js';

function mdState(doc) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [LezerTable] })],
  });
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter */
  }
  return state;
}

// Stelle hinter dem ersten Vorkommen eines Ankers.
function hinter(doc, anker) {
  const i = doc.indexOf(anker);
  if (i < 0) throw new Error(`Anker fehlt: ${anker}`);
  return i + anker.length;
}

const BLOCK = 'Text davor\n\n```mermaid\nflowchart TD\n  N1[A] --> N2[B]\n```\n\nText danach\n';

describe('Lage der Schreibmarke zu einem Code-Block (V6, AK2)', () => {
  it('liefert null außerhalb jedes Code-Blocks', () => {
    const s = mdState(BLOCK);
    expect(zaunAnStelle(s, hinter(BLOCK, 'Text dav'))).toBeNull();
    expect(zaunAnStelle(s, hinter(BLOCK, 'Text dan'))).toBeNull();
  });

  it('erkennt den Körper eines Mermaid-Blocks mit Art und Bereich', () => {
    const s = mdState(BLOCK);
    const z = zaunAnStelle(s, hinter(BLOCK, 'N1[A]'));
    expect(z).toMatchObject({
      sprache: 'mermaid',
      oeffnerZeile: 3,
      schlussZeile: 6,
      imKoerper: true,
      art: 'flowchart',
    });
    expect(BLOCK.slice(z.koerperVon, z.koerperBis)).toBe('flowchart TD\n  N1[A] --> N2[B]');
  });

  it('meldet Öffner- und Schluss-Zeile als nicht im Körper', () => {
    const s = mdState(BLOCK);
    const oeffner = zaunAnStelle(s, hinter(BLOCK, '```mer'));
    expect(oeffner).toMatchObject({ sprache: 'mermaid', imKoerper: false });
    const schluss = zaunAnStelle(s, BLOCK.indexOf('```\n\nText danach') + 1);
    expect(schluss).toMatchObject({ sprache: 'mermaid', imKoerper: false, schlussZeile: 6 });
    // Zeilen-Ende der Schluss-Zeile: nur mit der Suche nach links erreichbar.
    const ende = BLOCK.indexOf('```\n\nText danach') + 3;
    expect(zaunAnStelle(s, ende)).toMatchObject({ imKoerper: false });
    expect(zaunAnStelle(s, ende, { seite: 1 })).toBeNull();
  });

  it('behandelt einen offenen Block am Dokument-Ende mit letzter Zeile im Körper', () => {
    const doc = 'Text\n\n```mermaid\nsequenceDiagram\n  T1->>T2: Hallo';
    const s = mdState(doc);
    const z = zaunAnStelle(s, doc.length);
    expect(z).toMatchObject({
      sprache: 'mermaid',
      schlussZeile: null,
      imKoerper: true,
      art: 'sequenceDiagram',
    });
    expect(z.koerperBis).toBe(doc.length);
  });

  it('überspringt einen Vorspann aus ---Zeilen', () => {
    const doc = '```mermaid\n---\ntitle: Plan\n---\ngantt\n  title X\n```\n';
    const z = zaunAnStelle(mdState(doc), hinter(doc, 'title X'));
    expect(z).toMatchObject({ art: 'gantt', imKoerper: true });
  });

  it('überspringt Kommentar-Zeilen mit %%', () => {
    const doc = '```mermaid\n%% Notiz\n%%{init: {}}%%\nclassDiagram\n  class K1\n```\n';
    const z = zaunAnStelle(mdState(doc), hinter(doc, 'class K1'));
    expect(z).toMatchObject({ art: 'classDiagram', imKoerper: true });
  });

  it('liest graph als flowchart und gibt eine unbekannte Art unverändert zurück', () => {
    const g = '```mermaid\ngraph LR\n  A --> B\n```\n';
    expect(zaunAnStelle(mdState(g), hinter(g, 'A -->')).art).toBe('flowchart');
    const p = '```mermaid\npie\n  "A": 1\n```\n';
    expect(zaunAnStelle(mdState(p), hinter(p, '"A"')).art).toBe('pie');
  });

  it('liefert ohne Kopfzeile keine Art', () => {
    const doc = '```mermaid\n\n%% nur Kommentar\n```\n';
    const z = zaunAnStelle(mdState(doc), hinter(doc, '%% nur'));
    expect(z).toMatchObject({ sprache: 'mermaid', imKoerper: true, art: null });
  });

  it('meldet bei fremder Sprache die Sprache und keine Art', () => {
    const doc = '```js\nconst flowchart = 1;\n```\n';
    const z = zaunAnStelle(mdState(doc), hinter(doc, 'const'));
    expect(z).toMatchObject({ sprache: 'js', imKoerper: true, art: null });
    const ohne = '```\nflowchart TD\n```\n';
    expect(zaunAnStelle(mdState(ohne), hinter(ohne, 'flow'))).toMatchObject({
      sprache: '',
      art: null,
    });
  });

  it('erkennt einen eingerückten Block unter einem Listenpunkt', () => {
    const doc = '- Punkt\n\n  ```mermaid\n  flowchart TD\n    N1[A]\n  ```\n';
    const s = mdState(doc);
    const z = zaunAnStelle(s, hinter(doc, 'N1[A]'));
    expect(z).toMatchObject({
      sprache: 'mermaid',
      oeffnerZeile: 3,
      schlussZeile: 6,
      imKoerper: true,
      art: 'flowchart',
    });
    expect(zaunAnStelle(s, hinter(doc, '- Pu'))).toBeNull();
  });

  // Zweitblick zu 3E-000391 (Runde 2): Die Zaun-Regel aus fence-level.js kennt
  // höchstens drei Leerzeichen; die Einrückung des Listenpunkts (vier
  // Leerzeichen bei «10. », ein Tabulator) muss vor der Prüfung weg, sonst gilt
  // der Block als nie geschlossen und die Schluss-Zeile als Körper.
  it('erkennt die Schluss-Zeile auch bei vier Leerzeichen oder Tabulator Einrückung', () => {
    const vier = '10. Punkt\n\n    ```mermaid\n    flowchart TD\n      N1[A]\n    ```\n\nDanach.\n';
    const z = zaunAnStelle(mdState(vier), hinter(vier, 'N1[A]'));
    expect(z).toMatchObject({
      sprache: 'mermaid',
      oeffnerZeile: 3,
      schlussZeile: 6,
      art: 'flowchart',
    });
    // Auf der Schluss-Zeile: im Block, aber nicht im Körper.
    const aufSchluss = zaunAnStelle(mdState(vier), vier.indexOf('    ```\n\nDanach') + 5);
    expect(aufSchluss).toMatchObject({ schlussZeile: 6, imKoerper: false });

    const tab = '- Punkt\n\n\t```mermaid\n\tflowchart TD\n\t  N1[A]\n\t```\n';
    const t = zaunAnStelle(mdState(tab), hinter(tab, 'N1[A]'));
    expect(t).toMatchObject({ sprache: 'mermaid', oeffnerZeile: 3, schlussZeile: 6 });
  });

  // Zweitblick zu 3E-000391 (Runde 3): Die Schluss-Zeile darf anders eingerückt
  // sein als der Öffner (CommonMark: bis zu drei Leerzeichen gegenüber dem
  // Container); eine Spalten-Rechnung ab dem Öffner schnitt in die Backticks.
  it('erkennt die Schluss-Zeile, wenn sie anders eingerückt ist als der Öffner', () => {
    const weniger = '  ```mermaid\nflowchart TD\n```\n\nDanach.\n';
    expect(zaunAnStelle(mdState(weniger), hinter(weniger, 'flow'))).toMatchObject({
      oeffnerZeile: 1,
      schlussZeile: 3,
      imKoerper: true,
    });
    const liste = '1. Punkt\n\n    ```mermaid\n    flowchart TD\n   ```\n\nDanach.\n';
    expect(zaunAnStelle(mdState(liste), hinter(liste, 'flow'))).toMatchObject({
      oeffnerZeile: 3,
      schlussZeile: 5,
    });
    const mehr = '```mermaid\nflowchart TD\n   ```\n';
    expect(zaunAnStelle(mdState(mehr), hinter(mehr, 'flow'))).toMatchObject({
      oeffnerZeile: 1,
      schlussZeile: 3,
    });
    // Ein offener Block am Dokument-Ende hat weiter keine Schluss-Zeile.
    const offen = '  ```mermaid\nflowchart TD\n  N1[A]\n';
    expect(zaunAnStelle(mdState(offen), hinter(offen, 'N1[A]'))).toMatchObject({
      schlussZeile: null,
      imKoerper: true,
    });
  });

  it('findet den Block am Ende eines langen Dokuments', () => {
    const vorne = Array.from({ length: 6000 }, (_, i) => `Zeile ${i} mit Text`).join('\n');
    const doc = `${vorne}\n\n\`\`\`mermaid\ngantt\n  section S\n\`\`\`\n`;
    const z = zaunAnStelle(mdState(doc), hinter(doc, 'section S'));
    expect(z).toMatchObject({ sprache: 'mermaid', art: 'gantt', imKoerper: true });
    expect(z.oeffnerZeile).toBe(6002);
  });

  it('meldet einen unvollständigen Baum, statt einen Zaun jenseits davon zu übersehen', () => {
    const vorne = Array.from({ length: 6000 }, (_, i) => `Zeile ${i} mit Text`).join('\n');
    const doc = `${vorne}\n\n\`\`\`mermaid\ngantt\n  section S\n\`\`\`\n`;
    const pos = hinter(doc, 'section S');
    // Frischer Zustand: Der Baum reicht nur über den Anfang des Dokuments.
    const s = EditorState.create({ doc, extensions: [markdown({ extensions: [LezerTable] })] });
    const teil = syntaxTree(s);
    expect(teil.length).toBeLessThan(pos);
    baumSteuerung.unfertig = true;
    try {
      expect(zaunAnStelle(s, pos)).toEqual({ unvollstaendig: true });
      // Eine Stelle im schon geparsten Anfang bleibt auswertbar.
      expect(zaunAnStelle(s, hinter(doc, 'Zeile 3 mit'))).toBeNull();
      // Mit übergebenem Baum (Weg des Datums-Wählers) gilt dieser wie bisher.
      expect(zaunAnStelle(s, pos, { seite: 1, baum: teil })).toBeNull();
    } finally {
      baumSteuerung.unfertig = false;
    }
  });
});
