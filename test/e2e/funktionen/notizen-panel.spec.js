// 4T-000359 / 4T-000398 (Epic 3E-000066): E2E-Suite Notizen-Panel. Das Editier-Feld
// ist eine schlanke CodeMirror-Instanz (4T-000398). Deckt Laden und impliziten Save
// in die .mdd, die Vorschau-Umschaltung, den Vorschau-Default, den Unbenannt-
// Hinweis sowie Format-Kürzel und Kontextmenü im Notiz-Feld ab. NP-01 sichert
// zusätzlich ab, dass das eigene note:changed-Echo bei nur einem Fenster keinen
// Konflikt-Hinweis mehr auslöst. Der Datenpfad ist in notizen-datenpfad.spec.js
// (4T-000358) getestet, die Konflikt-Entscheidung in test/unit/renderer/notes-sync.test.js.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

function makeWorkFile(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, '# Notiz-Test\n\nInhalt.\n', 'utf8');
  return { workDir, workFile };
}

function mddPathOf(mdPath) {
  return mdPath.replace(/\.md$/, '.mdd');
}

// Legt die .mdd mit einer vorhandenen Notiz an. Der geladene Text im Editor ist
// das deterministische Ready-Signal (renderNotes ist async).
function seedNote(workFile, text) {
  const mdd = {
    schemaVersion: 1,
    history: { anchors: [], packets: [] },
    notes: { text, updated: '2026-07-07T00:00:00Z' },
  };
  fs.writeFileSync(mddPathOf(workFile), JSON.stringify(mdd, null, 2) + '\n', 'utf8');
}

function readNoteText(mdPath) {
  try {
    return JSON.parse(fs.readFileSync(mddPathOf(mdPath), 'utf8')).notes?.text ?? null;
  } catch {
    return null;
  }
}

// Profil mit abgeschalteter Vorschau-Vorbelegung: der Editor ist beim Öffnen
// sichtbar (Eingabe-Tests). Der Default (Vorschau an) wird in NP-04 geprüft.
function editorProfile() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-notiz-profil-'));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ notes: { previewByDefault: false } }),
    'utf8',
  );
  return userData;
}

const PANE0 = '.pane-group[data-pane="0"]';
const NOTES_EDITOR = `${PANE0} .sidebar-notes .notes-editor`;
const NOTES_CM = `${NOTES_EDITOR} .cm-content`;
const NOTES_PREVIEW = `${PANE0} .sidebar-notes .notes-preview`;
const NOTES_EMPTY = `${PANE0} .sidebar-notes .notes-empty`;
const NOTES_CONFLICT = `${PANE0} .sidebar-notes .notes-conflict`;
const NOTES_TOGGLE = `${PANE0} .sidebar-notes .notes-preview-toggle`;

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function replaceNote(page, text) {
  const cm = page.locator(NOTES_CM);
  await cm.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
}

test.describe('NP-01: Notiz eingeben, speichern und wiederfinden', () => {
  test('Panel-Eingabe landet in der .mdd, kein falscher Konflikt, laedt beim erneuten Öffnen', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notizpanel-np01-');
    seedNote(workFile, 'Alt');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: editorProfile(),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleNotes');
      // Geladener Text ist das Ready-Signal (renderNotes fertig).
      await expect(page.locator(NOTES_CM)).toHaveText('Alt');
      await replaceNote(page, 'Neu');
      await expect.poll(() => readNoteText(workFile)).toBe('Neu');
      // Regression (4T-000359): das eigene note:changed-Echo darf keinen Konflikt-
      // Hinweis auslösen.
      await expect(page.locator(NOTES_CONFLICT)).toBeHidden();

      // Panel schließen und wieder öffnen: die Notiz wird neu geladen.
      await sendMenuChannel(app, 'menu:toggleNotes');
      await expect(page.locator(NOTES_EDITOR)).toBeHidden();
      await sendMenuChannel(app, 'menu:toggleNotes');
      await expect(page.locator(NOTES_CM)).toHaveText('Neu');
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('NP-02: Vorschau-Umschaltung rendert die Notiz', () => {
  test('Vorschau-Button zeigt gerendertes Markdown, der Editor wird ausgeblendet', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notizpanel-np02-');
    seedNote(workFile, 'Text mit **fett**.');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: editorProfile(),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleNotes');
      await expect(page.locator(NOTES_CM)).toContainText('fett');
      await page.locator(NOTES_TOGGLE).click();
      const preview = page.locator(NOTES_PREVIEW);
      await expect(preview).toBeVisible();
      await expect(preview.locator('strong')).toHaveText('fett');
      await expect(page.locator(NOTES_EDITOR)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('NP-03: Unbenannte Datei zeigt einen Hinweis statt eines Editors', () => {
  test('ohne Datei-Pfad ist der Editor ausgeblendet und der Hinweis sichtbar', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notizpanel-np03-');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: editorProfile(),
    });
    try {
      await waitForTab(page);
      // Neuer, unbenannter Tab wird aktiv (IPC-Reihenfolge: erst neu, dann Panel).
      await sendMenuChannel(app, 'menu:new');
      await sendMenuChannel(app, 'menu:toggleNotes');
      await expect(page.locator(NOTES_EMPTY)).toBeVisible();
      await expect(page.locator(NOTES_EDITOR)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('NP-04: Vorschau standardmäßig aktiv', () => {
  test('ohne abweichende Einstellung öffnet das Panel in der Vorschau, nicht im Editor', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notizpanel-np04-');
    seedNote(workFile, 'Vorschau-Notiz');
    // Frisches Profil ohne notes.previewByDefault → Default an.
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleNotes');
      await expect(page.locator(NOTES_PREVIEW)).toBeVisible();
      await expect(page.locator(NOTES_EDITOR)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('NP-05: Formatierungs-Kürzel und Kontextmenü im Notiz-Feld', () => {
  test('Strg+B formatiert die Auswahl und Rechtsklick öffnet das Editor-Kontextmenü', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notizpanel-np05-');
    seedNote(workFile, 'wort');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: editorProfile(),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleNotes');
      const cm = page.locator(NOTES_CM);
      await expect(cm).toHaveText('wort');
      // Strg+B umschließt die Auswahl mit ** (Format-Kommando wie im Haupt-Editor).
      await cm.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Control+b');
      await expect(cm).toHaveText('**wort**');
      // Rechtsklick öffnet das geteilte Editor-Kontextmenü.
      await cm.click({ button: 'right' });
      const menu = page.locator('#context-menu');
      await expect(menu).toBeVisible();
      await expect(menu.locator('.context-menu-item').first()).toBeVisible();
      await page.keyboard.press('Escape');
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
