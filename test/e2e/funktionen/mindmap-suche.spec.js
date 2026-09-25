// 4T-001893 (Epic 3E-000324): Ablauf-Fälle der Suche in der Mindmap-Ansicht —
// Markieren und Hinspringen (Entscheidung des Product Owners vom 2026-09-23,
// Weg A; Story 4S-000996).
//
// **Der bestätigte Fall** (4T-001888): Strg+F in der Mindmap-Ansicht zählte die
// Treffer der dort ausgeblendeten Lese-Ansicht — «Suche in der Vorschau»,
// «1 / 2» —, und in der Karte war nichts zu sehen. Diese Fälle halten fest,
// dass die Leiste jetzt «Suche in der Mindmap» meldet, die Treffer-Knoten der
// Karte zählt, sie hervorhebt und anspringt, und zwar in **beiden** Lagen des
// Dokuments: außerhalb (MM-01) und innerhalb eines geöffneten Bereichs (MM-02).
// MM-03 deckt den Treffer in einem eingeklappten Teilbaum.
//
// **Warum gegen die echte Anwendung.** Die Kette läuft über Tastenkürzel,
// Suchleiste, Suchraum-Wahl, Einbettung der Karte und Zeichnung; die
// Unit-Prüfungen messen die Stücke gegen gestellte Nachbarn, die Kette sieht
// erst der Lauf an der gestarteten Anwendung.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, F-259, die
// Katalog-Zeile der Mindmap-Ansicht).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { pressNachfassend, pressUntilVisible } = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const KARTE = `${PANE0} .pane-mindmap`;
const KNOTEN = `${KARTE} .mindmap-knoten-gruppe`;
const TREFFER = `${KARTE} .mindmap-treffer`;
const AKTUELL = `${KARTE} .mindmap-treffer-aktuell`;
const EINGABE = '#search-input';
const ZAEHLER = '#search-count';
const SUCHRAUM = '#search-scope';
const PANEL = `${PANE0} .sidebar-searchresults`;

// Zwei Knoten tragen das Suchwort, in zwei verschiedenen Ästen.
const GARTEN = [
  '# Garten',
  '',
  '## Falter',
  '',
  '- Zitronenfalter',
  '- Kohlweißling',
  '',
  '## Beobachtungen',
  '',
  '- Zitronenfalter am Fenster',
  '- Amsel im Busch',
  '',
].join('\n');

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1893-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, inhalt, name = 'Garten.md') {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, inhalt, 'utf8');
  return datei;
}

async function sendeMenuKanal(app, kanal, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, nutzlast) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(nutzlast.kanal, ...nutzlast.args);
    },
    { kanal, args },
  );
}

// Die Mindmap-Ansicht öffnen. Der Menü-Listener hängt erst am Ende der
// asynchronen Renderer-Init, und Electron-IPC puffert nicht: gesendet wird, bis
// die Karte steht (Muster kanban-angaben.spec.js). Das Öffnen ist idempotent.
async function oeffneKarte(app, page) {
  await expect
    .poll(
      async () => {
        if (await page.locator(KNOTEN).first().isVisible()) return true;
        await sendeMenuKanal(app, 'menu:viewChange', 'mindmap');
        return page.locator(KNOTEN).first().isVisible();
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

// Strg+F ist idempotent (ein zweiter Druck öffnet dieselbe Leiste), deshalb
// darf nachgedrückt werden, bis die Eingabe sichtbar ist.
async function sucheOeffnen(page, begriff) {
  await page.locator(`${KARTE} .mindmap-svg`).click({ position: { x: 5, y: 5 } });
  await pressUntilVisible(page, 'Control+f', page.locator(EINGABE));
  await page.locator(EINGABE).fill(begriff);
}

async function bindeBereich(page, dir) {
  const res = await page.evaluate((p) => window.api.openAreaPath(p), dir);
  expect(res.boundExisting).toBe(true);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

// Liegt der aktuelle Treffer im sichtbaren Ausschnitt der Karte?
async function aktuellerImBild(page) {
  const knoten = await page.locator(`${AKTUELL} .mindmap-titel`).boundingBox();
  const flaeche = await page.locator(`${KARTE} .mindmap-svg`).boundingBox();
  if (!knoten || !flaeche) return false;
  return (
    knoten.x >= flaeche.x &&
    knoten.y >= flaeche.y &&
    knoten.x + knoten.width <= flaeche.x + flaeche.width &&
    knoten.y + knoten.height <= flaeche.y + flaeche.height
  );
}

async function lage(page) {
  return page.locator(`${KARTE} .mindmap-viewport`).getAttribute('transform');
}

// Der gemeinsame Ablauf beider Lagen: suchen, zählen, markieren, weiterschalten,
// beenden. Das Dokument bleibt dabei unverändert.
async function pruefeSuche(page, datei, vorher) {
  await sucheOeffnen(page, 'zitronenfalter');
  await expect(page.locator(SUCHRAUM)).toHaveText('Suche in der Mindmap');
  // Zwei Knoten der Karte, nicht die Fundstellen der ausgeblendeten Lese-Ansicht.
  await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
  await expect(page.locator(TREFFER)).toHaveCount(2);
  await expect(page.locator(`${AKTUELL} .mindmap-titel`)).toHaveText('Zitronenfalter');
  await expect.poll(() => aktuellerImBild(page)).toBe(true);

  // F3 rückt den Zeiger je Druck um eins weiter und ist nicht idempotent.
  await pressNachfassend(
    page,
    'F3',
    async () => (await page.locator(ZAEHLER).textContent()) === '2 / 2',
  );
  await expect(page.locator(`${AKTUELL} .mindmap-titel`)).toHaveText('Zitronenfalter am Fenster');
  await expect.poll(() => aktuellerImBild(page)).toBe(true);

  // Escape beendet die Suche: keine Hervorhebung mehr, Zoom und Lage bleiben.
  const vorEscape = await lage(page);
  await page.locator(EINGABE).press('Escape');
  await expect(page.locator(EINGABE)).toBeHidden();
  await expect(page.locator(TREFFER)).toHaveCount(0);
  expect(await lage(page)).toBe(vorEscape);

  await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
  expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
}

test.describe('MM-01: Suche in der Mindmap, Dokument außerhalb eines Bereichs (F-259)', () => {
  test('die Leiste zählt die Treffer-Knoten der Karte, markiert und springt sie an', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, GARTEN);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneKarte(app, page);
      await pruefeSuche(page, datei, GARTEN);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('MM-02: Suche in der Mindmap, Dokument in einem geöffneten Bereich (F-259)', () => {
  test('auch im Bereich gehört Strg+F der Karte; die Bereichs-Suche bleibt über die Lese-Ansicht', async () => {
    test.setTimeout(120000);
    const dir = machVerzeichnis();
    const datei = schreibe(dir, GARTEN);
    // Eine zweite Datei desselben Bereichs mit dem Suchwort: Die Bereichs-Suche
    // fände sie, die Suche in der Karte nicht.
    schreibe(dir, '# Notizen\n\nEin Zitronenfalter im Mai.\n', 'Notizen.md');
    // Gebunden wird ein leeres Fenster, danach kommt die Datei hinein (Muster
    // bereiche.spec.js, BE-08): Ein Fenster mit offener Datei übernimmt keinen
    // Bereich, sondern öffnet ein neues.
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, dir);
      await app.evaluate(({ BrowserWindow }, p) => {
        BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
      }, datei);
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneKarte(app, page);
      await pruefeSuche(page, datei, GARTEN);

      // Die Bereichs-Suche selbst ist unverändert: In der Lese-Ansicht sucht
      // dieselbe Leiste im ganzen Bereich und zeigt ihre Trefferliste.
      await sendeMenuKanal(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${KARTE}`)).toBeHidden();
      await pressUntilVisible(page, 'Control+f', page.locator(EINGABE));
      await page.locator(EINGABE).fill('zitronenfalter');
      await expect(page.locator(SUCHRAUM)).toHaveText('Suche im Bereich');
      await expect(page.locator(`${PANEL} .search-results-group`)).toHaveCount(2);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('MM-03: Treffer in einem eingeklappten Teilbaum (F-259)', () => {
  test('der Treffer zählt mit, und das Anspringen klappt seinen Ast auf', async () => {
    const dir = machVerzeichnis();
    // Anfangs ausgeklappt nur bis zur ersten Ebene: Die Listenpunkte beider
    // Äste sind beim Öffnen verborgen.
    const vorher = ['---', 'mindmap:', '  anfangsTiefe: 1', '---', GARTEN].join('\n');
    const datei = schreibe(dir, vorher);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneKarte(app, page);
      const titel = (text) =>
        page.locator(`${KARTE} .mindmap-titel`).filter({ hasText: new RegExp(`^${text}$`) });
      await expect(titel('Zitronenfalter')).toHaveCount(0);

      await sucheOeffnen(page, 'zitronenfalter');
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
      // Der erste Treffer ist angesprungen und sein Ast dafür aufgeklappt.
      await expect(titel('Zitronenfalter')).toHaveCount(1);
      await expect(page.locator(`${AKTUELL} .mindmap-titel`)).toHaveText('Zitronenfalter');
      await expect.poll(() => aktuellerImBild(page)).toBe(true);

      // Beim Beenden bleibt der Ast offen; sonst verschwände der Fund wieder.
      await page.locator(EINGABE).press('Escape');
      await expect(page.locator(TREFFER)).toHaveCount(0);
      await expect(titel('Zitronenfalter')).toHaveCount(1);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
