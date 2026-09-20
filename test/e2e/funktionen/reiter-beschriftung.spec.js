// 4T-001724 (Epic 3E-000304): E2E-Funktions-Specs der Reiter-Beschriftung ohne
// Markdown-Endung.
//
// Die Kuerzung selbst und ihre Randfaelle (jede Endung, Schreibweise, Rueckfall
// bei einem Namen aus reiner Endung) pruefen die Unit-Faelle an der einen
// Quelle: test/unit/renderer/reiter-beschriftung.test.js und der Abschnitt zu
// `stripMarkdownExtension` in test/unit/subpages.test.js. Hier steht der Teil,
// den nur die laufende Anwendung zeigen kann — dass die DREI Anzeigen
// tatsaechlich dieselbe gekuerzte Form fuehren (Reiterleiste,
// Reiter-Gruppenmenue, Fenstertitel) und dass der Kurzhinweis den vollen Pfad
// behaelt.
//
//   RT-01  Reiterleiste und Fenstertitel eines Markdown-Dokuments ohne Endung;
//          der Kurzhinweis am Reiter traegt weiter den vollen Pfad (AK1, AK3,
//          Teil von AK9).
//   RT-02  Eine weitere Markdown-Endung wird an derselben Stelle gekuerzt
//          (AK4 an der Anzeige).
//   RT-03  Eine fremde Endung bleibt in Reiter und Fenstertitel stehen (AK5).
//   RT-04  Das Reiter-Gruppenmenue fuehrt dieselbe gekuerzte Beschriftung (AK2).
//   RT-05  Zwei gleichnamige Dateien verschiedener Ordner (AK7).
//
// 4T-001775 (Entscheidung des Product Owners vom 2026-09-17, die E5 revidiert):
// dieselbe Form in der Dateiliste des Bereichs-Panels.
//
//   RT-06  Die Dateiliste beschriftet ohne Markdown-Endung, und ihr
//          Kurzhinweis fuehrt weiter den vollen Pfad (AK1, AK2 von 4T-001775).
//   RT-07  Ein Klick auf die gekuerzte Zeile oeffnet dieselbe Datei wie zuvor;
//          der Reiter traegt dieselbe Beschriftung (AK3).
//   RT-08  Zwei gleichstaemmige Dateien mit verschiedenen Markdown-Endungen
//          stehen beide in der Liste, tragen dieselbe Beschriftung und bleiben
//          ueber den Kurzhinweis unterscheidbar (AK6, Entscheidung E8).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const MENU_ITEM = (id) => `#context-menu [data-menu-id="${id}"]`;
const MODAL = '#tab-group-modal';

// Arbeitsordner mit dem Bestand aller Faelle. Eigene Wegwerf-Kopie statt einer
// Fixture, weil RT-05 zwei gleichnamige Dateien in zwei Ordnern braucht und
// RT-03 eine Datei mit fremder Endung — beides waere im gemeinsamen
// Fixture-Ordner ein Fremdkoerper.
function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-reiter-'));
  fs.writeFileSync(path.join(dir, 'Konzept.md'), '# Konzept\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Notiz.markdown'), '# Notiz\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Liste.txt'), '# Liste\n\nInhalt.\n', 'utf8');
  fs.mkdirSync(path.join(dir, 'Alt'));
  fs.mkdirSync(path.join(dir, 'Neu'));
  fs.writeFileSync(path.join(dir, 'Alt', 'Doppel.md'), '# Doppel alt\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Neu', 'Doppel.md'), '# Doppel neu\n', 'utf8');
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Auf den aktiven Reiter warten statt auf ein Nebenprodukt des Starts:
// `launchApp` wartet nicht auf die Datei-Argumente (Befund an VL-09, SV-03 und
// EX-04). Die Beschriftung selbst ist hier der Gegenstand, also wird auf sie
// gewartet.
async function warteAufReiter(page, beschriftung) {
  await expect(page.locator(`${SEL.activeTab0} .tab-title`)).toHaveText(beschriftung);
}

// Datei ueber denselben Weg oeffnen wie der Dateien-Dialog: Beide landen im
// Renderer in `openInPane`. Der Dialog selbst ist nativ und fuer Playwright
// nicht bedienbar; der Kanal steht hier fuer sein Ergebnis. Gepollt gesendet,
// weil ein frueher Send an ein noch ladendes Fenster verfaellt (Electron-IPC
// puffert nicht).
async function oeffneUeberKanal(app, page, dateipfad, beschriftung) {
  await expect
    .poll(async () => {
      await app.evaluate(({ BrowserWindow }, datei) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', [datei]);
      }, dateipfad);
      return page.locator(`${SEL.tabs0} .tab-title`).allTextContents();
    })
    .toContain(beschriftung);
}

test.describe('RT-01: Reiter und Fenstertitel ohne Markdown-Endung', () => {
  test('der Reiter zeigt den Namen ohne Endung, der Fenstertitel ebenso, der Kurzhinweis den Pfad', async () => {
    const dir = makeDir();
    const datei = path.join(dir, 'Konzept.md');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      // AK1: die Beschriftung des Reiters.
      await warteAufReiter(page, 'Konzept');

      // AK3: der Fenstertitel wird aus derselben Beschriftung gebildet.
      await expect.poll(() => page.title()).toBe('Konzept — EM4me');

      // Teil von AK9: der Kurzhinweis am Reiter fuehrt weiter den vollen Pfad
      // mit Endung — gekuerzt ist die Beschriftung, nicht die Auskunft.
      await expect(page.locator(SEL.activeTab0)).toHaveAttribute('title', datei);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RT-02: Auch die weiteren Markdown-Endungen fallen', () => {
  test('eine .markdown-Datei zeigt dieselbe gekuerzte Beschriftung', async () => {
    const dir = makeDir();
    const datei = path.join(dir, 'Notiz.markdown');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      // AK4 an der Anzeige: nicht allein '.md' faellt.
      await warteAufReiter(page, 'Notiz');
      await expect.poll(() => page.title()).toBe('Notiz — EM4me');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RT-03: Eine fremde Endung bleibt stehen', () => {
  test('eine .txt-Datei traegt ihre Endung in Reiter und Fenstertitel', async () => {
    const dir = makeDir();
    const datei = path.join(dir, 'Liste.txt');
    const { app, page, userData } = await launchApp();
    try {
      // AK5: Wer eine fremde Dateiart geoeffnet hat, soll das am Reiter sehen.
      await oeffneUeberKanal(app, page, datei, 'Liste.txt');
      await warteAufReiter(page, 'Liste.txt');
      await expect.poll(() => page.title()).toBe('Liste.txt — EM4me');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RT-04: Das Reiter-Gruppenmenue fuehrt dieselbe Beschriftung', () => {
  test('der Mitglieder-Eintrag einer zugeklappten Gruppe steht ohne Endung', async () => {
    const dir = makeDir();
    const { app, page, userData } = await launchApp({
      args: [path.join(dir, 'Konzept.md'), path.join(dir, 'Notiz.markdown')],
    });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // Gruppe mit dem Konzept-Reiter bilden (Standard-Fluss aus 4T-000461).
      await page.locator(SEL.tabs0, { hasText: 'Konzept' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-new')).click();
      await expect(page.locator(MODAL)).toBeVisible();
      await page.locator('#tab-group-name').fill('Recherche');
      await page.locator('#btn-tab-group-ok').click();
      await expect(page.locator(MODAL)).toBeHidden();

      // Aktiv ist der Reiter AUSSERHALB der Gruppe; danach zuklappen, damit
      // das Mitglieder-Menue der einzige Weg zur Beschriftung ist.
      await page.locator(SEL.tabs0, { hasText: 'Notiz' }).click();
      await page.locator(SEL.groupHeads0).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Zeigen oeffnet die Mitglieder-Liste (nach kurzer Verzoegerung).
      await page.locator(SEL.groupHeads0).hover();
      const eintrag = page.locator(MENU_ITEM('tabgroup-member')).first();
      await expect(eintrag).toBeVisible();
      // AK2: derselbe Name wie am Reiter. Geprueft wird beides — dass er
      // dasteht und dass die Endung fehlt; der Eintrag traegt neben dem Label
      // die Schliess-Flaeche, ein Text-Vergleich waere deshalb unscharf.
      await expect(eintrag).toContainText('Konzept');
      await expect(eintrag).not.toContainText('.md');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RT-05: Zwei gleichnamige Dateien verschiedener Ordner', () => {
  test('beide Reiter tragen die gekuerzte Beschriftung und bleiben ueber den Kurzhinweis unterscheidbar', async () => {
    const dir = makeDir();
    const alt = path.join(dir, 'Alt', 'Doppel.md');
    const neu = path.join(dir, 'Neu', 'Doppel.md');
    const { app, page, userData } = await launchApp({ args: [alt, neu] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // AK7: Die Beschriftung ist bei gleichem Namen schon vor dieser
      // Aenderung dieselbe gewesen — der Streifen kennt keine
      // Ordner-Ergaenzung. Unterschieden werden die beiden Reiter ueber den
      // Kurzhinweis, und der fuehrt den vollen Pfad; genau das bleibt.
      await expect
        .poll(() => page.locator(`${SEL.tabs0} .tab-title`).allTextContents())
        .toEqual(['Doppel', 'Doppel']);
      const hinweise = await page
        .locator(SEL.tabs0)
        .evaluateAll((els) => els.map((el) => el.getAttribute('title')));
      expect(hinweise).toEqual([alt, neu]);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// --- Dateiliste des Bereichs-Panels (4T-001775) ------------------------------
//
// Der Bereich wird an das LEERE Startfenster gebunden (`openAreaPath` im
// Anzeige-Prozess); mit einer Datei im Start-Argument entstuende ein zweites
// Fenster und die Pruefung liefe am gebundenen vorbei (Muster
// bereichs-panel.spec.js, einbettungen.spec.js).
const AREA_SECTION = '.pane-group[data-pane="0"] .sidebar-area';

// Eigener Bestand fuer die Listen-Faelle: zwei gleichstaemmige Dateien mit
// verschiedenen Markdown-Endungen und eine Datei fremder Art. Getrennt von
// makeDir, weil zwei Dateien mit dem Stamm 'Notiz' die Reiter-Faelle oben
// mehrdeutig machen wuerden.
function makeListenDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-reiter-liste-'));
  fs.writeFileSync(path.join(dir, 'Konzept.md'), '# Konzept\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Notiz.md'), '# Notiz md\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Notiz.markdown'), '# Notiz markdown\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'Liste.txt'), 'Keine Markdown-Datei.\n', 'utf8');
  return dir;
}

// Bereich binden und auf das sichtbare Panel warten.
async function bindeBereich(page, dir) {
  await page.evaluate((p) => window.api.openAreaPath(p), dir);
  await expect.poll(() => page.title()).toContain('(Bereich');
  const section = page.locator(AREA_SECTION);
  await expect(section).toBeVisible();
  return section;
}

test.describe('RT-06: Die Dateiliste des Bereichs beschriftet ohne Endung', () => {
  test('die Zeilen stehen ohne Markdown-Endung, der Kurzhinweis nennt den vollen Pfad', async () => {
    const dir = makeListenDir();
    const { app, page, userData } = await launchApp();
    try {
      const section = await bindeBereich(page, dir);
      const zeilen = section.locator('.area-file-row');

      // AK1: Drei Markdown-Dateien, drei gekuerzte Beschriftungen. Die Datei
      // fremder Art steht nicht in der Liste — der Hauptprozess filtert sie
      // (Kriterium AK4 liegt deshalb auf der Unit-Ebene).
      await expect(zeilen).toHaveCount(3);
      expect(await zeilen.allTextContents()).toEqual(['Konzept', 'Notiz', 'Notiz']);

      // AK2: Der Kurzhinweis ist die Auskunft ueber den echten Dateinamen.
      const zeile = section.locator('.area-file-row', { hasText: /^Konzept$/ });
      await expect(zeile).toHaveAttribute('title', path.join(dir, 'Konzept.md'));
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RT-07: Der Klick auf die gekuerzte Zeile oeffnet dieselbe Datei', () => {
  test('der Reiter traegt danach dieselbe Beschriftung wie die Zeile', async () => {
    const dir = makeListenDir();
    const { app, page, userData } = await launchApp();
    try {
      const section = await bindeBereich(page, dir);
      await section.locator('.area-file-row', { hasText: /^Konzept$/ }).click();

      // AK3: Gekuerzt ist die Anzeige, nicht der Weg zur Datei.
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await warteAufReiter(page, 'Konzept');
      await expect(page.locator(SEL.activeTab0)).toHaveAttribute(
        'title',
        path.join(dir, 'Konzept.md'),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RT-08: Gleicher Stamm, zwei Markdown-Endungen', () => {
  test('beide Zeilen stehen da, gleich beschriftet und im Kurzhinweis unterschieden', async () => {
    const dir = makeListenDir();
    const { app, page, userData } = await launchApp();
    try {
      const section = await bindeBereich(page, dir);
      const notizen = section.locator('.area-file-row', { hasText: /^Notiz$/ });

      // AK6 (E8, Variante A): Keine der beiden Dateien verschwindet, und
      // keine bekommt einen Zusatz — unterschieden wird ueber den Kurzhinweis.
      await expect(notizen).toHaveCount(2);
      const hinweise = await notizen.evaluateAll((els) =>
        els.map((el) => el.getAttribute('title')).sort(),
      );
      expect(hinweise).toEqual(
        [path.join(dir, 'Notiz.markdown'), path.join(dir, 'Notiz.md')].sort(),
      );

      // Beide sind erreichbar: der Klick auf die zweite Zeile oeffnet die
      // Datei, die ihr Kurzhinweis nennt.
      const zweite = notizen.nth(1);
      const pfad = await zweite.getAttribute('title');
      await zweite.click();
      await expect(page.locator(SEL.activeTab0)).toHaveAttribute('title', pfad);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// --- Weitere Panels der Seitenleiste (4T-001775) ------------------------------
//
// Die PO-Ansage vom 2026-09-17 («Dies gilt fuer alle relevanten Sidebars»)
// reicht ueber die Dateiliste hinaus. Backlinks und Erinnerungen sind an ihren
// eigenen Prueffaellen belegt (BP-04 in bereichs-panel.spec.js, ER-01 und ER-05
// in erinnerungen.spec.js), das Lesezeichen-Panel in BL-07
// (bereichs-lesezeichen.spec.js). Die Datei-Liste des Tag-Panels hatte bis
// hierhin gar keinen Prueffall — deshalb steht sie hier.
//
//   RT-09  Die Datei-Liste eines Tags beschriftet ohne Markdown-Endung und
//          fuehrt den vollen Pfad im Kurzhinweis.

// Kunstwort als Tag: So kann kein Treffer aus einer mitgelieferten Datei oder
// aus der Oberflaeche stammen (Muster tag-umbenennung.spec.js).
const PROBE_TAG = 'kuerzungsprobe';

test.describe('RT-09: Die Datei-Liste des Tag-Panels', () => {
  test('beschriftet ohne Markdown-Endung und nennt im Kurzhinweis den vollen Pfad', async () => {
    test.setTimeout(120000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-reiter-tags-'));
    fs.writeFileSync(
      path.join(dir, 'Konzept.md'),
      `# Konzept\n\nHier steht #${PROBE_TAG}.\n`,
      'utf8',
    );
    const { app, page, userData } = await launchApp();
    try {
      const section = await bindeBereich(page, dir);

      // Das Tag-Panel braucht ein GEOEFFNETES Dokument: Ohne aktive Datei
      // meldet es «nicht verfuegbar» (am Quellcode geprueft, renderTags in
      // autocomplete-help.js). Geoeffnet wird ueber die Dateiliste, weil
      // openAreaPath die Reiter des Fensters zuruecksetzt.
      await section.locator('.area-file-row', { hasText: /^Konzept$/ }).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);

      // Der Umweg ueber das Backlinks-Panel stoesst den Index-Aufbau an
      // (Muster tag-umbenennung.spec.js).
      await page.locator('#btn-backlinks').click();
      await page.locator('#btn-tags').click();
      const tags = page.locator('.pane-group[data-pane="0"] .sidebar-tags');
      const eintrag = tags.locator('.tags-tree .tags-tree-item', { hasText: PROBE_TAG });
      await expect(eintrag.first()).toBeVisible({ timeout: 30000 });

      // Linksklick filtert auf den Tag und zeigt seine Dateien.
      await eintrag.first().click();
      const zeile = tags.locator('.tags-files-list .tags-files-item').first();
      await expect(zeile).toBeVisible();
      await expect(zeile.locator('.tags-files-item-name')).toHaveText('Konzept');
      await expect(zeile).toHaveAttribute('title', path.join(dir, 'Konzept.md'));
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
