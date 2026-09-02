// @vitest-environment jsdom
// 4T-000194: Sicherheits-Snapshots des Portable-Render-Pfads MIT echtem
// DOMParser (jsdom) — der P-02-Block-Sanitizer nutzt DOMParser und faellt
// in purem Node auf Voll-Escaping zurueck; erst diese Umgebung prueft die
// produktive Tag-/Attribut-Whitelist aus 4T-000176.
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

const MARKER = '<!-- perspective-portable -->';

describe('P-02-Sanitizer (Portable-Pfad, DOMParser aktiv)', () => {
  it('erlaubte Export-Tabelle bleibt erhalten', () => {
    const src = `${MARKER}\n\n<table class="perspective-table"><tbody><tr><td colspan="2" style="text-align:right">Zelle</td></tr></tbody></table>\n`;
    const html = renderMarkdown(src, 'de');
    expect(html).toContain('<table');
    expect(html).toContain('colspan="2"');
    expect(html).toMatchSnapshot();
  });

  it('Script-Block wird nicht ausgefuehrt/uebernommen', () => {
    const src = `${MARKER}\n\n<script>alert(1)</script>\n`;
    const html = renderMarkdown(src, 'de');
    expect(html).not.toContain('<script>');
    expect(html).toMatchSnapshot();
  });

  it('Event-Handler-Attribute und iframe fallen weg', () => {
    const src = `${MARKER}\n\n<div onclick="alert(1)"><iframe src="https://example.org"></iframe><span style="color:red">ok</span></div>\n`;
    const html = renderMarkdown(src, 'de');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('ok');
    expect(html).toMatchSnapshot();
  });

  it('Viewer-Pfad (html:false) escaped rohes HTML komplett', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n', 'de');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('javascript:-Wiki-Link wird nicht als Link gerendert (P-07)', () => {
    const html = renderMarkdown('[[javascript:alert(1)]]\n', 'de');
    expect(html).not.toContain('href="javascript:');
  });
});
