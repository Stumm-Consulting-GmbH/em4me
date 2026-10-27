// 4T-002352 (Epic 3E-000184): E2E-Funktions-Suite — der Aus-Zustand der
// Erweiterung «Workflows» an der gestarteten Anwendung (Story 4S-001108).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Der
// Schalter wirkt in beiden Prozessen zugleich: Im Fenster schalten Darstellung,
// Editor, Kommandos und Einstellungs-Navigation um, im Hauptprozess der
// Ordner-Dienst und mit ihm das Untermenü «Datei → Workflows». Die Unit-Fälle
// prüfen jede Seite für sich (render/extensions-aus-workflows.test.js,
// renderer/workflow-aus-zustand.test.js, workflow-ipc.test.js); erst hier
// kommt die Meldung des Schalters über den Speicher bei allen gleichzeitig an.
//
// **Gemessen** wird in drei Takten: eingeschaltet (Gegenprobe, dazu ein Lauf,
// der einen Lauf-Stand hinterlässt), ausgeschaltet (gewöhnlicher Code-Block,
// keine Kopfzeile, kein Kommando, kein Menü-Eintrag, kein Einstellungs-
// Abschnitt), wieder eingeschaltet (alles zurück, Lauf-Stand und
// Ordner-Festlegung unverändert).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const PALETTE = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';
const BLOCK = `${PANE} .markdown-body pre code.language-workflow`;
const SETTINGS_NAV = `${PANE} .pane-system .settings-page .settings-nav-entry`;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Ein Bereich mit festgelegtem Workflow-Ordner und einem Workflow darin.
function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-aus-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.writeFileSync(
    path.join(wurzel, 'Workflows', 'Quartalsablage.md'),
    [
      '---',
      'workflow: true',
      'name: Quartalsablage',
      '---',
      '',
      '```workflow',
      'mkdir "Ablage"',
      'notify "Ablage bereit"',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  return wurzel;
}

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

async function oeffnePalette(page) {
  await expect
    .poll(async () => {
      if (await page.locator(PALETTE).isVisible()) return true;
      await page.keyboard.press('Control+k');
      return page.locator(PALETTE).isVisible();
    })
    .toBe(true);
}

async function schliessePalette(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator(PALETTE)).toBeHidden();
}

// Zahl der Treffer der Kommando-Palette für einen Text. Die Palette hält die
// Kommandos fest, die beim Öffnen angemeldet sind (command-palette.js,
// zeigeAuswahlOverlay); ein Schalter-Wechsel wirkt erst beim nächsten Öffnen.
// Deshalb öffnet jeder Aufruf sie frisch und schließt sie wieder (Muster
// paletteTreffer in kanban-notizen.spec.js; Befund des Epic-Abschluss-Tests
// vom 2026-10-23).
async function paletteTreffer(page, text) {
  await oeffnePalette(page);
  await page.locator(PALETTE_FILTER).fill(text);
  const anzahl = await page.locator(PALETTE_ITEM).count();
  await schliessePalette(page);
  return anzahl;
}

// Menü des Fensters abgreifen und nach dem Eintrag eines Workflows suchen
// (Muster helpers/menu-zustand.js). Sprachfrei erkannt an Hinweis-Text und
// Beschriftung: Der Hinweis-Text ist der absolute Pfad, die Beschriftung der
// Name des Workflows. Der Hinweis-Text allein genügt nicht, weil die Liste
// «Datei → Zuletzt geöffnet» denselben Pfad als Hinweis-Text trägt, dort mit
// dem Dateinamen als Beschriftung (menu-recent.js); der Fall öffnet die
// Workflow-Datei, sie steht also in jener Liste (Befund des
// Epic-Abschluss-Tests vom 2026-10-23).
async function fangeMenue(app, page) {
  const fenster = await app.browserWindow(page);
  const fensterId = await hauptLesen(fenster, (w) => w.id);
  await hauptSenden(
    app,
    ({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id);
      if (!win || win.isDestroyed() || win.__wfMenueGefangen) return;
      win.__wfMenueGefangen = true;
      const orig = win.setMenu.bind(win);
      win.setMenu = (menu) => {
        win.__wfMenue = menu;
        return orig(menu);
      };
    },
    fensterId,
  );
  return fensterId;
}

async function menueHatEintrag(app, fensterId, toolTip, label) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id);
      if (!win || win.isDestroyed()) return;
      win.webContents.send('menu:togglePanel', 'notes');
      win.webContents.send('menu:togglePanel', 'notes');
    },
    fensterId,
  );
  return hauptLesen(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.id);
      const suche = (items) =>
        (items || []).some(
          (it) =>
            (it.toolTip === a.toolTip && it.label === a.label) ||
            (it.submenu ? suche(it.submenu.items) : false),
        );
      return !!(win && win.__wfMenue && suche(win.__wfMenue.items));
    },
    { id: fensterId, toolTip, label },
  );
}

async function schalte(page, aus) {
  await page.evaluate((liste) => window.api.setSetting('extensions.disabled', liste), aus);
}

test.describe('WF-AUS-01: Erweiterung «Workflows» aus und wieder an (4T-002352)', () => {
  test('aus: gewöhnlicher Code-Block, keine Zugänge; an: alles zurück, nichts verloren', async () => {
    const wurzel = baueBereich();
    const workflowPfad = path.join(wurzel, 'Workflows', 'Quartalsablage.md');
    const begleitPfad = path.join(wurzel, 'Workflows', 'Quartalsablage.mdd');
    const einstellungenPfad = path.join(wurzel, 'Area_Settings.mdda');
    const { app, page, userData } = await launchApp();
    try {
      const fensterId = await fangeMenue(app, page);
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(app, page, workflowPfad);

      // --- Eingeschaltet (Gegenprobe) ---------------------------------------
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(page.locator(`${BLOCK} .wf-keyword`).first()).toBeVisible();
      await expect
        .poll(() => menueHatEintrag(app, fensterId, workflowPfad, 'Quartalsablage'))
        .toBe(true);
      await expect.poll(() => paletteTreffer(page, 'Quartalsablage')).toBe(1);
      // Ein Lauf hinterlässt den Lauf-Stand, den das Abschalten nicht anrührt.
      await oeffnePalette(page);
      await page.locator(PALETTE_FILTER).fill('Quartalsablage');
      await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
      await page.keyboard.press('Enter');
      await expect(page.locator(PALETTE)).toBeHidden();
      await expect.poll(() => fs.existsSync(path.join(wurzel, 'Ablage'))).toBe(true);
      await expect.poll(() => fs.existsSync(begleitPfad)).toBe(true);
      const begleitVorher = fs.readFileSync(begleitPfad, 'utf8');
      const einstellungenVorher = fs.readFileSync(einstellungenPfad, 'utf8');

      // --- Ausgeschaltet ----------------------------------------------------
      await schalte(page, ['workflows']);
      // Lese-Ansicht: der Block bleibt lesbar, aber ohne Färbung (AK3).
      await expect(page.locator(`${BLOCK} .wf-keyword`)).toHaveCount(0);
      await expect(page.locator(BLOCK)).toContainText('mkdir "Ablage"');
      // Live-Ansicht: keine Kopfzeile, also weder Prüf-Anzeige noch Knopf (AK3).
      await page.locator(SEL.viewBtn('live')).click();
      // Der Editor der Quelltext-Spalte: Das Notiz-Panel derselben Spalte trägt
      // einen eigenen Editor, den der breitere Selektor mit traf.
      await expect(page.locator(SEL.editorContent0)).toContainText('mkdir');
      await expect(page.locator(`${PANE} .cm-wf-kopf`)).toHaveCount(0);
      await expect(page.locator(`${PANE} .cm-wf-keyword`)).toHaveCount(0);
      // Kein Kommando des Workflows und keins der Seite «Workflow-Läufe» (AK4).
      await expect.poll(() => paletteTreffer(page, 'Quartalsablage')).toBe(0);
      await expect.poll(() => paletteTreffer(page, 'Workflow-Läufe')).toBe(0);
      // Kein Untermenü «Datei → Workflows» (AK4).
      await expect
        .poll(() => menueHatEintrag(app, fensterId, workflowPfad, 'Quartalsablage'))
        .toBe(false);
      // Keine Einstellungs-Abschnitte «Workflows» (AK4).
      await oeffneEinstellungsSeite(page);
      await expect(page.locator(`${SETTINGS_NAV}[data-section-id="workflows"]`)).toHaveCount(0);
      await expect(page.locator(`${SETTINGS_NAV}[data-section-id="workflowsArea"]`)).toHaveCount(0);

      // --- Wieder eingeschaltet (AK5) ---------------------------------------
      await schalte(page, []);
      await expect(page.locator(`${SETTINGS_NAV}[data-section-id="workflows"]`)).toHaveCount(1);
      await expect(page.locator(`${SETTINGS_NAV}[data-section-id="workflowsArea"]`)).toHaveCount(1);
      await expect
        .poll(() => menueHatEintrag(app, fensterId, workflowPfad, 'Quartalsablage'))
        .toBe(true);
      await expect.poll(() => paletteTreffer(page, 'Quartalsablage')).toBe(1);
      // Nichts verloren: Lauf-Stand und Ordner-Festlegung sind unverändert.
      expect(fs.readFileSync(begleitPfad, 'utf8')).toBe(begleitVorher);
      expect(fs.readFileSync(einstellungenPfad, 'utf8')).toBe(einstellungenVorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
