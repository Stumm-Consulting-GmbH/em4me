// 4T-0595 (Epic 3E-0111): Inline-Berechnungen — Rechenausdrücke `{= Ausdruck =}`
// im Fließtext. Die Auswertung läuft ausschließlich über die vorhandene
// Query-Ausdrucks-Engine (parseExpression/evaluateExpression) in einem
// kontext-freien Rahmen: nur Literale, Operatoren, date()/dur()-Literale und
// der Funktions-Katalog; Feld-Zugriffe (type 'field') werden vor der
// Auswertung erkannt und als eigener Fehler gemeldet. Gerendert wird das
// formatierte Ergebnis (formatValue) als Span mit dem Roh-Ausdruck im
// Tooltip; Fehler rendern ein dezentes Fehler-Zeichen mit lokalisiertem
// Hinweis (data-i18n-title, Muster Datatable-Zell-Fehler).
//
// Das Modul ist prozess-neutral (CJS, kein Electron, kein DOM) und bewusst
// frei von markdown.js-Abhängigkeiten: der Renderer (Live-Widget,
// Quelltext-Einfärbung) importiert es direkt ins Bundle — die Engine-Kette
// (perspective-query.js, perspective-query-eval.js, link-scan.js,
// task-markers.js) ist dort über die Datatable-Anbindung bereits enthalten.
//
// Marker-Grammatik (Syntax-Verifikation 4T-0595 gegen den Bestand):
// - Öffner `{=`, Schließer `=}`, einzeilig. Das `{` hängt beim Rule-Aufruf
//   bereits in state.pending (kein Terminator-Zeichen der text-Rule) und
//   wird dort abgeschnitten — Muster critic_markup.
// - `{==` bleibt Critic-Highlight: direkt nach dem öffnenden `=` darf kein
//   zweites `=` folgen.
// - Der Schließer ist das erste `=}` außerhalb von Engine-String-Literalen
//   ('…' oder "…", escapelos wie im Query-Tokenizer); eine unterminierte
//   Quote lässt das Konstrukt Literal-Text.
// - Leerer bzw. Nur-Whitespace-Ausdruck bleibt Literal-Text (kein Konstrukt).
// - Escape `\{=` läuft über die markdown-it-Escape-Rule und erreicht pending
//   nie als `{`; findInlineCalcSpans prüft die Backslash-Parität explizit.
'use strict';

// 4T-0987 (Epic 3E-0196): Abfrage-Sprache im Feature-Ordner src/shared/query/.
const { parseExpression } = require('../query/perspective-query.js');
const { evaluateExpression } = require('../query/perspective-query-eval.js');
const { validateQuery } = require('../query/query-functions.js');
const { formatValue } = require('../query/query-format.js');
const { escapeHtml } = require('./slug.js');

// Fehler-Zeichen in Text-Präsentation (U+FE0E verhindert Emoji-Darstellung).
const INLINE_CALC_ERROR_GLYPH = '⚠︎';

// Portable-Styles (Muster CRITIC_PORTABLE_STYLES): selbsttragend ohne
// styles.css, neutraler Badge-Ton bzw. gedämpfte Fehlerfarbe.
const INLINE_CALC_PORTABLE_STYLE = 'background:rgba(0,0,0,0.06);border-radius:3px;padding:0 0.2em;';
const INLINE_CALC_PORTABLE_STYLE_ERROR =
  'color:#c0392b;border:1px dashed #c0392b;border-radius:3px;padding:0 0.2em;';

// Findet ab `pos` (Index des öffnenden `=`, direkt hinter `{`) das Konstrukt-
// Ende. Liefert { expr, end } (end = Index hinter `}`) oder null.
function matchInlineCalcAt(src, pos) {
  if (src.charCodeAt(pos) !== 0x3d /* = */) return null;
  // `{==` gehört Critic Markup (Highlight-Form).
  if (src.charCodeAt(pos + 1) === 0x3d /* = */) return null;
  const len = src.length;
  let i = pos + 1;
  while (i < len) {
    const ch = src.charCodeAt(i);
    if (ch === 0x0a /* \n */) return null;
    if (ch === 0x22 /* " */ || ch === 0x27 /* ' */) {
      // Engine-Strings sind escapelos: roh bis zur nächsten gleichen Quote.
      const close = src.indexOf(src[i], i + 1);
      if (close === -1 || src.slice(i + 1, close).includes('\n')) return null;
      i = close + 1;
      continue;
    }
    if (ch === 0x3d /* = */ && src.charCodeAt(i + 1) === 0x7d /* } */) {
      const expr = src.slice(pos + 1, i);
      if (!expr.trim()) return null;
      return { expr, end: i + 2 };
    }
    i++;
  }
  return null;
}

// Alle Konstrukt-Spannen eines Textes (für Live-Widget und Quelltext-
// Einfärbung; Code-Kontexte filtert der Aufrufer). Backslash-Parität vor dem
// `{` spiegelt die markdown-it-Escape-Rule: `\{=` bleibt Literal, `\\{=` ist
// ein escapter Backslash vor einem echten Konstrukt.
function findInlineCalcSpans(text) {
  const src = String(text == null ? '' : text);
  const spans = [];
  let i = 0;
  while (i < src.length) {
    const brace = src.indexOf('{', i);
    if (brace === -1) break;
    let backslashes = 0;
    while (brace - 1 - backslashes >= 0 && src.charCodeAt(brace - 1 - backslashes) === 0x5c) {
      backslashes++;
    }
    if (backslashes % 2 === 1) {
      i = brace + 1;
      continue;
    }
    const m = matchInlineCalcAt(src, brace + 1);
    if (!m) {
      i = brace + 1;
      continue;
    }
    spans.push({ from: brace, to: m.end, expr: m.expr });
    i = m.end;
  }
  return spans;
}

// 4T-0596 (Epic 3E-0111): Portable-Export — ersetzt Konstrukte im Markdown-
// Quelltext durch selbsttragende Ergebnis-Spans (Inline-Styles, Roh-Ausdruck
// als title), damit der exportierte Text das Ergebnis auch in anderen
// Markdown-Programmen zeigt. Fehlerhafte Ausdrücke bleiben roh (Quelltext-
// Erhalt; die Portable-Ansicht der App rendert dafür das Fehlerbild über die
// mdPortable-Regel). Code-bewusst: Fenced-Code-Blöcke (Muster
// stripHeadingMarkers) und Inline-Code-Spans (exakte Backtick-Run-Länge wie
// CommonMark) bleiben unangetastet; `\{=` bleibt escaped erhalten.
function findBacktickRun(s, fromIdx, runLen) {
  let i = fromIdx;
  while (i < s.length) {
    if (s[i] === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      if (n === runLen) return i;
      i += n;
      continue;
    }
    i++;
  }
  return -1;
}

function convertInlineCalc(text) {
  const src = String(text == null ? '' : text);
  const lines = src.split('\n');
  let fenceChar = null;
  let fenceLen = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const fm = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fm) {
      const ch = fm[1][0];
      const len = fm[1].length;
      if (fenceChar === null) {
        fenceChar = ch;
        fenceLen = len;
      } else if (ch === fenceChar && len >= fenceLen && line.trim() === fm[1]) {
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }
    if (fenceChar !== null) continue;
    if (line.indexOf('{=') === -1) continue;
    let out = '';
    let i = 0;
    let changed = false;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '\\') {
        out += line.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '`') {
        let runLen = 1;
        while (line[i + runLen] === '`') runLen++;
        const close = findBacktickRun(line, i + runLen, runLen);
        const end = close === -1 ? i + runLen : close + runLen;
        out += line.slice(i, end);
        i = end;
        continue;
      }
      if (ch === '{') {
        const m = matchInlineCalcAt(line, i + 1);
        if (m) {
          const res = evaluateInlineCalc(m.expr);
          if (res.ok) {
            out +=
              `<span class="inline-calc" style="${INLINE_CALC_PORTABLE_STYLE}"` +
              ` title="${escapeHtml(m.expr.trim())}">${escapeHtml(res.text)}</span>`;
            changed = true;
          } else {
            out += line.slice(i, m.end);
          }
          i = m.end;
          continue;
        }
      }
      out += ch;
      i++;
    }
    if (changed) lines[li] = out;
  }
  return lines.join('\n');
}

// Erkennt Feld-Referenzen im Ausdrucks-AST (kontext-freier Rahmen: Feld-
// Zugriffe sind in der ersten Ausbaustufe nicht unterstützt und werden als
// eigener Fehler gemeldet statt still zu null auszuwerten).
function hasFieldRef(node) {
  if (!node || typeof node !== 'object') return false;
  switch (node.type) {
    case 'field':
      return true;
    case 'call':
      return node.args.some(hasFieldRef);
    case 'inlist':
      return hasFieldRef(node.left) || node.values.some(hasFieldRef);
    case 'not':
    case 'neg':
      return hasFieldRef(node.operand);
    case 'and':
    case 'or':
    case 'cmp':
    case 'arith':
      return hasFieldRef(node.left) || hasFieldRef(node.right);
    default:
      return false;
  }
}

// Wertet einen Roh-Ausdruck kontext-frei aus. Fehler-Codes bilden die
// i18n-Schnittstelle (inlineCalc.error.<code>):
//   'syntax'   — Parse-Fehler (inkl. Rest-Text nach dem Ausdruck)
//   'field'    — Feld-Referenz im Ausdruck (nicht unterstützt)
//   'function' — unbekannte Funktion oder falsche Argument-Anzahl
//   'value'    — Auswertung ergibt null (Typ-Fehler, Division durch 0,
//                ungültiges Datum); die Engine wirft nie.
function evaluateInlineCalc(exprSource) {
  const parsed = parseExpression(String(exprSource == null ? '' : exprSource));
  if (!parsed.ok) return { ok: false, code: 'syntax' };
  if (hasFieldRef(parsed.ast)) return { ok: false, code: 'field' };
  if (validateQuery(parsed.ast)) return { ok: false, code: 'function' };
  const value = evaluateExpression(parsed.ast, { now: Date.now() });
  if (value === null || value === undefined) return { ok: false, code: 'value' };
  return { ok: true, value, text: formatValue(value) };
}

// Gemeinsame Anzeige-Spezifikation für Render-Pipeline und Live-Widget
// (Paritäts-Muster calendarValueBadgeSpec): ok → Ergebnis-Text mit dem
// getrimmten Roh-Ausdruck als Tooltip; Fehler → Fehler-Zeichen plus Code.
function inlineCalcSpec(expr) {
  const trimmed = String(expr == null ? '' : expr).trim();
  const res = evaluateInlineCalc(trimmed);
  if (res.ok) return { ok: true, text: res.text, title: trimmed };
  return { ok: false, text: INLINE_CALC_ERROR_GLYPH, title: trimmed, errorCode: res.code };
}

// markdown-it-Plugin: Inline-Regel (Anker ist das `=` hinter `{`, das `{`
// steckt in state.pending — Muster critic_markup) plus Render-Rule mit
// Viewer- und Portable-Zweig.
function inlineCalcPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  function tokenize(state, silent) {
    const start = state.pos;
    if (!state.pending.endsWith('{')) return false;
    const m = matchInlineCalcAt(state.src, start);
    if (!m) return false;
    if (silent) return false;
    // `{` aus dem pending-Text entfernen — es gehört zum Konstrukt.
    state.pending = state.pending.slice(0, -1);
    const token = state.push('inline_calc', '', 0);
    token.meta = { expr: m.expr };
    token.markup = '{' + state.src.slice(start, m.end);
    state.pos = m.end;
    return true;
  }

  mdInstance.inline.ruler.before('strikethrough', 'inline_calc', tokenize);

  mdInstance.renderer.rules.inline_calc = (tokens, idx) => {
    const spec = inlineCalcSpec(tokens[idx].meta.expr);
    if (spec.ok) {
      const style = isPortable ? ` style="${INLINE_CALC_PORTABLE_STYLE}"` : '';
      return `<span class="inline-calc"${style} title="${escapeHtml(spec.title)}">${escapeHtml(spec.text)}</span>`;
    }
    const style = isPortable ? ` style="${INLINE_CALC_PORTABLE_STYLE_ERROR}"` : '';
    return (
      `<span class="inline-calc inline-calc-error"${style} title="${escapeHtml(spec.title)}"` +
      ` data-i18n-title="inlineCalc.error.${spec.errorCode}">${escapeHtml(spec.text)}</span>`
    );
  };
}

module.exports = {
  INLINE_CALC_ERROR_GLYPH,
  matchInlineCalcAt,
  findInlineCalcSpans,
  evaluateInlineCalc,
  inlineCalcSpec,
  inlineCalcPlugin,
  convertInlineCalc,
};
