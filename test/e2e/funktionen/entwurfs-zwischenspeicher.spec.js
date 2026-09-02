// 4T-000368 (Epic 3E-000068): Entwurfs-Zwischenspeicher — nie gespeicherte
// Unbenannt-Tabs mit Inhalt ueberleben das App-Ende und kehren beim Neustart
// als dirty Unbenannt-Tabs zurueck; der Draft-Ordner ist danach leer. Getestet
// wird der gemischte Fall (eine geoeffnete Datei plus Entwuerfe), damit
// Sitzungs-Wiederherstellung und Entwurfs-Wiederherstellung zusammen greifen.
//
// DR-01: Ein Unbenannt-Tab mit Inhalt ueberlebt Beenden und Neustart.
// DR-02: Zwei Entwuerfe kehren gemeinsam und inhaltsgleich zurueck.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Neuen Unbenannt-Tab anlegen und Text eintippen (realer Nutzungspfad:
// Datei -> Neu, dann tippen). Wartet, bis der Tab dirty ist, damit tab.content
// synchronisiert ist, bevor die App beendet wird.
async function addDraftTab(app, page, text) {
  const before = await page.locator(SEL.tabs0).count();
  await sendMenuChannel(app, 'menu:new');
  await expect(page.locator(SEL.tabs0)).toHaveCount(before + 1);
  const editor = page.locator(SEL.editorContent0);
  await expect(editor).toBeVisible();
  // Unbenannt-Tab startet im Edit-Modus; nur falls (unerwartet) read-only,
  // ueber den Statusbar-Button umschalten.
  if ((await editor.getAttribute('contenteditable')) !== 'true') {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.type(text);
  await expect(page.locator(SEL.dirtyTab0).last()).toBeVisible();
}

function draftFileCount(userData) {
  try {
    return fs.readdirSync(path.join(userData, 'drafts')).filter((n) => n.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

// confirmCloseDirty-Dialog im Main stubben: zaehlt die Aufrufe in einer
// globalen Main-Variable und antwortet 'Abbrechen' (response 2). Damit bricht
// das Beenden ab, die App bleibt offen und der Zaehler ist abfragbar (der
// native Dialog ist per Playwright nicht bedienbar). Muster stubSaveDialog
// aus pdf-export.spec.js.
async function stubCancelDialog(app) {
  await app.evaluate(({ dialog }) => {
    globalThis.__closeDialogCalls = 0;
    dialog.showMessageBox = async () => {
      globalThis.__closeDialogCalls += 1;
      return { response: 2 };
    };
  });
}

function closeDialogCalls(app) {
  return app.evaluate(() => globalThis.__closeDialogCalls || 0);
}

test.describe('DR-01: Entwurf ueberlebt Beenden und Neustart (4T-000368)', () => {
  test('Unbenannt-Tab mit Inhalt kehrt als dirty Tab zurueck, Ordner danach leer', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await waitForTab(first.page);
      await addDraftTab(first.app, first.page, 'ENTWURF-EINS');

      // Sauber beenden (before-quit): trotz dirty Unbenannt kein Dialog — der
      // Entwurf wandert ohne Nachfrage in den Speicher. Die geoeffnete Datei
      // ist nicht dirty und loest ebenfalls keinen Dialog aus.
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      // Nach dem Beenden liegt genau ein Entwurf im Speicher.
      expect(draftFileCount(userData)).toBe(1);

      // Neustart mit demselben Profil: die Datei kommt ueber die Sitzung, der
      // Entwurf als zusaetzlicher dirty Unbenannt-Tab mit identischem Inhalt.
      const second = await launchApp({ userData });
      try {
        await expect.poll(() => second.page.locator(SEL.tabs0).count()).toBe(2);
        await expect(second.page.locator(SEL.dirtyTab0)).toHaveCount(1);
        // Der Entwurf ist Tab 1 (nach dem wiederhergestellten Datei-Tab).
        await second.page.locator(SEL.tabs0).nth(1).click();
        await expect(second.page.locator(SEL.editorContent0)).toContainText('ENTWURF-EINS');
        // Speicher wurde nach der Uebergabe an die Fenster geleert.
        await expect.poll(() => draftFileCount(userData)).toBe(0);
      } finally {
        await closeApp(second.app, null, { force: true });
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});

test.describe('DR-02: Mehrere Entwuerfe kehren zurueck (4T-000368)', () => {
  test('zwei Unbenannt-Tabs mit Inhalt sind nach dem Neustart inhaltsgleich da', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await waitForTab(first.page);
      await addDraftTab(first.app, first.page, 'ENTWURF-A');
      await addDraftTab(first.app, first.page, 'ENTWURF-B');

      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');
      expect(draftFileCount(userData)).toBe(2);

      const second = await launchApp({ userData });
      try {
        // Datei-Tab plus zwei Entwuerfe.
        await expect.poll(() => second.page.locator(SEL.tabs0).count()).toBe(3);
        await expect(second.page.locator(SEL.dirtyTab0)).toHaveCount(2);
        // Reihenfolge erhalten: Tab 1 -> ENTWURF-A, Tab 2 -> ENTWURF-B.
        await second.page.locator(SEL.tabs0).nth(1).click();
        await expect(second.page.locator(SEL.editorContent0)).toContainText('ENTWURF-A');
        await second.page.locator(SEL.tabs0).nth(2).click();
        await expect(second.page.locator(SEL.editorContent0)).toContainText('ENTWURF-B');
        await expect.poll(() => draftFileCount(userData)).toBe(0);
      } finally {
        await closeApp(second.app, null, { force: true });
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});

test.describe('DR-03: Einstellung aus haelt das heutige Verhalten (4T-000369)', () => {
  test('bei ausgeschalteter Einstellung zeigt das App-Ende den Dialog, kein Entwurf entsteht', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await waitForTab(first.page);
      await first.page.evaluate(() => window.api.setSetting('keepUnsavedDrafts', false));
      await stubCancelDialog(first.app);
      await addDraftTab(first.app, first.page, 'VERWERFEN-BEIM-BEENDEN');

      // Beenden anstossen: bei ausgeschalteter Einstellung erscheint der
      // Speichern-Dialog fuer den dirty Unbenannt-Tab (Stub bricht per
      // 'Abbrechen' ab, die App bleibt offen und abfragbar).
      await first.app.evaluate(({ app }) => app.quit());
      await expect.poll(() => closeDialogCalls(first.app)).toBeGreaterThan(0);
      // Es entstand kein Entwurf — heutiges Verhalten bleibt erhalten.
      expect(draftFileCount(userData)).toBe(0);
    } finally {
      await closeApp(first.app, userData, { force: true });
    }
  });
});

test.describe('DR-04: bestehende Datei behaelt den Dialog (4T-000369)', () => {
  test('mit aktiver Einstellung loest eine dirty bestehende Datei beim Beenden den Dialog aus', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await waitForTab(first.page);
      await stubCancelDialog(first.app);
      // Bestehende Datei aendern (dirty). Sie darf nicht als Entwurf gesichert
      // werden, sondern behaelt den Speichern-Dialog trotz aktiver Einstellung.
      // Bestehende Datei startet read-only; ueber den Statusbar-Button in den
      // Edit-Modus (Muster smoke SM-04), dann ans Ende und aendern.
      await first.page.locator(SEL.viewBtn('source')).click();
      await first.page.locator(SEL.btnEdit).click();
      const editor = first.page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      await editor.click();
      await first.page.keyboard.press('Control+End');
      await first.page.keyboard.type('AENDERUNG-AN-DATEI');
      await expect(first.page.locator(SEL.dirtyTab0)).toHaveCount(1);

      // Beenden anstossen: fuer die dirty bestehende Datei erscheint der Dialog
      // (Stub bricht per 'Abbrechen' ab, die App bleibt offen und abfragbar).
      await first.app.evaluate(({ app }) => app.quit());
      await expect.poll(() => closeDialogCalls(first.app)).toBeGreaterThan(0);
      // Der Entwurfs-Speicher bleibt leer (bestehende Dateien werden nicht als
      // Entwurf gesichert).
      expect(draftFileCount(userData)).toBe(0);
    } finally {
      await closeApp(first.app, userData, { force: true });
    }
  });
});
