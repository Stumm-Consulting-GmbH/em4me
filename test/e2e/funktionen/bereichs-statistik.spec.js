// 4T-000620 (Epic 3E-000117): E2E-Funktions-Suite der Bereichs-Statistik.
// BS-01: Öffnen über den Menü-Kanal (read-only System-Seite, sechs
// Abschnitte, Zahlen treffen den angelegten Bestand); BS-02: erneutes
// Öffnen aktiviert den bestehenden Tab statt zu duplizieren; BS-03:
// Aktualisieren nach einer neuen Datei zeigt die erhöhte Zahl; BS-04: ohne
// Bereich lokalisierter Hinweis statt Seite; BS-05: Klick auf einen
// Dateinamen der Auffälligkeiten öffnet die Datei; BS-06: Erweiterung aus
// entfernt das Kommando; BS-07: der Stand-Ausweis bei ungespeicherten
//
// 4T-001517 (Epic 3E-000172): BS-08 die vierte Auffälligkeits-Liste nennt
// die Dateien ohne eingehenden Verweis, deckt sich mit der Kennzahl und ist
// über deren Wert erreichbar.
//
// Änderungen (4T-000953). describe-Titel tragen die Matrix-ID
// (test/abdeckungs-matrix.json, S-118).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Menü-Klicks simulieren (Muster smoke.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Bereichs-Wurzel mit bekanntem Bestand:
//   3 Markdown-Dateien, 1 Unterordner, 1 Bild, 1 Begleitdatei zu Start.md.
//   Start -> Ziel (Wiki-Verweis), Ziel und Solo ohne ausgehende Verweise.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-e2e-'));
  fs.writeFileSync(
    path.join(areaRoot, 'Start.md'),
    '---\ntags: [projekt]\n---\n\n# Start\n\nSiehe [[Ziel]].\n\n- [ ] offene Aufgabe\n',
    'utf8',
  );
  fs.writeFileSync(path.join(areaRoot, 'Ziel.md'), '# Ziel\n\nInhalt.\n', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Solo.md'), '# Solo\n\nOhne Verweise.\n', 'utf8');
  fs.mkdirSync(path.join(areaRoot, 'Anlagen'));
  fs.writeFileSync(path.join(areaRoot, 'Anlagen', 'bild.png'), 'PNG-Attrappe', 'utf8');
  fs.writeFileSync(path.join(areaRoot, 'Start.mdd'), 'Begleit', 'utf8');
  return areaRoot;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Bereich an das Fenster binden (Muster graphenansicht.spec.js).
async function bindArea(page, areaRoot) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
}

const STATS_PAGE = '.pane-group[data-pane="0"] .area-stats-page';

// Seite öffnen und auf erhobene Zahlen warten. Der Menü-Kanal wird per Poll
// wiederholt gesendet, weil der Listener erst am Ende des asynchronen
// init() registriert ist; der Bereichs-Index baut asynchron auf, deshalb
// wird zusätzlich auf einen Stand-Zeitstempel gewartet.
async function openStatsAndWait(app, page) {
  await expect
    .poll(async () => {
      if ((await page.locator(STATS_PAGE).count()) === 0) {
        await sendMenuChannel(app, 'menu:openAreaStats');
      }
      return page.locator(STATS_PAGE).count();
    })
    .toBe(1);
  await expect(page.locator(`${STATS_PAGE} .area-stats-stand`)).toBeVisible({ timeout: 15000 });
}

// Wert einer Kennzahlen-Zeile über ihre Beschriftung.
function figure(page, label) {
  return page.locator(`${STATS_PAGE} .area-stats-figures tr`, { hasText: label }).first();
}

test.describe('BS-01: Statistik-Seite öffnet als read-only Tab mit allen Abschnitten (S-118)', () => {
  test('zeigt sechs Abschnitte und Zahlen, die den Bestand treffen', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);

      // Read-only System-Seite: eigener Tab, View-Buttons deaktiviert.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      const areaName = path.basename(areaRoot);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(
        `Bereichs-Statistik: ${areaName}`,
      );

      // Sechs Abschnitte in der festgelegten Reihenfolge.
      await expect(page.locator(`${STATS_PAGE} .area-stats-section-title`)).toHaveCount(6);

      // Zahlen des angelegten Bestands: 3 Markdown-Dateien, 1 Bild als
      // einzige Nicht-Markdown-Datei, 1 Ordner. Die Begleitdatei zählt
      // ausdrücklich NICHT als Nicht-Markdown-Datei.
      await expect(figure(page, 'Markdown-Dateien')).toContainText('3');
      await expect(figure(page, 'Nicht-Markdown-Dateien')).toContainText('1');
      await expect(figure(page, 'Ordner')).toContainText('1');
      await expect(figure(page, 'Markdown-Dateien mit Begleitdatei')).toContainText('1 von 3');
      await expect(figure(page, 'Aufgaben')).toContainText('1');
      await expect(figure(page, 'Wiki-Verweise')).toContainText('1');

      // Häufigkeits-Tabelle der Tags: der eine Tag mit einer Datei.
      await expect(page.locator(`${STATS_PAGE} .area-stats-table`).first()).toBeVisible();
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('BS-02/BS-03: Tab-Wiederverwendung und Aktualisieren (S-118)', () => {
  test('dupliziert den Tab nicht und zeigt nach dem Aktualisieren frische Zahlen', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);
      const tabCount = await page.locator(SEL.tabs0).count();

      // BS-02: erneutes Öffnen aktiviert den bestehenden Tab.
      await sendMenuChannel(app, 'menu:openAreaStats');
      await expect(page.locator(SEL.tabs0)).toHaveCount(tabCount);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText(
        'Bereichs-Statistik:',
      );

      // BS-03: neue Datei anlegen, dann aktualisieren.
      fs.writeFileSync(path.join(areaRoot, 'Neu.md'), '# Neu\n', 'utf8');
      await expect
        .poll(
          async () => {
            await page.locator(`${STATS_PAGE} .area-stats-refresh`).click();
            return figure(page, 'Markdown-Dateien').textContent();
          },
          { timeout: 20000 },
        )
        .toContain('4');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('BS-05: Klick auf eine auffällige Datei öffnet sie (S-118)', () => {
  test('öffnet die Datei als eigenen Tab', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);
      const tabCount = await page.locator(SEL.tabs0).count();

      await page.locator(`${STATS_PAGE} .area-stats-file`).first().click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(tabCount + 1);
      // 4T-001724 (Epic 3E-000304): Der Reiter traegt den Namen ohne
      // Markdown-Endung. Geprueft wird deshalb der gekuerzte Name einer der
      // drei Bestands-Dateien statt der Endung selbst — strenger als vorher,
      // weil jetzt ein konkreter Name dastehen muss.
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(
        /^(Start|Ziel|Solo)$/,
      );
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('BS-04: ohne Bereich deaktiviert (S-118)', () => {
  test('Menü-Kanal ohne Bereich zeigt den lokalisierten Hinweis statt einer Seite', async () => {
    const { app, page, userData } = await launchApp();
    try {
      const hint = page.locator('#statusbar-hint');
      await expect
        .poll(async () => {
          if (!/visible/.test((await hint.getAttribute('class')) || '')) {
            await sendMenuChannel(app, 'menu:openAreaStats');
          }
          return (await hint.getAttribute('class')) || '';
        })
        .toMatch(/visible/);
      await expect(hint).toHaveClass(/error/);
      await expect(page.locator(STATS_PAGE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('BS-06: Erweiterung aus entfernt den Kontextmenü-Zugang (S-118)', () => {
  test('das Bereichs-Panel zeigt beide Einträge, im Aus-Zustand nur den Graph', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    void app;
    try {
      await bindArea(page, areaRoot);
      // 4T-001775 (Epic 3E-000304): Die Beschriftung steht ohne Markdown-Endung.
      const row = page.locator('.pane-group[data-pane="0"] .area-file-row', {
        hasText: /^Start$/,
      });
      await expect(row).toBeVisible();

      // Beide Erweiterungen aktiv: beide panel-weiten Einträge stehen da.
      await row.click({ button: 'right' });
      await expect(page.locator('#context-menu [data-menu-id="area-panel-graph"]')).toBeVisible();
      await expect(page.locator('#context-menu [data-menu-id="area-panel-stats"]')).toBeVisible();
      await page.keyboard.press('Escape');

      // Statistik-Erweiterung aus: nur der Graph-Eintrag bleibt. Das
      // Anwenden der Einstellung läuft asynchron, deshalb per Poll.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['area-stats']));
      await expect
        .poll(async () => {
          // 4T-000874: Vor jedem Versuch das ggf. offene Menue schliessen —
          // ein zweiter Rechtsklick bei offenem Menue trifft das Menue statt
          // die Zeile, und der Poll bliebe auf dem alten Stand stehen.
          //
          // 4T-001086: Gewartet wird auf das **geschlossene Menue**, nicht auf
          // eine feste Zeitspanne. Die fruehere Pause von 300 ms war unter
          // Last zu kurz: Das Menue stand noch offen, der Rechtsklick traf es
          // statt die Zeile, und die Zaehlung fiel deshalb NIE auf 0 — der
          // Poll lief in sein Zeitlimit, obwohl die Einstellung laengst wirkte.
          // Belegt am 2026-08-19: unter einer zweiten, parallel laufenden
          // Electron-Instanz zwei von drei Laeufen rot, ohne sie gruen.
          // Die Regel dazu steht in test/README.md (Warte-Bedingungen liefern
          // den Zustand, nicht die Zeit); das Muster stammt aus
          // tab-gruppen.spec.js und 4t-0315.spec.js.
          await page.keyboard.press('Escape');
          await expect(page.locator('#context-menu')).toBeHidden();
          await row.click({ button: 'right' });
          return page.locator('#context-menu [data-menu-id="area-panel-stats"]').count();
        })
        .toBe(0);
      await expect(page.locator('#context-menu [data-menu-id="area-panel-graph"]')).toBeVisible();
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-000953 (Epic 3E-000198, Befund E-07): Die Seite bleibt am gespeicherten
// Stand — Entscheidung des Product Owners vom 2026-09-06 — und sagt es.
// Geprüft wird der Ausweis am Weg des Anwenders: Seite öffnen, in einem
// Dokument tippen ohne zu speichern, Seite neu erheben.
//
// Die Statistik-Seite ist ein eigener, read-only Tab. Nach dem Tippen wird
// deshalb auf ihn zurückgewechselt und über ihren eigenen Knopf neu erhoben;
// sie zieht bewusst nicht von selbst nach (der Stand-Zeitstempel ist die
// Zusage, dass die Zahlen von genau diesem Zeitpunkt sind).
test.describe('BS-07: Stand-Ausweis bei ungespeicherten Änderungen (S-118)', () => {
  test('nennt den gespeicherten Stand und zählt die offenen Dokumente', async () => {
    test.setTimeout(120000);
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp({
      args: [path.join(areaRoot, 'Start.md')],
    });
    const hinweis = page.locator(`${STATS_PAGE} .area-stats-state`);
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);

      // Anker: Der erste Satz steht immer, der zweite noch nicht — es gibt
      // nichts auszuweisen.
      await expect(hinweis).toContainText('gespeicherten Stand');
      await expect(hinweis).not.toContainText('ungespeicherte Änderungen');

      // In das offene Dokument schreiben, NICHT speichern.
      await page.locator(SEL.tabs0, { hasText: 'Start' }).first().click();
      await page.locator(SEL.viewBtn('source')).click();
      const huelle = page.locator(SEL.paneSourceEditor0);
      await expect(huelle).toBeVisible();
      if (await huelle.evaluate((el) => el.classList.contains('read-only'))) {
        await page.locator(SEL.btnEdit).click();
      }
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nFrisch getippt, nicht gespeichert.');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Zurück auf die Statistik-Seite und neu erheben.
      await page.locator(SEL.tabs0, { hasText: 'Bereichs-Statistik' }).first().click();
      await expect(page.locator(STATS_PAGE)).toBeVisible();

      // Erhoben wird im Poll, nicht mit einem einzelnen Klick: Die Seite
      // zieht bewusst nicht von selbst nach (ihr Stand-Zeitstempel ist die
      // Zusage, dass die Zahlen von genau diesem Zeitpunkt sind), und der
      // geschriebene Stand erreicht den Hauptprozess erst verzögert — die
      // Overlay-Schicht meldet gebündelt statt bei jedem Tastendruck. Ein
      // einzelner Klick trifft dieses Fenster nicht zuverlässig; eine feste
      // Pause davor wäre die Wartezeit-Variante desselben Fehlers.
      const knopf = page.locator(`${STATS_PAGE} .area-stats-refresh`);
      await expect
        .poll(
          async () => {
            if (await knopf.isEnabled()) await knopf.click();
            return (await hinweis.textContent()) || '';
          },
          { timeout: 30000, intervals: [1000] },
        )
        .toContain('Ein offenes Dokument');
      await expect(hinweis).toContainText('gespeicherten Stand');

      // Und die Zahlen selbst sind unverändert: Die Seite rechnet den
      // Puffer nicht ein, sie weist ihn aus.
      await expect(figure(page, 'Markdown-Dateien')).toContainText('3');
    } finally {
      // force: true, weil dieser Fall bewusst einen ungespeicherten Reiter
      // hinterlaesst — ohne das Kennzeichen fragt das Fenster beim Schliessen
      // nach dem Speichern, der Dialog bleibt stehen und der Worker laeuft in
      // sein Teardown-Zeitlimit (Muster der Erhebungs-Spec 4t-0936).
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// 4T-001517 (Epic 3E-000172): Der Fixture-Bereich hat genau zwei Waisen —
// Start.md (auf das niemand verweist) und Solo.md. Diese Zahl steht hier von
// Hand nachgerechnet, die Deckung von Liste und Kennzahl prueft der Fall
// jedoch gegeneinander und nicht gegen sie.
test.describe('BS-08: Liste der Dateien ohne eingehenden Verweis (S-118)', () => {
  test('nennt die Waisen, deckt sich mit der Kennzahl und ist ueber deren Wert erreichbar', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);

      const block = page.locator(`${STATS_PAGE} #area-stats-waisen`);
      await expect(block).toBeVisible();
      const namen = block.locator('.area-stats-file');
      await expect(namen).toHaveCount(2);
      await expect(namen.nth(0)).toHaveText('Solo');
      await expect(namen.nth(1)).toHaveText('Start');

      // Die Kennzahl nennt dieselbe Zahl und traegt sie als Knopf.
      const knopf = figure(page, 'Dateien ohne eingehenden Verweis').locator('.area-stats-jump');
      await expect(knopf).toHaveText('2');
      // Einspaltig: der Wert waere in jeder Zeile die Null.
      await expect(block.locator('thead th')).toHaveCount(1);

      // Der Sprung ist mit der Tastatur erreichbar und laeuft ohne Fehler.
      await knopf.focus();
      await expect(knopf).toBeFocused();
      await knopf.press('Enter');
      await expect(block).toBeVisible();

      // Ein Eintrag der Liste oeffnet seine Datei wie in den drei Nachbarn.
      const tabCount = await page.locator(SEL.tabs0).count();
      await namen.nth(0).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(tabCount + 1);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText('Solo');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
