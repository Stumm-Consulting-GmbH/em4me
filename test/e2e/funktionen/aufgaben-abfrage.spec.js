// 4T-000502 (Epic 3E-000096): E2E-Funktions-Suite Aufgaben-Abfrage (TASKS-Scope der
// Perspective-Abfrage). TQ-01 prueft den Treffer-Aufbau der Task-Liste aus den
// indexierten Checkbox-Zeilen im Reading-Modus (.perspective-query-tasks mit
// den Task-Beschreibungen); TQ-02 die Live-Aktualisierung: eine auf der Platte
// ergaenzte Task-Zeile erscheint ohne App-Neustart (Index-Watcher ->
// backlinks:invalidated -> refreshVisibleFrontmatterQueries). Fixture-Daten mit
// 2099er-Terminen (Stabilitaetsregel 9).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const DUE = '\u{1F4C5}'; // Kalender-Symbol (faelliger Termin)
const QUERY_FENCE = ['```perspective-query', 'LIST TASKS', '```'].join('\n');

// Datei mit Task-Zeilen (Checkbox-Zeilen mit faelligem Termin am Zeilenende).
function aufgabenContent() {
  return [
    '# Aufgaben',
    '',
    `- [ ] Alpha ${DUE} 2099-01-01`,
    `- [ ] Beta ${DUE} 2099-02-02`,
    '',
  ].join('\n');
}

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-taskquery-'));
  fs.writeFileSync(path.join(dir, 'Uebersicht.md'), `# Uebersicht\n\n${QUERY_FENCE}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'Aufgaben.md'), aufgabenContent(), 'utf8');
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

test.describe('TQ-01: Aufgaben-Abfrage — Task-Liste aus indexierten Checkbox-Zeilen', () => {
  test('LIST TASKS zeigt die Task-Beschreibungen im Reading-Modus', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const taskList = page.locator(`${SEL.markdownBody0} .perspective-query-tasks`);
    const descs = taskList.locator('.perspective-query-task-desc');
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Die Task-Liste baut asynchron auf (Index-Aufbau). Beide Task-Zeilen
      // erscheinen als klickbare Beschreibungen in Dokument-Reihenfolge.
      await expect(taskList).toBeVisible({ timeout: 15000 });
      await expect(descs).toHaveCount(2, { timeout: 15000 });
      await expect(descs.nth(0)).toHaveText('Alpha');
      await expect(descs.nth(1)).toHaveText('Beta');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TQ-02: Aufgaben-Abfrage — Live-Aktualisierung bei neuer Task-Zeile', () => {
  test('eine auf der Platte ergaenzte Task-Zeile erscheint ohne Neustart', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const descs = page.locator(
      `${SEL.markdownBody0} .perspective-query-tasks .perspective-query-task-desc`,
    );
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await expect(descs).toHaveCount(2, { timeout: 15000 });

      // Neue Task-Zeile anhaengen: der Index-Watcher meldet die Aenderung, die
      // sichtbare Trefferliste befuellt sich neu (kein App-Neustart).
      fs.appendFileSync(aufgaben, `- [ ] Gamma ${DUE} 2099-03-03\n`, 'utf8');
      await expect.poll(async () => descs.count(), { timeout: 15000 }).toBe(3);
      await expect(descs.nth(2)).toHaveText('Gamma');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000503 (Epic 3E-000096): TQ-03 prueft die Gruppierung (GROUP BY heading): eine
// Datei mit Task-Zeilen unter zwei Ueberschriften rendert zwei Gruppen-Titel
// (die Ueberschrifts-Texte) mit den zugehoerigen Tasks darunter.
const GROUP_FENCE = ['```perspective-query', 'LIST TASKS GROUP BY heading', '```'].join('\n');

// Datei mit Task-Zeilen unter zwei Ueberschriften (Planung, Umsetzung).
function gruppenContent() {
  return [
    '# Aufgaben',
    '',
    '## Planung',
    '',
    `- [ ] Konzept ${DUE} 2099-01-01`,
    '',
    '## Umsetzung',
    '',
    `- [ ] Modul ${DUE} 2099-02-02`,
    '',
  ].join('\n');
}

function makeGroupFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-taskgroup-'));
  fs.writeFileSync(path.join(dir, 'Uebersicht.md'), `# Uebersicht\n\n${GROUP_FENCE}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'Aufgaben.md'), gruppenContent(), 'utf8');
  return dir;
}

test.describe('TQ-03: Aufgaben-Abfrage — GROUP BY heading gruppiert nach Ueberschrift', () => {
  test('LIST TASKS GROUP BY heading zeigt zwei Gruppen-Titel mit ihren Tasks', async () => {
    const dir = makeGroupFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const titles = page.locator(`${SEL.markdownBody0} .perspective-query-group-title`);
    const descs = page.locator(`${SEL.markdownBody0} .perspective-query-task-desc`);
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Zwei Gruppen (Planung, Umsetzung) bauen asynchron auf; die Titel tragen
      // die Ueberschrifts-Texte, darunter je eine Task-Beschreibung.
      await expect(titles).toHaveCount(2, { timeout: 15000 });
      await expect(titles.nth(0)).toHaveText('Planung');
      await expect(titles.nth(1)).toHaveText('Umsetzung');
      await expect(descs).toHaveCount(2, { timeout: 15000 });
      await expect(descs.nth(0)).toHaveText('Konzept');
      await expect(descs.nth(1)).toHaveText('Modul');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000504 (Epic 3E-000096): TQ-04 prueft den Status-Toggle direkt aus der
// Abfrage-Ansicht in eine NICHT geoeffnete Quelldatei. Ein Klick auf die
// Status-Box des Alpha-Treffers schreibt zeilen-genau ueber den Main auf die
// Platte ('- [x] Alpha ...'; das Automatik-Erledigt-Datum ist per Default an,
// deshalb toleranter Regex-Poll) und die Trefferliste zieht ueber den
// Index-Watcher nach (Status-Box zeigt danach den Haken).
test.describe('TQ-04: Aufgaben-Abfrage — Status-Toggle in nicht geoeffnete Datei', () => {
  test('Klick auf die Status-Box erledigt die Task auf der Platte und aktualisiert die Liste', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const taskList = page.locator(`${SEL.markdownBody0} .perspective-query-tasks`);
    const descs = taskList.locator('.perspective-query-task-desc');
    const statusBoxes = taskList.locator('.perspective-query-task-status');
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await expect(taskList).toBeVisible({ timeout: 15000 });
      await expect(descs).toHaveCount(2, { timeout: 15000 });
      await expect(descs.nth(0)).toHaveText('Alpha');

      // Status-Box des Alpha-Treffers klicken (Aufgaben.md ist nicht geoeffnet,
      // der Toggle laeuft ueber den Main-Schreibweg auf die Platte).
      await statusBoxes.nth(0).click();

      // Die Quelldatei traegt Alpha als erledigt (das Automatik-Datum haengt an).
      await expect
        .poll(async () => fs.readFileSync(aufgaben, 'utf8'), { timeout: 15000 })
        .toMatch(/- \[x\] Alpha/);

      // Die Trefferliste zieht nach: genau eine Status-Box zeigt den Haken
      // (die Liste baut ueber den Index-Watcher neu auf). 4T-000505: der
      // erledigte Treffer sortiert per Default-Sortierung ans Listen-Ende,
      // deshalb kein Positions-Bezug.
      await expect(
        taskList.locator('.perspective-query-task-status', { hasText: '✓' }),
      ).toHaveCount(1, { timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000504 (Epic 3E-000096): TQ-05 prueft das Termin-Verschieben aus der Abfrage.
// Der Verschiebe-Knopf des Beta-Treffers (faellig 2099-02-02) oeffnet ein
// Kontextmenue; der erste Eintrag ('Auf morgen') verschiebt den Zukunftstermin
// um einen Tag auf 2099-02-03 (Basis-Regel: Zukunftstermin + 1 Tag,
// Stabilitaetsregel 9) und schreibt die Zeile in die nicht geoeffnete Datei.
test.describe('TQ-05: Aufgaben-Abfrage — Termin verschieben in nicht geoeffnete Datei', () => {
  test('Verschieben auf morgen schreibt den um einen Tag erhoehten Termin', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const taskList = page.locator(`${SEL.markdownBody0} .perspective-query-tasks`);
    const descs = taskList.locator('.perspective-query-task-desc');
    const tasks = taskList.locator('li.perspective-query-task');
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await expect(taskList).toBeVisible({ timeout: 15000 });
      await expect(descs).toHaveCount(2, { timeout: 15000 });
      await expect(descs.nth(1)).toHaveText('Beta');

      // Verschiebe-Knopf des Beta-Treffers klicken -> Kontextmenue oeffnet.
      await tasks.nth(1).locator('button[data-task-action="postpone"]').click();
      // Ersten Menue-Eintrag ('Auf morgen', de-Locale) klicken.
      await page.locator('#context-menu .context-menu-item').first().click();

      // Der Zukunftstermin 2099-02-02 wandert um einen Tag auf 2099-02-03.
      await expect
        .poll(async () => fs.readFileSync(aufgaben, 'utf8'), { timeout: 15000 })
        .toContain('2099-02-03');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000506 (Epic 3E-000096): TQ-06/TQ-07 pruefen den Task-Bearbeitungs-Dialog
// per Kuerzel (Strg+Alt+A) direkt im Quelltext-Editor. TQ-06 bearbeitet eine
// bestehende Task-Zeile (Beschreibung umbenennen, faelliger Termin bleibt
// erhalten); TQ-07 legt auf einer leeren Zeile eine neue Task an. Der Dialog
// ersetzt bzw. schreibt die Zeile in EINER Editor-Transaktion. Matrix-ID
// S-082.
const TASK_DIALOG = '#task-dialog-modal';

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Quell-Ansicht und Edit-Modus (Muster datums-picker.spec.js: enterEditSource).
async function enterEditSource(app, page) {
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
}

// Kuerzel gedrueckt halten, bis der Dialog sichtbar ist (Poll-Muster wie
// openPickerByKey der Datums-Picker-Suite; der globale Dispatcher reagiert
// erst nach dem Renderer-init).
async function openDialogByKey(page) {
  await expect
    .poll(async () => {
      if (await page.locator(TASK_DIALOG).isVisible()) return true;
      await page.keyboard.press('Control+Alt+a');
      return page.locator(TASK_DIALOG).isVisible();
    })
    .toBe(true);
}

function makeTaskDialogFixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-taskdialog-'));
  fs.writeFileSync(path.join(dir, 'Aufgaben.md'), lines.join('\n'), 'utf8');
  return dir;
}

test.describe('TQ-06: Task-Dialog per Kuerzel — bestehende Task-Zeile bearbeiten', () => {
  test('Strg+Alt+A auf der Task-Zeile benennt die Beschreibung um, der Termin bleibt', async () => {
    const dir = makeTaskDialogFixture(['# Aufgaben', '', `- [ ] Alpha ${DUE} 2099-01-01`, '']);
    const datei = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);

      // Cursor in die Task-Zeile setzen (Klick auf die Zeile).
      await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: 'Alpha' }).click();
      await openDialogByKey(page);
      await expect(page.locator(TASK_DIALOG)).toBeVisible();

      // Beschreibung umbenennen und bestaetigen.
      await page.locator('#task-dialog-description').fill('Alpha umbenannt');
      await page.locator('#btn-task-dialog-ok').click();
      await expect(page.locator(TASK_DIALOG)).toBeHidden();

      // Der Editor traegt die umbenannte Zeile, der faellige Termin bleibt erhalten.
      await expect(page.locator(SEL.editorContent0)).toContainText('Alpha umbenannt');
      await expect(page.locator(SEL.editorContent0)).toContainText('2099-01-01');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('TQ-07: Task-Dialog per Kuerzel — neue Task auf leerer Zeile anlegen', () => {
  test('Strg+Alt+A auf einer leeren Zeile legt eine neue Task an', async () => {
    // Datei endet mit einer Leerzeile (letzte Zeile leer -> Anlage-Modus).
    const dir = makeTaskDialogFixture(['# Aufgaben', '', `- [ ] Alpha ${DUE} 2099-01-01`, '', '']);
    const datei = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);

      // Cursor an das Dokument-Ende (die leere letzte Zeile).
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');
      await openDialogByKey(page);
      await expect(page.locator(TASK_DIALOG)).toBeVisible();

      await page.locator('#task-dialog-description').fill('Ganz neu');
      await page.locator('#btn-task-dialog-ok').click();
      await expect(page.locator(TASK_DIALOG)).toBeHidden();

      // Auf der zuvor leeren Zeile steht nun eine neue offene Task.
      await expect(page.locator(SEL.editorContent0)).toContainText('- [ ] Ganz neu');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000507 (Epic 3E-000096): TQ-08 prueft die dritte Autocomplete-Quelle auf
// Task-Zeilen (taskMarkerCompletionSource). Im Quelltext-Editor wird hinter
// der Beschreibung ' prio' getippt; das Autocomplete-Popup erscheint und der
// Prioritaets-Eintrag ('Priorität: Höchste', de-Locale) wird uebernommen.
// Die Anwendung laeuft ueber den Marker-Kern in EINER Transaktion: das
// getippte Wort 'prio' wird durch das Prioritaets-Marker-Symbol ersetzt.
const PRIO_HIGHEST = '\u{1F53A}'; // rotes Dreieck nach oben (Prioritaet: Höchste)

test.describe('TQ-08: Task-Zeilen-Autocomplete — Prioritaets-Marker uebernehmen', () => {
  test("' prio' oeffnet das Popup und der Prioritaets-Eintrag ersetzt das Wort durch das Marker-Symbol", async () => {
    const dir = makeTaskDialogFixture(['# Aufgaben', '', '- [ ] Alpha', '']);
    const datei = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [datei] });
    const editor = page.locator(SEL.editorContent0);
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await enterEditSource(app, page);

      // Cursor ans Ende der Task-Zeile (Klick auf die Zeile, dann End).
      await editor.locator('.cm-line', { hasText: 'Alpha' }).click();
      await page.keyboard.press('End');

      // ' prio' tippen: das Popup triggert ab dem zweiten Wort-Zeichen
      // (Default-Mindestlaenge 2); 'prio' filtert auf die Prioritaets-Eintraege.
      await page.keyboard.type(' prio');
      await expect(page.locator('.cm-tooltip-autocomplete').first()).toBeVisible({
        timeout: 10000,
      });

      // Prioritaets-Eintrag 'Höchste' waehlen (de-Locale-Label 'Priorität: Höchste').
      await page.locator('.cm-tooltip-autocomplete li', { hasText: 'Höchste' }).first().click();

      // Die Zeile traegt nun das Prioritaets-Marker-Symbol und nicht mehr das
      // getippte Wort 'prio'.
      const alphaLine = editor.locator('.cm-line', { hasText: 'Alpha' });
      await expect(alphaLine).toContainText(PRIO_HIGHEST);
      await expect(alphaLine).not.toContainText('prio');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// 4T-000508 (Epic 3E-000096): TQ-09 prueft den Blockiert-Filter (WHERE blocked =
// true) datei-uebergreifend. Zwei Dateien: ein Blocker (offene Task mit ID)
// und eine Abhaengige (offene Task mit ⛔-Vorgaenger-Bezug auf die ID). Der
// Filter zeigt genau die Abhaengige (mit ⛔-Badge). Wird der Blocker auf der
// Platte erledigt, ist die Abhaengige nicht mehr blockiert und die Trefferliste
// leert sich (query.empty-Status erscheint). 2099er-Termine entfallen hier, die
// Blockierung haengt nur an Status-Typ und ID/Vorgaenger.
const ID_MARK = '\u{1F194}'; // ID-Zeichen (🆔)
const DEP_MARK = '⛔'; // Zufahrt-verboten (⛔)
// Boolesche Task-Felder werden gegen den String "true" verglichen (die
// Query-Sprache hat keine nackten Bool-Literale; 'true'/'false' werden
// koerziert). Ein nacktes `blocked = true` liest 'true' als Feldnamen.
const BLOCKED_FENCE = ['```perspective-query', 'LIST TASKS WHERE blocked = "true"', '```'].join(
  '\n',
);

function makeBlockedFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-taskblocked-'));
  fs.writeFileSync(path.join(dir, 'Uebersicht.md'), `# Uebersicht\n\n${BLOCKED_FENCE}\n`, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'Blocker.md'),
    ['# Blocker', '', `- [ ] Fundament ${ID_MARK} fund01`, ''].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'Abhaengig.md'),
    ['# Abhaengig', '', `- [ ] Dach ${DEP_MARK} fund01`, ''].join('\n'),
    'utf8',
  );
  return dir;
}

test.describe('TQ-09: Aufgaben-Abfrage — Blockiert-Filter (WHERE blocked = "true")', () => {
  test('zeigt nur die blockierte Task; nach Erledigen des Blockers leert sich die Liste', async () => {
    const dir = makeBlockedFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const blocker = path.join(dir, 'Blocker.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    const taskList = page.locator(`${SEL.markdownBody0} .perspective-query-tasks`);
    const descs = taskList.locator('.perspective-query-task-desc');
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();

      // Der Filter trifft genau die abhaengige Task 'Dach' (offener Vorgaenger).
      await expect(taskList).toBeVisible({ timeout: 15000 });
      await expect(descs).toHaveCount(1, { timeout: 15000 });
      await expect(descs.nth(0)).toHaveText('Dach');
      // Der Treffer traegt das Blockiert-Badge.
      await expect(taskList.locator('.task-marker-blocked')).toHaveCount(1);

      // Blocker auf der Platte erledigen: die Abhaengige ist nicht mehr blockiert.
      fs.writeFileSync(
        blocker,
        ['# Blocker', '', `- [x] Fundament ${ID_MARK} fund01`, ''].join('\n'),
        'utf8',
      );

      // Die Trefferliste leert sich (Index-Watcher -> Neubefuellung); der
      // Leer-Hinweis (query.empty) erscheint statt der Task-Liste.
      await expect.poll(async () => descs.count(), { timeout: 15000 }).toBe(0);
      await expect(page.locator(`${SEL.markdownBody0} .perspective-query-status`)).toBeVisible({
        timeout: 15000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
