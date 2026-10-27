// @vitest-environment jsdom
// 4T-002350 (Epic 3E-000184): Die Seite «Workflow-Läufe»
// (src/renderer/modules/workflows/workflow-laeufe-seite.js), Story 4S-001106.
//
// Gemessen werden der Bedienweg über das Kommando (AK1), die Liste aus dem
// Kanal `workflow:runs` mit Name, Ort, letztem Lauf, Ergebnis und Zahl der
// Läufe samt nie gelaufenem Workflow (AK2), das Nachziehen nach einem Lauf, nach
// einer neuen Ordner-Liste und gebündelt nach einer Index-Meldung (AK3) und der
// Knopf «Starten» (AK4). Echt sind System-Seiten, Reiter und Kommando-Registry;
// Attrappen sind der Start selbst (eigene Prüfdatei workflow-start.test.js), die
// Kommando-Platzierung und der Hinweis der Statusleiste. Ob der Grund auf der
// Seite derselbe ist wie im Hinweis, prüft workflow-lauf-stand.test.js am echten
// Start.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', async (orig) => ({
  ...(await orig()),
  isExtensionActive: (id) => !aus.has(id),
}));
const starteWorkflow = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-start.js', () => ({
  starteWorkflow: (...a) => starteWorkflow(...a),
  laeuftWorkflow: () => false,
}));
vi.mock('../../../src/renderer/modules/command-placement.js', () => ({
  renderCommandButtons: () => {},
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', async (orig) => ({
  ...(await orig()),
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
const listenZuhoerer = [];
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  onWorkflowFolderListChanged: (cb) => listenZuhoerer.push(cb),
}));

// Bestands-Markup, so weit die System-Seiten es anfassen (Muster
// datenbank-uebersicht-seite.test.js).
for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
      <section class="pane pane-mindmap"></section>
    </div>
  `;
}
// Die beiden Statusbar-Schaltflächen, die syncToolbarToActiveTab ohne
// Null-Prüfung greift (Muster memory-page.test.js).
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);

let antwort = null;
const abfragen = [];
const indexMeldungen = [];
window.api.workflowRuns = async () => {
  abfragen.push(Date.now());
  return antwort;
};
window.api.onBacklinksInvalidated = (cb) => indexMeldungen.push(cb);
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const seite = await import('../../../src/renderer/modules/workflows/workflow-laeufe-seite.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { COMMANDS } = await import('../../../src/shared/commands/commands.js');
const { laufVerbucht } =
  await import('../../../src/renderer/modules/workflows/workflow-lauf-stand.js');

const handler = {};
const verdrahtung = {
  registerHandler: (id, fn) => (handler[id] = fn),
  unregisterHandler: (id) => delete handler[id],
  refreshHotkeys: vi.fn(),
};
seite.initWorkflowLaeufe(verdrahtung);

const ID = seite.WORKFLOW_LAEUFE_COMMAND_ID;
const ruhe = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function liste(workflows, status = 'ready') {
  return { ok: true, status, workflows };
}
const A = {
  name: 'Anlegen',
  description: 'Legt zwei Dateien an',
  relPath: 'Workflows/Anlegen.md',
  absPath: 'C:/b/Workflows/Anlegen.md',
  runs: 3,
  lastRun: { at: '2026-10-23T08:15:30Z', status: 'failed', line: 9, code: 'fileMissing' },
  runStateDefect: false,
};
const B = {
  name: 'Bericht',
  description: '',
  relPath: 'Bericht.md',
  absPath: 'C:/b/Bericht.md',
  runs: 0,
  lastRun: null,
  runStateDefect: false,
};

function container() {
  return document.querySelector('.pane-system[data-system-page="workflow-runs"]');
}
const zellen = (klasse) =>
  [...container().querySelectorAll(`.${klasse}`)].map((e) => e.textContent);

async function oeffne() {
  const ok = handler[ID]();
  await ruhe();
  return ok;
}

beforeEach(() => {
  // Jede Seite schließen wie der Reiter-Weg (onClose), damit jeder Fall frisch öffnet.
  for (const pane of state.panes) pane.tabs = pane.tabs.filter((tb) => !tb.systemPage);
  systemPages.systemPageById('workflow-runs').onClose();
  aus.clear();
  seite.initWorkflowLaeufe(verdrahtung);
  state.areaPath = 'C:/b';
  state.areaName = 'Bereich';
  antwort = liste([A, B]);
  abfragen.length = 0;
  starteWorkflow.mockClear();
  showStatusbarHint.mockReset();
});

describe('Zugang über das Kommando (AK1)', () => {
  it('meldet das Kommando dynamisch mit Bezeichnung und Handler an', () => {
    const cmd = COMMANDS.find((c) => c.id === ID);
    expect(ID).toBe('ext.workflows.openRuns');
    expect(cmd).toMatchObject({ labelKey: 'workflow.seite.kommando', dynamic: true });
    expect(i18n.t(cmd.labelKey)).toBe('Workflow-Läufe anzeigen');
    expect(typeof handler[ID]).toBe('function');
  });

  it('das Kommando öffnet die Seite als Reiter', async () => {
    expect(await oeffne()).toBeUndefined();
    expect(seite.workflowLaeufeOffen()).toBe(true);
    expect(systemPages.systemPageById('workflow-runs').title()).toBe('Workflow-Läufe: Bereich');
    expect(container().querySelector('.wf-runs-heading').textContent).toBe(
      'Workflow-Läufe: Bereich',
    );
  });

  it('ohne Bereich bleibt es beim Hinweis, und der Handler meldet false', async () => {
    state.areaPath = null;
    expect(await oeffne()).toBe(false);
    expect(seite.workflowLaeufeOffen()).toBe(false);
    expect(showStatusbarHint).toHaveBeenCalledWith('workflow.seite.keinBereich', {
      duration: 3000,
      error: true,
    });
  });

  it('im Aus-Zustand der Erweiterung gibt es weder Kommando noch Seite', async () => {
    aus.add('workflows');
    document.dispatchEvent(new CustomEvent('scg:extensions-changed'));
    expect(COMMANDS.some((c) => c.id === ID)).toBe(false);
    expect(handler[ID]).toBeUndefined();
    expect(seite.oeffneWorkflowLaeufe()).toBe(false);
    expect(seite.workflowLaeufeOffen()).toBe(false);
  });
});

describe('Liste der Workflows des Bereichs (AK2)', () => {
  it('zeigt Name, Ort, letzten Lauf, Ergebnis mit Zeile und Grund und die Zahl der Läufe', async () => {
    await oeffne();
    expect(zellen('wf-runs-name')).toEqual(['Anlegen', 'Bericht']);
    expect(zellen('wf-runs-location')).toEqual(['Workflows', 'Wurzel des Bereichs']);
    expect(zellen('wf-runs-count')).toEqual(['3', '0']);
    const [ergebnisA] = zellen('wf-runs-result');
    // Ohne gemerktes Ergebnis kennt die Begleitdatei nur den Code: «…» an der Angabe.
    expect(ergebnisA).toBe("abgebrochen in Zeile 9: Datei '…' nicht gefunden");
    expect(zellen('wf-runs-time')[0]).toMatch(/2026/);
    expect(container().querySelector('.wf-runs-name').title).toBe('Legt zwei Dateien an');
  });

  it('ein nie gelaufener Workflow steht ohne letzten Lauf (AK6 der Story)', async () => {
    await oeffne();
    expect(zellen('wf-runs-time')[1]).toBe('');
    expect(zellen('wf-runs-result')[1]).toBe('noch nie gelaufen');
  });

  it('nennt erfolgreich, beendet, abgebrochene Eingabe und eine fehlerhafte Begleitdatei', async () => {
    const mit = (lastRun, extra = {}) => ({ ...B, runs: 1, lastRun, ...extra });
    antwort = liste([
      mit({ at: '2026-10-23T08:00:00Z', status: 'ok' }),
      mit({ at: '2026-10-23T08:00:00Z', status: 'stopped', line: 7 }),
      mit({ at: '2026-10-23T08:00:00Z', status: 'canceled' }),
      mit(null, { runStateDefect: true }),
    ]);
    await oeffne();
    expect(zellen('wf-runs-result')).toEqual([
      'erfolgreich',
      'beendet in Zeile 7',
      'Eingabe abgebrochen, kein Schritt ausgeführt',
      'Lauf-Stand nicht lesbar: Begleitdatei fehlerhaft',
    ]);
  });

  it('meldet einen leeren Bereich, den Index im Aufbau und einen Lese-Fehler', async () => {
    antwort = liste([]);
    await oeffne();
    expect(zellen('wf-runs-empty')).toEqual(['In diesem Bereich gibt es keine Workflows.']);
    antwort = liste([], 'indexing');
    container().querySelector('.wf-runs-refresh').click();
    await ruhe();
    expect(zellen('wf-runs-empty')).toEqual([
      'Der Bereich wird noch eingelesen; die Liste folgt gleich.',
    ]);
    antwort = { ok: false, code: 'unexpected' };
    container().querySelector('.wf-runs-refresh').click();
    await ruhe();
    expect(zellen('wf-runs-empty')).toEqual([
      'Die Workflows des Bereichs ließen sich nicht lesen.',
    ]);
  });
});

describe('Aktualität (AK3)', () => {
  it('zieht nach einem verbuchten Lauf mit dem neuen Stand nach', async () => {
    await oeffne();
    const vorher = abfragen.length;
    antwort = liste([{ ...A, runs: 4, lastRun: { at: '2026-10-23T09:00:00Z', status: 'ok' } }, B]);
    laufVerbucht(A.absPath, { status: 'ok', startedAt: Date.parse('2026-10-23T09:00:00Z') }, null);
    await ruhe();
    expect(abfragen.length).toBe(vorher + 1);
    expect(zellen('wf-runs-count')[0]).toBe('4');
    expect(zellen('wf-runs-result')[0]).toBe('erfolgreich');
  });

  it('zieht nach einer neuen Ordner-Liste nach', async () => {
    await oeffne();
    const vorher = abfragen.length;
    for (const cb of listenZuhoerer) cb({ workflows: [] });
    await ruhe();
    expect(abfragen.length).toBe(vorher + 1);
  });

  it('bündelt die Meldungen des Index zu einer Abfrage', async () => {
    vi.useFakeTimers();
    try {
      await oeffne();
      const vorher = abfragen.length;
      for (let i = 0; i < 5; i++) for (const cb of indexMeldungen) cb();
      expect(abfragen.length).toBe(vorher);
      await vi.advanceTimersByTimeAsync(500);
      expect(abfragen.length).toBe(vorher + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fragt nicht nach, solange die Seite zu ist, und überschreibt keine fremde Seite', async () => {
    laufVerbucht(A.absPath, { status: 'ok', startedAt: Date.now() }, null);
    await ruhe();
    expect(abfragen.length).toBe(0);
    await oeffne();
    const c = container();
    // Eine andere System-Seite übernimmt den Container der Spalte.
    c.dataset.systemPage = 'settings';
    c.innerHTML = '<p class="fremd">fremd</p>';
    const vorher = abfragen.length;
    laufVerbucht(A.absPath, { status: 'ok', startedAt: Date.now() }, null);
    await ruhe();
    expect(abfragen.length).toBe(vorher);
    expect(c.querySelector('.fremd')).not.toBeNull();
  });
});

describe('Knopf «Starten» (AK4)', () => {
  it('startet den Workflow der Zeile über den Start der Workflows', async () => {
    await oeffne();
    const knoepfe = [...container().querySelectorAll('.wf-runs-start')];
    expect(knoepfe.map((k) => k.textContent)).toEqual(['Starten', 'Starten']);
    expect(knoepfe[1].title).toBe('Workflow starten: Bericht');
    knoepfe[1].click();
    expect(starteWorkflow).toHaveBeenCalledWith({ path: 'C:/b/Bericht.md' });
  });
});
