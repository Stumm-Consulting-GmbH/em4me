// @vitest-environment jsdom
// 4T-002426 (Epic 3E-000366, Story 4S-001138, AK4 des Tasks, AK7 der Story):
// Die Workflows verknüpfter Bereiche im Fenster
// (src/renderer/modules/workflows/workflow-fremd.js) — flache Liste aus `linked`,
// Erkennung eines fremden Pfades und die Meldung eines gelungenen Laufs in der
// Statusleiste, ausgelöst über den echten Lauf-Stand (workflow-lauf-stand.js).
// Attrappe ist allein der Hinweis der Statusleiste.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const fremd = await import('../../../src/renderer/modules/workflows/workflow-fremd.js');
const { laufVerbucht } =
  await import('../../../src/renderer/modules/workflows/workflow-lauf-stand.js');

const PFAD = 'D:\\Zentral\\Abläufe\\Fremd-Probe.md';
const liste = {
  workflows: [{ name: 'Eigen', relPath: 'Eigen.md', absPath: 'C:/a/Workflows/Eigen.md' }],
  linked: [
    {
      key: 'zt',
      name: 'Zentral',
      workflows: [{ name: 'Fremd-Probe', relPath: 'Fremd-Probe.md', absPath: PFAD }],
    },
    {
      key: '',
      name: 'ohne Kürzel',
      workflows: [{ name: 'X', relPath: 'X.md', absPath: 'E:/X.md' }],
    },
  ],
};

fremd.initFremdeWorkflows();

beforeEach(() => {
  fremd.merkeFremde(liste);
  showStatusbarHint.mockReset();
});

describe('fremde Workflows der Liste', () => {
  it('flacht die Quellen mit Kürzel ab; eine Quelle ohne Kürzel entfällt', () => {
    expect(fremd.fremdeWorkflows(liste)).toEqual([
      expect.objectContaining({ name: 'Fremd-Probe', sourceKey: 'zt', sourceName: 'Zentral' }),
    ]);
    expect(fremd.fremdeWorkflows(null)).toEqual([]);
    expect(fremd.fremdeWorkflows({ workflows: [] })).toEqual([]);
  });

  it('erkennt einen fremden Pfad in jeder Schreibweise, nie einen eigenen', () => {
    expect(fremd.istFremderWorkflow('d:/zentral/abläufe/fremd-probe.md')).toBe(true);
    expect(fremd.istFremderWorkflow('C:/a/Workflows/Eigen.md')).toBe(false);
    expect(fremd.istFremderWorkflow('')).toBe(false);
    fremd.merkeFremde({ workflows: [], linked: [] });
    expect(fremd.istFremderWorkflow(PFAD)).toBe(false);
  });
});

describe('Ergebnis eines fremden Laufs in der Statusleiste', () => {
  it('meldet den gelungenen Lauf eines fremden Workflows', () => {
    laufVerbucht(PFAD, { status: 'ok', startedAt: Date.now() }, { status: 'ok' });
    expect(showStatusbarHint).toHaveBeenCalledTimes(1);
    const [key, opts] = showStatusbarHint.mock.calls[0];
    expect(key).toBe('workflow.lauf.fremdErfolgreich');
    expect(opts.error).toBeUndefined();
    expect(opts.text).toBe('Workflow ‹Fremd-Probe› aus Bereich ‹zt› erfolgreich gelaufen');
  });

  it('meldet nichts für einen eigenen Lauf und nichts Zweites bei einem Abbruch', () => {
    laufVerbucht('C:/a/Workflows/Eigen.md', { status: 'ok' }, null);
    laufVerbucht(PFAD, { status: 'failed', line: 3, code: 'fileMissing' }, null);
    laufVerbucht(PFAD, { status: 'canceled' }, null);
    expect(showStatusbarHint).not.toHaveBeenCalled();
  });
});

describe('Lauf-Stand: für einen fremden Workflow wird nicht gefragt', () => {
  it('fragt den Hauptprozess nur für einen eigenen Workflow', async () => {
    const gefragt = [];
    window.api.workflowRecordRun = async (pfad) => {
      gefragt.push(pfad);
      return { ok: true };
    };
    expect(await fremd.verbucheLaufStand(PFAD, { status: 'ok' })).toBe(false);
    expect(await fremd.verbucheLaufStand('C:/a/Workflows/Eigen.md', { status: 'ok' })).toBe(true);
    expect(gefragt).toEqual(['C:/a/Workflows/Eigen.md']);
  });
});
