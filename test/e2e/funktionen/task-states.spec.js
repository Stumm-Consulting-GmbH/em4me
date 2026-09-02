// 4T-000204 (Epic 3E-000017): Erweiterte Task-States — Render, Klick-Toggle,
// Settings-Roundtrip (Custom-Status, Deaktivieren). describe-Titel tragen
// die Matrix-IDs (TS-01 …) fuer test/abdeckungs-matrix.json.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'task-states.md');
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// 4T-000279: Task-Status-Bereich der Einstellungs-Seite oeffnen. Zugang
// ueber das Verdrahtungs-Event der System-Seiten (Muster
// scg:open-manual-page; deterministisch, unabhaengig vom Menue-Fokus).
async function openTaskStatesSection(page) {
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'settings' } }),
    );
  });
  await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
  await page.locator('.settings-nav-entry[data-section-id="taskStates"]').click();
  await expect(page.locator('#settings-task-states-list')).toBeVisible();
}

test.describe('TS-01: Erweiterte Task-States rendern', () => {
  test('- [/] zeigt eine Status-Box, Bestand und unbekannte Zeichen bleiben', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      // Default-Status `/` rendert als Status-Box mit Glyph.
      const box = body.locator('.task-state-box[data-task-state="/"]');
      await expect(box).toBeVisible();
      await expect(box).toHaveText('/');
      // Bestands-Checkboxen bleiben unveraendert.
      await expect(body.locator('input.task-list-item-checkbox')).toHaveCount(2);
      // `[+]` ist im Default-Set nicht aktiviert -> Roh-Text.
      await expect(body.locator('li', { hasText: 'geplant' })).toContainText('[+] geplant');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-02: Klick-Toggle der Status-Box', () => {
  test('Klick auf die Status-Box setzt den Quelltext auf [x]', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await body.locator('.task-state-box[data-task-state="/"]').click();
      // Quelltext wurde auf [x] gesetzt; die Zeile rendert als erledigte
      // Checkbox (Reading-Pane wird nach State-Toggle neu gerendert).
      const line = body.locator('li', { hasText: 'in Arbeit' });
      await expect(line.locator('input.task-list-item-checkbox')).toBeChecked();
      await expect(body.locator('.task-state-box[data-task-state="/"]')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-03: Custom-Status ueber die Einstellungen', () => {
  test('Custom-Status [+] anlegen, Render folgt sofort', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('li', { hasText: 'geplant' })).toContainText('[+] geplant');
      // 4T-000279: Task-Status-Bereich der Einstellungs-Seite oeffnen
      // (Verdrahtungs-Event, Muster scg:open-manual-page).
      await openTaskStatesSection(page);
      await page.locator('#btn-task-state-add').click();
      const lastRow = page.locator('#settings-task-states-list .task-state-row').last();
      await lastRow.locator('.ts-char').fill('+');
      await lastRow.locator('.ts-label').fill('Geplant');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Render folgt: [+] erscheint als Status-Box.
      const plusBox = body.locator('.task-state-box[data-task-state="+"]');
      await expect(plusBox).toBeVisible();
      await expect(plusBox).toHaveAttribute('title', 'Geplant');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-04: Status deaktivieren stellt Roh-Text wieder her', () => {
  test('Deaktivierter Default-Status rendert wieder als [/]-Text', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.task-state-box[data-task-state="/"]')).toBeVisible();
      // 4T-000279: Task-Status-Bereich der Einstellungs-Seite, siehe TS-03.
      await openTaskStatesSection(page);
      // Erste Default-Zeile ist `/` (Reihenfolge des Default-Sets).
      const firstRow = page.locator('#settings-task-states-list .task-state-row').first();
      await expect(firstRow.locator('.ts-char')).toHaveValue('/');
      await firstRow.locator('.ts-enabled').uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      await expect(body.locator('.task-state-box[data-task-state="/"]')).toHaveCount(0);
      await expect(body.locator('li', { hasText: 'in Arbeit' })).toContainText('[/] in Arbeit');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-000497 (Epic 3E-000090): Ketten-Toggle ueber das konfigurierbare Folge-
// Symbol und Live-Warnung bei doppelt belegten Zeichen.
test.describe('TS-05: Ketten-Toggle ueber das Folge-Symbol', () => {
  test('Folge-Symbol der /-Zeile auf - gesetzt: Klick toggelt auf [-] statt [x]', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.task-state-box[data-task-state="/"]')).toBeVisible();
      await openTaskStatesSection(page);
      const firstRow = page.locator('#settings-task-states-list .task-state-row').first();
      await expect(firstRow.locator('.ts-char')).toHaveValue('/');
      // Folge-Symbol der /-Zeile (IN_PROGRESS) auf '-' (CANCELLED) setzen.
      await firstRow.locator('.ts-next').fill('-');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Klick folgt der Kette: aus [/] wird [-] (Quelltext), nicht hart [x].
      await body.locator('.task-state-box[data-task-state="/"]').click();
      await expect(body.locator('.task-state-box[data-task-state="-"]')).toBeVisible();
      await expect(body.locator('.task-state-box[data-task-state="/"]')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TS-06: Duplikat-Warnung im Task-Status-Bereich', () => {
  test('Doppeltes Zeichen zeigt die Warnung, OK schliesst die Sektion nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await openTaskStatesSection(page);
      await page.locator('#btn-task-state-add').click();
      const lastRow = page.locator('#settings-task-states-list .task-state-row').last();
      // '/' ist bereits als Builtin belegt -> Duplikat.
      await lastRow.locator('.ts-char').fill('/');
      const warning = page.locator('#settings-task-states-warning');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText('/');
      // OK blockiert (Validierungs-Fehler), die Sektion bleibt offen.
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      await expect(page.locator(`${SETTINGS_PAGE} .settings-section-error`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
