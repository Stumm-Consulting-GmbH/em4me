// 4T-002348 (Epic 3E-000184): Der Lauf-Stand im Abschnitt `workflow` der
// Begleitdatei (AK5 des Tasks, Story 4S-001106).
//
// Bestands-Lesungen: Schreibweg nach `writeBlockDataMutation`
// (src/main/documents/block-data.js): defekte Begleitdatei nie überschreiben,
// Pfad in die Menge der ausgesetzten Dokumente; Container-Format aus
// src/main/documents/mdd-store.js; Pfad der Begleitdatei über `mddPathFor`
// (src/main/documents/document-parts-io.js).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowRunState,
  normalizeRun,
} = require('../../src/main/workflows/workflow-run-state.js');
const mddStore = require('../../src/main/documents/mdd-store.js');
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
    record: (run) => stand.recordRun({}, workflow, run),
  };
}

describe('recordRun', () => {
  it('der erste Lauf legt die Begleitdatei an', async () => {
    const w = welt();
    expect(await w.record({ status: 'ok' })).toEqual({ ok: true });
    expect(w.lies().workflow).toEqual({
      runs: 1,
      lastRun: { at: '2026-10-23T08:30:15Z', status: 'ok' },
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
      lastRun: { at: '2026-10-22T16:40:05Z', status: 'failed', line: 14, code: 'targetExists' },
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
      lastRun: { at: '2026-10-23T08:30:15Z', status: 'stopped', line: 9 },
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
    expect(lastRun).toEqual({ at: '2026-10-23T08:30:15Z', status: 'failed', code: 'noBlock' });
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
    });
    expect(normalizeRun({ status: 'failed', line: null, code: 'noBlock' })).toEqual({
      status: 'failed',
      code: 'noBlock',
    });
    expect(normalizeRun({ status: 'failed', line: null })).toBe(null);
  });

  it('nimmt die vier Ergebnisse der geschlossenen Liste an', () => {
    expect(normalizeRun({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(normalizeRun({ status: 'canceled' })).toEqual({ status: 'canceled' });
    expect(normalizeRun({ status: 'stopped', line: 3 })).toEqual({ status: 'stopped', line: 3 });
    expect(normalizeRun({ status: 'failed', line: 3, code: 'targetExists' })).toEqual({
      status: 'failed',
      line: 3,
      code: 'targetExists',
    });
  });

  it.each([
    ['Status außerhalb der Liste', { status: 'gut' }],
    ['failed mit ungültiger Zeile', { status: 'failed', line: 0, code: 'x' }],
    ['failed ohne Code', { status: 'failed', line: 2 }],
    ['Code mit fremden Zeichen', { status: 'failed', line: 2, code: '<b>' }],
    ['stopped ohne Zeile', { status: 'stopped' }],
    ['Beginn keine Zahl', { status: 'ok', startedAt: 'heute' }],
    ['keine Nutzlast', null],
  ])('weist ab: %s', (_name, run) => {
    expect(normalizeRun(run)).toBe(null);
  });
});

describe('getWorkflowRun', () => {
  it('liest den Stand und ist tolerant gegenüber einer defekten Sektion', () => {
    expect(
      mddStore.getWorkflowRun({ workflow: { runs: 2, lastRun: { at: 'x', status: 'ok' } } }),
    ).toEqual({
      runs: 2,
      lastRun: { at: 'x', status: 'ok' },
    });
    expect(mddStore.getWorkflowRun({ workflow: 'kaputt' })).toBe(null);
    expect(mddStore.getWorkflowRun({})).toBe(null);
  });
});
