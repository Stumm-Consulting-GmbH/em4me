// 4T-000985 (Epic 3E-000196): aus src/shared/markdown/plugins.js geschnitten.
// Kommentar-Gruppe: der code-bewusste Scanner der %%-Kommentare und das
// zeilentreue Strippen. Electron-frei; aufgerufen wird beides direkt aus
// markdown.js (Quelltext-Vorverarbeitung, keine markdown-it-Regel).
'use strict';

// ---------------------------------------------------------------------------
// 4T-000479 (Epic 3E-000089): %%-Kommentare. Text zwischen %%-Markern (inline
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
// - %% in Fenced-Code-Bloecken (```/~~~) bleibt Literal. Ob eine Stelle in
//   einem solchen Block liegt, entscheidet allein die Anzeige: Jede Zeile mit
//   drei Backticks oder Tilden an beliebiger Stelle ist eine unsichere Stelle
//   (unten), ab der der Scanner fuer jeden Marker die Anzeige fragt. Eine
//   eigene Zaun-Erkennung fuehrt er nicht mehr, weil jede eigene Regel an
//   einem Behaelter, den sie nicht kannte, anders entschied als die Anzeige
//   (Sicherheits-Review zu 3E-000434, Runden 3 bis 5; Weg (a) der Steuerung).
//   Eingerueckte Code-Bloecke (4-Spaces-Form) sind bewusst nicht geschuetzt.
// - %% in einem Code-Stueck im Fliesstext bleibt Literal, und zwar genau dort,
//   wo die Anzeige ein Code-Stueck zeigt (4T-002792, Epic 3E-000434). Der
//   Scanner entscheidet das nicht mehr selbst: Er legt das Absatz-Stueck des
//   Markers (von der vorigen bis zur naechsten Leerzeile) der Code-Frage vor,
//   hinter der der Zerleger der Anzeige steht (baueCodeFrage). Die fruehere
//   eigene Regel — alles zwischen einem Backtick und dem naechsten gleich
//   langen Lauf im ganzen restlichen Dokument gilt als Code, ein Rueckstrich
//   vor dem Backtick zaehlt nicht — liess einen privaten Kommentar stehen,
//   sobald ein einzelner Backtick vor und einer nach ihm stand, auch ueber
//   Absaetze, Listenpunkte und Tabellen-Zellen hinweg.
// - Laesst sich die Code-Frage fuer einen Marker mit Backtick davor und danach
//   nicht stellen (kein Zerleger erreichbar, Aufwands-Grenze, Platzhalter-
//   Zeichen im Dokument), ist ab ihm alles privat bis zum Dokument-Ende. Ist
//   das Aufwands-Budget des Durchlaufs erschoepft, gilt das fuer jeden
//   weiteren Marker, auch ohne Backtick in seiner Naehe.
// - Unsichere Stellen sind eine Zeile mit drei Backticks oder Tilden, im
//   Quelltext oder erst ohne ihre Kommentare, eine Zeile, die erst ohne ihre
//   Kommentare einen Roh-Block beginnt, und ein Kommentar, der ueber ein
//   Zeilenende reicht (er kann eine Zeile verdecken, die einen Block beginnt).
//   Ab der ersten fragt der Scanner fuer den Rest des Dokuments fuer jeden
//   Marker die Anzeige, mit dem Stueck ab dem Anfang des Blocks um diese
//   Stelle; einen Rueckweg in die eigene Gliederung gibt es nicht (Weg (a) der
//   Steuerung nach Runde 5 des Sicherheits-Reviews zu 3E-000434: jeder
//   Rueckweg liess sich an einem Block taeuschen, den die Code-Frage nicht
//   sieht). Einen Marker bloss als Kommentar-Beginn zu nehmen, verschoebe die
//   Paarung der Marker, wenn er in Wahrheit in einem Code-Stueck liegt
//   (Sicherheits-Review zu 3E-000434, Befund 1).
// - Escape \%% ergibt literales %% im Fliesstext (der Scanner ueberspringt
//   \%; die fruehe markdown-it-escape-Rule rendert \% als %). Jeder Marker
//   ist einzeln zu escapen; Escapes gelten auch innerhalb eines Kommentars.
// - Unpaariges oeffnendes %% wirkt bis zum Dokument-Ende (kein
//   Ueber-Rendern privater Inhalte).
// - Innerhalb eines Kommentars hat Markdown keine Bedeutung (auch keine
//   Code-Zaeune); der naechste nicht escapte %%-Marker schliesst.

// Drei Backticks oder Tilden an beliebiger Stelle einer Zeile: Die Zeile kann
// fuer die Anzeige einen Code-Block mit Zaun beginnen, gleich hinter welchem
// Vorspann (Zitat, Listenpunkt, Definitionsliste, eigener Container) und wie
// weit eingerueckt. Die Obermenge ist Absicht: Eine Zeile zu viel kostet nur
// Rueckfragen, eine zu wenig liesse einen Kommentar sichtbar.
const ZAUN_LAUF_RE = /[`~]{3}/;

// Roh-Bloecke der Anzeige (Sicherheits-Review zu 3E-000434, Befund 3): Ein
// Block, dessen Inhalt die Anzeige ohne Markdown-Bedeutung zeigt oder
// ausgibt, und der ueber Leerzeilen reichen kann — Roh-HTML in der portablen
// Fassung (die gewoehnliche zeichnet kein Roh-HTML) und der Formel-Block `$$`.
// Darin ist ein Marker nie Code, auch nicht zwischen zwei Backticks und nicht
// hinter einer Zaun-Zeile. Der Scanner erkennt die Bloecke grosszuegig an der
// Anfangs-Zeile; ein zu frueh angenommener Roh-Block verlaengert nur das Stueck
// der Code-Frage, die Anzeige entscheidet trotzdem. Eine Zaun-Zeile darin
// ueberspringt er nicht als Code-Block, nimmt sie aber auch nicht als sicher
// gewoehnlichen Text: Ab ihr fragt er fuer jeden Marker die Anzeige, denn ob
// sie einen Code-Block beginnt, weiss nur die Anzeige (der Roh-Block kann
// angenommen sein, wo die Anzeige keinen hat, etwa bei ausgeschalteter Formel,
// am Ende eines Zitats oder Listenpunkts oder bei einem Inline-Tag).
// [Anfang, Schluss]; Schluss null: endet an der naechsten Leerzeile.
const ROH_HTML_ARTEN = [
  [/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i],
  [/^<!--/, /-->/],
  [/^<\?/, /\?>/],
  [/^<!\[CDATA\[/, /\]\]>/],
  [/^<![A-Za-z]/, />/],
  [/^<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]|$)/, null],
];
const ROH_FORMEL = [/^\$\$/, /\$\$/];
// Vorspann einer Zeile vor einem Block-Anfang: Einrueckung, Zitat-Zeichen,
// Listen-Marker.
const ROH_VORSPANN_RE = /^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t>]*/;

// Anfang des Blocks, in dem die Zeile ab pos steht: die letzte Zeile ohne
// Einrueckung, vor der eine Leerzeile steht, fruehestens am Text-Anfang. Ab
// dort liest die Anzeige Zitat, Listenpunkt und Container um die Stelle mit.
// Ueber der Laengen-Grenze endet die Suche dort, wo sie steht.
function blockAnfang(src, pos) {
  let z = pos;
  for (;;) {
    const zeilenEnde = src.indexOf('\n', z);
    const ende = zeilenEnde === -1 ? src.length : zeilenEnde;
    const c = src[z];
    if (z === 0) return z;
    if (!istLeerzeile(src, z, ende) && c !== ' ' && c !== '\t') {
      const vorAnfang = z >= 2 ? src.lastIndexOf('\n', z - 2) + 1 : 0;
      if (istLeerzeile(src, vorAnfang, z - 1)) return z;
    }
    if (pos - z > MAX_ABSATZ_LAENGE) return z;
    z = z >= 2 ? src.lastIndexOf('\n', z - 2) + 1 : 0;
  }
}

// Erkennt den Anfang eines Roh-Blocks in einer Zeile ab zeilenAnfang. Liefert
// { anfang, schluss, suchAb } oder null; suchAb ist die Stelle, ab der in der
// Anfangs-Zeile nach dem Schluss gesucht wird.
function rohBlockAnfang(zeile, zeilenAnfang, portabel) {
  const vorspann = zeile.match(ROH_VORSPANN_RE)[0].length;
  const rest = zeile.slice(vorspann);
  const arten = portabel ? [ROH_FORMEL, ...ROH_HTML_ARTEN] : [ROH_FORMEL];
  for (const [anfangRe, schluss] of arten) {
    const m = rest.match(anfangRe);
    if (m) return { anfang: zeilenAnfang, schluss, suchAb: zeilenAnfang + vorspann + m[0].length };
  }
  return null;
}

// Sichtbarer Text von [von, bis): ohne die schon gefundenen Kommentare.
function sichtbarerText(src, von, bis, ranges) {
  // Nur die letzten Bereiche koennen die Zeile beruehren (aufsteigend sortiert).
  let k = ranges.length;
  while (k > 0 && ranges[k - 1].to > von) k--;
  let out = '';
  let p = von;
  for (let n = k; n < ranges.length; n++) {
    const r = ranges[n];
    if (r.to <= p || r.from >= bis) continue;
    if (r.from > p) out += src.slice(p, r.from);
    p = Math.max(p, r.to);
  }
  if (p < bis) out += src.slice(p, bis);
  return out;
}

// Platzhalter fuer den befragten Marker im Absatz-Stueck: ein Zeichen aus dem
// privaten Unicode-Bereich, das keine Markdown-Regel deutet. Bekannte Grenze:
// Eine Regel, die vor den Code-Stuecken greift und `%` annimmt, das Zeichen
// aber nicht, zerlegt mit ihm anders als mit dem Marker; belegt ist das fuer
// eine E-Mail-Adresse in spitzen Klammern mit Backtick und Marker im lokalen
// Teil (konstruiert, im Bedrohungsmodell gefuehrt).
const CODE_FRAGE_PLATZHALTER = '';

// Aufwands-Grenze (4T-002792): Ein Dokument fremder Herkunft kann sehr viele
// Marker mit Backticks in einem sehr langen Absatz tragen. Ueber der Grenze
// ist ab dem naechsten Marker alles privat (sichere Seite). Eine gemischte
// Tabelle mit je einem Marker in Code und einem Kommentar je Zeile kostet drei
// Rueckfragen je Zeile; die Grenze reicht damit fuer rund 170 solche Zeilen.
const MAX_CODE_FRAGEN_JE_ABSATZ = 512;
// Laenge eines Absatz-Stuecks, das noch vorgelegt wird. Grosszuegig, weil eine
// Tabelle ohne Leerzeile ein einziges Stueck ist: Die Gruppen-Tabellen der
// Funktions-Seite des Handbuchs tragen ueber 20.000 Zeichen und zeigen den
// Marker in Code-Stuecken.
const MAX_ABSATZ_LAENGE = 500000;
// Gesamt-Aufwand eines Durchlaufs in Zeichen, gelesene und vorgelegte Stuecke
// zusammen. Schuetzt den Editor vor einem Dokument, das sehr viele Marker in
// sehr langen Stuecken traegt.
const MAX_AUFWAND_JE_DURCHLAUF = 8000000;

// Die Anzeige zeichnet ein Dokument mit dieser Kennzeichnung am Anfang des
// Rumpfs mit ihrer portablen Fassung (dieselbe Erkennung wie in
// renderMarkdown); der Scanner fragt dann deren Zerleger.
const PORTABEL_KENNZEICHNUNG_RE = /^\s*<!--\s*perspective-portable\s*-->/;

// Die Code-Fragen dieser Laufzeit-Welt: markdown.js meldet sie nach jedem
// Aufbau seiner Instanzen an (Preload und Pruefungen), der Fenster-Teil meldet
// die Bruecke an. Fehlt die Frage der portablen Fassung, gilt die gewoehnliche.
let angemeldeteCodeFrage = null;
let angemeldeteCodeFragePortabel = null;

function setzeCodeFrage(frage, fragePortabel) {
  angemeldeteCodeFrage = typeof frage === 'function' ? frage : null;
  angemeldeteCodeFragePortabel = typeof fragePortabel === 'function' ? fragePortabel : null;
}

function codeFrageFuer(portabel) {
  return (portabel && angemeldeteCodeFragePortabel) || angemeldeteCodeFrage;
}

// Gemeinsame Einrueckung abziehen: Ein Fortsetzungs-Absatz in einer Liste soll
// als Absatz gelesen werden, nicht als eingerueckter Code-Block.
function ohneGemeinsameEinrueckung(stueck) {
  const zeilen = stueck.split('\n');
  let min = Infinity;
  for (const z of zeilen) {
    if (z.trim() === '') continue;
    const e = z.length - z.replace(/^ +/, '').length;
    if (e < min) min = e;
  }
  if (min === 0 || min === Infinity) return stueck;
  return zeilen.map((z) => z.slice(Math.min(min, z.length))).join('\n');
}

function zaehlePlatzhalter(text) {
  return text.split(CODE_FRAGE_PLATZHALTER).length - 1;
}

// Baut die Code-Frage aus einer markdown-it-Instanz: Liegen alle Platzhalter
// des vorgelegten Absatz-Stuecks im Inhalt von Code-Stuecken im Fliesstext
// oder von Code-Bloecken mit Zaun?
// Mit einem Platzhalter ist das die Frage nach diesem einen Marker; mit
// mehreren fragt der Scanner die Marker eines Stuecks gemeinsam (eine grosse
// Tabelle mit vielen Markern in Code-Stuecken braucht so eine Rueckfrage statt
// einer je Marker). Gefragt wird die Block- und Zeilen-Zerlegung der Anzeige;
// Tabellen-Zellen, Ueberschriften, Listen, Formeln und Wiki-Verweise
// entscheidet sie damit selbst, in ihrem aktuellen Schalt-Zustand.
function baueCodeFrage(mdInstanz) {
  return function imCodeStueck(stueck) {
    // Ohne Antwort (null) gilt der Marker beim Aufrufer als unklar.
    const text = String(stueck == null ? '' : stueck);
    if (text.length > MAX_ABSATZ_LAENGE + 16) return null;
    const gesamt = zaehlePlatzhalter(text);
    if (gesamt === 0) return false;
    let tokens;
    try {
      tokens = mdInstanz.parse(ohneGemeinsameEinrueckung(text), {});
    } catch {
      return null;
    }
    let imCode = 0;
    for (const tok of tokens) {
      // Ein Code-Block mit Zaun ist Code, in jeder Rueckfrage. Vorgelegt wird
      // ein Stueck in einem solchen Block nur, wo der Scanner seiner eigenen
      // Zaun-Erkennung nicht sicher ist; dort beginnt es ohne Einrueckung oder
      // mit einem neutralen Absatz davor, sodass das Abziehen der Einrueckung
      // keinen eingerueckten Code-Block zum Code-Block mit Zaun macht. Ein
      // eingerueckter Code-Block (code_block) zaehlt bewusst nicht.
      if (tok.type === 'fence') {
        imCode += zaehlePlatzhalter(tok.content);
        continue;
      }
      const kinder = tok.children;
      if (!kinder) continue;
      for (const k of kinder) {
        if (k.type === 'code_inline') imCode += zaehlePlatzhalter(k.content);
      }
    }
    return imCode === gesamt;
  };
}

// Meldet die Zerleger beider Fassungen der Anzeige als Code-Fragen an.
function meldeZerlegerAn(mdInstanz, mdPortabelInstanz) {
  setzeCodeFrage(baueCodeFrage(mdInstanz), baueCodeFrage(mdPortabelInstanz));
}

// Antwort der angemeldeten Code-Frage fuer Aufrufer ohne eigenen Zerleger
// (Bruecke zum Fenster-Teil). Nimmt allein eine Zeichenkette; alles andere ist
// ohne Antwort (null), und der befragte Marker gilt beim Aufrufer als unklar.
function kommentarImCode(stueck, portabel) {
  const frage = codeFrageFuer(portabel === true);
  if (typeof stueck !== 'string' || !frage) return null;
  const antwort = frage(stueck);
  return antwort === true || antwort === false ? antwort : null;
}

// Der Text des Absatz-Stuecks vor pos, in der Sicht der Anzeige: schon
// gefundene Kommentare sind entfernt (Zeichen weg, Umbrueche bleiben), und
// das Stueck beginnt nach der letzten Leerzeile dieser Sicht, fruehestens bei
// grenze (dem Ende des letzten Code-Blocks mit Zaun). Liegt pos in einem
// Roh-Block, der bei rohAnfang beginnt, endet das Stueck nicht an Leerzeilen
// darin, sondern erst an der letzten Leerzeile vor seiner Anfangs-Zeile: Die
// Anzeige sieht den Block nur mit seinem Anfang. Liefert null, wenn das Stueck
// die Aufwands-Grenze ueberschreitet.
function absatzKopf(src, pos, ranges, grenze, rohAnfang) {
  const leerzeileGilt = rohAnfang == null ? Infinity : rohAnfang;
  const teile = [];
  let laenge = 0;
  let zeilenEnde = pos;
  let r = ranges.length - 1;
  for (;;) {
    const zeilenAnfang = Math.max(src.lastIndexOf('\n', zeilenEnde - 1) + 1, grenze);
    let stueck = '';
    let p = zeilenEnde;
    while (r >= 0 && ranges[r].to > zeilenAnfang) {
      const bis = Math.min(ranges[r].to, p);
      if (bis < p) stueck = src.slice(bis, p) + stueck;
      p = Math.min(p, Math.max(ranges[r].from, zeilenAnfang));
      if (ranges[r].from >= zeilenAnfang) r--;
      else break;
    }
    if (p > zeilenAnfang) stueck = src.slice(zeilenAnfang, p) + stueck;
    if (zeilenEnde !== pos && stueck.trim() === '' && zeilenAnfang < leerzeileGilt) break;
    teile.push(stueck);
    laenge += stueck.length + 1;
    if (laenge > MAX_ABSATZ_LAENGE) return null;
    if (zeilenAnfang <= grenze) break;
    zeilenEnde = zeilenAnfang - 1;
  }
  return teile.reverse().join('\n');
}

function istLeerzeile(src, von, bis) {
  for (let i = von; i < bis; i++) {
    const c = src[i];
    if (c !== ' ' && c !== '\t' && c !== '\r') return false;
  }
  return true;
}

// Ende des Absatz-Stuecks ab pos: der Zeilenumbruch vor der naechsten
// Leerzeile, sonst das Text-Ende.
function absatzEnde(src, pos) {
  const len = src.length;
  let zeilenEnde = src.indexOf('\n', pos);
  while (zeilenEnde !== -1) {
    const naechste = zeilenEnde + 1;
    let ende = src.indexOf('\n', naechste);
    if (ende === -1) ende = len;
    if (istLeerzeile(src, naechste, ende)) return zeilenEnde;
    if (ende === len) return len;
    zeilenEnde = ende;
  }
  return len;
}

// Liefert die Kommentar-Bereiche als [{ from, to, closed }] in Quelltext-
// Offsets, inklusive der %%-Marker. closed=false markiert einen unpaarigen
// Kommentar (wirkt bis Text-Ende; Grundlage des Linter-Hinweises, 4T-000533).
// Einziger Scanner — Render-Strip und Editor-Dekoration arbeiten auf
// identischen Bereichen.
//
// optionen.imCode: Code-Frage fuer diesen Aufruf; ohne Angabe gilt die
// angemeldete Code-Frage, bei einem Text mit Portable-Kennzeichnung am Anfang
// die der portablen Fassung.
function findPercentCommentRanges(text, optionen) {
  const src = String(text || '');
  const len = src.length;
  const ranges = [];
  const portabel = PORTABEL_KENNZEICHNUNG_RE.test(src);
  const imCode =
    optionen && typeof optionen.imCode === 'function' ? optionen.imCode : codeFrageFuer(portabel);
  let i = 0;
  let atLineStart = true;
  // Offener Roh-Block ({ anfang, schluss, suchAb }) und Anfang der laufenden
  // Zeile; der Schluss eines Roh-Blocks wird am Zeilen-Ende im sichtbaren
  // Text gesucht, damit ein Schluss-Tag in einem Kommentar nicht zaehlt.
  let roh = null;
  let zeilenStart = 0;
  const rohSchlussPruefen = (bis) => {
    if (!roh || !roh.schluss) return;
    const von = Math.max(zeilenStart, roh.suchAb);
    if (von < bis && roh.schluss.test(sichtbarerText(src, von, bis, ranges))) roh = null;
  };
  // Seit Weg (a) gliedert der Scanner keine Code-Bloecke mehr selbst; ein
  // Absatz-Stueck beginnt deshalb fruehestens am Text-Anfang.
  const nachZaun = 0;
  // Anfang der Stelle, ab der die eigene Block-Gliederung nicht mehr sicher
  // ist (null: sicher). Ab dort fragt der Scanner fuer jeden Marker bis zum
  // Dokument-Ende die Anzeige, mit dem Stueck ab dieser Stelle, und erkennt
  // Roh-Bloecke nicht mehr selbst. Die Stelle ist der Anfang des Blocks, in
  // dem die unsichere Zeile steht, damit die Anzeige Zitat, Listenpunkt und
  // Container um sie herum mitliest; in einem offenen Roh-Block der Anfang des
  // Roh-Blocks, weil die Anzeige ihn nur mit seinem Anfang sieht. Einen
  // Rueckweg gibt es nicht (Weg (a), Kopf-Kommentar).
  let zweifel = null;
  const setzeZweifel = (pos) => {
    if (zweifel === null) zweifel = blockAnfang(src, roh ? Math.min(pos, roh.anfang) : pos);
  };
  // Ein Stueck ab der Stelle beginnt eingerueckt nur am Text-Anfang, also
  // ausserhalb jedes Zitats und Listenpunkts. Damit die Code-Frage dort keine
  // Einrueckung abzieht (ein eingerueckter Code-Block wuerde sonst zum
  // Code-Block mit Zaun), steht ein neutraler Absatz davor.
  const mitKontext = (kopf) => (zweifel !== null && /^[ \t]/.test(kopf) ? `.\n\n${kopf}` : kopf);
  // Prueft am Ende einer Zeile, die einen Kommentar beruehrt, ob sie erst ohne
  // ihn einen Code-Block oder Roh-Block beginnt (etwa ein Kommentar vor drei
  // Backticks oder vor <pre>): Die Anzeige saehe den Block, der Scanner nicht.
  const zeilenendePruefen = (bis) => {
    if (!ranges.length || zweifel !== null) return;
    const von = src.lastIndexOf('\n', bis - 1) + 1;
    if (ranges[ranges.length - 1].to <= von) return;
    const sichtbar = sichtbarerText(src, von, bis, ranges);
    if (ZAUN_LAUF_RE.test(sichtbar) || rohBlockAnfang(sichtbar, von, portabel) !== null) {
      setzeZweifel(von);
    }
  };
  // Rueckfragen im laufenden Absatz-Stueck, gezaehlt je Stueck-Ende.
  let fragenAbsatzEnde = -1;
  let fragenImAbsatz = 0;
  let aufwand = 0;
  // Marker des laufenden Absatz-Stuecks, die mit einer gemeinsamen Frage
  // schon als Code beantwortet sind. Sie liegen alle vor dem ersten Marker,
  // der kein Code ist; ein Kommentar ab dort aendert ihre Antwort in aller
  // Regel nicht. Bekannte Grenze: Entfernt er Zeichen so, dass die Folgezeile
  // zur Trennzeile einer Tabelle wird, teilt die Anzeige die Zeile davor auch
  // an einem senkrechten Strich in einem Code-Stueck (konstruiert, im
  // Bedrohungsmodell gefuehrt). Dasselbe gilt fuer die einzelne Rueckfrage.
  const literalImAbsatz = new Set();
  // Hat im laufenden Absatz-Stueck die gemeinsame Frage nach allen Markern
  // schon «nein» ergeben, entfaellt sie fuer die weiteren Marker.
  let alleNeinImAbsatz = false;
  const frage = (stueck) => {
    if (fragenImAbsatz >= MAX_CODE_FRAGEN_JE_ABSATZ || aufwand >= MAX_AUFWAND_JE_DURCHLAUF) {
      return null;
    }
    fragenImAbsatz++;
    aufwand += stueck.length;
    const antwort = imCode(stueck);
    return antwort === true || antwort === false ? antwort : null;
  };
  // Antwort fuer den Marker bei pos (true Code, false kein Code, null unklar).
  // Zuerst der Marker allein; ist er Code, fragt der Scanner die weiteren
  // Marker des Stuecks gemeinsam und, wenn nicht alle Code sind, den
  // laengsten Anfang, der es ist: von vorn verdoppelnd, dann halbierend, damit
  // ein kurzer Lauf wenig kostet (4T-002792, Nachbesserung fuer grosse und
  // gemischte Tabellen). Ein Platzhalter statt eines Markers aendert die
  // Zerlegung in aller Regel nicht, weil Code-Stuecke an den Backticks haengen
  // (bekannte Grenze am Platzhalter-Zeichen oben).
  const codeAntwort = (pos, ende, kopf) => {
    const marker = [pos];
    for (let p = pos + 2; p < ende; p++) {
      const c = src[p];
      if (c === '\\' && (src[p + 1] === '%' || src[p + 1] === '\\')) p++;
      else if (c === '%' && src[p + 1] === '%') {
        marker.push(p);
        p++;
      }
    }
    const mit = (k) => {
      let s = kopf + CODE_FRAGE_PLATZHALTER;
      let p = pos + 2;
      for (let n = 1; n < k; n++) {
        s += src.slice(p, marker[n]) + CODE_FRAGE_PLATZHALTER;
        p = marker[n] + 2;
      }
      return s + src.slice(p, ende);
    };
    const erste = frage(mit(1));
    if (erste !== true || marker.length === 1) return erste;
    let bisCode = 1;
    const alle = alleNeinImAbsatz ? false : frage(mit(marker.length));
    if (alle === true) bisCode = marker.length;
    else if (alle === false) {
      alleNeinImAbsatz = true;
      let nein = marker.length;
      // Verdoppeln, bis ein Anfang kein Code mehr ist.
      let k = 2;
      while (k < nein) {
        const a = frage(mit(k));
        if (a === null) {
          nein = bisCode + 1;
          break;
        }
        if (a) {
          bisCode = k;
          k *= 2;
        } else {
          nein = k;
          break;
        }
      }
      while (nein - bisCode > 1) {
        const mitte = (bisCode + nein) >> 1;
        const a = frage(mit(mitte));
        if (a === null) break;
        if (a) bisCode = mitte;
        else nein = mitte;
      }
    }
    for (let n = 1; n < bisCode; n++) literalImAbsatz.add(marker[n]);
    return true;
  };
  const ohneBacktick = !src.includes('`');
  while (i < len) {
    if (atLineStart) {
      const lineEnd = src.indexOf('\n', i);
      const end = lineEnd === -1 ? len : lineEnd;
      const line = src.slice(i, end);
      const leer = line.trim() === '';
      zeilenStart = i;
      if (zweifel !== null) {
        // Die Anzeige entscheidet ab hier allein; keine eigene Gliederung.
        atLineStart = false;
        continue;
      }
      if (roh && !roh.schluss && leer) roh = null;
      // Eine Zeile, die einen Code-Block mit Zaun beginnen kann, gleich wo und
      // in welchem Behaelter, auch in einem angenommenen Roh-Block: Ab ihr
      // fragt der Scanner die Anzeige.
      if (ZAUN_LAUF_RE.test(line)) {
        setzeZweifel(i);
        atLineStart = false;
        continue;
      }
      if (!roh) roh = rohBlockAnfang(line, i, portabel);
      atLineStart = false;
    }
    const ch = src[i];
    if (ch === '\n') {
      zeilenendePruefen(i);
      rohSchlussPruefen(i);
      i++;
      atLineStart = true;
      continue;
    }
    if (ch === '\\' && (src[i + 1] === '%' || src[i + 1] === '\\')) {
      i += 2;
      continue;
    }
    if (ch === '%' && src[i + 1] === '%') {
      // Liegt der Marker in einem Code-Stueck der Anzeige? Drei Ausgaenge:
      // sicher kein Code (kein Backtick davor oder danach im Absatz-Stueck),
      // gefragt (die Anzeige antwortet ja oder nein) oder unklar (die Frage
      // laesst sich nicht stellen oder bleibt ohne Antwort). Unklar heisst: Ab
      // hier ist alles privat bis zum Dokument-Ende. Den Marker bloss als
      // Kommentar-Beginn zu nehmen, waere nicht die sichere Seite: Liegt er in
      // Wahrheit in einem Code-Stueck, verschoebe sich die Paarung, und der
      // Text eines echten Kommentars dahinter bliebe stehen.
      let literal = false;
      let unklar = false;
      if (ohneBacktick && zweifel === null) {
        // Ohne einen einzigen Backtick im Text gibt es kein Code-Stueck.
      } else if (literalImAbsatz.has(i)) {
        // Mit den Markern davor schon als Code beantwortet; ohne neues Lesen.
        literal = true;
      } else if (aufwand >= MAX_AUFWAND_JE_DURCHLAUF) {
        unklar = true;
      } else {
        const ende = absatzEnde(src, i + 2);
        aufwand += ende - i;
        const rest = src.slice(i + 2, ende);
        if (ende !== fragenAbsatzEnde) {
          fragenAbsatzEnde = ende;
          fragenImAbsatz = 0;
          literalImAbsatz.clear();
          alleNeinImAbsatz = false;
        }
        if (zweifel !== null || rest.includes('`')) {
          const anker = zweifel !== null ? zweifel : roh ? roh.anfang : null;
          const gelesen = absatzKopf(src, i, ranges, nachZaun, anker);
          const kopf = gelesen === null ? null : mitKontext(gelesen);
          // Auch ein Stueck ueber der Laengen-Grenze ist bis dorthin gelesen.
          aufwand += kopf === null ? MAX_ABSATZ_LAENGE : kopf.length;
          if (kopf === null) {
            unklar = true;
          } else if (zweifel !== null || kopf.includes('`')) {
            if (
              !imCode ||
              // Traegt das Dokument das Platzhalter-Zeichen selbst, waere die
              // Antwort nicht mehr eindeutig.
              kopf.includes(CODE_FRAGE_PLATZHALTER) ||
              rest.includes(CODE_FRAGE_PLATZHALTER) ||
              kopf.length + rest.length > MAX_ABSATZ_LAENGE ||
              fragenImAbsatz >= MAX_CODE_FRAGEN_JE_ABSATZ
            ) {
              unklar = true;
            } else {
              const antwort = codeAntwort(i, ende, kopf);
              if (antwort === true) literal = true;
              else if (antwort !== false) unklar = true;
            }
          }
        }
      }
      if (literal) {
        i += 2;
        continue;
      }
      if (unklar) {
        ranges.push({ from: i, to: len, closed: false });
        break;
      }
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
      // Ein Kommentar ueber ein Zeilenende verdeckt das Ende einer Zeile und
      // den Anfang der naechsten; was die Anzeige dort ohne ihn als Block
      // sieht, prueft keine Zeilen-Pruefung mehr. Ab hier entscheidet sie
      // (Sicherheits-Review zu 3E-000434, Runde 5, Befund 1).
      if (close !== -1 && src.indexOf('\n', from) !== -1 && src.indexOf('\n', from) < to) {
        setzeZweifel(zeilenStart);
      }
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
function stripPercentComments(text, optionen) {
  const src = String(text || '');
  const ranges = findPercentCommentRanges(src, optionen);
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

module.exports = {
  findPercentCommentRanges,
  stripPercentComments,
  setzeCodeFrage,
  baueCodeFrage,
  meldeZerlegerAn,
  kommentarImCode,
  CODE_FRAGE_PLATZHALTER,
  MAX_CODE_FRAGEN_JE_ABSATZ,
  MAX_ABSATZ_LAENGE,
  MAX_AUFWAND_JE_DURCHLAUF,
};
