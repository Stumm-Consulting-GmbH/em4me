// 4T-0277 (Epic 3E-0049): E2E-Funktions-Suite — Einstellungs-Seite als
// System-Tab (ES-01 bis ES-04). Deckt die Tab-Infrastruktur ab: Öffnen
// über Kommando und Menü, Einfach-Instanz pro Fenster, System-Tab-Guards
// (kein Edit-Modus, View-Buttons deaktiviert) und Ausschluss aus der
// Sitzungs-Wiederherstellung. Die Bereichs-Inhalte der Seite testen die
// mit 4T-0278/4T-0279 erweiterten Specs.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

const FRONTMATTER_FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'funktionen',
  'frontmatter.md',
);

// 4T-0563 (Epic 3E-0102): Profil-Verzeichnis mit vorbefüllter electron-store-
// config.json (Muster seedProfile in sidebar-layout.spec.js) für Tests, die
// ein bestimmtes Ausgangs-Sidebar-Layout brauchen.
function seedProfile(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-settings-seed-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Menü-IPC-Kanal direkt senden (Pfad des nativen Menü-Klicks; Muster
// handbuch.spec.js).
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

// Öffnet die Seite über das Kommando Strg+, — mit Poll, weil launchApp nach
// domcontentloaded zurückkehrt, der Kommando-Dispatcher aber erst am Ende
// des asynchronen init() registriert ist (Muster pollSearchOpensVia in
// hotkeys.spec.js); Mehrfach-Druck ist durch die Einfach-Instanz gedeckt.
async function openSettingsPageViaKeyboard(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(SEL.tabs0).count();
    })
    .toBeGreaterThan(0);
}

test.describe('ES-01: Einstellungs-Seite öffnet als Tab', () => {
  test('Strg+, öffnet die Seite als Tab ohne Dirty-Marker', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(SEL.emptyState)).toBeHidden();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      await expect(page.locator(SEL.dirtyTab0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('ES-02: Einfach-Instanz pro Fenster', () => {
  test('zweites Öffnen (Menü und Kommando) aktiviert den bestehenden Tab', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await sendMenuChannel(app, 'menu:openSettings');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await page.keyboard.press('Control+,');
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('ES-03: System-Tab-Guards', () => {
  test('Edit-Stift und View-Buttons sind deaktiviert, View-Wechsel wirkungslos', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      await expect(page.locator(SEL.btnEdit)).toBeDisabled();
      for (const mode of ['live', 'source', 'split', 'rendered']) {
        await expect(page.locator(SEL.viewBtn(mode))).toBeDisabled();
      }
      // View-Wechsel über den Menü-Pfad bleibt wirkungslos (Guard in
      // setViewMode) — die Seite bleibt sichtbar.
      await sendMenuChannel(app, 'menu:viewChange', 'source');
      await expect(page.locator(SEL.content0)).toHaveClass(/view-system/);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0278: Seiten-Layout — Bereichsnavigation, Bereichs-Wechsel,
// Button-Leiste.
test.describe('ES-05: Bereichsnavigation und Button-Leiste', () => {
  test('ohne Bereich nur Gruppe Allgemein, Wechsel hebt aktiv hervor, Buttons vorhanden', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      const nav = page.locator(`${SETTINGS_PAGE} .settings-nav-entry`);
      // 4T-0555 (Epic 3E-0100): zweigeteilte Navigation. Ohne gebundenen
      // Bereich erscheint nur die Gruppe „Allgemein" mit den dreizehn
      // app-weiten festen Bereichen (Darstellung, Farbschemas, Verhalten,
      // Zeitstempel, Export, Vorlagen, Task-Status, Aufgaben, Erinnerungen,
      // Überschriften-Nummerierung, Tastenkürzel, Erweiterungen,
      // Erweiterungen extern) plus den dynamisch registrierten Bereichen
      // „Sidebar", „Panel-Reihenfolge" (4T-0569, Epic 3E-0104),
      // „Kommando-Platzierung" (4T-0520, Epic 3E-0094), „Format-Toolbar"
      // (4T-0608, Epic 3E-0114) und „Uhr" (4T-0372, Epic 3E-0069); die
      // bereichsgebundenen Sektionen (historyArea, templatesArea,
      // journals, calendarSystems, propertyProfiles) fehlen vollständig
      // (ES-13 prüft den Fall mit Bereich). „Zeitstempel" (4T-0604, Epic
      // 3E-0113) haengt an der Erweiterung frontmatter-timestamps, die
      // im frischen Profil aktiv ist. „Anlagen" (4T-0791, Epic 3E-0125) ist
      // Kern und immer sichtbar; seine Bereichs-Uebersteuerung
      // (attachmentsArea) fehlt hier wie die uebrigen bereichsgebundenen.
      await expect(nav).toHaveCount(19);
      const groups = page.locator(`${SETTINGS_PAGE} .settings-nav-group`);
      await expect(groups).toHaveCount(1);
      await expect(groups.first()).toHaveAttribute('data-nav-group', 'general');
      await expect(
        page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="journals"]`),
      ).toHaveCount(0);
      // Erster Bereich (Darstellung) ist initial aktiv.
      await expect(nav.nth(0)).toHaveClass(/active/);
      // Wechsel auf Tastenkürzel: Hervorhebung folgt, Inhalt zeigt den
      // Bereichs-Titel.
      await nav.nth(3).click();
      await expect(nav.nth(3)).toHaveClass(/active/);
      await expect(nav.nth(0)).not.toHaveClass(/active/);
      const heading = page.locator(`${SETTINGS_PAGE} .settings-section-heading`);
      await expect(heading).toHaveText(await nav.nth(3).innerText());
      // Seitenweite Button-Leiste: Abbrechen, Anwenden, OK.
      await expect(page.locator(`${SETTINGS_PAGE} .settings-page-buttons .btn`)).toHaveCount(3);
      // Abbrechen schließt den Tab.
      await page.locator(`${SETTINGS_PAGE} .settings-page-buttons .btn`).first().click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0279: migrierte Sektions-Inhalte — Live-Vorschau, Snapshot-Semantik
// von Anwenden/Abbrechen und Tab-Schließen als Abbrechen. (Task-Status-
// und Tastenkürzel-Roundtrips decken task-states.spec.js und
// hotkeys.spec.js ab.)
async function editorFontSizeVar(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size').trim(),
  );
}

test.describe('ES-06: Live-Vorschau und Abbrechen-Revert (Darstellung)', () => {
  test('Größen-Änderung wirkt sofort als CSS-Variable, Abbrechen setzt zurück', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      const sizeInput = page.locator('#settings-editor-size');
      // Entwurf ist asynchron aus dem Store gefüllt (Default 14).
      await expect(sizeInput).toHaveValue('14');
      await sizeInput.fill('20');
      await expect.poll(() => editorFontSizeVar(page)).toBe('20px');
      await page.locator('#btn-settings-cancel').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      await expect.poll(() => editorFontSizeVar(page)).toBe('14px');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('ES-07: Anwenden persistiert und setzt den Snapshot neu', () => {
  test('nach Anwenden verwirft Abbrechen nur Änderungen seit dem Anwenden', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      const sizeInput = page.locator('#settings-editor-size');
      await expect(sizeInput).toHaveValue('14');
      await sizeInput.fill('20');
      await page.locator('#btn-settings-apply').click();
      await expect.poll(() => editorFontSizeVar(page)).toBe('20px');
      // Weitere Änderung nur als Vorschau, dann Abbrechen: zurück auf den
      // Apply-Stand, nicht auf den Öffnungs-Stand.
      await sizeInput.fill('24');
      await expect.poll(() => editorFontSizeVar(page)).toBe('24px');
      await page.locator('#btn-settings-cancel').click();
      await expect.poll(() => editorFontSizeVar(page)).toBe('20px');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('ES-08: Tab-Schließen ohne Anwenden entspricht Abbrechen', () => {
  test('Schließen über das Tab-X verwirft die Live-Vorschau', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      const sizeInput = page.locator('#settings-editor-size');
      await expect(sizeInput).toHaveValue('14');
      await sizeInput.fill('22');
      await expect.poll(() => editorFontSizeVar(page)).toBe('22px');
      await page.locator(SEL.activeTab0).locator('.tab-close').click();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
      await expect.poll(() => editorFontSizeVar(page)).toBe('14px');
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0284 (Epic 3E-0050): Frontmatter-Anzeige-Schalter im Bereich
// Darstellung — Umschalten wirkt nach Anwenden/OK sofort auf offene
// Panes und persistiert über Neustarts (Store-Key render.showFrontmatter).
test.describe('ES-09: Frontmatter-Anzeige-Schalter (Darstellung)', () => {
  test('Abschalten entfernt die Frontmatter-Zeile, Wert persistiert über Neustart', async () => {
    const first = await launchApp({ args: [FRONTMATTER_FIXTURE] });
    const userData = first.userData;
    try {
      const { app, page } = first;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      const block = page.locator(`${SEL.markdownBody0} .frontmatter-block`);
      await expect(block).toBeVisible();
      // Einstellungs-Seite öffnen, Schalter im Bereich Darstellung
      // abwählen, OK (wendet an und schließt den Tab).
      await openSettingsPageViaKeyboard(page);
      const checkbox = page.locator('#settings-show-frontmatter');
      await expect(checkbox).toBeChecked();
      await checkbox.uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Der Datei-Tab ist wieder aktiv; die Zeile ist weg.
      await expect(block).toHaveCount(0);
      // Wieder einschalten wirkt ebenfalls sofort.
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator('#settings-show-frontmatter')).not.toBeChecked();
      await page.locator('#settings-show-frontmatter').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(`${SEL.markdownBody0} .frontmatter-block`)).toBeVisible();
      // Für den Persistenz-Teil erneut abschalten.
      await openSettingsPageViaKeyboard(page);
      await page.locator('#settings-show-frontmatter').uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(`${SEL.markdownBody0} .frontmatter-block`)).toHaveCount(0);
      // 4T-0577: vor dem Beenden den Abschluss des Anwendens abwarten.
      // okSettingsPage schließt den Tab erst, wenn alle Bereiche angewandt
      // UND persistiert sind; die sichtbare Wirkung im Dokument tritt früher
      // ein. Ohne dieses Warten schneidet der force-Close (app.exit(0)) den
      // Store-Schreibvorgang ab und der Neustart liest den alten Wert.
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
    } finally {
      // Profil behalten für den zweiten Start.
      await closeApp(first.app, null, { force: true });
    }
    // Neustart mit demselben Profil: Schalter bleibt aus.
    const second = await launchApp({ args: [FRONTMATTER_FIXTURE], userData });
    try {
      await expect(second.page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(second.app, 'menu:viewChange', 'rendered');
      await expect(second.page.locator(`${SEL.markdownBody0} h1`)).toBeVisible();
      await expect(second.page.locator(`${SEL.markdownBody0} .frontmatter-block`)).toHaveCount(0);
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

// 4T-0289 (Epic 3E-0051): Bereich „Sidebar" — Layout-Konfiguration über
// die Einstellungs-Seite (Entwurf-/OK-Semantik, Verschieben, Seitenwechsel,
// Gruppieren, Zurücksetzen). Wirkt auf dieselben Modell-Operationen wie das
// Drag-and-Drop (sidebar-layout.spec.js deckt den DnD-Weg ab).
test.describe('ES-10: Bereich Sidebar (Layout-Konfiguration)', () => {
  test('Seitenwechsel wirkt erst bei OK und persistiert; Zurücksetzen stellt den Default her', async () => {
    const { app, page, userData } = await launchApp({ args: [FRONTMATTER_FIXTURE] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Outline sichtbar machen, damit die Wirkung prüfbar ist.
      await page.keyboard.press('Control+Shift+I');
      const leftContainer = page.locator('.pane-group[data-pane="0"] .pane-sidebar-left');
      await expect(leftContainer.locator('.sidebar-outline')).toBeVisible();

      await openSettingsPageViaKeyboard(page);
      // 4T-0555: gezielt per Sektions-ID statt .last() (gruppierte Navigation).
      await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="sidebar"]`).click();
      const section = page.locator(`${SETTINGS_PAGE} .sidebar-settings`);
      await expect(section).toBeVisible();
      // 4T-0563 (Epic 3E-0102): der neue Standard verteilt die Panels auf beide
      // Seiten — links bookmarks, area, outline, subpages, filegraph, calendar,
      // reminders und (4T-0372, Epic 3E-0069) clock, rechts notes, properties,
      // tags, blockprops, outgoing, backlinks; die rechte Seite ist belegt, der
      // Leer-Hinweis entfällt.
      // 4T-0759 (Epic 3E-0142): links kommt das Suchergebnis-Panel hinzu (9).
      const leftList = section.locator('.sidebar-settings-list[data-side="left"]');
      const rightList = section.locator('.sidebar-settings-list[data-side="right"]');
      await expect(leftList.locator('.sidebar-settings-row')).toHaveCount(9);
      await expect(rightList.locator('.sidebar-settings-row')).toHaveCount(6);
      await expect(rightList.locator('.sidebar-settings-empty')).toHaveCount(0);

      // Outline auf die rechte Seite verschieben — Entwurf, wirkt noch nicht.
      await leftList
        .locator('.sidebar-settings-row[data-panel-id="outline"] .sidebar-settings-side')
        .click();
      await expect(rightList.locator('.sidebar-settings-row[data-panel-id="outline"]')).toHaveCount(
        1,
      );
      const rightContainer = page.locator('.pane-group[data-pane="0"] .pane-sidebar-right');
      await expect(rightContainer).toBeHidden();

      // OK wendet an: Outline erscheint rechts, Wert ist persistiert.
      await page.locator('#btn-settings-ok').click();
      await expect(rightContainer.locator('.sidebar-outline')).toBeVisible();
      await expect(leftContainer).toBeHidden();
      // 4T-0563 (Epic 3E-0102): rechts liegen im Standard bereits Slots; der
      // Seitenwechsel hängt outline hinten an. Geprüft wird die Seite, nicht
      // eine feste Slot-Zahl.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const layout = await window.api.getSetting('sidebar.layout');
            return layout.right.some((slot) => slot.panels.includes('outline'));
          }),
        )
        .toBe(true);

      // Zurücksetzen stellt das Default-Layout wieder her (nach OK).
      await openSettingsPageViaKeyboard(page);
      await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="sidebar"]`).click();
      await page.locator('#btn-sidebar-layout-reset').click();
      await page.locator('#btn-settings-ok').click();
      await expect(leftContainer.locator('.sidebar-outline')).toBeVisible();
      await expect(rightContainer).toBeHidden();
    } finally {
      await closeApp(app, userData);
    }
  });

  test('Gruppieren über den Bereich erzeugt eine Reiter-Gruppe', async () => {
    // 4T-0563 (Epic 3E-0102): explizites flaches Layout, damit 'bookmarks' und
    // 'properties' benachbarte Einzel-Slots links sind (der neue Standard legt
    // 'properties' rechts in eine Gruppe) — die Gruppier-Semantik dieses Tests
    // bleibt so unverändert prüfbar.
    const userData = seedProfile({
      sidebar: {
        layout: {
          left: [
            { panels: ['bookmarks'], active: 'bookmarks' },
            { panels: ['properties'], active: 'properties' },
          ],
          right: [],
        },
      },
    });
    const { app, page } = await launchApp({ args: [FRONTMATTER_FIXTURE], userData });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // 'bookmarks' liegt an Position 1, 'properties' folgt direkt darunter —
      // Lesezeichen sichtbar machen.
      await page.locator('#btn-bookmarks').click();
      await openSettingsPageViaKeyboard(page);
      await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="sidebar"]`).click();
      const leftList = page.locator(`${SETTINGS_PAGE} .sidebar-settings-list[data-side="left"]`);
      // Properties (Zeile unter Lesezeichen) mit Lesezeichen gruppieren.
      await leftList
        .locator('.sidebar-settings-row[data-panel-id="properties"] .sidebar-settings-group-with')
        .click();
      const group = leftList.locator('.sidebar-settings-group');
      await expect(group).toHaveCount(1);
      await expect(group.locator('.sidebar-settings-row')).toHaveCount(2);
      // Properties zusätzlich sichtbar machen, dann OK: Reiterleiste da.
      await page.locator('#btn-settings-ok').click();
      await page.locator('#btn-properties').click();
      const tabs = page.locator(
        '.pane-group[data-pane="0"] .pane-sidebar-left .sidebar-slot-tabs .sidebar-slot-tab',
      );
      await expect(tabs).toHaveCount(2);
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('ES-04: keine Sitzungs-Wiederherstellung', () => {
  test('Seite erscheint nach Neustart mit demselben Profil nicht wieder', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      await openSettingsPageViaKeyboard(first.page);
      await expect(first.page.locator(SEL.tabs0)).toHaveCount(1);
    } finally {
      // Profil behalten (kein userData-Cleanup) für den zweiten Start.
      await closeApp(first.app, null, { force: true });
    }
    const second = await launchApp({ userData });
    try {
      await expect(second.page.locator(SEL.emptyState)).toBeVisible();
      await expect(second.page.locator(SEL.tabs0)).toHaveCount(0);
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

// 4T-0383 (Epic 3E-0072): Inhalts-Breite der gerenderten Ansicht in
// Prozent — Default 80, Live-Vorschau mit Klemmen auf den Bereich 20–100,
// reale Breiten-Wirkung im Render-Pane und Persistenz über den Neustart.
async function contentWidthVar(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--content-width').trim(),
  );
}

test.describe('ES-11: Inhalts-Breite in Prozent (Darstellung)', () => {
  test('Default 80, Klemmen auf 100, Breite wirkt real, Wert übersteht den Neustart', async () => {
    const first = await launchApp({ args: [FRONTMATTER_FIXTURE] });
    const userData = first.userData;
    try {
      const { app, page } = first;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await sendMenuChannel(app, 'menu:viewChange', 'rendered');
      await expect(page.locator(`${SEL.markdownBody0} h1`)).toBeVisible();
      // Startzustand: Default 80 Prozent.
      await expect.poll(() => contentWidthVar(page)).toBe('80%');
      await openSettingsPageViaKeyboard(page);
      const widthInput = page.locator('#settings-content-width');
      await expect(widthInput).toHaveValue('80');
      // Live-Vorschau: Wert außerhalb des Bereichs klemmt auf 100.
      await widthInput.fill('150');
      await expect.poll(() => contentWidthVar(page)).toBe('100%');
      // Gültiger Wert 50; OK wendet an und schließt die Seite.
      await widthInput.fill('50');
      await expect.poll(() => contentWidthVar(page)).toBe('50%');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      // Reale Wirkung: .markdown-body nimmt etwa die halbe Innen-Breite
      // des Render-Panes ein (Eltern-Padding herausgerechnet).
      const ratio = await page.evaluate(() => {
        const body = document.querySelector(
          '.pane-group[data-pane="0"] .pane-rendered .markdown-body',
        );
        const parent = body.parentElement;
        const cs = getComputedStyle(parent);
        const inner = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return body.getBoundingClientRect().width / inner;
      });
      expect(Math.abs(ratio - 0.5)).toBeLessThan(0.02);
    } finally {
      // Profil behalten (kein userData-Cleanup) für den zweiten Start.
      await closeApp(first.app, null, { force: true });
    }
    // Neustart mit demselben Profil: Wert bleibt 50 Prozent.
    const second = await launchApp({ args: [FRONTMATTER_FIXTURE], userData });
    try {
      await expect(second.page.locator(SEL.tabs0).first()).toBeVisible();
      await expect.poll(() => contentWidthVar(second.page)).toBe('50%');
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

// 4T-0554 (Epic 3E-0100): Speicher-Status der Schaltflächen — „Anwenden"
// und „OK" tragen die Primary-Hervorhebung nur bei ungesicherten
// Änderungen; „Anwenden" ist ohne Änderungen deaktiviert, „OK" bleibt
// immer klickbar und schließt die Seite auch ohne Änderungen.
test.describe('ES-12: Speicher-Status von Anwenden/OK', () => {
  test('Buttons spiegeln den Dirty-Status, Anwenden setzt zurück, OK schließt clean', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      const applyBtn = page.locator('#btn-settings-apply');
      const okBtn = page.locator('#btn-settings-ok');
      // Ohne Änderungen: Anwenden deaktiviert und neutral, OK neutral.
      await expect(applyBtn).toBeDisabled();
      await expect(applyBtn).not.toHaveClass(/btn-primary/);
      await expect(okBtn).toBeEnabled();
      await expect(okBtn).not.toHaveClass(/btn-primary/);
      // Wert-Änderung (Darstellung, Editor-Größe): beide Primary,
      // Anwenden aktiv.
      const sizeInput = page.locator('#settings-editor-size');
      await expect(sizeInput).toHaveValue('14');
      await sizeInput.fill('20');
      await expect(applyBtn).toBeEnabled();
      await expect(applyBtn).toHaveClass(/btn-primary/);
      await expect(okBtn).toHaveClass(/btn-primary/);
      // Anwenden persistiert und setzt den Speicher-Status zurück.
      await applyBtn.click();
      await expect(applyBtn).toBeDisabled();
      await expect(applyBtn).not.toHaveClass(/btn-primary/);
      await expect(okBtn).not.toHaveClass(/btn-primary/);
      // OK bleibt ohne Änderungen klickbar und schließt die Seite.
      await okBtn.click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      await expect(page.locator(SEL.tabs0)).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
    }
  });
});

// 4T-0555 (Epic 3E-0100): zweigeteilte Navigation mit gebundenem Bereich —
// Gruppe „Aktueller Bereich" mit den fünf bereichsgebundenen Sektionen
// (Historie-Bereichs-Default und Vorlagen-Bereichsteil abgespalten,
// PO-Entscheidung E3) hinter der Gruppe „Allgemein".
test.describe('ES-13: Bereichs-Gruppe der Navigation bei gebundenem Bereich', () => {
  test('zweite Gruppe mit sieben Bereichs-Sektionen; Historie-Default und Vorlagen-Bereichsteil erreichbar', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-settings-area-'));
    const { app, page, userData } = await launchApp();
    try {
      // Bereich an das leere Startfenster binden (Muster vorlagen.spec.js).
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      await openSettingsPageViaKeyboard(page);
      await expect(page.locator(SETTINGS_PAGE)).toBeVisible();
      const groups = page.locator(`${SETTINGS_PAGE} .settings-nav-group`);
      await expect(groups).toHaveCount(2);
      await expect(groups.nth(0)).toHaveAttribute('data-nav-group', 'general');
      await expect(groups.nth(1)).toHaveAttribute('data-nav-group', 'area');
      // Beide Gruppen tragen sichtbare Überschriften.
      await expect(groups.nth(0).locator('.settings-nav-group-title')).toBeVisible();
      await expect(groups.nth(1).locator('.settings-nav-group-title')).toBeVisible();
      // Bereichs-Gruppe: die sieben bereichsgebundenen Sektionen in
      // Registry-Reihenfolge (sechs feste plus die dynamisch registrierten
      // Sidebar-Varianten aus 4T-0625, Epic 3E-0119). „attachmentsArea"
      // kam mit 4T-0791 (Epic 3E-0125) hinzu.
      const areaEntries = groups.nth(1).locator('.settings-nav-entry');
      await expect(areaEntries).toHaveCount(7);
      for (const [idx, id] of [
        'historyArea',
        'attachmentsArea',
        'templatesArea',
        'journals',
        'calendarSystems',
        'propertyProfiles',
        'sidebarVariants',
      ].entries()) {
        await expect(areaEntries.nth(idx)).toHaveAttribute('data-section-id', id);
      }
      // Abgespaltener Historie-Bereichs-Default ist erreichbar und bedienbar.
      await areaEntries.nth(0).click();
      await expect(page.locator('#settings-history-area-default')).toBeVisible();
      // Der Bereich „Verhalten" (Allgemein) enthält den Default nicht mehr.
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="behavior"]`)
        .click();
      await expect(page.locator('#settings-history-enabled')).toBeVisible();
      await expect(page.locator('#settings-history-area-default')).toHaveCount(0);
      // Abgespaltener Vorlagen-Bereichsteil: Checkbox da, globaler Teil nicht.
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="templatesArea"]`)
        .click();
      await expect(page.locator('#settings-templates-area-enabled')).toBeVisible();
      await expect(page.locator('#settings-templates-global-folder')).toHaveCount(0);
    } finally {
      await closeApp(app, userData);
      fs.rmSync(areaRoot, { recursive: true, force: true });
    }
  });
});

// 4T-0575 (Epic 3E-0106): abgerundete Tab-Ecken im Bereich Darstellung —
// Live-Vorschau, reale Wirkung am Reiter (Radius plus entfallende
// Trennlinie) und Persistenz über den Neustart (Muster ES-11).
async function tabCorner(page) {
  return page.evaluate(
    (sel) => {
      const tab = document.querySelector(sel.tab);
      const bar = document.querySelector(sel.bar);
      if (!tab || !bar) return null;
      const cs = getComputedStyle(tab);
      // Zahlen statt Strings: die Breite der Trennlinie liefert Chromium je
      // nach Anzeige-Skalierung gerundet (1px kann als 0.8px ankommen).
      return {
        radius: parseFloat(cs.borderTopLeftRadius),
        borderRight: parseFloat(cs.borderRightWidth),
        // Abstand der Reiter-Oberkante zur Leisten-Oberkante: dort liegt die
        // Akzentlinie der aktiven Spalte, die die Reiter nicht verdecken
        // duerfen (PO-Befund in der Test-Iteration zu 4T-0575).
        topGap: tab.getBoundingClientRect().top - bar.getBoundingClientRect().top,
      };
    },
    { tab: SEL.tabs0, bar: SEL.tabbar0 },
  );
}

test.describe('ES-14: Abgerundete Tab-Ecken (Darstellung)', () => {
  test('Default eckig, Vorschau rundet sofort, Zustand übersteht den Neustart', async () => {
    const first = await launchApp({ args: [FRONTMATTER_FIXTURE] });
    const userData = first.userData;
    try {
      const { page } = first;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // Startzustand: eckig, Trennlinie vorhanden, Akzentlinie der aktiven
      // Spalte frei (die Reiter beginnen darunter).
      await expect.poll(async () => (await tabCorner(page)).radius).toBe(0);
      const flat = await tabCorner(page);
      expect(flat.borderRight).toBeGreaterThan(0);
      expect(flat.topGap).toBeGreaterThanOrEqual(2);
      await openSettingsPageViaKeyboard(page);
      const box = page.locator('#settings-rounded-tabs');
      await expect(box).not.toBeChecked();
      // Live-Vorschau: der Schalter wirkt ohne Anwenden.
      await box.check();
      await expect.poll(async () => (await tabCorner(page)).radius).toBe(8);
      const round = await tabCorner(page);
      // Variante B: die Trennlinie weicht dem Abstand zwischen den Reitern.
      expect(round.borderRight).toBe(0);
      // Die Akzentlinie bleibt auch gerundet unverdeckt.
      expect(round.topGap).toBeGreaterThanOrEqual(2);
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      await expect.poll(async () => (await tabCorner(page)).radius).toBe(8);
    } finally {
      // Profil behalten (kein userData-Cleanup) für den zweiten Start.
      await closeApp(first.app, null, { force: true });
    }
    // Neustart mit demselben Profil: die Reiter bleiben abgerundet.
    const second = await launchApp({ args: [FRONTMATTER_FIXTURE], userData });
    try {
      await expect(second.page.locator(SEL.tabs0).first()).toBeVisible();
      await expect.poll(async () => (await tabCorner(second.page)).radius).toBe(8);
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

// 4T-0577 (Epic 3E-0106): Hervorhebung der Cursor-Zeile — Default an, nur im
// Edit-Modus sichtbar (im Lese-Zustand ohne Cursor bewusst nicht), abschaltbar
// und über den Neustart stabil.
async function activeLineBg(page) {
  return page.evaluate(() => {
    const line = document.querySelector('.pane-group[data-pane="0"] .pane-source .cm-activeLine');
    if (!line) return null;
    return getComputedStyle(line).backgroundColor;
  });
}

// Ein Hintergrund gilt als sichtbar, wenn er nicht voll transparent ist.
function opaque(color) {
  if (!color) return false;
  const alpha = color.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
  return color !== 'transparent' && (!alpha || parseFloat(alpha[1]) > 0);
}

test.describe('ES-15: Hervorhebung der aktiven Zeile (Darstellung)', () => {
  test('im Edit-Modus hinterlegt, im Lese-Modus nicht, abschaltbar und persistent', async () => {
    const first = await launchApp({ args: [FRONTMATTER_FIXTURE] });
    const userData = first.userData;
    try {
      const { page } = first;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      // Lese-Zustand (kein Edit-Modus): die Zeile bleibt unhinterlegt.
      await expect.poll(async () => opaque(await activeLineBg(page))).toBe(false);
      // Edit-Modus: Default an, die Cursor-Zeile ist hinterlegt.
      await page.locator(SEL.btnEdit).click();
      // Beleg für den Edit-Modus ist die fehlende read-only-Klasse; das
      // contenteditable-Attribut steht in CodeMirror auch im Lese-Zustand.
      await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
      await expect.poll(async () => opaque(await activeLineBg(page))).toBe(true);
      // Abschalten wirkt als Live-Vorschau und bleibt nach OK.
      await openSettingsPageViaKeyboard(page);
      const box = page.locator('#settings-highlight-active-line');
      await expect(box).toBeChecked();
      await box.uncheck();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      await expect.poll(async () => opaque(await activeLineBg(page))).toBe(false);
    } finally {
      // Profil behalten (kein userData-Cleanup) für den zweiten Start.
      await closeApp(first.app, null, { force: true });
    }
    // Neustart mit demselben Profil: abgeschaltet bleibt abgeschaltet.
    const second = await launchApp({ args: [FRONTMATTER_FIXTURE], userData });
    try {
      const page = second.page;
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      // Beleg für den Edit-Modus ist die fehlende read-only-Klasse; das
      // contenteditable-Attribut steht in CodeMirror auch im Lese-Zustand.
      await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
      await expect.poll(async () => opaque(await activeLineBg(page))).toBe(false);
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});
