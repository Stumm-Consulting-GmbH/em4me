// 4T-002025 (Epic 3E-000192): Diagramm zu einer Datentabelle im portablen
// Export — Erkennung der Diagramm-Blöcke und die Ersetzung eines Blocks durch
// ein fertiges Bild.
//
// Prozess-neutral: kein DOM, kein Electron, kein Datei-Zugriff, kein Zeichnen.
// Der rechnende Teil (welche Stelle im Text ist ein Diagramm, was tritt an ihre
// Stelle) ist damit ohne laufendes Programm prüfbar; das Zeichnen liegt beim
// Aufrufer (src/renderer/modules/charts/chart-export.js), der über die Brücke
// zeichnet. Vorbild ist der Kern der Ablauf-Diagramme
// (src/shared/mermaid-fence.js), mit drei Abweichungen:
//
// **Keine eigene Zaun-Erkennung.** Öffnen und Schließen entscheiden allein
// `zaunOeffnung` und `schliesstZaun` aus fence-level.js, die Heimat der
// Zaun-Regel; der Name des Blocks kommt aus perspective-chart-ref.js, die
// Fläche und ihre Karten aus dem Kern der Canvas. Ein eigener Ausdruck wäre die
// nächste Kopie, die der Wächter test/unit/zaun-kopien.test.js zählt.
//
// **Nur Blöcke der obersten Ebene.** Ein Diagramm-Block in einem längeren
// äußeren Zaun ist zitierter Text und bleibt stehen. Eine Zeile mit Listen-
// oder Zitat-Marker vor dem Zaun ist nach der Zaun-Regel keine Zaun-Zeile; ein
// solcher Block bleibt deshalb ebenfalls stehen. Ein mit bis zu drei
// Leerzeichen eingerückter Zaun ist eine Zaun-Zeile, etwa unter einem
// Listenpunkt; das Bild behält die Einrückung, damit es im Listenpunkt bleibt.
//
// **Ein bis zum Textende offener Block wird ersetzt wie ein geschlossener**
// (Durchsicht vom 2026-09-30). Die Ansicht zeichnet ihn: markdown-it schließt
// ihn am Textende, und sein Inhalt ist der ganze Rest des Textes. Das Bild
// verschluckt damit nichts, was die Ansicht als Text zeigt. Für ein
// Diagramm-Block in einer Karte gilt das nicht (unten): Nach der Umwandlung
// der Fläche stünde hinter ihm der Text der übrigen Karten und des Dokuments.
//
// **Der gelieferte Inhalt ist die Quelle, die der Render-Weg trägt.** Die
// Ansicht zeichnet mit dem Inhalt, den markdown-it dem Block gibt
// (`data-chart-source`): Zeilenenden als `\n`, jede Zeile um höchstens die
// Einrückung des öffnenden Zauns verkürzt, jede Zeile mit `\n` abgeschlossen,
// die sie im Text trägt — die letzte Zeile eines offenen Blocks ohne
// abschließenden Umbruch also ohne.
// Derselbe Inhalt geht hier an den Aufrufer, damit Export und Ansicht dasselbe
// Diagramm zeichnen.
//
// **Die Ersetzung setzt den Text über Zeichen-Positionen neu zusammen** und
// nie über `String.replace` mit einem Ersetzungs-Text: Dort wären `$`-Folgen
// Sonderzeichen, und ein Bild, das eine solche Folge enthält, würde still
// verstümmelt (Fehlerklasse L7). Alles außerhalb der ersetzten Blöcke bleibt
// byte-gleich.
//
// **Diagramme in einer Karte einer Canvas-Fläche** (Entscheidung vom
// 2026-09-30: der Export zeigt dasselbe wie die Canvas-Ansicht). Die Ansicht
// löst ein Karten-Diagramm gegen den Text seiner Karte auf. Die Umwandlung der
// Fläche im portablen Export hebt den Karten-Text dagegen unverändert auf die
// oberste Ebene, wo er von einem Diagramm des Dokuments nicht mehr zu
// unterscheiden ist — auch nicht über den Inhalt, denn derselbe Block kann in
// Karte und Dokument verschieden ausgehen. Deshalb bekommt jeder Diagramm-Block
// einer Karte **vor** der Umwandlung eine Marke: Das erste Wort seiner
// Info-Zeichenfolge wird durch eine eindeutige Kennung ersetzt
// (`markiereKartenDiagramme`). Die Zeilen-Zahl bleibt gleich, damit die
// Zeilen-Angaben der Befunde einer Fläche stimmen; der Schritt der obersten
// Ebene übergeht den markierten Block, weil sein erstes Wort nicht der Name des
// Diagramm-Blocks ist. Nach der Umwandlung löst der Aufrufer jeden markierten
// Block gegen seinen Karten-Text auf, und zum Schluss wird **jede** Marke, wo
// immer sie steht, zum Namen zurückgesetzt (`stelleKartenMarkenWiederHer`) —
// auch in einer nicht umgewandelten Fläche und in einer Beschriftung, die aus
// der ersten Zeile einer Karte entsteht. Der Export ist damit außerhalb der
// ersetzten Blöcke byte-gleich zu dem ohne Marke.
'use strict';

const { schliesstZaun, zaunOeffnung } = require('./fence-level.js');
const { CHART_FENCE_INFO } = require('./perspective-chart-ref.js');
// Eine Text-Karte rendert die Canvas-Ansicht als Markdown und zeichnet ihre
// Diagramme; jede andere Karte und jedes andere Element zeigt seinen Text nicht
// als Markdown. Die Regel steht im Kern der Canvas, den die Ansicht ebenso liest.
const { findCanvasFences, istTextKarte, parseCanvasFence } = require('../canvas/canvas-core.js');

// Zeilen-Inhalt ohne das CRLF-Artefakt; markdown-it normalisiert die
// Zeilenenden vor dem Zerlegen ebenso.
function ohneCr(zeile) {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

// Höchstens `einzug` führende Leerzeichen einer Inhalts-Zeile entfernen, wie
// markdown-it es für den Inhalt eines eingerückten Zauns tut.
function ohneEinzug(zeile, einzug) {
  let i = 0;
  while (i < einzug && zeile[i] === ' ') i += 1;
  return zeile.slice(i);
}

// Alle Blöcke der obersten Ebene mit dem ersten Wort `sprache`, geschlossen
// oder bis zum Textende offen, je mit der Nummer ihrer öffnenden Zeile und der
// Einrückung ihres Zauns.
function scanne(text, sprache) {
  const src = String(text == null ? '' : text);
  const bloecke = [];
  let offen = null;
  let pos = 0;
  let nr = 0;
  for (; ; nr += 1) {
    const nl = src.indexOf('\n', pos);
    const zeilenEnde = nl === -1 ? src.length : nl;
    const zeile = src.slice(pos, zeilenEnde);
    if (offen) {
      if (schliesstZaun(zeile, offen.oeffnung)) {
        if (offen.diagramm) {
          const ende = zeile.endsWith('\r') ? zeilenEnde - 1 : zeilenEnde;
          bloecke.push({
            start: offen.start,
            ende,
            body: offen.zeilen.join(''),
            zeile: offen.zeile,
            einzug: offen.einzug,
            geschlossen: true,
          });
        }
        offen = null;
      } else if (offen.diagramm) {
        const umbruch = nl === -1 ? '' : '\n';
        offen.zeilen.push(`${ohneEinzug(ohneCr(zeile), offen.einzug)}${umbruch}`);
      }
    } else {
      const oeffnung = zaunOeffnung(zeile);
      if (oeffnung) {
        offen = {
          oeffnung,
          start: pos,
          zeile: nr,
          einzug: zeile.length - zeile.trimStart().length,
          diagramm: oeffnung.sprache === sprache,
          zeilen: [],
        };
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (offen && offen.diagramm) {
    bloecke.push({
      start: offen.start,
      ende: src.length,
      body: offen.zeilen.join(''),
      zeile: offen.zeile,
      einzug: offen.einzug,
      geschlossen: false,
    });
  }
  return bloecke;
}

/**
 * Die Diagramm-Blöcke der obersten Ebene in Textreihenfolge, die geschlossenen
 * und ein bis zum Textende offener.
 *
 * @param {string} text Markdown-Text.
 * @param {string} [sprache] Erstes Wort der Info-Zeichenfolge; ohne Angabe der
 *   Name des Diagramm-Blocks, sonst die Marke eines Karten-Diagramms.
 * @returns {Array<{start: number, ende: number, body: string, zeile: number,
 *   einzug: number, geschlossen: boolean}>} `start` ist der Anfang der
 *   öffnenden Zeile samt Einrückung, `ende` das Ende der schließenden Zeile
 *   ohne ihr Zeilenende (auch ohne ein `\r`), bei einem offenen Block das
 *   Textende; `body` der Inhalt, wie ihn der Render-Weg trägt; `zeile` die
 *   Nummer der öffnenden Zeile, ab null gezählt; `einzug` die Zahl der
 *   Leerzeichen vor dem Zaun.
 */
function findeDiagrammBloecke(text, sprache = CHART_FENCE_INFO) {
  return scanne(text, sprache);
}

// Der Ersatz mit der Einrückung des Zauns vor jeder seiner Zeilen, damit er
// dort bleibt, wo der Block stand (etwa in einem Listenpunkt). Die erste Zeile
// bekommt die Einrückung aus dem Text selbst, eine leere keine.
function eingerueckt(ersatz, einzug) {
  if (einzug === 0) return ersatz;
  const vorsatz = ' '.repeat(einzug);
  return ersatz
    .split('\n')
    .map((zeile, i) => (i === 0 || zeile === '' ? zeile : vorsatz + zeile))
    .join('\n');
}

/**
 * Die Inhalte aller ersetzbaren Diagramm-Blöcke in Textreihenfolge. Doppelte
 * bleiben erhalten: Zwei gleiche Diagramme sind zwei Blöcke.
 *
 * @param {string} text Markdown-Text.
 * @returns {string[]}
 */
function sammleDiagrammQuellen(text) {
  return findeDiagrammBloecke(text).map((b) => b.body);
}

/**
 * Ersetzt jeden ersetzbaren Diagramm-Block durch das, was `build(body)`
 * liefert. Liefert `build` null oder undefined, bleibt der Block byte-gleich
 * stehen — der Weg für ein nicht zeichenbares Diagramm. Die Einrückung des
 * Zauns bleibt vor dem Ersatz stehen; ein offener Block wird bis zum
 * Textende ersetzt.
 *
 * @param {string} text Markdown-Text.
 * @param {function(string): (string|null|undefined)} build Bauer des Ersatzes
 *   je Block-Inhalt.
 * @param {string} [sprache] wie bei `findeDiagrammBloecke`.
 * @returns {string}
 */
function ersetzeDiagrammBloecke(text, build, sprache = CHART_FENCE_INFO) {
  const src = String(text == null ? '' : text);
  const teile = [];
  let bisher = 0;
  for (const block of findeDiagrammBloecke(src, sprache)) {
    const ersatz = build(block.body);
    if (ersatz == null) continue;
    teile.push(
      src.slice(bisher, block.start + block.einzug),
      eingerueckt(String(ersatz), block.einzug),
    );
    bisher = block.ende;
  }
  if (teile.length === 0) return src;
  teile.push(src.slice(bisher));
  return teile.join('');
}

// --- Zeile der ausgelassenen Werte (Entscheidung vom 2026-09-30) -------------

/**
 * Ein Satz als eigene Markdown-Zeile in Kursiv-Schreibweise, die ein fremder
 * Betrachter als Absatz zeigt. Jedes ASCII-Satzzeichen bekommt einen
 * Rückstrich — nach CommonMark ist das für jedes von ihnen erlaubt und macht es
 * wörtlich —, damit der Satz nichts auslöst: keine Hervorhebung, keinen
 * Verweis, keine Liste, keinen Kommentar der Anwendung (`%%`), keine
 * Inline-Berechnung, keinen Auto-Link über einen Punkt und keine typografische
 * Ersetzung von Anführungszeichen und Strichen (beide in der Anwendung
 * eingeschaltet). Ausgenommen sind allein Komma und Semikolon: Sie deutet
 * weder CommonMark noch eine Erweiterung, und der Satz bleibt im Quelltext
 * lesbar. Ein Zeilenumbruch im Satz wird zum Leerzeichen.
 *
 * @param {string} satz Der Satz, übersetzt und gefüllt.
 * @returns {string} Die Zeile ohne Zeilenende; leer bei leerem Satz.
 */
function kursiveZeile(satz) {
  const text = String(satz == null ? '' : satz)
    .split(/\s+/)
    .filter((w) => w !== '')
    .join(' ');
  if (text === '') return '';
  let aus = '';
  for (const zeichen of text) {
    const deutbar = /[!-/:-@[-`{-~]/.test(zeichen) && zeichen !== ',' && zeichen !== ';';
    aus += deutbar ? `\\${zeichen}` : zeichen;
  }
  return `*${aus}*`;
}

// --- Diagramme in einer Karte ------------------------------------------------

const MARKEN_KOPF = `${CHART_FENCE_INFO}-karte-`;

// Ein Präfix, das im Text nicht vorkommt. Zufall statt Zähler, damit ein
// Dokument, das über den Export spricht, keine Marke vortäuschen kann.
function eindeutigesPraefix(text, zufall) {
  for (;;) {
    const praefix = `${MARKEN_KOPF}${Math.floor(zufall() * 1e12).toString(36)}-`;
    if (!text.includes(praefix)) return praefix;
  }
}

/**
 * Markiert jeden Diagramm-Block in einer Karte einer Canvas-Fläche, bevor der
 * Text in die portable Form umgewandelt wird.
 *
 * @param {string} text Text des Dokuments.
 * @param {{zufall?: function(): number}} [optionen] Zufalls-Quelle (Prüffälle).
 * @returns {{text: string, karten: Array<{marke: string, body: (string|null),
 *   kartenText: string, zeichnen: boolean}>}} Der markierte Text und je Block
 *   seine Marke; `zeichnen` ist wahr für einen geschlossenen Block einer
 *   Text-Karte, dessen Inhalt `body` gegen `kartenText` aufgelöst wird. Ohne
 *   Karten-Diagramm ist `text` unverändert.
 */
function markiereKartenDiagramme(text, optionen = {}) {
  const src = String(text == null ? '' : text);
  const karten = [];
  if (!src.includes(CHART_FENCE_INFO)) return { text: src, karten };
  const zeilen = src.split('\n');
  const zufall = typeof optionen.zufall === 'function' ? optionen.zufall : Math.random;
  let praefix = null;
  for (const flaeche of findCanvasFences(src)) {
    for (const el of parseCanvasFence(flaeche.rumpf).elemente) {
      const zeichnen = istTextKarte(el);
      for (const block of scanne(el.inhalt, CHART_FENCE_INFO)) {
        // Die Karten-Zeile k steht im Rumpf direkt hinter der Marker-Zeile
        // (`el.zeile`, ab eins gezählt), der Rumpf beginnt im Dokument in der
        // Zeile `startZeile` (ab null gezählt).
        const nr = flaeche.startZeile + el.zeile + block.zeile;
        const zeile = zeilen[nr];
        const oeffnung = zaunOeffnung(zeile);
        if (!oeffnung || oeffnung.sprache !== CHART_FENCE_INFO) continue;
        const ab = zeile.indexOf(CHART_FENCE_INFO, zeile.length - zeile.trimStart().length);
        if (praefix === null) praefix = eindeutigesPraefix(src, zufall);
        const marke = `${praefix}${karten.length}`;
        zeilen[nr] = zeile.slice(0, ab) + marke + zeile.slice(ab + CHART_FENCE_INFO.length);
        karten.push({
          marke,
          body: block.geschlossen ? block.body : null,
          kartenText: el.inhalt,
          zeichnen: zeichnen && block.geschlossen,
        });
      }
    }
  }
  return karten.length === 0 ? { text: src, karten } : { text: zeilen.join('\n'), karten };
}

/**
 * Setzt jede Marke, wo immer sie steht, zum Namen des Diagramm-Blocks zurück.
 *
 * @param {string} text Text mit Marken.
 * @param {Array<{marke: string}>} karten Ergebnis von `markiereKartenDiagramme`.
 * @returns {string}
 */
function stelleKartenMarkenWiederHer(text, karten) {
  let aus = String(text == null ? '' : text);
  // Die längste Marke zuerst, damit `…-1` nicht den Anfang von `…-10` trifft.
  const marken = (karten || []).map((k) => k.marke).sort((a, b) => b.length - a.length);
  for (const marke of marken) aus = aus.split(marke).join(CHART_FENCE_INFO);
  return aus;
}

module.exports = {
  findeDiagrammBloecke,
  sammleDiagrammQuellen,
  ersetzeDiagrammBloecke,
  kursiveZeile,
  markiereKartenDiagramme,
  stelleKartenMarkenWiederHer,
};
