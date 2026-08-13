// 4T-0985 (Epic 3E-0196): aus src/shared/markdown/plugins.js geschnitten.
// Wiki-Gruppe der eigenen markdown-it-Plugins: Wiki-Links, Wiki-Embeds,
// Tags und Block-Anker. Electron-frei; die Instanz-Registrierung
// (md.use/mdPortable.use) macht markdown.js in der Original-Reihenfolge.
'use strict';

const { escapeHtml, githubLikeSlug } = require('../slug.js');

// 4T-0891 (Epic 3E-0168): Anker-Teil eines Wiki-Ziels als href-Fragment.
// Ein '^'-Prefix bezeichnet einen Block-Anker (ID unveraendert uebernommen,
// Slug-Validierung \p{L}\p{N}_-), sonst greift der Heading-Slug. Aus
// wikiLinksPlugin herausgeloest, weil der Portable-Rueckfall der Wiki-Embeds
// dieselbe Ziel-Adresse bilden muss wie ein gewoehnlicher Wiki-Link.
function wikiAnchorPart(anchorRaw) {
  const raw = String(anchorRaw || '');
  if (!raw) return '';
  if (raw.startsWith('^')) {
    const id = raw.slice(1).trim();
    // Bei ungueltiger Block-ID: Anker faellt weg, Link zeigt nur auf Datei.
    return /^[\p{L}\p{N}_-]+$/u.test(id) ? '#' + id : '';
  }
  // P-05 (4T-0183): beide Zweige der frueheren Verzweigung waren
  // identisch — auf eine Zuweisung reduziert.
  const slug = githubLikeSlug(raw);
  return slug ? '#' + slug : '';
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

    // Anker-Slug bauen. Block-Anker hat '^'-Prefix (Helfer oben).
    const anchorPart = wikiAnchorPart(anchorRaw);

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
//
// 4T-0891 (Epic 3E-0168, Befund L-02): options.portable fuellt die
// Platzhalter-Spans der Nicht-Bild-Embeds mit einem sichtbaren Verweis auf
// das Ziel (Details an der Render-Regel unten).
function wikiEmbedsPlugin(mdInstance, options) {
  const isPortable = !!(options && options.portable);
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
  //
  // 4T-0891 (Epic 3E-0168, Befund L-02): Im Portable-Zweig laeuft dieses
  // Postprocessing nicht — die Platzhalter blieben dort leere Spans, ein
  // Nicht-Bild-Embed war im exportierten Dokument also unsichtbar. Der
  // Platzhalter traegt deshalb einen sichtbaren Verweis auf das Ziel, in
  // der Darstellung eines gewoehnlichen Wiki-Links (<a class="wikilink">
  // mit derselben Ziel-Adresse ueber wikiAnchorPart, keine eigene Optik).
  // Der Verweis steht IM Span statt an seiner Stelle: applyWikiEmbedsIfPresent
  // leert den Span vor dem Aufbau des echten Embeds (span.innerHTML = ''),
  // damit bleibt eine exportierte Datei, die wieder in der App geoeffnet
  // wird, voll aufgeloest. Bild-Embeds bleiben unveraendert.
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
    // 4T-0891: sichtbarer Rueckfall nur im Portable-Zweig; der Viewer-Zweig
    // behaelt den leeren Platzhalter, den sein Postprocessing ohnehin fuellt.
    // Der Linktext nennt das Ziel so, wie der Embed es adressiert (Pfad und
    // roher Anker), die href folgt der Wiki-Link-Aufloesung (Anker als Slug
    // bzw. Block-ID).
    let inner = '';
    if (isPortable) {
      const href = escapeHtml(embedPath + wikiAnchorPart(anchor));
      const label = escapeHtml(anchor ? `${embedPath}#${anchor}` : embedPath);
      inner = `<a href="${href}" class="wikilink">${label}</a>`;
    }
    return `<span ${attrStr}>${inner}</span>`;
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

module.exports = {
  wikiLinksPlugin,
  wikiEmbedsPlugin,
  tagsPlugin,
  blockAnchorsPlugin,
};
