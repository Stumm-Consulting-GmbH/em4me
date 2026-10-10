// 4T-000761 (Epic 3E-000142): Suche über alle Einstellungs-Bereiche.
//
// Kern der Zusage: Wer den Namen einer Einstellung kennt, findet ihren
// Bereich — auch wenn dieser Bereich in dieser Sitzung nie geöffnet war.
// Geprüft werden Trefferraum, Bereichs-Sprung und die Unversehrtheit eines
// laufenden Entwurfs.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { warteAufTrefferliste } = require('../helpers/suche');

const PANEL = '.pane-group[data-pane="0"] .sidebar-searchresults';
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system';

function makeWorkFile() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-suche-einst-'));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, '# Arbeitsdatei\n\nOhne den gesuchten Begriff.\n', 'utf8');
  return workFile;
}

async function oeffneEinstellungen(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'settings' } }),
    );
  });
  await expect(page.locator(`${SETTINGS_PAGE} .settings-section-heading`)).toBeVisible();
}

async function sucheOeffnen(page, begriff) {
  await page.keyboard.press('Control+f');
  const input = page.locator('#search-input');
  await expect(input).toBeVisible();
  await input.fill(begriff);
}

test.describe('SE-01: Trefferraum über alle Einstellungs-Bereiche', () => {
  test('findet Einstellungen in Bereichen, die nie geöffnet waren', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await oeffneEinstellungen(page);
      // Die Seite startet im Bereich «Darstellung»; gesucht wird ein
      // Begriff, der auch in anderen Bereichen vorkommt.
      await sucheOeffnen(page, 'Schrift');
      await expect(page.locator('#search-scope')).toHaveText(/Einstellungen/);

      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      await expect
        .poll(async () => panel.locator('.search-results-item').count())
        .toBeGreaterThan(0);
      // Mehr als ein Bereich betroffen: genau die Information, die die
      // Bereichsnavigation sonst nicht hergibt.
      await expect
        .poll(async () => panel.locator('.search-results-group').count())
        .toBeGreaterThan(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SE-02: Sprung in den Bereich', () => {
  test('Klick auf einen Treffer aktiviert dessen Bereich', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await oeffneEinstellungen(page);
      const ueberschrift = page.locator(`${SETTINGS_PAGE} .settings-section-heading`);
      const startBereich = await ueberschrift.innerText();

      await sucheOeffnen(page, 'Schrift');
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const gruppen = panel.locator('.search-results-group');
      await expect.poll(async () => gruppen.count()).toBeGreaterThan(1);

      // Die letzte Gruppe gehört sicher nicht zum Start-Bereich.
      await gruppen.last().click();
      const treffer = panel.locator('.search-results-item');
      // 4T-001496: Nicht auf «ueberhaupt Treffer» warten, sondern auf den
      // Zustand, den die Status-Zeile meldet. Sonst trifft .last() unter Last
      // einen anderen Eintrag als gemeint, weil die Liste noch waechst.
      await warteAufTrefferliste(page);
      await treffer.last().click();

      await expect.poll(async () => ueberschrift.innerText()).not.toBe(startBereich);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SE-04: Erweiterungs-Zeilen im Suchraum (4T-000872)', () => {
  test('«Bücher» findet den Bereich Erweiterungen; der Sprung hebt die Zeile hervor', async () => {
    // Regressionstest 4T-000872 (PO-Befund vom 2026-08-04): Die Erweiterungs-
    // Zeilen rendern mit eigenen Klassen und fehlten komplett im Suchraum —
    // die Suche nach «Bücher» fand nichts, obwohl der Bereich Erweiterungen
    // den Eintrag sichtbar führt.
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await oeffneEinstellungen(page);
      await sucheOeffnen(page, 'Bücher');
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const treffer = panel.locator('.search-results-item');
      await expect.poll(async () => treffer.count()).toBeGreaterThan(0);

      // Der Sprung aktiviert den Bereich Erweiterungen und hebt die
      // Erweiterungs-Zeile hervor (Ernte und Sprung teilen den Selektor).
      await treffer.first().click();
      await expect(
        page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`),
      ).toHaveClass(/active/);
      await expect(page.locator('#settings-extension-books')).toBeVisible();
      await expect(page.locator(`${SETTINGS_PAGE} .settings-row-hervorgehoben`)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002107: «Die erste Eingabetaste soll zum ersten Treffer springen»
// (Entscheidung des Product Owners vom 2026-10-03). Gemessen vorher: nach dem
// Tippen «1 / 22» ohne hervorgehobene Zeile, die erste Eingabetaste hob die
// ZWEITE Fundstelle hervor und zählte «2 / 22».
test.describe('SE-05: Die erste Eingabetaste zeigt den ersten Treffer (4T-002107)', () => {
  test('4T-002107: Tippen bewegt nichts, die erste Eingabetaste zeigt «1 / n», die zweite «2 / n»', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await oeffneEinstellungen(page);
      const ueberschrift = page.locator(`${SETTINGS_PAGE} .settings-section-heading`);
      const startBereich = await ueberschrift.innerText();
      await sucheOeffnen(page, 'Schrift');
      const gesamt = await warteAufTrefferliste(page, { mindestens: 3, panel: PANEL });
      const zaehler = page.locator('#search-count');
      await expect(zaehler).toHaveText(`1 / ${gesamt}`);
      const treffer = page.locator(`${PANEL} .search-results-item`);
      const beschriftung = async (i) =>
        (await treffer.nth(i).innerText()).split('\n')[0].replace('…', '').trim();
      const erster = await beschriftung(0);
      const zweiter = await beschriftung(1);
      const hervorgehoben = (text) =>
        page.locator(`${SETTINGS_PAGE} .settings-row-hervorgehoben`, { hasText: text });

      // Das Tippen hebt nichts hervor und wechselt keinen Bereich.
      await expect(page.locator(`${SETTINGS_PAGE} .settings-row-hervorgehoben`)).toHaveCount(0);
      expect(await ueberschrift.innerText()).toBe(startBereich);

      await page.keyboard.press('Enter');
      await expect(hervorgehoben(erster)).toBeVisible();
      await expect(zaehler).toHaveText(`1 / ${gesamt}`);

      await page.keyboard.press('Enter');
      await expect(zaehler).toHaveText(`2 / ${gesamt}`);
      await expect(hervorgehoben(zweiter)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SE-03: Entwurf überlebt den Sprung', () => {
  test('eine geänderte Schriftgröße bleibt nach dem Bereichswechsel erhalten', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await oeffneEinstellungen(page);
      const groesse = page.locator('#settings-editor-size');
      await expect(groesse).toBeVisible();
      await groesse.fill('21');

      await sucheOeffnen(page, 'Überschrift');
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const treffer = panel.locator('.search-results-item');
      await expect.poll(async () => treffer.count()).toBeGreaterThan(0);
      await treffer.last().click();

      // Zurück in den Bereich «Darstellung»: der Entwurfs-Wert steht noch.
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="appearance"]`)
        .click();
      await expect(page.locator('#settings-editor-size')).toHaveValue('21');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002129: Sprung während des Suchlaufs in den Einstellungen. Auch dieser
// Raum liefert sein Ergebnis asynchron; ein Sprung davor wird vorgemerkt und
// auf dem Ergebnis dieses Laufs ausgeführt.
test.describe('SE-06: Sprung während des Suchlaufs (4T-002129)', () => {
  for (const druecke of [2, 1]) {
    test(`4T-002129: neuer Begriff, sofort ${druecke}× Eingabetaste — «${druecke} / n» und die Zeile hervorgehoben, nach einer Sekunde unverändert`, async () => {
      test.setTimeout(120000);
      const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
      try {
        await oeffneEinstellungen(page);
        await page.keyboard.press('Control+f');
        await expect(page.locator('#search-input')).toBeVisible();
        await page.keyboard.type('Schrift', { delay: 20 });
        for (let i = 0; i < druecke; i++) await page.keyboard.press('Enter');
        const gesamt = await warteAufTrefferliste(page, { mindestens: 3, panel: PANEL });
        await page.waitForTimeout(1000);
        await expect(page.locator('#search-count')).toHaveText(`${druecke} / ${gesamt}`);
        const zeile = page.locator(`${PANEL} .search-results-item`).nth(druecke - 1);
        const text = (await zeile.innerText()).split('\n')[0].replace('…', '').trim();
        await expect(
          page.locator(`${SETTINGS_PAGE} .settings-row-hervorgehoben`, { hasText: text }),
        ).toBeVisible();
      } finally {
        await closeApp(app, userData);
      }
    });
  }
});
