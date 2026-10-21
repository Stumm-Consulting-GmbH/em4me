// 4T-002189 (Epic 3E-000353): Zwei Darstellungs-Zusagen am unteren Rand und in
// der Seitenleiste, beide gefunden am gebauten Programm.
//
// SVS-01 — Die offene Suchleiste verdeckt die Statusleiste nicht. Vor der
// Behebung schwebte sie am Fensterrand genau über der Statusleiste; die
// Sprach-Auswahl war nicht erreichbar, solange gesucht wurde (Story
// 4S-000465, AK2: «ohne Umweg erreichbar»). Geprüft wird an der Stelle, an der
// ein Klick ankommt: Das Element am Mittelpunkt der Sprach-Auswahl ist die
// Auswahl selbst. Ebenso bleiben die Regex-Kurzreferenz und das Aufklapp-Menü
// der gefalteten Statusleiste bei offener Suche bedienbar.
//
// RGL-01 — Jeder Reiter einer Reiter-Gruppe ist ganz lesbar (Story 4S-000402,
// AK11). Vor der Behebung kürzte die einzeilige Reiterleiste «Suchergebnisse»
// neben «Inhaltsverzeichnis» mit Auslassungspunkten. Messung wie in der
// Abnahme des Epics 3E-000323: Ein Reiter, dessen Inhalt breiter ist als sein
// Platz (`scrollWidth > clientWidth + 1`), ist gekürzt.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const LEFT = '.pane-group[data-pane="0"] .pane-sidebar-left';
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const FINDE_GRUPPE = ['outline', 'subpages', 'filegraph', 'searchresults', 'canvaslist'];

function seedProfil(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-sur-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Erwartete Beschriftung aus der beim Bau zusammengesetzten Sprachdatei; der
// Fall wartet auf genau diesen Text, damit er nach dem Sprachwechsel misst und
// nicht davor.
function beschriftung(sprache, schluessel) {
  const datei = path.resolve(__dirname, '..', '..', '..', 'src', 'i18n', `${sprache}.json`);
  const daten = JSON.parse(fs.readFileSync(datei, 'utf8'));
  if (typeof daten[schluessel] === 'string') return daten[schluessel];
  return schluessel.split('.').reduce((o, teil) => (o ? o[teil] : undefined), daten);
}

test.describe('SVS-01: Offene Suchleiste verdeckt die Statusleiste nicht (4T-002189)', () => {
  test('Sprach-Auswahl bleibt bei offener Suche erreichbar und wirkt', async () => {
    const userData = seedProfil({ language: 'de' });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();
      await expect(page.locator(SEL.searchInput)).toBeFocused();

      // Am Mittelpunkt der Auswahl liegt die Auswahl selbst, nicht die
      // Suchleiste; und die Suchleiste endet oberhalb der Statusleiste.
      const lage = await page.evaluate(() => {
        const auswahl = document.getElementById('lang-select');
        const leiste = document.querySelector('.statusbar');
        const suche = document.getElementById('search-bar');
        const r = auswahl.getBoundingClientRect();
        const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const l = leiste.getBoundingClientRect();
        const s = suche.getBoundingClientRect();
        return {
          auswahlOben: oben === auswahl || auswahl.contains(oben),
          leisteImFenster: l.top >= 0 && l.bottom <= window.innerHeight + 1,
          sucheUeberLeiste: s.bottom <= l.top + 1,
        };
      });
      expect(lage).toEqual({ auswahlOben: true, leisteImFenster: true, sucheUeberLeiste: true });

      // Ein Sprachwechsel bei offener Suche wirkt: Die Statusleiste zeigt die
      // englische Beschriftung, und die Suchleiste bleibt offen.
      // Probe-Klick ohne Auslösen: Playwright prüft, dass der Klick die Auswahl
      // erreicht und kein anderes Element ihn abfängt.
      await page.locator('#lang-select').click({ trial: true });
      await page.locator('#lang-select').selectOption('en');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator(SEL.searchBar)).toBeVisible();

      // Die Regex-Kurzreferenz über dem Fragezeichen-Knopf bleibt bedienbar.
      await page.locator('#btn-search-help').click();
      const hilfe = page.locator('#regex-help-popover');
      await expect(hilfe).toBeVisible();
      const hilfeOben = await page.evaluate(() => {
        const el = document.getElementById('regex-help-popover');
        const r = el.getBoundingClientRect();
        const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el.contains(oben) && r.top >= 0;
      });
      expect(hilfeOben).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });

  // Die Aufklapp-Menüs der gefalteten Statusleiste öffnen nach oben, also
  // dorthin, wo die Suchleiste steht. «Immer zusammengeklappt» stellt den
  // Menü-Knopf unabhängig von der Fensterbreite her (Muster SF-12 in
  // statusleisten-faltung.spec.js).
  test('Aufklapp-Menü der gefalteten Statusleiste bleibt bei offener Suche bedienbar', async () => {
    const userData = seedProfil({ language: 'de', statusbar: { collapseMode: 'always' } });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();
      const knopf = page.locator('#btn-statusbar-collapse-right');
      await expect(knopf).toBeVisible();
      await knopf.click();
      const menue = page.locator('#context-menu');
      await expect(menue).toBeVisible();
      await expect(knopf).toHaveAttribute('aria-expanded', 'true');
      const menueOben = await page.evaluate(() => {
        const el = document.getElementById('context-menu');
        const r = el.getBoundingClientRect();
        const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el.contains(oben);
      });
      expect(menueOben).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Misst jede Reiterleiste der linken Seite: kein Reiter breiter als sein
// Platz, keiner über den Rand der Leiste hinaus.
async function gekuerzteReiter(page) {
  return page.evaluate((sel) => {
    const befund = [];
    for (const leiste of document.querySelectorAll(`${sel} .sidebar-slot-tabs`)) {
      const rand = leiste.getBoundingClientRect();
      for (const reiter of leiste.querySelectorAll('.sidebar-slot-tab')) {
        const r = reiter.getBoundingClientRect();
        if (reiter.scrollWidth > reiter.clientWidth + 1 || r.right > rand.right + 1) {
          befund.push(reiter.textContent.trim());
        }
      }
    }
    return befund;
  }, LEFT);
}

for (const breite of [260, 180]) {
  test.describe(`RGL-01: Reiter der Finde-Gruppe ungekürzt bei ${breite} Bildpunkten (4T-002189)`, () => {
    test('in allen fünf Sprachen ist kein Reiter gekürzt', async () => {
      const sichtbar = {};
      for (const schluessel of [
        'outline',
        'subpages',
        'fileGraph',
        'searchResults',
        'canvasList',
      ]) {
        sichtbar[schluessel] = { visibleColumn0: true };
      }
      const userData = seedProfil({
        language: 'de',
        sidebar: {
          layout: { left: [{ panels: FINDE_GRUPPE, active: 'outline' }], right: [] },
          widthLeft: breite,
        },
        ...sichtbar,
      });
      const { app, page } = await launchApp({ args: [BASIS], userData });
      try {
        await expect(page.locator(SEL.tabs0).first()).toBeVisible();
        await expect(page.locator(LEFT)).toHaveCSS('width', `${breite}px`);
        const suchReiter = page.locator(`${LEFT} .sidebar-slot-tab[data-panel-id="searchresults"]`);
        const inhaltReiter = page.locator(`${LEFT} .sidebar-slot-tab[data-panel-id="outline"]`);
        for (const sprache of SPRACHEN) {
          if (sprache !== 'de') await page.locator('#lang-select').selectOption(sprache);
          await expect(suchReiter).toHaveText(beschriftung(sprache, 'searchResults.title'));
          await expect(inhaltReiter).toHaveText(beschriftung(sprache, 'outline.title'));
          expect({ sprache, gekuerzt: await gekuerzteReiter(page) }).toEqual({
            sprache,
            gekuerzt: [],
          });
        }
      } finally {
        await closeApp(app, userData);
      }
    });
  });
}
