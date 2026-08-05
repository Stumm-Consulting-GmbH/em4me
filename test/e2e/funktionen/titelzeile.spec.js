// 4T-0585/4T-0586 (Epic 3E-0108): E2E-Suite der Titelzeile. Prüft die
// Sichtbarkeits-Logik (genau eine Instanz je Ansichts-Modus, keine
// Titelzeile auf System-Tabs), den Aus-Zustand der Erweiterung
// 'title-line', den Unbenannt-Platzhalter sowie das Direkt-Umbenennen über
// die Titelzeile (Link-Update, Kollisions- und Validierungs-Hinweise,
// Escape/Fokusverlust). Die Anzeigenamen-Ableitung ist in subpages.test.js
// unit-bewiesen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-titelzeile-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Menü-IPC-Kanal direkt senden (Muster format-toolbar.spec.js).
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

// Sichtbare Titelzeilen-Instanzen in Pane 0 (hidden-Attribut zählt nicht).
function visibleTitleLines(page) {
  return page.locator('.pane-group[data-pane="0"] .title-line:not([hidden])');
}

test.describe('TZ-01: Sichtbarkeit je Ansichts-Modus, genau eine Instanz', () => {
  test('Reading zeigt die Render-Instanz, Quelltext/Geteilt/Live die Source-Instanz', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      // Start in der Lese-Ansicht (rendered): Render-Instanz mit Dateinamen
      // ohne Endung, Source-Instanz verborgen.
      await expect(page.locator(SEL.titleLineRendered0)).toBeVisible();
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('basis');
      await expect(page.locator(SEL.titleLineSource0)).toBeHidden();
      await expect(visibleTitleLines(page)).toHaveCount(1);
      // Quelltext-Ansicht: Source-Instanz übernimmt.
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator(SEL.titleLineSource0)).toBeVisible();
      await expect(page.locator(SEL.titleLineSourceText0)).toHaveText('basis');
      await expect(page.locator(SEL.titleLineRendered0)).toBeHidden();
      await expect(visibleTitleLines(page)).toHaveCount(1);
      // Geteilt-Ansicht: weiterhin nur die Source-Instanz (keine doppelte
      // Titelzeile über beiden Spalten).
      await sendMenuChannel(app, 'menu:viewChange', 'split');
      await expect(page.locator(SEL.titleLineSource0)).toBeVisible();
      await expect(page.locator(SEL.titleLineRendered0)).toBeHidden();
      await expect(visibleTitleLines(page)).toHaveCount(1);
      // Live-Ansicht: ebenfalls die Source-Instanz.
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.titleLineSource0)).toBeVisible();
      await expect(page.locator(SEL.titleLineRendered0)).toBeHidden();
      await expect(visibleTitleLines(page)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-02: System-Tabs ohne Titelzeile', () => {
  test('Einstellungs-Seite und Handbuch-Seite zeigen keine Titelzeile', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Einstellungs-Seite als System-Tab öffnen (Poll: Dispatcher steht
      // erst nach init(), Muster einstellungen-seite.spec.js).
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator(SEL.tabs0).count();
        })
        .toBeGreaterThan(0);
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(visibleTitleLines(page)).toHaveCount(0);
      // Handbuch-Seite (pfadloser read-only Tab, Muster handbuch.spec.js).
      await page.evaluate(() => {
        document.dispatchEvent(
          new CustomEvent('scg:open-manual-page', { detail: { pageId: 'overview' } }),
        );
      });
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(visibleTitleLines(page)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TZ-03: Erweiterung title-line aus', () => {
  test('ohne Erweiterung keine Titelzeile; Wiedereinschalten wirkt sofort', async () => {
    const userData = seedProfile({ extensions: { disabled: ['title-line'] } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(visibleTitleLines(page)).toHaveCount(0);
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(visibleTitleLines(page)).toHaveCount(0);
      // Wiedereinschalten über den Settings-Broadcast (Muster FT-06).
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect(page.locator(SEL.titleLineSource0)).toBeVisible();
      await expect(page.locator(SEL.titleLineSourceText0)).toHaveText('basis');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

const SEP = '∕'; // U+2215 Division Slash

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-titelzeile-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Titel in der sichtbaren Render-Instanz editieren: Klick auf die Zeile macht
// das eigene Namens-Segment editierbar (4T-0646; Auswahl ist danach komplett
// markiert), Tippen ersetzt es.
async function editTitleTo(page, newName) {
  const textEl = page.locator(SEL.titleLineRenderedText0);
  const segmentEl = page.locator(SEL.titleLineRenderedSegment0);
  await textEl.click();
  await expect(segmentEl).toHaveAttribute('contenteditable', 'plaintext-only');
  await page.keyboard.type(newName);
}

test.describe('TZ-04: Umbenennen über die Titelzeile', () => {
  test('Enter benennt um: Links, .mdd und Unterseiten-Kaskade ziehen mit', async () => {
    const dir = makeDir();
    const aFile = path.join(dir, 'A.md');
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(aFile, '# A\n\nWiki: [[B]]\nMd: [Link](B.md)\n', 'utf8');
    fs.writeFileSync(bFile, '# B\n\nInhalt.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'B.mdd'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(dir, `B${SEP}Sub.md`), '# Sub\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('B');
      await editTitleTo(page, 'C');
      await page.keyboard.press('Enter');
      // Kein Modal (Vorschau/Bericht entfallen im Titelzeilen-Fluss);
      // Tab-Titel und Titelzeile zeigen den neuen Namen.
      await expect(page.locator(SEL.activeTab0)).toContainText('C.md');
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('C');
      // Disk: Datei, .mdd-Begleitdatei und Unterseiten-Kaskade.
      // 4T-0874: Die Unterseite folgt der Haupt-Datei erst im zweiten Schritt
      // der Kaskade; auf sie wird gewartet statt sofort gelesen
      // (Stabilitaetsregel 12). Erst danach steht der Endstand fest, und die
      // uebrigen Pruefungen duerfen ihn synchron lesen.
      await expect.poll(() => fs.existsSync(path.join(dir, 'C.md')), { timeout: 5000 }).toBe(true);
      await expect
        .poll(() => fs.existsSync(path.join(dir, `C${SEP}Sub.md`)), { timeout: 5000 })
        .toBe(true);
      expect(fs.existsSync(bFile)).toBe(false);
      expect(fs.existsSync(path.join(dir, 'C.mdd'))).toBe(true);
      // Link-Update in A (Standard: renameUpdateLinks aktiv).
      await expect.poll(() => fs.readFileSync(aFile, 'utf8'), { timeout: 5000 }).toContain('[[C]]');
      const a = fs.readFileSync(aFile, 'utf8');
      expect(a).toContain('Md: [Link](C.md)');
      expect(a).not.toContain('[[B]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TZ-05: Kollisions-Hinweis', () => {
  test('Umbenennen auf einen vergebenen Namen zeigt den Hinweis, die Datei bleibt', async () => {
    const dir = makeDir();
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'C.md'), '# C\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await editTitleTo(page, 'C');
      await page.keyboard.press('Enter');
      const hint = page.locator(`${SEL.titleLineRendered0} .title-line-hint`);
      await expect(hint).toBeVisible();
      await expect(hint).toHaveClass(/is-error/);
      // Alt-Name bleibt erhalten, keine Datei-Änderung.
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('B');
      expect(fs.existsSync(bFile)).toBe(true);
      await expect(page.locator(SEL.activeTab0)).toContainText('B.md');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TZ-06: Escape und Fokusverlust ohne Änderung', () => {
  test('Escape verwirft die Eingabe; Blur mit unverändertem Text beendet still', async () => {
    const dir = makeDir();
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      // Escape: Eingabe verworfen, nichts passiert.
      await editTitleTo(page, 'Verworfen');
      await page.keyboard.press('Escape');
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('B');
      expect(fs.existsSync(bFile)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'Verworfen.md'))).toBe(false);
      // Fokusverlust ohne Änderung: stilles Ende, kein Hinweis.
      await page.locator(SEL.titleLineRenderedText0).click();
      await expect(page.locator(SEL.titleLineRenderedSegment0)).toHaveAttribute(
        'contenteditable',
        'plaintext-only',
      );
      await page.locator(SEL.markdownBody0).click();
      await expect(page.locator(SEL.titleLineRenderedSegment0)).not.toHaveAttribute(
        'contenteditable',
        'plaintext-only',
      );
      await expect(page.locator(`${SEL.titleLineRendered0} .title-line-hint`)).toBeHidden();
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('B');
      expect(fs.existsSync(bFile)).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TZ-07: Validierungs-Hinweis bei ungültigem Namen', () => {
  test('unzulässige Zeichen erzeugen den Hinweis, die Datei bleibt unverändert', async () => {
    const dir = makeDir();
    const bFile = path.join(dir, 'B.md');
    fs.writeFileSync(bFile, '# B\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [bFile] });
    try {
      await waitForTab(page);
      await editTitleTo(page, 'a:b');
      await page.keyboard.press('Enter');
      const hint = page.locator(`${SEL.titleLineRendered0} .title-line-hint`);
      await expect(hint).toBeVisible();
      await expect(hint).toHaveClass(/is-error/);
      await expect(page.locator(SEL.titleLineRenderedText0)).toHaveText('B');
      expect(fs.existsSync(bFile)).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TZ-08: Unbenannt-Platzhalter', () => {
  test('Unbenannt-Tab zeigt den Platzhalter des Tab-Titels in der Titelzeile', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Neuen Unbenannt-Tab anlegen (Poll: Menü-Listener steht erst nach
      // init(), Muster arbeitsbereiche.spec.js).
      await expect
        .poll(async () => {
          await sendMenuChannel(app, 'menu:new');
          return page.locator(SEL.tabs0).count();
        })
        .toBeGreaterThan(0);
      await expect(visibleTitleLines(page)).toHaveCount(1);
      // Platzhalter-Text entspricht dem Tab-Titel (locale-unabhängig).
      const tabTitle = (await page.locator(`${SEL.activeTab0} .tab-title`).innerText()).trim();
      await expect(visibleTitleLines(page).locator('.title-line-text')).toHaveText(tabTitle);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-0646 (Epic 3E-0128): Bei einer Unterseite ist nur das eigene Segment
// editierbar; der Eltern-Anteil bleibt sichtbar und unangetastet.
test.describe('TZ-09: Unterseite — nur das eigene Namens-Segment', () => {
  test('Praefix bleibt stehen, die Umbenennung wirkt nur auf das Segment', async () => {
    const dir = makeDir();
    const subFile = path.join(dir, `Projekt${SEP}Konzept.md`);
    fs.writeFileSync(path.join(dir, 'Projekt.md'), '# Projekt\n\n[[Projekt/Konzept]]\n', 'utf8');
    fs.writeFileSync(subFile, '# Konzept\n', 'utf8');
    fs.writeFileSync(path.join(dir, `Projekt${SEP}Konzept${SEP}Detail.md`), '# Detail\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [subFile] });
    try {
      await waitForTab(page);
      // Anzeige: Praefix und Segment getrennt, Praefix nicht editierbar.
      await expect(page.locator(SEL.titleLineRenderedPrefix0)).toHaveText('Projekt/');
      await expect(page.locator(SEL.titleLineRenderedSegment0)).toHaveText('Konzept');
      await editTitleTo(page, 'Entwurf');
      await expect(page.locator(SEL.titleLineRenderedPrefix0)).not.toHaveAttribute(
        'contenteditable',
        'plaintext-only',
      );
      await page.keyboard.press('Enter');
      // Der Eltern-Anteil ueberlebt, das Segment ist neu.
      await expect(page.locator(SEL.titleLineRenderedPrefix0)).toHaveText('Projekt/');
      await expect(page.locator(SEL.titleLineRenderedSegment0)).toHaveText('Entwurf');
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Projekt${SEP}Entwurf.md`)), { timeout: 5000 })
        .toBe(true);
      expect(fs.existsSync(subFile)).toBe(false);
      // Eigene Unterseite wandert mit, die Elternseite bleibt unberuehrt.
      // 4T-0874: gewartet statt sofort gelesen — die Kaskade laeuft nach der
      // Reiter- und Titelzeilen-Rueckmeldung noch (Stabilitaetsregel 12).
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Projekt${SEP}Entwurf${SEP}Detail.md`)), {
          timeout: 5000,
        })
        .toBe(true);
      expect(fs.existsSync(path.join(dir, 'Projekt.md'))).toBe(true);
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'Projekt.md'), 'utf8'), { timeout: 5000 })
        .toContain('[[Projekt/Entwurf]]');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-0646: Der Schraegstrich ist im Segment abgelehnt (die Seite koennte
// sonst still ihren Ast verlassen), an einer Top-Level-Seite bleibt er
// erlaubt und macht sie zur Unterseite.
test.describe('TZ-10: Schraegstrich nach Lage der Seite', () => {
  test('Unterseite lehnt ab, Top-Level-Seite wird zur Unterseite', async () => {
    const dir = makeDir();
    const subFile = path.join(dir, `Projekt${SEP}Konzept.md`);
    fs.writeFileSync(subFile, '# Konzept\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [subFile] });
    try {
      await waitForTab(page);
      await editTitleTo(page, 'Fremd/Konzept');
      await page.keyboard.press('Enter');
      const hint = page.locator(`${SEL.titleLineRendered0} .title-line-hint`);
      await expect(hint).toBeVisible();
      await expect(hint).toHaveClass(/is-error/);
      await expect(page.locator(SEL.titleLineRenderedPrefix0)).toHaveText('Projekt/');
      await expect(page.locator(SEL.titleLineRenderedSegment0)).toHaveText('Konzept');
      expect(fs.existsSync(subFile)).toBe(true);
      expect(fs.existsSync(path.join(dir, `Fremd${SEP}Konzept.md`))).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('Top-Level-Seite haengt sich per Schraegstrich unter eine andere', async () => {
    const dir = makeDir();
    const topFile = path.join(dir, 'Solo.md');
    fs.writeFileSync(topFile, '# Solo\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [topFile] });
    try {
      await waitForTab(page);
      await expect(page.locator(SEL.titleLineRenderedPrefix0)).toBeHidden();
      await editTitleTo(page, 'Projekt/Solo');
      await page.keyboard.press('Enter');
      await expect
        .poll(() => fs.existsSync(path.join(dir, `Projekt${SEP}Solo.md`)), { timeout: 5000 })
        .toBe(true);
      expect(fs.existsSync(topFile)).toBe(false);
      // Die Zeile zeigt danach die neue Einordnung.
      await expect(page.locator(SEL.titleLineRenderedPrefix0)).toHaveText('Projekt/');
      await expect(page.locator(SEL.titleLineRenderedSegment0)).toHaveText('Solo');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
