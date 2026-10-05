// 4T-002020 (Epic 3E-000192): Übersetzung der zeichenbaren Form in die
// Einstellungen der Zeichen-Bibliothek (Apache ECharts).
//
// Blatt des gemeinsamen Zeichners (chart-draw.js): reine Daten hinein, ein
// Einstellungs-Objekt heraus, ohne die Bibliothek zu laden, ohne DOM und ohne
// Zustand. Der Schnitt folgt der Naht zwischen «was wird gezeichnet» (hier) und
// «wie entsteht daraus die Grafik» (Laden, Zeichnen, Vorlese-Angaben im Kern).
//
// Drei Regeln tragen die Text-Zusicherung des Zeichners (Anwender-Text bleibt
// unverändert Text):
//   - Jede Beschriftung, die aus Anwender-Text entsteht, läuft über eine
//     Funktion und nie über eine Vorlage der Bibliothek. Deren Vorlagen ersetzen
//     `{a}`, `{b}`, `{c}` … nacheinander im bereits eingesetzten Text; ein
//     Rubrik-Name, der selbst `{c}` enthält, käme sonst verändert an.
//   - Keine Hervorhebung, keine Auswahl und keine Tooltips: Die Grafik ist ein
//     Bild ohne Bedienung, und die Bibliothek legt für solche Zustände weder
//     Stil-Regeln noch Daten in die Grafik.
//   - Keine Animation: Die Grafik entsteht in einem Zug als Text.
'use strict';

// Die Ausmaße des Kreises: Voll-Kreis bis zum Außenradius, beim Donut ein
// Ring. Prozent der kleineren Seite der Zeichenfläche, Vorgabe der Probe.
const PIE_RADIUS = ['0%', '62%'];
const DONUT_RADIUS = ['38%', '62%'];

// Schriftgrößen in Pixeln der Zeichenfläche; die Grafik skaliert als Ganzes.
const TITLE_FONT_SIZE = 16;
const LABEL_FONT_SIZE = 12;

// Die gemeinsamen Text-Angaben jeder Beschriftung: Schrift und Farbe kommen
// je Aufruf, nie aus der Vorgabe der Bibliothek.
function textStyle(style, fontSize) {
  return { color: style.text, fontFamily: style.fontFamily, fontSize };
}

// Die Beschriftung einer Rubrik oder Reihe unverändert, ohne Vorlage.
const asName = (params) => String(params.name);

// Zahlen der Wert-Achse in Punkt-Dezimal ohne Tausender-Gruppierung, wie die
// Datentabelle sie zeigt (`formatCellDisplay` in
// src/shared/markdown/perspective-datatable-view.js): Diagramm und Tabelle
// tragen dieselben Zahlen in derselben Schreibweise; die Vorgabe der
// Bibliothek («1,000») läse ein deutscher Anwender als eins. Gerundet auf
// zwölf signifikante Stellen gegen Gleitkomma-Reste der Achsen-Teilung —
// dieselbe Regel wie `normalizeFloat` der Datentabelle, hier bewusst nicht
// importiert, weil der Zeichner die Tabelle nicht kennt und deren Modul die
// Abfrage-Sprache mitzöge.
function formatAxisNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  const rounded = parseFloat(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function titleOption(input, style) {
  if (input.title === null || input.title === undefined || input.title === '') return undefined;
  return {
    text: String(input.title),
    left: 'center',
    top: 8,
    textStyle: { ...textStyle(style, TITLE_FONT_SIZE), fontWeight: 'bold' },
  };
}

function legendOption(style) {
  return {
    bottom: 8,
    selectedMode: false,
    textStyle: textStyle(style, LABEL_FONT_SIZE),
    formatter: (name) => String(name),
  };
}

// Linie und Balken: Rubriken auf der Kategorie-Achse, je Reihe ein Eintrag.
// Mehrere Balken-Reihen stehen nebeneinander (Voreinstellung der Bibliothek),
// negative Werte hängen unter der Null-Linie, `null` ist eine Lücke — die
// Linie wird dort unterbrochen statt über die Lücke gezogen.
function cartesianOption(input, style) {
  const hasTitle = titleOption(input, style) !== undefined;
  const axisLine = { lineStyle: { color: style.muted } };
  return {
    grid: {
      left: 16,
      right: 24,
      top: hasTitle ? 56 : 24,
      bottom: 48,
      containLabel: true,
    },
    legend: legendOption(style),
    xAxis: {
      type: 'category',
      data: input.categories.map(String),
      axisLine,
      axisTick: { lineStyle: { color: style.muted } },
      axisLabel: {
        color: style.muted,
        fontFamily: style.fontFamily,
        fontSize: LABEL_FONT_SIZE,
        formatter: (value) => String(value),
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { ...axisLine, show: false },
      axisLabel: {
        color: style.muted,
        fontFamily: style.fontFamily,
        fontSize: LABEL_FONT_SIZE,
        formatter: formatAxisNumber,
      },
      splitLine: { lineStyle: { color: style.muted, opacity: 0.3 } },
    },
    series: input.series.map((serie) => ({
      type: input.type,
      name: String(serie.name),
      data: serie.values.map((v) => (v === null ? null : v)),
      connectNulls: false,
      silent: true,
      emphasis: { disabled: true },
      ...(input.type === 'line' ? { showSymbol: true, symbolSize: 6 } : {}),
    })),
  };
}

// Kreis und Donut: eine Reihe, je Rubrik ein Stück mit seiner Beschriftung.
// Eine Lücke hat keine Fläche und entfällt; ob die Werte für einen Kreis
// taugen (keine negativen, nicht alle null), hat der Format-Kern entschieden.
//
// 4T-002026 (Entscheidung der steuernden Sitzung vom 2026-09-30): Beschriftungen,
// die einander überdecken würden, zeichnet die Bibliothek nicht
// (`labelLayout.hideOverlap`, Baustein `LabelLayout` der Teil-Einbindung in
// scripts/build-echarts.js) — wie die Kategorie-Achse, die nur so viele
// Beschriftungen zeigt, wie Platz haben. Bei wenigen Stücken bleibt jede stehen.
function pieOption(input, style) {
  const serie = input.series[0];
  const hasTitle = titleOption(input, style) !== undefined;
  const data = [];
  input.categories.forEach((category, i) => {
    const value = serie ? serie.values[i] : null;
    if (value === null || value === undefined) return;
    data.push({ name: String(category), value });
  });
  return {
    series: [
      {
        type: 'pie',
        name: serie ? String(serie.name) : '',
        radius: input.type === 'donut' ? DONUT_RADIUS : PIE_RADIUS,
        center: ['50%', hasTitle ? '55%' : '50%'],
        data,
        silent: true,
        emphasis: { disabled: true },
        label: {
          show: true,
          color: style.text,
          fontFamily: style.fontFamily,
          fontSize: LABEL_FONT_SIZE,
          formatter: asName,
        },
        labelLine: { show: true, lineStyle: { color: style.muted } },
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

/**
 * Baut die Einstellungen der Zeichen-Bibliothek aus der zeichenbaren Form.
 *
 * @param {{type: string, title: (string|null), categories: string[],
 *   series: Array<{name: string, values: Array<(number|null)>}>}} input
 *   bereits geprüfte zeichenbare Form
 * @param {{text: string, muted: string, background: string,
 *   palette: string[], fontFamily: string}} style
 *   aufgelöste Farbwerte und Schrift
 * @returns {object} Einstellungs-Objekt für `setOption`
 */
function buildChartOption(input, style) {
  const body =
    input.type === 'pie' || input.type === 'donut'
      ? pieOption(input, style)
      : cartesianOption(input, style);
  const title = titleOption(input, style);
  return {
    animation: false,
    backgroundColor: style.background,
    color: style.palette.slice(),
    textStyle: { fontFamily: style.fontFamily, color: style.text },
    ...(title ? { title } : {}),
    ...body,
  };
}

module.exports = { buildChartOption };
