// 4T-001928 / 4T-001929 (Epic 3E-000256, E5.4, E22.3): Gemeinsame Helfer der
// Regel-Module, die Fremd-Tabellen des Bereichs brauchen — die Verweis-Regel und
// der Lösch-Schutz lesen beide die Tabellen-Sicht, finden Kopf-Dateien über den
// Vergleich des Katalogs und lesen fremde Bestände frisch unter demselben Weg wie
// die Schreib-Schnittstelle.
//
// **Ein Weg, nicht zwei.** Die Verweis-Regel prüft, ob das Ziel eines Verweises
// besteht; der Lösch-Schutz prüft, ob auf ein Ziel noch verwiesen wird. Beide
// Fragen entscheiden sich am selben Material: der Menge der Tabellen aus dem Index
// und dem Inhalt der Dateien nach dem Auftrag. Läge die Auflösung der Kopf-Datei
// oder die Wirkung des Auftrags zweimal vor, gäben beide Regeln irgendwann
// verschiedene Antworten auf dieselbe Frage.
//
// **Die Menge aus dem Index, die Wahrheit aus der Datei.** Welche Tabellen es
// gibt, sagt die Tabellen-Sicht des Bereichs (`dbKindsPerFile`), und die
// Kopf-Datei wird über denselben Vergleich gefunden wie im Katalog
// (`tabellenDefinition`: Pfad oder Name ohne Endung, ohne Rücksicht auf
// Groß-/Kleinschreibung beim Namen). Den INHALT einer Tabelle lesen die Regeln
// frisch aus der Datei, mit allen Segmenten; der Index kennt den Stand vor der
// Sperre und den Puffer offener Dokumente, aber nicht die Anlagen und Löschungen
// desselben Auftrags. Ist die Tabelle zugleich eine Tabelle des Auftrags, gilt
// ihr bereits unter der Sperre gelesener Bestand: Ein zweites Lesen könnte einen
// anderen Stand sehen als den, gegen den der Auftrag schreibt.
//
// **Der Lauf** ist der Zwischenspeicher einer Prüfung: eine Sicht je Prüfung,
// ein Bestand je Tabelle. Jede Regel hält ihren eigenen Lauf, weil die Naht die
// Module nacheinander und unabhängig ruft; ein Zwischenspeicher über Module
// hinweg wäre ein zweiter Vertrag, den das Regel-Werk nicht kennt.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { ART_ANLEGEN, ART_LOESCHEN } = require('./record-auftrag-pruefung.js');
const { leseTabellenBestand } = require('./record-auftrag-bestand.js');
const { tabellenName } = require('./table-catalog.js');

// Der Typ der Verweis-Spalte, wie ihn `table-columns.js` führt.
const VERWEIS_TYP = 'record';

// --- Feld-Werte nach Namen ---------------------------------------------------------------

/**
 * Der Text eines Feldes in den Werten einer Anweisung, ohne Rücksicht auf die
 * Schreibung des Namens (wie die Feld-Karte der Definition).
 *
 * @param {object|undefined} werte Die Werte einer Anweisung.
 * @param {string} feldName Der Feld-Name aus der Definition.
 * @returns {string|undefined} `undefined`, wenn die Werte das Feld nicht nennen.
 */
function wertIn(werte, feldName) {
  const klein = feldName.toLowerCase();
  const name = Object.keys(werte || {}).find((n) => n.toLowerCase() === klein);
  return name === undefined ? undefined : werte[name];
}

/**
 * Die Angabe `table` einer Verweis-Spalte. Die Definition verwirft eine
 * unbrauchbare Angabe einzeln (weiche Linie beim Lesen); dann fehlt sie hier,
 * und der Verweis hat keine Ziel-Tabelle.
 *
 * @param {object} feld Ein Feld der Definition.
 * @returns {string|null}
 */
function zielAngabe(feld) {
  const optionen = feld && feld.options;
  const angabe = optionen && typeof optionen.table === 'string' ? optionen.table.trim() : '';
  return angabe === '' ? null : angabe;
}

// --- Die Tabellen des Bereichs ---------------------------------------------------------

/**
 * Die Kopf-Dateien aller Tabellen der Sicht, sortiert nach Pfad.
 *
 * @param {object} sicht Die Sicht des Bereichs-Index.
 * @returns {Array<string>} Absolute Pfade.
 */
function kopfDateien(sicht) {
  const pfade = [];
  for (const [absPath, marken] of sicht.dbKindsPerFile || new Map()) {
    if (Array.isArray(marken) && marken.includes('table')) pfade.push(absPath);
  }
  pfade.sort();
  return pfade;
}

/**
 * Die Kopf-Datei zur Angabe, über denselben Doppel-Vergleich wie
 * `tabellenDefinition` im Katalog: Pfad oder Name ohne Endung, beides ohne
 * Rücksicht auf Groß-/Kleinschreibung beim Namen. Die Reihenfolge ist die
 * sortierte der Pfade, damit bei zwei Tabellen desselben Namens dieselbe
 * gewinnt wie im Katalog; den Doppel-Fall selbst meldet der Katalog-Überblick.
 *
 * @param {object} sicht Die Sicht des Bereichs-Index.
 * @param {string} angabe Pfad oder Name der Tabelle.
 * @returns {string|null} Der absolute Pfad der Kopf-Datei.
 */
function findeKopfDatei(sicht, angabe) {
  const klein = angabe.toLowerCase();
  return (
    kopfDateien(sicht).find(
      (p) =>
        pathCompareKey(p) === pathCompareKey(angabe) || tabellenName(p).toLowerCase() === klein,
    ) || null
  );
}

/**
 * Erzeugt den Lauf einer Prüfung: den Zwischenspeicher für Sicht und Bestände.
 *
 * @param {object} kontext Der Kontext der Prüf-Naht (`record-regeln.js`).
 * @returns {object} Der Lauf, den die übrigen Helfer fortschreiben.
 */
function neuerLauf({ bereichsWurzel, schritte, bestaende, tabellenSicht, fsp }) {
  return {
    wurzel: bereichsWurzel,
    tabellenSicht,
    fsp,
    schritte,
    bestaende,
    sicht: undefined,
    ziele: new Map(),
  };
}

/**
 * Die Sicht des Bereichs, einmal je Prüfung erfragt.
 *
 * @param {object} lauf Der Lauf der Prüfung.
 * @returns {{ok: true, sicht: object}|{ok: false, status: string}} Ohne
 *   hereingereichte Sicht gibt es keinen Index, und der Status ist `unavailable`.
 */
function holeSicht(lauf) {
  if (lauf.sicht !== undefined) return lauf.sicht;
  const antwort = typeof lauf.tabellenSicht === 'function' ? lauf.tabellenSicht(lauf.wurzel) : null;
  const status = antwort && typeof antwort.status === 'string' ? antwort.status : 'unavailable';
  lauf.sicht =
    status === 'ready' && antwort.sicht
      ? { ok: true, sicht: antwort.sicht }
      : { ok: false, status };
  return lauf.sicht;
}

// --- Bestände nach dem Auftrag -----------------------------------------------------------

/**
 * Was der Auftrag an einer Tabelle ändert: die angelegten Datensätze mit ihren
 * Werten, die gelöschten Kennungen und die geänderten Werte. Ein erzwungenes
 * Ändern eines von Hand gelöschten Datensatzes legt ihn unter seiner Kennung
 * wieder an (Plan-Modul); er zählt deshalb wie ein angelegter, mit dem zuletzt
 * gelesenen Stand als Grundlage.
 *
 * @param {Array<object>} schritte Die Schritte des Auftrags.
 * @param {string} kopfSchluessel `pathCompareKey` der Kopf-Datei.
 * @returns {{angelegt: Map<string, object>, geloescht: Set<string>,
 *   geaendert: Map<string, object>}}
 */
function wirkungDesAuftrags(schritte, kopfSchluessel) {
  const angelegt = new Map();
  const geloescht = new Set();
  const geaendert = new Map();
  for (const schritt of schritte) {
    if (pathCompareKey(schritt.bestand.pfad) !== kopfSchluessel) continue;
    const { anweisung } = schritt;
    if (anweisung.art === ART_LOESCHEN) geloescht.add(schritt.id);
    else if (anweisung.art === ART_ANLEGEN) angelegt.set(schritt.id, anweisung.werte);
    else if (schritt.fehlt)
      angelegt.set(schritt.id, { ...(anweisung.erwartet || {}), ...anweisung.werte });
    else geaendert.set(schritt.id, anweisung.werte);
  }
  return { angelegt, geloescht, geaendert };
}

/**
 * Der Bestand einer Tabelle samt Definition, einmal je Tabelle und Prüfung.
 * Ist sie zugleich eine Tabelle des Auftrags, gilt deren unter der Sperre
 * gelesener Bestand; sonst wird sie frisch mit allen Segmenten gelesen.
 *
 * @param {object} lauf Der Lauf der Prüfung.
 * @param {string} kopf Der absolute Pfad der Kopf-Datei.
 * @returns {Promise<{ok: true, name: string, bestand: object, definition: object,
 *   key: Array<string>|null, auftrag: object}|{ok: false, grund: string}>}
 */
async function bestandFuer(lauf, kopf) {
  const schluessel = pathCompareKey(kopf);
  if (lauf.ziele.has(schluessel)) return lauf.ziele.get(schluessel);
  let bestand = null;
  for (const eintrag of lauf.bestaende.values()) {
    if (pathCompareKey(eintrag.pfad) === schluessel) bestand = eintrag;
  }
  let ergebnis;
  if (bestand === null) {
    const gelesen = await leseTabellenBestand(lauf.fsp, kopf, tabellenName(kopf));
    if (gelesen.ok) bestand = gelesen;
    else ergebnis = { ok: false, grund: gelesen.lage.grund || gelesen.lage.code };
  }
  if (bestand !== null) {
    // Die Definition trägt der Bestand nur in Teilen (Felder und Stand); den
    // fachlichen Schlüssel und die Anzeige-Form lesen die Regeln aus dem Text
    // der Kopf-Datei, den der Bestand bereits hält.
    const definition = parseTableDefinition(extractFrontmatter(bestand.dateien[0].text).data);
    ergebnis = {
      ok: true,
      name: tabellenName(kopf),
      bestand,
      definition,
      key: Array.isArray(definition.key) ? definition.key : null,
      auftrag: wirkungDesAuftrags(lauf.schritte, schluessel),
    };
  }
  lauf.ziele.set(schluessel, ergebnis);
  return ergebnis;
}

module.exports = {
  VERWEIS_TYP,
  wertIn,
  zielAngabe,
  kopfDateien,
  findeKopfDatei,
  neuerLauf,
  holeSicht,
  wirkungDesAuftrags,
  bestandFuer,
};
