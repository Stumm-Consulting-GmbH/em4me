// 4T-001759 (Epic 3E-000253, AK8): E2E-Funktions-Suite — die Übersichts-Seite
// der Datenbank in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Seite und ihre beiden Zugänge sind neu eingeführte, dauerhaft sichtbare
// Bedienelemente; die Entwicklungsrichtlinien verlangen dafür einen Fall, der
// sie sichtbar rendert und nicht nur ihren Quelltext liest. Vier Zusagen
// hängen zusammen und lassen sich ausschließlich hier zeigen:
//
//   1. Der Eintrag steht im Ansichtsmenü. Das Menü baut der Haupt-Prozess je
//      Fenster; kein jsdom-Fall sieht es.
//   2. Der Eintrag steht im Kontextmenü des Bereichs-Panels — und nur dort, wo
//      der Bereich eine Datenbank führt. Die Erkennung läuft über den echten
//      Index auf einem echten Bestand.
//   3. Die Seite zeigt Steckbrief, Tabellen mit ihrer Feld-Zahl und die
//      Fehlerlagen als Sätze mit eingesetztem Feld-Namen. Die Kette reicht von
//      der Datei über den Index und den Katalog bis in das DOM.
//   4. Die Option in der Bereichsdatei öffnet die Seite beim Binden des
//      Bereichs. Sie ist die einzige Zusage, die eine echte Bindung braucht.
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Menü-Labels über die
// fünf Sprachfassungen, Menü-Einträge über ihre stabile Kennung, Seiten-Inhalt
// über die Daten des angelegten Bestands. Der einzige Text-Vergleich ist der
// eingesetzte Feld-Name in einer Fehlerlage — und genau er ist die Aussage:
// Aus einem Hinweis-Code ist ein lesbarer Satz geworden.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

const MENU_LABELS = LOCALE_CODES.map(
  (code) => require(`../../../src/i18n/${code}.json`)['menu.view.databaseOverview'],
);

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .db-overview-page`;
const AREA_SECTION = `${PANE} .sidebar-area`;
const MENU_EINTRAG =
  '#context-menu .context-menu-item[data-menu-id="area-panel-database-overview"]';

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Ein Bereich mit Datenbank: Steckbrief, eine saubere Tabelle und eine mit
// einem unbrauchbaren Spalten-Typ. Die zweite trägt die Fehlerlage, an der die
// Klartext-Anzeige gemessen wird.
function baueDatenbankBereich() {
  const wurzel = tmpDir('em4me-db-uebersicht-');
  fs.writeFileSync(
    path.join(wurzel, 'Datenbank.md'),
    [
      '---',
      'db-database:',
      '  name: Mini-CRM',
      '  description: Kontakte und Firmen',
      '---',
      '',
      'Beschreibung der Datenbank.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(wurzel, 'Personen.md'),
    [
      '---',
      'db-table:',
      '  fields:',
      '    - name: nachname',
      '      type: string',
      '    - name: vorname',
      '      type: string',
      '---',
      '',
      'Tabelle Personen.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(wurzel, 'Firmen.md'),
    [
      '---',
      'db-table:',
      '  fields:',
      '    - name: firma',
      '      type: string',
      '    - name: gruendung',
      '      type: zeitpunkt',
      '---',
      '',
      'Tabelle Firmen.',
      '',
    ].join('\n'),
    'utf8',
  );
  return wurzel;
}

// Ein Bereich ohne Datenbank: nur Prosa.
function baueProsaBereich() {
  const wurzel = tmpDir('em4me-prosa-uebersicht-');
  fs.writeFileSync(path.join(wurzel, 'Notiz.md'), '# Notiz\n\nNur Prosa.\n', 'utf8');
  return wurzel;
}

// Die Anzeige-Einstellung des Bereichs, geschrieben BEVOR der Bereich gebunden
// wird — so, wie sie nach einem früheren Besuch dastünde.
function setzeOption(wurzel) {
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { database: { overviewOnOpen: true } } }),
    'utf8',
  );
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

// Menü-Inspektion über den setMenu-Interceptor: Die App setzt Menüs pro
// Fenster, Menu.getApplicationMenu() bleibt leer (Muster armMenuCapture in
// arbeitsbereiche.spec.js).
async function armMenuCapture(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__menuCaptureArmed) return;
    win.__menuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const collect = (items) => {
        const out = [];
        for (const it of items || []) {
          if (it.label) out.push(it.label);
          if (it.submenu) out.push(...collect(it.submenu.items));
        }
        return out;
      };
      globalThis.__menuLabels = collect(menu ? menu.items : []);
      return orig(menu);
    };
  });
}

test.describe('DB-UEB-01: Übersichts-Seite der Datenbank (4T-001759)', () => {
  test('Zugänge, Inhalt und Fehlerlagen im Klartext', async () => {
    const wurzel = baueDatenbankBereich();
    const { app, page, userData } = await launchApp();
    try {
      await armMenuCapture(app);
      await bindeBereich(page, wurzel);

      // AK4, erster Zugang: Der Eintrag steht im Ansichtsmenü. Das Menü wird
      // beim Binden neu gebaut, deshalb reicht die Erfassung von oben.
      await expect
        .poll(async () => {
          const labels = await app.evaluate(() => globalThis.__menuLabels || []);
          return labels.some((l) => MENU_LABELS.includes(l));
        })
        .toBe(true);

      // AK4, zweiter Zugang: Der Eintrag steht im Kontextmenü des
      // Bereichs-Panels. Die Erkennung läuft über den Index, deshalb das
      // großzügige Zeitlimit.
      const section = page.locator(AREA_SECTION);
      await expect(section).toBeVisible();
      // `force` und der Escape davor sind kein Kunstgriff, sondern die Folge
      // des wiederholten Versuchs: Das offene Menü liegt nach dem ersten
      // Rechtsklick über der Überschrift, und ein zweiter Klick scheiterte
      // sonst an der Erreichbarkeits-Prüfung statt an der Sache.
      await expect
        .poll(
          async () => {
            await page.keyboard.press('Escape');
            await section.locator('.area-files-title').click({ button: 'right', force: true });
            return page.locator(MENU_EINTRAG).count();
          },
          { timeout: 20000 },
        )
        .toBe(1);

      // Und er öffnet die Seite.
      await page.locator(MENU_EINTRAG).click();
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible();

      // AK1: Name und Beschreibung aus dem Steckbrief.
      await expect(seite).toContainText('Mini-CRM');
      await expect(seite).toContainText('Kontakte und Firmen');

      // AK2: die Tabellen mit der Zahl ihrer Felder, in der Reihenfolge ihrer
      // Dateien. Firmen hat zwei Einträge, von denen einer wegen seines Typs
      // entfällt — deshalb eine Spalte.
      const namen = seite.locator('.db-overview-table-name');
      await expect(namen).toHaveCount(2);
      await expect(namen.nth(0)).toHaveText('Firmen');
      await expect(namen.nth(1)).toHaveText('Personen');
      const zahlen = seite.locator('.db-overview-table-fields');
      await expect(zahlen.nth(0)).toHaveText('1');
      await expect(zahlen.nth(1)).toHaveText('2');

      // AK3: die Fehlerlage als Satz, mit eingesetztem Feld-Namen und der
      // Tabelle davor — nicht als roher Hinweis-Code.
      const fehler = seite.locator('.db-overview-issue');
      await expect(fehler).toHaveCount(1);
      await expect(fehler.locator('.db-overview-issue-source')).toHaveText('Firmen');
      const text = await fehler.locator('.db-overview-issue-text').textContent();
      expect(text).toContain('gruendung');
      expect(text).toContain('string');
      expect(text.length).toBeGreaterThan(30);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('der Zugang fehlt in einem Bereich ohne Datenbank (AK5)', async () => {
    const wurzel = baueProsaBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const section = page.locator(AREA_SECTION);
      await expect(section).toBeVisible();
      // Erst den Index ankommen lassen, dann messen: Ein zu früher Blick wäre
      // auch bei einer Datenbank leer und bewiese nichts.
      await page.waitForTimeout(3000);
      await section.locator('.area-files-title').click({ button: 'right' });
      // Gegenbeleg: Die Nachbar-Einträge stehen, das Menü ist also gebaut.
      await expect(page.locator('#context-menu .context-menu-item')).not.toHaveCount(0);
      await expect(page.locator(MENU_EINTRAG)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('die Option in der Bereichsdatei öffnet die Seite beim Binden (AK6)', async () => {
    const wurzel = baueDatenbankBereich();
    setzeOption(wurzel);
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      // Ohne jeden Handgriff: Die Seite steht, weil die Bereichsdatei es sagt.
      await expect(page.locator(SEITE)).toBeVisible({ timeout: 20000 });
      await expect(page.locator(SEITE)).toContainText('Mini-CRM');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
