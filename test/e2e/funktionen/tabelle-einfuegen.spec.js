// 4T-002554 (Epic 3E-000389): E2E-Suite für das Einfügen aus einer
// Tabellenkalkulation.
//
// Die Zwischenablage wird im Hauptprozess mit der Ablage belegt, die Microsoft
// Excel am 2026-11-05 nachweislich hineinlegt: Text, Tabellen-Form und ein Bild
// der Zellen. Eingefügt wird dann über die echten Bedienwege, Strg+V als
// Tastendruck und das Kontextmenü, sodass Chromium das Einfüge-Ereignis selbst
// aus der Zwischenablage baut.
//
// TE-01: Strg+V ergibt eine Pipe-Tabelle mit Kopfzeile und Hinweis, ein Strg+Z
// führt auf den reinen Text (AK1, AK5). TE-02: Kontextmenü «Einfügen» läuft
// über denselben Zweig, «Als reinen Text einfügen» und «Als Tabelle einfügen»
// stehen dahinter (AK1, AK2). TE-03: im Code-Block und mit Strg+Umschalt+V
// bleibt es beim reinen Text (AK2). TE-04: im Aus-Zustand der Erweiterung
// reiner Text, «Als Tabelle einfügen» fehlt (AK3).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;

const EXCEL_TEXT = 'Name\tWert\r\nAlpha\t12.5\r\nBe|ta\t7\r\nGamma\t"zwei\nZeilen"\r\n';
const EXCEL_HTML =
  '<html><head><meta name=ProgId content=Excel.Sheet></head><body><table border=0>' +
  '<!--StartFragment--><tr><td>Name</td><td>Wert</td></tr><tr><td>Alpha</td><td>12.5</td></tr>' +
  '<tr><td>Be|ta</td><td>7</td></tr><tr><td>Gamma</td><td>zwei<br />Zeilen</td></tr>' +
  '<!--EndFragment--></table></body></html>';
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TABELLE = [
  '| Name   | Wert        |',
  '| ------ | ----------- |',
  '| Alpha  | 12.5        |',
  '| Be\\|ta | 7           |',
  '| Gamma  | zwei Zeilen |',
];

function makeWorkDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedProfile(settings) {
  const dir = makeWorkDir('te-seed-');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

function dokument(inhalt) {
  const file = path.join(makeWorkDir('te-'), 'Tabelle.md');
  fs.writeFileSync(file, inhalt, 'utf8');
  return file;
}

async function sendMenuChannel(app, channel, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function enterEditSource(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Belegt die Zwischenablage wie Excel: Text, Tabellen-Form, Bild der Zellen.
async function excelAblage(app) {
  await hauptSenden(
    app,
    ({ clipboard, nativeImage }, a) => {
      clipboard.write({
        text: a.text,
        html: a.html,
        image: nativeImage.createFromDataURL(a.png),
      });
    },
    { text: EXCEL_TEXT, html: EXCEL_HTML, png: PNG_DATA_URL },
  );
}

async function zeilen(page) {
  return page.locator(SEL.editorContent0).locator('.cm-line').allTextContents();
}

// Schreibmarke auf die leere letzte Zeile des Dokuments.
async function ansEnde(page) {
  await page.locator(SEL.editorContent0).click();
  await page.keyboard.press('Control+End');
}

test.describe('TE-01: Strg+V aus der Tabellenkalkulation (AK1, AK5)', () => {
  test('ergibt eine Pipe-Tabelle mit Kopfzeile; Strg+Z stellt den reinen Text her', async () => {
    const { app, page, userData } = await launchApp({
      args: [dokument('# Probe\n\nAbsatz oben\n')],
    });
    try {
      await enterEditSource(app, page);
      await excelAblage(app);
      await ansEnde(page);
      await page.keyboard.press('Control+v');
      await expect.poll(() => zeilen(page)).toEqual(['# Probe', '', 'Absatz oben', '', ...TABELLE]);
      await expect(page.locator('#statusbar-hint')).toContainText(/Strg\+Z|Ctrl\+Z/);
      // Kein Bild der Zellen als Anlage.
      expect((await zeilen(page)).join('\n')).not.toContain('![');

      await page.keyboard.press('Control+z');
      await expect
        .poll(() => zeilen(page))
        .toEqual([
          '# Probe',
          '',
          'Absatz oben',
          'Name\tWert',
          'Alpha\t12.5',
          'Be|ta\t7',
          'Gamma\t"zwei',
          'Zeilen"',
          '',
        ]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TE-02: Kontextmenü «Einfügen» und die beiden Einfüge-Befehle (AK1, AK2)', () => {
  test('«Einfügen» wandelt um, «Als reinen Text einfügen» fügt unverändert ein', async () => {
    const { app, page, userData } = await launchApp({
      args: [dokument('# Probe\n\nAbsatz oben\n\n')],
    });
    try {
      await enterEditSource(app, page);
      await excelAblage(app);
      await ansEnde(page);
      const editor = page.locator(SEL.editorContent0);
      const letzte = editor.locator('.cm-line').last();
      await letzte.click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      const ids = await page
        .locator(`${MENU} [data-menu-id]`)
        .evaluateAll((els) => els.map((el) => el.dataset.menuId));
      const i = ids.indexOf('paste');
      expect(ids.slice(i, i + 3)).toEqual(['paste', 'pastePlain', 'pasteAsTable']);
      await page.locator(item('paste')).click();
      await expect.poll(() => zeilen(page)).toEqual(['# Probe', '', 'Absatz oben', '', ...TABELLE]);

      // «Als reinen Text einfügen» unter der Tabelle: der Text unverändert.
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await editor
        .locator('.cm-line')
        .last()
        .click({ button: 'right', position: { x: 4, y: 4 } });
      await page.locator(item('pastePlain')).click();
      await expect(editor.locator('.cm-line', { hasText: 'Alpha\t12.5' })).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TE-03: reiner Text im Code-Block und mit Strg+Umschalt+V (AK2)', () => {
  test('keine Umwandlung im Code-Block und beim reinen Einfügen', async () => {
    const { app, page, userData } = await launchApp({
      args: [dokument('# Probe\n\n```\nCODE\n```\n\n')],
    });
    try {
      await enterEditSource(app, page);
      await excelAblage(app);
      const editor = page.locator(SEL.editorContent0);
      await editor.locator('.cm-line', { hasText: 'CODE' }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Control+v');
      await expect(editor.locator('.cm-line', { hasText: 'Alpha\t12.5' })).toHaveCount(1);
      await expect(editor.locator('.cm-line', { hasText: '| ---' })).toHaveCount(0);

      await page.keyboard.press('Control+End');
      await page.keyboard.press('Control+Shift+V');
      await expect(editor.locator('.cm-line', { hasText: 'Alpha\t12.5' })).toHaveCount(2);
      await expect(editor.locator('.cm-line', { hasText: '| ---' })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TE-04: Aus-Zustand der Erweiterung «Tabellen-Werkzeuge» (AK3)', () => {
  test('Strg+V fügt reinen Text ein, «Als Tabelle einfügen» fehlt im Menü', async () => {
    const userDataSeed = seedProfile({ extensions: { disabled: ['table-tools'] } });
    const { app, page, userData } = await launchApp({
      args: [dokument('# Probe\n\nAbsatz oben\n')],
      userData: userDataSeed,
    });
    try {
      await enterEditSource(app, page);
      await excelAblage(app);
      await ansEnde(page);
      await page.keyboard.press('Control+v');
      const editor = page.locator(SEL.editorContent0);
      await expect(editor.locator('.cm-line', { hasText: 'Alpha\t12.5' })).toHaveCount(1);
      await expect(editor.locator('.cm-line', { hasText: '| ---' })).toHaveCount(0);
      expect((await zeilen(page)).join('\n')).not.toContain('![');

      await editor
        .locator('.cm-line', { hasText: 'Absatz oben' })
        .click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(item('pastePlain'))).toBeVisible();
      await expect(page.locator(item('pasteAsTable'))).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
