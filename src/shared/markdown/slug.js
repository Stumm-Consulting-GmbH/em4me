// 4T-0179 (Epic 3E-0039): aus src/main/preload.js extrahiert.
// Electron-freie Basis-Helfer der Markdown-Pipeline (CommonJS, Vorbild
// src/shared/callouts.js). Single Source fuer Escaping und Heading-Slugs.
'use strict';

// 4T-0023: HTML-Escape fuer den highlight-Fallback. Bewusst eigene Funktion
// statt md.utils.escapeHtml, damit sie auch innerhalb des Konstruktor-
// Callbacks verfuegbar ist (md existiert dann noch nicht).
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 4T-0014: Heading-IDs (GitHub-kompatibler Slug) auf <h1>..<h6> setzen.
// Wird vom Outline-Panel als Sprungziel im Render-Pane verwendet und
// repariert nebenbei seit-Release-0.1 latent kaputte [Text](#slug)-Anker.
// Slug-Funktion folgt der GitHub-Konvention: lowercased, Whitespace zu '-',
// alles ausser [\p{L}\p{N}\-_] entfernt. Diakritika werden via NFKD-Normalize
// und Stripping der Combining-Marks entfernt, damit "Lösungsansatz" zu
// 'losungsansatz' wird (passend zu GitHubs Slug-Erwartung).
function githubLikeSlug(text) {
  const normalized = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '');
  return normalized || 'section';
}

module.exports = { escapeHtml, githubLikeSlug };
