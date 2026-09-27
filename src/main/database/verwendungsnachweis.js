// 4T-001945 (Epic 3E-000257, Bauplan B1; T7, T13, E5.4, E22.3): Der
// Verwendungsnachweis — wer eine Tabelle oder einen Datensatz benutzt.
//
// **Zwei Auskünfte, weil es zwei Fragen sind.** Die Tabellen-Ebene sagt, welche
// Tabellen mit welchen Verweis-Spalten auf eine Tabelle zeigen und welche
// Masken-Dateien sie darstellen; sie ist die Voraussetzung der Schema-Evolution
// (T7). Die Datensatz-Ebene sagt, welche Datensätze auf EINEN Datensatz zeigen;
// sie ist die Vorschau des Lösch-Schutzes (E22.3).
//
// **Dieselbe Suche wie der Lösch-Schutz, nicht eine zweite.** Beide Ebenen rufen
// `abhaengigeTabellen` und `abhaengigeDatensaetze` aus
// `record-regel-loeschschutz.js`, mit einem Lauf der Regel-Hilfen ohne Schritte
// (Muster `konsistenz-pruefung.js`). Vorschau und Verweigerung geben damit auf
// dieselbe Frage dieselbe Menge, einschließlich des Verweises über einen
// einteiligen Schlüssel-Wert, der Kurzform der Kennung, der Folge-Segmente und
// des Selbstbezugs. Wie im Lösch-Schutz zählt allein die Verweis-Spalte; ein
// Prosa-Verweis in einer Text-Spalte oder in einem Dokument ist keine Verwendung.
//
// **Der Datensatz selbst zählt nicht als sein eigener Verwender.** Der
// Lösch-Schutz lässt einen Datensatz, der auf sich selbst zeigt, löschen, weil
// der Auftrag ihn selbst löscht; die Vorschau nennt ihn deshalb ebenfalls nicht.
//
// **Die Menge aus dem Index, die Wahrheit aus der Datei.** Welche Tabellen und
// Masken-Dateien es gibt, sagt die Sicht (Marken `table` und `form`); welche
// davon verweisen, sagen ihre frisch gelesenen Definitionen und Datensätze. Ein
// Rückwärts-Index der Verweise ist ausgeschlossen, aus demselben Grund wie im
// Lösch-Schutz. Gelesen wird auf Anforderung, nie beim Öffnen einer Ansicht.
//
// **Nichts wird geschrieben.** Das Modul ruft allein `readFile` des
// hereingereichten Dateizugriffs. Electron-frei; Dateizugriff und Sicht kommen
// herein wie bei den Nachbarn.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseFormDefinition } = require('../../shared/database/table-definition.js');
const { kennungFuer, nummerAus } = require('../../shared/database/record-identity.js');
const { zellTexte } = require('../../shared/database/record-write.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { dateiFuerKennung } = require('./record-auftrag-bestand.js');
const { findeKopfDatei, neuerLauf, bestandFuer } = require('./record-regel-hilfen.js');
const { abhaengigeTabellen, abhaengigeDatensaetze } = require('./record-regel-loeschschutz.js');
const { findeZielTabelle } = require('./datensatz-liste.js');
const { markierteDateien, tabellenName } = require('./table-catalog.js');

function fehler(code, angaben = {}) {
  return { status: 'error', code, ...angaben };
}

function pflichtFsp(fsp, name) {
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError(`${name}: fsp ist Pflicht und muss readFile tragen`);
}

// Der Lauf der Regel-Hilfen ohne Schritte und ohne Bestände eines Auftrags:
// Jede Tabelle wird einmal frisch mit allen Segmenten gelesen.
function laufOhneSchritte(fsp, wurzel, sicht) {
  return neuerLauf({
    bereichsWurzel: wurzel,
    schritte: [],
    bestaende: new Map(),
    tabellenSicht: () => ({ status: 'ready', sicht }),
    fsp,
  });
}

// Die abhängigen Tabellen EINER Ziel-Tabelle, nach Pfad sortiert.
async function abhaengigeVon(lauf, sicht, kopf) {
  const schluessel = pathCompareKey(kopf);
  const karte = await abhaengigeTabellen(lauf, sicht, new Set([schluessel]));
  return karte.get(schluessel) || [];
}

// Die Masken-Dateien der Sicht, die diese Tabelle darstellen: Angabe `table`
// ihres Behälters, aufgelöst über denselben Vergleich wie die Kopf-Datei. Eine
// nicht lesbare Datei oder eine ohne brauchbaren Behälter wird übergangen; sie
// meldet die Übersicht als Fehlerlage.
async function maskenDer(fsp, sicht, kopf) {
  const schluessel = pathCompareKey(kopf);
  const masken = [];
  for (const pfad of markierteDateien(sicht).masken) {
    let roh;
    try {
      roh = String(await fsp.readFile(pfad, 'utf8'));
    } catch {
      continue;
    }
    const fm = extractFrontmatter(roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh);
    const form = parseFormDefinition(fm.data);
    if (!form.istMaske) continue;
    const ziel = findeKopfDatei(sicht, form.table);
    if (ziel !== null && pathCompareKey(ziel) === schluessel) masken.push({ pfad });
  }
  return masken;
}

/**
 * Die Tabellen und Masken-Dateien, die eine Tabelle benutzen.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Die bereite Tabellen-Sicht des Bereichs-Index.
 * @param {string} p.tabelle Name oder Pfad der Tabelle.
 * @returns {Promise<object>} `{status: 'ready', tabelle, pfad, tabellen: Array<{name,
 *   pfad, felder}>, masken: Array<{pfad}>}`; beides leer heißt «nicht verwendet».
 *   Ohne Sicht `status: 'unavailable'`, bei unbekannter Tabelle `{status: 'error',
 *   code}` mit einem Code aus `LAGEN`.
 */
async function verwendungDerTabelle({ fsp, wurzel, sicht, tabelle }) {
  pflichtFsp(fsp, 'verwendungDerTabelle');
  if (!sicht || typeof wurzel !== 'string' || wurzel === '')
    return { status: 'unavailable', tabelle: null, tabellen: [], masken: [] };
  try {
    const kopf = findeZielTabelle({ wurzel, sicht, tabelle });
    if (kopf === null) return fehler(LAGEN.tabelleUnbekannt);
    const lauf = laufOhneSchritte(fsp, wurzel, sicht);
    const tabellen = (await abhaengigeVon(lauf, sicht, kopf)).map(({ kopf: pfad, felder }) => ({
      name: tabellenName(pfad),
      pfad,
      felder: [...felder],
    }));
    return {
      status: 'ready',
      tabelle: tabellenName(kopf),
      pfad: kopf,
      tabellen,
      masken: await maskenDer(fsp, sicht, kopf),
    };
  } catch {
    // Ein Bruch, den keine benannte Lage beschreibt, bekommt deren eigenen Code,
    // statt über die Prozess-Grenze geworfen zu werden.
    return fehler(LAGEN.unerwartet);
  }
}

// Kennung und, bei einteiligem Schlüssel, Schlüssel-Wert des Datensatzes in der
// Gestalt, die `abhaengigeDatensaetze` erwartet. Der Wert wird wie im
// Lösch-Schutz ungetrimmt verglichen; Leerraum allein ist kein Schlüssel-Wert.
function zielDatensatz(eigene, record, id) {
  const ziel = { kennung: id, schluesselWert: null };
  if (eigene.key === null || eigene.key.length !== 1) return ziel;
  const eintrag = eigene.bestand.karte.get(eigene.key[0].toLowerCase());
  if (!eintrag) return ziel;
  const text = zellTexte(record)[eintrag.index];
  if (typeof text === 'string' && text.trim() !== '') ziel.schluesselWert = text;
  return ziel;
}

// Die Einträge einer abhängigen Tabelle: ein Eintrag je verweisendem Datensatz
// und Verweis-Feld, in Datei-Reihenfolge und darin in Definitions-Reihenfolge
// der Felder. Die Menge der Datensätze ist genau die des Lösch-Schutzes; die
// Zuordnung zum Feld kommt aus derselben Funktion, je Feld gerufen.
function eintraegeDer(tabelle, pfad, felder, ziel, selbst) {
  const alle = abhaengigeDatensaetze(tabelle, felder, ziel);
  const jeFeld = felder.map((feld) => [
    feld,
    new Set(abhaengigeDatensaetze(tabelle, [feld], ziel).kennungen),
  ]);
  const eintraege = [];
  alle.kennungen.forEach((id, n) => {
    if (selbst && id === ziel.kennung) return;
    const anzeige = String(alle.anzeigen[n] || '').trim();
    for (const [feld, treffer] of jeFeld) {
      if (!treffer.has(id)) continue;
      eintraege.push({
        tabelle: tabelle.name,
        pfad,
        feld,
        kennung: kennungFuer(nummerAus(id)) || id,
        anzeige: anzeige === '' ? null : anzeige,
      });
    }
  });
  return eintraege;
}

/**
 * Die Datensätze, die auf einen Datensatz verweisen.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Die bereite Tabellen-Sicht des Bereichs-Index.
 * @param {string} p.tabelle Name oder Pfad der Tabelle des Datensatzes.
 * @param {string} p.kennung Interne Kennung, aufgefüllt oder in Kurzform.
 * @returns {Promise<object>} `{status: 'ready', tabelle, pfad, kennung, datensaetze:
 *   Array<{tabelle, pfad, feld, kennung, anzeige}>}`; `anzeige` ist die reine
 *   Anzeige-Form oder null. Ohne Sicht `status: 'unavailable'`, sonst bei
 *   unbekannter Tabelle, unbekanntem Datensatz oder nicht lesbarer verweisender
 *   Tabelle `{status: 'error', code}` mit einem Code aus `LAGEN`.
 */
async function verwendungDesDatensatzes({ fsp, wurzel, sicht, tabelle, kennung }) {
  pflichtFsp(fsp, 'verwendungDesDatensatzes');
  if (!sicht || typeof wurzel !== 'string' || wurzel === '')
    return { status: 'unavailable', tabelle: null, kennung: null, datensaetze: [] };
  try {
    const kopf = findeZielTabelle({ wurzel, sicht, tabelle });
    if (kopf === null) return fehler(LAGEN.tabelleUnbekannt);
    const id = kennungFuer(nummerAus(kennung));
    if (id === null) return fehler(LAGEN.datensatzUnbekannt);
    const lauf = laufOhneSchritte(fsp, wurzel, sicht);
    const eigene = await bestandFuer(lauf, kopf);
    if (!eigene.ok) return fehler(LAGEN.lesenFehlgeschlagen, { zieltabelle: tabellenName(kopf) });
    const fundort = dateiFuerKennung(eigene.bestand, id);
    if (!fundort.ok) return fehler(fundort.code);
    const datei = eigene.bestand.dateien.find((d) => d.pfad === fundort.pfad);
    const ziel = zielDatensatz(eigene, datei.records.get(id), id);

    const datensaetze = [];
    for (const { kopf: pfad, felder } of await abhaengigeVon(lauf, sicht, kopf)) {
      const abhaengige = await bestandFuer(lauf, pfad);
      // Die Tabelle zeigt nachweislich auf das Ziel, ihre Datensätze lassen sich
      // aber nicht lesen: Die Auskunft wäre unvollständig und sagt das.
      if (!abhaengige.ok)
        return fehler(LAGEN.lesenFehlgeschlagen, { zieltabelle: tabellenName(pfad) });
      const selbst = pathCompareKey(pfad) === pathCompareKey(kopf);
      datensaetze.push(...eintraegeDer(abhaengige, pfad, felder, ziel, selbst));
    }
    return { status: 'ready', tabelle: tabellenName(kopf), pfad: kopf, kennung: id, datensaetze };
  } catch {
    return fehler(LAGEN.unerwartet);
  }
}

module.exports = { verwendungDerTabelle, verwendungDesDatensatzes };
