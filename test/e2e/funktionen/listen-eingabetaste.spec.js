// 4T-001862 und 4T-001977 (Epic 3E-000301): die eigene Eingabetaste in Listen
// am laufenden Programm.
//
// Die Unit-Fälle in test/unit/renderer/listen-eingabetaste.test.js prüfen jeden
// Fall der Fall-Tabelle an einer echten EditorView. Hier wird geprüft, was sie
// nicht erreichen: der echte Tastendruck im Programm, dieselbe Wirkung in
// Quellcode- und Live-Ansicht (AK7 von 4T-001862, AK10 von 4T-001977) und die
// Wirkung im Notiz-Feld des Seitenbereichs «Notizen» (AK16 von 4T-001862).
//
// LE-01: Fall 1 — der neue Punkt entsteht als erster Unterpunkt (4T-001862).
// LE-02: G1 — die nummerierte Aufgabe setzt das Kästchen fort (4T-001977).
// LE-03: Fall 1 im Notiz-Feld (4T-001862, E24).
//
// Gelesen wird der Dokument-Text des Editors, nur lesend über das
// Inhalts-Element (Muster `quelltext` in datentabelle.spec.js), weil die
// Live-Ansicht Marker und Kästchen anders zeichnet als der Quelltext. Gearbeitet
// wird auf einer Kopie der Fixture, damit das Speichern sie nicht verändert.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'listen-eingabetaste.md',
);

const PANE0 = '.pane-group[data-pane="0"]';
const NOTES_CM = `${PANE0} .sidebar-notes .notes-editor .cm-content`;

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

// Arbeitskopie in einem eigenen Ordner; liefert Ordner und Datei.
function arbeitsKopie(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.copyFileSync(FIXTURE, workFile);
  return { workDir, workFile };
}

function aufraeumen(workDir) {
  try {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
}

// Ansicht wählen und das Dokument bearbeitbar schalten (Muster enterEditSource
// in bearbeitung-und-ansicht.spec.js).
async function bearbeitbar(app, page, ansicht) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', ansicht);
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(`${PANE0} .pane-source-editor`)).not.toHaveClass(/read-only/);
}

// Dokument-Text des Editors hinter dem Inhalts-Element `selektor`.
async function dokText(page, selektor) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    return tile && tile.view ? tile.view.state.doc.toString() : null;
  }, selektor);
}

// Schreibmarke an das Ende der Zeile mit `wort`.
async function markeAnsEnde(page, inhalt, wort) {
  await page.locator(inhalt).locator('.cm-line', { hasText: wort }).first().click();
  await page.keyboard.press('End');
}

test.describe('LE-01: Eingabetaste vor eingerückten Unterpunkten (4T-001862, AK1, AK7)', () => {
  for (const ansicht of ['source', 'live']) {
    test(`Fall 1 in der Ansicht «${ansicht}»: der neue Punkt wird der erste Unterpunkt`, async () => {
      const { workDir, workFile } = arbeitsKopie('pmpp-listen-eingabe-le01-');
      const { app, page, userData } = await launchApp({ args: [workFile] });
      try {
        await bearbeitbar(app, page, ansicht);
        await markeAnsEnde(page, SEL.editorContent0, 'Umzug');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Packen');
        await expect
          .poll(async () => (await dokText(page, SEL.editorContent0)) || '')
          .toContain('1. [ ] Umzug\n   1. [ ] Packen\n   2. [ ] Kartons\n');
      } finally {
        await closeApp(app, userData, { force: true });
        aufraeumen(workDir);
      }
    });
  }
});

test.describe('LE-02: nummerierte Aufgabe setzt das Kästchen fort (4T-001977, AK2, AK10)', () => {
  for (const ansicht of ['source', 'live']) {
    test(`G1 in der Ansicht «${ansicht}»: neuer Punkt mit leerem Kästchen`, async () => {
      const { workDir, workFile } = arbeitsKopie('pmpp-listen-eingabe-le02-');
      const { app, page, userData } = await launchApp({ args: [workFile] });
      try {
        await bearbeitbar(app, page, ansicht);
        await markeAnsEnde(page, SEL.editorContent0, 'Einkauf');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Brot');
        await expect
          .poll(async () => (await dokText(page, SEL.editorContent0)) || '')
          .toContain('1. [ ] Einkauf\n2. [ ] Brot');
      } finally {
        await closeApp(app, userData, { force: true });
        aufraeumen(workDir);
      }
    });
  }
});

test.describe('LE-03: Eingabetaste im Notiz-Feld (4T-001862, AK16)', () => {
  test('Fall 1 wirkt im Notiz-Feld wie im Haupt-Editor und wird gespeichert', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-listen-eingabe-le03-'));
    const workFile = path.join(workDir, 'arbeit.md');
    fs.writeFileSync(workFile, '# Notiz-Liste\n', 'utf8');
    const notiz = '1. [ ] Umzug\n   1. [ ] Kartons';
    const mdd = {
      schemaVersion: 1,
      history: { anchors: [], packets: [] },
      notes: { text: notiz, updated: '2026-10-07T00:00:00Z' },
    };
    fs.writeFileSync(workFile.replace(/\.md$/, '.mdd'), JSON.stringify(mdd, null, 2) + '\n');
    // Profil mit abgeschalteter Vorschau-Vorbelegung: das Feld ist beim
    // Öffnen bearbeitbar (Muster editorProfile in notizen-panel.spec.js).
    const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-listen-eingabe-profil-'));
    fs.writeFileSync(
      path.join(profil, 'config.json'),
      JSON.stringify({ notes: { previewByDefault: false } }),
      'utf8',
    );
    const gespeichert = () => {
      try {
        const daten = JSON.parse(fs.readFileSync(workFile.replace(/\.md$/, '.mdd'), 'utf8'));
        return daten.notes?.text ?? null;
      } catch {
        return null;
      }
    };
    const { app, page, userData } = await launchApp({ args: [workFile], userData: profil });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:toggleNotes');
      await expect.poll(async () => await dokText(page, NOTES_CM)).toBe(notiz);
      await markeAnsEnde(page, NOTES_CM, 'Umzug');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Packen');
      const soll = '1. [ ] Umzug\n   1. [ ] Packen\n   2. [ ] Kartons';
      await expect.poll(async () => await dokText(page, NOTES_CM)).toBe(soll);
      await expect.poll(gespeichert).toBe(soll);
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(workDir);
    }
  });
});
