// @vitest-environment jsdom
// 4T-002351 (Epic 3E-000184): Die Hervorhebung im workflow-Block des Editors
// (src/renderer/modules/workflows/workflow-hervorhebung.js).
//
// Geprüft wird am echten Editor mit der Markdown-Sprache: Marken nur im
// workflow-Block der obersten Ebene, Nachzug nach einer Text-Änderung, der
// Aus-Zustand der Erweiterung und dass der Text unverändert bleibt (AK5).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import './api-stub.js';

// Der Schalt-Zustand als Attrappe (Vorbild canvas-pane.test.js): Die Erweiterung
// `workflows` registriert erst 4T-002352, und der echte Lebenszyklus nimmt eine
// unbekannte Kennung nicht in die Aus-Liste auf.
const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));

const { workflowHervorhebung } =
  await import('../../../src/renderer/modules/workflows/workflow-hervorhebung.js');
const { liveRebuildEffect } = await import('../../../src/renderer/modules/live/live-shared.js');

const offen = [];
function sicht(text) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: [markdown(), workflowHervorhebung] }),
    parent,
  });
  offen.push(view);
  return view;
}
// Die gezeichneten Marken als Liste «Art:Text».
const marken = (view) =>
  [...view.dom.querySelectorAll('.cm-wf-keyword, .cm-wf-string, .cm-wf-placeholder')].map(
    (el) => `${el.className.replace('cm-wf-', '')}:${el.textContent}`,
  );

afterEach(() => {
  for (const v of offen.splice(0)) v.destroy();
  aus.clear();
});

describe('Hervorhebung im Editor', () => {
  it('markiert Schlüsselwort, Text und Platzhalter im workflow-Block (AK1)', () => {
    const view = sicht('Text\n\n```workflow\ncreate "{{folder}}/a.md"\nwait 2\n```\n');
    expect(marken(view)).toEqual(
      expect.arrayContaining(['keyword:create', 'placeholder:{{folder}}', 'keyword:wait']),
    );
    const texte = marken(view).filter((m) => m.startsWith('string:'));
    expect(texte.join('')).toContain('/a.md"');
  });

  it('lässt andere Code-Blöcke, Fließtext und Inline-Code unberührt', () => {
    const view = sicht('create "x"\n\n`create "y"`\n\n```js\ncreate "z"\n```\n');
    expect(marken(view)).toEqual([]);
  });

  it('färbt auch ohne Kennzeichen im Dateikopf (E4)', () => {
    const view = sicht('```workflow\nnotify "x"\n```\n');
    expect(marken(view)).toEqual(['keyword:notify', 'string:"x"']);
  });

  it('färbt keinen Block in einem Zitat; er ist kein Workflow-Block (G1)', () => {
    const view = sicht('> ```workflow\n> notify "x"\n> ```\n');
    expect(marken(view)).toEqual([]);
  });

  it('zieht nach einer Text-Änderung nach und ändert den Text nicht (AK5)', () => {
    const view = sicht('```workflow\nnotify "x"\n```\n');
    const zeile = view.state.doc.line(2);
    view.dispatch({ changes: { from: zeile.from, to: zeile.from + 6, insert: 'open' } });
    expect(marken(view)).toEqual(['keyword:open', 'string:"x"']);
    expect(view.state.doc.toString()).toBe('```workflow\nopen "x"\n```\n');
  });

  it('zeigt im Aus-Zustand keine Marke; der Neuaufbau-Effekt zieht nach', () => {
    const view = sicht('```workflow\nnotify "x"\n```\n');
    expect(marken(view)).toHaveLength(2);
    aus.add('workflows');
    view.dispatch({ effects: liveRebuildEffect.of(null) });
    expect(marken(view)).toEqual([]);
  });
});
