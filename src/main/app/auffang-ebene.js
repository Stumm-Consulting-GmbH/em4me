// 4T-000971 (Epic 3E-000207): Letzte Auffang-Ebene des Haupt-Prozesses.
//
// Unbehandelte Ausnahmen und unbehandelte Promise-Ablehnungen erreichen hier
// eine definierte Stelle, statt das Verhalten der Plattform-Voreinstellung zu
// ueberlassen. Verhalten nach dem Auffangen: Weg **M2** (Entscheidung des
// Product Owners vom 2026-08-14) — protokollieren, Sitzung sichern, definiert
// beenden.
//
// Warum beenden und nicht weiterlaufen: Ein Haupt-Prozess mit unbehandelter
// Ausnahme hat seinen Zustand verloren. Weiterlaufen tauscht einen sichtbaren
// Fehler gegen eine Kette unerklaerlicher Folgefehler ein; die Sitzungs-
// Persistenz laeuft vorher noch, und die Wiederherstellung greift beim
// naechsten Start. Fuer die Ablehnung gilt dasselbe Verhalten, womit es
// definiert ist statt versions-abhaengig.
//
// Zwei Zusaetze der Freigabe, beide gegen den Fehler im Fehlerfall:
//   1. Jeder Schritt ist gekapselt. Scheitert die Sicherung, wird das
//      protokolliert und der Rest laeuft trotzdem; ein Behandler, der beim
//      Behandeln scheitert, macht aus einem beherrschbaren Fehler einen
//      Absturz ohne Spur.
//   2. Nur der erste Vorfall wird voll behandelt, danach wird ausschliesslich
//      protokolliert. Sonst erzeugt ein Fehler im Behandlungs-Pfad eine
//      Kaskade.
//
// Protokolliert wird auf die Konsole, nicht in eine Datei: Datei-Logging und
// Telemetrie untersagen die Entwicklungsrichtlinien (Kapitel 4). Eine
// dauerhafte Absturz-Spur waere eine Regel-Aenderung und keine Nebenwirkung
// dieses Vorgangs.
'use strict';

const ART_TEXT = Object.freeze({
  ausnahme: 'unbehandelte Ausnahme',
  ablehnung: 'unbehandelte Promise-Ablehnung',
});

// Vier Angaben je Vorfall: Prozess-Seite, Ereignis-Art, Meldung, Aufruf-Spur.
// Die Spur steht als eigene Zeile, damit sie in der Konsole lesbar bleibt.
function baueMeldung(art, fehler) {
  const text =
    fehler instanceof Error
      ? fehler.message
      : typeof fehler === 'string'
        ? fehler
        : String(fehler && fehler.message ? fehler.message : fehler);
  const spur = fehler instanceof Error && fehler.stack ? `\n${fehler.stack}` : '';
  return `[main] ${ART_TEXT[art] || art}: ${text}${spur}`;
}

/**
 * Baut die Auffang-Ebene des Haupt-Prozesses.
 *
 * @param {object} deps Abhaengigkeiten; alle injizierbar, damit die Ebene ohne
 *   Elektron und ohne echtes Beenden pruefbar ist.
 * @param {(text: string) => void} [deps.log] Protokoll-Ausgabe.
 * @param {() => void} [deps.sichereSitzung] Sitzungs-Persistenz (M2, Schritt 2).
 * @param {() => void} [deps.beende] Definiertes Beenden (M2, Schritt 3).
 * @returns {object} `{ behandle, registriere }`.
 */
function erstelleAuffangEbene(deps = {}) {
  const log = deps.log || ((text) => console.error(text));
  const sichereSitzung = deps.sichereSitzung || (() => {});
  const beende = deps.beende || (() => {});
  let behandelt = false;

  // Liefert einen Befund statt zu werfen: Der Aufrufer ist ein Ereignis-Haken,
  // der nichts mehr auffangen koennte. Die Rueckgabe traegt die Pruefpunkte.
  function behandle(art, fehler) {
    try {
      log(baueMeldung(art, fehler));
    } catch {
      /* bewusst folgenlos: ohne Protokoll bleibt nur der Rest der Behandlung */
    }
    if (behandelt) return { erneut: true, gesichert: false, beendet: false };
    behandelt = true;

    let gesichert = false;
    try {
      sichereSitzung();
      gesichert = true;
    } catch (err) {
      try {
        log(`[main] Sicherung nach dem Auffangen fehlgeschlagen: ${err && err.message}`);
      } catch {
        /* bewusst folgenlos */
      }
    }

    let beendet = false;
    try {
      beende();
      beendet = true;
    } catch (err) {
      try {
        log(`[main] Definiertes Beenden fehlgeschlagen: ${err && err.message}`);
      } catch {
        /* bewusst folgenlos */
      }
    }
    return { erneut: false, gesichert, beendet };
  }

  // Registrierung an beiden Ereignis-Arten des Prozesses.
  function registriere(prozess) {
    prozess.on('uncaughtException', (fehler) => behandle('ausnahme', fehler));
    prozess.on('unhandledRejection', (grund) => behandle('ablehnung', grund));
  }

  return { behandle, registriere };
}

module.exports = { erstelleAuffangEbene, baueMeldung, ART_TEXT };
