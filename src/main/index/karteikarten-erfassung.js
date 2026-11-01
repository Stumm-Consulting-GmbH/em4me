// 4T-002387 (Epic 3E-000265, Schritt 2, Entscheidung S2): Die Karteikarten
// einer Kartei-Tabelle, wie sie in den Bereichs-Index eingehen.
//
// **Dieselbe Spur wie die Datensätze der Tabellen-Form.** Eine Karteikarte
// steht in `recordsPerFile` unter ihrer eigenen Datei, mit genau einem Eintrag
// in der Form, die `datensatz-erfassung.js` liefert (`{ id, key, display,
// zeile }`), und mit der Signatur der Tabellen-Definition in
// `recordDefSigPerFile`. Der Fundort ist die Datei der Karteikarte, die Zeile
// ist 0, also die erste Zeile mit dem Dateikopf. Zellwerte gehören wie in der
// Tabellen-Form nicht dazu (Variante A1 aus 4T-001610).
//
// Hinzu kommt eine Angabe, die die Tabellen-Form nicht braucht: `kartei`, der
// Pfad der Kartei-Tabelle. Bei der Tabellen-Form ergibt sich die Tabelle aus
// dem Datei-Namen (Kopf-Datei oder Folge-Segment), bei einer Karteikarte nicht;
// ohne die Angabe hielte jeder Verbraucher die Karteikarte für eine eigene
// Tabelle ihres Namens. Die Zählung der Übersicht liest sie, und der Zugriff
// über Kennung und Schlüssel übergeht Einträge mit ihr, bis 4T-002388 Abfrage
// und Verweis über Karteikarten führt.
//
// --- Warum ein Nachlauf und kein Vorlauf -----------------------------------------
//
// Ein Folge-Segment nennt seine Kopf-Datei im eigenen Namen; der Vorlauf in
// `datensatz-erfassung.js` kann sie deshalb vor dem Durchlauf lesen. Eine
// Karteikarte nennt ihre Tabelle nirgends (F3 A): Welche Datei ihres Ordners
// eine Kartei-Tabelle ist, zeigt erst deren Dateikopf, und den vor dem
// Durchlauf für jede Datei zu lesen, verdoppelte die Lese-Arbeit des Aufbaus.
// Gewählt ist deshalb der **Nachlauf**: Nach dem Durchlauf sind die Marken
// (`dbKindsPerFile`) und die Werte des Dateikopfs (`propertiesPerFile`) jeder
// Datei bekannt. Gelesen wird dann je Tabellen-Datei einmal ihr Kopf, und die
// Karteikarten werden aus dem bereits erfassten Dateikopf gebildet, ohne die
// Karteikarte erneut zu lesen. Im Beobachter-Pfad und im Puffer-Overlay ist die
// Ablage vollständig; dort ergänzt `mitKarteikarte` das Ergebnis des Parsers.
// `parse.js` bleibt zustandsfrei und kennt die Ablage nicht.
//
// --- Die Ablage der Kartei-Tabellen ----------------------------------------------
//
// Eigentümer der prozessweiten Ablage ist dieses Modul: je Ordner die
// Kartei-Tabellen mit Definition und Signatur. Ihre Größe hängt an der Zahl
// der Kartei-Tabellen, nicht an der Zahl der Dateien. Zwei Kartei-Tabellen in
// einem Ordner bleiben beide stehen; zugeordnet wird dann keine, wie die
// Konsistenz-Prüfung es meldet (`karteiOrdnerMehrdeutig`).
//
// **Die Werte** legt seit Schnitt C `karteikartenWerte` im prozess-neutralen
// Modul `karteikarte.js` aus, dieselbe Funktion für Index und Datenbank-Sicht.
//
// **Nicht hier:** der Vorlagen-Ausschluss. Ihn kennt nur das Fenster, das den
// Vorlagen-Ordner gewählt hat; der Index gehört allen Fenstern.

'use strict';

const path = require('node:path');
const { DB_RECORD_KEY } = require('../../shared/database/behaelter.js');
const { istKarteiForm } = require('../../shared/database/table-definition.js');
const { anzeigeSpalte } = require('../../shared/database/record-identity.js');
const {
  karteikartenKennung,
  karteikartenWerte,
  feldTextVon,
  FREMDE_MARKEN,
} = require('../../shared/database/karteikarte.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { definitionAusText, leseKopfAsync, leseKopfSync } = require('./datensatz-erfassung.js');
const { kopfDateiFuer } = require('./part-files.js');
const { datensatzErfassungAktiv } = require('./index-schalter.js');

// Ordner-Schlüssel -> Map(Pfad der Kartei-Tabelle -> { definition, signatur }).
const karteiTabellen = new Map();

// Vergleichs-Schlüssel des Ordners einer Datei: Trenner vereinheitlicht, NFC
// wie die Datei-Schlüssel des Index, Schreibung nach dem Dateisystem.
function ordnerSchluessel(pfad) {
  return pathCompareKey(path.normalize(path.dirname(String(pfad).normalize('NFC'))));
}

/**
 * Trägt eine Tabellen-Datei nach ihrem Kopf in die Ablage ein oder nimmt sie
 * heraus, wenn sie keine Kartei-Tabelle (mehr) ist.
 *
 * @param {string} tabellenPfad Pfad der Tabellen-Datei, wie der Index ihn führt.
 * @param {string|null} text Kopf der Datei; null bei einem Lesefehler.
 * @returns {boolean} true, wenn sich die Zuordnung im Ordner ändern kann:
 *   Tabelle neu, entfallen oder mit anderer Signatur.
 */
function merkeKarteiTabelle(tabellenPfad, text) {
  const gelesen = text === null ? null : definitionAusText(text);
  if (!gelesen || !istKarteiForm(gelesen.definition)) return vergissKarteiTabelle(tabellenPfad);
  const ordner = ordnerSchluessel(tabellenPfad);
  let tabellen = karteiTabellen.get(ordner);
  if (!tabellen) {
    tabellen = new Map();
    karteiTabellen.set(ordner, tabellen);
  }
  const vorher = tabellen.get(tabellenPfad);
  tabellen.set(tabellenPfad, gelesen);
  return !vorher || vorher.signatur !== gelesen.signatur;
}

/** Wie `merkeKarteiTabelle`, mit dem Kopf von der Platte (synchron). */
function merkeKarteiTabelleAusDatei(tabellenPfad) {
  return merkeKarteiTabelle(tabellenPfad, leseKopfSync(tabellenPfad));
}

/**
 * Nimmt eine Tabellen-Datei aus der Ablage.
 *
 * @returns {boolean} true, wenn sie dort stand.
 */
function vergissKarteiTabelle(tabellenPfad) {
  const ordner = ordnerSchluessel(tabellenPfad);
  const tabellen = karteiTabellen.get(ordner);
  if (!tabellen || !tabellen.delete(tabellenPfad)) return false;
  if (tabellen.size === 0) karteiTabellen.delete(ordner);
  return true;
}

/** Leert die Ablage vollständig (Test-Isolation). */
function vergissAlleKarteiTabellen() {
  karteiTabellen.clear();
}

/**
 * Die Kartei-Tabelle, der eine Datei ihres Ordners zugeordnet wird.
 *
 * @returns {{pfad: string, definition: object, signatur: string}|null} null,
 *   wenn der Ordner keine oder mehr als eine Kartei-Tabelle trägt oder die
 *   Datei die Tabelle selbst ist.
 */
function karteiTabelleFuer(pfad) {
  const tabellen = karteiTabellen.get(ordnerSchluessel(pfad));
  if (!tabellen || tabellen.size !== 1) return null;
  const [[tabellenPfad, gelesen]] = tabellen;
  if (pathCompareKey(tabellenPfad) === pathCompareKey(pfad)) return null;
  return { pfad: tabellenPfad, definition: gelesen.definition, signatur: gelesen.signatur };
}

// 4T-002388: Der Index führt einen Wahrheitswert des Dateikopfs als Text
// (`true`/`false`, `normalizePropertyValue` in `parse.js`). An einer
// Wahrheitswert-Spalte wird er vor der Auslegung zurückverwandelt, damit
// Schlüssel und Anzeige-Form im Index in der Schreibweise der Zelle stehen
// (`x` für ja, leer für nein), wie sie der Lese-Weg der Abfrage aus dem
// Dateikopf bildet (`record-kartei-read.js`).
function mitWahrheitswerten(angaben, definition) {
  const felder = Array.isArray(definition.fields) ? definition.fields : [];
  const wandle = (w) => (w === 'true' ? true : w === 'false' ? false : w);
  const kopie = { ...angaben };
  for (const feld of felder) {
    if (!feld || feld.type !== 'boolean') continue;
    const name = String(feld.name || '').toLowerCase();
    if (!Object.hasOwn(kopie, name)) continue;
    const wert = kopie[name];
    kopie[name] = Array.isArray(wert) ? wert.map(wandle) : wandle(wert);
  }
  return kopie;
}

/**
 * Erfasst eine Karteikarte für den Index.
 *
 * @param {string} pfad Pfad der Datei, wie der Index ihn führt.
 * @param {string[]} marken Ihre Datenbank-Marken (`dbKinds`).
 * @param {object} werte Ihre Werte des Dateikopfs (`properties`).
 * @returns {{records: Array, defSignatur: string}|null} null, wenn die Datei
 *   keine Karteikarte ist: ohne Marke `record`, mit einer anderen
 *   Datenbank-Marke, als Folgeteil, ohne eindeutige Kartei-Tabelle im Ordner
 *   oder ohne brauchbare Kennung.
 */
function erfasseKarteikarte(pfad, marken, werte) {
  if (!Array.isArray(marken) || !marken.includes('record')) return null;
  if (marken.some((marke) => FREMDE_MARKEN.includes(marke))) return null;
  if (kopfDateiFuer(pfad)) return null;
  const tabelle = karteiTabelleFuer(pfad);
  if (!tabelle) return null;
  const angaben = werte && typeof werte === 'object' ? werte : {};
  const { kennung } = karteikartenKennung({ [DB_RECORD_KEY]: angaben[DB_RECORD_KEY] });
  if (kennung === null) return null;
  const definition = tabelle.definition;
  // 4T-002387 (Schnitt C): Schlüssel und Anzeige-Form aus der einen Auslegung
  // der Werte einer Karteikarte (`karteikartenWerte`), als Text wie die Zellen
  // der Tabellen-Form im Index. Die Werte des Index sind bereits beschnitten;
  // einen Wahrheitswert verwandelt `mitWahrheitswerten` zurück (4T-002388).
  const zellen = karteikartenWerte(mitWahrheitswerten(angaben, definition), definition);
  const anzeige = anzeigeSpalte(definition);
  const record = {
    id: kennung,
    key: Array.isArray(definition.key)
      ? definition.key.map((name) => feldTextVon(zellen, name))
      : null,
    display: anzeige ? feldTextVon(zellen, anzeige) : null,
    zeile: 0,
    kartei: tabelle.pfad,
  };
  return { records: [record], defSignatur: tabelle.signatur };
}

/**
 * Ergänzt ein Parse-Ergebnis um die Karteikarte, wenn die Datei eine ist.
 *
 * Für den Beobachter-Pfad und das Puffer-Overlay, in denen die Ablage
 * vollständig ist. Eine Karteikarte geht einem Datensatz-Block in ihrem
 * Körper vor, weil ihre Marke sie als Datensatz ausweist.
 *
 * @param {string} pfad Pfad der Datei.
 * @param {object|null} parsed Ergebnis von `parseContent`; wird verändert.
 * @returns {object|null} Dasselbe Ergebnis.
 */
function mitKarteikarte(pfad, parsed) {
  if (!parsed || !datensatzErfassungAktiv()) return parsed;
  const erfasst = erfasseKarteikarte(pfad, parsed.dbKinds, parsed.properties);
  if (erfasst) {
    parsed.records = erfasst.records;
    parsed.recordDefSig = erfasst.defSignatur;
  }
  return parsed;
}

// Steht unter dieser Datei ein Bestand aus der Karteikarten-Erfassung?
function istKarteikartenBestand(records) {
  return Array.isArray(records) && records.length > 0 && Boolean(records[0].kartei);
}

/**
 * Erfasst die Karteikarten eines Ordners oder der ganzen Wurzel neu.
 *
 * Gelaufen wird über `dbKindsPerFile`, denn nur eine Datei mit der Marke
 * `record` kann eine Karteikarte sein. Ein Bestand, der nicht aus dieser
 * Erfassung stammt, bleibt unberührt.
 *
 * @param {object} entry Index-Eintrag.
 * @param {string|null} ordner Ordner-Schlüssel, oder null für alle Ordner.
 */
function ordneKarteikartenNeuZu(entry, ordner) {
  for (const [pfad, marken] of entry.dbKindsPerFile) {
    if (!Array.isArray(marken) || !marken.includes('record')) continue;
    if (ordner !== null && ordnerSchluessel(pfad) !== ordner) continue;
    const erfasst = datensatzErfassungAktiv()
      ? erfasseKarteikarte(pfad, marken, entry.propertiesPerFile.get(pfad))
      : null;
    if (erfasst) {
      entry.recordsPerFile.set(pfad, erfasst.records);
      entry.recordDefSigPerFile.set(pfad, erfasst.defSignatur);
    } else if (istKarteikartenBestand(entry.recordsPerFile.get(pfad))) {
      entry.recordsPerFile.delete(pfad);
      entry.recordDefSigPerFile.delete(pfad);
    }
  }
}

// Liegt ein Pfad unter der Wurzel?
function liegtUnter(pfad, wurzel) {
  const rel = path.relative(wurzel, pfad);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Der Nachlauf des Index-Aufbaus (siehe Kopf-Kommentar).
 *
 * Erst wird die Ablage für diese Wurzel abgeglichen (eine Tabelle, die es
 * nicht mehr gibt, fällt heraus), dann je Tabellen-Datei ihr Kopf gelesen und
 * zuletzt jede Karteikarte erfasst. Ein Bestand aus dem Zwischenspeicher wird
 * dabei überschrieben, weil er gegen eine veraltete Definition stehen kann.
 *
 * @param {object} entry Index-Eintrag.
 * @param {() => boolean} [istAktuell] Abbruch-Frage nach jedem Lesen.
 * @returns {Promise<boolean>} false, wenn der Lauf abgebrochen wurde.
 */
async function erfasseKarteikartenNachAufbau(entry, istAktuell = () => true) {
  if (!datensatzErfassungAktiv()) return true;
  const istTabelle = (p) => (entry.dbKindsPerFile.get(p) || []).includes('table');
  for (const tabellen of [...karteiTabellen.values()]) {
    for (const tabellenPfad of [...tabellen.keys()]) {
      if (liegtUnter(tabellenPfad, entry.wurzel) && !istTabelle(tabellenPfad)) {
        vergissKarteiTabelle(tabellenPfad);
      }
    }
  }
  for (const [pfad, marken] of [...entry.dbKindsPerFile]) {
    if (!Array.isArray(marken) || !marken.includes('table')) continue;
    const text = await leseKopfAsync(pfad);
    if (!istAktuell()) return false;
    merkeKarteiTabelle(pfad, text);
  }
  ordneKarteikartenNeuZu(entry, null);
  return true;
}

/**
 * Beobachter-Pfad nach dem Eintragen einer geänderten oder neuen Datei.
 *
 * Ist die Datei eine Tabellen-Datei oder war sie eine Kartei-Tabelle, wird
 * die Ablage nachgezogen; ändert sich dabei etwas, werden die Karteikarten
 * ihres Ordners neu erfasst. Das trägt die Neu-Erfassung nach einer Änderung
 * von Feldern, Schlüssel, Anzeige-Form oder `storage`.
 */
function karteiNachAenderung(entry, pfad, marken) {
  const istTabelle = Array.isArray(marken) && marken.includes('table');
  if (!istTabelle && !istGemerkt(pfad)) return;
  const geaendert = istTabelle ? merkeKarteiTabelleAusDatei(pfad) : vergissKarteiTabelle(pfad);
  if (geaendert) ordneKarteikartenNeuZu(entry, ordnerSchluessel(pfad));
}

/** Beobachter-Pfad nach dem Löschen einer Datei. */
function karteiNachLoeschung(entry, pfad) {
  if (vergissKarteiTabelle(pfad)) ordneKarteikartenNeuZu(entry, ordnerSchluessel(pfad));
}

function istGemerkt(pfad) {
  const tabellen = karteiTabellen.get(ordnerSchluessel(pfad));
  return Boolean(tabellen && tabellen.has(pfad));
}

/**
 * Die Zahl der Karteikarten je Kartei-Tabelle in einer Index-Sicht.
 *
 * @param {object} sicht Index-Eintrag oder überlagerte Sicht.
 * @returns {Map<string, number>} Vergleichs-Schlüssel des Tabellen-Pfades ->
 *   Zahl; eine Tabelle ohne Karteikarte fehlt.
 */
function zahlDerKarteikarten(sicht) {
  const zahlen = new Map();
  for (const [, records] of (sicht && sicht.recordsPerFile) || []) {
    if (!istKarteikartenBestand(records)) continue;
    const schluessel = pathCompareKey(records[0].kartei);
    zahlen.set(schluessel, (zahlen.get(schluessel) || 0) + records.length);
  }
  return zahlen;
}

module.exports = {
  merkeKarteiTabelle,
  vergissAlleKarteiTabellen,
  karteiTabelleFuer,
  erfasseKarteikarte,
  mitKarteikarte,
  erfasseKarteikartenNachAufbau,
  karteiNachAenderung,
  karteiNachLoeschung,
  zahlDerKarteikarten,
};
