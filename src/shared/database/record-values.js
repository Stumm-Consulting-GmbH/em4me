// 4T-001559 (Epic 3E-000251, E5): Aus dem Text einer Zelle wird ein Wert —
// die Auslegung eines Zell-Textes nach dem Typ seiner Spalte.
//
// **Warum eine eigene Datei.** Der Gegenstand ist, was EINEN Spalten-Typ
// betrifft, und das ist dieselbe Naht, an der `table-columns.js` vom
// Definitions-Modul getrennt wurde. Sie wächst mit: Mit den Prüfregeln einer
// späteren Stufe kommt hier weitere Auslegung hinzu, und `record-block.js`
// bliebe sonst der Ort, an dem Format UND Typ-Auslegung zugleich stehen.
//
// **Was hier NICHT entschieden wird: die Härte.** Was beim Fund eines
// unpassenden Wertes geschieht, regelt E22 und gehört zu Stufe 2. Hier entsteht
// allein der Befund samt erhaltenem Rohtext — der Wert fällt auf leer, die Zelle
// behält ihren Text. Das ist dieselbe weiche Linie, die E3.7 für überzählige
// Zellen zieht, und dasselbe Verhalten, das die Datentabelle seit 3E-000079 an
// ihren Zell-Fehlern zeigt.
//
// **Drei Regeln, drei Herkünfte — und der Grund, warum sie hier so lauten.**
// Das Haus kennt für Datum und Uhrzeit bereits zwei verschiedene Prüfungen, und
// die Unterschiede sind real, nicht kosmetisch:
//
//   Datentabelle (`perspective-datatable-computed.js`): Datum kalendarisch
//     geprüft, Uhrzeit `HH:MM` ohne Sekunden.
//   Eigenschafts-Profile (`property-profiles-format.js`): Datum nur der FORM
//     nach (`2026-02-31` gilt), Uhrzeit `HH:MM` mit optionalen Sekunden.
//
// Für eine Datenbank-Spalte gilt hier die **jeweils sachgerechte** der beiden,
// und beide Male mit Grund. **Datum kalendarisch**, weil ein Datenspeicher den
// 31. Februar nicht annehmen darf; die formale Prüfung der Profile ist für eine
// Anzeige-Eigenschaft vertretbar, für einen gespeicherten Wert nicht.
// **Uhrzeit mit optionalen Sekunden**, weil E19 EIN Definitions-Format verlangt
// und die Profile die gemeinsame Heimat dieses Formats sind; die engere Regel
// der Datentabelle würde eine Uhrzeit abweisen, die als Vorgabewert derselben
// Spalte zulässig ist. Der verbleibende Widerspruch zwischen Vorgabewert und
// Zell-Wert beim Datum ist benannt und dem Product Owner vorgelegt; er wird
// hier nicht im Vorbeigehen an fremdem, ausgeliefertem Code behoben.
//
// Prozess-neutral (kein Electron, kein DOM), Blatt-Modul ohne Importe.
'use strict';

// Kanonische Speicherformate. Sie stammen aus der Datentabelle (PO-Entscheidung
// des Epics 3E-000079) und werden nicht neu gewählt: Ein zweites Format für
// dieselbe Sache wäre der teuerste Fehler an dieser Stelle, weil beide
// Konstrukte nebeneinander in derselben Anwendung stehen.
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const BOOLEAN_WAHR = ['x', 'X'];

// Typen, deren Wert der Text selbst ist. `link` und `record` gehören dazu: Sie
// tragen ihren **Verweis-Text**, denn ob das Ziel existiert, ist eine Frage der
// Auflösung und nicht des Formats. Dieselbe Arbeitsteilung hat 4T-001507 für
// die Ziel-Tabelle einer Verweis-Spalte gezogen.
const TEXT_TYPES = ['string', 'multiline', 'link', 'record'];

// Fehler-Codes je Typ. Sie tragen den Namen ihres Typs, damit eine Meldung
// sagen kann, WAS erwartet war, statt nur, dass etwas nicht passte.
const CELL_ERRORS = {
  number: 'invalidNumber',
  date: 'invalidDate',
  time: 'invalidTime',
  boolean: 'invalidBoolean',
};

// Kalendarisch gültiges Datum, nicht nur die richtige Form. `2026-02-31` trifft
// das Muster und ist trotzdem kein Tag.
function istDatum(text) {
  const treffer = DATE_RE.exec(text);
  if (!treffer) return false;
  const jahr = parseInt(treffer[1], 10);
  const monat = parseInt(treffer[2], 10);
  const tag = parseInt(treffer[3], 10);
  const d = new Date(jahr, monat - 1, tag);
  return d.getFullYear() === jahr && d.getMonth() === monat - 1 && d.getDate() === tag;
}

// Text einer Zelle -> `{ value, error }`.
//
// **Die leere Zelle ist bei jedem Typ gültig** und bedeutet «nicht gesetzt»:
// bei Text die leere Zeichenkette, beim Wahrheitswert `false` (weil sein
// kanonisches Format `x` oder leer ist und «leer» dort schon die Bedeutung
// «nein» trägt), sonst `null`. Ob ein leerer Wert an dieser Stelle erlaubt ist,
// sagt die Pflicht-Angabe und damit E22, also eine spätere Stufe.
//
// **Der Text wird für die Auslegung getrimmt, für den Wert eines Text-Typs
// nicht.** Ein Datum mit Leerzeichen davor ist dasselbe Datum, ein Text mit
// Leerzeichen davor ist ein anderer Text — und ein Datenspeicher, der eine
// Zeichenkette still beschneidet, ändert Daten.
function zellWert(type, text) {
  const roh = typeof text === 'string' ? text : '';
  if (TEXT_TYPES.includes(type)) return { value: roh, error: null };

  const s = roh.trim();
  if (type === 'boolean') {
    if (s === '') return { value: false, error: null };
    return BOOLEAN_WAHR.includes(s)
      ? { value: true, error: null }
      : { value: null, error: CELL_ERRORS.boolean };
  }
  if (s === '') return { value: null, error: null };

  if (type === 'number') {
    return NUMBER_RE.test(s)
      ? { value: parseFloat(s), error: null }
      : { value: null, error: CELL_ERRORS.number };
  }
  if (type === 'date') {
    return istDatum(s) ? { value: s, error: null } : { value: null, error: CELL_ERRORS.date };
  }
  if (type === 'time') {
    return TIME_RE.test(s) ? { value: s, error: null } : { value: null, error: CELL_ERRORS.time };
  }

  // Ein Typ, den dieses Modul nicht kennt, macht die Zelle nicht ungültig: Der
  // Text bleibt der Wert. Dieselbe Zusage, mit der das Feld-Format über alle
  // seine Stufen unbekannte Angaben unangetastet gelassen hat — eine Datei für
  // eine spätere Stufe darf heute schon dastehen, ohne Schaden anzurichten.
  return { value: roh, error: null };
}

module.exports = {
  TEXT_TYPES,
  CELL_ERRORS,
  NUMBER_RE,
  TIME_RE,
  istDatum,
  zellWert,
};
