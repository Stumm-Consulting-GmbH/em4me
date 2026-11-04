'use strict';

// 4T-002453 (Epic 3E-000378, Story 4S-001140): Formel-Gruppe
// «Einheiten-Umrechnung» der Formel-Bibliothek, Namensraum `unit.`.
//
// **Form.** Wie `formula-humidity.js`: Das Modul liefert seine Gruppe als Daten
// `{ namespace, functions }` in der Form der Kern-Einträge (`arity: [min, max]`,
// reine `fn(args)`); die Liste der Bibliothek (`formula-library.js`) trägt sie
// ein, der Katalog registriert sie mit der Kennung der Erweiterung. Das Modul
// lädt den Katalog nicht.
//
// **Quelle.** NIST Special Publication 811, Guide for the Use of the
// International System of Units (SI), Anhang B.8 «Factors for Units Listed
// Alphabetically»; Faktoren im Fettdruck sind dort exakt. Temperatur:
// «T/K = t/°C + 273.15», «t/°C = (t/°F − 32)/1.8», «T/K = (t/°F + 459.67)/1.8»,
// «t/°C = T/K − 273.15». Länge: inch 2.54 E-02 m, foot 3.048 E-01 m,
// yard 9.144 E-01 m, mile 1.609 344 E+03 m, mile, nautical 1.852 E+03 m, alle
// exakt.
//
// **Eine Stelle für die Faktoren.** Die exakten Werte stehen allein in
// `TEMPERATUR` und `LAENGE` unten; jedes Paar rechnet beide Richtungen aus
// demselben Wert, Länge als Multiplikation hin und Division zurück, damit Hin-
// und Rückumrechnung den Ausgangswert im Rahmen der Gleitkomma-Genauigkeit
// ergeben (Story, AK7). Der Fahrenheit-Faktor 1,8 wird als Bruch 9/5 gerechnet
// (`(t · 9) / 5` statt `t · 1.8`), weil 1,8 im Binärformat nicht exakt
// darstellbar ist und `37 · 1.8` sonst 66.60000000000001 ergäbe. Kelvin und
// Fahrenheit rechnen über die Celsius-Skala; der Versatz 459,67 der Quelle ist
// genau 273,15 · 9/5 − 32 und folgt damit aus denselben zwei Werten.
//
// **Kein Bereich.** Die Umrechnungen sind exakte Definitions-Gleichungen, für
// die die Quelle keinen Bereich nennt (Story, Tabelle L19 und L20); geprüft
// wird allein, ob die Angabe eine Zahl ist und ob das Ergebnis im
// darstellbaren Zahlenbereich liegt. Ein allgemeines Umrechnungs-System mit
// Einheiten als Text ist nicht Teil der Bibliothek (Story, Abgrenzung).
//
// Prozess-neutral (kein Electron, kein DOM).

const { coerceNumber, messageValue } = require('./query-format.js');

// Temperatur (NIST SP 811, Anhang B.8): Nullpunkt der Celsius-Skala in K,
// Gefrierpunkt des Wassers in °F, Grad-Verhältnis Fahrenheit zu Celsius als
// Bruch 9/5 (= 1,8).
const TEMPERATUR = Object.freeze({ kelvin: 273.15, fahrenheit: 32, zaehler: 9, nenner: 5 });

// Länge in Meter je Einheit (NIST SP 811, Anhang B.8, alle exakt).
const LAENGE = Object.freeze({
  inch: 0.0254,
  foot: 0.3048,
  yard: 0.9144,
  mile: 1609.344,
  nauticalmile: 1852,
});

const M = Object.freeze({
  keineZahl: 'query.formula.notANumber',
  nichtDarstellbar: 'query.formula.notRepresentable',
});

// Eine Angabe als Zahl; ein Wahrheitswert ist hier keine Messgröße und zählt
// wie Text, der keine Zahl ist.
function zahl(v) {
  return typeof v === 'boolean' ? null : coerceNumber(v);
}

// Rechnet die eine Angabe um: keine Zahl meldet, ein nicht endliches Ergebnis
// meldet den Zahlenbereich, −0 wird zu 0.
function umrechnung(rechnung) {
  return ([v]) => {
    const x = zahl(v);
    if (x === null) return messageValue(M.keineZahl);
    const n = rechnung(x);
    if (!Number.isFinite(n)) return messageValue(M.nichtDarstellbar);
    return n === 0 ? 0 : n;
  };
}

const { kelvin, fahrenheit, zaehler, nenner } = TEMPERATUR;
const celsiusZuFahrenheit = (t) => (t * zaehler) / nenner + fahrenheit;
const fahrenheitZuCelsius = (t) => ((t - fahrenheit) * nenner) / zaehler;

const TEMPERATUR_FORMELN = {
  'unit.celsiustokelvin': (t) => t + kelvin,
  'unit.kelvintocelsius': (t) => t - kelvin,
  'unit.celsiustofahrenheit': celsiusZuFahrenheit,
  'unit.fahrenheittocelsius': fahrenheitZuCelsius,
  'unit.kelvintofahrenheit': (t) => celsiusZuFahrenheit(t - kelvin),
  'unit.fahrenheittokelvin': (t) => fahrenheitZuCelsius(t) + kelvin,
};

// Je Längen-Einheit beide Richtungen aus demselben Faktor.
const LAENGEN_FORMELN = {};
for (const [einheit, meter] of Object.entries(LAENGE)) {
  LAENGEN_FORMELN[`unit.${einheit}tometer`] = (x) => x * meter;
  LAENGEN_FORMELN[`unit.meterto${einheit}`] = (x) => x / meter;
}

const UNIT_GROUP = Object.freeze({
  namespace: 'unit',
  functions: Object.freeze(
    Object.fromEntries(
      Object.entries({ ...TEMPERATUR_FORMELN, ...LAENGEN_FORMELN }).map(([name, rechnung]) => [
        name,
        { arity: [1, 1], fn: umrechnung(rechnung) },
      ]),
    ),
  ),
});

module.exports = {
  UNIT_GROUP,
  UNIT_MESSAGES: M,
  UNIT_FACTORS: Object.freeze({ TEMPERATUR, LAENGE }),
};
