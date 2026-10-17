// 4T-002284 (Epic 3E-000348): Ablauf-Faelle der Praesentation ueber zwei
// Fenster an der gestarteten Anwendung — die Vorfuehrung im eigenen Fenster
// (Publikums-Fenster, 4T-002278) und die Referenten-Ansicht (4T-002279).
// Folien-Uebersicht, Aufdecken und Verkleinerung stehen in
// praesentation-uebersicht.spec.js, eigene Themes und der Dialog in
// praesentation-themes.spec.js, die Exporte mit Notizen in
// praesentation-export.spec.js.
//
// **Warum gegen die echte Anwendung.** Die Kette laeuft ueber beide Prozesse
// und zwei Fenster: Das Hauptfenster baut die gezeichnete Folie als Dokument,
// der Hauptprozess reicht sie ueber die Kanal-Gruppe an das Publikums-Fenster,
// dessen eigenes Preload sie in einen Rahmen setzt; Tasten im
// Publikums-Fenster laufen den Weg zurueck. Die Unit-Faelle stellen jeweils den
// Nachbarn dieser Naht (test/README.md, Regel «E2E-Fall pro neuem Bedien-Weg
// ueber eine Prozess-Bruecke»).
//
// **Der Zwei-Fenster-Zugriff.** Das Publikums-Fenster wird ueber die
// Fenster-Liste des Test-Treibers gefunden, an seiner Seite publikum.html —
// benannt, nicht abgezaehlt (Stabilitaetsregel 15). Seine Folie steht in einem
// Rahmen mit `sandbox=""`; gelesen wird ihr Inhalt ueber den Rahmen-Zugriff
// des Treibers. Gesendet wird an das Hauptfenster ebenso ueber ein Merkmal
// (seine Seite ist nicht publikum.html).
//
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, S-166 und
// S-167).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufDateiArgument } = require('../helpers/app');
const { pressUntilVisible, pressNachfassend } = require('../helpers/eingabe');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');

const PANE0 = '.pane-group[data-pane="0"]';
const FLAECHE = `${PANE0} .pane-presentation .praesentation-flaeche`;
const ZAEHLER = `${FLAECHE} .praesentation-zaehler`;
const ARTIKEL = `${FLAECHE} .praesentation-buehne .praesentation-folie`;
const REFERENT = `${FLAECHE} .praesentation-referent`;
const VORSCHAU = `${REFERENT} .praesentation-referent-vorschau`;
const NOTIZEN = `${REFERENT} .praesentation-referent-notizen-inhalt`;
const RAHMEN = 'iframe.publikum-folie';

// Vier Folien mit Kennzeichen; die erste traegt eine Notiz in jeder Form.
const VIER_FOLIEN = [
  '---',
  'presentation: true',
  '---',
  '',
  '# Folie eins',
  '',
  '%% Notiz eins in Prozent %%',
  '',
  '<!-- Notiz eins als Kommentar -->',
  '',
  '---',
  '',
  '## Folie zwei',
  '',
  '---',
  '',
  '## Folie drei',
  '',
  '<!-- Notiz drei -->',
  '',
  '---',
  '',
  '## Folie vier',
  '',
];

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-2284-fenster-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibeVortrag(dir) {
  const datei = path.join(dir, 'Vortrag.md');
  fs.writeFileSync(datei, VIER_FOLIEN.join('\n'), 'utf8');
  return datei;
}

async function oeffneFolien(page) {
  await pressUntilVisible(page, 'Control+8', page.locator(FLAECHE));
}

function istPublikum(seite) {
  return seite.url().includes('publikum.html');
}

// Das Publikums-Fenster in der Fenster-Liste des Treibers, sonst null.
function publikumOderNull(app) {
  return app.windows().find((seite) => !seite.isClosed() && istPublikum(seite)) || null;
}

async function warteAufPublikum(app) {
  await expect.poll(() => Boolean(publikumOderNull(app)), { timeout: 15000 }).toBe(true);
  const seite = publikumOderNull(app);
  await seite.waitForLoadState('domcontentloaded');
  return seite;
}

// Titel aller Fenster im Hauptprozess (Abfrage ohne Nebenwirkung).
function fensterTitel(app) {
  return hauptLesen(app, ({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => w.getTitle()),
  );
}

// Eine Menue-Nachricht an das Hauptfenster, benannt an seiner Seite.
async function sendeAnHauptfenster(app, kanal) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, k) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('publikum.html'),
      );
      if (win) win.webContents.send(k);
    },
    kanal,
  );
}

// Start ueber den Menue-Kanal, bis das Publikums-Fenster steht. Ein zweites
// Senden bei laufender Vorfuehrung startet nichts Neues (der Start kehrt bei
// laufender Vorfuehrung zurueck), deshalb darf nachgesendet werden.
async function starteBisPublikum(app, kanal) {
  await expect
    .poll(
      async () => {
        if (publikumOderNull(app)) return true;
        await sendeAnHauptfenster(app, kanal);
        return Boolean(publikumOderNull(app));
      },
      { timeout: 20000 },
    )
    .toBe(true);
  return warteAufPublikum(app);
}

// Die erste Ueberschrift der Folie im Rahmen des Publikums-Fensters.
function publikumUeberschrift(publikum) {
  return publikum.frameLocator(RAHMEN).locator('h1, h2').first();
}

// Die erste Ueberschrift der gezeigten Folie im Hauptfenster.
function hauptUeberschrift(page) {
  return page.locator(`${ARTIKEL} h1, ${ARTIKEL} h2`).first();
}

async function zaehlerIst(page, text) {
  return (await page.locator(ZAEHLER).textContent()) === text;
}

// Vergleich am Inhalt beider Fenster: dieselbe Ueberschrift, nachdem der
// Zaehler des Hauptfensters den Stand zeigt.
async function beideZeigen(page, publikum, zaehlerText, ueberschrift) {
  await expect(page.locator(ZAEHLER)).toHaveText(zaehlerText);
  await expect(hauptUeberschrift(page)).toHaveText(ueberschrift);
  await expect(publikumUeberschrift(publikum)).toHaveText(ueberschrift, { timeout: 10000 });
}

test.describe('PR-14: Vorführung im eigenen Fenster (S-166)', () => {
  test('Publikums-Fenster zeigt die Folie des Hauptfensters, blättert aus beiden Fenstern, endet mit Esc, beim Schließen und mit dem Hauptfenster', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeVortrag(dir);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');

      // --- Start: ein zweites Fenster mit der gezeigten Folie --------------
      let publikum = await starteBisPublikum(app, 'menu:presentationStartWindow');
      await expect.poll(() => app.windows().length).toBe(2);
      await expect.poll(() => fensterTitel(app)).toContain('Vorführung');
      await beideZeigen(page, publikum, '1 / 4', 'Folie eins');
      // Die Notizen stehen in keinem der beiden Fenster.
      await expect(publikum.frameLocator(RAHMEN).locator('body')).not.toContainText('Notiz');
      await expect(page.locator(FLAECHE)).not.toContainText('Notiz');

      // --- Blaettern im Hauptfenster -------------------------------------
      await pressNachfassend(page, 'ArrowRight', () => zaehlerIst(page, '2 / 4'));
      await beideZeigen(page, publikum, '2 / 4', 'Folie zwei');

      // --- Blaettern im Publikums-Fenster: die Taste geht ans Hauptfenster -
      await pressNachfassend(publikum, 'ArrowRight', () => zaehlerIst(page, '3 / 4'));
      await beideZeigen(page, publikum, '3 / 4', 'Folie drei');

      // --- Esc im Publikums-Fenster beendet: Fenster zu, Ansicht bleibt -----
      // Nur das Drücken der Taste wird gesendet (4T-002304): Der Lauscher der
      // Publikums-Seite reagiert auf `keydown`, und schon dieses Drücken stößt
      // die Kette an, die das Fenster schließt. Ein `keyboard.press` schickt
      // danach noch das Loslassen und scheitert mit «Target page, context or
      // browser has been closed», sobald die Kette schneller ist als die
      // Zustellung; im Release-Lauf 1.149.0 lagen 17 ms dazwischen. Dasselbe
      // Muster wie beim Schließen des Regals (regal.spec.js) und bei den
      // beiden Schließ-Schritten über den Hauptprozess weiter unten.
      const zuNachEsc = publikum.waitForEvent('close');
      await publikum.keyboard.down('Escape');
      await zuNachEsc;
      await expect.poll(() => app.windows().length).toBe(1);
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator(ZAEHLER)).toHaveText('3 / 4');

      // --- Publikums-Fenster schliessen beendet die Vorfuehrung ------------
      publikum = await starteBisPublikum(app, 'menu:presentationStartWindow');
      await beideZeigen(page, publikum, '3 / 4', 'Folie drei');
      const zuGeschlossen = publikum.waitForEvent('close');
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && w.webContents.getURL().includes('publikum.html'),
        );
        if (win) setTimeout(() => win.close(), 0);
      });
      await zuGeschlossen;
      await expect.poll(() => app.windows().length).toBe(1);
      // Beleg, dass die Vorfuehrung im Hauptfenster beendet ist: Ein neuer
      // Start oeffnet wieder ein Fenster (bei laufender Vorfuehrung bliebe er
      // ohne Wirkung).
      publikum = await starteBisPublikum(app, 'menu:presentationStartWindow');
      await beideZeigen(page, publikum, '3 / 4', 'Folie drei');

      // --- Hauptfenster schliessen schliesst das Publikums-Fenster mit -----
      const zuMitHaupt = publikum.waitForEvent('close');
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && !w.webContents.getURL().includes('publikum.html'),
        );
        if (win) setTimeout(() => win.close(), 0);
      });
      await zuMitHaupt;
      expect(publikum.isClosed()).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-15: Referenten-Ansicht über zwei Fenster (S-167)', () => {
  test('Hauptfenster zeigt nächste Folie, Notizen und Zeitgeber, das Publikums-Fenster die Folie; Blättern in beiden, Ende über das Kommando', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeVortrag(dir);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');

      // --- Start ueber den Menue-Kanal der Referenten-Ansicht --------------
      const publikum = await starteBisPublikum(app, 'menu:presentationPresenter');
      await expect(page.locator(FLAECHE)).toHaveClass(/praesentation-flaeche--referent/);
      await expect(page.locator(REFERENT)).toBeVisible();
      await beideZeigen(page, publikum, '1 / 4', 'Folie eins');
      // Naechste Folie und beide Notizen der ersten Folie, in Reihenfolge.
      await expect(page.locator(`${VORSCHAU} h2`)).toHaveText('Folie zwei');
      await expect(page.locator(`${NOTIZEN} .praesentation-referent-notiz`)).toHaveText([
        'Notiz eins in Prozent',
        'Notiz eins als Kommentar',
      ]);
      // Zeitgeber: verstrichene Zeit und Uhrzeit, Knoepfe beschriftet.
      await expect(page.locator(`${REFERENT} .praesentation-referent-verstrichen`)).toHaveText(
        /^\d+:\d\d$/,
      );
      await expect(page.locator(`${REFERENT} .praesentation-referent-uhrzeit`)).toHaveText(
        /\d{1,2}:\d\d/,
      );
      const anhalten = page.locator(`${REFERENT} .praesentation-referent-anhalten`);
      await expect(anhalten).toHaveText('Anhalten');
      await anhalten.click();
      await expect(anhalten).toHaveText('Fortsetzen');
      await expect(anhalten).toHaveAttribute('aria-pressed', 'true');
      await anhalten.click();
      await expect(anhalten).toHaveText('Anhalten');
      // Die Notizen stehen nicht im Publikums-Fenster.
      await expect(publikum.frameLocator(RAHMEN).locator('body')).not.toContainText('Notiz');

      // --- Blaettern im Hauptfenster: beide Fenster folgen -----------------
      await pressNachfassend(page, 'ArrowRight', () => zaehlerIst(page, '2 / 4'));
      await beideZeigen(page, publikum, '2 / 4', 'Folie zwei');
      await expect(page.locator(`${VORSCHAU} h2`)).toHaveText('Folie drei');
      await expect(page.locator(`${REFERENT} .praesentation-referent-leer`)).toHaveText(
        'Keine Notizen zu dieser Folie',
      );

      // --- Blaettern im Publikums-Fenster ---------------------------------
      await pressNachfassend(publikum, 'ArrowRight', () => zaehlerIst(page, '3 / 4'));
      await beideZeigen(page, publikum, '3 / 4', 'Folie drei');
      await expect(page.locator(`${NOTIZEN} .praesentation-referent-notiz`)).toHaveText([
        'Notiz drei',
      ]);
      await pressNachfassend(publikum, 'ArrowRight', () => zaehlerIst(page, '4 / 4'));
      await beideZeigen(page, publikum, '4 / 4', 'Folie vier');
      // Letzte Folie: statt einer naechsten das Ende.
      await expect(page.locator(`${REFERENT} .praesentation-referent-ende`)).toHaveText('Ende');
      await expect(page.locator(VORSCHAU)).toBeHidden();

      // --- Ende ueber «Vorfuehrung beenden» --------------------------------
      const zu = publikum.waitForEvent('close');
      await sendeAnHauptfenster(app, 'menu:presentationStop');
      await zu;
      await expect.poll(() => app.windows().length).toBe(1);
      await expect(page.locator(REFERENT)).toHaveCount(0);
      await expect(page.locator(FLAECHE)).not.toHaveClass(/praesentation-flaeche--referent/);
      await expect(page.locator(ZAEHLER)).toHaveText('4 / 4');
      await expect(hauptUeberschrift(page)).toHaveText('Folie vier');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
