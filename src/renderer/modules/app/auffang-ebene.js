// 4T-0971 (Epic 3E-0207): Letzte Auffang-Ebene des Renderers.
//
// Fehler-Ereignis und unbehandelte Promise-Ablehnung erreichen hier eine
// definierte Stelle. Verhalten nach dem Auffangen: Weg **R2** (Entscheidung
// des Product Owners vom 2026-08-14) — protokollieren, die offenen
// ungespeicherten Inhalte ueber den bestehenden Entwurfs-Weg sichern,
// weiterlaufen.
//
// Warum weiterlaufen und nicht beenden: Anders als im Haupt-Prozess ist der
// JavaScript-Kontext nach einem gefangenen Fehler in aller Regel voll
// funktionsfaehig; ein Fenster zu schliessen kostete den Nutzer mehr, als der
// Fehler ihn kostet. Warum trotzdem sichern: Hier liegen die Nutzer-Inhalte,
// und «protokollieren, aber genau dort nichts sichern, wo etwas zu verlieren
// ist» waere die halbe Zusage.
//
// Registrierung als Modul-Seiteneffekt beim Laden, nicht in init(): Ein Fehler
// waehrend der Modul-Kette ist genau der Fall ohne Spur, und der Renderer-Entry
// laedt dieses Modul deshalb als erstes. Dasselbe Muster traegt seit 4T-0320
// der Schliess-Haken in app-broadcasts.js.
//
// Die Entwurfs-Sicherung kommt spaet ueber `setzeEntwurfsSicherung`, statt sie
// hier zu importieren: Ein Import zoege die Reiter- und Ansichts-Module an den
// Anfang der Seiteneffekt-Reihenfolge, die der Bestand bewusst unveraendert
// haelt.
'use strict';

const ART_TEXT = Object.freeze({
  fehler: 'unbehandelter Fehler',
  ablehnung: 'unbehandelte Promise-Ablehnung',
});

let entwurfsSicherung = null;

/**
 * Setzt den Weg, auf dem die Ebene ungespeicherte Inhalte sichert.
 *
 * @param {() => Promise<number>} fn Liefert die Anzahl gesicherter Entwuerfe.
 */
export function setzeEntwurfsSicherung(fn) {
  entwurfsSicherung = fn;
}

export function baueMeldung(art, fehler) {
  const text =
    fehler instanceof Error
      ? fehler.message
      : typeof fehler === 'string'
        ? fehler
        : String(fehler && fehler.message ? fehler.message : fehler);
  const spur = fehler instanceof Error && fehler.stack ? `\n${fehler.stack}` : '';
  return `[renderer] ${ART_TEXT[art] || art}: ${text}${spur}`;
}

/**
 * Baut die Auffang-Ebene des Renderers.
 *
 * @param {object} deps Abhaengigkeiten; alle injizierbar, damit die Ebene ohne
 *   Fenster und ohne echte Sicherung pruefbar ist.
 * @param {(text: string) => void} [deps.log] Protokoll-Ausgabe.
 * @param {() => Promise<number>} [deps.sichereEntwuerfe] Entwurfs-Sicherung.
 * @returns {object} `{ behandle, registriere }`.
 */
export function erstelleAuffangEbene(deps = {}) {
  const log = deps.log || ((text) => console.error(text));
  const sichereEntwuerfe = deps.sichereEntwuerfe || (() => (entwurfsSicherung || (() => 0))());
  let behandelt = false;

  async function behandle(art, fehler) {
    try {
      log(baueMeldung(art, fehler));
    } catch {
      /* bewusst folgenlos */
    }
    if (behandelt) return { erneut: true, gesichert: 0 };
    behandelt = true;

    // Zusatz 1 der Freigabe: Die Sicherung ist gekapselt. Sie ist der Teil, der
    // im Fehlerfall am ehesten selbst scheitert, und darf die Behandlung nicht
    // mitreissen.
    let gesichert = 0;
    try {
      gesichert = (await sichereEntwuerfe()) || 0;
    } catch (err) {
      try {
        log(
          `[renderer] Entwurfs-Sicherung nach dem Auffangen fehlgeschlagen: ${err && err.message}`,
        );
      } catch {
        /* bewusst folgenlos */
      }
    }
    // Die Wirkung gehoert ins Protokoll, nicht nur der Anlass: Ohne sie ist von
    // aussen nicht unterscheidbar, ob die Ebene gesichert hat oder ob es nichts
    // zu sichern gab. Genau diese Frage kostete bei der Umsetzung eine
    // Diagnose-Runde.
    try {
      log(`[renderer] Auffang-Ebene: ${gesichert} Entwurf/Entwuerfe gesichert.`);
    } catch {
      /* bewusst folgenlos */
    }
    return { erneut: false, gesichert };
  }

  function registriere(ziel) {
    if (!ziel || typeof ziel.addEventListener !== 'function') return false;
    ziel.addEventListener('error', (ereignis) => {
      behandle('fehler', (ereignis && (ereignis.error || ereignis.message)) || ereignis);
    });
    ziel.addEventListener('unhandledrejection', (ereignis) => {
      behandle('ablehnung', ereignis && ereignis.reason);
    });
    return true;
  }

  return { behandle, registriere };
}

// Seiteneffekt beim Laden: Ab hier ist die Ebene scharf. Der Zweig ohne Fenster
// haelt das Modul in Unit-Tests ohne DOM ladbar.
if (typeof window !== 'undefined') {
  erstelleAuffangEbene().registriere(window);
}
