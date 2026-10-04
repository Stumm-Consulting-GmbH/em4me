// 4T-001864 (Epic 3E-000320): Hinweis-Kästen in jeder Schreibweise am laufenden
// Programm. Die Erkennung je Stelle belegen die Unit-Fälle
// (test/unit/render/callouts-schreibweise.test.js und
// test/unit/renderer/callouts-schreibweise-live.test.js); hier steht, was nur
// end-zu-end sichtbar ist:
//
//   HK-01  Die Live-Ansicht zeigt vier gleiche Kästen für `[!NOTE]`, `[!Note]`,
//          `[!note]` und `[!nOtE]`, der Marker ist ausgeblendet, und die
//          gesetzte Ansicht zeigt dieselben vier (AK1, AK2, AK11).
//   HK-02  Den Typ in der Live-Ansicht umschreiben, speichern, das Programm neu
//          starten: Die Box bleibt, und in der Datei steht genau das
//          Geschriebene — keine Schreibweise wird umgeschrieben (AK7, AK15).
//   HK-03, HK-04  Dieselbe Regel für die Container-Blöcke `::: name` (4T-001914,
//          Beschreibung am Abschnitt unten).
//
// Die Datei entsteht je Fall in einem Wegwerf-Ordner, weil HK-02 und HK-04
// schreiben.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const INHALT = [
  '# Hinweis-Kästen',
  '',
  '> [!NOTE]',
  '> Groß geschrieben',
  '',
  '> [!Note]',
  '> Erster Buchstabe groß',
  '',
  '> [!note]',
  '> Klein geschrieben',
  '',
  '> [!nOtE]',
  '> Gemischt geschrieben',
  '',
  'Schluss-Absatz.',
  '',
].join('\n');

function legeDateiAn(inhalt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-'));
  const file = path.join(dir, 'hinweise.md');
  fs.writeFileSync(file, inhalt, 'utf8');
  return { dir, file };
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

async function inDieLiveAnsicht(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'live');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
}

const kopfZeilen = (page) =>
  page.locator(`${SEL.editorContent0} .cm-line.cm-live-callout-header.cm-live-callout-note`);

// Die ausgeblendeten Marker der Kopfzeilen, wie sie im Dokument stehen, je
// Kopfzeile zusammengesetzt: Die Syntax-Hervorhebung teilt den ausgeblendeten
// Bereich in mehrere Spannen (`> ` und `[!NOTE]`).
async function ausgeblendeteMarker(page) {
  return await page.locator(SEL.editorContent0).evaluate((el) =>
    Array.from(el.querySelectorAll('.cm-line.cm-live-callout-header')).map((zeile) =>
      Array.from(zeile.querySelectorAll('.cm-live-marker-hidden'))
        .map((m) => m.textContent)
        .join(''),
    ),
  );
}

// Schreibt den Typ-Namen des ersten Kastens `[!<alt>]` über die Tastatur in
// `neu` um. Markiert wird allein der Name zwischen `[!` und `]`, damit das
// Tippen keine Klammer-Automatik auslöst; die Markierung setzt der Editor
// selbst (Editor-Zugriff nach dem Muster von frontmatter-anzeige.spec.js).
async function schreibeTypUm(page, alt, neu) {
  const gesetzt = await page.evaluate(
    ([P, name]) => {
      const el = document.querySelector(P + ' .cm-content');
      if (!el || !el.cmTile) return false;
      let tile = el.cmTile;
      while (tile.parent) tile = tile.parent;
      const view = tile && tile.view;
      if (!view) return false;
      const pos = view.state.doc.toString().indexOf('[!' + name + ']');
      if (pos < 0) return false;
      view.dispatch({ selection: { anchor: pos + 2, head: pos + 2 + name.length } });
      view.focus();
      return true;
    },
    [SEL.paneGroup0, alt],
  );
  expect(gesetzt).toBe(true);
  await page.keyboard.type(neu);
}

test.describe('HK-01: Vier Schreibweisen, vier gleiche Kästen', () => {
  test('Live- und gesetzte Ansicht zeigen jede Schreibweise als Kasten (AK1, AK2, AK11)', async () => {
    const { dir, file } = legeDateiAn(INHALT);
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await inDieLiveAnsicht(app, page);
      await expect(kopfZeilen(page)).toHaveCount(4);
      await expect(page.locator(`${SEL.editorContent0} .cm-live-callout-icon`)).toHaveCount(4);
      await expect(page.locator(`${SEL.editorContent0} .cm-live-callout-title`)).toHaveCount(4);
      // Der Marker ist in jeder Schreibweise ausgeblendet — und steht dabei
      // unverändert im Dokument.
      expect(await ausgeblendeteMarker(page)).toEqual([
        '> [!NOTE]',
        '> [!Note]',
        '> [!note]',
        '> [!nOtE]',
      ]);

      await page.locator(SEL.viewBtn('rendered')).click();
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.callout.callout-note')).toHaveCount(4);
      await expect(body.locator('blockquote')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('HK-02: Umschreiben, speichern, erneut öffnen', () => {
  test('die Box bleibt, und die Datei trägt genau das Geschriebene (AK7, AK15)', async () => {
    const { dir, file } = legeDateiAn(INHALT);
    const erwartet = INHALT.replace('> [!note]', '> [!NOTE]').replace(
      '> [!NOTE]\n> Groß',
      '> [!note]\n> Groß',
    );
    try {
      const erster = await launchApp({ args: [file] });
      try {
        await inDieLiveAnsicht(erster.app, erster.page);
        await erster.page.locator(SEL.btnEdit).click();
        await expect(erster.page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
        await expect(kopfZeilen(erster.page)).toHaveCount(4);
        // Klein wird groß (dritter Kasten), groß wird klein (erster Kasten).
        await schreibeTypUm(erster.page, 'note', 'NOTE');
        await expect(kopfZeilen(erster.page)).toHaveCount(4);
        await schreibeTypUm(erster.page, 'NOTE', 'note');
        await expect(kopfZeilen(erster.page)).toHaveCount(4);
        await erster.page.keyboard.press('Control+s');
        await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(erwartet);
      } finally {
        await closeApp(erster.app, erster.userData, { force: true });
      }

      const zweiter = await launchApp({ args: [file] });
      try {
        await inDieLiveAnsicht(zweiter.app, zweiter.page);
        await expect(kopfZeilen(zweiter.page)).toHaveCount(4);
        expect(await ausgeblendeteMarker(zweiter.page)).toEqual([
          '> [!note]',
          '> [!Note]',
          '> [!NOTE]',
          '> [!nOtE]',
        ]);
      } finally {
        await closeApp(zweiter.app, zweiter.userData, { force: true });
      }
      // Öffnen allein schreibt nichts um.
      expect(fs.readFileSync(file, 'utf8')).toBe(erwartet);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 4T-001914 (Epic 3E-000320): dieselbe Regel für die Container-Blöcke `::: name`.
//
//   HK-03  Live- und gesetzte Ansicht zeigen drei gleiche Warnungs-Boxen für
//          `::: WARNING`, `::: Warning` und `::: warning`, zwei neutrale Boxen
//          mit dem Namen als Titel (`Meine-Box`, `constructor`) und einen
//          zweispaltigen Block für `::: COLUMNS 2` (AK1, AK2, AK5 bis AK8).
//   HK-04  Namen in der Live-Ansicht umschreiben, speichern, das Programm neu
//          starten: Die Boxen bleiben, und in der Datei steht genau das
//          Geschriebene (AK10, AK12).
const CONTAINER_INHALT = [
  '# Container-Blöcke',
  '',
  '::: WARNING',
  'Groß geschrieben',
  ':::',
  '',
  '::: Warning',
  'Erster Buchstabe groß',
  ':::',
  '',
  '::: warning',
  'Klein geschrieben',
  ':::',
  '',
  '::: Meine-Box',
  'Neutrale Box',
  ':::',
  '',
  '::: constructor',
  'Geerbter Name',
  ':::',
  '',
  '::: COLUMNS 2',
  'Links',
  '',
  '+++',
  '',
  'Rechts',
  ':::',
  '',
  'Schluss-Absatz.',
  '',
].join('\n');

const warnKoepfe = (page) =>
  page.locator(`${SEL.editorContent0} .cm-line.cm-live-callout-header.cm-live-callout-warning`);

// Der sichtbare Text der Kopfzeilen neutraler Boxen: der Zeilen-Text ohne die
// ausgeblendeten Spannen.
async function sichtbareBoxTitel(page) {
  return await page.locator(SEL.editorContent0).evaluate((el) =>
    Array.from(el.querySelectorAll('.cm-line.cm-live-container-header')).map((zeile) => {
      const kopie = zeile.cloneNode(true);
      kopie.querySelectorAll('.cm-live-marker-hidden').forEach((m) => m.remove());
      return kopie.textContent;
    }),
  );
}

// Schreibt den Namen der ersten Kopfzeile `::: <alt>` über die Tastatur in
// `neu` um; markiert wird allein der Name (Muster von schreibeTypUm oben).
async function schreibeContainerUm(page, alt, neu) {
  const gesetzt = await page.evaluate(
    ([P, name]) => {
      const el = document.querySelector(P + ' .cm-content');
      if (!el || !el.cmTile) return false;
      let tile = el.cmTile;
      while (tile.parent) tile = tile.parent;
      const view = tile && tile.view;
      if (!view) return false;
      const pos = view.state.doc.toString().indexOf('::: ' + name + '\n');
      if (pos < 0) return false;
      view.dispatch({ selection: { anchor: pos + 4, head: pos + 4 + name.length } });
      view.focus();
      return true;
    },
    [SEL.paneGroup0, alt],
  );
  expect(gesetzt).toBe(true);
  await page.keyboard.type(neu);
}

test.describe('HK-03: Container-Blöcke in jeder Schreibweise', () => {
  test('Live- und gesetzte Ansicht zeigen Boxen, Titel und Spalten (AK1, AK2, AK5 bis AK8)', async () => {
    const { dir, file } = legeDateiAn(CONTAINER_INHALT);
    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await inDieLiveAnsicht(app, page);
      await expect(warnKoepfe(page)).toHaveCount(3);
      await expect(page.locator(`${SEL.editorContent0} .cm-live-callout-icon`)).toHaveCount(3);
      // Die neutralen Boxen zeigen ihren Namen, wie er geschrieben ist, als Titel.
      await expect.poll(() => sichtbareBoxTitel(page)).toEqual(['Meine-Box', 'constructor']);

      await page.locator(SEL.viewBtn('rendered')).click();
      const body = page.locator(SEL.markdownBody0);
      await expect(body.locator('.callout.callout-warning')).toHaveCount(3);
      await expect(body.locator('.custom-container .custom-container-title')).toHaveText([
        'Meine-Box',
        'constructor',
      ]);
      await expect(body.locator('.custom-container.container-meine-box')).toHaveCount(1);
      await expect(body.locator('.md-columns.md-columns-2')).toHaveCount(1);
      await expect(body).not.toContainText(':::');
    } finally {
      await closeApp(app, userData, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('HK-04: Container umschreiben, speichern, erneut öffnen', () => {
  test('die Boxen bleiben, und die Datei trägt genau das Geschriebene (AK10, AK12)', async () => {
    const { dir, file } = legeDateiAn(CONTAINER_INHALT);
    const erwartet = CONTAINER_INHALT.replace('::: warning\nKlein', '::: WARNING\nKlein')
      .replace('::: WARNING\nGroß', '::: warning\nGroß')
      .replace('::: Meine-Box', '::: MEINE-BOX');
    try {
      const erster = await launchApp({ args: [file] });
      try {
        await inDieLiveAnsicht(erster.app, erster.page);
        await erster.page.locator(SEL.btnEdit).click();
        await expect(erster.page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
        await expect(warnKoepfe(erster.page)).toHaveCount(3);
        // Klein wird groß (dritte Box), groß wird klein (erste Box), und der
        // Name der neutralen Box wird groß.
        await schreibeContainerUm(erster.page, 'warning', 'WARNING');
        await expect(warnKoepfe(erster.page)).toHaveCount(3);
        await schreibeContainerUm(erster.page, 'WARNING', 'warning');
        await expect(warnKoepfe(erster.page)).toHaveCount(3);
        await schreibeContainerUm(erster.page, 'Meine-Box', 'MEINE-BOX');
        await expect(
          erster.page.locator(`${SEL.editorContent0} .cm-line.cm-live-container-header`),
        ).toHaveCount(2);
        await erster.page.keyboard.press('Control+s');
        await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(erwartet);
      } finally {
        await closeApp(erster.app, erster.userData, { force: true });
      }

      const zweiter = await launchApp({ args: [file] });
      try {
        await inDieLiveAnsicht(zweiter.app, zweiter.page);
        await expect(warnKoepfe(zweiter.page)).toHaveCount(3);
        await expect
          .poll(() => sichtbareBoxTitel(zweiter.page))
          .toEqual(['MEINE-BOX', 'constructor']);
      } finally {
        await closeApp(zweiter.app, zweiter.userData, { force: true });
      }
      // Öffnen allein schreibt nichts um.
      expect(fs.readFileSync(file, 'utf8')).toBe(erwartet);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
