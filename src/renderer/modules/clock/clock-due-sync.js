// 4T-001728 (Epic 3E-000305): Fenster-Seite der Uhr-Meldungen in allen
// Fenstern — gemeinsam für Wecker (clock-alarms-panel.js) und Timer
// (clock-timers-panel.js).
//
// Ein fälliger Wecker und ein abgelaufener Timer stehen seither in allen
// Fenstern. Welche Bearbeitung wirkt, entscheidet der Hauptprozess
// (checks/due-delivery.js); jedes Fenster braucht dafür nur drei Handgriffe,
// die für beide Werkzeuge gleich sind und deshalb hier einmal stehen:
// - Räumen, wenn ein anderes Fenster die Meldung bearbeitet hat;
// - den offenen Stand nachholen, wenn das Fenster erst nach dem Auslösen
//   geöffnet wurde (E10);
// - ein Vermerk über geräumte Meldungen, weil die Nachhol-Antwort eine
//   Räum-Meldung überholen kann — ohne ihn käme eine eben bearbeitete Meldung
//   zurück. Eine frische Zustellung hebt den Vermerk auf (Schlummer-Ende,
//   erneuter Ablauf).
'use strict';

/**
 * Verbindet ein Uhr-Werkzeug mit der Zustellung an alle Fenster.
 *
 * @param {object} opts
 * @param {(cb: (payload: {keys: string[]}) => void) => void} opts.onHandled
 *   Anmeldung an die Räum-Meldung des Hauptprozesses.
 * @param {() => Promise<{items: object[]}>} opts.offene Offener Stand im Hauptprozess.
 * @param {(item: object) => string} opts.keyOf Schlüssel eines Eintrags.
 * @param {Map} opts.pending Die angezeigten Einträge des Dialogs (Schlüssel -> Eintrag).
 * @param {() => boolean} opts.istOffen Steht der Dialog gerade?
 * @param {() => void} opts.schliessen Dialog ohne eigene Aktion schließen.
 * @param {() => void} opts.neuZeichnen Liste des offenen Dialogs neu zeichnen.
 * @param {(payload: {items: object[]}) => void} opts.zeigen Nachgeholte Einträge anzeigen.
 * @returns {{zugestellt: (items: object[]) => void, nachholen: () => Promise<void>}}
 */
export function verbindeUhrMeldung(opts) {
  const geraeumt = new Set();
  opts.onHandled((payload) => {
    if (!payload || !Array.isArray(payload.keys)) return;
    let getroffen = false;
    for (const key of payload.keys) {
      geraeumt.add(key);
      if (opts.pending.delete(key)) getroffen = true;
    }
    if (!getroffen || !opts.istOffen()) return;
    if (opts.pending.size === 0) opts.schliessen();
    else opts.neuZeichnen();
  });
  return {
    zugestellt(items) {
      for (const item of items) geraeumt.delete(opts.keyOf(item));
    },
    async nachholen() {
      let stand;
      try {
        stand = await opts.offene();
      } catch (err) {
        console.warn('Uhr-Meldungen nachholen fehlgeschlagen:', err);
        return;
      }
      const items = (stand && Array.isArray(stand.items) ? stand.items : []).filter(
        (item) => !geraeumt.has(opts.keyOf(item)),
      );
      if (items.length > 0) opts.zeigen({ items });
    },
  };
}
