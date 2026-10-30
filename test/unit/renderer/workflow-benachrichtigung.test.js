// @vitest-environment jsdom
// 4T-002423 (Epic 3E-000366, Entscheidung 2f, Story 4S-001134): Der Weg von
// `notify` und des Fehlschlags je Herkunft des Laufs
// (src/renderer/modules/workflows/workflow-benachrichtigung.js, angebunden in
// workflow-start.js).
//
// Gemessen am echten Start: Ein Lauf von Hand meldet allein in der
// Statusleiste; ein Lauf nach Zeitplan, auch ein nachgeholter, fordert für
// jedes `notify` und für einen Fehlschlag zusätzlich die Benachrichtigung des
// Betriebssystems an (Attrappe der Brücke `systemNotify`). Ob sie erscheint
// (Fokus-Regel, einmal je Meldung), entscheidet der Kanal im Hauptprozess;
// das prüft `test/unit/workflow-benachrichtigung-kanal.test.js`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: async () => ({}),
  folderDisplayFor: () => '',
  templateDocumentContext: () => ({ file: '', area: 'Bereich' }),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-window.js', () => ({
  bestaetigeLoeschZiele: async () => true,
  frageJaNein: async () => true,
  schliesseVorDemLoeschen: async () => true,
  flushPendingBuffers: async () => {},
  runWindowAction: async (a) => ({ ok: true, line: a.line, keyword: a.keyword, effect: {} }),
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => ({ workflows: [] }),
}));
vi.mock('../../../src/renderer/modules/task-query-actions.js', () => ({
  findOpenTab: () => null,
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [] }));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { panes: [{ activeIndex: 0, tabs: [] }], areaPath: 'C:/b' },
  activeTab: () => null,
}));

const meldungen = [];
let schrittAntwort = null;
Object.assign(window.api, {
  dirname: (p) => p.slice(0, p.lastIndexOf('/')),
  readFile: async () => ({ ok: false, error: 'ENOENT' }),
  templatesRead: async () => ({ ok: false, error: 'x' }),
  workflowStep: async (pfad, step) =>
    schrittAntwort
      ? schrittAntwort(step)
      : { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } },
  workflowRecordRun: async () => ({ ok: true }),
  systemNotify: vi.fn(async (anfrage) => {
    meldungen.push(anfrage);
    return true;
  }),
});

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { starteWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-start.js');
const { istZeitplanLauf, ZEITPLAN_HERKUNFT } =
  await import('../../../src/renderer/modules/workflows/workflow-lauf-stand.js');

const W = (name, ...zeilen) =>
  ['---', 'workflow: true', `name: ${name}`, '---', '', '```workflow', ...zeilen, '```', ''].join(
    '\n',
  );
const hinweisTexte = () => showStatusbarHint.mock.calls.map((c) => c[1] && c[1].text);
// Scheitert in Zeile 8; ein Schritt davor gelingt.
const fehlschlag = (step) =>
  step.line !== 8
    ? { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } }
    : {
        ok: false,
        line: step.line,
        keyword: step.keyword,
        code: 'targetExists',
        detail: { path: 'a.md' },
      };
const A1 = "Workflow ‹A› abgebrochen in Zeile 8: Das Ziel 'a.md' gibt es schon";

beforeEach(() => {
  meldungen.length = 0;
  schrittAntwort = null;
  showStatusbarHint.mockReset();
  window.api.systemNotify.mockClear();
});

describe('Herkunft eines Laufs', () => {
  it('schedule und catch-up sind Läufe nach Zeitplan, alles andere Start von Hand', () => {
    expect(ZEITPLAN_HERKUNFT).toEqual(['schedule', 'catch-up']);
    expect(istZeitplanLauf('schedule')).toBe(true);
    expect(istZeitplanLauf('catch-up')).toBe(true);
    for (const h of ['manual', undefined, '', 'fremd']) expect(istZeitplanLauf(h)).toBe(false);
  });
});

describe('notify je Herkunft (AK1 des Tasks, AK1 und AK3 der Story)', () => {
  it('von Hand: allein der Hinweis in der Statusleiste', async () => {
    expect(await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'notify "Fertig"') })).toBe(true);
    expect(hinweisTexte()).toEqual(['Fertig']);
    expect(window.api.systemNotify).not.toHaveBeenCalled();
  });

  it.each(['schedule', 'catch-up'])(
    'nach Zeitplan (%s): Hinweis und zusätzlich die Benachrichtigung des Betriebssystems',
    async (origin) => {
      const ok = await starteWorkflow({
        path: 'C:/b/A.md',
        text: W('Wochenrückblick', 'notify "Angelegt"', 'notify "Zweitens"'),
        origin,
      });
      expect(ok).toBe(true);
      expect(hinweisTexte()).toEqual(['Angelegt', 'Zweitens']);
      expect(meldungen.map((m) => [m.title, m.body])).toEqual([
        ['Wochenrückblick', 'Angelegt'],
        ['Wochenrückblick', 'Zweitens'],
      ]);
      // Art und eigener Schlüssel je Meldung: Der Kanal wendet Fokus-Regel und
      // Einmaligkeit an; zwei Meldungen tragen zwei Schlüssel.
      for (const m of meldungen) {
        expect(m.meldung.art).toBe('workflow');
        expect(m.meldung.keys).toHaveLength(1);
      }
      expect(meldungen[0].meldung.keys[0]).not.toBe(meldungen[1].meldung.keys[0]);
    },
  );
});

describe('Fehlschlag je Herkunft (AK2 des Tasks, AK6 der Story)', () => {
  it('nach Zeitplan: immer mit dem Text aus A1, auch ohne notify', async () => {
    schrittAntwort = fehlschlag;
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "x.md"', 'create "a.md"'),
      origin: 'schedule',
    });
    expect(hinweisTexte()).toEqual([A1]);
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0]).toMatchObject({
      title: 'A',
      body: A1,
      meldung: { art: 'workflow' },
    });
  });

  it('nachgeholt: ebenso, und ein notify davor meldet sich zusätzlich', async () => {
    schrittAntwort = fehlschlag;
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'notify "vorher"', 'create "a.md"'),
      origin: 'catch-up',
    });
    expect(meldungen.map((m) => m.body)).toEqual(['vorher', A1]);
  });

  it('ein Befund vor dem ersten Schritt eines Laufs nach Zeitplan meldet sich ebenso', async () => {
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'confirm "Weiter?"'),
      origin: 'schedule',
    });
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0].body).toMatch(/^Workflow ‹A› abgebrochen in Zeile 7: /);
    expect(meldungen[0].body).toBe(hinweisTexte()[0]);
  });

  it('von Hand: allein der Hinweis in der Statusleiste', async () => {
    schrittAntwort = fehlschlag;
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'notify "vorher"', 'create "a.md"') });
    expect(hinweisTexte()).toEqual(['vorher', A1]);
    expect(window.api.systemNotify).not.toHaveBeenCalled();
  });

  it('stop ist kein Fehlschlag: keine Benachrichtigung, auch nach Zeitplan', async () => {
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'stop "Nichts zu tun"'),
      origin: 'schedule',
    });
    expect(hinweisTexte()).toEqual(['Workflow ‹A› beendet in Zeile 7: Nichts zu tun']);
    expect(window.api.systemNotify).not.toHaveBeenCalled();
  });

  it('eine abgewiesene Brücke bricht den Lauf nicht ab', async () => {
    window.api.systemNotify.mockRejectedValueOnce(new Error('weg'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ok = await starteWorkflow({
        path: 'C:/b/A.md',
        text: W('A', 'notify "eins"', 'create "x.md"'),
        origin: 'schedule',
      });
      expect(ok).toBe(true);
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    } finally {
      warn.mockRestore();
    }
  });
});
