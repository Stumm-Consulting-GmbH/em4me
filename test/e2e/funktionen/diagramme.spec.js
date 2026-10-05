// 4T-002021 (Epic 3E-000192): Ablauf-Prüfdatei der Diagramme zu Datentabellen —
// ein Diagramm-Block nennt eine Datentabelle bei ihrem Namen und zeigt ihre
// Werte als Grafik, in der Lese-Ansicht, der geteilten Ansicht und im
// Live-Modus. describe-Titel tragen die Fall-Kennungen DG-01 …; die folgenden
// Tasks des Epics setzen ihre Ablauf-Fälle in diese Datei.
//
// Gemessen wird an der gezeichneten Grafik selbst: ihre Achsen- und
// Legenden-Texte, ihre Farben und ihr ganzer Text mit den Kennungen der
// Ansicht ausgeblendet. Die Dokumente entstehen je Fall in einem eigenen
// Temp-Ordner, weil mehrere Fälle schreiben oder ungespeichert ändern.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');
const { DEFAULT_LIGHT_ID } = require('../../../src/shared/color-schemes.js');
const { hauptSenden } = require('../helpers/haupt-zugriff');

// Zaun-Blöcke als Zeilen-Listen, damit die Zäune nicht mit den
// Vorlagen-Zeichenketten zusammenstoßen (Muster frontmatter-abfrage.spec.js).
const TABELLE = [
  '```perspective-datatable',
  'columns: Monat:text, Einnahmen:number, Ausgaben:number, Saldo:number = Einnahmen - Ausgaben',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | 70 |',
  '```',
  '^umsatz',
].join('\n');

const BALKEN = [
  '```perspective-chart',
  'table: ^umsatz',
  'type: bar',
  'title: Umsatz',
  'labels: Monat',
  'values: Einnahmen, Ausgaben',
  '```',
].join('\n');

const SALDO = [
  '```perspective-chart',
  'table: ^umsatz',
  'type: line',
  'labels: Monat',
  'values: Saldo',
  '```',
].join('\n');

const DOKUMENT = ['# Diagramme', '', TABELLE, '', BALKEN, '', SALDO, '', 'Schluss.', ''].join('\n');

const HELL_ERSTE = '#4e79a7';
const DUNKEL_ERSTE = '#7ea6d8';

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramme-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, text) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, text, 'utf8');
  return datei;
}

const LESE = (nr) => `${SEL.markdownBody0} .perspective-chart >> nth=${nr}`;
const LIVE = (nr) => `${SEL.editorContent0} .perspective-chart >> nth=${nr}`;

// Die Grafik eines Containers als Messwerte: Zustand, Texte, Titel-Farbe,
// Farbe der ersten Reihe und der ganze Grafik-Text ohne die Kennungen der
// Ansicht (Spalte, Teilbaum, Live-Widget).
function grafik(page, selektor) {
  return page.locator(selektor).evaluate((el) => {
    const svg = el.querySelector('svg');
    const texte = svg ? Array.from(svg.querySelectorAll('text')).map((t) => t.textContent) : [];
    const titel = svg
      ? Array.from(svg.querySelectorAll('text')).find((t) => t.textContent === 'Umsatz')
      : null;
    const pfade = svg ? Array.from(svg.querySelectorAll('path[fill]')) : [];
    const reihe = pfade.map((p) => p.getAttribute('fill')).find((f) => f && /^#/.test(f));
    const desc = svg ? svg.querySelector('desc') : null;
    return {
      zustand: el.dataset.chartState || null,
      texte,
      titelFarbe: titel ? titel.getAttribute('fill') : null,
      ersteReihe: reihe || null,
      beschreibung: desc ? desc.textContent : null,
      rolle: svg ? svg.getAttribute('role') : null,
      text: svg ? svg.outerHTML.replace(/ch-[a-z]\d*-\d+-/g, 'ID-') : null,
    };
  });
}

async function warteGezeichnet(page, selektor) {
  await expect(page.locator(`${selektor.split(' >> ')[0]} svg`).first()).toBeVisible({
    timeout: 15000,
  });
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function oeffneGeteiltZumBearbeiten(page) {
  await page.locator(SEL.viewBtn('split')).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
}

test.describe('DG-01: Diagramm zeigt die Werte der genannten Tabelle in der Lese-Ansicht (F-332)', () => {
  test('Grafik mit Rubriken, Legende, Titel und Vorlese-Beschreibung', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await warteGezeichnet(page, LESE(0));
      const g = await grafik(page, LESE(0));
      expect(g.zustand).toBe('drawn');
      expect(g.rolle).toBe('img');
      expect(g.texte).toEqual(
        expect.arrayContaining(['Umsatz', 'Januar', 'Februar', 'März', 'Einnahmen', 'Ausgaben']),
      );
      expect(g.beschreibung).toBe('Balkendiagramm mit 2 Datenreihen und 3 Rubriken');
      // Die Tabelle selbst bleibt daneben als Tabelle stehen.
      await expect(
        page.locator(`${SEL.markdownBody0} .perspective-datatable .pdt-grid`),
      ).toBeVisible();
      // Das zweite Diagramm nennt dieselbe Tabelle und zeigt die berechnete Spalte.
      const saldo = await grafik(page, LESE(1));
      expect(saldo.zustand).toBe('drawn');
      expect(saldo.beschreibung).toBe('Liniendiagramm mit 1 Datenreihe und 3 Rubriken');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-02: dieselbe Grafik in Lese-Ansicht, geteilter Ansicht und Live-Modus (F-332)', () => {
  test('beide Diagramme sind in allen drei Ansichten gleich', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await warteGezeichnet(page, LESE(0));
      const lese = [await grafik(page, LESE(0)), await grafik(page, LESE(1))];

      await page.locator(SEL.viewBtn('split')).click();
      await warteGezeichnet(page, LESE(0));
      const geteilt = [await grafik(page, LESE(0)), await grafik(page, LESE(1))];

      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0));
      await expect(page.locator(`${SEL.editorContent0} .perspective-chart svg`)).toHaveCount(2, {
        timeout: 15000,
      });
      const live = [await grafik(page, LIVE(0)), await grafik(page, LIVE(1))];
      // Im Widget des Diagramms erscheint die Tabelle nicht mit.
      await expect(
        page.locator(`${SEL.editorContent0} .perspective-chart .perspective-datatable`),
      ).toHaveCount(0);

      for (const nr of [0, 1]) {
        expect(lese[nr].zustand).toBe('drawn');
        expect(geteilt[nr].text).toBe(lese[nr].text);
        expect(live[nr].text).toBe(lese[nr].text);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-03: Farben folgen Farbschema und Hell-Dunkel-Modus (F-332)', () => {
  test('neues Farbschema und Wechsel auf Dunkel in Lese-Ansicht und Live-Modus', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    const schema = (text) =>
      page.evaluate(
        (farbe) =>
          window.api.setSetting('colorSchemes', {
            custom: [{ id: 'dg-probe', name: 'DG', base: 'light', colors: { text: farbe } }],
            activeLight: 'dg-probe',
            activeDark: 'amber-dark',
          }),
        text,
      );
    try {
      await waitForTab(page);
      await page.evaluate(() => window.api.setThemePref('light'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await warteGezeichnet(page, LESE(0));
      await expect.poll(async () => (await grafik(page, LESE(0))).ersteReihe).toBe(HELL_ERSTE);

      // Neues Farbschema: Die Lese-Ansicht zeichnet ohne Neu-Rendern neu.
      await schema('#aa0000');
      await expect.poll(async () => (await grafik(page, LESE(0))).titelFarbe).toBe('#aa0000');

      // Render-Skip-Cache: Ein Wechsel der Ansicht mit unverändertem Text rendert
      // nicht neu und darf keine alten Farben zurückbringen.
      await page.locator(SEL.viewBtn('split')).click();
      await page.locator(SEL.viewBtn('rendered')).click();
      expect((await grafik(page, LESE(0))).titelFarbe).toBe('#aa0000');

      // Live-Modus: das Widget trägt dieselbe Farbe und folgt einem weiteren
      // Wechsel des Farbschemas.
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0));
      await expect.poll(async () => (await grafik(page, LIVE(0))).titelFarbe).toBe('#aa0000');
      await schema('#0000aa');
      await expect.poll(async () => (await grafik(page, LIVE(0))).titelFarbe).toBe('#0000aa');

      // Wechsel auf Dunkel: die dunkle Palette im Live-Modus und in der
      // Lese-Ansicht.
      await page.evaluate(() => window.api.setThemePref('dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect.poll(async () => (await grafik(page, LIVE(0))).ersteReihe).toBe(DUNKEL_ERSTE);
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect.poll(async () => (await grafik(page, LESE(0))).ersteReihe).toBe(DUNKEL_ERSTE);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-04: Sortieren und Filtern der Tabelle ändern das Diagramm nicht (F-332)', () => {
  test('Sortierung und Filter in der geteilten Ansicht, Grafik unverändert', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('split')).click();
      await warteGezeichnet(page, LESE(0));
      const vorher = await grafik(page, LESE(0));
      const grid = page.locator(`${SEL.markdownBody0} .perspective-datatable`).first();
      // Sortieren nach Einnahmen (Spaltenkopf-Klick).
      await grid.locator('th').nth(1).click();
      await expect(grid.locator('th').nth(1)).toHaveClass(/pdt-sort-(asc|desc)/);
      // Filtern auf eine Zeile.
      await grid.locator('.pdt-filter-toggle').click();
      await grid.locator('.pdt-filter-row td[data-dt-col="0"] input').fill('Jan');
      await expect(grid.locator('tbody tr:not(.pdt-row-hidden)')).toHaveCount(1);
      const nachher = await grafik(page, LESE(0));
      expect(nachher.text).toBe(vorher.text);
      expect(nachher.texte).toEqual(expect.arrayContaining(['Januar', 'Februar', 'März']));
      // Keine Änderung am Dokument.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-05: das Diagramm folgt einer ungespeicherten Änderung der Tabelle (F-332)', () => {
  test('Wert im Quelltext und im Grid ändern, ohne zu speichern; berechnete Spalte folgt', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await oeffneGeteiltZumBearbeiten(page);
      await warteGezeichnet(page, LESE(0));
      const saldoVorher = (await grafik(page, LESE(1))).text;

      // Quelltext: letzte Zelle der Januar-Zeile (Ausgaben 80) auf 800.
      const zeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Januar' });
      await zeile.click();
      await page.keyboard.press('End');
      for (let i = 0; i < '80 |'.length; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('800 |');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('800');
      // Die Datei auf der Platte ist unverändert: Die Grafik zeigt den
      // geschriebenen, nicht den gespeicherten Stand.
      expect(fs.readFileSync(datei, 'utf8')).toContain('| Januar  | 100 | 80 |');

      // Grid: Einnahmen der Februar-Zeile auf 5000; Eingangs-Spalte der
      // berechneten Spalte Saldo.
      const grid = page.locator(`${SEL.markdownBody0} .perspective-datatable`).first();
      await grid.locator('tr[data-dt-row="1"] td[data-dt-col="1"]').click();
      const eingabe = grid.locator('input.pdt-cell-input');
      await expect(eingabe).toBeVisible();
      await eingabe.fill('5000');
      await eingabe.press('Enter');
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('5000');
      await expect.poll(async () => (await grafik(page, LESE(1))).text).not.toBe(saldoVorher);
      expect(fs.readFileSync(datei, 'utf8')).toBe(DOKUMENT);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-06: Zeilen hinzu und weg im Live-Modus, Rückgängig zeigt den vorigen Stand (F-332)', () => {
  test('neue Zeile erscheint als Rubrik, gelöschte verschwindet, Strg+Z holt sie zurück', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      await page.locator(SEL.btnEdit).click();
      await warteGezeichnet(page, LIVE(0));
      const grid = () => page.locator(`${SEL.editorContent0} .perspective-datatable`).first();
      await expect(grid().locator('.pdt-grid')).toBeVisible({ timeout: 15000 });

      await grid().locator('.pdt-add-btn').click();
      const eingabe = page.locator(`${SEL.editorContent0} input.pdt-cell-input`);
      await expect(eingabe).toBeVisible();
      await eingabe.fill('April');
      await eingabe.press('Enter');
      await expect.poll(async () => (await grafik(page, LIVE(0))).texte).toContain('April');

      await grid().locator('tr[data-dt-row="3"] .pdt-del-btn').click({ force: true });
      await expect.poll(async () => (await grafik(page, LIVE(0))).texte).not.toContain('April');

      // Rückgängig am Tastendruck: Die Schreibmarke steht in der Überschrift,
      // außerhalb beider Blöcke.
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Schluss.' }).click();
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await grafik(page, LIVE(0))).texte).toContain('April');
      // 4T-002026: nichts gespeichert, die Datei trägt den Ausgangs-Text.
      erwarteDateiUnveraendert(datei, DOKUMENT);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-07: nach Verwerfen, Schließen und erneutem Öffnen gilt der gespeicherte Stand (F-332)', () => {
  test('ungespeicherte Änderung verworfen, Diagramm zeigt wieder die Werte der Datei', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await oeffneGeteiltZumBearbeiten(page);
      await warteGezeichnet(page, LESE(0));
      const gespeichert = (await grafik(page, LESE(0))).text;
      const zeile = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Januar' });
      await zeile.click();
      await page.keyboard.press('End');
      for (let i = 0; i < '80 |'.length; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('2000 |');
      await expect.poll(async () => (await grafik(page, LESE(0))).texte).toContain('2000');

      // Schließen mit «Verwerfen» im Rückfrage-Dialog (nativ, deshalb gestellt).
      await hauptSenden(app, ({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      });
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
      await hauptSenden(
        app,
        ({ BrowserWindow }, p) => {
          BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
        },
        datei,
      );
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await warteGezeichnet(page, LESE(0));
      const wieder = await grafik(page, LESE(0));
      expect(wieder.texte).not.toContain('2000');
      expect(wieder.text).toBe(gespeichert);
      // 4T-002026: Verworfen heißt nicht gespeichert.
      erwarteDateiUnveraendert(datei, DOKUMENT);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-08: Diagramm in einem eingebetteten Abschnitt, Tabelle außerhalb (F-332)', () => {
  test('die Einbettung zeigt das Diagramm mit den Werten der Tabelle des ganzen Dokuments', async () => {
    const dir = makeDir();
    const quelle = ['# Quelle', '', TABELLE, '', '## Auswertung', '', BALKEN, ''].join('\n');
    schreibe(dir, 'Quelle.md', quelle);
    const haupt = schreibe(dir, 'Haupt.md', '# Haupt\n\n![[Quelle#Auswertung]]\n');
    const { app, page, userData } = await launchApp({ args: [haupt] });
    try {
      const imEmbed = `${SEL.markdownBody0} .wiki-embed-md-body .perspective-chart`;
      await expect(page.locator(`${imEmbed} svg`)).toBeVisible({ timeout: 15000 });
      const g = await grafik(page, imEmbed);
      expect(g.zustand).toBe('drawn');
      expect(g.texte).toEqual(expect.arrayContaining(['Januar', 'Februar', 'März']));
      // Die Tabelle selbst liegt außerhalb des Abschnitts und ist nicht eingebettet.
      await expect(
        page.locator(`${SEL.markdownBody0} .wiki-embed-md-body .perspective-datatable`),
      ).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-09: Live-Modus antwortet wie die Lese-Ansicht, wenn der Name zuerst an einem Absatz steht (F-332)', () => {
  test('beide Ansichten: nicht zeichenbar, Grund «Tabelle anderer Art»', async () => {
    // Das erste Vorkommen des Namens zählt. Hier benennt es einen Absatz; die
    // Datentabelle mit demselben Namen weiter unten gilt deshalb nicht.
    const dir = makeDir();
    const text = [
      '# Diagramme',
      '',
      'Ein Absatz mit Namen ^umsatz',
      '',
      BALKEN,
      '',
      TABELLE,
      '',
    ].join('\n');
    const datei = schreibe(dir, 'Diagramm.md', text);
    const { app, page, userData } = await launchApp({ args: [datei] });
    const zustand = (selektor) =>
      page.locator(selektor).evaluate((el) => ({
        zustand: el.dataset.chartState || null,
        grund: el.dataset.chartReason || null,
        anlass: el.dataset.chartDetail || null,
        // 4T-002022: der Hinweis an der Stelle der Grafik, in beiden Ansichten gleich.
        hinweis: (el.querySelector('.perspective-chart-hint-reason') || {}).textContent || null,
      }));
    try {
      await waitForTab(page);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-chart`)).toHaveAttribute(
        'data-chart-state',
        'undrawable',
      );
      const lese = await zustand(LESE(0));
      expect(lese).toEqual({
        zustand: 'undrawable',
        grund: 'table-other-kind',
        anlass: 'other',
        hinweis:
          'Der Name «umsatz» gehört nicht zu einer Datentabelle. Ein Diagramm zeigt nur die Werte einer Datentabelle.',
      });

      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(`${SEL.editorContent0} .perspective-chart`)).toHaveAttribute(
        'data-chart-state',
        'undrawable',
        { timeout: 15000 },
      );
      expect(await zustand(LIVE(0))).toEqual(lese);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// --- 4T-002022: Hinweise bei nicht zeichenbaren Diagrammen und ausgelassenen Werten

// Ein Diagramm, dessen Tabelle es nicht gibt, und eine Tabelle mit einer leeren
// Zelle in einer Werte-Spalte des Balken-Diagramms.
const FALSCH = BALKEN.replace('^umsatz', '^kosten');
const TABELLE_LUECKE = TABELLE.replace('| Januar  | 100 | 80 |', '| Januar  |     | 80 |');
const DOKUMENT_HINWEIS = ['# Hinweise', '', TABELLE_LUECKE, '', FALSCH, '', BALKEN, ''].join('\n');

const HINWEIS_TITEL = 'Das Diagramm kann nicht gezeichnet werden';
const HINWEIS_KOSTEN = 'Eine Tabelle mit dem Namen «kosten» kommt in diesem Dokument nicht vor.';
const EIN_WERT = '1 Wert wurde ausgelassen, weil seine Zelle leer oder nicht lesbar ist.';
const ZWEI_WERTE = '2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.';

// Hinweis und Auslass-Zeile eines Containers als Messwerte.
function hinweis(page, selektor) {
  return page.locator(selektor).evaluate((el) => {
    const text = (sel) => {
      const k = el.querySelector(sel);
      return k ? k.textContent : null;
    };
    const kasten = el.querySelector('.perspective-chart-hint');
    return {
      zustand: el.dataset.chartState || null,
      titel: text('.perspective-chart-hint-title'),
      grund: text('.perspective-chart-hint-reason'),
      rolle: kasten ? kasten.getAttribute('role') : null,
      auslass: text('.perspective-chart-omitted'),
      grafik: Boolean(el.querySelector('svg')),
    };
  });
}

// Zelle einer Datentabelle im Grid des Live-Modus setzen.
async function setzeZelle(page, zeile, spalte, wert, nr = 0) {
  const grid = page.locator(`${SEL.editorContent0} .perspective-datatable`).nth(nr);
  await grid.locator(`tr[data-dt-row="${zeile}"] td[data-dt-col="${spalte}"]`).click();
  const eingabe = page.locator(`${SEL.editorContent0} input.pdt-cell-input`);
  await expect(eingabe).toBeVisible();
  await eingabe.fill(wert);
  await eingabe.press('Enter');
}

test.describe('DG-10: Hinweis und Auslass-Zeile in Lese-Ansicht, geteilter Ansicht und Live-Modus (F-332)', () => {
  test('an der Stelle des Diagramms in allen drei Ansichten mit demselben Text', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Hinweise.md', DOKUMENT_HINWEIS);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await warteGezeichnet(page, LESE(1));
      const lese = [await hinweis(page, LESE(0)), await hinweis(page, LESE(1))];
      expect(lese[0]).toEqual({
        zustand: 'undrawable',
        titel: HINWEIS_TITEL,
        grund: HINWEIS_KOSTEN,
        rolle: 'note',
        auslass: null,
        grafik: false,
      });
      expect(lese[1]).toMatchObject({
        zustand: 'drawn',
        titel: null,
        auslass: EIN_WERT,
        grafik: true,
      });

      await page.locator(SEL.viewBtn('split')).click();
      await warteGezeichnet(page, LESE(1));
      expect([await hinweis(page, LESE(0)), await hinweis(page, LESE(1))]).toEqual(lese);

      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(1));
      await expect(page.locator(`${SEL.editorContent0} .perspective-chart-hint`)).toHaveCount(1, {
        timeout: 15000,
      });
      expect([await hinweis(page, LIVE(0)), await hinweis(page, LIVE(1))]).toEqual(lese);
      // Hinweis und Zeile verändern das Dokument nicht.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(fs.readFileSync(datei, 'utf8')).toBe(DOKUMENT_HINWEIS);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-11: Grund beheben und herbeiführen beim Tippen, ohne zu speichern (F-332)', () => {
  test('Name der Tabelle im Quelltext der geteilten Ansicht, Wert im Grid des Live-Modus', async () => {
    const dir = makeDir();
    const nullen = [
      '```perspective-datatable',
      'columns: Monat:text, Anteil:number',
      '| Januar  | 0 |',
      '| Februar | 0 |',
      '```',
      '^anteile',
    ].join('\n');
    const kreis = [
      '```perspective-chart',
      'table: ^anteile',
      'type: pie',
      'labels: Monat',
      'values: Anteil',
      '```',
    ].join('\n');
    const text = ['# Gründe', '', TABELLE, '', FALSCH, '', nullen, '', kreis, ''].join('\n');
    const datei = schreibe(dir, 'Gruende.md', text);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await oeffneGeteiltZumBearbeiten(page);
      await expect(page.locator(LESE(0))).toHaveAttribute('data-chart-state', 'undrawable');

      // Die Tabelle bekommt im Quelltext den genannten Namen: das Diagramm erscheint.
      const anker = page.locator(`${SEL.editorContent0} .cm-line`, { hasText: /^\^umsatz$/ });
      await anker.click();
      await page.keyboard.press('End');
      for (let i = 0; i < 'umsatz'.length; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('kosten');
      await expect.poll(async () => (await hinweis(page, LESE(0))).grafik).toBe(true);
      expect((await hinweis(page, LESE(0))).titel).toBeNull();
      // Und zurück: der Grund entsteht, der Hinweis erscheint wieder.
      for (let i = 0; i < 'kosten'.length; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('umsatz');
      await expect.poll(async () => (await hinweis(page, LESE(0))).grund).toBe(HINWEIS_KOSTEN);

      // Live-Modus: ein Kreis aus lauter Nullen, ein Wert im Grid behebt den Grund.
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(LIVE(1))).toHaveAttribute('data-chart-state', 'undrawable', {
        timeout: 15000,
      });
      expect((await hinweis(page, LIVE(1))).grund).toBe(
        'Ein Kreis- oder Donut-Diagramm braucht mindestens einen Wert größer als null.',
      );
      await setzeZelle(page, 0, 1, '5', 1);
      await expect.poll(async () => (await hinweis(page, LIVE(1))).zustand).toBe('drawn');
      expect((await hinweis(page, LIVE(1))).titel).toBeNull();
      await setzeZelle(page, 0, 1, '0', 1);
      await expect.poll(async () => (await hinweis(page, LIVE(1))).zustand).toBe('undrawable');
      // Nichts gespeichert: die Datei auf der Platte ist unverändert.
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-12: die Auslass-Zeile folgt dem Leeren und Füllen von Zellen (F-332)', () => {
  test('Zahl steigt und sinkt, die Zeile entfällt ohne ausgelassene Werte', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      await page.locator(SEL.btnEdit).click();
      await warteGezeichnet(page, LIVE(0));
      const auslass = async () => (await hinweis(page, LIVE(0))).auslass;
      expect(await auslass()).toBeNull();

      await setzeZelle(page, 0, 1, '');
      await expect.poll(auslass).toBe(EIN_WERT);
      await setzeZelle(page, 1, 2, '');
      await expect.poll(auslass).toBe(ZWEI_WERTE);
      await setzeZelle(page, 0, 1, '100');
      await expect.poll(auslass).toBe(EIN_WERT);
      await setzeZelle(page, 1, 2, '95');
      await expect.poll(auslass).toBeNull();
      expect((await hinweis(page, LIVE(0))).grafik).toBe(true);
      // 4T-002026: Die Gitter-Eingaben stehen im Puffer, nicht auf der Platte.
      erwarteDateiUnveraendert(datei, DOKUMENT);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DG-13: Hinweis und Auslass-Zeile in einer zweiten Sprache der Oberfläche (F-332)', () => {
  test('Sprachwechsel auf Englisch im Live-Modus und in der Lese-Ansicht', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Hinweise.md', DOKUMENT_HINWEIS);
    const { app, page, userData } = await launchApp({ args: [datei] });
    const englisch = {
      titel: 'The chart cannot be drawn',
      grund: 'No table named “kosten” exists in this document.',
      auslass: '1 value was left out because its cell is empty or unreadable.',
    };
    try {
      await waitForTab(page);
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(1));
      await expect.poll(async () => (await hinweis(page, LIVE(0))).titel).toBe(HINWEIS_TITEL);

      await page.locator('#lang-select').selectOption('en');
      await expect.poll(async () => (await hinweis(page, LIVE(0))).titel).toBe(englisch.titel);
      expect((await hinweis(page, LIVE(0))).grund).toBe(englisch.grund);
      await expect.poll(async () => (await hinweis(page, LIVE(1))).auslass).toBe(englisch.auslass);

      await page.locator(SEL.viewBtn('rendered')).click();
      await expect.poll(async () => (await hinweis(page, LESE(0))).titel).toBe(englisch.titel);
      expect((await hinweis(page, LESE(0))).grund).toBe(englisch.grund);
      expect((await hinweis(page, LESE(1))).auslass).toBe(englisch.auslass);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// --- 4T-002030: Diagramm-Farben im Farbschema

const EINSTELLUNGEN = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function oeffneFarbschemas(page) {
  await oeffneEinstellungsSeite(page);
  await expect(page.locator(EINSTELLUNGEN)).toBeVisible();
  await page
    .locator(`${EINSTELLUNGEN} .settings-nav-entry[data-section-id="colorSchemes"]`)
    .click();
  await expect(page.locator('.color-scheme-editor')).toBeVisible();
}

function wurzelVariable(page, name) {
  return page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
}

test.describe('DG-14: eine geänderte Diagramm-Farbe im Farbschema erscheint sofort im Diagramm (F-332)', () => {
  test('eigenes Farbschema, «Datenreihe 1» geändert: erste Reihe in allen drei Ansichten, ohne Neu-Öffnen', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramm.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei] });
    const NEU = '#aa00aa';
    try {
      await waitForTab(page);
      await page.evaluate(() => window.api.setThemePref('light'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await warteGezeichnet(page, LESE(0));
      await expect.poll(async () => (await grafik(page, LESE(0))).ersteReihe).toBe(HELL_ERSTE);

      // Einstellungen → Farbschemas: die Gruppe «Diagramme» mit zehn Farben,
      // im mitgelieferten Schema gesperrt.
      await oeffneFarbschemas(page);
      await expect(page.locator('.color-scheme-group-head', { hasText: 'Diagramme' })).toHaveCount(
        1,
      );
      for (let i = 1; i <= 10; i++) {
        await expect(page.locator(`label[for="settings-color-slot-chart${i}"]`)).toHaveText(
          `Datenreihe ${i}`,
        );
      }
      await expect(page.locator('#settings-color-slot-chart1')).toBeDisabled();

      // Eigenes Schema aus der Vorlage, «Datenreihe 1» ändern: Die Variable
      // steht am Wurzel-Element, ehe angewendet ist.
      await page.locator('#settings-color-scheme-new').click();
      const reihe1 = page.locator('#settings-color-slot-chart1');
      await expect(reihe1).toBeEnabled();
      await reihe1.evaluate((el, farbe) => {
        el.value = farbe;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, NEU);
      await expect.poll(() => wurzelVariable(page, '--chart-1')).toBe(NEU);
      await page.locator('#btn-settings-apply').click();

      // Zurück ins geöffnete Dokument, ohne es neu zu öffnen: Lese-Ansicht,
      // geteilte Ansicht und Live-Modus zeigen die erste Reihe in der neuen Farbe.
      await page.locator(SEL.tabs0).first().click();
      await expect.poll(async () => (await grafik(page, LESE(0))).ersteReihe).toBe(NEU);
      await page.locator(SEL.viewBtn('split')).click();
      await expect.poll(async () => (await grafik(page, LESE(0))).ersteReihe).toBe(NEU);
      await page.locator(SEL.viewBtn('live')).click();
      await warteGezeichnet(page, LIVE(0));
      await expect.poll(async () => (await grafik(page, LIVE(0))).ersteReihe).toBe(NEU);

      // Wieder ein mitgeliefertes Farbschema: die Vorgabe-Farbe erscheint.
      await oeffneFarbschemas(page);
      await page.locator('#settings-color-scheme-light').selectOption(DEFAULT_LIGHT_ID);
      await expect.poll(() => wurzelVariable(page, '--chart-1')).toBe('');
      await page.locator('#btn-settings-apply').click();
      await page.locator(SEL.tabs0).first().click();
      await expect.poll(async () => (await grafik(page, LIVE(0))).ersteReihe).toBe(HELL_ERSTE);
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect.poll(async () => (await grafik(page, LESE(0))).ersteReihe).toBe(HELL_ERSTE);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-002072 (Epic 3E-000192): Der Name der Tabelle steht in ihrer Kopf-Angabe
// `table: Umsatz`; das Diagramm nennt ihn ohne und mit Dach-Zeichen. Daneben
// eine Tabelle mit dem Namen in einer Zeile `^alt` darunter (alte Form, E2),
// die ein Diagramm ohne Dach-Zeichen nennt.
const TABELLE_KOPF = TABELLE.replace(
  '```perspective-datatable\n',
  '```perspective-datatable\ntable: Umsatz\n',
).replace('\n^umsatz', '');
const DOKUMENT_KOPF = [
  '# Kopf-Name',
  '',
  TABELLE_KOPF,
  '',
  BALKEN.replace('^umsatz', 'Umsatz'),
  '',
  SALDO.replace('^umsatz', '^Umsatz'),
  '',
  TABELLE.replace('\n^umsatz', '\n^alt').replace('| 100 |', '| 400 |'),
  '',
  BALKEN.replace('^umsatz', 'alt'),
  '',
].join('\n');

test.describe('DG-22: Name der Tabelle in der Zeile table: im Block, drei Ansichten (F-332)', () => {
  test('ohne und mit Dach-Zeichen gezeichnet, alte Form daneben; die Kopf-Zeile ist kein Text', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Kopf.md', DOKUMENT_KOPF);
    const { app, page, userData } = await launchApp({ args: [datei] });
    const gezeichnet = (wurzel) => `${wurzel} .perspective-chart[data-chart-state="drawn"] svg`;
    try {
      await waitForTab(page);
      await expect(page.locator(gezeichnet(SEL.markdownBody0))).toHaveCount(3, {
        timeout: 15000,
      });
      const lese = [];
      for (const nr of [0, 1, 2]) lese.push(await grafik(page, LESE(nr)));
      expect(lese[0].beschreibung).toBe('Balkendiagramm mit 2 Datenreihen und 3 Rubriken');
      expect(lese[1].beschreibung).toBe('Liniendiagramm mit 1 Datenreihe und 3 Rubriken');
      expect(lese[2].beschreibung).toBe('Balkendiagramm mit 2 Datenreihen und 3 Rubriken');
      // Andere Werte, andere Grafik: das dritte Diagramm liest die alte Tabelle.
      expect(lese[2].text).not.toBe(lese[0].text);
      // Der Name ist die Kennung des Containers und steht nicht als Text da.
      await expect(
        page.locator(`${SEL.markdownBody0} .perspective-datatable[id="Umsatz"]`),
      ).toHaveCount(1);
      await expect(page.locator(SEL.markdownBody0)).not.toContainText('table: Umsatz');

      await page.locator(SEL.viewBtn('split')).click();
      await expect(page.locator(gezeichnet(SEL.markdownBody0))).toHaveCount(3, {
        timeout: 15000,
      });
      for (const nr of [0, 1, 2]) expect((await grafik(page, LESE(nr))).text).toBe(lese[nr].text);

      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(gezeichnet(SEL.editorContent0))).toHaveCount(3, {
        timeout: 15000,
      });
      for (const nr of [0, 1, 2]) expect((await grafik(page, LIVE(nr))).text).toBe(lese[nr].text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
