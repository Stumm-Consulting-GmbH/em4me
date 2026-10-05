// 4T-000364 (Epic 3E-000067): E2E-Suite Block-Eigenschaften-Panel. Deckt das Oeffnen
// ueber das Ansicht-Menue, das Anker-Dropdown, das Anlegen eines Ankers fuer einen
// Block ohne Anker samt Persistenz einer Eigenschaft in die .mdd sowie die
// Verwaisten-Anzeige (Daten ohne Anker im Text) ab. Der Datenpfad selbst ist in
// test/unit/mdd-store.test.js und test/unit/block-anchors.test.js getestet.
// 4T-000365: zusaetzlich der Block-Metadaten-Indikator — Erscheinen im Render-Pane
// (BP-04), Nachziehen ueber den blockData:changed-Broadcast beim Anlegen/Loeschen
// von Eigenschaften (BP-05) und die Live-Modus-Variante samt Klick-Pfad (BP-06).
// 4T-002072: der Name einer Datentabelle als Kopf-Angabe `table:` — Anlegen,
// Eigenschafts-Zeichen und Umbenennen samt Diagramm-Angaben (BP-07); Anker
// anlegen in einem Code-Block und über einer Datentabelle lässt den Zaun
// geschlossen (BP-08, Nachbesserung F1).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { hauptSenden } = require('../helpers/haupt-zugriff');
// 4T-002072: Text des Editors der linken Spalte (Muster block-anker-eigene-zeile.spec.js).
const { text } = require('../helpers/diagramme-dialog');
const { erwarteDateiUnveraendert } = require('../helpers/dateien');

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

const PANE0 = '.pane-group[data-pane="0"]';
const SEC = `${PANE0} .sidebar-blockprops`;
const ANCHOR_SELECT = `${SEC} .block-props-anchor-select`;
const CREATE_BTN = `${SEC} .block-props-create-btn`;
const NO_ANCHOR = `${SEC} .block-props-no-anchor`;
const FIELDS = `${SEC} .block-props-fields`;
const ADD_BTN = `${SEC} .block-props-add-btn`;
const ORPHANS = `${SEC} .block-props-orphans`;
// 4T-000365: Indikator im Render-Pane (Post-Prozessor) und im Live-Modus (Widget).
const RENDER_INDICATOR = `${PANE0} .pane-rendered .markdown-body .block-meta-indicator`;
const LIVE_INDICATOR = `${PANE0} .pane-source .cm-block-meta-indicator`;

function makeWorkFile(prefix, content) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workFile = path.join(workDir, 'arbeit.md');
  fs.writeFileSync(workFile, content, 'utf8');
  return { workDir, workFile };
}

// Profil mit gewaehltem Standard-Ansichtsmodus. 'source' fuer Cursor-Tests (der
// Default 'rendered' verbirgt den Editor, das Panel ist dann read-only), 'split'
// fuer Indikator-Tests mit Editor UND Render-Pane, 'live' fuer das Live-Widget.
function viewModeProfile(mode) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-blockprops-profil-'));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ app: { defaultViewMode: mode } }),
    'utf8',
  );
  return userData;
}

function mddPathOf(mdPath) {
  return mdPath.replace(/\.md$/, '.mdd');
}

function seedBlockData(workFile, blockData) {
  const mdd = { schemaVersion: 1, history: { anchors: [], packets: [] }, blockData };
  fs.writeFileSync(mddPathOf(workFile), JSON.stringify(mdd, null, 2) + '\n', 'utf8');
}

function readBlockData(mdPath) {
  try {
    return JSON.parse(fs.readFileSync(mddPathOf(mdPath), 'utf8')).blockData ?? null;
  } catch {
    return null;
  }
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

function cleanup(workDir) {
  try {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch offen: best effort */
  }
}

test.describe('BP-01: Panel oeffnen, Anker waehlen, Eigenschaft sehen', () => {
  test('Dropdown listet die Anker; Auswahl zeigt die Block-Eigenschaft', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp01-',
      '# Titel\n\nEin Absatz mit Anker. ^abc\n',
    );
    seedBlockData(workFile, {
      abc: { values: { status: 'offen' }, updated: '2026-07-07T00:00:00Z' },
    });
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await expect(page.locator(`${ANCHOR_SELECT} option[value="abc"]`)).toHaveCount(1);
      // Anker im Dropdown waehlen -> aktiver Anker, Felder zeigen die Eigenschaft.
      await page.locator(ANCHOR_SELECT).selectOption('abc');
      await expect(page.locator(`${FIELDS} .properties-field-key`).first()).toHaveValue('status');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-02: Anker anlegen und Eigenschaft speichern', () => {
  test('Create-Button legt einen Anker an; neue Eigenschaft landet in der .mdd', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp02-',
      '# Titel\n\nBlock ohne Anker.\n',
    );
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('source'),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      // Cursor in den ankerlosen Absatz setzen -> "Anker anlegen" erscheint.
      await page.locator(SEL.editorContent0).getByText('Block ohne Anker.').click();
      await expect(page.locator(NO_ANCHOR)).toBeVisible();
      await page.locator(CREATE_BTN).click();
      // Anker angelegt: der Hinweis verschwindet, der Eigenschafts-Bereich erscheint.
      await expect(page.locator(NO_ANCHOR)).toBeHidden();
      await expect(page.locator(ADD_BTN)).toBeVisible();
      // Eigenschaft hinzufuegen und Wert setzen.
      await page.locator(ADD_BTN).click();
      await page.locator(`${FIELDS} .properties-field-value-input`).first().fill('fertig');
      // Debounce-Save schreibt die .mdd (der Anker-Schluessel ist zufaellig).
      await expect
        .poll(() => {
          const bd = readBlockData(workFile);
          const entry = bd ? Object.values(bd)[0] : null;
          return entry ? Object.values(entry.values)[0] : null;
        })
        .toBe('fertig');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-03: Verwaiste Daten anzeigen', () => {
  test('Daten ohne Anker im Text erscheinen im Verwaisten-Abschnitt', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp03-',
      '# Titel\n\nText ohne den passenden Anker.\n',
    );
    seedBlockData(workFile, {
      weg: { values: { notiz: 'x' }, updated: '2026-07-07T00:00:00Z' },
    });
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await expect(page.locator(ORPHANS)).toBeVisible();
      await expect(page.locator(`${ORPHANS} .block-props-orphan-id`)).toHaveText('^weg');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-04: Indikator im Render-Pane (4T-000365)', () => {
  test('Indikator erscheint am Block mit Daten; Hover-Title; Klick oeffnet das Panel', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp04-',
      '# Titel\n\nAbsatz ohne Daten.\n\nAbsatz mit Daten. ^abc\n',
    );
    seedBlockData(workFile, {
      abc: { values: { status: 'offen' }, updated: '2026-07-07T00:00:00Z' },
    });
    // Default-Modus 'rendered': das Render-Pane ist die aktive Ansicht.
    const { app, page, userData } = await launchApp({ args: [workFile] });
    try {
      await waitForTab(page);
      // Genau ein Indikator, am Block des Ankers, mit den Werten im title.
      const indicator = page.locator(RENDER_INDICATOR);
      await expect(indicator).toHaveCount(1);
      await expect(indicator).toHaveAttribute('data-anchor-id', 'abc');
      await expect(indicator).toHaveAttribute('title', 'status: offen');
      // Klick oeffnet das Panel mit dem Anker als Kontext.
      await indicator.click();
      await expect(page.locator(SEC)).toBeVisible();
      await expect(page.locator(ANCHOR_SELECT)).toHaveValue('abc');
      await expect(page.locator(`${FIELDS} .properties-field-key`).first()).toHaveValue('status');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-05: Indikator folgt den Daten (Broadcast, 4T-000365)', () => {
  test('Eigenschaft anlegen laesst den Indikator erscheinen, Loeschen entfernt ihn', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp05-',
      '# Titel\n\nBlock mit Anker ohne Daten. ^blk\n',
    );
    // Split-Modus: Editor (Cursor-Folge) und Render-Pane (Indikator) zugleich.
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('split'),
    });
    try {
      await waitForTab(page);
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(0);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      // Cursor in den Anker-Block -> Panel aktiviert ^blk, Eigenschaft anlegen.
      await page.locator(SEL.editorContent0).getByText('Block mit Anker ohne Daten.').click();
      await expect(page.locator(ADD_BTN)).toBeVisible();
      await page.locator(ADD_BTN).click();
      await page.locator(`${FIELDS} .properties-field-value-input`).first().fill('ja');
      // Debounce-Save -> Broadcast -> Indikator erscheint im Render-Pane.
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(1);
      await expect(page.locator(RENDER_INDICATOR)).toHaveAttribute('data-anchor-id', 'blk');
      // Eigenschaft loeschen -> leerer Anker-Eintrag -> Indikator verschwindet.
      await page.locator(`${FIELDS} .properties-field-delete`).first().click();
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

test.describe('BP-06: Indikator im Live-Modus (4T-000365)', () => {
  test('Live-Widget erscheint an der Anker-Zeile; Klick oeffnet das Panel', async () => {
    const { workDir, workFile } = makeWorkFile(
      'pmpp-blockprops-bp06-',
      '# Titel\n\nAbsatz mit Daten. ^abc\n',
    );
    seedBlockData(workFile, {
      abc: { values: { prio: 'hoch' }, updated: '2026-07-07T00:00:00Z' },
    });
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('live'),
    });
    try {
      await waitForTab(page);
      const indicator = page.locator(LIVE_INDICATOR);
      await expect(indicator).toHaveCount(1);
      await expect(indicator).toHaveAttribute('title', 'prio: hoch');
      await indicator.click();
      await expect(page.locator(SEC)).toBeVisible();
      await expect(page.locator(`${FIELDS} .properties-field-key`).first()).toHaveValue('prio');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

// 4T-002072 (Epic 3E-000192): Der Name einer Datentabelle ist ihre Kopf-Angabe
// `table:`. «Anker anlegen» schreibt sie als erste Zeile in den Block statt
// ` ^id` an die Schluss-Zeile des Zauns; Umbenennen ändert sie und zieht die
// Diagramm-Angaben beider Schreibweisen desselben Dokuments mit.
const DT = '```';
const DT_TABELLE = [
  `${DT}perspective-datatable`,
  'columns: Monat:text, Wert:number',
  '| Januar | 1 |',
  '| Februar | 2 |',
  DT,
];

test.describe('BP-07: Name einer Datentabelle im Panel (4T-002072)', () => {
  test('Anker anlegen schreibt «table: <id>» als erste Zeile, der Zaun schließt weiter; Eigenschaft ergibt das Zeichen im Live-Modus und in der Lese-Ansicht', async () => {
    const inhalt = ['# Titel', '', ...DT_TABELLE, '', 'Schluss.', ''].join('\n');
    const { workDir, workFile } = makeWorkFile('pmpp-blockprops-bp07-', inhalt);
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('source'),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'columns:' }).click();
      await expect(page.locator(NO_ANCHOR)).toBeVisible();
      await page.locator(CREATE_BTN).click();
      await expect(page.locator(NO_ANCHOR)).toBeHidden();
      // Erste Kopf-Zeile mit der Zufalls-Kennung, der Rest des Blocks und des
      // Dokuments byte-gleich: Der Zaun schließt an derselben Zeile wie vorher.
      await expect.poll(async () => (await text(page)).split('\n')[3]).toMatch(/^table: \S+$/);
      const zeilen = (await text(page)).split('\n');
      const id = zeilen[3].slice('table: '.length);
      expect(id).toMatch(/^[a-z0-9]{6}$/);
      expect(zeilen).toEqual([
        '# Titel',
        '',
        DT_TABELLE[0],
        `table: ${id}`,
        ...DT_TABELLE.slice(1),
        '',
        'Schluss.',
        '',
      ]);
      await expect(page.locator(ANCHOR_SELECT)).toHaveValue(id);

      // Eigenschaft setzen: Sie landet unter der Kennung in der Begleitdatei.
      await page.locator(ADD_BTN).click();
      await page.locator(`${FIELDS} .properties-field-value-input`).first().fill('fertig');
      await expect
        .poll(() => {
          const bd = readBlockData(workFile);
          return bd && bd[id] ? Object.values(bd[id].values)[0] : null;
        })
        .toBe('fertig');

      // Das Eigenschaften-Zeichen im Live-Modus und in der Lese-Ansicht.
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(LIVE_INDICATOR)).toHaveCount(1);
      await page.locator(SEL.viewBtn('rendered')).click();
      await expect(page.locator(RENDER_INDICATOR)).toHaveCount(1);
      await expect(page.locator(RENDER_INDICATOR)).toHaveAttribute('data-anchor-id', id);
      // 4T-002026: Die Kopf-Angabe steht im Puffer; das Dokument auf der Platte
      // trägt noch den Ausgangs-Text (die Eigenschaft liegt in der Begleitdatei).
      erwarteDateiUnveraendert(workFile, inhalt);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });

  test('Umbenennen ändert die Kopf-Angabe und zieht «table: alt» und «table: ^alt» der Diagramme mit', async () => {
    const diagramm = (angabe) => [
      `${DT}perspective-chart`,
      `table: ${angabe}`,
      'type: bar',
      'labels: Monat',
      'values: Wert',
      DT,
    ];
    const inhalt = [
      '# Titel',
      '',
      DT_TABELLE[0],
      'table: alt',
      ...DT_TABELLE.slice(1),
      '',
      ...diagramm('alt'),
      '',
      ...diagramm('^alt'),
      '',
    ].join('\n');
    const { workDir, workFile } = makeWorkFile('pmpp-blockprops-bp07b-', inhalt);
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('source'),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'columns:' }).click();
      await expect(page.locator(ANCHOR_SELECT)).toHaveValue('alt');
      await page.locator(`${SEC} .block-props-rename-btn`).click();
      const eingabe = page.locator(`${SEC} .block-props-rename-input`);
      await expect(eingabe).toBeFocused();
      await eingabe.fill('neu');
      await eingabe.press('Enter');
      await expect
        .poll(() => text(page))
        .toBe(
          inhalt
            .replace('table: alt\n', 'table: neu\n')
            .replace('table: alt\n', 'table: neu\n')
            .replace('table: ^alt\n', 'table: ^neu\n'),
        );
      // Die Kennungs-Liste des Panels kennt den neuen Namen, der alte ist weg.
      // Welcher Eintrag gewählt ist, prüft der Fall bewusst nicht: Die
      // Ganz-Dokument-Ersetzung des Umbenennens setzt die Schreibmarke an den
      // Dokument-Anfang, und das Panel folgt ihr — gemessen am 2026-10-03 ebenso
      // bei einem Anker an einem gewöhnlichen Absatz (Bestand, nicht 4T-002072).
      await expect(page.locator(`${ANCHOR_SELECT} option[value="neu"]`)).toHaveCount(1);
      await expect(page.locator(`${ANCHOR_SELECT} option[value="alt"]`)).toHaveCount(0);
      // 4T-002026: Umbenannt im Puffer, nicht auf der Platte.
      erwarteDateiUnveraendert(workFile, inhalt);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});

// 4T-002072, Nachbesserung F1: «Anker anlegen» hängte die Kennung an die
// letzte nicht leere Zeile des Absatzes um die Schreibmarke — in einem
// Code-Block und in einem Absatz direkt über einer Datentabelle war das die
// Schluss-Zeile des Zauns, und der Block schloss danach nicht mehr.
test.describe('BP-08: Anker anlegen lässt Code-Blöcke geschlossen (4T-002072)', () => {
  test('im Code-Block eine eigene Zeile unter dem Block; im Absatz direkt über einer Datentabelle an seiner Zeile, die Tabelle bleibt unversehrt', async () => {
    const inhalt = [
      '# Titel',
      '',
      `${DT}js`,
      'let a = 1;',
      DT,
      '',
      'Absatz über der Tabelle.',
      ...DT_TABELLE,
      '',
      'Schluss.',
      '',
    ];
    const { workDir, workFile } = makeWorkFile('pmpp-blockprops-bp08-', inhalt.join('\n'));
    const { app, page, userData } = await launchApp({
      args: [workFile],
      userData: viewModeProfile('source'),
    });
    try {
      await waitForTab(page);
      await sendMenuChannel(app, 'menu:toggleBlockProps');

      // Schreibmarke im Code-Block: die Kennung in einer eigenen Zeile darunter.
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'let a = 1;' }).click();
      await expect(page.locator(NO_ANCHOR)).toBeVisible();
      await page.locator(CREATE_BTN).click();
      await expect(page.locator(NO_ANCHOR)).toBeHidden();
      await expect.poll(async () => (await text(page)).split('\n')[5]).toMatch(/^\^\S+$/);
      const code = (await text(page)).split('\n')[5].slice(1);
      expect((await text(page)).split('\n')).toEqual([
        ...inhalt.slice(0, 5),
        `^${code}`,
        ...inhalt.slice(5),
      ]);
      await expect(page.locator(ANCHOR_SELECT)).toHaveValue(code);

      // Absatz direkt über der Datentabelle: die Kennung an seiner Zeile.
      await page
        .locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Absatz über der Tabelle.' })
        .click();
      await expect(page.locator(NO_ANCHOR)).toBeVisible();
      await page.locator(CREATE_BTN).click();
      await expect(page.locator(NO_ANCHOR)).toBeHidden();
      await expect
        .poll(async () => (await text(page)).split('\n')[7])
        .toMatch(/^Absatz über der Tabelle\. \^\S+$/);
      const absatz = (await text(page)).split('\n')[7].split('^')[1];
      expect((await text(page)).split('\n')).toEqual([
        ...inhalt.slice(0, 5),
        `^${code}`,
        inhalt[5],
        `Absatz über der Tabelle. ^${absatz}`,
        ...inhalt.slice(7),
      ]);

      // Gerendert: der Code-Block trägt seine Kennung, die Tabelle bleibt Tabelle.
      await page.locator(SEL.viewBtn('rendered')).click();
      const lese = `${PANE0} .pane-rendered .markdown-body`;
      await expect(page.locator(`${lese} pre[id="${code}"]`)).toHaveCount(1);
      await expect(page.locator(`${lese} p[id="${absatz}"]`)).toHaveCount(1);
      await expect(page.locator(`${lese} .perspective-datatable .pdt-grid`)).toHaveCount(1);
      // 4T-002026: Beide Kennungen stehen im Puffer, nicht auf der Platte.
      erwarteDateiUnveraendert(workFile, inhalt.join('\n'));
    } finally {
      await closeApp(app, userData, { force: true });
      cleanup(workDir);
    }
  });
});
