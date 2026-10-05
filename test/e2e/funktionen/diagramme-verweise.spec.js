// 4T-002023 (Epic 3E-000192): Ablauf-Prüfdatei der Diagramme als Verweis — die
// Angabe `table: [[Datei#^name]]` eines Diagramm-Blocks verhält sich beim
// Umbenennen und in den Rückverweisen wie eine Einbettung desselben Ziels.
// describe-Titel tragen die Fall-Kennungen DV-01 …
//
//   DV-01  Umbenennen der Datei zieht die Angabe nach (Task AK11, Story
//          4S-001023 AK9); die übrige Datei bleibt Byte für Byte.
//   DV-02  Das Dokument mit dem Diagramm steht in den Rückverweisen des
//          Dokuments mit der Tabelle (Story AK13).
//   DV-03  Umbenennen des Tabellen-Namens über die Block-Eigenschaften zieht
//          das Diagramm im selben Dokument nach; das Diagramm im anderen
//          Dokument zeigt danach «Tabelle fehlt» (Story AK12).
//
// Gemessen wird am Weg des Anwenders (test/README.md, Stabilitätsregel 18):
// Umbenennen über den Dialog, Rückverweise im eingeblendeten Panel, Umbenennen
// des Namens über das Panel der Block-Eigenschaften, das Diagramm an seinem
// Container. Jeder Fall trägt einen Anker, der vor der Messung belegt, dass der
// Ausgangs-Stand sichtbar ist (Muster regression/4t-000952-index-verbraucher.spec.js).
// Die Dokumente entstehen je Fall in einem eigenen Temp-Ordner.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PANE0 = '.pane-group[data-pane="0"]';
const BACKLINKS = `${PANE0} .backlinks-results`;
const BLOCKPROPS = `${PANE0} .sidebar-blockprops`;
const ANKER_AUSWAHL = `${BLOCKPROPS} .block-props-anchor-select`;
const UMBENENNEN = `${BLOCKPROPS} .block-props-rename-btn`;
const UMBENENNEN_FELD = `${BLOCKPROPS} .block-props-rename-input`;
const DIAGRAMM_LESE = `${SEL.markdownBody0} .perspective-chart`;

// Zaun-Blöcke als Zeilen-Listen, damit die Zäune nicht mit den
// Vorlagen-Zeichenketten zusammenstoßen (Muster diagramme.spec.js).
const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '```',
  '^umsatz',
].join('\n');

// Diagramm-Block mit einer Angabe `table:` in wählbarer Schreibweise.
function diagramm(tabelle) {
  return [
    '```perspective-chart',
    'type: bar',
    `table: ${tabelle}`,
    'labels: Monat',
    'values: Einnahmen, Ausgaben',
    '```',
  ].join('\n');
}

// Dokument mit der Tabelle; es trägt zugleich ein eigenes Diagramm auf sie.
const QUARTAL = ['# Quartal', '', TABELLE, '', diagramm('^umsatz'), ''].join('\n');

// Dokument mit dem Diagramm auf die Tabelle im anderen Dokument.
const BERICHT = ['# Bericht', '', diagramm('[[Quartal#^umsatz]]'), '', 'Schluss.', ''].join('\n');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramm-verweise-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, text) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, text, 'utf8');
  return datei;
}

async function sendeMenue(app, kanal) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, k) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(k);
    },
    kanal,
  );
}

async function reiterWaehlen(page, name) {
  await page.locator(SEL.tabs0, { hasText: name }).first().click();
  await expect(page.locator(SEL.activeTab0)).toHaveText(new RegExp(name));
}

// Quelltext-Modus mit Schreibrecht in Spalte 0. Der Bearbeiten-Schalter ist
// ein Umschalter; geklickt wird nur, wenn die Editor-Hülle noch im
// Lese-Zustand steht (Muster 4t-000952-index-verbraucher.spec.js).
async function bearbeitenAn(page) {
  await page.locator(SEL.viewBtn('source')).click();
  const huelle = page.locator(SEL.paneSourceEditor0);
  await expect(huelle).toBeVisible();
  if (await huelle.evaluate((el) => el.classList.contains('read-only'))) {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(huelle).not.toHaveClass(/read-only/);
}

// Zustand des ersten Diagramms der Lese-Ansicht in Spalte 0.
function diagrammZustand(page) {
  return page
    .locator(DIAGRAMM_LESE)
    .first()
    .evaluate((el) => ({
      zustand: el.dataset.chartState || null,
      grund: el.dataset.chartReason || null,
      detail: el.dataset.chartDetail || null,
    }));
}

test.describe('DV-01: Umbenennen der Datei zieht die Angabe table: im Diagramm-Block nach (F-332)', () => {
  test('Quartal umbenennen: Angabe und Einbettung im Bericht folgen, der Rest bleibt byte-gleich', async () => {
    const dir = makeDir();
    const quartal = schreibe(dir, 'Quartal.md', QUARTAL);
    // Die Einbettung desselben Ziels steht daneben: Beide müssen gleich folgen.
    const berichtVorher = [
      '# Bericht',
      '',
      'Einbettung: ![[Quartal#^umsatz]]',
      '',
      diagramm('[[Quartal#^umsatz]]'),
      '',
      'Schluss.',
      '',
    ].join('\n');
    const bericht = schreibe(dir, 'Bericht.md', berichtVorher);
    const { app, page, userData } = await launchApp({ args: [quartal, bericht] });
    try {
      await reiterWaehlen(page, 'Quartal');
      await sendeMenue(app, 'menu:renameFile');
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Jahr');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect(page.locator('#link-preview-modal')).toBeVisible();
      await page.locator('#btn-link-preview-continue').click();
      await expect(page.locator('#link-report-modal')).toBeVisible();
      await page.locator('#btn-link-report-ok').click();
      await expect(page.locator('#link-report-modal')).toBeHidden();

      // Auf der Platte: genau die beiden Datei-Namen sind ersetzt, alles
      // Übrige des Berichts ist unverändert — auch die übrige Fence.
      const erwartet = berichtVorher.replace(/\[\[Quartal#/g, '[[Jahr#');
      await expect.poll(() => fs.readFileSync(bericht, 'utf8'), { timeout: 5000 }).toBe(erwartet);
      expect(erwartet).toContain('table: [[Jahr#^umsatz]]');
      expect(erwartet).toContain('![[Jahr#^umsatz]]');

      // Das Diagramm im Bericht zeichnet weiter aus der umbenannten Datei.
      await reiterWaehlen(page, 'Bericht');
      await expect
        .poll(async () => (await diagrammZustand(page)).zustand, { timeout: 20000 })
        .toBe('drawn');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DV-02: das Diagramm zählt in den Rückverweisen wie eine Einbettung (F-332)', () => {
  test('Bericht erscheint in den Rückverweisen von Quartal, ein Code-Block anderer Art nicht', async () => {
    const dir = makeDir();
    const quartal = schreibe(dir, 'Quartal.md', QUARTAL);
    const bericht = schreibe(dir, 'Bericht.md', BERICHT);
    // Anker: eine Einbettung desselben Ziels, die schon heute zählt.
    schreibe(dir, 'Bestand.md', '# Bestand\n\n![[Quartal#^umsatz]]\n');
    // Rot-Probe: dieselbe Zeile in einem Code-Block anderer Art ist kein Verweis.
    schreibe(
      dir,
      'Fremd.md',
      ['# Fremd', '', '```js', 'table: [[Quartal#^umsatz]]', '```', ''].join('\n'),
    );
    const { app, page, userData } = await launchApp({ args: [quartal, bericht] });
    try {
      await reiterWaehlen(page, 'Quartal');
      await page.locator('#btn-backlinks').click();
      // Anker: Das Panel arbeitet und zeigt die Einbettung. Der Bereichs-Index
      // braucht dafür seinen Anlauf.
      await expect(page.locator(BACKLINKS)).toContainText('Bestand', { timeout: 20000 });
      // Der Bezug aus dem Diagramm-Block steht daneben.
      await expect(page.locator(BACKLINKS)).toContainText('Bericht', { timeout: 20000 });
      await expect(page.locator(BACKLINKS)).not.toContainText('Fremd');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DV-03: Umbenennen des Tabellen-Namens über die Block-Eigenschaften (F-332)', () => {
  test('das Diagramm im selben Dokument folgt, das im anderen Dokument zeigt «Tabelle fehlt»', async () => {
    const dir = makeDir();
    const quartal = schreibe(dir, 'Quartal.md', QUARTAL);
    const bericht = schreibe(dir, 'Bericht.md', BERICHT);
    const { app, page, userData } = await launchApp({ args: [quartal, bericht] });
    try {
      // Anker: Das Diagramm im Bericht zeichnet aus der Tabelle in Quartal.
      await reiterWaehlen(page, 'Bericht');
      await expect
        .poll(async () => (await diagrammZustand(page)).zustand, { timeout: 20000 })
        .toBe('drawn');

      // In Quartal den Namen über das Panel umbenennen.
      await reiterWaehlen(page, 'Quartal');
      await bearbeitenAn(page);
      await sendeMenue(app, 'menu:toggleBlockProps');
      await expect(page.locator(`${ANKER_AUSWAHL} option[value="umsatz"]`)).toHaveCount(1);
      await page.locator(ANKER_AUSWAHL).selectOption('umsatz');
      await expect(page.locator(UMBENENNEN)).toBeVisible();
      await page.locator(UMBENENNEN).click();
      await expect(page.locator(UMBENENNEN_FELD)).toBeVisible();
      await page.locator(UMBENENNEN_FELD).fill('erloes');
      await page.locator(UMBENENNEN_FELD).press('Enter');
      await expect(page.locator(SEL.editorContent0)).toContainText('table: ^erloes');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+s');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // Auf der Platte: Anker und Angabe im selben Dokument tragen den neuen
      // Namen, sonst ist nichts geändert.
      await expect
        .poll(() => fs.readFileSync(quartal, 'utf8'), { timeout: 5000 })
        .toBe(QUARTAL.replace(/\^umsatz/g, '^erloes'));

      // Das Diagramm im selben Dokument zeichnet weiter.
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect
        .poll(async () => (await diagrammZustand(page)).zustand, { timeout: 20000 })
        .toBe('drawn');

      // Das Diagramm im anderen Dokument zieht nicht nach, wie eine Einbettung
      // aus einem anderen Dokument, und nennt den Grund.
      await reiterWaehlen(page, 'Bericht');
      await expect
        .poll(() => diagrammZustand(page), { timeout: 20000 })
        .toEqual({ zustand: 'undrawable', grund: 'table-missing', detail: 'umsatz' });
      await expect(page.locator(`${DIAGRAMM_LESE} .perspective-chart-hint-reason`)).toContainText(
        'umsatz',
      );
      expect(fs.readFileSync(bericht, 'utf8')).toBe(BERICHT);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
