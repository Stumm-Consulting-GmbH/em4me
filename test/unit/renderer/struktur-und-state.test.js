// @vitest-environment jsdom
// 4T-0193: Unit-Tests Renderer-Module — Fold-Struktur (folding.js),
// Outgoing-/Snippet-Logik (panels/panel-outgoing.js), Outline-Titel
// (panels/panel-outline.js), Navigation/State (views/),
// Bookmark-Tree-Helfer (bookmarks/bookmarks-tree.js), Such-Regex (search.js)
// und Shortcut-Label-Splitting (autocomplete-help.js).
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';

const folding = await import('../../../src/renderer/modules/editor/folding.js');
const panelOutgoing = await import('../../../src/renderer/modules/panels/panel-outgoing.js');
const panelOutline = await import('../../../src/renderer/modules/panels/panel-outline.js');
// 4T-0989 (Epic 3E-0196): views.js ist in den Feature-Ordner views/ geteilt;
// die geprüften Funktionen liegen jetzt in drei Modulen des Ordners.
const anchorNav = await import('../../../src/renderer/modules/views/anchor-navigation.js');
const scrollSync = await import('../../../src/renderer/modules/views/scroll-sync.js');
const views = await import('../../../src/renderer/modules/views/views.js');
const bookmarks = await import('../../../src/renderer/modules/bookmarks/bookmarks-tree.js');
const search = await import('../../../src/renderer/modules/search/search.js');
const ach = await import('../../../src/renderer/modules/editor/autocomplete-help.js');
const appState = await import('../../../src/renderer/modules/app/app-state.js');

function mdState(doc) {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [LezerTable] })] });
  // ensureSyntaxTree arbeitet mit Zeit-Budgets und parst grosse Docs erst
  // ueber mehrere Aufrufe vollstaendig (gleiches Muster wie der Lint-Pfad).
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter */
  }
  return state;
}

describe('Fold-Struktur (folding.js)', () => {
  it('Heading-Regionen enden vor dem naechsten Heading gleicher/oberer Ebene (R1-07)', () => {
    const state = mdState('# A\nx\n## B\ny\n## C\nz\n# D\nw\n');
    const s = folding.computeFoldStructure(state);
    const [a, b, c, d] = s.headings;
    expect(a.fromLine).toBe(1);
    expect(a.toLine).toBe(6); // bis vor '# D'
    expect(b.toLine).toBe(4); // bis vor '## C'
    expect(c.toLine).toBe(6);
    expect(d.toLine).toBe(state.doc.lines);
    expect(s.maxHeadingLevel).toBe(2);
  });

  it('Block-Tiefen per Containment-Stack (verschachtelte Listen, R1-07)', () => {
    const state = mdState('- a\n  - b\n    - c\n- d\n');
    const s = folding.computeFoldStructure(state);
    const depths = s.blocks.map((b) => b.track).sort((x, y) => x - y);
    expect(depths.length).toBeGreaterThan(1);
    expect(Math.min(...depths)).toBe(s.maxHeadingLevel + 1);
  });

  it('findTrackRegionAtLine: binaere Suche trifft Start, Innen und Aussen (R1-08)', () => {
    const list = [
      { fromLine: 2, toLine: 4 },
      { fromLine: 7, toLine: 9 },
    ];
    expect(folding.findTrackRegionAtLine(list, 1)).toBeNull();
    expect(folding.findTrackRegionAtLine(list, 2).fromLine).toBe(2);
    expect(folding.findTrackRegionAtLine(list, 3).fromLine).toBe(2);
    expect(folding.findTrackRegionAtLine(list, 6).fromLine).toBe(2); // toLine 4 < 6 -> Aufrufer prueft Abdeckung
    expect(folding.findTrackRegionAtLine(list, 8).fromLine).toBe(7);
  });

  it('Korrektheit auf breiter Struktur; Laufzeit-Wache (Perf-Messung liegt in der E2E-Perf-Suite)', () => {
    // Ohne EditorView parst der Lezer-Kontext nur einen begrenzten
    // Praefix des Dokuments — der Test prueft die Algorithmus-KORREKTHEIT
    // auf allen tatsaechlich geparsten Headings plus eine grobe
    // Laufzeit-Wache; die echte O(n)-Charakteristik auf 5.200 Zeilen
    // misst die E2E-Perf-Suite (test/e2e/perf, P-01/P-04) mit echter View.
    const doc = Array.from({ length: 4000 }, (_, i) => `## H${i}\ntext\n`).join('');
    const state = mdState(doc);
    const t0 = performance.now();
    const s = folding.computeFoldStructure(state);
    const ms = performance.now() - t0;
    expect(s.headings.length).toBeGreaterThan(100);
    // Jede Region endet direkt vor dem naechsten Level-2-Heading.
    for (let i = 0; i < s.headings.length - 1; i++) {
      expect(s.headings[i].toLine).toBe(s.headings[i + 1].fromLine - 1);
    }
    expect(ms).toBeLessThan(1000);
  });
});

describe('Outgoing-Links und Snippets (panels/panel-outgoing.js)', () => {
  it('extractOutgoingLinks erkennt Wiki, Embed und interne Markdown-Links', () => {
    const links = panelOutgoing.extractOutgoingLinks(
      '[[Ziel]] und ![[bild.png]] und [Text](notiz.md#kap)\n',
    );
    expect(links.map((l) => l.type)).toEqual(['wikiLink', 'embed', 'markdownLink']);
    expect(links[2].anchor).toBe('kap');
  });

  // R3-14 (4T-0183): Fence-Marker-Typ wird gemerkt.
  it('Fence-Erkennung schliesst nur mit passendem Marker (R3-14)', () => {
    const text = '~~~\n```\n[[ImFence]]\n~~~\n[[Draussen]]\n';
    const links = panelOutgoing.extractOutgoingLinks(text);
    expect(links.map((l) => l.target)).toEqual(['Draussen']);
  });

  it('Inline-Code maskiert Wiki-Links', () => {
    const links = panelOutgoing.extractOutgoingLinks('`[[nicht]]` aber [[doch]]\n');
    expect(links.map((l) => l.target)).toEqual(['doch']);
  });

  // R3-12 (4T-0183): Fenster um den Treffer-Index.
  it('snippetAroundIndex zentriert lange Zeilen um den Treffer (R3-12)', () => {
    const prefix = 'x'.repeat(150);
    const line = `${prefix} [[ZielMitte]] ${'y'.repeat(150)}`;
    const snip = panelOutgoing.snippetAroundIndex(line, line.indexOf('[[ZielMitte]]'));
    expect(snip).toContain('[[ZielMitte]]');
    expect(snip.length).toBeLessThanOrEqual(84);
    expect(snip.startsWith('…')).toBe(true);
  });

  it('extractHeadingText bereinigt ATX-Marker und trailing Hashes', () => {
    const doc = {
      lines: 2,
      line: (n) => ({ text: n === 1 ? '##  Mein Titel  ##' : 'Setext-Text' }),
    };
    expect(panelOutline.extractHeadingText(doc, 1)).toBe('Mein Titel');
    expect(panelOutline.extractHeadingText(doc, 2)).toBe('Setext-Text');
    expect(panelOutline.extractHeadingText(doc, 5)).toBe('');
  });
});

describe('Navigation und Persistenz-Logik (views/)', () => {
  // R3-06 (4T-0186): Anker-Normalisierung.
  it('normalizedAnchorId slugifiziert Headings und strippt ^ bei Block-IDs', () => {
    expect(anchorNav.normalizedAnchorId('Mein Abschnitt')).toBe('mein-abschnitt');
    expect(anchorNav.normalizedAnchorId('^block-42')).toBe('block-42');
    expect(anchorNav.normalizedAnchorId('  ')).toBe('');
  });

  // R4-14 (4T-0180): gecachte Zeilen-Liste + binaere Suche.
  it('findRenderElementForLine trifft das letzte Element mit Zeile <= Ziel (R4-14)', () => {
    const host = document.createElement('div');
    // In den Body haengen — der R4-14-Cache ueberspringt disconnected
    // Knoten bewusst (Mermaid-Ersatz-Semantik).
    document.body.appendChild(host);
    host.innerHTML =
      '<p data-source-line="1">a</p><ul data-source-line="4"><li data-source-line="4">b</li><li data-source-line="6">c</li></ul><p data-source-line="9">d</p>';
    expect(scrollSync.findRenderElementForLine(host, 1).dataset.sourceLine).toBe('1');
    expect(scrollSync.findRenderElementForLine(host, 5).dataset.sourceLine).toBe('4');
    expect(scrollSync.findRenderElementForLine(host, 6).dataset.sourceLine).toBe('6');
    expect(scrollSync.findRenderElementForLine(host, 99).dataset.sourceLine).toBe('9');
    // Cache aktiv: zweiter Aufruf nutzt dieselben Eintraege.
    const again = scrollSync.getSourceLineEntries(host);
    expect(again).toBe(scrollSync.getSourceLineEntries(host));
  });

  // R3-13-nahe Snapshot-Logik: Unbenannt-Tabs fallen raus, activeIndex mappt.
  it('buildPanesSnapshot filtert pfadlose Tabs und mappt den aktiven Index (R3-13)', () => {
    const tab = (path) => ({
      path,
      viewMode: 'rendered',
      wrapLines: false,
      showLineNumbers: false,
      showFoldGutter: false,
      scrollSyncEnabled: false,
    });
    appState.state.panes = [{ tabs: [tab(null), tab('C:/a.md'), tab('C:/b.md')], activeIndex: 2 }];
    const snap = views.buildPanesSnapshot();
    expect(snap[0].paths).toEqual(['C:/a.md', 'C:/b.md']);
    expect(snap[0].activeIndex).toBe(1);
  });
});

describe('Bookmark-Tree-Helfer (bookmarks/bookmarks-tree.js)', () => {
  const tree = [
    {
      type: 'folder',
      id: 'f1',
      name: 'Ordner',
      children: [
        { type: 'file', id: 'a', filePath: 'C:/a.md' },
        { type: 'folder', id: 'f2', children: [{ type: 'file', id: 'b', filePath: 'C:/b.md' }] },
      ],
    },
    { type: 'file', id: 'c', filePath: 'C:/c.md' },
  ];

  it('findNodeById und findNodeLocation finden verschachtelte Knoten', () => {
    expect(bookmarks.findNodeById(tree, 'b').filePath).toBe('C:/b.md');
    const loc = bookmarks.findNodeLocation(tree, 'b');
    expect(loc.parent.id).toBe('f2');
    expect(loc.index).toBe(0);
  });

  it('collectSubtreeIds liefert den ganzen Teilbaum', () => {
    expect([...bookmarks.collectSubtreeIds(tree[0])].sort()).toEqual(['a', 'b', 'f1', 'f2']);
  });

  it('insertAtEndOfGroup haelt Folder vor Files', () => {
    const container = [
      { type: 'folder', id: 'x' },
      { type: 'file', id: 'y' },
    ];
    bookmarks.insertAtEndOfGroup(container, { type: 'folder', id: 'neu' });
    expect(container.map((n) => n.id)).toEqual(['x', 'neu', 'y']);
  });

  it('countFolderContents zaehlt rekursiv', () => {
    expect(bookmarks.countFolderContents(tree[0])).toEqual({ files: 2, folders: 1 });
  });
});

describe('Such-Regex und Shortcut-Labels', () => {
  it('escapeRegex neutralisiert Sonderzeichen', () => {
    expect(search.escapeRegex('a.b*c')).toBe('a\\.b\\*c');
  });

  it('buildRegex: Text-Modus escaped, Regex-Modus nicht, Case-Flag wirkt', () => {
    expect(search.buildRegex('a.b', false, false).source).toBe('a\\.b');
    expect(search.buildRegex('a.b', true, false).source).toBe('a.b');
    expect(search.buildRegex('x', false, true).flags).not.toContain('i');
    expect(search.buildRegex('x', false, false).flags).toContain('i');
  });

  it('splitShortcutKeys zerlegt an + und behaelt Einzeltasten', () => {
    expect(ach.splitShortcutKeys('Strg+Umschalt+T')).toEqual(['Strg', 'Umschalt', 'T']);
    expect(ach.splitShortcutKeys('F3')).toEqual(['F3']);
  });
});
