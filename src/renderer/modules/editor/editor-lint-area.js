// 4T-001454 (Epic 3E-000190): Der Verknüpfungs-Anteil des Linters — Regel 7
// für Verweise über die Bereichs-Grenze.
//
// Eigenes Modul, weil `editor-lint.js` an seinem Größen-Budget steht und der
// Anteil fachlich für sich steht: Er befragt einen anderen Kanal als die
// lokalen Regeln, urteilt nach anderen Kriterien und hängt an der
// Bereichsdatei statt am Backlinks-Index.
//
// **Markiert wird nur, was der Anwender beheben kann.** Ein nicht eingetragenes
// Kürzel und ein verschobener Bereich sind Mängel des Dokuments beziehungsweise
// der Einrichtung; ein fehlendes Ziel ist für den Anwender derselbe Sachverhalt
// wie bei einem lokalen Wiki-Link. Der **Offline-Fall bleibt unmarkiert** — ein
// getrenntes Laufwerk ist kein Mangel, und ein rot gefärbter Verweis, der nach
// dem Anstecken der Platte wieder stimmt, wäre eine Falschmeldung
// (Entscheidung E4 der Konzept-Stufe 4T-001368).
'use strict';

import { api } from '../app/api.js';

// Urteile, die zur Marke «Verknüpfung nicht nutzbar» führen. Der Grund liegt
// bei der Verknüpfung selbst, nicht beim Ziel.
const UNGUELTIG = new Set(['unbekannt', 'verschoben']);

/**
 * Beurteilt die Verknüpfungs-Links eines Lint-Laufs und meldet die Marken.
 *
 * Ein Roundtrip je Lauf statt einer Anfrage je Link — dieselbe Form wie
 * `resolveWikiTargets` für die lokalen Ziele. Ist der Kanal nicht verfügbar
 * oder antwortet er nicht mit `ready`, unterbleibt die Regel in diesem Lauf;
 * das ist dieselbe Zurückhaltung wie bei den lokalen Regeln und besser als
 * eine falsche Marke.
 *
 * @param {Array<{from: number, to: number, target: string, areaPrefix: string|null}>} wikiMatches
 *   Alle Wiki-Treffer des Laufs; die ohne Kürzel bleiben unberührt.
 * @param {(from: number, to: number, ruleId: string, detail?: string) => void} pushRange
 *   Melde-Funktion des Lint-Laufs.
 * @returns {Promise<void>}
 */
export async function pruefeVerknuepfungsLinks(wikiMatches, pushRange) {
  const areaMatches = (wikiMatches || []).filter((w) => w && w.areaPrefix);
  if (areaMatches.length === 0) return;
  if (typeof api.beurteileAreaLinks !== 'function') return;
  let antwort;
  try {
    antwort = await api.beurteileAreaLinks(
      areaMatches.map((w) => ({ prefix: w.areaPrefix, target: w.target })),
    );
  } catch {
    return; // Kanal-Fehler: Regel in diesem Lauf unterdrueckt
  }
  if (!antwort || antwort.status !== 'ready') return;
  const urteile = antwort.urteile || [];
  areaMatches.forEach((w, i) => {
    const urteil = urteile[i] && urteile[i].urteil;
    const ziel = `@${w.areaPrefix}:${w.target}`;
    if (UNGUELTIG.has(urteil)) {
      pushRange(w.from, w.to, 'invalidAreaLink', ziel);
    } else if (urteil === 'nicht-gefunden') {
      pushRange(w.from, w.to, 'brokenWikiLink', ziel);
    }
  });
}
