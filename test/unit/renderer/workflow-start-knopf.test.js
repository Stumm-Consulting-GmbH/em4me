// @vitest-environment jsdom
// 4T-002349 (Epic 3E-000184): Der Knopf «Starten» in der Kopfzeile über dem
// `workflow`-Block (src/renderer/modules/workflows/workflow-start-knopf.js).
//
// Am echten Editor mit der Kopfzeile aus 4T-002351: Der Knopf sitzt rechts in
// der Kopfzeile, startet mit dem Stand im Editor (AK3), ist bei einem Befund
// gesperrt und meldet ohne Speicherort «Zuerst speichern» (E4). Der Start
// selbst und die Statusleiste sind Attrappen.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
const starteWorkflow = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { workflowKopf } = await import('../../../src/renderer/modules/workflows/workflow-kopf.js');
const { liveBasePathFacet } =
  await import('../../../src/renderer/modules/live/live-block-field.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { knopfZustand, registriereStartKnopf } =
  await import('../../../src/renderer/modules/workflows/workflow-start-knopf.js');

const W = (...zeilen) =>
  ['---', 'workflow: true', 'name: Probe', '---', '', '```workflow', ...zeilen, '```', ''].join(
    '\n',
  );
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
const knopf = (view) => view.dom.querySelector('.cm-wf-kopf .cm-wf-aktionen .cm-wf-starten');

beforeEach(() => {
  state.areaPath = 'C:/b';
  registriereStartKnopf();
  starteWorkflow.mockClear();
  showStatusbarHint.mockClear();
});
afterEach(() => {
  for (const v of offen.splice(0)) v.destroy();
});

describe('Knopf «Starten»', () => {
  it('sitzt in der rechten Spalte der Kopfzeile und startet mit dem Stand im Editor (AK3)', () => {
    const text = W('notify "Hallo"');
    const view = sicht(text);
    const k = knopf(view);
    expect(k.textContent).toBe('Starten');
    expect(k.disabled).toBe(false);
    expect(k.getAttribute('aria-disabled')).toBe('false');
    expect(k.title).toBe('Workflow starten');
    k.click();
    expect(starteWorkflow).toHaveBeenCalledWith({ path: 'C:/b/Probe.md', text });
  });

  it('ein Klick setzt keine Schreibmarke', () => {
    const view = sicht(W('notify "Hallo"'));
    const vorher = view.state.selection.main.head;
    knopf(view).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(view.state.selection.main.head).toBe(vorher);
  });

  it('ist bei einem Befund gesperrt', () => {
    const view = sicht(W('fliege "Mond.md"'));
    const k = knopf(view);
    expect(k.disabled).toBe(true);
    expect(k.title).toBe('Erst die Befunde beheben');
    k.click();
    expect(starteWorkflow).not.toHaveBeenCalled();
  });

  it('ohne Speicherort: inaktiv mit «Zuerst speichern» (E4)', () => {
    const view = sicht(W('notify "Hallo"'), '');
    const k = knopf(view);
    expect(k.getAttribute('aria-disabled')).toBe('true');
    expect(k.title).toBe('Zuerst speichern');
    k.click();
    expect(starteWorkflow).not.toHaveBeenCalled();
    expect(showStatusbarHint).toHaveBeenCalledWith('workflow.start.inaktivUngespeichert', {
      error: true,
      duration: 3000,
    });
  });

  it('außerhalb eines Bereichs inaktiv; der Klick prüft den Stand erneut', () => {
    state.areaPath = null;
    const view = sicht(W('notify "Hallo"'));
    const k = knopf(view);
    expect(k.title).toBe('Nur in einem geöffneten Bereich startbar');
    state.areaPath = 'C:/b';
    k.click();
    expect(starteWorkflow).toHaveBeenCalled();
    expect(k.getAttribute('aria-disabled')).toBe('false');
  });

  it('meldet sich nur einmal an der Kopfzeile an', () => {
    registriereStartKnopf();
    const view = sicht(W('notify "Hallo"'));
    expect(view.dom.querySelectorAll('.cm-wf-starten')).toHaveLength(1);
  });

  it('knopfZustand: Befund vor Speicherort vor Bereich', () => {
    expect(knopfZustand({ ok: false }, '', null).key).toBe('workflow.start.inaktivBefund');
    expect(knopfZustand({ ok: true }, '', null).key).toBe('workflow.start.inaktivUngespeichert');
    expect(knopfZustand({ ok: true }, 'a.md', null).key).toBe('workflow.start.inaktivBereich');
    expect(knopfZustand({ ok: true }, 'a.md', 'C:/b')).toEqual({
      aktiv: true,
      befund: false,
      key: 'workflow.start.titel',
    });
  });
});
