// @vitest-environment jsdom
// 4T-002024 (Epic 3E-000192): Die Sektion der Diagramm-Kommandos im
// Kontextmenü des Editors (editor/editor-context-menu.js).
//
// Steht die Schreibmarke in einer Datentabelle, trägt das Menü «Diagramm zu
// dieser Tabelle einfügen»; steht sie in einem Diagramm-Block, «Diagramm
// bearbeiten» — nach «Tabelle», vor der Zwischenablage. Die Sektion entfällt im
// schreibgeschützten Editor, bei ausgeschaltetem Bearbeiten, im Aus-Zustand der
// Erweiterung und im Neben-Editor.
//
// Gemessen am Bedienweg: Rechtsklick über showEditorContextMenu an einer
// echten EditorView, das Menü im Element #context-menu, der Eintrag wird
// angeklickt. Einzig die Koordinaten-Auflösung des Editors ist gestellt, weil
// jsdom kein Layout rechnet; sie liefert den Anfang der geklickten Zeile, wie es
// die Anwendung im Quelltext tut. Die Lage selbst liefert das echte Modul
// charts/chart-lage.js, die Einträge das echte charts/chart-menu.js.
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
import { contextMenu, state } from '../../../src/renderer/modules/app/app-state.js';
import { paneEditors } from '../../../src/renderer/modules/editor/editor.js';
import { showEditorContextMenu } from '../../../src/renderer/modules/editor/editor-context-menu.js';
import { initCommandPalette } from '../../../src/renderer/modules/command-palette.js';
import { lageErweiterung } from '../../../src/renderer/modules/charts/chart-lage.js';
import {
  applyExtensionsState,
  resetExtensionStateForTests,
} from '../../../src/renderer/modules/extensions/extension-lifecycle.js';

const Z = '```';
// Zeile 1 Absatz, 3–7 Datentabelle, 8 Name, 10–13 Diagramm, 15–17 Pipe-Tabelle.
const DOK = [
  'Absatz',
  '',
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number',
  '| Januar | 100 |',
  '| Februar | 90 |',
  Z,
  '^umsatz',
  '',
  `${Z}perspective-chart`,
  'table: ^umsatz',
  'type: bar',
  Z,
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  'Ende',
].join('\n');

const ZEILE = { absatz: 1, tabelle: 5, diagramm: 11, pipe: 17 };

let view = null;
let ausgefuehrt = [];

function baue({ viewMode = 'source', editMode = true, readOnly = !editMode } = {}) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({
      doc: DOK,
      extensions: [lageErweiterung, EditorState.readOnly.of(readOnly)],
    }),
    parent,
  });
  const tab = { viewMode, editMode, manualPage: false, systemPage: false, content: DOK };
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
  return [...contextMenu.children].map((el) =>
    el.classList.contains('context-menu-separator') ? '—' : el.dataset.menuId || '?',
  );
}

function eintrag(id) {
  return contextMenu.querySelector(`[data-menu-id="${id}"]`);
}

beforeEach(() => {
  ausgefuehrt = [];
  initCommandPalette({
    executeCommand: (id) => {
      ausgefuehrt.push(id);
      return true;
    },
  });
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

describe('Kontextmenü des Editors: Diagramm-Sektion (4T-002024, AK1, AK6)', () => {
  it('Schreibmarke in der Datentabelle: «Diagramm zu dieser Tabelle einfügen» nach «Tabelle», vor der Zwischenablage', () => {
    baue();
    const ids = rechtsklick(ZEILE.tabelle);
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(ZEILE.tabelle);
    expect(eintrag('chart-insert')).toBeTruthy();
    expect(eintrag('chart-edit')).toBeNull();
    const i = ids.indexOf('chart-insert');
    expect(ids.indexOf('insert')).toBeLessThan(i);
    expect(ids[i - 1]).toBe('—');
    expect(ids[i + 1]).toBe('—');
    expect(ids.indexOf('selectAll')).toBeGreaterThan(i);
    // Beschriftung aus dem Katalog-Schlüssel des Kommandos (ohne geladene
    // Sprache zeigt t() den Schlüssel selbst).
    expect(eintrag('chart-insert').textContent).toBe(t('command.chart.insert'));
  });

  it('der Eintrag führt das Kommando über den Ausführungs-Pfad der Palette aus', () => {
    baue();
    rechtsklick(ZEILE.tabelle);
    eintrag('chart-insert').click();
    expect(ausgefuehrt).toEqual(['chart.insert']);
  });

  it('Schreibmarke im Diagramm-Block: «Diagramm bearbeiten», kein Einfügen', () => {
    baue();
    rechtsklick(ZEILE.diagramm);
    expect(eintrag('chart-edit')).toBeTruthy();
    expect(eintrag('chart-insert')).toBeNull();
    eintrag('chart-edit').click();
    expect(ausgefuehrt).toEqual(['chart.edit']);
  });

  it('geteilte Ansicht und Live-Modus mit der Schreibmarke im Block: derselbe Eintrag', () => {
    for (const viewMode of ['split', 'live']) {
      baue({ viewMode });
      rechtsklick(ZEILE.diagramm);
      expect(eintrag('chart-edit'), viewMode).toBeTruthy();
      view.destroy();
      view = null;
    }
  });

  it('Schreibmarke im Absatz oder in einer gewöhnlichen Tabelle: keine Diagramm-Sektion (AK16)', () => {
    baue();
    for (const zeile of [ZEILE.absatz, ZEILE.pipe]) {
      rechtsklick(zeile);
      expect(eintrag('chart-insert'), `Zeile ${zeile}`).toBeNull();
      expect(eintrag('chart-edit'), `Zeile ${zeile}`).toBeNull();
    }
  });

  it('schreibgeschützter Editor bei ausgeschaltetem Bearbeiten: keine Diagramm-Sektion (AK17)', () => {
    baue({ editMode: false });
    for (const zeile of [ZEILE.tabelle, ZEILE.diagramm]) {
      const ids = rechtsklick(zeile);
      expect(
        ids.filter((id) => id.startsWith('chart-')),
        `Zeile ${zeile}`,
      ).toEqual([]);
    }
  });

  it('Bearbeiten aus, Editor aber nicht schreibgeschützt: keine Diagramm-Sektion', () => {
    // Die Wählbarkeit hängt am Bearbeiten-Zustand des Reiters, nicht allein am
    // Schreibschutz des Editors.
    baue({ editMode: false, readOnly: false });
    rechtsklick(ZEILE.tabelle);
    expect(eintrag('chart-insert')).toBeNull();
  });

  it('Aus-Zustand der Erweiterung, auch über die Datentabelle: keine Diagramm-Sektion (AK22)', async () => {
    for (const aus of [['perspective-chart'], ['perspective-datatable']]) {
      await applyExtensionsState(aus, { persist: false });
      baue();
      rechtsklick(ZEILE.tabelle);
      expect(eintrag('chart-insert'), String(aus)).toBeNull();
      rechtsklick(ZEILE.diagramm);
      expect(eintrag('chart-edit'), String(aus)).toBeNull();
      view.destroy();
      view = null;
      resetExtensionStateForTests();
    }
  });

  it('Neben-Editor (nicht der Editor einer Spalte): keine Diagramm-Sektion', () => {
    // Der Editor der Spalte steht mit der Schreibmarke in der Datentabelle,
    // das Kommando ist dort also wählbar. Der Rechtsklick trifft aber einen
    // zweiten Editor mit demselben Text (etwa das Notiz-Feld): Dessen Menü
    // bekommt die Sektion nicht, denn das Kommando wirkte auf die Spalte.
    const spalte = baue();
    spalte.dispatch({ selection: { anchor: spalte.state.doc.line(ZEILE.tabelle).from } });
    const neben = new EditorView({
      state: EditorState.create({ doc: DOK, extensions: [lageErweiterung] }),
      parent: document.body.appendChild(document.createElement('div')),
    });
    view = neben;
    rechtsklick(ZEILE.tabelle);
    expect(eintrag('chart-insert')).toBeNull();
    // Gegenprobe am Editor der Spalte: dort steht der Eintrag.
    view = spalte;
    rechtsklick(ZEILE.tabelle);
    expect(eintrag('chart-insert')).toBeTruthy();
    neben.destroy();
  });
});
