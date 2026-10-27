// 4T-002352 (Epic 3E-000184): E2E-Funktions-Suite — Workflows der Stufe 1 an
// der gestarteten Anwendung: Start über die drei Bedienwege und ein Lauf mit
// Eingabe-Dialog und Vorlage (Stories 4S-001102 bis 4S-001105 und 4S-001109).
//
// **Warum es diese Fälle geben muss, obwohl die Unit-Fälle grün sind.** Jeder
// Bedienweg läuft über beide Prozesse: Kopfzeile, Kommando-Palette oder Menü im
// Fenster, Lauf-Steuerung im Fenster, Datei- und Inhalts-Schritte im
// Hauptprozess über den Kanal workflow:step, Menü-Aufbau im Hauptprozess aus
// der Liste des Workflow-Ordners. Die jsdom-Fälle ersetzen jeweils den
// Nachbarn auf der anderen Seite durch eine Attrappe; erst hier läuft die Kette
// am Stück.
//
// **Abgrenzung.** Abbruch mit Hinweis und die Seite «Workflow-Läufe» prüft
// WF-LAEUFE-01 (workflow-laeufe.spec.js), den Aus-Zustand der Erweiterung
// WF-AUS-01 (workflow-aus.spec.js).
//
// **Material.** Jeder Fall legt seinen Bereich selbst an (Muster
// workflow-laeufe.spec.js): ein Workflow-Ordner «Workflows» und ein
// Vorlagen-Ordner «Vorlagen», beide in den Einstellungen des Bereichs
// festgelegt, dazu eine Notiz, an der die Inhalts-Befehle wirken.
//
// **Sprachfrei geprüft**, wo die Anwendung übersetzt: Menü-Einträge über ihren
// Hinweis-Text (der absolute Pfad des Workflows) und ihre Beschriftung (der
// Name des Workflows), Ergebnisse an den Dateien.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

const PANE = '.pane-group[data-pane="0"]';
const PALETTE = '#command-palette-modal';
const PALETTE_FILTER = '#command-palette-filter';
const PALETTE_ITEM = '.command-palette-item';
const HINWEIS = '#statusbar-hint';
const DIALOG = '#name-input-modal';

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Inhalt einer Datei, solange sie fehlt ''. Angelegt wird mit einem einzigen
// Schreib-Aufruf (Flagge wx), der die Datei erst leer anlegt und dann füllt;
// wer gleich nach dem Auftauchen liest, sieht sie unter Umständen noch leer.
// Deshalb wird auf den Inhalt gewartet, nicht auf die Existenz (Befund des
// Epic-Abschluss-Tests vom 2026-10-23).
function inhaltOderLeer(datei) {
  return fs.existsSync(datei) ? fs.readFileSync(datei, 'utf8') : '';
}

function workflowText(name, zeilen, anhang = []) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
    ...anhang,
  ].join('\n');
}

// Ein Bereich mit Workflow- und Vorlagen-Ordner in seinen Einstellungen.
// `workflows` bildet Datei-Namen auf { name, zeilen, anhang } ab.
function baueBereich(workflows) {
  const wurzel = tmpDir('em4me-wf-start-');
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify(
      {
        schemaVersion: 1,
        settings: {
          templates: { folder: 'Vorlagen', rules: [] },
          workflows: { folder: 'Workflows' },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.mkdirSync(path.join(wurzel, 'Vorlagen'));
  fs.mkdirSync(path.join(wurzel, 'Notizen'));
  fs.writeFileSync(
    path.join(wurzel, 'Vorlagen', 'Bericht-Vorlage.md'),
    '# Bericht\n\nAngelegt aus der Vorlage am {{date}}\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(wurzel, 'Notizen', 'Eingang.md'),
    '---\nstatus: neu\n---\n\n# Eingang\n\nStand: OFFEN\n',
    'utf8',
  );
  for (const [datei, w] of Object.entries(workflows)) {
    fs.writeFileSync(
      path.join(wurzel, 'Workflows', datei),
      workflowText(w.name, w.zeilen, w.anhang || []),
      'utf8',
    );
  }
  return wurzel;
}

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

// Die Kommando-Palette öffnen; das Öffnen ist bei sichtbarem Modal ein No-op
// und darf deshalb gepollt werden (Muster runCommandViaPalette in buch.spec.js).
async function oeffnePalette(page) {
  await expect
    .poll(async () => {
      if (await page.locator(PALETTE).isVisible()) return true;
      await page.keyboard.press('Control+k');
      return page.locator(PALETTE).isVisible();
    })
    .toBe(true);
}

async function schliessePalette(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator(PALETTE)).toBeHidden();
}

// Zahl der Treffer der Kommando-Palette für einen Text. Die Palette hält die
// Kommandos fest, die beim Öffnen angemeldet sind (command-palette.js,
// zeigeAuswahlOverlay); ein später angemeldetes erscheint erst beim nächsten
// Öffnen. Deshalb öffnet jeder Aufruf sie frisch und schließt sie wieder
// (Muster paletteTreffer in kanban-notizen.spec.js; Befund des
// Epic-Abschluss-Tests vom 2026-10-23).
async function paletteTreffer(page, text) {
  await oeffnePalette(page);
  await page.locator(PALETTE_FILTER).fill(text);
  const anzahl = await page.locator(PALETTE_ITEM).count();
  await schliessePalette(page);
  return anzahl;
}

// Ein Kommando über die Palette ausführen. Die Kommandos der Workflows kommen
// aus der Liste des Ordners, die nach dem Binden des Bereichs nachgeladen wird;
// deshalb wartet der Fall, bis genau ein Treffer dasteht, und führt ihn dann
// in einer frisch geöffneten Palette aus.
async function fuehreAusPaletteAus(page, text) {
  await expect.poll(() => paletteTreffer(page, text)).toBe(1);
  await oeffnePalette(page);
  await page.locator(PALETTE_FILTER).fill(text);
  await expect(page.locator(PALETTE_ITEM)).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator(PALETTE)).toBeHidden();
}

// Das Menü des Fensters abgreifen: Electron bietet keinen Getter für
// win.setMenu-Menüs, deshalb wird setMenu am Fenster abgefangen und ein Neubau
// über ein doppeltes Panel-Umschalten angestoßen (Muster helpers/menu-zustand.js).
async function fangeMenue(app, page) {
  const fenster = await app.browserWindow(page);
  const fensterId = await hauptLesen(fenster, (w) => w.id);
  await hauptSenden(
    app,
    ({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id);
      if (!win || win.isDestroyed() || win.__wfMenueGefangen) return;
      win.__wfMenueGefangen = true;
      const orig = win.setMenu.bind(win);
      win.setMenu = (menu) => {
        win.__wfMenue = menu;
        return orig(menu);
      };
    },
    fensterId,
  );
  return fensterId;
}

async function stosseMenueAn(app, fensterId) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id);
      if (!win || win.isDestroyed()) return;
      win.webContents.send('menu:togglePanel', 'notes');
      win.webContents.send('menu:togglePanel', 'notes');
    },
    fensterId,
  );
}

// Steht im zuletzt gesetzten Menü der Eintrag eines Workflows? Erkannt an
// Hinweis-Text und Beschriftung: Der Hinweis-Text allein genügt nicht, weil die
// Liste «Datei → Zuletzt geöffnet» denselben Pfad als Hinweis-Text trägt, dort
// mit dem Dateinamen als Beschriftung (menu-recent.js); ein Klick träfe dann das
// Öffnen der Datei statt den Start (Befund des Epic-Abschluss-Tests vom
// 2026-10-23, Muster workflow-aus.spec.js).
async function menueHatEintrag(app, fensterId, toolTip, label) {
  return hauptLesen(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.id);
      const suche = (items) =>
        (items || []).some(
          (it) =>
            (it.toolTip === a.toolTip && it.label === a.label) ||
            (it.submenu ? suche(it.submenu.items) : false),
        );
      return !!(win && win.__wfMenue && suche(win.__wfMenue.items));
    },
    { id: fensterId, toolTip, label },
  );
}

// Den Eintrag anklicken, wie es das Menü bei einem Mausklick tut; erkannt wie
// in menueHatEintrag an Hinweis-Text und Beschriftung.
async function klickeMenueEintrag(app, fensterId, toolTip, label) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.id);
      const finde = (items) => {
        for (const it of items || []) {
          if (it.toolTip === a.toolTip && it.label === a.label) return it;
          const tiefer = it.submenu ? finde(it.submenu.items) : null;
          if (tiefer) return tiefer;
        }
        return null;
      };
      const eintrag = win && win.__wfMenue ? finde(win.__wfMenue.items) : null;
      if (eintrag) eintrag.click();
    },
    { id: fensterId, toolTip, label },
  );
}

const ABLAUF = {
  name: 'Monatsabschluss',
  zeilen: [
    'mkdir "Archiv"',
    'create "Archiv/Bericht.md"',
    'replace "Notizen/Eingang.md" "OFFEN" "ERLEDIGT"',
    'set-property "Notizen/Eingang.md" status "fertig"',
    'append "Notizen/Eingang.md" from-section "Nachtrag"',
    'notify "Abschluss fertig"',
  ],
  anhang: ['## Nachtrag', '', 'Vom Workflow angehängt.', ''],
};

// Die Wirkung von ABLAUF im Bereich: Ordner und Datei angelegt, Notiz geändert.
async function erwarteAblaufErgebnis(wurzel) {
  await expect.poll(() => fs.existsSync(path.join(wurzel, 'Archiv', 'Bericht.md'))).toBe(true);
  const eingang = path.join(wurzel, 'Notizen', 'Eingang.md');
  await expect.poll(() => fs.readFileSync(eingang, 'utf8')).toContain('Vom Workflow angehängt.');
  const text = fs.readFileSync(eingang, 'utf8');
  expect(text).toContain('Stand: ERLEDIGT');
  expect(text).not.toContain('OFFEN');
  expect(text).toMatch(/status: "?fertig"?/);
}

test.describe('WF-START-01: Start über den Knopf der Kopfzeile (4T-002352)', () => {
  test('Datei- und Inhalts-Befehle wirken im Bereich, der Hinweis kommt am Ende', async () => {
    const wurzel = baueBereich({ 'Monatsabschluss.md': ABLAUF });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(
        app,
        page,
        path.join(wurzel, 'Workflows', 'Monatsabschluss.md'),
      );
      await page.locator(SEL.viewBtn('live')).click();

      // Kopfzeile über dem Block: «bereit», mit Knopf «Starten». Gezählt in der
      // Editor-Spalte: Die verborgene gerenderte Hälfte trägt seit dem Nachzug
      // von 4T-002351 ihre eigene Kopfzeile (WF-START-05).
      const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
      await expect(kopf).toHaveCount(1);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      const knopf = kopf.locator('.cm-wf-starten');
      await expect(knopf).toBeEnabled();
      await knopf.click();

      await erwarteAblaufErgebnis(wurzel);
      await expect(page.locator(HINWEIS)).toContainText('Abschluss fertig');
      // Der Lauf-Stand liegt in der Begleitdatei, nicht im Text des Workflows.
      await expect
        .poll(() => fs.existsSync(path.join(wurzel, 'Workflows', 'Monatsabschluss.mdd')))
        .toBe(true);
      expect(fs.readFileSync(path.join(wurzel, 'Workflows', 'Monatsabschluss.md'), 'utf8')).toBe(
        workflowText(ABLAUF.name, ABLAUF.zeilen, ABLAUF.anhang),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002351, Nachzug vom 2026-10-24 auf die Entscheidung des Product Owners vom
// 2026-10-23: Dieselbe Kopfzeile steht über dem Block der gerenderten Ansicht
// und der gerenderten Hälfte der geteilten Ansicht; dort folgt sie dem Tippen
// im Quelltext im Takt der Vorschau, und ihr Knopf startet den Workflow.
test.describe('WF-START-05: Kopfzeile in der gerenderten und der geteilten Ansicht (4T-002351)', () => {
  test('Prüf-Ergebnis folgt dem Quelltext, der Knopf startet', async () => {
    const wurzel = baueBereich({ 'Monatsabschluss.md': ABLAUF });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneDokumentImFenster(
        app,
        page,
        path.join(wurzel, 'Workflows', 'Monatsabschluss.md'),
      );

      // Geteilte Ansicht: Kopfzeile in der gerenderten Hälfte, «bereit».
      await page.locator(SEL.viewBtn('split')).click();
      const kopf = page.locator(`${SEL.markdownBody0} > .cm-wf-kopf`);
      await expect(kopf).toHaveCount(1);
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
      // Eine überzählige Angabe in der ersten Befehls-Zeile macht sie rot, das
      // Entfernen wieder grün; gespeichert wird dabei nicht. Geschrieben wird im
      // Änderungsmodus (Dokumente öffnen schreibgeschützt).
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
      await page.locator(`${SEL.paneSource0} .cm-line`, { hasText: 'mkdir "Archiv"' }).click();
      await page.keyboard.press('End');
      await page.keyboard.type(' x');
      await expect(kopf).toHaveAttribute('data-wf-ok', 'false');
      await expect(kopf.locator('.cm-wf-starten')).toBeDisabled();
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect(kopf).toHaveAttribute('data-wf-ok', 'true');
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);

      // Gerenderte Ansicht: dieselbe Kopfzeile, der Knopf startet.
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(kopf).toHaveCount(1);
      const knopf = kopf.locator('.cm-wf-starten');
      await expect(knopf).toBeEnabled();
      await knopf.click();
      await erwarteAblaufErgebnis(wurzel);
      await expect(page.locator(HINWEIS)).toContainText('Abschluss fertig');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('WF-START-02: Start über die Kommando-Palette, «Neuer Workflow …» (4T-002352)', () => {
  test('der Workflow ist ein Kommando mit seinem Namen; ein neuer kommt dazu', async () => {
    const wurzel = baueBereich({ 'Monatsabschluss.md': ABLAUF });
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await fuehreAusPaletteAus(page, 'Monatsabschluss');
      await erwarteAblaufErgebnis(wurzel);
      await expect(page.locator(HINWEIS)).toContainText('Abschluss fertig');

      // «Neuer Workflow …» über sein Kommando: Name erfragen, Datei im Ordner
      // anlegen und öffnen (Story 4S-001109, AK4).
      await fuehreAusPaletteAus(page, 'Neuer Workflow');
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator('#name-input-field').fill('Zweiter');
      await page.locator('#btn-name-input-ok').click();
      const neu = path.join(wurzel, 'Workflows', 'Zweiter.md');
      await expect.poll(() => inhaltOderLeer(neu)).toMatch(/workflow: true/);
      await expect(page.locator(SEL.activeTab0)).toContainText('Zweiter');
      // Der Ordner meldet die neue Datei; sie steht danach als Kommando bereit.
      await expect.poll(() => paletteTreffer(page, 'Zweiter')).toBe(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('WF-START-03: Start über das Menü «Datei → Workflows» (4T-002352)', () => {
  test('der Eintrag des Workflows startet ihn', async () => {
    const wurzel = baueBereich({ 'Monatsabschluss.md': ABLAUF });
    const ablaufPfad = path.join(wurzel, 'Workflows', 'Monatsabschluss.md');
    const { app, page, userData } = await launchApp();
    try {
      const fensterId = await fangeMenue(app, page);
      await bindeBereich(page, wurzel);
      // Das Menü baut sich aus der Liste des Ordners; es kommt nach dem Binden.
      await expect
        .poll(async () => {
          await stosseMenueAn(app, fensterId);
          return menueHatEintrag(app, fensterId, ablaufPfad, ABLAUF.name);
        })
        .toBe(true);
      await klickeMenueEintrag(app, fensterId, ablaufPfad, ABLAUF.name);
      await erwarteAblaufErgebnis(wurzel);
      await expect(page.locator(HINWEIS)).toContainText('Abschluss fertig');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('WF-START-04: Lauf mit Eingabe-Dialog und Vorlage (4T-002352)', () => {
  const MIT_FRAGE = {
    name: 'Monatsbericht anlegen',
    zeilen: [
      'create "Berichte/{{prompt:Berichtsname?}}.md" from-template "Bericht-Vorlage.md"',
      'notify "Bericht {{prompt:Berichtsname?}} angelegt"',
    ],
  };

  test('die Frage kommt vor dem ersten Schritt, die Datei entsteht aus der Vorlage', async () => {
    const wurzel = baueBereich({ 'Monatsbericht anlegen.md': MIT_FRAGE });
    fs.mkdirSync(path.join(wurzel, 'Berichte'));
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await fuehreAusPaletteAus(page, 'Monatsbericht anlegen');
      // Gleiche Fragen werden einmal gestellt und gelten überall.
      await expect(page.locator(DIALOG)).toBeVisible();
      await expect(page.locator('#name-input-title')).toHaveText('Berichtsname?');
      await page.locator('#name-input-field').fill('Oktober');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator(DIALOG)).toBeHidden();

      const ziel = path.join(wurzel, 'Berichte', 'Oktober.md');
      await expect.poll(() => inhaltOderLeer(ziel)).toContain('Angelegt aus der Vorlage am ');
      const text = fs.readFileSync(ziel, 'utf8');
      expect(text).toMatch(/am \d{4}-\d{2}-\d{2}/);
      expect(text).not.toContain('{{');
      await expect(page.locator(HINWEIS)).toContainText('Bericht Oktober angelegt');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });

  test('Abbruch im Dialog: kein Schritt läuft', async () => {
    const wurzel = baueBereich({ 'Monatsbericht anlegen.md': MIT_FRAGE });
    fs.mkdirSync(path.join(wurzel, 'Berichte'));
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await fuehreAusPaletteAus(page, 'Monatsbericht anlegen');
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator('#btn-name-input-cancel').click();
      await expect(page.locator(DIALOG)).toBeHidden();
      // Der Lauf ist als abgebrochen verbucht, bevor ein Schritt lief.
      await expect
        .poll(() => fs.existsSync(path.join(wurzel, 'Workflows', 'Monatsbericht anlegen.mdd')))
        .toBe(true);
      expect(fs.readdirSync(path.join(wurzel, 'Berichte'))).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
