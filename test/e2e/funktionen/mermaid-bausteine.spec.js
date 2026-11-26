// 4T-002617 (Epic 3E-000391): E2E-Funktions-Suite — Mermaid-Bausteine
// (MB-01 bis MB-05).
//
// MB-01 Je Diagramm-Art fügt der Knopf «Mermaid-Diagramm» der Format-Toolbar
//       das Gerüst ein; die geteilte Ansicht zeichnet es, Rückgängig entfernt
//       den Block in einem Schritt.
// MB-02 Die Auswahl folgt der Lage der Schreibmarke: im Text die vier Gerüste,
//       im Körper eines Ablauf-Blocks seine Bausteine, in einem fremden
//       Code-Block der ausgegraute Hinweis.
// MB-03 Baustein «Knoten» in einem eingerückten Block unter einem Listenpunkt
//       trägt die Einrückung der Körper-Zeilen; Rückgängig in einem Schritt.
// MB-04 Erweiterung «Mermaid-Diagramme» über die Einstellungen aus: Knopf,
//       Kontextmenü-Eintrag und Palette-Eintrag fehlen; wieder an: alle da.
// MB-05 Kontextmenü und Kommando-Palette fügen dasselbe ein wie der Knopf.
//
// Alle Fälle arbeiten auf einer Kopie im Temp-Ordner; die Fixture bleibt
// unberührt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite, pressUntilVisible } = require('../helpers/eingabe');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { text, kontextmenue } = require('../helpers/diagramme-dialog');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'mermaid-bausteine.md',
);
const TOOLBAR = '#format-toolbar-0';
const KNOPF = `${TOOLBAR} [data-special="mermaid"]`;
const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;
const PALETTE = '#command-palette-modal';
const PALETTE_NAME = '.command-palette-item .command-palette-name';
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const GEZEICHNET = `${SEL.markdownBody0} .mermaid-block svg`;

const ARTEN = {
  flowchart: 'flowchart TD',
  sequenceDiagram: 'sequenceDiagram',
  gantt: 'gantt',
  classDiagram: 'classDiagram',
};
const GERUESTE = Object.keys(ARTEN).map((art) => `mermaid-geruest-${art}`);
const ABLAUF_BAUSTEINE = ['knoten', 'verzweigung', 'verbindung', 'beschriftet'].map(
  (id) => `mermaid-baustein-flowchart-${id}`,
);
const ABSATZ = 'Ein Absatz im Text.\n';

async function sendMenuChannel(app, channel, ...args) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Arbeits-Kopie in einem eigenen Temp-Ordner, damit Änderungen die Fixture
// nicht berühren.
function arbeitsKopie(inhalt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-mermaid-e2e-'));
  const datei = path.join(dir, 'Mermaid.md');
  fs.writeFileSync(datei, inhalt == null ? fs.readFileSync(FIXTURE, 'utf8') : inhalt, 'utf8');
  return { dir, datei };
}

function aufraeumen(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Temp-Reste sind unkritisch */
  }
}

async function oeffneBearbeitbar(app, page, ansicht) {
  await expect(page.locator(SEL.tabs0)).toHaveCount(1);
  await sendMenuChannel(app, 'menu:viewChange', ansicht);
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
  await expect(page.locator(TOOLBAR)).toBeVisible();
}

// Schreibmarke an das Ende der Editor-Zeile mit dem Text.
async function markeAnsEnde(page, zeilenText) {
  await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: zeilenText }).first().click();
  await page.keyboard.press('End');
}

// Auswahl über den Knopf öffnen und die Kennungen der Einträge lesen.
async function auswahlUeberKnopf(page) {
  await page.locator(KNOPF).click();
  await expect(page.locator(MENU)).toBeVisible();
  await expect.poll(async () => (await kontextmenue(page)) !== null).toBe(true);
  return (await kontextmenue(page)).map((e) => e.id);
}

async function menueSchliessen(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator(MENU)).toBeHidden();
}

// Kontextmenü am Ende der Zeile öffnen und «Einfügen» aufklappen.
async function oeffneEinfuegen(page, zeilenText) {
  await page
    .locator(`${SEL.editorContent0} .cm-line`, { hasText: zeilenText })
    .first()
    .click({ button: 'right' });
  await page.locator(item('insert')).hover();
  await expect(page.locator(item('insert-codeblock'))).toBeVisible();
}

async function paletteFiltern(page, filter) {
  await pressUntilVisible(page, 'Control+k', page.locator(PALETTE));
  await page.locator('#command-palette-filter').fill(filter);
}

test.describe('MB-01: Gerüst je Diagramm-Art über den Knopf', () => {
  test('jedes Gerüst wird in der geteilten Ansicht gezeichnet, Rückgängig entfernt den Block', async () => {
    const { dir, datei } = arbeitsKopie(ABSATZ);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneBearbeitbar(app, page, 'split');
      await expect(page.locator(KNOPF)).toHaveAttribute('title', 'Mermaid-Diagramm');
      for (const [art, kopf] of Object.entries(ARTEN)) {
        await markeAnsEnde(page, 'Ein Absatz im Text.');
        await page.locator(KNOPF).click();
        await page.locator(item(`mermaid-geruest-${art}`)).click();
        await expect.poll(() => text(page)).toContain('```mermaid\n' + kopf + '\n');
        await expect(page.locator(GEZEICHNET)).toHaveCount(1, { timeout: 20000 });
        await expect(page.locator(`${SEL.markdownBody0} code.language-mermaid`)).toHaveCount(0);
        await page.keyboard.press('Control+z');
        await expect.poll(() => text(page)).toBe(ABSATZ);
        await expect(page.locator(GEZEICHNET)).toHaveCount(0, { timeout: 10000 });
      }
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});

test.describe('MB-02: Auswahl folgt der Lage der Schreibmarke', () => {
  test('Text: vier Gerüste; Ablauf-Körper: Bausteine; fremder Code-Block: Hinweis', async () => {
    const { dir, datei } = arbeitsKopie();
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneBearbeitbar(app, page, 'source');
      await markeAnsEnde(page, 'Ein Absatz im Text.');
      expect(await auswahlUeberKnopf(page)).toEqual(GERUESTE);
      await expect(page.locator(item('mermaid-geruest-flowchart'))).toHaveText(
        'Ablauf (Flowchart)',
      );
      await menueSchliessen(page);

      await markeAnsEnde(page, 'N1[Start] --> N2[Ende]');
      expect(await auswahlUeberKnopf(page)).toEqual(ABLAUF_BAUSTEINE);
      await expect(page.locator(item('mermaid-baustein-flowchart-knoten'))).toHaveText('Knoten');
      await menueSchliessen(page);

      await markeAnsEnde(page, 'const wert = 1;');
      expect(await auswahlUeberKnopf(page)).toEqual(['mermaid-bausteine-hinweis']);
      await expect(page.locator(item('mermaid-bausteine-hinweis'))).toHaveClass(/disabled/);
      await menueSchliessen(page);
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});

test.describe('MB-03: Baustein im eingerückten Block unter einem Listenpunkt', () => {
  test('der Knoten trägt die Einrückung der Körper-Zeilen, Rückgängig nimmt ihn zurück', async () => {
    const { dir, datei } = arbeitsKopie();
    const original = fs.readFileSync(FIXTURE, 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneBearbeitbar(app, page, 'source');
      await markeAnsEnde(page, 'N1[Start] --> N2[Ende]');
      await page.locator(KNOPF).click();
      await page.locator(item('mermaid-baustein-flowchart-knoten')).click();
      await expect
        .poll(() => text(page))
        .toBe(
          original.replace(
            '    N1[Start] --> N2[Ende]\n',
            '    N1[Start] --> N2[Ende]\n    N3[Schritt]\n',
          ),
        );
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(original);
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});

test.describe('MB-04: Aus-Zustand der Erweiterung über die Einstellungen', () => {
  test('aus: Knopf, Kontextmenü- und Palette-Eintrag fehlen; wieder an: alle drei da', async () => {
    const { dir, datei } = arbeitsKopie(ABSATZ);
    const { app, page, userData } = await launchApp({ args: [datei] });

    async function schalten(an) {
      await oeffneEinstellungsSeite(page);
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`)
        .click();
      const schalter = page.locator('#settings-extension-mermaid');
      await expect(schalter).toBeVisible();
      if (an) await schalter.check();
      else await schalter.uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
    }

    async function zugaengePruefen(erwartet) {
      await expect(page.locator(KNOPF)).toHaveCount(erwartet);
      await oeffneEinfuegen(page, 'Ein Absatz im Text.');
      await expect(page.locator(item('insert-mermaid'))).toHaveCount(erwartet);
      await page.keyboard.press('Escape');
      await expect(page.locator(MENU)).toBeHidden();
      await paletteFiltern(page, 'Mermaid-Diagramm');
      await expect(page.locator(PALETTE_NAME, { hasText: 'Mermaid-Diagramm…' })).toHaveCount(
        erwartet,
      );
      await page.keyboard.press('Escape');
      await expect(page.locator(PALETTE)).toBeHidden();
    }

    try {
      await oeffneBearbeitbar(app, page, 'source');
      await zugaengePruefen(1);
      await schalten(false);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await zugaengePruefen(0);
      await schalten(true);
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await zugaengePruefen(1);
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});

test.describe('MB-05: Kontextmenü und Kommando-Palette fügen dasselbe ein wie der Knopf', () => {
  test('Ablauf-Gerüst über drei Zugänge ergibt denselben Editor-Inhalt', async () => {
    const { dir, datei } = arbeitsKopie(ABSATZ);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneBearbeitbar(app, page, 'source');

      // Knopf.
      await markeAnsEnde(page, 'Ein Absatz im Text.');
      await page.locator(KNOPF).click();
      await page.locator(item('mermaid-geruest-flowchart')).click();
      await expect.poll(() => text(page)).toContain('flowchart TD');
      const ueberKnopf = await text(page);
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(ABSATZ);

      // Kontextmenü «Einfügen → Mermaid-Diagramm → Ablauf».
      await oeffneEinfuegen(page, 'Ein Absatz im Text.');
      await expect(page.locator(item('insert-mermaid'))).toContainText('Mermaid-Diagramm');
      await page.locator(item('insert-mermaid')).hover();
      await page.locator(item('mermaid-geruest-flowchart')).click();
      await expect.poll(() => text(page)).toContain('flowchart TD');
      expect(await text(page)).toBe(ueberKnopf);
      await page.keyboard.press('Control+z');
      await expect.poll(() => text(page)).toBe(ABSATZ);

      // Kommando-Palette «Mermaid-Diagramm…» → Auswahl → Ablauf.
      await markeAnsEnde(page, 'Ein Absatz im Text.');
      await paletteFiltern(page, 'Mermaid-Diagramm…');
      await expect(page.locator(PALETTE_NAME).first()).toHaveText('Mermaid-Diagramm…');
      await page.keyboard.press('Enter');
      await expect(page.locator(PALETTE)).toBeHidden();
      await page.locator(item('mermaid-geruest-flowchart')).click();
      await expect.poll(() => text(page)).toContain('flowchart TD');
      expect(await text(page)).toBe(ueberKnopf);
    } finally {
      await closeApp(app, userData, { force: true });
      aufraeumen(dir);
    }
  });
});
