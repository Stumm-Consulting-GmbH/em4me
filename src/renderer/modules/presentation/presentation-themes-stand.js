// 4T-002281 (Epic 3E-000348): Der Katalog eigener Folien-Themes im Fenster.
//
// Hält den normalisierten Stand des Schlüssels `presentationThemes`, gespeist
// beim Start aus dem Einstellungs-Speicher und danach aus der
// Einstellungs-Verteilung (Nachricht `presentationThemes:changed`, an alle
// Fenster auch an das auslösende). Die Aufrufstellen der Theme-Auflösung lesen
// ihn mit `eigeneThemes()`: die Folien-Zeichnung (presentation-folie.js), der
// Format-Kern über die Option `eigeneThemes` von `api.lesePraesentation` und
// der HTML-Export. `themesStand()` zählt jeden echten Wechsel; ein Lese-Puffer
// der Fläche nimmt ihn in seinen Schlüssel, damit ein neuer Katalog neu liest.
//
// Eigener Zustand: der Katalog, sein Zähler und die Hörer. Das Electron-IPC
// puffert nicht; `starteThemesStand` meldet den Hörer deshalb zuerst an und
// fragt erst danach den gespeicherten Stand ab.
'use strict';

import {
  PRESENTATION_THEMES_KEY,
  normalisiereThemesZustand,
} from '../../../shared/presentation/presentation-eigene-themes.js';

let katalog = [];
let stand = 0;
const hoerer = new Set();

/** Der aktuelle Katalog eigener Themes (normalisierte Liste, nie null). */
export function eigeneThemes() {
  return katalog;
}

/** Zähler der Katalog-Wechsel; 0 vor dem ersten nicht leeren Stand. */
export function themesStand() {
  return stand;
}

/**
 * Übernimmt einen Zustand des Schlüssels `presentationThemes`. Normalisiert,
 * übergeht einen unveränderten Katalog und benachrichtigt sonst die Hörer.
 *
 * @param {unknown} zustand
 * @returns {boolean} true bei einem echten Wechsel.
 */
export function setzeEigeneThemes(zustand) {
  const neu = normalisiereThemesZustand(zustand).custom;
  if (JSON.stringify(neu) === JSON.stringify(katalog)) return false;
  katalog = neu;
  stand += 1;
  for (const hoererFn of hoerer) {
    try {
      hoererFn(katalog);
    } catch {
      // Ein fehlerhafter Hörer hält die übrigen nicht auf.
    }
  }
  return true;
}

/**
 * Meldet einen Hörer für Katalog-Wechsel an.
 *
 * @param {(katalog: Array<object>) => void} fn
 * @returns {() => void} meldet ihn wieder ab.
 */
export function beimThemesWechsel(fn) {
  if (typeof fn !== 'function') return () => {};
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

/**
 * Verbindet den Katalog mit Speicher und Verteilung des Fensters.
 *
 * @param {object} api die Brücke des Fensters (`getSetting`,
 *   `onPresentationThemesChanged`); fehlt eine Funktion, entfällt ihr Weg.
 * @param {{neuZeichnen?: () => void}} [optionen] `neuZeichnen` läuft nach
 *   jedem echten Wechsel, etwa das Neu-Zeichnen der offenen Präsentationen.
 * @returns {Promise<void>}
 */
export async function starteThemesStand(api, optionen = {}) {
  const neuZeichnen =
    optionen && typeof optionen.neuZeichnen === 'function' ? optionen.neuZeichnen : null;
  const uebernimm = (zustand) => {
    if (setzeEigeneThemes(zustand) && neuZeichnen) neuZeichnen();
  };
  if (!api) return;
  if (typeof api.onPresentationThemesChanged === 'function') {
    api.onPresentationThemesChanged(uebernimm);
  }
  if (typeof api.getSetting === 'function') {
    try {
      uebernimm(await api.getSetting(PRESENTATION_THEMES_KEY));
    } catch {
      // Ohne lesbaren Stand gelten die mitgelieferten Themes; die Verteilung
      // liefert den nächsten Wechsel nach.
    }
  }
}
