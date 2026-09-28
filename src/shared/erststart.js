// 4T-001881 (Epic 3E-000185): Der Merker des ersten Starts — eine Erkennung
// für alle, die sie brauchen.
//
// Bis hierher war der Store-Schlüssel eine private Konstante der geführten
// Produkt-Tour (src/renderer/modules/tour/tour.js, 4T-000644): Sie startet beim
// allerersten Start von selbst, solange der Merker noch nie gesetzt wurde, und
// schreibt ihn beim Ende der Tour genau einmal — bei Abschluss wie bei Abbruch.
//
// Mit dem Start-Modus «Einsteiger» für neue Installationen (Entscheidung E11
// des Epics vom 2026-09-22) fragt eine ZWEITE Stelle dieselbe Frage, und zwar
// im Main-Prozess beim Laden des Einstellungs-Speichers
// (src/main/app/settings-store.js). Zwei nebeneinander stehende Erkennungen
// desselben Sachverhalts liefen früher oder später auseinander; deshalb liegt
// der Schlüssel hier und nicht zweimal als Zeichenkette im Code.
//
// Prozessneutral (CJS, reine Daten, kein Electron, kein DOM): Main liest den
// Merker über den Store, der Renderer über die Einstellungs-Brücke.
//
// Der Merker hat bewusst KEINEN Vorgabewert im Store. Erst der Zustand «noch
// nie gesetzt» belegt den ersten Start; ein gesetzter Wert — gleich welcher —
// sagt «schon einmal dagewesen».
'use strict';

const TOUR_SEEN_KEY = 'tourSeen';

module.exports = { TOUR_SEEN_KEY };
