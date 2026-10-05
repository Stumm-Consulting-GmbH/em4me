// 4T-002048 (Epic 3E-000192): Block-Anker `^name` im Render-Weg, aus
// ./wiki.js hierher geschnitten. Electron-frei; die Instanz-Registrierung
// (md.use/mdPortable.use) macht markdown.js unter der Erweiterung 'wiki-links'.
//
// **Die Erkennung kommt aus ihrer Heimat** src/shared/block-anchors.js
// (`BLOCK_ANCHOR_RE`, `ankerZeileAlleinImZitat`). Die frühere Fassung hier
// verlangte Leerraum vor dem Dach-Zeichen und sah eine Zeile, die allein aus
// dem Anker besteht, deshalb nicht: Sie blieb als eigener Absatz sichtbar,
// während Index und Diagramm-Kern sie als Anker lasen. In einem Absatz zählt
// ein Anker zudem nur, wenn auch seine Quellzeile ihn nach demselben Muster
// trägt; ein maskiertes `\^x` oder `&#94;x` bleibt damit Text wie im Index.
//
// **Wohin die Kennung kommt.** Die erste Kennung eines Blocks wird dessen
// `id`, am nächsten sichtbaren Block davor, wie bisher. Jede weitere bleibt als
// leeres Sprungziel `<span id>` an ihrer Stelle, damit jede Kennung, die der
// Index kennt, auch ein Ziel hat. Besteht ein Absatz nur aus Anker-Zeilen,
// gehört die erste nach der Regel im Kopf von perspective-chart-resolve.js zum
// Code-Block davor, wenn einer davor steht; sonst bleibt an der Stelle der
// Zeilen ein leerer Träger. Eine Regel, welchen Block ein Anker unter einer
// Tabelle oder Liste meint, führt dieses Modul bewusst nicht ein: Sie gehört
// dem Einbettungs-Schnitt, und die Anzeige soll nur nichts Sichtbares
// hinterlassen.
//
// 4T-002072 (Epic 3E-000192): **Der Name einer Datentabelle aus ihrer
// Kopf-Angabe `table: Name`.** Er wird die `id` ihres Zauns, bevor die Anker-
// Zeilen an die Reihe kommen; eine Anker-Zeile `^name` darunter findet den
// Zaun dann schon benannt und bleibt als leerer Träger stehen. Welche Zeile
// ein Name ist und ob er zählt, sagt allein die Heimat (`extractBlockAnchors`):
// Die `id` bekommt nur der Zaun, dessen Kopf-Name dort das erste Vorkommen der
// Kennung ist. Eine zweite Tabelle gleichen Namens, eine Tabelle im Zitat oder
// tiefer eingerückt bleibt damit ohne `id`, wie sie im Index ohne Kennung
// bleibt.
//
// 4T-002072, Nachbesserungen F5 und F7: Nennt die Anker-Zeile darunter
// denselben Namen wie der Kopf, ist sie dieselbe Kennung und verschwindet ohne
// leeren Träger (sonst stünde die `id` zweimal im Dokument). Und die Heimat
// erfährt, dass der Text hier kein Frontmatter trägt.
'use strict';

const {
  BLOCK_ANCHOR_RE,
  ankerZeileAlleinImZitat,
  extractBlockAnchors,
} = require('../../block-anchors.js');
const { escapeHtml } = require('../slug.js');

const ZEILEN_TRENNER = new Set(['softbreak', 'hardbreak']);
const ZIEL = 'block_anker_ziel';
// 4T-002072: Info-Wort des Zauns der Datentabelle.
const DATENTABELLE = 'perspective-datatable';

const istDatentabelle = (token) =>
  !!token && token.type === 'fence' && token.info.trim().split(/\s+/)[0] === DATENTABELLE;

// 4T-002072: Setzt den Kopf-Namen jeder Datentabelle als `id` ihres Zauns,
// sofern er nach der Heimat zählt (sein Träger ist genau dieser Zaun). Die
// Heimat läuft höchstens einmal je Render-Lauf, und nur, wenn der Text eine
// Datentabelle enthalten kann. Zaun-Zeilen der Heimat sind 1-basiert, `map`
// des Tokens 0-basiert, beide im selben Text `state.src`.
function datentabellenNamen(state) {
  if (!state.src.includes(DATENTABELLE)) return;
  let anker = null;
  for (const token of state.tokens) {
    if (!istDatentabelle(token) || !token.map) continue;
    // Nachbesserung F7: `state.src` ist der Körper ohne Frontmatter; eine
    // Linie `---` an seinem Anfang ist eine Linie und kein Vorspann.
    if (!anker) anker = extractBlockAnchors(state.src, { frontmatter: false });
    const zaunVon = token.map[0] + 1;
    const tabelle = anker.datentabellen.find((t) => t.zaunVon === zaunVon);
    const traeger = tabelle && tabelle.name ? anker.traegerById.get(tabelle.name) : null;
    if (traeger && traeger.art === 'datentabelle' && traeger.zaunVon === zaunVon) {
      token.attrSet('id', tabelle.name);
    }
  }
}

// Das schließende `</label>` der Aufgaben-Hülle (markdown-it-task-lists) steht
// hinter dem Text der letzten Zeile; ein Anker davor steht trotzdem am Ende.
function istDurchlaessig(kinder, j) {
  const kind = kinder[j];
  return (
    j === kinder.length - 1 &&
    kind.type === 'html_inline' &&
    kind.content === '</label>' &&
    kinder[0].type === 'html_inline' &&
    kinder[0].content.startsWith('<label')
  );
}

const istLeer = (kind) => kind.type === 'text' && !kind.content;
const istLeerOderZiel = (kind) => istLeer(kind) || kind.type === ZIEL;

function neuesZiel(state, id) {
  const ziel = new state.Token(ZIEL, 'span', 0);
  ziel.meta = { id };
  return ziel;
}

// Zerlegt die Kinder eines inline-Tokens in Zeilen: je Zeile ihr Inhalt und
// der Trenner danach.
function zeilenVon(kinder) {
  const zeilen = [];
  let inhalt = [];
  for (const kind of kinder) {
    if (ZEILEN_TRENNER.has(kind.type)) {
      zeilen.push({ inhalt, trenner: kind });
      inhalt = [];
    } else inhalt.push(kind);
  }
  zeilen.push({ inhalt, trenner: null });
  return zeilen;
}

// Die Quellzeile, die den Anker `id` trägt: die nächste im Bereich des
// Absatzes, gezählt ab der zuletzt gefundenen. Über die Suche statt über den
// Zeilen-Index, weil ein Hinweisblock seine Titel-Zeile aus dem Absatz nimmt.
function quellZeile(quelle, id) {
  for (let k = quelle.naechste; k < quelle.bis; k++) {
    const treffer = quelle.zeilen[k].match(BLOCK_ANCHOR_RE);
    if (treffer && treffer[1] === id) {
      quelle.naechste = k + 1;
      return k;
    }
  }
  return null;
}

// Nimmt die Anker am Ende der Zeilen eines inline-Tokens heraus und setzt an
// ihre Stelle je ein Sprungziel. Ein Treffer ohne Leerraum vor dem
// Dach-Zeichen zählt nur am Anfang einer Zeile eines Absatzes (`[[Ziel]]^x`
// ist kein Anker, eine Tabellen-Zelle bleibt wie bisher). Eine Zeile, die
// danach leer ist, fällt samt Trenner weg; ihre Ziele rücken an die Zeile
// davor. Rückgabe: die Funde in Textreihenfolge.
function nimmZeilenAnker(state, inline, quelle) {
  const kinder = inline.children;
  const schluss =
    kinder.length > 0 && istDurchlaessig(kinder, kinder.length - 1) ? kinder.pop() : null;
  const zeilen = zeilenVon(kinder);
  const funde = [];
  for (const zeile of zeilen) {
    const inhalt = zeile.inhalt;
    let j = inhalt.length - 1;
    while (j >= 0 && istLeer(inhalt[j])) j--;
    if (j < 0 || inhalt[j].type !== 'text') continue;
    const treffer = inhalt[j].content.match(BLOCK_ANCHOR_RE);
    if (!treffer) continue;
    if (!/^\s/.test(treffer[0]) && (!quelle || j > 0)) continue;
    const quellIndex = quelle ? quellZeile(quelle, treffer[1]) : null;
    if (quelle && quellIndex === null) continue;
    inhalt[j].content = inhalt[j].content.slice(0, treffer.index);
    const ziel = neuesZiel(state, treffer[1]);
    inhalt.splice(j + 1, 0, ziel);
    funde.push({ id: treffer[1], ziel, quellIndex });
  }
  if (funde.length === 0) {
    if (schluss) kinder.push(schluss);
    return funde;
  }
  const behalten = [];
  let offen = [];
  for (const zeile of zeilen) {
    if (zeile.inhalt.every(istLeerOderZiel)) {
      const ziele = zeile.inhalt.filter((k) => k.type === ZIEL);
      if (behalten.length > 0) behalten[behalten.length - 1].inhalt.push(...ziele);
      else offen.push(...ziele);
      continue;
    }
    zeile.inhalt.unshift(...offen);
    offen = [];
    behalten.push(zeile);
  }
  const neu = [];
  behalten.forEach((zeile, n) => {
    neu.push(...zeile.inhalt);
    if (n < behalten.length - 1) neu.push(zeile.trenner);
  });
  neu.push(...offen);
  if (schluss) neu.push(schluss);
  inline.children = neu;
  return funde;
}

// Setzt die Kennung eines Fundes als `id` an ein Block-Token und nimmt sein
// Sprungziel aus dem Text.
function alsId(token, fund, inline) {
  token.attrSet('id', fund.id);
  inline.children = inline.children.filter((k) => k !== fund.ziel);
}

// Leerer Träger: die erste Kennung als `id`, jede weitere als Sprungziel darin.
function traeger(state, vorlage, funde, zeile) {
  const auf = new state.Token('paragraph_open', 'p', 1);
  auf.block = true;
  auf.level = vorlage.level;
  if (zeile != null) auf.attrSet('data-source-line', String(zeile));
  auf.attrSet('id', funde[0].id);
  const inline = new state.Token('inline', '', 0);
  inline.level = vorlage.level + 1;
  inline.children = funde.slice(1).map((f) => neuesZiel(state, f.id));
  const zu = new state.Token('paragraph_close', 'p', -1);
  zu.block = true;
  zu.level = vorlage.level;
  return [auf, inline, zu];
}

// Pipe-Tabelle: Eine alleinstehende Anker-Zeile direkt unter der Tabelle nimmt
// markdown-it als letzte Tabellenzeile auf, auch in einem Zitat oder
// Hinweisblock. Solche Zeilen am Ende des Rumpfs entfallen (nur am Ende: der
// Klick-Abgleich des Live-Modus zählt die Zeilen über ihren Index), und die
// Kennungen stehen in einem leeren Träger direkt unter der Tabelle.
function tabellenAnker(state) {
  const tokens = state.tokens;
  const zeilen = state.src.split('\n');
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type !== 'tbody_close') continue;
    const funde = [];
    let erste = null;
    let k = i - 1;
    while (k >= 0 && tokens[k].type === 'tr_close') {
      let auf = k;
      while (tokens[auf].type !== 'tr_open') auf--;
      const id = tokens[auf].map ? ankerZeileAlleinImZitat(zeilen[tokens[auf].map[0]]) : null;
      if (!id) break;
      funde.unshift({ id });
      erste = tokens[auf].attrGet('data-source-line');
      tokens.splice(auf, k - auf + 1);
      k = auf - 1;
    }
    if (funde.length === 0) continue;
    // tokens[k + 1] ist jetzt tbody_close, danach table_close; ein leerer
    // Rumpf fällt ganz weg.
    let tabelleZu = k + 2;
    if (tokens[k].type === 'tbody_open') {
      tokens.splice(k, 2);
      tabelleZu = k;
    }
    tokens.splice(tabelleZu + 1, 0, ...traeger(state, tokens[tabelleZu], funde, erste));
    i = k;
  }
}

// Das nächste vorangehende sichtbare Block-Token (ein versteckter Absatz einer
// engen Liste rendert kein Tag; seine Kennung ginge verloren).
function sichtbarerBlockDavor(tokens, i, maxLevel = Infinity) {
  for (let k = i - 1; k >= 0; k--) {
    const t = tokens[k];
    if (t.nesting === 1 && t.type !== 'inline' && !t.hidden && t.level <= maxLevel) return t;
  }
  return null;
}

// Ein Absatz, der nur aus Anker-Zeilen bestand. Die erste Kennung kommt an den
// Code-Block davor, sonst (versteckt) an den umschließenden Block; der Absatz
// bleibt als leerer Träger stehen, solange eine Kennung übrig ist. Rückgabe:
// um wie viel der Lauf im Aufrufer weiterrückt (-2: das nächste Token steht
// jetzt an der Stelle des entfernten Absatzes).
function ankerAbsatz(tokens, i, funde, quelle) {
  const auf = tokens[i - 1];
  const inline = tokens[i];
  const rest = [...funde];
  const davor = tokens[i - 2];
  if (rest.length === 0) {
    tokens.splice(i - 1, 3);
    return -2;
  }
  if (davor && davor.type === 'fence' && davor.level === auf.level && !davor.attrGet('id')) {
    alsId(davor, rest.shift(), inline);
  } else if (auf.hidden) {
    const huelle = sichtbarerBlockDavor(tokens, i - 1, auf.level - 1);
    if (huelle && !huelle.attrGet('id')) alsId(huelle, rest.shift(), inline);
  }
  if (rest.length === 0) {
    tokens.splice(i - 1, 3);
    return -2;
  }
  // Der Träger trägt die Quellzeile seiner ersten Kennung (aufsteigend, wie es
  // die Zeilen-Zuordnung der geteilten Ansicht verlangt).
  const basis = auf.attrGet('data-source-line');
  if (basis != null && quelle && rest[0].quellIndex != null) {
    auf.attrSet('data-source-line', String(Number(basis) + rest[0].quellIndex - quelle.von));
  }
  auf.hidden = false;
  tokens[i + 1].hidden = false;
  alsId(auf, rest[0], inline);
  return 0;
}

// 4T-002072, Nachbesserung F5: Steht der Absatz direkt unter einer
// Datentabelle, die ihren Kopf-Namen schon als `id` trägt, und ist seine erste
// Quellzeile eine Anker-Zeile desselben Namens, ist das dieselbe Kennung (die
// Heimat zählt sie nicht als Doppel). Die Zeile verschwindet dann ohne zweites
// Element mit derselben `id`.
function gleicheKennungWieTabelle(tokens, i, fund, quelle) {
  const davor = tokens[i - 2];
  return (
    istDatentabelle(davor) &&
    davor.level === tokens[i - 1].level &&
    davor.attrGet('id') === fund.id &&
    !!quelle &&
    fund.quellIndex === quelle.von
  );
}

function blockAnchorsPlugin(mdInstance) {
  mdInstance.core.ruler.push('blockAnchors', (state) => {
    datentabellenNamen(state);
    tabellenAnker(state);
    const tokens = state.tokens;
    const zeilen = state.src.split('\n');
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'inline' || !token.children) continue;
      const imAbsatz = i > 0 && tokens[i - 1].type === 'paragraph_open';
      const quelle =
        imAbsatz && token.map
          ? { zeilen, von: token.map[0], bis: token.map[1], naechste: token.map[0] }
          : null;
      const funde = nimmZeilenAnker(state, token, quelle);
      if (funde.length === 0) continue;
      if (imAbsatz && gleicheKennungWieTabelle(tokens, i, funde[0], quelle)) {
        token.children = token.children.filter((k) => k !== funde[0].ziel);
        funde.shift();
      }
      if (imAbsatz && token.children.every(istLeerOderZiel)) {
        i += ankerAbsatz(tokens, i, funde, quelle);
        continue;
      }
      if (funde.length === 0) continue;
      const ziel = sichtbarerBlockDavor(tokens, i);
      if (ziel && !ziel.attrGet('id')) alsId(ziel, funde[0], token);
    }
  });
  mdInstance.renderer.rules[ZIEL] = (tokens, idx) =>
    `<span id="${escapeHtml(tokens[idx].meta.id)}"></span>`;
}

// Zaun-Ausgabe: Die Hervorhebung und die Container-Zweige der Code-Blöcke
// übergehen die Attribute des Tokens. Die Hülle setzt die Kennung deshalb in
// das erste Tag des Ergebnisses; vorher nimmt sie sie vom Token, sonst stünde
// sie bei ausgeschalteter Hervorhebung zusätzlich am `<code>`.
function blockAnkerAmZaun(regel) {
  return function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const id = token.attrGet('id');
    if (!id) return regel.call(this, tokens, idx, options, env, self);
    const attrs = token.attrs;
    token.attrs = attrs.filter(([name]) => name !== 'id');
    const html = regel.call(this, tokens, idx, options, env, self);
    token.attrs = attrs;
    const mitId = html.replace(/^(\s*<[A-Za-z][\w-]*)/, `$1 id="${escapeHtml(id)}"`);
    return mitId !== html ? mitId : `<p id="${escapeHtml(id)}"></p>\n${html}`;
  };
}

module.exports = {
  blockAnchorsPlugin,
  blockAnkerAmZaun,
};
