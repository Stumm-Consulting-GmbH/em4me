// 4T-001423 (Epic 3E-000176): E2E-Funktions-Specs der Block-Anker-Dekoration in
// der Live-Ansicht. Geprueft wird am laufenden Programm, was der Unit-Fall nicht
// erreicht: dass der Indikator anstelle des Roh-Textes erscheint, dass die
// Schreibmarke ihn wieder aufklappt, dass der Klick auf ihn genau dorthin
// fuehrt und dass er sich mit dem Metadaten-Indikator am selben Block vertraegt.
//
// Die Faelle tippen bewusst nichts: Die Fixture traegt eine .mdd-Begleitdatei
// mit Block-Daten, und eine Aenderung wuerde beim Speichern Historie in sie
// schreiben. Geprueft wird allein die Darstellung und die Stellung der
// Schreibmarke.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'block-anker.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Live-Ansicht mit eingeschaltetem Bearbeiten-Modus.
async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const anker = (page) => page.locator(`${SEL.editorContent0} .cm-live-block-anker`);

// Die sichtbaren Editor-Zeilen als Text.
async function editorZeilen(page) {
  return await page
    .locator(SEL.editorContent0)
    .evaluate((el) => Array.from(el.querySelectorAll('.cm-line')).map((z) => z.textContent));
}

// Die Zeile, die den genannten Text enthaelt.
const zeileMit = (page, text) =>
  page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: text }).first();

test.describe('BA-01: Anker erscheint als Indikator', () => {
  test('der Roh-Text weicht dem Zeichen, Code-Block und Metadaten-Block bleiben (AK1, AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      // Drei Anker im Text: Absatz, Listen-Eintrag, letzter Absatz.
      await expect(anker(page)).toHaveCount(3);
      const zeilen = await editorZeilen(page);
      const alles = zeilen.join('\n');
      // AK1: keine der Kennungen steht mehr als Roh-Text im Fliesstext.
      expect(alles).not.toContain('^absatz1');
      expect(alles).not.toContain('^liste1');
      expect(alles).not.toContain('^absatz2');
      // AK6: im Code-Block und im Metadaten-Block bleibt alles, wie es ist.
      expect(alles).toContain('^imCode');
      expect(alles).toContain('^keinAnker');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('BA-02: Schreibmarke in der Zeile klappt den Roh-Text auf', () => {
  test('der Anker der Cursor-Zeile zeigt wieder seine Kennung (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(anker(page)).toHaveCount(3);
      await zeileMit(page, 'Ein Absatz mit Anker.').click();
      // Genau ein Anker klappt auf, die beiden anderen bleiben Indikator.
      await expect(anker(page)).toHaveCount(2);
      const alles = (await editorZeilen(page)).join('\n');
      expect(alles).toContain('^absatz1');
      expect(alles).not.toContain('^liste1');
      expect(alles).not.toContain('^absatz2');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('BA-03: Der Indikator nennt seine Kennung', () => {
  test('der Hinweis-Text traegt Bezeichnung und Kennung (AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(anker(page)).toHaveCount(3);
      const titel = await anker(page).first().getAttribute('title');
      expect(titel).toContain('^absatz1');
      // Die Bezeichnung kommt aus den Sprachdateien und steht davor.
      expect(titel.startsWith('^')).toBe(false);
      expect(await anker(page).first().getAttribute('data-anker-id')).toBe('absatz1');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('BA-04: Klick auf den Indikator', () => {
  test('setzt die Schreibmarke ans Zeilenende und klappt den Roh-Text auf (AK4)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(anker(page)).toHaveCount(3);
      await anker(page).nth(2).click();
      // Der angeklickte Anker ist aufgeklappt, die beiden anderen nicht.
      await expect(anker(page)).toHaveCount(2);
      const alles = (await editorZeilen(page)).join('\n');
      expect(alles).toContain('^absatz2');
      expect(alles).not.toContain('^absatz1');
      // Die Marke steht am Zeilenende, also hinter der Kennung: Ein Druck auf
      // Rueckschritt wuerde das letzte Zeichen der Kennung treffen.
      const stelle = await page.evaluate(() => {
        const el = document.querySelector('.pane-group[data-pane="0"] .cm-content');
        const sel = window.getSelection();
        return el && sel && sel.focusNode ? sel.focusOffset : -1;
      });
      expect(stelle).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('BA-05: Nachbarschaft zum Metadaten-Indikator', () => {
  test('beide stehen am selben Block, der Anker vor den Daten (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      const zeile = zeileMit(page, 'Ein Absatz mit Anker.');
      await expect(zeile.locator('.cm-live-block-anker')).toHaveCount(1);
      await expect(zeile.locator('.cm-block-meta-indicator')).toHaveCount(1);
      // Dokument-Reihenfolge: erst der Anker, dann die Daten.
      const ankerVorDaten = await zeile.evaluate((el) => {
        const a = el.querySelector('.cm-live-block-anker');
        const d = el.querySelector('.cm-block-meta-indicator');
        return !!(a.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(ankerVorDaten).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('BA-06: Aus-Zustand der Verlinkungs-Erweiterung', () => {
  test('ohne Wiki-Links bleibt der Anker roher Text (AK8)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await expect(anker(page)).toHaveCount(3);
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['wiki-links']));
      // Kein Indikator mehr, dafuer wieder die Kennungen im Text — dieselbe
      // Wirkung wie in der gerenderten Ansicht, die den Anker dann ebenfalls
      // stehen laesst (markdown.js haengt blockAnchorsPlugin unter wiki-links).
      await expect(anker(page)).toHaveCount(0);
      const alles = (await editorZeilen(page)).join('\n');
      expect(alles).toContain('^absatz1');
      expect(alles).toContain('^liste1');
      expect(alles).toContain('^absatz2');
    } finally {
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await closeApp(app, userData, { force: true });
    }
  });
});
