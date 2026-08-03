// 4T-0854 (Epic 3E-0164): E2E-Spec des Überlauf-Verhaltens einer
// Seitenleisten-Spalte. Kürzel SU- (Sidebar-Überlauf).
//
// Regression: Zog man ein Panel so groß, dass die Höhen-Summe die Spalte
// überstieg, drückte der Flex-Algorithmus die darunter liegenden Panels auf
// Höhe 0, und der Container kappte den Rest (overflow: hidden). Das Panel war
// damit unsichtbar und nicht als vorhanden erkennbar; zurück kam man nur über
// das Verkleinern des Nachbarn oder den Doppelklick-Reset.
//
// Geprüft werden der Überlauf-Fall (Mindesthöhe bleibt, Spalte rollt, Panel
// nach dem Rollen im Blick), die Gegenprobe ohne Überlauf und der
// eingeklappte Zustand.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

const LEFT = '.pane-group[data-pane="0"] .pane-sidebar-left';

// Profil-Verzeichnis mit vorbefüllter electron-store-config.json (Muster
// sidebar-layout.spec.js). Punkt-Keys liegen im Store verschachtelt.
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-su-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Zwei gestapelte Panels links. Die Höhe steht nur am oberen: Der jeweils
// letzte sichtbare Block einer Spalte läuft bewusst immer auf Automatik
// (Regel aus dem Bestand), und genau er ist der Block, den der Überlauf
// verdrängt.
function seedZweiPanels(panelHeights) {
  return seedProfile({
    sidebar: {
      layout: {
        left: [
          { panels: ['bookmarks'], active: 'bookmarks' },
          { panels: ['outline'], active: 'outline' },
        ],
        right: [],
      },
      ...(panelHeights ? { panelHeights } : {}),
    },
    bookmarks: { visibleColumn0: true },
    outline: { visibleColumn0: true },
  });
}

// Misst Spalte und unteres Panel in einem Durchgang.
//
// `kopfHoehe` ist die Messlatte für „als vorhanden erkennbar": Ein Panel, das
// mindestens seine eigene Kopfzeile zeigt, ist sichtbar; darunter beginnt der
// gemeldete Fehler. Die Schwelle kommt bewusst aus der Messung und nicht als
// eigene Zahl in die Spec — vor dem Fix war das verdrängte Panel genau einen
// Pixel hoch, weshalb eine Prüfung auf „größer als null" den Fehler nicht
// gefangen hätte.
async function messen(page) {
  return page.evaluate((sel) => {
    const spalte = document.querySelector(sel);
    const unten = spalte.querySelector('.sidebar-outline');
    const kopf = unten.querySelector('.sidebar-section-header');
    return {
      spalteHoehe: Math.round(spalte.getBoundingClientRect().height),
      spalteBreite: Math.round(spalte.getBoundingClientRect().width),
      scrollHeight: spalte.scrollHeight,
      clientHeight: spalte.clientHeight,
      untenHoehe: Math.round(unten.getBoundingClientRect().height),
      untenMinHoehe: parseFloat(getComputedStyle(unten).minHeight) || 0,
      kopfHoehe: kopf ? Math.round(kopf.getBoundingClientRect().height) : 0,
      overflowY: getComputedStyle(spalte).overflowY,
    };
  }, LEFT);
}

test.describe('SU-01: Überlauf durch eine große Panel-Höhe', () => {
  test('das verdrängte Panel behält seine Mindesthöhe und ist durch Rollen erreichbar', async () => {
    // 1500 Pixel übersteigen jede realistische Fensterhöhe; der Wert liegt
    // innerhalb der Klemm-Grenzen der Höhen-Verwaltung.
    const userData = seedZweiPanels({ bookmarks: 1500 });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(LEFT)).toBeVisible();
      await expect(page.locator(`${LEFT} .sidebar-outline`)).toBeVisible();

      const vor = await messen(page);

      // Kern der Regression: Vor dem Fix war das verdrängte Panel einen Pixel
      // hoch, also weder sichtbar noch als vorhanden erkennbar. Die Messlatte
      // ist seine eigene Kopfzeile.
      expect(vor.kopfHoehe).toBeGreaterThan(0);
      expect(vor.untenHoehe).toBeGreaterThanOrEqual(vor.kopfHoehe);
      // Und die strukturelle Ursache: eine Mindesthöhe größer als null.
      expect(vor.untenMinHoehe).toBeGreaterThan(0);
      expect(vor.untenHoehe).toBeGreaterThanOrEqual(vor.untenMinHoehe);
      // Die Spalte läuft über und rollt senkrecht.
      expect(vor.scrollHeight).toBeGreaterThan(vor.clientHeight);
      expect(vor.overflowY).toBe('auto');

      // Echtes Rollen: ans Ende der Spalte rollen und prüfen, dass das untere
      // Panel danach im sichtbaren Bereich der Spalte liegt.
      const sichtbarNachRollen = await page.evaluate((sel) => {
        const spalte = document.querySelector(sel);
        spalte.scrollTop = spalte.scrollHeight;
        const spalteBox = spalte.getBoundingClientRect();
        const untenBox = spalte.querySelector('.sidebar-outline').getBoundingClientRect();
        return {
          scrollTop: Math.round(spalte.scrollTop),
          // Überlappung des Panels mit dem sichtbaren Ausschnitt der Spalte.
          ueberlappung: Math.round(
            Math.min(spalteBox.bottom, untenBox.bottom) - Math.max(spalteBox.top, untenBox.top),
          ),
        };
      }, LEFT);

      expect(sichtbarNachRollen.scrollTop).toBeGreaterThan(0);
      expect(sichtbarNachRollen.ueberlappung).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData);
    }
  });

  test('das Erscheinen der Rollleiste ändert die Spaltenbreite nicht', async () => {
    const ohneUeberlauf = seedZweiPanels(null);
    const app1 = await launchApp({ args: [BASIS], userData: ohneUeberlauf });
    let breiteOhne;
    try {
      await waitForTab(app1.page);
      await expect(app1.page.locator(LEFT)).toBeVisible();
      breiteOhne = (await messen(app1.page)).spalteBreite;
    } finally {
      await closeApp(app1.app, ohneUeberlauf);
    }

    const mitUeberlauf = seedZweiPanels({ bookmarks: 1500 });
    const app2 = await launchApp({ args: [BASIS], userData: mitUeberlauf });
    try {
      await waitForTab(app2.page);
      await expect(app2.page.locator(LEFT)).toBeVisible();
      const mit = await messen(app2.page);
      expect(mit.scrollHeight).toBeGreaterThan(mit.clientHeight);
      expect(mit.spalteBreite).toBe(breiteOhne);
    } finally {
      await closeApp(app2.app, mitUeberlauf);
    }
  });
});

test.describe('SU-02: Gegenprobe ohne Überlauf', () => {
  test('ohne Überlauf rollt die Spalte nicht', async () => {
    const userData = seedZweiPanels(null);
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      await expect(page.locator(LEFT)).toBeVisible();
      const mess = await messen(page);
      // Ohne fixierte Höhen passen beide Panels in die Spalte; es gibt nichts
      // zu rollen, und die Darstellung entspricht dem Stand vor dem Task.
      expect(mess.scrollHeight).toBe(mess.clientHeight);
      expect(mess.untenHoehe).toBeGreaterThan(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SU-03: Eingeklappte Spalte', () => {
  test('die eingeklappte Spalte rollt nicht', async () => {
    const userData = seedZweiPanels({ bookmarks: 1500 });
    const { app, page } = await launchApp({ args: [BASIS], userData });
    try {
      await waitForTab(page);
      const toggle = page.locator(`${LEFT} .sidebar-collapse-toggle`).first();
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.locator(`${LEFT}.collapsed`)).toHaveCount(1);

      const mess = await page.evaluate((sel) => {
        const spalte = document.querySelector(sel);
        return {
          scrollHeight: spalte.scrollHeight,
          clientHeight: spalte.clientHeight,
          overflowY: getComputedStyle(spalte).overflowY,
        };
      }, LEFT);

      // Im Kollaps sind die Panel-Sektionen ausgeblendet; es bleibt nichts,
      // was überlaufen könnte, und overflow steht wieder auf visible (der
      // Hover-Icon-Button muss über den schmalen Strich hinausragen).
      expect(mess.overflowY).toBe('visible');
      expect(mess.scrollHeight).toBeLessThanOrEqual(mess.clientHeight);
    } finally {
      await closeApp(app, userData);
    }
  });
});
