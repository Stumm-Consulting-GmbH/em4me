// 4T-001881 (Epic 3E-000185, Story 4S-000992): E2E-Funktions-Suite — feste
// Arbeitsmodi (AM-01 bis AM-05).
//
// Prüfgegenstand ist, was nur die gestartete Anwendung zeigt: dass ein
// gebündelter Modus-Wechsel im Einstellungs-Bereich «Erweiterungen» wirklich
// Panels und Statusleisten-Schaltflächen mitnimmt, dass er einen Neustart
// überdauert, dass er ein zweites, bereits offenes Fenster ohne Neuladen
// erreicht, und dass die Station der geführten Tour beim ersten Start mit
// vorgewähltem «Einsteiger» erscheint und eine Wahl dort sofort wirkt.
//
// AM-01: Die drei Modi in den Einstellungen, ihre Wirkung und der Neustart.
// AM-02: Der Wechsel erreicht ein zweites, bereits offenes Fenster.
// AM-03: Die Tour-Station beim ersten Start — Vorwahl und sofortige Wirkung.
// AM-04: Ein Einzel-Schalter danach führt auf «Angepasst» und wieder zurück.
// AM-05: Eine bestehende Einrichtung bleibt unberührt, die Tour läuft nicht an.
//
// 4T-001882 (Story 4S-000993): die EIGENEN Modi daneben.
// AM-06: Speichern unter einem Namen, Anwenden und der Bestand nach dem Neustart.
// AM-07: Die Rückfrage bei vergebenem Namen, der leere Name, Umbenennen und
//        Löschen — und dass keiner der drei den Schalter-Stand anfasst.
// AM-08: Ein eigener Modus erreicht ein zweites, bereits offenes Fenster.
//
// Die reinen Ableitungen dahinter — welcher Satz zu welchem Modus gehört,
// welcher Modus einem Schalter-Stand entspricht und wann der Start-Modus
// greift — prüft test/unit/extensions.test.js; die Bedienung im Entwurf
// test/unit/renderer/settings-extensions.test.js und das Bedienelement der
// Tour-Karte test/unit/renderer/tour-arbeitsmodus.test.js.
//
// Gemessen wird an der Uhr-Erweiterung: Sie steht auf der Stufe
// «Fortgeschritten», ist also im Einsteiger-Modus aus und in den beiden
// größeren an, und sie trägt eine dauerhaft sichtbare Schaltfläche in der
// Statusleiste. Die Erwartungen kommen aus der Sprachdatei statt als Kopie
// im Prüfcode (Muster produkt-tour.spec.js).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { oeffneEinstellungsSeite } = require('../helpers/eingabe');

const I18N_DIR = path.resolve(__dirname, '..', '..', '..', 'src', 'i18n');
const DE = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'de.json'), 'utf8'));

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';
const MODUS_STAND = '#settings-extensions-mode-state';
const UHR_BUTTON = '#btn-clock';
const POPOVER = '.driver-popover.em4me-tour';

function modusKnopf(level) {
  return `#settings-extension-mode-${level}`;
}

// 4T-001882: Bedien-Orte der eigenen Modi.
const EIGENE_ZEILE = '.settings-extension-own-mode-row';
const EIGENER_SPEICHERN = '#btn-settings-extension-mode-save';
const NAME_FELD = '#name-input-field';
const NAME_OK = '#btn-name-input-ok';

// Den Namens-Dialog ausfüllen und bestätigen (Muster der übrigen Fälle mit
// dem Namens-Modal: erst auf das Feld warten, dann schreiben).
async function nameEingeben(page, name) {
  await expect(page.locator(NAME_FELD)).toBeVisible();
  await page.locator(NAME_FELD).fill(name);
  await page.locator(NAME_OK).click();
}

function eigeneZeile(page, name) {
  return page.locator(EIGENE_ZEILE, { hasText: name });
}

function aktivTextFuer(name) {
  return DE['settings.extensions.mode.active'].replace('{name}', name);
}

function aktivText(level) {
  return aktivTextFuer(DE[`settings.extensions.mode.name.${level}`]);
}

// Profil von Hand schreiben, damit es OHNE Tour-Merker bleibt: Genau diese
// Lücke ist der Zustand vor dem allerersten Start (Muster seedProfilOhneMerker
// in produkt-tour.spec.js). Die Aufrufer starten dazu mit `settings: null`,
// sonst legt der Start-Helfer den Merker unter.
function seedProfil(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-arbeitsmodi-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(settings), 'utf8');
  return dir;
}

// Tolerant gegen den Moment, in dem die Datei gerade geschrieben wird (Muster
// readConfig in voreinstellungen.spec.js).
function readConfig(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

async function openExtensionsSection(page) {
  // 4T-001699: auf die Sichtbarkeit warten, nicht auf das Vorhandensein.
  await oeffneEinstellungsSeite(page);
  await page.locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="extensions"]`).click();
  await expect(page.locator('#settings-extensions-list')).toBeVisible();
}

// OK klicken und den Abschluss abwarten (Begründung wie in
// erweiterungen.spec.js: erst mit dem Schließen der Seite ist persistiert).
async function confirmSettings(page) {
  await page.locator('#btn-settings-ok').click();
  await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
}

test.describe('AM-01: die drei Modi in den Einstellungen (4S-000992)', () => {
  test('Einsteiger nimmt die Uhr mit, die Anzeige folgt, der Neustart hält', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      const { page } = first;
      // Ausgangslage einer bestehenden Einrichtung: alles an, also «Voll».
      await expect(page.locator(UHR_BUTTON)).toBeVisible();
      await openExtensionsSection(page);
      for (const level of ['beginner', 'advanced', 'full']) {
        await expect(page.locator(modusKnopf(level))).toHaveText(
          new RegExp(DE[`settings.extensions.mode.name.${level}`]),
        );
      }
      await expect(page.locator(modusKnopf('full'))).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivText('full'));

      // Einsteiger wählen: die Anzeige folgt sofort, die Schalter-Liste auch.
      await page.locator(modusKnopf('beginner')).click();
      await expect(page.locator(modusKnopf('beginner'))).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(modusKnopf('full'))).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivText('beginner'));
      await expect(page.locator('#settings-extension-katex')).not.toBeChecked();
      // Was der Einsteiger-Modus enthält, bleibt an.
      await expect(page.locator('#settings-extension-wiki-links')).toBeChecked();

      // Anwenden: die Statusleisten-Schaltfläche der Uhr geht mit.
      await confirmSettings(page);
      await expect(page.locator(UHR_BUTTON)).toBeHidden();
    } finally {
      await closeApp(first.app, null, { force: true });
    }

    // Neustart mit demselben Profil: der Modus hält, und die Einstellungen
    // zeigen ihn weiterhin als den aktiven.
    const second = await launchApp({ userData });
    try {
      await expect(second.page.locator(UHR_BUTTON)).toBeHidden();
      await openExtensionsSection(second.page);
      await expect(second.page.locator(modusKnopf('beginner'))).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(second.page.locator(MODUS_STAND)).toHaveText(aktivText('beginner'));

      // Zurück auf Voll: die Uhr kehrt zurück.
      await second.page.locator(modusKnopf('full')).click();
      await confirmSettings(second.page);
      await expect(second.page.locator(UHR_BUTTON)).toBeVisible();
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

test.describe('AM-02: der Wechsel erreicht jedes offene Fenster (4S-000992)', () => {
  test('das zweite Fenster folgt ohne Neuladen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      const zweitesFenster = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow());
      const page2 = await zweitesFenster;
      await page2.waitForLoadState('domcontentloaded');
      await expect(page2.locator(UHR_BUTTON)).toBeVisible();

      // Umschalten im ERSTEN Fenster.
      await openExtensionsSection(page);
      await page.locator(modusKnopf('beginner')).click();
      await confirmSettings(page);

      // Das zweite Fenster zieht nach, ohne dass es neu geladen würde.
      await expect(page2.locator(UHR_BUTTON)).toBeHidden();
      await expect(page.locator(UHR_BUTTON)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-03: die Modus-Station der geführten Tour (4S-000992)', () => {
  test('Einsteiger ist vorgewählt, und eine Wahl wirkt bei laufender Tour', async () => {
    // Profil ohne Tour-Merker und ohne Schalter-Stand: der erste Start.
    const userData = seedProfil({ language: 'de' });
    const { app, page } = await launchApp({ userData, settings: null });
    try {
      // Der Start-Modus hat gegriffen: die Uhr ist aus, bevor der Anwender
      // irgendetwas gewählt hat.
      await expect(page.locator(POPOVER)).toBeVisible();
      await expect(page.locator(UHR_BUTTON)).toBeHidden();

      // Erste Station ist die Willkommens-Karte, die zweite trägt die Wahl.
      await expect(page.locator(`${POPOVER} .driver-popover-title`)).toHaveText(
        DE['tour.welcome.title'],
      );
      await page.locator(`${POPOVER} .driver-popover-next-btn`).click();
      await expect(page.locator(`${POPOVER} .driver-popover-title`)).toHaveText(
        DE['tour.modes.title'],
      );
      const wahl = page.locator(`${POPOVER} .tour-modes`);
      await expect(wahl).toBeVisible();
      await expect(page.locator('#tour-mode-beginner')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.tour-modes-state')).toHaveText(aktivText('beginner'));

      // Eine Wahl in der Karte wirkt sofort — ohne die Tour zu beenden.
      await page.locator('#tour-mode-full').click();
      await expect(page.locator(UHR_BUTTON)).toBeVisible();
      await expect(page.locator('#tour-mode-full')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(POPOVER)).toBeVisible();

      // Und sie ist persistiert, nicht nur im Fenster wirksam.
      await expect.poll(() => readConfig(userData).extensions?.disabled).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-04: Angepasst und zurück (4S-000992)', () => {
  test('ein Einzel-Schalter löst den Modus, der Weg zurück stellt ihn wieder her', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openExtensionsSection(page);
      await page.locator(modusKnopf('beginner')).click();
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivText('beginner'));

      // Einen einzelnen Schalter abweichend stellen: kein fester Modus mehr.
      await page.locator('#settings-extension-katex').check();
      await expect(page.locator(MODUS_STAND)).toHaveText(DE['settings.extensions.mode.custom']);
      for (const level of ['beginner', 'advanced', 'full']) {
        await expect(page.locator(modusKnopf(level))).toHaveAttribute('aria-pressed', 'false');
      }

      // Und wieder zurück: derselbe Stand, derselbe Modus.
      await page.locator('#settings-extension-katex').uncheck();
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivText('beginner'));
      await expect(page.locator(modusKnopf('beginner'))).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-05: die bestehende Einrichtung bleibt unberührt (4S-000992)', () => {
  test('kein Schalter-Stand wird gesetzt, die Tour läuft nicht an', async () => {
    // Bestands-Profil: Nutzungsspur und gesehene Tour, aber nie ein
    // Erweiterungs-Schalter angefasst. Genau dieser Fall darf beim Update
    // nichts verlieren.
    const userData = seedProfil({
      language: 'de',
      tourSeen: true,
      recentFiles: ['C:/nicht/vorhanden.md'],
    });
    const { app, page } = await launchApp({ userData, settings: null });
    try {
      await page.waitForSelector('body[data-renderer-ready]', { timeout: 20000 });
      // Nachfassen: Der Tour-Anlauf hinge hinter dem Bereitschafts-Signal.
      await page.waitForTimeout(1000);
      await expect(page.locator(POPOVER)).toHaveCount(0);
      // Voller Funktionsumfang, und im Speicher steht weiterhin kein
      // Schalter-Stand — geschrieben wurde nichts.
      await expect(page.locator(UHR_BUTTON)).toBeVisible();
      expect(readConfig(userData).extensions).toBeUndefined();
      await openExtensionsSection(page);
      await expect(page.locator(modusKnopf('full'))).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

// 4T-001882 (Epic 3E-000185, Story 4S-000993): die eigenen Arbeitsmodi.
//
// Gemessen wird wieder an der Uhr-Erweiterung (Stufe «Fortgeschritten», im
// Einsteiger-Modus aus, mit dauerhaft sichtbarer Schaltfläche) und an der
// Formel-Erweiterung `katex`, die im Einsteiger-Modus ebenfalls aus ist: Ihr
// Schalter macht den Unterschied zwischen einem festen Modus und einem eigenen
// sichtbar, ohne dass dafür ein Dokument nötig wäre.
test.describe('AM-06: einen eigenen Modus speichern und anwenden (4S-000993)', () => {
  test('der gespeicherte Stand wirkt, wird angezeigt und hält den Neustart', async () => {
    const first = await launchApp();
    const userData = first.userData;
    try {
      const { page } = first;
      await openExtensionsSection(page);
      // Ein Stand, der keinem der drei festen Modi entspricht.
      await page.locator(modusKnopf('beginner')).click();
      await page.locator('#settings-extension-katex').check();
      await expect(page.locator(MODUS_STAND)).toHaveText(DE['settings.extensions.mode.custom']);

      await page.locator(EIGENER_SPEICHERN).click();
      await nameEingeben(page, 'Mein Modus');
      await expect(eigeneZeile(page, 'Mein Modus')).toHaveCount(1);
      // Die Anzeige erkennt jetzt den eigenen Modus.
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivTextFuer('Mein Modus'));

      await confirmSettings(page);
      await expect(page.locator(UHR_BUTTON)).toBeHidden();
    } finally {
      await closeApp(first.app, null, { force: true });
    }

    // Neustart mit demselben Profil: Der Modus steht weiterhin in der Liste,
    // und der zuletzt angewendete Schalter-Stand gilt unverändert.
    const second = await launchApp({ userData });
    try {
      const page = second.page;
      await expect(page.locator(UHR_BUTTON)).toBeHidden();
      await openExtensionsSection(page);
      await expect(eigeneZeile(page, 'Mein Modus')).toHaveCount(1);
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivTextFuer('Mein Modus'));

      // Ein fester Modus dazwischen, danach der eigene zurück.
      await page.locator(modusKnopf('full')).click();
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivText('full'));
      await eigeneZeile(page, 'Mein Modus').locator('.settings-extension-own-mode').click();
      await expect(page.locator(MODUS_STAND)).toHaveText(aktivTextFuer('Mein Modus'));
      await expect(page.locator('#settings-extension-katex')).toBeChecked();
      await confirmSettings(page);
      await expect(page.locator(UHR_BUTTON)).toBeHidden();
    } finally {
      await closeApp(second.app, userData, { force: true });
    }
  });
});

test.describe('AM-07: Namen, Rückfrage und Verwaltung (4S-000993)', () => {
  test('kein stilles Überschreiben, und die Verwaltung rührt die Schalter nicht an', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openExtensionsSection(page);
      await page.locator(modusKnopf('beginner')).click();
      await page.locator(EIGENER_SPEICHERN).click();
      await nameEingeben(page, 'Fokus');
      await expect(eigeneZeile(page, 'Fokus')).toHaveCount(1);

      // Ein Name aus reinen Leerzeichen wird abgewiesen; der Dialog bleibt.
      await page.locator(EIGENER_SPEICHERN).click();
      await expect(page.locator(NAME_FELD)).toBeVisible();
      await page.locator(NAME_FELD).fill('   ');
      await page.locator(NAME_OK).click();
      await expect(page.locator('#name-input-error')).toBeVisible();
      await page.locator('#btn-name-input-cancel').click();
      await expect(page.locator(EIGENE_ZEILE)).toHaveCount(1);

      // Derselbe Name ein zweites Mal: Rückfrage statt stillem Überschreiben.
      await page.locator(modusKnopf('full')).click();
      await page.locator(EIGENER_SPEICHERN).click();
      await nameEingeben(page, 'Fokus');
      await expect(page.locator('#name-input-description')).toContainText('Fokus');
      await expect(page.locator(NAME_OK)).toHaveText(
        DE['settings.extensions.mode.own.overwriteConfirm'],
      );
      await page.locator(NAME_OK).click();
      // Ein Modus dieses Namens, und er trägt jetzt den vollen Stand.
      await expect(page.locator(EIGENE_ZEILE)).toHaveCount(1);
      await page.locator(modusKnopf('beginner')).click();
      await expect(page.locator('#settings-extension-katex')).not.toBeChecked();
      await eigeneZeile(page, 'Fokus').locator('.settings-extension-own-mode').click();
      await expect(page.locator('#settings-extension-katex')).toBeChecked();

      // Umbenennen: der Name wechselt, der Schalter-Stand bleibt.
      await eigeneZeile(page, 'Fokus').locator('.settings-extension-own-mode-rename').click();
      await nameEingeben(page, 'Schreiben');
      await expect(eigeneZeile(page, 'Schreiben')).toHaveCount(1);
      await expect(eigeneZeile(page, 'Fokus')).toHaveCount(0);
      await expect(page.locator('#settings-extension-katex')).toBeChecked();

      // Löschen: die Zeile geht, der Schalter-Stand bleibt.
      await eigeneZeile(page, 'Schreiben').locator('.settings-extension-own-mode-delete').click();
      await expect(page.locator(EIGENE_ZEILE)).toHaveCount(0);
      await expect(page.locator('.settings-extensions-own-modes-empty')).toBeVisible();
      await expect(page.locator('#settings-extension-katex')).toBeChecked();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});

test.describe('AM-08: ein eigener Modus erreicht jedes offene Fenster (4S-000993)', () => {
  test('das zweite Fenster folgt ohne Neuladen', async () => {
    const { app, page, userData } = await launchApp();
    try {
      await openExtensionsSection(page);
      await page.locator(modusKnopf('beginner')).click();
      await page.locator(EIGENER_SPEICHERN).click();
      await nameEingeben(page, 'Knapp');
      // Ausgangslage beider Fenster: voller Umfang.
      await page.locator(modusKnopf('full')).click();
      await confirmSettings(page);

      const zweitesFenster = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow());
      const page2 = await zweitesFenster;
      await page2.waitForLoadState('domcontentloaded');
      await expect(page2.locator(UHR_BUTTON)).toBeVisible();

      // Den eigenen Modus im ERSTEN Fenster anwenden.
      await openExtensionsSection(page);
      await eigeneZeile(page, 'Knapp').locator('.settings-extension-own-mode').click();
      await confirmSettings(page);

      await expect(page2.locator(UHR_BUTTON)).toBeHidden();
      await expect(page.locator(UHR_BUTTON)).toBeHidden();
    } finally {
      await closeApp(app, userData, { force: true });
    }
  });
});
