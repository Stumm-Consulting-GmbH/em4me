// @vitest-environment jsdom
// 4T-002349 (Epic 3E-000184): Die Texte am Ende eines Workflow-Laufs
// (src/renderer/modules/workflows/workflow-lauf-texte.js).
//
// Zwei Aufgaben: die Form des Hinweises «Workflow ‹Name› abgebrochen in Zeile N:
// Grund» (AK7 des Tasks, Story 4S-001105) und ein Durchlauf-Wächter, dass jeder
// Fehlschlag-Code einen Text in fünf Sprachen hat. Die Codes des Hauptprozesses
// und des Fensters stehen als Literale in ihren Modulen; der Wächter zieht sie
// mit einem Muster aus den Quellen (`fehlschlag('…'`, `code: '…'`, Liste der
// Begleitdatei-Codes) statt aus einer Abschrift, und eine untere Schranke hält
// fest, dass die Ernte nicht still schrumpft.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import en from '../../../src/i18n/en.json';
import fr from '../../../src/i18n/fr.json';
import es from '../../../src/i18n/es.json';
import it_ from '../../../src/i18n/it.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { abbruchText, einsetzen, fehlschlagSchluessel, grundText } =
  await import('../../../src/renderer/modules/workflows/workflow-lauf-texte.js');
const { RUNNER_CODES } = await import('../../../src/shared/workflows/workflow-runner.js');
const { BEGLEIT_CODES } = await import('../../../src/main/documents/companion-files.js');

const QUELLEN = [
  'src/main/ipc/workflows.js',
  'src/main/workflows/workflow-file-steps.js',
  'src/main/workflows/workflow-content-steps.js',
  // 4T-002424: die Pflege-Befehle delete und complete-task.
  'src/main/workflows/workflow-maintenance-steps.js',
  'src/main/workflows/workflow-buffer-requests.js',
  'src/main/workflows/workflow-run-state.js',
  'src/shared/workflows/workflow-edit.js',
  'src/renderer/modules/workflows/workflow-window.js',
];
const MUSTER = /(?:fehlschlag\(\s*|code:\s*)'([a-z][A-Za-z]+)'/g;

function geernteteCodes() {
  const codes = new Set();
  for (const datei of QUELLEN) {
    const text = fs.readFileSync(path.resolve(datei), 'utf8');
    for (const m of text.matchAll(MUSTER)) codes.add(m[1]);
  }
  return codes;
}

describe('Durchlauf-Wächter: jeder Fehlschlag-Code hat einen Text', () => {
  const codes = [
    ...new Set([
      ...geernteteCodes(),
      ...RUNNER_CODES,
      ...BEGLEIT_CODES,
      'partial',
      'notWorkflow',
      'fileMissing',
      'workflowFailedOhneZeile',
    ]),
  ].sort();

  it('erntet mindestens 30 Codes', () => {
    expect(codes.length).toBeGreaterThanOrEqual(30);
  });

  it.each([
    ['de', de],
    ['en', en],
    ['fr', fr],
    ['es', es],
    ['it', it_],
  ])('jeder Code steht in der Sprachfassung %s', (_, katalog) => {
    const fehlend = codes
      .map(fehlschlagSchluessel)
      .filter((k) => typeof katalog[k] !== 'string' || katalog[k] === '');
    expect(fehlend).toEqual([]);
  });
});

describe('Texte des Hinweises (AK7)', () => {
  it('Abbruch mit Zeile und Grund', () => {
    const e = {
      status: 'failed',
      workflow: 'Wochenrückblick',
      line: 9,
      code: 'targetExists',
      detail: { path: 'a.md' },
    };
    expect(abbruchText(e)).toBe(
      "Workflow ‹Wochenrückblick› abgebrochen in Zeile 9: Das Ziel 'a.md' gibt es schon",
    );
  });

  it('Abbruch ohne Zeile', () => {
    expect(abbruchText({ status: 'failed', workflow: 'X', line: null, code: 'notWorkflow' })).toBe(
      'Workflow ‹X› abgebrochen: Kein Workflow; im Dateikopf fehlt workflow: true',
    );
  });

  it('Befund der Prüfung als Grund', () => {
    const e = {
      status: 'failed',
      befund: true,
      workflow: 'X',
      line: 7,
      code: 'workflowAmbiguous',
      detail: { name: 'B' },
    };
    expect(abbruchText(e)).toBe(
      "Workflow ‹X› abgebrochen in Zeile 7: Mehrdeutig: mehrere Workflows heißen 'B'",
    );
  });

  it('verschachtelter Abbruch als Kette', () => {
    const inner = { status: 'failed', workflow: 'B', line: 3, code: 'textNotFound', detail: {} };
    const e = {
      status: 'failed',
      workflow: 'A',
      line: 5,
      code: 'workflowFailed',
      detail: { name: 'B', inner },
    };
    expect(abbruchText(e)).toBe(
      'Workflow ‹A› abgebrochen in Zeile 5: Workflow ‹B› abgebrochen in Zeile 3: Text nicht gefunden',
    );
  });

  it('stop mit eigenem Rahmen', () => {
    expect(abbruchText({ status: 'stopped', workflow: 'A', line: 4, text: 'Nichts zu tun' })).toBe(
      'Workflow ‹A› beendet in Zeile 4: Nichts zu tun',
    );
  });

  it('confirm mit «Nein» endet wie stop und nennt die Frage (4T-002424, P4)', () => {
    expect(
      abbruchText({ status: 'stopped', workflow: 'A', line: 6, text: 'Weiter?', declined: true }),
    ).toBe('Workflow ‹A› beendet in Zeile 6: «Weiter?» mit Nein beantwortet');
  });

  it('die neuen Fehlschläge der Pflege-Befehle haben Texte mit Pfad und Suchtext', () => {
    expect(
      grundText({ code: 'taskNotFound', detail: { path: 'Plan.md', text: 'Rückblick' } }),
    ).toBe("Keine offene Aufgabe mit 'Rückblick' in 'Plan.md'");
    expect(grundText({ code: 'trashFailed', detail: { path: 'Alt.md' } })).toBe(
      "'Alt.md' ließ sich nicht in den Papierkorb legen",
    );
  });

  it('ein Code ohne Text meldet sich und erscheint als Code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(grundText({ code: 'gibtEsNicht' })).toBe('gibtEsNicht');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('einsetzen lässt fehlende Werte leer', () => {
    expect(einsetzen('{a}-{b}', { a: 1 })).toBe('1-');
  });
});
