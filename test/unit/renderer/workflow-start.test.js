// @vitest-environment jsdom
// 4T-002349 (Epic 3E-000184): Der Start eines Workflows im Fenster
// (src/renderer/modules/workflows/workflow-start.js).
//
// Geprüft wird die Vorbereitung vor dem ersten Schritt (Prüfen vor Laufen,
// Eingabe-Dialoge samt Vorlagen und verschachtelter Workflows, E2), die Sperre
// je Fenster (A2), der Hinweis beim Abbruch (A1) und der Lauf-Stand. Brücke,
// Dialog-Kette, Statusleiste, Fenster-Handgriffe und Ordner-Liste sind Attrappen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
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
// 4T-002424: Bestätigung der Lösch-Ziele, Frage von `confirm` und das
// Schließen der Reiter vor `delete` als steuerbare Attrappen.
const bestaetigeLoeschZiele = vi.fn(async () => true);
const frageJaNein = vi.fn(async () => true);
const schliesseVorDemLoeschen = vi.fn(async () => true);
vi.mock('../../../src/renderer/modules/workflows/workflow-window.js', () => ({
  bestaetigeLoeschZiele: (...a) => bestaetigeLoeschZiele(...a),
  frageJaNein: (...a) => frageJaNein(...a),
  schliesseVorDemLoeschen: (...a) => schliesseVorDemLoeschen(...a),
  flushPendingBuffers: async () => {},
  runWindowAction: async (a) => ({ ok: true, line: a.line, keyword: a.keyword, effect: {} }),
}));
let liste = { workflows: [] };
vi.mock('../../../src/renderer/modules/workflows/workflow-folder-list.js', () => ({
  getWorkflowFolderList: async () => liste,
}));
let offenerReiter = null;
vi.mock('../../../src/renderer/modules/task-query-actions.js', () => ({
  findOpenTab: () => offenerReiter,
}));
vi.mock('../../../src/renderer/modules/editor/editor.js', () => ({ paneEditors: [] }));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { panes: [{ activeIndex: 5, tabs: [] }], areaPath: 'C:/b' },
  activeTab: () => null,
}));

const dateien = {};
const schritte = [];
const laeufe = [];
let schrittAntwort = null;
Object.assign(window.api, {
  dirname: (p) => p.slice(0, p.lastIndexOf('/')),
  readFile: vi.fn(async (p) =>
    p in dateien ? { ok: true, content: dateien[p] } : { ok: false, error: 'ENOENT' },
  ),
  templatesRead: async (p) =>
    p in dateien ? { ok: true, content: dateien[p] } : { ok: false, error: 'x' },
  workflowStep: async (pfad, step) => {
    schritte.push({ pfad, step });
    if (schrittAntwort) return schrittAntwort(step);
    return { ok: true, line: step.line, keyword: step.keyword, effect: { kind: 'created' } };
  },
  workflowRecordRun: async (pfad, run) => {
    laeufe.push({ pfad, run });
    return { ok: true };
  },
});

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { initWorkflowStart, laeuftWorkflow, starteWorkflow } =
  await import('../../../src/renderer/modules/workflows/workflow-start.js');
const { rueckfragenZuruecksetzen } =
  await import('../../../src/renderer/modules/workflows/workflow-pruefung.js');

const W = (name, ...zeilen) =>
  ['---', 'workflow: true', `name: ${name}`, '---', '', '```workflow', ...zeilen, '```', ''].join(
    '\n',
  );
// Schlüssel der Engine für {{prompt:Frage}} ohne Vorgabe.
const P = (frage) => `prompt:${frage}:`;
const hinweisTexte = () => showStatusbarHint.mock.calls.map((c) => c[1] && c[1].text);
const makro = vi.fn(async () => ({ ok: true }));
const kommando = vi.fn(() => true);

beforeEach(() => {
  for (const k of Object.keys(dateien)) delete dateien[k];
  schritte.length = 0;
  laeufe.length = 0;
  schrittAntwort = null;
  offenerReiter = null;
  liste = { workflows: [] };
  aus.clear();
  collectAnswers.mockReset();
  collectAnswers.mockImplementation(async (inputs) =>
    Object.fromEntries(inputs.map((i) => [i.key, `Antwort ${i.question}`])),
  );
  showStatusbarHint.mockReset();
  bestaetigeLoeschZiele.mockReset();
  bestaetigeLoeschZiele.mockResolvedValue(true);
  frageJaNein.mockReset();
  frageJaNein.mockResolvedValue(true);
  schliesseVorDemLoeschen.mockReset();
  schliesseVorDemLoeschen.mockResolvedValue(true);
  window.api.clipboardReadText = () => '';
  makro.mockClear();
  kommando.mockClear();
  rueckfragenZuruecksetzen();
  initWorkflowStart({ executeCommand: kommando, runMacro: makro });
});

describe('starteWorkflow', () => {
  it('läuft einen Workflow und verbucht den Lauf', async () => {
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "a.md"', 'macro "M"', 'command view.modeSplit'),
    });
    expect(ok).toBe(true);
    expect(schritte.map((s) => s.step.keyword)).toEqual(['create']);
    expect(schritte[0].pfad).toBe('C:/b/A.md');
    expect(makro).toHaveBeenCalledWith('M', 1);
    expect(kommando).toHaveBeenCalledWith('view.modeSplit');
    // 4T-002421: Das Journal geht mit; die Attrappe meldet keine Pfade, und
    // eine Herkunft schickt der Start von Hand nicht (der Hauptprozess setzt manual).
    expect(laeufe).toEqual([
      { pfad: 'C:/b/A.md', run: { status: 'ok', startedAt: expect.any(Number), journal: [] } },
    ]);
    expect(laeuftWorkflow()).toBe(false);
  });

  it('ein Befund vor dem Lauf lässt keinen Schritt laufen und nennt die Zeile (AK4)', async () => {
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "a.md"', 'fliege "x"'),
    });
    expect(ok).toBe(false);
    expect(schritte).toEqual([]);
    expect(hinweisTexte()).toEqual([
      "Workflow ‹A› abgebrochen in Zeile 8: Unbekannter Befehl 'fliege'",
    ]);
    expect(laeufe[0].run).toMatchObject({ status: 'failed', line: 8, code: 'unknownCommand' });
  });

  it('der Abbruch eines Dialogs lässt keinen Schritt laufen und meldet keinen Fehler (AK4)', async () => {
    collectAnswers.mockResolvedValue(null);
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "a.md"', 'create "{{prompt:Name?}}.md"'),
    });
    expect(ok).toBe(false);
    expect(schritte).toEqual([]);
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(laeufe[0].run).toEqual({ status: 'canceled', startedAt: expect.any(Number) });
  });

  it('erhebt die Eingaben eingesetzter Vorlagen vor dem ersten Schritt (S-a)', async () => {
    dateien['Tag.md'] = '# {{prompt:Thema?}}';
    const reihenfolge = [];
    collectAnswers.mockImplementation(async (inputs) => {
      reihenfolge.push(`dialog:${inputs.map((i) => i.question).join(',')}`);
      return Object.fromEntries(inputs.map((i) => [i.key, 'Wetter']));
    });
    schrittAntwort = (step) => {
      reihenfolge.push(`schritt:${step.keyword}`);
      return { ok: true, line: step.line, keyword: step.keyword, effect: {} };
    };
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "a.md" from-template "Tag.md"'),
    });
    expect(reihenfolge).toEqual(['dialog:Thema?', 'schritt:create']);
    expect(schritte[0].step.source).toMatchObject({ kind: 'template', text: '# Wetter' });
  });

  it('weist einen zweiten Start im selben Fenster mit Hinweis ab (AK6)', async () => {
    let freigeben;
    schrittAntwort = (step) =>
      new Promise((resolve) => {
        freigeben = () => resolve({ ok: true, line: step.line, keyword: step.keyword, effect: {} });
      });
    const erster = starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'create "a.md"') });
    expect(laeuftWorkflow()).toBe(true);
    expect(await starteWorkflow({ path: 'C:/b/B.md', text: W('B', 'notify "x"') })).toBe(false);
    expect(hinweisTexte()).toEqual(['Es läuft bereits ein Workflow: ‹A›']);
    await vi.waitFor(() => expect(freigeben).toBeTypeOf('function'));
    freigeben();
    expect(await erster).toBe(true);
    expect(laeuftWorkflow()).toBe(false);
  });

  it('löst die Sperre nach einem Fehlschlag und nach einer Ausnahme', async () => {
    schrittAntwort = (step) => ({
      ok: false,
      line: step.line,
      keyword: step.keyword,
      code: 'textNotFound',
      detail: {},
    });
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'replace "a.md" "x" "y"') });
    expect(laeuftWorkflow()).toBe(false);
    collectAnswers.mockRejectedValue(new Error('kaputt'));
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'create "{{prompt:N?}}.md"') }),
    ).toBe(false);
    expect(laeuftWorkflow()).toBe(false);
    expect(hinweisTexte().at(-1)).toBe('Workflow ‹A› abgebrochen: Unerwarteter Fehler');
    fehler.mockRestore();
  });

  it('meldet einen Fehlschlag mit Zeile und Grund und verbucht ihn (AK7)', async () => {
    schrittAntwort = (step) => ({
      ok: false,
      line: step.line,
      keyword: step.keyword,
      code: 'targetExists',
      detail: { path: 'a.md' },
    });
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'notify "vorher"', 'create "a.md"') });
    expect(hinweisTexte()).toEqual([
      'vorher',
      "Workflow ‹A› abgebrochen in Zeile 8: Das Ziel 'a.md' gibt es schon",
    ]);
    expect(showStatusbarHint.mock.calls[0][1]).toMatchObject({ error: false, duration: 4000 });
    expect(showStatusbarHint.mock.calls[1][1]).toMatchObject({ error: true, duration: 6000 });
    expect(laeufe[0].run).toMatchObject({ status: 'failed', line: 8, code: 'targetExists' });
  });

  it('stop beendet den Lauf mit eigenem Hinweis und Lauf-Stand stopped', async () => {
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'stop "Nichts zu tun"', 'create "a.md"'),
    });
    expect(schritte).toEqual([]);
    expect(hinweisTexte()).toEqual(['Workflow ‹A› beendet in Zeile 7: Nichts zu tun']);
    expect(laeufe[0].run).toMatchObject({ status: 'stopped', line: 7 });
  });

  it('liest den ungespeicherten Stand eines offenen Reiters vor der Platte', async () => {
    dateien['C:/b/A.md'] = W('A', 'create "platte.md"');
    offenerReiter = { paneIdx: 0, tabIdx: 1, tab: { content: W('A', 'create "puffer.md"') } };
    await starteWorkflow({ path: 'C:/b/A.md' });
    expect(schritte[0].step.args[0]).toBe('puffer.md');
    expect(window.api.readFile).not.toHaveBeenCalled();
    offenerReiter = null;
    await starteWorkflow({ path: 'C:/b/A.md' });
    expect(schritte[1].step.args[0]).toBe('platte.md');
  });

  it('eine Datei ohne Kennzeichen ist kein Workflow', async () => {
    await starteWorkflow({ path: 'C:/b/Notiz.md', text: '# Notiz' });
    expect(hinweisTexte()).toEqual([
      'Workflow ‹Notiz› abgebrochen: Kein Workflow; im Dateikopf fehlt workflow: true',
    ]);
    expect(laeufe).toEqual([]);
  });

  it('im Aus-Zustand der Erweiterung startet nichts', async () => {
    aus.add('workflows');
    expect(await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'create "a.md"') })).toBe(false);
    expect(schritte).toEqual([]);
    expect(showStatusbarHint).not.toHaveBeenCalled();
  });
});

describe('verschachtelte Workflows (E2, E5, E1)', () => {
  const eintrag = (name) => ({ name, relPath: `${name}.md`, absPath: `C:/b/W/${name}.md` });

  it('erhebt die Eingaben des Unter-Workflows vor dem ersten Schritt und verbucht beide', async () => {
    liste = { workflows: [eintrag('B')] };
    dateien['C:/b/W/B.md'] = W('B', 'create "{{prompt:Name?}}.md"');
    const reihenfolge = [];
    collectAnswers.mockImplementation(async (inputs) => {
      reihenfolge.push('dialog');
      return Object.fromEntries(inputs.map((i) => [i.key, 'Neu']));
    });
    schrittAntwort = (step) => {
      reihenfolge.push(`schritt:${step.args[0]}`);
      return { ok: true, line: step.line, keyword: step.keyword, effect: {} };
    };
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "a.md"', 'workflow "B"', 'create "z.md"'),
    });
    expect(ok).toBe(true);
    expect(reihenfolge).toEqual(['dialog', 'schritt:a.md', 'schritt:Neu.md', 'schritt:z.md']);
    expect(schritte[1].pfad).toBe('C:/b/W/B.md');
    expect(laeufe.map((l) => [l.pfad, l.run.status])).toEqual([
      ['C:/b/W/B.md', 'ok'],
      ['C:/b/A.md', 'ok'],
    ]);
  });

  it('stellt eine gleiche Frage im ganzen Baum nur einmal', async () => {
    liste = { workflows: [eintrag('B')] };
    dateien['C:/b/W/B.md'] = W('B', 'create "{{prompt:Name?}}.md"');
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "{{prompt:Name?}}-a.md"', 'workflow "B"'),
    });
    expect(collectAnswers).toHaveBeenCalledTimes(1);
    expect(collectAnswers.mock.calls[0][0].map((i) => i.key)).toEqual([P('Name?')]);
  });

  it('ein Befund im Unter-Workflow verhindert den ganzen Lauf', async () => {
    liste = { workflows: [eintrag('B')] };
    dateien['C:/b/W/B.md'] = W('B', 'fliege "x"');
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'create "a.md"', 'workflow "B"') });
    expect(schritte).toEqual([]);
    expect(hinweisTexte()).toEqual([
      "Workflow ‹A› abgebrochen in Zeile 8: Workflow ‹B› abgebrochen in Zeile 7: Unbekannter Befehl 'fliege'",
    ]);
  });

  it('weist einen indirekten Kreis als Selbstaufruf ab (E5)', async () => {
    liste = { workflows: [eintrag('A'), eintrag('B')] };
    dateien['C:/b/W/A.md'] = W('A', 'workflow "B"');
    dateien['C:/b/W/B.md'] = W('B', 'notify "x"', 'workflow "A"');
    await starteWorkflow({ path: 'C:/b/W/A.md' });
    expect(hinweisTexte()).toEqual([
      'Workflow ‹A› abgebrochen in Zeile 7: Workflow ‹B› abgebrochen in Zeile 8: Ein Workflow darf sich nicht selbst aufrufen',
    ]);
  });

  it('weist zwei gleichnamige Workflows als mehrdeutig ab (E1)', async () => {
    liste = {
      workflows: [
        { name: 'B', relPath: 'x/B.md', absPath: 'C:/b/W/x/B.md' },
        { name: 'B', relPath: 'y/B.md', absPath: 'C:/b/W/y/B.md' },
      ],
    };
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'workflow "B"') });
    expect(hinweisTexte()).toEqual([
      "Workflow ‹A› abgebrochen in Zeile 7: Mehrdeutig: mehrere Workflows heißen 'B'",
    ]);
  });

  it('weist einen unbekannten Workflow ab', async () => {
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'workflow "Fehlt"') });
    expect(hinweisTexte()).toEqual([
      "Workflow ‹A› abgebrochen in Zeile 7: Unbekannter Workflow 'Fehlt'",
    ]);
  });

  it('weist eine Kette über fünf Ebenen ab (A4)', async () => {
    const namen = ['W1', 'W2', 'W3', 'W4', 'W5'];
    liste = { workflows: namen.map(eintrag) };
    namen.forEach((n, i) => {
      dateien[`C:/b/W/${n}.md`] =
        i < namen.length - 1 ? W(n, `workflow "${namen[i + 1]}"`) : W(n, 'notify "x"');
    });
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'workflow "W1"') });
    expect(schritte).toEqual([]);
    expect(hinweisTexte()[0]).toContain(
      'Aufrufe zu tief verschachtelt; erlaubt sind höchstens 5 Ebenen',
    );
    liste = { workflows: namen.slice(0, 4).map(eintrag) };
    dateien['C:/b/W/W4.md'] = W('W4', 'notify "tief"');
    showStatusbarHint.mockReset();
    expect(await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'workflow "W1"') })).toBe(true);
    expect(hinweisTexte()).toEqual(['tief']);
  });
});

// 4T-002424 (Stories 4S-001135 und 4S-001136): Bestätigung der Lösch-Ziele vor
// dem ersten Schritt (P1), `confirm` (P4) und `{{clipboard}}` beim Start.
describe('Pflege-Befehle und Zwischenablage beim Start', () => {
  const eintrag = (name) => ({ name, relPath: `${name}.md`, absPath: `C:/b/W/${name}.md` });

  it('eine Bestätigung nennt alle Ziele des Laufs samt aufgerufener Workflows, vor dem ersten Schritt', async () => {
    liste = { workflows: [eintrag('B')] };
    dateien['C:/b/W/B.md'] = W('B', 'delete "Unter/Alt.md"', 'delete "Entwurf.md"');
    const reihenfolge = [];
    bestaetigeLoeschZiele.mockImplementation(async (name, ziele) => {
      reihenfolge.push(`bestaetigung:${name}:${ziele.join(',')}`);
      return true;
    });
    schrittAntwort = (step) => {
      reihenfolge.push(`schritt:${step.keyword}:${step.args[0]}`);
      return { ok: true, line: step.line, keyword: step.keyword, effect: {} };
    };
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'delete "Entwurf.md"', 'workflow "B"'),
    });
    expect(ok).toBe(true);
    expect(bestaetigeLoeschZiele).toHaveBeenCalledTimes(1);
    expect(reihenfolge).toEqual([
      'bestaetigung:A:Entwurf.md,Unter/Alt.md',
      'schritt:delete:Entwurf.md',
      'schritt:delete:Unter/Alt.md',
      'schritt:delete:Entwurf.md',
    ]);
    expect(schliesseVorDemLoeschen).toHaveBeenCalledWith('Entwurf.md');
  });

  it('«Nein» lässt keinen Schritt laufen und verbucht canceled (AK1)', async () => {
    bestaetigeLoeschZiele.mockResolvedValue(false);
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "Neu.md"', 'delete "Alt.md"'),
    });
    expect(ok).toBe(false);
    expect(schritte).toEqual([]);
    expect(showStatusbarHint).not.toHaveBeenCalled();
    expect(laeufe).toEqual([
      { pfad: 'C:/b/A.md', run: { status: 'canceled', startedAt: expect.any(Number) } },
    ]);
    expect(laeuftWorkflow()).toBe(false);
  });

  it('ohne delete fragt keine Bestätigung', async () => {
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'create "Neu.md"') });
    expect(bestaetigeLoeschZiele).not.toHaveBeenCalled();
  });

  it('«Abbrechen» beim Schließen eines Reiters vor delete beendet den Lauf mit closeCanceled', async () => {
    schliesseVorDemLoeschen.mockResolvedValue(false);
    const ok = await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'delete "Alt.md"') });
    expect(ok).toBe(false);
    expect(schritte).toEqual([]);
    expect(laeufe[0].run).toMatchObject({ status: 'failed', line: 7, code: 'closeCanceled' });
  });

  it('confirm mit «Ja» läuft weiter', async () => {
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'confirm "Weiter?"', 'create "Neu.md"'),
    });
    expect(ok).toBe(true);
    expect(frageJaNein).toHaveBeenCalledWith('A', 'Weiter?');
    expect(schritte.map((s) => s.step.keyword)).toEqual(['create']);
  });

  it('confirm mit «Nein» beendet den Lauf ohne Fehlschlag in Zeile N (AK4)', async () => {
    frageJaNein.mockResolvedValue(false);
    const ok = await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'create "Neu.md"', 'confirm "Weiter?"', 'create "Danach.md"'),
    });
    expect(ok).toBe(false);
    expect(schritte.map((s) => s.step.args[0])).toEqual(['Neu.md']);
    expect(hinweisTexte()).toEqual([
      'Workflow ‹A› beendet in Zeile 8: «Weiter?» mit Nein beantwortet',
    ]);
    expect(showStatusbarHint.mock.calls[0][1].error).toBe(false);
    expect(laeufe[0].run).toMatchObject({ status: 'stopped', line: 8 });
    expect(laeufe[0].run.code).toBeUndefined();
  });

  it('ein Lauf nach Zeitplan weist delete und confirm vor dem ersten Schritt ab, ohne Dialog', async () => {
    for (const zeile of ['delete "Alt.md"', 'confirm "Weiter?"']) {
      laeufe.length = 0;
      await starteWorkflow({ path: 'C:/b/A.md', text: W('A', zeile), origin: 'schedule' });
      expect(laeufe[0].run, zeile).toMatchObject({ status: 'failed', code: 'manualOnly' });
    }
    expect(bestaetigeLoeschZiele).not.toHaveBeenCalled();
    expect(frageJaNein).not.toHaveBeenCalled();
    expect(schritte).toEqual([]);
  });

  it('{{clipboard}} wird zum Text der Zwischenablage, auch in einer Vorlage (4S-001136, AK1, AK5)', async () => {
    const kopiert = 'Zeile 1\nÄrger mit "Anführungszeichen"';
    window.api.clipboardReadText = () => kopiert;
    dateien['Tag.md'] = 'Inhalt: {{clipboard}}';
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'replace "x.md" "HIER" "{{clipboard}}"', 'create "y.md" from-template "Tag.md"'),
    });
    expect(schritte[0].step.args[2]).toBe(kopiert);
    expect(schritte[1].step.source).toMatchObject({ kind: 'template', text: `Inhalt: ${kopiert}` });
  });

  it('{{clipboard}} bleibt in from-section wörtlich (Bestand, O2)', async () => {
    window.api.clipboardReadText = () => 'Kopie';
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'append "x.md" from-section "{{clipboard}}"'),
    });
    // Der Abschnitts-Name wird gefüllt, der Inhalt des Abschnitts liest der
    // Hauptprozess erst beim Schritt und übernimmt ihn wörtlich.
    expect(schritte[0].step.source).toEqual({ kind: 'section', name: 'Kopie' });
  });

  it('eine leere oder nicht lesbare Zwischenablage ergibt leeren Text, kein Fehlschlag (AK4)', async () => {
    window.api.clipboardReadText = () => '';
    expect(
      await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'notify "[{{clipboard}}]"') }),
    ).toBe(true);
    window.api.clipboardReadText = () => {
      throw new Error('gesperrt');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'notify "[{{clipboard}}]"') }),
    ).toBe(true);
    expect(hinweisTexte()).toEqual(['[]', '[]']);
  });

  it('jeder Lauf nimmt den Inhalt zu seinem Zeitpunkt, auch nach Zeitplan (4S-001136, AK2, AK6)', async () => {
    window.api.clipboardReadText = () => 'eins';
    await starteWorkflow({ path: 'C:/b/A.md', text: W('A', 'notify "{{clipboard}}"') });
    window.api.clipboardReadText = () => 'zwei';
    await starteWorkflow({
      path: 'C:/b/A.md',
      text: W('A', 'notify "{{clipboard}}"'),
      origin: 'schedule',
    });
    expect(hinweisTexte()).toEqual(['eins', 'zwei']);
  });
});
