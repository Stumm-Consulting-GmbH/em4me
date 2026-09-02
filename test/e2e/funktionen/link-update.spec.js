// 4T-000345 (Epic 3E-000062): E2E-Funktions-Suite Link-Update beim Umbenennen.
// Deckt die Disk-Anpassung eingehender Links (Wiki/Embed/Markdown), die
// Dirty-Buffer-Semantik mit Undo, die Umbenennen-Kaskade und das Abschalten
// (updateLinks false) ab. describe-Titel tragen die Matrix-IDs (LU-*).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const SEP = '∕'; // U+2215 Division Slash

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-linkupdate-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function openRenameDialog(app, page) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:renameFile');
  });
  await expect(page.locator('#name-input-modal')).toBeVisible();
}

// Standard-Flow bei aktivem Update und aktiver Vorschau: Vorschau bestaetigen,
// dann den Ergebnis-Bericht schliessen.
async function continuePreviewAndReport(page) {
  await expect(page.locator('#link-preview-modal')).toBeVisible();
  await page.locator('#btn-link-preview-continue').click();
  await expect(page.locator('#link-report-modal')).toBeVisible();
  await page.locator('#btn-link-report-ok').click();
  await expect(page.locator('#link-report-modal')).toBeHidden();
}

test.describe('LU-01: Link-Update auf Disk (Wiki, Embed, Markdown)', () => {
  test('B umbenennen passt eingehende Wiki-, Embed- und Markdown-Links in A auf Disk an', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nWiki: [[B]]\nEmbed: ![[B]]\nMd: [Link](B.md)\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n\nInhalt.\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await openRenameDialog(app, page);
      await page.locator('#name-input-field').fill('C');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await continuePreviewAndReport(page);
      await expect(page.locator(SEL.activeTab0)).toContainText('C.md');
      // A auf Disk: alle drei Link-Formen zeigen jetzt auf C.
      await expect.poll(() => fs.readFileSync(aFile, 'utf8'), { timeout: 5000 }).toContain('[[C]]');
      const a = fs.readFileSync(aFile, 'utf8');
      expect(a).toContain('Wiki: [[C]]');
      expect(a).toContain('Embed: ![[C]]');
      expect(a).toContain('Md: [Link](C.md)');
      expect(a).not.toContain('[[B]]');
      expect(a).not.toContain('(B.md)');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-02: Link-Update bei Umbenennen-Kaskade', () => {
  test('Eltern umbenennen passt Links auf Eltern und Nachfahren in einer Fremd-Datei an', async () => {
    const dir = makeDir();
    const fremd = path.join(dir, 'Fremd.md');
    fs.writeFileSync(fremd, '# Fremd\n\nEltern: [[Eltern]]\nKind: [[Eltern/Kind]]\n', 'utf8');
    const eltern = path.join(dir, 'Eltern.md');
    fs.writeFileSync(eltern, '# Eltern\n', 'utf8');
    fs.writeFileSync(path.join(dir, `Eltern${SEP}Kind.md`), '# Kind\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [eltern] });
    try {
      await waitForTab(page);
      await openRenameDialog(app, page);
      await expect(page.locator('#name-input-field')).toHaveValue('Eltern');
      await page.locator('#name-input-field').fill('Neu');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await continuePreviewAndReport(page);
      // Fremd.md: sowohl der Eltern- als auch der Nachfahren-Link angepasst.
      await expect
        .poll(() => fs.readFileSync(fremd, 'utf8'), { timeout: 5000 })
        .toContain('[[Neu/Kind]]');
      const f = fs.readFileSync(fremd, 'utf8');
      expect(f).toContain('Eltern: [[Neu]]');
      expect(f).toContain('Kind: [[Neu/Kind]]');
      expect(f).not.toContain('[[Eltern');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-03: dirty Buffer-Fix als Undo-Transaktion', () => {
  test('A dirty: Buffer traegt Fix plus ungespeicherte Aenderung, Disk nur den Fix, Strg+Z nimmt den Fix zurueck', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nLink: [[B]]\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [aFile] });
    try {
      await waitForTab(page);
      // A editierbar machen und eine ungespeicherte Aenderung tippen.
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nUngespeichert.');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      // B direkt umbenennen (nicht ueber den Dialog, damit A aktiv/dirty bleibt).
      await page.evaluate(async (bp) => {
        await window.api.renameFile(bp, 'C', true);
      }, bFile);
      // Buffer von A: Link gefixt UND die eigene ungespeicherte Aenderung erhalten;
      // Tab bleibt dirty.
      await expect(editor).toContainText('[[C]]');
      await expect(editor).toContainText('Ungespeichert.');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      // Disk von A: nur der Fix auf dem letzten gespeicherten Stand, NICHT die
      // ungespeicherte Aenderung.
      const aDisk = fs.readFileSync(aFile, 'utf8');
      expect(aDisk).toContain('[[C]]');
      expect(aDisk).not.toContain('Ungespeichert.');
      // Strg+Z nimmt den Buffer-Fix als eine Einheit zurueck; die eigene
      // Aenderung bleibt.
      await editor.click();
      await page.keyboard.press('Control+z');
      await expect(editor).toContainText('[[B]]');
      await expect(editor).toContainText('Ungespeichert.');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-04: Link-Update abschaltbar (updateLinks false)', () => {
  test('updateLinks false laesst eingehende Links unveraendert', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nLink: [[B]]\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await page.evaluate(async (bp) => {
        await window.api.renameFile(bp, 'C', false);
      }, bFile);
      await expect.poll(() => fs.existsSync(path.join(dir, 'C.md')), { timeout: 5000 }).toBe(true);
      const a = fs.readFileSync(aFile, 'utf8');
      expect(a).toContain('[[B]]');
      expect(a).not.toContain('[[C]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-05: Dialog-Checkbox schaltet das Link-Update pro Vorgang ab', () => {
  test('updateLinks-Checkbox abgewaehlt laesst fremde Links unveraendert', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nLink: [[B]]\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await openRenameDialog(app, page);
      await page.locator('#name-input-cb-updateLinks').uncheck();
      // Vorschau-Checkbox ist ohne aktives Update deaktiviert.
      await expect(page.locator('#name-input-cb-showPreview')).toBeDisabled();
      await page.locator('#name-input-field').fill('C');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect.poll(() => fs.existsSync(path.join(dir, 'C.md')), { timeout: 5000 }).toBe(true);
      const a = fs.readFileSync(aFile, 'utf8');
      expect(a).toContain('[[B]]');
      expect(a).not.toContain('[[C]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-06: Vorschau listet betroffene Dateien, Abbrechen bricht ab', () => {
  test('Vorschau zeigt die Quelldatei; Abbrechen laesst Umbenennung und Links unveraendert', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nLink: [[B]]\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await openRenameDialog(app, page);
      // Update und Vorschau sind Standard aktiv; Namen eingeben, bestaetigen.
      await page.locator('#name-input-field').fill('C');
      await page.locator('#btn-name-input-ok').click();
      // Vorschau-Dialog erscheint und listet A.md mit Fundstellen-Zahl.
      await expect(page.locator('#link-preview-modal')).toBeVisible();
      await expect(page.locator('#link-preview-list')).toContainText('A.md');
      await page.locator('#btn-link-preview-cancel').click();
      await expect(page.locator('#link-preview-modal')).toBeHidden();
      // Nichts ist passiert: B existiert weiter, C nicht, A unveraendert.
      expect(fs.existsSync(bFile)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'C.md'))).toBe(false);
      expect(fs.readFileSync(aFile, 'utf8')).toContain('[[B]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-07: Ergebnis-Bericht nach dem Link-Update', () => {
  test('Bericht zeigt die umbenannte und die angepasste Datei', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nLink: [[B]]\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await openRenameDialog(app, page);
      // Vorschau abwaehlen (direkt umbenennen), Update aktiv lassen.
      await page.locator('#name-input-cb-showPreview').uncheck();
      await page.locator('#name-input-field').fill('C');
      await page.locator('#btn-name-input-ok').click();
      // Bericht-Dialog erscheint mit umbenannter (C.md) und angepasster (A.md) Datei.
      await expect(page.locator('#link-report-modal')).toBeVisible();
      await expect(page.locator('#link-report-body')).toContainText('C.md');
      await expect(page.locator('#link-report-body')).toContainText('A.md');
      await page.locator('#btn-link-report-ok').click();
      await expect(page.locator('#link-report-modal')).toBeHidden();
      expect(fs.readFileSync(aFile, 'utf8')).toContain('[[C]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('LU-08: Einstellung steuert die Checkbox-Vorbelegung', () => {
  test('renameUpdateLinks false belegt die Dialog-Checkbox abgewaehlt vor', async () => {
    const dir = makeDir();
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await page.evaluate(async () => {
        await window.api.setSetting('renameUpdateLinks', false);
      });
      await openRenameDialog(app, page);
      await expect(page.locator('#name-input-cb-updateLinks')).not.toBeChecked();
      await expect(page.locator('#name-input-cb-showPreview')).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(page.locator('#name-input-modal')).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
