// 4T-002642 (Epic 3E-000397): «Zurück» und «Vor» zwischen besuchten Orten.
//
// Test-Bereich im Wegwerf-Bereich des Falls: «Start» (400 nummerierte Absätze
// «Zeile 001» bis «Zeile 400» aus `helpers/lese-position.js`, in Zeile 130 ein
// Verweis auf «Zwei», in Zeile 132 einer auf «Drei», in Zeile 134 einer auf einen
// Anker im selben Dokument, den es nicht gibt; gerollt wird bis Zeile 120,
// damit der Klick die Fläche nicht erst zum Verweis rollen muss), «Zwei» mit einem Verweis
// auf «Drei» und «Drei». Gemessen wird die oberste sichtbare Zeile der
// Lese-Ansicht; nach jedem Reiter-Wechsel wartet der Fall auf den hergestellten
// Zustand, bevor er rollt oder klickt. Jeder Fall endet am unveränderten Inhalt
// der Dateien auf der Platte.
//
// VZ-01 Verweis, Zurück an die Ausgangsstelle, Vor, Abschneiden; VZ-02 frisches
// Fenster (Kürzel zeigt den Hinweis, Menü-Einträge ausgegraut), VZ-02 b die Knöpfe
// «Zurück» und «Vor» der Statusleiste, VZ-02 c ihr Ausblenden; VZ-03
// geschlossenes Dokument, VZ-03 b nach dem Schließen nachgerücktes Dokument;
// VZ-04 zweite Spalte und zweites Fenster, VZ-04 b verdecktes Dokument der
// anderen Spalte; VZ-05 gelöschtes Dokument; VZ-06
// Live-Modus, VZ-06 b Alt+Pfeil im Buch-Panel; VZ-07 Inhaltsverzeichnis,
// Weitersuchen und Bildlauf, VZ-07 d Verweis auf einen Anker, den es nicht gibt,
// VZ-07 c Inhaltsverzeichnis-Block im Live-Modus,
// VZ-07 b Rückverweis; VZ-08 seitliche Maustasten; VZ-09 Menü-Klick über den
// Menü-Kanal.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufRendererBereit } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');
const { menuZustand } = require('../helpers/menu-zustand');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');
const {
  PANE,
  GERENDERT,
  EDITOR,
  langesDokument,
  raeumeAuf,
  ansicht,
  reiter,
  obersteGerendert,
  rolleZu,
  nahe,
  bindeBereich,
  oeffneImPanel,
  starteBildMessung,
  bildMessungen,
} = require('../helpers/lese-position');
const {
  makeTempDir,
  removeDir,
  makeBook,
  listFiles,
  settingsPathOf,
  declaredTopLevel,
} = require('../helpers/buch');

const ABSATZ = '.markdown-body p';

function legeBereichAn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-vor-zurueck-'));
  const dateien = {
    'Start.md': langesDokument({
      zusatz: {
        130: '[[Zwei]]',
        132: '[[Drei]]',
        134: '[Nirgendwo](#gibt-es-nicht)',
        300: 'Suchwort',
      },
    }).text,
    'Zwei.md': '# Zwei\n\nWeiter zu [[Drei]].\n\nHier steht die Schreibmarke.\n',
    'Drei.md': '# Drei\n\nEnde des Wegs.\n',
  };
  for (const [name, text] of Object.entries(dateien)) {
    fs.writeFileSync(path.join(dir, name), text, 'utf8');
  }
  return { dir, dateien, pfad: (name) => path.join(dir, `${name}.md`) };
}

// Jede Datei, die es noch gibt, trägt ihren Anfangs-Inhalt.
function pruefeUnveraendert(f) {
  for (const [name, text] of Object.entries(f.dateien)) {
    const p = path.join(f.dir, name);
    if (fs.existsSync(p)) expect(fs.readFileSync(p, 'utf8'), name).toBe(text);
  }
}

async function aktiverTitel(page, pane = 0) {
  return (await page.locator(SEL.pane(pane).activeTab).first().locator('.tab-title').textContent())
    .trim()
    .replace(/\.md$/, '');
}

async function erwarteAktiv(page, name, pane = 0) {
  await expect.poll(() => aktiverTitel(page, pane)).toBe(name);
}

async function folge(page, name, pane = 0) {
  const verweis = page.locator(`${SEL.markdownBody0} a.wikilink`, { hasText: name }).first();
  await expect(verweis).toBeVisible();
  await verweis.click();
  await erwarteAktiv(page, name, pane);
}

// Drückt die Taste mit dem Fokus auf der Lese-Fläche (ohne Klick in den Text).
async function taste(page, kombination) {
  await page.keyboard.press(kombination);
}

async function hinweisText(page) {
  return (await page.locator('#statusbar-hint').textContent()) || '';
}

function menuNav(zustand) {
  const i = zustand.findIndex((e, k) => e.label === 'Zurück' && zustand[k + 1]?.label === 'Vor');
  return i < 0 ? null : { zurueck: zustand[i].enabled, vor: zustand[i + 1].enabled };
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

async function starte(f, settings = {}) {
  const geoeffnet = await launchApp({ settings: { language: 'de', ...settings } });
  await bindeBereich(geoeffnet.page, f.dir);
  return geoeffnet;
}

// Start öffnen und bis Zeile 120 rollen.
async function startBei120(page) {
  await oeffneImPanel(page, 'Start');
  await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
  await rolleZu(page, GERENDERT, ABSATZ, 120);
  expect(await obersteGerendert(page)).toBe(120);
}

async function erwarteStartBei(page, zeile) {
  await erwarteAktiv(page, 'Start');
  await expect
    .poll(() => obersteGerendert(page).then((z) => (nahe(z, zeile) ? zeile : z)))
    .toBe(zeile);
}

test.describe('VZ-01: Verweis, Zurück, Vor, Abschneiden', () => {
  test('Zurück führt an die Ausgangsstelle, Vor zum Ziel; eine neue Navigation schneidet ab', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');

      await starteBildMessung(page);
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      await page.waitForTimeout(500);
      // Kein gezeichnetes Bild zeigt «Start» an einer anderen Stelle.
      const messungen = await bildMessungen(page);
      expect(messungen.length).toBeGreaterThan(0);
      expect(messungen.filter((z) => !nahe(z, 120))).toEqual([]);

      await taste(page, 'Alt+ArrowRight');
      await erwarteAktiv(page, 'Zwei');
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);

      await folge(page, 'Drei');
      const zustand = menuNav(await menuZustand(app, ''));
      expect(zustand).toEqual({ zurueck: true, vor: false });
      await taste(page, 'Alt+ArrowRight');
      await expect.poll(() => hinweisText(page)).toBe('Kein späterer Ort');
      await erwarteAktiv(page, 'Drei');
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('VZ-02: frisches Fenster', () => {
  test('das Kürzel zeigt den Hinweis, die Menü-Einträge sind ausgegraut', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await taste(page, 'Alt+ArrowLeft');
      await expect.poll(() => hinweisText(page)).toBe('Kein früherer Ort');
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: false, vor: false });
      await taste(page, 'Alt+ArrowRight');
      await expect.poll(() => hinweisText(page)).toBe('Kein späterer Ort');
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('VZ-03: geschlossenes Dokument', () => {
  test('Zurück öffnet ein geschlossenes Dokument wieder an seiner Stelle', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      // «Start» über das Schließ-Kreuz seines Reiters schließen, ohne es zu zeigen.
      await reiter(page, 'Start').locator('.tab-close').click();
      await expect(reiter(page, 'Start')).toHaveCount(0);
      await erwarteAktiv(page, 'Zwei');

      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// Story AK1: Der verlassene Ort wird immer eingetragen, auch wenn er nach dem
// Schließen nachgerückt ist. Verlauf danach: Start, Zwei, Start (Zeile 125),
// Drei.
test.describe('VZ-03 b: nachgerücktes Dokument', () => {
  test('nach dem Schließen nachgerückt: Zurück an die Ausgangsstelle, dann das geschlossene', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      await reiter(page, 'Zwei').locator('.tab-close').click();
      await expect(reiter(page, 'Zwei')).toHaveCount(0);
      await erwarteAktiv(page, 'Start');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, ABSATZ, 125);
      expect(await obersteGerendert(page)).toBe(125);
      await folge(page, 'Drei');

      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 125);
      await taste(page, 'Alt+ArrowLeft');
      await erwarteAktiv(page, 'Zwei');
      await expect(reiter(page, 'Zwei')).toHaveCount(1);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('VZ-04: zweite Spalte und zweites Fenster', () => {
  test('Vor holt das Dokument der rechten Spalte dort nach vorn', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await oeffneImPanel(page, 'Zwei');
      await oeffneImPanel(page, 'Start');
      // «Zwei» in die rechte Spalte; die Verschiebung ist kein Besuch.
      await reiter(page, 'Zwei').click();
      await taste(page, 'Control+Alt+ArrowRight');
      await expect(page.locator(SEL.pane(1).tabs)).toHaveCount(1);
      await page.locator(SEL.pane(0).tabs).filter({ hasText: 'Start' }).click();
      await erwarteAktiv(page, 'Start');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, ABSATZ, 120);
      await folge(page, 'Zwei', 1);
      await expect(page.locator(`${SEL.pane(1).paneGroup}.active-pane`)).toHaveCount(1);

      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      await expect(page.locator(`${SEL.pane(0).paneGroup}.active-pane`)).toHaveCount(1);
      await taste(page, 'Alt+ArrowRight');
      await expect(page.locator(`${SEL.pane(1).paneGroup}.active-pane`)).toHaveCount(1);
      await erwarteAktiv(page, 'Zwei', 1);
      await expect(page.locator(SEL.pane(1).tabs)).toHaveCount(1);

      // Ein zweites Fenster hat seinen eigenen, leeren Verlauf.
      const vorher = app.windows().length;
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.webContents.send('menu:newWindow');
      });
      await expect.poll(() => app.windows().length).toBeGreaterThan(vorher);
      const zweites = app.windows()[app.windows().length - 1];
      await zweites.waitForLoadState('domcontentloaded');
      await expect(zweites.locator('#statusbar-hint')).toHaveCount(1);
      await zweites.bringToFront();
      // Gedrückt wird einmal, nachdem das Fenster seine Eingaben angemeldet hat;
      // sein Knopf «Zurück» ist ausgegraut, weil der Verlauf leer ist.
      await warteAufRendererBereit(zweites);
      await expect(zweites.locator(KNOPF_ZURUECK)).toBeDisabled();
      await zweites.keyboard.press('Alt+ArrowLeft');
      await expect.poll(() => hinweisText(zweites)).toBe('Kein früherer Ort');
      await expect(zweites.locator(SEL.tabs0)).toHaveCount(0);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('VZ-05: gelöschtes Dokument', () => {
  test('ein gelöschtes Dokument wird übersprungen und gezählt', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      await folge(page, 'Drei');
      await reiter(page, 'Zwei').locator('.tab-close').click();
      await expect(reiter(page, 'Zwei')).toHaveCount(0);
      fs.rmSync(f.pfad('Zwei'));

      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      await expect
        .poll(() => hinweisText(page))
        .toBe('Einen nicht mehr vorhandenen Ort übersprungen');
      // Der Eintrag ist fort: Vor führt direkt zu «Drei».
      await taste(page, 'Alt+ArrowRight');
      await erwarteAktiv(page, 'Drei');
      expect(fs.existsSync(f.pfad('Zwei'))).toBe(false);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// Schreibmarke des Editors der linken Spalte: Text der Zeile und Spalte.
async function schreibmarke(page) {
  return page.evaluate((sel) => {
    const s = document.getSelection();
    const zeile = document.querySelector(sel);
    if (!s || !s.focusNode || !zeile) return null;
    const el = s.focusNode.nodeType === 1 ? s.focusNode : s.focusNode.parentElement;
    const line = el && el.closest('.cm-line');
    return line ? { text: line.textContent.trim(), offset: s.focusOffset } : null;
  }, `${PANE} .cm-content`);
}

test.describe('VZ-06: Live-Modus', () => {
  test('Alt+Pfeil springt im Live-Bearbeiten, die Schreibmarke im Ziel bleibt', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      // Den Bearbeiten-Modus einschalten, sobald der Live-Editor steht, und
      // zusichern, dass er an ist (Muster LP-04 (f) in lese-position.spec.js).
      const bearbeiten = async () => {
        await ansicht(app, 'live');
        await expect(page.locator(SEL.editorContent0)).toBeVisible();
        await expect(page.locator(`${PANE} .pane-source-editor`)).toHaveClass(/read-only/);
        await page.locator(SEL.btnEdit).click();
        await expect(page.locator(`${PANE} .pane-source-editor`)).not.toHaveClass(/read-only/);
      };
      await oeffneImPanel(page, 'Zwei');
      await bearbeiten();
      await expect(page.locator(`${EDITOR} .cm-line`, { hasText: 'Weiter zu' })).toBeVisible();
      // Schreibmarke an die dritte Stelle der Zeile «Hier steht …» setzen, dann
      // in «Drei» an die Zeile «Ende des Wegs» wechseln.
      await page.locator(`${EDITOR} .cm-line`, { hasText: 'Hier steht' }).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      const vorher = await schreibmarke(page);
      expect(vorher).not.toBeNull();
      await oeffneImPanel(page, 'Drei');
      await erwarteAktiv(page, 'Drei');
      await bearbeiten();
      const ende = page.locator(`${EDITOR} .cm-line`, { hasText: 'Ende des Wegs' });
      await expect(ende).toBeVisible();
      await ende.click();
      await taste(page, 'Alt+ArrowLeft');
      await erwarteAktiv(page, 'Zwei');
      await expect.poll(() => schreibmarke(page)).toEqual(vorher);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// VZ-06, zweiter Teil (Story AK5): An einer fokussierten Kapitel-Zeile des
// Buch-Panels rückt Alt+Pfeil links das Kapitel aus und Alt+Pfeil rechts
// wieder ein; der Verlauf bleibt dabei unberührt. Test-Buch und Bedienweg wie
// in buch.spec.js (BU-05).
const BUCH_ZEILEN = `${PANE} .sidebar-book .book-tree .book-entry-row`;

async function zeigeBuchPanel(page) {
  const btn = page.locator('#btn-book');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-pressed', /^(true|false)$/);
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(page.locator(`${PANE} .sidebar-book`)).toBeVisible();
}

// Drückt die Taste an der fokussierten Kapitel-Zeile, bis die oberste Ebene
// der Begleitdatei `soll` ist. Wiederholen ist folgenlos: Ausrücken auf der
// obersten Ebene und Einrücken ohne vorigen Nachbarn ändern nichts.
async function baumTaste(page, bookDir, pfad, taste, soll) {
  await expect
    .poll(async () => {
      if (JSON.stringify(declaredTopLevel(bookDir)) === JSON.stringify(soll)) return true;
      await page.locator(`${BUCH_ZEILEN}[data-pfad="${pfad}"]`).focus();
      await page.keyboard.press(taste);
      return JSON.stringify(declaredTopLevel(bookDir)) === JSON.stringify(soll);
    })
    .toBe(true);
}

test.describe('VZ-06 b: Buch-Panel', () => {
  test('Alt+Pfeil an einer Kapitel-Zeile rückt aus und ein, der Verlauf bleibt', async () => {
    const parent = makeTempDir();
    const bookDir = makeBook(parent);
    const md = Object.fromEntries(
      listFiles(bookDir)
        .filter((rel) => rel.endsWith('.md'))
        .map((rel) => [rel, fs.readFileSync(path.join(bookDir, rel), 'utf8')]),
    );
    const kapitelVorher = JSON.parse(fs.readFileSync(settingsPathOf(bookDir), 'utf8')).chapters;
    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      const ergebnis = await page.evaluate((dir) => window.api.books.openPath(dir), bookDir);
      expect(ergebnis).toMatchObject({ ok: true });
      await zeigeBuchPanel(page);
      await page.locator(`${BUCH_ZEILEN}[data-pfad="Aufbruch.md"]`).click();
      await erwarteAktiv(page, 'Aufbruch');
      const vorher = menuNav(await menuZustand(app, ''));
      expect(vorher).toEqual({ zurueck: true, vor: false });
      // Der Verlauf bleibt: geprüft an den Knöpfen der Statusleiste. Eine zweite
      // Erfassung des Menüs könnte die erste zurückgeben (der Helfer hält sie
      // im Hauptprozess vor), bevor das Menü neu gebaut ist.
      const erwarteKnoepfeWieVorher = async () => {
        await expect(page.locator(KNOPF_ZURUECK)).toBeEnabled();
        await expect(page.locator(KNOPF_VOR)).toBeDisabled();
      };
      await erwarteKnoepfeWieVorher();

      await baumTaste(page, bookDir, 'Teil2/Heimkehr.md', 'Alt+ArrowLeft', [
        'Aufbruch.md',
        'Teil2/Heimkehr.md',
        'Schluss.md',
      ]);
      await erwarteAktiv(page, 'Aufbruch');
      await erwarteKnoepfeWieVorher();

      await baumTaste(page, bookDir, 'Teil2/Heimkehr.md', 'Alt+ArrowRight', [
        'Aufbruch.md',
        'Schluss.md',
      ]);
      await erwarteAktiv(page, 'Aufbruch');
      await erwarteKnoepfeWieVorher();

      // Unveränderter Inhalt: dieselben Dateien, dieselben Texte, derselbe Baum.
      await expect
        .poll(() => JSON.parse(fs.readFileSync(settingsPathOf(bookDir), 'utf8')).chapters)
        .toEqual(kapitelVorher);
      expect(Object.keys(md).sort()).toEqual(listFiles(bookDir).filter((r) => r.endsWith('.md')));
      for (const [rel, text] of Object.entries(md)) {
        expect(fs.readFileSync(path.join(bookDir, rel), 'utf8'), rel).toBe(text);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(parent);
    }
  });
});

test.describe('VZ-07: Sprünge im Dokument', () => {
  test('Inhaltsverzeichnis legt Einträge an, Weitersuchen und Bildlauf nicht', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      // Das Inhaltsverzeichnis-Panel ist im frischen Profil aus; es wird einmal
      // gezielt eingeschaltet und auf seine Sichtbarkeit gewartet (Regel 20).
      const sektion = page.locator(`${PANE} .sidebar-outline`);
      await expect(sektion).toBeHidden();
      await page.locator('#btn-outline').click();
      await expect(sektion).toBeVisible();
      const panel = page.locator(`${PANE} .outline-tree .outline-entry`, { hasText: 'Kapitel 5' });
      await expect(panel.first()).toBeVisible();
      await panel.first().click();
      await expect.poll(() => obersteGerendert(page).then((z) => z !== null && z > 190)).toBe(true);

      // Gewöhnlicher Bildlauf legt keinen Eintrag an: Zurück führt an Zeile 120.
      await rolleZu(page, GERENDERT, ABSATZ, 230);
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);

      // Weitersuchen in der Suchleiste legt keinen Eintrag an.
      await taste(page, 'Alt+ArrowRight');
      await expect.poll(() => obersteGerendert(page).then((z) => z !== null && z > 190)).toBe(true);
      await page.keyboard.press('Control+f');
      await page.locator('#search-input').fill('Suchwort');
      await page.locator('#search-input').press('Enter');
      await page.locator('#search-input').press('Enter');
      await page.keyboard.press('Escape');
      await page.locator(GERENDERT).click({ position: { x: 5, y: 5 } });
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// VZ-07, Verweis auf einen Anker im selben Dokument, den es nicht gibt: Das ist
// kein Sprung. Er legt keinen Eintrag an, «Zurück» bleibt ausgegraut, und die
// Lese-Ansicht bleibt an ihrer Stelle.
test.describe('VZ-07 d: Anker, den es nicht gibt', () => {
  test('ein Verweis auf einen fehlenden Anker legt keinen Eintrag an', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      const zurueck = page.locator(KNOPF_ZURUECK);
      const vor = page.locator(KNOPF_VOR);
      await expect(zurueck).toBeDisabled();
      await expect(vor).toBeDisabled();

      const verweis = page.locator(`${SEL.markdownBody0} a`, { hasText: 'Nirgendwo' }).first();
      await expect(verweis).toBeVisible();
      await verweis.click();
      // Dem Klick Zeit geben, einen Eintrag anzulegen, wenn er es täte.
      await page.waitForTimeout(500);
      await expect(zurueck).toBeDisabled();
      await expect(vor).toBeDisabled();
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: false, vor: false });
      await erwarteStartBei(page, 120);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// VZ-07, Inhaltsverzeichnis-Block im Live-Modus: Der Klick auf einen Eintrag
// springt im Editor zur Überschrift und legt wie in der Lese-Ansicht einen
// Eintrag an. Bedienweg des Blocks wie in inhaltsverzeichnis-block.spec.js
// (TB-02).
test.describe('VZ-07 c: Inhaltsverzeichnis-Block im Live-Modus', () => {
  test('ein Klick im Verzeichnis legt einen Eintrag an, Zurück führt an die vorige Stelle', async () => {
    const f = legeBereichAn();
    // Ein Absatz vor dem Zaun, damit die Schreibmarke am Dokument-Anfang nicht
    // im Block steht (Muster der Fixture von TB-02).
    const text = ['Einleitung.', '', '```toc', '```', '', langesDokument().text].join('\n');
    fs.writeFileSync(path.join(f.dir, 'Verzeichnis.md'), text, 'utf8');
    f.dateien['Verzeichnis.md'] = text;
    const { app, page, userData } = await starte(f);
    try {
      await oeffneImPanel(page, 'Verzeichnis');
      await erwarteAktiv(page, 'Verzeichnis');
      await ansicht(app, 'live');
      await page.locator(SEL.btnEdit).click();
      const verzeichnis = page.locator(`${EDITOR} .cm-live-block nav.toc-block`);
      const eintrag = verzeichnis.locator('a', { hasText: 'Kapitel 5' });
      await expect(eintrag).toBeVisible({ timeout: 20000 });
      await page.locator(`${EDITOR} .cm-line`, { hasText: 'Zeile 001' }).click();
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: false, vor: false });

      await eintrag.click();
      await expect(
        page.locator(`${EDITOR} .cm-line`, { hasText: /^# Kapitel 5$|^Kapitel 5$/ }).first(),
      ).toBeInViewport();
      await expect(verzeichnis).not.toBeInViewport();
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: true, vor: false });

      await taste(page, 'Alt+ArrowLeft');
      await expect(verzeichnis).toBeInViewport();
      await erwarteAktiv(page, 'Verzeichnis');
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: false, vor: true });
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// VZ-07, Rückverweis: Ein Klick auf eine Zeile im Rückverweis-Panel wechselt in
// die verweisende, noch geschlossene Datei; geprüft wird dieser Dokument-Wechsel
// und dass «Zurück» danach an die vorige Stelle führt. Einen Sprung innerhalb
// des gezeigten Dokuments gibt es über das Panel in einer Spalte nicht: Es nennt
// keine Verweise eines Dokuments auf sich selbst (`src/main/index/resolve.js`).
// Bedienweg des Panels wie in diagramme-verweise.spec.js (DV-02).
test.describe('VZ-07 b: Rückverweis', () => {
  test('ein Klick im Rückverweis-Panel wechselt in die verweisende Datei, Zurück führt an die vorige Stelle', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      await page.locator('#btn-backlinks').click();
      const treffer = page.locator(`${PANE} .sidebar-backlinks .backlinks-hit`).first();
      await expect(treffer).toBeVisible({ timeout: 20000 });
      await treffer.click();
      await erwarteAktiv(page, 'Start');
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: true, vor: false });

      await taste(page, 'Alt+ArrowLeft');
      await erwarteAktiv(page, 'Zwei');
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  // Sprung innerhalb des gezeigten Dokuments über zwei Spalten: «Start» steht
  // links an Zeile 200, rechts ist «Zwei» aktiv, und sein Panel nennt die
  // Zeile 130 von «Start». Am Lauf gemessen (2026-11-13): Der Klick setzt
  // «Start» an Zeile 130 und macht die linke Spalte aktiv, ohne einen Reiter
  // zu wechseln; das erste «Zurück» führt an Zeile 200, das zweite in die
  // rechte Spalte zu «Zwei».
  test('ein Klick springt im gezeigten Dokument der anderen Spalte; Zurück führt an die vorige Zeile', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await oeffneImPanel(page, 'Zwei');
      await oeffneImPanel(page, 'Start');
      await reiter(page, 'Zwei').click();
      await taste(page, 'Control+Alt+ArrowRight');
      await expect(page.locator(SEL.pane(1).tabs)).toHaveCount(1);
      await page.locator(SEL.pane(0).tabs).filter({ hasText: 'Start' }).click();
      await erwarteAktiv(page, 'Start');
      await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
      await rolleZu(page, GERENDERT, ABSATZ, 200);
      await page.locator(SEL.pane(1).markdownBody).click();
      await expect(page.locator(`${SEL.pane(1).paneGroup}.active-pane`)).toHaveCount(1);
      await page.locator('#btn-backlinks').click();
      const treffer = page
        .locator('.pane-group[data-pane="1"] .sidebar-backlinks .backlinks-hit')
        .first();
      await expect(treffer).toBeVisible({ timeout: 20000 });
      await treffer.click();
      await expect(page.locator(`${SEL.pane(0).paneGroup}.active-pane`)).toHaveCount(1);
      await erwarteStartBei(page, 130);
      // Kein Reiter gewechselt, keiner hinzugekommen.
      await expect(page.locator(SEL.pane(0).tabs)).toHaveCount(1);
      await expect(page.locator(SEL.pane(1).tabs)).toHaveCount(1);
      await erwarteAktiv(page, 'Zwei', 1);

      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 200);
      await expect(page.locator(`${SEL.pane(0).paneGroup}.active-pane`)).toHaveCount(1);
      await taste(page, 'Alt+ArrowLeft');
      await expect(page.locator(`${SEL.pane(1).paneGroup}.active-pane`)).toHaveCount(1);
      await erwarteAktiv(page, 'Zwei', 1);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('VZ-08: seitliche Maustasten', () => {
  test('die Taste «zurück» führt zurück, die Taste «vor» wieder vor', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      // Die Prüf-Bibliothek kennt die beiden Tasten nicht; gedrückt wird über
      // die Fernsteuer-Schnittstelle des Anzeige-Prozesses.
      const cdp = await page.context().newCDPSession(page);
      const druecke = async (button) => {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', {
            type,
            x: 400,
            y: 300,
            button,
            clickCount: 1,
          });
        }
      };
      await druecke('back');
      await erwarteStartBei(page, 120);
      await druecke('forward');
      await erwarteAktiv(page, 'Zwei');
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

test.describe('VZ-09: Menü-Klick', () => {
  test('Ansicht → Zurück und Vor über den Menü-Kanal', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: true, vor: false });
      await sendeMenue(app, 'menu:navBack');
      await erwarteStartBei(page, 120);
      expect(menuNav(await menuZustand(app, ''))).toEqual({ zurueck: false, vor: true });
      await sendeMenue(app, 'menu:navForward');
      await erwarteAktiv(page, 'Zwei');
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// --- Schritt 7: die Knöpfe «Zurück» und «Vor» der Statusleiste -------------------

const KNOPF_ZURUECK = '#btn-nav-back';
const KNOPF_VOR = '#btn-nav-forward';
const EINSTELLUNGEN = '.pane-group[data-pane="0"] .pane-system .settings-page';
const NAV_STATUSLEISTE = `${EINSTELLUNGEN} .settings-nav-group[data-nav-group="general"] .settings-nav-entry[data-section-id="statusbar"]`;

test.describe('VZ-02 b: Knöpfe der Statusleiste', () => {
  test('ausgegraut ohne Schritt; ein Klick führt zurück und wieder vor', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      const zurueck = page.locator(KNOPF_ZURUECK);
      const vor = page.locator(KNOPF_VOR);
      await expect(zurueck).toBeVisible();
      await expect(vor).toBeVisible();
      await expect(zurueck).toBeDisabled();
      await expect(vor).toBeDisabled();
      await expect(zurueck).toHaveAttribute('title', 'Zurück (Alt+Pfeil links)');
      await expect(vor).toHaveAttribute('title', 'Vor (Alt+Pfeil rechts)');

      await startBei120(page);
      await folge(page, 'Zwei');
      await expect(zurueck).toBeEnabled();
      await expect(vor).toBeDisabled();
      await zurueck.click();
      await erwarteStartBei(page, 120);
      await expect(vor).toBeEnabled();
      await expect(zurueck).toBeDisabled();
      await vor.click();
      await erwarteAktiv(page, 'Zwei');
      await expect(vor).toBeDisabled();
      await expect(zurueck).toBeEnabled();
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// Schaltet die Zeile `key` der Ausblend-Liste im Einstellungs-Abschnitt
// «Statusleiste» (Bedienweg aus statusleisten-einstellungen.spec.js, SB-01).
async function setzeKnopfSichtbar(page, key, sichtbar) {
  await oeffneEinstellungsSeite(page);
  await expect(page.locator(`${EINSTELLUNGEN} .settings-section-heading`)).toBeVisible();
  await page.locator(NAV_STATUSLEISTE).click();
  const kasten = page.locator(
    `${EINSTELLUNGEN} .command-placement-hide-row[data-hide-key="${key}"] input`,
  );
  if (sichtbar) await kasten.check();
  else await kasten.uncheck();
  await page.locator('#btn-settings-apply').click();
  await expect(page.locator('#btn-settings-apply')).toBeDisabled();
}

test.describe('VZ-02 c: Knopf ausblenden', () => {
  test('der Knopf «Zurück» lässt sich aus- und einblenden, das Kürzel wirkt weiter', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await startBei120(page);
      await folge(page, 'Zwei');
      await setzeKnopfSichtbar(page, 'nav:back', false);
      await expect(page.locator(KNOPF_ZURUECK)).toBeHidden();
      await expect(page.locator(KNOPF_VOR)).toBeVisible();

      // Die Einstellungs-Seite war ein Ort; das Kürzel führt von dort zurück.
      await taste(page, 'Alt+ArrowLeft');
      await erwarteAktiv(page, 'Zwei');
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);

      // Ausgangszustand der Einstellung wiederherstellen.
      await setzeKnopfSichtbar(page, 'nav:back', true);
      await expect(page.locator(KNOPF_ZURUECK)).toBeVisible();
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});

// Links «Start» (bis Zeile 120 gerollt) als erster und aktueller Ort, rechts
// «Drei» gezeigt und «Zwei» verdeckt. Verlauf dabei Start, Drei, Zwei; zweimal
// «Zurück» (Drei ist rechts schon vorn, dann Start) stellt den Zeiger auf
// «Start», und der nächste Besuch schneidet Drei und Zwei ab.
async function zweiSpaltenMitVerdecktem(page) {
  await oeffneImPanel(page, 'Start');
  await expect(page.locator(GERENDERT)).toContainText('Zeile 001');
  await rolleZu(page, GERENDERT, ABSATZ, 120);
  await oeffneImPanel(page, 'Drei');
  await oeffneImPanel(page, 'Zwei');
  // «Zwei» nach rechts; links rückt «Drei» nach, die rechte Spalte wird aktiv.
  await taste(page, 'Control+Alt+ArrowRight');
  await expect(page.locator(SEL.pane(1).tabs)).toHaveCount(1);
  await erwarteAktiv(page, 'Drei', 0);
  // Linke Spalte fokussieren, ohne einen Reiter zu wechseln.
  await page.locator(SEL.markdownBody0).click();
  await expect(page.locator(`${SEL.pane(0).paneGroup}.active-pane`)).toHaveCount(1);
  await taste(page, 'Control+Alt+ArrowRight');
  await expect(page.locator(SEL.pane(1).tabs)).toHaveCount(2);
  await erwarteAktiv(page, 'Drei', 1);
  await erwarteAktiv(page, 'Start', 0);
  await taste(page, 'Alt+ArrowLeft');
  await taste(page, 'Alt+ArrowLeft');
  await erwarteStartBei(page, 120);
  await expect(page.locator(`${SEL.pane(0).paneGroup}.active-pane`)).toHaveCount(1);
  await erwarteAktiv(page, 'Drei', 1);
}

test.describe('VZ-04 b: verdecktes Dokument der anderen Spalte', () => {
  test('ein Verweis holt es nach vorn; Zurück führt nach «Start», nicht nach «Drei»', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await zweiSpaltenMitVerdecktem(page);
      await folge(page, 'Zwei', 1);
      await expect(page.locator(`${SEL.pane(1).paneGroup}.active-pane`)).toHaveCount(1);
      await expect(page.locator(KNOPF_ZURUECK)).toBeEnabled();

      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      await expect(page.locator(`${SEL.pane(0).paneGroup}.active-pane`)).toHaveCount(1);
      // «Drei» war bis zum Verweis rechts gezeigt, aber kein Ort des Anwenders.
      await expect(page.locator(KNOPF_ZURUECK)).toBeDisabled();
      await taste(page, 'Alt+ArrowLeft');
      await expect.poll(() => hinweisText(page)).toBe('Kein früherer Ort');
      await erwarteAktiv(page, 'Zwei', 1);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });

  test('wechselt der Anwender zuerst in die rechte Spalte, führt Zurück nach «Drei»', async () => {
    const f = legeBereichAn();
    const { app, page, userData } = await starte(f);
    try {
      await zweiSpaltenMitVerdecktem(page);
      await page.locator(SEL.pane(1).markdownBody).click();
      await expect(page.locator(`${SEL.pane(1).paneGroup}.active-pane`)).toHaveCount(1);
      await page.locator(SEL.pane(1).tabs).filter({ hasText: 'Zwei' }).click();
      await erwarteAktiv(page, 'Zwei', 1);

      await taste(page, 'Alt+ArrowLeft');
      await erwarteAktiv(page, 'Drei', 1);
      await taste(page, 'Alt+ArrowLeft');
      await erwarteStartBei(page, 120);
      pruefeUnveraendert(f);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(f.dir);
    }
  });
});
