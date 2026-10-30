// @vitest-environment jsdom
// 4T-002422 (Epic 3E-000366, Story 4S-001133): Das Kommando der
// Scharf-Schaltung hinter den drei Bedienorten
// (src/renderer/modules/workflows/workflow-scharf.js), AK1, AK2 und AK5 des
// Tasks.
//
// Echt sind Prüfung (`pruefeWorkflow`, `befundZeile`) und Texte; Attrappen sind
// die Brücke zum Hauptprozess (Kanäle geprüft in workflow-armed-ipc.test.js),
// das Melden der Puffer-Stände und der Hinweis der Statusleiste.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', async (orig) => ({
  ...(await orig()),
  isExtensionActive: () => true,
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
const reihenfolge = [];
vi.mock('../../../src/renderer/modules/workflows/workflow-window.js', () => ({
  flushPendingBuffers: async () => reihenfolge.push('flush'),
}));

let antwort = { ok: true, status: 'armed', nextDue: '2026-10-28T23:00' };
const aufrufe = [];
window.api.workflowSetArmed = async (p, an) => {
  reihenfolge.push('setArmed');
  aufrufe.push([p, an]);
  return antwort;
};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { t } = i18n;
const scharf = await import('../../../src/renderer/modules/workflows/workflow-scharf.js');

const W = (kopf, ...zeilen) =>
  [
    '---',
    'workflow: true',
    'name: Probe',
    ...kopf,
    '---',
    '',
    '```workflow',
    ...zeilen,
    '```',
    '',
  ].join('\n');
const ZEITPLAN = ['trigger: schedule', 'schedule: every day at 23:00'];
const letzterHinweis = () => showStatusbarHint.mock.calls.at(-1)[1];

beforeEach(() => {
  antwort = { ok: true, status: 'armed', nextDue: '2026-10-28T23:00' };
  aufrufe.length = 0;
  reihenfolge.length = 0;
  showStatusbarHint.mockClear();
});

describe('schalteScharf', () => {
  it('meldet die Puffer, schaltet scharf und nennt Name und nächsten Lauf', async () => {
    const gemeldet = [];
    const ab = scharf.onScharfGeaendert((p, e) => gemeldet.push([p, e.status]));
    try {
      await scharf.schalteScharf('C:/b/Plan.md', true, { name: 'Plan' });
    } finally {
      ab();
    }
    expect(reihenfolge).toEqual(['flush', 'setArmed']);
    expect(aufrufe).toEqual([['C:/b/Plan.md', true]]);
    const hinweis = letzterHinweis();
    expect(hinweis.error).toBeUndefined();
    expect(hinweis.text).toContain('‹Plan›');
    expect(hinweis.text).toContain(scharf.wanduhrText('2026-10-28T23:00'));
    expect(scharf.wanduhrText('2026-10-28T23:00')).toContain('23:00');
    expect(gemeldet).toEqual([['C:/b/Plan.md', 'armed']]);
  });

  it('entschärft; ohne Namen nimmt der Hinweis den Dateinamen (AK5)', async () => {
    antwort = { ok: true, status: 'notArmed', nextDue: null };
    await scharf.schalteScharf('C:/b/Abläufe/Plan.md', false);
    expect(aufrufe).toEqual([['C:/b/Abläufe/Plan.md', false]]);
    expect(letzterHinweis().text).toBe(t('workflow.scharf.entschaerft').replace('{name}', 'Plan'));
  });

  it('weist einen Befund «nur von Hand» schon im Fenster ab, mit Zeile und Grund (AK2)', async () => {
    const text = W(ZEITPLAN, 'delete "Alt.md"');
    const res = await scharf.schalteScharf('C:/b/Plan.md', true, { text });
    expect(res).toMatchObject({ ok: false, code: 'findings' });
    expect(aufrufe).toEqual([]);
    const hinweis = letzterHinweis();
    expect(hinweis.error).toBe(true);
    expect(hinweis.text).toContain('9');
    expect(hinweis.text).toContain(t('workflow.befund.manualOnly').slice(0, 12));
  });

  it('zeigt eine Abweisung des Hauptprozesses mit dem ersten Befund', async () => {
    antwort = {
      ok: false,
      code: 'findings',
      findings: [{ code: 'manualOnly', line: 7, detail: { keyword: 'confirm' } }],
    };
    await scharf.schalteScharf('C:/b/Plan.md', true);
    const hinweis = letzterHinweis();
    expect(hinweis.error).toBe(true);
    expect(hinweis.text).toContain('7');
    expect(hinweis.text).toContain('confirm');
  });

  it('nennt den Grund einer Abweisung ohne Befund, etwa beim verknüpften Bereich', async () => {
    antwort = { ok: false, code: 'outsideArea' };
    await scharf.schalteScharf('D:/fremd/F.md', true);
    expect(letzterHinweis().text).toContain(t('workflow.scharf.fehler.outsideArea'));
    antwort = { ok: false, code: 'gibtEsNicht' };
    await scharf.schalteScharf('C:/b/Plan.md', true);
    expect(letzterHinweis().text).toContain(t('workflow.scharf.fehler.unexpected'));
  });
});

describe('scharfTitel', () => {
  it('unterscheidet scharf, nicht scharf und Definition geändert', () => {
    expect(scharf.scharfTitel('armed', '2026-10-28T23:00')).toContain('23:00');
    expect(scharf.scharfTitel('notArmed', null)).toBe(t('workflow.scharf.titelAus'));
    expect(scharf.scharfTitel('definitionChanged', null)).toBe(t('workflow.scharf.titelGeaendert'));
  });
});
