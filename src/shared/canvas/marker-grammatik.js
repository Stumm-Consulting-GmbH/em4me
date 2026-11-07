// 4T-002509 (Epic 3E-000402): Lexikalische Hülle der zeilenweisen
// Marker-Blöcke — aus `canvas-core.js` herausgeschnitten, damit Canvas und
// Dashboard sie aus einer Quelle lesen (Regel «Erkennungen haben eine Heimat»
// der Entwicklungsrichtlinien, Kapitel 1).
//
// **Was die Hülle ist.** Ein Element beginnt mit einer Marker-Zeile, die in
// Spalte 0 mit `!` und einem Wort anfängt; alle folgenden Zeilen bis zum
// nächsten Marker sind sein Inhalt. Angaben stehen auf der Marker-Zeile als
// `name=wert`, ein Wert ist ein Wort ohne Leerraum oder steht in `"…"` mit
// `\"` und `\` als Escapes. Eine Inhalts-Zeile, die in Spalte 0 mit `!`
// beginnen soll, wird mit einem vorangestellten Rückstrich geschützt. Zeilen
// werden nur an `\n` getrennt, ein `\r` bleibt stehen.
//
// **Was sie nicht ist.** Welche Marker es gibt, welche Angaben sie tragen und
// was ein Befund ist, weiß allein der Kern des jeweiligen Blocks
// (`canvas-core.js`, `dashboard/dashboard-core.js`). Die Hülle kennt keine
// Wörter des Wortschatzes und erzeugt keine Befunde.
//
// Die Rümpfe ab «Eine Marker-Zeile beginnt» bis `packeWert` stehen hier
// byte-gleich wie zuvor im Canvas-Kern; neu ist allein `leseAngaben`, die
// Schleife, die zuvor den Anfang von `lesMarkerAngaben` im Canvas-Kern bildete.
//
// Prozessneutral und abhängigkeitsfrei: kein Import, kein Electron, kein DOM,
// kein Datei-Zugriff.
'use strict';

// Eine Marker-Zeile beginnt in Spalte 0 mit `!`, gefolgt von einem Wort.
const MARKER_ZEILE_RE = /^!([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*))?$/;

// --- Zeilen-Werkzeug ----------------------------------------------------------
//
// Zeilen werden ausschließlich an `\n` getrennt und ein etwaiges `\r` bleibt
// **am Zeilenende stehen**. Der bequeme Weg über /\r?\n/ mit späterem Join
// auf '\n' würde eine Datei mit CRLF beim ersten Speichern vollständig
// umschreiben — und genau das verbietet AK3.
function trenneZeilen(text) {
  return String(text == null ? '' : text).split('\n');
}

// Zeilen-Inhalt ohne das Trenn-Artefakt, für alles Parsende.
function ohneCr(zeile) {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

// Vorherrschendes Zeilenende, damit neu erzeugte Zeilen zum Bestand passen.
function ermittleZeilenende(zeilen) {
  const mitCr = zeilen.filter((z) => z.endsWith('\r')).length;
  return mitCr > 0 && mitCr * 2 >= zeilen.length ? '\r\n' : '\n';
}

// --- Notausgang für zeilenführende Marker -------------------------------------
//
// Gelesen: `\!…` wird zu `!…`, `\\!…` zu `\!…`. Geschrieben: eine
// Inhalts-Zeile, die auf `\`* + `!` passt, bekommt genau einen Rückstrich
// davor. Der Entwurf des Konzepts nannte allein `\!`; damit wäre eine
// Inhalts-Zeile, die literal `\!` lauten soll, nicht ablegbar gewesen. Die
// Verallgemeinerung schließt die Lücke und bleibt umkehrbar.
const ESCAPE_RE = /^\\+!/;

function entschuetze(zeile) {
  return ESCAPE_RE.test(zeile) ? zeile.slice(1) : zeile;
}

function schuetze(zeile) {
  return /^\\*!/.test(zeile) ? '\\' + zeile : zeile;
}

// --- Attribut-Grammatik --------------------------------------------------------
//
// Ein Wert ist entweder ein Wort ohne Leerraum oder eine Zeichenkette in
// doppelten Anführungszeichen mit `\"` und `\\` als Escapes.
function tokenisiere(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    let tok = '';
    let inQuote = false;
    while (i < text.length) {
      const ch = text[i];
      if (inQuote) {
        if (ch === '\\' && i + 1 < text.length) {
          tok += ch + text[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') inQuote = false;
        tok += ch;
        i++;
        continue;
      }
      if (/\s/.test(ch)) break;
      if (ch === '"') inQuote = true;
      tok += ch;
      i++;
    }
    tokens.push(tok);
  }
  return tokens;
}

function entpackeWert(roh) {
  if (roh.length >= 2 && roh.startsWith('"') && roh.endsWith('"')) {
    return roh.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return roh;
}

// 4T-001746: `immerQuoten` erzwingt die Anführungszeichen auch dort, wo der
// Wert sie technisch nicht bräuchte. Die beiden Verweis-Angaben der Karte (G7,
// G8) stehen **immer** in doppelten Anführungszeichen — so schreibt sie das
// Konzept-Dokument, so liest sich ein Ziel als Ziel und nicht als Wort, und ein
// Ziel mit Leerzeichen sieht in der Datei nicht anders aus als eines ohne.
// Gelesen wird beides unverändert; die Zusage berührt allein die kanonische
// Form und damit nur geänderte und neue Elemente (G2).
function packeWert(wert, { immerQuoten = false } = {}) {
  const text = String(wert == null ? '' : wert);
  if (!immerQuoten && text !== '' && !/[\s"\\=]/.test(text)) return text;
  return '"' + text.replace(/([\\"])/g, '\\$1') + '"';
}

/**
 * Zerlegt den Rest einer Marker-Zeile in Angaben und Stellungs-Operanden.
 *
 * Eine Angabe ist ein Token mit `=` an einer Stelle hinter dem ersten Zeichen,
 * dessen Name kein Anführungszeichen trägt; ihr Wert wird entpackt in
 * `el.attrs` geschrieben und ihr Name beim ersten Auftreten an `el.attrFolge`
 * angehängt. Eine zweite Angabe desselben Namens überschreibt den Wert und
 * behält die Stelle der ersten. Unbekannte Angaben landen ebenso in `attrs`;
 * ob ein Name bekannt ist, entscheidet der Kern des Blocks.
 *
 * @param {{attrs: object, attrFolge: string[]}} el Element, das die Angaben aufnimmt.
 * @param {string} [rest] Text der Marker-Zeile hinter dem Marker-Wort.
 * @returns {string[]} die übrigen Tokens als Stellungs-Operanden, in ihrer Reihenfolge.
 */
function leseAngaben(el, rest) {
  const operanden = [];
  for (const tok of tokenisiere(rest || '')) {
    const gleich = tok.indexOf('=');
    if (gleich > 0 && !tok.slice(0, gleich).includes('"')) {
      const name = tok.slice(0, gleich);
      if (!el.attrFolge.includes(name)) el.attrFolge.push(name);
      el.attrs[name] = entpackeWert(tok.slice(gleich + 1));
      continue;
    }
    operanden.push(tok);
  }
  return operanden;
}

module.exports = {
  MARKER_ZEILE_RE,
  trenneZeilen,
  ohneCr,
  ermittleZeilenende,
  entschuetze,
  schuetze,
  tokenisiere,
  entpackeWert,
  packeWert,
  leseAngaben,
};
