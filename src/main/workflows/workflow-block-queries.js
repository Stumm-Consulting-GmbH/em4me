// 4T-002464 (Epic 3E-000367): Die Fragen der Bedingungen und der Schleife im
// Hauptprozess — `if-exists`, `if-missing`, `if-property` und `for-each`
// (Stories 4S-001147 und 4S-001148, Entscheidungen 3f und 3g der
// Konzept-Runde 4T-002458).
//
// **Nur lesend.** Der Ablauf-Kern im Fenster (`workflow-runner.js`) stellt
// hier die Frage, ob eine Bedingung zutrifft, und holt die Liste einer
// Schleife; er führt Block und Wiederholung selbst aus. Die Antwort ist
// `{ ok: true, value }` für eine Bedingung und `{ ok: true, files }` mit
// wurzel-relativen Pfaden (mit `/`) für eine Schleife, sonst
// `{ ok: false, code, detail }`. Jeder Pfad läuft über dieselbe Grenze der
// Bereichs-Wurzel wie die Datei-Schritte (`resolveAreaPath`).
//
// **Bedeutungen:**
// - `if-exists` trifft zu, wenn an dem Pfad eine Datei oder ein Ordner liegt,
//   `if-missing` im anderen Fall (Story 4S-001147).
// - `if-property` liest den aktuellen Stand der Datei (ungespeicherter Stand
//   vor der Platte, `readCurrentText` wie die Inhalts-Schritte) und deren
//   Dateikopf. Mit Wert trifft es bei Gleichheit des Texts zu (eine Zahl oder
//   ein Wahrheitswert im Dateikopf zählt mit ihrer Schreibweise); ohne Wert,
//   wenn die Eigenschaft gesetzt und nicht leer ist. Eine fehlende Eigenschaft
//   und eine Datei ohne Dateikopf treffen nicht zu. **Listen** (etwa `tags`)
//   treffen mit Wert zu, wenn ein Eintrag dem Wert gleicht (Vergleich wie bei
//   einfachen Werten), ohne Wert, wenn die Liste nicht leer ist
//   (Entscheidung des Product Owners vom 2026-10-31). **Im Zweifel streng:**
//   Ein Objekt im Dateikopf ist keinem Text gleich; eine fehlende Datei ist
//   ein Fehlschlag `fileMissing` wie bei den Inhalts-Schritten, ein
//   unlesbarer Dateikopf `frontmatterInvalid`.
// - `for-each` liest die Dateien des Ordners, mit `**` samt Unterordnern, die
//   zum Namens-Muster passen (`parseLoopPattern`, `loopNameMatches` aus dem
//   Prüfer). Übersprungen werden `node_modules`, Punkt-Einträge und
//   Verknüpfungen wie in jedem Ordner-Lauf der Anwendung. Die Suche bricht
//   ab, sobald mehr als `MAX_LOOP_FILES` Dateien gefunden sind, und meldet
//   `tooManyFiles`; ein fehlender Ordner ist `folderMissing`, eine Datei an
//   seiner Stelle `notAFolder`. Die Reihenfolge stellt der Ablauf-Kern her.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { MAX_LOOP_FILES } = require('../../shared/workflows/workflow-catalog.js');
const { loopNameMatches, parseLoopPattern } = require('../../shared/workflows/workflow-check.js');
const { resolveAreaPath } = require('./workflow-area-path.js');
const { readCurrentText } = require('./workflow-content-steps.js');

/** Die Befehle dieses Moduls. */
const QUERY_KEYWORDS = Object.freeze(['if-exists', 'if-missing', 'if-property', 'for-each']);

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

async function statOderNull(abs) {
  try {
    return await fs.stat(abs);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

// Ist ein Wert im Dateikopf «gesetzt und nicht leer»?
function gesetzt(wert) {
  if (wert === null || wert === undefined) return false;
  if (typeof wert === 'string') return wert.trim() !== '';
  if (Array.isArray(wert)) return wert.length > 0;
  if (typeof wert === 'object') return Object.keys(wert).length > 0;
  return true;
}

// Gleicht ein einfacher Wert im Dateikopf dem erwarteten Text? Eine Zahl
// oder ein Wahrheitswert zählt mit ihrer Schreibweise; null und Objekte
// gleichen keinem Text.
function wertGleich(wert, wanted) {
  if (wert === null || typeof wert === 'object') return false;
  return String(wert) === String(wanted);
}

/**
 * Trifft `if-property` auf einen Dateikopf zu? Bei einer Liste genügt ein
 * Eintrag, der dem Wert gleicht.
 *
 * @param {object|null} data Dateikopf aus `extractFrontmatter` (null ohne Kopf).
 * @param {string} key Eigenschafts-Name.
 * @param {string|number|undefined} wanted erwarteter Wert; ohne Wert «gesetzt».
 * @returns {boolean}
 */
function propertyMatches(data, key, wanted) {
  if (!data || !Object.prototype.hasOwnProperty.call(data, key)) return false;
  const wert = data[key];
  if (wanted === undefined) return gesetzt(wert);
  if (Array.isArray(wert)) return wert.some((eintrag) => wertGleich(eintrag, wanted));
  return wertGleich(wert, wanted);
}

// Die passenden Dateien unter `abs`, wurzel-relativ; null bei zu vielen.
async function dateienDesMusters(root, abs, muster) {
  const treffer = [];
  const queue = [abs];
  while (queue.length > 0) {
    const dir = queue.shift();
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (muster.recursive) queue.push(full);
      } else if (entry.isFile() && loopNameMatches(muster.name, entry.name)) {
        treffer.push(path.relative(root, full).split(path.sep).join('/'));
        if (treffer.length > MAX_LOOP_FILES) return null;
      }
    }
  }
  return treffer;
}

/**
 * Baut die Fragen der Bedingungen und der Schleife.
 *
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {object} deps.backlinks Bereichs-Index (Puffer-Stand).
 * @returns {{runQueryStep: Function}}
 */
function createWorkflowBlockQueries(deps) {
  const { backlinks } = deps;

  async function bedingung(ctx, step) {
    const [ziel, key, wanted] = step.args;
    const ort = await resolveAreaPath(ctx.root, ziel);
    if (!ort.ok) return ort;
    const stat = await statOderNull(ort.abs);
    if (step.keyword === 'if-exists') return { ok: true, value: stat !== null };
    if (step.keyword === 'if-missing') return { ok: true, value: stat === null };
    if (stat === null) return fehlschlag('fileMissing', { path: ziel });
    if (!stat.isFile()) return fehlschlag('notAFile', { path: ziel });
    const gelesen = await readCurrentText(ctx.backlinks || backlinks, ort.abs);
    if (!gelesen.ok) return fehlschlag('fileMissing', { path: ziel, fsCode: gelesen.fsCode });
    const kopf = extractFrontmatter(gelesen.text);
    if (kopf.parseError) return fehlschlag('frontmatterInvalid', { path: ziel });
    return { ok: true, value: propertyMatches(kopf.data, key, wanted) };
  }

  async function liste(ctx, step) {
    const muster = parseLoopPattern(step.args[0]);
    if (!muster.ok) return fehlschlag('invalidStep', { pattern: step.args[0] });
    const ordner = muster.folder || '.';
    const ort = await resolveAreaPath(ctx.root, ordner);
    if (!ort.ok) return ort;
    const stat = await statOderNull(ort.abs);
    if (stat === null) return fehlschlag('folderMissing', { path: muster.folder });
    if (!stat.isDirectory()) return fehlschlag('notAFolder', { path: muster.folder });
    const files = await dateienDesMusters(path.resolve(ctx.root), ort.abs, muster);
    if (files === null) return fehlschlag('tooManyFiles', { max: MAX_LOOP_FILES });
    return { ok: true, files };
  }

  /**
   * Beantwortet die Frage einer Bedingung oder holt die Liste einer Schleife.
   *
   * @param {object} ctx Lauf-Kontext: `root`, `backlinks`.
   * @param {object} step gefüllter Schritt aus dem Ablauf-Kern.
   * @returns {Promise<object>} `{ ok: true, value }`, `{ ok: true, files }` oder
   *   `{ ok: false, code, detail }`.
   */
  async function runQueryStep(ctx, step) {
    try {
      return step.keyword === 'for-each' ? await liste(ctx, step) : await bedingung(ctx, step);
    } catch (err) {
      return fehlschlag('unexpected', { fsCode: err && err.code ? err.code : null });
    }
  }

  return { runQueryStep };
}

module.exports = { QUERY_KEYWORDS, createWorkflowBlockQueries, propertyMatches };
