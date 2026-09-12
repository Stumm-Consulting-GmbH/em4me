// 4T-001592 (Story 4S-000905, Epic 3E-000129): E2E-Funktions-Suite der
// Sprach-Vorlage.
//
// SV-01: Der Menü-Weg schreibt die Vorlage an den gewählten Ort, und die Datei
// trägt den vollständigen englischen Bestand; SV-02: ein Abbruch im
// Speichern-Dialog hinterlässt weder Datei noch Fehlermeldung; SV-03: mit
// abgeschalteter Erweiterung fehlt der Menü-Eintrag.
//
// **Der Speichern-Dialog wird gestellt statt bedient** (Muster
// einbettungen.spec.js): Der native Dialog ist nicht Gegenstand dieses Weges,
// und ein Fall, der ihn wirklich öffnete, bliebe stehen. Gestellt lässt sich
// dafür der ganze Weg bis zur geschriebenen Datei messen — anders als beim
// Einrichtungs-Export, wo die Auswahl davor den Gegenstand trägt.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, F-286).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const I18N = path.join(__dirname, '..', '..', '..', 'src', 'i18n');
const fassung = (code) => JSON.parse(fs.readFileSync(path.join(I18N, `${code}.json`), 'utf8'));

// Temp-Verzeichnis abraeumen; ein Rest ist unkritisch (Muster bereiche.spec.js).
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // unkritisch
  }
}

// Stellt den Speichern-Dialog auf ein festes Ziel oder auf Abbruch.
async function stelleDialog(app, ziel) {
  await app.evaluate(({ dialog }, z) => {
    dialog.showSaveDialog = async () =>
      z ? { canceled: false, filePath: z } : { canceled: true, filePath: undefined };
  }, ziel);
}

async function sendeMenuKanal(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:exportLocaleTemplate');
  });
}

test.describe('SV-01: Sprach-Vorlage schreiben (F-286)', () => {
  test('legt die englische Fassung vollständig am gewählten Ort ab', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sv-'));
    const ziel = path.join(temp, 'vorlage.json');
    // Deutsche Oberflaeche: Die Vorlage kommt trotzdem auf Englisch, weil sie
    // aus der Rueckfall-Sprache entsteht und nicht aus der eingestellten.
    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await stelleDialog(app, ziel);
      // Der Menue-Listener steht erst am Ende des asynchronen init(); deshalb
      // wiederholt senden, bis die Wirkung eintritt (Muster oeffneAuswahl in
      // einrichtungs-ausgabe.spec.js).
      await expect
        .poll(
          async () => {
            await sendeMenuKanal(app);
            return fs.existsSync(ziel);
          },
          { timeout: 30000 },
        )
        .toBe(true);

      const inhalt = JSON.parse(fs.readFileSync(ziel, 'utf8'));
      const en = fassung('en');
      const de = fassung('de');
      // 4T-001593: Die Vorlage führt zwei Metadaten-Felder voran, mit denen der
      // Übersetzer seine Sprache benennt; sie stehen leer und sind keine
      // Übersetzungs-Schlüssel.
      expect(Object.keys(inhalt).slice(0, 2)).toEqual(['@@locale', '@@name']);
      expect(inhalt['@@locale']).toBe('');
      expect(inhalt['@@name']).toBe('');
      expect(Object.keys(inhalt).slice(2)).toEqual(Object.keys(en));
      // Gegenprobe auf die Sprache: ein Schluessel, der sich zwischen den
      // Fassungen unterscheidet, steht englisch in der Datei.
      const abweichend = Object.keys(en).find((k) => de[k] && de[k] !== en[k]);
      expect(inhalt[abweichend]).toBe(en[abweichend]);

      // Der Anwender bekommt eine Rueckmeldung, und zwar in SEINER Sprache.
      await expect(page.locator('#statusbar-hint')).toHaveText(de['locales.template.done']);
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SV-02: Abbruch im Speichern-Dialog (F-286)', () => {
  test('schreibt nichts und meldet keinen Fehler', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sv-'));
    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await stelleDialog(app, null);
      await sendeMenuKanal(app);

      // Der Abbruch ist kein Fehler: keine Datei, kein Hinweis. Gemessen wird
      // gegen eine Wartezeit, weil ein Ausbleiben sonst nur bedeutete, dass
      // noch nichts geschehen ist.
      await page.waitForTimeout(1500);
      expect(fs.readdirSync(temp)).toEqual([]);
      await expect(page.locator('#statusbar-hint')).not.toHaveClass(/visible/);
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SV-03: abgeschaltete Erweiterung entfernt den Menü-Eintrag (F-286)', () => {
  test('der Zugang fehlt im Aus-Zustand, der Nachbar bleibt', async () => {
    // Menue-Inspektion ueber den setMenu-Interceptor: Die App setzt ihre Menues
    // pro Fenster, Menu.getApplicationMenu() bleibt leer (Muster armMenuCapture
    // in arbeitsbereiche.spec.js).
    const armMenuCapture = async (app) => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win || win.__menuCaptureArmed) return;
        win.__menuCaptureArmed = true;
        const orig = win.setMenu.bind(win);
        win.setMenu = (menu) => {
          const collect = (items) => {
            const out = [];
            for (const it of items || []) {
              if (it.label) out.push(it.label);
              if (it.submenu) out.push(...collect(it.submenu.items));
            }
            return out;
          };
          globalThis.__menuLabels = collect(menu ? menu.items : []);
          return orig(menu);
        };
      });
    };
    const labels = (app) => app.evaluate(() => globalThis.__menuLabels || []);
    const de = fassung('de');

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await armMenuCapture(app);
      // Erweiterung abschalten; der Hauptprozess baut die Menues neu.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['custom-locale']));
      await expect.poll(async () => (await labels(app)).length).toBeGreaterThan(0);

      const eintrag = de['menu.file.exportLocaleTemplate'];
      await expect.poll(async () => (await labels(app)).includes(eintrag)).toBe(false);
      // 4T-001593: Mit beiden Kommandos verschwindet auch das Untermenü
      // selbst — ein leeres «Eigene Sprache» wäre ein toter Menüpunkt.
      await expect
        .poll(async () => (await labels(app)).includes(de['menu.file.localeSubmenu']))
        .toBe(false);
      // Gegenprobe: Der Nachbar-Eintrag desselben Menues bleibt stehen — die
      // Erweiterung nimmt ihren Zugang, nicht das Menue.
      await expect
        .poll(async () => (await labels(app)).includes(de['menu.file.settings']))
        .toBe(true);

      // Zweite Gegenprobe: eingeschaltet steht der Eintrag da. Ohne sie bewiese
      // sein Fehlen dasselbe wie ein Eintrag, den es nie gab.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect.poll(async () => (await labels(app)).includes(eintrag)).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});
