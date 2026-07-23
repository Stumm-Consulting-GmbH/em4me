// 4T-0331 (Epic 3E-0060): E2E-Suite Dokument-Historie (DH-01 bis DH-09).
// Speichern erzeugt und erweitert die .mdd-Begleitdatei (Anker + Pakete,
// Coalescing), Fremd-Aenderungen werden als external-Paket protokolliert,
// Markdown-Data-Dateien lassen sich nicht als Dokument oeffnen, und ohne
// aktivierte Historisierung (App-Default: aus) entsteht keine .mdd.
// 4T-0648 (Epic 3E-0130): DH-09 prueft die Platzierung des Historien-Reiters
// neben seinem Bezugsdokument.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke');
const BASIS = path.join(FIXTURES, 'basis.md');

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

// Arbeitskopie der Basis-Fixture in einem frischen Temp-Ordner.
function makeWorkFile(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.copyFileSync(BASIS, workFile);
  return { workDir, workFile };
}

// Profil mit aktivierter Historisierung: electron-store liest config.json
// im userData-Verzeichnis; der App-Default ist bewusst aus (PO-Entscheidung).
function makeUserDataWithHistory() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-dh-profil-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ historyEnabled: true }));
  return userData;
}

function mddPathOf(workFile) {
  return workFile.replace(/\.md$/, '.mdd');
}

function readMdd(workFile) {
  return JSON.parse(fs.readFileSync(mddPathOf(workFile), 'utf8'));
}

async function typeAndSave(app, page, text) {
  const editor = page.locator(SEL.editorContent0);
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
  await sendMenuChannel(app, 'menu:save');
  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
}

test.describe('DH-01: Speichern erzeugt .mdd mit Anker und Paket, Folge-Speicherung coalesct', () => {
  test('zwei Speicherungen im Zeitfenster ergeben einen Anker und ein Paket', async () => {
    const { workDir, workFile } = makeWorkFile('scg-md-dh01-');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: makeUserDataWithHistory(),
    });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

      await typeAndSave(app, page, 'Erste Historien-Zeile.');
      await expect.poll(() => fs.existsSync(mddPathOf(workFile))).toBe(true);
      let mdd = readMdd(workFile);
      expect(mdd.schemaVersion).toBe(1);
      expect(mdd.history.anchors).toHaveLength(1);
      expect(mdd.history.anchors[0].baseSeq).toBe(0);
      expect(mdd.history.packets).toHaveLength(1);
      expect(mdd.history.packets[0].trigger).toBe('edit');

      // Zweite Speicherung direkt danach: liegt im Coalescing-Fenster und
      // aktualisiert das offene Paket statt ein zweites anzulegen.
      await typeAndSave(app, page, ' Zweite Zeile.');
      await expect
        .poll(() => {
          mdd = readMdd(workFile);
          return mdd.history.packets.length;
        })
        .toBe(1);
      expect(mdd.history.packets[0].tsEnd >= mdd.history.packets[0].ts).toBe(true);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('DH-02: Fremd-Änderung wird als external-Paket protokolliert', () => {
  test('externe Datei-Änderung bricht die Kette nicht', async () => {
    const { workDir, workFile } = makeWorkFile('scg-md-dh02-');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: makeUserDataWithHistory(),
    });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await typeAndSave(app, page, 'Vor der Fremd-Änderung.');

      // Fremd-Aenderung ausserhalb der App; der Watcher laedt den Tab neu.
      const external = fs.readFileSync(workFile, 'utf8') + '\nEXTERNE ZEILE\n';
      fs.writeFileSync(workFile, external, 'utf8');
      await expect(page.locator(SEL.editorContent0)).toContainText('EXTERNE ZEILE');

      await typeAndSave(app, page, 'Nach der Fremd-Änderung.');
      const mdd = readMdd(workFile);
      const triggers = mdd.history.packets.map((p) => p.trigger);
      expect(triggers).toContain('external');
      expect(triggers[triggers.length - 1]).toBe('edit');
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('DH-03: Markdown-Data-Dateien öffnen wird abgelehnt', () => {
  test('file:read lehnt .mdd, .mdda und .mddb mit Fehlercode ab', async () => {
    const { workDir, workFile } = makeWorkFile('scg-md-dh03-');
    const mddFile = mddPathOf(workFile);
    fs.writeFileSync(mddFile, '{"schemaVersion":1,"history":{"anchors":[],"packets":[]}}');
    // 4T-0352 (Epic 3E-0064): die neue .mdda-Endung und die Alt-Endung .mddb
    // werden ebenso als Markdown-Data-Datei abgelehnt.
    const mddaFile = path.join(workDir, 'Area_Settings.mdda');
    fs.writeFileSync(mddaFile, '{"schemaVersion":1,"settings":{}}');
    const mddbFile = path.join(workDir, 'Area_Settings.mddb');
    fs.writeFileSync(mddbFile, '{"schemaVersion":1,"settings":{}}');
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      for (const f of [mddFile, mddaFile, mddbFile]) {
        const result = await page.evaluate((p) => window.api.readFile(p), f);
        expect(result.ok).toBe(false);
        expect(result.error).toBe('mdd-file');
      }
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

// 4T-0332 (Epic 3E-0060): Drei-Ebenen-Schaltung und Statusbar.

test.describe('DH-05: YAML-Eigenschaft history schlägt die App-Einstellung', () => {
  test('history: false unterdrückt die Protokollierung trotz aktivem App-Schalter', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-dh05-'));
    const workFile = path.join(workDir, 'arbeit.md');
    fs.writeFileSync(workFile, '---\nhistory: false\n---\n\n# Ohne Historie\n', 'utf8');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: makeUserDataWithHistory(),
    });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await typeAndSave(app, page, 'Neue Zeile.');
      expect(fs.existsSync(mddPathOf(workFile))).toBe(false);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('DH-06: Bereichs-Default aus Area_Settings.mdda (Migration von .mddb)', () => {
  test('history-Default des Bereichs aktiviert die Protokollierung bei App-Default aus', async () => {
    const areaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-dh06-'));
    const workFile = path.join(areaDir, 'arbeit.md');
    fs.copyFileSync(BASIS, workFile);
    // 4T-0352 (Epic 3E-0064): Bereich mit der Alt-Datei .mddb anlegen; beim
    // Bereichs-Oeffnen wird sie still auf .mdda migriert.
    fs.writeFileSync(
      path.join(areaDir, 'Area_Settings.mddb'),
      JSON.stringify({ schemaVersion: 1, settings: { history: true } }),
      'utf8',
    );
    // App-Default bleibt aus (frisches Profil) — der Bereich schaltet an.
    const { app, page, userData } = await launchApp();
    try {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaDir);
      expect(result.boundExisting).toBe(true);
      // Der Save-Pfad ist der Protokollierungs-Einhak, um den es hier geht:
      // file:save direkt über die Preload-Brücke (Fenster ist an den
      // Bereich gebunden, die Datei liegt darin).
      const saved = await page.evaluate(
        (p) => window.api.saveFile(p, '# Bereichs-Historie\n\nNeu.\n'),
        workFile,
      );
      expect(saved.ok).toBe(true);
      await expect.poll(() => fs.existsSync(mddPathOf(workFile))).toBe(true);
      const mdd = readMdd(workFile);
      expect(mdd.history.packets.length).toBeGreaterThan(0);
      // 4T-0352: die Alt-Datei wurde beim Bereichs-Oeffnen still auf .mdda
      // migriert (Datei heisst jetzt .mdda, die .mddb ist verschwunden).
      await expect.poll(() => fs.existsSync(path.join(areaDir, 'Area_Settings.mdda'))).toBe(true);
      expect(fs.existsSync(path.join(areaDir, 'Area_Settings.mddb'))).toBe(false);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(areaDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('DH-07: Statusbar-Zustand und Datei-Schalter-Menü', () => {
  test('aktiv nach Speichern; Menü-Deaktivieren schreibt YAML und pausiert', async () => {
    const { workDir, workFile } = makeWorkFile('scg-md-dh07-');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: makeUserDataWithHistory(),
    });
    try {
      await waitForTab(page);
      const btn = page.locator('#btn-history');
      await expect(btn).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await typeAndSave(app, page, 'Statusbar-Test.');
      // Nach dem Speichern existiert die .mdd: Zustand aktiv.
      await expect(btn).toHaveClass(/active/);
      // Menü öffnen (4 Einträge: Historie öffnen + drei Schalter);
      // „deaktivieren" wählt YAML history: false.
      await btn.click();
      const menuItems = page.locator('#context-menu .context-menu-item');
      await expect(menuItems).toHaveCount(4);
      await menuItems.nth(2).click();
      // Frontmatter im Editor enthält jetzt history: false, Tab ist dirty.
      await expect(page.locator(SEL.editorContent0)).toContainText('history: false');
      await sendMenuChannel(app, 'menu:save');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      // Wirksam aus bei vorhandener .mdd: Zustand pausiert.
      await expect(btn).toHaveClass(/paused/);
      const title = await btn.getAttribute('title');
      expect(title).toBeTruthy();
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

// 4T-0333 (Epic 3E-0060): Historien-Ansicht.

test.describe('DH-08: Historien-Ansicht mit Vergleich und Wiederherstellen', () => {
  test('Revisionsliste, Diff-Zeilen und Wiederherstellen in den Editor', async () => {
    const { workDir, workFile } = makeWorkFile('scg-md-dh08-');
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: makeUserDataWithHistory(),
    });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await typeAndSave(app, page, 'Revision eins.');
      // Historien-Ansicht über den Menü-IPC-Kanal (Strecke des Menü-Klicks).
      await sendMenuChannel(app, 'menu:openHistory');
      const pageRoot = page.locator('.history-page');
      await expect(pageRoot).toBeVisible();
      // Liste: Ist-Stand, eine Revision, Ausgangsstand.
      await expect(pageRoot.locator('tbody tr')).toHaveCount(3);
      // Default-Auswahl (Ausgangsstand gegen Ist-Stand) vergleichen:
      // die getippte Zeile erscheint als eingefügte Diff-Zeile.
      await pageRoot.locator('.history-compare-btn').click();
      await expect(pageRoot.locator('.history-diff-ins').first()).toBeVisible();
      const insText = await pageRoot.locator('.history-diff-ins').first().textContent();
      expect(insText).toContain('Revision eins.');
      // Revision ansehen: read-only Text erscheint.
      await pageRoot.locator('.history-actions button').first().click();
      await expect(pageRoot.locator('.history-text')).toBeVisible();
      // Ausgangsstand wiederherstellen: Editor-Tab erhält den alten Inhalt,
      // Tab wird dirty; die Historie bleibt unangetastet.
      const rows = pageRoot.locator('tbody tr');
      const lastRow = rows.nth(2); // Ausgangsstand (unterste Zeile)
      await lastRow.locator('.history-actions button').nth(1).click();
      await expect(page.locator(SEL.editorContent0)).not.toContainText('Revision eins.');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      const mdd = readMdd(workFile);
      expect(mdd.history.packets.length).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

// 4T-0648 (Epic 3E-0130): Platzierung des Historien-Reiters.

test.describe('DH-09: Historien-Reiter liegt neben seinem Bezugsdokument', () => {
  test('oeffnet rechts neben dem Dokument und wandert beim Umbinden mit', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-dh09-'));
    const files = ['dh09-eins', 'dh09-zwei', 'dh09-drei'].map((name) => {
      const file = path.join(workDir, `${name}.md`);
      fs.copyFileSync(BASIS, file);
      return file;
    });
    const { app, page, userData } = await launchApp({
      args: files,
      userData: makeUserDataWithHistory(),
    });
    // Erwartete Reiter-Reihenfolge in Spalte 0 (Teil-Text je Position).
    const expectStrip = async (expected) => {
      await expect(page.locator(SEL.tabs0)).toHaveCount(expected.length);
      for (let i = 0; i < expected.length; i++) {
        await expect(page.locator(SEL.tabs0).nth(i)).toContainText(expected[i]);
      }
    };
    try {
      await waitForTab(page);
      await expectStrip(['dh09-eins', 'dh09-zwei', 'dh09-drei']);

      // Historie fuer das MITTLERE Dokument: der neue Reiter landet
      // unmittelbar dahinter, nicht am Streifen-Ende.
      await page.locator(SEL.tabs0, { hasText: 'dh09-zwei' }).click();
      await sendMenuChannel(app, 'menu:openHistory');
      await expect(page.locator('.history-page')).toBeVisible();
      await expectStrip(['dh09-eins', 'dh09-zwei', 'Dokument-Historie', 'dh09-drei']);
      await expect(page.locator(SEL.activeTab0)).toContainText('Dokument-Historie');

      // Umbinden auf das ERSTE Dokument: die eine Instanz pro Fenster wandert
      // mit (kein zweiter Historien-Reiter).
      await page.locator(SEL.tabs0, { hasText: 'dh09-eins' }).click();
      await sendMenuChannel(app, 'menu:openHistory');
      await expectStrip(['dh09-eins', 'Dokument-Historie', 'dh09-zwei', 'dh09-drei']);

      // Rueckfall: eine Seite OHNE Bezugsdokument (Einstellungen) haengt
      // weiterhin ans Streifen-Ende.
      await sendMenuChannel(app, 'menu:openSettings');
      await expectStrip([
        'dh09-eins',
        'Dokument-Historie',
        'dh09-zwei',
        'dh09-drei',
        'Einstellungen',
      ]);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});

test.describe('DH-04: App-Default aus — ohne Aktivierung entsteht keine .mdd', () => {
  test('Speichern ohne historyEnabled legt keine Begleitdatei an', async () => {
    const { workDir, workFile } = makeWorkFile('scg-md-dh04-');
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await typeAndSave(app, page, 'Ohne Historisierung.');
      expect(fs.existsSync(mddPathOf(workFile))).toBe(false);
    } finally {
      await closeApp(app, userData);
      try {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {}
    }
  });
});
