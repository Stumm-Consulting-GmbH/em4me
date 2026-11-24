// 4T-002792 (Epic 3E-000434): Waechter ueber einen erzeugten Bestand.
//
// Die Zusage der privaten Kommentare haengt daran, dass zwei Stellen dasselbe
// fuer Code halten: die Erkennung der Kommentare (plugins/comments.js) und die
// Anzeige. Bis 1.160.0 entschied die Erkennung selbst, mit einer groeberen
// Regel als die Anzeige; ein einzelner Backtick vor und einer nach einem
// Kommentar liessen ihn in Anzeige und Export stehen. Seit 4T-002802 zerlegt
// die Anzeige das ganze Dokument und sagt selbst, welche Marker in Code liegen.
// Dieser Waechter haelt die Uebereinstimmung an zwei erzeugten Bestaenden fest
// und schlaegt an, wenn eine kuenftige Zeichen-Regel sie verschiebt.
//
// Erster Bestand, ein Kommentar je Dokument:
//
//   1. Der Text des Kommentars steht in der Ausgabe der Anzeige nie ausserhalb
//      eines Code-Elements.
//   2. Zeigt die Anzeige die Stelle am unveraenderten Text als Code, im
//      Fliesstext oder als Block, eingerueckt oder mit Zaun, bleibt der Marker
//      dort woertlich.
//   3. Verbirgt die Anzeige den Kommentar, enthaelt ihn auch der Export
//      «Speichern als portables Markdown» nicht.
//
// Zweiter Bestand, viele Marker je Dokument, mit Behaeltern, Definitionslisten,
// Roh-Bloecken, eingerueckten Code-Bloecken, Kommentaren ueber Zeilenenden und
// einzelnen Wagenruecklauf-Zeichen (Bausteine aller Runden des
// Sicherheits-Reviews zu 3E-000434). Gemessen wird gegen eine Bezugs-Rechnung
// in dieser Datei, die vor jedem Marker neu zerlegt:
//
//   4. Die Erkennung verbirgt nie weniger als die Bezugs-Rechnung.
//   5. Jeder Marker, der nach dem Entfernen stehen bleibt, liegt fuer die
//      Anzeige in Code; ein stehen gebliebener Marker im Text wuerde privaten
//      Text als Kommentar-Syntax offen zeigen.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
// Reine Rechnung ohne Prozess-Start: allein wenige Sekunden, unter der Last
// eines vollen Laufs deutlich mehr.
import { RECHEN_ZEITLIMIT } from '../../zeitlimits.js';

const require = createRequire(import.meta.url);
// Der Kern als CommonJS-Instanz: Er fuehrt seinen Zerleger nach jedem Neuaufbau
// unter `md`, die Erkennung derselben Instanz ist die, die er anmeldet.
const kern = require('../../../src/shared/markdown/markdown.js');
const erkennung = require('../../../src/shared/markdown/plugins/comments.js');

const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;
const ANZAHL = 3000;
const KEIM = 20261121;
const ANZAHL_ERWEITERT = 3000;
const KEIM_ERWEITERT = 20261122;

// Kleiner fester Zufalls-Erzeuger (mulberry32), damit der Bestand in jedem
// Lauf derselbe ist.
function zufall(keim) {
  let a = keim >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wahl = (rnd, liste) => liste[Math.floor(rnd() * liste.length)];

// Bausteine, die Code-Stuecke beginnen, beenden oder nur so aussehen.
const BAUSTEINE = [
  'Wort',
  'Taste ` hier',
  'Zeichen \\` dort',
  'Lauf `` da',
  'Stück `code` fertig',
  'Stück ``co ` de`` fertig',
  'Zelle | Zelle',
  'Pfad \\\\ Ende',
  '**fett**',
  '[[Seite]]',
  'Formel $a ` b$',
  '[[Seite`x]]',
];
const VORSATZ = [
  '',
  '',
  '',
  '# ',
  '- ',
  '> ',
  '1. ',
  '| ',
  '    ',
  '## ',
  ' - ',
  ' > ',
  '   1. ',
  '\t',
];
// Zaun-Zeilen auch mit Vorspann, Einrueckung und Info-Text (Sicherheits-Review
// zu 3E-000434, Runden 3 und 4): Die Erkennung lag dort anders als die
// Anzeige, auch bei eingerueckten Listen- und Zitat-Markern.
const SONDERZEILEN = [
  '',
  '',
  '***',
  '```',
  '~~~',
  '| A | B |',
  '|---|---|',
  '---',
  '- ```',
  '> ~~~',
  '  ```',
  '    ```',
  '1. ~~~',
  '```js',
  '```a` b',
  ' - ```',
  '   ```',
  '::: note',
  ':::',
  ': Erklärung',
  '    eingerückt',
];

function erzeuge(rnd) {
  const zeilen = [];
  const n = 2 + Math.floor(rnd() * 6);
  const ziel = Math.floor(rnd() * n);
  for (let i = 0; i < n; i++) {
    if (i !== ziel && rnd() < 0.3) {
      zeilen.push(wahl(rnd, SONDERZEILEN));
      continue;
    }
    const teile = [];
    const t = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < t; j++) teile.push(wahl(rnd, BAUSTEINE));
    if (i === ziel) teile.splice(Math.floor(rnd() * (teile.length + 1)), 0, K);
    zeilen.push(wahl(rnd, VORSATZ) + teile.join(' '));
  }
  // Ein Dokument, das mit einer Trennlinie beginnt, laese die Anwendung als
  // Kopf-Block, in dem es keine Kommentare gibt; das ist nicht der Gegenstand.
  if (zeilen[0] === '---') zeilen.unshift('Anfang', '');
  return `${zeilen.join('\n')}\n`;
}

// Zweiter Bestand: zusaetzlich Marker in jeder Lage.
const BAUSTEINE_ERWEITERT = [
  ...BAUSTEINE,
  'Stück `a %% b` fertig',
  'Rest %% hier',
  '<b>x</b>',
  K,
  '%%GEHEIM-A',
  'GEHEIM-B%%',
  '`%%`',
  'x``%%``y',
  '\\%% maskiert',
  // Bausteine, an denen die Erkennung neu fragt (Sicherheits-Review vom
  // 2026-11-22): Verweis mit Backtick in der Adresse, Verweis in spitzen Klammern.
  '[a](u`v%%)%% w',
  '[b](<x%%y>) z',
];
// Zitat-Folgezeilen mit vier und mehr Leerzeichen oder Tabulator vor `>`
// (Zweitblick Runde 3 zu 4T-002802): Sie gehören zum Zitat, für sich gelesen
// wären sie ein eingerückter Code-Block.
const VORSATZ_ERWEITERT = [...VORSATZ, ': ', '  ', '%%c%%', '    > ', '\t> ', '>     > '];
const SONDERZEILEN_ERWEITERT = [
  ...SONDERZEILEN,
  'Begriff',
  '    code %% x',
  '<pre>',
  '</pre>',
  '$$',
  '%%',
  '%%c%%```',
  '```%%x%%',
  '\t~~~',
  '    %%GEHEIM%%',
  '%%a',
  'b%%',
  // Verweis- und Fussnoten-Definitionen und Roh-Bloecke (Sicherheits-Review
  // vom 2026-11-22).
  '[x]: /url',
  '[y]: /u%%v',
  '[^f]: Fußnote %%n',
  '<!--',
  '-->',
  '<!-- %%a --> b%%',
];

function erzeugeErweitert(rnd) {
  const zeilen = [];
  const n = 2 + Math.floor(rnd() * 10);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.35) {
      zeilen.push(wahl(rnd, SONDERZEILEN_ERWEITERT));
      continue;
    }
    const teile = [];
    const t = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < t; j++) teile.push(wahl(rnd, BAUSTEINE_ERWEITERT));
    zeilen.push(wahl(rnd, VORSATZ_ERWEITERT) + teile.join(' '));
  }
  if (zeilen[0] === '---') zeilen.unshift('Anfang', '');
  // Jedes zehnte Dokument mit einzelnem Wagenruecklauf-Zeichen als Zeilenende,
  // jedes zehnte mit gemischten Zeilenenden.
  const art = rnd();
  if (art < 0.1) return `${zeilen.join('\r')}\r`;
  if (art < 0.2) return `${zeilen.map((z, i) => z + (i % 2 ? '\r' : '\n')).join('')}`;
  return `${zeilen.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Bezugs-Rechnung, unabhaengig von der Erkennung geschrieben: vor jedem Marker
// eine Zerlegung des Textes, in dem die Kommentare davor entfernt sind und alle
// Marker ab ihm samt den woertlich gelassenen eine Kennung tragen.
const LEIT = '';
const kennung = (n) =>
  LEIT + String.fromCharCode(0xe100 + (n >> 12)) + String.fromCharCode(0xe900 + (n & 4095));

function markerStellen(src) {
  const stellen = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\' && (src[i + 1] === '%' || src[i + 1] === '\\')) i++;
    else if (src[i] === '%' && src[i + 1] === '%') {
      stellen.push(i);
      i++;
    }
  }
  return stellen;
}

function nummernInCode(text) {
  const treffer = new Set();
  const besuche = (liste) => {
    for (const tok of liste) {
      if (tok.type === 'fence' || tok.type === 'code_block' || tok.type === 'code_inline') {
        for (let p = tok.content.indexOf(LEIT); p !== -1; p = tok.content.indexOf(LEIT, p + 1)) {
          treffer.add(
            ((tok.content.charCodeAt(p + 1) - 0xe100) << 12) |
              (tok.content.charCodeAt(p + 2) - 0xe900),
          );
        }
      }
      if (tok.children) besuche(tok.children);
    }
  };
  besuche(kern.md.parse(text, {}));
  return treffer;
}

// Text ohne die Bereiche, die genannten Marker als Kennung.
function sicht(src, stellen, bereiche, alsKennung) {
  const teile = [];
  for (const b of bereiche) teile.push({ a: b.from, b: b.to, weg: true });
  for (const k of alsKennung) teile.push({ a: stellen[k], b: stellen[k] + 2, k });
  teile.sort((x, y) => x.a - y.a);
  let aus = '';
  let pos = 0;
  for (const t of teile) {
    aus += src.slice(pos, t.a);
    aus += t.weg ? src.slice(t.a, t.b).replace(/[^\n]+/g, '') : kennung(t.k);
    pos = t.b;
  }
  return aus + src.slice(pos);
}

function bezug(text) {
  const src = text.replace(/\r(?!\n)/g, '\n');
  const stellen = markerStellen(src);
  const bereiche = [];
  const woertlich = [];
  let k = 0;
  while (k < stellen.length) {
    const alsKennung = woertlich.slice();
    for (let j = k; j < stellen.length; j++) alsKennung.push(j);
    if (nummernInCode(sicht(src, stellen, bereiche, alsKennung)).has(k)) {
      woertlich.push(k);
      k++;
      continue;
    }
    if (k + 1 >= stellen.length) {
      bereiche.push({ from: stellen[k], to: src.length });
      break;
    }
    bereiche.push({ from: stellen[k], to: stellen[k + 1] + 2 });
    k += 2;
  }
  // Stimmig ist die Bezugs-Rechnung, wenn ihre woertlichen Marker auch im
  // fertigen Text in Code liegen; sonst zerstoert ein spaeterer Kommentar das
  // Code-Stueck eines frueheren Markers, und die Erkennung entscheidet ab ihm
  // neu, also mit mehr Verborgenem.
  const fertig = nummernInCode(sicht(src, stellen, bereiche, woertlich));
  return { src, stellen, bereiche, stimmig: woertlich.every((w) => fertig.has(w)) };
}

function verborgen(bereiche, laenge) {
  const v = new Uint8Array(laenge);
  for (const b of bereiche) v.fill(1, b.from, b.to);
  return v;
}

// Wo steht der Kommentar-Text in der Ausgabe der Anzeige?
function lage(html) {
  if (!html.includes(GEHEIM)) return 'verborgen';
  const ohneBlock = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
  if (!ohneBlock.includes(GEHEIM)) return 'code-block';
  const ohneCode = ohneBlock.replace(/<code[\s\S]*?<\/code>/g, '');
  return ohneCode.includes(GEHEIM) ? 'text' : 'code-stueck';
}

const zeichne = (doc) => renderMarkdown(doc, 'de', { frontmatterBlock: false });

afterEach(() => {
  configureExtensions([]);
});

describe('Private Kommentare und Code: Erkennung und Anzeige stimmen überein (4T-002792, 4T-002802)', () => {
  it(
    `an ${ANZAHL} erzeugten Dokumenten steht kein Kommentar-Text außerhalb von Code, und der Export folgt der Anzeige`,
    () => {
      const rnd = zufall(KEIM);
      const dokumente = Array.from({ length: ANZAHL }, () => erzeuge(rnd));
      // Was die Anzeige am unveraenderten Text fuer Code haelt: einmal
      // umgeschaltet fuer den ganzen Bestand, das Umschalten baut den Zerleger neu.
      configureExtensions(['comments']);
      const roh = dokumente.map((doc) => lage(zeichne(doc)));
      configureExtensions([]);
      const lecks = [];
      const verschwunden = [];
      const exportAbweichungen = [];
      let imCode = 0;
      dokumente.forEach((doc, i) => {
        const ist = lage(zeichne(doc));
        const inCode = roh[i] === 'code-stueck' || roh[i] === 'code-block';
        if (inCode) imCode++;
        if (ist === 'text') lecks.push(doc);
        if (inCode && ist === 'verborgen') verschwunden.push(doc);
        if (ist === 'verborgen' && convertMarkdownPortable(doc).includes(GEHEIM)) {
          exportAbweichungen.push(doc);
        }
      });
      expect(lecks, 'Kommentar-Text als gewöhnlicher Text in der Anzeige').toEqual([]);
      expect(verschwunden, 'Marker in echtem Code verschwunden').toEqual([]);
      expect(exportAbweichungen, 'Export enthält, was die Anzeige verbirgt').toEqual([]);
      // Der Bestand muss den Fall «Marker in Code» ueberhaupt enthalten, sonst
      // pruefte der Waechter die zweite Zusage nicht.
      expect(imCode).toBeGreaterThan(50);
    },
    RECHEN_ZEITLIMIT,
  );

  it(
    `an ${ANZAHL_ERWEITERT} erzeugten Dokumenten mit vielen Markern verbirgt die Erkennung nie weniger als die Bezugs-Rechnung, und kein stehen gebliebener Marker liegt außerhalb von Code`,
    () => {
      const rnd = zufall(KEIM_ERWEITERT);
      const weniger = [];
      const markerImText = [];
      let mitWoertlichem = 0;
      let mitKommentar = 0;
      for (let i = 0; i < ANZAHL_ERWEITERT; i++) {
        const doc = erzeugeErweitert(rnd);
        const ist = erkennung.findPercentCommentRanges(doc);
        const soll = bezug(doc);
        if (ist.length) mitKommentar++;
        // Zusage 4: nie weniger verborgen, ausser wo die Bezugs-Rechnung selbst
        // unstimmig ist.
        if (soll.stimmig) {
          const vi = verborgen(ist, doc.length);
          const vs = verborgen(soll.bereiche, doc.length);
          if (vs.some((x, p) => x && !vi[p])) weniger.push(doc);
        }
        // Zusage 5: die stehen gebliebenen Marker, als Kennung im fertigen Text.
        const bleiben = [];
        soll.stellen.forEach((s, k) => {
          if (!ist.some((b) => b.from <= s && s < b.to)) bleiben.push(k);
        });
        if (bleiben.length) {
          mitWoertlichem++;
          const inCode = nummernInCode(sicht(soll.src, soll.stellen, ist, bleiben));
          if (!bleiben.every((k) => inCode.has(k))) markerImText.push(doc);
        }
      }
      expect(weniger.slice(0, 5), 'weniger verborgen als die Bezugs-Rechnung').toEqual([]);
      expect(markerImText.slice(0, 5), 'stehen gebliebener Marker außerhalb von Code').toEqual([]);
      // Der Bestand muss beide Faelle tragen.
      expect(mitWoertlichem).toBeGreaterThan(300);
      expect(mitKommentar).toBeGreaterThan(1500);
    },
    RECHEN_ZEITLIMIT,
  );
});
