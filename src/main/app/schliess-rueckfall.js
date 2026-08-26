// 4T-1213 (Epic 3E-0225): Rueckfall im Schliess-Weg.
//
// Das Schliessen eines Fensters laeuft ueber eine Rueckfrage an den
// Anzeige-Prozess: Der Haupt-Prozess haelt das Schliessen an und wartet auf die
// Quittung, weil nur der Anzeige-Prozess weiss, ob ein Reiter ungespeicherte
// Arbeit traegt. Bleibt die Quittung aus, weil der Anzeige-Prozess nicht mehr
// antwortet, ist das Fenster **konstruktiv** unschliessbar; dem Anwender bleibt
// nur das harte Beenden, und das trifft auch die gesunden anderen Fenster mit
// ihrer ungespeicherten Arbeit.
//
// Dieses Modul beantwortet genau eine Frage: **wann gilt ein Anzeige-Prozess
// als stumm?**
//
// Gemessen wird die STILLE, nicht die Dauer des Schliess-Vorgangs. Der
// Unterschied ist der Kern: Zwischen Anfrage und Quittung liegt die Nachfrage
// nach ungespeicherten Inhalten, die der Haupt-Prozess selbst zeigt und auf die
// der Anwender beliebig lange braucht. Eine Frist auf die Quittung risse ihm
// das Fenster unter der offenen Frage weg und verwuerfe genau die Arbeit, die
// der Rueckfall schuetzen soll.
//
// Als Lebenszeichen zaehlt jeder IPC-Aufruf des Fensters. Er beweist mehr als
// eine Quittung, weil er einen laufenden Ereignis-Zyklus im Anzeige-Prozess
// voraussetzt, und genau dessen Ausfall ist der Mangel. Solange ein Aufruf in
// Bearbeitung ist, ruht die Frist: Ein laufender Aufruf belegt, dass der
// Haupt-Prozess fuer dieses Fenster arbeitet und die Stille nicht am
// Anzeige-Prozess liegt. Damit ist jeder Haupt-Prozess-Dialog abgedeckt, ohne
// dass dieses Modul einen Dialog kennen muss.
//
// Nach Ablauf setzt das Modul KEINE neue Frist. Es meldet den Befund und
// ueberlaesst dem Aufrufer die Wahl: `beende` (Fenster schliesst) oder erneutes
// `starte` (weiter warten). So bleibt die Entscheidung ueber das Verhalten dort,
// wo sie hingehoert, und der Hinweis kann nicht waehrend seiner eigenen Anzeige
// ein zweites Mal ausloesen.
//
// Frist-Laenge: Entscheidung des Product Owners vom 2026-08-26. 20 Sekunden
// geben vierfachen Abstand zum langsamsten belegten Fall des Projekts (drei bis
// fuenf Sekunden fuer den Aenderungsmodus bei 1,67 MB, Messung E23.2).
'use strict';

const FRIST_MS = 20000;

/**
 * Baut die Stille-Wache des Schliess-Wegs.
 *
 * @param {object} deps Abhaengigkeiten; alle injizierbar, damit die Wache ohne
 *   Elektron und ohne echte Zeit pruefbar ist.
 * @param {number} [deps.fristMs] Frist in Millisekunden.
 * @param {(fn: Function, ms: number) => any} [deps.setTimer] Zeitgeber setzen.
 * @param {(id: any) => void} [deps.clearTimer] Zeitgeber loeschen.
 * @param {() => number} [deps.jetzt] Zeitquelle fuer die Dauer im Protokoll.
 * @param {(text: string) => void} [deps.log] Protokoll-Ausgabe.
 * @param {(fensterId: number, befund: object) => void} [deps.beiAblauf]
 *   Ruecksprung nach Ablauf der Frist.
 * @returns {object} Die Wache.
 */
function erstelleSchliessRueckfall(deps = {}) {
  const fristMs = typeof deps.fristMs === 'number' && deps.fristMs > 0 ? deps.fristMs : FRIST_MS;
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((id) => clearTimeout(id));
  const jetzt = deps.jetzt || (() => Date.now());
  const log = deps.log || ((text) => console.error(text));
  const beiAblauf = deps.beiAblauf || (() => {});

  // Je Fenster ein Eintrag, solange eine Schliess-Anfrage offen ist. Ein
  // Fenster ohne Eintrag ist nicht im Schliessen; seine IPC-Aufrufe sind dann
  // gewoehnlicher Betrieb und kosten nichts.
  const wachen = new Map();

  // Zaehler der laufenden Aufrufe je Fenster. Er lebt AUSSERHALB der Wachen,
  // weil er auch ohne offene Schliess-Anfrage mitlaeuft: Sonst zaehlte ein
  // Aufruf, der vor der Anfrage begann und nach ihr endet, in den Minus-Bereich
  // und die Frist liefe nie an.
  const laufendeAufrufe = new Map();

  function aufrufZahl(fensterId) {
    return laufendeAufrufe.get(fensterId) || 0;
  }

  // Setzt die Frist neu an, sofern die Wache offen ist und gerade kein Aufruf
  // laeuft. Idempotent: Ein bereits laufender Zeitgeber wird zuvor geloescht.
  function frisch(fensterId) {
    const wache = wachen.get(fensterId);
    if (!wache) return;
    if (wache.timer != null) {
      clearTimer(wache.timer);
      wache.timer = null;
    }
    if (aufrufZahl(fensterId) > 0) return;
    wache.stillSeit = jetzt();
    wache.timer = setTimer(() => laufeAb(fensterId), fristMs);
  }

  function laufeAb(fensterId) {
    const wache = wachen.get(fensterId);
    if (!wache) return;
    wache.timer = null;
    const stilleMs = Math.max(0, jetzt() - wache.stillSeit);
    const befund = {
      fensterId,
      stilleMs,
      seitAnfrageMs: Math.max(0, jetzt() - wache.begonnen),
      fristMs,
    };
    try {
      log(
        `[main] Anzeige-Prozess antwortet nicht: Fenster ${fensterId} ohne Lebenszeichen ` +
          `seit ${stilleMs} ms (Frist ${fristMs} ms), Schliess-Anfrage vor ` +
          `${befund.seitAnfrageMs} ms gestellt.`,
      );
    } catch {
      /* bewusst folgenlos: ohne Protokoll bleibt der Rueckfall selbst wirksam */
    }
    // Der Ruecksprung darf die Wache nicht mitreissen; scheitert er, bleibt der
    // Zustand konsistent und ein erneutes Schliessen loest ihn wieder aus.
    try {
      beiAblauf(fensterId, befund);
    } catch (err) {
      try {
        log(
          `[main] Rueckfall im Schliess-Weg gescheitert: ${err && err.message ? err.message : err}`,
        );
      } catch {
        /* bewusst folgenlos */
      }
    }
  }

  /** Beginnt die Wache fuer ein Fenster. Ein zweiter Aufruf setzt sie neu an. */
  function starte(fensterId) {
    const bestand = wachen.get(fensterId);
    if (bestand && bestand.timer != null) clearTimer(bestand.timer);
    wachen.set(fensterId, {
      timer: null,
      begonnen: bestand ? bestand.begonnen : jetzt(),
      stillSeit: jetzt(),
    });
    frisch(fensterId);
  }

  /** Beendet die Wache (Quittung, Abbruch oder zerstoertes Fenster). */
  function beende(fensterId) {
    const wache = wachen.get(fensterId);
    if (wache && wache.timer != null) clearTimer(wache.timer);
    wachen.delete(fensterId);
    laufendeAufrufe.delete(fensterId);
  }

  /** Ein IPC-Aufruf des Fensters laeuft an: die Frist ruht. */
  function aufrufBegonnen(fensterId) {
    laufendeAufrufe.set(fensterId, aufrufZahl(fensterId) + 1);
    const wache = wachen.get(fensterId);
    if (wache && wache.timer != null) {
      clearTimer(wache.timer);
      wache.timer = null;
    }
  }

  /** Der Aufruf ist fertig: Lebenszeichen, die Frist beginnt von vorn. */
  function aufrufBeendet(fensterId) {
    const rest = aufrufZahl(fensterId) - 1;
    if (rest > 0) laufendeAufrufe.set(fensterId, rest);
    else laufendeAufrufe.delete(fensterId);
    frisch(fensterId);
  }

  /** Diagnose und Pruefung: laeuft fuer dieses Fenster eine Wache? */
  function istAktiv(fensterId) {
    return wachen.has(fensterId);
  }

  return { starte, beende, aufrufBegonnen, aufrufBeendet, istAktiv, fristMs };
}

/**
 * Baut die Handlung nach Ablauf der Frist: fragen, dann schliessen oder weiter
 * warten (Entscheidung des Product Owners vom 2026-08-26).
 *
 * Der Schluss laeuft ueber den REGULAEREN Quittungs-Weg, also Quittung setzen
 * und `close()` rufen, und nicht ueber ein hartes `destroy()`. Das ist der
 * Grund, aus dem der Sitzungs-Stand dabei erhalten bleibt: Der close-Handler
 * schreibt ihn im quittierten Zweig ohnehin, aus Haupt-Prozess-Daten, die den
 * ausgefallenen Anzeige-Prozess nicht brauchen. Entscheidung E3 ist damit
 * konstruktiv erfuellt und nicht als Zusatz angeflanscht.
 *
 * @param {object} deps Alle Aussenwirkungen injiziert, damit die Handlung ohne
 *   Elektron pruefbar bleibt.
 * @param {(fensterId: number) => object|null} deps.fensterVon Fenster-Zugriff.
 * @param {(win: object, sekunden: number) => Promise<boolean>} deps.frage
 *   Hinweis mit Wahl; `true` heisst schliessen, `false` weiter warten.
 * @param {(win: object) => void} deps.quittiere Schliess-Quittung setzen.
 * @param {object} deps.wache Die Stille-Wache aus `erstelleSchliessRueckfall`.
 * @param {(text: string) => void} [deps.log] Protokoll-Ausgabe.
 * @returns {(fensterId: number, befund: object) => Promise<string>} Die
 *   Handlung; sie liefert ihren Ausgang zurueck, damit die Pruefung ihn sieht.
 */
function erstelleErzwungenenSchluss(deps = {}) {
  const fensterVon = deps.fensterVon || (() => null);
  const frage = deps.frage || (async () => true);
  const quittiere = deps.quittiere || (() => {});
  const wache = deps.wache;
  const log = deps.log || ((text) => console.error(text));

  return async function behandleAblauf(fensterId, befund) {
    const win = fensterVon(fensterId);
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
      if (wache) wache.beende(fensterId);
      return 'fort';
    }

    const sekunden = Math.max(
      1,
      Math.round((befund && befund.stilleMs ? befund.stilleMs : 0) / 1000),
    );

    let schliessen;
    try {
      schliessen = await frage(win, sekunden);
    } catch (err) {
      // Scheitert die Nachfrage, wird geschlossen. Der Anwender hat das
      // Schliessen angefordert und wartet seit der vollen Frist; ein Rueckfall,
      // der am eigenen Hinweis scheitert, waere wirkungslos.
      try {
        log(
          `[main] Hinweis zum nicht antwortenden Fenster ${fensterId} gescheitert, es wird ` +
            `geschlossen: ${err && err.message ? err.message : err}`,
        );
      } catch {
        /* bewusst folgenlos */
      }
      schliessen = true;
    }

    if (!schliessen) {
      // Weiter warten: die Frist beginnt von vorn. Kommt der Anzeige-Prozess
      // zurueck, laeuft der regulaere Weg samt Nachfrage nach ungespeicherten
      // Inhalten unveraendert weiter.
      if (wache) wache.starte(fensterId);
      return 'warten';
    }

    if (wache) wache.beende(fensterId);
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return 'fort';
    quittiere(win);
    win.close();
    return 'geschlossen';
  };
}

module.exports = { erstelleSchliessRueckfall, erstelleErzwungenenSchluss, FRIST_MS };
