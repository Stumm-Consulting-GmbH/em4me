// 4T-002792 (Epic 3E-000434): Waechter ueber einen erzeugten Bestand.
//
// Die Zusage der privaten Kommentare haengt daran, dass zwei Stellen dasselbe
// fuer Code halten: der Abtaster der Kommentare (plugins/comments.js) und die
// Anzeige. Bis 1.160.0 entschied der Abtaster selbst, mit einer groeberen
// Regel als die Anzeige; ein einzelner Backtick vor und einer nach einem
// Kommentar liessen ihn in Anzeige und Export stehen. Seither fragt der
// Abtaster den Zerleger der Anzeige. Dieser Waechter haelt die Uebereinstimmung
// an erzeugten Dokumenten fest und schlaegt an, wenn eine kuenftige
// Zeichen-Regel sie verschiebt:
//
//   1. Der Text eines privaten Kommentars steht in der Ausgabe der Anzeige
//      nie ausserhalb eines Code-Elements.
//   2. Zeigt die Anzeige die Stelle als Code-Stueck im Fliesstext, bleibt der
//      Marker dort woertlich (kein Code-Stueck verliert seinen Inhalt).
//   3. Verbirgt die Anzeige den Kommentar, enthaelt ihn auch der Export
//      «Speichern als portables Markdown» nicht.
//
// Eingerueckte Code-Bloecke ohne Zaun sind bewusst nicht geschuetzt
// (Festlegung aus 4T-000479); dort darf ein Kommentar verborgen sein, obwohl
// die Anzeige den unveraenderten Text als Code-Block zeigte.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
// Reine Rechnung ohne Prozess-Start: allein wenige Sekunden, unter der Last
// eines vollen Laufs deutlich mehr.
import { RECHEN_ZEITLIMIT } from '../../zeitlimits.js';

const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;
const ANZAHL = 300;
const KEIM = 20261121;

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
const VORSATZ = ['', '', '', '# ', '- ', '> ', '1. ', '| ', '    ', '## ', ' - ', ' > ', '   1. '];
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
];

function erzeuge(rnd) {
  const zeilen = [];
  const n = 2 + Math.floor(rnd() * 6);
  const ziel = Math.floor(rnd() * n);
  for (let i = 0; i < n; i++) {
    if (i !== ziel && rnd() < 0.3) {
      zeilen.push(SONDERZEILEN[Math.floor(rnd() * SONDERZEILEN.length)]);
      continue;
    }
    const teile = [];
    const t = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < t; j++) teile.push(BAUSTEINE[Math.floor(rnd() * BAUSTEINE.length)]);
    if (i === ziel) teile.splice(Math.floor(rnd() * (teile.length + 1)), 0, K);
    zeilen.push(VORSATZ[Math.floor(rnd() * VORSATZ.length)] + teile.join(' '));
  }
  // Ein Dokument, das mit einer Trennlinie beginnt, laese die Anwendung als
  // Kopf-Block, in dem es keine Kommentare gibt; das ist nicht der Gegenstand.
  if (zeilen[0] === '---') zeilen.unshift('Anfang', '');
  return `${zeilen.join('\n')}\n`;
}

// Wo steht der Kommentar-Text in der Ausgabe der Anzeige?
function lage(html) {
  if (!html.includes(GEHEIM)) return 'verborgen';
  const ohneBlock = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
  if (!ohneBlock.includes(GEHEIM)) return 'code-block';
  const ohneCode = ohneBlock.replace(/<code[\s\S]*?<\/code>/g, '');
  return ohneCode.includes(GEHEIM) ? 'text' : 'code-stueck';
}

function zeichne(doc, kommentareAus) {
  configureExtensions(kommentareAus ? ['comments'] : []);
  return renderMarkdown(doc, 'de', { frontmatterBlock: false });
}

afterEach(() => {
  configureExtensions([]);
});

describe('Private Kommentare und Code: Abtaster und Anzeige stimmen überein (4T-002792)', () => {
  it(
    `an ${ANZAHL} erzeugten Dokumenten steht kein Kommentar-Text außerhalb von Code, und der Export folgt der Anzeige`,
    () => {
      const rnd = zufall(KEIM);
      const lecks = [];
      const verschwunden = [];
      const exportAbweichungen = [];
      let imCodeStueck = 0;
      for (let i = 0; i < ANZAHL; i++) {
        const doc = erzeuge(rnd);
        // Was die Anzeige am unveraenderten Text fuer Code haelt.
        const roh = lage(zeichne(doc, true));
        const ist = lage(zeichne(doc, false));
        if (roh === 'code-stueck') imCodeStueck++;
        if (ist === 'text') lecks.push(doc);
        if (roh === 'code-stueck' && ist === 'verborgen') verschwunden.push(doc);
        const exportiert = convertMarkdownPortable(doc);
        if (ist === 'verborgen' && exportiert.includes(GEHEIM)) exportAbweichungen.push(doc);
      }
      expect(lecks, 'Kommentar-Text als gewöhnlicher Text in der Anzeige').toEqual([]);
      expect(verschwunden, 'Marker in einem echten Code-Stück verschwunden').toEqual([]);
      expect(exportAbweichungen, 'Export enthält, was die Anzeige verbirgt').toEqual([]);
      // Der Bestand muss den Fall «echtes Code-Stueck» ueberhaupt enthalten,
      // sonst pruefte der Waechter die zweite Zusage nicht.
      expect(imCodeStueck).toBeGreaterThan(5);
    },
    RECHEN_ZEITLIMIT,
  );
});
