// 4T-000616 (Epic 3E-000116): E2E-Funktions-Suite — Bereichs-Suche.
//
// Kern der Zusage: Wer in einer Datei eines geoeffneten Bereichs sucht,
// findet auch, was in einer ANDEREN, nicht geoeffneten Datei desselben
// Bereichs steht. Geprueft werden der Trefferraum, der Rang der offenen
// Datei samt ihrem ungespeicherten Stand, die Markierung im Text ohne Klick,
// der Sprung in eine fremde Datei, der Durchlauf ueber die Datei-Grenze und
// das unveraenderte Verhalten ohne Bereich.
//
// Der Bereich wird ueber den Pfad-Einstieg window.api.openAreaPath gebunden
// (Muster bereiche.spec.js und bereichs-lesezeichen.spec.js).
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

// Der Suchbegriff ist bewusst ein Kunstwort: So kann kein Treffer aus einer
// mitgelieferten Datei oder aus der Oberflaeche stammen.
function makeAreaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-bereichssuche-'));
  fs.writeFileSync(
    path.join(dir, 'start.md'),
    `# Start\n\nHier steht ${BEGRIFF} einmal.\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'zweite.md'),
    `# Zweite\n\n${BEGRIFF} und noch einmal ${BEGRIFF}.\n`,
    'utf8',
  );
  fs.mkdirSync(path.join(dir, 'unter'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'unter', 'dritte.md'),
    `# Dritte\n\nAuch hier: ${BEGRIFF}.\n`,
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

// Die Tastatur-Bindings stehen erst am Ende des asynchronen init(); ein
// sichtbarer Reiter ist das Bereitschafts-Signal (Muster der Smoke-Suite und
// der Handbuch-Such-Spec).
async function warteAufReiter(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function sucheOeffnen(page, begriff) {
  await warteAufReiter(page);
  await page.keyboard.press('Control+f');
  const input = page.locator('#search-input');
  await expect(input).toBeVisible();
  await input.fill(begriff);
}

// Die Gruppen-Koepfe der Trefferliste in ihrer Reihenfolge.
function gruppen(page) {
  return page.locator(`${PANEL} .search-results-group .search-results-group-title`);
}

// Der Suchlauf im Bereich laeuft ueber die Prozess-Grenze und ist damit
// asynchron; ohne dieses Warten liest ein Test die noch leere Liste.
async function warteAufTreffer(page, anzahlGruppen) {
  await expect(gruppen(page)).toHaveCount(anzahlGruppen);
}

test.describe('BS-01: Trefferraum ueber alle Bereichs-Dateien', () => {
  test('findet Fundstellen in Dateien, die gar nicht geoeffnet sind', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);

      // Die Suchleiste weist den Bereich als Suchraum aus.
      await expect(page.locator('#search-scope')).toHaveText(/Bereich/i);

      // Drei Dateien tragen den Begriff, 'ohne.md' nicht.
      await expect(gruppen(page)).toHaveCount(3);
      const titel = await gruppen(page).allTextContents();
      expect(titel.some((t) => t.includes('zweite'))).toBe(true);
      expect(titel.some((t) => t.includes('unter/dritte'))).toBe(true);
      expect(titel.some((t) => t.includes('ohne'))).toBe(false);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

// B-01 (4T-000904): Dieser Fall ist zugleich der szenario-treue Regressionstest
// zur stillen Ausnahme in setCurrentMatch. Er stellt genau die gemeldete Lage
// her — geoeffneter Bereich (Geltungsbereich 'area') plus offene Datei im
// Editor, deren Treffer ueber performSourceSearch als Editor-Positionen
// entstehen. Rot wurde er nicht an einer eigenen Zusicherung, sondern ueber den
// Konsolen-Waechter aus 4T-000901: Die Ausnahme brach die Markierung still ab.
test.describe('BS-02: offene Datei zuerst, mit ihrem Editor-Stand', () => {
  test('stellt die offene Datei voran und findet Ungespeichertes', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);
      // Die offene Datei steht an erster Stelle der Liste.
      await expect(gruppen(page).first()).toHaveText(/start/);
      await page.keyboard.press('Escape');

      // Ungespeicherte Ergaenzung im Editor: Der Bearbeiten-Modus schreibt in
      // tab.content, und genau der wandert mit dem Suchauftrag hinueber.
      await page.keyboard.press('Control+e');
      // Der Selektor muss mit .pane-source qualifiziert sein: '.cm-content'
      // allein trifft auch die Notiz-CodeMirror-Instanz der Sidebar.
      const editor = page.locator(`${PANE} .pane-source .cm-content`);
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(`\n\nNachtrag mit ${BEGRIFF} und ${BEGRIFF}.`);

      await sucheOeffnen(page, BEGRIFF);
      await expect(gruppen(page).first()).toHaveText(/start/);
      // Einer aus der Datei plus zwei ungespeicherte.
      const ersteZahl = page
        .locator(`${PANEL} .search-results-group .search-results-group-count`)
        .first();
      await expect(ersteZahl).toHaveText('3');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('BS-03: Markierung im Text ohne Klick', () => {
  test('markiert die Treffer der offenen Datei sofort', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'zweite.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);
      // Ohne einen einzigen Klick in die Liste stehen die Marken im Text.
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match`)).toHaveCount(2);
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match-current`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BS-04: Sprung in eine andere Datei', () => {
  test('oeffnet die Zieldatei und hebt die Fundstelle hervor', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);

      // Treffer einer FREMDEN Datei anklicken.
      const zeile = page
        .locator(`${PANEL} .search-results-group`, { hasText: 'unter/dritte' })
        .locator('xpath=following-sibling::button[contains(@class,"search-results-item")][1]');
      await zeile.click();

      await expect.poll(() => page.title()).toContain('dritte');
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match-current`)).toHaveCount(1);
      // Reihenfolge mit Anker start.md: start(1), unter/dritte(1), zweite(2).
      // Der angeklickte Fund ist damit global der zweite — und bleibt es, weil
      // die Liste sich durch den Sprung nicht umsortiert.
      await expect(page.locator('#search-count')).toHaveText('2 / 4');
      // Die Gruppen-Reihenfolge ueberlebt den Sprung unveraendert.
      await expect(gruppen(page).first()).toHaveText(/start/);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BS-05: Durchlauf ueber die Datei-Grenze', () => {
  test('F3 laeuft aus der offenen Datei in die naechste weiter', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);
      // start.md steht als offene Datei vorn und traegt genau einen Treffer;
      // der naechste Schritt muss also in eine andere Datei fuehren.
      await page.keyboard.press('F3');
      await expect.poll(() => page.title(), { timeout: 15000 }).not.toContain('start');
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });

  // Befund des Product Owners vom 2026-07-29: Der Zaehler lief nie ueber die
  // Datei hinaus, er zeigte „1 von 4" in drei verschiedenen Dateien. Ursache
  // war die Umsortierung der Liste bei jedem Sprung; die Anker-Datei haelt sie
  // jetzt stabil. Ohne diese Korrektur ist dieser Fall rot.
  test('der Zaehler laeuft ueber alle Treffer des Bereichs, nicht je Datei', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await sucheOeffnen(page, BEGRIFF);
      await warteAufTreffer(page, 3);

      const zaehler = page.locator('#search-count');
      await expect(zaehler).toHaveText('1 / 4');
      const gesehen = ['1 / 4'];
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('F3');
        await expect
          .poll(async () => (await zaehler.textContent()) !== gesehen[gesehen.length - 1], {
            timeout: 15000,
          })
          .toBe(true);
        gesehen.push((await zaehler.textContent()).trim());
      }
      expect(gesehen).toEqual(['1 / 4', '2 / 4', '3 / 4', '4 / 4']);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});

test.describe('BS-06: ohne Bereich bleibt es bei der Dokument-Suche', () => {
  test('durchsucht eine lose Datei nur in sich selbst', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      // Bewusst KEIN bindArea: Die Datei ist lose geoeffnet.
      await sucheOeffnen(page, BEGRIFF);
      await expect(page.locator('#search-scope')).not.toHaveText(/Bereich/i);
      // Die Trefferliste bleibt leer, die Marken stehen im Dokument.
      await expect(gruppen(page)).toHaveCount(0);
      await expect(page.locator(`${PANE} .markdown-body mark.mdv-match`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});
