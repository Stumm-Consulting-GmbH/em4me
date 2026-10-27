// 4T-002347 (Epic 3E-000184): Der Einstieg in den Format-Kern und seine
// Prozess-Neutralität (AK6).
//
// Bestands-Lesung: Die Import-Prüfung am Modul-Text folgt dem Muster von
// `canvas-austausch.test.js` («bleibt prozessneutral»). Gelesen werden alle
// Dateien unter `src/shared/workflows/`; ihre `require`-Ziele dürfen allein
// relative Pfade innerhalb von `src/shared/` sein, kein Electron, kein `fs`,
// kein `path`, nichts aus `src/main/` oder `src/renderer/`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeWorkflow,
  checkAreaPath,
  isWorkflowFlag,
  prepareRun,
  readLine,
  sectionBody,
  templateInputs,
  templateRefs,
  workflowInputs,
  WORKFLOW_FLAG_KEY,
} from '../../src/shared/workflows/workflow-core.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORDNER = path.join(WURZEL, 'src', 'shared', 'workflows');
const SHARED = path.join(WURZEL, 'src', 'shared');

// Die verbotenen Bezüge eines Modul-Texts; leer, wenn er prozess-neutral ist.
function fremdeBezuege(quelle, datei) {
  const ziele = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  const fremd = ziele.filter((ziel) => {
    if (!ziel.startsWith('.')) return true;
    const aufgeloest = path.resolve(path.dirname(datei), ziel);
    return !aufgeloest.startsWith(SHARED + path.sep);
  });
  // Ein Modul-Pfad wie './workflow-document.js' ist kein Zugriff auf das DOM.
  if (/(?<![\w./-])(?:window|document)\s*\./.test(quelle)) fremd.push('DOM');
  if (/\bimport\s*\(/.test(quelle)) fremd.push('import()');
  return fremd;
}

describe('Prozess-Neutralität des Kerns (AK6)', () => {
  const dateien = fs.readdirSync(ORDNER).filter((d) => d.endsWith('.js'));

  it('besteht aus den Modulen der Pläne (4T-002347, 4T-002348, 4T-002349, 4T-002351, 4T-002364)', () => {
    expect(dateien.sort()).toEqual([
      // 4T-002364: der Umschreib-Kern der Belegungen beim Umbenennen eines Workflows.
      'workflow-binding-rewrite.js',
      'workflow-catalog.js',
      'workflow-check.js',
      // 4T-002349: die Kennung des Kommandos eines Workflows.
      'workflow-command-id.js',
      'workflow-core.js',
      'workflow-document.js',
      // 4T-002348: die eine Bearbeitungs-Regel für Datei und Puffer.
      'workflow-edit.js',
      // 4T-002351: Hervorhebung der Block-Zeilen und ihre gemeinsamen Konstanten.
      'workflow-highlight.js',
      'workflow-konstanten.js',
      'workflow-line-reader.js',
      'workflow-paths.js',
      'workflow-placeholders.js',
      // 4T-002349: der Ablauf-Kern eines Laufs.
      'workflow-runner.js',
    ]);
  });

  it('lädt nur Module aus src/shared, kein Electron, kein Datei-Zugriff, kein DOM', () => {
    for (const d of dateien) {
      const datei = path.join(ORDNER, d);
      expect(fremdeBezuege(fs.readFileSync(datei, 'utf8'), datei), d).toEqual([]);
    }
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('Rot-Probe: ein präparierter Modul-Text wird erkannt', () => {
    const datei = path.join(ORDNER, 'workflow-probe.js');
    expect(fremdeBezuege("const fs = require('fs');", datei)).toEqual(['fs']);
    expect(fremdeBezuege("require('electron')", datei)).toEqual(['electron']);
    expect(fremdeBezuege("require('../../main/backlinks.js')", datei)).toEqual([
      '../../main/backlinks.js',
    ]);
    expect(fremdeBezuege('document.body', datei)).toEqual(['DOM']);
    expect(fremdeBezuege("require('./workflow-document.js')", datei)).toEqual([]);
    expect(fremdeBezuege("require('../template-engine.js')", datei)).toEqual([]);
  });
});

describe('analyzeWorkflow — der Gesamt-Durchlauf', () => {
  const DATEI = [
    '---',
    'workflow: true',
    'name: Wochenstart',
    'description: Legt die Woche an.',
    '---',
    '# Wochenstart',
    '',
    'Beschreibung mit `{{prompt:nicht gemeint}}`.',
    '',
    '```workflow',
    '# Ordner und Notiz',
    'mkdir "Woche/{{prompt:Woche?}}"',
    'create "Woche/{{prompt:Woche?}}/Plan.md" from-template "Vorlagen/Plan.md"',
    'append "Woche/{{prompt:Woche?}}/Plan.md" from-section "Rückblick"',
    'open "Woche/{{prompt:Woche?}}/Plan.md"',
    'notify "Woche {{prompt:Woche?}} angelegt"',
    '```',
    '',
    '## Rückblick',
    '',
    '- Was lief gut?',
  ].join('\n');

  it('erkennt, liest und prüft in einem Zug', () => {
    const a = analyzeWorkflow(DATEI, { fileName: 'Wochenstart.md' });
    expect(a).toMatchObject({ isWorkflow: true, ok: true, findings: [], blockLines: [10] });
    expect(a.meta).toEqual({
      name: 'Wochenstart',
      trigger: 'manual',
      description: 'Legt die Woche an.',
    });
    expect(a.steps.map((s) => s.keyword)).toEqual(['mkdir', 'create', 'append', 'open', 'notify']);
  });

  it('führt durch die ganze Vorbereitung bis zu übertragbaren Schritten', () => {
    const a = analyzeWorkflow(DATEI);
    const eingaben = workflowInputs(a.steps);
    expect(eingaben.map((e) => e.question)).toEqual(['Woche?']);
    const antworten = { [eingaben[0].key]: 'KW43' };
    const kontext = {
      file: 'Wochenstart.md',
      title: 'Wochenstart',
      folder: '',
      area: 'B',
      nowMs: 0,
    };
    const { refs } = templateRefs(a.steps, kontext, antworten);
    const vorlagen = { 'Vorlagen/Plan.md': '# {{title}}' };
    expect(templateInputs(refs, vorlagen, antworten).inputs).toEqual([]);
    const lauf = prepareRun(a.steps, kontext, antworten, vorlagen);
    expect(lauf.ok).toBe(true);
    expect(lauf.steps[1]).toMatchObject({
      args: ['Woche/KW43/Plan.md'],
      source: { kind: 'template', path: 'Vorlagen/Plan.md', text: '# Plan' },
    });
    expect(sectionBody(DATEI, lauf.steps[2].source.name)).toEqual({
      ok: true,
      text: '- Was lief gut?',
    });
  });

  it('nimmt den eigenen Namen für den Selbstaufruf', () => {
    const text = DATEI.replace(
      'notify "Woche {{prompt:Woche?}} angelegt"',
      'workflow "Wochenstart"',
    );
    expect(analyzeWorkflow(text).findings.map((f) => f.code)).toEqual(['selfCall']);
    expect(analyzeWorkflow(text, { ownName: 'Anders' }).ok).toBe(true);
  });

  it('liefert für ein gewöhnliches Dokument keinen Workflow', () => {
    expect(analyzeWorkflow('# Notiz\n\n```workflow\nwait 1\n```\n')).toEqual({
      isWorkflow: false,
      meta: null,
      blockLines: [],
      block: null,
      ok: false,
      steps: [],
      findings: [],
    });
  });

  it('reicht die Bausteine der Fach-Module weiter', () => {
    expect(WORKFLOW_FLAG_KEY).toBe('workflow');
    expect(isWorkflowFlag('true')).toBe(true);
    expect(checkAreaPath('../x')).toEqual({ code: 'pathOutsideArea', kind: 'parent' });
    expect(readLine('wait 1').statement.keyword).toBe('wait');
  });
});
