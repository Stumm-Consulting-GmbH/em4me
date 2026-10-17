// 4T-002280 (Epic 3E-000348): Schrittweises Aufdecken von Listen-Punkten in
// Vorführung und Referenten-Ansicht (Story 4S-001077).
//
// **Was aufgedeckt wird:** die Listen-Punkte, die der Format-Kern als
// Aufdeck-Schritte kennzeichnet (Marke `*` statt `-`, `1)` statt `1.`; Ergebnis
// je Folie `aufdeckSchritte: { zahl, punkte: [{ zeile, punkt, schritt }] }`,
// `punkt` die Stelle unter allen Listen-Punkten der Folie in der Reihenfolge
// der `li` im gerenderten Inhalt, 4T-002277).
//
// **Wo:** nur, solange in der Spalte eine Vorführung läuft — im Vollbild
// (presentation-vorfuehrung.js) oder im eigenen Fenster samt
// Referenten-Ansicht (presentation-publikum.js); beide schalten den Modus hier
// an und aus. Ansicht «Folien», Übersicht, die nächste Folie der
// Referenten-Ansicht und beide Exporte zeigen jede Folie vollständig
// (Ausführungs-Entscheidung der Sitzung vom 2026-10-14 in 4T-002276).
//
// **Wie:** «weiter» deckt den nächsten Punkt auf und erst nach dem letzten die
// nächste Folie, «zurück» verbirgt den zuletzt aufgedeckten; eine rückwärts
// betretene Folie erscheint vollständig. Verborgen wird über `visibility` am
// Listen-Punkt selbst: Der Platz bleibt, die Folie springt beim Aufdecken
// nicht, die Verkleinerung (presentation-folie.js) misst die vollständige
// Folie, und die Angabe reist im Klon der Folie an das Publikums-Fenster.
// Ein verschachtelter Punkt erbt das Verbergen seines Eltern-Punkts.
//
// **Zustand:** je geöffnetem Dokument (WeakMap, Muster der Folie je Dokument
// in presentation-pane.js) die Folie und die Zahl der aufgedeckten Schritte;
// gehört der Stand zu einer anderen Folie, gilt er als 0.
'use strict';

/** Attribut am Artikel mit der Zahl der sichtbaren Aufdeck-Schritte. */
export const AUFDECK_ATTR = 'data-aufdeck-schritt';
/** Attribut an einem verborgenen Listen-Punkt. */
export const VERBORGEN_ATTR = 'data-aufdeck-verborgen';

// Spalten mit laufender Vorführung.
const aktiv = new Set();
// Je Dokument: { index, schritt }.
const stand = new WeakMap();

/** Die Aufdeck-Schritte einer Folie des Format-Kerns, robust gelesen. */
export function aufdeckSchritteVon(folie) {
  const a = folie && folie.aufdeckSchritte;
  const punkte = a && Array.isArray(a.punkte) ? a.punkte : [];
  const zahl = a && Number.isInteger(a.zahl) ? a.zahl : punkte.length;
  return { zahl: Math.max(0, zahl), punkte };
}

/**
 * Schaltet das Aufdecken für eine Spalte an oder aus; beide Male beginnt das
 * Dokument ohne Stand (beim Start ist die gezeigte Folie zugedeckt).
 *
 * @param {number} paneIdx
 * @param {boolean} an
 * @param {object|null} [tab] das vorgeführte Dokument.
 */
export function setzeAufdeckModus(paneIdx, an, tab = null) {
  if (an) aktiv.add(paneIdx);
  else aktiv.delete(paneIdx);
  if (tab) stand.delete(tab);
}

/** Läuft in der Spalte eine Vorführung mit Aufdecken? */
export function istAufdeckenAktiv(paneIdx) {
  return aktiv.has(paneIdx);
}

function schrittVon(tab, index) {
  const s = tab ? stand.get(tab) : null;
  return s && s.index === index ? s.schritt : 0;
}

/**
 * Wie viele Aufdeck-Schritte der Folie sind sichtbar? Ohne laufende
 * Vorführung alle.
 *
 * @param {number} paneIdx
 * @param {object} tab
 * @param {number} index
 * @param {object|null} folie
 * @returns {number}
 */
export function sichtbareSchritte(paneIdx, tab, index, folie) {
  const { zahl } = aufdeckSchritteVon(folie);
  if (!istAufdeckenAktiv(paneIdx)) return zahl;
  return Math.min(schrittVon(tab, index), zahl);
}

/**
 * Das Ziel eines Blätter-Schritts samt Aufdecken (4S-001077, AK2).
 *
 * Ohne laufende Vorführung blättert jeder Schritt eine Folie. Eine Zahl als
 * Richtung springt auf diese Folie (die Übersicht). An erster und letzter
 * Folie bleibt es ohne Fehler stehen.
 *
 * @param {object} angaben
 * @param {number} angaben.paneIdx
 * @param {object} angaben.tab
 * @param {Array<object>} angaben.folien
 * @param {number} angaben.jetzt gezeigte Folie, geklemmt.
 * @param {'weiter'|'zurueck'|'erste'|'letzte'|number} angaben.richtung
 * @returns {{index: number, geaendert: boolean}} geaendert: Folie oder
 *   Aufdeck-Schritt hat sich geändert.
 */
export function blaetterZiel({ paneIdx, tab, folien, jetzt, richtung }) {
  const anzahl = Array.isArray(folien) ? folien.length : 0;
  const klemme = (i) => (anzahl <= 0 ? 0 : Math.min(Math.max(0, i), anzahl - 1));
  const mitAufdecken = istAufdeckenAktiv(paneIdx) && !!tab;
  const schritt = mitAufdecken ? schrittVon(tab, jetzt) : 0;
  const zahl = aufdeckSchritteVon(folien && folien[jetzt]).zahl;
  if (mitAufdecken && richtung === 'weiter' && schritt < zahl) {
    stand.set(tab, { index: jetzt, schritt: schritt + 1 });
    return { index: jetzt, geaendert: true };
  }
  if (mitAufdecken && richtung === 'zurueck' && schritt > 0 && schritt <= zahl) {
    stand.set(tab, { index: jetzt, schritt: schritt - 1 });
    return { index: jetzt, geaendert: true };
  }
  let ziel = jetzt;
  if (richtung === 'weiter') ziel = jetzt + 1;
  else if (richtung === 'zurueck') ziel = jetzt - 1;
  else if (richtung === 'erste') ziel = 0;
  else if (richtung === 'letzte') ziel = anzahl - 1;
  else if (typeof richtung === 'number' && Number.isFinite(richtung)) ziel = richtung;
  ziel = klemme(ziel);
  if (ziel === jetzt) return { index: jetzt, geaendert: false };
  // Rückwärts betreten: vollständig; vorwärts: zugedeckt.
  if (mitAufdecken) {
    const voll = ziel < jetzt ? aufdeckSchritteVon(folien[ziel]).zahl : 0;
    stand.set(tab, { index: ziel, schritt: voll });
  }
  return { index: ziel, geaendert: true };
}

/**
 * Wendet den Aufdeck-Stand auf den gezeichneten Inhalt einer Folie an.
 *
 * @param {Element} artikel Inhalt der Folie.
 * @param {object|null} folie Folie des Format-Kerns.
 * @param {number} sichtbar Zahl der sichtbaren Schritte; Infinity für alle.
 */
export function wendeAufdeckenAn(artikel, folie, sichtbar) {
  if (!artikel) return;
  const { zahl, punkte } = aufdeckSchritteVon(folie);
  const listenPunkte = artikel.querySelectorAll('li');
  for (const li of artikel.querySelectorAll(`[${VERBORGEN_ATTR}]`)) {
    li.removeAttribute(VERBORGEN_ATTR);
    li.style.visibility = '';
  }
  if (zahl === 0) {
    artikel.removeAttribute(AUFDECK_ATTR);
    return;
  }
  const grenze = Math.min(Number(sichtbar), zahl);
  for (const p of punkte) {
    const li = listenPunkte[p.punkt];
    if (!li || !(p.schritt > grenze)) continue;
    li.setAttribute(VERBORGEN_ATTR, '');
    li.style.visibility = 'hidden';
  }
  artikel.setAttribute(AUFDECK_ATTR, String(grenze));
}

/**
 * Zeigt den Aufdeck-Stand der Spalte an ihrer gezeichneten Folie (gerufen
 * von der Fläche nach jedem Zeichnen und Einpassen).
 *
 * @param {number} paneIdx
 * @param {object} tab
 * @param {number} index
 * @param {object|null} folie
 * @param {Element} artikel
 */
export function zeigeAufdeckStand(paneIdx, tab, index, folie, artikel) {
  wendeAufdeckenAn(artikel, folie, sichtbareSchritte(paneIdx, tab, index, folie));
}
