// 4T-000166: Playwright-Konfiguration fuer E2E-Tests gegen die Electron-App
// (Dev-Stand: `electron .` nach build:renderer, siehe pretest:e2e-Script).
//
// Stabilitaets-Entscheidungen (siehe test/README.md):
// - workers: 1        — Electron-Instanzen nicht parallelisieren.
// - retries: 0        — Flakiness sichtbar machen statt maskieren.
// - forbidOnly: true  — vergessene .only-Marker brechen den Lauf.
// - Diagnose-Artefakte nur im Fehlerfall; im autonomen Umsetzungs-Modus
//   sind Failure-Screenshots/-Traces das primaere Diagnose-Mittel.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/e2e',
  // 4T-001191: Der Pflicht-Zugang ist der einzige Weg fuer einen Voll-Lauf.
  // Dasselbe Modul wie in vitest.config.mjs; es traegt beide Setup-Formen,
  // weil Playwright das Modul selbst als Funktion ruft und Vitest den
  // benannten Export `setup`.
  globalSetup: require.resolve('./scripts/gate-zugang.js'),
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 4T-000782 (Epic 3E-000156): Der json-Reporter liefert scripts/test-kennzahlen.js
  // die Zahl der tatsaechlich ausgefuehrten Faelle (siehe vitest.config.mjs).
  // Ziel ist test-berichte/, weil outputDir (test-results/) zu Beginn jedes
  // Laufs geleert wird. ACHTUNG: Ein --reporter-Schalter auf der Kommando-
  // zeile ERSETZT diese Liste; ein Lauf mit --reporter=line schreibt keinen
  // Bericht. Der Voll-Lauf vor einem Release laeuft deshalb ohne Schalter.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-berichte/e2e.json' }],
  ],
  outputDir: 'test-results',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
