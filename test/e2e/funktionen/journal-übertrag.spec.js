// 4T-002738 (Epic 3E-000396): E2E-Suite «Offene Aufgaben ins Journal
// übertragen» — Auslöser beim Anlegen des Eintrags der laufenden Periode, Befehl
// von Hand und die Einstellung je Journal, an der gestarteten Anwendung über den
// Kanal des Hauptprozesses.
//
// JU-01: Anlegen mit Übertrag (Abnahme-Handgriff der Story): zwei offene
//        Aufgaben unter «Aufgaben» wandern, erledigte und abgebrochene bleiben.
// JU-02: Der jüngste frühere Eintrag liegt Tage zurück; eine Aufgabe wandert mit
//        ihren Unteraufgaben. Ein Eintrag für morgen löst nichts aus.
// JU-03: Ein zweiter Lauf über den Befehl fügt nichts hinzu und meldet es.
// JU-04: «Nur aus Abschnitt» beschränkt den Übertrag samt Unter-Abschnitten.
// JU-05: Zwei Journale mit verschiedener Einstellung; «entfernen» im einen,
//        Schalter aus im anderen.
// JU-06: Befehl bei bestehendem Eintrag und ausgeschaltetem Schalter; Befehl
//        ohne früheren Eintrag meldet das.
// JU-07: Der alte Eintrag ist im selben Fenster ungespeichert geändert.
// JU-08: Der alte Eintrag ist in einem zweiten Fenster ungespeichert geändert.
// JU-09: Die Vorlage bringt eine Aufgabe schon mit (ohne und mit Unterpunkten im
//        alten Eintrag).
// JU-10: Erweiterung «Journale» aus: Befehl nicht in der Palette, Anlegen über
//        das Kalender-Panel überträgt nichts.
// JU-11: Die drei Felder der Gruppe «Offene Aufgaben übertragen» im
//        Journal-Editor der Einstellungen werden gespeichert und wirken.
// JU-12: Vorgaben eines neuen und eines bestehenden Journals ohne die Felder;
//        eine andere Änderung schreibt die Vorgaben mit.
// JU-13: Der Befehl über das Anwendungs-Menü; ohne Erweiterung kein Eintrag.
// JU-14: Das Kästchen einer übertragenen Zeile in der gerenderten Ansicht;
//        ein Klick öffnet die Aufgabe wieder.
// JU-15: Befehl nach dem selbsttätigen Übertrag in der Ansicht «Gerendert»,
//        beide Einträge in offenen Reitern: meldet nichts Offenes statt
//        ungespeicherter Änderungen.
//
// Jeder Fall prüft am Ende den Inhalt beider Dateien auf der Platte. Datums-
// Bezug: Die Journal-Fälle haben keine Uhr-Steuerung; die Einträge entstehen
// deshalb relativ zum tatsächlichen heutigen Datum (Muster journale.spec.js).
// Aufgaben-Texte ASCII-sicher, damit Text-Vergleiche vom Konsolen-Encoding
// unabhängig bleiben.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { pressUntil, pressUntilVisible, oeffneEinstellungsSeite } = require('../helpers/eingabe');
const { leseJsonOderNull } = require('../helpers/dateien');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');

const ZEIT = { timeout: 15000 };
const HINWEIS = '#statusbar-hint';
const PALETTE = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';
const BEFEHL = 'Offene Aufgaben in den aktuellen Journal-Eintrag';
const AUSWAHL = '#template-select-modal';
// Puffer-Schicht des Hauptprozesses (JU-15).
const OVERLAY = path.resolve(__dirname, '..', '..', '..', 'src', 'main', 'index', 'overlay.js');
const UEBERTRAGEN = '»'; // Zeichen des Status «Übertragen» (»)

// Lokales Datum als yyyy-MM-dd, verschoben um `tage` (konsistent zum
// Perioden-Kern, der in Ortszeit rechnet).
function iso(tage = 0) {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Tages-Journal ohne Regal, Einträge flach im Ordner `ordner`.
function tagesJournal(id, name, ordner, zusatz = {}) {
  return {
    id,
    name,
    granularity: 'day',
    folderPattern: ordner,
    namePattern: '{{date}}',
    ...zusatz,
  };
}

// Bereich mit journals-Sektion und vorab geschriebenen Einträgen
// (bereichsrelativer Pfad -> Inhalt).
function makeArea(journals, dateien = {}) {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-ju-area-'));
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify(
      { schemaVersion: 1, settings: { journals: { shelves: [], journals } } },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  for (const [rel, inhalt] of Object.entries(dateien)) {
    const abs = path.join(areaRoot, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, inhalt, 'utf8');
  }
  return areaRoot;
}

function makeTemplatesDir(inhalt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-ju-vorlagen-'));
  fs.writeFileSync(path.join(dir, 'Tag.md'), inhalt, 'utf8');
  return dir;
}

// Profil: Deutsch, Quelltext-Ansicht (damit ein Eintrag ohne Vorlage gleich
// im Editor steht und getippt werden kann), Kürzel für die beiden bestehenden
// Journal-Kommandos.
// `gerendert` lässt die Vorgabe des Programms stehen (Ansicht «Gerendert»),
// in der ein Anwender ohne eigene Einstellung arbeitet (JU-15).
function einstellungen({ templatesDir = null, disabled = [], gerendert = false } = {}) {
  return {
    language: 'de',
    ...(gerendert ? {} : { app: { defaultViewMode: 'source' } }),
    hotkeys: { 'journal.openToday': 'Ctrl+Alt+7', 'journal.openForDate': 'Ctrl+Alt+6' },
    ...(templatesDir ? { templates: { folder: templatesDir } } : {}),
    ...(disabled.length > 0 ? { extensions: { disabled } } : {}),
  };
}

function removeDir(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

const datei = (areaRoot, rel) => path.join(areaRoot, ...rel.split('/'));
const lies = (abs) => (fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
const zeilen = (abs) => (lies(abs) || '').split(/\r?\n/);
const anzahl = (abs, zeile) => zeilen(abs).filter((z) => z === zeile).length;

async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

// «Heutiger Journal-Eintrag» über das belegte Kürzel. Bei mehreren
// Tages-Journalen erscheint die Auswahl; `name` wählt darin.
async function heuteAnlegen(page, ziel, name = null) {
  if (name) {
    await pressUntilVisible(page, 'Control+Alt+7', page.locator(AUSWAHL));
    await page.locator('#template-select-list button', { hasText: name }).click();
  } else {
    await pressUntil(page, 'Control+Alt+7', async () => fs.existsSync(ziel));
  }
  await expect.poll(() => fs.existsSync(ziel), ZEIT).toBe(true);
  await expect(page.locator(SEL.activeTab0)).toContainText(path.basename(ziel, '.md'), ZEIT);
}

// «Journal-Eintrag für Datum…» über das belegte Kürzel (öffnet oder legt an).
async function fuerDatum(page, datum) {
  const modal = page.locator('#name-input-modal');
  await pressUntilVisible(page, 'Control+Alt+6', modal);
  await page.locator('#name-input-field').fill(datum);
  await page.locator('#btn-name-input-ok').click();
  await expect(modal).toBeHidden();
}

// Kommando-Palette öffnen und den Filter setzen.
async function paletteMit(page, text) {
  await expect
    .poll(async () => {
      if (await page.locator(PALETTE).isVisible()) return true;
      await page.keyboard.press('Control+k');
      return page.locator(PALETTE).isVisible();
    })
    .toBe(true);
  await page.locator(PALETTE_FILTER).fill(text);
}

// Der Befehl von Hand über die Kommando-Palette; bei mehreren Journalen wählt
// `name` in der Auswahl.
async function befehl(page, name = null) {
  await paletteMit(page, BEFEHL);
  await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator(PALETTE)).toBeHidden();
  if (name) {
    await expect(page.locator(AUSWAHL)).toBeVisible();
    await page.locator('#template-select-list button', { hasText: name }).click();
  }
}

// Am Ende der Zeile `text` im aktiven Editor tippen (ungespeicherte Änderung).
async function tippeHinter(page, text) {
  // Ein bestehender Eintrag öffnet ohne Bearbeitungs-Modus (Muster
  // bereichs-panel.spec.js: erst den Modus einschalten, dann tippen).
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
  const zeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: text }).first();
  await expect(zeile).toBeVisible(ZEIT);
  await zeile.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' geaendert');
  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
}

const GESTERN_AUFGABEN = [
  '# Gestern',
  '',
  '## Aufgaben',
  '',
  '- [ ] Angebot nachfassen',
  '- [ ] Rechnung pruefen',
  '- [x] Erledigt gestern',
  '- [-] Abgebrochen gestern',
  '',
].join('\n');

// --- JU-01 ---------------------------------------------------------------------------

test.describe('JU-01: Anlegen mit Übertrag, Abnahme-Handgriff der Story (4T-002738)', () => {
  test('der neue Eintrag erscheint mit den offenen Aufgaben, der alte trägt die Kennzeichnung', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea(
      [tagesJournal('tag', 'Tag', 'Journal', { template: 'Tag.md', carryOverAuto: true })],
      { [gestern]: GESTERN_AUFGABEN },
    );
    const templatesDir = makeTemplatesDir('# {{title}}\n\n## Aufgaben\n\n{{cursor}}\n');
    const { app, page, userData } = await launchApp({ settings: einstellungen({ templatesDir }) });
    try {
      await bindArea(page, areaRoot);
      await heuteAnlegen(page, datei(areaRoot, heute));

      // Der Eintrag zeigt die Aufgaben sofort, nicht erst nach einem Neuladen.
      await expect(page.locator(SEL.editorContent0)).toContainText('Angebot nachfassen', ZEIT);
      await expect(page.locator(SEL.editorContent0)).toContainText('Rechnung pruefen');
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2');

      const neu = zeilen(datei(areaRoot, heute));
      const ab = neu.indexOf('## Aufgaben');
      expect(ab).toBeGreaterThanOrEqual(0);
      expect(neu.indexOf('- [ ] Angebot nachfassen')).toBeGreaterThan(ab);
      expect(neu.indexOf('- [ ] Rechnung pruefen')).toBeGreaterThan(
        neu.indexOf('- [ ] Angebot nachfassen'),
      );
      expect(anzahl(datei(areaRoot, heute), '## Aufgaben')).toBe(1);
      expect(lies(datei(areaRoot, heute))).not.toContain('Erledigt gestern');
      expect(lies(datei(areaRoot, heute))).not.toContain('Abgebrochen gestern');

      const alt = zeilen(datei(areaRoot, gestern));
      expect(alt).toContain(`- [${UEBERTRAGEN}] Angebot nachfassen`);
      expect(alt).toContain(`- [${UEBERTRAGEN}] Rechnung pruefen`);
      expect(alt).toContain('- [x] Erledigt gestern');
      expect(alt).toContain('- [-] Abgebrochen gestern');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
      removeDir(templatesDir);
    }
  });
});

// --- JU-02 ---------------------------------------------------------------------------

test.describe('JU-02: Eintrag Tage zurück, Aufgabe mit Unteraufgaben (4T-002738)', () => {
  test('überträgt aus dem jüngsten früheren Eintrag samt Teilbaum; morgen löst nichts aus', async () => {
    const alt = `Journal/${iso(-3)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const morgen = `Journal/${iso(1)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true })], {
      [alt]: [
        '## Aufgaben',
        '',
        '- [ ] Projekt planen',
        '  - [ ] Teil eins',
        '  - [x] Teil zwei',
        '',
      ].join('\n'),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 1');

      const neu = zeilen(datei(areaRoot, heute));
      const i = neu.indexOf('- [ ] Projekt planen');
      expect(i).toBeGreaterThan(neu.indexOf('## Aufgaben'));
      expect(neu.slice(i, i + 3)).toEqual([
        '- [ ] Projekt planen',
        '  - [ ] Teil eins',
        '  - [x] Teil zwei',
      ]);
      expect(zeilen(datei(areaRoot, alt))).toEqual(
        expect.arrayContaining([
          `- [${UEBERTRAGEN}] Projekt planen`,
          `  - [${UEBERTRAGEN}] Teil eins`,
          `  - [${UEBERTRAGEN}] Teil zwei`,
        ]),
      );

      // Ein Eintrag für eine andere Periode als die laufende löst nichts aus,
      // obwohl der heutige Eintrag offene Aufgaben trägt.
      const heuteVorher = lies(datei(areaRoot, heute));
      await fuerDatum(page, iso(1));
      await expect.poll(() => fs.existsSync(datei(areaRoot, morgen)), ZEIT).toBe(true);
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(1), ZEIT);
      expect(lies(datei(areaRoot, morgen))).not.toContain('Projekt planen');
      expect(lies(datei(areaRoot, heute))).toBe(heuteVorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-03 ---------------------------------------------------------------------------

test.describe('JU-03: Zweiter Lauf fügt nichts hinzu (4T-002738)', () => {
  test('der Befehl nach dem selbsttätigen Übertrag ändert keine Datei und meldet nichts Offenes', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true })], {
      [gestern]: GESTERN_AUFGABEN,
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2');
      const altVorher = lies(datei(areaRoot, gestern));
      const neuVorher = lies(datei(areaRoot, heute));

      await befehl(page);
      await expect(page.locator(HINWEIS)).toContainText(
        `Keine offenen Aufgaben in «${iso(-1)}»`,
        ZEIT,
      );
      expect(lies(datei(areaRoot, gestern))).toBe(altVorher);
      expect(lies(datei(areaRoot, heute))).toBe(neuVorher);
      expect(anzahl(datei(areaRoot, heute), '- [ ] Angebot nachfassen')).toBe(1);
      expect(zeilen(datei(areaRoot, gestern))).toContain('- [x] Erledigt gestern');
      expect(zeilen(datei(areaRoot, gestern))).toContain('- [-] Abgebrochen gestern');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-15 ---------------------------------------------------------------------------

// Befund des Probe-Durchlaufs der Prüf-Anleitung vom 2026-11-15 (Handgriff 2):
// Nach dem selbsttätigen Übertrag meldete der Befehl von Hand «ungespeicherte
// Änderungen», obwohl kein Reiter geändert war. Die Puffer-Schicht des
// Hauptprozesses führt nach dem stillen Neuladen eines offenen Reiters dessen
// Text, auch wenn er dem Platten-Stand gleicht; der Kanal hielt jeden solchen
// Stand für ungespeichert. Der Fall stellt den gemeldeten Ablauf nach: Vorgabe
// der Ansicht, alter und neuer Eintrag in offenen Reitern.
test.describe('JU-15: Befehl nach dem Übertrag bei offenen Reitern, Ansicht «Gerendert» (4T-002740)', () => {
  test('meldet nichts Offenes statt ungespeicherter Änderungen und ändert keine Datei', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true })], {
      [gestern]: GESTERN_AUFGABEN,
    });
    const { app, page, userData } = await launchApp({
      settings: einstellungen({ gerendert: true }),
    });
    try {
      await bindArea(page, areaRoot);
      // Der alte Eintrag steht in einem Reiter, bevor der neue entsteht.
      await fuerDatum(page, iso(-1));
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(-1), ZEIT);
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2');
      // Der Reiter des neuen Eintrags zeigt den übertragenen Stand (stilles
      // Neuladen abgeschlossen), und kein Reiter ist ungespeichert.
      await expect(page.locator(SEL.markdownBody0)).toContainText('Angebot nachfassen', ZEIT);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      const altVorher = lies(datei(areaRoot, gestern));
      const neuVorher = lies(datei(areaRoot, heute));

      // Der Zustand, an dem der Fehler hing: Die Puffer-Schicht führt den Text
      // des neu geladenen Reiters, und er gleicht dem Platten-Stand. Er stellt
      // sich erst Sekunden nach dem Übertrag ein; gewartet wird auf ihn, nicht
      // auf eine feste Zeit.
      await expect
        .poll(
          () =>
            hauptLesen(
              app,
              (_e, { overlay, abs }) => {
                const laden = process.getBuiltinModule('node:module').createRequire(overlay);
                return laden(overlay).bufferTextFor(abs);
              },
              { overlay: OVERLAY, abs: datei(areaRoot, heute) },
            ),
          ZEIT,
        )
        .toBe(neuVorher);

      await befehl(page);
      await expect(page.locator(HINWEIS)).toContainText(
        `Keine offenen Aufgaben in «${iso(-1)}»`,
        ZEIT,
      );
      expect(lies(datei(areaRoot, gestern))).toBe(altVorher);
      expect(lies(datei(areaRoot, heute))).toBe(neuVorher);
      expect(anzahl(datei(areaRoot, heute), '- [ ] Angebot nachfassen')).toBe(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-04 ---------------------------------------------------------------------------

test.describe('JU-04: Nur aus Abschnitt (4T-002738)', () => {
  test('überträgt allein die Aufgaben unter der genannten Überschrift samt Unter-Abschnitten', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea(
      [tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true, carryOverSection: 'Arbeit' })],
      {
        [gestern]: [
          '## Privat',
          '',
          '- [ ] Einkaufen',
          '',
          '## Arbeit',
          '',
          '- [ ] Bericht schreiben',
          '',
          '### Details',
          '',
          '- [ ] Zahlen holen',
          '',
        ].join('\n'),
      },
    );
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2');

      const neu = lies(datei(areaRoot, heute));
      expect(neu).toContain('- [ ] Bericht schreiben');
      expect(neu).toContain('- [ ] Zahlen holen');
      expect(neu).not.toContain('Einkaufen');
      const alt = zeilen(datei(areaRoot, gestern));
      expect(alt).toContain('- [ ] Einkaufen');
      expect(alt).toContain(`- [${UEBERTRAGEN}] Bericht schreiben`);
      expect(alt).toContain(`- [${UEBERTRAGEN}] Zahlen holen`);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-05 ---------------------------------------------------------------------------

test.describe('JU-05: Zwei Journale mit verschiedener Einstellung, «entfernen» (4T-002738)', () => {
  test('die Einstellung des einen Journals wirkt nicht auf das andere', async () => {
    const gesternA = `Arbeit/${iso(-1)}.md`;
    const heuteA = `Arbeit/${iso(0)}.md`;
    const gesternB = `Privat/${iso(-1)}.md`;
    const heuteB = `Privat/${iso(0)}.md`;
    const quelle = ['## Aufgaben', '', '- [ ] Offen bleiben', '- [x] Schon fertig', ''].join('\n');
    const areaRoot = makeArea(
      [
        tagesJournal('arbeit', 'Arbeit', 'Arbeit', {
          carryOverAuto: true,
          carryOverMode: 'remove',
        }),
        tagesJournal('privat', 'Privat', 'Privat'),
      ],
      { [gesternA]: quelle, [gesternB]: quelle },
    );
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);

      await heuteAnlegen(page, datei(areaRoot, heuteA), 'Arbeit');
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 1');
      expect(zeilen(datei(areaRoot, heuteA))).toContain('- [ ] Offen bleiben');
      // «entfernen»: Die Aufgabe ist im alten Eintrag weg, ohne Kennzeichen.
      expect(lies(datei(areaRoot, gesternA))).not.toContain('Offen bleiben');
      expect(zeilen(datei(areaRoot, gesternA))).toContain('- [x] Schon fertig');

      // Schalter aus: kein Übertrag, beide Dateien des zweiten Journals bleiben.
      await heuteAnlegen(page, datei(areaRoot, heuteB), 'Privat');
      expect(lies(datei(areaRoot, heuteB))).not.toContain('Offen bleiben');
      expect(lies(datei(areaRoot, gesternB))).toBe(quelle);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-06 ---------------------------------------------------------------------------

test.describe('JU-06: Befehl bei bestehendem Eintrag und ausgeschaltetem Schalter (4T-002738)', () => {
  test('überträgt in den bestehenden Eintrag; ohne früheren Eintrag meldet er das', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const heuteLeer = `Leer/${iso(0)}.md`;
    const heuteInhalt = '# Heute\n\n## Aufgaben\n\n- [ ] Schon da\n';
    const areaRoot = makeArea(
      [tagesJournal('tag', 'Tag', 'Journal'), tagesJournal('leer', 'Leer', 'Leer')],
      { [gestern]: GESTERN_AUFGABEN, [heute]: heuteInhalt },
    );
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);

      await befehl(page, 'Tag');
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2', ZEIT);
      await expect
        .poll(() => zeilen(datei(areaRoot, heute)), ZEIT)
        .toContain('- [ ] Angebot nachfassen');
      const neu = zeilen(datei(areaRoot, heute));
      expect(neu).toContain('- [ ] Schon da');
      expect(neu).toContain('- [ ] Rechnung pruefen');
      expect(anzahl(datei(areaRoot, heute), '## Aufgaben')).toBe(1);
      expect(zeilen(datei(areaRoot, gestern))).toContain(`- [${UEBERTRAGEN}] Angebot nachfassen`);
      // Der geöffnete, gespeicherte Reiter zieht den neuen Stand nach.
      await expect(page.locator(SEL.editorContent0)).toContainText('Angebot nachfassen', ZEIT);

      // Ohne früheren Eintrag: Der Eintrag entsteht, die Statusleiste sagt es.
      await befehl(page, 'Leer');
      await expect(page.locator(HINWEIS)).toContainText(
        'Kein früherer Eintrag in diesem Journal',
        ZEIT,
      );
      expect(fs.existsSync(datei(areaRoot, heuteLeer))).toBe(true);
      expect(lies(datei(areaRoot, heuteLeer))).not.toContain('- [');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-07 ---------------------------------------------------------------------------

test.describe('JU-07: Ungespeicherter alter Eintrag im selben Fenster (4T-002738)', () => {
  test('der neue Eintrag entsteht ohne Aufgaben, der alte bleibt auf der Platte unverändert', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true })], {
      [gestern]: GESTERN_AUFGABEN,
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await fuerDatum(page, iso(-1));
      await expect(page.locator(SEL.activeTab0)).toContainText(iso(-1), ZEIT);
      // Das Öffnen über das Datums-Kommando ergänzt fehlende Journal-
      // Eigenschaften (Nachpflege); maßgeblich ist der Stand danach.
      const altVorher = lies(datei(areaRoot, gestern));
      await tippeHinter(page, 'Rechnung pruefen');

      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText(
        `«${iso(-1)}» hat ungespeicherte Änderungen`,
        ZEIT,
      );
      expect(lies(datei(areaRoot, heute))).not.toContain('Angebot nachfassen');
      expect(lies(datei(areaRoot, gestern))).toBe(altVorher);
      expect(altVorher).toContain('- [ ] Angebot nachfassen');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-08 ---------------------------------------------------------------------------

test.describe('JU-08: Ungespeicherter alter Eintrag in einem zweiten Fenster (4T-002738)', () => {
  test('der Hauptprozess erkennt den fremden Stand; nichts wird übertragen', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true })], {
      [gestern]: GESTERN_AUFGABEN,
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      // Zweites Fenster derselben Applikation (und damit desselben Bereichs)
      // mit dem alten Eintrag als Reiter.
      const neu = app.waitForEvent('window');
      await page.evaluate(
        (p) => window.api.openNewWindow([{ paths: [p], activeIndex: 0 }], null),
        datei(areaRoot, gestern),
      );
      const zweites = await neu;
      await zweites.waitForLoadState('domcontentloaded');
      await expect(zweites.locator(SEL.activeTab0)).toContainText(iso(-1), ZEIT);
      await tippeHinter(zweites, 'Rechnung pruefen');
      // Die Puffer-Schicht des Hauptprozesses erfährt die Änderung rund 0,3
      // Sekunden nach der Eingabe (Nachweis V8 des Epics); das erste Fenster
      // kennt den Stand nicht selbst.
      await zweites.waitForTimeout(1500);

      await page.bringToFront();
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText(
        `«${iso(-1)}» hat ungespeicherte Änderungen`,
        ZEIT,
      );
      expect(lies(datei(areaRoot, heute))).not.toContain('Angebot nachfassen');
      expect(lies(datei(areaRoot, gestern))).toBe(GESTERN_AUFGABEN);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-09 ---------------------------------------------------------------------------

test.describe('JU-09: Aufgabe aus der Vorlage steht schon da (4T-002738)', () => {
  test('ohne Unterpunkte kommt sie nicht doppelt, mit Unterpunkten wandert sie mit ihnen', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea(
      [tagesJournal('tag', 'Tag', 'Journal', { template: 'Tag.md', carryOverAuto: true })],
      {
        [gestern]: [
          '## Aufgaben',
          '',
          '- [ ] Posteingang leeren',
          '- [ ] Bericht abgeben',
          '  - [ ] Anhang beifuegen',
          '',
        ].join('\n'),
      },
    );
    const templatesDir = makeTemplatesDir(
      '## Aufgaben\n\n- [ ] Posteingang leeren\n- [ ] Bericht abgeben\n{{cursor}}\n',
    );
    const { app, page, userData } = await launchApp({ settings: einstellungen({ templatesDir }) });
    try {
      await bindArea(page, areaRoot);
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen', ZEIT);

      const neu = datei(areaRoot, heute);
      expect(anzahl(neu, '- [ ] Posteingang leeren')).toBe(1);
      expect(anzahl(neu, '- [ ] Bericht abgeben')).toBe(2);
      expect(zeilen(neu)).toContain('  - [ ] Anhang beifuegen');
      const alt = zeilen(datei(areaRoot, gestern));
      expect(alt).toContain(`- [${UEBERTRAGEN}] Posteingang leeren`);
      expect(alt).toContain(`- [${UEBERTRAGEN}] Bericht abgeben`);
      expect(alt).toContain(`  - [${UEBERTRAGEN}] Anhang beifuegen`);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
      removeDir(templatesDir);
    }
  });
});

// --- JU-10 ---------------------------------------------------------------------------

test.describe('JU-10: Erweiterung «Journale» aus (4T-002738)', () => {
  test('der Befehl fehlt in der Palette, das Kalender-Panel legt ohne Übertrag an', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal', { carryOverAuto: true })], {
      [gestern]: GESTERN_AUFGABEN,
    });
    const { app, page, userData } = await launchApp({
      settings: einstellungen({ disabled: ['journals'] }),
    });
    try {
      await bindArea(page, areaRoot);
      // Ein Fenster desselben Bereichs mit einem geöffneten Dokument: Das
      // Kalender-Panel erscheint erst in einem nicht leeren Fenster.
      const neu = app.waitForEvent('window');
      await page.evaluate(
        (p) => window.api.openNewWindow([{ paths: [p], activeIndex: 0 }], null),
        datei(areaRoot, gestern),
      );
      const fenster = await neu;
      await fenster.waitForLoadState('domcontentloaded');
      await expect(fenster.locator(SEL.activeTab0)).toContainText(iso(-1), ZEIT);

      await paletteMit(fenster, BEFEHL);
      await expect(fenster.locator(PALETTE_ITEM)).toHaveCount(0);
      await fenster.keyboard.press('Escape');
      await expect(fenster.locator(PALETTE)).toBeHidden();

      const cal = fenster.locator('.pane-group[data-pane="0"] .sidebar-calendar');
      await expect
        .poll(async () => {
          if (!(await cal.isVisible())) await fenster.locator('#btn-calendar').click();
          return cal.isVisible();
        }, ZEIT)
        .toBe(true);
      await cal.locator('.calendar-day-btn.today').click();
      await expect.poll(() => fs.existsSync(datei(areaRoot, heute)), ZEIT).toBe(true);
      await expect(fenster.locator(SEL.activeTab0)).toContainText(iso(0), ZEIT);
      expect(lies(datei(areaRoot, heute))).not.toContain('Angebot nachfassen');
      expect(lies(datei(areaRoot, gestern))).toBe(GESTERN_AUFGABEN);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- Einstellung im Journal-Editor (JU-11, JU-12) -------------------------------------

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const FELD_AUTO = (i) => `#settings-journals-carryover-auto-${i}`;
const FELD_MODUS = (i) => `#settings-journals-carryover-mode-${i}`;
const FELD_ABSCHNITT = (i) => `#settings-journals-carryover-section-${i}`;

// Einstellungs-Seite, Bereich «Journale», Zeile «Ohne Regal» öffnen: Die
// Detailansicht zeigt die Editoren der Journale ohne Regal.
async function journalEditorOeffnen(page) {
  await oeffneEinstellungsSeite(page);
  await page.locator('.settings-nav-entry[data-section-id="journals"]').click();
  await page.locator('#settings-journals-shelf-open-none').click();
  await expect(page.locator('#settings-journals-shelf-close')).toBeVisible();
}

async function einstellungenUebernehmen(page) {
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
}

// Die journals-Liste der Bereichsdatei (null, solange nicht lesbar).
function journaleAufPlatte(areaRoot) {
  const json = leseJsonOderNull(path.join(areaRoot, 'Area_Settings.mdda'));
  return json && json.settings && json.settings.journals ? json.settings.journals.journals : null;
}

// Die drei Felder des Übertrags eines Journals der Bereichsdatei.
function uebertragFelder(journal) {
  if (!journal) return null;
  const { carryOverAuto, carryOverMode, carryOverSection } = journal;
  return { carryOverAuto, carryOverMode, carryOverSection };
}

test.describe('JU-11: Einstellung im Journal-Editor speichern und anwenden (4T-002738)', () => {
  test('die drei Felder landen in der Bereichsdatei, stehen wieder im Editor und wirken', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal')], {
      [gestern]: [
        '## Privat',
        '',
        '- [ ] Einkaufen',
        '',
        '## Aufgaben',
        '',
        '- [ ] Angebot nachfassen',
        '',
      ].join('\n'),
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await journalEditorOeffnen(page);
      await page.locator(FELD_AUTO(0)).check();
      await page.locator(FELD_MODUS(0)).selectOption('remove');
      await page.locator(FELD_ABSCHNITT(0)).fill('Aufgaben');
      await einstellungenUebernehmen(page);

      await expect
        .poll(() => uebertragFelder((journaleAufPlatte(areaRoot) || [])[0]), ZEIT)
        .toEqual({ carryOverAuto: true, carryOverMode: 'remove', carryOverSection: 'Aufgaben' });

      // Erneut geöffnet zeigt der Editor die gespeicherten Werte.
      await journalEditorOeffnen(page);
      await expect(page.locator(FELD_AUTO(0))).toBeChecked();
      await expect(page.locator(FELD_MODUS(0))).toHaveValue('remove');
      await expect(page.locator(FELD_ABSCHNITT(0))).toHaveValue('Aufgaben');
      await einstellungenUebernehmen(page);

      // Wirkung ohne Neustart: Anlegen überträgt nur aus «Aufgaben» und
      // entfernt die Aufgabe im alten Eintrag.
      await heuteAnlegen(page, datei(areaRoot, heute));
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 1', ZEIT);
      const neu = lies(datei(areaRoot, heute));
      expect(neu).toContain('- [ ] Angebot nachfassen');
      expect(neu).not.toContain('Einkaufen');
      expect(lies(datei(areaRoot, gestern))).not.toContain('Angebot nachfassen');
      expect(zeilen(datei(areaRoot, gestern))).toContain('- [ ] Einkaufen');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

test.describe('JU-12: Vorgaben der Übertrag-Felder (4T-002738)', () => {
  test('neues und bestehendes Journal zeigen die Vorgaben; Speichern schreibt sie mit', async () => {
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal')]);
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await journalEditorOeffnen(page);

      // Bestehendes Journal ohne die drei Felder in der Bereichsdatei.
      await expect(page.locator(FELD_AUTO(0))).not.toBeChecked();
      await expect(page.locator(FELD_MODUS(0))).toHaveValue('mark');
      await expect(page.locator(FELD_ABSCHNITT(0))).toHaveValue('');

      // Neu hinzugefügtes Journal.
      await page.locator('#settings-journals-add').click();
      await expect(page.locator(FELD_AUTO(1))).toBeVisible();
      await expect(page.locator(FELD_AUTO(1))).not.toBeChecked();
      await expect(page.locator(FELD_MODUS(1))).toHaveValue('mark');
      await expect(page.locator(FELD_ABSCHNITT(1))).toHaveValue('');
      await page.locator('#settings-journals-name-1').fill('Neu');
      await page.locator('#settings-journals-folder-1').fill('Neu');

      // Eine andere Änderung am bestehenden Journal: der Name.
      await page.locator('#settings-journals-name-0').fill('Tagebuch');
      await einstellungenUebernehmen(page);

      const vorgabe = { carryOverAuto: false, carryOverMode: 'mark', carryOverSection: '' };
      await expect
        .poll(() => (journaleAufPlatte(areaRoot) || []).map((j) => j.name), ZEIT)
        .toEqual(['Tagebuch', 'Neu']);
      const journale = journaleAufPlatte(areaRoot);
      expect(uebertragFelder(journale[0])).toEqual(vorgabe);
      expect(uebertragFelder(journale[1])).toEqual(vorgabe);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-13 ---------------------------------------------------------------------------

const MENUE_EINTRAG = 'Offene Aufgaben in den aktuellen Journal-Eintrag übertragen';

// Menü-Kanal an das Fenster senden, wie es der Klick auf den Menü-Eintrag tut
// (Muster vor-und-zurück.spec.js, sendeMenue).
async function sendeMenue(app, kanal) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, k) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(k);
    },
    kanal,
  );
}

test.describe('JU-13: Befehl über das Anwendungs-Menü (4T-002738)', () => {
  test('der Menü-Eintrag steht im Menü und überträgt in den heutigen Eintrag', async () => {
    const gestern = `Journal/${iso(-1)}.md`;
    const heute = `Journal/${iso(0)}.md`;
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal')], {
      [gestern]: GESTERN_AUFGABEN,
    });
    const { app, page, userData } = await launchApp({ settings: einstellungen() });
    try {
      await bindArea(page, areaRoot);
      await expect
        .poll(async () => {
          const eintrag = menuEintrag(await menuZustand(app, ''), MENUE_EINTRAG);
          return eintrag ? eintrag.enabled : null;
        }, ZEIT)
        .toBe(true);

      await sendeMenue(app, 'menu:journalCarryOver');
      await expect(page.locator(HINWEIS)).toContainText('Offene Aufgaben übertragen: 2', ZEIT);
      await expect
        .poll(() => zeilen(datei(areaRoot, heute)), ZEIT)
        .toContain('- [ ] Angebot nachfassen');
      expect(zeilen(datei(areaRoot, heute))).toContain('- [ ] Rechnung pruefen');
      expect(zeilen(datei(areaRoot, gestern))).toContain(`- [${UEBERTRAGEN}] Angebot nachfassen`);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });

  test('bei ausgeschalteter Erweiterung «Journale» fehlt der Menü-Eintrag', async () => {
    const areaRoot = makeArea([tagesJournal('tag', 'Tag', 'Journal')]);
    const { app, page, userData } = await launchApp({
      settings: einstellungen({ disabled: ['journals'] }),
    });
    try {
      await bindArea(page, areaRoot);
      const zustand = await menuZustand(app, '');
      // Gegenprobe: Das erfasste Menü enthält das Datei-Menü.
      expect(menuEintrag(zustand, 'Neue Datei aus Vorlage…')).not.toBeNull();
      expect(menuEintrag(zustand, MENUE_EINTRAG)).toBeNull();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(areaRoot);
    }
  });
});

// --- JU-14 ---------------------------------------------------------------------------

test.describe('JU-14: Übertragene Zeile in der gerenderten Ansicht (4T-002738)', () => {
  test('das Kästchen zeigt das Zeichen des Status, ein Klick öffnet die Aufgabe wieder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-ju-ansicht-'));
    const pfad = path.join(dir, 'Gestern.md');
    fs.writeFileSync(pfad, `## Aufgaben\n\n- [${UEBERTRAGEN}] Angebot nachfassen\n`, 'utf8');
    // Vorgabe-Ansicht «gerendert» (ohne defaultViewMode im Profil).
    const { app, page, userData } = await launchApp({ settings: { language: 'de' }, args: [pfad] });
    try {
      const body = page.locator(SEL.markdownBody0);
      const box = body.locator(`.task-state-box[data-task-state="${UEBERTRAGEN}"]`);
      await expect(box).toBeVisible(ZEIT);
      await expect(box).toHaveText(UEBERTRAGEN);
      await expect(box).toHaveAttribute('title', 'Übertragen');

      await box.click();
      await expect(box).toHaveCount(0);
      const zeile = body.locator('li', { hasText: 'Angebot nachfassen' });
      await expect(zeile.locator('input.task-list-item-checkbox')).not.toBeChecked();
      await pressUntil(page, 'Control+s', async () =>
        zeilen(pfad).includes('- [ ] Angebot nachfassen'),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dir);
    }
  });
});
