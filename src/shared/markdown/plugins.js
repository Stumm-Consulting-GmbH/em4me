// 4T-0179 (Epic 3E-0039): aus src/main/preload.js extrahiert.
// Eigene markdown-it-Plugins der Pipeline (Source-Line-Mapping, Wiki-Links,
// Wiki-Embeds, Tags, Block-Anker, Callouts). Electron-frei; die Instanz-
// Registrierung (md.use/mdPortable.use) macht markdown.js in der
// Original-Reihenfolge.
'use strict';

const { escapeHtml, githubLikeSlug } = require('./slug.js');
// 4T-0498 (Epic 3E-0090): Marker-Kern der Task-Zeilen (Parsing der
// Symbol-Marker fuer die Badge-Darstellung und den Global Filter).
const taskMarkers = require('../task-markers.js');
// 4T-0470 (Epic 3E-0087): Nummerierungs-Kern der Gliederungs-Nummerierung.
const { computeHeadingNumbers, parseHeadingMarker } = require('../heading-numbers.js');
// 4T-0546 (Epic 3E-0097): Kalender-Kern fuer die Wert-Syntax @{Name: Wert}
// (Erkennung, Aufloesung, Namens-Formatierung der Badge-Darstellung).
const calendarCore = require('../calendar-core.js');
const { STANDARD_CALENDAR_ID } = calendarCore;

// 4T-0748 (Epic 3E-0138): Einheiten-Namen der Zeitspanne. Steht eine
// Ableitung auf der eingebauten Standard-Zeitrechnung, kommen Ein- und
// Mehrzahl aus den vorhandenen i18n-Schluesseln (Entscheidung des Product
// Owners vom 2026-07-26, Variante 1c); bei selbst definierten Kalendern
// bleibt der Name der Definition stehen, weil das Modell dort keine
// Mehrzahl kennt.
const CALENDAR_SPAN_UNIT_KEYS = {
  day: ['events.unit.day', 'events.unit.days'],
  week: ['events.unit.week', 'events.unit.weeks'],
  month: ['events.unit.month', 'events.unit.months'],
  year: ['events.unit.year', 'events.unit.years'],
  quarter: ['calendar.span.quarter', 'calendar.span.quarters'],
  'half-year': ['calendar.span.halfYear', 'calendar.span.halfYears'],
};

const CALENDAR_SPAN_LABEL_KEYS = [...new Set(Object.values(CALENDAR_SPAN_UNIT_KEYS).flat())];

function sourceLineMapperPlugin(mdInstance) {
  mdInstance.core.ruler.push('source_line_mapper', (state) => {
    // 4T-0282 (Epic 3E-0050): renderMarkdown rendert nur den Body NACH dem
    // Frontmatter-Block; env.sourceLineOffset traegt die Zeilenzahl des
    // abgetrennten Frontmatters, damit data-source-line die Zeile im
    // GESAMT-Dokument angibt (Scroll-Sync und Checkbox-Toggle adressieren
    // Editor-Zeilen des vollen Dokuments).
    const offset = (state.env && state.env.sourceLineOffset) || 0;
    for (const token of state.tokens) {
      if (token.map && token.nesting === 1 && token.tag) {
        token.attrSet('data-source-line', String(token.map[0] + 1 + offset));
      }
    }
  });
}

// Wiki-Link-Plugin: [[Ziel]] und [[Ziel|Label]] -> <a href="Ziel.md">Label</a>.
// Wenn das Ziel bereits eine Endung hat, wird .md nicht doppelt angehängt.
// Klick-Handling im Renderer ist identisch zu normalen Markdown-Links.
//
// 4T-0054 (Epic 3E-0011): Erweitert um Heading- und Block-Anker.
// Akzeptierte Formen:
//   [[Datei]]                — Datei.md
//   [[Datei|Label]]          — Datei.md mit eigenem Linktext
//   [[Datei#Heading]]        — Datei.md, scrollt zum Heading-Slug
//   [[Datei#^block-id]]      — Datei.md, scrollt zum Block mit ^block-id
//   [[#Heading]]             — selbes Dokument, scrollt zum Heading
//   [[#^block-id]]           — selbes Dokument, scrollt zum Block
// Anker hinter '#' werden:
//   - mit '^' am Anfang  -> Block-Anker, ID wird direkt verwendet
//     (Slug-Validierung: \p{L}\p{N}_- inkl. Umlaute).
//   - sonst              -> Heading-Anker, ueber githubLikeSlug normalisiert.
function wikiLinksPlugin(mdInstance) {
  function tokenize(state, silent) {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5b) return false;

    const end = state.src.indexOf(']]', start + 2);
    if (end < 0) return false;

    const inner = state.src.slice(start + 2, end);
    if (inner.length === 0 || inner.includes('\n') || inner.includes('[')) return false;

    // 4T-0067 (Epic 3E-0012): Pipe ist Label-Trenner. In Tabellen-Zellen
    // wird er als `\|` escapet, damit der Tabellen-Parser ihn nicht als
    // Spaltentrenner sieht. `indexOf('|')` findet beide Varianten; ein
    // verbleibender Backslash am Target-Ende wird abgeschnitten.
    const pipeIdx = inner.indexOf('|');
    const targetRaw = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).replace(/\\$/, '').trim();
    const labelRaw = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner).trim();
    if (!targetRaw) return false;

    // 4T-0054: Anker-Trennung. '#' direkt am Anfang -> reiner Anker.
    const hashIdx = targetRaw.indexOf('#');
    let pathPart = targetRaw;
    let anchorRaw = '';
    if (hashIdx >= 0) {
      pathPart = targetRaw.slice(0, hashIdx);
      anchorRaw = targetRaw.slice(hashIdx + 1);
    }

    // P-07 (4T-0176): gefaehrliche URL-Schemata gar nicht erst als Link
    // rendern (Text bleibt roh sichtbar). Der Klick-Handler verwirft solche
    // hrefs zwar, aber Browser-Default-Pfade (z.B. mittlere Maustaste)
    // sollen sich nicht allein auf die CSP verlassen muessen.
    if (/^\s*(javascript|data|vbscript):/i.test(pathPart)) return false;

    // Anker-Slug bauen. Block-Anker hat '^'-Prefix.
    let anchorPart = '';
    if (anchorRaw) {
      if (anchorRaw.startsWith('^')) {
        const id = anchorRaw.slice(1).trim();
        if (/^[\p{L}\p{N}_-]+$/u.test(id)) {
          anchorPart = '#' + id;
        }
        // Bei ungueltiger Block-ID: Anker faellt weg, Link zeigt nur auf Datei.
      } else {
        // P-05 (4T-0183): beide Zweige der frueheren Verzweigung waren
        // identisch — auf eine Zuweisung reduziert.
        const slug = githubLikeSlug(anchorRaw);
        if (slug) anchorPart = '#' + slug;
      }
    }

    // Pfad: bei reinem Anker (kein Pfad-Teil) bleibt es nur beim Anker.
    let href;
    if (pathPart === '..' || pathPart === '../') {
      // 4T-0336 (Epic 3E-0061): relativer Unterseiten-Link auf die Eltern-
      // seite. Kein '.md'-Suffix — der Klick-Pfad expandiert das Ziel
      // gegen den Basename der aktiven Datei.
      href = '..' + anchorPart;
    } else if (pathPart) {
      const hasExtension = /\.[a-z0-9]{1,8}$/i.test(pathPart);
      href = hasExtension ? pathPart : `${pathPart}.md`;
      href += anchorPart;
    } else if (anchorPart) {
      // Reiner Anker im selben Dokument.
      href = anchorPart;
    } else {
      // Weder Pfad noch Anker — kein gueltiger Wiki-Link.
      return false;
    }

    if (!silent) {
      const open = state.push('link_open', 'a', 1);
      open.attrSet('href', href);
      open.attrSet('class', 'wikilink');
      const text = state.push('text', '', 0);
      text.content = labelRaw;
      state.push('link_close', 'a', -1);
    }

    state.pos = end + 2;
    return true;
  }
  mdInstance.inline.ruler.before('link', 'wikilink', tokenize);
}

// 4T-0055 (Epic 3E-0011): Wiki-Embeds `![[Datei]]`.
// Erweitert die Wiki-Link-Syntax um den `!`-Operator als Embed-Marker.
// Akzeptierte Formen:
//   ![[bild.png]]              — Bild-Embed (max-width: 100%)
//   ![[bild.png|200]]          — Bild-Embed mit fester Breite
//   ![[bild.png|200px]]        — Bild-Embed mit fester Breite (px-Suffix)
//   ![[doc.pdf]]               — PDF-Embed (Default-Hoehe 600 px)
//   ![[doc.pdf|400]]           — PDF-Embed mit fester Breite
//   ![[notiz.md]]              — Markdown-Embed (rekursiv, Tiefe-Limit 2)
//   ![[notiz#Abschnitt]]       — Markdown-Embed nur des Abschnitts
//   ![[notiz#^block-id]]       — Markdown-Embed nur des Block-Elements
//   ![[file.zip]]              — sonstige Datei: Klick-Link mit Datei-Icon
//
// Der Plugin emittiert nur Tokens; die echte Render-Logik fuer
// PDF/Markdown/Other-Embeds laeuft im Renderer-Postprocessing (siehe
// applyWikiEmbedsIfPresent in renderer.js). Bild-Embeds werden direkt
// als <img> ausgegeben, damit resolveImagesForBase sie zu data-URIs
// konvertieren kann.
function wikiEmbedsPlugin(mdInstance) {
  function tokenize(state, silent) {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x21 /* ! */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;
    if (state.src.charCodeAt(start + 2) !== 0x5b /* [ */) return false;

    const end = state.src.indexOf(']]', start + 3);
    if (end < 0) return false;

    const inner = state.src.slice(start + 3, end);
    if (inner.length === 0 || inner.includes('\n') || inner.includes('[')) return false;

    // Pipe-Trennung: bei Embeds ist '|<n>' bzw. '|<n>px' eine Groessen-
    // Angabe (Breite in Pixel). Sonstige Werte werden in dieser Stufe
    // ignoriert (kein Alt-Text-Support).
    // 4T-0067 (Epic 3E-0012): Pipe-Escape `\|` in Tabellen-Zellen — Backslash
    // am Target-Ende wird abgeschnitten, analog zu wikiLinksPlugin.
    const pipeIdx = inner.indexOf('|');
    const targetRaw = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).replace(/\\$/, '').trim();
    const modRaw = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : '').trim();
    if (!targetRaw) return false;

    // Pfad und Anker trennen (analog zu wikiLinksPlugin).
    let pathPart = targetRaw;
    let anchorRaw = '';
    const hashIdx = targetRaw.indexOf('#');
    if (hashIdx >= 0) {
      pathPart = targetRaw.slice(0, hashIdx);
      anchorRaw = targetRaw.slice(hashIdx + 1).trim();
    }
    if (!pathPart) return false; // Reine Anker-Embeds nicht unterstuetzt.

    // Groessen-Parser: '<n>', '<n>px', '<n> px'.
    let width = null;
    if (modRaw) {
      const m = modRaw.match(/^(\d+)\s*(?:px)?$/i);
      if (m) width = parseInt(m[1], 10);
    }

    // Datei-Typ aus Extension ableiten. Ohne Extension wird '.md' angehaengt
    // (analog zu Wiki-Links).
    // 4T-0337 (Epic 3E-0061): '![[..]]' ist ein Eltern-Embed — kein
    // '.md'-Suffix, der embed:read-Handler expandiert gegen die Basis-Datei.
    if (pathPart === '..' || pathPart === '../') {
      if (!silent) {
        const token = state.push('wikiembed', '', 0);
        token.attrSet('data-embed-kind', 'md');
        token.attrSet('data-embed-path', '..');
        if (anchorRaw) token.attrSet('data-embed-anchor', anchorRaw);
      }
      state.pos = end + 2;
      return true;
    }
    const extMatch = pathPart.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    let kind;
    let finalPath = pathPart;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
      kind = 'image';
    } else if (ext === 'pdf') {
      kind = 'pdf';
    } else if (['md', 'markdown', 'mdown', 'mkd'].includes(ext) || !ext) {
      kind = 'md';
      if (!ext) finalPath = pathPart + '.md';
    } else {
      kind = 'other';
    }

    if (!silent) {
      const token = state.push('wikiembed', '', 0);
      token.attrSet('data-embed-kind', kind);
      token.attrSet('data-embed-path', finalPath);
      if (anchorRaw) token.attrSet('data-embed-anchor', anchorRaw);
      if (width != null) token.attrSet('data-embed-width', String(width));
    }

    state.pos = end + 2;
    return true;
  }
  mdInstance.inline.ruler.before('link', 'wikiembed', tokenize);

  // Renderer-Regel: Bild-Embeds direkt als <img> ausgeben (damit
  // resolveImagesForBase zu data-URI konvertiert). PDF/MD/Other werden
  // als <span class="wiki-embed-*">-Platzhalter ausgegeben; das Renderer-
  // Postprocessing baut das echte DOM.
  mdInstance.renderer.rules.wikiembed = function (tokens, idx) {
    const token = tokens[idx];
    const kind = token.attrGet('data-embed-kind') || 'other';
    const embedPath = token.attrGet('data-embed-path') || '';
    const anchor = token.attrGet('data-embed-anchor') || '';
    const width = token.attrGet('data-embed-width') || '';

    if (kind === 'image') {
      const widthStyle = width ? ` style="max-width: ${escapeHtml(width)}px"` : '';
      return `<img class="wiki-embed wiki-embed-image" src="${escapeHtml(embedPath)}" alt=""${widthStyle}>`;
    }

    let attrStr = `class="wiki-embed wiki-embed-${escapeHtml(kind)}"`;
    attrStr += ` data-embed-kind="${escapeHtml(kind)}"`;
    attrStr += ` data-embed-path="${escapeHtml(embedPath)}"`;
    if (anchor) attrStr += ` data-embed-anchor="${escapeHtml(anchor)}"`;
    if (width) attrStr += ` data-embed-width="${escapeHtml(width)}"`;
    return `<span ${attrStr}></span>`;
  };
}

// 4T-0056 (Epic 3E-0011): Tag-Inline-Rule. `#tag` im Fliesstext wird zu
// einem klickbaren <a class="tag-link" href="#tag:<name>">-Element. Tag-
// Zeichen sind \p{L}\p{N}_- plus '/' fuer Hierarchien (z.B. #projekt/x).
// Vor '#' muss Anfang der Zeile oder ein nicht-Wort-Zeichen stehen, sonst
// wird '#' als Teil eines Wortes ignoriert (z.B. 'foo#bar' ist kein Tag).
// Heading-Marker am Zeilenanfang ('# Heading') sind kein Tag, weil dort
// der Block-Tokenizer das '#' schon konsumiert, bevor der Inline-Tokenizer
// laeuft. Code-Bloecke (Inline und Fenced) sind ebenfalls aussen vor —
// markdown-it laesst Inline-Rules darin nicht laufen.
function tagsPlugin(mdInstance) {
  // 4T-0060: Hex-Farbcodes und reine Zahlen sind kein Tag.
  const HEX_COLOR = /^[0-9a-f]{3,8}$/i;
  const HAS_LETTER = /[\p{L}]/u;
  // 4T-0202: '#wort' innerhalb eines {...}-Attribut-Blocks (markdown-it-
  // attrs) ist eine ID-Angabe, kein Tag. Der Tag-Tokenizer laeuft beim
  // Inline-Parsing VOR dem attrs-Core-Ruler und wuerde den Block sonst
  // zerschneiden ({#id} bliebe sichtbar, die ID ginge verloren).
  // Heuristik: rueckwaerts in der Zeile ist das naechste {/} ein '{',
  // und vorwaerts schliesst ein '}' die Klammer noch in derselben Zeile.
  function insideAttrBlock(src, pos) {
    let open = false;
    for (let i = pos - 1; i >= 0; i--) {
      const c = src.charCodeAt(i);
      if (c === 0x0a /* \n */) break;
      if (c === 0x7d /* } */) break;
      if (c === 0x7b /* { */) {
        open = true;
        break;
      }
    }
    if (!open) return false;
    for (let i = pos + 1; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === 0x0a) return false;
      if (c === 0x7b) return false;
      if (c === 0x7d) return true;
    }
    return false;
  }
  function tokenize(state, silent) {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x23 /* # */) return false;
    // Vorzeichen-Check: Anfang oder nicht-alphanumerisch (und kein '#').
    if (start > 0) {
      const prevCh = state.src.charAt(start - 1);
      if (/[\p{L}\p{N}_#]/u.test(prevCh)) return false;
    }
    // 4T-0202: ID-Angaben in Attribut-Bloecken ueberspringen.
    if (insideAttrBlock(state.src, start)) return false;
    // 4T-0060: Markdown-Link-Ziel `](#anker)` ist kein Tag. Wenn die zwei
    // Zeichen vor '#' das Muster `](` zeigen, abbrechen. Der Render-Pfad
    // sieht das normalerweise nicht (link-Ruler konsumiert vorher), aber
    // konsistent zur Index-Logik.
    if (start >= 2 && state.src.charAt(start - 1) === '(' && state.src.charAt(start - 2) === ']') {
      return false;
    }
    // Tag-Zeichen einlesen.
    let pos = start + 1;
    const max = state.posMax;
    while (pos < max) {
      const ch = state.src.charAt(pos);
      if (!/[\p{L}\p{N}_/-]/u.test(ch)) break;
      pos++;
    }
    const tagText = state.src.slice(start + 1, pos);
    if (!tagText) return false;
    // Hierarchie-Trenner '/' darf nicht am Anfang oder Ende stehen.
    if (tagText.startsWith('/') || tagText.endsWith('/')) return false;
    // 4T-0060: Tag muss mindestens einen Buchstaben enthalten.
    if (!HAS_LETTER.test(tagText)) return false;
    // 4T-0060: Hex-Farbcodes (3-, 4-, 6- oder 8-stellig) ausschliessen.
    if (HEX_COLOR.test(tagText)) return false;

    if (!silent) {
      const open = state.push('link_open', 'a', 1);
      open.attrSet('href', '#tag:' + tagText);
      open.attrSet('class', 'tag-link');
      const text = state.push('text', '', 0);
      text.content = '#' + tagText;
      state.push('link_close', 'a', -1);
    }

    state.pos = pos;
    return true;
  }
  mdInstance.inline.ruler.before('link', 'tag', tokenize);
}

// 4T-0054 (Epic 3E-0011): Block-Anker-Syntax `^block-id` am Zeilenende.
// Hängt id-Attribut an das umschließende Block-Open-Token (paragraph_open,
// blockquote_open, list_item_open, td_open, etc.) und entfernt das Marker-
// Snippet aus dem sichtbaren Text. Slug-Validierung: \p{L}\p{N}_- (inkl.
// Umlaute), konsistent zur Block-Anker-Akzeptanz im Wiki-Link-Parser.
function blockAnchorsPlugin(mdInstance) {
  const BLOCK_ANCHOR_RE = /\s+\^([\p{L}\p{N}_-]+)\s*$/u;
  mdInstance.core.ruler.push('blockAnchors', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'inline' || !token.children) continue;
      // Letzten Text-Child finden, der nicht leer ist.
      let lastText = null;
      for (let j = token.children.length - 1; j >= 0; j--) {
        const child = token.children[j];
        if (child.type === 'text' && child.content && child.content.length > 0) {
          lastText = child;
          break;
        }
        // Nicht-Text oder leere Text-Knoten ueberspringen; aber sobald ein
        // 'echtes' Element (z.B. link_close, em_close, code_inline) kommt,
        // ist der ^id nicht am Zeilenende -> abbrechen.
        if (child.type !== 'text') {
          lastText = null;
          break;
        }
      }
      if (!lastText) continue;
      const match = lastText.content.match(BLOCK_ANCHOR_RE);
      if (!match) continue;
      const id = match[1];
      // Vorheriges Block-Open-Token suchen (nesting === 1, type !== 'inline').
      for (let k = i - 1; k >= 0; k--) {
        const prev = tokens[k];
        if (prev.nesting === 1 && prev.type !== 'inline') {
          if (!prev.attrGet('id')) prev.attrSet('id', id);
          break;
        }
      }
      // ^id-Snippet aus dem sichtbaren Text entfernen.
      lastText.content = lastText.content.slice(0, match.index);
    }
  });
}

// 4T-0061 (Epic 3E-0012): Callouts — Obsidian-Style Block-Hinweisboxen.
// Syntax als erste Zeile eines Blockquotes:
//   > [!note] Optionaler Titel        — statisch, kein Klappen
//   > [!note]+ Titel                  — klappbar, default ausgeklappt
//   > [!note]- Titel                  — klappbar, default eingeklappt
// Verschachtelte Callouts (`> > [!note]`) bleiben normale Blockquote-Tiefe.
// Override-Titel wird als Plaintext eingesetzt (kein Inline-Markdown).
//
// Architektur: Core-Ruler-Postprocessor analog zu blockAnchorsPlugin. Statt
// eines eigenen Block-Parsers nutzen wir den korrekten markdown-it-Blockquote-
// Parser und benennen passende blockquote_open/_close-Tokens zu callout_open/
// _close um, sofern die erste Zeile dem `[!type][+-]?`-Muster entspricht und
// der Typ in CALLOUT_TYPES steht. Manipulation an `inline.content` (nicht
// `inline.children`), weil unser Ruler nach 'block' aber vor 'inline' laeuft —
// die Children werden anschliessend aus dem bereinigten Content geparst.

// 4T-0087 (Epic 3E-0014): CALLOUT_TYPES und calloutIcon 2026-05-24 nach
// src/shared/callouts.js extrahiert, damit der Renderer-Prozess sie fuer
// den Live-Modus ebenfalls importieren kann. Single Source of Truth.
const { CALLOUT_TYPES } = require('../callouts');

// Inline-Styles fuer Portable-Export (kein styles.css beim Empfaenger).
// Werte muessen sowohl auf hellem als auch auf dunklem Hintergrund lesbar
// bleiben — Akzentfarbe als Linie + Text, Hintergrund mit niedrigem Alpha.
const CALLOUT_INLINE_STYLES = {
  note: { accent: '#6c757d', bg: 'rgba(108,117,125,0.10)' },
  info: { accent: '#0d6efd', bg: 'rgba(13,110,253,0.10)' },
  tip: { accent: '#0dcaf0', bg: 'rgba(13,202,240,0.14)' },
  success: { accent: '#198754', bg: 'rgba(25,135,84,0.10)' },
  question: { accent: '#6f42c1', bg: 'rgba(111,66,193,0.10)' },
  warning: { accent: '#fd7e14', bg: 'rgba(253,126,20,0.12)' },
  failure: { accent: '#dc3545', bg: 'rgba(220,53,69,0.10)' },
  danger: { accent: '#b02a37', bg: 'rgba(176,42,55,0.12)' },
  example: { accent: '#d63384', bg: 'rgba(214,51,132,0.10)' },
  quote: { accent: '#6c757d', bg: 'rgba(108,117,125,0.10)' },
};

// Default-Titel pro Sprache fuer Portable-Export. Im Render-Pane werden die
// Default-Titel ueber data-i18n-Attribut zur Laufzeit aufgeloest (siehe
// applyTranslations); im Portable-Export greift das nicht, daher hier eine
// statische Mapping-Tabelle. Sprache wird via env.lang beim mdPortable.render
// uebergeben (siehe renderMarkdownPortable im Renderer-Pfad).
const CALLOUT_PORTABLE_TITLES = {
  de: {
    note: 'Hinweis',
    info: 'Information',
    tip: 'Tipp',
    success: 'Erfolg',
    question: 'Frage',
    warning: 'Warnung',
    failure: 'Fehler',
    danger: 'Gefahr',
    example: 'Beispiel',
    quote: 'Zitat',
  },
  en: {
    note: 'Note',
    info: 'Info',
    tip: 'Tip',
    success: 'Success',
    question: 'Question',
    warning: 'Warning',
    failure: 'Failure',
    danger: 'Danger',
    example: 'Example',
    quote: 'Quote',
  },
  fr: {
    note: 'Note',
    info: 'Info',
    tip: 'Astuce',
    success: 'Succes',
    question: 'Question',
    warning: 'Avertissement',
    failure: 'Echec',
    danger: 'Danger',
    example: 'Exemple',
    quote: 'Citation',
  },
  es: {
    note: 'Nota',
    info: 'Informacion',
    tip: 'Consejo',
    success: 'Exito',
    question: 'Pregunta',
    warning: 'Aviso',
    failure: 'Error',
    danger: 'Peligro',
    example: 'Ejemplo',
    quote: 'Cita',
  },
  it: {
    note: 'Nota',
    info: 'Info',
    tip: 'Suggerimento',
    success: 'Successo',
    question: 'Domanda',
    warning: 'Avviso',
    failure: 'Errore',
    danger: 'Pericolo',
    example: 'Esempio',
    quote: 'Citazione',
  },
};

const CALLOUT_HEADER_RE = /^\[!([a-z]+)\]([-+])?\s*(.*)$/;

function calloutsPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  mdInstance.core.ruler.after('block', 'callouts', (state) => {
    const tokens = state.tokens;
    // bqDepth zaehlt offene Blockquotes/Callouts beim Iterieren. Nur Top-
    // Level-Blockquotes (bqDepth === 0 vor dem Open) werden als Callout
    // betrachtet — geschachtelte `> > [!note]` bleiben normale Blockquotes,
    // analog zum Obsidian-Verhalten.
    let bqDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === 'blockquote_close' || tok.type === 'callout_close') {
        bqDepth--;
        continue;
      }
      if (tok.type !== 'blockquote_open') continue;
      if (bqDepth > 0) {
        // Verschachtelter Blockquote — nicht transformieren.
        bqDepth++;
        continue;
      }

      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      if (!para || para.type !== 'paragraph_open' || !inline || inline.type !== 'inline') {
        bqDepth++;
        continue;
      }

      const content = inline.content || '';
      const nlIdx = content.indexOf('\n');
      const firstLine = nlIdx >= 0 ? content.slice(0, nlIdx) : content;
      const match = firstLine.match(CALLOUT_HEADER_RE);
      if (!match || !CALLOUT_TYPES[match[1]]) {
        bqDepth++;
        continue;
      }

      const type = match[1];
      const collapsibleMarker = match[2] || '';
      const overrideTitle = (match[3] || '').trim();
      const collapsible = collapsibleMarker !== '';
      const defaultOpen = collapsibleMarker === '+';

      // Korrespondierendes blockquote_close finden (Tiefen-zaehlend).
      let innerDepth = 1;
      let closeIdx = -1;
      for (let k = i + 1; k < tokens.length; k++) {
        if (tokens[k].type === 'blockquote_open') innerDepth++;
        else if (tokens[k].type === 'blockquote_close') {
          innerDepth--;
          if (innerDepth === 0) {
            closeIdx = k;
            break;
          }
        }
      }
      if (closeIdx < 0) {
        bqDepth++;
        continue;
      }

      // Tokens transformieren.
      tok.type = 'callout_open';
      tok.tag = collapsible ? 'details' : 'div';
      tok.attrSet('data-callout-type', type);
      tok.attrSet('data-collapsible', collapsible ? 'true' : 'false');
      tok.attrSet('data-default-open', defaultOpen ? 'true' : 'false');
      if (overrideTitle) tok.attrSet('data-title', overrideTitle);

      tokens[closeIdx].type = 'callout_close';
      tokens[closeIdx].tag = collapsible ? 'details' : 'div';

      // Header-Zeile aus inline.content entfernen.
      const rest = nlIdx >= 0 ? content.slice(nlIdx + 1) : '';
      if (rest === '') {
        // Header war einzige Zeile -> Paragraph-Trio entfernen.
        tokens.splice(i + 1, 3);
      } else {
        inline.content = rest;
      }
      bqDepth++;
    }
  });

  mdInstance.renderer.rules.callout_open = (tokens, idx, opts, env) => {
    const token = tokens[idx];
    return calloutBoxOpenHtml({
      type: token.attrGet('data-callout-type'),
      overrideTitle: token.attrGet('data-title') || '',
      collapsible: token.attrGet('data-collapsible') === 'true',
      defaultOpen: token.attrGet('data-default-open') === 'true',
      isPortable,
      env,
    });
  };
  mdInstance.renderer.rules.callout_close = (tokens, idx) => {
    return calloutBoxCloseHtml(tokens[idx].tag === 'details');
  };
}

// 4T-0200 (Epic 3E-0017): Callout-Box-HTML als gemeinsame Helper-Funktionen
// (aus calloutsPlugin.renderHeaderHtml extrahiert, Logik unveraendert).
// Custom Containers (`::: warning`) rendern darueber in identischer
// Callout-Optik — Viewer-Variante (data-i18n-Titel) und Portable-Variante
// (inline-Styles, env.lang-Titel) bleiben fuer beide Konstrukte eine
// einzige Quelle, keine Kopie (Architekturentscheidung 2 des Epics).
function calloutBoxOpenHtml({ type, overrideTitle, collapsible, defaultOpen, isPortable, env }) {
  const cfg = CALLOUT_TYPES[type];
  const tag = collapsible ? 'details' : 'div';
  const openAttr = collapsible && defaultOpen ? ' open' : '';
  const headerTag = collapsible ? 'summary' : 'div';

  let titleHtml;
  if (isPortable) {
    const lang = env && env.lang && CALLOUT_PORTABLE_TITLES[env.lang] ? env.lang : 'de';
    const defaultTitle = CALLOUT_PORTABLE_TITLES[lang][type];
    titleHtml = `<span class="callout-title">${escapeHtml(overrideTitle || defaultTitle)}</span>`;
  } else if (overrideTitle) {
    titleHtml = `<span class="callout-title">${escapeHtml(overrideTitle)}</span>`;
  } else {
    // data-i18n wird vom Renderer-Post-Hook (applyTranslations) gefuellt.
    titleHtml = `<span class="callout-title" data-i18n="${cfg.titleKey}"></span>`;
  }

  if (isPortable) {
    const styles = CALLOUT_INLINE_STYLES[type];
    const containerStyle = `border-left:4px solid ${styles.accent};background:${styles.bg};border-radius:6px;margin:1em 0;`;
    const headerStyle = `display:flex;align-items:center;gap:0.5em;padding:0.4em 0.8em;font-weight:600;color:${styles.accent};`;
    const bodyStyle = `padding:0.4em 0.8em 0.6em 0.8em;`;
    return (
      `<${tag} class="callout callout-${type}" style="${containerStyle}"${openAttr}>` +
      `<${headerTag} class="callout-header" style="${headerStyle}">` +
      `<span class="callout-icon" style="display:inline-flex;align-items:center;color:${styles.accent};">${cfg.iconSvg}</span>` +
      titleHtml +
      `</${headerTag}>` +
      `<div class="callout-body" style="${bodyStyle}">`
    );
  }
  return (
    `<${tag} class="callout callout-${type}"${openAttr}>` +
    `<${headerTag} class="callout-header">` +
    `<span class="callout-icon">${cfg.iconSvg}</span>` +
    titleHtml +
    `</${headerTag}>` +
    `<div class="callout-body">`
  );
}

function calloutBoxCloseHtml(isDetails) {
  return `</div></${isDetails ? 'details' : 'div'}>`;
}

// 4T-0200 (Epic 3E-0017): Custom Containers / Fenced Divs (Pandoc/
// markdown-it-container):
//
//   ::: warning              — bekannter Callout-Typ -> Callout-Optik
//   ::: warning Eigener Titel
//   ::: meine-box            — unbekannter Name -> neutrale Box mit
//                              Klasse custom-container container-<slug>
//
// EINE generische Registrierung mit Wildcard-Validator statt zehn
// Einzel-Registrierungen; der Name ist das erste Wort des Info-Strings
// ([a-z][a-z0-9-]*), der Rest optionaler Override-Titel. Keine Klapp-
// Mechanik (Pandoc kennt sie nicht); Verschachtelung ueber laengere
// Marker (`::::` aussen) gemaess markdown-it-container-Standard.
// Die Callout-/Plain-Zuordnung haengt am Open-Token; fuer das Close-
// Token vergibt ein Core-Ruler die Art per Stack (das Close-Token selbst
// traegt keinen Info-String).
const markdownItContainer = require('markdown-it-container');

const CONTAINER_INFO_RE = /^([a-z][a-z0-9-]*)(?:\s+(.*?))?\s*$/;

// 4T-0382 (Epic 3E-0072): Spaltenzahl aus dem Info-String-Rest eines
// `::: columns <n>`-Containers. Gueltig sind strikt die ganzen Zahlen 2 bis 5
// (PO-Vorgabe); fehlend, nicht-numerisch, 1 oder 6+ liefern null und fallen
// im Renderer auf die neutrale Container-Box zurueck (kein Fehler).
function parseColumnsCount(rest) {
  const m = String(rest == null ? '' : rest)
    .trim()
    .match(/^([0-9]+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 2 && n <= 5 ? n : null;
}

function customContainersPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  mdInstance.use(markdownItContainer, 'dynamic', {
    validate(params) {
      return CONTAINER_INFO_RE.test(params.trim());
    },
    render(tokens, idx, opts, env) {
      const token = tokens[idx];
      if (token.nesting === 1) {
        const meta = token.meta || {};
        if (meta.kind === 'callout') {
          return calloutBoxOpenHtml({
            type: meta.slug,
            overrideTitle: meta.title || '',
            collapsible: false,
            defaultOpen: false,
            isPortable,
            env,
          });
        }
        if (meta.kind === 'columns') {
          // 4T-0382: CSS-Mehrspaltigkeit. Viewer ueber styles.css-Klassen;
          // Portable mit Inline-Styles (kein Stylesheet beim Empfaenger).
          const n = meta.count;
          const colsCls = `md-columns md-columns-${n}`;
          if (isPortable) {
            return `<div class="${colsCls}" style="column-count:${n};column-gap:2.5em;">`;
          }
          return `<div class="${colsCls}">`;
        }
        const cls = `custom-container container-${escapeHtml(meta.slug || '')}`;
        if (isPortable) {
          return `<div class="${cls}" style="border:1px solid #ccc;border-radius:6px;padding:0.4em 0.8em;margin:1em 0;">`;
        }
        return `<div class="${cls}">`;
      }
      const meta = token.meta || {};
      return meta.kind === 'callout' ? calloutBoxCloseHtml(false) : '</div>';
    },
  });

  // Art-Zuordnung fuer Open- UND Close-Tokens (Stack ueber den Token-
  // Strom; Verschachtelung mit laengeren Markern bleibt balanciert).
  mdInstance.core.ruler.after('block', 'container_kinds', (state) => {
    const stack = [];
    for (const tok of state.tokens) {
      if (tok.type === 'container_dynamic_open') {
        const m = (tok.info || '').trim().match(CONTAINER_INFO_RE);
        const slug = m ? m[1] : '';
        const rest = m && m[2] ? m[2].trim() : '';
        let meta;
        if (CALLOUT_TYPES[slug]) {
          meta = { kind: 'callout', slug, title: rest };
        } else if (slug === 'columns') {
          // 4T-0382 (Epic 3E-0072): gueltige Spaltenzahl (2 bis 5) ergibt den
          // Mehrspalten-Block; sonst neutrale Container-Box (Rueckfall).
          const count = parseColumnsCount(rest);
          meta = count ? { kind: 'columns', slug, count } : { kind: 'plain', slug, title: rest };
        } else {
          meta = { kind: 'plain', slug, title: rest };
        }
        tok.meta = meta;
        stack.push(meta.kind);
      } else if (tok.type === 'container_dynamic_close') {
        tok.meta = { kind: stack.pop() || 'plain' };
      }
    }
  });

  // 4T-0382 (Epic 3E-0072): Spalten-Umbruch-Marker `+++` auf eigener Zeile.
  // Innerhalb eines `::: columns`-Blocks erzwingt der emittierte
  // <div class="md-column-break"> per CSS `break-before: column` den
  // Spaltenwechsel; ausserhalb ist er wirkungslos (break-before ohne
  // Multicol-Kontext greift nicht, kein Fehler). Bewusst ein eigenes Block-
  // Token statt eines verschachtelten `:::`-Containers — ein solcher
  // braeuchte laengere Aussen-Marker (`::::`) und zerschnitte den Spalten-
  // Block. Registrierung mit `alt`, damit der Marker eine offene Absatz-
  // Folge unterbricht (Muster der markdown-it-Regeln, die Absaetze beenden).
  mdInstance.block.ruler.before(
    'paragraph',
    'column_break',
    (state, startLine, endLine, silent) => {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (!/^\+{3,}[ \t]*$/.test(state.src.slice(pos, max))) return false;
      if (silent) return true;
      const tok = state.push('column_break', 'div', 0);
      tok.map = [startLine, startLine + 1];
      tok.block = true;
      state.line = startLine + 1;
      return true;
    },
    { alt: ['paragraph', 'blockquote', 'list'] },
  );
  mdInstance.renderer.rules.column_break = () =>
    isPortable
      ? '<div class="md-column-break" style="break-before:column;"></div>\n'
      : '<div class="md-column-break"></div>\n';
}

// 4T-0041 (Epic 3E-0008): Zweite markdown-it-Instanz fuer den HTML-Konverter.
// Unterschied zur Haupt-Instanz md: html=true, damit die vom Konverter
// generierten HTML-Tabellen im Zellinhalt nicht escaped werden, wenn der
// Zellinhalt rekursiv durch mdPortable.render() laeuft. Die perspective-table-Fence
// wird hier NICHT ueberschrieben, weil convertMarkdownPortable perspective-table-
// Bloecke separat behandelt (Top-Level-Regex + parsePerspectiveTableBlock +

// 4T-0199 (Epic 3E-0017): Pandoc Line Blocks — zusammenhaengende Zeilen,
// die mit `| ` (Pipe + Leerzeichen) beginnen. Zeilenumbrueche und
// fuehrende Leerzeichen nach `| ` bleiben erhalten (Adressen, Gedichte):
//
//   | Erste Zeile
//   |   eingerueckt weiter
//
// Eigener Block-Ruler, registriert via block.ruler.before('paragraph'):
// Tabellen- und andere Block-Regeln laufen zuerst — eine Pipe-Tabelle
// (mit Delimiter-Zeile) konsumiert weiterhin die table-Regel; nur was
// dort durchfaellt und dem `| `-Muster folgt, wird Line Block. Eine
// `|`-Zeile OHNE folgendes Leerzeichen ist kein Line Block (Abgrenzung
// zu Tabellen-Fragmenten); strikt gilt das auch fuer Folgezeilen —
// Strophen trennt man ueber eine Leerzeile (zwei Bloecke). Inline-
// Markdown innerhalb der Zeilen bleibt aktiv (eigenes inline-Token pro
// Zeile). Die Einrueckungs-Erhaltung uebernimmt CSS (`white-space:
// pre-wrap` auf .line-block-line; Entscheidung pro Copy-Paste: echte
// Spaces statt &nbsp;-Ersetzung, siehe Task 4T-0199).
function lineBlocksPlugin(mdInstance) {
  function lineBlockRule(state, startLine, endLine, silent) {
    // Ab vier Spaces Einrueckung parst markdown-it einen Code-Block.
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (pos + 1 >= max) return false; // `|` allein oder leere Zeile
    if (state.src.charCodeAt(pos) !== 0x7c /* | */) return false;
    if (state.src.charCodeAt(pos + 1) !== 0x20 /* space */) return false;

    if (silent) return true;

    // Zusammenhaengende `| `-Zeilen einsammeln.
    const lines = [];
    let nextLine = startLine;
    while (nextLine < endLine) {
      if (state.sCount[nextLine] - state.blkIndent >= 4) break;
      const p = state.bMarks[nextLine] + state.tShift[nextLine];
      const m = state.eMarks[nextLine];
      if (p + 1 >= m) break;
      if (state.src.charCodeAt(p) !== 0x7c) break;
      if (state.src.charCodeAt(p + 1) !== 0x20) break;
      lines.push(state.src.slice(p + 2, m));
      nextLine++;
    }

    const openTok = state.push('line_block_open', 'div', 1);
    openTok.attrSet('class', 'line-block');
    openTok.map = [startLine, nextLine];
    openTok.block = true;
    for (let i = 0; i < lines.length; i++) {
      const lineOpen = state.push('line_block_line_open', 'div', 1);
      lineOpen.attrSet('class', 'line-block-line');
      lineOpen.map = [startLine + i, startLine + i + 1];
      lineOpen.block = true;
      const inlineTok = state.push('inline', '', 0);
      inlineTok.content = lines[i];
      inlineTok.map = [startLine + i, startLine + i + 1];
      inlineTok.children = [];
      const lineClose = state.push('line_block_line_close', 'div', -1);
      lineClose.block = true;
    }
    const closeTok = state.push('line_block_close', 'div', -1);
    closeTok.block = true;
    state.line = nextLine;
    return true;
  }
  mdInstance.block.ruler.before('paragraph', 'line_block', lineBlockRule);
}

// 4T-0201 (Epic 3E-0017): Superscript als `^^Text^^` -> <sup>Text</sup>.
// Eigenes Plugin statt markdown-it-sup: das einzelne `^` ist in der App
// doppelt belegt (Footnotes `[^id]`/`^[Inline]`, Block-Anker `^id`) —
// der Doppel-Marker macht die Kollision by design unmoeglich
// (Architekturentscheidung 1 des Epics, Nutzer-Vorgabe aus dem Workshop).
// Implementierung ist die markdown-it-mark-Mechanik (scanDelims +
// Delimiter-Stack + postProcess) mit Marker 0x5E: inneres Inline-Markup,
// Flanking-Regeln und `\^^`-Escapes verhalten sich wie bei `==Text==`.
function superscriptPlugin(mdInstance) {
  function tokenize(state, silent) {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) return false;
    if (marker !== 0x5e /* ^ */) return false;
    const scanned = state.scanDelims(state.pos, true);
    let len = scanned.length;
    const ch = String.fromCharCode(marker);
    if (len < 2) return false;
    if (len % 2) {
      const token = state.push('text', '', 0);
      token.content = ch;
      len--;
    }
    for (let i = 0; i < len; i += 2) {
      const token = state.push('text', '', 0);
      token.content = ch + ch;
      if (!scanned.can_open && !scanned.can_close) continue;
      state.delimiters.push({
        marker,
        length: 0, // "rule of 3"-Laengen-Checks (Emphasis) deaktiviert
        jump: i / 2, // 1 Delimiter = 2 Zeichen
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close,
      });
    }
    state.pos += scanned.length;
    return true;
  }

  function postProcess(state, delimiters) {
    const loneMarkers = [];
    const max = delimiters.length;
    for (let i = 0; i < max; i++) {
      const startDelim = delimiters[i];
      if (startDelim.marker !== 0x5e /* ^ */) continue;
      if (startDelim.end === -1) continue;
      const endDelim = delimiters[startDelim.end];
      const tokenO = state.tokens[startDelim.token];
      tokenO.type = 'sup_open';
      tokenO.tag = 'sup';
      tokenO.nesting = 1;
      tokenO.markup = '^^';
      tokenO.content = '';
      const tokenC = state.tokens[endDelim.token];
      tokenC.type = 'sup_close';
      tokenC.tag = 'sup';
      tokenC.nesting = -1;
      tokenC.markup = '^^';
      tokenC.content = '';
      if (
        state.tokens[endDelim.token - 1].type === 'text' &&
        state.tokens[endDelim.token - 1].content === '^'
      ) {
        loneMarkers.push(endDelim.token - 1);
      }
    }
    // Ungerade Marker-Folgen (`^^^^^`) hinterlassen einen Einzel-Marker
    // am Sequenz-Anfang; hinter die sup_close-Tags verschieben (Mechanik
    // 1:1 aus markdown-it-mark).
    while (loneMarkers.length) {
      const i = loneMarkers.pop();
      let j = i + 1;
      while (j < state.tokens.length && state.tokens[j].type === 'sup_close') j++;
      j--;
      if (i !== j) {
        const token = state.tokens[j];
        state.tokens[j] = state.tokens[i];
        state.tokens[i] = token;
      }
    }
  }
  mdInstance.inline.ruler.before('emphasis', 'superscript', tokenize);
  mdInstance.inline.ruler2.before('emphasis', 'superscript', (state) => {
    const tokensMeta = state.tokens_meta;
    const max = (state.tokens_meta || []).length;
    postProcess(state, state.delimiters);
    for (let curr = 0; curr < max; curr++) {
      if (tokensMeta[curr] && tokensMeta[curr].delimiters) {
        postProcess(state, tokensMeta[curr].delimiters);
      }
    }
  });
}

// 4T-0203 (Epic 3E-0017): Spoiler `||Text||` -> <span class="spoiler">.
// Gleiche Delimiter-Mechanik wie superscriptPlugin (markdown-it-mark-
// Vorlage) mit Marker 0x7C. In Pipe-Tabellen-Zellen zerschneidet der
// Block-Tabellen-Parser die Zeile an `|`, bevor Inline-Rules laufen —
// Spoiler funktioniert dort nicht und bleibt zellgeteilter Text
// (dokumentierte Einschraenkung, Ausweg `\\|`-Escapes). Aufdecken ist
// CSS-only Hover/Focus (kein JS), Portable verdeckt mit Selektions-
// Aufdecken.
//
// `|` ist KEIN Terminator-Zeichen der markdown-it-text-Rule — der
// Tokenizer liefe an `||`-Positionen nie an (text konsumiert darueber
// hinweg). Die text-Rule wird deshalb durch eine identische Kopie mit
// 0x7C als zusaetzlichem Terminator ersetzt; der markdown-it-Quelltext
// sieht diesen Erweiterungspfad ausdruecklich vor, und text_join fuegt
// Text-Tokens im Core wieder zusammen — der Output bleibt fuer Nicht-
// Spoiler-Faelle identisch.
function spoilerTerminatorChar(ch) {
  switch (ch) {
    case 0x0a /* \n */:
    case 0x21 /* ! */:
    case 0x23 /* # */:
    case 0x24 /* $ */:
    case 0x25 /* % */:
    case 0x26 /* & */:
    case 0x2a /* * */:
    case 0x2b /* + */:
    case 0x2d /* - */:
    case 0x3a /* : */:
    case 0x3c /* < */:
    case 0x3d /* = */:
    case 0x3e /* > */:
    case 0x40 /* @ */:
    case 0x5b /* [ */:
    case 0x5c /* \ */:
    case 0x5d /* ] */:
    case 0x5e /* ^ */:
    case 0x5f /* _ */:
    case 0x60 /* ` */:
    case 0x7b /* { */:
    case 0x7c /* | */: // 4T-0203: Spoiler-Marker
    case 0x7d /* } */:
    case 0x7e /* ~ */:
      return true;
    default:
      return false;
  }
}

function spoilerAwareTextRule(state, silent) {
  let pos = state.pos;
  while (pos < state.posMax && !spoilerTerminatorChar(state.src.charCodeAt(pos))) {
    pos++;
  }
  if (pos === state.pos) return false;
  if (!silent) state.pending += state.src.slice(state.pos, pos);
  state.pos = pos;
  return true;
}

function spoilerPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  mdInstance.inline.ruler.at('text', spoilerAwareTextRule);

  function tokenize(state, silent) {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) return false;
    if (marker !== 0x7c /* | */) return false;
    const scanned = state.scanDelims(state.pos, true);
    let len = scanned.length;
    const ch = String.fromCharCode(marker);
    if (len < 2) return false;
    if (len % 2) {
      const token = state.push('text', '', 0);
      token.content = ch;
      len--;
    }
    for (let i = 0; i < len; i += 2) {
      const token = state.push('text', '', 0);
      token.content = ch + ch;
      if (!scanned.can_open && !scanned.can_close) continue;
      state.delimiters.push({
        marker,
        length: 0,
        jump: i / 2,
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close,
      });
    }
    state.pos += scanned.length;
    return true;
  }

  function postProcess(state, delimiters) {
    const loneMarkers = [];
    const max = delimiters.length;
    for (let i = 0; i < max; i++) {
      const startDelim = delimiters[i];
      if (startDelim.marker !== 0x7c /* | */) continue;
      if (startDelim.end === -1) continue;
      const endDelim = delimiters[startDelim.end];
      const tokenO = state.tokens[startDelim.token];
      tokenO.type = 'spoiler_open';
      tokenO.tag = 'span';
      tokenO.nesting = 1;
      tokenO.markup = '||';
      tokenO.content = '';
      const tokenC = state.tokens[endDelim.token];
      tokenC.type = 'spoiler_close';
      tokenC.tag = 'span';
      tokenC.nesting = -1;
      tokenC.markup = '||';
      tokenC.content = '';
      if (
        state.tokens[endDelim.token - 1].type === 'text' &&
        state.tokens[endDelim.token - 1].content === '|'
      ) {
        loneMarkers.push(endDelim.token - 1);
      }
    }
    while (loneMarkers.length) {
      const i = loneMarkers.pop();
      let j = i + 1;
      while (j < state.tokens.length && state.tokens[j].type === 'spoiler_close') j++;
      j--;
      if (i !== j) {
        const token = state.tokens[j];
        state.tokens[j] = state.tokens[i];
        state.tokens[i] = token;
      }
    }
  }

  mdInstance.inline.ruler.before('emphasis', 'spoiler', tokenize);
  mdInstance.inline.ruler2.before('emphasis', 'spoiler', (state) => {
    const tokensMeta = state.tokens_meta;
    const max = (state.tokens_meta || []).length;
    postProcess(state, state.delimiters);
    for (let curr = 0; curr < max; curr++) {
      if (tokensMeta[curr] && tokensMeta[curr].delimiters) {
        postProcess(state, tokensMeta[curr].delimiters);
      }
    }
  });

  if (isPortable) {
    // Verdeckt ohne Stylesheet: Hintergrund- = Schriftfarbe; ohne
    // Hover-CSS bleibt das Aufdecken der Text-Selektion ueberlassen
    // (dokumentierte Einschraenkung, analog Embed-Einschraenkung 4T-0055).
    mdInstance.renderer.rules.spoiler_open = () =>
      '<span class="spoiler" style="background:#444;color:#444;border-radius:3px;padding:0 0.15em;">';
    mdInstance.renderer.rules.spoiler_close = () => '</span>';
  } else {
    mdInstance.renderer.rules.spoiler_open = () => '<span class="spoiler" tabindex="0">';
    mdInstance.renderer.rules.spoiler_close = () => '</span>';
  }
}

// 4T-0203 (Epic 3E-0017): Critic Markup (CriticMarkup-Spezifikation),
// eigenes Plugin statt des verwaisten markdown-it-criticmarkup-Pakets
// (Architekturentscheidung 4 des Epics):
//
//   {++Text++}        Addition     -> <ins class="critic">
//   {--Text--}        Deletion     -> <del class="critic">
//   {~~alt~>neu~~}    Substitution -> <del>alt</del><ins>neu</ins>
//   {==Text==}        Highlight    -> <mark class="critic">
//   {>>Text<<}        Kommentar    -> <span class="critic-comment">
//
// Tokenizer-Anker ist der DOPPEL-MARKER nach `{`: das `{` selbst ist
// kein Terminator-Zeichen der markdown-it-text-Rule und haengt beim
// Rule-Aufruf bereits in state.pending — es wird dort abgeschnitten
// (Muster markdown-it-emoji). Escapes (`\\{`) laufen ueber die escape-
// Rule und erreichen pending nie als `{`. Inhalt bleibt Plaintext
// (kein verschachteltes Inline-Markdown, Stufe 1 — Verhalten wie
// Callout-Override-Titel); mehrzeilige Spannen bleiben Roh-Text.
// Registrierung VOR 'strikethrough': damit greift `{==x==}` vor
// markdown-it-mark und `{~~a~>b~~}` vor GFM-Strikethrough.
const CRITIC_FORMS = {
  '++': { close: '++}', openHtml: '<ins class="critic">', closeHtml: '</ins>' },
  '--': { close: '--}', openHtml: '<del class="critic">', closeHtml: '</del>' },
  '==': { close: '==}', openHtml: '<mark class="critic">', closeHtml: '</mark>' },
  '>>': { close: '<<}', openHtml: '<span class="critic-comment">', closeHtml: '</span>' },
  '~~': { close: '~~}' }, // Substitution, eigener Render-Pfad
};

const CRITIC_PORTABLE_STYLES = {
  ins: 'color:#198754;background:rgba(25,135,84,0.08);text-decoration:underline;',
  del: 'color:#dc3545;background:rgba(220,53,69,0.08);text-decoration:line-through;',
  mark: 'background:#fff3a3;outline:1px dashed #d4a900;padding:0 0.15em;',
  comment:
    'color:#6c757d;background:rgba(108,117,125,0.12);border-radius:3px;padding:0 0.3em;font-style:italic;',
};

function criticMarkupPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  function tokenize(state, silent) {
    const start = state.pos;
    const two = state.src.slice(start, start + 2);
    const def = CRITIC_FORMS[two];
    if (!def) return false;
    if (!state.pending.endsWith('{')) return false;
    const closeIdx = state.src.indexOf(def.close, start + 2);
    if (closeIdx < 0) return false;
    const content = state.src.slice(start + 2, closeIdx);
    if (content.includes('\n')) return false;
    if (two === '~~' && content.indexOf('~>') < 0) return false;
    if (silent) return false;
    // `{` aus dem pending-Text entfernen — es gehoert zum Konstrukt.
    state.pending = state.pending.slice(0, -1);
    const token = state.push('critic', '', 0);
    token.meta = { form: two, content };
    state.pos = closeIdx + 3;
    return true;
  }

  mdInstance.inline.ruler.before('strikethrough', 'critic_markup', tokenize);

  mdInstance.renderer.rules.critic = (tokens, idx) => {
    const { form, content } = tokens[idx].meta;
    const styleFor = (kind) => (isPortable ? ` style="${CRITIC_PORTABLE_STYLES[kind]}"` : '');
    if (form === '~~') {
      const sepIdx = content.indexOf('~>');
      const oldText = content.slice(0, sepIdx);
      const newText = content.slice(sepIdx + 2);
      return (
        `<del class="critic"${styleFor('del')}>${escapeHtml(oldText)}</del>` +
        `<ins class="critic"${styleFor('ins')}>${escapeHtml(newText)}</ins>`
      );
    }
    const def = CRITIC_FORMS[form];
    if (!isPortable) return def.openHtml + escapeHtml(content) + def.closeHtml;
    const kind = form === '++' ? 'ins' : form === '--' ? 'del' : form === '==' ? 'mark' : 'comment';
    const tagName = form === '++' ? 'ins' : form === '--' ? 'del' : form === '==' ? 'mark' : 'span';
    const cls = form === '>>' ? 'critic-comment' : 'critic';
    return `<${tagName} class="${cls}"${styleFor(kind)}>${escapeHtml(content)}</${tagName}>`;
  };
}

// 4T-0204 (Epic 3E-0017): Erweiterte Task-States. Heute kennt die App
// `[ ]`/`[x]` (markdown-it-task-lists); zusaetzliche Status-Marker wie
// `[/]` (in Arbeit) oder `[!]` (wichtig) rendern als farbige Status-Box
// mit dem Marker-Zeichen als Glyph (Obsidian-Minimal-Stil — skaliert
// ohne Icon-Pflege, ein nutzerdefinierter Status braucht nur Zeichen +
// Farbe).
//
// Das aktive Set kommt ueber configureTaskStates(states) von aussen
// (Renderer: electron-store + lokalisierte Labels); das Modul selbst
// bleibt Electron-frei und startet mit dem Default-Set — Unit-/
// Snapshot-Tests laufen deterministisch ohne Store. Die Basis-Zustaende
// ` `/`x`/`X` bleiben fest beim task-lists-Plugin und sind nicht
// konfigurierbar.
// 4T-0497 (Epic 3E-0090): jeder Status traegt zusaetzlich einen Typ
// (Semantik fuer Erledigt-Automatik und Wiederholung) und ein Folge-
// Symbol (Ketten-Toggle beim Checkbox-Klick). Defaults verhaltensneutral
// zum Bestand: alle Folge-Symbole 'x' (Klick schliesst ab, wie bisher
// hart kodiert); Typen '/' IN_PROGRESS und '-' CANCELLED, alle uebrigen
// TODO. Nur der Uebergang AUF einen DONE-Typ gilt als Abschluss
// (Architekturentscheidung 4 des Epics).
const TASK_STATE_DEFAULTS = [
  {
    char: '/',
    name: 'inProgress',
    label: 'In Arbeit',
    color: '#0d6efd',
    enabled: true,
    builtin: true,
    type: 'IN_PROGRESS',
    next: 'x',
  },
  {
    char: '-',
    name: 'cancelled',
    label: 'Abgebrochen',
    color: '#6c757d',
    enabled: true,
    builtin: true,
    type: 'CANCELLED',
    next: 'x',
  },
  {
    char: '>',
    name: 'forwarded',
    label: 'Delegiert',
    color: '#6f42c1',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
  {
    char: '?',
    name: 'question',
    label: 'Frage',
    color: '#fd7e14',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
  {
    char: '!',
    name: 'important',
    label: 'Wichtig',
    color: '#dc3545',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
  {
    char: '*',
    name: 'star',
    label: 'Markiert',
    color: '#d4a900',
    enabled: true,
    builtin: true,
    type: 'TODO',
    next: 'x',
  },
];

// Zeichen, die als Status-Marker ausscheiden: Basis-Zustaende und
// Syntax-brechende Zeichen.
const TASK_STATE_FORBIDDEN_CHARS = new Set([' ', 'x', 'X', '[', ']', '\\']);

// 4T-0497: die sechs Status-Typen der Referenz-Semantik. Die Zuordnung
// ist frei (auch '*' = DONE ist legitim, belegte PO-Nutzung); 'not done'
// im Sinne der Referenz sind TODO, IN_PROGRESS und ON_HOLD.
const TASK_STATE_TYPES = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'CANCELLED', 'NON_TASK'];

// Folge-Symbol darf jedes Einzelzeichen sein, das die Checkbox-Syntax
// nicht bricht — ausdruecklich auch die Basis-Zustaende ' ' und 'x'.
const TASK_STATE_NEXT_FORBIDDEN_CHARS = new Set(['[', ']', '\\']);

function normalizeTaskStateType(type) {
  return TASK_STATE_TYPES.includes(type) ? type : 'TODO';
}

function normalizeTaskStateNext(next) {
  const ch = typeof next === 'string' ? next : '';
  if (ch.length !== 1 || TASK_STATE_NEXT_FORBIDDEN_CHARS.has(ch)) return 'x';
  return ch;
}

let activeTaskStates = new Map(); // char -> { color, label, type, next }

function configureTaskStates(states) {
  const map = new Map();
  for (const s of Array.isArray(states) ? states : []) {
    if (!s || !s.enabled) continue;
    const ch = String(s.char || '');
    if (ch.length !== 1 || TASK_STATE_FORBIDDEN_CHARS.has(ch)) continue;
    map.set(ch, {
      color: String(s.color || '#888888'),
      label: String(s.label || ''),
      type: normalizeTaskStateType(s.type),
      next: normalizeTaskStateNext(s.next),
    });
  }
  activeTaskStates = map;
}
configureTaskStates(TASK_STATE_DEFAULTS);

function getActiveTaskStates() {
  return activeTaskStates;
}

// 4T-0497: Typ eines Status-Zeichens. Basis-Zustaende sind fest
// (' ' TODO, 'x'/'X' DONE, nicht konfigurierbar); unbekannte Zeichen
// liefern null (keine Status-Semantik).
function taskStatusType(ch) {
  if (ch === ' ') return 'TODO';
  if (ch === 'x' || ch === 'X') return 'DONE';
  const def = activeTaskStates.get(ch);
  return def ? def.type : null;
}

// 4T-0497: Folge-Symbol der Toggling-Kette. Basis bleibt fest
// (' ' -> 'x' -> ' '); erweiterte Status folgen ihrem konfigurierten
// Folge-Symbol (Default 'x' = Abschliessen, verhaltensgleich zum
// Bestand). null fuer unbekannte Zeichen.
function taskToggleTarget(ch) {
  if (ch === ' ') return 'x';
  if (ch === 'x' || ch === 'X') return ' ';
  const def = activeTaskStates.get(ch);
  return def ? def.next : null;
}

// 4T-0502 (Epic 3E-0096): Status-Typ-Resolver aus der Persistenz-Form des
// taskStates-Stores (toStoredTaskStates in task-states.js) — fuer den Main-
// Query-Pfad des TASKS-Scopes, der nicht an der konfigurierten Pipeline-
// Instanz (activeTaskStates) haengt. Merge-Regeln wie der Renderer
// (resolveStoredTaskStates, ohne Labels/Farben): builtin ueber `name` gegen
// das Default-Set, Custom-Eintraege validiert, nur aktivierte Eintraege
// zaehlen. Basis-Zeichen sind fest (' ' = TODO, 'x'/'X' = DONE); unbekannte
// oder deaktivierte Zeichen liefern null (keine Status-Semantik).
function createTaskStatusTypeResolver(stored) {
  const map = new Map();
  const storedArr = Array.isArray(stored) ? stored.filter((s) => s && typeof s === 'object') : [];
  const byName = new Map();
  const custom = [];
  for (const s of storedArr) {
    if (s.builtin && typeof s.name === 'string') byName.set(s.name, s);
    else if (!s.builtin) custom.push(s);
  }
  for (const d of TASK_STATE_DEFAULTS) {
    const o = byName.get(d.name);
    if (o ? o.enabled === false : !d.enabled) continue;
    map.set(d.char, o && TASK_STATE_TYPES.includes(o.type) ? o.type : d.type);
  }
  for (const c of custom) {
    const ch = String(c.char || '');
    if (ch.length !== 1 || TASK_STATE_FORBIDDEN_CHARS.has(ch)) continue;
    if (map.has(ch) || c.enabled === false) continue;
    map.set(ch, normalizeTaskStateType(c.type));
  }
  return (ch) => {
    if (ch === ' ') return 'TODO';
    if (ch === 'x' || ch === 'X') return 'DONE';
    return map.get(ch) || null;
  };
}

// K-06 (4T-0307): Task-Status-Farben stammen aus den Nutzer-Settings, nicht
// aus fremdem Markdown, fliessen aber in einen Inline-Style. Defense-in-Depth:
// nur Hex, rgb()/rgba() und benannte Farben zulassen; sonst auf currentColor
// zurueckfallen, damit ein Wert wie 'red;<property>' keine weiteren CSS-
// Deklarationen einschleusen kann.
const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]+)$/;
function sanitizeCssColor(color) {
  const value = String(color == null ? '' : color).trim();
  return CSS_COLOR_RE.test(value) ? value : 'currentColor';
}

// Core-Ruler-Postprocessor nach dem Inline-Parsing: Listen-Items, deren
// Inline-Text mit `[<char>] ` fuer ein aktiviertes Zeichen beginnt (und
// die markdown-it-task-lists mangels ` `/`x` unveraendert liess),
// werden zur Status-Box transformiert. data-source-line bleibt erhalten
// (sourceLineMapper laeuft als gepushter Core-Ruler danach), der
// Toggle-Pfad im Renderer findet die Quell-Zeile darueber. Nicht
// aktivierte Zeichen bleiben sichtbarer Roh-Text (bewusste Abgrenzung).
function extendedTaskStatesPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);

  mdInstance.core.ruler.after('inline', 'extended_task_states', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline') continue;
      if (tokens[i - 1].type !== 'paragraph_open') continue;
      if (tokens[i - 2].type !== 'list_item_open') continue;
      const first = inline.children && inline.children[0];
      if (!first || first.type !== 'text') continue;
      const m = first.content.match(/^\[(.)\][ \t]/);
      if (!m) continue;
      const def = activeTaskStates.get(m[1]);
      if (!def) continue;
      const li = tokens[i - 2];
      li.attrJoin('class', 'task-list-item task-state-item');
      li.attrSet('data-task-state', m[1]);
      first.content = first.content.slice(m[0].length);
      const box = new state.Token('html_inline', '', 0);
      const glyph = escapeHtml(m[1]);
      const title = escapeHtml(def.label);
      const color = escapeHtml(sanitizeCssColor(def.color));
      if (isPortable) {
        // Vollstaendige inline-Styles — beim Empfaenger gibt es kein
        // Stylesheet (Muster der uebrigen Portable-Rules).
        box.content = `<span class="task-state-box" title="${title}" style="display:inline-flex;align-items:center;justify-content:center;width:1.1em;height:1.1em;border:1.5px solid ${color};border-radius:3px;color:${color};font-weight:700;font-size:0.85em;line-height:1;margin-right:0.4em;vertical-align:text-bottom;">${glyph}</span>`;
      } else {
        // Viewer: Farbe als CSS-Custom-Property, Optik kommt aus
        // styles.css (.task-state-box); title liefert das Label-Tooltip.
        box.content = `<span class="task-state-box" data-task-state="${glyph}" title="${title}" style="--task-state-color:${color}">${glyph}</span>`;
      }
      inline.children.unshift(box);
    }
  });
}

// ---------------------------------------------------------------------------
// 4T-0498 (Epic 3E-0090): Task-Marker-Darstellung der Erweiterung
// "Aufgaben". Symbol-Marker am Zeilenende von Task-Zeilen (Termine,
// Prioritaet, Wiederholung, ID/Abhaengigkeiten) rendern als dezente
// Badges statt Roh-Text. Ein Core-Ruler per push — er laeuft nach
// task-lists, extended_task_states und source_line_mapper, findet also
// fertig klassifizierte Task-Items vor.
//
// Erkennungs-Grundlage ist die ROH-Quellzeile (li.map auf state.src),
// nicht der Token-Text: der Global Filter muss auch Filter-Strings
// treffen, die Inline-Regeln bereits umgebaut haben (z.B. #tag ->
// Tag-Link). Die Badge-Ersetzung selbst arbeitet auf dem letzten
// Text-Child des Inline-Tokens — Marker stehen als Klartext am
// Zeilenende und landen dort.
//
// Konfiguration kommt wie bei configureTaskStates von aussen
// (Renderer: Settings + lokalisierte Labels); das Modul startet mit
// deutschen Default-Labels und leerem Filter — Unit-/Snapshot-Tests
// laufen deterministisch ohne Store.

const TASK_MARKER_DEFAULT_LABELS = {
  due: 'Fällig',
  scheduled: 'Geplant',
  start: 'Start',
  created: 'Erstellt',
  done: 'Erledigt',
  cancelled: 'Abgebrochen',
  recurrence: 'Wiederholung',
  id: 'ID',
  dependsOn: 'Abhängig von',
  reminder: 'Erinnerung',
  priority: {
    highest: 'Höchste Priorität',
    high: 'Hohe Priorität',
    medium: 'Mittlere Priorität',
    low: 'Niedrige Priorität',
    lowest: 'Niedrigste Priorität',
  },
};

let taskMarkersConfig = {
  globalFilter: '',
  hideGlobalFilter: false,
  labels: TASK_MARKER_DEFAULT_LABELS,
};

function configureTaskMarkers(cfg) {
  const labels = cfg && typeof cfg.labels === 'object' && cfg.labels ? cfg.labels : null;
  taskMarkersConfig = {
    globalFilter: String((cfg && cfg.globalFilter) || '').trim(),
    hideGlobalFilter: !!(cfg && cfg.hideGlobalFilter),
    labels: labels ? { ...TASK_MARKER_DEFAULT_LABELS, ...labels } : TASK_MARKER_DEFAULT_LABELS,
  };
}

function getTaskMarkersConfig() {
  return taskMarkersConfig;
}

// Ueberfaellig: Faellig-Termin liegt vor dem Zeitpunkt now (Datum-only:
// vor heute; mit Uhrzeit: heute und Uhrzeit vorbei). Ungueltige Werte
// sind nie ueberfaellig.
function isDueOverdue(value, now = new Date()) {
  if (!value || value.invalid) return false;
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (value.date < today) return true;
  if (value.date > today) return false;
  if (!value.time) return false;
  return value.time < `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Badge-Beschreibung eines Marker-Segments: { cls, title, text } —
// gemeinsame Quelle fuer den Render-/Portable-Pfad (taskMarkerBadgeHtml)
// und die Live-Widgets (Paritaets-Garantie). Anzeige in kanonischer Form
// (Symbol plus geparster Wert); der Quelltext behaelt seine
// Roh-Schreibweise (Round-Trip-Garantie des Marker-Kerns).
function taskMarkerBadgeSpec(seg, labels) {
  let cls = 'task-marker';
  let title = '';
  let text;
  if (seg.kind === 'date') {
    const overdue = seg.field === 'due' && isDueOverdue(seg.value);
    cls += ` task-marker-date task-marker-${seg.field}`;
    if (seg.value.invalid) cls += ' task-marker-invalid';
    if (overdue) cls += ' task-marker-overdue';
    title = String(labels[seg.field] || '');
    text = `${taskMarkers.DATE_MARKER_SYMBOLS[seg.field]} ${seg.value.date}${
      seg.value.time ? ` ${seg.value.time}` : ''
    }`;
  } else if (seg.kind === 'priority') {
    cls += ' task-marker-priority';
    title = String((labels.priority && labels.priority[seg.level]) || '');
    text = taskMarkers.PRIORITY_MARKER_SYMBOLS[seg.level];
  } else if (seg.kind === 'recurrence') {
    cls += ' task-marker-recurrence';
    title = String(labels.recurrence || '');
    text = `${taskMarkers.RECURRENCE_SYMBOL} ${seg.text}`;
  } else if (seg.kind === 'id') {
    cls += ' task-marker-other';
    title = String(labels.id || '');
    text = `${taskMarkers.ID_SYMBOL} ${seg.id}`;
  } else if (seg.kind === 'dependsOn') {
    cls += ' task-marker-other';
    title = String(labels.dependsOn || '');
    text = `${taskMarkers.DEPENDS_SYMBOL} ${seg.ids.join(', ')}`;
  } else if (seg.kind === 'reminder') {
    // 4T-0525 (Epic 3E-0095): Erinnerungs-Badge in kanonischer Form
    // (Melde-Zeitpunkt; bewusst ohne Ueberfaellig-Faerbung — Ueberfaellig-
    // Behandlung ist Sache des Erinnerungs-Systems, nicht der Anzeige).
    cls += ' task-marker-reminder';
    if (seg.value.invalid) cls += ' task-marker-invalid';
    title = String(labels.reminder || '');
    text = `${taskMarkers.REMINDER_SYMBOL} ${seg.value.date}${
      seg.value.time ? ` ${seg.value.time}` : ''
    }`;
  } else {
    // Toleranz-Marker (Abschluss-Aktion, nackter Wecker): neutral gedimmt,
    // Roh-Inhalt ohne fuehrenden Weissraum.
    cls += ' task-marker-other';
    text = seg.raw.replace(/^[ \t]+/, '');
  }
  return { cls, title, text };
}

// Badge-HTML eines Marker-Segments. Viewer: Klassen + styles.css;
// Portable: vollstaendige Inline-Styles (Muster Status-Box).
function taskMarkerBadgeHtml(seg, isPortable, labels) {
  const { cls, title, text } = taskMarkerBadgeSpec(seg, labels);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  if (isPortable) {
    const extra = cls.includes('task-marker-overdue')
      ? 'border-color:#dc3545;color:#b02a37;'
      : cls.includes('task-marker-invalid')
        ? 'border-color:#dc3545;color:#b02a37;text-decoration:line-through;'
        : '';
    return (
      `<span class="${cls}"${titleAttr} style="display:inline-block;margin-left:0.45em;` +
      `padding:0 0.35em;border:1px solid #bbb;border-radius:0.7em;font-size:0.82em;` +
      `color:#555;white-space:nowrap;${extra}">${escapeHtml(text)}</span>`
    );
  }
  return `<span class="${cls}"${titleAttr}>${escapeHtml(text)}</span>`;
}

// Core-Ruler: Task-Items finden, Global Filter pruefen, Marker-Segmente
// des letzten Text-Childs durch Badges ersetzen.
function taskMarkersPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);
  mdInstance.core.ruler.push('task_markers', (state) => {
    const cfg = taskMarkersConfig;
    let srcLines = null;
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline' || !inline.children) continue;
      if (tokens[i - 1].type !== 'paragraph_open') continue;
      if (tokens[i - 2].type !== 'list_item_open') continue;
      const li = tokens[i - 2];
      const cls = String(li.attrGet('class') || '');
      if (!cls.includes('task-list-item')) continue;
      // NON_TASK-Status: Zeile gilt nicht als Task (Workshop-Punkt 4).
      const stateChar = li.attrGet('data-task-state');
      if (stateChar && taskStatusType(stateChar) === 'NON_TASK') continue;
      // Global Filter auf der Roh-Quellzeile (li.map ist 0-basiert auf
      // state.src; Inline-Umbauten wie Tag-Links verfaelschen sonst).
      if (cfg.globalFilter !== '') {
        if (srcLines === null) srcLines = state.src.split('\n');
        const rawLine = li.map ? srcLines[li.map[0]] : null;
        if (rawLine == null || !taskMarkers.isTaskLine(rawLine, cfg.globalFilter)) continue;
      }
      // Marker-Segmente aus dem letzten Text-Child.
      const children = inline.children;
      let lastTextIdx = -1;
      for (let c = children.length - 1; c >= 0; c--) {
        if (children[c].type === 'text') {
          lastTextIdx = c;
          break;
        }
      }
      if (lastTextIdx >= 0) {
        const lastText = children[lastTextIdx];
        const parsed = taskMarkers.parseMarkerSegments(lastText.content);
        if (parsed.segments.length > 0) {
          lastText.content = parsed.description;
          const badges = parsed.segments.map((seg) => {
            const tok = new state.Token('html_inline', '', 0);
            tok.content = taskMarkerBadgeHtml(seg, isPortable, cfg.labels);
            return tok;
          });
          children.splice(lastTextIdx + 1, 0, ...badges);
        }
      }
      // Ausblende-Option: erstes Vorkommen des Filter-Strings aus dem
      // Beschreibungs-Text entfernen (nur wenn er als Klartext vorliegt;
      // von Inline-Regeln umgebaute Filter bleiben sichtbar).
      if (cfg.hideGlobalFilter && cfg.globalFilter !== '') {
        for (const child of children) {
          if (child.type !== 'text') continue;
          if (!child.content.includes(cfg.globalFilter)) continue;
          child.content = taskMarkers.stripGlobalFilter(child.content, cfg.globalFilter);
          break;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 4T-0479 (Epic 3E-0089): %%-Kommentare. Text zwischen %%-Markern (inline
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
// Kommentar (wirkt bis Text-Ende; Grundlage des Linter-Hinweises, 4T-0533).
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

// 4T-0470 (Epic 3E-0087): Zeilenende-Marker {-}/{+} code-bewusst aus einem
// Markdown-Text nehmen — fuer den Portable-Export (der Text bleibt Standard-
// Markdown, nur der echte Steuer-Marker verschwindet; escapte Marker und
// Marker in Fenced-Code bleiben Literal). Gleiche Marker-Erkennung wie der
// Kern (nicht escapter {-}/{+} am ATX-Ueberschriften-Zeilenende).
function stripHeadingMarkers(text) {
  const lines = String(text == null ? '' : text).split('\n');
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    if (fenceChar !== null) continue; // innerhalb eines Fenced-Code-Blocks
    if (!/^ {0,3}#{1,6}(?:\s|$)/.test(line)) continue; // nur ATX-Ueberschriften
    const m = line.match(/(\\?)\{([-+])\}[ \t]*$/);
    if (m && m[1] !== '\\') lines[i] = line.slice(0, m.index).replace(/[ \t]+$/, '');
  }
  return lines.join('\n');
}

// 4T-0470 (Epic 3E-0087): Ueberschriften-Nummerierung als Anzeige-Praefix.
// Core-Ruler VOR 'inline': entfernt an jeder Ueberschrift einen echten
// (nicht escapten) Zeilenende-Marker {-}/{+} aus dem Roh-Inline-Content,
// BEVOR der Inline-Parser laeuft — damit weder der Slug (markdown-it-anchor)
// noch die Attribut-Erkennung (markdown-it-attrs, beide laufen nach 'inline')
// den Marker sieht. Ein escapter Marker (\{-}) bleibt unangetastet, damit
// markdown-it den Escape selbst aufloest. Die berechnete Nummer haengt als
// token.meta an heading_open und wird von der heading_open-Render-Rule als
// eigenes <span> vorangestellt (nie Teil des Slugs, per CSS und Kopier-
// Verhalten steuerbar). enabled/startLevel kommen ueber
// state.env.headingNumbering (renderMarkdown loest global -> Dokument auf).
// Der Marker-Strip laeuft immer, wenn das Plugin aktiv ist (Marker sind in
// keiner Ansicht sichtbar, auch bei inaktiver Nummerierung); ist die
// Erweiterung 'heading-numbering' deaktiviert, wird das Plugin gar nicht
// registriert und der Marker bleibt Literal-Text.
function headingNumbersPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);
  mdInstance.core.ruler.before('inline', 'heading_numbers', (state) => {
    const tokens = state.tokens;
    const items = [];
    for (let i = 0; i + 1 < tokens.length; i++) {
      if (tokens[i].type === 'heading_open' && tokens[i + 1].type === 'inline') {
        const level = parseInt(String(tokens[i].tag).slice(1), 10) || 1;
        items.push({ open: tokens[i], inline: tokens[i + 1], level });
      }
    }
    if (items.length === 0) return;
    const cfg = state.env && state.env.headingNumbering;
    const enabled = !!(cfg && cfg.enabled);
    const startLevel = cfg && cfg.startLevel === 2 ? 2 : 1;
    const results = computeHeadingNumbers(
      items.map((it) => ({ level: it.level, rawTitle: it.inline.content })),
      { enabled, startLevel },
    );
    for (let k = 0; k < items.length; k++) {
      const parsed = parseHeadingMarker(items[k].inline.content);
      // Echten Marker aus dem Roh-Content nehmen; der folgende inline-Ruler
      // baut die children frisch aus dem bereinigten content.
      if (parsed.marker !== null) items[k].inline.content = parsed.cleanTitle;
      const number = results[k].number;
      if (number) {
        items[k].open.meta = Object.assign({}, items[k].open.meta, { headingNumber: number });
      }
    }
  });

  const renderHeadingOpen =
    mdInstance.renderer.rules.heading_open ||
    ((tokens, idx, renderOpts, env, self) => self.renderToken(tokens, idx, renderOpts));
  mdInstance.renderer.rules.heading_open = (tokens, idx, renderOpts, env, self) => {
    const rendered = renderHeadingOpen(tokens, idx, renderOpts, env, self);
    const number = tokens[idx].meta && tokens[idx].meta.headingNumber;
    if (!number) return rendered;
    // Portable traegt ein dezentes Inline-Style (kein styles.css beim
    // Empfaenger); der Viewer stylt ueber die Klasse. Trennung zum Titel
    // ueber ein echtes Leerzeichen (kopiert als "1.1 Titel").
    const style = isPortable ? ' style="color:#666;font-variant-numeric:tabular-nums;"' : '';
    return `${rendered}<span class="heading-number"${style}>${escapeHtml(number)}</span> `;
  };
}

// 4T-0660 (Epic 3E-0112): Leerzeile beginnt eine neue nummerierte Liste.
//
// Bewusste Abweichung von der Standard-Interpretation (Festlegung des Product
// Owners vom 2026-07-21): Dort setzt eine Leerzeile eine Liste nur weitläufig
// fort, die Anzeige zählt über sie hinweg durch. Hier soll sie trennen, damit
// Quelltext und Anzeige dieselbe Nummer zeigen — der Editor behandelt die
// Leerzeile beim Verschieben und Nummerieren ebenfalls als Listen-Grenze.
//
// Umgesetzt über das HTML-Attribut `value` am ersten Punkt nach einer
// Leerzeile: Die Liste bleibt ein einziges `ol`, die Zählung beginnt dort
// aber neu und läuft danach normal weiter. Das ist der kleinstmögliche
// Eingriff; ein echtes Auftrennen der Token-Struktur würde Verschachtelung,
// Aufgaben-Listen und die Zeilen-Zuordnung der Vorschau berühren.
function listRestartPlugin(mdInstance) {
  mdInstance.core.ruler.after('block', 'list_restart', (state) => {
    const lines = String(state.src == null ? '' : state.src).split('\n');
    // Ein Eintrag je offener Liste; prevEnd ist die Zeile hinter dem zuletzt
    // gesehenen Punkt derselben Liste (aus dessen map).
    const stack = [];
    for (const token of state.tokens) {
      if (token.type === 'ordered_list_open' || token.type === 'bullet_list_open') {
        stack.push({ ordered: token.type === 'ordered_list_open', prevEnd: null });
        continue;
      }
      if (token.type === 'ordered_list_close' || token.type === 'bullet_list_close') {
        stack.pop();
        continue;
      }
      if (token.type !== 'list_item_open') continue;
      const list = stack[stack.length - 1];
      if (!list) continue;
      if (list.ordered && list.prevEnd !== null) {
        // Die letzte Zeile des Vorgängers ist leer, wenn ihn eine Leerzeile
        // von diesem Punkt trennt.
        const gap = lines[list.prevEnd - 1];
        if (typeof gap === 'string' && gap.trim() === '') {
          const number = parseInt(token.info, 10);
          if (Number.isFinite(number)) token.attrSet('value', String(number));
        }
      }
      list.prevEnd = token.map ? token.map[1] : null;
    }
  });
}

module.exports = {
  sourceLineMapperPlugin,
  headingNumbersPlugin,
  listRestartPlugin,
  wikiLinksPlugin,
  wikiEmbedsPlugin,
  tagsPlugin,
  blockAnchorsPlugin,
  calloutsPlugin,
  lineBlocksPlugin,
  customContainersPlugin,
  parseColumnsCount,
  superscriptPlugin,
  spoilerPlugin,
  criticMarkupPlugin,
  TASK_STATE_DEFAULTS,
  TASK_STATE_FORBIDDEN_CHARS,
  TASK_STATE_TYPES,
  TASK_STATE_NEXT_FORBIDDEN_CHARS,
  configureTaskStates,
  getActiveTaskStates,
  taskStatusType,
  taskToggleTarget,
  createTaskStatusTypeResolver,
  extendedTaskStatesPlugin,
  configureTaskMarkers,
  getTaskMarkersConfig,
  taskMarkersPlugin,
  taskMarkerBadgeSpec,
  isDueOverdue,
  findPercentCommentRanges,
  stripPercentComments,
  stripHeadingMarkers,
  // 4T-0546 (Epic 3E-0097): Kalender-Wert-Badges (Funktions-Deklarationen
  // unten im Datei-Anhang, Hoisting).
  calendarValueBadgeSpec,
  calendarSpanText,
  CALENDAR_SPAN_LABEL_KEYS,
  calendarValuesPlugin,
};

// --- 4T-0546 (Epic 3E-0097): Kalender-Wert-Syntax @{Kalendername: Wert} -------------
// Badge-Spec als gemeinsame Quelle fuer Render-Pane (Rule unten) und
// Live-Widget (live-widgets.js) — Paritaets-Muster taskMarkerBadgeSpec.
// Aufloesung gegen die calendarSystems-Konfiguration des Bereichs
// (env.calendarSystems bzw. Modul-Zustand in markdown.js): unbekannter
// Kalender oder ungueltiger Wert wird sichtbar markiert, der Roh-Text
// bleibt unveraendert erhalten (Workshop-Punkt 6, Teilpunkt 5).
function calendarSpanUnitName(cal, unit, count, L) {
  if (typeof L === 'function' && cal.derived && cal.derived.fromId === STANDARD_CALENDAR_ID) {
    const keys = CALENDAR_SPAN_UNIT_KEYS[unit.id];
    if (keys) {
      const text = L(keys[count === 1 ? 0 : 1]);
      if (typeof text === 'string' && text !== '' && !text.startsWith('events.')) return text;
    }
  }
  return unit.name;
}

// Zeitspanne eines Werts in der konfigurierten Gliederungs-Tiefe; Anteile
// der Laenge null entfallen, die Richtung traegt das Kuerzel der Ableitung.
function calendarSpanText(cal, tuple, L) {
  const result = calendarCore.spanTiers(cal, tuple);
  if (!result || result.tiers.length === 0) return null;
  const wish =
    cal.derived && cal.derived.depth != null ? cal.derived.depth : result.tiers.length - 1;
  const items = result.tiers[Math.min(Math.max(wish, 0), result.tiers.length - 1)];
  const shown = items.filter((u) => u.count > 0);
  const text = (shown.length > 0 ? shown : items.slice(-1))
    .map((u) => `${u.count} ${calendarSpanUnitName(cal, u, u.count, L)}`)
    .join(', ');
  if (result.direction !== 'before') return text;
  const label = cal.epochs[0].abbr || cal.epochs[0].name || '';
  return label === '' ? text : `${text} ${label}`;
}

function calendarValueBadgeSpec(name, value, config, L) {
  const raw = `@{${name}: ${value}}`;
  const found = config ? calendarCore.findCalendarByName(config, name) : null;
  if (!found) {
    return { cls: 'calendar-value calendar-value-unknown', title: name, text: raw, ok: false };
  }
  const parsed = calendarCore.parseCanonical(found.calendar, value);
  if (!parsed.ok) {
    return {
      cls: 'calendar-value calendar-value-invalid',
      title: found.calendar.name,
      text: raw,
      ok: false,
    };
  }
  const canonical = calendarCore.formatTuple(found.calendar, parsed.tuple) || value;
  // Ableitung: der Badge zeigt die Zeitspanne, der Kurzhinweis den
  // kanonischen Wert und den Zeitpunkt der Bezugs-Zeitrechnung.
  if (found.calendar.derived) {
    let title = `${found.calendar.name}: ${canonical}`;
    const base = calendarCore.baseCalendarOf(found.block, found.calendar);
    if (base) {
      const back = calendarCore.convertBetween(found.calendar, parsed.tuple, base);
      if (back.ok) title += `\n${base.name}: ${calendarCore.formatTuple(base, back.tuple) || ''}`;
    }
    return {
      cls: 'calendar-value',
      title,
      text: calendarSpanText(found.calendar, parsed.tuple, L) || canonical,
      ok: true,
    };
  }
  const named = calendarCore.formatTuple(found.calendar, parsed.tuple, { named: true }) || value;
  return {
    cls: 'calendar-value',
    title: `${found.calendar.name}: ${canonical}`,
    text: named,
    ok: true,
  };
}

// Inline-Styles des Portable-Exports (ohne styles.css beim Empfaenger).
const CALENDAR_BADGE_PORTABLE_STYLE =
  'display:inline-block;border:1px solid #c8ccd4;border-radius:4px;' +
  'padding:0 0.35em;background:#f6f8fa;font-size:0.92em;color:#24292f;';
const CALENDAR_BADGE_PORTABLE_STYLE_BAD =
  'display:inline-block;border:1px dashed #c0392b;border-radius:4px;' +
  'padding:0 0.35em;background:#fdf3f2;font-size:0.92em;color:#c0392b;';

// Inline-Rule: `@{` oeffnet, `}` in derselben Zeile schliesst; der erste
// Doppelpunkt trennt Name und Wert (Zerlegung im Kalender-Kern — eine
// Erkennungs-Quelle). Kollisionsfrei gegen die Syntax-Landschaft: Code-
// Spans/-Bloecke laufen vor den Text-Rules, Critic Markup beginnt mit `{`
// ohne `@`, Templates mit `{{`, das attrs-Plugin bindet nur eigene
// Schluessel-Formen und sieht das konsumierte Token nicht mehr.
function calendarValuesPlugin(mdInstance, opts) {
  const isPortable = !!(opts && opts.portable);
  function tokenize(state, silent) {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x40 /* @ */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x7b /* { */) return false;
    const end = state.src.indexOf('}', start + 2);
    if (end < 0) return false;
    const raw = state.src.slice(start, end + 1);
    const parsed = calendarCore.parseCalendarValueRaw(raw);
    if (!parsed) return false;
    if (!silent) {
      const token = state.push('calendar_value', '', 0);
      token.meta = parsed;
      token.markup = raw;
    }
    state.pos = end + 1;
    return true;
  }
  mdInstance.inline.ruler.before('link', 'calendar_value', tokenize);
  mdInstance.renderer.rules.calendar_value = (tokens, idx, _opts, env) => {
    const meta = tokens[idx].meta;
    const labels = (env && env.calendarLabels) || null;
    const L = labels ? (key) => labels[key] : null;
    const spec = calendarValueBadgeSpec(meta.name, meta.value, env && env.calendarSystems, L);
    if (isPortable) {
      const style = spec.ok ? CALENDAR_BADGE_PORTABLE_STYLE : CALENDAR_BADGE_PORTABLE_STYLE_BAD;
      return `<span style="${style}" title="${escapeHtml(spec.title)}">${escapeHtml(spec.text)}</span>`;
    }
    return (
      `<span class="${spec.cls}" title="${escapeHtml(spec.title)}"` +
      ` data-calendar-name="${escapeHtml(meta.name)}" data-calendar-value="${escapeHtml(meta.value)}">` +
      `${escapeHtml(spec.text)}</span>`
    );
  };
}
