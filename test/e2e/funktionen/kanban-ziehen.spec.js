// 4T-001853 (Epic 3E-000110): Ablauf-Fälle des Verschiebens per Maus auf der
// Kanban-Tafel — Karte zwischen Spalten, Abhaken beim Hineinziehen, Rücknahme
// beim Herausziehen und der Ort der Folge-Instanz einer wiederholenden Aufgabe
// (AK2 des Tasks).
//
// **Warum eigens gegen die laufende Anwendung.** Die Unit-Prüfungen des Zugs
// messen dieselben Wege mit **gestellten** Rechtecken: jsdom rechnet kein
// Layout, und die Geometrie ist dort vollständig vorgegeben. Damit ist gezeigt,
// dass die Rechnung stimmt — nicht, dass sie an einer echt gezeichneten Tafel
// dieselben Rechtecke bekommt. Genau diese Hälfte trägt dieser Fall, und er
// endet wie alle Tafel-Fälle am **Dokument-Text**.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, F-314).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { bedieneBis } = require('../helpers/eingabe');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const TAFEL = `${PANE0} .pane-kanban .kanban-tafel`;
const SPALTEN = `${TAFEL} .kanban-spalte`;
const KARTEN = `${TAFEL} .kanban-karte`;

// «Offen» ohne Erledigt-Kennzeichen, «Fertig» mit: Der Zug in die zweite Spalte
// hakt deshalb ab, der Zug zurück nimmt es zurück. Die mittlere Karte
// wiederholt sich täglich.
const TAFEL_TEXT = [
  '---',
  'kanban-plugin: board',
  '---',
  '',
  '## Offen',
  '',
  '- [ ] Vorher',
  '- [ ] Waesche 🔁 every day 📅 2026-01-01',
  '- [ ] Nachher',
  '',
  '',
  '## Fertig',
  '',
  '**Fertiggestellt**',
  '',
  '',
].join('\n');

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-1853z-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
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

async function sendeBis(app, kanal, bedingung, args = []) {
  await expect
    .poll(
      async () => {
        if (await bedingung()) return true;
        await sendeMenuKanal(app, kanal, ...args);
        return bedingung();
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

async function oeffneTafel(app, page) {
  await sendeBis(app, 'menu:viewChange', () => page.locator(TAFEL).isVisible(), ['kanban']);
}

async function macheAenderbar(page) {
  await bedieneBis(page.locator(SEL.btnEdit), async () => {
    const wert = await page.locator(TAFEL).getAttribute('data-aenderbar');
    return wert === 'true';
  });
}

async function speichere(app, datei, bedingung) {
  await sendeBis(app, 'menu:save', () => bedingung(fs.readFileSync(datei, 'utf8')));
  return fs.readFileSync(datei, 'utf8');
}

function kartenZeilen(text, spaltenTitel) {
  const zeilen = text.split('\n').map((z) => z.replace(/\r$/, ''));
  const start = zeilen.findIndex((z) => z.trim() === `## ${spaltenTitel}`);
  if (start < 0) return null;
  const raus = [];
  for (let i = start + 1; i < zeilen.length; i++) {
    if (/^#{1,6}\s/.test(zeilen[i]) || /^\*{3,}\s*$/.test(zeilen[i])) break;
    if (/^- \[.\] /.test(zeilen[i])) raus.push(zeilen[i]);
  }
  return raus;
}

/**
 * Zieht eine Karte an das untere Ende der Karten-Liste einer Spalte.
 *
 * Die Bewegung läuft in Schritten und nicht in einem Sprung: Der Zug startet
 * erst, wenn die zurückgelegte Strecke die Schwelle überschreitet, und die
 * Einfüge-Position wird bei jeder Bewegung neu gerechnet. Ein einziger
 * `move` lieferte zwar dieselbe End-Position, ließe aber offen, ob die
 * Schwelle überhaupt erreicht wurde.
 */
async function ziehe(page, karte, zielSpalteNr) {
  const von = await karte.boundingBox();
  const liste = await page
    .locator(`${SPALTEN}[data-spalte="${zielSpalteNr}"] .kanban-spalte-karten`)
    .boundingBox();
  expect(von, 'Quell-Karte hat kein Rechteck').not.toBeNull();
  expect(liste, 'Ziel-Liste hat kein Rechteck').not.toBeNull();
  const nachX = liste.x + liste.width / 2;
  const nachY = liste.y + liste.height - 4;
  await page.mouse.move(von.x + von.width / 2, von.y + von.height / 2);
  await page.mouse.down();
  await page.mouse.move(von.x + von.width / 2 + 12, von.y + von.height / 2 + 12, { steps: 4 });
  await page.mouse.move(nachX, nachY, { steps: 12 });
  await page.mouse.up();
}

test.describe('KB-06: Karte zwischen Spalten ziehen (F-314)', () => {
  test('das Hineinziehen hakt ab, das Herausziehen nimmt es zurück', async () => {
    const dir = machVerzeichnis();
    const datei = path.join(dir, 'Zug.md');
    fs.writeFileSync(datei, TAFEL_TEXT, 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(`${SPALTEN}[data-spalte="0"] .kanban-karte`)).toHaveCount(3);
      await expect(page.locator(`${SPALTEN}[data-spalte="1"] .kanban-karte`)).toHaveCount(0);

      // --- Hineinziehen in die abhakende Spalte -----------------------------
      await ziehe(page, page.locator(`${KARTEN}[data-spalte="0"][data-karte="0"]`), 1);
      await expect(page.locator(`${SPALTEN}[data-spalte="1"] .kanban-karte`)).toHaveCount(1);
      await expect(page.locator(`${SPALTEN}[data-spalte="1"] .kanban-karte`)).toHaveClass(
        /kanban-karte-erledigt/,
      );
      let text = await speichere(app, datei, (t) => /## Fertig[\s\S]*- \[x\] Vorher/.test(t));
      expect(kartenZeilen(text, 'Offen').map((z) => z.slice(0, 12))).toEqual([
        '- [ ] Waesch',
        '- [ ] Nachhe',
      ]);
      expect(kartenZeilen(text, 'Fertig')).toHaveLength(1);
      expect(kartenZeilen(text, 'Fertig')[0]).toMatch(/^- \[x\] Vorher/);

      // --- Herausziehen nimmt das Abhaken zurück ----------------------------
      await ziehe(page, page.locator(`${KARTEN}[data-spalte="1"][data-karte="0"]`), 0);
      await expect(page.locator(`${SPALTEN}[data-spalte="1"] .kanban-karte`)).toHaveCount(0);
      await expect(page.locator(`${SPALTEN}[data-spalte="0"] .kanban-karte`)).toHaveCount(3);
      text = await speichere(app, datei, (t) => !/- \[x\] Vorher/.test(t));
      expect(kartenZeilen(text, 'Fertig')).toEqual([]);
      const offen = kartenZeilen(text, 'Offen');
      expect(offen).toHaveLength(3);
      expect(offen[2]).toBe('- [ ] Vorher');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('KB-07: Folge-Instanz einer wiederholenden Karte (F-314)', () => {
  test('die Instanz steht in der Quell-Spalte, die abgehakte Karte in der Ziel-Spalte', async () => {
    const dir = machVerzeichnis();
    const datei = path.join(dir, 'Wiederholung.md');
    fs.writeFileSync(datei, TAFEL_TEXT, 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneTafel(app, page);
      await macheAenderbar(page);
      await expect(page.locator(`${SPALTEN}[data-spalte="0"] .kanban-karte`)).toHaveCount(3);

      // Die mittlere, wiederholende Karte in die abhakende Spalte ziehen.
      await ziehe(page, page.locator(`${KARTEN}[data-spalte="0"][data-karte="1"]`), 1);
      // Die Quell-Spalte behält ihre drei Karten: Für die abgehakte ist die
      // Folge-Instanz nachgerückt.
      await expect(page.locator(`${SPALTEN}[data-spalte="0"] .kanban-karte`)).toHaveCount(3);
      await expect(page.locator(`${SPALTEN}[data-spalte="1"] .kanban-karte`)).toHaveCount(1);

      const text = await speichere(app, datei, (t) => t.includes('2026-01-02'));
      const offen = kartenZeilen(text, 'Offen');
      expect(offen).toHaveLength(3);
      expect(offen[0]).toBe('- [ ] Vorher');
      // Die Instanz steht an der Stelle, an der die gezogene Karte stand.
      expect(offen[1]).toMatch(/^- \[ \] Waesche .*📅 2026-01-02/);
      expect(offen[2]).toBe('- [ ] Nachher');
      const fertig = kartenZeilen(text, 'Fertig');
      expect(fertig).toHaveLength(1);
      expect(fertig[0]).toMatch(/^- \[x\] Waesche .*📅 2026-01-01/);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
