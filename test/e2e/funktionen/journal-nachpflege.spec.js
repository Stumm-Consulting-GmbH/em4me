// 4T-001406 (Epic 3E-000244): E2E-Suite der Journal-Nachpflege — bestehende
// Eintraege bekommen fehlende Frontmatter-Eigenschaften ergaenzt, vorhandene
// bleiben unberuehrt (Architekturentscheidung AE2 des Epics).
//
// Eigene Datei statt einer Erweiterung von journale.spec.js: Jene Datei lag mit
// 800 Zeilen am Budget, und die Nachpflege ist ein eigener Gegenstand, der mit
// dem Nachtrage-Kommando (4T-001407) weiter waechst. Der Schnitt folgt damit der
// Fachlichkeit und nicht der Zeilenzahl; dass der Waechter ihn ausgeloest hat,
// aendert daran nichts. Matrix-IDs im describe-Titel (test/abdeckungs-matrix.json).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { pressUntilVisible } = require('../helpers/eingabe');

// Lokales Datum als yyyy-MM-dd (konsistent zum Perioden-Kern).
function isoToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Bereich mit ZWEI Tages-Journalen; die Vorlage spielt hier keine Rolle, weil
// der Eintrag bereits besteht. Das zweite Journal ist kein Beiwerk: Bei einem
// einzigen Tages-Journal waehlt das Kommando ohne Dialog aus (pickJournal),
// und der Test haette kein belegbares Zwischenziel zum Anklicken.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journal-nachpflege-area-'));
  const journalsConfig = {
    shelves: ['Tagebuch'],
    journals: [
      {
        id: 'tag',
        name: 'Tag',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'Journal/{{date::yyyy}}',
        namePattern: '{{date}}',
      },
      {
        id: 'zweitbuch',
        name: 'Zweitbuch',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'Zweitbuch/{{date::yyyy}}',
        namePattern: '{{date}}',
      },
    ],
  };
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { journals: journalsConfig } }, null, 2) + '\n',
    'utf8',
  );
  return areaRoot;
}

function makeUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journal-nachpflege-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      hotkeys: { 'journal.openToday': 'Ctrl+Alt+7', 'journal.nachtragen': 'Ctrl+Alt+8' },
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

test.describe('JR-14: bestehende Eintraege werden beim Oeffnen ergaenzt', () => {
  test('ergaenzt fehlende Eigenschaften, laesst vorhandene und fremde Felder stehen', async () => {
    const areaRoot = makeArea();
    const userData = makeUserData();
    const today = isoToday();
    const year = today.slice(0, 4);
    // Ein Eintrag wie aus dem Bestand des Product Owners: fremde Felder, ein
    // abweichendes journal-date, keine Perioden-Grenzen und kein Journal-Name.
    const ziel = path.join(areaRoot, 'Journal', year, `${today}.md`);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(
      ziel,
      `---
tags:
  - Tagebuch
created: 2025-03-09
journal-date: 1999-01-01
---

# Bestand

Text.
`,
    );
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);

      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();

      // Die fehlenden drei Eigenschaften kommen hinzu.
      await expect
        .poll(() => (fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : null))
        .toContain(`journal-start-date: ${today}`);
      const inhalt = fs.readFileSync(ziel, 'utf8');
      expect(inhalt).toContain(`journal-end-date: ${today}`);
      expect(inhalt).toContain('journal: Tag');
      // Der abweichende vorhandene Wert bleibt stehen (AE2 des Epics), fremde
      // Felder und der Text ebenso.
      expect(inhalt).toContain('journal-date: 1999-01-01');
      expect(inhalt).toContain('- Tagebuch');
      expect(inhalt).toContain('created:');
      expect(inhalt).toContain('# Bestand');
      expect(inhalt).toContain('Text.');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// --- 4T-001407 (Epic 3E-000244): Massen-Nachpflege eines ganzen Journals ------------

// Den Bestaetigungs-Dialog im Main stubben und die Antwort steuern; der native
// Dialog ist per Playwright nicht bedienbar (Muster stubCancelDialog aus
// entwurfs-zwischenspeicher.spec.js). Der Stub zaehlt zugleich die Aufrufe und
// haelt die Zahlen fest, mit denen der Dialog aufgerufen wurde — genau die
// Vorschau, die der Anwender vor seiner Entscheidung sieht.
async function stubBestaetigung(app, antwort) {
  await app.evaluate(({ dialog }, response) => {
    globalThis.__nachtragenCalls = 0;
    globalThis.__nachtragenMessage = '';
    dialog.showMessageBox = async (_win, opts) => {
      globalThis.__nachtragenCalls += 1;
      globalThis.__nachtragenMessage = (opts && opts.message) || '';
      return { response };
    };
  }, antwort);
}

// Das Kommando ausloesen: Kuerzel druecken, bis die Journal-Auswahl steht (bei
// zwei Tages-Journalen erscheint sie immer), das Journal waehlen und dann
// warten, bis der Bestaetigungs-Dialog im Main angekommen ist. Der native
// Dialog ist per Playwright nicht bedienbar, deshalb der Zaehler im Main.
async function loeseNachtragenAus(page, app) {
  const selectModal = page.locator('#template-select-modal');
  await pressUntilVisible(page, 'Control+Alt+8', selectModal);
  await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
  await expect
    .poll(() => app.evaluate(() => globalThis.__nachtragenCalls || 0), { timeout: 15000 })
    .toBeGreaterThan(0);
}

test.describe('JR-15: Kommando traegt die Eigenschaften eines ganzen Journals nach', () => {
  test('zeigt die Vorschau, bricht auf Abbruch ohne Aenderung ab und traegt nach Bestaetigung nach', async () => {
    const areaRoot = makeArea();
    const userData = makeUserData();
    // Drei Eintraege des Tages-Journals: einer unvollstaendig, einer bereits
    // vollstaendig, dazu eine fremde Datei im selben Ordner, die nicht
    // mitgezaehlt werden darf.
    const schreibe = (iso, inhalt) => {
      const ziel = path.join(areaRoot, 'Journal', iso.slice(0, 4), `${iso}.md`);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, inhalt);
      return ziel;
    };
    const heute = isoToday();
    const luecke = schreibe(heute, '---\ntags:\n  - Tagebuch\n---\n\nLuecke\n');
    const voll = schreibe(
      '2026-01-07',
      '---\njournal: Tag\njournal-date: 2026-01-07\n' +
        'journal-start-date: 2026-01-07\njournal-end-date: 2026-01-07\n---\n\nVoll\n',
    );
    const fremd = path.join(areaRoot, 'Journal', 'Notizen.md');
    fs.writeFileSync(fremd, '# Keine Journal-Datei\n');
    const vollVorher = fs.readFileSync(voll, 'utf8');

    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);

      // Erster Lauf: Abbruch im Bestaetigungs-Dialog — keine Datei aendert sich.
      await stubBestaetigung(app, 1);
      await loeseNachtragenAus(page, app);
      expect(fs.readFileSync(luecke, 'utf8')).not.toContain('journal-start-date');
      // Die Vorschau nennt die zwei Journal-Eintraege, nicht die fremde Datei.
      const meldung = await app.evaluate(() => globalThis.__nachtragenMessage || '');
      expect(meldung).toContain('2');
      expect(meldung).not.toContain('3');

      // Zweiter Lauf: Bestaetigung — der unvollstaendige Eintrag wird ergaenzt,
      // der vollstaendige bleibt byte-gleich, die fremde Datei unberuehrt.
      await stubBestaetigung(app, 0);
      await loeseNachtragenAus(page, app);
      await expect
        .poll(() => fs.readFileSync(luecke, 'utf8'))
        .toContain(`journal-start-date: ${heute}`);
      const ergaenzt = fs.readFileSync(luecke, 'utf8');
      expect(ergaenzt).toContain('journal: Tag');
      expect(ergaenzt).toContain('- Tagebuch');
      expect(ergaenzt).toContain('Luecke');
      expect(fs.readFileSync(voll, 'utf8')).toBe(vollVorher);
      expect(fs.readFileSync(fremd, 'utf8')).toBe('# Keine Journal-Datei\n');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
