// @vitest-environment jsdom
// 4T-002433 (Epic 3E-000375): Einstellung «Gliederungsspuren bei Listen»
// (`editor.listFoldTrackPosition`, Werte `aussen` und `struktur`).
//
// Belegt wird, was ohne Fenster entscheidbar ist:
//
//   1. **AK3 — Werte-Bereich und Vorgabe**: «links außen» ohne gespeicherten
//      Wert, beide gültigen Werte, Rückfall jedes unbekannten oder defekten
//      Werts auf «links außen».
//   2. **Setter**: Persistenz unter dem Schlüssel, `persist: false` für den
//      Empfang der Fenster-Verteilung, No-op ohne Ereignis bei unverändertem
//      Wert, Ereignis `scg:listfoldtrackchange` mit der neuen Lage.
//   3. **Neuzeichnen ohne Falt-Änderung**: Der Hörer in folding.js schickt
//      jedem offenen Editor den Effekt `listFoldTrackEffect`; ein gefalteter
//      Bereich bleibt gefaltet.
//
// Die Zeile auf der Einstellungs-Seite, die Verteilung an ein zweites Fenster
// und der Neustart liegen in ES-18 in
// `test/e2e/funktionen/einstellungen-seite.spec.js`.
//
// Muster `statusleisten-schalter-darstellung.test.js`: jsdom plus api-Stub vor
// dem dynamischen Modul-Import.
import { describe, it, expect, afterEach } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { codeFolding, foldEffect, foldedRanges } from '@codemirror/language';

const {
  LIST_FOLD_TRACK_AUSSEN,
  LIST_FOLD_TRACK_EVENT,
  LIST_FOLD_TRACK_KEY,
  LIST_FOLD_TRACK_POSITIONS,
  LIST_FOLD_TRACK_STRUKTUR,
  getListFoldTrackPosition,
  initListFoldTrackPositionFromStore,
  normalisiereListFoldTrackPosition,
  setListFoldTrackPosition,
} = await import('../../../src/renderer/modules/editor/list-fold-track-setting.js');
const folding = await import('../../../src/renderer/modules/editor/folding.js');
const { paneEditors } = await import('../../../src/renderer/modules/editor/editor.js');

const getSettingVorher = window.api.getSetting;
const setSettingVorher = window.api.setSetting;

// Modul-Zustand und Stub nach jedem Fall zurücksetzen, damit die Fälle
// reihenfolge-unabhängig bleiben.
afterEach(async () => {
  window.api.getSetting = getSettingVorher;
  window.api.setSetting = setSettingVorher;
  // Erst die Spalten leeren: Der Rücksprung löst das Ereignis aus, und der
  // Hörer erreichte sonst die bereits zerstörten Editoren des Falls.
  paneEditors.length = 0;
  await setListFoldTrackPosition(LIST_FOLD_TRACK_AUSSEN, { persist: false });
});

// Sammelt die Ereignisse eines Falls; der Rückgabewert meldet sich ab.
function horcheEreignisse() {
  const gesehen = [];
  const hoerer = (e) => gesehen.push(e.detail);
  document.addEventListener(LIST_FOLD_TRACK_EVENT, hoerer);
  return { gesehen, ab: () => document.removeEventListener(LIST_FOLD_TRACK_EVENT, hoerer) };
}

describe('Werte-Bereich und Vorgabe (4T-002433, AK3)', () => {
  it('kennt genau die beiden Werte in Anzeige-Reihenfolge, Schlüssel wie festgelegt', () => {
    expect(LIST_FOLD_TRACK_POSITIONS).toEqual(['aussen', 'struktur']);
    expect(LIST_FOLD_TRACK_KEY).toBe('editor.listFoldTrackPosition');
    expect(LIST_FOLD_TRACK_EVENT).toBe('scg:listfoldtrackchange');
  });

  it('ohne gespeicherten Wert gilt «links außen»', async () => {
    window.api.getSetting = async () => undefined;
    expect(await initListFoldTrackPositionFromStore()).toBe(LIST_FOLD_TRACK_AUSSEN);
    expect(getListFoldTrackPosition()).toBe(LIST_FOLD_TRACK_AUSSEN);
  });

  it('beide gültigen Werte werden aus dem Speicher übernommen', async () => {
    window.api.getSetting = async (key) =>
      key === LIST_FOLD_TRACK_KEY ? LIST_FOLD_TRACK_STRUKTUR : undefined;
    expect(await initListFoldTrackPositionFromStore()).toBe(LIST_FOLD_TRACK_STRUKTUR);
    window.api.getSetting = async () => LIST_FOLD_TRACK_AUSSEN;
    expect(await initListFoldTrackPositionFromStore()).toBe(LIST_FOLD_TRACK_AUSSEN);
  });

  it('jeder unbekannte oder defekte Wert fällt auf «links außen» zurück', async () => {
    for (const wert of ['mitte', 'Struktur', '', null, 42, true, {}, ['struktur']]) {
      expect(normalisiereListFoldTrackPosition(wert)).toBe(LIST_FOLD_TRACK_AUSSEN);
    }
    window.api.getSetting = async () => 'mitte';
    expect(await initListFoldTrackPositionFromStore()).toBe(LIST_FOLD_TRACK_AUSSEN);
  });

  it('ein Lese-Fehler des Speichers ergibt die Vorgabe', async () => {
    window.api.getSetting = async () => {
      throw new Error('Speicher nicht lesbar');
    };
    expect(await initListFoldTrackPositionFromStore()).toBe(LIST_FOLD_TRACK_AUSSEN);
  });
});

describe('Setzen und Ereignis (4T-002433)', () => {
  it('persistiert unter dem Schlüssel und meldet die neue Lage', async () => {
    const geschrieben = [];
    window.api.setSetting = async (key, value) => {
      geschrieben.push([key, value]);
    };
    const { gesehen, ab } = horcheEreignisse();
    try {
      expect(await setListFoldTrackPosition('struktur')).toBe(LIST_FOLD_TRACK_STRUKTUR);
      expect(getListFoldTrackPosition()).toBe(LIST_FOLD_TRACK_STRUKTUR);
      expect(geschrieben).toEqual([[LIST_FOLD_TRACK_KEY, LIST_FOLD_TRACK_STRUKTUR]]);
      expect(gesehen).toEqual([{ position: LIST_FOLD_TRACK_STRUKTUR }]);
    } finally {
      ab();
    }
  });

  it('ein unveränderter Wert ist ein No-op ohne Ereignis und ohne Schreiben', async () => {
    const geschrieben = [];
    window.api.setSetting = async (key, value) => {
      geschrieben.push([key, value]);
    };
    const { gesehen, ab } = horcheEreignisse();
    try {
      expect(await setListFoldTrackPosition('aussen')).toBe(LIST_FOLD_TRACK_AUSSEN);
      // Ein unbekannter Wert normalisiert auf die geltende Vorgabe: ebenfalls kein Wechsel.
      expect(await setListFoldTrackPosition('mitte')).toBe(LIST_FOLD_TRACK_AUSSEN);
      expect(geschrieben).toEqual([]);
      expect(gesehen).toEqual([]);
    } finally {
      ab();
    }
  });

  it('der Empfang der Verteilung (persist: false) meldet, schreibt aber nicht', async () => {
    const geschrieben = [];
    window.api.setSetting = async (key, value) => {
      geschrieben.push([key, value]);
    };
    const { gesehen, ab } = horcheEreignisse();
    try {
      await setListFoldTrackPosition('struktur', { persist: false });
      expect(getListFoldTrackPosition()).toBe(LIST_FOLD_TRACK_STRUKTUR);
      expect(geschrieben).toEqual([]);
      expect(gesehen).toEqual([{ position: LIST_FOLD_TRACK_STRUKTUR }]);
    } finally {
      ab();
    }
  });
});

describe('Neuzeichnen des Gliederungs-Rands ohne Falt-Änderung (4T-002433)', () => {
  // Ein Editor mit Gliederungs-Rand und einer mehrzeiligen Liste; der Listen-
  // punkt mit Unterpunkten wird vor dem Wechsel gefaltet.
  function baueEditor(effekte) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = '# Titel\n\n- Punkt eins\n  - Unterpunkt\n  - Unterpunkt\n- Punkt zwei\n';
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          markdown(),
          codeFolding(),
          folding.foldStructureField,
          folding.foldGutterExtensions,
          EditorView.updateListener.of((update) => {
            for (const tr of update.transactions) {
              for (const e of tr.effects) {
                if (e.is(folding.listFoldTrackEffect)) effekte.push(e.value);
              }
            }
          }),
        ],
      }),
      parent,
    });
    return view;
  }

  it('jeder offene Editor bekommt den Effekt, gefaltete Bereiche bleiben gefaltet', async () => {
    const effekteA = [];
    const effekteB = [];
    const a = baueEditor(effekteA);
    const b = baueEditor(effekteB);
    paneEditors[0] = a;
    paneEditors[1] = null; // eine leere Spalte wird übergangen
    paneEditors[2] = b;
    try {
      const zeile = a.state.doc.line(3);
      const ende = a.state.doc.line(5).to;
      a.dispatch({ effects: foldEffect.of({ from: zeile.to, to: ende }) });
      const gefaltetVorher = [];
      foldedRanges(a.state).between(0, a.state.doc.length, (from, to) => {
        gefaltetVorher.push([from, to]);
      });
      expect(gefaltetVorher).toHaveLength(1);

      await setListFoldTrackPosition('struktur', { persist: false });

      expect(effekteA).toEqual([LIST_FOLD_TRACK_STRUKTUR]);
      expect(effekteB).toEqual([LIST_FOLD_TRACK_STRUKTUR]);
      const gefaltetNachher = [];
      foldedRanges(a.state).between(0, a.state.doc.length, (from, to) => {
        gefaltetNachher.push([from, to]);
      });
      expect(gefaltetNachher).toEqual(gefaltetVorher);
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  it('ohne Wechsel der Einstellung bekommt kein Editor den Effekt', async () => {
    const effekte = [];
    const view = baueEditor(effekte);
    paneEditors[0] = view;
    try {
      await setListFoldTrackPosition('aussen', { persist: false });
      expect(effekte).toEqual([]);
    } finally {
      view.destroy();
    }
  });
});
