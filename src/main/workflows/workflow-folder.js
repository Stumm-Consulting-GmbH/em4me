// 4T-002355 (Epic 3E-000184): Der Workflow-Ordner — seine Einstellung auf zwei
// Ebenen und das Lesen seiner Workflows.
//
// **Zwei Ebenen wie beim Vorlagen-Ordner** (Entscheidung 3b der Konzept-Stufe):
// anwendungsweit im Einstellungs-Speicher unter `workflows.folder`, je Bereich
// in der Bereichsdatei `Area_Settings.mdda` unter `settings.workflows.folder`,
// dort relativ zur Bereichs-Wurzel (absolute Angaben werden toleriert). Eine
// gesetzte Bereichs-Sektion ersetzt die anwendungsweite vollständig — Vorbild
// `resolveTemplatesConfig` in `src/main/documents/templates.js`.
//
// **Was im Ordner als Workflow gilt** (Entscheidung 3c): eine Markdown-Datei,
// die das Kennzeichen `workflow: true` trägt; erkannt mit derselben Funktion wie
// im Format-Kern (`readWorkflowDocument`), damit Liste und Erkennung nie
// auseinanderlaufen. Dateien ohne Kennzeichen fehlen, ebenso Unterordner ohne
// Workflow. Je Ebene stehen die Workflows alphabetisch nach Name vorn, danach
// die Unterordner als Gruppen, alphabetisch nach Ordnername (Muster
// `sortedTemplateEntries`). Ausgelassen werden wie bei jedem Ordner-Lauf der
// Anwendung `node_modules` und Punkt-Einträge.
//
// Kein Electron; der Datei-Zugriff kommt als Parameter, damit die Prüffälle
// gegen ein echtes Temp-Verzeichnis laufen.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { readWorkflowDocument } = require('../../shared/workflows/workflow-document.js');

// Eine Workflow-Datei ist ein kurzer Text; was größer ist, wird nicht gelesen.
// Dieselbe Grenze wie bei gelesenem Markdown-Text (MAX_EMBED_BYTES in main.js).
const MAX_WORKFLOW_BYTES = 5 * 1024 * 1024;

const MARKDOWN_ENDUNGEN = new Set(['.md', '.markdown', '.mdown', '.mkd']);

function istMarkdown(name) {
  return MARKDOWN_ENDUNGEN.has(path.extname(name).toLowerCase());
}

const vergleich = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Normalisiert die Sektion `workflows` (Bereichsdatei oder Einstellungs-Wert).
 *
 * @param {*} value Roh-Wert.
 * @returns {{folder: string}|null} null = keine Konfiguration; eine Sektion ohne
 *   Ordner gilt wie beim Vorlagen-Ordner als nicht gesetzt.
 */
function normalizeWorkflowsConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.folder !== 'string' || value.folder.trim() === '') return null;
  return { folder: value.folder.trim() };
}

/**
 * Der wirksame Workflow-Ordner: Bereich vor global.
 *
 * @param {{areaRootPath: string|null, areaConfig: *, globalFolder: *}} quellen
 * @returns {{source: 'area'|'global'|'none', folder: string|null}} `folder` absolut.
 */
function resolveWorkflowsFolder({ areaRootPath, areaConfig, globalFolder }) {
  const area = normalizeWorkflowsConfig(areaConfig);
  if (area && typeof areaRootPath === 'string' && areaRootPath !== '') {
    return { source: 'area', folder: path.resolve(areaRootPath, area.folder) };
  }
  const global = normalizeWorkflowsConfig({ folder: globalFolder });
  if (global) return { source: 'global', folder: path.resolve(global.folder) };
  return { source: 'none', folder: null };
}

async function workflowAusDatei(abs, relPath, groesseMax) {
  try {
    const stat = await fsp.stat(abs);
    if (stat.size > groesseMax) return null;
    const text = await fsp.readFile(abs, 'utf8');
    const doc = readWorkflowDocument(text, { fileName: path.basename(abs) });
    if (!doc.isWorkflow) return null;
    return {
      kind: 'workflow',
      name: doc.meta.name,
      description: doc.meta.description,
      relPath,
      absPath: abs,
    };
  } catch {
    // Eine unlesbare Datei fehlt in der Liste; die übrigen bleiben (Fehler je Knoten).
    return null;
  }
}

async function leseEbene(dir, relDir, optionen) {
  let eintraege;
  try {
    eintraege = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const workflows = [];
  const gruppen = [];
  for (const eintrag of eintraege) {
    if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue;
    const abs = path.join(dir, eintrag.name);
    const rel = relDir ? `${relDir}/${eintrag.name}` : eintrag.name;
    if (eintrag.isDirectory()) {
      const items = await leseEbene(abs, rel, optionen);
      if (items && items.length > 0)
        gruppen.push({ kind: 'group', name: eintrag.name, relPath: rel, items });
    } else if (eintrag.isFile() && optionen.isMarkdownPath(eintrag.name)) {
      const workflow = await workflowAusDatei(abs, rel, optionen.maxBytes);
      if (workflow) workflows.push(workflow);
    }
  }
  workflows.sort(
    (a, b) => vergleich.compare(a.name, b.name) || vergleich.compare(a.relPath, b.relPath),
  );
  gruppen.sort((a, b) => vergleich.compare(a.name, b.name));
  return [...workflows, ...gruppen];
}

function flach(items, out = []) {
  for (const item of items) {
    if (item.kind === 'group') flach(item.items, out);
    else out.push(item);
  }
  return out;
}

/**
 * Liest die Workflows eines Ordners samt Unterordnern.
 *
 * @param {string|null} folder Absoluter Ordner oder null.
 * @param {{isMarkdownPath?: Function, maxBytes?: number}} [options]
 * @returns {Promise<{missing: boolean, items: object[], workflows: object[]}>}
 *   `items` ist der Baum (Workflows, dann Gruppen je Ebene), `workflows` dieselben
 *   Workflows flach in Anzeige-Reihenfolge; `relPath` mit `/` als Trenner.
 *   `missing` meldet einen festgelegten, aber nicht lesbaren Ordner.
 */
async function readWorkflowFolder(folder, options = {}) {
  if (typeof folder !== 'string' || folder === '') {
    return { missing: false, items: [], workflows: [] };
  }
  const items = await leseEbene(folder, '', {
    isMarkdownPath: options.isMarkdownPath || istMarkdown,
    maxBytes: options.maxBytes || MAX_WORKFLOW_BYTES,
  });
  if (items === null) return { missing: true, items: [], workflows: [] };
  return { missing: false, items, workflows: flach(items) };
}

module.exports = {
  MAX_WORKFLOW_BYTES,
  normalizeWorkflowsConfig,
  readWorkflowFolder,
  resolveWorkflowsFolder,
};
