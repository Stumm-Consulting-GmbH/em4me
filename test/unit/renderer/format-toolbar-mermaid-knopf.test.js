// @vitest-environment jsdom
// 4T-002617 (Epic 3E-000391, Entscheidung I1 = B): der Knopf «Mermaid-Diagramm»
// in der Format-Toolbar (editor/format-toolbar.js).
//
// Gemessen an der gerenderten Leiste: Die Standard-Belegung trägt den Knopf am
// Ende; ein Klick öffnet die Auswahl an der Schreibmarke im Element
// #context-menu (dieselbe Quelle wie Kommando und Kontextmenü), ein Klick auf
// ein Gerüst fügt den Block ein. Im Aus-Zustand der Erweiterung mermaid fehlt
// der Knopf, die übrigen Einträge bleiben. Gestellt ist allein der Wechsel der
// aktiven Spalte (activatePane), weil er die ganze Fenster-Oberfläche
// nachzieht, die hier nicht steht.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Menü-Element und Leiste müssen stehen, bevor app-state.js beim Laden sucht.
vi.hoisted(() => {
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.hidden = true;
  document.body.appendChild(menu);
});

// Ohne das Original: Dessen Abhängigkeiten laden format-toolbar.js, das dann
// den echten Wechsel bände (Ring über tabs.js).
vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  activatePane: () => {},
}));

import './api-stub.js';
import { t } from '../../../src/renderer/i18n.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { contextMenu, state } from '../../../src/renderer/modules/app/app-state.js';
import { paneEditors } from '../../../src/renderer/modules/editor/editor.js';
import { renderFormatToolbars } from '../../../src/renderer/modules/editor/format-toolbar.js';
import {
  applyExtensionsState,
  resetExtensionStateForTests,
} from '../../../src/renderer/modules/extensions/extension-lifecycle.js';

const Z = '```';
let view = null;

function baue(doc = 'Absatz\n') {
  const leiste = document.createElement('div');
  leiste.id = 'format-toolbar-0';
  const mehr = document.createElement('button');
  mehr.id = 'btn-format-toolbar-more-0';
  leiste.appendChild(mehr);
  document.body.appendChild(leiste);
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({ state: EditorState.create({ doc, extensions: [markdown()] }), parent });
  const tab = { viewMode: 'source', editMode: true, manualPage: false, content: doc };
  state.activePaneIndex = 0;
  state.panes[0].tabs = [tab];
  state.panes[0].activeIndex = 0;
  paneEditors[0] = view;
  renderFormatToolbars();
  return leiste;
}

function knopf() {
  return document.querySelector('#format-toolbar-0 [data-special="mermaid"]');
}

function menueIds() {
  return [...contextMenu.children].map((el) => el.dataset.menuId);
}

beforeEach(() => {
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

describe('Format-Toolbar: Knopf «Mermaid-Diagramm» (4T-002617)', () => {
  it('steht in der Standard-Belegung als letzter Eintrag hinter einem Trenner', () => {
    const leiste = baue();
    const items = [...leiste.querySelectorAll('.format-toolbar-item')];
    expect(items[items.length - 1]).toBe(knopf());
    expect(items[items.length - 2].classList.contains('format-toolbar-separator')).toBe(true);
    expect(knopf().title).toBe(t('formatToolbar.mermaid'));
    expect(knopf().getAttribute('aria-haspopup')).toBe('menu');
  });

  it('ein Klick öffnet die Auswahl an der Schreibmarke, ein Gerüst wird eingefügt', () => {
    baue();
    knopf().click();
    expect(menueIds()).toEqual([
      'mermaid-geruest-flowchart',
      'mermaid-geruest-sequenceDiagram',
      'mermaid-geruest-gantt',
      'mermaid-geruest-classDiagram',
    ]);
    contextMenu.querySelector('[data-menu-id="mermaid-geruest-sequenceDiagram"]').click();
    expect(view.state.doc.toString()).toContain(`${Z}mermaid\nsequenceDiagram`);
  });

  it('Aus-Zustand der Erweiterung mermaid: kein Knopf, die übrigen Einträge bleiben', async () => {
    await applyExtensionsState(['mermaid'], { persist: false });
    const leiste = baue();
    expect(knopf()).toBeNull();
    expect(leiste.querySelector('[data-command-id="insert.perspectiveTable"]')).toBeTruthy();
    // Der Trenner davor verwaist nicht.
    const items = [...leiste.querySelectorAll('.format-toolbar-item')];
    expect(items[items.length - 1].classList.contains('format-toolbar-separator')).toBe(false);
  });
});
