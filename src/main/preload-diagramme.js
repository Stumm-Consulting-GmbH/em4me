// 4T-002021 (Epic 3E-000192): Der Diagramm-Anteil der Preload-Brücke.
//
// **Warum der Zeichner hier läuft und nicht im Anzeige-Prozess.** Der
// gemeinsame Zeichner lädt beim ersten Diagramm die Zeichen-Bibliothek (rund
// ein halbes Megabyte). Ein Import aus dem Anzeige-Prozess zöge sie in dessen
// Bündel, weil der Bündler jedem statischen `require` folgt; hier wird sie
// dagegen erst beim ersten Diagramm geladen und nie gebündelt. Derselbe Weg
// trägt die Markdown-Pipeline (`renderMarkdown`) und die Mindmap
// (`buildMindmap`): eine synchrone Funktion der Brücke, die ein einfaches
// Objekt zurückgibt.
//
// **Warum synchron.** Der Schritt der Befüllung läuft in der gemeinsamen
// Nachverarbeitungs-Folge und im Bau-Schritt der Live-Widgets; ein Warten dort
// ließe das Widget nach dem Einhängen seine Höhe ändern. Auflösen und Zeichnen
// sind reine Rechnung ohne Datei-Zugriff.
//
// Keine Fach-Logik: Auflösung und Reihen-Bildung liegen im Format-Kern
// (src/shared/markdown/perspective-chart.js), das Zeichnen im gemeinsamen
// Zeichner (src/shared/charts/chart-draw.js), die Zusammensetzung der
// Vorlese-Beschreibung in src/shared/charts/chart-call-options.js. Hier steht
// allein die Weiche zwischen den drei Ergebnis-Arten; bei «nicht zeichenbar»
// kommt der genannte Name hinzu, den der Hinweis braucht (4T-002022).
//
// 4T-002023: Nennt der Block eine Tabelle in einem anderen Dokument, liest der
// Anzeige-Prozess dessen Text über den Kanal `chart:readTableDocument` (hier
// gebunden) und reicht die Antwort als vierten Wert herein. Die Weiche bleibt
// damit an dieser einen Stelle: Der Name wird im gelesenen Text nach der Regel
// des Format-Kerns gesucht wie im eigenen Dokument, und eine Antwort ohne Text
// ist der Grund «Dokument fehlt», gleich aus welchem Anlass.
'use strict';

const {
  DOCUMENT_MISSING,
  buildChartInput,
  buildChartInputInDocument,
  parseChartSpec,
  parseTableRef,
} = require('../shared/markdown/perspective-chart.js');
const { drawChart } = require('../shared/charts/chart-draw.js');
const { chartDescription } = require('../shared/charts/chart-call-options.js');

/**
 * Löst einen Diagramm-Block im Dokument-Text auf und zeichnet ihn.
 *
 * @param {string} documentText Text des Dokuments, das den Block trägt (der
 *   geschriebene Stand, auch ungespeichert).
 * @param {string} chartBody Inhalt des Blocks `perspective-chart`.
 * @param {{colors?: object, fontFamily?: string, idPrefix?: string,
 *   descriptionTexts?: object}} [options] Angaben der Ansicht; `colors`,
 *   `fontFamily` und `idPrefix` gehen unverändert an den Zeichner,
 *   `descriptionTexts` sind die übersetzten Texte der Vorlese-Beschreibung.
 * @param {{ok: boolean, content?: string}} [tableDocument] Antwort des Kanals
 *   `chart:readTableDocument` für einen Block, der eine Tabelle in einem
 *   anderen Dokument nennt. Ohne sie bleibt es bei `pending`; mit `ok` wird im
 *   gelesenen Text aufgelöst, sonst ist der Grund `document-missing`.
 * @returns {{status: 'drawn', svg: string, omitted: number, type: string,
 *   seriesCount: number, categoryCount: number}
 *   | {status: 'undrawable', reason: string, detail: (string|null),
 *     missingKey: (string|null), tableName: (string|null), file: (string|null)}
 *   | {status: 'pending', target: {file: string, name: string}}}
 *   Bei `undrawable` trägt `missingKey` den Namen einer fehlenden oder
 *   unbekannten Angabe des Blocks (dann ist `detail` null), sonst trägt
 *   `detail` die beanstandete Nennung oder den Anlass; `tableName` und `file` den Namen der genannten
 *   Tabelle und das genannte andere Dokument (je null, wenn der Block keinen
 *   lesbaren Namen oder kein anderes Dokument nennt); der Hinweis an der
 *   Stelle des Diagramms nennt sie, ohne den Block ein zweites Mal zu lesen.
 * @throws {TypeError} bei formal unbrauchbaren Angaben der Ansicht (Zeichner)
 */
function buildChart(documentText, chartBody, options, tableDocument) {
  const body = typeof chartBody === 'string' ? chartBody : '';
  let input = buildChartInput(typeof documentText === 'string' ? documentText : '', body);
  if (input.pending) {
    const { file, name } = input.target;
    if (!tableDocument || typeof tableDocument !== 'object') {
      return { status: 'pending', target: { file, name } };
    }
    if (tableDocument.ok !== true || typeof tableDocument.content !== 'string') {
      return {
        status: 'undrawable',
        reason: DOCUMENT_MISSING,
        detail: file,
        missingKey: null,
        tableName: name,
        file,
      };
    }
    input = buildChartInputInDocument(parseChartSpec(body), tableDocument.content, name);
  }
  if (!input.drawable) {
    const ref = parseTableRef(parseChartSpec(body).table);
    return {
      status: 'undrawable',
      reason: input.reason,
      detail: input.detail == null ? null : String(input.detail),
      missingKey: input.missingKey == null ? null : String(input.missingKey),
      tableName: ref ? ref.name : null,
      file: ref && ref.kind === 'other' ? ref.file : null,
    };
  }
  const opts = options && typeof options === 'object' ? options : {};
  const seriesCount = input.series.length;
  const categoryCount = input.categories.length;
  const svg = drawChart(input, {
    colors: opts.colors,
    fontFamily: opts.fontFamily,
    idPrefix: opts.idPrefix,
    description: chartDescription(opts.descriptionTexts, input.type, seriesCount, categoryCount),
  });
  return {
    status: 'drawn',
    svg,
    omitted: input.omitted,
    type: input.type,
    seriesCount,
    categoryCount,
  };
}

/**
 * Die Einträge der Brücke rund um Diagramme.
 *
 * @param {object} ipcRenderer Electron-IPC des Anzeige-Prozesses; als Parameter
 *   und nicht per Require, damit das Modul ohne Electron prüfbar bleibt (Muster
 *   `datenbankBruecke`).
 * @returns {object} Einträge für das Brücken-Objekt.
 */
function diagrammeBruecke(ipcRenderer) {
  return {
    buildChart,
    // 4T-002023: Der ganze Text des anderen Dokuments, Puffer vor Platte.
    // Antwort { ok, path, content, quelle } oder { ok: false, error, path?,
    // indexBereit? }; die Begründung des Kanals steht in src/main/ipc/embeds.js.
    readChartTableDocument: (basePath, file) =>
      ipcRenderer.invoke('chart:readTableDocument', { basePath, file }),
    // 4T-002024: die beiden Einträge des Untermenüs «Ansicht → Diagramm».
    onMenuChartInsert: (cb) => ipcRenderer.on('menu:chartInsert', () => cb()),
    onMenuChartEdit: (cb) => ipcRenderer.on('menu:chartEdit', () => cb()),
  };
}

module.exports = { diagrammeBruecke, buildChart };
