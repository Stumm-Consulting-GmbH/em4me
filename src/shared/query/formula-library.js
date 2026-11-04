'use strict';

// 4T-002449 (Epic 3E-000378, Story 4S-001124): Die Liste der Formel-Bibliothek.
//
// **Was hier steht.** Die Kennung der Erweiterung «Formel-Bibliothek», der eine
// Meldungs-Schlüssel ihres Aus-Zustands und die Liste ihrer Funktions-Gruppen.
// Der Funktions-Katalog (`query-functions.js`) lädt die Liste beim Laden und
// registriert jede Gruppe mit dieser Kennung; geprüft wird dabei, was jede
// Registrierung prüft (Namensraum, Kollision mit dem Kern und mit anderen
// Gruppen).
//
// **Warum eine eigene Datei.** Jede Kategorie der Bibliothek wird ein eigenes
// Modul, das ihre Gruppe als Daten ausführt, `{ namespace, functions }` in der
// Form der Kern-Einträge (`arity: [min, max]`, reine `fn(args, ctx)`). Die
// Kategorie-Module laden den Katalog nicht; die Richtung ist Katalog → Liste →
// Kategorie, damit entsteht kein Kreis, und das Katalog-Modul wächst mit den
// Formeln nicht mit. In Stufe 1 des Epics war die Liste leer; seit 4T-002451
// trägt sie die Gruppe «Feuchte und Taupunkt», seit 4T-002452 die Gruppe
// «Finanzmathematik», seit 4T-002453 die Gruppen «Prozentrechnung»,
// «Einheiten-Umrechnung» und «Gesundheit», seit 4T-002454 die Gruppe
// «Naturkonstanten».
//
// **Die Kennung steht zweimal**, hier und als Eintrag der Registry
// (`src/shared/extensions/extensions.js`); ein Prüffall hält beide gleich
// (Muster `CHART_EXTENSION_ID` in `perspective-chart.js`). Der Katalog lädt die
// Registry bewusst nicht: Er ist prozess-neutral und kennt nur die Menge der
// ausgeschalteten Kennungen, die ihm die Setz-Stellen reichen.
//
// Prozess-neutral (kein Electron, kein DOM); lädt allein die Kategorie-Module.

// 4T-002451: Feuchte und Taupunkt (Namensraum `humidity.`).
const { HUMIDITY_GROUP } = require('./formula-humidity.js');
// 4T-002452: Finanzmathematik (Namensraum `finance.`).
const { FINANCE_GROUP } = require('./formula-finance.js');
// 4T-002453: Prozentrechnung, Einheiten-Umrechnung und Body-Mass-Index
// (Namensräume `percent.`, `unit.` und `health.`).
const { PERCENT_GROUP } = require('./formula-percent.js');
const { UNIT_GROUP } = require('./formula-unit.js');
const { HEALTH_GROUP } = require('./formula-health.js');
// 4T-002454: Naturkonstanten (Namensraum `const.`).
const { CONST_GROUP } = require('./formula-const.js');

const FORMULA_LIBRARY_EXTENSION_ID = 'formula-library';

// Der Hinweis an der Stelle des Ergebnisses, wenn eine Formel der Bibliothek
// bei ausgeschalteter Erweiterung aufgerufen wird; ein Text, ein Schlüssel für
// alle Rechen-Orte (Schritt 4 des Plans).
const FORMULA_LIBRARY_OFF_KEY = 'query.formulaLibraryOff';

// Die Gruppen der Bibliothek, eingetragen von den Formel-Tasks der Stufen 2
// und 3. Eingefroren, damit kein Aufrufer an der Registrierung vorbei Gruppen
// erfindet.
const FORMULA_LIBRARY_GROUPS = Object.freeze([
  HUMIDITY_GROUP,
  FINANCE_GROUP,
  PERCENT_GROUP,
  UNIT_GROUP,
  HEALTH_GROUP,
  CONST_GROUP,
]);

module.exports = {
  FORMULA_LIBRARY_EXTENSION_ID,
  FORMULA_LIBRARY_OFF_KEY,
  FORMULA_LIBRARY_GROUPS,
};
