// 4T-000364 (Epic 3E-000067): E2E-Suite Block-Eigenschaften-Panel. Deckt das Oeffnen
// ueber das Ansicht-Menue, das Anker-Dropdown, das Anlegen eines Ankers fuer einen
// Block ohne Anker samt Persistenz einer Eigenschaft in die .mdd sowie die
// Verwaisten-Anzeige (Daten ohne Anker im Text) ab. Der Datenpfad selbst ist in
// test/unit/mdd-store.test.js und test/unit/block-anchors.test.js getestet.
// 4T-000365: zusaetzlich der Block-Metadaten-Indikator — Erscheinen im Render-Pane
// (BP-04), Nachziehen ueber den blockData:changed-Broadcast beim Anlegen/Loeschen
// von Eigenschaften (BP-05) und die Live-Modus-Variante samt Klick-Pfad (BP-06).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

const PANE0 = '.pane-group[data-pane="0"]';
const SEC = `${PANE0} .sidebar-blockprops`;
const ANCHOR_SELECT = `${SEC} .block-props-anchor-select`;
const CREATE_BTN = `${SEC} .block-props-create-btn`;
const NO_ANCHOR = `${SEC} .block-props-no-anchor`;
const FIELDS = `${SEC} .block-props-fields`;
const ADD_BTN = `${SEC} .block-props-add-btn`;
const ORPHANS = `${SEC} .block-props-orphans`;
// 4T-000365: Indikator im Render-Pane (Post-Prozessor) und im Live-Modus (Widget).
const RENDER_INDICATOR = `${PANE0} .pane-rendered .markdown-body .block-meta-indicator`;
const LIVE_INDICATOR = `${PANE0} .pane-source .cm-block-meta-indicator`;

function makeWorkFile(prefix, content) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, content, 'utf8');
  return { workDir, workFile };
}

// Profil mit gewaehltem Standard-Ansichtsmodus. 'source' fuer Cursor-Tests (der
// Default 'rendered' verbirgt den Editor, das Panel ist dann read-only), 'split'
// fuer Indikator-Tests mit Editor UND Render-Pane, 'live' fuer das Live-Widget.
function viewModeProfile(mode) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blockprops-profil-'));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ app: { defaultViewMode: mode } }),
    'utf8',
  );
  return userData;
}

function mddPathOf(mdPath) {
  return mdPath.replace(/\.md$/, '.mdd');
}

function seedBlockData(workFile, blockData) {
  const mdd = { schemaVersion: 1, history: { anchors: [], packets: [] }, blockData };
  fs.writeFileSync(mddPathOf(workFile), JSON.stringify(mdd, null, 2) + '\n', 'utf8');
}

function readBlockData(mdPath) {
  try {
    return JSON.parse(fs.readFileSync(mddPathOf(mdPath), 'utf8')).blockData ?? null;
  } catch {
    return null;
  }
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

function cleanup(workDir) {
  try {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch offen: best effort */
  }
}

test.describe('BP-01: Panel oeffnen, Anker waehlen, Eigenschaft sehen', () => {
  test('Dropdown listet die Anker; Auswahl zeigt die Block-Eigenschaft', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp01-',
      '# Titel\n\nEin Absatz mit Anker. ^abc\n',
    );
    seedBlockData(workFile, {
      abc: { values: { status: 'offen' }, updated: '2026-07-07T00:00:00Z' },
    });
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await expect(page.locator(`${ANCHOR_SELECT} option[value="abc"]`)).toHaveCount(1);
      // Anker im Dropdown waehlen -> aktiver Anker, Felder zeigen die Eigenschaft.
      await page.locator(ANCHOR_SELECT).selectOption('abc');
      await expect(page.locator(`${FIELDS} .properties-field-key`).first()).toHaveValue('status');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-02: Anker anlegen und Eigenschaft speichern', () => {
  test('Create-Button legt einen Anker an; neue Eigenschaft landet in der .mdd', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp02-',
      '# Titel\n\nBlock ohne Anker.\n',
    );
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('source'),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      // Cursor in den ankerlosen Absatz setzen -> "Anker anlegen" erscheint.
      await page.locator(SEL.editorContent0).getByText('Block ohne Anker.').click();
      await expect(page.locator(NO_ANCHOR)).toBeVisible();
      await page.locator(CREATE_BTN).click();
      // Anker angelegt: der Hinweis verschwindet, der Eigenschafts-Bereich erscheint.
      await expect(page.locator(NO_ANCHOR)).toBeHidden();
      await expect(page.locator(ADD_BTN)).toBeVisible();
      // Eigenschaft hinzufuegen und Wert setzen.
      await page.locator(ADD_BTN).click();
      await page.locator(`${FIELDS} .properties-field-value-input`).first().fill('fertig');
      // Debounce-Save schreibt die .mdd (der Anker-Schluessel ist zufaellig).
      await expect
        .poll(() => {
          const bd = readBlockData(workFile);
          const entry = bd ? Object.values(bd)[0] : null;
          return entry ? Object.values(entry.values)[0] : null;
        })
        .toBe('fertig');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-03: Verwaiste Daten anzeigen', () => {
  test('Daten ohne Anker im Text erscheinen im Verwaisten-Abschnitt', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp03-',
      '# Titel\n\nText ohne den passenden Anker.\n',
    );
    seedBlockData(workFile, {
      weg: { values: { notiz: 'x' }, updated: '2026-07-07T00:00:00Z' },
    });
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await expect(page.locator(ORPHANS)).toBeVisible();
      await expect(page.locator(`${ORPHANS} .block-props-orphan-id`)).toHaveText('^weg');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-04: Indikator im Render-Pane (4T-000365)', () => {
  test('Indikator erscheint am Block mit Daten; Hover-Title; Klick oeffnet das Panel', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp04-',
      '# Titel\n\nAbsatz ohne Daten.\n\nAbsatz mit Daten. ^abc\n',
    );
    seedBlockData(workFile, {
      abc: { values: { status: 'offen' }, updated: '2026-07-07T00:00:00Z' },
    });
    // Default-Modus 'rendered': das Render-Pane ist die aktive Ansicht.
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      // Genau ein Indikator, am Block des Ankers, mit den Werten im title.
      const indicator = page.locator(RENDER_INDICATOR);
      await expect(indicator).toHaveCount(1);
      await expect(indicator).toHaveAttribute('data-anchor-id', 'abc');
      await expect(indicator).toHaveAttribute('title', 'status: offen');
      // Klick oeffnet das Panel mit dem Anker als Kontext.
      await indicator.click();
      await expect(page.locator(SEC)).toBeVisible();
      await expect(page.locator(ANCHOR_SELECT)).toHaveValue('abc');
      await expect(page.locator(`${FIELDS} .properties-field-key`).first()).toHaveValue('status');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-05: Indikator folgt den Daten (Broadcast, 4T-000365)', () => {
  test('Eigenschaft anlegen laesst den Indikator erscheinen, Loeschen entfernt ihn', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp05-',
      '# Titel\n\nBlock mit Anker ohne Daten. ^blk\n',
    );
    // Split-Modus: Editor (Cursor-Folge) und Render-Pane (Indikator) zugleich.
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('split'),
    });
    try {
      await waitForTab(page);
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(0);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      // Cursor in den Anker-Block -> Panel aktiviert ^blk, Eigenschaft anlegen.
      await page.locator(SEL.editorContent0).getByText('Block mit Anker ohne Daten.').click();
      await expect(page.locator(ADD_BTN)).toBeVisible();
      await page.locator(ADD_BTN).click();
      await page.locator(`${FIELDS} .properties-field-value-input`).first().fill('ja');
      // Debounce-Save -> Broadcast -> Indikator erscheint im Render-Pane.
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(1);
      await expect(page.locator(RENDER_INDICATOR)).toHaveAttribute('data-anchor-id', 'blk');
      // Eigenschaft loeschen -> leerer Anker-Eintrag -> Indikator verschwindet.
      await page.locator(`${FIELDS} .properties-field-delete`).first().click();
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-06: Indikator im Live-Modus (4T-000365)', () => {
  test('Live-Widget erscheint an der Anker-Zeile; Klick oeffnet das Panel', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp06-',
      '# Titel\n\nAbsatz mit Daten. ^abc\n',
    );
    seedBlockData(workFile, {
      abc: { values: { prio: 'hoch' }, updated: '2026-07-07T00:00:00Z' },
    });
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('live'),
    });
    try {
      await waitForTab(page);
      const indicator = page.locator(LIVE_INDICATOR);
      await expect(indicator).toHaveCount(1);
      await expect(indicator).toHaveAttribute('title', 'prio: hoch');
      await indicator.click();
      await expect(page.locator(SEC)).toBeVisible();
      await expect(page.locator(`${FIELDS} .properties-field-key`).first()).toHaveValue('prio');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});
