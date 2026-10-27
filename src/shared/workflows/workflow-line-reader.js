// 4T-002347 (Epic 3E-000184): Der Zeilen-Leser der Workflow-Blöcke (G2 bis G4).
//
// Er zerlegt eine Befehls-Zeile in Schlüsselwort und Bausteine und weiß nichts
// über die Befehle; ob ein Baustein passt, entscheidet der Prüfer am Katalog.
// Die Hervorhebung im Editor (4T-002351) liest dieselben Bausteine samt ihrer
// Lage, damit es keinen zweiten Erkenner gibt.
//
// **Die Regeln** (Grammatik der Konzept-Stufe, Paket 2, freigegeben am
// 2026-10-22; Ausgestaltung der Grenzfälle in diesem Task):
//
//   G2 Eine Zeile ist ein Befehl. Leere Zeilen und Zeilen, deren erstes
//      Nicht-Leerzeichen `#` ist, sind Kommentar; einen Kommentar hinter einem
//      Befehl gibt es nicht. Leerraum am Zeilenanfang ist erlaubt.
//   G3 Bausteine sind durch Leerzeichen oder Tabulator getrennt. Texte stehen in
//      doppelten Anführungszeichen; `\"` ist ein Anführungszeichen im Text,
//      jeder andere Rückstrich bleibt stehen (Entscheidung der Sitzung vom
//      2026-10-22, O7). Damit bleibt `\{{` die Escape-Schreibweise der
//      Vorlagen-Engine; die Grenze ist, dass ein Text nicht mit einem
//      Rückstrich enden kann. Wörter (Zahlen, Kennungen, Options-Namen) stehen
//      ohne Anführungszeichen.
//   G4 Ein Feld-Wert-Paar schreibt sich `feld="Wert"`, ohne Leerraum um das
//      Gleichheitszeichen.
//
// Typografische Anführungszeichen am Anfang eines Bausteins sind ein eigener
// Fehler, weil Textverarbeitungen sie beim Kopieren einsetzen und ein Anwender
// den Unterschied sonst nicht sieht.
//
// Lage: `from` und `to` sind Offsets in der Zeile (Anfang inklusive, Ende
// exklusiv); Befunde nennen die Spalte ab 1.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const TYPOGRAFISCHE_ANFUEHRUNG = new Set(['\u201E', '\u201C', '\u201D', '\u00AB', '\u00BB']);

const istTrenner = (zeichen) => zeichen === ' ' || zeichen === '\t';

function fehler(code, offset) {
  return { ok: false, error: { code, column: offset + 1 } };
}

// Liest einen Text ab dem öffnenden Anführungszeichen an `start`.
// Liefert { ende, wert } (ende = Offset hinter dem schließenden Zeichen) oder null.
function liesText(zeile, start) {
  let wert = '';
  let i = start + 1;
  while (i < zeile.length) {
    const zeichen = zeile[i];
    if (zeichen === '\\' && zeile[i + 1] === '"') {
      wert += '"';
      i += 2;
      continue;
    }
    if (zeichen === '"') return { ende: i + 1, wert };
    wert += zeichen;
    i++;
  }
  return null;
}

/**
 * Zerlegt eine Befehls-Zeile.
 *
 * @param {string} text die Zeile ohne Zeilenende (ein `\r` am Ende fällt weg).
 * @returns {{ok: true, statement: null}
 *   | {ok: true, statement: {keyword: string, from: number, to: number, tokens: object[]}}
 *   | {ok: false, error: {code: string, column: number}}}
 *   `statement` ist null bei einer leeren Zeile und einem Kommentar; jeder
 *   Baustein ist `{ type: 'word'|'string'|'pair', value, key?, from, to }`.
 */
function readLine(text) {
  const zeile = String(text == null ? '' : text).replace(/\r$/, '');
  const bausteine = [];
  let i = 0;
  while (i < zeile.length) {
    const zeichen = zeile[i];
    if (istTrenner(zeichen)) {
      i++;
      continue;
    }
    if (bausteine.length === 0 && zeichen === '#') return { ok: true, statement: null };
    if (TYPOGRAFISCHE_ANFUEHRUNG.has(zeichen)) return fehler('typographicQuote', i);
    const start = i;
    let baustein;
    if (zeichen === '"') {
      const gelesen = liesText(zeile, i);
      if (!gelesen) return fehler('unclosedQuote', i);
      baustein = { type: 'string', value: gelesen.wert, from: start, to: gelesen.ende };
      i = gelesen.ende;
    } else {
      while (i < zeile.length && !istTrenner(zeile[i]) && zeile[i] !== '"') i++;
      if (zeile[i] === '"') {
        const name = zeile.slice(start, i - 1);
        const paar = i - 1 > start && zeile[i - 1] === '=' && !name.includes('=');
        if (!paar) return fehler('unexpectedQuote', i);
        const gelesen = liesText(zeile, i);
        if (!gelesen) return fehler('unclosedQuote', i);
        baustein = { type: 'pair', key: name, value: gelesen.wert, from: start, to: gelesen.ende };
        i = gelesen.ende;
      } else {
        baustein = { type: 'word', value: zeile.slice(start, i), from: start, to: i };
      }
    }
    // Hinter einem Text muss ein Trenner oder das Zeilenende stehen.
    if (i < zeile.length && !istTrenner(zeile[i])) return fehler('separatorExpected', i);
    bausteine.push(baustein);
  }
  if (bausteine.length === 0) return { ok: true, statement: null };
  const [erster, ...rest] = bausteine;
  if (erster.type !== 'word') return fehler('keywordExpected', erster.from);
  return {
    ok: true,
    statement: { keyword: erster.value, from: erster.from, to: erster.to, tokens: rest },
  };
}

/**
 * Liest die Zeilen eines Workflow-Blocks.
 *
 * @param {string[]} lines die Zeilen des Block-Inhalts.
 * @param {number} firstLine Zeilennummer der ersten Inhalts-Zeile im Dokument (ab 1).
 * @returns {{statements: object[], findings: object[]}} Anweisungen je
 *   `{ line, blockLine, keyword, from, to, tokens }`, Befunde je
 *   `{ code, line, blockLine, column, detail }`.
 */
function readBlock(lines, firstLine) {
  const statements = [];
  const findings = [];
  (lines || []).forEach((text, index) => {
    const line = firstLine + index;
    const blockLine = index + 1;
    const gelesen = readLine(text);
    if (!gelesen.ok) {
      findings.push({
        code: gelesen.error.code,
        line,
        blockLine,
        column: gelesen.error.column,
        detail: {},
      });
      return;
    }
    if (gelesen.statement) statements.push({ line, blockLine, ...gelesen.statement });
  });
  return { statements, findings };
}

module.exports = { readBlock, readLine };
