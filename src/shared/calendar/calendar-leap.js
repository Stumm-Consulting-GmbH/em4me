// 4T-002001 (Epic 3E-000307): Schalt-Rechnung der Kalender-Systeme als
// eigenes, blattartiges Modul. Der Kalender-Kern (calendar-core.js) lädt es;
// es selbst lädt nichts aus dem Ordner.
//
// Zwei Formen der Schalt-Regel an einer Schalt-Ebene, genau eine davon:
//   rules    Teilbarkeits-Kette geschachtelter Zyklen (Bestand aus 4T-000542,
//            aus dem Kern hierher umgezogen, Verhalten unverändert): jeder
//            Zyklus ein Vielfaches des vorigen, „letzter Treffer entscheidet",
//            gerader Regel-Index = Schaltjahr (alle 4, außer alle 100, außer
//            alle 400).
//   pattern  { cycle, years }: Schaltjahre als Plätze in einem Zyklus von
//            cycle Jahren, gezählt ab 1 (tabellarischer islamischer Kalender:
//            2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 von 30). Das Jahr mit der
//            internen Zählung J steht auf dem Platz floorMod(J − 1, cycle) + 1.
//
// Schnittstelle (die Rechen-Funktionen nehmen die Rechen-Information aus
// leapRuleInfo und Jahres-Zahlen als BigInt):
//   normalizeLeapRule(raw)   { rules } | { pattern } | null
//   leapRuleInfo(rel)        Rechen-Information einer normalisierten Ebene
//   isLeapYear(info, Y)      Schaltjahr ja/nein
//   leapsBefore(info, Y)     Anzahl Schaltjahre in [0, Y), für negatives Y
//                            vorzeichenbehaftet über [Y, 0)
//   info.period              Periode der Schalt-Rechnung in Jahren (BigInt)
//
// Die vier kleinen Grund-Helfer stehen hier als eigene Fassungen, obwohl der
// Kern gleichnamige führt: floorDiv und floorMod exportiert der Kern nicht,
// und ein Laden des Kerns von hier aus ergäbe einen Lade-Kreis
// Kern → Schalt-Modul → Kern. Vier Zeilen Doppelung sind der kleinere Preis.
'use strict';

function isInt(v) {
  return Number.isSafeInteger(v);
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v >= 1;
}

function floorDiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

function floorMod(a, b) {
  return a - floorDiv(a, b) * b;
}

// --- Normalisierung ----------------------------------------------------------------

// Schalt-Zyklen: nicht-leere Liste, streng aufsteigend, jeder Zyklus ein
// Vielfaches des vorigen (nur so ist die „letzter Treffer entscheidet"-
// Semantik eindeutig und die Jahres-Summe geschlossen berechenbar).
function normalizeRules(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rules = [];
  for (const entry of raw) {
    const cycle =
      typeof entry === 'number' ? entry : entry && typeof entry === 'object' ? entry.cycle : null;
    if (!isPosInt(cycle)) return null;
    rules.push({ cycle });
  }
  for (let i = 1; i < rules.length; i++) {
    if (rules[i].cycle <= rules[i - 1].cycle || rules[i].cycle % rules[i - 1].cycle !== 0) {
      return null;
    }
  }
  return rules;
}

// Muster: cycle positive ganze Zahl; years nicht leer, ganze Zahlen von 1 bis
// cycle, keine doppelt. Abgelegt wird eine aufsteigend sortierte Kopie.
function normalizePattern(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isPosInt(raw.cycle) || !Array.isArray(raw.years) || raw.years.length === 0) return null;
  const years = raw.years.slice().sort((a, b) => a - b);
  for (let i = 0; i < years.length; i++) {
    if (!isInt(years[i]) || years[i] < 1 || years[i] > raw.cycle) return null;
    if (i > 0 && years[i] === years[i - 1]) return null;
  }
  return { cycle: raw.cycle, years };
}

// Regel-Teil einer Schalt-Ebene: genau eine der beiden Formen. Fehlt ein Feld
// (undefined oder null), gilt es als nicht angegeben; beide zugleich oder
// keines machen die Ebene ungültig. Das Ergebnis trägt nur das eine Feld,
// damit bestehende Definitionen Zeichen für Zeichen unverändert bleiben.
function normalizeLeapRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const hasRules = raw.rules != null;
  const hasPattern = raw.pattern != null;
  if (hasRules === hasPattern) return null;
  if (hasRules) {
    const rules = normalizeRules(raw.rules);
    return rules ? { rules } : null;
  }
  const pattern = normalizePattern(raw.pattern);
  return pattern ? { pattern } : null;
}

// --- Rechnung ------------------------------------------------------------------------

// Rechen-Information aus einer normalisierten Schalt-Ebene (rel mit rules
// oder pattern). Beim Muster gibt es bewusst keine Tabelle über alle Plätze
// des Zyklus: Die Anzahl im angebrochenen Zyklus zählt die sortierte
// Jahres-Liste ab, damit ein langer Zyklus keinen Speicher bindet.
function leapRuleInfo(rel) {
  if (rel.pattern) {
    const years = rel.pattern.years.map((y) => BigInt(y));
    const cycle = BigInt(rel.pattern.cycle);
    return {
      kind: 'pattern',
      cycle,
      years,
      places: new Set(rel.pattern.years),
      hits: BigInt(years.length),
      // Trägt der letzte Platz des Zyklus ein Schaltjahr, liegt es vor Jahr 0
      // auf dem Platz cycle (Jahr 0 ≙ Platz cycle).
      lastIsLeap: years[years.length - 1] === cycle ? 1n : 0n,
      period: cycle,
    };
  }
  const cycles = rel.rules.map((r) => BigInt(r.cycle));
  return { kind: 'rules', cycles, period: cycles[cycles.length - 1] };
}

// Anzahl der Plätze aus der sortierten Liste, die höchstens r sind.
function placesUpTo(years, r) {
  let lo = 0;
  let hi = years.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (years[mid] <= r) lo = mid + 1;
    else hi = mid;
  }
  return BigInt(lo);
}

// Kumulierte Treffer des Musters über den Platz-Index k = J − 1: Anzahl der
// Schaltjahre mit Index in [0, K), für negatives K vorzeichenbehaftet —
// volle Zyklen mal Treffer je Zyklus plus die Treffer im angebrochenen.
function patternCount(info, K) {
  const full = floorDiv(K, info.cycle);
  return full * info.hits + placesUpTo(info.years, K - full * info.cycle);
}

function isLeapYear(info, Y) {
  if (info.kind === 'pattern') {
    return info.places.has(Number(floorMod(Y - 1n, info.cycle)) + 1);
  }
  const cycles = info.cycles;
  for (let i = cycles.length - 1; i >= 0; i--) {
    if (floorMod(Y, cycles[i]) === 0n) return i % 2 === 0;
  }
  return false;
}

// Teilbarkeits-Kette: Einschluss-Ausschluss über die geschachtelten Zyklen;
// die Anzahl der Vielfachen von cycle in [0, Y) ist floorDiv(Y + cycle - 1,
// cycle). Muster: Jahre [0, Y) sind die Indizes [−1, Y − 1), also
// patternCount(Y − 1) − patternCount(−1), und patternCount(−1) ist −lastIsLeap.
function leapsBefore(info, Y) {
  if (info.kind === 'pattern') return patternCount(info, Y - 1n) + info.lastIsLeap;
  let sum = 0n;
  for (let i = 0; i < info.cycles.length; i++) {
    const term = floorDiv(Y + info.cycles[i] - 1n, info.cycles[i]);
    sum += i % 2 === 0 ? term : -term;
  }
  return sum;
}

module.exports = {
  normalizeLeapRule,
  leapRuleInfo,
  isLeapYear,
  leapsBefore,
};
