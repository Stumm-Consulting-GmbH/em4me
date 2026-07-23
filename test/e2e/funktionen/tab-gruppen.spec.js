// 4T-0460/4T-0461 (Epic 3E-0085): E2E-Funktions-Suite — Tab-Gruppen.
// Deckt die Menue-Fluesse (anlegen, hinzufuegen, entfernen, umbenennen/
// Farbe, aufloesen, schliessen), das Klappen mit Aktivierungs-Wechsel,
// das Ziehen auf den Gruppen-Kopf, die Sitzungs-Wiederherstellung und
// den Aus-Zustand der Erweiterung tab-groups ab. Der Dirty-Dialog-Fall
// beim Gruppen-Schliessen bleibt manueller PO-Pruefpunkt (nativer Dialog).
// 4T-0648 (Epic 3E-0130): TG-13 bis TG-15 pruefen die Einfuege-Position der
// per Dokument-Klick geoeffneten Reiter (neben der Herkunft).
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FIX = (name) =>
  path.resolve(__dirname, '..', '..', 'fixtures', 'funktionen', `tab-gruppen-${name}.md`);
const THREE_FILES = [FIX('a'), FIX('b'), FIX('c')];

const MENU_ITEM = (id) => `#context-menu [data-menu-id="${id}"]`;
const MODAL = '#tab-group-modal';

async function waitForTabs(page, count) {
  await expect(page.locator(SEL.tabs0)).toHaveCount(count);
}

// Rechtsklick auf den Tab mit Titel-Text und Klick auf einen Menuepunkt.
async function tabMenuAction(page, tabText, menuId) {
  await page.locator(SEL.tabs0, { hasText: tabText }).click({ button: 'right' });
  await page.locator(MENU_ITEM(menuId)).click();
}

// Neue Gruppe mit dem Tab bilden; der automatisch geoeffnete Dialog wird
// mit Name/Farbe bestaetigt (Standard-Fluss aus 4T-0461).
async function createGroupWithTab(page, tabText, { name, color } = {}) {
  await page.locator(SEL.tabs0, { hasText: tabText }).click({ button: 'right' });
  await page.locator(MENU_ITEM('tabgroup-new')).click();
  await expect(page.locator(MODAL)).toBeVisible();
  if (name !== undefined) await page.locator('#tab-group-name').fill(name);
  if (color) await page.locator(`.tab-group-swatch[data-color="${color}"]`).click();
  await page.locator('#btn-tab-group-ok').click();
  await expect(page.locator(MODAL)).toBeHidden();
}

// Struktur des Tab-Streifens in Pane 0 als Kategorie-Liste ('head' | 'grouped'
// | 'tab', in Streifen-Reihenfolge) — beweist Zusammenhang und Einfuege-Ort.
async function readStrip(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.pane-group[data-pane="0"] .tabbar > *')].map((el) =>
      el.classList.contains('tab-group-head')
        ? 'head'
        : el.classList.contains('tab-grouped')
          ? 'grouped'
          : 'tab',
    ),
  );
}

// Nicht-Dokument-Oeffnungs-Pfad: externes 'file:openExternal' (Doppelklick/
// "Oeffnen mit"). Landet ueber openInPane OHNE inheritGroup — dient dem
// Negativ-Fall (4T-0631).
async function openExternalFile(app, filePath) {
  await app.evaluate(({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('file:openExternal', [p]);
  }, filePath);
}

test.describe('TG-01: Gruppe anlegen ueber das Tab-Kontextmenue', () => {
  test('Neue Gruppe mit Dialog (Name, Farbe); Kopf und Reiter-Kennung erscheinen', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      // Dialog ist mit Standard-Name "Gruppe 1" vorbelegt.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-a' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-new')).click();
      await expect(page.locator(MODAL)).toBeVisible();
      await expect(page.locator('#tab-group-name')).toHaveValue('Gruppe 1');
      await page.locator('#tab-group-name').fill('Recherche');
      await page.locator('.tab-group-swatch[data-color="red"]').click();
      await page.locator('#btn-tab-group-ok').click();

      await expect(page.locator(SEL.groupHeads0)).toHaveCount(1);
      await expect(page.locator(SEL.groupHeadLabel0)).toHaveText('Recherche');
      const style = await page.locator(SEL.groupHeads0).getAttribute('style');
      expect(style).toContain('var(--tab-group-red)');
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(1);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-02: Zu Gruppe hinzufuegen und aus Gruppe entfernen', () => {
  test('Untermenue fuegt hinzu (zusammenhaengend), Entfernen stellt den Tab hinter den Block', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche' });

      // "Zu Gruppe hinzufuegen" ist ein Untermenue mit den Gruppen der Leiste.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-c' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-add')).hover();
      await page
        .locator(`${MENU_ITEM('tabgroup-add')} .context-menu-submenu .context-menu-item`, {
          hasText: 'Recherche',
        })
        .click();
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);
      // Zusammenhang: die beiden gruppierten Reiter folgen direkt auf den Kopf.
      const strip = await page.evaluate(() =>
        [...document.querySelectorAll('.pane-group[data-pane="0"] .tabbar > *')].map((el) =>
          el.classList.contains('tab-group-head')
            ? 'head'
            : el.classList.contains('tab-grouped')
              ? 'grouped'
              : 'tab',
        ),
      );
      expect(strip).toEqual(['head', 'grouped', 'grouped', 'tab']);

      await tabMenuAction(page, 'tab-gruppen-c', 'tabgroup-remove');
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(1);
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-03: Klappen ueber den Gruppen-Kopf', () => {
  test('Zuklappen verbirgt Mitglieder, zeigt die Zahl und wechselt den aktiven Tab', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche' });
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-b' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-add')).hover();
      await page
        .locator(`${MENU_ITEM('tabgroup-add')} .context-menu-submenu .context-menu-item`, {
          hasText: 'Recherche',
        })
        .click();

      // Mitglied aktivieren, dann zuklappen: Aktivierung wechselt nach 'c'.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-a' }).click();
      await expect(page.locator(SEL.activeTab0)).toContainText('tab-gruppen-a');
      await page.locator(SEL.groupHeads0).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(SEL.groupHeadCount0)).toHaveText('2');
      await expect(page.locator(SEL.activeTab0)).toContainText('tab-gruppen-c');

      // Aufklappen stellt die Mitglieder wieder her.
      await page.locator(SEL.groupHeads0).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      await expect(page.locator(SEL.groupHeadCount0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-04: Umbenennen und Farbe ueber das Kopf-Kontextmenue', () => {
  test('Dialog aendert Name und Farbe des Kopfs', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche', color: 'blue' });

      await page.locator(SEL.groupHeads0).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-rename')).click();
      await expect(page.locator(MODAL)).toBeVisible();
      await expect(page.locator('#tab-group-name')).toHaveValue('Recherche');
      await page.locator('#tab-group-name').fill('Projekt');
      await page.locator('.tab-group-swatch[data-color="purple"]').click();
      await page.locator('#btn-tab-group-ok').click();

      await expect(page.locator(SEL.groupHeadLabel0)).toHaveText('Projekt');
      const style = await page.locator(SEL.groupHeads0).getAttribute('style');
      expect(style).toContain('var(--tab-group-purple)');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-05: Gruppe aufloesen und Gruppe schliessen', () => {
  test('Aufloesen laesst Tabs offen; Schliessen schliesst alle Mitglieder', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche' });
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-b' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-add')).hover();
      await page
        .locator(`${MENU_ITEM('tabgroup-add')} .context-menu-submenu .context-menu-item`, {
          hasText: 'Recherche',
        })
        .click();

      // Aufloesen: Kopf verschwindet, alle drei Tabs bleiben offen.
      await page.locator(SEL.groupHeads0).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-dissolve')).click();
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(0);
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(0);

      // Erneut gruppieren und schliessen: nur der ungruppierte Tab bleibt.
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Weg damit' });
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-b' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-add')).hover();
      await page
        .locator(`${MENU_ITEM('tabgroup-add')} .context-menu-submenu .context-menu-item`, {
          hasText: 'Weg damit',
        })
        .click();
      await page.locator(SEL.groupHeads0).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-close')).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(SEL.tabs0)).toContainText('tab-gruppen-c');
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-06: Ziehen auf den Gruppen-Kopf (Beitritt)', () => {
  test('Drop eines Tabs auf den Kopf haengt ihn ans Block-Ende an', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche' });
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(1);

      // HTML5-Drag synthetisch (ein DataTransfer ueber dragstart -> drop;
      // Chromium erlaubt programmatische DataTransfer-Objekte).
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.pane-group[data-pane="0"] .tabbar .tab')];
        const source = tabs.find((el) => el.textContent.includes('tab-gruppen-c'));
        const head = document.querySelector('.pane-group[data-pane="0"] .tabbar .tab-group-head');
        const dataTransfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
        head.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
        head.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
        source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
      });

      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);
      const strip = await page.evaluate(() =>
        [...document.querySelectorAll('.pane-group[data-pane="0"] .tabbar > *')].map((el) =>
          el.classList.contains('tab-group-head')
            ? 'head'
            : el.classList.contains('tab-grouped')
              ? 'grouped'
              : 'tab',
        ),
      );
      expect(strip).toEqual(['head', 'grouped', 'grouped', 'tab']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-07: Sitzungs-Wiederherstellung mit Gruppen', () => {
  test('Name, Farbe, Mitglieder und Klapp-Zustand ueberleben den Neustart', async () => {
    const first = await launchApp({ args: THREE_FILES });
    const userData = first.userData;
    try {
      const { page } = first;
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche', color: 'green' });
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-b' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-add')).hover();
      await page
        .locator(`${MENU_ITEM('tabgroup-add')} .context-menu-submenu .context-menu-item`, {
          hasText: 'Recherche',
        })
        .click();
      // Zuklappen — der Klapp-Zustand soll die Sitzung ueberleben.
      await page.locator(SEL.groupHeads0).click();
      await expect(page.locator(SEL.groupHeadCount0)).toHaveText('2');
      await closeApp(first.app, null);
    } catch (err) {
      await closeApp(first.app, userData);
      throw err;
    }

    const second = await launchApp({ userData });
    try {
      const { page } = second;
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(1);
      await expect(page.locator(SEL.groupHeadLabel0)).toHaveText('Recherche');
      const style = await page.locator(SEL.groupHeads0).getAttribute('style');
      expect(style).toContain('var(--tab-group-green)');
      // Zugeklappt wiederhergestellt: nur der ungruppierte Tab ist sichtbar.
      await expect(page.locator(SEL.groupHeadCount0)).toHaveText('2');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      // Aufklappen zeigt die Mitglieder wieder.
      await page.locator(SEL.groupHeads0).click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
    } finally {
      await closeApp(second.app, userData);
    }
  });
});

test.describe('TG-08: Aus-Zustand der Erweiterung tab-groups', () => {
  test('Abschalten rendert flach (Modell bleibt), Einschalten stellt die Gruppe wieder her', async () => {
    const { app, page, userData } = await launchApp({ args: THREE_FILES });
    try {
      await waitForTabs(page, 3);
      await createGroupWithTab(page, 'tab-gruppen-a', { name: 'Recherche' });
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(1);

      // Erweiterung abschalten (Einstellungs-Seite, Bereich Erweiterungen).
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.pane-group[data-pane="0"] .pane-system .settings-page').count();
        })
        .toBeGreaterThan(0);
      await page
        .locator('.settings-page .settings-nav-entry[data-section-id="extensions"]')
        .click();
      await page.locator('#settings-extension-tab-groups').uncheck();
      await page.locator('#btn-settings-ok').click();

      await expect(page.locator(SEL.groupHeads0)).toHaveCount(0);
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(0);
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      // Kontextmenue ohne Gruppen-Eintraege.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-c' }).click({ button: 'right' });
      await expect(page.locator('#context-menu')).toBeVisible();
      await expect(page.locator(MENU_ITEM('tabgroup-new'))).toHaveCount(0);
      await page.keyboard.press('Escape');

      // Wieder einschalten: die Gruppe kehrt unveraendert zurueck.
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.pane-group[data-pane="0"] .pane-system .settings-page').count();
        })
        .toBeGreaterThan(0);
      await page
        .locator('.settings-page .settings-nav-entry[data-section-id="extensions"]')
        .click();
      await page.locator('#settings-extension-tab-groups').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(1);
      await expect(page.locator(SEL.groupHeadLabel0)).toHaveText('Recherche');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-09: Link-Klick im Render-Modus erbt die Tab-Gruppe (4T-0631)', () => {
  test('Wiki-Link im gerenderten Dokument oeffnet das Ziel in der Gruppe und aktiviert es', async () => {
    // Setup: A (mit Wiki-Link auf B) und ein ungruppierter C hinter der Gruppe,
    // damit der Einfuege-Ort (in der Gruppe, nicht am Streifen-Ende) beweisbar ist.
    const { app, page, userData } = await launchApp({ args: [FIX('link-a'), FIX('c')] });
    try {
      await waitForTabs(page, 2);
      await createGroupWithTab(page, 'tab-gruppen-link-a', { name: 'Recherche' });
      // A aktivieren, damit der Render-Pane A samt Wiki-Link zeigt.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      const link = page.locator(`${SEL.markdownBody0} a.wikilink`);
      await expect(link).toBeVisible();
      // Realer Nutzungspfad: den gerenderten Link wirklich klicken.
      await link.click();

      // B ist geoeffnet, aktiv und Mitglied derselben Gruppe.
      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      await expect(page.locator(SEL.activeTab0)).toContainText('tab-gruppen-link-b');
      await expect(page.locator(SEL.activeTab0)).toHaveClass(/tab-grouped/);
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);
      // Neben der Herkunft eingefuegt: Kopf, A, B, danach der ungruppierte C.
      expect(await readStrip(page)).toEqual(['head', 'grouped', 'grouped', 'tab']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-10: Link-Klick im Live-Modus erbt die Tab-Gruppe (4T-0631)', () => {
  test('Live-Wiki-Link oeffnet das Ziel in der Gruppe und aktiviert es', async () => {
    const { app, page, userData } = await launchApp({ args: [FIX('link-a'), FIX('c')] });
    try {
      await waitForTabs(page, 2);
      await createGroupWithTab(page, 'tab-gruppen-link-a', { name: 'Recherche' });
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      // Live-Modus des aktiven Tabs A: Cursor steht auf Zeile 1, der Link liegt
      // darunter und ist damit als cm-live-wikilink dekoriert. Editor-Selektor
      // mit .pane-source qualifizieren (zweite CodeMirror-Instanz im DOM).
      await page.locator(SEL.viewBtn('live')).click();
      const link = page.locator('.pane-group[data-pane="0"] .pane-source .cm-live-wikilink');
      await expect(link.first()).toBeVisible();
      await link.first().click();

      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      await expect(page.locator(SEL.activeTab0)).toContainText('tab-gruppen-link-b');
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);
      expect(await readStrip(page)).toEqual(['head', 'grouped', 'grouped', 'tab']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-11: Nicht-Dokument-Oeffnung erbt keine Gruppe (4T-0631)', () => {
  test('Externes Oeffnen bei aktivem Gruppen-Tab haengt den neuen Tab ungruppiert ans Streifen-Ende', async () => {
    const { app, page, userData } = await launchApp({ args: [FIX('link-a')] });
    try {
      await waitForTabs(page, 1);
      await createGroupWithTab(page, 'tab-gruppen-link-a', { name: 'Recherche' });
      // A ist aktiv und gruppiert; eine weitere Datei ueber den externen
      // Oeffnen-Pfad (kein Dokument-Klick) darf NICHT in die Gruppe wandern.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      await openExternalFile(app, FIX('c'));

      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.activeTab0)).toContainText('tab-gruppen-c');
      // C bleibt ungruppiert; nur A ist Gruppen-Mitglied.
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(1);
      expect(await readStrip(page)).toEqual(['head', 'grouped', 'tab']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-12: Geerbtes Gruppen-Mitglied ueberlebt den Neustart (4T-0631)', () => {
  test('Ein per Link-Klick beigetretener Tab ist nach dem Neustart wieder Gruppen-Mitglied', async () => {
    const first = await launchApp({ args: [FIX('link-a')] });
    const userData = first.userData;
    try {
      const { page } = first;
      await waitForTabs(page, 1);
      await createGroupWithTab(page, 'tab-gruppen-link-a', { name: 'Recherche', color: 'green' });
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      const link = page.locator(`${SEL.markdownBody0} a.wikilink`);
      await expect(link).toBeVisible();
      await link.click();
      // Vorbedingung: B ist der Gruppe per Vererbung beigetreten (zwei Mitglieder).
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);
      await closeApp(first.app, null);
    } catch (err) {
      await closeApp(first.app, userData);
      throw err;
    }

    const second = await launchApp({ userData });
    try {
      const { page } = second;
      await expect(page.locator(SEL.groupHeads0)).toHaveCount(1);
      await expect(page.locator(SEL.groupHeadLabel0)).toHaveText('Recherche');
      // Gruppe samt geerbtem Mitglied B wiederhergestellt: zwei gruppierte Tabs.
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);
      const style = await page.locator(SEL.groupHeads0).getAttribute('style');
      expect(style).toContain('var(--tab-group-green)');
    } finally {
      await closeApp(second.app, userData);
    }
  });
});

// 4T-0648 (Epic 3E-0130): Der per Dokument-Klick geoeffnete Reiter liegt
// unmittelbar rechts neben seinem Herkunfts-Reiter, nicht mehr am Gruppen-
// oder Streifen-Ende. Bei einer Gruppe mit nur einem Mitglied sind beide Orte
// identisch — die Faelle unten stellen die Herkunft deshalb bewusst VOR ein
// weiteres Element.

test.describe('TG-13: Link-Klick oeffnet neben der Herkunft im Gruppen-Block (4T-0648)', () => {
  test('Herkunft ist das erste von zwei Mitgliedern; das Ziel landet dazwischen', async () => {
    const { app, page, userData } = await launchApp({ args: [FIX('link-a'), FIX('c')] });
    try {
      await waitForTabs(page, 2);
      await createGroupWithTab(page, 'tab-gruppen-link-a', { name: 'Recherche' });
      // C derselben Gruppe hinzufuegen: Block ist [link-a, c], die Herkunft
      // link-a steht vorn. Am Gruppen-Ende (Verhalten vor 4T-0648) waere das
      // Ziel hinter c gelandet.
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-c' }).click({ button: 'right' });
      await page.locator(MENU_ITEM('tabgroup-add')).hover();
      await page
        .locator(`${MENU_ITEM('tabgroup-add')} .context-menu-submenu .context-menu-item`, {
          hasText: 'Recherche',
        })
        .click();
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(2);

      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      const link = page.locator(`${SEL.markdownBody0} a.wikilink`);
      await expect(link).toBeVisible();
      await link.click();

      await expect(page.locator(SEL.tabs0)).toHaveCount(3);
      await expect(page.locator(SEL.activeTab0)).toContainText('tab-gruppen-link-b');
      // Reihenfolge: Herkunft, Ziel, dann das dritte Mitglied.
      await expect(page.locator(SEL.tabs0).nth(0)).toContainText('tab-gruppen-link-a');
      await expect(page.locator(SEL.tabs0).nth(1)).toContainText('tab-gruppen-link-b');
      await expect(page.locator(SEL.tabs0).nth(2)).toContainText('tab-gruppen-c');
      // Der Block bleibt zusammenhaengend, das Ziel ist Mitglied.
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(3);
      expect(await readStrip(page)).toEqual(['head', 'grouped', 'grouped', 'grouped']);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-14: Link-Klick oeffnet neben der Herkunft ohne Gruppe (4T-0648)', () => {
  test('Herkunft in der Streifen-Mitte; das Ziel landet dahinter statt am Ende', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIX('a'), FIX('link-a'), FIX('c')],
    });
    try {
      await waitForTabs(page, 3);
      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      const link = page.locator(`${SEL.markdownBody0} a.wikilink`);
      await expect(link).toBeVisible();
      await link.click();

      await expect(page.locator(SEL.tabs0)).toHaveCount(4);
      await expect(page.locator(SEL.tabs0).nth(0)).toContainText('tab-gruppen-a');
      await expect(page.locator(SEL.tabs0).nth(1)).toContainText('tab-gruppen-link-a');
      await expect(page.locator(SEL.tabs0).nth(2)).toContainText('tab-gruppen-link-b');
      await expect(page.locator(SEL.tabs0).nth(3)).toContainText('tab-gruppen-c');
      // Ohne Gruppe bleibt das Ziel ungruppiert.
      await expect(page.locator(SEL.groupedTabs0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('TG-15: Positions-Regel gilt bei abgeschalteter Erweiterung (4T-0648)', () => {
  test('Ohne tab-groups landet das Ziel ebenfalls neben seiner Herkunft', async () => {
    const { app, page, userData } = await launchApp({
      args: [FIX('a'), FIX('link-a'), FIX('c')],
    });
    try {
      await waitForTabs(page, 3);
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+,');
          return page.locator('.pane-group[data-pane="0"] .pane-system .settings-page').count();
        })
        .toBeGreaterThan(0);
      await page
        .locator('.settings-page .settings-nav-entry[data-section-id="extensions"]')
        .click();
      await page.locator('#settings-extension-tab-groups').uncheck();
      await page.locator('#btn-settings-ok').click();
      await waitForTabs(page, 3);

      await page.locator(SEL.tabs0, { hasText: 'tab-gruppen-link-a' }).click();
      const link = page.locator(`${SEL.markdownBody0} a.wikilink`);
      await expect(link).toBeVisible();
      await link.click();

      await expect(page.locator(SEL.tabs0)).toHaveCount(4);
      await expect(page.locator(SEL.tabs0).nth(1)).toContainText('tab-gruppen-link-a');
      await expect(page.locator(SEL.tabs0).nth(2)).toContainText('tab-gruppen-link-b');
    } finally {
      await closeApp(app, userData);
    }
  });
});
