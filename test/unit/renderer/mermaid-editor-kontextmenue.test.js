// @vitest-environment jsdom
// 4T-002617 (Epic 3E-000391): Der Eintrag «Mermaid-Diagramm» im Untermenü
// «Einfügen» des Editor-Kontextmenüs (editor/editor-context-menu.js).
//
// Der Eintrag ist selbst ein Untermenü mit der Auswahl an der Schreibmarke
// (dieselbe Quelle wie Kommando und Knopf der Format-Toolbar): außerhalb jedes
// Code-Blocks die vier Gerüste, im Körper eines Mermaid-Blocks die Bausteine
// seiner Art. Im Aus-Zustand der Erweiterung mermaid fehlt er, wie die
// Einträge von Dashboard und Inhaltsverzeichnis im Aus-Zustand ihrer
// Erweiterung.
//
// Gemessen am Bedienweg (Muster diagramm-editor-kontextmenue.test.js):
// Rechtsklick über showEditorContextMenu an einer echten EditorView, das Menü
// im Element #context-menu, der Eintrag wird angeklickt. Gestellt ist allein
// die Koordinaten-Auflösung, weil jsdom kein Layout rechnet.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Das Menü-Element muss stehen, bevor app-state.js es beim Laden sucht.
vi.hoisted(() => {
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.hidden = true;
  document.body.appendChild(menu);
});

import './api-stub.js';
import { t } from '../../../src/renderer/i18n.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { contextMenu, state } from '../../../src/renderer/modules/app/app-state.js';
import { paneEditors } from '../../../src/renderer/modules/editor/editor.js';
import { showEditorContextMenu } from '../../../src/renderer/modules/editor/editor-context-menu.js';
import { initCommandPalette } from '../../../src/renderer/modules/command-palette.js';
import {
  applyExtensionsState,
  resetExtensionStateForTests,
} from '../../../src/renderer/modules/extensions/extension-lifecycle.js';

const Z = '```';
// Zeile 1 Absatz, 3–7 Mermaid-Ablauf, 9–11 anderer Code-Block.
const DOK = [
  'Absatz',
  '',
  `${Z}mermaid`,
  'flowchart TD',
  '  N1[Start] --> N2[Ende]',
  '',
  Z,
  '',
  `${Z}js`,
  'let a = 1;',
  Z,
  '',
  'Ende',
].join('\n');

const ZEILE = { absatz: 1, koerper: 6, js: 10 };
const GERUESTE = [
  'mermaid-geruest-flowchart',
  'mermaid-geruest-sequenceDiagram',
  'mermaid-geruest-gantt',
  'mermaid-geruest-classDiagram',
];

let view = null;

function baue({ readOnly = false, doc = DOK } = {}) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    // Mit der Markdown-Sprache wie im Editor der Anwendung: Die Lage der
    // Schreibmarke liest den Syntax-Baum.
    state: EditorState.create({
      doc,
      extensions: [markdown({ extensions: [LezerTable] }), EditorState.readOnly.of(readOnly)],
    }),
    parent,
  });
  const tab = { viewMode: 'source', editMode: !readOnly, manualPage: false, content: doc };
  state.activePaneIndex = 0;
  state.panes[0].tabs = [tab];
  state.panes[0].activeIndex = 0;
  paneEditors[0] = view;
  return view;
}

/** Rechtsklick auf eine Zeile, am Weg der Anwendung. */
function rechtsklick(zeile) {
  const pos = view.state.doc.line(zeile).from;
  view.posAtCoords = () => pos;
  const e = new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperty(e, 'target', { value: view.contentDOM });
  showEditorContextMenu(e, view);
}

function eintrag(id) {
  return contextMenu.querySelector(`[data-menu-id="${id}"]`);
}

/** Kennungen der Einträge im Untermenü «Mermaid-Diagramm». */
function auswahlIds() {
  const wrapper = eintrag('insert-mermaid');
  const sub = wrapper.querySelector(':scope > .context-menu-submenu');
  return [...sub.children].map((el) => el.dataset.menuId);
}

beforeEach(() => {
  initCommandPalette({ executeCommand: () => true });
  resetExtensionStateForTests();
});

afterEach(() => {
  if (view) view.destroy();
  view = null;
  paneEditors.length = 0;
  contextMenu.innerHTML = '';
  contextMenu.hidden = true;
  for (const el of [...document.body.children]) if (el !== contextMenu) el.remove();
  resetExtensionStateForTests();
});

describe('Kontextmenü des Editors: Mermaid-Diagramm im Untermenü «Einfügen» (4T-002617)', () => {
  it('außerhalb jedes Code-Blocks: Untermenü mit den vier Gerüsten, nach dem Inhaltsverzeichnis', () => {
    baue();
    rechtsklick(ZEILE.absatz);
    const wrapper = eintrag('insert-mermaid');
    expect(wrapper).toBeTruthy();
    expect(wrapper.classList.contains('context-menu-item-submenu')).toBe(true);
    // Beschriftung ohne Auslassungspunkte aus dem eigenen Schlüssel.
    expect(wrapper.querySelector('.context-menu-item-label').textContent).toBe(
      t('editor.contextMenu.mermaid'),
    );
    expect(auswahlIds()).toEqual(GERUESTE);
    const einfuegen = [...eintrag('insert').querySelector('.context-menu-submenu').children].map(
      (el) => el.dataset.menuId,
    );
    expect(einfuegen.indexOf('insert-mermaid')).toBe(einfuegen.indexOf('insert-toc') + 1);
  });

  it('im Körper eines Mermaid-Ablaufs: die Bausteine der Art, keine Gerüste', () => {
    baue();
    rechtsklick(ZEILE.koerper);
    const ids = auswahlIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('mermaid-baustein-flowchart-'))).toBe(true);
  });

  it('in einem anderen Code-Block: der ausgegraute Hinweis', () => {
    baue();
    rechtsklick(ZEILE.js);
    expect(auswahlIds()).toEqual(['mermaid-bausteine-hinweis']);
    expect(eintrag('mermaid-bausteine-hinweis').classList.contains('disabled')).toBe(true);
  });

  it('Block mit geerbtem Objekt-Schlüssel als Kopf: Menü öffnet sich mit dem Hinweis', () => {
    for (const wort of ['constructor', 'toString']) {
      // Zeile 5 ist die leere Körper-Zeile unter dem Kopf.
      baue({ doc: `Absatz\n\n${Z}mermaid\n${wort}\n\n${Z}\n` });
      rechtsklick(5);
      expect(contextMenu.hidden, wort).toBe(false);
      expect(eintrag('insert'), wort).toBeTruthy();
      expect(auswahlIds(), wort).toEqual(['mermaid-bausteine-hinweis']);
      view.destroy();
      view = null;
      contextMenu.innerHTML = '';
      contextMenu.hidden = true;
    }
  });

  it('ein Klick auf ein Gerüst fügt den Mermaid-Block an der Schreibmarke ein, ein Schritt', () => {
    baue();
    rechtsklick(ZEILE.absatz);
    let dispatches = 0;
    const original = view.dispatch.bind(view);
    view.dispatch = (...args) => {
      dispatches++;
      return original(...args);
    };
    eintrag('mermaid-geruest-flowchart').click();
    expect(dispatches).toBe(1);
    const text = view.state.doc.toString();
    expect(text.split(`${Z}mermaid`).length).toBe(3);
    expect(contextMenu.hidden).toBe(true);
  });

  it('Aus-Zustand der Erweiterung mermaid: kein Eintrag, die übrigen bleiben', async () => {
    await applyExtensionsState(['mermaid'], { persist: false });
    baue();
    rechtsklick(ZEILE.absatz);
    expect(eintrag('insert')).toBeTruthy();
    expect(eintrag('insert-mermaid')).toBeNull();
    expect(eintrag('insert-table')).toBeTruthy();
  });

  it('schreibgeschützter Editor: kein Untermenü «Einfügen», also auch kein Mermaid-Eintrag', () => {
    baue({ readOnly: true });
    rechtsklick(ZEILE.absatz);
    expect(eintrag('insert-mermaid')).toBeNull();
  });
});
