// 4T-001719 (Epic 3E-000302): E2E-Funktions-Specs der dauerhaften
// Verweis-Kennzeichnung in der Live-Ansicht.
//
// Geprueft wird die berechnete Text-Dekoration am laufenden Programm — die
// Regel lebt in einer Stil-Datei, kein Unit-Fall erreicht sie. Vier Fragen:
// steht die Unterstreichung ohne Mausberuehrung und ohne Schreibmarke in der
// Zeile (AK1, AK2), bleibt die gesetzte Darstellung ohne sie (AK3), bleibt die
// Cursor-Zeile bei der rohen Auszeichnung (AK6), und doppelt oder loescht das
// Ueberfahren mit der Maus die Unterstreichung nicht (AK5, Stuetze der
// Sichtpruefung an der gebauten Programmdatei).
//
// Die Faelle tippen nichts: Geprueft wird allein die Darstellung, und eine
// Aenderung am Fixture-Text wuerde die Fixture-Datei beruehren.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'link-kennzeichnung.md',
);

// Die drei Verweis-Formen des Fixtures. Dokument- und Adress-Verweis tragen
// beide cm-live-link (Markdown-Form), die Wiki-Form cm-live-wikilink.
const dokumentVerweis = (page) =>
  page.locator(`${SEL.editorContent0} .cm-live-link[data-live-link-href="Zielnotiz.md"]`);
const wikiVerweis = (page) => page.locator(`${SEL.editorContent0} .cm-live-wikilink`);
const adressVerweis = (page) =>
  page.locator(
    `${SEL.editorContent0} .cm-live-link[data-live-link-href="https://beispiel.invalid/seite"]`,
  );

// Die berechnete Dekorations-Linie eines Elements.
const dekoration = (locator) =>
  locator.evaluate((el) => window.getComputedStyle(el).textDecorationLine);

// Live-Ansicht, ohne die Maus ueber den Text zu fuehren.
async function liveAnsicht(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  // Der Zeiger bleibt in der Ecke: kein :hover auf einem Verweis.
  await page.mouse.move(0, 0);
  await page.locator(SEL.viewBtn('live')).click();
  await expect(page.locator(SEL.content0)).toHaveClass(/view-live/);
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.mouse.move(0, 0);
}

// Die Editor-Zeile, die den genannten Text enthaelt.
const zeileMit = (page, text) =>
  page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: text }).first();

test.describe('LK-01: Dauerhafte Kennzeichnung der Dokument-Verweise', () => {
  test('Dokument- und Wiki-Verweis sind ohne Maus und ohne Schreibmarke unterstrichen (AK1)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveAnsicht(page);
      await expect(dokumentVerweis(page)).toBeVisible();
      await expect(wikiVerweis(page)).toBeVisible();
      expect(await dekoration(dokumentVerweis(page))).toContain('underline');
      expect(await dekoration(wikiVerweis(page))).toContain('underline');
      // Gegenprobe: der Fliesstext daneben traegt keine Dekoration.
      const fliesstext = zeileMit(page, 'nur Fließtext zum Vergleich');
      expect(await dekoration(fliesstext)).toBe('none');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('LK-02: Dauerhafte Kennzeichnung der Adress-Verweise', () => {
  test('der Adress-Verweis nach außen ist ohne Maus und ohne Schreibmarke unterstrichen (AK2)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveAnsicht(page);
      await expect(adressVerweis(page)).toBeVisible();
      expect(await dekoration(adressVerweis(page))).toContain('underline');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('LK-03: Die gesetzte Darstellung bleibt, wie sie ist', () => {
  test('in der gerenderten Ansicht traegt ein Verweis ohne Maus keine Unterstreichung (AK3)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.mouse.move(0, 0);
      await page.locator(SEL.viewBtn('rendered')).click();
      const verweise = page.locator(`${SEL.markdownBody0} a`);
      await expect(verweise.first()).toBeVisible();
      await page.mouse.move(0, 0);
      const anzahl = await verweise.count();
      expect(anzahl).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < anzahl; i++) {
        expect(await dekoration(verweise.nth(i))).toBe('none');
      }
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('LK-04: Die Cursor-Zeile bleibt unberuehrt', () => {
  test('in der Zeile der Schreibmarke steht die rohe Auszeichnung ohne Verweis-Dekoration (AK6)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveAnsicht(page);
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
      // Drei Verweise, solange die Schreibmarke in der Ueberschrift steht.
      await expect(page.locator(`${SEL.editorContent0} .cm-live-link`)).toHaveCount(2);
      await expect(wikiVerweis(page)).toHaveCount(1);

      // Schreibmarke in die Zeile des Dokument-Verweises: dort entsteht keine
      // Dekoration mehr, der Roh-Text erscheint.
      await zeileMit(page, 'Verweis auf ein Dokument').click();
      await expect(page.locator(`${SEL.editorContent0} .cm-live-link`)).toHaveCount(1);
      await expect(zeileMit(page, 'Verweis auf ein Dokument')).toContainText('](Zielnotiz.md)');
      // Die uebrigen Verweise bleiben gekennzeichnet.
      await expect(wikiVerweis(page)).toHaveCount(1);
      expect(await dekoration(wikiVerweis(page))).toContain('underline');
      expect(await dekoration(adressVerweis(page))).toContain('underline');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('LK-05: Das Überfahren mit der Maus doppelt die Kennzeichnung nicht', () => {
  test('die Dekoration ist unter der Maus dieselbe wie ohne sie (AK5)', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await liveAnsicht(page);
      await expect(dokumentVerweis(page)).toBeVisible();
      const ohneMaus = await dekoration(dokumentVerweis(page));
      await dokumentVerweis(page).hover();
      const unterMaus = await dekoration(dokumentVerweis(page));
      expect(unterMaus).toBe(ohneMaus);
      expect(unterMaus).toContain('underline');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
