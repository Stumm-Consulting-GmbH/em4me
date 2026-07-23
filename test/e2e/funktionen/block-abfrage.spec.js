// 4T-0409 (Epic 3E-0077): E2E-Funktions-Suite Block-Abfrage (BLOCKS-Scope der
// Perspective-Abfrage). BQ-01 prueft den Treffer-Aufbau aus der blockData-
// Sektion der .mdd und den Anker-Sprung des Klicks (Datei oeffnen UND zum
// Block scrollen); BQ-02 den Invalidierungs-Pfad am realen Nutzungspfad:
// Eigenschafts-Aenderung im Block-Eigenschaften-Panel (blockData:write ->
// updateBlockDataForFile -> backlinks:invalidated) aktualisiert die sichtbare
// Trefferliste ohne App-Neustart.
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

const QUERY_FENCE = ['```perspective-query', 'LIST BLOCKS WHERE status = "offen"', '```'].join(
  '\n',
);

// Ziel-Datei mit Fueller-Absaetzen vor dem Anker-Block, damit der Anker-Sprung
// (Scroll in den Viewport) beobachtbar ist.
function zielContent() {
  const filler = Array.from({ length: 60 }, (_, i) => `Fueller-Absatz ${i + 1}.`).join('\n\n');
  return `# Ziel\n\n${filler}\n\nOffener Punkt am Blockende. ^abc\n`;
}

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blockquery-'));
  fs.writeFileSync(path.join(dir, 'Uebersicht.md'), `# Uebersicht\n\n${QUERY_FENCE}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'Ziel.md'), zielContent(), 'utf8');
  const mdd = {
    schemaVersion: 1,
    history: { anchors: [], packets: [] },
    blockData: {
      abc: { values: { status: 'offen' }, updated: '2026-07-08T09:00:00Z' },
      weg: { values: { status: 'offen' }, updated: '2026-07-08T09:00:00Z' },
    },
  };
  fs.writeFileSync(path.join(dir, 'Ziel.mdd'), JSON.stringify(mdd, null, 2) + '\n', 'utf8');
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Profil mit Standard-Ansichtsmodus (Muster block-eigenschaften.spec.js).
function viewModeProfile(mode) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blockquery-profil-'));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ app: { defaultViewMode: mode } }),
    'utf8',
  );
  return userData;
}

test.describe('BQ-01: Block-Abfrage — Treffer als Datei#^anker, Klick springt zum Block', () => {
  test('LIST BLOCKS zeigt aktive Block-Treffer; Klick oeffnet das Ziel am Anker', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const items = page.locator(`${SEL.markdownBody0} a.perspective-query-item`);
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Genau der aktive Anker ^abc; der verwaiste Eintrag 'weg' (kein Anker
      // im Dokument) ist kein Treffer. Der Index baut asynchron auf.
      await expect(items).toHaveCount(1, { timeout: 15000 });
      await expect(items.nth(0)).toHaveText('Ziel#^abc');

      // Klick: Datei oeffnet sich im selben Pane, der Anker-Sprung bringt den
      // Block in den Viewport (Fueller-Absaetze davor machen das beobachtbar).
      await items.nth(0).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(`${SEL.markdownBody0} [id="abc"]`)).toBeInViewport({
        timeout: 5000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('BQ-02: Block-Abfrage — Panel-Aenderung invalidiert die sichtbare Liste', () => {
  test('Eigenschafts-Aenderung im Panel aktualisiert die Trefferliste ohne Neustart', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const ziel = path.join(dir, 'Ziel.md');
    // Split-Modus: Editor (Cursor-Folge des Panels) und Render-Pane zugleich.
    const { app, page, userData } = await launchApp({
      args: [uebersicht, ziel],
      userData: viewModeProfile('split'),
    });
    const items = page.locator(`${SEL.markdownBody0} a.perspective-query-item`);
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Ziel.md (aktiv) nach rechts — Pane 2 entsteht, Uebersicht bleibt in
      // Pane 1 sichtbar und zeigt die Trefferliste.
      await page.keyboard.press('Control+Alt+ArrowRight');
      const pane1 = page.locator('.pane-group[data-pane="1"]');
      await expect(pane1).toBeVisible();
      await expect(items).toHaveCount(1, { timeout: 15000 });

      // Block-Eigenschaften-Panel in der aktiven Pane 2 oeffnen, Cursor in den
      // Anker-Block setzen und den status-Wert aendern (Debounce-Save ->
      // blockData:write -> Index-Invalidierung -> Liste aktualisiert).
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await pane1.locator('.pane-source .cm-content').getByText('Offener Punkt').click();
      const valueInput = pane1
        .locator('.sidebar-blockprops .block-props-fields .properties-field-value-input')
        .first();
      await expect(valueInput).toHaveValue('offen');
      await valueInput.fill('erledigt');

      // WHERE status = "offen" trifft nicht mehr: Liste leert sich, der
      // lokalisierte Leer-Hinweis erscheint.
      await expect(items).toHaveCount(0, { timeout: 15000 });
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-status`)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('BQ-03: Block-Abfrage — Paritaet und Klick im Live-Modus', () => {
  test('Live-Widget zeigt die Block-Treffer; Klick oeffnet das Ziel', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({
      args: [uebersicht],
      userData: viewModeProfile('live'),
    });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const liveItems = page.locator(`${SEL.editorContent0} a.perspective-query-item`);
      await expect(liveItems).toHaveCount(1, { timeout: 15000 });
      await expect(liveItems.nth(0)).toHaveText('Ziel#^abc');
      // Klick laeuft ueber den Widget-Container-Handler (mousedown; die
      // zentralen CM-Handler erreichen das Block-Widget wegen ignoreEvent
      // nicht) und oeffnet die Zieldatei; der Anker-Sprung haengt an
      // derselben openInPane-Kette.
      await liveItems.nth(0).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Ziel');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
