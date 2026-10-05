// 4T-002024 (Epic 3E-000192): Schreib-Kern von «Diagramm zu dieser Tabelle
// einfügen» und «Diagramm bearbeiten» — Datentabelle und Diagramm-Block an
// einer Zeile finden, Namen der Tabelle bestimmen und vergeben, Änderungs-Liste
// für das Einfügen und das Bearbeiten. Prozess-neutral: geprüft wird die reine
// Kette Text -> Änderungs-Liste -> Text, mit Byte-Vergleich, wo der Task
// «unverändert» zusagt.
//
// Die Kriterien-Nummern sind die des Tasks. AK11 und AK12 (Abbruch) und AK18
// und AK19 (ein Rückgängig-Schritt) trägt dieser Kern nur zum Teil: Er liefert
// alles als eine Liste und schreibt selbst nichts; den Bedienweg prüfen die
// Prüfdateien des Anzeige-Prozesses.
//
// 4T-002072: Der Name einer Tabelle steht in ihrer Kopf-Angabe `table: Name`.
// Eine Tabelle ohne Namen bekommt beim Einfügen die erste Kopf-Zeile
// `table: tabelle-N`, unter ihr steht keine Zeile, und das Diagramm nennt den
// Namen ohne Dach-Zeichen. Die alte Zeile `^name` unter der Tabelle gilt weiter.
import { describe, it, expect } from 'vitest';
import {
  CHART_EDIT_REASONS,
  applyChanges,
  findDatatableAtLine,
  findChartBlockAtLine,
  nextFreeTableName,
  buildInsertChanges,
  buildEditChanges,
} from '../../src/shared/charts/chart-edit.js';
import {
  buildChartOffer,
  editFormFromSpec,
  chartSpecFromForm,
  updateChartForm,
} from '../../src/shared/charts/chart-form.js';
import { parseChartSpec, buildChartInput } from '../../src/shared/markdown/perspective-chart.js';
import { resolveTableInDocument } from '../../src/shared/markdown/perspective-chart-resolve.js';
import { parsePerspectiveDatatable } from '../../src/shared/markdown/perspective-datatable.js';
import { extractBlockAnchors } from '../../src/shared/block-anchors.js';

const Z = '```';

// Datentabelle ohne Namen; Zeile 3 ist der Öffner, Zeile 7 der Schluss.
const TABELLE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | 70 |',
  Z,
];

const ANGABEN = { type: 'bar', labels: 'Monat', values: ['Einnahmen', 'Ausgaben'] };

function zeilen(...z) {
  return z.flat().join('\n');
}

function chartBlock(...body) {
  return [`${Z}perspective-chart`, ...body, Z];
}

// 4T-002072: Die Tabelle mit der Kopf-Angabe `table: name` als erster Zeile.
function benannt(name, tabelle = TABELLE) {
  return [tabelle[0], `table: ${name}`, ...tabelle.slice(1)];
}

const DIAGRAMM_1 = chartBlock(
  'table: tabelle-1',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen, Ausgaben',
);

function eingefuegt(doc, zeile, angaben = ANGABEN, stand) {
  const r = buildInsertChanges(doc, zeile, angaben, stand);
  expect(r.ok, r.grund).toBe(true);
  return { ...r, text: applyChanges(doc, r.changes) };
}

describe('chart-edit — Datentabelle und Diagramm-Block an einer Zeile', () => {
  it('findet die Datentabelle auf jeder ihrer Zaun-Zeilen, sonst nichts', () => {
    const doc = zeilen('# Titel', '', TABELLE, '', 'Text');
    for (const zeile of [3, 5, 8]) expect(findDatatableAtLine(doc, zeile).openLine).toBe(3);
    for (const zeile of [1, 2, 9, 10]) expect(findDatatableAtLine(doc, zeile)).toBeNull();
    expect(findDatatableAtLine(doc, 5)).toMatchObject({ closeLine: 8, name: null, nameLine: null });
  });

  it('Name der Tabelle: die erste nicht leere Zeile nach dem Schluss, genau `^name`; Leerzeilen trennen nicht', () => {
    expect(findDatatableAtLine(zeilen(TABELLE, '^umsatz'), 1)).toMatchObject({
      name: 'umsatz',
      nameLine: 7,
    });
    expect(findDatatableAtLine(zeilen(TABELLE, '', '', '  ^umsatz  '), 1)).toMatchObject({
      name: 'umsatz',
      nameLine: 9,
    });
    // Ein Anker am Ende einer Inhalts-Zeile benennt nach dem Kern nicht die Tabelle.
    expect(findDatatableAtLine(zeilen(TABELLE, 'Text ^umsatz'), 1).name).toBeNull();
    expect(findDatatableAtLine(zeilen(TABELLE, '^a b'), 1).name).toBeNull();
    // Dieselbe Regel wie die Auflösung des Kerns.
    const doc = zeilen(TABELLE, '', '^umsatz');
    expect(resolveTableInDocument(doc, 'umsatz')).toMatchObject({ status: 'found', openLine: 1 });
  });

  // 4T-002072: Der Name aus der Kopf-Angabe kommt aus der Heimat der Kennungen.
  it('Name aus der Kopf-Angabe `table:`: Zeile der Angabe, vor einer alten Zeile darunter', () => {
    const doc = zeilen('Text', '', benannt('Umsatz'), '', '^alt');
    expect(findDatatableAtLine(doc, 5)).toMatchObject({
      openLine: 3,
      closeLine: 9,
      name: 'Umsatz',
      nameLine: 4,
      nameInKopf: true,
    });
    expect(findDatatableAtLine(zeilen(TABELLE, '^alt'), 1)).toMatchObject({
      name: 'alt',
      nameInKopf: false,
    });
    // Ein ungültiger Wert benennt nichts; es gilt die alte Zeile.
    const ungueltig = zeilen(benannt('a b'), '^alt');
    expect(findDatatableAtLine(ungueltig, 1)).toMatchObject({ name: 'alt', nameInKopf: false });
    expect(findDatatableAtLine(zeilen(benannt('')), 1)).toMatchObject({
      name: null,
      nameLine: null,
    });
  });

  it('ein nicht geschlossener Zaun der Datentabelle hat keine Schluss-Zeile', () => {
    const doc = zeilen(TABELLE.slice(0, -1));
    expect(findDatatableAtLine(doc, 2)).toMatchObject({ closeLine: null, name: null });
  });

  it('findet den Diagramm-Block samt Inhalt und Offsets; ein anderer Zaun ist keiner', () => {
    const doc = zeilen('Text', chartBlock('table: ^t', 'type: bar'), '', `${Z}js`, 'x', Z);
    const b = findChartBlockAtLine(doc, 3);
    expect(b).toMatchObject({ openLine: 2, closeLine: 5, body: 'table: ^t\ntype: bar\n' });
    expect(doc.slice(b.bodyFrom, b.bodyTo)).toBe(b.body);
    expect(findChartBlockAtLine(doc, 5).openLine).toBe(2);
    expect(findChartBlockAtLine(doc, 1)).toBeNull();
    expect(findChartBlockAtLine(doc, 8)).toBeNull();
  });

  it('längerer Zaun, Beispiel in einem äußeren Zaun, Frontmatter, offener Zaun', () => {
    const lang = zeilen('````perspective-chart', 'table: ^t', '```', '````');
    expect(findChartBlockAtLine(lang, 3)).toMatchObject({ openLine: 1, closeLine: 4 });
    const beispiel = zeilen('````markdown', chartBlock('table: ^t'), '````');
    expect(findChartBlockAtLine(beispiel, 3)).toBeNull();
    const vorspann = zeilen('---', 'a: 1', '---', chartBlock('table: ^t'));
    expect(findChartBlockAtLine(vorspann, 5).openLine).toBe(4);
    const offen = zeilen('Text', `${Z}perspective-chart`, 'table: ^t');
    expect(findChartBlockAtLine(offen, 3)).toMatchObject({ closeLine: null, body: 'table: ^t' });
  });
});

describe('chart-edit — nächster freier Name (AK5, AK21)', () => {
  it('die kleinste freie Zahl ab 1, ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(nextFreeTableName('Text')).toBe('tabelle-1');
    expect(nextFreeTableName(zeilen('a', '^tabelle-1'))).toBe('tabelle-2');
    expect(nextFreeTableName(zeilen('a', '^Tabelle-1'))).toBe('tabelle-2');
    expect(nextFreeTableName(zeilen('a ^tabelle-1', '', 'b ^tabelle-3'))).toBe('tabelle-2');
  });

  it('ein Anker in einem Code-Block zählt nicht', () => {
    expect(nextFreeTableName(zeilen(`${Z}text`, '^tabelle-1', Z))).toBe('tabelle-1');
  });

  // Durchsicht vom 2026-09-30 (K3): Ein Name, den das Dokument nur noch nennt,
  // ist belegt. Sonst fing ein verwaistes Diagramm den neuen Namen ein und
  // zeichnete still fremde Daten.
  it('belegt ist auch ein genannter Name: `table:` eines Diagramms, Verweis und Einbettung', () => {
    expect(nextFreeTableName(zeilen(chartBlock('type: bar', 'table: ^tabelle-1')))).toBe(
      'tabelle-2',
    );
    expect(nextFreeTableName(zeilen(chartBlock('Table :  ^Tabelle-1')))).toBe('tabelle-2');
    expect(nextFreeTableName('Siehe [[#^tabelle-1]] und ![[#^tabelle-2|Bild]]')).toBe('tabelle-3');
    expect(nextFreeTableName('Siehe [[#^tabelle-1|Text]]')).toBe('tabelle-2');
  });

  // 4T-002072: Kopf-Namen über die Heimat, Nennungen ohne Dach-Zeichen über den
  // Scanner der Angabe.
  it('belegt sind auch ein Kopf-Name und eine Nennung ohne Dach-Zeichen', () => {
    expect(nextFreeTableName(zeilen(benannt('tabelle-1')))).toBe('tabelle-2');
    expect(nextFreeTableName(zeilen(benannt('Tabelle-1'), '', benannt('tabelle-2')))).toBe(
      'tabelle-3',
    );
    expect(nextFreeTableName(zeilen(chartBlock('table: tabelle-1')))).toBe('tabelle-2');
    // Ein Kopf-Name mit Dach-Zeichen ist ungültig und belegt nichts.
    expect(nextFreeTableName(zeilen(benannt('^tabelle-1')))).toBe('tabelle-1');
  });

  it('nicht belegt: Nennung im Code, im Inline-Code, in einem anderen Block, mit Datei-Namen', () => {
    for (const text of [
      zeilen(`${Z}text`, 'table: ^tabelle-1', '[[#^tabelle-1]]', Z),
      'Im Code `[[#^tabelle-1]]` steht nichts',
      zeilen(`${Z}perspective-datatable`, 'table: ^tabelle-1', Z),
      // Nur die wirksame, erste Angabe eines Diagramm-Blocks nennt die Tabelle.
      zeilen(chartBlock('table: ^umsatz', 'table: ^tabelle-1')),
      'Verweis auf [[Andere#^tabelle-1]]',
      zeilen('---', 'notiz: "[[#^tabelle-1]]"', '---', 'Text'),
    ]) {
      expect(nextFreeTableName(text), text).toBe('tabelle-1');
    }
  });

  it('Einfügen neben einem verwaisten Diagramm: der neue Name trifft es nicht', () => {
    const doc = zeilen(chartBlock('table: ^tabelle-1', 'type: bar'), '', TABELLE, '', 'Text');
    expect(buildChartInput(doc, 'table: ^tabelle-1\ntype: bar').reason).toBe('table-missing');
    const r = eingefuegt(doc, 6);
    expect(r.name).toBe('tabelle-2');
    expect(buildChartInput(r.text, 'table: ^tabelle-1\ntype: bar').reason).toBe('table-missing');
  });
});

describe('chart-edit — Einfügen (AK4, AK5, AK10, AK18, AK20, AK21)', () => {
  it('AK5/AK4: ohne Namen entsteht `table: tabelle-1` als erste Kopf-Zeile, nichts unter der Tabelle, der Block darunter', () => {
    const doc = zeilen('# Titel', '', TABELLE, '', 'Text');
    const r = eingefuegt(doc, 5, { ...ANGABEN, title: 'Umsatz' });
    expect(r.name).toBe('tabelle-1');
    expect(r.text).toBe(
      zeilen(
        '# Titel',
        '',
        benannt('tabelle-1'),
        '',
        chartBlock(
          'table: tabelle-1',
          'type: bar',
          'labels: Monat',
          'values: Einnahmen, Ausgaben',
          'title: Umsatz',
        ),
        '',
        'Text',
      ),
    );
  });

  it('AK4: das Diagramm nennt die Tabelle und trägt die gewählten Angaben', () => {
    const doc = zeilen(TABELLE, '', 'Text');
    const r = eingefuegt(doc, 2, { type: 'line', labels: 'Monat', values: ['Ausgaben'] });
    const b = findChartBlockAtLine(r.text, 10);
    expect(resolveTableInDocument(r.text, r.name)).toMatchObject({ status: 'found', openLine: 1 });
    const bild = buildChartInput(r.text, b.body);
    expect(bild).toMatchObject({ drawable: true, type: 'line' });
    expect(bild.series).toEqual([{ name: 'Ausgaben', values: [80, 95, 70] }]);
  });

  it('AK10: trägt die Tabelle einen Namen, nennt das Diagramm ihn, und die Tabelle bleibt byte-gleich', () => {
    const vorher = zeilen('Vorwort', '', TABELLE, '', '^umsatz');
    const doc = zeilen(vorher, 'Danach');
    const r = eingefuegt(doc, 4);
    expect(r.name).toBe('umsatz');
    expect(r.text.startsWith(vorher + '\n')).toBe(true);
    expect(r.text).toBe(
      zeilen(
        vorher,
        '',
        chartBlock('table: umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen, Ausgaben'),
        '',
        'Danach',
      ),
    );
    expect(extractBlockAnchors(r.text).order).toEqual(['umsatz']);
  });

  // 4T-002072: Kopf-Name.
  it('AK10: ein Kopf-Name wird genannt, die Tabelle bleibt byte-gleich, der Block steht nach dem Schluss-Zaun', () => {
    const vorher = zeilen('Vorwort', '', benannt('Umsatz'));
    const r = eingefuegt(zeilen(vorher, '', 'Danach'), 5);
    expect(r.name).toBe('Umsatz');
    expect(r.changes).toHaveLength(1);
    expect(r.text).toBe(
      zeilen(
        vorher,
        '',
        chartBlock('table: Umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen, Ausgaben'),
        '',
        'Danach',
      ),
    );
    expect(resolveTableInDocument(r.text, 'Umsatz')).toMatchObject({
      status: 'found',
      openLine: 3,
    });
  });

  it('Kopf-Name und alte Zeile darunter: der Block folgt der alten Zeile, die bei ihrer Tabelle bleibt', () => {
    const vorher = zeilen(benannt('Umsatz'), '', '^umsatz');
    const r = eingefuegt(zeilen(vorher, 'Danach'), 1);
    expect(r.name).toBe('Umsatz');
    expect(r.text.startsWith(vorher + '\n\n' + `${Z}perspective-chart`)).toBe(true);
    expect(r.text.endsWith(`${Z}\n\nDanach`)).toBe(true);
  });

  it('blockFrom ist der Anfang der Öffner-Zeile des neuen Blocks im neuen Text', () => {
    const faelle = [
      [zeilen('Text', '', TABELLE, '', 'Ende'), 3, ''],
      [zeilen(benannt('Umsatz'), '', 'Ende'), 1, ''],
      [zeilen(TABELLE, '^alt', 'Ende'), 1, ''],
      [
        zeilen(
          '- Punkt',
          '',
          TABELLE.map((z) => '  ' + z),
        ),
        3,
        '  ',
      ],
      [zeilen(TABELLE, '', 'Ende').replace(/\n/g, '\r\n'), 1, ''],
    ];
    for (const [doc, zeile, einrueckung] of faelle) {
      const r = eingefuegt(doc, zeile);
      expect(r.text.slice(r.blockFrom).startsWith(`${einrueckung}${Z}perspective-chart`), doc).toBe(
        true,
      );
      expect(r.text[r.blockFrom - 1], doc).toBe('\n');
    }
  });

  it('AK20: ein zweites Diagramm nennt denselben Namen und steht vor dem vorhandenen', () => {
    const doc = zeilen(TABELLE, '^umsatz');
    const erstes = eingefuegt(doc, 1);
    const zweites = eingefuegt(erstes.text, 1, {
      type: 'pie',
      labels: 'Monat',
      values: ['Ausgaben'],
    });
    expect(zweites.name).toBe('umsatz');
    expect(zweites.text).toBe(
      zeilen(
        TABELLE,
        '^umsatz',
        '',
        chartBlock('table: umsatz', 'type: pie', 'labels: Monat', 'values: Ausgaben'),
        '',
        chartBlock('table: umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen, Ausgaben'),
      ),
    );
    expect(extractBlockAnchors(zweites.text).order).toEqual(['umsatz']);
  });

  it('AK20: auch nach einem ersten Diagramm mit vergebenem Namen entsteht kein zweiter', () => {
    const erstes = eingefuegt(zeilen(TABELLE, '', 'Text'), 1);
    const zweites = eingefuegt(erstes.text, 1);
    expect(erstes.name).toBe('tabelle-1');
    expect(zweites.name).toBe('tabelle-1');
    expect(extractBlockAnchors(zweites.text).order).toEqual(['tabelle-1']);
  });

  it('AK21: trägt das Dokument schon `^tabelle-1`, erhält die nächste Tabelle `tabelle-2`', () => {
    const doc = zeilen(TABELLE, '^tabelle-1', '', TABELLE, '', 'Ende');
    const r = eingefuegt(doc, 10);
    expect(r.name).toBe('tabelle-2');
    expect(resolveTableInDocument(r.text, 'tabelle-2')).toMatchObject({ openLine: 9 });
    expect(resolveTableInDocument(r.text, 'tabelle-1')).toMatchObject({ openLine: 1 });
    const dritte = eingefuegt(zeilen(r.text, '', TABELLE), r.text.split('\n').length + 3);
    expect(dritte.name).toBe('tabelle-3');
  });

  it('AK18: Kopf-Zeile und Block stehen in einer Liste, in Textfolge', () => {
    const doc = zeilen(TABELLE);
    const r = eingefuegt(doc, 1);
    const zweiteZeile = doc.indexOf('\n') + 1;
    expect(r.changes).toHaveLength(2);
    expect(r.changes[0]).toEqual({
      from: zweiteZeile,
      to: zweiteZeile,
      insert: 'table: tabelle-1\n',
    });
    expect(r.changes[1].from).toBe(doc.length);
    expect(r.changes[1].insert).toContain('perspective-chart');
    expect(r.changes[1].insert).not.toContain('^tabelle-1');
  });

  it('Rundlauf: die geschriebene Kopf-Zeile liest der Parser als Namen, fehlerfrei', () => {
    const r = eingefuegt(zeilen(TABELLE, '', 'Text'), 1);
    const model = parsePerspectiveDatatable(findDatatableAtLine(r.text, 1).body);
    expect(model.errors).toEqual([]);
    expect(model.name).toBe('tabelle-1');
  });

  it('ungültiger Kopf-Name: die Tabelle ist fehlerhaft, nichts wird geschrieben', () => {
    for (const wert of ['a b', '', '^x']) {
      expect(buildInsertChanges(zeilen(benannt(wert)), 1, ANGABEN), wert).toEqual({
        ok: false,
        grund: 'table-invalid',
      });
    }
  });

  it('AK11: das Berechnen schreibt nichts und reserviert keinen Namen', () => {
    const doc = zeilen(TABELLE, '', 'Text');
    const kopie = String(doc);
    buildInsertChanges(doc, 1, ANGABEN);
    expect(doc).toBe(kopie);
    expect(nextFreeTableName(doc)).toBe('tabelle-1');
    expect(buildInsertChanges(doc, 1, ANGABEN).name).toBe('tabelle-1');
  });

  it('Dokument-Ende ohne und mit abschließendem Zeilenumbruch', () => {
    const ohne = zeilen(TABELLE);
    expect(eingefuegt(ohne, 1).text).toBe(zeilen(benannt('tabelle-1'), '', DIAGRAMM_1));
    const mit = zeilen(TABELLE) + '\n';
    expect(eingefuegt(mit, 1).text).toBe(zeilen(benannt('tabelle-1'), '', DIAGRAMM_1) + '\n');
  });

  it('folgt direkt Inhalt, trennt eine Leerzeile auch danach', () => {
    const r = eingefuegt(zeilen(TABELLE, '^umsatz', 'Direkt danach'), 1);
    expect(r.text.endsWith(`${Z}\n\nDirekt danach`)).toBe(true);
  });

  it('CRLF: alle neuen Zeilen tragen das Zeilenende des Dokuments', () => {
    const doc = zeilen(TABELLE, '', 'Text').replace(/\n/g, '\r\n');
    const r = eingefuegt(doc, 1);
    expect(r.text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(r.text).toBe(
      zeilen(benannt('tabelle-1'), '', DIAGRAMM_1, '', 'Text').replace(/\n/g, '\r\n'),
    );
  });

  it('längerer Zaun der Tabelle und Tabelle in einer Liste (Einrückung des Zauns)', () => {
    const lang = zeilen(['````perspective-datatable', ...TABELLE.slice(1, -1), '````']);
    expect(eingefuegt(lang, 1).name).toBe('tabelle-1');
    const liste = zeilen(
      '- Punkt',
      '',
      TABELLE.map((z) => '  ' + z),
      '',
      '- weiter',
    );
    const r = eingefuegt(liste, 4);
    expect(r.text).toContain(`\n  ${Z}perspective-datatable\n  table: tabelle-1\n  columns:`);
    expect(r.text).toContain(`\n  ${Z}\n\n  ${Z}perspective-chart\n  table: tabelle-1\n`);
    expect(r.text).not.toContain('^tabelle-1');
    expect(resolveTableInDocument(r.text, 'tabelle-1')).toMatchObject({ status: 'found' });
    expect(findChartBlockAtLine(r.text, 12)).toMatchObject({ indent: 2 });
  });

  it('Name doppelt: steht derselbe Name weiter oben, wird nichts geschrieben', () => {
    const doc = zeilen('Absatz ^umsatz', '', TABELLE, '^umsatz');
    expect(buildInsertChanges(doc, 3, ANGABEN)).toEqual({ ok: false, grund: 'name-not-unique' });
    // Auch wenn der erste Träger selbst eine Datentabelle ist: Der Name träfe sie.
    const zwei = zeilen(TABELLE, '^umsatz', '', TABELLE, '^umsatz');
    expect(buildInsertChanges(zwei, 1, ANGABEN).ok).toBe(true);
    expect(buildInsertChanges(zwei, 10, ANGABEN)).toEqual({ ok: false, grund: 'name-not-unique' });
  });

  // 4T-002072, Grenzfall 5: derselbe Kopf-Name an zwei Tabellen.
  it('Name doppelt als Kopf-Name: an der zweiten Tabelle wird nichts geschrieben', () => {
    const zwei = zeilen(benannt('Umsatz'), '', benannt('Umsatz'));
    expect(buildInsertChanges(zwei, 1, ANGABEN).ok).toBe(true);
    expect(buildInsertChanges(zwei, 9, ANGABEN)).toEqual({ ok: false, grund: 'name-not-unique' });
    const absatz = zeilen('Absatz ^Umsatz', '', benannt('Umsatz'));
    expect(buildInsertChanges(absatz, 3, ANGABEN)).toEqual({
      ok: false,
      grund: 'name-not-unique',
    });
  });

  // Durchsicht vom 2026-09-30 (K2): Hinter einer Zeile mit Backticks im
  // Fließtext sah die Anker-Erkennung keinen Anker mehr; das Einfügen meldete
  // deshalb fälschlich «Name nicht eindeutig».
  it('hinter einer Zeile mit Backticks oder einem längeren Zaun: Einfügen gelingt', () => {
    for (const vorspann of [
      `${Z}inline${Z} am Zeilenanfang`,
      // Längerer Zaun um einen inneren Öffner ohne eigenen Schluss.
      zeilen('````markdown', `${Z}js`, 'x', '````'),
    ]) {
      const doc = zeilen(vorspann, '', TABELLE, '', 'Text');
      const zeile = doc.split('\n').indexOf(`${Z}perspective-datatable`) + 1;
      const r = eingefuegt(doc, zeile);
      expect(r.name).toBe('tabelle-1');
      expect(resolveTableInDocument(r.text, 'tabelle-1')).toMatchObject({ status: 'found' });
    }
  });

  it('findet die Anker-Erkennung den geschriebenen Namen gar nicht: name-unresolved', () => {
    // Die Datentabelle im Vorspann findet die Fence-Suche; der Name darunter
    // stünde im Vorspann, wo kein Anker zählt.
    const doc = zeilen('---', TABELLE, '---', 'Text');
    expect(findDatatableAtLine(doc, 2)).not.toBeNull();
    expect(buildInsertChanges(doc, 2, ANGABEN)).toEqual({ ok: false, grund: 'name-unresolved' });
  });

  it('keine Datentabelle an der Zeile: Pipe-Tabelle, Perspective Table, Text, Zitat', () => {
    const doc = zeilen(
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      `${Z}perspective-table`,
      '| a |',
      Z,
      '',
      '> ' + TABELLE.join('\n> '),
    );
    for (const zeile of [1, 3, 6, 10, 12]) {
      expect(buildInsertChanges(doc, zeile, ANGABEN)).toEqual({ ok: false, grund: 'no-datatable' });
    }
  });

  it('offener Zaun, fehlerhafte Tabelle und Änderung seit dem Öffnen: nichts wird geschrieben', () => {
    expect(buildInsertChanges(zeilen(TABELLE.slice(0, -1)), 1, ANGABEN).grund).toBe(
      'table-unclosed',
    );
    const kaputt = zeilen(`${Z}perspective-datatable`, 'columns: A:unbekannt', '| x |', Z);
    expect(buildInsertChanges(kaputt, 1, ANGABEN).grund).toBe('table-invalid');
    const doc = zeilen(TABELLE);
    const stand = findDatatableAtLine(doc, 1).body;
    expect(buildInsertChanges(doc, 1, ANGABEN, stand).ok).toBe(true);
    const geaendert = doc.replace('| 100 |', '| 101 |');
    expect(buildInsertChanges(geaendert, 1, ANGABEN, stand)).toEqual({
      ok: false,
      grund: 'changed-meanwhile',
    });
  });
});

describe('chart-edit — Bearbeiten (AK8, AK12, AK13, AK14, AK19)', () => {
  const BLOCK = chartBlock(
    'table: ^umsatz',
    'type: bar',
    'color: rot',
    'labels: Monat',
    '# eine Notiz',
    'values: Einnahmen, Ausgaben',
    'type: line',
  );
  const DOK = zeilen(TABELLE, '^umsatz', '', BLOCK, '', 'Ende');
  const ZEILE = 10;

  function bearbeitet(doc, zeile, aendern) {
    const b = findChartBlockAtLine(doc, zeile);
    const spec = parseChartSpec(b.body);
    const r = buildEditChanges(doc, zeile, aendern(spec), b.body);
    expect(r.ok, r.grund).toBe(true);
    return { ...r, block: b, text: applyChanges(doc, r.changes) };
  }

  it('AK8/AK14: geänderte Angaben stehen im Block, unbekannte Zeilen bleiben samt Reihenfolge', () => {
    const r = bearbeitet(DOK, ZEILE, (s) => ({ ...s, type: 'pie', values: ['Ausgaben'] }));
    expect(r.text).toBe(
      zeilen(
        TABELLE,
        '^umsatz',
        '',
        chartBlock(
          'table: ^umsatz',
          'type: pie',
          'color: rot',
          'labels: Monat',
          '# eine Notiz',
          'values: Ausgaben',
          'type: line',
        ),
        '',
        'Ende',
      ),
    );
    const neu = findChartBlockAtLine(r.text, ZEILE);
    expect(buildChartInput(r.text, neu.body)).toMatchObject({ drawable: true, type: 'pie' });
  });

  it('AK13: Tabelle, Name und alles außerhalb des Block-Inhalts bleiben byte-gleich; `table:` bleibt', () => {
    const r = bearbeitet(DOK, ZEILE, (s) => ({ ...s, table: '^anders', title: 'Neu' }));
    const { bodyFrom, bodyTo } = r.block;
    expect(r.changes).toEqual([{ from: bodyFrom, to: bodyTo, insert: expect.any(String) }]);
    expect(r.text.slice(0, bodyFrom)).toBe(DOK.slice(0, bodyFrom));
    expect(r.text.endsWith(DOK.slice(bodyTo))).toBe(true);
    expect(r.changes[0].insert.startsWith('table: ^umsatz\n')).toBe(true);
  });

  it('AK13: die Angabe einer Tabelle in einem anderen Dokument bleibt im Wortlaut', () => {
    const doc = zeilen(chartBlock('table:  [[Bericht#^umsatz]]', 'type: bar', 'labels: Monat'));
    const r = bearbeitet(doc, 2, (s) => ({ ...s, type: 'line' }));
    expect(r.text).toBe(
      zeilen(chartBlock('table:  [[Bericht#^umsatz]]', 'type: line', 'labels: Monat')),
    );
  });

  it('AK12: ein unveränderter Formular-Stand schreibt nichts, auch bei anderer Schreibweise im Block', () => {
    const doc = zeilen(
      TABELLE,
      '^umsatz',
      '',
      chartBlock(
        'table: ^umsatz',
        'type: Bar',
        'labels: monat',
        'values: ausgaben ,Einnahmen',
        'title: T',
      ),
    );
    const b = findChartBlockAtLine(doc, 10);
    const spec = parseChartSpec(b.body);
    const offer = buildChartOffer(parsePerspectiveDatatable(findDatatableAtLine(doc, 1).body));
    const form = editFormFromSpec(offer, spec);
    expect(buildEditChanges(doc, 10, chartSpecFromForm(form, spec), b.body)).toEqual({
      ok: true,
      changes: [],
    });
  });

  it('Richtungs-Wechsel: Spalten -> Zeilen entfernt `values`, zurück entfernt `rows`', () => {
    const doc = zeilen(
      TABELLE,
      '^umsatz',
      '',
      chartBlock('table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen'),
    );
    const offer = buildChartOffer(parsePerspectiveDatatable(findDatatableAtLine(doc, 1).body));
    const b = findChartBlockAtLine(doc, 10);
    const spec = parseChartSpec(b.body);
    const form = editFormFromSpec(offer, spec);
    const zeilenForm = updateChartForm(offer, form, { series: 'rows' });
    const r1 = buildEditChanges(doc, 10, chartSpecFromForm(zeilenForm, spec), b.body);
    const t1 = applyChanges(doc, r1.changes);
    expect(findChartBlockAtLine(t1, 10).body).toBe(
      'table: ^umsatz\ntype: bar\nlabels: Monat\nseries: rows\nrows: Januar, Februar, März\n',
    );
    const b2 = findChartBlockAtLine(t1, 10);
    const spec2 = parseChartSpec(b2.body);
    const zurueck = updateChartForm(offer, editFormFromSpec(offer, spec2), { series: 'columns' });
    const t2 = applyChanges(
      t1,
      buildEditChanges(t1, 10, chartSpecFromForm(zurueck, spec2), b2.body).changes,
    );
    expect(findChartBlockAtLine(t2, 10).body).toBe(
      'table: ^umsatz\ntype: bar\nlabels: Monat\nseries: columns\nvalues: Einnahmen, Ausgaben\n',
    );
  });

  it('CRLF: unveränderte Zeilen byte-gleich, neue mit CRLF; auch im leeren Block', () => {
    const doc = zeilen(
      TABELLE,
      '^umsatz',
      '',
      chartBlock('table: ^umsatz', 'x: 1', 'labels: Monat'),
    ).replace(/\n/g, '\r\n');
    const r = bearbeitet(doc, 10, (s) => ({ ...s, type: 'bar', values: ['Ausgaben'] }));
    expect(r.changes[0].insert).toBe(
      'table: ^umsatz\r\nx: 1\r\nlabels: Monat\r\ntype: bar\r\nvalues: Ausgaben\r\n',
    );
    const leer = zeilen(`${Z}perspective-chart`, Z).replace(/\n/g, '\r\n');
    const r2 = bearbeitet(leer, 1, (s) => ({ ...s, type: 'bar' }));
    expect(r2.text).toBe(`${Z}perspective-chart\r\ntype: bar\r\n${Z}`);
  });

  it('eingerückter Block: neue Zeilen erhalten die Einrückung des Zauns, bewahrte bleiben', () => {
    const doc = zeilen(
      '- Punkt',
      '',
      `  ${Z}perspective-chart`,
      '  table: ^t',
      '   color: rot',
      `  ${Z}`,
    );
    const r = bearbeitet(doc, 4, (s) => ({ ...s, type: 'line' }));
    expect(r.text).toBe(
      zeilen(
        '- Punkt',
        '',
        `  ${Z}perspective-chart`,
        '  table: ^t',
        '   color: rot',
        '  type: line',
        `  ${Z}`,
      ),
    );
  });

  it('kein Block, offener Zaun, Änderung seit dem Öffnen: nichts wird geschrieben', () => {
    expect(buildEditChanges(DOK, 2, { type: 'bar' })).toEqual({ ok: false, grund: 'no-chart' });
    const offen = zeilen(`${Z}perspective-chart`, 'table: ^t');
    expect(buildEditChanges(offen, 2, { type: 'bar' }).grund).toBe('chart-unclosed');
    const stand = findChartBlockAtLine(DOK, ZEILE).body;
    const geaendert = DOK.replace('color: rot', 'color: blau');
    expect(buildEditChanges(geaendert, ZEILE, parseChartSpec(stand), stand)).toEqual({
      ok: false,
      grund: 'changed-meanwhile',
    });
  });

  it('jeder Grund stammt aus der festen Liste', () => {
    const gruende = [
      buildInsertChanges('Text', 1, ANGABEN).grund,
      buildInsertChanges(zeilen(TABELLE.slice(0, -1)), 1, ANGABEN).grund,
      buildEditChanges('Text', 1, {}).grund,
    ];
    for (const g of gruende) expect(CHART_EDIT_REASONS).toContain(g);
  });
});
