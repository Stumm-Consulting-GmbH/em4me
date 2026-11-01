// 4T-002389 (Epic 3E-000265, Schritte 2 und 3): Der Dateikopf einer Karteikarte
// wird geschrieben, ohne ihn neu zu serialisieren.
//
// **Warum zeilenweise und nicht über `writeFrontmatter`.** Die Schreibfunktion
// des Eigenschaften-Panels (`writeFrontmatter` in `src/shared/markdown/
// frontmatter.js`) baut den ganzen Dateikopf neu und formatiert dabei
// Fluss-Listen um (Befund 4T-002358). Eine Änderung über die Datenbank darf aber
// allein die geänderten Felder berühren; Freitext, Anhänge-Verweise und fremde
// Angaben des Dateikopfs bleiben zeichengleich. Ersetzt werden deshalb nur die
// Zeilen der geänderten Angaben, wie das Zurückschreiben der Tabellen-Form nur
// die Zeile des betroffenen Datensatzes ersetzt (`record-write.js`).
//
// **Die Zeilen einer Angabe.** Eine Angabe beginnt mit einer Zeile in Spalte 0,
// die einen Schlüssel mit Doppelpunkt trägt, und umfasst alle folgenden Zeilen,
// die eingerückt sind oder mit einem Listen-Strich beginnen (eine Liste in
// Block-Form oder ein mehrzeiliger Text). Leere Zeilen gehören dazu, wenn danach
// noch eine solche Zeile folgt. Eine Angabe auf mehreren Zeilen wird damit
// vollständig ersetzt. Ein Schlüssel wird ohne Rücksicht auf die Schreibung
// gesucht; nennt der Dateikopf ihn zweimal, gilt wie beim Lesen die spätere
// Angabe, und nur sie wird ersetzt. Ihre Schreibung des Schlüssels bleibt.
// Fehlt die Angabe, kommt eine neue Zeile vor das schließende `---`.
//
// **Die Schreibweise eines Wertes.** Ein Text wird so geschrieben, dass er beim
// Lesen über dieselbe Auslegung (`extractFrontmatter` und
// `zellTextAusDateikopf`) wieder genau diesen Zell-Text ergibt: ohne
// Anführungszeichen, wo das trägt, sonst in doppelten Anführungszeichen nach
// JSON, das gültiges YAML ist. Ein Wahrheitswert einer Wahrheitswert-Spalte wird
// als `true` oder `false` geschrieben, ein leerer Wert als leere Angabe.
//
// Prozess-neutral (kein Electron, kein DOM, kein Dateizugriff).
'use strict';

const { extractFrontmatter } = require('../markdown/frontmatter.js');
const { DB_RECORD_KEY } = require('./behaelter.js');
const { karteikartenWerte, zellTextAusDateikopf } = require('./karteikarte.js');
const { DB_DEFAULT_COLUMN_TYPE } = require('./table-columns.js');
const { ART_ANLEGEN, ART_AENDERN } = require('./record-write.js');

// Codes, mit denen das Schreiben scheitert; der Aufrufer führt sie als Grund.
const KARTEIKARTE_SCHREIBEN_CODES = Object.freeze({
  dateikopfUnlesbar: 'karteikarteDateikopfUnlesbar',
  operationUnbekannt: 'karteikarteOperationUnbekannt',
});

// Eine Zeile in Spalte 0 mit Schlüssel und Doppelpunkt; der Schlüssel darf in
// Anführungszeichen stehen.
const SCHLUESSEL_ZEILE = /^(?:"([^"]*)"|'([^']*)'|([^\s#'"-][^:]*?))\s*:(?:\s|$)/;

function zeilenendeVon(text) {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

// Gehört eine Zeile zum Wert der Angabe davor (eingerückt oder Listen-Strich)?
function istFortsetzung(zeile) {
  return /^[ \t]/.test(zeile) || /^-(\s|$)/.test(zeile);
}

/**
 * Die Angaben eines Dateikopfs als Zeilen-Bereiche.
 *
 * @param {Array<string>} zeilen Die Zeilen zwischen den beiden `---`, ohne Zeilenende.
 * @returns {Array<{name: string, von: number, bis: number}>} `bis` ausschließlich.
 */
function angabenDer(zeilen) {
  const angaben = [];
  let i = 0;
  while (i < zeilen.length) {
    const treffer = SCHLUESSEL_ZEILE.exec(zeilen[i]);
    if (!treffer) {
      i += 1;
      continue;
    }
    const name = [treffer[1], treffer[2], treffer[3]].find((teil) => teil !== undefined);
    // Der Schlüssel, wie er geschrieben steht, samt Anführungszeichen.
    const roh = treffer[0].replace(/\s*:\s?$/, '');
    let bis = i + 1;
    let j = i + 1;
    while (j < zeilen.length) {
      if (istFortsetzung(zeilen[j])) {
        j += 1;
        bis = j;
      } else if (zeilen[j].trim() === '') {
        j += 1;
      } else break;
    }
    angaben.push({ name, roh, von: i, bis });
    i = bis;
  }
  return angaben;
}

// Liest ein Wert in dieser Schreibweise wieder als genau diesen Zell-Text?
function liestSichAls(type, schreibweise, text) {
  const gelesen = extractFrontmatter(`---\nk: ${schreibweise}\n---\n`);
  if (gelesen.parseError || !gelesen.data) return false;
  return zellTextAusDateikopf(type, gelesen.data.k) === text;
}

/**
 * Der Wert eines Feldes in der Schreibweise des Dateikopfs.
 *
 * @param {string} type Typ der Spalte.
 * @param {string} text Zell-Text.
 * @returns {string} Leer für einen leeren Wert.
 */
function wertSchreibweise(type, text) {
  const wert = String(text == null ? '' : text);
  if (type === 'boolean') {
    if (/^x$/i.test(wert)) return 'true';
    if (wert === '') return 'false';
  }
  if (wert === '') return '';
  if (!/[\r\n]/.test(wert) && liestSichAls(type, wert, wert)) return wert;
  return JSON.stringify(wert);
}

function angabeZeile(name, schreibweise) {
  return schreibweise === '' ? `${name}:` : `${name}: ${schreibweise}`;
}

/**
 * Ersetzt im Dateikopf allein die Zeilen der genannten Angaben.
 *
 * @param {string|null} text Der Text des Dokuments; null für ein neues.
 * @param {Array<{name: string, schreibweise: string}>} aenderungen Neue Werte
 *   in der Schreibweise des Dateikopfs (`wertSchreibweise`).
 * @returns {{ok: true, text: string}|{ok: false, code: string}} Ein Dokument ohne
 *   Dateikopf bekommt einen vor seinen ersten Zeichen; jedes übrige Zeichen bleibt.
 */
function ersetzeDateikopfAngaben(text, aenderungen) {
  const quelle = text === null ? '' : String(text);
  const eol = zeilenendeVon(quelle);
  const kopf = extractFrontmatter(quelle);
  if (kopf.raw === null) {
    const zeilen = aenderungen.map((a) => angabeZeile(a.name, a.schreibweise));
    return { ok: true, text: ['---', ...zeilen, '---'].join(eol) + eol + quelle };
  }
  if (kopf.parseError || kopf.data === null)
    return { ok: false, code: KARTEIKARTE_SCHREIBEN_CODES.dateikopfUnlesbar };

  // Der Dateikopf als Zeilen, ohne die beiden Zaun-Zeilen.
  const anfang = quelle.indexOf('\n') + 1;
  const ende = anfang + kopf.yamlText.length;
  const zeilen = kopf.yamlText === '' ? [] : kopf.yamlText.split('\n');
  const ohneCr = zeilen.map((z) => (z.endsWith('\r') ? z.slice(0, -1) : z));
  const angaben = angabenDer(ohneCr);

  // Von hinten nach vorn, damit frühere Bereiche ihre Stelle behalten.
  const ersetzungen = [];
  const anzufuegen = [];
  for (const aenderung of aenderungen) {
    const klein = aenderung.name.toLowerCase();
    const treffer = angaben.filter((a) => a.name.toLowerCase() === klein).pop();
    if (treffer) ersetzungen.push({ treffer, aenderung });
    else anzufuegen.push(angabeZeile(aenderung.name, aenderung.schreibweise));
  }
  ersetzungen.sort((a, b) => b.treffer.von - a.treffer.von);
  for (const { treffer, aenderung } of ersetzungen) {
    // Das Zeilenende der letzten ersetzten Zeile bleibt; die letzte Zeile des
    // Dateikopfs trägt keines, weil es zum schließenden Zaun gehört.
    const cr = zeilen[treffer.bis - 1].endsWith('\r') ? '\r' : '';
    const zeile = angabeZeile(treffer.roh, aenderung.schreibweise) + cr;
    zeilen.splice(treffer.von, treffer.bis - treffer.von, zeile);
  }
  const cr = eol === '\r\n' ? '\r' : '';
  for (const zeile of anzufuegen) {
    if (zeilen.length > 0) zeilen[zeilen.length - 1] += cr;
    zeilen.push(zeile);
  }
  const neuerKopf = zeilen.join('\n');
  // Ein leerer Dateikopf (`---` unmittelbar gefolgt von `---`) hat keine Zeile,
  // an die der neue Inhalt grenzt; sein Zeilenende kommt hinzu.
  if (kopf.yamlText === '')
    return { ok: true, text: quelle.slice(0, anfang) + neuerKopf + eol + quelle.slice(anfang) };
  return { ok: true, text: quelle.slice(0, anfang) + neuerKopf + quelle.slice(ende) };
}

// Die Feld-Zeilen einer Operation: je genannter Zelle ihr Feld und ihr Wert.
function aenderungenDer(felder, zellen, nurGeaenderte) {
  const aenderungen = [];
  felder.forEach((feld, i) => {
    if (zellen[i] === undefined) return;
    if (nurGeaenderte && nurGeaenderte[i] === zellen[i]) return;
    const type = (feld && feld.type) || DB_DEFAULT_COLUMN_TYPE;
    aenderungen.push({ name: feld.name, schreibweise: wertSchreibweise(type, zellen[i]) });
  });
  return aenderungen;
}

// Ein neues Dokument: Kennung, danach jedes Feld der Tabelle, leer oder mit
// seinem Wert.
function neueKarteikarte(id, felder, zellen) {
  const zeilen = [angabeZeile(DB_RECORD_KEY, id)];
  felder.forEach((feld, i) => {
    const type = (feld && feld.type) || DB_DEFAULT_COLUMN_TYPE;
    const text = zellen[i] === undefined ? '' : zellen[i];
    const schreibweise = text === '' ? '' : wertSchreibweise(type, text);
    zeilen.push(angabeZeile(feld.name, schreibweise));
  });
  return ['---', ...zeilen, '---', ''].join('\n');
}

/**
 * Der neue Text einer Karteikarte nach den Operationen eines Auftrags.
 *
 * - **Ändern:** allein die genannten (geänderten) Felder; alles Übrige bleibt.
 * - **Anlegen ohne Text:** ein neues Dokument mit Kennung und allen Feldern.
 * - **Anlegen mit Text** (ein Dokument wird als Karteikarte aufgenommen): die
 *   Kennung, dazu allein die Felder, deren Wert vom vorgefundenen abweicht.
 * - **Anlegen als Kopie** (4T-002405, ohne Text, mit `datei.vorlage`): der Text
 *   der Vorlage mit der neuen Kennung an der Stelle der alten, dazu allein die
 *   Felder, deren Wert von dem der Vorlage abweicht (der Schlüssel); Freitext
 *   und fremde Angaben der Vorlage bleiben zeichengleich.
 *
 * @param {{text: string|null, vorlage?: string}} datei Die Datei der Karteikarte.
 * @param {Array<object>} felder Die Felder der Tabelle.
 * @param {Array<{art: string, id: string, zellen: Array<string>}>} operationen
 * @returns {{ok: true, text: string}|{ok: false, code: string}}
 */
function schreibeKarteikarte(datei, felder, operationen) {
  let text = datei.text;
  for (const operation of operationen) {
    if (operation.art === ART_AENDERN) {
      const gebaut = ersetzeDateikopfAngaben(text, aenderungenDer(felder, operation.zellen));
      if (!gebaut.ok) return gebaut;
      text = gebaut.text;
    } else if (
      operation.art === ART_ANLEGEN &&
      text === null &&
      typeof datei.vorlage !== 'string'
    ) {
      text = neueKarteikarte(operation.id, felder, operation.zellen);
    } else if (operation.art === ART_ANLEGEN) {
      // Aufnehmen (vorhandener Text) und Kopie (Text der Vorlage) schreiben
      // gleich: Kennung setzen oder ersetzen, abweichende Felder ersetzen.
      if (text === null) text = datei.vorlage;
      const kopf = extractFrontmatter(text);
      const vorgefunden = karteikartenWerte(kopf.data, { fields: felder }).map((w) => w.text);
      const aenderungen = [
        { name: DB_RECORD_KEY, schreibweise: operation.id },
        ...aenderungenDer(felder, operation.zellen, vorgefunden),
      ];
      const gebaut = ersetzeDateikopfAngaben(text, aenderungen);
      if (!gebaut.ok) return gebaut;
      text = gebaut.text;
    } else {
      return { ok: false, code: KARTEIKARTE_SCHREIBEN_CODES.operationUnbekannt };
    }
  }
  return { ok: true, text };
}

module.exports = {
  KARTEIKARTE_SCHREIBEN_CODES,
  wertSchreibweise,
  ersetzeDateikopfAngaben,
  schreibeKarteikarte,
};
