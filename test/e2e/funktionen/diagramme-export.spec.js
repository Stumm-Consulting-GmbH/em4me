// 4T-002025 (Epic 3E-000192, Story 4S-001026): Ablauf-Prüfdatei der Diagramme
// zu Tabellen im portablen Export. describe-Titel tragen die Fall-Kennungen
// DX-01 ….
//
// Vorbild ist test/e2e/funktionen/mermaid-export.spec.js: geprüft wird an der
// geschriebenen Datei UND an ihrer Anzeige nach dem erneuten Öffnen, denn
// zwischen beiden liegt der Whitelist-Sanitizer (Test-Strategie, Kapitel 5.3,
// Prüfung am Lese-Ende). Der native Speichern-Dialog ist per Playwright nicht
// bedienbar und wird im Hauptprozess durch einen festen Zielpfad ersetzt; der
// Dialog selbst bleibt manuelle Prüfung.
//
// Hell: Die Anwendung läuft in DX-01 im dunklen Modus; die Bilder tragen den
// Hintergrund und die Reihen-Farben des hellen Standard-Schemas und keine der
// dunklen Reihen-Farben.
//
// 4T-002072 (Epic 3E-000192): DX-09 prüft den Namen der Datentabelle aus ihrer
// Kopf-Angabe `table:` — als Zeile `^Umsatz` hinter der Tabelle im Export und
// als Kennung ohne sichtbaren Text nach dem erneuten Öffnen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { BASE_DEFAULTS } = require('../../../src/shared/color-schemes.js');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const HELL = BASE_DEFAULTS.light;
const DUNKEL = BASE_DEFAULTS.dark;
const STANDARD = {
  language: 'de',
  colorSchemes: { custom: [], activeLight: 'standard-light', activeDark: 'standard-dark' },
};

const Z = '`'.repeat(3);
const ZL = '`'.repeat(4);
const BILD_KOPF = String.fromCharCode(60) + 'img alt="Diagramm zu einer Tabelle"';
const BILD_TRENNER = 'src="data:image/svg+xml;base64,';

const TABELLE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number, Ausgaben:number',
  '| Januar  | 100 | 80 |',
  '| Februar | 90  | 95 |',
  '| März    | 120 | -70 |',
  Z,
  '^umsatz',
].join('\n');

function diagramm(table, ...angaben) {
  return [`${Z}perspective-chart`, `table: ${table}`, ...angaben, Z].join('\n');
}
const BALKEN = (t) =>
  diagramm(t, 'type: bar', 'title: Umsatz', 'labels: Monat', 'values: Einnahmen, Ausgaben');
const DONUT = (t) => diagramm(t, 'type: donut', 'labels: Monat', 'values: Einnahmen');
const LINIE = (t) => diagramm(t, 'type: line', 'labels: Monat', 'values: Einnahmen, Ausgaben');
// Nicht zeichenbar: Ein Kreis verträgt keinen negativen Wert.
const KREIS_NEGATIV = (t) => diagramm(t, 'type: pie', 'labels: Monat', 'values: Ausgaben');

const DOKUMENT = [
  '# Ausgabe',
  TABELLE,
  BALKEN('^umsatz'),
  'Zwischen den Diagrammen.',
  DONUT('^umsatz'),
  LINIE('^umsatz'),
  KREIS_NEGATIV('^umsatz'),
  `${Z}js\nconst a = 1;\n${Z}`,
  'Schluss.',
].join('\n\n');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-diagramme-dx-'));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, text) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, text, 'utf8');
  return datei;
}

// Alle eingebrannten Bilder einer exportierten Datei, als entschlüsselte SVG.
function eingebrannteBilder(inhalt) {
  const out = [];
  let pos = 0;
  for (;;) {
    const i = inhalt.indexOf(BILD_TRENNER, pos);
    if (i < 0) break;
    const ende = inhalt.indexOf(String.fromCharCode(34), i + BILD_TRENNER.length);
    out.push(Buffer.from(inhalt.slice(i + BILD_TRENNER.length, ende), 'base64').toString('utf8'));
    pos = ende;
  }
  return out;
}

async function stubSaveDialog(app, zielPfad) {
  await hauptSenden(
    app,
    ({ dialog }, ziel) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: ziel });
    },
    zielPfad,
  );
}

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

async function exportiere(app, page, zielPfad) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
  if (fs.existsSync(zielPfad)) fs.rmSync(zielPfad);
  await stubSaveDialog(app, zielPfad);
  await sendMenuChannel(app, 'menu:exportPortable');
  await expect.poll(() => fs.existsSync(zielPfad), { timeout: 30000 }).toBe(true);
  await expect
    .poll(() => fs.readFileSync(zielPfad, 'utf8').includes('Schluss.'), { timeout: 30000 })
    .toBe(true);
  return fs.readFileSync(zielPfad, 'utf8');
}

async function dunkel(page) {
  await page.evaluate(() => window.api.setThemePref('dark'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

async function bearbeiteQuelltext(page, pane) {
  await page.locator(SEL.viewBtn('source')).click();
  await page.locator(SEL.btnEdit).click();
  await expect(page.locator(pane.editorContent)).toHaveAttribute('contenteditable', 'true');
}

// Einnahmen der Januar-Zeile ändern, ohne zu speichern (Muster DF-02).
async function januarEinnahmen(page, editor, alt, neu) {
  const zeile = page.locator(`${editor} .cm-line`, { hasText: 'Januar' });
  await zeile.click();
  await page.keyboard.press('End');
  const rest = `${alt} | 80 |`;
  for (let i = 0; i < rest.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type(`${neu} | 80 |`);
}

test.describe('DX-01: Bilder hell, Tabelle bleibt Tabelle, nicht zeichenbarer Block bleibt (F-332)', () => {
  test('dunkles Farbschema: drei helle Bilder, Tabelle, Kreis-Block byte-gleich (AK4 bis AK6, AK8, AK11, AK12, AK14)', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', DOKUMENT);
    const vorher = fs.readFileSync(datei);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await dunkel(page);
      const inhalt = await exportiere(app, page, path.join(dir, 'export.md'));
      const bilder = eingebrannteBilder(inhalt);
      // AK11, AK14: Balken mit zwei Reihen, Donut und Linie, jedes an seiner Stelle.
      expect(bilder).toHaveLength(3);
      expect(inhalt.split(BILD_KOPF)).toHaveLength(4);
      const posBalken = inhalt.indexOf(BILD_KOPF);
      expect(posBalken).toBeLessThan(inhalt.indexOf('Zwischen den Diagrammen.'));
      expect(inhalt.indexOf(BILD_KOPF, posBalken + 1)).toBeGreaterThan(
        inhalt.indexOf('Zwischen den Diagrammen.'),
      );
      // AK5: hell trotz dunklem Modus — Hintergrund, Text, erste Reihen-Farbe.
      for (const svg of bilder) {
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain(`fill="${HELL.bg}"`);
        expect(svg).toContain(HELL.chart1);
        expect(svg).not.toContain(DUNKEL.chart1);
      }
      expect(bilder[0]).toContain(HELL.chart2);
      // Kein inline SVG: Es steht verschlüsselt in der Bild-Adresse.
      expect(inhalt).not.toContain('<svg ');
      // AK6: Die Tabelle ist eine Tabelle, kein Bild.
      expect(inhalt).toContain('<table');
      expect(inhalt).toContain('Januar');
      // AK8: der nicht zeichenbare Kreis bleibt Zeichen für Zeichen stehen.
      expect(inhalt).toContain(KREIS_NEGATIV('^umsatz'));
      // Fremde Blöcke bleiben, wie sie sind.
      expect(inhalt).toContain(`${Z}js\nconst a = 1;\n${Z}`);
      // AK12: Das Dokument ist unverändert und nicht als geändert markiert.
      expect(fs.readFileSync(datei).equals(vorher)).toBe(true);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-02: Die exportierte Datei zeigt ihre Diagramme (F-332)', () => {
  test('beim erneuten Öffnen erscheinen die Bilder nach dem Sanitizer (AK4, AK15)', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', DOKUMENT);
    const ziel = path.join(dir, 'export.md');
    const erste = await launchApp({ args: [datei], settings: STANDARD });
    try {
      const inhalt = await exportiere(erste.app, erste.page, ziel);
      expect(inhalt).toContain(BILD_KOPF);
    } finally {
      await closeApp(erste.app, erste.userData, { force: true });
    }

    const zweite = await launchApp({ args: [ziel], settings: STANDARD });
    try {
      const { app, page } = zweite;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const bilder = page.locator(`${SEL.markdownBody0} img[alt="Diagramm zu einer Tabelle"]`);
      await expect(bilder).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const quelle = await bilder.nth(i).getAttribute('src');
        expect(quelle.startsWith('data:image/svg+xml;base64,')).toBe(true);
        // Wirklich geladen, nicht nur im DOM.
        await expect
          .poll(() => bilder.nth(i).evaluate((el) => el.complete && el.naturalWidth > 0), {
            timeout: 15000,
          })
          .toBe(true);
      }
      await expect(page.locator(`${SEL.markdownBody0} table`).first()).toBeVisible();
    } finally {
      await closeApp(zweite.app, zweite.userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-03: Der Stand im Augenblick der Ausgabe (F-332)', () => {
  test('ungespeicherte Änderung im eigenen Dokument (AK9, AK12)', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      const vorher = eingebrannteBilder(await exportiere(app, page, path.join(dir, 'a.md')));
      await bearbeiteQuelltext(page, SEL.pane(0));
      await januarEinnahmen(page, SEL.editorContent0, '100', '5000');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
      const nachher = eingebrannteBilder(await exportiere(app, page, path.join(dir, 'b.md')));
      expect(nachher).toHaveLength(3);
      // Das Balken-Diagramm zeigt den geänderten Wert: eine andere Grafik.
      expect(nachher[0]).not.toBe(vorher[0]);
      // Die Datei bleibt, wie sie war; der Reiter bleibt ungespeichert.
      expect(fs.readFileSync(datei, 'utf8')).toBe(DOKUMENT);
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });

  test('Tabelle in einem anderen Dokument, dort ungespeichert geändert (AK10)', async () => {
    const dir = makeDir();
    const quelle = ['# Quelle', '', TABELLE, '', 'Schluss.', ''].join('\n');
    const dateiQ = schreibe(dir, 'Quelle.md', quelle);
    const uebersicht = ['# Übersicht', '', BALKEN('[[Quelle#^umsatz]]'), '', 'Schluss.', ''].join(
      '\n',
    );
    const dateiU = schreibe(dir, 'Übersicht.md', uebersicht);
    const { app, page, userData } = await launchApp({
      args: [dateiU, dateiQ],
      settings: STANDARD,
    });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await page.locator(SEL.tabs0, { hasText: 'Übersicht' }).first().click();
      const vorher = eingebrannteBilder(await exportiere(app, page, path.join(dir, 'a.md')));
      expect(vorher).toHaveLength(1);

      await page.locator(SEL.tabs0, { hasText: 'Quelle' }).first().click();
      await bearbeiteQuelltext(page, SEL.pane(0));
      await januarEinnahmen(page, SEL.editorContent0, '100', '5000');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      await page.locator(SEL.tabs0, { hasText: 'Übersicht' }).first().click();
      // Der geschriebene Stand der Quelle erreicht das andere Dokument
      // entprellt (Melde-Plan des Editors); die Ausgabe nimmt den Stand, den
      // das Diagramm zeigt. Deshalb erst warten, bis die Anzeige ihn zeigt.
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect
        .poll(
          () =>
            page
              .locator(`${SEL.markdownBody0} .perspective-chart[data-chart-state="drawn"] svg text`)
              .allTextContents(),
          { timeout: 15000 },
        )
        .toContain('5000');
      const nachher = eingebrannteBilder(await exportiere(app, page, path.join(dir, 'b.md')));
      expect(nachher).toHaveLength(1);
      expect(nachher[0]).not.toBe(vorher[0]);
      expect(nachher[0]).toContain('>5000</text>');
      expect(fs.readFileSync(dateiQ, 'utf8')).toBe(quelle);
      expect(fs.readFileSync(dateiU, 'utf8')).toBe(uebersicht);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-04: Aus-Zustand der Erweiterung (F-332)', () => {
  test('ohne die Diagramm-Erweiterung bleibt jeder Block Code (AK13)', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', DOKUMENT);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.evaluate(() =>
        window.api.setSetting('extensions.disabled', ['perspective-chart']),
      );
      const inhalt = await exportiere(app, page, path.join(dir, 'export.md'));
      expect(eingebrannteBilder(inhalt)).toHaveLength(0);
      expect(inhalt).toContain(BALKEN('^umsatz'));
      expect(inhalt).toContain(DONUT('^umsatz'));
      expect(inhalt).toContain(KREIS_NEGATIV('^umsatz'));
    } finally {
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-05: Unabhängig vom Ansichts-Modus (F-332)', () => {
  test('aus der Quelltext-Ansicht entstehen dieselben Bilder, das Dokument bleibt unverändert (AK12)', async () => {
    const dir = makeDir();
    const datei = schreibe(dir, 'Diagramme.md', DOKUMENT);
    const vorher = fs.readFileSync(datei);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      const lese = eingebrannteBilder(await exportiere(app, page, path.join(dir, 'a.md')));
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(`${SEL.editorContent0} .perspective-chart`)).toHaveCount(0);
      const quelltext = eingebrannteBilder(await exportiere(app, page, path.join(dir, 'b.md')));
      expect(quelltext).toHaveLength(3);
      expect(quelltext).toEqual(lese);
      expect(fs.readFileSync(datei).equals(vorher)).toBe(true);
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-06: Diagramm in einer Karte einer Canvas-Fläche (F-332)', () => {
  // Entscheidung vom 2026-09-30: Der Export zeigt für ein Diagramm in einer
  // Karte dasselbe wie die Canvas-Ansicht. Aufgelöst wird gegen den Text der
  // Karte: Eine Tabelle derselben Karte ergibt ein Bild, eine Tabelle, die
  // allein im Dokument außerhalb der Karte steht, lässt den Block stehen. Der
  // Block des Dokuments mit demselben Inhalt wird dagegen gezeichnet.
  test('Tabelle in derselben Karte wird Bild, Tabelle nur im Dokument lässt den Block stehen', async () => {
    const dir = makeDir();
    const karteTabelle = TABELLE.replace('| 100 |', '| 400 |');
    const flaeche = [
      `${ZL}perspective-canvas`,
      '!karte k1 x=0 y=0 b=320 h=260',
      'Karte ohne eigene Tabelle',
      '',
      BALKEN('^umsatz'),
      '!karte k2 x=400 y=0 b=320 h=400',
      'Karte mit eigener Tabelle',
      '',
      karteTabelle,
      '',
      BALKEN('^umsatz'),
      ZL,
    ].join('\n');
    const text = ['# Fläche', TABELLE, BALKEN('^umsatz'), flaeche, 'Schluss.', ''].join('\n\n');
    const datei = schreibe(dir, 'Fläche.md', text);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      const inhalt = await exportiere(app, page, path.join(dir, 'export.md'));
      const bilder = eingebrannteBilder(inhalt);
      // Das Diagramm des Dokuments und das der zweiten Karte.
      expect(bilder).toHaveLength(2);
      // Die zweite Karte zeichnet ihre eigenen Werte, nicht die des Dokuments.
      expect(bilder[1]).not.toBe(bilder[0]);
      // Die erste Karte behält ihren Block, Zeichen für Zeichen.
      expect(inhalt.split(BALKEN('^umsatz'))).toHaveLength(2);
      expect(inhalt.indexOf(BALKEN('^umsatz'))).toBeGreaterThan(
        inhalt.indexOf('Karte ohne eigene Tabelle'),
      );
      // Keine Marke des Exports bleibt in der Datei.
      expect(inhalt).not.toContain('perspective-chart-karte-');
      // Die Tabellen bleiben Tabellen (AK6).
      expect(inhalt.split('<table')).toHaveLength(3);
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// Durchsicht vom 2026-09-30 (D5): Die übrigen Fälle zeichnen Balken, Donut und
// Linie; ein Kreis kam nur als nicht zeichenbarer Block vor.
test.describe('DX-07: Ein gezeichnetes Kreis-Diagramm (F-332)', () => {
  const KREIS = (t) => diagramm(t, 'type: pie', 'labels: Monat', 'values: Einnahmen');

  test('wird ein helles Bild mit einem Stück je Monat, der Block verschwindet (AK4, AK5, AK11)', async () => {
    const dir = makeDir();
    const text = ['# Kreis', TABELLE, KREIS('^umsatz'), 'Schluss.', ''].join('\n\n');
    const datei = schreibe(dir, 'Kreis.md', text);
    const { app, page, userData } = await launchApp({ args: [datei], settings: STANDARD });
    try {
      await dunkel(page);
      const inhalt = await exportiere(app, page, path.join(dir, 'export.md'));
      const bilder = eingebrannteBilder(inhalt);
      expect(bilder).toHaveLength(1);
      const [svg] = bilder;
      expect(svg).toMatch(/<desc[^>]*>Kreisdiagramm /);
      expect(svg).toContain(`fill="${HELL.bg}"`);
      // Drei Monate, drei Stücke in den ersten drei hellen Reihen-Farben.
      for (const farbe of [HELL.chart1, HELL.chart2, HELL.chart3]) expect(svg).toContain(farbe);
      for (const farbe of [DUNKEL.chart1, DUNKEL.chart2, DUNKEL.chart3]) {
        expect(svg).not.toContain(farbe);
      }
      expect(inhalt).not.toContain('perspective-chart');
      expect(inhalt).toContain('<table');
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-08: Zeile der ausgelassenen Werte unter dem Bild (F-332)', () => {
  // Entscheidung des Product Owners vom 2026-09-30: Musste das Diagramm Werte
  // auslassen, steht im portablen Export unter dem Bild dieselbe Zeile wie am
  // Bildschirm — eine leere Zelle und ein Text in einer Zahl-Spalte ergeben
  // zwei ausgelassene Werte.
  test('die Datei trägt Bild und Zeile, wieder geöffnet zeigt sie beides', async () => {
    const dir = makeDir();
    const luecken = [
      `${Z}perspective-datatable`,
      'columns: Monat:text, Einnahmen:number, Ausgaben:number',
      '| Januar  | 100  | 80 |',
      '| Februar |      | 95 |',
      '| März    | viel | 70 |',
      Z,
      '^luecken',
    ].join('\n');
    const balken = diagramm('^luecken', 'type: bar', 'labels: Monat', 'values: Einnahmen');
    const text = ['# Lücken', luecken, balken, 'Schluss.', ''].join('\n\n');
    const datei = schreibe(dir, 'Lücken.md', text);
    const ziel = path.join(dir, 'export.md');
    const satz = '2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind.';
    const zeile =
      '*2 Werte wurden ausgelassen, weil ihre Zellen leer oder nicht lesbar sind' + '\\.*';

    const erste = await launchApp({ args: [datei], settings: STANDARD });
    try {
      const { app, page } = erste;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      // Am Bildschirm: die Zeile unter dem gezeichneten Diagramm.
      const ansicht = page.locator(`${SEL.markdownBody0} .perspective-chart-omitted`);
      await expect(ansicht).toHaveText(satz, { timeout: 15000 });
      const inhalt = await exportiere(app, page, ziel);
      expect(eingebrannteBilder(inhalt)).toHaveLength(1);
      const zeilen = inhalt.split('\n');
      const i = zeilen.findIndex((z) => z.startsWith(BILD_KOPF));
      expect(zeilen.slice(i + 1, i + 3)).toEqual(['', zeile]);
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(erste.app, erste.userData, { force: true });
    }

    const zweite = await launchApp({ args: [ziel], settings: STANDARD });
    try {
      const { app, page } = zweite;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const bild = page.locator(`${SEL.markdownBody0} img[alt="Diagramm zu einer Tabelle"]`);
      await expect(bild).toHaveCount(1);
      await expect
        .poll(() => bild.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 15000 })
        .toBe(true);
      // Die Zeile steht als Text unter dem Bild, als eigener Absatz.
      const kursiv = page.locator(`${SEL.markdownBody0} p > em`, { hasText: 'ausgelassen' });
      await expect(kursiv).toHaveText(satz);
      const unterBild = await bild.evaluate((img) => {
        const alle = [...img.closest('.markdown-body').querySelectorAll('img, p')];
        const naechster = alle[alle.indexOf(img) + 1];
        return naechster ? naechster.textContent : null;
      });
      expect(unterBild).toBe(satz);
    } finally {
      await closeApp(zweite.app, zweite.userData, { force: true });
      cleanupDir(dir);
    }
  });
});

test.describe('DX-09: Name der Tabelle in der Kopf-Angabe table: (F-332)', () => {
  // 4T-002072 (Epic 3E-000192): Trägt die Datentabelle ihren Namen in der
  // Kopf-Angabe `table:`, steht im Export hinter der gewöhnlichen Tabelle eine
  // Leerzeile und die Zeile `^Umsatz`; das Diagramm, das den Namen ohne
  // Dach-Zeichen nennt, wird Bild. Wieder geöffnet ist die Zeile ein leerer
  // Träger der Kennung und kein sichtbarer Text.
  test('die Datei trägt Bild, Tabelle und ^Umsatz, wieder geöffnet ist der Name Kennung statt Text', async () => {
    const dir = makeDir();
    const tabelle = [
      `${Z}perspective-datatable`,
      'table: Umsatz',
      'columns: Monat:text, Einnahmen:number, Ausgaben:number',
      '| Januar  | 100 | 80 |',
      '| Februar | 90  | 95 |',
      Z,
    ].join('\n');
    const text = ['# Kopf-Name', tabelle, BALKEN('Umsatz'), 'Schluss.', ''].join('\n\n');
    const datei = schreibe(dir, 'Kopf-Name.md', text);
    const ziel = path.join(dir, 'export.md');

    const erste = await launchApp({ args: [datei], settings: STANDARD });
    try {
      const inhalt = await exportiere(erste.app, erste.page, ziel);
      expect(eingebrannteBilder(inhalt)).toHaveLength(1);
      expect(inhalt).toContain('</table>\n\n^Umsatz');
      expect(inhalt.indexOf('^Umsatz')).toBeLessThan(inhalt.indexOf(BILD_KOPF));
      expect(inhalt).not.toContain('table: Umsatz');
      expect(inhalt).not.toContain('perspective-datatable');
      expect(inhalt).not.toContain('perspective-chart');
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(erste.app, erste.userData, { force: true });
    }

    const zweite = await launchApp({ args: [ziel], settings: STANDARD });
    try {
      const { app, page } = zweite;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const bild = page.locator(`${SEL.markdownBody0} img[alt="Diagramm zu einer Tabelle"]`);
      await expect(bild).toHaveCount(1);
      await expect
        .poll(() => bild.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 15000 })
        .toBe(true);
      await expect(page.locator(`${SEL.markdownBody0} table`).first()).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} [id="Umsatz"]`)).toHaveCount(1);
      await expect(page.locator(SEL.markdownBody0)).not.toContainText('^Umsatz');
    } finally {
      await closeApp(zweite.app, zweite.userData, { force: true });
      cleanupDir(dir);
    }
  });
});
