// 4T-002424 (Epic 3E-000366): Die Pflege-Befehle `delete` und `complete-task`
// im Hauptprozess (src/main/workflows/workflow-maintenance-steps.js), Story
// 4S-001135, Regeln P1, P3 und P5 der Konzept-Runde 4T-002418.
//
// Gemessen an einem Bereich in einem temporären Ordner; der Papierkorb ist eine
// Attrappe von `shell.trashItem`, die die Pfade mitschreibt und sie danach
// entfernt, damit das Ergebnis auf der Platte prüfbar bleibt.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MAINTENANCE_KEYWORDS,
  createWorkflowMaintenanceSteps,
} = require('../../src/main/workflows/workflow-maintenance-steps.js');

const tmpDirs = [];
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
  vi.restoreAllMocks();
});

function bereich({ trashItem, store = null, puffer = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-pflege-'));
  tmpDirs.push(root);
  const weg = [];
  const papierkorb =
    trashItem ||
    (async (p) => {
      weg.push(p);
      fs.rmSync(p, { recursive: true, force: true });
    });
  const backlinks = {
    bufferTextFor: (p) => (p in puffer ? puffer[p] : null),
    bufferOwnerFor: () => null,
  };
  const schritte = createWorkflowMaintenanceSteps({
    backlinks,
    trashItem: papierkorb,
    getStore: store ? () => ({ get: (k) => store[k] }) : undefined,
  });
  const ctx = { root, owner: null, event: null, workflowAbs: path.join(root, 'W.md'), backlinks };
  const lauf = (keyword, args) =>
    schritte.runMaintenanceStep(ctx, { line: 4, blockLine: 1, keyword, args });
  const schreibe = (rel, text) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    return abs;
  };
  return { root, weg, lauf, schreibe };
}

describe('Befehle des Moduls', () => {
  it('führt delete und complete-task', () => {
    expect(MAINTENANCE_KEYWORDS).toEqual(['delete', 'complete-task']);
  });
});

describe('delete (P1)', () => {
  it('legt die Datei, danach Beleg-Datei und Begleitdatei in den Papierkorb', async () => {
    const b = bereich();
    const datei = b.schreibe('Tab.md', '# T\n');
    const beleg = b.schreibe('Tab.mddl', '');
    const begleit = b.schreibe('Tab.mdd', '{}');
    const res = await b.lauf('delete', ['Tab.md']);
    expect(res).toEqual({ ok: true, effect: { kind: 'trashed', paths: [datei], via: 'disk' } });
    expect(b.weg).toEqual([datei, beleg, begleit]);
    expect(fs.readdirSync(b.root)).toEqual([]);
  });

  it('legt einen Ordner als Ganzes in den Papierkorb', async () => {
    const b = bereich();
    b.schreibe('Alt/a.md', 'a');
    b.schreibe('Alt/Unter/b.md', 'b');
    const res = await b.lauf('delete', ['Alt']);
    expect(res.ok).toBe(true);
    expect(b.weg).toEqual([path.join(b.root, 'Alt')]);
    expect(fs.existsSync(path.join(b.root, 'Alt'))).toBe(false);
  });

  it('ein fehlendes Ziel ist ein Fehlschlag, ohne Papierkorb', async () => {
    const b = bereich();
    const res = await b.lauf('delete', ['Fehlt.md']);
    expect(res).toEqual({ ok: false, code: 'targetMissing', detail: { path: 'Fehlt.md' } });
    expect(b.weg).toEqual([]);
  });

  it('löscht nie die Bereichs-Wurzel', async () => {
    const b = bereich();
    b.schreibe('a.md', 'a');
    for (const ziel of ['.', './']) {
      const res = await b.lauf('delete', [ziel]);
      expect(res.code, ziel).toBe('deleteAreaRoot');
    }
    expect(b.weg).toEqual([]);
  });

  it('wirkt nicht außerhalb der Bereichs-Wurzel (P5)', async () => {
    const b = bereich();
    const fremd = path.join(path.dirname(b.root), `fremd-${path.basename(b.root)}.md`);
    fs.writeFileSync(fremd, 'x');
    tmpDirs.push(fremd);
    for (const ziel of ['../x.md', fremd]) {
      const res = await b.lauf('delete', [ziel]);
      expect(res.code, ziel).toBe('outsideArea');
    }
    expect(b.weg).toEqual([]);
    expect(fs.existsSync(fremd)).toBe(true);
  });

  it('ein abgelehnter Papierkorb ist ein Fehlschlag ohne Rückfall auf endgültiges Löschen', async () => {
    const b = bereich({
      trashItem: async () => {
        throw new Error('kein Papierkorb');
      },
    });
    const datei = b.schreibe('a.md', 'a');
    const res = await b.lauf('delete', ['a.md']);
    expect(res).toEqual({
      ok: false,
      code: 'trashFailed',
      detail: { path: 'a.md', message: 'kein Papierkorb' },
    });
    expect(fs.existsSync(datei)).toBe(true);
  });

  it('eine liegen gebliebene Begleitdatei nennt das Ergebnis, der Schritt gelingt', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const weg = [];
    const b = bereich({
      trashItem: async (p) => {
        if (p.endsWith('.mdd')) throw new Error('gesperrt');
        weg.push(p);
        fs.rmSync(p, { force: true });
      },
    });
    const datei = b.schreibe('a.md', 'a');
    const begleit = b.schreibe('a.mdd', '{}');
    const res = await b.lauf('delete', ['a.md']);
    expect(res.ok).toBe(true);
    expect(res.effect.companionLeft).toEqual([begleit]);
    expect(weg).toEqual([datei]);
  });
});

describe('complete-task (P3)', () => {
  const TEXT = [
    '---',
    'tags: [x]',
    '---',
    '```',
    '- [ ] Rückblick schreiben im Code',
    '```',
    '- [x] Rückblick schreiben erledigt',
    '- [-] Rückblick schreiben abgebrochen',
    '  - [ ] Rückblick schreiben eingerückt',
    '- [ ] Rückblick schreiben zweite',
    '',
  ].join('\n');

  it('findet die erste offene Aufgabe, nicht im Dateikopf und nicht im Code-Block', async () => {
    const b = bereich();
    const abs = b.schreibe('Plan.md', TEXT);
    const res = await b.lauf('complete-task', ['Plan.md', 'Rückblick schreiben']);
    expect(res).toEqual({
      ok: true,
      window: {
        action: 'completeTask',
        path: abs,
        line: 9,
        taskText: '  - [ ] Rückblick schreiben eingerückt',
      },
    });
  });

  it('bei zwei Treffern nur die erste, wörtlich mit Groß- und Kleinschreibung', async () => {
    const b = bereich();
    b.schreibe('Plan.md', '- [ ] Rückblick\n- [ ] rückblick\n- [ ] Rückblick\n');
    expect((await b.lauf('complete-task', ['Plan.md', 'rückblick'])).window.line).toBe(2);
    expect((await b.lauf('complete-task', ['Plan.md', 'Rückblick'])).window.line).toBe(1);
  });

  it('ohne Treffer ist der Schritt ein Fehlschlag mit Grund (A1)', async () => {
    const b = bereich();
    b.schreibe('Plan.md', '- [x] Rückblick schreiben\n');
    const res = await b.lauf('complete-task', ['Plan.md', 'Rückblick schreiben']);
    expect(res).toEqual({
      ok: false,
      code: 'taskNotFound',
      detail: { path: 'Plan.md', text: 'Rückblick schreiben' },
    });
  });

  it('sucht im ungespeicherten Stand vor der Platte (P5)', async () => {
    const puffer = {};
    const b = bereich({ puffer });
    const ziel = b.schreibe('Plan.md', '- [ ] Platte\n');
    puffer[ziel] = '- [ ] Platte\n- [ ] Puffer\n';
    const res = await b.lauf('complete-task', ['Plan.md', 'Puffer']);
    expect(res.window).toMatchObject({ path: ziel, line: 2, taskText: '- [ ] Puffer' });
  });

  it('folgt der Status-Einstellung und dem Global Filter der Aufgaben-Abfrage', async () => {
    const b = bereich({
      store: {
        'extensions.disabled': [],
        tasksConfig: { globalFilter: '#aufgabe' },
        taskStates: null,
      },
    });
    b.schreibe('Plan.md', '- [ ] Rückblick ohne Filter\n- [/] Rückblick #aufgabe\n');
    const res = await b.lauf('complete-task', ['Plan.md', 'Rückblick']);
    expect(res.window).toMatchObject({ line: 2, taskText: '- [/] Rückblick #aufgabe' });
  });

  it('wirkt nicht außerhalb der Wurzel und nicht auf Ordner', async () => {
    const b = bereich();
    fs.mkdirSync(path.join(b.root, 'Ordner'));
    expect((await b.lauf('complete-task', ['../Plan.md', 'x'])).code).toBe('outsideArea');
    expect((await b.lauf('complete-task', ['Ordner', 'x'])).code).toBe('notAFile');
    expect((await b.lauf('complete-task', ['Fehlt.md', 'x'])).code).toBe('targetMissing');
  });
});
