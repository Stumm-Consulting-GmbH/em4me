// 4T-000307 (Epic 3E-000048): Regressionstests fuer den Inline-HTML-Sanitizer
// des Portable-Exports. Befund B-01 aus dem Code-Audit 4T-000275:
// einfach-gequotete Attributwerte mit eingebettetem " brachen aus dem
// doppelt-gequoteten Ausgabe-Attribut aus und schleusten einen Event-
// Handler ein. Der Inline-Pfad laeuft ueber Regex (kein DOMParser), ist
// also in purem Node testbar.
import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
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

// 4T-001918 (Epic 3E-000340): Inline-Weg nach der Entscheidung vom
// 2026-09-23. Die 26 gliedernden Elemente stehen auf der Liste; ein nicht
// erlaubtes Tag entfällt, statt als maskierter Text zu erscheinen. Der Text
// zwischen öffnendem und schließendem Tag ist ein eigenes Stück und bleibt
// gewöhnlicher Text — auch bei einem gefährlichen Tag, wo dabei kein Element
// entsteht.
describe('Portable Inline-Sanitizer: Element-Liste und Auspacken (4T-001918)', () => {
  it('die Text-Auszeichnung der Liste bleibt erhalten, ohne eigene Attribute', () => {
    const html = portable(
      `Text <strong>f</strong> <em>k</em> <code>c</code> <s>d</s> <sub>2</sub> <sup>3</sup> <ins>i</ins> <del>x</del> <abbr title="Lang" id="a">A</abbr> Ende.`,
    );
    for (const stueck of [
      '<strong>f</strong>',
      '<em>k</em>',
      '<code>c</code>',
      '<s>d</s>',
      '<sub>2</sub>',
      '<sup>3</sup>',
      '<ins>i</ins>',
      '<del>x</del>',
      '<abbr title="Lang">A</abbr>',
    ]) {
      expect(html, stueck).toContain(stueck);
    }
  });

  it('ein nicht aufgeführtes, harmloses Tag entfällt, sein Text bleibt', () => {
    const html = portable(`Text <u>unterstrichen</u> und <font color="red">alt</font> Ende.`);
    expect(html).toContain('unterstrichen');
    expect(html).toContain('alt');
    for (const verboten of ['<u>', '<font', '&lt;u', '&lt;font']) {
      expect(html, verboten).not.toContain(verboten);
    }
  });

  it('ein gefährliches Tag entfällt, ohne dass ein Element entsteht', () => {
    const html = portable(
      `Text <script>alert(1)</script> <iframe src="https://example.org"></iframe> <input name="x"> <label>L</label> Ende.`,
    );
    for (const verboten of [
      '<script',
      '<iframe',
      '<input',
      '<label',
      '&lt;script',
      'example.org',
    ]) {
      expect(html, verboten).not.toContain(verboten);
    }
    expect(html).toContain('alert(1)');
  });

  it('ein Stück, das kein einzelnes Tag ist, erscheint weiterhin maskiert', () => {
    expect(portable(`Text <!-- Notiz --> Ende.`)).toContain('&lt;!-- Notiz --&gt;');
  });

  it('eine einzeilige Zelle mit Roh-HTML steht in der Datei ohne maskierten Text', () => {
    const datei = convertMarkdownPortable(
      '```perspective-table\n{|\n| Text <u>u</u> **fett** <sup>2</sup>\n|}\n```\n',
      true,
    );
    expect(datei).toContain('<strong>fett</strong>');
    expect(datei).toContain('<sup>2</sup>');
    expect(datei).not.toContain('&lt;');
    expect(datei).not.toContain('<u>');
  });

  it('B5: eine innere Tabelle behält ihre Fettschrift in der Datei', () => {
    const datei = convertMarkdownPortable(
      '````perspective-table\n{|\n|\n```perspective-table\n{|\n| **fett** innen\n|}\n```\n|}\n````\n',
      true,
    );
    expect(datei).toContain('<strong>fett</strong> innen');
    expect(datei).not.toContain('&lt;');
  });
});

// 4T-001918, Frage 2 Option B: die relative Bild-Adresse auf dem Inline-Weg.
// Der Weg baut den Tag selbst neu auf und trägt die Schranke deshalb eigens —
// Gegenstück zu den Fällen in sanitizer-dom.test.js.
describe('Portable Inline-Sanitizer: relative Bild-Adresse am img (4T-001918)', () => {
  const bild = (quelle) => portable(`Bild <img alt="X" src="${quelle}"> hier.`);

  it('eine Adresse relativ zum Dokument bleibt erhalten', () => {
    for (const quelle of ['bild.png', 'bilder/x.png', './x.png', 'Bild%20eins.png']) {
      expect(bild(quelle), quelle).toContain(`src="${quelle}"`);
    }
  });

  it('Freigabe-, absolute, Laufwerks- und kodierte Adressen verlieren ihre Quelle', () => {
    for (const quelle of [
      '//rechner/x.png',
      '\\\\rechner\\x.png',
      '/x.png',
      'C:/x.png',
      '%2F%2Frechner/x.png',
      '%5C%5Crechner/x.png',
      'c%3A/x.png',
      ' //rechner/x.png',
      'bild%00.png',
      'bild%0A.png',
      '%E0%A4%A.png',
      'http://tracker.example/p.png',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ]) {
      const html = bild(quelle);
      expect(html, quelle).not.toMatch(/\ssrc=/);
      expect(html, quelle).toContain('<img');
    }
  });

  it('die relative Adresse gilt nur am img, nicht an einem anderen Element', () => {
    expect(portable(`Text <span src="bild.png">x</span> Ende.`)).not.toContain('src=');
  });

  it('eine relative Adresse in url(…) setzt den Stil-Wert weiterhin außer Kraft', () => {
    const html = portable(`Zelle <span style="background:url(relativ.png)">Inhalt</span> Ende.`);
    expect(html).not.toContain('style=');
    expect(html).toContain('Inhalt');
  });

  it('eine Freigabe-Adresse als Roh-HTML in einer einzeiligen Zelle erreicht die Datei nicht', () => {
    const datei = convertMarkdownPortable(
      '```perspective-table\n{|\n| Text <img alt="A" src="//rechner/x.png"> <img alt="B" src="bild.png">\n|}\n```\n',
      true,
    );
    expect(datei).not.toContain('rechner');
    expect(datei).toContain('src="bild.png"');
  });
});

// 4T-001918 (Epic 3E-000340), Beifund Punkt 7: Ein gewöhnliches Aufgaben-
// Kästchen einer portablen Datei AUSSERHALB einer Tabelle. Die Kästchen-Stücke
// des Task-Listen-Plugins sind Roh-HTML und laufen deshalb durch den Inline-Weg.
// Gemessen am 2026-10-07 vor der Änderung: Kästchen und `<label>` erschienen
// maskiert als sichtbarer Text (`&lt;label&gt;&lt;input …&gt;`); mit der
// Auspack-Regel allein wären sie entfallen und der Zustand unsichtbar
// geworden. Mitbehoben (Entscheidung der Steuer-Sitzung): Die portable
// Pipeline schreibt das Kästchen als Zeichen, außerhalb von Tabellen wie in
// ihnen. Die gewöhnliche Anzeige behält echte Kästchen.
describe('Portable Inline-Sanitizer: Aufgaben-Kästchen außerhalb einer Tabelle (4T-001918)', () => {
  it('eine portable Datei zeigt ☐ und ☑ mit Text, ohne Eingabefeld und ohne maskiertes HTML', () => {
    const html = portable('- [ ] offen\n- [x] erledigt\n- [/] halb');
    expect(html).toContain('<li class="task-list-item">☐ offen</li>');
    expect(html).toContain('<li class="task-list-item">☑ erledigt</li>');
    expect(html).toContain('[/] halb</li>');
    for (const verboten of ['<input', '<label', '&lt;', 'task-state-box']) {
      expect(html.replace(/^&lt;!-- perspective-portable --&gt;/, ''), verboten).not.toContain(
        verboten,
      );
    }
  });

  it('die gewöhnliche Anzeige behält echte Kästchen', () => {
    const html = renderMarkdown('- [ ] offen\n- [x] erledigt\n', 'de');
    expect(html).toContain('<label><input class="task-list-item-checkbox"');
    expect(html).not.toContain('☐');
  });
});
