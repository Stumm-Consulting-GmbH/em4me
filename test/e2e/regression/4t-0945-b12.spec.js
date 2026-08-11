// B-12 / Baustein B (4T-0945, Story S-0786): Das Speichern prueft den
// Datei-Stand und ueberschreibt keine fremde Aenderung mehr still.
//
// Gemeldeter Ablauf (Messung am 2026-08-10 auf einer Netz-Freigabe): Datei
// oeffnen, von aussen aendern, im Editor auf dem alten Stand weiterschreiben
// und speichern. Ergebnis vor dem Fix: kein Hinweis, und die fremde Zeile war
// weg.
//
// Warum die Beobachtung hier stumm geschaltet wird: Auf einer Freigabe meldet
// sie nichts, im lokalen Temp-Verzeichnis dagegen sofort — dort haette der
// bestehende Reload-Weg den Konflikt-Dialog gebracht und der Fall waere auch
// ohne Fix gruen gewesen, also ohne etwas zu messen. Der Test unterdrueckt
// deshalb genau eine Sache, die Meldung 'file:changed' an das Fenster, und
// stellt damit die Lage der Meldung her statt eines bequemeren Ersatz-Falls.
//
// Geprueft wird in der Quelltext-Ansicht mit eingeschaltetem Bearbeiten, weil
// der gemeldete Ablauf dort stattfand (Stabilitaetsregel 16).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const AUSGANG = '# Notiz\n\nErste Zeile\n';
const FREMDE_ZEILE = 'Fremde Zeile eines anderen Beteiligten';

function makeDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Konflikt-Dialog im Main stubben: zaehlt die Aufrufe und antwortet fest
// (0 = 'Vom Datentraeger neu laden', 1 = 'Eigene Version behalten'). Der native
// Dialog ist per Playwright nicht bedienbar; Muster stubCancelDialog aus
// entwurfs-zwischenspeicher.spec.js.
async function stubKonfliktDialog(app, antwort) {
  await app.evaluate(({ dialog }, response) => {
    globalThis.__konfliktDialogCalls = 0;
    dialog.showMessageBox = async () => {
      globalThis.__konfliktDialogCalls += 1;
      return { response };
    };
  }, antwort);
}

function konfliktDialogCalls(app) {
  return app.evaluate(() => globalThis.__konfliktDialogCalls || 0);
}

// Menue-Weg ueber den IPC-Kanal (der native Menue-Klick ist nicht bedienbar);
// Muster aus funktionen/dokument-historie.spec.js.
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Stellt die Lage einer Netz-Freigabe her: Die Datei-Beobachtung meldet nichts.
async function stummeBeobachtung(app) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const senden = win.webContents.send.bind(win.webContents);
      win.webContents.send = (kanal, ...rest) => {
        if (kanal === 'file:changed') return;
        return senden(kanal, ...rest);
      };
    }
  });
}

async function oeffneZumBearbeiten(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await page.locator(SEL.viewBtn('source')).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
}

// Cursor ans Ende des Dokuments und Text anfuegen.
async function tippeAmEnde(page, text) {
  await page.locator(`${SEL.editorContent0} .cm-line`).last().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
}

test.describe('KS: Konflikt-Schutz beim Speichern (4T-0945)', () => {
  test('KS-01 gemeldeter Ablauf: Speichern auf veraltetem Stand fragt, statt zu ueberschreiben', async () => {
    const dir = makeDir('scg-md-ks01-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      // Anker: der Editor zeigt den Ausgangs-Stand, der Reiter ist sauber.
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      await stubKonfliktDialog(app, 0); // 'Vom Datentraeger neu laden'
      await stummeBeobachtung(app);

      // Fremde Aenderung, von der die Anwendung nichts erfaehrt.
      fs.writeFileSync(datei, `${AUSGANG}${FREMDE_ZEILE}\n`, 'utf8');

      // Auf dem veralteten Stand weiterschreiben und speichern.
      await tippeAmEnde(page, 'Eigene Ergaenzung');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await page.keyboard.press('Control+s');

      // Der Konflikt wird erkannt und gefragt.
      await expect.poll(() => konfliktDialogCalls(app), { timeout: 10000 }).toBe(1);

      // Und die fremde Zeile steht weiterhin in der Datei: nichts ueberschrieben.
      const aufPlatte = fs.readFileSync(datei, 'utf8');
      expect(aufPlatte).toContain(FREMDE_ZEILE);
      expect(aufPlatte).not.toContain('Eigene Ergaenzung');

      // Nach 'neu laden' zeigt der Reiter den fremden Stand.
      await expect(page.locator(SEL.editorContent0)).toContainText(FREMDE_ZEILE, {
        timeout: 10000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('KS-02 eigene Fassung behalten: die ueberschriebene fremde Fassung bleibt abrufbar', async () => {
    const dir = makeDir('scg-md-ks02-');
    const datei = path.join(dir, 'Notiz.md');
    const mdd = path.join(dir, 'Notiz.mdd');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    // Die Dokument-Historie ist ab Werk aus; genau dieser Zustand wird geprueft.
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      // Anker: ohne Konflikt gibt es keine Historien-Datei.
      expect(fs.existsSync(mdd)).toBe(false);

      await stubKonfliktDialog(app, 1); // 'Eigene Version behalten'
      await stummeBeobachtung(app);
      fs.writeFileSync(datei, `${AUSGANG}${FREMDE_ZEILE}\n`, 'utf8');

      await tippeAmEnde(page, 'Eigene Ergaenzung');
      await page.keyboard.press('Control+s');
      await expect.poll(() => konfliktDialogCalls(app), { timeout: 10000 }).toBe(1);

      // Die eigene Fassung steht jetzt in der Datei ...
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 10000 })
        .toContain('Eigene Ergaenzung');
      expect(fs.readFileSync(datei, 'utf8')).not.toContain(FREMDE_ZEILE);

      // ... und die fremde Fassung ist in der Historie gesichert.
      await expect.poll(() => fs.existsSync(mdd), { timeout: 10000 }).toBe(true);
      expect(fs.readFileSync(mdd, 'utf8')).toContain(FREMDE_ZEILE);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Gemeldet vom Product Owner am 2026-08-10 zur Test-EXE: «Wenn keine
  // Historie aktiv ist, dann passiert das auch nicht richtig.» KS-02 belegte
  // nur, dass die .mdd ENTSTEHT — nicht, dass der Anwender an die gesicherte
  // Fassung herankommt. Genau diesen Weg geht dieser Fall zu Ende.
  test('KS-05 die gesicherte Fassung ist bei abgeschalteter Historie auch abrufbar', async () => {
    const dir = makeDir('scg-md-ks05-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');

      await stubKonfliktDialog(app, 1); // 'Eigene Version behalten'
      await stummeBeobachtung(app);
      fs.writeFileSync(datei, `${AUSGANG}${FREMDE_ZEILE}\n`, 'utf8');

      await tippeAmEnde(page, 'Eigene Ergaenzung');
      await page.keyboard.press('Control+s');
      await expect.poll(() => konfliktDialogCalls(app), { timeout: 10000 }).toBe(1);

      // Der Weg des Anwenders: Ansicht -> Historie.
      await sendMenuChannel(app, 'menu:openHistory');
      const seite = page.locator('.history-page');
      await expect(seite).toBeVisible();

      // Die Seite darf nicht leer sein: Der Ausgangsstand dieser Historie IST
      // die ueberschriebene fremde Fassung.
      await expect(seite.locator('.history-empty')).toHaveCount(0);
      const zeilen = seite.locator('tbody tr');
      await expect(zeilen.first()).toBeVisible();

      // Ansehen der untersten Zeile (Ausgangsstand) zeigt die fremde Zeile.
      await zeilen.last().locator('.history-actions button').first().click();
      await expect(seite.locator('.history-text')).toContainText(FREMDE_ZEILE, { timeout: 10000 });
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Gemeldeter Ablauf des Product Owners vom 2026-08-10, an drei Hardcopys
  // belegt: LOKALE Datei mit ungespeicherten Aenderungen, extern in einem
  // anderen Programm geaendert, die Beobachtung meldet, der Nachlade-Dialog
  // erscheint, «eigene behalten» gewaehlt — und danach keine Sicherung.
  //
  // Der Fall laeuft deshalb OHNE stumme Beobachtung: Sie ist hier Teil des
  // Szenarios und nicht sein Stoerfaktor. Die uebrigen Faelle stellen die
  // schweigende Freigabe nach, dieser den haeufigsten Alltagsweg.
  test('KS-06 Entscheidung im Nachlade-Dialog: eine Frage, und die Sicherung entsteht', async () => {
    const dir = makeDir('scg-md-ks06-');
    const datei = path.join(dir, 'Notiz.md');
    const mdd = path.join(dir, 'Notiz.mdd');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await stubKonfliktDialog(app, 1); // 'Eigene Version behalten'

      // Ungespeicherte eigene Aenderung.
      await tippeAmEnde(page, 'Eigene Ergaenzung');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // Fremde Aenderung; die Beobachtung meldet sie und der Dialog erscheint.
      fs.writeFileSync(datei, `${AUSGANG}${FREMDE_ZEILE}\n`, 'utf8');
      await expect.poll(() => konfliktDialogCalls(app), { timeout: 15000 }).toBe(1);

      // Jetzt speichern: KEINE zweite Frage, denn sie ist beantwortet.
      await page.keyboard.press('Control+s');
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 10000 })
        .toContain('Eigene Ergaenzung');
      expect(await konfliktDialogCalls(app)).toBe(1);

      // Und die ueberschriebene fremde Fassung ist gesichert.
      await expect.poll(() => fs.existsSync(mdd), { timeout: 10000 }).toBe(true);
      expect(fs.readFileSync(mdd, 'utf8')).toContain(FREMDE_ZEILE);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('KS-03 ohne fremde Aenderung bleibt das Speichern dialogfrei (auch bei CRLF)', async () => {
    const dir = makeDir('scg-md-ks03-');
    const datei = path.join(dir, 'Notiz.md');
    // Windows-Zeilenenden: Der Vergleich muss beide Seiten gleich
    // normalisieren, sonst meldete jede solche Datei einen Dauer-Konflikt.
    fs.writeFileSync(datei, '# Notiz\r\n\r\nErste Zeile\r\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await stubKonfliktDialog(app, 1);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');

      await tippeAmEnde(page, 'Erste Ergaenzung');
      await page.keyboard.press('Control+s');
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 10000 })
        .toContain('Erste Ergaenzung');

      // Zweites Speichern auf dem selbst geschriebenen Stand.
      await tippeAmEnde(page, 'Zweite Ergaenzung');
      await page.keyboard.press('Control+s');
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 10000 })
        .toContain('Zweite Ergaenzung');

      expect(await konfliktDialogCalls(app)).toBe(0);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('KS-04 automatisches Speichern uebergeht den Konflikt nicht', async () => {
    const dir = makeDir('scg-md-ks04-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: { language: 'de', autoSave: true },
    });
    try {
      await oeffneZumBearbeiten(page);
      await stubKonfliktDialog(app, 1);

      // Anker: das automatische Speichern laeuft ueberhaupt.
      await tippeAmEnde(page, 'Automatisch gesichert');
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 15000 })
        .toContain('Automatisch gesichert');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);

      // Jetzt die fremde Aenderung, von der die Anwendung nichts erfaehrt.
      await stummeBeobachtung(app);
      const stand = fs.readFileSync(datei, 'utf8');
      fs.writeFileSync(datei, `${stand}${FREMDE_ZEILE}\n`, 'utf8');

      await tippeAmEnde(page, 'Waehrend des Konflikts getippt');

      // Der Hinweis erscheint, ohne dass ein Dialog aufspringt.
      await expect(page.locator('#statusbar-hint')).toContainText('Nicht gespeichert', {
        timeout: 15000,
      });
      expect(await konfliktDialogCalls(app)).toBe(0);

      // Die fremde Zeile steht weiterhin da, der eigene Text nicht.
      const aufPlatte = fs.readFileSync(datei, 'utf8');
      expect(aufPlatte).toContain(FREMDE_ZEILE);
      expect(aufPlatte).not.toContain('Waehrend des Konflikts getippt');
      // Der Reiter bleibt geaendert: nichts geht verloren.
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
