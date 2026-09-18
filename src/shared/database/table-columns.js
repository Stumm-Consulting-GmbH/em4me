// 4T-001507 (Epic 3E-000250, E5): Der Typ-Satz einer Datenbank-Spalte — die
// acht zulässigen Typen, die begründeten Ausschlüsse und die typ-eigenen
// Angaben, die es nur an einer Spalte gibt.
//
// Eigene Datei neben `table-definition.js`, nach derselben Naht-Logik, mit der
// die Eigenschafts-Profile ihren Options-Katalog von ihrem Format getrennt
// haben: Hier liegt, was EINEN Spalten-Typ betrifft, dort das Lesen einer
// ganzen Definition. Der Schnitt wächst mit, denn jede weitere Stufe der
// Datenbank bringt Angaben an Typen mit.
//
// Blatt-Modul innerhalb der Datenbank: Es lädt `table-definition.js` nicht (die
// Richtung ist umgekehrt) und aus dem Haus nur die Fassade der
// Eigenschafts-Profile.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

// E19 verlangt EIN Definitions-Format. Der Options-Katalog der
// Eigenschafts-Profile gilt deshalb auch für Spalten; ergänzt wird er hier um
// das, was es nur an einer Spalte gibt.
const { optionSpecsFor, pruefeGegenSpec } = require('../property-profiles.js');

// --- Der Typ-Satz ------------------------------------------------------------------

// Die acht Spalten-Typen aus E5. Sie sind NICHT der Satz der
// Dokument-Eigenschaften; die vier fehlenden sind unten einzeln begründet.
//
// `record` ist der Datensatz-Verweis und der einzige wirklich neue Typ: `link`
// verweist auf eine DATEI, ein Datensatz ist aber keine Datei, sondern eine
// Datensatz-Zeile. Ohne ihn gäbe es keine Beziehung zwischen zwei Tabellen und
// damit keine der drei Prüfstein-Miniaturen des Konzepts.
const DB_COLUMN_TYPES = [
  'string',
  'multiline',
  'number',
  'boolean',
  'date',
  'time',
  'link',
  'record',
];

// Typ einer Spalte ohne erklärten Typ. Dieselbe Vorgabe wie im Feld-Format der
// Eigenschafts-Profile; sie hält die einzige Pflichtangabe beim Namen.
const DB_DEFAULT_COLUMN_TYPE = 'string';

// --- Die Ausschlüsse, nach ihrem Grund getrennt -------------------------------------

// Berechnete Felder. Sie scheiden durch die Leitplanke aus, nach der eine
// Tabelle keine berechneten Felder trägt; Berechnungen laufen über Abfragen.
// Auf der Ebene der Dokument-Eigenschaften bleiben beide unberührt.
const COMPUTED_TYPES = ['formula', 'lookup'];

// Strukturierte Werte. Sie scheiden aus, weil ein Objekt in einer Zelle der
// Ausweg um die Normalisierung herum wäre: Was ein Objekt in einer Zelle
// ausdrückt, drückt sonst eine abhängige Tabelle über eine Beziehung aus.
const STRUCTURED_TYPES = ['object', 'objectlist'];

// Die mehrwertige Spalte. Sie ist eine 1:n-Beziehung, die sich als Spalte
// tarnt, und scheidet aus demselben Grund aus wie die strukturierten Typen.
// `multistring` ist ihre Typ-Schreibweise im Feld-Format, `multiple` ihre
// Angabe an jedem anderen Typ; beide führen auf denselben Befund.
const MULTI_VALUE_TYPE = 'multistring';

// --- Typ-eigene Angaben einer Spalte ------------------------------------------------

function alsText(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

// Angaben, die es nur an einer Spalte gibt. Sie stehen NICHT im geteilten
// Katalog der Eigenschafts-Profile: Eine Ziel-Tabelle an einer
// Dokument-Eigenschaft wäre gegenstandslos, und der geteilte Katalog wächst
// nach E5.5 um genau zwei Angaben und nicht um jede der Datenbank.
//
// `table` bleibt hier ungeprüfter Text — ob die genannte Tabelle existiert, ist
// eine Frage der Auflösung und nicht des Formats. Dieselbe Arbeitsteilung, mit
// der das Format-Modul `valuesFrom.query` liest, ohne es auszuwerten.
const DB_COLUMN_OPTION_SPECS = {
  record: {
    table: { expected: 'table-name', pruef: alsText },
  },
};

// Welche Options-Schlüssel an einer Spalte gelten: die des geteilten Katalogs
// für ihren Typ (samt denen der Auswahl, wenn sie einen Wertevorrat hat) plus
// die spalten-eigenen.
function spaltenOptionsSpec(type, hasValueSource) {
  return { ...optionSpecsFor(type, hasValueSource), ...(DB_COLUMN_OPTION_SPECS[type] || {}) };
}

// Prüft die Options-Angaben einer Spalte. Gestalt und weiche Linie sind die der
// Eigenschafts-Profile: Eine unbekannte oder unpassend belegte Angabe entfällt
// einzeln, die Spalte bleibt wirksam. Liefert { options, hints } oder null,
// wenn `raw` kein einfaches Objekt ist.
function normalisiereSpaltenOptionen(raw, type, hasValueSource) {
  return pruefeGegenSpec(raw, spaltenOptionsSpec(type, hasValueSource));
}

// --- Der Typ-Befund ------------------------------------------------------------------

// Deutet die Typ-Angabe einer Spalte. Liefert entweder { type } oder { code },
// wobei der Code den GRUND des Ausschlusses nennt und nicht nur die Tatsache:
//
//   typeComputed    berechnetes Feld (formula, lookup)
//   typeStructured  strukturierter Wert (object, objectlist)
//   multipleColumn  mehrwertige Spalte (multistring)
//   type            im Feld-Format unbekannt
//
// Die Trennung nach Gründen ist der Punkt: «unbekannter Typ» wäre für einen
// Autor, der `object` schreibt, eine falsche Auskunft — der Typ ist der
// Anwendung sehr wohl bekannt, er ist an dieser Stelle ausgeschlossen, und nur
// die zweite Aussage führt ihn zur abhängigen Tabelle, die er stattdessen
// braucht.
function spaltenTyp(rohTyp) {
  const typ = alsText(rohTyp);
  if (typ === null) return { code: 'type' };
  if (DB_COLUMN_TYPES.includes(typ)) return { type: typ };
  if (COMPUTED_TYPES.includes(typ)) return { code: 'typeComputed' };
  if (STRUCTURED_TYPES.includes(typ)) return { code: 'typeStructured' };
  if (typ === MULTI_VALUE_TYPE) return { code: 'multipleColumn' };
  return { code: 'type' };
}

module.exports = {
  DB_COLUMN_TYPES,
  DB_DEFAULT_COLUMN_TYPE,
  COMPUTED_TYPES,
  STRUCTURED_TYPES,
  MULTI_VALUE_TYPE,
  DB_COLUMN_OPTION_SPECS,
  spaltenOptionsSpec,
  normalisiereSpaltenOptionen,
  spaltenTyp,
};
