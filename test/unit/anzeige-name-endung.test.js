// 4T-001899 (Story 4S-000590): Die Anzeige-Namen von Dateien kommen aus EINER
// Endungs-Erkennung. Bis 4T-001899 trug das Unterseiten-Modul eine eigene,
// gleichlautende Liste der Markdown-Endungen neben `MD_EXT_RE` der
// Markdown-Pipeline, und Graph, Schnell-Öffnen und Verweis-Vorschläge kürzten
// mit der Pipeline-Liste, Reiter und Dateiliste mit der eigenen. Bei einer
// künftigen Endung liefen die Anzeigen auseinander.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripMarkdownExtension,
  fileLabelFromBasename,
  displayTitleFromBasename,
} from '../../src/shared/subpages.js';
import { MD_EXT_RE } from '../../src/shared/markdown/link-scan.js';
import { logicalNameFor } from '../../src/main/index/link-graph.js';

const wurzel = path.join(path.sep === '\\' ? 'C:\\' : '/', 'bereich');
const WURZEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Anzeige-Namen: eine Endungs-Erkennung (4T-001899)', () => {
  it('jede Markdown-Endung der Pipeline wird in der Anzeige gekürzt, sonst nichts', () => {
    // Die Pipeline-Liste ist die Quelle; die Anzeige folgt ihr Endung für
    // Endung. Eine zweite Liste, die eine Endung nicht kennt, fiele hier auf.
    for (const endung of ['md', 'markdown', 'mdown', 'mkd', 'MD']) {
      const name = `Notiz.${endung}`;
      expect(MD_EXT_RE.test(name), name).toBe(true);
      expect(stripMarkdownExtension(name), name).toBe('Notiz');
    }
    for (const name of ['Bild.png', 'Tabelle.xlsx', 'Notiz.mdx']) {
      expect(MD_EXT_RE.test(name), name).toBe(false);
      expect(stripMarkdownExtension(name), name).toBe(name);
    }
  });

  it('der Name im Graph, im Verweis-Baum und in der Statistik ist derselbe wie im Reiter', () => {
    for (const datei of ['Notiz.markdown', 'Projekt\u2215Planung.md', 'Alt.mkd']) {
      const abs = path.join(wurzel, datei);
      expect(logicalNameFor(abs), datei).toBe(displayTitleFromBasename(datei));
    }
    expect(logicalNameFor(path.join(wurzel, 'Projekt\u2215Planung.md'))).toBe('Projekt/Planung');
  });

  it('die umgestellten Anzeigen tragen keine eigene Endungs-Regel mehr', () => {
    // Je Datei die eigene Erkennung, die bis 4T-001899 dort stand: die
    // wörtliche Endungs-Liste oder die Kürzung «jede Endung».
    const EIGENE_REGEL = /\(md\|markdown\|mdown\|mkd\)|\\\.\[\^\.\/?\]\+\$/;
    for (const rel of [
      'src/shared/subpages.js',
      'src/renderer/modules/panels/panel-subpages.js',
      'src/main/index/link-graph.js',
      'src/main/index/profil-verweis-ziele.js',
      'src/main/area/area-search.js',
      'src/main/books/shelves.js',
    ]) {
      const text = fs.readFileSync(path.join(WURZEL_REPO, rel), 'utf8');
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      expect(EIGENE_REGEL.test(code), rel).toBe(false);
    }
  });

  it('der Rückfall auf den vollen Namen bleibt der Beschriftung vorbehalten', () => {
    expect(stripMarkdownExtension('.md')).toBe('');
    expect(fileLabelFromBasename('.md')).toBe('.md');
    expect(fileLabelFromBasename('Regal.markdown')).toBe('Regal');
  });
});
