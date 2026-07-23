// 4T-0166: Vitest-Konfiguration fuer Unit- und Snapshot-Tests.
// E2E-Tests laufen separat ueber Playwright (playwright.config.js).
//
// .mjs, weil Vitest 4 ESM-only ist und das Projekt selbst CommonJS bleibt
// (kein "type": "module" in package.json). Testdateien unter test/unit/
// verwenden ebenfalls ESM-Syntax; Vitest transformiert sie unabhaengig
// vom Modul-Typ des Projekts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.js'],
    environment: 'node',
    // .only-Schutz: vergessene Fokus-Marker lassen `npm test` fehlschlagen.
    // Fokussiertes Entwickeln laeuft ueber `npm run test:watch` (--allowOnly).
    allowOnly: false,
    // 4T-0356: Datei-Parallelitaet begrenzen. Ohne Limit startet Vitest bis zu
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
