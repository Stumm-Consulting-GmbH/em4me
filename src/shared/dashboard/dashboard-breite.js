// 4T-002509 (Epic 3E-000402): Breiten der Kacheln eines Dashboards —
// Breiten-Wörter und Zwölftel-Rechnung nach Abschnitt 1.4 der Konzept-Stufe
// (4T-002506).
//
// **Das Raster hat zwölf Teile** (V4): `ganz` = 12, `halb` = 6, `drittel` = 4,
// `viertel` = 3 Zwölftel, dazu `n/12` mit n von 1 bis 12. Ein nacktes `n` wird
// gleichbedeutend gelesen und kanonisch als `n/12` geschrieben. Ein ungültiger
// Wert ist ein Befund (`breiteUnbekannt` im Format-Kern) und wirkt wie keine
// Angabe; die Kacheln ohne Angabe teilen sich zu gleichen Teilen, was die
// Kacheln mit Angabe übrig lassen.
//
// Das Modul rechnet nur. Wie eine Zeile umbricht, wenn die Summe über zwölf
// liegt, und wie schmal ein Fenster sein darf, entscheidet die Anzeige über
// ihre Flex-Zeile (Abschnitt 1.4, «Umsetzung als Flex-Zeile mit Umbruch»).
//
// Prozessneutral und abhängigkeitsfrei: kein Import, kein Electron, kein DOM.
'use strict';

// Teile einer vollen Zeile.
const RASTER = 12;

// Die vier Wörter in der Reihenfolge, in der Konzept und Handbuch sie nennen.
const BREITEN_WOERTER = Object.freeze({ ganz: 12, halb: 6, drittel: 4, viertel: 3 });

// `n/12` oder ein nacktes `n`, n höchstens zweistellig; der Bereich 1 bis 12
// wird danach geprüft, damit `0` und `13` als ungültig statt als unlesbar gelten.
const ZWOELFTEL_RE = /^(\d{1,2})(\/12)?$/;

/**
 * Liest eine Breiten-Angabe.
 *
 * Groß- und Kleinschreibung zählen wie beim übrigen Wortschatz des Blocks:
 * `Halb` ist kein Breiten-Wort. Leerraum am Rand ist kein Teil des Wertes und
 * kommt nur über eine Angabe in Anführungszeichen herein; er macht den Wert
 * ungültig, statt still abgeschnitten zu werden.
 *
 * @param {string|null|undefined} wert Rohwert der Angabe `breite=`.
 * @returns {{zwoelftel: number|null, gueltig: boolean}} `zwoelftel` ist `null`
 *   ohne Angabe und bei einem ungültigen Wert; `gueltig` ist nur bei einem
 *   vorhandenen, nicht lesbaren Wert `false`.
 */
function leseBreite(wert) {
  if (wert == null) return { zwoelftel: null, gueltig: true };
  const text = String(wert);
  if (Object.prototype.hasOwnProperty.call(BREITEN_WOERTER, text)) {
    return { zwoelftel: BREITEN_WOERTER[text], gueltig: true };
  }
  const treffer = ZWOELFTEL_RE.exec(text);
  if (treffer) {
    const n = Number(treffer[1]);
    if (n >= 1 && n <= RASTER) return { zwoelftel: n, gueltig: true };
  }
  return { zwoelftel: null, gueltig: false };
}

/**
 * Kanonische Schreibweise einer Breiten-Angabe für ein geändertes Element.
 *
 * Nur das nackte `n` hat eine abweichende kanonische Form (`n/12`). Wörter und
 * `n/12` bleiben, wie sie sind, und ein ungültiger Wert bleibt als Rohtext
 * stehen: Er darf nicht dadurch verschwinden, dass jemand die Kachel ändert
 * (Canvas-Regel G1 sinngemäß).
 *
 * @param {string} wert Rohwert der Angabe.
 * @returns {string}
 */
function kanonischeBreite(wert) {
  const text = String(wert == null ? '' : wert);
  const treffer = ZWOELFTEL_RE.exec(text);
  if (!treffer || treffer[2]) return text;
  const n = Number(treffer[1]);
  return n >= 1 && n <= RASTER ? n + '/' + RASTER : text;
}

/**
 * Verteilt die Breiten einer Zeile.
 *
 * Kacheln mit gültiger Angabe behalten ihre Zwölftel. Die übrigen teilen sich
 * den Rest zu gleichen Teilen; ohne jede Angabe teilen sich alle die volle
 * Breite. Der Anteil darf gebrochen sein (fünf Kacheln ohne Angabe ergeben je
 * 2,4 Zwölftel), weil die Anzeige ihn als wachsende Basis einer Flex-Zeile und
 * nicht als Spalten-Zahl eines Gitters nutzt.
 *
 * **Bleibt kein Rest** (die Angaben summieren sich auf zwölf oder mehr), bricht
 * die Flex-Zeile um, und die Kacheln ohne Angabe teilen sich die neue Zeile;
 * die Rechnung gibt ihnen deshalb je `12 / k` statt null.
 *
 * @param {Array<number|null>} angaben je Kachel die gelesenen Zwölftel oder `null`.
 * @returns {Array<{zwoelftel: number, fest: boolean}>} je Kachel in derselben
 *   Reihenfolge; `fest` sagt, ob der Anteil aus einer Angabe stammt.
 */
function verteileBreiten(angaben) {
  const liste = Array.isArray(angaben) ? angaben : [];
  const fest = liste.filter((z) => typeof z === 'number');
  const frei = liste.length - fest.length;
  const rest = RASTER - fest.reduce((summe, z) => summe + z, 0);
  const anteil = frei === 0 ? 0 : (rest > 0 ? rest : RASTER) / frei;
  return liste.map((z) =>
    typeof z === 'number' ? { zwoelftel: z, fest: true } : { zwoelftel: anteil, fest: false },
  );
}

module.exports = {
  RASTER,
  BREITEN_WOERTER,
  leseBreite,
  kanonischeBreite,
  verteileBreiten,
};
