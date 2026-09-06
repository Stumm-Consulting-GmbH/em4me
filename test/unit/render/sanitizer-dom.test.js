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

// 4T-001471 (Epic 3E-000178): Die Whitelist ist um genau ein Tag gewachsen,
// weil die eingebrannten Diagramme des portablen Exports Bilder mit
// Data-Adresse sind. Diese Faelle halten die Erweiterung eng: Das Bild bleibt,
// die freie Adresse nicht.
describe('P-02-Sanitizer: Bilder nur mit eingebetteter Adresse (4T-001471)', () => {
  const bild = (quelle) => renderMarkdown(`${MARKER}\n\n<img alt="X" src="${quelle}">\n`, 'de');

  it('ein eingebettetes Bild bleibt erhalten', () => {
    const html = bild('data:image/svg+xml;base64,PHN2Zy8+');
    expect(html).toContain('<img');
    expect(html).toContain('data:image/svg+xml;base64,PHN2Zy8+');
    expect(html).toContain('alt="X"');
  });

  it('eine fremde http-Adresse verliert ihre Quelle — kein Rueckkanal beim Oeffnen', () => {
    const html = bild('http://tracker.example/pixel.png');
    expect(html).not.toContain('tracker.example');
  });

  it('eine Datei-Adresse verliert ihre Quelle', () => {
    const html = bild('file:///etc/passwd');
    expect(html).not.toContain('etc/passwd');
  });

  it('eine javascript-Adresse verliert ihre Quelle', () => {
    const html = bild('javascript:alert(1)');
    expect(html).not.toContain('javascript:');
  });

  it('eine Data-Adresse, die kein Bild ist, verliert ihre Quelle', () => {
    const html = bild('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
    expect(html).not.toContain('data:text/html');
  });

  it('Ereignis-Behandlungen am Bild werden weiterhin entfernt', () => {
    const html = renderMarkdown(
      `${MARKER}\n\n<img alt="X" src="data:image/png;base64,AA" onerror="alert(1)">\n`,
      'de',
    );
    expect(html).not.toContain('onerror');
  });
});
