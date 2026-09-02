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

module.exports = { pressUntil, pressUntilVisible };
