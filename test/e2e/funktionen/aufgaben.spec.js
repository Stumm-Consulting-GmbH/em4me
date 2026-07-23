// 4T-0498 (Epic 3E-0090): Erweiterung „Aufgaben" — Task-Marker-Badges in
// Render-Pane und Live-Modus, Automatik-Datum beim Statuswechsel und der
// Global Filter. describe-Titel tragen die Funktions-IDs (AU-01 …); ein
// Matrix-Eintrag folgt erst mit den help.feature-Keys in 4T-0500.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'aufgaben.md');
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Heutiges Datum als lokales ISO-Datum — dieselbe Ableitung wie todayIsoDate
// im Produktivpfad (tasks.js); die App laeuft im selben Prozess-Zeitkontext.
function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Einstellungs-Bereich „Aufgaben" oeffnen (Muster openTaskStatesSection;
// Verdrahtungs-Event der System-Seiten, deterministisch).
async function openTasksSection(page) {
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'settings' } }),
    );
  });
  await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
  await page.locator('.settings-nav-entry[data-section-id="tasks"]').click();
  await expect(page.locator('#settings-tasks-global-filter')).toBeVisible();
}

test.describe('AU-01: Task-Marker-Badges im Render-Pane', () => {
  test('faellige Termine erscheinen als Badge, ueberfaellige rot markiert', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      // Faellig-Badge der Zukunfts-Zeile ist sichtbar.
      const openLine = body.locator('li', { hasText: 'Offene Aufgabe' });
      await expect(openLine.locator('.task-marker-due')).toBeVisible();
      // Die ueberfaellige Zeile (2020) traegt die Overdue-Klasse.
      const overdue = body.locator('li', { hasText: 'Ueberfaellige Aufgabe' });
      await expect(overdue.locator('.task-marker-overdue')).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AU-02: Erledigt-Automatik beim Checkbox-Klick', () => {
  test('Klick auf die 📅-Zeile schreibt ✅ mit heutigem Datum in den Quelltext', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const openLine = body.locator('li', { hasText: 'Offene Aufgabe' });
      await openLine.locator('input.task-list-item-checkbox').click();
      // Quelltext-Pruefung: in den Split-Modus wechseln (renderPaneContent
      // baut das Render-DOM aus dem aktualisierten tab.content neu auf).
      await page.locator(SEL.viewBtn('split')).click();
      await expect(page.locator(SEL.editorContent0)).toContainText(`✅ ${todayIso()}`);
      // Die Zeile zeigt danach ein Erledigt-Badge im Render-Pane.
      await expect(openLine.locator('.task-marker-done')).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AU-03: Global Filter blendet Nicht-Task-Zeilen aus', () => {
  test('Filter #task laesst nur Badges der passenden Zeilen bestehen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const filtered = body.locator('li', { hasText: 'Markierte Aufgabe' });
      const unfiltered = body.locator('li', { hasText: 'Freie Aufgabe' });
      // Vor dem Filter tragen beide Zeilen ein Faellig-Badge.
      await expect(filtered.locator('.task-marker-due')).toBeVisible();
      await expect(unfiltered.locator('.task-marker-due')).toBeVisible();
      // Global Filter setzen und anwenden.
      await openTasksSection(page);
      await page.locator('#settings-tasks-global-filter').fill('#task');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Nur die #task-Zeile bleibt Aufgabe; die andere verliert ihr Badge.
      await expect(filtered.locator('.task-marker-due')).toBeVisible();
      await expect(unfiltered.locator('.task-marker-due')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0499 (Epic 3E-0090): Wiederholung beim Abschluss — der Klick auf die
// Checkbox einer wiederkehrenden Task erzeugt die naechste Instanz
// (Standard-Einfuegeposition oberhalb) in derselben Transaktion wie den
// Status-Wechsel samt Erledigt-Datum.
test.describe('AU-05: Wiederholung erzeugt die Folge-Instanz', () => {
  test('Abschluss der 🔁-Zeile fuegt die neue Instanz oberhalb ein', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const line = body.locator('li', { hasText: 'Wiederkehrende Aufgabe' });
      await line.first().locator('input.task-list-item-checkbox').first().click();
      // Quelltext-Pruefung im Split-Modus: neue Instanz (⏳ + 7 Tage,
      // offenes Kern-Zeichen) steht ueber der erledigten Zeile.
      await page.locator(SEL.viewBtn('split')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toContainText('⏳ 2099-06-08');
      await expect(editor).toContainText(`✅ ${todayIso()}`);
      const text = await editor.innerText();
      const idxNew = text.indexOf('⏳ 2099-06-08');
      const idxDone = text.indexOf('⏳ 2099-06-01');
      expect(idxNew).toBeGreaterThanOrEqual(0);
      expect(idxDone).toBeGreaterThan(idxNew);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AU-04: Task-Marker-Badges im Live-Modus', () => {
  test('nach Wechsel in den Live-Modus erscheint das Badge-Widget im Editor', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const badge = page.locator(`${SEL.paneSource0} .cm-live-task-marker-badge`);
      await expect(badge.first()).toBeVisible({ timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
