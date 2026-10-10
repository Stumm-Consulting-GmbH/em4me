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
//          Reiter über seinen ungespeicherten Stand (`tab.content`; seit
//          4T-001978, vorher nur ein Statusbar-Hinweis, siehe RB-09) — Weg-Regel
//          in `task-query-actions.js`. Die Ereignis-Aggregation
//          (`events-aggregation.js`) gibt beim offenen dirty Reiter weiter nur
//          einen Hinweis.
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
//          geändertem Puffer. Bis 4T-001978 (Epic 3E-000330) erschien dort der
//          Konflikt-Dialog, und die Platte wurde geschrieben. Seither geht der
//          Handgriff an dieses Fenster und wirkt in seinem Editor: kein Dialog,
//          keine Platte (Entscheidung des Product Owners vom 2026-09-28, E1 des
//          Epics). Der Fall ist umgestellt und nicht gelöscht, weil er genau
//          die Konstellation sichert, deren Verhalten sich geändert hat.
//
// Beleg, dass das Fehlen von `markSelfWriting` trägt (die Unterdrückung
// sitzt pro Dateipfad und nicht pro Fenster, `documents/file-watching.js`; ein
// `markSelfWriting` nähme die Meldung deshalb ALLEN Fenstern weg), ist seit
// 4T-001978 allein RB-02: Das andere Fenster lädt dort still nach, bekommt
// die Meldung also. Bis dahin trug RB-03 diesen Beleg mit.
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
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

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
  await hauptSenden(
    app,
    ({ dialog }, response) => {
      globalThis.__rbDialogCalls = 0;
      dialog.showMessageBox = async () => {
        globalThis.__rbDialogCalls += 1;
        return { response };
      };
    },
    antwort,
  );
}

function dialogCalls(app) {
  return hauptLesen(app, () => globalThis.__rbDialogCalls || 0);
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
  await hauptSenden(
    app,
    ({ BrowserWindow }, f) => {
      const wins = BrowserWindow.getAllWindows();
      wins.sort((a, b) => a.webContents.id - b.webContents.id);
      const win = wins[wins.length - 1];
      if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', [f]);
    },
    datei,
  );
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

// ---------------------------------------------------------------------------
// 4T-001978 (Epic 3E-000330): Der Handgriff am Treffer wirkt dort, wo der
// ungespeicherte Stand der Datei liegt.
//
//   RB-03  (umgestellt, Fall (a) der Messung) Zwei Fenster, Alpha steht auf
//          der Platte und im ungespeicherten Stand des anderen Fensters:
//          Abhaken wirkt dort im Editor samt Erledigt-Datum.
//   RB-07  (Fall (b)) Die Aufgabe steht NUR im ungespeicherten Stand des
//          anderen Fensters: Sie lässt sich aus der Abfrage abhaken.
//   RB-08  (Fall (e)) Zwei Fenster, Verschieben «Auf morgen» am Treffer.
//   RB-09  (Fall (d)) Ein Fenster, die Datei ist ein nicht aktives Dokument
//          mit ungespeicherten Änderungen: Abhaken wirkt in dessen
//          ungespeichertem Stand, ohne Hinweis der Statusleiste.
//
// Zugesichert wird jeweils: kein Konflikt-Dialog (gestubbt und gezählt), die
// Platte unverändert, das Dokument bleibt ungespeichert, und die Trefferliste
// zeigt danach den neuen Stand (AK10). Die Messung vom 2026-10-07 hatte in
// genau diesen Lagen eine Trefferliste belegt, die nach dem Schreiben auf die
// Platte die alte Zeile weiter zeigte, weil der ungespeicherte Stand die
// Platte überdeckt.
//
// Ungespeichert geändert wird über eine zusätzliche Aufgaben-Zeile «Gamma».
// Das ist nicht nur Fall (b), sondern auch die Bedingung, auf die gewartet
// wird: Der Stand eines Editors geht verzögert (300 ms) an den Hauptprozess,
// und erst danach kennt er das Fenster des Stands. Steht Gamma mit vollem Text
// in der Trefferliste des anderen Fensters, ist das geschehen — ohne feste
// Pause (Stabilitätsregel zu geratenen Wartezeiten).
const GAMMA = `- [ ] Gamma ${DUE} 2099-03-03`;

// Im (aktiven) Reiter eines Fensters eine Zeile am Dateiende tippen:
// Quelltext-Ansicht mit eingeschaltetem Bearbeiten (Muster
// regression/4t-0945-b12.spec.js). Die Fixture endet mit einem Umbruch, die
// Zeile entsteht also als eigene letzte Zeile.
async function pufferAendern(seite, text) {
  await seite.locator(SEL.viewBtn('source')).click();
  await seite.locator(SEL.btnEdit).click();
  await expect(seite.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
  await seite.locator(`${SEL.editorContent0} .cm-line`).last().click();
  await seite.keyboard.press('Control+End');
  await seite.keyboard.type(text);
  await expect(seite.locator(SEL.dirtyTab0)).toHaveCount(1);
}

// Treffer-Zeile über ihre Beschreibung (Reihenfolge nicht zugesichert).
function trefferZeile(wurzel, beschreibung) {
  return wurzel.locator('.perspective-query-task').filter({ hasText: beschreibung });
}

// Die Trefferliste kennt den ungespeicherten Stand: Gamma mit vollem Text.
async function warteAufGammaInListe(taskList) {
  await expect(trefferZeile(taskList, 'Gamma')).toHaveAttribute('data-task-text', GAMMA, {
    timeout: 15000,
  });
}

// Lage der Fälle mit zwei Fenstern: Fenster 1 zeigt die Abfrage, Fenster 2
// hält Aufgaben.md mit der ungespeicherten Gamma-Zeile; der Konflikt-Dialog
// ist gestubbt und gezählt.
async function zweiFensterMitPuffer(app, page, aufgaben) {
  const taskList = await warteAufTrefferliste(page);
  const page2 = await zweitesFensterMitDatei(app, page, aufgaben);
  await pufferAendern(page2, GAMMA);
  await warteAufGammaInListe(taskList);
  await stubKonfliktDialog(app, 1);
  return { taskList, page2 };
}

// Hinweise der Statusleiste mitschreiben (der Hinweis verschwindet nach drei
// Sekunden; ein späterer Blick sähe ihn nicht mehr).
async function beobachteHinweise(seite) {
  await seite.evaluate(() => {
    const el = document.getElementById('statusbar-hint');
    window.__rbHinweise = [];
    if (!el) return;
    new MutationObserver(() => {
      const text = (el.textContent || '').trim();
      if (text) window.__rbHinweise.push(text);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

function hinweise(seite) {
  return seite.evaluate(() => window.__rbHinweise || []);
}

test.describe('RB-03: Rueckschreiben bei geaendertem Reiter in einem ANDEREN Fenster', () => {
  test('wirkt im Editor des anderen Fensters, ohne Konflikt-Dialog und ohne Platte', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      const { taskList, page2 } = await zweiFensterMitPuffer(app, page, aufgaben);
      const alpha = trefferStatus(taskList, 'Alpha');
      await expect(alpha).toHaveAttribute('data-status-char', ' ');

      await alpha.click();

      // Die Wirkung steht im Editor des anderen Fensters, samt Erledigt-Datum
      // der Status-Kette, und das Dokument bleibt ungespeichert (AK3, AK6).
      await expect(page2.locator(SEL.editorContent0)).toContainText(/\[x\] Alpha .*✅ \d{4}-/, {
        timeout: 15000,
      });
      await expect(page2.locator(SEL.editorContent0)).toContainText('Gamma');
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(1);
      // Die Trefferliste zeigt den neuen Stand (AK10).
      await expect(alpha).toHaveAttribute('data-status-char', 'x', { timeout: 15000 });
      // Nach der Übergabe schreibt das klickende Fenster nichts mehr; was der
      // Editor zeigt, ist damit der ganze Handgriff (AK4).
      expect(fs.readFileSync(aufgaben, 'utf8')).toBe(aufgabenContent());
      expect(await dialogCalls(app)).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-07: Aufgabe nur im ungespeicherten Stand eines ANDEREN Fensters', () => {
  test('lässt sich aus der Abfrage abhaken, die Platte bleibt ohne sie', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      const { taskList, page2 } = await zweiFensterMitPuffer(app, page, aufgaben);
      await beobachteHinweise(page);
      const gamma = trefferStatus(taskList, 'Gamma');
      await expect(gamma).toHaveAttribute('data-status-char', ' ');

      await gamma.click();

      await expect(page2.locator(SEL.editorContent0)).toContainText('[x] Gamma', {
        timeout: 15000,
      });
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(1);
      await expect(gamma).toHaveAttribute('data-status-char', 'x', { timeout: 15000 });
      // Kein «Zeile nicht mehr gefunden» mehr im klickenden Fenster (AK5).
      expect(await hinweise(page)).toEqual([]);
      expect(fs.readFileSync(aufgaben, 'utf8')).toBe(aufgabenContent());
      expect(await dialogCalls(app)).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-08: Verschieben am Treffer bei geändertem Reiter in einem ANDEREN Fenster', () => {
  test('«Auf morgen» wirkt im Editor des anderen Fensters, ohne Dialog und ohne Platte', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [uebersicht] });
    try {
      const { taskList, page2 } = await zweiFensterMitPuffer(app, page, aufgaben);
      const zeile = trefferZeile(taskList, 'Alpha');

      await zeile.locator('button[data-task-action="postpone"]').click();
      const menue = page.locator('#context-menu .context-menu-item');
      await expect(menue.first()).toBeVisible();
      await menue.first().click();

      // AK11: Termin um einen Tag verschoben, im Editor des anderen Fensters.
      await expect(page2.locator(SEL.editorContent0)).toContainText(`Alpha ${DUE} 2099-01-02`, {
        timeout: 15000,
      });
      await expect(page2.locator(SEL.dirtyTab0)).toHaveCount(1);
      await expect(zeile).toHaveAttribute('data-task-text', `- [ ] Alpha ${DUE} 2099-01-02`, {
        timeout: 15000,
      });
      expect(fs.readFileSync(aufgaben, 'utf8')).toBe(aufgabenContent());
      expect(await dialogCalls(app)).toBe(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('RB-09: Abhaken bei nicht aktivem, geändertem Reiter DESSELBEN Fensters', () => {
  test('wirkt im ungespeicherten Stand des Reiters, ohne Hinweis und ohne Platte', async () => {
    const dir = makeFixtureDir();
    const uebersicht = path.join(dir, 'Uebersicht.md');
    const aufgaben = path.join(dir, 'Aufgaben.md');
    const { app, page, userData } = await launchApp({ args: [aufgaben, uebersicht] });
    try {
      // Aufgaben.md ungespeichert ändern, danach die Abfrage aktiv schalten.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2, { timeout: 15000 });
      await page.locator(SEL.tabs0).filter({ hasText: 'Aufgaben' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Aufgaben');
      await pufferAendern(page, GAMMA);
      await page.locator(SEL.tabs0).filter({ hasText: 'Uebersicht' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Uebersicht');
      const taskList = page.locator(`${SEL.markdownBody0} .perspective-query-tasks`);
      await warteAufGammaInListe(taskList);
      await stubKonfliktDialog(app, 1);
      await beobachteHinweise(page);
      const alpha = trefferStatus(taskList, 'Alpha');
      await expect(alpha).toHaveAttribute('data-status-char', ' ');

      await alpha.click();

      // AK13 und AK10: Die Trefferliste zeigt den Haken aus dem ungespeicherten
      // Stand; die Platte bleibt, wie sie war, und kein Hinweis erscheint.
      await expect(alpha).toHaveAttribute('data-status-char', 'x', { timeout: 15000 });
      expect(fs.readFileSync(aufgaben, 'utf8')).toBe(aufgabenContent());
      expect(await hinweise(page)).toEqual([]);
      expect(await dialogCalls(app)).toBe(0);
      // Nach dem Wechsel zum Dokument steht die geänderte Zeile im Editor, und
      // das Änderungs-Kennzeichen bleibt.
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
      await page.locator(SEL.tabs0).filter({ hasText: 'Aufgaben' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('Aufgaben');
      await expect(page.locator(SEL.editorContent0)).toContainText(/\[x\] Alpha .*✅ \d{4}-/);
      await expect(page.locator(SEL.editorContent0)).toContainText('Gamma');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(1);
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
