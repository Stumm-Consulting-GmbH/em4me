// 4T-001655 (Epic 3E-000287): Bedienung der Verbindungen auf der Canvas-Fläche
// — Anlegen am Anschluss-Griff, Auswahl, Leiste an der gewählten Linie
// (Richtung, Umkehren, Farbe, Beschriftung), Beschriftungs-Eingabe und Löschen.
//
// **Warum ein drittes Bedien-Modul.** Zeichnung, Karten-Bedienung und
// Kontextmenü lagen bereits nahe am Datei-Budget (Lösung von 4T-001654: 443
// und 466 von 500 Code-Zeilen); vor allem aber ist die Verbindung eine eigene
// Fachlichkeit: Sie entsteht **zwischen** zwei Karten, sie trägt Angaben, die
// keine Karte kennt (Richtung, Anschluss-Seiten, Farbe), und ihre Handlungen
// gehen an anderen Elementen entlang. Die Karten-Bedienung bleibt davon
// unberührt bis auf drei Rückrufe und einen benannten Griff.
//
// **Genau ein Element ist gewählt** (Entscheidung V3 des Product Owners vom
// 2026-09-10), eine Karte **oder** eine Verbindung. Beide Seiten heben die
// Wahl der anderen auf: die Karten-Bedienung über `beiKartenWahl`, dieses
// Modul über `bedienung.waehleKarte(null)`. Ein zweiter Auswahl-Zustand ohne
// diese Kopplung ließe zwei Ringe zugleich stehen, und `Entf` wüsste nicht
// mehr, was gemeint ist.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`; die Beschriftungen der Leiste kommen über das injizierte `t`,
// die Farb-Namen über die Schlüssel der Reiter-Gruppen, weil es dieselben acht
// Farben sind. Geschrieben wird ausschließlich über den Griff `schreibe` der
// Karten-Bedienung — ein eigener Schreibweg wäre ein zweiter Ort für den
// Abgleich mit dem Dokument-Stand.
'use strict';

import {
  LINIEN_FARBEN,
  LINIEN_RICHTUNGEN,
  linienRichtung,
} from '../../../shared/canvas/canvas-core.js';
import {
  kartenRechteck,
  seitenPunkt,
  verbindungsMitte,
  waehleSeiten,
  zielSeiteIm,
} from '../../../shared/canvas/canvas-geometrie.js';
import { vorschauPfad, SVG_NS } from './canvas-linien.js';
import { baueLinienLeiste, leistenBefehl, SEITEN_WAHL } from './canvas-linien-leiste.js';
import { setzeElementInhalt } from './canvas-bedienung.js';

// Die vier Seiten, an denen eine gewählte Karte ihre Anschluss-Griffe zeigt.
// `auto` ist keine Griff-Seite: Wer an einem Griff zieht, hat sich für eine
// Seite entschieden.
export const ANSCHLUSS_SEITEN = ['oben', 'rechts', 'unten', 'links'];

/**
 * Erste freie Kennung im Muster `e1`, `e2`, … für eine neue Verbindung.
 *
 * Geprüft wird gegen **alle** Kennungen der Fläche, nicht nur gegen die der
 * Verbindungen: Eine Karte darf `e2` heißen, und eine doppelte Kennung wäre
 * ein Befund des Kerns (Muster `freieKartenKennung`).
 */
export function freieLinienKennung(model) {
  const belegt = new Set();
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : [];
  for (const el of elemente) {
    if (el && el.id) belegt.add(String(el.id));
  }
  for (let i = 1; ; i++) {
    const kennung = `e${i}`;
    if (!belegt.has(kennung)) return kennung;
  }
}

/**
 * Neues Linien-Element in genau der Form, die `parseCanvasFence` liefert.
 *
 * Gerichtet mit dem Pfeil zur Ziel-Karte, die Anschluss-Seite der Quelle ist
 * die des Griffs — Festlegung V2. Die des Ziels bestimmt seit dem Befund 3 des
 * Product Owners vom 2026-09-10 die Ziel-Zone, auf der losgelassen wurde; ohne
 * eine solche bleibt es beim `auto` von vorher. `geaendert` steht von Anfang an
 * auf `true`, weil ein neues Element keinen Rohtext hat, den der Serialisierer
 * wörtlich übernehmen könnte.
 */
export function erzeugeLinie({ id, von, nach, seite, zielSeite }) {
  return {
    art: 'linie',
    id,
    attrs: { von: seite, nach: SEITEN_WAHL.includes(zielSeite) ? zielSeite : 'auto' },
    attrFolge: ['von', 'nach'],
    inhalt: '',
    roh: { marker: '', inhalt: [] },
    geaendert: true,
    zeile: 0,
    richtung: 'vor',
    gerichtet: true,
    von,
    nach,
    farbe: undefined,
  };
}

// Setzt oder streicht eine Angabe samt ihrer Stelle in der Attribut-Folge.
// Die Folge ist der Träger der Reihenfolge beim Schreiben: Eine neu gesetzte
// Angabe kommt ans Ende, eine entfernte verschwindet auch aus ihr — sonst
// bliebe eine Lücke stehen, die beim nächsten Schreiben nichts mehr trägt.
function setzeAngabe(el, name, wert) {
  if (wert == null || wert === '') {
    delete el.attrs[name];
    el.attrFolge = el.attrFolge.filter((n) => n !== name);
    return;
  }
  el.attrs[name] = wert;
  if (!el.attrFolge.includes(name)) el.attrFolge.push(name);
}

/**
 * Schaltet die Richtung einen Schritt weiter (G4: der Pfeil trägt sie).
 *
 * Seit Befund 2 vom 2026-09-10 ein **Kreis** aus drei Zuständen statt eines
 * Umschalters aus zweien: `vor` → `beide` → `keine` → `vor`. Ein eigener
 * vierter Bedienweg für die dritte Form wäre ein zweiter Knopf an einer
 * Leiste, die schon schmal ist; der Kreis kommt mit demselben aus.
 */
export function schalteRichtung(el) {
  if (!el) return false;
  const jetzt = LINIEN_RICHTUNGEN.indexOf(linienRichtung(el));
  el.richtung = LINIEN_RICHTUNGEN[(jetzt + 1) % LINIEN_RICHTUNGEN.length];
  el.gerichtet = el.richtung !== 'keine';
  el.geaendert = true;
  return true;
}

/**
 * Setzt die Anschluss-Seite eines Endes (Befund 3 vom 2026-09-10).
 *
 * `auto` wird ausdrücklich geschrieben und nicht gestrichen: Die Angabe stand
 * an jeder von der Fläche angelegten Linie schon vorher, und ein Feld, das die
 * Angabe je nach Wert entfernt oder setzt, hinterließe im Dokument zwei
 * Schreibweisen für dieselbe Aussage.
 *
 * @returns {boolean} `true`, wenn sich etwas geändert hat — eine Übernahme
 *   ohne Änderung wäre ein leerer Rückgängig-Schritt.
 */
export function setzeLinienSeite(el, angabe, wert) {
  if (!el || (angabe !== 'von' && angabe !== 'nach')) return false;
  const gueltig = SEITEN_WAHL.includes(wert) ? wert : 'auto';
  if ((el.attrs && el.attrs[angabe]) === gueltig) return false;
  setzeAngabe(el, angabe, gueltig);
  el.geaendert = true;
  return true;
}

/**
 * Kehrt eine Verbindung um: Quelle und Ziel tauschen, und mit ihnen ihre
 * Anschluss-Seiten. Ohne den Tausch der Seiten liefe die Linie nach dem
 * Umkehren aus der falschen Kante heraus.
 */
export function kehreUm(el) {
  if (!el) return false;
  const vonEnde = el.von;
  el.von = el.nach;
  el.nach = vonEnde;
  const vonSeite = el.attrs.von;
  const nachSeite = el.attrs.nach;
  if (vonSeite != null || nachSeite != null) {
    setzeAngabe(el, 'von', nachSeite);
    setzeAngabe(el, 'nach', vonSeite);
  }
  el.geaendert = true;
  return true;
}

/**
 * Setzt die Farbe einer Verbindung oder nimmt sie zurück.
 *
 * @param {object} el Linien-Element.
 * @param {string|null} name Name aus dem Satz des Kerns, oder leer für die
 *   gewohnte Linienfarbe.
 * @returns {boolean} `true`, wenn sich etwas geändert hat — eine Übernahme
 *   ohne Änderung wäre ein leerer Rückgängig-Schritt.
 */
export function setzeLinienFarbe(el, name) {
  if (!el) return false;
  const gueltig = name && Object.prototype.hasOwnProperty.call(LINIEN_FARBEN, name) ? name : null;
  if ((el.attrs.farbe == null ? null : el.attrs.farbe) === gueltig) return false;
  setzeAngabe(el, 'farbe', gueltig);
  el.farbe = gueltig == null ? undefined : gueltig;
  el.geaendert = true;
  return true;
}

/** Entfernt eine Verbindung samt ihrer Beschriftung; die Karten bleiben (AK6). */
export function entferneLinie(model, id) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : null;
  if (!elemente || !id) return false;
  const uebrig = elemente.filter((el) => !(el.art === 'linie' && el.id === id));
  if (uebrig.length === elemente.length) return false;
  // An Ort und Stelle ersetzen: Die Ansicht hält dieselbe Liste in der Hand.
  elemente.splice(0, elemente.length, ...uebrig);
  return true;
}

/**
 * Verdrahtet die Bedienung der Verbindungen mit einer gezeichneten Fläche.
 *
 * Die Tastatur liegt bewusst **nicht** hier: `Entf` und `Escape` laufen über
 * den bestehenden `keydown` der Fläche und erreichen dieses Modul über den
 * Griff `beiTaste` (T7). Ein zweiter Listener am selben Container hätte eine
 * Reihenfolge, die niemand mehr überblickt.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.kartenEbene Ebene der Karten; sie trägt Griffe,
 *   Leiste und Beschriftungs-Eingabe, damit alle dieselbe Verschiebung und
 *   Vergrößerung erfahren wie die Karten darunter.
 * @param {SVGElement} ctx.svgViewport Viewport der SVG-Ebene (Vorschau-Linie).
 * @param {Function} ctx.modell () => Modell der gezeigten Fläche.
 * @param {object} ctx.bedienung Karten-Bedienung (Griffe: `waehleKarte`,
 *   `flaechenPunktAus`, `schreibe`, `gewaehlteKennung`, `fokussiere`).
 * @param {Function} ctx.zeichneLinien (ueberschreibung) => void.
 * @param {Function} [ctx.aenderbar] () => boolean (Befund 1 vom 2026-09-10).
 *   Ist das Dokument nicht änderbar, gibt es weder Anschluss-Griffe noch
 *   Leiste, und keine Handlung schreibt. Fehlt der Rückruf, gilt änderbar.
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} [ctx.beiFreigabe] () => void, sobald keine Handlung läuft.
 * @param {Function} [ctx.beiLinienWahl] (id) => void (4T-001701), sobald eine
 *   Verbindung gewählt wird. Die Formen-Bedienung hebt daran ihre eigene Wahl
 *   auf (V3); ohne den Rückruf bleibt es beim Paar Karte/Verbindung.
 * @returns {object} Steuerung für die Ansicht.
 */
export function createVerbindungsBedienung(ctx) {
  const { kartenEbene, svgViewport, bedienung } = ctx;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  let gewaehlteLinie = null;
  let zug = null;
  let bearbeitung = null;
  let leiste = null;
  // Kennung der Karte, die gerade die vier Ziel-Zonen trägt (Befund 3).
  let zonenKarte = null;

  function modell() {
    return typeof ctx.modell === 'function' ? ctx.modell() : null;
  }

  // Befund 1 vom 2026-09-10: Im nicht änderbaren Dokument ist die Fläche nur
  // ansehbar. Die Frage wird bei **jeder** schreibenden Handlung und bei jedem
  // Zeichnen neu gestellt statt einmal gemerkt — der Anwender schaltet den
  // Modus um, während die Fläche steht.
  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function elementZu(id) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !id) return null;
    return m.elemente.find((el) => el.art === 'linie' && el.id === id) || null;
  }

  function karteZu(id) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !id) return null;
    return m.elemente.find((el) => el.art === 'karte' && el.id === id) || null;
  }

  function zeichneLinien(ueberschreibung) {
    if (typeof ctx.zeichneLinien === 'function') ctx.zeichneLinien(ueberschreibung);
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
    gewaehlteLinie = id && elementZu(id) ? id : null;
    // Genau ein Element ist gewählt (V3): Die Karte gibt ab, wenn die Linie
    // übernimmt. Umgekehrt meldet die Karten-Bedienung über `beiKartenWahl`.
    // 4T-001701: Seit den Formen sind es drei Arten; die dritte erfährt den
    // Wechsel über `beiLinienWahl`, damit dieses Modul sie nicht kennen muss.
    if (gewaehlteLinie) {
      bedienung.waehleKarte(null);
      if (typeof ctx.beiLinienWahl === 'function') ctx.beiLinienWahl(gewaehlteLinie);
    }
    markiere();
    if (gewaehlteLinie) bedienung.fokussiere();
  }

  function markiere() {
    for (const gruppe of svgViewport.querySelectorAll('.canvas-linie')) {
      const an = !!gewaehlteLinie && gruppe.getAttribute('data-canvas-id') === gewaehlteLinie;
      // Das Klassen-Attribut wird ganz gesetzt statt umgeschaltet: Bei einem
      // SVG-Element ist `className` eine eigene Sorte, und die Zeichnung daneben
      // vergibt ohnehin genau diese beiden Klassen.
      gruppe.setAttribute('class', an ? 'canvas-linie canvas-linie-gewaehlt' : 'canvas-linie');
      gruppe.setAttribute('aria-selected', String(an));
    }
    zeigeLeiste();
  }

  function zeigeLeiste() {
    if (leiste) {
      leiste.remove();
      leiste = null;
    }
    const el = elementZu(gewaehlteLinie);
    // Während die Beschriftung geschrieben wird, tritt die Leiste zurück: Sie
    // säße sonst auf der Eingabe, an genau derselben Stelle. Und im nicht
    // änderbaren Dokument gibt es sie gar nicht — sie besteht ausschließlich
    // aus schreibenden Knöpfen (Befund 1 vom 2026-09-10).
    if (!el || bearbeitung || !aenderbar()) return;
    const von = karteZu(el.von);
    const nach = karteZu(el.nach);
    if (!von || !nach) return;
    const seiten = waehleSeiten(von, nach, el.attrs && el.attrs.von, el.attrs && el.attrs.nach);
    leiste = baueLinienLeiste({ el, t, mitte: verbindungsMitte(von, nach, seiten) });
    leiste.addEventListener('mousedown', (ev) => ev.stopPropagation());
    leiste.addEventListener('click', beiLeistenEreignis);
    // Die Auswahlfelder melden sich über `change` und nicht über `click`: Wer
    // mit der Tastatur wählt, klickt nie.
    leiste.addEventListener('change', beiLeistenEreignis);
    kartenEbene.appendChild(leiste);
  }

  function beiLeistenEreignis(ev) {
    const el = elementZu(gewaehlteLinie);
    const befehl = el ? leistenBefehl(ev.target) : null;
    if (!befehl) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (befehl.art === 'farbe') {
      if (setzeLinienFarbe(el, befehl.wert || null)) schreibe();
    } else if (befehl.art === 'seite') {
      if (setzeLinienSeite(el, befehl.angabe, befehl.wert)) schreibe();
    } else if (befehl.art === 'richtung') {
      if (schalteRichtung(el)) schreibe();
    } else if (befehl.art === 'umkehren') {
      if (kehreUm(el)) schreibe();
    } else if (befehl.art === 'beschriftung') {
      oeffneBeschriftung(el.id);
    }
  }

  // --- Anschluss-Griffe und Anlegen (V2) ---------------------------------------

  function setzeGriffe(kartenId) {
    for (const alt of kartenEbene.querySelectorAll('.canvas-anschluss')) alt.remove();
    // Kein Griff im nicht änderbaren Dokument: Er böte eine Handlung an, die
    // beim Loslassen verworfen würde (Befund 1 vom 2026-09-10).
    if (!kartenId || !aenderbar()) return;
    const karte = kartenEbene.querySelector(`.canvas-karte[data-canvas-id="${kartenId}"]`);
    if (!karte) return;
    for (const seite of ANSCHLUSS_SEITEN) {
      const griff = document.createElement('div');
      griff.className = `canvas-anschluss canvas-anschluss-${seite}`;
      griff.dataset.seite = seite;
      griff.setAttribute('aria-hidden', 'true');
      griff.addEventListener('mousedown', (ev) => beiGriffMausunten(ev, kartenId, seite));
      karte.appendChild(griff);
    }
  }

  function beiGriffMausunten(ev, kartenId, seite) {
    if (ev.button !== 0 || !aenderbar()) return;
    ev.preventDefault();
    // Hält das Ereignis von der Karte fern: Dort begänne sonst das Verschieben.
    ev.stopPropagation();
    const karte = karteZu(kartenId);
    if (!karte) return;
    const vorschau = document.createElementNS(SVG_NS, 'path');
    vorschau.setAttribute('class', 'canvas-linie-vorschau');
    svgViewport.appendChild(vorschau);
    zug = { quelle: kartenId, seite, start: seitenPunkt(karte, seite), vorschau };
    zeichneVorschau(bedienung.flaechenPunktAus(ev));
  }

  function zeichneVorschau(zeiger) {
    if (!zug) return;
    zug.vorschau.setAttribute('d', vorschauPfad(zug.start, zeiger));
  }

  // Ziel-Karte unter einem Punkt der Fläche. Von hinten nach vorn gesucht, weil
  // die Reihenfolge in der Fence die Stapel-Reihenfolge ist (G3) und das
  // zuletzt genannte Element oben liegt. Gerechnet statt am DOM abgefragt:
  // `elementFromPoint` gäbe es nur im Browser, und die Lage steht im Modell.
  function karteUnter(punkt) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente)) return null;
    const karten = m.elemente.filter((el) => el.art === 'karte');
    for (let i = karten.length - 1; i >= 0; i--) {
      const r = kartenRechteck(karten[i]);
      if (punkt.x >= r.x && punkt.x <= r.x + r.b && punkt.y >= r.y && punkt.y <= r.y + r.h) {
        return karten[i];
      }
    }
    return null;
  }

  /**
   * Zeigt die vier Ziel-Zonen an der Karte unter dem Zeiger (Befund 3).
   *
   * Sie erscheinen nur während eines Zuges und sind für den Zeiger
   * durchlässig: Getroffen wird gerechnet (`zielSeiteIm`), nicht am DOM
   * abgefragt — dieselbe Regel, aus der auch die Ziel-Karte selbst kommt.
   *
   * @param {string|null} kartenId Karte unter dem Zeiger.
   * @param {string|null} seite hervorgehobene Zone, oder `null` für den Körper.
   */
  function setzeZielZonen(kartenId, seite) {
    if (zonenKarte !== kartenId) {
      for (const alt of kartenEbene.querySelectorAll('.canvas-zielzone')) alt.remove();
      zonenKarte = kartenId;
      const karte = kartenId
        ? kartenEbene.querySelector(`.canvas-karte[data-canvas-id="${kartenId}"]`)
        : null;
      if (!karte) zonenKarte = null;
      else {
        for (const s of ANSCHLUSS_SEITEN) {
          const zone = document.createElement('div');
          zone.className = `canvas-zielzone canvas-zielzone-${s}`;
          zone.dataset.seite = s;
          zone.setAttribute('aria-hidden', 'true');
          karte.appendChild(zone);
        }
      }
    }
    for (const zone of kartenEbene.querySelectorAll('.canvas-zielzone')) {
      zone.classList.toggle('canvas-zielzone-aktiv', zone.dataset.seite === seite);
    }
  }

  // Ziel-Karte und getroffene Zone unter einem Punkt. Die eigene Karte gilt
  // nicht als Ziel: Eine Verbindung einer Karte mit sich selbst wäre in Stufe 1
  // eine Linie ohne Aussage.
  function zielUnter(punkt, quelle) {
    const karte = karteUnter(punkt);
    if (!karte || !karte.id || karte.id === quelle) return null;
    return { id: karte.id, seite: zielSeiteIm(karte, punkt) };
  }

  function beiBewegung(ev) {
    if (!zug) return;
    const punkt = bedienung.flaechenPunktAus(ev);
    zeichneVorschau(punkt);
    const ziel = zielUnter(punkt, zug.quelle);
    setzeZielZonen(ziel ? ziel.id : null, ziel && ziel.seite !== 'auto' ? ziel.seite : null);
  }

  function beiLoslassen(ev) {
    if (!zug) return;
    const z = zug;
    zug = null;
    z.vorschau.remove();
    setzeZielZonen(null, null);
    const ziel = zielUnter(bedienung.flaechenPunktAus(ev), z.quelle);
    // Im Leeren oder auf der eigenen Karte losgelassen: Es entsteht nichts.
    // Eine Verbindung ins Leere hätte kein zweites Ende.
    if (ziel) legeAn(z.quelle, ziel.id, z.seite, ziel.seite);
    freigabeMelden();
  }

  function legeAn(vonId, nachId, seite, zielSeite) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !aenderbar()) return false;
    const el = erzeugeLinie({
      id: freieLinienKennung(m),
      von: vonId,
      nach: nachId,
      seite,
      zielSeite,
    });
    // Ans Ende der Element-Liste: Die Reihenfolge in der Fence ist die
    // Stapel-Reihenfolge (G3), und das Neue liegt oben.
    m.elemente.push(el);
    gewaehlteLinie = el.id;
    bedienung.waehleKarte(null);
    return schreibe();
  }

  // --- Beschriftung (V3, Muster der Rohtext-Eingabe der Karte) ------------------

  function oeffneBeschriftung(id) {
    const el = elementZu(id);
    // Keine Rohtext-Eingabe im nicht änderbaren Dokument (Befund 1): Sie nähme
    // Text entgegen, den beim Übernehmen niemand schreibt.
    if (!el || !aenderbar()) return false;
    if (bearbeitung) uebernimm();
    const von = karteZu(el.von);
    const nach = karteZu(el.nach);
    if (!von || !nach) return false;
    waehle(id);
    const seiten = waehleSeiten(von, nach, el.attrs && el.attrs.von, el.attrs && el.attrs.nach);
    const mitte = verbindungsMitte(von, nach, seiten);
    const eingabe = document.createElement('textarea');
    eingabe.className = 'canvas-linie-eingabe';
    // Der Rohtext, wie ihn der Parser liefert: Die Beschriftung **sind** die
    // Inhalts-Zeilen der Linie, und es gibt keinen zweiten Editor dafür.
    eingabe.value = el.inhalt || '';
    eingabe.spellcheck = false;
    eingabe.style.left = `${mitte.x}px`;
    eingabe.style.top = `${mitte.y}px`;
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
    // Strg+Enter übernimmt; das schlichte Enter macht eine neue Zeile, weil die
    // Beschriftung mehrzeilig sein darf.
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      ev.stopPropagation();
      uebernimm();
      return;
    }
    // Kein Tastendruck der Eingabe darf die Fläche erreichen: `Entf` löschte
    // dort die Verbindung, die gerade beschriftet wird.
    ev.stopPropagation();
  }

  function schliesseEingabe() {
    const b = bearbeitung;
    bearbeitung = null;
    if (b && b.eingabe.isConnected) b.eingabe.remove();
    // Mit der Eingabe verschwindet das fokussierte Element aus dem Baum; ohne
    // den Rückgriff fiele der Fokus auf den Dokument-Rumpf, und das nächste
    // Strg+Z ginge ins Leere (Befund vom 2026-09-10).
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

  // --- Ereignisse ---------------------------------------------------------------

  function kennungAn(ziel) {
    if (!ziel || typeof ziel.closest !== 'function') return null;
    const gruppe = ziel.closest('.canvas-linie');
    return gruppe ? gruppe.getAttribute('data-canvas-id') || null : null;
  }

  function beiLinienMausunten(ev) {
    if (ev.button !== 0) return;
    const id = kennungAn(ev.target);
    if (!id) return;
    ev.preventDefault();
    // Hält das Ereignis von der Bühne fern: Dort begänne sonst das Ziehen der
    // ganzen Fläche.
    ev.stopPropagation();
    if (bearbeitung) uebernimm();
    waehle(id);
  }

  function beiLinienDoppelklick(ev) {
    const id = kennungAn(ev.target);
    if (!id) return;
    ev.preventDefault();
    ev.stopPropagation();
    oeffneBeschriftung(id);
  }

  function loesche(id) {
    const m = modell();
    if (!aenderbar() || !entferneLinie(m, id)) return false;
    if (gewaehlteLinie === id) gewaehlteLinie = null;
    return schreibe();
  }

  function beiTaste(ev) {
    if (bearbeitung || !gewaehlteLinie) return;
    if (ev.key === 'Delete') {
      ev.preventDefault();
      ev.stopPropagation();
      loesche(gewaehlteLinie);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      waehle(null);
    }
  }

  svgViewport.addEventListener('mousedown', beiLinienMausunten);
  svgViewport.addEventListener('dblclick', beiLinienDoppelklick);
  // Fenster-weit, weil ein Zug über den Rand der Bühne hinausgeht; abgemeldet
  // in destroy(), sonst überlebte jede geschlossene Ansicht als Leck.
  window.addEventListener('mousemove', beiBewegung);
  window.addEventListener('mouseup', beiLoslassen);

  return {
    /** Läuft gerade eine Handlung, die eine Neu-Übergabe zerstören würde? */
    blockiert() {
      return !!zug || !!bearbeitung;
    },
    /** Kennung der gewählten Verbindung, oder `null`. */
    gewaehlteKennung() {
      return gewaehlteLinie;
    },
    /** Kennung der Verbindung unter einem Ereignis-Ziel, oder `null`. */
    kennungAn,
    /** Wählt eine Verbindung (oder hebt die Wahl mit `null` auf). */
    waehleLinie: waehle,
    /** Öffnet die Beschriftungs-Eingabe, wie es der Doppelklick tut. */
    beschrifteLinie: oeffneBeschriftung,
    /**
     * Legt eine Verbindung zwischen zwei Karten an — der Weg der Karten-Liste
     * ohne Maus (4T-001770).
     *
     * **Beide Anschluss-Seiten bleiben `auto`**: Ohne Zeiger gibt es keine
     * Seite, an der gezogen wurde, und `auto` ist genau die Angabe, welche die
     * Seite aus der Lage der beiden Karten bestimmt (V2). Angelegt wird über
     * denselben Griff wie beim Zug am Anschluss-Punkt; ein zweiter Weg in
     * dieselbe Wirkung wäre ein zweiter Ort, an dem sie auseinanderlaufen kann.
     *
     * @returns {boolean} `true`, wenn geschrieben wurde.
     */
    verbindeKarten(vonId, nachId) {
      // Eine Verbindung braucht zwei verschiedene Enden, und beide müssen
      // Karten sein: Nur sie tragen die Anschluss-Punkte (E4).
      if (!vonId || !nachId || vonId === nachId) return false;
      if (!karteZu(vonId) || !karteZu(nachId)) return false;
      return legeAn(vonId, nachId, 'auto', 'auto');
    },
    /** Löscht eine Verbindung, wie es `Entf` tut. */
    loescheLinie: loesche,
    /** Schaltet die Richtung einen Schritt weiter; eine Handlung, ein Schritt. */
    schalteRichtungVon(id) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && schalteRichtung(el) && schreibe();
    },
    /** Kehrt die Verbindung um (Enden samt Anschluss-Seiten). */
    kehreUmVon(id) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && kehreUm(el) && schreibe();
    },
    /** Setzt die Farbe einer Verbindung oder nimmt sie zurück. */
    faerbeLinie(id, name) {
      const el = aenderbar() ? elementZu(id) : null;
      return !!el && setzeLinienFarbe(el, name) && schreibe();
    },
    /** Übernimmt eine offene Beschriftungs-Eingabe, falls eine offen ist. */
    beendeBearbeitung() {
      return uebernimm();
    },
    /** `Entf` und `Escape`, wenn keine Karte gewählt ist (Griff der Tastatur). */
    beiTaste,
    /** Die gewählte Karte hat gewechselt: Wahl aufheben, Griffe umhängen. */
    beiKartenWahl(id) {
      if (id && gewaehlteLinie) waehle(null);
      setzeGriffe(id);
    },
    /** Nach jeder Zeichnung: Auswahl wieder anlegen, Griffe und Leiste setzen. */
    nachRender() {
      if (gewaehlteLinie && !elementZu(gewaehlteLinie)) gewaehlteLinie = null;
      // Die Karten sind frisch, und mit ihnen sind die Ziel-Zonen aus dem Baum
      // verschwunden; der gemerkte Träger zeigte sonst auf ein totes Element.
      zonenKarte = null;
      markiere();
      setzeGriffe(bedienung.gewaehlteKennung());
    },
    /** Beim Flächen-Wechsel: Auswahl und offene Eingabe fallen lassen. */
    zuruecksetzen() {
      if (bearbeitung) brichAb();
      gewaehlteLinie = null;
      if (zug) {
        zug.vorschau.remove();
        zug = null;
      }
      setzeZielZonen(null, null);
      if (leiste) {
        leiste.remove();
        leiste = null;
      }
    },
    /** Zeichnet die Verbindungen mit einer Live-Lage neu (AK4). */
    beiZugLage(id, rechteck) {
      zeichneLinien({ id, rechteck });
    },
    destroy() {
      window.removeEventListener('mousemove', beiBewegung);
      window.removeEventListener('mouseup', beiLoslassen);
      svgViewport.removeEventListener('mousedown', beiLinienMausunten);
      svgViewport.removeEventListener('dblclick', beiLinienDoppelklick);
      if (leiste) leiste.remove();
    },
  };
}
