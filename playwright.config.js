// 4T-0166: Playwright-Konfiguration fuer E2E-Tests gegen die Electron-App
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
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
