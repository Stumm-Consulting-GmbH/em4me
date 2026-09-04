// 4T-000166: Vitest-Konfiguration fuer Unit- und Snapshot-Tests.
// E2E-Tests laufen separat ueber Playwright (playwright.config.js).
//
// .mjs, weil Vitest 4 ESM-only ist und das Projekt selbst CommonJS bleibt
// (kein "type": "module" in package.json). Testdateien unter test/unit/
// verwenden ebenfalls ESM-Syntax; Vitest transformiert sie unabhaengig
// vom Modul-Typ des Projekts.
import { defineConfig } from 'vitest/config';

// 4T-001321 (Weg B, Entscheidung des Product Owners vom 2026-09-03): Die
// teuren Bau-Faelle — sie bauen Webseite oder Handbuch innerhalb eines Falls
// und tragen BAU_ZEITLIMIT bzw. VOLLBAU_ZEITLIMIT aus test/zeitlimits.js —
// laufen nicht mehr nebenlaeufig zum Rest. Jede neue Pruefdatei erhoehte die
// Last fuer alle uebrigen, und ein Bau-Fall, der isoliert weit unter seinem
// Limit lag, riss es im Voll-Lauf (sieben Vorfaelle seit dem 2026-07-25,
// zuletzt am 2026-08-30 durch zwei neue Pruefdateien mit 217 ms Rechenzeit).
// Zwei Projekte mit Gruppen-Reihenfolge: erst alle uebrigen Dateien parallel,
// danach die Bau-Faelle seriell auf einem ruhigen Rechner. Die absoluten
// Limits bleiben als Haenger-Erkennung scharf. Wer einen neuen Bau-Fall
// schreibt, traegt seine Datei hier ein; test/unit/test-zeitlimits.test.js
// haelt die Liste gegen die Nutzer der Bau-Limits.
export const TEURE_BAU_DATEIEN = [
  'test/unit/web-handbuch.test.js',
  'test/unit/web-inhalte.test.js',
  'test/unit/web-kennzahlen.test.js',
  'test/unit/web-roadmap.test.js',
];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'leicht',
          include: ['test/unit/**/*.test.js'],
          exclude: ['**/node_modules/**', ...TEURE_BAU_DATEIEN],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'bau',
          include: TEURE_BAU_DATEIEN,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    environment: 'node',
    // 4T-001191: Der Pflicht-Zugang ist der einzige Weg fuer einen Voll-Lauf.
    // Ein Aufruf mit Datei- oder Muster-Argument gilt als freie
    // Entwicklungs-Iteration und laeuft unveraendert durch; Begruendung und
    // Abgrenzung stehen in scripts/gate-zugang.js.
    globalSetup: ['./scripts/gate-zugang.js'],
    // 4T-000782 (Epic 3E-000156): Zusaetzlich zum Konsolen-Bericht ein
    // Maschinen-Bericht, aus dem scripts/test-kennzahlen.js die Zahl der
    // tatsaechlich ausgefuehrten Faelle liest. Die statische Quelltext-
    // Zaehlung der Webseiten-Kennzahl konnte das nicht leisten, weil
    // schleifen- und .each-erzeugte Faelle einmal im Quelltext stehen und
    // vielfach laufen.
    //
    // Ziel ist test-berichte/ und ausdruecklich NICHT test-results/: Diesen
    // Ordner leert Playwright zu Beginn jedes Laufs, der Unit-Bericht waere
    // nach dem naechsten E2E-Lauf verschwunden.
    reporters: ['default', ['json', { outputFile: 'test-berichte/unit.json' }]],
    // .only-Schutz: vergessene Fokus-Marker lassen `npm test` fehlschlagen.
    // Fokussiertes Entwickeln laeuft ueber `npm run test:watch` (--allowOnly).
    allowOnly: false,
    // 4T-000356: Datei-Parallelitaet begrenzen. Ohne Limit startet Vitest bis zu
    // CPU-viele Fork-Worker gleichzeitig (hier 32 logische Prozessoren). Die
    // dadurch erzeugte CPU- und Datei-I/O-Last liess unter Voll-Last den
    // I/O-intensiven Backlinks-Cap-Test (2001 Dateien) sein Zeitbudget reissen
    // und teils Worker-Starts scheitern (sichtbar an environment-Zeiten > 700 s).
    // Ein moderates, systemunabhaengiges Limit haelt den Lauf stabil gruen bei
    // nahezu gleicher Gesamtlaufzeit (Suite rund eine Minute).
    maxWorkers: 4,
    minWorkers: 1,
  },
});
