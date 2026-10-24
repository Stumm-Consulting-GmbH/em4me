// 4T-002186 (Epic 3E-000261, E7.8, Entscheidung F5 Option A und Entscheidung
// des Product Owners vom 2026-10-10): Bedingte Bereiche und der Wert im Satz
// in der realen Anordnung — DB-MAS-10.
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Drei
// Zusagen hängen an Teilen, die nur die laufende Anwendung zusammenbringt:
//
//   1. Der Wert im Satz reist als Marke durch die echte Darstellungs-Strecke
//      des Haupt-Prozesses; ob der Markdown-Renderer sie unverändert als Text
//      durchreicht, zeigt allein der echte Renderer.
//   2. Verborgen wird über das Attribut `hidden` und die Regel der
//      Stil-Datei; ob ein Bereich für den Anwender wirklich verschwindet,
//      zeigt erst die gezeichnete Seite.
//   3. Ein Feld in einem verborgenen Bereich bleibt im Speicher-Auftrag (AK3),
//      und eine Abweisung an ihm steht im Kopf (S6). Beides läuft über die
//      Schreib-Schnittstelle und die Prüfregel der Tabellen-Datei.
//
// **Eigene Datei statt einer weiteren Folge in `datenbank-maske.spec.js`**:
// Jene steht nahe an ihrem Zeilen-Budget (Muster DB-MAS-09 in
// `datenbank-maske-navigation.spec.js`). Aufbau und Gerüst folgen ihr Zeichen
// für Zeichen (Bereich mit «Kunden», Öffnen der Maske über das
// Seiten-Ereignis als Aufbau, sprachfreie Prüfung gegen die fünf
// Sprachfassungen); geprüft wird allein, was der Anwender in der Maske sieht
// und tut.
'use strict';

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

// Die Masken-Datei: ein Wert im Satz, ein Bereich «aktiv» mit dem Feld «Menge»
// und einem inneren Bereich, ein Bereich mit ungültiger Bedingung und ein
// überzähliges «end». Die Zeilen zählen ab dem Anfang der Datei, wie der
// Hinweis sie nennt.
const MASKE_MIT_BEREICHEN = [
  '---',
  'db-form:',
  '  table: Kunden',
  '---',
  '',
  '# Kunden',
  '',
  '**Name:** {{field:Name}}',
  '',
  'Doppelt: {{value:menge * 2}} Stück',
  '',
  '**Aktiv:** {{field:Aktiv}}',
  '',
  '{{when:aktiv}}',
  '## Nur wenn aktiv',
  '',
  '**Menge:** {{field:Menge}}',
  '',
  '{{when:menge > 5}}',
  'Viel.',
  '{{end}}',
  '{{end}}',
  '',
  '{{when:menge +}}',
  'Nie sichtbar.',
  '{{end}}',
  '',
  '{{end}}',
  '',
];

// Der Bereich von DB-MAS-02: «Kunden» mit Pflicht-Feld «Name» und der
// Prüfregel «value > 0» an «Menge», dazu die Masken-Datei.
function baueBereich() {
  const wurzel = tmpDir('em4me-maske-bereiche-');
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
    "      check: 'value > 0'",
    '    - name: Aktiv',
    '      type: boolean',
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
  datei('Kunden Form.md', MASKE_MIT_BEREICHEN);
  return { wurzel, tabelle: path.join(wurzel, 'Kunden.md') };
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

function bereichIn(maske, bedingung) {
  return maske.locator(`.db-form-body .db-form-section[data-form-when="${bedingung}"]`);
}

// Die Zellen eines Datensatzes in der Tabellen-Datei, ohne das führende «|».
function zellenVon(text, kennung) {
  const zeilen = text.split('\n');
  const anfang = zeilen.indexOf(`|- id="${kennung}"`);
  const zellen = [];
  for (const zeile of zeilen.slice(anfang + 1)) {
    if (zeile.startsWith('|-') || zeile.startsWith('```')) break;
    zellen.push(zeile.replace(/^\|\s?/, '').trim());
  }
  return zellen;
}

test.describe('DB-MAS-10: Bedingte Bereiche und Wert im Satz (4T-002186)', () => {
  test('Bereiche folgen der Eingabe, verborgene Felder behalten ihren Wert, Abweisung im Kopf', async () => {
    const { wurzel, tabelle } = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, wurzel);
      await oeffneTabelle(app, page, tabelle);
      await expect(page.locator(`${BLOCK_LESE} table.prc-table`)).toBeVisible({ timeout: 20000 });

      // Die Maske zeigt den Körper der Datei, sobald der Katalog sie kennt.
      const maske = page.locator(MASKE);
      await expect(async () => {
        await oeffneMaskeFuer(page, tabelle, KENNUNG);
        await expect(maske.locator('.db-form-source')).toHaveCount(1, { timeout: 1000 });
      }).toPass({ timeout: 20000 });

      // S5: Die ungültige Bedingung und das «end» ohne Bereich stehen mit ihrer
      // Zeile im Kopf.
      const zeileUngueltig = MASKE_MIT_BEREICHEN.indexOf('{{when:menge +}}') + 1;
      const zeileEnde = MASKE_MIT_BEREICHEN.lastIndexOf('{{end}}') + 1;
      const ungueltig = maske.locator('.db-form-hint[data-form-code="formBedingungUngueltig"]');
      await expect(ungueltig).toHaveCount(1);
      expect(
        saetze('database.hint.formBedingungUngueltig', {
          zeile: String(zeileUngueltig),
          name: 'menge +',
        }),
      ).toContain(await ungueltig.textContent());
      const ende = maske.locator('.db-form-hint[data-form-code="formEndOhneWhen"]');
      await expect(ende).toHaveCount(1);
      expect(saetze('database.hint.formEndOhneWhen', { zeile: String(zeileEnde) })).toContain(
        await ende.textContent(),
      );

      // AK1 (Lesen): Am gespeicherten Stand (Aktiv, Menge 12) sind der Bereich
      // «aktiv» und sein innerer Bereich sichtbar, der Bereich mit ungültiger
      // Bedingung bleibt verborgen.
      const aussen = bereichIn(maske, 'aktiv');
      const innen = aussen.locator('.db-form-section[data-form-when="menge > 5"]');
      const nie = bereichIn(maske, 'menge +');
      await expect(aussen).toBeVisible();
      await expect(innen).toBeVisible();
      await expect(innen).toContainText('Viel.');
      await expect(nie).toHaveCount(1);
      await expect(nie).toBeHidden();
      await expect(aussen.locator('.db-form-field[data-field="Menge"]')).toHaveCount(1);

      // Wert im Satz: Der Wert steht im Absatz zwischen seinen Wörtern.
      const satz = maske.locator('.db-form-body .db-form-md p', { hasText: 'Doppelt:' });
      await expect(satz).toHaveCount(1);
      await expect(satz).toHaveText('Doppelt: 24 Stück');
      const wert = satz.locator('span.db-form-computed.db-form-computed-inline');
      await expect(wert).toHaveCount(1);
      await expect(wert).toHaveText('24');

      // AK2 (Bearbeiten): Die Bereiche folgen der Eingabe ohne Speichern.
      await maske.locator('.db-form-edit').click();
      await expect(maske.locator('.db-form-input')).toHaveCount(3);
      const menge = feldIn(maske, 'Menge').locator('.db-form-input');
      const aktiv = feldIn(maske, 'Aktiv').locator('.db-form-input');
      await expect(aktiv).toHaveAttribute('type', 'checkbox');
      await menge.fill('3');
      await expect(innen).toBeHidden();
      await expect(aussen).toBeVisible();
      await expect(wert).toHaveText('6');
      await expect(menge).toBeFocused();
      await aktiv.uncheck();
      await expect(aussen).toBeHidden();
      // Das verborgene Feld behält seine Eingabe im Entwurf.
      await expect(menge).toHaveValue('3');

      // AK3: Speichern schreibt auch den Wert des verborgenen Feldes.
      await maske.locator('.db-form-save').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect
        .poll(() => zellenVon(fs.readFileSync(tabelle, 'utf8'), KENNUNG))
        .toEqual(['Anna Muster', '3', '']);
      await expect(aussen).toBeHidden();
      await expect(wert).toHaveText('6');
      const gespeichert = fs.readFileSync(tabelle, 'utf8');

      // S6: Eine Abweisung an einem Feld im verborgenen Bereich steht im Kopf und
      // nennt das Feld; der Bereich bleibt verborgen, nichts wird geschrieben.
      await maske.locator('.db-form-edit').click();
      await expect(maske.locator('.db-form-input')).toHaveCount(3);
      await aktiv.check();
      await expect(aussen).toBeVisible();
      await menge.fill('-1');
      await aktiv.uncheck();
      await expect(aussen).toBeHidden();
      await maske.locator('.db-form-save').click();
      const kopf = maske.locator('.db-form-errors .db-form-error');
      await expect(kopf).toHaveCount(1, { timeout: 20000 });
      const meldung = await kopf.textContent();
      const praefixe = saetze('database.form.hiddenFieldRejected', { feld: 'Menge' }).map(
        (text) => text.split('{text}')[0],
      );
      expect(praefixe.some((praefix) => meldung.startsWith(praefix))).toBe(true);
      expect(meldung).toContain('Menge');
      expect(meldung).toContain('value > 0');
      await expect(aussen).toBeHidden();
      await expect(feldIn(maske, 'Menge')).not.toHaveClass(/db-form-marked/);
      await expect(maske.locator('.db-form-input')).toHaveCount(3);
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(gespeichert);

      // Verwerfen kehrt zum gespeicherten Stand zurück.
      await maske.locator('.db-form-discard').click();
      await expect(maske.locator('input, textarea')).toHaveCount(0, { timeout: 20000 });
      await expect(aussen).toBeHidden();
      expect(fs.readFileSync(tabelle, 'utf8')).toBe(gespeichert);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
