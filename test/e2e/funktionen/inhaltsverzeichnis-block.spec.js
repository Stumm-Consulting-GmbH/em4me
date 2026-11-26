// 4T-002558 (Epic 3E-000390): E2E-Funktions-Suite — Inhaltsverzeichnis als
// Block, Zaun `toc` (TB-01 bis TB-05).
//
// TB-01 gerenderte Ansicht: Verzeichnis der drei Überschriften, Sprung per Klick.
// TB-02 Live-Ansicht: Das Widget zeigt dasselbe Verzeichnis, ein Klick setzt die
//       Schreibmarke an die Überschrift, eine umbenannte Überschrift erscheint
//       ohne Zutun im Verzeichnis.
// TB-03 PDF-Export: Das PDF trägt die drei Einträge als Verweise auf die Anker
//       der Überschriften (Vorbild pdf-export.spec.js, Dialog-Stub).
// TB-04 Aus-Zustand der Erweiterung: Zaun als Quelltext, kein Eintrag im
//       Kontextmenü.
// TB-05 Kontextmenü → Einfügen → Inhaltsverzeichnis-Block fügt den Zaun ein;
//       ohne Überschriften erscheint der Hinweis-Text, gerendert und live.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'inhaltsverzeichnis-block.md',
);
const UEBERSCHRIFTEN = ['Erster Abschnitt', 'Zweiter Abschnitt', 'Dritter Abschnitt'];
const HINWEIS = 'Dieses Dokument hat keine Überschriften.';
const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;
const LIVE_TOC = `${SEL.paneSource0} .cm-live-block nav.toc-block`;
const GERENDERT_TOC = `${SEL.markdownBody0} nav.toc-block`;

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

// Arbeits-Kopie in einem eigenen Temp-Ordner, damit Änderungen die Fixture
// nicht berühren.
function arbeitsKopie(inhalt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-toc-e2e-'));
  const datei = path.join(dir, 'Inhaltsverzeichnis.md');
  fs.writeFileSync(datei, inhalt == null ? fs.readFileSync(FIXTURE, 'utf8') : inhalt, 'utf8');
  return { dir, datei };
}

function aufraeumen(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Temp-Reste sind unkritisch */
  }
}

async function bearbeitenAn(page) {
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
}

async function oeffneEinfuegen(page) {
  const editor = page.locator(SEL.editorContent0);
  await editor.click();
  await page.keyboard.press('Control+End');
  await editor.click({ button: 'right', position: { x: 4, y: 4 } });
  await page.locator(item('insert')).hover();
  await expect(page.locator(item('insert-codeblock'))).toBeVisible();
}

// Alle FlateDecode-Streams eines PDFs entpackt, dazu der Rohtext (Muster
// pdfInflatedStreams in pdf-export.spec.js).
function pdfInhalt(buffer) {
  const raw = buffer.toString('latin1');
  const out = [raw];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      out.push(zlib.inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      // Nicht-Flate-Stream (Fonts, Bilder) — für die Prüfung irrelevant.
    }
  }
  return out.join('\n');
}

test.describe('TB-01: gerenderte Ansicht mit Sprung per Klick', () => {
  test('das Verzeichnis zeigt die drei Überschriften, ein Klick springt zur dritten', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      const eintraege = page.locator(`${GERENDERT_TOC} a`);
      await expect(eintraege).toHaveText(UEBERSCHRIFTEN, { timeout: 20000 });
      const ziel = page.locator(`${SEL.markdownBody0} h2[id="dritter-abschnitt"]`);
      await expect(ziel).not.toBeInViewport();
      await eintraege.nth(2).click();
      await expect(ziel).toBeInViewport({ timeout: 10000 });
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TB-02: Live-Ansicht folgt den Überschriften', () => {
  test('Widget zeigt das Verzeichnis, Klick setzt die Marke, Umbenennung erscheint', async () => {
    const { dir, datei } = arbeitsKopie();
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await bearbeitenAn(page);
      const eintraege = page.locator(`${LIVE_TOC} a`);
      await expect(eintraege).toHaveText(UEBERSCHRIFTEN, { timeout: 20000 });
      // Fokus in den Editor, außerhalb des Blocks; dann der Sprung über das
      // Verzeichnis. Die Schreibmarke steht danach am Anfang der Überschrift:
      // Was jetzt am Zeilenende getippt wird, landet in ihr.
      await page.locator(`${SEL.editorContent0} .cm-line`).first().click();
      await eintraege.nth(1).click();
      await page.keyboard.press('End');
      await page.keyboard.type(' neu');
      // Die Überschrift ist aktiv und zeigt ihren Quelltext; zurück an den Anfang,
      // wo das Widget wieder im Bild ist (der Editor zeichnet nur sichtbare Zeilen).
      await expect(page.locator(`${SEL.editorContent0} .cm-activeLine`)).toHaveText(
        '## Zweiter Abschnitt neu',
      );
      await page.keyboard.press('Control+Home');
      await expect(eintraege).toHaveText(
        ['Erster Abschnitt', 'Zweiter Abschnitt neu', 'Dritter Abschnitt'],
        { timeout: 10000 },
      );
      await expect(page.locator(`${LIVE_TOC} a[href="#zweiter-abschnitt-neu"]`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});

test.describe('TB-03: PDF-Export enthält das Verzeichnis', () => {
  test('das PDF trägt je Überschrift einen Verweis auf ihren Anker', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    const ziel = path.join(os.tmpdir(), `scg-toc-e2e-${Date.now()}.pdf`);
    try {
      await expect(page.locator(`${GERENDERT_TOC} a`)).toHaveCount(3, { timeout: 20000 });
      await hauptSenden(
        app,
        ({ dialog }, payload) => {
          globalThis.__tocPdfAufrufe = 0;
          dialog.showSaveDialog = async () => {
            globalThis.__tocPdfAufrufe += 1;
            return payload;
          };
        },
        { canceled: false, filePath: ziel },
      );
      // Strg+Umschalt+P genau einmal wirksam auslösen (Muster triggerExportOnce).
      await expect
        .poll(
          async () => {
            await page.keyboard.press('Control+Shift+P');
            return hauptLesen(app, () => globalThis.__tocPdfAufrufe || 0);
          },
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
      await expect.poll(() => fs.existsSync(ziel), { timeout: 30000 }).toBe(true);
      await expect(page.locator('body.printing')).toHaveCount(0);
      const buffer = fs.readFileSync(ziel);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const inhalt = pdfInhalt(buffer);
      for (const anker of ['erster-abschnitt', 'zweiter-abschnitt', 'dritter-abschnitt']) {
        expect(inhalt).toContain(`/Dest /${anker}`);
      }
    } finally {
      try {
        fs.rmSync(ziel, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      await closeApp(app, userData);
    }
  });
});

test.describe('TB-04: Aus-Zustand der Erweiterung', () => {
  test('der Zaun steht als Quelltext da, das Kontextmenü zeigt «Inhaltsverzeichnis-Block» nicht', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      settings: { language: 'de', extensions: { disabled: ['toc-block'] } },
    });
    try {
      await expect(page.locator(`${SEL.markdownBody0} h2[id="erster-abschnitt"]`)).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator(`${SEL.markdownBody0} code.language-toc`)).toHaveCount(1);
      await expect(page.locator(GERENDERT_TOC)).toHaveCount(0);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await bearbeitenAn(page);
      await oeffneEinfuegen(page);
      await expect(page.locator(item('insert-toc'))).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TB-05: Einfügen über das Kontextmenü', () => {
  test('Einfügen → Inhaltsverzeichnis-Block setzt den Zaun; ohne Überschriften erscheint der Hinweis', async () => {
    const { dir, datei } = arbeitsKopie('Ein Dokument ganz ohne Überschrift.\n');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await bearbeitenAn(page);
      await oeffneEinfuegen(page);
      await expect(page.locator(item('insert-toc'))).toHaveText('Inhaltsverzeichnis-Block');
      // Der Rechtsklick setzt die Schreibmarke an den Anfang der ersten Zeile;
      // eingefügt wird dort, auf eigener Zeile mit Leerzeile dahinter.
      await page.locator(item('insert-toc')).click();
      const zeilen = page.locator(`${SEL.editorContent0} .cm-line`);
      await expect(zeilen).toHaveText(
        ['```toc', '```', '', 'Ein Dokument ganz ohne Überschrift.', ''],
        { timeout: 10000 },
      );
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(`${LIVE_TOC} .toc-block-hinweis`)).toHaveText(HINWEIS, {
        timeout: 10000,
      });
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${GERENDERT_TOC} .toc-block-hinweis`)).toHaveText(HINWEIS, {
        timeout: 10000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});
