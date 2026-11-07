'use strict';

// 4T-002518 (Epic 3E-000402): Dashboards im portablen Export (Story 4S-001187,
// AK3, AK4 und AK7). Das Modul beantwortet eine Frage: wie die Kacheln eines
// Blocks `perspective-dashboard` mit der Vorbelegung ihrer Filter ausgewertet
// werden, damit der Export sie als statischen Text und als Bild zeigt. Das
// Markdown selbst baut der prozess-neutrale Kern
// `src/shared/dashboard/dashboard-portabel.js`.
//
// **Muster `charts/chart-export.js`:** gezeichnet wird über die Brücke, hell und
// unabhängig von der Anzeige (`helleExportFarben`), das Bild als Bild-Element
// mit Daten-Adresse, eingebettet in die Datei (`mermaidSvgBlock`); Entscheidung
// der Sitzung vom 2026-11-03: genau dieser Weg. Ein Fehler einer Kachel bricht
// den Export nicht ab.
//
// **Der Ersatz läuft vor der Umwandlung** (`convertMarkdownPortable` in
// `views/save-export.js`): Die Kacheln werden Markdown mit Verweisen in der
// Form des Dokuments, und dieselbe Umwandlung wie für den Text ringsherum
// nimmt danach Kommentare, Zeilenende-Marker und Inline-Berechnungen der
// Text-Kacheln heraus.
//
// **Ausgewertet wie in der Ansicht, ohne deren Container:** dieselben Kanäle
// (`dashboardAbfrageDatei` mit der Abfrage-Datei als Grundpfad,
// `runFrontmatterQuery` mit den Werten der Filter) und derselbe Verteiler
// (`buildQueryListDom` mit der Vorgabe-Form der Art). Aus seinem Ergebnis liest
// dieses Modul nur, welche Form gezeichnet wurde, die Hinweise, die Kennzahl
// und das Bild; Liste und Tabelle baut der Kern aus der Ergebnismenge, damit
// die Verweise ihre Ziele behalten. Gewertet wird mit der Vorbelegung, nie mit
// der Auswahl am Kopf: Der Export zeigt den Stand, den das Dokument selbst
// beschreibt (Abschnitt 3.5 der Konzept-Stufe).
//
// **Wartezeit** (Entscheidung der Sitzung vom 2026-11-03): je Dashboard
// höchstens zehn Sekunden auf die Auflösung der Abfrage-Dateien
// (`warteAufDashboardQuellen`), die Leerlauf-Schranke der Abfragen und die
// Auswertungen dieses Exports; danach trägt jede noch nicht ausgewertete
// Kachel den Hinweis `exportNichtAusgewertet`, und der Export läuft weiter.
//
// **Aus-Zustand** (Story 4S-001188, AK5): Der Text bleibt unverändert, der
// Block also ein gewöhnlicher Code-Block.

import { t, intlLocale } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  buildQueryListDom,
  waitForFrontmatterQueriesIdle,
} from '../query/frontmatter-query-view.js';
import { helleExportFarben } from '../charts/chart-export.js';
import { warteAufDashboardQuellen } from './dashboard-quelle.js';
// Meldet die internen Formen der Kacheln an, die der Verteiler wählt.
import './dashboard-formen.js';
import { chartDescriptionTexts } from '../../../shared/charts/chart-call-options.js';
import { mermaidSvgBlock } from '../../../shared/mermaid-fence.js';
import {
  DASHBOARD_EXTENSION_ID,
  dashboardSicht,
  parseDashboardFence,
} from '../../../shared/dashboard/dashboard-core.js';
import {
  dashboardPortabel,
  ersetzeDashboardBloecke,
  findeDashboardBloecke,
  ueberschriftEbene,
  vorbelegungsWerte,
} from '../../../shared/dashboard/dashboard-portabel.js';

// Vorgabe-Form je Daten-Art, gleich `VORGABE_FORM` in
// src/shared/markdown/dashboard-block.js; ein Prüffall hält beide gleich. Nicht
// importiert, weil jenes Modul die Markdown-Pipeline samt Datei-Zugriff in das
// Bündel des Anzeige-Prozesses zöge.
export const VORGABE_FORM = Object.freeze({
  kennzahl: 'kennzahl',
  liste: 'liste',
  tabelle: 'tabelle',
  balken: 'bar',
  kreis: 'pie',
});

/** Höchste Wartezeit je Dashboard in Millisekunden. */
export const EXPORT_WARTEZEIT_MS = 10000;

// Präfix der Kennungen in den Bildern, abgesetzt von Ansicht (`qc-…`) und
// Diagramm-Export (`chx-…`).
const KENNUNGS_PRAEFIX = 'dbx';

const FEHLER_CODES = new Set([
  'abfrageDateiFehlt',
  'abfrageDateiNichtLesbar',
  'keineAbfrageDatei',
  'abfrageDateiOhneBlock',
  'abfrageDateiMehrereBloecke',
]);

function texte(wurzel, selektor) {
  return Array.from(wurzel.querySelectorAll(selektor))
    .map((el) => String(el.textContent || '').trim())
    .filter((s) => s !== '');
}

function kennzahlEintraege(knoten) {
  if (knoten.classList.contains('dashboard-kennzahl-einzeln')) {
    return texte(knoten, '.dashboard-kennzahl-wert').map((wert) => ({ wert, beschriftung: null }));
  }
  return Array.from(knoten.querySelectorAll('.dashboard-kennzahl-gruppe')).map((g) => ({
    wert: texte(g, '.dashboard-kennzahl-wert')[0] || '',
    beschriftung: texte(g, '.dashboard-kennzahl-beschriftung')[0] || null,
  }));
}

/**
 * Das Ergebnis einer Kachel aus der Antwort des Abfrage-Kanals: dieselbe
 * Entscheidung wie in der Ansicht über `buildQueryListDom`, mit hellem Bild.
 * @param {object} payload Antwort des Kanals oder ein Zustand
 * @param {string} form Vorgabe-Form der Art (`VORGABE_FORM`)
 * @param {{kennung: string, titel: string}} kachel
 * @returns {object} Ergebnis für `dashboardPortabel`
 */
export function ergebnisAusAntwort(payload, form, kachel) {
  let bild = null;
  const drawChart = (input) => {
    const erg = api.buildChartFromInput(input, {
      colors: helleExportFarben(),
      idPrefix: `${KENNUNGS_PRAEFIX}-${kachel.kennung}`,
      descriptionTexts: chartDescriptionTexts(t),
    });
    if (erg && erg.status === 'drawn' && typeof erg.svg === 'string') bild = erg.svg;
    return erg;
  };
  const wurzel = document.createElement('div');
  wurzel.appendChild(buildQueryListDom(payload, t, { drawChart, vorgabeForm: form }));
  const hinweise = texte(
    wurzel,
    ':scope > .perspective-query-hint, :scope > .perspective-query-status',
  );
  const rs = payload && payload.resultSet;
  const kennzahl = wurzel.querySelector('.dashboard-kennzahl');
  if (kennzahl) return { art: 'kennzahl', hinweise, eintraege: kennzahlEintraege(kennzahl) };
  if (wurzel.querySelector('.perspective-query-chart') && bild) {
    const alt = kachel.titel || t('export.mermaidAlt');
    return {
      art: 'bild',
      hinweise,
      bild: mermaidSvgBlock(bild, alt),
      zeilen: texte(wurzel, '.perspective-chart-omitted'),
    };
  }
  if (rs && wurzel.querySelector('table')) return { art: 'tabelle', hinweise, resultSet: rs };
  if (rs && wurzel.querySelector('ul, .perspective-query-group')) {
    return { art: 'liste', hinweise, resultSet: rs };
  }
  return { art: 'hinweise', hinweise };
}

async function abfrageDer(k, basePath) {
  if (k.quelle.typ !== 'datei') return { abfrage: k.quelle.text, grund: basePath };
  // Befund B1 der Review-Runde 1: Ohne Pfad derselbe Hinweis wie bei einer
  // Kachel mit Abfrage im Block («erst nach dem Speichern verfügbar»).
  if (!basePath) return { abfrage: '', grund: '' };
  if (typeof api.dashboardAbfrageDatei !== 'function') {
    return { fehler: { art: 'fehler', code: 'abfrageDateiFehlt', name: k.quelle.ziel } };
  }
  const antwort = await Promise.resolve()
    .then(() => api.dashboardAbfrageDatei(basePath, k.quelle.ziel))
    .catch(() => null);
  if (antwort && antwort.ok === true && typeof antwort.abfrage === 'string') {
    return { abfrage: antwort.abfrage, grund: antwort.pfad };
  }
  const code = antwort && FEHLER_CODES.has(antwort.code) ? antwort.code : 'abfrageDateiFehlt';
  const name = antwort && typeof antwort.name === 'string' && antwort.name ? antwort.name : '';
  return { fehler: { art: 'fehler', code, name: name || k.quelle.ziel } };
}

async function werteKachelAus(k, werte, basePath, kennung) {
  const quelle = await abfrageDer(k, basePath);
  if (quelle.fehler) return quelle.fehler;
  let payload;
  if (!quelle.grund) {
    payload = { status: 'unavailable' };
  } else {
    try {
      payload = await api.runFrontmatterQuery(quelle.grund, quelle.abfrage, intlLocale(), werte);
    } catch {
      payload = null;
    }
  }
  return ergebnisAusAntwort(payload || { status: 'error' }, VORGABE_FORM[k.art], {
    kennung,
    titel: k.titel,
  });
}

function mitGrenze(versprechen, ms) {
  return new Promise((resolve) => {
    const zeitGeber = setTimeout(resolve, ms);
    versprechen.then(() => {
      clearTimeout(zeitGeber);
      resolve();
    });
  });
}

async function exportiereBlock(block, source, basePath, nr) {
  const sicht = dashboardSicht(parseDashboardFence(block.body));
  const werte = vorbelegungsWerte(sicht);
  const ergebnisse = new Map();
  const auftraege = [];
  for (const reihe of sicht.zeilen) {
    for (const k of reihe.kacheln) {
      if (k.art === null || k.art === 'text' || k.quelle === null) continue;
      auftraege.push(
        werteKachelAus(k, werte, basePath, `${nr}-${k.index}`).then(
          (erg) => ergebnisse.set(k.index, erg),
          (err) => console.warn('dashboard: Kachel für den Export nicht auswertbar:', err),
        ),
      );
    }
  }
  const alles = Promise.allSettled([
    warteAufDashboardQuellen(),
    waitForFrontmatterQueriesIdle(),
    ...auftraege,
  ]);
  await mitGrenze(alles, EXPORT_WARTEZEIT_MS);
  // Eine Momentaufnahme: Was nach der Grenze eintrifft, ändert den Ersatz nicht.
  return dashboardPortabel(sicht, new Map(ergebnisse), {
    L: t,
    ebene: ueberschriftEbene(source, block.start),
  });
}

/**
 * Ersetzt im Text des Reiters jeden Dashboard-Block durch seine statische
 * Entsprechung mit der Vorbelegung (vor `convertMarkdownPortable`).
 *
 * @param {string} text Text des Reiters.
 * @param {string} basePath Pfad des Dokuments; leer bei einem unbenannten Reiter.
 * @returns {Promise<string>} Der Text mit den Entsprechungen; im Aus-Zustand
 *   und ohne Dashboard unverändert.
 */
export async function replaceDashboardFencesForExport(text, basePath) {
  const source = String(text == null ? '' : text);
  if (!isExtensionActive(DASHBOARD_EXTENSION_ID)) return source;
  const bloecke = findeDashboardBloecke(source);
  if (bloecke.length === 0) return source;
  const ersatz = [];
  // Ein Dashboard nach dem anderen: Die Wartezeit gilt je Dashboard.
  for (let nr = 0; nr < bloecke.length; nr++) {
    try {
      ersatz.push(await exportiereBlock(bloecke[nr], source, basePath || '', nr));
    } catch (err) {
      console.warn('dashboard: Block für den Export nicht umwandelbar:', err);
      ersatz.push(null);
    }
  }
  return ersetzeDashboardBloecke(source, (_block, nr) => ersatz[nr]);
}
