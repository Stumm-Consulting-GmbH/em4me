// Erkennungs-Muster und Dokument-Scans des Live-Modus (Regex-Konstanten,
// WeakMap-gecachte Zeilen-Scans, Kontext- und Fussnoten-Suchen).
// 4T-0982 (Epic 3E-0196): aus live-widgets.js herausgelöst; reine Analyse ohne
// Decoration- oder Widget-Bezug, deshalb nur von api und den geteilten
// Callout-Typen abhängig.
'use strict';

import { syntaxTree } from '@codemirror/language';

import { CALLOUT_TYPES } from '../../../shared/callouts.js';
import { getDocText } from '../app/api.js';

// 4T-0476 (Epic 3E-0088): CommonMark-Destination in spitzen Klammern
// (<Mein Ziel.md>) — der Lezer-URL-Knoten umfasst die Klammern selbst.
// Klick-Pfad (file:resolveLink) und Bild-Auflösung erwarten den rohen
// Zielwert, deshalb werden umschließende Klammern hier abgestreift.
export function stripAngleDestination(url) {
  const s = String(url || '');
  return s.startsWith('<') && s.endsWith('>') ? s.slice(1, -1) : s;
}

// 4T-0081: Highlight (`==Text==`). Identisches Pattern wie EDITOR_MARK_RE
// im markMarkerField (live-marker-fields.js); im Live-Plugin als Regex-Pass
// parallel zur Lezer-Iteration, weil kein Standard-Lezer-Knoten existiert.
// Die existierende cm-mark-marker-Klasse aus markMarkerField bleibt fuer
// die gelbe Hinterlegung des Inhalts aktiv.
export const LIVE_HIGHLIGHT_RE = /(?<!\\)==([^=\n][^\n]*?)(?<!\\)==/g;

// 4T-0081: Tag-Erkennung. Spiegelt die Regeln aus tagsPlugin (src/shared/markdown/plugins.js)
// (`#` am Zeilenanfang oder nach Nicht-Wortzeichen, Tag-Zeichen
// [\p{L}\p{N}_/-]+, kein Slash am Rand, mindestens ein Buchstabe, kein
// Hex-Farbcode). Lookbehind sorgt dafuer, dass m.index die `#`-Position
// ist; ohne Lookbehind muesste die Vorgaenger-Char-Position rausgerechnet
// werden.
export const LIVE_TAG_RE = /(?<![\p{L}\p{N}_#])#([\p{L}\p{N}_/-]+)/gu;
export const LIVE_TAG_HEX_COLOR = /^[0-9a-f]{3,8}$/i;
export const LIVE_TAG_HAS_LETTER = /[\p{L}]/u;

// 4T-0082: Wiki-Link-Erkennung. Pattern matched `[[Inhalt]]`, Inhalt darf
// keine Klammern und keinen Zeilenumbruch enthalten. Inhalt kann
// `Datei`, `Datei#Anker`, `Datei^block-id`, `Datei|Alias`,
// `Datei#Anker|Alias` sein; Aufloesung im Klick-Handler ueber activateLink.
export const LIVE_WIKILINK_RE = /\[\[([^[\]\n]+?)\]\]/g;

// 4T-0082: Footnote-Verweis-Erkennung. Lookahead `(?!:)` schliesst
// Definitionen (`[^id]:`) aus, sodass nur die Verweis-Variante als
// hochgestellt gerendert wird. id-Pattern wie in EDITOR_FOOTNOTE_RE
// (live-marker-fields.js).
export const LIVE_FOOTNOTE_REF_RE = /\[\^([\w-]+)\](?!:)/g;

// 4T-0197: Emoji-Shortcode-Kandidaten. Zeichenklasse deckt die Keys des
// full-Sets ab (lowercase, Ziffern, `_`, `+`, `-`). Ob ein Kandidat
// wirklich ein Shortcode ist, entscheidet der Lookup in emojiDefs —
// bei Nicht-Treffern wird ab dem schliessenden `:` weitergesucht
// (es koennte das oeffnende des naechsten Kandidaten sein), identisch
// zur Plugin-Scan-Semantik im Render-Pfad.
export const LIVE_EMOJI_RE = /:([a-z0-9_+-]+):/g;

// 4T-0197: Abbreviation-Definitionen scannen (`*[KUERZEL]: Langtext`).
// WeakMap-Cache pro Doc-Version (Muster computeCalloutScan). defLines
// traegt die Zeilen-Nummern der Definitionszeilen — dort wird kein
// Vorkommen dekoriert (die Zeile bleibt im Live-Modus sichtbar, analog
// zu Footnote-Definitionen; dokumentierte Einschraenkung).
const abbrScanCache = new WeakMap();

export function computeAbbrScan(doc) {
  const cached = abbrScanCache.get(doc);
  if (cached) return cached;
  const defs = new Map();
  const defLines = new Set();
  const ABBR_DEF_RE = /^\*\[(.+?)\]:\s*(.+?)\s*$/;
  const docLines = getDocText(doc).split('\n');
  for (let i = 0; i < docLines.length; i++) {
    const m = docLines[i].match(ABBR_DEF_RE);
    if (!m) continue;
    defs.set(m[1], m[2]);
    defLines.add(i + 1);
  }
  // K-04 (4T-0310): Vorkommen-Regex pro Kuerzel einmal pro Doc-Version
  // kompilieren (statt bei jedem Build-Durchlauf neu). matchAll klont die
  // Regex intern, ein geteiltes globales Objekt ist damit gefahrlos.
  const regexes = new Map();
  for (const abbrWord of defs.keys()) {
    const escaped = abbrWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regexes.set(abbrWord, new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu'));
  }
  const result = { defs, defLines, regexes };
  abbrScanCache.set(doc, result);
  return result;
}

// 4T-0198: Bild mit Groessen-Suffix `![alt](url =WxH)`. Lezer parst das
// Suffix nicht als Image-Bestandteil (der Image-Knoten endet nach
// `![alt]`, kein URL-Child), deshalb eigener Regex-Pass. Mindestens eine
// Ziffer Pflicht (`=100x200`, `=100x`, `=x200`); andere Suffixe bleiben
// dem Render-Pfad ueberlassen.
export const LIVE_IMG_SIZE_RE = /!\[([^[\]\n]*)\]\(([^()\n]*?)\s+=(?:\d+x\d*|\d*x\d+)\)/g;

// 4T-0201: Sub-/Sup-/Ins-Erkennung, gegen das jeweilige Plugin-Verhalten
// kalibriert (Fixture-Paare Render vs. Live):
// - Sub: Single-Tilde, KEIN Whitespace im Inhalt (markdown-it-sub-
//   Regel); Lookarounds schliessen `~~`-Strikethrough und Escapes aus.
// - Sup: Doppel-Caret (eigenes Plugin); kein Whitespace direkt innen.
// - Ins: Doppel-Plus; oeffnender Marker nur vor Buchstabe/Ziffer — das
//   spiegelt die Flanking-Regel, die `C++-Code … C++-Stil` im Render
//   NICHT matchen laesst (empirisch verifiziert); `+` im Inhalt bleibt
//   konservativ ausgeschlossen.
export const LIVE_SUB_RE = /(?<![~\\])~([^~\s]+)~(?!~)/g;
export const LIVE_SUP_RE = /(?<![\^\\])\^\^(?=[^\s^])([^^\n]*?)(?<![\s\\])\^\^(?!\^)/g;
export const LIVE_INS_RE = /(?<![+\\])\+\+(?=[\p{L}\p{N}])([^+\n]*?)(?<![\s+\\])\+\+(?!\+)/gu;

// 4T-0203: Spoiler `||Text||` (kalibriert an der scanDelims-Mechanik:
// kein Whitespace direkt innen) und Critic Markup (fuenf Formen; das
// Mapping open->close prueft der Pass, der Regex sammelt nur
// Kandidaten). Critic-Spannen werden VOR den Sub/Sup/Ins-Paessen
// gesammelt, damit `{++x++}` nicht zusaetzlich als `++x++` dekoriert
// wird (im Render-Pfad konsumiert die frueher registrierte Critic-Rule
// die Spanne ebenfalls zuerst).
export const LIVE_SPOILER_RE = /(?<![\\|])\|\|(?=[^\s|])([^|\n]*?)(?<![\s\\])\|\|(?!\|)/g;
export const LIVE_CRITIC_RE = /\{(\+\+|--|~~|==|>>)([^\n{}]*?)(\+\+|--|~~|==|<<)\}/g;
export const LIVE_CRITIC_CLOSE_FOR = { '++': '++', '--': '--', '~~': '~~', '==': '==', '>>': '<<' };

// 4T-0202: Bracketed Spans `[Text]{...}`. Marker (`[` und `]{...}`)
// werden versteckt, der Inhalt bleibt ohne Klassen-Anwendung sichtbar
// (nutzerdefinierte Klassen haben im Editor-Kontext kein CSS;
// dokumentierte Einschraenkung — die volle Wirkung zeigt das Render-
// Pane). Kein Match nach `!`/`[` (Wiki-Konstrukte) und nicht fuer
// Footnote-Referenzen (`[^...]`).
export const LIVE_SPAN_ATTRS_RE = /(?<![![\\])\[([^[\]\n^][^[\]\n]*)\]\{([^{}\n]*)\}/g;

// 4T-0202: trailing Attribut-Block an Heading-Zeilen (`# H {#id}`).
// markdown-it-attrs konsumiert den Block am Heading-Ende auch bei
// verworfenen Attributen; non-space nach `{` haelt geschweifte
// Fliesstext-Klammern (`{ so }`) heraus.
export const LIVE_HEADING_ATTRS_RE = /\{[^\s{}][^{}\n]*\}[ \t]*$/;
// 4T-0471 (Epic 3E-0087): echter (nicht escapter) Zeilenende-Marker {-}/{+}
// der Nummerierung. Wird auf inaktiven Heading-Zeilen versteckt.
export const LIVE_HEADING_MARKER_RE = /(?<!\\)\{[-+]\}[ \t]*$/;

// 4T-0198: Steht das Bild allein im Absatz? Zeilenbasierte Naeherung an
// die implicit-figures-Absatz-Definition: Zeile == Bild-Quelltext und
// beide Nachbar-Zeilen leer bzw. Doc-Grenze. Einzeiligkeit des Images ist
// durch R1-01 ohnehin Voraussetzung der Live-Ersetzung.
export function imageIsStandalone(state, line, matchText) {
  if (line.text.trim() !== matchText.trim()) return false;
  if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '') return false;
  if (line.number < state.doc.lines && state.doc.line(line.number + 1).text.trim() !== '')
    return false;
  return true;
}

// 4T-0199: Pre-Pass fuer Definition Lists und Pandoc Line Blocks
// (WeakMap-Cache pro Doc, Muster computeCalloutScan). Beide Konstrukte
// kennt der Lezer nicht, deshalb zeilenbasierte Erkennung; die Bloecke
// werden in buildBlockWidgetValue als MarkdownBlockWidget ersetzt.
//
// Deflist-Heuristik (markdown-it-deflist empirisch gespiegelt,
// konservativ): Def-Zeile = 0-2 Spaces + ':' oder '~' + Whitespace;
// Term-Zeile = nicht-leere Zeile ohne Block-Marker-Anfang, auf die
// direkt oder nach genau einer Leerzeile eine Def-Zeile folgt. Ueber
// Leerzeilen getrennte Term-Gruppen verschmelzen zu EINEM Block, wenn
// die naechste nicht-leere Zeile eine Def-Zeile oder ein neues
// Term/Def-Paar ist (das Plugin zieht sie in dasselbe <dl>).
//
// Line-Block-Heuristik: zusammenhaengende `| `-Zeilen (bis 3 Spaces
// Einrueckung wie der Block-Ruler); `|` ohne folgendes Leerzeichen
// gehoert nicht dazu. Lezer-Table-Kontext wird beim Einbau gefiltert.
const deflistLineBlockScanCache = new WeakMap();

const DEFLIST_DEF_RE = /^ {0,2}[:~]\s/;
const LINE_BLOCK_LIVE_RE = /^ {0,3}\| /;
// Block-Marker, die eine Zeile als Deflist-TERM disqualifizieren (die
// markdown-it-Block-Regeln konsumieren sie vor der deflist-Rule):
// Heading, Blockquote, Liste, Fence, Tabelle/Line-Block, HR.
const DEFLIST_TERM_BLOCKED_RE =
  /^ {0,3}(#{1,6}\s|>|[-*+]\s|\d{1,9}[.)]\s|```|~~~|\||(?:[-*_]\s*){3,}$)/;

export function computeDeflistLineBlockScan(doc) {
  const cached = deflistLineBlockScanCache.get(doc);
  if (cached) return cached;
  const docLines = getDocText(doc).split('\n');
  const total = docLines.length;
  const isBlank = (s) => s.trim() === '';
  const isDef = (s) => DEFLIST_DEF_RE.test(s);
  const isTerm = (s) => !isBlank(s) && !isDef(s) && !DEFLIST_TERM_BLOCKED_RE.test(s);
  // Index der zugehoerigen Def-Zeile fuer einen Term bei i, -1 wenn
  // keine folgt (eine Leerzeile zwischen Term und Def ist erlaubt).
  const defIdxFor = (i) => {
    if (i + 1 < total && isDef(docLines[i + 1])) return i + 1;
    if (i + 1 < total && isBlank(docLines[i + 1]) && i + 2 < total && isDef(docLines[i + 2]))
      return i + 2;
    return -1;
  };

  const lineBlocks = [];
  const deflists = [];
  let i = 0;
  while (i < total) {
    // Line Blocks zuerst (eindeutiges Praefix-Muster).
    if (LINE_BLOCK_LIVE_RE.test(docLines[i])) {
      const fromLine = i + 1;
      while (i < total && LINE_BLOCK_LIVE_RE.test(docLines[i])) i++;
      lineBlocks.push({ fromLine, toLine: i });
      continue;
    }
    if (isTerm(docLines[i]) && defIdxFor(i) >= 0) {
      const fromLine = i + 1;
      let end = defIdxFor(i);
      let j = end + 1;
      while (j < total) {
        if (!isBlank(docLines[j])) {
          end = j;
          j++;
          continue;
        }
        // Leerzeile: gehoert nur dazu, wenn danach eine Def-Zeile oder
        // ein neues Term/Def-Paar folgt (Plugin haengt sie ans selbe dl).
        let n = j;
        while (n < total && isBlank(docLines[n])) n++;
        if (n >= total) break;
        if (isDef(docLines[n]) || (isTerm(docLines[n]) && defIdxFor(n) >= 0)) {
          j = n;
          continue;
        }
        break;
      }
      deflists.push({ fromLine, toLine: end + 1 });
      i = end + 1;
      continue;
    }
    i++;
  }
  const result = { deflists, lineBlocks };
  deflistLineBlockScanCache.set(doc, result);
  return result;
}

// 4T-0199: liegt die Position in einem Lezer-Table-Knoten? (Guard fuer
// Line Blocks — GFM-Tabellen-Zeilen matchen ebenfalls `| `.)
export function positionInsideTable(state, pos) {
  let n = syntaxTree(state).resolveInner(pos, 1);
  while (n) {
    if (n.name === 'Table') return true;
    n = n.parent;
  }
  return false;
}

// 4T-0200: Custom-Container-Scan (WeakMap-Cache pro Doc). Erkennt Top-
// Level-Bloecke `::: name [Titel]` bis zur schliessenden Marker-Zeile
// gleicher oder groesserer Laenge; ohne Schluss-Marker laeuft der Block
// bis zum Doc-Ende (markdown-it-container-Verhalten, empirisch
// verifiziert). Innere Container (laengere Marker aussen) werden
// uebersprungen — nur Top-Level wird gestylt (dokumentierte
// Einschraenkung, analog Callout-Nesting). Marker-Einrueckung bis drei
// Spaces wie im Plugin.
const containerScanCache = new WeakMap();

const CONTAINER_LIVE_HEADER_RE = /^ {0,3}(:{3,})\s*([a-z][a-z0-9-]*)([ \t]+(.*?))?[ \t]*$/;

export function computeContainerScan(doc) {
  const cached = containerScanCache.get(doc);
  if (cached) return cached;
  const containerInfos = [];
  const docLines = getDocText(doc).split('\n');
  let i = 0;
  while (i < docLines.length) {
    const m = docLines[i].match(CONTAINER_LIVE_HEADER_RE);
    if (!m) {
      i++;
      continue;
    }
    const markerLen = m[1].length;
    let closeIdx = -1;
    for (let j = i + 1; j < docLines.length; j++) {
      const cm = docLines[j].match(/^ {0,3}(:{3,})[ \t]*$/);
      if (cm && cm[1].length >= markerLen) {
        closeIdx = j;
        break;
      }
    }
    const endIdx = closeIdx >= 0 ? closeIdx : docLines.length - 1;
    containerInfos.push({
      type: m[2],
      overrideTitle: (m[4] || '').trim(),
      isCallout: !!CALLOUT_TYPES[m[2]],
      headerLineNo: i + 1,
      endLineNo: endIdx + 1,
      hasClose: closeIdx >= 0,
    });
    i = endIdx + 1;
  }
  const result = { containerInfos };
  containerScanCache.set(doc, result);
  return result;
}

// R1-05 (4T-0180): Callout-Zeilen-Scan pro Doc-Version cachen. Der Scan
// (Voll-Text-Split plus Zeilen-Regexes) lief zuvor bei jeder Cursor-
// Bewegung und jedem Viewport-Scroll komplett neu, haengt aber nur vom
// Doc-Inhalt ab. CALLOUT_TYPES ist statisch.
const calloutScanCache = new WeakMap();

export function computeCalloutScan(doc) {
  const cached = calloutScanCache.get(doc);
  if (cached) return cached;
  const calloutLines = new Set();
  const calloutInfos = [];
  const docLines = getDocText(doc).split('\n');
  // R1-13 (4T-0186): Header-Muster an markdown-it angeglichen —
  // (a) `>` ohne Pflicht-Leerzeichen vor `[!type]` (CommonMark erlaubt
  //     den Blockquote-Marker ohne folgendes Space),
  // (b) Einrueckung maximal drei Spaces (ab vier Spaces parst markdown-it
  //     einen Code-Block, kein Callout; flache Listen-Callouts mit zwei
  //     bis drei Spaces bleiben abgedeckt, tiefere Listen-Ebenen verlieren
  //     nur das Live-Styling — der Render-Pfad zeigt sie weiterhin korrekt),
  // (c) Override-Titel auch ohne Leerzeichen nach `[!type][+-]`.
  // Bewusst NICHT nachgebaut: Lazy-Continuation (Body-Zeilen ohne `>`) —
  // zeilenbasiert nicht zuverlaessig erkennbar, Fehlertoleranz waere
  // schlechter als die heutige Einschraenkung (dokumentierte Rest-Differenz).
  const CALLOUT_LIVE_HEADER_RE = /^ {0,3}>[ \t]*\[!([a-z]+)\]([+-]?)[ \t]*(.*?)[ \t]*$/;
  for (let i = 0; i < docLines.length; i++) {
    const headerMatch = docLines[i].match(CALLOUT_LIVE_HEADER_RE);
    if (!headerMatch || !CALLOUT_TYPES[headerMatch[1]]) continue;
    const headerLineNo = i + 1;
    calloutLines.add(headerLineNo);
    let lastLineNo = headerLineNo;
    for (let j = i + 1; j < docLines.length; j++) {
      if (/^ {0,3}>/.test(docLines[j])) {
        calloutLines.add(j + 1);
        lastLineNo = j + 1;
      } else break;
    }
    calloutInfos.push({
      type: headerMatch[1],
      foldChar: headerMatch[2] || '',
      overrideTitle: (headerMatch[3] || '').trim(),
      headerLineNo,
      lastLineNo,
    });
  }
  const result = { calloutLines, calloutInfos };
  calloutScanCache.set(doc, result);
  return result;
}

// 4T-0082: Footnote-Definition im Doc suchen. Liefert den Definitions-Text
// der ersten Zeile (alles nach `[^id]:`). Mehrzeilige Definitionen werden
// vereinfacht zur ersten Zeile gekuerzt — Tooltip soll kompakt bleiben.
export function findFootnoteDefinitionText(doc, id) {
  if (!id) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\[\\^' + escaped + '\\]:\\s*(.+?)\\s*$', 'm');
  const m = getDocText(doc).match(re);
  return m ? m[1] : null;
}

// 4T-0082: Footnote-Definition-Range im Doc suchen. Liefert {from, to} des
// `[^id]:`-Markers (nicht des kompletten Definitions-Texts), reicht zum
// Hinscrollen.
export function findFootnoteDefinitionRange(doc, id) {
  if (!id) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\[\\^' + escaped + '\\]:', 'm');
  const text = getDocText(doc);
  const m = text.match(re);
  if (!m) return null;
  return { from: m.index, to: m.index + m[0].length };
}
