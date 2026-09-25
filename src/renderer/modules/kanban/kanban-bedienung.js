// 4T-001849 (Epic 3E-000110): Bedienung der Karten auf der Tafel — Anlegen,
// Bearbeiten, Löschen und Statuswechsel.
//
// **Warum ein eigenes Modul neben `kanban-tafel.js`.** Die Zeichnung ist eine
// Abbildung des Modells und bleibt es; die Bedienung ist der umgekehrte Weg und
// trägt allein den Zustand einer angefangenen Handlung (offene Eingabe,
// wartende Auswahl). Derselbe Schnitt wie bei der räumlichen Arbeitsfläche
// (`canvas-view.js` gegen `canvas-bedienung.js`) und aus demselben Grund.
//
// **Abhängigkeits-frei wie die Zeichnung** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n`. Übersetzung, Dokument-Text,
// Änderbarkeit, Schreibweg, Statuswechsel und das Kontextmenü kommen als
// Rückrufe herein. Damit bleibt der Ordner ausserhalb des großen Datei-Zyklus
// des Anzeige-Prozesses, den der Ordner-Import-Wächter eingefroren hat.
//
// **Der Schreibweg ist für alle Handlungen derselbe** und steht als `wendeAn`
// eigens bereit, weil die Folge-Vorgänge dieser Ausbaustufe (Verschieben,
// Spalten-Bedienung) darauf aufsetzen: Text-Operation des Format-Kerns rufen,
// bei einem Befund melden statt schreiben, sonst **eine** Übernahme in das
// Dokument. Eine Bedien-Handlung ist damit genau eine Transaktion und ein
// einziger Rückgängig-Schritt (AK5).
//
// **Der Statuswechsel läuft ausdrücklich NICHT über den Format-Kern.** Er geht
// über die Status-Kette der Anwendung (`performStatusToggle`, hereingereicht),
// weil dort die Automatik-Daten und die Wiederholung hängen; eine zweite
// Status-Logik entsteht nicht (Story 4S-000973).
//
// **Rückgängig gehört zur Fläche, nicht zum Editor** (Nachtrag vom 2026-09-21).
// Der Tafel-Modus blendet `.pane-source` aus, genau wie der Canvas-Modus
// (`kanban.css` neben `canvas.css`); das Tastenkürzel-Verzeichnis der
// EditorView hängt aber an deren Inhalts-Element und ist damit unerreichbar.
// Ohne eigenen Weg liefe `Strg+Z` auf der Tafel ins Leere — und das Löschen
// einer Karte ist bewusst ohne Rückfrage, weil der eine Rückgängig-Schritt es
// sichert. Die Fläche nimmt die Tasten deshalb selbst entgegen und reicht sie
// über `beiRueckgaengig`/`beiWiederholen` an **dieselbe** Historie der Spalte
// weiter, in die auch jede Bedien-Handlung schreibt. Eine zweite Undo-Logik
// entsteht nicht; der Griff ist wörtlich der der räumlichen Arbeitsfläche
// (`canvas-bedienung.js`).
'use strict';

import { legeKarteAn, loescheKarte } from '../../../shared/kanban/kanban-operationen.js';
import { KARTE_KLASSE, SPALTE_KLASSE, waehleKarte } from './kanban-tafel.js';
import { tagVerweisAn } from './kanban-tags.js';
import { terminAbzeichenAn } from './kanban-marker.js';
import { aendereKarteUndSchreibeUm, createTerminBedienung } from './kanban-termin.js';
import { createArchivBedienung } from './kanban-archivieren.js';

// Klassen-Namen der Bedien-Elemente an einer Stelle, wie in der Zeichnung.
export const NEU_KLASSE = 'kanban-spalte-neu';
export const EINGABE_KLASSE = 'kanban-karte-eingabe';

// Die Befund-Codes der Text-Operationen, für die es einen eigenen Satz gibt.
// Ein unbekannter Code fällt auf den allgemeinen Satz zurück — eine Erweiterung
// des Kerns darf die Meldung nie stumm machen.
const BEFUND_SCHLUESSEL = {
  keinTafelDokument: 'kanban.verworfen',
  unbekannteSpalte: 'kanban.verworfen',
  unbekannteKarte: 'kanban.verworfen',
  keineAufgabenZeile: 'kanban.verworfen',
};

/**
 * Der kleinste Zeilen-Bereich, in dem sich zwei Fassungen desselben Dokuments
 * unterscheiden.
 *
 * **Warum nicht das ganze Dokument ersetzt wird:** Die Text-Operationen liefern
 * den vollen neuen Text, aber eine Transaktion über das ganze Dokument setzte
 * Schreibmarke und Faltungen des Editors zurück, obwohl sich eine Zeile
 * geändert hat. Gesucht wird deshalb der gemeinsame Anfang und das gemeinsame
 * Ende **zeilenweise**; ersetzt wird nur, was dazwischen liegt.
 *
 * Die Zeilen-Nummern sind 1-basiert wie im Editor. `bisZeile < vonZeile` heißt
 * «nichts zu ersetzen, nur einfügen» — derselbe Vertrag wie beim Schreibweg der
 * räumlichen Arbeitsfläche.
 *
 * @param {string} alt Bisheriger Dokument-Text.
 * @param {string} neu Neuer Dokument-Text.
 * @returns {{vonZeile: number, bisZeile: number, text: string}|null} `null`,
 *   wenn beide Fassungen gleich sind.
 */
export function zeilenAenderung(alt, neu) {
  const a = String(alt == null ? '' : alt);
  const b = String(neu == null ? '' : neu);
  if (a === b) return null;
  const az = a.split('\n');
  const bz = b.split('\n');
  let vorn = 0;
  while (vorn < az.length && vorn < bz.length && az[vorn] === bz[vorn]) vorn++;
  let hinten = 0;
  while (
    hinten < az.length - vorn &&
    hinten < bz.length - vorn &&
    az[az.length - 1 - hinten] === bz[bz.length - 1 - hinten]
  ) {
    hinten++;
  }
  return {
    vonZeile: vorn + 1,
    bisZeile: az.length - hinten,
    text: bz.slice(vorn, bz.length - hinten).join('\n'),
  };
}

// Eine Eingabe ist einzeilig: Ein eingefügter Umbruch würde sonst eine zweite
// Aufgaben-Zeile erzeugen oder die Struktur der Tafel zerreissen. Er wird
// deshalb zu einem Leerzeichen, statt die Übernahme zu verweigern — der
// Anwender hat den Text gemeint, nicht den Umbruch.
function einzeilig(wert) {
  return String(wert == null ? '' : wert)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function zahlAn(el, feld) {
  const wert = Number(el && el.dataset ? el.dataset[feld] : NaN);
  return Number.isFinite(wert) ? wert : null;
}

/**
 * Verdrahtet die Karten-Bedienung mit einer gezeichneten Tafel.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.container Container der Ansicht; er überlebt jede
 *   Zeichnung und trägt deshalb die Zuhörer.
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} ctx.quelle () => Dokument-Text, auf dem die Tafel beruht.
 * @param {Function} ctx.modell () => Modell aus `leseTafel` desselben Textes.
 * @param {Function} [ctx.aenderbar] () => boolean. Fehlt der Rückruf, gilt
 *   änderbar; der Schreibweg ist eigens gesichert.
 * @param {Function} [ctx.schreibe] ({ausgangsstand, text}) => boolean. Stellt
 *   den neuen Text als **eine** Transaktion in das Dokument und prüft vorher
 *   den Ausgangsstand (AK5, AK6).
 * @param {Function} [ctx.statusUmschalten] ({ausgangsstand, zeile}) => boolean.
 *   Der Weg der Lese-Ansicht: Status-Kette samt Automatik-Daten und
 *   Wiederholung, ein Rückgängig-Schritt. `zeile` ist 0-basiert wie im Modell.
 * @param {Function} [ctx.beiRueckgaengig] () => boolean, ein Schritt zurück in
 *   der Historie der Spalte. Fehlt er, bleibt `Strg+Z` auf der Tafel ohne
 *   Wirkung — genau der Stand der reinen Zeichnungs-Prüffälle.
 * @param {Function} [ctx.beiWiederholen] () => boolean, ein Schritt vorwärts.
 * @param {Function} [ctx.neuZeichnen] () => void.
 * @param {Function} [ctx.zeigeHinweis] (schluessel) => void.
 * @param {Function} [ctx.oeffneVerweis] (href) => void (4T-001904). Der Weg
 *   eines Tag-Verweises ins Tag-Panel; fehlt er, bleibt der Klick ohne Wirkung.
 * @param {Function} [ctx.waehleTermin] (optionen) => Promise<{date, time}|null>
 *   (4T-001903). Der Kalender-Wähler der Anwendung; fehlt er, bietet die Karte
 *   das Setzen eines Termins nicht an.
 * @param {Function} [ctx.zeigeMenue] ({x, y, eintraege}) => void. Fehlt der
 *   Rückruf, gibt es kein Kontextmenü — der Stand der reinen Prüffälle.
 * @param {Function} [ctx.schliesseMenue] () => void.
 * @returns {object} Steuerung für die Einbettung.
 */
export function createKartenBedienung(ctx) {
  const container = ctx.container;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  // Die offene Eingabe: entweder an einer vorhandenen Karte oder an einer neuen,
  // die es im Dokument noch nicht gibt.
  let bearbeitung = null;
  // Auswahl, die nach der nächsten Zeichnung gesetzt werden soll — nach dem
  // Löschen rückt sie auf die Nachbarkarte (Muster `oeffneNachRender` der
  // räumlichen Arbeitsfläche, dort für die Eingabe).
  let waehleNachRender = null;
  // Lag der Tastatur-Fokus vor der laufenden Zeichnung auf der Tafel? Siehe
  // `vorRender`/`nachRender` unten.
  let fokusWarHier = false;

  // Ohne Fokus auf dem Container erreicht kein Tastendruck die Fläche. Die
  // Karten tragen ihn aus der Zeichnung; verschwindet die fokussierte Karte
  // aber — beim Löschen oder bei jeder Neu-Zeichnung, die den Baum neu aufbaut
  // —, fiele er auf den Dokument-Rumpf zurück und `Strg+Z` ginge ins Leere.
  // `-1`: erreichbar per Skript, nicht in der Tabulator-Folge (Griff und
  // Begründung wörtlich von der räumlichen Arbeitsfläche).
  container.tabIndex = -1;

  function fokussiere() {
    if (typeof container.focus === 'function') container.focus();
  }

  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function quelle() {
    const text = typeof ctx.quelle === 'function' ? ctx.quelle() : null;
    return typeof text === 'string' ? text : null;
  }

  function modell() {
    return typeof ctx.modell === 'function' ? ctx.modell() : null;
  }

  function hinweis(schluessel) {
    if (typeof ctx.zeigeHinweis === 'function') ctx.zeigeHinweis(schluessel);
  }

  function neuZeichnen() {
    if (typeof ctx.neuZeichnen === 'function') ctx.neuZeichnen();
  }

  // --- Der gemeinsame Schreibweg -------------------------------------------------

  /**
   * Führt eine Text-Operation des Format-Kerns aus und übernimmt ihr Ergebnis.
   *
   * @param {Function} operation (text, angaben) => {ok, text}|{ok:false, befund}
   * @param {object} angaben Angaben der Operation.
   * @returns {boolean} `true`, wenn geschrieben wurde.
   */
  function wendeAn(operation, angaben) {
    if (!aenderbar()) return false;
    const ausgangsstand = quelle();
    if (ausgangsstand === null) {
      hinweis('kanban.verworfen');
      return false;
    }
    const ergebnis = operation(ausgangsstand, angaben);
    if (!ergebnis || ergebnis.ok !== true) {
      const code = ergebnis && ergebnis.befund ? ergebnis.befund.code : '';
      hinweis(BEFUND_SCHLUESSEL[code] || 'kanban.verworfen');
      neuZeichnen();
      return false;
    }
    // Eine Übernahme ohne Wirkung wäre ein leerer Rückgängig-Schritt.
    if (ergebnis.text === ausgangsstand) return false;
    if (typeof ctx.schreibe !== 'function') return false;
    const ok = ctx.schreibe({ ausgangsstand, text: ergebnis.text }) !== false;
    neuZeichnen();
    return ok;
  }

  // 4T-001903: Termin setzen, ändern und entfernen. Die Termin-Bedienung nutzt
  // denselben Schreibweg und dieselbe Kartensuche wie alle Handlungen hier.
  const termin = createTerminBedienung({
    t,
    karteImModell: (el) => karteImModell(el),
    quelle,
    aenderbar,
    wendeAn,
    waehleTermin: ctx.waehleTermin,
    hinweis,
  });

  // 4T-001906: Karte archivieren. Die Karte verlässt ihre Spalte auf demselben
  // Weg wie beim Löschen (`nimmHeraus`), nur mit einer anderen Operation.
  const archiv = createArchivBedienung({
    t,
    aenderbar,
    nimmHeraus: (el, operation, angaben) => nimmHeraus(el, operation, angaben),
  });

  // --- Zugriff auf Karten und Spalten --------------------------------------------

  function karteAn(ziel) {
    return ziel && typeof ziel.closest === 'function' ? ziel.closest(`.${KARTE_KLASSE}`) : null;
  }

  function spalteAn(ziel) {
    return ziel && typeof ziel.closest === 'function' ? ziel.closest(`.${SPALTE_KLASSE}`) : null;
  }

  function gewaehlteKarte() {
    return container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
  }

  function karteImModell(el) {
    const m = modell();
    const s = zahlAn(el, 'spalte');
    const k = zahlAn(el, 'karte');
    if (!m || !Array.isArray(m.spalten) || s === null || k === null) return null;
    const spalte = m.spalten[s];
    if (!spalte || !spalte.karten[k]) return null;
    return { spalte: s, karte: k, modell: spalte.karten[k] };
  }

  // --- Bearbeiten -----------------------------------------------------------------

  // Die Eingabe steht an der Stelle des Karten-Inhalts und nimmt den **rohen**
  // Karten-Text auf: Wer eine Karte schreibt, schreibt Markdown und soll es
  // auch sehen (Muster der Rohtext-Eingabe der Arbeitsfläche). Die
  // Marker-Segmente der Aufgaben-Zeile bleiben aussen vor — sie gehören der
  // Zeile und nicht dem Text, und der Format-Kern setzt sie unangetastet wieder
  // zusammen.
  function baueEingabe(wert) {
    const eingabe = document.createElement('input');
    eingabe.type = 'text';
    eingabe.className = EINGABE_KLASSE;
    eingabe.value = wert;
    eingabe.spellcheck = false;
    eingabe.addEventListener('keydown', beiEingabeTaste);
    eingabe.addEventListener('blur', () => {
      // Erst im nächsten Zyklus und nur, wenn dieselbe Bearbeitung noch offen
      // ist (Muster der Arbeitsfläche): Ohne den Aufschub käme der blur eines
      // Fokus-Wechsels der Übernahme zuvor.
      const meine = bearbeitung;
      setTimeout(() => {
        if (bearbeitung !== meine) return;
        uebernimm();
      }, 0);
    });
    return eingabe;
  }

  function oeffneBearbeitung(karteEl) {
    if (!aenderbar() || !karteEl) return false;
    if (bearbeitung) {
      if (bearbeitung.karteEl === karteEl) return true;
      uebernimm();
      if (!karteEl.isConnected) return false;
    }
    const treffer = karteImModell(karteEl);
    if (!treffer) return false;
    const inhalt = karteEl.querySelector('.kanban-karte-inhalt');
    if (!inhalt) return false;
    const eingabe = baueEingabe(String(treffer.modell.text == null ? '' : treffer.modell.text));
    inhalt.replaceWith(eingabe);
    karteEl.classList.add('kanban-karte-bearbeitet');
    bearbeitung = {
      neu: false,
      karteEl,
      eingabe,
      inhalt,
      spalte: treffer.spalte,
      karte: treffer.karte,
      quellText: eingabe.value,
    };
    eingabe.focus();
    const marke = eingabe.value.length;
    if (typeof eingabe.setSelectionRange === 'function') eingabe.setSelectionRange(marke, marke);
    return true;
  }

  /**
   * Öffnet die Eingabe einer **neuen** Karte am Fuss einer Spalte.
   *
   * Die Karte entsteht erst mit der Übernahme: Eine leer übernommene oder
   * verworfene Neu-Karte erzeugt weder einen Schreibvorgang noch einen
   * Rückgängig-Schritt. Eine zuerst angelegte und dann wieder gelöschte Karte
   * wären zwei Schritte für nichts.
   */
  function legeAn(spalteNr) {
    if (!aenderbar()) return false;
    if (bearbeitung) uebernimm();
    const m = modell();
    if (!m || !Array.isArray(m.spalten) || !m.spalten[spalteNr]) return false;
    const spalteEl = container.querySelector(`.${SPALTE_KLASSE}[data-spalte="${spalteNr}"]`);
    const liste = spalteEl ? spalteEl.querySelector('.kanban-spalte-karten') : null;
    if (!liste) return false;
    const karteEl = document.createElement('article');
    karteEl.className = `${KARTE_KLASSE} kanban-karte-bearbeitet kanban-karte-neu`;
    const eingabe = baueEingabe('');
    eingabe.placeholder = t('kanban.neueKarte');
    karteEl.appendChild(eingabe);
    liste.appendChild(karteEl);
    bearbeitung = { neu: true, karteEl, eingabe, inhalt: null, spalte: spalteNr, quellText: '' };
    eingabe.focus();
    if (typeof karteEl.scrollIntoView === 'function') karteEl.scrollIntoView({ block: 'nearest' });
    return true;
  }

  // Die Eingabe verschwindet; die Karte bekommt ihren gezeichneten Inhalt
  // zurück. Eine neue Karte verschwindet ganz — es gibt sie im Dokument nicht.
  function stelleWiederHer(b) {
    if (!b.karteEl || !b.karteEl.isConnected) return;
    if (b.neu) {
      b.karteEl.remove();
      return;
    }
    b.karteEl.classList.remove('kanban-karte-bearbeitet');
    if (b.eingabe.isConnected) b.eingabe.replaceWith(b.inhalt);
  }

  function brichAb() {
    if (!bearbeitung) return false;
    const b = bearbeitung;
    bearbeitung = null;
    stelleWiederHer(b);
    // Nach dem Verwerfen gehört die Tastatur wieder der Karte, sonst fiele der
    // Fokus auf den Dokument-Rumpf und `Entf` erreichte die Tafel nicht mehr.
    if (!b.neu && b.karteEl && b.karteEl.isConnected && typeof b.karteEl.focus === 'function') {
      b.karteEl.focus();
    }
    return true;
  }

  function uebernimm() {
    if (!bearbeitung) return false;
    const b = bearbeitung;
    bearbeitung = null;
    const neuerText = einzeilig(b.eingabe.value);
    stelleWiederHer(b);
    if (!b.neu && b.karteEl && b.karteEl.isConnected && typeof b.karteEl.focus === 'function') {
      b.karteEl.focus();
    }
    // Eine leere Neu-Karte entsteht nicht, und ein unveränderter Text wird
    // nicht geschrieben: Beides wäre ein Rückgängig-Schritt ohne Wirkung.
    if (b.neu) {
      if (neuerText === '') return false;
      return wendeAn(legeKarteAn, { spalte: b.spalte, kartenText: neuerText });
    }
    if (neuerText === '' || neuerText === b.quellText) return false;
    // 4T-001903: Die erste schreibende Bearbeitung schreibt einen lesbaren
    // Vorbild-Termin mit um — in derselben Transaktion wie der neue Text.
    return wendeAn(aendereKarteUndSchreibeUm, {
      spalte: b.spalte,
      karte: b.karte,
      kartenText: neuerText,
    });
  }

  // --- Löschen ---------------------------------------------------------------------

  /**
   * Löscht eine Karte samt ihren Folgezeilen.
   *
   * **Ohne Rückfrage** (Bedien-Entscheidung dieses Vorgangs): Das Löschen ist
   * eine Transaktion im Dokument und damit **ein** `Strg+Z` entfernt; eine
   * Rückfrage bei jeder Karte wäre ein Klick zu viel für eine Handlung, die
   * bereits gesichert ist.
   */
  function loesche(karteEl) {
    return nimmHeraus(karteEl, loescheKarte);
  }

  /**
   * Nimmt eine Karte aus ihrer Spalte — der gemeinsame Weg von Löschen und
   * Archivieren (4T-001906): Eine offene Eingabe an der Karte wird verworfen,
   * die Auswahl rückt nach, und die Operation des Kerns läuft als eine
   * Transaktion.
   */
  function nimmHeraus(karteEl, operation, angaben = {}) {
    if (!aenderbar() || !karteEl) return false;
    if (bearbeitung && bearbeitung.karteEl === karteEl) brichAb();
    const treffer = karteImModell(karteEl);
    if (!treffer) return false;
    // Die Auswahl wandert auf die nächste Karte der Spalte, sonst auf die
    // vorige, sonst nirgendwohin. Ohne den Nachzug stünde die Tafel danach
    // ohne Auswahl da, und die nächste Taste liefe ins Leere.
    const anzahl = modell().spalten[treffer.spalte].karten.length;
    waehleNachRender =
      anzahl > 1 ? { spalte: treffer.spalte, karte: Math.min(treffer.karte, anzahl - 2) } : null;
    const ok = wendeAn(operation, { ...angaben, spalte: treffer.spalte, karte: treffer.karte });
    if (!ok) waehleNachRender = null;
    return ok;
  }

  // --- Statuswechsel ------------------------------------------------------------------

  /**
   * Schaltet den Status einer Karte auf das Folge-Zeichen der Status-Kette.
   *
   * Der Weg ist **derselbe** wie beim Klick auf das Kästchen in der
   * Lese-Ansicht: Automatik-Daten und Wiederholung hängen dort und würden auf
   * einem eigenen Weg fehlen (Story 4S-000973).
   */
  function schalteStatus(karteEl) {
    if (!aenderbar() || !karteEl || typeof ctx.statusUmschalten !== 'function') return false;
    const treffer = karteImModell(karteEl);
    const ausgangsstand = quelle();
    if (!treffer || ausgangsstand === null) return false;
    const ok = ctx.statusUmschalten({ ausgangsstand, zeile: treffer.modell.zeile }) !== false;
    if (ok) neuZeichnen();
    return ok;
  }

  // --- Kontextmenü ----------------------------------------------------------------
  //
  // Nach dem Muster der räumlichen Arbeitsfläche: Das Menü entscheidet nichts,
  // es übersetzt eine Zeiger-Stelle in eine Liste von Handlungen, die es
  // anderswo schon gibt, und ruft dafür dieselben Griffe wie Doppelklick und
  // Tastatur. Im nicht änderbaren Dokument bleibt die Liste leer und das Menü
  // erscheint gar nicht — ein Rahmen ohne Inhalt sähe nach einem Fehler aus.

  function kartenEintraege(karteEl, ort) {
    return [
      {
        label: t('kanban.karteBearbeiten'),
        dataId: 'kanban-card-edit',
        action: () => oeffneBearbeitung(karteEl),
      },
      // 4T-001903: «Termin setzen…» und, wo es einen gibt, «Termin entfernen».
      ...termin.kartenEintraege(karteEl, ort),
      // 4T-001906: «Karte archivieren», hinter den Termin-Einträgen.
      ...archiv.kartenEintraege(karteEl),
      {
        label: t('kanban.karteLoeschen'),
        dataId: 'kanban-card-delete',
        action: () => loesche(karteEl),
      },
    ];
  }

  function beiKontextmenue(ereignis) {
    const ziel = ereignis.target;
    // In der offenen Eingabe gehört der Rechtsklick der Textfläche: Dort
    // erwartet der Anwender Ausschneiden, Kopieren und Einfügen.
    if (ziel && typeof ziel.closest === 'function' && ziel.closest(`.${EINGABE_KLASSE}`)) return;
    const karteEl = karteAn(ziel);
    if (!karteEl || !aenderbar() || typeof ctx.zeigeMenue !== 'function') return;
    ereignis.preventDefault();
    // Eine offene Eingabe wird übernommen: Der Rechtsklick ist der Beginn einer
    // anderen Handlung (Muster der Arbeitsfläche).
    uebernimm();
    waehleKarte(container, karteEl);
    ctx.zeigeMenue({
      x: ereignis.clientX,
      y: ereignis.clientY,
      eintraege: kartenEintraege(karteEl, { x: ereignis.clientX, y: ereignis.clientY }),
    });
  }

  // --- Zeiger und Tastatur ------------------------------------------------------------

  function beiKlick(ereignis) {
    const ziel = ereignis.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // 4T-001904: Ein Tag der Karte öffnet das Tag-Panel mit gesetztem Filter,
    // wie in der Lese-Ansicht — vor allen anderen Wegen, damit der Klick weder
    // die Karte wählt noch eine Eingabe öffnet. Allein Tags: Die übrigen
    // Verweise öffnen ein Dokument und verlassen damit die Tafel, das ist eine
    // eigene Bedien-Frage und nicht Gegenstand dieser Stufe.
    const tag = tagVerweisAn(ziel);
    if (tag) {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      if (typeof ctx.oeffneVerweis === 'function') ctx.oeffneVerweis(tag.getAttribute('href'));
      return;
    }
    // 4T-001903: Das Termin-Abzeichen öffnet den Kalender-Wähler. Es trägt seine
    // Kennung nur im änderbaren Dokument; eine offene Eingabe wird zuvor
    // übernommen, weil der Klick eine andere Handlung beginnt.
    const abzeichen = terminAbzeichenAn(ziel);
    if (abzeichen) {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      if (!aenderbar()) return;
      if (bearbeitung) uebernimm();
      termin.beiAbzeichen(abzeichen);
      return;
    }
    const knopf = ziel.closest(`.${NEU_KLASSE}`);
    if (knopf) {
      ereignis.preventDefault();
      legeAn(zahlAn(spalteAn(knopf), 'spalte'));
      return;
    }
    // Der Klick auf das Kästchen schaltet den Status — dieselbe Geste wie in
    // der Lese-Ansicht, nur auf der Karte.
    const kasten = ziel.closest('.kanban-karte-kasten');
    if (kasten) {
      const karteEl = karteAn(kasten);
      if (karteEl) {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        schalteStatus(karteEl);
      }
      return;
    }
    // Der Klick ausserhalb der offenen Eingabe übernimmt sie. Der blur der
    // Eingabe tut dasselbe; die Prüfung hier deckt den Fall, dass der Fokus
    // gar nicht bei ihr lag.
    if (bearbeitung && !ziel.closest(`.${EINGABE_KLASSE}`)) uebernimm();
  }

  function beiDoppelklick(ereignis) {
    const karteEl = karteAn(ereignis.target);
    if (!karteEl || !aenderbar()) return;
    // 4T-001904: Ein Doppelklick auf ein Tag bleibt zwei Klicks auf das Tag und
    // öffnet nicht die Bearbeitung der Karte.
    if (tagVerweisAn(ereignis.target)) return;
    // 4T-001903: ebenso auf dem Termin-Abzeichen; der Wähler ist schon offen.
    if (terminAbzeichenAn(ereignis.target)) return;
    // Auf dem Kästchen bleibt es beim Statuswechsel des einfachen Klicks; die
    // Eingabe hätte dort keinen Gegenstand.
    if (ereignis.target.closest && ereignis.target.closest('.kanban-karte-kasten')) return;
    ereignis.preventDefault();
    oeffneBearbeitung(karteEl);
  }

  function beiEingabeTaste(ereignis) {
    if (!bearbeitung) return;
    if (ereignis.key === 'Escape') {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      brichAb();
      return;
    }
    if (ereignis.key === 'Enter') {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      uebernimm();
      return;
    }
    // Kein Tastendruck der Eingabe darf die Tafel erreichen: `Entf` löschte
    // dort die Karte, in die gerade geschrieben wird.
    ereignis.stopPropagation();
  }

  // Rückgängig und Wiederholen in den drei geläufigen Schreibweisen: `Strg+Z`
  // und `Cmd+Z` zurück, `Strg+Y` und `Strg+Umschalt+Z` vor. Beide Vorwärts-
  // Formen, weil die eine unter Windows und die andere unter macOS die
  // gewohnte ist (wörtlich der Griff der räumlichen Arbeitsfläche).
  function istRueckgaengigTaste(ereignis) {
    return (
      (ereignis.ctrlKey || ereignis.metaKey) &&
      !ereignis.altKey &&
      !ereignis.shiftKey &&
      String(ereignis.key).toLowerCase() === 'z'
    );
  }

  function istWiederholenTaste(ereignis) {
    if (!(ereignis.ctrlKey || ereignis.metaKey) || ereignis.altKey) return false;
    const taste = String(ereignis.key).toLowerCase();
    return taste === 'y' || (taste === 'z' && ereignis.shiftKey);
  }

  function beiTaste(ereignis) {
    // Eine offene Eingabe hat Vorrang; ihre Tasten kommen hier gar nicht an.
    // Die Prüfung bleibt trotzdem stehen: Sie ist die Zusage, dass `Strg+Z`
    // im Eingabe-Feld dessen eigenes, natives Rückgängig bleibt und nicht die
    // vorige Bedien-Handlung der Tafel zurücknimmt.
    if (bearbeitung) return;
    // Vor der Auswahl-Prüfung: Rückgängig gilt der Tafel und nicht einer
    // Karte — es muss auch dann greifen, wenn gerade nichts gewählt ist, etwa
    // nach dem Löschen der letzten Karte einer Spalte.
    if (istRueckgaengigTaste(ereignis)) {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      if (typeof ctx.beiRueckgaengig === 'function') ctx.beiRueckgaengig();
      return;
    }
    if (istWiederholenTaste(ereignis)) {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      if (typeof ctx.beiWiederholen === 'function') ctx.beiWiederholen();
      return;
    }
    const karteEl = gewaehlteKarte();
    if (!karteEl) return;
    if (ereignis.key === 'Enter' || ereignis.key === 'F2') {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      oeffneBearbeitung(karteEl);
      return;
    }
    if (ereignis.key === 'Delete') {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      loesche(karteEl);
      return;
    }
    // Die Leertaste schaltet den Status der gewählten Karte — der Weg ohne
    // Maus zu derselben Handlung. Ohne `preventDefault` rollte die Spalte.
    if (ereignis.key === ' ' || ereignis.key === 'Spacebar') {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      schalteStatus(karteEl);
    }
  }

  container.addEventListener('click', beiKlick);
  container.addEventListener('dblclick', beiDoppelklick);
  container.addEventListener('contextmenu', beiKontextmenue);
  container.addEventListener('keydown', beiTaste);

  return {
    /** Läuft gerade eine Handlung, die eine Neu-Zeichnung zerstören würde? */
    blockiert() {
      return !!bearbeitung;
    },
    /** Legt eine Karte am Fuss der Spalte an und öffnet ihre Eingabe. */
    legeAn,
    /**
     * Archiviert die gewählte Karte — der Weg des Kommandos (4T-001906). Ohne
     * gewählte Karte geschieht nichts; eine offene Eingabe wird zuvor
     * übernommen, weil das Kommando eine andere Handlung beginnt.
     */
    archiviereGewaehlte() {
      if (bearbeitung) uebernimm();
      const karteEl = gewaehlteKarte();
      return karteEl ? archiv.archiviere(karteEl) : false;
    },
    /** Nummer der Spalte der gewählten Karte, sonst `null`. */
    gewaehlteSpalte() {
      return zahlAn(gewaehlteKarte(), 'spalte');
    },
    /**
     * Der gemeinsame Schreibweg für die Folge-Vorgänge dieser Ausbaustufe
     * (Verschieben 4T-001850, Spalten-Bedienung 4T-001851): Text-Operation des
     * Format-Kerns rufen, Befund melden, sonst eine Transaktion.
     */
    wendeAn,
    /** Übernimmt eine offene Eingabe, falls eine offen ist. */
    beendeBearbeitung: uebernimm,
    /**
     * Welche Karte nach der nächsten Zeichnung gewählt sein soll (4T-001850).
     *
     * Der Griff steht für das Verschieben: Die Wiederherstellung nach der
     * Zeichnung findet die Karte über ihre **Zeilen-Nummer** wieder, und die
     * ist nach einem Zug eine andere. Ohne den Nachzug stünde die Auswahl
     * danach auf der Karte, die zufällig an die alte Zeile gerutscht ist.
     *
     * @param {{spalte: number, karte: number}|null} ziel
     */
    waehleNachZeichnung(ziel) {
      waehleNachRender = ziel && typeof ziel === 'object' ? ziel : null;
    },
    /**
     * Vor jeder Zeichnung: merken, ob die Tafel den Tastatur-Fokus hat.
     *
     * Gegenstück zu `merkeZustand` der Zeichnung und aus demselben Grund: Die
     * Zeichnung baut den Baum neu auf, und die fokussierte Karte gibt es
     * danach nicht mehr — dieselbe.
     */
    vorRender() {
      fokusWarHier =
        typeof container.contains === 'function' && container.contains(document.activeElement);
    },
    /** Nach jeder Zeichnung: wartende Auswahl setzen (Löschen), Fokus halten. */
    nachRender() {
      const ziel = waehleNachRender;
      waehleNachRender = null;
      const karteEl = ziel
        ? container.querySelector(
            `.${SPALTE_KLASSE}[data-spalte="${ziel.spalte}"] .${KARTE_KLASSE}[data-karte="${ziel.karte}"]`,
          )
        : null;
      if (karteEl) waehleKarte(container, karteEl);
      // Hatte die Tafel den Fokus und hat sie ihn nach der Zeichnung nicht
      // mehr, holt sie ihn zurück: auf die gewählte Karte, sonst auf die Tafel
      // selbst. Ohne den Nachzug erreichte das `Strg+Z`, das jede Handlung
      // sichert, die Fläche nach genau einer Handlung nicht mehr.
      const hatFokus =
        typeof container.contains === 'function' && container.contains(document.activeElement);
      if (!fokusWarHier || hatFokus) {
        fokusWarHier = false;
        return;
      }
      fokusWarHier = false;
      const gewaehlt = gewaehlteKarte();
      if (gewaehlt && typeof gewaehlt.focus === 'function') gewaehlt.focus();
      else fokussiere();
    },
    destroy() {
      container.removeEventListener('click', beiKlick);
      container.removeEventListener('dblclick', beiDoppelklick);
      container.removeEventListener('contextmenu', beiKontextmenue);
      container.removeEventListener('keydown', beiTaste);
    },
  };
}
