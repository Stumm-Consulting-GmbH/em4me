// 4T-002164 (Epic 3E-000149): Ablauf-Faelle der Ausgaben des Foliensatzes
// (PDF und HTML-Seiten) und des Befehls «Neue Praesentation…» an der
// gestarteten Anwendung. Die Faelle der Ansicht, der Darstellung und der
// Vorfuehrung stehen in praesentation.spec.js.
//
// **Warum gegen die echte Anwendung.** Beide Ausgaben laufen ueber mehrere
// Prozesse und Module — Kommando in der Palette, Ziel-Dialog im Hauptprozess,
// gemeinsame Druck-Vorbereitung, Druck-Flaeche mit jeder Folie, Druck bzw.
// Seiten-Bau, Schreiben im Hauptprozess, Meldung in der Statusleiste —, und
// ein Unit-Fall sieht die Kette nicht. Vorbild ist html-export.spec.js (HE-01
// bis HE-08): Die Dialoge des Betriebssystems sind im Hauptprozess durch einen
// Stub ersetzt, ausgeloest wird ueber die Kommando-Palette (Registry und
// Dispatcher laufen mit), und jeder Fall endet an der Datei auf der Platte.
//
// **PDF-Pruefmittel.** Der Bestand hat kein PDF-Paket; die Seitenzahl wird
// wie in pdf-export.spec.js (PD-01) an den `/Type /Page`-Objekten gezaehlt,
// das Format an der ersten MediaBox.
//
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, S-163 bis
// S-165).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  warteAufDateiArgument,
  warteAufRendererBereit,
} = require('../helpers/app');
const { pressUntilVisible, pressNachfassend } = require('../helpers/eingabe');
const { warteAufText } = require('../helpers/dateien');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const FLAECHE = `${PANE0} .pane-presentation .praesentation-flaeche`;
const ZAEHLER = `${FLAECHE} .praesentation-zaehler`;
const ARTIKEL = `${FLAECHE} .praesentation-folie`;

const MODAL = '#command-palette-modal';
const FILTER = '#command-palette-filter';
const ITEM = '.command-palette-item';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

// Drei Folien im Theme `dark`, die zweite mit Hintergrund-Bild und einer
// Sprecher-Notiz, die in keiner Ausgabe erscheinen darf.
const FOLIENSATZ = [
  '---',
  'presentation: true',
  'theme: dark',
  '---',
  '',
  '# Erste Folie',
  '',
  '---',
  '',
  '## Zweite Folie',
  '',
  '![bg](bild.png)',
  '',
  '%% Geheime Sprecher-Notiz %%',
  '',
  '---',
  '',
  '## Dritte Folie',
  '',
];

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-2164-export-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibeFoliensatz(dir) {
  fs.writeFileSync(path.join(dir, 'bild.png'), PNG);
  const datei = path.join(dir, 'Vortrag.md');
  fs.writeFileSync(datei, FOLIENSATZ.join('\n'), 'utf8');
  return datei;
}

// Seitenzahl eines PDFs: Anzahl der /Type /Page-Objekte (ohne /Pages), wie
// in pdf-export.spec.js.
function pdfSeitenZahl(buffer) {
  const roh = buffer.toString('latin1');
  const treffer = roh.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return treffer ? treffer.length : 0;
}

// Erste MediaBox des PDFs: [Breite, Hoehe] in PDF-Punkten.
function pdfMediaBox(buffer) {
  const roh = buffer.toString('latin1');
  const m = roh.match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

// Die Dialoge im Hauptprozess ersetzen: Speichern (Ziel des PDFs und des
// unbenannten Dokuments) und Ordner-Wahl (Ziel der HTML-Seiten). Gezaehlt wird
// je Aufruf, damit ein Fall weiss, dass sein Weg gelaufen ist.
async function stubDialoge(app, { speichern = null, ordner = null } = {}) {
  await hauptSenden(
    app,
    ({ dialog }, a) => {
      globalThis.__dialogAufrufe = { speichern: 0, ordner: 0 };
      dialog.showSaveDialog = async () => {
        globalThis.__dialogAufrufe.speichern += 1;
        return { canceled: false, filePath: a.speichern };
      };
      dialog.showOpenDialog = async () => {
        globalThis.__dialogAufrufe.ordner += 1;
        return { canceled: false, filePaths: [a.ordner] };
      };
    },
    { speichern, ordner },
  );
}

function dialogAufrufe(app) {
  return hauptLesen(app, () => globalThis.__dialogAufrufe || { speichern: 0, ordner: 0 });
}

// Jede Meldung der Statusleiste mitschreiben (Muster HE-01): Die Meldung blendet
// nach wenigen Sekunden aus; die Mitschrift macht die Aussage davon unabhaengig.
async function zeichneMeldungenAuf(page) {
  await page.evaluate(() => {
    const hinweis = document.getElementById('statusbar-hint');
    window.__folienMeldungen = [];
    if (window.__folienBeobachter) window.__folienBeobachter.disconnect();
    window.__folienBeobachter = new MutationObserver(() => {
      window.__folienMeldungen.push(hinweis.textContent);
    });
    window.__folienBeobachter.observe(hinweis, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

async function folienMeldungen(page) {
  const alle = await page.evaluate(() => window.__folienMeldungen || []);
  return [...new Set(alle.filter((t) => t.includes('Foliensatz')))];
}

// Ein Kommando ueber die Kommando-Palette ausfuehren (Muster HE-01): Palette
// ueber den Menue-Kanal oeffnen — ein erneutes Senden bei offener Palette ist
// ohne Wirkung —, filtern, genau einen Treffer erwarten, einmal Enter.
async function fuehreAusUeberPalette(page, app, filter, name) {
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isVisible()) return true;
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:openCommandPalette');
      });
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
  await page.locator(FILTER).fill(filter);
  await expect(page.locator(ITEM)).toHaveCount(1);
  await expect(page.locator(`${ITEM} .command-palette-name`)).toHaveText(name);
  await page.keyboard.press('Enter');
  await expect(page.locator(MODAL)).toBeHidden();
}

async function oeffneFolien(page) {
  await pressUntilVisible(page, 'Control+8', page.locator(FLAECHE));
}

test.describe('PR-10: Foliensatz als PDF exportieren (S-164)', () => {
  test('eine Seite je Folie im Folien-Format, Meldung mit entfallener Notiz, Ansicht bleibt', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeFoliensatz(dir);
    const ziel = path.join(dir, 'Vortrag.pdf');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      await stubDialoge(app, { speichern: ziel });
      await zeichneMeldungenAuf(page);
      await fuehreAusUeberPalette(
        page,
        app,
        'Foliensatz als PDF',
        'Foliensatz als PDF exportieren…',
      );
      await expect.poll(async () => (await dialogAufrufe(app)).speichern).toBe(1);
      // Auf den Inhalt warten, nicht auf die Existenz (Stabilitaetsregel 12):
      // eine Seite je Folie.
      await expect
        .poll(() => (fs.existsSync(ziel) ? pdfSeitenZahl(fs.readFileSync(ziel)) : 0), {
          timeout: 30000,
        })
        .toBe(3);
      // Folien-Format 16:9 ohne Rand: 1280 × 720 CSS-Pixel = 960 × 540 Punkte.
      const box = pdfMediaBox(fs.readFileSync(ziel));
      expect(box).not.toBeNull();
      expect(Math.abs(box[0] - 960)).toBeLessThanOrEqual(2);
      expect(Math.abs(box[1] - 540)).toBeLessThanOrEqual(2);
      await expect
        .poll(() => folienMeldungen(page))
        .toContain('Foliensatz als PDF exportiert: 3 Folien (Sprecher-Notizen nicht enthalten)');
      // Die Ansicht steht danach wie vorher.
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      await expect(page.locator('body')).not.toHaveClass(/\bprinting\b/);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-11: Foliensatz als HTML-Seiten exportieren (S-165)', () => {
  test('Ordner mit index.html und folie-00N.html, ohne Notiz, mit Blätter-Leiste und Theme-Variablen', async () => {
    const dir = machVerzeichnis();
    const datei = schreibeFoliensatz(dir);
    const ordner = path.join(dir, 'ausgabe');
    fs.mkdirSync(ordner);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      await stubDialoge(app, { ordner });
      await zeichneMeldungenAuf(page);
      await fuehreAusUeberPalette(
        page,
        app,
        'Foliensatz als HTML',
        'Foliensatz als HTML exportieren…',
      );
      await expect.poll(async () => (await dialogAufrufe(app)).ordner).toBe(1);
      await expect
        .poll(() => folienMeldungen(page), { timeout: 30000 })
        .toContain(
          'Foliensatz als HTML exportiert: 3 Folien in „ausgabe“ (Sprecher-Notizen nicht enthalten)',
        );
      // Der leere Ordner nimmt die Seiten selbst auf.
      const seiten = {};
      for (const name of ['index.html', 'folie-001.html', 'folie-002.html', 'folie-003.html']) {
        seiten[name] = await warteAufText(path.join(ordner, name), '</html>', { timeout: 30000 });
      }
      expect(fs.readdirSync(ordner).sort()).toEqual([
        'folie-001.html',
        'folie-002.html',
        'folie-003.html',
        'index.html',
      ]);
      // Die Startseite zeigt die erste Folie.
      expect(seiten['index.html']).toBe(seiten['folie-001.html']);
      expect(seiten['folie-001.html']).toMatch(/<h1[^>]*>Erste Folie<\/h1>/);
      expect(seiten['folie-002.html']).toMatch(/<h2[^>]*>Zweite Folie<\/h2>/);
      for (const [name, html] of Object.entries(seiten)) {
        // Keine Notiz, Blaetter-Leiste vorhanden, Theme-Variablen im :root.
        expect(html, name).not.toContain('Geheime Sprecher-Notiz');
        expect(html, name).toContain('<nav class="praesentation-seite-nav"');
        expect(html, name).toMatch(/:root \{[^}]*--slide-background: #1e1e1e;/);
      }
      // Blaetter-Verweise an den Enden.
      expect(seiten['folie-001.html']).toContain('href="folie-002.html" rel="next"');
      expect(seiten['folie-001.html']).not.toContain('rel="prev"');
      expect(seiten['folie-002.html']).toContain('href="folie-001.html" rel="prev"');
      expect(seiten['folie-002.html']).toContain('href="folie-003.html" rel="next"');
      expect(seiten['folie-003.html']).toContain('href="folie-002.html" rel="prev"');
      expect(seiten['folie-003.html']).not.toContain('rel="next"');
      expect(seiten['folie-001.html']).toContain('1 / 3');
      // Das Hintergrund-Bild ist in die Seite eingebettet.
      expect(seiten['folie-002.html']).toMatch(
        /class="presentation-bg-bild[^"]*"[^>]*src="data:image\/png;base64,|src="data:image\/png;base64,[^"]*"[^>]*class="presentation-bg-bild/,
      );
      // Die Ansicht steht danach wie vorher.
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-12: Neue Präsentation anlegen (S-163)', () => {
  test('das Kommando legt ein Dokument mit Kennzeichen und drei Folien an und zeigt es als Folien', async () => {
    const dir = machVerzeichnis();
    const ziel = path.join(dir, 'Neue Präsentation.md');
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await stubDialoge(app, { speichern: ziel });
      // Nicht idempotent (jede Ausfuehrung legt ein Dokument an): genau einmal
      // ueber die Palette, nach der Bereitschaft der Oberflaeche. Die
      // Auslassungspunkte der Beschriftung sind offen (Hinweis in 4T-002163:
      // der Befehl fragt nach nichts); gegenstaendlich ist hier der Befehl.
      await fuehreAusUeberPalette(page, app, 'Neue Präsentation', /^Neue Präsentation…?$/);
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 3');
      await expect(page.locator(`${ARTIKEL} h1`)).toHaveText('Titel der Präsentation');
      await expect(page.locator(SEL.viewBtn('presentation'))).toHaveClass(/\bactive\b/);
      // Die zweite Folie zeigt ihre Liste, die Sprecher-Notiz nicht.
      await page.locator(FLAECHE).focus();
      await pressNachfassend(
        page,
        'ArrowRight',
        async () => (await page.locator(ZAEHLER).textContent()) === '2 / 3',
      );
      await expect(page.locator(ARTIKEL)).toContainText('Eine Folie mit Liste');
      await expect(page.locator(FLAECHE)).not.toContainText('Sprecher-Notiz');

      // Der Dokument-Text: Kennzeichen im Kopf, zwei Trenner, eine Notiz.
      await hauptSenden(app, ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:save');
      });
      const text = await warteAufText(ziel, 'presentation: true', { timeout: 15000 });
      const zeilen = text.split('\n');
      expect(zeilen.slice(0, 5)).toEqual([
        '---',
        'presentation: true',
        'theme: light',
        'paginate: true',
        '---',
      ]);
      expect(zeilen.slice(5).filter((z) => z === '---')).toHaveLength(2);
      expect(text).toContain('%% Sprecher-Notiz:');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
