// 4T-002544 (Epic 3E-000368): Die Prüf-Befunde der Datenbank-Befehle (G6,
// Stufe D) gegen Tabellen, Felder und Abfrage-Dateien.
//
// **Quelle** sind die Entscheidungen Da, Db, Dc, Dd, Dg und Dm der
// Konzept-Runde 4T-002543 und deren Ausführungs-Entscheidung 4: Der Prüfer
// fragt, wie bei den Namen von Workflows und Makros, nach den Tabellen und
// ihren Feldern; eine unbekannte Tabelle, ein unbekanntes Feld und eine
// uneindeutige Tabelle sind Befunde mit Zeile vor dem ersten Schritt, bei
// Platzhaltern nach dem Füllen (`dbFilledFindings`, gerufen aus `prepareRun`).
//
// **Die Befunde:**
//   databaseDisabled  jeder Datenbank-Befehl bei ausgeschalteter Erweiterung
//                     «Datenbank» (`options.databaseEnabled === false`, nach dem
//                     Muster von `templatesDisabled`).
//   tableUnknown, tableAmbiguous  Tabelle eines Befehls oder eines `{{db:…}}`.
//   fieldUnknown      jedes Feld eines Paares `feld="Wert"`, eines
//                     `{{record:…}}` und eines `{{db:…}}`, das die Definition
//                     nicht kennt (Dm: ein umbenanntes Feld hält den Lauf an).
//   queryFileMissing  «keine Abfrage-Datei» bei `db-query`, `db-for-each` und
//                     `db-open-list` (Db, Dg).
//   queryInvalid      «Abfrage fehlerhaft» bei denselben Befehlen.
//   queryNoRecords    `db-for-each` über eine Abfrage ohne `TABLE RECORDS` oder
//                     mit Gruppen (Dc).
//   recordOutsideLoop `{{record:…}}` außerhalb einer Schleife `db-for-each`.
//   createdNameInvalid, createdNameDuplicate  der Name hinter `as` eines
//                     `db-create` (4T-002547, Da), nach der Regel der
//                     Skript-Ergebnisse (`normalizeScriptName`).
//   createdBeforeStep `{{created:name}}` vor oder ohne ein `db-create … as
//                     "name"` in einer früheren Zeile (4T-002547, Da).
//   dbValueNotAllowed `{{record:…}}`, `{{db:…}}` oder `{{created:…}}` dort, wo
//                     der Wert vor dem ersten Schritt feststehen muss (Name eines
//                     Workflows oder Makros, Pfad einer Vorlage, Ziel von
//                     `delete`), wie bei den Skript-Ergebnissen.
// `pairsMissing`, `fieldDuplicate`, `dbPlaceholderInvalid` und `loopNested`
// meldet `workflow-check.js`, weil sie ohne Rückfrage feststehen.
//
// **Ohne Rückfrage entfällt die Prüfung**, wie bei Kommando, Makro und
// Workflow; ebenso, solange die Rückfrage noch nichts weiß (Antwort null).
// Eigene Angaben eines Datensatzes (`{{record:id}}`, `{{record:table}}`,
// `{{record:file}}`, Dc) sind keine Felder. Die Felder einer Schleife prüft
// der Prüfer nur, wenn ihre Abfrage genau eine Tabelle positiv nennt, wie die
// Listen-Auskunft der Datenbank (`tabelleDerAbfrage`); bei einer Hülle oder
// mehreren Tabellen ist die Tabelle eines Datensatzes erst im Lauf bekannt.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { analyzeTemplate, normalizeScriptName } = require('../template-engine.js');
const { DB_KEYWORDS, DB_LOOP_KEYWORD } = require('./workflow-catalog.js');
const { tableHasField } = require('./workflow-db-lookup.js');

/** Die Befehle, deren erstes Argument eine Tabelle nennt. */
const TABELLEN_BEFEHLE = Object.freeze([
  'db-create',
  'db-update',
  'db-delete',
  'db-open',
  'db-check',
]);
/** Die Befehle, deren erstes Argument eine Abfrage-Datei nennt (Db, Dc, Dg). */
const ABFRAGE_BEFEHLE = Object.freeze(['db-query', DB_LOOP_KEYWORD, 'db-open-list']);
/** Die eigenen Angaben eines Datensatzes in `{{record:…}}` (Dc). */
const EIGENE_ANGABEN = Object.freeze(['id', 'table', 'file']);
const RECORD_PRAEFIX = 'record:';
const CREATED_PRAEFIX = 'created:';
// Befehle, deren erstes Argument vor dem ersten Schritt feststehen muss
// (4T-002547 hierher aus workflow-check.js, das die Regel weiter nutzt).
const OHNE_SCHLEIFEN_WERT = Object.freeze(['workflow', 'macro', 'delete']);

// Steht der Baustein dort, wo sein Wert vor dem ersten Schritt feststehen muss
// (Name eines Workflows oder Makros, Ziel von `delete`, Pfad einer Vorlage)?
// Liefert die Angabe für den Befund oder null.
function festVorDemLauf(anweisung, token) {
  const { tokens } = anweisung;
  const index = tokens.indexOf(token);
  const davor = index > 0 ? tokens[index - 1] : null;
  if (davor && davor.type === 'word' && davor.value === 'from-template') {
    return { option: 'from-template' };
  }
  if (index === 0 && OHNE_SCHLEIFEN_WERT.includes(anweisung.keyword)) {
    return { keyword: anweisung.keyword };
  }
  return null;
}

const hatPlatzhalter = (text) => /\{\{/.test(String(text));

function bericht(anweisung) {
  const findings = [];
  const melde = (code, token, detail = {}) =>
    findings.push({
      code,
      line: anweisung.line,
      blockLine: anweisung.blockLine,
      column: (token ? token.from : anweisung.from) + 1,
      detail,
    });
  return { findings, melde };
}

// Die Antwort einer Rückfrage oder null (keine Rückfrage, noch kein Stand).
function frage(rueckfrage, angabe) {
  if (typeof rueckfrage !== 'function') return null;
  const antwort = rueckfrage(angabe);
  return antwort && typeof antwort === 'object' ? antwort : null;
}

/**
 * Die Tabelle einer Angabe; meldet `tableUnknown` und `tableAmbiguous`.
 *
 * @returns {{name: string, fields: string[]}|null} bei bekannter Tabelle.
 */
function pruefeTabelle(options, angabe, melde) {
  const lage = frage(options.dbTable, angabe);
  if (!lage) return null;
  if (lage.state === 'ambiguous') melde('tableAmbiguous', { table: angabe });
  else if (lage.state !== 'known') melde('tableUnknown', { table: angabe });
  return lage.state === 'known' ? lage : null;
}

function pruefeFeld(tabelle, feld, melde) {
  if (!tableHasField(tabelle, feld)) melde('fieldUnknown', { field: feld, table: tabelle.name });
}

/**
 * Die Abfrage-Datei eines Befehls; meldet `queryFileMissing`, `queryInvalid`
 * und bei `db-for-each` `queryNoRecords`.
 *
 * @returns {{name: string, fields: string[]}|null} die Tabelle einer Schleife,
 *   deren Felder `{{record:…}}` prüft, sonst null.
 */
function pruefeAbfrage(keyword, options, pfad, melde) {
  const lage = frage(options.dbQuery, pfad);
  if (!lage) return null;
  if (lage.state === 'missing') {
    melde('queryFileMissing', { path: pfad });
    return null;
  }
  if (lage.state !== 'ok') {
    melde('queryInvalid', { path: pfad });
    return null;
  }
  if (keyword !== DB_LOOP_KEYWORD) return null;
  if (!lage.records || lage.grouped) {
    melde('queryNoRecords', { path: pfad });
    return null;
  }
  // Eine unbekannte Tabelle in `FROM` trifft nichts (E4); ihr Befund gehört
  // der Abfrage-Ansicht, hier bleiben allein ihre Felder ungeprüft.
  const tabelle = lage.table ? frage(options.dbTable, lage.table) : null;
  return tabelle && tabelle.state === 'known' ? tabelle : null;
}

/**
 * Prüft Tabelle, Paare und Abfrage-Datei eines Datenbank-Befehls mit
 * festen Werten.
 *
 * @param {string} keyword Schlüsselwort.
 * @param {string} erstes erstes Argument (Tabelle oder Abfrage-Datei).
 * @param {string[]} felder Feld-Namen der Paare.
 * @param {object} options Rückfragen `dbTable`, `dbQuery`.
 * @param {(code: string, detail: object) => void} melde
 * @returns {{name: string, fields: string[]}|null} Tabelle einer Schleife.
 */
function pruefeBefehl(keyword, erstes, felder, options, melde) {
  if (TABELLEN_BEFEHLE.includes(keyword)) {
    const tabelle = pruefeTabelle(options, erstes, melde);
    if (tabelle) for (const feld of felder) pruefeFeld(tabelle, feld, melde);
    return null;
  }
  return ABFRAGE_BEFEHLE.includes(keyword) ? pruefeAbfrage(keyword, options, erstes, melde) : null;
}

// Die Platzhalter `{{record:…}}`, `{{db:…}}` und `{{created:…}}` einer
// Anweisung; `erstellt` sind die Namen der `db-create … as` davor.
function platzhalterBefunde(anweisung, schleife, options, melde, erstellt) {
  for (const token of anweisung.tokens) {
    if (token.type !== 'string' && token.type !== 'pair') continue;
    const analysis = analyzeTemplate(token.value);
    if (!analysis.ok) continue; // Befund `placeholderInvalid` im Prüfer
    const anToken = (code, detail) => melde(code, token, detail);
    for (const seg of analysis.segments) {
      if (seg.type !== 'context') continue;
      // 4T-002547: Werte eines Laufs stehen erst im Lauf fest.
      const fest = seg.befehlsZeile ? festVorDemLauf(anweisung, token) : null;
      if (fest) melde('dbValueNotAllowed', token, { name: seg.name, ...fest });
      if (seg.name.startsWith(CREATED_PRAEFIX)) {
        const name = seg.name.slice(CREATED_PRAEFIX.length);
        if (!erstellt.has(name)) melde('createdBeforeStep', token, { name });
      }
      if (seg.db) {
        const tabelle = pruefeTabelle(options, seg.db.table, anToken);
        if (tabelle) pruefeFeld(tabelle, seg.db.field, anToken);
      } else if (seg.name.startsWith(RECORD_PRAEFIX)) {
        const feld = seg.name.slice(RECORD_PRAEFIX.length);
        if (!schleife) melde('recordOutsideLoop', token, { name: seg.name });
        else if (schleife.tabelle && !EIGENE_ANGABEN.includes(feld.toLowerCase())) {
          pruefeFeld(schleife.tabelle, feld, anToken);
        }
      }
    }
  }
}

// 4T-002547 (Da): Der Name hinter `as` eines `db-create`.
function nameDerAnlage(anweisung, erstellt, melde) {
  const i = anweisung.tokens.findIndex((t) => t.type === 'word' && t.value === 'as');
  const wert = i >= 0 ? anweisung.tokens[i + 1] : null;
  if (!wert || wert.type !== 'string') return;
  const name = normalizeScriptName(wert.value);
  if (name === null) melde('createdNameInvalid', wert, { name: wert.value });
  else if (erstellt.has(name)) melde('createdNameDuplicate', wert, { name: wert.value });
  if (name !== null) erstellt.add(name);
}

/**
 * Die Befunde der Datenbank-Befehle und ihrer Platzhalter über alle
 * Anweisungen einer Datei.
 *
 * @param {object[]} anweisungen aus `readBlock`, in Lese-Reihenfolge.
 * @param {{loopOf: (number|null)[]}} struktur aus `blockStructure`.
 * @param {{databaseEnabled?: boolean, dbTable?: Function, dbQuery?: Function}} options
 * @returns {object[]} Befunde.
 */
function dbFindings(anweisungen, struktur, options = {}) {
  const alle = [];
  // Je Zeile einer Schleife `db-for-each`: ihre Tabelle oder null.
  const schleifen = new Map();
  // 4T-002547: die Namen der neuen Kennungen, in Lese-Reihenfolge geliefert.
  const erstellt = new Set();
  (anweisungen || []).forEach((anweisung, index) => {
    const { findings, melde } = bericht(anweisung);
    const { keyword, tokens } = anweisung;
    if (DB_KEYWORDS.includes(keyword)) {
      if (options.databaseEnabled === false) melde('databaseDisabled', null);
      const erstes = tokens[0];
      const fest = erstes && erstes.type === 'string' && !hatPlatzhalter(erstes.value);
      const felder = tokens.filter((t) => t.type === 'pair').map((t) => t.key.trim());
      const tabelle =
        fest && erstes.value.trim() !== ''
          ? pruefeBefehl(keyword, erstes.value.trim(), felder, options, (c, d) =>
              melde(c, erstes, d),
            )
          : null;
      if (keyword === DB_LOOP_KEYWORD) schleifen.set(index, { tabelle });
    }
    const umgebend = struktur && struktur.loopOf ? struktur.loopOf[index] : null;
    const schleife = umgebend === null || umgebend === undefined ? null : schleifen.get(umgebend);
    platzhalterBefunde(anweisung, schleife || null, options, melde, erstellt);
    if (keyword === 'db-create') nameDerAnlage(anweisung, erstellt, melde);
    alle.push(...findings);
  });
  return alle;
}

/**
 * Die Befunde eines gefüllten Datenbank-Schritts (bei Platzhaltern nach dem
 * Füllen, Ausführungs-Entscheidung 4); nur für ein erstes Argument, das vor
 * dem Füllen Platzhalter trug, damit kein Befund doppelt erscheint.
 *
 * @param {object} step geprüfter Schritt aus `checkWorkflow`.
 * @param {Array} args gefüllte Argumente.
 * @param {object} options Rückfragen `dbTable`, `dbQuery`.
 * @param {(code: string, detail: object) => void} melde
 */
function dbFilledFindings(step, args, options, melde) {
  if (!DB_KEYWORDS.includes(step.keyword) || !options) return;
  const roh = step.args[0];
  const wert = args[0];
  if (!roh || !hatPlatzhalter(roh.raw) || typeof wert !== 'string' || wert.trim() === '') return;
  const felder = (step.pairs || []).map((p) => p.key);
  pruefeBefehl(step.keyword, wert.trim(), felder, options, melde);
}

module.exports = { dbFilledFindings, dbFindings, festVorDemLauf };
