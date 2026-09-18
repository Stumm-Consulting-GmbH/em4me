// 4T-001609 (Epic 3E-000252): Der Datensatz-Block einer Datenbank-Tabelle im
// Volltext-Suchraum des Bereichs.
//
// **Die Entscheidung dahinter** (Konzept «Datenbank-Anwendungen als Markdown»,
// E16.2): Ein Tabellen-Dokument bleibt durchsuchbar, sein Datensatz-Block nicht.
// Verworfen sind beide Nachbarn — das heutige Verhalten, das alles aufnimmt, und
// der vollstaendige Ausschluss der Datei, der ihr auch die Beschreibung naehme.
//
// **Warum die Zeilen geleert und nicht entfernt werden.** Der Suchkern rechnet
// den Fundort ueber die Zeilen-Anfaenge des uebergebenen Textes aus. Wuerden die
// Datensatz-Zeilen herausgeschnitten, verschoebe sich jede Fundstelle dahinter um
// die Zahl der entfallenen Zeilen, und ein Treffer in der Prosa unterhalb der
// Tabelle fuehrte an die falsche Stelle. Geleert bleibt die Zeilenzahl erhalten,
// waehrend der Speicher frei wird: Zeile und Spalte jedes Treffers stimmen ohne
// jede Umrechnung weiter.
//
// **Was dabei NICHT von selbst erhalten bleibt, ist der Zeichen-Offset.** Er ist
// die dritte Angabe der Sprung-Auskunft und zeigt nach der Bereinigung in den
// durchsuchten Text statt in die Datei. Deshalb fuehrt jede Bereinigung ihre
// **Ruecknahme-Karte** mit, und `mitDateiOffset` rechnet damit zurueck: Jeder
// Offset, der den Suchraum verlaesst, ist ein Datei-Offset.
//
// **Das war mit 4T-001609 anders entschieden und ist mit 4T-001671 neu
// bewertet.** Damals wurde die Karte verworfen und der Offset einer bereinigten
// Gruppe auf `null` gesetzt, begruendet mit einer Pruefung vom 2026-09-08: Kein
// Verbraucher lese ihn, denn der Sprung der Bereichs-Suche arbeite ueber Zeile
// und Spalte. Diese Pruefung war richtig und ist am selben Tag ueberholt worden,
// als das Release 1.131.0 die bereichsweite Tag-Umbenennung brachte: Sie holt
// ihre Texte ueber `bereichsTexte` aus demselben Vorrat, bildet ihre Offsets
// selbst und schreibt damit. Die Vorkehrung von 4T-001609 sass am Ausgang der
// Suche und nicht am Text; sie konnte den zweiten Ausgang nicht erreichen.
// **Die Lehre steckt in der Bauform:** Eine Eigenschaft des Textes gehoert an
// den Text, nicht in eine Nebenmenge, die ein einzelner Ausgang auswertet.
//
// **Die Erkennung folgt der Datei, nicht dem Aufrufer** (Muster aus 4T-001549):
// Eine Kopf-Datei weist sich ueber die Marke `db-table` in ihrem Frontmatter aus,
// ein Folge-Segment traegt diese Marke nach O6 nicht und wird an zwei Merkmalen
// erkannt, die zusammen eindeutig sind. **Sie stand bis 4T-001610 hier und ist
// seither gemeinsame Quelle** (`shared/database/record-segment.js`), weil die
// Erfassung des Datensatz-Bestands dieselbe Antwort braucht; hier bleibt allein
// das Leeren.
//
// Eigenes Modul aus demselben Grund wie `area-search-cache.js`,
// `area-search-teile.js` und `area-search-gross.js`: Die Suche selbst bleibt in
// `area-search.js`, die Beistell-Fachlichkeiten stehen daneben. Es gehoert zum
// Suchraum und nicht zur Datenbank — sein Gegenstand ist, was in den Vorrat
// kommt, und seine Datenbank-Kenntnis beschraenkt sich auf die Rollen-Auskunft
// und eine Konstante.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { FENCE_RE } = require('../../shared/markdown/link-scan.js');
const { RECORD_FENCE } = require('../../shared/database/record-block.js');
// Die EINE Quelle der Auskunft «welche Rolle spielt diese Datei» (4T-001610).
// Bis dahin stand die Erkennung des Folge-Segments hier; mit der Erfassung des
// Datensatz-Bestands braucht sie ein zweiter Verbraucher, und zwei Erkennungen
// koennten voneinander abweichen. Sie stuetzt sich ihrerseits auf die eine
// Quelle von «ist das eine Tabellen-Datei» (4T-001550).
const {
  ROLLE_KOPF,
  kommtUeberhauptInFrage,
  rolleVon,
} = require('../../shared/database/record-segment.js');

// Das erste Wort des Infostrings hinter einem Zaun; dieselbe Lesart, mit der
// markdown-it die Fence-Sprache bestimmt und mit der `document-split-punkte.js`
// den Datenblock findet.
function zaunSprache(zeile, zaun) {
  return zeile.slice(zaun[0].length).trim().split(/\s+/)[0];
}

// Zeilen-Index, in dem der Rumpf beginnt.
function rumpfZeile(text, endOffset) {
  let zeile = 0;
  for (let i = 0; i < endOffset && i < text.length; i++) if (text[i] === '\n') zeile++;
  return zeile;
}

// Fuehrt beim Leeren Buch: den bereinigten Text, die Zahl der entfernten Zeichen
// und die Ruecknahme-Karte (4T-001671).
//
// Die Karte traegt Stuetzstellen `{ ab, verschiebung }`, wobei `ab` ein Offset im
// BEREINIGTEN Text ist und `verschiebung` die bis dorthin entfernte Zeichenzahl.
// Sie entsteht je geleerter ZEILENGRUPPE und nicht je Zeile: In einer geleerten
// Zeile kann kein Treffer liegen, weil sie leer ist, und ein Datensatz-Block
// ergibt damit eine einzige Stuetzstelle statt tausender.
function neuesVerschiebungsBuch() {
  const aus = [];
  const karte = [];
  let entfernt = 0;
  // Offset des naechsten Zeilen-Anfangs im bereinigten Text. Der bereinigte Text
  // entsteht als `aus.join('\n')`, deshalb zaehlt je Zeile ihre Laenge plus der
  // Umbruch, der ihr folgt.
  let pos = 0;
  let offeneGruppe = false;

  function schliesseGruppe() {
    if (!offeneGruppe) return;
    karte.push({ ab: pos, verschiebung: entfernt });
    offeneGruppe = false;
  }

  return {
    behalte(zeile) {
      schliesseGruppe();
      aus.push(zeile);
      pos += zeile.length + 1;
    },
    leere(zeile) {
      entfernt += zeile.length;
      offeneGruppe = true;
      aus.push('');
      pos += 1;
    },
    ergebnis() {
      schliesseGruppe();
      return { aus, entfernt, karte };
    },
  };
}

// Leert die Zeilen zwischen den Zaeunen des Datensatz-Blocks. Die Zaun-Zeilen
// selbst bleiben stehen: Sie sind kein Datensatz, und ihr Verlust erzeugte
// dieselbe Zeilen-Verschiebung, die diese Bereinigung gerade vermeidet.
//
// Eine oeffnende Fence ohne schliessende ist der Normalfall der Kopf-Datei einer
// geteilten Tabelle; dort wird bis zum Ende geleert.
function leereKopfDatei(zeilen) {
  const buch = neuesVerschiebungsBuch();
  let imZaun = false;
  let zaunZeichen = null;
  let imDatenblock = false;
  for (const zeile of zeilen) {
    const zaun = zeile.match(FENCE_RE);
    if (zaun) {
      const zeichen = zaun[1].charAt(0);
      if (!imZaun) {
        imZaun = true;
        zaunZeichen = zeichen;
        imDatenblock = zaunSprache(zeile, zaun) === RECORD_FENCE;
      } else if (zeichen === zaunZeichen) {
        imZaun = false;
        zaunZeichen = null;
        imDatenblock = false;
      }
      buch.behalte(zeile);
      continue;
    }
    if (imDatenblock && zeile !== '') {
      buch.leere(zeile);
      continue;
    }
    buch.behalte(zeile);
  }
  return buch.ergebnis();
}

// Leert den Rumpf eines Folge-Segments. Er ist bis auf eine abschliessende
// Zaun-Zeile durchgehend Datensatz-Inhalt: Das mittlere Segment traegt gar keinen
// Zaun, das letzte den schliessenden.
function leereFolgeSegment(zeilen, abZeile) {
  const buch = neuesVerschiebungsBuch();
  let fertig = false;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    if (i < abZeile || fertig) {
      buch.behalte(zeile);
      continue;
    }
    if (FENCE_RE.test(zeile)) {
      fertig = true;
      buch.behalte(zeile);
      continue;
    }
    if (zeile === '') buch.behalte(zeile);
    else buch.leere(zeile);
  }
  return buch.ergebnis();
}

/**
 * Nimmt den Datensatz-Block eines Tabellen-Dokuments aus dem Suchtext.
 *
 * Liefert `null`, wenn nichts zu tun war — der Aufrufer behaelt dann seinen
 * unveraenderten Text, ohne dass eine Kopie entsteht. Sonst
 * `{ text, entfernt, karte }` mit dem bereinigten Text, der Zahl der entfernten
 * Zeichen und der Ruecknahme-Karte (4T-001671).
 *
 * Der Text kommt herein, die Auskunft geht hinaus: kein Datei-Zugriff, kein
 * Zustand, damit dieselbe Funktion an allen vier Wegen der Bereichs-Suche
 * dieselbe Antwort gibt.
 */
function bereinigeSuchtext(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s || !kommtUeberhauptInFrage(s)) return null;

  const fm = extractFrontmatter(s);
  const rolle = rolleVon(s, fm);
  if (!rolle) return null;
  const zeilen = s.split('\n');
  const ergebnis =
    rolle === ROLLE_KOPF
      ? leereKopfDatei(zeilen)
      : leereFolgeSegment(zeilen, rumpfZeile(s, fm.endOffset || 0));

  if (ergebnis.entfernt === 0) return null;
  return { text: ergebnis.aus.join('\n'), entfernt: ergebnis.entfernt, karte: ergebnis.karte };
}

/**
 * Bereinigt eine Map von Texten und vermerkt die Karte der betroffenen Gruppen.
 *
 * Fuer die Wege, die je Suchlauf von der Platte lesen. `gruppeVon` bildet den
 * Schluessel der Map auf die Gruppen-Kennung der Trefferliste ab, weil ein Teil
 * eines geteilten Dokuments unter dem Namen seiner Kopf-Datei erscheint.
 *
 * Eine leere oder fehlende Map geht unveraendert zurueck; der Regelfall ist ein
 * Bereich ganz ohne solche Dateien, und er darf nichts kosten.
 */
function bereinigeTextMap(map, karten, gruppeVon) {
  if (!map || map.size === 0) return map;
  const aus = new Map();
  for (const [schluessel, roh] of map) {
    const b = bereinigeSuchtext(roh);
    if (b && karten) karten.set(gruppeVon ? gruppeVon(schluessel) : schluessel, b.karte);
    aus.set(schluessel, b ? b.text : roh);
  }
  return aus;
}

/**
 * Rechnet einen Offset aus dem bereinigten Suchtext in die Datei zurueck.
 *
 * Ohne Karte ist der Offset bereits ein Datei-Offset und geht unveraendert
 * zurueck; das ist der Regelfall jeder Datei ohne Datensatz-Block.
 */
function dateiOffsetVon(offset, karte) {
  if (typeof offset !== 'number' || !Array.isArray(karte) || karte.length === 0) return offset;
  let verschiebung = 0;
  for (const stelle of karte) {
    if (stelle.ab > offset) break;
    verschiebung = stelle.verschiebung;
  }
  return offset + verschiebung;
}

/**
 * Setzt den Zeichen-Offset der Treffer einer bereinigten Gruppe auf die Stelle
 * in der DATEI (4T-001671).
 *
 * Zeile und Spalte ueberstehen die Bereinigung unveraendert, der Offset nicht:
 * Er zeigt zunaechst in den durchsuchten Text. Bis 4T-001671 wurde er deshalb
 * auf `null` gesetzt, weil kein Verbraucher ihn las; mit der bereichsweiten
 * Tag-Umbenennung aus 3E-000175 gibt es einen, und die Ruecknahme-Karte macht
 * aus der fehlenden Zahl wieder die richtige. **Jeder Offset, der den Suchraum
 * verlaesst, ist damit ein Datei-Offset** — das ist die Zusage, auf die sich die
 * Schreib-Strecke stuetzt.
 */
function mitDateiOffset(treffer, karten) {
  if (!karten || karten.size === 0 || !Array.isArray(treffer)) return treffer;
  return treffer.map((t) => {
    if (!t || !t.sprung || !karten.has(t.gruppe)) return t;
    const offset = dateiOffsetVon(t.sprung.offset, karten.get(t.gruppe));
    return offset === t.sprung.offset ? t : { ...t, sprung: { ...t.sprung, offset } };
  });
}

// 4T-001671: `suchtextVon` ist mit der Ruecknahme-Karte entfallen. Die Kurzform
// gab allein den Text zurueck, und genau diese Verkuerzung war die Bauform des
// Fehlers: Wer nur den Text nimmt, laesst die Eigenschaft zurueck, die er
// braucht. Jeder Aufrufer holt jetzt `bereinigeSuchtext` und bekommt beides.
module.exports = {
  bereinigeSuchtext,
  bereinigeTextMap,
  dateiOffsetVon,
  mitDateiOffset,
};
