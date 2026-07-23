// 4T-0476 (Epic 3E-0088): Regressionstest fuer Blanks in Dateinamen bei Links.
// CommonMark erlaubt die Destination in spitzen Klammern ([B](<Mein Ziel.md>)),
// damit Leerzeichen im Ziel zulaessig sind. Der Kern-Regressionsfall ist der
// LIVE-Modus: der Lezer-URL-Knoten umfasst die Klammern selbst, sodass der
// Klick vor dem Fix mit dem rohen '<…>'-Wert ins Leere lief (Fix:
// stripAngleDestination in live-widgets.js). Render-Pfad, %-kodiertes Ziel und
// der Wiki-Link sichern den Bestand ab.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Legt einen Temp-Ordner mit Zieldatei und Quelldatei (drei Link-Formen) an.
// Der Cursor steht beim Start auf Zeile 1 (Heading); die Links liegen auf den
// Zeilen 3/5/7 und werden im Live-Modus damit dekoriert (nicht aktive Zeile).
function makeWorkDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-4t0476-'));
  fs.writeFileSync(path.join(dir, 'Meine Notiz.md'), '# Meine Notiz\n\nInhalt.\n', 'utf8');
  // Sichtbares 8x8-Rot-PNG (PO-Befund Test-Iteration 0.59.0: das fruehere
  // 1x1-Pixel-Testbild war auch bei korrektem Rendern praktisch unsichtbar).
  fs.writeFileSync(
    path.join(dir, 'Bild 01.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8DwnwEPYMInOXwUAACR3QEDusxvjgAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  fs.writeFileSync(
    path.join(dir, 'quelle.md'),
    [
      '# Quelle',
      '',
      'Kodiert: [A](Meine%20Notiz.md)',
      '',
      'Spitze Klammern: [B](<Meine Notiz.md>)',
      '',
      'Wiki: [[Meine Notiz]]',
      '',
      'Bild spitze Klammern: ![Alt](<Bild 01.png>)',
      '',
      'Bild kodiert: ![Alt2](Bild%2001.png)',
      '',
      'Bild-Embed: ![[Bild 01.png]]',
      '',
    ].join('\n'),
    'utf8',
  );
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('4T-0476: Blanks in Dateinamen bei Links', () => {
  test('Live-Modus: Klick auf den <…>-Link B oeffnet die Zieldatei (Kern-Fall)', async () => {
    const dir = makeWorkDir();
    const quelle = path.join(dir, 'quelle.md');
    const { app, page, userData } = await launchApp({ args: [quelle] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-live/);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Der Live-Link traegt nach stripAngleDestination den rohen Zielwert
      // 'Meine Notiz.md' (ohne die spitzen Klammern) im data-Attribut.
      const linkB = page.locator('.cm-live-link[data-live-link-href="Meine Notiz.md"]');
      await expect(linkB).toBeVisible();
      await linkB.click();

      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.activeTab0)).toContainText('Meine Notiz');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('Render-Modus: A (%20), B (<…>) und der Wiki-Link oeffnen jeweils die Zieldatei', async () => {
    const dir = makeWorkDir();
    const quelle = path.join(dir, 'quelle.md');
    const { app, page, userData } = await launchApp({ args: [quelle] });
    try {
      await waitForTab(page);
      const rendered = page.locator(SEL.markdownBody0);
      await expect(rendered).toBeVisible();

      // A: %-kodiertes Ziel (Bestand). Der Klick dekodiert und oeffnet.
      await rendered.locator('a', { hasText: 'A' }).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.activeTab0)).toContainText('Meine Notiz');

      // Zurueck zur Quelle und B (<…>-Form) klicken — oeffnet dieselbe Datei.
      await page.locator(SEL.tabs0).first().click();
      await expect(page.locator(SEL.activeTab0)).toContainText('quelle');
      await rendered.locator('a', { hasText: 'B' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Meine Notiz');

      // Zurueck zur Quelle und den Wiki-Link klicken (Bestand).
      await page.locator(SEL.tabs0).first().click();
      await expect(page.locator(SEL.activeTab0)).toContainText('quelle');
      await rendered.locator('a.wikilink', { hasText: 'Meine Notiz' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Meine Notiz');

      // Kein Duplikat-Tab: alle drei Links zeigen auf dieselbe Datei.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // PO-Befund Test-Iteration 0.59.0: Bilder mit Leerzeichen im Namen schienen
  // nicht zu rendern. Der Fall weist nach, dass beide Markdown-Schreibweisen
  // und das Wiki-Embed als aufgeloeste data-URI-Bilder im Render-Pane stehen.
  test('Render-Modus: Bilder mit Leerzeichen (<…>, %20, Embed) rendern als data-URI', async () => {
    const dir = makeWorkDir();
    const quelle = path.join(dir, 'quelle.md');
    const { app, page, userData } = await launchApp({ args: [quelle] });
    try {
      await waitForTab(page);
      const rendered = page.locator(SEL.markdownBody0);
      await expect(rendered).toBeVisible();
      const imgs = rendered.locator('img[src^="data:image/png"]');
      // <…>-Form, %20-Form und Wiki-Embed: drei aufgeloeste Bilder.
      await expect(imgs).toHaveCount(3);
      // Natuerliche Groesse belegt, dass die Bild-Daten wirklich geladen sind.
      const widths = await imgs.evaluateAll((els) => els.map((el) => el.naturalWidth));
      expect(widths).toEqual([8, 8, 8]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
