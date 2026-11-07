// 4T-002460 (Epic 3E-000367, Story 4S-001143): Der Ereignis-Prüfer im
// Hauptprozess (src/main/checks/workflow-event-check.js), seine Kanäle
// (src/main/ipc/workflow-schedule.js, Art `event`) und sein Aufbau in
// src/main/checks/checkers.js.
//
// Geprüft mit Attrappen für Index-Sicht, Dateitext und Lauf-Stand; das
// Zustell-Register ist das echte (`due-delivery.js`), damit der Anspruch zweier
// Fenster am echten «der erste gewinnt» gemessen wird, und die Prüfsumme der
// Scharf-Schaltung ist die echte (`definitionsPruefsumme`). Der Block
// «Aufbau» läuft an einem echten Bereichs-Ordner mit echter Workflow-Datei und
// echter Begleitdatei, scharf geschaltet über den echten Schreibweg des
// Lauf-Stands — der Scharf-Zustand wird gesetzt, weil die Scharf-Schaltung für
// Ereignisse erst 4T-002463 baut.
//
// Pfade entstehen über `node:path`, damit die Prüfdatei unter Windows und Linux
// gilt.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const path = require('node:path');
const {
  BREMSE_FENSTER_MS,
  BREMSE_GRENZE,
  ENTPRELL_HOECHSTENS_MS,
  ENTPRELL_MS,
  WARTE_TAKT_MS,
  abonniereWorkflowEreignisse,
  createEventBrake,
  createWorkflowEventChecker,
  meldeWorkflowEreignis,
} = require('../../src/main/checks/workflow-event-check.js');
const { createDueDelivery } = require('../../src/main/checks/due-delivery.js');
const { registerWorkflowScheduleIpc } = require('../../src/main/ipc/workflow-schedule.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');
const { createWorkflowRunState } = require('../../src/main/workflows/workflow-run-state.js');
const { createCheckers } = require('../../src/main/checks/checkers.js');

const WURZEL = path.resolve('/Bereich');
const ANDERE = path.resolve('/Anderer');
const imBereich = (...teile) => path.join(WURZEL, ...teile);
const WF = imBereich('Workflows', 'Eingang.md');

function workflow({ event = 'file-created in "Eingang"', trigger = 'event', name = 'Probe' } = {}) {
  return [
    '---',
    'workflow: true',
    `name: ${name}`,
    `trigger: ${trigger}`,
    ...(event ? [`event: ${event}`] : []),
    '---',
    '',
    '```workflow',
    'notify "Lauf"',
    '```',
    '',
  ].join('\n');
}

let welt;

function baue(optionen = {}) {
  const texte = new Map();
  const staende = new Map();
  const zustellungen = [];
  let an = true;
  let indexBereit = true;
  const offeneWurzeln = [WURZEL];
  const lebendeFenster = new Set([1, 2, 3]);
  const register = createDueDelivery({
    broadcast: (kanal, nutzlast) => zustellungen.push({ kanal, nutzlast }),
    dueChannel: 'workflow:eventDue',
    handledChannel: 'workflow:eventDueHandled',
    keyOf: (item) => item.key,
    active: () => an,
    stillOpen: (item) => pruefer.isPending(item.key),
  });
  const pruefer = createWorkflowEventChecker({
    areas: () => offeneWurzeln.map((root) => ({ root })),
    workflowFiles: (root) => {
      if (!indexBereit) return { status: 'indexing', dateien: [] };
      const dateien = [...texte.keys()]
        .filter((abs) => abs.startsWith(root + path.sep))
        .map((absPath) => ({
          absPath,
          relPath: path.relative(root, absPath).split(path.sep).join('/'),
        }));
      return { status: 'ready', dateien };
    },
    readText: async (abs) => (texte.has(abs) ? texte.get(abs) : null),
    readRunState: async (abs) => ({
      stand: staende.has(abs) ? structuredClone(staende.get(abs)) : null,
      defekt: false,
    }),
    enabled: () => an,
    deliver: (nutzlast) => register.deliver(nutzlast),
    claimDelivery: (key) => register.claim([key]).length === 1,
    releaseDelivery: (key) => {
      register.release(key);
    },
    windowAlive: (id) => lebendeFenster.has(id),
    ...optionen,
  });
  welt = {
    texte,
    staende,
    zustellungen,
    register,
    pruefer,
    offeneWurzeln,
    lebendeFenster,
    schalte: (wert) => {
      an = wert;
    },
    indexBereit: (wert) => {
      indexBereit = wert;
    },
  };
}

// Eine scharfe Workflow-Datei mit passender Prüfsumme.
function scharf(text, abs = WF) {
  welt.texte.set(abs, text);
  welt.staende.set(abs, {
    runs: 0,
    lastRun: null,
    armed: { at: '2026-10-31T08:00:00Z', hash: definitionsPruefsumme(text) },
    nextDue: null,
    skipped: null,
  });
}

// Alle zugestellten Fälligkeiten in der Reihenfolge der Zustellung.
function zugestellt() {
  return welt.zustellungen
    .filter((z) => z.kanal === 'workflow:eventDue')
    .flatMap((z) => z.nutzlast.items);
}

// Lässt die Entprellung ablaufen und wartet die Auswertung ab.
async function entprellt(ms = ENTPRELL_MS) {
  await vi.advanceTimersByTimeAsync(ms);
  await welt.pruefer.idle();
}

const neu = (rel, extra = {}) => ({
  type: 'file-created',
  path: imBereich(...rel.split('/')),
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  baue();
});

afterEach(() => {
  welt.pruefer.stop();
  vi.useRealTimers();
});

describe('Abgleich gegen die scharfen Workflows (AK1, AK6)', () => {
  it('ein passendes Ereignis ergibt genau eine Fälligkeit mit Herkunft event und Ereignis-Daten', async () => {
    scharf(workflow());
    const datei = imBereich('Eingang', 'Probe.txt');
    welt.pruefer.report({ type: 'file-created', path: datei });
    expect(zugestellt()).toEqual([]);
    await entprellt();
    const items = zugestellt();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      root: WURZEL,
      path: WF,
      relPath: 'Workflows/Eingang.md',
      name: 'Probe',
      origin: 'event',
      event: { type: 'file-created', file: datei, from: null, task: null },
    });
    expect(welt.zustellungen[0].nutzlast.catchUp).toBe(false);
  });

  it('eine Datei außerhalb des Ordners, ein anderes Ereignis oder ein abweichendes Muster passt nicht', async () => {
    scharf(workflow({ event: 'file-created in "Eingang" matching "*.pdf"' }));
    welt.pruefer.report(neu('Ablage/Rechnung.pdf'));
    welt.pruefer.report({ type: 'file-changed', path: imBereich('Eingang', 'Rechnung.pdf') });
    welt.pruefer.report(neu('Eingang/Notiz.md'));
    await entprellt();
    expect(zugestellt()).toEqual([]);
    welt.pruefer.report(neu('Eingang/Unterordner/Rechnung.PDF'));
    await entprellt();
    expect(zugestellt()).toHaveLength(1);
  });

  it('ein nicht scharfer Workflow läuft nicht bei Ereignissen', async () => {
    welt.texte.set(WF, workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });

  it('eine geänderte Definition ist nicht scharf', async () => {
    scharf(workflow());
    welt.texte.set(WF, workflow().replace('notify "Lauf"', 'notify "Anders"'));
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });

  it('ein scharfer Workflow mit anderem Auslöser läuft nicht bei Ereignissen', async () => {
    scharf(workflow({ trigger: 'manual', event: null }));
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });

  it('im Aus-Zustand der Erweiterung gibt es keine Ereignisse und keinen Anspruch', async () => {
    scharf(workflow());
    welt.schalte(false);
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    await welt.pruefer.checkNewAreas();
    expect(zugestellt()).toEqual([]);
    welt.schalte(true);
    welt.pruefer.report(neu('Eingang/b.txt'));
    await entprellt();
    const [item] = zugestellt();
    welt.schalte(false);
    expect(welt.pruefer.claim(item.key, { root: WURZEL, windowId: 1 })).toBe(false);
  });

  it('Ausschalten verwirft Wartendes; nach dem Einschalten läuft nichts davon nach', async () => {
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    welt.pruefer.report(neu('Eingang/b.txt'));
    await entprellt();
    const [a] = zugestellt();
    welt.pruefer.report(neu('Eingang/c.txt'));
    welt.schalte(false);
    await entprellt(WARTE_TAKT_MS);
    welt.schalte(true);
    await entprellt(WARTE_TAKT_MS * 3);
    expect(zugestellt().map((i) => i.key)).toEqual([a.key]);
    expect(welt.pruefer.isPending(a.key)).toBe(false);
  });

  it('passen mehrere Workflows, entsteht je Workflow eine Fälligkeit in der Reihenfolge ihrer Pfade', async () => {
    const zweiter = imBereich('Workflows', 'B-Zweiter.md');
    const erster = imBereich('Workflows', 'A-Erster.md');
    scharf(workflow({ name: 'Zweiter' }), zweiter);
    scharf(workflow({ name: 'Erster' }), erster);
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    // Zugestellt wird nur die erste; die zweite folgt nach dem Ende ihres Laufs.
    const [eins] = zugestellt();
    expect(eins.name).toBe('Erster');
    expect(welt.pruefer.claim(eins.key, { root: WURZEL, windowId: 1 })).toBe(true);
    expect(welt.pruefer.finish(eins.key, 1)).toBe(true);
    expect(zugestellt().map((i) => i.name)).toEqual(['Erster', 'Zweiter']);
  });
});

describe('Entprellung (AK4)', () => {
  it('drei Meldungen derselben Datei binnen 2 Sekunden ergeben ein Ereignis; angelegt geht vor geändert', async () => {
    scharf(workflow({ event: 'file-created' }));
    const datei = imBereich('Eingang', 'Scan.pdf');
    welt.pruefer.report({ type: 'file-created', path: datei });
    await vi.advanceTimersByTimeAsync(700);
    welt.pruefer.report({ type: 'file-changed', path: datei });
    await vi.advanceTimersByTimeAsync(700);
    welt.pruefer.report({ type: 'file-changed', path: datei });
    await entprellt();
    expect(zugestellt()).toHaveLength(1);
    expect(zugestellt()[0].event.type).toBe('file-created');
  });

  it('Meldungen mit mehr als 2 Sekunden Abstand sind zwei Ereignisse', async () => {
    scharf(workflow({ event: 'file-changed' }));
    const datei = imBereich('Notiz.md');
    welt.pruefer.report({ type: 'file-changed', path: datei });
    await entprellt(ENTPRELL_MS + 500);
    const [eins] = zugestellt();
    welt.pruefer.claim(eins.key, { root: WURZEL, windowId: 1 });
    welt.pruefer.finish(eins.key, 1);
    welt.pruefer.report({ type: 'file-changed', path: datei });
    await entprellt();
    expect(zugestellt()).toHaveLength(2);
  });

  it('eine fortlaufend beschriebene Datei löst spätestens nach der Höchst-Wartezeit aus', async () => {
    scharf(workflow({ event: 'file-changed' }));
    const datei = imBereich('Protokoll.md');
    for (let i = 0; i < ENTPRELL_HOECHSTENS_MS / 1000; i++) {
      welt.pruefer.report({ type: 'file-changed', path: datei });
      await vi.advanceTimersByTimeAsync(1000);
    }
    await welt.pruefer.idle();
    expect(zugestellt()).toHaveLength(1);
  });

  it('Verschieben in der Anwendung und die Meldung «angelegt» am neuen Ort ergeben ein file-moved mit altem Pfad', async () => {
    scharf(workflow({ event: 'file-moved in "Archiv"' }));
    const alt = imBereich('Notiz.md');
    const neuerPfad = imBereich('Archiv', 'Notiz.md');
    welt.pruefer.report({ type: 'file-moved', path: neuerPfad, from: alt });
    await vi.advanceTimersByTimeAsync(250);
    welt.pruefer.report({ type: 'file-created', path: neuerPfad });
    welt.pruefer.report({ type: 'unlink', path: alt });
    await entprellt();
    expect(zugestellt()).toHaveLength(1);
    expect(zugestellt()[0].event).toEqual({
      type: 'file-moved',
      file: neuerPfad,
      from: alt,
      task: null,
    });
  });

  it('eine binnen der Entprellung wieder entfernte Datei löst nichts aus', async () => {
    scharf(workflow());
    const datei = imBereich('Eingang', 'kurz.txt');
    welt.pruefer.report({ type: 'file-created', path: datei });
    await vi.advanceTimersByTimeAsync(500);
    welt.pruefer.report({ type: 'unlink', path: datei });
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });
});

describe('Reichweite und kein Nachholen (AK4)', () => {
  it('Begleitdateien, Punkt-Ordner, Punkt-Dateien und der Sperr-Ordner lösen nie aus', async () => {
    scharf(workflow({ event: 'file-created' }));
    for (const rel of [
      'Eingang/Probe.mdd',
      'Area_Cache.mdda',
      'Eingang/Beleg.mddl',
      '.git/HEAD',
      'Eingang/.versteckt/a.md',
      'Eingang/.~lock.a.md',
      '.area-locks/sperre.json',
    ]) {
      welt.pruefer.report(neu(rel));
    }
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });

  it('ein eingestellter Name des Sperr-Ordners schließt diesen Ordner aus, ein gleichnamiger tiefer nicht', async () => {
    welt.pruefer.stop();
    baue({ sperrOrdnerName: async () => 'Sperren' });
    scharf(workflow({ event: 'file-created' }));
    welt.pruefer.report(neu('Sperren/a.lock'));
    await entprellt();
    expect(zugestellt()).toEqual([]);
    welt.pruefer.report(neu('Eingang/Sperren/a.txt'));
    await entprellt();
    expect(zugestellt()).toHaveLength(1);
  });

  it('nur offene Bereiche: eine Datei eines nicht geöffneten Bereichs löst nichts aus', async () => {
    scharf(workflow({ event: 'file-created' }));
    welt.pruefer.report({ type: 'file-created', path: path.join(ANDERE, 'Eingang', 'a.txt') });
    welt.pruefer.report({ ...neu('Eingang/a.txt'), root: ANDERE });
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });

  it('kein Nachholen: Schließen verwirft Entprelltes und Wartendes, nach dem Wiederöffnen kommt nichts davon', async () => {
    scharf(workflow({ event: 'file-created' }));
    welt.pruefer.report(neu('Eingang/a.txt'));
    welt.pruefer.report(neu('Eingang/b.txt'));
    welt.pruefer.report(neu('Eingang/c.txt'));
    await entprellt();
    // Eine Fälligkeit zugestellt, zwei warten; dazu eine noch entprellte Meldung.
    expect(zugestellt()).toHaveLength(1);
    welt.pruefer.report(neu('Eingang/d.txt'));
    welt.offeneWurzeln.length = 0;
    welt.pruefer.report(neu('Eingang/e.txt'));
    await entprellt(WARTE_TAKT_MS);
    welt.offeneWurzeln.push(WURZEL);
    await entprellt(WARTE_TAKT_MS * 3);
    expect(zugestellt().map((i) => path.basename(i.event.file))).toEqual(['a.txt']);
    expect(welt.pruefer.isPending(zugestellt()[0].key)).toBe(false);
  });

  it('area-opened genau einmal je Öffnen, erst bei bereitem Index, ohne Datei', async () => {
    scharf(workflow({ event: 'area-opened' }));
    welt.indexBereit(false);
    await welt.pruefer.checkNewAreas();
    expect(zugestellt()).toEqual([]);
    welt.indexBereit(true);
    await welt.pruefer.checkNewAreas();
    await welt.pruefer.checkNewAreas();
    expect(zugestellt()).toHaveLength(1);
    expect(zugestellt()[0].event).toEqual({
      type: 'area-opened',
      file: null,
      from: null,
      task: null,
    });
    // Eine Meldung «area-opened» von außen zählt nicht.
    welt.pruefer.report({ type: 'area-opened', path: WURZEL });
    const [eins] = zugestellt();
    welt.pruefer.claim(eins.key, { root: WURZEL, windowId: 1 });
    welt.pruefer.finish(eins.key, 1);
    // Schließen und wieder öffnen: ein neues Ereignis.
    welt.offeneWurzeln.length = 0;
    await welt.pruefer.checkNewAreas();
    welt.offeneWurzeln.push(WURZEL);
    await welt.pruefer.checkNewAreas();
    expect(zugestellt()).toHaveLength(2);
  });

  it('reminder-due und task-done lösen ohne Entprellung aus; task-done trägt den Aufgaben-Text', async () => {
    const erinnerung = imBereich('Erinnerung.md');
    const aufgabe = imBereich('Wochenplan.md');
    scharf(workflow({ event: 'reminder-due', name: 'Erinnerung' }), imBereich('Workflows', 'E.md'));
    welt.pruefer.report({ type: 'reminder-due', path: erinnerung, root: WURZEL });
    await welt.pruefer.idle();
    expect(zugestellt()).toHaveLength(1);
    expect(zugestellt()[0].event.file).toBe(erinnerung);
    welt.texte.clear();
    welt.staende.clear();
    const [eins] = zugestellt();
    welt.pruefer.claim(eins.key, { root: WURZEL, windowId: 1 });
    welt.pruefer.finish(eins.key, 1);
    scharf(workflow({ event: 'task-done in "Wochenplan.md"', name: 'Erledigt' }));
    welt.pruefer.report({ type: 'task-done', path: aufgabe, task: 'Bericht schreiben' });
    await welt.pruefer.idle();
    expect(zugestellt()[1].event).toEqual({
      type: 'task-done',
      file: aufgabe,
      from: null,
      task: 'Bericht schreiben',
    });
  });

  it('die Sammelstelle reicht Meldungen an angemeldete Prüfer weiter (Eintritts-Stelle für task-done)', async () => {
    scharf(workflow({ event: 'task-done', name: 'Erledigt' }));
    const abmelden = abonniereWorkflowEreignisse((m) => welt.pruefer.report(m));
    meldeWorkflowEreignis({ type: 'task-done', path: imBereich('Plan.md'), task: 'X' });
    await welt.pruefer.idle();
    expect(zugestellt()).toHaveLength(1);
    abmelden();
    meldeWorkflowEreignis({ type: 'task-done', path: imBereich('Plan.md'), task: 'Y' });
    await welt.pruefer.idle();
    expect(zugestellt()).toHaveLength(1);
  });
});

describe('Ketten-Schutz und Not-Bremse: Eintritts-Stellen (4T-002461)', () => {
  it('eine Meldung, die istLaufSchreibvorgang erkennt, löst nichts aus', async () => {
    welt.pruefer.stop();
    baue({ istLaufSchreibvorgang: (m) => m.path.endsWith('vom-lauf.txt') });
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/vom-lauf.txt'));
    welt.pruefer.report(neu('Eingang/von-aussen.txt'));
    await entprellt();
    expect(zugestellt().map((i) => path.basename(i.event.file))).toEqual(['von-aussen.txt']);
  });

  it('eine Fälligkeit, die darfEinreihen ablehnt, wird nicht eingereiht', async () => {
    welt.pruefer.stop();
    baue({ darfEinreihen: () => false });
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    expect(zugestellt()).toEqual([]);
  });
});

describe('Not-Bremse (4T-002461, 3d, AK4)', () => {
  // Der echte Ereignis-Prüfer mit der echten Not-Bremse; `entschaerfe` nimmt
  // wie der Lauf-Stand den Scharf-Zustand der Attrappe zurück.
  function mitBremse() {
    welt.pruefer.stop();
    const entschaerft = [];
    const bremse = createEventBrake({
      entschaerfe: async (item, brake) => {
        entschaerft.push({ item, brake });
        welt.staende.get(item.path).armed = null;
      },
    });
    baue({ darfEinreihen: bremse.darfEinreihen });
    scharf(workflow());
    return entschaerft;
  }

  // Ein Ereignis, die Fälligkeit zustellen, beanspruchen und beenden (ein Lauf).
  async function einLauf(i) {
    const vorher = zugestellt().length;
    welt.pruefer.report(neu(`Eingang/D${i}.txt`));
    await entprellt();
    const neue = zugestellt().slice(vorher);
    if (neue.length === 0) return null;
    const item = neue[neue.length - 1];
    expect(welt.pruefer.claim(item.key, { root: WURZEL, windowId: 1 })).toBe(true);
    expect(welt.pruefer.finish(item.key, 1)).toBe(true);
    return item;
  }

  it('20 Läufe in 5 Minuten: keine Bremse, der Workflow bleibt scharf', async () => {
    const entschaerft = mitBremse();
    for (let i = 1; i <= BREMSE_GRENZE; i += 1) {
      const item = await einLauf(i);
      expect(item.brake).toBeUndefined();
    }
    expect(BREMSE_GRENZE).toBe(20);
    expect(BREMSE_FENSTER_MS).toBe(5 * 60 * 1000);
    expect(entschaerft).toEqual([]);
    expect(welt.staende.get(WF).armed).not.toBeNull();
  });

  it('der 21. Lauf in 5 Minuten entschärft: Brems-Meldung statt Lauf, danach nichts mehr', async () => {
    const entschaerft = mitBremse();
    for (let i = 1; i <= BREMSE_GRENZE; i += 1) await einLauf(i);
    const einundzwanzig = await einLauf(21);
    expect(einundzwanzig).toMatchObject({
      path: WF,
      name: 'Probe',
      origin: 'event',
      brake: { limit: 20, minutes: 5 },
      event: { type: 'file-created', file: imBereich('Eingang', 'D21.txt') },
    });
    expect(entschaerft).toHaveLength(1);
    expect(entschaerft[0].item.path).toBe(WF);
    expect(welt.staende.get(WF).armed).toBeNull();
    // Entschärft: Ein weiteres Ereignis ergibt keine Fälligkeit mehr.
    expect(await einLauf(22)).toBeNull();
    // Erneut scharf geschaltet: Er reagiert wieder, die Zählung beginnt neu.
    scharf(workflow());
    const wieder = await einLauf(23);
    expect(wieder.brake).toBeUndefined();
    expect(entschaerft).toHaveLength(1);
  });

  it('das Fenster gleitet: nach 5 Minuten zählt ein Lauf wieder als erster', async () => {
    const entschaerft = mitBremse();
    for (let i = 1; i <= BREMSE_GRENZE; i += 1) await einLauf(i);
    await vi.advanceTimersByTimeAsync(BREMSE_FENSTER_MS);
    const item = await einLauf(21);
    expect(item.brake).toBeUndefined();
    expect(entschaerft).toEqual([]);
  });

  it('greift die Bremse, verfallen die wartenden Fälligkeiten desselben Workflows', async () => {
    const entschaerft = mitBremse();
    const andererWf = imBereich('Workflows', 'Zweiter.md');
    scharf(workflow({ event: 'file-changed in "Notizen"', name: 'Zweiter' }), andererWf);
    // Eine Fälligkeit des anderen Workflows wartet ebenfalls (Kopf der Schlange).
    welt.pruefer.report({ type: 'file-changed', path: imBereich('Notizen', 'n.md') });
    await entprellt();
    // 21 Ereignisse ohne Anspruch: alle Fälligkeiten von «Probe» warten.
    for (let i = 1; i <= BREMSE_GRENZE + 1; i += 1) {
      welt.pruefer.report(neu(`Eingang/W${i}.txt`));
    }
    await entprellt();
    expect(entschaerft).toHaveLength(1);
    // Kopf ist die Fälligkeit des anderen Workflows; danach kommt allein die Brems-Meldung.
    const kopf = zugestellt()[0];
    expect(kopf.path).toBe(andererWf);
    welt.pruefer.claim(kopf.key, { root: WURZEL, windowId: 1 });
    welt.pruefer.finish(kopf.key, 1);
    const rest = zugestellt().filter((i) => i.key !== kopf.key);
    expect(new Set(rest.map((i) => i.key)).size).toBe(1);
    expect(rest[0].brake).toEqual({ limit: 20, minutes: 5 });
    welt.pruefer.claim(rest[0].key, { root: WURZEL, windowId: 1 });
    welt.pruefer.finish(rest[0].key, 1);
    await vi.advanceTimersByTimeAsync(WARTE_TAKT_MS * 2);
    expect(new Set(zugestellt().map((i) => i.key)).size).toBe(2);
  });

  it('ein Fehler beim Entschärfen hält die Brems-Meldung nicht auf', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bremse = createEventBrake({
      entschaerfe: async () => {
        throw new Error('Platte voll');
      },
      now: () => 0,
    });
    const item = { path: WF };
    for (let i = 0; i < BREMSE_GRENZE; i += 1) expect(bremse.darfEinreihen(item)).toBe(true);
    expect(await bremse.darfEinreihen(item)).toEqual({ brake: { limit: 20, minutes: 5 } });
    expect(warn).toHaveBeenCalled();
    // Danach beginnt die Zählung neu.
    expect(bremse.darfEinreihen(item)).toBe(true);
    warn.mockRestore();
  });
});

describe('Warteschlange je Bereich und Zustellung an genau ein Fenster (AK3, AK5)', () => {
  it('ein belegtes Fenster lässt die Fälligkeit stehen; sie kommt im Warte-Takt erneut und danach in Reihenfolge', async () => {
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    await vi.advanceTimersByTimeAsync(100);
    welt.pruefer.report(neu('Eingang/b.txt'));
    await entprellt();
    // Nur die erste ist zugestellt; das Fenster ist belegt und beansprucht nicht.
    expect(zugestellt().map((i) => path.basename(i.event.file))).toEqual(['a.txt']);
    await vi.advanceTimersByTimeAsync(WARTE_TAKT_MS);
    expect(zugestellt().map((i) => path.basename(i.event.file))).toEqual(['a.txt', 'a.txt']);
    const [a] = zugestellt();
    expect(welt.pruefer.claim(a.key, { root: WURZEL, windowId: 1 })).toBe(true);
    // Während des Laufs wird nichts zugestellt.
    await vi.advanceTimersByTimeAsync(WARTE_TAKT_MS * 2);
    expect(zugestellt()).toHaveLength(2);
    welt.pruefer.finish(a.key, 1);
    expect(path.basename(zugestellt()[2].event.file)).toBe('b.txt');
  });

  it('Rückgabe nach dem Anspruch: die Fälligkeit bleibt erste und wird erneut zugestellt', async () => {
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    const [a] = zugestellt();
    expect(welt.pruefer.claim(a.key, { root: WURZEL, windowId: 1 })).toBe(true);
    expect(welt.pruefer.release(a.key, 2)).toBe(false);
    expect(welt.pruefer.release(a.key, 1)).toBe(true);
    expect(welt.pruefer.isPending(a.key)).toBe(true);
    await vi.advanceTimersByTimeAsync(WARTE_TAKT_MS);
    expect(zugestellt().at(-1).key).toBe(a.key);
    expect(welt.pruefer.claim(a.key, { root: WURZEL, windowId: 2 })).toBe(true);
  });

  it('zwei Ansprüche auf dieselbe Fälligkeit: der erste gewinnt; ein Fenster eines anderen Bereichs nie', async () => {
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    await entprellt();
    const [a] = zugestellt();
    expect(welt.pruefer.claim(a.key, { root: ANDERE, windowId: 3 })).toBe(false);
    expect(welt.pruefer.claim(a.key, { root: WURZEL, windowId: 1 })).toBe(true);
    expect(welt.pruefer.claim(a.key, { root: WURZEL, windowId: 2 })).toBe(false);
    expect(welt.pruefer.finish(a.key, 2)).toBe(false);
    expect(welt.zustellungen.some((z) => z.kanal === 'workflow:eventDueHandled')).toBe(true);
  });

  it('ein Fenster, das mitten im Lauf schließt, gibt die nächste Fälligkeit frei, ohne den Lauf zu wiederholen', async () => {
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    welt.pruefer.report(neu('Eingang/b.txt'));
    await entprellt();
    const [a] = zugestellt();
    welt.pruefer.claim(a.key, { root: WURZEL, windowId: 1 });
    welt.lebendeFenster.delete(1);
    await vi.advanceTimersByTimeAsync(WARTE_TAKT_MS);
    expect(zugestellt().map((i) => path.basename(i.event.file))).toEqual(['a.txt', 'b.txt']);
  });

  it('100 Meldungen in kurzer Folge: Reihenfolge erhalten, kein Lauf verloren, keiner doppelt', async () => {
    scharf(workflow());
    const namen = Array.from({ length: 100 }, (_, i) => `d${String(i).padStart(3, '0')}.txt`);
    for (const name of namen) {
      welt.pruefer.report(neu(`Eingang/${name}`));
      await vi.advanceTimersByTimeAsync(10);
    }
    await entprellt();
    const gelaufen = [];
    // Zwei Fenster desselben Bereichs greifen abwechselnd zu; je Fälligkeit
    // gewinnt der erste Anspruch.
    for (let runde = 0; runde < 200 && gelaufen.length < 100; runde++) {
      const offen = welt.register.openItems().items;
      if (offen.length === 0) {
        await vi.advanceTimersByTimeAsync(WARTE_TAKT_MS);
        continue;
      }
      const item = offen[0];
      const fenster = runde % 2 === 0 ? [1, 2] : [2, 1];
      const gewonnen = fenster.filter((id) =>
        welt.pruefer.claim(item.key, { root: WURZEL, windowId: id }),
      );
      expect(gewonnen).toHaveLength(1);
      gelaufen.push(path.basename(item.event.file));
      welt.pruefer.finish(item.key, gewonnen[0]);
    }
    expect(gelaufen).toEqual(namen);
  });
});

describe('Kanäle des Laufs nach Ereignis', () => {
  function kanaele(fensterWurzel) {
    const handler = new Map();
    registerWorkflowScheduleIpc((kanal, fn) => handler.set(kanal, fn), {
      senderWindow: () => ({}),
      areaOfWindow: () => (fensterWurzel ? { rootPath: fensterWurzel } : null),
      workflowScheduleChecker: {},
      workflowScheduleDelivery: { openItems: () => ({ items: [] }) },
      workflowEventChecker: welt.pruefer,
      workflowEventDelivery: welt.register,
    });
    return (kanal, nutzlast, id = 1) => handler.get(kanal)({ sender: { id } }, nutzlast);
  }

  it('Anspruch mit der Wurzel des sendenden Fensters, Ende gibt die nächste frei, offener Stand', async () => {
    scharf(workflow());
    welt.pruefer.report(neu('Eingang/a.txt'));
    welt.pruefer.report(neu('Eingang/b.txt'));
    await entprellt();
    const [a] = zugestellt();
    expect(kanaele(ANDERE)('workflow:eventClaim', { key: a.key })).toEqual({ granted: false });
    expect(kanaele(null)('workflow:eventClaim', { key: a.key })).toEqual({ granted: false });
    const ruf = kanaele(WURZEL);
    expect(ruf('workflow:eventOpen').items.map((i) => i.key)).toEqual([a.key]);
    expect(ruf('workflow:eventClaim', { key: a.key })).toEqual({ granted: true });
    expect(ruf('workflow:eventOpen').items).toEqual([]);
    expect(await ruf('workflow:eventFinished', { key: a.key }, 2)).toEqual({ finished: false });
    expect(await ruf('workflow:eventFinished', { key: a.key })).toEqual({ finished: true });
    expect(path.basename(ruf('workflow:eventOpen').items[0].event.file)).toBe('b.txt');
    expect(ruf('workflow:eventRelease', { key: 'unbekannt' })).toEqual({ released: false });
  });

  it('ohne Ereignis-Prüfer antworten die Kanäle wie bei einer unbekannten Fälligkeit', async () => {
    const handler = new Map();
    registerWorkflowScheduleIpc((kanal, fn) => handler.set(kanal, fn), {
      senderWindow: () => ({}),
      areaOfWindow: () => ({ rootPath: WURZEL }),
      workflowScheduleChecker: {},
      workflowScheduleDelivery: {},
    });
    const ruf = (kanal, n) => handler.get(kanal)({ sender: { id: 1 } }, n);
    expect(ruf('workflow:eventClaim', { key: 'k' })).toEqual({ granted: false });
    expect(await ruf('workflow:eventFinished', { key: 'k' })).toEqual({ finished: false });
    expect(ruf('workflow:eventOpen')).toEqual({ catchUp: false, items: [] });
  });
});

describe('Aufbau in checkers.js am echten Bereichs-Ordner', () => {
  let ordner;
  let checkers;

  afterEach(() => {
    if (checkers) checkers.workflowEventChecker.stop();
    checkers = null;
    if (ordner) fs.rmSync(ordner, { recursive: true, force: true });
    ordner = null;
  });

  async function umgebung(workflowText, ausgeschaltet = []) {
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ereignis-'));
    fs.mkdirSync(path.join(ordner, 'Workflows'));
    fs.mkdirSync(path.join(ordner, 'Eingang'));
    const wf = path.join(ordner, 'Workflows', 'Eingang-Probe.md');
    fs.writeFileSync(wf, workflowText);
    const laufStand = createWorkflowRunState({
      mddSuspendedPaths: new Set(),
      mddKeyOf: (p) => p,
      notifyMddDefect: () => {},
    });
    const gesetzt = await laufStand.setArmed(null, wf, {
      hash: definitionsPruefsumme(workflowText),
    });
    expect(gesetzt).toEqual({ ok: true });
    const broadcasts = [];
    const store = { get: (k) => (k === 'extensions.disabled' ? ausgeschaltet : undefined) };
    checkers = createCheckers({
      appRegistry: {
        appIds: () => [1],
        getArea: () => ({ rootPath: ordner, name: 'Probe' }),
        findAppByArea: () => 1,
        windowsOf: () => [],
      },
      getStore: () => store,
      windows: new Map(),
      backlinks: {
        areaTaskLines: () => [
          {
            path: path.join(ordner, 'Termine.md'),
            zeile: 1,
            text: '- [ ] Rückruf ⏰ 2020-01-01 08:00',
          },
        ],
        workflowFilesFor: () => ({
          status: 'ready',
          dateien: [{ absPath: wf, relPath: 'Workflows/Eingang-Probe.md' }],
        }),
      },
      broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
    });
    return { wf, broadcasts };
  }

  const eventDue = (broadcasts) =>
    broadcasts.filter((b) => b.channel === 'workflow:eventDue').flatMap((b) => b.payload.items);

  it('eine gemeldete neue Datei im Ordner «Eingang» ergibt eine Zustellung an die Fenster', async () => {
    const { wf, broadcasts } = await umgebung(workflow({ name: 'Eingang-Probe' }));
    meldeWorkflowEreignis({
      type: 'file-created',
      path: path.join(ordner, 'Eingang', 'Probe.txt'),
      root: ordner,
    });
    await vi.advanceTimersByTimeAsync(ENTPRELL_MS);
    await checkers.workflowEventChecker.idle();
    const items = eventDue(broadcasts);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ path: wf, name: 'Eingang-Probe', origin: 'event' });
    expect(checkers.workflowEventDelivery.openItems().items).toHaveLength(1);
  });

  // Risiko 3j (Epic-Abschluss-Test, 4T-002467): Der Aus-Zustand reicht über die
  // Verdrahtung, also über die Aus-Liste der Einstellungen bis zum Prüfer.
  it('im Aus-Zustand der Erweiterung «Workflows» stellt der verdrahtete Prüfer nichts zu', async () => {
    const { broadcasts } = await umgebung(workflow({ name: 'Eingang-Probe' }), ['workflows']);
    meldeWorkflowEreignis({
      type: 'file-created',
      path: path.join(ordner, 'Eingang', 'Probe.txt'),
      root: ordner,
    });
    await vi.advanceTimersByTimeAsync(ENTPRELL_MS);
    await checkers.workflowEventChecker.idle();
    await checkers.workflowEventChecker.checkNewAreas();
    expect(eventDue(broadcasts)).toEqual([]);
    expect(checkers.workflowEventDelivery.openItems().items).toEqual([]);
  });

  it('fällige Erinnerungen melden reminder-due, die Nachhol-Lieferung beim Öffnen nicht', async () => {
    const { broadcasts } = await umgebung(workflow({ event: 'reminder-due', name: 'Erinnerung' }));
    // Der erste Takt mit bereitem Index ist die Nachhol-Lieferung: kein Ereignis.
    checkers.reminderChecker.tick();
    await checkers.workflowEventChecker.idle();
    expect(broadcasts.some((b) => b.channel === 'reminders:due')).toBe(true);
    expect(eventDue(broadcasts)).toEqual([]);
    // Die Wiederauslösung aus dem Panel ist eine pünktliche Lieferung.
    const [erinnerung] = checkers.reminderChecker.list(ordner).items;
    checkers.reminderChecker.retrigger(ordner, [erinnerung.key]);
    await checkers.workflowEventChecker.idle();
    expect(eventDue(broadcasts)).toHaveLength(1);
    expect(eventDue(broadcasts)[0].event.file).toBe(path.join(ordner, 'Termine.md'));
  });
});
