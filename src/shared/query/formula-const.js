'use strict';

// 4T-002454 (Epic 3E-000378, Story 4S-001140): Formel-Gruppe «Naturkonstanten»
// der Formel-Bibliothek, Namensraum `const.`, mit sieben Konstanten.
//
// **Form.** Wie `formula-health.js`: Das Modul liefert seine Gruppe als Daten
// `{ namespace, functions }` in der Form der Kern-Einträge (`arity: [min, max]`,
// reine `fn(args)`); die Liste der Bibliothek (`formula-library.js`) trägt sie
// ein, der Katalog registriert sie mit der Kennung der Erweiterung. Das Modul
// lädt den Katalog nicht.
//
// **Aufruf wie die Konstanten des Kerns.** Jede Konstante ist eine Funktion
// ohne Angaben mit Klammern, Stelligkeit `[0, 0]` wie `pi()` und `e()` in
// `query-functions.js`; eine überzählige Angabe wie `const.c(1)` weist der
// Katalog über die Stelligkeit ab (Story, AK7). Die Konstanten des Kerns liegen
// nicht hier und rechnen bei ausgeschalteter Erweiterung weiter.
//
// **Werte an einer Stelle, mit Quelle** (Fundstellen im Kapitel «Lösung» des
// Tasks, nachgeschlagen am 2026-10-31):
//
//   c   CODATA 2018, «speed of light in vacuum 299 792 458 (exact) m s^-1»
//   g   SI-Broschüre, 9. Auflage, Anhang 1, Erklärung der 3. CGPM 1901:
//       «standard acceleration due to gravity is 980.665 cm/s2»; ebenso
//       CODATA 2018, «standard acceleration of gravity 9.806 65 (exact)»
//   t0  SI-Broschüre, 9. Auflage, Abschnitt 2.3.1 (Kelvin): Bezugstemperatur
//       «T0 = 273.15 K», «t/°C = T/K − 273.15»
//   na  CODATA 2018, «Avogadro constant 6.022 140 76 e23 (exact) mol^-1»
//   r   CODATA 2018, «molar gas constant 8.314 462 618... (exact)»; der
//       vollständige exakte Wert ist das Produkt der Avogadro-Konstante mit der
//       Boltzmann-Konstante «1.380 649 e-23 (exact) J K^-1», also
//       8,31446261815324 J/(mol·K)
//   h   CODATA 2018, «Planck constant 6.626 070 15 e-34 (exact) J Hz^-1»
//   p0  SI-Broschüre, 9. Auflage, Anhang 1, Resolution 4 der 10. CGPM 1954:
//       «1 standard atmosphere = … 101 325 newtons per square metre»; ebenso
//       CODATA 2018, «standard atmosphere 101 325 (exact) Pa»; in hPa 1013,25
//
// Jeder Wert ist als Dezimal-Literal geschrieben, das die Quelle wörtlich
// nennt; die Gleitkomma-Zahl ist die nächstgelegene zu diesem Dezimalwert, und
// ihre Anzeige gibt genau diese Stellen wieder.
//
// Prozess-neutral (kein Electron, kein DOM).

// Die sieben Werte in der Einheit der Story-Tabelle: m/s, m/s², K, 1/mol,
// J/(mol·K), J·s und hPa.
const CONST_VALUES = Object.freeze({
  c: 299792458,
  g: 9.80665,
  t0: 273.15,
  na: 6.02214076e23,
  r: 8.31446261815324,
  h: 6.62607015e-34,
  p0: 1013.25,
});

const CONST_GROUP = Object.freeze({
  namespace: 'const',
  functions: Object.freeze(
    Object.fromEntries(
      Object.entries(CONST_VALUES).map(([name, wert]) => [
        `const.${name}`,
        { arity: [0, 0], fn: () => wert },
      ]),
    ),
  ),
});

module.exports = { CONST_GROUP, CONST_VALUES };
