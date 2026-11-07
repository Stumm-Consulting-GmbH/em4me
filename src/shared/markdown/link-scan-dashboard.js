// 4T-002517 (Epic 3E-000402): Die Angabe `abfrage=` einer Dashboard-Kachel als
// Verweis auf eine Abfrage-Datei (Story 4S-001183, AK5). Drei Stellen müssen
// dieselben Stellen finden: der Verweis-Parser des Bereichs-Index
// (src/main/index/parse.js), der Umschreibe-Kern beim Umbenennen
// (src/shared/link-rewrite.js) und das Bedienfeld der ausgehenden Verweise
// (src/renderer/modules/panels/panel-outgoing.js). Alle drei lesen allein
// `dashboardVerweisFunde`, weitergereicht über link-scan.js wie die Regel der
// Kopf-Block-Verweise (Muster aus 3E-000403).
//
// **Erkannt wird über den Format-Kern, nicht über eine zweite Grammatik**
// (Entscheidung der Sitzung vom 2026-11-03). `findDashboardFences` findet die
// Blöcke nach der Zaun-Regel, `parseDashboardFence` liest die Elemente; ob eine
// Zeile eine Kachel ist und welcher Wert ihre Angabe `abfrage=` trägt, sagt
// damit dieselbe Stelle, die auch die Anzeige zeichnet. Anders als bei der
// Canvas-Karte (link-scan.js, «Warum der Canvas-Kern hier nicht geladen wird»)
// hängt die Erkennungs-Schicht hier also am Kern. Die Kosten im Index bleiben
// klein, weil der Kern nur für Dateien läuft, die die Info-Zeichenfolge des
// Blocks überhaupt enthalten.
//
// **Die Spanne des Werts** braucht der Umschreiber. Sie kommt aus der Zerlegung
// der Hülle (`tokenisiere` aus marker-grammatik.js): Jedes Token ist dort ein
// zusammenhängender Ausschnitt der Zeile, seine Lage ergibt sich also aus der
// Folge der Tokens und dem Leerraum dazwischen. Wirksam ist wie im Kern das
// letzte Vorkommen der Angabe.
//
// **Welche Kacheln zählen:** jede `!kachel` mit nicht leerer Angabe `abfrage=`,
// unabhängig von ihrer Art und von Befunden wie `quelleDoppelt` oder
// `textMitQuelle`. Was in der Datei steht, nennt die Abfrage-Datei; der Nachzug
// beim Umbenennen darf eine Angabe nicht veralten lassen, nur weil die Anzeige
// sie gerade übergeht (Muster der Canvas-Karte, deren `doc=` ebenso
// unabhängig von Befunden zählt).
//
// Prozessneutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const {
  DASHBOARD_FENCE,
  findDashboardFences,
  parseDashboardFence,
} = require('../dashboard/dashboard-core.js');
const {
  MARKER_ZEILE_RE,
  ohneCr,
  tokenisiere,
  entpackeWert,
} = require('../canvas/marker-grammatik.js');

const ANGABE = 'abfrage';

// Spanne einer Angabe auf einer Marker-Zeile, wenn sie dort steht.
const OHNE_SPANNE = Object.freeze({
  nameStart: -1,
  rohStart: -1,
  rohLen: 0,
  rohWert: '',
  quotiert: false,
});

/**
 * Lage des letzten Vorkommens der Angabe `name=` auf einer Marker-Zeile.
 *
 * @param {string} zeile Marker-Zeile ohne Zeilenende.
 * @param {string} name Name der Angabe.
 * @returns {{nameStart: number, rohStart: number, rohLen: number, rohWert: string, quotiert: boolean}}
 */
function angabeSpanne(zeile, name) {
  const text = ohneCr(String(zeile == null ? '' : zeile));
  const treffer = MARKER_ZEILE_RE.exec(text);
  if (!treffer || treffer[2] === undefined) return OHNE_SPANNE;
  let pos = text.length - treffer[2].length;
  let spanne = OHNE_SPANNE;
  for (const tok of tokenisiere(treffer[2])) {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    const start = pos;
    pos += tok.length;
    const gleich = tok.indexOf('=');
    // Dieselbe Bedingung wie `leseAngaben` der Hülle: ein '=' an Position 0 ist
    // kein Name, ein Anführungszeichen im Namens-Teil keine Angabe.
    if (gleich <= 0 || tok.slice(0, gleich).includes('"')) continue;
    if (tok.slice(0, gleich) !== name) continue;
    const rohWert = tok.slice(gleich + 1);
    spanne = {
      nameStart: start,
      rohStart: start + gleich + 1,
      rohLen: rohWert.length,
      rohWert,
      quotiert: rohWert.length >= 2 && rohWert.startsWith('"') && rohWert.endsWith('"'),
    };
  }
  return spanne;
}

/**
 * Die Verweise der Kacheln mit Abfrage-Datei in einem Text.
 *
 * @param {string[]} lines Alle Zeilen des Dokuments, ohne Zeilenende-Zeichen.
 * @param {number} [ab] 0-basierter Index der ersten Zeile des Körpers (hinter
 *   dem Kopf-Block); Blöcke davor zählen nicht.
 * @returns {Array<{zeilenIndex: number, wert: string, nameStart: number,
 *   rohStart: number, rohLen: number, rohWert: string, quotiert: boolean}>}
 *   je Kachel in Dokument-Reihenfolge: Zeile der Marker-Zeile (0-basiert in
 *   `lines`), der wirksame Wert und seine Spanne in der Zeile. Steht der Wert
 *   dort nicht wörtlich, ist `rohStart` -1, und der Umschreiber fasst ihn nicht an.
 */
function dashboardVerweisFunde(lines, ab = 0) {
  const funde = [];
  if (!Array.isArray(lines)) return funde;
  const erste = Math.max(0, ab | 0);
  let kandidat = false;
  for (let i = erste; i < lines.length && !kandidat; i++) {
    kandidat = String(lines[i]).includes(DASHBOARD_FENCE);
  }
  if (!kandidat) return funde;
  const text = lines.slice(erste).join('\n');
  for (const block of findDashboardFences(text)) {
    const model = parseDashboardFence(block.rumpf);
    for (const el of model.elemente) {
      if (el.art !== 'kachel') continue;
      const wert = el.attrs[ANGABE];
      if (wert == null || String(wert).trim() === '') continue;
      // Rumpf-Zeile 1 steht direkt unter der Zaun-Zeile (`startZeile`, ab 1).
      const zeilenIndex = erste + block.startZeile + el.zeile - 1;
      const spanne = angabeSpanne(lines[zeilenIndex], ANGABE);
      const passt = spanne.rohStart >= 0 && entpackeWert(spanne.rohWert) === String(wert);
      funde.push({ zeilenIndex, wert: String(wert), ...(passt ? spanne : OHNE_SPANNE) });
    }
  }
  return funde;
}

module.exports = { dashboardVerweisFunde, angabeSpanne };
