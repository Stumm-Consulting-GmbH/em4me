// 4T-002296 (Epic 3E-000349): Ablauf-Faelle der PowerPoint-Datei und der
// Bilder des Foliensatzes an der gestarteten Anwendung. Die Ausgaben PDF und
// HTML-Seiten stehen in praesentation-export.spec.js (PR-10 bis PR-12, PR-22,
// PR-23); diese Datei setzt die Kennungen mit PR-24 fort.
//
// **Warum gegen die echte Anwendung.** Beide Exporte laufen ueber beide
// Prozesse und ein zweites, unsichtbares Fenster: Folien-Dokumente aus der
// Seite, Bilder aus dem Render-Fenster (4T-002292), Container (4T-002293) und
// Schreiben im Hauptprozess (4T-002294, 4T-002295). Ein Unit-Fall sieht die
// Kette nicht. Muster wie praesentation-export.spec.js: Dialoge im
// Hauptprozess ersetzt, Ausloesung ueber die Kommando-Palette, jeder
// schreibende Fall endet an der Datei auf der Platte.
//
// **Pruefmittel.** Das Archiv liest der strenge ZIP-Leser der Unit-Pruefdateien
// (test/unit/zip-leser-helfer.js: Verzeichnis, lokale Koepfe, inflateRawSync,
// Pruefsumme). Die Bild-Masse kommen aus dem Kopf des PNG; ob ein Bild mehr als
// eine Farbe traegt, zaehlt der Hauptprozess mit nativeImage an einer
// Stichprobe der Pixel.
//
// **Pruef-Vorlagen.** test/fixtures/presentation/pptx-export-probe.md (16:9,
// vier Folien: Formel mit zwei Notizen, Mermaid-Diagramm, Bild, Angaben je
// Folie mit einer Notiz) und pptx-export-probe-4zu3.md (4:3, zwei Folien, eine
// Notiz). Das Bild der dritten Folie ist das Demo-Bild der Anwendung, beim
// Lauf als bild.png neben die Vorlage kopiert.
//
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, F-363,
// S-170, F-364, S-171).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufDateiArgument } = require('../helpers/app');
const {
  pressUntilVisible,
  oeffneEinstellungsSeite,
  EINSTELLUNGS_SEITE,
} = require('../helpers/eingabe');
const { leseJsonOderNull } = require('../helpers/dateien');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { zipInhalt, liesZip } = require('../../unit/zip-leser-helfer.js');

const WURZEL = path.join(__dirname, '..', '..', '..');
const VORLAGEN = path.join(WURZEL, 'test', 'fixtures', 'presentation');
const DEMO_BILD = path.join(WURZEL, 'src', 'demo', 'attachments', 'demo-image.png');

const PANE0 = '.pane-group[data-pane="0"]';
const FLAECHE = `${PANE0} .pane-presentation .praesentation-flaeche`;
const ZAEHLER = `${FLAECHE} .praesentation-zaehler`;
const MODAL = '#command-palette-modal';
const FILTER = '#command-palette-filter';
const ITEM = '.command-palette-item';
const NAV = (id) => `${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="${id}"]`;

const PPTX_NAME = 'Foliensatz als PowerPoint exportieren…';
const BILDER_NAME = 'Foliensatz als Bilder exportieren…';

// Die Absaetze der Notizen je Folie der 16:9-Vorlage, wie sie im
// Notizen-Feld stehen (maskiert; '' ist ein leerer Absatz zwischen zwei Notizen).
const NOTIZEN_16_9 = [
  [
    'Erste Notiz der ersten Folie',
    '',
    'Zweite Notiz',
    'in zwei Zeilen mit **Markdown** und &lt;&amp;&gt;',
  ],
  [],
  [],
  ['Notiz der letzten Folie'],
];
const PPTX_MELDUNG_16_9 =
  'Foliensatz als PowerPoint exportiert: 4 Folien, 3 Sprecher-Notizen mitgegeben';

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-2296-export-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Die Pruef-Vorlage als Vortrag.md samt Bild in ein Wegwerf-Verzeichnis legen.
function legeVorlageAn(dir, vorlage = 'pptx-export-probe.md') {
  fs.copyFileSync(DEMO_BILD, path.join(dir, 'bild.png'));
  const datei = path.join(dir, 'Vortrag.md');
  fs.copyFileSync(path.join(VORLAGEN, vorlage), datei);
  return datei;
}

// Speichern- und Ordner-Dialog im Hauptprozess ersetzen; `null` als Ziel steht
// fuer einen abgebrochenen Dialog. Gezaehlt wird je Aufruf.
async function stubDialoge(app, { speichern = null, ordner = null } = {}) {
  await hauptSenden(
    app,
    ({ dialog }, a) => {
      globalThis.__dialogAufrufe = { speichern: 0, ordner: 0 };
      dialog.showSaveDialog = async () => {
        globalThis.__dialogAufrufe.speichern += 1;
        return a.speichern
          ? { canceled: false, filePath: a.speichern }
          : { canceled: true, filePath: '' };
      };
      dialog.showOpenDialog = async () => {
        globalThis.__dialogAufrufe.ordner += 1;
        return a.ordner
          ? { canceled: false, filePaths: [a.ordner] }
          : { canceled: true, filePaths: [] };
      };
    },
    { speichern, ordner },
  );
}

function dialogAufrufe(app) {
  return hauptLesen(app, () => globalThis.__dialogAufrufe || { speichern: 0, ordner: 0 });
}

// Jede Meldung der Statusleiste mitschreiben (Muster HE-01).
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

async function oeffnePalette(page, app) {
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
}

// Ein Kommando ueber die Kommando-Palette ausfuehren: filtern, genau einen
// Treffer erwarten, einmal Enter (nicht idempotent, deshalb ohne Wiederholung).
async function fuehreAusUeberPalette(page, app, filter, name) {
  await oeffnePalette(page, app);
  await page.locator(FILTER).fill(filter);
  await expect(page.locator(ITEM)).toHaveCount(1);
  await expect(page.locator(`${ITEM} .command-palette-name`)).toHaveText(name);
  await page.keyboard.press('Enter');
  await expect(page.locator(MODAL)).toBeHidden();
}

async function oeffneFolien(page) {
  await pressUntilVisible(page, 'Control+8', page.locator(FLAECHE));
}

// Breite und Hoehe aus dem IHDR-Kopf eines PNG; null, wenn es keines ist.
function pngMasse(daten) {
  const b = Buffer.from(daten);
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  if (b.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// Zahl verschiedener Farben einer Stichprobe der Pixel, im Hauptprozess mit
// nativeImage gezaehlt. Ein leeres oder einfarbiges Bild ergibt 1.
function farbZahl(app, daten) {
  return hauptLesen(
    app,
    ({ nativeImage }, a) => {
      const bild = nativeImage.createFromBuffer(Buffer.from(a.b64, 'base64'));
      const pixel = bild.toBitmap();
      const farben = new Set();
      for (let i = 0; i + 3 < pixel.length; i += 4 * 97) farben.add(pixel.readUInt32LE(i));
      return farben.size;
    },
    { b64: Buffer.from(daten).toString('base64') },
  );
}

// Die Absaetze des Notizen-Felds (Platzhalter `body`) einer Notizen-Folie.
function notizAbsaetze(xml) {
  const koerper = xml.match(/<p:ph type="body"[^>]*\/>[\s\S]*?<p:txBody>([\s\S]*?)<\/p:txBody>/);
  if (!koerper) return null;
  const absaetze = [...koerper[1].matchAll(/<a:p\/>|<a:p>([\s\S]*?)<\/a:p>/g)].map((m) =>
    m[1] === undefined ? '' : [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''),
  );
  // Eine Folie ohne Notiz traegt einen einzigen leeren Absatz.
  return absaetze.length === 1 && absaetze[0] === '' ? [] : absaetze;
}

// Die gespeicherte PowerPoint-Datei lesen: streng entpackt, Folien gezaehlt.
function liesPptx(ziel) {
  const roh = fs.readFileSync(ziel);
  const { eintraege } = liesZip(roh);
  const inhalt = zipInhalt(roh);
  const folien = [...inhalt.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return { eintraege, inhalt, folienZahl: folien.length };
}

function text(inhalt, name) {
  const daten = inhalt.get(name);
  return daten ? daten.toString('utf8') : null;
}

// PowerPoint-Export mit ersetztem Speichern-Dialog bis zur Abschluss-Meldung.
async function exportierePptx(page, app, ziel, meldung) {
  await stubDialoge(app, { speichern: ziel });
  await zeichneMeldungenAuf(page);
  await fuehreAusUeberPalette(page, app, 'Foliensatz als PowerPoint', PPTX_NAME);
  await expect.poll(async () => (await dialogAufrufe(app)).speichern).toBe(1);
  await expect.poll(() => folienMeldungen(page), { timeout: 60000 }).toContain(meldung);
  await expect.poll(() => fs.existsSync(ziel)).toBe(true);
}

// Notizen-Folien und Verweise der 16:9-Vorlage gegen die Erwartung halten.
function pruefeNotizen16zu9(inhalt) {
  NOTIZEN_16_9.forEach((erwartet, i) => {
    const nr = i + 1;
    const xml = text(inhalt, `ppt/notesSlides/notesSlide${nr}.xml`);
    expect(xml, `Notizen-Folie ${nr}`).not.toBeNull();
    expect(notizAbsaetze(xml), `Notizen der Folie ${nr}`).toEqual(erwartet);
    const rels = text(inhalt, `ppt/slides/_rels/slide${nr}.xml.rels`);
    expect(rels, `Verweise der Folie ${nr}`).toContain(
      `Target="../notesSlides/notesSlide${nr}.xml"`,
    );
  });
}

test.describe('PR-24: Foliensatz als PowerPoint exportieren (F-363, S-170)', () => {
  test('ZIP mit Inhaltstypen zuerst, eine Folie je Folie mit Bild 2560 × 1440, Notizen bei der richtigen Folie, Meldung', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir);
    const ziel = path.join(dir, 'Vortrag.pptx');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await exportierePptx(page, app, ziel, PPTX_MELDUNG_16_9);
      const { eintraege, inhalt, folienZahl } = liesPptx(ziel);
      expect(eintraege[0].name).toBe('[Content_Types].xml');
      expect(folienZahl).toBe(4);
      const praesentation = text(inhalt, 'ppt/presentation.xml');
      expect(praesentation).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
      for (let nr = 1; nr <= 4; nr += 1) {
        const rels = text(inhalt, `ppt/slides/_rels/slide${nr}.xml.rels`);
        expect(rels, `Folie ${nr}`).toContain(`Target="../media/image${nr}.png"`);
        expect(text(inhalt, `ppt/slides/slide${nr}.xml`)).toContain('<a:blip r:embed="rId2"/>');
        const bild = inhalt.get(`ppt/media/image${nr}.png`);
        expect(bild, `Bild der Folie ${nr}`).toBeTruthy();
        expect(pngMasse(bild), `Masse der Folie ${nr}`).toEqual([2560, 1440]);
      }
      expect(inhalt.has('ppt/media/image5.png')).toBe(false);
      // Kein Bild leer oder einfarbig: gemessen an Formel- und Diagramm-Folie.
      expect(await farbZahl(app, inhalt.get('ppt/media/image1.png'))).toBeGreaterThan(8);
      expect(await farbZahl(app, inhalt.get('ppt/media/image2.png'))).toBeGreaterThan(8);
      pruefeNotizen16zu9(inhalt);
      // Die Ansicht steht danach wie vorher.
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await expect(page.locator('body')).not.toHaveClass(/\bprinting\b/);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Den Schalter «Sprecher-Notizen mitgeben» (Einstellungs-Seite «Export»)
// einschalten und den gespeicherten Wert in der config.json abwarten.
async function schalteNotizenEin(page, userData) {
  await oeffneEinstellungsSeite(page);
  await page.locator(NAV('export')).click();
  const schalter = page.locator('#settings-export-folien-notizen');
  await expect(schalter).toBeVisible();
  await expect(schalter).not.toBeChecked();
  await schalter.check();
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();
  await expect
    .poll(() => {
      const konfig = leseJsonOderNull(path.join(userData, 'config.json')) || {};
      return Boolean(konfig.export && konfig.export.folien && konfig.export.folien.notizen);
    })
    .toBe(true);
}

test.describe('PR-25: PowerPoint-Export mit beiden Stellungen von «Sprecher-Notizen mitgeben» (F-363)', () => {
  test('ausgeschaltet wie eingeschaltet stehen dieselben Notizen in der Datei', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir);
    const zielAus = path.join(dir, 'Vortrag-aus.pptx');
    const zielEin = path.join(dir, 'Vortrag-ein.pptx');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      // Ausgeschaltet (Vorgabe).
      await exportierePptx(page, app, zielAus, PPTX_MELDUNG_16_9);
      const aus = liesPptx(zielAus).inhalt;
      pruefeNotizen16zu9(aus);
      // Eingeschaltet.
      await schalteNotizenEin(page, userData);
      await oeffneFolien(page);
      await exportierePptx(page, app, zielEin, PPTX_MELDUNG_16_9);
      const ein = liesPptx(zielEin).inhalt;
      pruefeNotizen16zu9(ein);
      for (let nr = 1; nr <= 4; nr += 1) {
        const name = `ppt/notesSlides/notesSlide${nr}.xml`;
        expect(text(ein, name), name).toBe(text(aus, name));
      }
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-26: PowerPoint-Export im Format 4:3 (F-363)', () => {
  test('Folien-Größe 9144000 × 6858000 EMU, Bilder 1920 × 1440, Meldung mit einer Notiz', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir, 'pptx-export-probe-4zu3.md');
    const ziel = path.join(dir, 'Vortrag.pptx');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
      await exportierePptx(
        page,
        app,
        ziel,
        'Foliensatz als PowerPoint exportiert: 2 Folien, 1 Sprecher-Notiz mitgegeben',
      );
      const { inhalt, folienZahl } = liesPptx(ziel);
      expect(folienZahl).toBe(2);
      expect(text(inhalt, 'ppt/presentation.xml')).toContain(
        '<p:sldSz cx="9144000" cy="6858000"/>',
      );
      for (let nr = 1; nr <= 2; nr += 1) {
        expect(pngMasse(inhalt.get(`ppt/media/image${nr}.png`)), `Folie ${nr}`).toEqual([
          1920, 1440,
        ]);
      }
      expect(notizAbsaetze(text(inhalt, 'ppt/notesSlides/notesSlide1.xml'))).toEqual([
        'Notiz der Folie im Format 4:3',
      ]);
      expect(notizAbsaetze(text(inhalt, 'ppt/notesSlides/notesSlide2.xml'))).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Bilder-Export mit ersetztem Ordner-Dialog bis zur Abschluss-Meldung.
async function exportiereBilder(page, app, ordner, meldung) {
  await stubDialoge(app, { ordner });
  await zeichneMeldungenAuf(page);
  await fuehreAusUeberPalette(page, app, 'Foliensatz als Bilder', BILDER_NAME);
  await expect.poll(async () => (await dialogAufrufe(app)).ordner).toBe(1);
  await expect.poll(() => folienMeldungen(page), { timeout: 60000 }).toContain(meldung);
}

const BILD_NAMEN = ['folie-001.png', 'folie-002.png', 'folie-003.png', 'folie-004.png'];

// Die Bilder eines Ordners: Namen und Masse, sobald alle vier geschrieben sind.
async function pruefeBilderOrdner(ordner) {
  await expect
    .poll(() =>
      fs.existsSync(ordner)
        ? fs
            .readdirSync(ordner)
            .filter((n) => n.endsWith('.png'))
            .sort()
        : [],
    )
    .toEqual(BILD_NAMEN);
  for (const name of BILD_NAMEN) {
    await expect
      .poll(() => pngMasse(fs.readFileSync(path.join(ordner, name))), { message: name })
      .toEqual([2560, 1440]);
  }
}

test.describe('PR-27: Foliensatz als Bilder in einen leeren Ordner (F-364, S-171)', () => {
  test('folie-001.png bis folie-004.png direkt im Ordner, je 2560 × 1440, Meldung mit Zahl und Ordner', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir);
    const ordner = path.join(dir, 'ausgabe');
    fs.mkdirSync(ordner);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await exportiereBilder(
        page,
        app,
        ordner,
        'Foliensatz als Bilder exportiert: 4 Bilder in „ausgabe“',
      );
      await pruefeBilderOrdner(ordner);
      expect(fs.readdirSync(ordner).sort()).toEqual(BILD_NAMEN);
      expect(
        await farbZahl(app, fs.readFileSync(path.join(ordner, 'folie-002.png'))),
      ).toBeGreaterThan(8);
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/\bprinting\b/);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-28: Foliensatz als Bilder in einen Ordner mit fremder Datei (F-364)', () => {
  test('Unterordner «Vortrag-Folien» nimmt die Bilder auf, die fremde Datei bleibt unberührt', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir);
    const ordner = path.join(dir, 'ausgabe');
    fs.mkdirSync(ordner);
    const fremd = path.join(ordner, 'fremd.txt');
    fs.writeFileSync(fremd, 'fremder Inhalt', 'utf8');
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await exportiereBilder(
        page,
        app,
        ordner,
        'Foliensatz als Bilder exportiert: 4 Bilder in „Vortrag-Folien“',
      );
      const unterordner = path.join(ordner, 'Vortrag-Folien');
      await pruefeBilderOrdner(unterordner);
      expect(fs.readdirSync(ordner).sort()).toEqual(['Vortrag-Folien', 'fremd.txt']);
      expect(fs.readFileSync(fremd, 'utf8')).toBe('fremder Inhalt');
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

test.describe('PR-29: Dialog-Abbruch bei beiden Exporten (F-363, F-364)', () => {
  test('abgebrochener Speichern- und Ordner-Dialog: keine Datei, keine Meldung, Ansicht unverändert, danach ein Export möglich', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir);
    const vorher = fs.readdirSync(dir).sort();
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 4');
      await stubDialoge(app, { speichern: null, ordner: null });
      await zeichneMeldungenAuf(page);
      await fuehreAusUeberPalette(page, app, 'Foliensatz als PowerPoint', PPTX_NAME);
      await expect.poll(async () => (await dialogAufrufe(app)).speichern).toBe(1);
      await fuehreAusUeberPalette(page, app, 'Foliensatz als Bilder', BILDER_NAME);
      await expect.poll(async () => (await dialogAufrufe(app)).ordner).toBe(1);
      // Nach beiden Abbruechen: weder Lauf-Hinweis noch Erfolg noch Fehler.
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/\bprinting\b/);
      expect(await folienMeldungen(page)).toEqual([]);
      expect(fs.readdirSync(dir).sort()).toEqual(vorher);
      // Der Abbruch gibt den Export frei: ein folgender Lauf schreibt die Datei.
      const ziel = path.join(dir, 'Vortrag.pptx');
      await exportierePptx(page, app, ziel, PPTX_MELDUNG_16_9);
      expect(liesPptx(ziel).folienZahl).toBe(4);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Die Beschriftungen jedes neu gesetzten Anwendungsmenues mitschreiben
// (Muster PR-21 in praesentation-themes.spec.js).
async function armiereMenueMitschrift(app) {
  await hauptSenden(app, ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.__menuCaptureArmed) return;
    win.__menuCaptureArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const sammle = (items) => {
        const raus = [];
        for (const it of items || []) {
          if (it.label) raus.push(it.label);
          if (it.submenu) raus.push(...sammle(it.submenu.items));
        }
        return raus;
      };
      globalThis.__menuLabels = sammle(menu ? menu.items : []);
      return orig(menu);
    };
  });
}

function menueBeschriftungen(app) {
  return hauptLesen(app, () => globalThis.__menuLabels || []);
}

async function schalteErweiterung(page, an) {
  await oeffneEinstellungsSeite(page);
  await page.locator(NAV('extensions')).click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
  const schalter = page.locator('#settings-extension-presentation');
  if (an) await schalter.check();
  else await schalter.uncheck();
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();
}

// Treffer der Kommando-Palette fuer einen Filter; die Palette wird danach
// wieder geschlossen.
async function paletteTreffer(page, app, filter) {
  await oeffnePalette(page, app);
  await page.locator(FILTER).fill(filter);
  const namen = await page.locator(`${ITEM} .command-palette-name`).allTextContents();
  await page.keyboard.press('Escape');
  await expect(page.locator(MODAL)).toBeHidden();
  return namen;
}

test.describe('PR-30: Erweiterung «Präsentation» aus und ein — beide Export-Kommandos (S-170, S-171)', () => {
  test('Menü-Einträge und Palette-Treffer entfallen und kehren zurück', async () => {
    const dir = machVerzeichnis();
    const datei = legeVorlageAn(dir);
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await armiereMenueMitschrift(app);
      await oeffneFolien(page);
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining([PPTX_NAME, BILDER_NAME]));
      await expect
        .poll(() => paletteTreffer(page, app, 'Foliensatz als'))
        .toEqual(expect.arrayContaining([PPTX_NAME, BILDER_NAME]));

      // --- Aus: beide Kommandos fort ----------------------------------------
      await schalteErweiterung(page, false);
      await expect(page.locator(FLAECHE)).toBeHidden();
      for (const eintrag of [PPTX_NAME, BILDER_NAME]) {
        await expect.poll(() => menueBeschriftungen(app)).not.toContain(eintrag);
      }
      const ohne = await paletteTreffer(page, app, 'Foliensatz als');
      expect(ohne).not.toContain(PPTX_NAME);
      expect(ohne).not.toContain(BILDER_NAME);

      // --- Ein: beide Kommandos zurueck -------------------------------------
      await schalteErweiterung(page, true);
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining([PPTX_NAME, BILDER_NAME]));
      await expect
        .poll(() => paletteTreffer(page, app, 'Foliensatz als'))
        .toEqual(expect.arrayContaining([PPTX_NAME, BILDER_NAME]));
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
