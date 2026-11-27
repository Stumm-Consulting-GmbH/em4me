// 4T-002797 (Epic 3E-000449): Private Kommentare in einer Datentabelle und auf
// einer Karte der Canvas-Fläche (Story 4S-001259).
//
// Bis hierher behielt eine Datentabelle einen privaten Kommentar in ihren
// Zellen: Der Kern entfernt Kommentare vor dem Zerlegen aus dem ganzen Text,
// lässt den Rumpf eines Code-Zauns aber stehen, und die Datentabelle ist ein
// solcher Zaun. Geprüft wird je Akzeptanzkriterium der Story an den Stellen, an
// denen die Tabelle gezeigt oder ausgegeben wird: Anzeige, portabler Export,
// Filter und Sortierung, Diagramm, Karten-Vorschau und Listen-Ansicht der
// Canvas-Fläche. Das Bearbeiten bleibt roh (Abgrenzung der Story). Den
// HTML-Export prüft html-export-quelltext-angaben.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import { parsePerspectiveDatatable } from '../../../src/shared/markdown/perspective-datatable.js';
import { computeComputedCells } from '../../../src/shared/markdown/perspective-datatable-computed.js';
import {
  filterDatatableRows,
  sortDatatableRows,
} from '../../../src/shared/markdown/perspective-datatable-view.js';
import { buildChartInput } from '../../../src/shared/markdown/perspective-chart.js';
import {
  canvasKartenVorschau,
  canvasListe,
  parseCanvasFence,
} from '../../../src/shared/canvas/canvas-core.js';

const GEHEIM = 'GEHEIMVERMERK';
const Z = '```';

afterEach(() => {
  configureExtensions([]);
});

function tabelle(...zeilen) {
  return [`${Z}perspective-datatable`, ...zeilen, Z].join('\n');
}

// Die Anzeige trägt den Rumpf des Blocks für den Gitter-Editor im Attribut
// `data-dt-source`; gezeigt wird er nicht, und der HTML-Export nimmt ihn heraus.
// Geprüft wird hier, was die Anzeige zeigt.
function angezeigt(text) {
  return renderMarkdown(text, 'de').replace(/ data-dt-source="[^"]*"/g, '');
}

const OHNE = { ohneKommentare: true };

describe('Datentabelle: Anzeige ohne privaten Kommentar (AK1, AK2)', () => {
  it('eine Zelle zeigt ihren Text ohne den Kommentar', () => {
    const html = angezeigt(tabelle('columns: Name:text', `| Anna %%${GEHEIM}%% Berg |`));
    expect(html).not.toContain(GEHEIM);
    expect(html).not.toContain('%%');
    expect(html).toContain('Anna');
    expect(html).toContain('Berg');
  });

  it('ein offener Marker endet an der Grenze seiner Zelle, die Nachbarn bleiben', () => {
    const html = angezeigt(
      tabelle('columns: A:text, B:text, C:text', `| links | mitte %%${GEHEIM} | rechts |`),
    );
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('links');
    expect(html).toContain('mitte');
    expect(html).toContain('rechts');
  });

  it('eine Spalten-Überschrift zeigt keinen Kommentar', () => {
    const html = angezeigt(tabelle(`columns: Name:text, Wert:number %%${GEHEIM}%%`, '| a | 1 |'));
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('Wert');
  });

  it('der Text einer Fehler-Zelle zeigt keinen Kommentar', () => {
    const html = angezeigt(tabelle('columns: Wert:number', `| abc %%${GEHEIM}%% |`));
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('abc');
  });

  it('der angezeigte Text eines Struktur-Fehlers zeigt keinen Kommentar', () => {
    const html = angezeigt(tabelle('columns: Wert:number', `unbekannt %%${GEHEIM}%%`, '| 1 |'));
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('unbekannt');
  });

  it('Druck und PDF rendern die Tabelle über dieselbe Anzeige mit allen Zeilen', () => {
    // Die Druck-Vorbereitung rendert gekürzte Tabellen mit `datatableAlleZeilen`
    // neu (perspective-datatable-view.js); derselbe Weg, dieselbe Option.
    const zeilen = Array.from({ length: 40 }, (_, i) => `| z${i} %%${GEHEIM}%% |`);
    const html = renderMarkdown(tabelle('columns: Name:text', ...zeilen), 'de', {
      datatableAlleZeilen: true,
    }).replace(/ data-dt-source="[^"]*"/g, '');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('z39');
  });
});

describe('Datentabelle: Zahl, Filter und Sortierung (AK3, AK4)', () => {
  const RUMPF = [
    'columns: Name:text, Betrag:number',
    'aggregate: Betrag:sum',
    `| Anna %%${GEHEIM}%% | 9 %%geschätzt%% |`,
    '| Bernd | 7 |',
  ].join('\n');

  it('eine Zahl mit Kommentar dahinter bleibt eine Zahl', () => {
    const model = parsePerspectiveDatatable(RUMPF, OHNE);
    expect(model.errors).toEqual([]);
    expect(model.rows[0][1].value).toBe(9);
    expect(model.rows[0][1].error).toBeFalsy();
  });

  it('die Summe rechnet mit der Zahl, die Anzeige zeigt sie', () => {
    const html = angezeigt(tabelle(...RUMPF.split('\n')));
    expect(html).toContain('16');
    expect(html).not.toContain('geschätzt');
  });

  it('ein Text-Filter trifft kein Wort, das nur im Kommentar steht', () => {
    const model = parsePerspectiveDatatable(RUMPF, OHNE);
    const computed = computeComputedCells(model);
    expect(filterDatatableRows(model, [{ text: GEHEIM }], computed)).toEqual([]);
    expect(filterDatatableRows(model, [{ text: 'anna' }], computed)).toEqual([0]);
  });

  it('die Sortierung nach der Zahl rechnet mit dem Wert vor dem Kommentar', () => {
    const model = parsePerspectiveDatatable(RUMPF, OHNE);
    const computed = computeComputedCells(model);
    // Ohne Wert stünde Anna als leere Zahl am Ende; mit dem Wert 9 steht sie vorn.
    expect(sortDatatableRows(model, 1, -1, computed)).toEqual([0, 1]);
  });

  it('ohne die Option bleibt das Modell roh, wie es das Bearbeiten braucht', () => {
    const model = parsePerspectiveDatatable(RUMPF);
    expect(model.rows[0][0].text).toContain(GEHEIM);
  });
});

describe('Datentabelle: portabler Export (AK1)', () => {
  it('die konvertierte Tabelle trägt keinen Kommentar', () => {
    const aus = convertMarkdownPortable(
      tabelle('columns: Name:text, Wert:number', `| Anna %%${GEHEIM}%% | 3 %%x%% |`),
    );
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('Anna');
    expect(aus).toContain('<table');
  });

  it('eine Tabelle mit Struktur-Fehler bleibt Quelltext, aber ohne Kommentar', () => {
    const text = tabelle(
      'columns: Name:text, Wert:number',
      `unbekannt %%${GEHEIM}%%`,
      `| Anna %%${GEHEIM}%% | 3 |`,
      '| Bernd | 4 |',
    );
    const aus = convertMarkdownPortable(text);
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain(`${Z}perspective-datatable`);
    expect(aus).toContain('| Anna | 3 |');
    // Eine Zeile ohne Kommentar bleibt Zeichen für Zeichen.
    expect(aus).toContain('| Bernd | 4 |');
    expect(aus.trimEnd().endsWith(Z)).toBe(true);
  });

  it('eine eingerückte Zeile ohne Pipe verliert ihren Kommentar, der Einzug bleibt', () => {
    // Ab vier Leerzeichen Einzug läse die Code-Erkennung die ganze Zeile als
    // Code und ließe den Kommentar stehen; befreit wird deshalb nur der Inhalt.
    const text = tabelle('columns: Name:text', `    unbekannt %%${GEHEIM}%%`, '| Anna |');
    const aus = convertMarkdownPortable(text);
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('    unbekannt');
  });

  it('eine maskierte Pipe in einer befreiten Zelle bleibt maskiert', () => {
    const aus = convertMarkdownPortable(
      tabelle('columns: A:text', 'kaputt', `| a \\| b %%${GEHEIM}%% |`),
    );
    expect(aus).not.toContain(GEHEIM);
    expect(aus).toContain('| a \\| b |');
  });

  it('eine fehlerhafte Tabelle ohne Kommentar bleibt Zeichen für Zeichen stehen', () => {
    const text = tabelle('columns: A:text', 'kaputt', '|  a  |');
    // Der Marker des portablen Formats kommt wie bisher davor; der Block selbst
    // bleibt unverändert.
    expect(convertMarkdownPortable(text)).toContain(text);
  });
});

describe('Datentabelle: Code in einer Zelle und ausgeschaltete Erweiterung (AK8, AK9)', () => {
  it('zwei Prozentzeichen in Code innerhalb einer Zelle bleiben wörtlich', () => {
    const html = angezeigt(tabelle('columns: A:text', '| `a %%b%% c` |'));
    expect(html).toContain('%%b%%');
  });

  it('ist die Erweiterung aus, bleiben die Marker in der Zelle gewöhnlicher Text', () => {
    configureExtensions(['comments']);
    const html = angezeigt(tabelle('columns: A:text', `| a %%${GEHEIM}%% |`));
    expect(html).toContain(`%%${GEHEIM}%%`);
    const aus = convertMarkdownPortable(
      tabelle('columns: A:text', 'kaputt', `| a %%${GEHEIM}%% |`),
    );
    expect(aus).toContain(GEHEIM);
  });
});

describe('Diagramm aus einer Datentabelle (AK5)', () => {
  const DOKUMENT = [
    tabelle(
      'columns: Monat:text, Umsatz:number',
      `| Januar %%${GEHEIM}%% | 100 |`,
      '| Februar | 90 %%vorläufig%% |',
    ),
    '^umsatz',
    '',
    `${Z}perspective-chart`,
    'table: ^umsatz',
    'type: bar',
    'labels: Monat',
    'values: Umsatz',
    Z,
  ].join('\n');
  const BODY = 'table: ^umsatz\ntype: bar\nlabels: Monat\nvalues: Umsatz';

  it('Beschriftungen tragen keinen Kommentar, Werte bleiben Zahlen', () => {
    const input = buildChartInput(DOKUMENT, BODY, OHNE);
    expect(input.drawable).toBe(true);
    expect(input.categories).toEqual(['Januar', 'Februar']);
    expect(input.series[0].values).toEqual([100, 90]);
  });

  it('die Anzeige des Dokuments zeigt den Kommentar nirgends', () => {
    // Der Diagramm-Block trägt seinen eigenen Rumpf, nicht den der Tabelle.
    expect(angezeigt(DOKUMENT)).not.toContain(GEHEIM);
  });
});

describe('Canvas-Fläche: Karten-Vorschau und Listen-Ansicht (AK6, AK8)', () => {
  const RUMPF = [
    '!karte k1 x=0 y=0 b=200 h=100',
    `## Titel %%${GEHEIM}%%`,
    `%%${GEHEIM}%%`,
    'Zweite Zeile',
  ].join('\n');
  const FLAECHE = `${Z}perspective-canvas\n${RUMPF}\n${Z}`;

  it('die Vorschau im Block der Lese-Ansicht zeigt keinen Kommentar', () => {
    const html = renderMarkdown(FLAECHE, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('Titel');
    expect(html).toContain('Zweite Zeile');
  });

  it('eine Zeile, die nur einen Kommentar trägt, zählt nicht als zweite Zeile', () => {
    const karte = parseCanvasFence(RUMPF).elemente.find((el) => el.art === 'karte');
    expect(canvasKartenVorschau(karte, OHNE)).toEqual({ titel: 'Titel', zeile: 'Zweite Zeile' });
  });

  it('die Listen-Ansicht der Fläche zeigt keinen Kommentar', () => {
    const liste = canvasListe(parseCanvasFence(RUMPF), OHNE);
    expect(liste[0].text).toBe('Titel');
  });

  it('ist die Erweiterung aus, bleiben die Marker auf der Karte gewöhnlicher Text', () => {
    configureExtensions(['comments']);
    expect(renderMarkdown(FLAECHE, 'de')).toContain(GEHEIM);
    const karte = parseCanvasFence(RUMPF).elemente.find((el) => el.art === 'karte');
    expect(canvasKartenVorschau(karte).titel).toContain(GEHEIM);
  });
});

// 4T-002797, Zweitblick Runde 1: Ob eine Zeile eine Datenzeile ist, entscheidet
// der Rohtext. Eine Zeile, die erst nach dem Entfernen eines Kommentars mit
// einer Pipe beginnt, bleibt ein Struktur-Fehler; sonst verschöben sich die
// Zeilen-Nummern zwischen Anzeige und Gitter-Editor, der roh zurückschreibt.
describe('Datentabelle: der Rohtext entscheidet über die Datenzeile', () => {
  const RUMPF = ['columns: Name:text', '| Anna |', `%%${GEHEIM}%% | Bernd |`, '| Cleo |'].join(
    '\n',
  );

  it('befreit und roh ergeben dieselben Datenzeilen', () => {
    const roh = parsePerspectiveDatatable(RUMPF);
    const frei = parsePerspectiveDatatable(RUMPF, OHNE);
    expect(frei.rows.map((r) => r[0].text)).toEqual(['Anna', 'Cleo']);
    expect(roh.rows.length).toBe(frei.rows.length);
    expect(frei.errors.map((e) => e.code)).toEqual(['invalidLine']);
    expect(JSON.stringify(frei.errors)).not.toContain(GEHEIM);
  });

  it('auch vor der ersten Datenzeile', () => {
    const frei = parsePerspectiveDatatable(
      `columns: Name:text
%%x%% | Anna |`,
      OHNE,
    );
    expect(frei.rows).toHaveLength(0);
    expect(frei.errors.map((e) => e.code)).toEqual(['invalidLine']);
  });
});
