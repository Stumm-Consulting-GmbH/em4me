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
//
// 4T-002422 (Epic 3E-000366, Story 4S-001133): dazu die Spalten «Scharf» und
// «Nächster Lauf», «Definition geändert», «nachgeholt», «verfallen» und das
// aufklappbare Journal (AK1, AK3, AK4 des Tasks). Der Schalter läuft über das
// echte Kommando `schalteScharf` bis an die Brücke (Attrappe); das Melden der
// Puffer-Stände ist eine Attrappe.
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
vi.mock('../../../src/renderer/modules/workflows/workflow-window.js', () => ({
  flushPendingBuffers: async () => {},
}));
const scharfAufrufe = [];
window.api.workflowSetArmed = async (p, an) => {
  scharfAufrufe.push([p, an]);
  return { ok: true, status: an ? 'armed' : 'notArmed', nextDue: an ? '2026-10-28T23:00' : null };
};
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

// 4T-002426 (Epic 3E-000366, Story 4S-001138, AK1, AK4): Ein Workflow eines
// verknüpften Bereichs steht mit dem Kürzel der Quelle, ohne Lauf-Stand und mit
// dem Hinweis auf die Quelle; er startet über denselben Knopf.
describe('Workflows verknüpfter Bereiche (4T-002426)', () => {
  const F = {
    name: 'Fremd-Probe',
    description: '',
    relPath: 'Fremd-Probe.md',
    absPath: 'D:/Zentral/Abläufe/Fremd-Probe.md',
    sourceKey: 'zt',
    sourceName: 'Zentral',
    foreign: true,
    runs: 0,
    lastRun: null,
    runStateDefect: false,
  };

  it('zeigt den fremden Workflow nach den eigenen, ohne Lauf-Stand, mit dem Hinweis', async () => {
    antwort = liste([A, B, F]);
    await oeffne();
    const zeile = container().querySelector('tr[data-source="zt"]');
    expect(zeile).not.toBeNull();
    expect(zeile.dataset.path).toBe(F.absPath);
    // Ohne Zeit, Ergebnis und Zahl der Läufe; an ihrer Stelle der Hinweis.
    expect(zeile.querySelector('.wf-runs-time')).toBeNull();
    expect(zeile.querySelector('.wf-runs-result')).toBeNull();
    expect(zeile.querySelector('.wf-runs-count')).toBeNull();
    const hinweis = zeile.querySelector('.wf-runs-foreign');
    expect(hinweis.colSpan).toBe(3);
    expect(hinweis.title).toBe('Zentral');
    expect(zeile.querySelector('.wf-runs-location').textContent).toBe('');
    // Kein Schalter außer «Starten» (Scharf-Schaltung gibt es für ihn nie).
    expect([...zeile.querySelectorAll('button, input')].map((e) => e.className)).toEqual([
      'wf-runs-start',
    ]);
    zeile.querySelector('.wf-runs-start').click();
    expect(starteWorkflow).toHaveBeenCalledWith({ path: F.absPath });
    // Die Texte aus workflow.verknuepft.eintrag und workflow.seite.ausBereich.
    expect(zeile.querySelector('.wf-runs-name').textContent).toBe('Fremd-Probe (@zt)');
    expect(hinweis.textContent).toBe('aus Bereich ‹zt›');
  });

  it('ohne fremde Einträge bleibt die Seite wie zuvor (AK5 der Story)', async () => {
    antwort = liste([A, B]);
    await oeffne();
    expect(container().querySelector('tr[data-source]')).toBeNull();
    expect(container().querySelector('.wf-runs-foreign')).toBeNull();
  });
});

describe('Zeitsteuerung: Scharf, nächster Lauf, Herkunft, Verfall und Journal (4T-002422)', () => {
  const PLAN = {
    ...B,
    name: 'Plan',
    relPath: 'Plan.md',
    absPath: 'C:/b/Plan.md',
    scheduled: true,
    armed: 'armed',
    nextDue: '2026-10-28T23:00',
    skipped: null,
    runs: 2,
    lastRun: {
      at: '2026-10-28T06:00:00Z',
      status: 'ok',
      origin: 'catch-up',
      journal: [
        { line: 8, command: 'append', path: 'Notizen/Ziel.md' },
        { line: 9, command: 'create', path: 'Neu.md' },
      ],
    },
  };
  const zeileVon = (pfad) => container().querySelector(`tr[data-path="${pfad}"]`);
  const kopfTexte = () => [...container().querySelectorAll('thead th')].map((e) => e.textContent);

  beforeEach(() => {
    scharfAufrufe.length = 0;
  });

  it('trägt die Spalten «Scharf» und «Nächster Lauf» nach dem Ort', async () => {
    antwort = liste([PLAN]);
    await oeffne();
    expect(kopfTexte()).toEqual([
      'Workflow',
      'Ort',
      'Scharf',
      'Nächster Lauf',
      'Letzter Lauf',
      'Ergebnis',
      'Läufe',
      '',
    ]);
  });

  it('ein scharfer Workflow: Schalter an, nächster Lauf, Herkunft «nachgeholt» (AK3, AK4)', async () => {
    antwort = liste([PLAN]);
    await oeffne();
    const zeile = zeileVon(PLAN.absPath);
    const schalter = zeile.querySelector('.wf-runs-arm');
    expect(schalter.type).toBe('checkbox');
    expect(schalter.checked).toBe(true);
    expect(schalter.getAttribute('aria-label')).toBe('‹Plan› scharf schalten');
    expect(zeile.querySelector('.wf-runs-next').textContent).toContain('23:00');
    expect(zeile.querySelector('.wf-runs-origin').textContent).toBe(' (nachgeholt)');
  });

  it('ohne Zeitplan kein Schalter und kein nächster Lauf (AK1, AK3 der Story)', async () => {
    antwort = liste([{ ...B, scheduled: false, armed: 'notArmed', nextDue: null, skipped: null }]);
    await oeffne();
    const zeile = zeileVon(B.absPath);
    expect(zeile.querySelector('.wf-runs-arm')).toBeNull();
    expect(zeile.querySelector('.wf-runs-next').textContent).toBe('');
  });

  it('«nicht scharf: Definition geändert» mit Schalter aus und ohne nächsten Lauf (AK3)', async () => {
    antwort = liste([{ ...PLAN, armed: 'definitionChanged', nextDue: null }]);
    await oeffne();
    const zeile = zeileVon(PLAN.absPath);
    expect(zeile.querySelector('.wf-runs-arm').checked).toBe(false);
    expect(zeile.querySelector('.wf-runs-armed-changed').textContent).toBe(
      'nicht scharf: Definition geändert',
    );
    expect(zeile.querySelector('.wf-runs-next').textContent).toBe('');
  });

  it('ein nicht scharfer Workflow zeigt keinen nächsten Lauf, auch wenn einer mitkäme (AK6 der Story)', async () => {
    antwort = liste([{ ...PLAN, armed: 'notArmed' }]);
    await oeffne();
    expect(zeileVon(PLAN.absPath).querySelector('.wf-runs-next').textContent).toBe('');
  });

  it('ein verfallener Termin steht mit «verfallen» beim letzten Lauf (AK4)', async () => {
    antwort = liste([
      {
        ...PLAN,
        lastRun: { ...PLAN.lastRun, origin: 'schedule' },
        skipped: { at: '2026-10-28T07:00:00Z', due: '2026-10-28T06:30' },
      },
    ]);
    await oeffne();
    const zeile = zeileVon(PLAN.absPath);
    expect(zeile.querySelector('.wf-runs-origin')).toBeNull();
    expect(zeile.querySelector('.wf-runs-skipped').textContent).toMatch(/^verfallen: .*06:30/);
  });

  it('ein älterer Verfall als der letzte Lauf wird nicht mehr gezeigt', async () => {
    antwort = liste([
      { ...PLAN, skipped: { at: '2026-10-27T07:00:00Z', due: '2026-10-27T06:30' } },
    ]);
    await oeffne();
    expect(zeileVon(PLAN.absPath).querySelector('.wf-runs-skipped')).toBeNull();
  });

  it('das Journal des letzten Laufs klappt auf: Zeile, Befehl, Pfad (AK3)', async () => {
    antwort = liste([PLAN]);
    await oeffne();
    const knopf = zeileVon(PLAN.absPath).querySelector('.wf-runs-journal-toggle');
    expect(knopf.textContent).toBe('Journal (2)');
    // Der Knopf steht beim letzten Lauf; der Text des Ergebnisses bleibt der des Hinweises.
    expect(knopf.closest('td').classList.contains('wf-runs-time')).toBe(true);
    expect(zeileVon(PLAN.absPath).querySelector('.wf-runs-result').textContent).toBe('erfolgreich');
    const journal = zeileVon(PLAN.absPath).nextElementSibling;
    expect(journal.classList.contains('wf-runs-journal')).toBe(true);
    expect(journal.hidden).toBe(true);
    expect(journal.querySelector('td').colSpan).toBe(8);
    knopf.click();
    expect(journal.hidden).toBe(false);
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    expect([...journal.querySelectorAll('li')].map((e) => e.textContent)).toEqual([
      'Zeile 8: append – Notizen/Ziel.md',
      'Zeile 9: create – Neu.md',
    ]);
    knopf.click();
    expect(journal.hidden).toBe(true);
  });

  it('ohne Journal kein Knopf, ein leeres Journal sagt «Keine Datei berührt» (AK6 der Story)', async () => {
    antwort = liste([
      { ...PLAN, lastRun: { at: '2026-10-28T06:00:00Z', status: 'ok' } },
      { ...PLAN, absPath: 'C:/b/Leer.md', lastRun: { ...PLAN.lastRun, journal: [] } },
      { ...B, scheduled: false, armed: 'notArmed', nextDue: null, skipped: null },
    ]);
    await oeffne();
    expect(zeileVon(PLAN.absPath).querySelector('.wf-runs-journal-toggle')).toBeNull();
    expect(zeileVon(B.absPath).querySelector('.wf-runs-journal-toggle')).toBeNull();
    const leer = zeileVon('C:/b/Leer.md');
    leer.querySelector('.wf-runs-journal-toggle').click();
    expect(leer.nextElementSibling.querySelector('.wf-runs-journal-empty').textContent).toBe(
      'Keine Datei berührt',
    );
  });

  it('der Schalter ruft das Kommando und die Seite zieht danach nach (AK1, AK5)', async () => {
    antwort = liste([{ ...PLAN, armed: 'notArmed', nextDue: null }]);
    await oeffne();
    const vorher = abfragen.length;
    const schalter = zeileVon(PLAN.absPath).querySelector('.wf-runs-arm');
    antwort = liste([PLAN]);
    schalter.checked = true;
    schalter.dispatchEvent(new Event('change'));
    await ruhe();
    await ruhe();
    expect(scharfAufrufe).toEqual([['C:/b/Plan.md', true]]);
    expect(abfragen.length).toBe(vorher + 1);
    expect(zeileVon(PLAN.absPath).querySelector('.wf-runs-arm').checked).toBe(true);
    // Entschärfen über denselben Schalter; «Starten» bleibt in der Zeile.
    const wieder = zeileVon(PLAN.absPath).querySelector('.wf-runs-arm');
    wieder.checked = false;
    wieder.dispatchEvent(new Event('change'));
    await ruhe();
    expect(scharfAufrufe.at(-1)).toEqual(['C:/b/Plan.md', false]);
    expect(zeileVon(PLAN.absPath).querySelector('.wf-runs-start')).not.toBeNull();
  });

  it('ein fremder Eintrag bekommt nie einen Schalter, auch mit Zeitplan (2h)', async () => {
    antwort = liste([
      {
        ...PLAN,
        absPath: 'D:/Zentral/F.md',
        relPath: 'F.md',
        foreign: true,
        sourceKey: 'zt',
        lastRun: null,
        runs: 0,
      },
    ]);
    await oeffne();
    const zeile = zeileVon('D:/Zentral/F.md');
    expect(zeile.querySelector('.wf-runs-arm')).toBeNull();
    expect(zeile.querySelector('.wf-runs-next').textContent).toBe('');
    expect(zeile.querySelector('.wf-runs-journal-toggle')).toBeNull();
  });
});
