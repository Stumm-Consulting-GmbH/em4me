// 4T-002690 (Epic 3E-000415, Story 4S-001215): Das Urteil der Datenbank für die
// Text-Befehle der Workflows — «darf dieser Text-Befehl diese Datei so ändern?».
//
// **Die Regel** (Fragen Ta und Tb, je Option (a), und die Aufbau-Regel vom
// 2026-11-14): Ein Workflow ändert Aufbau, Datensätze und Felder nicht mit einem
// Text-Befehl. Drei gleichartige Halt-Fälle, gemessen am ERGEBNIS der
// Bearbeitung, nicht an der Absicht des Befehls:
//   1. Aufbau: Der Behälter `db-table` oder `db-database` ändert sich
//      (`vergleicheDefinition`, ohne den Hochwasserstand `lastId`). Hält immer,
//      unabhängig vom Recht; auf Rechte greift dieses Modul nie zu.
//   2. Datensätze: Der Datensatz-Block einer Tabellen-Datei ändert sich.
//   3. Karteikarte: Die Kennung `db-record` oder ein Feld der Tabelle im
//      Dateikopf ändert sich; Felder ohne Rücksicht auf die Schreibung wie die
//      Feld-Karte der Definition (`karteikartenWerte`).
// Freier Text und Eigenschaften, die kein Feld sind, bleiben frei. Wird eine
// Datei erst durch die Änderung zur Tabelle, zum Steckbrief oder zur
// Karteikarte, ist das derselbe Fall: Vorher und nachher werden gleich gelesen,
// und ein Behälter oder eine Kennung, die neu entsteht, ist eine Änderung.
//
// **Vergleich des Datensatz-Blocks als Block-Text**, nicht ausgelegt: Der Rumpf
// der Fence `perspective-records` (`datensatzRumpf`) beider Stände wird
// zeichengenau verglichen. Jede Zeile des Blocks ist Datenbestand, auch
// Vorspann, Maskierung und Leerzeilen, die ein ausgelegter Vergleich glättete;
// umgekehrt gibt es keinen Stand, dessen Text gleich und dessen Auslegung
// verschieden wäre, solange die Definition gleich bleibt, und eine geänderte
// Definition hält schon als Aufbau an. Begründung im Kapitel «Lösung» des Tasks.
//
// **Die Kartei-Tabelle des Ordners** kommt über die Weiche des Bereichs-Panels
// (`karteiTabelleIn` in `src/main/database/kartei-weichen.js`), damit ein
// Workflow dieselben Dateien als Karteikarten sieht wie Panel und
// Schreib-Schnittstelle; erst eine Kennung `db-record` in einem der beiden
// Stände lässt den Ordner lesen.
//
// **Aus-Zustand der Erweiterung «Datenbank»:** kein Urteil, nichts hält an
// (Befund 7). Ohne Tor gilt «aus», wie in `workflow-db-steps.js`.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { DB_RECORD_KEY } = require('../../shared/database/behaelter.js');
const { datensatzRumpf } = require('../../shared/database/record-segment.js');
const {
  KARTEIKARTEN_ARTEN,
  karteikartenArt,
  karteikartenWerte,
} = require('../../shared/database/karteikarte.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { vergleicheDefinition } = require('../database/definitions-schutz.js');
const { tabellenName } = require('../database/table-catalog.js');

// BOM als Escape-Form wie in `definitions-schutz.js`.
const BOM_RE = new RegExp('^\uFEFF');
// Platzhalter für eine fehlende Angabe im Vergleich der Kennung.
const FEHLT = '\u0000fehlt';

const FREI = Object.freeze({ ok: true });

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

function ohneBom(text) {
  return String(text == null ? '' : text)
    .replace(BOM_RE, '')
    .replace(/\r\n/g, '\n');
}

// Der ausgelegte Dateikopf; null ohne Dateikopf oder bei einem Lese-Fehler.
function dateikopf(text) {
  const kopf = extractFrontmatter(text);
  if (kopf.parseError || !kopf.data || typeof kopf.data !== 'object') return null;
  return Array.isArray(kopf.data) ? null : kopf.data;
}

function blockText(text) {
  const rumpf = datensatzRumpf(text);
  return rumpf ? rumpf.rumpf : null;
}

function kennungsForm(fm) {
  const wert = fm ? fm[DB_RECORD_KEY] : undefined;
  return wert === undefined ? FEHLT : JSON.stringify(wert);
}

/**
 * Baut das Urteil.
 *
 * @param {object} deps
 * @param {() => boolean} [deps.datenbankAktiv] Tor der Erweiterung «Datenbank».
 * @param {{karteiTabelleIn: Function}} [deps.karteiWeichen] Weiche des
 *   Bereichs-Panels (Kartei-Tabelle eines Ordners).
 * @param {{readFile: Function}} [deps.fsp] Dateizugriff (Vorgabe: frisch lesend).
 * @returns {{aktiv: () => boolean, urteile: Function}}
 */
function createDbUrteil(deps = {}) {
  const fsp = deps.fsp || frischerDateizugriff;
  const weichen = deps.karteiWeichen || null;

  function aktiv() {
    return typeof deps.datenbankAktiv === 'function' && deps.datenbankAktiv() === true;
  }

  // Die Definition der Kartei-Tabelle; null, wenn sie sich nicht lesen lässt.
  async function definitionVon(tabellenPfad) {
    try {
      const fm = dateikopf(ohneBom(await fsp.readFile(tabellenPfad, 'utf8')));
      const definition = fm ? parseTableDefinition(fm) : null;
      return definition && definition.istTabelle ? definition : null;
    } catch {
      return null;
    }
  }

  // Halt-Fall 3: Kennung oder Feld einer Karteikarte.
  async function karteikartenUrteil(abs, alt, neu, angaben) {
    if (kennungsForm(alt) === FEHLT && kennungsForm(neu) === FEHLT) return FREI;
    if (!weichen || typeof weichen.karteiTabelleIn !== 'function') return FREI;
    const tabellenPfad = await weichen.karteiTabelleIn(path.dirname(abs));
    if (!tabellenPfad) return FREI;
    const istKarte = (fm) =>
      karteikartenArt({ pfad: abs, frontmatter: fm, tabellenPfad, istVorlage: null }).art ===
      KARTEIKARTEN_ARTEN.karteikarte;
    if (!istKarte(alt) && !istKarte(neu)) return FREI;
    const table = tabellenName(tabellenPfad);
    if (kennungsForm(alt) !== kennungsForm(neu)) {
      return fehlschlag('dbRecordIdByText', { ...angaben, table });
    }
    const definition = await definitionVon(tabellenPfad);
    // Fail closed: Ohne lesbare Definition gilt jede Angabe des Dateikopfs als
    // Feld, denn welche keines ist, lässt sich dann nicht sagen.
    const felder = definition
      ? definition.fields
      : [...new Set([...Object.keys(alt || {}), ...Object.keys(neu || {})])].map((name) => ({
          name,
        }));
    const vorher = karteikartenWerte(alt, { fields: felder });
    const nachher = karteikartenWerte(neu, { fields: felder });
    const geaendert = vorher.find(
      (wert, i) => wert.fehlt !== nachher[i].fehlt || wert.text !== nachher[i].text,
    );
    if (!geaendert) return FREI;
    return fehlschlag('dbFieldByText', { ...angaben, table, field: geaendert.name });
  }

  /**
   * Darf der Text-Befehl die Datei so ändern?
   *
   * @param {{abs: string, alterText: string, neuerText: string, befehl: string,
   *   anzeige?: string}} auftrag `abs` ist der Pfad, unter dem die Anwendung das
   *   Dokument führt (bei einem geteilten Dokument die Kopf-Datei), die Texte
   *   sind der ganze Stand vor und nach der Bearbeitung, `anzeige` der Pfad in
   *   der Form des Workflows für den Satz.
   * @returns {Promise<{ok: true}|{ok: false, code: string, detail: object}>}
   *   Codes `dbStructureByText`, `dbProfileByText`, `dbRecordsByText`,
   *   `dbRecordIdByText`, `dbFieldByText`.
   */
  async function urteile({ abs, alterText, neuerText, befehl, anzeige }) {
    if (!aktiv()) return FREI;
    const alt = ohneBom(alterText);
    const neu = ohneBom(neuerText);
    if (alt === neu) return FREI;
    const angaben = {
      command: String(befehl || ''),
      path: typeof anzeige === 'string' && anzeige !== '' ? anzeige : abs,
    };
    const definition = vergleicheDefinition(alt, neu);
    if (definition.tabelleGeaendert) {
      return fehlschlag('dbStructureByText', { ...angaben, table: tabellenName(abs) });
    }
    if (definition.steckbriefGeaendert) return fehlschlag('dbProfileByText', angaben);
    if (definition.tabelle && blockText(alt) !== blockText(neu)) {
      return fehlschlag('dbRecordsByText', { ...angaben, table: tabellenName(abs) });
    }
    return karteikartenUrteil(abs, dateikopf(alt), dateikopf(neu), angaben);
  }

  return { aktiv, urteile };
}

module.exports = { createDbUrteil };
