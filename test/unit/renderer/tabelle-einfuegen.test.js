// @vitest-environment jsdom
// 4T-002554 (Epic 3E-000389): Einfügen aus einer Tabellenkalkulation an einer
// echten EditorView — Strg+V (Einfüge-Behandler editor-paste.js), Kontextmenü
// «Einfügen», die Kommandos «Als reinen Text einfügen» und «Als Tabelle
// einfügen», die Ausnahmen und das Rückgängig in zwei Schritten.
//
// Das Einfüge-Ereignis trägt die am 2026-11-05 aus Microsoft Excel gemessene
// Ablage: Text, Tabellen-Form und ein Bild der Zellen als Datei. Gestellt ist
// allein das Ereignis-Objekt, weil jsdom keine Zwischenablage hat; Behandler,
// Erkennung, Erweiterungs-Zustand und Verlauf sind die echten Module.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Das Menü-Element muss stehen, bevor app-state.js es beim Laden sucht.
vi.hoisted(() => {
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.hidden = true;
  document.body.appendChild(menu);
});

import './api-stub.js';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { contextMenu, state } from '../../../src/renderer/modules/app/app-state.js';
import { paneEditors } from '../../../src/renderer/modules/editor/editor.js';
import { pasteLinkHandler } from '../../../src/renderer/modules/editor/editor-paste.js';
import {
  pasteIntoSelection,
  showEditorContextMenu,
} from '../../../src/renderer/modules/editor/editor-context-menu.js';
import { EDITOR_COMMAND_FUNCTIONS } from '../../../src/renderer/modules/editor/editor-keymaps.js';
import { initCommandPalette } from '../../../src/renderer/modules/command-palette.js';
import {
  applyExtensionsState,
  resetExtensionStateForTests,
} from '../../../src/renderer/modules/extensions/extension-lifecycle.js';

const EXCEL_PLAIN =
  'Name\tWert\tNotiz\r\nAlpha\t12.5\t"zwei\nZeilen"\r\nBe|ta\t7\t\r\nGamma "G"\ta;b\tEnde\r\n';
const EXCEL_HTML =
  '<html><body><table border=0><!--StartFragment--><tr><td>Name</td></tr><!--EndFragment--></table></body></html>';
const EXCEL_DATEIEN = [{ name: 'image.png', type: 'image/png', size: 3327 }];
const REIN = EXCEL_PLAIN.replace(/\r\n/g, '\n');
const TABELLE = [
  '| Name      | Wert | Notiz       |',
  '| --------- | ---- | ----------- |',
  '| Alpha     | 12.5 | zwei Zeilen |',
  '| Be\\|ta    | 7    |             |',
  '| Gamma "G" | a;b  | Ende        |',
].join('\n');

let view = null;

// 4T-002557: `auswahl` stellt eine Mehrfach-Auswahl oder markierten Text,
// weil die Befunde des Review-Schritts an beiden hängen. Der eingebaute
// Link-Behandler von lang-markdown ist wie in editor.js abgeschaltet, sonst
// griffe er vor dem Einfüge-Behandler der Anwendung.
function baue(doc, pos, { readOnly = false, auswahl = null } = {}) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: auswahl || { anchor: pos },
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        history(),
        markdown({ base: markdownLanguage, pasteURLAsLink: false }),
        pasteLinkHandler,
        EditorState.readOnly.of(readOnly),
      ],
    }),
    parent,
  });
  const tab = { viewMode: 'source', editMode: !readOnly, manualPage: false, systemPage: false };
  state.activePaneIndex = 0;
  state.panes[0].tabs = [tab];
  state.panes[0].activeIndex = 0;
  paneEditors[0] = view;
  return view;
}

/**
 * Strg+V (mit `umschalt`: Strg+Umschalt+V) am Weg der Anwendung. Gibt das
 * Ereignis zurück, dessen `preventDefault` beobachtet ist (4T-002557: Der
 * Prüffall zum Bild der Zellen zählt die Aufrufe).
 */
function einfuegen(
  { text = EXCEL_PLAIN, html = EXCEL_HTML, files = EXCEL_DATEIEN } = {},
  { umschalt = false } = {},
) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: umschalt ? 'V' : 'v',
      code: 'KeyV',
      ctrlKey: true,
      shiftKey: umschalt,
      bubbles: true,
      cancelable: true,
    }),
  );
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      getData: (art) => (art === 'text/plain' ? text : art === 'text/html' ? html : ''),
      files,
      types: ['text/plain', 'text/html', 'text/rtf', 'Files'],
    },
  });
  vi.spyOn(ev, 'preventDefault');
  view.contentDOM.dispatchEvent(ev);
  return ev;
}

function zwischenablage(text, html) {
  window.api.clipboardReadText = () => text;
  window.api.clipboardReadHTML = () => html;
}

function menueIds(zeile) {
  const pos = view.state.doc.line(zeile).from;
  view.posAtCoords = () => pos;
  const e = new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperty(e, 'target', { value: view.contentDOM });
  showEditorContextMenu(e, view);
  return [...contextMenu.children].map((el) => el.dataset.menuId).filter(Boolean);
}

beforeEach(() => {
  initCommandPalette({ executeCommand: () => true });
  resetExtensionStateForTests();
  zwischenablage(EXCEL_PLAIN, EXCEL_HTML);
});

afterEach(() => {
  if (view) view.destroy();
  view = null;
  paneEditors.length = 0;
  contextMenu.innerHTML = '';
  contextMenu.hidden = true;
  for (const el of [...document.body.children]) if (el !== contextMenu) el.remove();
  resetExtensionStateForTests();
  delete window.api.clipboardReadText;
  delete window.api.clipboardReadHTML;
});

const DOK = 'Davor\n\n\n\nDanach';

describe('Strg+V aus der Tabellenkalkulation (AK1, AK4, AK5)', () => {
  it('wird zur Pipe-Tabelle mit Kopfzeile, als eigener Block', () => {
    baue(DOK, 7);
    einfuegen();
    expect(view.state.doc.toString()).toBe('Davor\n\n' + TABELLE + '\n\nDanach');
  });

  it('ein Strg+Z stellt den reinen Text her (T2)', () => {
    baue(DOK, 7);
    einfuegen();
    undo(view);
    expect(view.state.doc.toString()).toBe('Davor\n\n' + REIN + '\n\nDanach');
    undo(view);
    expect(view.state.doc.toString()).toBe(DOK);
  });

  // 4T-002557: Der Anlagen-Zweig ruft preventDefault und legt die Anlage
  // asynchron ab; erst die Tabelle unmittelbar nach dem Ereignis und ein Dokument
  // ohne Anlage nach dem Abwarten belegen, dass er nicht zuerst griff.
  it('wird trotz mitgeliefertem Bild der Zellen keine Anlage', async () => {
    baue(DOK, 7);
    const ev = einfuegen();
    expect(view.state.doc.toString()).toBe('Davor\n\n' + TABELLE + '\n\nDanach');
    await new Promise((r) => setTimeout(r, 0));
    const doc = view.state.doc.toString();
    expect(doc).not.toContain('![');
    expect(doc).not.toMatch(/\]\([^)]*image/);
    // Zwei Aufrufe für genau einen behandelnden Zweig: einer im Behandler, einer
    // von CodeMirror, weil der Behandler true zurückgibt (runHandlers).
    expect(ev.preventDefault).toHaveBeenCalledTimes(2);
  });
});

// 4T-002557: Excel legt auch bei einer einzelnen Zelle die Tabellen-Form ab;
// ohne Umwandlung darf der Behandler die URL-Prüfung nicht überspringen.
describe('Eine Zelle mit URL aus der Tabellenkalkulation', () => {
  const URL_TEXT = 'https://example.org/seite';
  const URL_HTML = '<table><tr><td>https://example.org/seite</td></tr></table>';

  it('wird über markiertem Text zum externen Link (pasteUrlAsLink an)', () => {
    state.pasteUrlAsLink = true;
    baue('Ein Anker hier', 0, { auswahl: EditorSelection.single(4, 9) });
    einfuegen({ text: URL_TEXT, html: URL_HTML });
    expect(view.state.doc.toString()).toBe('Ein [Anker](https://example.org/seite) hier');
  });

  it('ohne Umwandlung entsteht keine Anlage', async () => {
    baue(DOK, 7);
    einfuegen({ text: URL_TEXT, html: URL_HTML });
    await new Promise((r) => setTimeout(r, 0));
    const doc = view.state.doc.toString();
    expect(doc).toBe('Davor\n\n' + URL_TEXT + '\n\nDanach');
    expect(doc).not.toContain('![');
  });
});

describe('Ausnahmen: es bleibt beim reinen Text (AK2, AK3)', () => {
  it('Erweiterung «Tabellen-Werkzeuge» aus: reiner Text, keine Anlage', async () => {
    await applyExtensionsState(['table-tools'], { persist: false });
    baue(DOK, 7);
    einfuegen();
    expect(view.state.doc.toString()).toBe('Davor\n\n' + REIN + '\n\nDanach');
  });

  it('Strg+Umschalt+V fügt unverändert ein', () => {
    baue(DOK, 7);
    einfuegen({}, { umschalt: true });
    expect(view.state.doc.toString()).not.toContain('| ---');
    expect(view.state.doc.toString()).toContain('Alpha\t12.5');
  });

  it('im Code-Bereich', () => {
    const doc = '```\n\n```';
    baue(doc, 4);
    einfuegen();
    expect(view.state.doc.toString()).toBe('```\n' + REIN + '\n```');
  });

  it('im Kopf-Block', () => {
    const doc = '---\ntitel: x\n\n---\nText';
    baue(doc, 13);
    einfuegen();
    expect(view.state.doc.toString()).toBe('---\ntitel: x\n' + REIN + '\n---\nText');
  });

  it('in einer bestehenden Tabelle', () => {
    const doc = '| a | b |\n| - | - |\n| 1 |  |';
    baue(doc, doc.length - 2);
    einfuegen();
    expect(view.state.doc.toString()).toBe(doc.slice(0, -2) + REIN + doc.slice(-2));
  });

  it('Text ohne Tabellen-Form, auch mit Tabulatoren', () => {
    baue(DOK, 7);
    einfuegen({ text: 'a\tb\n1\t2', html: '', files: [] });
    expect(view.state.doc.toString()).toBe('Davor\n\na\tb\n1\t2\n\nDanach');
  });

  it('im Lese-Zustand ändert sich nichts', () => {
    baue(DOK, 7, { readOnly: true });
    einfuegen();
    expect(view.state.doc.toString()).toBe(DOK);
  });
});

describe('Kontextmenü «Einfügen» und die beiden Kommandos', () => {
  it('«Einfügen» läuft über denselben Zweig wie Strg+V (AK1)', () => {
    baue(DOK, 7);
    pasteIntoSelection(view);
    expect(view.state.doc.toString()).toBe('Davor\n\n' + TABELLE + '\n\nDanach');
    undo(view);
    expect(view.state.doc.toString()).toBe('Davor\n\n' + REIN + '\n\nDanach');
  });

  it('«Einfügen» im Aus-Zustand: reiner Text', async () => {
    await applyExtensionsState(['table-tools'], { persist: false });
    baue(DOK, 7);
    pasteIntoSelection(view);
    expect(view.state.doc.toString()).toBe('Davor\n\n' + REIN + '\n\nDanach');
  });

  it('Menü: «Als reinen Text einfügen» hinter «Einfügen», «Als Tabelle einfügen» danach', () => {
    baue(DOK, 7);
    const ids = menueIds(3);
    const i = ids.indexOf('paste');
    expect(ids.slice(i, i + 3)).toEqual(['paste', 'pastePlain', 'pasteAsTable']);
  });

  it('Menü im Aus-Zustand: «Als Tabelle einfügen» fehlt, «Als reinen Text einfügen» bleibt (AK3)', async () => {
    await applyExtensionsState(['table-tools'], { persist: false });
    baue(DOK, 7);
    const ids = menueIds(3);
    expect(ids).toContain('pastePlain');
    expect(ids).not.toContain('pasteAsTable');
  });

  it('«Als reinen Text einfügen» fügt die Zwischenablage unverändert ein (AK2)', () => {
    baue(DOK, 7);
    expect(EDITOR_COMMAND_FUNCTIONS['edit.pastePlain'](view)).toBe(true);
    expect(view.state.doc.toString()).toBe('Davor\n\n' + REIN + '\n\nDanach');
  });

  // 4T-002557: Der reine Text geht an jede Auswahl, wie zuvor über replaceSelection.
  it('«Einfügen» mit zwei Schreibmarken setzt Text ohne Tabellen-Form an beiden ein', () => {
    zwischenablage('xy', '');
    const auswahl = EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(4)]);
    baue('ab\ncd', 0, { auswahl });
    pasteIntoSelection(view);
    expect(view.state.doc.toString()).toBe('axyb\ncxyd');
    expect(view.state.selection.ranges.map((r) => r.head)).toEqual([3, 8]);
  });

  it('«Als reinen Text einfügen» mit zwei Schreibmarken setzt an beiden ein', () => {
    const auswahl = EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(4)]);
    baue('ab\ncd', 0, { auswahl });
    expect(EDITOR_COMMAND_FUNCTIONS['edit.pastePlain'](view)).toBe(true);
    expect(view.state.doc.toString()).toBe('a' + REIN + 'b\nc' + REIN + 'd');
    expect(view.state.selection.ranges).toHaveLength(2);
  });

  it('«Als Tabelle einfügen» wandelt Semikolon-Text ohne Tabellen-Form um', () => {
    zwischenablage('Stadt;Einwohner\r\nBern;134000\r\nGenf;203000\r\n', '');
    baue(DOK, 7);
    expect(EDITOR_COMMAND_FUNCTIONS['edit.pasteAsTable'](view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      'Davor\n\n| Stadt | Einwohner |\n| ----- | --------- |\n| Bern  | 134000    |\n| Genf  | 203000    |\n\nDanach',
    );
    undo(view);
    expect(view.state.doc.toString()).toBe(
      'Davor\n\nStadt;Einwohner\nBern;134000\nGenf;203000\n\n\nDanach',
    );
  });

  it('«Als Tabelle einfügen» ohne Zellbereich ändert nichts', () => {
    zwischenablage('nur ein Satz', '');
    baue(DOK, 7);
    expect(EDITOR_COMMAND_FUNCTIONS['edit.pasteAsTable'](view)).toBe(false);
    expect(view.state.doc.toString()).toBe(DOK);
  });
});
