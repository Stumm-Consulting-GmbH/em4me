// 4T-002248 (Epic 3E-000262, F1 A, S1): Die Angaben der Listen-Maske im
// Behälter der Abfrage-Datei, ausgelegt samt Hinweisen.
//
// **Die Listen-Maske ist keine eigene Datei-Art** (E7.1), sondern eine
// Abfrage-Datei mit drei Angaben (E7.4): `editable: true` macht ihre Treffer
// bearbeitbar, `form` nennt die Einzel-Maske, die ein Klick auf eine Zeile
// öffnet, `allow` zählt die erlaubten Handgriffe einzeln auf. Entscheidung des
// Product Owners vom 2026-10-11 (F1 Option A): drei Schlüssel im Behälter
// `db-query`, englisch wie alle übrigen Behälter-Angaben. Der Behälter trägt
// ausdrücklich kein `table`, weil die Abfrage ihre Tabelle über `FROM` nennt.
//
// **Eigenes Modul statt einer Erweiterung der Definitions-Seite.** Die
// Definitions-Seite (`table-definition.js`) zieht die Profil-Maschinerie nach
// sich, und weder der Katalog der Abfrage-Dateien noch später die Listen-Ansicht
// im Anzeige-Prozess brauchen davon etwas. Geladen werden allein die Blätter:
// der Schlüssel des Behälters, der Hinweis-Katalog und die beiden Form-Helfer
// des Beschriftungs-Moduls, die die Definitions-Seite selbst von dort bezieht.
//
// **Weich nach E22:** Eine unbrauchbare Angabe entfällt mit Hinweis und hat
// eine benannte Folge; die Datei bleibt in jedem Fall eine lesbare
// Abfrage-Datei. Kein Wurf, keine stille Teil-Auslegung.
//
// **Das Wort `editable` hat zwei Bedeutungen** (F1 A, erklärt statt
// vermieden): Im Behälter der Tabelle ist es eine Bedingung je Datensatz, hier
// ein Ja oder Nein. Beide Auslegungen bleiben deshalb getrennt; dieses Modul
// kennt die der Tabelle nicht.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { DB_QUERY_KEY } = require('./behaelter.js');
const { baueHinweis } = require('./table-hinweise.js');
const { istEinfachesObjekt, alsText } = require('./beschriftung.js');

// Die Handgriffe tragen dieselben Wörter wie die Anweisungs-Arten der
// Schreib-Schnittstelle (`ART_ANLEGEN`, `ART_AENDERN`, `ART_LOESCHEN` in
// `masken-speichern.js`) und wie die Berechtigung, die sie übernimmt (E12.3).
// Ein eigenes Wort je Ort hieße eine Übersetzung zwischen Datei und
// Schreibweg, die niemand prüft.
const LIST_HANDGRIFFE = Object.freeze(['create', 'update', 'delete']);

// Ohne Angabe gilt allein «ändern» (E7.4): Für den reinen Daten-Pfleger ist
// «ändern, aber nicht löschen» der Normalfall, und wer mehr will, sagt es.
const LIST_STANDARD_HANDGRIFFE = Object.freeze(['update']);

// Die Angaben, die der Behälter kennt. Jede andere wird gemeldet und
// übergangen, auch `table`, das ein Autor aus der Masken-Datei mitbringen mag.
const LIST_ANGABEN = Object.freeze(['editable', 'form', 'allow']);

// Hinweis an einer Angabe, deren Schlüssel der Hinweis selbst nennt: Der
// Katalog kann ihn nicht vorgeben, weil die Angabe gerade unbekannt ist.
function unbekannteAngabe(schluessel) {
  return {
    ...baueHinweis('listAngabeUnbekannt', -1, schluessel, [...LIST_ANGABEN]),
    key: schluessel,
  };
}

// `editable`: allein `true` macht die Datei zur Listen-Maske. Liefert
// `{ wert, defekt }`; ein Wert anderen Typs gilt als `false` und meldet sich.
function legeEditableAus(roh, hints) {
  if (roh === true) return { wert: true, defekt: false };
  if (roh === false || roh === undefined) return { wert: false, defekt: false };
  hints.push(baueHinweis('listEditable', -1, null));
  return { wert: false, defekt: true };
}

// `form`: ein nicht leerer Text, sonst null. Ob es die Masken-Datei gibt,
// weiß erst der Katalog, der alle Masken-Dateien kennt.
function legeFormAus(roh, hints) {
  if (roh === undefined) return null;
  const text = alsText(roh);
  if (text === null) hints.push(baueHinweis('listForm', -1, null));
  return text;
}

// `allow`: eine Liste von Handgriffen, ein einzelner Text als Liste mit einem
// Eintrag. Ein unbekanntes Wort entfällt mit Hinweis, die übrigen bleiben; eine
// Angabe anderen Typs fällt auf den Standard zurück. Eine leere Liste bleibt
// leer: bearbeitbar erklärt, aber ohne Handgriff — die Datei sagt es so.
function legeAllowAus(roh, hints) {
  if (roh === undefined) return [...LIST_STANDARD_HANDGRIFFE];
  const eintraege = typeof roh === 'string' ? [roh] : roh;
  if (!Array.isArray(eintraege)) {
    hints.push(baueHinweis('listAllow', -1, null));
    return [...LIST_STANDARD_HANDGRIFFE];
  }
  const allow = [];
  for (const eintrag of eintraege) {
    const text = typeof eintrag === 'string' ? eintrag.trim() : String(eintrag);
    const wort = text.toLowerCase();
    if (!LIST_HANDGRIFFE.includes(wort)) {
      hints.push(baueHinweis('listAllowUnbekannt', -1, text, [...LIST_HANDGRIFFE]));
      continue;
    }
    if (!allow.includes(wort)) allow.push(wort);
  }
  return allow;
}

/**
 * Legt die Angaben der Listen-Maske im Behälter `db-query` aus.
 *
 * Ohne Behälter, oder mit einem Behälter, der kein Objekt ist (`db-query:` ohne
 * Wert), ist die Datei eine gewöhnliche Abfrage-Datei, und das ohne Hinweis:
 * Die Marke allein ist gültig. Stehen `form` oder `allow` ohne
 * `editable: true` da, entfallen sie mit Hinweis `listOhneEditable`; war
 * `editable` selbst unbrauchbar, sagt das bereits sein eigener Hinweis.
 *
 * @param {object} data Das Frontmatter-Objekt der Datei.
 * @returns {{istListe: boolean, editable: boolean, form: string|null,
 *   allow: string[], hints: Array<object>}} `allow` ist leer, wenn die Datei
 *   keine Listen-Maske ist.
 */
function parseListAngaben(data) {
  const hints = [];
  const gewoehnlich = { istListe: false, editable: false, form: null, allow: [], hints };
  if (!istEinfachesObjekt(data) || data[DB_QUERY_KEY] === undefined) return gewoehnlich;
  const behaelter = data[DB_QUERY_KEY];
  if (!istEinfachesObjekt(behaelter)) return gewoehnlich;

  const editable = legeEditableAus(behaelter.editable, hints);
  const form = legeFormAus(behaelter.form, hints);
  const allow = legeAllowAus(behaelter.allow, hints);
  for (const schluessel of Object.keys(behaelter))
    if (!LIST_ANGABEN.includes(schluessel)) hints.push(unbekannteAngabe(schluessel));

  if (!editable.wert) {
    const ohne = behaelter.form !== undefined || behaelter.allow !== undefined;
    if (ohne && !editable.defekt) hints.push(baueHinweis('listOhneEditable', -1, null));
    return gewoehnlich;
  }
  return { istListe: true, editable: true, form, allow, hints };
}

module.exports = {
  LIST_HANDGRIFFE,
  LIST_STANDARD_HANDGRIFFE,
  LIST_ANGABEN,
  parseListAngaben,
};
