// 4T-000590/4T-000591 (Epic 3E-000109): E2E-Suite für das Tabellen-Kontextmenü.
// TK-01: Untermenü „Tabelle" erscheint nur mit Cursor in einer Tabelle,
// listet alle zwölf Operationen und dimmt geschützte Ziele und Ränder;
// TK-02: Zeile verschieben wirkt auf den Editor-Inhalt, ein einzelner
// Undo-Schritt stellt den Original-Text exakt wieder her; TK-03: Spalten-
// Ausrichtung schreibt die Trenn-Zeile um und zeigt das Häkchen der
// Ist-Ausrichtung; TK-04: deaktivierte Erweiterung table-tools blendet das
// Untermenü aus; TK-05: Kommando-Palette führt Tabellen-Operationen aus
// und dimmt sie außerhalb von Tabellen; TK-06: dasselbe Untermenü wirkt im
// perspective-table-Fence (Zeile verschieben, Ein-Schritt-Undo); TK-07:
// Spalten-Operationen werden bei colspan mit Statusbar-Hinweis abgelehnt;
// TK-08: Spalte einfügen setzt in einer Kopfzeile eine Kopfzelle (4T-002093);
// TK-09/TK-10: Spalte einfügen in der Live-Ansicht, Abstecher nach Gerendert
// und zurück, danach nimmt ein Strg+Z die Operation zurück, ohne und mit
// Zeitstempel-Erweiterung beim automatischen Speichern (4T-002121).
// Die Operations-Semantik selbst ist unit-getestet
// (test/unit/table-edit.test.js, test/unit/perspective-table-edit.test.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'tabellen-kontextmenue.md',
);

const MENU = '#context-menu';
const item = (id) => `${MENU} [data-menu-id="${id}"]`;
const PALETTE_MODAL = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';

const OP_IDS = [
  'table-align-left',
  'table-align-center',
  'table-align-right',
  'table-row-up',
  'table-row-down',
  'table-row-insert',
  'table-row-delete',
  'table-col-left',
  'table-col-right',
  'table-col-insert',
  'table-col-delete',
  'table-transpose',
];

function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-tabellenmenue-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

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

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Rechtsklick auf eine Editor-Zeile (x:4 setzt den Cursor an den
// Zeilenanfang, also in die erste Spalte) und Untermenü „Tabelle" öffnen.
async function openTableSubmenu(page, lineText) {
  const editor = page.locator(SEL.editorContent0);
  const line = editor.locator('.cm-line', { hasText: lineText });
  await line.click({ button: 'right', position: { x: 4, y: 4 } });
  await expect(page.locator(MENU)).toBeVisible();
  await page.locator(item('table')).hover();
  await expect(page.locator(item('table-transpose'))).toBeVisible();
}

async function editorLines(page) {
  return page.locator(SEL.editorContent0).locator('.cm-line').allTextContents();
}

test.describe('TK-01: Untermenü „Tabelle" nur in Tabellen, mit Kontext-Dimmung (F-142)', () => {
  test('in der Tabelle alle zwölf Operationen, außerhalb keine Sektion', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      // Außerhalb der Tabelle: Menü ohne Tabellen-Sektion.
      const editor = page.locator(SEL.editorContent0);
      await editor
        .locator('.cm-line', { hasText: 'Ein Absatz ohne Tabelle.' })
        .click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
      await expect(page.locator(item('table'))).toHaveCount(0);
      await page.keyboard.press('Escape');

      // In der ersten Datenzeile: alle zwölf Einträge, Ränder gedimmt.
      await openTableSubmenu(page, 'a1');
      for (const id of OP_IDS) {
        await expect(page.locator(item(id))).toHaveCount(1);
      }
      // Erste Datenzeile: nach oben gedimmt, nach unten aktiv; erste
      // Spalte: nach links gedimmt.
      await expect(page.locator(item('table-row-up'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-row-down'))).not.toHaveClass(/disabled/);
      await expect(page.locator(item('table-col-left'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-col-right'))).not.toHaveClass(/disabled/);
      await page.keyboard.press('Escape');

      // Kopfzeile: Zeilen-Verschieben und -Löschen gedimmt, Einfügen aktiv.
      await openTableSubmenu(page, '| A | B');
      await expect(page.locator(item('table-row-up'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-row-delete'))).toHaveClass(/disabled/);
      await expect(page.locator(item('table-row-insert'))).not.toHaveClass(/disabled/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-02: Zeile verschieben mit Ein-Schritt-Undo (F-142)', () => {
  test('Zeile nach oben tauscht die Datenzeilen, Strg+Z stellt exakt wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      await openTableSubmenu(page, 'a2');
      await page.locator(item('table-row-up')).click();
      let lines = await editorLines(page);
      const idxA2 = lines.findIndex((l) => l.includes('a2'));
      const idxA1 = lines.findIndex((l) => l.includes('a1'));
      expect(idxA2).toBeGreaterThan(-1);
      expect(idxA2).toBeLessThan(idxA1);

      // Ein einzelner Undo-Schritt stellt den unformatierten Original-Text
      // wieder her (die Operation war eine Transaktion).
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      lines = await editorLines(page);
      expect(lines).toContain('| a1 | b1 | c1 |');
      expect(lines).toContain('| a2 | b2 | c2 |');
      expect(lines.findIndex((l) => l.includes('a1'))).toBeLessThan(
        lines.findIndex((l) => l.includes('a2')),
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-03: Spalten-Ausrichtung mit Häkchen (F-142)', () => {
  test('Rechtsbündig schreibt die Trenn-Zeile um und zeigt das Häkchen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      await openTableSubmenu(page, 'a1');
      await page.locator(item('table-align-right')).click();
      const lines = await editorLines(page);
      const sep = lines.find((l) => l.includes('--:'));
      expect(sep).toBeTruthy();
      expect(sep.indexOf('--:')).toBeLessThan(sep.indexOf('---'));

      // Erneut geöffnet zeigt der Eintrag die Ist-Ausrichtung als Häkchen.
      await openTableSubmenu(page, 'a1');
      await expect(page.locator(item('table-align-right'))).toHaveClass(
        /context-menu-item-checked/,
      );
      await expect(page.locator(item('table-align-left'))).not.toHaveClass(
        /context-menu-item-checked/,
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-04: Erweiterung table-tools aus blendet das Untermenü aus (F-142)', () => {
  test('mit deaktivierter Erweiterung fehlt die Tabellen-Sektion', async () => {
    const userDataSeed = seedProfile({ extensions: { disabled: ['table-tools'] } });
    const { app, page, userData } = await launchApp({
      args: [FIXTURE],
      userData: userDataSeed,
    });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);
      await editor
        .locator('.cm-line', { hasText: 'a1' })
        .click({ button: 'right', position: { x: 4, y: 4 } });
      await expect(page.locator(MENU)).toBeVisible();
      await expect(page.locator(item('copy'))).toBeVisible();
      await expect(page.locator(item('table'))).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-05: Kommando-Palette führt Tabellen-Operationen aus und dimmt außerhalb (F-142)', () => {
  test('Transponieren über die Palette wirkt; außerhalb der Tabelle gedimmt', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const editor = page.locator(SEL.editorContent0);

      // Cursor in die Tabelle, Palette öffnen, Transponieren ausführen.
      await editor.locator('.cm-line', { hasText: 'a1' }).click({ position: { x: 4, y: 4 } });
      await expect
        .poll(async () => {
          if (await page.locator(PALETTE_MODAL).isVisible()) return true;
          await page.keyboard.press('Control+k');
          return page.locator(PALETTE_MODAL).isVisible();
        })
        .toBe(true);
      await page.locator(PALETTE_FILTER).fill('transponieren');
      await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
      await expect(page.locator(PALETTE_ITEM).first()).not.toHaveClass(/unavailable/);
      await page.keyboard.press('Enter');
      await expect(page.locator(PALETTE_MODAL)).toBeHidden();
      const lines = await editorLines(page);
      expect(lines.some((l) => l.includes('a1') && l.includes('a2'))).toBe(true);

      // Cursor außerhalb der Tabelle: derselbe Eintrag ist gedimmt.
      await editor
        .locator('.cm-line', { hasText: 'Text danach.' })
        .click({ position: { x: 4, y: 4 } });
      await expect
        .poll(async () => {
          if (await page.locator(PALETTE_MODAL).isVisible()) return true;
          await page.keyboard.press('Control+k');
          return page.locator(PALETTE_MODAL).isVisible();
        })
        .toBe(true);
      await page.locator(PALETTE_FILTER).fill('transponieren');
      await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
      await expect(page.locator(PALETTE_ITEM).first()).toHaveClass(/unavailable/);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-06: Untermenü und Zeilen-Operationen im perspective-table-Fence (F-142)', () => {
  test('Zeile nach oben verschiebt den |-Abschnitt, Strg+Z stellt wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      await openTableSubmenu(page, 'p1b');
      await page.locator(item('table-row-up')).click();
      let lines = await editorLines(page);
      expect(lines.findIndex((l) => l.includes('p1b'))).toBeLessThan(
        lines.findIndex((l) => l.includes('p1a')),
      );

      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      lines = await editorLines(page);
      expect(lines.findIndex((l) => l.includes('p1a'))).toBeLessThan(
        lines.findIndex((l) => l.includes('p1b')),
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('TK-07: Span-Ablehnung mit Statusbar-Hinweis (F-142)', () => {
  test('Spalten-Operation bei colspan ändert nichts und zeigt den Hinweis', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);

      const before = await editorLines(page);
      await openTableSubmenu(page, 's1');
      await page.locator(item('table-col-right')).click();
      const hint = page.locator('#statusbar-hint');
      await expect(hint).toHaveClass(/visible/);
      await expect(hint).toContainText('colspan');
      expect(await editorLines(page)).toEqual(before);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// TK-08 (4T-002093, Story 4S-000161 AK11): Spalte einfügen in einem
// perspective-table-Fence mit Kopfzeile. Die neue Zelle der Kopfzeile ist
// eine Kopfzelle; mit einer Datenzelle zerfiele die Kopfzeile, und die
// gerenderte Tabelle verlöre ihren Kopf (kein thead mehr). Strg+Z nimmt die
// Operation in einem Schritt zurück (AK10).
test.describe('TK-08: Spalte einfügen setzt in der Kopfzeile eine Kopfzelle (4T-002093)', () => {
  test('Kopfzelle in der Kopfzeile, durchgehender Kopf in der Lese-Ansicht, Strg+Z', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await enterEditSource(app, page);
      const vorher = await editorLines(page);

      // Regulärer Ausdruck: 'P1' allein träfe auch die Zeilen 'p1a' und 'p1b'.
      const einfuegen = async () => {
        await openTableSubmenu(page, /^! P1$/);
        await page.locator(item('table-col-insert')).click();
      };
      await einfuegen();
      const lines = await editorLines(page);
      const p1 = lines.indexOf('! P1');
      expect(lines.slice(p1, p1 + 3)).toEqual(['! P1', '! ', '! P2']);
      const p1a = lines.indexOf('| p1a');
      expect(lines.slice(p1a, p1a + 3)).toEqual(['| p1a', '| ', '| p2a']);

      // AK10: ein Rückgängig-Schritt stellt den Text exakt wieder her (wie
      // TK-06 unmittelbar nach der Operation).
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+z');
      expect(await editorLines(page)).toEqual(vorher);

      // AK11, zweite Hälfte: Die Lese-Ansicht zeigt einen durchgehenden Kopf.
      await einfuegen();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const tabelle = page.locator(`${SEL.markdownBody0} table.perspective-table`, {
        has: page.locator('caption', { hasText: 'Perspective Beispiel' }),
      });
      await expect(tabelle.locator('thead th')).toHaveCount(3);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// TK-09/TK-10 (4T-002121, Stories 4S-000161 AK10 und 4S-000051 AK6): Befund
// vom 2026-10-03 im Handgriff des Anwenders. Pipe-Tabelle in der Live-Ansicht
// mit eingeschaltetem Bearbeiten, Kontextmenü › Tabelle › Spalte einfügen,
// Ansicht Gerendert, zurück nach Live, Strg+Z. Erwartet: Der Text steht wieder
// auf dem Stand vor der Operation; mit Erweiterung nimmt das eine Strg+Z den
// Stempel-Schritt mit zurück (editor-historie.js). Das automatische Speichern
// ist an, damit zwischen Operation und Strg+Z gespeichert wird; die beiden Fälle
// unterscheiden sich allein in der Erweiterung «Zeitstempel im Dateikopf», die
// beim Speichern das Feld updated setzt. Gearbeitet wird an einer Kopie im
// Temp-Ordner, weil das Speichern die Datei schreibt.
const RUECKGAENGIG_DOKUMENT = [
  '---',
  'titel: Rückgängig',
  'updated:',
  '---',
  '',
  'Absatz vor der Tabelle.',
  '',
  '| A | B | C |',
  '| --- | --- | --- |',
  '| a1 | b1 | c1 |',
  '| a2 | b2 | c2 |',
  '',
  'Absatz nach der Tabelle.',
  '',
].join('\n');

// Ganzer Text des Editors der linken Spalte aus dem Zustand von CodeMirror.
async function dokumentText(page) {
  return await page.evaluate((P) => {
    let tile = document.querySelector(P).cmTile;
    while (tile.parent) tile = tile.parent;
    return tile.view.state.doc.toString();
  }, SEL.editorContent0);
}

async function rueckgaengigNachAnsichtsWechsel(erweiterungAn) {
  const settings = {
    autoSave: true,
    frontmatter: { updatedEnabled: true, timestampFormat: 'datetime' },
  };
  if (!erweiterungAn) settings.extensions = { disabled: ['frontmatter-timestamps'] };
  const userDataSeed = seedProfile(settings);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-tabellen-undo-'));
  const file = path.join(dir, 'rueckgaengig.md');
  fs.writeFileSync(file, RUECKGAENGIG_DOKUMENT, 'utf8');
  const { app, page, userData } = await launchApp({ args: [file], userData: userDataSeed });
  try {
    await waitForTab(page);
    await sendMenuChannel(app, 'menu:viewChange', 'live');
    await expect(page.locator(SEL.editorContent0)).toBeVisible();
    await page.locator(SEL.btnEdit).click();
    const huelle = page.locator('.pane-group[data-pane="0"] .pane-source-editor');
    await expect(huelle).not.toHaveClass(/read-only/);
    const vorher = await dokumentText(page);
    expect(vorher).toBe(RUECKGAENGIG_DOKUMENT);

    // Rechtsklick in die Zelle a1 der gerenderten Tabelle, Spalte einfügen.
    const tabelle = page.locator(`${SEL.editorContent0} .cm-live-block table`).first();
    await tabelle.locator('th, td').nth(3).click({ button: 'right' });
    await expect(page.locator(MENU)).toBeVisible();
    await page.locator(item('table')).hover();
    await page.locator(item('table-col-insert')).click();
    await expect(tabelle.locator('thead th')).toHaveCount(4);
    const nachOperation = await dokumentText(page);
    expect(nachOperation).not.toBe(vorher);

    // Das automatische Speichern hat den Stand geschrieben (mit Erweiterung
    // samt gesetztem Zeitstempel), bevor die Ansicht wechselt.
    await expect.poll(() => fs.readFileSync(file, 'utf8'), { timeout: 10_000 }).not.toBe(vorher);
    await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    const gespeichert = fs.readFileSync(file, 'utf8');
    expect(await dokumentText(page)).toBe(gespeichert);
    if (erweiterungAn) expect(gespeichert).toMatch(/updated: \d{4}-\d{2}-\d{2}/);
    else expect(gespeichert).toContain('updated:\n');

    // Abstecher in die Lese-Ansicht und zurück; Bearbeiten ist danach wieder an.
    await sendMenuChannel(app, 'menu:viewChange', 'rendered');
    await expect(page.locator(`${SEL.markdownBody0} table`).first()).toBeVisible();
    await sendMenuChannel(app, 'menu:viewChange', 'live');
    await expect(huelle).not.toHaveClass(/read-only/);

    // Schreibmarke in einen Absatz (ein Klick in die Tabelle öffnete eine
    // Zelle), dann ein einziges Strg+Z.
    await page
      .locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Absatz vor der Tabelle.' })
      .click();
    await page.keyboard.press('Control+z');
    // Mit Erweiterung nimmt dasselbe Strg+Z den Stempel-Schritt und die
    // Operation zusammen zurück. Der Text ist danach wieder geändert, und das
    // automatische Speichern stempelt ihn zwei Sekunden später neu; verglichen
    // wird deshalb ohne den Wert der Zeile updated, die Tabelle zeichengenau.
    const ohneStempel = (text) => text.replace(/^updated:.*$/m, 'updated:');
    await expect.poll(async () => ohneStempel(await dokumentText(page))).toBe(vorher);
    await expect(tabelle.locator('thead th')).toHaveCount(3);
  } finally {
    await closeApp(app, userData, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(userDataSeed, { recursive: true, force: true });
  }
}

test.describe('TK-09: Strg+Z nach Abstecher in die Lese-Ansicht, Zeitstempel aus (4T-002121)', () => {
  test('Spalte einfügen in Live, Gerendert und zurück, ein Strg+Z stellt den Text wieder her', async () => {
    await rueckgaengigNachAnsichtsWechsel(false);
  });
});

test.describe('TK-10: Strg+Z nach Abstecher in die Lese-Ansicht, Zeitstempel an (4T-002121)', () => {
  test('Spalte einfügen in Live, gespeichert mit Zeitstempel, ein Strg+Z stellt den Text wieder her', async () => {
    await rueckgaengigNachAnsichtsWechsel(true);
  });
});
