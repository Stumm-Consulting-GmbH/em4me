// 4T-002426 (Epic 3E-000366, Story 4S-001138): E2E-Funktions-Suite — Workflows
// verknüpfter Bereiche an der gestarteten Anwendung.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette läuft über beide Prozesse und zwei Bereiche: der Schalter in den
// Einstellungen schreibt die Zustimmung in die Bereichsdatei, der Hauptprozess
// liest daraufhin den Workflow-Ordner des verknüpften Bereichs und baut das Menü,
// das Fenster meldet die Kommandos an und zeigt die Seite «Workflow-Läufe», und
// ein Lauf geht über den Schritt-Kanal mit der Definition aus der Quelle und den
// Zielen in der eigenen Wurzel. Die jsdom-Fälle ersetzen jeweils den Nachbarn.
//
// **Material.** Jeder Fall legt zwei Bereiche an: A (der geöffnete, mit
// Verknüpfung auf B) und B (mit Workflow-Ordner «Abläufe» und dem Workflow
// «Fremd-Probe», der eine Datei anlegt).
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Menü-Einträge über ihren
// Hinweis-Text (der absolute Pfad des Workflows in B) und darüber, dass ihre
// Beschriftung Name und Kürzel trägt; Ergebnisse an den Dateien.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

const PALETTE = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const SEITE = '.pane-group[data-pane="0"] .pane-system[data-system-page="workflow-runs"]';
const KUERZEL = 'fremd';
const NAME = 'Fremd-Probe';
const ERGEBNIS = 'Fremd-Probe-Ergebnis.md';

function tmpDir(praefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), praefix)));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

function schreibeBereichsdatei(wurzel, settings) {
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings }, null, 2),
    'utf8',
  );
}

// A verknüpft B, mit oder ohne Zustimmung zu dessen Workflows.
function baueBereiche({ zustimmung }) {
  const a = tmpDir('em4me-wf-verkn-a-');
  const b = tmpDir('em4me-wf-verkn-b-');
  schreibeBereichsdatei(b, { workflows: { folder: 'Abläufe' } });
  fs.mkdirSync(path.join(b, 'Abläufe'));
  const workflow = path.join(b, 'Abläufe', `${NAME}.md`);
  fs.writeFileSync(
    workflow,
    [
      '---',
      'workflow: true',
      `name: ${NAME}`,
      '---',
      '',
      '```workflow',
      `create "${ERGEBNIS}"`,
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  schreibeBereichsdatei(a, {
    areaLinks: [{ prefix: KUERZEL, path: b, templates: false, workflows: zustimmung }],
  });
  fs.writeFileSync(path.join(a, 'Start.md'), '# Start\n', 'utf8');
  return { a, b, workflow };
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

async function oeffneEinstellungen(page) {
  await expect
    .poll(async () => {
      if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
        await page.keyboard.press('Control+,');
      }
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
}

// Den Schalter «Workflows» des ersten Eintrags setzen und anwenden.
async function setzeZustimmung(page, an) {
  await oeffneEinstellungen(page);
  await page.locator('.settings-nav-entry[data-section-id="areaLinks"]').click();
  const kaestchen = page.locator('#settings-area-links-workflows-0');
  if (an) await kaestchen.check();
  else await kaestchen.uncheck();
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
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

// Die Beschriftungen der Treffer; die Palette hält die Kommandos beim Öffnen
// fest, deshalb je Abfrage frisch geöffnet (Muster workflow-start.spec.js).
async function paletteTreffer(page, text) {
  await oeffnePalette(page);
  await page.locator(PALETTE_FILTER).fill(text);
  const texte = await page.locator(PALETTE_ITEM).allTextContents();
  await page.keyboard.press('Escape');
  await expect(page.locator(PALETTE)).toBeHidden();
  return texte;
}

// Das Menü des Fensters abgreifen (Muster workflow-start.spec.js).
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

async function stosseMenueAn(app, fensterId) {
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
}

// Die Beschriftung des Menü-Eintrags mit diesem Hinweis-Text, sonst null. Ein
// Eintrag der Liste «Zuletzt geöffnet» trüge denselben Pfad, aber als
// Beschriftung den Dateinamen; gesucht wird deshalb einer, dessen Beschriftung
// das Kürzel trägt.
async function menueEintrag(app, fensterId, toolTip, kuerzel) {
  return hauptLesen(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.id);
      const finde = (items) => {
        for (const it of items || []) {
          if (it.toolTip === a.toolTip && String(it.label).includes(`@${a.kuerzel}`))
            return it.label;
          const tiefer = it.submenu ? finde(it.submenu.items) : null;
          if (tiefer) return tiefer;
        }
        return null;
      };
      return win && win.__wfMenue ? finde(win.__wfMenue.items) : null;
    },
    { id: fensterId, toolTip, kuerzel },
  );
}

async function klickeMenueEintrag(app, fensterId, toolTip, kuerzel) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.id);
      const finde = (items) => {
        for (const it of items || []) {
          if (it.toolTip === a.toolTip && String(it.label).includes(`@${a.kuerzel}`)) return it;
          const tiefer = it.submenu ? finde(it.submenu.items) : null;
          if (tiefer) return tiefer;
        }
        return null;
      };
      const eintrag = win && win.__wfMenue ? finde(win.__wfMenue.items) : null;
      if (eintrag) eintrag.click();
    },
    { id: fensterId, toolTip, kuerzel },
  );
}

async function menueLabel(app, fensterId, workflow) {
  await stosseMenueAn(app, fensterId);
  return menueEintrag(app, fensterId, workflow, KUERZEL);
}

test.describe('WF-VERKN-01: Zustimmung, Anzeige mit Kürzel und Abschalten (4T-002426)', () => {
  test('erst mit dem Schalter erscheint der fremde Workflow in Menü, Palette und Seite', async () => {
    const { a, b, workflow } = baueBereiche({ zustimmung: false });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, a);
      const fensterId = await fangeMenue(app, page);

      // Ohne Zustimmung: nichts aus B (AK1).
      await stosseMenueAn(app, fensterId);
      await expect.poll(() => paletteTreffer(page, NAME)).toEqual([]);
      expect(await menueEintrag(app, fensterId, workflow, KUERZEL)).toBeNull();

      // Schalter «Workflows» einschalten (AK5): die Bereichsdatei folgt.
      await setzeZustimmung(page, true);
      const mdda = JSON.parse(fs.readFileSync(path.join(a, 'Area_Settings.mdda'), 'utf8'));
      expect(mdda.settings.areaLinks[0]).toMatchObject({ prefix: KUERZEL, workflows: true });

      // Menü und Palette zeigen ihn mit Name und Kürzel (AK2).
      await expect.poll(() => menueLabel(app, fensterId, workflow)).not.toBeNull();
      const label = await menueEintrag(app, fensterId, workflow, KUERZEL);
      expect(label).toContain(NAME);
      await expect.poll(async () => (await paletteTreffer(page, NAME)).length).toBe(1);
      expect((await paletteTreffer(page, NAME))[0]).toContain(`@${KUERZEL}`);

      // Seite «Workflow-Läufe»: Zeile der Quelle ohne Lauf-Stand, ohne Scharf.
      await hauptSenden(
        app,
        ({ BrowserWindow }, id) => {
          const win = BrowserWindow.fromId(id);
          if (win) win.webContents.send('workflow:menuAction', { kind: 'runs' });
        },
        fensterId,
      );
      const zeile = page.locator(`${SEITE} tr[data-source="${KUERZEL}"]`);
      await expect(zeile).toHaveCount(1);
      await expect(zeile.locator('.wf-runs-foreign')).toContainText(KUERZEL);
      await expect(zeile.locator('.wf-runs-result')).toHaveCount(0);
      await expect(zeile.locator('input[type="checkbox"]')).toHaveCount(0);

      // Abschalten (AK5 der Story): verschwindet aus Menü und Palette.
      await setzeZustimmung(page, false);
      await expect.poll(() => menueLabel(app, fensterId, workflow)).toBeNull();
      await expect.poll(() => paletteTreffer(page, NAME)).toEqual([]);
      expect(fs.readdirSync(b).sort()).toEqual(['Abläufe', 'Area_Settings.mdda']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(a);
      removeDir(b);
    }
  });
});

test.describe('WF-VERKN-02: Lauf eines fremden Workflows in der eigenen Wurzel (4T-002426)', () => {
  test('die Datei entsteht in A, in B wird nichts geschrieben, auch kein Lauf-Stand', async () => {
    const { a, b, workflow } = baueBereiche({ zustimmung: true });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, a);
      const fensterId = await fangeMenue(app, page);
      await expect.poll(() => menueLabel(app, fensterId, workflow)).not.toBeNull();
      await klickeMenueEintrag(app, fensterId, workflow, KUERZEL);

      // AK3, AK7: angelegt im eigenen Bereich.
      await expect.poll(() => fs.existsSync(path.join(a, ERGEBNIS))).toBe(true);
      // Das Ergebnis erscheint in der Statusleiste mit Name und Kürzel (AK4).
      await expect(page.locator('#statusbar-hint')).toContainText(NAME);
      await expect(page.locator('#statusbar-hint')).toContainText(KUERZEL);
      // AK4: in B nichts Neues — weder die Datei noch eine Begleitdatei.
      expect(fs.existsSync(path.join(b, ERGEBNIS))).toBe(false);
      expect(fs.readdirSync(path.join(b, 'Abläufe'))).toEqual([`${NAME}.md`]);
      expect(fs.readdirSync(b).sort()).toEqual(['Abläufe', 'Area_Settings.mdda']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(a);
      removeDir(b);
    }
  });
});
