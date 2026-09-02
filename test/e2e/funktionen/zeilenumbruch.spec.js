// 4T-001312 (Epic 3E-000235): Hängender Einzug umgebrochener Zeilen im Editor.
//
// Die Rechnung prüft `test/unit/haengender-einzug.test.js`. Hier wird
// gemessen, ob sie im laufenden Editor auch ankommt: Eine umgebrochene
// Listen-Zeile muss auf ihrer zweiten Bildschirm-Zeile weiter rechts beginnen
// als auf der ersten, ein gewöhnlicher Absatz nicht.
//
// Gemessen wird über die Zeilen-Kästen des Textes selbst (Range-Rechtecke) und
// nicht über den berechneten Stilwert: Ein gesetzter Stilwert beweist nicht,
// dass die Darstellung ihm folgt.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'zeilenumbruch.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Linke Kanten der Bildschirm-Zeilen einer Editor-Zeile, von oben nach unten.
// Mehr als ein Wert bedeutet: Die Zeile ist umgebrochen.
//
// Die Rechtecke eines Bereichs kommen je Textstück und nicht je
// Bildschirm-Zeile — eine hervorgehobene Zeile besteht aus mehreren Stücken.
// Gruppiert wird deshalb nach der Oberkante, und je Gruppe zählt die
// linkeste Kante.
async function linkeKanten(page, index) {
  return await page.evaluate((i) => {
    const zeilen = [...document.querySelectorAll('.cm-editor .cm-line')];
    const zeile = zeilen[i];
    if (!zeile) return null;
    const range = document.createRange();
    range.selectNodeContents(zeile);
    const reihen = new Map();
    for (const r of range.getClientRects()) {
      if (r.width <= 0) continue;
      const oben = Math.round(r.top);
      const bisher = reihen.get(oben);
      if (bisher === undefined || r.left < bisher) reihen.set(oben, r.left);
    }
    return [...reihen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, links]) => Math.round(links * 100) / 100);
  }, index);
}

test.describe('ZU-01: Hängender Einzug umgebrochener Zeilen', () => {
  test('Listen-Zeilen setzen eingerückt fort, ein Absatz bleibt linksbündig', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Die Fixture trägt den Umbruch im Frontmatter; ohne ihn gäbe es keine
      // Fortsetzungs-Zeile zu messen.
      const dekoriert = page.locator('.cm-editor .cm-line.cm-haengender-einzug');
      await expect(dekoriert.first()).toBeAttached();

      // Zeilen der Fixture: 0..2 Frontmatter, 3 leer, 4 Aufzählung, 5 leer,
      // 6 nummeriert, 7 leer, 8 Absatz.
      const aufzaehlung = await linkeKanten(page, 4);
      const nummeriert = await linkeKanten(page, 6);
      const absatz = await linkeKanten(page, 8);

      // Jede der drei Zeilen bricht um; sonst misst der Fall nichts.
      expect(aufzaehlung.length).toBeGreaterThan(1);
      expect(nummeriert.length).toBeGreaterThan(1);
      expect(absatz.length).toBeGreaterThan(1);

      // Listen-Zeilen: die Fortsetzung beginnt weiter rechts als der Anfang.
      expect(aufzaehlung[1]).toBeGreaterThan(aufzaehlung[0]);
      expect(nummeriert[1]).toBeGreaterThan(nummeriert[0]);
      // Die nummerierte Liste rückt weiter ein als die Aufzählung ('1. ' gegen
      // '- '), gemessen als Abstand der Fortsetzung zum Zeilen-Anfang.
      expect(nummeriert[1] - nummeriert[0]).toBeGreaterThan(aufzaehlung[1] - aufzaehlung[0]);
      // Alle Fortsetzungs-Zeilen liegen auf derselben Kante.
      for (const kante of aufzaehlung.slice(1)) expect(kante).toBeCloseTo(aufzaehlung[1], 1);

      // Der Absatz bleibt unverändert linksbündig.
      expect(absatz[1]).toBeCloseTo(absatz[0], 1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('im Live-Modus gilt dieselbe Einrückung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator('.cm-editor .cm-line.cm-haengender-einzug').first()).toBeAttached();
      const aufzaehlung = await linkeKanten(page, 4);
      expect(aufzaehlung.length).toBeGreaterThan(1);
      expect(aufzaehlung[1]).toBeGreaterThan(aufzaehlung[0]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  // Die Einrückung ist rein darstellend. Der Nachweis dafür ist die Zuordnung
  // von Bildschirm-Position zu Text-Position: Ein Klick auf den Anfang der
  // zweiten Bildschirm-Zeile muss die Schreibmarke genau dort absetzen, nicht
  // um den Einzug versetzt.
  test('die Schreibmarke folgt dem Klick auch in der eingerückten Fortsetzung', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const kanten = await linkeKanten(page, 4);
      expect(kanten.length).toBeGreaterThan(1);
      const zweiteReihe = await page.evaluate(() => {
        const zeile = [...document.querySelectorAll('.cm-editor .cm-line')][4];
        const range = document.createRange();
        range.selectNodeContents(zeile);
        const reihen = new Map();
        for (const r of range.getClientRects()) {
          if (r.width <= 0) continue;
          const oben = Math.round(r.top);
          if (!reihen.has(oben)) reihen.set(oben, r);
        }
        const sortiert = [...reihen.entries()].sort((a, b) => a[0] - b[0]);
        const r = sortiert[1][1];
        return { x: r.left + 1, y: r.top + r.height / 2 };
      });
      await page.mouse.click(zweiteReihe.x, zweiteReihe.y);
      const marke = await page.evaluate(() => {
        const el = document.querySelector('.cm-editor .cm-cursor-primary');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, height: r.height };
      });
      expect(marke).not.toBeNull();
      // Die Schreibmarke steht dort, wo geklickt wurde: waagerecht am Anfang
      // der Fortsetzung, senkrecht in ihrer Reihe.
      expect(Math.abs(marke.left - zweiteReihe.x)).toBeLessThan(8);
      expect(zweiteReihe.y).toBeGreaterThan(marke.top);
      expect(zweiteReihe.y).toBeLessThan(marke.top + marke.height);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('ohne Umbruch ändert sich nichts', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      // Umbruch abschalten: die Zeile läuft dann in einer Bildschirm-Zeile
      // durch, und es gibt keine Fortsetzung, die eingerückt werden könnte.
      await page.locator('#btn-wrap').click();
      await expect.poll(async () => (await linkeKanten(page, 4)).length).toBe(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
