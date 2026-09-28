// 4T-001713 (Epic 3E-000300): Die Vorschlagsliste in der Tabellenzelle der
// Live-Ansicht — gemessen an der angezeigten Liste und am Quelltext.
//
// Warum auf dieser Ebene: Einträge, Reihenfolge und eingefügter Text sind im
// Unit-Fall gegen die unveränderten Quellen geprüft
// (`test/unit/renderer/live-tabellen-vorschlaege.test.js`). Was nur die
// laufende Anwendung zeigt, steht hier: dass die Liste am Eingabefeld der Zelle
// überhaupt erscheint, dass sie dieselben Einträge zeigt wie die Liste des
// Editors an derselben Stelle im Fließtext, dass ihre Tasten Vorrang vor der
// Zell-Bedienung haben, solange sie offen ist, und keinen, sobald sie zu ist,
// und dass die Tabelle sie nicht abschneidet.
//
// Die Liste in der Zelle trägt die Klassen der Editor-Liste und zusätzlich
// `cm-live-tabelle-vorschlaege`; so unterscheidet der Prüffall sie von der
// Liste des Editors, ohne eine eigene Darstellung vorauszusetzen.
//
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json
// (F-040 Vorschlagsliste, F-277 Tabellen-Bearbeitung in der Live-Ansicht).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const ZELL_LISTE = '.cm-live-tabelle-vorschlaege';
const ZELL_LABEL = `${ZELL_LISTE} .cm-completionLabel`;
const EDITOR_LISTE = '.cm-tooltip-autocomplete:not(.cm-live-tabelle-vorschlaege)';
const EDITOR_LABEL = `${EDITOR_LISTE} .cm-completionLabel`;

const TABELLEN = [
  '# Tabellen',
  '',
  'Absatz vor der Tabelle.',
  '',
  '| Seite | Schlagwort | Notiz |',
  '| --- | --- | --- |',
  '| a1 | b1 | c1 |',
  '| a2 | b2 | c2 |',
  '',
  'Fliesstext unter der Tabelle.',
  '',
  '- [ ] Aufgabe ausserhalb',
  '',
  'Letzte Zeile.',
  '',
].join('\n');

// Vier Ziele mit gegenläufiger Alphabet- und Zeit-Folge (Muster VV-01): Wer
// nach Namen ordnet, bekommt Alpha zuerst, wer nach Änderungszeit ordnet,
// Delta. Die Schlagworte stehen in denselben Dateien, eines häufig, eines
// selten, alphabetisch umgekehrt.
const ZIELE_ALT_NACH_NEU = ['Alpha', 'Beta', 'Gamma', 'Delta'];

function setzeZeit(datei, tagVersatz) {
  const zeit = new Date(Date.UTC(2020, 0, 1 + tagVersatz, 12, 0, 0));
  fs.utimesSync(datei, zeit, zeit);
}

function baueBereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-zell-vorschlaege-'));
  const tabellen = path.join(dir, 'Tabellen.md');
  fs.writeFileSync(tabellen, TABELLEN, 'utf8');
  setzeZeit(tabellen, 0);
  ZIELE_ALT_NACH_NEU.forEach((name, i) => {
    const datei = path.join(dir, `${name}.md`);
    const selten = name === 'Alpha' ? ' #bau-aaa' : '';
    fs.writeFileSync(datei, `# ${name}\n\nText #bau-zzz${selten} dazu.\n`, 'utf8');
    setzeZeit(datei, i + 1);
  });
  return { dir, tabellen };
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function liveBearbeiten(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

const tabelle = (page) => page.locator(`${SEL.editorContent0} .cm-live-block table`).first();
const zelle = (page, zeile, spalte) =>
  tabelle(page).locator('tbody tr').nth(zeile).locator('td').nth(spalte);
const eingabe = (page) => page.locator('.cm-live-tabelle-eingabe');
const zeileMit = (page, text) =>
  page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: text }).first();

async function quelltext(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    return tile && tile.view ? tile.view.state.doc.toString() : null;
  }, SEL.editorContent0);
}

// Der erste Aufruf stößt den Index-Aufbau an und liefert noch keine
// Vorschläge (B-18, 4T-000187). Aufgewärmt wird in der letzten Zeile des
// Fließtexts, für Verweise und Schlagworte; danach ist die Zeile wieder leer.
async function waermeIndexAuf(page) {
  const liste = page.locator(EDITOR_LISTE);
  await zeileMit(page, 'Letzte Zeile.').click();
  await page.keyboard.press('End');
  for (const [anfang, zeichen] of [
    ['[[', 'A'],
    ['#', 'b'],
  ]) {
    await page.keyboard.type(`\n${anfang}${zeichen}`);
    await expect
      .poll(
        async () => {
          if (await liste.first().isVisible()) return true;
          await page.keyboard.press('Backspace');
          await page.keyboard.type(zeichen);
          return liste.first().isVisible();
        },
        { timeout: 30000, intervals: [400] },
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(liste.first()).toBeHidden();
  }
}

// Zelle öffnen und die Schreibmarke ans Ende ihres Textes setzen.
async function oeffneZelle(page, zeile, spalte) {
  await zelle(page, zeile, spalte).click();
  await expect(eingabe(page)).toBeVisible();
  await page.keyboard.press('End');
}

// Wartet, bis die Quellen der Zell-Liste geantwortet haben. Das Feld ist
// währenddessen als beschäftigt ausgewiesen; erst danach sagt eine fehlende
// Liste etwas aus.
async function quellenBeantwortet(page) {
  await expect(eingabe(page)).not.toHaveAttribute('aria-busy', 'true');
}

// Tippt am Ende einer Fließtext-Zeile und liest die Liste des Editors.
async function editorListeNach(page, zeilenText, getippt) {
  await zeileMit(page, zeilenText).click();
  await page.keyboard.press('End');
  await page.keyboard.type(getippt);
  await expect(page.locator(EDITOR_LISTE).first()).toBeVisible({ timeout: 10000 });
  return await page.locator(EDITOR_LABEL).allTextContents();
}

test.describe('TV-01: Verweis-Vorschlaege in der Zelle (F-040, F-277)', () => {
  test('nach [[ dieselben Ziele in derselben Reihenfolge wie im Fliesstext (AK1, AK4, AK9)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);

      await oeffneZelle(page, 0, 1);
      await page.keyboard.type(' [[');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      const inZelle = await page.locator(ZELL_LABEL).allTextContents();
      expect(inZelle.slice(0, 4)).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);
      // Die Liste des Editors ist dabei nicht offen; es ist die eine der Zelle.
      await expect(page.locator(EDITOR_LISTE)).toHaveCount(0);

      // Escape schliesst nur die Liste; die Zelle bleibt mit dem Text offen.
      await page.keyboard.press('Escape');
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      await expect(eingabe(page)).toBeVisible();
      await expect(eingabe(page)).toHaveValue('b1 [[');
      // Das zweite Escape verwirft die Zell-Eingabe wie bisher.
      await page.keyboard.press('Escape');
      await expect(eingabe(page)).toHaveCount(0);

      const imText = await editorListeNach(page, 'Fliesstext unter der Tabelle.', ' [[');
      expect(inZelle).toEqual(imText);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-02: Schlagwort-Vorschlaege in der leeren Zelle (F-040, F-277)', () => {
  test('nach # dieselbe Haeufigkeits-Folge wie im Fliesstext (AK2, AK4, AK14)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);

      await oeffneZelle(page, 1, 1);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await expect(eingabe(page)).toHaveValue('');
      await page.keyboard.type('#bau');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      const inZelle = await page.locator(ZELL_LABEL).allTextContents();
      expect(inZelle).toEqual(['bau-zzz', 'bau-aaa']);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(eingabe(page)).toHaveCount(0);

      const imText = await editorListeNach(page, 'Fliesstext unter der Tabelle.', ' #bau');
      expect(inZelle).toEqual(imText);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-03: Tastatur und Uebernahme (F-040, F-277)', () => {
  test('Pfeile waehlen in der Liste, Eingabetaste uebernimmt denselben Verweis (AK5, AK7)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);

      await oeffneZelle(page, 0, 0);
      await page.keyboard.type(' [[');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      const eintrag = (i) => page.locator(`${ZELL_LISTE} li`).nth(i);
      await expect(eintrag(0)).toHaveAttribute('aria-selected', 'true');
      // Pfeil runter bewegt die Auswahl, nicht die Schreibmarke in die Zelle darunter.
      await page.keyboard.press('ArrowDown');
      await expect(eintrag(1)).toHaveAttribute('aria-selected', 'true');
      await expect(eingabe(page)).toHaveValue('a1 [[');
      await expect(zelle(page, 0, 0).locator('.cm-live-tabelle-eingabe')).toHaveCount(1);
      // Pfeil hoch vom ersten Eintrag laeuft ans Ende um, wie im Editor.
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      const anzahl = await page.locator(`${ZELL_LISTE} li`).count();
      await expect(eintrag(anzahl - 1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect(eintrag(1)).toHaveAttribute('aria-selected', 'true');

      await page.keyboard.press('Enter');
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      await expect(eingabe(page)).toHaveValue('a1 [[Gamma]]');
      // Die Schreibmarke steht hinter den Klammern, weitergetippt wird dahinter.
      await page.keyboard.type('!');
      await expect(eingabe(page)).toHaveValue('a1 [[Gamma]]!');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Enter');
      await expect(eingabe(page)).toHaveCount(0);

      expect(await quelltext(page)).toContain('| a1 [[Gamma]] | b1 | c1 |');
      await expect(zelle(page, 0, 0).locator('a.wikilink')).toHaveText('Gamma');

      // Gegenprobe im Fliesstext: derselbe Handgriff ergibt denselben Text.
      await editorListeNach(page, 'Fliesstext unter der Tabelle.', ' [[');
      // Die Bibliothek weist Auswahl und Uebernahme in den ersten 75 ms nach
      // dem Oeffnen ab (Muster VV-01); ein Mensch ist nie so schnell.
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      expect(await quelltext(page)).toContain('Fliesstext unter der Tabelle. [[Gamma]]');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-04: Eingabetaste in der letzten Zelle (F-277)', () => {
  test('bei offener Liste keine neue Zeile, bei geschlossener legt der Tabulator sie an (AK8, AK10)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);

      await oeffneZelle(page, 1, 2);
      await page.keyboard.type(' [[');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Enter');
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      await expect(eingabe(page)).toHaveValue('c2 [[Delta]]');
      await expect(tabelle(page).locator('tbody tr')).toHaveCount(2);

      // Die Liste ist zu: Der Tabulator wirkt wie immer und legt die Zeile an.
      await page.keyboard.press('Tab');
      await expect(tabelle(page).locator('tbody tr')).toHaveCount(3);
      const text = await quelltext(page);
      expect(text).toContain('| a2 | b2 | c2 [[Delta]] |');
      expect(text).toContain('| | | |');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-05: Zelle verlassen bei offener Liste (F-277)', () => {
  test('Tabulator und Klick nach aussen schliessen die Liste und uebernehmen (Story AK12)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);

      await oeffneZelle(page, 1, 0);
      // Erst das Schlagwort: Ein offenes `[[` weiter links in derselben Zeile
      // schaltete die Schlagwort-Quelle ab — in der Zelle wie im Quelltext.
      await page.keyboard.type(' #bau');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Tab');
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      // Der Sprung in die Nachbarzelle findet statt, die Eingabe ist uebernommen.
      await expect(zelle(page, 1, 1).locator('.cm-live-tabelle-eingabe')).toHaveCount(1);
      expect(await quelltext(page)).toContain('| a2 #bau | b2 | c2 |');

      await page.keyboard.press('End');
      await page.keyboard.type(' [[Be');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      await zeileMit(page, 'Letzte Zeile.').click();
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      await expect(eingabe(page)).toHaveCount(0);
      await expect.poll(() => quelltext(page)).toContain('| a2 #bau | b2 [[Be | c2 |');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-06: Keine Aufgaben-Marker in der Zelle (F-040)', () => {
  test('ausdruecklich geoeffnet erscheint in der Zelle nichts, wie im Quelltext (AK3)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);

      // Gegenprobe zuerst: Auf der Aufgabenzeile oeffnet Strg+Leertaste die
      // Marker-Liste, der Weg ist also frei.
      await zeileMit(page, 'Aufgabe ausserhalb').click();
      await page.keyboard.press('End');
      await page.keyboard.type(' p');
      await page.keyboard.press('Control+Space');
      await expect(page.locator(EDITOR_LISTE)).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await expect(page.locator(EDITOR_LISTE)).toHaveCount(0);

      await oeffneZelle(page, 0, 2);
      await page.keyboard.type(' p');
      await quellenBeantwortet(page);
      await page.keyboard.press('Control+Space');
      await quellenBeantwortet(page);
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(eingabe(page)).toHaveCount(0);

      // Dieselbe Tabellenzeile im Quelltext: auch dort keine Marker-Liste.
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await zeileMit(page, '| a1 | b1 | c1 |').click();
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.type(' p');
      await page.keyboard.press('Control+Space');
      await expect(page.locator(EDITOR_LISTE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-07: Die Liste ist an der Zelle ganz zu sehen (F-277)', () => {
  test('letzte Zeile, letzte Spalte: nicht vom Tabellen-Widget abgeschnitten (AK13)', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);

      await oeffneZelle(page, 1, 2);
      await page.keyboard.type(' [[');
      await expect(page.locator(ZELL_LISTE)).toBeVisible({ timeout: 10000 });
      const lage = await page.locator(ZELL_LISTE).evaluate((liste) => {
        const r = liste.getBoundingClientRect();
        const tabelleR = document
          .querySelector('.cm-live-tabelle-eingabe')
          .closest('table')
          .getBoundingClientRect();
        const mitte = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const unten = document.elementFromPoint(r.left + 8, r.bottom - 4);
        return {
          imWidget: !!liste.closest('.cm-live-block'),
          imEditor: !!liste.closest('.cm-editor'),
          imFenster:
            r.left >= 0 &&
            r.top >= 0 &&
            r.right <= document.documentElement.clientWidth &&
            r.bottom <= document.documentElement.clientHeight,
          ueberTabelleHinaus: r.bottom > tabelleR.bottom,
          mitteSichtbar: !!mitte && liste.contains(mitte),
          untenSichtbar: !!unten && liste.contains(unten),
        };
      });
      expect(lage).toEqual({
        imWidget: false,
        imEditor: true,
        imFenster: true,
        ueberTabelleHinaus: true,
        mitteSichtbar: true,
        untenSichtbar: true,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('TV-08: Aus-Zustand der Vervollstaendigung (F-040)', () => {
  test('ohne die Erweiterung erscheint in der Zelle keine Liste', async () => {
    const { dir, tabellen } = baueBereich();
    const { app, page, userData } = await launchApp({ args: [tabellen] });
    try {
      await liveBearbeiten(app, page);
      await waermeIndexAuf(page);
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['autocomplete']));

      await oeffneZelle(page, 0, 1);
      await page.keyboard.type(' [[');
      await quellenBeantwortet(page);
      await page.keyboard.press('Control+Space');
      await quellenBeantwortet(page);
      await expect(page.locator(ZELL_LISTE)).toHaveCount(0);
      await expect(eingabe(page)).toHaveValue('b1 [[');
    } finally {
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
