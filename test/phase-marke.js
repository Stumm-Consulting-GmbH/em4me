// 4T-001632 (Epic 3E-000156): Die Phasen-Marke des Lese-Hooks.
//
// **Wozu.** Die Erhebung vom 2026-09-09 hat gezeigt, dass nicht die Menge der
// gelesenen Dateien ueber das Risiko einer Zeitgrenze entscheidet, sondern der
// ORT der Lesung: `testTimeout` bemisst den Rumpf eines Prueffalls. Wer den
// Bestand im Modulkopf liest, faellt nicht darunter — `roadmap-zuordnung` liest
// 1831 Dateien und hat 3 ms Fall-Zeit. Wer denselben Baum hinter einer
// verzoegerten Auswertung im ersten Prueffall liest, faellt darunter; genau so
// waren die drei Faelle aus 4T-001631 gebaut, die am 2026-09-08 das
// Integrationstor geschlossen haben.
//
// Statisch ist das nicht entscheidbar. `save-guard-aufrufer` haelt seinen Baum
// hinter `let gelesen = null` und liest ihn ueber eine Hilfsfunktion beim
// ersten Zugriff; eine Quelltext-Regel, die auf Aufrufe innerhalb von `it(...)`
// sieht, faende genau diesen Fall nicht. Gemessen wird deshalb zur Laufzeit.
//
// **Wie.** Zwei globale Haken setzen eine Marke in der Prozess-Umgebung, die
// der Lese-Hook (scripts/eingaben-spur.js) je Zugriff liest. Die Umgebung ist
// bewusst der Traeger und nicht `globalThis`: Der Hook wird als `--require` in
// den Prozess geladen, die Pruefdatei laeuft im Modul-Laufer von Vitest, und
// `process` ist die eine Sache, die beide sicher teilen.
//
// **Kostenfrei ausserhalb der Messung.** Ohne `FS_SPUR_FALL` registriert diese
// Datei nichts und kehrt sofort zurueck. Der Normal-Lauf zahlt einen Import
// eines leeren Moduls, keinen Haken je Prueffall.
// `process` ausdruecklich importiert statt als Global genommen: Die
// ESLint-Konfiguration der Prüfdateien kennt die Node-Globalen nicht, weil
// Prüfdateien im Vitest-Umfeld laufen. Diese Datei ist die Ausnahme — sie ist
// eine Setup-Datei und redet mit dem Prozess.
import process from 'node:process';
import { beforeEach, afterEach } from 'vitest';

if (process.env.FS_SPUR_FALL) {
  beforeEach(() => {
    process.env.EM4ME_IM_PRUEFFALL = '1';
  });
  afterEach(() => {
    process.env.EM4ME_IM_PRUEFFALL = '0';
  });
}
