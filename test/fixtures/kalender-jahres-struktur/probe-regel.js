// 4T-002363 (Epic 3E-000333): Probe-Regel der Jahres-Struktur (erfunden).
// Rechnet ganzzahlig und ohne Grenze in beide Richtungen:
//   - Zyklus von 19 Jahren; auf den Plätzen 2, 5, 7, 10, 13, 16, 18 (Platz =
//     floorMod(Jahr, 19)) folgt auf den 6. Monat ein Schaltmonat von 30 Tagen;
//   - der 2. Monat hat 30 statt 29 Tage in jedem Jahr, das durch 3 teilbar ist;
//   - Grundjahr: zwölf Monate abwechselnd 30 und 29 Tage (354 Tage).
// Der Jahresbeginn wandert damit gegenüber dem gregorianischen Jahr. Das Jahr
// 0 beginnt am Tag 730 155 der Rata-Die-Zählung (05.02.2000).
const BEGINN_JAHR_0 = 730155n;
const SCHALT_PLAETZE = [2, 5, 7, 10, 13, 16, 18];

function floorDiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

function floorMod(a, b) {
  return a - floorDiv(a, b) * b;
}

function istSchaltjahr(jahr) {
  return SCHALT_PLAETZE.includes(Number(floorMod(jahr, 19n)));
}

// Schaltjahre in [0, jahr), für negatives Jahr vorzeichenbehaftet über [jahr, 0).
function schaltjahreVor(jahr) {
  const platz = Number(floorMod(jahr, 19n));
  const imZyklus = SCHALT_PLAETZE.filter((p) => p < platz).length;
  return 7n * floorDiv(jahr, 19n) + BigInt(imZyklus);
}

// Durch 3 teilbare Jahre in [0, jahr), ebenso vorzeichenbehaftet.
function langeJahreVor(jahr) {
  return -floorDiv(-jahr, 3n);
}

function jahresBeginn(jahr) {
  return BEGINN_JAHR_0 + 354n * jahr + 30n * schaltjahreVor(jahr) + langeJahreVor(jahr);
}

function monate(jahr) {
  const out = [];
  for (let n = 1; n <= 12; n++) {
    let length = n % 2 === 1 ? 30 : 29;
    if (n === 2 && floorMod(jahr, 3n) === 0n) length = 30;
    out.push({ length, slot: n - 1, number: n, leap: false });
    if (n === 6 && istSchaltjahr(jahr)) out.push({ length: 30, slot: 12, number: 6, leap: true });
  }
  return out;
}

export default {
  name: 'probe',
  namensStellen: 13,
  hoechstMonate: 13,
  hoechstLaenge: 30,
  jahresBeginn,
  monate,
};
