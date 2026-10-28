// 4T-002005 (Epic 3E-000333): Rechenregel des hebräischen Kalenders als Regel
// der Jahres-Struktur (Schnittstelle in calendar-yearly.js: name,
// namensStellen, jahresBeginn(jahr) → Tag, monate(jahr) → Monatsfolge; Jahr
// und Tag als BigInt). Blattartig: Das Modul lädt nichts, ruft weder den
// eingebauten Kalender der Laufzeit (Intl) noch das Netz auf und rechnet
// ganzzahlig, ohne Geltungs-Grenze (Epic A2).
//
// Quelle: «Calendrical Calculations» (Reingold/Dershowitz), Kapitel «The
// Hebrew Calendar», geschlossene Form. Der Kalender ist arithmetisch: mittlerer
// Mondmonat von 29 Tagen, 12 Stunden und 793 Teilen (1 Stunde = 1 080 Teile),
// Schaltmonat in 7 von 19 Jahren, vier Verschiebe-Regeln des Jahresbeginns.
//   Schaltjahr y           (7·y + 1) mod 19 < 7
//   vergangene Monate      ⌊(235·y − 234) / 19⌋
//   vergangene Teile       12 084 + 13 753 · Monate (1 Tag = 25 920 Teile)
//   Tage                   29 · Monate + ⌊Teile / 25 920⌋, und ein Tag mehr,
//                          wenn (3 · (Tage + 1)) mod 7 < 3 (Molad nach Mittag
//                          und «lo ADU Rosch» zusammen)
//   Korrektur              2, wenn das Folgejahr sonst 356 Tage hätte
//                          (GaTaRaD); 1, wenn das Vorjahr sonst 382 Tage hätte
//                          (BeTU-TaKPaT); sonst 0
//   Jahresbeginn           Epoche + Tage + Korrektur; Epoche = Rata Die
//                          −1 373 427 (1. Tischri 1 AM = 7. Oktober 3761 v. Chr.
//                          julianisch)
// Cheschwan hat 30 Tage in Jahren mit 355 oder 385 Tagen, Kislew 29 in Jahren
// mit 353 oder 383 Tagen.
//
// Monats-Kennung nach B1 (Epic A13): Tischri 1 … Schevat 5, Adar I = 5L,
// Adar (Gemeinjahr) beziehungsweise Adar II (Schaltjahr) = 6, Nisan 7 …
// Elul 12. Namens-Stellen (0-basiert, 14): 0 bis 11 Tischri bis Elul mit Adar
// an Stelle 5, 12 Adar I, 13 Adar II.
//
// Nachweis: test/unit/kalender-vorlage-hebraeisch.test.js — gegen die
// Kalender-Schnittstelle 1900 bis 2100 mit einer benannten Ausnahme
// (10.11.2045 bis 29.11.2046: Die Schnittstelle beginnt 5807 einen Tag später,
// die Regel folgt der Überlieferung) und gegen eine unabhängige klassische
// Form der vier Verschiebe-Regeln.
'use strict';

const EPOCHE = -1373427n;

// Abrunden auch bei negativem Zähler (Teiler stets positiv).
function floorDiv(a, b) {
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

function floorMod(a, b) {
  return a - floorDiv(a, b) * b;
}

function istSchaltjahr(jahr) {
  return floorMod(7n * jahr + 1n, 19n) < 7n;
}

// Tage von der Epoche bis zum Molad Tischri des Jahres, samt der ersten
// Verschiebung (Molad nach Mittag, «lo ADU Rosch»).
function vergangeneTage(jahr) {
  const monate = floorDiv(235n * jahr - 234n, 19n);
  const teile = 12084n + 13753n * monate;
  const tage = 29n * monate + floorDiv(teile, 25920n);
  return floorMod(3n * (tage + 1n), 7n) < 3n ? tage + 1n : tage;
}

// Korrektur der Jahreslänge (GaTaRaD, BeTU-TaKPaT).
function korrektur(jahr) {
  const vor = vergangeneTage(jahr - 1n);
  const dies = vergangeneTage(jahr);
  const nach = vergangeneTage(jahr + 1n);
  if (nach - dies === 356n) return 2n;
  if (dies - vor === 382n) return 1n;
  return 0n;
}

// Rata Die des 1. Tischri des Jahres.
function jahresBeginn(jahr) {
  return EPOCHE + vergangeneTage(jahr) + korrektur(jahr);
}

// Monatsfolge des Jahres in der Form der Schnittstelle.
function monate(jahr) {
  const laenge = jahresBeginn(jahr + 1n) - jahresBeginn(jahr);
  const langerCheschwan = laenge === 355n || laenge === 385n;
  const kurzerKislew = laenge === 353n || laenge === 383n;
  const out = [
    { length: 30, slot: 0, number: 1, leap: false }, // Tischri
    { length: langerCheschwan ? 30 : 29, slot: 1, number: 2, leap: false }, // Cheschwan
    { length: kurzerKislew ? 29 : 30, slot: 2, number: 3, leap: false }, // Kislew
    { length: 29, slot: 3, number: 4, leap: false }, // Tevet
    { length: 30, slot: 4, number: 5, leap: false }, // Schevat
  ];
  if (istSchaltjahr(jahr)) {
    out.push({ length: 30, slot: 12, number: 5, leap: true }); // Adar I
    out.push({ length: 29, slot: 13, number: 6, leap: false }); // Adar II
  } else {
    out.push({ length: 29, slot: 5, number: 6, leap: false }); // Adar
  }
  out.push(
    { length: 30, slot: 6, number: 7, leap: false }, // Nisan
    { length: 29, slot: 7, number: 8, leap: false }, // Ijjar
    { length: 30, slot: 8, number: 9, leap: false }, // Siwan
    { length: 29, slot: 9, number: 10, leap: false }, // Tammus
    { length: 30, slot: 10, number: 11, leap: false }, // Aw
    { length: 29, slot: 11, number: 12, leap: false }, // Elul
  );
  return out;
}

module.exports = Object.freeze({
  name: 'hebrew',
  namensStellen: 14,
  hoechstMonate: 13,
  hoechstLaenge: 30,
  jahresBeginn,
  monate,
});
