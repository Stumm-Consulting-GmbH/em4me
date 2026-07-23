// 4T-0479 (Epic 3E-0089): %%-Kommentare — End-to-End ueber die drei
// Ansichten. Privater Text zwischen %%-Markern erscheint in keiner
// gerenderten Ansicht, bleibt aber Quelltext; im Quelltext-Modus faerbt
// die App die Marker (.cm-comment-marker), im Live-Modus blendet sie den
// Kommentar auf inaktiven Zeilen aus (.cm-live-marker-hidden).
// describe-Titel tragen die Funktions-IDs (PK-01 …); der Abdeckungs-Matrix-
// Eintrag liegt bei help.feature.comments (F-111).
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'prozent-kommentare.md',
);

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('PK-01: Render-Pane zeigt keinen Kommentar-Inhalt', () => {
  test('sichtbarer Text bleibt, GEHEIM-INLINE und GEHEIM-BLOCK fehlen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const body = page.locator(SEL.markdownBody0);
      await expect(body).toContainText('Sichtbarer Absatz');
      await expect(body).toContainText('Abschliessender sichtbarer Absatz');
      await expect(body).not.toContainText('GEHEIM-INLINE');
      await expect(body).not.toContainText('GEHEIM-BLOCK');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PK-02: Quelltext-Modus zeigt den Kommentar und faerbt die Marker', () => {
  test('Editor enthaelt GEHEIM-INLINE und mindestens ein .cm-comment-marker', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Kommentar bleibt Quelltext und ist im Editor sichtbar.
      await expect(editor).toContainText('GEHEIM-INLINE');
      // Einfaerbung der %%-Bereiche im Haupt-Editor (.pane-source
      // qualifiziert gegen die zweite CodeMirror-Instanz, 4T-0361).
      const marker = page.locator(`${SEL.paneSource0} .cm-comment-marker`);
      await expect(marker.first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('PK-03: Live-Modus blendet den Kommentar auf inaktiven Zeilen aus', () => {
  test('bei Cursor auf Zeile 1 liegt GEHEIM in einem .cm-live-marker-hidden', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Der Cursor steht initial auf Zeile 1; die Kommentar-Zeilen sind
      // inaktiv und werden ausgeblendet. Das Ausblende-Element umschliesst
      // den kompletten Kommentar inklusive Marker.
      const hidden = page.locator(`${SEL.paneSource0} .cm-live-marker-hidden`);
      await expect(hidden.first()).toBeAttached();
      await expect(hidden.filter({ hasText: 'GEHEIM' }).first()).toBeAttached();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
