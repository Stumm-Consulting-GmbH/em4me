// 4T-001851 (Epic 3E-000110): Bedienung der Spalten auf der Tafel — Anlegen,
// Umbenennen, Löschen und die Spalten-Einstellung «hakt hineingezogene Karten
// ab». Seit 4T-001905 (Epic 3E-000318) dazu die Obergrenze der Spalte: setzen,
// ändern und entfernen, nach dem Muster der Titel-Eingabe.
//
// **Warum ein eigenes Modul neben `kanban-bedienung.js`.** Der Gegenstand ist
// ein anderer: Dort geht es um die Karte und ihren Text, hier um die Spalte als
// Gefäß. Beides in einer Datei zu führen hieße, zwei Bearbeitungs-Zustände
// (offene Karten-Eingabe, offene Titel-Eingabe) in einer Variablen zu
// vermischen; getrennt bleibt jeder Zustand bei seiner Fachlichkeit. Der
// Datei-Größen-Wächter ist der zweite, kleinere Grund.
//
// **Ein zweiter Schreibweg entsteht nicht.** Die Handlungen laufen über
// `wendeAn` der Karten-Bedienung, hereingereicht als Rückruf: Text-Operation des
// Format-Kerns rufen, Ausgangsstand prüfen, bei einem Befund melden statt
// schreiben, sonst **eine** Übernahme. Jede Handlung ist damit genau eine
// Transaktion und ein einziger Rückgängig-Schritt (AK7).
//
// **Die eine begründete Abweichung vom «Rückgängig statt Rückfrage»-Muster der
// Karten-Bedienung** ist das Löschen einer **nicht leeren** Spalte: Dort
// verschwindet mehr, als die Handlung anzeigt, nämlich auch ihre Karten. Die
// Rückfrage läuft über den Rückfrage-Dialog des Bestands, hereingereicht wie
// alles Übrige; eine leere Spalte verschwindet ohne Rückfrage (AK3, AK4).
//
// **Abhängigkeits-frei wie die Nachbarn** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n`. Übersetzung, Modell, Änderbarkeit,
// Schreibweg, Rückfrage und Kontextmenü kommen als Rückrufe herein.
'use strict';

import {
  benenneSpalteUm,
  legeSpalteAn,
  loescheSpalte,
  setzeSpaltenErledigt,
  setzeSpaltenLimit,
} from '../../../shared/kanban/kanban-operationen.js';
import { SPALTE_KLASSE } from './kanban-tafel.js';

// Klassen-Namen der Bedien-Elemente an einer Stelle, wie in der Zeichnung.
// `kanban-spalte-hinzufuegen` steht bewusst **nicht** auf `kanban-spalte-neu` —
// das ist die Schaltfläche der neuen Karte am Fuss einer Spalte, und eine
// zweite Bedeutung desselben Namens wäre ein stiller Fehlgriff.
export const SPALTE_NEU_KLASSE = 'kanban-spalte-hinzufuegen';
export const SPALTE_EINGABE_KLASSE = 'kanban-spalte-eingabe';
export const SPALTE_ENTWURF_KLASSE = 'kanban-spalte-entwurf';
export const LIMIT_EINGABE_KLASSE = 'kanban-spalte-limit-eingabe';

function zahlAn(el, feld) {
  const wert = Number(el && el.dataset ? el.dataset[feld] : NaN);
  return Number.isFinite(wert) ? wert : null;
}

// Ein Spalten-Titel ist eine Überschriften-Zeile: Ein Umbruch darin zerrisse
// die Tafel. Er wird zum Leerzeichen, statt die Übernahme zu verweigern — der
// Anwender hat den Text gemeint, nicht den Umbruch (Regel der Karten-Eingabe).
function einzeilig(wert) {
  return String(wert == null ? '' : wert)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

// 4T-001905: Die Eingabe der Obergrenze. Eine ganze Zahl ab 1 setzt; leer oder
// 0 entfernt — 0 ist auch im Vorbild-Werkzeug «keine Obergrenze». Alles andere
// (Buchstaben, Bruch, Vorzeichen) ist keine Obergrenze und schreibt nichts.
function leseLimitEingabe(wert) {
  const text = String(wert == null ? '' : wert).trim();
  if (text === '') return { limit: null };
  if (!/^\d+$/.test(text)) return null;
  const zahl = Number(text);
  if (zahl === 0) return { limit: null };
  return Number.isSafeInteger(zahl) ? { limit: zahl } : null;
}

/**
 * Verdrahtet die Spalten-Bedienung mit einer gezeichneten Tafel.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.container Container der Ansicht; er überlebt jede
 *   Zeichnung und trägt deshalb die Zuhörer.
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} ctx.modell () => Modell aus `leseTafel` des gezeichneten Textes.
 * @param {Function} [ctx.aenderbar] () => boolean. Fehlt der Rückruf, gilt
 *   änderbar; der Schreibweg ist eigens gesichert.
 * @param {Function} ctx.wendeAn (operation, angaben) => boolean. Der gemeinsame
 *   Schreibweg der Ausbaustufe aus der Karten-Bedienung.
 * @param {Function} [ctx.zeigeMenue] ({x, y, eintraege}) => void. Fehlt der
 *   Rückruf, gibt es kein Kontextmenü — der Stand der reinen Prüffälle.
 * @param {Function} [ctx.bestaetigeLoeschen] ({titel, anzahl}) => boolean|Promise
 *   Der Rückfrage-Dialog des Bestands. Fehlt er, wird eine nicht leere Spalte
 *   **nicht** gelöscht: Ohne Rückfrage-Weg gibt es die zugesagte Rückfrage
 *   nicht, und ohne sie verschwänden Karten ungefragt (fail closed).
 * @returns {object} Steuerung für die Einbettung.
 */
export function createSpaltenBedienung(ctx) {
  const container = ctx.container;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  // Die offene Eingabe: der Titel einer vorhandenen Spalte, der Entwurf einer
  // neuen, die es im Dokument noch nicht gibt, oder die Obergrenze einer
  // Spalte (`art`: 'titel', 'neu', 'limit'). Es gibt immer nur eine.
  let bearbeitung = null;

  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function modell() {
    const m = typeof ctx.modell === 'function' ? ctx.modell() : null;
    return m && Array.isArray(m.spalten) ? m : null;
  }

  function wendeAn(operation, angaben) {
    if (typeof ctx.wendeAn !== 'function') return false;
    return ctx.wendeAn(operation, angaben) !== false;
  }

  function streifen() {
    return container.querySelector('.kanban-spalten');
  }

  function spalteImModell(nummer) {
    const m = modell();
    if (!m || nummer === null || !m.spalten[nummer]) return null;
    return m.spalten[nummer];
  }

  // --- Die Eingabe ------------------------------------------------------------------

  function baueEingabe(wert, platzhalter) {
    const eingabe = document.createElement('input');
    eingabe.type = 'text';
    eingabe.className = SPALTE_EINGABE_KLASSE;
    eingabe.value = wert;
    eingabe.spellcheck = false;
    if (platzhalter) eingabe.placeholder = platzhalter;
    eingabe.addEventListener('keydown', beiEingabeTaste);
    eingabe.addEventListener('blur', () => {
      // Erst im nächsten Zyklus und nur, wenn dieselbe Bearbeitung noch offen
      // ist (Muster der Karten-Eingabe): Ohne den Aufschub käme der blur eines
      // Fokus-Wechsels der Übernahme zuvor.
      const meine = bearbeitung;
      setTimeout(() => {
        if (bearbeitung !== meine) return;
        uebernimm();
      }, 0);
    });
    return eingabe;
  }

  /**
   * Öffnet die Eingabe einer **neuen** Spalte am Ende des Streifens.
   *
   * Die Spalte entsteht erst mit der Übernahme: Ein leer übernommener oder
   * verworfener Entwurf erzeugt weder einen Schreibvorgang noch einen
   * Rückgängig-Schritt — dieselbe Regel wie bei der leeren Neu-Karte.
   */
  function legeAn() {
    if (!aenderbar()) return false;
    if (bearbeitung) uebernimm();
    const leiste = streifen();
    if (!leiste) return false;
    const entwurf = document.createElement('div');
    entwurf.className = SPALTE_ENTWURF_KLASSE;
    const eingabe = baueEingabe('', t('kanban.neueSpalte'));
    entwurf.appendChild(eingabe);
    const knopf = leiste.querySelector(`.${SPALTE_NEU_KLASSE}`);
    if (knopf) leiste.insertBefore(entwurf, knopf);
    else leiste.appendChild(entwurf);
    bearbeitung = { art: 'neu', entwurf, eingabe, anstelle: null, spalte: null, quellText: '' };
    eingabe.focus();
    if (typeof entwurf.scrollIntoView === 'function') entwurf.scrollIntoView({ inline: 'nearest' });
    return true;
  }

  /**
   * Öffnet eine Eingabe im Kopf einer vorhandenen Spalte, an der Stelle des
   * Elements `form.auswahl` — Titel oder Zähler.
   *
   * @param {Element} spalteEl
   * @param {'titel'|'limit'} art
   * @param {{auswahl: string, wert: Function, platzhalter?: string, klasse?: string}} form
   * @returns {boolean}
   */
  function oeffneImKopf(spalteEl, art, form) {
    if (!aenderbar() || !spalteEl) return false;
    const nummer = zahlAn(spalteEl, 'spalte');
    if (bearbeitung) {
      // Dieselbe Eingabe ein zweites Mal öffnen heißt: sie ist schon offen.
      if (bearbeitung.art === art && bearbeitung.spalte === nummer) return true;
      uebernimm();
      if (!spalteEl.isConnected) return false;
    }
    const spalte = spalteImModell(nummer);
    const anstelle = spalteEl.querySelector(form.auswahl);
    if (!spalte || !anstelle) return false;
    const eingabe = baueEingabe(form.wert(spalte), form.platzhalter || '');
    if (form.klasse) eingabe.classList.add(form.klasse);
    anstelle.replaceWith(eingabe);
    bearbeitung = {
      art,
      entwurf: null,
      eingabe,
      anstelle,
      spalte: nummer,
      quellText: eingabe.value,
      quellLimit: spalte.limit == null ? null : spalte.limit,
    };
    eingabe.focus();
    if (typeof eingabe.select === 'function') eingabe.select();
    return true;
  }

  /**
   * Öffnet die Eingabe am Titel einer vorhandenen Spalte.
   *
   * 4T-001905: Die Eingabe zeigt den Titel **ohne** Obergrenze; die Übernahme
   * lässt die Obergrenze im Dokument stehen, wie sie war (AK6).
   */
  function benenneUm(spalteEl) {
    return oeffneImKopf(spalteEl, 'titel', {
      auswahl: '.kanban-spalte-titel',
      wert: (s) => String(s.titelOhneLimit == null ? (s.titel ?? '') : s.titelOhneLimit),
    });
  }

  /**
   * Öffnet die Eingabe der Obergrenze an der Stelle des Zählers, vorbelegt mit
   * der bestehenden (4T-001905, AK2). Eingabetaste übernimmt, Escape verwirft
   * — dieselbe Eingabe wie beim Umbenennen.
   */
  function setzeLimit(spalteEl) {
    return oeffneImKopf(spalteEl, 'limit', {
      auswahl: '.kanban-spalte-zaehler',
      wert: (s) => (s.limit == null ? '' : String(s.limit)),
      platzhalter: t('kanban.spalteLimitPlatzhalter'),
      klasse: LIMIT_EINGABE_KLASSE,
    });
  }

  /** Entfernt die Obergrenze einer Spalte (4T-001905, AK2). */
  function entferneLimit(spalteNr) {
    if (!aenderbar()) return false;
    if (bearbeitung) uebernimm();
    const spalte = spalteImModell(spalteNr);
    if (!spalte || spalte.limit == null) return false;
    return wendeAn(setzeSpaltenLimit, { spalte: spalteNr, limit: null });
  }

  // Die Eingabe verschwindet; die Spalte bekommt ihren gezeichneten Titel oder
  // Zähler zurück. Ein Entwurf verschwindet ganz — es gibt ihn im Dokument nicht.
  function stelleWiederHer(b) {
    if (b.art === 'neu') {
      if (b.entwurf && b.entwurf.isConnected) b.entwurf.remove();
      return;
    }
    if (b.eingabe.isConnected) b.eingabe.replaceWith(b.anstelle);
  }

  function brichAb() {
    if (!bearbeitung) return false;
    const b = bearbeitung;
    bearbeitung = null;
    stelleWiederHer(b);
    return true;
  }

  function uebernimm() {
    if (!bearbeitung) return false;
    const b = bearbeitung;
    bearbeitung = null;
    const neuerTitel = einzeilig(b.eingabe.value);
    stelleWiederHer(b);
    // Eine leere neue Spalte entsteht nicht, und ein unveränderter Titel wird
    // nicht geschrieben: Beides wäre ein Rückgängig-Schritt ohne Wirkung.
    if (b.art === 'neu') {
      if (neuerTitel === '') return false;
      return wendeAn(legeSpalteAn, { titel: neuerTitel });
    }
    if (b.art === 'limit') {
      // Eine ungültige Eingabe und eine unveränderte Obergrenze schreiben
      // nichts — aus demselben Grund.
      const gelesen = leseLimitEingabe(b.eingabe.value);
      if (!gelesen || gelesen.limit === b.quellLimit) return false;
      return wendeAn(setzeSpaltenLimit, { spalte: b.spalte, limit: gelesen.limit });
    }
    if (neuerTitel === '' || neuerTitel === b.quellText) return false;
    return wendeAn(benenneSpalteUm, { spalte: b.spalte, titel: neuerTitel, limitErhalten: true });
  }

  // --- Löschen ---------------------------------------------------------------------

  /**
   * Löscht eine Spalte samt ihren Karten.
   *
   * **Leer ohne Rückfrage, nicht leer mit Rückfrage** (AK3, AK4). Der Grund für
   * die Abweichung vom Karten-Muster steht im Kopf dieser Datei. Ein Abbruch
   * lässt das Dokument unverändert — geschrieben wird erst nach der Zusage.
   *
   * @returns {Promise<boolean>}
   */
  async function loesche(spalteNr) {
    if (!aenderbar()) return false;
    if (bearbeitung) uebernimm();
    const spalte = spalteImModell(spalteNr);
    if (!spalte) return false;
    const anzahl = spalte.karten.length;
    if (anzahl > 0) {
      if (typeof ctx.bestaetigeLoeschen !== 'function') return false;
      const zusage = await ctx.bestaetigeLoeschen({ titel: spalte.titel, anzahl });
      if (zusage !== true) return false;
    }
    return wendeAn(loescheSpalte, { spalte: spalteNr });
  }

  // --- Die Spalten-Einstellung ------------------------------------------------------

  /**
   * Setzt oder nimmt die Einstellung «hakt hineingezogene Karten ab».
   *
   * **Der Wortlaut des Kennzeichens kommt aus dem Katalog.** Das Vorbild-Werkzeug
   * schreibt die fett gesetzte Zeile in **seiner** Oberflächen-Sprache und liest
   * sie ebenso zurück; der Format-Kern kennt keine Sprache und nimmt den Wortlaut
   * deshalb entgegen. Vorrang hat im Kern ohnehin der Wortlaut einer bereits
   * vorhandenen Erledigt-Spalte derselben Tafel — eine übernommene Tafel behält
   * damit ihre eigene Schreibweise.
   */
  function schalteErledigt(spalteNr) {
    if (!aenderbar()) return false;
    if (bearbeitung) uebernimm();
    const spalte = spalteImModell(spalteNr);
    if (!spalte) return false;
    return wendeAn(setzeSpaltenErledigt, {
      spalte: spalteNr,
      erledigt: !spalte.erledigt,
      wortlaut: t('kanban.erledigtKennzeichen'),
    });
  }

  // --- Kontextmenü ----------------------------------------------------------------
  //
  // Nach dem Muster der Karten-Bedienung: Das Menü entscheidet nichts, es
  // übersetzt eine Zeiger-Stelle in eine Liste von Handlungen, die es anderswo
  // schon gibt. Im nicht änderbaren Dokument bleibt die Liste leer und das Menü
  // erscheint gar nicht.

  function spaltenEintraege(spalteEl, spalteNr, spalte) {
    // 4T-001905: Die Obergrenze gehört zum Titel und steht deshalb gleich
    // hinter «Umbenennen»; «Obergrenze entfernen» nur, wo es eine gibt
    // (Muster «Termin entfernen» der Karte).
    const limit = [
      {
        label: t('kanban.spalteLimitSetzen'),
        dataId: 'kanban-column-set-limit',
        action: () => setzeLimit(spalteEl),
      },
    ];
    if (spalte.limit != null) {
      limit.push({
        label: t('kanban.spalteLimitEntfernen'),
        dataId: 'kanban-column-remove-limit',
        action: () => entferneLimit(spalteNr),
      });
    }
    return [
      {
        label: t('kanban.spalteUmbenennen'),
        dataId: 'kanban-column-rename',
        action: () => benenneUm(spalteEl),
      },
      ...limit,
      {
        label: t('kanban.spalteLoeschen'),
        dataId: 'kanban-column-delete',
        action: () => loesche(spalteNr),
      },
      {
        label: t('kanban.spalteHaktAb'),
        dataId: 'kanban-column-complete',
        // Der Zustand steht als Häkchen am Eintrag; derselbe Eintrag schaltet
        // ihn um. Ein zweiter Eintrag «Abhaken aufheben» wäre eine Handlung,
        // die es nicht gibt.
        checked: spalte.erledigt === true,
        action: () => schalteErledigt(spalteNr),
      },
    ];
  }

  function beiKontextmenue(ereignis) {
    const ziel = ereignis.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // In der offenen Eingabe gehört der Rechtsklick der Textfläche.
    if (ziel.closest(`.${SPALTE_EINGABE_KLASSE}`)) return;
    const kopf = ziel.closest('.kanban-spalte-kopf');
    if (!kopf) return;
    const spalteEl = kopf.closest(`.${SPALTE_KLASSE}`);
    const nummer = zahlAn(spalteEl, 'spalte');
    const spalte = spalteImModell(nummer);
    if (!spalte || !aenderbar() || typeof ctx.zeigeMenue !== 'function') return;
    ereignis.preventDefault();
    // Eine offene Eingabe wird übernommen: Der Rechtsklick ist der Beginn einer
    // anderen Handlung (Muster der Karten-Bedienung).
    uebernimm();
    ctx.zeigeMenue({
      x: ereignis.clientX,
      y: ereignis.clientY,
      eintraege: spaltenEintraege(spalteEl, nummer, spalte),
    });
  }

  // --- Zeiger und Tastatur ------------------------------------------------------------

  function beiKlick(ereignis) {
    const ziel = ereignis.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    if (ziel.closest(`.${SPALTE_NEU_KLASSE}`)) {
      ereignis.preventDefault();
      legeAn();
      return;
    }
    // Der Klick ausserhalb der offenen Eingabe übernimmt sie. Der blur der
    // Eingabe tut dasselbe; die Prüfung hier deckt den Fall, dass der Fokus gar
    // nicht bei ihr lag.
    if (bearbeitung && !ziel.closest(`.${SPALTE_EINGABE_KLASSE}`)) uebernimm();
  }

  function beiDoppelklick(ereignis) {
    const ziel = ereignis.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    const titel = ziel.closest('.kanban-spalte-titel');
    if (!titel || !aenderbar()) return;
    ereignis.preventDefault();
    ereignis.stopPropagation();
    benenneUm(titel.closest(`.${SPALTE_KLASSE}`));
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
    // dort die gewählte Karte, während hier ein Titel geschrieben wird.
    ereignis.stopPropagation();
  }

  container.addEventListener('click', beiKlick);
  container.addEventListener('dblclick', beiDoppelklick);
  container.addEventListener('contextmenu', beiKontextmenue);

  return {
    /** Läuft gerade eine Handlung, die eine Neu-Zeichnung zerstören würde? */
    blockiert() {
      return !!bearbeitung;
    },
    /** Legt eine Spalte am Ende der Tafel an und öffnet ihre Eingabe. */
    legeAn,
    /** Öffnet die Umbenennung einer Spalte (Kontextmenü und Doppelklick). */
    benenneUm,
    /** Öffnet die Eingabe der Obergrenze einer Spalte (Kontextmenü). */
    setzeLimit,
    /** Entfernt die Obergrenze einer Spalte (Kontextmenü). */
    entferneLimit,
    /** Löscht eine Spalte, bei Karten nach Rückfrage. */
    loesche,
    /** Schaltet die Einstellung «hakt hineingezogene Karten ab» um. */
    schalteErledigt,
    /** Übernimmt eine offene Eingabe, falls eine offen ist. */
    beendeBearbeitung: uebernimm,
    destroy() {
      container.removeEventListener('click', beiKlick);
      container.removeEventListener('dblclick', beiDoppelklick);
      container.removeEventListener('contextmenu', beiKontextmenue);
    },
  };
}
