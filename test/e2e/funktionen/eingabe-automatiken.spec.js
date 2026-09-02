// 4T-000603 / 4T-000604 (Epic 3E-000113): E2E-Suite fuer die Eingabe-Automatiken.
//
// EA-01 bis EA-07: Link-Einfuegen in die Auswahl (Paste-Handler). Die reinen
// Erkennungs- und Klammer-Regeln sind in den Unit-Tests bewiesen
// (markdown-format.test.js); hier laeuft der echte Editor-Paste-Pfad,
// inklusive des Falls „Schalter aus", der absichert, dass der eingebaute
// lang-markdown-Paste-Handler wirklich abgeschaltet ist.
//
// EA-08 bis EA-10: Erstellungs- und Aenderungszeitpunkt beim Speichern. Die
// Regel-Matrix liegt in frontmatter-timestamps.test.js; hier laeuft der echte
// Speicher-Pfad ueber Strg+S, inklusive Aus-Zustand der Erweiterung und des
// Falls „fehlende Felder ohne Anlage-Option".
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

// electron-store nutzt dot-notation: gepunktete Keys werden nested abgelegt.
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Quell-Ansicht und Edit-Modus (Muster datums-picker.spec.js).
async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

test.describe('EA-01: Link-Einfuegen in die Auswahl', () => {
  test('URL plus markierte Auswahl ergibt [Auswahl](URL)', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org'));
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nAnkertext');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+v');
      await expect(
        editor.locator('.cm-line', { hasText: '[Ankertext](https://example.org)' }),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EA-02: Paste ohne Auswahl bleibt normales Einfuegen', () => {
  test('leere Auswahl fuegt die URL unveraendert als Text ein', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org'));
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n');
      await page.keyboard.press('Control+v');
      await expect(editor.locator('.cm-line', { hasText: 'https://example.org' })).toBeVisible();
      // Keine Link-Struktur, weil ohne Auswahl das normale Einfuegen greift.
      await expect(editor.locator('.cm-line', { hasText: '](https://example.org)' })).toHaveCount(
        0,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EA-03: URL mit Klammern wird in Spitze-Klammern eingefuegt', () => {
  test('Klammer-URL plus Auswahl ergibt [Auswahl](<URL>)', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) =>
        clipboard.writeText('https://en.wikipedia.org/wiki/Foo_(bar)'),
      );
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nAnker');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+v');
      await expect(
        editor.locator('.cm-line', {
          hasText: '[Anker](<https://en.wikipedia.org/wiki/Foo_(bar)>)',
        }),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EA-04: Auswahl im Code-Kontext bleibt normales Einfuegen', () => {
  test('markierter Text im Code-Block wird nicht zum Link', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org'));
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n```\ncodeanker\n```');
      // Wort im Fence per Doppelklick markieren, dann einfuegen.
      await editor.locator('.cm-line', { hasText: 'codeanker' }).dblclick();
      await page.keyboard.press('Control+v');
      // Kein Link, weil positionInsideCode den Handler zuruecktreten laesst.
      await expect(editor.locator('.cm-line', { hasText: '](https://example.org)' })).toHaveCount(
        0,
      );
      await expect(editor.locator('.cm-line', { hasText: 'https://example.org' })).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EA-05: Schalter aus deaktiviert die Automatik vollstaendig', () => {
  test('bei ausgeschaltetem Schalter entsteht kein Link (lang-markdown ist abgeschaltet)', async () => {
    const seeded = seedProfile({ input: { pasteUrlAsLink: false } });
    const { app, page, userData } = await launchApp({ args: [BASIS], userData: seeded });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org'));
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nAnkertext');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+v');
      await expect(editor.locator('.cm-line', { hasText: 'https://example.org' })).toBeVisible();
      await expect(editor.locator('.cm-line', { hasText: '](https://example.org)' })).toHaveCount(
        0,
      );
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(seeded, { recursive: true, force: true });
    }
  });
});

test.describe('EA-06: Undo nimmt die Umwandlung in einem Schritt zurueck', () => {
  test('nach dem Link stellt Strg+Z die Auswahl wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org'));
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nAnkertext');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+v');
      await expect(
        editor.locator('.cm-line', { hasText: '[Ankertext](https://example.org)' }),
      ).toBeVisible();
      await page.keyboard.press('Control+z');
      await expect(editor.locator('.cm-line', { hasText: 'Ankertext' })).toBeVisible();
      await expect(editor.locator('.cm-line', { hasText: '](https://example.org)' })).toHaveCount(
        0,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('EA-07: Strg+Umschalt+V bleibt reines Einfuegen', () => {
  // Befund PO-Test 4T-000603: das paste-Ereignis kennt den Umschalt-Zustand
  // nicht, der Handler merkt ihn sich ueber den vorausgehenden keydown.
  test('mit Umschalt entsteht kein Link, danach greift Strg+V wieder', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);
      await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org'));
      const editor = page.locator(SEL.editorContent0);
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nAnkertext');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+Shift+v');
      // Reines Einfuegen: die URL ersetzt die Auswahl, keine Link-Struktur.
      await expect(editor.locator('.cm-line', { hasText: 'https://example.org' })).toBeVisible();
      await expect(editor.locator('.cm-line', { hasText: '](https://example.org)' })).toHaveCount(
        0,
      );
      // Der gemerkte Zustand darf nicht haengen bleiben: normales Strg+V wirkt wieder.
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nZweiter');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Control+v');
      await expect(
        editor.locator('.cm-line', { hasText: '[Zweiter](https://example.org)' }),
      ).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- 4T-000604: Erstellungs- und Aenderungszeitpunkt beim Speichern ------------

const TS_ON = {
  createdEnabled: true,
  updatedEnabled: true,
  autoCreateField: true,
  timestampFormat: 'datetime',
};

function makeWorkFile(prefix, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, 'notiz.md');
  fs.writeFileSync(file, content, 'utf8');
  return { dir, file };
}

// Tippt eine Zeile und speichert mit Strg+S (echter Nutzungspfad).
async function typeAndSave(app, page) {
  await enterEditSource(app, page);
  const editor = page.locator(SEL.editorContent0);
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nNeue Zeile');
  await page.keyboard.press('Control+s');
}

test.describe('EA-08: Zeitstempel beim Speichern', () => {
  // Genau die Konstellation aus dem PO-Test: vorhandene, aber leere Felder.
  test('leere created/updated werden beim Speichern gefuellt', async () => {
    const seeded = seedProfile({ frontmatter: TS_ON });
    const { dir, file } = makeWorkFile(
      'ea-ts-',
      '---\ntitel: Test\ncreated:\nupdated:\n---\n\nInhalt\n',
    );
    const { app, page, userData } = await launchApp({ args: [file], userData: seeded });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await typeAndSave(app, page);
      await expect
        .poll(() => fs.readFileSync(file, 'utf8'))
        .toMatch(/updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      const saved = fs.readFileSync(file, 'utf8');
      expect(saved).toMatch(/created: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      // Restliches Frontmatter und Body bleiben erhalten.
      expect(saved).toContain('titel: Test');
      expect(saved).toContain('Neue Zeile');
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(seeded, { recursive: true, force: true });
    }
  });
});

test.describe('EA-09: Erweiterung aus laesst das Dokument unberuehrt', () => {
  test('bei abgeschalteter Erweiterung bleiben die Felder leer', async () => {
    const seeded = seedProfile({
      frontmatter: TS_ON,
      extensions: { disabled: ['frontmatter-timestamps'] },
    });
    const { dir, file } = makeWorkFile(
      'ea-ts-aus-',
      '---\ntitel: Test\ncreated:\nupdated:\n---\n\nInhalt\n',
    );
    const { app, page, userData } = await launchApp({ args: [file], userData: seeded });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await typeAndSave(app, page);
      // Auf das Speichern warten (Body-Zeile ist der Beleg), dann pruefen.
      await expect.poll(() => fs.readFileSync(file, 'utf8')).toContain('Neue Zeile');
      const saved = fs.readFileSync(file, 'utf8');
      expect(saved).not.toMatch(/created: \d{4}/);
      expect(saved).not.toMatch(/updated: \d{4}/);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(seeded, { recursive: true, force: true });
    }
  });
});

test.describe('EA-10: ohne Anlage-Option bleiben fehlende Felder unberuehrt', () => {
  test('fehlende Felder werden nicht angelegt', async () => {
    const seeded = seedProfile({
      frontmatter: {
        createdEnabled: true,
        updatedEnabled: true,
        autoCreateField: false,
        timestampFormat: 'datetime',
      },
    });
    const { dir, file } = makeWorkFile('ea-ts-noauto-', '---\ntitel: Test\n---\n\nInhalt\n');
    const { app, page, userData } = await launchApp({ args: [file], userData: seeded });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await typeAndSave(app, page);
      await expect.poll(() => fs.readFileSync(file, 'utf8')).toContain('Neue Zeile');
      const saved = fs.readFileSync(file, 'utf8');
      expect(saved).not.toContain('created');
      expect(saved).not.toContain('updated');
      expect(saved).toContain('titel: Test');
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(seeded, { recursive: true, force: true });
    }
  });
});
