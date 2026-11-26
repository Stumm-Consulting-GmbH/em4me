// 4T-002630 (Epic 3E-000395): E2E-Funktions-Suite — Titelbild über die
// Eigenschaft `cover` (TI-01 bis TI-07).
//
// TI-01 gerenderte Ansicht und gerenderte Hälfte der geteilten Ansicht: Das
//       Bild ist das erste Element des Inhalts, als Daten-Adresse, beschnitten
//       (object-fit: cover) auf die eingestellte Höhe.
// TI-02 fehlendes Bild und Bild aus dem Netz: unauffälliger Hinweis, keine
//       Meldung in der Statusleiste, keine Anfrage ins Netz.
// TI-03 Live-Ansicht: Block über der Frontmatter-Zeile, bleibt bei der
//       Schreibmarke im Kopf, folgt einem geänderten Wert von `cover`.
// TI-04 Aus-Zustand der Erweiterung: kein Bild in gerenderter und Live-Ansicht,
//       Eigenschaften-Panel zeigt `cover` unverändert; wieder an, Bild da.
// TI-05 Ausgaben: HTML-Export mit dem Bild als erstem Element und ohne Hinweis,
//       ohne Verlust in der Meldung; ein Titelbild ohne Bild entfällt; Druck-
//       Zustand zeigt das Bild und verbirgt den Hinweis; das PDF trägt ein Bild.
// TI-06 Wiki-Form: Bild in einem anderen Ordner des Bereichs über den Namen.
// TI-07 Eigenschaften-Panel (Abnahme-Handgriff): cover mit bilder/<Datei>
//       anlegen, die gerenderte Ansicht zeigt das Bild oben; ausdrücklich
//       gespeichert.
//
// Die Test-Bilder entstehen im Wegwerf-Ordner des Falls als kleine PNG-Dateien;
// nichts Binäres ist eingecheckt. Allein TI-07 speichert ausdrücklich; der schreibende Fall
// TI-03 endet am unveränderten Inhalt der Datei auf der Platte.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');
const { warteAufText } = require('../helpers/dateien');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const {
  PANEL,
  ADD_BTN,
  FIELDS,
  bindAreaAndOpen,
  openPropertiesPanel,
  cleanupDir,
} = require('../helpers/profil-bereich');

const GERENDERT = `${SEL.markdownBody0} > figure.titelbild`;
const LIVE = `${SEL.paneSource0} .cm-live-titelbild figure.titelbild`;
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const HINWEIS_FEHLT = 'Titelbild nicht gefunden';
const HINWEIS_NETZ =
  'Titelbilder aus dem Netz lädt EM4me nicht; legen Sie das Bild als Datei in den Bereich';

// --- Test-Bilder ------------------------------------------------------------

const CRC_TAFEL = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(puffer) {
  let c = 0xffffffff;
  for (const b of puffer) c = CRC_TAFEL[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function abschnitt(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const typDaten = Buffer.concat([Buffer.from(typ, 'latin1'), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(typDaten));
  return Buffer.concat([laenge, typDaten, pruef]);
}

// Eine einfarbige PNG-Datei der Größe breite × hoehe (RGB, 8 Bit).
function pngDatei(breite, hoehe, [r, g, b]) {
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf.set([8, 2, 0, 0, 0], 8);
  const zeile = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(breite).fill([r, g, b]).flat()),
  ]);
  const roh = Buffer.concat(Array(hoehe).fill(zeile));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    abschnitt('IHDR', kopf),
    abschnitt('IDAT', zlib.deflateSync(roh)),
    abschnitt('IEND', Buffer.alloc(0)),
  ]);
}

const ROT = pngDatei(400, 40, [200, 30, 30]);
const BLAU = pngDatei(40, 400, [30, 30, 200]);
const b64 = (puffer) => `data:image/png;base64,${puffer.toString('base64')}`;

// Wegwerf-Ordner mit Dokument und Bildern; liefert die Pfade.
function arbeitsOrdner(kopfZeilen, bilder = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-titelbild-e2e-'));
  for (const [name, inhalt] of Object.entries(bilder)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), inhalt);
  }
  const datei = path.join(dir, 'Titelbild.md');
  const text = ['---', ...kopfZeilen, '---', '', '# Titelbild-Probe', '', 'Text.', ''].join('\n');
  fs.writeFileSync(datei, text, 'utf8');
  return { dir, datei, text };
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

async function schalteErweiterung(page, an) {
  await oeffneEinstellungsSeite(page);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`).click();
  const schalter = page.locator('#settings-extension-cover-image');
  await (an ? schalter.check() : schalter.uncheck());
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
}

// Jede Meldung der Statusleiste mitschreiben (Muster html-export.spec.js).
async function zeichneMeldungenAuf(page) {
  await page.evaluate(() => {
    const hinweis = document.getElementById('statusbar-hint');
    window.__titelbildMeldungen = [];
    new MutationObserver(() => {
      window.__titelbildMeldungen.push(hinweis.textContent);
    }).observe(hinweis, { childList: true, characterData: true, subtree: true });
  });
}

const meldungen = (page) => page.evaluate(() => window.__titelbildMeldungen || []);

test.describe('TI-01: Titelbild oben in der gerenderten Ansicht', () => {
  test('erstes Element des Inhalts, Daten-Adresse, beschnitten auf die Höhe; ebenso in der geteilten Ansicht', async () => {
    const { dir, datei } = arbeitsOrdner(
      ['cover: bilder/breit.png', 'cover-height: 300', 'cover-position: top'],
      { 'bilder/breit.png': ROT },
    );
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      for (const ansicht of ['rendered', 'split']) {
        await sendMenuChannel(app, 'menu:viewChange', ansicht);
        const bild = page.locator(`${GERENDERT} > img.titelbild-bild`);
        await expect(bild, ansicht).toHaveAttribute('src', b64(ROT), { timeout: 20000 });
        const lage = await page.locator(SEL.markdownBody0).evaluate((body) => {
          const erstes = body.firstElementChild;
          const img = erstes.querySelector('img');
          const stil = getComputedStyle(img);
          return {
            erstes: erstes.tagName + '.' + erstes.className,
            danach: erstes.nextElementSibling && erstes.nextElementSibling.className,
            hoehe: Math.round(img.getBoundingClientRect().height),
            breite: Math.round(img.getBoundingClientRect().width),
            inhalt: Math.round(body.getBoundingClientRect().width),
            objectFit: stil.objectFit,
            objectPosition: stil.objectPosition,
          };
        });
        expect(lage.erstes, ansicht).toBe('FIGURE.titelbild');
        expect(lage.danach, ansicht).toContain('frontmatter-block');
        expect(lage.hoehe, ansicht).toBe(300);
        expect(lage.objectFit, ansicht).toBe('cover');
        expect(lage.objectPosition, ansicht).toBe('50% 0%');
        // Über die Breite des Inhalts (abzüglich seines Innenabstands).
        expect(lage.breite, ansicht).toBeGreaterThan(lage.inhalt * 0.7);
        await expect(page.locator(`${GERENDERT} .titelbild-hinweis`)).toBeHidden();
      }
    } finally {
      await closeApp(app, userData);
      cleanupDir(dir);
    }
  });
});

test.describe('TI-02: Hinweis statt Fehlermeldung', () => {
  test('fehlendes Bild und Adresse aus dem Netz zeigen den Hinweis, ohne Meldung und ohne Netz-Anfrage', async () => {
    const fehlt = arbeitsOrdner(['cover: bilder/fehlt.png']);
    const netz = arbeitsOrdner(['cover: https://example.org/titel.png']);
    const { app, page, userData } = await launchApp({ args: [fehlt.datei] });
    const anfragen = [];
    page.on('request', (r) => {
      if (/^https?:/i.test(r.url())) anfragen.push(r.url());
    });
    try {
      await zeichneMeldungenAuf(page);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const hinweis = page.locator(`${GERENDERT} .titelbild-hinweis`);
      await expect(hinweis).toHaveText(HINWEIS_FEHLT, { timeout: 20000 });
      await expect(hinweis).toBeVisible();
      await expect(hinweis).toHaveAttribute('title', 'bilder/fehlt.png');
      // Das Bild-Element hat keine Adresse und nimmt keinen Platz ein.
      await expect(page.locator(`${GERENDERT} > img.titelbild-bild:not([src])`)).toHaveCount(1);
      await expect(page.locator(`${GERENDERT} > img.titelbild-bild`)).toBeHidden();

      await oeffneDokumentImFenster(app, page, netz.datei);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(hinweis).toHaveText(HINWEIS_NETZ, { timeout: 20000 });
      await expect(hinweis).toBeVisible();
      await expect(page.locator(`${GERENDERT} img`)).toHaveCount(0);
      expect(anfragen).toEqual([]);
      expect(await meldungen(page)).toEqual([]);
    } finally {
      await closeApp(app, userData);
      cleanupDir(fehlt.dir);
      cleanupDir(netz.dir);
    }
  });
});

test.describe('TI-03: Titelbild in der Live-Ansicht', () => {
  test('Block über der Frontmatter-Zeile, bleibt bei der Schreibmarke im Kopf, folgt dem Wert', async () => {
    const { dir, datei, text } = arbeitsOrdner(['cover: rot.png', 'titel: Probe'], {
      'rot.png': ROT,
      'blau.png': BLAU,
    });
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const bild = page.locator(`${LIVE} img.titelbild-bild`);
      await expect(bild).toHaveAttribute('src', b64(ROT), { timeout: 20000 });
      // Über der Frontmatter-Zeile.
      const fmZeile = page.locator(`${SEL.paneSource0} .cm-live-frontmatter`);
      await expect(fmZeile).toBeVisible();
      const oben = async (loc) => (await loc.boundingBox()).y;
      expect(await oben(page.locator(LIVE))).toBeLessThan(await oben(fmZeile));

      // Schreibmarke in den Kopf: die Frontmatter-Zeile demaskiert, das Bild bleibt.
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
      await page.locator(`${SEL.editorContent0} .cm-line`).last().click();
      // Wie FM-02: von Position 0 mit der Pfeiltaste in den Kopf, dann in die
      // Zeile von cover.
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator(`${SEL.paneSource0} .cm-live-frontmatter`)).toHaveCount(0);
      await page.keyboard.press('ArrowDown');
      await expect(page.locator(`${SEL.editorContent0} .cm-activeLine`)).toHaveText(
        'cover: rot.png',
      );
      await expect(bild).toBeVisible();
      await expect(bild).toHaveAttribute('src', b64(ROT));

      // Wert ändern: rot.png -> blau.png; das neue Bild erscheint.
      await page.keyboard.press('End');
      for (let i = 0; i < 'rot.png'.length; i += 1) await page.keyboard.press('Backspace');
      await page.keyboard.type('blau.png');
      await expect(bild).toHaveAttribute('src', b64(BLAU), { timeout: 10000 });
      // Nichts gespeichert: die Datei auf der Platte ist unverändert.
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
      cleanupDir(dir);
    }
  });
});

test.describe('TI-04: Aus-Zustand der Erweiterung', () => {
  test('kein Bild in gerenderter und Live-Ansicht, Eigenschaft unverändert im Panel; wieder an, Bild da', async () => {
    const { dir, datei, text } = arbeitsOrdner(['cover: rot.png'], { 'rot.png': ROT });
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${GERENDERT} img.titelbild-bild`)).toHaveAttribute(
        'src',
        b64(ROT),
        { timeout: 20000 },
      );
      await schalteErweiterung(page, false);
      await expect(page.locator(`${SEL.markdownBody0} .frontmatter-block`)).toBeVisible();
      await expect(page.locator(`${SEL.markdownBody0} .titelbild`)).toHaveCount(0);
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(`${SEL.paneSource0} .cm-live-frontmatter`)).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator(`${SEL.paneSource0} .cm-live-titelbild`)).toHaveCount(0);
      // Das Eigenschaften-Panel zeigt die Eigenschaft wie jede andere.
      await openPropertiesPanel(page);
      const felder = page.locator(`${FIELDS} .properties-field`);
      await expect(felder).toHaveCount(1, { timeout: 15000 });
      await expect(felder.first().locator('.properties-field-key')).toHaveValue('cover');
      await expect(felder.first().locator('.properties-field-value-input')).toHaveValue('rot.png');

      await schalteErweiterung(page, true);
      await expect(page.locator(`${LIVE} img.titelbild-bild`)).toHaveAttribute('src', b64(ROT), {
        timeout: 20000,
      });
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${GERENDERT} img.titelbild-bild`)).toHaveAttribute(
        'src',
        b64(ROT),
        { timeout: 20000 },
      );
      expect(fs.readFileSync(datei, 'utf8')).toBe(text);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(dir);
    }
  });
});

// HTML-Export über die Kommando-Palette mit gestubbtem Speichern-Dialog
// (Muster html-export.spec.js).
async function exportiereHtml(app, page, ziel) {
  await hauptSenden(
    app,
    ({ dialog }, payload) => {
      dialog.showSaveDialog = async () => {
        globalThis.__titelbildDialog = (globalThis.__titelbildDialog || 0) + 1;
        return payload;
      };
    },
    { canceled: false, filePath: ziel },
  );
  const vorher = await hauptLesen(app, () => globalThis.__titelbildDialog || 0);
  await expect
    .poll(async () => {
      if (await page.locator('#command-palette-modal').isVisible()) return true;
      await sendMenuChannel(app, 'menu:openCommandPalette');
      return page.locator('#command-palette-modal').isVisible();
    })
    .toBe(true);
  await page.locator('#command-palette-filter').fill('Als HTML exportieren');
  const eintrag = page.locator('.command-palette-item').filter({
    has: page.locator('.command-palette-name', { hasText: /^Als HTML exportieren…$/ }),
  });
  await expect(eintrag).toHaveClass(/\bactive\b/);
  await page.keyboard.press('Enter');
  await expect
    .poll(() => hauptLesen(app, () => globalThis.__titelbildDialog || 0), { timeout: 30000 })
    .toBe(vorher + 1);
  const html = await warteAufText(ziel, '</html>', { timeout: 30000 });
  return html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
}

test.describe('TI-05: Ausgaben mit dem Titelbild', () => {
  test('HTML-Export und Druck zeigen das Bild oben ohne Hinweis; ohne Bild entfällt der Bereich', async () => {
    const mit = arbeitsOrdner(['cover: rot.png'], { 'rot.png': ROT });
    const ohne = arbeitsOrdner(['cover: fehlt.png']);
    const { app, page, userData } = await launchApp({ args: [mit.datei] });
    const ziel = path.join(mit.dir, 'export.html');
    const zielOhne = path.join(ohne.dir, 'export.html');
    const zielPdf = path.join(mit.dir, 'export.pdf');
    try {
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${GERENDERT} img.titelbild-bild`)).toHaveAttribute(
        'src',
        b64(ROT),
        { timeout: 20000 },
      );
      // Druck-Zustand: Bild sichtbar, Hinweis nicht.
      const druck = await page.locator(SEL.markdownBody0).evaluate((body) => {
        document.body.classList.add('printing');
        try {
          const fig = body.querySelector(':scope > figure.titelbild');
          return {
            erstes: body.firstElementChild === fig,
            bild: getComputedStyle(fig.querySelector('img')).display,
            hinweis: getComputedStyle(fig.querySelector('.titelbild-hinweis')).display,
          };
        } finally {
          document.body.classList.remove('printing');
        }
      });
      expect(druck).toEqual({ erstes: true, bild: 'block', hinweis: 'none' });

      await zeichneMeldungenAuf(page);
      const inhalt = await exportiereHtml(app, page, ziel);
      // Das Titelbild ist das erste Element des Inhalts, als Daten-Adresse.
      expect(inhalt).toMatch(
        /<main class="markdown-body"[^>]*>\s*<figure class="titelbild"[^>]*><img class="titelbild-bild"[^>]*src="data:image\/png;base64,/,
      );
      expect(inhalt).not.toContain('titelbild-hinweis');
      expect(inhalt).not.toContain('export-bild-fehlt');
      await expect.poll(() => meldungen(page)).toContain('Als HTML exportiert');
      expect((await meldungen(page)).filter((m) => m.includes('Bild'))).toEqual([]);

      // PDF über die Druck-Vorbereitung: die Datei trägt ein Bild.
      // Strg+Umschalt+P genau einmal wirksam auslösen (Muster TB-03).
      await hauptSenden(
        app,
        ({ dialog }, payload) => {
          globalThis.__titelbildPdf = 0;
          dialog.showSaveDialog = async () => {
            globalThis.__titelbildPdf += 1;
            return payload;
          };
        },
        { canceled: false, filePath: zielPdf },
      );
      await expect
        .poll(
          async () => {
            await page.keyboard.press('Control+Shift+P');
            return hauptLesen(app, () => globalThis.__titelbildPdf || 0);
          },
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
      await expect
        .poll(() => fs.existsSync(zielPdf) && fs.statSync(zielPdf).size > 0, { timeout: 30000 })
        .toBe(true);
      await expect(page.locator('body.printing')).toHaveCount(0);
      await expect
        .poll(() => fs.readFileSync(zielPdf).toString('latin1').includes('/Subtype /Image'), {
          timeout: 30000,
        })
        .toBe(true);

      // Ohne Bild: der Kopf-Bereich entfällt im Export ganz, ohne Verlust.
      await oeffneDokumentImFenster(app, page, ohne.datei);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${GERENDERT} .titelbild-hinweis`)).toHaveText(HINWEIS_FEHLT, {
        timeout: 20000,
      });
      await zeichneMeldungenAuf(page);
      const inhaltOhne = await exportiereHtml(app, page, zielOhne);
      expect(inhaltOhne).not.toContain('class="titelbild');
      expect(inhaltOhne).not.toContain('export-bild-fehlt');
      await expect.poll(() => meldungen(page)).toContain('Als HTML exportiert');
    } finally {
      await closeApp(app, userData);
      cleanupDir(mit.dir);
      cleanupDir(ohne.dir);
    }
  });
});

test.describe('TI-06: Wiki-Form über den Namen im Bereich', () => {
  test('cover: "[[name.png]]" findet das Bild in einem anderen Ordner des Bereichs', async () => {
    const bereich = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-titelbild-bereich-'));
    fs.mkdirSync(path.join(bereich, 'anlagen', 'tief'), { recursive: true });
    fs.mkdirSync(path.join(bereich, 'notizen'), { recursive: true });
    fs.writeFileSync(path.join(bereich, 'anlagen', 'tief', 'strand.png'), BLAU);
    const datei = path.join(bereich, 'notizen', 'Reise.md');
    fs.writeFileSync(datei, '---\ncover: "[[strand.png]]"\n---\n\n# Reise\n', 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, bereich, datei);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const bild = page.locator(`${GERENDERT} img.wiki-embed-image`);
      await expect(bild).toHaveAttribute('src', b64(BLAU), { timeout: 20000 });
      const lage = await bild.evaluate((img) => ({
        hoehe: Math.round(img.getBoundingClientRect().height),
        objectFit: getComputedStyle(img).objectFit,
      }));
      expect(lage).toEqual({ hoehe: 200, objectFit: 'cover' });
      await expect(page.locator(`${GERENDERT} .titelbild-hinweis`)).toBeHidden();
      // Dieselbe Auflösung in der Live-Ansicht.
      await sendMenuChannel(app, 'menu:viewChange', 'live');
      await expect(page.locator(`${LIVE} img.wiki-embed-image`)).toHaveAttribute('src', b64(BLAU), {
        timeout: 20000,
      });
    } finally {
      await closeApp(app, userData);
      cleanupDir(bereich);
    }
  });
});

// Zugleich der Abnahme-Handgriff der Story: Die Eigenschaft wird im
// Eigenschaften-Panel angelegt, nicht im Quelltext. Damit läuft die Setz-Stelle
// der Vollansicht in properties-save.js, die kein anderer Fall erreicht.
test.describe('TI-07: Titelbild über das Eigenschaften-Panel anlegen', () => {
  test('cover im Panel mit bilder/<Datei> anlegen; die gerenderte Ansicht zeigt das Bild oben; gespeichert', async () => {
    const bereich = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-titelbild-panel-'));
    fs.mkdirSync(path.join(bereich, 'bilder'), { recursive: true });
    fs.writeFileSync(path.join(bereich, 'bilder', 'strand.png'), ROT);
    const datei = path.join(bereich, 'Urlaub.md');
    fs.writeFileSync(datei, '---\ntitel: Urlaub\n---\n\n# Urlaub\n', 'utf8');
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, bereich, datei);
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${SEL.markdownBody0} .frontmatter-block`)).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator(GERENDERT)).toHaveCount(0);

      await openPropertiesPanel(page);
      const felder = page.locator(`${FIELDS} .properties-field`);
      await expect(felder).toHaveCount(1, { timeout: 15000 });
      // In einem gebundenen Bereich öffnet der Knopf das Vorschlags-Menü, sobald
      // die Profil-Auflösung geladen ist (Test-Hook `data-profiles="on"`, wie in
      // eigenschafts-profile.spec.js); erst dann klicken und fest auf das Menü
      // warten, dort «Eigenes Feld».
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible({ timeout: 15000 });
      await page.locator(ADD_BTN).click();
      const eigenes = page.locator('.properties-suggest-menu .properties-suggest-item.is-custom');
      await expect(eigenes).toBeVisible();
      await eigenes.click();
      await expect(felder).toHaveCount(2);
      const neu = felder.last();
      await neu.locator('.properties-field-key').fill('cover');
      await neu.locator('.properties-field-value input').fill('bilder/strand.png');

      // Die gerenderte Ansicht zeigt das Bild als erstes Element, als Daten-Adresse.
      await expect(page.locator(`${GERENDERT} > img.titelbild-bild`)).toHaveAttribute(
        'src',
        b64(ROT),
        { timeout: 20000 },
      );
      const erstes = await page
        .locator(SEL.markdownBody0)
        .evaluate((body) => body.firstElementChild.className);
      expect(erstes).toBe('titelbild');

      // Ausdrücklich speichern; die Datei trägt danach die Eigenschaft.
      await page.keyboard.press('Control+s');
      await expect
        .poll(() => fs.readFileSync(datei, 'utf8'), { timeout: 15000 })
        .toMatch(/^---\ntitel: Urlaub\ncover: bilder\/strand\.png\n---\n/);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(bereich);
    }
  });
});
