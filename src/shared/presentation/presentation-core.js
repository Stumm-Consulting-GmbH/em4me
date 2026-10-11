// 4T-002159 (Epic 3E-000149): Format-Kern der Praesentation - Erkennung am
// Kopf-Kennzeichen, Zerlegung in Folien, Steuer-Schluessel des Kopfs und
// Sprecher-Notizen je Folie.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM, kein
// Datei-Zugriff; Muster src/shared/kanban/kanban-core.js). Der Kern kennt nur
// Text und liefert ein Modell; er LIEST NUR, denn die Praesentations-Ansicht
// ist eine Darstellung und schreibt nie in das Dokument. Er kennt auch keine
// Sprache: Befunde sind Codes, keine Prosa.
//
// **Erkennung** (Entscheidung 1a, Option (d), des Product Owners vom
// 2026-10-07): Kennzeichen der Anwendung ist `presentation: true` im Kopf;
// `marp: true` wird beim Lesen ebenso erkannt, geschrieben wird es nie. Gezaehlt
// wird nur das echte `true` (JSON-Schema des Kopf-Lesers), kein String "true".
//
// **Trenn-Regel** (Entscheidung 1b, Option (a)): Getrennt wird nur dort, wo
// `---` nach CommonMark eine thematische Linie ist. Die Entscheidung trifft
// nicht dieser Kern, sondern die Markdown-Instanz der Anwendung (markdown-it,
// die Referenz-Umsetzung der Lesart und dieselbe Quelle wie bei Marp): Sie wird
// hereingereicht (Muster `mindmapAusMarkdown(text, md)` in mindmap-core.js),
// und getrennt wird an jedem `hr`-Token der obersten Ebene, dessen Quellzeile
// aus Bindestrichen besteht. Damit trennt `---` auch direkt unter einer
// ATX-Ueberschrift, nach einem Zaun-Ende und nach einem Listenpunkt, nicht aber
// als Setext-Unterstreichung, im Code-Block, eingerueckt im Listenpunkt oder im
// Zitat. `***` und `___` trennen nie (benannte Abweichung von Marp).
// Entscheidung der Sitzung vom 2026-10-09 (4T-002159).
//
// **Was vor dem Zerlegen entfernt wird** (zeilentreu, die Zeilen-Nummern
// bleiben): die `%%`-Spannen bei aktiver Kommentar-Erweiterung, wie in der
// Render-Pipeline, und alle HTML-Kommentare, Notizen wie Steuer-Kommentare.
// Die Lese-Pipeline deutet rohes HTML nicht (`html: false`): Sie laese ein
// `---` in einer Notiz sonst als Linie und einen Kommentar direkt ueber `---`
// als Text, der die Linie zur Setext-Unterstreichung macht; bei Marp ist der
// Kommentar ein eigener Block, und die Linie trennt (Entscheidung der Sitzung
// vom 2026-10-09).
//
// **Ohne Markdown-Instanz** gibt es keinen Parser: Das Dokument ist dann eine
// Folie aus dem ganzen Rumpf, mit dem Befund `keinParser`.
//
// **Grenzfaelle gegen Marp belegt** am Quelltext von Marpit
// (`src/markdown/slide.js` und `src/helpers/split.js`, gelesen am
// 2026-10-09): Marpit teilt die Token-Folge an jeder `hr` der obersten Ebene
// und beginnt mit einer leeren Gruppe. Daraus folgt dort und hier gleich:
// zwei Trenner hintereinander ergeben eine leere Folie, ein Trenner direkt
// nach dem Kopf eine leere erste Folie, ein Trenner am Dokument-Ende eine
// leere letzte Folie, und ein Dokument ohne Trenner genau eine Folie.
//
// **Notizen** (Entscheidung 5a, Option (a)): jede `%%`-Spanne der Folie (nur
// bei aktiver Kommentar-Erweiterung) und jeder HTML-Kommentar, der keine
// Steuer-Anweisung nach Marp-Art ist. Steuer-Anweisung heisst hier, was Marp
// selbst nicht als Notiz zaehlt (Marpit `src/markdown/comment.js` und
// `src/markdown/directives/parse.js`, marp-core `size`/`math`, gelesen am
// 2026-10-09): ein Kommentar, dessen Inhalt als YAML-Abbildung mindestens
// einen bekannten Steuer-Schluessel traegt (lokal auch mit `_` davor), dazu die
// drei bekannten Werkzeug-Kommentare (prettier, markdownlint, remark-lint). Ein
// Kommentar wie `<!-- Hinweis: langsam sprechen -->` ist damit wie bei Marp
// eine Notiz. Steuer-Kommentare werden nicht gedeutet und je Folie als Rohdaten
// mitgefuehrt (`steuerKommentare`).
//
// **Quelltext der Folie** ist ihr Ausschnitt mit `\n` als Zeilenende, aus dem
// alle Kommentare (Notizen wie Steuer-Kommentare) zeilentreu entfernt sind:
// Umbrueche bleiben, damit die Zeilen der Folie zu `vonZeile`/`bisZeile`
// passen. Entfernt werden auch die Steuer-Kommentare, weil die Lese-Pipeline
// rohes HTML nicht deutet (`html: false`) und einen Kommentar sonst als Text
// auf der Folie zeigte; das Dokument selbst bleibt unangetastet.
//
// **Fehler-Semantik** wie im Vorbild: Befunde landen in `befunde`, es wird nie
// geworfen. Ein fehlerhafter Kopf-Wert faellt auf die Vorgabe zurueck.
'use strict';

const yaml = require('js-yaml');
const { extractFrontmatter } = require('../markdown/frontmatter.js');
const { findPercentCommentRanges } = require('../markdown/plugins/comments.js');
// Die Zaun-Regel wohnt in `fence-level.js` (Waechter `zaun-kopien.test.js`).
const { zaunOeffnung, schliesstZaun } = require('../markdown/fence-level.js');
// Inline-Code maskieren, damit ein `<!-- -->` in Backticks kein Kommentar ist.
const { maskInlineCode } = require('../markdown/link-scan.js');

const PRAESENTATION_KOPF_SCHLUESSEL = 'presentation';
const MARP_KOPF_SCHLUESSEL = 'marp';
const STEUER_SCHLUESSEL = ['theme', 'paginate', 'header', 'footer', 'size'];

const GROESSE_VORGABE = '16:9';
const GROESSEN = ['16:9', '4:3'];

// Die Quellzeile einer thematischen Linie aus Bindestrichen: 0 bis 3
// Leerzeichen, mindestens drei `-`, dazwischen und dahinter nur Leerraum. Ob
// die Zeile eine Linie IST, sagt das `hr`-Token; dieses Muster sagt nur, aus
// welchem Zeichen sie besteht.
const TRENNER_RE = /^ {0,3}(-[ \t]*){3,}$/;

// HTML-Kommentar wie bei Marpit (`commentMatcher`): Oeffner `<!--`, Schliesser
// `-->`, jeweils auch mit mehr Bindestrichen.
const KOMMENTAR_RE = /<!--+\s*([\s\S]*?)\s*--+>/g;
const KOMMENTAR_BLOCK_OEFFNER_RE = /^ {0,3}<!--/;
const KOMMENTAR_SCHLIESSER = '-->';

// Steuer-Schluessel von Marp (Marpit `directives.js`: globale und lokale;
// marp-core: `size`, `math` als eigene globale).
const MARP_GLOBAL = ['headingDivider', 'style', 'theme', 'lang'];
const MARP_GLOBAL_KERN = ['size', 'math'];
const MARP_LOKAL = [
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundRepeat',
  'backgroundSize',
  'class',
  'color',
  'footer',
  'header',
  'paginate',
];
const MARP_WERKZEUG_KOMMENTARE = [
  /^prettier-ignore(-(start|end))?$/,
  /^markdownlint-((disable|enable).*|capture|restore)$/,
  /^lint (disable|enable|ignore).*$/,
];

// --- Zeilen-Werkzeug (Muster kanban-core.js) ---------------------------------

function trenneZeilen(text) {
  return String(text == null ? '' : text).split('\n');
}

function ohneCr(zeile) {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

function ermittleZeilenende(zeilen) {
  const mitCr = zeilen.filter((z) => z.endsWith('\r')).length;
  return mitCr > 0 && mitCr * 2 >= zeilen.length ? '\r\n' : '\n';
}

// Zahl der Zeilen, die der Kopf belegt. Endet der Kopf ohne Umbruch am
// Dokument-Ende, belegt er auch die letzte Zeile.
function kopfZeilenZahl(quelle, endOffset) {
  if (!endOffset) return 0;
  let n = 0;
  for (let i = 0; i < endOffset; i++) if (quelle[i] === '\n') n++;
  return endOffset === quelle.length && !quelle.endsWith('\n') ? n + 1 : n;
}

// --- Erkennung -----------------------------------------------------------------

function kennzeichenVon(daten) {
  if (!daten) return null;
  if (daten[PRAESENTATION_KOPF_SCHLUESSEL] === true) return PRAESENTATION_KOPF_SCHLUESSEL;
  if (daten[MARP_KOPF_SCHLUESSEL] === true) return MARP_KOPF_SCHLUESSEL;
  return null;
}

/**
 * Ist das Dokument eine Praesentation? `presentation: true` oder `marp: true`
 * im Kopf, jeweils als echtes `true`.
 *
 * @param {string} text voller Dokument-Text.
 * @returns {boolean}
 */
function istPraesentationsDokument(text) {
  const quelle = String(text == null ? '' : text);
  // Vorfilter wie im Vorbild: Die Frage laeuft bei jedem Modus-Wechsel.
  if (!quelle.includes(PRAESENTATION_KOPF_SCHLUESSEL) && !quelle.includes(MARP_KOPF_SCHLUESSEL)) {
    return false;
  }
  const kopf = extractFrontmatter(quelle);
  if (!kopf.data || kopf.parseError) return false;
  return kennzeichenVon(kopf.data) !== null;
}

// --- Steuer-Schluessel des Kopfs ---------------------------------------------

// 1-basierte Zeile eines Kopf-Schluessels, fuer den Befund; sonst Zeile 1.
function kopfZeileVon(zeilen, kopfZeilen, schluessel) {
  const re = new RegExp(`^${schluessel}[ \\t]*:`);
  for (let i = 1; i < kopfZeilen; i++) if (re.test(ohneCr(zeilen[i]))) return i + 1;
  return 1;
}

function leseKopf(daten, zeilen, kopfZeilen, befunde) {
  const kopf = { theme: null, paginate: false, header: null, footer: null, size: GROESSE_VORGABE };
  kopf.roh = daten || {};
  const befund = (code, schluessel, wert) =>
    befunde.push({
      code,
      zeile: kopfZeileVon(zeilen, kopfZeilen, schluessel),
      detail: wert === undefined ? '' : JSON.stringify(wert),
    });
  const hat = (k) => kopf.roh[k] !== undefined && kopf.roh[k] !== null;

  if (hat('theme')) {
    const t = kopf.roh.theme;
    const istBlock =
      typeof t === 'object' && !Array.isArray(t) && typeof t.name === 'string' && t.name !== '';
    // Name oder Block aus `name` und Uebersteuerungen (Paket 2, Punkt 3a);
    // der Block wird unveraendert durchgereicht, gedeutet wird er in der
    // Darstellung.
    if ((typeof t === 'string' && t !== '') || istBlock) kopf.theme = t;
    else befund('themeUngueltig', 'theme', t);
  }
  if (hat('paginate')) {
    if (typeof kopf.roh.paginate === 'boolean') kopf.paginate = kopf.roh.paginate;
    else befund('paginateUngueltig', 'paginate', kopf.roh.paginate);
  }
  for (const k of ['header', 'footer']) {
    if (!hat(k)) continue;
    if (typeof kopf.roh[k] === 'string') kopf[k] = kopf.roh[k];
    else befund(`${k}Ungueltig`, k, kopf.roh[k]);
  }
  if (hat('size')) {
    const s = String(kopf.roh.size).trim();
    if (GROESSEN.includes(s)) kopf.size = s;
    else befund('unbekannteGroesse', 'size', kopf.roh.size);
  }
  return kopf;
}

// --- Steuer-Kommentare nach Marp-Art -------------------------------------------

function yamlAbbildung(text) {
  try {
    const obj = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA });
    return obj !== null && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

// Marpit `looseYAML` (in marp-core voreingestellt): der Wert eines bekannten
// Schluessels wird in Anfuehrungszeichen gesetzt, damit `color: #fff` lesbar ist.
const LOCKER_SCHLUESSEL = [...MARP_GLOBAL, ...MARP_LOKAL]
  .map((k) => `_?${k}`)
  .flatMap((k) => [k, `"${k}"`, `'${k}'`])
  .join('|');
const LOCKER_RE = new RegExp(`^((?:${LOCKER_SCHLUESSEL})\\s*:)(.+)$`);
const YAML_SONDERZEICHEN = `["'{|>~&*`;

function locker(text) {
  return text
    .split(/\r?\n/)
    .map((zeile) =>
      zeile.replace(LOCKER_RE, (original, schluessel, wert) => {
        const getrimmt = wert.trim();
        if (getrimmt === '' || YAML_SONDERZEICHEN.includes(getrimmt[0])) return original;
        const abstand = wert.slice(0, wert.length - wert.trimStart().length);
        return `${schluessel}${abstand}"${getrimmt.split('"').join('\\"')}"`;
      }),
    )
    .join('\n')
    .trim();
}

function istSteuerKommentar(inhalt) {
  if (MARP_WERKZEUG_KOMMENTARE.some((re) => re.test(inhalt.trim()))) return true;
  const obj = yamlAbbildung(locker(inhalt));
  if (!obj) return false;
  return Object.keys(obj).some((k) => {
    if (MARP_GLOBAL.includes(k) || MARP_GLOBAL_KERN.includes(k) || MARP_LOKAL.includes(k)) {
      return true;
    }
    return k.startsWith('_') && MARP_LOKAL.includes(k.slice(1));
  });
}

// --- Zerlegung -------------------------------------------------------------------

// Die `%%`-Spannen des Rumpfs in Dokument-Offsets. Gesucht wird wie in der
// Render-Pipeline nur im Rumpf, nicht im Kopf.
function prozentSpannen(quelle, bodyOffset) {
  return findPercentCommentRanges(quelle.slice(bodyOffset)).map((b) => ({
    from: b.from + bodyOffset,
    to: b.to + bodyOffset,
    closed: b.closed,
  }));
}

// Platzhalter fuer entfernte Kommentar-Zeichen: haelt die Spalten der
// Arbeits-Kopie stabil und faellt in jeder Pruefung und im Ergebnis weg.
// Entfernt wird wie in `stripPercentComments` (Zeichen weg, Umbrueche bleiben),
// nicht durch Leerzeichen ersetzt: Eine eingerueckte Restzeile waere sonst Code.
const ENTFERNT = '\u0000';

function rein(zeile) {
  return zeile.split(ENTFERNT).join('');
}

function zeilenAnfaenge(zeilen) {
  const anfang = [];
  let pos = 0;
  for (const z of zeilen) {
    anfang.push(pos);
    pos += z.length + 1;
  }
  return anfang;
}

// Entfernt die Zeichen [von, bis) aus der Zeilen-Kopie, Umbrueche bleiben.
function leere(kopie, anfang, von, bis) {
  for (let i = 0; i < kopie.length; i++) {
    const za = anfang[i];
    const ze = za + kopie[i].length;
    if (ze < von || za >= bis) continue;
    const a = Math.max(von, za) - za;
    const b = Math.min(bis, ze) - za;
    kopie[i] = kopie[i].slice(0, a) + ENTFERNT.repeat(Math.max(0, b - a)) + kopie[i].slice(b);
  }
}

// Die HTML-Kommentare des Rumpfs als { von, bis, inhalt } in Dokument-Offsets:
// Bloecke nach Marpit (Zeile beginnt mit `<!--`, bis zur ersten Zeile mit
// `-->`, ohne Schluss bis zum Ende) und Kommentare im Fliesstext innerhalb
// eines Absatzes. Code-Zaeune und Code-Spannen sind ausgenommen.
function htmlKommentare(sicht, anfang, kopfZeilen) {
  const gefunden = [];
  const zeilenEnde = (i) => anfang[i] + sicht[i].length;
  const art = new Array(sicht.length).fill('text');
  let zaun = null;
  let block = null;
  const schliesseBlock = (von, bis) => {
    const text = sicht
      .slice(von, bis + 1)
      .map(rein)
      .join('\n');
    const treffer = new RegExp(KOMMENTAR_RE.source).exec(text);
    gefunden.push({
      von: anfang[von],
      bis: zeilenEnde(bis),
      inhalt: treffer ? treffer[1].trim() : '',
    });
  };
  for (let i = kopfZeilen; i < sicht.length; i++) {
    const z = rein(sicht[i]);
    if (block !== null) {
      art[i] = 'kommentar';
      if (z.includes(KOMMENTAR_SCHLIESSER)) {
        schliesseBlock(block, i);
        block = null;
      }
      continue;
    }
    if (zaun) {
      art[i] = 'zaun';
      if (schliesstZaun(z, zaun)) zaun = null;
      continue;
    }
    zaun = zaunOeffnung(z);
    if (zaun) {
      art[i] = 'zaun';
      continue;
    }
    if (KOMMENTAR_BLOCK_OEFFNER_RE.test(z)) {
      art[i] = 'kommentar';
      // Der Schliesser darf auf der Oeffner-Zeile stehen (Marpit prueft die
      // ganze Zeile, ab dem Oeffner).
      if (z.slice(z.indexOf('<!--')).includes(KOMMENTAR_SCHLIESSER)) schliesseBlock(i, i);
      else block = i;
    }
  }
  // Ein nicht geschlossener Kommentar-Block reicht wie bei Marpit bis zum Ende.
  if (block !== null) schliesseBlock(block, sicht.length - 1);

  // Kommentare im Fliesstext: zusammenhaengende Text-Zeilen ohne Leerzeile,
  // wie Marpit sie im Inline-Inhalt eines Absatzes findet.
  const absatz = (nummern) => {
    const masken = nummern.map((n) => maskInlineCode(sicht[n]));
    const dokOffset = (off) => {
      let rest = off;
      for (let k = 0; k < nummern.length; k++) {
        if (rest <= masken[k].length) return anfang[nummern[k]] + rest;
        rest -= masken[k].length + 1;
      }
      return zeilenEnde(nummern[nummern.length - 1]);
    };
    for (const t of masken.join('\n').matchAll(KOMMENTAR_RE)) {
      gefunden.push({
        von: dokOffset(t.index),
        bis: dokOffset(t.index + t[0].length),
        inhalt: rein(t[1]).trim(),
      });
    }
  };
  let laufend = [];
  for (let i = kopfZeilen; i <= sicht.length; i++) {
    if (i < sicht.length && art[i] === 'text' && rein(sicht[i]).trim() !== '') {
      laufend.push(i);
      continue;
    }
    if (laufend.length) absatz(laufend);
    laufend = [];
  }
  return gefunden;
}

// Die Trenner-Zeilen (0-basiert im Gesamt-Dokument) aus den `hr`-Tokens der
// hereingereichten Markdown-Instanz. Gelesen wird der bereinigte Rumpf; seine
// Zeilen-Nummern sind die des Dokuments minus der Kopf-Zeilen.
function trennerAusTokens(md, rumpfZeilen, kopfZeilen) {
  const tokens = md.parse(rumpfZeilen.join('\n'), {});
  const trenner = [];
  for (const t of tokens) {
    if (t.type !== 'hr' || t.level !== 0 || !t.map) continue;
    if (!TRENNER_RE.test(rumpfZeilen[t.map[0]] || '')) continue;
    trenner.push(t.map[0] + kopfZeilen);
  }
  return trenner;
}

function zerlege(quelle, zeilen, kopfZeilen, bodyOffset, optionen, befunde) {
  const anfang = zeilenAnfaenge(zeilen);
  // Arbeits-Kopie ohne `\r`; Kommentar-Zeichen werden darin durch den
  // Platzhalter ersetzt und erst im Ergebnis entfernt.
  const sicht = zeilen.map(ohneCr);
  const kommentare = [];
  if (optionen.kommentareAktiv) {
    for (const b of prozentSpannen(quelle, bodyOffset)) {
      const inhaltEnde = b.closed ? b.to - 2 : b.to;
      kommentare.push({
        steuer: false,
        von: b.from,
        inhalt: quelle
          .slice(b.from + 2, inhaltEnde)
          .replace(/\r/g, '')
          .trim(),
      });
      leere(sicht, anfang, b.from, b.to);
    }
  }
  // Alle HTML-Kommentare entfallen, fuer das Zerlegen wie fuer den Quelltext
  // der Folie; Notizen und Steuer-Kommentare bleiben als Rohdaten erhalten.
  for (const k of htmlKommentare(sicht, anfang, kopfZeilen)) {
    k.steuer = istSteuerKommentar(k.inhalt);
    kommentare.push(k);
    leere(sicht, anfang, k.von, k.bis);
  }

  let trenner = [];
  const md = optionen.md;
  if (!md || typeof md.parse !== 'function') {
    befunde.push({ code: 'keinParser', zeile: kopfZeilen + 1, detail: '' });
  } else {
    try {
      trenner = trennerAusTokens(md, sicht.slice(kopfZeilen).map(rein), kopfZeilen);
    } catch (err) {
      befunde.push({
        code: 'keinParser',
        zeile: kopfZeilen + 1,
        detail: String((err && err.message) || err),
      });
    }
  }

  // Folien an den Trennern schneiden; die Trenner-Zeile gehoert zu keiner.
  const folien = [];
  let start = kopfZeilen;
  const folieBis = (endeExklusiv) => {
    const vonOffset = start < zeilen.length ? anfang[start] : Infinity;
    const bisOffset = endeExklusiv < zeilen.length ? anfang[endeExklusiv] : Infinity;
    const eigene = kommentare
      .filter((k) => k.von >= vonOffset && k.von < bisOffset)
      .sort((a, b) => a.von - b.von);
    const notizen = [];
    const steuerKommentare = [];
    for (const k of eigene) {
      if (k.steuer) steuerKommentare.push(k.inhalt);
      else if (k.inhalt !== '') notizen.push(k.inhalt);
    }
    folien.push({
      index: folien.length,
      vonZeile: start + 1,
      bisZeile: endeExklusiv,
      quelltext: sicht.slice(start, endeExklusiv).map(rein).join('\n'),
      notizen,
      steuerKommentare,
    });
  };
  for (const zeile of trenner) {
    folieBis(zeile);
    start = zeile + 1;
  }
  folieBis(zeilen.length);
  return folien;
}

/**
 * Liest ein Dokument als Praesentation. Wirft nie.
 *
 * @param {string} text voller Dokument-Text.
 * @param {{kommentareAktiv?: boolean, md?: object}} [optionen]
 *   `kommentareAktiv` (Vorgabe true): ob die Kommentar-Erweiterung aktiv ist;
 *   bei false sind `%%` Text. `md`: die Markdown-Instanz der Anwendung
 *   (markdown-it, etwa `md` aus src/shared/markdown/markdown.js); ohne sie gibt
 *   es eine Folie aus dem ganzen Rumpf und den Befund `keinParser`.
 * @returns {{istPraesentation: boolean, kennzeichen: string|null,
 *   kopf: object, folien: Array<object>, zeilenende: string,
 *   befunde: Array<{code: string, zeile: number, detail: string}>}}
 */
function lesePraesentation(text, optionen = {}) {
  const optionenZerlegen = {
    kommentareAktiv: !(optionen && optionen.kommentareAktiv === false),
    md: optionen ? optionen.md : null,
  };
  const quelle = String(text == null ? '' : text);
  const zeilen = trenneZeilen(quelle);
  const befunde = [];
  const kopfText = extractFrontmatter(quelle);
  const kopfZeilen = kopfText.raw === null ? 0 : kopfZeilenZahl(quelle, kopfText.endOffset);
  const model = {
    istPraesentation: false,
    kennzeichen: null,
    kopf: {
      theme: null,
      paginate: false,
      header: null,
      footer: null,
      size: GROESSE_VORGABE,
      roh: {},
    },
    folien: [],
    zeilenende: ermittleZeilenende(zeilen),
    befunde,
  };
  if (kopfText.raw === null) {
    befunde.push({ code: 'keinKopf', zeile: 1, detail: '' });
  } else if (kopfText.parseError) {
    befunde.push({ code: 'kopfUnlesbar', zeile: 1, detail: String(kopfText.parseError) });
  } else {
    model.kennzeichen = kennzeichenVon(kopfText.data);
    if (model.kennzeichen === null) {
      befunde.push({ code: 'keinKennzeichen', zeile: 1, detail: PRAESENTATION_KOPF_SCHLUESSEL });
      model.kopf.roh = kopfText.data;
    } else {
      model.istPraesentation = true;
      model.kopf = leseKopf(kopfText.data, zeilen, kopfZeilen, befunde);
    }
  }
  // Die Zerlegung laeuft fuer jedes Dokument; ob die Folien gezeigt werden,
  // entscheidet `istPraesentation`.
  model.folien = zerlege(
    quelle,
    zeilen,
    kopfZeilen,
    kopfText.endOffset || 0,
    optionenZerlegen,
    befunde,
  );
  return model;
}

module.exports = {
  PRAESENTATION_KOPF_SCHLUESSEL,
  MARP_KOPF_SCHLUESSEL,
  STEUER_SCHLUESSEL,
  istPraesentationsDokument,
  lesePraesentation,
};
