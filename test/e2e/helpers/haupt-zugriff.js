// 4T-001813 (Epic 3E-000156): Zugriff der Ablauf-Prüfungen auf den Hauptprozess.
//
// **Gemessene Ursache.** Ein `app.evaluate` meldet gelegentlich
// «electronApplication.evaluate: Execution context was destroyed, most likely
// because of a navigation», ohne dass irgendetwas navigiert hätte. Gemessen am
// 2026-10-01 an SE-08 (sprach-einspielen.spec.js) mit mitgeschriebenem
// Protokoll: Die ursprüngliche Antwort des Hauptprozesses lautet
// `{"code":-32000,"message":"Promise was collected"}` auf
// `Runtime.callFunctionOn` mit `awaitPromise: true`; erst Playwright schreibt
// sie in `rewriteError` (playwright-core, coreBundle.js) auf den Satz von der
// Navigation um. Der Zugriff fällt dabei in die Verarbeitung einer
// Menü-Meldung des Fensters (`window:reportMenuState`, nach einem
// Sprachwechsel), und dazwischen läuft eine kleine Speicherbereinigung, die das
// noch offene Versprechen der Auswertung einsammelt. Rot und grün trennten sich
// an genau diesem Zeitmuster in 20 von 20 Durchgängen. **Der Rumpf der
// übergebenen Funktion war in allen roten Fällen ausgeführt; verloren ging nur
// die Rückmeldung.** Ein Ausführungs-Kontext wird nicht zerstört.
//
// Daraus folgen zwei Wege, je nach Art des Rumpfes:
//
// - `hauptSenden` für einen Befehl, dessen Rückgabe nicht gebraucht wird
//   (Nachricht an ein Fenster, Dialog stellvertreten, Abfang-Haken setzen).
//   Bei genau diesem Fehlerbild gilt der Befehl als abgesetzt, und es gibt
//   **keinen** zweiten Versuch: Der Rumpf ist gelaufen, ein zweiter Aufruf
//   führte ihn ein zweites Mal aus. Wiederholt werden darf nur ein
//   idempotentes Kommando (Stabilitätsregel 13 in test/README.md), und das ist
//   eine Eigenschaft des einzelnen Rumpfes, nicht dieses Helfers. Wer einen
//   Befehl wiederholen will, tut das sichtbar im Prüffall, etwa in einer
//   `expect.poll`-Klammer, die auf die Wirkung wartet. Ist der Rumpf
//   ausnahmsweise doch nicht gelaufen, fehlt seine Wirkung, und der Prüffall
//   scheitert an seiner nächsten Erwartung statt still grün zu werden.
// - `hauptLesen` für eine Abfrage ohne Nebenwirkung. Ihr Ergebnis wird
//   gebraucht, und ein zweiter Aufruf schadet nicht; bei genau diesem
//   Fehlerbild wird sie deshalb sofort erneut gestellt, **ohne feste Pause**
//   (Stabilitätsregel 2: keine harten Sleeps — die Speicherbereinigung ist nach
//   Millisekunden vorbei, und eine Wartezeit nähme nur Zeit, keine Ursache
//   weg), begrenzt auf `LESE_HOECHSTZAHL` Versuche.
//
// Jeder andere Fehler geht in beiden Wegen unverändert weiter: Er ist ein
// Befund und kein Wackler dieses Zugriffs.
//
// **Fenster-Griff als Ziel** (4T-002061). Das Ziel ist entweder das
// Anwendungs-Objekt aus `launchApp` oder ein Fenster-Griff aus
// `app.browserWindow(page)`; der Rumpf bekommt dann das Fenster-Objekt als
// erstes Argument, wie bei `fenster.evaluate`. Beide Wege laufen in Playwright
// über denselben Ausführungs-Kontext des Hauptprozesses (das Anwendungs-Objekt
// wertet selbst über einen Griff auf das Electron-Modul aus) und tragen damit
// dasselbe Fehlerbild; das Erkennungsmuster ist nicht an den Anfang der Meldung
// gebunden und trifft beide Fassungen. Der Baustein ruft nur `.evaluate` auf
// seinem Ziel auf und braucht dafür keinen eigenen Zweig.
//
// **Spur.** Jedes Abfangen schreibt eine Zeile mit dem festen Präfix
// `HAUPT-ZUGRIFF` in die Ausgabe des Falls; Playwright führt sie in der
// Lauf-Ausgabe und im JSON-Bericht. Im grünen Normalfall erscheint nichts. So
// lässt sich in einem Nachweis zählen, wie oft der Weg gegriffen hat — ein
// Baustein, der nie greift, hat in einer Reihe nichts bewiesen.
'use strict';

const FEHLERBILD = /Execution context was destroyed/;
const SPUR_PRAEFIX = 'HAUPT-ZUGRIFF';
const LESE_HOECHSTZAHL = 10;

const HINWEIS =
  'Die Rückmeldung des Hauptprozesses ging wiederholt verloren («Promise was ' +
  'collected», von Playwright als «Execution context was destroyed» gemeldet; ' +
  'Ursache und Messung im Kopf von test/e2e/helpers/haupt-zugriff.js).';

function istFehlerbild(fehler) {
  const text = fehler && fehler.message ? fehler.message : String(fehler);
  return FEHLERBILD.test(text);
}

function spur(text) {
  console.log(`${SPUR_PRAEFIX} ${text}`);
}

/**
 * Setzt im Hauptprozess einen Befehl ab, dessen Rückgabe nicht gebraucht wird.
 *
 * @param {import('@playwright/test').ElectronApplication|import('@playwright/test').JSHandle} ziel
 *   Anwendungs-Objekt oder Fenster-Griff aus `app.browserWindow(page)`.
 * @param {Function} fn Rumpf, wie für `ziel.evaluate`.
 * @param {*} [arg] Argument, wie für `ziel.evaluate`.
 * @returns {Promise<undefined>}
 */
async function hauptSenden(ziel, fn, arg) {
  try {
    await ziel.evaluate(fn, arg);
  } catch (fehler) {
    if (!istFehlerbild(fehler)) throw fehler;
    spur('Senden: Rückmeldung verloren, Befehl gilt als abgesetzt (kein zweiter Versuch)');
  }
  return undefined;
}

/**
 * Stellt im Hauptprozess eine Abfrage ohne Nebenwirkung und liefert ihr
 * Ergebnis. Bei verlorener Rückmeldung wird sie sofort erneut gestellt.
 *
 * @param {import('@playwright/test').ElectronApplication|import('@playwright/test').JSHandle} ziel
 *   Anwendungs-Objekt oder Fenster-Griff aus `app.browserWindow(page)`.
 * @param {Function} fn Rumpf, wie für `ziel.evaluate`; ohne Nebenwirkung.
 * @param {*} [arg] Argument, wie für `ziel.evaluate`.
 * @returns {Promise<*>} Rückgabe des Rumpfes.
 */
async function hauptLesen(ziel, fn, arg) {
  let letzter;
  for (let versuch = 1; versuch <= LESE_HOECHSTZAHL; versuch++) {
    try {
      return await ziel.evaluate(fn, arg);
    } catch (fehler) {
      if (!istFehlerbild(fehler)) throw fehler;
      letzter = fehler;
      spur(`Lesen: Rückmeldung verloren in Versuch ${versuch} von ${LESE_HOECHSTZAHL}`);
    }
  }
  throw new Error(
    `${HINWEIS} Nach ${LESE_HOECHSTZAHL} Versuchen aufgegeben. Letzter Fehler: ${letzter.message}`,
    { cause: letzter },
  );
}

module.exports = { hauptSenden, hauptLesen, LESE_HOECHSTZAHL, SPUR_PRAEFIX };
