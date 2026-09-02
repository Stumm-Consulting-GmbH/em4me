// 4T-000985 (Epic 3E-000196): aus src/shared/markdown/plugins.js geschnitten.
// Kommentar-Gruppe: der code-bewusste Scanner der %%-Kommentare und das
// zeilentreue Strippen. Electron-frei; aufgerufen wird beides direkt aus
// markdown.js (Quelltext-Vorverarbeitung, keine markdown-it-Regel).
'use strict';

// ---------------------------------------------------------------------------
// 4T-000479 (Epic 3E-000089): %%-Kommentare. Text zwischen %%-Markern (inline
// und mehrzeilig) erscheint in keiner gerenderten Ansicht und keinem Export,
// bleibt aber im Quelltext. Als code-bewusste Quelltext-Vorverarbeitung
// statt markdown-it-Regel, weil die Kombination "block-uebergreifend,
// unpaarig bis Dokument-Ende, Code bleibt Literal" von Inline-/Block-Regeln
// strukturell nicht leistbar ist (Inline-Regeln enden am Block-Kontext).
// findPercentCommentRanges ist die gemeinsame Quelle fuer das Strippen
// (renderMarkdown/convertMarkdownPortable in markdown.js) UND die Editor-
// Einfaerbung bzw. Live-Ausblendung (live-deco.js/live-widgets.js) —
// garantierte Paritaet aller Ansichten.
//
// Festlegungen:
// - %% in Fenced-Code-Bloecken (```/~~~) und Inline-Code-Spans bleibt
//   Literal; eingerueckte Code-Bloecke (4-Spaces-Form) sind bewusst nicht
//   geschuetzt (Block-Kontext-Erkennung ohne Parser zu fragil).
// - Escape \%% ergibt literales %% im Fliesstext (der Scanner ueberspringt
//   \%; die fruehe markdown-it-escape-Rule rendert \% als %). Jeder Marker
//   ist einzeln zu escapen; Escapes gelten auch innerhalb eines Kommentars.
// - Unpaariges oeffnendes %% wirkt bis zum Dokument-Ende (kein
//   Ueber-Rendern privater Inhalte).
// - Innerhalb eines Kommentars hat Markdown keine Bedeutung (auch keine
//   Code-Zaeune); der naechste nicht escapte %%-Marker schliesst.

const COMMENT_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

// Naechster Backtick-Lauf mit exakt runLen Zeichen (CommonMark-Schliesser
// eines Inline-Code-Spans); -1 wenn keiner folgt.
function findBacktickRun(src, from, runLen) {
  let i = from;
  const len = src.length;
  while (i < len) {
    if (src[i] === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      if (n === runLen) return i;
      i += n;
    } else {
      i++;
    }
  }
  return -1;
}

// Liefert die Kommentar-Bereiche als [{ from, to, closed }] in Quelltext-
// Offsets, inklusive der %%-Marker. closed=false markiert einen unpaarigen
// Kommentar (wirkt bis Text-Ende; Grundlage des Linter-Hinweises, 4T-000533).
// Einziger Scanner — Render-Strip und Editor-Dekoration arbeiten auf
// identischen Bereichen.
function findPercentCommentRanges(text) {
  const src = String(text || '');
  const len = src.length;
  const ranges = [];
  let i = 0;
  let atLineStart = true;
  let fenceChar = null;
  let fenceLen = 0;
  while (i < len) {
    if (atLineStart) {
      const lineEnd = src.indexOf('\n', i);
      const end = lineEnd === -1 ? len : lineEnd;
      const line = src.slice(i, end);
      const m = line.match(COMMENT_FENCE_RE);
      if (fenceChar) {
        // Innerhalb eines Fences zaehlt nur die Schliess-Zeile (gleiches
        // Zeichen, mindestens gleiche Laenge, sonst nur Whitespace).
        if (
          m &&
          m[1][0] === fenceChar &&
          m[1].length >= fenceLen &&
          line.slice(m.index + m[0].length).trim() === ''
        ) {
          fenceChar = null;
        }
        i = end + 1;
        continue;
      }
      if (m) {
        fenceChar = m[1][0];
        fenceLen = m[1].length;
        i = end + 1;
        continue;
      }
      atLineStart = false;
    }
    const ch = src[i];
    if (ch === '\n') {
      i++;
      atLineStart = true;
      continue;
    }
    if (ch === '\\' && (src[i + 1] === '%' || src[i + 1] === '\\')) {
      i += 2;
      continue;
    }
    if (ch === '`') {
      let runLen = 1;
      while (src[i + runLen] === '`') runLen++;
      const close = findBacktickRun(src, i + runLen, runLen);
      if (close !== -1) {
        i = close + runLen;
        continue;
      }
      i += runLen;
      continue;
    }
    if (ch === '%' && src[i + 1] === '%') {
      const from = i;
      let j = i + 2;
      let close = -1;
      while (j < len) {
        const c = src[j];
        if (c === '\\' && (src[j + 1] === '%' || src[j + 1] === '\\')) {
          j += 2;
          continue;
        }
        if (c === '%' && src[j + 1] === '%') {
          close = j;
          break;
        }
        j++;
      }
      const to = close === -1 ? len : close + 2;
      ranges.push({ from, to, closed: close !== -1 });
      i = to;
      continue;
    }
    i++;
  }
  return ranges;
}

// Entfernt die Kommentar-Bereiche zeilentreu: enthaltene Newlines bleiben
// stehen, damit data-source-line (Scroll-Sync, Checkbox-Toggle) fuer
// nachfolgende Bloecke weiter die Editor-Zeile des vollen Dokuments trifft.
function stripPercentComments(text) {
  const src = String(text || '');
  const ranges = findPercentCommentRanges(src);
  if (!ranges.length) return src;
  let out = '';
  let pos = 0;
  for (const r of ranges) {
    out += src.slice(pos, r.from);
    out += src.slice(r.from, r.to).replace(/[^\n]+/g, '');
    pos = r.to;
  }
  out += src.slice(pos);
  return out;
}

module.exports = {
  findPercentCommentRanges,
  stripPercentComments,
};
