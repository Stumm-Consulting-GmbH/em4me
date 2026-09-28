// 4T-001861 (Epic 3E-000300): E2E-Funktions-Specs des Rechtsklicks in die
// gerenderte Pipe-Tabelle der Live-Ansicht. Gemessen hatte der Konzept-Task
// `4T-001710` (Ablaeufe R01, R02): Die Koordinaten-Aufloesung des Editors
// liefert im ersetzenden Tabellen-Widget immer den Tabellen-Anfang, der
// allgemeine Kontextmenue-Weg setzte die Schreibmarke dorthin, und die
// Bearbeitung oeffnete sich in der ersten Kopfzelle.
//
// Die Zellen der Fixture-Tabelle in Dokument-Reihenfolge: 0 A, 1 B, 2 C (Kopf);
// 3 a1, 4 b1, 5 c1; 6 a2, 7 leer, 8 c2.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', 'tabellen-klick.md');
const MENU = '#context-menu';

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const ersteTabelle = (page) => page.locator(`${SEL.editorContent0} .cm-live-block table`).first();
const zelle = (page, index) => ersteTabelle(page).locator('th, td').nth(index);
const eingabe = (page) => page.locator('.cm-live-tabelle-eingabe');
const zeile = (page, text) =>
  page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: text }).first();

// Index der bearbeiteten Zelle unter allen Zellen der Tabelle, oder -1.
async function markierteZelle(page) {
  return await ersteTabelle(page).evaluate((t) =>
    Array.from(t.querySelectorAll('th, td')).findIndex((c) =>
      c.classList.contains('cm-live-tabelle-bearbeitet'),
    ),
  );
}

// Auswahl des Editors und der Text der Zeile, in der ihr Kopf steht.
async function auswahl(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    const { state } = tile.view;
    const haupt = state.selection.main;
    return {
      von: haupt.from,
      bis: haupt.to,
      laenge: state.doc.length,
      zeile: state.doc.lineAt(haupt.head).text,
      spalte: haupt.head - state.doc.lineAt(haupt.head).from,
    };
  }, SEL.editorContent0);
}

async function oeffneZelle(page, index) {
  await zelle(page, index).click();
  await expect(eingabe(page)).toBeVisible();
  await expect.poll(() => markierteZelle(page)).toBe(index);
}

async function rechtsklick(page, index) {
  await zelle(page, index).click({ button: 'right' });
  await expect(page.locator(MENU)).toBeVisible();
}

test.describe('TR-01: Rechtsklick in die Zelle der Schreibmarke', () => {
  test('die Schreibmarke bleibt in der Datenzelle, keine Kopfzelle oeffnet sich (AK1, AK4)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await oeffneZelle(page, 5);
      await rechtsklick(page, 5);
      await expect.poll(() => markierteZelle(page)).toBe(5);
      await expect(eingabe(page)).toHaveValue('c1');
      const stelle = await auswahl(page);
      expect(stelle.zeile).toBe('| a1 | b1 | c1 |');
      expect(stelle.spalte).toBeGreaterThanOrEqual('| a1 | b1 | '.length);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-02: Rechtsklick in eine andere Zelle', () => {
  test('die Schreibmarke landet in der angeklickten Zelle, wie beim Linksklick (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await oeffneZelle(page, 5);
      await rechtsklick(page, 6);
      await expect.poll(() => markierteZelle(page)).toBe(6);
      await expect(eingabe(page)).toHaveValue('a2');
      expect((await auswahl(page)).zeile).toBe('| a2 |  | c2 |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-03: Rechtsklick in Kopfzellen', () => {
  test('eine andere Kopfzelle wird getroffen, die offene bleibt stehen (AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await oeffneZelle(page, 5);
      await rechtsklick(page, 1);
      await expect.poll(() => markierteZelle(page)).toBe(1);
      await expect(eingabe(page)).toHaveValue('B');
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();
      // Die Kopfzelle der Schreibmarke: erneut rechtsklicken, sie bleibt offen.
      await rechtsklick(page, 1);
      await expect.poll(() => markierteZelle(page)).toBe(1);
      expect((await auswahl(page)).zeile).toBe('| A | B | C |');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-04: Rechtsklick in eine bestehende Auswahl', () => {
  test('die Auswahl bleibt erhalten (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await zeile(page, 'Absatz vor der Tabelle.').click();
      await page.keyboard.press('Control+a');
      const vorher = await auswahl(page);
      expect(vorher.bis - vorher.von).toBe(vorher.laenge);
      await rechtsklick(page, 4);
      const nachher = await auswahl(page);
      expect(nachher.von).toBe(vorher.von);
      expect(nachher.bis).toBe(vorher.bis);
      expect(await markierteZelle(page)).toBe(-1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-05: Rechtsklick ausserhalb der Tabelle', () => {
  test('setzt die Schreibmarke wie bisher an die Klick-Stelle (AK7)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await oeffneZelle(page, 5);
      await zeile(page, 'Absatz nach der Tabelle.').click({
        button: 'right',
        position: { x: 4, y: 4 },
      });
      await expect(page.locator(MENU)).toBeVisible();
      const stelle = await auswahl(page);
      expect(stelle.zeile).toBe('Absatz nach der Tabelle.');
      expect(stelle.spalte).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-06: Kontextmenue an der Klick-Stelle, Schliessen ohne Auswahl', () => {
  test('das Menue steht am Zeiger, nach Escape steht die Schreibmarke unveraendert (AK12)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await zeile(page, 'Absatz vor der Tabelle.').click();
      const box = await zelle(page, 3).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.click(x, y, { button: 'right' });
      await expect(page.locator(MENU)).toBeVisible();
      const menue = await page.locator(MENU).boundingBox();
      expect(Math.abs(menue.x - x)).toBeLessThanOrEqual(2);
      expect(Math.abs(menue.y - y)).toBeLessThanOrEqual(2);
      await expect.poll(() => markierteZelle(page)).toBe(3);
      const vorher = await auswahl(page);
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();
      await expect(eingabe(page)).toHaveValue('a1');
      expect(await markierteZelle(page)).toBe(3);
      expect(await auswahl(page)).toEqual(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-07: Rechtsklick waehrend der Zell-Eingabe', () => {
  test('die Eingabe bleibt stehen, auch nach dem Schliessen des Menues (AK13)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await oeffneZelle(page, 4);
      await page.keyboard.press('End');
      await page.keyboard.type('XX');
      await rechtsklick(page, 4);
      await expect(eingabe(page)).toHaveValue('b1XX');
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();
      await expect(eingabe(page)).toHaveValue('b1XX');
      await zeile(page, 'Absatz nach der Tabelle.').click();
      await expect(eingabe(page)).toHaveCount(0);
      await expect(zelle(page, 4)).toHaveText('b1XX');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TR-08: Eintrag des Kontextmenues wirkt an der Stelle des Rechtsklicks', () => {
  test('Zeile loeschen nach Rechtsklick in die zweite Datenzeile loescht genau diese (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveBearbeiten(app, page);
      await oeffneZelle(page, 5);
      await rechtsklick(page, 6);
      await page.locator(`${MENU} [data-menu-id="table"]`).hover();
      await page.locator(`${MENU} [data-menu-id="table-row-delete"]`).click();
      await expect(ersteTabelle(page).locator('tbody tr')).toHaveCount(1);
      await expect(zelle(page, 3)).toHaveText('a1');
      await expect(zelle(page, 0)).toHaveText('A');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
