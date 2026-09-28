// 4T-001713 (Epic 3E-000300): Der rechnende Kern der Vorschlagsliste in der
// Tabellenzelle der Live-Ansicht — gedachter Quelltext-Stand, Befragung der
// Vorschlags-Quellen und Rückrechnung einer Übernahme in das Eingabefeld.
//
// **Bauweg B aus `4T-001710`, Lösungs-Kapitel Punkt 5.** Das Eingabefeld der
// Zelle bleibt, wie es ist. Die Vorschlags-Quellen der Vervollständigung
// (`autocomplete-help.js`) werden nicht nachgebaut, sondern unverändert
// befragt — mit einem Aufruf-Zusammenhang, den die Vervollständigungs-Bibliothek
// dafür ausdrücklich anbietet (`CompletionContext`). Sein Zustand ist ein
// GEDACHTER Stand des Dokuments: derselbe Text, nur trägt die bearbeitete Zelle
// schon den aktuellen Inhalt des Feldes, maskiert wie bei der Übernahme. Die
// Quellen urteilen damit über genau die Zeile, die im Quelltext stünde, und
// liefern dieselben Einträge in derselben Reihenfolge; eine zweite
// Auswahl-Regel entsteht nicht.
//
// Der gedachte Stand ist ein nackter `EditorState` ohne die Erweiterungen des
// Editors. Die Quellen lesen von ihm nur Text und Zeilen; ein Stand mit allen
// Erweiterungen liesse bei jedem Tastendruck die Felder der Live-Ansicht über
// das ganze Dokument neu rechnen. Das Dokument selbst wird nicht serialisiert:
// `Text.replace` teilt sich den unveränderten Rest mit dem Original.
//
// Ohne DOM, damit die Entscheidungen — welche Zeile die Quellen sehen, welcher
// Text im Feld landet — ohne laufende Anwendung prüfbar sind.
'use strict';

import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState, Text } from '@codemirror/state';

import { trefferBereich } from '../../../shared/wiki-vorschlaege.js';
import { maskiereZellText } from './live-table-zell-kern.js';

// Länge des maskierten Feld-Textes bis zur Feld-Stelle `k`. Die Maskierung
// verlängert jedes nackte Pipe-Zeichen um einen Rückstrich; die Stellen im
// Feld und im gedachten Quelltext laufen deshalb hinter jedem Pipe um eins
// auseinander.
export function maskedLength(raw, k) {
  return maskiereZellText(String(raw).slice(0, k)).length;
}

// Umkehrung von `maskedLength`: die kleinste Feld-Stelle, deren maskierte Länge
// die Stelle `masked` erreicht. Zellen sind kurz; der lineare Lauf ist hier
// billiger als jede Vorab-Tabelle.
export function rawOffset(raw, masked) {
  const text = String(raw);
  for (let k = 0; k <= text.length; k++) {
    if (maskedLength(text, k) >= masked) return k;
  }
  return text.length;
}

/**
 * Der gedachte Quelltext-Stand, in dem die Zelle den Feld-Inhalt trägt.
 *
 * @param {import('@codemirror/state').EditorState} state Stand des Editors.
 * @param {{from: number, to: number}} range Inhalts-Bereich der Zelle im Dokument.
 * @param {string} raw Inhalt des Eingabefeldes, wie getippt.
 * @param {number} caret Schreibmarke im Feld.
 * @returns {{state: EditorState, pos: number, cellFrom: number, cellTo: number}}
 */
export function imaginedState(state, range, raw, caret) {
  const insert = maskiereZellText(raw);
  const doc = state.doc.replace(range.from, range.to, Text.of([insert]));
  return {
    state: EditorState.create({ doc }),
    pos: range.from + maskedLength(raw, caret),
    cellFrom: range.from,
    cellTo: range.from + insert.length,
  };
}

/**
 * Befragt die Vorschlags-Quellen am gedachten Stand, in ihrer Reihenfolge.
 * Eine Quelle, die scheitert, fällt aus, ohne die übrigen mitzunehmen — wie in
 * der Bibliothek, die einen Fehler einer Quelle protokolliert und weiterläuft.
 *
 * @param {Array<Function>} sources die Quellen der Vervollständigung.
 * @param {{state: EditorState, pos: number}} stand gedachter Stand.
 * @param {boolean} explicit ausdrücklich geöffnet (Strg+Leertaste).
 * @param {object} view der Editor der Arbeitsfläche; über ihn finden die
 *   Quellen die geöffnete Datei.
 * @returns {Promise<Array<object|null>>} je Quelle ihr Ergebnis oder `null`.
 */
export async function querySources(sources, stand, explicit, view) {
  const context = new CompletionContext(stand.state, stand.pos, explicit, view);
  return Promise.all(
    sources.map(async (source) => {
      try {
        return (await source(context)) || null;
      } catch (err) {
        console.warn('Vorschlagsliste in der Tabellenzelle: Quelle gescheitert', err);
        return null;
      }
    }),
  );
}

/**
 * Die Einträge der Liste in der Reihenfolge der Anzeige.
 *
 * Ergebnisse mit `filter: false` (Verweis-Ziele und Schlagworte) ordnet die
 * Bibliothek nicht um; ihre Reihenfolge ist die der Quelle, und genau so steht
 * sie hier. Die Hervorhebung liefert dann die Quelle über `getMatch`. Für die
 * übrigen Ergebnisse (Anker und Unterseiten) wird die Fundstelle der Eingabe
 * hervorgehoben, wie ihre Quellen sie gefiltert haben.
 *
 * @returns {Array<{completion: object, from: number, match: number[]}>}
 */
export function collectOptions(results, stand) {
  const options = [];
  for (const result of results) {
    if (!result || !Array.isArray(result.options)) continue;
    const typed = stand.state.sliceDoc(result.from, stand.pos);
    for (const completion of result.options) {
      const match = result.getMatch
        ? result.getMatch(completion)
        : trefferBereich(completion.label, typed);
      options.push({ completion, from: result.from, match: match || [] });
    }
  }
  return options;
}

// Die Transaktion, die eine Übernahme im gedachten Stand auslöst. Eine
// Übernahme-Funktion der Quelle (etwa `uebernimmWikiZiel` mit dem
// Klammer-Schluss) läuft unverändert gegen einen Ersatz des Editors, der nur
// den gedachten Stand zeigt und die Transaktion auffängt statt sie
// auszuführen. So entsteht derselbe eingefügte Text wie im Fließtext, ohne die
// Übernahme ein zweites Mal zu schreiben.
function transactionFor(stand, option) {
  const { completion, from } = option;
  const to = stand.pos;
  if (typeof completion.apply === 'function') {
    const captured = [];
    const proxy = { state: stand.state, dispatch: (...specs) => captured.push(...specs) };
    try {
      completion.apply(proxy, completion, from, to);
    } catch (err) {
      console.warn('Vorschlagsliste in der Tabellenzelle: Übernahme gescheitert', err);
      return null;
    }
    // Übernahmen, die erst später schreiben (Datums-Auswahl der Aufgaben),
    // gibt es in einer Tabellenzeile nicht; ohne Transaktion bleibt das Feld.
    if (captured.length !== 1) return null;
    return stand.state.update(captured[0]);
  }
  // Voreinstellung der Bibliothek: die Beschriftung (oder ein Text-`apply`)
  // ersetzt die Eingabe, die Schreibmarke steht dahinter.
  const insert = typeof completion.apply === 'string' ? completion.apply : completion.label;
  return stand.state.update({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  });
}

/**
 * Rechnet die Übernahme eines Eintrags in das Eingabefeld zurück.
 *
 * Geschrieben wird in das Feld, nicht in das Dokument: Die Zelle bleibt offen,
 * und in den Quelltext kommt der Text erst mit der Übernahme der Zelle — mit
 * derselben Maskierung wie jede andere Eingabe. Ein Vorschlag mit einem
 * Pipe-Zeichen landet deshalb roh im Feld und zerschneidet die Tabelle nicht.
 *
 * @param {{state: EditorState, pos: number, cellFrom: number, cellTo: number}} stand
 *   gedachter Stand zum jetzigen Feld-Inhalt.
 * @param {string} raw jetziger Feld-Inhalt.
 * @param {{completion: object, from: number}} option der gewählte Eintrag.
 * @returns {{value: string, caret: number}|null} neuer Feld-Inhalt und
 *   Schreibmarke, oder `null`, wenn die Übernahme nicht innerhalb der Zelle
 *   bleibt.
 */
export function applySuggestion(stand, raw, option) {
  const tr = transactionFor(stand, option);
  if (!tr) return null;
  const { cellFrom, cellTo } = stand;
  const text = String(raw);
  // Stücke des neuen Feld-Inhalts: unveränderte Teile aus dem alten Feld,
  // eingefügte Teile aus der Transaktion. Jedes Stück merkt sich, wo es im
  // neuen Stand (B) und im neuen Feld beginnt, damit die Schreibmarke
  // zurückgerechnet werden kann.
  const pieces = [];
  let value = '';
  let prevA = cellFrom;
  let prevB = cellFrom;
  let prevRaw = 0;
  let inside = true;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (fromA < cellFrom || toA > cellTo) inside = false;
    if (!inside) return;
    const a = rawOffset(text, fromA - cellFrom);
    pieces.push({
      keep: true,
      bFrom: prevB,
      bTo: fromB,
      aFrom: prevA,
      rawFrom: prevRaw,
      at: value.length,
    });
    value += text.slice(prevRaw, a);
    pieces.push({ keep: false, bFrom: fromB, bTo: toB, at: value.length });
    value += inserted.toString();
    prevA = toA;
    prevB = toB;
    prevRaw = rawOffset(text, toA - cellFrom);
  });
  if (!inside) return null;
  pieces.push({
    keep: true,
    bFrom: prevB,
    bTo: prevB + (cellTo - prevA),
    aFrom: prevA,
    rawFrom: prevRaw,
    at: value.length,
  });
  value += text.slice(prevRaw);

  const head = tr.state.selection.main.head;
  let caret = value.length;
  for (const piece of pieces) {
    if (head < piece.bFrom || head > piece.bTo) continue;
    if (!piece.keep) {
      caret = piece.at + (head - piece.bFrom);
    } else {
      const headA = piece.aFrom + (head - piece.bFrom);
      caret = piece.at + (rawOffset(text, headA - cellFrom) - piece.rawFrom);
    }
    break;
  }
  return { value, caret: Math.max(0, Math.min(caret, value.length)) };
}
