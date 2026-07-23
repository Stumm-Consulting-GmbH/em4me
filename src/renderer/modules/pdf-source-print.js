// 4T-0311 (Epic 3E-0055): Druck-Aufbereitung der Quelltext-Ansicht fuer
// den PDF-Export.
//
// CodeMirror virtualisiert (nur die sichtbaren Zeilen stehen im DOM) —
// der Editor selbst ist nicht druckbar. Der Export baut deshalb aus dem
// Dokumenttext einen dedizierten Print-Block: Markdown-Syntax-
// Hervorhebung ueber das gebuendelte highlight.js (folgt via data-theme
// dem Light-Zwang des Exports), optional eine Zeilennummern-Spalte gemaess
// Tab-Toggle, weicher Umbruch langer Zeilen (nur die erste Druckzeile
// traegt die Nummer, wie im Editor mit aktivem Zeilenumbruch).
'use strict';

import hljs from 'highlight.js/lib/core';
import markdownLanguage from 'highlight.js/lib/languages/markdown';

// Idempotent: die shared Markdown-Pipeline im Renderer-Bundle registriert
// die Sprache bereits auf derselben hljs-Core-Instanz; die eigene
// Registrierung macht dieses Modul unabhaengig von deren Lade-Reihenfolge
// (und einzeln jsdom-testbar).
if (!hljs.getLanguage('markdown')) {
  hljs.registerLanguage('markdown', markdownLanguage);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Markdown-Quelltext -> hljs-HTML (eine Zeichenkette ueber alle Zeilen).
// Fehler fallen still auf escaptes Plain-HTML zurueck (Muster des
// highlight-Callbacks der Markdown-Pipeline).
export function highlightMarkdownSource(text) {
  const source = String(text == null ? '' : text);
  try {
    return hljs.highlight(source, { language: 'markdown', ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(source);
  }
}

// hljs-HTML in Zeilen zerlegen. Hervorhebungs-Spans koennen Zeilengrenzen
// ueberspannen (z.B. ein Fenced-Code-Block als ein hljs-code-Span) — an
// jeder Zeilengrenze werden alle offenen Spans geschlossen und in der
// Folgezeile wieder geoeffnet, damit jede Druckzeile fuer sich balanciertes
// Markup traegt. hljs-Output enthaelt ausschliesslich <span>-Tags.
export function splitHighlightedLines(html) {
  const s = String(html == null ? '' : html);
  const lines = [];
  const openTags = [];
  let current = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '<') {
      const end = s.indexOf('>', i);
      if (end < 0) {
        current += s.slice(i);
        break;
      }
      const tag = s.slice(i, end + 1);
      if (tag.startsWith('</')) openTags.pop();
      else if (!tag.endsWith('/>')) openTags.push(tag);
      current += tag;
      i = end + 1;
      continue;
    }
    if (ch === '\n') {
      lines.push(current + '</span>'.repeat(openTags.length));
      current = openTags.join('');
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  lines.push(current + '</span>'.repeat(openTags.length));
  return lines;
}

// Baut das Druck-Element der Quelltext-Ansicht. Die Zeilennummern-Breite
// haengt als CSS-Variable am Container (rechtsbuendige Spalte in der
// Breite der groessten Nummer); die hljs-Basisklasse liefert die
// Grundfarbe aus dem Theme-CSS.
export function buildPdfSourcePrintElement(text, { showLineNumbers = false } = {}) {
  const container = document.createElement('div');
  container.className = 'pdf-source-print hljs' + (showLineNumbers ? ' with-line-numbers' : '');
  const lines = splitHighlightedLines(highlightMarkdownSource(text));
  container.style.setProperty('--pdf-source-lineno-width', `${String(lines.length).length}ch`);
  for (let idx = 0; idx < lines.length; idx++) {
    const line = document.createElement('div');
    line.className = 'pdf-source-line';
    if (showLineNumbers) {
      const lineno = document.createElement('span');
      lineno.className = 'pdf-source-lineno';
      lineno.textContent = String(idx + 1);
      line.appendChild(lineno);
    }
    const code = document.createElement('span');
    code.className = 'pdf-source-code';
    // Leere Zeilen kollabieren sonst auf Hoehe 0 (Zero-Width-Space).
    code.innerHTML = lines[idx] === '' ? '&#8203;' : lines[idx];
    line.appendChild(code);
    container.appendChild(line);
  }
  return container;
}
