// 4T-001747 (Epic 3E-000289): Bedienung der Verweis-Karten auf der
// Canvas-Fläche — Ziel setzen, wechseln, entfernen und öffnen, dazu das
// Anlegen einer Verweis-Karte über Kommando und Kontextmenü.
//
// **Warum ein eigenes Modul.** Derselbe Schnitt wie bei den Formen
// (4T-001701): Die Leiste baut und liest, dieses Modul führt aus und schreibt.
// `canvas-bedienung.js` lag mit 424 Code-Zeilen zu dicht am Budget von 500, und
// der Verweis ist eine eigene Fachlichkeit: Er zeigt aus der Fläche hinaus,
// seine Handlungen sind asynchron, und er hat mit Auswahl, Zug und Größen-Griff
// der Karte nichts zu tun.
//
// **Was bewusst NICHT hier steht.** Die Änderung am Modell (`setzeKartenVerweis`,
// `erzeugeKarte`, `fuegeElementEin`) liegt prozessneutral im Kern-Nachbarn
// `src/shared/canvas/canvas-elemente.js`, weil sie eine Aussage des
// Speicherformats ist. Geschrieben wird ausschließlich über den Griff
// `schreibe` der Karten-Bedienung — ein eigener Schreibweg wäre ein zweiter Ort
// für den Abgleich mit dem Dokument-Stand. Die **Auswahl** führt ebenfalls die
// Karten-Bedienung; dieses Modul hat keine eigene, es hängt seine Leiste an die
// vorhandene.
//
// **Injektions-Bauweise wie die Nachbarn** (E4): kein `app-state`, kein `api`,
// kein `i18n`. Das Auflösen und Öffnen des Ziels und die Vorschläge aus dem
// Bereichs-Index kommen als Rückrufe herein; beide brauchen die Prozess-Brücke,
// und ein Import von `api` zöge den Canvas-Ordner in den großen Datei-Zyklus
// des Renderers.
//
// **Nur-Ansicht (E3):** Im nicht änderbaren Dokument entstehen weder Leiste
// noch Ziel-Abfrage, und keine Handlung schreibt. Das **Öffnen des Ziels**
// bleibt erlaubt — es fasst das Dokument nicht an.
//
// 4T-001748 (Epic 3E-000289): Die **Bild-Karte** kommt als zweite Angabe
// derselben Karte hinzu (G8) — Setzen, Wechseln, Entfernen, Öffnen und das
// Anlegen über ein eigenes Kommando. Sie ist hier nicht eine zweite Fachlichkeit
// neben dem Verweis, sondern **derselbe** Handlungs-Satz auf einer anderen
// Angabe: dieselbe Leiste, dieselbe Abfrage, derselbe Schreibweg. Deshalb ein
// Modul und nicht zwei. Der Unterschied liegt allein im Öffnen — ein Bild geht
// über den Anlagen-Weg und nicht als geöffnetes Dokument (F3) — und darin, dass
// der Kern eine unzulässige Bild-Endung gar nicht erst annimmt.
'use strict';

import {
  erzeugeKarte,
  freieKennung,
  fuegeElementEin,
  setzeKartenBild,
  setzeKartenVerweis,
} from '../../../shared/canvas/canvas-elemente.js';
import { KARTE_BREITE, KARTE_HOEHE } from './canvas-bedienung.js';
import {
  baueBildFeld,
  baueKartenLeiste,
  baueZielFeld,
  bildFeldVon,
  kartenLeistenBefehl,
  setzeBildVorschlaege,
  setzeZielVorschlaege,
  zielFeldVon,
} from './canvas-karten-leiste.js';

/**
 * Verdrahtet die Bedienung der Verweis-Karten mit einer gezeichneten Fläche.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.kartenEbene Gemeinsame Element-Ebene; sie trägt
 *   Karten, Leisten und Eingaben und damit dieselbe Verschiebung und
 *   Vergrößerung.
 * @param {Function} ctx.modell () => Modell der gezeigten Fläche.
 * @param {object} ctx.bedienung Karten-Bedienung (Griffe: `gewaehlteKennung`,
 *   `waehleKarte`, `schreibe`, `fokussiere`, `mitteDesAusschnitts`).
 * @param {Function} [ctx.aenderbar] () => boolean (Entscheidung E3).
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {Function} [ctx.beiFreigabe] () => void, sobald keine Handlung läuft.
 * @param {Function} [ctx.oeffneZiel] (doc) => Promise<boolean>, öffnet das
 *   verwiesene Dokument an der verwiesenen Stelle. Fehlt der Rückruf, bleibt
 *   das Öffnen wirkungslos — der Stand der reinen Zeichnungs-Prüffälle.
 * @param {Function} [ctx.oeffneBild] (bild) => Promise<boolean> (4T-001748),
 *   öffnet die Bild-Datei über den Anlagen-Weg der Anwendung (F3).
 * @param {Function} [ctx.zielVorschlaege] () => Promise<Array<string>>, die
 *   Namen des Bereichs-Index für die Vorschlags-Liste.
 * @param {Function} [ctx.bildVorschlaege] () => Promise<Array<string>>
 *   (4T-001748), die Bild-Namen des Bereichs-Index für das Bild-Feld.
 * @returns {object} Steuerung für die Ansicht.
 */
export function createVerweisKartenBedienung(ctx) {
  const { kartenEbene, bedienung } = ctx;
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;

  let leiste = null;
  // Freistehende Ziel-Abfrage des Anlege-Kommandos. Sie steht auf der Fläche
  // und nicht an einer Karte, weil es die Karte noch nicht gibt: Das Ziel wird
  // **vor** dem Anlegen erfragt, damit ein Abbruch keine leere Karte
  // zurücklässt und die Karte in einem Zug mit ihrem Verweis entsteht (der
  // Kern hält `erzeugeKarte` genau dafür bereit).
  let abfrage = null;

  function modell() {
    return typeof ctx.modell === 'function' ? ctx.modell() : null;
  }

  // Die Frage wird bei jeder Handlung neu gestellt statt einmal gemerkt — der
  // Anwender schaltet den Modus um, während die Fläche steht (E3).
  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function elementZu(id) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !id) return null;
    return m.elemente.find((el) => el.art === 'karte' && el.id === id) || null;
  }

  function freigabeMelden() {
    if (abfrage) return;
    if (typeof ctx.beiFreigabe === 'function') ctx.beiFreigabe();
  }

  // --- Vorschläge aus dem Bereichs-Index ---------------------------------------
  //
  // Geholt wird bei jedem Bau eines Feldes und nicht einmal je Ansicht: Der
  // Bestand ändert sich, während die Fläche offen ist, und eine Abfrage je
  // Auswahl ist dieselbe Größenordnung wie die Vervollständigung des Editors,
  // die nach jedem `[[` fragt.
  //
  // 4T-001748: zwei Quellen, ein Weg. Das Ziel-Feld bekommt die Dokument-Namen
  // des Bereichs-Index, das Bild-Feld seine Bild-Dateien; beide kommen über
  // einen injizierten Rückruf und landen je in der Liste **ihres** Feldes.
  function vorschlaegeNachziehen(wurzel, art) {
    const quelle = art === 'bild' ? ctx.bildVorschlaege : ctx.zielVorschlaege;
    const setze = art === 'bild' ? setzeBildVorschlaege : setzeZielVorschlaege;
    if (typeof quelle !== 'function') return;
    let lauf;
    try {
      lauf = quelle();
    } catch {
      lauf = null;
    }
    if (!lauf || typeof lauf.then !== 'function') return;
    lauf.then(
      (namen) => {
        if (wurzel.isConnected) setze(wurzel, namen);
      },
      () => {},
    );
  }

  // --- Leiste an der gewählten Karte -------------------------------------------

  function zeigeLeiste() {
    if (leiste) {
      leiste.remove();
      leiste = null;
    }
    const el = elementZu(bedienung.gewaehlteKennung());
    // Im nicht änderbaren Dokument gibt es die Leiste gar nicht — sie besteht
    // bis auf den Öffnen-Knopf aus schreibenden Bedienteilen, und ein Werkzeug
    // mit einem einzigen wirksamen Knopf wäre eine Aussage über nichts (E3).
    if (!el || !aenderbar()) return;
    leiste = baueKartenLeiste({ el, t });
    leiste.addEventListener('mousedown', (ev) => ev.stopPropagation());
    leiste.addEventListener('click', beiLeistenEreignis);
    // Das Feld meldet sich über `change`: Wer mit der Tastatur abschließt,
    // klickt nie, und ein Schreibvorgang je Tastendruck wäre ein
    // Rückgängig-Schritt je Zeichen.
    leiste.addEventListener('change', beiLeistenEreignis);
    leiste.addEventListener('keydown', beiFeldTaste);
    kartenEbene.appendChild(leiste);
    // 4T-001748: beide Felder der Leiste bekommen ihre eigenen Vorschläge.
    vorschlaegeNachziehen(leiste, 'doc');
    vorschlaegeNachziehen(leiste, 'bild');
  }

  function beiLeistenEreignis(ev) {
    const id = bedienung.gewaehlteKennung();
    const el = elementZu(id);
    const befehl = el ? kartenLeistenBefehl(ev.target) : null;
    if (!befehl) return;
    if (befehl.art === 'verweis') {
      ev.stopPropagation();
      setzeVerweis(id, befehl.wert);
      return;
    }
    if (befehl.art === 'bild') {
      ev.stopPropagation();
      // 4T-001748: Der Kern nimmt nur eine zulässige Bild-Endung an (G8).
      // Weist er den Wert ab, kehren die Felder auf den geschriebenen Stand
      // zurück: Ein Feld, das einen Wert behielte, den die Datei nicht trägt,
      // behauptete eine Änderung, die es nicht gab.
      if (!setzeBild(id, befehl.wert)) setzeFeldWerte(el);
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (befehl.art === 'oeffnen') void oeffneZielVon(id);
    else if (befehl.art === 'entfernen') setzeVerweis(id, null);
    else if (befehl.art === 'bildEntfernen') setzeBild(id, null);
  }

  // Beide Felder auf den Stand des Elements. 4T-001748: Sie werden gemeinsam
  // gesetzt, weil die beiden Angaben einander ausschließen — wer ein Bild
  // setzt, hat damit einen Verweis entfernt, und die Leiste muss das zeigen.
  function setzeFeldWerte(el) {
    const ziel = zielFeldVon(leiste);
    if (ziel) ziel.value = (el && el.doc) || '';
    const bild = bildFeldVon(leiste);
    if (bild) bild.value = (el && el.bild) || '';
  }

  // Escape stellt den geschriebenen Stand wieder her, statt ihn zu übernehmen:
  // Wer abbricht, meint die Karte, wie sie war. Kein Tastendruck der Eingabe
  // erreicht die Fläche — `Entf` löschte dort die Karte, deren Ziel gerade
  // geschrieben wird.
  function beiFeldTaste(ev) {
    if (ev.key === 'Escape') {
      setzeFeldWerte(elementZu(bedienung.gewaehlteKennung()));
      ev.preventDefault();
    }
    ev.stopPropagation();
  }

  // --- Setzen, Entfernen, Öffnen -------------------------------------------------

  /**
   * Setzt oder entfernt das Ziel einer Karte; ein leerer Wert entfernt es.
   *
   * Die Karte wird damit zur Verweis-Karte und zurück; ihre Beschriftung bleibt
   * in beiden Richtungen unangetastet — sie ist ihr eigener Inhalt und hing nie
   * am Verweis (Kern, 4T-001746).
   */
  function setzeVerweis(id, ziel) {
    const el = aenderbar() ? elementZu(id) : null;
    if (!el || !setzeKartenVerweis(el, ziel)) return false;
    return bedienung.schreibe();
  }

  /**
   * Setzt oder entfernt das Bild einer Karte; ein leerer Wert entfernt es
   * (4T-001748, G8).
   *
   * **Die beiden Angaben schließen einander aus, und der Kern setzt das um:**
   * Wer einer Verweis-Karte ein Bild gibt, hat sie umgewidmet, und der Verweis
   * fällt im selben Zug weg (`setzeKartenAngabe`). Eine unzulässige Endung wird
   * gar nicht erst gesetzt — die Rückgabe `false` ist genau dieser Fall, und
   * die Leiste stellt darauf ihre Felder zurück.
   */
  function setzeBild(id, ziel) {
    const el = aenderbar() ? elementZu(id) : null;
    if (!el || !setzeKartenBild(el, ziel)) return false;
    return bedienung.schreibe();
  }

  /**
   * Öffnet das Ziel einer Karte (F3).
   *
   * Zwei Wege, weil es zwei Arten von Ziel sind: Ein Dokument wird als
   * geöffnetes Dokument geladen, ein Bild geht über den **Anlagen-Weg** der
   * Anwendung — es ist eine Datei des Bereichs und kein Dokument, und die
   * Anwendung hat für Anlagen bereits ihre Grenzen und ihre Rückfrage.
   */
  async function oeffneZielVon(id) {
    const el = elementZu(id);
    // Ausdrücklich ohne Änderbarkeits-Prüfung: Öffnen fasst das Dokument nicht
    // an und bleibt im Anzeige-Modus erlaubt (E3).
    if (!el) return false;
    if (el.doc) {
      if (typeof ctx.oeffneZiel !== 'function') return false;
      return (await ctx.oeffneZiel(el.doc)) !== false;
    }
    if (el.bild && typeof ctx.oeffneBild === 'function') {
      return (await ctx.oeffneBild(el.bild)) !== false;
    }
    return false;
  }

  // --- Anlegen -------------------------------------------------------------------

  // Das Eingabe-Feld einer Abfrage, gleich welcher Art. 4T-001748: Die Abfrage
  // trägt genau eines von beiden, und wer sie ausliest, muss ihre Art nicht
  // noch einmal kennen.
  function feldVon(wurzel) {
    return zielFeldVon(wurzel) || bildFeldVon(wurzel);
  }

  /**
   * Fragt das Ziel ab und legt danach eine Verweis- oder Bild-Karte an.
   *
   * **Ein Weg für beide Kommandos** (4T-001748): Sie unterscheiden sich allein
   * im Feld, das sie zeigen, und in der Angabe, die die neue Karte bekommt.
   * Zwei Fassungen nebeneinander wären zwei Orte für dieselbe Abfolge aus
   * Abfrage, Abbruch und Anlegen.
   *
   * @param {'doc'|'bild'} art Welche Angabe die neue Karte tragen soll.
   * @param {{punkt?: {x: number, y: number}}} [opts] Ohne Punkt in der Mitte
   *   des sichtbaren Ausschnitts; das Kontextmenü reicht die Klick-Stelle.
   * @returns {boolean} `true`, wenn die Abfrage offen steht.
   */
  function karteAnlegen(art, opts = {}) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !aenderbar()) return false;
    const punkt = opts.punkt;
    const p =
      punkt && Number.isFinite(punkt.x) && Number.isFinite(punkt.y)
        ? punkt
        : bedienung.mitteDesAusschnitts();
    schliesseAbfrage();
    const huelle = document.createElement('div');
    huelle.className = 'canvas-karte-ziel-eingabe';
    huelle.style.left = `${Math.round(p.x)}px`;
    huelle.style.top = `${Math.round(p.y)}px`;
    huelle.appendChild(art === 'bild' ? baueBildFeld(t, '') : baueZielFeld(t, ''));
    huelle.addEventListener('mousedown', (ev) => ev.stopPropagation());
    huelle.addEventListener('keydown', beiAbfrageTaste);
    kartenEbene.appendChild(huelle);
    abfrage = { huelle, punkt: p, art };
    vorschlaegeNachziehen(huelle, art);
    const feld = feldVon(huelle);
    if (feld && typeof feld.focus === 'function') feld.focus();
    // 4T-001747 (Abnahme-Befund des Product Owners vom 2026-09-14): Der
    // Fokus-Verlust bricht ab — das stand hier als Zusage im Kopf des Moduls
    // und war nicht umgesetzt. Die Folge war schwerer als eine fehlende
    // Bequemlichkeit: Wer statt `Enter` danebenklickte, ließ das Eingabe-Feld
    // stehen, und mit ihm blieb `blockiert()` dauerhaft wahr — die Fläche nahm
    // danach **keine** Neu-Übergabe mehr an, und das Feld selbst sah aus wie
    // die Karte, die es anlegen sollte.
    //
    // Aufgeschoben und gegen die eigene Abfrage geprüft, wie bei der
    // Rohtext-Eingabe der Karten-Bedienung: Ohne den Aufschub käme der `blur`
    // eines bloßen Fokus-Wechsels der Übernahme zuvor.
    if (feld) {
      feld.addEventListener('blur', () => {
        const meine = abfrage;
        setTimeout(() => {
          if (abfrage !== meine) return;
          schliesseAbfrage({ fokusZurueck: false });
          freigabeMelden();
        }, 0);
      });
    }
    return true;
  }

  // Enter legt an, Escape bricht ab. Der Fokus-Verlust bricht ebenfalls ab und
  // legt **nicht** an: Eine Karte, die beim Wegklicken entsteht, wäre eine
  // Handlung, die niemand ausgelöst hat.
  function beiAbfrageTaste(ev) {
    if (!abfrage) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      uebernimmAbfrage();
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      schliesseAbfrage();
      freigabeMelden();
      return;
    }
    ev.stopPropagation();
  }

  function uebernimmAbfrage() {
    const m = modell();
    const art = abfrage ? abfrage.art : 'doc';
    const feld = abfrage ? feldVon(abfrage.huelle) : null;
    const ziel = feld ? String(feld.value || '').trim() : '';
    const p = abfrage ? abfrage.punkt : null;
    schliesseAbfrage();
    // Ohne Ziel entsteht keine Karte: Das Kommando heißt «Verweis-Karte
    // anlegen», und eine Karte ohne Verweis wäre eine andere Handlung, die es
    // bereits gibt.
    if (!m || !Array.isArray(m.elemente) || !p || ziel === '' || !aenderbar()) {
      freigabeMelden();
      return false;
    }
    const el = erzeugeKarte({
      id: freieKennung(m, 'karte'),
      // Die Karte liegt mittig unter dem Punkt, nicht mit ihrer Ecke darauf.
      x: p.x - KARTE_BREITE / 2,
      y: p.y - KARTE_HOEHE / 2,
      b: KARTE_BREITE,
      h: KARTE_HOEHE,
      ...(art === 'bild' ? { bild: ziel } : { doc: ziel }),
    });
    // 4T-001748: Eine unzulässige Bild-Endung nimmt der Kern gar nicht erst an;
    // die Karte entstünde dann als leere Text-Karte — und das war nicht die
    // Handlung. Sie wird deshalb ganz verworfen statt halb ausgeführt.
    if (art === 'bild' && !el.bild) {
      freigabeMelden();
      return false;
    }
    // Ganz nach vorn: Die Reihenfolge in der Fence ist die Stapel-Reihenfolge
    // (G3), und wo genau, entscheidet der Kern.
    fuegeElementEin(m, el);
    bedienung.waehleKarte(el.id);
    const ok = bedienung.schreibe();
    freigabeMelden();
    return ok;
  }

  /**
   * Schließt eine offene Ziel-Abfrage.
   *
   * @param {{fokusZurueck?: boolean}} [opts] `fokusZurueck: false` beim Abbruch
   *   durch Fokus-Verlust: Dort hat der Anwender den Fokus gerade selbst
   *   woandershin gesetzt, und ihn zurückzuholen nähme ihm die Eingabe, die er
   *   eben angeklickt hat. In jedem anderen Fall verschwindet das fokussierte
   *   Element aus dem Baum, und ohne den Rückgriff fiele der Fokus auf den
   *   Dokument-Rumpf — das nächste Strg+Z ginge ins Leere.
   */
  function schliesseAbfrage(opts = {}) {
    if (!abfrage) return;
    if (abfrage.huelle.isConnected) abfrage.huelle.remove();
    abfrage = null;
    if (opts.fokusZurueck === false) return;
    bedienung.fokussiere();
  }

  return {
    /** Läuft gerade eine Handlung, die eine Neu-Übergabe zerstören würde? */
    blockiert() {
      return !!abfrage;
    },
    /** Ziel einer Karte, oder leer (das Kontextmenü fragt danach). */
    verweisVon(id) {
      const el = elementZu(id);
      return el && el.doc ? String(el.doc) : '';
    },
    /** Bild einer Karte, oder leer (4T-001748; das Kontextmenü fragt danach). */
    bildVon(id) {
      const el = elementZu(id);
      return el && el.bild ? String(el.bild) : '';
    },
    /** Die gewählte Karte hat gewechselt: Leiste neu setzen. */
    beiKartenWahl() {
      zeigeLeiste();
    },
    /** Nach jeder Zeichnung: Leiste an der gewählten Karte wieder anlegen. */
    nachRender() {
      zeigeLeiste();
    },
    /**
     * Setzt den Schreibpunkt in das Ziel-Feld der Leiste (Kontextmenü
     * «Verweis setzen…»). Es ist dasselbe Feld und nicht ein zweites: Zwei
     * Eingaben für dieselbe Angabe wären zwei Orte, an denen sie
     * auseinanderlaufen kann.
     */
    setzeVerweisAbfragen(id) {
      bedienung.waehleKarte(id);
      const feld = zielFeldVon(leiste);
      if (!feld) return false;
      if (typeof feld.focus === 'function') feld.focus();
      if (typeof feld.select === 'function') feld.select();
      return true;
    },
    /**
     * Setzt den Schreibpunkt in das Bild-Feld der Leiste (Kontextmenü «Bild
     * setzen…», 4T-001748). Dasselbe Feld wie in der Leiste, aus demselben
     * Grund wie beim Verweis darüber.
     */
    setzeBildAbfragen(id) {
      bedienung.waehleKarte(id);
      const feld = bildFeldVon(leiste);
      if (!feld) return false;
      if (typeof feld.focus === 'function') feld.focus();
      if (typeof feld.select === 'function') feld.select();
      return true;
    },
    /** Setzt oder entfernt das Ziel einer Karte. */
    setzeVerweis,
    /** Setzt oder entfernt das Bild einer Karte (4T-001748). */
    setzeBild,
    /** Entfernt den Verweis; die Karte wird wieder eine Text-Karte. */
    entferneVerweis(id) {
      return setzeVerweis(id, null);
    },
    /** Entfernt das Bild; die Karte wird wieder eine Text-Karte (4T-001748). */
    entferneBild(id) {
      return setzeBild(id, null);
    },
    /** Öffnet das Ziel einer Karte (Leiste, Kontextmenü, Doppelklick). */
    oeffneZielVon,
    /** Fragt das Ziel ab und legt danach eine Verweis-Karte an. */
    verweisKarteAnlegen(opts) {
      return karteAnlegen('doc', opts);
    },
    /** Fragt das Bild ab und legt danach eine Bild-Karte an (4T-001748). */
    bildKarteAnlegen(opts) {
      return karteAnlegen('bild', opts);
    },
    /** Beim Flächen-Wechsel: offene Abfrage und Leiste fallen lassen. */
    zuruecksetzen() {
      schliesseAbfrage();
      if (leiste) {
        leiste.remove();
        leiste = null;
      }
    },
    destroy() {
      if (abfrage && abfrage.huelle.isConnected) abfrage.huelle.remove();
      abfrage = null;
      if (leiste) leiste.remove();
      leiste = null;
    },
  };
}
