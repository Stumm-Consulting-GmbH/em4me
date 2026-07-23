// Epic 3E-0098: Arbeitsbereiche — benannte logische Applikationen mit
// Ablage, Lebenszyklus und Entwurfs-Mitnahme (4T-0537/4T-0538/4T-0539).
// Die Lebenszyklus-Aufrufe laufen ueber die echte Preload-Bruecke
// (window.api.workspace*, identisch mit den Dialog-/Menue-Pfaden; native
// Menues und Dialoge sind per Playwright nicht bedienbar).
//
// WS-01: "Als Arbeitsbereich speichern" benennt die laufende App (Titel,
//        Untermenue-Liste) und der offene Arbeitsbereich ueberlebt den
//        Neustart samt Datei-Tab.
// WS-02: Schliessen friert den Stand ein, Wiederoeffnen stellt ihn her,
//        erneutes Oeffnen fokussiert statt dupliziert.
// WS-03: Unbenannt-Entwurf gehoert zum Arbeitsbereichs-Zustand — er bleibt
//        beim normalen App-Start liegen und kehrt erst mit dem Oeffnen
//        seines Arbeitsbereichs zurueck (4T-0539).
// WS-04: Loeschen entfernt nur die Ablage; ein offener Arbeitsbereich wird
//        zur unbenannten Applikation degradiert (Fenster bleibt).
// WS-05: Erweiterung aus — Untermenue-Block und Titel-Teil verschwinden,
//        die Ablage bleibt; Einschalten bringt beides zurueck.
// WS-06: Regressionstest 4T-0633 — der aus dem Verwaltungs-Dialog
//        geoeffnete Namens-und-Farb-Dialog liegt OBEN und ist bedienbar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');

function windowCount(app) {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

function draftFileCount(userData) {
  try {
    return fs.readdirSync(path.join(userData, 'drafts')).filter((n) => n.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

// Menue-Inspektion: die App setzt ihre Menues PRO FENSTER (win.setMenu),
// Menu.getApplicationMenu() ist daher leer. Der Interceptor patcht setMenu
// des ersten Fensters (Laufzeit-Patch-Muster wie stubCancelDialog in
// entwurfs-zwischenspeicher.spec.js) und legt bei jedem Neubau alle Labels
// (rekursiv inkl. Untermenues) in eine globale Main-Variable. Geprueft wird
// sprachfrei ueber die Arbeitsbereichs-NAMEN in der Untermenue-Liste.
async function armMenuCapture(app) {
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
}

function capturedMenuLabels(app) {
  return app.evaluate(() => globalThis.__menuLabels || []);
}

// "Arbeitsbereich schliessen" aus einem Arbeitsbereichs-Fenster: das Fenster
// schliesst waehrend des Aufrufs, die IPC-Antwort kommt nie an — deshalb
// fire-and-forget mit geschlucktem Kontext-Verlust.
async function closeWorkspaceFrom(page) {
  await page
    .evaluate(() => {
      void window.api.workspaceClose();
    })
    .catch(() => {});
}

// Neuen Unbenannt-Tab im juengsten Fenster anlegen und Text eintippen
// (Muster addDraftTab aus entwurfs-zwischenspeicher.spec.js, hier auf das
// Ziel-Fenster mit der hoechsten webContents-ID gerichtet). Das Senden
// wird gepollt: der Menue-Listener eines frisch erzeugten Fensters ist
// erst nach dessen init() wirksam, fruehere Sends verfallen (Electron-IPC
// puffert nicht). Getippt wird in den aktiven Tab; eventuell mehrfach
// entstandene LEERE Unbenannt-Tabs sind harmlos (kein Entwurf ohne Inhalt,
// Pane-Snapshots fuehren nur Pfad-Tabs).
async function addDraftTabTo(app, page, text) {
  await expect
    .poll(
      async () => {
        await app.evaluate(({ BrowserWindow }) => {
          const wins = BrowserWindow.getAllWindows();
          wins.sort((a, b) => a.webContents.id - b.webContents.id);
          wins[wins.length - 1].webContents.send('menu:new');
        });
        return page.locator(SEL.tabs0).count();
      },
      { intervals: [500, 500, 1000, 1000] },
    )
    .toBeGreaterThan(0);
  const editor = page.locator(SEL.editorContent0);
  await expect(editor).toBeVisible();
  if ((await editor.getAttribute('contenteditable')) !== 'true') {
    await page.locator(SEL.btnEdit).click();
  }
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.type(text);
  await expect(page.locator(SEL.dirtyTab0).last()).toBeVisible();
}

test.describe('WS-01: Speichern als Arbeitsbereich und Neustart-Restore (4T-0537/4T-0538)', () => {
  test('saveAs setzt Titel und Untermenue, der offene Arbeitsbereich ueberlebt den Neustart', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await expect(first.page.locator(SEL.tabs0).first()).toBeVisible();
      await armMenuCapture(first.app);

      const result = await first.page.evaluate(() =>
        window.api.workspaceSaveAs({ name: 'Projekt Alpha', color: 'green' }),
      );
      expect(result.ok).toBe(true);

      // Titel traegt den Arbeitsbereichs-Namen an der Stelle der App-Nummer.
      await expect.poll(() => first.page.title()).toContain('(Arbeitsbereich Projekt Alpha)');

      // Ablage: genau ein Eintrag, offen, mit gewaehlter Farbe.
      const list = await first.page.evaluate(() => window.api.workspacesList());
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'Projekt Alpha', color: 'green', open: true });

      // Untermenue des Datei-Menues listet den Arbeitsbereich (sprachfrei
      // ueber den Namen geprueft).
      await expect.poll(() => capturedMenuLabels(first.app)).toContain('Projekt Alpha');

      // Neustart: der offene Arbeitsbereich kommt mit Datei-Tab und Titel zurueck.
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect.poll(() => second.page.title()).toContain('(Arbeitsbereich Projekt Alpha)');
        await expect.poll(() => second.page.locator(SEL.tabs0).count()).toBe(1);
        const list2 = await second.page.evaluate(() => window.api.workspacesList());
        expect(list2[0]).toMatchObject({ name: 'Projekt Alpha', open: true });
      } finally {
        await closeApp(second.app, null);
      }
    } finally {
      await closeApp(first.app, userData);
    }
  });
});

test.describe('WS-02: Schliessen friert ein, Wiederoeffnen fokussiert statt dupliziert (4T-0537)', () => {
  test('close friert den Stand ein, open stellt her, zweites open fokussiert nur', async () => {
    const { app, page, userData } = await launchApp();
    try {
      // Leeren Arbeitsbereich anlegen: eigenes Fenster als zweite App.
      const win2Promise = app.waitForEvent('window');
      const created = await page.evaluate(() =>
        window.api.workspaceCreate({ name: 'Recherche', color: 'blue' }),
      );
      expect(created.ok).toBe(true);
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      await expect.poll(() => page2.title()).toContain('(Arbeitsbereich Recherche)');
      await expect.poll(() => windowCount(app)).toBe(2);

      // Schliessen aus dem Arbeitsbereichs-Fenster: Fenster weg, Ablage
      // meldet zu (Laufzeit-Zustand).
      await closeWorkspaceFrom(page2);
      await expect.poll(() => windowCount(app)).toBe(1);
      await expect
        .poll(async () => (await page.evaluate(() => window.api.workspacesList()))[0].open)
        .toBe(false);

      // Wiederoeffnen stellt das Fenster her; erneutes Oeffnen dupliziert nicht.
      const win3Promise = app.waitForEvent('window');
      await page.evaluate(async () => {
        const list = await window.api.workspacesList();
        return window.api.workspaceOpen(list[0].id);
      });
      const page3 = await win3Promise;
      await page3.waitForLoadState('domcontentloaded');
      await expect.poll(() => page3.title()).toContain('(Arbeitsbereich Recherche)');
      await expect.poll(() => windowCount(app)).toBe(2);

      const secondOpen = await page.evaluate(async () => {
        const list = await window.api.workspacesList();
        return window.api.workspaceOpen(list[0].id);
      });
      expect(secondOpen.focusedExisting).toBe(true);
      await expect.poll(() => windowCount(app)).toBe(2);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('WS-03: Unbenannt-Entwurf gehoert zum Arbeitsbereich (4T-0539)', () => {
  test('Entwurf bleibt beim normalen Start liegen und kehrt mit dem Arbeitsbereich zurueck', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      // Arbeitsbereich mit einem getippten Unbenannt-Entwurf, dann schliessen:
      // der Entwurf wandert mit Arbeitsbereichs-Zuordnung in den Speicher.
      const win2Promise = first.app.waitForEvent('window');
      await first.page.evaluate(() =>
        window.api.workspaceCreate({ name: 'Entwurfsraum', color: 'purple' }),
      );
      const page2 = await win2Promise;
      await page2.waitForLoadState('domcontentloaded');
      await addDraftTabTo(first.app, page2, 'WS-ENTWURF');

      await closeWorkspaceFrom(page2);
      await expect.poll(() => windowCount(first.app)).toBe(1);
      await expect.poll(() => draftFileCount(userData)).toBe(1);

      // Neustart: der geschlossene Arbeitsbereich oeffnet nicht, sein
      // Entwurf erscheint nirgends und bleibt im Speicher liegen.
      await first.app.evaluate(({ app }) => app.quit());
      await first.app.waitForEvent('close');

      const second = await launchApp({ userData });
      try {
        await expect.poll(() => windowCount(second.app)).toBe(1);
        await expect(second.page.locator(SEL.dirtyTab0)).toHaveCount(0);
        expect(draftFileCount(userData)).toBe(1);

        // Arbeitsbereich oeffnen: der Entwurf kehrt als dirty Unbenannt-Tab
        // zurueck, der Speicher ist danach leer.
        const win3Promise = second.app.waitForEvent('window');
        await second.page.evaluate(async () => {
          const list = await window.api.workspacesList();
          return window.api.workspaceOpen(list[0].id);
        });
        const page3 = await win3Promise;
        await page3.waitForLoadState('domcontentloaded');
        await expect.poll(() => page3.locator(SEL.dirtyTab0).count()).toBe(1);
        await expect(page3.locator(SEL.editorContent0)).toContainText('WS-ENTWURF');
        await expect.poll(() => draftFileCount(userData)).toBe(0);
      } finally {
        await closeApp(second.app, null, { force: true });
      }
    } finally {
      await closeApp(first.app, userData, { force: true });
    }
  });
});

test.describe('WS-04: Loeschen degradiert den offenen Arbeitsbereich (4T-0537)', () => {
  test('delete entfernt die Ablage, das Fenster laeuft als unbenannte App weiter', async () => {
    const { app, page, userData } = await launchApp();
    try {
      const saved = await page.evaluate(() =>
        window.api.workspaceSaveAs({ name: 'Kurzlebig', color: 'red' }),
      );
      expect(saved.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Kurzlebig)');

      const deleted = await page.evaluate(async () => {
        const list = await window.api.workspacesList();
        return window.api.workspaceDelete(list[0].id);
      });
      expect(deleted.ok).toBe(true);

      // Fenster bleibt offen, Titel verliert den Arbeitsbereichs-Teil
      // (Solo-App ohne Suffix), die Ablage ist leer.
      await expect.poll(() => windowCount(app)).toBe(1);
      await expect.poll(() => page.title()).toBe('EM4me');
      expect(await page.evaluate(() => window.api.workspacesList())).toEqual([]);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('WS-05: Erweiterung aus nimmt Zugaenge, laesst die Ablage (4T-0538)', () => {
  test('Untermenue-Block und Titel-Teil verschwinden und kehren zurueck, die Ablage bleibt', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await armMenuCapture(app);
      await page.evaluate(() => window.api.workspaceSaveAs({ name: 'Bestand', color: 'cyan' }));
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Bestand)');
      await expect.poll(() => capturedMenuLabels(app)).toContain('Bestand');

      // Erweiterung aus: Menue-Block weg, Titel ohne Arbeitsbereichs-Teil.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['workspaces']));
      await expect.poll(() => capturedMenuLabels(app)).not.toContain('Bestand');
      await expect.poll(() => page.title()).toBe('EM4me');

      // Wieder einschalten: alles ohne Verlust zurueck.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', []));
      await expect.poll(() => capturedMenuLabels(app)).toContain('Bestand');
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Bestand)');
      const list = await page.evaluate(() => window.api.workspacesList());
      expect(list[0]).toMatchObject({ name: 'Bestand', color: 'cyan', open: true });
    } finally {
      await closeApp(app, userData);
    }
  });
});

// Regressionstest 4T-0633 (Epic 3E-0102, PO-Befund der Release-Test-
// Iteration): Der Namens-und-Farb-Dialog ("Umbenennen und Farbe...")
// oeffnete AUS dem Verwaltungs-Dialog heraus UNTER diesem (beide teilten
// z-index 3000, der spaetere DOM-Knoten gewann) und war unbedienbar.
// Playwright-Actionability (fill/click mit Hit-Test am Aktionspunkt)
// schlaegt bei verdecktem Element fehl — genau der Befund.
test.describe('WS-06: Umbenennen-Dialog liegt ueber dem Verwaltungs-Dialog (4T-0633)', () => {
  test('Aus "Verwalten" geoeffneter Namens-und-Farb-Dialog ist bedienbar', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await page.evaluate(() => window.api.workspaceSaveAs({ name: 'Alpha', color: 'blue' }));
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Alpha)');

      // Verwaltungs-Dialog ueber den Menue-Kanal oeffnen — gepollt, weil
      // Sends vor dem fertigen init() verfallen (Muster addDraftTabTo).
      const manager = page.locator('#workspace-manager-modal');
      await expect
        .poll(
          async () => {
            if (!(await manager.isVisible())) {
              await app.evaluate(({ BrowserWindow }) => {
                BrowserWindow.getAllWindows()[0].webContents.send('menu:workspaceManage');
              });
            }
            return manager.isVisible();
          },
          { intervals: [500, 500, 1000, 1000] },
        )
        .toBe(true);
      await expect(manager.locator('.workspace-row-name')).toHaveText('Alpha');

      // Zweiter Knopf der Zeile = "Umbenennen und Farbe...".
      await manager.locator('.workspace-row .btn').nth(1).click();
      const dialog = page.locator('#workspace-modal');
      await expect(dialog).toBeVisible();

      // Bedienbarkeit trotz weiterhin offenem Verwaltungs-Dialog: Eingabe
      // ins Namensfeld und Klick auf einen Farb-Swatch muessen den Dialog
      // treffen (vor dem Fix deckte der Verwaltungs-Dialog beide ab).
      await page.fill('#workspace-name', 'Alpha umbenannt');
      await page.locator('#workspace-colors .tab-group-swatch[data-color="green"]').click();
      await page.locator('#btn-workspace-ok').click();
      await expect(dialog).toBeHidden();

      // Wirkung kam an (Umbenennen + Farbe), Verwaltungs-Dialog offen.
      await expect.poll(() => page.title()).toContain('(Arbeitsbereich Alpha umbenannt)');
      const list = await page.evaluate(() => window.api.workspacesList());
      expect(list[0]).toMatchObject({ name: 'Alpha umbenannt', color: 'green' });
      await expect(manager).toBeVisible();
      await page.locator('#btn-workspace-manager-close').click();
      await expect(manager).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });
});
