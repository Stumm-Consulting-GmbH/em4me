// 4T-001599 (Epic 3E-000191): E2E-Funktions-Suite der Seite My Extended Memory.
// MEM-01: Öffnen über den Menü-Kanal als pfadloser System-Reiter, dauerhafter
// Hinweis und Leer-Zustand ohne Einträge; MEM-02: ein über den dialogfreien
// Weg eingetragener Bereich erscheint als Zeile im Abschnitt seiner Art, und
// der Entfernen-Knopf nimmt ihn wieder heraus (zurück in den Leer-Zustand);
// MEM-03: der zweite Aufruf zeigt den bestehenden Reiter statt einen zweiten;
// MEM-04: die Kommando-Palette führt auf dieselbe Seite; MEM-05 (4T-001602):
// der Zugang zum Ex- und Import steht auf der Seite, und der Ausgabe-Knopf
// öffnet die Auswahl aus 3E-000160 — nicht eine eigene.
// MEM-06 (4T-001603): ausgeschaltete Erweiterung — Ansichtsmenue und
// Kommando-Palette verlieren den Eintrag und bekommen ihn beim
// Wiedereinschalten zurueck; MEM-07 (4T-001600): «Neu erheben» nimmt den
// geaenderten Bestand auf und die Zeile nennt danach einen Stand;
// MEM-08 (4T-001601): die Detail-Sicht eines Bereichs faechert die Kennzahlen
// auf, benennt die ohne Index nicht erhebbare als nicht verfuegbar und fuehrt
// in die vorhandene Bereichs-Statistik.
//
// **Der Datei-Dialog des Betriebssystems bleibt außen vor**, aus demselben
// Grund wie in einrichtungs-ausgabe.spec.js: Er ist nicht Gegenstand dieses
// Wegs, und ein E2E-Fall, der ihn öffnete, bliebe ohne Interceptor stehen.
// Dass aus der Auswahl eine Datei wird, steht als manuelle Prüfung im Task.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, S-150).
// Muster durchgehend bereichs-statistik.spec.js.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { menuZustand, menuEintrag } = require('../helpers/menu-zustand');

// Menü-Klicks simulieren (Muster smoke.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Wegwerf-Ordner ohne Buch- und ohne Regal-Begleitdatei: die Erkennung nimmt
// ihn als Bereich (4T-001598, Annahme A1 des Epic-Entwurfs).
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-memory-e2e-'));
  fs.writeFileSync(path.join(areaRoot, 'Start.md'), '# Start\n', 'utf8');
  return areaRoot;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

const SYSTEM_PANE = '.pane-group[data-pane="0"] .pane-system';
const PAGE = `${SYSTEM_PANE} .memory-page`;
const MODAL = '#command-palette-modal';
const EXPORT_MODAL = '#setup-export-modal';

// Eine Einrichtung mit mindestens einer ausgebbaren Datenart: Ohne sie
// meldete die Ausgabe «nichts vorhanden», statt die Auswahl zu öffnen
// (Muster EINGERICHTET in einrichtungs-ausgabe.spec.js).
const EINGERICHTET = {
  language: 'de',
  colorSchemes: { custom: [{ id: 'eins' }], activeLight: 'eins' },
  hotkeys: { 'file.save': 'Ctrl+S' },
};

// Seite öffnen: Der Menü-Kanal wird per Poll wiederholt gesendet, weil der
// Listener erst am Ende des asynchronen init() registriert ist.
async function openPageAndWait(app, page) {
  await expect
    .poll(async () => {
      if ((await page.locator(PAGE).count()) === 0) {
        await sendMenuChannel(app, 'menu:openMemoryPage');
      }
      return page.locator(PAGE).count();
    })
    .toBe(1);
}

// Kommando-Palette über den Menü-Kanal öffnen (Muster KP-02): Der Kanal wird
// per Poll wiederholt gesendet, weil der Listener erst am Ende des
// asynchronen init() steht.
async function openPalette(app, page) {
  await expect
    .poll(async () => {
      if (await page.locator(MODAL).isVisible()) return true;
      await sendMenuChannel(app, 'menu:openCommandPalette');
      return page.locator(MODAL).isVisible();
    })
    .toBe(true);
}

// Gefäß über den dialogfreien Pfad-Einstieg eintragen (Muster bindArea der
// Statistik-Suite: der Ordner-Dialog selbst ist ein Dialog des Betriebssystems
// und bleibt manueller Test).
async function addPath(page, dir) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.memory.addPath(p), dir);
      return !!(result && result.ok);
    })
    .toBe(true);
}

test.describe('MEM-01: Seite öffnet als pfadloser System-Reiter (S-150)', () => {
  test('zeigt Titel, dauerhaften Hinweis und ohne Einträge den Weg zum ersten', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openPageAndWait(app, page);

      // Read-only System-Seite: eigener Reiter, Stift deaktiviert.
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText('My Extended Memory');

      await expect(page.locator(`${PAGE} .memory-page-note`)).toBeVisible();
      await expect(page.locator(`${PAGE} .memory-page-placeholder`)).toBeVisible();
      await expect(page.locator(`${PAGE} .memory-section`)).toHaveCount(0);
      // Der Zugang zum Ex- und Import steht auch ohne Einträge da (4T-001602);
      // seine Bedienung misst MEM-05.
      await expect(page.locator(`${PAGE} .memory-page-exchange`)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('MEM-02: Eintragen und Entfernen wirken sofort auf die Anzeige (S-150)', () => {
  test('der eingetragene Bereich erscheint als Zeile und verschwindet wieder', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await openPageAndWait(app, page);
      await addPath(page, areaRoot);

      // Die Meldung memory:changed zieht die offene Seite ohne Nachfrage nach.
      await expect(page.locator(`${PAGE} .memory-row`)).toHaveCount(1);
      await expect(page.locator(`${PAGE} .memory-section-title`)).toHaveText('Bereiche');
      await expect(page.locator(`${PAGE} .memory-row-title`)).toHaveText(path.basename(areaRoot));
      await expect(page.locator(`${PAGE} .memory-row-path`)).toHaveText(areaRoot);
      // 4T-001600: Das Eintragen erhebt die Kennzahlen einmal; die Zeile nennt
      // danach ihren Stand und die beiden Kurz-Kennzahlen des Bereichs.
      await expect(page.locator(`${PAGE} .memory-row-stand`)).toContainText('Stand:');
      await expect(page.locator(`${PAGE} .memory-row-stat`)).toHaveCount(2);
      // Der Hinweis bleibt neben der gefüllten Liste stehen.
      await expect(page.locator(`${PAGE} .memory-page-note`)).toBeVisible();
      await expect(page.locator(`${PAGE} .memory-page-placeholder`)).toHaveCount(0);

      // Entfernen ohne Rückfrage: Zeile weg, Leer-Zustand zurück. Seit
      // 4T-001601 über die eigene Klasse statt über die Position — die
      // Knopf-Reihe ist zweimal gewachsen, und jeder Zuwachs hat diesen
      // Selektor mitgerissen.
      await page.locator(`${PAGE} .memory-row-actions .memory-action-remove`).click();
      await expect(page.locator(`${PAGE} .memory-row`)).toHaveCount(0);
      await expect(page.locator(`${PAGE} .memory-page-placeholder`)).toBeVisible();
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

test.describe('MEM-03: der zweite Aufruf zeigt den bestehenden Reiter (S-150)', () => {
  test('dupliziert den Reiter nicht', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openPageAndWait(app, page);
      const tabCount = await page.locator(SEL.tabs0).count();

      await sendMenuChannel(app, 'menu:openMemoryPage');
      await expect(page.locator(SEL.tabs0)).toHaveCount(tabCount);
      await expect(page.locator(PAGE)).toHaveCount(1);
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toHaveText('My Extended Memory');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('MEM-04: die Kommando-Palette führt auf dieselbe Seite (S-150)', () => {
  test('das Kommando ist ohne geöffneten Bereich verfügbar und öffnet die Seite', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openPalette(app, page);

      await page.locator('#command-palette-filter').fill('My Extended Memory');
      const treffer = page.locator('.command-palette-item').first();
      await expect(treffer.locator('.command-palette-name')).toHaveText('My Extended Memory');
      // Kein geöffneter Bereich: Das Kommando ist trotzdem ausführbar.
      await expect(treffer).not.toHaveClass(/unavailable/);

      await page.keyboard.press('Enter');
      await expect(page.locator(MODAL)).toBeHidden();
      await expect(page.locator(PAGE)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('MEM-05: Zugang zum Ex- und Import auf der Seite (S-150)', () => {
  test('zeigt beide Knoepfe und oeffnet die Auswahl aus 3E-000160', async () => {
    const { app, page, userData } = await launchApp({ settings: EINGERICHTET });
    try {
      await openPageAndWait(app, page);

      const block = page.locator(`${PAGE} .memory-page-exchange`);
      await expect(block).toBeVisible();
      await expect(block.locator('.memory-exchange-export')).toHaveText('Einrichtung ausgeben…');
      await expect(block.locator('.memory-exchange-import')).toHaveText('Einrichtung einlesen…');
      await expect(block.locator('.memory-page-exchange-note')).not.toBeEmpty();

      // Der Ausgabe-Knopf fuehrt in denselben Dialog wie der Menue-Weg: Es ist
      // die Auswahl aus 3E-000160 und keine zweite (AK3, AK4).
      await block.locator('.memory-exchange-export').click();
      await expect(page.locator(EXPORT_MODAL)).toBeVisible();
      await expect(page.locator('#setup-export-title')).toHaveText('Einstellungen exportieren');
      expect(await page.locator(`${EXPORT_MODAL} .setup-export-rows li`).count()).toBeGreaterThan(
        0,
      );

      // Abbruch laesst die Seite unveraendert stehen (AK7).
      await page.locator('#btn-setup-export-cancel').click();
      await expect(page.locator(EXPORT_MODAL)).toBeHidden();
      await expect(page.locator(PAGE)).toHaveCount(1);
      await expect(block).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});
// 4T-001603: Aus-Zustand der schaltbaren Erweiterung. Geschaltet wird ueber den
// Broadcast-Pfad (Muster BS-06 in bereichs-statistik.spec.js, PZ-04 in
// panel-zugaenge.spec.js); gemessen werden die beiden Zugaenge, die der
// Anwender hat. Der Menue-KANAL selbst bleibt aussen vor: Er haengt wie bei der
// Bereichs-Statistik unabhaengig von der Erweiterung am Renderer
// (app-menu-bindings.js) — im Aus-Zustand fehlt der Eintrag, der ihn ausloest,
// nicht der Kanal. Der Neustart-Nachweis (AK6) bleibt manuelle Zeile.
test.describe('MEM-06: ausgeschaltete Erweiterung nimmt beide Zugaenge (S-150)', () => {
  test('Ansichtsmenue und Palette verlieren den Eintrag und bekommen ihn zurueck', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Eingeschaltet steht der Menue-Eintrag da (Ausgangs-Lage).
      const menuAn = await menuZustand(app, '');
      expect(menuEintrag(menuAn, 'My Extended Memory')).not.toBeNull();

      await page.evaluate(() =>
        window.api.setSetting('extensions.disabled', ['my-extended-memory']),
      );

      // Ansichtsmenue: der Eintrag entfaellt. Die Gegenprobe auf den Nachbarn
      // im selben Menue haelt den Fall ehrlich — ohne sie liefe er auch dann
      // gruen, wenn gar kein Menue erfasst wurde.
      await expect
        .poll(async () => {
          const menu = await menuZustand(app, '');
          return (
            menuEintrag(menu, 'My Extended Memory') === null &&
            menuEintrag(menu, 'Kommando-Palette') !== null
          );
        })
        .toBe(true);

      // Kommando-Palette: das Kommando ist nicht mehr zu finden.
      await openPalette(app, page);
      await page.locator('#command-palette-filter').fill('My Extended Memory');
      await expect(page.locator('.command-palette-item')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();

      // Wieder eingeschaltet stehen beide Zugaenge erneut.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect
        .poll(async () => menuEintrag(await menuZustand(app, ''), 'My Extended Memory') !== null)
        .toBe(true);
      await openPalette(app, page);
      await page.locator('#command-palette-filter').fill('My Extended Memory');
      await expect(
        page.locator('.command-palette-item').first().locator('.command-palette-name'),
      ).toHaveText('My Extended Memory');
      await page.keyboard.press('Escape');
      await expect(page.locator(MODAL)).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-001600: Der Kennzahlen-Beschleuniger von der Seite aus. Gemessen wird die
// Zusage, die der Anwender sieht — eine Zeile mit Stand und Kurz-Kennzahlen,
// und nach einer Aenderung am Gefaess neue Zahlen auf Anforderung. Der Stand
// selbst wird nicht auf einen Wert geprueft: Er ist sekundengenau, und zwei
// Laeufe in derselben Sekunde waeren gleich; geprueft wird die Zahl, die sich
// nachweislich aendert.
test.describe('MEM-07: Neu erheben nimmt den geaenderten Bestand auf (S-150)', () => {
  test('die Zeile nennt einen Stand, und die Kennzahl zieht nach', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await openPageAndWait(app, page);
      await addPath(page, areaRoot);

      // Beim Eintragen einmal erhoben: eine Markdown-Datei im Fixture.
      await expect(page.locator(`${PAGE} .memory-row-stand`)).toContainText('Stand:');
      await expect(page.locator(`${PAGE} .memory-row-stat`).first()).toHaveText(
        'Markdown-Dateien: 1',
      );

      // Aenderung am Gefaess, ohne dass die Seite davon erfaehrt: Die Zahl
      // steht weiter auf dem alten Stand — genau das ist die benannte
      // Belastung des Beschleunigers.
      fs.writeFileSync(path.join(areaRoot, 'Zweite.md'), '# Zweite\n', 'utf8');
      await expect(page.locator(`${PAGE} .memory-row-stat`).first()).toHaveText(
        'Markdown-Dateien: 1',
      );

      // Auf ausdrueckliche Anforderung zieht sie nach.
      await page.locator(`${PAGE} .memory-action-refresh`).click();
      await expect(page.locator(`${PAGE} .memory-row-stat`).first()).toHaveText(
        'Markdown-Dateien: 2',
      );
      await expect(page.locator(`${PAGE} .memory-row-stand`)).toContainText('Stand:');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});

// 4T-001601: Die Detail-Sicht je Gefaess-Art und der Weg in die ausfuehrliche
// Bereichs-Statistik. Gemessen wird an einem Bereich, weil er als einzige Art
// beides traegt — die volle Kennzahlen-Reihe samt der ohne Index nicht
// erhebbaren Zahl und den Sprung. Die uebrigen drei Arten haben ihre Faelle in
// renderer/memory-page.test.js; ein E2E-Fall je Art brauchte je ein echtes
// Gefaess und brachte gegenueber der Unit-Ebene nichts hinzu.
test.describe('MEM-08: Detail-Sicht eines Bereichs samt Sprung zur Statistik (S-150)', () => {
  test('faechert die Kennzahlen auf und fuehrt in die vorhandene Statistik', async () => {
    const areaRoot = makeArea();
    const { app, page, userData } = await launchApp();
    try {
      await openPageAndWait(app, page);
      await addPath(page, areaRoot);
      await expect(page.locator(`${PAGE} .memory-row`)).toHaveCount(1);

      // Zugeklappt gibt es keine Detail-Sicht; der Andockpunkt bleibt leer.
      await expect(page.locator(`${PAGE} .memory-detail`)).toHaveCount(0);
      await page.locator(`${PAGE} .memory-action-details`).click();

      const zeilen = page.locator(`${PAGE} .memory-detail-row`);
      await expect(zeilen).toHaveCount(7);
      await expect(zeilen.nth(0).locator('.memory-detail-name')).toHaveText('Markdown-Dateien');
      await expect(zeilen.nth(0).locator('.memory-detail-value')).toHaveText('1');
      await expect(zeilen.nth(1).locator('.memory-detail-value')).toHaveText('0');
      // Ohne geoeffneten Bereich gibt es keinen Index: Tags, Aufgaben und
      // Waisen erscheinen als «nicht verfuegbar» und nicht als Null (AK7).
      await expect(zeilen.nth(4).locator('.memory-detail-name')).toHaveText('Tags');
      await expect(zeilen.nth(4).locator('.memory-detail-value')).toHaveText('nicht verfügbar');
      await expect(zeilen.nth(6).locator('.memory-detail-value')).toHaveText('nicht verfügbar');

      // AK6: Der Weg fuehrt auf die vorhandene Statistik-Seite. Der Bereich ist
      // noch nicht der geoeffnete, wird also zuerst an diese App gebunden; der
      // Sprung haengt an der Display-Info-Meldung und braucht deshalb den Poll.
      await page.locator(`${PAGE} .memory-action-area-stats`).click();
      await expect(page.locator(`${SYSTEM_PANE} .area-stats-page`)).toHaveCount(1);

      // Zugeklappt verschwindet die Detail-Sicht wieder: Die Seite ist noch da,
      // der Reiter nur nicht mehr der aktive.
      await sendMenuChannel(app, 'menu:openMemoryPage');
      await expect(page.locator(`${PAGE} .memory-detail`)).toHaveCount(1);
      await page.locator(`${PAGE} .memory-action-details`).click();
      await expect(page.locator(`${PAGE} .memory-detail`)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
    }
  });
});
