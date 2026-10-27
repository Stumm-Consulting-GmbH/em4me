// 4T-002348 (Epic 3E-000184): Die Grenze der Bereichs-Wurzel im Hauptprozess
// (AK3): zweite Prüfung am Text, Auflösung gegen die Wurzel, Innerhalb-Prüfung
// und Prüfung des echten Orts auf der Platte.
//
// Bestands-Lesungen: Die Innerhalb-Prüfung ist `isInsideArea`
// (src/main/area/area-path.js), die Text-Prüfung `checkAreaPath`
// (src/shared/workflows/workflow-paths.js). Der Verzeichnis-Knoten entsteht
// mit `fs.symlinkSync(…, 'junction')`, unter Windows ohne Verwalter-Rechte
// anlegbar; wo er sich nicht anlegen lässt, entfällt allein dieser Fall.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveAreaPath } = require('../../src/main/workflows/workflow-area-path.js');
const { prepareRun } = require('../../src/shared/workflows/workflow-core.js');

let tmpDirs = [];

function tempOrdner(praefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  tmpDirs.push(dir);
  return dir;
}

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

describe('resolveAreaPath', () => {
  it('ein Pfad in der Wurzel wird aufgelöst, auch wenn er noch nicht existiert', async () => {
    const wurzel = tempOrdner('em4me-wf-grenze-');
    const res = await resolveAreaPath(wurzel, 'Ordner/Neu.md');
    expect(res).toEqual({ ok: true, abs: path.join(wurzel, 'Ordner', 'Neu.md') });
  });

  it('die Wurzel selbst liegt innerhalb', async () => {
    const wurzel = tempOrdner('em4me-wf-grenze-');
    expect((await resolveAreaPath(wurzel, '.')).ok).toBe(true);
  });

  it.each([
    ['.. am Anfang', '../Fremd.md'],
    ['.. in der Mitte', 'A/../../Fremd.md'],
    ['absoluter Pfad', '/etc/passwd'],
    ['Rückstrich am Anfang', '\\Fremd.md'],
    ['Laufwerks-Angabe', 'C:/Windows/win.ini'],
    ['Freigabe-Adresse', '//server/freigabe/x.md'],
  ])('weist ab: %s', async (_name, pfad) => {
    const wurzel = tempOrdner('em4me-wf-grenze-');
    const res = await resolveAreaPath(wurzel, pfad);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('outsideArea');
  });

  it('ohne Bereich: noArea; leerer Pfad: invalidStep', async () => {
    expect((await resolveAreaPath(null, 'a.md')).code).toBe('noArea');
    const wurzel = tempOrdner('em4me-wf-grenze-');
    expect((await resolveAreaPath(wurzel, '')).code).toBe('invalidStep');
  });

  it('ein Verzeichnis-Knoten im Bereich mit Ziel außerhalb wird abgewiesen', async (ctx) => {
    const wurzel = tempOrdner('em4me-wf-grenze-');
    const fremd = tempOrdner('em4me-wf-fremd-');
    fs.writeFileSync(path.join(fremd, 'Geheim.md'), 'x');
    try {
      fs.symlinkSync(fremd, path.join(wurzel, 'Knoten'), 'junction');
    } catch {
      ctx.skip();
    }
    expect(await resolveAreaPath(wurzel, 'Knoten/Geheim.md')).toMatchObject({
      ok: false,
      code: 'outsideArea',
    });
    expect((await resolveAreaPath(wurzel, 'Knoten/Neu/Neu.md')).code).toBe('outsideArea');
  });

  it('eine andere Schreibweise der Wurzel ändert das Urteil nicht', async () => {
    const wurzel = tempOrdner('em4me-wf-grenze-');
    const schreibweise = process.platform === 'linux' ? wurzel : wurzel.toUpperCase();
    expect((await resolveAreaPath(schreibweise, 'a.md')).ok).toBe(true);
  });

  it('ein Platzhalter, der zu .. gefüllt würde, kommt nie an und würde dennoch abgewiesen', async () => {
    const schritt = {
      line: 3,
      blockLine: 1,
      keyword: 'create',
      args: [{ type: 'path', raw: '{{prompt:Ziel}}/x.md', form: 'string' }],
      source: null,
      position: null,
    };
    const vorbereitet = prepareRun([schritt], { nowMs: 0 }, { 'prompt:Ziel:': '..' }, {});
    expect(vorbereitet.ok).toBe(false);
    expect(vorbereitet.findings[0].code).toBe('pathOutsideArea');
    const wurzel = tempOrdner('em4me-wf-grenze-');
    expect((await resolveAreaPath(wurzel, '../x.md')).code).toBe('outsideArea');
  });
});
