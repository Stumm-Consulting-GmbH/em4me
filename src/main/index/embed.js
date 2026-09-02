// 4T-000977 (Epic 3E-000196): Anker-Snippet-Extraktion für Wiki-Embeds,
// herausgelöst aus src/main/backlinks.js. Schneidet aus einem Datei-Inhalt
// den Abschnitt zu einem Heading- oder Block-Anker (extractEmbedSnippet für
// den embed:read-IPC-Handler); der markdown-it-Parser der Block-Range-
// Erkennung lädt weiterhin lazy beim ersten Embed-Lookup.

'use strict';

const { githubLikeSlug } = require('../../shared/markdown/slug.js');
const { FENCE_RE } = require('../../shared/markdown/link-scan.js');
const { HEADING_RE } = require('./parse.js');

// 4T-000064 (Epic 3E-000012): markdown-it fuer die AST-basierte Block-Range-
// Erkennung bei `![[Datei#^id]]`-Embeds. Lazy-Init beim ersten Aufruf, damit
// das Modul nur geladen wird, wenn ein Embed-Lookup tatsaechlich erfolgt.
let mdEmbedParserInstance = null;
function getEmbedParser() {
  if (!mdEmbedParserInstance) {
    const MarkdownIt = require('markdown-it');
    mdEmbedParserInstance = new MarkdownIt({ html: false, breaks: false });
  }
  return mdEmbedParserInstance;
}

// 4T-000055 (Epic 3E-000011): Schneidet aus dem Datei-Inhalt einen Anker-
// Snippet heraus. Wird vom embed:read-IPC-Handler genutzt fuer Markdown-
// Embeds mit Anker (![[Datei#Heading]] / ![[Datei#^id]]).
//
// Bei Heading-Anker: von der Heading-Zeile bis zur naechsten Heading mit
// gleichem oder hoeherem Rang (oder Datei-Ende). Heading-Zeile selbst ist
// Teil des Snippets. Fenced-Code-Bloecke werden uebersprungen, damit
// Markdown-Beispiele im Code nicht versehentlich als Heading gefunden
// werden.
//
// Bei Block-Anker (anchor.startsWith('^')): wird mit 4T-000064 AST-basiert
// aufgeloest — siehe extractBlockByAnchor. Das umschliessende Block-Element
// (Listen-Item inkl. Sub-Listen, Fenced-Code, Tabellen-Zeile, mehrzeiliger
// Blockquote, Paragraph) wird komplett extrahiert. Bei Parser-Fehler oder
// unbekannter Struktur Fallback auf die alte Zeilen-Heuristik (nur die
// Marker-Zeile selbst).
//
// Liefert null, wenn der Anker nicht gefunden wurde.

// 4T-000064 (Epic 3E-000012): Token-Typen, die als Block-Container gelten und
// das gesamte umschliessende Block-Konstrukt abdecken (mehrzeilige Listen-
// Items, Blockquotes, Tabellen-Zeilen, Fenced- und Indented-Code).
const EMBED_CONTAINER_TYPES = new Set([
  'list_item_open',
  'blockquote_open',
  'tr_open',
  'fence',
  'code_block',
  'html_block',
]);

// 4T-000064 (Epic 3E-000012): AST-basierte Block-Range-Erkennung fuer Block-
// Anker `^id`. Parst den Content mit markdown-it, findet die Source-Zeile
// mit dem `^id`-Marker und ermittelt das innerste Container-Block-Token,
// dessen token.map die Zeile einschliesst. Dessen Source-Range
// (lines[from..to]) ist der einzubettende Block. Wenn kein Container passt,
// wird auf den umschliessenden paragraph_open / heading_open zurueckgegriffen
// (Marker in einfachem Paragraph oder Heading).
//
// Liefert den extrahierten Block-Text mit entferntem `^id`-Marker, oder
// null bei Parser-Fehler bzw. wenn der Marker nicht zu einem Token
// zugeordnet werden kann (Fallback wird dann vom Aufrufer verwendet).
function extractBlockByAnchor(content, blockId, lines) {
  const escapedId = blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 4T-000064: Marker kann entweder mit Whitespace davor am Ende einer
  // Inhalts-Zeile stehen (typisch: `Text ^id`) oder allein am Zeilen-
  // anfang (typisch: nach einem Fenced Code Block, wo der Marker nicht
  // auf der Closing-Fence-Zeile stehen darf).
  const markerRe = new RegExp(`(?:^|\\s)\\^${escapedId}\\s*$`, 'u');
  // Marker-Zeile in den Source-Lines suchen.
  let markerLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (markerRe.test(lines[i])) {
      markerLine = i;
      break;
    }
  }
  if (markerLine < 0) return null;

  let tokens;
  try {
    tokens = getEmbedParser().parse(String(content || ''), {});
  } catch {
    return null;
  }

  // Innerstes Container-Token finden, dessen map die Marker-Zeile abdeckt.
  // Container haben Vorrang vor paragraph_open / heading_open, damit ein
  // Marker innerhalb eines Listen-Items das gesamte Item (inkl. Sub-Listen)
  // liefert, statt nur den paragraph der Marker-Zeile.
  let bestToken = null;
  let fallbackToken = null;
  let fallbackTokenIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.map) continue;
    if (token.nesting === -1) continue;
    if (!(token.map[0] <= markerLine && markerLine < token.map[1])) continue;
    if (EMBED_CONTAINER_TYPES.has(token.type)) {
      bestToken = token;
    } else if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      fallbackToken = token;
      fallbackTokenIndex = i;
    }
  }
  let finalToken = bestToken || fallbackToken;
  if (!finalToken || !finalToken.map) return null;

  // Sonderfall fuer Fenced Code Blocks: der Marker `^id` kann nicht auf
  // der schliessenden ```-Zeile stehen (das wuerde den Fence-Close zer-
  // stoeren). Obsidian-Konvention ist daher `^id` auf einer eigenen Zeile
  // direkt nach dem Block. Wir erkennen das: wenn der bestToken ein
  // paragraph_open ist, der nur den Marker als Inhalt traegt, mappen wir
  // ihn auf das DIREKT VORANGEHENDE Container-Token.
  if (!bestToken && fallbackToken && fallbackToken.type === 'paragraph_open') {
    const inlineTok = tokens[fallbackTokenIndex + 1];
    const inlineContent =
      inlineTok && inlineTok.type === 'inline' ? String(inlineTok.content || '').trim() : '';
    if (inlineContent === '^' + blockId) {
      for (let k = fallbackTokenIndex - 1; k >= 0; k--) {
        const prev = tokens[k];
        if (!prev.map) continue;
        if (prev.nesting === -1) continue;
        if (EMBED_CONTAINER_TYPES.has(prev.type)) {
          finalToken = prev;
          break;
        }
      }
    }
  }

  // Block extrahieren; in der Marker-Zeile den `^id`-Marker entfernen.
  const blockStart = finalToken.map[0];
  const blockEnd = finalToken.map[1];
  if (blockEnd <= blockStart) return null;
  const blockLines = [];
  for (let i = blockStart; i < blockEnd; i++) {
    const line = lines[i] != null ? lines[i] : '';
    blockLines.push(i === markerLine ? line.replace(markerRe, '') : line);
  }
  return blockLines.join('\n');
}

function extractEmbedSnippet(content, anchor) {
  if (!anchor) return content;
  const lines = String(content || '').split(/\r?\n/);

  if (anchor.startsWith('^')) {
    const id = anchor.slice(1);
    // 4T-000064 (Epic 3E-000012): AST-basierte Block-Range-Erkennung. Erkennt
    // den umschliessenden Block (Listen-Item mit Sub-Inhalt, Code-Block,
    // Tabellen-Zeile, mehrzeiliger Blockquote) und extrahiert ihn vollstaen-
    // dig. Bei Fehler oder unbekannter Struktur Fallback auf die alte
    // Zeilen-Heuristik (eine Zeile mit dem Marker).
    const blockSnippet = extractBlockByAnchor(content, id, lines);
    if (blockSnippet !== null) return blockSnippet;
    // Fallback: nur die Marker-Zeile selbst (Verhalten vor 4T-000064).
    // 4T-000064: Pattern erlaubt jetzt auch Marker am Zeilenanfang ohne
    // Whitespace davor — symmetrisch zum AST-Pfad in extractBlockByAnchor.
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\s)\\^${escapedId}\\s*$`, 'u');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        return lines[i].replace(re, '');
      }
    }
    return null;
  }

  const wantedSlug = githubLikeSlug(anchor);
  let startLine = -1;
  let headingLevel = 0;
  let inFence = false;
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(HEADING_RE);
    if (m && githubLikeSlug(m[1]) === wantedSlug) {
      startLine = i;
      headingLevel = (lines[i].match(/^(#{1,6})/) || ['', ''])[1].length;
      break;
    }
  }
  if (startLine < 0) return null;

  let endLine = lines.length;
  inFence = false;
  fenceChar = null;
  for (let i = startLine + 1; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= headingLevel) {
      endLine = i;
      break;
    }
  }
  return lines.slice(startLine, endLine).join('\n');
}

module.exports = {
  extractEmbedSnippet,
};
