// @vitest-environment jsdom
// 4T-002422 (Epic 3E-000366, Story 4S-001133): Der Knopf «Scharf» neben
// «Starten» in der Kopfzeile über dem `workflow`-Block
// (src/renderer/modules/workflows/workflow-scharf-knopf.js), AK1 des Tasks,
// AK1 und AK3 der Story.
//
// Am echten Editor mit der Kopfzeile aus 4T-002351 und dem echten Knopf
// «Starten»: «Scharf» steht nur bei `trigger: schedule`, rechts neben
// «Starten», zeigt den Zustand aus dem Hauptprozess und ruft beim Klick das
// gemeinsame Kommando `schalteScharf` (eigene Prüfdatei workflow-scharf.test.js,
// hier Attrappe) mit der Gegenrichtung des frischen Zustands.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: vi.fn(async () => true),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
const schalteScharf = vi.fn(async () => ({ ok: true }));
vi.mock('../../../src/renderer/modules/workflows/workflow-scharf.js', async (orig) => ({
  ...(await orig()),
  schalteScharf: (...a) => schalteScharf(...a),
}));

let zustand = { ok: true, isWorkflow: true, scheduled: true, status: 'notArmed', nextDue: null };
const gefragt = [];
window.api.workflowArmedState = async (p) => {
  gefragt.push(p);
  return zustand;
};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { t } = i18n;
const { workflowKopf } = await import('../../../src/renderer/modules/workflows/workflow-kopf.js');
const { liveBasePathFacet } =
  await import('../../../src/renderer/modules/live/live-block-field.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { registriereStartKnopf } =
  await import('../../../src/renderer/modules/workflows/workflow-start-knopf.js');
const { registriereScharfKnopf } =
  await import('../../../src/renderer/modules/workflows/workflow-scharf-knopf.js');

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
const offen = [];
function sicht(text, pfad = 'C:/b/Probe.md') {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [liveBasePathFacet.of(pfad), workflowKopf(liveBasePathFacet)],
    }),
    parent,
  });
  offen.push(view);
  return view;
}
const knopf = (view) => view.dom.querySelector('.cm-wf-kopf .cm-wf-aktionen .cm-wf-scharf');
const ruhe = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

beforeEach(() => {
  state.areaPath = 'C:/b';
  registriereStartKnopf();
  registriereScharfKnopf();
  zustand = { ok: true, isWorkflow: true, scheduled: true, status: 'notArmed', nextDue: null };
  gefragt.length = 0;
  schalteScharf.mockClear();
  showStatusbarHint.mockClear();
});
afterEach(() => {
  for (const v of offen.splice(0)) v.destroy();
});

describe('Knopf «Scharf»', () => {
  it('steht bei trigger: schedule rechts neben «Starten» (AK1)', async () => {
    const view = sicht(W(ZEITPLAN, 'notify "x"'));
    const knoepfe = [...view.dom.querySelectorAll('.cm-wf-aktionen button')];
    expect(knoepfe.map((k) => k.className)).toEqual(['cm-wf-starten', 'cm-wf-scharf']);
    await ruhe();
    expect(knopf(view).textContent).toBe(t('workflow.scharf.knopf'));
    expect(knopf(view).getAttribute('aria-pressed')).toBe('false');
    expect(gefragt).toEqual(['C:/b/Probe.md']);
  });

  it('fehlt ohne Zeitplan, «Starten» bleibt (AK3 der Story)', () => {
    const view = sicht(W([], 'notify "x"'));
    expect(knopf(view)).toBeNull();
    expect(view.dom.querySelector('.cm-wf-starten')).not.toBeNull();
  });

  it('zeigt einen scharfen Workflow gedrückt mit Haken und nächstem Lauf im Hinweis', async () => {
    zustand = { ...zustand, status: 'armed', nextDue: '2026-10-28T23:00' };
    const view = sicht(W(ZEITPLAN, 'notify "x"'));
    await ruhe();
    expect(knopf(view).getAttribute('aria-pressed')).toBe('true');
    expect(knopf(view).textContent).toBe(t('workflow.scharf.knopfAn'));
    expect(knopf(view).title).toContain('23:00');
  });

  it('zeigt «Definition geändert» als nicht gedrückt mit eigenem Hinweis', async () => {
    zustand = { ...zustand, status: 'definitionChanged' };
    const view = sicht(W(ZEITPLAN, 'notify "x"'));
    await ruhe();
    expect(knopf(view).getAttribute('aria-pressed')).toBe('false');
    expect(knopf(view).dataset.status).toBe('definitionChanged');
    expect(knopf(view).title).toBe(t('workflow.scharf.titelGeaendert'));
  });

  it('der Klick schaltet einen nicht scharfen Workflow mit dem Stand im Editor scharf', async () => {
    const text = W(ZEITPLAN, 'notify "x"');
    const view = sicht(text);
    knopf(view).click();
    await ruhe();
    expect(schalteScharf).toHaveBeenCalledWith('C:/b/Probe.md', true, { name: 'Probe', text });
  });

  it('der Klick entschärft einen scharfen und schaltet einen geänderten erneut scharf', async () => {
    zustand = { ...zustand, status: 'armed', nextDue: '2026-10-28T23:00' };
    const view = sicht(W(ZEITPLAN, 'notify "x"'));
    knopf(view).click();
    await ruhe();
    expect(schalteScharf.mock.calls[0].slice(0, 2)).toEqual(['C:/b/Probe.md', false]);
    zustand = { ...zustand, status: 'definitionChanged', nextDue: null };
    knopf(view).click();
    await ruhe();
    expect(schalteScharf.mock.calls[1].slice(0, 2)).toEqual(['C:/b/Probe.md', true]);
  });

  it('ohne Speicherort und ohne Bereich meldet er den Grund und schaltet nicht', async () => {
    const ohne = sicht(W(ZEITPLAN, 'notify "x"'), '');
    expect(knopf(ohne).getAttribute('aria-disabled')).toBe('true');
    knopf(ohne).click();
    await ruhe();
    expect(showStatusbarHint).toHaveBeenCalledWith('workflow.start.inaktivUngespeichert', {
      error: true,
      duration: 3000,
    });
    state.areaPath = null;
    const ohneBereich = sicht(W(ZEITPLAN, 'notify "x"'));
    knopf(ohneBereich).click();
    await ruhe();
    expect(showStatusbarHint).toHaveBeenCalledWith('workflow.start.inaktivBereich', {
      error: true,
      duration: 3000,
    });
    expect(schalteScharf).not.toHaveBeenCalled();
    expect(gefragt).toEqual([]);
  });
});
