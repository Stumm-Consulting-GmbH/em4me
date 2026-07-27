// 4T-0433 (Epic 3E-0081): E2E-Funktions-Suite Journale — Kommandos und der
// gemeinsame Öffnen-/Anlage-Pfad. JR-01: Heute-Kommando legt den Eintrag mit
// Vorlage und Frontmatter-Datums-Properties an und öffnet ihn (Cursor-Sprung);
// JR-02: erneuter Aufruf öffnet nur (keine Doppel-Anwendung der Vorlage);
// JR-04: Grenze vor startDate meldet den lokalisierten Hinweis, keine Datei;
// JR-03: Datum-Kommando (Datums-Dialog, Journal-Auswahl) legt den Wochen-
// Eintrag ohne Vorlage mit Start-/End-Property an. describe-Titel tragen die
// Matrix-IDs (test/abdeckungs-matrix.json, F-103/S-074/S-075).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { leseTextOderNull, warteAufJson } = require('../helpers/dateien');
// 4T-0434: erwartete Wochen-Schlüssel/-Pfade aus demselben Perioden-Kern,
// den die App nutzt (keine zweite KW-Rechnung im Test).
const { periodOf, resolveEntryPath } = require('../../../src/shared/journal-core.js');

// Lokales Datum als yyyy-MM-dd (konsistent zum Perioden-Kern).
function isoToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Bereichs-Wurzel mit journals-Sektion: Tages-Journal mit Vorlage,
// Wochen-Journal ohne Vorlage, begrenztes Tages-Journal (startDate in der
// Zukunft) für den Grenz-Fall.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-area-'));
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
        template: 'Tag.md',
      },
      {
        id: 'woche',
        name: 'Woche',
        shelf: 'Tagebuch',
        granularity: 'week',
        folderPattern: 'Journal/{{date::yyyy}}',
        namePattern: '{{date::kkkk-KWww}}',
      },
      {
        id: 'zukunft',
        name: 'Begrenzt',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'Zukunft',
        namePattern: '{{date}}',
        startDate: '2099-01-01',
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

// Profil mit globalem Vorlagen-Ordner (Journal-Vorlage) und belegten
// Kürzeln für beide Kommandos (Muster vorlagen.spec.js).
function makeUserData(templatesFolder) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      templates: { folder: templatesFolder },
      hotkeys: {
        'journal.openToday': 'Ctrl+Alt+7',
        'journal.openForDate': 'Ctrl+Alt+6',
      },
    }),
  );
  return dir;
}

function makeTemplatesDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-vorlagen-'));
  // 4T-0435: die Vorlage trägt den Navigations-Fence (belegtes PO-Muster:
  // Navigation kommt aus der Journal-Vorlage).
  fs.writeFileSync(
    path.join(dir, 'Tag.md'),
    '# {{title}}\n\nDatum: {{date}}\n\n```perspective-journal-nav\n```\n\n{{cursor}}Los\n',
    'utf8',
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

// Bereich an das leere Startfenster binden (Muster vorlagen.spec.js VL-10).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// Kürzel drücken, bis der erwartete Dialog offen ist (Poll, weil der
// Kommando-Dispatcher erst am Ende des asynchronen init() steht).
async function pressUntilVisible(page, key, locator) {
  await expect
    .poll(async () => {
      if (!(await locator.isVisible())) await page.keyboard.press(key);
      return locator.isVisible();
    })
    .toBe(true);
}

test.describe('JR-01/JR-02/JR-04: Heute-Kommando — Anlage, Wiederöffnen, Grenze (F-103/S-074)', () => {
  test('legt mit Vorlage und Properties an, öffnet nur bei Existenz, kappt an der Grenze', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);

      // JR-01: Heute-Kommando — zwei Tages-Journale, Auswahl-Popup erscheint.
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();

      const today = isoToday();
      const year = today.slice(0, 4);
      const target = path.join(areaRoot, 'Journal', year, `${today}.md`);
      // Datei entsteht mit Properties und gefüllter Vorlage; Cursor-Sprung
      // aktiviert den Edit-Modus.
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect
        .poll(() => (fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null))
        .toContain(`journal-date: ${today}`);
      const content = fs.readFileSync(target, 'utf8');
      expect(content).toContain(`# ${today}`);
      expect(content).toContain(`Datum: ${today}`);
      expect(content).toContain('Los');
      expect(content).not.toContain('{{cursor}}');

      // JR-02: erneuter Aufruf öffnet nur — Inhalt bleibt identisch,
      // kein zweiter Tab.
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      expect(fs.readFileSync(target, 'utf8')).toBe(content);

      // JR-04: begrenztes Journal — heute liegt vor startDate, Hinweis
      // statt Anlage.
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page
        .locator('#template-select-list button', { hasText: 'Begrenzt — Tagebuch' })
        .click();
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(page.locator('#statusbar-hint')).toHaveClass(/error/);
      expect(fs.existsSync(path.join(areaRoot, 'Zukunft'))).toBe(false);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});

// --- 4T-0434 (Epic 3E-0081): Kalender-Panel --------------------------------------

const CAL = '.pane-group[data-pane="0"] .sidebar-calendar';

test.describe('JR-05: Kalender-Panel — Punkte, Klick-Anlage, Monats-Blättern, KW-Klick (F-103)', () => {
  test('zeigt Punkte nach Anlage, öffnet bzw. legt per Klick an und blättert', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      // Heutigen Eintrag anlegen (JR-01-Weg): liefert den Punkt und macht
      // das Fenster nicht-leer (Panel-Sichtbarkeit hängt am Empty-State).
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Panel über den Statusbar-Toggle öffnen.
      await page.locator('#btn-calendar').click();
      const cal = page.locator(CAL);
      await expect(cal).toBeVisible();
      await expect(cal.locator('.calendar-month-label')).not.toHaveText('');

      // Heute ist hervorgehoben und trägt den Punkt des angelegten Eintrags.
      const today = cal.locator('.calendar-day-btn.today');
      await expect(today).toHaveClass(/has-entry/);

      // Tag-Klick: Auswahl über die beiden Tages-Journale, öffnet den
      // bestehenden Eintrag.
      await today.click();
      await expect(page.locator('#template-select-modal')).toBeVisible();
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText(isoToday());

      // KW-Klick legt den Wochen-Eintrag an (einziges Wochen-Journal, ohne
      // Vorlage) und öffnet ihn.
      const week = periodOf(Date.now(), 'week');
      const weekRel = resolveEntryPath(
        { folderPattern: 'Journal/{{date::yyyy}}', namePattern: '{{date::kkkk-KWww}}' },
        week,
      ).relPath;
      await cal.locator(`.calendar-week-btn[title="${week.key}"]`).click();
      const weekTarget = path.join(areaRoot, ...weekRel.split('/'));
      await expect
        .poll(() => (fs.existsSync(weekTarget) ? fs.readFileSync(weekTarget, 'utf8') : null))
        .toContain('journal-start-date:');

      // Monats-Blättern ändert das Label.
      const label = (await cal.locator('.calendar-month-label').textContent()) || '';
      await cal.locator('.calendar-prev').click();
      await expect(cal.locator('.calendar-month-label')).not.toHaveText(label);
      // Heute-Knopf springt zurück zum aktuellen Monat.
      await cal.locator('.calendar-today-btn').click();
      await expect(cal.locator('.calendar-month-label')).toHaveText(label);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });

  test('ohne Bereich zeigt das Panel den lokalisierten Hinweis', async () => {
    const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-docs-'));
    const startDoc = path.join(docsDir, 'Start.md');
    fs.writeFileSync(startDoc, '# Start\n', 'utf8');
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-profile-'));
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({}));
    const { app, page } = await launchApp({ args: [startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      // Klick pollen: der Statusbar-Toggle wird erst im asynchronen init()
      // verdrahtet (Muster pressUntilVisible).
      const cal = page.locator(CAL);
      await expect
        .poll(async () => {
          if (!(await cal.isVisible())) await page.locator('#btn-calendar').click();
          return cal.isVisible();
        })
        .toBe(true);
      await expect(cal.locator('.calendar-empty')).toBeVisible();
      await expect(cal.locator('.calendar-main')).toBeHidden();
    } finally {
      await closeApp(app, userData);
      cleanupDir(docsDir);
    }
  });
});

// --- 4T-0435 (Epic 3E-0081): Journal-Navigations-Block ----------------------------

test.describe('JR-06: Navigations-Block — Periode, Eltern-Sprung, Hinweis (F-103)', () => {
  test('zeigt die Periode, springt auf das Wochen-Journal und legt an', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      // Heutigen Eintrag anlegen (Vorlage trägt den Navigations-Fence).
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Der Block zeigt die aktuelle Tages-Periode („Heute") und als
      // übergeordnete Periode das Wochen-Journal des Regals.
      const nav = page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
      await expect(nav).toBeVisible();
      await expect(nav.locator('.journal-nav-sub')).toHaveText('Heute');
      const week = periodOf(Date.now(), 'week');
      const weekLabel = `KW ${Number(week.key.split('-W')[1])}`;
      const parentLink = nav.locator('.journal-nav-parents .journal-nav-link', {
        hasText: weekLabel,
      });
      await expect(parentLink).toBeVisible();

      // Eltern-Klick legt den fehlenden Wochen-Eintrag an und öffnet ihn.
      const weekRel = resolveEntryPath(
        { folderPattern: 'Journal/{{date::yyyy}}', namePattern: '{{date::kkkk-KWww}}' },
        week,
      ).relPath;
      await parentLink.click();
      const weekTarget = path.join(areaRoot, ...weekRel.split('/'));
      await expect
        .poll(() => (fs.existsSync(weekTarget) ? fs.readFileSync(weekTarget, 'utf8') : null))
        .toContain('journal-start-date:');
      await expect(page.locator(SEL.activeTab0)).toContainText('KW');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });

  test('außerhalb eines Journal-Eintrags erscheint der Hinweis', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const notiz = path.join(areaRoot, 'Notiz.md');
    fs.writeFileSync(notiz, '# Notiz\n\n```perspective-journal-nav\n```\n', 'utf8');
    const { app, page } = await launchApp({ args: [notiz], userData });
    try {
      const nav = page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
      await expect(nav.locator('.journal-nav-hint')).toBeVisible();
      await expect(nav.locator('.journal-nav-label')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});

// --- 4T-0436 (Epic 3E-0081): Einstellungs-Bereich Journale ------------------------

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

test.describe('JR-07: Einstellungen — Journal anlegen, Vorschau, sofort wirksam (F-103)', () => {
  test('Regal und Journal über die Einstellungs-Seite; Bereichsdatei und Kommando wirken', async () => {
    // Frischer Bereich OHNE journals-Sektion: alles läuft über die UI.
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-area-'));
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      // Einstellungs-Seite öffnen und den Journale-Bereich aktivieren
      // (Poll wie vorlagen.spec.js; der Konfigurations-Stand lädt asynchron).
      await expect
        .poll(async () => {
          if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
            await page.keyboard.press('Control+,');
          }
          return page.locator(SETTINGS_PAGE).isVisible();
        })
        .toBe(true);
      await page.locator('.settings-nav-entry[data-section-id="journals"]').click();
      await expect(page.locator('#settings-journals-shelf-add')).toBeVisible();

      // Regal anlegen ('change' feuert beim Verlassen des Felds).
      await page.locator('#settings-journals-shelf-add').click();
      await page.locator('#settings-journals-shelf-name-0').fill('Tagebuch');
      await page.keyboard.press('Tab');

      // Zweistufige Navigation (PO-Befund 0.55.0): Regal öffnen — die
      // Detailansicht zeigt die Journale dieses Regals.
      await page.locator('#settings-journals-shelf-open-0').click();
      await expect(page.locator('#settings-journals-shelf-close')).toBeVisible();

      // Journal anlegen: Name und Ordner-Schema; Regal ist aus der
      // Detailansicht vorbelegt, Granularität Tag und {{date}} sind Defaults.
      await page.locator('#settings-journals-add').click();
      await expect(page.locator('#settings-journals-shelf-0')).toHaveValue('Tagebuch');
      await page.locator('#settings-journals-name-0').fill('Tag');
      await page.locator('#settings-journals-folder-0').fill('Journal/{{date::yyyy}}');

      // Live-Vorschau zeigt den aufgelösten Beispiel-Pfad von heute.
      const today = isoToday();
      await expect(page.locator('#settings-journals-preview-0')).toContainText(
        `Journal/${today.slice(0, 4)}/${today}.md`,
      );

      // „Regal schließen" führt zurück zur Übersicht (mit Journal-Zähler).
      await page.locator('#settings-journals-shelf-close').click();
      await expect(page.locator('#settings-journals-shelf-open-0')).toBeVisible();
      await expect(page.locator('.settings-journals-shelf').first()).toContainText('1');

      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      // Die Bereichsdatei trägt die journals-Sektion (Regal plus Journal).
      const mdda = path.join(areaRoot, 'Area_Settings.mdda');
      const parsed = await warteAufJson(mdda);
      expect(parsed.settings.journals.shelves).toEqual(['Tagebuch']);
      expect(parsed.settings.journals.journals).toHaveLength(1);
      expect(parsed.settings.journals.journals[0]).toMatchObject({
        id: 'tag',
        name: 'Tag',
        shelf: 'Tagebuch',
        granularity: 'day',
        folderPattern: 'Journal/{{date::yyyy}}',
        namePattern: '{{date}}',
      });

      // Wirkt ohne Neustart: das Heute-Kommando legt den Eintrag an.
      const target = path.join(areaRoot, 'Journal', today.slice(0, 4), `${today}.md`);
      // 4T-0757: auf den Inhalt warten, nicht auf die blosse Existenz — die
      // Datei entsteht vor ihrem Inhalt, und unter Voll-Last fiel das Lesen
      // in diese Luecke (leerer String, Fehlschlag im Release-Lauf 0.94.0).
      await expect
        .poll(async () => {
          if (!fs.existsSync(target)) await page.keyboard.press('Control+Alt+7');
          return leseTextOderNull(target);
        })
        .toContain(`journal-date: ${today}`);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});

test.describe('JR-03: Datum-Kommando — Datums-Dialog und Journal-Auswahl (F-103/S-075)', () => {
  test('legt den Wochen-Eintrag ohne Vorlage mit Start-/End-Property an', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);

      // Datums-Dialog: vorbelegt mit heute, auf ein festes Datum setzen.
      const nameModal = page.locator('#name-input-modal');
      await pressUntilVisible(page, 'Control+Alt+6', nameModal);
      await expect(page.locator('#name-input-field')).toHaveValue(isoToday());
      await page.locator('#name-input-field').fill('2026-01-07');
      await page.locator('#btn-name-input-ok').click();

      // Journal-Auswahl über alle Journale des Bereichs.
      await expect(page.locator('#template-select-modal')).toBeVisible();
      await page.locator('#template-select-list button', { hasText: 'Woche — Tagebuch' }).click();

      // Wochen-Eintrag: ISO-KW 2 (2026-01-05 bis 2026-01-11), ohne Vorlage
      // nur die Frontmatter-Properties.
      const target = path.join(areaRoot, 'Journal', '2026', '2026-KW02.md');
      await expect
        .poll(() => (fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null))
        .toContain('journal-start-date: 2026-01-05');
      const content = fs.readFileSync(target, 'utf8');
      expect(content).toContain('journal-end-date: 2026-01-11');
      await expect(page.locator(SEL.activeTab0)).toContainText('2026-KW02');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });
});
