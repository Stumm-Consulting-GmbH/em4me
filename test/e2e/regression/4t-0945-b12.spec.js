// B-12 / Baustein B (4T-000945, Story 4S-000786): Das Speichern prueft den
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
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
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
  await hauptSenden(
    app,
    ({ dialog }, response) => {
      globalThis.__konfliktDialogCalls = 0;
      dialog.showMessageBox = async () => {
        globalThis.__konfliktDialogCalls += 1;
        return { response };
      };
    },
    antwort,
  );
}

function konfliktDialogCalls(app) {
  return hauptLesen(app, () => globalThis.__konfliktDialogCalls || 0);
}

// Menue-Weg ueber den IPC-Kanal (der native Menue-Klick ist nicht bedienbar);
// Muster aus funktionen/dokument-historie.spec.js.
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

// Stellt die Lage einer Netz-Freigabe her: Die Datei-Beobachtung meldet nichts.
async function stummeBeobachtung(app) {
  await hauptSenden(app, ({ BrowserWindow }) => {
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

test.describe('KS: Konflikt-Schutz beim Speichern (4T-000945)', () => {
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

      // Abnahme-Befund 3E-000196: Der Sicherungs-Schreibvorgang laeuft erst
      // wenige Millisekunden nach dem Dialog, und die Historien-Seite laedt
      // ihre Liste genau einmal beim Oeffnen. Deshalb erst auf die .mdd
      // warten (Muster KS-02/KS-06) — der Fall sichert die ABRUFBARKEIT der
      // Fassung zu, nicht den Schreib-Zeitpunkt. Das Rennen bestand
      // unveraendert schon auf v1.106.0 (dort 1 von 15 rot).
      const mdd = path.join(dir, 'Notiz.mdd');
      await expect.poll(() => fs.existsSync(mdd), { timeout: 10000 }).toBe(true);

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

  // --- 4T-001923: zwei Speicher-Befehle während eines laufenden Speicherns ---
  //
  // Gemessen am 2026-10-01 (Lösungs-Kapitel von 4T-001923): Kommt ein zweiter
  // Speicher-Befehl, während der erste noch schreibt, schickt er noch den alten
  // Stand als Erwartung mit, findet die Datei vom ersten geändert und stellt die
  // Konflikt-Frage, obwohl niemand sonst die Datei geändert hat. Lokal ist das
  // Fenster nur so breit wie ein Speichervorgang (2 bis 6 ms); bei einem
  // Speichervorgang von 300 ms traf es zwei Befehle im Abstand von 50 bis 250 ms
  // in 80 von 80 Durchgängen.
  //
  // Die Fälle stellen deshalb die Dauer des Speicherns: Im Hauptprozess wartet
  // der Behandler von `file:save` die gestellte Zeit, bevor er den Platten-Stand
  // liest (Modell eines langsamen Datenträgers, etwa einer Netz-Freigabe). Am
  // Ende wird der ursprüngliche Behandler wieder eingesetzt. Gesendet wird der
  // Befehl des Menü-Eintrags «Datei → Speichern», derselbe wie bei Strg+S
  // (src/main/menu/menu-apply.js, `save`).
  //
  // KS-07 und KS-08 sichern den GEWÜNSCHTEN Zustand zu und sind bis zur Behebung
  // als erwartet scheiternd markiert. Die Markierung steht bewusst im Rumpf und
  // erst NACH den Vorbedingungen: Scheitert eine Vorbedingung (der zweite Befehl
  // kam nicht während des ersten Speicherns), ist das ein gewöhnliches Rot und
  // wird nicht als «erwartet gescheitert» verbucht. Wer behebt, entfernt die
  // Zeile mit `test.fail` und hat damit die Zusicherung.

  // Gestellte Dauer eines Speichervorgangs und Abstand der beiden Befehle in
  // KS-07: die Werte der Messung, bei denen die Frage in 20 von 20 Durchgängen kam.
  const SPEICHER_DAUER_MS = 300;
  const ABSTAND_MS = 100;
  // KS-08 tippt zwischen den beiden Befehlen; die längere Dauer hält das
  // Speichern offen, solange die Eingabe läuft.
  const SPEICHER_DAUER_MIT_EINGABE_MS = 1000;

  // Setzt die gestellte Dauer und zählt im Hauptprozess mit: begonnene,
  // beendete und laufende Speichervorgänge, Konflikt-Antworten, deren Dialog
  // noch aussteht, und die Zahl laufender Vorgänge bei jeder Sendung.
  async function stelleSpeicherDauer(app, dauerMs) {
    await hauptSenden(
      app,
      ({ ipcMain }, dauer) => {
        const karte = ipcMain._invokeHandlers;
        const speichern = karte.get('file:save');
        const dialog = karte.get('dialog:confirmConflict');
        const ueberlagerung = karte.get('index:overlay');
        const z = {
          gestartet: 0,
          beendet: 0,
          laufend: 0,
          konflikte: 0,
          konfliktOffen: 0,
          laufendBeiSendung: [],
          // Ende eines erfolgreichen Speicherns in der Oberfläche: Als letzten
          // Schritt nimmt saveTab die Index-Überlagerung der Datei zurück
          // (`index:overlay` mit `content: null`, save-export.js).
          speichernAbgeschlossen: 0,
        };
        globalThis.__ks1923 = { speichern, dialog, ueberlagerung, z };
        karte.set('index:overlay', async (e, ...args) => {
          const nutzlast = args[0];
          if (nutzlast && nutzlast.content === null) z.speichernAbgeschlossen += 1;
          return ueberlagerung(e, ...args);
        });
        karte.set('file:save', async (e, ...args) => {
          z.gestartet += 1;
          z.laufend += 1;
          try {
            await new Promise((r) => setTimeout(r, dauer));
            const v = await speichern(e, ...args);
            if (v && v.reason === 'conflict') {
              z.konflikte += 1;
              z.konfliktOffen += 1;
            }
            return v;
          } finally {
            z.laufend -= 1;
            z.beendet += 1;
          }
        });
        karte.set('dialog:confirmConflict', async (e, ...args) => {
          if (z.konfliktOffen > 0) z.konfliktOffen -= 1;
          z.laufend += 1;
          try {
            return await dialog(e, ...args);
          } finally {
            z.laufend -= 1;
          }
        });
      },
      dauerMs,
    );
    // Der Weg hängt an einer inneren Tabelle von Electron; fehlt sie, scheitert
    // der Fall hier und nicht still an seiner Zusicherung.
    expect(
      await hauptLesen(app, () => {
        const s = globalThis.__ks1923;
        return (
          !!s && [s.speichern, s.dialog, s.ueberlagerung].every((f) => typeof f === 'function')
        );
      }),
    ).toBe(true);
  }

  async function nimmSpeicherDauerZurueck(app) {
    await hauptSenden(app, ({ ipcMain }) => {
      const s = globalThis.__ks1923;
      if (!s) return;
      ipcMain._invokeHandlers.set('file:save', s.speichern);
      ipcMain._invokeHandlers.set('dialog:confirmConflict', s.dialog);
      ipcMain._invokeHandlers.set('index:overlay', s.ueberlagerung);
      globalThis.__ks1923 = null;
    });
  }

  // Sendet «Speichern» einmal oder, mit Abstand, zweimal; der Abstand entsteht
  // im Hauptprozess und nicht über zwei Rundreisen aus der Prüfdatei.
  async function sendeSpeichern(app, abstandMs = null) {
    await hauptSenden(
      app,
      ({ BrowserWindow }, abstand) => {
        const win = BrowserWindow.getAllWindows()[0];
        const sende = () => {
          const s = globalThis.__ks1923;
          if (s) s.z.laufendBeiSendung.push(s.z.laufend);
          if (win && !win.isDestroyed()) win.webContents.send('menu:save');
        };
        sende();
        if (abstand !== null) setTimeout(sende, abstand);
      },
      abstandMs,
    );
  }

  function speicherStand(app) {
    return hauptLesen(app, () => ({ ...globalThis.__ks1923.z }));
  }

  // Ruhig ist der Stand, wenn beide Befehle ihren Speichervorgang hatten, keiner
  // mehr läuft, keine Konflikt-Antwort auf ihren Dialog wartet und die Datei den
  // erwarteten Text trägt.
  async function warteAufRuhe(app, datei, text) {
    await expect
      .poll(
        async () => {
          const z = await speicherStand(app);
          return (
            z.laufendBeiSendung.length >= 2 &&
            z.gestartet >= 2 &&
            z.laufend === 0 &&
            z.konfliktOffen === 0 &&
            fs.readFileSync(datei, 'utf8').includes(text)
          );
        },
        { timeout: 15000 },
      )
      .toBe(true);
  }

  test('KS-07 zweimal schnell gespeichert: keine Rückfrage, der Stand steht auf der Platte (4T-001923)', async () => {
    const dir = makeDir('scg-md-ks07-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await stubKonfliktDialog(app, 1); // 'Eigene Version behalten'
      await stelleSpeicherDauer(app, SPEICHER_DAUER_MS);

      await tippeAmEnde(page, 'Eigene Ergaenzung');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await sendeSpeichern(app, ABSTAND_MS);
      await warteAufRuhe(app, datei, 'Eigene Ergaenzung');

      // Vorbedingung: Der zweite Befehl kam, während der erste noch speicherte.
      const z = await speicherStand(app);
      expect(z.laufendBeiSendung[0]).toBe(0);
      expect(z.laufendBeiSendung[1]).toBeGreaterThanOrEqual(1);

      // Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.
      test.fail(true, 'Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.');
      expect(await konfliktDialogCalls(app)).toBe(0);
      expect(fs.readFileSync(datei, 'utf8')).toContain('Eigene Ergaenzung');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await nimmSpeicherDauerZurueck(app).catch(() => {});
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('KS-08 zwischen zwei Speicher-Befehlen getippt: keine Rückfrage, nichts geht verloren (4T-001923)', async () => {
    const dir = makeDir('scg-md-ks08-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await stubKonfliktDialog(app, 1); // 'Eigene Version behalten'
      await stelleSpeicherDauer(app, SPEICHER_DAUER_MIT_EINGABE_MS);

      await tippeAmEnde(page, 'Vor dem Speichern');
      await sendeSpeichern(app);
      // Während das erste Speichern läuft, weiterschreiben und erneut speichern.
      await page.keyboard.type(' und danach');
      await sendeSpeichern(app);
      await warteAufRuhe(app, datei, 'Vor dem Speichern und danach');

      // Vorbedingung: Der zweite Befehl kam, während der erste noch speicherte.
      const z = await speicherStand(app);
      expect(z.laufendBeiSendung[0]).toBe(0);
      expect(z.laufendBeiSendung[1]).toBeGreaterThanOrEqual(1);

      // Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.
      test.fail(true, 'Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.');
      expect(await konfliktDialogCalls(app)).toBe(0);
      expect(fs.readFileSync(datei, 'utf8')).toContain('Vor dem Speichern und danach');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await nimmSpeicherDauerZurueck(app).catch(() => {});
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Gemessen am 2026-10-01 bei der Arbeit an KS-08 (Messung P3 in 4T-001923,
  // 5 von 5): Was während EINES laufenden Speicherns getippt wird, gilt danach
  // als gespeichert — der Reiter verliert seine Änderungs-Markierung, die
  // Platte trägt die Eingabe aber nicht. saveTab zieht die Erwartung auf den
  // Puffer-Stand nach der Antwort nach statt auf den geschriebenen Stand. Wer
  // zwei Befehle reiht (Weg (a) in 4T-001923), muss das mit beheben, sonst
  // meldet der gereihte zweite Befehl einen Konflikt gegen den ersten.
  test('KS-10 während des Speicherns getippt: der Reiter bleibt als geändert markiert (4T-001923)', async () => {
    const dir = makeDir('scg-md-ks10-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await stubKonfliktDialog(app, 1);
      await stelleSpeicherDauer(app, SPEICHER_DAUER_MIT_EINGABE_MS);

      await tippeAmEnde(page, 'Vor dem Speichern');
      await sendeSpeichern(app);
      await page.keyboard.type(' und danach');
      // Vorbedingung: Die Eingabe war fertig, während das Speichern noch lief.
      const waehrend = await speicherStand(app);
      expect(waehrend.gestartet).toBe(1);
      expect(waehrend.laufend).toBe(1);

      // Warten, bis die Oberfläche das Speichern abgeschlossen hat.
      await expect
        .poll(async () => (await speicherStand(app)).speichernAbgeschlossen, { timeout: 15000 })
        .toBeGreaterThanOrEqual(1);
      const aufPlatte = fs.readFileSync(datei, 'utf8');
      expect(aufPlatte).toContain('Vor dem Speichern');
      expect(aufPlatte).not.toContain('und danach');
      expect(await konfliktDialogCalls(app)).toBe(0);

      // Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.
      test.fail(true, 'Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible({ timeout: 1000 });
    } finally {
      await nimmSpeicherDauerZurueck(app).catch(() => {});
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Nachlade-Weg (Erweiterung von 4T-001923 vom 2026-10-01): Die Datei-
  // Beobachtung meldet den eigenen Schreibvorgang erst rund 150 ms später
  // (awaitWriteFinish, src/main/documents/file-watching.js). Läuft dann schon
  // das nächste Speichern, ist dessen Eigen-Schreib-Merker gesetzt
  // (atomic-write.js, vor dem Umbenennen), die Datei trägt aber noch den vorigen
  // Stand: Die Meldung gilt als fremd, und der noch geänderte Reiter fragt.
  // Gemessen unter Windows in 4 von 40 Nachbauten von KB-03.
  //
  // Gestellt wird die Lage, indem der Fall das Umbenennen des ZWEITEN
  // Speicherns im Hauptprozess um UMBENENNEN_VERZOEGERUNG_MS aufhält. Das zweite
  // Speichern beginnt kurz nach dem ersten (Vorbedingung unten), die Meldung zum
  // ersten fällt damit sicher in die Zeit, in der der Merker schon den neuen
  // Stand trägt und die Datei noch den alten. Am Ende wird der ursprüngliche
  // Weg wieder eingesetzt.
  const UMBENENNEN_VERZOEGERUNG_MS = 1000;
  // Längster Abstand zwischen dem Ende des ersten und dem Beginn des zweiten
  // Umbenennens, bei dem die Meldung zum ersten (rund 150 ms danach) sicher in
  // das zweite fällt.
  const HOECHSTER_ABSTAND_MS = 120;

  async function halteZweitesUmbenennenAuf(app, dir) {
    await hauptSenden(
      app,
      (_e, a) => {
        const fsp = process.getBuiltinModule('node:fs/promises');
        const umbenennen = fsp.rename;
        const z = { aktiv: false, eintraege: [] };
        globalThis.__ks11 = { fsp, umbenennen, z };
        fsp.rename = async (von, nach) => {
          const ziel = String(nach);
          if (!ziel.endsWith(a.endung)) return umbenennen.call(fsp, von, nach);
          const eintrag = { start: performance.now(), ende: null, verzoegert: false };
          z.eintraege.push(eintrag);
          try {
            if (z.aktiv) {
              z.aktiv = false;
              eintrag.verzoegert = true;
              await new Promise((r) => setTimeout(r, a.dauer));
            }
            return await umbenennen.call(fsp, von, nach);
          } finally {
            eintrag.ende = performance.now();
          }
        };
      },
      { endung: `${path.basename(dir)}${path.sep}Notiz.md`, dauer: UMBENENNEN_VERZOEGERUNG_MS },
    );
  }

  function scharfeVerzoegerung(app) {
    return hauptSenden(app, () => {
      globalThis.__ks11.z.aktiv = true;
    });
  }

  function umbenennenStand(app) {
    return hauptLesen(app, () => globalThis.__ks11.z.eintraege.map((e) => ({ ...e })));
  }

  async function gibUmbenennenFrei(app) {
    await hauptSenden(app, () => {
      const s = globalThis.__ks11;
      if (!s) return;
      s.fsp.rename = s.umbenennen;
      globalThis.__ks11 = null;
    });
  }

  test('KS-11 Meldung der Beobachtung zum eigenen Speichern während des nächsten: keine Rückfrage (4T-001923)', async () => {
    const dir = makeDir('scg-md-ks11-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await stubKonfliktDialog(app, 1); // 'Eigene Version behalten'
      // Zähler ohne gestellte Speicher-Dauer: Ende eines Speicherns in der
      // Oberfläche, laufende Vorgänge, Konflikt-Antworten des Speicherns.
      await stelleSpeicherDauer(app, 0);
      await halteZweitesUmbenennenAuf(app, dir);

      // Erstes Speichern, abgewartet bis zum Ende in der Oberfläche; eng
      // abgefragt, damit das zweite kurz danach beginnt.
      await tippeAmEnde(page, 'Erste Ergaenzung');
      await sendeSpeichern(app);
      await expect
        .poll(async () => (await speicherStand(app)).speichernAbgeschlossen, {
          intervals: [5],
          timeout: 10000,
        })
        .toBe(1);

      // Zweites Speichern mit neuem Inhalt; sein Umbenennen wird aufgehalten.
      await scharfeVerzoegerung(app);
      await page.keyboard.type(' und mehr');
      await sendeSpeichern(app);
      await expect
        .poll(
          async () => {
            const z = await speicherStand(app);
            return z.speichernAbgeschlossen >= 2 && z.laufend === 0 && z.konfliktOffen === 0;
          },
          { timeout: 15000 },
        )
        .toBe(true);

      // Vorbedingungen der gestellten Lage: zweimal umbenannt, das zweite
      // aufgehalten und kurz nach dem ersten begonnen; das Speichern selbst
      // meldete keinen Konflikt (sonst wäre es der Speicher-Weg aus KS-07).
      const umb = await umbenennenStand(app);
      expect(umb.length).toBe(2);
      expect(umb[1].verzoegert).toBe(true);
      expect(umb[1].start - umb[0].ende).toBeLessThan(HOECHSTER_ABSTAND_MS);
      expect((await speicherStand(app)).konflikte).toBe(0);

      // Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.
      test.fail(true, 'Bekannter Zustand bis zur Behebung, Vorgang 4T-001923.');
      expect(await konfliktDialogCalls(app)).toBe(0);
      expect(fs.readFileSync(datei, 'utf8')).toContain('Erste Ergaenzung und mehr');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await gibUmbenennenFrei(app).catch(() => {});
      await nimmSpeicherDauerZurueck(app).catch(() => {});
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  // Gegenfall zu KS-07 und KS-08 (AK7 von 4T-001923): Eine echte Änderung von
  // außen ZWISCHEN zwei Speicher-Befehlen löst die Frage weiterhin aus. Eine
  // Behebung, die zwei Befehle reiht, darf diese Prüfung nicht abschalten.
  // Lage der schweigenden Freigabe wie KS-01.
  test('KS-09 Fremd-Änderung zwischen zwei Speicher-Befehlen: die Rückfrage kommt (4T-001923)', async () => {
    const dir = makeDir('scg-md-ks09-');
    const datei = path.join(dir, 'Notiz.md');
    fs.writeFileSync(datei, AUSGANG, 'utf8');

    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await oeffneZumBearbeiten(page);
      await expect(page.locator(SEL.editorContent0)).toContainText('Erste Zeile');
      await stubKonfliktDialog(app, 0); // 'Vom Datentraeger neu laden'
      await stummeBeobachtung(app);

      // Erstes Speichern ohne Fremd-Änderung: keine Frage.
      await tippeAmEnde(page, 'Erste Ergaenzung');
      await sendeSpeichern(app);
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 10000 })
        .toContain('Erste Ergaenzung');
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
      expect(await konfliktDialogCalls(app)).toBe(0);

      // Fremde Änderung, von der die Anwendung nichts erfährt.
      const stand = fs.readFileSync(datei, 'utf8');
      fs.writeFileSync(datei, `${stand}${FREMDE_ZEILE}\n`, 'utf8');

      // Zweites Speichern auf dem veralteten Stand: Die Frage kommt.
      await tippeAmEnde(page, 'Zweite Ergaenzung');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      await sendeSpeichern(app);
      await expect.poll(() => konfliktDialogCalls(app), { timeout: 10000 }).toBe(1);
      const aufPlatte = fs.readFileSync(datei, 'utf8');
      expect(aufPlatte).toContain(FREMDE_ZEILE);
      expect(aufPlatte).not.toContain('Zweite Ergaenzung');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});
