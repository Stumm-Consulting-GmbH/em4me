// 4T-000759 (Epic 3E-000142): Suchergebnis-Panel — beide Bedien-Zugaenge und
// die Leerzustaende.
//
// Geprueft wird hier das Panel als solches (Paritaets-Konvention: Statusbar
// und Ansichtsmenue). Die Treffer selbst kommen mit der Anbindung an die
// Suchleiste in 4T-000760 und werden dort geprueft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PANEL = '.pane-group[data-pane="0"] .sidebar-searchresults';

// Deterministisches Ready-Signal: Erst mit der geladenen Datei verlaesst die
// App den Empty-State, in dem die Sidebar zugeklappt ist. Ein Klick davor
// setzt zwar den Schalter, das Panel bleibt aber unsichtbar und faellt beim
// naechsten Sidebar-Aufbau hinter den aktiven Reiter seiner Gruppe zurueck.
async function warteAufDokument(page) {
  await expect(page.locator(SEL.markdownBody0).getByText('Suchpanel-Test')).toBeVisible();
}

// Eine offene Datei, damit die Sidebar ueberhaupt sichtbar ist; im
// Empty-State ist sie zugeklappt (das gilt fuer alle Panels).
function makeWorkFile() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-such-panel-'));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, '# Suchpanel-Test\n\nInhalt.\n', 'utf8');
  return workFile;
}

test.describe('SP-01: Suchergebnis-Panel öffnen', () => {
  test('Statusbar-Schalter blendet das Panel ein und wieder aus', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufDokument(page);
      const panel = page.locator(PANEL);
      const btn = page.locator('#btn-search-results');
      await expect(btn).toHaveCount(1);
      await expect(panel).toBeHidden();

      await btn.click();
      await expect(panel).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');

      await btn.click();
      await expect(panel).toBeHidden();
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SP-02: Leerzustand ohne Suchbegriff', () => {
  test('das frisch geöffnete Panel nennt den Grund statt leer zu bleiben', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({ args: [makeWorkFile()] });
    try {
      await warteAufDokument(page);
      await page.locator('#btn-search-results').click();
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      // Status-Zeile traegt einen Text (Leerzustand), die Trefferliste ist leer.
      const status = panel.locator('.search-results-status');
      await expect(status).not.toBeEmpty();
      await expect(panel.locator('.search-results-item')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002125: Sprachwechsel bei offener Seitenleiste. Die Reiter einer Gruppe
// entstehen per Skript und blieben in der alten Sprache, ebenso die
// Status-Zeile der Trefferliste. Erwartet: neue Sprache, ohne dass aktiver
// Reiter, Treffer oder Inhalt verloren gehen.
const DE = require('../../../src/i18n/de.json');
const EN = require('../../../src/i18n/en.json');
const PANE0 = '.pane-group[data-pane="0"]';
const SPRACH_BEGRIFF = 'Holunderblüte';

function makeSprachBereich() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2125-sprache-'));
  fs.writeFileSync(path.join(dir, 'start.md'), `# Start\n\n${SPRACH_BEGRIFF} hier.\n`, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'zweite.md'),
    `# Zweite\n\n${SPRACH_BEGRIFF} und ${SPRACH_BEGRIFF}.\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'dritte.md'), `# Dritte\n\n${SPRACH_BEGRIFF}.\n`, 'utf8');
  return dir;
}

// Reiter der Spalte 0 als Abbildung Panel -> Beschriftung, dazu der aktive.
function reiter(page) {
  return page.evaluate((pane) => {
    const p = document.querySelector(pane);
    const titel = {};
    const aktiv = [];
    for (const b of p.querySelectorAll('.sidebar-slot-tab')) {
      titel[b.dataset.panelId] = { text: b.textContent.trim(), title: b.title };
      if (b.classList.contains('active')) aktiv.push(b.dataset.panelId);
    }
    const knopf = p.querySelector('.sidebar-collapse-toggle');
    return { titel, aktiv: aktiv.sort(), einklappen: knopf ? knopf.title : null };
  }, PANE0);
}

async function pruefeSprache(page, katalog, anzahl) {
  const titel = (k) => ({ text: katalog[k], title: katalog[k] });
  // Mit dem Bereich öffnet sich dessen Panel in der Ort-Gruppe; es ist ein
  // weiterer Reiter derselben Bauart und wird mitgeprüft.
  await expect
    .poll(async () => (await reiter(page)).titel)
    .toEqual({
      area: titel('areaPanel.title'),
      outline: titel('outline.title'),
      searchresults: titel('searchResults.title'),
      calendar: titel('calendar.title'),
    });
  const stand = await reiter(page);
  expect(stand.aktiv).toEqual(['area', 'calendar', 'searchresults']);
  if (stand.einklappen !== null) expect(stand.einklappen).toBe(katalog['sidebar.collapse.tooltip']);
  const status = katalog['searchResults.countFiles'].replace('{n}', '4').replace('{g}', '3');
  await expect(page.locator(`${PANEL} .search-results-status`)).toHaveText(status);
  await expect(page.locator(`${PANEL} .search-results-item`)).toHaveCount(anzahl);
}

test.describe('SP-03: Sprachwechsel bei offener Trefferliste (4T-002125)', () => {
  test('4T-002125: Reiter der Gruppen und Status-Zeile wechseln die Sprache, aktiver Reiter und Treffer bleiben', async () => {
    test.setTimeout(120000);
    const dir = makeSprachBereich();
    const { app, page, userData } = await launchApp({
      settings: {
        language: 'de',
        outline: { visibleColumn0: true },
        calendar: { visibleColumn0: true },
        searchResults: { visibleColumn0: true },
      },
    });
    try {
      // Erst den Bereich binden, dann die Datei öffnen: Ein Fenster mit offener
      // Datei übernimmt keinen Bereich, sondern öffnet ihn in einer neuen App.
      const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(res.boundExisting).toBe(true);
      await hauptSenden(
        app,
        ({ BrowserWindow }, datei) => {
          BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [datei]);
        },
        path.join(dir, 'start.md'),
      );
      await expect(page.locator(SEL.markdownBody0).getByText(SPRACH_BEGRIFF)).toBeVisible();
      // Ohne Suchbegriff läuft beim Sprachwechsel keine Suche neu; die
      // Status-Zeile wechselt nur, wenn das Panel sich selbst neu zeichnet.
      const status = page.locator(`${PANEL} .search-results-status`);
      await expect(status).toHaveText(DE['searchResults.noQuery']);
      await page.locator('#lang-select').selectOption('en');
      await expect(status).toHaveText(EN['searchResults.noQuery']);
      await page.locator('#lang-select').selectOption('de');
      await expect(status).toHaveText(DE['searchResults.noQuery']);
      await page.keyboard.press('Control+f');
      await page.locator('#search-input').fill(SPRACH_BEGRIFF);
      await expect(page.locator('#search-scope')).toHaveText(/Bereich/i);
      await expect(page.locator(`${PANEL} .search-results-item`)).toHaveCount(4);
      await pruefeSprache(page, DE, 4);

      await page.locator('#lang-select').selectOption('en');
      await pruefeSprache(page, EN, 4);

      await page.locator('#lang-select').selectOption('de');
      await pruefeSprache(page, DE, 4);
    } finally {
      await closeApp(app, userData, { force: true });
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // Temp-Verzeichnis bleibt liegen; unkritisch.
      }
    }
  });
});

test.describe('SP-04: Symbol-Überschriften beim Sprachwechsel (4T-002125)', () => {
  test('4T-002125: Symbol bleibt Symbol, Kurzhinweis und Vorlese-Text wechseln die Sprache', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({
      args: [makeWorkFile()],
      settings: {
        language: 'de',
        sidebar: { iconHeadings: true },
        outline: { visibleColumn0: true },
        notes: { visibleColumn0: true },
      },
    });
    const koepfe = () =>
      page.evaluate((pane) => {
        const p = document.querySelector(pane);
        const k = (el) => ({
          text: el.textContent.trim(),
          symbol: !!el.querySelector('svg'),
          title: el.title,
          aria: el.getAttribute('aria-label'),
        });
        return {
          notizen: k(p.querySelector('.sidebar-notes .sidebar-section-title')),
          inhalt: k(p.querySelector('.sidebar-slot-tab[data-panel-id="outline"]')),
        };
      }, PANE0);
    const erwartet = (katalog) => ({
      notizen: {
        text: '',
        symbol: true,
        title: katalog['notes.title'],
        aria: katalog['notes.title'],
      },
      inhalt: {
        text: '',
        symbol: true,
        title: katalog['outline.title'],
        aria: katalog['outline.title'],
      },
    });
    try {
      await warteAufDokument(page);
      await expect.poll(koepfe).toEqual(erwartet(DE));
      await page.locator('#lang-select').selectOption('en');
      await expect.poll(koepfe).toEqual(erwartet(EN));
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-002129: Panels, die eigene Texte per Skript zeichnen, blieben nach dem
// Sprachwechsel in der alten Sprache (gemessen bei vierzehn offenen Panels,
// Deutsch nach Englisch). Erwartet: jeder dieser Texte in der neuen Sprache,
// in beide Richtungen — ohne dass ein Panel Inhalt, Auswahl, Eingabe, Fokus
// oder Roll-Lage verliert.
function makeSprachProbe({ ueberschriften = 0, mitDaten = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-4t2129-panels-'));
  const z = ['---', 'status: offen', '---', '# Suchpanel-Test', '', 'Inhalt mit #probe.', ''];
  for (let i = 1; i <= ueberschriften; i++) {
    z.push(`## Abschnitt ${i}`, '', `Absatz ${i} mit #schlagwort${i}.`, '');
  }
  if (mitDaten) z.push('Ein Absatz mit Anker. ^abc', '');
  const datei = path.join(dir, 'arbeit.md');
  fs.writeFileSync(datei, z.join('\n'), 'utf8');
  if (mitDaten) {
    const mdd = {
      schemaVersion: 1,
      history: { anchors: [], packets: [] },
      blockData: { abc: { values: { prio: 'hoch' }, updated: '2026-07-07T00:00:00Z' } },
    };
    fs.writeFileSync(path.join(dir, 'arbeit.mdd'), JSON.stringify(mdd), 'utf8');
  }
  return datei;
}

// Die eigenen Texte der Panels, gelesen aus dem DOM (auch im verborgenen Reiter).
function panelTexte(page) {
  return page.evaluate((pane) => {
    const p = document.querySelector(pane);
    const text = (sel) => {
      const el = p.querySelector(sel);
      return el ? el.textContent.trim() : null;
    };
    const editor = p.querySelector('.sidebar-notes .cm-content');
    const optionen = p.querySelectorAll('.sidebar-filegraph .filegraph-direction option');
    return {
      erinnerungen: text('.sidebar-reminders .reminders-status'),
      richtungen: Array.from(optionen).map((o) => o.textContent),
      notizPlatzhalter: text('.sidebar-notes .cm-placeholder'),
      notizVorlese: editor ? editor.getAttribute('aria-placeholder') : null,
      karten: text('.sidebar-canvaslist .canvas-liste-status'),
      anker: text('.sidebar-blockprops .block-props-anchor-select option'),
      ankerDoppelt: text('.sidebar-blockprops .block-props-duplicate'),
    };
  }, PANE0);
}

const erwartetePanelTexte = (k) => ({
  erinnerungen: k['reminders.panel.noArea'],
  richtungen: [k['graph.direction.both'], k['graph.direction.in'], k['graph.direction.out']],
  notizPlatzhalter: k['notes.placeholder'],
  notizVorlese: k['notes.placeholder'],
  karten: k['canvas.keineFence'],
  anker: k['blockProps.noAnchorsInFile'],
  // Der Hinweis trägt keinen Platzhalter; die gemeldete «Duplicate anchor: on»
  // war eine nach 260 Zeichen abgeschnittene Messung.
  ankerDoppelt: k['blockProps.duplicateHint'],
});

test.describe('SP-05: eigene Texte der Panels beim Sprachwechsel (4T-002129)', () => {
  test('4T-002129: Erinnerungen, Datei-Graph, Notizen, Canvas-Liste und Block-Eigenschaften wechseln in beide Richtungen; die Graph-Auswahl bleibt', async () => {
    test.setTimeout(120000);
    const s = { visibleColumn0: true };
    const { app, page, userData } = await launchApp({
      args: [makeSprachProbe()],
      settings: {
        language: 'de',
        remindersPanel: s,
        fileGraph: s,
        notes: s,
        canvasList: s,
        blockProps: s,
      },
    });
    try {
      await warteAufDokument(page);
      await expect.poll(() => panelTexte(page)).toEqual(erwartetePanelTexte(DE));
      const richtung = page.locator(`${PANE0} .sidebar-filegraph .filegraph-direction`);
      await reiterKlick(page, 'filegraph');
      await richtung.selectOption('in');
      await page.locator('#lang-select').selectOption('en');
      await expect.poll(() => panelTexte(page)).toEqual(erwartetePanelTexte(EN));
      await expect(richtung).toHaveValue('in');
      await page.locator('#lang-select').selectOption('de');
      await expect.poll(() => panelTexte(page)).toEqual(erwartetePanelTexte(DE));
      await expect(richtung).toHaveValue('in');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// Wechsel aus dem zweiten Fenster: Der Fokus bleibt im ersten, wo der Anwender
// gerade schreibt (die Sprach-Auswahl im selben Fenster nähme ihn mit).
async function zweitesFenster(app, page) {
  const kommt = app.waitForEvent('window');
  await page.evaluate(() => window.api.openNewWindow([], null));
  const page2 = await kommt;
  await page2.waitForLoadState('domcontentloaded');
  return async (code) => {
    await page2.evaluate((c) => window.api.setSetting('language', c), code);
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(code);
    // Das Neuzeichnen der Spalten läuft dem Wechsel nach; erst danach messen.
    await page.waitForTimeout(800);
  };
}

// Holt ein Panel nach vorn: Steht es in einer Reiter-Gruppe, wird sein Reiter
// gewählt; ein Panel ohne Gruppe ist ohnehin zu sehen.
async function reiterKlick(page, id) {
  const reiter = page.locator(`${PANE0} .sidebar-slot-tab[data-panel-id="${id}"]`);
  if (await reiter.count()) await reiter.click();
}

function rollLage(page, cls, wert) {
  return page.evaluate(
    ([pane, c, v]) => {
      const body = document.querySelector(`${pane} .sidebar-${c} .sidebar-section-body`);
      if (v !== null) body.scrollTop = v;
      return Math.round(body.scrollTop);
    },
    [PANE0, cls, wert],
  );
}

function fokusIn(page, sel) {
  return page.evaluate((s) => !!document.activeElement.closest(s), `${PANE0} ${sel}`);
}

test.describe('SP-06: Eingabe, Fokus und Roll-Lage beim Sprachwechsel (4T-002129)', () => {
  // Gemessen wird je Panel, solange es zu sehen ist: Ein verborgener Reiter
  // hat keine Roll-Lage, die sich prüfen ließe.
  test('4T-002129: Inhaltsverzeichnis und Tags behalten ihre Roll-Lage', async () => {
    test.setTimeout(120000);
    const s = { visibleColumn0: true };
    const { app, page, userData } = await launchApp({
      args: [makeSprachProbe({ ueberschriften: 60 })],
      settings: { language: 'de', outline: s, tags: s },
    });
    try {
      await warteAufDokument(page);
      const sprache = await zweitesFenster(app, page);
      await reiterKlick(page, 'outline');
      await expect.poll(() => rollLage(page, 'outline', 800)).toBe(800);
      await sprache('en');
      expect(await rollLage(page, 'outline', null)).toBe(800);
      await reiterKlick(page, 'tags');
      await expect(page.locator(`${PANE0} .sidebar-tags .tags-tree-item`)).toHaveCount(61);
      await expect.poll(() => rollLage(page, 'tags', 300)).toBe(300);
      await sprache('de');
      expect(await rollLage(page, 'tags', null)).toBe(300);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('4T-002129: Notiz-Eingabe und Eigenschafts-Feld behalten Inhalt und Fokus', async () => {
    test.setTimeout(120000);
    const s = { visibleColumn0: true };
    const { app, page, userData } = await launchApp({
      args: [makeSprachProbe()],
      // Ohne Vorschau-Vorbelegung ist das Notiz-Feld beim Öffnen beschreibbar.
      settings: { language: 'de', notes: { ...s, previewByDefault: false }, properties: s },
    });
    try {
      await warteAufDokument(page);
      const sprache = await zweitesFenster(app, page);
      const notiz = page.locator(`${PANE0} .sidebar-notes .cm-content`);
      await reiterKlick(page, 'notes');
      await notiz.click();
      await page.keyboard.type('Laufende Eingabe');
      await sprache('en');
      expect(await fokusIn(page, '.sidebar-notes .cm-content')).toBe(true);
      await page.keyboard.type(' weiter');
      await expect(notiz).toHaveText('Laufende Eingabe weiter');

      await reiterKlick(page, 'properties');
      const wert = page.locator(`${PANE0} .sidebar-properties .properties-field-value input`);
      await wert.first().click();
      await page.keyboard.press('End');
      await page.keyboard.type('X');
      await sprache('de');
      expect(await fokusIn(page, '.sidebar-properties .properties-field-value')).toBe(true);
      await page.keyboard.type('Y');
      await expect(wert.first()).toHaveValue('offenXY');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('SP-07: Felder der Block-Eigenschaften beim Sprachwechsel (4T-002129)', () => {
  test('4T-002129: Typ-Auswahl und Kurzhinweis wechseln die Sprache, Eingabe und Fokus bleiben', async () => {
    test.setTimeout(120000);
    const { app, page, userData } = await launchApp({
      args: [makeSprachProbe({ mitDaten: true })],
      settings: {
        language: 'de',
        app: { defaultViewMode: 'source' },
        blockProps: { visibleColumn0: true },
      },
    });
    const sek = `${PANE0} .sidebar-blockprops`;
    // Je Typ-Eintrag der Text und der Text, den der Katalog für ihn nennt.
    const feld = (katalog) =>
      page.evaluate(
        ([s, k]) => {
          const p = document.querySelector(`${s} .block-props-fields`);
          const optionen = Array.from(p.querySelectorAll('.properties-field-type option'));
          return {
            typen: optionen.map((o) => o.textContent),
            soll: optionen.map((o) => k[`properties.type.${o.value}`]),
            entfernen: p.querySelector('.properties-field-delete').title,
          };
        },
        [sek, katalog],
      );
    const pruefe = async (k) => {
      await expect
        .poll(async () => {
          const f = await feld(k);
          return f.typen.length > 0 && f.typen.every((t, i) => t === f.soll[i]) && f.entfernen;
        })
        .toBe(k['properties.deleteField']);
    };
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      const sprache = await zweitesFenster(app, page);
      await page.locator(`${sek} .block-props-anchor-select`).selectOption('abc');
      const wert = page.locator(`${sek} .properties-field-value input`).first();
      await expect(wert).toHaveValue('hoch');
      await pruefe(DE);
      await wert.click();
      await page.keyboard.press('End');
      await page.keyboard.type('X');
      await sprache('en');
      await pruefe(EN);
      expect(await fokusIn(page, '.sidebar-blockprops .properties-field-value')).toBe(true);
      await page.keyboard.type('Y');
      await expect(wert).toHaveValue('hochXY');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
