// 4T-000282 (Epic 3E-000050): Frontmatter-Zeile im Gerenderten.
// Prüft die Markup-Erzeugung des vorangestellten Frontmatter-Blocks
// (zusammengeklappte Zeile plus Klartext-YAML), das Escaping, den
// Schalter (configureFrontmatterDisplay) und die data-source-line-
// Zuordnung bei Dokumenten mit Frontmatter.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  configureFrontmatterDisplay,
} from '../../../src/shared/markdown/markdown.js';

const DOC = ['---', 'titel: Test', 'zahl: 3', '---', '', '# Kopf', '', 'Absatz.', ''].join('\n');

afterEach(() => {
  // Default der Pipeline wiederherstellen (Product-Owner-Default: an).
  configureFrontmatterDisplay(true);
});

describe('Frontmatter-Block im Render-HTML (4T-000282)', () => {
  it('stellt bei Frontmatter einen zusammengeklappten Block voran', () => {
    const html = renderMarkdown(DOC, 'de');
    expect(html).toContain('class="frontmatter-block"');
    expect(html).toContain('class="frontmatter-header"');
    expect(html).toContain('data-i18n="frontmatter.line.label"');
    expect(html).toContain('data-fm-count="2"');
    expect(html).toContain('frontmatter-yaml');
    // Klartext-YAML ohne die ----Marker.
    expect(html).not.toMatch(/frontmatter-yaml[^]*---/);
  });

  it('Dokumente ohne Frontmatter rendern unverändert ohne Block', () => {
    const html = renderMarkdown('# Nur Body\n', 'de');
    expect(html).not.toContain('frontmatter-block');
  });

  it('ausgeschalteter Zustand rendert ohne Block', () => {
    configureFrontmatterDisplay(false);
    const html = renderMarkdown(DOC, 'de');
    expect(html).not.toContain('frontmatter-block');
    expect(html).toContain('<h1');
  });

  it('opts.frontmatterBlock === false unterdrückt den Block (Embed-Pfad)', () => {
    const html = renderMarkdown(DOC, 'de', { frontmatterBlock: false });
    expect(html).not.toContain('frontmatter-block');
    expect(html).toContain('<h1');
  });

  it('YAML-Inhalt wird escaped (kein Script-Durchgriff)', () => {
    const doc = '---\nfeld: <script>alert(1)</script>\n---\n\nBody\n';
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain('<script>');
  });

  it('YAML mit Parse-Fehler zeigt den Roh-Text ohne Feldanzahl', () => {
    const doc = '---\ntitel: [kaputt\n---\n\nBody\n';
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain('frontmatter-block');
    expect(html).not.toContain('data-fm-count');
    expect(html).toContain('kaputt');
  });

  it('Kommentare bleiben im Klartext-YAML erhalten', () => {
    const doc = '---\n# Kommentar bleibt\ntitel: x\n---\n\nBody\n';
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain('Kommentar bleibt');
  });
});

describe('data-source-line bei Frontmatter-Dokumenten (Scroll-Sync, 4T-000282)', () => {
  it('Body-Elemente tragen Dokument-Zeilen, nicht Body-relative Zeilen', () => {
    // Regressionstest: vor dem Fix zählte data-source-line ab Body-Anfang
    // (Frontmatter-Zeilen fehlten im Offset) — Scroll-Sync und Checkbox-
    // Toggle trafen bei Frontmatter-Dokumenten die falsche Editor-Zeile.
    const html = renderMarkdown(DOC, 'de');
    // '# Kopf' steht in Zeile 6 des Gesamt-Dokuments.
    expect(html).toContain('<h1 id="kopf" data-source-line="6"');
  });

  it('der Frontmatter-Block selbst mappt auf Zeile 1', () => {
    const html = renderMarkdown(DOC, 'de');
    expect(html).toMatch(/frontmatter-block" data-source-line="1"/);
  });

  it('ohne Frontmatter bleiben die Zeilen unverändert 1-basiert', () => {
    const html = renderMarkdown('# Kopf\n\nAbsatz.\n', 'de');
    expect(html).toContain('data-source-line="1"');
  });
});
