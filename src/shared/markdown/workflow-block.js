// 4T-002351 (Epic 3E-000184): Der gefärbte `workflow`-Block der Darstellung.
//
// **Warum ein eigenes Modul neben markdown.js** (Muster `canvas-block.js`): Die
// Fence-Regel dort bleibt eine Weiche, der Aufbau des Markups liegt hier. Das
// hält die Pipeline-Datei innerhalb ihres eingefrorenen Größen-Werts und macht
// den Block ohne markdown-it prüfbar.
//
// **Ein Weg für alle Darstellungen:** Lese-Ansicht, geteilte Ansicht, Druck,
// erzeugte Teilbäume und das Block-Widget der Live-Ansicht (es rendert einen
// zugeklappten Block über dieselbe Pipeline) bekommen die Färbung über diese
// Weiche, ohne eigenen Nachbearbeitungs-Schritt. Der portable Export läuft über
// die eigene Instanz ohne diese Weiche und zeigt einen gewöhnlichen Code-Block
// (Entscheidung der Sitzung vom 2026-10-23, E6).
//
// **Markup:** dasselbe Gerüst wie ein gewöhnlicher Code-Block
// (`<pre><code class="hljs language-workflow">`), damit Kopier-Knopf,
// Grund-Stil und der Griff des Live-Widgets auf `pre` unverändert greifen; die
// Färbung tragen Spannen mit den Klassen `wf-keyword`, `wf-string` und
// `wf-placeholder`. Der Text-Inhalt bleibt Zeichen für Zeichen der Quelltext
// (AK5 des Tasks).
//
// Prozessneutral (CJS, kein DOM): Das Modul läuft im Preload und in den
// Unit-Tests gleichermaßen.
'use strict';

const { escapeHtml } = require('./slug.js');
const { workflowHighlightRanges } = require('../workflows/workflow-highlight.js');
const {
  WORKFLOWS_EXTENSION_ID,
  WORKFLOW_FENCE_LANG,
} = require('../workflows/workflow-konstanten.js');

const KLASSE = { keyword: 'wf-keyword', string: 'wf-string', placeholder: 'wf-placeholder' };

/**
 * Gehört der Block mit dieser Sprache in die Workflow-Darstellung?
 *
 * @param {string} lang erstes Wort des Info-Texts.
 * @param {(id: string) => boolean} enabled Schalt-Zustand der Erweiterungen.
 * @returns {boolean}
 */
function istWorkflowFence(lang, enabled) {
  return lang === WORKFLOW_FENCE_LANG && enabled(WORKFLOWS_EXTENSION_ID);
}

// Eine Zeile mit verschachtelten Spannen: Ein Platzhalter liegt in seinem Text.
function zeileHtml(zeile) {
  const spannen = workflowHighlightRanges(zeile);
  if (spannen.length === 0) return escapeHtml(zeile);
  const grenzen = [];
  for (const s of spannen) {
    grenzen.push({ pos: s.from, art: 'auf', kind: s.kind, laenge: s.to - s.from });
    grenzen.push({ pos: s.to, art: 'zu', laenge: s.to - s.from });
  }
  // Am selben Ort zuerst schließen, dann die längere Spanne zuerst öffnen.
  grenzen.sort(
    (a, b) =>
      a.pos - b.pos ||
      (a.art === b.art ? 0 : a.art === 'zu' ? -1 : 1) ||
      (a.art === 'auf' ? b.laenge - a.laenge : a.laenge - b.laenge),
  );
  let html = '';
  let pos = 0;
  for (const g of grenzen) {
    html += escapeHtml(zeile.slice(pos, g.pos));
    pos = g.pos;
    html += g.art === 'auf' ? `<span class="${KLASSE[g.kind]}">` : '</span>';
  }
  return html + escapeHtml(zeile.slice(pos));
}

/**
 * Das Markup eines `workflow`-Blocks.
 *
 * **Zaun-Zeile** (Nachzug vom 2026-10-24 auf die Entscheidung des Product
 * Owners vom 2026-10-23): Mit `map` (Zeilenbereich des Tokens) und `env` trägt
 * das `pre` die Zeile seiner öffnenden Zaun-Zeile im ganzen Dokument als
 * `data-wf-zeile`, gerechnet wie der Zeilen-Abgleich der Pipeline
 * (`sourceLineMapperPlugin`: `map[0] + 1` plus die Zeilen des abgetrennten
 * Dateikopfs). Darüber findet die gerenderte Ansicht zu jedem Block seine
 * Kopfzeile (`workflow-kopf-gerendert.js`). Ohne `map` entfällt das Merkmal.
 *
 * @param {string} inhalt Inhalt der Fence (ohne Zaun-Zeilen), wie markdown-it
 *   ihn liefert, mit abschließendem Zeilenumbruch.
 * @param {number[]|null} [map] Zeilenbereich des Tokens (0-basiert).
 * @param {{sourceLineOffset?: number}} [env] Umgebung des Render-Laufs.
 * @returns {string} HTML des Blocks.
 */
function workflowFenceHtml(inhalt, map, env) {
  const zeilen = String(inhalt == null ? '' : inhalt).split('\n');
  const rumpf = zeilen.map((z) => zeileHtml(z)).join('\n');
  const versatz = (env && env.sourceLineOffset) || 0;
  const merkmal = Array.isArray(map) ? ` data-wf-zeile="${map[0] + 1 + versatz}"` : '';
  return `<pre${merkmal}><code class="hljs language-${WORKFLOW_FENCE_LANG}">${rumpf}</code></pre>\n`;
}

module.exports = { istWorkflowFence, workflowFenceHtml };
