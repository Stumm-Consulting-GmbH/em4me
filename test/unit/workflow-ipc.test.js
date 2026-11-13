// 4T-002348 (Epic 3E-000184): Die Kanal-Gruppe der Workflows (src/main/ipc/
// workflows.js): fail-closed Prüfung der Nutzlast, Bereich des Absenders,
// Abbruch mitten im Lauf (AK6) und der Lauf-Stand über den Kanal.
//
// Bestands-Lesungen: Registrier-Funktion und Deps-Namen wie in main.js
// (`registriere`, `ipcDeps`); die Schritt-Form aus `prepareRun`
// (src/shared/workflows/workflow-placeholders.js). Die Schleife über die
// Schritte gehört zur Lauf-Steuerung (4T-002349); hier steht sie als kleine
// Nachbildung, damit AK6 an den echten Kanälen geprüft ist.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWorkflowsIpc } = require('../../src/main/ipc/workflows.js');
const { analyzeWorkflow, prepareRun } = require('../../src/shared/workflows/workflow-core.js');
const subpages = require('../../src/shared/subpages.js');

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// 4T-002352: `aus` ist die gespeicherte Aus-Liste der Erweiterungen; ohne sie
// gibt es keinen Speicher, und der Schalter gilt als eingeschaltet.
// 4T-002544: `extra` ergänzt die Abhängigkeiten (Tor und Sicht der Datenbank).
function welt({ mitBereich = true, aus = null, trashItem = null, extra = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-kanal-'));
  tmpDirs.push(root);
  const kanaele = new Map();
  const fenster = { id: 'Fenster' };
  registerWorkflowsIpc((kanal, fn) => kanaele.set(kanal, fn), {
    senderWindow: () => fenster,
    areaOfWindow: () => (mitBereich ? { rootPath: root, name: 'B' } : null),
    windows: new Map(),
    backlinks: { bufferTextFor: () => null, bufferOwnerFor: () => null },
    subpages,
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    renameSingleFile: async (von, nach) => {
      fs.renameSync(von, nach);
      return { ok: true };
    },
    sendBookStateForDirs: async () => {},
    renamesFromPairs: (paare) => paare,
    applyLinkUpdatesForRename: async () => ({ updated: [], failed: [] }),
    broadcast: () => {},
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    mddSuspendedPaths: new Set(),
    mddKeyOf: (p) => p.toLowerCase(),
    notifyMddDefect: () => {},
    ...(trashItem ? { trashItem } : {}),
    ...(aus
      ? {
          getStore: () => ({
            get: (key) => (key === 'extensions.disabled' ? aus : undefined),
            onDidChange: () => () => {},
          }),
        }
      : {}),
    ...(extra ? extra(root) : {}),
  });
  const workflowPath = path.join(root, 'Workflows', 'Ablauf.md');
  const event = { sender: { id: 1 } };
  const rufe = (kanal, nutzlast) => kanaele.get(kanal)(event, nutzlast);
  return { root, kanaele, workflowPath, rufe };
}

const schritt = (keyword, args, extra = {}) => ({
  line: 3,
  blockLine: 1,
  keyword,
  args,
  source: null,
  position: null,
  ...extra,
});

describe('Kanäle', () => {
  it('registriert die drei Kanäle der Ausführung, die sechs des Workflow-Ordners, den der Läufe, die vier des Laufs nach Zeitplan, die vier des Laufs nach Ereignis und die zwei der Scharf-Schaltung', () => {
    // 4T-002355: Die Kanäle des Workflow-Ordners meldet registerWorkflowsIpc mit
    // an (ipc/workflow-folder.js); geprüft werden sie in workflow-folder-ipc.test.js.
    // Teil 2 brachte workflow:setFolder, workflow:create und workflow:fileInfo;
    // 4T-002350 den Lese-Kanal workflow:runs (ipc/workflow-runs.js).
    // 4T-002544: workflow:dbCatalog, die Auskunft über den Datenbank-Bestand.
    expect([...welt().kanaele.keys()]).toEqual([
      'workflow:step',
      'workflow:dbCatalog',
      // 4T-002547: Datenbank-Werte eines Laufs.
      'workflow:dbRead',
      'workflow:bufferEditDone',
      'workflow:recordRun',
      'workflow:folderList',
      'workflow:getConfig',
      'workflow:setAreaConfig',
      'workflow:setFolder',
      'workflow:create',
      'workflow:fileInfo',
      'workflow:runs',
      // 4T-002421: Lauf nach Zeitplan (ipc/workflow-schedule.js), geprüft in
      // workflow-schedule-check.test.js.
      'workflow:scheduleClaim',
      'workflow:scheduleRelease',
      'workflow:scheduleFinished',
      'workflow:scheduleOpen',
      // 4T-002460: Lauf nach Ereignis (ebenfalls ipc/workflow-schedule.js),
      // geprüft in workflow-event-check.test.js.
      'workflow:eventClaim',
      'workflow:eventRelease',
      'workflow:eventFinished',
      'workflow:eventOpen',
      // 4T-002422: Scharf-Schaltung (ipc/workflow-armed.js), geprüft in
      // workflow-armed-ipc.test.js.
      'workflow:setArmed',
      'workflow:armedState',
    ]);
  });
});

describe('workflow:step prüft die Nutzlast fail-closed', () => {
  it.each([
    ['keine Nutzlast', null],
    ['kein Schritt', {}],
    ['Zeile fehlt', { step: { ...schritt('mkdir', ['A']), line: undefined } }],
    // 4T-002424: `delete` ist seit der Stufe 2 ein Befehl des Hauptprozesses;
    // `confirm` läuft im Fenster. 4T-002464: die Block-Wörter `else` und
    // `end` führt der Ablauf-Kern im Fenster aus, `script` hat kein Schema.
    ['unbekanntes Schlüsselwort', { step: schritt('fliege', ['A']) }],
    ['else ist ein Schritt der Fenster-Seite', { step: schritt('else', []) }],
    ['end ist ein Schritt der Fenster-Seite', { step: schritt('end', []) }],
    ['script ohne Schema', { step: schritt('script', ['A']) }],
    ['if-exists ohne Pfad', { step: schritt('if-exists', []) }],
    ['if-property mit vier Argumenten', { step: schritt('if-property', ['a', 'b', 'c', 'd']) }],
    ['for-each mit leerem Muster', { step: schritt('for-each', ['']) }],
    ['confirm ist ein Schritt der Fenster-Seite', { step: schritt('confirm', ['Weiter?']) }],
    ['delete mit zwei Argumenten', { step: schritt('delete', ['A', 'B']) }],
    ['add-tag mit leerem Schlagwort', { step: schritt('add-tag', ['a.md', ' ']) }],
    ['complete-task ohne Suchtext', { step: schritt('complete-task', ['a.md']) }],
    ['Schritt der Fenster-Seite', { step: schritt('command', ['app.save']) }],
    ['zu wenige Argumente', { step: schritt('move', ['A']) }],
    ['falscher Typ', { step: schritt('mkdir', [7]) }],
    ['leerer Suchtext', { step: schritt('replace', ['a.md', ' ', 'x']) }],
    [
      'Quelle bei mkdir',
      { step: schritt('mkdir', ['A'], { source: { kind: 'file', path: 'x' } }) },
    ],
    ['append ohne Quelle', { step: schritt('append', ['a.md']) }],
    [
      'insert ohne Ort',
      { step: schritt('insert', ['a.md'], { source: { kind: 'section', name: 'S' } }) },
    ],
    [
      'unbekannte Quelle',
      { step: schritt('create', ['a.md'], { source: { kind: 'netz', path: 'x' } }) },
    ],
    ['Pfad zu lang', { step: schritt('mkdir', ['x'.repeat(5000)]) }],
  ])('%s: invalidStep, nichts geschieht', async (_name, nutzlast) => {
    const w = welt();
    const res = await w.rufe(
      'workflow:step',
      nutzlast ? { workflowPath: w.workflowPath, ...nutzlast } : null,
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('invalidStep');
    expect(fs.readdirSync(w.root)).toEqual([]);
  });

  it('ohne Bereich des Absenders: noArea', async () => {
    const w = welt({ mitBereich: false });
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A']),
    });
    expect(res).toMatchObject({ ok: false, line: 3, keyword: 'mkdir', code: 'noArea' });
  });

  it('eine Workflow-Datei außerhalb des Bereichs: outsideArea', async () => {
    const w = welt();
    const fremd = path.join(path.dirname(w.root), 'Fremd.md');
    const res = await w.rufe('workflow:step', {
      workflowPath: fremd,
      step: schritt('mkdir', ['A']),
    });
    expect(res.code).toBe('outsideArea');
  });

  it('ein gültiger Schritt trägt Zeile und Schlüsselwort im Ergebnis', async () => {
    const w = welt();
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A/B']),
    });
    expect(res).toEqual({
      ok: true,
      line: 3,
      keyword: 'mkdir',
      effect: { kind: 'folderCreated', paths: [path.join(w.root, 'A', 'B')], via: 'disk' },
    });
  });
});

describe('Abbruch mitten im Lauf (AK6)', () => {
  it('ein fehlgeschlagener Schritt beendet den Lauf mit Zeile und Grund; die Schritte davor bleiben', async () => {
    const w = welt();
    fs.mkdirSync(path.join(w.root, 'Workflows'));
    fs.writeFileSync(path.join(w.root, 'Belegt.md'), 'alt', 'utf8');
    const text = [
      '---',
      'workflow: true',
      '---',
      '```workflow',
      'mkdir "Projekt"',
      'create "Belegt.md"',
      'mkdir "Danach"',
      '```',
    ].join('\n');
    const analyse = analyzeWorkflow(text, { fileName: 'Ablauf.md' });
    const lauf = prepareRun(analyse.steps, { nowMs: 0 }, {}, {});
    expect(lauf.ok).toBe(true);
    const ergebnisse = [];
    for (const s of lauf.steps) {
      const res = await w.rufe('workflow:step', { workflowPath: w.workflowPath, step: s });
      ergebnisse.push(res);
      if (!res.ok) break;
    }
    expect(ergebnisse.map((r) => [r.ok, r.line, r.code || null])).toEqual([
      [true, 5, null],
      [false, 6, 'targetExists'],
    ]);
    expect(fs.existsSync(path.join(w.root, 'Projekt'))).toBe(true);
    expect(fs.existsSync(path.join(w.root, 'Danach'))).toBe(false);
    expect(fs.readFileSync(path.join(w.root, 'Belegt.md'), 'utf8')).toBe('alt');
  });
});

describe('workflow:recordRun und workflow:bufferEditDone', () => {
  it('hält den Lauf in der Begleitdatei fest', async () => {
    const w = welt();
    fs.mkdirSync(path.dirname(w.workflowPath));
    fs.writeFileSync(w.workflowPath, '# W\n', 'utf8');
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: { status: 'failed', line: 6, code: 'targetExists' },
    });
    expect(res).toEqual({ ok: true });
    const begleit = JSON.parse(
      fs.readFileSync(path.join(w.root, 'Workflows', 'Ablauf.mdd'), 'utf8'),
    );
    expect(begleit.workflow.runs).toBe(1);
    expect(begleit.workflow.lastRun).toMatchObject({
      status: 'failed',
      line: 6,
      code: 'targetExists',
    });
  });

  // 4T-002420 (AK4, AK6): Ein Lauf aus drei Datei-Schritten über die echten
  // Kanäle; das Journal entsteht aus den gemeldeten Wirkungen der Schritte, wie
  // der Ablauf es künftig tut, und landet mit relativen Pfaden in der
  // Begleitdatei. Die Workflow-Datei bleibt Zeichen für Zeichen.
  it('hält Herkunft und Journal eines Laufs mit drei Datei-Schritten fest (AK4, AK6)', async () => {
    const w = welt();
    fs.mkdirSync(path.dirname(w.workflowPath));
    const text = [
      '---',
      'workflow: true',
      '---',
      '```workflow',
      'mkdir "Projekt"',
      'create "Projekt/Notiz.md"',
      'copy "Projekt/Notiz.md" "Projekt/Kopie.md"',
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(w.workflowPath, text, 'utf8');
    const analyse = analyzeWorkflow(text, { fileName: 'Ablauf.md' });
    const lauf = prepareRun(analyse.steps, { nowMs: 0 }, {}, {});
    expect(lauf.ok).toBe(true);
    const journal = [];
    for (const s of lauf.steps) {
      const res = await w.rufe('workflow:step', { workflowPath: w.workflowPath, step: s });
      expect(res.ok).toBe(true);
      for (const p of res.effect.paths)
        journal.push({ line: res.line, command: res.keyword, path: p });
    }
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: { status: 'ok', origin: 'schedule', journal },
    });
    expect(res).toEqual({ ok: true });
    const begleit = JSON.parse(
      fs.readFileSync(path.join(w.root, 'Workflows', 'Ablauf.mdd'), 'utf8'),
    );
    expect(begleit.workflow.lastRun.origin).toBe('schedule');
    expect(begleit.workflow.lastRun.journal).toEqual([
      { line: 5, command: 'mkdir', path: 'Projekt' },
      { line: 6, command: 'create', path: 'Projekt/Notiz.md' },
      { line: 7, command: 'copy', path: 'Projekt/Kopie.md' },
    ]);
    expect(fs.readFileSync(w.workflowPath, 'utf8')).toBe(text);
  });

  it('weist ein Journal mit einem Pfad außerhalb des Bereichs ab', async () => {
    const w = welt();
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: {
        status: 'ok',
        journal: [{ line: 5, command: 'mkdir', path: path.join(path.dirname(w.root), 'X') }],
      },
    });
    expect(res).toEqual({ ok: false, code: 'outsideArea' });
    expect(fs.existsSync(path.join(w.root, 'Workflows', 'Ablauf.mdd'))).toBe(false);
  });

  it('weist einen ungültigen Lauf und einen fremden Ort ab', async () => {
    const w = welt();
    expect(
      await w.rufe('workflow:recordRun', { workflowPath: w.workflowPath, run: { status: 'x' } }),
    ).toEqual({
      ok: false,
      code: 'invalidStep',
    });
    const fremd = path.join(path.dirname(w.root), 'Fremd.md');
    expect(
      await w.rufe('workflow:recordRun', { workflowPath: fremd, run: { status: 'ok' } }),
    ).toEqual({
      ok: false,
      code: 'outsideArea',
    });
  });

  it('eine Antwort ohne offenen Auftrag wird verworfen', async () => {
    const w = welt();
    expect(await w.rufe('workflow:bufferEditDone', { requestId: 'nie', ok: true })).toEqual({
      ok: false,
    });
    expect(await w.rufe('workflow:bufferEditDone', null)).toEqual({ ok: false });
  });
});

// 4T-002352 (Story 4S-001108): Im Aus-Zustand der Erweiterung «Workflows» führt
// der Ausführungs-Kanal keinen Schritt aus (Muster der Kanäle der Datenbank-
// Maske und der Bücher). Gelesen wird der echte Schalter über den Speicher; der
// Lauf-Stand bleibt schreibbar, weil Abschalten nichts verlieren darf.
describe('Aus-Zustand der Erweiterung workflows', () => {
  it('workflow:step verweigert mit extensionOff, und nichts geschieht', async () => {
    const w = welt({ aus: ['workflows'] });
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A']),
    });
    expect(res).toEqual({ ok: false, line: 3, keyword: 'mkdir', code: 'extensionOff', detail: {} });
    expect(fs.readdirSync(w.root)).toEqual([]);
  });

  it('eingeschaltet über denselben Speicher läuft der Schritt (Gegenprobe)', async () => {
    const w = welt({ aus: ['templates'] });
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('mkdir', ['A']),
    });
    expect(res.ok).toBe(true);
    expect(fs.statSync(path.join(w.root, 'A')).isDirectory()).toBe(true);
  });

  it('der Lauf-Stand bleibt auch im Aus-Zustand schreibbar', async () => {
    const w = welt({ aus: ['workflows'] });
    fs.mkdirSync(path.dirname(w.workflowPath));
    fs.writeFileSync(w.workflowPath, '# W\n', 'utf8');
    const res = await w.rufe('workflow:recordRun', {
      workflowPath: w.workflowPath,
      run: { status: 'failed', line: 6, code: 'extensionOff' },
    });
    expect(res).toEqual({ ok: true });
  });
});

// 4T-002424 (Story 4S-001135): Die Pflege-Befehle am echten Kanal, mit einer
// Attrappe des Papierkorbs.
describe('Pflege-Befehle über workflow:step', () => {
  it('delete legt die Datei samt Begleitdatei über den Papierkorb weg', async () => {
    const weg = [];
    const w = welt({
      trashItem: async (p) => {
        weg.push(p);
        fs.rmSync(p, { recursive: true, force: true });
      },
    });
    fs.writeFileSync(path.join(w.root, 'Alt.md'), 'x', 'utf8');
    fs.writeFileSync(path.join(w.root, 'Alt.mdd'), '{}', 'utf8');
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('delete', ['Alt.md']),
    });
    expect(res).toMatchObject({ ok: true, line: 3, keyword: 'delete' });
    expect(weg).toEqual([path.join(w.root, 'Alt.md'), path.join(w.root, 'Alt.mdd')]);
    expect(fs.readdirSync(w.root)).toEqual([]);
  });

  it('add-tag schreibt das Schlagwort in den Dateikopf', async () => {
    const w = welt();
    const datei = path.join(w.root, 'a.md');
    fs.writeFileSync(datei, '---\ntags: [alt]\n---\nText\n', 'utf8');
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('add-tag', ['a.md', 'neu']),
    });
    expect(res).toMatchObject({ ok: true, keyword: 'add-tag', effect: { kind: 'edited' } });
    expect(fs.readFileSync(datei, 'utf8')).toBe('---\ntags:\n  - alt\n  - neu\n---\nText\n');
  });

  it('complete-task antwortet mit dem Fenster-Handgriff completeTask', async () => {
    const w = welt();
    fs.writeFileSync(path.join(w.root, 'Plan.md'), '- [x] Rückblick\n- [ ] Rückblick schreiben\n');
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: schritt('complete-task', ['Plan.md', 'Rückblick']),
    });
    expect(res).toEqual({
      ok: true,
      line: 3,
      keyword: 'complete-task',
      window: {
        action: 'completeTask',
        path: path.join(w.root, 'Plan.md'),
        line: 2,
        taskText: '- [ ] Rückblick schreiben',
      },
    });
  });
});

// 4T-002544 (Ausführungs-Entscheidung 4): die Auskunft über Tabellen, Felder und
// Abfrage-Dateien für die Rückfrage des Prüfers.
describe('workflow:dbCatalog', () => {
  const FENCE = '```';
  function datenbankWelt({ an = true, bereit = true } = {}) {
    return welt({
      extra: (root) => {
        const tabelle = path.join(root, 'Daten', 'Rechnungen.md');
        const abfrage = path.join(root, 'Abfragen', 'Offen.md');
        const kaputt = path.join(root, 'Abfragen', 'Kaputt.md');
        fs.mkdirSync(path.dirname(tabelle), { recursive: true });
        fs.mkdirSync(path.dirname(abfrage), { recursive: true });
        fs.writeFileSync(
          tabelle,
          '---\ndb-table:\n  fields:\n    - name: nummer\n      type: string\n' +
            '    - name: status\n      type: string\n---\n',
        );
        fs.writeFileSync(
          abfrage,
          `---\ndb-query: {}\n---\n${FENCE}perspective-query\nTABLE RECORDS nummer FROM "Rechnungen"\n${FENCE}\n`,
        );
        fs.writeFileSync(
          kaputt,
          `---\ndb-query: {}\n---\n${FENCE}perspective-query\nTABLE (\n${FENCE}\n`,
        );
        const sicht = {
          dbKindsPerFile: new Map([
            [tabelle, ['table']],
            [abfrage, ['query']],
            [kaputt, ['query']],
          ]),
          files: new Map(),
        };
        return {
          datenbankAktiv: () => an,
          backlinks: {
            bufferTextFor: () => null,
            bufferOwnerFor: () => null,
            ensureIndexForDemand: () => {},
            datenbankSicht: () => (bereit ? { status: 'ready', sicht } : { status: 'indexing' }),
          },
        };
      },
    });
  }

  it('liefert Tabellen mit Feldern und die Auslegung der Abfrage-Dateien', async () => {
    const res = await datenbankWelt().rufe('workflow:dbCatalog');
    expect(res).toEqual({
      ok: true,
      enabled: true,
      tables: [{ name: 'Rechnungen', path: 'Daten/Rechnungen.md', fields: ['nummer', 'status'] }],
      queries: [
        { path: 'Abfragen/Kaputt.md', state: 'invalid' },
        {
          path: 'Abfragen/Offen.md',
          state: 'ok',
          records: true,
          grouped: false,
          table: 'Rechnungen',
        },
      ],
    });
  });

  it('antwortet bei ausgeschalteter Datenbank mit leeren Listen', async () => {
    expect(await datenbankWelt({ an: false }).rufe('workflow:dbCatalog')).toEqual({
      ok: true,
      enabled: false,
      tables: [],
      queries: [],
    });
  });

  it('meldet einen Index im Aufbau und einen fehlenden Bereich', async () => {
    expect(await datenbankWelt({ bereit: false }).rufe('workflow:dbCatalog')).toEqual({
      ok: false,
      code: 'notReady',
    });
    expect(await welt({ mitBereich: false }).rufe('workflow:dbCatalog')).toEqual({
      ok: false,
      code: 'noArea',
    });
  });
});

// 4T-002545 (E7): Die Schreib-Schritte der Datenbank am Schritt-Kanal — Prüfung
// der Paare und Argument-Arten fail-closed, dann der Weg über das Schritt-Modul
// mit der Schreib-Schnittstelle des Prozesses (hier eine mitschreibende
// Attrappe; die echte prüft `workflow-db-steps.test.js`).
describe('Datenbank-Schritte über workflow:step (4T-002545)', () => {
  const paar = (key, value) => ({ key, value });
  const db = (keyword, args, extra = {}) => schritt(keyword, args, extra);

  function datenbankWelt() {
    const auftraege = [];
    const w = welt({
      extra: (root) => {
        const tabelle = path.join(root, 'Daten', 'Library.md');
        fs.mkdirSync(path.dirname(tabelle), { recursive: true });
        fs.writeFileSync(tabelle, '---\ndb-table:\n  fields:\n    - name: title\n---\n');
        return {
          datenbankAktiv: () => true,
          sperrVerwaltung: { gehalteneSperren: () => [] },
          schreibSchnittstelle: {
            fuehreAuftragAus: async (wurzel, auftrag, optionen) => {
              auftraege.push({ wurzel, auftrag, optionen });
              return { ok: true, vorgang: 9, ergebnisse: [{ id: 'r-00001' }], dateien: [] };
            },
          },
          backlinks: {
            bufferTextFor: () => null,
            bufferOwnerFor: () => null,
            ensureIndexForDemand: () => {},
            datenbankSicht: () => ({
              status: 'ready',
              sicht: { dbKindsPerFile: new Map([[tabelle, ['table']]]) },
            }),
          },
        };
      },
    });
    return { ...w, auftraege };
  }

  it.each([
    ['db-create ohne Paar', db('db-create', ['Library'])],
    ['db-create mit leerer Paar-Liste', db('db-create', ['Library'], { pairs: [] })],
    ['db-update ohne Datensatz', db('db-update', ['Library'], { pairs: [paar('title', 'x')] })],
    ['db-delete mit Paaren', db('db-delete', ['Library', 'r-1'], { pairs: [paar('title', 'x')] })],
    ['Paar ohne Feld-Namen', db('db-create', ['Library'], { pairs: [paar(' ', 'x')] })],
    ['Paar mit Gleichheitszeichen', db('db-create', ['Library'], { pairs: [paar('a=b', 'x')] })],
    ['Paar mit Zahl', db('db-create', ['Library'], { pairs: [paar('title', 7)] })],
    [
      'Feld doppelt',
      db('db-create', ['Library'], { pairs: [paar('title', 'x'), paar('Title', 'y')] }),
    ],
    ['leere Tabelle', db('db-create', [' '], { pairs: [paar('title', 'x')] })],
    ['Tabelle zu lang', db('db-create', ['x'.repeat(5000)], { pairs: [paar('title', 'x')] })],
    [
      'Name hinter as bei db-update',
      db('db-update', ['Library', 'r-1'], { pairs: [paar('title', 'x')], result: 'neu' }),
    ],
    ['Name hinter as leer', db('db-create', ['Library'], { pairs: [paar('t', 'x')], result: ' ' })],
    // 4T-002546 (V6): db-query mit Ziel `into` und `under`.
    ['db-query ohne into', db('db-query', ['A.md'])],
    ['db-query mit leerem into', db('db-query', ['A.md'], { target: ' ' })],
    ['db-query ohne Abfrage-Datei', db('db-query', [''], { target: 'B.md' })],
    [
      'db-query mit at-start',
      db('db-query', ['A.md'], { target: 'B.md', position: { kind: 'atStart' } }),
    ],
    [
      'into bei db-create',
      db('db-create', ['Library'], { pairs: [paar('t', 'x')], target: 'B.md' }),
    ],
    // 4T-002548 (V5): die Masken- und Konsistenz-Befehle.
    ['db-open ohne Tabelle', db('db-open', [])],
    ['db-open mit drei Argumenten', db('db-open', ['Library', 'r-1', 'x'])],
    ['db-open mit Paaren', db('db-open', ['Library'], { pairs: [paar('title', 'x')] })],
    ['db-open-list ohne Datei', db('db-open-list', [])],
    ['db-check mit zwei Argumenten', db('db-check', ['Library', 'x'])],
    ['db-check mit Zahl', db('db-check', [7])],
    ['db-check mit into', db('db-check', [], { target: 'B.md' })],
  ])('%s: invalidStep, kein Auftrag', async (_name, step) => {
    const w = datenbankWelt();
    const res = await w.rufe('workflow:step', { workflowPath: w.workflowPath, step });
    expect(res).toMatchObject({ ok: false, code: 'invalidStep' });
    expect(w.auftraege).toEqual([]);
  });

  it('führt db-create über die Schnittstelle des Prozesses aus, mit der Naht der Lauf-Marke', async () => {
    const w = datenbankWelt();
    const res = await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: db('db-create', ['Library'], { pairs: [paar('title', 'Probe')], result: 'neu' }),
    });
    expect(res).toEqual({
      ok: true,
      line: 3,
      keyword: 'db-create',
      record: 'r-00001',
      effect: {
        kind: 'db',
        paths: [path.join(w.root, 'Daten', 'Library.md')],
        table: 'Library',
        record: 'r-00001',
        transaction: 9,
      },
    });
    expect(w.auftraege).toHaveLength(1);
    expect(w.auftraege[0].wurzel).toBe(w.root);
    expect(w.auftraege[0].auftrag).toEqual({
      anweisungen: [{ tabelle: 'Daten/Library.md', art: 'create', werte: { title: 'Probe' } }],
    });
    expect(typeof w.auftraege[0].optionen.vorSchreiben).toBe('function');
  });

  it('reicht db-open-list und db-check an das Modul der Masken weiter (4T-002548)', async () => {
    const w = datenbankWelt();
    const rufe = (step) => w.rufe('workflow:step', { workflowPath: w.workflowPath, step });
    expect(await rufe(db('db-open-list', ['Daten/Library.md']))).toEqual({
      ok: false,
      line: 3,
      keyword: 'db-open-list',
      code: 'dbQueryFileMissing',
      detail: { path: 'Daten/Library.md' },
    });
    expect(await rufe(db('db-check', ['Fremd']))).toMatchObject({
      ok: false,
      keyword: 'db-check',
      code: 'dbTableUnknown',
    });
    expect(w.auftraege).toEqual([]);
  });

  it('nimmt keine Identität aus dem Fenster an: eine Angabe benutzer am Schritt reist nicht mit (E8)', async () => {
    const w = datenbankWelt();
    await w.rufe('workflow:step', {
      workflowPath: w.workflowPath,
      step: { ...db('db-create', ['Library'], { pairs: [paar('title', 'x')] }), benutzer: 'chef' },
    });
    expect(Object.keys(w.auftraege[0].auftrag.anweisungen[0]).sort()).toEqual([
      'art',
      'tabelle',
      'werte',
    ]);
  });
});

// 4T-002547 (V6): Der Lese-Kanal der Datenbank-Werte eines Laufs prüft die Form
// der Anfrage fail-closed und löst gegen die Wurzel des sendenden Fensters auf;
// den echten Lese-Weg prüft `workflow-db-schleife.test.js`.
describe('workflow:dbRead (4T-002547)', () => {
  const lesen = ({ an = true, ...rest } = {}) =>
    welt({ ...rest, extra: () => ({ datenbankAktiv: () => an }) });

  it.each([
    ['ohne Anfrage', undefined],
    ['unbekannte Art', { art: 'file', tabelle: 'T', kennung: 'r-1' }],
    ['record ohne Kennung', { art: 'record', tabelle: 'T' }],
    ['record mit leerer Tabelle', { art: 'record', tabelle: ' ', kennung: 'r-1' }],
    ['db ohne Feld', { art: 'db', table: 'T', record: 'r-1' }],
    ['db mit Zahl als Datensatz', { art: 'db', table: 'T', record: 7, field: 'f' }],
    ['db mit zu langem Feld', { art: 'db', table: 'T', record: 'r', field: 'x'.repeat(5000) }],
  ])('%s: invalidStep', async (_name, anfrage) => {
    const w = lesen();
    expect(await w.rufe('workflow:dbRead', { workflowPath: w.workflowPath, anfrage })).toEqual({
      ok: false,
      code: 'invalidStep',
      detail: {},
    });
  });

  it('verweigert bei ausgeschalteten Workflows und ohne Bereich', async () => {
    const anfrage = { art: 'db', table: 'T', record: 'r-1', field: 'f' };
    const aus = welt({ aus: ['workflows'] });
    expect(await aus.rufe('workflow:dbRead', { workflowPath: aus.workflowPath, anfrage })).toEqual({
      ok: false,
      code: 'extensionOff',
      detail: {},
    });
    const ohne = lesen({ mitBereich: false });
    expect(
      await ohne.rufe('workflow:dbRead', { workflowPath: ohne.workflowPath, anfrage }),
    ).toMatchObject({
      ok: false,
      code: 'noArea',
    });
  });

  it('reicht beide Arten an das Schritt-Modul weiter; eine ausgeschaltete Datenbank weist dort ab', async () => {
    const w = lesen({ an: false });
    const rufe = (anfrage) => w.rufe('workflow:dbRead', { workflowPath: w.workflowPath, anfrage });
    expect(await rufe({ art: 'record', tabelle: 'Daten/T.md', kennung: 'r-1' })).toMatchObject({
      ok: false,
      code: 'dbRejected',
      detail: { table: 'Daten/T.md', record: 'r-1', lagen: [{ code: 'auftragErweiterungAus' }] },
    });
    expect(await rufe({ art: 'db', table: 'T', record: 'Solaris', field: 'pages' })).toMatchObject({
      ok: false,
      code: 'dbRejected',
      detail: { table: 'T', record: 'Solaris' },
    });
  });
});
