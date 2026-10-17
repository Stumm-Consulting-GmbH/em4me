// 4T-002284 (Epic 3E-000348): Ablauf-Faelle der eigenen Folien-Themes
// (4T-002281), des Abschnitts «Folien-Themes» und des Dialogs «Gestaltung
// dieser Praesentation…» (4T-002282) sowie des Aus-Zustands der Stufe an der
// gestarteten Anwendung.
//
// **Warum gegen die echte Anwendung.** Ein eigenes Theme laeuft ueber beide
// Prozesse: Der Abschnitt schreibt den Schluessel `presentationThemes` in den
// Einstellungs-Speicher, die Verteilung des Hauptprozesses meldet ihn an das
// Fenster zurueck, der Katalog des Fensters zeichnet die Folie neu, und der
// Format-Kern hinter der Preload-Bruecke loest den Namen im Kopf auf. Der
// Dialog schreibt in den Editor der Spalte, das Speichern ueber den
// Hauptprozess auf die Platte. Jeder schreibende Fall endet deshalb an der
// Datei: an der config.json des Profils bzw. am gespeicherten Dokument, am
// rohen Text gelesen.
//
// describe-Titel tragen die Matrix-IDs (test/abdeckungs-matrix.json, S-168 und
// F-347).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, warteAufDateiArgument } = require('../helpers/app');
const {
  pressUntilVisible,
  oeffneEinstellungsSeite,
  bedieneBis,
  EINSTELLUNGS_SEITE,
} = require('../helpers/eingabe');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { leseJsonOderNull } = require('../helpers/dateien');
const { SEL } = require('../helpers/selectors');

const PANE0 = '.pane-group[data-pane="0"]';
const FLAECHE = `${PANE0} .pane-presentation .praesentation-flaeche`;
const ZAEHLER = `${FLAECHE} .praesentation-zaehler`;
const SLIDE = `${FLAECHE} .praesentation-buehne .presentation-slide`;
const HINWEISE = `${FLAECHE} .praesentation-hinweise`;
const DIALOG = '.folien-gestaltung-modal';
const NAV = (id) => `${EINSTELLUNGS_SEITE} .settings-nav-entry[data-section-id="${id}"]`;

// Ein eigenes Theme «Firma» auf `dark` mit eigener Akzentfarbe.
const FIRMA = { id: 'e2e-firma', name: 'Firma', basis: 'dark', slots: { accent: '#ff6600' } };

function machVerzeichnis() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-2284-themes-'));
}

function raeumeAuf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

function schreibe(dir, name, zeilen) {
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, zeilen.join('\n'), 'utf8');
  return datei;
}

function vortrag(theme) {
  return [
    '---',
    'presentation: true',
    'title:   "Mein Vortrag"   # Kommentar bleibt',
    `theme: ${theme}`,
    'paginate: true',
    '---',
    '',
    '# Erste Folie',
    '',
    '---',
    '',
    '## Zweite Folie',
    '',
  ];
}

function konfiguration(userData) {
  return leseJsonOderNull(path.join(userData, 'config.json')) || {};
}

function eigeneThemes(userData) {
  const wert = konfiguration(userData).presentationThemes;
  return wert && Array.isArray(wert.custom) ? wert.custom : null;
}

async function oeffneFolien(page) {
  await pressUntilVisible(page, 'Control+8', page.locator(FLAECHE));
}

function slotVariable(page, name) {
  return page.locator(SLIDE).evaluate((slide, n) => slide.style.getPropertyValue(n).trim(), name);
}

async function sendeMenue(app, kanal) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, k) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(k);
    },
    kanal,
  );
}

test.describe('PR-19: eigenes Theme im Abschnitt «Folien-Themes» anlegen und im Kopf wählen (S-168)', () => {
  test('Neu aus der Vorlage dark, Name und Akzentfarbe, OK schreibt config.json; die Präsentation mit dem Namen im Kopf zeigt das Theme', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vortrag.md', vortrag('Firma'));
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
      // Noch unbekannt: Rueckfall auf light mit Hinweis.
      await expect(page.locator(HINWEISE)).toContainText('Unbekanntes Theme „Firma“');
      expect(await slotVariable(page, '--slide-background')).toBe('#ffffff');

      // --- Abschnitt «Folien-Themes»: Neu aus dark, Name, Akzentfarbe ------
      await oeffneEinstellungsSeite(page);
      await page.locator(NAV('presentationThemes')).click();
      await expect(page.locator('#settings-folien-theme-vorlage')).toBeVisible();
      await page.locator('#settings-folien-theme-vorlage').selectOption('dark');
      await page.locator('#settings-folien-theme-neu').click();
      const name = page.locator('#settings-folien-theme-name');
      await expect(name).toHaveValue('Neues Theme');
      await name.fill('Firma');
      await name.press('Tab');
      await expect(page.locator('#settings-folien-theme-auswahl option')).toHaveText(['Firma']);
      await page.locator('#settings-folien-theme-accent').fill('#ff6600');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();

      // --- Auf der Platte: genau ein eigenes Theme, nur die Abweichung -----
      await expect.poll(() => eigeneThemes(userData), { timeout: 15000 }).toHaveLength(1);
      const [theme] = eigeneThemes(userData);
      expect(theme).toMatchObject({ name: 'Firma', basis: 'dark', slots: { accent: '#ff6600' } });
      expect(Object.keys(theme.slots)).toEqual(['accent']);

      // --- Die Folie loest den Namen im Kopf jetzt auf ---------------------
      await expect(page.locator(FLAECHE)).toBeVisible();
      await expect.poll(() => slotVariable(page, '--slide-accent')).toBe('#ff6600');
      expect(await slotVariable(page, '--slide-background')).toBe('#1e1e1e');
      await expect(page.locator(SLIDE)).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator(HINWEISE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

async function macheAenderbar(page) {
  await bedieneBis(page.locator(SEL.btnEdit), async () =>
    /\bactive\b/.test((await page.locator(SEL.btnEdit).getAttribute('class')) || ''),
  );
}

// Einmal speichern und warten, bis die Datei die Bedingung erfuellt — nicht
// gepollt gesendet, weil ein zweites Speichern einen spaeteren Stand
// vorwegnehmen koennte (Muster `speichere` in kanban-notizen.spec.js).
async function speichere(app, datei, bedingung) {
  await sendeMenue(app, 'menu:save');
  await expect.poll(() => bedingung(fs.readFileSync(datei, 'utf8')), { timeout: 15000 }).toBe(true);
  return fs.readFileSync(datei, 'utf8');
}

async function oeffneDialog(app, page) {
  await sendeMenue(app, 'menu:presentationGestaltung');
  await expect(page.locator(DIALOG)).toBeVisible();
}

// Der Text ausserhalb des theme-Eintrags: alle Zeilen ohne die Zeile `theme:`
// und ohne ihre eingerueckten Folge-Zeilen.
function ohneTheme(text) {
  const raus = [];
  let imBlock = false;
  for (const zeile of text.split('\n')) {
    if (/^theme:/.test(zeile)) {
      imBlock = true;
      continue;
    }
    if (imBlock && /^\s+\S/.test(zeile)) continue;
    imBlock = false;
    raus.push(zeile);
  }
  return raus.join('\n');
}

test.describe('PR-20: Dialog «Gestaltung dieser Präsentation…» und «Als Theme speichern…» (S-168)', () => {
  test('Theme wählen und eigenen Wert setzen schreibt den Block in den Kopf; als Theme gespeichert steht in config.json und im Kopf nur der Name', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vortrag.md', vortrag('light'));
    const vorher = fs.readFileSync(datei, 'utf8');
    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: { language: 'de', presentationThemes: { custom: [FIRMA] } },
    });
    try {
      await warteAufDateiArgument(page, datei);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
      await macheAenderbar(page);

      // --- Dialog: Theme «Firma», eigene Ueberschriften-Farbe, OK -----------
      await oeffneDialog(app, page);
      const wahl = page.locator('#folien-gestaltung-theme');
      await expect(wahl).toHaveValue('light');
      await expect(wahl.locator('option')).toHaveText(['light', 'dark', 'accent', 'Firma']);
      await wahl.selectOption('Firma');
      await expect(page.locator(`${DIALOG} [data-aktion="werteUebernehmen"]`)).toBeEnabled();
      await page.locator('#folien-gestaltung-dialog-heading').fill('#112233');
      await page.locator(`${DIALOG} [data-aktion="ok"]`).click();
      await expect(page.locator(DIALOG)).toHaveCount(0);
      // Die Folie zeigt das eigene Theme mit dem eigenen Wert.
      await expect.poll(() => slotVariable(page, '--slide-heading')).toBe('#112233');
      expect(await slotVariable(page, '--slide-accent')).toBe('#ff6600');
      expect(await slotVariable(page, '--slide-background')).toBe('#1e1e1e');

      let text = await speichere(app, datei, (t) => t.includes('112233'));
      expect(text).toMatch(/\ntheme:\n {2}name: Firma\n {2}heading: ["']?#112233["']?\n/);
      // Alles ausserhalb des theme-Eintrags bleibt byte-gleich.
      expect(ohneTheme(text)).toBe(ohneTheme(vorher));

      // --- «Als Theme speichern…»: Name, config.json, Kopf nur mit Namen ----
      await oeffneDialog(app, page);
      await expect(wahl).toHaveValue('Firma');
      await expect(page.locator('#folien-gestaltung-dialog-heading')).toHaveValue('#112233');
      await page.locator(`${DIALOG} [data-aktion="alsTheme"]`).click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Vortrag');
      await page.locator('#btn-name-input-ok').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      await expect
        .poll(() => (eigeneThemes(userData) || []).map((e) => e.name), { timeout: 15000 })
        .toEqual(['Firma', 'Vortrag']);
      const neu = eigeneThemes(userData).find((e) => e.name === 'Vortrag');
      expect(neu).toMatchObject({
        basis: 'dark',
        slots: { accent: '#ff6600', heading: '#112233' },
      });

      text = await speichere(app, datei, (t) => /\ntheme: Vortrag\n/.test(t));
      expect(text).toBe(vorher.replace('theme: light', 'theme: Vortrag'));
      await expect.poll(() => slotVariable(page, '--slide-heading')).toBe('#112233');
      await expect(page.locator(HINWEISE)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});

// Menue-Mitschrift aller Beschriftungen (Muster KB-05 und PR-08).
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

const STUFE2_EINTRAEGE = [
  'Vorführung im eigenen Fenster',
  'Referenten-Ansicht',
  'Folien-Übersicht',
  'Vorführung beenden',
  'Gestaltung dieser Präsentation…',
];

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

test.describe('PR-21: Erweiterung «Präsentation» aus und ein — Kommandos und Abschnitt der Stufe 2 (F-347)', () => {
  test('Menü-Einträge und Abschnitt «Folien-Themes» entfallen und kehren zurück; Themes und Datei bleiben unverändert', async () => {
    const dir = machVerzeichnis();
    const datei = schreibe(dir, 'Vortrag.md', vortrag('Firma'));
    const vorher = fs.readFileSync(datei, 'utf8');
    const { app, page, userData } = await launchApp({
      args: [datei],
      settings: { language: 'de', presentationThemes: { custom: [FIRMA] } },
    });
    try {
      await warteAufDateiArgument(page, datei);
      await armiereMenueMitschrift(app);
      await oeffneFolien(page);
      await expect(page.locator(ZAEHLER)).toHaveText('1 / 2');
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining(STUFE2_EINTRAEGE));
      await oeffneEinstellungsSeite(page);
      await expect(page.locator(NAV('presentationThemes'))).toHaveCount(1);
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();

      // --- Aus: Eintraege und Abschnitt fort, nichts geloescht --------------
      await schalteErweiterung(page, false);
      await expect(page.locator(FLAECHE)).toBeHidden();
      for (const eintrag of STUFE2_EINTRAEGE) {
        await expect.poll(() => menueBeschriftungen(app)).not.toContain(eintrag);
      }
      await oeffneEinstellungsSeite(page);
      await expect(page.locator(NAV('extensions'))).toHaveCount(1);
      await expect(page.locator(NAV('presentationThemes'))).toHaveCount(0);
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();
      expect(eigeneThemes(userData)).toEqual([FIRMA]);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);

      // --- Ein: alles zurueck, das Theme steht im Abschnitt und wirkt -------
      await schalteErweiterung(page, true);
      await expect
        .poll(() => menueBeschriftungen(app))
        .toEqual(expect.arrayContaining(STUFE2_EINTRAEGE));
      await oeffneEinstellungsSeite(page);
      await page.locator(NAV('presentationThemes')).click();
      await expect(page.locator('#settings-folien-theme-auswahl option')).toHaveText(['Firma']);
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(EINSTELLUNGS_SEITE)).toBeHidden();
      await oeffneFolien(page);
      await expect.poll(() => slotVariable(page, '--slide-accent')).toBe('#ff6600');
      expect(eigeneThemes(userData)).toEqual([FIRMA]);
      expect(fs.readFileSync(datei, 'utf8')).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      raeumeAuf(dir);
    }
  });
});
