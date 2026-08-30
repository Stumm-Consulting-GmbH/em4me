// Markdown-Linter des Editors: Regex-Katalog, Regel-Tabelle, Kontext-Filter,
// Lint-Lauf und Hover-Tooltip.
//
// Auszug aus editor.js, 4T-1002 (Epic 3E-0196). lintField und
// setLintDecorations sind einmalige Identitaeten und leben ausschliesslich
// hier; der Kern bindet sie unveraendert an ihrer bisherigen Stelle der
// Extension-Liste ein.
'use strict';

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { CALLOUT_TYPES } from '../../../shared/callouts.js';
// 4T-1277 (Epic 3E-0232, Befund B3): Erkennung der relativen Wiki-Formen aus
// der einen Quelle der Unterseiten-Semantik, statt den Schraegstrich hier ein
// zweites Mal zu deuten.
import { isRelativeTarget } from '../../../shared/subpages.js';
import { t } from '../../i18n.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { computeCommentRanges, detectFrontmatterLines } from '../live/live-marker-fields.js';
import { api, getDocText } from '../app/api.js';
import { state } from '../app/app-state.js';
// 4T-0324 (Epic 3E-0058): Außen-Link-Warnung — Ziel-Auflösung für die
// Linter-Regel outsideAreaLink (der Render-Pane-Marker läuft über die
// Render-Pipeline in render-mermaid.js).
import { isOutsideActiveArea, resolveLocalTarget } from '../area.js';
// 4T-1002: Laufzeit-Zyklus mit dem Kern — paneEditors wird ausschliesslich in
// Funktionskoerpern gelesen.
import { paneEditors } from './editor.js';

// 4T-0020: Markdown-Linter-Light. Vier Regeln (bare-url, empty-link-text,
// missing-alt-text, broken-wiki-link), Erkennung per Regex auf den Dokument-
// Text mit syntaxTree-Schutz gegen Code-Bloecke und Markdown-Link-Knoten.
// Decorations werden als CodeMirror-StateField gehalten; ein UpdateListener
// triggert mit 300-ms-Debounce einen asynchronen Lint-Lauf, dessen Ergebnis
// per StateEffect ins Feld dispatcht wird. Tooltip via hoverTooltip mit
// lokalisiertem Inhalt.

export const LINT_DEBOUNCE_MS = 300;

// Regel 1: bare URL (http(s):// oder mailto:). Endet nicht in typischen
// trailing-Zeichen, die in Fliesstext angrenzen koennen. Schluss-Komma/
// -Klammer werden ebenfalls nicht zur URL gezaehlt, sonst werden Saetze
// wie "Siehe https://example.com, ..." kosmetisch falsch markiert.
export const LINT_BARE_URL_RE = /\b(?:https?:\/\/|mailto:)[^\s<>"`[\]()]+/g;
// Regeln 2 + 3: leere Linktexte. Gruppe 1 unterscheidet ueber den optionalen
// '!' Bild vs. Link. Wir matchen sowohl Inline-Form `[](url)` als auch
// Referenz-Form `[][ref]`.
export const LINT_EMPTY_LINK_RE = /(!?)\[\]\((\s*[^\s)]+[^)]*?)\)|(!?)\[\]\[([^\]]+)\]/g;
// Regel 4: Wiki-Link [[Ziel]] oder [[Ziel|Anzeige]].
// 4T-0068 (Epic 3E-0012): Negative-Lookbehind `(?<!!)` schliesst Embeds
// `![[...]]` aus. Sonst markiert der Wiki-Link-Linter Embed-Targets wie
// Bilder oder PDFs faelschlich als broken-wiki-link, weil das Backlinks-
// Index nur Markdown-Dateien kennt. Broken-Embed-Detection als eigene
// Linter-Regel ist Folge-Thema fuer das 1.0.0-Epic 3E-0016.
export const LINT_WIKI_RE = /(?<!!)\[\[([^\]\n|]+?)(?:\|[^\]\n]*)?\]\]/g;
// 4T-0324 (Epic 3E-0058): lokaler Markdown-Link [text](ziel) — Ziel-Extraktion
// fuer die Bereichs-Pruefung; URLs und reine Anker werden im Lauf uebersprungen.
// 4T-0476 (Epic 3E-0088): die <…>-Form als eigene Alternative (Gruppe 1), damit
// Ziele mit Leerzeichen vollständig erfasst werden statt am Blank abzubrechen;
// Gruppe 2 = klammerlose Form. %-Kodierung dekodiert resolveLocalTarget.
export const LINT_MD_LINK_RE = /(?<!!)\[[^\]\n]*\]\(\s*(?:<([^<>\n]+)>|([^)\s>]+))[^)\n]*\)/g;

export const setLintDecorations = StateEffect.define();

export const lintField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    // Bei Doc-Change Decorations leeren — ein neuer Lint-Lauf laeuft nach
    // dem Debounce und dispatcht frische Decorations. So bleiben keine
    // verrutschten Marker stehen, etwa nach Tab-Wechsel.
    let next = tr.docChanged ? Decoration.none : value;
    for (const effect of tr.effects) {
      if (effect.is(setLintDecorations)) next = effect.value;
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 4T-0061 (Epic 3E-0012): Callout-Typ-Whitelist. W-10 (4T-0310): aus der
// gemeinsamen Registry CALLOUT_TYPES (src/shared/callouts.js) abgeleitet
// statt hartkodierte Kopie — Single Source of Truth.
export const CALLOUT_TYPE_WHITELIST = new Set(Object.keys(CALLOUT_TYPES));
export const LINT_CALLOUT_HEADER_RE = /^>\s+\[!([a-z]+)\]/gm;

export const LINT_RULES = {
  bareUrl: { className: 'cm-linter-mark cm-linter-bare-url' },
  emptyLinkText: { className: 'cm-linter-mark cm-linter-empty-link-text' },
  missingAltText: { className: 'cm-linter-mark cm-linter-missing-alt-text' },
  brokenWikiLink: { className: 'cm-linter-mark cm-linter-broken-wiki-link' },
  // 4T-0054 (Epic 3E-0011): broken Heading-/Block-Anker im Wiki-Link.
  // Selbe Decoration-CSS-Klasse wie brokenWikiLink (visuell identisch),
  // eigener Regel-Identifier fuer den Tooltip (unterscheidet 'Datei
  // existiert nicht' von 'Datei existiert, Anker nicht').
  brokenWikiAnchor: { className: 'cm-linter-mark cm-linter-broken-wiki-link' },
  // 4T-0336 (Epic 3E-0061): Ordner-Pfad-Form und Unterseiten-Form zeigen
  // auf verschiedene Dateien. Selbe Decoration-CSS-Klasse wie
  // brokenWikiLink (visuell identisch), eigener Regel-Identifier fuer den
  // Tooltip.
  ambiguousWikiTarget: { className: 'cm-linter-mark cm-linter-broken-wiki-link' },
  // 4T-0061 (Epic 3E-0012): Unbekannter Callout-Typ ausserhalb der Whitelist.
  unknownCalloutType: { className: 'cm-linter-mark cm-linter-unknown-callout-type' },
  // 4T-0324 (Epic 3E-0058): Link-Ziel ausserhalb des aktiven Bereichs.
  outsideAreaLink: { className: 'cm-linter-mark cm-linter-outside-area-link' },
  // 4T-0533 (Epic 3E-0089): unpaariger %%-Kommentar-Marker (wirkt bis
  // Dokument-Ende). Generische Wellenlinie ueber cm-linter-mark; eigener
  // Regel-Identifier fuer den Tooltip.
  unpairedCommentMarker: { className: 'cm-linter-mark cm-linter-unpaired-comment' },
};

// detail (optional): Zusatz-Info fuer den Tooltip (4T-0324: der aufgeloeste
// Ziel-Pfad des Aussen-Links).
export function makeLintMark(ruleId, detail) {
  const attributes = { 'data-lint-rule': ruleId };
  if (detail) attributes['data-lint-detail'] = detail;
  return Decoration.mark({
    class: LINT_RULES[ruleId].className,
    attributes,
  });
}

// Pruefung, ob die Position innerhalb von Code-Kontext liegt (FencedCode,
// CodeBlock, InlineCode). In diesem Fall greifen die Regeln 1-4 nicht.
export function lintIsInCodeContext(state, pos) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode')
      return true;
    node = node.parent;
  }
  return false;
}

// Pruefung, ob die Position innerhalb einer Markdown-Link-Syntax oder eines
// Autolinks liegt. Verhindert false positives fuer bare-url: eine URL in
// [text](url) oder <https://...> ist kein Verstoss.
export function lintIsInLinkContext(state, pos) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === 'Link' || node.name === 'Autolink' || node.name === 'URL') return true;
    node = node.parent;
  }
  return false;
}

// 4T-0049: Pruefung, ob die Position innerhalb des YAML-Frontmatter-Blocks
// am Datei-Anfang liegt. Frontmatter ist YAML, nicht Markdown — die Linter-
// Regeln 1-4 duerfen darin nicht greifen. Beispiel: `aliases: [foo]` darf
// nicht als 'leere Wiki-Link' gemeldet werden, eine URL im 'website:'-Wert
// darf nicht als bare-url markiert werden.
export function lintIsInFrontmatter(state, pos, precomputedRange) {
  // K-04 (4T-0310): den Frontmatter-Bereich optional durchreichen (runLint
  // ermittelt ihn einmal pro Lauf statt pro Treffer).
  const range =
    precomputedRange !== undefined ? precomputedRange : detectFrontmatterLines(state.doc);
  if (!range) return false;
  const fromOffset = state.doc.line(range.fromLine).from;
  const toOffset = state.doc.line(range.toLine).to;
  return pos >= fromOffset && pos <= toOffset;
}

// Pro EditorView ein Debounce-Timer, damit Doc-Aenderungen den Lint-Lauf
// nicht haeufiger als alle LINT_DEBOUNCE_MS triggern.
export const lintTimers = new WeakMap();

/**
 * Plant einen Lint-Lauf fuer die View; je View laeuft hoechstens ein Timer.
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 */
export function scheduleLint(view) {
  const existing = lintTimers.get(view);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    lintTimers.delete(view);
    runLint(view);
  }, LINT_DEBOUNCE_MS);
  lintTimers.set(view, timer);
}

/**
 * Fuehrt einen vollstaendigen Lint-Lauf aus und dispatcht die Decorations.
 * Bricht ab, wenn die View nicht mehr an einer Pane haengt, der Reiter in der
 * gerenderten Ansicht steht oder die Erweiterung abgeschaltet ist.
 *
 * @param {import('@codemirror/view').EditorView} view Ziel-View.
 * @returns {Promise<void>} Laeuft asynchron wegen des IPC-Roundtrips.
 */
export async function runLint(view) {
  // View koennte zwischenzeitlich entfernt worden sein (Pane geschlossen).
  const paneIdx = paneEditors.indexOf(view);
  if (paneIdx < 0) return;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const tab = pane.tabs[pane.activeIndex];
  if (!tab) return;
  // R2-14 (4T-0180): Im Reading-Modus ist der Editor unsichtbar — Voll-Lint
  // inkl. IPC-Roundtrip lohnt nicht. Der Nachhol-Lauf beim Wechsel in einen
  // Editor-Modus wird in syncEditorForPane angestossen.
  if (tab.viewMode === 'rendered') return;
  // 4T-0294: deaktivierte Linter-Erweiterung — bestehende Marker raeumen
  // (das Umschalten stoesst scheduleLint an) und keinen Lauf starten.
  if (!isExtensionActive('linter')) {
    view.dispatch({ effects: setLintDecorations.of(Decoration.none) });
    return;
  }
  const stateAtStart = view.state;
  const text = getDocText(stateAtStart.doc);
  // Snapshot der Doc-Laenge fuer Stale-Check beim spaeten Dispatch.
  const docLengthAtStart = stateAtStart.doc.length;

  // R2-08 (4T-0174): Syntax-Baum moeglichst vollstaendig parsen (50-ms-
  // Budget). Bei grossen Dateien ist der Baum sonst unvollstaendig und die
  // Kontext-Pruefungen (Code-Block, Frontmatter) liefern False-Positives
  // in spaeten Dokument-Teilen. Bleibt der Baum unvollstaendig, werden
  // Marker auf den geparsten Bereich begrenzt (lieber keine Meldung als
  // eine falsche); der naechste Lint-Lauf nach dem Lezer-Nachlauf raeumt auf.
  const tree = ensureSyntaxTree(stateAtStart, docLengthAtStart, 50);
  const parsedUpTo = tree ? docLengthAtStart : syntaxTree(stateAtStart).length;

  // K-04 (4T-0310): Frontmatter-Bereich einmal pro Lauf ermitteln und an die
  // Treffer-Pruefungen durchreichen (statt pro Regex-Treffer neu zu scannen).
  const fmRange = detectFrontmatterLines(stateAtStart.doc);
  const ranges = [];
  const pushRange = (from, to, ruleId, detail) => {
    if (to > parsedUpTo) return;
    if (from >= 0 && to > from && to <= docLengthAtStart) {
      ranges.push({ from, to, mark: makeLintMark(ruleId, detail) });
    }
  };

  // Regel 1: bare URLs
  for (const m of text.matchAll(LINT_BARE_URL_RE)) {
    const from = m.index;
    const to = from + m[0].length;
    if (lintIsInCodeContext(stateAtStart, from)) continue;
    if (lintIsInLinkContext(stateAtStart, from)) continue;
    if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
    pushRange(from, to, 'bareUrl');
  }

  // Regeln 2 + 3: leere Link-/Bild-Texte
  for (const m of text.matchAll(LINT_EMPTY_LINK_RE)) {
    const from = m.index;
    const to = from + m[0].length;
    if (lintIsInCodeContext(stateAtStart, from)) continue;
    if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
    const isImage = m[1] === '!' || m[3] === '!';
    pushRange(from, to, isImage ? 'missingAltText' : 'emptyLinkText');
  }

  // Regel 4 + 5: broken-wiki-link und broken-wiki-anchor. Erst alle Wiki-
  // Link-Matches im Dokument sammeln, dann genau einen IPC-Roundtrip an
  // den Main schicken, dort gegen den Backlinks-Index pruefen.
  // 4T-0054: targets enthalten jetzt auch Anker (z.B. 'Datei#Heading'
  // oder 'Datei#^block-id'). Main trennt sie selbst und prueft sowohl
  // Datei-Existenz als auch Heading-Slug bzw. Block-ID.
  // 4T-0294: Wiki-Regeln nur bei aktiver Wiki-Link-Erweiterung — ohne sie
  // ist `[[Ziel]]` regulaerer Text, ein Broken-Link-Marker waere falsch.
  const wikiMatches = [];
  if (isExtensionActive('wiki-links'))
    for (const m of text.matchAll(LINT_WIKI_RE)) {
      const from = m.index;
      const to = from + m[0].length;
      if (lintIsInCodeContext(stateAtStart, from)) continue;
      if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
      // 4T-0067 (Epic 3E-0012): In Tabellen-Zellen muss das Pipe als `\|`
      // escapet werden, damit der Tabellen-Parser es nicht als Spaltentrenner
      // sieht. Der Original-Regex stoppt am ersten Pipe und nimmt das
      // Backslash davor mit ins Target — das wird hier wieder abgeschnitten.
      const target = (m[1] || '').replace(/\\$/, '').trim();
      if (!target) continue;
      wikiMatches.push({ from, to, target });
    }
  // Regel 7 (4T-0324, Epic 3E-0058): Link-Ziele ausserhalb des Bereichs
  // (nur in Bereichs-Apps). Wiki-Links werden doc-relativ aufgeloest
  // (Index-/Alias-Fallbacks zielen in den Dokument-Baum und bleiben aussen
  // vor); Markdown-Links relativ oder absolut. Aussen markierte Wiki-Spans
  // werden von der Broken-Pruefung uebersprungen (ein Marker pro Link).
  const outsideWikiSpans = new Set();
  if (state.areaPath && tab.path) {
    for (const w of wikiMatches) {
      const filePart = w.target.split('#')[0].trim();
      if (!filePart) continue;
      // 4T-1277 (Befund B3): Die relativen Wiki-Formen sind keine Pfade.
      // `/Name` bezeichnet eine Unterseite der aktuellen Seite und `..` ihre
      // Elternseite; beide koennen den Bereich bauartbedingt nicht verlassen.
      // Ohne diese Ausnahme wurde `[[/Earth]]` zu `/Earth.md` und damit unter
      // Linux zu einem absoluten Pfad an der Wurzel des Dateisystems — also
      // «ausserhalb» —, waehrend derselbe Verweis unter Windows dokument-
      // relativ blieb und zufaellig innerhalb landete.
      if (isRelativeTarget(filePart)) continue;
      const withExt = /\.[a-z0-9]+$/i.test(filePart) ? filePart : `${filePart}.md`;
      const resolved = resolveLocalTarget(tab.path, withExt);
      if (resolved && isOutsideActiveArea(resolved)) {
        outsideWikiSpans.add(w.from);
        pushRange(w.from, w.to, 'outsideAreaLink', resolved);
      }
    }
    for (const m of text.matchAll(LINT_MD_LINK_RE)) {
      // 4T-0476: Gruppe 1 = <…>-Form (Leerzeichen erlaubt), Gruppe 2 = klammerlos.
      const target = ((m[1] !== undefined ? m[1] : m[2]) || '').trim();
      if (!target || target.startsWith('#') || /^[a-z]{2,}:/i.test(target)) continue;
      const from = m.index;
      const to = from + m[0].length;
      if (lintIsInCodeContext(stateAtStart, from)) continue;
      if (lintIsInFrontmatter(stateAtStart, from, fmRange)) continue;
      const resolved = resolveLocalTarget(tab.path, target);
      if (resolved && isOutsideActiveArea(resolved)) {
        pushRange(from, to, 'outsideAreaLink', resolved);
      }
    }
  }

  if (wikiMatches.length > 0 && tab.path) {
    const targets = [...new Set(wikiMatches.map((w) => w.target))];
    try {
      const result = await api.resolveWikiTargets(tab.path, targets);
      if (result && result.status === 'ready') {
        const existingSet = new Set(result.existing || []);
        const brokenAnchorSet = new Set(result.brokenAnchor || []);
        // 4T-0336 (Epic 3E-0061): mehrdeutige Ziele (Ordner-Pfad- und
        // Unterseiten-Form treffen verschiedene Dateien).
        const ambiguousSet = new Set(result.ambiguous || []);
        for (const w of wikiMatches) {
          if (outsideWikiSpans.has(w.from)) continue;
          if (ambiguousSet.has(w.target)) {
            pushRange(w.from, w.to, 'ambiguousWikiTarget');
            continue;
          }
          if (existingSet.has(w.target)) continue;
          if (brokenAnchorSet.has(w.target)) {
            // 4T-0054: Datei existiert, aber Heading-/Block-Anker nicht.
            pushRange(w.from, w.to, 'brokenWikiAnchor');
          } else {
            pushRange(w.from, w.to, 'brokenWikiLink');
          }
        }
      }
      // Bei 'indexing' / 'unavailable': Regel 4/5 wird in diesem Lauf
      // unterdrueckt, die anderen drei Regeln werden trotzdem angewendet.
    } catch {
      // IPC-Fehler ignorieren; Regel 4/5 entfaellt fuer diesen Lauf.
    }
  }

  // Regel 6 (4T-0061): unbekannter Callout-Typ. Header-Regex matcht den Typ-
  // Slug aus `> [!type]`; wenn der Typ nicht in der Whitelist steht, wird der
  // Slug-Bereich markiert. Wird in Code- und Frontmatter-Kontext unterdrueckt.
  // 4T-0294: nur bei aktiver Callout-Erweiterung — ohne sie ist der
  // Header regulaerer Blockquote-Text, ein Typ-Marker waere falsch.
  LINT_CALLOUT_HEADER_RE.lastIndex = 0;
  if (isExtensionActive('callouts'))
    for (const m of text.matchAll(LINT_CALLOUT_HEADER_RE)) {
      const type = m[1];
      if (CALLOUT_TYPE_WHITELIST.has(type)) continue;
      // Markierter Bereich: nur der Typ-Slug innerhalb der eckigen Klammern.
      const slugFrom = m.index + m[0].indexOf(type);
      const slugTo = slugFrom + type.length;
      if (lintIsInCodeContext(stateAtStart, slugFrom)) continue;
      if (lintIsInFrontmatter(stateAtStart, slugFrom, fmRange)) continue;
      pushRange(slugFrom, slugTo, 'unknownCalloutType');
    }

  // Regel 8 (4T-0533, Epic 3E-0089): unpaariger %%-Kommentar-Marker. Ein
  // oeffnendes %% ohne Schliessung blendet den gesamten Dokument-Rest aus
  // allen Ansichten und Exporten aus — der Hinweis sitzt am Entstehungsort
  // (nur die zwei Marker-Zeichen). Bereiche kommen aus dem geteilten,
  // code- und frontmatter-bewussten Scanner (computeCommentRanges, pro
  // Doc-Version gecacht); eigene Kontext-Checks entfallen deshalb. Nur bei
  // aktiver comments-Erweiterung — ohne sie ist %% Literal.
  if (isExtensionActive('comments')) {
    for (const r of computeCommentRanges(stateAtStart.doc)) {
      if (r.closed) continue;
      pushRange(r.from, r.from + 2, 'unpairedCommentMarker');
    }
  }

  // Stale-Check: wenn das Dokument inzwischen veraendert wurde, sind die
  // gesammelten Positionen ggf. ungueltig. Dann verwerfen wir das Ergebnis;
  // ein neuer Lauf ist eh schon ueber den UpdateListener angestossen.
  // R2-09 (4T-0174): Doc-Identitaet statt Laenge — CM6-Docs sind immutabel,
  // jede Aenderung erzeugt eine neue Instanz. Der Laengen-Vergleich liess
  // laengengleiche Aenderungen waehrend des IPC-awaits durch (falsch
  // platzierte Marker).
  if (paneEditors.indexOf(view) < 0) return;
  if (view.state.doc !== stateAtStart.doc) return;

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const set = Decoration.set(ranges.map((r) => r.mark.range(r.from, r.to)));
  view.dispatch({ effects: setLintDecorations.of(set) });
}

// UpdateListener triggert Debounce-Lauf bei Doc-Aenderungen.
export const lintUpdateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged) scheduleLint(update.view);
});

// Hover-Tooltip mit lokalisiertem Inhalt. Sucht an der Hover-Position die
// erste Lint-Marker-Decoration und baut daraus einen kleinen DOM-Tooltip.
export const lintHoverTooltip = hoverTooltip((view, pos) => {
  const decoSet = view.state.field(lintField, false);
  if (!decoSet) return null;
  let hit = null;
  decoSet.between(Math.max(0, pos - 1), pos + 1, (from, to, value) => {
    const ruleId = value.spec && value.spec.attributes && value.spec.attributes['data-lint-rule'];
    if (!ruleId) return;
    // 4T-0324: optionale Zusatz-Info (aufgeloester Ziel-Pfad).
    const detail = value.spec && value.spec.attributes && value.spec.attributes['data-lint-detail'];
    hit = { from, to, ruleId, detail };
    return false;
  });
  if (!hit) return null;
  const target = view.state.doc.sliceString(hit.from, hit.to);
  return {
    pos: hit.from,
    end: hit.to,
    above: true,
    create() {
      return { dom: buildLintTooltipDom(hit.ruleId, target, hit.detail) };
    },
  };
});

/**
 * Baut den DOM-Inhalt des Hover-Tooltips zu einer Marker-Regel.
 *
 * @param {string} ruleId Regel-Kennung aus LINT_RULES.
 * @param {string} target Markierter Text an der Fundstelle.
 * @param {string} [detail] Zusatz-Info des Markers (z. B. der Ziel-Pfad).
 * @returns {HTMLElement} Tooltip-Knoten.
 */
export function buildLintTooltipDom(ruleId, target, detail) {
  const dom = document.createElement('div');
  dom.className = 'cm-linter-tooltip';
  const title = document.createElement('div');
  title.className = 'cm-linter-tooltip-title';
  title.textContent = t(`linter.${ruleId}.short`);
  dom.appendChild(title);
  const desc = document.createElement('div');
  desc.className = 'cm-linter-tooltip-desc';
  let text = t(`linter.${ruleId}.tooltip`);
  if (
    ruleId === 'brokenWikiLink' ||
    ruleId === 'brokenWikiAnchor' ||
    ruleId === 'ambiguousWikiTarget'
  ) {
    const cleaned = target
      .replace(/^\[\[|\]\]$/g, '')
      .split('|')[0]
      .trim();
    text = text.replace('{target}', cleaned);
  } else if (ruleId === 'unknownCalloutType') {
    text = text.replace('{type}', target);
  } else if (ruleId === 'outsideAreaLink') {
    // 4T-0324: voller aufgeloester Ziel-Pfad aus dem Marker-Detail.
    text = text.replace('{target}', detail || target);
  }
  desc.textContent = text;
  dom.appendChild(desc);
  return dom;
}
