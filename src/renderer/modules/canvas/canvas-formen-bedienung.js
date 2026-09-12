// 4T-001701 (Epic 3E-000288): Bedienung der Formen auf der Canvas-Fläche —
// Anlegen über Kommando und Kontextmenü, Auswahl, Ziehen, Größe-Ändern,
// Beschriftung, Leiste (Art, Rand, Füllung) und Löschen.
//
// **Warum ein viertes Bedien-Modul.** Karten-Bedienung (448 von 500
// Code-Zeilen) und Verbindungs-Bedienung (466) lagen beide dicht am
// Datei-Budget; vor allem aber ist die Form eine eigene Fachlichkeit: Sie
// trägt Angaben, die keine Karte kennt (Art, Rand, Füllung), ihre Beschriftung
// ist einfacher Text statt Markdown, und sie nimmt keine Verbindung an. Die
// Karten-Bedienung bleibt davon unberührt bis auf einen zusätzlichen Griff.
//
// **Was bewusst NICHT hier steht.** Lage, Größe und Inhalt setzen die
// Funktionen der Karten-Bedienung (`setzeKartenLage`, `setzeKartenGroesse`,
// `setzeElementInhalt`); sie lesen und schreiben Felder, die jedes Element
// trägt, und eine zweite Fassung mit demselben Rumpf wäre ein zweiter Ort für
// dieselbe Regel. Die Änderungen am **Modell** (anlegen, entfernen, umordnen,
// Art und Farben setzen) liegen prozessneutral in
// `src/shared/canvas/canvas-elemente.js`, weil sie Aussagen über das
// Speicherformat sind (4T-001700). Geschrieben wird ausschließlich über den
// Griff `schreibe` der Karten-Bedienung — ein eigener Schreibweg wäre ein
// zweiter Ort für den Abgleich mit dem Dokument-Stand.
//
// **Genau ein Element ist gewählt** (Entscheidung V3 des Product Owners vom
// 2026-09-10), jetzt über drei Arten statt über zwei: eine Karte, eine
// Verbindung **oder** eine Form. Jede Seite hebt die Wahl der anderen auf; die
// Kopplung läuft über die benannten Griffe und nicht über einen zweiten
// Auswahl-Zustand, der stillschweigend auseinanderliefe.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`.
'use strict';

import {
  erzeugeForm,
  entferneElement,
  freieKennung,
  fuegeElementEin,
  setzeFormArt,
  setzeFormFuellung,
  setzeFormRand,
} from '../../../shared/canvas/canvas-elemente.js';
import { MIN_BREITE, MIN_HOEHE, kartenRechteck } from '../../../shared/canvas/canvas-geometrie.js';
import { setzeElementInhalt, setzeKartenGroesse, setzeKartenLage } from './canvas-bedienung.js';
import { FORM_BREITE, FORM_HOEHE } from './canvas-formen.js';
import { baueFormenLeiste, formLeistenBefehl } from './canvas-formen-leiste.js';

// Bewegung in Bildschirm-Pixeln, unterhalb derer ein Zug ein Klick bleibt.
// Wert und Begründung aus der Karten-Bedienung übernommen.
const KLICK_SCHWELLE = 3;

/**
 * Verdrahtet die Formen-Bedienung mit einer gezeichneten Fläche.
 *
 * Die Tastatur liegt bewusst **nicht** hier: `Entf` und `Escape` laufen über
 * den bestehenden `keydown` der Fläche und erreichen dieses Modul über den
 * Griff `beiTaste`. Ein zweiter Listener am selben Container hätte eine
 * Reihenfolge, die niemand mehr überblickt (Muster der Verbindungen).
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.kartenEbene Gemeinsame Element-Ebene; sie trägt
 *   Karten, Formen, Leisten und Eingaben und damit dieselbe Verschiebung und
 *   Vergrößerung.
 * @param {Function} ctx.modell () => Modell der gezeigten Fläche.
 * @param {object} ctx.bedienung Karten-Bedienung (Griffe: `waehleKarte`,
 *   `flaechenPunktAus`, `mitteDesAusschnitts`, `schreibe`, `fokussiere`).
 * @param {Function} [ctx.waehleLinie] (null) => void, hebt die Wahl einer
 *   Verbindung auf. Fehlt der Rückruf, gibt es keine Verbindungs-Bedienung.
 * @param {Function} [ctx.waehleGruppe] (null) => void (4T-001702), hebt die
 *   Wahl einer Gruppe auf. Fehlt der Rückruf, gibt es keine Gruppen-Bedienung.
 * @param {Function} [ctx.aenderbar] () => boolean (Entscheidung E3). Ist das
 *   Dokument nicht änderbar, gibt es weder Griff noch Leiste, und keine
 *   Handlung schreibt. Fehlt der Rückruf, gilt änderbar.
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} [ctx.beiFreigabe] () => void, sobald keine Handlung läuft.
 * @returns {object} Steuerung für die Ansicht.
 */
export function createFormenBedienung(ctx) {
  const { kartenEbene, bedienung } = ctx;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  let gewaehlteForm = null;
  let zug = null;
  let bearbeitung = null;
  let leiste = null;

  function modell() {
    return typeof ctx.modell === 'function' ? ctx.modell() : null;
  }

  // Die Frage wird bei **jeder** schreibenden Handlung und bei jedem Zeichnen
  // neu gestellt statt einmal gemerkt — der Anwender schaltet den Modus um,
  // während die Fläche steht (Entscheidung E3).
  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function elementZu(id) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !id) return null;
    return m.elemente.find((el) => el.art === 'form' && el.id === id) || null;
  }

  function schreibe() {
    return bedienung.schreibe();
  }

  function freigabeMelden() {
    if (zug || bearbeitung) return;
    if (typeof ctx.beiFreigabe === 'function') ctx.beiFreigabe();
  }

  // --- Auswahl und Leiste ------------------------------------------------------

  function waehle(id) {
    gewaehlteForm = id && elementZu(id) ? id : null;
    // Genau ein Element ist gewählt (V3): Karte und Verbindung geben ab, wenn
    // die Form übernimmt. Umgekehrt meldet die Ansicht über `beiFremdWahl`.
    if (gewaehlteForm) {
      bedienung.waehleKarte(null);
      if (typeof ctx.waehleLinie === 'function') ctx.waehleLinie(null);
      // 4T-001702: die vierte Kante des Auswahl-Vierecks. Der Rückruf steht
      // innerhalb dieser Bedingung, weil er sonst bei jedem `waehle(null)`
      // zurückliefe — genau der Grund, aus dem auch `waehleLinie` hier steht.
      if (typeof ctx.waehleGruppe === 'function') ctx.waehleGruppe(null);
    }
    markiere();
    if (gewaehlteForm) bedienung.fokussiere();
  }

  function markiere() {
    for (const el of kartenEbene.querySelectorAll('.canvas-form')) {
      const an = !!gewaehlteForm && el.dataset.canvasId === gewaehlteForm;
      el.classList.toggle('canvas-form-gewaehlt', an);
      el.setAttribute('aria-selected', String(an));
    }
    zeigeLeiste();
  }

  function zeigeLeiste() {
    if (leiste) {
      leiste.remove();
      leiste = null;
    }
    const el = elementZu(gewaehlteForm);
    // Während die Beschriftung geschrieben wird, tritt die Leiste zurück; und
    // im nicht änderbaren Dokument gibt es sie gar nicht — sie besteht
    // ausschließlich aus schreibenden Knöpfen (Entscheidung E3).
    if (!el || bearbeitung || !aenderbar()) return;
    leiste = baueFormenLeiste({ el, t });
    leiste.addEventListener('mousedown', (ev) => ev.stopPropagation());
    leiste.addEventListener('click', beiLeistenEreignis);
    // Das Auswahlfeld meldet sich über `change` und nicht über `click`: Wer
    // mit der Tastatur wählt, klickt nie.
    leiste.addEventListener('change', beiLeistenEreignis);
    kartenEbene.appendChild(leiste);
  }

  function beiLeistenEreignis(ev) {
    const el = elementZu(gewaehlteForm);
    const befehl = el ? formLeistenBefehl(ev.target) : null;
    if (!befehl) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (befehl.art === 'formArt') {
      if (setzeFormArt(el, befehl.wert)) schreibe();
    } else if (befehl.art === 'rand') {
      if (setzeFormRand(el, befehl.wert)) schreibe();
    } else if (befehl.art === 'fuellung') {
      if (setzeFormFuellung(el, befehl.wert)) schreibe();
    } else if (befehl.art === 'beschriftung') {
      oeffneBeschriftung(el.id);
    }
  }

  // --- Anlegen ------------------------------------------------------------------

  /**
   * Legt eine Form an; ohne Punkt in der Mitte des sichtbaren Ausschnitts.
   *
   * @param {{punkt?: {x: number, y: number}, formArt?: string}} [opts]
   * @returns {boolean} `true`, wenn geschrieben wurde.
   */
  function formAnlegen(opts = {}) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !aenderbar()) return false;
    const punkt = opts.punkt;
    const p =
      punkt && Number.isFinite(punkt.x) && Number.isFinite(punkt.y)
        ? punkt
        : bedienung.mitteDesAusschnitts();
    const el = erzeugeForm({
      id: freieKennung(m, 'form'),
      // Die Form liegt mittig unter dem Klick-Punkt, nicht mit ihrer Ecke
      // darauf: Angeklickt wird die Stelle, an der sie stehen soll.
      x: p.x - FORM_BREITE / 2,
      y: p.y - FORM_HOEHE / 2,
      b: FORM_BREITE,
      h: FORM_HOEHE,
      formArt: opts.formArt,
    });
    // Ganz nach vorn (G3, Story 4S-000932): Ein gerade angelegtes Element ist
    // sichtbar. Wo das ist, entscheidet der Kern und nicht die Bedienung.
    fuegeElementEin(m, el);
    gewaehlteForm = el.id;
    bedienung.waehleKarte(null);
    if (typeof ctx.waehleLinie === 'function') ctx.waehleLinie(null);
    return schreibe();
  }

  // --- Löschen --------------------------------------------------------------------

  function loesche(id) {
    const m = modell();
    if (!aenderbar() || !elementZu(id) || !entferneElement(m, id)) return false;
    if (gewaehlteForm === id) gewaehlteForm = null;
    return schreibe();
  }

  // --- Ziehen und Größe-Ändern ------------------------------------------------------

  function setzeStil(huelle, r) {
    huelle.style.left = `${Math.round(r.x)}px`;
    huelle.style.top = `${Math.round(r.y)}px`;
    huelle.style.width = `${Math.round(r.b)}px`;
    huelle.style.height = `${Math.round(r.h)}px`;
  }

  function beiMausunten(ev) {
    if (ev.button !== 0) return;
    const ziel = ev.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // Während eine Eingabe offen ist, gehört die Maus ihr: Sonst ließe sich in
    // der Form weder die Schreibmarke setzen noch Text markieren.
    if (bearbeitung && ziel.closest('.canvas-form-eingabe')) return;
    const huelle = ziel.closest('.canvas-form');
    if (!huelle) return;
    const el = elementZu(huelle.dataset.canvasId);
    if (!el) return;
    ev.preventDefault();
    // Hält das Ereignis von der Bühne fern: Dort begänne sonst das Ziehen der
    // ganzen Fläche, und beides zugleich ist keine Bedienung.
    ev.stopPropagation();
    waehle(el.id);
    // Auswählen bleibt erlaubt, denn es schreibt nichts; Verschieben und
    // Größe-Ändern beginnen im Anzeige-Modus erst gar nicht (E3).
    if (!aenderbar()) return;
    const r = kartenRechteck(el);
    zug = {
      art: ziel.closest('.canvas-form-griff') ? 'groesse' : 'verschieben',
      huelle,
      el,
      startX: ev.clientX,
      startY: ev.clientY,
      letztX: ev.clientX,
      letztY: ev.clientY,
      bewegt: 0,
      start: r,
      jetzt: { ...r },
    };
  }

  function beiBewegung(ev) {
    if (!zug) return;
    zug.bewegt += Math.abs(ev.clientX - zug.letztX) + Math.abs(ev.clientY - zug.letztY);
    zug.letztX = ev.clientX;
    zug.letztY = ev.clientY;
    // Gegen den Start gerechnet statt aufsummiert, und durch die Vergrößerung
    // geteilt: Der Zeiger bewegt sich in Bildschirm-Pixeln, die Form in
    // Flächen-Einheiten (Muster der Karten-Bedienung).
    const s = bedienung.flaechenMassstab();
    const dx = (ev.clientX - zug.startX) / s;
    const dy = (ev.clientY - zug.startY) / s;
    if (zug.art === 'verschieben') {
      zug.jetzt.x = zug.start.x + dx;
      zug.jetzt.y = zug.start.y + dy;
    } else {
      zug.jetzt.b = Math.max(MIN_BREITE, zug.start.b + dx);
      zug.jetzt.h = Math.max(MIN_HOEHE, zug.start.h + dy);
    }
    // Während des Zuges wandert allein die Hülle; geschrieben wird am Ende.
    // Der Umriss darin wächst erst beim Neuzeichnen mit — er hängt an Breite
    // und Höhe, und ihn je Mausbewegung neu zu rechnen wäre ein zweiter
    // Zeichen-Weg neben dem einen in `canvas-formen.js`.
    setzeStil(zug.huelle, zug.jetzt);
  }

  function beiLoslassen() {
    if (!zug) return;
    const z = zug;
    zug = null;
    if (z.bewegt <= KLICK_SCHWELLE) {
      // Ein Klick, kein Zug: Die Form ist gewählt, das Dokument unberührt.
      setzeStil(z.huelle, kartenRechteck(z.el));
      freigabeMelden();
      return;
    }
    const geaendert =
      z.art === 'verschieben'
        ? setzeKartenLage(z.el, z.jetzt.x, z.jetzt.y)
        : setzeKartenGroesse(z.el, z.jetzt.b, z.jetzt.h);
    if (geaendert) schreibe();
    freigabeMelden();
  }

  // --- Beschriftung (F3, Muster der Beschriftungs-Eingabe der Verbindung) ---------

  function oeffneBeschriftung(id) {
    const el = elementZu(id);
    // Keine Eingabe im nicht änderbaren Dokument (E3): Sie nähme Text
    // entgegen, den beim Übernehmen niemand schreibt.
    if (!el || !aenderbar()) return false;
    if (bearbeitung) uebernimm();
    waehle(id);
    const r = kartenRechteck(el);
    const eingabe = document.createElement('textarea');
    eingabe.className = 'canvas-form-eingabe';
    // Der Rohtext, wie ihn der Parser liefert: Die Beschriftung **sind** die
    // Inhalts-Zeilen der Form, und es gibt keinen zweiten Editor dafür.
    eingabe.value = el.inhalt || '';
    eingabe.spellcheck = false;
    eingabe.style.left = `${r.x}px`;
    eingabe.style.top = `${r.y}px`;
    eingabe.style.width = `${r.b}px`;
    eingabe.style.height = `${r.h}px`;
    kartenEbene.appendChild(eingabe);
    bearbeitung = { el, eingabe };
    // Die Leiste tritt zurück, solange geschrieben wird.
    zeigeLeiste();
    eingabe.addEventListener('keydown', beiEingabeTaste);
    // Fokus-Verlust übernimmt, aber erst im nächsten Zyklus und nur, wenn
    // dieselbe Bearbeitung noch offen ist (Muster canvas-bedienung.js).
    eingabe.addEventListener('blur', () => {
      const meine = bearbeitung;
      setTimeout(() => {
        if (bearbeitung !== meine) return;
        uebernimm();
      }, 0);
    });
    eingabe.focus();
    const marke = String(eingabe.value).length;
    if (typeof eingabe.setSelectionRange === 'function') eingabe.setSelectionRange(marke, marke);
    return true;
  }

  function beiEingabeTaste(ev) {
    if (!bearbeitung) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      brichAb();
      return;
    }
    // Strg+Enter übernimmt; das schlichte Enter macht eine neue Zeile, weil
    // die Beschriftung mehrzeilig sein darf.
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      ev.stopPropagation();
      uebernimm();
      return;
    }
    // Kein Tastendruck der Eingabe darf die Fläche erreichen: `Entf` löschte
    // dort die Form, die gerade beschriftet wird.
    ev.stopPropagation();
  }

  function schliesseEingabe() {
    const b = bearbeitung;
    bearbeitung = null;
    if (b && b.eingabe.isConnected) b.eingabe.remove();
    // Mit der Eingabe verschwindet das fokussierte Element aus dem Baum; ohne
    // den Rückgriff fiele der Fokus auf den Dokument-Rumpf, und das nächste
    // Strg+Z ginge ins Leere.
    bedienung.fokussiere();
    return b;
  }

  function brichAb() {
    if (!bearbeitung) return;
    schliesseEingabe();
    markiere();
    freigabeMelden();
  }

  function uebernimm() {
    if (!bearbeitung) return false;
    const neu = String(bearbeitung.eingabe.value == null ? '' : bearbeitung.eingabe.value);
    const b = schliesseEingabe();
    if (!setzeElementInhalt(b.el, neu)) {
      // Unverändert: nichts schreiben. Eine leere Übernahme wäre ein
      // Rückgängig-Schritt ohne Wirkung.
      markiere();
      freigabeMelden();
      return false;
    }
    const ok = schreibe();
    freigabeMelden();
    return ok;
  }

  // --- Ereignisse -------------------------------------------------------------------

  function kennungAn(ziel) {
    if (!ziel || typeof ziel.closest !== 'function') return null;
    const huelle = ziel.closest('.canvas-form');
    return huelle && huelle.dataset.canvasId ? huelle.dataset.canvasId : null;
  }

  function beiDoppelklick(ev) {
    const id = kennungAn(ev.target);
    if (!id) return;
    ev.preventDefault();
    ev.stopPropagation();
    oeffneBeschriftung(id);
  }

  function beiTaste(ev) {
    if (bearbeitung || !gewaehlteForm) return;
    if (ev.key === 'Delete') {
      ev.preventDefault();
      ev.stopPropagation();
      loesche(gewaehlteForm);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      waehle(null);
    }
  }

  kartenEbene.addEventListener('mousedown', beiMausunten);
  kartenEbene.addEventListener('dblclick', beiDoppelklick);
  // Fenster-weit, weil ein Zug über den Rand der Bühne hinausgeht; abgemeldet
  // in destroy(), sonst überlebte jede geschlossene Ansicht als Leck.
  window.addEventListener('mousemove', beiBewegung);
  window.addEventListener('mouseup', beiLoslassen);

  return {
    /** Läuft gerade eine Handlung, die eine Neu-Übergabe zerstören würde? */
    blockiert() {
      return !!zug || !!bearbeitung;
    },
    /** Kennung der gewählten Form, oder `null`. */
    gewaehlteKennung() {
      return gewaehlteForm;
    },
    /** Kennung der Form unter einem Ereignis-Ziel, oder `null`. */
    kennungAn,
    /** Wählt eine Form (oder hebt die Wahl mit `null` auf). */
    waehleForm: waehle,
    /** Legt eine Form an; ohne Punkt in der Mitte des sichtbaren Ausschnitts. */
    formAnlegen,
    /** Öffnet die Beschriftungs-Eingabe, wie es der Doppelklick tut. */
    beschrifteForm: oeffneBeschriftung,
    /** Löscht eine Form, wie es `Entf` tut. */
    loescheForm: loesche,
    /** Setzt die Art einer Form (Leiste und Kontextmenü rufen dasselbe). */
    setzeArt(id, art) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && setzeFormArt(el, art) && schreibe();
    },
    /** Setzt die Randfarbe; `null` bedeutet die Standardfarbe. */
    setzeRand(id, name) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && setzeFormRand(el, name) && schreibe();
    },
    /** Setzt die Füllfarbe; `null` bedeutet ungefüllt. */
    setzeFuellung(id, name) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && setzeFormFuellung(el, name) && schreibe();
    },
    /** `Entf` und `Escape`, wenn eine Form gewählt ist (Griff der Tastatur). */
    beiTaste,
    /** Eine andere Art wurde gewählt: eigene Wahl fallen lassen (V3). */
    beiFremdWahl() {
      if (gewaehlteForm) waehle(null);
    },
    /** Übernimmt eine offene Beschriftungs-Eingabe, falls eine offen ist. */
    beendeBearbeitung() {
      return uebernimm();
    },
    /**
     * Nach jeder Zeichnung: Auswahl wieder anlegen, Leiste neu setzen.
     *
     * **Keine wartende Eingabe wie bei der Karte.** Eine neue Karte ist leer
     * und ohne Text nichts wert; eine neue Form ist bereits eine Aussage, und
     * ihre Beschriftung ist ausdrücklich optional (F3).
     */
    nachRender() {
      if (gewaehlteForm && !elementZu(gewaehlteForm)) gewaehlteForm = null;
      markiere();
    },
    /** Beim Flächen-Wechsel: Auswahl und offene Eingabe fallen lassen. */
    zuruecksetzen() {
      if (bearbeitung) brichAb();
      gewaehlteForm = null;
      zug = null;
      if (leiste) {
        leiste.remove();
        leiste = null;
      }
    },
    destroy() {
      window.removeEventListener('mousemove', beiBewegung);
      window.removeEventListener('mouseup', beiLoslassen);
      kartenEbene.removeEventListener('mousedown', beiMausunten);
      kartenEbene.removeEventListener('dblclick', beiDoppelklick);
      if (leiste) leiste.remove();
    },
  };
}
