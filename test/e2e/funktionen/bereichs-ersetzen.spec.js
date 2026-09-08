// 4T-001526 (Epic 3E-000169): E2E-Funktions-Suite — bereichsweites Ersetzen.
//
// Kern der Zusage: Wer in einem Bereich sucht, kann die Fundstellen auswaehlen
// und in EINEM Lauf ersetzen — auch in Dateien, die gar nicht geoeffnet sind.
// Geprueft werden der Zugang (AK1), der Lauf samt Wirkung auf der Platte, die
// neu gerechnete Trefferliste danach (AK5), der Bericht (AK6) und der
// unveraenderte Zustand ohne Bereich (AK7).
//
// Der Bereich wird ueber den Pfad-Einstieg window.api.openAreaPath gebunden
// (Muster bereichs-suche.spec.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const PANEL = `${PANE} .sidebar-searchresults`;
const BEGRIFF = 'Zwiebelkuchen';
const ERSATZ = 'Apfelkuchen';

// Kunstwoerter: So kann kein Treffer aus einer mitgelieferten Datei oder aus
// der Oberflaeche stammen.
function makeAreaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bereichsersetzen-'));
  fs.writeFileSync(path.join(dir, 'start.md'), `# Start\n\nHier steht ${BEGRIFF}.\n`, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'zweite.md'),
    `# Zweite\n\n${BEGRIFF} und noch einmal ${BEGRIFF}.\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'ohne.md'), '# Ohne\n\nNichts zu finden.\n', 'utf8');
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

async function bindArea(page, dir) {
  const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
  expect(res.boundExisting).toBe(true);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

function gruppen(page) {
  return page.locator(`${PANEL} .search-results-group .search-results-group-title`);
}

// Ersetzen-Leiste oeffnen und den Suchbegriff setzen. Strg+H genuegt im
// Bereich; der Bearbeiten-Modus ist dafuer seit 4T-001526 nicht mehr noetig.
async function ersetzenOeffnen(page, begriff, ersatz) {
  await warteAufReiter(page);
  await page.keyboard.press('Control+h');
  const eingabe = page.locator('#search-input');
  await expect(eingabe).toBeVisible();
  await eingabe.fill(begriff);
  await expect(gruppen(page)).toHaveCount(2);
  await page.locator('#search-replace').fill(ersatz);
}

test.describe('BE-01: Zugang zum Ersetzen im Bereich', () => {
  test('oeffnet die Ersetzen-Zeile und zeigt die Auswahl-Ebene', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await ersetzenOeffnen(page, BEGRIFF, ERSATZ);

      // AK1: Die Ersetzen-Zeile ist bedienbar, der Sammel-Knopf frei.
      await expect(page.locator('#search-replace')).toBeEnabled();
      await expect(page.locator('#btn-search-replace-all')).toBeEnabled();
      // Der Einzel-Ersatz bleibt abgeschaltet: Im Bereich entscheidet die
      // Auswahl in der Liste, nicht der aktive Treffer (4T-001525).
      await expect(page.locator('#btn-search-replace')).toBeDisabled();
      // Die Auswahl-Ebene steht, alles ist ausgewaehlt.
      await expect(page.locator(`${PANEL} .search-results-list`)).toHaveClass(/auswahl-modus/);
      await expect(page.locator(`${PANEL} .search-results-check`)).toHaveCount(5);
      await expect(page.locator(`${PANEL} .search-results-check:not(:checked)`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BE-02: Lauf ueber den Bereich', () => {
  test('ersetzt in einer nicht geoeffneten Datei und rechnet die Liste neu', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await ersetzenOeffnen(page, BEGRIFF, ERSATZ);

      await page.locator('#btn-search-replace-all').click();

      // AK6: Der Bericht erscheint und nennt die geaenderten Dateien.
      const bericht = page.locator('#link-report-modal');
      await expect(bericht).toBeVisible();
      await expect(bericht).toContainText('zweite.md');
      await page.locator('#btn-link-report-ok').click();
      await expect(bericht).toBeHidden();

      // Die Wirkung steht auf der Platte — auch in der Datei, die nie
      // geoeffnet war.
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'zweite.md'), 'utf8'))
        .toBe(`# Zweite\n\n${ERSATZ} und noch einmal ${ERSATZ}.\n`);
      expect(fs.readFileSync(path.join(dir, 'ohne.md'), 'utf8')).toBe(
        '# Ohne\n\nNichts zu finden.\n',
      );

      // AK5: Die Trefferliste zeigt den neuen Stand; der alte Begriff kommt
      // nicht mehr vor.
      await expect.poll(async () => gruppen(page).count()).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });

  test('ersetzt nur die ausgewaehlten Fundstellen', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await ersetzenOeffnen(page, BEGRIFF, ERSATZ);

      // Die ganze Gruppe 'zweite' abwaehlen; ihr Ankreuzfeld steht als
      // Geschwister unmittelbar VOR ihrem Kopf.
      const kopf = page.locator(`${PANEL} .search-results-group`, { hasText: 'zweite' });
      await kopf
        .locator('xpath=preceding-sibling::input[contains(@class,"search-results-check")][1]')
        .uncheck();
      await expect(page.locator(`${PANEL} .search-results-check:not(:checked)`)).toHaveCount(3);

      await page.locator('#btn-search-replace-all').click();
      await page.locator('#btn-link-report-ok').click();

      // start.md ist ersetzt, zweite.md unangetastet.
      await expect
        .poll(() => fs.readFileSync(path.join(dir, 'start.md'), 'utf8'))
        .toContain(ERSATZ);
      expect(fs.readFileSync(path.join(dir, 'zweite.md'), 'utf8')).toBe(
        `# Zweite\n\n${BEGRIFF} und noch einmal ${BEGRIFF}.\n`,
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

// 4T-001560 (Epic 3E-000280): Der Bereich ist Suchraum, auch wenn kein Reiter
// offen ist. Der Fall lässt sich nur am ganzen Weg zeigen — die Raum-Bestimmung
// prüft der Unit-Test, ob daraus wirklich Treffer und ein Ersetzen-Zugang
// werden, zeigt erst das laufende Programm.
test.describe('BE-04: Bereich ohne offenen Reiter', () => {
  test('sucht und oeffnet das Ersetzen, wenn alle Dateien geschlossen sind', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await warteAufReiter(page);

      // Alle Reiter schliessen; der Bereich bleibt gebunden.
      const reiter = page.locator(SEL.tabs0);
      for (let i = await reiter.count(); i > 0; i--) {
        await reiter.first().locator('.tab-close').click();
      }
      await expect(reiter).toHaveCount(0);

      // AK2: Die Suche erfasst den Bereich, obwohl keine Datei offen ist.
      await page.keyboard.press('Control+f');
      await page.locator('#search-input').fill(BEGRIFF);
      await expect(page.locator('#search-scope')).toHaveText(/Bereich/i);
      await expect(gruppen(page)).toHaveCount(2);
      await page.keyboard.press('Escape');

      // AK3: Der Zugang zum Ersetzen steht in derselben Lage offen.
      await page.keyboard.press('Control+h');
      await expect(page.locator('#search-input')).toBeVisible();
      await expect(page.locator('#search-replace')).toBeEnabled();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BE-03: ohne Bereich kein Bereichs-Ersetzen', () => {
  test('haelt die Ersetzen-Zeile in einer losen Datei am bisherigen Weg', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      // Bewusst KEIN bindArea: Die Datei ist lose geoeffnet.
      await warteAufReiter(page);
      await page.keyboard.press('Control+h');
      // AK7: Ohne Bereich und ohne Bearbeiten-Modus gibt es keinen Zugang —
      // die Leiste bleibt zu, wie vor diesem Task.
      await expect(page.locator('#search-input')).toBeHidden();
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});
