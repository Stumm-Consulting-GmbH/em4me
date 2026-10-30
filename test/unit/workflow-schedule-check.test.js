// 4T-002421 (Epic 3E-000366, Story 4S-001132): Der Zeitplan-Prüfer im
// Hauptprozess (src/main/checks/workflow-schedule-check.js) und die Kanäle des
// Laufs nach Zeitplan (src/main/ipc/workflow-schedule.js).
//
// Geprüft mit Attrappen für Uhr, Index-Sicht, Dateitext und Lauf-Stand; das
// Zustell-Register ist das echte (`due-delivery.js`), damit der Anspruch zweier
// Fenster am echten «der erste gewinnt» gemessen wird. Die Prüfsumme der
// Scharf-Schaltung ist die echte (`definitionsPruefsumme`), damit «Definition
// geändert» am echten Vergleich hängt.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  WATCH_GAP_MS,
  createWorkflowScheduleChecker,
  sameRoot,
  scheduleKey,
} = require('../../src/main/checks/workflow-schedule-check.js');
const path = require('node:path');
const { isFilesystemCaseInsensitive } = require('../../src/shared/platform.js');
const { createDueDelivery } = require('../../src/main/checks/due-delivery.js');
const { registerWorkflowScheduleIpc } = require('../../src/main/ipc/workflow-schedule.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');

const WURZEL = 'C:\\Bereich';
const ANDERE = 'C:\\Anderer';
const DATEI = 'C:\\Bereich\\Workflows\\Probe.md';

function workflow({ schedule = 'every 30 minutes', missed = null, trigger = 'schedule' } = {}) {
  return [
    '---',
    'workflow: true',
    'name: Probe',
    `trigger: ${trigger}`,
    `schedule: ${schedule}`,
    ...(missed ? [`missed: ${missed}`] : []),
    '---',
    '',
    '```workflow',
    'notify "Lauf"',
    '```',
    '',
  ].join('\n');
}

// Lokale Wanduhr-Zeit 2026-10-28 HH:MM:SS.
const um = (h, m, s = 0) => new Date(2026, 9, 28, h, m, s);

let welt;

function baue() {
  const texte = new Map();
  const staende = new Map();
  const zustellungen = [];
  let jetzt = um(8, 0);
  let an = true;
  let indexBereit = true;
  const offeneWurzeln = [WURZEL];
  const lebendeFenster = new Set([1, 2, 3]);
  const schreiben = { setNextDue: [], recordSkipped: [] };
  const runState = {
    setNextDue: vi.fn(async (_owner, abs, wert) => {
      schreiben.setNextDue.push({ abs, wert });
      staende.get(abs).nextDue = wert;
      return { ok: true };
    }),
    recordSkipped: vi.fn(async (_owner, abs, verfall) => {
      schreiben.recordSkipped.push({ abs, ...verfall });
      const st = staende.get(abs);
      st.skipped = { due: verfall.due };
      st.nextDue = verfall.nextDue;
      return { ok: true };
    }),
  };
  const pruefer = createWorkflowScheduleChecker({
    areas: () => offeneWurzeln.map((root) => ({ root })),
    workflowFiles: (root) => {
      if (!indexBereit) return { status: 'indexing', dateien: [] };
      const dateien = [...texte.keys()]
        .filter((abs) => abs.startsWith(root))
        .map((absPath) => ({ absPath, relPath: absPath.slice(root.length + 1) }));
      return { status: 'ready', wurzel: root, dateien };
    },
    readText: async (abs) => (texte.has(abs) ? texte.get(abs) : null),
    readRunState: async (abs) => ({
      stand: staende.has(abs) ? structuredClone(staende.get(abs)) : null,
      defekt: false,
    }),
    runState,
    enabled: () => an,
    deliver: (nutzlast) => register.deliver(nutzlast),
    claimDelivery: (key) => register.claim([key]).length === 1,
    releaseDelivery: (key) => {
      register.release(key);
    },
    windowAlive: (id) => lebendeFenster.has(id),
    now: () => jetzt,
    minuteExists: () => true,
  });
  const register = createDueDelivery({
    broadcast: (kanal, nutzlast) => zustellungen.push({ kanal, nutzlast }),
    dueChannel: 'workflow:due',
    handledChannel: 'workflow:dueHandled',
    keyOf: (item) => item.key,
    active: () => an,
    stillOpen: (item) => pruefer.isPending(item.key),
  });
  welt = {
    texte,
    staende,
    zustellungen,
    schreiben,
    runState,
    register,
    pruefer,
    offeneWurzeln,
    lebendeFenster,
    setzeUhr: (d) => {
      jetzt = d;
    },
    schalte: (wert) => {
      an = wert;
    },
    indexBereit: (wert) => {
      indexBereit = wert;
    },
  };
}

// Eine scharfe Workflow-Datei mit passender Prüfsumme und Termin.
function scharf(text, nextDue, abs = DATEI) {
  welt.texte.set(abs, text);
  welt.staende.set(abs, {
    runs: 0,
    lastRun: null,
    armed: { at: '2026-10-27T10:00:00Z', hash: definitionsPruefsumme(text) },
    nextDue,
    skipped: null,
  });
}

const faellige = () =>
  welt.zustellungen.filter((z) => z.kanal === 'workflow:due').flatMap((z) => z.nutzlast.items);

beforeEach(() => baue());

describe('Fälligkeit (AK1, AK4)', () => {
  it('ein scharfer Workflow wird zur Fälligkeit mit der Herkunft schedule zugestellt', async () => {
    scharf(workflow(), '2026-10-28T08:00');
    welt.setzeUhr(um(7, 59, 40));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
    welt.setzeUhr(um(8, 0, 10));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([
      {
        key: scheduleKey(DATEI, '2026-10-28T08:00'),
        root: WURZEL,
        path: DATEI,
        relPath: 'Workflows\\Probe.md',
        name: 'Probe',
        origin: 'schedule',
        due: '2026-10-28T08:00',
      },
    ]);
    // Der Prüfer startet nichts selbst und schreibt nichts.
    expect(welt.schreiben.setNextDue).toEqual([]);
  });

  it('ein künftiger Termin ist nicht fällig', async () => {
    scharf(workflow(), '2026-10-28T09:00');
    await welt.pruefer.tick();
    welt.setzeUhr(um(8, 0, 30));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
  });

  it('ein nicht scharfer Workflow läuft nicht nach Zeitplan', async () => {
    scharf(workflow(), '2026-10-28T08:00');
    welt.staende.get(DATEI).armed = null;
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
  });

  it('eine geänderte Definition ist nicht scharf und wird nicht zugestellt', async () => {
    scharf(workflow(), '2026-10-28T08:00');
    welt.texte.set(DATEI, workflow({ schedule: 'every 2 hours' }));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
  });

  it('ein Workflow ohne trigger: schedule läuft nicht nach Zeitplan', async () => {
    const text = workflow({ trigger: 'manual' });
    scharf(text, '2026-10-28T08:00');
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
  });

  it('scharf ohne Termin: der nächste künftige Termin wird gesetzt, ohne Lauf', async () => {
    scharf(workflow(), null);
    welt.setzeUhr(um(8, 10));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
    expect(welt.schreiben.setNextDue).toEqual([{ abs: DATEI, wert: '2026-10-28T08:40' }]);
  });
});

describe('Nachhol-Regel (AK2)', () => {
  it('bei der ersten Prüfung nach dem Öffnen läuft ein verpasster Termin einmal als catch-up', async () => {
    scharf(workflow(), '2026-10-28T02:00');
    welt.setzeUhr(um(8, 0, 5));
    await welt.pruefer.checkNewAreas();
    const items = faellige();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ origin: 'catch-up', due: '2026-10-28T02:00' });
    const zustellung = welt.zustellungen.find((z) => z.kanal === 'workflow:due');
    expect(zustellung.nutzlast.catchUp).toBe(true);
  });

  it('viele verpasste Termine eines Intervalls ergeben höchstens einen Lauf', async () => {
    scharf(workflow({ schedule: 'every 30 minutes' }), '2026-10-25T08:00');
    welt.setzeUhr(um(8, 0));
    await welt.pruefer.tick();
    welt.setzeUhr(um(8, 0, 30));
    await welt.pruefer.tick();
    // Erneut zugestellt, solange kein Fenster beansprucht, aber derselbe Schlüssel.
    expect(new Set(faellige().map((i) => i.key)).size).toBe(1);
    expect(faellige().every((i) => i.origin === 'catch-up')).toBe(true);
  });

  it('missed: skip vermerkt «verfallen» und setzt den nächsten künftigen Termin, ohne Lauf', async () => {
    scharf(workflow({ schedule: 'every day at 07:00', missed: 'skip' }), '2026-10-26T07:00');
    welt.setzeUhr(um(8, 0));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
    expect(welt.schreiben.recordSkipped).toEqual([
      { abs: DATEI, due: '2026-10-26T07:00', nextDue: '2026-10-29T07:00' },
    ]);
    welt.setzeUhr(um(8, 0, 30));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
    expect(welt.schreiben.recordSkipped).toHaveLength(1);
  });

  it('missed: skip lässt einen pünktlichen Termin laufen', async () => {
    scharf(workflow({ schedule: 'every 30 minutes', missed: 'skip' }), '2026-10-28T08:00');
    welt.setzeUhr(um(7, 59, 45));
    await welt.pruefer.tick();
    welt.setzeUhr(um(8, 0, 15));
    await welt.pruefer.tick();
    expect(faellige().map((i) => i.origin)).toEqual(['schedule']);
    expect(welt.schreiben.recordSkipped).toEqual([]);
  });

  it('eine Lücke im Takt über WATCH_GAP_MS (Ruhezustand) macht den Termin zum catch-up', async () => {
    scharf(workflow(), '2026-10-28T08:00');
    welt.setzeUhr(um(7, 59, 45));
    await welt.pruefer.tick();
    welt.setzeUhr(new Date(um(7, 59, 45).getTime() + WATCH_GAP_MS + 1000));
    await welt.pruefer.tick();
    expect(faellige().map((i) => i.origin)).toEqual(['catch-up']);
  });

  it('Sofort-Prüfung: nur noch nie geprüfte Bereiche, ein nicht bereiter Index zählt nicht', async () => {
    scharf(workflow(), '2026-10-28T02:00');
    welt.indexBereit(false);
    await welt.pruefer.checkNewAreas();
    expect(faellige()).toEqual([]);
    welt.indexBereit(true);
    await welt.pruefer.checkNewAreas();
    expect(faellige()).toHaveLength(1);
    // Ein zweiter Anstoß prüft den schon geprüften Bereich nicht erneut.
    await welt.pruefer.checkNewAreas();
    expect(faellige()).toHaveLength(1);
  });

  it('ein geschlossener und wieder geöffneter Bereich holt nach', async () => {
    scharf(workflow(), '2026-10-28T08:00');
    welt.setzeUhr(um(7, 59, 45));
    await welt.pruefer.tick();
    welt.offeneWurzeln.length = 0;
    welt.setzeUhr(um(8, 0, 15));
    await welt.pruefer.tick();
    expect(faellige()).toEqual([]);
    welt.offeneWurzeln.push(WURZEL);
    await welt.pruefer.checkNewAreas();
    expect(faellige().map((i) => i.origin)).toEqual(['catch-up']);
  });
});

describe('Anspruch und Fortschreiben (AK3, AK5, AK6)', () => {
  async function faelligZugestellt() {
    scharf(workflow(), '2026-10-28T08:00');
    welt.setzeUhr(um(7, 59, 45));
    await welt.pruefer.tick();
    welt.setzeUhr(um(8, 0, 15));
    await welt.pruefer.tick();
    return faellige()[0].key;
  }

  it('zwei Ansprüche aus Fenstern desselben Bereichs: genau einer gewinnt', async () => {
    const key = await faelligZugestellt();
    expect(welt.pruefer.claim(key, { root: WURZEL, windowId: 1 })).toBe(true);
    expect(welt.pruefer.claim(key, { root: WURZEL, windowId: 2 })).toBe(false);
    expect(welt.zustellungen.filter((z) => z.kanal === 'workflow:dueHandled')).toEqual([
      { kanal: 'workflow:dueHandled', nutzlast: { keys: [key] } },
    ]);
  });

  it('ein Fenster eines anderen Bereichs bekommt keinen Anspruch', async () => {
    const key = await faelligZugestellt();
    expect(welt.pruefer.claim(key, { root: ANDERE, windowId: 3 })).toBe(false);
    expect(welt.pruefer.isPending(key)).toBe(true);
    // Die Schreibweise der Wurzel zählt nicht: ein abschließender Trenner auf jeder
    // Plattform; Groß-Kleinschreibung und Schrägstriche nur dort, wo das Dateisystem
    // sie nicht unterscheidet (Plattform-Eigenschaft statt Plattform-Abfrage, Linux-Prüfstand).
    const andereSchreibweise = isFilesystemCaseInsensitive() ? 'c:/bereich/' : WURZEL + path.sep;
    expect(welt.pruefer.claim(key, { root: andereSchreibweise, windowId: 1 })).toBe(true);
  });

  it('eine beanspruchte Fälligkeit wird nicht erneut zugestellt, eine freie im nächsten Takt schon', async () => {
    const key = await faelligZugestellt();
    welt.setzeUhr(um(8, 0, 45));
    await welt.pruefer.tick();
    expect(faellige().filter((i) => i.key === key)).toHaveLength(2);
    welt.pruefer.claim(key, { root: WURZEL, windowId: 1 });
    welt.setzeUhr(um(8, 1, 15));
    await welt.pruefer.tick();
    expect(faellige().filter((i) => i.key === key)).toHaveLength(2);
  });

  it('ein zurückgegebener Anspruch kommt im nächsten Takt wieder (AK5)', async () => {
    const key = await faelligZugestellt();
    welt.pruefer.claim(key, { root: WURZEL, windowId: 1 });
    expect(welt.pruefer.release(key, 2)).toBe(false);
    expect(welt.pruefer.release(key, 1)).toBe(true);
    welt.setzeUhr(um(8, 0, 45));
    await welt.pruefer.tick();
    expect(faellige().filter((i) => i.key === key)).toHaveLength(2);
    expect(welt.pruefer.claim(key, { root: WURZEL, windowId: 2 })).toBe(true);
  });

  it('nach dem Ende des Laufs steht nextDue auf dem nächsten künftigen Termin (AK6)', async () => {
    const key = await faelligZugestellt();
    welt.pruefer.claim(key, { root: WURZEL, windowId: 1 });
    expect(await welt.pruefer.finish(key, 2)).toBe(false);
    welt.setzeUhr(um(8, 0, 20));
    expect(await welt.pruefer.finish(key, 1)).toBe(true);
    expect(welt.staende.get(DATEI).nextDue).toBe('2026-10-28T08:30');
    // Zwei weitere Takte: derselbe Termin läuft nicht zweimal.
    welt.setzeUhr(um(8, 0, 45));
    await welt.pruefer.tick();
    welt.setzeUhr(um(8, 1, 15));
    await welt.pruefer.tick();
    expect(faellige().filter((i) => i.key === key)).toHaveLength(1);
    expect(welt.pruefer.isPending(key)).toBe(false);
  });

  it('ein inzwischen neu gesetzter Termin wird beim Ende nicht überschrieben', async () => {
    const key = await faelligZugestellt();
    welt.pruefer.claim(key, { root: WURZEL, windowId: 1 });
    welt.staende.get(DATEI).nextDue = '2026-11-01T09:00';
    await welt.pruefer.finish(key, 1);
    expect(welt.staende.get(DATEI).nextDue).toBe('2026-11-01T09:00');
  });

  it('schließt das Fenster mitten im Lauf, rückt nextDue vor statt den Lauf zu wiederholen', async () => {
    const key = await faelligZugestellt();
    welt.pruefer.claim(key, { root: WURZEL, windowId: 1 });
    welt.lebendeFenster.delete(1);
    welt.setzeUhr(um(8, 0, 45));
    await welt.pruefer.tick();
    expect(welt.staende.get(DATEI).nextDue).toBe('2026-10-28T08:30');
    expect(faellige().filter((i) => i.key === key)).toHaveLength(1);
  });
});

describe('Aus-Zustand der Erweiterung (AK7)', () => {
  it('keine Zustellung, kein Schreiben und kein Anspruch', async () => {
    scharf(workflow({ missed: 'skip' }), '2026-10-28T02:00');
    welt.schalte(false);
    await welt.pruefer.tick();
    await welt.pruefer.checkNewAreas();
    expect(welt.zustellungen).toEqual([]);
    expect(welt.schreiben.recordSkipped).toEqual([]);
    expect(welt.register.openItems()).toEqual({ catchUp: false, items: [] });
  });

  it('eine vor dem Abschalten zugestellte Fälligkeit lässt sich danach nicht beanspruchen', async () => {
    scharf(workflow(), '2026-10-28T02:00');
    await welt.pruefer.checkNewAreas();
    const key = faellige()[0].key;
    welt.schalte(false);
    expect(welt.pruefer.claim(key, { root: WURZEL, windowId: 1 })).toBe(false);
  });
});

describe('sameRoot', () => {
  // Pfade über node:path gebaut, nicht als Windows-Literal: Unter Linux ist ein
  // Backslash kein Trenner und ein Laufwerks-Buchstabe kein Wurzel-Anker; der
  // Linux-Prüfstand des Epic-Abschluss-Tests fand genau diese Annahme (3E-000366, E1).
  it('vergleicht aufgelöste Pfade', () => {
    const bereich = path.resolve('Bereich');
    expect(sameRoot(bereich, bereich + path.sep)).toBe(true);
    expect(sameRoot(bereich, path.join(bereich, '..', 'Bereich'))).toBe(true);
    expect(sameRoot(bereich, path.resolve('Anderer'))).toBe(false);
    expect(sameRoot('', bereich)).toBe(false);
  });
});

describe('Kanäle workflow:schedule* (src/main/ipc/workflow-schedule.js)', () => {
  function kanaele(bereichJeFenster) {
    const handler = {};
    registerWorkflowScheduleIpc((kanal, fn) => (handler[kanal] = fn), {
      senderWindow: (event) => ({ id: event.sender.id }),
      areaOfWindow: (win) =>
        bereichJeFenster[win.id] ? { rootPath: bereichJeFenster[win.id] } : null,
      workflowScheduleChecker: welt.pruefer,
      workflowScheduleDelivery: welt.register,
    });
    return handler;
  }
  const ereignis = (id) => ({ sender: { id } });

  it('der Anspruch nimmt die Wurzel des sendenden Fensters, nie eine mitgeschickte', async () => {
    scharf(workflow(), '2026-10-28T02:00');
    await welt.pruefer.checkNewAreas();
    const key = faellige()[0].key;
    const h = kanaele({ 1: WURZEL, 2: WURZEL, 3: ANDERE });
    expect(await h['workflow:scheduleClaim'](ereignis(3), { key, root: WURZEL })).toEqual({
      granted: false,
    });
    expect(await h['workflow:scheduleOpen']()).toMatchObject({ catchUp: true, items: [{ key }] });
    expect(await h['workflow:scheduleClaim'](ereignis(1), { key })).toEqual({ granted: true });
    expect(await h['workflow:scheduleClaim'](ereignis(2), { key })).toEqual({ granted: false });
    expect(await h['workflow:scheduleOpen']()).toEqual({ catchUp: false, items: [] });
    expect(await h['workflow:scheduleFinished'](ereignis(2), { key })).toEqual({
      finished: false,
    });
    expect(await h['workflow:scheduleFinished'](ereignis(1), { key })).toEqual({
      finished: true,
    });
  });

  it('weist eine Nutzlast ohne Schlüssel und ein Fenster ohne Bereich ab', async () => {
    const h = kanaele({ 1: WURZEL });
    expect(await h['workflow:scheduleClaim'](ereignis(1), {})).toEqual({ granted: false });
    expect(await h['workflow:scheduleClaim'](ereignis(9), { key: 'x' })).toEqual({
      granted: false,
    });
    expect(await h['workflow:scheduleRelease'](ereignis(1), null)).toEqual({ released: false });
  });
});
