// @vitest-environment jsdom
// 4T-002617 (Epic 3E-000391): Auswahl der Mermaid-Gerüste und -Bausteine
// (src/renderer/modules/editor/mermaid-bausteine-auswahl.js, V5 und V7 des
// Epics, AK2 und AK6) samt Kommando insert.mermaid in editor-format.js.
//
// Geprüft an einem echten Editor-Zustand mit Markdown-Sprache; die View ist
// eine Attrappe, deren dispatch die Transaktion auf den Zustand anwendet und
// mitschreibt (eine echte EditorView zöge den halben Renderer nach, Muster
// canvas-einfuegen.test.js). Die Texte kommen aus dem deutschen Fragment.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table as LezerTable } from '@lezer/markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const DE = JSON.parse(readFileSync(path.join(wurzel, 'src/i18n/fragments/de/editor.json'), 'utf8'));

const { menu, hinweis, baumSteuerung } = vi.hoisted(() => ({
  menu: document.createElement('div'),
  hinweis: vi.fn(),
  // Steuert den Stub von ensureSyntaxTree: Bei `unfertig` liefert er null wie
  // ein Baum, der in der Frist nicht fertig wird.
  baumSteuerung: { unfertig: false },
}));
vi.mock('@codemirror/language', async (original) => {
  const echt = await original();
  return {
    ...echt,
    ensureSyntaxTree: (...args) => (baumSteuerung.unfertig ? null : echt.ensureSyntaxTree(...args)),
  };
});
vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => (key in DE ? DE[key] : key),
}));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({ contextMenu: menu }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {},
  $: () => null,
  getDocText: (doc) => doc.toString(),
}));
vi.mock('../../../src/renderer/modules/tasks.js', () => ({
  withCreatedDate: (zeile) => zeile,
  todayIsoDate: () => '2026-11-07',
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: hinweis,
}));

const { mermaidLage, mermaidAuswahlEintraege } =
  await import('../../../src/renderer/modules/editor/mermaid-bausteine-auswahl.js');
const { FORMAT_COMMANDS, mermaidAuswahlFuer } =
  await import('../../../src/renderer/modules/editor/editor-format.js');

function mdState(doc, pos) {
  const state = EditorState.create({
    doc,
    selection: { anchor: pos },
    extensions: [markdown({ extensions: [LezerTable] })],
  });
  let guard = 0;
  while (!ensureSyntaxTree(state, state.doc.length, 50) && guard++ < 400) {
    /* weiter */
  }
  return state;
}

// View-Attrappe: dispatch wendet die Transaktion auf den Zustand an.
function attrappeView(doc, pos, { readOnly = false } = {}) {
  const view = {
    state: readOnly
      ? EditorState.create({
          doc,
          selection: { anchor: pos },
          extensions: [EditorState.readOnly.of(true)],
        })
      : mdState(doc, pos),
    transaktionen: [],
    dispatch(spec) {
      view.transaktionen.push(spec);
      view.state = view.state.update(spec).state;
    },
    focus: () => {},
    coordsAtPos: () => ({ left: 10, bottom: 20 }),
    dom: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  };
  return view;
}

// Stelle hinter dem ersten Vorkommen eines Ankers.
function hinter(doc, anker) {
  const i = doc.indexOf(anker);
  if (i < 0) throw new Error(`Anker fehlt: ${anker}`);
  return i + anker.length;
}

// Einträge an einer Stelle mit einer mitschreibenden Einfüge-Funktion.
function eintraegeAn(doc, pos) {
  const view = attrappeView(doc, pos);
  const aufrufe = [];
  const einfuegen = (v, compute) => {
    aufrufe.push(compute);
    return true;
  };
  return {
    view,
    aufrufe,
    eintraege: mermaidAuswahlEintraege(view, { einfuegen, heute: '2026-11-07' }),
  };
}

const ABLAUF = 'Text\n\n```mermaid\nflowchart TD\n  N1[Start] --> N2[Ende]\n  \n```\n\nDanach\n';
const ABFOLGE = '```mermaid\nsequenceDiagram\n  participant T1 as A\n  \n```\n';
const ZEITPLAN = '```mermaid\ngantt\n  title Plan\n  \n```\n';
const KLASSEN = '```mermaid\nclassDiagram\n  class K1\n  \n```\n';
const leereKoerperZeile = (doc) => doc.indexOf('\n  \n```') + 3;

describe('Einträge je Lage der Schreibmarke (V5, AK2)', () => {
  it('bietet außerhalb jedes Code-Blocks die vier Gerüste und keine Bausteine', () => {
    const { eintraege } = eintraegeAn(ABLAUF, hinter(ABLAUF, 'Tex'));
    expect(eintraege.map((e) => e.dataId)).toEqual([
      'mermaid-geruest-flowchart',
      'mermaid-geruest-sequenceDiagram',
      'mermaid-geruest-gantt',
      'mermaid-geruest-classDiagram',
    ]);
    expect(eintraege.map((e) => DE[e.key])).toEqual([
      'Ablauf (Flowchart)',
      'Abfolge (Sequence)',
      'Zeitplan (Gantt)',
      'Klassen (Class)',
    ]);
    expect(eintraege.every((e) => !e.disabled)).toBe(true);
  });

  it('bietet im Körper je Art genau die Bausteine dieser Art und keine Gerüste', () => {
    const erwartet = [
      [ABLAUF, 'flowchart', ['knoten', 'verzweigung', 'verbindung', 'beschriftet']],
      [
        ABFOLGE,
        'sequenceDiagram',
        ['teilnehmer', 'nachricht', 'antwort', 'schleife', 'alternative'],
      ],
      [ZEITPLAN, 'gantt', ['abschnitt', 'aufgabe', 'meilenstein']],
      [KLASSEN, 'classDiagram', ['klasse', 'mitglieder', 'vererbung', 'beziehung', 'teilVon']],
    ];
    for (const [doc, art, ids] of erwartet) {
      const { eintraege } = eintraegeAn(doc, leereKoerperZeile(doc));
      expect(eintraege.map((e) => e.dataId)).toEqual(
        ids.map((id) => `mermaid-baustein-${art}-${id}`),
      );
      // Jeder Name steht im Fragment, kein Schlüssel fällt auf sich selbst zurück.
      for (const e of eintraege) expect(DE[e.key], e.key).toBeTruthy();
    }
  });

  it('zeigt auf Öffner- und Schluss-Zeile einen ausgegrauten Hinweis', () => {
    for (const pos of [hinter(ABLAUF, '```merm'), ABLAUF.lastIndexOf('```') + 1]) {
      const { eintraege } = eintraegeAn(ABLAUF, pos);
      expect(eintraege).toHaveLength(1);
      expect(eintraege[0]).toMatchObject({ key: 'mermaid.bausteine.hinweis', disabled: true });
      expect(DE['mermaid.bausteine.hinweis']).toBeTruthy();
    }
  });

  it('zeigt den Hinweis in einem Code-Block fremder Sprache und bei unbekannter Art', () => {
    const fremd = '```js\nconst a = 1;\n```\n';
    const unbekannt = '```mermaid\npie title Anteile\n  "A" : 1\n```\n';
    const ohneKopf = '```mermaid\n%% nur ein Kommentar\n```\n';
    for (const [doc, anker] of [
      [fremd, 'const'],
      [unbekannt, '"A"'],
      [ohneKopf, '%% nur'],
    ]) {
      expect(mermaidLage(mdState(doc, 0), hinter(doc, anker))).toEqual({ modus: 'hinweis' });
    }
  });

  it('zeigt den Hinweis und wirft nicht, wenn die Art ein geerbter Objekt-Schlüssel ist', () => {
    for (const wort of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const doc = `\`\`\`mermaid\n${wort}\n  \n\`\`\`\n`;
      const pos = leereKoerperZeile(doc);
      expect(mermaidLage(mdState(doc, 0), pos), wort).toEqual({ modus: 'hinweis' });
      const { eintraege } = eintraegeAn(doc, pos);
      expect(
        eintraege.map((e) => e.dataId),
        wort,
      ).toEqual(['mermaid-bausteine-hinweis']);
    }
  });

  it('bietet keine Gerüste an, solange der Syntax-Baum die Stelle nicht erreicht', () => {
    // Ein frischer Zustand parst zunächst nur den Anfang eines langen
    // Dokuments; die Schreibmarke liegt in einem Mermaid-Block dahinter.
    const vorne = Array.from({ length: 6000 }, (_, i) => `Zeile ${i} mit Text`).join('\n');
    const doc = `${vorne}\n\n\`\`\`mermaid\nflowchart TD\n  \n\`\`\`\n`;
    const pos = leereKoerperZeile(doc);
    const state = EditorState.create({
      doc,
      selection: { anchor: pos },
      extensions: [markdown({ extensions: [LezerTable] })],
    });
    expect(syntaxTree(state).length).toBeLessThan(pos);
    baumSteuerung.unfertig = true;
    try {
      expect(mermaidLage(state, pos)).toEqual({ modus: 'hinweis' });
    } finally {
      baumSteuerung.unfertig = false;
    }
  });

  it('erkennt im Körper die Art und die Grenzen des Körpers', () => {
    const lage = mermaidLage(mdState(ABLAUF, 0), leereKoerperZeile(ABLAUF));
    expect(lage).toMatchObject({ modus: 'baustein', art: 'flowchart' });
    expect(ABLAUF.slice(lage.koerperVon, lage.koerperBis)).toBe(
      'flowchart TD\n  N1[Start] --> N2[Ende]\n  ',
    );
  });
});

describe('Ausführung (V5, AK6)', () => {
  it('fügt außerhalb das Ablauf-Gerüst in einem Dispatch ein, ein Rückgängig-Schritt', () => {
    const doc = 'Vorher\n';
    const view = attrappeView(doc, 7);
    const [ablauf] = mermaidAuswahlFuer(view);
    expect(ablauf.action()).toBe(true);
    expect(view.transaktionen).toHaveLength(1);
    expect(view.transaktionen[0].userEvent).toBe('input');
    expect(view.state.doc.toString()).toBe(
      'Vorher\n\n```mermaid\nflowchart TD\n  N1[Start] --> N2[Ende]\n```',
    );
    // Ausgewählt ist der erste Platzhalter-Text.
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('Start');
  });

  it('setzt das Tagesdatum des Aufrufs in das Zeitplan-Gerüst', () => {
    const view = attrappeView('', 0);
    const zeitplan = mermaidAuswahlFuer(view).find((e) => e.dataId === 'mermaid-geruest-gantt');
    zeitplan.action();
    expect(view.state.doc.toString()).toContain('Aufgabe :A1, 2026-11-07, 3d');
  });

  it('fügt im Körper den Knoten mit der nächsten freien Kennung und der Einrückung ein', () => {
    const view = attrappeView(ABLAUF, leereKoerperZeile(ABLAUF));
    const knoten = mermaidAuswahlFuer(view).find((e) => e.dataId.endsWith('-knoten'));
    expect(knoten.action()).toBe(true);
    expect(view.transaktionen).toHaveLength(1);
    expect(view.transaktionen[0].userEvent).toBe('input');
    expect(view.state.doc.toString()).toBe(ABLAUF.replace('\n  \n```', '\n  N3[Schritt]\n```'));
  });

  it('bleibt ohne Wirkung, wenn die Schreibmarke den Block inzwischen verlassen hat', () => {
    const view = attrappeView(ABLAUF, leereKoerperZeile(ABLAUF));
    const knoten = mermaidAuswahlFuer(view).find((e) => e.dataId.endsWith('-knoten'));
    view.dispatch({ selection: { anchor: 1 } });
    view.transaktionen.length = 0;
    expect(knoten.action()).toBe(false);
    expect(view.transaktionen).toHaveLength(0);
    expect(view.state.doc.toString()).toBe(ABLAUF);
  });

  it('der Hinweis-Eintrag ändert nichts', () => {
    const { eintraege, aufrufe } = eintraegeAn(ABLAUF, hinter(ABLAUF, '```merm'));
    expect(eintraege[0].action()).toBe(false);
    expect(aufrufe).toHaveLength(0);
  });
});

describe('Kommando insert.mermaid (V7)', () => {
  it('öffnet die Auswahl als Menü an der Schreibmarke', async () => {
    const view = attrappeView('Vorher\n', 7);
    menu.innerHTML = '';
    expect(FORMAT_COMMANDS['insert.mermaid'](view)).toBe(true);
    // Das Menü steht nach dem Laufzeit-Import der Menü-Helfer.
    await vi.waitFor(() => expect(menu.children.length).toBeGreaterThan(0));
    const ids = [...menu.querySelectorAll('[data-menu-id]')].map((el) => el.dataset.menuId);
    expect(ids).toEqual([
      'mermaid-geruest-flowchart',
      'mermaid-geruest-sequenceDiagram',
      'mermaid-geruest-gantt',
      'mermaid-geruest-classDiagram',
    ]);
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('Ablauf (Flowchart)');
  });

  it('sagt einen Fehlschlag beim Öffnen: protokolliert und Hinweis in der Statusleiste', async () => {
    const view = attrappeView('Vorher\n', 7);
    const fehler = new Error('Anzeige gestellt fehlgeschlagen');
    view.coordsAtPos = () => {
      throw fehler;
    };
    hinweis.mockClear();
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(FORMAT_COMMANDS['insert.mermaid'](view)).toBe(true);
      await vi.waitFor(() => expect(hinweis).toHaveBeenCalledTimes(1));
      expect(hinweis).toHaveBeenCalledWith('mermaid.bausteine.fehler', {
        error: true,
        duration: 3000,
      });
      expect(DE['mermaid.bausteine.fehler']).toBe('Mermaid-Auswahl konnte nicht geöffnet werden.');
      expect(protokoll).toHaveBeenCalledTimes(1);
      expect(protokoll.mock.calls[0]).toContain(fehler);
      expect(String(protokoll.mock.calls[0][0])).toContain('insert.mermaid');
    } finally {
      protokoll.mockRestore();
    }
  });

  it('bleibt ohne Editor und im nicht änderbaren Dokument ohne Wirkung', async () => {
    menu.innerHTML = '';
    expect(FORMAT_COMMANDS['insert.mermaid'](null)).toBe(false);
    expect(FORMAT_COMMANDS['insert.mermaid'](attrappeView('x', 0, { readOnly: true }))).toBe(false);
    await new Promise((fertig) => setTimeout(fertig, 20));
    expect(menu.children).toHaveLength(0);
  });
});
