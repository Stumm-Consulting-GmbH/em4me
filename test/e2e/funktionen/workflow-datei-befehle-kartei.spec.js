// 4T-002691 (Epic 3E-000415, Story 4S-001215, Tc Option (a)): E2E-Funktions-
// Suite — die Datei-Befehle der Workflows auf einer Karteikarte an der
// gestarteten Anwendung (AK3 des Tasks).
//
// WF-KARTE-01: Ein von Hand gestarteter Workflow kopiert die Karteikarte
//   «Umberto Eco» der Beispiel-Tabelle «Authors» in den Ordner ihrer Tabelle.
//   Die Kopie ist eine Karteikarte mit eigener Kennung und dem Namen der Kopie
//   als Schlüssel, und ihr Anlege-Beleg steht in ihrer Beleg-Datei. Ein zweiter
//   Workflow, der die Kopie in einen anderen Ordner verschieben will, hält mit
//   dem Code `dbCardLeavesTable` an, und die Kopie bleibt im Ordner «Authors».
//
// **Warum es diesen Fall geben muss, obwohl die Unit-Fälle grün sind.** Die
// Kette reicht über beide Prozesse: Knopf «Starten» über dem Block, Lauf im
// Fenster, Schritt-Kanal `workflow:step`, das Datei-Modul mit der Weiche aus
// der Verdrahtung (`karteiWeichen` über die Abhängigkeiten des Kanals) und die
// eine Schreib-Schnittstelle des Prozesses mit Prüf-Naht und Rechten. Die
// Unit-Fälle bauen die Weiche selbst; erst hier zeigt sich, dass die
// Verdrahtung sie dem Schritt-Modul reicht.
//
// **Der Aufbau ist nicht der Gegenstand** (test/README.md): Der Demo-Bereich
// entsteht über die Preload-Brücke in einem leeren Ordner (Muster
// `datenbank-kartei-schreibwege.spec.js`); sein Workflow-Ordner ist
// «Workflows». **Sprachfrei geprüft:** an den Dateien und am Lauf-Stand der
// Begleitdateien.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, oeffneDokumentImFenster } = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const { belegeDesDatensatzes } = require('../../../src/main/database/change-log.js');
const { ART_DELETE } = require('../../../src/shared/database/change-record.js');

const PANE = '.pane-group[data-pane="0"]';

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
  }
}

function workflowText(name, zeilen) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');
}

function laufStand(begleitdatei) {
  try {
    const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
    return parsed.ok ? mddStore.getWorkflowRun(parsed.container) : null;
  } catch {
    return null;
  }
}

// Warten, bis die Datenbank des gebundenen Bereichs bereit ist und der Katalog
// «Authors» führt (Muster `datenbank-kartei-schreibwege.spec.js`); vorher
// weist die Schreib-Schnittstelle einen Auftrag ab.
async function datenbankBereit(page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const u = await window.api.databaseOverview({});
          const authors = (u.tabellen || []).some((t) => t.name === 'Authors');
          return u.status === 'ready' && authors;
        }),
      { timeout: 60000 },
    )
    .toBe(true);
}

// Den Workflow im Fenster öffnen und über «Starten» über dem Block laufen lassen.
async function starte(app, page, datei) {
  await oeffneDokumentImFenster(app, page, datei);
  await page.locator(SEL.viewBtn('live')).click();
  const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
  await expect(kopf).toHaveCount(1);
  await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveCount(1);
  await kopf.locator('.cm-wf-starten').click();
}

test.describe('WF-KARTE: Datei-Befehle auf Karteikarten (4T-002691)', () => {
  test('WF-KARTE-01: copy einer Karteikarte ergibt eine Karte mit neuer Kennung, move aus dem Ordner hält an', async () => {
    test.setTimeout(150000);
    const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-karte-'));
    const { app, page, userData } = await launchApp();
    try {
      const ergebnis = await page.evaluate((p) => window.api.createDemoAreaAt(p), ziel);
      expect(ergebnis.ok).toBe(true);
      await expect.poll(() => page.title()).toContain('(Bereich');
      await datenbankBereit(page);

      const kopie = path.join(ziel, 'Authors', 'Umberto Eco 2.md');
      const kopierProbe = path.join(ziel, 'Workflows', 'Karten-Probe.md');
      fs.writeFileSync(
        kopierProbe,
        workflowText('Karten-Probe', ['copy "Authors/Umberto Eco.md" "Authors/Umberto Eco 2.md"']),
        'utf8',
      );
      await starte(app, page, kopierProbe);
      const kopierStand = path.join(ziel, 'Workflows', 'Karten-Probe.mdd');
      await expect
        .poll(() => (laufStand(kopierStand) || {}).lastRun || null, { timeout: 30000 })
        .toMatchObject({ status: 'ok' });
      const text = fs.readFileSync(kopie, 'utf8');
      // Die Vorlage trägt r-00003, der Hochwasserstand der Tabelle steht auf 3.
      expect(text).toMatch(/^db-record: r-00004$/m);
      expect(text).toMatch(/^name: Umberto Eco 2$/m);
      expect(fs.readFileSync(path.join(ziel, 'Authors', 'Umberto Eco.md'), 'utf8')).toMatch(
        /^db-record: r-00003$/m,
      );
      expect(fs.existsSync(path.join(ziel, 'Authors', 'Umberto Eco 2.mddl'))).toBe(true);

      const schiebeProbe = path.join(ziel, 'Workflows', 'Schiebe-Probe.md');
      fs.writeFileSync(
        schiebeProbe,
        workflowText('Schiebe-Probe', ['move "Authors/Umberto Eco 2.md" "Archiv"']),
        'utf8',
      );
      await starte(app, page, schiebeProbe);
      const schiebeStand = path.join(ziel, 'Workflows', 'Schiebe-Probe.mdd');
      await expect
        .poll(() => (laufStand(schiebeStand) || {}).lastRun || null, { timeout: 30000 })
        .toMatchObject({ status: 'failed', code: 'dbCardLeavesTable' });
      expect(fs.existsSync(kopie)).toBe(true);
      expect(fs.existsSync(path.join(ziel, 'Archiv', 'Umberto Eco 2.md'))).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(ziel);
    }
  });
});

// 4T-002694 (Epic 3E-000415, Punkt E1 des Abschluss-Anteils):
// WF-KARTE-02: `rename` einer Karteikarte auf einen Namen ohne Markdown-Endung
//   hält mit `dbCardRenamedAway` an, die Karte bleibt unter ihrem Namen.
//   `delete` derselben Karte, von Hand gestartet und im Dialog bestätigt, geht
//   über die Datenbank: Der Lösch-Beleg steht in der Beleg-Datei der Tabelle,
//   und die Karte geht den Papierkorb-Weg.
//
// **Eigener kleiner Bereich statt Demo-Bereich:** eine Kartei-Tabelle ohne
// Verweise auf ihre Karten, damit der Lösch-Schutz nicht greift (Aufbau wie
// `workflow-datenbank-regeln.spec.js`). **Der Papierkorb ist eine Attrappe**
// im Hauptprozess wie in WF-PFLEGE-01 (`shell.trashItem` ersetzt); sie schreibt
// die Pfade mit und lässt die Dateien liegen, gemessen wird deshalb am
// mitgeschriebenen Pfad und am Beleg, nicht am Verschwinden der Datei.
const DIALOG = '#link-preview-modal';
const JA = '#btn-link-preview-continue';

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

function baueKarteiBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-karte-'));
  fs.writeFileSync(
    path.join(wurzel, 'Area_Settings.mdda'),
    JSON.stringify({ schemaVersion: 1, settings: { workflows: { folder: 'Workflows' } } }, null, 2),
    'utf8',
  );
  fs.mkdirSync(path.join(wurzel, 'Authors'));
  fs.mkdirSync(path.join(wurzel, 'Workflows'));
  fs.writeFileSync(path.join(wurzel, 'Authors', 'Authors.md'), AUTHORS, 'utf8');
  fs.writeFileSync(path.join(wurzel, 'Authors', 'Umberto Eco.md'), ECO, 'utf8');
  fs.writeFileSync(
    path.join(wurzel, 'Workflows', 'Umbenenn-Probe.md'),
    workflowText('Umbenenn-Probe', ['rename "Authors/Umberto Eco.md" "Umberto Eco.txt"']),
    'utf8',
  );
  fs.writeFileSync(
    path.join(wurzel, 'Workflows', 'Loesch-Probe.md'),
    workflowText('Loesch-Probe', ['delete "Authors/Umberto Eco.md"']),
    'utf8',
  );
  return wurzel;
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

// Ersetzt den Papierkorb im Hauptprozess durch eine mitschreibende Attrappe
// (Muster `papierkorbAttrappe` in workflow-pflege.spec.js).
async function papierkorbAttrappe(app) {
  await hauptSenden(app, ({ shell }) => {
    globalThis.__wfPapierkorb = [];
    const attrappe = async (p) => {
      globalThis.__wfPapierkorb.push(p);
    };
    attrappe.__wfAttrappe = true;
    shell.trashItem = attrappe;
  });
  await expect
    .poll(() => hauptLesen(app, ({ shell }) => shell.trashItem.__wfAttrappe === true))
    .toBe(true);
}

const imPapierkorb = (app) => hauptLesen(app, () => globalThis.__wfPapierkorb || []);

test.describe('WF-KARTE-02: rename mit Endungswechsel und delete einer Karteikarte (4T-002694)', () => {
  test('rename auf .txt hält an; delete nach Bestätigung schreibt den Lösch-Beleg der Tabelle', async () => {
    test.setTimeout(150000);
    const wurzel = baueKarteiBereich();
    const karte = path.join(wurzel, 'Authors', 'Umberto Eco.md');
    const tabelle = path.join(wurzel, 'Authors', 'Authors.md');
    const { app, page, userData } = await launchApp();
    try {
      await papierkorbAttrappe(app);
      await bindeBereich(page, wurzel);
      await datenbankBereit(page);

      await starte(app, page, path.join(wurzel, 'Workflows', 'Umbenenn-Probe.md'));
      await expect
        .poll(
          () =>
            (laufStand(path.join(wurzel, 'Workflows', 'Umbenenn-Probe.mdd')) || {}).lastRun || null,
          { timeout: 30000 },
        )
        .toMatchObject({ status: 'failed', code: 'dbCardRenamedAway' });
      expect(fs.readFileSync(karte, 'utf8')).toBe(ECO);
      expect(fs.existsSync(path.join(wurzel, 'Authors', 'Umberto Eco.txt'))).toBe(false);

      // `delete` bleibt «Nur von Hand» mit seiner Bestätigung.
      await starte(app, page, path.join(wurzel, 'Workflows', 'Loesch-Probe.md'));
      await expect(page.locator(DIALOG)).toBeVisible();
      await page.locator(JA).click();
      await expect
        .poll(
          () =>
            (laufStand(path.join(wurzel, 'Workflows', 'Loesch-Probe.mdd')) || {}).lastRun || null,
          { timeout: 30000 },
        )
        .toMatchObject({ status: 'ok' });
      // Der Weg über die Datenbank: Lösch-Beleg an der Tabelle, Karte zum Papierkorb.
      const kette = await belegeDesDatensatzes(tabelle, 'r-00001');
      expect(kette.ok).toBe(true);
      expect(kette.belege.map((b) => b.art)).toContain(ART_DELETE);
      await expect.poll(() => imPapierkorb(app)).toContain(karte);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(wurzel);
    }
  });
});
