// 4T-002544 (Epic 3E-000368): Die Auskunft über den Datenbank-Bestand eines
// Bereichs für die Prüfung der Workflow-Zeilen (Ausführungs-Entscheidung 4 der
// Konzept-Runde 4T-002543: Der Prüfer fragt nach den Tabellen und ihren
// Feldern, wie bei den Namen von Workflows und Makros).
//
// **Ein Kanal, eine Antwort.** Der Prüfer im Fenster ist synchron; er bekommt
// den Bestand einmal je Stand über `workflow:dbCatalog` und fragt danach ohne
// Kanal (`src/shared/workflows/workflow-db-lookup.js`). Die Auskunft trägt je
// Tabelle Name, Pfad und Feld-Namen, je Abfrage-Datei, ob sie auswertbar ist,
// ob sie Datensätze als Tabelle liefert, ob sie gruppiert und welche eine
// Tabelle sie nennt. Die beiden Kanäle der Datenbank (`database:overview` und
// `database:table`) hätten dafür einen Aufruf je Tabelle verlangt und die
// Abfrage-Dateien nicht ausgelegt; dieser Kanal liest denselben Katalog
// (`table-catalog.js`) und dieselbe Auslegung der Abfrage-Datei wie die
// Listen-Auskunft (`listen-auskunft.js`), damit es keine zweite Antwort gibt.
//
// Pfade sind relativ zur Bereichs-Wurzel mit `/`, damit das Fenster sie mit
// der Angabe einer Befehls-Zeile vergleichen kann.
//
// Electron-frei; Dateizugriff und Sicht kommen herein.
'use strict';

const path = require('node:path');
const {
  abfrageDateien,
  markierteDateien,
  tabellenDefinition,
} = require('../database/table-catalog.js');
const { abfrageDesTextes, liesText, tabelleDerAbfrage } = require('../database/listen-auskunft.js');
const { checkRecordsQuery } = require('../index/query-records.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseQuery } = require('../../shared/query/perspective-query.js');
const { isGroupedTable } = require('../../shared/query/query-functions.js');

function relativ(wurzel, absPfad) {
  return path.relative(wurzel, absPfad).split(path.sep).join('/');
}

// Die Auslegung einer Abfrage-Datei mit genau einem Block.
function auslegung(text) {
  const roh = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const abfrage = abfrageDesTextes(extractFrontmatter(roh).body);
  const geparst = abfrage === null ? null : parseQuery(abfrage);
  if (!geparst || !geparst.ok) return { state: 'invalid' };
  const { ast } = geparst;
  if (ast.scope === 'records' && checkRecordsQuery(ast).error) return { state: 'invalid' };
  return {
    state: 'ok',
    records: ast.scope === 'records' && ast.type === 'table',
    grouped: isGroupedTable(ast),
    table: tabelleDerAbfrage(abfrage),
  };
}

/**
 * Die Auskunft über Tabellen und Abfrage-Dateien eines Bereichs.
 *
 * @param {object} p Parameter.
 * @param {string} p.wurzel Bereichs-Wurzel.
 * @param {object} p.sicht Index-Sicht der Wurzel (`datenbankSicht`).
 * @param {object} p.fsp Dateizugriff (`stat`, `readFile`).
 * @param {Map} p.cache Zwischenspeicher des Katalogs.
 * @param {Function} [p.bufferTextFor] ungespeicherter Stand vor der Platte.
 * @returns {Promise<{tables: object[], queries: object[]}>}
 */
async function workflowDbAuskunft({ wurzel, sicht, fsp, cache, bufferTextFor = null }) {
  const tables = [];
  for (const absPfad of markierteDateien(sicht).tabellen) {
    const definition = await tabellenDefinition({
      sicht,
      status: 'ready',
      tabelle: absPfad,
      fsp,
      cache,
      bufferTextFor,
    });
    if (!definition.gefunden) continue;
    tables.push({
      name: definition.name,
      path: relativ(wurzel, absPfad),
      fields: (definition.fields || []).map((feld) => feld.name),
    });
  }
  const queries = [];
  for (const abfrage of await abfrageDateien({ sicht, fsp, cache, bufferTextFor })) {
    const text =
      abfrage.bloecke === 1 ? await liesText({ fsp, pfad: abfrage.path, bufferTextFor }) : null;
    queries.push({
      path: relativ(wurzel, abfrage.path),
      ...(text === null ? { state: 'invalid' } : auslegung(text)),
    });
  }
  return { tables, queries };
}

module.exports = { workflowDbAuskunft };
