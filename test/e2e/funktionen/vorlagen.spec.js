// 4T-000426 (Epic 3E-000080): E2E-Funktions-Suite Vorlagen — Anwendungs-Kommandos
// mit Dialog-Kette. VL-01: neue Datei aus Vorlage (Auswahl-Popup, Dateiname,
// prompt/select, Platzhalter gefüllt, Cursor-Sprung in den Edit-Modus);
// VL-02: Abbruch in der Dialog-Kette erzeugt KEINE Datei (Epic-Risiko
// Abbruch-Semantik); VL-03: Vorlage an der Cursor-Position einfügen (Cursor-
// Sprung, Undo in EINEM Schritt); VL-04: ohne konfigurierten Vorlagen-Ordner
// erscheint der lokalisierte Hinweis. describe-Titel tragen die Matrix-IDs
// (test/abdeckungs-matrix.json, F-101/S-072/S-073).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Profil mit globalem Vorlagen-Ordner, optionalen Ordner-Regeln (4T-000427)
// und belegten Kürzeln für die beiden Kommandos (electron-store liest
// config.json; Muster skript-bloecke.spec.js).
function makeUserData(templatesFolder, rules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-profile-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      templates: { folder: templatesFolder, ...(rules ? { rules } : {}) },
      hotkeys: {
        'file.newFromTemplate': 'Ctrl+Alt+9',
        'edit.insertTemplate': 'Ctrl+Alt+8',
      },
    }),
  );
  return dir;
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch gesperrt: Temp-Rest ist unkritisch */
  }
}

// Menue-IPC direkt an den Renderer (Muster bearbeitung-und-ansicht.spec.js):
// Menue-Accelerators erreichen CDP-synthetisierte Events nicht, der Test
// nutzt den identischen IPC-Pfad des Menue-Klicks.
async function sendMenuChannel(app, channel, ...args) {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send(payload.channel, ...payload.args);
    },
    { channel, args },
  );
}

// Kuerzel drücken, bis das Auswahl-Popup offen ist (Poll, weil der Kommando-
// Dispatcher erst am Ende des asynchronen init() steht; Muster hotkeys.spec.js).
async function openPickerViaHotkey(page, key) {
  const picker = page.locator('#template-picker-modal');
  await expect
    .poll(async () => {
      if (!(await picker.isVisible())) await page.keyboard.press(key);
      return picker.isVisible();
    })
    .toBe(true);
}

// 4T-000427: Unterseiten-Anlage anstoßen (Menue-IPC mit Poll wie oben) und den
// Namen bestätigen — der Rückweg für die Ordner-Regel-Tests.
async function createSubpageNamed(app, page, segment) {
  const nameModal = page.locator('#name-input-modal');
  await expect
    .poll(async () => {
      if (!(await nameModal.isVisible())) await sendMenuChannel(app, 'menu:newSubpage');
      return nameModal.isVisible();
    })
    .toBe(true);
  await page.locator('#name-input-field').fill(segment);
  await page.locator('#btn-name-input-ok').click();
}

// Arbeitsumgebung eines Tests: Dokument-Ordner (Zielordner der Anlage, trägt
// die Start-Datei) plus Vorlagen-Ordner mit den übergebenen Vorlagen.
function makeWorkspace(templates) {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-docs-'));
  const templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-src-'));
  for (const [name, body] of Object.entries(templates)) {
    fs.writeFileSync(path.join(templatesDir, name), body, 'utf8');
  }
  const startDoc = path.join(docsDir, 'Start.md');
  fs.writeFileSync(startDoc, '# Start\n\nInhalt.\n', 'utf8');
  return { docsDir, templatesDir, startDoc };
}

test.describe('VL-01: Neue Datei aus Vorlage — Dialog-Kette und Platzhalter (F-101/S-072)', () => {
  test('Auswahl, Dateiname, prompt/select; Datei entsteht gefüllt, Cursor springt', async () => {
    const ws = makeWorkspace({
      'Besprechung.md': [
        '# {{title}}',
        '',
        'Datum: {{date}}',
        'Thema: {{prompt:Thema}}',
        'Prio: {{select:Priorität:Hoch,Niedrig}}',
        'Nochmal: {{prompt:Thema}}',
        '{{cursor}}Notizen',
        '',
      ].join('\n'),
    });
    const userData = makeUserData(ws.templatesDir);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      // Auswahl-Popup: Vorlage per Klick wählen.
      await openPickerViaHotkey(page, 'Control+Alt+9');
      await page.locator('#template-picker-list button', { hasText: 'Besprechung' }).click();

      // Dateiname (Unterseiten-Schreibweise wäre erlaubt; hier einfacher Name).
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Protokoll 2026');
      await page.locator('#btn-name-input-ok').click();

      // prompt-Dialog (identische Frage nur EINMAL erhoben).
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await expect(page.locator('#name-input-title')).toHaveText('Thema');
      await page.locator('#name-input-field').fill('Budget');
      await page.locator('#btn-name-input-ok').click();

      // select-Dialog.
      await expect(page.locator('#template-select-modal')).toBeVisible();
      await page.locator('#template-select-list button', { hasText: 'Hoch' }).click();

      // Datei entsteht gefüllt; der Cursor-Sprung schaltet in den Edit-Modus.
      const target = path.join(ws.docsDir, 'Protokoll 2026.md');
      await expect(page.locator(SEL.activeTab0)).toContainText('Protokoll 2026');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      const content = fs.readFileSync(target, 'utf8');
      expect(content).toContain('# Protokoll 2026');
      expect(content).toMatch(/Datum: \d{4}-\d{2}-\d{2}\n/);
      expect(content).toContain('Thema: Budget');
      expect(content).toContain('Prio: Hoch');
      expect(content).toContain('Nochmal: Budget');
      expect(content).toContain('Notizen');
      expect(content).not.toContain('{{cursor}}');
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-02: Abbruch in der Dialog-Kette — keine Datei (F-101/S-072)', () => {
  test('Abbrechen im prompt-Dialog verwirft alles', async () => {
    const ws = makeWorkspace({
      'Frage.md': 'Antwort: {{prompt:Frage}}\n',
    });
    const userData = makeUserData(ws.templatesDir);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await openPickerViaHotkey(page, 'Control+Alt+9');
      await page.locator('#template-picker-list button', { hasText: 'Frage' }).click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Abbruch-Test');
      await page.locator('#btn-name-input-ok').click();
      // prompt-Dialog abbrechen -> gesamtes Anwenden bricht ab.
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#btn-name-input-cancel').click();
      await expect(page.locator('#name-input-modal')).toBeHidden();
      // Kein neuer Tab, keine Datei.
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      expect(fs.existsSync(path.join(ws.docsDir, 'Abbruch-Test.md'))).toBe(false);
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-03: Vorlage einfügen — Cursor-Sprung und Ein-Schritt-Undo (S-073)', () => {
  test('Einfügen an der Cursor-Position; ein Strg+Z entfernt alles', async () => {
    const ws = makeWorkspace({
      'Einschub.md': 'Eingefügt({{title}}){{cursor}}Rest\n',
    });
    const userData = makeUserData(ws.templatesDir);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      // Edit-Modus aktivieren (Menue-IPC-Pfad; Poll, weil die Menue-Listener
      // erst im asynchronen init() registriert werden) und Cursor ans Ende.
      const editor0 = page.locator(SEL.editorContent0);
      await expect
        .poll(async () => {
          if (!(await editor0.isVisible())) await sendMenuChannel(app, 'menu:toggleEdit');
          return editor0.isVisible();
        })
        .toBe(true);
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+End');

      await openPickerViaHotkey(page, 'Control+Alt+8');
      await page.locator('#template-picker-list button', { hasText: 'Einschub' }).click();

      const editor = page.locator(SEL.editorContent0);
      await expect(editor).toContainText('Eingefügt(Start)');
      await expect(editor).toContainText('Rest');
      await expect(editor).not.toContainText('{{cursor}}');

      // Undo in EINEM Schritt: der Einfüge-Text verschwindet komplett.
      await page.locator(SEL.editorContent0).click();
      await page.keyboard.press('Control+Z');
      await expect(editor).not.toContainText('Eingefügt(Start)');
      await expect(editor).not.toContainText('Rest');
      await expect(editor).toContainText('Inhalt.');
    } finally {
      await closeApp(app, userData, { force: true });
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-04: Ohne Vorlagen-Ordner — lokalisierter Hinweis (F-101)', () => {
  test('Kommando meldet den unkonfigurierten Zustand statt leerer Liste', async () => {
    const ws = makeWorkspace({});
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-profile-'));
    fs.writeFileSync(
      path.join(userData, 'config.json'),
      JSON.stringify({ hotkeys: { 'file.newFromTemplate': 'Ctrl+Alt+9' } }),
    );
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      const hint = page.locator('#statusbar-hint');
      await expect
        .poll(async () => {
          await page.keyboard.press('Control+Alt+9');
          return (await hint.getAttribute('class')) || '';
        })
        .toMatch(/visible/);
      await expect(hint).toHaveClass(/error/);
      await expect(page.locator('#template-picker-modal')).toBeHidden();
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

// --- 4T-000427 (Epic 3E-000080): Ordner-Regeln --------------------------------------

test.describe('VL-05: Ordner-Regel — Anlage im Regel-Ordner erhält die Vorlage (F-101)', () => {
  test('Unterseiten-Anlage füllt die Datei über die Regel und springt zum Cursor-Ziel', async () => {
    const ws = makeWorkspace({
      'Auto.md': 'Auto: {{title}}\n{{cursor}}Los\n',
    });
    const userData = makeUserData(ws.templatesDir, [{ folder: ws.docsDir, template: 'Auto.md' }]);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await createSubpageNamed(app, page, 'Kind');
      // Regel gefüllt: Datei trägt den Vorlagen-Inhalt, Cursor-Sprung
      // aktiviert den Edit-Modus.
      const target = path.join(ws.docsDir, 'Start∕Kind.md');
      await expect(page.locator(SEL.editorContent0)).toBeVisible();
      await expect
        .poll(() => (fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null))
        .toContain('Auto: Start/Kind');
      const content = fs.readFileSync(target, 'utf8');
      expect(content).toContain('Los');
      expect(content).not.toContain('{{cursor}}');
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-06: Ordner-Regel — Anlage außerhalb des Regel-Ordners bleibt leer (F-101)', () => {
  test('kein Regel-Treffer, die Datei entsteht leer', async () => {
    const ws = makeWorkspace({
      'Auto.md': 'Auto: {{title}}\n',
    });
    const userData = makeUserData(ws.templatesDir, [
      { folder: path.join(ws.docsDir, 'GTD'), template: 'Auto.md' },
    ]);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await createSubpageNamed(app, page, 'Leer');
      const target = path.join(ws.docsDir, 'Start∕Leer.md');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      expect(fs.readFileSync(target, 'utf8')).toBe('');
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-07: Expliziter Vorlagen-Weg übersteuert die Ordner-Regel (F-101)', () => {
  test('Neue Datei aus Vorlage nutzt NUR die gewählte Vorlage', async () => {
    const ws = makeWorkspace({
      'Auto.md': 'AUTO-REGEL\n',
      'Manuell.md': 'Manuell gewählt\n',
    });
    const userData = makeUserData(ws.templatesDir, [{ folder: ws.docsDir, template: 'Auto.md' }]);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await openPickerViaHotkey(page, 'Control+Alt+9');
      await page.locator('#template-picker-list button', { hasText: 'Manuell' }).click();
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await page.locator('#name-input-field').fill('Uebersteuert');
      await page.locator('#btn-name-input-ok').click();
      const target = path.join(ws.docsDir, 'Uebersteuert.md');
      await expect
        .poll(() => (fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null))
        .toContain('Manuell gewählt');
      expect(fs.readFileSync(target, 'utf8')).not.toContain('AUTO-REGEL');
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-08: Ordner-Regel — Dialog-Abbruch legt die Datei leer an, mit Hinweis (F-101)', () => {
  test('Abbruch im Regel-prompt lässt die Datei leer und meldet den Hinweis', async () => {
    const ws = makeWorkspace({
      'Frage.md': 'Antwort: {{prompt:Frage}}\n',
    });
    const userData = makeUserData(ws.templatesDir, [{ folder: ws.docsDir, template: 'Frage.md' }]);
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await createSubpageNamed(app, page, 'Abbruch');
      // Der Regel-prompt erscheint; Abbrechen laesst die Datei leer.
      await expect(page.locator('#name-input-modal')).toBeVisible();
      await expect(page.locator('#name-input-title')).toHaveText('Frage');
      await page.locator('#btn-name-input-cancel').click();
      const target = path.join(ws.docsDir, 'Start∕Abbruch.md');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      expect(fs.readFileSync(target, 'utf8')).toBe('');
      await expect(page.locator('#statusbar-hint')).toHaveClass(/visible/);
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

// --- 4T-000428 (Epic 3E-000080): Einstellungs-Bereich und Bereichs-Anbindung --------

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

// Einstellungs-Seite öffnen und den Vorlagen-Bereich aktivieren (Poll wie
// hotkeys.spec.js; der Konfigurations-Stand lädt asynchron nach).
async function openTemplatesSettings(page) {
  await expect
    .poll(async () => {
      if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
        await page.keyboard.press('Control+,');
      }
      return page.locator(SETTINGS_PAGE).isVisible();
    })
    .toBe(true);
  await page.locator('.settings-nav-entry[data-section-id="templates"]').click();
  await expect(page.locator('#settings-templates-global-folder')).toBeVisible();
}

test.describe('VL-09: Einstellungen — globaler Ordner und Regel wirken sofort (F-101)', () => {
  test('Ordner setzen, Regel anlegen; Auswahl-Popup und Regel-Trigger sehen beides', async () => {
    const ws = makeWorkspace({
      'Auto.md': 'AUTO {{title}}\n',
    });
    // Profil OHNE Vorlagen-Konfiguration: alles läuft über die Einstellungs-UI.
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-profile-'));
    fs.writeFileSync(
      path.join(userData, 'config.json'),
      JSON.stringify({ hotkeys: { 'file.newFromTemplate': 'Ctrl+Alt+9' } }),
    );
    const { app, page } = await launchApp({ args: [ws.startDoc], userData });
    try {
      await expect(page.locator(SEL.markdownBody0)).toBeVisible();
      await openTemplatesSettings(page);
      await page.locator('#settings-templates-global-folder').fill(ws.templatesDir);
      await page.locator('#settings-templates-global-rule-add').click();
      await page.locator('#settings-templates-global-rule-folder-0').fill(ws.docsDir);
      await page.locator('#settings-templates-global-rule-template-0').fill('Auto.md');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      // Wirkt ohne Neustart: das Auswahl-Popup listet die Vorlage.
      await openPickerViaHotkey(page, 'Control+Alt+9');
      await expect(page.locator('#template-picker-list button', { hasText: 'Auto' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#template-picker-modal')).toBeHidden();

      // Regel wirksam: Unterseiten-Anlage im Regel-Ordner erhält die Vorlage.
      await createSubpageNamed(app, page, 'Regel');
      const target = path.join(ws.docsDir, 'Start∕Regel.md');
      await expect
        .poll(() => (fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null))
        .toContain('AUTO Start/Regel');
    } finally {
      await closeApp(app, userData);
      cleanupDir(ws.docsDir);
      cleanupDir(ws.templatesDir);
    }
  });
});

test.describe('VL-10: Einstellungen — Bereichs-Konfiguration übersteuert global (F-101)', () => {
  test('Bereichs-Ordner setzen; Popup zeigt Bereichs-Vorlagen, Bereichsdatei entsteht', async () => {
    // Bereichs-Wurzel mit eigenem Vorlagen-Ordner plus globalem Fallback.
    const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-area-'));
    fs.mkdirSync(path.join(areaRoot, 'Vorlagen'));
    fs.writeFileSync(path.join(areaRoot, 'Vorlagen', 'AreaVorlage.md'), 'Bereich\n', 'utf8');
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-templates-global-'));
    fs.writeFileSync(path.join(globalDir, 'Global.md'), 'Global\n', 'utf8');
    const userData = makeUserData(globalDir);
    const { app, page } = await launchApp({ userData });
    try {
      // Bereich an das (leere) Startfenster binden.
      await expect
        .poll(async () => {
          const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
          return !!(result && result.ok !== false);
        })
        .toBe(true);
      // 4T-000555 (Epic 3E-000100): die Bereichs-Konfiguration lebt in der
      // eigenen Sektion templatesArea (Navigations-Gruppe „Aktueller
      // Bereich"), nicht mehr im globalen Vorlagen-Bereich.
      await expect
        .poll(async () => {
          if (!(await page.locator(SETTINGS_PAGE).isVisible())) {
            await page.keyboard.press('Control+,');
          }
          return page.locator(SETTINGS_PAGE).isVisible();
        })
        .toBe(true);
      await page.locator('.settings-nav-entry[data-section-id="templatesArea"]').click();
      // Bereichs-Gruppe aktivieren und den Ordner relativ setzen.
      await page.locator('#settings-templates-area-enabled').check();
      await expect(page.locator('#settings-templates-area-folder')).toBeVisible();
      await page.locator('#settings-templates-area-folder').fill('Vorlagen');
      await page.locator('#btn-settings-ok').click();
      await expect(page.locator(SETTINGS_PAGE)).toBeHidden();

      // Vollständige Übersteuerung: nur die Bereichs-Vorlage erscheint.
      await openPickerViaHotkey(page, 'Control+Alt+9');
      await expect(
        page.locator('#template-picker-list button', { hasText: 'AreaVorlage' }),
      ).toBeVisible();
      await expect(page.locator('#template-picker-list button', { hasText: 'Global' })).toHaveCount(
        0,
      );
      await page.keyboard.press('Escape');

      // Die Bereichsdatei trägt die templates-Sektion.
      const mdda = path.join(areaRoot, 'Area_Settings.mdda');
      expect(fs.existsSync(mdda)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(mdda, 'utf8'));
      expect(parsed.settings.templates.folder).toBe('Vorlagen');
    } finally {
      await closeApp(app, userData);
      cleanupDir(areaRoot);
      cleanupDir(globalDir);
    }
  });
});
