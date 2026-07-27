// 4T-0358 (Epic 3E-0066): E2E-Suite Dokument-Notiz — Datenpfad über die
// IPC-Bridge (note:read/note:write), ohne UI-Panel (das folgt in 4T-0359).
// Deckt den Schreib-/Lese-Roundtrip samt Leeren, den Mitzug beim Umbenennen
// und die Unabhängigkeit von der Historisierungs-Schaltung ab. describe-Titel
// tragen die Szenario-IDs (NT-*); die Zuordnung zum Funktions-Katalog entsteht
// mit der Hilfe-Pflege in 4T-0360.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { warteAufJson } = require('../helpers/dateien');

function makeWorkFile(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, '# Notiz-Test\n\nInhalt.\n', 'utf8');
  return { workDir, workFile };
}

function mddPathOf(mdPath) {
  return mdPath.replace(/\.md$/, '.mdd');
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('NT-01: Notiz schreiben, lesen und leeren über die IPC-Bridge', () => {
  test('writeNote legt die .mdd mit notes-Sektion an, readNote liest sie, leerer Text entfernt sie', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notiz-nt01-');
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);

      // Schreiben: Notiz landet in der neu angelegten .mdd.
      const written = await page.evaluate(
        (p) => window.api.writeNote(p, 'Meine **Notiz** mit Markdown.'),
        workFile,
      );
      expect(written.ok).toBe(true);
      expect(written.note.text).toBe('Meine **Notiz** mit Markdown.');
      expect(typeof written.note.updated).toBe('string');
      const mdd = await warteAufJson(mddPathOf(workFile));
      expect(mdd.notes.text).toBe('Meine **Notiz** mit Markdown.');
      // Historie bleibt unberührt (nur die Notiz wurde geschrieben).
      expect(mdd.history.packets).toHaveLength(0);

      // Lesen liefert dieselbe Notiz zurück.
      const read = await page.evaluate((p) => window.api.readNote(p), workFile);
      expect(read.ok).toBe(true);
      expect(read.note.text).toBe('Meine **Notiz** mit Markdown.');

      // Leerer Text entfernt die notes-Sektion; readNote liefert null.
      const cleared = await page.evaluate((p) => window.api.writeNote(p, '   '), workFile);
      expect(cleared.ok).toBe(true);
      expect(cleared.note).toBeNull();
      const readAfter = await page.evaluate((p) => window.api.readNote(p), workFile);
      expect(readAfter.note).toBeNull();
      const mddAfter = JSON.parse(fs.readFileSync(mddPathOf(workFile), 'utf8'));
      expect('notes' in mddAfter).toBe(false);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('NT-02: Notiz zieht beim Umbenennen mit', () => {
  test('nach renameFile trägt die neue .mdd die Notiz, readNote findet sie am neuen Pfad', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notiz-nt02-');
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await page.evaluate((p) => window.api.writeNote(p, 'Wandernde Notiz.'), workFile);
      await expect.poll(() => fs.existsSync(mddPathOf(workFile))).toBe(true);

      // Umbenennen ohne Link-Update (direkt, kein Vorschau-Dialog).
      await page.evaluate(async (p) => {
        await window.api.renameFile(p, 'umbenannt', false);
      }, workFile);
      const newFile = path.join(workDir, 'umbenannt.md');
      await expect.poll(() => fs.existsSync(newFile)).toBe(true);

      // Die .mdd ist mitgezogen: neue vorhanden, alte weg.
      await expect.poll(() => fs.existsSync(mddPathOf(newFile))).toBe(true);
      expect(fs.existsSync(mddPathOf(workFile))).toBe(false);

      // readNote am neuen Pfad liefert die Notiz.
      const read = await page.evaluate((p) => window.api.readNote(p), newFile);
      expect(read.ok).toBe(true);
      expect(read.note.text).toBe('Wandernde Notiz.');
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('NT-03: Notiz funktioniert bei ausgeschalteter Historisierung', () => {
  test('ohne aktivierte Historie ist die Notiz les- und schreibbar, ohne Historie zu erzeugen', async () => {
    const { workDir, workFile } = makeWorkFile('pmpp-notiz-nt03-');
    // Frisches Profil: der App-Default der Historisierung ist aus (PO-Entscheidung).
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      const written = await page.evaluate(
        (p) => window.api.writeNote(p, 'Notiz ohne Historie.'),
        workFile,
      );
      expect(written.ok).toBe(true);
      const read = await page.evaluate((p) => window.api.readNote(p), workFile);
      expect(read.note.text).toBe('Notiz ohne Historie.');
      // Die .mdd trägt die Notiz, aber keine Historien-Pakete oder -Anker.
      const mdd = JSON.parse(fs.readFileSync(mddPathOf(workFile), 'utf8'));
      expect(mdd.notes.text).toBe('Notiz ohne Historie.');
      expect(mdd.history.packets).toHaveLength(0);
      expect(mdd.history.anchors).toHaveLength(0);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
