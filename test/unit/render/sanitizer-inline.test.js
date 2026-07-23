// 4T-0307 (Epic 3E-0048): Regressionstests fuer den Inline-HTML-Sanitizer
// des Portable-Exports. Befund B-01 aus dem Code-Audit 4T-0275:
// einfach-gequotete Attributwerte mit eingebettetem " brachen aus dem
// doppelt-gequoteten Ausgabe-Attribut aus und schleusten einen Event-
// Handler ein. Der Inline-Pfad laeuft ueber Regex (kein DOMParser), ist
// also in purem Node testbar.
import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  PERSPECTIVE_PORTABLE_MARKER,
} from '../../../src/shared/markdown/markdown.js';

function portable(md) {
  return renderMarkdown(`${PERSPECTIVE_PORTABLE_MARKER}\n\n${md}\n`, 'de');
}

describe('Portable Inline-Sanitizer (B-01, 4T-0307)', () => {
  it('einfach-gequoteter Wert mit " schleust keinen Event-Handler ein', () => {
    const html = portable(`Ein <a title='x" onmouseover="alert(1)'>Link</a> hier.`);
    // Der Handler darf kein echtes Attribut sein: kein onmouseover, gefolgt
    // von einem NICHT-escapten " (escapetes &quot; im Wert ist harmlos).
    expect(html).not.toMatch(/onmouseover\s*=\s*"/i);
    // Das eingebettete " ist als &quot; im title-Wert eingeschlossen.
    expect(html).toContain('&quot;');
  });

  it('doppelt-gequoteter Wert mit eingebettetem " bleibt eingeschlossen', () => {
    const html = portable(`<span title="a\\"b">x</span>`);
    // Kein zweites, aus dem Wert entstandenes Attribut.
    expect(html).not.toMatch(/title="a"\s+\w+=/);
  });

  it('legitimes erlaubtes Attribut bleibt erhalten', () => {
    const html = portable(`<span class="hinweis">Text</span>`);
    expect(html).toContain('class="hinweis"');
  });

  it('javascript:-href wird weiterhin verworfen', () => {
    const html = portable(`<a href="javascript:alert(1)">x</a>`);
    expect(html).not.toContain('javascript:');
  });
});
