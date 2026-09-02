// 4T-000382 (Epic 3E-000072): Mehrspalten-Container — Render der Spaltenzahl,
// Umbruch-Marker, Rueckfall bei ungueltiger Zahl, Reading-Paritaet.
// describe-Titel tragen die Funktions-IDs (MC-01 …); die Abdeckungs-Matrix-
// Eintraege liefert der Hilfe-/Handbuch-Task 4T-000384.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'mehrspalten.md');

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('MC-01: Mehrspalten-Block rendert die Spaltenzahl', () => {
  test('::: columns 2 und 5 erzeugen md-columns-<n>, +++ erzeugt den Umbruch', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.md-columns.md-columns-2')).toHaveCount(1);
      await expect(body.locator('.md-columns.md-columns-5')).toHaveCount(1);
      // Umbruch-Marker im 2-Spalten-Block.
      await expect(body.locator('.md-column-break')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('MC-02: Ungueltige Spaltenzahl faellt auf die neutrale Box zurueck', () => {
  test('::: columns 6 rendert custom-container container-columns statt md-columns', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const fallback = body.locator('.custom-container.container-columns');
      await expect(fallback).toHaveCount(1);
      await expect(fallback).not.toHaveClass(/md-columns/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('MC-03: Reading zeigt dieselbe Mehrspalten-Struktur', () => {
  test('nach Wechsel in die Reading-Ansicht bleibt md-columns-2 erhalten', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('rendered')).click();
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.md-columns.md-columns-2')).toHaveCount(1);
      await expect(body.locator('.md-column-break')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
