// 4T-002072 (Epic 3E-000192): Name der Datentabelle als Zeile `table:` im Block.
//
// Zwei Stellen lesen dieselbe Kopf-Angabe: der Parser der Datentabelle
// (src/shared/markdown/perspective-datatable.js) für das Modell und seine
// Struktur-Fehler, die Heimat der Kennungen (src/shared/block-anchors.js) für
// den Namen als Block-Kennung. Geprüft wird hier, dass beide denselben Namen
// sehen (Gleichlauf-Wächter), dass der Diagramm-Kern die Tabelle über den
// Kopf-Namen auflöst (src/shared/markdown/perspective-chart-resolve.js) und dass
// die Angabe im Diagramm den Namen ohne Dach-Zeichen nennt
// (Entscheidung des Product Owners vom 2026-10-03, E1 und E2 je Weg A).
//
// Die Fälle der Heimat selbst stehen in block-anchors.test.js, die des Parsers
// in perspective-datatable.test.js; diese Datei hält das Zusammenspiel.
import { describe, it, expect } from 'vitest';
import { extractBlockAnchors } from '../../src/shared/block-anchors.js';
import { parsePerspectiveDatatable } from '../../src/shared/markdown/perspective-datatable.js';
import { resolveTableInDocument } from '../../src/shared/markdown/perspective-chart-resolve.js';
import { buildChartInput, parseTableRef } from '../../src/shared/markdown/perspective-chart.js';
import { convertPortableFences } from '../../src/shared/markdown/portable-fences.js';
import { renderMarkdown } from '../../src/shared/markdown/markdown.js';

const Z = '`'.repeat(3);
const DT = `${Z}perspective-datatable`;

// Ein Dokument mit genau einer Datentabelle, deren Rumpf `rumpf` ist.
function dokument(rumpf) {
  return ['# Bericht', '', DT, rumpf, Z, ''].join('\n');
}

describe('Gleichlauf Parser und Heimat (4T-002072)', () => {
  // Die Fall-Liste gehört an den Wert: jede Weiche der Kopf-Regel einmal.
  const KORPUS = {
    'Name als erste Zeile': 'table: Umsatz\ncolumns: A:text\n| x |',
    'Schlüssel groß, ohne Leerraum': 'TABLE:Umsatz\ncolumns: A:text\n| x |',
    'Umlaute, Ziffern, Bindestrich, Unterstrich': 'table: Grün_2-a\ncolumns: A:text\n| x |',
    'nach columns und einer Leerzeile': 'columns: A:text\n\ntable: Umsatz\n| x |',
    'eingerückt im Rumpf': '  table: Umsatz\ncolumns: A:text\n| x |',
    'nach einer unlesbaren Kopf-Zeile': 'irgendwas\ntable: Umsatz\ncolumns: A:text\n| x |',
    'ohne Angabe': 'columns: A:text\n| x |',
    'leerer Wert': 'table:\ncolumns: A:text\n| x |',
    Leerzeichen: 'table: Umsatz 2026\ncolumns: A:text\n| x |',
    Punkt: 'table: Umsatz.2026\ncolumns: A:text\n| x |',
    'Dach-Zeichen': 'table: ^Umsatz\ncolumns: A:text\n| x |',
    'zweite Angabe': 'table: Umsatz\ntable: Kosten\ncolumns: A:text\n| x |',
    'ungültige erste, gültige zweite': 'table: a b\ntable: Kosten\ncolumns: A:text\n| x |',
    'nach der ersten Datenzeile': 'columns: A:text\n| x |\ntable: Umsatz',
    'ohne Datenzeilen': 'table: Umsatz\ncolumns: A:text',
  };
  for (const [fall, rumpf] of Object.entries(KORPUS)) {
    it(`parse(body).name gleich dem Heimat-Namen: ${fall}`, () => {
      const [tabelle] = extractBlockAnchors(dokument(rumpf)).datentabellen;
      expect(tabelle.name).toBe(parsePerspectiveDatatable(rumpf).name);
    });
  }

  it('der Korpus deckt Name und Nicht-Name ab (untere Schranke)', () => {
    const namen = Object.values(KORPUS).map((r) => parsePerspectiveDatatable(r).name);
    expect(namen.filter((n) => n !== null).length).toBeGreaterThanOrEqual(6);
    expect(namen.filter((n) => n === null).length).toBeGreaterThanOrEqual(6);
  });
});

describe('Auflösung des Kopf-Namens (4T-002072)', () => {
  const RUMPF = 'table: Umsatz\ncolumns: Monat:text, Wert:number\n| Januar | 1 |';

  it('found mit den Zaun-Zeilen der Tabelle', () => {
    const res = resolveTableInDocument(dokument(RUMPF), 'Umsatz');
    expect(res).toMatchObject({ status: 'found', openLine: 3, closeLine: 7 });
    expect(res.model.name).toBe('Umsatz');
    expect(res.model.rows).toHaveLength(1);
  });

  it('offener Zaun: found bis zum Textende, ohne Schluss-Zeile', () => {
    const res = resolveTableInDocument(['', DT, RUMPF].join('\n'), 'Umsatz');
    expect(res).toMatchObject({ status: 'found', openLine: 2, closeLine: null });
    expect(res.model.rows).toHaveLength(1);
  });

  it('mit Namens-Fehler invalid', () => {
    // Der Name ist gültig und damit Kennung; die zweite Angabe macht die
    // Tabelle fehlerhaft, das Diagramm meldet «Tabelle fehlerhaft».
    const rumpf = RUMPF.replace('table: Umsatz', 'table: Umsatz\ntable: B');
    const res = resolveTableInDocument(dokument(rumpf), 'Umsatz');
    expect(res.status).toBe('invalid');
    expect(res.errors.map((e) => e.code)).toEqual(['duplicateDirective']);
  });

  it('alte Form ^name unter dem Zaun: found (E2)', () => {
    const alt = ['', DT, 'columns: A:text', '| x |', Z, '^umsatz'].join('\n');
    expect(resolveTableInDocument(alt, 'umsatz')).toMatchObject({ status: 'found', openLine: 2 });
  });

  it('Groß- und Kleinschreibung zählen: table: umsatz gegen Umsatz ist missing', () => {
    expect(resolveTableInDocument(dokument(RUMPF), 'umsatz')).toEqual({ status: 'missing' });
  });

  it('ein Diagramm mit table: Umsatz zeichnet die Tabelle mit dem Kopf-Namen', () => {
    const body = 'table: Umsatz\ntype: bar\nlabels: Monat\nvalues: Wert';
    const text = `${dokument(RUMPF)}\n${Z}perspective-chart\n${body}\n${Z}\n`;
    expect(buildChartInput(text, body).drawable).toBe(true);
  });

  // Nachbesserung F8: Den Text eines anderen Dokuments liest der Hauptprozess
  // roh; ein BOM vor dem Zaun in Zeile 1 verdeckte ihn.
  it('ein BOM am Textanfang stört die Auflösung nicht', () => {
    const text = `\uFEFF${DT}\n${RUMPF}\n${Z}\n`;
    expect(resolveTableInDocument(text, 'Umsatz')).toMatchObject({ status: 'found', openLine: 1 });
  });
});

describe('Portabler Export des Kopf-Namens (4T-002072)', () => {
  // Gemessen am 2026-10-03: Die Fence-Ersetzung des Exports nimmt die Leerzeile
  // nach dem Zaun mit in ihren Treffer. Ohne Zeilenende hinter `^Name` stünde
  // die Zeile direkt vor dem folgenden Absatz, und die Kennung bezeichnete ihn.
  it('die Zeile ^Name bleibt ein eigener Block vor einem folgenden Absatz', () => {
    for (const abstand of ['\n\n', '\n']) {
      const quelle = `${DT}\ntable: U\ncolumns: A:text\n| x |\n${Z}${abstand}Danach`;
      const { text } = convertPortableFences(quelle, { datatableEnabled: true });
      expect(text, JSON.stringify(abstand)).toMatch(/<\/table>\n\n\^U\n\nDanach$/);
      const html = renderMarkdown(text, 'de');
      expect(html, JSON.stringify(abstand)).toMatch(/<p [^>]*id="U"><\/p>/);
    }
  });

  // Nachbesserung F5: Trägt die Tabelle beide Formen mit demselben Namen, steht
  // `^U` danach genau einmal, als eigener Block unter der Tabelle.
  it('beide Formen mit demselben Namen: ^U genau einmal', () => {
    for (const darunter of ['\n^U\n\nDanach', '\n\n^U\n\nDanach', '\n^U']) {
      const quelle = `${DT}\ntable: U\ncolumns: A:text\n| x |\n${Z}${darunter}`;
      const { text } = convertPortableFences(quelle, { datatableEnabled: true });
      expect(text.match(/\^U/g), JSON.stringify(darunter)).toHaveLength(1);
      expect(text, JSON.stringify(darunter)).toMatch(/<\/table>\n\n\^U(\n|$)/);
    }
  });
});

describe('parseTableRef ohne Dach-Zeichen (4T-002072, E1)', () => {
  it('Umsatz ist die Form «selbes Dokument», Umsatz 2026 keine', () => {
    expect(parseTableRef('Umsatz')).toEqual({ kind: 'same', name: 'Umsatz' });
    expect(parseTableRef('  Grün-2  ')).toEqual({ kind: 'same', name: 'Grün-2' });
    expect(parseTableRef('Umsatz 2026')).toBeNull();
    expect(parseTableRef('[[Bericht]]')).toBeNull();
    expect(parseTableRef('')).toBeNull();
  });

  it('die alte Schreibweise mit Dach-Zeichen gilt weiter', () => {
    expect(parseTableRef('^Umsatz')).toEqual({ kind: 'same', name: 'Umsatz' });
    expect(parseTableRef('[[Bericht#^Umsatz]]')).toEqual({
      kind: 'other',
      file: 'Bericht',
      name: 'Umsatz',
    });
  });
});
