// 4T-002464 (Epic 3E-000367): Die Fragen der Bedingungen und der Schleife im
// Hauptprozess (src/main/workflows/workflow-block-queries.js), Stories
// 4S-001147 und 4S-001148, Entscheidungen 3f und 3g der Konzept-Runde
// 4T-002458.
//
// Gemessen an einem Bereich in einem temporären Ordner; der ungespeicherte
// Stand eines Dokuments ist eine Attrappe von `bufferTextFor`.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  QUERY_KEYWORDS,
  createWorkflowBlockQueries,
  propertyMatches,
} = require('../../src/main/workflows/workflow-block-queries.js');

const tmpDirs = [];
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function bereich({ puffer = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-block-'));
  tmpDirs.push(root);
  const backlinks = { bufferTextFor: (p) => (p in puffer ? puffer[p] : null) };
  const fragen = createWorkflowBlockQueries({ backlinks });
  const ctx = { root, owner: null, event: null, workflowAbs: path.join(root, 'W.md'), backlinks };
  const frage = (keyword, args) =>
    fragen.runQueryStep(ctx, { line: 4, blockLine: 1, keyword, args });
  const schreibe = (rel, text = '') => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    return abs;
  };
  return { root, frage, schreibe, puffer };
}

describe('Befehle des Moduls', () => {
  it('beantwortet die drei Bedingungen und die Schleife', () => {
    expect(QUERY_KEYWORDS).toEqual(['if-exists', 'if-missing', 'if-property', 'for-each']);
  });
});

describe('if-exists und if-missing (4S-001147)', () => {
  it('trifft bei Datei und Ordner zu, if-missing im anderen Fall', async () => {
    const b = bereich();
    b.schreibe('Journal/heute.md', 'x');
    expect(await b.frage('if-exists', ['Journal/heute.md'])).toEqual({ ok: true, value: true });
    expect(await b.frage('if-exists', ['Journal'])).toEqual({ ok: true, value: true });
    expect(await b.frage('if-exists', ['Journal/morgen.md'])).toEqual({ ok: true, value: false });
    expect(await b.frage('if-missing', ['Journal/morgen.md'])).toEqual({ ok: true, value: true });
    expect(await b.frage('if-missing', ['Journal/heute.md'])).toEqual({ ok: true, value: false });
  });

  it('hält die Bereichs-Grenze', async () => {
    const b = bereich();
    expect(await b.frage('if-exists', ['../x.md'])).toMatchObject({
      ok: false,
      code: 'outsideArea',
    });
  });
});

describe('if-property (4S-001147, AK1 und AK5)', () => {
  it('prüft Gleichheit mit Wert und «gesetzt und nicht leer» ohne Wert', async () => {
    const b = bereich();
    b.schreibe('A.md', '---\ntyp: Rechnung\nleer: ""\nzahl: 12\n---\nText\n');
    b.schreibe('C.md', 'ohne Dateikopf\n');
    expect(await b.frage('if-property', ['A.md', 'typ', 'Rechnung'])).toEqual({
      ok: true,
      value: true,
    });
    expect(await b.frage('if-property', ['A.md', 'typ', 'Brief'])).toEqual({
      ok: true,
      value: false,
    });
    expect(await b.frage('if-property', ['A.md', 'typ'])).toEqual({ ok: true, value: true });
    expect(await b.frage('if-property', ['A.md', 'leer'])).toEqual({ ok: true, value: false });
    expect(await b.frage('if-property', ['A.md', 'fehlt'])).toEqual({ ok: true, value: false });
    expect(await b.frage('if-property', ['A.md', 'zahl', 12])).toEqual({ ok: true, value: true });
    expect(await b.frage('if-property', ['A.md', 'zahl', '12'])).toEqual({ ok: true, value: true });
    expect(await b.frage('if-property', ['C.md', 'typ'])).toEqual({ ok: true, value: false });
  });

  it('liest den ungespeicherten Stand vor der Platte', async () => {
    const b = bereich();
    const abs = b.schreibe('A.md', '---\ntyp: Brief\n---\n');
    b.puffer[abs] = '---\ntyp: Rechnung\n---\n';
    expect(await b.frage('if-property', ['A.md', 'typ', 'Rechnung'])).toEqual({
      ok: true,
      value: true,
    });
  });

  it('meldet fehlende Datei, Ordner und unlesbaren Dateikopf als Fehlschlag', async () => {
    const b = bereich();
    b.schreibe('Ordner/x.md');
    b.schreibe('Kaputt.md', '---\n: : :\n  - [\n---\n');
    expect(await b.frage('if-property', ['Fehlt.md', 'typ'])).toEqual({
      ok: false,
      code: 'fileMissing',
      detail: { path: 'Fehlt.md' },
    });
    expect(await b.frage('if-property', ['Ordner', 'typ'])).toMatchObject({
      ok: false,
      code: 'notAFile',
    });
    expect(await b.frage('if-property', ['Kaputt.md', 'typ'])).toMatchObject({
      ok: false,
      code: 'frontmatterInvalid',
    });
  });

  it('trifft bei einer Liste zu, wenn ein Eintrag dem Wert gleicht (Entscheidung 2026-10-31)', async () => {
    expect(propertyMatches({ tags: ['a', 'b'] }, 'tags', 'b')).toBe(true);
    expect(propertyMatches({ tags: ['a', 'b'] }, 'tags', 'c')).toBe(false);
    expect(propertyMatches({ tags: [] }, 'tags')).toBe(false);
    expect(propertyMatches({ tags: [] }, 'tags', 'a')).toBe(false);
    expect(propertyMatches({ tags: ['a'] }, 'tags')).toBe(true);
    expect(propertyMatches({ nummern: [1, 2] }, 'nummern', '2')).toBe(true);
    expect(propertyMatches({ tags: [['a'], { a: 1 }, null] }, 'tags', 'a')).toBe(false);
    const b = bereich();
    b.schreibe('L.md', '---\ntags:\n  - Rechnung\n  - offen\nleer: []\n---\nText\n');
    expect(await b.frage('if-property', ['L.md', 'tags', 'offen'])).toEqual({
      ok: true,
      value: true,
    });
    expect(await b.frage('if-property', ['L.md', 'tags', 'erledigt'])).toEqual({
      ok: true,
      value: false,
    });
    expect(await b.frage('if-property', ['L.md', 'leer'])).toEqual({ ok: true, value: false });
    expect(await b.frage('if-property', ['L.md', 'tags'])).toEqual({ ok: true, value: true });
  });

  it('vergleicht Objekte im Dateikopf mit keinem Text (im Zweifel streng)', () => {
    expect(propertyMatches({ meta: { a: 'x' } }, 'meta', 'x')).toBe(false);
    expect(propertyMatches({ meta: { a: 'x' } }, 'meta')).toBe(true);
    expect(propertyMatches({ x: null }, 'x')).toBe(false);
    expect(propertyMatches({ x: false }, 'x', 'false')).toBe(true);
    expect(propertyMatches(null, 'x')).toBe(false);
    expect(propertyMatches({}, 'constructor')).toBe(false);
  });
});

describe('for-each (4S-001148)', () => {
  it('liefert die passenden Dateien des Ordners, ohne Unterordner', async () => {
    const b = bereich();
    b.schreibe('Eingang/b.md');
    b.schreibe('Eingang/A.MD');
    b.schreibe('Eingang/bild.png');
    b.schreibe('Eingang/Unter/c.md');
    b.schreibe('Eingang/.versteckt.md');
    const r = await b.frage('for-each', ['Eingang/*.md']);
    expect(r.ok).toBe(true);
    expect([...r.files].sort()).toEqual(['Eingang/A.MD', 'Eingang/b.md']);
  });

  it('nimmt mit ** die Unterordner mit, ohne node_modules und Punkt-Ordner (AK2)', async () => {
    const b = bereich();
    b.schreibe('P/a.md');
    b.schreibe('P/x/b.md');
    b.schreibe('P/x/y/c.md');
    b.schreibe('P/node_modules/d.md');
    b.schreibe('P/.git/e.md');
    const r = await b.frage('for-each', ['P/**/*.md']);
    expect([...r.files].sort()).toEqual(['P/a.md', 'P/x/b.md', 'P/x/y/c.md']);
    const alle = await b.frage('for-each', ['P/**']);
    expect(alle.files).toHaveLength(3);
  });

  it('liest die Wurzel des Bereichs und eine leere Menge ohne Fehlschlag', async () => {
    const b = bereich();
    b.schreibe('a.md');
    b.schreibe('Ordner/b.md');
    expect(await b.frage('for-each', ['*.md'])).toEqual({ ok: true, files: ['a.md'] });
    expect(await b.frage('for-each', ['Ordner/*.txt'])).toEqual({ ok: true, files: [] });
  });

  it('meldet einen fehlenden Ordner, eine Datei an seiner Stelle und die Grenze', async () => {
    const b = bereich();
    b.schreibe('Datei.md');
    expect(await b.frage('for-each', ['Fehlt/*.md'])).toEqual({
      ok: false,
      code: 'folderMissing',
      detail: { path: 'Fehlt' },
    });
    expect(await b.frage('for-each', ['Datei.md/*.md'])).toMatchObject({
      ok: false,
      code: 'notAFolder',
    });
    expect(await b.frage('for-each', ['../*.md'])).toMatchObject({
      ok: false,
      code: 'outsideArea',
    });
    expect(await b.frage('for-each', ['a*/b.md'])).toMatchObject({
      ok: false,
      code: 'invalidStep',
    });
  });

  it('bricht bei mehr als 500 Dateien ab, 500 liefert es (AK4)', async () => {
    const b = bereich();
    for (let i = 0; i < 500; i++) b.schreibe(`E/${i}.md`);
    expect((await b.frage('for-each', ['E/*.md'])).files).toHaveLength(500);
    b.schreibe('E/500.md');
    expect(await b.frage('for-each', ['E/*.md'])).toEqual({
      ok: false,
      code: 'tooManyFiles',
      detail: { max: 500 },
    });
  });
});
