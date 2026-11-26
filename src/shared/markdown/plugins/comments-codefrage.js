// Code-Frage der Anzeige für die Erkennung privater Kommentare (comments.js):
// Der Zerleger der Anzeige beantwortet, welche Kennungen eines Textes in Code
// liegen, welche unsicher sind, wo die Zerlegung frisch beginnen kann und
// welche Definitionen der Text trägt. Abgetrennt mit 4T-002837 (Zeilen-Budget);
// die Beschreibung des Verfahrens steht in comments.js.
'use strict';

// Längste Eingabe, die dem Zerleger vorgelegt wird; darüber sichere Seite.
const MAX_LAENGE = 4000000;

// Kennung des Markers n: Leit-Zeichen und zwei Zeichen aus dem privaten Bereich.
function kennung(leit, n) {
  return leit + String.fromCharCode(0xe100 + (n >> 12)) + String.fromCharCode(0xe900 + (n & 4095));
}

function liesKennungen(text, leit, treffer) {
  let p = text.indexOf(leit);
  while (p !== -1) {
    const hoch = text.charCodeAt(p + 1) - 0xe100;
    const tief = text.charCodeAt(p + 2) - 0xe900;
    if (hoch >= 0 && hoch < 2048 && tief >= 0 && tief < 4096) treffer.add((hoch << 12) | tief);
    p = text.indexOf(leit, p + 1);
  }
}

// Der Text mit jeder Kennung wieder als Marker.
function alsMarker(text, leit) {
  let aus = '';
  let pos = 0;
  let p = text.indexOf(leit);
  while (p !== -1) {
    aus += `${text.slice(pos, p)}%%`;
    pos = p + 3;
    p = text.indexOf(leit, pos);
  }
  return aus + text.slice(pos);
}

const IST_CODE = new Set(['fence', 'code_block', 'code_inline']);

// Gleiche Gliederung zweier Token-Folgen: Art, Schachtelung, bei Code der
// Inhalt (mit Kennungen als Marker gelesen) und bei obersten Blöcken und
// Neustart-Stellen darunter (istUnterAnfang) die Anfangs-Zeile.
function gleichGegliedert(a, b, leit) {
  if (a.length !== b.length) return false;
  let eltern = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type || a[i].nesting !== b[i].nesting) return false;
    if (IST_CODE.has(a[i].type) && alsMarker(a[i].content, leit) !== b[i].content) return false;
    if (a[i].level === 0 && a[i].nesting === 1) eltern = a[i].type;
    const anfang = a[i].level === 0 || istUnterAnfang(a[i], eltern);
    if (anfang && (a[i].map ? a[i].map[0] : -1) !== (b[i].map ? b[i].map[0] : -1)) return false;
  }
  return true;
}

// Inhalte der Code-Stücke einer Token-Folge, Kennungen als Marker gelesen.
function codeInhalte(liste, leit) {
  const aus = [];
  for (const tok of liste) if (IST_CODE.has(tok.type)) aus.push(alsMarker(tok.content, leit));
  return aus.join('\u0000');
}

// Neustart-Stellen unterhalb eines obersten Blocks der Art `eltern`. Jede
// beginnt in der Anzeige so frisch wie ein oberster Block:
// - Ein Eintrag einer obersten Liste hängt allein an seinen eigenen Zeilen und
//   seinem Listen-Zeichen, nicht an den Einträgen davor (die Dichte der Liste
//   ändert nur das Zeichnen der Absätze, nie Code).
// - Ein Block in einem obersten Zitat (4T-002837): Das Zitat entscheidet jede
//   Zeile für sich, ob sie dazugehört (`>` oder Fortsetzung nach einer nicht
//   leeren Zeile), und zerlegt seinen Inhalt ohne die `>` wie ein Dokument. Ein
//   Block darin, dessen Zeile für sich gelesen wieder ein Zitat beginnt, liest
//   sich deshalb wie ein neues Zitat ab dieser Zeile. Ausnahme: Die Regel für
//   Tabellen läuft vor der für Zitate; ein Zitat-Absatz `> a | b` mit einer
//   Folgezeile `|---|---|` ohne `>` ist im Dokument ein Absatz im Zitat, ab
//   dieser Zeile gelesen aber eine Tabelle. Die Abweichung liegt im Block vor
//   dem Kommentar, und der Vergleich der Block-Anfänge fängt jede zusätzliche
//   Neustart-Stelle (Zweitblick Runde 1 zu 4T-002837, Befund 4). Eine
//   Folgezeile darf vor `>` beliebig weit eingerückt sein und wäre für sich
//   gelesen ein
//   eingerückter Code-Block (Zweitblick Runde 3 zu 4T-002802, Befund 1); sie
//   zählt deshalb nur mit höchstens drei Leerzeichen und ohne Tabulator.
// - Eine Zeile im Rumpf einer obersten Tabelle (4T-002837): Die Tabelle liest
//   jede Zeile für sich gegen Kopf- und Trennzeile. Der Abschnitt bekommt diese
//   beiden Zeilen vorangestellt (findPercentCommentRanges). Über Zeilen hinweg
//   zählt die Anzeige allein die ergänzten Zellen und beendet die Tabelle an
//   einer Obergrenze; die Zeilen zählen nur, wo diese Grenze nicht erreichbar
//   ist (MAX_ERGAENZTE_ZELLEN).
const LISTE = new Set(['bullet_list_open', 'ordered_list_open']);
function istUnterAnfang(tok, eltern) {
  if (tok.nesting === -1) return false;
  if (tok.level === 1)
    return (tok.type === 'list_item_open' && LISTE.has(eltern)) || eltern === 'blockquote_open';
  return tok.level === 2 && tok.type === 'tr_open' && eltern === 'table_open';
}

// Zeilen, an denen ein Eintrag einer obersten Liste für sich gelesen wieder so
// beginnt: höchstens drei Leerzeichen, kein Tabulator, dann das Listen-Zeichen.
// Der Zerleger erlaubt einem obersten Eintrag ohnehin nicht mehr; die Prüfung
// ist eine zweite Sicherung. Ein Wagenrücklauf vor dem Zeilenende zählt wie
// das Zeilenende, damit ein leerer Eintrag mit Windows-Zeilenende Neustart-Stelle
// bleibt (Zweitblick, gezielte Nachprüfung).
const NEUSTART_LISTE_RE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t\r]|$)/;
// Zeilen, an denen ein Block eines obersten Zitats für sich gelesen wieder ein
// Zitat beginnt: höchstens drei Leerzeichen, kein Tabulator, dann `>`.
const NEUSTART_ZITAT_RE = /^ {0,3}>/;

// Obergrenze der Anzeige für automatisch ergänzte Zellen einer Tabelle
// (markdown-it 14.1.1, lib/rules_block/table.mjs, MAX_AUTOCOMPLETED_CELLS; ein
// Wächter-Test vergleicht die Zahl mit der Quelle). Jede Zeile ergänzt höchstens
// so viele Zellen, wie die Tabelle Spalten hat.
const MAX_ERGAENZTE_ZELLEN = 0x10000;

// Neustart-Stellen einer Zerlegung, aufsteigend: `bloecke` die Anfangs-Zeilen
// der obersten Blöcke und der Neustart-Stellen darunter (istUnterAnfang), dazu
// je Stelle in `koepfe` die Kopfzeile ihrer Tabelle (sonst -1) und in `spalten`
// deren Spaltenzahl (sonst 0). Ein Eintrag oder ein Zitat-Block zählt nur, wenn
// seine Zeile in `text` für sich gelesen wieder so beginnt (NEUSTART_LISTE_RE,
// NEUSTART_ZITAT_RE); eine Tabellen-Zeile nur im Rumpf.
function blockAnfaenge(tokens, text) {
  const bloecke = [];
  const koepfe = [];
  const spalten = [];
  let eltern = null;
  let kopf = -1;
  let zahl = 0;
  let rumpf = false;
  let zeilen = null;
  const zeile = (n) => {
    if (!zeilen) {
      zeilen = [0];
      for (let p = text.indexOf('\n'); p !== -1; p = text.indexOf('\n', p + 1)) zeilen.push(p + 1);
    }
    if (n >= zeilen.length) return '';
    const ende = text.indexOf('\n', zeilen[n]);
    return text.slice(zeilen[n], ende === -1 ? text.length : ende);
  };
  for (const tok of tokens) {
    if (tok.level === 0 && tok.nesting === 1) {
      eltern = tok.type;
      kopf = tok.map ? tok.map[0] : -1;
      zahl = 0;
      rumpf = false;
    }
    if (eltern === 'table_open') {
      if (tok.type === 'th_open') zahl++;
      else if (tok.type === 'tbody_open') rumpf = true;
    }
    if (!tok.map) continue;
    let art = -1;
    if (tok.level !== 0 || tok.nesting === -1) {
      if (!istUnterAnfang(tok, eltern)) continue;
      if (eltern === 'table_open') {
        if (!rumpf || kopf < 0 || zahl < 1) continue;
        art = kopf;
      } else {
        const muster = eltern === 'blockquote_open' ? NEUSTART_ZITAT_RE : NEUSTART_LISTE_RE;
        if (!muster.test(zeile(tok.map[0]))) continue;
      }
    }
    if (bloecke.length === 0 || bloecke[bloecke.length - 1] < tok.map[0]) {
      bloecke.push(tok.map[0]);
      koepfe.push(art);
      spalten.push(art >= 0 ? zahl : 0);
    }
  }
  return { bloecke, koepfe, spalten };
}

// Umgebung des Zerlegers mit den Definitionen des ganzen Dokuments, die ein
// Abschnitt allein nicht kennt: Verweis-Definitionen und Fußnoten. Nur
// Zeichenketten werden übernommen, die Tafeln haben keinen Prototyp.
function umgebungAus(definitionen) {
  const env = {};
  if (!definitionen || typeof definitionen !== 'object') return env;
  const verweise = definitionen.verweise;
  if (verweise && typeof verweise === 'object') {
    env.references = Object.create(null);
    for (const name of Object.keys(verweise)) {
      const v = verweise[name];
      if (typeof name !== 'string' || !v || typeof v.href !== 'string') continue;
      env.references[name] = { href: v.href, title: typeof v.title === 'string' ? v.title : '' };
    }
  }
  if (Array.isArray(definitionen.fussnoten)) {
    const refs = Object.create(null);
    for (const name of definitionen.fussnoten) if (typeof name === 'string') refs[name] = -1;
    env.footnotes = { refs, list: [] };
  }
  return env;
}

// Definitionen einer Zerlegung in der Form, die umgebungAus wieder liest.
function definitionenAus(env) {
  const verweise = {};
  if (env.references) {
    for (const name of Object.keys(env.references)) {
      const v = env.references[name];
      verweise[name] = { href: String(v.href), title: v.title == null ? '' : String(v.title) };
    }
  }
  const fussnoten = env.footnotes && env.footnotes.refs ? Object.keys(env.footnotes.refs) : [];
  return { verweise, fussnoten };
}

// Code-Frage aus einer markdown-it-Instanz der Anzeige.
//
// Mit `optionen` als Objekt (die Erkennung fragt so): Zerlegt den Text mit
// Kennungen und denselben Text mit Markern und vergleicht beide. Weicht die
// Block-Gliederung ab, gibt es keine Antwort. Weicht ein Absatz ab, liegt
// keine seiner Kennungen sicher in Code oder sicher außerhalb: Sie gelten als
// unsicher, es sei denn, in keiner der beiden Fassungen liegt ein Marker darin
// in Code (dann außerhalb, belegt: die E-Mail-Erkennung in spitzen Klammern
// nimmt `%` an, das Zeichen der Kennung nicht). So prüft die Anzeige die Treue
// der Kennung in beiden Richtungen. Die Antwort ist
// `{ code, unsicher, bloecke, koepfe, spalten, definitionen }`: Nummern der
// Kennungen in Code, Nummern der unsicheren, Neustart-Stellen samt Kopfzeile
// und Spaltenzahl ihrer Tabelle (blockAnfaenge) und die Definitionen des
// Textes. `optionen.definitionen` gibt einem Abschnitt die
// Definitionen des ganzen Dokuments mit.
//
// Ohne Objekt (frühere Form, für Prüfungen): Feld der Nummern in Code; mit
// `true` ohne Vergleich, sonst mit Vergleich, unsichere Kennungen außerhalb.
function baueCodeFrage(mdInstanz) {
  return function kennungenImCode(text, leit, optionen) {
    if (typeof text !== 'string' || typeof leit !== 'string' || leit.length !== 1) return null;
    // Eine Kennung ist drei Zeichen lang, ein Marker zwei: Die Vorlage ist
    // höchstens anderthalbmal so lang wie das Dokument.
    if (text.length > MAX_LAENGE * 1.5) return null;
    const gliederung = optionen !== null && typeof optionen === 'object';
    const treu = gliederung || optionen !== true;
    const definitionen = gliederung ? optionen.definitionen : null;
    const env = umgebungAus(definitionen);
    let tokens;
    let woertlich;
    try {
      tokens = mdInstanz.parse(text, env);
      woertlich = treu ? mdInstanz.parse(alsMarker(text, leit), umgebungAus(definitionen)) : null;
    } catch {
      return null;
    }
    if (treu && !gleichGegliedert(tokens, woertlich, leit)) return null;
    const treffer = new Set();
    const besuche = (liste, ziel) => {
      for (const tok of liste) {
        if (IST_CODE.has(tok.type)) liesKennungen(tok.content, leit, ziel);
        if (tok.children) besuche(tok.children, ziel);
      }
    };
    const unsicher = new Set();
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (treu && tok.children) {
        const andere = woertlich[i].children || [];
        if (!gleichGegliedert(tok.children, andere, leit)) {
          const imCode = new Set();
          besuche(tok.children, imCode);
          const ruhig =
            imCode.size === 0 && codeInhalte(tok.children, leit) === codeInhalte(andere, leit);
          if (!ruhig) liesKennungen(tok.content, leit, unsicher);
          continue;
        }
      }
      besuche([tok], treffer);
    }
    for (const n of unsicher) treffer.delete(n);
    if (!gliederung) return Array.from(treffer);
    const { bloecke, koepfe, spalten } = blockAnfaenge(tokens, text);
    return {
      code: Array.from(treffer),
      unsicher: Array.from(unsicher),
      bloecke,
      koepfe,
      spalten,
      definitionen: definitionenAus(env),
    };
  };
}

module.exports = {
  kennung,
  istUnterAnfang,
  blockAnfaenge,
  baueCodeFrage,
  MAX_LAENGE,
  MAX_ERGAENZTE_ZELLEN,
};
