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
// 4T-002783 (Epic 3E-000392): BS-09 bis BS-12 die Liste «Verweise ohne Ziel»:
// Spalten, Reihenfolge, Gründe und Kennzahl samt Sprung (BS-09), der Sprung an
// die Zeile des Verweises in Lese- und Quellcode-Ansicht, für ein noch nicht
// und ein schon offenes Dokument, dazu der Folgeteil eines geteilten Dokuments
// (BS-10), gespeicherter und ungespeicherter Stand (BS-11) und die
// ausgeschaltete Erweiterung (BS-12).
//
// Änderungen (4T-000953). describe-Titel tragen die Matrix-ID
// (test/abdeckungs-matrix.json, S-118).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { bedieneBis } = require('../helpers/eingabe');

// Menü-Klicks simulieren (Muster smoke.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await hauptSenden(
    app,
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
//
// 4T-001689: Zugesichert wird, dass der Bereich DIESES Fenster übernommen hat
// (Muster 4t-0936-ungespeicherter-stand.spec.js). Ist schon ein Dokument
// gemeldet, öffnet openAreaPath ein eigenes Fenster und meldet createdNew;
// bisher fiel das erst als fehlende Statistik-Seite auf (gemessen an BS-07
// unter Rechenlast).
async function bindArea(page, areaRoot) {
  let ergebnis = null;
  await expect
    .poll(async () => {
      ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  expect(ergebnis.boundExisting, 'Bereich muss an dieses Fenster binden').toBe(true);
}

const STATS_PAGE = '.pane-group[data-pane="0"] .area-stats-page';

// Seite öffnen und auf erhobene Zahlen warten. Der Menü-Kanal wird per Poll
// wiederholt gesendet, weil der Listener erst am Ende des asynchronen
// init() registriert ist; der Bereichs-Index baut asynchron auf, deshalb
// wird zusätzlich auf einen Stand-Zeitstempel gewartet.
//
// 4T-001689: Vor dem Stand-Zeitstempel wird geprüft, dass der Eintrag der
// Statistik-Seite der AKTIVE im Dokument-Streifen ist (Muster BS-01). Die
// Sichtbarkeit eines Elements allein trennt nicht zwischen «noch nicht
// erhoben» und «Seite steht im Hintergrund»; gemessen ist das zweite (BS-07,
// ein später geöffnetes Start-Dokument holte seinen Eintrag nach vorn). So
// meldet sich ein solches Rennen hier mit dem aktiven Eintrag als Befund statt
// nach 15 s als unsichtbares Element.
//
// 4T-002181: Die geöffnete Seite ist nur der Vorbote der erhobenen Zahlen
// (Stabilitätsregel 12). Steht der Bereichs-Index beim Öffnen noch im Aufbau,
// zeigt sie «Der Bereichs-Index wird aufgebaut …» und zieht danach nicht von
// selbst nach (erhebeUndZeichne in area-stats-page.js läuft beim Öffnen und auf
// «Aktualisieren», sonst nicht). Dass es bisher gutging, liegt naheliegend
// daran, dass der erste Menü-Befehl vor dem Binden des Empfängers verpuffte und
// der Poll ihn erst später wiederholte; diese Verzögerung gab dem Index die
// Zeit (Vermutung, nicht gemessen). Seit launchApp auf das Bereit-Zeichen
// wartet (4T-002062), stand die Seite am 2026-10-25 im Aufbau-Hinweis fest:
// BS-01, BS-05 und BS-08 in vier von vier Läufen der Prüfdatei rot, BS-02/03
// in drei von vier, jeweils nach 15 s ohne Stand-Zeitstempel. Bedient wird
// deshalb der Knopf «Aktualisieren», bis der Stand-Zeitstempel steht; ist er
// schon beim Öffnen da, entfällt der Klick.
async function openStatsAndWait(app, page) {
  await expect
    .poll(async () => {
      if ((await page.locator(STATS_PAGE).count()) === 0) {
        await sendMenuChannel(app, 'menu:openAreaStats');
      }
      return page.locator(STATS_PAGE).count();
    })
    .toBe(1);
  await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText('Bereichs-Statistik:');
  const stand = page.locator(`${STATS_PAGE} .area-stats-stand`);
  await bedieneBis(page.locator(`${STATS_PAGE} .area-stats-refresh`), () => stand.isVisible(), {
    zugriffsFristMs: 1000,
  });
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
    // 4T-001689: Bereich und Dokument im selben Fenster, in fester Reihenfolge:
    // ohne Datei-Argument starten, binden, DANN das Dokument öffnen, und erst
    // wenn sein Eintrag aktiv ist, die Statistik. Beide früheren Rennen sind
    // gemessen — die Statistik-Seite vor dem nachlaufenden Dokument (Seite im
    // Hintergrund) und das Dokument vor der Bindung (Bereich im eigenen
    // Fenster); Begründung an den Helfern in helpers/app.js und in
    // test/README.md, Regel 32.
    const { app, page, userData } = await launchApp();
    const hinweis = page.locator(`${STATS_PAGE} .area-stats-state`);
    try {
      await bindArea(page, areaRoot);
      await oeffneDokumentImFenster(app, page, path.join(areaRoot, 'Start.md'));
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

// --- 4T-002783: Verweise ohne Ziel -------------------------------------------

const TOTE_LISTE = `${STATS_PAGE} #area-stats-verweise-ohne-ziel`;
const GERENDERT = '.pane-group[data-pane="0"] .pane-rendered';

// Bereich mit toten Verweisen dreier Gründe in zwei Dokumenten. Alpha ist lang
// genug, dass der Sprung rollen muss: 200 Absätze «Absatz 001» bis «Absatz
// 200», «Absatz NNN» steht in Dokument-Zeile 2 · NNN + 1. Beta trägt denselben
// toten Verweis an drei Stellen; die Kennzahl zählt Verweise, nicht Dokumente.
function makeDeadArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-tot-e2e-'));
  const absaetze = [];
  for (let n = 1; n <= 200; n++) {
    const zusatz = n === 150 ? ' [[Fehlt]]' : n === 160 ? ' [[Ziel#Weg]]' : '';
    absaetze.push(`Absatz ${String(n).padStart(3, '0')}${zusatz}`, '');
  }
  const alpha = path.join(areaRoot, 'Alpha.md');
  fs.writeFileSync(alpha, ['# Alpha', '', ...absaetze].join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(areaRoot, 'Beta.md'),
    '# Beta\n\n[[Fehlt]]\n\nNoch einmal [[Fehlt]].\n\nUnd [[Fehlt]] zum dritten.\n\nBlock [[Ziel#^fehlt]].\n',
    'utf8',
  );
  fs.writeFileSync(path.join(areaRoot, 'Ziel.md'), '# Ziel\n\nInhalt.\n', 'utf8');
  return { areaRoot, alpha };
}

// Geteiltes Dokument «Gross» aus Kopf-Datei und einem Folgeteil (Form der
// Zuordnungs-Zeile wie in datenbank-tabelle.spec.js). Der tote Verweis steht
// im Folgeteil; die Liste muss ihn dem Dokument «Gross» zuordnen und an seine
// Zeile im zusammengesetzten Text springen.
function makeSplitArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-teil-e2e-'));
  const zeilen = (praefix, tot) => {
    const out = [];
    for (let n = 1; n <= 80; n++) {
      out.push(`${praefix} ${String(n).padStart(3, '0')}${n === tot ? ' [[Fehlt-Teil]]' : ''}`, '');
    }
    return out;
  };
  const kopf = path.join(areaRoot, 'Gross.md');
  fs.writeFileSync(
    kopf,
    ['---', 'doc-part: v1|1|Gross', '---', '', '# Gross', '', ...zeilen('Kopf', 0)].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(areaRoot, 'Gross•part-00002.md'),
    ['---', 'doc-part: v1|2|Gross', '---', ...zeilen('Teil', 40)].join('\n'),
    'utf8',
  );
  return { areaRoot, kopf };
}

// Zellen-Texte aller Zeilen der Liste.
async function toteZeilen(page) {
  return page
    .locator(`${TOTE_LISTE} tbody tr`)
    .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent)));
}

// Zeilen-Nummer, Text und Spalte der Schreibmarke über die Editor-Sicht
// (Zugang wie `schreibmarke` in lese-position.spec.js).
async function schreibmarke(page) {
  return page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return null;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    if (!tile || !tile.view) return null;
    const st = tile.view.state;
    const zeile = st.doc.lineAt(st.selection.main.head);
    return { nummer: zeile.number, text: zeile.text, spalte: st.selection.main.head - zeile.from };
  }, SEL.editorContent0);
}

// Steht die Zeile der Schreibmarke ganz im sichtbaren Ausschnitt der
// Quellcode-Ansicht? Gemessen an der Bildlauf-Fläche des Editors (4T-002783).
async function markeImBild(page) {
  return page.evaluate((P) => {
    const el = document.querySelector(P);
    if (!el || !el.cmTile) return false;
    let tile = el.cmTile;
    while (tile.parent) tile = tile.parent;
    if (!tile || !tile.view) return false;
    const view = tile.view;
    const k = view.coordsAtPos(view.state.selection.main.head);
    if (!k) return false;
    const r = view.scrollDOM.getBoundingClientRect();
    return k.top >= r.top - 1 && k.bottom <= r.bottom + 1;
  }, SEL.editorContent0);
}

// Steht der Absatz, der mit `anfang` beginnt, ganz im sichtbaren Ausschnitt der
// Lese-Ansicht? (Muster `verweisSichtbar` in LP-04 (v), lese-position.spec.js.)
// 4T-002783 (Befund der Abnahme 3E-000392/001): Die Titelzeile klebt am oberen
// Rand der Fläche und deckt ab, was darunter liegt. Sichtbar beginnt der
// Ausschnitt deshalb an ihrer Unterkante, nicht am Rand der Fläche; gemessen am
// Rand der Fläche galt ein Absatz unter der Titelzeile als sichtbar.
function absatzSichtbar(page, anfang) {
  return page.evaluate(
    ({ container, anfang }) => {
      const sc = document.querySelector(container);
      if (!sc) return false;
      const p = [...sc.querySelectorAll('.markdown-body p')].find((el) =>
        el.textContent.trim().startsWith(anfang),
      );
      if (!p) return false;
      const a = sc.getBoundingClientRect();
      const kopf = sc.querySelector(':scope > .title-line');
      const kopfUnten = kopf && !kopf.hidden ? kopf.getBoundingClientRect().bottom : a.top;
      const oben = Math.max(a.top, kopfUnten);
      const b = p.getBoundingClientRect();
      return b.top >= oben - 1 && b.bottom <= a.bottom + 1;
    },
    { container: GERENDERT, anfang },
  );
}

// Klick auf die Zeile der Liste mit Dokument `name` und Zeile `zeile`.
async function klickeToteZeile(page, name, zeile) {
  const tr = page
    .locator(`${TOTE_LISTE} tbody tr`)
    .filter({ has: page.locator('.area-stats-file', { hasText: new RegExp(`^${name}$`) }) })
    .filter({ has: page.locator('td.area-stats-value', { hasText: new RegExp(`^${zeile}$`) }) });
  await expect(tr).toHaveCount(1);
  await tr.locator('td.area-stats-link').click();
}

test.describe('BS-09: Liste der Verweise ohne Ziel mit Kennzahl (S-118)', () => {
  test('Spalten, Reihenfolge und Gründe; die Kennzahl zählt Verweise und springt zur Liste', async () => {
    const { areaRoot } = makeDeadArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);

      const liste = page.locator(TOTE_LISTE);
      await expect(liste).toBeVisible();
      await expect(liste.locator('h5')).toHaveText('Verweise ohne Ziel');
      await expect(liste.locator('thead th')).toHaveText(['Dokument', 'Zeile', 'Verweis', 'Grund']);
      // Sortiert nach Dokument und Zeile, ungekürzt, je Verweis eine Zeile.
      await expect
        .poll(() => toteZeilen(page))
        .toEqual([
          ['Alpha', '301', '[[Fehlt]]', 'Dokument fehlt'],
          ['Alpha', '321', '[[Ziel#Weg]]', 'Überschrift fehlt'],
          ['Beta', '3', '[[Fehlt]]', 'Dokument fehlt'],
          ['Beta', '5', '[[Fehlt]]', 'Dokument fehlt'],
          ['Beta', '7', '[[Fehlt]]', 'Dokument fehlt'],
          ['Beta', '9', '[[Ziel#^fehlt]]', 'Block-Anker fehlt'],
        ]);
      // Ohne nicht erreichbaren verknüpften Bereich keine Hinweis-Zeile.
      await expect(liste.locator('.area-stats-unchecked')).toHaveCount(0);

      // Die Kennzahl unter «Inhalte» steht hinter den Dateien ohne eingehenden
      // Verweis, zählt die sechs Verweise und trägt den Sprung zur Liste.
      const namen = await page
        .locator(`${STATS_PAGE} .area-stats-figures tr td:first-child`)
        .allTextContents();
      const stelle = namen.indexOf('Verweise ohne Ziel');
      expect(stelle).toBeGreaterThan(0);
      expect(namen[stelle - 1]).toBe('Dateien ohne eingehenden Verweis');
      const knopf = figure(page, 'Verweise ohne Ziel').locator('.area-stats-jump');
      await expect(knopf).toHaveText('6');
      await expect(knopf).toHaveAttribute('title', 'Zur Liste der Verweise ohne Ziel springen');
      await knopf.click();
      await expect(liste).toBeInViewport();
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });

  test('ohne tote Verweise steht «Keine», und die Kennzahl ist 0 ohne Sprung', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await bindArea(page, areaRoot);
      await openStatsAndWait(app, page);
      const liste = page.locator(TOTE_LISTE);
      await expect(liste.locator('.area-stats-empty')).toHaveText('Keine');
      await expect(liste.locator('table')).toHaveCount(0);
      const zeile = figure(page, 'Verweise ohne Ziel');
      await expect(zeile.locator('td').nth(1)).toHaveText('0');
      await expect(zeile.locator('.area-stats-jump')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// Der Sprung an die Zeile: je Ansicht ein Profil mit Standard-Ansicht (Muster
// eigenschafts-profile.spec.js), je Ansicht ein noch nicht und ein schon
// offenes Dokument. Gemessen wird in der Lese-Ansicht, dass der Absatz des
// Verweises ganz sichtbar ist, und in der Quellcode-Ansicht die Zeile der
// Schreibmarke und dass diese Zeile im sichtbaren Ausschnitt steht.
for (const modus of ['rendered', 'source']) {
  for (const offen of [false, true]) {
    const fall = `${modus === 'rendered' ? 'Lese' : 'Quellcode'}-Ansicht, ${offen ? 'Dokument schon offen' : 'Dokument nicht offen'}`;
    test.describe(`BS-10: Klick auf einen Verweis ohne Ziel öffnet die Zeile (S-118), ${fall}`, () => {
      test('öffnet Alpha an der Zeile des Verweises', async () => {
        const { areaRoot, alpha } = makeDeadArea();
        const { app, page, userData } = await launchApp({
          settings: { language: 'de', app: { defaultViewMode: modus } },
        });
        try {
          await bindArea(page, areaRoot);
          if (offen) await oeffneDokumentImFenster(app, page, alpha);
          await openStatsAndWait(app, page);
          const reiterVorher = await page.locator(SEL.tabs0).count();

          await klickeToteZeile(page, 'Alpha', 301);
          await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(/^Alpha$/);
          // Ein offenes Dokument wird nach vorn geholt, kein zweiter Reiter.
          await expect(page.locator(SEL.tabs0)).toHaveCount(reiterVorher + (offen ? 0 : 1));
          if (modus === 'rendered') {
            // 4T-002783: Die Titelzeile steht, sonst prüfte die Messung den
            // Befund der Abnahme nicht mit.
            await expect(page.locator(`${GERENDERT} > .title-line`)).toBeVisible();
            await expect.poll(() => absatzSichtbar(page, 'Absatz 150')).toBe(true);
          } else {
            await expect
              .poll(() => schreibmarke(page))
              .toEqual({ nummer: 301, text: 'Absatz 150 [[Fehlt]]', spalte: 0 });
            // 4T-002783: Die Zeile steht auch im Bild, nicht nur die Marke
            // (Befund vom 2026-11-22: Lage 0, Zeile außer Sicht).
            await expect.poll(() => markeImBild(page)).toBe(true);
          }
        } finally {
          await closeApp(app, userData);
          cleanupDir(areaRoot);
        }
      });
    });
  }
}

test.describe('BS-10: Verweis ohne Ziel im Folgeteil eines geteilten Dokuments (S-118)', () => {
  test('steht unter dem Dokument und öffnet es an der Zeile im zusammengesetzten Text', async () => {
    const { areaRoot, kopf } = makeSplitArea();
    const { app, page, userData } = await launchApp({
      settings: { language: 'de', app: { defaultViewMode: 'source' } },
    });
    try {
      await bindArea(page, areaRoot);
      await oeffneDokumentImFenster(app, page, kopf);
      await openStatsAndWait(app, page);
      const reiterVorher = await page.locator(SEL.tabs0).count();

      // Eine Zeile, unter dem Namen des Dokuments, nicht der Teil-Datei.
      let zeilen = [];
      await expect
        .poll(async () => {
          zeilen = await toteZeilen(page);
          return zeilen.map(([name, , verweis]) => `${name} ${verweis}`);
        })
        .toEqual(['Gross [[Fehlt-Teil]]']);
      const zeile = Number(zeilen[0][1]);
      expect(Number.isInteger(zeile)).toBe(true);

      await klickeToteZeile(page, 'Gross', zeile);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(/^Gross$/);
      await expect(page.locator(SEL.tabs0)).toHaveCount(reiterVorher);
      await expect
        .poll(() => schreibmarke(page))
        .toEqual({ nummer: zeile, text: 'Teil 040 [[Fehlt-Teil]]', spalte: 0 });
      await expect.poll(() => markeImBild(page)).toBe(true);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// Die Liste folgt dem gespeicherten Stand (Entscheidung des Product Owners vom
// 2026-09-06, BS-07): Berichtigt wird in Alpha auf der Platte, also gespeichert;
// der neue tote Verweis entsteht im Editor in Beta, zuerst ungespeichert.
test.describe('BS-11: Verweise ohne Ziel folgen dem gespeicherten Stand (S-118)', () => {
  test('berichtigt verschwindet, neu gespeichert erscheint, ungespeichert wirkt nicht', async () => {
    test.setTimeout(120000);
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-stats-tot-stand-e2e-'));
    const alpha = path.join(areaRoot, 'Alpha.md');
    const beta = path.join(areaRoot, 'Beta.md');
    fs.writeFileSync(alpha, '# Alpha\n\nSiehe [[Fehlt]].\n', 'utf8');
    fs.writeFileSync(beta, '# Beta\n\nText.\n', 'utf8');
    fs.writeFileSync(path.join(areaRoot, 'Ziel.md'), '# Ziel\n\nInhalt.\n', 'utf8');
    const { app, page, userData } = await launchApp({
      settings: { language: 'de', app: { defaultViewMode: 'source' } },
    });
    const liste = page.locator(TOTE_LISTE);
    const knopf = page.locator(`${STATS_PAGE} .area-stats-refresh`);
    // Neu erheben im Poll, wie BS-07: Die Seite zieht nicht von selbst nach.
    const erhebeBis = async (messung, soll) =>
      expect
        .poll(
          async () => {
            if (await knopf.isEnabled()) await knopf.click();
            return messung();
          },
          { timeout: 30000, intervals: [1000] },
        )
        .toEqual(soll);
    const verweise = async () => (await toteZeilen(page)).map((z) => `${z[0]} ${z[2]}`);
    try {
      await bindArea(page, areaRoot);
      await oeffneDokumentImFenster(app, page, beta);
      await openStatsAndWait(app, page);
      await expect.poll(verweise).toEqual(['Alpha [[Fehlt]]']);

      // Berichtigt und gespeichert: nach «Aktualisieren» weg.
      fs.writeFileSync(alpha, '# Alpha\n\nSiehe [[Ziel]].\n', 'utf8');
      await erhebeBis(() => liste.locator('.area-stats-empty').count(), 1);

      // Neu geschrieben, nicht gespeichert: ohne Wirkung. Eingefügt wird ohne
      // Tasten-Ereignisse, damit keine Klammer-Ergänzung des Editors mitschreibt.
      await page.locator(SEL.tabs0, { hasText: 'Beta' }).first().click();
      const huelle = page.locator(SEL.paneSourceEditor0);
      await expect(huelle).toBeVisible();
      if (await huelle.evaluate((el) => el.classList.contains('read-only'))) {
        await page.locator(SEL.btnEdit).click();
      }
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('\n\n[[Neu-Fehlt]]');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await page.locator(SEL.tabs0, { hasText: 'Bereichs-Statistik' }).first().click();
      await expect(page.locator(STATS_PAGE)).toBeVisible();
      const hinweis = page.locator(`${STATS_PAGE} .area-stats-state`);
      await erhebeBis(
        async () => ((await hinweis.textContent()) || '').includes('Ein offenes Dokument'),
        true,
      );
      await expect(liste.locator('.area-stats-empty')).toHaveText('Keine');

      // Gespeichert: nach «Aktualisieren» in der Liste.
      await page.locator(SEL.tabs0, { hasText: 'Beta' }).first().click();
      await sendMenuChannel(app, 'menu:save');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      await page.locator(SEL.tabs0, { hasText: 'Bereichs-Statistik' }).first().click();
      await expect(page.locator(STATS_PAGE)).toBeVisible();
      await erhebeBis(verweise, ['Beta [[Neu-Fehlt]]']);

      // Abnahme-Handgriff der Story (AK8): Der neue Eintrag öffnet per Klick
      // die Zeile, an der er geschrieben wurde.
      const [eintrag] = await toteZeilen(page);
      expect(eintrag[3]).toBe('Dokument fehlt');
      await klickeToteZeile(page, 'Beta', Number(eintrag[1]));
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText(/^Beta$/);
      await expect
        .poll(() => schreibmarke(page))
        .toEqual({ nummer: Number(eintrag[1]), text: '[[Neu-Fehlt]]', spalte: 0 });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// Menü-Abgriff über den setMenu-Interceptor (Muster armMenuCapture in
// datenbank-uebersicht.spec.js): Die App setzt Menüs je Fenster.
async function armMenuCapture(app) {
  await hauptSenden(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__menuCaptureArmed) return;
    win.__menuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const collect = (items) => {
        const out = [];
        for (const it of items || []) {
          if (it.label) out.push(it.label);
          if (it.submenu) out.push(...collect(it.submenu.items));
        }
        return out;
      };
      globalThis.__menuLabels = collect(menu ? menu.items : []);
      return orig(menu);
    };
  });
}

test.describe('BS-12: Erweiterung aus, die Liste ist nicht erreichbar (S-118)', () => {
  test('das Ansichtsmenü führt keine Bereichs-Statistik, das Kontextmenü auch nicht', async () => {
    const { areaRoot } = makeDeadArea();
    const { app, page, userData } = await launchApp({
      settings: { language: 'de', extensions: { disabled: ['area-stats'] } },
    });
    try {
      await armMenuCapture(app);
      await bindArea(page, areaRoot);
      // Das Menü wird beim Binden neu gebaut; der Graph steht als Anker da.
      await expect
        .poll(async () => {
          const labels = await hauptLesen(app, () => globalThis.__menuLabels || []);
          return labels.includes('Bereichs-Graph');
        })
        .toBe(true);
      const labels = await hauptLesen(app, () => globalThis.__menuLabels || []);
      expect(labels).not.toContain('Bereichs-Statistik');

      const row = page.locator('.pane-group[data-pane="0"] .area-file-row', { hasText: /^Alpha$/ });
      await expect(row).toBeVisible();
      await row.click({ button: 'right' });
      await expect(page.locator('#context-menu [data-menu-id="area-panel-graph"]')).toBeVisible();
      await expect(page.locator('#context-menu [data-menu-id="area-panel-stats"]')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator(STATS_PAGE)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
