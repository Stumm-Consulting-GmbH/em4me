// 4T-002355 (Epic 3E-000184): «Neuer Workflow …» — Inhalt und Anlage der Datei
// (Task AK5, Story 4S-001109 AK4).
//
// Der Inhalt wird mit dem Format-Kern zurückgelesen: Die neue Datei muss als
// Workflow erkannt werden, ihren Namen und ihre Beschreibung tragen und genau
// einen Block mit zwei Kommentar-Zeilen haben, ohne Befund. Angelegt wird gegen
// ein echtes Temp-Verzeichnis.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  NEW_WORKFLOW_CODES,
  createNewWorkflow,
  newWorkflowText,
} = require('../../src/main/workflows/workflow-new-file.js');
const { readWorkflowDocument } = require('../../src/shared/workflows/workflow-document.js');
const { readBlock } = require('../../src/shared/workflows/workflow-line-reader.js');

const TEXTE = {
  description: 'Was dieser Workflow tut.',
  hints: ['Jede Zeile ist ein Befehl.', 'Zeilen mit # am Anfang sind Kommentare.'],
};

let tmpDirs = [];
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function ordner() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-wf-neu-'));
  tmpDirs.push(dir);
  return dir;
}

describe('Inhalt der neuen Datei', () => {
  it('Dateikopf mit Kennzeichen, Name und Beschreibung, leerer Block mit zwei Kommentaren', () => {
    const text = newWorkflowText({ name: 'Wochenrückblick', ...TEXTE });
    const doc = readWorkflowDocument(text, { fileName: 'Wochenrückblick.md' });
    expect(doc.isWorkflow).toBe(true);
    expect(doc.meta.name).toBe('Wochenrückblick');
    expect(doc.meta.description).toBe('Was dieser Workflow tut.');
    expect(doc.findings).toEqual([]);
    expect(doc.block.lines).toEqual([
      '# Jede Zeile ist ein Befehl.',
      '# Zeilen mit # am Anfang sind Kommentare.',
    ]);
  });

  it('die beiden Hilfe-Zeilen sind für den Zeilen-Leser Kommentare', () => {
    const text = newWorkflowText({ name: 'W', ...TEXTE });
    const doc = readWorkflowDocument(text);
    // Keine Anweisung und kein Befund: Beide Zeilen sind Kommentare (Regel G2).
    expect(readBlock(doc.block.lines, doc.block.contentLine)).toEqual({
      statements: [],
      findings: [],
    });
  });

  it('ein Name wie «true» oder «12» bleibt ein Name', () => {
    expect(readWorkflowDocument(newWorkflowText({ name: 'true', ...TEXTE })).meta.name).toBe(
      'true',
    );
    expect(readWorkflowDocument(newWorkflowText({ name: '12', ...TEXTE })).meta.name).toBe('12');
  });
});

describe('Anlage im Workflow-Ordner', () => {
  it('legt «<Name>.md» an und liefert den Pfad; der Name im Kopf ist ohne Endung', async () => {
    const dir = ordner();
    const ergebnis = await createNewWorkflow({
      fsp,
      folder: dir,
      name: ' Tagesnotiz ',
      texts: TEXTE,
    });
    expect(ergebnis).toEqual({ ok: true, path: path.join(dir, 'Tagesnotiz.md') });
    const doc = readWorkflowDocument(fs.readFileSync(ergebnis.path, 'utf8'));
    expect(doc.meta.name).toBe('Tagesnotiz');
    const mitEndung = await createNewWorkflow({ fsp, folder: dir, name: 'B.md', texts: TEXTE });
    expect(readWorkflowDocument(fs.readFileSync(mitEndung.path, 'utf8')).meta.name).toBe('B');
  });

  it('überschreibt nie eine vorhandene Datei', async () => {
    const dir = ordner();
    fs.writeFileSync(path.join(dir, 'Tagesnotiz.md'), 'eigener Inhalt');
    const ergebnis = await createNewWorkflow({
      fsp,
      folder: dir,
      name: 'Tagesnotiz',
      texts: TEXTE,
    });
    expect(ergebnis).toEqual({ ok: false, code: NEW_WORKFLOW_CODES.exists });
    expect(fs.readFileSync(path.join(dir, 'Tagesnotiz.md'), 'utf8')).toBe('eigener Inhalt');
  });

  it('weist unzulässige Namen ab', async () => {
    const dir = ordner();
    for (const name of ['', '   ', 'a/b', 'a\\b', 'x:y', '..']) {
      const ergebnis = await createNewWorkflow({ fsp, folder: dir, name, texts: TEXTE });
      expect(ergebnis).toEqual({ ok: false, code: NEW_WORKFLOW_CODES.invalidName });
    }
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('meldet einen fehlenden Ordner, statt ihn anzulegen', async () => {
    const dir = path.join(ordner(), 'fehlt');
    const ergebnis = await createNewWorkflow({ fsp, folder: dir, name: 'W', texts: TEXTE });
    expect(ergebnis).toEqual({ ok: false, code: NEW_WORKFLOW_CODES.folderMissing });
    expect(fs.existsSync(dir)).toBe(false);
  });
});
