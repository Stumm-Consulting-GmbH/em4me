// 4T-001587 (Story 4S-000904, Epic 3E-000160): E2E-Funktions-Suite der Ausgabe
// der eigenen Einrichtung.
//
// EX-01: Der Menü-Weg öffnet die Auswahl mit einer Zeile je vorhandener
// Datenart und der Zahl ihrer Einträge; EX-02: ohne Auswahl entsteht keine
// Datei, der Dialog bleibt offen und nennt den Grund; EX-03: mit
// abgeschalteter Erweiterung fehlt der Menü-Eintrag.
//
// **Der Speichern-Dialog des Betriebssystems bleibt bewusst außen vor.** Er ist
// nicht Gegenstand dieses Wegs — er ist derselbe, den der portable Export seit
// 4T-000041 benutzt —, und ein E2E-Fall, der ihn öffnete, bliebe ohne
// Interceptor stehen. Geprüft wird bis zur Auswahl; dass aus ihr eine Datei am
// gewählten Ort wird, steht als manuelle Prüfung im Task.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, S-144).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

// Temp-Bereich wieder abraeumen; ein liegengebliebenes Verzeichnis ist
// unkritisch (Muster bereiche.spec.js).
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // unkritisch
  }
}

// Menü-Klicks simulieren (Muster smoke.spec.js).
async function sendMenuChannel(app, channel) {
  await app.evaluate(({ BrowserWindow }, kanal) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send(kanal, ...[]);
  }, channel);
}

// Eine Einrichtung mit bekanntem Umfang: zwei eigene Farbschemas, drei
// Tastenkürzel-Belegungen, eine abgeschaltete Erweiterung. Die Zahlen des
// Dialogs werden gegen genau diese Vorbelegung gehalten.
const EINGERICHTET = {
  language: 'de',
  themePref: 'dark',
  colorSchemes: { custom: [{ id: 'eins' }, { id: 'zwei' }], activeLight: 'eins' },
  hotkeys: { 'file.save': 'Ctrl+S', 'file.print': 'Ctrl+P', 'app.commandPalette': 'Ctrl+Shift+P' },
  // Verschachtelt wie in der config.json: die Vorbelegung schreibt Schluessel
  // woertlich, und der Speicher liest sie ueber den Punkt-Pfad.
  extensions: { disabled: ['mermaid'] },
};

const MODAL = '#setup-export-modal';
const ZEILEN = `${MODAL} .setup-export-rows li`;

// Der Menü-Listener ist erst am Ende des asynchronen init() registriert;
// deshalb wird der Kanal wiederholt gesendet, bis der Dialog steht (Muster
// openStatsAndWait in bereichs-statistik.spec.js).
async function oeffneAuswahl(app, page) {
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isHidden()) {
        await sendMenuChannel(app, 'menu:exportSetup');
      }
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
}

test.describe('EX-01: Auswahl der Datenarten vor der Ausgabe (S-144)', () => {
  test('zeigt je vorhandener Datenart eine Zeile mit Namen und Anzahl', async () => {
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await oeffneAuswahl(app, page);

      await expect(page.locator('#setup-export-title')).toHaveText('Einstellungen exportieren');
      await expect(page.locator('#setup-export-intro')).not.toBeEmpty();

      // Vorbelegt ist alles — der häufigste Fall ist die vollständige Sicherung.
      const zeilen = page.locator(ZEILEN);
      expect(await zeilen.count()).toBeGreaterThan(0);
      const kaesten = page.locator(`${ZEILEN} input[type="checkbox"]`);
      for (let i = 0; i < (await kaesten.count()); i += 1) {
        await expect(kaesten.nth(i)).toBeChecked();
      }

      // Die Zahlen treffen die Vorbelegung: zwei eigene Farbschemas, drei
      // Kürzel-Belegungen. Gezählt werden die Einträge, nicht die Felder des
      // Zustands-Objekts.
      const farbschemas = page.locator(ZEILEN, { hasText: 'Farbschemas' }).first();
      await expect(farbschemas.locator('.setup-export-count')).toHaveText('2 Einträge');
      const kuerzel = page.locator(ZEILEN, { hasText: 'Tastenkürzel' }).first();
      await expect(kuerzel.locator('.setup-export-count')).toHaveText('3 Einträge');

      // Ohne gebundenen Bereich gibt es keine Kalender-Systeme zur Ausgabe.
      await expect(page.locator(ZEILEN, { hasText: 'Kalender-Systeme' })).toHaveCount(0);

      await page.locator('#btn-setup-export-cancel').click();
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EX-02: ohne Auswahl entsteht keine Datei (S-144)', () => {
  test('nennt den Grund und lässt den Dialog offen', async () => {
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await oeffneAuswahl(app, page);

      const kaesten = page.locator(`${ZEILEN} input[type="checkbox"]`);
      const anzahl = await kaesten.count();
      for (let i = 0; i < anzahl; i += 1) await kaesten.nth(i).uncheck();

      await page.locator('#btn-setup-export-confirm').click();

      // Der Hinweis erscheint, und der Dialog bleibt stehen: Der Anwender soll
      // die Auswahl nachholen können, statt den Weg neu zu beginnen.
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
      await expect(page.locator('#statusbar-hint')).toHaveText('Mindestens eine Datenart wählen');
      await expect(page.locator(MODAL)).toBeVisible();

      await page.locator('#btn-setup-export-cancel').click();
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EX-04: Datenart mit Inhalt, aber ohne zaehlbare Eintraege (S-144)', () => {
  test('meldet vorhanden statt null Eintraege', async () => {
    // Befund der Test-Iteration vom 2026-09-08: Ohne eigene Farbschemas traegt
    // die Datenart trotzdem das aktive Schema-Paar und wird exportiert; die
    // Zeile meldete dafuer 0 Eintraege.
    const { app, page, userData } = await launchApp({
      settings: { language: 'de', colorSchemes: { custom: [], activeLight: 'amber-light' } },
    });
    try {
      await oeffneAuswahl(app, page);
      const farbschemas = page.locator(ZEILEN, { hasText: 'Farbschemas' }).first();
      await expect(farbschemas).toHaveCount(1);
      await expect(farbschemas.locator('.setup-export-count')).toHaveText('vorhanden');
      await page.locator('#btn-setup-export-cancel').click();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('EX-03: abgeschaltete Erweiterung entfernt den Menü-Eintrag (S-144)', () => {
  test('das Untermenü Einstellungen fehlt im Aus-Zustand ganz', async () => {
    // Menue-Inspektion ueber den setMenu-Interceptor: die App setzt ihre
    // Menues pro Fenster, Menu.getApplicationMenu() ist leer (Muster
    // armMenuCapture in arbeitsbereiche.spec.js).
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

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await armMenuCapture(app);
      // Erweiterung abschalten; der Main baut die Menues aller Fenster neu.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['setup-exchange']));
      await expect.poll(async () => (await labels(app)).length).toBeGreaterThan(0);
      // Geprueft wird der Eintrag des Untermenues, nicht nur dessen Beschriftung:
      // Die traegt seit der Umbenennung dasselbe Wort wie der Einstellungs-Dialog
      // darueber, und eine Aussage allein darueber haenge an einem Ellipsen-Zeichen.
      await expect.poll(async () => (await labels(app)).includes('Exportieren…')).toBe(false);
      await expect.poll(async () => (await labels(app)).includes('Einstellungen')).toBe(false);

      // Gegenprobe: eingeschaltet steht der Eintrag da.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect.poll(async () => (await labels(app)).includes('Exportieren…')).toBe(true);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// --- 4T-001590: Auswahl auf Eintrags-Ebene -----------------------------------

// Ein Bereichs-Ordner mit fertigen Zeitrechnungs-Bloecken. Die Bereichsdatei
// entsteht ueber die ECHTEN Module der Anwendung und nicht aus einer
// handgeschriebenen Form: Eine Vorbelegung, die eine Form behauptet statt sie
// aus dem Normalisierer des Gegenstands zu gewinnen, kann einen Fehler nicht
// finden, weil sie ihn teilt (Lehre aus dem Vorfall L10/U2 desselben Epics).
function makeKalenderArea(bloecke) {
  const mddStore = require('../../../src/main/documents/mdd-store.js');
  const {
    normalizeCalendarConfig,
    configForPersist,
  } = require('../../../src/shared/calendar/calendar-config.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-kalender-'));
  fs.writeFileSync(path.join(dir, 'notiz.md'), '# Notiz\n\nInhalt.\n', 'utf8');
  const roh = { blocks: bloecke };
  const container = mddStore.emptySettingsContainer();
  container.settings.calendarSystems = configForPersist(roh, normalizeCalendarConfig(roh));
  fs.writeFileSync(
    path.join(dir, mddStore.MDDA_FILENAME),
    mddStore.serializeContainer(container),
    'utf8',
  );
  return dir;
}

const kalender = (id, name) =>
  require('../../../src/shared/calendar/calendar-template.js').createGregorianTemplate({
    id,
    name,
  });

test.describe('EX-05: Auswahl eines einzelnen Kalender-Systems (S-144)', () => {
  test('zeigt je Block eine eigene Zeile und schaltet beide Stufen gemeinsam', async () => {
    const dir = makeKalenderArea([
      {
        id: 'mond',
        name: 'Mondkalender',
        calendars: [kalender('mond-a', 'Mondzyklus'), kalender('mond-b', 'Mondjahr')],
      },
      { id: 'fiskal', name: 'Fiskaljahr', calendars: [kalender('fj', 'Geschaeftsjahr')] },
    ]);
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      // Der Bereich bindet die leere App; die bereichsgebundene Datenart
      // erscheint erst dadurch in der Auswahl.
      const gebunden = await page.evaluate((p) => window.api.openAreaPath(p), dir);
      expect(gebunden.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich ');

      await oeffneAuswahl(app, page);

      // Die Datenart-Zeile zaehlt die Zeitrechnungen ALLER Bloecke.
      const datenart = page.locator(ZEILEN, { hasText: 'Kalender-Systeme des Bereichs' }).first();
      await expect(datenart.locator('.setup-export-count')).toHaveText('3 Einträge');

      // Darunter je Block eine eingerueckte Zeile mit eigenem Schalter. Die
      // Summe der Block-Zeilen ist die Zahl der Datenart-Zeile darueber.
      const unterZeilen = page.locator(`${MODAL} .setup-export-rows li.setup-export-entry`);
      await expect(unterZeilen).toHaveCount(2);
      const mond = unterZeilen.filter({ hasText: 'Mondkalender' }).first();
      const fiskal = unterZeilen.filter({ hasText: 'Fiskaljahr' }).first();
      await expect(mond.locator('.setup-export-count')).toHaveText('2 Einträge');
      await expect(fiskal.locator('.setup-export-count')).toHaveText('1 Eintrag');

      const kasten = (zeile) => zeile.locator('input[type="checkbox"]');
      const unbestimmt = () =>
        kasten(datenart).evaluate((el) => el.indeterminate === true && el.checked === true);

      // Vorbelegt ist alles, auf beiden Stufen.
      await expect(kasten(datenart)).toBeChecked();
      await expect(kasten(mond)).toBeChecked();
      await expect(kasten(fiskal)).toBeChecked();

      // Ein abgewaehlter Block macht die Datenart-Zeile unbestimmt.
      await kasten(fiskal).uncheck();
      await expect.poll(unbestimmt).toBe(true);

      // Der letzte abgewaehlte Block waehlt die Datenart ganz ab — sonst stuende
      // sie angehakt da und kaeme doch nicht in der Datei an.
      await kasten(mond).uncheck();
      await expect(kasten(datenart)).not.toBeChecked();

      // Und der Datenart-Schalter sagt "alles": beide Bloecke kommen zurueck.
      await kasten(datenart).check();
      await expect(kasten(mond)).toBeChecked();
      await expect(kasten(fiskal)).toBeChecked();
      await expect.poll(unbestimmt).toBe(false);

      await page.locator('#btn-setup-export-cancel').click();
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
      removeDir(dir);
    }
  });
});
