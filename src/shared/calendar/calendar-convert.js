// 4T-001874 (Epic 3E-000323): Entsprechungen eines Zeitpunkts in den übrigen
// Zeitrechnungen desselben Blocks — die Zusammenstellung für den Dialog
// «Datum umrechnen». Prozess-neutral (kein DOM, kein Electron).
//
// Dieses Modul rechnet nicht selbst: Jede Zeile entsteht mit convertBetween
// des Kerns, also über die Block-Achse mit der einen Abrundung. Der Block ist
// die gemeinsame Bezugsgröße und bleibt die Grenze (Entscheidung des Product
// Owners vom 2026-10-03): Die Funktion nimmt deshalb den Block entgegen und
// kennt keinen Weg zu einer Zeitrechnung außerhalb.
//
// Import-Richtung: Dieses Modul lädt den Kern, nie umgekehrt.
'use strict';

const { validateTuple, convertBetween } = require('./calendar-core.js');

// Zeilen-Code des vorgesehenen Falls «nicht bekannt»: eine Ziel-Zeitrechnung,
// die den Tag außerhalb ihres Geltungs-Zeitraums nicht kennt. Heute liefert
// ihn keine Definition; die Auskunfts-Form des Dialogs sieht ihn vor.
const EQUIVALENT_UNKNOWN = 'unknown';

// Liefert { ok: true, rows } oder { ok: false, code }.
//   code   unknownCalendar, wenn fromId im Block fehlt; sonst der Fehler-Code
//          der Gültigkeits-Prüfung des Ausgangs-Tupels.
//   rows   je WEITERE Zeitrechnung des Blocks in Block-Reihenfolge
//          { calendar, ok: true, tuple } oder { calendar, ok: false, code }
//          mit code outOfRange bzw. unknown. Leer = keine zweite Zeitrechnung.
function blockEquivalents(block, fromId, tuple) {
  if (!block || !Array.isArray(block.calendars)) return { ok: false, code: 'unknownCalendar' };
  const from = block.calendars.find((x) => x && x.id === fromId);
  if (!from) return { ok: false, code: 'unknownCalendar' };
  const v = validateTuple(from, tuple);
  if (!v.ok) return { ok: false, code: v.code };
  const rows = [];
  for (const calendar of block.calendars) {
    if (!calendar || calendar === from) continue;
    const result = convertBetween(from, tuple, calendar);
    rows.push(
      result.ok
        ? { calendar, ok: true, tuple: result.tuple }
        : { calendar, ok: false, code: result.code },
    );
  }
  return { ok: true, rows };
}

module.exports = { blockEquivalents, EQUIVALENT_UNKNOWN };
