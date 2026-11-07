// 4T-002518 (Epic 3E-000402): Ablauf-Prüffall der Parität, des Drucks und des
// portablen Exports eines Dashboards, Familie DN (Story 4S-001187).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Parität verbindet Wege, die erst in der laufenden Anwendung zusammenstehen:
// das isoliert gerenderte Block-Widget des Live-Modus mit der Ordnungszahl aus
// seiner Stelle im Editor, die gemerkte Auswahl über den Wechsel der Ansicht,
// die Auflösung einer Abfrage-Datei vor der Schranke des Drucks, die
// Einbettung als erzeugter Teilbaum und der portable Export über den
// Speichern-Weg des Hauptprozesses.
//
// **DN-01** (AK1, AK5): dieselben Werte in gerenderter, geteilter und
// Live-Ansicht, mit der Auswahl aus der gerenderten Ansicht; ein Klick in das
// Auswahlfeld des Widgets lässt den Block zu; die Schreibmarke im Block klappt
// ihn zum Quelltext auf, das Verlassen wieder zu.
// **DN-02** (AK2): Der Druck aus dem Live-Modus zeigt die Werte der aktuellen
// Auswahl, auch die Kachel mit Abfrage-Datei, ohne Auswahlfelder.
// **DN-03** (AK3, AK4): Der portable Export zeigt die Vorbelegung, nicht die
// Auswahl, mit Überschriften, Tabelle mit Verweisen und hellem Bild; keine
// Auswahlfelder, kein Quelltext. Die Datei erscheint beim erneuten Öffnen.
// **DN-04** (AK6): Ein eingebetteter Abschnitt mit Dashboard zeigt es mit
// bedienbarem Filter.
// **DN-05** (AK1): Zwei Dashboards in einem Dokument; das zweite behält im
// Widget des Live-Modus seine eigene Auswahl (Ordnungszahl aus der Stelle).
//
// Der native Speichern-Dialog und der Druck-Dialog werden im Hauptprozess durch
// feste Antworten ersetzt (Muster diagramme-export.spec.js und
// diagramme-druck.spec.js); beide Dialoge bleiben manuelle Prüfung.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { hauptLesen, hauptSenden } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

// Der Index baut asynchron auf; Werte und Kacheln erscheinen erst danach.
const WARTE_BESTAND_MS = 20000;

const Z = '`'.repeat(3);

const DASHBOARD = [
  '---',
  'Bereich: Index',
  '---',
  '# Dashboard',
  '',
  'Text davor.',
  `${Z}perspective-dashboard`,
  '!filter status titel="Status" vorbelegung=offen',
  '!kachel kennzahl titel="Anzahl"',
  'LIST FROM "Aufgaben" WHERE status = $status',
  '!kachel kennzahl titel="Geteilt" abfrage="Offene"',
  '!kachel tabelle titel="Aufgaben"',
  'TABLE status FROM "Aufgaben" WHERE status = $status SORT file.name ASC',
  '!kachel balken titel="Je Status"',
  'TABLE count() AS "Anzahl" FROM "Aufgaben" GROUP BY status',
  Z,
  '',
  'Schluss.',
  '',
].join('\n');

const ABFRAGE_DATEI = [
  '---',
  'db-query:',
  '---',
  `${Z}perspective-query`,
  'LIST FROM "Aufgaben" WHERE status = $status',
  Z,
  '',
].join('\n');

// Zwei Blöcke: Die gemerkte Auswahl hängt an der Ordnungszahl im Dokument.
const ZWEI = [
  '# Zwei',
  '',
  ...[1, 2].flatMap((n) => [
    `${Z}perspective-dashboard`,
    `!filter status titel="Status" vorbelegung=offen`,
    `!kachel kennzahl titel="Block ${n}"`,
    'LIST FROM "Aufgaben" WHERE status = $status',
    Z,
    '',
  ]),
].join('\n');

const EINBETTUNG = ['# Einbettung', '', '![[Dashboard#Dashboard]]', ''].join('\n');

// offen: A, B; zu: C, D, E.
const AUFGABEN = [
  ['A', 'offen'],
  ['B', 'offen'],
  ['C', 'zu'],
  ['D', 'zu'],
  ['E', 'zu'],
];

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-dashansicht-'));
  fs.mkdirSync(path.join(dir, 'Aufgaben'));
  fs.writeFileSync(path.join(dir, 'Dashboard.md'), DASHBOARD, 'utf8');
  fs.writeFileSync(path.join(dir, 'Einbettung.md'), EINBETTUNG, 'utf8');
  fs.writeFileSync(path.join(dir, 'Zwei.md'), ZWEI, 'utf8');
  // Neben dem Dashboard: Ohne Bereich ist der Ordner einer Datei ihr Suchraum.
  fs.writeFileSync(path.join(dir, 'Offene.md'), ABFRAGE_DATEI, 'utf8');
  for (const [name, status] of AUFGABEN) {
    const text = `---\nstatus: ${status}\n---\n# Aufgabe ${name}\n`;
    fs.writeFileSync(path.join(dir, 'Aufgaben', `${name}.md`), text, 'utf8');
  }
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

const LESEN = `${SEL.markdownBody0} .perspective-dashboard`;
const LIVE = `${SEL.paneSource0} .cm-live-block .perspective-dashboard`;

const auswahl = (page, ort) => page.locator(ort).getByLabel('Status');
const kennzahl = (page, ort, titel) =>
  page
    .locator(`${ort} .dashboard-kachel`)
    .filter({
      has: page.locator('.dashboard-kachel-titel', { hasText: new RegExp(`^${titel}$`) }),
    })
    .locator('.dashboard-kennzahl-wert');

async function erwarteWerte(page, ort, anzahl, geteilt) {
  await expect(kennzahl(page, ort, 'Anzahl')).toHaveText(anzahl, { timeout: WARTE_BESTAND_MS });
  await expect(kennzahl(page, ort, 'Geteilt')).toHaveText(geteilt, { timeout: WARTE_BESTAND_MS });
}

// Der Stand der gerenderten Spalte im Augenblick des Drucks.
const ERFASSE = `(() => {
  const block = document.querySelector('.pane-group[data-pane="0"] .markdown-body .perspective-dashboard');
  if (!block) return { block: false };
  const wert = (titel) => {
    const k = Array.from(block.querySelectorAll('.dashboard-kachel')).find(
      (el) => (el.querySelector('.dashboard-kachel-titel') || {}).textContent === titel,
    );
    const w = k && k.querySelector('.dashboard-kennzahl-wert');
    return w ? w.textContent : null;
  };
  const sichtbar = (el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  return {
    block: true,
    druck: document.body.classList.contains('printing'),
    anzahl: wert('Anzahl'),
    geteilt: wert('Geteilt'),
    felder: Array.from(block.querySelectorAll('.dashboard-filter-auswahl')).filter(sichtbar).length,
    kopf: Array.from(block.querySelectorAll('.dashboard-kopf')).filter(sichtbar).length,
  };
})()`;

async function druckeMitStub(app, page) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, erfasse) => {
      globalThis.__daDruck = [];
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.print = (options, callback) => {
          win.webContents.executeJavaScript(erfasse).then(
            (stand) => {
              globalThis.__daDruck.push(stand);
              callback(true, '');
            },
            (err) => {
              globalThis.__daDruck.push({ fehler: String(err) });
              callback(true, '');
            },
          );
        };
      }
    },
    ERFASSE,
  );
  await hauptSenden(app, ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:print');
  });
  await expect
    .poll(() => hauptLesen(app, () => globalThis.__daDruck.length), { timeout: 30000 })
    .toBe(1);
  await expect(page.locator('body.printing')).toHaveCount(0);
  return hauptLesen(app, () => globalThis.__daDruck[0]);
}

async function exportiere(app, zielPfad) {
  await hauptSenden(
    app,
    ({ dialog }, ziel) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: ziel });
    },
    zielPfad,
  );
  await hauptSenden(app, ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:exportPortable');
  });
  await expect
    .poll(() => fs.existsSync(zielPfad) && fs.readFileSync(zielPfad, 'utf8').includes('Schluss.'), {
      timeout: 30000,
    })
    .toBe(true);
  return fs.readFileSync(zielPfad, 'utf8');
}

async function oeffneDatei(app, datei) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
    },
    datei,
  );
}

test.describe('DN-01: Parität der Ansichten (F-405) — gerendert, geteilt, Live, Schreibmarke', () => {
  test('dieselben Werte in drei Ansichten mit der gemerkten Auswahl; der Block klappt nur mit der Schreibmarke auf', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Dashboard.md')] });
    try {
      await erwarteWerte(page, LESEN, '2', '2');
      await auswahl(page, LESEN).selectOption('zu');
      await erwarteWerte(page, LESEN, '3', '3');

      await page.locator(SEL.viewBtn('split')).click();
      await erwarteWerte(page, LESEN, '3', '3');

      // Live: dieselben Werte und dieselbe Auswahl im Block-Widget.
      await page.locator(SEL.viewBtn('live')).click();
      await erwarteWerte(page, LIVE, '3', '3');
      await expect(auswahl(page, LIVE)).toHaveValue('zu');

      // Ein Klick in das Auswahlfeld setzt den Schreibpunkt nicht in den Block.
      await auswahl(page, LIVE).click();
      await page.keyboard.press('Escape');
      await expect(page.locator(LIVE)).toBeVisible();
      await auswahl(page, LIVE).selectOption('offen');
      await erwarteWerte(page, LIVE, '2', '2');
      await expect(page.locator(LIVE)).toBeVisible();

      // AK5: Schreibmarke in den Block klappt ihn zum Quelltext auf ...
      const quellZeile = page.locator(`${SEL.editorContent0} .cm-line`, {
        hasText: '!filter status',
      });
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Text davor.' }).click();
      await page.keyboard.press('ArrowDown');
      await expect(quellZeile).toBeVisible();
      await expect(page.locator(LIVE)).toHaveCount(0);
      // ... und das Verlassen wieder zu, mit der gemerkten Auswahl.
      await page.keyboard.press('Control+End');
      await expect(page.locator(LIVE)).toBeVisible();
      await expect(quellZeile).toHaveCount(0);
      await expect(auswahl(page, LIVE)).toHaveValue('offen');
      await erwarteWerte(page, LIVE, '2', '2');

      // Die Auswahl ist keine Bearbeitung.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});

test.describe('DN-05: Ordnungszahl im Live-Modus (F-405)', () => {
  test('das zweite Dashboard eines Dokuments behält im Widget seine eigene Auswahl', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Zwei.md')] });
    try {
      const blockNr = (ort, n) =>
        page.locator(ort).filter({
          has: page.locator('.dashboard-kachel-titel', { hasText: `Block ${n}` }),
        });
      const wert = (ort, n) => blockNr(ort, n).locator('.dashboard-kennzahl-wert');
      const LIVE_ALLE = `${SEL.paneSource0} .cm-live-block .perspective-dashboard`;
      await expect(wert(LESEN, 2)).toHaveText('2', { timeout: WARTE_BESTAND_MS });
      await blockNr(LESEN, 2).getByLabel('Status').selectOption('zu');
      await expect(wert(LESEN, 2)).toHaveText('3');
      await expect(wert(LESEN, 1)).toHaveText('2');

      await page.locator(SEL.viewBtn('live')).click();
      await expect(wert(LIVE_ALLE, 2)).toHaveText('3', { timeout: WARTE_BESTAND_MS });
      await expect(blockNr(LIVE_ALLE, 2).getByLabel('Status')).toHaveValue('zu');
      await expect(wert(LIVE_ALLE, 1)).toHaveText('2');
      await expect(blockNr(LIVE_ALLE, 1).getByLabel('Status')).toHaveValue('offen');
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});

test.describe('DN-02: Druck mit der aktuellen Auswahl (F-405)', () => {
  test('der Druck aus dem Live-Modus zeigt die gefilterten Werte samt Abfrage-Datei, ohne Auswahlfelder', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Dashboard.md')] });
    try {
      await erwarteWerte(page, LESEN, '2', '2');
      await auswahl(page, LESEN).selectOption('zu');
      await erwarteWerte(page, LESEN, '3', '3');
      await page.locator(SEL.viewBtn('live')).click();
      await erwarteWerte(page, LIVE, '3', '3');

      const druck = await druckeMitStub(app, page);
      expect(druck).toEqual({
        block: true,
        druck: true,
        anzahl: '3',
        geteilt: '3',
        felder: 0,
        kopf: 0,
      });
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});

test.describe('DN-03: portabler Export mit der Vorbelegung (F-405)', () => {
  test('Kacheln als Text, Tabelle und helles Bild, Vorbelegung oben, keine Auswahlfelder', async () => {
    const dir = makeFixtureDir();
    const ziel = path.join(dir, 'Export', 'Dashboard-portable.md');
    fs.mkdirSync(path.dirname(ziel));
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Dashboard.md')] });
    try {
      await erwarteWerte(page, LESEN, '2', '2');
      // Die Auswahl der Ansicht geht nicht in den Export.
      await auswahl(page, LESEN).selectOption('zu');
      await erwarteWerte(page, LESEN, '3', '3');

      const inhalt = await exportiere(app, ziel);
      const teil = inhalt.slice(inhalt.indexOf('Text davor.'), inhalt.indexOf('Schluss.'));
      expect(teil).toContain('*Stand der Vorbelegung\\: Status\\: offen*');
      expect(teil).toContain('## Anzahl\n\n**2**');
      expect(teil).toContain('## Geteilt\n\n**2**');
      expect(teil).toContain(
        '## Aufgaben\n\n| Datei | status |\n| --- | --- |\n| [[A]] | offen |\n| [[B]] | offen |',
      );
      expect(teil).toMatch(
        /## Je Status\n\n<img alt="Je Status" src="data:image\/svg\+xml;base64,[^"]+">/,
      );
      // AK4: kein Auswahlfeld, kein Quelltext, kein Hinweis auf fehlende Bedienung.
      expect(teil).not.toMatch(/select|perspective-dashboard|!kachel|!filter|LIST FROM/);

      // Die Datei zeigt beim erneuten Öffnen Beschriftung, Überschriften und Bild.
      await oeffneDatei(app, ziel);
      const body = page.locator(SEL.markdownBody0);
      await expect(body.getByText('Stand der Vorbelegung: Status: offen')).toBeVisible({
        timeout: WARTE_BESTAND_MS,
      });
      await expect(body.locator('img[src^="data:image/svg+xml"]')).toHaveCount(1);
      await expect(body.locator('.perspective-dashboard')).toHaveCount(0);
      await expect(body.locator('select')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});

test.describe('DN-04: Dashboard in einer Einbettung (F-405)', () => {
  test('der eingebettete Abschnitt zeigt das Dashboard mit bedienbarem Filter', async () => {
    const dir = makeFixtureDir();
    const { app, page, userData } = await launchApp({ args: [path.join(dir, 'Einbettung.md')] });
    try {
      const ort = `${SEL.markdownBody0} .wiki-embed-md-body .perspective-dashboard`;
      await erwarteWerte(page, ort, '2', '2');
      await auswahl(page, ort).selectOption('zu');
      await erwarteWerte(page, ort, '3', '3');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});
