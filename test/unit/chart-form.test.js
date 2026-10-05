// 4T-002024 (Epic 3E-000192): Formular-Kern des Dialogs «Diagramm einfügen und
// bearbeiten» — Angebot aus dem Modell der Datentabelle, Regeln der Auswahl,
// Vorbelegung beim Einfügen und Bearbeiten, Normalisieren nach einer Änderung
// und das Modell für das Zurückschreiben.
//
// Die Gegenprobe am Ende ist der Wächter der Zusage «Fehleingaben konstruktiv
// unmöglich»: Für jeden Stand, den die Normalisierung aus beliebigen Eingaben
// macht, muss der Format-Kern den geschriebenen Block ohne einen der Gründe
// auflösen, die der Dialog verhindern soll. Die Kriterien-Nummern sind die des
// Tasks.
import { describe, it, expect } from 'vitest';
import {
  CHART_FORM_REASONS,
  buildChartOffer,
  valueColumnChoices,
  rowChoices,
  labelChoices,
  seriesModeChoices,
  chartUnavailableReason,
  normalizeChartForm,
  updateChartForm,
  insertFormDefaults,
  editFormFromSpec,
  chartSpecFromForm,
} from '../../src/shared/charts/chart-form.js';
import {
  CHART_TYPES,
  parseChartSpec,
  serializeChartSpec,
  buildChartInputInDocument,
} from '../../src/shared/markdown/perspective-chart.js';
import { parsePerspectiveDatatable } from '../../src/shared/markdown/perspective-datatable.js';
import { buildEditChanges, findChartBlockAtLine } from '../../src/shared/charts/chart-edit.js';

function modell(...zeilen) {
  return parsePerspectiveDatatable(zeilen.join('\n'));
}

function angebot(...zeilen) {
  return buildChartOffer(modell(...zeilen));
}

// Zahl-, berechnete, Text-, Datums- und Wahrheits-Spalten; die Aggregat-Zeile
// ist weder Zeile noch Eintrag.
const GEMISCHT = [
  'columns: Monat:text, Stichtag:date, Einnahmen "Einnahmen (netto)":number(2), Ausgaben:number, Saldo:number = Einnahmen - Ausgaben, Notiz:text = "x", Erledigt:boolean',
  'aggregate: Einnahmen:sum',
  '| Januar  | 2026-01-31 | 100 | 80 | x |',
  '| Februar | 2026-02-28 | 90  | 95 |   |',
  '| März    | 2026-03-31 | 120 | 70 | x |',
];

describe('chart-form — Angebot aus der Datentabelle (AK3)', () => {
  it('Spalten mit Art, Überschrift und Kennzeichen «berechnet»', () => {
    const o = angebot(...GEMISCHT);
    expect(o.columns).toEqual([
      { name: 'Monat', heading: 'Monat', kind: 'text', computed: false, writable: true },
      { name: 'Stichtag', heading: 'Stichtag', kind: 'other', computed: false, writable: true },
      {
        name: 'Einnahmen',
        heading: 'Einnahmen (netto)',
        kind: 'number',
        computed: false,
        writable: true,
      },
      { name: 'Ausgaben', heading: 'Ausgaben', kind: 'number', computed: false, writable: true },
      { name: 'Saldo', heading: 'Saldo', kind: 'number', computed: true, writable: true },
      { name: 'Notiz', heading: 'Notiz', kind: 'text', computed: true, writable: true },
      { name: 'Erledigt', heading: 'Erledigt', kind: 'other', computed: false, writable: true },
    ]);
    expect(o.rowCount).toBe(3);
  });

  it('als Werte nur Zahl-Spalten, berechnete eingeschlossen, ohne die Beschriftungs-Spalte', () => {
    const o = angebot(...GEMISCHT);
    expect(valueColumnChoices(o, 'Monat')).toEqual(['Einnahmen', 'Ausgaben', 'Saldo']);
    expect(valueColumnChoices(o, 'ausgaben')).toEqual(['Einnahmen', 'Saldo']);
  });

  it('als Beschriftung jede Spalte', () => {
    const o = angebot(...GEMISCHT);
    expect(labelChoices(o, 'columns').every((c) => !c.locked)).toBe(true);
    expect(labelChoices(o, 'columns').map((c) => c.name)).toEqual(o.columns.map((c) => c.name));
  });

  it('Zeilen mit ihrem Eintrag, wie die Tabelle ihn zeigt, auch aus berechneter und Zahl-Spalte', () => {
    const o = angebot(...GEMISCHT);
    expect(rowChoices(o, 'Monat')).toEqual({
      rows: [
        { entry: 'Januar', row: 0 },
        { entry: 'Februar', row: 1 },
        { entry: 'März', row: 2 },
      ],
      skipped: 0,
    });
    expect(rowChoices(o, 'Einnahmen').rows.map((r) => r.entry)).toEqual([
      '100.00',
      '90.00',
      '120.00',
    ]);
    expect(rowChoices(o, 'Saldo').rows.map((r) => r.entry)).toEqual(['20', '-5', '50']);
    // Lauter gleiche Einträge: keine Zeile ist eindeutig.
    expect(rowChoices(o, 'Notiz')).toEqual({ rows: [], skipped: 3 });
  });

  it('Zeilen mit leerem oder mehrfachem Eintrag sind nicht wählbar und zählen als ausgelassen', () => {
    const o = angebot(
      'columns: Name:text, Wert:number',
      '| A |  1 |',
      '|   |  2 |',
      '| B |  3 |',
      '| A |  4 |',
      '| C |  5 |',
    );
    expect(rowChoices(o, 'Name')).toEqual({
      rows: [
        { entry: 'B', row: 2 },
        { entry: 'C', row: 4 },
      ],
      skipped: 3,
    });
  });

  it('ein Eintrag, den die Schreibweise von `rows:` nicht unverändert trägt, ist nicht wählbar', () => {
    const o = angebot('columns: Name:text, Wert:number', '| a\\ | 1 |', '| b | 2 |');
    expect(o.entries[0]).toEqual(['a\\', 'b']);
    expect(rowChoices(o, 'Name')).toEqual({ rows: [{ entry: 'b', row: 1 }], skipped: 1 });
  });
});

describe('chart-form — Regeln der Auswahl', () => {
  it('eine Beschriftungs-Spalte ist gesperrt, wenn keine Datenreihe übrig bliebe', () => {
    const o = angebot('columns: A:number, B:text', '| 1 | x |', '| 2 | x |');
    expect(labelChoices(o, 'columns')).toEqual([
      { name: 'A', locked: true },
      { name: 'B', locked: false },
    ]);
    // Bei Zeilen trägt B keine eindeutige Zeile, A keine Zahl-Spalte als Rubrik.
    expect(labelChoices(o, 'rows').every((c) => c.locked)).toBe(true);
    expect(seriesModeChoices(o)).toEqual([
      { mode: 'columns', locked: false },
      { mode: 'rows', locked: true },
    ]);
  });

  it('kann überhaupt ein Diagramm entstehen?', () => {
    expect(chartUnavailableReason(modell('columns: A:number', '| 1 |'))).toBe('no-series');
    expect(chartUnavailableReason(modell('columns: A:text, B:date', '| x | 2026-01-01 |'))).toBe(
      'no-number-column',
    );
    expect(chartUnavailableReason(modell('columns: A:unbekannt', '| x |'))).toBe('table-invalid');
    expect(chartUnavailableReason(modell(...GEMISCHT))).toBeNull();
    // Eine Tabelle ohne Zeilen ergibt ein Diagramm ohne Zahl; das zeigt das
    // Diagramm, das Formular verhindert es nicht.
    expect(chartUnavailableReason(modell('columns: A:text, B:number'))).toBeNull();
    for (const g of ['no-series', 'no-number-column', 'table-invalid']) {
      expect(CHART_FORM_REASONS).toContain(g);
    }
  });
});

describe('chart-form — Vorbelegung (AK3, AK7)', () => {
  it('Einfügen: Balken, Spalten, erste Nicht-Zahl-Spalte, alle wählbaren Zahl-Spalten', () => {
    expect(insertFormDefaults(angebot(...GEMISCHT))).toEqual({
      type: 'bar',
      series: 'columns',
      labels: 'Monat',
      values: ['Einnahmen', 'Ausgaben', 'Saldo'],
      rows: null,
      title: '',
    });
  });

  it('Einfügen: ohne Nicht-Zahl-Spalte ist die erste Spalte die Beschriftung', () => {
    const o = angebot('columns: Jahr:number, Wert:number', '| 2025 | 1 |', '| 2026 | 2 |');
    expect(insertFormDefaults(o)).toMatchObject({ labels: 'Jahr', values: ['Wert'] });
  });

  it('Bearbeiten: vorbelegt mit den Angaben des Blocks, in der Schreibweise der Tabelle', () => {
    const o = angebot(...GEMISCHT);
    const spec = parseChartSpec(
      [
        'table: ^umsatz',
        'type: line',
        'labels: monat',
        'values: saldo, Einnahmen',
        'title: Umsatz',
      ].join('\n'),
    );
    expect(editFormFromSpec(o, spec)).toEqual({
      type: 'line',
      series: 'columns',
      labels: 'Monat',
      values: ['Einnahmen', 'Saldo'],
      rows: null,
      title: 'Umsatz',
    });
  });

  it('Bearbeiten: ungültige Nennungen fallen weg; bleibt nichts Gültiges, die erste mögliche Reihe', () => {
    const o = angebot(...GEMISCHT);
    const spalten = parseChartSpec('type: bar\nlabels: Monat\nvalues: Gibt-es-nicht, Notiz, Monat');
    expect(editFormFromSpec(o, spalten).values).toEqual(['Einnahmen']);
    const teils = parseChartSpec('type: bar\nlabels: Monat\nvalues: Gibt-es-nicht, Ausgaben');
    expect(editFormFromSpec(o, teils).values).toEqual(['Ausgaben']);
    const zeilen = parseChartSpec('type: bar\nseries: rows\nlabels: Monat\nrows: Mai, Juni');
    expect(editFormFromSpec(o, zeilen)).toMatchObject({ series: 'rows', rows: ['Januar'] });
  });

  it('Bearbeiten: unbekannte Art und Richtung, fehlende Beschriftung', () => {
    const o = angebot(...GEMISCHT);
    const spec = parseChartSpec('type: fläche\nseries: diagonal\nvalues: Ausgaben');
    expect(editFormFromSpec(o, spec)).toEqual({
      type: 'bar',
      series: 'columns',
      labels: 'Monat',
      values: ['Ausgaben'],
      rows: null,
      title: '',
    });
  });

  // Durchsicht vom 2026-09-30 (K1): Bis dahin machte eine vollständige Liste
  // `null` daraus, und der unverändert bestätigte Block verlor seine Zeile
  // `values:`. Der Fall hielt das alte Verhalten fest und ist berichtigt.
  it('Bearbeiten bei Zeilen: eine genannte Liste bleibt, auch vollständig; ohne Angabe null', () => {
    const o = angebot(...GEMISCHT);
    const teil = parseChartSpec('series: rows\nlabels: Monat\nvalues: Ausgaben\nrows: März');
    expect(editFormFromSpec(o, teil)).toMatchObject({ values: ['Ausgaben'], rows: ['März'] });
    const alle = parseChartSpec(
      'series: rows\nlabels: Monat\nvalues: Einnahmen, Ausgaben, Saldo\nrows: März',
    );
    expect(editFormFromSpec(o, alle).values).toEqual(['Einnahmen', 'Ausgaben', 'Saldo']);
    const ohne = parseChartSpec('series: rows\nlabels: Monat\nrows: März');
    expect(editFormFromSpec(o, ohne).values).toBeNull();
  });
});

describe('chart-form — Normalisieren nach einer Änderung (AK26)', () => {
  const o = angebot(...GEMISCHT);
  const start = insertFormDefaults(o);

  it('Kreis und Donut: genau eine Reihe, auch nach dem Wechsel zurück', () => {
    const kreis = updateChartForm(o, start, { type: 'pie' });
    expect(kreis.values).toEqual(['Einnahmen']);
    expect(updateChartForm(o, kreis, { values: ['Ausgaben', 'Saldo'] }).values).toEqual([
      'Ausgaben',
    ]);
    expect(updateChartForm(o, kreis, { type: 'bar' }).values).toEqual(['Einnahmen']);
    const donutZeilen = updateChartForm(o, { ...kreis, type: 'donut' }, { series: 'rows' });
    expect(donutZeilen.rows).toEqual(['Januar']);
  });

  it('mindestens eine Reihe: eine leere Auswahl wird gefüllt', () => {
    expect(updateChartForm(o, start, { values: [] }).values).toEqual([
      'Einnahmen',
      'Ausgaben',
      'Saldo',
    ]);
    const zeilen = updateChartForm(o, start, { series: 'rows' });
    expect(updateChartForm(o, zeilen, { rows: [] }).rows).toEqual(['Januar', 'Februar', 'März']);
  });

  it('Wechsel der Richtung: Spalten -> Zeilen entfernt die Werte, zurück entfernt die Zeilen', () => {
    const gewaehlt = updateChartForm(o, start, { values: ['Saldo'] });
    const zeilen = updateChartForm(o, gewaehlt, { series: 'rows' });
    expect(zeilen).toMatchObject({
      series: 'rows',
      values: null,
      rows: ['Januar', 'Februar', 'März'],
    });
    const zurueck = updateChartForm(o, { ...zeilen, rows: ['März'] }, { series: 'columns' });
    expect(zurueck).toMatchObject({
      series: 'columns',
      values: ['Einnahmen', 'Ausgaben', 'Saldo'],
      rows: null,
    });
  });

  it('Wechsel der Beschriftungs-Spalte nimmt sie aus den Werten', () => {
    const neu = updateChartForm(o, start, { labels: 'Saldo' });
    expect(neu).toMatchObject({ labels: 'Saldo', values: ['Einnahmen', 'Ausgaben'] });
    // Eine gesperrte Beschriftungs-Spalte wird nicht übernommen.
    const nurZahl = angebot('columns: A:number, B:text', '| 1 | x |');
    expect(updateChartForm(nurZahl, insertFormDefaults(nurZahl), { labels: 'A' }).labels).toBe('B');
  });

  it('eine gesperrte Richtung wird nicht übernommen', () => {
    const doppelt = angebot('columns: B:text, A:number', '| x | 1 |', '| x | 2 |');
    expect(updateChartForm(doppelt, insertFormDefaults(doppelt), { series: 'rows' }).series).toBe(
      'columns',
    );
  });

  it('Titel: Freitext ohne Zeilenumbruch', () => {
    expect(updateChartForm(o, start, { title: '  Umsatz\r\n2026 ' }).title).toBe('Umsatz 2026');
  });

  it('ohne mögliche Reihe gibt es keinen Stand', () => {
    expect(normalizeChartForm(angebot('columns: A:number', '| 1 |'), {})).toBeNull();
  });
});

describe('chart-form — Modell für das Zurückschreiben', () => {
  const o = angebot(...GEMISCHT);

  function geschrieben(form, body) {
    return serializeChartSpec(
      chartSpecFromForm(form, body == null ? undefined : parseChartSpec(body)),
    );
  }

  it('Einfügen: Zeilen in der Reihenfolge des Kerns, ohne `series: columns`, ohne leeren Titel', () => {
    expect(geschrieben(insertFormDefaults(o))).toBe(
      'type: bar\nlabels: Monat\nvalues: Einnahmen, Ausgaben, Saldo\n',
    );
  });

  it('Zeilen mit allen Zahl-Spalten: keine Zeile `values:`', () => {
    const zeilen = updateChartForm(o, insertFormDefaults(o), { series: 'rows', title: 'T' });
    expect(geschrieben(zeilen)).toBe(
      'type: bar\nseries: rows\nlabels: Monat\nrows: Januar, Februar, März\ntitle: T\n',
    );
  });

  it('`series: columns` nur, wenn die Zeile im Block schon stand; leerer Titel entfernt die Zeile', () => {
    const body = 'table: ^u\nseries: rows\nlabels: Monat\nrows: März\ntitle: Alt';
    const form = updateChartForm(o, editFormFromSpec(o, parseChartSpec(body)), {
      series: 'columns',
      title: '',
    });
    expect(geschrieben(form, body)).toBe(
      'table: ^u\nseries: columns\nlabels: Monat\ntype: bar\nvalues: Einnahmen, Ausgaben, Saldo',
    );
  });

  it('unveränderte Angaben bleiben im Wortlaut des Blocks', () => {
    const body = 'table: ^u\ntype: BAR\nlabels: monat\nvalues: saldo,  einnahmen\nfarbe: rot\n';
    const form = editFormFromSpec(o, parseChartSpec(body));
    expect(geschrieben(form, body)).toBe(body);
    // Rot-Probe: Eine tatsächliche Änderung schreibt die Zeile neu.
    expect(geschrieben({ ...form, values: ['Saldo'] }, body)).toBe(
      'table: ^u\ntype: BAR\nlabels: monat\nvalues: Saldo\nfarbe: rot\n',
    );
  });
});

// --- Gegenprobe ---------------------------------------------------------------

const PRUEF_TABELLEN = {
  'nur Zahl-Spalten': [
    'columns: Jahr:number, Umsatz:number, Kosten:number',
    '| 2024 | 10 | 8 |',
    '| 2025 | 12 | 9 |',
  ],
  'berechnete Spalte': [
    'columns: Monat:text, Ein:number, Aus:number, Saldo:number = Ein - Aus, Hinweis:text = "k"',
    '| Jan | 100 | 80 |',
    '| Feb | 90 | 95 |',
  ],
  'Datums-Spalte': [
    'columns: Tag:date, Wert:number, Ok:boolean',
    '| 2026-01-01 | 3 | x |',
    '| 2026-01-02 | 4 |   |',
  ],
  'doppelte Beschriftungen': [
    'columns: Name:text, A:number, B:number',
    '| X | 1 | 2 |',
    '| X | 3 | 4 |',
    '| Y | 5 | 6 |',
    '|   | 7 | 8 |',
  ],
  'eine einzige Zeile': ['columns: Name:text, Wert:number', '| Nur | 5 |'],
  'nicht schreibbarer Eintrag': ['columns: Name:text, Wert:number', '| a\\ | 1 |', '| b, c | 2 |'],
};

// Gründe, die der Dialog verhindern soll. Die übrigen (keine Zahl, negative
// Werte oder lauter Nullen bei Kreis und Donut) hängen an den Daten.
function verhinderterGrund(ergebnis) {
  if (ergebnis.drawable) return null;
  if (ergebnis.reason === 'selection-invalid' || ergebnis.reason === 'values-not-numeric') {
    return `${ergebnis.reason} ${ergebnis.detail || ergebnis.missingKey}`;
  }
  if (
    ergebnis.reason === 'type-unsupported' &&
    ['multiple-series', 'missing-type', 'unknown-type'].includes(ergebnis.detail)
  ) {
    return `${ergebnis.reason} ${ergebnis.detail}`;
  }
  if (ergebnis.reason.startsWith('table-')) return ergebnis.reason;
  return null;
}

function dokument(zeilen) {
  return ['```perspective-datatable', ...zeilen, '```', '^t', ''].join('\n');
}

function pruefe(zeilen, form, body) {
  const spec = chartSpecFromForm(form, body == null ? undefined : parseChartSpec(body));
  const geschrieben = serializeChartSpec({ ...spec, table: '^t' });
  return verhinderterGrund(
    buildChartInputInDocument(parseChartSpec(geschrieben), dokument(zeilen), 't'),
  );
}

describe('chart-form — Gegenprobe am Format-Kern (AK26)', () => {
  for (const [titel, zeilen] of Object.entries(PRUEF_TABELLEN)) {
    it(`jeder normalisierte Stand ergibt einen gültigen Block: ${titel}`, () => {
      const m = modell(...zeilen);
      expect(chartUnavailableReason(m)).toBeNull();
      const o = buildChartOffer(m);
      const namen = o.columns.map((c) => c.name);
      const eintraege = o.entries.flat();
      const beschriftungen = [
        null,
        'Gibt-es-nicht',
        ...namen,
        ...namen.map((n) => n.toUpperCase()),
      ];
      const werte = [null, [], namen, namen.slice(0, 1), namen.slice(-1), ['Gibt-es-nicht']];
      const reihen = [null, [], eintraege, eintraege.slice(0, 1), ['Gibt-es-nicht']];
      const befunde = [];
      let staende = 0;
      for (const type of [...CHART_TYPES, 'fläche', null]) {
        for (const series of ['columns', 'rows', 'diagonal']) {
          for (const labels of beschriftungen) {
            for (const values of werte) {
              for (const rows of reihen) {
                const roh = { type, series, labels, values, rows, title: 'T' };
                for (const form of [
                  normalizeChartForm(o, roh),
                  normalizeChartForm(o, roh, 'first'),
                ]) {
                  staende++;
                  const grund = pruefe(zeilen, form);
                  if (grund) befunde.push(`${JSON.stringify(form)} -> ${grund}`);
                }
              }
            }
          }
        }
      }
      expect(staende).toBeGreaterThan(1000);
      expect(befunde).toEqual([]);
    });
  }

  it('auch über Änderungs-Folgen und aus beschädigten Blöcken', () => {
    const befunde = [];
    for (const zeilen of Object.values(PRUEF_TABELLEN)) {
      const o = buildChartOffer(modell(...zeilen));
      const namen = o.columns.map((c) => c.name);
      const bodies = [
        '',
        'type: pie\nseries: rows\nlabels: Gibt-es-nicht\nrows: a, a',
        `type: donut\nlabels: ${namen[0]}\nvalues: ${namen.join(', ')}, ${namen[0]}`,
        `series: rows\nlabels: ${namen[namen.length - 1]}\nvalues: ${namen[0]}`,
        'type: line\nvalues:\nrows:\nunbekannt: 1',
      ];
      for (const body of bodies) {
        let form = editFormFromSpec(o, parseChartSpec(body));
        const schritte = [
          { type: 'pie' },
          { series: 'rows' },
          { labels: namen[1] },
          { type: 'line' },
          { series: 'columns' },
          { labels: namen[0], type: 'donut' },
          { values: [] },
        ];
        for (const patch of schritte) {
          form = updateChartForm(o, form, patch);
          const grund = pruefe(zeilen, form, body);
          if (grund) befunde.push(`${body} + ${JSON.stringify(patch)} -> ${grund}`);
        }
      }
    }
    expect(befunde).toEqual([]);
  });
});

// --- Unverändert bestätigt: nichts wird geschrieben -----------------------------
//
// Durchsicht vom 2026-09-30 (K1): Die Zusage «ein unveränderter Formular-Stand
// schreibt nichts» als allgemeine Eigenschaft. Jeder Block, den der Format-Kern
// ohne einen der Gründe auflöst, die der Dialog verhindert, läuft ohne
// Änderung durch den ganzen Formular-Weg (Vorbelegung, Modell, Änderungs-Liste);
// die Änderungs-Liste muss leer sein. Die Blöcke kommen aus den Prüf-Tabellen
// oben und aus einem Zufalls-Erzeuger mit festem Startwert, in wechselnder
// Schreibweise (Groß- und Kleinschreibung, Leerraum, Reihenfolge).

function mitDiagramm(zeilen, angaben) {
  return [
    '```perspective-datatable',
    ...zeilen,
    '```',
    '^t',
    '',
    '```perspective-chart',
    'table: ^t',
    ...angaben,
    '```',
    '',
  ].join('\n');
}

// Die Zeile des Öffners liegt hinter der Tabelle; gezählt wird im Dokument.
function oeffnerZeile(doc) {
  return doc.split('\n').indexOf('```perspective-chart') + 1;
}

function unveraendertBestaetigt(zeilen, doc) {
  const zeile = oeffnerZeile(doc) + 1;
  const b = findChartBlockAtLine(doc, zeile);
  const spec = parseChartSpec(b.body);
  const form = editFormFromSpec(buildChartOffer(modell(...zeilen)), spec);
  return buildEditChanges(doc, zeile, chartSpecFromForm(form, spec), b.body);
}

// Kleiner Zufalls-Erzeuger mit festem Startwert (mulberry32).
function zufall(start) {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Ein Block, den der Dialog darstellen kann: Der Format-Kern zeichnet ihn, oder
// es fehlt allein an den Daten (negative Werte, lauter Nullen). Ein Block ohne
// jede Datenreihe («keine einzige Zahl», weil die einzige Zahl-Spalte zugleich
// Beschriftung ist) hat im Dialog keinen Stand; er ändert sich beim Bestätigen.
function darstellbar(ergebnis) {
  if (ergebnis.drawable) return true;
  return ergebnis.reason === 'type-unsupported' && ['negative', 'zeros'].includes(ergebnis.detail);
}

function zufallsBlock(r, o) {
  const eins = (liste) => liste[Math.floor(r() * liste.length)];
  const schreibweise = (w) => (r() < 0.3 ? w.toUpperCase() : r() < 0.3 ? w.toLowerCase() : w);
  const auswahl = (liste) => {
    const gemischt = [...liste].sort(() => r() - 0.5);
    return gemischt.slice(0, 1 + Math.floor(r() * gemischt.length));
  };
  const liste = (werte) => werte.join(eins([', ', ',', ' ,  ']));
  const namen = o.columns.map((c) => c.name);
  const labels = eins(namen);
  const series = eins([null, 'columns', 'rows']);
  const angaben = [`type: ${schreibweise(eins(CHART_TYPES))}`];
  if (series) angaben.push(`series: ${series}`);
  angaben.push(`labels: ${schreibweise(labels)}`);
  if (series !== 'rows' || r() < 0.5)
    angaben.push(`values: ${liste(auswahl(namen).map(schreibweise))}`);
  if (series === 'rows') {
    // Nur Einträge, die die Schreibweise von `rows:` trägt; die übrigen sind
    // eine benannte Grenze des Dialogs (nicht wählbar, Kapitel «Lösung»).
    const ci = namen.indexOf(labels);
    const waehlbar = o.entries[ci].filter((e, zi) => o.entryWritable[ci][zi]);
    if (waehlbar.length === 0) return null;
    angaben.push(`rows: ${liste(auswahl(waehlbar))}`);
  }
  if (r() < 0.4) angaben.push(`title: Titel ${Math.floor(r() * 100)}`);
  if (r() < 0.3) angaben.splice(Math.floor(r() * angaben.length), 0, 'farbe: rot');
  return angaben.sort(() => r() - 0.5);
}

describe('chart-form — unverändert bestätigt, nichts geschrieben (Durchsicht vom 2026-09-30, K1)', () => {
  it('der Fall der Durchsicht: bei Zeilen alle Zahl-Spalten ausdrücklich genannt', () => {
    const zeilen = [
      'columns: Monat:text, Einnahmen:number, Ausgaben:number',
      '| Januar | 100 | 80 |',
      '| Februar | 90 | 95 |',
    ];
    const doc = mitDiagramm(zeilen, [
      'type: bar',
      'series: rows',
      'labels: Monat',
      'values: Einnahmen, Ausgaben',
      'rows: Januar',
    ]);
    expect(unveraendertBestaetigt(zeilen, doc)).toEqual({ ok: true, changes: [] });
  });

  it('für jeden gültigen Block ist die Änderungs-Liste leer (Prüf-Tabellen, Zufalls-Blöcke)', () => {
    const r = zufall(20260930);
    const befunde = [];
    let gueltig = 0;
    for (const zeilen of [...Object.values(PRUEF_TABELLEN), GEMISCHT]) {
      const o = buildChartOffer(modell(...zeilen));
      for (let i = 0; i < 400; i++) {
        const angaben = zufallsBlock(r, o);
        if (!angaben) continue;
        const doc = mitDiagramm(zeilen, angaben);
        const body = ['table: ^t', ...angaben].join('\n');
        if (!darstellbar(buildChartInputInDocument(parseChartSpec(body), doc, 't'))) continue;
        gueltig++;
        const erg = unveraendertBestaetigt(zeilen, doc);
        if (!erg.ok || erg.changes.length > 0) {
          befunde.push(`${angaben.join(' | ')} -> ${JSON.stringify(erg.changes || erg.grund)}`);
        }
      }
    }
    expect(gueltig).toBeGreaterThan(300);
    expect(befunde).toEqual([]);
  });
});
