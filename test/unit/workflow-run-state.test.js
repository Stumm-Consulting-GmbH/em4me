// 4T-002348 (Epic 3E-000184): Der Lauf-Stand im Abschnitt `workflow` der
// Begleitdatei (AK5 des Tasks, Story 4S-001106).
//
// Bestands-Lesungen: Schreibweg nach `writeBlockDataMutation`
// (src/main/documents/block-data.js): defekte Begleitdatei nie überschreiben,
// Pfad in die Menge der ausgesetzten Dokumente; Container-Format aus
// src/main/documents/mdd-store.js; Pfad der Begleitdatei über `mddPathFor`
// (src/main/documents/document-parts-io.js).
//
// 4T-002420 (Epic 3E-000366, Story 4S-001131): die Felder der Stufe 2 —
// Scharf-Zustand mit Prüfsumme der Definition, nächster fälliger Lauf,
// verfallener Lauf, Herkunft und Journal — am selben Schreibweg.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ARMED_STATUS,
  MAX_JOURNAL,
  RUN_ORIGINS,
  armedStatus,
  createWorkflowRunState,
  journalImBereich,
  normalizeRun,
} = require('../../src/main/workflows/workflow-run-state.js');
const mddStore = require('../../src/main/documents/mdd-store.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');
// Derselbe Modul-Zugang wie in src/main/documents/atomic-write.js; ein Spion
// darauf greift im Schreibweg (Muster test/unit/area-replace.test.js).
const fsp = require('node:fs/promises');

const JETZT = Date.UTC(2026, 9, 23, 8, 30, 15, 400);
let tmpDirs = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    try {
      fs.chmodSync(dir, 0o777);
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const WORKFLOW_TEXT = '---\nworkflow: true\n---\n```workflow\nmkdir "A"\n```\n';

function welt() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-stand-'));
  tmpDirs.push(root);
  const workflow = path.join(root, 'Ablauf.md');
  fs.writeFileSync(workflow, WORKFLOW_TEXT, 'utf8');
  const ausgesetzt = new Set();
  const defekte = [];
  const stand = createWorkflowRunState({
    mddSuspendedPaths: ausgesetzt,
    mddKeyOf: (p) => p.toLowerCase(),
    notifyMddDefect: (_owner, p, fehler) => defekte.push({ p, fehler }),
    now: () => JETZT,
  });
  const begleit = path.join(root, 'Ablauf.mdd');
  const lies = () => JSON.parse(fs.readFileSync(begleit, 'utf8'));
  return {
    workflow,
    begleit,
    ausgesetzt,
    defekte,
    lies,
    // Der Weg des Kanals: erst bereinigen, dann schreiben (4T-002420: die Herkunft
    // entsteht in `normalizeRun`).
    record: (run) => stand.recordRun({}, workflow, normalizeRun(run)),
  };
}

describe('recordRun', () => {
  it('der erste Lauf legt die Begleitdatei an', async () => {
    const w = welt();
    expect(await w.record({ status: 'ok' })).toEqual({ ok: true });
    expect(w.lies().workflow).toEqual({
      runs: 1,
      lastRun: { at: '2026-10-23T08:30:15Z', status: 'ok', origin: 'manual' },
    });
  });

  it('der Zähler zählt weiter, der letzte Lauf wird ersetzt', async () => {
    const w = welt();
    await w.record({ status: 'ok' });
    await w.record({ status: 'ok' });
    await w.record({
      status: 'failed',
      line: 14,
      code: 'targetExists',
      startedAt: Date.UTC(2026, 9, 22, 16, 40, 5),
    });
    expect(w.lies().workflow).toEqual({
      runs: 3,
      lastRun: {
        at: '2026-10-22T16:40:05Z',
        status: 'failed',
        line: 14,
        code: 'targetExists',
        origin: 'manual',
      },
    });
  });

  it('vorhandene Abschnitte und weitere Felder der Sektion bleiben', async () => {
    const w = welt();
    const container = mddStore.emptyContainer();
    container.notes = { text: 'Notiz', updated: '2026-10-01T00:00:00Z' };
    container.blockData = { a1: { values: { x: 1 }, updated: '2026-10-01T00:00:00Z' } };
    container.workflow = { runs: 4, armed: true };
    fs.writeFileSync(w.begleit, mddStore.serializeContainer(container), 'utf8');
    await w.record({ status: 'stopped', line: 9 });
    const neu = w.lies();
    expect(neu.notes).toEqual(container.notes);
    expect(neu.blockData).toEqual(container.blockData);
    expect(neu.history).toEqual(container.history);
    expect(neu.workflow).toEqual({
      runs: 5,
      armed: true,
      lastRun: { at: '2026-10-23T08:30:15Z', status: 'stopped', line: 9, origin: 'manual' },
    });
  });

  it('eine defekte Begleitdatei wird nicht überschrieben', async () => {
    const w = welt();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(w.begleit, '{ defekt', 'utf8');
    expect(await w.record({ status: 'ok' })).toEqual({ ok: false, code: 'runStateNotSaved' });
    expect(fs.readFileSync(w.begleit, 'utf8')).toBe('{ defekt');
    expect(w.defekte).toHaveLength(1);
    expect(w.ausgesetzt.size).toBe(1);
    expect(await w.record({ status: 'ok' })).toEqual({ ok: false, code: 'runStateNotSaved' });
  });

  // Befund des Linux-Prüfstands vom 2026-10-23: Der Fall erzeugte den
  // Schreibfehler früher über Dateirechte (chmod 0o444). Unter POSIX hängt das
  // Ersetzen einer Datei an den Rechten des Verzeichnisses, nicht der Datei, und
  // im Container läuft die Suite als Verwalter; der Schreibvorgang gelang dort.
  // Unter Windows scheiterte er mit EPERM und kostete das volle
  // Wiederhol-Fenster. Jetzt scheitert genau das Umbenennen der Schattenkopie
  // auf die Begleitdatei, mit einem nicht wiederholten Code: plattformunabhängig
  // und ohne Wartezeit (Muster test/unit/area-replace.test.js).
  it('ein Schreibfehler an der Begleitdatei: runStateNotSaved, ohne Ausnahme', async () => {
    const w = welt();
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    await w.record({ status: 'ok' });
    const echtesUmbenennen = fsp.rename;
    const umbenennen = vi.spyOn(fsp, 'rename').mockImplementation(async (von, nach) => {
      if (String(nach) === w.begleit) {
        const err = new Error('kein Platz');
        err.code = 'ENOSPC';
        throw err;
      }
      return echtesUmbenennen(von, nach);
    });
    expect(await w.record({ status: 'ok' })).toEqual({ ok: false, code: 'runStateNotSaved' });
    // Der Fehler kam im Schreibschritt an, nicht schon beim Lesen.
    expect(umbenennen.mock.calls.some(([, nach]) => String(nach) === w.begleit)).toBe(true);
    expect(fehler).toHaveBeenCalled();
    umbenennen.mockRestore();
    // Ganz oder gar nicht: der alte Stand bleibt, keine Schattenkopie bleibt liegen.
    expect(w.lies().workflow.runs).toBe(1);
    expect(fs.readdirSync(path.dirname(w.begleit)).filter((n) => n.includes('em4me-neu'))).toEqual(
      [],
    );
  });

  it('failed ohne Zeile wird verbucht, der letzte Lauf trägt keine Zeile (Nachzug 4T-002350)', async () => {
    const w = welt();
    expect(await w.record({ status: 'failed', line: null, code: 'noBlock' })).toEqual({ ok: true });
    const { lastRun } = w.lies().workflow;
    expect(lastRun).toEqual({
      at: '2026-10-23T08:30:15Z',
      status: 'failed',
      code: 'noBlock',
      origin: 'manual',
    });
    expect(lastRun.line ?? null).toBe(null);
    expect(mddStore.getWorkflowRun(w.lies()).lastRun.line ?? null).toBe(null);
  });

  it('der Text der Workflow-Datei bleibt unverändert (AK5)', async () => {
    const w = welt();
    await w.record({ status: 'failed', line: 5, code: 'outsideArea' });
    expect(fs.readFileSync(w.workflow, 'utf8')).toBe(WORKFLOW_TEXT);
  });
});

describe('normalizeRun', () => {
  // 4T-002350 (Nachzug vom 2026-10-23): ein Befund der ganzen Datei hat keine Zeile.
  it('nimmt failed ohne Zeile an, der Code bleibt Pflicht', () => {
    expect(normalizeRun({ status: 'failed', code: 'noBlock' })).toEqual({
      status: 'failed',
      code: 'noBlock',
      origin: 'manual',
    });
    expect(normalizeRun({ status: 'failed', line: null, code: 'noBlock' })).toEqual({
      status: 'failed',
      code: 'noBlock',
      origin: 'manual',
    });
    expect(normalizeRun({ status: 'failed', line: null })).toBe(null);
  });

  it('nimmt die vier Ergebnisse der geschlossenen Liste an', () => {
    expect(normalizeRun({ status: 'ok' })).toEqual({ status: 'ok', origin: 'manual' });
    expect(normalizeRun({ status: 'canceled' })).toEqual({ status: 'canceled', origin: 'manual' });
    expect(normalizeRun({ status: 'stopped', line: 3 })).toEqual({
      status: 'stopped',
      line: 3,
      origin: 'manual',
    });
    expect(normalizeRun({ status: 'failed', line: 3, code: 'targetExists' })).toEqual({
      status: 'failed',
      line: 3,
      code: 'targetExists',
      origin: 'manual',
    });
  });

  // 4T-002420: Herkunft und Journal (Stufe 2).
  it('nimmt die drei Herkünfte an; ohne Angabe gilt manual (Absender der Stufe 1)', () => {
    for (const origin of RUN_ORIGINS) {
      expect(normalizeRun({ status: 'ok', origin }).origin).toBe(origin);
    }
    expect(normalizeRun({ status: 'ok' }).origin).toBe('manual');
  });

  it('nimmt ein Journal mit Zeile, Befehl des Katalogs und Pfad an', () => {
    const journal = [
      { line: 5, command: 'mkdir', path: '/b/Projekt' },
      { line: 6, command: 'create', path: '/b/Projekt/a.md' },
    ];
    expect(normalizeRun({ status: 'ok', origin: 'schedule', journal })).toEqual({
      status: 'ok',
      origin: 'schedule',
      journal,
    });
    expect(normalizeRun({ status: 'ok', journal: [] })).toEqual({
      status: 'ok',
      origin: 'manual',
      journal: [],
    });
  });

  it('schneidet ein überlanges Journal ab und vermerkt es', () => {
    const journal = Array.from({ length: MAX_JOURNAL + 3 }, (_, i) => ({
      line: 4,
      command: 'move',
      path: `/b/Ordner/${i}.md`,
    }));
    const sauber = normalizeRun({ status: 'ok', journal });
    expect(sauber.journal).toHaveLength(MAX_JOURNAL);
    expect(sauber.journalTruncated).toBe(true);
  });

  it.each([
    ['Status außerhalb der Liste', { status: 'gut' }],
    ['failed mit ungültiger Zeile', { status: 'failed', line: 0, code: 'x' }],
    ['failed ohne Code', { status: 'failed', line: 2 }],
    ['Code mit fremden Zeichen', { status: 'failed', line: 2, code: '<b>' }],
    ['stopped ohne Zeile', { status: 'stopped' }],
    ['Beginn keine Zahl', { status: 'ok', startedAt: 'heute' }],
    ['keine Nutzlast', null],
    ['unbekannte Herkunft', { status: 'ok', origin: 'timer' }],
    ['Journal kein Feld', { status: 'ok', journal: 'a.md' }],
    ['Journal-Zeile ohne Zeile', { status: 'ok', journal: [{ command: 'mkdir', path: '/b/A' }] }],
    [
      'Journal-Zeile mit unbekanntem Befehl',
      { status: 'ok', journal: [{ line: 2, command: 'fliege', path: '/b/A' }] },
    ],
    [
      'Journal-Zeile ohne Pfad',
      { status: 'ok', journal: [{ line: 2, command: 'mkdir', path: '' }] },
    ],
  ])('weist ab: %s', (_name, run) => {
    expect(normalizeRun(run)).toBe(null);
  });
});

describe('journalImBereich', () => {
  const root = path.resolve('/bereich');
  it('legt die Pfade relativ zur Bereichs-Wurzel mit / ab', () => {
    const run = normalizeRun({
      status: 'ok',
      journal: [{ line: 5, command: 'create', path: path.join(root, 'Projekt', 'a.md') }],
    });
    expect(journalImBereich(run, root).journal).toEqual([
      { line: 5, command: 'create', path: 'Projekt/a.md' },
    ]);
  });

  it('weist einen Pfad außerhalb des Bereichs und einen relativen ab', () => {
    const draussen = normalizeRun({
      status: 'ok',
      journal: [{ line: 5, command: 'create', path: path.resolve('/anderswo/a.md') }],
    });
    expect(journalImBereich(draussen, root)).toBe(null);
    const relativ = normalizeRun({
      status: 'ok',
      journal: [{ line: 5, command: 'create', path: 'Projekt/a.md' }],
    });
    expect(journalImBereich(relativ, root)).toBe(null);
  });

  it('lässt einen Lauf ohne Journal unverändert', () => {
    const run = normalizeRun({ status: 'ok' });
    expect(journalImBereich(run, root)).toBe(run);
  });
});

describe('getWorkflowRun', () => {
  it('liest einen Stand der Stufe 1: Herkunft manual, nicht scharf, kein Termin (AK5)', () => {
    expect(
      mddStore.getWorkflowRun({ workflow: { runs: 2, lastRun: { at: 'x', status: 'ok' } } }),
    ).toEqual({
      runs: 2,
      lastRun: { at: 'x', status: 'ok', origin: 'manual' },
      armed: null,
      nextDue: null,
      skipped: null,
    });
    expect(mddStore.getWorkflowRun({ workflow: 'kaputt' })).toBe(null);
    expect(mddStore.getWorkflowRun({})).toBe(null);
  });

  it('ein defektes Feld setzt nur sich selbst aus', () => {
    const stand = mddStore.getWorkflowRun({
      workflow: {
        runs: 1,
        lastRun: { at: 'x', status: 'ok', journal: [{ line: 'zwei' }, null] },
        armed: { at: 'x', hash: 'kurz' },
        nextDue: '2026-02-30T08:00',
        skipped: { at: 'x', due: 'morgen' },
      },
    });
    expect(stand).toEqual({
      runs: 1,
      lastRun: { at: 'x', status: 'ok', origin: 'manual', journal: [] },
      armed: null,
      nextDue: null,
      skipped: null,
    });
  });
});

// 4T-002420 (Epic 3E-000366, Story 4S-001131): Scharf-Zustand, Fälligkeit,
// Verfall, Herkunft und Journal am echten Schreibweg der Begleitdatei.
const HASH = 'a'.repeat(64);

describe('Lauf-Stand der Stufe 2 am Schreibweg (AK1, AK5)', () => {
  function welt2() {
    const w = welt();
    const neu = () =>
      createWorkflowRunState({
        mddSuspendedPaths: new Set(),
        mddKeyOf: (p) => p.toLowerCase(),
        notifyMddDefect: () => {},
        now: () => JETZT,
      });
    return { ...w, stand: neu(), neu, gelesen: () => mddStore.getWorkflowRun(w.lies()) };
  }

  it('hält Scharf-Zustand, nächsten Lauf, Herkunft und Journal, auch über einen Neustart', async () => {
    const w = welt2();
    expect(await w.stand.setArmed({}, w.workflow, { hash: HASH })).toEqual({ ok: true });
    expect(await w.stand.setNextDue({}, w.workflow, '2026-10-29T08:00')).toEqual({ ok: true });
    const run = normalizeRun({
      status: 'ok',
      origin: 'schedule',
      journal: [
        { line: 5, command: 'mkdir', path: 'Projekt' },
        { line: 6, command: 'create', path: 'Projekt/a.md' },
      ],
    });
    expect(await w.stand.recordRun({}, w.workflow, run)).toEqual({ ok: true });
    // Neustart: ein neuer Schreibweg liest dieselbe Datei von der Platte.
    expect(await w.neu().recordRun({}, w.workflow, normalizeRun({ status: 'ok' }))).toEqual({
      ok: true,
    });
    expect(w.gelesen()).toEqual({
      runs: 2,
      lastRun: { at: '2026-10-23T08:30:15Z', status: 'ok', origin: 'manual' },
      armed: { at: '2026-10-23T08:30:15Z', hash: HASH },
      nextDue: '2026-10-29T08:00',
      skipped: null,
    });
  });

  it('das Journal gehört zum letzten Lauf und wird mit ihm ersetzt', async () => {
    const w = welt2();
    const mit = normalizeRun({
      status: 'ok',
      origin: 'catch-up',
      journal: [{ line: 5, command: 'mkdir', path: 'Projekt' }],
    });
    await w.stand.recordRun({}, w.workflow, mit);
    expect(w.gelesen().lastRun).toEqual({
      at: '2026-10-23T08:30:15Z',
      status: 'ok',
      origin: 'catch-up',
      journal: [{ line: 5, command: 'mkdir', path: 'Projekt' }],
    });
    await w.stand.recordRun({}, w.workflow, normalizeRun({ status: 'canceled', journal: [] }));
    expect(w.gelesen().lastRun.journal).toEqual([]);
    await w.stand.recordRun({}, w.workflow, normalizeRun({ status: 'ok' }));
    expect(w.gelesen().lastRun.journal).toBeUndefined();
  });

  it('nimmt Scharf-Zustand und Termin zurück; das Feld fällt weg', async () => {
    const w = welt2();
    await w.stand.setArmed({}, w.workflow, { hash: HASH });
    await w.stand.setNextDue({}, w.workflow, '2026-10-29T08:00');
    await w.stand.setArmed({}, w.workflow, null);
    await w.stand.setNextDue({}, w.workflow, null);
    expect(w.lies().workflow).toEqual({});
    expect(w.gelesen()).toBe(null);
  });

  it('ohne Begleitdatei legt das Zurücknehmen keine an', async () => {
    const w = welt2();
    expect(await w.stand.setArmed({}, w.workflow, null)).toEqual({ ok: true });
    expect(await w.stand.setNextDue({}, w.workflow, null)).toEqual({ ok: true });
    expect(fs.existsSync(w.begleit)).toBe(false);
  });

  it('ein verfallener Lauf: Vermerk, künftiger Termin, kein Lauf gezählt (Story AK7)', async () => {
    const w = welt2();
    await w.stand.recordRun({}, w.workflow, normalizeRun({ status: 'ok' }));
    await w.stand.setNextDue({}, w.workflow, '2026-10-22T08:00');
    expect(
      await w.stand.recordSkipped({}, w.workflow, {
        due: '2026-10-22T08:00',
        nextDue: '2026-10-24T08:00',
      }),
    ).toEqual({ ok: true });
    const stand = w.gelesen();
    expect(stand.skipped).toEqual({ at: '2026-10-23T08:30:15Z', due: '2026-10-22T08:00' });
    expect(stand.nextDue).toBe('2026-10-24T08:00');
    expect(stand.runs).toBe(1);
    expect(stand.lastRun.status).toBe('ok');
  });

  it('unbekannte Felder der Sektion bleiben bei jedem Schreiben erhalten (AK5)', async () => {
    const w = welt2();
    const container = mddStore.emptyContainer();
    container.workflow = { runs: 3, lastRun: { at: 'x', status: 'ok' }, kuenftig: { a: 1 } };
    fs.writeFileSync(w.begleit, mddStore.serializeContainer(container), 'utf8');
    await w.stand.setArmed({}, w.workflow, { hash: HASH });
    await w.stand.setNextDue({}, w.workflow, '2026-10-29T08:00');
    await w.stand.recordSkipped({}, w.workflow, { due: '2026-10-29T08:00', nextDue: null });
    await w.stand.recordRun({}, w.workflow, normalizeRun({ status: 'ok' }));
    expect(w.lies().workflow.kuenftig).toEqual({ a: 1 });
    expect(w.gelesen().runs).toBe(4);
  });

  it('der Text der Workflow-Datei bleibt bei jedem Schreiben unverändert (AK6)', async () => {
    const w = welt2();
    await w.stand.setArmed({}, w.workflow, { hash: HASH });
    await w.stand.setNextDue({}, w.workflow, '2026-10-29T08:00');
    await w.stand.recordSkipped({}, w.workflow, { due: '2026-10-29T08:00', nextDue: null });
    await w.stand.recordRun({}, w.workflow, normalizeRun({ status: 'ok' }));
    expect(fs.readFileSync(w.workflow, 'utf8')).toBe(WORKFLOW_TEXT);
  });

  it.each([
    ['setArmed ohne Prüfsumme', (s, p) => s.setArmed({}, p, {})],
    ['setArmed mit kurzer Prüfsumme', (s, p) => s.setArmed({}, p, { hash: 'abc' })],
    ['setNextDue mit Leerzeichen', (s, p) => s.setNextDue({}, p, '2026-10-29 08:00')],
    ['setNextDue mit 30. Februar', (s, p) => s.setNextDue({}, p, '2026-02-30T08:00')],
    ['setNextDue mit 24 Uhr', (s, p) => s.setNextDue({}, p, '2026-10-29T24:00')],
    ['recordSkipped ohne Fälligkeit', (s, p) => s.recordSkipped({}, p, { nextDue: null })],
  ])('weist einen ungültigen Aufruf laut ab: %s', (_name, aufruf) => {
    const w = welt2();
    expect(() => aufruf(w.stand, w.workflow)).toThrow(TypeError);
    expect(fs.existsSync(w.begleit)).toBe(false);
  });

  it('eine defekte Begleitdatei wird auch beim Scharf-Schalten nicht überschrieben', async () => {
    const w = welt();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stand = createWorkflowRunState({
      mddSuspendedPaths: w.ausgesetzt,
      mddKeyOf: (p) => p.toLowerCase(),
      notifyMddDefect: () => {},
      now: () => JETZT,
    });
    fs.writeFileSync(w.begleit, '{ defekt', 'utf8');
    expect(await stand.setArmed({}, w.workflow, { hash: HASH })).toEqual({
      ok: false,
      code: 'runStateNotSaved',
    });
    expect(fs.readFileSync(w.begleit, 'utf8')).toBe('{ defekt');
  });
});

// AK3 des Tasks, AK4 der Story: Die Prüfsumme deckt Befehls-Block und
// Zeitplan-Felder, nicht Name, Beschreibung und Beschreibungs-Text.
describe('armedStatus: Schutz bei geänderter Definition (AK3)', () => {
  const datei = ({
    name = 'Täglich',
    description = 'Legt das Protokoll an',
    schedule = 'every day at 08:00',
    missed = 'skip',
    text = 'Beschreibung für Menschen.',
    zeilen = ['mkdir "Protokolle"', 'create "Protokolle/Heute.md"'],
  } = {}) =>
    [
      '---',
      'workflow: true',
      `name: ${name}`,
      `description: ${description}`,
      'trigger: schedule',
      `schedule: ${schedule}`,
      `missed: ${missed}`,
      '---',
      '',
      text,
      '',
      '```workflow',
      ...zeilen,
      '```',
      '',
    ].join('\n');
  const scharf = { at: '2026-10-23T08:30:15Z', hash: definitionsPruefsumme(datei()) };

  it('ohne Scharf-Schaltung: nicht scharf', () => {
    expect(armedStatus(null, datei())).toBe(ARMED_STATUS.notArmed);
  });

  it('dieselbe Definition: scharf, auch mit Windows-Zeilenenden', () => {
    expect(armedStatus(scharf, datei())).toBe(ARMED_STATUS.armed);
    expect(armedStatus(scharf, datei().replace(/\n/g, '\r\n'))).toBe(ARMED_STATUS.armed);
  });

  it.each([
    ['Name', { name: 'Morgens' }],
    ['Beschreibung', { description: 'Anderer Text' }],
    ['Beschreibungs-Text außerhalb des Blocks', { text: 'Ganz anders beschrieben.' }],
  ])('geänderter %s: bleibt scharf', (_name, aenderung) => {
    expect(armedStatus(scharf, datei(aenderung))).toBe(ARMED_STATUS.armed);
  });

  it.each([
    ['Befehls-Zeile', { zeilen: ['mkdir "Protokolle"', 'create "Protokolle/Morgen.md"'] }],
    ['zusätzliche Befehls-Zeile', { zeilen: ['mkdir "Protokolle"', 'mkdir "Neu"'] }],
    ['schedule', { schedule: 'every day at 09:00' }],
    ['missed', { missed: 'run-once' }],
  ])('geänderte %s: nicht scharf, Definition geändert', (_name, aenderung) => {
    expect(armedStatus(scharf, datei(aenderung))).toBe(ARMED_STATUS.definitionChanged);
  });

  it('ein geänderter Auslöser und ein entfernter Block: Definition geändert', () => {
    expect(armedStatus(scharf, datei().replace('trigger: schedule', 'trigger: manual'))).toBe(
      ARMED_STATUS.definitionChanged,
    );
    expect(armedStatus(scharf, datei({ zeilen: [] }).replace(/```workflow\n```\n/, ''))).toBe(
      ARMED_STATUS.definitionChanged,
    );
  });
});
