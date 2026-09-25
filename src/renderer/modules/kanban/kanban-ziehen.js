// 4T-001850 (Epic 3E-000110): Karten und Spalten der Tafel mit der Maus
// verschieben — samt Einfüge-Marke, Rand-Rollen und dem Abhaken beim
// Hineinziehen in eine Spalte, die abhakt.
//
// **Warum die Maus-Ereignisse und nicht die Zieh-Ereignisse des Browsers**
// (Entscheidung dieses Vorgangs, Begründung im Lösungs-Kapitel): Die
// Einfüge-Position wird aus dem Zeiger-Punkt gegen die Rechtecke gerechnet und
// ist damit voll in der Hand der Anwendung; das Rollen am Rand ist ein eigener,
// prüfbarer Takt; und beides lässt sich ohne ein `DataTransfer`-Objekt
// auslösen. Es ist zugleich der Weg der räumlichen Arbeitsfläche
// (`canvas-bedienung.js`): `mousedown` am Element, `mousemove` und `mouseup` am
// Fenster, dazu eine Schwelle, unterhalb derer ein Zug ein Klick bleibt.
//
// **Die Rechnung selbst steht nicht hier**, sondern prozessneutral in
// `src/shared/zieh-geometrie.js` — sie ist von der Tafel unabhängig und für
// sich geprüft. Dieses Modul ist ihr erster Verbraucher und trägt allein, was
// mit dem DOM und mit der Tafel zu tun hat.
//
// **Der Schreibweg ist der gemeinsame der Ausbaustufe**, `wendeAn` der
// Karten-Bedienung: eine Text-Operation, eine Übernahme, ein
// Rückgängig-Schritt. Verschieben **und** Abhaken zusammen bleiben ein Schritt,
// weil beide Änderungen nacheinander auf dem Text laufen und erst das Ergebnis
// geschrieben wird (AK8). Seit 4T-001896 gilt derselbe Satz für einen dritten
// Schritt, das Versetzen der Folge-Instanz einer Wiederholung in die
// Quell-Spalte.
//
// **Abhängigkeits-frei wie die Nachbarn** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n`. Der Schreibweg, die Änderbarkeit, das
// Modell und die Status-Kette kommen als Rückrufe herein.
'use strict';

import { leseTafel } from '../../../shared/kanban/kanban-core.js';
import { verschiebeKarte, verschiebeSpalte } from '../../../shared/kanban/kanban-operationen.js';
import {
  einfuegePosition,
  imRechteck,
  markenRechteck,
  randRollSchritt,
  ueberSchwelle,
} from '../../../shared/zieh-geometrie.js';
import { KARTE_KLASSE, SPALTE_KLASSE } from './kanban-tafel.js';

// Klassen-Namen an einer Stelle, wie in der Zeichnung nebenan.
export const MARKE_KLASSE = 'kanban-einfuege-marke';
export const ZIEHT_KLASSE = 'kanban-zieht';
export const QUELLE_KLASSE = 'kanban-zieht-quelle';

// Takt des Rand-Rollens in Millisekunden. Rund 60 Schritte je Sekunde, wie ein
// Bildaufbau; der Schritt selbst kommt aus der Geometrie.
const ROLL_TAKT_MS = 16;

function zahlAn(el, feld) {
  const wert = Number(el && el.dataset ? el.dataset[feld] : NaN);
  return Number.isFinite(wert) ? wert : null;
}

function rechteckVon(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// Nur die Waagerechte entscheidet, über welcher Spalte der Zeiger steht: Eine
// Spalte füllt den Streifen der Höhe nach, und ein Zeiger unter der letzten
// Karte meint erkennbar weiterhin diese Spalte.
function inSpaltenBreite(punkt, rechteck) {
  return imRechteck(punkt, rechteck, { achse: 'x' });
}

/**
 * Wohin eine Spalten-Nummer wandert, wenn eine Spalte umzieht.
 *
 * Gebraucht für die Auswahl: Eine gewählte Karte soll nach dem Spalten-Zug
 * dieselbe Karte sein und nicht die, die zufällig an ihre Stelle gerutscht ist.
 */
export function spaltenNummerNachZug(nummer, von, nach) {
  if (nummer === von) return nach;
  if (von < nummer && nummer <= nach) return nummer - 1;
  if (nach <= nummer && nummer < von) return nummer + 1;
  return nummer;
}

/**
 * Karten-Index der beim Abhaken erzeugten Folge-Instanz in der Ziel-Spalte.
 *
 * **Erkannt wird sie am Bestand des Textes, nicht an der Einstellung** «Instanz
 * oberhalb / unterhalb der abgeschlossenen Zeile» (4T-001896, AK4): Nach dem
 * Statuswechsel führt die Ziel-Spalte genau eine Karte mehr als vorher, die
 * beiden fraglichen stehen unmittelbar nebeneinander, und die **nicht**
 * abgehakte von ihnen ist die neue Instanz. Die Status-Kette schreibt der
 * Instanz immer ein leeres Kästchen und der abgeschlossenen Zeile immer ein
 * gefülltes; die Unterscheidung trägt damit für beide Werte der Einstellung.
 *
 * @param {object|null} spalte Ziel-Spalte aus `leseTafel` **nach** dem Wechsel.
 * @param {number} neuerIndex Karten-Index der gezogenen Karte nach dem Verschieben.
 * @param {number} kartenVorher Karten-Zahl der Ziel-Spalte **vor** dem Wechsel.
 * @returns {number|null} `null`, wenn keine Zeile hinzugekommen ist.
 */
function instanzIndexIn(spalte, neuerIndex, kartenVorher) {
  if (!spalte || spalte.karten.length !== kartenVorher + 1) return null;
  for (const i of [neuerIndex, neuerIndex + 1]) {
    const karte = spalte.karten[i];
    if (karte && !karte.abgehakt) return i;
  }
  return null;
}

/**
 * Versetzt die Folge-Instanz in die Quell-Spalte an den alten Index der Karte.
 *
 * **Warum dorthin** (Entscheidung des Product Owners vom 2026-09-22,
 * 4T-001896): Eine offene Aufgabe in der Erledigt-Spalte ist genau der
 * Widerspruch zwischen Tafel und Aufgaben-Abfragen, den die Spalte, die abhakt,
 * verhindern soll. Dort, wo die Karte herkam, war die Arbeit zuletzt offen, und
 * dort erwartet der Anwender sie wieder.
 *
 * Umgehängt wird über denselben Format-Kern-Weg wie der Zug selbst; kommt keine
 * Zeile hinzu — keine Wiederholung oder kein Abschluss —, bleibt der Text, wie
 * er ist. Der Fall «Quell-Spalte gleich Ziel-Spalte» braucht keinen Sonderweg:
 * Die Instanz bleibt dann in dieser Spalte und wandert an den alten Index.
 *
 * @param {string} text Text nach dem Statuswechsel.
 * @param {object} angaben Angaben des Zuges (`spalte`, `karte`, `zielSpalte`, `neuerIndex`).
 * @param {number} kartenVorher Karten-Zahl der Ziel-Spalte vor dem Wechsel.
 * @returns {string} Der versetzte Text, sonst der unveränderte.
 */
function instanzInQuellSpalte(text, angaben, kartenVorher) {
  const modell = leseTafel(text);
  const index = instanzIndexIn(
    modell.spalten[angaben.zielSpalte],
    angaben.neuerIndex,
    kartenVorher,
  );
  if (index === null) return text;
  // `position` des Format-Kerns heisst «vor die Karte an dieser Stelle» und
  // zählt die bewegte Karte mit. Liegt sie in derselben Spalte **vor** dem
  // Ziel-Index, rutscht alles dahinter um eins nach vorn; die Stelle muss
  // deshalb um eins erhöht werden, damit der **alte Index** herauskommt. Es ist
  // dieselbe Umrechnung, die `legeKarteAb` für den Zug selbst führt, nur in die
  // andere Richtung.
  const gleicheSpalte = angaben.zielSpalte === angaben.spalte;
  const position = gleicheSpalte && angaben.karte >= index ? angaben.karte + 1 : angaben.karte;
  const versetzt = verschiebeKarte(text, {
    spalte: angaben.zielSpalte,
    karte: index,
    zielSpalte: angaben.spalte,
    position,
  });
  return versetzt.ok ? versetzt.text : text;
}

/**
 * Verdrahtet das Verschieben per Maus mit einer gezeichneten Tafel.
 *
 * @param {object} ctx
 * @param {HTMLElement} ctx.container Container der Ansicht; er überlebt jede
 *   Zeichnung und trägt deshalb die Zuhörer.
 * @param {Function} ctx.modell () => Modell aus `leseTafel` des gezeichneten Textes.
 * @param {Function} [ctx.aenderbar] () => boolean (AK11). Fehlt der Rückruf,
 *   gilt änderbar; der Schreibweg ist eigens gesichert.
 * @param {Function} ctx.wendeAn (operation, angaben) => boolean. Der gemeinsame
 *   Schreibweg der Ausbaustufe aus der Karten-Bedienung.
 * @param {Function} [ctx.blockiert] () => boolean, läuft eine andere Handlung?
 * @param {Function} [ctx.waehleNachZeichnung] ({spalte, karte}) => void.
 * @param {Function} [ctx.statusAufText] (text, zeilenNummer) => {text}|null.
 *   Der Statuswechsel der Anwendung als Text-Rechnung — dieselbe Kette samt
 *   Automatik-Daten und Wiederholung. Fehlt der Rückruf, wird verschoben und
 *   nicht abgehakt; das ist der Stand der reinen Zieh-Prüffälle.
 * @returns {object} Steuerung für die Einbettung.
 */
export function createZiehBedienung(ctx) {
  const container = ctx.container;
  // Vorgemerkter oder laufender Zug. `gestartet` trennt beides: Bis zur
  // Schwelle ist es ein Klick, und ein Klick darf nichts anfassen.
  let zug = null;
  // Ein Zug endet mit einem `click` auf dem Element, über dem losgelassen
  // wurde. Ohne diese Sperre schaltete ein Zug, der auf einem Kästchen endet,
  // zusätzlich den Status.
  let klickSperren = false;
  let marke = null;
  let rollTakt = null;

  function aenderbar() {
    return typeof ctx.aenderbar !== 'function' || ctx.aenderbar() !== false;
  }

  function modell() {
    const m = typeof ctx.modell === 'function' ? ctx.modell() : null;
    return m && Array.isArray(m.spalten) ? m : null;
  }

  function spaltenElemente() {
    return [...container.querySelectorAll(`.${SPALTE_KLASSE}`)];
  }

  function kartenElemente(spalteEl) {
    return spalteEl ? [...spalteEl.querySelectorAll(`.${KARTE_KLASSE}`)] : [];
  }

  // --- Einfüge-Marke ---------------------------------------------------------------

  // Die Marke liegt im Bezugssystem des Sichtfensters (`position: fixed`) und
  // braucht deshalb keine Umrechnung gegen Roll-Stände und Container-Ränder —
  // dieselben Koordinaten, in denen auch gerechnet wird. Sie ist reine Anzeige
  // und für Vorlese-Programme unsichtbar.
  function zeigeMarke(rechteck) {
    if (!rechteck) {
      versteckeMarke();
      return;
    }
    if (!marke) {
      marke = document.createElement('div');
      marke.className = MARKE_KLASSE;
      marke.setAttribute('aria-hidden', 'true');
      container.appendChild(marke);
    }
    marke.style.left = `${Math.round(rechteck.x)}px`;
    marke.style.top = `${Math.round(rechteck.y)}px`;
    marke.style.width = `${Math.max(2, Math.round(rechteck.breite))}px`;
    marke.style.height = `${Math.max(2, Math.round(rechteck.hoehe))}px`;
  }

  function versteckeMarke() {
    if (!marke) return;
    marke.remove();
    marke = null;
  }

  // --- Das Ziel unter dem Zeiger ------------------------------------------------------

  /**
   * Ziel-Spalte und Einfüge-Position für den laufenden Zug.
   *
   * @returns {{spalte: number, position: number, marke: object|null}|null}
   *   `null`, wenn der Zeiger über keiner gültigen Stelle steht.
   */
  function zielUnter(punkt) {
    const spalten = spaltenElemente();
    if (spalten.length === 0) return null;
    if (zug.art === 'spalte') {
      const rechtecke = spalten.map(rechteckVon);
      const position = einfuegePosition(punkt, rechtecke, { achse: 'x' });
      return { spalte: null, position, marke: markenRechteck(rechtecke, position, { achse: 'x' }) };
    }
    const treffer = spalten.find((el) => inSpaltenBreite(punkt, rechteckVon(el)));
    if (!treffer) return null;
    const spalte = zahlAn(treffer, 'spalte');
    if (spalte === null) return null;
    const karten = kartenElemente(treffer);
    const rechtecke = karten.map(rechteckVon);
    const position = einfuegePosition(punkt, rechtecke, { achse: 'y' });
    const liste = treffer.querySelector('.kanban-spalte-karten');
    return {
      spalte,
      position,
      marke: markenRechteck(rechtecke, position, {
        achse: 'y',
        leerRechteck: liste ? rechteckVon(liste) : null,
      }),
    };
  }

  // --- Rand-Rollen -------------------------------------------------------------------

  /**
   * Ein Takt des Rand-Rollens.
   *
   * Der Griff steht eigens, weil sein Auslöser ein Intervall ist: So lässt sich
   * der Takt prüfen, ohne die Uhr der Prüf-Umgebung zu stellen. Gerollt wird
   * waagerecht der Spalten-Streifen und senkrecht die Karten-Liste unter dem
   * Zeiger — verschachtelte Roll-Flächen bekommen jede ihren eigenen Takt.
   *
   * @returns {boolean} `true`, wenn tatsächlich gerollt wurde.
   */
  function rolleAmRand() {
    if (!zug || !zug.gestartet) return false;
    const punkt = { x: zug.letztX, y: zug.letztY };
    let gerollt = false;
    const streifen = container.querySelector('.kanban-spalten');
    if (streifen) {
      const { dx } = randRollSchritt(punkt, rechteckVon(streifen), { achse: 'x' });
      if (dx !== 0) {
        streifen.scrollLeft += dx;
        gerollt = true;
      }
    }
    if (zug.art === 'karte') {
      const spalte = spaltenElemente().find((el) => inSpaltenBreite(punkt, rechteckVon(el)));
      const liste = spalte ? spalte.querySelector('.kanban-spalte-karten') : null;
      if (liste) {
        const { dy } = randRollSchritt(punkt, rechteckVon(liste), { achse: 'y' });
        if (dy !== 0) {
          liste.scrollTop += dy;
          gerollt = true;
        }
      }
    }
    if (gerollt) aktualisiere();
    return gerollt;
  }

  // --- Der Zug selbst -------------------------------------------------------------------

  function beiMausUnten(ereignis) {
    if (ereignis.button !== 0 || zug) return;
    const ziel = ereignis.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    // AK11: Im nicht änderbaren Dokument beginnt gar kein Zug. Eine Handlung
    // anzubieten, die am Ende verworfen wird, ist schlimmer als sie nicht
    // anzubieten (Befund des Product Owners vom 2026-09-10).
    if (!aenderbar()) return;
    // Während eine Eingabe offen ist, gehört die Maus ihr: Sonst liesse sich in
    // der Karte weder die Schreibmarke setzen noch Text markieren.
    if (typeof ctx.blockiert === 'function' && ctx.blockiert()) return;
    const kopf = ziel.closest('.kanban-spalte-kopf');
    const spalteEl = ziel.closest(`.${SPALTE_KLASSE}`);
    const karteEl = kopf ? null : ziel.closest(`.${KARTE_KLASSE}`);
    // Die Spalte wird an ihrem Kopf gezogen, die Karte an der Karte. Ein Zug am
    // Spalten-Hintergrund gäbe es nicht zu greifen: Dort beginnt nichts.
    if (kopf && spalteEl) {
      const nummer = zahlAn(spalteEl, 'spalte');
      if (nummer === null) return;
      zug = neuerZug('spalte', ereignis, { spalte: nummer, el: spalteEl });
      return;
    }
    if (!karteEl) return;
    const spalte = zahlAn(karteEl, 'spalte');
    const karte = zahlAn(karteEl, 'karte');
    if (spalte === null || karte === null) return;
    zug = neuerZug('karte', ereignis, { spalte, karte, el: karteEl });
  }

  function neuerZug(art, ereignis, daten) {
    return {
      art,
      ...daten,
      startX: ereignis.clientX,
      startY: ereignis.clientY,
      letztX: ereignis.clientX,
      letztY: ereignis.clientY,
      bewegt: 0,
      gestartet: false,
      ziel: null,
    };
  }

  function starte() {
    zug.gestartet = true;
    container.classList.add(ZIEHT_KLASSE);
    if (zug.el) zug.el.classList.add(QUELLE_KLASSE);
    // Der Takt läuft, auch wenn die Maus stillsteht: Wer am Rand hält, will
    // weiterrollen, und ohne Intervall bewegte sich nichts mehr.
    rollTakt = setInterval(rolleAmRand, ROLL_TAKT_MS);
  }

  function aktualisiere() {
    if (!zug || !zug.gestartet) return;
    const ziel = zielUnter({ x: zug.letztX, y: zug.letztY });
    zug.ziel = ziel;
    zeigeMarke(ziel ? ziel.marke : null);
  }

  function beiBewegung(ereignis) {
    if (!zug) return;
    zug.bewegt += Math.abs(ereignis.clientX - zug.letztX) + Math.abs(ereignis.clientY - zug.letztY);
    zug.letztX = ereignis.clientX;
    zug.letztY = ereignis.clientY;
    if (!zug.gestartet) {
      if (!ueberSchwelle(zug.bewegt)) return;
      starte();
    }
    // Erst ab hier: Ein Klick ohne Bewegung soll die Textauswahl und den
    // Fokus-Weg des Browsers unangetastet lassen.
    if (typeof ereignis.preventDefault === 'function') ereignis.preventDefault();
    aktualisiere();
  }

  function raeumeAuf() {
    if (rollTakt != null) {
      clearInterval(rollTakt);
      rollTakt = null;
    }
    container.classList.remove(ZIEHT_KLASSE);
    if (zug && zug.el) zug.el.classList.remove(QUELLE_KLASSE);
    versteckeMarke();
    zug = null;
  }

  /** Bricht einen laufenden Zug ab; das Dokument bleibt unberührt (AK5). */
  function brichAb() {
    if (!zug) return false;
    const lief = zug.gestartet;
    raeumeAuf();
    klickSperren = lief;
    return lief;
  }

  function beiLoslassen() {
    if (!zug) return;
    if (!zug.gestartet) {
      // Ein Klick, kein Zug: Auswählen, Doppelklick und der Klick auf das
      // Kästchen laufen unverändert weiter.
      raeumeAuf();
      return;
    }
    const z = zug;
    const ziel = z.ziel;
    raeumeAuf();
    // Der `click`, der auf jeden `mouseup` folgt, gehört nicht mehr zur
    // Bedienung: Der Anwender hat gezogen und nicht geklickt.
    klickSperren = true;
    // Loslassen über keiner gültigen Stelle lässt alles, wie es war (AK5).
    if (!ziel) return;
    if (z.art === 'spalte') legeSpalteAb(z, ziel.position);
    else legeKarteAb(z, ziel.spalte, ziel.position);
  }

  // --- Ablegen ---------------------------------------------------------------------------

  /**
   * Soll die Karte beim Ablegen abgehakt oder die Abhakung zurückgenommen werden?
   *
   * **Abhaken** beim Hineinziehen in eine Spalte, die abhakt — aber nur, wenn
   * die Karte noch nicht abgehakt ist; sonst nähme die Status-Kette die
   * Abhakung gerade zurück. **Zurücknehmen** nur beim Heraus­ziehen aus einer
   * solchen Spalte in eine, die nicht abhakt: Eine abgehakte Karte, die
   * zwischen zwei gewöhnlichen Spalten umsortiert wird, behält ihren Status
   * (Story 4S-000976, AK6).
   */
  function brauchtStatusWechsel(quelle, ziel, karte) {
    if (!quelle || !ziel || !karte) return false;
    if (ziel.erledigt) return !karte.abgehakt;
    return quelle.erledigt === true && karte.abgehakt === true;
  }

  /**
   * Verschieben, Statuswechsel und das Versetzen der Folge-Instanz als **eine**
   * Text-Rechnung (AK8 aus 4T-001850, AK3 aus 4T-001896).
   *
   * Alle Änderungen laufen nacheinander auf dem Text; geschrieben wird erst
   * das Ergebnis, und damit ist der ganze Vorgang ein Rückgängig-Schritt. Der
   * Statuswechsel geht über die Status-Kette der Anwendung und nicht über den
   * Format-Kern: Automatik-Daten und Wiederholung hängen dort, und eine zweite
   * Status-Logik entsteht nicht (Story 4S-000976, AK5).
   */
  function karteUmhaengen(text, angaben) {
    const ergebnis = verschiebeKarte(text, {
      spalte: angaben.spalte,
      karte: angaben.karte,
      zielSpalte: angaben.zielSpalte,
      position: angaben.position,
    });
    if (!ergebnis.ok || !angaben.statusWechsel) return ergebnis;
    // Die Zeilen-Nummer der Karte **nach** dem Verschieben wird am neuen Text
    // abgelesen statt gerechnet: Der Format-Kern ist die eine Auskunft darüber,
    // wo eine Karte im Dokument steht.
    const neu = leseTafel(ergebnis.text);
    const spalte = neu.spalten[angaben.zielSpalte];
    const karte = spalte ? spalte.karten[angaben.neuerIndex] : null;
    if (!karte) return ergebnis;
    const kartenVorher = spalte.karten.length;
    const gewechselt = angaben.statusAufText(ergebnis.text, karte.zeile + 1);
    if (!gewechselt || typeof gewechselt.text !== 'string') return ergebnis;
    return { ok: true, text: instanzInQuellSpalte(gewechselt.text, angaben, kartenVorher) };
  }

  function legeKarteAb(z, zielSpalte, position) {
    const m = modell();
    if (!m) return false;
    const quelle = m.spalten[z.spalte];
    const ziel = m.spalten[zielSpalte];
    if (!quelle || !ziel) return false;
    const karte = quelle.karten[z.karte];
    if (!karte) return false;
    // Ziel gleich Ausgang: kein Schreibvorgang. Beide Nachbar-Stellen der
    // eigenen Karte meinen ihren eigenen Platz.
    if (zielSpalte === z.spalte && (position === z.karte || position === z.karte + 1)) return false;
    const neuerIndex = zielSpalte === z.spalte && position > z.karte ? position - 1 : position;
    const statusWechsel =
      typeof ctx.statusAufText === 'function' && brauchtStatusWechsel(quelle, ziel, karte);
    if (typeof ctx.waehleNachZeichnung === 'function') {
      ctx.waehleNachZeichnung({ spalte: zielSpalte, karte: neuerIndex });
    }
    return ctx.wendeAn(karteUmhaengen, {
      spalte: z.spalte,
      karte: z.karte,
      zielSpalte,
      position,
      neuerIndex,
      statusWechsel,
      statusAufText: ctx.statusAufText,
    });
  }

  function legeSpalteAb(z, position) {
    const m = modell();
    if (!m || !m.spalten[z.spalte]) return false;
    if (position === z.spalte || position === z.spalte + 1) return false;
    const nach = position > z.spalte ? position - 1 : position;
    // Die gewählte Karte soll nach dem Zug dieselbe Karte sein und nicht die,
    // die an ihre Stelle gerutscht ist: Ihre Spalten-Nummer wandert mit.
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    const spalteVon = zahlAn(gewaehlt, 'spalte');
    const karteVon = zahlAn(gewaehlt, 'karte');
    if (spalteVon !== null && karteVon !== null && typeof ctx.waehleNachZeichnung === 'function') {
      ctx.waehleNachZeichnung({
        spalte: spaltenNummerNachZug(spalteVon, z.spalte, nach),
        karte: karteVon,
      });
    }
    return ctx.wendeAn(verschiebeSpalte, { spalte: z.spalte, position });
  }

  // --- Tastatur und Fenster ---------------------------------------------------------------

  function beiTaste(ereignis) {
    if (!zug || !zug.gestartet || ereignis.key !== 'Escape') return;
    // Nicht weiterreichen: Die Escape-Kaskade des Fensters hübe sonst
    // zusätzlich die Auswahl auf, obwohl der Nutzer den Zug gemeint hat.
    ereignis.preventDefault();
    ereignis.stopPropagation();
    brichAb();
  }

  function beiKlick(ereignis) {
    if (!klickSperren) return;
    klickSperren = false;
    ereignis.preventDefault();
    ereignis.stopPropagation();
  }

  container.addEventListener('mousedown', beiMausUnten);
  // In der Erfassungs-Runde, damit die Sperre vor den Klick-Wegen der
  // Karten-Bedienung greift.
  container.addEventListener('click', beiKlick, true);
  // Fenster-weit, weil ein Zug über den Rand der Tafel hinausgeht; abgemeldet
  // in `destroy()`, sonst überlebte jede geschlossene Ansicht als Leck.
  window.addEventListener('mousemove', beiBewegung);
  window.addEventListener('mouseup', beiLoslassen);
  window.addEventListener('keydown', beiTaste, true);
  // Der Verlust der Zeiger-Bindung — ein Fenster-Wechsel mitten im Zug —
  // bricht ab, statt einen Zug ohne Maus weiterlaufen zu lassen.
  window.addEventListener('blur', brichAb);

  return {
    /** Läuft gerade ein Zug, den eine Neu-Zeichnung zerstören würde? */
    blockiert() {
      return !!zug && zug.gestartet;
    },
    /** Ein Takt des Rand-Rollens; der Auslöser im Programm ist ein Intervall. */
    rolleAmRand,
    /** Bricht einen laufenden Zug ab (Escape, Fenster-Wechsel). */
    brichAb,
    destroy() {
      raeumeAuf();
      container.removeEventListener('mousedown', beiMausUnten);
      container.removeEventListener('click', beiKlick, true);
      window.removeEventListener('mousemove', beiBewegung);
      window.removeEventListener('mouseup', beiLoslassen);
      window.removeEventListener('keydown', beiTaste, true);
      window.removeEventListener('blur', brichAb);
    },
  };
}
