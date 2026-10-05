// 4T-002021 (Epic 3E-000192): Angaben, die jeder Aufrufer dem gemeinsamen
// Zeichner gleich mitgibt — die geprüften Reihen-Paletten und die
// Vorlese-Beschreibung.
//
// Warum ein eigenes Modul neben dem Zeichner: Es lädt nichts außer sich selbst
// und ist damit auch von Stellen aus lesbar, die den Zeichner nie laden dürfen
// (er zöge die Zeichen-Bibliothek, rund ein halbes Megabyte, in das Bündel des
// Anzeige-Prozesses); der Zeichner liest seine helle Vorgabe von hier.
//
// **Seit 4T-002030 ist das Farbschema die einzige Quelle der Reihen-Farben in
// der Anzeige:** Jedes Farbschema trägt zehn Farb-Plätze `chart1` bis
// `chart10` (Variablen `--chart-1` bis `--chart-10`), und die Ansicht liest
// deren wirksame Werte (src/renderer/modules/charts/chart-view.js). Die beiden
// Paletten hier bleiben allein als Vorgabe des Zeichners ohne Angabe des
// Aufrufers und als Quelle der Basis-Werte der Farbschemas (BASE_DEFAULTS in
// src/shared/color-schemes.js, dazu das Stilblatt); ein Wächter hält die drei
// Stellen gleich (test/unit/color-schemes.test.js).
//
// Die Vorlese-Beschreibung («Balkendiagramm mit 2 Datenreihen und 6
// Rubriken») hängt an Zahlen, die erst beim Auflösen der Tabelle feststehen.
// Der Aufrufer reicht deshalb die übersetzten Texte herein, und die
// Zusammensetzung geschieht hier, dort wo die Zahlen vorliegen.
'use strict';

// Helle Palette: zehn gut unterscheidbare Farben in fester Reihenfolge der
// Farbtöne (Blau, Orange, Rot, Blaugrün, Grün, Ocker, Violett, Rosa, Braun,
// Grau-Braun). Linien, Balken und Kreis-Stücke sind grafische Bedeutungsträger
// und brauchen 3:1 gegen den Hintergrund; jede Farbe hält das gegen Weiß und
// gegen den Hintergrund des hellen Standard-Schemas. Orange, Blaugrün, Ocker,
// Rosa und Grau-Braun sind dafür am 2026-09-29 im selben Farbton abgedunkelt
// worden (4T-002021).
const LIGHT_CHART_PALETTE = Object.freeze([
  '#4e79a7',
  '#da730d',
  '#e15759',
  '#519a94',
  '#59a14f',
  '#ac8a11',
  '#b07aa1',
  '#d5707a',
  '#9c755f',
  '#9b8c86',
]);

// Dunkle Palette: dieselbe Reihenfolge der Farbtöne, aufgehellt, damit jede
// Farbe gegen den dunklen Standard-Hintergrund einen Kontrast von mindestens
// 3:1 hält. Beide Paletten prüft test/unit/chart-call-options.test.js auf
// Kontrast und auf den Farbabstand benachbarter Farben.
const DARK_CHART_PALETTE = Object.freeze([
  '#7ea6d8',
  '#f5a55a',
  '#f07f82',
  '#8fd1cb',
  '#80c26f',
  '#f1d465',
  '#caa0c1',
  '#ffb3bb',
  '#c39c82',
  '#cfc7c3',
]);

function mitZahl(n, einzahl, mehrzahl) {
  if (n === 1) return String(einzahl);
  return String(mehrzahl).replace('{n}', () => String(n));
}

/**
 * Setzt die Vorlese-Beschreibung aus den übersetzten Texten zusammen.
 *
 * `texts` = { line, bar, pie, donut: Vorlage mit `{series}` und `{categories}`,
 * seriesOne, seriesOther, categoriesOne, categoriesOther: Zahl-Wendungen, die
 * Mehrzahl mit `{n}` }. Fehlt die Vorlage der Art, gibt es keine Beschreibung.
 *
 * @returns {string|null}
 */
function chartDescription(texts, type, seriesCount, categoryCount) {
  if (!texts || typeof texts !== 'object') return null;
  const vorlage = texts[type];
  if (typeof vorlage !== 'string' || vorlage === '') return null;
  const reihen = mitZahl(seriesCount, texts.seriesOne, texts.seriesOther);
  const rubriken = mitZahl(categoryCount, texts.categoriesOne, texts.categoriesOther);
  // Ersetzung über Funktionen, damit ein `$` in einem Text nicht als
  // Ersetzungs-Muster gelesen wird.
  return vorlage.replace('{series}', () => reihen).replace('{categories}', () => rubriken);
}

/**
 * Die übersetzten Texte der Vorlese-Beschreibung, in der Form, die
 * `chartDescription` erwartet. Heimat der Liste der Text-Schlüssel für jeden
 * Aufrufer, der zeichnen lässt (Ansicht und portabler Export); die
 * Übersetzungs-Funktion kommt vom Aufrufer (im Programm `t` aus i18n.js),
 * damit dieses Modul nichts lädt.
 *
 * @param {function(string): string} t Übersetzungs-Funktion.
 * @returns {object}
 */
function chartDescriptionTexts(t) {
  return {
    line: t('chart.description.line'),
    bar: t('chart.description.bar'),
    pie: t('chart.description.pie'),
    donut: t('chart.description.donut'),
    seriesOne: t('chart.count.series.one'),
    seriesOther: t('chart.count.series.other'),
    categoriesOne: t('chart.count.categories.one'),
    categoriesOther: t('chart.count.categories.other'),
  };
}

module.exports = {
  LIGHT_CHART_PALETTE,
  DARK_CHART_PALETTE,
  chartDescription,
  chartDescriptionTexts,
};
