// 4T-000484 (Epic 3E-000088): Undo-Härtung des Checkbox-/Status-Box-Toggles aus
// dem Gerenderten. Der Toggle-Dispatch lief ohne userEvent-Annotation und
// verschmolz in der Editor-Historie mit dem vorherigen Ereignis (typisch dem
// initialen Doc-Set beim Öffnen): ein Strg+Z nach dem Klick leerte das ganze
// Dokument statt nur den Toggle zurückzunehmen. Die Fälle prüfen Checkbox,
// erweiterte Status-Box (Render-Pane) und den Live-Modus-Toggle.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'regression', '4t-0484.md');

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// In den Edit-Modus wechseln, Editor fokussieren, Strg+Z senden.
async function undoInSourceMode(page) {
  await page.locator(SEL.btnEdit).click();
  await page.locator(SEL.editorContent0).click();
  await page.keyboard.press('Control+z');
}

test.describe('4T-000484: Undo nach Checkbox-Toggle aus dem Render-Pane', () => {
  test('Strg+Z nimmt genau den Toggle zurück, das Dokument bleibt intakt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      const checkbox = body.locator('input.task-list-item-checkbox').first();
      await checkbox.click();
      await expect(checkbox).toBeChecked();
      await undoInSourceMode(page);
      const editor = page.locator(SEL.editorContent0);
      // Kern der Regression: das Dokument ist NICHT geleert, nur der
      // Toggle ist zurückgenommen.
      await expect(editor).toContainText('- [ ] Offene Aufgabe');
      await expect(editor).toContainText('Schlusszeile bleibt erhalten.');
      await expect(editor).toContainText('Einleitungszeile mit Bestandstext.');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('Status-Box-Klick ([/] -> [x]) ist ebenso eine eigene Undo-Einheit', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await body.locator('.task-state-box[data-task-state="/"]').click();
      // Nach dem Abschließen rendert die Zeile als erledigte Checkbox.
      await expect(body.locator('.task-state-box[data-task-state="/"]')).toHaveCount(0);
      await undoInSourceMode(page);
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toContainText('- [/] Aufgabe in Arbeit');
      await expect(editor).toContainText('Schlusszeile bleibt erhalten.');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('4T-000484: Undo nach Task-Toggle im Live-Modus', () => {
  test('Strg+Z nach Live-Klick nimmt nur den Toggle zurück', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.viewBtn('live')).click();
      const editor = page.locator(SEL.editorContent0);
      // Live-Dekoration des offenen Task-Markers anklicken (Toggle [ ] -> [x]).
      // Der Marker-Span traegt font-size:0 (die Checkbox zeichnet ::before),
      // gilt fuer Playwright daher als "hidden" — force-Klick auf die Mitte.
      // Zwei dekorierte Task-Zeilen im Fixture (Checkbox + Status-Box); hier
      // gezielt die reine Checkbox (ohne data-live-task-state).
      const liveBox = editor.locator('[data-live-task-from]:not([data-live-task-state])');
      await expect(liveBox).toHaveCount(1);
      await liveBox.click({ force: true });
      // Toggle wirksam: die Dekoration meldet den Marker als erledigt.
      await expect(editor.locator('[data-live-task-checked="true"]')).toHaveCount(1);
      // Editor fuer das Tastatur-Undo fokussieren (der preventDefault des
      // Toggle-Handlers unterbindet die Fokus-Setzung des force-Klicks);
      // Klick in die neutrale Schlusszeile aendert nur die Selektion.
      await editor.getByText('Schlusszeile bleibt erhalten.').click();
      await page.keyboard.press('Control+z');
      // Dokument intakt, Marker wieder offen.
      await expect(editor.locator('[data-live-task-checked="true"]')).toHaveCount(0);
      await expect(editor).toContainText('Schlusszeile bleibt erhalten.');
      await expect(editor).toContainText('Einleitungszeile mit Bestandstext.');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
