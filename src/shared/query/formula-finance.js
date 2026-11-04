'use strict';

// 4T-002452 (Epic 3E-000378, Story 4S-001139): Formel-Gruppe
// «Finanzmathematik» der Formel-Bibliothek, Namensraum `finance.`.
//
// **Form.** Wie `formula-humidity.js`: Das Modul liefert seine Gruppe als Daten
// `{ namespace, functions }` in der Form der Kern-Einträge (`arity: [min, max]`,
// reine `fn(args)`); die Liste der Bibliothek (`formula-library.js`) trägt sie
// ein, der Katalog registriert sie mit der Kennung der Erweiterung. Das Modul
// lädt den Katalog nicht.
//
// **Quelle.** OASIS, Open Document Format for Office Applications
// (OpenDocument) Version 1.3, Part 4: Recalculated Formula (OpenFormula)
// Format, OASIS Standard vom 27. April 2021 (ISO/IEC 26300), Abschnitt 6.12:
// 6.12.36 PMT, 6.12.41 PV, 6.12.20 FV, 6.12.29 NPER, 6.12.30 NPV, 6.12.24 IRR,
// 6.12.42 RATE, 6.12.19 EFFECT, 6.12.28 NOMINAL. Die Annuitäten-Formeln lösen
// dieselbe Gleichung (6.12.36, 6.12.41, 6.12.29, 6.12.42):
//
//   0 = pv · (1 + rate)^nper + pmt · (1 + rate · type) · ((1 + rate)^nper − 1) / rate + fv
//
// und bei Zins 0: pv = −fv − pmt · nper. Namen, Reihenfolge der Angaben und
// Vorgaben sind die der Norm und der Tabellenkalkulationen.
//
// **Vorzeichen-Regel.** Ausgezahltes Geld ist negativ, eingenommenes positiv
// (Story); die Formeln rechnen die Gleichung oben und übernehmen die Regel
// damit ohne eigene Umkehrung.
//
// **Zahlungen bei Kapitalwert und internem Zinsfuß.** Die Ausdrucks-Sprache
// kennt kein Listen-Literal. `finance.npv(rate, value1[, value2, …])` nimmt wie
// NPV der Norm («{ NumberSequenceList Values }+») beliebig viele Angaben, jede
// eine Zahl oder ein Listen-Feld, in der Reihenfolge der Angaben und innerhalb
// eines Listen-Felds in dessen Reihenfolge. `finance.irr(values[, guess])` nimmt
// wie IRR der Norm («NumberSequence Values») die Zahlungen als EINE Angabe,
// ein Listen-Feld; der Schätzwert bleibt die zweite Angabe. Anders als `sum`
// fällt ein Element, das keine Zahl ist, nicht still weg, weil sich damit die
// Perioden aller folgenden Zahlungen verschöben (Story, AK7): es meldet.
//
// **Iteration.** Interner Zinsfuß und Zins einer Annuität haben keine
// geschlossene Form (6.12.24). Gerechnet wird mit dem Newton-Verfahren ab dem
// Schätzwert (Vorgabe 0,1), Ableitung als zentraler Differenzen-Quotient; bleibt
// es ohne Ergebnis, sucht eine Bisektion zwischen festen Stützstellen den
// Vorzeichenwechsel, der dem Schätzwert am nächsten liegt. Ein Ergebnis gilt
// erst, wenn die Gleichung mit ihm bis auf einen Rest von 10⁻⁷ ihres Maßstabs
// erfüllt ist; sonst meldet die Formel «keine Konvergenz» (Story, AK5).
//
// **Meldungen statt Werte.** Eine Angabe außerhalb des Bereichs, eine fehlende
// Angabe, Text ohne Zahl und ein Ergebnis außerhalb des darstellbaren
// Zahlenbereichs ergeben einen Meldungs-Wert (`messageValue`) mit einem
// i18n-Schlüssel, der Angabe und Bereich nennt; nie einen Wert (Story, AK5 und
// AK7).
//
// Prozess-neutral (kein Electron, kein DOM).

const { coerceNumber, messageValue } = require('./query-format.js');

// Iteration (technische Festlegungen der Sitzung, Kapitel «Lösung» des Tasks).
const START_SCHAETZWERT = 0.1; // Vorgabe der Norm für IRR und RATE
const NEWTON_SCHRITTE = 100;
const SCHRITT_GRENZE = 1e-12; // relative Änderung, bei der Newton anhält
const RESTGLIED_GRENZE = 1e-7; // erlaubter Rest der Gleichung je Maßstab
const BISEKTION_SCHRITTE = 200;
const STUETZSTELLEN = Object.freeze([
  -0.999, -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, -0.05, -0.01, 0, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2,
  5, 10, 100, 1000,
]);

const PREFIX = 'query.formula.finance.';
const M = Object.freeze({
  keineZahl: 'query.formula.notANumber',
  nichtDarstellbar: 'query.formula.notRepresentable',
  zins: `${PREFIX}rateRange`,
  laufzeit: `${PREFIX}periodsRange`,
  zeitpunkt: `${PREFIX}typeRange`,
  schaetzwert: `${PREFIX}guessRange`,
  vorzeichen: `${PREFIX}cashflowSignChange`,
  konvergenz: `${PREFIX}noConvergence`,
  keineLaufzeit: `${PREFIX}nperNoSolution`,
  nominalzins: `${PREFIX}nominalRateRange`,
  effektivzins: `${PREFIX}effectiveRateRange`,
  zinsperioden: `${PREFIX}compoundingPeriodsRange`,
});

// Eine Angabe als Zahl; ein Wahrheitswert und eine Liste sind hier keine
// Beträge und zählen wie Text, der keine Zahl ist.
function zahl(v) {
  return typeof v === 'boolean' ? null : coerceNumber(v);
}

// Endliches Ergebnis oder die Meldung des Zahlenbereichs; −0 wird zu 0.
function ergebnis(n) {
  if (!Number.isFinite(n)) return messageValue(M.nichtDarstellbar);
  return n === 0 ? 0 : n;
}

// Bereiche der Angaben. `vorgabe` gilt für eine von hinten ausgelassene Angabe.
const ZINS = { gilt: (r) => r > -1, meldung: M.zins };
const LAUFZEIT = { gilt: (n) => n > 0, meldung: M.laufzeit };
const ZEITPUNKT = { vorgabe: 0, gilt: (t) => t === 0 || t === 1, meldung: M.zeitpunkt };
const SCHAETZWERT = { vorgabe: START_SCHAETZWERT, gilt: (g) => g > -1, meldung: M.schaetzwert };
const BETRAG = {};
const ENDWERT = { vorgabe: 0 };
const NOMINALZINS = { gilt: (r) => r >= 0, meldung: M.nominalzins };
const EFFEKTIVZINS = { gilt: (r) => r > 0, meldung: M.effektivzins };
const ZINSPERIODEN = { gilt: (m) => Math.trunc(m) >= 1, meldung: M.zinsperioden };

// Prüft die Angaben der Reihe nach: erst ob sie Zahlen sind (ausgelassene mit
// Vorgabe zählen mit ihr), dann je Angabe ihr Bereich. Liefert die Zahlen oder
// den Meldungs-Wert der ersten Verletzung.
function angaben(args, bereiche) {
  const werte = bereiche.map((b, i) =>
    args[i] === undefined && b.vorgabe !== undefined ? b.vorgabe : zahl(args[i]),
  );
  if (werte.some((n) => n === null)) return messageValue(M.keineZahl);
  for (let i = 0; i < bereiche.length; i++) {
    if (bereiche[i].gilt && !bereiche[i].gilt(werte[i])) return messageValue(bereiche[i].meldung);
  }
  return werte;
}

// Wendet die Rechnung auf geprüfte Angaben an; ein Meldungs-Wert der Prüfung
// oder der Rechnung geht unverändert durch, eine Zahl über `ergebnis`.
function formel(bereiche, rechnung) {
  return (args) => {
    const werte = angaben(args, bereiche);
    if (!Array.isArray(werte)) return werte;
    const r = rechnung(...werte);
    return typeof r === 'number' ? ergebnis(r) : r;
  };
}

// Die Zahlungen einer Angabe: eine Zahl oder die Elemente eines Listen-Felds.
// Liefert null, wenn eine fehlt oder keine Zahl ist.
function zahlungen(angabe) {
  const roh = Array.isArray(angabe) ? angabe : [angabe];
  const werte = roh.map(zahl);
  return werte.some((n) => n === null) ? null : werte;
}

// (1 + r)^n − 1 und (1 + r)^n, genau auch für sehr kleine Zinssätze.
const zuwachs = (r, n) => Math.expm1(n * Math.log1p(r));
const faktor = (r, n) => Math.exp(n * Math.log1p(r));

// Rentenfaktor (1 + r·type) · ((1 + r)^n − 1) / r; bei Zins 0 der Grenzwert n.
function rentenfaktor(r, n, t) {
  return r === 0 ? n : ((1 + r * t) * zuwachs(r, n)) / r;
}

// Restglied der Annuitäten-Gleichung (Kopf des Moduls).
function annuitaet(r, n, pmt, pv, fv, t) {
  return pv * faktor(r, n) + pmt * rentenfaktor(r, n, t) + fv;
}

// Abzinsungs-Form derselben Gleichung, geteilt durch (1 + r)^n: Bei positivem
// Zins und langer Laufzeit liefe (1 + r)^n über den Zahlenbereich, obwohl Rate
// und Barwert darstellbar sind. Mit v = (1 + r)^−n und 1 − v = −expm1(−n·ln(1+r))
// bleibt die Rechnung im Bereich.
const abzinsung = (r, n) => faktor(r, -n);
const abzinsungsRest = (r, n) => -Math.expm1(-n * Math.log1p(r));

// Rate (6.12.36): bei Zins 0 −(pv + fv) / nper.
function annuitaetsRate(r, n, pv, fv, t) {
  if (r === 0) return -(pv + fv) / n;
  if (r > 0) return (-r * (pv + fv * abzinsung(r, n))) / ((1 + r * t) * abzinsungsRest(r, n));
  return -(pv * faktor(r, n) + fv) / rentenfaktor(r, n, t);
}

// Barwert (6.12.41): bei Zins 0 −fv − pmt · nper.
function barwert(r, n, pmt, fv, t) {
  if (r === 0) return -fv - pmt * n;
  return -(fv * abzinsung(r, n) + (pmt * (1 + r * t) * abzinsungsRest(r, n)) / r);
}

// Endwert (6.12.20, Gleichung aus 6.12.41): bei Zins 0 −pv − pmt · nper.
function endwert(r, n, pmt, pv, t) {
  return -(pv * faktor(r, n) + pmt * rentenfaktor(r, n, t));
}

// Laufzeit: Bei Zins 0 pv = −fv − pmt · nper (6.12.29). Sonst folgt aus der
// Gleichung (1 + r)^nper = (c − fv) / (pv + c) mit c = pmt · (1 + r·type) / r;
// ohne positiven Quotienten gibt es keine Laufzeit.
function laufzeit(r, pmt, pv, fv, t) {
  if (r === 0) return pmt === 0 ? messageValue(M.keineLaufzeit) : -(pv + fv) / pmt;
  const c = (pmt * (1 + r * t)) / r;
  const q = (c - fv) / (pv + c);
  if (!Number.isFinite(q) || q <= 0) return messageValue(M.keineLaufzeit);
  return Math.log(q) / Math.log1p(r);
}

// Kapitalwert: Σ value_i / (1 + rate)^i, i = 1 … N (6.12.30).
function kapitalwert(r, werte) {
  return werte.reduce((s, v, i) => s + v / faktor(r, i + 1), 0);
}

// Newton ab dem Schätzwert; null, wenn es ohne Halt ausläuft oder abbricht.
function newton(f, start) {
  let r = start;
  for (let i = 0; i < NEWTON_SCHRITTE; i++) {
    const y = f(r);
    const h = Math.min(1e-6 * (1 + Math.abs(r)), (r + 1) / 2);
    const d = (f(r + h) - f(r - h)) / (2 * h);
    if (!Number.isFinite(y) || !Number.isFinite(d) || d === 0) return null;
    let naechster = r - y / d;
    // Unter −1 ist die Gleichung nicht definiert: halber Weg zur Grenze.
    if (!(naechster > -1)) naechster = (r - 1) / 2;
    if (Math.abs(naechster - r) <= SCHRITT_GRENZE * (1 + Math.abs(r))) return naechster;
    r = naechster;
  }
  return null;
}

// Bisektion im Vorzeichenwechsel zwischen zwei Stützstellen, der dem
// Schätzwert am nächsten liegt; null ohne Vorzeichenwechsel.
function bisektion(f, schaetzwert) {
  const stellen = [...new Set([...STUETZSTELLEN, schaetzwert])].sort((a, b) => a - b);
  const paare = [];
  for (let i = 0; i + 1 < stellen.length; i++) {
    const [a, b] = [stellen[i], stellen[i + 1]];
    const [fa, fb] = [f(a), f(b)];
    if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb <= 0) paare.push([a, b, fa]);
  }
  if (paare.length === 0) return null;
  const abstand = ([a, b]) => Math.min(Math.abs(a - schaetzwert), Math.abs(b - schaetzwert));
  let [a, b, fa] = paare.reduce((best, p) => (abstand(p) < abstand(best) ? p : best));
  for (let i = 0; i < BISEKTION_SCHRITTE && b - a > 0; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0 || m === a || m === b) return m;
    if (fa * fm < 0) b = m;
    else [a, fa] = [m, fm];
  }
  return (a + b) / 2;
}

// Löst f(r) = 0 für r > −1. Ein Ergebnis gilt nur, wenn der Rest der
// Gleichung höchstens RESTGLIED_GRENZE · massstab ist.
function loese(f, schaetzwert, massstab) {
  const gilt = (r) => r !== null && r > -1 && Math.abs(f(r)) <= RESTGLIED_GRENZE * massstab;
  const n = newton(f, schaetzwert);
  if (gilt(n)) return n;
  const b = bisektion(f, schaetzwert);
  return gilt(b) ? b : messageValue(M.konvergenz);
}

// Interner Zinsfuß: der Zins, bei dem Σ value_i / (1 + r)^i, i = 0 … N−1, null
// wird (6.12.24); die erste Zahlung steht zum Beginn.
function zinsfuss(werte, schaetzwert) {
  if (!werte.some((v) => v < 0) || !werte.some((v) => v > 0)) {
    return messageValue(M.vorzeichen);
  }
  const f = (r) => werte.reduce((s, v, i) => s + v / faktor(r, i), 0);
  const massstab = Math.max(1, ...werte.map(Math.abs));
  return loese(f, schaetzwert, massstab);
}

// Zins einer Annuität: löst die Gleichung des Kopfs nach rate (6.12.42).
function zins(n, pmt, pv, fv, t, schaetzwert) {
  const f = (r) => annuitaet(r, n, pmt, pv, fv, t);
  const massstab = Math.max(1, Math.abs(pv), Math.abs(fv), Math.abs(pmt) * n);
  return loese(f, schaetzwert, massstab);
}

// Effektivzins (6.12.19): (1 + rate / periods)^periods − 1. Nominalzins
// (6.12.28): Umkehrung derselben Gleichung. Die Zahl der Perioden ist in der
// Norm eine ganze Zahl; ein Nachkommateil wird zur Null hin abgeschnitten.
const effektiv = (r, m) => zuwachs(r / Math.trunc(m), Math.trunc(m));
const nominal = (e, m) => Math.trunc(m) * Math.expm1(Math.log1p(e) / Math.trunc(m));

const FINANCE_GROUP = Object.freeze({
  namespace: 'finance',
  functions: Object.freeze({
    'finance.pmt': {
      arity: [3, 5],
      fn: formel([ZINS, LAUFZEIT, BETRAG, ENDWERT, ZEITPUNKT], annuitaetsRate),
    },
    'finance.pv': {
      arity: [3, 5],
      fn: formel([ZINS, BETRAG, BETRAG, ENDWERT, ZEITPUNKT], barwert),
    },
    'finance.fv': {
      arity: [3, 5],
      fn: formel([ZINS, BETRAG, BETRAG, ENDWERT, ZEITPUNKT], endwert),
    },
    'finance.npv': {
      // Zins und bis zu 254 Zahlungs-Angaben wie in den Tabellenkalkulationen.
      arity: [2, 255],
      fn: (args) => {
        const r = angaben(args.slice(0, 1), [ZINS]);
        if (!Array.isArray(r)) return r;
        const listen = args.slice(1).map(zahlungen);
        if (listen.some((l) => l === null)) return messageValue(M.keineZahl);
        return ergebnis(kapitalwert(r[0], listen.flat()));
      },
    },
    'finance.irr': {
      arity: [1, 2],
      fn: ([values, guess]) => {
        const werte = zahlungen(values);
        if (werte === null || werte.length === 0) return messageValue(M.keineZahl);
        const g = angaben([guess], [SCHAETZWERT]);
        if (!Array.isArray(g)) return g;
        const r = zinsfuss(werte, g[0]);
        return typeof r === 'number' ? ergebnis(r) : r;
      },
    },
    'finance.rate': {
      arity: [3, 6],
      fn: formel([LAUFZEIT, BETRAG, BETRAG, ENDWERT, ZEITPUNKT, SCHAETZWERT], zins),
    },
    'finance.nper': {
      arity: [3, 5],
      fn: formel([ZINS, BETRAG, BETRAG, ENDWERT, ZEITPUNKT], laufzeit),
    },
    'finance.effect': { arity: [2, 2], fn: formel([NOMINALZINS, ZINSPERIODEN], effektiv) },
    'finance.nominal': { arity: [2, 2], fn: formel([EFFEKTIVZINS, ZINSPERIODEN], nominal) },
  }),
});

module.exports = {
  FINANCE_GROUP,
  FINANCE_MESSAGES: M,
  FINANCE_ITERATION: Object.freeze({
    START_SCHAETZWERT,
    NEWTON_SCHRITTE,
    SCHRITT_GRENZE,
    RESTGLIED_GRENZE,
    BISEKTION_SCHRITTE,
    STUETZSTELLEN,
  }),
};
