// 4T-000307 (Epic 3E-000048): Regressionstests fuer den Inline-HTML-Sanitizer
// des Portable-Exports. Befund B-01 aus dem Code-Audit 4T-000275:
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

describe('Portable Inline-Sanitizer (B-01, 4T-000307)', () => {
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

  // 4T-001556 (Epic 3E-000298): Die Wert-Schranke fuer `scope` gilt auf beiden
  // Pfaden. Der Inline-Pfad baut den Tag aus dem Regex-Treffer neu auf und
  // haette die Schranke sonst nicht — sie steht hier deshalb eigens.
  it('scope mit einem Wert des Standards bleibt erhalten', () => {
    expect(portable(`Zelle <th scope="col">K</th> Ende.`)).toContain('scope="col"');
    expect(portable(`Zelle <th scope="rowgroup">K</th> Ende.`)).toContain('scope="rowgroup"');
  });

  it('scope mit einem fremden Wert faellt weg, das Element bleibt', () => {
    const html = portable(`Zelle <th scope="foo">Kopftext</th> Ende.`);
    expect(html).not.toContain('scope=');
    expect(html).toContain('<th');
    expect(html).toContain('Kopftext');
  });
});

// 4T-002068 (Epic 3E-000344): Wert-Schranke für `style`. Ein Stil-Wert lädt
// über `url(…)` ein Bild an der `src`-Schranke vorbei; zulässig ist nur eine
// Adresse, die auch als `src` bestünde. Der Inline-Pfad baut den Tag selbst
// neu auf und trägt die Schranke deshalb eigens — Gegenstück zu den Fällen
// in sanitizer-dom.test.js.
describe('Portable Inline-Sanitizer: style nur mit eingebetteter Adresse (4T-002068)', () => {
  const zelle = (attribut) => portable(`Zelle <span ${attribut}>Inhalt</span> Ende.`);

  it('ein Stil-Wert ohne Adresse bleibt unverändert', () => {
    expect(zelle(`style="color: red"`)).toContain('style="color: red"');
    expect(zelle(`style="text-align:right"`)).toContain('style="text-align:right"');
  });

  it('eine eingebettete Bild-Adresse in url(…) bleibt erhalten', () => {
    const html = zelle(`style="background:url(data:image/png;base64,AA)"`);
    expect(html).toContain('style="background:url(data:image/png;base64,AA)"');
    expect(zelle(`style="background:url('data:image/png;base64,AA')"`)).toContain('style=');
  });

  it('eine freie Adresse in url(…) setzt den Stil-Wert außer Kraft, das Element bleibt', () => {
    for (const attribut of [
      `style="background:url(file:///C:/geheim/bild.png)"`,
      `style="background-image:url(//rechner/freigabe/x.png)"`,
      `style="background:url(\\\\rechner\\freigabe\\x.png)"`,
      `style="background:url(http://tracker.example/p.png)"`,
      `style="background:url(https://tracker.example/p.png)"`,
      `style="background:url('file:///x.png')"`,
      `style='background:url("file:///x.png")'`,
      `style="background:URL(file:///x.png)"`,
      `style="background: url (  file:///x.png  )"`,
      `style="background:url(data:text/html,x)"`,
      `style="background:url(data:image/png;base64,AA), url(file:///x.png)"`,
    ]) {
      const html = zelle(attribut);
      expect(html, attribut).not.toContain('style=');
      expect(html, attribut).toContain('<span');
      expect(html, attribut).toContain('Inhalt');
    }
  });

  it('ein nicht sicher beurteilbarer Stil-Wert fällt weg: Escape, Kommentar, image-set', () => {
    for (const attribut of [
      `style="background:\\75rl(file:///x.png)"`,
      `style="background:/* x */url(file:///x.png)"`,
      `style="background-image:image-set('file:///x.png' 1x)"`,
      `style="background-image:-webkit-image-set(url(file:///x.png) 1x)"`,
    ]) {
      const html = zelle(attribut);
      expect(html, attribut).not.toContain('style=');
      expect(html, attribut).toContain('Inhalt');
    }
  });
});
