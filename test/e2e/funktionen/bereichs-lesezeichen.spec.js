// 4T-000612 (Epic 3E-000115): E2E-Funktions-Suite — Bereichs-Lesezeichen.
// Zweigeteiltes Panel (allgemeine Lesezeichen und Bereichs-Lesezeichen),
// Anlage-Fluss mit Ziel-Wahl, Reihenfolge-Schalter und Umwandeln zwischen den
// Abschnitten. Der Bereich wird ueber den Pfad-Einstieg window.api.openAreaPath
// gebunden (Muster bereiche.spec.js); das Bereichs-Panel ist in einer
// gebundenen Bereichs-App in Spalte 0 standardmaessig sichtbar, sodass die
// Datei-Zeile ohne weiteres Toggeln erscheint.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { PANEL_ACCESS, DEFAULT_PANEL_TOGGLE_ORDER } = require('../../../src/shared/panel-access.js');
// 4T-000777 (Epic 3E-000156): Strg+D ging im Voll-Lauf sporadisch ins Leere (BL-03).
// Der Druck wird wiederholt, bis seine Wirkung sichtbar ist; er ist dafuer
// idempotent — eine bereits gemerkte Datei meldet nur, dass es sie schon gibt.
const { pressUntilVisible } = require('../helpers/eingabe');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');
const PANE = '.pane-group[data-pane="0"]';
// 4T-000372-Marker: der erste Panel-Button des source-toggles-Segments steht erst
// nach applyPanelButtonOrder() am Ende von init(); als Bereitschafts-Signal fuer
// ein frisch geoeffnetes zweites Fenster (Muster launchApp-Helfer).
const FIRST_PANEL_BUTTON_ID = PANEL_ACCESS.find(
  (p) => p.id === DEFAULT_PANEL_TOGGLE_ORDER[0],
).buttonId;

function makeAreaDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scg-md-lz-${name}-`));
  fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n\nInhalt.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

async function bindArea(page, dir) {
  const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
  expect(res.boundExisting).toBe(true);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

async function areaFileRow(page) {
  const row = page.locator(`${PANE} .area-file-row`, { hasText: 'notiz.md' });
  await expect(row).toBeVisible();
  return row;
}

// Liefert true, wenn der Bereichs-Abschnitt vor dem allgemeinen steht.
function areaSectionFirst(page) {
  return page.evaluate((sel) => {
    const gen = document.querySelector(sel + ' .bookmarks-group-general');
    if (!gen || !gen.parentElement) return null;
    const groups = [...gen.parentElement.children].filter((el) =>
      el.classList.contains('bookmarks-group'),
    );
    return groups[0] && groups[0].classList.contains('bookmarks-group-area');
  }, PANE);
}

test.describe('BL-01: Ohne Bereich nur der allgemeine Abschnitt', () => {
  test('Strg+D legt allgemein an; kein Bereichs-Abschnitt, keine Abschnitts-Koepfe', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(`${PANE} .tab`).first()).toBeVisible();
      const star = page.locator('#btn-bookmarks');
      await pressUntilVisible(page, 'Control+d', page.locator('#btn-bookmarks.is-marked'));
      await expect(star).toHaveClass(/is-marked/);
      await expect(page.locator(`${PANE} .sidebar-bookmarks`)).toBeVisible();
      // Bereichs-Abschnitt ausgeblendet, Abschnitts-Koepfe unsichtbar (gewohntes
      // Ein-Abschnitts-Bild ohne Bereich).
      await expect(page.locator(`${PANE} .bookmarks-group-area`)).toBeHidden();
      await expect(
        page.locator(`${PANE} .bookmarks-group-general .bookmarks-group-head`),
      ).toBeHidden();
      await expect(page.locator(`${PANE} .bookmarks-group-general .bookmark-node`)).toHaveCount(1);
      await expect(page.locator(`${PANE} .bookmarks-group-general`)).toContainText('basis');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('BL-02: Bereich — Anlage als Bereichs-Lesezeichen und Zweiteilung', () => {
  test('Kontextmenue der Datei-Zeile legt ein Bereichs-Lesezeichen an; beide Abschnitte sichtbar', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir('bl02');
    try {
      await bindArea(page, dir);
      const row = await areaFileRow(page);
      await row.click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-bookmark"]').click();
      // Bookmarks-Panel wird sichtbar, Bereichs-Abschnitt zeigt den Eintrag.
      await expect(page.locator(`${PANE} .bookmarks-group-area`)).toBeVisible();
      await expect(page.locator(`${PANE} .bookmarks-area-tree .bookmark-node`)).toHaveCount(1);
      await expect(page.locator(`${PANE} .bookmarks-area-tree`)).toContainText('notiz');
      // Beide Abschnitts-Koepfe sichtbar (zweigeteiltes Bild bei Bereich).
      await expect(
        page.locator(`${PANE} .bookmarks-group-area .bookmarks-group-head`),
      ).toBeVisible();
      await expect(
        page.locator(`${PANE} .bookmarks-group-general .bookmarks-group-head`),
      ).toBeVisible();
      // Allgemeiner Abschnitt bleibt leer.
      await expect(page.locator(`${PANE} .bookmarks-group-general .bookmark-node`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BL-03: Bereich — Ziel-Wahl beim Anlegen', () => {
  test('Strg+D bei Datei im Bereich fragt allgemein/Bereich; Wahl allgemein legt allgemein an', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir('bl03');
    try {
      await bindArea(page, dir);
      const row = await areaFileRow(page);
      await row.click();
      await expect.poll(() => page.title()).toContain('notiz');
      // Strg+D -> Ziel-Wahl-Popup mit beiden Optionen.
      const general = page.locator('#context-menu [data-menu-id="bookmark-target-general"]');
      await pressUntilVisible(page, 'Control+d', general);
      const area = page.locator('#context-menu [data-menu-id="bookmark-target-area"]');
      await expect(general).toBeVisible();
      await expect(area).toBeVisible();
      // 4T-000612 (PO-Testbefund EXE 0.91.0.919): Das Ziel-Wahl-Popup liegt oben
      // bei der Menueleiste (dort sitzt das Datei-Menue), nicht unten am
      // Statusbar-Stern. Die obere Kante liegt damit in der oberen Fensterhaelfte.
      const menuBox = await page.locator('#context-menu').boundingBox();
      expect(menuBox).not.toBeNull();
      expect(menuBox.y).toBeLessThan(200);
      // Wahl "Allgemeines Lesezeichen" legt im allgemeinen Abschnitt an.
      await general.click();
      await expect(page.locator(`${PANE} .bookmarks-group-general .bookmark-node`)).toHaveCount(1);
      await expect(page.locator(`${PANE} .bookmarks-area-tree .bookmark-node`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BL-04: Reihenfolge-Schalter', () => {
  test('Bereichs-Lesezeichen oben (Default) laesst sich in den Einstellungen umschalten', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir('bl04');
    try {
      await bindArea(page, dir);
      const row = await areaFileRow(page);
      await row.click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="area-file-bookmark"]').click();
      await expect(page.locator(`${PANE} .bookmarks-group-area`)).toBeVisible();
      // Default: Bereichs-Abschnitt oben.
      await expect.poll(() => areaSectionFirst(page)).toBe(true);
      // Einstellungen oeffnen (Strg+,), Verhalten-Bereich, Schalter aus.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.settings-page').count();
        })
        .toBeGreaterThan(0);
      await page.locator('.settings-nav-entry[data-section-id="behavior"]').click();
      const toggle = page.locator('#settings-bookmarks-area-first');
      await expect(toggle).toBeVisible();
      await toggle.uncheck();
      // Jetzt allgemeiner Abschnitt oben (wirkt sofort).
      await expect.poll(() => areaSectionFirst(page)).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BL-05: Umwandeln zwischen den Abschnitten', () => {
  test('allgemein -> Bereich und zurueck ueber das Kontextmenue', async () => {
    const { app, page, userData } = await launchApp();
    const dir = makeAreaDir('bl05');
    try {
      await bindArea(page, dir);
      const row = await areaFileRow(page);
      await row.click();
      await expect.poll(() => page.title()).toContain('notiz');
      // Als allgemeines Lesezeichen anlegen (Ziel-Wahl -> allgemein).
      const zielAllgemein = page.locator('#context-menu [data-menu-id="bookmark-target-general"]');
      await pressUntilVisible(page, 'Control+d', zielAllgemein);
      await zielAllgemein.click();
      const genNode = page.locator(`${PANE} .bookmarks-group-general .bookmark-node`);
      await expect(genNode).toHaveCount(1);
      // Umwandeln in Bereichs-Lesezeichen.
      await genNode.first().locator('.bookmark-row').click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="bookmark-convert-to-area"]').click();
      await expect(page.locator(`${PANE} .bookmarks-group-general .bookmark-node`)).toHaveCount(0);
      await expect(page.locator(`${PANE} .bookmarks-area-tree .bookmark-node`)).toHaveCount(1);
      // Zurueck in allgemeine Lesezeichen.
      await page
        .locator(`${PANE} .bookmarks-area-tree .bookmark-node`)
        .first()
        .locator('.bookmark-row')
        .click({ button: 'right' });
      await page.locator('#context-menu [data-menu-id="bookmark-convert-to-general"]').click();
      await expect(page.locator(`${PANE} .bookmarks-area-tree .bookmark-node`)).toHaveCount(0);
      await expect(page.locator(`${PANE} .bookmarks-group-general .bookmark-node`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BL-06: Allgemeine Lesezeichen synchronisieren zwischen Fenstern', () => {
  test('ein allgemeines Lesezeichen aus Fenster A erscheint in Fenster B', async () => {
    // 4T-000612 (PO-Testbefund EXE 0.91.0.919): Der globale Lesezeichen-Baum liegt
    // im Store; ein Schreibvorgang in einem Fenster erreichte die anderen bisher
    // nicht (nur die Bereichs-Lesezeichen synchronisierten). Der Fix verteilt
    // den Wechsel per 'bookmarksTree:changed' an die uebrigen Fenster.
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(`${PANE} .tab`).first()).toBeVisible();
      // Fenster A vollstaendig initialisiert abwarten, bevor Strg+D getippt wird:
      // der Tastatur-Dispatch haengt wie die Statusbar-Klicks an bindUi(), das
      // erst am Ende von init() laeuft (siehe Fenster B unten).
      await page.waitForSelector('body[data-renderer-ready]', { timeout: 15000 });
      // Zweites Fenster (neue Applikation, gemeinsamer globaler Store und eigener
      // Renderer mit registriertem Broadcast-Empfang).
      const win2Promise = app.waitForEvent('window');
      await page.evaluate(() => window.api.newApplication());
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      // Ende der asynchronen init() von Fenster B abwarten. Der Panel-Button-Marker
      // (4T-000372) belegt nur, dass applyPanelButtonOrder() gelaufen ist; das
      // passiert im init()-Verlauf jedoch deutlich VOR bindUi(), das die
      // Statusbar-Toggle-Klicks (u.a. #btn-bookmarks) bindet. Ein Klick in diesem
      // Fenster zwischen beiden Schritten verpuffte (Handler noch nicht gebunden),
      // wodurch das Lesezeichen-Panel nie sichtbar wurde. Deshalb zusaetzlich auf
      // das ehrliche Bereitschafts-Signal warten, das erst nach initDone/bindUi
      // gesetzt wird.
      await page2.waitForFunction(
        (expected) => {
          const btn = document.querySelector('.statusbar .source-toggles > button');
          return !!btn && btn.id === expected;
        },
        FIRST_PANEL_BUTTON_ID,
        { timeout: 15000 },
      );
      await page2.waitForSelector('body[data-renderer-ready]', { timeout: 15000 });
      // In Fenster B das Lesezeichen-Panel einblenden — leer bleibt es zunaechst
      // verborgen (Empty-State), erscheint aber, sobald ein Lesezeichen vorliegt.
      // Auf das sichtbare Ergebnis des Toggles warten (Button aktiv), damit der
      // Empfangs-Zustand steht, bevor Fenster A das Lesezeichen anlegt.
      await page2.locator('#btn-bookmarks').click();
      await expect(page2.locator('#btn-bookmarks')).toHaveAttribute('aria-pressed', 'true');
      // In Fenster A per Strg+D ein allgemeines Lesezeichen anlegen (kein Bereich
      // -> ohne Nachfrage allgemein).
      await pressUntilVisible(page, 'Control+d', page.locator('#btn-bookmarks.is-marked'));
      await expect(page.locator('#btn-bookmarks')).toHaveClass(/is-marked/);
      // Fenster B zieht ueber den Broadcast nach: der allgemeine Abschnitt zeigt
      // den Eintrag (ohne den Fix blieb er dauerhaft leer).
      await expect
        .poll(() => page2.locator(`${PANE} .bookmarks-group-general .bookmark-node`).count())
        .toBe(1);
      await expect(page2.locator(`${PANE} .bookmarks-group-general`)).toContainText('basis');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
