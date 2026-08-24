// 4T-0448 (Epic 3E-0083): E2E-Funktions-Suite Eigenschafts-Profile im
// Properties-Editor. PP-01: Vorschlags-Menü listet Definitions-Felder mit
// Profil-Kennzeichnung, Auswahl legt das Feld mit Definitions-Typ und
// Default an; PP-02: Wertebereichs-Feld als Auswahl-Liste mit Typ-Sperre,
// Wert außerhalb erzeugt den weichen Hinweis; PP-03: ohne Konfiguration
// bleibt das Verhalten unverändert (direktes Anlegen ohne Menü); PP-04:
// bei deaktivierter Erweiterung ebenso. describe-Titel tragen die
// Matrix-IDs (test/abdeckungs-matrix.json, F-106).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
// 4T-1175 (Epic 3E-0220): geteilte Bereichs-Vorbereitung, ausgezogen wegen des
// Datei-Budgets (Begründung dort).
const {
  PANE0,
  PANEL,
  ADD_BTN,
  FIELDS,
  makeArea,
  writeDoc,
  bindAreaAndOpen,
  openPropertiesPanel,
  editorContains,
  cleanupDir,
} = require('../helpers/profil-bereich');

const MENU = '.properties-suggest-menu';
const MENU_ITEM = `${MENU} .properties-suggest-item`;

test.describe('PP-01: Vorschlags-Menü und Feld-Anlage mit Default (F-106)', () => {
  test('Definitions-Felder mit Profil-Badge zuerst; Auswahl legt Feld mit Typ und Default an', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'notiz.md', ['class: Projekt']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      // Erst klicken, wenn die Auflösung geladen ist (Test-Hook).
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();
      await page.locator(ADD_BTN).click();
      await expect(page.locator(MENU)).toBeVisible();
      // Definitions-Felder zuerst (zugeordnetes Profil vor dem Standard),
      // mit Profil-Kennzeichnung; Heuristik-Vorschläge danach; am Ende
      // „Eigenes Feld".
      // 4T-0491 (PO-Befund 2026-07-11): profil-gruppierte Liste. Klickbare
      // Profil-Köpfe (is-profile-head) in Auflösungs-Reihenfolge, darunter
      // eingerückt die Einzel-Felder; profillose Vorschläge unter „Weitere
      // Felder" (nicht klickbare Überschrift).
      const heads = page.locator(`${MENU_ITEM}.is-profile-head`);
      await expect(heads).toHaveCount(2);
      await expect(heads.nth(0)).toContainText('Projekt');
      await expect(heads.nth(1)).toContainText('All');
      const indented = page.locator(`${MENU_ITEM}.is-indent`);
      await expect(indented.filter({ hasText: 'status' })).toHaveCount(1);
      await expect(indented.filter({ hasText: 'budget' })).toHaveCount(1);
      await expect(indented.filter({ hasText: 'thema' })).toHaveCount(1);
      await expect(page.locator(`${MENU} .properties-suggest-group-label`)).toHaveCount(1);
      // Auswahl des Einzel-Felds „budget": Feld mit Zahlen-Typ und Default 1000.
      await indented.filter({ hasText: 'budget' }).click();
      await expect(page.locator(MENU)).toBeHidden();
      const field = page.locator(`${FIELDS} .properties-field`).last();
      await expect(field.locator('.properties-field-key')).toHaveValue('budget');
      await expect(field.locator('.properties-field-value input')).toHaveValue('1000');
      // Typ-Wechsler gesperrt (Definitions-Typ), Feld dezent gekennzeichnet.
      await expect(field.locator('.properties-field-type')).toBeDisabled();
      await expect(field).toHaveClass(/is-profile-defined/);
      // Debounce-Save übernimmt den Default in das Frontmatter.
      await editorContains(page, 'budget: 1000');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-02: Wertebereich als Auswahl-Liste, weicher Hinweis (F-106)', () => {
  test('Auswahl-Liste schreibt den Wert; Wert außerhalb zeigt den Hinweis ohne Blockade', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'auswahl.md', ['class: Projekt', 'status: offen']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      // Das definierte Feld rendert als Auswahl-Liste mit dem Ist-Wert.
      const select = page.locator(`${FIELDS} .properties-field-value-select`);
      await expect(select).toBeVisible();
      await expect(select).toHaveValue('offen');
      // Konformer Wert: kein Hinweis (am Wertebereichs-Feld).
      const statusField = page
        .locator(`${FIELDS} .properties-field`)
        .filter({ has: page.locator('.properties-field-value-select') });
      await expect(statusField.locator('.properties-field-hint')).toBeHidden();
      // Auswahl schreibt den Wert in das Frontmatter.
      await select.selectOption('erledigt');
      await editorContains(page, 'status: erledigt');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });

  test('Wert außerhalb des Wertebereichs bleibt sichtbar und erhält den Hinweis', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'abweichung.md', ['class: Projekt', 'status: unklar']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      const select = page.locator(`${FIELDS} .properties-field-value-select`);
      await expect(select).toBeVisible();
      // Der abweichende Wert bleibt unverändert als eigene Option erhalten.
      await expect(select).toHaveValue('unklar');
      const statusField = page
        .locator(`${FIELDS} .properties-field`)
        .filter({ has: page.locator('.properties-field-value-select') });
      const hint = statusField.locator('.properties-field-hint');
      await expect(hint).toBeVisible();
      const title = await hint.getAttribute('title');
      expect(title && title.length).toBeTruthy();
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-03: Ohne Konfiguration unverändertes Verhalten (F-106)', () => {
  test('Hinzufügen legt direkt ein freies Feld an, kein Menü', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-ohne-'));
    const doc = path.join(workDir, 'frei.md');
    fs.writeFileSync(doc, '---\ntitel: Alt\n---\n\nInhalt.\n', 'utf8');
    const { app, page, userData } = await launchApp({ args: [doc] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await openPropertiesPanel(page);
      await page.locator(ADD_BTN).click();
      await expect(page.locator(MENU)).toHaveCount(0);
      await expect(page.locator(`${FIELDS} .properties-field-key`).last()).toHaveValue('field1');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(workDir);
    }
  });
});

test.describe('PP-05: Block-Panel mit denselben Definitionen (F-106)', () => {
  test('Vorschlags-Menü im Block-Panel; Definitions-Feld mit Default landet in der .mdd', async () => {
    const areaRoot = makeArea();
    const doc = path.join(areaRoot, 'block.md');
    fs.writeFileSync(doc, '---\nclass: Projekt\n---\n\nAbsatz mit Anker. ^abc\n', 'utf8');
    // Quell-Ansicht für die Cursor-Folge des Block-Panels (Muster
    // block-eigenschaften.spec.js).
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-block-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ app: { defaultViewMode: 'source' } }),
      'utf8',
    );
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:toggleBlockProps');
      });
      const SEC = `${PANE0} .sidebar-blockprops`;
      await expect(page.locator(SEC)).toBeVisible();
      // Cursor in den Anker-Block; Auflösung muss geladen sein (Hook an der
      // Properties-Sektion, auch bei geschlossenem Properties-Panel gesetzt).
      await page.locator(SEL.editorContent0).getByText('Absatz mit Anker.').click();
      await expect(page.locator(`${SEC} .block-props-add-btn`)).toBeVisible();
      await expect(page.locator(PANEL)).toHaveAttribute('data-profiles', 'on');
      // Vorschlags-Menü: Definitions-Felder zuerst (status, budget, thema).
      await page.locator(`${SEC} .block-props-add-btn`).click();
      await expect(page.locator(MENU)).toBeVisible();
      // 4T-0491 (PO-Befund): profil-gruppiert; Einzel-Feld „budget" auswählen.
      await expect(
        page.locator(`${MENU_ITEM}.is-profile-head`).filter({ hasText: 'Projekt' }),
      ).toHaveCount(1);
      const budgetItem = page.locator(`${MENU_ITEM}.is-indent`).filter({ hasText: 'budget' });
      await expect(budgetItem).toHaveCount(1);
      // Auswahl „budget": Zeile mit Zahlen-Typ, Default 1000, Typ gesperrt.
      await budgetItem.click();
      const row = page.locator(`${SEC} .block-props-fields .properties-field`).last();
      await expect(row.locator('.properties-field-key')).toHaveValue('budget');
      await expect(row.locator('.properties-field-value input')).toHaveValue('1000');
      await expect(row.locator('.properties-field-type')).toBeDisabled();
      // Debounce-Save schreibt die Block-Eigenschaft in die .mdd.
      await expect
        .poll(() => {
          try {
            const mdd = JSON.parse(fs.readFileSync(doc.replace(/\.md$/, '.mdd'), 'utf8'));
            const entry = mdd.blockData && mdd.blockData.abc;
            return entry ? entry.values.budget : null;
          } catch {
            return null;
          }
        })
        .toBe(1000);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });

  test('Wertebereichs-Feld rendert im Block-Panel als Auswahl-Liste', async () => {
    const areaRoot = makeArea();
    const doc = path.join(areaRoot, 'block2.md');
    fs.writeFileSync(doc, '---\nclass: Projekt\n---\n\nBlock mit Anker. ^blk\n', 'utf8');
    const mdd = {
      schemaVersion: 1,
      history: { anchors: [], packets: [] },
      blockData: { blk: { values: { status: 'offen' }, updated: '2026-07-09T00:00:00Z' } },
    };
    fs.writeFileSync(
      path.join(areaRoot, 'block2.mdd'),
      JSON.stringify(mdd, null, 2) + '\n',
      'utf8',
    );
    // Quell-Ansicht für die Cursor-Folge; die Auflösung kommt asynchron nach
    // dem Feld-Aufbau an und zieht die Zeilen über den Listener nach.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-block2-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ app: { defaultViewMode: 'source' } }),
      'utf8',
    );
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:toggleBlockProps');
      });
      const SEC = `${PANE0} .sidebar-blockprops`;
      await expect(page.locator(SEC)).toBeVisible();
      await page.locator(SEL.editorContent0).getByText('Block mit Anker.').click();
      const select = page.locator(`${SEC} .properties-field-value-select`);
      await expect(select).toBeVisible();
      await expect(select).toHaveValue('offen');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-06: Einstellungs-Bereich Eigenschafts-Profile (F-106)', () => {
  test('Konfiguration setzen, Profil-Liste mit Hinweis, Klick öffnet die Profil-Datei', async () => {
    // Bereich mit Profil-Ordner (ein gültiges, ein defektes Profil), aber
    // noch OHNE Bereichsdatei — die Konfiguration entsteht über die UI.
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-settings-'));
    fs.mkdirSync(path.join(areaRoot, 'Profile'));
    fs.writeFileSync(
      path.join(areaRoot, 'Profile', 'Projekt.md'),
      '---\nfields:\n  - name: status\n    values: [offen, erledigt]\n  - name: budget\n    type: number\n---\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(areaRoot, 'Profile', 'Defekt.md'),
      '---\nfields: [broken\n---\nx\n',
      'utf8',
    );
    const SETTINGS_PAGE = `${PANE0} .pane-system .settings-page`;
    const openProfilesSettings = async (page) => {
      await expect
        .poll(async () => {
          if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
            await page.keyboard.press('Control+,');
          }
          return page.locator(SETTINGS_PAGE).isVisible();
        })
        .toBe(true);
      await page.locator('.settings-nav-entry[data-section-id="propertyProfiles"]').click();
      await expect(page.locator('#settings-profiles-folder')).toBeVisible();
    };
    const { app, page, userData } = await launchApp();
    try {
      // Bereich an das leere Startfenster binden.
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');

      // Profil-Ordner setzen und anwenden: die Bereichsdatei entsteht.
      await openProfilesSettings(page);
      await page.locator('#settings-profiles-folder').fill('Profile');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      const mddaPath = path.join(areaRoot, 'Area_Settings.mdda');
      expect(fs.existsSync(mddaPath)).toBe(true);
      let parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
      expect(parsed.settings.propertyProfiles.folder).toBe('Profile');
      expect(parsed.settings.propertyProfiles.assignField).toBe('class');

      // Wieder öffnen: die Liste zeigt das interne Ereignis-Profil zuerst
      // (4T-0517), dann beide Datei-Profile, das defekte mit Hinweis; das
      // Standard-Profil ist aus den Datei-Profilen wählbar.
      await openProfilesSettings(page);
      const items = page.locator('.settings-profiles-item');
      await expect(items).toHaveCount(3);
      await expect(items.nth(0)).toHaveClass(/is-internal/);
      await expect(items.nth(0).locator('.settings-profiles-item-name-static')).toHaveText(
        'Ereignis',
      );
      await expect(items.nth(0).locator('.settings-profiles-item-name')).toHaveCount(0);
      await expect(items.nth(1).locator('.settings-profiles-item-name')).toHaveText('Defekt');
      await expect(items.nth(1).locator('.settings-profiles-item-meta')).toHaveClass(/has-errors/);
      await expect(items.nth(2).locator('.settings-profiles-item-name')).toHaveText('Projekt');
      await expect(items.nth(2).locator('.settings-profiles-item-meta')).toContainText('2');
      // Interne Profile stehen nicht zur Wahl als Standard-Profil (4T-0517).
      await expect(page.locator('#settings-profiles-default option[value="Ereignis"]')).toHaveCount(
        0,
      );
      await page.locator('#settings-profiles-default').selectOption('Projekt');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();
      parsed = JSON.parse(fs.readFileSync(mddaPath, 'utf8'));
      expect(parsed.settings.propertyProfiles.defaultProfile).toBe('Projekt');

      // Klick auf den Profil-Namen öffnet die Profil-Datei als Tab.
      await openProfilesSettings(page);
      await page
        .locator('.settings-profiles-item .settings-profiles-item-name', { hasText: 'Projekt' })
        .click();
      await expect(page.locator(SEL.tabs0).filter({ hasText: 'Projekt' })).toHaveCount(1);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// 4T-1143 (Epic 3E-0218, E4): Die Hinweise defekter Definitionen stehen
// ausgeschrieben unter ihrem Profil (ortsbezogen: Definition, Angabe,
// Erwartung; Vererbungs-Hinweise am Profil), und das Beheben in der
// Profil-Datei räumt sie über den Aktualisieren-Knopf ohne Neustart ab.
test.describe('PP-11: Ortsbezogene Diagnose der Profil-Hinweise (4T-1143)', () => {
  test('Hinweise erscheinen ausgeschrieben; nach dem Beheben verschwinden sie per Aktualisieren', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-diagnose-'));
    fs.mkdirSync(path.join(areaRoot, 'Profile'));
    const kaputt = path.join(areaRoot, 'Profile', 'Kaputt.md');
    fs.writeFileSync(
      kaputt,
      '---\nextends: Fehlt\nfields:\n  - name: prio\n    type: lookup\n---\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(areaRoot, 'Area_Settings.mdda'),
      JSON.stringify(
        {
          schemaVersion: 1,
          settings: {
            propertyProfiles: { folder: 'Profile', assignField: 'class', defaultProfile: null },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    const SETTINGS_PAGE = `${PANE0} .pane-system .settings-page`;
    const { app, page, userData } = await launchApp();
    try {
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');
      await expect
        .poll(async () => {
          if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
            await page.keyboard.press('Control+,');
          }
          return page.locator(SETTINGS_PAGE).isVisible();
        })
        .toBe(true);
      await page.locator('.settings-nav-entry[data-section-id="propertyProfiles"]').click();
      await expect(page.locator('#settings-profiles-folder')).toBeVisible();

      // Beide Hinweise stehen ausgeschrieben unter dem Profil: der
      // Definitions-Hinweis nennt Definition und Angabe (mit dem
      // zulässigen Typ-Satz als Erwartung), der Vererbungs-Hinweis das
      // fehlende Eltern-Profil. Sprachneutral geprüft über die
      // eingesetzten Namen und Werte.
      const hints = page.locator('.settings-profiles-item-hints li');
      await expect(hints).toHaveCount(2);
      await expect(hints.nth(0)).toContainText('prio');
      await expect(hints.nth(0)).toContainText('multistring');
      await expect(hints.nth(1)).toContainText('Fehlt');

      // AK9: Fehler in der Datei beheben, Aktualisieren — die Hinweise
      // verschwinden ohne Neustart, die Hervorhebung ebenso.
      fs.writeFileSync(kaputt, '---\nfields:\n  - name: prio\n    type: number\n---\n', 'utf8');
      await page.locator('#settings-profiles-refresh').click();
      await expect(page.locator('.settings-profiles-item-hints')).toHaveCount(0);
      await expect(page.locator('.settings-profiles-item-meta.has-errors')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// PO-Befunde der Release-Test-Iteration 0.56.0 (2026-07-09): (1) die
// Übernahme aus der Werte-Vorschlagsliste soll DIREKT zum Chip werden (ohne
// zusätzliches Enter); (2) doppelte Listen-Einträge sollen nicht entstehen.
test.describe('PP-07: Mehrfach-Auswahl — Direkt-Übernahme und keine Duplikate (F-106)', () => {
  test('Vorschlags-Übernahme wird sofort Chip; doppelte Werte entstehen nicht', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-multi-'));
    fs.mkdirSync(path.join(areaRoot, 'Profile'));
    fs.writeFileSync(
      path.join(areaRoot, 'Profile', 'Multi.md'),
      '---\nfields:\n  - name: themen\n    type: multistring\n    values: [Intern, Kunde, Forschung]\n---\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(areaRoot, 'Area_Settings.mdda'),
      JSON.stringify(
        {
          schemaVersion: 1,
          settings: {
            propertyProfiles: { folder: 'Profile', assignField: 'class', defaultProfile: null },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    const doc = writeDoc(areaRoot, 'multi.md', ['class: Multi', 'themen: []']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      const input = page.locator(`${FIELDS} .properties-field-multistring-input`);
      await expect(input).toBeVisible();
      const pills = page.locator(`${FIELDS} .properties-field-multistring-pill`);
      // Übernahme aus der Vorschlagsliste: das native datalist-Dropdown ist
      // per Playwright nicht klickbar; der Test löst exakt das Ereignis aus,
      // das Chromium bei der Übernahme feuert (input mit
      // inputType 'insertReplacementText').
      const pickFromList = (value) =>
        input.evaluate((el, v) => {
          el.value = v;
          el.dispatchEvent(
            new InputEvent('input', { inputType: 'insertReplacementText', bubbles: true }),
          );
        }, value);
      await pickFromList('Kunde');
      await expect(pills).toHaveCount(1);
      await expect(input).toHaveValue('');
      // Duplikat über die Vorschlagsliste: kein zweiter Chip.
      await pickFromList('Kunde');
      await expect(pills).toHaveCount(1);
      // Enter-Weg: neuer Wert wird Chip, Duplikat nicht (realer Tipp-Pfad).
      await input.fill('Intern');
      await input.press('Enter');
      await expect(pills).toHaveCount(2);
      await input.fill('Intern');
      await input.press('Enter');
      await expect(pills).toHaveCount(2);
      await expect(input).toHaveValue('');
      // Persistenz: beide Werte genau einmal im Frontmatter.
      await page.locator(SEL.viewBtn('source')).click();
      await expect
        .poll(async () => {
          const text = await page.locator(SEL.editorContent0).innerText();
          return (text.match(/Kunde/g) || []).length;
        })
        .toBe(1);
      expect(await page.locator(SEL.editorContent0).innerText()).toContain('Intern');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

test.describe('PP-04: Aus-Zustand der Erweiterung (F-106)', () => {
  test('Deaktivierte Erweiterung: trotz Konfiguration kein Menü, keine Auswahl-Listen', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'aus.md', ['class: Projekt', 'status: offen']);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-aus-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ extensions: { disabled: ['property-profiles'] } }),
      'utf8',
    );
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="off"]`)).toBeVisible();
      // status bleibt ein freies Text-Feld (Inferenz), keine Auswahl-Liste.
      await expect(page.locator(`${FIELDS} .properties-field-value-select`)).toHaveCount(0);
      await page.locator(ADD_BTN).click();
      await expect(page.locator(MENU)).toHaveCount(0);
      await expect(page.locator(`${FIELDS} .properties-field-key`).last()).toHaveValue('field1');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// 4T-0491 (Epic 3E-0093): Komplett-Übernahme von Profil-Feldern im Properties-
// Editor — ein Klick ergänzt alle fehlenden Felder (Default bzw. typgerechter
// Leer-Wert als bare Schlüssel), rückgängig in einem einzigen Undo-Schritt.
test.describe('PP-08: Komplett-Übernahme aller Profil-Felder (F-106)', () => {
  test('Profil-Kopf ergänzt alle fehlenden Felder des Profils in einem Undo-Schritt', async () => {
    const areaRoot = makeArea();
    const doc = writeDoc(areaRoot, 'komplett.md', ['class: Projekt']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      // Editierbaren Quelltext aktivieren (Voraussetzung für das Tastatur-Undo);
      // der Editor trägt den Ausgangsinhalt, bevor die Übernahme läuft.
      await page.locator(SEL.btnEdit).click();
      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toContainText('class: Projekt');
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();
      await page.locator(ADD_BTN).click();
      await expect(page.locator(MENU)).toBeVisible();
      // Klick auf den Profil-Kopf „Projekt" ergänzt alle fehlenden Felder
      // dieses Profils (status, budget) in einem Schritt.
      await page.locator(`${MENU_ITEM}.is-profile-head`).filter({ hasText: 'Projekt' }).click();
      await expect(page.locator(MENU)).toBeHidden();
      // class + status + budget; thema (Profil „All") wurde NICHT ergänzt.
      // 4T-1179 (Epic 3E-0220): Gezählt werden die Felder des DOKUMENTS. Seit
      // dem Feld-Formular hängen dessen Angebote im selben Container (4T-1172),
      // und thema steht dort weiterhin als Angebot — die Zusage dieses Falls
      // ist aber, was im Dokument gelandet ist.
      await expect(
        page.locator(
          `${FIELDS} .properties-field:not(.is-nicht-im-dokument) .properties-field-key`,
        ),
      ).toHaveCount(3);
      await expect(editor).toContainText('budget: 1000');
      await expect(editor).toContainText('status:');
      await expect(editor).not.toContainText('thema');
      // Ein Undo-Schritt macht die Ergänzung vollständig rückgängig.
      await editor.click();
      await page.keyboard.press('Control+z');
      await expect(editor).not.toContainText('budget: 1000');
      await expect(editor).toContainText('class: Projekt');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });
});

// 4T-0491 (Epic 3E-0093): Komplett-Übernahme im Block-Eigenschaften-Panel —
// dasselbe Verhalten, zweite Oberfläche; die Werte landen in der .mdd.
test.describe('PP-09: Komplett-Übernahme im Block-Panel (F-106)', () => {
  test('Profil-Kopf schreibt die Felder des Profils in die .mdd', async () => {
    const areaRoot = makeArea();
    const doc = path.join(areaRoot, 'blockbulk.md');
    fs.writeFileSync(doc, '---\nclass: Projekt\n---\n\nAbsatz mit Anker. ^xy\n', 'utf8');
    // Quell-Ansicht für die Cursor-Folge des Block-Panels (Muster PP-05).
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-blockbulk-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ app: { defaultViewMode: 'source' } }),
      'utf8',
    );
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:toggleBlockProps');
      });
      const SEC = `${PANE0} .sidebar-blockprops`;
      await expect(page.locator(SEC)).toBeVisible();
      await page.locator(SEL.editorContent0).getByText('Absatz mit Anker.').click();
      await expect(page.locator(`${SEC} .block-props-add-btn`)).toBeVisible();
      await expect(page.locator(PANEL)).toHaveAttribute('data-profiles', 'on');
      await page.locator(`${SEC} .block-props-add-btn`).click();
      await expect(page.locator(MENU)).toBeVisible();
      // Klick auf den Profil-Kopf „Projekt" schreibt dessen Felder in die .mdd.
      await page.locator(`${MENU_ITEM}.is-profile-head`).filter({ hasText: 'Projekt' }).click();
      // status und budget von „Projekt" landen in der .mdd (budget mit Default);
      // thema (Profil „All") wurde nicht geschrieben.
      await expect
        .poll(() => {
          try {
            const mdd = JSON.parse(fs.readFileSync(doc.replace(/\.md$/, '.mdd'), 'utf8'));
            const v = mdd.blockData && mdd.blockData.xy && mdd.blockData.xy.values;
            return v ? Object.keys(v).sort().join(',') : null;
          } catch {
            return null;
          }
        })
        .toBe('budget,status');
      const mdd = JSON.parse(fs.readFileSync(doc.replace(/\.md$/, '.mdd'), 'utf8'));
      expect(mdd.blockData.xy.values.budget).toBe(1000);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
      cleanupDir(userDataDir);
    }
  });
});

// 4T-0517 (Epic 3E-0092): internes Ereignis-Profil — die Auflösung wirkt
// auch ohne konfigurierten Profil-Ordner (Zuordnungs-Feld-Default class),
// die Profil-Liste kennzeichnet das interne Profil ohne Öffnen-Affordanz,
// und mit deaktivierter Ereignis-Erweiterung verschwindet beides.
test.describe('PP-10: Internes Ereignis-Profil (4T-0517)', () => {
  test('Auflösung ohne Profil-Konfiguration: Ereignis-Felder im Vorschlags-Menü', async () => {
    // Bereich OHNE Bereichsdatei und ohne Profil-Ordner.
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-intern-'));
    const doc = writeDoc(areaRoot, 'geburtstag.md', ['class: Ereignis']);
    const { app, page, userData } = await launchApp();
    try {
      await bindAreaAndOpen(app, page, areaRoot, doc);
      await openPropertiesPanel(page);
      await expect(page.locator(`${PANEL}[data-profiles="on"]`)).toBeVisible();
      await page.locator(ADD_BTN).click();
      await expect(page.locator(MENU)).toBeVisible();
      // Profil-Kopf „Ereignis" mit den Definitions-Feldern des internen
      // Profils; Auswahl legt das Feld mit Definitions-Typ an.
      await expect(
        page.locator(`${MENU_ITEM}.is-profile-head`).filter({ hasText: 'Ereignis' }),
      ).toHaveCount(1);
      const indented = page.locator(`${MENU_ITEM}.is-indent`);
      await expect(indented.filter({ hasText: 'event-date' })).toHaveCount(1);
      await expect(indented.filter({ hasText: 'event-category' })).toHaveCount(1);
      await indented.filter({ hasText: 'event-date' }).click();
      await expect(page.locator(MENU)).toBeHidden();
      const field = page.locator(`${FIELDS} .properties-field`).last();
      await expect(field.locator('.properties-field-key')).toHaveValue('event-date');
      await expect(field).toHaveClass(/is-profile-defined/);
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
    }
  });

  test('Profil-Liste: Aus-Zustand ohne internes Profil, An-Zustand kennzeichnet es', async () => {
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-intern-aus-'));
    // Ereignis-Erweiterung beim Start deaktiviert (Store-Vorbelegung).
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-intern-ud-'));
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ extensions: { disabled: ['events'] } }),
      'utf8',
    );
    const SETTINGS_PAGE = `${PANE0} .pane-system .settings-page`;
    const openProfilesSettings = async (page) => {
      await expect
        .poll(async () => {
          if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
            await page.keyboard.press('Control+,');
          }
          return page.locator(SETTINGS_PAGE).isVisible();
        })
        .toBe(true);
      await page.locator('.settings-nav-entry[data-section-id="propertyProfiles"]').click();
      await expect(page.locator('#settings-profiles-folder')).toBeVisible();
    };
    const { app, page, userData } = await launchApp({ userData: userDataDir });
    try {
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');

      // Aus-Zustand: keine interne Zeile in der (leeren) Liste.
      await openProfilesSettings(page);
      await expect(page.locator('.settings-profiles-item')).toHaveCount(0);

      // Ereignis-Erweiterung einschalten und anwenden.
      await page.locator('.settings-nav-entry[data-section-id="extensions"]').click();
      await expect(page.locator('#settings-extensions-list')).toBeVisible();
      await page.locator('#settings-extension-events').check();
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      // An-Zustand: das interne Profil erscheint gekennzeichnet, ohne
      // Öffnen-Affordanz, mit den acht Feld-Definitionen.
      await openProfilesSettings(page);
      const items = page.locator('.settings-profiles-item');
      await expect(items).toHaveCount(1);
      await expect(items.nth(0)).toHaveClass(/is-internal/);
      await expect(items.nth(0).locator('.settings-profiles-item-name-static')).toHaveText(
        'Ereignis',
      );
      await expect(items.nth(0).locator('.settings-profiles-item-name')).toHaveCount(0);
      await expect(items.nth(0).locator('.settings-profiles-item-meta')).toContainText('8');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(areaRoot);
      cleanupDir(userDataDir);
    }
  });
});
