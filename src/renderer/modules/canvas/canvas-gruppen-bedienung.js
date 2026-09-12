// 4T-001702 (Epic 3E-000288): Bedienung der Gruppen auf der Canvas-Fläche —
// Anlegen über Kommando und Kontextmenü, Auswahl, Ziehen **samt Mitgliedern**,
// Größe-Ändern, Beschriftung, Farbe und Löschen.
//
// **Warum ein fünftes Bedien-Modul.** Die Gruppe teilt mit der Form die
// Mechanik (Auswahl, Zug, Griff, Beschriftung) und unterscheidet sich in genau
// dem, worum es bei ihr geht: Sie nimmt beim Verschieben **fremde Elemente**
// mit, ihr Innenraum bleibt für den Zeiger durchlässig, und sie trägt eine
// einzige Farbe statt Art, Rand und Füllung. Eine gemeinsame Bedienung für
// beide hätte an jeder zweiten Stelle eine Weiche getragen, und die
// Formen-Bedienung liegt mit 434 von 500 Code-Zeilen ohnehin nahe am Budget.
//
// **Was bewusst NICHT hier steht.** Lage, Größe und Inhalt setzen die
// Funktionen der Karten-Bedienung (`setzeKartenLage`, `setzeKartenGroesse`,
// `setzeElementInhalt`); die Änderungen am **Modell** (anlegen, entfernen,
// Farbe setzen) liegen prozessneutral in `canvas-elemente.js`, und die Frage,
// **wer** Mitglied ist, beantwortet die reine Geometrie (`gruppenMitglieder`).
// Geschrieben wird ausschließlich über den Griff `schreibe` der
// Karten-Bedienung — ein eigener Schreibweg wäre ein zweiter Ort für den
// Abgleich mit dem Dokument-Stand.
//
// **Ein Schreib-Vorgang je Zug, nicht je Mausbewegung.** Das Verschieben einer
// Gruppe mit zwölf Karten ändert dreizehn Elemente; sie gehen als **eine**
// Übernahme ins Dokument, und das Rückgängig-Machen nimmt den ganzen Zug in
// einem Schritt zurück. Während des Zuges wandern allein die gezeichneten
// Hüllen.
//
// **Genau ein Element ist gewählt** (Entscheidung V3 des Product Owners vom
// 2026-09-10), jetzt über vier Arten: Karte, Verbindung, Form **oder** Gruppe.
// Die Kopplung läuft über die benannten Griffe und nicht über einen zweiten
// Auswahl-Zustand, der stillschweigend auseinanderliefe.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`.
'use strict';

import {
  entferneElement,
  erzeugeGruppe,
  freieKennung,
  fuegeElementEin,
  setzeGruppenFarbe,
} from '../../../shared/canvas/canvas-elemente.js';
import {
  MIN_BREITE,
  MIN_HOEHE,
  gruppenMitglieder,
  kartenRechteck,
} from '../../../shared/canvas/canvas-geometrie.js';
import { setzeElementInhalt, setzeKartenGroesse, setzeKartenLage } from './canvas-bedienung.js';
import {
  BESCHRIFTUNGS_HOEHE,
  GRUPPE_BREITE,
  GRUPPE_HOEHE,
  baueGruppenLeiste,
  gruppenLeistenBefehl,
} from './canvas-gruppen.js';

// Bewegung in Bildschirm-Pixeln, unterhalb derer ein Zug ein Klick bleibt.
// Wert und Begründung aus der Karten-Bedienung übernommen.
const KLICK_SCHWELLE = 3;

// Die Hüllen, die eine Element-Kennung tragen und beim Zug der Gruppe
// mitwandern. Leiste und Eingabe tragen dieselbe Kennung und gehören
// ausdrücklich **nicht** dazu — sie sind Werkzeug und nicht Inhalt.
const HUELLEN_WAHL = ['.canvas-karte', '.canvas-form', '.canvas-gruppe'];

/**
 * Verdrahtet die Gruppen-Bedienung mit einer gezeichneten Fläche.
 *
 * Die Tastatur liegt bewusst **nicht** hier: `Entf` und `Escape` laufen über
 * den bestehenden `keydown` der Fläche und erreichen dieses Modul über den
 * Griff `beiTaste` (Muster der Formen und der Verbindungen).
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.kartenEbene Gemeinsame Element-Ebene.
 * @param {Function} ctx.modell () => Modell der gezeigten Fläche.
 * @param {object} ctx.bedienung Karten-Bedienung (Griffe: `waehleKarte`,
 *   `mitteDesAusschnitts`, `flaechenMassstab`, `schreibe`, `fokussiere`).
 * @param {Function} [ctx.waehleLinie] (null) => void, hebt die Wahl einer
 *   Verbindung auf.
 * @param {Function} [ctx.waehleForm] (null) => void, hebt die Wahl einer Form
 *   auf.
 * @param {Function} [ctx.aenderbar] () => boolean (Entscheidung E3). Ist das
 *   Dokument nicht änderbar, gibt es weder Griff noch Leiste, und keine
 *   Handlung schreibt. Fehlt der Rückruf, gilt änderbar.
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} [ctx.beiFreigabe] () => void, sobald keine Handlung läuft.
 * @returns {object} Steuerung für die Ansicht.
 */
export function createGruppenBedienung(ctx) {
  const { kartenEbene, bedienung } = ctx;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  let gewaehlteGruppe = null;
  let zug = null;
  let bearbeitung = null;
  let leiste = null;

  function modell() {
    return typeof ctx.modell === 'function' ? ctx.modell() : null;
  }

  // Die Frage wird bei **jeder** schreibenden Handlung neu gestellt statt
  // einmal gemerkt — der Anwender schaltet den Modus um, während die Fläche
  // steht (Entscheidung E3).
  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function elementZu(id) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !id) return null;
    return m.elemente.find((el) => el.art === 'gruppe' && el.id === id) || null;
  }

  // Die gezeichnete Hülle eines beliebigen Elements der Stapel-Ebene. Sie wird
  // beim Zug der Gruppe mitgeführt, damit der Anwender sieht, was er bewegt.
  function huelleZu(id) {
    if (!id) return null;
    return kartenEbene.querySelector(
      HUELLEN_WAHL.map((k) => `${k}[data-canvas-id="${id}"]`).join(', '),
    );
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
    gewaehlteGruppe = id && elementZu(id) ? id : null;
    // Genau ein Element ist gewählt (V3): Karte, Verbindung und Form geben ab,
    // wenn die Gruppe übernimmt. Umgekehrt meldet die Ansicht über
    // `beiFremdWahl`.
    if (gewaehlteGruppe) {
      bedienung.waehleKarte(null);
      if (typeof ctx.waehleLinie === 'function') ctx.waehleLinie(null);
      if (typeof ctx.waehleForm === 'function') ctx.waehleForm(null);
    }
    markiere();
    if (gewaehlteGruppe) bedienung.fokussiere();
  }

  function markiere() {
    for (const el of kartenEbene.querySelectorAll('.canvas-gruppe')) {
      const an = !!gewaehlteGruppe && el.dataset.canvasId === gewaehlteGruppe;
      el.classList.toggle('canvas-gruppe-gewaehlt', an);
      el.setAttribute('aria-selected', String(an));
    }
    zeigeLeiste();
  }

  function zeigeLeiste() {
    if (leiste) {
      leiste.remove();
      leiste = null;
    }
    const el = elementZu(gewaehlteGruppe);
    // Während die Beschriftung geschrieben wird, tritt die Leiste zurück; und
    // im nicht änderbaren Dokument gibt es sie gar nicht — sie besteht
    // ausschließlich aus schreibenden Knöpfen (Entscheidung E3).
    if (!el || bearbeitung || !aenderbar()) return;
    leiste = baueGruppenLeiste({ el, t });
    leiste.addEventListener('mousedown', (ev) => ev.stopPropagation());
    leiste.addEventListener('click', beiLeistenEreignis);
    kartenEbene.appendChild(leiste);
  }

  function beiLeistenEreignis(ev) {
    const el = elementZu(gewaehlteGruppe);
    const befehl = el ? gruppenLeistenBefehl(ev.target) : null;
    if (!befehl) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (befehl.art === 'farbe') {
      if (setzeGruppenFarbe(el, befehl.wert)) schreibe();
    } else if (befehl.art === 'beschriftung') {
      oeffneBeschriftung(el.id);
    }
  }

  // --- Anlegen ------------------------------------------------------------------

  /**
   * Legt eine Gruppe an; ohne Punkt in der Mitte des sichtbaren Ausschnitts.
   *
   * @param {{punkt?: {x: number, y: number}}} [opts]
   * @returns {boolean} `true`, wenn geschrieben wurde.
   */
  function gruppeAnlegen(opts = {}) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !aenderbar()) return false;
    const punkt = opts.punkt;
    const p =
      punkt && Number.isFinite(punkt.x) && Number.isFinite(punkt.y)
        ? punkt
        : bedienung.mitteDesAusschnitts();
    const el = erzeugeGruppe({
      id: freieKennung(m, 'gruppe'),
      // Die Gruppe liegt mittig unter dem Klick-Punkt, nicht mit ihrer Ecke
      // darauf: Angeklickt wird die Stelle, an der sie stehen soll.
      x: p.x - GRUPPE_BREITE / 2,
      y: p.y - GRUPPE_HOEHE / 2,
      b: GRUPPE_BREITE,
      h: GRUPPE_HOEHE,
    });
    // Ganz nach hinten (G3, Story 4S-000932): Eine neue Gruppe verdeckt nichts.
    // Wo das in der Liste ist, entscheidet der Kern und nicht die Bedienung.
    fuegeElementEin(m, el);
    gewaehlteGruppe = el.id;
    bedienung.waehleKarte(null);
    if (typeof ctx.waehleLinie === 'function') ctx.waehleLinie(null);
    if (typeof ctx.waehleForm === 'function') ctx.waehleForm(null);
    return schreibe();
  }

  // --- Löschen --------------------------------------------------------------------

  /**
   * Löscht eine Gruppe. **Ihre Mitglieder bleiben stehen** (Entscheidung F4):
   * Es verschwindet allein das Rechteck. Das ist keine Sonderbehandlung,
   * sondern die Folge davon, dass es keine Mitgliedschaft im Modell gibt —
   * `entferneElement` entfernt genau ein Element.
   */
  function loesche(id) {
    const m = modell();
    if (!aenderbar() || !elementZu(id) || !entferneElement(m, id)) return false;
    if (gewaehlteGruppe === id) gewaehlteGruppe = null;
    return schreibe();
  }

  // --- Ziehen und Größe-Ändern ------------------------------------------------------

  function setzeStil(huelle, r) {
    if (!huelle) return;
    huelle.style.left = `${Math.round(r.x)}px`;
    huelle.style.top = `${Math.round(r.y)}px`;
    huelle.style.width = `${Math.round(r.b)}px`;
    huelle.style.height = `${Math.round(r.h)}px`;
  }

  // Mitglieder **zum Zeitpunkt des Zug-Beginns** (Story 4S-000931). Die Frage
  // wird einmal gestellt und nicht je Mausbewegung: Sonst verlöre die Gruppe
  // ihre Mitglieder in dem Augenblick, in dem sie mit ihnen den Rahmen
  // verlässt, und nähme unterwegs neue auf.
  function mitgliederFuer(el) {
    const m = modell();
    const elemente = m && Array.isArray(m.elemente) ? m.elemente : [];
    return gruppenMitglieder(el, elemente).map((mel) => ({
      el: mel,
      start: kartenRechteck(mel),
      huelle: huelleZu(mel.id),
    }));
  }

  function beiMausunten(ev) {
    if (ev.button !== 0) return;
    const ziel = ev.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // Während eine Eingabe offen ist, gehört die Maus ihr: Sonst ließe sich in
    // der Beschriftung weder die Schreibmarke setzen noch Text markieren.
    if (bearbeitung && ziel.closest('.canvas-gruppe-eingabe')) return;
    const huelle = ziel.closest('.canvas-gruppe');
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
    const art = ziel.closest('.canvas-gruppe-griff') ? 'groesse' : 'verschieben';
    zug = {
      art,
      huelle,
      el,
      startX: ev.clientX,
      startY: ev.clientY,
      letztX: ev.clientX,
      letztY: ev.clientY,
      bewegt: 0,
      start: r,
      jetzt: { ...r },
      // Das Größe-Ändern verschiebt nichts (F4); es braucht deshalb auch keine
      // Mitglieder-Liste. Welche Elemente danach drin liegen, ergibt sich von
      // selbst aus dem neuen Rechteck.
      mitglieder: art === 'verschieben' ? mitgliederFuer(el) : [],
    };
  }

  function beiBewegung(ev) {
    if (!zug) return;
    zug.bewegt += Math.abs(ev.clientX - zug.letztX) + Math.abs(ev.clientY - zug.letztY);
    zug.letztX = ev.clientX;
    zug.letztY = ev.clientY;
    // Gegen den Start gerechnet statt aufsummiert, und durch die Vergrößerung
    // geteilt: Der Zeiger bewegt sich in Bildschirm-Pixeln, die Gruppe in
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
    setzeStil(zug.huelle, zug.jetzt);
    // Die Mitglieder wandern sichtbar mit, um dieselbe Differenz. Geschrieben
    // wird nichts; die Verbindungen folgen ihren Karten beim Neuzeichnen nach
    // dem Zug — ein Live-Nachziehen über alle Mitglieder wäre ein zweiter
    // Zeichen-Weg neben dem einen in der Ansicht.
    for (const m of zug.mitglieder) {
      setzeStil(m.huelle, {
        x: m.start.x + (zug.jetzt.x - zug.start.x),
        y: m.start.y + (zug.jetzt.y - zug.start.y),
        b: m.start.b,
        h: m.start.h,
      });
    }
  }

  function beiLoslassen() {
    if (!zug) return;
    const z = zug;
    zug = null;
    if (z.bewegt <= KLICK_SCHWELLE) {
      // Ein Klick, kein Zug: Die Gruppe ist gewählt, das Dokument unberührt.
      setzeStil(z.huelle, kartenRechteck(z.el));
      for (const m of z.mitglieder) setzeStil(m.huelle, m.start);
      freigabeMelden();
      return;
    }
    let geaendert;
    if (z.art === 'verschieben') {
      // Die Differenz wird an der **gerundeten** neuen Lage der Gruppe
      // abgelesen und nicht an der rohen Maus-Bewegung: So wandern Gruppe und
      // Mitglieder um exakt dieselbe ganze Zahl, und ihre Anordnung
      // zueinander bleibt unverändert (AK8 der Story).
      const neuX = Math.round(z.jetzt.x);
      const neuY = Math.round(z.jetzt.y);
      const dx = neuX - z.start.x;
      const dy = neuY - z.start.y;
      geaendert = setzeKartenLage(z.el, neuX, neuY);
      for (const m of z.mitglieder) {
        if (setzeKartenLage(m.el, m.start.x + dx, m.start.y + dy)) geaendert = true;
      }
    } else {
      geaendert = setzeKartenGroesse(z.el, z.jetzt.b, z.jetzt.h);
    }
    // Ein Schreib-Vorgang für den ganzen Zug: Das Rückgängig-Machen nimmt ihn
    // in einem Schritt zurück, samt aller mitgewanderten Mitglieder.
    if (geaendert) schreibe();
    freigabeMelden();
  }

  // --- Beschriftung (Muster der Formen-Beschriftung) ---------------------------

  function oeffneBeschriftung(id) {
    const el = elementZu(id);
    // Keine Eingabe im nicht änderbaren Dokument (E3): Sie nähme Text
    // entgegen, den beim Übernehmen niemand schreibt.
    if (!el || !aenderbar()) return false;
    if (bearbeitung) uebernimm();
    waehle(id);
    const r = kartenRechteck(el);
    const eingabe = document.createElement('textarea');
    eingabe.className = 'canvas-gruppe-eingabe';
    // Der Rohtext, wie ihn der Parser liefert: Die Beschriftung **sind** die
    // Inhalts-Zeilen der Gruppe, und es gibt keinen zweiten Editor dafür.
    eingabe.value = el.inhalt || '';
    eingabe.spellcheck = false;
    // Oben in der Gruppe, wo auch die Beschriftung steht: Eine Eingabe über die
    // ganze Gruppe verdeckte deren Inhalt und damit den Zusammenhang, in dem
    // die Beschriftung geschrieben wird.
    eingabe.style.left = `${r.x}px`;
    eingabe.style.top = `${r.y}px`;
    eingabe.style.width = `${r.b}px`;
    eingabe.style.height = `${Math.min(r.h, BESCHRIFTUNGS_HOEHE)}px`;
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
    // dort die Gruppe, die gerade beschriftet wird.
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
    const huelle = ziel.closest('.canvas-gruppe');
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
    if (bearbeitung || !gewaehlteGruppe) return;
    if (ev.key === 'Delete') {
      ev.preventDefault();
      ev.stopPropagation();
      loesche(gewaehlteGruppe);
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
    /** Kennung der gewählten Gruppe, oder `null`. */
    gewaehlteKennung() {
      return gewaehlteGruppe;
    },
    /** Kennung der Gruppe unter einem Ereignis-Ziel, oder `null`. */
    kennungAn,
    /** Wählt eine Gruppe (oder hebt die Wahl mit `null` auf). */
    waehleGruppe: waehle,
    /** Legt eine Gruppe an; ohne Punkt in der Mitte des sichtbaren Ausschnitts. */
    gruppeAnlegen,
    /** Öffnet die Beschriftungs-Eingabe, wie es der Doppelklick tut. */
    beschrifteGruppe: oeffneBeschriftung,
    /** Löscht eine Gruppe, wie es `Entf` tut; die Mitglieder bleiben stehen. */
    loescheGruppe: loesche,
    /** Setzt die Farbe; `null` bedeutet die Standardfarbe des Farbschemas. */
    setzeFarbe(id, name) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && setzeGruppenFarbe(el, name) && schreibe();
    },
    /** `Entf` und `Escape`, wenn eine Gruppe gewählt ist (Griff der Tastatur). */
    beiTaste,
    /** Eine andere Art wurde gewählt: eigene Wahl fallen lassen (V3). */
    beiFremdWahl() {
      if (gewaehlteGruppe) waehle(null);
    },
    /** Übernimmt eine offene Beschriftungs-Eingabe, falls eine offen ist. */
    beendeBearbeitung() {
      return uebernimm();
    },
    /**
     * Nach jeder Zeichnung: Auswahl wieder anlegen, Leiste neu setzen.
     *
     * **Keine wartende Eingabe wie bei der Karte.** Eine neue Gruppe ist bereits
     * eine Aussage — sie fasst zusammen, was in ihr liegt —, und ihre
     * Beschriftung ist ausdrücklich optional.
     */
    nachRender() {
      if (gewaehlteGruppe && !elementZu(gewaehlteGruppe)) gewaehlteGruppe = null;
      markiere();
    },
    /** Beim Flächen-Wechsel: Auswahl und offene Eingabe fallen lassen. */
    zuruecksetzen() {
      if (bearbeitung) brichAb();
      gewaehlteGruppe = null;
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
