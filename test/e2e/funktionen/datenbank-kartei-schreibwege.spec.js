// 4T-002404 (Epic 3E-000266, F1 A, F3 A; Story 4S-001126, AK1, AK4): Die
// Dokument-Schreibwege einer Karteikarte in der realen Anordnung.
//
// DB-KAS-01: Eine Karteikarte des Demo-Bereichs bekommt im Eigenschafts-Bereich
// einen typ-verletzten Wert und wird gespeichert. Die Datei ist geschrieben —
// das Speichern weist nie ab —, und die Befunde erscheinen an den drei Orten:
// Statusleiste, Hinweis am Feld und Markierung der Dateikopf-Zeile. Nach dem
// Beheben und erneuten Speichern entfallen Hinweis und Markierung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Befunde entstehen im Haupt-Prozess an der Sicht des Index, reisen als Angabe
// im Ergebnis von `file:save` in den Anzeige-Prozess und werden dort an drei
// Orte gezeichnet, die verschiedene Module besitzen. Die Kette gibt es erst in
// der laufenden Anwendung.
//
// 4T-002405 (Epic 3E-000266, F4 A, F5 A; Story 4S-001127, AK1 bis AK3):
// DB-KAS-02 löscht im Bereichs-Panel: «Umberto Eco» ist aus «Readings»
// verwiesen, das Löschen wird abgewiesen und nennt den Grund; eine nicht
// verwiesene Karteikarte geht über die Datenbank in den Papierkorb, ihre Belege
// samt Lösch-Beleg an die Tabelle. DB-KAS-03 kopiert «Stanisław Lem»: Die Kopie
// ist eine Karteikarte mit eigener Kennung und dem Namen der Kopie als Schlüssel.
// Die Rückfrage vor dem Löschen und der Papierkorb liegen im Haupt-Prozess und
// werden dort ersetzt (Muster BP-08 und DB-KAR-05).
//
// **Der Aufbau ist nicht der Gegenstand** (test/README.md): Der Demo-Bereich
// entsteht über die Preload-Brücke in einem leeren Ordner (Muster
// `datenbank-suche.spec.js`), die Karteikarte öffnet über den Weg eines
// Datei-Arguments. Die Profil-Vorbelegung der Ablauf-Läufe stellt Deutsch ein;
// die Statusleiste wird gegen den deutschen Text der Sprachdatei geprüft.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const DE = require('../../../src/i18n/fragments/de/database.json');
const DE_BEREICH = require('../../../src/i18n/fragments/de/area.json');

const PANE = '.pane-group[data-pane="0"]';
const FELDER = `${PANE} .sidebar-properties .properties-fields`;
const BORN = `${FELDER} .properties-field[data-original-key="born"]`;
const FELD_HINWEIS = `${BORN} .properties-field-kartei-hint`;
const KOPF_MARKE = `${SEL.markdownBody0} .frontmatter-header .frontmatter-kartei-befunde`;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

// Warten, bis die Datenbank des gebundenen Bereichs bereit ist: Der Index hat
// den Bestand gelesen, sein Beobachter läuft, und der Katalog führt «Authors».
// Vorher weist die Schreib-Schnittstelle einen Auftrag ab (keine bereite Sicht),
// und eine Datei, die während des ersten Lesens entsteht, sieht der Index nie,
// weil der Beobachter erst danach startet und keine Anfangs-Ereignisse meldet.
async function datenbankBereit(page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const u = await window.api.databaseOverview({});
          const authors = (u.tabellen || []).some((t) => t.name === 'Authors');
          return u.status === 'ready' && authors;
        }),
      { timeout: 60000 },
    )
    .toBe(true);
}

// Demo-Bereich in einem frischen, leeren Ordner anlegen und binden, danach die
// Karteikarte im selben Fenster öffnen (erst binden, dann das Dokument).
async function starteMitKarteikarte(app, page) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-schreibwege-'));
  const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
  expect(ergebnis.ok).toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  const karte = path.join(ziel, 'Authors', 'Umberto Eco.md');
  await oeffneDokumentImFenster(app, page, karte);
  return { ziel, karte };
}

// Den Wert des Feldes `born` als Text eintragen und von Hand speichern. Der
// Eigenschafts-Bereich schreibt verzögert in das Dokument; gespeichert wird
// erst, wenn der Reiter als geändert gilt.
async function setzeBornUndSpeichere(page, wert) {
  const eingabe = page.locator(`${BORN} .properties-field-value-input`);
  await eingabe.fill(wert);
  await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Control+s');
}

test.describe('DB-KAS-01: Prüfung der Karteikarte beim Speichern (4T-002404)', () => {
  test('typ-verletzter Wert: gespeichert, Befund an drei Orten, nach dem Beheben fort', async () => {
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      const geoeffnet = await starteMitKarteikarte(app, page);
      ziel = geoeffnet.ziel;
      await page.locator(SEL.viewBtn('rendered')).click();
      await page.locator('#btn-properties').click();
      await expect(page.locator(BORN)).toHaveCount(1);

      // Das Feld trägt ein Datum; als Text lässt sich ein beliebiger Wert
      // eintragen, wie es der Anwender über den Typ-Wechsler täte.
      await page.locator(`${BORN} .properties-field-type`).selectOption('string');
      await setzeBornUndSpeichere(page, 'unbekannt');

      // AK1: Die Datei ist geschrieben, das Speichern hat nicht abgewiesen.
      await expect
        .poll(() => fs.readFileSync(geoeffnet.karte, 'utf8'), { timeout: 15000 })
        .toContain('born: unbekannt');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // AK4: Statusleiste, Hinweis am Feld und Markierung der Dateikopf-Zeile.
      await expect(page.locator('#statusbar-hint')).toHaveText(
        DE['database.card.savedFindingsOne'],
      );
      await expect(page.locator(FELD_HINWEIS)).toHaveAttribute('data-kartei-befunde', '1');
      await expect(page.locator(FELD_HINWEIS)).toHaveAttribute('title', /unbekannt/);
      await expect(page.locator(KOPF_MARKE)).toHaveAttribute('data-kartei-befunde', '1');

      // AK4: Beheben und erneut speichern — Hinweis und Markierung entfallen.
      await setzeBornUndSpeichere(page, '1932-01-05');
      await expect
        .poll(() => fs.readFileSync(geoeffnet.karte, 'utf8'), { timeout: 15000 })
        // Als Text geschrieben, darf der Wert in Anführung stehen.
        .toMatch(/born: '?1932-01-05'?\n/);
      await expect(page.locator(FELD_HINWEIS)).toHaveCount(0);
      await expect(page.locator(KOPF_MARKE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});

// --- DB-KAS-02, DB-KAS-03: Löschen und Kopieren im Bereichs-Panel (4T-002405) ---------------

const BEREICH = '.pane-group[data-pane="0"] .sidebar-area';
const MENUE = '#context-menu';
const TAB_TITEL = '.pane-group[data-pane="0"] .tabbar .tab .tab-title';

// Den Papierkorb im Haupt-Prozess durch ein Verschieben in einen Ordner neben
// dem Bereich ersetzen, damit der Lauf nichts in den Papierkorb des Rechners legt.
async function papierkorbNach(app, ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  await hauptSenden(
    app,
    ({ shell }, ziel) => {
      const nfs = process.getBuiltinModule('node:fs');
      const npath = process.getBuiltinModule('node:path');
      shell.trashItem = async (p) => nfs.renameSync(p, npath.join(ziel, npath.basename(p)));
    },
    ordner,
  );
}

// Die Lösch-Rückfrage beantworten und ihren Erläuterungstext merken; jeder
// andere Dialog bleibt echt.
async function stimmeLoeschenZu(app) {
  await hauptSenden(
    app,
    ({ dialog }, titel) => {
      globalThis.__kasDetails = [];
      const echt = dialog.showMessageBox;
      dialog.showMessageBox = async (win, opts) => {
        if (opts && opts.title === titel) {
          globalThis.__kasDetails.push(opts.detail || '');
          return { response: 0 };
        }
        return echt.call(dialog, win, opts);
      };
    },
    DE_BEREICH['areaPanel.deleteConfirmTitle'],
  );
}

function dateiZeile(section, beschriftung) {
  return section.locator('.area-file-row', { hasText: new RegExp(`^${beschriftung}$`) });
}

// Demo-Bereich anlegen und im Bereichs-Panel den Ordner «Authors» aufklappen.
async function oeffneAuthors(page) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-kartei-panel-'));
  const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
  expect(ergebnis.ok).toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  const section = page.locator(BEREICH);
  await expect(section).toBeVisible();
  await section.locator('.area-dir-row').filter({ hasText: 'Authors' }).click();
  await expect(section.locator('.area-files-title')).toHaveText('Authors');
  // Die Weichen von Löschen und Kopieren laufen über die Schreib-Schnittstelle.
  await datenbankBereit(page);
  return { ziel, section, authors: path.join(ziel, 'Authors') };
}

async function rechtsklick(page, section, beschriftung, menuId) {
  await dateiZeile(section, beschriftung).click({ button: 'right' });
  await page.locator(`${MENUE} [data-menu-id="${menuId}"]`).click();
}

test.describe('DB-KAS-02: Löschen einer Karteikarte im Bereichs-Panel (4T-002405)', () => {
  test('verwiesene Karteikarte abgewiesen mit Grund, nicht verwiesene über die Datenbank im Papierkorb', async () => {
    const { app, page, userData } = await launchApp();
    let ziel = null;
    let korb = null;
    try {
      const authors = await oeffneAuthors(page);
      ziel = authors.ziel;
      korb = `${ziel}-korb`;
      await papierkorbNach(app, korb);
      await stimmeLoeschenZu(app);
      const { section } = authors;
      const tabelle = path.join(authors.authors, 'Authors.md');
      const reiter = (name) => page.locator(TAB_TITEL, { hasText: name });

      // AK2: «Umberto Eco» ist aus «Readings» verwiesen. Die Rückfrage nennt den
      // Weg über die Datenbank, das Löschen wird abgewiesen, die Meldung nennt
      // den Verweis, und die Karteikarte bleibt. Ihr geöffneter Reiter bleibt
      // offen, weil erst ein angenommener Lösch-Auftrag ihn schließt.
      await dateiZeile(section, 'Umberto Eco').click();
      await expect(reiter('Umberto Eco')).toHaveCount(1);
      await rechtsklick(page, section, 'Umberto Eco', 'area-file-delete');
      await expect(page.locator('#statusbar-hint')).toContainText('wurde nicht gelöscht');
      await expect(page.locator('#statusbar-hint')).toContainText('Readings');
      await expect(reiter('Umberto Eco')).toHaveCount(1);
      const details = await hauptLesen(app, () => globalThis.__kasDetails);
      expect(details[0]).toContain(
        DE_BEREICH['areaPanel.deleteConfirmCard'].replace('{tabelle}', 'Authors'),
      );
      expect(fs.existsSync(path.join(authors.authors, 'Umberto Eco.md'))).toBe(true);
      expect(fs.readdirSync(korb)).toEqual([]);

      // AK1: Eine nicht verwiesene Karteikarte, über die Datenbank angelegt,
      // geht über das Bereichs-Panel in den Papierkorb, samt Beleg-Datei; ihre
      // Belege samt Lösch-Beleg stehen danach an der Tabelle.
      const angelegt = await page.evaluate(
        (t) =>
          window.api.databaseAuftrag({
            auftrag: {
              anweisungen: [{ tabelle: t, art: 'create', karteikarte: { name: 'Italo Calvino' } }],
            },
          }),
        tabelle,
      );
      expect(angelegt.ok).toBe(true);
      await expect(dateiZeile(section, 'Italo Calvino')).toHaveCount(1, { timeout: 15000 });
      await dateiZeile(section, 'Italo Calvino').click();
      await expect(reiter('Italo Calvino')).toHaveCount(1);
      await rechtsklick(page, section, 'Italo Calvino', 'area-file-delete');
      await expect(dateiZeile(section, 'Italo Calvino')).toHaveCount(0, { timeout: 15000 });
      // Nach dem angenommenen Lösch-Auftrag ist ihr Reiter geschlossen.
      await expect(reiter('Italo Calvino')).toHaveCount(0);
      expect(fs.readdirSync(korb).sort()).toEqual(['Italo Calvino.md', 'Italo Calvino.mddl']);
      const belege = fs.readFileSync(path.join(authors.authors, 'Authors.mddl'), 'utf8');
      expect(belege).toContain('kind="create"');
      expect(belege).toContain('kind="delete"');
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
      if (korb) removeDir(korb);
    }
  });
});

test.describe('DB-KAS-03: Kopieren einer Karteikarte im Bereichs-Panel (4T-002405)', () => {
  test('die Kopie von «Stanisław Lem» ist eine Karteikarte mit eigener Kennung', async () => {
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      const authors = await oeffneAuthors(page);
      ziel = authors.ziel;
      const { section } = authors;

      // AK3: Kopieren über das Kontextmenü; die Kopie heißt «Stanisław Lem-1»,
      // trägt eine neue Kennung, den Namen der Kopie als Schlüssel, das übrige
      // Feld und den Freitext der Vorlage, und ihren Anlege-Beleg.
      await rechtsklick(page, section, 'Stanisław Lem', 'area-file-copy');
      await expect(dateiZeile(section, 'Stanisław Lem-1')).toHaveCount(1, { timeout: 15000 });
      const kopie = fs.readFileSync(path.join(authors.authors, 'Stanisław Lem-1.md'), 'utf8');
      expect(kopie).toMatch(/^db-record: r-0000[4-9]$/m);
      expect(kopie).toMatch(/^name: Stanisław Lem-1$/m);
      expect(kopie).toMatch(/^born: 1921-09-12$/m);
      expect(kopie).toContain('Polish writer of science fiction');
      const beleg = fs.readFileSync(path.join(authors.authors, 'Stanisław Lem-1.mddl'), 'utf8');
      expect(beleg).toContain('kind="create"');
      // Die Vorlage bleibt unverändert und behält ihre Kennung.
      const vorlage = fs.readFileSync(path.join(authors.authors, 'Stanisław Lem.md'), 'utf8');
      expect(vorlage).toMatch(/^db-record: r-00002$/m);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});

// --- DB-KAS-04, DB-KAS-05: Masken der Kartei-Form (4T-002406) ---------------------------------
//
// 4T-002406 (Epic 3E-000266, F7 A; Story 4S-001129, AK1 bis AK4): DB-KAS-04 zeigt
// eine Listen-Maske über die Demo-Kartei «Authors» mit Zähl-Zeile, Aktions-Spalte
// und den drei Karteikarten; ein Klick auf eine Zeile öffnet die Einzel-Maske,
// weil die Listen-Maske der Weg in die Maske ist. Seit 4T-002408 öffnet der Fall
// die Listen-Maske «Authors List» der Demo. DB-KAS-05
// klickt in der Bereichs-Suche den Datensatz-Treffer «Umberto Eco»: Bei einer
// Karteikarte öffnet das Dokument, keine Maske. Am Dokument öffnet «In der Maske
// öffnen» die Einzel-Maske, dort führt «Karteikarte öffnen» zurück, und an
// «Readings», das keine Karteikarte ist, ist das Kommando nicht verfügbar.

const DE_KOMMANDOS = require('../../../src/i18n/fragments/de/commands.json');

const MASKE = `${PANE} .pane-system .db-form-page`;
const SUCH_PANEL = `${PANE} .sidebar-searchresults`;
const DATENSATZ_ZEILE = `${SUCH_PANEL} .search-results-item-record`;
const KOMMANDO = DE_KOMMANDOS['command.database.openInForm'];

function zaehlung(von, bis, gesamt) {
  return DE['database.list.count']
    .replace('{von}', von)
    .replace('{bis}', bis)
    .replace('{gesamt}', gesamt);
}

async function demoBereich(page, praefix) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
  expect(ergebnis.ok).toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  return ziel;
}

// Die Kommando-Palette öffnen und den Eintrag des Kommandos liefern.
async function paletteEintrag(app, page) {
  const modal = page.locator('#command-palette-modal');
  await hauptSenden(app, ({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:openCommandPalette'),
  );
  await expect(modal).toBeVisible();
  await page.locator('#command-palette-filter').fill(KOMMANDO);
  const eintrag = page.locator('.command-palette-item', { hasText: KOMMANDO });
  await expect(eintrag).toHaveCount(1);
  return eintrag;
}

test.describe('DB-KAS-04: Listen-Maske über eine Kartei-Tabelle (4T-002406)', () => {
  test('Gitter mit Zähl-Zeile und Aktions-Spalte über «Authors», die Zeile öffnet die Einzel-Maske', async () => {
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ziel = await demoBereich(page, 'em4me-kartei-liste-');
      // 4T-002408: die Listen-Maske der Demo im Ordner der Karteikarten.
      const liste = path.join(ziel, 'Authors', 'Authors List.md');
      await oeffneDokumentImFenster(app, page, liste);
      await page.locator(SEL.viewBtn('rendered')).click();

      // AK1: dieselben Angaben, Handgriffe und Zeilen wie über eine Tabellen-Datei.
      const gitter = page.locator(`${SEL.markdownBody0} .db-list`);
      await expect(gitter.locator('table.db-list-table')).toBeVisible({ timeout: 30000 });
      await expect(gitter.locator('.db-list-count')).toHaveText(zaehlung('1', '3', '3'));
      await expect(gitter.locator('thead th.db-list-col-actions')).toHaveCount(1);
      await expect(gitter.locator('tbody tr.db-list-row td.db-list-col-record')).toHaveText([
        'Stanisław Lem',
        'Umberto Eco',
        'Ursula K. Le Guin',
      ]);

      // F7 A: Die Zeile der Listen-Maske bleibt der Weg in die Einzel-Maske,
      // auch bei einer Karteikarte (AK4: die Standard-Einzelmaske gilt).
      // Geklickt wird die Datensatz-Spalte wie in DB-LIS-01: Ein Klick in eine
      // bearbeitbare Zelle hält die Zeile für den Doppelklick fest und öffnet
      // bewusst keine Maske (`lageDes` in `listen-zeile.js`, 4T-002250).
      await gitter
        .locator('tbody tr.db-list-row', { hasText: 'Umberto Eco' })
        .locator('td.db-list-col-record')
        .click();
      const maske = page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-heading')).toHaveText('Authors');
      await expect(maske.locator('.db-form-record')).toContainText('Umberto Eco');
      await expect(maske.locator('.db-form-field[data-field="born"]')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-KAS-05: Klick-Ziel und Handgriffe einer Karteikarte (4T-002406)', () => {
  test('der Treffer öffnet das Dokument, «In der Maske öffnen» und «Karteikarte öffnen» führen hin und zurück', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ziel = await demoBereich(page, 'em4me-kartei-klick-');
      await oeffneDokumentImFenster(app, page, path.join(ziel, 'Readings.md'));
      await expect(page.locator(SEL.activeTab0)).toContainText('Readings');

      // Bereichs-Suche bis zur Zeile der Karteikarte (der Index des frisch
      // gebundenen Bereichs entsteht nebenläufig, Muster DB-SUC-01).
      await page.keyboard.press('Control+f');
      const eingabe = page.locator('#search-input');
      await expect(eingabe).toBeVisible();
      const treffer = page.locator(DATENSATZ_ZEILE, { hasText: /Umberto Eco · name:/ });
      await expect
        .poll(
          async () => {
            await eingabe.fill('');
            await eingabe.fill('Umberto Eco');
            return expect(treffer.first())
              .toBeVisible({ timeout: 5000 })
              .then(
                () => true,
                () => false,
              );
          },
          { timeout: 60000 },
        )
        .toBe(true);

      // AK2: Der Datensatz-Treffer einer Karteikarte öffnet ihr Dokument.
      await treffer.first().click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Umberto Eco', { timeout: 20000 });
      await expect(page.locator(MASKE)).toHaveCount(0);

      // AK3: «In der Maske öffnen» am Dokument führt in die Einzel-Maske.
      const eintrag = await paletteEintrag(app, page);
      await expect(eintrag).not.toHaveClass(/unavailable/);
      await eintrag.click();
      const maske = page.locator(MASKE);
      await expect(maske).toBeVisible({ timeout: 20000 });
      await expect(maske.locator('.db-form-heading')).toHaveText('Authors');
      await expect(maske.locator('.db-form-record')).toContainText('Umberto Eco');
      await expect(maske.locator('.db-form-field[data-field="name"]')).toHaveCount(1);
      await expect(maske.locator('.db-form-field[data-field="born"]')).toHaveCount(1);

      // AK3: «Karteikarte öffnen» statt «Im Tabellen-Dokument zeigen» führt zurück.
      await expect(maske.locator('.db-form-show-in-document')).toHaveCount(0);
      const zurueck = maske.locator('.db-form-open-card');
      await expect(zurueck).toHaveText(DE['database.form.action.openCard']);
      await zurueck.click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Umberto Eco');
      await page.locator(SEL.viewBtn('rendered')).click();
      // Seit 4T-002408 trägt die Karteikarte der Demo die Sicht «Books by this
      // author», deren Körper eine eigene Überschrift hat; gemeint ist die der Ansicht.
      await expect(page.locator(`${PANE} .pane-rendered article.markdown-body > h1`)).toHaveText(
        'Umberto Eco',
      );

      // AK3: An «Readings», das keine Karteikarte ist, ist das Kommando nicht verfügbar.
      await page.locator(SEL.tabs0, { hasText: 'Readings' }).first().click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Readings');
      await expect(await paletteEintrag(app, page)).toHaveClass(/unavailable/);
      await page.keyboard.press('Escape');
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});

// --- DB-KAS-06: Sichten an der Tabellen-Definition (4T-002407) -----------------------------------
//
// 4T-002407 (Epic 3E-000266, F6 A, S4; Story 4S-001128, AK1, AK2, AK4): Die
// Definition von «Authors» nennt mit `views` die Abfrage-Datei «Books by this
// author». Unter der Karteikarte «Umberto Eco» steht in der Lese-Ansicht unter
// dem Dateikopf und vor dem Freitext ein Block mit dieser Kopfzeile und den
// beiden Büchern von Umberto Eco aus «Library», nicht aber Bücher anderer
// Autoren: `this.name` meint die Karteikarte und nicht die Abfrage-Datei. Die
// Datei der Karteikarte bleibt zeichengleich, und in der Live-Ansicht erscheint
// kein Block. Der Fall ist zugleich die Laufzeit-Prüfung einer eingebetteten
// Abfrage (Tabelle zu F9 des Epics). Seit 4T-002408 trägt die Demo die Sicht:
// die Abfrage-Datei im Ordner «Authors» und die Angabe `views` an `Authors.md`.

const SICHT_BLOCK = `${SEL.markdownBody0} .db-card-views .db-card-view`;

test.describe('DB-KAS-06: Sichten an der Tabellen-Definition (4T-002407)', () => {
  test('die Sicht steht unter dem Dateikopf mit den Büchern des Autors, die Datei bleibt unverändert', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ziel = await demoBereich(page, 'em4me-kartei-sichten-');
      // 4T-002408: Sicht-Datei und Angabe `views` kommen aus der Demo.
      await datenbankBereit(page);
      const tabelle = path.join(ziel, 'Authors', 'Authors.md');
      expect(fs.readFileSync(tabelle, 'utf8')).toContain('  views:\n    - Books by this author\n');
      // Erst wenn der Katalog die Sicht kennt, ist die Ausgangslage hergestellt.
      const sichtenDesKatalogs = async () => {
        const sichten = await page.evaluate(async () => {
          const u = await window.api.databaseOverview({});
          const authors = (u.tabellen || []).find((t) => t.name === 'Authors');
          return authors && Array.isArray(authors.sichten) ? authors.sichten : null;
        });
        return sichten && sichten.map((s) => [s.name, s.path ? path.basename(s.path) : null]);
      };
      await expect
        .poll(sichtenDesKatalogs, { timeout: 30000 })
        .toEqual([['Books by this author', 'Books by this author.md']]);

      const karte = path.join(ziel, 'Authors', 'Umberto Eco.md');
      const vorher = fs.readFileSync(karte, 'utf8');
      await oeffneDokumentImFenster(app, page, karte);
      await page.locator(SEL.viewBtn('rendered')).click();

      // AK3: ein Block mit Kopfzeile unter dem Dateikopf und vor dem Freitext.
      const block = page.locator(SICHT_BLOCK);
      await expect(block).toHaveCount(1, { timeout: 30000 });
      await expect(block.locator('.db-card-view-link')).toHaveText('Books by this author');
      await expect(block.locator('.db-card-view-label')).toHaveText(DE['database.card.viewLabel']);
      // Die Ansicht selbst, nicht der Körper der Sicht, der ebenfalls `.markdown-body` trägt.
      const lage = await page
        .locator(`${PANE} .pane-rendered article.markdown-body`)
        .evaluate((el) => {
          const sichten = el.querySelector(':scope > .db-card-views');
          const titel = el.querySelector(':scope > h1');
          return {
            davor:
              sichten && sichten.previousElementSibling.classList.contains('frontmatter-block'),
            freitextDanach: !!(sichten && titel && sichten.compareDocumentPosition(titel) & 4),
          };
        });
      expect(lage).toEqual({ davor: true, freitextDanach: true });

      // Bezug ist die Karteikarte: die beiden Bücher von Umberto Eco, kein anderes.
      const ergebnis = block.locator('.perspective-query');
      await expect(ergebnis).toContainText('The Name of the Rose', { timeout: 30000 });
      await expect(ergebnis).toContainText("Foucault's Pendulum");
      await expect(ergebnis).not.toContainText('Solaris');

      // AK4: nicht bearbeitbar, nichts in der Datei.
      await expect(block.locator('[contenteditable="true"]')).toHaveCount(0);
      expect(fs.readFileSync(karte, 'utf8')).toBe(vorher);

      // AK4 (S4): In der Live-Ansicht erscheint keine Sicht.
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect(page.locator(`${PANE} .pane-source .db-card-view`)).toHaveCount(0);
      await expect(page.locator(SICHT_BLOCK)).toBeHidden();
      expect(fs.readFileSync(karte, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});
