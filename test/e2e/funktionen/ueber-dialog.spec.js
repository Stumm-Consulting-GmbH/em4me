// 4T-001993 (Epic 3E-000188): E2E-Funktions-Suite — Dialog «Über EM4me».
//
// UD-01: Außerhalb des portablen Betriebs zeigt der Dialog keine Zeile zur
//        portablen Fassung und keinen Knopf «Daten-Ordner öffnen»; beide sind
//        auch per Tastatur nicht erreichbar.
//
// **Warum nur die verborgene Seite.** Die Suite startet die Anwendung aus den
// Quellen und mit Test-Umlenkung des Nutzerdaten-Verzeichnisses. Die Erkennung
// des portablen Betriebs meldet dann in beiden Fällen «nicht portabel»
// (src/main/app/portabler-betrieb.js, Regeln 1 und 2) — und genau das ist der
// Zustand der installierten Fassung, den dieser Fall prüft. Einen Schalter, der
// den portablen Betrieb im Testlauf vortäuscht, gibt es bewusst nicht: Er wäre
// ein zweiter Weg in die Umlenkung der Nutzerdaten, den das ausgelieferte
// Programm mit sich trüge. Die sichtbare Seite prüft
// test/unit/renderer/ueber-dialog-portabel.test.js mit eingeschobener Auskunft,
// die Wirkung des Knopfs der Nachweis am gebauten Programm.
'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden } = require('../helpers/haupt-zugriff');

// Den Menü-Kanal senden, den der native Klick auslösen würde. Native Menüs sind
// aus Playwright nicht klickbar (Muster sendeMenuKanal in produkt-tour.spec.js).
async function sendeMenuKanal(app, kanal) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, k) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(k);
    },
    kanal,
  );
}

test.describe('UD-01: Über-Dialog ohne portablen Betrieb (4T-001993)', () => {
  test('zeigt weder die Zeile zur portablen Fassung noch den Knopf', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Ende der Renderer-Init abwarten (Muster warteAufBereitschaft in
      // produkt-tour.spec.js): Die Menü-Empfänger hängen erst danach, und ein
      // früher gesendeter Kanal verpufft ohne Fehlermeldung — gemessen beim
      // Aufbau dieses Falls, drei von drei Läufen ohne diese Wartestelle rot.
      await page.waitForSelector('body[data-renderer-ready]', { timeout: 20000 });
      await sendeMenuKanal(app, 'menu:openAbout');
      const dialog = page.locator('#about-modal');
      await expect(dialog).toBeVisible();
      // Bezugspunkt: Der Dialog ist fertig aufgebaut, wenn die Version steht.
      // showAbout fragt die Auskunft zum portablen Betrieb VOR dem Aufdecken,
      // die Aussage unten gilt also für den endgültigen Zustand.
      await expect(page.locator('#about-version')).not.toHaveText('—');
      await expect(page.locator('#btn-about-close')).toBeVisible();

      await expect(page.locator('#about-portable')).toBeHidden();
      await expect(page.locator('#about-portable-path')).toBeHidden();
      await expect(page.locator('#btn-about-portable-open')).toBeHidden();
      await expect(page.locator('#about-portable-path')).toHaveText('');

      // Tastatur: Vom Schließen-Knopf aus erreicht keine Anzahl von
      // Tab-Schritten den verborgenen Knopf.
      await expect(page.locator('#btn-about-close')).toBeFocused();
      const erreichteIds = [];
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        erreichteIds.push(await page.evaluate(() => document.activeElement?.id || ''));
      }
      expect(erreichteIds).not.toContain('btn-about-portable-open');
    } finally {
      await closeApp(app, userData);
    }
  });
});
