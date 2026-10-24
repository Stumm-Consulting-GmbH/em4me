// 4T-002333 (Epic 3E-000264, Entscheidung T5): Der Anker-Modus der
// Vorschlagsliste nach `[[Datei#` und `[[Datei#^`, aus `autocomplete-help.js`
// ausgezogen (die Datei ist bei 586 Code-Zeilen eingefroren) und um die
// Datensätze einer Tabelle erweitert.
//
// **Überschriften** nach `[[Datei#` bleiben, wie sie waren: Die Liste kommt über
// `autocomplete:anchors`, gefiltert und geordnet hier, die Bibliothek filtert
// zusätzlich selbst (`validFor`).
//
// **Nach `[[Datei#^`** stehen zuerst die Block-Anker der Datei, danach die
// Datensätze, wenn die Datei eine Tabelle ist (Kanal `database:datensaetze`,
// Antwort `status: 'ready'`, nur bei eingeschalteter Erweiterung «Datenbank»).
// Ein Datensatz zeigt seine Anzeige-Form und schreibt seine lange Kennung, weil
// die Anwendung immer die Kennung schreibt (E5.4). Gefiltert wird auf
// Anzeige-Form und Kennung; weil die Kennung nicht in der Beschriftung steht,
// filtert die Bibliothek hier nicht selbst (`filter: false`, Muster
// `vervollstaendigung.js`), und `update` rechnet die Liste beim Tippen aus der
// einmal geholten Menge neu. Die Fortsetzung hinter `^` darf Leerzeichen und die
// übrigen Zeichen eines Namens tragen (Anker-Grammatik T1, `wiki.js`).
//
// **Die ersetzte Stelle beginnt am `^`**, weil jede Beschriftung ihn trägt. Bis
// 4T-002333 begann sie dahinter, und die Übernahme eines Block-Ankers schrieb
// den Zirkumflex ein zweites Mal (`#^^id`).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { AUTOCOMPLETE_RENDER_LIMIT, trefferBereich } from '../../../shared/wiki-vorschlaege.js';
import { ANZEIGE_ANKER_MUSTER } from '../../../shared/database/record-identity.js';

// Fortsetzung einer Überschrift wie bisher (Bestand aus autocomplete-help.js).
const UEBERSCHRIFT_FORTSETZUNG = /^[\p{L}\p{N}_^/-]*$/u;
// Fortsetzung hinter `^`: die Zeichen der Anker-Grammatik aus T1, aus der
// gemeinsamen Konstante beider Prozesse; der leere Rest gilt auch.
const blockFortsetzung = (text) =>
  text.startsWith('^') && (text.length === 1 || ANZEIGE_ANKER_MUSTER.test(text.slice(1)));

// 0, wenn der Text mit dem Gesuchten beginnt, sonst 1.
function rang(text, gesucht) {
  return String(text).toLowerCase().startsWith(gesucht) ? 0 : 1;
}

/**
 * Filtert und ordnet Anker-Namen: Treffer am Anfang zuerst, sonst alphabetisch.
 *
 * @param {string[]} anker
 * @param {string} eingabe Der getippte Rest ohne `^`.
 * @returns {string[]}
 */
export function waehleAnker(anker, eingabe) {
  const gesucht = String(eingabe || '').toLowerCase();
  return (anker || [])
    .filter((s) => !gesucht || s.toLowerCase().includes(gesucht))
    .sort((a, b) => rang(a, gesucht) - rang(b, gesucht) || a.localeCompare(b));
}

/**
 * Filtert Datensätze auf Anzeige-Form und Kennung; Treffer am Anfang einer der
 * beiden zuerst, sonst die Reihenfolge des Kanals (nach Anzeige-Form).
 *
 * @param {Array<{kennung: string, anzeige: string}>} datensaetze
 * @param {string} eingabe Der getippte Rest ohne `^`.
 * @returns {Array<{kennung: string, anzeige: string}>}
 */
export function waehleDatensaetze(datensaetze, eingabe) {
  const gesucht = String(eingabe || '').toLowerCase();
  const passt = (d) =>
    !gesucht ||
    String(d.anzeige || '')
      .toLowerCase()
      .includes(gesucht) ||
    String(d.kennung).toLowerCase().includes(gesucht);
  const vorn = (d) => Math.min(rang(d.anzeige || '', gesucht), rang(d.kennung, gesucht));
  return (datensaetze || []).filter(passt).sort((a, b) => vorn(a) - vorn(b));
}

// Hervorhebung in einer Beschriftung mit führendem `^`.
function hervorhebung(label, eingabe) {
  const bereich = trefferBereich(label.slice(1), eingabe);
  return bereich.length ? [bereich[0] + 1, bereich[1] + 1] : [];
}

/**
 * Das Ergebnis nach `[[Datei#^`: Block-Anker, dahinter Datensätze, zusammen
 * höchstens `AUTOCOMPLETE_RENDER_LIMIT` Einträge.
 *
 * @param {{anker: string[], datensaetze: object[]}} menge Die einmal geholte Menge.
 * @param {string} eingabe Der getippte Rest ohne `^`.
 * @param {number} von Position des `^` im Dokument.
 * @returns {object} Completion-Ergebnis für CodeMirror.
 */
export function baueBlockErgebnis(menge, eingabe, von) {
  const anker = waehleAnker(menge.anker, eingabe).map((s) => ({
    label: '^' + s,
    type: 'variable',
    detail: t('autocomplete.detail.blockId'),
  }));
  const datensaetze = waehleDatensaetze(menge.datensaetze, eingabe).map((d) => ({
    label: '^' + (d.anzeige || d.kennung),
    apply: '^' + d.kennung,
    type: 'variable',
    detail: t('autocomplete.detail.record'),
  }));
  return {
    from: von,
    options: [...anker, ...datensaetze].slice(0, AUTOCOMPLETE_RENDER_LIMIT),
    filter: false,
    getMatch: (completion) => hervorhebung(completion.label, eingabe),
    update: (aktuell, neuVon, neuBis, ctx) => {
      if (ctx.pos < neuVon) return null;
      const text = ctx.state.sliceDoc(neuVon, ctx.pos);
      if (!blockFortsetzung(text)) return null;
      return baueBlockErgebnis(menge, text.slice(1), neuVon);
    },
  };
}

// Die Datensätze der Ziel-Datei, wenn sie eine Tabelle ist; sonst leer.
async function datensaetzeDes(basename) {
  if (!basename || !isExtensionActive('database')) return [];
  if (typeof api.databaseDatensaetze !== 'function') return [];
  try {
    const antwort = await api.databaseDatensaetze({ tabelle: basename });
    if (!antwort || antwort.status !== 'ready' || !Array.isArray(antwort.datensaetze)) return [];
    return antwort.datensaetze.filter((d) => d && typeof d.kennung === 'string' && d.kennung);
  } catch {
    return [];
  }
}

// Block-Anker beziehungsweise Überschriften der Ziel-Datei, oder null, wenn der
// Index sie nicht liefern kann.
async function ankerDes(activeFile, basename, anchorType) {
  try {
    const result = await api.autocompleteAnchors(activeFile, basename, anchorType);
    return result && result.status === 'ready' ? result.suggestions || [] : null;
  } catch {
    return null;
  }
}

/**
 * Der Anker-Modus: `inner` ist der Text hinter `[[` bis zur Schreibmarke,
 * `hashIdx` die Stelle des `#` darin.
 *
 * @param {object} context Der CompletionContext.
 * @param {string} activeFile Pfad der geöffneten Datei.
 * @param {string} inner
 * @param {number} hashIdx
 * @returns {Promise<object|null>} Completion-Ergebnis oder null.
 */
export async function ankerVorschlaege(context, activeFile, inner, hashIdx) {
  const basename = inner.slice(0, hashIdx).trim();
  const anchorSofar = inner.slice(hashIdx + 1);
  if (anchorSofar.startsWith('^')) {
    const [anker, datensaetze] = await Promise.all([
      ankerDes(activeFile, basename, 'block'),
      datensaetzeDes(basename),
    ]);
    if (anker === null && datensaetze.length === 0) return null;
    const menge = { anker: anker || [], datensaetze };
    return baueBlockErgebnis(menge, anchorSofar.slice(1), context.pos - anchorSofar.length);
  }
  const anker = await ankerDes(activeFile, basename, 'heading');
  if (anker === null) return null;
  return {
    from: context.pos - anchorSofar.length,
    options: waehleAnker(anker, anchorSofar)
      .slice(0, AUTOCOMPLETE_RENDER_LIMIT)
      .map((s) => ({ label: s, type: 'variable', detail: t('autocomplete.detail.heading') })),
    validFor: UEBERSCHRIFT_FORTSETZUNG,
  };
}
