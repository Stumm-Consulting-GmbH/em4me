// 4T-002021 (Epic 3E-000192): Die Brücken-Funktion der Diagramme
// (src/main/preload-diagramme.js) — die Weiche zwischen den drei Ergebnis-Arten
// und die Übergabe der Angaben der Ansicht an den Zeichner.
//
// Geprüft wird die Funktion selbst, ohne Electron; die Brücke ist ein
// einfaches Objekt. Der Prüffall lädt über den Zeichner den erzeugten Stand der
// Zeichen-Bibliothek (scripts/build-echarts.js) und steht deshalb im Ausschnitt
// von Ä5 wie der Prüffall des Zeichners.
import { describe, it, expect } from 'vitest';
import { buildChart, diagrammeBruecke } from '../../src/main/preload-diagramme.js';
import {
  DARK_CHART_PALETTE,
  LIGHT_CHART_PALETTE,
} from '../../src/shared/charts/chart-call-options.js';

const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen:number, Ausgaben:number, Saldo:number = Einnahmen - Ausgaben',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    |     | 70 |',
  '```',
  '^umsatz',
].join('\n');

const BAR = ['table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen, Ausgaben'].join(
  '\n',
);

const TEXTE = {
  line: 'Liniendiagramm mit {series} und {categories}',
  bar: 'Balkendiagramm mit {series} und {categories}',
  pie: 'Kreisdiagramm mit {series} und {categories}',
  donut: 'Donut-Diagramm mit {series} und {categories}',
  seriesOne: '1 Datenreihe',
  seriesOther: '{n} Datenreihen',
  categoriesOne: '1 Rubrik',
  categoriesOther: '{n} Rubriken',
};

function dokument(...teile) {
  return teile.join('\n\n');
}

function chart(body) {
  return '```perspective-chart\n' + body + '\n```';
}

describe('Brücke der Diagramme: Ergebnis-Arten (4T-002021, D2)', () => {
  // 4T-002024: dazu die beiden Hörer der Einträge im Untermenü «Ansicht →
  // Diagramm»; ihr Kanal ist in test/unit/diagramm-menue-ort.test.js geprüft.
  it('die Brücke bietet buildChart, seit 4T-002023 das Lesen des anderen Dokuments und seit 4T-002024 die beiden Menü-Hörer', () => {
    expect(Object.keys(diagrammeBruecke({ invoke: () => {} }))).toEqual([
      'buildChart',
      'readChartTableDocument',
      'onMenuChartInsert',
      'onMenuChartEdit',
    ]);
  });

  it('zeichenbar: Grafik, Art, Zahl der Reihen und Rubriken, ausgelassene Werte', () => {
    const erg = buildChart(dokument(TABELLE, chart(BAR)), BAR, {
      idPrefix: 'ch-p0-0',
      descriptionTexts: TEXTE,
    });
    expect(erg.status).toBe('drawn');
    expect(erg.type).toBe('bar');
    expect(erg.seriesCount).toBe(2);
    expect(erg.categoryCount).toBe(3);
    // Die leere Zelle ist eine Lücke und wird gezählt.
    expect(erg.omitted).toBe(1);
    expect(erg.svg.startsWith('<svg')).toBe(true);
    expect(erg.svg).toContain('id="ch-p0-0-desc"');
    expect(erg.svg).toContain('Balkendiagramm mit 2 Datenreihen und 3 Rubriken');
  });

  it('Einzahl in der Vorlese-Beschreibung (D8)', () => {
    const body = ['table: ^umsatz', 'type: pie', 'labels: Monat', 'values: Ausgaben'].join('\n');
    const erg = buildChart(dokument(TABELLE, chart(body)), body, { descriptionTexts: TEXTE });
    expect(erg.svg).toContain('Kreisdiagramm mit 1 Datenreihe und 3 Rubriken');
  });

  it('nicht zeichenbar: Grund und Anlass als Kennungen, keine Grafik', () => {
    const body = BAR.replace('^umsatz', '^fehlt');
    expect(buildChart(dokument(TABELLE, chart(body)), body)).toEqual({
      status: 'undrawable',
      reason: 'table-missing',
      detail: 'fehlt',
      missingKey: null,
      tableName: 'fehlt',
      file: null,
    });
    const leer = 'table: ^umsatz';
    expect(buildChart(dokument(TABELLE, chart(leer)), leer)).toMatchObject({
      status: 'undrawable',
      reason: 'selection-invalid',
      detail: null,
      missingKey: 'labels',
      tableName: 'umsatz',
    });
  });

  it('nicht zeichenbar: fehlende Angabe und beanstandete Nennung in getrennten Feldern (4T-002022)', () => {
    // Eine Spalte, die selbst `labels` heißt und fehlt: Nennung, keine Angabe.
    const spalte = BAR.replace('labels: Monat', 'labels: labels');
    expect(buildChart(dokument(TABELLE, chart(spalte)), spalte)).toMatchObject({
      status: 'undrawable',
      reason: 'selection-invalid',
      detail: 'labels',
      missingKey: null,
    });
    const ohneWerte = ['table: ^umsatz', 'type: bar', 'labels: Monat'].join('\n');
    expect(buildChart(dokument(TABELLE, chart(ohneWerte)), ohneWerte)).toMatchObject({
      status: 'undrawable',
      reason: 'selection-invalid',
      detail: null,
      missingKey: 'values',
    });
  });

  it('nicht zeichenbar: der genannte Name für den Hinweis (4T-002022), null ohne lesbare Angabe', () => {
    const anderer = BAR.replace('labels: Monat', 'labels: Tag');
    expect(buildChart(dokument(TABELLE, chart(anderer)), anderer)).toMatchObject({
      reason: 'selection-invalid',
      tableName: 'umsatz',
      file: null,
    });
    // 4T-002072: `table: umsatz` ohne Dach-Zeichen nennt die Tabelle seither;
    // unlesbar ist ein Name, der keine gültige Kennung ist.
    const ohne = BAR.replace('^umsatz', 'Umsatz 2026');
    expect(buildChart(dokument(TABELLE, chart(ohne)), ohne)).toMatchObject({
      reason: 'table-missing',
      detail: 'Umsatz 2026',
      tableName: null,
      file: null,
    });
  });

  it('anderes Dokument: Zwischen-Ergebnis mit dem Ziel, ohne Grafik', () => {
    const body = BAR.replace('^umsatz', '[[Bericht#^umsatz]]');
    expect(buildChart(dokument(TABELLE, chart(body)), body)).toEqual({
      status: 'pending',
      target: { file: 'Bericht', name: 'umsatz' },
    });
  });

  it('der geschriebene Text ist die Quelle: eine geänderte Zelle ändert die Grafik', () => {
    const vorher = buildChart(dokument(TABELLE, chart(BAR)), BAR, { idPrefix: 'a' });
    const geaendert = TABELLE.replace('| Januar  | 100 |', '| Januar  | 400 |');
    const nachher = buildChart(dokument(geaendert, chart(BAR)), BAR, { idPrefix: 'a' });
    expect(nachher.svg).not.toBe(vorher.svg);
    // Und zurück: derselbe Text ergibt dieselbe Grafik (Rückgängig).
    expect(buildChart(dokument(TABELLE, chart(BAR)), BAR, { idPrefix: 'a' }).svg).toBe(vorher.svg);
  });

  it('eine berechnete Spalte folgt ihrer Eingangs-Spalte (AK5)', () => {
    const body = ['table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Saldo'].join('\n');
    const vorher = buildChart(dokument(TABELLE, chart(body)), body, { idPrefix: 'a' });
    const geaendert = TABELLE.replace('| Februar | 90  | 95 |', '| Februar | 900 | 95 |');
    const nachher = buildChart(dokument(geaendert, chart(body)), body, { idPrefix: 'a' });
    expect(vorher.status).toBe('drawn');
    expect(nachher.svg).not.toBe(vorher.svg);
  });
});

// 4T-002023 (Epic 3E-000192, Story 4S-001023): Die Tabelle in einem anderen
// Dokument. Der Anzeige-Prozess reicht die Antwort des Lese-Kanals als vierten
// Wert herein; die Weiche bleibt hier.
describe('Brücke der Diagramme: Tabelle in einem anderen Dokument (4T-002023)', () => {
  const ANDERES = BAR.replace('^umsatz', '[[Bericht#^umsatz]]');
  const EIGENES = dokument('# B', chart(ANDERES));

  it('ohne Antwort des Kanals bleibt es beim Zwischen-Ergebnis', () => {
    expect(buildChart(EIGENES, ANDERES, {}).status).toBe('pending');
    expect(buildChart(EIGENES, ANDERES, {}, null).status).toBe('pending');
  });

  it('mit dem Text des anderen Dokuments: gezeichnet wie im eigenen (AK1)', () => {
    const antwort = { ok: true, path: '/x/Bericht.md', content: TABELLE, quelle: 'platte' };
    const erg = buildChart(EIGENES, ANDERES, { idPrefix: 'a', descriptionTexts: TEXTE }, antwort);
    const eigenes = buildChart(dokument(TABELLE, chart(BAR)), BAR, {
      idPrefix: 'a',
      descriptionTexts: TEXTE,
    });
    expect(erg.status).toBe('drawn');
    expect(erg.svg).toBe(eigenes.svg);
    expect(erg.omitted).toBe(1);
  });

  it('der Name wird nach der Regel des Kerns gesucht: ein Vorkommen im Code-Block zählt nicht', () => {
    const codeBeispiel = ['```text', 'Beispiel ^umsatz', '```'].join('\n');
    const antwort = { ok: true, content: dokument(codeBeispiel, TABELLE) };
    expect(buildChart(EIGENES, ANDERES, {}, antwort).status).toBe('drawn');
  });

  it('jede Antwort ohne Text ist der Grund «Dokument fehlt» samt Namen (AK8)', () => {
    for (const antwort of [
      { ok: false, error: 'not found', path: '/x/Bericht.md' },
      { ok: false, error: 'too large' },
      { ok: false, error: 'unreadable' },
      { ok: false, error: 'area-link' },
      { ok: true },
    ]) {
      expect(buildChart(EIGENES, ANDERES, {}, antwort)).toEqual({
        status: 'undrawable',
        reason: 'document-missing',
        detail: 'Bericht',
        missingKey: null,
        tableName: 'umsatz',
        file: 'Bericht',
      });
    }
  });

  it('das andere Dokument trägt keine Datentabelle dieses Namens: «Tabelle fehlt» (AK8)', () => {
    const antwort = { ok: true, content: '# Bericht\n\nKeine Tabelle hier.\n' };
    expect(buildChart(EIGENES, ANDERES, {}, antwort)).toEqual({
      status: 'undrawable',
      reason: 'table-missing',
      detail: 'umsatz',
      missingKey: null,
      tableName: 'umsatz',
      file: 'Bericht',
    });
  });

  it('die Antwort wirkt nur auf einen Block, der ein anderes Dokument nennt', () => {
    const antwort = { ok: true, content: 'FREMD' };
    const erg = buildChart(dokument(TABELLE, chart(BAR)), BAR, { idPrefix: 'a' }, antwort);
    expect(erg.status).toBe('drawn');
  });

  it('die Brücke ruft den Kanal mit Bezugs-Pfad und geschriebenem Namen', async () => {
    const aufrufe = [];
    const ipc = { invoke: async (...args) => (aufrufe.push(args), { ok: true }) };
    expect(await diagrammeBruecke(ipc).readChartTableDocument('/x/B.md', 'Bericht')).toEqual({
      ok: true,
    });
    expect(aufrufe).toEqual([
      ['chart:readTableDocument', { basePath: '/x/B.md', file: 'Bericht' }],
    ]);
  });
});

describe('Brücke der Diagramme: Angaben der Ansicht (4T-002021, D6)', () => {
  it('Farben und Palette gehen unverändert an den Zeichner', () => {
    const hell = buildChart(dokument(TABELLE, chart(BAR)), BAR);
    expect(hell.svg).toContain(`fill="${LIGHT_CHART_PALETTE[0]}"`);
    const dunkel = buildChart(dokument(TABELLE, chart(BAR)), BAR, {
      colors: {
        text: '#e6e6e6',
        muted: '#9d9d9d',
        background: 'transparent',
        palette: [...DARK_CHART_PALETTE],
      },
    });
    expect(dunkel.svg).toContain(`fill="${DARK_CHART_PALETTE[0]}"`);
    expect(dunkel.svg).toContain('fill="#9d9d9d"');
    expect(dunkel.svg).not.toContain(`fill="${LIGHT_CHART_PALETTE[0]}"`);
  });

  it('eine unbrauchbare Angabe der Ansicht ist ein Programmier-Fehler und wirft', () => {
    expect(() =>
      buildChart(dokument(TABELLE, chart(BAR)), BAR, { fontFamily: '"Segoe UI"' }),
    ).toThrow(TypeError);
  });

  it('fehlender Dokument-Text ist kein Absturz, sondern eine fehlende Tabelle', () => {
    expect(buildChart(undefined, BAR)).toMatchObject({
      status: 'undrawable',
      reason: 'table-missing',
    });
  });
});
