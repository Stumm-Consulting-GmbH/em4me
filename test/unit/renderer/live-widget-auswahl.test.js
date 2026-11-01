// @vitest-environment jsdom
// 4T-002258: Eine Auswahl des Browsers INNERHALB eines Block-Widgets des
// Live-Modus wird nie zur Schreibmarke (liveWidgetAuswahlFilter in
// live-interaction.js). Im Programm entsteht die Transaktion, wenn der
// Mutations-Beobachter des Editors eine Auswahl liest, die ein Klick in das
// Widget hinterlassen hat; sie trägt das Nutzer-Ereignis `select` und als Ziel
// die Stelle, auf die der Editor die Browser-Auswahl abbildet. Hier wird genau
// diese Transaktion gesendet, an einem echten Editor mit einem Block-Widget der
// Klasse des Live-Modus. Ob der Weg im Programm entsteht, belegen die
// Ablauf-Fälle KZ-01 bis KZ-03 (datentabelle-live-kopf.spec.js).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './api-stub.js';
import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

const { liveWidgetAuswahlFilter } =
  await import('../../../src/renderer/modules/live/live-interaction.js');

const QUELLE = ['# Kopf', '', 'BLOCK', '', 'Ende'].join('\n');
const BLOCK_VON = QUELLE.indexOf('BLOCK');
const BLOCK_BIS = BLOCK_VON + 'BLOCK'.length;

class BlockWidget extends WidgetType {
  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-live-block markdown-body';
    const zelle = document.createElement('td');
    zelle.className = 'pdt-cell';
    zelle.textContent = '800';
    container.appendChild(zelle);
    return container;
  }
  ignoreEvent() {
    return true;
  }
}

const blockFeld = StateField.define({
  create: () =>
    Decoration.set([
      Decoration.replace({ widget: new BlockWidget(), block: true }).range(BLOCK_VON, BLOCK_BIS),
    ]),
  update: (wert) => wert,
  provide: (f) => EditorView.decorations.from(f),
});

let view;

function zellText() {
  return view.dom.querySelector('.cm-live-block td').firstChild;
}

function auswahlIn(knoten, offset) {
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.collapse(knoten, offset);
}

beforeEach(() => {
  view = new EditorView({
    state: EditorState.create({ doc: QUELLE, extensions: [blockFeld, liveWidgetAuswahlFilter] }),
    parent: document.body,
  });
});

afterEach(() => {
  view.destroy();
  document.body.innerHTML = '';
});

describe('Browser-Auswahl im Block-Widget wird nicht zur Schreibmarke (4T-002258)', () => {
  it('die aus dem Widget gelesene Marke wird verworfen, die Schreibmarke bleibt', () => {
    auswahlIn(zellText(), 0);
    const stelle = view.posAtDOM(zellText(), 0);
    expect([BLOCK_VON, BLOCK_BIS]).toContain(stelle);
    view.dispatch({ selection: { anchor: stelle }, userEvent: 'select' });
    expect(view.state.selection.main.head).toBe(0);
  });

  it('Befehle mit eigenem Ziel wirken weiter, auch bei Auswahl im Widget', () => {
    auswahlIn(zellText(), 0);
    view.dispatch({ selection: { anchor: 7 }, userEvent: 'select' });
    expect(view.state.selection.main.head).toBe(7);
  });

  it('Zeiger-Auswahl des Editors und Transaktionen ohne Nutzer-Ereignis bleiben unberührt', () => {
    auswahlIn(zellText(), 0);
    const stelle = view.posAtDOM(zellText(), 0);
    view.dispatch({ selection: { anchor: stelle }, userEvent: 'select.pointer' });
    expect(view.state.selection.main.head).toBe(stelle);
    view.dispatch({ selection: { anchor: 0 } });
    view.dispatch({ selection: { anchor: stelle } });
    expect(view.state.selection.main.head).toBe(stelle);
  });

  it('eine Browser-Auswahl außerhalb des Widgets setzt die Marke wie bisher', () => {
    const kopfText = view.dom.querySelector('.cm-line').firstChild;
    auswahlIn(kopfText, 2);
    view.dispatch({ selection: { anchor: BLOCK_VON }, userEvent: 'select' });
    expect(view.state.selection.main.head).toBe(BLOCK_VON);
  });
});
