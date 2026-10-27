// 4T-002355 (Epic 3E-000184): «Neuer Workflow …» — eine Workflow-Datei im
// Workflow-Ordner anlegen.
//
// **Inhalt** (Entscheidung 3d der Konzept-Stufe, «Freigegeben. Mach weiter.»,
// Empfehlung pauschal übernommen): ein Dateikopf mit dem Kennzeichen
// `workflow: true`, dem Namen und einer Beschreibungs-Zeile, danach ein leerer
// `workflow`-Block mit zwei Kommentar-Zeilen als Hilfe. Die Beschreibung steht im
// Dateikopf unter `description`, weil der Format-Kern sie dort liest
// (`readWorkflowDocument`, Feld `meta.description`); die Kommentar-Zeilen
// beginnen mit `#` nach der Regel G2 des Zeilen-Lesers. Die Texte kommen in der
// Sprache des Fensters herein; dieses Modul kennt keine Sprache.
//
// **Name.** Der Dateiname folgt der Regel der übrigen Anlage-Wege
// (`sanitizeNewFileName`: keine Pfad-Trenner, keine unter Windows verbotenen
// Zeichen, ohne Endung wird `.md` ergänzt); der Name im Dateikopf ist der
// eingegebene ohne Markdown-Endung. Den Dateikopf schreibt `js-yaml` mit dem
// Schema, mit dem der Index ihn liest (Muster `database/masken-datei.js`), damit
// ein Name wie `true` oder `12` ein Name bleibt.
//
// **Nie überschreiben.** Angelegt wird exklusiv (`flag: 'wx'`); eine vorhandene
// Datei gleichen Namens lässt die Anlage scheitern (Code `exists`), wie bei
// `area:createFile`. Der Ordner muss bestehen; er entsteht hier nicht nebenbei.
//
// Electron-frei; der Datei-Zugriff kommt herein.
'use strict';

const path = require('node:path');
const yaml = require('js-yaml');
const { sanitizeNewFileName } = require('../area/area-path');

// Sprachneutrale Codes; den Satz bildet das Fenster.
const NEW_WORKFLOW_CODES = Object.freeze({
  invalidName: 'invalidName',
  exists: 'exists',
  folderMissing: 'folderMissing',
  writeFailed: 'writeFailed',
});

/**
 * Der Text einer neuen Workflow-Datei.
 *
 * @param {{name: string, description: string, hints: string[]}} p
 * @returns {string}
 */
function newWorkflowText({ name, description, hints }) {
  const kopf = yaml.dump(
    { workflow: true, name, description },
    { schema: yaml.JSON_SCHEMA, lineWidth: -1 },
  );
  const kommentare = (hints || []).map((h) => `# ${String(h).replace(/\r?\n/g, ' ')}`);
  return `---\n${kopf}---\n\n\`\`\`workflow\n${kommentare.join('\n')}\n\`\`\`\n`;
}

/**
 * Legt die Datei an.
 *
 * @param {object} p
 * @param {object} p.fsp Dateizugriff (`stat`, `writeFile`).
 * @param {string} p.folder Absoluter Workflow-Ordner.
 * @param {string} p.name Eingegebener Name.
 * @param {{description: string, hints: string[]}} p.texts Texte in der Sprache des Fensters.
 * @returns {Promise<{ok: true, path: string}|{ok: false, code: string, detail?: string}>}
 */
async function createNewWorkflow({ fsp, folder, name, texts }) {
  const fileName = sanitizeNewFileName(name);
  if (!fileName) return { ok: false, code: NEW_WORKFLOW_CODES.invalidName };
  try {
    const stat = await fsp.stat(folder);
    if (!stat.isDirectory()) return { ok: false, code: NEW_WORKFLOW_CODES.folderMissing };
  } catch {
    return { ok: false, code: NEW_WORKFLOW_CODES.folderMissing };
  }
  const ziel = path.join(folder, fileName);
  const anzeigeName = fileName.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  const text = newWorkflowText({ name: anzeigeName, ...texts });
  try {
    await fsp.writeFile(ziel, text, { encoding: 'utf8', flag: 'wx' });
    return { ok: true, path: ziel };
  } catch (err) {
    if (err && err.code === 'EEXIST') return { ok: false, code: NEW_WORKFLOW_CODES.exists };
    return {
      ok: false,
      code: NEW_WORKFLOW_CODES.writeFailed,
      detail: err && err.message ? err.message : String(err),
    };
  }
}

module.exports = { NEW_WORKFLOW_CODES, createNewWorkflow, newWorkflowText };
