// 4T-001949 (Epic 3E-000156): Die wirksame Zeitgrenze je Prüffall im
// Maschinen-Bericht.
//
// **Wozu.** scripts/zeitgrenzen-abstand.js meldet Fälle, die mehr als die Hälfte
// ihrer Zeitgrenze verbrauchen, bevor sie reißen. Der Maschinen-Bericht
// `test-berichte/unit.json` trägt je Fall die Dauer, aber nicht die Grenze, gegen
// die sie lief. Eine Ermittlung aus dem Quelltext kennt die datei-weite Grenze
// aus `vi.setConfig`, aber nicht sicher das dritte Argument eines einzelnen
// Falls oder seine Options-Form: Belegt am 2026-09-30 an `backlinks`, dessen
// teuerster Fall `SCHWER_ZEITLIMIT` als drittes Argument trägt und damit bei
// 5,5 Prozent liegt, gegen die Datei-Voreinstellung gerechnet aber bei 66.
//
// **Wie.** Vitest hält die wirksame Grenze je Fall in `task.timeout` fest, und
// zwar beim Einsammeln des Falls: die Voreinstellung, ein vorher gesetztes
// `vi.setConfig({ testTimeout })` oder die Angabe am Fall selbst. Genau dieser
// Wert bemisst den Rumpf. Diese Datei schreibt ihn vor jedem Fall in
// `task.meta`, und der JSON-Reporter legt `meta` je Fall im Bericht ab. Geprüft
// am 2026-09-30 an einer Probe mit allen drei Formen (Lösungs-Kapitel des
// Vorgangs).
//
// **Kosten.** Ein Haken je Fall mit einer Zuweisung; kein Datei-Zugriff, kein
// Import außer dem Haken selbst.
import { beforeEach } from 'vitest';
// 4T-002064: Die verschobene Uhr des Wanduhr-Wächters. Diese Datei ist die eine
// Vorbereitungs-Datei der Unit-Suite (`setupFiles` in vitest.config.mjs); ohne
// gesetzte Variable `EM4ME_UHR_VERSATZ` bleibt der Aufruf ohne Wirkung.
// Bauart und Grenzen stehen in test/uhr-versatz.js.
import { installiereAusUmgebung } from './uhr-versatz.js';

installiereAusUmgebung();

beforeEach(({ task }) => {
  task.meta.zeitgrenze = task.timeout;
});
