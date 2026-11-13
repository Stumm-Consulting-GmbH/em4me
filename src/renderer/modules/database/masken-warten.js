// 4T-002548 (Epic 3E-000368, Story 4S-001201, AK5; Nachzug nach der
// Entscheidung des Product Owners vom 2026-11-12, Empfehlung pauschal
// übernommen): Die Rückfrage der Maske bei ungespeicherter Bearbeitung und das
// Warten eines Workflow-Schritts `db-open` auf ihre Antwort.
//
// **Die Rückfrage** (bis hierher in `masken-seite.js`, Bauplan B2 aus
// 4T-001939): Soll die Maske mit ungespeicherter Bearbeitung auf einen anderen
// Gegenstand umbinden, steht in der Seite ein Bestätigungs-Block mit
// «Verwerfen» und «Weiter bearbeiten»; das Ziel liegt in `seite.ausstehend`.
// Hierher gezogen, damit die Seite ihr Zeilen-Budget hält.
//
// **Das Warten**: Trifft `db-open` auf diese Rückfrage, wartet der Schritt auf
// ihre Antwort. Die Warte-Stelle hält höchstens **eine** wartende Antwort und
// gibt sie genau einmal: «Verwerfen» öffnet das Ziel (`WARTEN_GEOEFFNET`),
// «Weiter bearbeiten» behält die Bearbeitung (`WARTEN_ZURUECK`), und jedes
// andere Ende der Rückfrage — der Reiter der Maske schließt, die Seite wird neu
// geöffnet, ein anderes Öffnen ersetzt das Ziel — beendet das Warten mit
// `WARTEN_VERSCHWUNDEN`, damit kein Lauf hängen bleibt. Die Seite ruft `beende`
// an jedem dieser Übergänge; ein zweiter Aufruf ist ohne Wirkung.
//
// Eigener Zustand: die eine wartende Antwort. Keine Imports; Seite, Bausteine
// und Texte reicht die Seite herein.
'use strict';

export const WARTEN_GEOEFFNET = 'geoeffnet';
export const WARTEN_ZURUECK = 'zurueck';
export const WARTEN_VERSCHWUNDEN = 'verschwunden';

/**
 * Baut die Warte-Stelle.
 *
 * @returns {{warte: () => Promise<string>, beende: (ergebnis: string) => void,
 *   wartet: () => boolean}}
 */
export function erzeugeWarteStelle() {
  let offen = null;

  function beende(ergebnis) {
    const antwort = offen;
    offen = null;
    if (antwort) antwort(ergebnis);
  }

  return {
    // Ein früheres Warten endet, bevor ein neues beginnt: Sein Ziel ist ersetzt.
    warte() {
      beende(WARTEN_VERSCHWUNDEN);
      return new Promise((resolve) => {
        offen = resolve;
      });
    },
    beende,
    wartet: () => offen !== null,
  };
}

/**
 * Baut die Rückfrage der Masken-Seite samt Warte-Stelle.
 *
 * @param {object} umgebung
 * @param {object} umgebung.seite Der Seiten-Zustand (`ausstehend`, `entwurf`, `modus`).
 * @param {(ziel: object, anderer: boolean) => void} umgebung.binde Bindet um.
 * @param {() => void} umgebung.zeichne Zeichnet die Seite neu.
 * @param {Function} umgebung.el Baustein für ein Element (Tag, Klasse, Text).
 * @param {Function} umgebung.knopf Baustein für einen Knopf (Klasse, Schlüssel, Klick).
 * @param {(key: string) => string} umgebung.t Texte.
 * @param {string} umgebung.lesen Der Lese-Modus der Seite.
 * @returns {{beende: Function, warteAufZiel: Function, zeichne: Function}}
 */
export function erzeugeRueckfrage({ seite, binde, zeichne, el, knopf, t, lesen }) {
  const stelle = erzeugeWarteStelle();

  return {
    beende: stelle.beende,

    // Steht die Rückfrage für dieses Ziel, wartet der Schritt auf ihre Antwort;
    // sonst hat die Seite schon umgebunden.
    warteAufZiel(tabellenPfad, kennung) {
      const ziel = seite.ausstehend;
      const steht = !!ziel && ziel.tabellenPfad === tabellenPfad && ziel.kennung === kennung;
      return steht ? stelle.warte() : Promise.resolve(WARTEN_GEOEFFNET);
    },

    zeichne(wurzel) {
      if (!seite.ausstehend) return;
      const block = el('div', 'db-form-confirm');
      block.setAttribute('role', 'alert');
      block.appendChild(el('p', 'db-form-confirm-text', t('database.form.confirm.text')));
      const leiste = el('div', 'db-form-confirm-actions');
      leiste.appendChild(
        knopf('db-form-confirm-discard', 'database.form.confirm.discard', () => {
          const ziel = seite.ausstehend;
          seite.entwurf = null;
          seite.modus = lesen;
          // Ein wartender Lauf geht weiter, sobald die Maske das Ziel zeigt.
          stelle.beende(WARTEN_GEOEFFNET);
          if (ziel) binde(ziel, true);
        }),
      );
      leiste.appendChild(
        knopf('db-form-confirm-back', 'database.form.confirm.back', () => {
          seite.ausstehend = null;
          // Ein wartender Lauf endet mit Grund, die Bearbeitung bleibt.
          stelle.beende(WARTEN_ZURUECK);
          zeichne();
        }),
      );
      block.appendChild(leiste);
      wurzel.appendChild(block);
    },
  };
}
