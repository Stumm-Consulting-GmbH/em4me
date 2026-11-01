// 4T-001922 (Epic 3E-000371): Attribut-Blöcke `{#id}` und `{.klasse}`
// (markdown-it-attrs, seit 4T-000202) mit einem Text-Schutz für das
// Klammer-Paar am Absatzende.
//
// Die Bibliothek (Version 5.0.0, Muster «end of block») schneidet ein `{…}`
// am Ende eines Absatzes auch dann aus dem Text, wenn darin kein erlaubtes
// Attribut steht: `allowedAttributes` filtert allein, welche Attribute gesetzt
// werden, nicht, ob gekürzt wird, und eine Einstellung gegen die Kürzung kennt
// die Version nicht. `Menge {foo}`, `Menge {x=1}` und `Kaputt @{2026-13-40}`
// erschienen deshalb als «Menge» und «Kaputt @», still und ohne Hinweis.
//
// Der Schutz sind zwei eigene Kern-Regeln unmittelbar um die Regel der
// Bibliothek: Vor ihr wird das schließende Zeichen eines solchen Klammer-
// Paars durch einen Platzhalter ersetzt, sodass keines ihrer Muster es als
// Attribut-Block erkennt; unmittelbar nach ihr wird es zurückgesetzt, der Text
// bleibt also unverändert. Die Bibliothek selbst bleibt unverändert, gültige
// Attribute wirken wie bisher. Ob ein Klammer-Paar ein Attribut-Block ist,
// entscheiden die Hilfsfunktionen der Bibliothek selbst (`utils.js`), damit
// die Grenze nie von der ihren abweicht.
//
// Bewusst nur am Absatz: Überschriften behalten das Verhalten der Bibliothek,
// weil Gliederung (panel-outline.js) und Live-Ansicht (live-scans.js,
// LIVE_HEADING_ATTRS_RE) das Abschneiden am Überschriften-Ende spiegeln und
// Titel und Sprungziel sonst auseinanderliefen.
'use strict';

const markdownItAttrs = require('markdown-it-attrs');
const attrsUtils = require('markdown-it-attrs/utils.js');

// Standardwerte der Bibliothek (index.js), damit die Hilfsfunktionen dieselben
// Begrenzer sehen wie ihre Kern-Regel.
const VORGABEN = {
  leftDelimiter: '{',
  rightDelimiter: '}',
  allowedAttributes: [],
  allowedAttributeValues: [],
};

// Zeichen aus dem privaten Bereich: Es ist kein Begrenzer, also erkennt kein
// Muster der Bibliothek das Klammer-Paar. Zurückgesetzt wird nur an den hier
// gemerkten Stellen, ein gleiches Zeichen im Dokument bleibt unberührt.
const PLATZHALTER = '';

// Das letzte Text-Kind eines Absatzes in der Lesart der Bibliothek (Suche
// «endOfBlockSearch» in patterns.js): Schließ- und Öffnungs-Tags werden
// paarweise übersprungen, ebenso Leerraum-Text und andere Kinder ohne
// Verschachtelung; Inline-Code und Formeln beenden die Suche.
function letztesTextKind(kinder) {
  let tiefe = 0;
  for (let k = kinder.length - 1; k >= 0; k--) {
    const kind = kinder[k];
    if (kind.type === 'code_inline' || kind.type === 'math_inline') return null;
    if (kind.nesting === -1) {
      tiefe++;
      continue;
    }
    if (kind.nesting === 1) {
      tiefe--;
      if (tiefe < 0) return null;
      continue;
    }
    if (tiefe > 0 || kind.type !== 'text' || kind.content.trim() === '') continue;
    return kind;
  }
  return null;
}

// Ersetzt das schließende Zeichen, wenn der Text mit ihm endet; liefert, ob
// ersetzt wurde.
function verbergen(token, options) {
  if (!token.content.endsWith(options.rightDelimiter)) return false;
  token.content = token.content.slice(0, -options.rightDelimiter.length) + PLATZHALTER;
  return true;
}

function attributesPlugin(mdInstance, opts) {
  const options = { ...VORGABEN, ...opts };
  const amEnde = attrsUtils.hasDelimiters('end', options);
  mdInstance.use(markdownItAttrs, opts);

  mdInstance.core.ruler.before('curly_attributes', 'curly_attributes_text_guard', (state) => {
    const verborgen = [];
    const tokens = state.tokens;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;
      const kind = letztesTextKind(tokens[i].children || []);
      if (!kind || !amEnde(kind.content)) continue;
      const start = attrsUtils.findLeftDelimiter(kind.content, options);
      if (attrsUtils.getAttrs(kind.content, start, options).length > 0) continue;
      // Auch der Roh-Inhalt des Absatzes: Das Muster «list double softbreak»
      // liest ihn statt der Kinder und entfernte sonst einen Absatz `{foo}`
      // unmittelbar nach einer Liste.
      if (verbergen(kind, options)) verborgen.push(kind);
      if (verbergen(tokens[i], options)) verborgen.push(tokens[i]);
    }
    state.curlyAttributesTextGuard = verborgen;
  });

  mdInstance.core.ruler.after('curly_attributes', 'curly_attributes_text_restore', (state) => {
    for (const token of state.curlyAttributesTextGuard || []) {
      if (token.content.endsWith(PLATZHALTER)) {
        token.content = token.content.slice(0, -PLATZHALTER.length) + options.rightDelimiter;
      }
    }
    state.curlyAttributesTextGuard = null;
  });
}

module.exports = { attributesPlugin };
