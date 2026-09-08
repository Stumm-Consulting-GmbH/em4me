// 4T-001490 (Epic 3E-000276): Die Blaetter-Schaltflaechen des
// Journal-Navigations-Blocks — Trefferflaeche und sichtbarer Ziel-Name.
//
// **Zwei Befunde des Product Owners vom 2026-09-06.** Die Pfeile waren reine
// Textzeichen ohne eigene Flaeche, getroffen werden musste die Glyphe selbst.
// Und wohin sie fuehren, stand allein im Kurzhinweis — sichtbar erst nach dem
// Verweilen mit dem Zeiger.
//
// **Warum die Flaeche gemessen und nicht der Stilwert gelesen wird** (Muster
// aus `aufgaben-darstellung.spec.js`): Ein gesetztes `padding` beweist nicht,
// dass die Schaltflaeche es auch einnimmt — eine Zeile weiter koennte es eine
// Regel mit hoeherer Spezifitaet wieder abraeumen. Gemessen wird deshalb das
// Rechteck der Schaltflaeche gegen das Rechteck ihres Zeichens.
//
// **Warum eine eigene Datei.** `journale.spec.js` fuehrt Kommandos und
// Anlage-Pfad und steht dicht an ihrem Zeilen-Budget; der Schnitt folgt der
// Fachlichkeit.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { pressUntilVisible } = require('../helpers/eingabe');

function isoToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Bereich mit zwei Tages-Journalen: eines ohne Grenze und eines, dessen
// `startDate` auf HEUTE liegt. Beim zweiten gibt es keine vorige Periode mehr —
// das ist der Grenz-Fall aus AK3, ohne dass ein Eintrag in der Zukunft noetig
// waere.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blaettern-area-'));
  const journals = {
    shelves: ['Tagebuch'],
    journals: [
      {
        id: 'tag',
        name: 'Tag',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'Journal/{{date::yyyy}}',
        namePattern: '{{date}}',
        template: 'Tag.md',
      },
      {
        id: 'abheute',
        name: 'Ab heute',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'AbHeute',
        namePattern: '{{date}}',
        template: 'Tag.md',
        startDate: isoToday(),
      },
    ],
  };
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    `${JSON.stringify({ schemaVersion: 1, settings: { journals } }, null, 2)}\n`,
    'utf8',
  );
  return areaRoot;
}

function makeTemplatesDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blaettern-vorlagen-'));
  fs.writeFileSync(
    path.join(dir, 'Tag.md'),
    '# {{title}}\n\n```perspective-journal-nav\n```\n\n{{cursor}}Los\n',
    'utf8',
  );
  return dir;
}

function makeUserData(templatesFolder) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blaettern-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      templates: { folder: templatesFolder },
      hotkeys: { 'journal.openToday': 'Ctrl+Alt+7' },
    }),
  );
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// Eintrag ueber das Heute-Kommando anlegen und oeffnen; `journalName` waehlt
// eines der beiden Journale im Auswahl-Popup.
async function oeffneHeute(page, journalName) {
  const selectModal = page.locator('#template-select-modal');
  await pressUntilVisible(page, 'Control+Alt+7', selectModal);
  await page.locator('#template-select-list button', { hasText: journalName }).click();
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  const nav = page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
  await expect(nav.locator('.journal-nav-label')).toBeVisible({ timeout: 15000 });
  return nav;
}

// Flaeche der Schaltflaeche und Flaeche ihres Zeichens, beide in Bildpunkten.
async function flaechen(page) {
  return await page.evaluate((sel) => {
    const out = [];
    for (const btn of document.querySelectorAll(`${sel} .journal-nav-arrow`)) {
      const box = btn.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(btn);
      const zeichen = [...r.getClientRects()].filter((x) => x.width > 0)[0];
      out.push({
        text: btn.textContent,
        breite: Math.round(box.width * 100) / 100,
        hoehe: Math.round(box.height * 100) / 100,
        zeichenBreite: zeichen ? Math.round(zeichen.width * 100) / 100 : 0,
        zeichenHoehe: zeichen ? Math.round(zeichen.height * 100) / 100 : 0,
      });
    }
    return out;
  }, SEL.markdownBody0);
}

test.describe('JB-01: Blaetter-Schaltflaechen mit Flaeche und Ziel-Name (4T-001490)', () => {
  test('beide Schaltflaechen sind treffbar und nennen ihre Ziel-Periode', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      const nav = await oeffneHeute(page, 'Tag — Tagebuch');

      // AK1: Beide Schaltflaechen tragen eine Flaeche, die deutlich ueber ihr
      // Zeichen hinausgeht. Der Vergleich ist relativ und nicht absolut, damit
      // der Fall bei einer anderen Schriftgroesse nicht falsch anschlaegt; die
      // Mindestmasse pruefen zusaetzlich den absoluten Boden.
      const gemessen = await flaechen(page);
      expect(gemessen).toHaveLength(2);
      for (const f of gemessen) {
        expect(f.breite, `Breite von "${f.text}"`).toBeGreaterThanOrEqual(28);
        expect(f.hoehe, `Hoehe von "${f.text}"`).toBeGreaterThanOrEqual(28);
        expect(f.breite * f.hoehe, `Flaeche von "${f.text}"`).toBeGreaterThan(
          f.zeichenBreite * f.zeichenHoehe * 1.8,
        );
      }

      // AK2: Neben jeder Schaltflaeche steht der Name ihrer Ziel-Periode, und
      // zwar derselbe, den der Kurzhinweis traegt — beide kommen aus einer
      // Quelle und duerfen nicht auseinanderlaufen.
      const namen = nav.locator('.journal-nav-neighbor');
      await expect(namen).toHaveCount(2);
      const links = await namen.nth(0).textContent();
      const rechts = await namen.nth(1).textContent();
      const pfeile = nav.locator('.journal-nav-arrow');
      expect(await pfeile.nth(0).getAttribute('title')).toBe(links);
      expect(await pfeile.nth(1).getAttribute('title')).toBe(rechts);
      expect(links).not.toBe(rechts);

      // Und die Lese-Folge stimmt: voriger Name, Rueckwaerts-Pfeil, aktuelle
      // Periode, Vorwaerts-Pfeil, naechster Name.
      const folge = await nav
        .locator('.journal-nav-current > *')
        .evaluateAll((els) => els.map((el) => el.className.split(' ')[0]));
      expect(folge).toEqual([
        'journal-nav-neighbor',
        'journal-nav-link',
        'journal-nav-title',
        'journal-nav-link',
        'journal-nav-neighbor',
      ]);

      // AK2, zweiter Teil: Der Name steht in kleinerer Schrift als die
      // aktuelle Periode.
      const groessen = await nav.evaluate((el) => ({
        name: parseFloat(getComputedStyle(el.querySelector('.journal-nav-neighbor')).fontSize),
        aktuell: parseFloat(getComputedStyle(el.querySelector('.journal-nav-label')).fontSize),
      }));
      expect(groessen.name).toBeLessThan(groessen.aktuell);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});

test.describe('JB-02: An der Journal-Grenze entfallen Schaltflaeche und Name gemeinsam (4T-001490)', () => {
  test('das ab heute beginnende Journal zeigt nur den Vorwaerts-Weg', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      const nav = await oeffneHeute(page, 'Ab heute — Tagebuch');

      // AK3: `startDate` liegt auf heute, eine vorige Periode gibt es nicht.
      // Zu pruefen ist das PAAR: Frueher entfiel der Pfeil allein, jetzt darf
      // auch kein verwaister Name stehen bleiben.
      await expect(nav.locator('.journal-nav-arrow')).toHaveCount(1);
      await expect(nav.locator('.journal-nav-neighbor')).toHaveCount(1);
      const folge = await nav
        .locator('.journal-nav-current > *')
        .evaluateAll((els) => els.map((el) => el.className.split(' ')[0]));
      expect(folge).toEqual(['journal-nav-title', 'journal-nav-link', 'journal-nav-neighbor']);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});
