// 4T-001529 (Epic 3E-000175): Der Adress-Schutz der Tag-Erkennung — die eine
// Stelle, an der beide Seiten dieselbe Frage stellen.
//
// **Der Befund** (Konzept-Runde 4T-001523, an der echten Regel gemessen): Ein
// Fragment-Bezeichner in einer Web-Adresse galt als Tag. Belegt sind
// `https://beispiel.de/#abschnitt` -> Tag `abschnitt`,
// `<https://beispiel.de/#kapitel>` -> Tag `kapitel` und
// `[Text](https://beispiel.de/#anker)` -> Tag `anker`. Der bisherige Schutz
// deckte allein `](#anker)` ab, weil er die zwei Zeichen unmittelbar vor der
// Raute prueft; sobald zwischen `](` und der Raute eine Adresse steht, greift
// er nicht mehr.
//
// **Warum das mehr ist als ein falscher Panel-Eintrag:** Solange nur gelesen
// wird, steht ein Tag zu viel in der Liste. Sobald die Umbenennung schreibt,
// zerstoert dieselbe Luecke eine Adresse im Text des Anwenders. Deshalb steht
// dieser Schutz VOR der Umbenennung (Entscheidung E6 des Epics).
//
// **Warum eine gemeinsame Funktion und nicht zwei Fassungen** (Entscheidung der
// Umsetzung, im Task begruendet): Index- und Render-Seite tragen dieselbe
// Erkennungs-Regel bis heute getrennt ausgeschrieben. Doppelt gepflegte Regeln
// laufen auseinander — die Suche haelt genau diese Erfahrung in ihrem eigenen
// Kommentar fest. Die Frage wird deshalb einmal beantwortet und zweimal
// gestellt.
//
// **Seit 4T-001530 traegt dieses Modul die ganze Erkennung und nicht mehr nur
// den Adress-Schutz.** Der Fundstellen-Ermittler der Tag-Umbenennung muss
// dieselben Stellen finden, die der Index als Tag fuehrt — sonst benennte er
// etwas anderes um, als das Panel anzeigt. Die Alternative waere gewesen, die
// Kette im Ermittler nachzubauen; das haette genau die Doppelung geschaffen,
// die 4T-001529 eine Datei zuvor beseitigt hat. `parse.js` re-exportiert
// `TAG_RE` und `isValidTag` weiter, damit kein Aufrufer sich aendert.
'use strict';

const { maskInlineCode } = require('./markdown/link-scan.js');
const { extractFrontmatter } = require('./markdown/frontmatter.js');

// Ein Wort-Ende, an dem eine Adresse aufhoert: Weissraum oder Zeilenanfang.
// Alles dazwischen gehoert zum selben "Wort" wie die Raute.
const TRENNER = /\s/;

// 4T-000056: Inline-Tags `#tag` im Body. Der negative Lookbehind verhindert
// Treffer mitten in Woertern (`foo#bar`), nach `##` (Heading-Doppelhash) und im
// Markdown-Link-Ziel `](#anker)` (4T-000060). Was er NICHT leisten kann, ist
// der Adress-Schutz: Ein Lookbehind sieht so weit zurueck, wie er geschrieben
// ist, und eine Adresse ist beliebig lang (siehe `istInAdresse`).
const TAG_RE = /(?<![\p{L}\p{N}_#])(?<!\]\()#([\p{L}\p{N}_/-]+)/gu;
// 4T-000060: Hex-Farbcodes (3-, 4-, 6- oder 8-stellig) sind kein Tag —
// schliesst CSS-Notationen wie #fff, #ffffff, #c0392b aus.
const HEX_COLOR_RE = /^[0-9a-f]{3,8}$/i;
// 4T-000060: Ein Tag braucht mindestens einen Buchstaben, damit reine Zahlen
// (Issue-Referenzen, Fussnoten) nicht indexiert werden.
const TAG_LETTER_RE = /[\p{L}]/u;
// Fence-Zeilen: derselbe Marker-Begriff wie im Index.
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
// Ein Dokument ohne Tag-Feld braucht keine Stellen-Ermittlung.
const LEER_STELLEN = { stellen: [], feldOffset: 0 };

// 4T-001531: Die Zeichen-Regel eines Tags, aus TAG_RE herausgezogen. Sie steht
// dort in einer Zeichenklasse mitten im Ausdruck und ist von aussen nicht
// pruefbar; die Umbenennung braucht sie aber, bevor sie etwas sucht.
const TAG_ZEICHEN_RE = /^[\p{L}\p{N}_/-]+$/u;

/**
 * Taugt eine Eingabe als Tag-Name? (4T-001531, Akzeptanzkriterium AK2)
 *
 * **Die Pruefung laeuft vor der Vorschau und nicht erst beim Schreiben.** Ein
 * Name mit einem Leerzeichen oder einer Raute liesse sich zwar in jede Datei
 * schreiben — nur waere das Ergebnis danach kein Tag mehr, und der Anwender
 * haette seine Ordnung mit einem Zug verloren, statt sie umzubenennen.
 *
 * Gemessen wird an derselben Regel, an der die Erkennung misst: erlaubte
 * Zeichen wie in `TAG_RE`, dazu die Ausschluesse aus `isValidTag`.
 */
function istGueltigerTagName(name) {
  if (typeof name !== 'string') return false;
  const wert = name.trim();
  if (!wert) return false;
  if (!TAG_ZEICHEN_RE.test(wert)) return false;
  // Ein doppelter Schraegstrich erzeugte eine leere Ebene; die Erkennung liest
  // sie nicht als solche, die Abfrage-Sprache ebenso wenig.
  if (wert.includes('//')) return false;
  return isValidTag(wert);
}

/** 4T-000060: Ist ein Tag-Kandidat tatsaechlich ein Tag? */
function isValidTag(tag) {
  if (!tag) return false;
  if (tag.startsWith('/') || tag.endsWith('/')) return false;
  if (!TAG_LETTER_RE.test(tag)) return false;
  if (HEX_COLOR_RE.test(tag)) return false;
  return true;
}

/**
 * Eine Zeile fuer den Tag-Scan vorbereiten: Inline-Code, Wiki-Link-Spannen und
 * Attribut-Bloecke werden durch Leerzeichen ersetzt.
 *
 * **Die Offsets bleiben dabei erhalten** — maskiert wird laengengleich, nicht
 * geloescht. Nur so zeigt ein Treffer-Offset weiterhin auf die Stelle im
 * Original, und genau darauf setzt der Fundstellen-Ermittler auf.
 *
 * Die drei Maskierungen haben je ihren eigenen Anlass: Inline-Code (B-07),
 * damit `[[Beispiel]]` in Code keinen Backlink erzeugt; Wiki-Spannen (B-08),
 * damit `[[Ziel#Anker]]` kein Tag wird; Attribut-Bloecke (4T-000202), weil
 * `{#id}` eine ID-Angabe ist.
 */
function maskiereFuerTagScan(zeile) {
  return maskInlineCode(zeile)
    .replace(/\[\[[^\]\n]*\]\]/g, (m) => ' '.repeat(m.length))
    .replace(/\{[^{}\n]*\}/g, (m) => ' '.repeat(m.length));
}

/**
 * Steht die Raute an `position` innerhalb einer Web-Adresse?
 *
 * Geprueft wird das Stueck von der Raute rueckwaerts bis zum naechsten
 * Weissraum: Enthaelt es `://`, ist die Raute ein Fragment-Bezeichner und kein
 * Tag. Das trifft die nackte URL, die Form in spitzen Klammern und das
 * Markdown-Link-Ziel gleichermassen, weil in allen dreien das Schema im selben
 * Wort steht.
 *
 * **Warum das Schema und nicht die Klammer das Merkmal ist:** Eine Klammer vor
 * der Raute allein truege nicht — `(siehe #tag)` ist ein echtes Tag, und ein
 * Schutz, der es verschluckt, waere der teurere Fehler. Er wirkte still: Ein zu
 * weit gefasster Schutz nimmt Tags aus Panel, Vervollstaendigung und Abfragen,
 * ohne dass irgendwo eine Meldung erschiene.
 *
 * **Bewusst nicht erfasst** ist ein relatives Link-Ziel ohne Schema, etwa
 * `[Text](/pfad#anker)`. Dort fehlt genau das Merkmal, das eine Adresse von
 * einer gewoehnlichen Klammer unterscheidet; der Umfang dieses Vorgangs endet
 * beim vollen Schema (AK3 des Tasks).
 *
 * @param {string} text Die Zeile oder der Quelltext.
 * @param {number} position Index der Raute in `text`.
 * @returns {boolean} true, wenn die Raute zu einer Adresse gehoert.
 */
function istInAdresse(text, position) {
  if (typeof text !== 'string' || !Number.isInteger(position) || position < 0) return false;
  let anfang = position;
  while (anfang > 0 && !TRENNER.test(text.charAt(anfang - 1))) anfang--;
  return text.slice(anfang, position).includes('://');
}

// --- Fundstellen der Umbenennung (4T-001530) -----------------------------------------

/**
 * Trifft `kandidat` die Umbenennung von `alt`?
 *
 * Zwei Regeln aus den Epic-Entscheidungen. **Ohne Ruecksicht auf Gross- und
 * Kleinschreibung** (E3), weil der Tag-Index ohnehin so zusammenfasst; exakte
 * Treffer allein liessen einen Teil des Tags unter dem alten Namen stehen. Und
 * **der Teilbaum wandert mit** (E4): `alt/kind` gehoert dazu, weil die
 * Abfrage-Sprache einen Tag bereits als Praefix seiner Kinder auswertet und
 * eine Umbenennung ohne die Kinder genau diese Abfragen zerlegte.
 *
 * Der Schraegstrich ist dabei Bedingung: `projektil` ist ein eigener Tag und
 * kein Kind von `projekt`.
 *
 * @returns {null|{kind: boolean, rest: string}} null = kein Treffer.
 */
function trifft(kandidat, alt) {
  const k = kandidat.toLowerCase();
  const a = alt.toLowerCase();
  if (k === a) return { kind: false, rest: '' };
  if (k.startsWith(`${a}/`)) return { kind: true, rest: kandidat.slice(alt.length) };
  return null;
}

/**
 * Die Stellen der Werte des Feldes `tags` im Roh-Text des Frontmatters.
 *
 * **Warum eine Position, obwohl der Frontmatter-Weg gar nicht ueber Offsets
 * schreibt** (4T-001531): Die Vorschau zeigt jede Fundstelle mit ihrem Kontext
 * (Entscheidung E5), und Kontext heisst Zeile. Ein Frontmatter-Treffer ohne
 * Position waere in der Trefferliste die einzige Zeile ohne Herkunft — und
 * beim Anklicken die einzige, die nirgendwohin springt. Geschrieben wird
 * weiterhin ueber `writeFrontmatter`; diese Position ist reine Anzeige.
 *
 * Gesammelt wird in der Reihenfolge der YAML-Liste, damit der Index einer
 * Fundstelle hier wie dort dasselbe meint. Die drei Notationen des Feldes sind
 * abgedeckt: Block-Liste, Fluss-Liste und einzelner Skalar. Fuer einen Wert,
 * dessen Roh-Form sich nicht wiederfinden laesst, bleibt der Platz leer — der
 * Aufrufer faellt dann auf den Anfang des Feldes zurueck, statt eine falsche
 * Stelle zu behaupten.
 *
 * @param {object} fm Ergebnis von `extractFrontmatter`.
 * @returns {{stellen: Array<{offset: number, laenge: number}|null>, feldOffset: number}}
 */
function frontmatterTagStellen(fm) {
  if (!fm || typeof fm.raw !== 'string' || typeof fm.yamlText !== 'string') return LEER_STELLEN;
  // Der YAML-Block beginnt hinter der oeffnenden `---`-Zeile.
  const yamlOffset = fm.raw.indexOf('\n') + 1;
  if (yamlOffset <= 0) return LEER_STELLEN;

  const zeilen = fm.yamlText.split('\n');
  let zeilenOffset = 0;
  let feldZeile = -1;
  let feldOffset = 0;
  let restNachDoppelpunkt = '';
  let restOffset = 0;
  for (let i = 0; i < zeilen.length; i++) {
    const treffer = zeilen[i].match(/^tags[ \t]*:/);
    if (treffer) {
      feldZeile = i;
      feldOffset = yamlOffset + zeilenOffset;
      restNachDoppelpunkt = zeilen[i].slice(treffer[0].length);
      restOffset = feldOffset + treffer[0].length;
      break;
    }
    zeilenOffset += zeilen[i].length + 1;
  }
  if (feldZeile < 0) return LEER_STELLEN;

  const stellen = [];
  const fluss = restNachDoppelpunkt.match(/^[ \t]*\[(.*)\]/);
  if (fluss) {
    // Fluss-Liste `tags: [a, b]`: die Werte zwischen den Kommas.
    const inhalt = fluss[1];
    const inhaltOffset = restOffset + fluss[0].length - 1 - inhalt.length;
    let pos = 0;
    for (const roh of inhalt.split(',')) {
      stellen.push(stelleImStueck(roh, inhaltOffset + pos));
      pos += roh.length + 1;
    }
  } else if (restNachDoppelpunkt.trim() !== '') {
    // Einzelner Skalar `tags: projekt`.
    stellen.push(stelleImStueck(restNachDoppelpunkt, restOffset));
  } else {
    // Block-Liste: die folgenden Zeilen, solange sie eingerueckte Striche sind.
    let offset = feldOffset + zeilen[feldZeile].length + 1;
    for (let i = feldZeile + 1; i < zeilen.length; i++) {
      const zeile = zeilen[i];
      const strich = zeile.match(/^[ \t]*-[ \t]*/);
      if (!strich) {
        // Eine Leerzeile innerhalb des Blocks beendet ihn nicht; alles andere
        // ist der naechste Schluessel.
        if (zeile.trim() === '') {
          offset += zeile.length + 1;
          continue;
        }
        break;
      }
      stellen.push(stelleImStueck(zeile.slice(strich[0].length), offset + strich[0].length));
      offset += zeile.length + 1;
    }
  }
  return { stellen, feldOffset };
}

// Ein Wert-Stueck samt seiner Position: fuehrender und folgender Leerraum
// sowie umschliessende Anfuehrungszeichen gehoeren nicht zum Namen.
function stelleImStueck(roh, offset) {
  const vorne = roh.length - roh.trimStart().length;
  let wert = roh.trim();
  let start = offset + vorne;
  const erstes = wert.charAt(0);
  if ((erstes === '"' || erstes === "'") && wert.length >= 2 && wert.endsWith(erstes)) {
    wert = wert.slice(1, -1);
    start += 1;
  }
  if (!wert) return null;
  return { offset: start, laenge: wert.length };
}

/**
 * Fundstellen eines Tags in einem Dokument — die Grundlage der Umbenennung.
 *
 * **Zwei Listen und nicht eine**, weil die beiden Notationen verschiedene
 * SCHREIBWEGE haben: Der Fliesstext geht ueber die Ersetzen-Strecke aus
 * 3E-000169, die per Offset im Datei-Text arbeitet; das Frontmatter-Feld ist
 * strukturiert und geht ueber `writeFrontmatter`, damit Notation und
 * Reihenfolge des Blocks erhalten bleiben. Beide in einer Liste zu fuehren
 * verstellte genau diesen Unterschied.
 *
 * **Die Offsets zeigen auf den Namen, nicht auf die Raute.** Umbenannt wird der
 * Name; die Raute bleibt stehen, und ein Offset auf sie zwaenge jeden Aufrufer
 * zur selben Korrektur.
 *
 * @param {string} text Vollstaendiger Datei-Inhalt samt Frontmatter.
 * @param {string} alt Alter Tag-Name (ohne Raute).
 * @param {string} neu Neuer Tag-Name (ohne Raute).
 * @returns {{fliesstext: Array, frontmatter: Array}} Fundstellen je Notation.
 */
function ermittleFundstellen(text, alt, neu) {
  const leer = { fliesstext: [], frontmatter: [] };
  if (typeof text !== 'string' || !alt || !neu) return leer;

  // Der Frontmatter-Block wird vom Fliesstext-Scan ausgenommen: Seine Tags sind
  // Listen-Eintraege und keine Rauten-Treffer. Stuenden sie in beiden Listen,
  // zeigte die Vorschau eine Reichweite, die es nicht gibt.
  const fm = extractFrontmatter(text);
  const bodyOffset = fm.endOffset || 0;
  const body = text.slice(bodyOffset);

  const fliesstext = [];
  let zeilenOffset = bodyOffset;
  let inFence = false;
  let fenceChar = null;
  for (const zeile of body.split('\n')) {
    const fence = zeile.match(FENCE_RE);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      zeilenOffset += zeile.length + 1;
      continue;
    }
    if (inFence) {
      zeilenOffset += zeile.length + 1;
      continue;
    }
    const maskiert = maskiereFuerTagScan(zeile);
    TAG_RE.lastIndex = 0;
    let treffer;
    while ((treffer = TAG_RE.exec(maskiert)) !== null) {
      const name = treffer[1];
      if (istInAdresse(maskiert, treffer.index)) continue;
      if (!isValidTag(name)) continue;
      const passt = trifft(name, alt);
      if (!passt) continue;
      fliesstext.push({
        // Offset des NAMENS im Gesamttext: Treffer-Index plus die Raute.
        offset: zeilenOffset + treffer.index + 1,
        laenge: name.length,
        alt: name,
        neu: neu + passt.rest,
        kind: passt.kind,
        kontext: zeile.trim(),
      });
    }
    zeilenOffset += zeile.length + 1;
  }

  // Frontmatter: der Wert des Feldes `tags` — YAML-Liste oder einzelner String.
  // **Eine Komma-Kette ohne Listen-Notation bleibt EIN Schlagwort** (Abgrenzung
  // der Story): Der Index liest sie ebenso als einen Eintrag, und ein
  // Aufspalten erfaende eine Struktur, die der Anwender nicht geschrieben hat.
  const frontmatter = [];
  const rohTags = fm.data && fm.data.tags;
  const liste = Array.isArray(rohTags) ? rohTags : rohTags ? [rohTags] : [];
  // Die Positionen werden nur ermittelt, wenn das Feld ueberhaupt Werte hat —
  // der Regelfall ist ein Dokument ohne Tag-Feld, und er soll nichts kosten.
  const { stellen, feldOffset } = liste.length > 0 ? frontmatterTagStellen(fm) : LEER_STELLEN;
  for (const [index, wert] of liste.entries()) {
    if (typeof wert !== 'string') continue;
    const name = wert.trim();
    const passt = trifft(name, alt);
    if (!passt) continue;
    const stelle = stellen[index] || null;
    frontmatter.push({
      feld: 'tags',
      index,
      istListe: Array.isArray(rohTags),
      alt: name,
      neu: neu + passt.rest,
      kind: passt.kind,
      // Anzeige-Position der Vorschau. Ohne wiedergefundene Roh-Form zeigt sie
      // auf den Anfang des Feldes: die richtige Zeile, nur nicht das Wort.
      offset: stelle ? stelle.offset : feldOffset,
      laenge: stelle ? stelle.laenge : 4,
    });
  }

  return { fliesstext, frontmatter };
}

/**
 * Schreibt die Umbenennung in das Frontmatter-Feld eines Textes (4T-001531).
 *
 * **Der zweite Schreibweg neben den Offsets**, und der Grund dafür steht in
 * `ermittleFundstellen`: Das Feld ist strukturiert, die Ersetzen-Strecke
 * arbeitet über Positionen im Roh-Text, und ein Listen-Eintrag über seine
 * Position zu überschreiben ließe Notation und Reihenfolge des Blocks dem
 * Zufall. `writeFrontmatter` erhält beides samt Kommentaren.
 *
 * **Geteilt zwischen beiden Prozessen** — wie die Ersetzungs-Regel selbst
 * (`shared/ersetzen-kern.js`): Eine offene, geänderte Datei bekommt die
 * Umbenennung auf ihren Puffer im Anzeige-Prozess, jede andere auf der Platte
 * im Hauptprozess. Zwei Fassungen hätten dem Anwender erklärt werden müssen.
 *
 * **Die Auswahl kommt als Index-Liste, die neuen Werte nicht.** Sie werden hier
 * aus `alt` und `neu` neu ermittelt, auf genau dem Text, in den geschrieben
 * wird. Ein vom Aufrufer mitgeschickter Wert wäre eine zweite Quelle für
 * dieselbe Regel — und die einzige, die niemand mehr gegen den Bestand prüft.
 *
 * @param {string} text Vollständiger Datei-Inhalt.
 * @param {object} opts
 * @param {string} opts.alt Alter Tag-Name.
 * @param {string} opts.neu Neuer Tag-Name.
 * @param {number[]} opts.indizes Ausgewählte Einträge der YAML-Liste.
 * @param {Function} opts.schreibe `writeFrontmatter`; hereingereicht, damit
 *   dieses Modul frei von Schreib-Abhängigkeiten bleibt.
 * @returns {{ok: true, text: string, anzahl: number}|{ok: false, grund: string}}
 */
function benenneTagImFrontmatterUm(text, { alt, neu, indizes, schreibe }) {
  const gewaehlt = new Set(Array.isArray(indizes) ? indizes : []);
  if (gewaehlt.size === 0) return { ok: true, text, anzahl: 0 };
  if (typeof schreibe !== 'function') return { ok: false, grund: 'frontmatter' };

  const fund = ermittleFundstellen(text, alt, neu);
  const zuAendern = fund.frontmatter.filter((f) => gewaehlt.has(f.index));
  // Kein Treffer mehr an den gewählten Stellen: Der Text ist nicht der, auf dem
  // die Vorschau entstand. Gemeldet statt geraten — dieselbe Linie wie bei
  // einem Offset, an dem kein Fund beginnt.
  if (zuAendern.length !== gewaehlt.size) return { ok: false, grund: 'veraendert' };

  const fm = extractFrontmatter(text);
  const daten = fm.data && typeof fm.data === 'object' ? fm.data : null;
  if (!daten) return { ok: false, grund: 'veraendert' };
  const rohTags = daten.tags;
  const istListe = Array.isArray(rohTags);
  const liste = istListe ? [...rohTags] : rohTags ? [rohTags] : [];
  for (const eintrag of zuAendern) {
    if (typeof liste[eintrag.index] !== 'string') return { ok: false, grund: 'veraendert' };
    liste[eintrag.index] = eintrag.neu;
  }

  // Die ganze Map geht zurück, nicht nur das Feld: `writeFrontmatter` bildet
  // die Differenz und löschte jeden Schlüssel, den es nicht wiederfindet.
  const geschrieben = schreibe(text, { ...daten, tags: istListe ? liste : liste[0] });
  if (!geschrieben || geschrieben.ok !== true || typeof geschrieben.text !== 'string') {
    return { ok: false, grund: 'frontmatter' };
  }
  return { ok: true, text: geschrieben.text, anzahl: zuAendern.length };
}

module.exports = {
  istInAdresse,
  istGueltigerTagName,
  frontmatterTagStellen,
  benenneTagImFrontmatterUm,
  isValidTag,
  maskiereFuerTagScan,
  ermittleFundstellen,
  TAG_RE,
};
