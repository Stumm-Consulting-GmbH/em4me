// 4T-000480 (Epic 3E-000089): Teilstring-Filter der Kommando-Palette.
// Eigenstaendiges, DOM-freies Shared-Modul (CJS), damit die Such-/Filter-
// Komponente wiederverwendbar bleibt (Konzept-Festlegung 4T-000494: das
// Kommando-Platzierungs-Epic baut auf dieser Basis auf) und die Logik
// direkt in Node unit-testbar ist.
//
// v1 bewusst reiner Teilstring-Match ueber den lokalisierten Namen in
// stabiler Eingangs-Reihenfolge (Epic-Abgrenzung 3E-000089: kein Fuzzy-Match,
// kein Zuletzt-verwendet-Ranking).
'use strict';

// Normalisiert die Roh-Eingabe des Filterfelds: Trim plus locale-korrektes
// Lowercase (toLocaleLowerCase, damit z.B. tuerkisches I nicht falsch faellt).
function normalizeFilterQuery(query) {
  return String(query || '')
    .trim()
    .toLocaleLowerCase();
}

// Filtert Eintraege mit label-Feld per Teilstring ueber die normalisierte
// Query. Leere Query liefert alle Eintraege; Rueckgabe ist immer eine neue
// Array-Instanz in stabiler Reihenfolge.
function filterCommandEntries(entries, query) {
  const list = Array.isArray(entries) ? entries : [];
  const needle = normalizeFilterQuery(query);
  if (!needle) return list.slice();
  return list.filter((e) =>
    String((e && e.label) || '')
      .toLocaleLowerCase()
      .includes(needle),
  );
}

module.exports = { normalizeFilterQuery, filterCommandEntries };
