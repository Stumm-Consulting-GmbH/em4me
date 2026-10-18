// @vitest-environment jsdom
// 4T-000194: Sicherheits-Snapshots des Portable-Render-Pfads MIT echtem
// DOMParser (jsdom) — der P-02-Block-Sanitizer nutzt DOMParser und faellt
// in purem Node auf Voll-Escaping zurueck; erst diese Umgebung prueft die
// produktive Tag-/Attribut-Whitelist aus 4T-000176.
import { describe, it, expect } from 'vitest';
import { renderMarkdown, convertMarkdownPortable } from '../../../src/shared/markdown/markdown.js';
import {
  PORTABLE_HTML_ALLOWED_ATTRS,
  PORTABLE_HTML_ALLOWED_TAGS,
  PORTABLE_HTML_DROP_WITH_CONTENT,
} from '../../../src/shared/markdown/portable-sanitizer.js';

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

// 4T-002068 (Epic 3E-000344): Wert-Schranke für `style`. Ein Stil-Wert lädt
// über `url(…)` ein Bild an der `src`-Schranke oben vorbei. Zulässig ist nur
// eine Adresse, die auch als `src` bestünde; sonst entfällt das Attribut,
// das Element bleibt — dieselbe Bauform wie bei `src`.
describe('P-02-Sanitizer: style nur mit eingebetteter Adresse (4T-002068)', () => {
  const block = (attribut) =>
    renderMarkdown(`${MARKER}\n\n<div><span ${attribut}>Inhalt</span></div>\n`, 'de');

  it('ein Stil-Wert ohne Adresse bleibt unverändert', () => {
    expect(block(`style="color: red"`)).toContain('style="color: red"');
    expect(block(`style="text-align:right"`)).toContain('style="text-align:right"');
  });

  it('eine eingebettete Bild-Adresse in url(…) bleibt erhalten', () => {
    const html = block(`style="background:url(data:image/png;base64,AA)"`);
    expect(html).toContain('background:url(data:image/png;base64,AA)');
    expect(block(`style="background:url('data:image/png;base64,AA')"`)).toContain('style=');
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
      // Der DOMParser löst Zeichen-Referenzen auf, bevor die Schranke prüft.
      `style="background:&#117;rl(file:///x.png)"`,
    ]) {
      const html = block(attribut);
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
      const html = block(attribut);
      expect(html, attribut).not.toContain('style=');
      expect(html, attribut).toContain('Inhalt');
    }
  });
});

// 4T-001556 (Epic 3E-000298): Das `scope`-Attribut der Kopfzellen sagt einem
// Vorleseprogramm, ob eine Kopfzelle fuer ihre Spalte oder ihre Zeile gilt.
// Geprueft wird am LESE-ENDE (Auflage aus Kapitel 5.3 der Test-Strategie):
// Die Tabelle entsteht ueber den echten Erzeuger, wird exportiert und dann so
// gerendert, wie der Empfaenger sie sieht. Ein handgeschriebener HTML-String
// pruefte allein den Sanitizer und nicht die Strecke, an der der Befund lag.
describe('P-02-Sanitizer: scope ueberlebt bis zur Anzeige (4T-001556)', () => {
  const TABELLE = [
    '```perspective-table',
    '{|',
    '! Kopf A',
    '! Kopf B',
    '|-',
    '! Zeilenkopf',
    '| colspan="2" | Zelle',
    '|}',
    '```',
    '',
  ].join('\n');

  it('eine erzeugte Tabelle behaelt scope="col" und scope="row" bis in die Anzeige', () => {
    const datei = convertMarkdownPortable(TABELLE, true);
    expect(datei).toContain('scope="col"');
    expect(datei).toContain('scope="row"');
    const anzeige = renderMarkdown(datei, 'de');
    expect(anzeige).toContain('scope="col"');
    expect(anzeige).toContain('scope="row"');
  });

  it('die Datatable- und die Ereignis-Tabelle behalten ihr scope="col"', () => {
    const datatable = convertMarkdownPortable(
      '```perspective-datatable\ncolumns: Name:text, Zahl:number\n| a | 1 |\n```\n',
      true,
    );
    expect(renderMarkdown(datatable, 'de')).toContain('scope="col"');
    const events = convertMarkdownPortable(
      '```perspective-events\n| 2026-01-01 | | urlaub | Text |\n```\n',
      true,
    );
    expect(renderMarkdown(events, 'de')).toContain('scope="col"');
  });

  it('die vier Werte des Standards bleiben, gross wie klein geschrieben', () => {
    for (const wert of ['col', 'row', 'colgroup', 'rowgroup', 'COL']) {
      const html = renderMarkdown(
        `${MARKER}\n\n<table><tr><th scope="${wert}">K</th></tr></table>\n`,
        'de',
      );
      expect(html, wert).toContain(`scope="${wert}"`);
    }
  });

  it('ein fremder Wert laesst das Attribut entfallen, das Element bleibt', () => {
    for (const wert of ['foo', 'javascript:x', '', ' col row ']) {
      const html = renderMarkdown(
        `${MARKER}\n\n<table><tr><th scope="${wert}">Kopftext</th></tr></table>\n`,
        'de',
      );
      expect(html, wert).not.toContain('scope=');
      expect(html, wert).toContain('Kopftext');
      expect(html, wert).toContain('<th');
    }
  });
});

// 4T-001556: Die Erhebung zur Gegenfrage AK4 als dauerhafter Waechter statt
// als einmal gefuehrtes Protokoll. Sie haelt fest, WELCHE Attribute die drei
// Erzeuger des portablen Exports schreiben — ein neu hinzukommendes faellt
// hier auf, statt still am Lese-Ende zu verschwinden. Das ist genau die
// Bauart des Befunds, den dieser Vorgang behebt.
describe('Portabler Export: erzeugte Attribute gegen die Positivliste (4T-001556)', () => {
  const MUSTER = [
    '```perspective-table',
    '{|',
    '! Kopf A',
    '! Kopf B',
    '|-',
    '! Zeilenkopf',
    '| colspan="2" rowspan="2" align="right" valign="top" | Text mit [Link](https://example.org)',
    '|}',
    '```',
    '',
    '```perspective-datatable',
    'columns: Name:text, Zahl:number(2)',
    'aggregate: Zahl:sum',
    '| a | 1 |',
    '```',
    '',
    '```perspective-events',
    '| 2026-01-01 | 2026-01-05 | urlaub | Text |',
    '```',
    '',
  ].join('\n');

  function attributeIn(text) {
    const gefunden = new Set();
    const tagRe =
      /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*\/?>/g;
    let m;
    while ((m = tagRe.exec(text)) !== null) {
      const attrRe = /([a-zA-Z-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?/g;
      let a;
      while ((a = attrRe.exec(m[2])) !== null) gefunden.add(a[1].toLowerCase());
    }
    return [...gefunden].sort();
  }

  it('die Erzeuger schreiben genau die erhobenen Attribute', () => {
    expect(attributeIn(convertMarkdownPortable(MUSTER, true))).toEqual([
      'colspan',
      'href',
      'rowspan',
      'scope',
      'style',
    ]);
  });

  it('jedes erzeugte Attribut steht auf der Positivliste', () => {
    for (const name of attributeIn(convertMarkdownPortable(MUSTER, true))) {
      expect(PORTABLE_HTML_ALLOWED_ATTRS.has(name), name).toBe(true);
    }
  });

  // Die Gegenprobe zur Erhebung: Diese Attribute schreiben die interaktiven
  // Sichten derselben Module, und sie bleiben bewusst draussen. `data-*`
  // traegt die Bedienung der Anwendung und ist im fremden Renderer wirkungs-
  // los; `id` verweist auf Anker, die im portablen Dokument kein Ziel haben;
  // `tabindex`, `role`, `aria-*`, `type`, `value`, `name`, `autocomplete` und
  // `spellcheck` gehoeren zu Bedienelementen, die es dort nicht gibt; die
  // Ereignis-Behandlungen sind die Sicherheits-Grenze selbst.
  it('die bewusst nicht gefuehrten Attribute bleiben draussen', () => {
    for (const name of [
      'id',
      'data-dt-col',
      'data-ev-row',
      'data-source-line',
      'data-i18n',
      'tabindex',
      'role',
      'aria-hidden',
      'type',
      'value',
      'name',
      'autocomplete',
      'spellcheck',
      'onclick',
      'onerror',
    ]) {
      expect(PORTABLE_HTML_ALLOWED_ATTRS.has(name), name).toBe(false);
    }
  });
});

// 4T-001918 (Epic 3E-000340): Die Element-Liste ist um 26 gliedernde Elemente
// gewachsen, ein nicht erlaubtes Element wird ausgepackt statt samt Inhalt
// entfernt (Entscheidung des Product Owners vom 2026-09-23, Option D). Geprüft
// am LESE-ENDE: Die Tabelle entsteht über den echten Export, geht durch die
// Anzeige und wird dort geprüft; wo der Befund schon in der Datei lag (B4,
// B5), zusätzlich am Datei-Inhalt.
const F3 = '```';

// Eine Perspective-Tabelle mit einer Zelle je Eintrag. Der äußere Zaun ist
// vier Backticks lang, damit Code-Blöcke und innere Tabellen in einer Zelle
// ihn nicht schließen.
function tabelle(zellen) {
  return [
    '````perspective-table',
    '{|',
    '|+ Beschriftung',
    '! Kopf',
    ...zellen.map((z) => `|-\n| ${z}`),
    '|}',
    '````',
    '',
  ].join('\n');
}

function exportUndAnzeige(zellen) {
  const datei = convertMarkdownPortable(tabelle(zellen), true);
  return { datei, anzeige: renderMarkdown(datei, 'de') };
}

describe('Portabler Filter: gliedernder Zell-Inhalt bis zur Anzeige (4T-001918)', () => {
  it('Text-Auszeichnung erscheint: Code, fett, kursiv, durchgestrichen, tiefgestellt, eingefügt', () => {
    const { anzeige } = exportUndAnzeige(['`code` **fett** *kursiv* ~~weg~~ H~2~O ++neu++']);
    for (const stueck of [
      '<code>code</code>',
      '<strong>fett</strong>',
      '<em>kursiv</em>',
      '<s>weg</s>',
      '<sub>2</sub>',
      '<ins>neu</ins>',
    ]) {
      expect(anzeige, stueck).toContain(stueck);
    }
  });

  it('Text-Auszeichnung erscheint: Abkürzung, gelöscht, hochgestellt (Fußnote)', () => {
    const { anzeige } = exportUndAnzeige([
      '*[HTML]: Hyper Text\nHTML hier\nzwei',
      '{++neu++} und {--alt--}\nzwei',
      'Text mit Fußnote[^1]\n\n[^1]: Die Fußnote',
    ]);
    expect(anzeige).toMatch(/<abbr title="Hyper Text"[^>]*>HTML<\/abbr>/);
    expect(anzeige).toMatch(/<del\b[^>]*>alt<\/del>/);
    expect(anzeige).toMatch(/<sup\b[^>]*><a href="#fn1">\[1\]<\/a><\/sup>/);
    expect(anzeige).toMatch(/<section\b[^>]*>/);
    expect(anzeige).toContain('Die Fußnote');
  });

  it('eine mehrzeilige Zelle mit Aufzählung und eine mit Code-Block erscheinen', () => {
    const { anzeige } = exportUndAnzeige([
      '- erster Punkt\n- zweiter Punkt',
      '1. eins\n2. zwei',
      `${F3}js\nlet a = 1;\n${F3}\nnach`,
    ]);
    expect(anzeige).toMatch(/<ul>\s*<li>erster Punkt<\/li>\s*<li>zweiter Punkt<\/li>\s*<\/ul>/);
    expect(anzeige).toMatch(/<ol>\s*<li>eins<\/li>/);
    expect(anzeige).toMatch(/<pre><code class="[^"]*">/);
    expect(anzeige).toContain('let</span> a = ');
    expect(anzeige).toContain('<p>nach</p>');
  });

  it('Absätze, Überschriften, Zitat, Trennlinie und Definitionsliste erscheinen', () => {
    const { anzeige } = exportUndAnzeige([
      'Absatz eins\n\nAbsatz zwei',
      '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6',
      '> Zitat\n> zwei',
      'oben\n\n---\n\nunten',
      'Begriff\n: Erklärung',
    ]);
    expect(anzeige).toContain('<p>Absatz eins</p>');
    for (let n = 1; n <= 6; n++) expect(anzeige).toContain(`<h${n}>H${n}</h${n}>`);
    expect(anzeige).toMatch(/<blockquote>\s*<p>Zitat/);
    expect(anzeige).toMatch(/<p>oben<\/p>\s*<hr>\s*<p>unten<\/p>/);
    expect(anzeige).toMatch(/<dl>\s*<dt>Begriff<\/dt>\s*<dd\b[^>]*>Erklärung<\/dd>/);
  });

  it('B5: eine innere Tabelle behält ihre Fettschrift in der Datei und in der Anzeige', () => {
    const { datei, anzeige } = exportUndAnzeige([
      `\n${F3}perspective-table\n{|\n| **fett** innen\n|}\n${F3}`,
    ]);
    expect(datei).toContain('<strong>fett</strong> innen');
    expect(datei).not.toContain('&lt;');
    expect(anzeige).toContain('<strong>fett</strong> innen');
  });

  it('B4: Aufgaben-Kästchen stehen als Zeichen in der Datei und in der Anzeige', () => {
    const { datei, anzeige } = exportUndAnzeige(['- [ ] offen\n- [x] erledigt\n- [/] halb']);
    expect(datei).toContain('☐ offen');
    expect(datei).toContain('☑ erledigt');
    // Erweiterter Aufgaben-Zustand: Klammerform, wie der Anwender sie schreibt.
    expect(datei).toContain('>[/] halb</li>');
    for (const verboten of ['&lt;', '<input', '<label', 'task-state-box']) {
      expect(datei, verboten).not.toContain(verboten);
    }
    expect(anzeige).toContain('☐ offen');
    expect(anzeige).toContain('☑ erledigt');
    expect(anzeige).toContain('[/] halb');
    expect(anzeige).not.toContain('&lt;');
  });

  it('die gewöhnliche Anzeige behält ihr Kästchen als Eingabefeld', () => {
    const html = renderMarkdown('- [ ] offen\n', 'de');
    expect(html).toContain('<input class="task-list-item-checkbox"');
  });

  it('ein nicht aufgeführtes, harmloses Element wird ausgepackt, sein Text erscheint', () => {
    const html = renderMarkdown(
      `${MARKER}\n\n<div><u>unterstrichen</u> und <font color="red">alt</font> <form><button>Knopf</button><input name="x"></form></div>\n`,
      'de',
    );
    for (const text of ['unterstrichen', 'alt', 'Knopf']) expect(html, text).toContain(text);
    for (const element of ['<u>', '<font', '<form', '<button', '<input']) {
      expect(html, element).not.toContain(element);
    }
  });

  it('ein ausgepacktes Element gibt seinen Inhalt der Prüfung weiter', () => {
    const html = renderMarkdown(
      `${MARKER}\n\n<div><u><span onclick="alert(1)">x</span><iframe src="https://example.org">IN</iframe></u></div>\n`,
      'de',
    );
    expect(html).toContain('<span>x</span>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<iframe');
  });

  it('ein gefährliches Element wird weiterhin samt Inhalt entfernt', () => {
    for (const stueck of [
      '<script>INNEN()</script>',
      '<style>.INNEN{}</style>',
      '<template>INNEN</template>',
      '<iframe>INNEN</iframe>',
      '<noscript>INNEN</noscript>',
      '<noembed>INNEN</noembed>',
      '<noframes>INNEN</noframes>',
      '<xmp>INNEN</xmp>',
      '<title>INNEN</title>',
      '<svg><text>INNEN</text><desc>INNEN</desc></svg>',
      '<math><mi>INNEN</mi><annotation-xml>INNEN</annotation-xml></math>',
      '<audio>INNEN</audio>',
      '<video>INNEN</video>',
      '<object>INNEN</object>',
      '<textarea>INNEN</textarea>',
      '<select><option>INNEN</option></select>',
    ]) {
      const html = renderMarkdown(`${MARKER}\n\n<div>vor${stueck}nach</div>\n`, 'de');
      expect(html, stueck).not.toContain('INNEN');
      expect(html, stueck).toContain('vor');
      expect(html, stueck).toContain('nach');
    }
    expect(renderMarkdown(`${MARKER}\n\n<div><embed src="x.swf">ok</div>\n`, 'de')).not.toContain(
      '<embed',
    );
  });
});

// 4T-001918, Frage 2 Option B: Ein Bild mit Adresse relativ zum Dokument darf
// am `src` eines `img` stehen; jede Adresse mit Schema, mit führendem `/` oder
// `\`, mit Steuerzeichen oder ohne gültige Entschlüsselung verliert wie bisher
// ihre Quelle, das Element bleibt. Im Stil-Wert bleibt allein die eingebettete
// Adresse zulässig.
describe('P-02-Sanitizer: relative Bild-Adresse am img (4T-001918)', () => {
  const bild = (quelle) =>
    renderMarkdown(`${MARKER}\n\n<p><img alt="X" src="${quelle}"></p>\n`, 'de');

  it('eine Adresse relativ zum Dokument bleibt erhalten', () => {
    for (const quelle of ['bild.png', 'bilder/x.png', './x.png', 'Bild%20eins.png', ' bild.png']) {
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
      '%20//rechner/x.png',
      'bild%00.png',
      'bild&#9;.png',
      '%E0%A4%A.png',
      'mailto:x@example.org',
    ]) {
      const html = bild(quelle);
      expect(html, quelle).not.toMatch(/\ssrc=/);
      expect(html, quelle).toContain('<img');
    }
  });

  it('die relative Adresse gilt nur am img, nicht an einem anderen Element', () => {
    const html = renderMarkdown(`${MARKER}\n\n<div><span src="bild.png">x</span></div>\n`, 'de');
    expect(html).not.toContain('src=');
  });

  it('eine relative Adresse in url(…) setzt den Stil-Wert weiterhin außer Kraft', () => {
    const html = renderMarkdown(
      `${MARKER}\n\n<div><span style="background:url(relativ.png)">Inhalt</span></div>\n`,
      'de',
    );
    expect(html).not.toContain('style=');
    expect(html).toContain('Inhalt');
  });

  it('ein relatives Bild in einer Zelle steht in der Datei und in der Anzeige', () => {
    // Eine Folgezeile, die mit `!` beginnt, wäre eine Kopfzelle; das zweite
    // Bild steht deshalb hinter Text.
    const { datei, anzeige } = exportUndAnzeige([
      '![Bild](bild.png)',
      'vor\n\nText ![Zwei](zwei.png)',
    ]);
    expect(datei).toContain('src="bild.png"');
    expect(anzeige).toContain('src="bild.png"');
    expect(anzeige).toContain('src="zwei.png"');
  });

  it('eine Freigabe-Adresse als Roh-HTML in einer Zelle erreicht die Anzeige nicht', () => {
    const { datei, anzeige } = exportUndAnzeige([
      'Text <img alt="A" src="//rechner/x.png">',
      'vor\n\n<img alt="B" src="\\\\rechner\\x.png">',
    ]);
    expect(anzeige).not.toContain('rechner');
    expect(datei).not.toContain('//rechner');
  });
});

// 4T-001918: Der Element-Wächter — Gegenstück zum Attribut-Wächter oben, nach
// dessen Muster. Er misst die Elemente, die der Export am erzeugten Dokument
// schreibt, und hält sie in BEIDEN Richtungen gegen die Liste: Ein neu
// erzeugtes Element fällt hier auf, statt am Lese-Ende still ausgepackt zu
// werden; ein Listen-Eintrag, den kein Erzeuger mehr braucht, fällt ebenso
// auf. Das Muster folgt den gemessenen Konstrukten der Erhebung.
describe('Portabler Export: erzeugte Elemente gegen die Liste (4T-001918)', () => {
  const MUSTER =
    tabelle([
      '`code` **fett** *kursiv* ~~weg~~ H~2~O ++neu++ ==mark== [Link](https://example.org) Zeile<br>zwei',
      'Text mit Fußnote[^1]\n\n[^1]: Die Fußnote',
      'Absatz eins\n\nAbsatz zwei',
      '- a\n- b',
      '3. drei\n4. vier',
      '- [ ] offen\n- [x] erledigt\n- [/] halb',
      '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6',
      '> Zitat\n> zwei',
      `${F3}js\nlet a = 1;\n${F3}`,
      'oben\n\n---\n\nunten',
      'Begriff\n: Erklärung',
      '> [!note] Titel\n> Text',
      '*[HTML]: Hyper Text\nHTML hier',
      '{++neu++} und {--alt--}\nzwei',
      '![Bild](data:image/png;base64,AA)',
      '![Bild](bild.png)',
      `\n${F3}perspective-table\n{|\n| **fett** innen\n|}\n${F3}`,
    ]) +
    [
      '',
      '```perspective-datatable',
      'columns: Name:text, Zahl:number(2)',
      'aggregate: Zahl:sum',
      '| a | 1 |',
      '```',
      '',
      '```perspective-events',
      '| 2026-01-01 | 2026-01-05 | urlaub | Text |',
      '```',
      '',
    ].join('\n');

  // Auch Elemente mit Bindestrich und Groß-Klein-Schreibung (SVG) zählen.
  function elementeIn(text) {
    const gefunden = new Set();
    for (const m of text.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g)) gefunden.add(m[1].toLowerCase());
    return [...gefunden].sort();
  }

  // Bewusst nicht auf der Liste, aber vom Export geschrieben: das Symbol im
  // Kopf eines Hinweis-Kastens (inline Grafik, Begründung aus 4T-001471). Es
  // fehlt in der Anzeige, Titel und Text des Kastens erscheinen.
  const BEWUSST_DRAUSSEN = ['path', 'svg'];

  // Bewusst auf der Liste, aber von keinem Erzeuger geschrieben: die
  // Spalten-Gruppe der ursprünglichen Kalibrierung aus 4T-000176. Die
  // Entscheidung vom 2026-09-23 hält die 16 bisherigen Einträge unverändert;
  // sie bleiben, weil sie reine Spalten-Gliederung ohne Inhalt sind und eine
  // früher oder von Hand geschriebene Exporttabelle sie tragen darf.
  const OHNE_ERZEUGER = ['col', 'colgroup'];

  it('die Erzeuger schreiben genau die erhobenen Elemente', () => {
    expect(elementeIn(convertMarkdownPortable(MUSTER, true))).toEqual([
      'a',
      'abbr',
      'blockquote',
      'br',
      'caption',
      'code',
      'dd',
      'del',
      'div',
      'dl',
      'dt',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'img',
      'ins',
      'li',
      'mark',
      'ol',
      'p',
      'path',
      'pre',
      's',
      'section',
      'span',
      'strong',
      'sub',
      'sup',
      'svg',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'tr',
      'ul',
    ]);
  });

  it('Richtung 1: jedes erzeugte Element steht auf der Liste oder ist bewusst draußen', () => {
    for (const name of elementeIn(convertMarkdownPortable(MUSTER, true))) {
      const erlaubt = PORTABLE_HTML_ALLOWED_TAGS.has(name);
      expect(erlaubt || BEWUSST_DRAUSSEN.includes(name), name).toBe(true);
      expect(erlaubt && BEWUSST_DRAUSSEN.includes(name), name).toBe(false);
    }
  });

  it('Richtung 2: jeder Eintrag der Liste wird erzeugt, bis auf die benannte Spalten-Gruppe', () => {
    const erzeugt = new Set(elementeIn(convertMarkdownPortable(MUSTER, true)));
    const ungenutzt = [...PORTABLE_HTML_ALLOWED_TAGS].filter((name) => !erzeugt.has(name)).sort();
    expect(ungenutzt).toEqual(OHNE_ERZEUGER);
    expect(PORTABLE_HTML_ALLOWED_TAGS.size).toBe(42);
  });

  it('am Lese-Ende kommt jedes erlaubte erzeugte Element an, das bewusst draußen gelassene nicht', () => {
    const datei = convertMarkdownPortable(MUSTER, true);
    const anzeige = elementeIn(renderMarkdown(datei, 'de'));
    const erwartet = elementeIn(datei).filter((name) => !BEWUSST_DRAUSSEN.includes(name));
    expect(anzeige).toEqual(erwartet);
  });

  it('die bewusst draußen gelassenen Elemente gehen samt Inhalt, die Liste überschneidet sich nicht', () => {
    expect(PORTABLE_HTML_DROP_WITH_CONTENT.has('svg')).toBe(true);
    for (const name of PORTABLE_HTML_DROP_WITH_CONTENT) {
      expect(PORTABLE_HTML_ALLOWED_TAGS.has(name), name).toBe(false);
    }
    for (const name of ['label', 'input']) {
      expect(PORTABLE_HTML_ALLOWED_TAGS.has(name), name).toBe(false);
    }
  });

  // Gegenrichtung der Attribute (Befund Punkt 8): Die gliedernden Elemente
  // bringen Attribute mit, die nicht auf der Attribut-Liste stehen und beim
  // Lesen bewusst verloren gehen — `id` an Überschriften und am Fußnoten-
  // Rücksprung, `start` an einer nummerierten Liste, `data-task-state` am
  // erweiterten Aufgaben-Zustand und die Zeichen-Angaben des Symbols im
  // Hinweis-Kasten. Die Attribut-Liste bleibt unverändert (AK1).
  it('die Attribute der gliedernden Elemente, die beim Lesen entfallen, sind genau benannt', () => {
    const datei = convertMarkdownPortable(MUSTER, true);
    const attribute = new Set();
    for (const m of datei.matchAll(
      /<[a-zA-Z][a-zA-Z0-9-]*((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*\/?>/g,
    )) {
      for (const a of m[1].matchAll(/([a-zA-Z-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?/g)) {
        attribute.add(a[1].toLowerCase());
      }
    }
    const draussen = [...attribute].filter((name) => !PORTABLE_HTML_ALLOWED_ATTRS.has(name)).sort();
    expect(draussen).toEqual([
      'aria-hidden',
      'd',
      'data-task-state',
      'fill',
      'height',
      'id',
      'start',
      'stroke',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-width',
      'viewbox',
      'width',
      'xmlns',
    ]);
  });
});
