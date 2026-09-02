// Geteilte Vorbereitung der E2E-Suiten zu den Eigenschafts-Profilen: eine
// Bereichs-Wurzel mit Profil-Ordner, das Binden an das Startfenster, das
// Öffnen des Panels und das Aufräumen.
//
// 4T-001175 (Epic 3E-000220): Auszug aus eigenschafts-profile.spec.js, erzwungen
// vom Datei-Budget der Test-Dateien, als die Fälle des Feld-Formulars
// dazukamen. Der Schnitt folgt der Fachlichkeit: Was hier steht, ist
// AUFBAU und kein Prüffall — dieselbe Bereichs-Wurzel trägt die Suite der
// Profile und die des Feld-Formulars, und ein zweites Exemplar wäre eine
// zweite Wahrheit über denselben Aufbau.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expect } = require('@playwright/test');
const { SEL } = require('./selectors');

// Selektoren der Eigenschaften-Sektion, gemeinsam genutzt.
const PANE0 = '.pane-group[data-pane="0"]';
const PANEL = `${PANE0} .sidebar-properties`;
const ADD_BTN = `${PANEL} .properties-add-btn`;
const FIELDS = `${PANEL} .properties-fields`;

// Bereichs-Wurzel mit Profil-Ordner: Standard-Profil All (Feld thema),
// Profil Projekt (status mit Wertebereich, budget mit Default) und der
// propertyProfiles-Sektion in der Bereichsdatei.
function makeArea() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-profile-area-'));
  fs.mkdirSync(path.join(areaRoot, 'Profile'));
  fs.writeFileSync(
    path.join(areaRoot, 'Profile', 'All.md'),
    '---\nfields:\n  - name: thema\n    type: string\n---\nStandard-Profil.\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(areaRoot, 'Profile', 'Projekt.md'),
    [
      '---',
      'fields:',
      '  - name: status',
      '    values: [offen, erledigt]',
      '  - name: budget',
      '    type: number',
      '    default: 1000',
      '---',
      'Projekt-Profil.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(areaRoot, 'Area_Settings.mdda'),
    JSON.stringify(
      {
        schemaVersion: 1,
        settings: {
          propertyProfiles: { folder: 'Profile', assignField: 'class', defaultProfile: 'All' },
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return areaRoot;
}

// 4T-001185 (Epic 3E-000221, E1): Bereichs-Wurzel mit ABGELEITETEN Feldern.
//
// Eigene Wurzel und nicht `makeArea` erweitert: Die vorhandenen Prüffälle
// zählen die Felder ihrer Panels und greifen mit `.last()` auf die zuletzt
// angelegte Zeile zu. Abgeleitete Felder stehen hinter den Dokument-Feldern
// und verschöben genau diesen Zugriff — eine Erweiterung der gemeinsamen
// Wurzel bräche die Fälle der Stufen 1 bis 3, ohne dass an ihnen etwas falsch
// wäre.
//
// Das Profil trägt beide abgeleiteten Typen und einen Kreis-Fall, damit sich
// Wert, Hinweis und der Negativ-Nachweis an einer Wurzel zeigen lassen.
//
// 4T-001187: dazu die beiden Objekt-Typen. Sie bekommen keine eigene Wurzel,
// weil die Stufe 4 sie gemeinsam einführt und ein Prüffall für die eine Seite
// die andere ohnehin mit im Panel stehen hat; getrennte Wurzeln wären zwei
// Wahrheiten über denselben Aufbau. Der Name der Funktion bleibt, damit die
// Fälle aus 4T-001185 nicht ohne Grund umgeschrieben werden.
function makeAreaAbgeleitet() {
  const areaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pmpp-abgeleitet-area-'));
  fs.mkdirSync(path.join(areaRoot, 'Profile'));
  fs.writeFileSync(
    path.join(areaRoot, 'Profile', 'Rechnung.md'),
    [
      '---',
      'fields:',
      '  - name: netto',
      '    type: number',
      '  - name: steuer',
      '    type: number',
      '  - name: brutto',
      '    type: formula',
      '    options:',
      '      expression: netto + steuer',
      '  - name: kreis',
      '    type: formula',
      '    options:',
      '      expression: kreis + 1',
      '  - name: teilnehmer',
      '    type: objectlist',
      '    fields:',
      '      - name: person',
      '      - name: rolle',
      '        values: [Leitung, Gast]',
      '  - name: adresse',
      '    type: object',
      '    fields:',
      '      - name: ort',
      '  - name: posten',
      '    type: lookup',
      '    options:',
      '      relatedField: rechnung',
      '---',
      'Profil mit abgeleiteten Feldern.',
      '',
    ].join('\n'),
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
  return areaRoot;
}

function writeDoc(areaRoot, name, frontmatterLines) {
  const p = path.join(areaRoot, name);
  fs.writeFileSync(p, ['---', ...frontmatterLines, '---', '', 'Inhalt.', ''].join('\n'), 'utf8');
  return p;
}

// Bereich an das leere Startfenster binden (Muster vorlagen.spec.js VL-10)
// und die Datei über den Main-Kanal in das Bereichs-Fenster öffnen.
async function bindAreaAndOpen(app, page, areaRoot, filePath) {
  await expect
    .poll(async () => {
      const result = await page.evaluate((p) => window.api.openAreaPath(p), areaRoot);
      return !!(result && result.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
  await app.evaluate(({ BrowserWindow }, p) => {
    BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
  }, filePath);
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

async function openPropertiesPanel(page) {
  await page.locator('#btn-properties').click();
  await expect(page.locator(PANEL)).toBeVisible();
}

async function editorContains(page, text) {
  await page.locator(SEL.viewBtn('source')).click();
  await expect.poll(() => page.locator(SEL.editorContent0).innerText()).toContain(text);
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Windows-Handle noch offen: best effort */
  }
}

module.exports = {
  PANE0,
  PANEL,
  ADD_BTN,
  FIELDS,
  makeArea,
  makeAreaAbgeleitet,
  writeDoc,
  bindAreaAndOpen,
  openPropertiesPanel,
  editorContains,
  cleanupDir,
};
