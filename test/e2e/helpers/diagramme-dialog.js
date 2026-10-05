// 4T-002024 (Epic 3E-000192): Gemeinsame Helfer der beiden Ablauf-Prüfdateien
// von «Diagramm einfügen und bearbeiten» (test/e2e/funktionen/
// diagramme-dialog.spec.js und diagramme-bedienung.spec.js): Prüf-Dokumente,
// Messwerte an Editor, Kontextmenü, Kommando-Palette und Menü der Anwendung
// sowie die wiederkehrenden Handgriffe. Aus der früher einen Prüfdatei
// herausgelöst, damit keiner der Helfer zweimal steht.
// 4T-002072: EINGEFUEGT trägt den Namen als Kopf-Zeile `table: tabelle-1` in
// der Tabelle (TABELLE_BENANNT) statt in einer Zeile unter ihr.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./app');
const { SEL } = require('./selectors');
const { pressUntilVisible } = require('./eingabe');
const { hauptLesen, hauptSenden } = require('./haupt-zugriff');

const P0 = SEL.pane(0);
const MENU = '#context-menu';
const DIALOG = '.chart-dialog-modal';
const PALETTE = '#command-palette-modal';
const HINWEIS = '#statusbar-hint';

const EINFUEGEN = 'Diagramm zu dieser Tabelle einfügen';
const BEARBEITEN = 'Diagramm bearbeiten';

// Zaun-Blöcke als Zeilen-Listen (Muster diagramme.spec.js).
const Z = '```';
const TABELLE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | 70 |',
  Z,
];

// Z1 Absatz, Z3 bis Z8 Datentabelle ohne Namen, Z10 Absatz.
const OHNE_NAME = ['Erster Absatz.', '', ...TABELLE, '', 'Letzter Absatz.', ''].join('\n');

// Was «Einfügen» mit den Vorgaben des Dialogs aus OHNE_NAME macht (Schreib-Kern
// src/shared/charts/chart-edit.js, dort gegen den Byte-Stand geprüft).
// 4T-002072: Der Name steht als erste Kopf-Zeile `table: tabelle-1` in der
// Tabelle (Z4), unter ihr keine Zeile; das Diagramm nennt ihn ohne
// Dach-Zeichen. Der Öffner des Diagramms bleibt auf Z11.
const TABELLE_BENANNT = [TABELLE[0], 'table: tabelle-1', ...TABELLE.slice(1)];
const EINGEFUEGT = [
  'Erster Absatz.',
  '',
  ...TABELLE_BENANNT,
  '',
  `${Z}perspective-chart`,
  'table: tabelle-1',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen, Ausgaben',
  Z,
  '',
  'Letzter Absatz.',
  '',
].join('\n');

// Z1 Absatz, Z3 bis Z8 Datentabelle, Z9 Name, Z11 bis Z16 Diagramm, Z18 Absatz.
const DIAGRAMM = [
  `${Z}perspective-chart`,
  'table: ^umsatz',
  'type: bar',
  'labels: Monat',
  'values: Einnahmen',
  Z,
];
const MIT_DIAGRAMM = [
  'Erster Absatz.',
  '',
  ...TABELLE,
  '^umsatz',
  '',
  ...DIAGRAMM,
  '',
  'Letzter Absatz.',
  '',
].join('\n');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramme-de-'));
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

// --- Messwerte ---------------------------------------------------------------

// Text und Schreibmarke des Editors der linken Spalte.
function editor(page, content = P0.editorContent) {
  return page.evaluate((C) => {
    const el = document.querySelector(C);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    const { state } = tile.view;
    return {
      text: state.doc.toString(),
      zeile: state.doc.lineAt(state.selection.main.head).number,
    };
  }, content);
}

const text = async (page, content) => (await editor(page, content)).text;
const marke = async (page) => (await editor(page)).zeile;

// Zeilen des Live-Modus, die als Quelltext dastehen (ein aufgeklappter Block
// zeigt seinen Zaun als Zeile).
function quelltextZeilen(page) {
  return page
    .locator(`${P0.editorContent} .cm-line`)
    .evaluateAll((els) => els.map((el) => el.textContent).filter((t) => t.startsWith('```')));
}

// Die Einträge des Kontextmenüs: Kennung und Text, oder null ohne Menü.
function kontextmenue(page) {
  return page.evaluate((M) => {
    const menu = document.querySelector(M);
    if (!menu || menu.hidden || menu.children.length === 0) return null;
    return Array.from(menu.children).map((k) => ({
      id: k.dataset.menuId || null,
      text: k.textContent.trim(),
    }));
  }, MENU);
}

// Zwei Bilder abwarten: Ein Kontextmenü entsteht im selben Ereignis-Durchlauf
// wie der Rechtsklick; ist danach keins da, kommt keins mehr.
function zweiBilder(page) {
  return page.evaluate(
    () =>
      new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(() => fertig()))),
  );
}

async function keinKontextmenue(page) {
  await zweiBilder(page);
  expect(await kontextmenue(page)).toBeNull();
}

// Einträge der Kommando-Palette zu einem Filter, je mit Wählbarkeit.
async function palette(page, filter) {
  await pressUntilVisible(page, 'Control+k', page.locator(PALETTE));
  await page.locator('#command-palette-filter').fill(filter);
  const eintrag = page.locator('.command-palette-item', { hasText: filter }).first();
  await expect(eintrag).toBeVisible();
  return page.locator('.command-palette-item').evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      waehlbar: !el.classList.contains('unavailable'),
    })),
  );
}

function waehlbar(eintraege, label) {
  const e = eintraege.find((x) => x.text.includes(label));
  return e ? e.waehlbar : null;
}

async function schliessePalette(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator(PALETTE)).toBeHidden();
}

// Höhe des Diagramm-Widgets und Abstand der Zeilennummer «Letzter Absatz» zu
// ihrer Zeile; der Umriss des ersten Diagramms.
function lageImEditor(page) {
  return page.evaluate((S) => {
    const w = document.querySelector(`${S} .cm-live-block .perspective-chart`);
    const zeile = Array.from(document.querySelectorAll(`${S} .cm-line`)).find((l) =>
      l.textContent.includes('Letzter Absatz.'),
    );
    const nummer = Array.from(
      document.querySelectorAll(`${S} .cm-lineNumbers .cm-gutterElement`),
    ).find((g) => g.textContent.trim() === '18');
    const stil = w ? getComputedStyle(w) : null;
    return {
      hoehe: w ? w.closest('.cm-live-block').getBoundingClientRect().height : null,
      abstand:
        zeile && nummer
          ? Math.abs(nummer.getBoundingClientRect().top - zeile.getBoundingClientRect().top)
          : null,
      umriss: stil ? stil.outlineStyle : null,
    };
  }, P0.paneSource);
}

// Menü der Anwendung, passiv mitgeschrieben: jeder Neubau über setMenu, ohne
// eigenen Anstoß. Die Meldung eines Wechsels der Lage ist eine Automatik; ein
// erzwungener Neubau (menuZustand in helpers/menu-zustand.js schaltet dafür
// ein Panel zweimal um) läse die Lage selbst neu und verdeckte eine fehlende
// Meldung (Stabilitätsregel 11).
async function schreibeMenueMit(app) {
  await hauptSenden(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__deMitschrift) return;
    win.__deMitschrift = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const out = {};
      const sammle = (items) => {
        for (const it of items || []) {
          if (it.label) out[it.label] = it.enabled !== false;
          if (it.submenu) sammle(it.submenu.items);
        }
      };
      sammle(menu ? menu.items : []);
      globalThis.__deMenue = out;
      return orig(menu);
    };
  });
}

// Wählbarkeit eines Eintrags im zuletzt gebauten Menü, null ohne Neubau.
function imMenue(app, label) {
  return hauptLesen(
    app,
    (_electron, l) =>
      globalThis.__deMenue && l in globalThis.__deMenue ? globalThis.__deMenue[l] : null,
    label,
  );
}

// --- Bedienung ---------------------------------------------------------------

const LIVE_GITTER = `${P0.editorContent} .perspective-datatable`;
const LIVE_DIAGRAMM = `${P0.editorContent} .perspective-chart`;
const GER_GITTER = `${P0.markdownBody} .perspective-datatable`;
const GER_DIAGRAMM = `${P0.markdownBody} .perspective-chart`;

async function oeffneLive(page, { bearbeiten = true, diagramme = 0 } = {}) {
  await page.locator(SEL.viewBtn('live')).click();
  if (bearbeiten) {
    await page.locator(SEL.btnEdit).click();
    await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
  } else {
    await expect(page.locator(SEL.btnEdit)).not.toHaveClass(/active/);
  }
  await expect(page.locator(`${LIVE_GITTER} .pdt-grid`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(`${LIVE_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(
    diagramme,
    { timeout: 15000 },
  );
}

async function oeffneGeteilt(page, { bearbeiten = true, diagramme = 0 } = {}) {
  await page.locator(SEL.viewBtn('split')).click();
  if (bearbeiten) {
    await page.locator(SEL.btnEdit).click();
    await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
  }
  await expect(page.locator(`${GER_GITTER} .pdt-grid`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(`${GER_DIAGRAMM}[data-chart-state="drawn"] svg`)).toHaveCount(
    diagramme,
    { timeout: 15000 },
  );
}

// Schreibmarke in die erste Zeile, über den Text (die Zeile steht oben).
async function markeOben(page) {
  await page.locator(`${P0.editorContent} .cm-line`, { hasText: 'Erster Absatz.' }).click();
  await expect.poll(() => marke(page)).toBe(1);
}

const datenzelle = (page, basis, nr = 0) => page.locator(`${basis} tbody td.pdt-cell`).nth(nr);

async function rechtsklickUndEintrag(page, ziel, id) {
  await ziel.click({ button: 'right' });
  await expect(page.locator(`${MENU} [data-menu-id="${id}"]`)).toBeVisible();
}

async function bestaetige(page) {
  await page.locator(`${DIALOG} [data-aktion="bestaetigen"]`).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);
}

async function mitApp(dateien, arbeit, opts = {}) {
  const dir = makeDir();
  const pfade = Object.entries(dateien).map(([name, inhalt]) => schreibe(dir, name, inhalt));
  const { app, page, userData } = await launchApp({
    args: opts.args ? opts.args(pfade) : [pfade[0]],
  });
  try {
    await expect(page.locator(P0.tabs).first()).toBeVisible();
    await arbeit({ app, page, dir, pfade });
  } finally {
    await closeApp(app, userData, { force: true });
    cleanupDir(dir);
  }
}

module.exports = {
  P0,
  MENU,
  DIALOG,
  PALETTE,
  HINWEIS,
  EINFUEGEN,
  BEARBEITEN,
  Z,
  TABELLE,
  TABELLE_BENANNT,
  OHNE_NAME,
  EINGEFUEGT,
  DIAGRAMM,
  MIT_DIAGRAMM,
  makeDir,
  cleanupDir,
  schreibe,
  editor,
  text,
  marke,
  quelltextZeilen,
  kontextmenue,
  zweiBilder,
  keinKontextmenue,
  palette,
  waehlbar,
  schliessePalette,
  lageImEditor,
  schreibeMenueMit,
  imMenue,
  LIVE_GITTER,
  LIVE_DIAGRAMM,
  GER_GITTER,
  GER_DIAGRAMM,
  oeffneLive,
  oeffneGeteilt,
  markeOben,
  datenzelle,
  rechtsklickUndEintrag,
  bestaetige,
  mitApp,
};
