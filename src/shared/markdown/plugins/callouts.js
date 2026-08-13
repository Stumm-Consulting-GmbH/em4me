// 4T-0985 (Epic 3E-0196): aus src/shared/markdown/plugins.js geschnitten.
// Callout-Gruppe: Blockquote-Callouts (`> [!note]`) und Custom Containers
// (`::: warning`, `::: columns`) samt gemeinsamem Box-HTML. Electron-frei;
// die Instanz-Registrierung macht markdown.js in der Original-Reihenfolge.
'use strict';

const { escapeHtml } = require('../slug.js');
// 4T-0087 (Epic 3E-0014): CALLOUT_TYPES und calloutIcon 2026-05-24 nach
// src/shared/callouts.js extrahiert, damit der Renderer-Prozess sie fuer
// den Live-Modus ebenfalls importieren kann. Single Source of Truth.
const { CALLOUT_TYPES } = require('../../callouts');
const markdownItContainer = require('markdown-it-container');

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

module.exports = {
  calloutsPlugin,
  customContainersPlugin,
  parseColumnsCount,
};
