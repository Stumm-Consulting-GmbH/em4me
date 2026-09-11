// @vitest-environment jsdom
// 4T-000194: Sicherheits-Snapshots des Portable-Render-Pfads MIT echtem
// DOMParser (jsdom) — der P-02-Block-Sanitizer nutzt DOMParser und faellt
// in purem Node auf Voll-Escaping zurueck; erst diese Umgebung prueft die
// produktive Tag-/Attribut-Whitelist aus 4T-000176.
import { describe, it, expect } from 'vitest';
import { renderMarkdown, convertMarkdownPortable } from '../../../src/shared/markdown/markdown.js';
import { PORTABLE_HTML_ALLOWED_ATTRS } from '../../../src/shared/markdown/portable-sanitizer.js';

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
