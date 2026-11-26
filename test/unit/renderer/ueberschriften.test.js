// 4T-002558 (Epic 3E-000390): das gemeinsame Überschriften-Modul des Renderers
// (src/renderer/modules/editor/ueberschriften.js). Es trägt die Erkennung der
// Überschriften-Knoten im Lezer-Baum für Faltung, Inhaltsverzeichnis-Panel und
// Inhaltsverzeichnis-Block; das Panel exportiert die Text-Ermittlung unverändert
// weiter.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import {
  extractHeadingText,
  tocQuelleAus,
  ueberschriftEbene,
  ueberschriftenAusBaum,
  verweisDefinitionenAusBaum,
} from '../../../src/renderer/modules/editor/ueberschriften.js';

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

describe('Überschriften aus dem Lezer-Baum (4T-002558)', () => {
  it('erkennt ATX- und Setext-Knoten mit ihrer Ebene und sonst nichts', () => {
    expect(ueberschriftEbene('ATXHeading1')).toBe(1);
    expect(ueberschriftEbene('ATXHeading6')).toBe(6);
    expect(ueberschriftEbene('SetextHeading2')).toBe(2);
    expect(ueberschriftEbene('ATXHeading7')).toBe(0);
    expect(ueberschriftEbene('HeaderMark')).toBe(0);
    expect(ueberschriftEbene('FencedCode')).toBe(0);
  });

  it('liefert Ebene, Zeile und Quelltext je Überschrift, ohne Code-Block', () => {
    const doc = '# Eins\n\nText\n\nZwei\n---\n\n```md\n# Kein\n```\n\n### **Drei** {#d}\n';
    expect(ueberschriftenAusBaum(mdState(doc))).toEqual([
      { ebene: 1, zeile: 1, quelle: '# Eins' },
      { ebene: 2, zeile: 5, quelle: 'Zwei\n---' },
      { ebene: 3, zeile: 12, quelle: '### **Drei** {#d}' },
    ]);
  });

  it('übergeht den Kopf-Block bis kopfEnde', () => {
    const doc = '---\ntitel: x\n---\n\n# Eins\n';
    expect(ueberschriftenAusBaum(mdState(doc)).map((u) => u.zeile)).toEqual([2, 5]);
    expect(ueberschriftenAusBaum(mdState(doc), { kopfEnde: 3 })).toEqual([
      { ebene: 1, zeile: 5, quelle: '# Eins' },
    ]);
  });

  it('lässt Überschriften in Kommentaren weg und schneidet Inline-Kommentare heraus', () => {
    const doc = '# Eins %%geheim%%\n\n%%\n# Weg\n%%\n';
    const kommentare = [
      { from: doc.indexOf('%%geheim'), to: doc.indexOf('%%geheim') + 10 },
      { from: doc.indexOf('%%\n# Weg'), to: doc.lastIndexOf('%%') + 2 },
    ];
    expect(ueberschriftenAusBaum(mdState(doc), { kommentare })).toEqual([
      { ebene: 1, zeile: 1, quelle: '# Eins ' },
    ]);
  });

  it('liefert die Verweis-Definitionen außerhalb von Code und Kopf-Block', () => {
    const doc =
      '---\na: b\n---\n\n# [T][r]\n\n[r]: https://x.org "Titel"\n\n```\n[c]: https://y.org\n```\n';
    expect(verweisDefinitionenAusBaum(mdState(doc), { kopfEnde: 3 })).toEqual([
      '[r]: https://x.org "Titel"',
    ]);
  });

  it('verbindet die Quellen mit Leerzeilen, die Definitionen dahinter', () => {
    expect(tocQuelleAus([{ quelle: '# A' }, { quelle: 'B\n===' }])).toBe('# A\n\nB\n===');
    expect(tocQuelleAus([{ quelle: '# A' }], ['[r]: x'])).toBe('# A\n\n[r]: x');
    expect(tocQuelleAus([])).toBe('');
  });

  it('extractHeadingText bereinigt Marker, Attribut-Block und schließende Rauten', () => {
    const doc = mdState('## Titel {#id}\n## Rauten ##\nSetext\n===\n').doc;
    expect(extractHeadingText(doc, 1)).toBe('Titel');
    expect(extractHeadingText(doc, 2)).toBe('Rauten');
    expect(extractHeadingText(doc, 3)).toBe('Setext');
    expect(extractHeadingText(doc, 9)).toBe('');
  });
});
