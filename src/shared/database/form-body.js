// 4T-001938 (Epic 3E-000257, Bauplan B1, B2; E7.2, E7.3): Der Körper einer
// Einzel-Maske — die erzeugte Fassung aus der Definition und die Zerlegung
// eines Körpers in Markdown- und Feld-Segmente.
//
// **Eine Form für beide Masken.** Nach E7.3 ist die Einzel-Maske ein
// Markdown-Körper mit Platzhaltern; nach E7.2 gibt es für jede Tabelle immer
// eine Maske, erzeugt aus der Definition oder aus einer Datei, die die
// erzeugte übersteuert. Die erzeugte Maske wird deshalb nicht als festes
// Formular gebaut, sondern als derselbe Körper, den eine Masken-Datei trägt:
// Ein Renderer bedient beide, und «als Datei herausschreiben» schreibt genau
// den Text, den `erzeugeMaskenKoerper` liefert. Zwei Renderer für dieselbe
// Sache wären die Naht, an der die beiden Fassungen auseinanderliefen.
//
// **Erkannt wird allein `{{field:<name>}}`.** Die übrigen Platzhalter aus E7
// (`value`, `when`, `end`, `list`) entstehen in eigenen Vorgängen; bis dahin
// bleiben sie als Text stehen und tragen einen Hinweis, statt still zu
// verschwinden. Ein Platzhalter reicht nie über ein Zeilenende: Eine offene
// Klammer ohne Schluss auf derselben Zeile ist Text, damit ein Tippfehler
// nicht den Rest des Körpers als einen einzigen Platzhalter verschluckt.
//
// **Das Escape ist das der Vorlagen-Engine** (`src/shared/template-engine.js`):
// `\{{` wird zum literalen `{{` und nie zum Platzhalter. Dieselbe Regel an
// beiden Stellen, weil ein Autor, der sie in einer Vorlage gelernt hat, sie in
// der Maske wieder benutzt.
//
// **Hinweise statt Würfe** (weiche Linie wie beim Lesen der Definition). Ein
// Hinweis hat die Gestalt `{ code, name, zeile }`: `name` ist beim fremden
// Platzhalter der Inhalt der Klammern, beim unbekannten Feld der geschriebene
// Name; `zeile` zählt ab 1. Den Satz dazu bildet der Bedienort über
// `database.hint.<code>` (`table-hinweise.js`).
//
// Blatt-nahes Modul: Es importiert allein `beschriftung.js`. Prozess-neutral
// (kein Electron, kein DOM).
'use strict';

const { loeseBeschriftung } = require('./beschriftung.js');

// Die Codes der beiden Hinweise. Sie stehen zusätzlich im Katalog
// `table-hinweise.js`, damit der Wächter über die Sprachfassungen sie sieht;
// ein Prüffall hält beide Stellen deckungsgleich.
const FORM_HINWEISE = Object.freeze({
  platzhalterUnbekannt: 'formPlatzhalterUnbekannt',
  feldUnbekannt: 'formFeldUnbekannt',
});

// Der Feld-Platzhalter: `field`, ein Doppelpunkt und der Name, mit optionalem
// Leerraum an jeder Fuge. Das Wort `field` ohne Rücksicht auf die Schreibung,
// wie die Vorlagen-Engine ihre Platzhalter-Namen liest.
const FELD_PLATZHALTER_RE = /^\s*field\s*:(.*)$/i;

const OEFFNUNG = '{{';
const SCHLUSS = '}}';
const ESCAPE = '\\';

// In einem Text, der als Markdown-Segment stehen bleibt, verlöre ein `{{` beim
// nächsten Zerlegen seine Bedeutung als Text. Die erzeugte Fassung maskiert es
// deshalb mit dem Escape der Engine, damit Erzeugen und Zerlegen zueinander
// passen: Eine Beschriftung, die zufällig `{{` enthält, wird kein Platzhalter.
function maskiere(text) {
  return String(text)
    .split(OEFFNUNG)
    .join(ESCAPE + OEFFNUNG);
}

/**
 * Der Platzhalter eines Feldes in der Schreibweise der Masken-Datei.
 *
 * @param {string} name Der Feld-Name.
 * @returns {string} `{{field:<name>}}`.
 */
function feldPlatzhalter(name) {
  return `${OEFFNUNG}field:${name}${SCHLUSS}`;
}

/**
 * Erzeugt den Körper der Einzel-Maske aus der aufgelösten Definition (E7.2).
 *
 * Eine Überschrift mit dem Tabellen-Namen und je Feld in Definitions-Reihenfolge
 * eine Zeile `**<Beschriftung>:** {{field:<name>}}`, getrennt durch Leerzeilen.
 * Die Beschriftung folgt der Rückfall-Kette aus E21.4 (`loeseBeschriftung`) und
 * fällt zuletzt auf den Feld-Namen zurück, den technischen Namen, den nur der
 * Aufrufer kennt.
 *
 * @param {{fields?: Array<{name: string, label?: string|object}>}} definition
 *   Ergebnis von `parseTableDefinition`.
 * @param {{tabellenName?: string, sprache?: string|null, rueckfallSprache?: string|null}} [optionen]
 * @returns {string} Der Markdown-Körper, mit Zeilenumbruch am Ende.
 */
function erzeugeMaskenKoerper(definition, optionen = {}) {
  const { tabellenName = '', sprache = null, rueckfallSprache = null } = optionen || {};
  const felder = definition && Array.isArray(definition.fields) ? definition.fields : [];
  const bloecke = [`# ${maskiere(tabellenName)}`];
  for (const feld of felder) {
    const beschriftung = loeseBeschriftung(feld.label, sprache, rueckfallSprache) || feld.name;
    bloecke.push(`**${maskiere(beschriftung)}:** ${feldPlatzhalter(feld.name)}`);
  }
  return `${bloecke.join('\n\n')}\n`;
}

// Der Feld-Name der Definition zu einem geschriebenen Namen, ohne Rücksicht auf
// die Schreibung (wie die Feld-Karte der Schreib-Schnittstelle), oder null.
function kanonischerName(felder, geschrieben) {
  const klein = geschrieben.toLowerCase();
  const treffer = felder.find((feld) => feld && feld.name.toLowerCase() === klein);
  return treffer ? treffer.name : null;
}

/**
 * Zerlegt einen Masken-Körper in Markdown- und Feld-Segmente (E7.3).
 *
 * @param {string} text Der Körper.
 * @param {Array<{name: string}>} fields Die Felder der Definition.
 * @returns {{segmente: Array<{art: 'markdown', text: string}|{art: 'feld', name: string}>,
 *   hints: Array<{code: string, name: string, zeile: number}>}} Ein Feld-Segment
 *   trägt den kanonischen Namen der Definition; aufeinanderfolgender Text steht
 *   in einem Segment.
 */
function zerlegeMaskenKoerper(text, fields) {
  const quelle = typeof text === 'string' ? text : '';
  const felder = Array.isArray(fields) ? fields : [];
  const segmente = [];
  const hints = [];
  let literal = '';
  let zeile = 1;

  const schliesseText = () => {
    if (literal !== '') segmente.push({ art: 'markdown', text: literal });
    literal = '';
  };

  let i = 0;
  while (i < quelle.length) {
    if (quelle[i] === ESCAPE && quelle.startsWith(OEFFNUNG, i + 1)) {
      literal += OEFFNUNG;
      i += 1 + OEFFNUNG.length;
      continue;
    }
    if (quelle.startsWith(OEFFNUNG, i)) {
      const zeilenEnde = quelle.indexOf('\n', i);
      const schluss = quelle.indexOf(SCHLUSS, i + OEFFNUNG.length);
      if (schluss >= 0 && (zeilenEnde < 0 || schluss < zeilenEnde)) {
        const innen = quelle.slice(i + OEFFNUNG.length, schluss);
        const roh = quelle.slice(i, schluss + SCHLUSS.length);
        const feld = FELD_PLATZHALTER_RE.exec(innen);
        if (!feld) {
          hints.push({ code: FORM_HINWEISE.platzhalterUnbekannt, name: innen.trim(), zeile });
          literal += roh;
        } else {
          const geschrieben = feld[1].trim();
          const name = kanonischerName(felder, geschrieben);
          if (name === null) {
            hints.push({ code: FORM_HINWEISE.feldUnbekannt, name: geschrieben, zeile });
            literal += roh;
          } else {
            schliesseText();
            segmente.push({ art: 'feld', name });
          }
        }
        i = schluss + SCHLUSS.length;
        continue;
      }
    }
    if (quelle[i] === '\n') zeile += 1;
    literal += quelle[i];
    i += 1;
  }
  schliesseText();
  return { segmente, hints };
}

/**
 * Die Felder, die ein Körper nennt, in Reihenfolge und ohne Doppelte — für den
 * Speicher-Auftrag (nur genannte Felder) und für die Prüfung einer Masken-Datei.
 *
 * @param {Array<object>} segmente Ergebnis von `zerlegeMaskenKoerper`.
 * @returns {Array<string>} Kanonische Feld-Namen.
 */
function felderDesKoerpers(segmente) {
  const namen = [];
  for (const segment of Array.isArray(segmente) ? segmente : []) {
    if (segment && segment.art === 'feld' && !namen.includes(segment.name))
      namen.push(segment.name);
  }
  return namen;
}

module.exports = {
  FORM_HINWEISE,
  feldPlatzhalter,
  erzeugeMaskenKoerper,
  zerlegeMaskenKoerper,
  felderDesKoerpers,
};
