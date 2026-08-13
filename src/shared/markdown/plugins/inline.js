// 4T-0985 (Epic 3E-0196): aus src/shared/markdown/plugins.js geschnitten.
// Inline- und Zeilen-Gruppe: Pandoc Line Blocks, Superscript, Spoiler und
// Critic Markup. Electron-frei; die Instanz-Registrierung macht
// markdown.js in der Original-Reihenfolge.
'use strict';

const { escapeHtml } = require('../slug.js');

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

module.exports = {
  lineBlocksPlugin,
  superscriptPlugin,
  spoilerPlugin,
  criticMarkupPlugin,
};
