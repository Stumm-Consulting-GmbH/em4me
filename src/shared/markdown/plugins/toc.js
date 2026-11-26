// 4T-002558 (Epic 3E-000390): Inhaltsverzeichnis als Block, Zaun `toc`.
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
//
// Ein Modul für alle drei Wege, damit Slug, Duplikat-Zähler und Tiefe nur
// einmal existieren (Entscheidung V5 des Epics):
//   - gerenderte Ansicht: der core-Ruler sammelt die Überschriften-Token des
//     Dokuments und hängt das fertige Verzeichnis an jeden `toc`-Zaun; die
//     Zaun-Kette in markdown.js gibt es aus (Weiche `toc-block`).
//   - Live-Ansicht: Das Widget rendert nur seinen Zaun. Die Überschriften des
//     Dokuments kommen als `env.tocQuelle` mit, ein Text aus den Quellzeilen
//     der Überschriften, den der Renderer aus dem Lezer-Baum ermittelt
//     (src/renderer/modules/editor/ueberschriften.js). Der Ruler zerlegt ihn
//     mit derselben Pipeline und sammelt mit derselben Funktion; Text, Anker,
//     Duplikat-Zähler, explizites `{#id}` und Nummerierung sind damit dieselben
//     wie in der gerenderten Ansicht (Paritäts-Nachweis im Task 4T-002558).
//   - portabler Export: `tocAlsMarkdown` baut die Liste `- [Text](#anker)`.
//
// Der Text eines Eintrags ist der von markdown-it gerenderte und maskierte
// Inline-Inhalt der Überschrift ohne deren Verweise (ein Verweis in einem
// Verweis ist kein gültiges HTML); Roh-HTML aus dem Dokument gelangt nicht
// hinein, weil die Anzeige-Instanz `html: false` fährt.
'use strict';

const { escapeHtml, githubLikeSlug } = require('../slug.js');

const TOC_FENCE = 'toc';
const TOC_EXTENSION_ID = 'toc-block';
const TIEFE_VORGABE = 6;

// Einzige Option im Zaun-Körper: `depth: N` mit N von 1 bis 6. Unbekannte
// Zeilen und Werte außerhalb 1 bis 6 werden ignoriert; steht die Angabe
// mehrfach, gilt die erste gültige (Muster des Diagramm-Zauns).
function tocOptionen(body) {
  for (const zeile of String(body == null ? '' : body).split(/\r?\n/)) {
    const m = /^[ \t]*depth[ \t]*:[ \t]*([1-6])[ \t]*$/.exec(zeile);
    if (m) return { tiefe: Number(m[1]) };
  }
  return { tiefe: TIEFE_VORGABE };
}

// Klartext einer Überschrift wie markdown-it-anchor ihn für den Anker liest
// (Text und Inline-Code).
function klartext(children) {
  return (children || [])
    .filter((c) => c.type === 'text' || c.type === 'code_inline')
    .map((c) => c.content)
    .join('');
}

function inlineHtml(mdInstance, inline, env) {
  try {
    const html = mdInstance.renderer.renderInline(inline.children || [], mdInstance.options, env);
    return html.replace(/<a\b[^>]*>|<\/a>/g, '');
  } catch {
    return escapeHtml(klartext(inline.children));
  }
}

// Einträge `{ ebene, text, html, slug }` aus den Token eines Parse-Laufs. Der
// Anker steht nach markdown-it-anchor (und einem expliziten `{#id}`) schon am
// Token; die Nummer der Überschriften-Nummerierung hängt als meta daran.
function sammleEintraege(tokens, mdInstance, env) {
  const eintraege = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const open = tokens[i];
    const inline = tokens[i + 1];
    if (open.type !== 'heading_open' || inline.type !== 'inline') continue;
    const text = klartext(inline.children);
    const nummer = open.meta && open.meta.headingNumber;
    const praefix = nummer ? `<span class="heading-number">${escapeHtml(nummer)}</span> ` : '';
    eintraege.push({
      ebene: Number(String(open.tag).slice(1)) || 1,
      text: nummer ? `${nummer} ${text}` : text,
      html: praefix + inlineHtml(mdInstance, inline, env),
      slug: open.attrGet('id') || githubLikeSlug(text),
    });
  }
  return eintraege;
}

// Baum nach Ebene: Ein Eintrag hängt unter dem letzten vorangehenden Eintrag
// mit kleinerer Ebene; Sprünge über Ebenen ergeben eine Stufe, nicht mehrere.
function baum(eintraege, tiefe) {
  const wurzel = { kinder: [] };
  const stapel = [];
  eintraege.forEach((e, index) => {
    if (e.ebene > tiefe) return;
    while (stapel.length && stapel[stapel.length - 1].e.ebene >= e.ebene) stapel.pop();
    const knoten = { e, index, kinder: [] };
    (stapel.length ? stapel[stapel.length - 1].kinder : wurzel.kinder).push(knoten);
    stapel.push(knoten);
  });
  return wurzel.kinder;
}

function htmlListe(knoten) {
  const punkte = knoten.map(
    (k) =>
      `<li><a href="#${escapeHtml(k.e.slug)}" data-toc-index="${k.index}">${k.e.html}</a>` +
      (k.kinder.length ? htmlListe(k.kinder) : '') +
      '</li>',
  );
  return `<ul>${punkte.join('')}</ul>`;
}

function markdownText(text) {
  return String(text).replace(/[\\[\]*_`<>&]/g, '\\$&');
}

// Verweis-Ziel im Markdown: Ein eigener Anker (`{#id}`) darf Klammern und
// Rückstriche tragen; sie werden maskiert, Leerraum prozent-kodiert, sonst
// bricht das Ziel aus dem Verweis aus (Zweitblick zu 3E-000390).
function markdownZiel(slug) {
  return String(slug)
    .replace(/[()\\]/g, '\\$&')
    .replace(/\s/g, '%20');
}

function markdownListe(knoten, tiefe = 0) {
  return knoten
    .map(
      (k) =>
        `${'  '.repeat(tiefe)}- [${markdownText(k.e.text)}](#${markdownZiel(k.e.slug)})\n` +
        markdownListe(k.kinder, tiefe + 1),
    )
    .join('');
}

// Die eine Bau-Funktion des Verzeichnisses. `form` ist 'html' (gerendert und
// live) oder 'markdown' (portabler Export). Ohne sichtbare Einträge steht in
// HTML ein Platzhalter, den der Renderer über data-i18n mit dem Hinweis-Text
// füllt (Muster der Frontmatter-Zeile, markdown.js), in Markdown nichts.
function baueVerzeichnis(eintraege, tiefe, form, attribute = '') {
  const knoten = baum(eintraege || [], tiefe || TIEFE_VORGABE);
  if (form === 'markdown') return markdownListe(knoten);
  if (!knoten.length) {
    return (
      `<nav class="toc-block toc-block-leer"${attribute}>` +
      '<p class="toc-block-hinweis" data-i18n="tocBlock.empty"></p></nav>\n'
    );
  }
  return `<nav class="toc-block"${attribute}>${htmlListe(knoten)}</nav>\n`;
}

// Überschriften eines Markdown-Texts, zerlegt mit der Instanz `mdInstance`. Der
// Unter-Lauf bekommt eine eigene Umgebung, damit Zähler des Haupt-Laufs nicht
// mitlaufen; die Nummerierung reist mit.
function eintraegeAusText(mdInstance, text, env) {
  const unterEnv = {
    lang: env && env.lang,
    headingNumbering: env && env.headingNumbering,
  };
  return sammleEintraege(mdInstance.parse(String(text || ''), unterEnv), mdInstance, unterEnv);
}

// core-Ruler: hängt an jeden `toc`-Zaun das fertige Verzeichnis (token.meta).
// Läuft am Ende der core-Kette, also nach markdown-it-anchor und nach
// `heading_numbers`; Zäune erzeugen keine Überschriften-Token, Überschriften in
// Code-Blöcken erscheinen deshalb nicht.
function tocPlugin(mdInstance) {
  mdInstance.core.ruler.push('toc_block', (state) => {
    const zaeune = state.tokens.filter(
      (t) =>
        t.type === 'fence' &&
        String(t.info || '')
          .trim()
          .split(/\s+/)[0] === TOC_FENCE,
    );
    if (!zaeune.length) return;
    const env = state.env || {};
    const eintraege =
      typeof env.tocQuelle === 'string'
        ? eintraegeAusText(state.md, env.tocQuelle, env)
        : sammleEintraege(state.tokens, state.md, env);
    const offset = env.sourceLineOffset || 0;
    for (const zaun of zaeune) {
      const zeile = zaun.map ? ` data-source-line="${zaun.map[0] + 1 + offset}"` : '';
      zaun.meta = Object.assign({}, zaun.meta, {
        tocHtml: baueVerzeichnis(eintraege, tocOptionen(zaun.content).tiefe, 'html', zeile),
      });
    }
  });
}

// Ausgabe der Zaun-Weiche in markdown.js.
function tocZaunHtml(token) {
  return (token.meta && token.meta.tocHtml) || baueVerzeichnis([], TIEFE_VORGABE, 'html');
}

// Konverter des portablen Exports für einen Text: liefert je Zaun-Rumpf die
// Markdown-Liste (ohne Überschriften eine leere Zeile). Die Einträge werden
// einmal je Text erhoben, mit der Anzeige-Instanz, deren Anker der portable
// Zweig ebenso setzt (GitHub-artig).
function tocPortabelKonverter(mdInstance, text) {
  let eintraege = null;
  return (rumpf) => {
    if (!eintraege) eintraege = eintraegeAusText(mdInstance, text, {});
    return baueVerzeichnis(eintraege, tocOptionen(rumpf).tiefe, 'markdown').replace(/\n$/, '');
  };
}

module.exports = {
  TOC_FENCE,
  TOC_EXTENSION_ID,
  TIEFE_VORGABE,
  tocOptionen,
  sammleEintraege,
  eintraegeAusText,
  baueVerzeichnis,
  tocPlugin,
  tocZaunHtml,
  tocPortabelKonverter,
};
