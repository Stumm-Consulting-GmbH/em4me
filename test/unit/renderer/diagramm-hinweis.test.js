// @vitest-environment jsdom
// 4T-002022 (Epic 3E-000192): Hinweis an der Stelle eines nicht zeichenbaren
// Diagramms und Zeile der ausgelassenen Werte
// (src/renderer/modules/charts/chart-hint.js, eingehängt in chart-view.js).
//
// Die Gründe kommen aus dem echten Weg: Brücken-Funktion `buildChart`
// (src/main/preload-diagramme.js) und Format-Kern. Gezeichnet wird hier nicht —
// für ein zeichenbares Diagramm liefert die Brücken-Attrappe eine leere Grafik
// mit der Zahl der ausgelassenen Werte aus dem Format-Kern; das Zeichnen selbst
// prüft test/unit/preload-diagramme.test.js. Die Texte kommen aus den
// Fragmenten der fünf Sprachen, der Schritt im Programm liest sie über den
// geladenen Katalog.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';
import deDict from '../../../src/i18n/de.json';
import enDict from '../../../src/i18n/en.json';
import { buildChart } from '../../../src/main/preload-diagramme.js';
import { buildChartInput } from '../../../src/shared/markdown/perspective-chart.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const FRAGMENTE = path.resolve(HIER, '..', '..', '..', 'src', 'i18n', 'fragments');

// Bestands-Lesung im Modulkopf: das Fragment `chart` jeder Sprache.
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const FRAGMENT = Object.fromEntries(
  SPRACHEN.map((code) => [
    code,
    JSON.parse(fs.readFileSync(path.join(FRAGMENTE, code, 'chart.json'), 'utf8')),
  ]),
);
const uebersetzer = (code) => (key) => FRAGMENT[code][key] ?? key;
const de = uebersetzer('de');

const KATALOGE = { de: deDict, en: enDict };
global.fetch = vi.fn(async (url) => {
  const code = /\/([a-z]{2})\.json$/.exec(String(url))[1];
  return { ok: true, json: async () => KATALOGE[code] };
});

// Brücken-Attrappe auf dem echten Weg: nicht zeichenbar wie die Brücke,
// zeichenbar mit leerer Grafik und der Zahl aus dem Format-Kern.
const aufrufe = [];
window.api.buildChart = (text, body, optionen) => {
  aufrufe.push({ text, body, optionen });
  const input = buildChartInput(text, body);
  if (input.drawable) {
    return { status: 'drawn', svg: '<svg role="img"></svg>', omitted: input.omitted };
  }
  return buildChart(text, body);
};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { applyPerspectiveChartsIfPresent } =
  await import('../../../src/renderer/modules/charts/chart-view.js');
const { baueAuslassZeile, baueHinweis, baueHinweisNichtRechtzeitig, hinweisGrund, hinweisText } =
  await import('../../../src/renderer/modules/charts/chart-hint.js');

// --- Prüf-Material ---------------------------------------------------------

function zaun(sprache, ...zeilen) {
  return ['```' + sprache, ...zeilen, '```'].join('\n');
}

const KOPF = 'columns: Monat:text, Einnahmen:number, Ausgaben:number, Notiz:text';
const TABELLE = [
  zaun('perspective-datatable', KOPF, '| Januar | 100 | 80 | a |', '| Februar | 90 | -95 | b |'),
  '^umsatz',
].join('\n');

function dokument(tabelle, body) {
  return ['# Bericht', '', tabelle, '', zaun('perspective-chart', body), ''].join('\n');
}

function angabe(...zeilen) {
  return zeilen.join('\n');
}

// Grund-Text auf dem echten Weg (Brücke) in der gewählten Sprache.
function grundText(tabelle, body, uebersetze = de) {
  const erg = buildChart(dokument(tabelle, body), body);
  expect(erg.status).toBe('undrawable');
  return hinweisText(erg, uebersetze);
}

const BALKEN = angabe('table: ^umsatz', 'type: bar', 'labels: Monat', 'values: Einnahmen');

function container(...bodies) {
  const wurzel = document.createElement('div');
  wurzel.className = 'markdown-body';
  bodies.forEach((body, i) => {
    const block = document.createElement('div');
    block.className = 'perspective-chart';
    block.dataset.chartIndex = String(i);
    block.dataset.chartSource = body;
    wurzel.appendChild(block);
  });
  document.body.appendChild(wurzel);
  return wurzel;
}

beforeEach(async () => {
  aufrufe.length = 0;
  document.body.innerHTML = '';
  if (i18n.getLanguage() !== 'de') await i18n.loadTranslations('de');
});

// --- Gründe ------------------------------------------------------------------

describe('Hinweis je Grund in der festen Reihenfolge (4T-002022, AK1 bis AK8)', () => {
  it('Überschrift des Hinweises', () => {
    const kasten = baueHinweis({ reason: 'no-numbers', detail: null }, de);
    expect(kasten.querySelector('.perspective-chart-hint-title').textContent).toBe(
      'Das Diagramm kann nicht gezeichnet werden',
    );
    expect(kasten.getAttribute('role')).toBe('note');
  });

  it('1 Dokument fehlt: gestellte Auflösung mit dem Grund aus der Auflösung eines anderen Dokuments', () => {
    // Durchgängig entsteht der Grund erst mit der Auflösung in einem anderen
    // Dokument; hier ist sein Ergebnis gestellt.
    const erg = {
      status: 'undrawable',
      reason: 'document-missing',
      detail: 'Bericht',
      tableName: 'umsatz',
      file: 'Bericht',
    };
    expect(hinweisText(erg, de)).toBe('Das Dokument «Bericht» wurde nicht gefunden.');
    // Ohne Feld `file` nennt der Anlass die Datei.
    expect(hinweisText({ reason: 'document-missing', detail: 'Plan' }, de)).toBe(
      'Das Dokument «Plan» wurde nicht gefunden.',
    );
  });

  it('2 Tabelle fehlt: genannter Name kommt nicht vor', () => {
    expect(grundText(TABELLE, BALKEN.replace('^umsatz', '^kosten'))).toBe(
      'Eine Tabelle mit dem Namen «kosten» kommt in diesem Dokument nicht vor.',
    );
  });

  // 4T-002023 (Wortlaut): Zeigt der Bezug auf ein anderes Dokument, nennt der
  // Satz dieses Dokument; «in diesem Dokument» wäre dort falsch.
  it('2 Tabelle fehlt im anderen Dokument: der Satz nennt das andere Dokument', () => {
    const body = BALKEN.replace('^umsatz', '[[Bericht Q3#^kosten]]');
    const anderes = { ok: true, content: dokument(TABELLE, BALKEN) };
    const erg = buildChart(
      ['# Übersicht', '', zaun('perspective-chart', body), ''].join('\n'),
      body,
      undefined,
      anderes,
    );
    expect(erg.status).toBe('undrawable');
    expect(erg.reason).toBe('table-missing');
    expect(hinweisText(erg, de)).toBe(
      'Eine Tabelle mit dem Namen «kosten» kommt im Dokument «Bericht Q3» nicht vor.',
    );
    // Eigenes Dokument: unverändert der Satz «in diesem Dokument».
    expect(grundText(TABELLE, BALKEN.replace('^umsatz', '^kosten'))).toContain(
      'in diesem Dokument',
    );
  });

  // Zwei Platzhalter mit Anwender-Text in einem Satz: Ein eingesetzter Wert wird
  // nicht noch einmal nach Platzhaltern durchsucht.
  it('2 Tabelle fehlt im anderen Dokument: Platzhalter-Zeichen in Name und Datei bleiben Text', () => {
    expect(
      hinweisText({ reason: 'table-missing', tableName: 'x{file}', file: 'A{name}$&B' }, de),
    ).toBe('Eine Tabelle mit dem Namen «x{file}» kommt im Dokument «A{name}$&B» nicht vor.');
  });

  it('2 Tabelle fehlt: keine oder keine lesbare Tabellen-Angabe', () => {
    const erwartet =
      'Das Diagramm nennt keine Tabelle. Erwartet wird die Angabe table mit dem Namen der Datentabelle, zum Beispiel table: Umsatz.';
    expect(grundText(TABELLE, angabe('type: bar', 'labels: Monat', 'values: Einnahmen'))).toBe(
      erwartet,
    );
    // 4T-002072: `table: umsatz` ohne Dach-Zeichen nennt die Tabelle seither;
    // unlesbar ist ein Name, der keine gültige Kennung ist.
    expect(grundText(TABELLE, BALKEN.replace('^umsatz', 'Umsatz 2026'))).toBe(erwartet);
  });

  it('3 Tabelle anderer Art: gewöhnliche Tabelle, Perspective Table und Absatz', () => {
    const erwartet =
      'Der Name «umsatz» gehört nicht zu einer Datentabelle. Ein Diagramm zeigt nur die Werte einer Datentabelle.';
    const pipe = '| Monat | Einnahmen |\n|---|---|\n| Januar | 100 |\n^umsatz';
    const ptable =
      zaun('perspective-table', '| Monat | Einnahmen |', '| Januar | 100 |') + '\n^umsatz';
    const absatz = 'Ein Absatz mit Namen ^umsatz';
    for (const tabelle of [pipe, ptable, absatz]) expect(grundText(tabelle, BALKEN)).toBe(erwartet);
  });

  it('4 Tabelle fehlerhaft: Aufbau-Fehler mit Werten und ohne erkannte Spalten (AK4, AK19)', () => {
    const erwartet =
      'Die Datentabelle «umsatz» meldet einen Fehler in ihrem Aufbau. Das Diagramm erscheint, sobald der Fehler in der Tabelle behoben ist.';
    // Eine Datenzeile mit einer Zelle zu viel: Die Datentabelle zeigt die
    // Meldung und daneben weiter ihre Werte.
    const zuViel = TABELLE.replace('| Januar | 100 | 80 | a |', '| Januar | 100 | 80 | a | x |');
    expect(buildChart(dokument(zuViel, BALKEN), BALKEN)).toMatchObject({
      reason: 'table-invalid',
      detail: 'rowCellCount',
      tableName: 'umsatz',
    });
    expect(grundText(zuViel, BALKEN)).toBe(erwartet);
    const ohneSpalten = TABELLE.replace(KOPF, 'spalten: Monat');
    expect(grundText(ohneSpalten, BALKEN)).toBe(erwartet);
    // Behoben: Das Diagramm ist wieder zeichenbar.
    expect(buildChartInput(dokument(TABELLE, BALKEN), BALKEN).drawable).toBe(true);
  });

  it('5 Spalte oder Zeile fehlt oder ist mehrdeutig: Nennung', () => {
    expect(grundText(TABELLE, BALKEN.replace('values: Einnahmen', 'values: Umsatz'))).toBe(
      'Die Spalte oder Zeile «Umsatz» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
    const zeilen = angabe('table: ^umsatz', 'type: bar', 'series: rows', 'labels: Monat');
    expect(grundText(TABELLE, `${zeilen}\nrows: Mai`)).toBe(
      'Die Spalte oder Zeile «Mai» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
    const doppelt = TABELLE.replace('| Februar |', '| Januar |');
    expect(grundText(doppelt, `${zeilen}\nrows: Januar`)).toBe(
      'Die Spalte oder Zeile «Januar» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
  });

  it('5 Spalte oder Zeile fehlt: fehlende oder unbekannte Angabe des Diagramms', () => {
    const satz = (a) => `Im Diagramm fehlt die Angabe ${a} oder ihr Wert ist unbekannt.`;
    expect(grundText(TABELLE, angabe('table: ^umsatz', 'type: bar', 'values: Einnahmen'))).toBe(
      satz('labels'),
    );
    expect(grundText(TABELLE, angabe('table: ^umsatz', 'type: bar', 'labels: Monat'))).toBe(
      satz('values'),
    );
    expect(
      grundText(TABELLE, angabe('table: ^umsatz', 'type: bar', 'series: rows', 'labels: Monat')),
    ).toBe(satz('rows'));
    expect(grundText(TABELLE, `${BALKEN}\nseries: schräg`)).toBe(satz('series'));
  });

  it('5 eine fehlende Spalte namens labels ergibt den Satz mit der Spalte, nicht den der Angabe', () => {
    // Entschieden wird allein am Feld missingKey, nie am Inhalt von detail.
    expect(grundText(TABELLE, BALKEN.replace('labels: Monat', 'labels: labels'))).toBe(
      'Die Spalte oder Zeile «labels» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
    expect(grundText(TABELLE, BALKEN.replace('values: Einnahmen', 'values: values'))).toBe(
      'Die Spalte oder Zeile «values» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
    expect(
      hinweisGrund({ reason: 'selection-invalid', detail: null, missingKey: 'values' }),
    ).toEqual({ key: 'chart.hint.reason.selectionKeyMissing', werte: { key: 'values' } });
    expect(
      hinweisGrund({ reason: 'selection-invalid', detail: 'labels', missingKey: null }),
    ).toEqual({ key: 'chart.hint.reason.selectionInvalid', werte: { entry: 'labels' } });
  });

  it('6 Spalte ohne Zahlen', () => {
    expect(grundText(TABELLE, BALKEN.replace('values: Einnahmen', 'values: Notiz'))).toBe(
      'Die Spalte «Notiz» ist keine Zahl-Spalte. Werte eines Diagramms kommen nur aus Zahl-Spalten.',
    );
  });

  it('7 keine einzige Zahl', () => {
    const leer = TABELLE.replace('| 100 |', '|  |').replace('| 90 |', '|  |');
    expect(grundText(leer, BALKEN)).toBe('Die gewählten Datenreihen enthalten keine einzige Zahl.');
  });

  it('8 Art verträgt die Daten nicht: je Anlass ein eigener Satz', () => {
    const kreis = angabe('table: ^umsatz', 'type: pie', 'labels: Monat', 'values: Ausgaben');
    expect(grundText(TABELLE, kreis)).toBe(
      'Ein Kreis- oder Donut-Diagramm kann keine negativen Werte zeigen.',
    );
    const nullen = TABELLE.replace('| 80 |', '| 0 |').replace('| -95 |', '| 0 |');
    expect(grundText(nullen, kreis)).toBe(
      'Ein Kreis- oder Donut-Diagramm braucht mindestens einen Wert größer als null.',
    );
    const donut = angabe('table: ^umsatz', 'type: donut', 'labels: Monat');
    expect(grundText(TABELLE, `${donut}\nvalues: Einnahmen, Ausgaben`)).toBe(
      'Ein Kreis- oder Donut-Diagramm zeigt genau eine Datenreihe.',
    );
    const unbekannt =
      'Die Art des Diagramms fehlt oder ist unbekannt. Möglich sind line, bar, pie und donut.';
    expect(grundText(TABELLE, BALKEN.replace('type: bar', 'type: radar'))).toBe(unbekannt);
    expect(grundText(TABELLE, BALKEN.replace('type: bar\n', ''))).toBe(unbekannt);
  });

  it('8 Linie und Balken mit negativen Werten werden gezeichnet', () => {
    for (const art of ['line', 'bar']) {
      const body = angabe(`table: ^umsatz`, `type: ${art}`, 'labels: Monat', 'values: Ausgaben');
      expect(buildChartInput(dokument(TABELLE, body), body).drawable).toBe(true);
    }
  });

  it('ein unbekannter Grund zeigt die Überschrift ohne Satz, nie eine leere Fläche', () => {
    expect(hinweisGrund({ reason: 'neu', detail: null })).toBeNull();
    const kasten = baueHinweis({ reason: 'neu', detail: null }, de);
    expect(kasten.textContent).toBe('Das Diagramm kann nicht gezeichnet werden');
  });
});

describe('Zwei Gründe zugleich: der erste gilt (4T-002022, AK9)', () => {
  it('fehlende Spalte und zwei Reihen in einem Donut: der Hinweis nennt die Spalte', () => {
    const body = angabe(
      'table: ^umsatz',
      'type: donut',
      'labels: Monat',
      'values: Einnahmen, Fehlt',
    );
    expect(grundText(TABELLE, body)).toBe(
      'Die Spalte oder Zeile «Fehlt» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
  });

  it('fehlerhafte Tabelle und unbekannte Art: der Hinweis nennt die Tabelle', () => {
    const zuViel = TABELLE.replace('| Januar | 100 | 80 | a |', '| Januar | 100 | 80 | a | x |');
    expect(grundText(zuViel, BALKEN.replace('type: bar', 'type: radar'))).toMatch(
      /^Die Datentabelle «umsatz» meldet/,
    );
  });
});

describe('Zeile der ausgelassenen Werte (4T-002022, AK10, AK11, AK16, AK17)', () => {
  it('Einzahl, Mehrzahl und keine Zeile', () => {
    expect(baueAuslassZeile(1, de).textContent).toBe(
      '1 Wert wurde ausgelassen, weil seine Zelle leer oder nicht lesbar ist.',
    );
    expect(baueAuslassZeile(2, de).textContent).toBe(
      '2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.',
    );
    expect(baueAuslassZeile(0, de)).toBeNull();
  });

  it('eine leere und eine Fehler-Zelle: gezeichnet, zwei Werte ausgelassen, kein Hinweis (AK4, AK19)', () => {
    const luecken = TABELLE.replace('| 100 |', '|  |').replace('| -95 |', '| zehn |');
    const body = BALKEN.replace('values: Einnahmen', 'values: Einnahmen, Ausgaben');
    const wurzel = container(body);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: dokument(luecken, body) });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.dataset.chartState).toBe('drawn');
    expect(block.querySelector('svg')).not.toBeNull();
    expect(block.querySelector('.perspective-chart-hint')).toBeNull();
    const zeile = block.querySelector('.perspective-chart-omitted');
    expect(zeile.textContent).toBe(
      '2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.',
    );
    // Die Zeile steht unter der Grafik.
    expect(block.lastElementChild).toBe(zeile);
  });

  it('ohne ausgelassene Werte keine Zeile (AK11)', () => {
    const wurzel = container(BALKEN);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: dokument(TABELLE, BALKEN) });
    expect(wurzel.querySelector('.perspective-chart-omitted')).toBeNull();
  });

  it('eine ausgefüllte Zelle senkt die Zahl, die letzte lässt die Zeile entfallen (AK16)', () => {
    const body = BALKEN.replace('values: Einnahmen', 'values: Einnahmen, Ausgaben');
    let puffer = dokument(TABELLE.replace('| 100 |', '|  |').replace('| 90 |', '| neun |'), body);
    const wurzel = container(body);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => puffer });
    const zeile = () => wurzel.querySelector('.perspective-chart-omitted');
    expect(zeile().textContent).toMatch(/^2 Werte/);
    // Neu zeichnen wie nach einer Änderung: der Schritt setzt zurück.
    const neu = () => {
      wurzel.querySelector('.perspective-chart').removeAttribute('data-chart-state');
      applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => puffer });
    };
    puffer = dokument(TABELLE.replace('| 100 |', '|  |'), body);
    neu();
    expect(zeile().textContent).toBe(
      '1 Wert wurde ausgelassen, weil seine Zelle leer oder nicht lesbar ist.',
    );
    puffer = dokument(TABELLE, body);
    neu();
    expect(zeile()).toBeNull();
  });

  it('eine Tabelle, die gerade ausgefüllt wird, mit einer Zahl: gezeichnet mit Zeile (AK17)', () => {
    const halb = [
      zaun(
        'perspective-datatable',
        KOPF,
        '| Januar | 100 | | |',
        '| Februar | | | |',
        '| März | | | |',
      ),
      '^umsatz',
    ].join('\n');
    const wurzel = container(BALKEN);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: dokument(halb, BALKEN) });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.dataset.chartState).toBe('drawn');
    expect(block.querySelector('.perspective-chart-omitted').textContent).toMatch(/^2 Werte/);
  });
});

describe('Hinweis im Schritt der Befüllung (4T-002022, AK14, AK15)', () => {
  const FAELLE = [
    BALKEN.replace('^umsatz', '^kosten'),
    angabe('type: bar'),
    BALKEN.replace('values: Einnahmen', 'values: Umsatz'),
    BALKEN.replace('values: Einnahmen', 'values: Notiz'),
    BALKEN.replace('type: bar', 'type: radar'),
    angabe('table: ^umsatz', 'type: pie', 'labels: Monat', 'values: Ausgaben'),
  ];

  it('nie eine leere Fläche: jeder nicht zeichenbare Fall zeigt den Hinweis statt einer Grafik', () => {
    const wurzel = container(...FAELLE);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: dokument(TABELLE, '') });
    for (const block of wurzel.querySelectorAll('.perspective-chart')) {
      expect(block.dataset.chartState).toBe('undrawable');
      expect(block.querySelector('svg')).toBeNull();
      expect(block.querySelector('pre')).toBeNull();
      const kasten = block.querySelector('.perspective-chart-hint');
      expect(kasten.querySelector('.perspective-chart-hint-title').textContent).toBe(
        'Das Diagramm kann nicht gezeichnet werden',
      );
      expect(kasten.querySelector('.perspective-chart-hint-reason').textContent).not.toBe('');
    }
  });

  it('der Hinweis verändert das Dokument nicht (Byte-Vergleich)', () => {
    const text = dokument(TABELLE, FAELLE[0]);
    const vorher = Buffer.from(text, 'utf8');
    const wurzel = container(FAELLE[0]);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => text });
    expect(Buffer.from(aufrufe[0].text, 'utf8').equals(vorher)).toBe(true);
    expect(Buffer.from(text, 'utf8').equals(vorher)).toBe(true);
    expect(wurzel.querySelector('.perspective-chart').dataset.chartSource).toBe(FAELLE[0]);
  });

  it('Grund behoben: das Diagramm erscheint an Stelle des Hinweises; Grund entsteht: Hinweis', () => {
    let puffer = dokument(TABELLE, BALKEN.replace('^umsatz', '^kosten'));
    const body = BALKEN.replace('^umsatz', '^kosten');
    const wurzel = container(body);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => puffer });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.querySelector('.perspective-chart-hint')).not.toBeNull();
    // Die Tabelle bekommt den genannten Namen.
    puffer = puffer.replace('^umsatz', '^kosten');
    block.removeAttribute('data-chart-state');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => puffer });
    expect(block.querySelector('.perspective-chart-hint')).toBeNull();
    expect(block.querySelector('svg')).not.toBeNull();
    expect(block.classList.contains('perspective-chart--undrawable')).toBe(false);
    // Und zurück: der Name verschwindet.
    puffer = puffer.replace('^kosten\n', '\n');
    block.removeAttribute('data-chart-state');
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: () => puffer });
    expect(block.querySelector('svg')).toBeNull();
    expect(block.querySelector('.perspective-chart-hint-reason').textContent).toMatch(/«kosten»/);
  });
});

describe('Text des Anwenders nur als Text (4T-002022, H2)', () => {
  const BOESE = '<img src=x onerror=alert(1)>&amp; "zitiert" $& {name}';

  it('Spalten-Nennung, Zeilen-Eintrag und Datei-Name erscheinen wörtlich, ohne HTML', () => {
    const faelle = [
      { reason: 'selection-invalid', detail: BOESE },
      { reason: 'values-not-numeric', detail: BOESE },
      { reason: 'document-missing', detail: null, file: BOESE, tableName: 'umsatz' },
    ];
    for (const erg of faelle) {
      const kasten = baueHinweis(erg, de);
      expect(kasten.querySelector('img')).toBeNull();
      expect(kasten.querySelector('.perspective-chart-hint-reason').textContent).toContain(BOESE);
    }
  });

  it('auf dem echten Weg: eine Spalten-Nennung mit Sonderzeichen', () => {
    const body = BALKEN.replace('values: Einnahmen', 'values: <b>Umsatz</b> & "Co"');
    const wurzel = container(body);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: dokument(TABELLE, body) });
    const block = wurzel.querySelector('.perspective-chart');
    expect(block.querySelector('b')).toBeNull();
    expect(block.querySelector('.perspective-chart-hint-reason').textContent).toBe(
      'Die Spalte oder Zeile «<b>Umsatz</b> & "Co"» fehlt in der Tabelle oder ist nicht eindeutig.',
    );
  });
});

describe('Fünf Sprachen (4T-002022, AK13, AK18)', () => {
  const ERGEBNISSE = [
    { reason: 'document-missing', detail: 'B', file: 'B' },
    { reason: 'table-missing', detail: 'x', tableName: 'x' },
    { reason: 'table-missing', detail: 'x', tableName: 'x', file: 'B' },
    { reason: 'table-missing', detail: null, tableName: null },
    { reason: 'table-other-kind', detail: 'other', tableName: 'x' },
    { reason: 'table-invalid', detail: 'rowCellCount', tableName: 'x' },
    { reason: 'selection-invalid', detail: 'Spalte' },
    { reason: 'selection-invalid', detail: null, missingKey: 'labels' },
    { reason: 'values-not-numeric', detail: 'Spalte' },
    { reason: 'no-numbers', detail: null },
    { reason: 'type-unsupported', detail: 'negative' },
    { reason: 'type-unsupported', detail: 'zeros' },
    { reason: 'type-unsupported', detail: 'multiple-series' },
    { reason: 'type-unsupported', detail: 'missing-type' },
    { reason: 'type-unsupported', detail: 'unknown-type' },
  ];

  it('jeder Grund und die Auslass-Zeile haben in jeder Sprache einen eigenen Text ohne offenen Platzhalter', () => {
    for (const code of SPRACHEN) {
      const t = uebersetzer(code);
      const texte = ERGEBNISSE.map((erg) => hinweisText(erg, t));
      for (const text of texte) {
        expect(text).not.toBe('');
        expect(text).not.toMatch(/^chart\.|\{\w+\}/);
      }
      expect(new Set(texte).size).toBe(ERGEBNISSE.length - 1); // missing- und unknown-type teilen den Satz
      for (const n of [1, 3]) expect(baueAuslassZeile(n, t).textContent).toContain(String(n));
      expect(t('chart.hint.title')).not.toBe('chart.hint.title');
    }
  });

  // Durchsicht vom 2026-09-30 (4T-002025, D1): der Hinweis der Ausgabe, wenn
  // die Tabelle bis zur Zeit-Grenze von Druck und PDF nicht gelesen ist.
  it('der Hinweis «nicht rechtzeitig gelesen» hat in jeder Sprache Überschrift und eigenen Satz', () => {
    const kasten = baueHinweisNichtRechtzeitig(de);
    expect(kasten.getAttribute('role')).toBe('note');
    expect(kasten.querySelector('.perspective-chart-hint-title').textContent).toBe(
      'Das Diagramm kann nicht gezeichnet werden',
    );
    expect(kasten.querySelector('.perspective-chart-hint-reason').textContent).toBe(
      'Die Tabelle konnte nicht rechtzeitig gelesen werden.',
    );
    const saetze = SPRACHEN.map(
      (code) =>
        baueHinweisNichtRechtzeitig(uebersetzer(code)).querySelector(
          '.perspective-chart-hint-reason',
        ).textContent,
    );
    for (const satz of saetze) expect(satz).not.toMatch(/^chart\.|\{\w+\}|"/);
    expect(new Set(saetze).size).toBe(SPRACHEN.length);
  });

  it('der Sprachwechsel zeichnet Hinweis und Auslass-Zeile in der neuen Sprache neu', async () => {
    const luecke = TABELLE.replace('| 100 |', '|  |');
    const fehlt = BALKEN.replace('^umsatz', '^kosten');
    const wurzel = container(fehlt, BALKEN);
    applyPerspectiveChartsIfPresent(wurzel, '', { dokumentText: dokument(luecke, '') });
    const [hinweis, gezeichnet] = wurzel.querySelectorAll('.perspective-chart');
    expect(hinweis.querySelector('.perspective-chart-hint-title').textContent).toBe(
      'Das Diagramm kann nicht gezeichnet werden',
    );
    await i18n.loadTranslations('en');
    document.dispatchEvent(new CustomEvent('i18n-language-changed'));
    expect(hinweis.querySelector('.perspective-chart-hint-title').textContent).toBe(
      'The chart cannot be drawn',
    );
    expect(hinweis.querySelector('.perspective-chart-hint-reason').textContent).toBe(
      'No table named “kosten” exists in this document.',
    );
    expect(gezeichnet.querySelector('.perspective-chart-omitted').textContent).toBe(
      '1 value was left out because its cell is empty or unreadable.',
    );
  });
});
