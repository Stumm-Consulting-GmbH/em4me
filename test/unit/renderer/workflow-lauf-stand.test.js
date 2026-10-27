// @vitest-environment jsdom
// 4T-002350 (Epic 3E-000184): Hinweis und Seite zeigen denselben Lauf-Stand
// (src/renderer/modules/workflows/workflow-lauf-stand.js), Story 4S-001106,
// AK1 und AK3; A1 der Konzept-Stufe.
//
// Gemessen am ECHTEN Start (workflow-start.js) und an der ECHTEN Ablage des
// Hauptprozesses: Die Attrappe der Brücke `workflowRecordRun` prüft die Angaben
// mit `normalizeRun` (src/main/workflows/workflow-run-state.js) und schreibt sie
// mit `recordWorkflowRun` in einen Begleitdatei-Container; gelesen wird mit
// `getWorkflowRun` wie im Kanal der Seite. So fällt jeder Bruch der Form
// zwischen Fenster und Hauptprozess hier auf. Attrappen sind wie in
// workflow-start.test.js Dialog-Kette, Statusleiste, Fenster-Handgriffe und
// Ordner-Liste.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

const require = createRequire(import.meta.url);
const { normalizeRun } = require('../../../src/main/workflows/workflow-run-state.js');
const mddStore = require('../../../src/main/documents/mdd-store.js');

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
const collectAnswers = vi.fn();
vi.mock('../../../src/renderer/modules/templates.js', () => ({
  collectAnswers: (...a) => collectAnswers(...a),
  folderDisplayFor: () => '',
  templateDocumentContext: () => ({ file: '', area: 'Bereich' }),
}));
const showStatusbarHint = vi.fn();
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (...a) => showStatusbarHint(...a),
}));
vi.mock('../../../src/renderer/modules/workflows/workflow-window.js', () => ({
  flushPendingBuffers: async () => {},
  runWindowAction: async (a) => ({ ok: true, line: a.line, keyword: a.keyword, effect: {} }),
}));
let liste = { workflows: [] };
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => liste,
}));
vi.mock('../../../src/renderer/modules/task-query-actions.js', () => ({ findOpenTab: () => null }));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [] }));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { panes: [{ activeIndex: 0, tabs: [] }], areaPath: 'C:/b' },
  activeTab: () => null,
}));

// Begleitdateien je Workflow-Pfad, wie der Hauptprozess sie hielte.
const begleit = new Map();
const abgewiesen = [];
let schrittAntwort = null;
Object.assign(window.api, {
  dirname: (p) => p.slice(0, p.lastIndexOf('/')),
  readFile: async () => ({ ok: false, error: 'ENOENT' }),
  templatesRead: async () => ({ ok: false, error: 'x' }),
  workflowStep: async (_pfad, step) =>
    schrittAntwort
      ? schrittAntwort(step)
      : { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } },
  workflowRecordRun: async (pfad, run) => {
    const sauber = normalizeRun(run);
    if (!sauber) {
      abgewiesen.push(run);
      return { ok: false, code: 'invalidStep' };
    }
    const container = begleit.get(pfad) || mddStore.emptyContainer();
    mddStore.recordWorkflowRun(container, sauber, Date.now());
    begleit.set(pfad, container);
    return { ok: true };
  },
});

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { initWorkflowStart, starteWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-start.js');
const { rueckfragenZuruecksetzen } =
  await import('../../../src/renderer/modules/workflows/workflow-pruefung.js');
const stand = await import('../../../src/renderer/modules/workflows/workflow-lauf-stand.js');

const W = (name, ...zeilen) =>
  ['---', 'workflow: true', `name: ${name}`, '---', '', '```workflow', ...zeilen, '```', ''].join(
    '\n',
  );
const PFAD = 'C:/b/Workflows/Anlegen.md';
const hinweise = () => showStatusbarHint.mock.calls.map((c) => c[1] && c[1].text);
const lastRun = (pfad = PFAD) => mddStore.getWorkflowRun(begleit.get(pfad)).lastRun;

beforeEach(() => {
  begleit.clear();
  abgewiesen.length = 0;
  schrittAntwort = null;
  liste = { workflows: [] };
  collectAnswers.mockReset();
  collectAnswers.mockImplementation(async (inputs) =>
    Object.fromEntries(inputs.map((i) => [i.key, 'Antwort'])),
  );
  showStatusbarHint.mockReset();
  rueckfragenZuruecksetzen();
  stand.laufStandZuruecksetzen();
  initWorkflowStart({ executeCommand: () => true, runMacro: async () => ({ ok: true }) });
});

describe('Form zwischen Fenster und Hauptprozess', () => {
  it('der Hauptprozess nimmt jeden Lauf an und zählt weiter (AK4 der Story)', async () => {
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"') });
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"') });
    expect(abgewiesen).toEqual([]);
    const gelesen = mddStore.getWorkflowRun(begleit.get(PFAD));
    expect(gelesen.runs).toBe(2);
    expect(gelesen.lastRun).toMatchObject({ status: 'ok' });
    expect(gelesen.lastRun.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });

  it('auch der Abbruch eines Dialogs vor dem ersten Schritt wird angenommen', async () => {
    collectAnswers.mockResolvedValue(null);
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "{{prompt:Titel?}}.md"') });
    expect(abgewiesen).toEqual([]);
    expect(lastRun()).toMatchObject({ status: 'canceled' });
    expect(stand.ergebnisText(PFAD, lastRun())).toBe(
      'Eingabe abgebrochen, kein Schritt ausgeführt',
    );
  });
});

describe('Hinweis und Seite zeigen denselben Stand (AK3 der Story)', () => {
  it('Abbruch im dritten Schritt: dieselbe Zeile und derselbe Grund', async () => {
    schrittAntwort = (step) =>
      step.line === 9
        ? {
            ok: false,
            line: 9,
            keyword: step.keyword,
            code: 'fileMissing',
            detail: { path: 'Workflow-Fehlt.md' },
          }
        : { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } };
    const ok = await starteWorkflow({
      path: PFAD,
      text: W('Anlegen', 'create "Eins.md"', 'create "Zwei.md"', 'create "Drei.md"'),
    });
    expect(ok).toBe(false);
    const [hinweis] = hinweise();
    expect(hinweis).toBe(
      "Workflow ‹Anlegen› abgebrochen in Zeile 9: Datei 'Workflow-Fehlt.md' nicht gefunden",
    );
    expect(lastRun()).toMatchObject({ status: 'failed', line: 9, code: 'fileMissing' });
    const seite = stand.ergebnisText(PFAD, lastRun());
    expect(seite).toBe("abgebrochen in Zeile 9: Datei 'Workflow-Fehlt.md' nicht gefunden");
    expect(hinweis.endsWith(seite)).toBe(true);
  });

  it('ein Befund vor dem Lauf steht mit Zeile und Grund auf der Seite wie im Hinweis', async () => {
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"', 'fliege "x"') });
    const [hinweis] = hinweise();
    expect(hinweis).toBe("Workflow ‹Anlegen› abgebrochen in Zeile 8: Unbekannter Befehl 'fliege'");
    expect(hinweis.endsWith(stand.ergebnisText(PFAD, lastRun()))).toBe(true);
  });

  it('ein Befund der ganzen Datei landet ohne Zeile in der Begleitdatei', async () => {
    // Nachzug vom 2026-10-23: `normalizeRun` nimmt `failed` ohne Zeile an.
    const ohneBlock = ['---', 'workflow: true', 'name: Anlegen', '---', '', 'Nur Text.', ''].join(
      '\n',
    );
    await starteWorkflow({ path: PFAD, text: ohneBlock });
    expect(abgewiesen).toEqual([]);
    expect(lastRun()).toMatchObject({ status: 'failed', code: 'noBlock' });
    expect(lastRun().line ?? null).toBe(null);
    const [hinweis] = hinweise();
    expect(hinweis).toBe('Workflow ‹Anlegen› abgebrochen: Kein workflow-Block in der Datei');
    const seite = stand.ergebnisText(PFAD, lastRun());
    expect(seite).toBe('abgebrochen: Kein workflow-Block in der Datei');
    expect(hinweis.endsWith(seite)).toBe(true);
  });

  it('der Pfad wird ohne Rücksicht auf Schreibweise und Trenner zugeordnet', async () => {
    schrittAntwort = (step) => ({
      ok: false,
      line: step.line,
      keyword: step.keyword,
      code: 'targetExists',
      detail: { path: 'a.md' },
    });
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"') });
    const anders = 'c:\\b\\Workflows\\ANLEGEN.md';
    expect(stand.laufGrund(anders, lastRun())).toBe("Das Ziel 'a.md' gibt es schon");
  });

  it('meldet jeden verbuchten Lauf den Zuhörern, auch einen gelungenen', async () => {
    const gemeldet = [];
    const ab = stand.onLaufVerbucht((p) => gemeldet.push(p));
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"') });
    ab();
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"') });
    expect(gemeldet).toEqual([PFAD]);
  });
});

describe('Grund allein aus dem Code (Neustart, anderes Fenster)', () => {
  it('setzt «…» an die Einzel-Angaben eines Laufzeit-Codes', () => {
    const lauf = { at: '2026-10-23T08:00:00Z', status: 'failed', line: 9, code: 'fileMissing' };
    expect(stand.ergebnisText(PFAD, lauf)).toBe("abgebrochen in Zeile 9: Datei '…' nicht gefunden");
  });

  it('ein gemerktes Ergebnis eines anderen Laufs gilt nicht', async () => {
    schrittAntwort = (step) => ({
      ok: false,
      line: step.line,
      keyword: step.keyword,
      code: 'fileMissing',
      detail: { path: 'x.md' },
    });
    await starteWorkflow({ path: PFAD, text: W('Anlegen', 'create "a.md"') });
    const spaeter = { ...lastRun(), at: '2030-01-01T00:00:00Z' };
    expect(stand.laufGrund(PFAD, spaeter)).toBe("Datei '…' nicht gefunden");
  });

  it('nimmt den Text eines Befund-Codes, wenn es keinen Laufzeit-Text gibt', () => {
    expect(stand.grundAusCode('unknownCommand')).toBe("Unbekannter Befehl '…'");
    expect(stand.grundAusCode('noBlock')).toBe('Kein workflow-Block in der Datei');
  });

  it('nennt beim Abbruch in einem aufgerufenen Workflow allein diese Tatsache', () => {
    expect(stand.grundAusCode('workflowFailed')).toBe('Abbruch in einem aufgerufenen Workflow');
  });

  it('ein Code ohne Text erscheint als Code und meldet sich in der Konsole', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(stand.grundAusCode('gibtEsNicht')).toBe('gibtEsNicht');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('nennt ohne Zeile nur den Grund, und ein unbekannter Status bleibt erkennbar', () => {
    const ohne = { at: '2026-10-23T08:00:00Z', status: 'failed', code: 'noBlock' };
    expect(stand.ergebnisText(PFAD, ohne)).toBe('abgebrochen: Kein workflow-Block in der Datei');
    expect(stand.ergebnisText(PFAD, { at: 'x', status: 'seltsam' })).toBe('unbekanntes Ergebnis');
  });

  it('formatiert den Zeitpunkt in der Sprache der Oberfläche', () => {
    expect(stand.zeitpunktText('2026-10-23T08:15:30Z')).toMatch(/23\.10\.2026/);
    expect(stand.zeitpunktText('kaputt')).toBe('kaputt');
  });
});
