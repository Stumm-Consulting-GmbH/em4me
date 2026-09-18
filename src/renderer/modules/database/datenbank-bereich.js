// 4T-001758 (Epic 3E-000253): Der eine Helfer, über den der Anzeige-Prozess
// erfährt, ob der gebundene Bereich eine Datenbank führt.
//
// **Warum genau einer.** Die Auskunft brauchen in dieser und den folgenden
// Stufen mehrere Stellen: der Einstellungs-Bereich, das Ansichtsmenü, das
// Kontextmenü des Bereichs-Panels und die Übersichts-Seite. Drei eigene
// Prüfungen wären drei Gelegenheiten, verschieden zu antworten — und die
// Antwort kostet einen IPC-Aufruf, den niemand mehrfach bezahlen soll. Wer die
// Frage stellt, stellt sie hier.
//
// **Die Antwort wird gehalten, bis der Bereich wechselt.** Der Bestand ändert
// sich nicht im Takt der Bedienung; ein Zwischenspeicher je Fenster genügt.
// `verwirfDatenbankAuskunft()` verwirft ihn beim Bereichs-Wechsel
// (app-broadcasts.js), danach fragt der nächste Aufruf neu.
//
// Der Katalog-Kanal liefert die Bereichs-Art als Feld neben Steckbrief,
// Tabellen und Fehlerlagen; die Begründung dieses Zuschnitts steht im
// Katalog-Modul des Haupt-Prozesses.
'use strict';

import { api } from '../app/api.js';

// Letzte Antwort des Kanals; null = noch nicht geholt oder verworfen.
let auskunft = null;
// Laufende Anfrage, damit gleichzeitige Aufrufer sich eine teilen.
let laufend = null;
// 4T-001759: Die zuletzt BEREITE Antwort für den gebundenen Bereich. Sie
// überlebt eine Index-Meldung und fällt erst mit dem Bereichs-Wechsel weg;
// aus ihr antwortet `istDatenbankBereichSofort()` ohne Warten.
let zuletztBereit = null;

// Die leere Auskunft. Sie ist kein Fehler, sondern die Aussage «ohne
// gebundenen Bereich» beziehungsweise «Index noch nicht bereit»; der Status
// daneben sagt, welcher der beiden Fälle vorliegt.
function leereAuskunft(status = 'unavailable') {
  return { status, istDatenbankBereich: false, steckbrief: null, tabellen: [], hints: [] };
}

/**
 * Die Datenbank-Auskunft des gebundenen Bereichs, aus dem Zwischenspeicher
 * oder frisch geholt.
 *
 * Wirft nie: Ein gescheiterter Kanal-Aufruf wird zur leeren Auskunft, weil ein
 * Bedienelement, das sich nicht zeigt, immer noch besser ist als eine Ansicht,
 * die am Fehler hängen bleibt.
 *
 * **Gehalten wird nur eine BEREITE Antwort.** Solange der Index einer eben
 * geöffneten Wurzel noch aufgebaut wird, lautet der Status «indexing» und die
 * Bereichs-Art `false` — nicht weil keine Datenbank da wäre, sondern weil noch
 * niemand nachgesehen hat. Diese Antwort im Zwischenspeicher festzuhalten,
 * hieße, einen Datenbank-Bereich bis zum nächsten Bereichs-Wechsel als
 * gewöhnlichen zu führen. Ein unbereiter Stand und der Fehlerfall werden
 * deshalb durchgereicht und nicht gehalten; der nächste Aufruf fragt neu.
 *
 * @returns {Promise<object>} { status, istDatenbankBereich, steckbrief, tabellen, hints }
 */
export async function datenbankAuskunft() {
  if (auskunft) return auskunft;
  if (laufend) return laufend;
  laufend = (async () => {
    let antwort;
    try {
      antwort = await api.databaseOverview({});
    } catch {
      antwort = null;
    }
    laufend = null;
    if (!antwort) return leereAuskunft();
    const stand = {
      status: antwort.status || 'unavailable',
      istDatenbankBereich: antwort.istDatenbankBereich === true,
      steckbrief: antwort.steckbrief || null,
      tabellen: Array.isArray(antwort.tabellen) ? antwort.tabellen : [],
      hints: Array.isArray(antwort.hints) ? antwort.hints : [],
    };
    if (stand.status === 'ready') {
      auskunft = stand;
      zuletztBereit = stand;
    }
    return stand;
  })();
  return laufend;
}

/**
 * Führt der gebundene Bereich eine Datenbank?
 *
 * @returns {Promise<boolean>} true, sobald ein Dokument des Bereichs einen
 *   Datenbank-Steckbrief trägt.
 */
export async function istDatenbankBereich() {
  return (await datenbankAuskunft()).istDatenbankBereich;
}

/**
 * Dieselbe Frage ohne Warten: die zuletzt BEREITE Antwort für diesen Bereich.
 *
 * 4T-001759 (Epic 3E-000253): Zwei Verbraucher müssen synchron entscheiden und
 * können nicht warten — das Kontextmenü des Bereichs-Panels wird im Moment des
 * Klicks aufgebaut. Für sie hält der Helfer die zuletzt bereite Antwort fest,
 * und zwar über eine Index-Meldung hinweg: Der Zwischenspeicher oben wird bei
 * jedem Speichern im Bereich verworfen, und ein Menü-Eintrag, der nach jedem
 * Speichern verschwände, wäre schlechter als einer, der einen Augenblick lang
 * einen alten Stand zeigt. Zurückgesetzt wird die Antwort deshalb allein beim
 * Bereichs-Wechsel; sie gehört dem Bereich, nicht dem Bestands-Stand.
 *
 * Ohne bereite Antwort lautet sie `false`: Solange unbekannt ist, ob der
 * Bereich eine Datenbank führt, erscheint der Zugang nicht — dieselbe Linie wie
 * beim Einstellungs-Bereich aus 4T-001758.
 *
 * @returns {boolean} true, wenn die zuletzt bereite Antwort eine Datenbank nennt.
 */
export function istDatenbankBereichSofort() {
  return !!(zuletztBereit && zuletztBereit.istDatenbankBereich);
}

/**
 * Verwirft die gehaltene Auskunft. Aufzurufen, wenn sich der Bestand unter ihr
 * geändert haben kann — der Bereichs-Wechsel und jede Index-Meldung.
 *
 * @param {object} [optionen] Aufruf-Optionen.
 * @param {boolean} [optionen.bereichsWechsel] Der Bereich selbst hat gewechselt;
 *   dann fällt zusätzlich die synchrone Antwort weg, weil sie zum alten Bereich
 *   gehört (4T-001759).
 */
export function verwirfDatenbankAuskunft({ bereichsWechsel = false } = {}) {
  auskunft = null;
  laufend = null;
  if (bereichsWechsel) zuletztBereit = null;
}

// Der Index meldet jede Änderung seines Bestands und ausdrücklich auch sein
// Fertigwerden. Beides geht die Auskunft an: Wer einen Steckbrief schreibt,
// macht den Bereich damit zur Datenbank, und wer die Anwendung auf einer
// Datenbank öffnet, hat bis zum Fertigwerden noch keine Antwort über den
// Bestand, sondern nur über den Aufbau. Die Meldung verwirft deshalb die
// gehaltene Auskunft; der nächste Frager holt den neuen Stand.
//
// Bewusst nur verwerfen und nicht selbst nachladen: Der Helfer weiß nicht, wer
// ihn gerade braucht, und eine Anfrage auf Vorrat liefe bei jedem Speichern im
// Bereich mit. Was eine offene Ansicht daraufhin tut, entscheidet sie selbst.
if (typeof api.onBacklinksInvalidated === 'function') {
  api.onBacklinksInvalidated(() => verwirfDatenbankAuskunft());
}
