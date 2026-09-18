// 4T-001550 (Epic 3E-000251): aus src/shared/document-split.js geschnitten.
// Woran ein Dokument gemessen wird und wo es geschnitten werden darf — die
// Vorfrage der Zerlegung, getrennt von der Frage, wie aus ihrer Antwort ein
// Plan entsteht (dort geblieben: Füllung, Grenzen-Nachführung, Teil-Inhalte).
//
// **Warum der Schnitt hier verläuft.** Die Datei ist mit der zweiten
// Schnittpunkt-Art (4T-001549) über ihr Budget gewachsen, und die Naht lag
// bereits offen: Diese Seite beantwortet «wo darf ich schneiden», jene «wie
// verteile ich». Die Grenze ist zugleich die Grenze der Zuständigkeit — hier
// steht alles, was den Text nur LIEST, dort alles, was Datei-Inhalte BAUT.
//
// Prozessneutral und ohne Datei-Zugriff. Electron-frei (CommonJS).
'use strict';

const { extractFrontmatter } = require('./markdown/frontmatter.js');
const { FENCE_RE } = require('./markdown/link-scan.js');
// 4T-001549 (Epic 3E-000251, E26.5): Die zweite Schnittpunkt-Art braucht zwei
// Auskünfte der Datenbank — ob diese Datei eine Tabelle IST und wie ihr
// Datensatz-Block aussieht. Die erste kommt aus dem Blatt-Modul `behaelter.js`,
// das genau dafür ohne eigene Importe gebaut ist (der Link-Index nutzt es
// ebenso); die zweite sind zwei Konstanten des Ablage-Formats.
const { datenbankMarken } = require('./database/behaelter.js');
const { RECORD_FENCE, RECORD_MARKER } = require('./database/record-block.js');

// Schwellen in Byte (O1/O2, Entscheidung des Product Owners vom 2026-08-29;
// die Auslegung von «MB» als 2^20 am 2026-08-31 bestätigt). Gemessen wird die
// Byte-Größe, nicht die Zeilenzahl: Sie steht beim Lesen kostenlos im
// Verzeichnis-Eintrag, und beim Schreiben ist der Text ohnehin zur Hand.
const DOKUMENT_SCHWELLE = 1024 * 1024; // 1 MB für Dokumente des Anwenders
const ABLAGE_SCHWELLE = Math.round(0.7 * 1024 * 1024); // 0,7 MB für die technische Ablage

/**
 * Ist dieser Text eine Tabellen-Datei der Datenbank?
 *
 * **Die eine Quelle dieser Auskunft** (4T-001550). Sie wird an drei Stellen
 * gebraucht — Betriebsart der Schnittpunkt-Suche, Wahl der Schwelle und die
 * Frage, ob das erste Teilen angekündigt wird —, und drei eigene Erkennungen
 * könnten voneinander abweichen. Erkannt wird an der Marke im Frontmatter, weil
 * nach E26.4 die Angabe in der Datei die Wahrheit ist.
 */
function istTabellenDatei(text) {
  const fm = extractFrontmatter(String(text == null ? '' : text));
  return datenbankMarken(fm.data).includes('table');
}

/**
 * Die Schwelle, an der dieser Text gemessen wird (E26.1).
 *
 * Für die **technische Ablage** einer Datenbank gilt die kleinere: 0,7 MB statt
 * 1 MB. Der Unterschied ist nicht Vorsicht, sondern Zweck — ein Dokument des
 * Anwenders soll möglichst lange ungeteilt bleiben, weil die Teilung für ihn
 * sichtbar ist; die Ablage soll größenunabhängig schnell bleiben, und dort ist
 * die Teilung sein Nutzen und nicht sein Preis.
 */
function schwelleFuer(text) {
  return istTabellenDatei(text) ? ABLAGE_SCHWELLE : DOKUMENT_SCHWELLE;
}

// Zulässiger Schnittpunkt (O3): eine Überschrift der obersten ZWEI Ebenen an
// Spalte 0, gefolgt von Leerraum oder Zeilenende.
//
// Die Bedingung «Spalte 0» erledigt die Unteilbarkeits-Regel O4 ohne eigene
// Konstrukt-Erkennung: Eine Überschrift ganz links beendet in Markdown jeden
// Absatz, jede Liste, jede Tabelle und jeden Callout, die davor offen waren.
// Was eingerückt ist (Listen-Unterpunkte) oder mit '>' beginnt (Callouts,
// Zitate), trifft das Muster gar nicht erst. Das ist strenger als CommonMark,
// das bis zu drei führende Leerzeichen erlaubt — und die Strenge ist der Zweck:
// ein Schnitt an einer eingerückten Überschrift läge mitten in einem Konstrukt.
const SCHNITT_RE = /^#{1,2}([ \t]|$)/;

// Byte-Länge eines Textes in UTF-8, ohne Zwischen-Puffer.
//
// Bewusst ohne Buffer und TextEncoder: src/shared/ ist prozessneutral und
// nutzt beides an keiner Stelle; TextEncoder allozierte zudem bei jedem Aufruf
// ein Array in Dokument-Größe — bei genau den Dateien, um die es hier geht.
function byteLength(text) {
  const s = String(text == null ? '' : text);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4; // Surrogat-Paar: zwei Code-Units, vier Byte
      i++;
    } else n += 3;
  }
  return n;
}

// Liegt der Text über der Schwelle?
//
// Der Schnellweg vorn ist der Regelfall und kostet eine Multiplikation: Kein
// Zeichen wird in UTF-8 zu mehr als drei Byte je Code-Unit, ein Text unter
// einem Drittel der Schwelle kann sie also nicht reißen. Erst darüber wird
// wirklich gezählt.
function ueberSchwelle(text, schwelle) {
  const s = String(text == null ? '' : text);
  if (s.length * 3 <= schwelle) return false;
  return byteLength(s) > schwelle;
}

/**
 * Sucht die Schnittpunkte an Überschriften — der Weg jedes gewöhnlichen
 * Dokuments und bis 4T-001549 der einzige.
 *
 * Ausgeschlossen sind der Frontmatter (er gehört unteilbar zur Kopf-Datei),
 * alles innerhalb eines Code-Zauns (Maske über FENCE_RE aus link-scan.js, also
 * dieselbe Quelle wie Backlinks-Index, Block-Anker und Rewrite-Kern) und der
 * Beginn des Rumpfes selbst — ein Schnitt dort ergäbe einen ersten Teil, der
 * nur aus Frontmatter besteht.
 */
function ueberschriftsPunkte(s, bodyStart) {
  const zeilen = s.split('\n');
  const punkte = [];
  let offset = 0;
  let byteOffset = 0;
  let imZaun = false;
  let zaunZeichen = null;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    const zaun = zeile.match(FENCE_RE);
    if (zaun) {
      const ch = zaun[1].charAt(0);
      if (!imZaun) {
        imZaun = true;
        zaunZeichen = ch;
      } else if (ch === zaunZeichen) {
        imZaun = false;
        zaunZeichen = null;
      }
    } else if (!imZaun && offset > bodyStart && SCHNITT_RE.test(zeile)) {
      punkte.push({ offset, byteOffset });
    }
    offset += zeile.length + 1; // +1 für das LF
    byteOffset += byteLength(zeile) + 1;
  }
  return punkte;
}

// Das erste Wort des Infostrings hinter einem Zaun. Es entscheidet, ob der
// Zaun der Datensatz-Block ist; dieselbe Lesart, mit der markdown-it die
// Fence-Sprache bestimmt.
function zaunSprache(zeile, zaun) {
  return zeile.slice(zaun[0].length).trim().split(/\s+/)[0];
}

/**
 * Sucht die Schnittpunkte an den Datensatz-Grenzen — der Weg einer
 * Tabellen-Datei der Datenbank (4T-001549, E26.5).
 *
 * **Hier gilt das Umgekehrte des Überschriften-Wegs:** Die Schnittpunkte liegen
 * INNERHALB einer Fence, nämlich an den Datensatz-Markern des Blocks. Das ist
 * kein Sonderfall, sondern die Konsequenz aus dem Aufbau: Eine Tabellen-Datei
 * besteht aus dem Frontmatter und einem einzigen `perspective-records`-Block
 * und enthält damit keine einzige Überschrift, an der zu schneiden wäre.
 *
 * **Der erste Datensatz der Datei ist kein Schnittpunkt.** Ein Schnitt vor ihm
 * ergäbe einen ersten Teil aus Frontmatter und öffnendem Zaun, also ohne einen
 * einzigen Datensatz — dieselbe Überlegung, mit der der Überschriften-Weg den
 * Rumpf-Anfang ausschließt. Daraus folgt zugleich die Unteilbarkeit des
 * einzelnen Datensatzes: Eine Tabelle mit genau einem Datensatz hat keinen
 * Schnittpunkt und bleibt ganz, auch wenn dieser Datensatz allein die Schwelle
 * reißt.
 *
 * **Eine maskierte Zeile kann nie getroffen werden**, ohne dass es einer
 * eigenen Prüfung bedürfte: Die Maskierung des Formats beginnt mit einem
 * Rückstrich, eine Zeile mit dem Datensatz-Marker in Spalte 0 beginnt mit dem
 * Marker selbst. Beides schließt einander aus.
 */
function datensatzPunkte(s) {
  const zeilen = s.split('\n');
  const punkte = [];
  let offset = 0;
  let byteOffset = 0;
  let imZaun = false;
  let zaunZeichen = null;
  let imDatenblock = false;
  let ersterGesehen = false;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    const zaun = zeile.match(FENCE_RE);
    if (zaun) {
      const ch = zaun[1].charAt(0);
      if (!imZaun) {
        imZaun = true;
        zaunZeichen = ch;
        imDatenblock = zaunSprache(zeile, zaun) === RECORD_FENCE;
      } else if (ch === zaunZeichen) {
        imZaun = false;
        zaunZeichen = null;
        imDatenblock = false;
      }
    } else if (imDatenblock && zeile.startsWith(RECORD_MARKER)) {
      if (ersterGesehen) punkte.push({ offset, byteOffset });
      else ersterGesehen = true;
    }
    offset += zeile.length + 1; // +1 für das LF
    byteOffset += byteLength(zeile) + 1;
  }
  return punkte;
}

/**
 * Sucht die zulässigen Schnittpunkte eines Dokument-Textes.
 *
 * Liefert eine aufsteigende Liste von { offset, byteOffset }; `offset` ist die
 * Position der Zeile im Text, an der ein neuer Teil BEGINNT.
 *
 * **Zwei Betriebsarten, die einander ausschließen** (4T-001549, E26.5): Eine
 * Tabellen-Datei der Datenbank wird an ihren Datensatz-Grenzen geschnitten,
 * jedes andere Dokument an seinen Überschriften. Es gibt keinen Durchlauf, der
 * beides sucht, denn eine Datei ist entweder eine Tabelle oder keine.
 *
 * **Erkannt wird an der Datei selbst**, über die Marke im Frontmatter, den
 * diese Funktion ohnehin liest. Der Aufrufer wird nicht gefragt: Nach E26.4 ist
 * die Angabe in der Datei die Wahrheit und der Katalog nur ihr Beschleuniger,
 * und eine zweite Quelle für dieselbe Aussage könnte von ihr abweichen.
 *
 * **Die Umkehr-Eigenschaft gilt für beide Arten gleich:** Geschnitten wird VOR
 * der Zeile und nichts angefügt, das schlichte Aneinanderhängen der Rümpfe
 * ergibt den Ausgangstext zeichengleich zurück.
 *
 * Erwartet auf LF normalisierten Text, wie ihn der Schreib-Weg herstellt;
 * jeder Zeilentrenner zählt deshalb genau ein Byte.
 */
function findSplitPoints(text) {
  const s = String(text == null ? '' : text);
  if (istTabellenDatei(s)) return datensatzPunkte(s);
  return ueberschriftsPunkte(s, extractFrontmatter(s).endOffset || 0);
}

module.exports = {
  DOKUMENT_SCHWELLE,
  ABLAGE_SCHWELLE,
  SCHNITT_RE,
  byteLength,
  ueberSchwelle,
  istTabellenDatei,
  schwelleFuer,
  findSplitPoints,
};
