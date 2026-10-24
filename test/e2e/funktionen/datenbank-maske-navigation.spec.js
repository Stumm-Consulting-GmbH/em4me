// 4T-002185 (Epic 3E-000261, Entscheidung F4 Option A): Die Navigation zwischen
// Masken in der realen Anordnung — DB-MAS-09. Seit 4T-002335 (Epic 3E-000264)
// dazu DB-MAS-15 («Verwendet von») und DB-MAS-16 (Datensatz-Verweis im Körper),
// beide mit dem Verlauf und «Zurück».
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Ob ein
// Klick auf einen Link im Körper der Maske überhaupt ankommt, hängt am
// gerenderten Wiki-Link der Darstellungs-Strecke, an der Auflösung des
// Link-Ziels im Haupt-Prozess und am Katalog, der die Masken-Dateien seiner
// Tabellen erst am gebundenen Bereich kennt. Diese Kette besteht nur in der
// laufenden Anwendung.
//
// **Eigene Datei statt einer weiteren Folge in `datenbank-maske.spec.js`**:
// Jene steht nahe an ihrem Zeilen-Budget. Aufbau und Gerüst folgen ihr Zeichen
// für Zeichen (Bereich mit «Kunden» und «Bestellungen», Öffnen der Maske über
// das Seiten-Ereignis als Aufbau, sprachfreie Prüfung gegen die fünf
// Sprachfassungen); geprüft wird allein, was der Anwender in der Maske tut.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const { LOCALE_CODES } = require('../../../src/shared/locales.js');
const { hauptSenden } = require('../helpers/haupt-zugriff');

const PANE = '.pane-group[data-pane="0"]';
const MASKE = `${PANE} .pane-system .db-form-page`;
const BLOCK_LESE = `${SEL.markdownBody0} .perspective-records`;
const KENNUNG = 'r-00001';
const FELDER = ['Name', 'Menge', 'Aktiv'];

function tmpDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

// Ein Satz eines Schlüssels mit eingesetzten Angaben, in allen fünf Sprachen.
function saetze(key, werte) {
  return LOCALE_CODES.map((code) => require(`../../../src/i18n/${code}.json`)[key]).map((text) =>
    Object.entries(werte).reduce((satz, [name, wert]) => satz.split(`{${name}}`).join(wert), text),
  );
}

// Eine Masken-Datei mit Überschrift, Feldern und Links darunter.
function maskeMitLinks(tabelle, titel, felder, links) {
  return [
    '---',
    'db-form:',
    `  table: ${tabelle}`,
    '---',
    '',
    `# ${titel}`,
    '',
    ...felder.map((feld) => `{{field:${feld}}}\n`),
    links.map((ziel) => `[[${ziel}]]`).join(' '),
    '',
  ].join('\n');
}

// Der Bereich von DB-MAS-05: «Kunden» mit Schlüssel und Anzeige-Form «Name»,
// «Bestellungen» verweist über «Kunde» auf «Beat Beispiel» (in Kurzform). Dazu
// drei Masken-Dateien mit Links und ein gewöhnliches Dokument. Die Maske der
// Bestellungen trägt seit 4T-002335 zusätzlich einen Datensatz-Verweis auf
// «Beat Beispiel» (DB-MAS-16).
function baueBereich() {
  const wurzel = tmpDir('em4me-maske-nav-');
  const datei = (name, zeilen) =>
    fs.writeFileSync(path.join(wurzel, name), [].concat(zeilen).join('\n'), 'utf8');
  datei('Datenbank.md', ['---', 'db-database:', '  name: Mini-CRM', '---', '', '']);
  datei('Kunden.md', [
    '---',
    'db-table:',
    '  lastId: 2',
    '  fields:',
    '    - name: Name',
    '      type: string',
    '      required: true',
    '    - name: Menge',
    '      type: number',
    '    - name: Aktiv',
    '      type: boolean',
    '  key: Name',
    '  display: Name',
    '---',
    '',
    '```perspective-records',
    `|- id="${KENNUNG}"`,
    '| Anna Muster',
    '| 12',
    '| x',
    '|- id="r-00002"',
    '| Beat Beispiel',
    '| 3',
    '|',
    '```',
    '',
  ]);
  datei('Bestellungen.md', [
    '---',
    'db-table:',
    '  lastId: 1',
    '  fields:',
    '    - name: Titel',
    '      type: string',
    '    - name: Kunde',
    '      type: record',
    '      options:',
    '        table: Kunden',
    '---',
    '',
    '```perspective-records',
    `|- id="${KENNUNG}"`,
    '| Erste Bestellung',
    '| r-2',
    '```',
    '',
  ]);
  datei('Kunden Form.md', maskeMitLinks('Kunden', 'Lang', FELDER, ['Kunden Kurz']));
  datei('Kunden Kurz.md', maskeMitLinks('Kunden', 'Kurz', ['Name'], ['Kunden Form', 'Notiz']));
  datei(
    'Bestellungen Form.md',
    maskeMitLinks(
      'Bestellungen',
      'Bestellung',
      ['Titel', 'Kunde'],
      ['Kunden Kurz', 'Kunden#^r-00002'],
    ),
  );
  datei('Notiz.md', ['# Notiz', '', 'Gewöhnliches Dokument.', '']);
  return {
    wurzel,
    tabelle: path.join(wurzel, 'Kunden.md'),
    bestellungen: path.join(wurzel, 'Bestellungen.md'),
  };
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

async function oeffneTabelle(app, page, tabelle) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:openExternal', [p]);
    },
    tabelle,
  );
  await expect(page.locator(SEL.tabs0).first()).toBeVisible();
}

// Aufbau: die Maske über die Verdrahtungs-Schnittstelle der Seite öffnen.
async function oeffneMaskeFuer(page, tabelle, kennung) {
  await page.evaluate(
    ({ filePath, recordId }) => {
      document.dispatchEvent(new CustomEvent('scg:open-form', { detail: { filePath, recordId } }));
    },
    { filePath: tabelle, recordId: kennung },
  );
  const maske = page.locator(MASKE);
  await expect(maske.locator('.db-form-edit')).toHaveCount(1, { timeout: 20000 });
  return maske;
}

function feldIn(maske, name) {
  return maske.locator(`.db-form-field[data-field="${name}"]`);
}

function linkIn(maske, ziel) {
  return maske.locator(`.db-form-body a.wikilink[href="${ziel}.md"]`);
}

async function erwarteQuelle(maske, datei) {
  await expect(maske.locator('.db-form-source')).toContainText(datei, { timeout: 20000 });
}

// Überschrift und Felder des gezeigten Masken-Körpers.
async function erwarteKoerper(maske, titel, felder) {
  await expect(maske.locator('.db-form-body h1')).toHaveText(titel);
  const namen = await maske
    .locator('.db-form-body .db-form-field')
    .evaluateAll((liste) => liste.map((e) => e.dataset.field));
  expect(namen).toEqual(felder);
}

test.describe('DB-MAS-09: Navigation zwischen Masken mit «Zurück» und Rückfrage (4T-002185)', () => {
  test('Link auf Maske derselben und einer anderen Tabelle, Verweis-Feld, Zurück, Dokument-Link', async () => {
    const { wurzel, tabelle, bestellungen } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.databaseDatensaetze({ tabelle: 'Kunden' })))
              .status,
          { timeout: 20000 },
        )
        .toBe('ready');
      const maske = page.locator(MASKE);

      // Aufbau: die Bestellung in ihrer Masken-Datei, sobald der Index sie kennt.
      await expect(async () => {
        await oeffneMaskeFuer(page, bestellungen, KENNUNG);
        await expect(maske.locator('.db-form-source')).toContainText('Bestellungen Form.md', {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      // AK6: ohne vorigen Datensatz kein «Zurück».
      await expect(maske.locator('.db-form-back')).toHaveCount(0);

      // AK4: Der Link auf die Maske einer anderen Tabelle meldet, ohne zu wechseln.
      await linkIn(maske, 'Kunden Kurz').click();
      const meldung = maske.locator('.db-form-nav-note');
      await expect(meldung).toBeVisible({ timeout: 20000 });
      expect(
        saetze('database.form.nav.otherTable', { form: 'Kunden Kurz.md', table: 'Kunden' }),
      ).toContain(await meldung.textContent());
      await erwarteQuelle(maske, 'Bestellungen Form.md');

      // AK2: Das Verweis-Feld öffnet den Kunden in der Standard-Maske seiner Tabelle.
      await feldIn(maske, 'Kunde').locator('.db-form-ref-link').click();
      await erwarteQuelle(maske, 'Kunden Form.md');
      await erwarteKoerper(maske, 'Lang', FELDER);
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Beat Beispiel');
      await expect(maske.locator('.db-form-back')).toHaveCount(1);

      // AK1: Der Link auf die andere Maske derselben Tabelle zeigt denselben Kunden.
      await linkIn(maske, 'Kunden Kurz').click();
      await erwarteQuelle(maske, 'Kunden Kurz.md');
      await erwarteKoerper(maske, 'Kurz', ['Name']);
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Beat Beispiel');

      // AK3: «Zurück» führt Schritt für Schritt zurück, samt Maske.
      await maske.locator('.db-form-back').click();
      await erwarteQuelle(maske, 'Kunden Form.md');
      await maske.locator('.db-form-back').click();
      await erwarteQuelle(maske, 'Bestellungen Form.md');
      await expect(maske.locator('.db-form-back')).toHaveCount(0);

      // AK3: Bei ungespeicherter Bearbeitung fragt die Maske vor «Zurück» und vor
      // einem Link nach; «Weiter bearbeiten» bleibt in der Bearbeitung.
      await feldIn(maske, 'Kunde').locator('.db-form-ref-link').click();
      await erwarteQuelle(maske, 'Kunden Form.md');
      await maske.locator('.db-form-edit').click();
      const name = feldIn(maske, 'Name').locator('.db-form-input');
      await expect(name).toBeVisible({ timeout: 20000 });
      await name.fill('Beat Geändert');
      await maske.locator('.db-form-back').click();
      await expect(maske.locator('.db-form-confirm')).toBeVisible();
      await maske.locator('.db-form-confirm-back').click();
      await expect(maske.locator('.db-form-confirm')).toHaveCount(0);
      await expect(name).toHaveValue('Beat Geändert');
      await erwarteQuelle(maske, 'Kunden Form.md');
      await linkIn(maske, 'Kunden Kurz').click();
      await expect(maske.locator('.db-form-confirm')).toBeVisible();
      await maske.locator('.db-form-confirm-discard').click();
      await erwarteQuelle(maske, 'Kunden Kurz.md');
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Beat Beispiel');
      expect(fs.readFileSync(tabelle, 'utf8')).not.toContain('Beat Geändert');

      // AK5: Ein Link auf ein gewöhnliches Dokument öffnet dieses Dokument.
      await linkIn(maske, 'Notiz').click();
      await expect(page.locator(`${SEL.tabs0}.active .tab-title`)).toContainText('Notiz', {
        timeout: 20000,
      });
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-MAS-15: «Verwendet von» reiht sich in den Verlauf ein (4T-002335)', () => {
  test('Sprung aus «Verwendet von» zur verweisenden Bestellung und «Zurück»', async () => {
    const { wurzel, tabelle } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.databaseDatensaetze({ tabelle: 'Kunden' })))
              .status,
          { timeout: 20000 },
        )
        .toBe('ready');
      const maske = page.locator(MASKE);

      // Aufbau: Beat Beispiel in der Standard-Maske seiner Tabelle.
      await expect(async () => {
        await oeffneMaskeFuer(page, tabelle, 'r-00002');
        await expect(maske.locator('.db-form-source')).toContainText('Kunden Form.md', {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      await expect(maske.locator('.db-form-back')).toHaveCount(0);

      // AK1: Der Sprung zur verweisenden Bestellung reiht sich in den Verlauf ein.
      await maske.locator('.db-form-usage-action').click();
      const eintrag = maske.locator(
        'tr.db-form-usage-entry[data-table="Bestellungen"] .db-form-usage-open',
      );
      await expect(eintrag).toBeVisible({ timeout: 20000 });
      await eintrag.click();
      await erwarteQuelle(maske, 'Bestellungen Form.md');
      await expect(maske.locator('.db-form-back')).toHaveCount(1);

      // «Zurück» führt zum Kunden, von dem der Sprung ausging.
      await maske.locator('.db-form-back').click();
      await erwarteQuelle(maske, 'Kunden Form.md');
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Beat Beispiel');
      await expect(maske.locator('.db-form-back')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});

test.describe('DB-MAS-16: Datensatz-Verweis im Masken-Körper reiht sich in den Verlauf ein (4T-002335)', () => {
  test('Datensatz-Verweis im Körper öffnet die Maske des Kunden, «Zurück» die Bestellung', async () => {
    const { wurzel, tabelle, bestellungen } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.api.databaseDatensaetze({ tabelle: 'Kunden' })))
              .status,
          { timeout: 20000 },
        )
        .toBe('ready');
      const maske = page.locator(MASKE);

      // Aufbau: die Bestellung in ihrer Masken-Datei, sobald der Index sie kennt.
      await expect(async () => {
        await oeffneMaskeFuer(page, bestellungen, KENNUNG);
        await expect(maske.locator('.db-form-source')).toContainText('Bestellungen Form.md', {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      await expect(maske.locator('.db-form-back')).toHaveCount(0);

      // Der Datensatz-Verweis im Körper: Tabellen-Datei mit dem Block-Anker.
      const verweis = maske.locator('.db-form-body a.wikilink[href^="Kunden.md#"]');
      await expect(verweis).toHaveCount(1);
      await expect(verweis).toHaveAttribute('href', 'Kunden.md#r-00002');
      await verweis.click();
      await erwarteQuelle(maske, 'Kunden Form.md');
      await expect(feldIn(maske, 'Name').locator('.db-form-value')).toHaveText('Beat Beispiel');
      await expect(maske.locator('.db-form-back')).toHaveCount(1);

      // «Zurück» führt zur Bestellung, von der der Sprung ausging.
      await maske.locator('.db-form-back').click();
      await erwarteQuelle(maske, 'Bestellungen Form.md');
      await expect(maske.locator('.db-form-back')).toHaveCount(0);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
