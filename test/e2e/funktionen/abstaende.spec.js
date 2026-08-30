// 4T-1310 (Epic 3E-0235): Abstände um die Frontmatter-Zeile und um den
// Journal-Navigations-Block.
//
// Der Befund des Product Owners war „zu viel Leerraum". Damit daraus ein
// prüfbares Kriterium wird, misst dieser Spec den tatsächlichen Zwischenraum
// und vergleicht ihn mit dem Zwischenraum zweier gewöhnlicher Absätze
// desselben Dokuments. Der Absatz ist das Maß, nicht eine gewählte Pixelzahl:
// Er wächst mit Schriftgröße und Zoom mit, eine Pixelzahl täte das nicht.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'abstaende.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Lichter Abstand zwischen zwei Elementen: Unterkante des oberen bis
// Oberkante des unteren. Zusammenfallende Aussenabstaende sind darin bereits
// enthalten, weil gemessen und nicht gerechnet wird.
async function abstand(obenLocator, untenLocator) {
  const oben = await obenLocator.boundingBox();
  const unten = await untenLocator.boundingBox();
  return unten.y - (oben.y + oben.height);
}

test.describe('AB-01: Abstände der abgesetzten Blöcke im Gerenderten', () => {
  test('Frontmatter-Zeile und Journal-Block halten Absatz-Maß', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const body = page.locator(SEL.markdownBody0);
      const fmBlock = body.locator('.frontmatter-block');
      const navBlock = body.locator('.perspective-journal-nav');
      const absaetze = body.locator('p');
      await expect(fmBlock).toBeVisible();
      await expect(navBlock).toBeVisible();

      // Vergleichs-Maß: der Zwischenraum zwischen dem zweiten und dritten
      // Absatz, also zwischen zwei gewöhnlichen Absätzen ohne Sonderrolle.
      const absatzAbstand = await abstand(absaetze.nth(1), absaetze.nth(2));
      expect(absatzAbstand).toBeGreaterThan(0);

      const nachFrontmatter = await abstand(fmBlock, absaetze.nth(0));
      const vorNav = await abstand(absaetze.nth(0), navBlock);
      const nachNav = await abstand(navBlock, absaetze.nth(1));

      // Der abgesetzte Block darf etwas mehr Luft haben als ein Absatz, aber
      // nicht ein Vielfaches. Die Grenze liegt beim Anderthalbfachen; sie
      // trennt „abgesetzt" von „auseinandergerissen".
      const grenze = absatzAbstand * 1.5;
      expect(nachFrontmatter).toBeLessThanOrEqual(grenze);
      expect(vorNav).toBeLessThanOrEqual(grenze);
      expect(nachNav).toBeLessThanOrEqual(grenze);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AB-02: Abstände derselben Blöcke im Live-Modus', () => {
  test('die Ersetzung erzeugt keinen zusätzlichen Leerraum', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const fmWidget = page.locator('.cm-editor .cm-live-frontmatter .frontmatter-block');
      const navWidget = page.locator('.cm-editor .perspective-journal-nav');
      await expect(fmWidget).toBeVisible();
      await expect(navWidget).toBeVisible();

      // Vergleichs-Maß im Editor: die Höhe einer gewöhnlichen Textzeile.
      const zeilenHoehe = await page.evaluate(() => {
        const zeile = document.querySelector('.cm-editor .cm-line');
        return zeile ? zeile.getBoundingClientRect().height : 0;
      });
      expect(zeilenHoehe).toBeGreaterThan(0);

      // Die ersetzte Zeile darf nicht wesentlich hoeher sein als der Block,
      // den sie zeigt. Gemessen wird der Ueberhang der Zeile ueber ihren
      // Inhalt; er ist der Leerraum, den die Ersetzung hinzufuegt.
      const ueberhang = async (locator) =>
        await locator.evaluate((el) => {
          const zeile = el.closest('.cm-line');
          if (!zeile) return null;
          return zeile.getBoundingClientRect().height - el.getBoundingClientRect().height;
        });
      const ueberhangFm = await ueberhang(fmWidget);
      const ueberhangNav = await ueberhang(navWidget);
      expect(ueberhangFm).not.toBeNull();
      expect(ueberhangNav).not.toBeNull();
      expect(ueberhangFm).toBeLessThanOrEqual(zeilenHoehe * 1.5);
      expect(ueberhangNav).toBeLessThanOrEqual(zeilenHoehe * 1.5);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
