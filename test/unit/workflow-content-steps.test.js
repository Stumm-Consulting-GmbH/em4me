// 4T-002348 (Epic 3E-000184): Die Inhalts- und Dateikopf-Befehle der Workflows
// im Hauptprozess auf dem Weg über die Platte (AK2 des Tasks, Story 4S-001103).
//
// Bestands-Lesungen: Schreiben mit Historie nach dem Vorbild
// `task:applyLineEdit` (src/main/ipc/index-views.js), die Historie über
// `resolveHistoryFor`, `readPreviousTextFor`, `recordMddOnSave` als Attrappen;
// die Quellen-Regel O1 (Puffer-Stand vor der Platte) über `bufferTextFor` des
// Index. Die Weiche zum Puffer prüft `workflow-buffer-route.test.js`.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const WORKFLOW = [
  '---',
  'workflow: true',
  '---',
  '## Eintrag',
  '',
  '- neuer Eintrag',
  '',
  '## Doppelt',
  'a',
  '## Doppelt',
  'b',
  '',
  '```workflow',
  'append "Ziel.md" from-section "Eintrag"',
  '```',
  '',
].join('\n');

function welt({ historie = false, puffer = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-inhalt-'));
  tmpDirs.push(root);
  const historien = [];
  const backlinks = {
    bufferTextFor: (p) => (Object.prototype.hasOwnProperty.call(puffer, p) ? puffer[p] : null),
    bufferOwnerFor: () => null,
  };
  const schritte = createWorkflowContentSteps({
    windows: new Map(),
    backlinks,
    resolveHistoryFor: async () => ({ effective: historie }),
    readPreviousTextFor: async (p) => fs.readFileSync(p, 'utf8'),
    recordMddOnSave: async (_owner, p, vorher, nachher) => historien.push({ p, vorher, nachher }),
    bufferRequests: { request: async () => ({ ok: false, code: 'bufferUnavailable' }) },
  });
  const abs = (rel) => path.join(root, ...rel.split('/'));
  const schreibe = (rel, inhalt) => {
    fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
    fs.writeFileSync(abs(rel), inhalt, 'utf8');
  };
  const lies = (rel) => fs.readFileSync(abs(rel), 'utf8');
  schreibe('Workflows/Ablauf.md', WORKFLOW);
  const ctx = {
    root,
    owner: {},
    event: { sender: { id: 1 } },
    workflowAbs: abs('Workflows/Ablauf.md'),
  };
  const lauf = (keyword, args, extra = {}) =>
    schritte.runContentStep(ctx, {
      line: 14,
      keyword,
      args,
      source: null,
      position: null,
      ...extra,
    });
  return { root, abs, schreibe, lies, lauf, historien, puffer };
}

const QUELLEN = [
  ['from-section', { kind: 'section', name: 'Eintrag' }],
  ['from-file', { kind: 'file', path: 'Baustein.md' }],
  ['from-template', { kind: 'template', path: 'Tag.md', text: '- neuer Eintrag' }],
];

describe('append und insert aus jeder der drei Quellen (AK2)', () => {
  it.each(QUELLEN)('append %s', async (_name, source) => {
    const w = welt();
    w.schreibe('Ziel.md', '# Ziel\n');
    w.schreibe('Baustein.md', '- neuer Eintrag\n');
    const res = await w.lauf('append', ['Ziel.md'], { source });
    expect(res).toEqual({
      ok: true,
      effect: { kind: 'edited', paths: [w.abs('Ziel.md')], via: 'disk' },
    });
    expect(w.lies('Ziel.md')).toBe('# Ziel\n- neuer Eintrag\n');
  });

  it.each(QUELLEN)('insert under %s', async (_name, source) => {
    const w = welt();
    w.schreibe('Ziel.md', '# Ziel\n## Protokoll\nalt\n');
    w.schreibe('Baustein.md', '- neuer Eintrag\n');
    await w.lauf('insert', ['Ziel.md'], {
      source,
      position: { kind: 'under', heading: 'Protokoll' },
    });
    expect(w.lies('Ziel.md')).toBe('# Ziel\n## Protokoll\n- neuer Eintrag\nalt\n');
  });

  it.each(QUELLEN)('insert at-start %s', async (_name, source) => {
    const w = welt();
    w.schreibe('Ziel.md', '---\na: 1\n---\nText\n');
    w.schreibe('Baustein.md', '- neuer Eintrag\n');
    await w.lauf('insert', ['Ziel.md'], { source, position: { kind: 'atStart' } });
    expect(w.lies('Ziel.md')).toBe('---\na: 1\n---\n- neuer Eintrag\nText\n');
  });
});

describe('Quellen zur Laufzeit (O1)', () => {
  it('from-file liest den Puffer-Stand vor der Platte', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '');
    w.schreibe('Baustein.md', 'Platte');
    w.puffer[w.abs('Baustein.md')] = 'Puffer';
    await w.lauf('append', ['Ziel.md'], { source: { kind: 'file', path: 'Baustein.md' } });
    expect(w.lies('Ziel.md')).toBe('Puffer\n');
  });

  it('from-section mit fehlendem und doppeltem Abschnitt', async () => {
    const w = welt();
    w.schreibe('Ziel.md', 'x\n');
    const fehlt = await w.lauf('append', ['Ziel.md'], {
      source: { kind: 'section', name: 'Fehlt' },
    });
    const doppelt = await w.lauf('append', ['Ziel.md'], {
      source: { kind: 'section', name: 'Doppelt' },
    });
    expect([fehlt.code, doppelt.code]).toEqual(['sectionUnknown', 'sectionAmbiguous']);
    expect(w.lies('Ziel.md')).toBe('x\n');
  });

  it('der Text der Workflow-Datei bleibt unverändert, auch wenn ein Schritt aus ihr liest', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '');
    await w.lauf('append', ['Ziel.md'], { source: { kind: 'section', name: 'Eintrag' } });
    expect(w.lies('Workflows/Ablauf.md')).toBe(WORKFLOW);
  });

  it('fehlende Quell-Datei: sourceMissing', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '');
    expect(
      (await w.lauf('append', ['Ziel.md'], { source: { kind: 'file', path: 'Fehlt.md' } })).code,
    ).toBe('sourceMissing');
  });
});

describe('replace, set-property, remove-property', () => {
  it('replace ersetzt jedes Vorkommen; ohne Vorkommen textNotFound (E3)', async () => {
    const w = welt();
    w.schreibe('Ziel.md', 'PROJEKT, PROJEKT\n');
    await w.lauf('replace', ['Ziel.md', 'PROJEKT', 'Atlas']);
    expect(w.lies('Ziel.md')).toBe('Atlas, Atlas\n');
    expect((await w.lauf('replace', ['Ziel.md', 'PROJEKT', 'x'])).code).toBe('textNotFound');
  });

  it('set-property und remove-property; die übrigen Eigenschaften bleiben', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '---\nb: 1\na: zwei\n---\nText\n');
    await w.lauf('set-property', ['Ziel.md', 'status', 'erledigt']);
    expect(w.lies('Ziel.md')).toBe('---\nb: 1\na: zwei\nstatus: erledigt\n---\nText\n');
    await w.lauf('remove-property', ['Ziel.md', 'b']);
    expect(w.lies('Ziel.md')).toBe('---\na: zwei\nstatus: erledigt\n---\nText\n');
  });

  it('eine fehlende Eigenschaft zu entfernen gelingt ohne Änderung (E3)', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '---\na: 1\n---\n');
    const res = await w.lauf('remove-property', ['Ziel.md', 'fehlt']);
    expect(res.effect.kind).toBe('unchanged');
  });
});

describe('Ziel, Grenze und Historie', () => {
  it('fehlende Ziel-Datei: targetMissing; ein Ordner: notAFile', async () => {
    const w = welt();
    expect((await w.lauf('replace', ['Fehlt.md', 'a', 'b'])).code).toBe('targetMissing');
    expect((await w.lauf('replace', ['Workflows', 'a', 'b'])).code).toBe('notAFile');
  });

  it('außerhalb der Wurzel: outsideArea', async () => {
    const w = welt();
    expect((await w.lauf('replace', ['../x.md', 'a', 'b'])).code).toBe('outsideArea');
  });

  it('die Historie wird geschrieben, wenn sie eingeschaltet ist', async () => {
    const w = welt({ historie: true });
    w.schreibe('Ziel.md', 'alt\n');
    await w.lauf('replace', ['Ziel.md', 'alt', 'neu']);
    expect(w.historien).toEqual([{ p: w.abs('Ziel.md'), vorher: 'alt\n', nachher: 'neu\n' }]);
  });

  it('ohne eingeschaltete Historie entsteht kein Eintrag', async () => {
    const w = welt();
    w.schreibe('Ziel.md', 'alt\n');
    await w.lauf('replace', ['Ziel.md', 'alt', 'neu']);
    expect(w.historien).toEqual([]);
  });
});
