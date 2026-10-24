// @vitest-environment jsdom
// 4T-002333 (Epic 3E-000264, S7, T2): Die Linter-Regeln «mehrdeutiger
// Datensatz-Name» und «Block-Anker verdeckt einen Datensatz» (unten). Trifft
// die Anzeige-Form hinter `^` mehrere Datensätze, gilt
// der Verweis als bestehend, und der Linter zeichnet ihn mit eigener Regel.
// Gespeist wird sie aus der Liste `ambiguousRecord` der Antwort von
// `linter:resolveWikiTargets` (Haupt-Prozess, hier ersetzt); fehlt die Liste,
// ist sie leer.
//
// Geprüft am echten Lint-Lauf (`runLint`) mit echtem Editor und am Hinweis-Text.
// Eine eigene Prüfdatei, weil es für den Lint-Lauf mit Antwort des Index bis
// dahin keine gab.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import de from '../../../src/i18n/de.json';

global.fetch = async () => ({ ok: true, json: async () => de });

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const lint = await import('../../../src/renderer/modules/editor/editor-lint.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

const MEHRDEUTIG = 'Personen#^Max Müller';
const EINDEUTIG = 'Personen#^r-1';
const DOC = `Siehe [[${MEHRDEUTIG}]] und [[${EINDEUTIG}]].\n`;

let host;
let view;
let antwort;
let vorher;

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  host = document.createElement('div');
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [markdown(), lint.lintField] }),
    parent: host,
  });
  paneEditors[0] = view;
  state.panes[0].tabs = [{ path: '/raum/Notiz.md', viewMode: 'source' }];
  state.panes[0].activeIndex = 0;
  vorher = window.api.resolveWikiTargets;
  window.api.resolveWikiTargets = async () => antwort;
});

afterEach(() => {
  window.api.resolveWikiTargets = vorher;
  view.destroy();
  paneEditors.length = 0;
  host.remove();
  state.panes[0].tabs = [];
  state.panes[0].activeIndex = -1;
});

// Regel je markiertem Text.
function marken() {
  const gefunden = [];
  view.state.field(lint.lintField).between(0, view.state.doc.length, (from, to, wert) => {
    gefunden.push([view.state.doc.sliceString(from, to), wert.spec.attributes['data-lint-rule']]);
  });
  return gefunden;
}

describe('Regel ambiguousRecordName', () => {
  it('die mehrdeutige Anzeige-Form bekommt die Regel, der eindeutige Verweis nichts', async () => {
    antwort = {
      status: 'ready',
      existing: [MEHRDEUTIG, EINDEUTIG],
      brokenAnchor: [],
      ambiguous: [],
      ambiguousRecord: [MEHRDEUTIG],
    };
    await lint.runLint(view);
    expect(marken()).toEqual([[`[[${MEHRDEUTIG}]]`, 'ambiguousRecordName']]);
  });

  it('ohne Liste ambiguousRecord (älterer Haupt-Prozess) keine Markierung', async () => {
    antwort = { status: 'ready', existing: [MEHRDEUTIG, EINDEUTIG], brokenAnchor: [] };
    await lint.runLint(view);
    expect(marken()).toEqual([]);
  });

  it('gleiche Gestalt wie das mehrdeutige Verweis-Ziel, eigener Identifier', () => {
    expect(lint.LINT_RULES.ambiguousRecordName.className).toBe(
      lint.LINT_RULES.ambiguousWikiTarget.className,
    );
  });

  it('der Hinweis nennt den Namen, nicht das ganze Ziel', () => {
    const dom = lint.buildLintTooltipDom('ambiguousRecordName', `[[${MEHRDEUTIG}|Max]]`);
    expect(dom.querySelector('.cm-linter-tooltip-title').textContent).toBe(
      'Mehrdeutiger Datensatz-Name',
    );
    const text = dom.querySelector('.cm-linter-tooltip-desc').textContent;
    expect(text).toContain('den Namen Max Müller;');
    expect(text).not.toContain('{target}');
    expect(text).not.toContain('Personen#');
  });
});

// Nachtrag 4T-002333 (E5.2): Ein Block-Anker desselben Namens gewinnt vor dem
// Datensatz. Der Haupt-Prozess meldet ihn in der Liste `shadowedRecord`; der
// Verweis gilt, der Linter sagt, wohin er führt.
describe('Regel blockAnchorShadowsRecord', () => {
  it('der verdeckende Verweis bekommt die Regel, der übrige nichts', async () => {
    antwort = {
      status: 'ready',
      existing: [MEHRDEUTIG, EINDEUTIG],
      brokenAnchor: [],
      ambiguous: [],
      ambiguousRecord: [],
      shadowedRecord: [EINDEUTIG],
    };
    await lint.runLint(view);
    expect(marken()).toEqual([[`[[${EINDEUTIG}]]`, 'blockAnchorShadowsRecord']]);
  });

  it('ohne Liste shadowedRecord keine Markierung', async () => {
    antwort = { status: 'ready', existing: [MEHRDEUTIG, EINDEUTIG], ambiguousRecord: [] };
    await lint.runLint(view);
    expect(marken()).toEqual([]);
  });

  it('der Hinweis nennt den Anker-Namen', () => {
    const dom = lint.buildLintTooltipDom('blockAnchorShadowsRecord', `[[${EINDEUTIG}]]`);
    expect(dom.querySelector('.cm-linter-tooltip-title').textContent).toBe(
      'Block-Anker verdeckt einen Datensatz',
    );
    const text = dom.querySelector('.cm-linter-tooltip-desc').textContent;
    expect(text).toContain('Der Block-Anker r-1 gewinnt');
    expect(text).not.toContain('{target}');
  });
});
