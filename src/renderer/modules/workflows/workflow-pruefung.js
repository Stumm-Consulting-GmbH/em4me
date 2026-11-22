// 4T-002351 (Epic 3E-000184): Die Prüfung vor dem Laufen auf der Seite des
// Fensters und die Texte ihrer Befunde.
//
// **Eine Prüfung für Anzeige und Start.** Die Kopfzeile über dem Block
// (`workflow-kopf.js`) und der Start (4T-002349) rufen dieselbe Funktion
// `pruefeWorkflow`; damit zeigt die Anzeige denselben Befund, den der Start
// meldet (AK2 des Tasks, Story 4S-001107), durch den Bau statt durch zwei
// gleich gebaute Aufrufe.
//
// **Rückfragen per Registrierung.** Ob ein Kommando, ein Makro oder ein
// Workflow bekannt ist, weiß der Kern nicht; er fragt über Funktionen in den
// Optionen. Die Kommando-Kennungen liest dieses Modul aus der Registry
// `src/shared/commands/commands.js`; Makro- und Workflow-Namen kommen über
// `registriereRueckfragen` herein (Makros aus `initMacros` in macros.js,
// Workflows mit 4T-002355) und nicht über Importe, damit der Ordner
// `workflows/` keinen Zyklus mit Kommando-Platzierung und Editor bildet (Wächter `scripts/lint-ordner-importe.js`). Ohne
// Registrierung entfällt die jeweilige Prüfung, wie der Kern es vorsieht.
// Seit 4T-002544 ebenso die Rückfragen `dbTable` und `dbQuery` nach Tabellen,
// Feldern und Abfrage-Dateien (`workflow-db-rueckfrage.js`), dazu der
// Schalter der Erweiterung «Datenbank» als `databaseEnabled`. Seit 4T-002692
// kommt die Rückfrage `dbFile` hinzu (Tabellen-Datei oder Karteikarte).
//
// **Hinweise** (4T-002692): Die Stufe «Hinweis» des Prüfers (`analyse.hints`)
// zeigt die Kopfzeile nach den Befunden, mit eigenem Vorspann «Hinweis zu
// Zeile N» statt «Zeile N». Ohne Befund bleibt die Aussage `ok` und damit grün,
// beginnt mit «bereit» und trägt `hinweis: true`; ein Hinweis macht die
// Kopfzeile nie rot, weil er nichts sperrt. Texte unter `workflow.hinweis.<code>`.
//
// **Texte:** Der Kern liefert Codes, die Texte liegen im Fragment
// `src/i18n/fragments/<code>/workflows.json` unter `workflow.befund.<code>`.
// Ein Code ohne Text meldet sich in der Konsole (lauter Nachschlage-Vorgang,
// Entwicklungsrichtlinien, Kapitel 1) und erscheint als Code.
'use strict';

import { COMMANDS } from '../../../shared/commands/commands.js';
import { analyzeWorkflow } from '../../../shared/workflows/workflow-core.js';
import { t } from '../../i18n.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { isPerspectiveScriptsEnabled } from '../query/perspective-script-view.js';

const RUECKFRAGEN = [
  'isKnownCommand',
  'isKnownMacro',
  'isKnownWorkflow',
  'dbTable',
  'dbQuery',
  // 4T-002692: Tabellen-Datei oder Karteikarte für die Stufe «Hinweis».
  'dbFile',
];
// Die Kommando-Kennungen liest die Prüfung selbst aus der Registry (ein
// prozess-neutrales Modul, kein Zyklus); dynamische Kommandos stehen dort mit.
const kommandoBekannt = (id) => COMMANDS.some((c) => c.id === id);
const rueckfragen = { isKnownCommand: kommandoBekannt };

/**
 * Nimmt Rückfragen des Kerns entgegen; nur Funktionen unter den bekannten
 * Namen aus `RUECKFRAGEN` werden übernommen, eine fehlende bleibt unverändert.
 *
 * @param {{isKnownCommand?: Function, isKnownMacro?: Function,
 *   isKnownWorkflow?: Function, dbTable?: Function, dbQuery?: Function,
 *   dbFile?: Function}} fragen
 */
export function registriereRueckfragen(fragen) {
  for (const name of RUECKFRAGEN) {
    if (fragen && typeof fragen[name] === 'function') rueckfragen[name] = fragen[name];
  }
}

/**
 * Die registrierten Rückfragen, für das Füllen vor dem Lauf (`prepareRun` in
 * 4T-002349), damit Prüfung und Start dieselben Antworten bekommen.
 *
 * @returns {{isKnownCommand: Function, isKnownMacro?: Function, isKnownWorkflow?: Function}}
 */
export function aktuelleRueckfragen() {
  return { ...rueckfragen };
}

// Für die Prüfdateien: Rückfragen auf den Anfangs-Stand zurücksetzen.
export function rueckfragenZuruecksetzen() {
  for (const name of RUECKFRAGEN) delete rueckfragen[name];
  rueckfragen.isKnownCommand = kommandoBekannt;
}

/**
 * Prüft eine Workflow-Datei vor dem Laufen mit dem Stand des Fensters.
 *
 * @param {string} text Inhalt der Datei (der Stand des Puffers).
 * @param {{fileName?: string}} [opts]
 * @returns {object} Ergebnis von `analyzeWorkflow`.
 */
export function pruefeWorkflow(text, opts = {}) {
  return analyzeWorkflow(text, {
    fileName: opts.fileName,
    templatesEnabled: isExtensionActive('templates'),
    // 4T-002465 (3n): die Einstellung «Skript-Blöcke ausführen» des Fensters.
    scriptsEnabled: isPerspectiveScriptsEnabled(),
    // 4T-002544: Befund «Datenbank ist ausgeschaltet» an jedem Datenbank-Befehl.
    databaseEnabled: isExtensionActive('database'),
    ...rueckfragen,
  });
}

// Der Text zu einem Schlüssel oder null, wenn die Sprachdatei ihn nicht kennt.
function text(key) {
  const wert = t(key);
  return wert === key ? null : wert;
}

/**
 * Der i18n-Schlüssel des Texts zu einem Befund.
 *
 * @param {{code: string, detail?: object}} befund
 * @returns {string}
 */
export function befundSchluessel(befund) {
  if (befund.code === 'pathOutsideArea') {
    const art = befund.detail && befund.detail.kind === 'absolute' ? 'Absolute' : 'Parent';
    return `workflow.befund.pathOutsideArea${art}`;
  }
  return `workflow.befund.${befund.code}`;
}

// Werte der Platzhalter eines Befund-Texts; interne Kennungen werden übersetzt.
function befundWerte(detail = {}) {
  const werte = { ...detail };
  werte.name = detail.name ?? detail.keyword ?? detail.placeholder ?? '';
  if (detail.expected)
    werte.expected = text(`workflow.argument.${detail.expected}`) ?? detail.expected;
  if (detail.group) werte.group = text(`workflow.gruppe.${detail.group}`) ?? detail.group;
  return werte;
}

function einsetzen(vorlage, werte) {
  return vorlage.replace(/\{(\w+)\}/g, (ganz, name) =>
    werte[name] === undefined || werte[name] === null ? ganz : String(werte[name]),
  );
}

/**
 * Der Grund eines Befunds in der Sprache der Anwendung.
 *
 * @param {{code: string, detail?: object}} befund
 * @returns {string}
 */
export function befundText(befund) {
  const vorlage = text(befundSchluessel(befund));
  if (vorlage === null) {
    console.warn(`[Workflows] Kein Text für den Befund-Code '${befund.code}'.`);
    return befund.code;
  }
  return einsetzen(vorlage, befundWerte(befund.detail || {}));
}

/**
 * Eine Zeile der Prüf-Anzeige: Zeile im Dokument und Grund (Entscheidung O9
 * von 4T-002347), ohne Zeile für Befunde der ganzen Datei.
 *
 * @param {{code: string, line: number|null, detail?: object}} befund
 * @returns {string}
 */
export function befundZeile(befund) {
  const grund = befundText(befund);
  if (typeof befund.line !== 'number') return grund;
  return einsetzen(t('workflow.pruefung.zeile'), { line: befund.line, grund });
}

/**
 * Eine Zeile der Prüf-Anzeige zu einem Hinweis (4T-002692): «Hinweis zu Zeile
 * N» und der Text unter `workflow.hinweis.<code>`.
 *
 * @param {{code: string, line: number, detail?: object}} hinweis
 * @returns {string}
 */
export function hinweisZeile(hinweis) {
  const vorlage = text(`workflow.hinweis.${hinweis.code}`);
  if (vorlage === null)
    console.warn(`[Workflows] Kein Text für den Hinweis-Code '${hinweis.code}'.`);
  const grund = vorlage === null ? hinweis.code : einsetzen(vorlage, hinweis.detail || {});
  return einsetzen(t('workflow.pruefung.hinweisZeile'), { line: hinweis.line, grund });
}

/**
 * Die Befunde, die über dem Block mit dieser Zaun-Zeile stehen: Der Hinweis auf
 * mehrere Blöcke nur über seinem eigenen Block, alle übrigen über jedem.
 *
 * @param {object} analyse Ergebnis von `pruefeWorkflow`.
 * @param {number} zaunZeile Zeile der öffnenden Zaun-Zeile im Dokument.
 * @returns {object[]}
 */
export function befundeFuerBlock(analyse, zaunZeile) {
  return (analyse.findings || []).filter(
    (b) => b.code !== 'multipleBlocks' || b.line === zaunZeile,
  );
}

/**
 * Was die Kopfzeile über einem Block sagt (Entscheidung der Sitzung vom
 * 2026-10-23, E5): «bereit» oder der erste Befund mit «(+N weitere)», dazu die
 * vollständige Liste für den Hinweis beim Darüberfahren. Seit 4T-002692 folgen
 * die Hinweise des Prüfers den Befunden in der Liste; ohne Befund heißt es
 * «bereit; Hinweis zu Zeile N: …», und die Aussage bleibt `ok`.
 *
 * @param {object} analyse Ergebnis von `pruefeWorkflow`.
 * @param {number} zaunZeile Zeile der öffnenden Zaun-Zeile im Dokument.
 * @returns {{ok: boolean, text: string, liste: string[], hinweis?: boolean}}
 */
export function kopfAussage(analyse, zaunZeile) {
  const befunde = befundeFuerBlock(analyse, zaunZeile);
  const hinweise = (analyse.hints || []).map(hinweisZeile);
  if (befunde.length === 0 && hinweise.length === 0) {
    return { ok: true, text: t('workflow.pruefung.bereit'), liste: [] };
  }
  const liste = [...befunde.map(befundZeile), ...hinweise];
  const weitere =
    liste.length > 1
      ? ` ${einsetzen(t('workflow.pruefung.weitere'), { n: liste.length - 1 })}`
      : '';
  if (befunde.length > 0) return { ok: false, text: `${liste[0]}${weitere}`, liste };
  const bereit = einsetzen(t('workflow.pruefung.bereitMitHinweis'), { hinweis: liste[0] });
  return { ok: true, hinweis: true, text: `${bereit}${weitere}`, liste };
}
