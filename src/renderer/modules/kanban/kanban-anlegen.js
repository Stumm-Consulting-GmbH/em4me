// 4T-001852 (Epic 3E-000110): Die beiden Wege zu einer Tafel — ein neues
// Dokument, das bereits eine ist, und das Umwandeln eines leeren.
//
// **Warum beide hier und nicht in der Tafel-Ansicht nebenan** (`kanban-pane.js`):
// Jene lebt an der gezeichneten Fläche. Beide Wege dieses Moduls setzen an, wo
// es noch keine gibt — das neue Dokument existiert noch nicht, und das leere
// Dokument ist keine Tafel, also zeichnet die Fläche nicht und ihr Schreibweg
// greift nicht. Der Schreibweg ist deshalb der **Editor-Schreibweg**, derselbe,
// den die Karten- und Spalten-Bedienung als `schreibeDokument` bekommt: eine
// Transaktion, ein Rückgängig-Schritt (AK8).
//
// **Der Startinhalt kommt aus dem Format-Kern** und nicht aus einer Text-Vorlage
// hier: `erzeugeTafel` ist die eine Stelle, an der ein Tafel-Dokument entsteht,
// und beide Wege rufen sie mit denselben Angaben (AK3). Dieses Modul steuert
// allein die **Sprache** bei — der Kern kennt keine —, also die drei
// Spalten-Titel und den Wortlaut des Erledigt-Kennzeichens aus der eingestellten
// Programmsprache.
//
// **Der Zugang wird hereingereicht statt importiert**, nach dem Muster von
// `kanban-pane.js` und aus demselben Grund: Ein Import des Fenster-Zustands oder
// des Editors zöge diesen Ordner in den eingefrorenen Datei-Zyklus des
// Renderers. `i18n` bildet keinen Kreis und bleibt ein gewöhnlicher Import.
'use strict';

import { t } from '../../i18n.js';
import { erzeugeTafel } from '../../../shared/kanban/kanban-operationen.js';
import { dokumentIstLeer } from '../../../shared/commands/command-availability.js';

// Die Spalte, die hineingezogene Karten abhakt: die dritte. Sie steht hier und
// nicht im Kern, weil sie zum Zuschnitt des Startinhalts gehört und nicht zur
// Grammatik des Formats.
const ERLEDIGT_SPALTE = 2;

let umgebung = null;

/**
 * Verdrahtet die beiden Anlege-Wege mit dem Fenster-Zustand.
 *
 * @param {object} zugang
 * @param {Function} zugang.aktivesDokument (paneIdx) => geöffnetes Dokument oder null.
 * @param {Function} zugang.neuesDokument ({inhalt, viewMode}) => void. Legt ein
 *   neues, unbenanntes Dokument an und öffnet es (der Weg von «Datei → Neu»).
 * @param {Function} [zugang.istAenderbar] (paneIdx) => boolean. Darf das
 *   Dokument der Spalte gerade geschrieben werden?
 * @param {Function} [zugang.schreibeDokument] (paneIdx, {vonZeile, bisZeile, text})
 *   => boolean. Ersetzt den Zeilen-Bereich im Editor der Spalte als **eine**
 *   Transaktion.
 * @param {Function} [zugang.hinweis] (schluessel) => void. Sagt eine Fehl-Lage
 *   in der Statusleiste.
 */
export function initTafelAnlegen(zugang) {
  umgebung = zugang || null;
}

function rufeZugang(name, ...args) {
  if (!umgebung || typeof umgebung[name] !== 'function') return false;
  return umgebung[name](...args);
}

function zeigeHinweis(schluessel) {
  rufeZugang('hinweis', schluessel);
}

/**
 * Der Startinhalt beider Wege: Kopf-Kennzeichen und drei Spalten, die dritte
 * mit der Erledigt-Einstellung.
 *
 * @param {string} [vorlage] vorhandener Dokument-Text (leer oder Leerraum); er
 *   gibt die Zeilenenden-Konvention vor.
 * @returns {string|null} der Text, oder null, wenn der Kern ihn abgelehnt hat.
 */
export function tafelStartInhalt(vorlage = '') {
  const ergebnis = erzeugeTafel(vorlage, {
    spaltenTitel: [
      t('kanban.startSpalteZuErledigen'),
      t('kanban.startSpalteInArbeit'),
      t('kanban.startSpalteErledigt'),
    ],
    erledigtSpalte: ERLEDIGT_SPALTE,
    // Derselbe Wortlaut, den die Spalten-Bedienung setzt, und derselbe, den das
    // Vorbild-Werkzeug in dieser Sprache liest.
    erledigtWortlaut: t('kanban.erledigtKennzeichen'),
  });
  return ergebnis.ok ? ergebnis.text : null;
}

/**
 * Legt ein neues Dokument an, das bereits eine Tafel ist, und öffnet es in der
 * Tafel-Ansicht (Kommando `kanban.newBoard`, AK1).
 *
 * Der Ansichts-Modus wird beim Anlegen mitgegeben und nicht nachträglich
 * geschaltet: Das Dokument ist von seiner ersten Zeile an eine Tafel, und ein
 * Umschalten danach zeigte dem Anwender für einen Augenblick die Lese-Ansicht.
 *
 * @returns {boolean}
 */
export function legeNeueTafelAn() {
  const inhalt = tafelStartInhalt('');
  if (inhalt === null) return false;
  return rufeZugang('neuesDokument', { inhalt, viewMode: 'kanban' }) !== false;
}

/**
 * Wandelt das leere Dokument der Spalte in eine Tafel um (Kommando
 * `kanban.convertToBoard`, AK2).
 *
 * Jede Fehl-Lage wird **gesagt** statt still verworfen (Guard-Muster der
 * Tafel-Ansicht): Das Menü hält den Eintrag in beiden Lagen deaktiviert, aber
 * ein selbst belegtes Tastenkürzel kommt an ihm vorbei, und ein stiller
 * Fehlschlag wäre für den Nutzer nicht von einem Fehler zu unterscheiden.
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function wandleInTafelUm(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  if (!tab || tab.systemPage || tab.manualPage || !dokumentIstLeer(tab.content)) {
    zeigeHinweis('kanban.nichtLeer');
    return false;
  }
  if (!umgebung || typeof umgebung.schreibeDokument !== 'function') return false;
  if (typeof umgebung.istAenderbar === 'function' && umgebung.istAenderbar(paneIdx) !== true) {
    zeigeHinweis('kanban.nurLesbar');
    return false;
  }
  const vorlage = typeof tab.content === 'string' ? tab.content : '';
  const inhalt = tafelStartInhalt(vorlage);
  if (inhalt === null) return false;
  // Der ganze Bestand wird ersetzt: Er besteht aus nichts als Leerraum, und
  // etwas daraus zu erhalten hieße, es zwischen Kopf und erste Spalte zu
  // schieben. Die Zeilen-Nummern sind 1-basiert wie im Editor.
  const zeilen = vorlage === '' ? 1 : vorlage.split('\n').length;
  return (
    umgebung.schreibeDokument(paneIdx, { vonZeile: 1, bisZeile: zeilen, text: inhalt }) !== false
  );
}
