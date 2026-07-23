// 4T-0180: Performance-Messung und Verhaltens-Nachweise der Hotspot-Fixes.
//
// P-01/P-03 sind Mess-Szenarien auf der grossen Fixture (5.200 Zeilen):
// sie loggen Tab-Wechsel-Dauer bzw. Live-Tipp-Dauer in die Test-Ausgabe
// (Werte landen im Loesung-Kapitel des Tasks) und sichern nur grobe
// Obergrenzen ab — harte Latenz-Assertions waeren maschinenabhaengig flaky.
// P-02 ist der funktionale Beweis des R4-12-Render-Skips: ein erneutes
// renderPaneContent ohne Stand-Aenderung laesst das Render-DOM identisch
// (Knoten-Identitaet), ein echter Tab-Wechsel rendert weiterhin frisch.
// P-04 prueft den Fold-Gutter (R1-07/R1-08-Algorithmen) funktional auf der
// grossen Fixture.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'perf');
const GROSS = path.join(FIXTURES, 'grosse-datei.md');
const ANKER = path.join(FIXTURES, 'mermaid-anker.md');
const KLEIN_A = path.join(FIXTURES, 'klein-a.md');

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

// Zeitmessung im Page-Kontext: Aktion ausfuehren, dann bis zwei
// requestAnimationFrames nach Abschluss warten (Render-Pipeline und
// Layout sind dann durch) und die Dauer zurueckgeben.
async function measure(page, actionFn) {
  const t0 = await page.evaluate(() => performance.now());
  await actionFn();
  return page.evaluate(async (start) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - start;
  }, t0);
}

test.describe('P-01: Tab-Wechsel-Dauer auf grosser Fixture', () => {
  test('Wechsel klein → gross → klein, Dauern geloggt', async () => {
    const { app, page, userData } = await launchApp({ args: [GROSS, KLEIN_A] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Reading-Modus (Default) — der Wechsel rendert die Render-Pane.
      const tabs = page.locator(SEL.tabs0);
      const durations = [];
      for (const idx of [0, 1, 0]) {
        const ms = await measure(page, () => tabs.nth(idx).click());
        durations.push(Math.round(ms));
      }
      // [gross, klein, gross] — der zweite Wechsel auf die grosse Datei
      // ist der teure Fall (Voll-Parse der 5.200 Zeilen).
      console.log(`[4T-0180/P-01] Tab-Wechsel-Dauern (ms): ${durations.join(', ')}`);
      // Grobe Obergrenze als Regressionswache (kein Latenz-Versprechen).
      for (const d of durations) expect(d).toBeLessThan(5000);
      await expect(page.locator(`${SEL.markdownBody0} h1`).first()).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('P-02: Render-Skip bei unveraendertem Stand (R4-12)', () => {
  test('Erneutes Aktivieren laesst Render-DOM identisch, echter Wechsel rendert frisch', async () => {
    const { app, page, userData } = await launchApp({ args: [ANKER, KLEIN_A] });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    try {
      await waitForTab(page);
      const tabs = page.locator(SEL.tabs0);
      await tabs.nth(0).click();
      // Mermaid-SVG abwarten (async Render bzw. Cache-Hit).
      const svg = page.locator(`${SEL.markdownBody0} .mermaid-block svg`);
      await expect(svg).toBeVisible();
      // Knoten-Identitaet markieren: Property am lebenden DOM-Knoten
      // ueberlebt nur, wenn das DOM NICHT per innerHTML ersetzt wird.
      await page.evaluate((sel) => {
        document.querySelector(sel).__scgProbe = 'alive';
      }, `${SEL.markdownBody0} .mermaid-block svg`);
      // Klick auf den bereits aktiven Tab: activateTab laeuft komplett
      // durch (renderPaneContent direkt + applyAllLayouts-Kaskade) — beide
      // Render-Aufrufe muessen im Skip enden.
      await tabs.nth(0).click();
      await page.waitForTimeout(150);
      const probeAfterReclick = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.__scgProbe || null : null;
      }, `${SEL.markdownBody0} .mermaid-block svg`);
      expect(probeAfterReclick).toBe('alive');
      // Echter Wechsel weg und zurueck: die Pane zeigt zwischendurch die
      // andere Datei, der Rueckwechsel MUSS frisch rendern (Skip darf
      // nicht faelschlich greifen) — Inhalt beider Staende pruefen.
      await tabs.nth(1).click();
      await expect(page.locator(`${SEL.markdownBody0} h1`)).toHaveText('Kleine Datei A');
      await tabs.nth(0).click();
      await expect(page.locator(`${SEL.markdownBody0} h1`)).toHaveText('Mermaid-Anker');
      await expect(page.locator(`${SEL.markdownBody0} .mermaid-block svg`)).toBeVisible();
      expect(consoleErrors).toEqual([]);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('P-03: Tippen im Live-Modus auf grosser Fixture', () => {
  test('15 Zeichen am Dokument-Anfang, Dauer geloggt, Inhalt kommt an', async () => {
    const { app, page, userData } = await launchApp({ args: [GROSS] });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toBeVisible();
      // Editor ist ohne Edit-Modus read-only (SM-04-Muster).
      await page.locator(SEL.btnEdit).click();
      // Cursor an den Anfang des Dokuments setzen und tippen.
      await editor.click({ position: { x: 10, y: 10 } });
      await page.keyboard.press('Control+Home');
      const text = 'Perf-Messlauf x';
      const ms = await measure(page, () => page.keyboard.type(text));
      console.log(
        `[4T-0180/P-03] ${text.length} Zeichen im Live-Modus (5.200 Zeilen): ${Math.round(ms)} ms inkl. Treiber-Overhead`,
      );
      expect(ms).toBeLessThan(20000);
      // Funktionsnachweis: Text steht im Editor (erste Zeile).
      await expect(editor).toContainText('Perf-Messlauf x');
      expect(consoleErrors).toEqual([]);
    } finally {
      // Dirty Buffer absichtlich — Force-Exit verhindert den nativen
      // Speichern-Dialog im Teardown.
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('P-04: Fold-Gutter auf grosser Fixture (R1-07/R1-08)', () => {
  test('Source-Modus zeigt Fold-Marker fuer Headings und Bloecke', async () => {
    const { app, page, userData } = await launchApp({ args: [GROSS] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      // Neuer O(n)-Strukturaufbau muss dieselben Gutter-Marker liefern:
      // mindestens ein Heading-Faltpfeil im sichtbaren Bereich.
      const marker = page.locator('.pane-group[data-pane="0"] [data-fold-line]');
      await expect(marker.first()).toBeVisible();
      const count = await marker.count();
      console.log(`[4T-0180/P-04] Sichtbare Fold-Marker: ${count}`);
      expect(count).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});
