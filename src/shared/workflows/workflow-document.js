// 4T-002347 (Epic 3E-000184): Erkennung der Workflow-Datei (G1, G7).
//
// Eine Workflow-Datei ist eine gewöhnliche Markdown-Datei mit `workflow: true`
// im Dateikopf und genau einem Code-Block der Sprache `workflow` (Story
// 4S-001100). Dieses Modul liest Dateikopf, Block und Abschnitte; die Zeilen im
// Block liest der Zeilen-Leser, geprüft wird im Prüfer.
//
// **Eine Erkennung, zwei Wege.** `isWorkflowFlag` nimmt den Wahrheitswert und
// die Zeichenkette `true`, weil der Bereichs-Index beide gleich als `'true'`
// ablegt (`extractProperties` in `src/main/index/parse.js`); dieselbe Funktion
// prüft den rohen Dateikopf und die Index-Eigenschaft, damit Liste und
// Erkennung nie auseinanderlaufen. Aus demselben Grund fällt ein
// Byte-Order-Zeichen am Anfang weg wie im Index, bevor der Kopf-Leser liest.
//
// **Blöcke** nach der Zaun-Regel aus ihrer Heimat (`fence-level.js`): nur die
// oberste Ebene, Sprache genau `workflow`; ein Beispiel-Block in einem äußeren
// Zaun zählt nicht, ein nicht geschlossener reicht bis zum Textende.
//
// **Abschnitte** nach der Regel der Einbettungen (`heading-sections.js`); den
// Rumpf eines Abschnitts holt der Schritt erst zur Laufzeit (Entscheidung der
// Sitzung vom 2026-10-22, O1), weil ein früherer Schritt das Dokument ändern
// kann. Der Rumpf ist ohne die Überschrift (O3) und wird wörtlich übernommen
// (O2).
//
// **Die Erkennung schreibt nichts** und lässt eine Datei mit unbekanntem
// Auslöser unberührt (AK8 der Story). Der Kern kennt keine Sprache: Befunde
// sind Codes.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { extractFrontmatter } = require('../markdown/frontmatter.js');
const { schliesstZaun, zaunOeffnung } = require('../markdown/fence-level.js');
const { headingSections } = require('../markdown/heading-sections.js');
const { githubLikeSlug } = require('../markdown/slug.js');

const WORKFLOW_FLAG_KEY = 'workflow';
const WORKFLOW_FENCE = 'workflow';
const MANUAL_TRIGGER = 'manual';

/**
 * Trägt der Wert das Kennzeichen einer Workflow-Datei?
 *
 * @param {*} value Wert des Schlüssels `workflow` (roh oder aus dem Index).
 * @returns {boolean}
 */
function isWorkflowFlag(value) {
  return value === true || value === 'true';
}

function dateiStamm(fileName) {
  const basis = String(fileName || '')
    .split(/[\\/]/)
    .pop();
  const punkt = basis.lastIndexOf('.');
  return punkt > 0 ? basis.slice(0, punkt) : basis;
}

function nameAus(roh, fileName) {
  if (typeof roh === 'string' && roh.trim() !== '') return roh.trim();
  if (typeof roh === 'number' && Number.isFinite(roh)) return String(roh);
  return dateiStamm(fileName);
}

// Zahl der Zeilen, die der Dateikopf belegt (Index der ersten Rumpf-Zeile).
function kopfZeilen(raw) {
  if (!raw) return 0;
  const umbrueche = (raw.match(/\n/g) || []).length;
  return raw.endsWith('\n') ? umbrueche : umbrueche + 1;
}

// Alle Blöcke der obersten Ebene ab `von`, mit Lage und Inhalts-Zeilen.
function workflowBloecke(lines, von) {
  const bloecke = [];
  let offen = null;
  let aktuell = null;
  for (let i = von; i < lines.length; i++) {
    if (offen) {
      if (schliesstZaun(lines[i], offen)) {
        if (aktuell) aktuell.endLine = i + 1;
        offen = null;
        aktuell = null;
      } else if (aktuell) {
        aktuell.lines.push(lines[i]);
      }
      continue;
    }
    offen = zaunOeffnung(lines[i]);
    if (offen && offen.sprache === WORKFLOW_FENCE) {
      aktuell = { line: i + 1, contentLine: i + 2, endLine: null, lines: [] };
      bloecke.push(aktuell);
    }
  }
  // Ein nicht geschlossener Block reicht bis zum Textende (CommonMark).
  if (aktuell) aktuell.endLine = lines.length;
  return bloecke;
}

function befund(code, line, detail = {}) {
  return { code, line, blockLine: null, column: null, detail };
}

/**
 * Liest eine Workflow-Datei.
 *
 * @param {string} text Inhalt der Datei.
 * @param {{fileName?: string}} [options] Dateiname für den Rückfall des Namens.
 * @returns {{isWorkflow: boolean,
 *   meta: {name: string, trigger: string, description: string}|null,
 *   block: {line: number, contentLine: number, endLine: number, lines: string[]}|null,
 *   blockLines: number[], findings: object[]}}
 *   Zeilen ab 1 im Dokument; `block` nur bei genau einem Block.
 */
function readWorkflowDocument(text, options = {}) {
  const quelle = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  const kopf = extractFrontmatter(quelle);
  const daten = kopf.data;
  if (!daten || !isWorkflowFlag(daten[WORKFLOW_FLAG_KEY])) {
    return { isWorkflow: false, meta: null, block: null, blockLines: [], findings: [] };
  }
  const findings = [];
  const ausloeser = daten.trigger == null ? MANUAL_TRIGGER : daten.trigger;
  if (ausloeser !== MANUAL_TRIGGER) {
    findings.push(
      befund('triggerUnsupported', null, {
        trigger: typeof ausloeser === 'string' ? ausloeser : JSON.stringify(ausloeser),
      }),
    );
  }
  const meta = {
    name: nameAus(daten.name, options.fileName),
    trigger: typeof ausloeser === 'string' ? ausloeser : String(ausloeser),
    description: typeof daten.description === 'string' ? daten.description.trim() : '',
  };
  const lines = quelle.split(/\r?\n/);
  const bloecke = workflowBloecke(lines, kopfZeilen(kopf.raw));
  if (bloecke.length === 0) findings.push(befund('noBlock', null));
  if (bloecke.length > 1) {
    for (const b of bloecke)
      findings.push(befund('multipleBlocks', b.line, { count: bloecke.length }));
  }
  return {
    isWorkflow: true,
    meta,
    block: bloecke.length === 1 ? bloecke[0] : null,
    blockLines: bloecke.map((b) => b.line),
    findings,
  };
}

function ohneRandLeerzeilen(zeilen) {
  let von = 0;
  let bis = zeilen.length;
  while (von < bis && zeilen[von].trim() === '') von++;
  while (bis > von && zeilen[bis - 1].trim() === '') bis--;
  return zeilen.slice(von, bis);
}

/**
 * Der Rumpf eines Abschnitts des Workflow-Dokuments, für `from-section` zur
 * Laufzeit des Schritts: ohne Überschrift, ohne führende und abschließende
 * Leerzeilen, wörtlich. Gefunden wird über die Kennung der Überschrift wie bei
 * `[[Datei#Überschrift]]`; der Dateikopf zählt nicht mit.
 *
 * @param {string} text Inhalt des Workflow-Dokuments zum Zeitpunkt des Schritts.
 * @param {string} name Name des Abschnitts aus der Befehls-Zeile.
 * @returns {{ok: true, text: string}|{ok: false, code: 'sectionUnknown'|'sectionAmbiguous'}}
 */
function sectionBody(text, name) {
  const quelle = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  const lines = quelle.split(/\r?\n/);
  const gesucht = githubLikeSlug(name);
  const treffer = headingSections(lines, kopfZeilen(extractFrontmatter(quelle).raw)).filter(
    (s) => s.slug === gesucht,
  );
  if (treffer.length === 0) return { ok: false, code: 'sectionUnknown' };
  if (treffer.length > 1) return { ok: false, code: 'sectionAmbiguous' };
  const [abschnitt] = treffer;
  return {
    ok: true,
    text: ohneRandLeerzeilen(lines.slice(abschnitt.start + 1, abschnitt.end)).join('\n'),
  };
}

module.exports = {
  MANUAL_TRIGGER,
  // 4T-002348: dieselbe Zählung für die Einfüge-Stelle von `insert … under`.
  frontmatterLineCount: kopfZeilen,
  WORKFLOW_FENCE,
  WORKFLOW_FLAG_KEY,
  isWorkflowFlag,
  readWorkflowDocument,
  sectionBody,
};
