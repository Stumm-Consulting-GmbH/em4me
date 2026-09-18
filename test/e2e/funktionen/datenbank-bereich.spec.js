// 4T-001758 (Epic 3E-000253, AK8): E2E-Funktions-Suite — der Einstellungs-
// Bereich «Datenbank» in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Der
// Abschnitt ist ein neu eingeführtes, dauerhaft sichtbares Bedienelement; die
// Entwicklungsrichtlinien verlangen dafür einen Fall, der es sichtbar rendert
// und nicht nur seinen Quelltext als Zeichenkette liest. Drei Zusagen hängen
// zusammen und lassen sich ausschließlich hier zeigen:
//
//   1. Die Bereichs-Art wird an einem ECHTEN Bestand erkannt. Der Steckbrief
//      liegt im Frontmatter einer Datei auf der Platte, der Index liest sie,
//      der Katalog leitet daraus ab. Kein jsdom-Fall hat einen Index.
//   2. Der Abschnitt steht in der Gruppe «Aktueller Bereich» und erscheint nur
//      in einem Bereich mit Datenbank. Das ist die Aussage von AK4, und sie
//      gilt der gerenderten Navigation und nicht einem Prädikat.
//   3. Die Option landet in der ECHTEN Bereichsdatei. Der Weg führt über den
//      Entwurf, den apply-Haken der Seite, den IPC-Kanal und den Schreiber;
//      die Datei danach zu lesen, ist der einzige vollständige Nachweis.
//
// Der Bereich wird über den Pfad-Einstieg window.api.openAreaPath gebunden
// (Muster bereichs-verknuepfungen.spec.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const NAV_AREA = `${SETTINGS_PAGE} [data-nav-group="area"]`;
const EINTRAG_DB = `${SETTINGS_PAGE} .settings-nav-entry[data-section-id="database"]`;

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Ein Bereich mit Datenbank: ein Dokument mit Steckbrief und eine Tabelle.
// Geschrieben wird genau das Format, das der Steckbrief-Parser liest.
function baueDatenbankBereich() {
  const wurzel = tmpDir('em4me-db-bereich-');
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
      '---',
      '',
      'Tabelle Personen.',
      '',
    ].join('\n'),
    'utf8',
  );
  return wurzel;
}

// Ein Bereich ohne Datenbank: nur Prosa.
function baueProsaBereich() {
  const wurzel = tmpDir('em4me-prosa-bereich-');
  fs.writeFileSync(path.join(wurzel, 'Notiz.md'), '# Notiz\n\nNur Prosa.\n', 'utf8');
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

async function oeffneEinstellungen(page) {
  await expect
    .poll(async () => {
      if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
        await page.keyboard.press('Control+,');
      }
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
  // Die Gruppe «Aktueller Bereich» steht, sobald der Bereich gebunden ist.
  await expect(page.locator(NAV_AREA)).toBeVisible();
}

test.describe('DB-BER-01: Einstellungs-Bereich «Datenbank» (4T-001758)', () => {
  test('erscheint in einem Bereich mit Datenbank und zeigt die Auskunft', async () => {
    const wurzel = baueDatenbankBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneEinstellungen(page);

      // AK4: Der Abschnitt steht in der Gruppe «Aktueller Bereich». Die
      // Erkennung läuft über den Index, deshalb das großzügige Zeitlimit.
      await expect(
        page.locator(`${NAV_AREA} .settings-nav-entry[data-section-id="database"]`),
      ).toBeVisible({ timeout: 15000 });

      await page.locator(EINTRAG_DB).click();
      const inhalt = page.locator(`${SETTINGS_PAGE} .settings-section-body`);
      await expect(inhalt).toBeVisible();

      // AK5: Name und Beschreibung aus dem Steckbrief, die Tabellenzahl aus
      // den Definitionen, die Fehlerlagen als eigene Zeile.
      await expect(inhalt).toContainText('Mini-CRM');
      await expect(inhalt).toContainText('Kontakte und Firmen');
      const werte = inhalt.locator('.settings-row .settings-row-hint');
      await expect(werte.filter({ hasText: /^1$/ })).toHaveCount(1);

      // AK6: Die Option ist da und unbenutzt aus.
      const schalter = inhalt.locator('#settings-database-overview-on-open');
      await expect(schalter).toBeVisible();
      await expect(schalter).not.toBeChecked();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('fehlt in einem Bereich ohne Datenbank', async () => {
    const wurzel = baueProsaBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneEinstellungen(page);

      // Die übrigen Bereichs-Abschnitte stehen; nur dieser fehlt. Ohne den
      // Gegenbeleg links wäre der Fall auch bei einer gar nicht gebauten
      // Navigation grün.
      await expect(
        page.locator(`${NAV_AREA} .settings-nav-entry[data-section-id="areaLinks"]`),
      ).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(page.locator(EINTRAG_DB)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('die Option landet in der Bereichsdatei und wird zurückgelesen', async () => {
    const wurzel = baueDatenbankBereich();
    const mdda = path.join(wurzel, 'Area_Settings.mdda');
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneEinstellungen(page);
      await expect(page.locator(EINTRAG_DB)).toBeVisible({ timeout: 15000 });
      await page.locator(EINTRAG_DB).click();

      await page.locator(`${SETTINGS_PAGE} #settings-database-overview-on-open`).check();
      await page.locator('#btn-settings-apply').click();

      // AK6: Der Wert steht in der echten Bereichsdatei des Bereichs.
      await expect
        .poll(
          () => {
            if (!fs.existsSync(mdda)) return null;
            try {
              return JSON.parse(fs.readFileSync(mdda, 'utf8')).settings.database.overviewOnOpen;
            } catch {
              return null;
            }
          },
          { timeout: 10000 },
        )
        .toBe(true);

      // Und er wird beim nächsten Öffnen der Seite wieder angezeigt.
      await page.keyboard.press('Control+w');
      await oeffneEinstellungen(page);
      await expect(page.locator(EINTRAG_DB)).toBeVisible({ timeout: 15000 });
      await page.locator(EINTRAG_DB).click();
      await expect(
        page.locator(`${SETTINGS_PAGE} #settings-database-overview-on-open`),
      ).toBeChecked();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
