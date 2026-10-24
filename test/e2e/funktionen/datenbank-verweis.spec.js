// 4T-002333 (Epic 3E-000264, S9): E2E-Funktions-Suite — der Verweis auf einen
// Datensatz im Fließtext, in der realen Anordnung des Demo-Bereichs.
//
// DB-VER-01: Ein Klick auf `[[Library#^r-00001]]` öffnet das Buch in seiner
//            Maske, nicht die Tabellen-Datei.
// DB-VER-02: Kurzform `[[Library#^r-1]]` und Anzeige-Form
//            `[[Library#^The Name of the Rose]]` gelten als bestehende Verweise,
//            und ein Klick auf jede öffnet dieselbe Maske.
// DB-VER-03: Die Vorschlagsliste nach `[[Library#^` bietet ein Buch mit seinem
//            Titel an, und die Auswahl schreibt seine lange Kennung.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Ob ein
// Verweis auf einen Datensatz zeigt, entscheidet der Haupt-Prozess am Index des
// Bereichs; die Anzeige fragt ihn beim Klick und holt die Datensätze für die
// Vorschlagsliste über einen Kanal. Die Unit-Fälle prüfen beide Seiten getrennt,
// nur hier zeigt sich, dass die Verdrahtung im gebauten Ablauf trägt.
//
// **Sprachfrei geprüft:** Tabellen-Name, Titel und Kennungen stammen aus den
// Daten des Demo-Bereichs (`src/demo/Library.md`), nicht aus einer Beschriftung.
// Der Demo-Bereich entsteht über die Preload-Brücke in einem leeren Ordner
// (Muster `datenbank-suche.spec.js`); das Dokument mit den Verweisen legt der
// Fall dort an.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const VORSCHLAEGE = '.cm-tooltip-autocomplete';
const DOKUMENT = 'Verweise auf Buecher';
const ERSTES_BUCH = 'The Name of the Rose';
const LANG = 'Library#^r-00001';
const KURZ = 'Library#^r-1';
const NAME = `Library#^${ERSTES_BUCH}`;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Demo-Bereich in einem frischen, leeren Ordner anlegen und binden, das
// Dokument mit den drei Schreibweisen dort ablegen und im selben Fenster
// öffnen (Reihenfolge nach 4T-001689: erst binden, dann das Dokument).
async function starteMitVerweisen(app, page) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-verweis-'));
  const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
  expect(ergebnis.ok).toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  const dokument = path.join(ziel, `${DOKUMENT}.md`);
  fs.writeFileSync(
    dokument,
    [
      `# ${DOKUMENT}`,
      '',
      `Lang: [[${LANG}]]`,
      '',
      `Kurz: [[${KURZ}]]`,
      '',
      `Name: [[${NAME}]]`,
      '',
    ].join('\n'),
    'utf8',
  );
  await oeffneDokumentImFenster(app, page, dokument);
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  return { ziel, dokument };
}

// Aufbau: Der Index des frisch gebundenen Bereichs entsteht nebenläufig. Vor
// dem ersten Klick muss die Auskunft über das Ziel stehen; gewartet wird auf
// den Zustand selbst, nicht über eine feste Pause (test/README.md, 4T-001086).
async function warteAufIndex(page, ziel) {
  await expect
    .poll(
      () =>
        page.evaluate(
          (a) => window.api.databaseVerweisZiel(a).then((z) => (z ? z.kennung : null)),
          { zielPfad: path.join(ziel, 'Library.md'), anker: 'r-00001' },
        ),
      { timeout: 60000 },
    )
    .toBe('r-00001');
}

// Den Verweis in der Lese-Ansicht des Dokuments klicken. Der Block-Anker steht
// im Ziel ohne `^` (`wikiAnchorPart` in `wiki.js`).
async function klickeVerweis(page, anker) {
  await page.locator(SEL.tabs0, { hasText: DOKUMENT }).first().click();
  await expect(page.locator(MASKE)).not.toBeVisible();
  await page.locator(SEL.viewBtn('rendered')).click();
  const verweis = page.locator(`${SEL.markdownBody0} a.wikilink[href="Library.md#${anker}"]`);
  await expect(verweis).toBeVisible();
  await verweis.click();
}

async function erwarteMaskeDesErstenBuchs(page) {
  const maske = page.locator(MASKE);
  await expect(maske).toBeVisible({ timeout: 20000 });
  await expect(maske.locator('.db-form-heading')).toHaveText('Library');
  await expect(maske.locator('.db-form-record')).toContainText(ERSTES_BUCH);
}

// Der Text des Editors der Spalte (Zugang wie `schreibmarkenZeile` in
// `datenbank-tabelle.spec.js`).
async function quelltext(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    return tile && tile.view ? tile.view.state.doc.toString() : null;
  }, SEL.editorContent0);
}

test.describe('DB-VER-01: der Verweis öffnet die Maske des Datensatzes (4T-002333)', () => {
  test('ein Klick auf die lange Kennung öffnet das Buch in seiner Maske', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ({ ziel } = await starteMitVerweisen(app, page));
      await warteAufIndex(page, ziel);
      await klickeVerweis(page, 'r-00001');
      await erwarteMaskeDesErstenBuchs(page);
      // Die Tabellen-Datei ist dabei nicht geöffnet worden.
      await expect(page.locator(SEL.tabs0, { hasText: /^Library(\.md)?$/ })).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-VER-02: Kurzform und Anzeige-Form gelten und öffnen dieselbe Maske (4T-002333)', () => {
  test('kein gebrochener Verweis, und beide Klicks öffnen das Buch', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      let dokument;
      ({ ziel, dokument } = await starteMitVerweisen(app, page));
      await warteAufIndex(page, ziel);
      // Gültigkeit: dieselbe Auskunft, aus der der Linter seine Markierungen
      // zieht. Ein erfundener Name ist die Gegenprobe, dass die Auskunft
      // tatsächlich prüft.
      const fremd = 'Library#^Kein solches Buch';
      const auskunft = await page.evaluate(
        (a) => window.api.resolveWikiTargets(a.dokument, a.ziele),
        { dokument, ziele: [LANG, KURZ, NAME, fremd] },
      );
      expect(auskunft.status).toBe('ready');
      expect([...auskunft.existing].sort()).toEqual([LANG, KURZ, NAME].sort());
      expect(auskunft.brokenAnchor).toEqual([fremd]);

      await klickeVerweis(page, 'r-1');
      await erwarteMaskeDesErstenBuchs(page);
      await klickeVerweis(page, ERSTES_BUCH);
      await erwarteMaskeDesErstenBuchs(page);
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});

test.describe('DB-VER-03: Vorschlagsliste mit Datensätzen (4T-002333)', () => {
  test('nach [[Library#^ steht ein Buch mit Titel, die Auswahl schreibt die Kennung', async () => {
    test.setTimeout(180000);
    const { app, page, userData } = await launchApp();
    let ziel = null;
    try {
      ({ ziel } = await starteMitVerweisen(app, page));
      await warteAufIndex(page, ziel);
      // Quellcode-Ansicht und Bearbeiten einschalten (Muster `enterEditSource`
      // in `verweis-vorschlaege.spec.js`); ein Dokument öffnet schreibgeschützt.
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(`${PANE} .pane-source-editor`)).not.toHaveClass(/read-only/);
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n[[Library#^Sola');

      // Die Liste kommt asynchron über zwei Kanäle; erscheint sie nicht, löst ein
      // erneut getipptes Zeichen die Quelle noch einmal aus.
      const eintrag = page.locator(`${VORSCHLAEGE} li`, { hasText: '^Solaris' });
      await expect
        .poll(
          async () => {
            if (await eintrag.isVisible()) return true;
            await page.keyboard.press('Backspace');
            await page.keyboard.type('a');
            return eintrag.isVisible();
          },
          { timeout: 30000, intervals: [500] },
        )
        .toBe(true);
      await eintrag.click();
      await expect.poll(() => quelltext(page)).toContain('[[Library#^r-00003');
      expect(await quelltext(page)).not.toContain('#^^');
    } finally {
      await closeApp(app, userData, { force: true });
      if (ziel) removeDir(ziel);
    }
  });
});
