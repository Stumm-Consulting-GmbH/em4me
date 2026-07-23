// 4T-0417 (Epic 3E-0079): Unit-Tests für Parser und Serialisierer der
// Perspective Datatable (Fence `perspective-datatable`). Prozess-neutral:
// die reine String -> Datenmodell -> String-Kette wird hier erschöpfend
// geprüft; Rendering/Aggregate folgen in 4T-0418.
// 4T-0418 (Epic 3E-0079): Aggregat-Rechnung, Anzeige-Formatierung und die
// HTML-Bausteine (Viewer-Grid, Portable-Tabelle) ergänzt.
// 4T-0420 (Epic 3E-0079): typ-gerechte Vergleicher, Ansichts-Sortierung
// und Zeilen-Filter (gefilterte Aggregate) ergänzt.
import { describe, it, expect } from 'vitest';
import {
  parsePerspectiveDatatable,
  serializePerspectiveDatatable,
  computeAggregates,
  computeComputedCells,
  makeCellValueResolver,
  formatCellDisplay,
  compareCellValues,
  sortDatatableRows,
  filterDatatableRows,
  renderPerspectiveDatatableViewer,
  convertPerspectiveDatatableBlockToHtml,
  findPerspectiveDatatableFences,
  MAX_RENDER_ROWS,
} from '../../src/shared/markdown/perspective-datatable.js';

// Kompakter Helfer: parst und erwartet fehlerfreie Struktur.
function parseOk(body) {
  const model = parsePerspectiveDatatable(body);
  expect(model.errors, JSON.stringify(model.errors)).toEqual([]);
  return model;
}

describe('perspective-datatable — Spalten-Definitionen', () => {
  it('parst alle fünf Typen mit Namen', () => {
    const model = parseOk(
      'columns: Name:text, Datum:date, Start:time, Betrag:number, Erledigt:boolean',
    );
    expect(model.columns.map((c) => c.type)).toEqual(['text', 'date', 'time', 'number', 'boolean']);
    expect(model.columns.map((c) => c.name)).toEqual([
      'Name',
      'Datum',
      'Start',
      'Betrag',
      'Erledigt',
    ]);
    expect(model.columns.every((c) => c.decimals === null && c.expr === null)).toBe(true);
  });

  it('parst Dezimalstellen-Format bei number', () => {
    const model = parseOk('columns: Betrag:number(2)');
    expect(model.columns[0].decimals).toBe(2);
  });

  it('Typ ist case-insensitiv, Spaltennamen dürfen Leerzeichen tragen', () => {
    const model = parseOk('columns: Voller Name:TEXT, Betrag netto:Number(0)');
    expect(model.columns[0]).toEqual({
      name: 'Voller Name',
      type: 'text',
      decimals: null,
      expr: null,
    });
    expect(model.columns[1].name).toBe('Betrag netto');
    expect(model.columns[1].decimals).toBe(0);
  });

  it('erfasst berechnete Spalten als Rohtext-Ausdruck ohne Datenzelle', () => {
    const model = parseOk('columns: Betrag:number, Gesamt:number(2) = Betrag * 2\n| 12.5 |');
    expect(model.columns[1].expr).toBe('Betrag * 2');
    expect(model.columns[1].decimals).toBe(2);
    expect(model.rows[0]).toHaveLength(1);
  });

  it('Kommata in Ausdrucks-Klammern trennen keine Spalten', () => {
    const model = parseOk('columns: A:number, M:number = default(A, 10), B:text');
    expect(model.columns.map((c) => c.name)).toEqual(['A', 'M', 'B']);
    expect(model.columns[1].expr).toBe('default(A, 10)');
  });

  it('Ausdruck darf Vergleichs-= enthalten (erstes = trennt)', () => {
    const model = parseOk('columns: A:number, Voll:boolean = A = 10');
    expect(model.columns[1].expr).toBe('A = 10');
  });

  it('meldet Struktur-Fehler mit definierten Codes', () => {
    const cases = [
      ['columns: Kaputt', 'badColumnDef'],
      ['columns: A:zahl', 'unknownType'],
      ['columns: A:text(2)', 'badFormat'],
      ['columns: A:number(11)', 'badFormat'],
      ['columns: A:number =', 'badColumnDef'],
      ['columns: A:text, a:number', 'duplicateColumn'],
      ['columns: A:text\ncolumns: B:text', 'duplicateDirective'],
      ['columns: A:text\nfoo: bar', 'invalidLine'],
      ['| a |', 'noColumns'],
      ['', 'noColumns'],
      ['columns:', 'noColumns'],
    ];
    for (const [body, code] of cases) {
      const model = parsePerspectiveDatatable(body);
      expect(
        model.errors.map((e) => e.code),
        `"${body}" -> ${JSON.stringify(model.errors)}`,
      ).toContain(code);
    }
  });

  it('Fehler tragen 1-basierte Zeilennummern im Fence-Body', () => {
    const model = parsePerspectiveDatatable('columns: A:text\n\nfoo: bar');
    expect(model.errors).toEqual([{ code: 'invalidLine', line: 3, detail: 'foo: bar' }]);
  });
});

describe('perspective-datatable — Aggregate', () => {
  it('parst Aggregate je Spalte, mehrere per +', () => {
    const model = parseOk(
      'columns: Betrag:number, Erledigt:boolean\naggregate: Betrag:sum+avg, Erledigt:count',
    );
    expect(model.aggregates).toEqual([['sum', 'avg'], ['count']]);
  });

  it('Spalten-Zuordnung case-insensitiv, Duplikate werden zusammengeführt', () => {
    const model = parseOk(
      'columns: Betrag:number\naggregate: betrag:sum\naggregate: BETRAG:sum+max',
    );
    expect(model.aggregates).toEqual([['sum', 'max']]);
  });

  it('Aggregate auf berechnete Spalten sind erlaubt (deklarierter Typ)', () => {
    const model = parseOk('columns: A:number, G:number = A * 2\naggregate: G:sum');
    expect(model.aggregates).toEqual([[], ['sum']]);
  });

  it('meldet unbekannte Spalten, unbekannte Funktionen und Typ-Verstöße', () => {
    const cases = [
      ['columns: A:number\naggregate: B:sum', 'unknownAggregateColumn'],
      ['columns: A:number\naggregate: A:median', 'unknownAggregate'],
      ['columns: A:text\naggregate: A:sum', 'aggregateTypeMismatch'],
      ['columns: A:boolean\naggregate: A:min', 'aggregateTypeMismatch'],
      ['columns: A:number\naggregate: kaputt', 'badAggregate'],
      ['columns: A:number\naggregate: A:', 'badAggregate'],
    ];
    for (const [body, code] of cases) {
      const model = parsePerspectiveDatatable(body);
      expect(
        model.errors.map((e) => e.code),
        body,
      ).toContain(code);
    }
  });

  it('sum/avg nur auf number; min/max auch auf date und time; count überall', () => {
    parseOk(
      'columns: D:date, T:time, N:number, X:text\naggregate: D:min+max+count, T:min+max, N:sum+avg+min+max+count, X:count',
    );
  });
});

describe('perspective-datatable — Datenzeilen und Zell-Typen', () => {
  it('parst typ-gerechte Werte je Spalte', () => {
    const model = parseOk(
      'columns: Name:text, Datum:date, Start:time, Betrag:number(2), Erledigt:boolean\n' +
        '| Anna | 2026-07-08 | 09:30 | 12.50 | x |\n' +
        '| Bert | 2026-01-31 | 23:59 | -3 |  |',
    );
    expect(model.rows[0].map((c) => c.value)).toEqual(['Anna', '2026-07-08', '09:30', 12.5, true]);
    expect(model.rows[1].map((c) => c.value)).toEqual(['Bert', '2026-01-31', '23:59', -3, false]);
    expect(model.rows.flat().every((c) => c.error === null)).toBe(true);
  });

  it('leere Zellen sind gültig: text leer, boolean false, sonst null', () => {
    const model = parseOk('columns: T:text, D:date, U:time, N:number, B:boolean\n|  |  |  |  |  |');
    expect(model.rows[0].map((c) => c.value)).toEqual(['', null, null, null, false]);
  });

  it('markiert ungültige Werte als Fehler-Zellen und erhält den Rohtext', () => {
    const model = parsePerspectiveDatatable(
      'columns: D:date, U:time, N:number, B:boolean\n| 2026-02-30 | 24:00 | 1,5 | ja |',
    );
    expect(model.errors).toEqual([]);
    expect(model.rows[0].map((c) => c.error)).toEqual([
      'invalidDate',
      'invalidTime',
      'invalidNumber',
      'invalidBoolean',
    ]);
    expect(model.rows[0].map((c) => c.text)).toEqual(['2026-02-30', '24:00', '1,5', 'ja']);
    expect(model.rows[0].every((c) => c.value === null)).toBe(true);
  });

  it('boolean liest X tolerant als wahr', () => {
    const model = parseOk('columns: B:boolean\n| X |');
    expect(model.rows[0][0].value).toBe(true);
  });

  it('un-escapt Pipes im Zelltext', () => {
    const model = parseOk('columns: T:text\n| a \\| b |');
    expect(model.rows[0][0].value).toBe('a | b');
  });

  it('toleriert fehlende schließende Pipe', () => {
    const model = parseOk('columns: A:text, B:text\n| a | b');
    expect(model.rows[0].map((c) => c.value)).toEqual(['a', 'b']);
  });

  it('meldet Spalten-Anzahl-Abweichungen und füllt kurze Zeilen auf', () => {
    const model = parsePerspectiveDatatable(
      'columns: A:text, B:number\n| nur-a |\n| a | 1 | extra |',
    );
    expect(model.errors.map((e) => e.code)).toEqual(['rowCellCount', 'rowCellCount']);
    expect(model.errors.map((e) => e.line)).toEqual([2, 3]);
    // kurze Zeile aufgefüllt, lange behält die Überhang-Zelle (kein Datenverlust)
    expect(model.rows[0]).toHaveLength(2);
    expect(model.rows[0][1].value).toBe(null);
    expect(model.rows[1]).toHaveLength(3);
    expect(model.rows[1][2].text).toBe('extra');
  });

  it('Nicht-Pipe-Zeilen zwischen Datenzeilen sind Struktur-Fehler', () => {
    const model = parsePerspectiveDatatable('columns: A:text\n| a |\nkein pipe\n| b |');
    expect(model.errors.map((e) => e.code)).toEqual(['invalidLine']);
    expect(model.rows).toHaveLength(2);
  });
});

describe('perspective-datatable — Serialisierer und Roundtrip', () => {
  it('erzeugt den kanonischen Fence-Body mit stabiler Ausrichtung', () => {
    const model = parseOk(
      'columns: Name:text,Betrag:number(2)\naggregate: Betrag:sum\n| Anna-Lena | 12.5 |\n| Bo | 3 |',
    );
    expect(serializePerspectiveDatatable(model)).toBe(
      'columns: Name:text, Betrag:number(2)\n' +
        'aggregate: Betrag:sum\n' +
        '| Anna-Lena | 12.5 |\n' +
        '| Bo        | 3    |',
    );
  });

  it('normalisiert boolean auf x/leer und escapt Pipes', () => {
    const model = parseOk('columns: B:boolean, T:text\n| X | a \\| b |');
    expect(serializePerspectiveDatatable(model)).toBe(
      'columns: B:boolean, T:text\n| x | a \\| b |',
    );
  });

  it('schreibt berechnete Spalten in die Definition, aber keine Datenzelle', () => {
    const model = parseOk('columns: A:number, G:number = A * 2\n| 1 |');
    expect(serializePerspectiveDatatable(model)).toBe('columns: A:number, G:number = A * 2\n| 1 |');
  });

  it('Fehler-Zellen behalten ihren Rohtext', () => {
    const model = parsePerspectiveDatatable('columns: N:number\n| 1,5 |');
    expect(serializePerspectiveDatatable(model)).toBe('columns: N:number\n| 1,5 |');
  });

  it('Roundtrip parse -> serialize -> parse ist modell-identisch', () => {
    const bodies = [
      'columns: Name:text, Datum:date, Start:time, Betrag:number(2), Erledigt:boolean, G:number = Betrag * 2\n' +
        'aggregate: Betrag:sum+avg, Datum:min+max, Erledigt:count\n' +
        '| Anna | 2026-07-08 | 09:30 | 12.50 | x |\n' +
        '|  |  |  |  |  |\n' +
        '| P\\|pe | 2026-12-31 | 00:00 | -0.5 | X |',
      'columns: N:number\n| kaputt |',
      'columns: A:text',
    ];
    for (const body of bodies) {
      const first = parsePerspectiveDatatable(body);
      const serialized = serializePerspectiveDatatable(first);
      const second = parsePerspectiveDatatable(serialized);
      expect(second.columns, body).toEqual(first.columns);
      expect(second.aggregates, body).toEqual(first.aggregates);
      expect(second.errors, body).toEqual(first.errors);
      // Werte und Zell-Fehler bleiben erhalten; der Zell-Rohtext darf in die
      // kanonische Form wechseln (12.50 -> 12.5, X -> x).
      expect(
        second.rows.map((r) => r.map((c) => [c.value, c.error])),
        body,
      ).toEqual(first.rows.map((r) => r.map((c) => [c.value, c.error])));
      // Kanonische Form ist Fixpunkt: erneutes Serialisieren ändert nichts.
      expect(serializePerspectiveDatatable(second), body).toBe(serialized);
    }
  });
});

describe('perspective-datatable — Aggregat-Rechnung (4T-0418)', () => {
  it('sum/avg/min/max über gültige Zahlen; leere und Fehler-Zellen fließen nicht ein', () => {
    const model = parseOk(
      'columns: N:number(2)\naggregate: N:sum+avg+min+max+count\n| 10 |\n| 2.5 |\n|  |\n| 3 |',
    );
    // Fehler-Zelle nachträglich einschleusen (ungültige Zahl).
    const withError = parsePerspectiveDatatable(
      'columns: N:number(2)\naggregate: N:sum+avg+min+max+count\n| 10 |\n| 2.5 |\n|  |\n| 3 |\n| kaputt |',
    );
    for (const m of [model, withError]) {
      const [aggs] = computeAggregates(m);
      const byFunc = Object.fromEntries(aggs.map((a) => [a.func, a.value]));
      expect(byFunc.sum).toBe(15.5);
      expect(byFunc.min).toBe(2.5);
      expect(byFunc.max).toBe(10);
      // avg rundet auf das Spalten-Format (2 Dezimalstellen): 15.5/3 = 5.17
      expect(byFunc.avg).toBe(5.17);
      expect(byFunc.count).toBe(3);
    }
  });

  it('min/max auf date und time chronologisch, count zählt nicht-leere Zellen', () => {
    const model = parseOk(
      'columns: D:date, T:time, X:text, B:boolean\n' +
        'aggregate: D:min+max, T:min+max, X:count, B:count\n' +
        '| 2026-07-08 | 09:30 | a | x |\n' +
        '| 2025-12-31 | 23:10 |  |  |\n' +
        '|  | 08:00 | b | x |',
    );
    const [d, t, x, b] = computeAggregates(model);
    expect(d).toEqual([
      { func: 'min', value: '2025-12-31' },
      { func: 'max', value: '2026-07-08' },
    ]);
    expect(t).toEqual([
      { func: 'min', value: '08:00' },
      { func: 'max', value: '23:10' },
    ]);
    // text: nicht-leere Strings; boolean: nur wahre Zellen sind nicht-leer.
    expect(x).toEqual([{ func: 'count', value: 2 }]);
    expect(b).toEqual([{ func: 'count', value: 2 }]);
  });

  it('ohne gültige Zellen ist der Aggregat-Wert null; Float-Rauschen ist normalisiert', () => {
    const empty = parseOk('columns: N:number\naggregate: N:sum+min');
    expect(computeAggregates(empty)[0]).toEqual([
      { func: 'sum', value: null },
      { func: 'min', value: null },
    ]);
    const noise = parseOk('columns: N:number\naggregate: N:sum\n| 0.1 |\n| 0.2 |');
    expect(computeAggregates(noise)[0]).toEqual([{ func: 'sum', value: 0.3 }]);
  });

  it('rechnet über eine übergebene Zeilen-Teilmenge (Basis für 4T-0420)', () => {
    const model = parseOk('columns: N:number\naggregate: N:sum\n| 1 |\n| 2 |\n| 4 |');
    const [aggs] = computeAggregates(model, model.rows.slice(0, 2));
    expect(aggs).toEqual([{ func: 'sum', value: 3 }]);
  });
});

describe('perspective-datatable — Anzeige-Formatierung (4T-0418)', () => {
  it('number folgt dem Spalten-Format, ohne Format kanonisch; andere Typen unverändert', () => {
    expect(formatCellDisplay({ type: 'number', decimals: 2 }, 12.5)).toBe('12.50');
    expect(formatCellDisplay({ type: 'number', decimals: 0 }, 12.5)).toBe('13');
    expect(formatCellDisplay({ type: 'number', decimals: null }, 12.5)).toBe('12.5');
    expect(formatCellDisplay({ type: 'date', decimals: null }, '2026-07-08')).toBe('2026-07-08');
    expect(formatCellDisplay({ type: 'text', decimals: null }, null)).toBe('');
  });
});

describe('perspective-datatable — Viewer-HTML (4T-0418)', () => {
  const BODY =
    'columns: Name:text, Betrag:number(2), Erledigt:boolean, G:number = Betrag * 2\n' +
    'aggregate: Betrag:sum\n' +
    '| Anna | 12.5 | x |\n' +
    '| B<b>se | kaputt |  |';

  it('rendert Kopf mit Typ-Symbol, typ-geparste Zellen und Aggregat-Zeile', () => {
    const html = renderPerspectiveDatatableViewer(BODY);
    expect(html).toContain('<table class="pdt-grid">');
    expect(html).toContain('<span class="pdt-name">Name</span><span class="pdt-type">text</span>');
    // Zahl gemäß Format, Boolean als read-only Checkbox.
    expect(html).toContain('12.50');
    expect(html).toContain('<input type="checkbox" disabled checked>');
    // Fehler-Zelle mit Rohtext und lokalisierbarem Tooltip.
    expect(html).toContain('data-i18n-title="datatable.cellError.invalidNumber"');
    expect(html).toContain('kaputt');
    // Aggregat-Zeile mit lokalisierbarer Beschriftung.
    expect(html).toContain('data-i18n="datatable.aggregate.sum"');
    expect(html).toContain('<span class="pdt-agg-value">12.50</span>');
    // Berechnete Spalte: Kopf markiert (Tooltip = Ausdruck), Zellen leer.
    expect(html).toContain('title="= Betrag * 2"');
    expect(html).toContain('pdt-computed');
    // HTML im Zelltext bleibt escaped.
    expect(html).toContain('B&lt;b&gt;se');
    expect(html).not.toContain('<b>se');
  });

  it('Struktur-Fehler rendern als Platzhalter-Liste vor dem Grid', () => {
    const html = renderPerspectiveDatatableViewer('columns: A:zahl, B:number\n| 1 |');
    expect(html).toContain('pdt-errors');
    expect(html).toContain('data-dt-code="unknownType"');
    expect(html).toContain('data-i18n="datatable.errors.title"');
    // Grid der verbleibenden Spalte rendert trotzdem.
    expect(html).toContain('<table class="pdt-grid">');
  });

  it('Ober-Grenze: über MAX_RENDER_ROWS rendern nur Kopf, Aggregate und Hinweis', () => {
    const rows = Array.from({ length: MAX_RENDER_ROWS + 1 }, () => '| 1 |').join('\n');
    const html = renderPerspectiveDatatableViewer(`columns: N:number\naggregate: N:sum\n${rows}`);
    expect(html).not.toContain('<tbody>');
    expect(html).toContain('<tfoot>');
    // Aggregat rechnet über ALLE Zeilen.
    expect(html).toContain(`<span class="pdt-agg-value">${MAX_RENDER_ROWS + 1}</span>`);
    expect(html).toContain(`data-dt-total="${MAX_RENDER_ROWS + 1}"`);
  });
});

describe('perspective-datatable — Portable-HTML (4T-0418)', () => {
  it('erzeugt eine statische Tabelle mit Aggregat-Fußzeile und Ausrichtung', () => {
    const html = convertPerspectiveDatatableBlockToHtml(
      'columns: Name:text, Betrag:number(2), Erledigt:boolean\naggregate: Betrag:sum\n| Anna | 12.5 | x |',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<th scope="col">Name</th>');
    expect(html).toContain('style="text-align: right;"');
    expect(html).toContain('12.50');
    // Boolean als Text (input steht nicht auf der Portable-Whitelist).
    expect(html).not.toContain('<input');
    expect(html).toContain('<tfoot>');
    expect(html).toContain('sum</span> 12.50');
  });

  it('liefert null bei Struktur-Fehlern (Fence bleibt im Export unverändert)', () => {
    expect(convertPerspectiveDatatableBlockToHtml('columns: A:zahl')).toBe(null);
    expect(convertPerspectiveDatatableBlockToHtml('| a |')).toBe(null);
  });
});

describe('perspective-datatable — Fence-Suche im Quelltext (4T-0419)', () => {
  it('findet mehrere Fences mit korrekten Zeilenbereichen und Bodys', () => {
    const doc = [
      '# Titel', //                        1
      '```perspective-datatable', //       2
      'columns: A:text', //                3
      '| a |', //                          4
      '```', //                            5
      '', //                               6
      '```perspective-datatable', //       7
      'columns: B:number', //              8
      '```', //                            9
    ].join('\n');
    const fences = findPerspectiveDatatableFences(doc);
    expect(fences).toHaveLength(2);
    expect(fences[0]).toMatchObject({
      openLine: 2,
      closeLine: 5,
      bodyStartLine: 3,
      bodyEndLine: 4,
      body: 'columns: A:text\n| a |',
    });
    expect(fences[1]).toMatchObject({ openLine: 7, closeLine: 9, body: 'columns: B:number' });
  });

  it('zählt Fences in fremden Code-Blöcken nicht mit', () => {
    const doc = [
      '````markdown', //                    umschließender Fence
      '```perspective-datatable', //        nur Beispiel-Text
      'columns: X:text',
      '```',
      '````',
      '~~~perspective-datatable', //        Tilde-Variante zählt
      'columns: A:text',
      '~~~',
    ].join('\n');
    const fences = findPerspectiveDatatableFences(doc);
    expect(fences).toHaveLength(1);
    expect(fences[0].body).toBe('columns: A:text');
  });

  it('ungeschlossener Fence läuft bis zum Datei-Ende', () => {
    const fences = findPerspectiveDatatableFences(
      'Text\n```perspective-datatable\ncolumns: A:text\n| a |',
    );
    expect(fences).toHaveLength(1);
    expect(fences[0]).toMatchObject({
      bodyStartLine: 3,
      bodyEndLine: 4,
      body: 'columns: A:text\n| a |',
    });
  });
});

describe('perspective-datatable — Ansichts-Sortierung und Filter (4T-0420)', () => {
  const BODY =
    'columns: Name:text, Datum:date, Betrag:number, Erledigt:boolean\n' +
    'aggregate: Betrag:sum, Erledigt:count\n' +
    '| Zoe | 2026-01-05 | 10 | x |\n' +
    '| anna | 2025-12-31 | -3 |  |\n' +
    '| Bert |  | kaputt | x |';

  it('compareCellValues vergleicht typ-gerecht, fehlende Werte ans Ende', () => {
    expect(compareCellValues('number', 2, 10)).toBeLessThan(0);
    expect(compareCellValues('date', '2025-12-31', '2026-01-05')).toBeLessThan(0);
    expect(compareCellValues('time', '09:30', '23:10')).toBeLessThan(0);
    // Text locale-bewusst und case-insensitiv-nah (anna < Bert < Zoe).
    expect(compareCellValues('text', 'anna', 'Bert')).toBeLessThan(0);
    expect(compareCellValues('boolean', false, true)).toBeLessThan(0);
    expect(compareCellValues('number', null, 5)).toBeGreaterThan(0);
    expect(compareCellValues('number', 5, null)).toBeLessThan(0);
  });

  it('sortDatatableRows sortiert stabil, Fehler-/Leer-Zellen bleiben am Ende', () => {
    const model = parsePerspectiveDatatable(BODY);
    // Betrag aufsteigend: -3, 10, kaputt (Fehler-Zelle ans Ende).
    expect(sortDatatableRows(model, 2, 1)).toEqual([1, 0, 2]);
    // Betrag absteigend: 10, -3, kaputt (fehlend bleibt am Ende).
    expect(sortDatatableRows(model, 2, -1)).toEqual([0, 1, 2]);
    // Datum aufsteigend: 2025 vor 2026, leer ans Ende.
    expect(sortDatatableRows(model, 1, 1)).toEqual([1, 0, 2]);
    // Text locale-bewusst: anna, Bert, Zoe.
    expect(sortDatatableRows(model, 0, 1)).toEqual([1, 2, 0]);
    // Boolean: false vor true (stabil in Dokument-Reihenfolge).
    expect(sortDatatableRows(model, 3, 1)).toEqual([1, 0, 2]);
  });

  it('filterDatatableRows: Text-Enthaltensuche case-insensitiv, boolean Dreifach-Zustand', () => {
    const model = parsePerspectiveDatatable(BODY);
    expect(filterDatatableRows(model, [{ text: 'AN' }, null, null, null])).toEqual([1]);
    // Anzeige-Text zaehlt: Fehler-Zelle matcht ueber ihren Rohtext.
    expect(filterDatatableRows(model, [null, null, { text: 'kaputt' }, null])).toEqual([2]);
    expect(filterDatatableRows(model, [null, null, null, { bool: true }])).toEqual([0, 2]);
    expect(filterDatatableRows(model, [null, null, null, { bool: false }])).toEqual([1]);
    // Kombination mehrerer Spalten-Filter (UND).
    expect(filterDatatableRows(model, [{ text: 'b' }, null, null, { bool: true }])).toEqual([2]);
    // Leerer/inaktiver Filter liefert alle Zeilen.
    expect(filterDatatableRows(model, [{ text: '  ' }, null, null, null])).toEqual([0, 1, 2]);
  });

  it('gefilterte Aggregate rechnen ueber die sichtbaren Zeilen', () => {
    const model = parsePerspectiveDatatable(BODY);
    const visible = filterDatatableRows(model, [null, null, null, { bool: true }]);
    const aggs = computeAggregates(
      model,
      visible.map((i) => model.rows[i]),
    );
    // Sichtbar: Zoe (10) und Bert (kaputt) -> sum 10, count(x) 2.
    expect(aggs[2]).toEqual([{ func: 'sum', value: 10 }]);
    expect(aggs[3]).toEqual([{ func: 'count', value: 2 }]);
  });
});

describe('perspective-datatable — Berechnete Spalten (4T-0421)', () => {
  it('wertet Arithmetik und Funktionen pro Zeile aus; spaetere Formeln sehen fruehere', () => {
    const model = parseOk(
      'columns: A:number, B:number, Summe:number = A + B, Doppelt:number(1) = Summe * 2, Urteil:text = choice(A > 2, "gross", "klein")\n' +
        '| 2 | 3 |\n' +
        '| 10 | 0.5 |',
    );
    const computed = computeComputedCells(model);
    const r0 = computed.get(model.rows[0]);
    const r1 = computed.get(model.rows[1]);
    expect(r0[2]).toEqual({ value: 5, error: null });
    expect(r0[3]).toEqual({ value: 10, error: null });
    expect(r0[4]).toEqual({ value: 'klein', error: null });
    expect(r1[2]).toEqual({ value: 10.5, error: null });
    expect(r1[4]).toEqual({ value: 'gross', error: null });
  });

  it('boolean-Formeln liefern Wahrheitswerte; leere Eingaben bleiben leere Zellen', () => {
    const model = parseOk('columns: A:number, V:boolean = A > 2\n| 5 |\n|  |');
    const computed = computeComputedCells(model);
    expect(computed.get(model.rows[0])[1]).toEqual({ value: true, error: null });
    // A leer -> Vergleich mit null ist falsch (weiche Abfrage-Semantik).
    expect(computed.get(model.rows[1])[1]).toEqual({ value: false, error: null });
    const empty = parseOk('columns: A:number, D:number = A * 2\n|  |');
    expect(computeComputedCells(empty).get(empty.rows[0])[1]).toEqual({
      value: null,
      error: null,
    });
  });

  it('Typ-Abweichung wird Fehler-Zelle computedTypeMismatch', () => {
    const model = parseOk('columns: A:number, T:time = A + 1\n| 2 |');
    expect(computeComputedCells(model).get(model.rows[0])[1]).toEqual({
      value: null,
      error: 'computedTypeMismatch',
    });
  });

  it('Syntax-/Funktions-Fehler, unbekannte Verweise und Kreis-Bezuege sind Struktur-Fehler', () => {
    const cases = [
      ['columns: A:number, X:number = A +', 'badExpr'],
      ['columns: A:number, X:number = foo(A)', 'badExpr'],
      ['columns: A:number, X:number = Unbekannt * 2', 'computedBadRef'],
      // Kreis-Bezuege: Selbst-Bezug und wechselseitiger Bezug.
      ['columns: A:number, X:number = X + 1', 'computedCycle'],
      ['columns: A:number, X:number = Y * 2, Y:number = X + 1', 'computedCycle'],
    ];
    for (const [body, code] of cases) {
      const model = parsePerspectiveDatatable(body);
      expect(
        model.errors.map((e) => e.code),
        body,
      ).toContain(code);
    }
    // Bezuege in beliebiger Deklarations-Reihenfolge sind erlaubt (die
    // Auswertung loest die Abhaengigkeiten auf).
    parseOk('columns: A:number, Y:number = A + 1, X:number = Y * 2');
    parseOk('columns: A:number, X:number = Y * 2, Y:number = A + 1');
  });

  it('Vorwaerts-Bezug: spaeter deklarierte Formel wird zuerst gerechnet', () => {
    const model = parseOk('columns: A:number, X:number = Y * 2, Y:number = A + 1\n| 2 |');
    const computed = computeComputedCells(model);
    const perCol = computed.get(model.rows[0]);
    expect(perCol[2]).toEqual({ value: 3, error: null }); // Y = A + 1
    expect(perCol[1]).toEqual({ value: 6, error: null }); // X = Y * 2
  });

  it('Aggregate rechnen ueber berechnete Werte; nichts wird persistiert', () => {
    const body =
      'columns: A:number, D:number = A * 2\naggregate: D:sum+avg\n| 1 |\n| 2 |\n| kaputt |';
    const model = parsePerspectiveDatatable(body);
    expect(model.errors).toEqual([]);
    const computed = computeComputedCells(model);
    const aggs = computeAggregates(model, model.rows, makeCellValueResolver(model, computed));
    // Fehler-Zelle A=kaputt -> D leer; sum 2+4, avg 3.
    expect(aggs[1]).toEqual([
      { func: 'sum', value: 6 },
      { func: 'avg', value: 3 },
    ]);
    // Serialisierer kennt nur Daten-Zellen (berechnete Werte nie im Fence).
    expect(serializePerspectiveDatatable(model)).toBe(
      'columns: A:number, D:number = A * 2\naggregate: D:sum+avg\n| 1      |\n| 2      |\n| kaputt |',
    );
  });

  it('Viewer rendert berechnete Werte read-only, Fehler mit Tooltip', () => {
    const html = renderPerspectiveDatatableViewer(
      'columns: A:number(2), D:number(2) = A * 2, T:time = A + 1\n| 12.5 |',
    );
    expect(html).toContain('25.00');
    // Berechnete Zellen sind nicht fokussierbar (kein tabindex am pdt-computed-td).
    expect(html).not.toMatch(/pdt-computed[^>]*tabindex/);
    expect(html).toContain('data-i18n-title="datatable.cellError.computedTypeMismatch"');
  });

  it('Sortierung und Filter arbeiten auf berechneten Werten', () => {
    const model = parseOk('columns: A:number, D:number = A * 2\n| 3 |\n| 1 |\n| 2 |');
    const computed = computeComputedCells(model);
    expect(sortDatatableRows(model, 1, 1, computed)).toEqual([1, 2, 0]);
    expect(filterDatatableRows(model, [null, { text: '6' }], computed)).toEqual([0]);
  });
});
