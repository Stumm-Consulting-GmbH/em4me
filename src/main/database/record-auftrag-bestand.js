// 4T-001821 (Epic 3E-000254, Bauplan B6): Der Bestand einer Tabelle für die
// Schreib-Schnittstelle — die Datei auflösen, ihre Definition lesen, ihre
// Segmente einsammeln und sagen, in welcher Datei ein Datensatz liegt.
//
// **Warum nicht über den Katalog** (`table-catalog.js`). Er ist die eine Stelle,
// an der die Anwendung nachschlägt, WELCHE Tabellen es gibt, und er tut das über
// die Index-Sicht und einen Zwischenspeicher gegen Änderungszeit und Größe. Für
// den Schreibweg passt beides nicht: Die Anweisung nennt den Pfad der Kopf-Datei
// bereits (B1), es ist also nichts nachzuschlagen; und der Schreibweg liest die
// Datei nach B3 **frisch unter der Sperre**, während ein Zwischenspeicher gerade
// das vermeidet. Ein Katalog-Eintrag von vor der Sperre wäre der Stand, gegen
// den nicht geschrieben werden darf.
//
// **Zweimal gelesen, mit Absicht.** Vor dem Nehmen der Sperren wird allein die
// Definition der Kopf-Datei gelesen, weil Typ- und Pflicht-Prüfung nach B2 davor
// laufen und dafür nur Auftrag und Definition brauchen; ein Auftrag mit einer
// Typ-Verletzung nimmt damit gar keine Sperre. Unter der Sperre wird der ganze
// Bestand erneut gelesen, und **dieser** Stand ist der, gegen den geschrieben
// wird.
//
// **Ein Auftrag darf Datensätze verschiedener Segmente tragen** (B6). Gefunden
// werden die Segmente über den bestehenden Weg für geteilte Dokumente, also über
// die Namensform; ein zweiter Such-Weg entsteht nicht. Angelegt wird im letzten
// Segment beziehungsweise in der ungeteilten Kopf-Datei.
//
// **Nicht hier:** Sperre, Vorgang, Beleg und jedes Schreiben. Dieses Modul liest.
'use strict';

const path = require('node:path');

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseTableDefinition } = require('../../shared/database/table-definition.js');
const { parseRecordBlock } = require('../../shared/database/record-block.js');
const { datensatzRumpf } = require('../../shared/database/record-segment.js');
const { readPartLine } = require('../../shared/document-parts.js');
// Die harte Bereichs-Grenze der Anwendung. Sie liegt an einer Stelle, und
// `area/` importiert seinerseits nichts aus `database/` — kein Ordner-Zyklus.
const { isInsideArea } = require('../area/area-path.js');
// Namens-Regel der Markdown-Dateien und der Weg zu den Folge-Teilen eines
// geteilten Dokuments. Beides liegt fertig bereit; eine zweite Endungs-Liste und
// ein zweiter Verzeichnis-Durchlauf entstehen hier nicht.
const { MD_EXTENSION_RE, scanOwnParts } = require('../documents/document-parts-io.js');
const { LAGEN, befund, feldKarte } = require('./record-auftrag-pruefung.js');

/**
 * Löst die Tabellen-Angabe einer Anweisung auf den Pfad ihrer Kopf-Datei auf.
 *
 * Geprüft wird **vor jedem Dateizugriff**: Ein Pfad, der aus dem Bereich
 * hinausführt, wird abgewiesen, und die Markdown-Endung gehört dazu, weil der
 * Pfad der Beleg-Datei aus diesem gebildet wird — ohne sie ließe sich die
 * Bildung auf beliebige Nachbar-Dateien richten (Muster des lesenden Kanals in
 * `src/main/ipc/database.js`).
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {string} tabelle Pfad der Kopf-Datei, relativ zur Bereichs-Wurzel.
 * @returns {{ok: true, pfad: string}|{ok: false, lage: object}}
 */
function loeseTabelle(bereichsWurzel, tabelle) {
  const absolut = path.resolve(bereichsWurzel, tabelle);
  if (!isInsideArea(bereichsWurzel, absolut) || !MD_EXTENSION_RE.test(absolut))
    return { ok: false, lage: befund(LAGEN.tabelleAusserhalb, { tabelle }) };
  return { ok: true, pfad: absolut };
}

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

async function lies(fsp, pfad) {
  try {
    return { ok: true, text: await fsp.readFile(pfad, 'utf8') };
  } catch (err) {
    return { ok: false, error: alsText(err) };
  }
}

/**
 * Liest die Definition einer Tabelle aus ihrer Kopf-Datei.
 *
 * Die Angaben, die den Schreibweg angehen: die Felder in ihrer Reihenfolge
 * (sie SIND der Vertrag, E3.3), der Hochwasserstand der internen Kennung und
 * die Übersteuerung der Verdichtungs-Grenzen, die an `verdichteBeiBedarf`
 * weitergereicht wird.
 *
 * @param {object} fsp Dateizugriff.
 * @param {string} pfad Pfad der Kopf-Datei.
 * @param {string} tabelle Die Angabe der Anweisung, für die Meldung.
 * @returns {Promise<object>} `{ok: true, pfad, tabelle, text, fields, karte, lastId, grenzen,
 *   definition}` bzw. `{ok: false, lage}`. `definition` ist das vollständige Ergebnis
 *   von `parseTableDefinition` (4T-001938): Schlüssel, Anzeige-Form, Prüfregeln und
 *   Bearbeitbarkeit, ohne dass ein Leser die Kopf-Datei ein zweites Mal auslegt.
 */
async function leseDefinition(fsp, pfad, tabelle) {
  const gelesen = await lies(fsp, pfad);
  if (!gelesen.ok)
    return { ok: false, lage: befund(LAGEN.tabelleUnbekannt, { tabelle, grund: gelesen.error }) };
  const kopf = extractFrontmatter(gelesen.text);
  const definition = parseTableDefinition(kopf.data);
  // Eine Datei ohne den Definitions-Behälter ist keine Tabelle. Sie wird
  // abgewiesen und nicht zur Tabelle erklärt: Wer hier schriebe, legte einen
  // Datensatz-Block in ein gewöhnliches Dokument des Anwenders.
  if (!definition.istTabelle)
    return { ok: false, lage: befund(LAGEN.tabelleUnbekannt, { tabelle }) };
  return {
    ok: true,
    pfad,
    tabelle,
    text: gelesen.text,
    fields: definition.fields,
    karte: feldKarte(definition.fields),
    lastId: definition.lastId === undefined ? null : definition.lastId,
    grenzen: definition.changeLog || null,
    definition,
  };
}

// Die Datensätze einer Datei, nach ihrer Kennung ansprechbar. Der
// Wagenrücklauf wird vor dem Auslegen abgeschnitten, aus demselben Grund wie in
// `record-write.js`: Sonst trüge jeder Zell-Text einer CRLF-Datei ein `\r` am
// Zeilenende, das beim Vergleich mit dem neuen Wert mitzählte.
//
// **Eine Kennung, die in DERSELBEN Datei zweimal vorkommt, wird eigens
// vermerkt.** Das Zurückschreiben weist sie ab, und der Aufrufer soll das
// erfahren, bevor er einen Vorgang zieht; still den ersten oder letzten
// Datensatz zu nehmen hieße, an einem geratenen Ziel zu arbeiten.
function leseDatensaetze(text, fields) {
  const rumpf = datensatzRumpf(text);
  if (!rumpf) return { records: new Map(), doppelt: new Set() };
  const zeilen = rumpf.rumpf.split('\n').map((z) => (z.endsWith('\r') ? z.slice(0, -1) : z));
  const { records } = parseRecordBlock(zeilen.join('\n'), fields);
  const karte = new Map();
  const doppelt = new Set();
  for (const record of records) {
    if (!record.id) continue;
    if (karte.has(record.id)) doppelt.add(record.id);
    else karte.set(record.id, record);
  }
  return { records: karte, doppelt };
}

/**
 * Liest den vollständigen Bestand einer Tabelle: Kopf-Datei und Segmente.
 *
 * @param {object} fsp Dateizugriff.
 * @param {string} pfad Pfad der Kopf-Datei.
 * @param {string} tabelle Die Angabe der Anweisung, für die Meldung.
 * @returns {Promise<object>} `{ok: true, pfad, tabelle, fields, karte, lastId, grenzen,
 *   definition, dateien: Array<{pfad, text, kopf: boolean, records: Map, doppelt: Set}>,
 *   ziel: string}`
 *   bzw. `{ok: false, lage}`. `ziel` ist die Datei, in der ein neuer Datensatz
 *   entsteht.
 */
async function leseTabellenBestand(fsp, pfad, tabelle) {
  const kopf = await leseDefinition(fsp, pfad, tabelle);
  if (!kopf.ok) return kopf;

  const dateien = [
    { pfad, text: kopf.text, kopf: true, ...leseDatensaetze(kopf.text, kopf.fields) },
  ];
  // Der Regelfall ist die ungeteilte Tabelle, und er kostet nichts: Ohne
  // Zuordnungs-Zeile wird kein Verzeichnis gelesen.
  if (readPartLine(kopf.text) !== null) {
    let teile;
    try {
      teile = await scanOwnParts(pfad);
    } catch (err) {
      return {
        ok: false,
        lage: befund(LAGEN.lesenFehlgeschlagen, { tabelle, grund: alsText(err) }),
      };
    }
    for (const teilPfad of teile) {
      const gelesen = await lies(fsp, teilPfad);
      if (!gelesen.ok)
        return {
          ok: false,
          lage: befund(LAGEN.lesenFehlgeschlagen, {
            tabelle,
            datei: teilPfad,
            grund: gelesen.error,
          }),
        };
      dateien.push({
        pfad: teilPfad,
        text: gelesen.text,
        kopf: false,
        ...leseDatensaetze(gelesen.text, kopf.fields),
      });
    }
  }

  return {
    ok: true,
    pfad,
    tabelle,
    fields: kopf.fields,
    karte: kopf.karte,
    lastId: kopf.lastId,
    grenzen: kopf.grenzen,
    definition: kopf.definition,
    dateien,
    // Angelegt wird im LETZTEN Segment beziehungsweise in der ungeteilten
    // Kopf-Datei (B6). Das ist die Stelle, an der die Teilung ohnehin wächst;
    // ein neuer Datensatz mitten in einem früheren Segment verschöbe die
    // Grenzen aller folgenden.
    ziel: dateien[dateien.length - 1].pfad,
  };
}

/**
 * In welcher Datei der Tabelle liegt dieser Datensatz?
 *
 * @param {object} bestand Ergebnis von `leseTabellenBestand`.
 * @param {string} id Interne Kennung, aufgefüllt.
 * @returns {{ok: true, pfad: string}|{ok: false, code: string}} `code` trennt
 *   «nicht gefunden» von «in mehreren Dateien».
 */
function dateiFuerKennung(bestand, id) {
  const treffer = bestand.dateien.filter((datei) => datei.records.has(id));
  if (treffer.length === 0) return { ok: false, code: LAGEN.datensatzUnbekannt };
  if (treffer.length > 1 || treffer[0].doppelt.has(id))
    return { ok: false, code: LAGEN.datensatzMehrdeutig };
  return { ok: true, pfad: treffer[0].pfad };
}

/** @returns {boolean} Trägt irgendeine Datei der Tabelle diese Kennung? */
function kennungVorhanden(bestand, id) {
  return bestand.dateien.some((datei) => datei.records.has(id));
}

module.exports = {
  loeseTabelle,
  leseDefinition,
  leseTabellenBestand,
  dateiFuerKennung,
  kennungVorhanden,
};
