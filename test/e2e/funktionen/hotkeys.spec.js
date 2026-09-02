// 4T-000208 (Epic 3E-000015): E2E-Funktions-Suite — konfigurierbare
// Tastenkuerzel. Tastenkuerzel-Bereich der Einstellungs-Seite (4T-000279)
// mit Capture, Konflikt-Erkennung, Entfernen/Reset, Draft-Semantik
// (Abbrechen) und Persistenz ueber den App-Neustart (zweiter
// electron.launch mit demselben Temp-Profil).
// describe-Titel tragen die Matrix-IDs aus test/abdeckungs-matrix.json.
'use strict';

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const BASIS = path.resolve(__dirname, '..', '..', 'fixtures', 'smoke', 'basis.md');
const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function waitForTab(page) {
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// 4T-000279: Einstellungen sind eine Seite im Tab-System; der Bereich
// Tastenkuerzel wird ueber die Bereichsnavigation aktiviert. Poll, weil
// der Kommando-Dispatcher erst am Ende des asynchronen init() steht.
async function openSettings(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
  await page.locator('.settings-nav-entry[data-section-id="hotkeys"]').click();
  await expect(page.locator('#settings-hotkeys-list')).toBeVisible();
}

// Wartet, bis der Broadcast nach Anwenden/OK die Dispatcher-Map erreicht
// hat: die neue Kombination wird gedrueckt, bis die Suchleiste erscheint
// (openSearchBar ist idempotent; kein harter Sleep).
async function pollSearchOpensVia(page, key) {
  await expect
    .poll(async () => {
      await page.keyboard.press(key);
      return page.locator(SEL.searchBar).isVisible();
    })
    .toBe(true);
}

test.describe('HK-01: Rebinding wirkt sofort (Capture, Anwenden, Menue-Quelle)', () => {
  test('search.open auf Strg+Alt+F umbinden — neue Kombination wirkt, alte nicht mehr', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await openSettings(page);
      const row = page.locator('.hotkey-row[data-command-id="search.open"]');
      await row.scrollIntoViewIfNeeded();
      await row.locator('.hotkey-edit').click();
      await expect(row).toHaveClass(/capturing/);
      await page.keyboard.press('Control+Alt+F');
      // Capture abgeschlossen: Zeile zeigt das neue Binding als kbd-Folge.
      await expect(row).not.toHaveClass(/capturing/);
      await expect(row.locator('.hotkey-binding')).toContainText('Alt');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Neue Kombination oeffnet die Suche (Poll deckt die Broadcast-Latenz ab).
      await pollSearchOpensVia(page, 'Control+Alt+F');
      await page.keyboard.press('Escape');
      await expect(page.locator(SEL.searchBar)).toBeHidden();
      // Alte Kombination ist entbunden (Dispatch ist synchron — waere
      // Strg+F noch gemappt, waere die Leiste sofort sichtbar).
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('HK-02: Konflikt-Erkennung (Ueberschreiben und Abbrechen)', () => {
  test('Konflikt zeigt Warnung; Ueberschreiben raeumt das andere Kommando frei, Abbrechen verwirft', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await openSettings(page);
      const rowReplace = page.locator('.hotkey-row[data-command-id="search.openReplace"]');
      const rowOpen = page.locator('.hotkey-row[data-command-id="search.open"]');
      // Strg+F kollidiert mit search.open -> Inline-Warnung mit Aktionen.
      await rowReplace.scrollIntoViewIfNeeded();
      await rowReplace.locator('.hotkey-edit').click();
      await page.keyboard.press('Control+f');
      const conflict = rowReplace.locator('.hotkey-conflict');
      await expect(conflict).toBeVisible();
      await conflict.locator('.hotkey-overwrite').click();
      // search.open hat sein Binding verloren, search.openReplace traegt F.
      await expect(rowOpen.locator('.hotkey-binding')).toHaveText('—');
      await expect(rowReplace.locator('.hotkey-binding')).toContainText('F');
      // Abbrechen-Pfad: Konflikt mit file.save anstossen und verwerfen.
      await rowOpen.locator('.hotkey-edit').click();
      await page.keyboard.press('Control+s');
      await expect(rowOpen.locator('.hotkey-conflict')).toBeVisible();
      await rowOpen.locator('.hotkey-conflict-cancel').click();
      await expect(rowOpen.locator('.hotkey-binding')).toHaveText('—');
      const rowSave = page.locator('.hotkey-row[data-command-id="file.save"]');
      await expect(rowSave.locator('.hotkey-binding')).toContainText('S');
      await page.locator('#btn-settings-cancel').click();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });

  test('fixe Bindings (Tab) sind nur abbrechbar, nicht ueberschreibbar', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await openSettings(page);
      const row = page.locator('.hotkey-row[data-command-id="search.open"]');
      await row.scrollIntoViewIfNeeded();
      await row.locator('.hotkey-edit').click();
      await page.keyboard.press('Tab');
      const conflict = row.locator('.hotkey-conflict');
      await expect(conflict).toBeVisible();
      // Kein Ueberschreiben-Button bei fixen Bindings; Capture bleibt aktiv.
      await expect(conflict.locator('.hotkey-overwrite')).toHaveCount(0);
      await expect(row).toHaveClass(/capturing/);
      await page.keyboard.press('Escape');
      await expect(row).not.toHaveClass(/capturing/);
      await expect(row.locator('.hotkey-binding')).toContainText('F');
      await page.locator('#btn-settings-cancel').click();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('HK-03: Binding entfernen, Einzel-Reset und Gesamt-Reset', () => {
  test('Entfernen setzt auf unbelegt, Reset stellt den Default her', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await openSettings(page);
      const row = page.locator('.hotkey-row[data-command-id="search.open"]');
      await row.scrollIntoViewIfNeeded();
      // Entfernen (im Capture-Zustand).
      await row.locator('.hotkey-edit').click();
      await row.locator('.hotkey-remove').click();
      await expect(row.locator('.hotkey-binding')).toHaveText('—');
      // Einzel-Reset stellt den Default her und deaktiviert sich danach.
      await expect(row.locator('.hotkey-reset')).toBeEnabled();
      await row.locator('.hotkey-reset').click();
      await expect(row.locator('.hotkey-binding kbd').last()).toHaveText('F');
      await expect(row.locator('.hotkey-reset')).toBeDisabled();
      // Gesamt-Reset (zweistufig) nach erneutem Entfernen.
      await row.locator('.hotkey-edit').click();
      await row.locator('.hotkey-remove').click();
      await expect(row.locator('.hotkey-binding')).toHaveText('—');
      await page.locator('#btn-hotkeys-reset-all').click();
      await page.locator('#btn-hotkeys-reset-all').click();
      await expect(row.locator('.hotkey-binding kbd').last()).toHaveText('F');
      await page.locator('#btn-settings-cancel').click();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('HK-04: Persistenz ueber den App-Neustart', () => {
  test('Override ueberlebt den Neustart mit demselben Profil', async () => {
    const first = await launchApp({ args: [BASIS] });
    const userData = first.userData;
    try {
      await waitForTab(first.page);
      await openSettings(first.page);
      const row = first.page.locator('.hotkey-row[data-command-id="search.open"]');
      await row.scrollIntoViewIfNeeded();
      await row.locator('.hotkey-edit').click();
      await first.page.keyboard.press('Control+Alt+F');
      await expect(row).not.toHaveClass(/capturing/);
      await first.page.locator('#btn-settings-ok').click();
      await expect(first.page.locator(SETTINGS_PAGE)).toBeHidden();
      await pollSearchOpensVia(first.page, 'Control+Alt+F');
    } finally {
      // Profil behalten (kein userData-Cleanup) fuer den zweiten Start.
      await closeApp(first.app, null, { force: true });
    }
    const second = await launchApp({ userData });
    try {
      // Session-Restore oeffnet die Datei wieder; ohne Tab wirkt die
      // Suche ebenfalls (Suchleiste ist fensterglobal).
      await pollSearchOpensVia(second.page, 'Control+Alt+F');
      await second.page.keyboard.press('Escape');
      await second.page.keyboard.press('Control+f');
      await expect(second.page.locator(SEL.searchBar)).toBeHidden();
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

test.describe('HK-05: Abbrechen verwirft den Draft vollstaendig', () => {
  test('Nach Abbrechen wirkt der Default weiter, die Capture-Kombination nicht', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await openSettings(page);
      const row = page.locator('.hotkey-row[data-command-id="search.open"]');
      await row.scrollIntoViewIfNeeded();
      await row.locator('.hotkey-edit').click();
      await page.keyboard.press('Control+Alt+F');
      await expect(row).not.toHaveClass(/capturing/);
      await page.locator('#btn-settings-cancel').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Default wirkt unveraendert.
      await page.keyboard.press('Control+f');
      await expect(page.locator(SEL.searchBar)).toBeVisible();
      await page.keyboard.press('Escape');
      // Verworfene Capture-Kombination wirkt nicht.
      await page.keyboard.press('Control+Alt+F');
      await expect(page.locator(SEL.searchBar)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('HK-06: Einzel-Reset auf belegten Default warnt statt Duplikat (4T-000211)', () => {
  // Regressionstest zum Nutzer-Befund aus der Gesamtabnahme 0.28.0:
  // AutoSave auf Strg+N (Ueberschreiben raeumt Neu frei), danach Reset
  // bei Neu — vor dem Hotfix entstand Strg+N doppelt, jetzt erscheint
  // die bekannte Konflikt-Warnung mit Ueberschreiben/Abbrechen.
  test('Reset auf kollidierenden Default zeigt Konflikt-Warnung; Ueberschreiben tauscht sauber', async () => {
    const { app, page, userData } = await launchApp({ args: [BASIS] });
    try {
      await waitForTab(page);
      await openSettings(page);
      const rowAuto = page.locator('.hotkey-row[data-command-id="file.toggleAutoSave"]');
      const rowNew = page.locator('.hotkey-row[data-command-id="file.newTab"]');
      // Schritt 1: AutoSave per Capture auf Strg+N, Konflikt ueberschreiben.
      await rowAuto.scrollIntoViewIfNeeded();
      await rowAuto.locator('.hotkey-edit').click();
      await page.keyboard.press('Control+n');
      await expect(rowAuto.locator('.hotkey-conflict')).toBeVisible();
      await rowAuto.locator('.hotkey-overwrite').click();
      await expect(rowNew.locator('.hotkey-binding')).toHaveText('—');
      await expect(rowAuto.locator('.hotkey-binding')).toContainText('N');
      // Schritt 2: Einzel-Reset bei Neu — Warnung statt stillem Duplikat.
      await rowNew.locator('.hotkey-reset').click();
      await expect(rowNew.locator('.hotkey-conflict')).toBeVisible();
      // Abbrechen: beide Zeilen unveraendert, kein Duplikat.
      await rowNew.locator('.hotkey-conflict-cancel').click();
      await expect(rowNew.locator('.hotkey-binding')).toHaveText('—');
      await expect(rowAuto.locator('.hotkey-binding')).toContainText('N');
      // Schritt 3: erneut Reset, diesmal Ueberschreiben — sauberer Tausch.
      await rowNew.locator('.hotkey-reset').click();
      await expect(rowNew.locator('.hotkey-conflict')).toBeVisible();
      await rowNew.locator('.hotkey-overwrite').click();
      await expect(rowNew.locator('.hotkey-binding')).toContainText('N');
      await expect(rowAuto.locator('.hotkey-binding')).toHaveText('—');
      await page.locator('#btn-settings-cancel').click();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
