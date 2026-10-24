// 4T-002308 (Epic 3E-000263, S9; AK3): E2E-Funktions-Suite — die eigene Rolle
// in der Übersicht der Datenbank, in der realen Anordnung.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Der
// Anmeldename kommt im gebauten Programm aus der Herkunft des Haupt-Prozesses
// und reist über den Überblicks-Kanal in die Seite. Die Unit-Fälle setzen ihn
// über eine Naht; nur hier zeigt sich, dass der echte Name des Systems die
// echte Zuordnung im Steckbrief trifft und wörtlich in der Übersicht steht.
//
// **Sprachfrei geprüft:** Gemessen werden Rollen-Name und Anmeldename, die beide
// aus dem angelegten Bestand und dem System stammen, nicht die Beschriftung.
//
// 4T-002309 (S9; AK1, AK2): DB-ROL-02 — die Abweisung an der Schreib-Schnittstelle
// im gebauten Ablauf. Die Unit-Fälle prüfen Regel und Naht mit einer
// Rechte-Naht; nur hier zeigt sich, dass die Verdrahtung die Erlaubnis-Menge aus
// dem echten Steckbrief und der echten Herkunft bildet und die Meldung bis in
// Maske und Statuszeile trägt. Das Operations-Wort wird gegen alle fünf
// Sprachfassungen gemessen, Tabelle und Rolle wörtlich. Seit 4T-002311 fehlen
// «Neuer Datensatz» und «Löschen» ohne Erlaubnis; der Fall erreicht die
// Schnittstelle deshalb über die Brücke des Anzeige-Prozesses
// (`window.api.databaseNeuanlage`, `window.api.databaseAuftrag`, dieselben
// Aufrufe wie Maske und Speichern) und prüft Tabelle, Operation und Rolle an der
// Lage der Antwort.
//
// 4T-002311 (S9; AK1, AK2, AK4): DB-MAS-13 — die Einzel-Maske und der
// Datensatz-Block mit eingeschränkter Rolle. Der Fall steht hier und nicht in
// `datenbank-maske.spec.js`, weil jene Datei am Zeilen-Budget steht und die
// Bereiche mit Rollen hier gebaut werden.
//
// 4T-002310 (S9; AK1, AK2): DB-ROL-03 — der Schutz der Definition beim Speichern
// im Editor. Die Unit-Fälle prüfen Vergleich und Kanal mit einem Rechte-Doppel
// und ohne Index; nur hier zeigt sich, dass die Verdrahtung die Rechte aus dem
// echten Index und dem gespeicherten Steckbrief bildet und die Abweisung als
// Meldung des Speicherns beim Anwender ankommt. Die Meldung ist der native
// Fehler-Dialog des Speicherns und per Playwright nicht bedienbar; er wird im
// Haupt-Prozess ersetzt und mitgeschrieben (Muster `regression/4t-0945-b12.spec.js`).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');

const PANE = '.pane-group[data-pane="0"]';
const SEITE = `${PANE} .pane-system .db-overview-page`;
const MASKE = `${PANE} .pane-system .db-form-page`;

function inAllenSprachen(key) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]);
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

// Der Anmeldename, wie ihn die Herkunft des Haupt-Prozesses liest
// (`src/main/herkunft.js`: `os.userInfo().username`, getrimmt).
function eigenerAnmeldename() {
  return os.userInfo().username.trim();
}

// Ein Bereich mit Datenbank: Steckbrief mit zwei Rollen, Vorgabe-Rolle und der
// Zuordnung des eigenen Anmeldenamens, dazu eine Tabelle; die Bereichsdatei
// öffnet die Übersicht beim Binden.
function baueBereich(anmeldename) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-berechtigung-'));
  const steckbrief = [
    '---',
    'db-database:',
    '  name: Bibliothek',
    '  roles:',
    '    librarian: all',
    '    assistant:',
    '      Library: [update]',
    '  defaultRole: assistant',
    '  users:',
    `    ${JSON.stringify(anmeldename)}: librarian`,
    '---',
    '',
  ];
  fs.writeFileSync(path.join(wurzel, 'Datenbank.md'), steckbrief.join('\n'), 'utf8');
  const tabelle = ['---', 'db-table:', '  fields:', '    - name: title', '---', ''];
  fs.writeFileSync(path.join(wurzel, 'Library.md'), tabelle.join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { database: { overviewOnOpen: true } } }),
    'utf8',
  );
  return wurzel;
}

// 4T-002309: Steckbrief mit der Vorgabe-Rolle «assistant», die an «Library»
// allein ändern darf, und keiner Zuordnung; dazu eine Tabelle mit einem
// Datensatz und dem Hochwasserstand 1.
function baueBereichOhneLoeschen() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-berechtigung-'));
  const steckbrief = [
    '---',
    'db-database:',
    '  name: Bibliothek',
    '  roles:',
    '    librarian: all',
    '    assistant:',
    '      Library: [update]',
    '  defaultRole: assistant',
    '---',
    '',
  ];
  fs.writeFileSync(path.join(wurzel, 'Datenbank.md'), steckbrief.join('\n'), 'utf8');
  const tabelle = path.join(wurzel, 'Library.md');
  const zeilen = ['---', 'db-table:', '  lastId: 1', '  fields:', '    - name: title', '---', ''];
  zeilen.push('```perspective-records', '|- id="r-00001"', '| Faust', '```', '');
  fs.writeFileSync(tabelle, zeilen.join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { database: { overviewOnOpen: true } } }),
    'utf8',
  );
  return { wurzel, tabelle };
}

async function bindeBereich(page, wurzel) {
  await expect
    .poll(async () => {
      const ergebnis = await page.evaluate((p) => window.api.openAreaPath(p), wurzel);
      return !!(ergebnis && ergebnis.ok !== false);
    })
    .toBe(true);
  await expect.poll(() => page.title()).toContain('(Bereich');
}

test.describe('DB-ROL-01: eigene Rolle in der Übersicht der Datenbank (4T-002308)', () => {
  test('zeigt die zugeordnete Rolle samt Anmeldenamen', async () => {
    const anmeldename = eigenerAnmeldename();
    const wurzel = baueBereich(anmeldename);
    const { page, app, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      await expect(seite).toContainText('Bibliothek');
      // Die Zeile der eigenen Rolle nennt Rolle und Anmeldenamen wörtlich; sie
      // steht im Steckbrief-Block unmittelbar vor dem Abschnitt der Rollen.
      const werte = seite.locator('.db-overview-row-value');
      const zeile = werte.filter({ hasText: `${anmeldename})` });
      await expect(zeile).toHaveCount(1);
      await expect(zeile).toContainText('librarian');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-ROL-02: Abweisung an der Schreib-Schnittstelle (4T-002309)', () => {
  test('bietet Neuanlage ohne create und Löschen ohne delete nicht an und weist beide an der Schnittstelle ab', async () => {
    const { wurzel, tabelle } = baueBereichOhneLoeschen();
    const vorher = fs.readFileSync(tabelle, 'utf8');
    const { page, app, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      // Die Übersicht zeigt die Vorgabe-Rolle: Der Index ist bereit, und die
      // Schnittstelle liest dieselbe Erlaubnis-Menge.
      await expect(
        seite.locator('.db-overview-row-value').filter({ hasText: 'assistant' }).first(),
      ).toBeVisible();

      // AK2: Seit 4T-002311 bietet die Übersicht ohne create kein «Neuer
      // Datensatz» an; die Schnittstelle weist die Neuanlage über die Brücke des
      // Anzeige-Prozesses dennoch ab, zieht keine Kennung und nennt die Rolle.
      await expect(seite.locator('.db-overview-table tbody tr')).toHaveCount(1);
      await expect(seite.locator('.db-overview-new-record')).toHaveCount(0);
      const neu = await page.evaluate((t) => window.api.databaseNeuanlage({ tabelle: t }), tabelle);
      expect(neu.ok).toBe(false);
      expect(neu.lagen[0]).toMatchObject({ tabelle, operation: 'create', rolle: 'assistant' });
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(vorher);
      await expect(page.locator(MASKE)).toHaveCount(0);

      // AK1: Die Einzel-Maske bietet ohne delete kein «Löschen» an, «Bearbeiten»
      // bleibt (die Rolle darf ändern); ein Löschen über die Brücke weist die
      // Schnittstelle ab, und der Datensatz bleibt.
      await page.evaluate(
        ({ filePath, recordId }) => {
          document.dispatchEvent(
            new CustomEvent('scg:open-form', { detail: { filePath, recordId } }),
          );
        },
        { filePath: tabelle, recordId: 'r-00001' },
      );
      const maske = page.locator(MASKE);
      await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
      await expect(maske.locator('.db-form-delete')).toHaveCount(0);
      // Die Erwartung ist der gelesene Stand, wie ihn die Maske mitschickt.
      const anweisung = { tabelle, art: 'delete', id: 'r-00001', erwartet: { title: 'Faust' } };
      const auftrag = { anweisungen: [anweisung] };
      const ergebnis = await page.evaluate(
        (a) => window.api.databaseAuftrag({ auftrag: a }),
        auftrag,
      );
      expect(ergebnis.ok).toBe(false);
      // Der Befund der Regel reist in der Lage der Prüf-Naht.
      expect(ergebnis.lagen[0].naht, JSON.stringify(ergebnis.lagen)).toMatchObject({
        code: 'regelNichtErlaubt',
        tabelle,
        operation: 'delete',
        rolle: 'assistant',
      });
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(vorher);
      expect(fs.existsSync(path.join(wurzel, 'Library.mddl'))).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002310: Steckbrief mit der Vorgabe-Rolle «assistant» ohne `define`, dazu
// eine Tabelle mit Beschriftung und einem Satz im Prosa-Teil.
function baueBereichOhneDefine() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-db-berechtigung-'));
  const steckbrief = [
    '---',
    'db-database:',
    '  name: Bibliothek',
    '  roles:',
    '    librarian: all',
    '    assistant:',
    '      Library: [update]',
    '  defaultRole: assistant',
    '---',
    '',
  ];
  fs.writeFileSync(path.join(wurzel, 'Datenbank.md'), steckbrief.join('\n'), 'utf8');
  const tabelle = path.join(wurzel, 'Library.md');
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: pages', '      label: Pages'];
  zeilen.push('---', '', '# Library', '', 'Ein Satz im Text.', '');
  fs.writeFileSync(tabelle, zeilen.join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { database: { overviewOnOpen: true } } }),
    'utf8',
  );
  return { wurzel, tabelle };
}

// Der Fehler-Dialog des Speicherns, ersetzt und mitgeschrieben.
async function fangeMeldungen(app) {
  await hauptSenden(app, ({ dialog }) => {
    globalThis.__defSchutzMeldungen = [];
    dialog.showMessageBox = async (_win, optionen) => {
      const o = optionen || _win || {};
      globalThis.__defSchutzMeldungen.push(`${o.message || ''}\n${o.detail || ''}`);
      return { response: 0 };
    };
  });
}

function meldungen(app) {
  return hauptLesen(app, () => globalThis.__defSchutzMeldungen || []);
}

// Ans Ende einer Zeile des Editors springen, die den Text enthält.
async function zeilenEnde(page, text) {
  await page.locator(`${SEL.editorContent0} .cm-line`, { hasText: text }).first().click();
  await page.keyboard.press('End');
}

test.describe('DB-ROL-03: Schutz der Definition beim Speichern (4T-002310)', () => {
  test('weist eine geänderte Beschriftung ohne define ab und speichert eine Änderung im Prosa-Teil', async () => {
    const { wurzel, tabelle } = baueBereichOhneDefine();
    const vorher = fs.readFileSync(tabelle, 'utf8');
    const { page, app, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      // Die Übersicht zeigt die Vorgabe-Rolle: Der Index ist bereit.
      await expect(
        seite.locator('.db-overview-row-value').filter({ hasText: 'assistant' }).first(),
      ).toBeVisible();

      await oeffneDokumentImFenster(app, page, tabelle);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.editorContent0)).toHaveAttribute('contenteditable', 'true');
      await expect(page.locator(SEL.editorContent0)).toContainText('label: Pages');
      await fangeMeldungen(app);

      // AK1: Die Beschriftung des Feldes ändern und speichern.
      await zeilenEnde(page, 'label: Pages');
      await page.keyboard.type(' total');
      await page.keyboard.press('Control+s');
      await expect.poll(async () => (await meldungen(app)).length, { timeout: 15000 }).toBe(1);
      const satz = (await meldungen(app))[0];
      expect(satz).toContain('«assistant»');
      expect(satz).toContain('«Library»');
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(vorher);
      // Der Text bleibt im Editor und gilt weiter als ungespeichert.
      await expect(page.locator(SEL.editorContent0)).toContainText('label: Pages total');
      await expect(page.locator(SEL.dirtyTab0).first()).toBeVisible();

      // AK2: Beschriftung zurücknehmen, allein im Prosa-Teil ändern und speichern.
      await zeilenEnde(page, 'label: Pages total');
      for (let i = 0; i < ' total'.length; i++) await page.keyboard.press('Backspace');
      await zeilenEnde(page, 'Ein Satz im Text.');
      await page.keyboard.type(' Noch ein Wort.');
      await page.keyboard.press('Control+s');
      await expect
        .poll(() => fs.readFileSync(tabelle, 'utf8'), { timeout: 15000 })
        .toContain('Ein Satz im Text. Noch ein Wort.');
      expect(fs.readFileSync(tabelle, 'utf8')).toContain('      label: Pages\n');
      expect(await meldungen(app)).toHaveLength(1);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

// 4T-002311: Steckbrief mit der Vorgabe-Rolle «assistant», die an «Library»
// allein ändern und an «Staff» nichts darf; jede Tabelle mit einem Datensatz.
function baueBereichEingeschraenkt() {
  const { wurzel, tabelle } = baueBereichOhneLoeschen();
  const staff = path.join(wurzel, 'Staff.md');
  const zeilen = ['---', 'db-table:', '  lastId: 1', '  fields:', '    - name: name', '---', ''];
  zeilen.push('```perspective-records', '|- id="r-00001"', '| Clara', '```', '');
  fs.writeFileSync(staff, zeilen.join('\n'), 'utf8');
  return { wurzel, library: tabelle, staff };
}

test.describe('DB-MAS-13: Einzel-Maske mit eingeschränkter Rolle (4T-002311)', () => {
  test('zeigt die Felder lesend, nennt die Rolle und bietet weder Bearbeiten, Löschen noch Neuanlage an', async () => {
    const { wurzel, library, staff } = baueBereichEingeschraenkt();
    const { page, app, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      const seite = page.locator(SEITE);
      await expect(seite).toBeVisible({ timeout: 20000 });
      // Die Übersicht nennt je Tabelle die Erlaubnisse; ohne create kein «Neuer Datensatz».
      await expect(seite.locator('.db-overview-table-rights')).toHaveCount(2, { timeout: 20000 });
      await expect(seite.locator('.db-overview-new-record')).toHaveCount(0);

      // AK1, AK4: Die Maske eines Datensatzes von «Staff» zeigt ihre Felder
      // lesend und den Satz mit Rolle und Tabelle; «Bearbeiten» und «Löschen» fehlen.
      await page.evaluate(
        ({ filePath, recordId }) => {
          document.dispatchEvent(
            new CustomEvent('scg:open-form', { detail: { filePath, recordId } }),
          );
        },
        { filePath: staff, recordId: 'r-00001' },
      );
      const maske = page.locator(MASKE);
      const satz = maske.locator('.db-form-not-editable.db-form-role');
      await expect(satz).toHaveCount(1, { timeout: 20000 });
      const erwartet = inAllenSprachen('database.form.rolleKeinUpdate').map((text) =>
        text.replace('{rolle}', 'assistant').replace('{tabelle}', 'Staff'),
      );
      expect(erwartet).toContain(await satz.textContent());
      await expect(maske.locator('.db-form-field[data-field="name"]')).toContainText('Clara');
      await expect(maske.locator('.db-form-input')).toHaveCount(0);
      await expect(maske.locator('.db-form-edit, .db-form-delete')).toHaveCount(0);

      // AK2: Die Maske von «Library» bietet «Bearbeiten», aber kein «Löschen».
      await page.evaluate(
        ({ filePath, recordId }) => {
          document.dispatchEvent(
            new CustomEvent('scg:open-form', { detail: { filePath, recordId } }),
          );
        },
        { filePath: library, recordId: 'r-00001' },
      );
      await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
      await expect(maske.locator('.db-form-delete, .db-form-role')).toHaveCount(0);

      // AK2: Unter der Tabelle «Staff» fehlt «Neuer Datensatz», «Datensatz öffnen» bleibt.
      await oeffneDokumentImFenster(app, page, staff);
      const block = page.locator(`${SEL.markdownBody0} .perspective-records`);
      await expect(block.locator('.prc-open-btn')).toHaveCount(1, { timeout: 20000 });
      await expect(block.locator('.prc-foot')).toBeHidden({ timeout: 20000 });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
