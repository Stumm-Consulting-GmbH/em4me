'use strict';

// 4T-002173 (Epic 3E-000337): Diagramm-Darstellung einer Tabellen-Abfrage,
// `DISPLAY bar` und `DISPLAY line`. Das Modul beantwortet eine Frage: wie aus
// der Ergebnismenge das Bild einer Form des Verzeichnisses `display-forms.js`
// wird, das beide Formen unter ihrem Namen einträgt; dieses Modul kennt das
// Verzeichnis nicht.
//
// **Eignung und Bild aus einer Regel** (Entscheidung S1): Beide lesen die
// Datenregel in src/shared/query/result-chart.js. Passt die Abfrage nicht,
// nennt `unsuitableReason` den Grund-Code der Regel, und der Verteiler zeigt die
// Ausgabe ohne Angabe mit einem Hinweis, der den Grund nennt (F5 Option A).
//
// **Gezeichnet wird über den Kontext** (Entscheidung S2): Die Befüllung
// (`frontmatter-query-view.js`) reicht `drawChart`, die zweite Funktion der
// Diagramm-Brücke (`buildChartFromInput`, src/main/preload-diagramme.js) samt
// Farben, Schrift und Vorlese-Texten der Ansicht. Der Zeichner wird hier nie
// importiert, weil er die Zeichen-Bibliothek in das Bündel des Anzeige-Prozesses
// zöge (Wächter in test/unit/renderer/diagramm-ansicht.test.js). Fehlt die
// Funktion oder zeichnet sie nicht, wirft `render`; der Verteiler fällt dann
// zurück, statt eine leere Fläche zu zeigen.
//
// **Hinweis-Zeilen unter dem Bild** (Entscheidung S5): Über dem Ergebnis steht
// höchstens ein Hinweis, und der des Abfrage-Zustands geht vor. Übergangene
// Spalten und ausgelassene Werte stehen deshalb je in höchstens einer Zeile
// unter der Grafik, im Stil der Zeile ausgelassener Werte beim Diagramm zu einer
// Datentabelle (Klasse `perspective-chart-omitted`).
//
// **Ein Bild ohne Bedienung** (Entscheidung F3 Option A): Die Form setzt kein
// Klick-Ziel; der Klick-Weg der Treffer (`data-fm-path`) findet nichts.
//
// **Schalter** (Entscheidungen F1 und F2, jeweils Option A): Beide Formen
// gehören zur Erweiterung `query-chart` (src/shared/extensions/extensions.js).
// Ist sie aus, zeichnet der Verteiler nicht und nennt den eigenen Hinweis-Code
// `displayFormOff` (Entscheidung S3).
//
// Text des Anwenders (Spalten-Überschriften) wird nur über `textContent`
// gesetzt. Die Grafik stammt aus dem eigenen Zeichner, der jeden Anwender-Text
// als Text-Inhalt maskiert; sie wird wie beim Diagramm zu einer Datentabelle
// als HTML eingesetzt (chart-view.js, `zeigeErgebnis`).

import { buildQueryChartInput, queryChartSuitability } from '../../../shared/query/result-chart.js';

/** Kennung der Erweiterung «Diagramm einer Abfrage». */
export const QUERY_CHART_EXTENSION_ID = 'query-chart';

/** Klasse des Bilds; die Befüllung erkennt daran ein gezeichnetes Diagramm. */
export const QUERY_CHART_CLASS = 'perspective-query-chart';

// Platzhalter in einem Durchgang über eine Ersetzungs-Funktion, damit ein
// eingesetzter Spalten-Name nicht erneut durchsucht und kein Muster wie `$&`
// ausgewertet wird (Muster `fuelle` in chart-hint.js).
function fuelle(vorlage, werte) {
  return String(vorlage).replace(/\{(\w+)\}/g, (platz, name) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : platz,
  );
}

function zeile(klasse, text) {
  const el = document.createElement('div');
  el.className = `perspective-chart-omitted ${klasse}`;
  el.textContent = text;
  return el;
}

/**
 * Die Zeile der übergangenen Spalten, Einzahl oder Mehrzahl; ohne übergangene
 * Spalte keine Zeile.
 * @param {string[]} spalten  Überschriften der übergangenen Spalten
 * @param {(key: string) => string} translate
 * @returns {HTMLElement|null}
 */
export function skippedLine(spalten, translate) {
  if (!Array.isArray(spalten) || spalten.length === 0) return null;
  const key = spalten.length === 1 ? 'query.chart.skipped.one' : 'query.chart.skipped.other';
  const liste = spalten.map((s) => `'${s}'`).join(', ');
  return zeile('perspective-query-chart-skipped', fuelle(translate(key), { columns: liste }));
}

/**
 * Die Zeile der ausgelassenen Werte, Einzahl oder Mehrzahl; ohne ausgelassenen
 * Wert keine Zeile.
 * @param {number} anzahl
 * @param {(key: string) => string} translate
 * @returns {HTMLElement|null}
 */
export function omittedLine(anzahl, translate) {
  const n = Number(anzahl) || 0;
  if (n <= 0) return null;
  const key = n === 1 ? 'query.chart.omitted.one' : 'query.chart.omitted.other';
  return zeile('perspective-query-chart-gaps', fuelle(translate(key), { n: String(n) }));
}

function renderChart(type, resultSet, context) {
  const ctx = context || {};
  if (typeof ctx.drawChart !== 'function') {
    throw new TypeError('display-chart: Zeichen-Funktion fehlt im Kontext');
  }
  const translate = typeof ctx.translate === 'function' ? ctx.translate : (key) => key;
  // Die Gruppe ohne Wert trägt denselben Text wie in der Tabelle.
  const input = buildQueryChartInput(resultSet, {
    type,
    noneLabel: translate('query.group.none'),
  });
  if (!input.drawable) throw new Error(`display-chart: nicht zeichenbar (${input.reason})`);
  const erg = ctx.drawChart(input);
  if (!erg || erg.status !== 'drawn' || typeof erg.svg !== 'string') {
    throw new Error('display-chart: die Brücke hat nicht gezeichnet');
  }
  const bild = document.createElement('div');
  bild.className = QUERY_CHART_CLASS;
  bild.dataset.queryChart = type;
  bild.dataset.chartOmitted = String(input.omitted);
  bild.innerHTML = erg.svg;
  const uebergangen = skippedLine(input.skippedColumns, translate);
  if (uebergangen) bild.appendChild(uebergangen);
  const luecken = omittedLine(input.omitted, translate);
  if (luecken) bild.appendChild(luecken);
  return bild;
}

function chartForm(type) {
  return {
    extension: QUERY_CHART_EXTENSION_ID,
    isSuitable: (resultSet) => queryChartSuitability(resultSet).suitable,
    unsuitableReason: (resultSet) => queryChartSuitability(resultSet).reason,
    render: (resultSet, context) => renderChart(type, resultSet, context),
  };
}

/** Form `bar` des Verzeichnisses: Balken-Diagramm. */
export const barForm = chartForm('bar');

/** Form `line` des Verzeichnisses: Linien-Diagramm. */
export const lineForm = chartForm('line');
