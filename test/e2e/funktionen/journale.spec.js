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
// 4T-0777 (Epic 3E-0156): Wiederhol-Helfer, hier entstanden und seither geteilt.
const { pressUntilVisible } = require('../helpers/eingabe');
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
// 4T-1325 (Epic 3E-0236): `ansichtsModus` setzt den Standard-Ansichtsmodus des
// Profils (Muster block-abfrage.spec.js). Der Szenario-Fall braucht ihn, weil
// ein nachtraeglicher Modus-Wechsel die Live-Bloecke neu aufbaut und damit
// genau den Zustand aufloest, den er nachstellen soll.
function makeUserData(templatesFolder, ansichtsModus) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-journale-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      templates: { folder: templatesFolder },
      hotkeys: {
        'journal.openToday': 'Ctrl+Alt+7',
        'journal.openForDate': 'Ctrl+Alt+6',
      },
      ...(ansichtsModus ? { app: { defaultViewMode: ansichtsModus } } : {}),
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

  // 4T-1311 (Epic 3E-0235): Die Pfeile blaettern im selben Reiter.
  test('die Pfeile wechseln im selben Reiter und behalten den Ansichts-Modus', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      const nav = page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
      await expect(nav).toBeVisible();
      // Ausgangslage festhalten: ein Reiter, geteilte Ansicht, Beschriftung.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:viewChange', 'split');
      });
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Der Reiter-Titel traegt neben dem Namen die Schliess-Flaeche; verglichen
      // wird deshalb der Dateiname aus dem Merkzettel, nicht der ganze Text.
      const nameDesReiters = async () => {
        const titel = await page.locator(SEL.activeTab0).getAttribute('title');
        return path.basename(String(titel || ''));
      };
      const vorher = await nameDesReiters();

      // Rueckwaerts blaettern: derselbe Reiter zeigt den Vortag.
      await nav.locator('.journal-nav-arrow').first().click();
      await expect.poll(nameDesReiters).not.toBe(vorher);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Der Ansichts-Modus des Reiters ist erhalten: die geteilte Ansicht
      // zeigt Editor und gesetzten Text nebeneinander.
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Vorwaerts blaettern fuehrt zurueck, weiterhin ohne zweiten Reiter.
      await nav.locator('.journal-nav-arrow').last().click();
      await expect.poll(nameDesReiters).toBe(vorher);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });

  // 4T-1325 (Epic 3E-0236): Regressionstest zum Befund des Product Owners vom
  // 2026-08-31 an der ausgelieferten 1.122.0. Der Block behielt nach einem
  // Wechsel des Reiter-Inhalts den Dateipfad des vorherigen Eintrags und nannte
  // weiter dessen Periode — samt Kalenderwoche und der Zeile «Heute».
  //
  // Warum ein eigener Fall neben dem Blaetter-Test darueber: Jener prueft den
  // Reiter-NAMEN, und der war die ganze Zeit richtig. Falsch war, was der Block
  // SAGT. Genau diese Luecke liess den Fehler bis in die Auslieferung reisen,
  // und deshalb prueft dieser Fall die Beschriftung selbst.
  test('nach dem Wechsel nennt der Block die Periode des angezeigten Eintrags', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Der Live-Modus ist der Ort des Befunds und zugleich der einzige, an dem
      // er auftritt: Dort baut ein StateField die Bloecke und liest den Pfad aus
      // dem Editor-Zustand. Die gesetzte Ansicht bekommt ihn direkt vom Aufrufer
      // und war nie betroffen — ein Fall gegen sie wuerde nichts beweisen.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:viewChange', 'live');
      });
      const nav = page.locator('.cm-editor .perspective-journal-nav');
      await expect(nav).toBeVisible();
      await expect(nav.locator('.journal-nav-sub')).toHaveText('Heute');

      // Verglichen wird die Tages-Zahl: Der Reiter traegt sie im Dateinamen,
      // die Beschriftung des Blocks in sprachabhaengiger Form. Die Zahl ist
      // der gemeinsame Nenner, der ohne Locale-Annahme auskommt.
      const tagDesReiters = async () => {
        const titel = await page.locator(SEL.activeTab0).getAttribute('title');
        const treffer = path.basename(String(titel || '')).match(/\d{4}-\d{2}-(\d{2})/);
        return treffer ? Number(treffer[1]) : null;
      };
      const tagImBlock = async () => {
        const text = await nav.locator('.journal-nav-label').textContent();
        const treffer = String(text || '').match(/\d+/);
        return treffer ? Number(treffer[0]) : null;
      };
      const heute = await tagDesReiters();
      await expect.poll(tagImBlock).toBe(heute);

      // Rueckwaerts blaettern: Der Block muss den Vortag nennen. Ohne die
      // Behebung nannte er hier unveraendert den heutigen Tag, weil die
      // Block-Widgets mit dem Pfad des vorherigen Eintrags gebaut wurden.
      await nav.locator('.journal-nav-arrow').first().click();
      await expect.poll(tagDesReiters).not.toBe(heute);
      const vortag = await tagDesReiters();
      await expect.poll(tagImBlock).toBe(vortag);
      // Und die Zusatzzeile «Heute» gehoert zum heutigen Eintrag, nicht hierher.
      await expect(nav.locator('.journal-nav-sub')).toHaveCount(0);

      // Vorwaerts zurueck: wieder der heutige Eintrag samt Zusatzzeile.
      await nav.locator('.journal-nav-arrow').last().click();
      await expect.poll(tagDesReiters).toBe(heute);
      await expect.poll(tagImBlock).toBe(heute);
      await expect(nav.locator('.journal-nav-sub')).toHaveText('Heute');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });

  // 4T-1325 (Epic 3E-0236): Regressionstest des GEMELDETEN Ablaufs — zwei
  // Journal-Eintraege in zwei Reitern, beide im Live-Modus, Wechsel per Klick.
  //
  // Beide Eintraege existieren bereits — wie beim Product Owner, dessen
  // Sitzungs-Wiederherstellung bestehende Dateien oeffnete. Das ist mehr als
  // Szenario-Treue: Ein Eintrag, der beim Oeffnen erst entsteht, durchlaeuft
  // den Cursor-Sprung seiner Vorlage, und dessen Selektions-Transaktion baut
  // die Widgets des GEOEFFNETEN Reiters mit dem dann schon richtigen Pfad neu
  // (instrumentiert gemessen am 2026-08-31: Signatur-Rebuild ~15 ms nach dem
  // Doc-Tausch). Bestehende Eintraege haben diesen Heiler nicht, und die
  // Rueck-Richtung eines Klick-Wechsels hat ihn nie. Am unbehobenen Stand
  // belegt: Der Doc-Tausch baut die Widgets mit dem Pfad des VORHERIGEN
  // Reiters, die nachfolgende Pfad-Transaktion loest keinen Neuaufbau aus,
  // und ueber acht Sekunden Beobachtung heilt keine spaetere Transaktion.
  test('zwei bestehende Eintraege: jeder Reiter zeigt die Periode seines eigenen Eintrags', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    // Beide Reiter oeffnen sich direkt im Live-Modus; ein nachtraeglicher
    // Modus-Wechsel wuerde die Bloecke neu bauen und den Fehler verdecken.
    const userData = makeUserData(templatesDir, 'live');
    // BEIDE Eintraege vorab auf der Platte anlegen (ohne Cursor-Marker) —
    // siehe Kommentar oben, daran haengt die Reproduktion.
    const eintrag = (iso) =>
      `---\njournal-date: ${iso}\n---\n\n# ${iso}\n\n\`\`\`perspective-journal-nav\n\`\`\`\n\nText ${iso}\n`;
    const heute = isoToday();
    fs.mkdirSync(path.join(areaRoot, 'Journal', heute.slice(0, 4)), { recursive: true });
    fs.mkdirSync(path.join(areaRoot, 'Journal', '2026'), { recursive: true });
    fs.writeFileSync(
      path.join(areaRoot, 'Journal', heute.slice(0, 4), `${heute}.md`),
      eintrag(heute),
    );
    fs.writeFileSync(
      path.join(areaRoot, 'Journal', '2026', '2026-01-07.md'),
      eintrag('2026-01-07'),
    );
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);

      // Reiter 1: der heutige Eintrag (existiert, wird nur geoeffnet).
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();

      // Reiter 2: ein fester, weit entfernter Tag ueber das Datums-Kommando
      // (existiert ebenfalls — kein Anlage-Weg, kein Cursor-Sprung).
      const nameModal = page.locator('#name-input-modal');
      await pressUntilVisible(page, 'Control+Alt+6', nameModal);
      await page.locator('#name-input-field').fill('2026-01-07');
      await page.locator('#btn-name-input-ok').click();
      await expect(selectModal).toBeVisible();
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      const nav = page.locator('.cm-editor .perspective-journal-nav');
      const tagImBlock = async () => {
        const text = await nav
          .locator('.journal-nav-label')
          .textContent()
          .catch(() => null);
        const treffer = String(text || '').match(/\d+/);
        return treffer ? Number(treffer[0]) : null;
      };

      // Der zweite Reiter muss den 7. Januar nennen. Ohne die Behebung trugen
      // die Bloecke den Pfad des ERSTEN Reiters — genau der gemeldete Befund;
      // die Plausibilitaets-Pruefung zeigte dann die Fehlermeldung statt der
      // Beschriftung, und dieser Abgleich wird rot.
      await expect(page.locator(SEL.activeTab0)).toContainText('2026-01-07');
      await expect.poll(tagImBlock).toBe(7);

      // Zurueck auf den ersten Reiter: wieder der heutige Eintrag samt
      // Zusatzzeile. Die Gegenrichtung gehoert dazu, weil ein Fix, der nur
      // einmal nachzieht, hier gruen waere und im Alltag durchfiele.
      await page.locator(SEL.tabs0).nth(0).click();
      await expect(page.locator(SEL.activeTab0)).not.toContainText('2026-01-07');
      await expect(nav.locator('.journal-nav-sub')).toHaveText('Heute');
      await expect.poll(tagImBlock).toBe(new Date().getDate());
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });

  // 4T-1311 (Epic 3E-0235): Anlage des fehlenden Nachbar-Eintrags (AK5),
  // Nachzug der Titelzeile (AK7) und Sitzungs-Ablage ueber den Neustart (AK8).
  // Die drei haengen an derselben Stelle: ersetzeTabDurchDatei liest die Datei
  // ueber denselben Weg wie das Oeffnen und ruft danach activateTab, das
  // Editor, Titelzeile, Panels und Sitzungs-Ablage nachzieht. Ein Test statt
  // dreier, weil der Neustart die teure Zutat ist und die Anlage ohnehin
  // vorausgeht.
  test('das Blaettern legt den fehlenden Eintrag an, zieht die Titelzeile nach und ueberlebt den Neustart', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const erste = await launchApp({ userData });
    try {
      await bindArea(erste.page, areaRoot);
      const selectModal = erste.page.locator('#template-select-modal');
      await pressUntilVisible(erste.page, 'Control+Alt+7', selectModal);
      await erste.page
        .locator('#template-select-list button', { hasText: 'Tag — Tagebuch' })
        .click();
      await expect(erste.page.locator(SEL.editorContent0)).toBeVisible();

      // Der Vortag aus demselben Perioden-Kern, den die App nutzt. Die Uhrzeit
      // steht auf Mittag, damit eine Zeitumstellung den Tages-Sprung nicht
      // verschluckt.
      const mittagGestern = new Date();
      mittagGestern.setHours(12, 0, 0, 0);
      mittagGestern.setDate(mittagGestern.getDate() - 1);
      const vortag = periodOf(mittagGestern.getTime(), 'day');
      const vortagRel = resolveEntryPath(
        { folderPattern: 'Journal/{{date::yyyy}}', namePattern: '{{date}}' },
        vortag,
      ).relPath;
      const vortagAbs = path.join(areaRoot, ...vortagRel.split('/'));
      const vortagName = path.basename(vortagRel, '.md');
      expect(fs.existsSync(vortagAbs)).toBe(false);

      // Geteilte Ansicht: der Navigations-Block ist sichtbar, und die
      // Titelzeile der Quelltext-Seite ist die aktive Instanz (TZ-01).
      await erste.app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:viewChange', 'split');
      });
      const nav = erste.page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
      await expect(nav).toBeVisible();
      await nav.locator('.journal-nav-arrow').first().click();

      // AK5: der fehlende Eintrag entsteht wie beim Oeffnen, mit Vorlage.
      await expect
        .poll(() => (fs.existsSync(vortagAbs) ? fs.readFileSync(vortagAbs, 'utf8') : null))
        .toContain('perspective-journal-nav');
      // AK7: die Titelzeile zeigt den neuen Eintrag, nicht den bisherigen.
      await expect(erste.page.locator(SEL.titleLineSourceText0)).toHaveText(vortagName);

      // AK8: sauber beenden (before-quit schreibt die Sitzung), neu starten.
      await erste.app.evaluate(({ app }) => app.quit());
      await erste.app.waitForEvent('close');
      const zweite = await launchApp({ userData });
      try {
        await expect(zweite.page.locator(SEL.tabs0)).toHaveCount(1);
        // Der Reiter-Titel traegt die Endung, die Titelzeile nicht.
        await expect(zweite.page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(
          path.basename(vortagRel),
        );
      } finally {
        await closeApp(zweite.app, null);
      }
    } finally {
      await closeApp(erste.app, userData);
      cleanupDir(areaRoot);
      cleanupDir(templatesDir);
    }
  });

  // 4T-1311: Der Eltern-Sprung bleibt beim eigenen Reiter (Entscheidung E1).
  test('der Sprung auf die uebergeordnete Periode oeffnet weiterhin einen eigenen Reiter', async () => {
    const areaRoot = makeArea();
    const templatesDir = makeTemplatesDir();
    const userData = makeUserData(templatesDir);
    const { app, page } = await launchApp({ userData });
    try {
      await bindArea(page, areaRoot);
      const selectModal = page.locator('#template-select-modal');
      await pressUntilVisible(page, 'Control+Alt+7', selectModal);
      await page.locator('#template-select-list button', { hasText: 'Tag — Tagebuch' }).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const nav = page.locator(`${SEL.markdownBody0} .perspective-journal-nav`);
      await expect(nav).toBeVisible();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await nav.locator('.journal-nav-parents .journal-nav-link').first().click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
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
