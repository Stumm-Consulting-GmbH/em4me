// 4T-001727 (Epic 3E-000305): E2E-Funktions-Suite «Erinnerungen in allen
// Fenstern».
//
// Eine fällige Erinnerung steht in ALLEN offenen Fenstern, nennt ihren
// Herkunfts-Bereich, und eine Bearbeitung in einem Fenster räumt sie in allen
// übrigen. Der Nachweis braucht die reale Konstellation: mehrere Fenster
// mehrerer Bereiche, ein Fenster ohne Bereich und ein Fenster, das erst nach
// dem Fälligwerden geöffnet wird — der Ein-Fenster-Fall trüge das Ergebnis
// nicht.
//
// Aufbau jedes Falls: Die Anwendung startet mit einer Datei (Fenster OHNE
// Bereich); aus ihm heraus öffnen sich Bereiche als eigene Fenster. Das
// Ziel-Fenster wird dabei über seinen Titel benannt, nie abgezählt
// (Stabilitätsregel 15).
//
// EF-01: Anzeige im Fenster ohne Bereich und im Fenster des Herkunfts-Bereichs,
//        jeweils mit Herkunfts-Angabe; ein später geöffnetes Fenster eines
//        anderen Bereichs zeigt sie ebenfalls (AK1, AK2, AK3, AK8, AK14).
// EF-02: «Erledigt» im Fenster eines fremden Bereichs schreibt in die Quelldatei
//        des Herkunfts-Bereichs und räumt alle Fenster; das bearbeitende
//        Fenster schließt, und ein danach geöffnetes Fenster zeigt nichts mehr
//        (AK4, AK6, AK8, AK9).
// EF-03: «Später erinnern» im Fenster ohne Bereich verschiebt genau einmal und
//        räumt alle Fenster (AK5, AK6).
// EF-04: Wegklicken im Fenster eines fremden Bereichs räumt alle Fenster und
//        stummt im Herkunfts-Bereich (AK5, AK6).
// EF-05: Zwei fast gleichzeitige «Erledigt» in zwei Fenstern: eine Wirkung,
//        keine Fehlermeldung, beide Fenster geräumt (AK7).
// EF-06: Das letzte Fenster des Herkunfts-Bereichs schließt; die Meldung bleibt
//        in den übrigen, und ihre Bearbeitung wirkt weiter auf seine Datei
//        (AK9, AK16).
// EF-07: Zwei Bereiche mit je einer fälligen Erinnerung: je Fenster EIN Dialog
//        mit beiden Einträgen samt Herkunft (AK13).
// EF-08: Abgeschaltete Erweiterung «Erinnerungen»: kein Dialog in keinem
//        Fenster (AK10).
// EF-09: Erinnerung aus einem Buch erscheint auch im Fenster ohne Bereich und
//        nennt das Buch als Herkunft (AK14).
// EF-10: Dasselbe für ein Bücherregal (AK14).
// EF-11: Der Datei-Link im Fenster eines fremden Bereichs öffnet die Datei im
//        Fenster des Herkunfts-Bereichs, ohne Hinweis «außerhalb» (AK17).
// EF-12: Läuft der Herkunfts-Bereich nicht mehr, öffnet der Link ihn in einem
//        neuen Fenster und die Datei darin (AK17).
// EF-13: Die Erinnerung ist im Fenster ihres Bereichs getippt und NICHT
//        gespeichert; «Erledigt» im Fenster eines anderen Bereichs wirkt im
//        Editor des Herkunfts-Fensters, ohne «Zeile nicht mehr gefunden» (AK6,
//        Befund der Abnahme vom 2026-09-24).
// EF-14: Dasselbe für «Später erinnern»: genau ein neuer Zeitpunkt im Editor
//        des Herkunfts-Fensters (AK5, AK6).
//
// Datums-Bezug: ausschließlich weit vergangene Fixture-Daten (2020), nie der
// Kalendertag des Laufs (Stabilitätsregel 9).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { makeBook } = require('../helpers/buch');
const { SHELF_SETTINGS_FILENAME } = require('../../../src/shared/books/shelf-core.js');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const REMINDER = '⏰';
const MODAL = '#reminders-modal';
const MODAL_LIST = '#reminders-modal-list';
const ORIGIN = '.reminders-item-origin';
const HINWEIS = '#statusbar-hint';
const ZEIT = { timeout: 15000 };

// Bereichs-Ordner mit einer Aufgaben-Datei. `zeilen` sind die Aufgaben-Zeilen;
// Beschreibungen ASCII-sicher, damit Text-Vergleiche vom Konsolen-Encoding
// unabhängig bleiben.
function bereich(praefix, zeilen) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pmpp-ef-${praefix}-`));
  fs.writeFileSync(path.join(dir, 'aufgaben.md'), ['# Aufgaben', '', ...zeilen, ''].join('\n'));
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
  }
}

function zeileMit(datei, text) {
  return (
    fs
      .readFileSync(datei, 'utf8')
      .split('\n')
      .find((z) => z.includes(text)) || ''
  );
}

// Bereich aus einem Fenster heraus öffnen: Er entsteht als neues Fenster.
async function oeffneBereich(app, von, dir) {
  const neu = app.waitForEvent('window');
  const ergebnis = await von.evaluate((p) => window.api.openAreaPath(p), dir);
  expect(ergebnis.createdNew).toBe(true);
  const page = await neu;
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
  return page;
}

// Weiteres Fenster derselben Applikation.
async function oeffneFenster(app, von) {
  const neu = app.waitForEvent('window');
  await von.evaluate(() => window.api.openNewWindow([], null));
  const page = await neu;
  await page.waitForLoadState('domcontentloaded');
  return page;
}

// Fenster über seinen Titel schließen (nie über die Position).
async function schliesseFenster(app, titelTeil) {
  await app.evaluate(({ BrowserWindow }, teil) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes(teil));
    if (win) win.close();
  }, titelTeil);
}

// Start mit Datei-Argument: das erste Fenster hat keinen Bereich.
async function starte(opts = {}) {
  const lauf = await launchApp({ args: [BASIS], ...opts });
  await expect.poll(() => lauf.page.title()).toContain('basis');
  return lauf;
}

const eintraege = (page) => page.locator(`${MODAL_LIST} li`);

// --- EF-01 ---------------------------------------------------------------------------

test.describe('EF-01: Erinnerung in allen Fenstern samt Herkunft', () => {
  test('Fenster ohne Bereich, Herkunfts-Fenster und später geöffnetes fremdes Fenster zeigen sie', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const dirB = bereich('b', ['- [ ] Nichts Faelliges']);
    const nameA = path.basename(dirA);
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      for (const p of [page, fensterA]) {
        await expect(p.locator(MODAL)).toBeVisible(ZEIT);
        await expect(eintraege(p)).toHaveCount(1);
        await expect(p.locator(MODAL_LIST)).toContainText('Rueckruf Kunde');
        await expect(p.locator(ORIGIN)).toHaveText(`Herkunft: ${nameA}`);
      }
      // Erst jetzt öffnet sich ein Fenster eines ANDEREN Bereichs: Es holt die
      // noch offene Meldung nach (E10).
      const fensterB = await oeffneBereich(app, page, dirB);
      await expect(fensterB.locator(MODAL)).toBeVisible(ZEIT);
      await expect(fensterB.locator(MODAL_LIST)).toContainText('Rueckruf Kunde');
      await expect(fensterB.locator(ORIGIN)).toHaveText(`Herkunft: ${nameA}`);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

// --- EF-02 ---------------------------------------------------------------------------

test.describe('EF-02: «Erledigt» im fremden Fenster wirkt im Herkunfts-Bereich und räumt überall', () => {
  test('die Quelldatei trägt [x], alle Dialoge schließen, ein neues Fenster zeigt nichts', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const dirB = bereich('b', ['- [ ] Nichts Faelliges']);
    const datei = path.join(dirA, 'aufgaben.md');
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      const fensterB = await oeffneBereich(app, page, dirB);
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeVisible(ZEIT);

      await eintraege(fensterB).first().locator('button', { hasText: 'Erledigt' }).click();

      await expect.poll(() => zeileMit(datei, 'Rueckruf Kunde'), ZEIT).toMatch(/^- \[x\] /);
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeHidden(ZEIT);

      // Das bearbeitende Fenster schließt (AK9): Der Stand der übrigen bleibt
      // richtig, und ein danach geöffnetes Fenster zeigt die bearbeitete
      // Meldung nicht (E10).
      await schliesseFenster(app, `(Bereich ${path.basename(dirB)})`);
      await expect.poll(() => app.windows().length, ZEIT).toBe(2);
      const spaet = await oeffneFenster(app, page);
      await expect(spaet.locator('#reminders-modal-title')).toBeAttached(ZEIT);
      await spaet.waitForTimeout(1500);
      for (const p of [page, fensterA, spaet]) await expect(p.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

// --- EF-03 ---------------------------------------------------------------------------

test.describe('EF-03: «Später erinnern» im Fenster ohne Bereich verschiebt einmal', () => {
  test('neuer Zeitpunkt in der Quelldatei, alle Fenster geräumt', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Bericht abgeben ${REMINDER} 2020-03-15`]);
    const datei = path.join(dirA, 'aufgaben.md');
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      for (const p of [page, fensterA]) await expect(p.locator(MODAL)).toBeVisible(ZEIT);

      await eintraege(page).first().locator('button', { hasText: 'Später erinnern' }).click();
      await page
        .locator('#context-menu .context-menu-item', { hasText: '1 Stunde' })
        .first()
        .click();

      // Der alte Wert hat keine Uhrzeit; erst der verschobene trägt eine.
      await expect
        .poll(() => zeileMit(datei, 'Bericht abgeben'), ZEIT)
        .toMatch(/⏰ \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      const zeile = zeileMit(datei, 'Bericht abgeben');
      expect(zeile).not.toContain('2020-03-15');
      expect(zeile.split(REMINDER)).toHaveLength(2);
      for (const p of [page, fensterA]) await expect(p.locator(MODAL)).toBeHidden(ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
    }
  });
});

// --- EF-04 ---------------------------------------------------------------------------

test.describe('EF-04: Wegklicken im fremden Fenster räumt überall und stummt im Herkunfts-Bereich', () => {
  test('Escape in Bereich B schließt alle Dialoge; das Panel in Bereich A zeigt die Erinnerung stumm', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const dirB = bereich('b', ['- [ ] Nichts Faelliges']);
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      const fensterB = await oeffneBereich(app, page, dirB);
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeVisible(ZEIT);

      await fensterB.locator(MODAL).press('Escape');
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeHidden(ZEIT);

      // Die Stummschaltung liegt im Herkunfts-Bereich, nicht im Bereich B.
      await fensterA.locator('#btn-reminders').click();
      const liste = fensterA.locator('.pane-group[data-pane="0"] .sidebar-reminders');
      await expect(liste).toBeVisible(ZEIT);
      await expect(liste.locator('.reminders-entry.muted')).toHaveCount(1, ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

// --- EF-05 ---------------------------------------------------------------------------

test.describe('EF-05: Zwei fast gleichzeitige Bearbeitungen wirken einmal', () => {
  test('«Erledigt» in zwei Fenstern zugleich: eine Wirkung, keine Fehlermeldung', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const datei = path.join(dirA, 'aufgaben.md');
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      for (const p of [page, fensterA]) await expect(p.locator(MODAL)).toBeVisible(ZEIT);

      // Beide Klicks in derselben Ereignis-Runde des Prüfstands: Keiner der
      // beiden wartet auf eine Wirkung des anderen.
      const knopf = (p) => eintraege(p).first().locator('button', { hasText: 'Erledigt' });
      await Promise.all([
        knopf(page).evaluate((el) => el.click()),
        knopf(fensterA).evaluate((el) => el.click()),
      ]);

      await expect.poll(() => zeileMit(datei, 'Rueckruf Kunde'), ZEIT).toMatch(/^- \[x\] /);
      for (const p of [page, fensterA]) await expect(p.locator(MODAL)).toBeHidden(ZEIT);
      // Eine zweite Wirkung schaltete die Aufgabe zurück oder meldete einen
      // Konflikt; beides darf nicht eintreten.
      await page.waitForTimeout(1500);
      expect(zeileMit(datei, 'Rueckruf Kunde')).toMatch(/^- \[x\] /);
      const inhalt = fs.readFileSync(datei, 'utf8');
      expect(inhalt.match(/Rueckruf Kunde/g)).toHaveLength(1);
      for (const p of [page, fensterA]) await expect(p.locator(HINWEIS)).not.toHaveClass(/error/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
    }
  });
});

// --- EF-06 ---------------------------------------------------------------------------

test.describe('EF-06: Das letzte Fenster des Herkunfts-Bereichs schließt', () => {
  test('die Meldung bleibt im übrigen Fenster, «Erledigt» wirkt weiter auf die Datei des Bereichs', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const datei = path.join(dirA, 'aufgaben.md');
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      for (const p of [page, fensterA]) await expect(p.locator(MODAL)).toBeVisible(ZEIT);

      await schliesseFenster(app, `(Bereich ${path.basename(dirA)})`);
      await expect.poll(() => app.windows().length, ZEIT).toBe(1);
      await page.waitForTimeout(500);
      await expect(page.locator(MODAL)).toBeVisible();
      await expect(eintraege(page)).toHaveCount(1);

      await eintraege(page).first().locator('button', { hasText: 'Erledigt' }).click();
      await expect.poll(() => zeileMit(datei, 'Rueckruf Kunde'), ZEIT).toMatch(/^- \[x\] /);
      await expect(page.locator(MODAL)).toBeHidden(ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
    }
  });
});

// --- EF-07 ---------------------------------------------------------------------------

test.describe('EF-07: Mehrere fällige Erinnerungen aus zwei Bereichen', () => {
  test('jedes Fenster zeigt EINEN Dialog mit beiden Einträgen und ihrer Herkunft', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const dirB = bereich('b', [`- [ ] Rechnung pruefen ${REMINDER} 2020-02-01 09:00`]);
    const erwartet = [
      `Herkunft: ${path.basename(dirA)}`,
      `Herkunft: ${path.basename(dirB)}`,
    ].sort();
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      const fensterB = await oeffneBereich(app, page, dirB);
      for (const p of [page, fensterA, fensterB]) {
        await expect(p.locator(MODAL)).toBeVisible(ZEIT);
        await expect(eintraege(p)).toHaveCount(2, ZEIT);
        await expect(p.locator(MODAL)).toHaveCount(1);
        const herkunft = (await p.locator(ORIGIN).allTextContents()).sort();
        expect(herkunft).toEqual(erwartet);
      }
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

// --- EF-08 ---------------------------------------------------------------------------

test.describe('EF-08: Abgeschaltete Erweiterung «Erinnerungen»', () => {
  test('kein Dialog in keinem Fenster', async () => {
    const { app, page, userData } = await starte({
      settings: { language: 'de', extensions: { disabled: ['reminders'] } },
    });
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      // Abwesenheit lässt sich nicht abwarten: feste Frist wie ER-07.
      await fensterA.waitForTimeout(3000);
      for (const p of [page, fensterA]) await expect(p.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
    }
  });
});

// --- EF-09 ---------------------------------------------------------------------------

test.describe('EF-09: Erinnerung aus einem Buch', () => {
  test('erscheint im Fenster ohne Bereich und im Buch-Fenster und nennt das Buch als Herkunft', async () => {
    const { app, page, userData } = await starte();
    const eltern = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-ef-buch-'));
    const buch = makeBook(eltern, 'Reise');
    fs.appendFileSync(
      path.join(buch, 'Aufbruch.md'),
      `\n- [ ] Koffer packen ${REMINDER} 2020-01-01 08:00\n`,
    );
    try {
      const neu = app.waitForEvent('window');
      const ergebnis = await page.evaluate((dir) => window.api.books.openPath(dir), buch);
      expect(ergebnis).toMatchObject({ ok: true, createdNew: true });
      const buchFenster = await neu;
      await buchFenster.waitForLoadState('domcontentloaded');
      for (const p of [page, buchFenster]) {
        await expect(p.locator(MODAL)).toBeVisible(ZEIT);
        await expect(p.locator(MODAL_LIST)).toContainText('Koffer packen');
        await expect(p.locator(ORIGIN)).toHaveText('Herkunft: Reise');
      }
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eltern);
    }
  });
});

// --- EF-10 ---------------------------------------------------------------------------

test.describe('EF-10: Erinnerung aus einem Bücherregal', () => {
  test('erscheint im Fenster ohne Bereich und im Regal-Fenster und nennt das Regal als Herkunft', async () => {
    const { app, page, userData } = await starte();
    const eltern = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-ef-regal-'));
    const regal = path.join(eltern, 'Bibliothek');
    fs.mkdirSync(regal);
    fs.writeFileSync(
      path.join(regal, 'Bibliothek.md'),
      `# Bibliothek\n\n- [ ] Buecher zurueckgeben ${REMINDER} 2020-01-01 08:00\n`,
    );
    fs.writeFileSync(
      path.join(regal, SHELF_SETTINGS_FILENAME),
      JSON.stringify({ schemaVersion: 1, shelf: { file: 'Bibliothek.md' }, books: [] }, null, 2),
    );
    try {
      const neu = app.waitForEvent('window');
      const ergebnis = await page.evaluate((dir) => window.api.shelves.openPath(dir), regal);
      expect(ergebnis).toMatchObject({ ok: true, createdNew: true });
      const regalFenster = await neu;
      await regalFenster.waitForLoadState('domcontentloaded');
      for (const p of [page, regalFenster]) {
        await expect(p.locator(MODAL)).toBeVisible(ZEIT);
        await expect(p.locator(MODAL_LIST)).toContainText('Buecher zurueckgeben');
        await expect(p.locator(ORIGIN)).toHaveText('Herkunft: Bibliothek');
      }
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(eltern);
    }
  });
});

// --- EF-11 ---------------------------------------------------------------------------

const TAB_TITEL = '.pane-group[data-pane="0"] .tabbar .tab .tab-title';

test.describe('EF-11: Datei-Link im Fenster eines fremden Bereichs', () => {
  test('öffnet die Datei im Fenster des Herkunfts-Bereichs, ohne Hinweis «außerhalb des Bereichs»', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const dirB = bereich('b', ['- [ ] Nichts Faelliges']);
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      const fensterB = await oeffneBereich(app, page, dirB);
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeVisible(ZEIT);

      await fensterB.locator(`${MODAL_LIST} .reminders-item-file`).first().click();

      await expect(fensterA.locator(TAB_TITEL, { hasText: 'aufgaben' })).toHaveCount(1, ZEIT);
      // Das klickende Fenster öffnet nichts und meldet nichts.
      await fensterB.waitForTimeout(1000);
      await expect(fensterB.locator(TAB_TITEL, { hasText: 'aufgaben' })).toHaveCount(0);
      await expect(fensterB.locator(HINWEIS)).not.toHaveClass(/error/);
      await expect(fensterB.locator(HINWEIS)).not.toContainText('außerhalb');
      // Die Meldung bleibt stehen: Öffnen ist keine Bearbeitung.
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

// --- EF-12 ---------------------------------------------------------------------------

test.describe('EF-12: Datei-Link, wenn der Herkunfts-Bereich nicht mehr läuft', () => {
  test('öffnet den Bereich in einem neuen Fenster und die Datei darin', async () => {
    const { app, page, userData } = await starte();
    const dirA = bereich('a', [`- [ ] Rueckruf Kunde ${REMINDER} 2020-01-01 08:00`]);
    const titelA = `(Bereich ${path.basename(dirA)})`;
    try {
      await oeffneBereich(app, page, dirA);
      await expect(page.locator(MODAL)).toBeVisible(ZEIT);
      await schliesseFenster(app, titelA);
      await expect.poll(() => app.windows().length, ZEIT).toBe(1);

      const neu = app.waitForEvent('window');
      await page.locator(`${MODAL_LIST} .reminders-item-file`).first().click();
      const fensterA = await neu;
      await fensterA.waitForLoadState('domcontentloaded');
      await expect.poll(() => fensterA.title(), ZEIT).toContain(titelA);
      await expect(fensterA.locator(TAB_TITEL, { hasText: 'aufgaben' })).toHaveCount(1, ZEIT);
      await expect(page.locator(TAB_TITEL, { hasText: 'aufgaben' })).toHaveCount(0);
      await expect(page.locator(HINWEIS)).not.toHaveClass(/error/);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
    }
  });
});

// --- EF-13 und EF-14 -----------------------------------------------------------------
//
// Befund der Abnahme vom 2026-09-24: Die Erinnerung war im Fenster ihres
// Bereichs gerade gesetzt und die Datei dort NICHT gespeichert. Der Prüfer liest
// den Stand des Editors mit (Puffer-Overlay), die Meldung stammt also aus dem
// ungespeicherten Text. «Erledigt» im Fenster eines anderen Bereichs schrieb bis
// dahin auf die Platte, wo die Zeile so nicht steht, und meldete «Zeile nicht
// mehr gefunden». Die Bearbeitung muss dort wirken, wo der Stand der Meldung
// liegt: im Editor des Fensters, das die Datei geöffnet hat.

const EDITOR = SEL.editorContent0;
const DIRTY = SEL.dirtyTab0;
const EDITOR_TEXT = (fenster) => fenster.locator(EDITOR).innerText();
const FAELLIG = { timeout: 45000 };

// Die Statusleisten-Meldung steht nur drei Sekunden; ein Mitschnitt ihrer Texte
// macht sie unabhängig vom Zeitpunkt der Messung prüfbar.
async function schneideHinweiseMit(fenster) {
  await fenster.evaluate((sel) => {
    window.__efHinweise = [];
    const el = document.querySelector(sel);
    const merke = () => {
      if (el && el.textContent) window.__efHinweise.push(el.textContent);
    };
    new MutationObserver(merke).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
  }, HINWEIS);
}
const hinweise = (fenster) => fenster.evaluate(() => window.__efHinweise.join(' | '));

// Datei in einem bestimmten Fenster öffnen (Weg der Datei-Assoziation), erst
// nach dessen Init-Ende und genau einmal (Begründung in
// rueckschreib-beobachtung.spec.js, oeffneImJuengstenFenster).
async function oeffneDateiIn(app, fenster, titelTeil, datei) {
  await fenster.waitForFunction(() => document.body.dataset.rendererReady === '1', undefined, {
    timeout: 20000,
  });
  await app.evaluate(
    ({ BrowserWindow }, { teil, f }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes(teil));
      if (win) win.webContents.send('file:openExternal', [f]);
    },
    { teil: titelTeil, f: datei },
  );
  await expect(fenster.locator(TAB_TITEL, { hasText: 'aufgaben' })).toHaveCount(1, ZEIT);
}

// Im Fenster des Herkunfts-Bereichs die Erinnerung an die Aufgaben-Zeile tippen,
// ohne zu speichern. Danach eine zweite Datei des Bereichs anlegen: Die
// Beobachtung des Bereichs stößt den Prüfer an, statt auf seinen 30-Sekunden-Takt
// zu warten.
async function tippeErinnerungOhneSpeichern(fenster, dir, aufgabe) {
  await fenster.locator(SEL.viewBtn('source')).click();
  await fenster.locator(SEL.btnEdit).click();
  await expect(fenster.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  await fenster.locator(`${EDITOR} .cm-line`, { hasText: aufgabe }).click();
  await fenster.keyboard.press('End');
  await fenster.keyboard.insertText(` ${REMINDER} 2020-01-01 08:00`);
  await expect(fenster.locator(DIRTY)).toHaveCount(1);
  await fenster.waitForTimeout(800);
  fs.writeFileSync(path.join(dir, 'anstoss.md'), '# Anstoss\n');
}

test.describe('EF-13: «Erledigt» im fremden Fenster bei ungespeicherter Quelldatei', () => {
  test('wirkt im Editor des Herkunfts-Fensters, ohne Hinweis «Zeile nicht mehr gefunden»', async () => {
    test.setTimeout(150000);
    const { app, page, userData } = await starte();
    const dirA = bereich('a', ['- [ ] Newsletter entwerfen']);
    const dirB = bereich('b', ['- [ ] Nichts Faelliges']);
    const datei = path.join(dirA, 'aufgaben.md');
    const titelA = `(Bereich ${path.basename(dirA)})`;
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      const fensterB = await oeffneBereich(app, page, dirB);
      await oeffneDateiIn(app, fensterA, titelA, datei);
      await tippeErinnerungOhneSpeichern(fensterA, dirA, 'Newsletter entwerfen');

      await expect(fensterB.locator(MODAL)).toBeVisible(FAELLIG);
      await expect(fensterB.locator(MODAL_LIST)).toContainText('Newsletter entwerfen');
      await schneideHinweiseMit(fensterB);
      await eintraege(fensterB).first().locator('button', { hasText: 'Erledigt' }).click();
      // Zuerst die Meldung des klickenden Fensters: Bis zur Behebung stand hier
      // «Zeile nicht mehr gefunden», und die Erinnerung blieb stehen.
      await fensterB.waitForTimeout(1500);
      expect(await hinweise(fensterB)).not.toContain('nicht mehr gefunden');

      // Gewirkt hat die Bearbeitung im Editor des Herkunfts-Fensters; die Datei
      // bleibt dort ungespeichert, wie bei «Erledigt» im Fenster selbst.
      await expect.poll(() => EDITOR_TEXT(fensterA), ZEIT).toMatch(/- \[x\] Newsletter entwerfen/);
      await expect(fensterA.locator(DIRTY)).toHaveCount(1);
      expect(zeileMit(datei, 'Newsletter entwerfen')).toBe('- [ ] Newsletter entwerfen');
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeHidden(ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});

test.describe('EF-14: «Später erinnern» im fremden Fenster bei ungespeicherter Quelldatei', () => {
  test('verschiebt im Editor des Herkunfts-Fensters genau einmal', async () => {
    test.setTimeout(150000);
    const { app, page, userData } = await starte();
    const dirA = bereich('a', ['- [ ] Newsletter entwerfen']);
    const dirB = bereich('b', ['- [ ] Nichts Faelliges']);
    const datei = path.join(dirA, 'aufgaben.md');
    const titelA = `(Bereich ${path.basename(dirA)})`;
    try {
      const fensterA = await oeffneBereich(app, page, dirA);
      const fensterB = await oeffneBereich(app, page, dirB);
      await oeffneDateiIn(app, fensterA, titelA, datei);
      await tippeErinnerungOhneSpeichern(fensterA, dirA, 'Newsletter entwerfen');

      await expect(fensterB.locator(MODAL)).toBeVisible(FAELLIG);
      await schneideHinweiseMit(fensterB);
      await eintraege(fensterB).first().locator('button', { hasText: 'Später erinnern' }).click();
      await fensterB
        .locator('#context-menu .context-menu-item', { hasText: '1 Stunde' })
        .first()
        .click();
      // Zuerst die Meldung des klickenden Fensters: Bis zur Behebung stand hier
      // «Zeile nicht mehr gefunden», und die Erinnerung blieb stehen.
      await fensterB.waitForTimeout(1500);
      expect(await hinweise(fensterB)).not.toContain('nicht mehr gefunden');

      await expect
        .poll(() => EDITOR_TEXT(fensterA), ZEIT)
        .toMatch(/Newsletter entwerfen ⏰ (?!2020-01-01)\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      const text = await EDITOR_TEXT(fensterA);
      expect(text).not.toContain('2020-01-01');
      expect(text.split(REMINDER)).toHaveLength(2);
      expect(zeileMit(datei, 'Newsletter entwerfen')).toBe('- [ ] Newsletter entwerfen');
      for (const p of [page, fensterA, fensterB]) await expect(p.locator(MODAL)).toBeHidden(ZEIT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(dirA);
      removeDir(dirB);
    }
  });
});
