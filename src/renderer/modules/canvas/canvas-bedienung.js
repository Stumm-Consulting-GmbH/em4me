// 4T-001654 (Epic 3E-000287): Bedienung der Karten auf der Canvas-Fläche —
// Auswahl, Anlegen, Ziehen, Größe-Ändern, Rohtext-Bearbeitung und Löschen.
//
// **Warum ein eigenes Modul neben canvas-view.js.** Die Zeichnung ist eine
// Abbildung des Modells und bleibt es; die Bedienung ist der umgekehrte Weg
// und trägt allein den Zustand einer angefangenen Handlung (gewählte Karte,
// laufender Zug, offene Eingabe). Beides in einer Datei hätte zwei Fachlich-
// keiten mit gegenläufiger Richtung vermischt und die Ansicht über das
// Datei-Budget getrieben. Die Ansicht reicht ihre DOM-Anker und drei
// Rückrufe herein (`lage`, `modell`, `flaeche`, `neuZeichnen`), sonst nichts.
//
// **Abhängigkeits-frei wie die Ansicht** (Injektions-Bauweise E4): kein
// `app-state`, kein `api`, kein `i18n`, kein anderes Renderer-Modul — nur der
// prozessneutrale Kern und die Geometrie aus `src/shared/`. Damit bleibt der
// Canvas-Ordner außerhalb des großen Datei-Zyklus des Renderers, den der
// Ordner-Import-Wächter als Ratsche eingefroren hat.
//
// **Der Schreibweg** geht nie an der Fence vorbei: Eine Handlung ändert die
// Felder ihres Elements **und** setzt `geaendert = true`, danach schreibt
// `serializeCanvasFence` den ganzen Rumpf neu — wörtlich für alles
// Unveränderte, kanonisch nur für das eine berührte Element (Festlegung G2).
// Der neu gebaute Rumpf geht als `beiAenderung({ flaeche, rumpf })` an die
// Einbettung, die ihn in das Dokument stellt. Eine Bedien-Handlung ist genau
// eine Übernahme und damit ein Rückgängig-Schritt: Ziehen und Größe-Ändern
// schreiben erst am `mouseup`, der Karten-Text erst bei der Übernahme.
//
// **Rückgängig gehört zur Fläche, nicht zum Editor** (Befund des Product
// Owners vom 2026-09-10). Die Historie liegt im CodeMirror-Zustand der Spalte,
// ihr einziger Bedienort war aber das Tastenkürzel-Verzeichnis der EditorView.
// In der Canvas-Ansicht ist der Editor versteckt und nicht fokussiert, also
// erreichte ihn kein `Strg+Z`. Die Fläche nimmt die Tasten deshalb selbst
// entgegen und reicht sie über `beiRueckgaengig`/`beiWiederholen` an die
// Historie der Spalte weiter — dieselbe Historie, in die auch jede
// Bedien-Handlung schreibt.
'use strict';

import { serializeCanvasFence } from '../../../shared/canvas/canvas-core.js';
// 4T-001701: Anlegen, Entfernen und Umordnen liegen seit 4T-001700
// prozessneutral im Kern-Nachbarn — wo ein Element in der Liste steht, ist
// eine Aussage des Speicherformats (G3) und nicht der Anzeige. Die
// Karten-Fassungen `freieKartenKennung`, `erzeugeKarte` und `entferneKarte`
// dieses Moduls sind darin aufgegangen, wie es die Übergabe von 4T-001700
// vorsah; der Alias hält den Namen des Griffes unten von der Funktion des
// Kerns getrennt.
import {
  entferneElement,
  erzeugeKarte,
  freieKennung,
  fuegeElementEin,
  verschiebeImStapel as verschiebeElementImStapel,
} from '../../../shared/canvas/canvas-elemente.js';
import {
  MIN_BREITE,
  MIN_HOEHE,
  huelle,
  kartenRechteck,
} from '../../../shared/canvas/canvas-geometrie.js';
// 4T-001655: Was als Hintergrund der Fläche gilt, entscheidet **eine** Regel
// für alle drei Fragesteller (Flächen-Ziehen, Auswahl-Aufhebung, Doppelklick).
// Seit die Verbindungen anfassbar sind, gehört zu ihr mehr als die Karte, und
// eine zweite Kopie dieser Aufzählung liefe unweigerlich auseinander.
import { istHintergrund } from './canvas-linien.js';

// Maße einer neu angelegten Karte. Bewusst großzügiger als die Untergrenzen
// der Geometrie: Eine frische Karte soll beschreibbar sein, nicht kleinstmöglich.
export const KARTE_BREITE = 240;
export const KARTE_HOEHE = 120;

// Bewegung in Bildschirm-Pixeln, unterhalb derer ein Zug ein Klick bleibt.
// Wert und Begründung von graph-view.js übernommen: Ohne Schwelle würde jedes
// Zittern der Hand beim Auswählen eine Schreib-Transaktion auslösen.
const KLICK_SCHWELLE = 3;

/**
 * Setzt die Lage einer Karte auf ganze Zahlen.
 *
 * @returns {boolean} `true`, wenn sich etwas geändert hat (nur dann wird
 *   geschrieben — eine Übernahme ohne Änderung wäre ein leerer
 *   Rückgängig-Schritt).
 */
export function setzeKartenLage(el, x, y) {
  const neuX = Math.round(x);
  const neuY = Math.round(y);
  if (!el || (el.x === neuX && el.y === neuY)) return false;
  el.x = neuX;
  el.y = neuY;
  el.geaendert = true;
  return true;
}

/** Setzt die Größe einer Karte auf ganze Zahlen, nie unter die Untergrenzen. */
export function setzeKartenGroesse(el, b, h) {
  const neuB = Math.max(MIN_BREITE, Math.round(b));
  const neuH = Math.max(MIN_HOEHE, Math.round(h));
  if (!el || (el.b === neuB && el.h === neuH)) return false;
  el.b = neuB;
  el.h = neuH;
  el.geaendert = true;
  return true;
}

/**
 * Setzt den Inhalt eines Elements aus dem Rohtext der Eingabe.
 *
 * Zeilenenden werden auf `\n` vereinheitlicht, weil der Serialisierer die
 * Inhalts-Zeilen selbst wieder an das Zeilenende des Dokuments anpasst; ein
 * durchgereichtes `\r` erschiene sonst mitten in einer Zeile.
 *
 * 4T-001655: Bewusst über die Art hinweg. Der Inhalt einer Verbindung ist ihre
 * Beschriftung und wird genauso abgelegt wie der Text einer Karte; eine zweite
 * Funktion mit demselben Rumpf wäre ein zweiter Ort für dieselbe Regel.
 */
export function setzeElementInhalt(el, text) {
  const neu = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (!el || el.inhalt === neu) return false;
  el.inhalt = neu;
  el.geaendert = true;
  return true;
}

/**
 * Verdrahtet die Karten-Bedienung mit einer gezeichneten Fläche.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.wurzelEl Wurzel der Ansicht (trägt Fokus und Tastatur).
 * @param {HTMLElement} ctx.buehne Bühne (Hintergrund der Fläche).
 * @param {HTMLElement} ctx.kartenEbene Ebene der Karten.
 * @param {Function} ctx.lage () => {scale, tx, ty} der gemeinsamen Verschiebung.
 * @param {Function} ctx.modell () => Modell der gezeigten Fläche.
 * @param {Function} ctx.flaeche () => Beschreibung der gezeigten Fläche.
 * @param {Function} ctx.neuZeichnen () => void, zeichnet die Fläche neu.
 * @param {Function} [ctx.aenderbar] () => boolean (Befund 1 des Product Owners
 *   vom 2026-09-10). Im Anzeige-Modus ist das Dokument nicht änderbar; die
 *   Fläche bietet dann keine schreibende Handlung mehr an. Fehlt der Rückruf,
 *   gilt änderbar — das ist der Stand der Einbettungen, die den Modus nicht
 *   kennen, und der Schreibweg bleibt über `beiAenderung` eigens gesichert.
 * @param {Function} [ctx.beiAenderung] ({flaeche, rumpf}) => boolean.
 * @param {Function} [ctx.beiFreigabe] () => void, sobald keine Handlung mehr läuft.
 * @param {Function} [ctx.beiRueckgaengig] () => boolean, ein Schritt zurück in
 *   der Historie der Spalte. Fehlt er, bleibt `Strg+Z` auf der Fläche ohne
 *   Wirkung — genau der Stand der reinen Zeichnungs-Prüffälle.
 * @param {Function} [ctx.beiWiederholen] () => boolean, ein Schritt vorwärts.
 * @param {Function} [ctx.beiKartenWahl] (id|null) => void (4T-001655), sobald
 *   sich die gewählte Karte ändert. Die Bedienung der Verbindungen hebt daran
 *   ihre eigene Wahl auf und setzt die Anschluss-Griffe.
 * @param {Function} [ctx.beiZugLage] (id, {x, y, b, h}) => void (4T-001655),
 *   je Mausbewegung eines Zuges. Trägt die Live-Lage, damit die Verbindungen
 *   der Karte folgen, bevor geschrieben wird (AK4).
 * @param {Function} [ctx.beiHintergrund] () => void (4T-001655), bei jedem
 *   Klick auf den Hintergrund der Fläche — er hebt jede Auswahl auf.
 * @param {Function} [ctx.beiVerweisKoerper] (id) => void (4T-001747, seit
 *   4T-001748 auch für die Bild-Karte), beim Doppelklick auf den Körper einer
 *   Karte, die auf etwas zeigt. Er öffnet das Ziel statt die Rohtext-Eingabe;
 *   fehlt der Rückruf, bleibt der Doppelklick dort ohne Wirkung — die Eingabe
 *   wird in keinem Fall geöffnet.
 * @param {Function} [ctx.beiTasteOhneKarte] (ev) => void (4T-001655), für
 *   `Entf` und `Escape`, wenn keine Karte, aber vielleicht eine Verbindung
 *   gewählt ist.
 * @param {Function} [ctx.verschiebeAusschnitt] (tx, ty) => void (4T-001769).
 *   Setzt die Verschiebung der gemeinsamen Ebene, ohne die Vergrößerung
 *   anzufassen. Fehlt der Rückruf, wählt `zeigeElement` nur aus und lässt den
 *   Ausschnitt stehen — der Stand der reinen Bedien-Prüffälle.
 * @param {Function} [ctx.waehleFremdesElement] (art, id) => void (4T-001769).
 *   Wählt ein Element, das nicht diesem Modul gehört (Form, Gruppe,
 *   Verbindung). Die Ansicht kennt alle vier Bedienungen und löst den Ruf auf;
 *   dieses Modul muss die drei anderen dafür nicht kennen.
 * @returns {object} Steuerung für die Ansicht.
 */
export function createKartenBedienung(ctx) {
  const { wurzelEl, buehne, kartenEbene } = ctx;

  let gewaehlteKarte = null;
  let zug = null;
  let bearbeitung = null;
  // 4T-001770: Die Griffe der übrigen Element-Arten, angemeldet vom
  // Kontextmenü. Siehe `fuehreHandlung` und `uebernimmElementGriffe`.
  let elementGriffe = null;
  // Kennung, deren Rohtext-Bearbeitung nach der nächsten Zeichnung geöffnet
  // wird. Eine neu angelegte Karte gibt es im DOM erst nach dem Neuzeichnen.
  let oeffneNachRender = null;

  // Der Container muss den Fokus tragen können, sonst erreicht ihn kein
  // Tastendruck. `-1`: erreichbar per Skript, nicht in der Tabulator-Folge.
  wurzelEl.tabIndex = -1;

  // --- Zugriff auf Modell und DOM --------------------------------------------

  function modell() {
    return typeof ctx.modell === 'function' ? ctx.modell() : null;
  }

  // Befund 1 des Product Owners vom 2026-09-10 («Im Anzeige-Modus kann man
  // versuchen eine Linie zu ziehen. Klicken und Ziehen geht, nur nach dem
  // Loslassen verschwindet sie.»): Eine Handlung anzubieten, die am Ende
  // verworfen wird, ist schlimmer als sie gar nicht erst anzubieten. Die Frage
  // wird bei jeder Handlung neu gestellt und nicht gemerkt — der Anwender
  // schaltet den Modus um, während die Fläche steht.
  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function elementZu(id) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !id) return null;
    return m.elemente.find((el) => el.art === 'karte' && el.id === id) || null;
  }

  function karteZu(id) {
    if (!id) return null;
    return kartenEbene.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
  }

  function lage() {
    const l = (typeof ctx.lage === 'function' ? ctx.lage() : null) || {};
    return {
      scale: Number.isFinite(l.scale) && l.scale > 0 ? l.scale : 1,
      tx: Number.isFinite(l.tx) ? l.tx : 0,
      ty: Number.isFinite(l.ty) ? l.ty : 0,
    };
  }

  // Zeiger-Punkt in Koordinaten der Bühne.
  function buehnenPunkt(ev) {
    const rect = buehne.getBoundingClientRect ? buehne.getBoundingClientRect() : null;
    return {
      x: (ev.clientX || 0) - (rect ? rect.left : 0),
      y: (ev.clientY || 0) - (rect ? rect.top : 0),
    };
  }

  // Umkehrung der gemeinsamen Verschiebung: Bühne -> Fläche.
  function flaechenPunkt(p) {
    const l = lage();
    return { x: (p.x - l.tx) / l.scale, y: (p.y - l.ty) / l.scale };
  }

  function mitteDesAusschnitts() {
    const rect = buehne.getBoundingClientRect ? buehne.getBoundingClientRect() : null;
    return flaechenPunkt({
      x: (rect && rect.width ? rect.width : 0) / 2,
      y: (rect && rect.height ? rect.height : 0) / 2,
    });
  }

  // --- Schreiben --------------------------------------------------------------

  function schreibe() {
    const m = modell();
    const flaeche = typeof ctx.flaeche === 'function' ? ctx.flaeche() : null;
    let ok = false;
    if (m && flaeche) {
      const rumpf = serializeCanvasFence(m);
      if (typeof ctx.beiAenderung === 'function') {
        ok = ctx.beiAenderung({ flaeche, rumpf }) !== false;
      }
      // Der Abgleich der nächsten Übernahme misst gegen den Stand, auf dem die
      // Ansicht beruht. Ohne das Nachziehen verwürfe die zweite Handlung
      // innerhalb der Anzeige-Verzögerung sich selbst.
      if (ok) flaeche.rumpf = rumpf;
    }
    if (typeof ctx.neuZeichnen === 'function') ctx.neuZeichnen();
    return ok;
  }

  // --- Auswahl ----------------------------------------------------------------

  function markiere() {
    for (const el of kartenEbene.querySelectorAll('.canvas-karte')) {
      const an = !!gewaehlteKarte && el.dataset.canvasId === gewaehlteKarte;
      el.classList.toggle('canvas-karte-gewaehlt', an);
      el.setAttribute('aria-selected', String(an));
    }
  }

  // Ohne Fokus auf dem Container erreicht kein Tastendruck die Fläche; der
  // Editor ist im Canvas-Modus ausgeblendet und braucht ihn nicht. Der Griff
  // steht eigens, weil ihn seit dem Befund vom 2026-09-10 mehrere Stellen
  // brauchen: die Auswahl, das Ende einer Rohtext-Bearbeitung und der Eintritt
  // in die Ansicht. Läge der Fokus nirgends, ginge `Strg+Z` ins Leere.
  function fokussiere() {
    if (typeof wurzelEl.focus === 'function') wurzelEl.focus();
  }

  function waehle(id) {
    gewaehlteKarte = id && elementZu(id) ? id : null;
    markiere();
    if (gewaehlteKarte) fokussiere();
    // 4T-001655: Auf der Fläche ist genau **ein** Element gewählt, eine Karte
    // oder eine Verbindung. Die Bedienung der Verbindungen erfährt den Wechsel
    // hier, statt ihn an einem eigenen Klick-Weg noch einmal zu erraten.
    if (typeof ctx.beiKartenWahl === 'function') ctx.beiKartenWahl(gewaehlteKarte);
  }

  // --- Ein Element zeigen (4T-001769) -------------------------------------------

  /**
   * Rückt ein Element zentriert in den Ausschnitt; die Vergrößerung bleibt.
   *
   * **Zentriert und nicht eingepasst:** Ein Einpassen änderte den Zoom, und die
   * Wanderung durch eine Liste würde dann bei jedem Schritt die Fläche neu
   * skalieren — der Anwender verlöre den Maßstab, an dem er sich orientiert
   * (Story 4S-000948, AK9).
   *
   * Eine **Verbindung** hat keine eigene Lage (E4); gezeigt wird deshalb die
   * Hülle ihrer beiden Karten, also die Strecke, auf der sie verläuft.
   */
  function zentriereAuf(el, m) {
    if (typeof ctx.verschiebeAusschnitt !== 'function') return;
    const enden = (k) => k.art === 'karte' && (k.id === el.von || k.id === el.nach);
    const rahmen = huelle(el.art === 'linie' ? m.elemente.filter(enden) : [el]);
    if (!rahmen) return;
    const rect = buehne.getBoundingClientRect ? buehne.getBoundingClientRect() : null;
    const l = lage();
    ctx.verschiebeAusschnitt(
      (rect && rect.width ? rect.width : 0) / 2 - ((rahmen.links + rahmen.rechts) / 2) * l.scale,
      (rect && rect.height ? rect.height : 0) / 2 - ((rahmen.oben + rahmen.unten) / 2) * l.scale,
    );
  }

  /**
   * Wählt ein Element der Fläche und zeigt es — der Weg der Karten-Liste
   * zurück auf die Fläche (4T-001769).
   *
   * Der Griff steht hier und nicht bei einer der art-eigenen Bedienungen, weil
   * er für **jede** Element-Art derselbe ist — dieselbe Begründung wie bei
   * `verschiebeImStapel`. Die Auswahl selbst bleibt die eine Auswahl der Fläche
   * (V3): Das Panel führt keinen zweiten Zustand daneben.
   *
   * **Seit 4T-001770 ist dieser Griff der eine Eintritt der Liste** und trägt
   * deshalb zwei Erweiterungen: `null` als Kennung hebt jede Auswahl der Fläche
   * auf (Escape in der Liste), und `handlung` sagt, was an dem Element geschehen
   * soll, nachdem es gewählt und gezeigt ist. Ein zweiter Eintritt daneben wäre
   * ein zweiter Ort, an dem Auswahl und Handlung auseinanderlaufen können.
   *
   * @param {string|null} id Kennung des Elements; `null` hebt die Auswahl auf.
   * @param {object} [handlung] `{art: 'bearbeiten'|'loeschen'|'verbinden'}`
   *   oder `{art: 'menue', x, y}`; bei `'verbinden'` zusätzlich `nach` als
   *   Kennung der Gegenstelle. Ohne `handlung` bleibt es beim Wählen und Zeigen.
   * @returns {boolean} `false`, wenn die Fläche kein solches Element trägt oder
   *   die Handlung nicht stattgefunden hat.
   */
  function zeigeElement(id, handlung) {
    if (!id) {
      // Ohne Element gilt die Handlung der Fläche selbst (das Kontextmenü ohne
      // Element); ohne Handlung ist die Aussage «nichts ist gewählt», und die
      // läuft über denselben Weg wie der Klick auf den Hintergrund — sonst
      // bliebe eine Auswahl einer anderen Art stehen.
      if (handlung) return fuehreHandlung(null, handlung);
      waehle(null);
      if (typeof ctx.beiHintergrund === 'function') ctx.beiHintergrund();
      return true;
    }
    const m = modell();
    const el = m && Array.isArray(m.elemente) ? m.elemente.find((e) => e.id === id) : null;
    if (!el) return false;
    if (el.art === 'karte') waehle(id);
    else if (typeof ctx.waehleFremdesElement === 'function') ctx.waehleFremdesElement(el.art, id);
    zentriereAuf(el, m);
    return handlung ? fuehreHandlung(el, handlung) : true;
  }

  /**
   * Führt die benannte Handlung an einem Element aus (4T-001770).
   *
   * **Die Zuordnung Art → Griff steht nicht hier**, sondern im Kontextmenü: Es
   * führt sie für alle fünf Arten ohnehin, und eine zweite Zuordnung daneben
   * liefe bei der nächsten neuen Handlung auseinander (Entscheidung B6). Dieses
   * Modul kennt Form, Gruppe und Verbindung nicht und bekommt die Griffe
   * deshalb angemeldet (`uebernimmElementGriffe`).
   */
  function fuehreHandlung(el, handlung) {
    if (!elementGriffe) return false;
    const id = el ? el.id : null;
    if (handlung.art === 'menue') {
      return elementGriffe.oeffneMenue(id, el ? el.art : null, handlung.x, handlung.y) !== false;
    }
    // Befund 1 vom 2026-09-10: Im nicht änderbaren Dokument entsteht keine
    // schreibende Handlung. Das Menü steht davor, weil es selbst nichts
    // schreibt und seine leere Antwort dieselbe Aussage trägt.
    if (!el || !aenderbar()) return false;
    if (handlung.art === 'bearbeiten') return elementGriffe.bearbeite(id, el.art) !== false;
    if (handlung.art === 'loeschen') return elementGriffe.loesche(id, el.art) !== false;
    if (handlung.art === 'verbinden') return elementGriffe.verbinde(id, handlung.nach) !== false;
    return false;
  }

  // --- Anlegen ----------------------------------------------------------------

  function karteAnlegen(punkt) {
    const m = modell();
    if (!m || !Array.isArray(m.elemente) || !aenderbar()) return false;
    const p =
      punkt && Number.isFinite(punkt.x) && Number.isFinite(punkt.y) ? punkt : mitteDesAusschnitts();
    const el = erzeugeKarte({
      id: freieKennung(m, 'karte'),
      // Die Karte liegt mittig unter dem Klick-Punkt, nicht mit ihrer Ecke
      // darauf: Angeklickt wird die Stelle, an der sie stehen soll.
      x: p.x - KARTE_BREITE / 2,
      y: p.y - KARTE_HOEHE / 2,
      b: KARTE_BREITE,
      h: KARTE_HOEHE,
    });
    // Ganz nach vorn: Die Reihenfolge in der Fence ist die Stapel-Reihenfolge
    // (G3), und das Neue liegt oben. Wo genau, entscheidet der Kern — er kennt
    // den Platz jeder Element-Art (Story 4S-000932).
    fuegeElementEin(m, el);
    gewaehlteKarte = el.id;
    oeffneNachRender = el.id;
    return schreibe();
  }

  // --- Löschen ----------------------------------------------------------------

  function loesche(id) {
    const m = modell();
    // Die Lösch-Regel samt der Verbindungen an dieser Karte steht im Kern
    // (`entferneElement`); sie gilt für jede Element-Art dieselbe.
    if (!aenderbar() || !elementZu(id) || !entferneElement(m, id)) return false;
    gewaehlteKarte = null;
    return schreibe();
  }

  // --- Ziehen und Größe-Ändern -------------------------------------------------

  function setzeStil(karte, r) {
    karte.style.left = `${Math.round(r.x)}px`;
    karte.style.top = `${Math.round(r.y)}px`;
    karte.style.width = `${Math.round(r.b)}px`;
    karte.style.height = `${Math.round(r.h)}px`;
  }

  function beiKartenMausunten(ev) {
    if (ev.button !== 0) return;
    const ziel = ev.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // Während eine Eingabe offen ist, gehört die Maus ihr: Sonst ließe sich in
    // der Karte weder die Schreibmarke setzen noch Text markieren.
    if (bearbeitung && ziel.closest('.canvas-karte-eingabe')) return;
    // 4T-001655: Die Anschluss-Griffe liegen **in** der gewählten Karte, ziehen
    // aber eine Verbindung und nicht die Karte. Sie halten das Ereignis selbst
    // an; die Prüfung hier ist die Zusage, dass der Zug auch dann nicht
    // beginnt, wenn jemand später an der Reihenfolge der Anmeldungen dreht.
    if (ziel.closest('.canvas-anschluss')) return;
    const karte = ziel.closest('.canvas-karte');
    if (!karte) return;
    const el = elementZu(karte.dataset.canvasId);
    if (!el) return;
    ev.preventDefault();
    // Hält das Ereignis von der Bühne fern: Dort begänne sonst das Ziehen der
    // ganzen Fläche, und beides zugleich ist keine Bedienung.
    ev.stopPropagation();
    waehle(el.id);
    // Befund 1 vom 2026-09-10: Auswählen bleibt erlaubt, denn es schreibt
    // nichts; das Verschieben und das Größe-Ändern beginnen erst gar nicht.
    if (!aenderbar()) return;
    const r = kartenRechteck(el);
    zug = {
      art: ziel.closest('.canvas-karte-griff') ? 'groesse' : 'verschieben',
      karte,
      el,
      startX: ev.clientX,
      startY: ev.clientY,
      letztX: ev.clientX,
      letztY: ev.clientY,
      bewegt: 0,
      start: r,
      jetzt: { ...r },
    };
    wurzelEl.classList.add('canvas-karte-ziehend');
  }

  function beiBewegung(ev) {
    if (!zug) return;
    zug.bewegt += Math.abs(ev.clientX - zug.letztX) + Math.abs(ev.clientY - zug.letztY);
    zug.letztX = ev.clientX;
    zug.letztY = ev.clientY;
    // Gegen den Start gerechnet statt aufsummiert: Sonst summierte sich der
    // Rundungsfehler jeder Zwischenlage auf. Der Zeiger bewegt sich in
    // Bildschirm-Pixeln, die Karte in Flächen-Einheiten — daher durch `scale`.
    const l = lage();
    const dx = (ev.clientX - zug.startX) / l.scale;
    const dy = (ev.clientY - zug.startY) / l.scale;
    if (zug.art === 'verschieben') {
      zug.jetzt.x = zug.start.x + dx;
      zug.jetzt.y = zug.start.y + dy;
    } else {
      zug.jetzt.b = Math.max(MIN_BREITE, zug.start.b + dx);
      zug.jetzt.h = Math.max(MIN_HOEHE, zug.start.h + dy);
    }
    // Während des Zuges wandert allein das Element; geschrieben wird am Ende.
    setzeStil(zug.karte, zug.jetzt);
    // 4T-001655 (AK4): Die Verbindungen hängen an dieser Karte und folgen ihr
    // **während** des Zuges, nicht erst nach dem Schreiben. Gemeldet wird die
    // Live-Lage, gerechnet wird sie in der Zeichnung — geschrieben nichts.
    if (typeof ctx.beiZugLage === 'function') ctx.beiZugLage(zug.el.id, zug.jetzt);
  }

  function beiLoslassen() {
    if (!zug) return;
    const z = zug;
    zug = null;
    wurzelEl.classList.remove('canvas-karte-ziehend');
    if (z.bewegt <= KLICK_SCHWELLE) {
      // Ein Klick, kein Zug: Die Karte ist gewählt, das Dokument unberührt.
      setzeStil(z.karte, kartenRechteck(z.el));
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

  // --- Rohtext-Bearbeitung ------------------------------------------------------

  function stelleWiederHer(b) {
    // Mit der Eingabe verschwindet das fokussierte Element aus dem Baum, und
    // der Fokus fiele auf den Dokument-Rumpf zurück. Die Fläche holt ihn
    // zurück, damit die Tastatur weiter bei ihr ist (Befund vom 2026-09-10).
    fokussiere();
    if (!b.karte || !b.karte.isConnected) return;
    b.karte.classList.remove('canvas-karte-bearbeitet');
    b.karte.innerHTML = b.urspruenglich;
  }

  function oeffneBearbeitung(karte, el) {
    // Befund 1 vom 2026-09-10: keine Rohtext-Eingabe im nicht änderbaren
    // Dokument. Sie nähme Text entgegen, den beim Übernehmen niemand schreibt.
    if (!aenderbar()) return;
    if (bearbeitung) {
      if (bearbeitung.el === el) return;
      uebernimm();
      if (!karte.isConnected) return;
    }
    const eingabe = document.createElement('textarea');
    eingabe.className = 'canvas-karte-eingabe';
    // Der Rohtext, wie ihn der Parser liefert: ungeschützt und ohne Rendern.
    // Wer die Karte schreibt, schreibt Markdown und soll es auch sehen.
    eingabe.value = el.inhalt || '';
    eingabe.spellcheck = false;
    const urspruenglich = karte.innerHTML;
    karte.innerHTML = '';
    karte.appendChild(eingabe);
    karte.classList.add('canvas-karte-bearbeitet');
    bearbeitung = { karte, el, eingabe, urspruenglich, quellText: el.inhalt || '' };
    eingabe.addEventListener('keydown', beiEingabeTaste);
    // Fokus-Verlust übernimmt — aber erst im nächsten Zyklus und nur, wenn
    // dieselbe Bearbeitung noch offen ist (Muster live-table-zelle.js): Ohne
    // den Aufschub käme der blur des Fokus-Wechsels der Bearbeitung zuvor.
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
    // der Karten-Text mehrzeiliges Markdown ist.
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      ev.stopPropagation();
      uebernimm();
      return;
    }
    // Kein Tastendruck der Eingabe darf die Fläche erreichen: `Entf` löschte
    // dort die Karte, in die gerade geschrieben wird.
    ev.stopPropagation();
  }

  function brichAb() {
    if (!bearbeitung) return;
    const b = bearbeitung;
    bearbeitung = null;
    stelleWiederHer(b);
    freigabeMelden();
  }

  function uebernimm() {
    if (!bearbeitung) return false;
    const b = bearbeitung;
    bearbeitung = null;
    const neu = String(b.eingabe.value == null ? '' : b.eingabe.value);
    stelleWiederHer(b);
    if (!setzeElementInhalt(b.el, neu)) {
      // Unverändert: nur wiederherstellen. Eine leere Übernahme wäre ein
      // Rückgängig-Schritt ohne Wirkung.
      freigabeMelden();
      return false;
    }
    const ok = schreibe();
    freigabeMelden();
    return ok;
  }

  // --- Tastatur der Fläche -------------------------------------------------------

  // Rückgängig und Wiederholen in den drei geläufigen Schreibweisen: `Strg+Z`
  // und `Cmd+Z` zurück, `Strg+Y` und `Strg+Umschalt+Z` vor. Beide Vorwärts-
  // Formen, weil die eine unter Windows und die andere unter macOS die
  // gewohnte ist und die Fläche keine der beiden Erwartungen enttäuschen soll.
  function istRueckgaengigTaste(ev) {
    return (
      (ev.ctrlKey || ev.metaKey) &&
      !ev.altKey &&
      !ev.shiftKey &&
      String(ev.key).toLowerCase() === 'z'
    );
  }

  function istWiederholenTaste(ev) {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
    const taste = String(ev.key).toLowerCase();
    return taste === 'y' || (taste === 'z' && ev.shiftKey);
  }

  function beiTaste(ev) {
    // Eine offene Eingabe hat Vorrang; ihre Tasten kommen hier gar nicht an.
    // Die Prüfung bleibt trotzdem stehen: Sie ist die Zusage, dass `Strg+Z`
    // im Rohtext-Feld dessen eigenes Rückgängig bleibt und nicht die ganze
    // Karten-Handlung zurücknimmt.
    if (bearbeitung) return;
    // Vor der Auswahl-Prüfung: Rückgängig gilt der Fläche und nicht einer
    // Karte — es muss auch dann greifen, wenn gerade nichts gewählt ist.
    if (istRueckgaengigTaste(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ctx.beiRueckgaengig === 'function') ctx.beiRueckgaengig();
      return;
    }
    if (istWiederholenTaste(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ctx.beiWiederholen === 'function') ctx.beiWiederholen();
      return;
    }
    // 4T-001655: Ist keine Karte gewählt, kann eine Verbindung gewählt sein —
    // `Entf` und `Escape` richten sich nach dem gewählten Element. Der Weg
    // führt bewusst über diesen einen `keydown` der Fläche: Ein zweiter
    // Listener daneben hätte zwei Reihenfolgen, die niemand mehr überblickt.
    if (!gewaehlteKarte) {
      if (typeof ctx.beiTasteOhneKarte === 'function') ctx.beiTasteOhneKarte(ev);
      return;
    }
    if (ev.key === 'Delete') {
      ev.preventDefault();
      ev.stopPropagation();
      loesche(gewaehlteKarte);
      return;
    }
    if (ev.key === 'Escape') {
      // Nicht weiterreichen: Die Escape-Kaskade des Fensters schlösse sonst
      // zusätzlich Suchleiste oder Menü, obwohl der Nutzer die Auswahl meinte.
      ev.preventDefault();
      ev.stopPropagation();
      waehle(null);
    }
  }

  // --- Zusammenspiel mit der Ansicht ----------------------------------------------

  function freigabeMelden() {
    if (zug || bearbeitung) return;
    if (typeof ctx.beiFreigabe === 'function') ctx.beiFreigabe();
  }

  function beiBuehneMausunten(ev) {
    if (ev.button !== 0 || !istHintergrund(ev.target)) return;
    if (bearbeitung) uebernimm();
    if (gewaehlteKarte) waehle(null);
    // 4T-001655: Der Klick daneben hebt **beides** auf. Er wird immer gemeldet,
    // auch ohne gewählte Karte — sonst bliebe eine gewählte Verbindung samt
    // ihrer Leiste stehen, obwohl der Nutzer ins Leere geklickt hat.
    if (typeof ctx.beiHintergrund === 'function') ctx.beiHintergrund();
  }

  function beiBuehneDoppelklick(ev) {
    if (!istHintergrund(ev.target)) return;
    ev.preventDefault();
    karteAnlegen(flaechenPunkt(buehnenPunkt(ev)));
  }

  function beiKartenDoppelklick(ev) {
    const ziel = ev.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    const karte = ziel.closest('.canvas-karte');
    if (!karte) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = elementZu(karte.dataset.canvasId);
    if (!el) return;
    waehle(el.id);
    // 4T-001747 (Entscheidung F3 des Product Owners vom 2026-09-12): Auf dem
    // Körper einer Verweis-Karte öffnet der Doppelklick das Ziel. Der Körper
    // zeigt fremden Inhalt und ist nicht änderbar — die Rohtext-Eingabe hätte
    // dort keinen Gegenstand. Auf der Kopfzeile bleibt es beim Bearbeiten der
    // Beschriftung, und die Prüfung steht **vor** der Änderbarkeit: Öffnen
    // fasst das Dokument nicht an und bleibt im Anzeige-Modus erlaubt.
    // 4T-001748: Für die Bild-Karte gilt dasselbe — der Körper zeigt dort ein
    // Bild, und der Doppelklick öffnet die Anlage.
    if ((el.doc || el.bild) && ziel.closest('.canvas-karte-koerper')) {
      if (typeof ctx.beiVerweisKoerper === 'function') ctx.beiVerweisKoerper(el.id);
      return;
    }
    oeffneBearbeitung(karte, el);
  }

  kartenEbene.addEventListener('mousedown', beiKartenMausunten);
  kartenEbene.addEventListener('dblclick', beiKartenDoppelklick);
  buehne.addEventListener('mousedown', beiBuehneMausunten);
  buehne.addEventListener('dblclick', beiBuehneDoppelklick);
  wurzelEl.addEventListener('keydown', beiTaste);
  // Fenster-weit, weil ein Zug über den Rand der Bühne hinausgeht; abgemeldet
  // in destroy(), sonst überlebte jede geschlossene Ansicht als Leck.
  window.addEventListener('mousemove', beiBewegung);
  window.addEventListener('mouseup', beiLoslassen);

  return {
    /** Läuft gerade eine Handlung, die eine Neu-Übergabe zerstören würde? */
    blockiert() {
      return !!zug || !!bearbeitung;
    },
    /** Kennung der gewählten Karte, oder `null`. */
    gewaehlteKennung() {
      return gewaehlteKarte;
    },
    /**
     * Ist das Dokument der Fläche änderbar (Befund 1 vom 2026-09-10)?
     *
     * Der Griff steht für das Kontextmenü: Es bietet im Anzeige-Modus nichts
     * an und erscheint dann gar nicht. Die Frage einmal hier zu beantworten
     * hält sie an einer Stelle statt in jedem Bedienort neu.
     */
    istAenderbar: aenderbar,
    /** Legt eine Karte an; ohne Punkt in der Mitte des sichtbaren Ausschnitts. */
    karteAnlegen,
    /** Wählt ein Element und rückt es zentriert in den Ausschnitt (4T-001769). */
    zeigeElement,
    /**
     * Nimmt die Griffe der übrigen Element-Arten entgegen (4T-001770).
     *
     * Angemeldet vom Kontextmenü, weil dort die Zuordnung Art → Griff ohnehin
     * steht; dieses Modul ist der eine Eintritt der Karten-Liste und reicht sie
     * nur weiter. Fehlt die Anmeldung, bleibt es beim Wählen und Zeigen — der
     * Stand der reinen Zeichnungs-Prüffälle.
     *
     * @param {object|null} griffe `{bearbeite, loesche, verbinde, oeffneMenue}`.
     */
    uebernimmElementGriffe(griffe) {
      elementGriffe = griffe && typeof griffe === 'object' ? griffe : null;
    },
    /** Holt den Tastatur-Fokus auf die Fläche (Eintritt in die Ansicht). */
    fokussiere,
    // --- Griffe für einen zweiten Bedienort (4T-001683) ------------------------
    // Das Kontextmenü liegt in einem eigenen Modul und ruft dieselben
    // Handlungen wie Doppelklick und Tastatur. Es bekommt sie hier als
    // benannte Griffe statt sie nachzubauen: Ein zweiter Weg in dieselbe
    // Wirkung wäre ein zweiter Ort, an dem sie auseinanderlaufen kann.
    /** Kennung der Karte unter einem Ereignis-Ziel, oder `null`. */
    kennungAn(ziel) {
      if (!ziel || typeof ziel.closest !== 'function') return null;
      const karte = ziel.closest('.canvas-karte');
      return karte && karte.dataset.canvasId ? karte.dataset.canvasId : null;
    },
    /** Punkt eines Maus-Ereignisses in Koordinaten der Fläche. */
    flaechenPunktAus(ev) {
      return flaechenPunkt(buehnenPunkt(ev));
    },
    // --- Griffe für die Bedienung der Formen (4T-001701) -----------------------
    // Dieselbe Begründung wie beim Kontextmenü: Die Formen-Bedienung rechnet
    // gegen **dieselbe** gemeinsame Verschiebung und legt an **derselben**
    // Stelle an; eine zweite Umrechnung daneben liefe bei der nächsten
    // Änderung an Zoom oder Ausschnitt auseinander.
    /** Mitte des sichtbaren Ausschnitts in Koordinaten der Fläche. */
    mitteDesAusschnitts,
    /** Vergrößerung der Fläche — Bildschirm-Pixel je Flächen-Einheit. */
    flaechenMassstab() {
      return lage().scale;
    },
    /**
     * Verschiebt ein Element im Stapel (Story 4S-000932).
     *
     * Der Griff steht hier und nicht bei den Formen, weil er für **jede**
     * Element-Art derselbe ist — Karte, Form und ab 4T-001702 Gruppe — und
     * weil der Schreibweg hier liegt. Die Regel selbst steht im Kern; dieses
     * Modul setzt sie nur in eine Transaktion um.
     *
     * @param {string} id Kennung des Elements.
     * @param {string} befehl einer aus `STAPEL_BEFEHLE`.
     * @returns {boolean} `true`, wenn geschrieben wurde.
     */
    verschiebeImStapel(id, befehl) {
      if (!aenderbar() || !verschiebeElementImStapel(modell(), id, befehl)) return false;
      return schreibe();
    },
    /**
     * Schreibt das Modell in das Dokument und zeichnet neu (4T-001655).
     *
     * Der Griff steht für die Bedienung der Verbindungen: Sie ändert andere
     * Elemente, aber auf demselben Weg — Modell ändern, serialisieren,
     * übernehmen, neu zeichnen. Ein eigener Schreibweg daneben wäre ein
     * zweiter Ort für den Abgleich mit dem Dokument-Stand.
     */
    schreibe,
    /** Wählt eine Karte (oder hebt die Wahl mit `null` auf). */
    waehleKarte: waehle,
    /** Öffnet die Rohtext-Eingabe einer Karte, wie es der Doppelklick tut. */
    bearbeiteKarte(id) {
      const karte = karteZu(id);
      const el = elementZu(id);
      if (!karte || !el || !aenderbar()) return false;
      waehle(id);
      oeffneBearbeitung(karte, el);
      return true;
    },
    /** Löscht eine Karte samt ihrer Verbindungen, wie es `Entf` tut. */
    loescheKarte: loesche,
    /** Übernimmt eine offene Rohtext-Eingabe, falls eine offen ist. */
    beendeBearbeitung() {
      return uebernimm();
    },
    /** Nach jeder Zeichnung: Auswahl wieder anlegen, wartende Eingabe öffnen. */
    nachRender() {
      if (gewaehlteKarte && !elementZu(gewaehlteKarte)) gewaehlteKarte = null;
      markiere();
      const zuOeffnen = oeffneNachRender;
      oeffneNachRender = null;
      if (!zuOeffnen) return;
      const karte = karteZu(zuOeffnen);
      const el = elementZu(zuOeffnen);
      if (karte && el) oeffneBearbeitung(karte, el);
    },
    /** Beim Flächen-Wechsel: Auswahl und offene Eingabe fallen lassen. */
    zuruecksetzen() {
      if (bearbeitung) brichAb();
      gewaehlteKarte = null;
      oeffneNachRender = null;
    },
    destroy() {
      window.removeEventListener('mousemove', beiBewegung);
      window.removeEventListener('mouseup', beiLoslassen);
      kartenEbene.removeEventListener('mousedown', beiKartenMausunten);
      kartenEbene.removeEventListener('dblclick', beiKartenDoppelklick);
      buehne.removeEventListener('mousedown', beiBuehneMausunten);
      buehne.removeEventListener('dblclick', beiBuehneDoppelklick);
      wurzelEl.removeEventListener('keydown', beiTaste);
    },
  };
}
