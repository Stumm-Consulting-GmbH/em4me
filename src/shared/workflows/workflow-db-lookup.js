// 4T-002544 (Epic 3E-000368): Die Rückfragen des Prüfers nach Tabellen, Feldern
// und Abfrage-Dateien (Ausführungs-Entscheidung 4 der Konzept-Runde 4T-002543).
//
// **Woher die Antworten kommen.** Der Prüfer ist synchron und kennt keine
// Datenbank. Der Hauptprozess liefert einmal je Stand eine **Auskunft** über
// den Datenbank-Bestand des Bereichs (Kanal `workflow:dbCatalog`,
// `src/main/workflows/workflow-db-auskunft.js`); dieses Modul macht daraus die
// zwei Rückfragen `dbTable` und `dbQuery` für `checkWorkflow` und
// `prepareRun`, nach dem Muster von `isKnownWorkflow`.
//
// **Auflösung einer Tabelle** (Ausführungs-Entscheidung 2): als Pfad relativ
// zur Bereichs-Wurzel, sonst als Name ohne Endung, ohne Rücksicht auf die
// Schreibung, wie `FROM` und ein Verweis (`findeZielTabelle` und
// `kopfZuAngabe` im Hauptprozess). Tragen zwei Tabellen den Namen, ist das
// «uneindeutig», nie die erste.
//
// **Felder** werden ohne Rücksicht auf die Schreibung verglichen, wie die
// Feld-Karte der Definition (`spaltenIndex` in `datensatz-liste.js`).
//
// Form der Auskunft: `{ tables: [{ name, path, fields }], queries: [{ path,
// state, records, grouped, table }] }`, Pfade relativ zur Bereichs-Wurzel mit
// `/`. `state` einer Abfrage-Datei ist `'ok'` oder `'invalid'`; `records`
// sagt, ob sie Datensätze als Tabelle liefert (`TABLE RECORDS`), `grouped`, ob
// sie gruppiert, `table` die eine Tabelle, die sie positiv nennt, oder null.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { pathCompareKey } = require('../platform.js');

const istListe = (v) => Array.isArray(v);

// Ein Pfad in der Form der Auskunft: `/` als Trenner, ohne `./` und ohne
// führenden Trenner.
function relativerPfad(text) {
  return String(text == null ? '' : text)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
}

// 4T-002545: mit dem Pfad der Auskunft, damit der Schritt im Hauptprozess die
// Tabelle über dieselbe Auflösung findet wie der Prüfer (E4).
function bekannt(tabelle) {
  return {
    state: 'known',
    name: tabelle.name,
    path: relativerPfad(tabelle.path),
    fields: istListe(tabelle.fields) ? tabelle.fields.filter((f) => typeof f === 'string') : [],
  };
}

/**
 * Die Rückfragen aus einer Auskunft des Hauptprozesses.
 *
 * @param {{tables?: object[], queries?: object[]}|null} auskunft
 * @returns {{dbTable: (angabe: string) => object, dbQuery: (pfad: string) => object}}
 *   `dbTable` liefert `{ state: 'known', name, path, fields }`, `{ state: 'unknown' }`
 *   oder `{ state: 'ambiguous' }`; `dbQuery` `{ state: 'missing' }` oder die
 *   Angaben der Abfrage-Datei.
 */
function createDbLookup(auskunft) {
  const tabellen = auskunft && istListe(auskunft.tables) ? auskunft.tables : [];
  const abfragen = auskunft && istListe(auskunft.queries) ? auskunft.queries : [];
  function dbTable(angabe) {
    const pfad = relativerPfad(angabe);
    if (pfad === '') return { state: 'unknown' };
    const schluessel = pathCompareKey(pfad);
    const perPfad = tabellen.find((t) => pathCompareKey(relativerPfad(t.path)) === schluessel);
    if (perPfad) return bekannt(perPfad);
    const klein = pfad.toLowerCase();
    const perName = tabellen.filter((t) => String(t.name).toLowerCase() === klein);
    if (perName.length === 0) return { state: 'unknown' };
    return perName.length > 1 ? { state: 'ambiguous' } : bekannt(perName[0]);
  }
  function dbQuery(pfad) {
    const schluessel = pathCompareKey(relativerPfad(pfad));
    const abfrage = abfragen.find((q) => pathCompareKey(relativerPfad(q.path)) === schluessel);
    if (!abfrage) return { state: 'missing' };
    return {
      state: abfrage.state === 'ok' ? 'ok' : 'invalid',
      records: abfrage.records === true,
      grouped: abfrage.grouped === true,
      table: typeof abfrage.table === 'string' ? abfrage.table : null,
    };
  }
  return { dbTable, dbQuery };
}

/**
 * Kennt die Tabelle das Feld? Ohne Rücksicht auf die Schreibung.
 *
 * @param {{fields: string[]}} tabelle Antwort `known` aus `dbTable`.
 * @param {string} feld
 * @returns {boolean}
 */
function tableHasField(tabelle, feld) {
  const klein = String(feld).toLowerCase();
  return tabelle.fields.some((f) => f.toLowerCase() === klein);
}

module.exports = { createDbLookup, tableHasField };
