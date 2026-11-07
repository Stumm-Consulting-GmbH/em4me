// @vitest-environment jsdom
// 4T-002465 (Epic 3E-000367, Story 4S-001149, AK5 des Tasks): Der aus der
// Ansicht der Skript-Blöcke herausgelöste Lauf in der Sandbox
// (src/renderer/modules/query/script-sandbox-lauf.js).
//
// Geprüft werden die Abschottung des iframes, die Zeitgrenze samt Entsorgen,
// die Warteschlange je Fenster, die Form-Prüfung der Antwort und der Text einer
// Ausgabe. Dazu ein Bau-Wächter: Die Ansicht baut keine eigene Sandbox mehr,
// beide Aufrufer nutzen denselben Baustein. Die echte Isolation (CSP, opake
// Herkunft, Worker) weist die Ablauf-Suite der Skript-Blöcke nach.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCRIPT_RUN_TIMEOUT_MS,
  antwortPruefen,
  runInScriptSandbox,
  scriptOutputText,
} from '../../../src/renderer/modules/query/script-sandbox-lauf.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const quelle = (rel) => readFileSync(path.join(dir, '../../../src', rel), 'utf8');

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('Sandbox-Lauf: Abschottung und Zeitgrenze', () => {
  it('baut genau ein iframe mit sandbox="allow-scripts" ohne gleiche Herkunft', async () => {
    vi.useFakeTimers();
    const lauf = runInScriptSandbox({ source: 'return 1;', data: null });
    await vi.advanceTimersByTimeAsync(0);
    const frames = document.querySelectorAll('iframe');
    expect(frames.length).toBe(1);
    const frame = frames[0];
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.getAttribute('src')).toBe('script-sandbox.html');
    expect(frame.style.display).toBe('none');
    await vi.advanceTimersByTimeAsync(SCRIPT_RUN_TIMEOUT_MS);
    expect(await lauf).toEqual({ type: 'timeout' });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('die Zeitgrenze ist die der Skript-Blöcke: 5 Sekunden', () => {
    expect(SCRIPT_RUN_TIMEOUT_MS).toBe(5000);
  });

  it('ein Lauf nach dem anderen; ein nicht mehr gebrauchter startet gar nicht', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const erster = runInScriptSandbox({ source: 'a', mount });
    const zweiter = runInScriptSandbox({ source: 'b', isCurrent: () => false });
    const dritter = runInScriptSandbox({ source: 'c' });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('iframe').length).toBe(1);
    expect(mount.querySelector('iframe')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(SCRIPT_RUN_TIMEOUT_MS);
    expect(await erster).toEqual({ type: 'timeout' });
    expect(await zweiter).toEqual({ type: 'stale' });
    expect(document.querySelectorAll('iframe').length).toBe(1);
    await vi.advanceTimersByTimeAsync(SCRIPT_RUN_TIMEOUT_MS);
    expect(await dritter).toEqual({ type: 'timeout' });
  });
});

describe('Sandbox-Lauf: Form der Antwort', () => {
  it('übernimmt nur die erwarteten Formen und Einzelwerte', () => {
    expect(antwortPruefen({ type: 'result', output: [], value: 'x' })).toEqual({
      type: 'result',
      output: [],
      value: 'x',
    });
    expect(antwortPruefen({ type: 'result', output: [], value: { a: 1 } }).value).toBeNull();
    expect(antwortPruefen({ type: 'result', output: [], value: Infinity }).value).toBeNull();
    expect(antwortPruefen({ type: 'error', message: 'm', line: 3 })).toEqual({
      type: 'error',
      message: 'm',
      line: 3,
    });
    for (const fremd of [null, 'x', { type: 'result' }, { type: 'write', path: 'a.md' }]) {
      expect(antwortPruefen(fremd)).toEqual({ type: 'error', message: '', line: null });
    }
  });

  it('liest den Text einer Ausgabe in Lese-Reihenfolge', () => {
    expect(scriptOutputText([{ kind: 'text', text: ' 2 ' }])).toBe('2');
    const liste = {
      kind: 'list',
      items: [{ content: [{ kind: 'text', text: 'a' }], children: [] }],
    };
    const link = { kind: 'link', path: 'b.md', label: 'B' };
    expect(scriptOutputText([liste, link])).toBe('a\nB');
    expect(scriptOutputText(null)).toBe('');
  });
});

describe('Ein Baustein für beide Aufrufer (AK5)', () => {
  it('die Ansicht der Skript-Blöcke baut keine eigene Sandbox und nutzt den Baustein', () => {
    const ansicht = quelle('renderer/modules/query/perspective-script-view.js');
    expect(ansicht).toContain("from './script-sandbox-lauf.js'");
    expect(ansicht).not.toMatch(/createElement\(\s*'iframe'/);
    expect(ansicht).not.toContain('new MessageChannel');
    const start = quelle('renderer/modules/workflows/workflow-start.js');
    expect(start).toContain("from '../query/script-sandbox-lauf.js'");
    expect(start).not.toMatch(/createElement\(\s*'iframe'/);
  });
});
