// 4T-002405 (Epic 3E-000266, F4 A, F5 A): Die Weichen der beiden
// Dokument-Kanäle des Bereichs-Panels für eine Karteikarte.
//
// **Löschen und Kopieren einer Karteikarte sind Aufträge der Datenbank.** Das
// Bereichs-Panel löscht und kopiert Dateien (`area:trashFile` in
// `src/main/ipc/areas.js`, `area:copyFile` in `src/main/ipc/area-copy.js`). Ist
// die Datei eine Karteikarte, liefe das an den Regeln vorbei, die über die
// Datenbank gelten: Das Löschen umginge Lösch-Schutz, Berechtigung und die
// Übertragung der Belege an die Tabelle, die Kopie trüge dieselbe Kennung und
// denselben Schlüssel wie die Vorlage. Diese Weichen geben beides an die
// Schreib-Schnittstelle (`record-auftrag.js`), durch die jede Änderung an
// Datensätzen läuft: Das Löschen wird ein Lösch-Auftrag, das Kopieren ein
// Anlege-Auftrag mit der Vorlage (`karteikarte: { name, vorlage }`). Die Kanäle
// behalten ihre Bedienung, die Folge übernimmt die Schnittstelle.
//
// **Ein Modul für beide Weichen**, weil beide dieselbe Erkennung tragen und
// sich nur im Auftrag unterscheiden; zwei Module hielten dieselbe Erkennung
// zweimal.
//
// **Die Erkennung.** Eine Datei ist eine Karteikarte, wenn `karteikartenArt`
// sie im Ordner genau einer Kartei-Tabelle als Karteikarte einstuft (dieselbe
// Regel wie die Prüfung beim Speichern, `speicher-pruefung.js`). Die Tabelle
// des Ordners kommt aber **aus dem Ordner und nicht aus dem Index**, wie im
// Bestand der Schnittstelle (`leseKarteikarten` in `record-auftrag-kartei.js`),
// und ohne Vorlagen-Ausschluss wie dort: Die Weiche entscheidet, ob ein
// Auftrag an die Schnittstelle geht, und muss deshalb dieselben Dateien als
// Karteikarten sehen wie sie. Eine Erkennung über den Index ginge bei einem
// noch nicht bereiten Index den Papierkorb-Weg und damit am Lösch-Schutz vorbei.
// Ein Dokument ohne Kennung, eine Datei in einem Ordner mit keiner oder zwei
// Kartei-Tabellen und jede andere Datei bleiben auf dem bisherigen Weg.
//
// **Im Aus-Zustand der Erweiterung «Datenbank»** erkennt die Weiche nichts, und
// beide Kanäle behandeln eine Karteikarte wie jede Datei.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { DB_RECORD_KEY } = require('../../shared/database/behaelter.js');
const {
  parseTableDefinition,
  istKarteiForm,
} = require('../../shared/database/table-definition.js');
const { KARTEIKARTEN_ARTEN, karteikartenArt } = require('../../shared/database/karteikarte.js');
const { ART_ANLEGEN, ART_LOESCHEN } = require('../../shared/database/record-write.js');
const { MD_EXTENSION_RE } = require('../documents/document-parts-io.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { REGEL_LAGEN } = require('./record-regeln.js');

// Fehler-Angabe der Kanäle bei einer Abweisung der Schnittstelle; das Ergebnis
// selbst reist unverändert in `datenbank` mit, damit der Anzeige-Prozess den
// Grund in der Sprache des Anwenders bildet (`loeseErgebnisAuf`).
const KARTEI_FEHLER = 'database';

// BOM als Escape-Form wie in `speicher-pruefung.js`.
const BOM_RE = new RegExp('^﻿');

// Der Dateikopf eines Dokuments, oder null.
async function dateikopfVon(fsp, pfad) {
  try {
    const text = String(await fsp.readFile(pfad, 'utf8')).replace(BOM_RE, '');
    const kopf = extractFrontmatter(text);
    return kopf.parseError ? null : kopf.data;
  } catch {
    return null;
  }
}

// Die eine Kartei-Tabelle im Ordner, oder null bei keiner oder zweien.
async function karteiTabelleIm(fsp, ordner, ausser) {
  let eintraege;
  try {
    eintraege = await fs.readdir(ordner, { withFileTypes: true });
  } catch {
    return null;
  }
  const karteien = [];
  for (const eintrag of eintraege) {
    if (!eintrag.isFile() || !MD_EXTENSION_RE.test(eintrag.name)) continue;
    const pfad = path.join(ordner, eintrag.name);
    if (pfad === ausser) continue;
    const frontmatter = await dateikopfVon(fsp, pfad);
    if (frontmatter && istKarteiForm(parseTableDefinition(frontmatter))) karteien.push(pfad);
  }
  return karteien.length === 1 ? karteien[0] : null;
}

// Ist die Name-Belegung der Grund der Abweisung? Dann nimmt die Namensfindung
// des Kanals die nächste Nummer, wie bei einer vorhandenen Datei: Datei-Name
// und Schlüssel sind nach dem Umbenennen zwei Werte (F2 A), und ein Schlüssel
// kann vergeben sein, ohne dass eine Datei so heißt.
function nameBelegt(ergebnis) {
  const lagen = ergebnis && Array.isArray(ergebnis.lagen) ? ergebnis.lagen : [];
  return (
    lagen.length > 0 &&
    lagen.every(
      (lage) =>
        lage.code === LAGEN.karteiDateiVorhanden ||
        (lage.code === LAGEN.pruefBefund &&
          lage.naht &&
          lage.naht.code === REGEL_LAGEN.schluesselDoppeltImBestand),
    )
  );
}

function abgewiesen(ergebnis) {
  return { ok: false, error: KARTEI_FEHLER, datenbank: ergebnis };
}

/**
 * Baut die Weichen der Verdrahtung.
 *
 * @param {object} deps Nähte.
 * @param {{fuehreAuftragAus: Function}} deps.schreibSchnittstelle Die eine
 *   Schreib-Schnittstelle des Prozesses.
 * @param {() => boolean} deps.erweiterungAktiv Schalter der Erweiterung «Datenbank».
 * @param {object} deps.fsp Dateizugriff (`readFile`).
 * @returns {{karteikarteVon: Function, loescheKarteikarte: Function,
 *   kopierHandlung: Function}}
 */
function erzeugeKarteiWeichen({ schreibSchnittstelle, erweiterungAktiv, fsp }) {
  if (!schreibSchnittstelle || typeof schreibSchnittstelle.fuehreAuftragAus !== 'function')
    throw new TypeError('erzeugeKarteiWeichen: schreibSchnittstelle ist Pflicht');
  if (typeof erweiterungAktiv !== 'function')
    throw new TypeError('erzeugeKarteiWeichen: erweiterungAktiv ist Pflicht');
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('erzeugeKarteiWeichen: fsp ist Pflicht und muss readFile tragen');

  /**
   * Die Karteikarte zu einem Pfad, oder null für jede andere Datei und im
   * Aus-Zustand der Erweiterung.
   *
   * @param {string} pfad Pfad der Datei.
   * @returns {Promise<{pfad: string, tabelle: string, kennung: string}|null>}
   */
  async function karteikarteVon(pfad) {
    if (!erweiterungAktiv()) return null;
    if (typeof pfad !== 'string' || pfad === '' || !MD_EXTENSION_RE.test(pfad)) return null;
    const absolut = path.resolve(pfad);
    const frontmatter = await dateikopfVon(fsp, absolut);
    // Ohne `db-record` endet die Erkennung vor dem Lesen des Ordners.
    if (!frontmatter || frontmatter[DB_RECORD_KEY] === undefined) return null;
    const tabelle = await karteiTabelleIm(fsp, path.dirname(absolut), absolut);
    if (tabelle === null) return null;
    const art = karteikartenArt({
      pfad: absolut,
      frontmatter,
      tabellenPfad: tabelle,
      istVorlage: null,
    });
    if (art.art !== KARTEIKARTEN_ARTEN.karteikarte) return null;
    return { pfad: absolut, tabelle, kennung: art.kennung };
  }

  /**
   * Löscht eine Karteikarte über die Schnittstelle (F4 A): Lösch-Schutz und
   * Berechtigung, Übertragung der Belege samt Lösch-Beleg an die Tabelle, dann
   * Karteikarte und Beleg-Datei in den Papierkorb, alles in einem Auftrag.
   *
   * `erwartet` bleibt leer: Der Anwender löscht die Datei, wie sie auf der
   * Platte liegt, und hat keine Werte gesehen, die zu vergleichen wären.
   *
   * @param {{pfad: string, tabelle: string, kennung: string}} karte Ergebnis von `karteikarteVon`.
   * @param {string} bereichsWurzel Wurzel des Bereichs.
   * @returns {Promise<object>} `{ok: true, path, datenbank: true}` oder die
   *   Abweisung `{ok: false, error: 'database', datenbank}`; dann ist nichts geschehen.
   */
  async function loescheKarteikarte(karte, bereichsWurzel) {
    const ergebnis = await schreibSchnittstelle.fuehreAuftragAus(bereichsWurzel, {
      anweisungen: [{ tabelle: karte.tabelle, art: ART_LOESCHEN, id: karte.kennung, erwartet: {} }],
    });
    if (ergebnis && ergebnis.ok === true) return { ok: true, path: karte.pfad, datenbank: true };
    return abgewiesen(ergebnis);
  }

  /**
   * Die Kopier-Handlung für die Namensfindung von `area:copyFile` (F5 A), oder
   * null, wenn die Quelle keine Karteikarte ist.
   *
   * `kopiere(ziel)` gibt einen Anlege-Auftrag mit dem Namen des Ziels als
   * Schlüssel und Dateiname und der Quelle als Vorlage; die Schnittstelle zieht
   * die Kennung, übernimmt übrige Felder und Freitext und schreibt den
   * Anlege-Beleg. Ist der Name belegt, wirft sie `EEXIST`, und die
   * Namensfindung nimmt die nächste Nummer; jede andere Abweisung bricht ab und
   * steht danach in `abweisung()`.
   *
   * @param {string} quelle Pfad der Vorlage.
   * @param {string} bereichsWurzel Wurzel des Bereichs.
   * @returns {Promise<{kopiere: Function, abweisung: Function}|null>}
   */
  async function kopierHandlung(quelle, bereichsWurzel) {
    const karte = await karteikarteVon(quelle);
    if (karte === null) return null;
    let letzte = null;
    return {
      async kopiere(ziel) {
        const ergebnis = await schreibSchnittstelle.fuehreAuftragAus(bereichsWurzel, {
          anweisungen: [
            {
              tabelle: karte.tabelle,
              art: ART_ANLEGEN,
              karteikarte: { name: path.parse(ziel).name, vorlage: karte.pfad },
              // 4T-002545 (Epic 3E-000368): Die Kopie behält die Ausnahme von
              // der Pflicht-Prüfung, die sie vor dieser Änderung stillschweigend hatte.
              pflichtAussetzen: true,
            },
          ],
        });
        if (ergebnis && ergebnis.ok === true) return;
        if (nameBelegt(ergebnis)) {
          const belegt = new Error('EEXIST');
          belegt.code = 'EEXIST';
          throw belegt;
        }
        letzte = ergebnis;
        throw new Error(KARTEI_FEHLER);
      },
      abweisung: () => (letzte === null ? null : abgewiesen(letzte)),
    };
  }

  return { karteikarteVon, loescheKarteikarte, kopierHandlung };
}

module.exports = { KARTEI_FEHLER, erzeugeKarteiWeichen };
