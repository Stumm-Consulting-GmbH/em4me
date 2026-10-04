// 4T-001547 (Epic 3E-000251, E3.7): Der Datensatz-Block der Datenbank in der
// realen Anordnung — Lese-Ansicht und Änderungs-Modus.
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Tests grün sind.** Zwei
// Zusagen dieses Vorgangs lassen sich ausschließlich hier nachweisen:
//
//   1. Die Spalten stehen im **Frontmatter** und nicht in der Fence. Im
//      Änderungs-Modus rendert das Live-Widget einen Block **isoliert**; ohne
//      den eigens mitgegebenen Vorspann sähe es die Definition nie und zeigte
//      eine Folge unbenannter Werte, während die Lese-Ansicht eine Tabelle
//      zeigt. Ein jsdom-Fall kann das nicht zeigen, weil er den Editor nicht
//      hat.
//   2. Die Darstellung hängt an einem eigenen Stylesheet. Ein Unit-Test liest
//      HTML als Zeichenkette und kennt die CSS-Kaskade nicht — genau die
//      Divergenz-Klasse, die den Abnahme-Befund von 1.116.0 verursacht hat.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'datenbank-tabelle.md',
);

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

test.describe('DB-01: Datensatz-Block rendert mit den Spalten aus dem Frontmatter', () => {
  test('Kopf aus der Definition, typisierte Zellen, Fehler-Zelle behält ihren Rohtext', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const block = page.locator(SEL.markdownBody0).locator('.perspective-records').first();
      await expect(block).toBeVisible();

      // Der Kopf kommt aus dem Frontmatter: `label` gewinnt, sonst der Name.
      // 4T-001792: Fünf Kopf-Zellen statt vier — die erste ist die leere
      // Kopf-Zelle der Aktions-Spalte des Zeilen-Zugangs, deren eigener
      // Nachweis in `funktionen/beleg-ansicht.spec.js` steht. Gezählt wird sie
      // hier mit, weil sie die Klasse `prc-head` trägt; die Feld-Köpfe stehen
      // seither ab Position 1.
      const koepfe = block.locator('th.prc-head');
      await expect(koepfe).toHaveCount(5);
      await expect(koepfe.nth(0)).toHaveClass(/prc-action-head/);
      await expect(koepfe.nth(0)).toHaveText('');
      await expect(koepfe.nth(1)).toHaveText('Name');
      await expect(koepfe.nth(2)).toHaveText('menge');

      // Vier Datensätze, jeder mit seiner Kennung an der Zeile.
      await expect(block.locator('tr.prc-row')).toHaveCount(4);
      await expect(block.locator('tr[data-rec-id="r-00001"]')).toHaveCount(1);

      // Typisiert dargestellt: Nachkommastellen aus der Definition, Haken
      // statt `x`.
      const erste = block.locator('tr.prc-row').first();
      await expect(erste.locator('td.prc-type-number')).toHaveText('12.50');
      await expect(erste.locator('td.prc-type-boolean')).not.toBeEmpty();

      // Die beiden unpassenden Werte behalten ihren Rohtext und sind
      // gekennzeichnet — kein stiller Verlust (E3.7).
      const fehler = block.locator('td.prc-error');
      await expect(fehler).toHaveCount(2);
      await expect(fehler.first()).toHaveText('zwoelf');
      await expect(fehler.nth(1)).toHaveText('2026-02-31');

      // Der Befund am unvollständigen vierten Datensatz wird gemeldet.
      await expect(block.locator('.prc-hint[data-rec-code="recordCellsMissing"]')).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('die Fehler-Zelle ist optisch hervorgehoben, nicht nur ausgezeichnet', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      const zelle = page.locator(SEL.markdownBody0).locator('td.prc-error').first();
      await expect(zelle).toBeVisible();
      // Ohne das eigene Stylesheet bliebe die Zelle unauffällig; der Fall
      // prüft deshalb die gerechnete Farbe und nicht die Klasse.
      const hintergrund = await zelle.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(hintergrund).not.toBe('rgba(0, 0, 0, 0)');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('DB-02: Änderungs-Modus zeigt dieselbe Tabelle', () => {
  test('das Live-Widget kennt die Definition seiner Datei und baut denselben Kopf', async () => {
    const { app, page, userData } = await launchApp({ args: [FIXTURE] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      const block = page.locator(`${SEL.editorContent0} .perspective-records`).first();
      await expect(block.locator('table.prc-table')).toBeVisible({ timeout: 15000 });

      // Derselbe Kopf wie in der Lese-Ansicht — der Nachweis, dass der
      // Vorspann beim isoliert gerenderten Block ankommt.
      // 4T-001792: fünf Kopf-Zellen, Begründung im Fall darüber.
      const koepfe = block.locator('th.prc-head');
      await expect(koepfe).toHaveCount(5);
      await expect(koepfe.nth(1)).toHaveText('Name');
      await expect(block.locator('tr.prc-row')).toHaveCount(4);
      await expect(block.locator('tr.prc-row').first().locator('td.prc-type-number')).toHaveText(
        '12.50',
      );
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// --- DB-03: Sprung aus einem Datensatz-Verweis (4T-001986) ----------------------

// Eine geteilte Tabelle im Wegwerf-Ordner: 60 Datensätze in der Kopf-Datei,
// damit das Ziel unter dem ersten Bildschirm liegt, und ein Datensatz im
// Folge-Teil. Die Kopf-Datei öffnet den Zaun, erst der Folge-Teil schließt ihn
// (Bauart des Teilens, `record-segment.js`).
const KUNDEN_ZAHL = 60;
const FOLGE_KENNUNG = 'r-00061';
const KOPF_KENNUNG = 'r-00040';

const kennung = (n) => `r-${String(n).padStart(5, '0')}`;

function baueGeteilteTabelle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-datensatz-sprung-'));
  const saetze = [];
  for (let n = 1; n <= KUNDEN_ZAHL; n++) {
    saetze.push(`|- id="${kennung(n)}"`, `| K-${n}`, `| Kunde ${n}`);
  }
  const kunden = path.join(dir, 'Kunden.md');
  fs.writeFileSync(
    kunden,
    [
      '---',
      'db-table:',
      '  fields:',
      '    - name: Kürzel',
      '    - name: Titel',
      'doc-part: v1|1|Kunden',
      '---',
      '',
      '# Kunden',
      '',
      '```perspective-records',
      ...saetze,
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Kunden•part-00002.md'),
    [
      '---',
      'doc-part: v1|2|Kunden',
      'db-fields: Kürzel, Titel',
      '---',
      `|- id="${FOLGE_KENNUNG}"`,
      '| K-61',
      '| Kunde 61',
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
  const notiz = path.join(dir, 'Notiz.md');
  fs.writeFileSync(
    notiz,
    `# Notiz\n\nErster: [[Kunden#^${KOPF_KENNUNG}]]\n\nZweiter: [[Kunden#^${FOLGE_KENNUNG}]]\n`,
    'utf8',
  );
  return { dir, kunden, notiz };
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

const reiter = (page, name) => page.locator(SEL.tabs0, { hasText: name }).first();

// Der Text der Zeile, auf der die Schreibmarke des Editors der Spalte steht
// (Zugang zum Editor wie `quelltext` in `tabellen-zell-vorschlaege.spec.js`).
async function schreibmarkenZeile(page) {
  return await page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    if (!tile || !tile.view) return null;
    const st = tile.view.state;
    return st.doc.lineAt(st.selection.main.head).text;
  }, SEL.editorContent0);
}

// Reiter «Notiz» nach vorn und den Verweis auf `ziel` in seiner Lese-Ansicht
// klicken; danach ist der Reiter «Kunden» wieder vorn.
async function klickeVerweis(page, ziel) {
  await reiter(page, 'Notiz').click();
  // Der Block-Anker steht im Ziel ohne `^` (`wikiAnchorPart` in `wiki.js`).
  const verweis = page.locator(`${SEL.markdownBody0} a.wikilink[href="Kunden.md#${ziel}"]`);
  await expect(verweis).toBeVisible();
  await verweis.click();
  await expect(page.locator(SEL.activeTab0)).toContainText('Kunden');
}

test.describe('DB-03: Datensatz-Verweis springt zur Datensatz-Zeile (4T-001986)', () => {
  test('Lese-, Live- und Quellcode-Ansicht bringen die Zeile in den Blick, auch aus dem Folge-Teil', async () => {
    const { dir, kunden, notiz } = baueGeteilteTabelle();
    const { app, page, userData } = await launchApp({ args: [kunden, notiz] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);

      // Lese-Ansicht. Das Ziel liegt vor dem Klick außerhalb des Blicks; die
      // Reihenfolge (erst der hintere, dann der vordere Datensatz) sorgt dafür,
      // dass auch der zweite Sprung den Blick tatsächlich bewegen muss.
      await reiter(page, 'Kunden').click();
      await page.locator(SEL.viewBtn('rendered')).click();
      const zeile = (id) =>
        page.locator(`${SEL.markdownBody0} tr.prc-row[data-rec-id="${id}"]`).first();
      await expect(zeile(KOPF_KENNUNG)).toBeAttached();
      for (const id of [FOLGE_KENNUNG, KOPF_KENNUNG]) {
        await expect(zeile(id)).not.toBeInViewport();
        await klickeVerweis(page, id);
        await expect(zeile(id)).toBeInViewport();
      }

      // Live- und Quellcode-Ansicht: Die Schreibmarke steht auf der Zeile, mit
      // der der Datensatz beginnt, und diese Zeile ist sichtbar. In der
      // Live-Ansicht zeigt der Block dazu seinen Quelltext.
      for (const ansicht of ['live', 'source']) {
        await reiter(page, 'Kunden').click();
        await page.locator(SEL.viewBtn(ansicht)).click();
        await expect(page.locator(SEL.editorContent0)).toBeVisible();
        for (const id of [FOLGE_KENNUNG, KOPF_KENNUNG]) {
          const marker = `id="${id}"`;
          expect(await schreibmarkenZeile(page)).not.toContain(marker);
          await klickeVerweis(page, id);
          await expect.poll(() => schreibmarkenZeile(page)).toContain(marker);
          const quellZeile = page
            .locator(`${SEL.editorContent0} .cm-line`)
            .filter({ hasText: marker })
            .first();
          await expect(quellZeile).toBeInViewport();
        }
      }
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
