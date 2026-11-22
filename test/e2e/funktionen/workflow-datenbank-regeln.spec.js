// 4T-002690 (Epic 3E-000415, Story 4S-001215): E2E-Funktions-Suite — die Regeln
// der Datenbank an den Text-Befehlen eines von Hand gestarteten Workflows (AK2,
// AK3 des Tasks).
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht über beide Prozesse: Knopf «Starten» über dem Block, Lauf im
// Fenster, Schritt-Kanal `workflow:step`, Weiche zum Editor-Puffer, das Urteil
// der Datenbank im Hauptprozess mit dem Tor der Erweiterung und der Weiche des
// Bereichs-Panels aus der Verdrahtung, und beim geöffneten Dokument das Lesen
// des Puffers aus dem Fenster und die Erwartung beim Anwenden. Die Unit-Fälle
// stellen je einen Nachbarn als Attrappe; erst hier läuft die Kette am Stück.
//
// WF-DB-REGEL-01 (Platten-Weg): `replace` einer Datensatz-Zeile und `append` in
//   einen Datensatz-Block, der am Datei-Ende nicht geschlossen ist, halten an,
//   und die Tabellen-Dateien bleiben byte-gleich; `set-property` auf das Feld
//   «born» der Karteikarte «Umberto Eco» hält an; `append` einer Notiz an
//   dieselbe Karteikarte läuft durch.
//   Die Seite «Workflow-Läufe» nennt den Grund mit dem Satz der laufenden Sprache.
// WF-DB-REGEL-02 (eigenes Fenster): «Library.md» ist im selben Fenster geöffnet
//   und trägt zwei ungespeicherte Eingaben, eine Zeile «Entwurf-Probe» im freien
//   Text und den Zusatz «Block-Probe» an einer Zelle des Datensatz-Blocks. Beide
//   Texte stehen NUR im Puffer. Deshalb ist der Weg unterscheidbar (Zweitblick,
//   Runde 1, Befund 2): `replace` auf «Block-Probe» endet über den Puffer mit dem
//   Halt der Datensätze, über die Platte aber mit «Text nicht gefunden»;
//   `replace` auf «Entwurf-Probe» gelingt nur über den Puffer und wird im Editor
//   sichtbar, über die Platte endete es ebenfalls mit «Text nicht gefunden». Die
//   Platte bleibt in beiden Läufen byte-gleich. Diese Form ist am gebauten
//   Programm eindeutig, weil sie am Code des Laufs und am sichtbaren Editor-Text
//   abzulesen ist, ohne Zeitbezug.
//
// **Geprüft** am Code des Fehlschlags im Lauf-Stand der Begleitdatei, am Inhalt
// der Dateien und des Editors und am Satz der Seite «Workflow-Läufe». Der Satz
// wird nicht fest eingetippt, sondern aus dem Sprach-Fragment der laufenden
// Sprache gebildet (`lang` des Dokuments), mit eingesetzten Angaben.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');
const mddStore = require('../../../src/main/documents/mdd-store.js');

const PANE = '.pane-group[data-pane="0"]';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht kippen */
  }
}

const LIBRARY = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: title',
  '    - name: pages',
  '      type: number',
  '  display: title',
  '  lastId: 1',
  '---',
  '',
  'Freier Text der Tabelle.',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Solaris',
  '| 224',
  '```',
  '',
].join('\n');

// Von Hand geschrieben: Der Block läuft bis zum Datei-Ende, ohne Zaun.
const OFFEN = LIBRARY.replace('```\n', '');

const AUTHORS = [
  '---',
  'db-table:',
  '  storage: cards',
  '  fields:',
  '    - name: name',
  '    - name: born',
  '  key: name',
  '  lastId: 1',
  '---',
  '',
  'Autoren, je Autor eine Karteikarte.',
  '',
].join('\n');

const ECO = [
  '---',
  'db-record: r-00001',
  'name: Umberto Eco',
  'born: 1932-01-05',
  '---',
  '',
  'Ein Autor.',
  '',
].join('\n');

function workflowText(name, zeile, anhang = []) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    '---',
    '',
    '```workflow',
    zeile,
    '```',
    '',
    ...anhang,
  ].join('\n');
}

// Der Satz eines Fehlschlag-Codes in der laufenden Sprache, mit Angaben.
async function satz(page, code, werte) {
  const lang = (await page.evaluate(() => document.documentElement.lang)) || 'de';
  const sprache = lang.slice(0, 2).toLowerCase();
  const fragment = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'src', 'i18n', 'fragments', sprache, 'workflows.json'),
      'utf8',
    ),
  );
  const vorlage = fragment[`workflow.fehlschlag.${code}`];
  expect(typeof vorlage).toBe('string');
  return vorlage.replace(/\{(\w+)\}/g, (_, k) => (k in werte ? werte[k] : `{${k}}`));
}

// Öffnet die Seite «Workflow-Läufe» und liefert das Ergebnis-Feld eines Workflows.
async function ergebnisAufDerSeite(page, name) {
  const seite = page.locator(`${PANE} .pane-system .wf-runs-page`);
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'workflow-runs' } }),
    ),
  );
  await expect(seite).toBeVisible();
  const aktualisieren = seite.locator('.wf-runs-refresh');
  const zeile = seite.locator('tr', { has: page.locator('.wf-runs-name', { hasText: name }) });
  await expect
    .poll(
      async () => {
        if (await aktualisieren.isEnabled()) await aktualisieren.click();
        return zeile.locator('.wf-runs-result[data-status="failed"]').count();
      },
      { timeout: 20000 },
    )
    .toBe(1);
  return zeile.locator('.wf-runs-result');
}

const WORKFLOWS = {
  'Datensatz-Probe': workflowText(
    'Datensatz-Probe',
    'replace "Daten/Library.md" "Solaris" "Solaris X"',
  ),
  'Block-Probe': workflowText('Block-Probe', 'append "Daten/Offen.md" from-section "Neu"', [
    '## Neu',
    '',
    'Nachsatz-Probe',
    '',
  ]),
  'Feld-Probe': workflowText(
    'Feld-Probe',
    'set-property "Authors/Umberto Eco.md" born "1932-01-06"',
  ),
  'Block-Puffer-Probe': workflowText(
    'Block-Puffer-Probe',
    'replace "Daten/Library.md" "Block-Probe" "Block-Ersatz"',
  ),
  'Entwurf-Probe': workflowText(
    'Entwurf-Probe',
    'replace "Daten/Library.md" "Entwurf-Probe" "Entwurf-Ersatz"',
  ),
  'Notiz-Probe': workflowText(
    'Notiz-Probe',
    'append "Authors/Umberto Eco.md" from-section "Notiz"',
    ['## Notiz', '', 'Probe-Notiz', ''],
  ),
};

function baueBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbregeln-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  const lege = (rel, text) => {
    const pfad = path.join(wurzel, ...rel.split('/'));
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    fs.writeFileSync(pfad, text, 'utf8');
    return pfad;
  };
  for (const [name, text] of Object.entries(WORKFLOWS)) lege(`Workflows/${name}.md`, text);
  return {
    wurzel,
    library: lege('Daten/Library.md', LIBRARY),
    offen: lege('Daten/Offen.md', OFFEN),
    authors: lege('Authors/Authors.md', AUTHORS),
    eco: lege('Authors/Umberto Eco.md', ECO),
    workflow: (name) => path.join(wurzel, 'Workflows', `${name}.md`),
    stand: (name) => path.join(wurzel, 'Workflows', `${name}.mdd`),
  };
}

function laufStand(begleitdatei) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
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

// Öffnet den Workflow, startet ihn über die Kopfzeile und wartet auf seinen
// `anzahl`-ten Lauf; liefert den letzten Lauf.
async function starte(app, page, b, name, anzahl = 1) {
  await oeffneDokumentImFenster(app, page, b.workflow(name));
  await page.locator(SEL.viewBtn('live')).click();
  const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
  await expect(kopf).toHaveCount(1);
  await expect(kopf.locator('.cm-wf-starten')).toBeEnabled();
  await kopf.locator('.cm-wf-starten').click();
  await expect
    .poll(() => (laufStand(b.stand(name)) || {}).runs || 0, { timeout: 30000 })
    .toBe(anzahl);
  return laufStand(b.stand(name)).lastRun;
}

const lies = (pfad) => fs.readFileSync(pfad, 'utf8');

test.describe('WF-DB-REGEL: Regeln der Datenbank an den Text-Befehlen (4T-002690)', () => {
  test('WF-DB-REGEL-01: Halt an Datensatz-Zeile, Datensatz-Block und Feld; Notiz läuft durch', async () => {
    test.setTimeout(150000);
    const b = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, b.wurzel);

      expect(await starte(app, page, b, 'Datensatz-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbRecordsByText',
      });
      expect(lies(b.library)).toBe(LIBRARY);

      expect(await starte(app, page, b, 'Block-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbRecordsByText',
      });
      expect(lies(b.offen)).toBe(OFFEN);

      expect(await starte(app, page, b, 'Feld-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbFieldByText',
      });
      expect(lies(b.eco)).toBe(ECO);

      expect(await starte(app, page, b, 'Notiz-Probe')).toMatchObject({ status: 'ok' });
      const karte = lies(b.eco);
      expect(karte).toMatch(/Ein Autor\.\n\n?Probe-Notiz\n?$/);
      expect(karte).toContain('born: 1932-01-05');

      // Die Seite «Workflow-Läufe» nennt den Grund in der laufenden Sprache.
      await expect(await ergebnisAufDerSeite(page, 'Datensatz-Probe')).toContainText(
        await satz(page, 'dbRecordsByText', { table: 'Library', command: 'replace' }),
      );
      await expect(await ergebnisAufDerSeite(page, 'Feld-Probe')).toContainText(
        await satz(page, 'dbFieldByText', { field: 'born', command: 'set-property' }),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });

  test('WF-DB-REGEL-02: Urteil am Puffer bei geöffnetem, ungespeichertem Dokument im selben Fenster', async () => {
    test.setTimeout(120000);
    const b = baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await bindeBereich(page, b.wurzel);
      // «Library.md» im Quelltext, Änderungsmodus; zwei Eingaben nur im Puffer.
      await oeffneDokumentImFenster(app, page, b.library);
      await page.locator(SEL.viewBtn('source')).click();
      await page.locator(SEL.btnEdit).click();
      await expect(page.locator(SEL.btnEdit)).toHaveClass(/active/);
      const zeile = (text) => page.locator(`${SEL.paneSource0} .cm-line`, { hasText: text });
      await zeile('Freier Text der Tabelle.').click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Entwurf-Probe');
      await zeile('| 224').click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Block-Probe');
      await expect(zeile('Entwurf-Probe')).toHaveCount(1);
      await expect(zeile('| 224 Block-Probe')).toHaveCount(1);
      expect(lies(b.library)).toBe(LIBRARY);

      // Halt am Text, der nur im Puffer im Datensatz-Block steht; über die
      // Platte endete derselbe Schritt mit textNotFound.
      expect(await starte(app, page, b, 'Block-Puffer-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbRecordsByText',
      });
      expect(lies(b.library)).toBe(LIBRARY);

      // Freier Text, der nur im Puffer steht: gelingt, sichtbar im Editor.
      expect(await starte(app, page, b, 'Entwurf-Probe')).toMatchObject({ status: 'ok' });
      expect(lies(b.library)).toBe(LIBRARY);

      // Zurück zu «Library.md»: die Ersetzung im freien Text, der Block unberührt.
      await oeffneDokumentImFenster(app, page, b.library);
      await page.locator(SEL.viewBtn('source')).click();
      const quelle = page.locator(`${SEL.paneSource0} .cm-content`);
      await expect(quelle).toContainText('Entwurf-Ersatz');
      await expect(quelle).toContainText('| 224 Block-Probe');
      await expect(quelle).not.toContainText('Block-Ersatz');
      await expect(quelle).toContainText('| Solaris');

      await expect(await ergebnisAufDerSeite(page, 'Block-Puffer-Probe')).toContainText(
        await satz(page, 'dbRecordsByText', { table: 'Library', command: 'replace' }),
      );
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });
});
