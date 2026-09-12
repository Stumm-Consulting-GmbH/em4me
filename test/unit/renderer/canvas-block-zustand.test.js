// @vitest-environment jsdom
// 4T-001668 (Epic 3E-000287): Prüffälle der Bedienung des Canvas-Blocks
// außerhalb der Canvas-Ansicht — AK3, AK4, AK5, AK7 und AK8 der Story
// 4S-000923 (Entscheidung E8).
//
// Der Block selbst entsteht in der Render-Pipeline; hier wird er aus **ihr**
// geholt statt von Hand gebaut. Ein selbst geschriebenes Markup prüfte sonst
// eine Form, die es im Betrieb nicht gibt — und genau die Attribute, an denen
// die Bedienung hängt, wären die ersten, die auseinanderliefen.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// live-deco.js hängt am Renderer-Modulgraphen; der Stub stellt den
// Preload-Namensraum bereit, den dessen Modulköpfe erwarten.
import './api-stub.js';

// Die echte Klasse, um `findFromDOM` für den Editor-Fall gezielt zu ersetzen;
// eine Attrappe des ganzen Pakets zöge den halben Editor mit.
import { EditorView } from '@codemirror/view';

import { blockKlapptAuf } from '../../../src/renderer/modules/live/live-deco.js';
import {
  applyCanvasBlocks,
  initCanvasBlock,
  spalteZu,
  startZeileZu,
} from '../../../src/renderer/modules/canvas/canvas-block-zustand.js';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const lies = (rel) => readFileSync(path.join(WURZEL, rel), 'utf8');

const FENCE = [
  '```perspective-canvas',
  '!karte k1 x=0 y=0 b=200 h=100',
  '## Erste Karte',
  '',
  'Ein Text dazu.',
  '```',
].join('\n');
const DOKUMENT = `# Titel\n\n${FENCE}\n`;

// Aufrufe des injizierten Zugangs.
let geoeffnet = [];
// Geöffnete Dokumente je Spalte; das Objekt selbst ist der Schlüssel der
// WeakMap im Modul.
let dokumente = [];

function baueSeite({ live = false, spalten = 1 } = {}) {
  document.body.innerHTML = '';
  const html = renderMarkdown(DOKUMENT, 'de');
  for (let i = 0; i < spalten; i++) {
    const gruppe = document.createElement('section');
    gruppe.className = 'pane-group';
    gruppe.dataset.pane = String(i);
    const inhalt = document.createElement('div');
    inhalt.className = live ? 'cm-editor' : 'content';
    inhalt.innerHTML = html;
    gruppe.appendChild(inhalt);
    document.body.appendChild(gruppe);
  }
  return Array.from(document.querySelectorAll('.pane-group')).map((g) =>
    g.querySelector('.content, .cm-editor'),
  );
}

function blockIn(container) {
  return container.querySelector('.canvas-block');
}

function klick(el) {
  const ev = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  geoeffnet = [];
  dokumente = [
    { content: DOKUMENT, viewMode: 'rendered' },
    { content: DOKUMENT, viewMode: 'rendered' },
  ];
  initCanvasBlock({
    aktivesDokument: (paneIdx) => dokumente[paneIdx] || null,
    oeffneFlaeche: (paneIdx, startZeile) => geoeffnet.push([paneIdx, startZeile]),
  });
});

describe('Aufklapp-Regel: die Canvas bleibt bei der Haus-Regel (AK3, AK4)', () => {
  // **Rot-Probe in beide Richtungen.** E8 sagt ausdrücklich, dass die Canvas
  // NICHT in die Tabellen-Ausnahme kommt: Die Fence-Zeilen sind der einzige
  // Weg, einen Karten-Text ohne Wechsel der Ansicht zu ändern. Wer die
  // Ausnahme dennoch erweitert, macht diese drei Fälle rot.
  it('AK3: außerhalb der Fence bleibt der Block stehen', () => {
    expect(blockKlapptAuf('FencedCode', new Set([1]), 6, 9)).toBe(false);
  });

  it('AK4: berührt die Schreibmarke die Fence, klappt sie zum Klartext auf', () => {
    expect(blockKlapptAuf('FencedCode', new Set([7]), 6, 9)).toBe(true);
    expect(blockKlapptAuf('FencedCode', new Set([6]), 6, 9)).toBe(true);
    expect(blockKlapptAuf('FencedCode', new Set([9]), 6, 9)).toBe(true);
  });

  it('die Ausnahme der Regel nennt weiterhin allein die Tabellen', () => {
    const quelle = lies('src/renderer/modules/live/live-deco.js');
    expect(quelle).toContain("if (name === 'Table') return false;");
    expect(quelle.toLowerCase()).not.toContain('canvas');
  });
});

describe('Zugang zur Canvas-Ansicht (AK5)', () => {
  it('der Klick auf den Knopf löst den Wechsel mit der Stelle der Fence aus', () => {
    const [container] = baueSeite();
    applyCanvasBlocks(container);
    const knopf = blockIn(container).querySelector('.canvas-block-oeffnen');
    klick(knopf);
    // Zeile 3 ist die öffnende Zaun-Zeile des Prüf-Dokuments.
    expect(geoeffnet).toEqual([[0, 3]]);
  });

  it('AK5: im Live-Modus wandert der Schreibpunkt nicht in die Fence', () => {
    const [container] = baueSeite({ live: true });
    applyCanvasBlocks(container);
    const knopf = blockIn(container).querySelector('.canvas-block-oeffnen');
    const ev = klick(knopf);
    // preventDefault hält die Auswahl des Browsers auf — ohne sie setzte der
    // Klick die Schreibmarke in die Fence, und der Block klappte zum Klartext
    // auf, noch bevor die Ansicht gewechselt hat.
    expect(ev.defaultPrevented).toBe(true);
    expect(geoeffnet).toHaveLength(1);
  });

  it('ein Klick neben die Knöpfe bleibt folgenlos und hält nichts auf', () => {
    const [container] = baueSeite();
    applyCanvasBlocks(container);
    const ev = klick(blockIn(container).querySelector('.canvas-block-karte-titel'));
    expect(ev.defaultPrevented).toBe(false);
    expect(geoeffnet).toEqual([]);
  });

  it('ein Block in einer Markdown-Einbettung bleibt passiv', () => {
    const [container] = baueSeite();
    const huelle = document.createElement('div');
    huelle.className = 'wiki-embed-md-body';
    huelle.appendChild(blockIn(container));
    container.appendChild(huelle);
    applyCanvasBlocks(container);
    const block = blockIn(container);
    // Seine Stelle bezieht sich auf die eingebettete Datei, nicht auf das
    // geöffnete Dokument; ein Zugang suchte dort in der falschen Datei.
    expect(block.classList.contains('canvas-block-passiv')).toBe(true);
    klick(block.querySelector('.canvas-block-oeffnen'));
    expect(geoeffnet).toEqual([]);
  });

  it('der Klick geht an die Spalte, in der der Block steht', () => {
    const container = baueSeite({ spalten: 2 })[1];
    applyCanvasBlocks(container);
    klick(blockIn(container).querySelector('.canvas-block-oeffnen'));
    expect(geoeffnet).toEqual([[1, 3]]);
  });
});

describe('Klapp-Zustand des Blocks (AK7, AK8)', () => {
  it('AK7: der Klapp-Griff schaltet um; die Kopfzeile bleibt stehen', () => {
    const [container] = baueSeite();
    applyCanvasBlocks(container);
    const block = blockIn(container);
    const knopf = block.querySelector('.canvas-block-klappen');
    expect(block.classList.contains('canvas-block-ist-zu')).toBe(false);

    klick(knopf);
    expect(block.classList.contains('canvas-block-ist-zu')).toBe(true);
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    expect(knopf.title).toBe('Block aufklappen');
    // Zugeklappt verschwindet allein der Rumpf; Kopfzeile und Knöpfe bleiben.
    expect(block.querySelector('.canvas-block-kopf')).not.toBeNull();
    expect(block.querySelector('.canvas-block-rumpf')).not.toBeNull();

    klick(knopf);
    expect(block.classList.contains('canvas-block-ist-zu')).toBe(false);
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    expect(knopf.title).toBe('Block zuklappen');
  });

  it('AK8: der Zustand überlebt eine Neu-Anzeige desselben Dokuments', () => {
    const [container] = baueSeite();
    applyCanvasBlocks(container);
    klick(blockIn(container).querySelector('.canvas-block-klappen'));

    // Neu-Anzeige: dasselbe geöffnete Dokument, frisches Markup.
    const [neu] = baueSeite();
    applyCanvasBlocks(neu);
    expect(blockIn(neu).classList.contains('canvas-block-ist-zu')).toBe(true);
  });

  it('AK8: der Zustand gilt je geöffnetem Dokument', () => {
    const container = baueSeite({ spalten: 2 });
    applyCanvasBlocks(container[0]);
    applyCanvasBlocks(container[1]);
    klick(blockIn(container[0]).querySelector('.canvas-block-klappen'));
    expect(blockIn(container[0]).classList.contains('canvas-block-ist-zu')).toBe(true);
    expect(blockIn(container[1]).classList.contains('canvas-block-ist-zu')).toBe(false);
  });

  it('AK8: der Dokument-Text bleibt byte-gleich', () => {
    const [container] = baueSeite();
    applyCanvasBlocks(container);
    klick(blockIn(container).querySelector('.canvas-block-klappen'));
    klick(blockIn(container).querySelector('.canvas-block-oeffnen'));
    expect(dokumente[0].content).toBe(DOKUMENT);
  });

  it('AK8: der Zustand wird nirgends in ein Dokument geschrieben', () => {
    // Gegenprobe am Modul selbst: Es kennt keinen Schreibweg — weder den des
    // Editors noch den der Fläche. Ein später eingebauter wäre hier rot.
    const quelle = lies('src/renderer/modules/canvas/canvas-block-zustand.js');
    expect(quelle).not.toContain('schreibeDokument');
    expect(quelle).not.toContain('view.dispatch');
    expect(quelle).not.toContain('serializeCanvasFence');
    // Der Zustand liegt in einer WeakMap am geöffneten Dokument und stirbt
    // mit ihm (Muster events-view-state.js).
    expect(quelle).toContain('new WeakMap()');
  });

  it('doppeltes Anwenden bindet den Klick-Pfad nicht zweimal', () => {
    const [container] = baueSeite();
    applyCanvasBlocks(container);
    applyCanvasBlocks(container);
    klick(blockIn(container).querySelector('.canvas-block-oeffnen'));
    expect(geoeffnet).toHaveLength(1);
  });
});

describe('Stelle und Spalte eines Blocks', () => {
  it('in der Lese-Ansicht kommt die Stelle aus dem Markup der Pipeline', () => {
    const [container] = baueSeite();
    expect(startZeileZu(blockIn(container))).toBe(3);
    expect(spalteZu(blockIn(container))).toBe(0);
  });

  it('im Editor kommt sie aus dem Dokument, weil das Widget nur die Fence rendert', () => {
    const [container] = baueSeite({ live: true });
    const block = blockIn(container);
    // Das Live-Widget rendert allein den Fence-Quelltext; das Attribut zählt
    // dort ab eins und taugt als Stelle nicht.
    expect(block.dataset.canvasStart).toBe('3');
    const view = {
      posAtDOM: () => 42,
      state: { doc: { length: 200, lineAt: () => ({ number: 17 }) } },
    };
    const cm = block.closest('.cm-editor');
    const original = Object.getOwnPropertyDescriptor(EditorView, 'findFromDOM');
    EditorView.findFromDOM = (el) => (el === cm ? view : null);
    try {
      expect(startZeileZu(block)).toBe(17);
    } finally {
      if (original) Object.defineProperty(EditorView, 'findFromDOM', original);
    }
  });

  it('ein Block außerhalb jeder Spalte meldet -1', () => {
    document.body.innerHTML = renderMarkdown(DOKUMENT, 'de');
    expect(spalteZu(document.querySelector('.canvas-block'))).toBe(-1);
  });
});
