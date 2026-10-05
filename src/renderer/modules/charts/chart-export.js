// 4T-002025 (Epic 3E-000192): Diagramm zu einer Datentabelle im portablen
// Export — jeder zeichenbare Diagramm-Block wird durch ein hell gezeichnetes
// Bild ersetzt, das ein fremder Markdown-Betrachter zeigen kann.
//
// Vorbild ist der Export der Ablauf-Diagramme (`replaceMermaidFencesForExport`
// in views/save-export.js): Erkennung und Ersetzung im prozess-neutralen Kern
// (src/shared/markdown/perspective-chart-export.js), das Bild als Bild-Element
// mit Daten-Adresse (`mermaidSvgBlock`), weil der Whitelist-Sanitizer beim
// Wieder-Öffnen kein inline SVG durchlässt. Unverändert bleibt ein Block, wenn
// die Erweiterung aus ist (die Ansicht zeigt ihn dann als Code), wenn das
// Diagramm nicht zeichenbar ist (der Empfänger sieht den Quelltext statt einer
// Meldung), wenn eine Tabelle in einem anderen Dokument nicht rechtzeitig
// gelesen ist und wenn die Brücke einen Fehler meldet.
//
// **Gezeichnet wird über die Brücke** (`api.buildChart`), wie in der Ansicht:
// Der Zeichner darf nicht in das Bündel dieses Prozesses (Wächter in
// test/unit/renderer/diagramm-ansicht.test.js).
//
// **Hell, unabhängig von der Anzeige.** Die Angaben kommen nicht von den
// Farb-Variablen am Wurzel-Element, die dem aktiven Modus folgen, sondern aus
// dem aktiven HELLEN Farbschema, vollständig aufgelöst — auch bei dunklem
// Modus und bei einem eigenen Schema. Der Hintergrund des Bilds ist der
// Hintergrund dieses Schemas, nie durchsichtig: Dunkler Text auf
// durchsichtigem Grund wäre in einem dunklen Betrachter unlesbar. Eine Schrift
// wird nicht übergeben; der Empfänger hat die Schrift der Anwendung nicht, und
// die Vorgabe des Zeichners ist die Oberflächen-Schrift seines Systems.
//
// **Der Stand im Augenblick der Ausgabe.** Aufgelöst wird gegen den Text des
// Reiters, nicht gegen die Datei; eine Tabelle in einem anderen Dokument liest
// der Kanal des Bestands (Puffer vor Platte), mit derselben Zeit-Grenze wie
// die Barriere von Druck und PDF.
//
// **Ein Diagramm in einer Karte einer Canvas-Fläche** zeigt im Export dasselbe
// wie in der Canvas-Ansicht (Entscheidung vom 2026-09-30): aufgelöst gegen den
// Text seiner Karte, ein anderes Dokument gesucht vom Pfad des Reiters aus, wie
// die Ansicht es der Karte gibt (canvas-pane.js, `pfad: tab.path`). Dazu
// markiert `markiereKartenDiagrammeFuerExport` die Karten-Diagramme vor der
// Umwandlung, und `replaceChartFencesForExport` setzt die Marken zum Schluss
// zurück.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { getColorSchemeState } from '../color-schemes.js';
import {
  CHART_SLOT_IDS,
  getActiveScheme,
  resolveSchemeColors,
} from '../../../shared/color-schemes.js';
import { chartDescriptionTexts } from '../../../shared/charts/chart-call-options.js';
import { mermaidSvgBlock } from '../../../shared/mermaid-fence.js';
import { CHART_EXTENSION_ID } from '../../../shared/markdown/perspective-chart.js';
import {
  ersetzeDiagrammBloecke,
  findeDiagrammBloecke,
  kursiveZeile,
  markiereKartenDiagramme,
  sammleDiagrammQuellen,
  stelleKartenMarkenWiederHer,
} from '../../../shared/markdown/perspective-chart-export.js';
import { auslassSatz } from './chart-hint.js';
import { CHART_IDLE_TIMEOUT_MS } from './chart-view.js';

// Präfix der Kennungen in den Bildern des Exports, abgesetzt von denen der
// Ansicht (`ch-…`).
const KENNUNGS_PRAEFIX = 'chx';

/**
 * Die hellen Farben des Exports aus dem aktiven hellen Farbschema.
 *
 * @returns {{text: string, muted: string, background: string, palette: string[]}}
 */
export function helleExportFarben() {
  const farben = resolveSchemeColors(getActiveScheme(getColorSchemeState(), 'light'));
  return {
    text: farben.text,
    muted: farben.textMuted,
    background: farben.bg,
    palette: CHART_SLOT_IDS.map((id) => farben[id]),
  };
}

// Liest das andere Dokument, höchstens bis zur Zeit-Grenze. `null` heißt: keine
// Antwort, der Block bleibt stehen.
function liesMitGrenze(basePath, file) {
  return new Promise((resolve) => {
    const zeitGeber = setTimeout(() => resolve(null), CHART_IDLE_TIMEOUT_MS);
    const ende = (wert) => {
      clearTimeout(zeitGeber);
      resolve(wert);
    };
    Promise.resolve()
      .then(() => api.readChartTableDocument(basePath, file))
      .then(
        (antwort) => ende(antwort && typeof antwort === 'object' ? antwort : null),
        (err) => {
          console.warn('perspective-chart: anderes Dokument für den Export nicht lesbar:', err);
          ende(null);
        },
      );
  });
}

// Der Ersatz eines gezeichneten Blocks: das Bild und, wenn das Diagramm Werte
// auslassen musste, darunter dieselbe Zeile wie am Bildschirm (Entscheidung
// des Product Owners vom 2026-09-30). Satz und Einzahl-/Mehrzahl-Regel kommen
// aus chart-hint.js wie in der Ansicht; die Zeile ist ein eigener Absatz in
// Kursiv-Schreibweise, durch eine Leerzeile vom Bild getrennt, damit das Bild
// als HTML-Block endet und ein fremder Betrachter die Zeile als Text zeigt.
// Unter einem Listenpunkt rückt der Kern beide Zeilen ein.
function bildBlock(erg) {
  const bild = mermaidSvgBlock(erg.svg, t('export.chartAlt'));
  const zeile = kursiveZeile(auslassSatz(erg.omitted, t));
  return bild && zeile ? `${bild}\n${zeile}\n` : bild;
}

// Ein Block-Inhalt: zeichnen, bei einer Tabelle in einem anderen Dokument erst
// lesen und dann zeichnen. Liefert den Ersatz oder null.
async function ersatzFuer(body, angaben, kontext, lesungen) {
  let erg = api.buildChart(kontext.dokumentText, body, angaben);
  if (erg && erg.status === 'pending' && erg.target) {
    if (!kontext.basePath) return null;
    const file = String(erg.target.file || '');
    if (!lesungen.has(file)) lesungen.set(file, liesMitGrenze(kontext.basePath, file));
    const antwort = await lesungen.get(file);
    if (!antwort) return null;
    erg = api.buildChart(kontext.dokumentText, body, angaben, antwort);
  }
  if (!erg || erg.status !== 'drawn' || typeof erg.svg !== 'string') return null;
  return bildBlock(erg);
}

/**
 * Markiert die Diagramme in den Karten einer Canvas-Fläche, bevor der Text des
 * Reiters in die portable Form umgewandelt wird (Begründung im Kopf von
 * src/shared/markdown/perspective-chart-export.js). Im Aus-Zustand der
 * Erweiterung bleibt der Text unverändert.
 *
 * @param {string} text Text des Reiters.
 * @returns {{text: string, karten: Array<object>}} Der markierte Text und die
 *   Marken; beide gehen an `replaceChartFencesForExport`.
 */
export function markiereKartenDiagrammeFuerExport(text) {
  const source = String(text == null ? '' : text);
  if (!isExtensionActive(CHART_EXTENSION_ID)) return { text: source, karten: [] };
  return markiereKartenDiagramme(source);
}

// Die Aufträge an die Brücke: je verschiedenem Block-Inhalt der obersten Ebene
// einer, aufgelöst gegen den Text des Reiters, und je verschiedenem Paar aus
// Karten-Text und Block-Inhalt einer, aufgelöst gegen den Karten-Text.
function auftraege(source, dokumentText, karten) {
  const liste = [];
  const oben = new Map();
  for (const body of sammleDiagrammQuellen(source)) {
    if (!oben.has(body)) {
      const auftrag = { body, dokumentText };
      oben.set(body, auftrag);
      liste.push(auftrag);
    }
  }
  const inKarten = new Map();
  const jeMarke = new Map();
  for (const karte of karten) {
    if (!karte.zeichnen || findeDiagrammBloecke(source, karte.marke).length === 0) continue;
    const schluessel = `${karte.kartenText}\0${karte.body}`;
    if (!inKarten.has(schluessel)) {
      const auftrag = { body: karte.body, dokumentText: karte.kartenText };
      inKarten.set(schluessel, auftrag);
      liste.push(auftrag);
    }
    jeMarke.set(karte.marke, inKarten.get(schluessel));
  }
  return { liste, oben, jeMarke };
}

/**
 * Ersetzt im Text des portablen Exports jeden zeichenbaren Diagramm-Block durch
 * ein hell gezeichnetes Bild.
 *
 * @param {string} text Der schon umgewandelte Text des Exports.
 * @param {{dokumentText?: string, basePath?: string, karten?: Array<object>}} [kontext]
 *   `dokumentText` ist der Text des Reiters, gegen den eine Tabelle im selben
 *   Dokument aufgelöst wird (auch ungespeichert); `basePath` sein Pfad, gegen
 *   den ein anderes Dokument gesucht wird (leer bei einem unbenannten Reiter),
 *   auch für ein Diagramm in einer Karte wie in der Canvas-Ansicht; `karten`
 *   die Marken aus `markiereKartenDiagrammeFuerExport`. Ein Diagramm in einer
 *   Karte wird gegen seinen Karten-Text aufgelöst; jede Marke wird zum Schluss
 *   zurückgesetzt, auch im Aus-Zustand.
 * @returns {Promise<string>} Der Text mit den Bildern; ohne Diagramm, im
 *   Aus-Zustand und wenn nichts zeichenbar ist, der Text unverändert.
 */
export async function replaceChartFencesForExport(text, kontext = {}) {
  const source = String(text == null ? '' : text);
  const karten = Array.isArray(kontext.karten) ? kontext.karten : [];
  if (!isExtensionActive(CHART_EXTENSION_ID)) return stelleKartenMarkenWiederHer(source, karten);
  const dokumentText = typeof kontext.dokumentText === 'string' ? kontext.dokumentText : '';
  const basePath = typeof kontext.basePath === 'string' ? kontext.basePath : '';
  const { liste, oben, jeMarke } = auftraege(source, dokumentText, karten);
  const farben = helleExportFarben();
  const texte = chartDescriptionTexts(t);
  const lesungen = new Map();
  await Promise.all(
    liste.map(async (auftrag, i) => {
      const angaben = {
        colors: farben,
        idPrefix: `${KENNUNGS_PRAEFIX}-${i}`,
        descriptionTexts: texte,
      };
      try {
        auftrag.ersatz = await ersatzFuer(
          auftrag.body,
          angaben,
          { dokumentText: auftrag.dokumentText, basePath },
          lesungen,
        );
      } catch (err) {
        // Ein Fehler in einem Diagramm darf den Export nicht abbrechen.
        console.warn('perspective-chart: Zeichnen für den Export fehlgeschlagen:', err);
      }
    }),
  );
  let aus = ersetzeDiagrammBloecke(source, (body) => oben.get(body).ersatz || null);
  for (const [marke, auftrag] of jeMarke) {
    if (auftrag.ersatz) aus = ersetzeDiagrammBloecke(aus, () => auftrag.ersatz, marke);
  }
  return stelleKartenMarkenWiederHer(aus, karten);
}
