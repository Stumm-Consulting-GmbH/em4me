// 4T-001531 (Epic 3E-000175): E2E-Funktions-Suite — Umbenennung eines Tags über
// alle seine Vorkommen.
//
// Kern der Zusage: Wer einen Tag in der Übersicht sieht, kann ihn dort
// umbenennen; die Anwendung zeigt ihm vorher, was sie ändern wird, und ändert
// danach genau das — im Frontmatter-Feld wie im Fließtext, über alle Dateien
// des Bereichs hinweg.
//
// Geprüft werden der Zugang (AK1), die Vorschau samt Auszeichnung der
// mitwandernden Kinder (AK3), das Ergebnis im Tag-Panel (AK7) und der Abbruch,
// der den Bestand unangetastet lässt (AK8). Der Lauf selbst und seine beiden
// Schreibwege stehen in test/unit/tag-umbenennung.test.js an der realen
// Konstellation; hier zählt der Bedienweg.
//
// Der Bereich wird über window.api.openAreaPath gebunden (Muster
// bereichs-ersetzen.spec.js aus demselben Zug).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { bedieneBis } = require('../helpers/eingabe');

const PANE = '.pane-group[data-pane="0"]';
const TAGS = `${PANE} .sidebar-tags`;
const PANEL = `${PANE} .sidebar-searchresults`;
const BALKEN = `${PANEL} .search-results-rename`;

// Kunstwörter: So kann kein Treffer aus einer mitgelieferten Datei oder aus der
// Oberfläche stammen.
const ALT = 'zwiebelkuchen';
const NEU = 'apfelkuchen';

function makeAreaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-tagumbenennung-'));
  fs.writeFileSync(
    path.join(dir, 'start.md'),
    ['---', 'tags:', `  - ${ALT}`, '---', '', `# Start`, '', `Hier steht #${ALT}.`, ''].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'zweite.md'),
    ['# Zweite', '', `Ein Kind: #${ALT}/blech und noch einmal #${ALT}.`, ''].join('\n'),
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

// Das Tag-Panel öffnen und auf den Index warten. Der Umweg über das
// Backlinks-Panel stößt den Index-Aufbau an (Muster 4t-0177.spec.js).
async function tagPanelOeffnen(page) {
  await page.locator('#btn-backlinks').click();
  await page.locator('#btn-tags').click();
  const eintrag = page.locator(`${TAGS} .tags-tree .tags-tree-item`).filter({ hasText: ALT });
  await expect(eintrag.first()).toBeVisible({ timeout: 30000 });
  return eintrag;
}

// Der Zugang: Rechtsklick auf den Tag-Eintrag, dann der eine Menü-Eintrag.
async function umbenennenOeffnen(page) {
  const eintrag = await tagPanelOeffnen(page);
  await eintrag.first().click({ button: 'right' });
  const menue = page.locator('#context-menu .context-menu-item[data-menu-id="tag-rename"]');
  await expect(menue).toBeVisible();
  await menue.click();
  await expect(page.locator('#name-input-modal')).toBeVisible();
}

test.describe('TU-01: Zugang und Dialog', () => {
  test('öffnet den Dialog aus der Tag-Übersicht und nennt den alten Namen', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await umbenennenOeffnen(page);

      // AK2: Der Dialog beantwortet die eine Frage, auf die es ankommt — wie
      // heißt der Tag bisher.
      await expect(page.locator('#name-input-description')).toContainText(ALT);
      await expect(page.locator('#name-input-field')).toHaveValue(ALT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });

  test('weist einen Namen zurück, der kein Tag wäre (AK2)', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await umbenennenOeffnen(page);

      await page.locator('#name-input-field').fill('mit leerzeichen');
      await page.locator('#btn-name-input-ok').click();
      // Der Dialog bleibt stehen und sagt, warum.
      await expect(page.locator('#name-input-error')).toBeVisible();
      await expect(page.locator('#name-input-modal')).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('TU-02: Vorschau', () => {
  test('zeigt die Fundstellen und weist die mitwandernden Kinder aus (AK3)', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await umbenennenOeffnen(page);
      await page.locator('#name-input-field').fill(NEU);
      await page.locator('#btn-name-input-ok').click();

      // Vier Fundstellen in zwei Dateien: Feld und Fließtext in start.md, zwei
      // im Fließtext von zweite.md. Die Datei ohne Vorkommen erscheint nicht.
      await expect(page.locator(`${PANEL} .search-results-item`)).toHaveCount(4);
      await expect(page.locator(`${PANEL} .search-results-group`)).toHaveCount(2);

      const balken = page.locator(BALKEN);
      await expect(balken).toBeVisible();
      await expect(balken).toContainText(ALT);
      await expect(balken).toContainText(NEU);
      // Die Bedingung der Entscheidung E4: Das Kind wird ausgewiesen.
      await expect(page.locator(`${BALKEN} .search-results-rename-children`)).toBeVisible();
      await expect(page.locator(`${PANEL} .search-results-rename-target.kind`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });

  test('lässt den Bestand unverändert, wenn der Anwender abbricht (AK8)', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await umbenennenOeffnen(page);
      await page.locator('#name-input-field').fill(NEU);
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator(BALKEN)).toBeVisible();

      await page.locator(`${BALKEN} .search-results-rename-cancel`).click();
      await expect(page.locator(BALKEN)).toBeHidden();

      // Kein Zeichen bewegt: Die Vorschau hat nichts geschrieben.
      expect(fs.readFileSync(path.join(dir, 'start.md'), 'utf8')).toContain(`#${ALT}`);
      expect(fs.readFileSync(path.join(dir, 'zweite.md'), 'utf8')).toContain(`#${ALT}/blech`);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('TU-04: Vorschau bei belegter Reiter-Gruppe', () => {
  // 4T-001533 (Epic 3E-000175): Der Befund des Product Owners vom 2026-09-08 am
  // gebauten Programm — der Dialog verschwand, und danach geschah sichtbar
  // nichts. Das Suchergebnis-Panel liegt in der Finde-Gruppe der linken Sidebar
  // hinter Gliederung, Unterseiten und Datei-Graph; war es zwar sichtbar, stand
  // aber ein anderer Reiter der Gruppe vorn, blieb die Trefferliste hinter ihm
  // liegen.
  //
  // **Warum die übrigen Fälle das nicht fanden:** Sie starten mit geschlossenem
  // Panel, und dann schaltet dieselbe Funktion es ein und holt den Reiter dabei
  // nach vorn. Der Fall entsteht erst, wenn das Panel schon offen ist — also im
  // Alltag jedes Anwenders, der einmal gesucht hat.
  test('holt den Reiter nach vorn, wenn die Gliederung ihn verdeckt', async () => {
    test.setTimeout(120000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      // Ausgangslage des Befunds: Das Panel ist sichtbar, aber die Gliederung
      // derselben Gruppe steht vorn.
      //
      // 4T-001534: Der Statusbar-Schalter SCHALTET, er öffnet nicht. Nach dem
      // Binden des Bereichs gilt die Trefferliste bereits als sichtbar und ist
      // allein vom Reiter verdeckt — also genau der Zustand, den dieser Fall
      // herstellen will. Ein einzelner Klick schloss sie deshalb, statt sie zu
      // öffnen, und der Fall scheiterte an seiner eigenen Ausgangslage, ohne die
      // Zusicherung unten je zu erreichen. Gemessen am 2026-09-08 in der
      // Release-Strecke des Zuges 3E-000279: vor dem Klick `tab-hidden`, nach dem
      // ersten Klick unverändert, nach dem zweiten frei. Bedient wird deshalb,
      // bis die Wirkung eintritt, statt einmal zu klicken und auf sie zu warten.
      const panel = page.locator(`${PANE} .sidebar-searchresults`);
      await bedieneBis(
        page.locator('#btn-search-results'),
        async () => !((await panel.getAttribute('class')) || '').includes('tab-hidden'),
      );
      await page.locator('#btn-outline').click();
      await expect(panel).toHaveClass(/tab-hidden/);

      await umbenennenOeffnen(page);
      await page.locator('#name-input-field').fill(NEU);
      await page.locator('#btn-name-input-ok').click();

      // Die Vorschau ist zu SEHEN und nicht bloß vorhanden.
      await expect(panel).not.toHaveClass(/tab-hidden/);
      await expect(page.locator(BALKEN)).toBeVisible();
      await expect(page.locator(`${PANEL} .search-results-item`)).toHaveCount(4);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});

test.describe('TU-03: Lauf', () => {
  test('benennt beide Notationen über alle Dateien um und zieht das Panel nach', async () => {
    test.setTimeout(180000);
    const dir = makeAreaDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'start.md')] });
    try {
      await bindArea(page, dir);
      await umbenennenOeffnen(page);
      await page.locator('#name-input-field').fill(NEU);
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator(`${PANEL} .search-results-item`)).toHaveCount(4);

      await page.locator(`${BALKEN} .search-results-rename-ok`).click();
      // Der Bericht der Ersetzen-Strecke; er ist der gemeinsame Abschluss mit
      // dem freien Ersetzen.
      const bericht = page.locator('#link-report-modal');
      await expect(bericht).toBeVisible({ timeout: 30000 });
      await page.locator('#btn-link-report-ok').click();

      const start = fs.readFileSync(path.join(dir, 'start.md'), 'utf8');
      const zweite = fs.readFileSync(path.join(dir, 'zweite.md'), 'utf8');
      expect(start).toContain(`  - ${NEU}`);
      expect(start).toContain(`#${NEU}.`);
      expect(start).not.toContain(ALT);
      expect(zweite).toContain(`#${NEU}/blech`);
      expect(zweite).not.toContain(ALT);
      // Die Datei ohne Vorkommen ist nicht angefasst worden.
      expect(fs.readFileSync(path.join(dir, 'ohne.md'), 'utf8')).toBe(
        '# Ohne\n\nNichts zu finden.\n',
      );

      // AK7: Die Übersicht führt den neuen Namen; ein eigener
      // Aktualisierungs-Pfad entsteht dafür nicht.
      const eintraege = page.locator(`${TAGS} .tags-tree .tags-tree-item`);
      await expect(eintraege.filter({ hasText: NEU }).first()).toBeVisible({ timeout: 30000 });
      await expect(eintraege.filter({ hasText: ALT })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});
