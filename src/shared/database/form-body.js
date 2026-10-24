// 4T-001938 (Epic 3E-000257, Bauplan B1, B2; E7.2, E7.3): Der Körper einer
// Einzel-Maske — die erzeugte Fassung aus der Definition und die Zerlegung
// eines Körpers in Markdown-, Feld-, Wert-, Bereichs- und Listen-Segmente.
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
// **Erkannt werden `{{field:<name>}}`, `{{value:<ausdruck>}}`, die Marker
// `{{when:<ausdruck>}}` und `{{end}}` eines bedingten Bereichs und der
// Positions-Bereich `{{list:<Abfrage-Datei>}}`** (seit 4T-002253, unten). Ein
// Platzhalter reicht nie über ein Zeilenende: Eine offene
// Klammer ohne Schluss auf derselben Zeile ist Text, damit ein Tippfehler
// nicht den Rest des Körpers als einen einzigen Platzhalter verschluckt.
//
// **Das Escape ist das der Vorlagen-Engine** (`src/shared/template-engine.js`):
// `\{{` wird zum literalen `{{` und nie zum Platzhalter. Dieselbe Regel an
// beiden Stellen, weil ein Autor, der sie in einer Vorlage gelernt hat, sie in
// der Maske wieder benutzt.
//
// **Der Wert-Platzhalter** (4T-002183, S2, S3): Sein Ausdruck wird hier, beim
// Zerlegen, einmal gelesen (`form-wert.js`), nicht erst beim Zeichnen. Grund:
// Ein Ausdruck, der sich nicht lesen lässt, ist ein Befund der Masken-Datei,
// und die Konsistenz-Prüfung sieht den Körper allein über diese Zerlegung; der
// Hinweis entsteht deshalb an derselben Stelle wie der des unbekannten Feldes.
// Das Segment trägt den gelesenen Baum (`ast`) mit, damit die Anzeige jede
// Eingabe auswertet, ohne den Text erneut zu lesen. Ein ungültiger Ausdruck
// bleibt als Segment mit `ast: null` stehen: Die Stelle zeigt leer und
// markiert, statt mit dem Text des Ausdrucks zu verschwinden oder ihn als
// Wert auszugeben.
//
// **Der Wert im Satz** (4T-002186, Entscheidung des Product Owners vom
// 2026-10-10): Steht ein Wert-Platzhalter innerhalb einer Textzeile, trägt sein
// Segment `imSatz: true`, und die Anzeige setzt den Wert in den Satz; steht er
// allein auf seiner Zeile, bleibt er auf eigener Zeile. Entschieden wird hier,
// weil allein die Zerlegung die Zeile kennt; die Anzeige sieht nur Segmente.
// Feld-Platzhalter bleiben in jeder Lage auf eigener Zeile.
//
// **Bedingte Bereiche** (4T-002186, E7.8, F5 Option A, S2): `{{when:<ausdruck>}}`
// und `{{end}}` sind Marker nur, wenn sie **allein auf ihrer Zeile** stehen
// (Leerraum davor und danach erlaubt); die Marker-Zeile selbst gehört nicht zum
// Text. Ein Marker mitten in einer Zeile ist kein Marker und wird wie ein
// unbekannter Platzhalter gemeldet, damit ein Bereich nie eine halbe Zeile
// umfasst (Story AK5). Ein Bereich wird ein Segment der Art `bereich` mit der
// Bedingung als Text, ihrem gelesenen Baum und seinen Kindern; der Körper ist
// damit ein Baum, dessen oberste Ebene weiterhin die Liste `segmente` ist.
// Verschachtelung läuft über einen Stapel offener Bereiche. Drei Fehlerbilder
// ohne Abbruch (S5): ein `end` ohne offenen Bereich wird gemeldet und seine
// Zeile übergangen; ein am Ende noch offener Bereich wird gemeldet, und sein
// Inhalt gilt als außerhalb des Bereichs, damit kein Inhalt verschwindet; eine
// Bedingung, die sich nicht lesen lässt, wird gemeldet, der Bereich bleibt mit
// `ast: null` stehen, und die Anzeige verbirgt ihn. Die Bedingung wirkt allein
// auf die Anzeige: `felderDesKoerpers` steigt in die Kinder hinab, sodass ein
// Feld in einem Bereich im Speicher-Auftrag bleibt, ob der Bereich sichtbar
// ist oder nicht (E7.8).
//
// **Verweis-Pfade** (4T-002252, F6 A, S8): Wert- und Bereichs-Segment tragen
// `pfad: true`, wenn ihr Ausdruck einen Pfad über ein Verweis-Feld nennt
// (`nenntVerweisPfad`), sonst fehlt die Angabe; die Anzeige wertet ein solches Segment über den Kanal
// `database:ausdruecke` im Haupt-Prozess aus, jedes andere lokal wie bisher.
// Ein Punkt-Name, dessen Kopf kein Feld der Definition ist, wird hier mit Zeile
// gemeldet (`formPfadUnbekannt`), weil allein die Zerlegung die Definition
// neben dem Ausdruck kennt.
//
// **Der Positions-Bereich** (4T-002253, Epic 3E-000262, F5 A, S6):
// `{{list:<Abfrage-Datei>}}` und `{{list:<Abfrage-Datei> BY <Verweis-Feld>}}`
// sind ein Segment der Art `liste` nur, wenn sie **allein auf ihrer Zeile**
// stehen, wie die Marker der Bereiche; die Zeile gehört dann nicht zum Text.
// Das Wort `BY` gilt ohne Rücksicht auf die Schreibung, wie bei `DISPLAY tree
// BY`. Mitten in einer Textzeile bleibt der Platzhalter Text und wird wie ein
// unbekannter Platzhalter gemeldet, damit ein Bereich nie in einem Satz steht.
// Aufgelöst wird hier nichts: Welche Abfrage-Datei gemeint ist und über welches
// Verweis-Feld die Positionen am Kopf hängen, weiß erst der Haupt-Prozess
// (`positions-auskunft.js`); dieses Modul bleibt prozess-neutral und liest
// keine Datei.
//
// **Hinweise statt Würfe** (weiche Linie wie beim Lesen der Definition). Ein
// Hinweis hat die Gestalt `{ code, name, zeile }`: `name` ist beim fremden
// Platzhalter der Inhalt der Klammern, beim unbekannten Feld der geschriebene
// Name, beim ungültigen Ausdruck und bei der Bedingung der Ausdruck, beim
// `end` ohne Bereich leer; `zeile` zählt ab 1. Den Satz dazu bildet der
// Bedienort über `database.hint.<code>` (`table-hinweise.js`).
//
// Blatt-nahes Modul: Es importiert `beschriftung.js` und, für Wert und
// Bedingung, `form-wert.js`. Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { loeseBeschriftung } = require('./beschriftung.js');
const { liesWertAusdruck, nenntVerweisPfad, unbekanntePfade } = require('./form-wert.js');

// Die Codes der Hinweise. Sie stehen zusätzlich im Katalog
// `table-hinweise.js`, damit der Wächter über die Sprachfassungen sie sieht;
// ein Prüffall hält beide Stellen deckungsgleich.
const FORM_HINWEISE = Object.freeze({
  platzhalterUnbekannt: 'formPlatzhalterUnbekannt',
  feldUnbekannt: 'formFeldUnbekannt',
  // 4T-002183: ein Wert-Platzhalter, dessen Ausdruck sich nicht lesen lässt.
  ausdruckUngueltig: 'formAusdruckUngueltig',
  // 4T-002186: die drei Fehlerbilder der bedingten Bereiche (S5).
  endOhneWhen: 'formEndOhneWhen',
  whenOhneEnd: 'formWhenOhneEnd',
  bedingungUngueltig: 'formBedingungUngueltig',
  // 4T-002252: ein Punkt-Name in Wert oder Bedingung, dessen Kopf kein Feld der
  // Definition ist.
  pfadUnbekannt: 'formPfadUnbekannt',
});

// Der Feld-Platzhalter: `field`, ein Doppelpunkt und der Name, mit optionalem
// Leerraum an jeder Fuge. Das Wort `field` ohne Rücksicht auf die Schreibung,
// wie die Vorlagen-Engine ihre Platzhalter-Namen liest.
const FELD_PLATZHALTER_RE = /^\s*field\s*:(.*)$/i;

// 4T-002183: Der Wert-Platzhalter, nach demselben Muster mit dem Wort `value`.
// Der Ausdruck ist der ganze Rest bis zum Schluss der Klammern.
const WERT_PLATZHALTER_RE = /^\s*value\s*:(.*)$/i;

// 4T-002186: Die beiden Marker eines bedingten Bereichs, nach demselben Muster.
const WHEN_MARKER_RE = /^\s*when\s*:(.*)$/i;
const END_MARKER_RE = /^\s*end\s*$/i;

// 4T-002253: Der Positions-Bereich, nach demselben Muster mit dem Wort `list`;
// danach die Abfrage-Datei und optional `BY` mit dem Verweis-Feld.
const LISTE_PLATZHALTER_RE = /^\s*list\s*:(.*)$/i;
const LISTE_BY_RE = /^(.*?)\s+by\s+(\S.*)$/i;

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

// 4T-002252 (Festlegung 1, 6): Ob ein gelesener Ausdruck einen Pfad über ein
// Verweis-Feld nennt, und je Punkt-Name mit unbekanntem Kopf ein Hinweis.
function pfadDes(ast, felder, zeile, hints) {
  for (const name of unbekanntePfade(ast, felder))
    hints.push({ code: FORM_HINWEISE.pfadUnbekannt, name, zeile });
  return ast !== null && nenntVerweisPfad(ast, felder);
}

// 4T-002183: Der Wert-Platzhalter als Segment. Ein ungültiger Ausdruck trägt
// zusätzlich einen Hinweis und bleibt mit `ast: null` als Segment stehen.
// 4T-002186: `imSatz` sagt, ob der Platzhalter innerhalb einer Textzeile steht.
// 4T-002252: `pfad: true` sagt, dass der Haupt-Prozess ihn auswertet; ohne
// Pfad fehlt die Angabe, damit ein Körper ohne Pfad dieselbe Gestalt behält.
function wertSegment(geschrieben, zeile, imSatz, felder, hints) {
  const ausdruck = geschrieben.trim();
  const ast = liesWertAusdruck(ausdruck);
  if (ast === null) hints.push({ code: FORM_HINWEISE.ausdruckUngueltig, name: ausdruck, zeile });
  const segment = { art: 'wert', ausdruck, ast, zeile, imSatz };
  if (pfadDes(ast, felder, zeile, hints)) segment.pfad = true;
  return segment;
}

// 4T-002186: Der Bereich als Segment. Eine Bedingung, die sich nicht lesen
// lässt, trägt einen Hinweis und bleibt mit `ast: null` stehen; die Anzeige
// verbirgt einen solchen Bereich.
function bereichSegment(geschrieben, zeile, felder, hints) {
  const bedingung = geschrieben.trim();
  const ast = liesWertAusdruck(bedingung);
  if (ast === null) hints.push({ code: FORM_HINWEISE.bedingungUngueltig, name: bedingung, zeile });
  const segment = { art: 'bereich', bedingung, ast, zeile, kinder: [] };
  if (pfadDes(ast, felder, zeile, hints)) segment.pfad = true;
  return segment;
}

// 4T-002253: Der Positions-Bereich als Segment, oder null, wenn der
// Platzhalter keine Abfrage-Datei nennt.
function listenSegment(geschrieben, zeile) {
  const innen = geschrieben.trim();
  const mitBy = LISTE_BY_RE.exec(innen);
  const datei = (mitBy ? mitBy[1] : innen).trim();
  if (datei === '') return null;
  return { art: 'liste', datei, by: mitBy ? mitBy[2].trim() : null, zeile };
}

// Steht der Platzhalter von `anfang` bis `ende` allein auf seiner Zeile, also
// mit höchstens Leerraum davor und danach?
function alleinAufZeile(quelle, anfang, ende) {
  const zeilenAnfang = quelle.lastIndexOf('\n', anfang - 1) + 1;
  let zeilenEnde = quelle.indexOf('\n', ende);
  if (zeilenEnde < 0) zeilenEnde = quelle.length;
  return (
    quelle.slice(zeilenAnfang, anfang).trim() === '' && quelle.slice(ende, zeilenEnde).trim() === ''
  );
}

// Aufeinanderfolgende Markdown-Segmente einer Liste zu einem verschmelzen,
// damit die Liste nach dem Auflösen eines offenen Bereichs dieselbe Gestalt hat
// wie ohne ihn.
function verschmelzeText(liste) {
  for (let k = liste.length - 1; k > 0; k -= 1) {
    if (liste[k].art === 'markdown' && liste[k - 1].art === 'markdown') {
      liste[k - 1] = { art: 'markdown', text: liste[k - 1].text + liste[k].text };
      liste.splice(k, 1);
    }
  }
}

/**
 * Zerlegt einen Masken-Körper in Markdown-, Feld-, Wert-, Bereichs- und Listen-Segmente
 * (E7.3, E7.8).
 *
 * @param {string} text Der Körper.
 * @param {Array<{name: string}>} fields Die Felder der Definition.
 * @returns {{segmente: Array<{art: 'markdown', text: string}|{art: 'feld', name: string}
 *   |{art: 'wert', ausdruck: string, ast: object|null, zeile: number, imSatz: boolean, pfad?: true}
 *   |{art: 'bereich', bedingung: string, ast: object|null, zeile: number, kinder: Array<object>,
 *   pfad?: true}|{art: 'liste', datei: string, by: string|null, zeile: number}>,
 *   hints: Array<{code: string, name: string, zeile: number}>}} Ein Feld-Segment
 *   trägt den kanonischen Namen der Definition, ein Wert-Segment seinen Ausdruck
 *   als Text, den gelesenen Baum (null, wenn er sich nicht lesen lässt), die
 *   Zeile im Körper und ob er innerhalb einer Textzeile steht; ein
 *   Bereichs-Segment seine Bedingung als Text, deren Baum, die Zeile seines
 *   Markers und seine Kinder in derselben Gestalt; aufeinanderfolgender Text
 *   steht in einem Segment.
 */
function zerlegeMaskenKoerper(text, fields) {
  const quelle = typeof text === 'string' ? text : '';
  const felder = Array.isArray(fields) ? fields : [];
  const segmente = [];
  const hints = [];
  // 4T-002186: Der Stapel offener Bereiche; geschrieben wird immer in die
  // Kinder des innersten, ohne offenen Bereich in die oberste Liste.
  const offen = [];
  const ziel = () => (offen.length > 0 ? offen[offen.length - 1].kinder : segmente);
  let literal = '';
  let zeile = 1;

  // Aufeinanderfolgender Text steht in EINEM Segment, auch wenn eine
  // übergangene Marker-Zeile ihn unterbricht.
  const schliesseText = () => {
    if (literal !== '') {
      const liste = ziel();
      const letztes = liste[liste.length - 1];
      if (letztes && letztes.art === 'markdown') letztes.text += literal;
      else liste.push({ art: 'markdown', text: literal });
    }
    literal = '';
  };

  // Eine Marker-Zeile gehört nicht zum Text: Der Leerraum davor seit dem
  // letzten Zeilenumbruch fällt weg, bevor der Text geschlossen wird, und der
  // Rest der Zeile samt Umbruch wird übersprungen.
  const schliesseTextVorMarker = () => {
    literal = literal.replace(/[^\n]*$/, '');
    schliesseText();
  };
  const uebergeheMarkerZeile = (ende) => {
    const zeilenEnde = quelle.indexOf('\n', ende);
    if (zeilenEnde < 0) return quelle.length;
    zeile += 1;
    return zeilenEnde + 1;
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
        const ende = schluss + SCHLUSS.length;
        const allein = alleinAufZeile(quelle, i, ende);
        const feld = FELD_PLATZHALTER_RE.exec(innen);
        const wert = feld ? null : WERT_PLATZHALTER_RE.exec(innen);
        const when = feld || wert ? null : WHEN_MARKER_RE.exec(innen);
        const end = feld || wert || when ? null : END_MARKER_RE.test(innen);
        const liste = feld || wert || when || end ? null : LISTE_PLATZHALTER_RE.exec(innen);
        const segment = liste && allein ? listenSegment(liste[1], zeile) : null;
        if (segment) {
          schliesseTextVorMarker();
          ziel().push(segment);
          i = uebergeheMarkerZeile(ende);
          continue;
        }
        if (when && allein) {
          schliesseTextVorMarker();
          const bereich = bereichSegment(when[1], zeile, felder, hints);
          ziel().push(bereich);
          offen.push(bereich);
          i = uebergeheMarkerZeile(ende);
          continue;
        }
        if (end && allein) {
          schliesseTextVorMarker();
          if (offen.length === 0) hints.push({ code: FORM_HINWEISE.endOhneWhen, name: '', zeile });
          else offen.pop();
          i = uebergeheMarkerZeile(ende);
          continue;
        }
        if (wert) {
          schliesseText();
          ziel().push(wertSegment(wert[1], zeile, !allein, felder, hints));
        } else if (!feld) {
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
            ziel().push({ art: 'feld', name });
          }
        }
        i = ende;
        continue;
      }
    }
    if (quelle[i] === '\n') zeile += 1;
    literal += quelle[i];
    i += 1;
  }
  schliesseText();
  // Ein am Ende offener Bereich wird gemeldet, und sein Inhalt gilt als
  // außerhalb des Bereichs: Das Segment weicht an seiner Stelle seinen Kindern,
  // von innen nach außen, damit kein Inhalt verschwindet (S5).
  while (offen.length > 0) {
    const bereich = offen.pop();
    hints.push({ code: FORM_HINWEISE.whenOhneEnd, name: bereich.bedingung, zeile: bereich.zeile });
    const eltern = ziel();
    eltern.splice(eltern.indexOf(bereich), 1, ...bereich.kinder);
    verschmelzeText(eltern);
  }
  return { segmente, hints };
}

/**
 * Die Felder, die ein Körper nennt, in Reihenfolge und ohne Doppelte — für den
 * Speicher-Auftrag (nur genannte Felder) und für die Prüfung einer Masken-Datei.
 * Ein Wert-Segment ist kein Feld und zählt nie (4T-002183, Story AK4); die
 * Kinder eines Bereichs zählen an seiner Stelle mit, unabhängig von seiner
 * Bedingung (4T-002186, E7.8).
 *
 * @param {Array<object>} segmente Ergebnis von `zerlegeMaskenKoerper`.
 * @returns {Array<string>} Kanonische Feld-Namen.
 */
function felderDesKoerpers(segmente) {
  const namen = [];
  const sammle = (liste) => {
    for (const segment of Array.isArray(liste) ? liste : []) {
      if (segment && segment.art === 'feld' && !namen.includes(segment.name))
        namen.push(segment.name);
      if (segment && Array.isArray(segment.kinder)) sammle(segment.kinder);
    }
  };
  sammle(segmente);
  return namen;
}

module.exports = {
  FORM_HINWEISE,
  feldPlatzhalter,
  erzeugeMaskenKoerper,
  zerlegeMaskenKoerper,
  felderDesKoerpers,
};
