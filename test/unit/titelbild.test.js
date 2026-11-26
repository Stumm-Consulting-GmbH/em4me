// 4T-002630 (Epic 3E-000395): Unit-Tests des Titelbild-Kerns
// (src/shared/markdown/titelbild.js) und seines Einhänge-Punkts in renderMarkdown.
//
// **Was zugesichert wird.** Die Angaben entstehen allein aus `cover`,
// `cover-height` und `cover-position` (Formen V4 und V10, Werte V9); der
// Kopf-Bereich trägt den geschriebenen Wert nur kodiert und maskiert, und der
// Stil-Wert entsteht ausschließlich aus den geprüften Zahlen (AK4, AK6). Die
// Pipeline setzt den Kopf-Bereich nur mit der Option der Vollansicht und dann
// vor die Frontmatter-Zeile (V2, V12, AK1). Bilder aus dem Netz ergeben kein
// Bild-Element, nur den Hinweis (P3 = A, AK2).
//
// Der Bild-Aufschluss gegen echte Dateien steht in test/unit/preload-images.test.js,
// der Aus-Zustand in test/unit/render/extensions-aus-titelbild.test.js.
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  titelbildAngaben,
  titelbildHtml,
  HOEHE_VORGABE,
  LAGE_VORGABE,
} from '../../src/shared/markdown/titelbild.js';
import { renderMarkdown } from '../../src/shared/markdown/markdown.js';
import { extractFrontmatter } from '../../src/shared/markdown/frontmatter.js';
import { computeLinkRewrites } from '../../src/shared/link-rewrite.js';

const angabenAus = (kopf) => titelbildAngaben(extractFrontmatter(`---\n${kopf}\n---\n`).data);

// Der Wert des Attributs `name` im ersten Element der Klasse `klasse`.
function attribut(html, klasse, name) {
  const el = new RegExp(`<[a-z]+ class="${klasse}"[^>]*>`).exec(html);
  if (!el) return null;
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(el[0]);
  return m ? m[1] : null;
}

describe('titelbildAngaben: Formen des Werts von cover (V4, V10)', () => {
  it('ohne Kopf, ohne cover oder bei einem Nicht-Objekt keine Angaben', () => {
    for (const daten of [null, undefined, 'cover', 5, [], ['cover'], {}, { titel: 'x' }]) {
      expect(titelbildAngaben(daten)).toBeNull();
    }
  });

  it('Pfad-Form: relative und absolute Pfade, Rand-Leerraum entfällt', () => {
    expect(angabenAus('cover: bilder/strand.jpg')).toEqual({
      quelle: 'bilder/strand.jpg',
      form: 'pfad',
      hoehe: HOEHE_VORGABE,
      lage: LAGE_VORGABE,
    });
    expect(titelbildAngaben({ cover: '  C:/bilder/a.png ' }).quelle).toBe('C:/bilder/a.png');
    expect(titelbildAngaben({ cover: '../a.png' }).form).toBe('pfad');
  });

  it('Wiki-Form mit Anführungszeichen, Anker und Breite nach dem senkrechten Strich (AK5)', () => {
    expect(angabenAus('cover: "[[strand.jpg]]"')).toMatchObject({
      form: 'wiki',
      quelle: 'strand.jpg',
    });
    expect(angabenAus("cover: '[[ bilder/strand.jpg|300 ]]'")).toMatchObject({
      form: 'wiki',
      quelle: 'bilder/strand.jpg',
    });
    expect(angabenAus('cover: "[[strand.jpg#oben]]"').quelle).toBe('strand.jpg');
    expect(angabenAus('cover: "[[]]"').form).toBeNull();
    expect(angabenAus('cover: "[[|300]]"').form).toBeNull();
  });

  it('Wiki-Form ohne Anführungszeichen: Liste mit einer Liste mit einer Zeichenkette (V10)', () => {
    // YAML liest `[[strand.jpg]]` als verschachtelte Liste.
    expect(extractFrontmatter('---\ncover: [[strand.jpg]]\n---\n').data.cover).toEqual([
      ['strand.jpg'],
    ]);
    expect(angabenAus('cover: [[strand.jpg]]')).toMatchObject({
      form: 'wiki',
      quelle: 'strand.jpg',
    });
    expect(angabenAus('cover: [[strand.jpg|200]]').quelle).toBe('strand.jpg');
    // Zwei Einträge, Zahl oder tiefere Schachtelung ergeben kein Titelbild.
    expect(angabenAus('cover: [[a.png], [b.png]]').form).toBeNull();
    expect(angabenAus('cover: [[a.png, b.png]]').form).toBeNull();
    expect(angabenAus('cover: [[5]]').form).toBeNull();
    expect(angabenAus('cover: [[[a.png]]]').form).toBeNull();
  });

  it('Netz-Form bei http: und https:, ohne Rücksicht auf die Schreibweise (P3 = A)', () => {
    for (const wert of ['https://example.org/a.png', 'http://example.org/a.png', 'HTTPS://x/a']) {
      expect(titelbildAngaben({ cover: wert })).toMatchObject({ form: 'netz', quelle: wert });
    }
  });

  it('Datei-Adresse, Daten-Adresse, leerer Wert, Zahl, Wahrheitswert und Objekt ergeben nichts', () => {
    for (const wert of [
      'file:///C:/a.png',
      'FILE://rechner.invalid/a.png',
      'data:image/png;base64,AAAA',
      '',
      '   ',
      5,
      true,
      null,
      { pfad: 'a.png' },
      ['a.png'],
    ]) {
      const a = titelbildAngaben({ cover: wert });
      expect(a, String(wert)).not.toBeNull();
      expect(a.form, String(wert)).toBeNull();
      expect(titelbildHtml(a)).toBe('');
    }
  });
});

describe('titelbildAngaben: Höhe und Lage (V9, AK4)', () => {
  const mit = (zusatz) => titelbildAngaben({ cover: 'a.png', ...zusatz });

  it('Vorgaben ohne Angabe: 200 Bildpunkte und die Mitte', () => {
    expect(mit({})).toMatchObject({ hoehe: 200, lage: 50 });
  });

  it('Höhe: Zahl und Ziffern-Zeichenkette, gerundet und auf 80 bis 600 begrenzt', () => {
    expect(mit({ 'cover-height': 320 }).hoehe).toBe(320);
    expect(mit({ 'cover-height': '320' }).hoehe).toBe(320);
    expect(mit({ 'cover-height': 250.6 }).hoehe).toBe(251);
    expect(mit({ 'cover-height': 10 }).hoehe).toBe(80);
    expect(mit({ 'cover-height': -5 }).hoehe).toBe(80);
    expect(mit({ 'cover-height': 100000 }).hoehe).toBe(600);
    expect(mit({ 'cover-height': '9999' }).hoehe).toBe(600);
  });

  it('Höhe: Unverständliches fällt still auf die Vorgabe zurück', () => {
    for (const wert of ['300px', 'hoch', '', '3e2', true, null, [300], { h: 300 }, NaN, Infinity]) {
      expect(mit({ 'cover-height': wert }).hoehe, String(wert)).toBe(200);
    }
  });

  it('Lage: Zahl 0 bis 100 begrenzt, dazu top, center und bottom', () => {
    expect(mit({ 'cover-position': 30 }).lage).toBe(30);
    expect(mit({ 'cover-position': -20 }).lage).toBe(0);
    expect(mit({ 'cover-position': 140 }).lage).toBe(100);
    expect(mit({ 'cover-position': 'top' }).lage).toBe(0);
    expect(mit({ 'cover-position': ' Center ' }).lage).toBe(50);
    expect(mit({ 'cover-position': 'bottom' }).lage).toBe(100);
  });

  it('Lage: Unverständliches fällt still auf die Mitte zurück', () => {
    for (const wert of ['oben', '30%', '30', false, null, ['top'], NaN]) {
      expect(mit({ 'cover-position': wert }).lage, String(wert)).toBe(50);
    }
  });
});

describe('titelbildHtml: Kopf-Bereich je Form (V3, V5, V6)', () => {
  it('ohne Angaben oder ohne Form leer', () => {
    expect(titelbildHtml(null)).toBe('');
    expect(titelbildHtml(undefined)).toBe('');
    expect(titelbildHtml({ quelle: 'a.png', form: null, hoehe: 200, lage: 50 })).toBe('');
  });

  it('Pfad-Form: Bild mit kodierter Adresse, Hinweis «nicht gefunden», Stil aus den Zahlen', () => {
    const html = titelbildHtml(
      titelbildAngaben({ cover: 'bilder/strand.jpg', 'cover-height': 300 }),
    );
    expect(html).toBe(
      '<figure class="titelbild" style="--titelbild-hoehe: 300px; --titelbild-lage: 50%">' +
        '<img class="titelbild-bild" src="bilder/strand.jpg" alt="">' +
        '<span class="titelbild-hinweis" data-i18n="frontmatter.coverImage.missing" ' +
        'title="bilder/strand.jpg"></span></figure>\n',
    );
    // Kein Quell-Zeilen-Attribut: Der Bildlauf-Abgleich bleibt an der Frontmatter-Zeile.
    expect(html).not.toContain('data-source-line');
  });

  it('Wiki-Form: Platzhalter der Wiki-Einbettung mit maskiertem Namen', () => {
    const html = titelbildHtml(titelbildAngaben({ cover: '[[mein "Bild".png]]' }));
    expect(html).toContain(
      '<span class="wiki-embed wiki-embed-image" data-embed-kind="image" ' +
        'data-embed-path="mein &quot;Bild&quot;.png"></span>',
    );
    expect(html).toContain('data-i18n="frontmatter.coverImage.missing"');
    expect(html).not.toContain('<img');
  });

  it('Netz-Form: kein Bild-Element, Klasse ohne Bild und Hinweis «aus dem Netz» (AK2)', () => {
    const html = titelbildHtml(titelbildAngaben({ cover: 'https://example.org/a.png' }));
    expect(html).toContain('class="titelbild titelbild-ohne-bild"');
    expect(html).toContain('data-i18n="frontmatter.coverImage.remote"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('src=');
  });

  it('der Stil-Wert entsteht nur aus geprüften Zahlen, auch bei gereichten Angaben', () => {
    const html = titelbildHtml({
      quelle: 'a.png',
      form: 'pfad',
      hoehe: '100px; background: url(x)',
      lage: '0%; color: red',
    });
    expect(attribut(html, 'titelbild', 'style')).toBe(
      '--titelbild-hoehe: 200px; --titelbild-lage: 50%',
    );
  });
});

describe('titelbildHtml: Kodierung und Maskierung (AK6)', () => {
  it('Anführungszeichen, spitze Klammern, Kaufmanns-Und, Prozent, Leerzeichen und Umlaute', () => {
    const wert = `bilder/a "b" 'c' <d> & 50% ä ß.png`;
    const html = titelbildHtml(titelbildAngaben({ cover: wert }));
    // Genau ein Bild-Element und ein Hinweis; nichts aus dem Wert wird zu Markup.
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html.match(/<span\b/g)).toHaveLength(1);
    expect(html).not.toContain('<d>');
    const src = attribut(html, 'titelbild-bild', 'src');
    expect(src).toBe(
      'bilder/a%20%22b%22%20%27c%27%20%3Cd%3E%20&amp;%2050%25%20%C3%A4%20%C3%9F.png',
    );
    // `&` steht maskiert im Attribut. Einen Rückweg zum Dateinamen sichert dieser
    // Fall bewusst NICHT zu: Die Bild-Auflösung (resolveImagesForBase in
    // src/main/preload-images.js) liest das Attribut roh, entmaskiert `&amp;`
    // nicht, und decodeURI dekodiert auch `%26` nicht. Ein Bild mit `&` im
    // Namen wird deshalb nie gefunden, wie jedes Bild des Programms — ein
    // Bestands-Mangel, als Zeile im Befund-Eingang von 3E-000161 geführt.
    expect(src).toContain('&amp;');
    expect(src).not.toMatch(/&(?!amp;)/);
    expect(attribut(html, 'titelbild-hinweis', 'title')).toBe(
      'bilder/a &quot;b&quot; &#39;c&#39; &lt;d&gt; &amp; 50% ä ß.png',
    );
  });

  it('ohne `&` kommt der Wert über den Weg der Bild-Auflösung unverändert zurück', () => {
    // Derselbe Weg wie resolveImagesForBase: decodeURI auf dem rohen
    // Attribut-Wert, ohne Entmaskieren.
    const wert = `bilder/a "b" 'c' <d> 50% ä ß.png`;
    const src = attribut(titelbildHtml(titelbildAngaben({ cover: wert })), 'titelbild-bild', 'src');
    expect(src).not.toContain('&');
    expect(decodeURI(src)).toBe(wert);
  });

  it('ein Wert, der das Attribut schließen will, bleibt im Attribut', () => {
    const html = titelbildHtml(
      titelbildAngaben({ cover: 'x.png" onerror="alert(1)"><script>x</script>' }),
    );
    expect(html).not.toContain('<script');
    // Geparst wie im Fenster: genau die drei Elemente des Kopf-Bereichs, keines
    // mit einem Ereignis-Attribut, der Wert vollständig im Attribut `title`.
    const { document } = new JSDOM(`<body>${html}</body>`).window;
    const alle = [...document.body.querySelectorAll('*')];
    expect(alle.map((el) => el.tagName)).toEqual(['FIGURE', 'IMG', 'SPAN']);
    for (const el of alle) {
      expect(el.getAttributeNames().filter((n) => /^on/i.test(n))).toEqual([]);
    }
    expect(document.querySelector('.titelbild-hinweis').title).toBe(
      'x.png" onerror="alert(1)"><script>x</script>',
    );
  });

  it('ein einzelnes Ersatzzeichen ergibt nur den Hinweis, ohne Fehler', () => {
    const html = titelbildHtml(titelbildAngaben({ cover: 'a\uD800b.png' }));
    expect(html).toContain('class="titelbild titelbild-ohne-bild"');
    expect(html).toContain('data-i18n="frontmatter.coverImage.missing"');
    expect(html).not.toContain('<img');
  });
});

describe('renderMarkdown: Einhänge-Punkt in der Vollansicht (V2, V3, V12, AK1)', () => {
  const doc = '---\ncover: bilder/strand.jpg\ntitel: Probe\n---\n# Überschrift\n\nText\n';

  it('ohne Option kein Titelbild, mit Option vor der Frontmatter-Zeile', () => {
    const ohne = renderMarkdown(doc, 'de');
    expect(ohne).not.toContain('titelbild');
    expect(ohne.startsWith('<div class="frontmatter-block"')).toBe(true);
    const mit = renderMarkdown(doc, 'de', { titelbild: true });
    expect(mit.startsWith('<figure class="titelbild"')).toBe(true);
    const iTitel = mit.indexOf('<figure class="titelbild"');
    const iZeile = mit.indexOf('<div class="frontmatter-block"');
    const iText = mit.indexOf('<h1');
    expect(iTitel).toBeLessThan(iZeile);
    expect(iZeile).toBeLessThan(iText);
    // Der Rest ist derselbe wie ohne Option.
    expect(mit.slice(iZeile)).toBe(ohne);
  });

  it('nur echtes true schaltet; andere Werte der Option zählen nicht', () => {
    for (const wert of [1, 'true', {}, false]) {
      expect(renderMarkdown(doc, 'de', { titelbild: wert })).not.toContain('titelbild');
    }
  });

  it('mit unterdrückter Frontmatter-Zeile steht allein der Kopf-Bereich vor dem Text', () => {
    const html = renderMarkdown(doc, 'de', { titelbild: true, frontmatterBlock: false });
    expect(html.startsWith('<figure class="titelbild"')).toBe(true);
    expect(html).not.toContain('frontmatter-block');
  });

  it('ein Kopf, den der YAML-Leser nicht liest, ergibt kein Titelbild', () => {
    const kaputt = '---\ncover: a.png\n  : [\n---\nText\n';
    expect(extractFrontmatter(kaputt).parseError).toBeTruthy();
    expect(renderMarkdown(kaputt, 'de', { titelbild: true })).not.toContain('titelbild');
  });

  it('ohne cover oder ohne Kopf kein Titelbild', () => {
    expect(renderMarkdown('---\ntitel: x\n---\nText\n', 'de', { titelbild: true })).not.toContain(
      'titelbild',
    );
    expect(renderMarkdown('Text', 'de', { titelbild: true })).not.toContain('titelbild');
  });
});

describe('Nachweis zu V10: Umbenennen und die Wiki-Form im Kopf (AK5, Schritt 2)', () => {
  // Rename-Paare in der Form, die das Programm baut (renamesFromPairs in
  // src/main/documents/link-update.js): Basisname ohne Endung plus Pfade.
  const paar = (von, nach) => ({
    oldBase: von
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, ''),
    newBase: nach
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, ''),
    oldAbs: von,
    newAbs: nach,
  });
  const umbenennen = (inhalt, r) =>
    computeLinkRewrites(inhalt, { renames: [r], contextPath: '/root/Quelle.md' });

  it('Form mit Anführungszeichen zieht nach, Form ohne Anführungszeichen nicht (Dokument-Ziel)', () => {
    const vorher = '---\nmit: "[[Alt]]"\nohne: [[Alt]]\n---\n[[Alt]]\n';
    const res = umbenennen(vorher, paar('/root/Alt.md', '/root/Neu.md'));
    expect(res.newContent).toBe('---\nmit: "[[Neu]]"\nohne: [[Alt]]\n---\n[[Neu]]\n');
  });

  it('IST-STAND zum Befund vom 2026-11-12 (Befund-Eingang 3E-000161): bei einem Bild als Ziel zieht keine Form nach', () => {
    // **Kein Soll, sondern der gemessene Mangel.** Dieser Fall hält den Ist-Stand
    // der Befund-Zeile vom 2026-11-12 im Befund-Eingang von 3E-000161 fest: Der
    // Rename-Kern sucht Wiki-Ziele über den Basisnamen ohne Endung und schneidet
    // dabei nur Markdown-Endungen ab; `[[alt.png]]` trifft das Paar mit dem
    // Basisnamen `alt` deshalb nie. Bei der Behebung dieses Befunds ist der Fall
    // UMZUKEHREN: Er erwartet dann `[[neu.png]]` im Kopf (beide Schreibweisen,
    // soweit die Behebung sie abdeckt) und `![[neu.png]]` im Text.
    const vorher = '---\ncover: "[[alt.png]]"\n---\n![[alt.png]]\n';
    const res = umbenennen(vorher, paar('/root/alt.png', '/root/neu.png'));
    expect(res.changed).toBe(false);
    expect(res.newContent).toBe(vorher);
    const ohne = '---\ncover: [[alt.png]]\n---\n';
    expect(umbenennen(ohne, paar('/root/alt.png', '/root/neu.png')).changed).toBe(false);
  });
});
