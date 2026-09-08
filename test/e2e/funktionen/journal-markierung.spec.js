// 4T-001491 (Epic 3E-000276): Die Markierung vorhandener Einträge im
// Journal-Navigations-Block — ein Punkt an jeder Periode, deren Eintrag es
// schon gibt.
//
// **Befund des Product Owners vom 2026-09-06:** Der Zeitleisten-Block und der
// Kalender markieren vorhandene Einträge, der Navigations-Block an keiner
// Stelle. Damit sah man einem Klick nicht an, ob er öffnet oder anlegt.
//
// **Warum die Fixture die Pfade rechnen lässt statt sie zu schreiben:** Welche
// Datei zu einer Periode gehört, bestimmt die Schema-Auflösung des
// Perioden-Kerns. Ein im Test von Hand gebauter Pfad wäre eine zweite
// Auflösung, die bei jeder Muster-Änderung still auseinanderliefe; der Fall
// nutzt deshalb `resolveEntryPath` — dieselbe Funktion, die auch die Anwendung
// fragt (Muster aus `journale.spec.js`).
//
// **Der Zuschnitt der Fixture ist die eigentliche Aussage:** Von den vier
// Ebenen des Blocks existieren genau zwei — Monat und Vortag — und zwei nicht.
// Ein Fall, in dem alles existiert, würde eine Markierung nicht von einer
// unbedingten unterscheiden.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { pressUntilVisible } = require('../helpers/eingabe');
const { periodOf, addPeriods, resolveEntryPath } = require('../../../src/shared/journal-core.js');

const NAV_FENCE = ['```perspective-journal-nav', '```'].join('\n');

const JOURNALE = {
  shelves: ['Tagebuch'],
  journals: [
    {
      id: 'tag',
      name: 'Tag',
      shelf: 'Tagebuch',
      granularity: 'day',
      folderPattern: 'Journal',
      namePattern: '{{date}}',
      template: 'Tag.md',
    },
    {
      id: 'monat',
      name: 'Monat',
      shelf: 'Tagebuch',
      granularity: 'month',
      folderPattern: 'Journal',
      namePattern: '{{date::yyyy-MM}}',
    },
    {
      id: 'jahr',
      name: 'Jahr',
      shelf: 'Tagebuch',
      granularity: 'year',
      folderPattern: 'Journal',
      namePattern: '{{date::yyyy}}',
    },
  ],
};

const journalMit = (id) => JOURNALE.journals.find((j) => j.id === id);

// Bereich mit den drei Journalen und genau den Einträgen, die VORAB existieren
// sollen: der Vortag und der laufende Monat. Der heutige Eintrag entsteht im
// Test über das Heute-Kommando, das Jahr und der Folgetag bleiben aus.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-markierung-area-'));
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    `${JSON.stringify({ schemaVersion: 1, settings: { journals: JOURNALE } }, null, 2)}\n`,
    'utf8',
  );
  const heute = periodOf(Date.now(), 'day');
  const anzulegen = [
    { journal: journalMit('tag'), period: addPeriods(heute, -1), inhalt: '# Vortag\n' },
    { journal: journalMit('monat'), period: periodOf(Date.now(), 'month'), inhalt: '# Monat\n' },
  ];
  for (const { journal, period, inhalt } of anzulegen) {
    const aufgeloest = resolveEntryPath(journal, period);
    if (!aufgeloest.ok) throw new Error(`Pfad nicht aufloesbar: ${journal.id}`);
    const abs = path.join(areaRoot, aufgeloest.relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, inhalt, 'utf8');
  }
  return areaRoot;
}

// Vorlage des Tages-Journals: sie traegt den Navigations-Fence (belegtes
// PO-Muster aus journale.spec.js).
function makeTemplatesDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-markierung-vorlagen-'));
  fs.writeFileSync(path.join(dir, 'Tag.md'), `# {{title}}\n\n${NAV_FENCE}\n`, 'utf8');
  return dir;
}

function makeUserData(templatesFolder) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-markierung-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      templates: { folder: templatesFolder },
      hotkeys: { 'journal.openToday': 'Ctrl+Alt+7' },
    }),
  );
  return dir;
}

// Der Bereich wird an das leere Startfenster gebunden, BEVOR eine Datei offen
// ist: Bei belegter Anwendung oeffnet ein Bereich ein zweites Fenster
// (Verhalten aus bereiche.spec.js, BE-02).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

test.describe('JM-01: Markierung vorhandener Eintraege an allen Ebenen (4T-001491)', () => {
  test('Monat und Vortag tragen den Punkt, Jahr und Folgetag nicht', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      // Der Bereich fuehrt genau EIN Tages-Journal; das Heute-Kommando filtert
      // auf diese Granularitaet und oeffnet deshalb ohne Auswahl-Popup.
      //
      // Gewartet wird auf den Navigations-Block und nicht auf den Editor: Der
      // Eintrag oeffnet im Lese-Modus, ein Editor-Inhalt entstuende dort nie.
      // Der wiederholte Druck ist unschaedlich, weil das Kommando einen
      // vorhandenen Eintrag nur oeffnet (Voraussetzung des Helfers).
      const nav = page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
      await pressUntilVisible(page, 'Control+Alt+7', nav.locator('.journal-nav-label'));
      await expect(nav.locator('.journal-nav-parents .journal-nav-link')).toHaveCount(2);

      const lage = await nav.evaluate((el) => {
        const eltern = [...el.querySelectorAll('.journal-nav-parents .journal-nav-link')].map(
          (x) => ({ text: x.textContent, markiert: x.classList.contains('has-entry') }),
        );
        const nachbarn = [...el.querySelectorAll('.journal-nav-neighbor')].map((x) => ({
          text: x.textContent,
          markiert: x.classList.contains('has-entry'),
        }));
        const titel = el.querySelector('.journal-nav-title');
        return {
          eltern,
          nachbarn,
          aktuell: titel.classList.contains('has-entry'),
          // Der Punkt ist ein Pseudo-Element; gemessen wird, dass er wirklich
          // gezeichnet wird und nicht nur die Klasse gesetzt ist.
          punktBreite: getComputedStyle(titel, '::after').width,
          punktUnten: getComputedStyle(titel, '::after').bottom,
        };
      });

      // AK1: Der laufende Monat existiert, die aktuelle Periode auch, ebenso
      // der Vortag. AK2: Das Jahr und der Folgetag nicht.
      expect(lage.eltern.map((e) => e.markiert)).toEqual([true, false]);
      expect(lage.aktuell).toBe(true);
      expect(lage.nachbarn.map((n) => n.markiert)).toEqual([true, false]);

      // AK3, maschineller Anteil: Der Punkt hat die Masse der Kalender-
      // Markierung und sitzt unten. Sein Aussehen im Vergleich zum
      // Zeitleisten-Block bleibt die Sichtpruefung am Bau.
      expect(lage.punktBreite).toBe('4px');
      expect(lage.punktUnten).toBe('0px');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});
