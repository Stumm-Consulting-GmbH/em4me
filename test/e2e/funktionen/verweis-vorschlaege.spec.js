// 4T-1339 (Epic 3E-0238): Reihenfolge und Auswahl der Verweis-Vorschlaege nach
// `[[` — gemessen an der **angezeigten** Liste.
//
// Warum auf dieser Ebene: Die Auswahl-Regel in src/shared/wiki-vorschlaege.js
// ist unit-geprueft und war es auch, als der Befund entstand. Der Fehler lag
// eine Stufe weiter, im Zusammenspiel mit der Vervollstaendigungs-Bibliothek,
// die die uebergebene Reihenfolge neu sortierte. Eine Pruefung der Funktion
// dahinter kann ihn deshalb nicht fangen; diese hier misst, was im Dropdown
// steht.
//
// Szenario-Treue: Der Product Owner hat den Befund am 2026-09-01 an der
// ausgelieferten 1.123.0 gemeldet, indem er in einem Bereich `[[` tippte und
// die zuletzt bearbeiteten Dateien nicht zuoberst fand. VV-01 stellt genau
// diesen Ablauf nach — frisch getipptes `[[` ohne weitere Eingabe.
//
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json (F-040).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const TOOLTIP = '.cm-tooltip-autocomplete';
const LABEL = '.cm-tooltip-autocomplete .cm-completionLabel';
const HERVORHEBUNG = '.cm-tooltip-autocomplete .cm-completionMatchedText';

// Vier Ziele mit bewusst gegenlaeufiger Alphabet- und Zeit-Folge: Wer nach
// Namen ordnet, bekommt Alpha, Beta, Delta, Gamma; wer nach Aenderungszeit
// ordnet, bekommt Delta, Gamma, Beta, Alpha. Jede Verwechslung der beiden
// Regeln ist damit an der ersten Zeile der Liste sichtbar.
const ZIELE_ALT_NACH_NEU = ['Alpha', 'Beta', 'Gamma', 'Delta'];

// Die geoeffnete Datei steht selbst mit in der Liste. Ihr Name traegt bewusst
// kein 'a', damit sie die Eingabe-Faelle unten nicht mittraegt.
const NOTIZ = 'Notiz';

// Feste Zeitpunkte statt Schreib-Reihenfolge: Die Aenderungszeit ist der
// Gegenstand der Pruefung und darf nicht davon abhaengen, wie schnell die
// Dateien nacheinander entstehen.
function setzeZeit(datei, tagVersatz) {
  const zeit = new Date(Date.UTC(2020, 0, 1 + tagVersatz, 12, 0, 0));
  fs.utimesSync(datei, zeit, zeit);
}

function schreibe(dir, name, tagVersatz) {
  const datei = path.join(dir, `${name}.md`);
  fs.writeFileSync(datei, `# ${name}\n\nInhalt von ${name}.\n`, 'utf8');
  setzeZeit(datei, tagVersatz);
  return datei;
}

// Kleiner Bereich: die geoeffnete Notiz (aelteste) und die vier Ziele.
function baueBereich(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const notiz = schreibe(dir, NOTIZ, 0);
  ZIELE_ALT_NACH_NEU.forEach((name, i) => schreibe(dir, name, i + 1));
  return { dir, notiz };
}

// Grosser Bereich: dieselben vier Ziele, dazu 30 juengere Fuell-Dateien. Damit
// liegen die vier ausserhalb des Anzeige-Fensters der Liste ohne Eingabe.
// Die Fuell-Namen tragen kein 'a', damit sie beim Tippen nicht mitlaufen.
function baueGrossenBereich(prefix) {
  const { dir, notiz } = baueBereich(prefix);
  for (let i = 1; i <= 30; i++) {
    schreibe(dir, `Fuellwert${String(i).padStart(2, '0')}`, 100 + i);
  }
  return { dir, notiz };
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

async function enterEditSource(app, page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  await sendMenuChannel(app, 'menu:viewChange', 'source');
  await expect(page.locator(SEL.editorContent0)).toBeVisible();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator('.pane-group[data-pane="0"] .pane-source-editor')).not.toHaveClass(
    /read-only/,
  );
  await page.keyboard.press('Control+End');
}

// B-18 (4T-0187): Der erste Trigger stoesst den Index-Aufbau an und liefert
// noch 'indexing'. Hier wird auf einer Wegwerf-Zeile so lange nachgetriggert,
// bis Vorschlaege erscheinen; danach ist die Zeile wieder leer und der
// eigentliche Ablauf beginnt gegen einen fertigen Index.
async function waermeIndexAuf(page) {
  const tooltip = page.locator(TOOLTIP);
  await page.keyboard.type('\n[[A');
  await expect
    .poll(
      async () => {
        if (await tooltip.first().isVisible()) return true;
        await page.keyboard.press('Backspace');
        await page.keyboard.type('A');
        return tooltip.first().isVisible();
      },
      { timeout: 30000, intervals: [400] },
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await expect(tooltip.first()).toBeHidden();
}

const beschriftungen = async (page, anzahl) =>
  (await page.locator(LABEL).allTextContents()).slice(0, anzahl);

test.describe('VV-01: Verweis-Vorschlaege ohne Eingabe folgen der Aenderungszeit', () => {
  test('nach [[ steht die zuletzt geaenderte Datei zuoberst', async () => {
    const { dir, notiz } = baueBereich('em4me-vv01-');
    const { app, page, userData } = await launchApp({ args: [notiz] });
    try {
      await enterEditSource(app, page);
      await waermeIndexAuf(page);

      // Der gemeldete Ablauf: `[[` tippen, sonst nichts.
      await page.keyboard.type('[[');
      await expect(page.locator(TOOLTIP).first()).toBeVisible({ timeout: 10000 });

      // Erwartet ist die umgekehrte Alphabet-Folge. Stuende hier
      // Alpha, Beta, Delta, Gamma, haette die Bibliothek wieder selbst
      // sortiert — das ist der Befund vom 2026-09-01.
      expect(await beschriftungen(page, 4)).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha']);

      // Die Uebernahme haengt jetzt an einem Ergebnis ohne `to`-Angabe; sie
      // schreibt die schliessenden Klammern unveraendert mit (4T-1307).
      // Die Bibliothek weist eine Uebernahme innerhalb von 75 ms nach dem
      // Oeffnen ab (interactionDelay, Schutz vor versehentlichem Annehmen);
      // ein Mensch ist nie so schnell, die Tastatur-Automatik hier schon.
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter');
      await expect(page.locator(SEL.editorContent0)).toContainText('[[Delta]]');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('VV-02: Eingabe verkleinert die Liste auf alle passenden Ziele', () => {
  test('ein Ziel ausserhalb der juengsten Dateien bleibt auffindbar', async () => {
    // Die Liste ohne Eingabe zeigt hoechstens 30 Eintraege. Bis 4T-1339
    // filterte die Bibliothek beim Tippen nur innerhalb dieser 30, sodass ein
    // aelteres Ziel durch Eingabe nicht mehr erreichbar war.
    const { dir, notiz } = baueGrossenBereich('em4me-vv02-');
    const { app, page, userData } = await launchApp({ args: [notiz] });
    try {
      await enterEditSource(app, page);
      await waermeIndexAuf(page);

      await page.keyboard.type('[[');
      await expect(page.locator(TOOLTIP).first()).toBeVisible({ timeout: 10000 });
      // Ohne Eingabe fuehren die 30 juengeren Fuell-Dateien.
      expect((await beschriftungen(page, 1))[0]).toMatch(/^Fuellwert/);

      await page.keyboard.type('alpha');
      await expect(page.locator(LABEL)).toHaveCount(1, { timeout: 10000 });
      expect(await beschriftungen(page, 1)).toEqual(['Alpha']);

      // Und beim Loeschen waechst sie wieder auf die passenden Ziele an:
      // zurueck von 'alpha' auf 'a', das alle vier Ziele trifft.
      for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
      await expect(page.locator(LABEL)).toHaveCount(4, { timeout: 10000 });
      expect(await beschriftungen(page, 4)).toEqual(['Alpha', 'Delta', 'Gamma', 'Beta']);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('VV-03: mit Eingabe fuehrt die Treffer-Guete', () => {
  test('Prefix-Treffer vor Teiltreffer, danach die Aenderungszeit', async () => {
    const { dir, notiz } = baueBereich('em4me-vv03-');
    const { app, page, userData } = await launchApp({ args: [notiz] });
    try {
      await enterEditSource(app, page);
      await waermeIndexAuf(page);

      await page.keyboard.type('[[a');
      await expect(page.locator(TOOLTIP).first()).toBeVisible({ timeout: 10000 });

      // 'Alpha' trifft am Anfang und steht oben, obwohl es die aelteste der
      // vier Dateien ist; unter den Teiltreffern entscheidet die
      // Aenderungszeit, nicht das Alphabet.
      expect(await beschriftungen(page, 4)).toEqual(['Alpha', 'Delta', 'Gamma', 'Beta']);

      // Die getroffenen Zeichen bleiben hervorgehoben. Ohne die Eigensortierung
      // der Bibliothek rechnet sie die Hervorhebung nicht mehr selbst aus;
      // getMatch liefert sie nach.
      await expect(page.locator(HERVORHEBUNG).first()).toBeVisible();
      expect((await page.locator(HERVORHEBUNG).first().textContent()).toLowerCase()).toBe('a');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
