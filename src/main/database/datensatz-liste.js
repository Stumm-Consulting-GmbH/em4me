// 4T-001942 (Epic 3E-000257, Bauplan B1; E5.3, E5.4): Die Liste der Datensätze
// EINER Tabelle für die Wertehilfe der Verweis-Felder — je Datensatz Kennung,
// Anzeige-Form und Wert des einteiligen Schlüssels, sortiert nach Anzeige-Form.
//
// **Frisch aus den Dateien, nicht aus dem Index.** Der Index führt Kennung,
// Schlüssel und Anzeige je Datensatz zwar mit, zieht aber über den Beobachter
// nach; die Wertehilfe soll einen eben angelegten Datensatz im selben
// Bearbeitungs-Gang zeigen. Gelesen wird deshalb über denselben Weg wie die
// Schreib-Schnittstelle und die Datensatz-Auskunft (`leseTabellenBestand`), mit
// allen Segmenten einer geteilten Tabelle. Die Kosten sind gemessen (Prüfdatei
// `db-datensaetze-kanal.test.js`).
//
// **Die Tabelle kommt als Name oder als Pfad.** Eine Verweis-Spalte nennt ihre
// Ziel-Tabelle in `options.table` beim Namen; aufgelöst wird hier über
// denselben Vergleich wie in den Regeln der Schreib-Schnittstelle
// (`findeKopfDatei` gegen die Tabellen-Sicht des Index), damit der Anzeige-Prozess
// die Auflösung nicht nachbaut und beide Seiten dieselbe Tabelle meinen.
// **Welche** Tabellen es gibt, sagt damit der Index; ihren Inhalt die Datei.
//
// **Die Texte folgen der Auslegung des Schreibwegs** (`werteDes`, wie in der
// Datensatz-Auskunft): Der Trennabstand hinter dem letzten Datensatz einer Datei
// gehört nicht zum Wert seiner letzten Zelle. Der Schlüssel-Wert wird nicht
// getrimmt, weil die Verweis-Regel ihn zeichengenau vergleicht
// (`record-regel-verweis.js`); die Anzeige-Form wird für Sortierung und Anzeige
// getrimmt, weil sie nur benennt.
//
// **Nicht hier:** die Prüfung der Anfrage gegen die Bereichs-Grenze, die der
// Kanal nach der Auflösung des Namens leistet, und jedes Schreiben. Das Modul
// prüft die Grenze über `loeseTabelle` trotzdem ein zweites Mal, bevor es liest.
// Electron-frei; Dateizugriff und Sicht kommen herein.
'use strict';

const path = require('node:path');

const {
  anzeigeSpalte,
  kennungFuer,
  nummerAus,
} = require('../../shared/database/record-identity.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { werteDes, zellText } = require('./record-auftrag-plan.js');
const { loeseTabelle, leseTabellenBestand } = require('./record-auftrag-bestand.js');
const { findeKopfDatei } = require('./record-regel-hilfen.js');
const { tabellenName } = require('./table-catalog.js');

function fehler(code) {
  return { status: 'error', code };
}

/**
 * Die Kopf-Datei zur Angabe einer Tabelle: zuerst als Name oder absoluter Pfad
 * (der Vergleich der Regel-Hilfen), dann als Pfad relativ zur Bereichs-Wurzel.
 *
 * @param {object} p Parameter.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Die Tabellen-Sicht des Bereichs-Index.
 * @param {string} p.tabelle Name oder Pfad der Tabelle.
 * @returns {string|null} Der absolute Pfad der Kopf-Datei, oder null.
 */
function findeZielTabelle({ wurzel, sicht, tabelle }) {
  if (!sicht || typeof tabelle !== 'string' || tabelle.trim() === '') return null;
  const angabe = tabelle.trim();
  const direkt = findeKopfDatei(sicht, angabe);
  if (direkt !== null || typeof wurzel !== 'string' || wurzel === '') return direkt;
  return findeKopfDatei(sicht, path.resolve(wurzel, angabe));
}

// Der Index einer Spalte nach Namen, ohne Rücksicht auf die Schreibung (wie die
// Feld-Karte der Definition); -1, wenn es sie nicht gibt.
function spaltenIndex(fields, name) {
  if (typeof name !== 'string') return -1;
  const klein = name.toLowerCase();
  return fields.findIndex((feld) => feld.name.toLowerCase() === klein);
}

// Sortiert nach Anzeige-Form ohne Rücksicht auf Groß-/Kleinschreibung; eine
// leere Anzeige steht zuletzt, bei gleicher Anzeige entscheidet die Nummer der
// Kennung, damit die Reihenfolge nie vom Lese-Weg abhängt.
function vergleiche(a, b) {
  if ((a.anzeige === '') !== (b.anzeige === '')) return a.anzeige === '' ? 1 : -1;
  const anzeige = a.anzeige.localeCompare(b.anzeige, undefined, { sensitivity: 'base' });
  if (anzeige !== 0) return anzeige;
  return nummerAus(a.kennung) - nummerAus(b.kennung);
}

/**
 * Liest die Datensätze einer Tabelle frisch aus ihren Dateien.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Die Tabellen-Sicht des Bereichs-Index.
 * @param {string} p.tabelle Name oder Pfad der Tabelle.
 * @returns {Promise<object>} `{status: 'ready', tabelle, pfad, display, keyEinteilig,
 *   datensaetze: Array<{kennung, anzeige, schluessel}>}` bzw. `{status: 'error', code}`
 *   mit einem Code aus `LAGEN`. `anzeige` ist leer ohne Anzeige-Spalte, `schluessel`
 *   null ohne einteiligen Schlüssel.
 */
async function liesDatensatzListe({ fsp, wurzel, sicht, tabelle }) {
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('liesDatensatzListe: fsp ist Pflicht und muss readFile tragen');
  if (typeof wurzel !== 'string' || wurzel === '') return fehler(LAGEN.wurzelFehlt);
  try {
    const kopf = findeZielTabelle({ wurzel, sicht, tabelle });
    if (kopf === null) return fehler(LAGEN.tabelleUnbekannt);
    const aufgeloest = loeseTabelle(wurzel, kopf);
    if (!aufgeloest.ok) return fehler(aufgeloest.lage.code);
    const bestand = await leseTabellenBestand(fsp, aufgeloest.pfad, tabelle);
    if (!bestand.ok) return fehler(bestand.lage.code);

    const { definition, fields } = bestand;
    const anzeigeIndex = spaltenIndex(fields, anzeigeSpalte(definition));
    const key = Array.isArray(definition.key) ? definition.key : null;
    const schluesselIndex = key && key.length === 1 ? spaltenIndex(fields, key[0]) : -1;

    const datensaetze = [];
    for (const datei of bestand.dateien) {
      for (const [id, record] of datei.records) {
        const kennung = kennungFuer(nummerAus(id));
        if (kennung === null) continue;
        const texte = werteDes(record);
        datensaetze.push({
          kennung,
          anzeige: anzeigeIndex < 0 ? '' : zellText(texte, anzeigeIndex).trim(),
          schluessel: schluesselIndex < 0 ? null : zellText(texte, schluesselIndex),
        });
      }
    }
    datensaetze.sort(vergleiche);
    return {
      status: 'ready',
      tabelle: tabellenName(aufgeloest.pfad),
      pfad: aufgeloest.pfad,
      display: definition.display || null,
      keyEinteilig: schluesselIndex >= 0,
      datensaetze,
    };
  } catch {
    // Ein Bruch, den keine benannte Lage beschreibt, bekommt deren eigenen Code,
    // statt über die Prozess-Grenze geworfen zu werden.
    return fehler(LAGEN.unerwartet);
  }
}

module.exports = { findeZielTabelle, liesDatensatzListe };
