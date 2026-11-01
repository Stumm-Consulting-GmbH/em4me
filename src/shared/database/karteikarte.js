// 4T-002387 (Epic 3E-000265, Schritt 1, Entscheidung F3 A): Die Erkennung einer
// Karteikarte und ihre Kennung.
//
// **Die Regel.** Ein Dokument ist eine Karteikarte einer Kartei-Tabelle, wenn
// alle drei gelten:
//
//   1. Es liegt im **selben Ordner** wie die Tabellen-Datei, nicht in einem
//      Unterordner.
//   2. Es ist **keine** andere Datenbank-Datei (Marken `table`, `database`,
//      `form`, `query` nach `datenbankMarken`) und **keine** Vorlage.
//   3. Sein Dateikopf trägt `db-record` mit einer Kennung in der Schreibweise
//      der Tabellen-Form (`db-record: r-00042`).
//
// Erfüllt ein Dokument 1 und 2, aber nicht 3, ist es ein **Dokument ohne
// Kennung**: kein Datensatz, aber ein Befund der Konsistenz-Prüfung.
//
// **Warum der Ordner und nicht der Name der Tabelle.** Die Zugehörigkeit steht
// so an genau einem Ort (Invariante I1 der Ablage-Regel), und das Umbenennen
// der Tabellen-Datei bleibt folgenlos: Die Karteikarten nennen ihre Tabelle
// nirgends.
//
// **Ein Folgeteil ist kein eigenes Dokument.** Die Teil-Dateien eines geteilten
// Dokuments (`Name•part-00002`, `document-parts.js`) führt die Anwendung als
// das eine Dokument ihrer Kopf-Datei; nur diese trägt den Dateikopf mit der
// Kennung. Ohne den Ausschluss meldete die Prüfung jeden Folgeteil als Dokument
// ohne Kennung.
//
// **Die Vorlage kommt als Prädikat herein.** Ob ein Pfad im Vorlagen-Ordner
// liegt, entscheidet der Haupt-Prozess mit dem Vorlagen-Ausschluss der Abfrage
// (`createTemplateExclusion` in `src/main/index/query-templates.js`), weil nur
// er den wirksamen Ordner kennt und Pfade mit dem Pfad-Modul vergleicht.
//
// **Der Ordner-Vergleich ohne Pfad-Modul.** Prozess-neutrale Module laden kein
// `node:path`. Verglichen wird deshalb der Text bis zum letzten Trenner, beide
// Trenner gleich behandelt, NFC-normalisiert wie die Datei-Schlüssel des Index
// und in der Schreibung des Dateisystems (`pathCompareKey`). Beide Pfade
// stammen aus derselben Quelle, dem Index, und sind absolut.
//
// Prozess-neutral (kein Electron, kein DOM, kein Dateizugriff).
'use strict';

const { DB_RECORD_KEY, datenbankMarken } = require('./behaelter.js');
const { nummerAus, kennungFuer } = require('./record-identity.js');
const { baueHinweis } = require('./table-hinweise.js');
const { isPartBasename } = require('../document-parts.js');
const { pathCompareKey } = require('../platform.js');
const { zellWert } = require('./record-values.js');
const { DB_DEFAULT_COLUMN_TYPE, MULTI_VALUE_TYPE } = require('./table-columns.js');

// 4T-002387 (Schnitt C): Der geschriebene Wert «ja» einer Wahrheitswert-Zelle
// (`BOOLEAN_WAHR` in `record-values.js`, kanonisch das kleine `x`) und der
// Trenner der Einträge einer Liste, wie im Index.
const BOOLEAN_JA = 'x';
const LISTEN_TRENNER = ', ';

// Die Marken der Datenbank-Dateien, die nie Karteikarten sind (Bedingung 2).
const FREMDE_MARKEN = Object.freeze(['table', 'database', 'form', 'query']);

// Was ein Dokument im Verhältnis zu einer Kartei-Tabelle ist.
const KARTEIKARTEN_ARTEN = Object.freeze({
  karteikarte: 'karteikarte',
  ohneKennung: 'ohneKennung',
  keine: 'keine',
});

/**
 * Die Kennung aus der Angabe `db-record` eines Dateikopfs.
 *
 * Gelesen wird mit derselben Funktion wie die Kennung am Datensatz-Marker der
 * Tabellen-Form (`nummerAus`), geliefert in der aufgefüllten Schreibweise
 * (`r-42` ergibt `r-00042`), wie der nächste Schreibvorgang sie schreibt.
 *
 * @param {object|null} frontmatter Der ausgelegte Dateikopf (`extractFrontmatter(...).data`).
 * @returns {{kennung: string|null, hinweis: object|null}} Ohne Angabe beides
 *   null; bei einer unbrauchbaren Angabe die Kennung null und der Hinweis
 *   `cardId` aus dem Katalog der Tabellen-Hinweise.
 */
function karteikartenKennung(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter))
    return { kennung: null, hinweis: null };
  const roh = frontmatter[DB_RECORD_KEY];
  if (roh === undefined) return { kennung: null, hinweis: null };
  const nummer = nummerAus(roh);
  if (nummer === null) {
    const geschrieben = typeof roh === 'string' || typeof roh === 'number' ? String(roh) : null;
    return { kennung: null, hinweis: baueHinweis('cardId', -1, geschrieben) };
  }
  return { kennung: kennungFuer(nummer), hinweis: null };
}

// Der Ordner eines Pfades als Vergleichs-Schlüssel, und der Datei-Name ohne
// Endung. Ein Pfad ohne Trenner liegt im leeren Ordner.
function zerlege(pfad) {
  const text = String(pfad).normalize('NFC').replace(/\\/g, '/');
  const stelle = text.lastIndexOf('/');
  const name = text.slice(stelle + 1);
  const punkt = name.lastIndexOf('.');
  return {
    ordner: pathCompareKey(stelle < 0 ? '' : text.slice(0, stelle)),
    datei: pathCompareKey(text),
    nameOhneEndung: punkt > 0 ? name.slice(0, punkt) : name,
  };
}

/**
 * Liegen beide Pfade im selben Ordner (Bedingung 1)? Ein Unterordner zählt
 * nicht. Ohne Datei-Zugriff, deshalb auch als Vorfilter vor dem Lesen.
 *
 * @param {string} pfad Pfad des Dokuments.
 * @param {string} tabellenPfad Pfad der Tabellen-Datei.
 * @returns {boolean}
 */
function imOrdnerDerTabelle(pfad, tabellenPfad) {
  const dokument = zerlege(pfad);
  const tabelle = zerlege(tabellenPfad);
  return dokument.ordner === tabelle.ordner && dokument.datei !== tabelle.datei;
}

/**
 * Was ist ein Dokument im Verhältnis zu einer Kartei-Tabelle?
 *
 * Ob die Tabelle in Kartei-Form ablegt (`istKarteiForm`) und ob ihr Ordner
 * eindeutig ist, prüft der Aufrufer; diese Funktion prüft die drei
 * Bedingungen am Dokument.
 *
 * @param {object} p Parameter.
 * @param {string} p.pfad Absoluter Pfad des Dokuments.
 * @param {object|null} p.frontmatter Sein ausgelegter Dateikopf.
 * @param {string} p.tabellenPfad Absoluter Pfad der Tabellen-Datei.
 * @param {((pfad: string) => boolean)|null} [p.istVorlage] Liegt der Pfad im
 *   Vorlagen-Ordner? `null`, wenn es keinen gibt (keiner gewählt oder die
 *   Erweiterung «Vorlagen» aus).
 * @returns {{art: string, kennung: string|null, hinweis: object|null}} `art`
 *   aus `KARTEIKARTEN_ARTEN`; `kennung` nur bei einer Karteikarte, `hinweis`
 *   nur bei einem Dokument mit unbrauchbarer Kennung.
 */
function karteikartenArt({ pfad, frontmatter, tabellenPfad, istVorlage = null }) {
  const keine = { art: KARTEIKARTEN_ARTEN.keine, kennung: null, hinweis: null };
  if (!imOrdnerDerTabelle(pfad, tabellenPfad)) return keine;
  if (isPartBasename(zerlege(pfad).nameOhneEndung)) return keine;
  if (istVorlage !== null && istVorlage(pfad)) return keine;
  const marken = datenbankMarken(frontmatter);
  if (marken.some((marke) => FREMDE_MARKEN.includes(marke))) return keine;
  const { kennung, hinweis } = karteikartenKennung(frontmatter);
  if (kennung === null) return { art: KARTEIKARTEN_ARTEN.ohneKennung, kennung: null, hinweis };
  return { art: KARTEIKARTEN_ARTEN.karteikarte, kennung, hinweis: null };
}

/**
 * Ist das Dokument eine Karteikarte der Tabelle? Kurzform von `karteikartenArt`.
 *
 * @param {object} p Wie bei `karteikartenArt`.
 * @returns {boolean}
 */
function istKarteikarteVon(p) {
  return karteikartenArt(p).art === KARTEIKARTEN_ARTEN.karteikarte;
}

// --- Die Werte einer Karteikarte (Schnitt C, Entscheidung S1) ----------------------------
//
// **Eine Auslegung, nicht zwei.** Ein Wert im Dateikopf einer Karteikarte wird
// nach dem Typ seiner Spalte ausgelegt, mit derselben Funktion wie eine Zelle
// der Tabellen-Form (`zellWert` in `record-values.js`). Dazu wird der Wert
// zuerst in die Schreibweise einer Zelle gebracht; danach gilt für beide
// Ablage-Arten dieselbe Regel, und Maske, Abfrage und Schreibweg sehen
// denselben Wert.
//
// **Die Schreibweise einer Zelle aus dem Dateikopf.** Der Dateikopf wird mit
// dem JSON-Schema gelesen (`frontmatter.js`); er liefert Text, Zahl,
// Wahrheitswert, Liste, Objekt oder null, ein Datum bleibt Text. Eine Zahl gilt
// wie ihr Text (`42` wie die Zelle `42`). Ein Wahrheitswert einer
// Wahrheitswert-Spalte gilt wie die Zelle, die ihn schreibt (`x` für ja, leer
// für nein); an einer Spalte anderen Typs gilt er wie sein Text. Eine Liste
// wird zu einem Text mit Komma und Leerzeichen zwischen den Einträgen, wie im
// Index (`karteikarten-erfassung.js` aus Schnitt B), weil die Tabelle keine
// mehrwertige Spalte kennt (`MULTI_VALUE_TYPE` in `table-columns.js` ist
// ausgeschlossen); ihre Einträge werden wie Einzelwerte behandelt, ein
// verschachtelter Eintrag entfällt. Ein Objekt und null ergeben den leeren
// Text: Eine Zelle kann kein Objekt tragen.
//
// **Feld-Namen ohne Rücksicht auf die Schreibung**, mit derselben Regel wie
// die Feld-Liste der Definition (`toLowerCase`, `parseDefinitionsListe` in
// `table-definition.js`). Tragen zwei Angaben denselben Namen in anderer
// Schreibung, gilt die spätere, wie im Index (`extractProperties` in
// `parse.js`). **Werte zeichengenau:** Ein Text-Typ behält Leerraum, wie
// `zellWert` es hält; ein Schlüssel wird deshalb nie beschnitten.
//
// **Verweis-Felder** (`link`, `record`) tragen hier ihren Verweis-Text; die
// Auflösung des Ziels gehört zu Abfrage und Verweis (4T-002388).

// Ein Einzelwert des Dateikopfs als Text einer Zelle; null für einen Wert, den
// eine Zelle nicht tragen kann.
function einzelText(type, roh) {
  if (typeof roh === 'string') return roh;
  if (typeof roh === 'number') return Number.isFinite(roh) ? String(roh) : null;
  if (typeof roh === 'boolean') {
    if (type !== 'boolean') return String(roh);
    return roh ? BOOLEAN_JA : '';
  }
  return null;
}

/**
 * Ein Wert des Dateikopfs in der Schreibweise einer Zelle seiner Spalte.
 *
 * @param {string} type Typ der Spalte.
 * @param {*} roh Wert aus dem ausgelegten Dateikopf.
 * @returns {string} Der leere Text für fehlende, leere und nicht darstellbare Werte.
 */
function zellTextAusDateikopf(type, roh) {
  if (Array.isArray(roh)) {
    return roh
      .map((eintrag) => einzelText(type, eintrag))
      .filter((text) => text !== null)
      .join(LISTEN_TRENNER);
  }
  const text = einzelText(type, roh);
  return text === null ? '' : text;
}

/**
 * Die Werte einer Karteikarte, in derselben Form wie die Zellen eines
 * Datensatzes der Tabellen-Form (`zellenNachFeldern` in `record-block.js`).
 *
 * @param {object|null} frontmatter Der ausgelegte Dateikopf; auch die Werte des
 *   Index (`propertiesPerFile`, klein geschriebene Schlüssel) sind zulässig.
 * @param {object|null} definition Die Tabellen-Definition (`fields`).
 * @returns {Array<{name: string, text: string, value: *, error: string|null,
 *   fehlt: boolean}>} Je Feld der Definition ein Eintrag in ihrer Reihenfolge;
 *   `fehlt` ist wahr, wenn der Dateikopf das Feld nicht nennt.
 */
function karteikartenWerte(frontmatter, definition) {
  const felder = definition && Array.isArray(definition.fields) ? definition.fields : [];
  const angaben = new Map();
  if (frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter)) {
    for (const schluessel of Object.keys(frontmatter))
      angaben.set(schluessel.toLowerCase(), frontmatter[schluessel]);
  }
  return felder.map((feld) => {
    const name = String((feld && feld.name) || '');
    const type = (feld && feld.type) || DB_DEFAULT_COLUMN_TYPE;
    const fehlt = !angaben.has(name.toLowerCase());
    const text = fehlt ? '' : zellTextAusDateikopf(type, angaben.get(name.toLowerCase()));
    const { value, error } = zellWert(type, text);
    return { name, text, value, error, fehlt };
  });
}

/**
 * Der Text eines Feldes aus den Werten einer Karteikarte; der leere Text für
 * ein Feld, das die Definition nicht kennt, wie für eine fehlende Zelle.
 *
 * @param {Array<{name: string, text: string}>} werte Ergebnis von `karteikartenWerte`.
 * @param {string} feldName Feld-Name, ohne Rücksicht auf die Schreibung.
 * @returns {string}
 */
function feldTextVon(werte, feldName) {
  const gesucht = String(feldName || '').toLowerCase();
  const treffer = gesucht === '' ? null : werte.find((w) => w.name.toLowerCase() === gesucht);
  return treffer ? treffer.text : '';
}

// --- Abweichender Typ eines Profil-Feldes (Schnitt C, Entscheidung F5 A) ------------------
//
// In der Datenbank-Sicht gewinnt die Tabellen-Definition: Die Werte einer
// Karteikarte werden allein nach ihr gelesen (`karteikartenWerte`). Führt ein
// Eigenschafts-Profil, das für das Dokument gilt, ein gleichnamiges Feld mit
// einem anderen Typ, zeigt der Editor das Feld nach dem Profil und die
// Datenbank nach der Tabelle; das meldet die Konsistenz-Prüfung als Hinweis.
//
// **Die Abbildung der Typ-Bezeichner.** Profile und Spalten teilen ein
// Definitions-Format (E19) und damit die Bezeichner der sieben gemeinsamen
// Typen; gleichbedeutende Bezeichner unter verschiedenen Namen gibt es nicht.
// Die übrigen Profil-Typen haben keine Spalte (`multistring` ist die
// ausgeschlossene mehrwertige Spalte, `formula` und `lookup` berechnete Felder,
// `object` und `objectlist` strukturierte Werte), `record` hat kein Profil-Feld.
// Ein Profil-Feld mit `multiple` trägt eine Liste und weicht damit von jeder
// Spalte ab, auch bei gleichem Typ-Namen.
const PROFIL_TYP_ZU_SPALTEN_TYP = Object.freeze({
  string: 'string',
  multiline: 'multiline',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  time: 'time',
  link: 'link',
});

// Der Typ eines Profil-Feldes, wie die Meldung ihn nennt.
function profilTypText(def) {
  const type = (def && def.type) || DB_DEFAULT_COLUMN_TYPE;
  return def && def.multiple === true && type !== MULTI_VALUE_TYPE ? `${type} (multiple)` : type;
}

/**
 * Die Profil-Felder, die ein Feld der Tabelle mit einem anderen Typ führen.
 *
 * @param {object|null} definition Die Tabellen-Definition (`fields`).
 * @param {Array<object>} profilFelder Ergebnis `fields` von `resolveProfileFields`
 *   (je Feld `name`, `type`, `multiple`, `profile`).
 * @returns {Array<{feld: string, profil: string, typTabelle: string, typProfil: string}>}
 *   In der Reihenfolge der Profil-Felder; `feld` in der Schreibung der Tabelle.
 *   Ein gleichnamiges Feld gleichen Typs fehlt.
 */
function profilTypAbweichungen(definition, profilFelder) {
  const felder = definition && Array.isArray(definition.fields) ? definition.fields : [];
  const abweichungen = [];
  for (const def of Array.isArray(profilFelder) ? profilFelder : []) {
    if (!def || typeof def.name !== 'string') continue;
    const gesucht = def.name.toLowerCase();
    const spalte = felder.find((f) => String((f && f.name) || '').toLowerCase() === gesucht);
    if (!spalte) continue;
    const typTabelle = spalte.type || DB_DEFAULT_COLUMN_TYPE;
    const typ = def.type || DB_DEFAULT_COLUMN_TYPE;
    const gleich = def.multiple !== true && PROFIL_TYP_ZU_SPALTEN_TYP[typ] === typTabelle;
    if (gleich) continue;
    abweichungen.push({
      feld: spalte.name,
      profil: String(def.profile || ''),
      typTabelle,
      typProfil: profilTypText(def),
    });
  }
  return abweichungen;
}

module.exports = {
  // 4T-002387 (Schnitt B): Die Erfassung im Index prüft Bedingung 2 an den
  // bereits erfassten Marken und braucht dafür dieselbe Liste.
  FREMDE_MARKEN,
  // 4T-002387 (Schnitt C): Werte einer Karteikarte und Kollisions-Regel.
  PROFIL_TYP_ZU_SPALTEN_TYP,
  zellTextAusDateikopf,
  karteikartenWerte,
  feldTextVon,
  profilTypAbweichungen,
  KARTEIKARTEN_ARTEN,
  karteikartenKennung,
  imOrdnerDerTabelle,
  karteikartenArt,
  istKarteikarteVon,
};
