'use strict';

// 4T-002451 (Epic 3E-000378, Story 4S-001139): Formel-Gruppe «Feuchte und
// Taupunkt» der Formel-Bibliothek, Namensraum `humidity.`.
//
// **Form.** Das Modul liefert seine Gruppe als Daten `{ namespace, functions }`
// in der Form der Kern-Einträge (`arity: [min, max]`, reine `fn(args)`); die
// Liste der Bibliothek (`formula-library.js`) trägt sie ein, der Katalog
// registriert sie mit der Kennung der Erweiterung. Das Modul lädt den Katalog
// nicht (Richtung Katalog → Liste → Kategorie, kein Kreis).
//
// **Rechnung.** Magnus-Formel mit den Konstanten nach Sonntag, wie sie der
// Leitfaden der Weltorganisation für Meteorologie empfiehlt: WMO-Nr. 8, Guide to
// Meteorological Instruments and Methods of Observation, 7. Auflage 2008, Teil I,
// Kapitel 4, Anhang 4.B (Seite I.4-29), «ew(t) = 6.112 exp[17.62 t/(243.12 + t)]»
// über Wasser für −45 bis 60 °C und «ei(t) = 6.112 exp[22.46 t/(272.62 + t)]»
// über Eis für −65 bis 0 °C; ebenso de.wikipedia «Taupunkt», Gl. 10, mit dem
// Eis-Bereich bis 0,01 °C, dessen Grenze hier gilt. Gerechnet wird die reine
// Phase ohne Korrekturfaktor f(p) für feuchte Luft, wie die Story es festlegt.
//
// **Bezug unter 0 °C.** Dampfdruck, absolute und relative Feuchte und Taupunkt
// rechnen in jedem Temperaturbereich über Wasser: WMO-Nr. 8, Anhang 4.A,
// Absatz 17 (Seite I.4-27), «Relative humidity at temperatures less than 0 °C
// is to be evaluated with respect to water». Den Wert über Eis liefert allein
// `humidity.saturationpressureice`.
//
// **Meldungen statt Werte.** Eine Angabe außerhalb des Gültigkeitsbereichs, eine
// Angabe, aus der eine relative Feuchte über 100 Prozent folgte, und eine
// Angabe, die keine Zahl ist, ergeben einen Meldungs-Wert (`messageValue`) mit
// einem i18n-Schlüssel, der Angabe und Bereich nennt; nie einen Wert (Story,
// AK5 und AK7). Der Rechen-Ort zeigt die Meldung an der Stelle des Ergebnisses.
//
// Prozess-neutral (kein Electron, kein DOM).

const { coerceNumber, messageValue } = require('./query-format.js');

// Magnus-Konstanten nach Sonntag (Quelle oben): K1 in hPa, K3 in °C.
const UEBER_WASSER = Object.freeze({ k1: 6.112, k2: 17.62, k3: 243.12, min: -45, max: 60 });
const UEBER_EIS = Object.freeze({ k1: 6.112, k2: 22.46, k3: 272.62, min: -65, max: 0.01 });

// Spezifische Gaskonstante des Wasserdampfs in J/(kg·K), de.wikipedia
// «Luftfeuchtigkeit», Abschnitt «Dampfdichte»; Nullpunkt der Celsius-Skala in K.
const R_W = 461.52;
const KELVIN = 273.15;

// Spielraum gegen Rundungs-Rest an der Sättigungs-Grenze: Eine absolute Feuchte,
// die `humidity.absolute(t, 100)` geliefert hat, ergibt wieder 100 und keine
// Meldung.
const SAETTIGUNG_SPIELRAUM = 1e-9;

const PREFIX = 'query.formula.humidity.';
const M = Object.freeze({
  keineZahl: 'query.formula.notANumber',
  temperatur: `${PREFIX}temperatureRange`,
  temperaturEis: `${PREFIX}temperatureRangeIce`,
  taupunkt: `${PREFIX}dewpointRange`,
  relativ: `${PREFIX}relativeRange`,
  relativTaupunkt: `${PREFIX}relativeRangeDewpoint`,
  absolutNegativ: `${PREFIX}absoluteNegative`,
  absolutUebersaettigt: `${PREFIX}absoluteAboveSaturation`,
  taupunktUeberTemperatur: `${PREFIX}dewpointAboveTemperature`,
});

// Eine Angabe als Zahl; ein Wahrheitswert ist hier keine Messgröße und zählt
// wie Text, der keine Zahl ist.
function zahl(v) {
  return typeof v === 'boolean' ? null : coerceNumber(v);
}

// Sättigungsdampfdruck in hPa nach der Magnus-Formel.
function magnus(k, t) {
  return k.k1 * Math.exp((k.k2 * t) / (k.k3 + t));
}

function imBereich(k, t) {
  return t >= k.min && t <= k.max;
}

// Prüft die Angaben der Reihe nach: erst ob sie Zahlen sind, dann je Angabe ihr
// Bereich. Liefert die Zahlen oder den Meldungs-Wert der ersten Verletzung.
function angaben(args, bereiche) {
  const werte = args.map(zahl);
  if (werte.some((n) => n === null)) return messageValue(M.keineZahl);
  for (let i = 0; i < bereiche.length; i++) {
    if (!bereiche[i].gilt(werte[i])) return messageValue(bereiche[i].meldung);
  }
  return werte;
}

const TEMPERATUR = { gilt: (t) => imBereich(UEBER_WASSER, t), meldung: M.temperatur };
const TEMPERATUR_EIS = { gilt: (t) => imBereich(UEBER_EIS, t), meldung: M.temperaturEis };
const TAUPUNKT = { gilt: (t) => imBereich(UEBER_WASSER, t), meldung: M.taupunkt };
const RELATIV = { gilt: (rh) => rh >= 0 && rh <= 100, meldung: M.relativ };
const RELATIV_TAUPUNKT = { gilt: (rh) => rh > 0 && rh <= 100, meldung: M.relativTaupunkt };
const ABSOLUT = { gilt: (ah) => ah >= 0, meldung: M.absolutNegativ };

// Wendet die Rechnung auf geprüfte Angaben an; ein Meldungs-Wert der Prüfung
// geht unverändert durch.
function formel(bereiche, rechnung) {
  return (args) => {
    const werte = angaben(args, bereiche);
    return Array.isArray(werte) ? rechnung(...werte) : werte;
  };
}

// Dampfdruck in hPa: e = rh/100 · E(t) (de.wikipedia «Taupunkt», Gl. 8).
function dampfdruck(t, rh) {
  return (rh / 100) * magnus(UEBER_WASSER, t);
}

// Absolute Feuchte in g/m³: ρ_w = e / (R_w · T), e in Pa, umgerechnet von
// kg/m³ in g/m³ (de.wikipedia «Luftfeuchtigkeit», Abschnitt «Dampfdichte»).
function absolut(t, rh) {
  return ((dampfdruck(t, rh) * 100) / (R_W * (t + KELVIN))) * 1000;
}

// Relative Feuchte in Prozent aus absoluter Feuchte: Umkehrung von `absolut`.
function relativ(t, ah) {
  const rh = (ah * R_W * (t + KELVIN)) / (1000 * magnus(UEBER_WASSER, t));
  if (rh > 100 + SAETTIGUNG_SPIELRAUM) return messageValue(M.absolutUebersaettigt);
  return Math.min(rh, 100);
}

// Taupunkt in °C (de.wikipedia «Taupunkt», Gl. 15). Ein Taupunkt unter dem
// Bereich der Magnus-Formel ist keine gültige Näherung mehr und ergibt die
// Meldung des Taupunkt-Bereichs.
function taupunkt(t, rh) {
  const { k2, k3 } = UEBER_WASSER;
  const ln = Math.log(rh / 100);
  const tau = (k3 * ((k2 * t) / (k3 + t) + ln)) / ((k2 * k3) / (k3 + t) - ln);
  return imBereich(UEBER_WASSER, tau) ? tau : messageValue(M.taupunkt);
}

// Relative Feuchte in Prozent aus dem Taupunkt: rh = 100 · E(td) / E(t)
// (wetterochs.de «Feuchte»; WMO-Nr. 8, Anhang 4.B, «U = 100 e'w(p,td)/e'w(p,t)»).
function relativAusTaupunkt(t, td) {
  if (td > t) return messageValue(M.taupunktUeberTemperatur);
  return (100 * magnus(UEBER_WASSER, td)) / magnus(UEBER_WASSER, t);
}

const HUMIDITY_GROUP = Object.freeze({
  namespace: 'humidity',
  functions: Object.freeze({
    'humidity.saturationpressure': {
      arity: [1, 1],
      fn: formel([TEMPERATUR], (t) => magnus(UEBER_WASSER, t)),
    },
    'humidity.saturationpressureice': {
      arity: [1, 1],
      fn: formel([TEMPERATUR_EIS], (t) => magnus(UEBER_EIS, t)),
    },
    'humidity.vaporpressure': { arity: [2, 2], fn: formel([TEMPERATUR, RELATIV], dampfdruck) },
    'humidity.absolute': { arity: [2, 2], fn: formel([TEMPERATUR, RELATIV], absolut) },
    'humidity.relative': { arity: [2, 2], fn: formel([TEMPERATUR, ABSOLUT], relativ) },
    'humidity.dewpoint': {
      arity: [2, 2],
      fn: formel([TEMPERATUR, RELATIV_TAUPUNKT], taupunkt),
    },
    'humidity.relativefromdewpoint': {
      arity: [2, 2],
      fn: formel([TEMPERATUR, TAUPUNKT], relativAusTaupunkt),
    },
  }),
});

module.exports = {
  HUMIDITY_GROUP,
  HUMIDITY_MESSAGES: M,
  HUMIDITY_CONSTANTS: Object.freeze({ UEBER_WASSER, UEBER_EIS, R_W, KELVIN }),
};
