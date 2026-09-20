// 4T-001504 (Epic 3E-000161): Was der Anwender sieht, wenn eine der beiden
// Rueckschreib-Stellen aus `src/main/ipc/index-views.js` in ein BEOBACHTETES
// Dokument schreibt.
//
// Beide Stellen tragen im Quelltext den ausdruecklichen Vermerk, dass sie
// BEWUSST ohne `markSelfWriting` arbeiten: In anderen Fenstern offene Reiter
// sollen den definierten `file:changed`-Weg gehen (nicht-dirty -> stiller
// Reload, dirty -> Konflikt-Dialog). Die Begruendung ist fuer den Fall
// «anderes Fenster» geschrieben; sie sagt nichts ueber das aufrufende Fenster.
// Genau diese Luecke misst die Datei.
//
// Drei Konstellationen, in der Nummerierung des Vorgangs:
//   RB-01  Konstellation 2 — das Ziel ist im AUFRUFENDEN Fenster geoeffnet.
//          Erreichbar ist der IPC-Weg dort nur als inaktiver, sauberer Reiter:
//          Der aktive Reiter laeuft ueber den Editor-Puffer, der offene dirty
//          Reiter bekommt nur einen Statusbar-Hinweis (Weg-Regel in
//          `task-query-actions.js` und `events-aggregation.js`).
//          NEBENBEFUND aus der Erhebung, hier bewusst NICHT geprueft: Die
//          Trefferliste der Abfrage zieht in dieser Konstellation nicht nach,
//          weil der Puffer-Overlay des offenen Reiters den Index mit dem Stand
//          VOR dem Rueckschreiben ueberlagert und `reloadFile` ihn nicht
//          erneuert. Das ist ein eigener Fehler mit eigener Ursache und liegt
//          als 4T-001633 vor; sein Regressionstest entsteht dort, weil ein
//          Fall, der den heutigen falschen Zustand festhaelt, beim Beheben
//          umgedreht werden muesste.
//   RB-02  Konstellation 3, sauber — Ziel in einem ANDEREN Fenster, nicht
//          geaendert: stiller Reload, kein Dialog.
//   RB-03  Konstellation 3, dirty — Ziel in einem ANDEREN Fenster mit
//          geaendertem Puffer: der Konflikt-Dialog erscheint dort.
//
// RB-03 ist zugleich der Beleg, dass das Fehlen von `markSelfWriting` traegt:
// Die Unterdrueckung sitzt pro Dateipfad und nicht pro Fenster
// (`documents/file-watching.js`), ein `markSelfWriting` naehme die Meldung
// deshalb ALLEN Fenstern weg.
//
// Konstellation 1 (beobachtet, in keinem Fenster geoeffnet) hat keinen
// erzeugenden Pfad und ist deshalb nicht als E2E-Fall darstellbar: Die
// Beobachtung entsteht ausschliesslich beim Oeffnen eines Reiters und endet mit
// seinem Schliessen. Bewacht wird das vom Unit-Fall in
// `test/unit/beobachtungs-anlage.test.js`.
//
// Der Konflikt-Dialog ist ein nativer `dialog.showMessageBox` und per
// Playwright nicht bedienbar; er wird im Main gestubbt und gezaehlt (Muster
// `regression/4t-0945-b12.spec.js`). Fixture-Termine im Jahr 2099
// (Stabilitaetsregel 9).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const DUE = '\u{1F4C5}'; // Kalender-Symbol (faelliger Termin)
const QUERY_FENCE = ['```perspective-query', 'LIST TASKS', '```'].join('\n');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-rb-'));
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

// Konflikt-Dialog im Main stubben: zaehlt die Aufrufe und antwortet fest
// (0 = 'Vom Datentraeger neu laden', 1 = 'Eigene Version behalten').
async function stubKonfliktDialog(app, antwort) {
  await app.evaluate(({ dialog }, response) => {
    globalThis.__rbDialogCalls = 0;
    dialog.showMessageBox = async () => {
      globalThis.__rbDialogCalls += 1;
      return { response };
    };
  }, antwort);
}

function dialogCalls(app) {
  return app.evaluate(() => globalThis.__rbDialogCalls || 0);
}

// Datei in das JUENGSTE Fenster reichen (Weg der Datei-Assoziation).
//
// EINMAL gesendet, und zwar erst nach dem Init-Ende des Fensters. Bis zum
// Epic-Abschluss-Test von 3E-000186 stand hier ein gepolltes Senden mit der
// Begruendung, der Zuhoerer registriere sich erst am Ende der asynchronen
// Renderer-init() und `ipcRenderer.on` puffere nicht. Diese Begruendung traegt
// fuer diesen Kanal NICHT: `api.onOpenExternal` wird synchron beim Modul-Laden
// registriert und sammelt vor dem Init-Ende in `pendingExternalFiles`
// (`app/app-broadcasts.js`) — ein Send an ein noch ladendes Fenster verfaellt
// hier also gerade nicht.
//
// Und das Wiederholen war aktiv schaedlich, weil `file:openExternal` NICHT
// idempotent ist: `openInPane` (`tabs/tabs.js`) prueft `findTabAcrossPanes`
// VOR dem `await api.readFile`, sodass zwei ueberlappende Sendungen beide am
// Bereits-offen-Zweig vorbeikommen und je einen Reiter derselben Datei
// anlegen. Getippt wird dann in den aktiven ZWEITEN Reiter, waehrend
// `reloadFile` per `findIndex` nur den ERSTEN, sauberen Reiter je Pane
// behandelt: stiller Reload statt Konflikt-Dialog, bei unveraenderter
// dirty-Marke. Genau dieses Bild hat RB-03 am 2026-09-15 gezeigt (Datei auf
// der Platte geschrieben, dirty-Reiter vorhanden, Dialog-Zaehler 0).
//
// Gemessen und belegt: Zwei Sendungen im selben Tick NACH dem Init-Ende
// erzeugen reproduzierbar zwei Reiter und keinen Dialog (3 von 3 Laeufen);
// dieselben zwei Sendungen VOR dem Init-Ende erzeugen einen Reiter und den
// Dialog, weil der Sammel-Puffer sie sequentiell abarbeitet. Das Warten auf
// `data-renderer-ready` beseitigt die Ueberlappung an der Wurzel, statt sie
// mit einer Frist zu ueberdecken: Das Attribut steht erst nach `initDone`
// (`app-init.js`), der Send geht danach direkt und genau einmal in
// `openInPane`.
async function oeffneImJuengstenFenster(app, page2, datei) {
  await page2.waitForFunction(() => document.body.dataset.rendererReady === '1', undefined, {
    timeout: 20000,
  });
  await app.evaluate(({ BrowserWindow }, f) => {
    const wins = BrowserWindow.getAllWindows();
    wins.sort((a, b) => a.webContents.id - b.webContents.id);
    const win = wins[wins.length - 1];
    if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', [f]);
  }, datei);
  // Genau ein Reiter — die Zahl ist die Zusicherung, nicht bloss ein Anker:
  // ein zweiter waere der Doppel-Oeffnungs-Fall von oben.
  await expect(page2.locator(SEL.tabs0)).toHaveCount(1, { timeout: 20000 });
}

// Zweites Fenster derselben Applikation, mit der Aufgaben-Datei als Reiter.
async function zweitesFensterMitDatei(app, page, datei) {
  const win2Promise = app.waitForEvent('window');
  await page.evaluate(() => window.api.openNewWindow([], null));
  const page2 = await win2Promise;
  await page2.waitForLoadState('domcontentloaded');
  await oeffneImJuengstenFenster(app, page2, datei);
  return page2;
}

// Anker der Abfrage-Ansicht: die Trefferliste steht mit beiden Tasks.
async function warteAufTrefferliste(page) {
  const taskList = page.locator(`${SEL.markdownBody0} .perspective-query-tasks`);
  const descs = taskList.locator('.perspective-query-task-desc');
  await expect(page.locator(SEL.markdownBody0)).toBeVisible();
  await expect(taskList).toBeVisible({ timeout: 15000 });
  await expect(descs).toHaveCount(2, { timeout: 15000 });
  return taskList;
}

test.describe('RB-01: Rueckschreiben in einen inaktiven sauberen Reiter DESSELBEN Fensters', () => {
  test('schreibt still, ohne Konflikt-Dialog, und der Reiter traegt danach den neuen Stand', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [aufgaben, uebersicht] });
    try {
      // Beide Dateien sind Reiter derselben Spalte; die Abfrage-Ansicht wird
      // aktiv geschaltet, der Aufgaben-Reiter bleibt offen, inaktiv und sauber.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2, { timeout: 15000 });
      await page.locator(SEL.tabs0).filter({ hasText: 'Uebersicht' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Uebersicht');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      const taskList = await warteAufTrefferliste(page);
      // Ein Dialog waere hier der Befund; deshalb wird gezaehlt statt bedient.
      await stubKonfliktDialog(app, 1);

      await taskList.locator('.perspective-query-task-status').nth(0).click();

      // Die eigene Aenderung steht auf der Platte.
      await expect
        .poll(async () => fs.readFileSync(aufgaben, 'utf8'), { timeout: 15000 })
        .toMatch(/- \[x\] Alpha/);
      // Der inaktive Reiter hat die eigene Aenderung uebernommen (stiller
      // Reload ueber file:changed) und ist weiterhin sauber.
      await page.locator(SEL.tabs0).filter({ hasText: 'Aufgaben' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Aufgaben');
      await page.locator(SEL.viewBtn('source')).click();
      await expect(page.locator(SEL.editorContent0)).toContainText('[x] Alpha', { timeout: 15000 });
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // Kein Konflikt-Dialog auf die eigene Aenderung — die Kernfrage des
      // Vorgangs. Gemessen, nachdem der file:changed-Weg durchlaufen ist.
      expect(await dialogCalls(app)).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-02: Rueckschreiben bei sauberem Reiter in einem ANDEREN Fenster', () => {
  test('das andere Fenster laedt still nach, ohne Konflikt-Dialog', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      const taskList = await warteAufTrefferliste(page);
      const page2 = await zweitesFensterMitDatei(app, page, aufgaben);
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(0);
      await stubKonfliktDialog(app, 1);

      await taskList.locator('.perspective-query-task-status').nth(0).click();

      await expect
        .poll(async () => fs.readFileSync(aufgaben, 'utf8'), { timeout: 15000 })
        .toMatch(/- \[x\] Alpha/);
      // Stiller Reload im anderen Fenster: der Reiter bleibt sauber, und es
      // wird nicht gefragt.
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(await dialogCalls(app)).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-03: Rueckschreiben bei geaendertem Reiter in einem ANDEREN Fenster', () => {
  test('das andere Fenster fragt ueber den Konflikt-Dialog', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      const taskList = await warteAufTrefferliste(page);
      const page2 = await zweitesFensterMitDatei(app, page, aufgaben);

      // Im zweiten Fenster den Puffer aendern (Quelltext-Ansicht mit
      // eingeschaltetem Bearbeiten; Muster regression/4t-0945-b12.spec.js).
      await page2.locator(SEL.viewBtn('source')).click();
      await page2.locator(SEL.btnEdit).click();
      await expect(page2.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page2.locator(`${SEL.editorContent0} .cm-line`).last().click();
      await page2.keyboard.press('Control+End');
      await page2.keyboard.type('Eigener Zusatz');
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(1);

      // 'Eigene Version behalten' — der Puffer des Anwenders bleibt stehen.
      await stubKonfliktDialog(app, 1);

      await taskList.locator('.perspective-query-task-status').nth(0).click();

      await expect
        .poll(async () => fs.readFileSync(aufgaben, 'utf8'), { timeout: 15000 })
        .toMatch(/- \[x\] Alpha/);
      // Der definierte Weg der Begruendung: es wird gefragt.
      await expect.poll(async () => dialogCalls(app), { timeout: 15000 }).toBeGreaterThan(0);
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// 4T-001633 (Epic 3E-000296): Puffer-Overlay nach dem Neuladen erneuern.
//
// Der Nebenbefund aus der Erhebung oben, jetzt als eigener Fall-Satz. Gemessen
// wird an derselben Konstellation wie RB-01 — Abfrage-Ansicht im aktiven
// Reiter, Quelldatei als inaktiver sauberer Reiter derselben Spalte —, aber
// mit dem Blick auf die TREFFERLISTE statt auf Reiter und Dialog.
//
//   RB-04  Aenderung VON AUSSEN (Node-fs aus dem Testprozess, am
//          Rueckschreib-Weg der Anwendung vorbei). Das ist zugleich die
//          Reichweiten-Messung zu AK4: Faellt dieser Fall vor der Behebung
//          rot, trifft der Befund jede externe Aenderung und nicht nur den
//          eigenen Weg.
//   RB-05  Dieselbe Lage ueber den EIGENEN Rueckschreib-Weg (Status-Toggle
//          aus der Abfrage, Ablauf von RB-01) — der gemeldete Ablauf.
//   RB-06  Der AKTIVE Reiter (AK2): Er heilt sich beim Neuladen selbst, und
//          sein Puffer-Overlay lebt danach weiter. Die Ruecknahme in
//          `reloadFile` raeumt einen laufenden Melde-Plan synchron ab; stuende
//          sie NACH dem Render, naehme sie dem aktiven Reiter genau den Plan,
//          den er eben gefasst hat.
//
// Warum der Beleg des stillen Neuladens in RB-04 und RB-05 erst NACH dem
// Kriterium steht und dieses deshalb weich geprueft wird (`expect.soft`): Den
// Reiter zu aktivieren montiert seinen Editor, das zaehlt als Doc-Aenderung
// und erneuert den Overlay von selbst — ein frueherer Wechsel wuerde die
// Messung heilen statt sie zu belegen. Weich geprueft entsteht der Beleg auch
// im roten Lauf, und ein ausgebliebenes Neuladen ist von einem stehen
// gebliebenen Overlay unterscheidbar.

// Alpha auf erledigt setzen — der Platten-Stand, den beide Wege erzeugen.
function aufgabenContentAlphaErledigt() {
  return aufgabenContent().replace('- [ ] Alpha', '- [x] Alpha');
}

// Die Konstellation aus RB-01: Abfrage aktiv, Quelldatei inaktiv und sauber.
async function stelleKonstellationHer(page) {
  await expect(page.locator(SEL.tabs0)).toHaveCount(2, { timeout: 15000 });
  await page.locator(SEL.tabs0).filter({ hasText: 'Uebersicht' }).click();
  await expect(page.locator(SEL.activeTab0)).toContainText('Uebersicht');
  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
  return warteAufTrefferliste(page);
}

// Der Treffer wird ueber seine Beschreibung gegriffen und nicht ueber nth():
// Die Reihenfolge der Liste ist nach dem Toggle nicht zugesichert.
function trefferStatus(wurzel, beschreibung) {
  return wurzel
    .locator('.perspective-query-task')
    .filter({ hasText: beschreibung })
    .locator('.perspective-query-task-status');
}

// Beleg der Voraussetzung: Der inaktive Reiter hat still nachgeladen. Steht
// bewusst am Ende des Falls (Begruendung im Kopf dieses Abschnitts).
async function belegeStillesNachladen(page) {
  await page.locator(SEL.tabs0).filter({ hasText: 'Aufgaben' }).click();
  await expect(page.locator(SEL.activeTab0)).toContainText('Aufgaben');
  await page.locator(SEL.viewBtn('source')).click();
  await expect(page.locator(SEL.editorContent0)).toContainText('[x] Alpha', { timeout: 15000 });
  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
}

test.describe('RB-04: Aenderung VON AUSSEN an einem inaktiven sauberen Reiter', () => {
  test('die Trefferliste der Abfrage zeigt danach den neuen Stand', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [aufgaben, uebersicht] });
    try {
      const taskList = await stelleKonstellationHer(page);
      const alpha = trefferStatus(taskList, 'Alpha');
      // Anker: Der Ausgangs-Stand ist sichtbar. Ohne ihn waere ein «nicht
      // wirksam» kein Befund, sondern ein Nicht-Ergebnis.
      await expect(alpha).toHaveAttribute('data-status-char', ' ');

      // Der Eingriff: geschrieben wird aus dem Testprozess, nicht ueber die
      // Anwendung. Fuer sie ist das eine fremde Aenderung wie die eines
      // beliebigen anderen Programms.
      fs.writeFileSync(aufgaben, aufgabenContentAlphaErledigt(), 'utf8');

      await expect.soft(alpha).toHaveAttribute('data-status-char', 'x', { timeout: 15000 });

      await belegeStillesNachladen(page);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-05: Rueckschreiben aus der Abfrage in einen inaktiven sauberen Reiter', () => {
  test('die Trefferliste zeigt den Haken, den der Klick erzeugt hat', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [aufgaben, uebersicht] });
    try {
      const taskList = await stelleKonstellationHer(page);
      const alpha = trefferStatus(taskList, 'Alpha');
      await expect(alpha).toHaveAttribute('data-status-char', ' ');
      // Wie in RB-01: Ein Dialog waere hier der Befund, deshalb gezaehlt.
      await stubKonfliktDialog(app, 1);

      await alpha.click();

      await expect
        .poll(async () => fs.readFileSync(aufgaben, 'utf8'), { timeout: 15000 })
        .toMatch(/- \[x\] Alpha/);
      // Der gemeldete Ablauf: Der Anwender klickt und erwartet den Haken.
      await expect.soft(alpha).toHaveAttribute('data-status-char', 'x', { timeout: 15000 });

      await belegeStillesNachladen(page);
      expect(await dialogCalls(app)).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-06: Aenderung von aussen am AKTIVEN Reiter', () => {
  test('die Abfrage folgt dem neuen Platten-Stand und danach wieder dem Puffer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-rb06-'));
    const datei = path.join(dir, 'Aufgaben.md');
    const start = ['# Aufgaben', '', `- [ ] Alpha ${DUE} 2099-01-01`, '', QUERY_FENCE, ''].join(
      '\n',
    );
    fs.writeFileSync(datei, start, 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      // Geteilte Ansicht mit eingeschaltetem Bearbeiten (Muster
      // regression/4t-0935-b08.spec.js): Editor und Trefferliste nebeneinander.
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('split')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');

      const treffer = page.locator(
        `${SEL.markdownBody0} .perspective-query-tasks .perspective-query-task`,
      );
      await expect(treffer).toHaveCount(1, { timeout: 15000 });
      const alpha = trefferStatus(page.locator(SEL.markdownBody0), 'Alpha');
      await expect(alpha).toHaveAttribute('data-status-char', ' ');

      // Aenderung von aussen am AKTIVEN Reiter: Er laedt neu, rendert neu und
      // plant seinen Overlay mit dem neuen Inhalt.
      fs.writeFileSync(datei, start.replace('- [ ] Alpha', '- [x] Alpha'), 'utf8');
      await expect(page.locator(SEL.editorContent0)).toContainText('[x] Alpha', {
        timeout: 15000,
      });
      await expect(alpha).toHaveAttribute('data-status-char', 'x', { timeout: 15000 });

      // AK2: Der Puffer-Overlay dieses Reiters lebt weiter. Eine
      // ungespeicherte Zeile im Editor erscheint in der Trefferliste — genau
      // die Zusicherung aus 4T-000935, jetzt NACH einem Neuladen gemessen.
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await page.locator(`${SEL.editorContent0} .cm-line`).filter({ hasText: 'Alpha' }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Gamma');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await expect(treffer).toHaveCount(2, { timeout: 15000 });
      await expect(treffer.filter({ hasText: 'Gamma' })).toHaveCount(1, { timeout: 15000 });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
