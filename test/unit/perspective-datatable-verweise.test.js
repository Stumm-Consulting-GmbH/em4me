// 4T-002014 (Epic 3E-000332): Verweise und Schlagworte in Text-Zellen der
// Datentabelle — der enge Zell-Renderer (cell-links-html.js) im Grid, im
// portablen Export und in der Pipeline samt ihren Schaltern.
//
// Eigene Datei statt Anbau an perspective-datatable.test.js: Jene steht am
// Größen-Budget der Prüfdateien (800 Zeilen), und sie prüft das Format-Modul
// ohne Pipeline; die Fälle hier laden die Pipeline (markdown.js).
import { describe, it, expect, afterEach } from 'vitest';
import {
  parsePerspectiveDatatable,
  computeAggregates,
  renderPerspectiveDatatableViewer,
  convertPerspectiveDatatableBlockToHtml,
} from '../../src/shared/markdown/perspective-datatable.js';
import {
  sortDatatableRows,
  filterDatatableRows,
} from '../../src/shared/markdown/perspective-datatable-view.js';
import { MAX_RENDER_ROWS } from '../../src/shared/markdown/perspective-datatable-html.js';
import { baueZellRenderer } from '../../src/shared/markdown/cell-links-html.js';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../src/shared/markdown/markdown.js';

// Kompakter Helfer: parst und erwartet fehlerfreie Struktur.
function parseOk(body) {
  const model = parsePerspectiveDatatable(body);
  expect(model.errors, JSON.stringify(model.errors)).toEqual([]);
  return model;
}

describe('perspective-datatable — Verweise und Schlagworte in Text-Zellen (4T-002014)', () => {
  const zellHtml = baueZellRenderer({ wikiLinks: true, tags: true, areaLinks: true });
  const zellHtmlPortabel = baueZellRenderer({ wikiLinks: true, tags: true, portable: true });
  const BODY =
    'columns: Name:text, Betrag:number(2), Notiz:text\n' +
    '| [[Ziel\\|Alias]] #projekt | 12.5 | [Bericht](Bericht.md) und [[Ziel#Kapitel]] |\n' +
    '| Anna | kaputt | **fett** $x$ `[[wörtlich]]` [[Z]] |';

  // Die Zelle mit Spalte `col` in Zeile `row` aus dem Grid-HTML.
  function zelle(html, row, col) {
    const zeile = html.split(`<tr data-dt-row="${row}">`)[1].split('</tr>')[0];
    return zeile.split(`data-dt-col="${col}"`)[1].split('</td>')[0];
  }

  it('zeigt Wiki-Verweis mit Alias und Anker, Markdown-Link und Schlagwort als Verweis (AK1)', () => {
    const html = renderPerspectiveDatatableViewer(BODY, { zellHtml });
    expect(zelle(html, 0, 0)).toBe(
      ' tabindex="0"><a href="Ziel.md" class="wikilink">Alias</a> ' +
        '<a href="#tag:projekt" class="tag-link">#projekt</a>',
    );
    expect(zelle(html, 0, 2)).toBe(
      ' tabindex="0"><a href="Bericht.md">Bericht</a> und ' +
        '<a href="Ziel.md#kapitel" class="wikilink">Ziel#Kapitel</a>',
    );
  });

  it('übrige Auszeichnung bleibt Text, Inline-Code hält den Verweis wörtlich (AK4)', () => {
    const html = renderPerspectiveDatatableViewer(BODY, { zellHtml });
    expect(zelle(html, 1, 2)).toBe(
      ' tabindex="0">**fett** $x$ <code>[[wörtlich]]</code> ' +
        '<a href="Z.md" class="wikilink">Z</a>',
    );
    expect(html).not.toContain('<strong>');
  });

  it('Zahl-Spalte und Fehler-Zelle bleiben unverändert (AK4)', () => {
    const html = renderPerspectiveDatatableViewer(BODY, { zellHtml });
    expect(zelle(html, 0, 1)).toBe(' tabindex="0">12.50');
    // Ein Verweis in einer Zahl-Spalte ist ein Zell-Fehler und bleibt Rohtext.
    const fehler = renderPerspectiveDatatableViewer('columns: N:number\n| [[Ziel]] |', {
      zellHtml,
    });
    expect(fehler).toContain('pdt-cell-error');
    expect(fehler).toContain('[[Ziel]]');
    expect(fehler).not.toContain('<a ');
  });

  it('eine berechnete Text-Spalte zeigt ihren Wert weiter maskiert (AK4)', () => {
    const html = renderPerspectiveDatatableViewer('columns: A:text, B:text = A\n| [[Ziel]] |', {
      zellHtml,
    });
    expect(zelle(html, 0, 0)).toContain('<a href="Ziel.md" class="wikilink">Ziel</a>');
    expect(html.split('pdt-computed').pop()).not.toContain('<a ');
  });

  it('eine Tabelle ohne Verweis-Zeichen ist byte-gleich zur Anzeige ohne Renderer (AK4)', () => {
    const body =
      'columns: Name:text, Betrag:number(2), Erledigt:boolean\n' +
      'aggregate: Betrag:sum, Name:count\n' +
      '| Anna **fett** `code` $x$ <b>h</b> | 12.5 | x |\n' +
      '| P\\|pe & "Otto" | kaputt |  |';
    expect(renderPerspectiveDatatableViewer(body, { zellHtml })).toBe(
      renderPerspectiveDatatableViewer(body),
    );
    expect(convertPerspectiveDatatableBlockToHtml(body, { zellHtml: zellHtmlPortabel })).toBe(
      convertPerspectiveDatatableBlockToHtml(body),
    );
  });

  it('ohne Renderer-Argument bleibt der Zell-Text maskierter Reintext', () => {
    const html = renderPerspectiveDatatableViewer(BODY);
    expect(zelle(html, 0, 0)).toBe(' tabindex="0">[[Ziel|Alias]] #projekt');
    expect(html).not.toContain('<a ');
  });

  it('Sortieren, Filtern und Aggregate arbeiten weiter auf dem geschriebenen Text (AK4)', () => {
    const model = parseOk(
      'columns: Name:text\naggregate: Name:count\n| [[Zebra]] |\n| Anton |\n|  |',
    );
    // Der geschriebene Text «[[Zebra]]» sortiert vor «Anton», weil «[» vor «A» liegt.
    expect(sortDatatableRows(model, 0, 1)).toEqual([0, 1, 2]);
    expect(filterDatatableRows(model, [{ text: 'zebra' }])).toEqual([0]);
    expect(computeAggregates(model)[0]).toEqual([{ func: 'count', value: 2 }]);
  });

  it('der portable Export zeigt Zell-Verweise wie der Fließtext-Export (AK6)', () => {
    const html = convertPerspectiveDatatableBlockToHtml(BODY, { zellHtml: zellHtmlPortabel });
    expect(html).toContain(
      '<td><a href="Ziel.md" class="wikilink">Alias</a> ' +
        '<a href="#tag:projekt" class="tag-link">#projekt</a></td>',
    );
    // Die Fehler-Zelle bleibt Rohtext mit Markierung, die Zahl rechtsbündig.
    expect(html).toContain('>kaputt</td>');
  });

  it('die Pipeline reicht die Renderer an Anzeige und Export durch', () => {
    const src = '```perspective-datatable\ncolumns: Name:text\n| [[Ziel]] #projekt |\n```\n';
    expect(renderMarkdown(src, 'de')).toContain(
      '<a href="Ziel.md" class="wikilink">Ziel</a> <a href="#tag:projekt" class="tag-link">',
    );
    expect(convertMarkdownPortable(src, true)).toContain(
      '<td><a href="Ziel.md" class="wikilink">Ziel</a> <a href="#tag:projekt" class="tag-link">',
    );
  });
});

describe('perspective-datatable — Aus-Zustände der Zell-Verweise (4T-002014, AK5)', () => {
  const SRC = '```perspective-datatable\ncolumns: Name:text\n| [[Ziel]] #projekt |\n```\n';

  afterEach(() => {
    configureExtensions([]);
  });

  it('abgeschaltete Wiki-Links: [[…]] bleibt Text, das Schlagwort wirkt', () => {
    configureExtensions(['wiki-links']);
    const html = renderMarkdown(SRC, 'de');
    expect(html).toContain('[[Ziel]] <a href="#tag:projekt" class="tag-link">#projekt</a>');
    expect(html).not.toContain('wikilink');
    expect(convertMarkdownPortable(SRC, true)).not.toContain('wikilink');
  });

  it('abgeschaltete Tags: #wort bleibt Text, der Verweis wirkt', () => {
    configureExtensions(['tags']);
    const html = renderMarkdown(SRC, 'de');
    expect(html).toContain('<a href="Ziel.md" class="wikilink">Ziel</a> #projekt');
    expect(html).not.toContain('tag-link');
    expect(convertMarkdownPortable(SRC, true)).not.toContain('tag-link');
  });

  it('abgeschaltete Datentabelle: Code-Block ohne anklickbare Verweise', () => {
    configureExtensions(['perspective-datatable']);
    const html = renderMarkdown(SRC, 'de');
    expect(html).not.toContain('<div class="perspective-datatable"');
    expect(html).toContain('<code class="hljs language-perspective-datatable">');
    expect(html).toContain('[[Ziel]] #projekt');
    expect(html).not.toContain('<a ');
    expect(convertMarkdownPortable(SRC, true)).toContain('```perspective-datatable');
  });
});

describe('perspective-datatable — tausend Zeilen mit Verweisen (4T-002014, AK7)', () => {
  const zellHtml = baueZellRenderer({ wikiLinks: true, tags: true, areaLinks: true });
  // Zwei Text-Spalten, jede zehnte Zeile mit Verweis und Schlagwort; das ist die
  // Ober-Grenze der gerenderten Zeilen (MAX_RENDER_ROWS).
  function tausendZeilen() {
    const zeilen = [];
    for (let i = 0; i < MAX_RENDER_ROWS; i++) {
      zeilen.push(i % 10 === 0 ? `| [[Ziel ${i}]] | #tag${i} |` : `| Name ${i} | Wert ${i} |`);
    }
    return 'columns: A:text, B:text\n' + zeilen.join('\n');
  }

  it('rendert alle Verweise und lässt die übrigen Zellen unverändert', () => {
    const body = tausendZeilen();
    const mit = renderPerspectiveDatatableViewer(body, { zellHtml });
    expect(mit.match(/class="wikilink"/g)).toHaveLength(MAX_RENDER_ROWS / 10);
    expect(mit.match(/class="tag-link"/g)).toHaveLength(MAX_RENDER_ROWS / 10);
    // Ohne die Verweis-Zeilen ist das Ergebnis dasselbe wie ohne Renderer.
    const ohneVerweise = body.replace(/^\| \[\[.*$/gm, '| x | y |');
    expect(renderPerspectiveDatatableViewer(ohneVerweise, { zellHtml })).toBe(
      renderPerspectiveDatatableViewer(ohneVerweise),
    );
  });
});

// Nach dem Vorbild der Messläufe der Datenbank (`db-konsistenz-pruefung.test.js`):
// Die Zeitmessung läuft nur auf Zuruf und nie unter dem Gate, weil eine
// Zeit-Grenze unter fremder Last auf dem Rechner zum Flake würde. Aufruf:
// `EM4ME_MESSLAUF=1 npx vitest run test/unit/perspective-datatable.test.js`.
describe.skipIf(!process.env.EM4ME_MESSLAUF)('Messlauf Zell-Verweise (4T-002014, AK7)', () => {
  it('misst tausend Zeilen mit und ohne Zell-Renderer', () => {
    const zellHtml = baueZellRenderer({ wikiLinks: true, tags: true, areaLinks: true });
    const zeilen = [];
    for (let i = 0; i < MAX_RENDER_ROWS; i++) {
      zeilen.push(i % 10 === 0 ? `| [[Ziel ${i}]] | #tag${i} |` : `| Name ${i} | Wert ${i} |`);
    }
    const body = 'columns: A:text, B:text\n' + zeilen.join('\n');
    const miss = (f) => {
      f();
      const dauern = [];
      for (let lauf = 0; lauf < 9; lauf++) {
        const start = performance.now();
        f();
        dauern.push(performance.now() - start);
      }
      return dauern.sort((a, b) => a - b)[4];
    };
    const ohne = miss(() => renderPerspectiveDatatableViewer(body));
    const mit = miss(() => renderPerspectiveDatatableViewer(body, { zellHtml }));
    // Die Zeile ist das Ergebnis des Messlaufs; er läuft nur auf Zuruf und nie
    // unter dem Gate, deshalb ist die sonst gesperrte Ausgabe hier zulässig.
    // eslint-disable-next-line no-console
    console.log(
      `Messlauf Zell-Verweise: ${MAX_RENDER_ROWS} Zeilen, zwei Text-Spalten, jede zehnte ` +
        `mit Verweis; Median ohne ${ohne.toFixed(2)} ms, mit ${mit.toFixed(2)} ms`,
    );
  });
});
