// 4T-002465 (Epic 3E-000367, Story 4S-001149, Entscheidung 3n): Die
// Scharf-Schaltung im Hauptprozess (src/main/ipc/workflow-armed.js) weist einen
// Workflow mit Skript-Schritt fail-closed ab, solange die Einstellung
// «Skript-Blöcke ausführen» nicht ausdrücklich eingeschaltet ist (AK4 des Tasks:
// «auch im Hauptprozess»). Kein Weg an der Einstellung vorbei, auch nicht über
// einen Aufruf des Kanals ohne die Prüfung des Fensters.
//
// Geprüft am echten Kanal mit Workflow-Dateien im Temp-Verzeichnis; Attrappen
// sind Fenster, Bereichs-Bindung, Index-Fassade und Einstellungs-Speicher.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerWorkflowArmedIpc } = require('../../src/main/ipc/workflow-armed.js');

let tmpDirs = [];
afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const FENCE = '```';
const TEXT = [
  '---',
  'workflow: true',
  'name: Probe',
  'trigger: schedule',
  'schedule: every day at 23:00',
  '---',
  `${FENCE}workflow`,
  'script "Zählen" as "offen"',
  'notify "Offen: {{script:offen}}"',
  FENCE,
  '',
  '## Zählen',
  `${FENCE}perspective-script`,
  'return 2;',
  FENCE,
  '',
].join('\n');
// Zeile des Skript-Schritts im Dokument.
const ZEILE = 8;

function welt(store) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-skript-'));
  tmpDirs.push(root);
  const abs = path.join(root, 'Probe.md');
  fs.writeFileSync(abs, TEXT, 'utf8');
  const kanaele = new Map();
  // Ungespeicherter Stand des Editors (`bufferTextFor`), null ohne Puffer.
  let puffer = null;
  registerWorkflowArmedIpc((k, fn) => kanaele.set(k, fn), {
    senderWindow: () => ({ id: 'Fenster' }),
    areaOfWindow: () => ({ rootPath: root }),
    backlinks: { bufferTextFor: () => puffer },
    getStore: () => store,
    mddSuspendedPaths: new Set(),
    mddKeyOf: (p) => p.toLowerCase(),
    notifyMddDefect: () => {},
    now: () => new Date(2026, 9, 31, 10, 0).getTime(),
  });
  const setArmed = () => kanaele.get('workflow:setArmed')({}, { workflowPath: abs, armed: true });
  return Object.assign(setArmed, {
    zustand: () => kanaele.get('workflow:armedState')({}, { workflowPath: abs }),
    setzePuffer: (text) => {
      puffer = text;
    },
  });
}

describe('Scharf-Schaltung eines Workflows mit Skript-Schritt (3n, fail-closed)', () => {
  it.each([
    ['ohne Einstellung', { get: (k) => (k === 'extensions.disabled' ? [] : undefined) }],
    ['Einstellung aus', { get: (k) => (k === 'extensions.disabled' ? [] : false) }],
    ['Einstellung als Text', { get: (k) => (k === 'extensions.disabled' ? [] : 'true') }],
  ])('%s: abgewiesen mit dem Befund an der Zeile des Skript-Schritts', async (_, store) => {
    const antwort = await welt(store)();
    expect(antwort.ok).toBe(false);
    expect(antwort.code).toBe('findings');
    expect(antwort.findings).toContainEqual({ code: 'scriptsDisabled', line: ZEILE, detail: {} });
  });
});

// Nachbesserung 4T-002465 (Rahmen 3c/1f der Konzept-Runde 4T-002458): Die
// Prüfsumme der Scharf-Schaltung umfasst den referenzierten Skript-Abschnitt,
// auch im ungespeicherten Stand des Editors.
describe('Scharf-Zustand bei geändertem Skript-Abschnitt (Nachbesserung)', () => {
  const AN = { get: (k) => (k === 'extensions.disabled' ? [] : true) };

  it('eine ungespeicherte Änderung im referenzierten Abschnitt meldet «Definition geändert»', async () => {
    const schalte = welt(AN);
    expect((await schalte()).status).toBe('armed');
    expect((await schalte.zustand()).status).toBe('armed');
    schalte.setzePuffer(TEXT.replace('return 2;', 'return 99;'));
    expect((await schalte.zustand()).status).toBe('definitionChanged');
  });

  it('eine Änderung in einem anderen Abschnitt lässt den Workflow scharf', async () => {
    const schalte = welt(AN);
    await schalte();
    schalte.setzePuffer(`${TEXT}\n## Notizen\n\nFreier Text.\n`);
    expect((await schalte.zustand()).status).toBe('armed');
  });
});
