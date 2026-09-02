// 4T-000363 (Epic 3E-000067): Gemeinsame, prozess-neutrale Quelle fuer die Block-
// Anker-Erkennung (`^id` am Blockende). Single Source of Truth fuer die Anker-
// Regex und die Extraktion aus einem Dokument-Text: der Backlinks-Index
// (src/main/backlinks.js, `blockIds`) UND der Renderer-Abgleich des Block-
// Metadaten-Panels (Epic 3E-000067) lesen hieraus, damit "welche Zeichenfolge ist
// ein Block-Anker" an genau einer Stelle definiert ist. Ohne gemeinsame Quelle
// divergieren Index und Panel-Abgleich (aktive vs. verwaiste Anker).
//
// Electron-frei, rein auf Strings (Vorbild: src/shared/markdown/link-scan.js,
// src/shared/markdown/slug.js).
'use strict';

const { FENCE_RE, frontmatterBodyStart } = require('./markdown/link-scan.js');

// Block-Anker am Zeilenende: `^id` als letztes Element einer Zeile (mit
// optionalem fuehrenden Whitespace) oder als einziger Zeileninhalt. \p{L}/\p{N}
// lassen Umlaute und Unicode-Buchstaben in der ID zu. IDENTISCH zur frueheren
// lokalen Definition in backlinks.js (dorthin jetzt importiert).
const BLOCK_ANCHOR_RE = /(?:^|\s)\^([\p{L}\p{N}_-]+)\s*$/u;

// Validierung einer nackten Anker-ID (ohne '^'): dieselbe Zeichenklasse wie in
// der Zeilen-Regex. Genutzt beim Anlegen und Umbenennen von Ankern.
const BLOCK_ANCHOR_ID_RE = /^[\p{L}\p{N}_-]+$/u;

function isValidBlockAnchorId(id) {
  return typeof id === 'string' && BLOCK_ANCHOR_ID_RE.test(id);
}

// Extrahiert die Block-Anker eines Dokument-Textes in Textreihenfolge.
// Ueberspringt YAML-Frontmatter und Fenced-Code-Bloecke exakt wie der Backlinks-
// Parser (src/main/backlinks.js), damit Anker in Code-Beispielen nicht als echte
// Anker zaehlen. Duplikate: das erste Vorkommen zaehlt (wie die Link-Aufloesung),
// weitere Vorkommen werden in `duplicates` gemeldet.
//
// Rueckgabe:
//   order:      string[]         — eindeutige IDs in Reihenfolge des ersten Vorkommens
//   lineById:   Map<id, number>  — 1-basierte Zeile des ersten Vorkommens
//   duplicates: Set<id>          — IDs, die mehr als einmal vorkommen
function extractBlockAnchors(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const start = frontmatterBodyStart(lines);
  const order = [];
  const lineById = new Map();
  const duplicates = new Set();
  let inFence = false;
  let fenceChar = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
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
    const m = line.match(BLOCK_ANCHOR_RE);
    if (m) {
      const id = m[1];
      if (lineById.has(id)) {
        duplicates.add(id);
      } else {
        order.push(id);
        lineById.set(id, i + 1);
      }
    }
  }
  return { order, lineById, duplicates };
}

// Schreibt einen Block-Anker im gesamten Dokument-Text um: die Anker-Definition
// (`^oldId` am Blockende) UND die eingehenden Verweise im selben Dokument
// (`[[Datei#^oldId]]`, `[[#^oldId]]`, `[[Datei#^oldId|Label]]`) auf `newId`.
// Grundlage des Umbenennen-Kommandos im Panel (Konzept-Entscheidung 3: Text-
// Anker und Verweise werden synchron mitgezogen). Frontmatter und Fenced-Code
// bleiben unberuehrt (dieselbe Bereinigung wie extractBlockAnchors). Bei
// ungueltigen oder gleichen IDs bleibt der Text unveraendert. Rein auf Strings.
function rewriteAnchorReferences(text, oldId, newId) {
  const src = String(text ?? '');
  if (!isValidBlockAnchorId(oldId) || !isValidBlockAnchorId(newId) || oldId === newId) {
    return src;
  }
  const esc = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Anker-Definition: `^oldId` als letztes Zeilenelement (mit fuehrendem
  // Zeilenanfang oder Whitespace, optionalem Trailing-Whitespace).
  const defRe = new RegExp('(^|\\s)\\^' + esc + '(\\s*)$', 'u');
  // Verweise: `#^oldId` unmittelbar vor `]` (Ziel-Ende) oder `|` (Label-Trenner).
  const linkRe = new RegExp('#\\^' + esc + '(?=[\\]|])', 'gu');
  const lines = src.split(/\r?\n/);
  const start = frontmatterBodyStart(lines);
  let inFence = false;
  let fenceChar = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
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
    lines[i] = line.replace(defRe, '$1^' + newId + '$2').replace(linkRe, '#^' + newId);
  }
  return lines.join('\n');
}

// Zeichen-Vorrat der generierten Anker-IDs: Kleinbuchstaben und Ziffern
// (Teilmenge der erlaubten Zeichenklasse; gut lesbar, keine Sonderzeichen).
const GEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const GEN_LENGTH = 6;

// Erzeugt eine kurze, kollisionsfreie Zufalls-ID (6 Zeichen aus [a-z0-9]).
// `existing` ist ein Set/Array bereits vergebener IDs derselben Datei; die
// Rueckgabe ist garantiert nicht darin enthalten (Konzept-Entscheidung 5:
// kurze Zufalls-ID statt sprechendem Slug). Die ID-Laenge waechst nach sehr
// vielen Kollisionen als (praktisch unerreichbare) Terminierungs-Sicherung.
function generateBlockAnchorId(existing) {
  const taken = existing instanceof Set ? existing : new Set(existing || []);
  let length = GEN_LENGTH;
  for (let attempt = 0; ; attempt++) {
    let id = '';
    for (let i = 0; i < length; i++) {
      id += GEN_ALPHABET.charAt(Math.floor(Math.random() * GEN_ALPHABET.length));
    }
    if (!taken.has(id)) return id;
    if (attempt > 0 && attempt % 1000 === 0) length++;
  }
}

// Ermittelt den Block-Anker des Absatzes, in dem `line` (1-basiert) steht —
// die Grundlage der Cursor-Folge des Block-Eigenschaften-Panels (Konzept-
// Entscheidung 5: das Panel folgt dem Block unter dem Cursor). Ein "Absatz" ist
// hier der durch Leerzeilen begrenzte Bereich zusammenhaengender nicht-leerer
// Zeilen um die Cursor-Zeile; enthaelt er einen (Fence-/Frontmatter-bereinigten)
// Anker, wird dessen ID geliefert, sonst null. Auf einer Leerzeile gibt es
// keinen Block (null). Nutzt extractBlockAnchors als Anker-Quelle, damit Cursor-
// Folge und Index dieselben Anker sehen.
function blockAnchorForLine(text, line) {
  const lines = String(text ?? '').split(/\r?\n/);
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  if (lines[idx].trim() === '') return null;
  let start = idx;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  let end = idx;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
  const { lineById } = extractBlockAnchors(text);
  for (const [id, ln] of lineById) {
    const li = ln - 1;
    if (li >= start && li <= end) return id;
  }
  return null;
}

module.exports = {
  BLOCK_ANCHOR_RE,
  BLOCK_ANCHOR_ID_RE,
  isValidBlockAnchorId,
  extractBlockAnchors,
  blockAnchorForLine,
  rewriteAnchorReferences,
  generateBlockAnchorId,
};
