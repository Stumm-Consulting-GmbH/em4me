// 4T-002461 (Epic 3E-000367, Story 4S-001144): Die Lauf-Marke der Workflows
// (src/main/documents/self-write.js, Abschnitt «Lauf-Marke») an jedem Schreibweg
// eines Laufs und ihre Erkennung im Ereignis-Prüfer (AK1 bis AK3, AK5).
//
// Die Schreibwege sind die ECHTEN Schritt-Module an einem Bereich in einem
// temporären Ordner, die Bewegung über die echte Umbenenn-Strecke
// (`createLinkUpdate`, Muster test/unit/workflow-file-steps.test.js). Die
// Meldungen des Beobachters werden nachgestellt (Art und Pfad wie in
// src/main/index/build.js); geprüft wird, ob die Lauf-Marke sie als
// Schreibvorgang eines Laufs erkennt und ob der echte Ereignis-Prüfer daraus
// eine Fälligkeit macht. Der Lauf-Zusammenhang entsteht wie im Schritt-Kanal
// `workflow:step` über `imWorkflowLauf`.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const selbstSchreib = require('../../src/main/documents/self-write.js');
const {
  LAUF_EINMAL_MS,
  imWorkflowLauf,
  istImWorkflowLauf,
  istLaufSchreibvorgang,
  merke,
  merkeLaufAufgabe,
  merkeLaufStand,
  hatLaufMarke,
} = selbstSchreib;
const { createWorkflowFileSteps } = require('../../src/main/workflows/workflow-file-steps.js');
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const {
  createWorkflowMaintenanceSteps,
} = require('../../src/main/workflows/workflow-maintenance-steps.js');
const { createRenameCascade } = require('../../src/main/documents/rename-cascade.js');
const { createLinkUpdate } = require('../../src/main/documents/link-update.js');
const { createFileWatching } = require('../../src/main/documents/file-watching.js');
const {
  ENTPRELL_MS,
  abonniereWorkflowEreignisse,
  createWorkflowEventChecker,
} = require('../../src/main/checks/workflow-event-check.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');
const subpages = require('../../src/shared/subpages.js');
const { runWorkflow, MAX_CALL_DEPTH } = require('../../src/shared/workflows/workflow-runner.js');

const isMarkdownPath = (p) => /\.(md|markdown|mdown|mkd)$/i.test(p);
let tmpDirs = [];

beforeEach(() => {
  selbstSchreib._laufLeeren();
});

afterEach(() => {
  vi.useRealTimers();
  selbstSchreib._laufLeeren();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Ein Bereich mit den echten Schritt-Modulen; jeder Schritt läuft im
// Lauf-Zusammenhang wie im Schritt-Kanal.
function welt() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-marke-'));
  tmpDirs.push(root);
  const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
  const lu = createLinkUpdate({
    areaOfWindow: () => ({ rootPath: root }),
    isMarkdownPath,
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    moveWatchEntry,
    mddKeyOf: (p) => p.toLowerCase(),
    mddOpenPackets: new Map(),
    mddSuspendedPaths: new Set(),
    getStore: () => null,
    applyMenuToAllWindows: () => {},
    broadcast: () => {},
    books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
    followAreaStartPage: async () => {},
  });
  const deps = {
    subpages,
    isMarkdownPath,
    renameSingleFile: lu.renameSingleFile,
    sendBookStateForDirs: async () => {},
    renamesFromPairs: lu.renamesFromPairs,
    applyLinkUpdatesForRename: lu.applyLinkUpdatesForRename,
    broadcast: () => {},
  };
  const backlinks = { bufferTextFor: () => null, bufferOwnerFor: () => null };
  const datei = createWorkflowFileSteps({ ...deps, cascade: createRenameCascade(deps) });
  const inhalt = createWorkflowContentSteps({
    windows: new Map(),
    backlinks,
    resolveHistoryFor: async () => ({ effective: false }),
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    bufferRequests: { request: async () => ({ ok: false, code: 'bufferUnavailable' }) },
  });
  const pflege = createWorkflowMaintenanceSteps({ backlinks, trashItem: async () => {} });
  const abs = (rel) => path.join(root, ...rel.split('/'));
  const ctx = {
    root,
    owner: {},
    event: { sender: { id: 1 } },
    workflowAbs: abs('Workflows/Ablauf.md'),
    backlinks,
  };
  const schritt = (modul, keyword, args, extra = {}) =>
    imWorkflowLauf(() =>
      modul(ctx, { line: 5, keyword, args, source: null, position: null, ...extra }),
    );
  const schreibe = (rel, text) => {
    fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
    fs.writeFileSync(abs(rel), text, 'utf8');
  };
  return {
    root,
    abs,
    schreibe,
    datei: (keyword, args, extra) => schritt(datei.runFileStep, keyword, args, extra),
    inhalt: (keyword, args, extra) => schritt(inhalt.runContentStep, keyword, args, extra),
    pflege: (keyword, args) => schritt(pflege.runMaintenanceStep, keyword, args),
  };
}

const meldung = (type, p, extra = {}) => ({ type, path: p, ...extra });

describe('Register der Lauf-Marke', () => {
  it('ohne Marke entscheidet sie synchron und ohne Lesen; das Kennzeichen lauf gilt sofort', () => {
    expect(istLaufSchreibvorgang(meldung('file-created', path.resolve('/x/a.md')))).toBe(false);
    expect(
      istLaufSchreibvorgang(meldung('file-moved', path.resolve('/x/a.md'), { lauf: true })),
    ).toBe(true);
    expect(istLaufSchreibvorgang(null)).toBe(false);
  });

  it('ein gemerkter Stand gilt, ein fremder Inhalt lässt alle Stände des Pfads verfallen (AK3)', async () => {
    const w = welt();
    w.schreibe('a.md', 'vom Lauf');
    merkeLaufStand(w.abs('a.md'), 'vom Lauf');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('a.md')))).toBe(true);
    w.schreibe('a.md', 'vom Anwender');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('a.md')))).toBe(false);
    expect(hatLaufMarke(w.abs('a.md'))).toBe(false);
    // Stellt der Anwender den Inhalt des Laufs wieder her, löst das wieder aus.
    w.schreibe('a.md', 'vom Lauf');
    expect(istLaufSchreibvorgang(meldung('file-changed', w.abs('a.md')))).toBe(false);
  });

  it('der Lauf-Zusammenhang reist über await; merke darin setzt zusätzlich die Lauf-Marke', async () => {
    const w = welt();
    expect(istImWorkflowLauf()).toBe(false);
    await imWorkflowLauf(async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(istImWorkflowLauf()).toBe(true);
      merke(w.abs('im-lauf.md'), 'x');
    });
    merke(w.abs('ausserhalb.md'), 'y');
    expect(hatLaufMarke(w.abs('im-lauf.md'))).toBe(true);
    expect(hatLaufMarke(w.abs('ausserhalb.md'))).toBe(false);
    // Das Register der Selbst-Schreib-Marke bleibt davon unberührt.
    expect(selbstSchreib._hat(w.abs('im-lauf.md'))).toBe(true);
    selbstSchreib._leeren();
  });

  it('die Einmal-Marke von complete-task verfällt nach ihrer Frist', async () => {
    const w = welt();
    w.schreibe('Liste.md', '- [ ] Brot kaufen\n');
    await merkeLaufAufgabe(w.abs('Liste.md'), 'Brot kaufen', {
      jetzt: Date.now() - LAUF_EINMAL_MS - 1,
    });
    w.schreibe('Liste.md', '- [x] Brot kaufen\n');
    expect(istLaufSchreibvorgang(meldung('file-changed', w.abs('Liste.md')))).toBe(false);
    const aufgabe = meldung('task-done', w.abs('Liste.md'), { task: 'Brot kaufen' });
    expect(istLaufSchreibvorgang(aufgabe)).toBe(false);
  });
});

describe('Jeder Schreibweg eines Laufs trägt die Lauf-Marke (AK1)', () => {
  it('create: die angelegte Datei meldet sich als Lauf-Schreibvorgang', async () => {
    const w = welt();
    const res = await w.datei('create', ['Eingang/Antwort.md'], {
      source: { kind: 'template', text: '# Antwort\n' },
    });
    expect(res.ok).toBe(true);
    const p = w.abs('Eingang/Antwort.md');
    expect(await istLaufSchreibvorgang(meldung('file-created', p))).toBe(true);
    expect(await istLaufSchreibvorgang(meldung('file-changed', p))).toBe(true);
  });

  it('copy: die Kopie, auch eine Nicht-Markdown-Datei', async () => {
    const w = welt();
    fs.mkdirSync(w.abs('Bilder'), { recursive: true });
    fs.writeFileSync(w.abs('Bilder/a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]));
    expect((await w.datei('copy', ['Bilder/a.png', 'Eingang/a.png'])).ok).toBe(true);
    expect(await istLaufSchreibvorgang(meldung('file-created', w.abs('Eingang/a.png')))).toBe(true);
  });

  it('move und rename: Meldung file-moved mit Kennzeichen, das neue Ziel und der Verweis-Nachzug', async () => {
    const w = welt();
    w.schreibe('Notizen/Alt.md', '# Alt\n');
    w.schreibe('Index.md', 'Siehe [[Alt]].\n');
    const gemeldet = [];
    const abmelden = abonniereWorkflowEreignisse((m) => gemeldet.push(m));
    try {
      expect((await w.datei('rename', ['Notizen/Alt.md', 'Neu.md'])).ok).toBe(true);
      expect((await w.datei('move', ['Notizen/Neu.md', 'Archiv'])).ok).toBe(true);
    } finally {
      abmelden();
    }
    const bewegt = gemeldet.filter((m) => m.type === 'file-moved');
    expect(bewegt).toHaveLength(2);
    for (const m of bewegt) expect(istLaufSchreibvorgang(m)).toBe(true);
    // Der Beobachter meldet das Ziel zusätzlich als angelegt.
    const ziel = w.abs('Archiv/Neu.md');
    expect(await istLaufSchreibvorgang(meldung('file-created', ziel))).toBe(true);
    // Der Verweis in Index.md wurde im Lauf umgeschrieben.
    expect(fs.readFileSync(w.abs('Index.md'), 'utf8')).toContain('[[Neu]]');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('Index.md')))).toBe(true);
  });

  it('move eines Ordners: jede bewegte Datei', async () => {
    const w = welt();
    w.schreibe('Projekt/a.md', 'a\n');
    w.schreibe('Projekt/Unter/b.txt', 'b\n');
    expect((await w.datei('move', ['Projekt', 'Archiv'])).ok).toBe(true);
    for (const rel of ['Archiv/Projekt/a.md', 'Archiv/Projekt/Unter/b.txt']) {
      expect(await istLaufSchreibvorgang(meldung('file-created', w.abs(rel)))).toBe(true);
    }
  });

  it('eine Bewegung außerhalb eines Laufs trägt kein Kennzeichen (AK3)', async () => {
    const w = welt();
    w.schreibe('Eingang/x.md', 'x\n');
    const gemeldet = [];
    const abmelden = abonniereWorkflowEreignisse((m) => gemeldet.push(m));
    const { moveWatchEntry } = createFileWatching({ windows: () => new Map() });
    const lu = createLinkUpdate({
      areaOfWindow: () => ({ rootPath: w.root }),
      isMarkdownPath,
      resolveHistoryFor: async () => ({ effective: false }),
      readPreviousTextFor: async () => null,
      recordMddOnSave: async () => {},
      moveWatchEntry,
      mddKeyOf: (p) => p.toLowerCase(),
      mddOpenPackets: new Map(),
      mddSuspendedPaths: new Set(),
      getStore: () => null,
      applyMenuToAllWindows: () => {},
      broadcast: () => {},
      books: { followChapterFileMove: async () => ({ ok: true, changed: false }) },
      followAreaStartPage: async () => {},
    });
    try {
      expect((await lu.renameSingleFile(w.abs('Eingang/x.md'), w.abs('Eingang/y.md'))).ok).toBe(
        true,
      );
    } finally {
      abmelden();
    }
    const m = gemeldet.find((e) => e.type === 'file-moved');
    expect(m.lauf).toBeUndefined();
    expect(istLaufSchreibvorgang(m)).toBe(false);
  });

  it('Inhalts-Schritt auf der Platte: markiert; danach ändert der Anwender, und das löst aus (AK3)', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '# Ziel\n');
    const res = await w.inhalt('append', ['Ziel.md'], {
      source: { kind: 'template', text: '- vom Lauf' },
    });
    expect(res.ok).toBe(true);
    expect(res.effect.via).toBe('disk');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('Ziel.md')))).toBe(true);
    fs.appendFileSync(w.abs('Ziel.md'), '- vom Anwender\n');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('Ziel.md')))).toBe(false);
  });

  it('set-property schreibt mit Marke', async () => {
    const w = welt();
    w.schreibe('Ziel.md', '# Ziel\n');
    expect((await w.inhalt('set-property', ['Ziel.md', 'status', 'fertig'])).ok).toBe(true);
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('Ziel.md')))).toBe(true);
  });
});

describe('complete-task (AK2)', () => {
  it('das Abhaken im Fenster löst weder file-changed noch task-done aus, ein zweites schon', async () => {
    const w = welt();
    w.schreibe('Liste.md', '- [ ] Brot kaufen\n- [ ] Milch holen\n');
    const res = await w.pflege('complete-task', ['Liste.md', 'Brot']);
    expect(res.window).toMatchObject({ action: 'completeTask', line: 1 });
    // Das Fenster hakt ab (Erledigt-Datum) und speichert.
    w.schreibe('Liste.md', '- [x] Brot kaufen ✅ 2026-10-31\n- [ ] Milch holen\n');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('Liste.md')))).toBe(true);
    const erledigt = meldung('task-done', w.abs('Liste.md'), {
      task: '- [x] Brot kaufen ✅ 2026-10-31',
    });
    expect(istLaufSchreibvorgang(erledigt)).toBe(true);
    // Die Einmal-Marke ist verbraucht: Hakt der Anwender danach ab, löst es aus.
    expect(istLaufSchreibvorgang(erledigt)).toBe(false);
    const milch = meldung('task-done', w.abs('Liste.md'), { task: '- [x] Milch holen' });
    expect(istLaufSchreibvorgang(milch)).toBe(false);
    w.schreibe('Liste.md', '- [x] Brot kaufen ✅ 2026-10-31\n- [x] Milch holen\n');
    expect(await istLaufSchreibvorgang(meldung('file-changed', w.abs('Liste.md')))).toBe(false);
  });
});

describe('Erkennung im echten Ereignis-Prüfer (AK1, AK3)', () => {
  const WF_TEXT = [
    '---',
    'workflow: true',
    'name: Kreis-Probe',
    'trigger: event',
    'event: file-created in "Eingang"',
    '---',
    '',
    '```workflow',
    'create "Eingang/Antwort.md"',
    '```',
    '',
  ].join('\n');

  function pruefer(root) {
    const zugestellt = [];
    const wf = path.join(root, 'Workflows', 'Kreis.md');
    const c = createWorkflowEventChecker({
      areas: () => [{ root }],
      workflowFiles: () => ({
        status: 'ready',
        dateien: [{ absPath: wf, relPath: 'Workflows/Kreis.md' }],
      }),
      readText: async () => WF_TEXT,
      readRunState: async () => ({
        stand: { runs: 0, armed: { at: 'x', hash: definitionsPruefsumme(WF_TEXT) } },
        defekt: false,
      }),
      enabled: () => true,
      deliver: (nutzlast) => zugestellt.push(...nutzlast.items),
      claimDelivery: () => true,
      releaseDelivery: () => {},
      windowAlive: () => true,
      istLaufSchreibvorgang,
    });
    return { c, zugestellt };
  }

  async function ablauf(c) {
    await c.idle();
    await vi.advanceTimersByTimeAsync(ENTPRELL_MS);
    await c.idle();
  }

  it('eine vom Workflow angelegte Datei löst nichts aus, eine vom Anwender angelegte schon', async () => {
    const w = welt();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { c, zugestellt } = pruefer(w.root);
    try {
      expect(
        (
          await w.datei('create', ['Eingang/Antwort.md'], {
            source: { kind: 'template', text: '' },
          })
        ).ok,
      ).toBe(true);
      c.report(meldung('file-created', w.abs('Eingang/Antwort.md'), { root: w.root }));
      await ablauf(c);
      expect(zugestellt).toEqual([]);
      w.schreibe('Eingang/Start.txt', 'vom Anwender');
      c.report(meldung('file-created', w.abs('Eingang/Start.txt'), { root: w.root }));
      await ablauf(c);
      expect(zugestellt).toHaveLength(1);
      expect(zugestellt[0].event.file).toBe(w.abs('Eingang/Start.txt'));
    } finally {
      c.stop();
    }
  });
});

describe('workflow "Name" im Lauf bleibt erlaubt (AK5)', () => {
  it('ein Ereignis-Lauf ruft verschachtelte Workflows bis zur Tiefe 5; deren Schreibvorgänge tragen die Marke', async () => {
    const w = welt();
    expect(MAX_CALL_DEPTH).toBe(5);
    const s = (line, keyword, ...args) => ({
      line,
      blockLine: line,
      keyword,
      args,
      source: keyword === 'create' ? { kind: 'template', text: '' } : null,
      position: null,
    });
    // Ebene 0 ruft 1, … bis Ebene 4; jede legt eine Datei an.
    let plan = {
      path: 'E4.md',
      name: 'E4',
      steps: [s(3, 'create', 'Eingang/E4.md')],
      children: {},
    };
    for (let i = 3; i >= 0; i -= 1) {
      plan = {
        path: `E${i}.md`,
        name: `E${i}`,
        steps: [s(3, 'create', `Eingang/E${i}.md`), s(4, 'workflow', `E${i + 1}`)],
        children: { 4: plan },
      };
    }
    const deps = {
      flushBuffers: async () => {},
      step: async (_pfad, step) => ({
        line: step.line,
        keyword: step.keyword,
        ...(await w.datei(step.keyword, step.args, { source: step.source })),
      }),
      runWindowAction: async () => ({ ok: false, code: 'invalidStep' }),
      executeCommand: () => true,
      runMacro: async () => ({ ok: true }),
      sleep: async () => {},
      notify: () => {},
      finish: () => {},
    };
    expect(await runWorkflow(plan, deps, 0)).toEqual({ status: 'ok' });
    for (let i = 0; i <= 4; i += 1) {
      const p = w.abs(`Eingang/E${i}.md`);
      expect(fs.existsSync(p)).toBe(true);
      expect(await istLaufSchreibvorgang(meldung('file-created', p))).toBe(true);
    }
  });
});
