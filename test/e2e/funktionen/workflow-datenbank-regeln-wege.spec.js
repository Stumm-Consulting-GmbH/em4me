// 4T-002694 (Epic 3E-000415, Story 4S-001215, Punkt E1 des Abschluss-Anteils):
// E2E-Funktions-Suite — die Regeln der Datenbank an den Text-Befehlen auf den
// Wegen, die `workflow-datenbank-regeln.spec.js` (WF-DB-REGEL-01 Platte,
// WF-DB-REGEL-02 eigenes Fenster) noch nicht fährt.
//
// WF-DB-REGEL-03 (anderes Fenster): «Library.md» ist in einem ZWEITEN Fenster
//   desselben Bereichs offen und trägt zwei Eingaben nur im Puffer, «Entwurf-
//   Probe» im freien Text und «Block-Probe» an einer Zelle des Datensatz-Blocks.
//   Der Workflow startet im ersten Fenster. `replace` auf «Block-Probe» hält
//   (über die Platte endete er mit «Text nicht gefunden»), der Puffer des
//   zweiten Fensters und die Platte bleiben unverändert; `replace` auf
//   «Entwurf-Probe» gelingt und erscheint im zweiten Fenster, die Platte bleibt
//   byte-gleich. Bezugsgröße dafür, dass der Hauptprozess das zweite Fenster als
//   Halter des Stands kennt, ist die Meldung `index:overlay` dieses Fensters mit
//   beiden Eingaben, mitgeschrieben im Hauptprozess (Muster
//   `regression/4t-0945-b12.spec.js`); ohne sie wäre der Start ein Rennen gegen
//   die Entprellung der Meldung.
// WF-DB-REGEL-04 (geteilte Tabellen-Datei): eine Tabellen-Datei über der
//   Teilungs-Schwelle von 0,7 MB, zerlegt wie beim Speichern von Hand (Muster
//   `test/unit/workflow-geteilte-dokumente.test.js`). `replace` an einer
//   Datensatz-Zeile im späteren Teil hält, alle Teile byte-gleich; `append` von
//   freiem Text läuft durch und steht hinter dem schließenden Zaun am Ende des
//   letzten Teils (Kapitel «Lösung» von 4T-002690: `append` an eine
//   Tabellen-Datei mit geschlossenem Block am Datei-Ende ist frei).
// WF-DB-REGEL-05 (früher Hinweis): Die Prüf-Anzeige über dem Block zeigt bei
//   festem Ziel auf eine Tabellen-Datei und auf eine Karteikarte den Hinweis,
//   grün und damit von einem Befund unterscheidbar, und «Starten» bleibt
//   möglich; der gestartete Lauf hält erst an der Zeile.
// WF-DB-REGEL-06 (Lauf ohne Zuschauer und Aus-Zustand): Ein Zeitplan-Workflow
//   mit festem Ziel auf die Tabellen-Datei lässt sich trotz Hinweis scharf
//   schalten, über den Knopf über dem Block bei sichtbarem Hinweis in der
//   Prüf-Anzeige (nur dieser Weg prüft mit dem Hinweis); zur Fälligkeit hält der Lauf (Herkunft `schedule`) an derselben
//   Zeile, die Seite «Workflow-Läufe» nennt den Grund. Mit ausgeschalteter
//   Erweiterung «Datenbank» läuft derselbe Workflow zum nächsten Termin durch.
//   Die Uhr wird nicht gestellt, sondern der Termin in der Begleitdatei (Muster
//   `workflow-zeitplan.spec.js`).
//
// **Sprachfrei geprüft:** Codes im Lauf-Stand der Begleitdateien, Inhalte der
// Dateien und Editoren; die Sätze der Seite «Workflow-Läufe» und der
// Prüf-Anzeige werden aus dem Sprach-Fragment der laufenden Sprache gebildet.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  oeffneDokumentImFenster,
  warteAufRendererBereit,
} = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const mddStore = require('../../../src/main/documents/mdd-store.js');
const { localNowString } = require('../../../src/shared/reminders.js');
const { planeZerlegung } = require('../../../src/shared/document-split.js');
const { teilungsOptionen } = require('../../../src/main/documents/teilungs-optionen.js');
const {
  writeDocumentParts,
  mddPathFor,
} = require('../../../src/main/documents/document-parts-io.js');

const PANE = '.pane-group[data-pane="0"]';
// Takt des Zeitplan-Prüfers (höchstens 30 Sekunden) samt Lauf.
const TAKT_ZEIT = { timeout: 75000 };

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufräumen darf den Lauf nicht kippen */
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

// Eine Tabellen-Datei mit `anzahl` Datensätzen zu rund 1 KB (Muster
// `tabelle` in test/unit/workflow-geteilte-dokumente.test.js).
function grosseTabelle(anzahl) {
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: name', '    - name: text', '---'];
  zeilen.push('', '```perspective-records');
  for (let i = 1; i <= anzahl; i++) {
    zeilen.push(`|- id="r-${String(i).padStart(5, '0')}"`, `| Name ${i}`, `| ${'x'.repeat(1000)}`);
  }
  zeilen.push('```', '');
  return zeilen.join('\n');
}

function workflowText(name, zeile, { kopf = [], anhang = [] } = {}) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    ...kopf,
    '---',
    '',
    '```workflow',
    zeile,
    '```',
    '',
    ...anhang,
  ].join('\n');
}

// Dokument-Zeile (ab 1) der Befehls-Zeile im Text eines Workflows.
const zeileVon = (text, befehl) => text.split('\n').indexOf(befehl) + 1;

const BEFEHL = {
  block: 'replace "Daten/Library.md" "Block-Probe" "Block-Ersatz"',
  entwurf: 'replace "Daten/Library.md" "Entwurf-Probe" "Entwurf-Ersatz"',
  teilZeile: 'replace "Daten/Gross.md" "Name 790" "Neu 790"',
  teilAnhang: 'append "Daten/Gross.md" from-section "Anhang"',
  feld: 'set-property "Authors/Umberto Eco.md" born "1932-01-06"',
  datensatz: 'replace "Daten/Library.md" "Solaris" "Solaris X"',
};

const WORKFLOWS = {
  'Block-Fenster-Probe': workflowText('Block-Fenster-Probe', BEFEHL.block),
  'Entwurf-Fenster-Probe': workflowText('Entwurf-Fenster-Probe', BEFEHL.entwurf),
  'Teil-Zeile-Probe': workflowText('Teil-Zeile-Probe', BEFEHL.teilZeile),
  'Teil-Anhang-Probe': workflowText('Teil-Anhang-Probe', BEFEHL.teilAnhang, {
    anhang: ['## Anhang', '', 'Nachsatz-Probe', ''],
  }),
  'Feld-Hinweis-Probe': workflowText('Feld-Hinweis-Probe', BEFEHL.feld),
  'Zeitplan-Regel': workflowText('Zeitplan-Regel', BEFEHL.datensatz, {
    kopf: ['trigger: schedule', 'schedule: every day at 23:00'],
  }),
};

async function baueBereich({ geteilt = false } = {}) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-dbwege-'));
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
  const b = {
    wurzel,
    library: lege('Daten/Library.md', LIBRARY),
    authors: lege('Authors/Authors.md', AUTHORS),
    eco: lege('Authors/Umberto Eco.md', ECO),
    gross: path.join(wurzel, 'Daten', 'Gross.md'),
    workflow: (name) => path.join(wurzel, 'Workflows', `${name}.md`),
    stand: (name) => path.join(wurzel, 'Workflows', `${name}.mdd`),
  };
  if (geteilt) {
    // Zerlegt wie das Speichern von Hand (Muster `legeZerlegt` der Unit-Prüfdatei).
    const text = grosseTabelle(800);
    fs.writeFileSync(mddPathFor(b.gross), mddStore.serializeContainer(mddStore.emptyContainer()));
    const teilung = teilungsOptionen(text);
    const plan = planeZerlegung({ text, base: 'Gross', schwelle: teilung.schwelle, ...teilung });
    expect(plan.geteilt).toBe(true);
    expect((await writeDocumentParts(b.gross, plan.teile)).ok).toBe(true);
  }
  return b;
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

// Warten, bis die Datenbank des gebundenen Bereichs bereit ist und alle
// `tabellen` führt (Muster `datenbankBereit` in
// workflow-datei-befehle-kartei.spec.js); vorher fehlen Halt und Hinweis.
async function datenbankBereit(page, tabellen = ['Library', 'Authors']) {
  await expect
    .poll(
      () =>
        page.evaluate(async (namen) => {
          const u = await window.api.databaseOverview({});
          const da = new Set((u.tabellen || []).map((t) => t.name));
          return u.status === 'ready' && namen.every((n) => da.has(n));
        }, tabellen),
      { timeout: 60000 },
    )
    .toBe(true);
}

// Öffnet einen Workflow in der Live-Ansicht und liefert seine Kopfzeile.
async function oeffneWorkflow(app, page, b, name) {
  await oeffneDokumentImFenster(app, page, b.workflow(name));
  await page.locator(SEL.viewBtn('live')).click();
  const kopf = page.locator(`${PANE} .pane-source .cm-wf-kopf`);
  await expect(kopf).toHaveCount(1);
  return kopf;
}

// Startet einen Workflow über die Kopfzeile und wartet auf seinen
// `anzahl`-ten Lauf; liefert den letzten Lauf (Muster WF-DB-REGEL).
async function starte(app, page, b, name, anzahl = 1) {
  const kopf = await oeffneWorkflow(app, page, b, name);
  await expect(kopf.locator('.cm-wf-starten')).toBeEnabled();
  await kopf.locator('.cm-wf-starten').click();
  await expect
    .poll(() => (laufStand(b.stand(name)) || {}).runs || 0, { timeout: 30000 })
    .toBe(anzahl);
  return laufStand(b.stand(name)).lastRun;
}

// Das Sprach-Fragment der Workflows in der laufenden Sprache.
async function fragment(page) {
  const lang = (await page.evaluate(() => document.documentElement.lang)) || 'de';
  const sprache = lang.slice(0, 2).toLowerCase();
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'src', 'i18n', 'fragments', sprache, 'workflows.json'),
      'utf8',
    ),
  );
}

const setze = (vorlage, werte) => {
  expect(typeof vorlage).toBe('string');
  return vorlage.replace(/\{(\w+)\}/g, (_, k) => (k in werte ? String(werte[k]) : `{${k}}`));
};

// Der Satz eines Fehlschlag-Codes in der laufenden Sprache, mit Angaben.
async function satz(page, code, werte) {
  return setze((await fragment(page))[`workflow.fehlschlag.${code}`], werte);
}

// Die Aussage der Prüf-Anzeige «bereit; Hinweis zu Zeile N: …» in der laufenden Sprache.
async function hinweisAussage(page, code, line, table) {
  const f = await fragment(page);
  const grund = setze(f[`workflow.hinweis.${code}`], { table });
  const zeile = setze(f['workflow.pruefung.hinweisZeile'], { line, grund });
  return setze(f['workflow.pruefung.bereitMitHinweis'], { hinweis: zeile });
}

async function oeffneLaeufe(page) {
  const seite = page.locator(`${PANE} .pane-system .wf-runs-page`);
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('scg:open-system-page', { detail: { pageId: 'workflow-runs' } }),
    ),
  );
  await expect(seite).toBeVisible();
  return seite;
}

// Die Zeile eines Workflows auf der Seite «Workflow-Läufe», sobald sie das
// Merkmal `merkmal` trägt (Vorgabe: der Name selbst).
async function zeileAufDerSeite(page, name, merkmal = '.wf-runs-name') {
  const seite = await oeffneLaeufe(page);
  const aktualisieren = seite.locator('.wf-runs-refresh');
  const zeile = seite.locator('tr', { has: page.locator('.wf-runs-name', { hasText: name }) });
  await expect
    .poll(
      async () => {
        if (await aktualisieren.isEnabled()) await aktualisieren.click();
        return zeile.locator(merkmal).count();
      },
      { timeout: 20000 },
    )
    .toBe(1);
  return zeile;
}

function setzeTermin(begleitdatei, nextDue) {
  const parsed = mddStore.parseContainer(fs.readFileSync(begleitdatei, 'utf8'));
  mddStore.setWorkflowNextDue(parsed.container, nextDue);
  fs.writeFileSync(begleitdatei, mddStore.serializeContainer(parsed.container), 'utf8');
}

// Alle Markdown-Dateien eines Ordners mit Inhalt, nach Name geordnet.
function teile(ordner) {
  return fs
    .readdirSync(ordner)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((n) => [n, fs.readFileSync(path.join(ordner, n), 'utf8')]);
}

const lies = (pfad) => fs.readFileSync(pfad, 'utf8');

// Schreibt im Hauptprozess die Meldungen `index:overlay` mit (Pfad, meldendes
// Fenster, Text), ohne sie zu verändern (Muster regression/4t-0945-b12.spec.js).
async function schneideOverlayMit(app) {
  await hauptSenden(app, ({ ipcMain }) => {
    const karte = ipcMain._invokeHandlers;
    const original = karte.get('index:overlay');
    globalThis.__wfOverlay = { original, meldungen: [] };
    karte.set('index:overlay', async (e, ...args) => {
      const p = args[0] || {};
      globalThis.__wfOverlay.meldungen.push({
        pfad: p.filePath,
        fenster: e && e.sender ? e.sender.id : null,
        text: typeof p.content === 'string' ? p.content : null,
      });
      return original(e, ...args);
    });
  });
  // Der Weg hängt an einer inneren Tabelle von Electron; fehlt sie, scheitert
  // der Fall hier und nicht still an seiner Zusicherung.
  expect(
    await hauptLesen(app, () => typeof (globalThis.__wfOverlay || {}).original === 'function'),
  ).toBe(true);
}

// Die zuletzt gemeldete Überlagerung einer Datei: meldendes Fenster und Text.
const letzteMeldung = (app, endung) =>
  hauptLesen(
    app,
    (_, e) => {
      const liste = ((globalThis.__wfOverlay || {}).meldungen || []).filter(
        (m) => typeof m.pfad === 'string' && m.pfad.endsWith(e),
      );
      return liste.length ? liste[liste.length - 1] : null;
    },
    endung,
  );

test.describe('WF-DB-REGEL: Regeln der Datenbank auf den übrigen Wegen (4T-002694)', () => {
  test('WF-DB-REGEL-03: Urteil am Puffer eines anderen Fensters mit ungespeichertem Stand', async () => {
    test.setTimeout(150000);
    const b = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, b.wurzel);
      await datenbankBereit(page);
      await schneideOverlayMit(app);
      // Zweites Fenster desselben Bereichs (Muster WF-ZEIT-02, WF-EREIGNIS-02).
      const neu = app.waitForEvent('window');
      await page.evaluate(() => window.api.openNewWindow([], null));
      const zweites = await neu;
      await zweites.waitForLoadState('domcontentloaded');
      await expect.poll(() => zweites.title()).toContain('(Bereich');
      const zweitesId = await hauptLesen(await app.browserWindow(zweites), (w) => w.webContents.id);

      // «Library.md» im zweiten Fenster, Quelltext, Änderungsmodus; zwei
      // Eingaben nur im Puffer.
      await oeffneDokumentImFenster(app, zweites, b.library);
      await zweites.locator(SEL.viewBtn('source')).click();
      await zweites.locator(SEL.btnEdit).click();
      await expect(zweites.locator(SEL.btnEdit)).toHaveClass(/active/);
      const zeile = (text) => zweites.locator(`${SEL.paneSource0} .cm-line`, { hasText: text });
      await zeile('Freier Text der Tabelle.').click();
      await zweites.keyboard.press('End');
      await zweites.keyboard.press('Enter');
      await zweites.keyboard.type('Entwurf-Probe');
      await zeile('| 224').click();
      await zweites.keyboard.press('End');
      await zweites.keyboard.type(' Block-Probe');
      await expect(zeile('Entwurf-Probe')).toHaveCount(1);
      await expect(zeile('| 224 Block-Probe')).toHaveCount(1);
      // Der Hauptprozess kennt das zweite Fenster als Halter beider Eingaben.
      await expect
        .poll(async () => {
          const m = await letzteMeldung(app, 'Library.md');
          return !!(
            m &&
            m.fenster === zweitesId &&
            m.text &&
            m.text.includes('Entwurf-Probe') &&
            m.text.includes('| 224 Block-Probe')
          );
        })
        .toBe(true);
      expect(lies(b.library)).toBe(LIBRARY);

      // Halt am Text, der nur im Puffer des zweiten Fensters im Datensatz-Block
      // steht; über die Platte endete derselbe Schritt mit textNotFound.
      expect(await starte(app, page, b, 'Block-Fenster-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbRecordsByText',
      });
      expect(lies(b.library)).toBe(LIBRARY);
      const quelle = zweites.locator(`${SEL.paneSource0} .cm-content`);
      await expect(quelle).toContainText('| 224 Block-Probe');
      await expect(quelle).not.toContainText('Block-Ersatz');

      // Freier Text, der nur im Puffer des zweiten Fensters steht: gelingt,
      // sichtbar dort, die Platte bleibt.
      expect(await starte(app, page, b, 'Entwurf-Fenster-Probe')).toMatchObject({
        status: 'ok',
      });
      await expect(quelle).toContainText('Entwurf-Ersatz');
      await expect(quelle).toContainText('| 224 Block-Probe');
      await expect(quelle).toContainText('| Solaris');
      expect(lies(b.library)).toBe(LIBRARY);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });

  test('WF-DB-REGEL-04: geteilte Tabellen-Datei, Halt an einer Datensatz-Zeile im späteren Teil, append läuft', async () => {
    test.setTimeout(150000);
    const b = await baueBereich({ geteilt: true });
    const ordner = path.dirname(b.gross);
    const vorher = teile(ordner).filter(([n]) => n.startsWith('Gross'));
    // Vorbedingung: mehrere Teile, die Zeile liegt nicht in der Kopf-Datei.
    expect(vorher.length).toBeGreaterThan(1);
    expect(lies(b.gross)).not.toContain('| Name 790\n');
    const letzter = vorher[vorher.length - 1][0];
    expect(vorher.some(([n, t]) => n !== 'Gross.md' && t.includes('| Name 790\n'))).toBe(true);
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, b.wurzel);
      await datenbankBereit(page, ['Library', 'Authors', 'Gross']);

      expect(await starte(app, page, b, 'Teil-Zeile-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbRecordsByText',
      });
      expect(teile(ordner).filter(([n]) => n.startsWith('Gross'))).toEqual(vorher);

      expect(await starte(app, page, b, 'Teil-Anhang-Probe')).toMatchObject({ status: 'ok' });
      const nachher = teile(ordner).filter(([n]) => n.startsWith('Gross'));
      expect(nachher.map(([n]) => n)).toEqual(vorher.map(([n]) => n));
      // Hinter dem schließenden Zaun am Ende des letzten Teils; alle übrigen
      // Teile byte-gleich.
      const letzterText = lies(path.join(ordner, letzter));
      expect(letzterText).toMatch(/```\n\n?Nachsatz-Probe\n?$/);
      for (const [n, t] of nachher) if (n !== letzter) expect(t).toBe(new Map(vorher).get(n));
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });

  test('WF-DB-REGEL-05: früher Hinweis an Tabellen-Datei und Karteikarte, Starten bleibt möglich', async () => {
    test.setTimeout(150000);
    const b = await baueBereich();
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, b.wurzel);
      await datenbankBereit(page);

      // Tabellen-Datei: grüner Hinweis statt Befund, Knopf bedienbar.
      const zeitplan = await oeffneWorkflow(app, page, b, 'Zeitplan-Regel');
      const tabellenHinweis = await hinweisAussage(
        page,
        'tableFile',
        zeileVon(WORKFLOWS['Zeitplan-Regel'], BEFEHL.datensatz),
        'Library',
      );
      await expect(zeitplan.locator('.cm-wf-pruefung-ok')).toHaveText(tabellenHinweis, {
        timeout: 30000,
      });
      await expect(zeitplan.locator('.cm-wf-pruefung-befund')).toHaveCount(0);
      await expect(zeitplan.locator('.cm-wf-starten')).toBeEnabled();

      // Karteikarte: derselbe Hinweis mit eigenem Satz; der Start gelingt und
      // hält erst an der Zeile.
      const feld = await oeffneWorkflow(app, page, b, 'Feld-Hinweis-Probe');
      const kartenHinweis = await hinweisAussage(
        page,
        'recordCard',
        zeileVon(WORKFLOWS['Feld-Hinweis-Probe'], BEFEHL.feld),
        'Authors',
      );
      await expect(feld.locator('.cm-wf-pruefung-ok')).toHaveText(kartenHinweis, {
        timeout: 30000,
      });
      await expect(feld.locator('.cm-wf-pruefung-befund')).toHaveCount(0);
      expect(await starte(app, page, b, 'Feld-Hinweis-Probe')).toMatchObject({
        status: 'failed',
        code: 'dbFieldByText',
      });
      expect(lies(b.eco)).toBe(ECO);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });

  test('WF-DB-REGEL-06: Lauf nach Zeitplan hält trotz Scharf-Schaltung, bei ausgeschalteter Datenbank läuft er durch', async () => {
    test.setTimeout(240000);
    const b = await baueBereich();
    const stand = b.stand('Zeitplan-Regel');
    const { app, page, userData } = await launchApp();
    try {
      await warteAufRendererBereit(page);
      await bindeBereich(page, b.wurzel);
      await datenbankBereit(page);

      // Scharf schalten über den Knopf über dem Block: Nur dieser Weg prüft im
      // Fenster mit der Rückfrage nach Dateien der Datenbank, also mit dem
      // Hinweis; die Seite «Workflow-Läufe» und der Hauptprozess sehen ihn nicht.
      // Erst steht der Hinweis in der Prüf-Anzeige, dann verhindert er das
      // Scharf-Schalten nicht.
      const kopf = await oeffneWorkflow(app, page, b, 'Zeitplan-Regel');
      await expect(kopf.locator('.cm-wf-pruefung-ok')).toHaveText(
        await hinweisAussage(
          page,
          'tableFile',
          zeileVon(WORKFLOWS['Zeitplan-Regel'], BEFEHL.datensatz),
          'Library',
        ),
        { timeout: 30000 },
      );
      const knopf = kopf.locator('.cm-wf-scharf');
      await expect(knopf).toHaveAttribute('aria-pressed', 'false');
      await knopf.click();
      await expect(knopf).toHaveAttribute('aria-pressed', 'true');
      const zeile = await zeileAufDerSeite(page, 'Zeitplan-Regel');
      await expect(zeile.locator('.wf-runs-armed')).toHaveAttribute('data-status', 'armed');
      expect(laufStand(stand).armed.hash).toMatch(/^[0-9a-f]{64}$/);

      // Zur Fälligkeit: Halt an derselben Zeile, ohne Zuschauer.
      setzeTermin(stand, localNowString(new Date()));
      await expect.poll(() => (laufStand(stand) || {}).runs || 0, TAKT_ZEIT).toBe(1);
      expect(laufStand(stand).lastRun).toMatchObject({
        status: 'failed',
        code: 'dbRecordsByText',
        origin: 'schedule',
      });
      expect(lies(b.library)).toBe(LIBRARY);
      const nachHalt = await zeileAufDerSeite(
        page,
        'Zeitplan-Regel',
        '.wf-runs-result[data-status="failed"]',
      );
      await expect(nachHalt.locator('.wf-runs-result')).toContainText(
        await satz(page, 'dbRecordsByText', { table: 'Library', command: 'replace' }),
      );

      // Erweiterung «Datenbank» aus: derselbe Workflow läuft zum nächsten Termin durch.
      await page.evaluate(() => window.api.setSetting('extensions.disabled', ['database']));
      setzeTermin(stand, localNowString(new Date()));
      await expect.poll(() => (laufStand(stand) || {}).runs || 0, TAKT_ZEIT).toBe(2);
      expect(laufStand(stand).lastRun).toMatchObject({ status: 'ok', origin: 'schedule' });
      expect(lies(b.library)).toBe(LIBRARY.replace('| Solaris\n', '| Solaris X\n'));
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(b.wurzel);
    }
  });
});
