// @vitest-environment jsdom
// 4T-0193: Unit-Tests Renderer-Module — Tabellen-Zell-Logik (editor.js)
// und Statistik/Caches (render-mermaid.js). Tabellen-getriebene Faelle,
// Befund-IDs an den Regressionsfaellen.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const editor = await import('../../../src/renderer/modules/editor.js');
const rm = await import('../../../src/renderer/modules/render-mermaid.js');

describe('Tabellen-Zell-Logik (editor.js)', () => {
  it('findUnescapedPipes ignoriert escapte Pipes', () => {
    expect(editor.findUnescapedPipes('| a | b |')).toEqual([0, 4, 8]);
    expect(editor.findUnescapedPipes('| a \\| b |')).toEqual([0, 9]);
    expect(editor.findUnescapedPipes('kein Pipe')).toEqual([]);
  });

  it('isTableLine verlangt Rand-Pipes', () => {
    expect(editor.isTableLine('| a | b |')).toBe(true);
    expect(editor.isTableLine('  | a | b |  ')).toBe(true);
    expect(editor.isTableLine('a | b')).toBe(false);
    expect(editor.isTableLine('| nur eine Pipe')).toBe(false);
  });

  // R2-19 (4T-0186): virtuelle Randzellen fuer randlose GFM-Tabellen.
  const cellCases = [
    { text: '| a | b |', cells: 2, first: 'a' },
    { text: 'a | b', cells: 2, first: 'a' },
    { text: '| a | b', cells: 2, first: 'a' },
    { text: 'a | b | c', cells: 3, first: 'a' },
  ];
  for (const c of cellCases) {
    it(`parseTableCells('${c.text}') liefert ${c.cells} Zellen (R2-19)`, () => {
      const cells = editor.parseTableCells(c.text);
      expect(cells).toHaveLength(c.cells);
      const f = cells[0];
      expect(c.text.slice(f.contentStart, f.contentEnd)).toBe(c.first);
    });
  }

  it('parseTableCells bleibt bei klassischen Rand-Pipe-Zeilen unveraendert', () => {
    const text = '| eins | zwei |';
    const cells = editor.parseTableCells(text);
    expect(cells).toHaveLength(2);
    expect(text.slice(cells[1].contentStart, cells[1].contentEnd)).toBe('zwei');
  });

  it('buildEmptyTableRow und findCellAt arbeiten zusammen', () => {
    const row = editor.buildEmptyTableRow(3);
    expect(row).toBe('| | | |');
    const cells = editor.parseTableCells(row);
    expect(cells).toHaveLength(3);
    expect(editor.findCellAt(cells, 2)).toBe(0);
    expect(editor.findCellAt(cells, row.length - 1)).toBe(2);
    expect(editor.findCellAt(cells, 999)).toBe(-1);
  });
});

describe('Word-Count-Statistik (render-mermaid.js)', () => {
  it('zaehlt Woerter, Zeichen, Saetze, Absaetze und Headings', () => {
    const text =
      '# Titel\n\nErster Satz. Zweiter Satz!\n\nNeuer Absatz mit vier Worten.\n\n## Untertitel\n';
    const s = rm.computeWordCountStats(text);
    expect(s.headings.total).toBe(2);
    expect(s.headings.h1).toBe(1);
    expect(s.headings.h2).toBe(1);
    expect(s.paragraphs).toBe(4);
    expect(s.sentences).toBe(3);
    expect(s.words).toBeGreaterThan(8);
  });

  it('Code, Frontmatter und Math zaehlen nicht mit', () => {
    const text =
      '---\ntitel: x\n---\n\nWort eins `code drin` und $x^2$.\n\n```js\nconst nicht = 1;\n```\n';
    const s = rm.computeWordCountStats(text);
    // 'Wort', 'eins', 'und' plus der nach dem Math-Strip verbleibende
    // Satzpunkt als eigenes \S+-Token — dokumentiertes IST-Verhalten.
    expect(s.words).toBe(4);
  });

  it('leerer Text liefert Null-Statistik', () => {
    const s = rm.computeWordCountStats('');
    expect(s.words).toBe(0);
    expect(s.readingMinutes).toBe(0);
    expect(s.sentences).toBe(0);
  });
});

describe('Mermaid-Cache (render-mermaid.js)', () => {
  it('mermaidCacheKey enthaelt Theme, Laenge und Hash (R1-09)', () => {
    const key = rm.mermaidCacheKey('dark', 'graph TD');
    expect(key.startsWith('dark:8:')).toBe(true);
    expect(rm.mermaidCacheKey('default', 'graph TD')).not.toBe(key);
  });

  it('mermaidCacheSet evictet den aeltesten Eintrag am Limit (R1-09)', () => {
    rm.mermaidRenderCache.clear();
    for (let i = 0; i < rm.MERMAID_CACHE_MAX_SIZE; i++) {
      rm.mermaidCacheSet(`k${i}`, `v${i}`);
    }
    expect(rm.mermaidRenderCache.size).toBe(rm.MERMAID_CACHE_MAX_SIZE);
    rm.mermaidCacheSet('neu', 'wert');
    expect(rm.mermaidRenderCache.size).toBe(rm.MERMAID_CACHE_MAX_SIZE);
    expect(rm.mermaidRenderCache.has('k0')).toBe(false);
    expect(rm.mermaidRenderCache.get('neu')).toBe('wert');
    rm.mermaidRenderCache.clear();
  });

  // R2-07 (4T-0174): Sonderzeichen-feste file:///-URLs.
  it('fileUrlFor escaped #, ?, % und Leerzeichen', () => {
    const url = rm.fileUrlFor('C:\\Ordner mit Raum\\datei #1 50%.pdf');
    expect(url).toBe('file:///C:/Ordner%20mit%20Raum/datei%20%231%2050%25.pdf');
  });
});
