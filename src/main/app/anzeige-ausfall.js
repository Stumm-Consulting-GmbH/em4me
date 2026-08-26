// 4T-1214 (Epic 3E-0225): Ausfall des Anzeige-Prozesses erkennen und melden.
//
// Die vorhandenen Auffang-Ebenen (app/auffang-ebene.js und ihr Gegenstueck im
// Anzeige-Prozess) fangen unbehandelte Ausnahmen und Ablehnungen. Beide setzen
// einen LEBENDEN Ausfuehrungs-Kontext voraus. Faellt der Anzeige-Prozess selbst
// aus, ist niemand mehr da, der protokolliert: kein Absturz, keine Meldung,
// keine Spur, und fuer den Anwender sieht es aus, als sei die Anwendung grundlos
// verschwunden. Genau diesen Fall liess die Zusage von 3F-0149 offen.
//
// **Es sind zwei Faelle, nicht einer**, und sie beschreiben verschiedene
// Zustaende:
//
//   render-process-gone  Der Prozess ist WEG. Endgueltig, mit Grund
//                        (crashed, oom, killed, abnormal-exit, ...).
//   unresponsive         Der Prozess ist DA, antwortet aber nicht. Moeglicher-
//                        weise voruebergehend; `responsive` meldet die Rueckkehr.
//
// Deshalb behandelt der zweite Fall nicht sofort: Er wartet eine Frist ab und
// verstummt, wenn der Prozess zurueckkommt. Ohne diese Frist erschiene bei jedem
// laengeren Rechenvorgang eine Fehlermeldung.
//
// Verhalten nach dem Auffangen: Weg **N2** (Entscheidung des Product Owners vom
// 2026-08-26) — protokollieren, melden, und der Anwender waehlt zwischen
// Neuladen (Vorgabe) und Schliessen. Das Neuladen ist konstruktiv bereits
// vorgesehen: Der did-finish-load-Haken der Fenster-Verwaltung liefert beim
// ERNEUTEN Laden den zuletzt gemeldeten Reiter-Stand aus (M-13 aus 4T-0173), die
// Reiter kommen also zurueck. Was es nicht zurueckholt, naemlich ungespeicherte
// Aenderungen, lag im Speicher des ausgefallenen Prozesses und ist ohnehin fort.
//
// **Zweiter Ausfall desselben Fensters in kurzer Folge** bietet nur noch das
// Schliessen an (Teil derselben Entscheidung). Sonst baut ein Dokument, das den
// Anzeige-Prozess zuverlaessig umbringt, eine Endlosschleife aus Absturz und
// Neuladen; genau diese Konstellation loest erst 3E-0224 auf.
//
// **Wer schon meldet, meldet allein.** Laeuft fuer ein Fenster bereits eine
// Schliess-Anfrage, so haelt der Rueckfall aus 4T-1213 die Wache und zeigt bei
// Bedarf seinen eigenen Hinweis; diese Ebene schweigt dann. Ohne diese Kopplung
// stuenden im Beenden-Fall zwei Dialoge fuer dasselbe Fenster uebereinander.
// Sie ersetzt zugleich einen Beenden-Merker: Beim Beenden laeuft je Fenster
// eine Schliess-Anfrage, und der allgemeinere Fall (der Anwender schliesst ein
// haengendes Fenster von Hand) ist damit gleich mit abgedeckt.
//
// Protokolliert wird auf die Konsole, wie bei den bestehenden Auffang-Ebenen;
// Datei-Protokoll und Telemetrie schliessen die Entwicklungsrichtlinien aus.
'use strict';

// Zeit ohne Antwort, nach der ein noch lebender Anzeige-Prozess als ausgefallen
// gilt. Konservativ gewaehlt: Chromium meldet `unresponsive` selbst erst nach
// einigen Sekunden Haenger, und diese Frist kommt oben drauf. Ein Anwender, der
// auf ein grosses Dokument wartet, soll keine Fehlermeldung sehen.
const STILLE_FRIST_MS = 30000;

// Innerhalb dieser Spanne gilt ein zweiter Ausfall desselben Fensters als
// Wiederholung; dann entfaellt das Neuladen als Angebot.
const WIEDERHOLUNG_MS = 120000;

// Der einzige Grund, der KEIN Ausfall ist: das gewoehnliche Schliessen eines
// Fensters meldet ebenfalls `render-process-gone`.
const HARMLOS = 'clean-exit';

/**
 * Baut die Ausfall-Erkennung des Anzeige-Prozesses.
 *
 * @param {object} deps Alle Aussenwirkungen injiziert, damit die Erkennung ohne
 *   Elektron, ohne echte Zeit und ohne Dialog pruefbar ist.
 * @param {(win: object, lage: object) => Promise<string>} deps.frage Meldung mit
 *   Wahl; liefert 'neuLaden' oder 'schliessen'.
 * @param {(win: object) => void} deps.ladeNeu Ansicht neu laden.
 * @param {(win: object) => void} deps.schliesse Fenster schliessen.
 * @param {(fensterId: number) => boolean} [deps.schliessenLaeuft] Laeuft fuer
 *   dieses Fenster bereits eine Schliess-Anfrage? Dann meldet der Rueckfall aus
 *   4T-1213, und diese Ebene schweigt.
 * @param {number} [deps.stilleFristMs] Frist des Nicht-Antwortens.
 * @param {number} [deps.wiederholungMs] Spanne des Wiederholungs-Falls.
 * @param {(fn: Function, ms: number) => any} [deps.setTimer] Zeitgeber setzen.
 * @param {(id: any) => void} [deps.clearTimer] Zeitgeber loeschen.
 * @param {() => number} [deps.jetzt] Zeitquelle.
 * @param {(text: string) => void} [deps.log] Protokoll-Ausgabe.
 * @returns {object} Die Erkennung.
 */
function erstelleAnzeigeAusfall(deps = {}) {
  const stilleFristMs =
    typeof deps.stilleFristMs === 'number' && deps.stilleFristMs > 0
      ? deps.stilleFristMs
      : STILLE_FRIST_MS;
  const wiederholungMs =
    typeof deps.wiederholungMs === 'number' && deps.wiederholungMs > 0
      ? deps.wiederholungMs
      : WIEDERHOLUNG_MS;
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((id) => clearTimeout(id));
  const jetzt = deps.jetzt || (() => Date.now());
  const log = deps.log || ((text) => console.error(text));
  const schliessenLaeuft = deps.schliessenLaeuft || (() => false);
  const frage = deps.frage || (async () => 'schliessen');
  const ladeNeu = deps.ladeNeu || (() => {});
  const schliesse = deps.schliesse || (() => {});

  // Zeitpunkt des letzten Ausfalls je Fenster, fuer den Wiederholungs-Fall.
  const letzterAusfall = new Map();
  // Laufende Stille-Fristen je Fenster (Fall `unresponsive`).
  const fristen = new Map();
  // Fenster, ueber die gerade eine Meldung offen steht: Ein zweites Ereignis
  // waehrend der Meldung darf keinen zweiten Dialog aufziehen.
  const inBehandlung = new Set();

  function melde(text) {
    try {
      log(text);
    } catch {
      /* bewusst folgenlos: ohne Protokoll bleibt die Behandlung wirksam */
    }
  }

  function lebt(win) {
    return !!win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed());
  }

  // Gemeinsamer Kern beider Faelle: protokollieren, fragen, handeln.
  async function behandle(win, fensterId, lage) {
    if (inBehandlung.has(fensterId)) return 'laeuft';
    if (!lebt(win)) return 'fort';

    const vorher = letzterAusfall.get(fensterId);
    const wiederholung = vorher != null && jetzt() - vorher < wiederholungMs;
    letzterAusfall.set(fensterId, jetzt());

    melde(
      `[main] Anzeige-Prozess ausgefallen: Fenster ${fensterId}, Art ${lage.art}` +
        (lage.grund ? `, Grund ${lage.grund}` : '') +
        (lage.beendigungsCode != null ? `, Code ${lage.beendigungsCode}` : '') +
        (lage.stilleMs != null ? `, ohne Antwort seit ${lage.stilleMs} ms` : '') +
        (wiederholung ? ' (Wiederholung, Neuladen wird nicht angeboten)' : ''),
    );

    inBehandlung.add(fensterId);
    let wahl;
    try {
      wahl = await frage(win, { ...lage, wiederholung });
    } catch (err) {
      // Scheitert die Meldung, wird nicht neu geladen: Ein Neuladen ohne
      // Zutun des Anwenders ist genau der Weg N1, den die Entscheidung
      // verworfen hat.
      melde(
        `[main] Meldung zum ausgefallenen Fenster ${fensterId} gescheitert: ` +
          `${err && err.message ? err.message : err}`,
      );
      wahl = 'schliessen';
    } finally {
      inBehandlung.delete(fensterId);
    }

    if (!lebt(win)) return 'fort';
    if (wahl === 'neuLaden' && !wiederholung) {
      ladeNeu(win);
      return 'neuGeladen';
    }
    schliesse(win);
    return 'geschlossen';
  }

  /** Der Anzeige-Prozess eines Fensters ist verschwunden. */
  function prozessFort(win, fensterId, details = {}) {
    const grund = details.reason || details.grund || 'unbekannt';
    if (grund === HARMLOS) return Promise.resolve('harmlos');
    if (schliessenLaeuft(fensterId)) return Promise.resolve('schliessen laeuft');
    loescheFrist(fensterId);
    return behandle(win, fensterId, {
      art: 'Prozess fort',
      grund,
      beendigungsCode: details.exitCode != null ? details.exitCode : null,
    });
  }

  /** Das Fenster antwortet nicht mehr: Frist starten, nicht sofort melden. */
  function antwortetNicht(win, fensterId) {
    if (fristen.has(fensterId)) return;
    const begonnen = jetzt();
    fristen.set(
      fensterId,
      setTimer(() => {
        fristen.delete(fensterId);
        if (schliessenLaeuft(fensterId)) return;
        void behandle(win, fensterId, {
          art: 'antwortet nicht',
          stilleMs: Math.max(0, jetzt() - begonnen),
        });
      }, stilleFristMs),
    );
  }

  /** Das Fenster antwortet wieder: die Frist verfaellt ohne Meldung. */
  function antwortetWieder(fensterId) {
    loescheFrist(fensterId);
  }

  /** Das Fenster ist fort: alles zu diesem Fenster vergessen. */
  function vergiss(fensterId) {
    loescheFrist(fensterId);
    letzterAusfall.delete(fensterId);
    inBehandlung.delete(fensterId);
  }

  function loescheFrist(fensterId) {
    const id = fristen.get(fensterId);
    if (id != null) clearTimer(id);
    fristen.delete(fensterId);
  }

  return {
    prozessFort,
    antwortetNicht,
    antwortetWieder,
    vergiss,
    stilleFristMs,
    wiederholungMs,
  };
}

module.exports = {
  erstelleAnzeigeAusfall,
  STILLE_FRIST_MS,
  WIEDERHOLUNG_MS,
  HARMLOS,
};
