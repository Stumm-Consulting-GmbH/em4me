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
import { afterAll, beforeEach } from 'vitest';
// 4T-002064: Die verschobene Uhr des Wanduhr-Wächters. Diese Datei ist die eine
// Vorbereitungs-Datei der Unit-Suite (`setupFiles` in vitest.config.mjs); ohne
// gesetzte Variable `EM4ME_UHR_VERSATZ` bleibt der Aufruf ohne Wirkung.
// Bauart und Grenzen stehen in test/uhr-versatz.js.
import { installiereAusUmgebung } from './uhr-versatz.js';
// 4T-002883: Kein Zeitgeber überlebt das Ende seiner Prüfdatei. Das Buch wird
// hier geführt, weil diese Datei vor jeder Prüfdatei läuft; ihr Abbau-Haken
// läuft nach den Abbau-Haken der Prüfdatei selbst (Haken laufen in umgekehrter
// Reihenfolge ihrer Anmeldung). Bauart und Grenzen stehen in
// test/zeitgeber-am-datei-ende.js.
import {
  fuehreBuch,
  loescheOffene,
  meldeSpur,
  spurEin,
  zaehleSofortige,
  meldeSofortSpur,
} from './zeitgeber-am-datei-ende.js';
// 4T-002941: Das erschöpfte Zeitbudget des Zerlegers als Mess-Schalter; ohne
// gesetzte Variable `EM4ME_ZERLEGE_BUDGET` bleibt der Aufruf ohne Wirkung.
// Bauart und Grenzen stehen in test/zerlege-budget.js.
import { installiereAusUmgebung as installiereZerlegeBudget } from './zerlege-budget.js';
// 4T-002945: Der Browser-Nachbildung fehlen zwei Layout-Funktionen an
// Text-Bereichen, die die Editor-Bibliothek aufruft; ohne Browser-Nachbildung
// tut der Aufruf nichts. Bauart und Grenzen stehen in test/browser-nachbildung.js.
import { ergaenzeAusUmgebung as ergaenzeTextBereiche } from './browser-nachbildung.js';
// 4T-002945: Die Rückrufe des nächsten Bilds sofort, als Mess- und
// Prüf-Schalter für den Zustand unter Last; ohne gesetzte Variable
// `EM4ME_BILD_RUECKRUFE` ohne Wirkung. Bauart in test/bild-rueckrufe.js.
import { installiereAusUmgebung as installiereBildRueckrufe } from './bild-rueckrufe.js';

installiereAusUmgebung();
installiereZerlegeBudget();
ergaenzeTextBereiche();
installiereBildRueckrufe();

const zeitgeberBuch = fuehreBuch();
// 4T-002945: Unter der Spur zählt die Vorbereitung zusätzlich die Rückrufe von
// `setImmediate`; ohne die Spur bleibt `setImmediate` unberührt.
const sofortZaehler = spurEin() ? zaehleSofortige() : null;
afterAll(() => {
  meldeSpur(loescheOffene(zeitgeberBuch));
  if (sofortZaehler) meldeSofortSpur(sofortZaehler);
});

beforeEach(({ task }) => {
  task.meta.zeitgrenze = task.timeout;
});
