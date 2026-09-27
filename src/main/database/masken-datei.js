// 4T-001943 (Epic 3E-000257, Bauplan B1; E7.2, E7.3): Die erzeugte Maske einer
// Tabelle als Datei herausschreiben.
//
// **Die Datei ist die Übersteuerung, nicht der Regelfall** (E7.2). Die
// Anwendung erzeugt die Maske jeder Tabelle aus ihrer Definition; wer sie
// gestalten will, schreibt sie heraus und ändert dann die Datei, statt mit
// einem leeren Blatt zu beginnen. Geschrieben wird deshalb genau der Körper,
// den `erzeugeMaskenKoerper` für die Anzeige liefert: Herausschreiben ändert
// an der Maske nichts, bis jemand die Datei ändert.
//
// **Ort und Name.** Die Datei liegt neben der Kopf-Datei der Tabelle und heißt
// wie sie mit dem Zusatz « Form», also `<Tabellen-Datei ohne Endung> Form.md`.
// Sie ist ein gewöhnliches Markdown-Dokument des Bereichs mit dem
// sprachneutralen Behälter `db-form` (`behaelter.js`), der ihre Tabelle beim
// Namen nennt; der Katalog findet sie über die Marke `form` des Index.
//
// **Nie überschreiben.** Angelegt wird exklusiv (`flag: 'wx'`): Liegt am Ziel
// schon eine Datei, ist sie womöglich eine gestaltete Maske, und ein zweiter
// Klick auf den Handgriff darf sie nicht durch die erzeugte Fassung ersetzen.
// Das Anlegen ist damit selbst die Prüfung und kein Vorab-Blick mit Lücke bis
// zum Schreiben; der Aufrufer-Wächter der Schreibwege
// (`test/unit/atomares-schreiben-aufrufer.test.js`) zählt die Stelle.
//
// **Nicht hier:** die Prüfung der Anfrage gegen die Bereichs-Grenze und das Tor
// der Erweiterung, die der Kanal `database:maskeSchreiben` vor dem Aufruf
// leistet. Electron-frei; der Dateizugriff kommt herein.
'use strict';

const path = require('node:path');
const yaml = require('js-yaml');

const { DB_FORM_KEY } = require('../../shared/database/behaelter.js');
const { erzeugeMaskenKoerper } = require('../../shared/database/form-body.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { loeseTabelle, leseDefinition } = require('./record-auftrag-bestand.js');
const { tabellenName } = require('./table-catalog.js');

// Der Code einer vorhandenen Datei am Ziel. Sprachneutral wie die Lagen der
// Schreib-Schnittstelle; den Satz bildet der Bedienort.
const FORM_DATEI_VORHANDEN = 'formDateiVorhanden';

// Der Zusatz des Dateinamens hinter dem Namen der Tabelle.
const NAMENS_ZUSATZ = ' Form';

function fehler(code, pfad) {
  return pfad ? { status: 'error', code, pfad } : { status: 'error', code };
}

/**
 * Der Pfad der Masken-Datei einer Tabelle: neben der Kopf-Datei, mit dem
 * Zusatz « Form» vor der Endung.
 *
 * @param {string} tabellenPfad Absoluter Pfad der Kopf-Datei.
 * @returns {string} Absoluter Pfad der Masken-Datei.
 */
function maskenPfad(tabellenPfad) {
  return path.join(path.dirname(tabellenPfad), `${tabellenName(tabellenPfad)}${NAMENS_ZUSATZ}.md`);
}

/**
 * Der vollständige Text der Masken-Datei: Frontmatter mit Titel und Behälter,
 * danach der erzeugte Körper.
 *
 * Das Frontmatter schreibt `js-yaml` mit demselben Schema, mit dem der Index es
 * wieder liest; ein Tabellen-Name, der wie eine Zahl oder ein Wahrheitswert
 * aussieht, wird so in Anführung gesetzt und bleibt ein Name.
 *
 * @param {string} name Der Name der Tabelle.
 * @param {string} koerper Der erzeugte Körper.
 * @returns {string}
 */
function maskenText(name, koerper) {
  const kopf = yaml.dump(
    { title: `${name}${NAMENS_ZUSATZ}`, [DB_FORM_KEY]: { table: name } },
    { schema: yaml.JSON_SCHEMA, lineWidth: -1 },
  );
  return `---\n${kopf}---\n\n${koerper}`;
}

/**
 * Schreibt die erzeugte Maske einer Tabelle als Datei neben die Tabelle.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`, `writeFile`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {string} p.tabelle Pfad der Kopf-Datei, relativ zur Bereichs-Wurzel
 *   oder absolut.
 * @param {string|null} [p.sprache] Aktive Sprache des Anwenders.
 * @param {string|null} [p.rueckfallSprache] Wirksame Rückfall-Sprache der Datenbank.
 * @returns {Promise<object>} `{status: 'ready', pfad}` bzw.
 *   `{status: 'error', code, pfad?}`; `code` ist `formDateiVorhanden` (mit dem
 *   Pfad der vorhandenen Datei) oder ein Code aus `LAGEN`.
 */
async function schreibeMaskenDatei({
  fsp,
  wurzel,
  tabelle,
  sprache = null,
  rueckfallSprache = null,
}) {
  if (!fsp || typeof fsp.readFile !== 'function' || typeof fsp.writeFile !== 'function')
    throw new TypeError(
      'schreibeMaskenDatei: fsp ist Pflicht und muss readFile und writeFile tragen',
    );
  if (typeof wurzel !== 'string' || wurzel === '') return fehler(LAGEN.wurzelFehlt);
  try {
    const aufgeloest = loeseTabelle(wurzel, tabelle);
    if (!aufgeloest.ok) return fehler(aufgeloest.lage.code);
    const gelesen = await leseDefinition(fsp, aufgeloest.pfad, tabelle);
    if (!gelesen.ok) return fehler(gelesen.lage.code);

    const name = tabellenName(aufgeloest.pfad);
    const koerper = erzeugeMaskenKoerper(gelesen.definition, {
      tabellenName: name,
      sprache,
      rueckfallSprache,
    });
    const ziel = maskenPfad(aufgeloest.pfad);
    try {
      await fsp.writeFile(ziel, maskenText(name, koerper), { encoding: 'utf8', flag: 'wx' });
    } catch (err) {
      if (err && err.code === 'EEXIST') return fehler(FORM_DATEI_VORHANDEN, ziel);
      throw err;
    }
    return { status: 'ready', pfad: ziel };
  } catch {
    // Ein Bruch, den keine benannte Lage beschreibt, bekommt deren eigenen
    // Code, statt über die Prozess-Grenze geworfen zu werden.
    return fehler(LAGEN.unerwartet);
  }
}

module.exports = { FORM_DATEI_VORHANDEN, maskenPfad, maskenText, schreibeMaskenDatei };
