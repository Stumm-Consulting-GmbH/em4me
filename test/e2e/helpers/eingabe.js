// 4T-000777 (Epic 3E-000156): Wiederhol-Helfer fuer Tastendrucke, deren Wirkung
// eine Bedingung sichtbar macht.
//
// Ein Tastendruck kann ins Leere gehen: Das Fenster hat den Fokus noch nicht,
// oder der Renderer haengt seinen Listener erst an. Wer danach nur auf die
// Wirkung wartet, laeuft in die Zeitgrenze und meldet einen roten Fall, der
// isoliert verlaesslich gruen ist (Befunde JR-01 in der Journal-Spec und
// BL-03 in der Lesezeichen-Spec, letzterer rot in zwei Release-Laeufen).
// Deshalb wird der Druck wiederholt, bis die Wirkung eintritt.
//
// Voraussetzung: Der Tastendruck ist in seiner Wirkung idempotent — ein
// zweiter Druck darf den ersten nicht zuruecknehmen und nichts doppeln. Das
// ist vor der Verwendung am Kommando zu pruefen; ein Umschalter (Toggle)
// gehoert nicht hierher.
'use strict';

const { expect } = require('@playwright/test');

// Druecken, bis die Bedingung erfuellt ist. `bedingung` ist eine Funktion,
// die einen Wahrheitswert liefert (auch als Promise).
async function pressUntil(page, key, bedingung) {
  await expect
    .poll(async () => {
      if (!(await bedingung())) await page.keyboard.press(key);
      return bedingung();
    })
    .toBe(true);
}

// Haeufigster Fall: Die Wirkung ist ein sichtbar werdendes Element. Fuer eine
// Wirkung, die sich als Klasse zeigt, wird sie in den Locator gezogen
// (`page.locator('#btn.is-marked')`), damit dieselbe Funktion traegt.
async function pressUntilVisible(page, key, locator) {
  await pressUntil(page, key, () => locator.isVisible());
}

// 4T-001410 (Epic 3E-000272): Derselbe Verlust bei einem Tastendruck, der NICHT
// idempotent ist — F3 der Bereichs-Suche rueckt den Trefferzeiger je Druck um
// eins weiter. `pressUntil` ist dort verboten: Es prueft die Bedingung vor jedem
// Druck und wuerde einen bloss VERZOEGERTEN Druck fuer einen verlorenen halten,
// also zwei Treffer weiterspringen und den Fall aus einem anderen Grund rot
// machen.
//
// Gemessen am 2026-09-05 ueber 44 Laeufe des Prueffalls BS-05: In den roten
// Laeufen erreicht ein Tastendruck das Dokument ueberhaupt nicht — nicht in der
// Capture-Phase, nicht in der Bubble-Phase —, waehrend Suchraum, Zeiger, Fokus
// und Sichtbarkeit der Suchleiste unveraendert bleiben und `document.hasFocus()`
// durchgehend `true` ist. Wo ein Druck ankommt, wirkt die Kette vollstaendig und
// die Wirkung steht binnen 10 bis 20 ms.
//
// Daraus folgt die Trennung, die dieser Helfer zieht: Ein Nachfassen nach einer
// Frist, die um Groessenordnungen ueber der gemessenen Reaktionszeit liegt,
// trifft mit Sicherheit einen VERLORENEN und nicht einen langsamen Druck.
// Deshalb wird hier genau einmal je Versuch nachgefasst, statt in einer engen
// Schleife zu druecken.
//
// Die Zusicherung bleibt streng: Erwartet wird der GENAUE Ziel-Zustand. Springt
// ein doppelt zugestellter Druck zu weit, ist die Bedingung nie erfuellt und der
// Fall wird rot — genau so, wie er es soll.
const NACHFASS_FRIST_MS = 1000;

/**
 * Druecken und bei ausbleibender Wirkung nachfassen, fuer Tastendrucke, deren
 * Wirkung sich nicht wiederholen laesst.
 *
 * @param {object} page Playwright-Seite.
 * @param {string} key Taste, z.B. 'F3'.
 * @param {() => Promise<boolean>|boolean} bedingung Der genaue Ziel-Zustand.
 * @param {object} [opts]
 * @param {number} [opts.versuche] Zahl der Zustell-Versuche (Vorgabe 5).
 * @param {number} [opts.fristMs] Wartezeit je Versuch (Vorgabe 1000).
 */
async function pressNachfassend(page, key, bedingung, opts = {}) {
  const versuche = opts.versuche || 5;
  const fristMs = opts.fristMs || NACHFASS_FRIST_MS;
  for (let i = 0; i < versuche; i++) {
    await page.keyboard.press(key);
    const bis = Date.now() + fristMs;
    while (Date.now() < bis) {
      if (await bedingung()) return;
      await page.waitForTimeout(25);
    }
  }
  // Letzte Chance mit voller Zeitgrenze: Ist die Wirkung auch jetzt nicht da,
  // liegt es nicht an der Zustellung, und der Fall soll mit seiner eigenen
  // Aussage scheitern statt mit der des Helfers.
  await expect.poll(async () => bedingung(), { timeout: 5000 }).toBe(true);
}

module.exports = { pressUntil, pressUntilVisible, pressNachfassend, NACHFASS_FRIST_MS };
