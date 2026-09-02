// 4T-000179: Import-Nachweis fuer die extrahierte Markdown-Pipeline.
// Akzeptanzkriterium: src/shared/markdown/** ist OHNE Electron ladbar und
// renderMarkdown laeuft auf einem Fixture. Die inhaltliche Tiefe (Snapshot-
// Tests je Konstrukt) folgt in 4T-000194 (Epic 3E-000041).
import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  PERSPECTIVE_PORTABLE_MARKER,
} from '../../src/shared/markdown/markdown.js';
import { extractFrontmatter, writeFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { githubLikeSlug } from '../../src/shared/markdown/slug.js';
import { parseColumnsCount } from '../../src/shared/markdown/plugins.js';

const FIXTURE = [
  '---',
  'titel: Pipeline',
  '---',
  '# Überschrift',
  '',
  'Text mit **fett**, $x^2$, [[Wiki]], ==markiert== und #tag1.',
  '',
  '> [!note] Hinweis',
  '> Callout-Inhalt',
  '',
  '```perspective-table',
  '{| caption="Probe"',
  '|! A |! B',
  '| 1 | 2',
  '|}',
  '```',
  '',
  '```js',
  'const x = 1;',
  '```',
].join('\n');

describe('shared/markdown — Electron-freie Pipeline', () => {
  it('renderMarkdown rendert alle Kern-Konstrukte ohne Electron/DOM', () => {
    const html = renderMarkdown(FIXTURE, 'de');
    expect(html).toContain('<h1'); // Heading (Frontmatter vom Body getrennt)
    // 4T-000282: Frontmatter erscheint als eigener Block vor dem Body,
    // nicht mehr gar nicht — aber nie als regulaer gerenderter Body-Text.
    expect(html).toContain('frontmatter-block');
    expect(html).not.toContain('<p>titel:'); // kein Frontmatter als Fliesstext
    expect(html).toContain('katex'); // KaTeX
    expect(html).toContain('wikilink'); // Wiki-Link
    expect(html).toContain('<mark'); // Highlight
    expect(html).toContain('callout'); // Callout
    expect(html).toContain('perspective-table'); // Perspective-Tabelle
    expect(html).toContain('hljs'); // Syntax-Highlighting
  });

  it('convertMarkdownPortable setzt den Marker und konvertiert perspective-table', () => {
    const out = convertMarkdownPortable(
      '```perspective-table\n{| caption="K"\n|! A\n| 1\n|}\n```\n',
    );
    expect(out.startsWith(PERSPECTIVE_PORTABLE_MARKER)).toBe(true);
    expect(out).toContain('<table>');
  });

  it('Frontmatter-Roundtrip funktioniert', () => {
    const fm = extractFrontmatter('---\ntitel: X\nzahl: 3\n---\nBody\n');
    expect(fm.data).toEqual({ titel: 'X', zahl: 3 });
    const res = writeFrontmatter('---\ntitel: X\n---\nBody\n', { titel: 'Y' });
    expect(res.ok).toBe(true);
    expect(res.text).toContain('titel: Y');
  });

  it('githubLikeSlug folgt der GitHub-Konvention', () => {
    expect(githubLikeSlug('Lösungsansatz Teil 2')).toBe('losungsansatz-teil-2');
  });
});

// 4T-000491 (Epic 3E-000093): writeFrontmatter mit emptyStubKeys (Komplett-
// Übernahme von Profil-Feldern). Neue, in emptyStubKeys genannte Leer-Felder
// werden als bare YAML-Schlüssel geschrieben; Zahl/Boolean als 0/false; der
// 4T-000069-Churn-Schutz für BESTEHENDE Leer-Felder bleibt unangetastet.
describe('writeFrontmatter emptyStubKeys (4T-000491, Epic 3E-000093)', () => {
  it('ergänzt fehlende Felder als bare Schlüssel; Default und 0/false erhalten', () => {
    const src = '---\ntitle: Fest\nclass: Ereignis\n---\n\nBody\n';
    const map = { ort: '', gaeste: [], anzahl: 0, ganztags: false, datum: '', art: 'Termin' };
    const res = writeFrontmatter(
      src,
      { title: 'Fest', class: 'Ereignis', ...map },
      { emptyStubKeys: Object.keys(map) },
    );
    expect(res.ok).toBe(true);
    // Leere Text-/Listen-/Datums-Stubs als bare Schlüssel.
    expect(res.text).toMatch(/\nort:\n/);
    expect(res.text).toMatch(/\ngaeste:\n/);
    expect(res.text).toMatch(/\ndatum:\n/);
    // Zahl/Boolean als 0/false, Default übernommen.
    expect(res.text).toContain('anzahl: 0');
    expect(res.text).toContain('ganztags: false');
    expect(res.text).toContain('art: Termin');
    // Reihenfolge: bestehende Felder zuerst, ergänzte danach.
    expect(res.text.indexOf('title: Fest')).toBeLessThan(res.text.indexOf('ort:'));
    // Round-Trip liest die Stubs als leer (null) zurück.
    expect(extractFrontmatter(res.text).data).toMatchObject({
      ort: null,
      anzahl: 0,
      ganztags: false,
      art: 'Termin',
    });
  });

  it('ohne emptyStubKeys bleibt der 4T-000069-Schutz: neue Leer-Felder erscheinen nicht', () => {
    const src = '---\ntitle: X\nTaetigkeit:\n---\n\nBody\n';
    const res = writeFrontmatter(src, { title: 'X', Taetigkeit: '', neu: '' });
    expect(res.ok).toBe(true);
    expect(res.text).not.toMatch(/\bneu\b/);
    // Bestehendes bare-Feld bleibt bare (kein `Taetigkeit: ''`).
    expect(res.text).toMatch(/\nTaetigkeit:\n/);
  });

  it('bestehende Leer-Felder werden auch als Stub genannt nicht angetastet', () => {
    const src = '---\ntitle: X\nleer:\n---\n\nBody\n';
    const res = writeFrontmatter(
      src,
      { title: 'X', leer: '', neu: '' },
      { emptyStubKeys: ['leer', 'neu'] },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toMatch(/\nleer:\n/); // unverändert bare
    expect(res.text).toMatch(/\nneu:\n/); // neuer Stub bare ergänzt
  });

  it('ohne bestehendes Frontmatter (buildFresh) erscheinen die Stubs bare', () => {
    const res = writeFrontmatter(
      'Nur Body\n',
      { ort: '', anzahl: 0 },
      {
        emptyStubKeys: ['ort', 'anzahl'],
      },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toMatch(/^---\n/);
    expect(res.text).toMatch(/\nort:\n/);
    expect(res.text).toContain('anzahl: 0');
    expect(res.text).toContain('Nur Body');
  });
});

// 4T-000382 (Epic 3E-000072): Mehrspalten-Container `::: columns <n>` mit
// Umbruch-Marker `+++` und Rueckfall bei ungueltiger Spaltenzahl.
describe('Mehrspalten-Container (4T-000382, Epic 3E-000072)', () => {
  it('parseColumnsCount akzeptiert strikt 2 bis 5, sonst null', () => {
    expect(parseColumnsCount('2')).toBe(2);
    expect(parseColumnsCount('3')).toBe(3);
    expect(parseColumnsCount('5')).toBe(5);
    expect(parseColumnsCount(' 4 ')).toBe(4);
    // Rueckfall-Matrix: 1, 6+, fehlend, nicht-numerisch, gemischt.
    expect(parseColumnsCount('1')).toBeNull();
    expect(parseColumnsCount('6')).toBeNull();
    expect(parseColumnsCount('10')).toBeNull();
    expect(parseColumnsCount('')).toBeNull();
    expect(parseColumnsCount(null)).toBeNull();
    expect(parseColumnsCount('abc')).toBeNull();
    expect(parseColumnsCount('3x')).toBeNull();
    expect(parseColumnsCount('2 3')).toBeNull();
  });

  it('::: columns <n> rendert md-columns-<n> im Viewer', () => {
    const html = renderMarkdown('::: columns 3\nInhalt\n:::\n', 'de');
    expect(html).toContain('md-columns md-columns-3');
    expect(html).not.toContain('container-columns');
  });

  it('ungueltige Spaltenzahl faellt auf die neutrale Container-Box zurueck', () => {
    for (const bad of ['1', '6', 'abc']) {
      const html = renderMarkdown(`::: columns ${bad}\nInhalt\n:::\n`, 'de');
      expect(html, `columns ${bad}`).toContain('custom-container container-columns');
      expect(html).not.toContain('md-columns');
    }
    const htmlMissing = renderMarkdown('::: columns\nInhalt\n:::\n', 'de');
    expect(htmlMissing).toContain('custom-container container-columns');
  });

  it('+++ auf eigener Zeile erzeugt den Umbruch-Marker', () => {
    const html = renderMarkdown('::: columns 2\nA\n\n+++\n\nB\n:::\n', 'de');
    expect(html).toContain('md-column-break');
  });

  it('Portable-Pfad setzt Inline-Styles fuer Spalten und Umbruch', () => {
    const src = '<!-- perspective-portable -->\n\n::: columns 4\nA\n\n+++\n\nB\n:::\n';
    const html = renderMarkdown(src, 'de');
    expect(html).toContain('column-count:4');
    expect(html).toContain('break-before:column');
  });
});
