// @vitest-environment jsdom
// 4T-002351 (Epic 3E-000184): Die Kopfzeile über dem workflow-Block der
// Live-Ansicht (src/renderer/modules/workflows/workflow-kopf.js).
//
// Geprüft wird am echten Editor (EditorView in jsdom) mit der Erweiterung aus
// `workflowKopf()`: wo die Kopfzeile steht, was sie sagt, wann sie nachzieht
// (Takt mit falscher Uhr), was der Hook für den Knopf «Starten» bekommt, und
// dass weder Kopfzeile noch Takt den Text verändern (AK5). Die Lage in einem
// gezeichneten Fenster (Pfeiltasten, Block-Widget neben dem ersetzenden
// Widget) misst jsdom nicht; sie ist im Lösungs-Kapitel des Tasks am
// laufenden Programm gemessen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
// Der Schalt-Zustand als Attrappe (Vorbild canvas-pane.test.js): Die Erweiterung
// `workflows` registriert erst 4T-002352, und der echte Lebenszyklus nimmt eine
// unbekannte Kennung nicht in die Aus-Liste auf.
const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { workflowKopf, registriereKopfAktion, kopfAktionenZuruecksetzen, PRUEF_TAKT_MS } =
  await import('../../../src/renderer/modules/workflows/workflow-kopf.js');
const { liveRebuildEffect } = await import('../../../src/renderer/modules/live/live-shared.js');

const KOPF = ['---', 'workflow: true', 'name: Probe', '---', ''];
const datei = (...zeilen) => [...KOPF, ...zeilen, ''].join('\n');
const BLOCK_OK = ['```workflow', 'create "Neu.md"', 'notify "fertig"', '```'];

const offen = [];
function sicht(text) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: [workflowKopf()] }),
    parent,
  });
  offen.push(view);
  return view;
}
const koepfe = (view) => [...view.dom.querySelectorAll('.cm-wf-kopf')];
const aussage = (k) => k.querySelector('.cm-wf-pruefung');

afterEach(() => {
  for (const v of offen.splice(0)) v.destroy();
  kopfAktionenZuruecksetzen();
  aus.clear();
  vi.useRealTimers();
});

describe('Kopfzeile über dem workflow-Block', () => {
  it('steht über der Zaun-Zeile und sagt grün «bereit» (AK2)', () => {
    const view = sicht(datei('Text davor.', '', ...BLOCK_OK));
    const [kopf] = koepfe(view);
    expect(koepfe(view)).toHaveLength(1);
    expect(kopf.dataset.wfZeile).toBe('8');
    expect(kopf.dataset.wfOk).toBe('true');
    expect(aussage(kopf).textContent).toBe('bereit');
    expect(aussage(kopf).classList.contains('cm-wf-pruefung-ok')).toBe(true);
    // Die Kopfzeile steht im Editor vor der Zaun-Zeile.
    const zaun = [...view.dom.querySelectorAll('.cm-line')].find((l) =>
      l.textContent.startsWith('```workflow'),
    );
    expect(kopf.compareDocumentPosition(zaun) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('zeigt rot die Zeile im Dokument und den Grund eines unbekannten Befehls (AK2, AK7)', () => {
    const view = sicht(datei('```workflow', 'fliege "Mond.md"', '```'));
    const [kopf] = koepfe(view);
    expect(kopf.dataset.wfOk).toBe('false');
    expect(aussage(kopf).textContent).toBe("Zeile 7: Unbekannter Befehl 'fliege'");
    expect(aussage(kopf).classList.contains('cm-wf-pruefung-befund')).toBe(true);
  });

  it('nennt den ersten Befund mit «(+N weitere)» und alle im Hinweis-Text (E5)', () => {
    const view = sicht(datei('```workflow', 'fliege "a"', 'wait x', '```'));
    const p = aussage(koepfe(view)[0]);
    expect(p.textContent).toBe("Zeile 7: Unbekannter Befehl 'fliege' (+1 weitere)");
    expect(p.title.split('\n')).toEqual([
      'Prüfung vor dem Laufen',
      "Zeile 7: Unbekannter Befehl 'fliege'",
      'Zeile 8: Keine gültige Zahl',
    ]);
  });

  it('steht über jedem von zwei Blöcken mit dem Hinweis seines Blocks (AK3, E3)', () => {
    const view = sicht(datei(...BLOCK_OK, '', ...BLOCK_OK));
    const k = koepfe(view);
    expect(k.map((x) => x.dataset.wfZeile)).toEqual(['6', '11']);
    expect(aussage(k[0]).textContent).toBe('Zeile 6: 2 workflow-Blöcke; erlaubt ist genau einer');
    expect(aussage(k[1]).textContent).toBe('Zeile 11: 2 workflow-Blöcke; erlaubt ist genau einer');
  });

  it('zeigt den Hinweis auf einen noch nicht unterstützten Auslöser ohne Zeile (AK3)', () => {
    const text = ['---', 'workflow: true', 'trigger: daily', '---', '', ...BLOCK_OK, ''].join('\n');
    const p = aussage(koepfe(sicht(text))[0]);
    expect(p.textContent).toBe(
      "Auslöser 'daily' wird noch nicht unterstützt; der Workflow startet nur von Hand",
    );
  });

  it('fehlt ohne Kennzeichen im Dateikopf und in einer Datei ohne Dateikopf (E4)', () => {
    expect(koepfe(sicht(['---', 'name: x', '---', '', ...BLOCK_OK].join('\n')))).toHaveLength(0);
    expect(koepfe(sicht(BLOCK_OK.join('\n')))).toHaveLength(0);
  });

  it('wechselt nach dem Berichtigen im Takt auf «bereit» und ändert den Text nicht (AK4, AK5)', () => {
    vi.useFakeTimers();
    const view = sicht(datei('```workflow', 'fliege "a"', '```'));
    expect(aussage(koepfe(view)[0]).textContent).toContain('fliege');
    const zeile = view.state.doc.line(7);
    view.dispatch({
      changes: { from: zeile.from, to: zeile.from + 'fliege'.length, insert: 'open' },
    });
    const textNachher = view.state.doc.toString();
    // Vor dem Takt bleibt die alte Aussage stehen, die Kopfzeile folgt dem Text.
    expect(aussage(koepfe(view)[0]).textContent).toContain('fliege');
    vi.advanceTimersByTime(PRUEF_TAKT_MS + 1);
    expect(aussage(koepfe(view)[0]).textContent).toBe('bereit');
    expect(view.state.doc.toString()).toBe(textNachher);
  });

  it('zeigt dieselbe Datei unverändert: der Text des Dokuments bleibt Zeichen für Zeichen (AK5)', () => {
    const text = datei('```workflow', 'create "{{folder}}/a.md"', '```');
    const view = sicht(text);
    expect(koepfe(view)).toHaveLength(1);
    expect(view.state.doc.toString()).toBe(text);
  });
});

describe('Laden des Dokuments zusammen mit der Live-Ansicht', () => {
  // Gemessen am laufenden Programm (Lösungs-Kapitel): Kommt das Feld mit einer
  // Umkonfiguration in derselben Transaktion wie der Text, sah es den Text nicht,
  // und das Plugin bekam kein docChanged. Der Nachhol-Weg rechnet ohne Takt nach.
  it('rechnet nach, wenn Text und Erweiterung in einer Transaktion kommen', () => {
    vi.useFakeTimers();
    const fach = new Compartment();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [fach.of([])] }),
      parent,
    });
    offen.push(view);
    view.dispatch({
      changes: { from: 0, insert: datei(...BLOCK_OK) },
      effects: fach.reconfigure(workflowKopf()),
    });
    vi.advanceTimersByTime(1);
    expect(koepfe(view)).toHaveLength(1);
    expect(aussage(koepfe(view)[0]).textContent).toBe('bereit');
  });
});

describe('Hook für den Knopf «Starten» (Schnittstelle zu 4T-002349)', () => {
  it('ruft jede registrierte Aktion mit Element, Analyse, Zaun-Zeile und Sicht', () => {
    const aufrufe = [];
    registriereKopfAktion((ctx) => {
      aufrufe.push(['a', ctx]);
      const knopf = document.createElement('button');
      knopf.textContent = 'Starten';
      ctx.element.append(knopf);
    });
    registriereKopfAktion((ctx) => aufrufe.push(['b', ctx]));
    const view = sicht(datei(...BLOCK_OK));
    expect(aufrufe.map(([n]) => n)).toEqual(['a', 'b']);
    const [, ctx] = aufrufe[0];
    expect(ctx.zaunZeile).toBe(6);
    expect(ctx.view).toBe(view);
    expect(ctx.analyse.ok).toBe(true);
    expect(ctx.element.classList.contains('cm-wf-aktionen')).toBe(true);
    // Reihenfolge: Prüf-Anzeige links, Aktionen rechts.
    const kopf = koepfe(view)[0];
    expect([...kopf.children].map((c) => c.className.split(' ')[0])).toEqual([
      'cm-wf-pruefung',
      'cm-wf-aktionen',
    ]);
    expect(kopf.querySelector('.cm-wf-aktionen button').textContent).toBe('Starten');
  });

  it('eine fehlschlagende Aktion lässt die Kopfzeile stehen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registriereKopfAktion(() => {
      throw new Error('kaputt');
    });
    expect(koepfe(sicht(datei(...BLOCK_OK)))).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Aus-Zustand der Erweiterung workflows', () => {
  it('ohne Erweiterung keine Kopfzeile; der Neuaufbau-Effekt zieht nach', () => {
    const view = sicht(datei(...BLOCK_OK));
    expect(koepfe(view)).toHaveLength(1);
    aus.add('workflows');
    view.dispatch({ effects: liveRebuildEffect.of(null) });
    expect(koepfe(view)).toHaveLength(0);
  });
});
