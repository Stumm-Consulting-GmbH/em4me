// 4T-002250 (Epic 3E-000262, F4 A, S3, S4, S5): Zeilen ändern in der
// Listen-Maske — Sperre, frischer Stand, Feld-Elemente in den Zellen, ein
// Auftrag je Zeile und die Abweisung an der Zelle.
//
// **Die Zeile ist eine Einheit** (F4 A, S3): Sie wird als Ganzes bearbeitet und
// als **ein** Auftrag der Schreib-Schnittstelle gespeichert. Am Beginn wird die
// Sperre genommen und danach der Datensatz frisch gelesen
// (`database:datensatz`), denn die Ergebnismenge trägt keinen gelesenen Stand;
// `erwartet` des Auftrags stammt aus diesem Lesen. Ohne das überschriebe eine
// Zeile fremde Änderungen, ohne dass ein Fehler erschiene. Die Reihenfolge ist
// die der Einzel-Maske (`masken-seite.js`: `bearbeiten`, `beginneBearbeiten`,
// `verwerfen`, `gelungen`, `neuLaden`), je Zeile mit einem eigenen
// Zustands-Objekt, auf dem der Sperr-Ablauf (`masken-sperre.js`) arbeitet.
//
// **Die Zellen sind die Feld-Elemente der Maske** (S4, `masken-felder.js`),
// samt Wertehilfe eines Verweis-Feldes (`masken-verweise.js`). Bearbeitbar sind
// allein die Zellen, deren Spalte genau ein Feld nennt (`data-db-list-field`,
// S2); gerechnete Spalten bleiben Text. Das Zeichnen der Zellen steht seit
// 4T-002251 in `listen-zellen.js`.
//
// **Bedienung:** «Bearbeiten» in der Aktions-Zelle oder ein Doppelklick in eine
// bearbeitbare Zelle beginnt; «Speichern» oder die Eingabetaste speichert;
// «Abbrechen» oder Escape verwirft. Ein Fokus-Verlust speichert nicht. Tab
// führt in der Reihenfolge der Zellen weiter (Verhalten des Browsers). Eine
// Zeile je Liste ist zugleich in Bearbeitung; solange, sind Blättern und
// «Bearbeiten» der übrigen Zeilen gesperrt (S5, Naht `blaetternSperren`).
//
// **Der Klick der Zeile öffnet die Maske** (4T-002249, zentrale Klick-Handler
// in Lese- und Live-Ansicht). Eine bearbeitbare Zelle einer änderbaren Zeile
// ist dagegen das Ziel des Doppelklicks: Ihr einfacher Klick öffnet die Maske
// nicht, sonst öffnete schon der erste Klick des Doppelklicks sie. Die Spalte
// des Datensatzes und die lesenden Zellen öffnen sie weiterhin; ein Verweis in
// einer Zelle bleibt sein eigener Treffer. Während der Bearbeitung erreicht
// kein Klick der Zeile die zentralen Handler.
//
// **Ohne Import des Fenster-Zustands** (Muster `masken-sperre.js`): Kanäle,
// Übersetzung, Sprache, Zeit-Formatierung und Statuszeile kommen als Nähte
// herein. `istBearbeitbar` aus `masken-koerper.js` wird deshalb nicht
// importiert, weil jenes Modul über `render-mermaid.js` den ganzen
// Anzeige-Prozess nachlädt; die Aussage ist dieselbe eine Zeile.
//
// 4T-002251 (Epic 3E-000262, F1 A, F4 A, S3): **Anlegen und Löschen.** Eine
// Neuanlage (`beginneNeu`) zieht die Kennung über `database:neuanlage`, liest
// den leeren Stand über `database:datensatz` mit `kennung: null` und zeigt eine
// neue Zeile oben im Gitter (`listen-neu.js`) im Bearbeiten-Modus, ohne Sperre;
// gespeichert wird als Art Anlegen direkt über den Auftrags-Kanal, «Abbrechen»
// oder Escape entfernt die Zeile. «Löschen» nimmt die Sperre mit dem Zweck
// Löschen, liest frisch und fragt im Block unter der Zeile zurück
// (`baueLoeschFrage`); «Ja, löschen» schreibt die Art Löschen mit `erwartet`
// über den Sperr-Ablauf. Eine Abweisung (Lösch-Schutz, Fremd-Änderung) steht als
// Befund im Block unter der Zeile, und die Sperre ist frei. Der Weg ist der der
// Einzel-Maske (`masken-seite.js`: `neuerDatensatz`, Löschen im Kopf).
//
// **Verwaiste Sperren** (Festlegung 5): Verlässt eine Zeile mit gehaltener
// Sperre den Baum, weil der Reiter geschlossen oder die Ansicht gewechselt
// wurde, gibt `raeumeVerwaisteSperren` ihre Sperre frei; angestoßen wird das
// beim Neuzeichnen einer Spalte (`views/pane-render.js`).
//
// 4T-002253 (Epic 3E-000262, S7): **Der sammelnde Modus** (Naht `sammelnd`)
// im Positions-Bereich einer Maske: Der Auftrag einer Zeile geht an die Maske
// statt an die Schreib-Schnittstelle, die Zeile bleibt danach vorgemerkt und
// behält ihre Sperre, bis die Maske sie über `gebeSperrenFrei` freigibt
// (`listen-sammeln.js`). Ohne die Naht verhält sich die Liste wie zuvor.
//
// 4T-002325 (Epic 3E-000262): **Ein Block unter einer lesenden Zeile hält die
// Neu-Befüllung an** wie eine Zeile in Bearbeitung. Gemeint sind der Befund
// eines abgewiesenen Löschens und der Konflikt einer fremden Sperre: Die Zeile
// ist dabei lesend, und ohne Anhalten verwarf die Neu-Befüllung, die eine
// Index-Aktualisierung kurz nach dem Klick auslöst, den Block nach 100 bis
// 250 ms. Die Befüllung fragt dazu `zeigtBlock` neben `inBearbeitung`; endet
// der Block ohne folgende Handlung («Nur lesen»), meldet die Naht
// `blaetternSperren(false)` das Ende, und die Befüllung holt das Zurückgestellte
// nach (`frontmatter-query-view.js`). Beginnt eine andere Handlung, holt deren
// Ende nach. Die Wahl einer Fremd-Änderung brauchte das nicht: Ihre Zeile bleibt
// in Bearbeitung.
'use strict';

import {
  ART_AENDERN,
  ART_ANLEGEN,
  ART_LOESCHEN,
  baueAuftrag,
  baueFremdWahl,
  baueKopfBefunde,
  baueLoeschFrage,
  erzwungen,
  verarbeiteErgebnis,
} from './masken-speichern.js';
import { ZWECK_BEARBEITEN, ZWECK_LOESCHEN, erzeugeSperrAblauf } from './masken-sperre.js';
import { erzeugeVerweisHilfe } from './masken-verweise.js';
import { entferneNeueZeile, eroeffneNeuanlage } from './listen-neu.js';
import { erzeugeSammler, istGeloescht, zeigeVorgemerkt } from './listen-sammeln.js';
import {
  abschirmen,
  bearbeitbareZelle,
  felderDerZeile,
  fokussiere,
  innererTreffer,
  istEingabe,
  zeichneZellen,
} from './listen-zellen.js';

/** Klasse der Zeile, solange sie bearbeitet wird. */
export const ZEILE_BEARBEITEN_KLASSE = 'db-list-row-editing';

const LESEND = 'lesend';
const BEGINNT = 'beginnt';
const BEARBEITEN = 'bearbeiten';
// 4T-002251: Die Lösch-Rückfrage steht offen.
const FRAGE = 'frage';

// Die Zustände mit gehaltener oder angeforderter Sperre aller Listen des
// Fensters; beim Schließen des Fensters gibt jeder seine Sperre frei (Muster
// der Masken-Seite).
const OFFEN = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const zustand of OFFEN) void zustand.sperrAblauf.freigeben();
  });
}

/**
 * 4T-002251 (Festlegung 5): Gibt die Sperre jeder Zeile frei, deren Element den
 * Baum verlassen hat, etwa weil der Reiter geschlossen oder die Ansicht
 * gewechselt wurde, und räumt ihren Zustand aus. Mehrfaches Rufen ist
 * folgenlos.
 */
export function raeumeVerwaisteSperren() {
  for (const zustand of [...OFFEN]) {
    if (zustand.tr.isConnected) continue;
    zustand.raeume();
    if (!OFFEN.has(zustand)) continue;
    OFFEN.delete(zustand);
    void zustand.sperrAblauf.freigeben();
  }
}

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

function knopf(className, text, beiKlick, aus = false) {
  const b = el('button', `db-form-btn ${className}`, text);
  b.type = 'button';
  b.disabled = aus;
  b.addEventListener('click', (event) => {
    event.preventDefault();
    beiKlick();
  });
  return b;
}

// Wie `istBearbeitbar` in `masken-koerper.js` (Modul-Kopf): nicht änderbar ist
// allein ein Datensatz, dessen Bedingung ausdrücklich nicht erfüllt ist.
function istBearbeitbar(daten) {
  return !(daten && daten.editable && daten.editable.erfuellt === false);
}

// Die Antwort des Datensatz-Kanals, wenn sie bereit und vollständig ist, sonst null.
function bereiterStand(antwort) {
  if (!antwort || typeof antwort !== 'object' || antwort.status !== 'ready') return null;
  return Array.isArray(antwort.fields) && Array.isArray(antwort.zellen) ? antwort : null;
}

/**
 * Erzeugt die Zeilen-Bearbeitung einer Liste.
 *
 * @param {object} n Nähte.
 * @param {(params: object) => Promise<object>} n.sperre Kanal `database:sperre`.
 * @param {(params: object) => Promise<object>} n.datensatz Kanal `database:datensatz`.
 * @param {(params: object) => Promise<object>} n.auftrag Kanal `database:auftrag`.
 * @param {(params: object) => Promise<object>} n.datensaetze Kanal `database:datensaetze`.
 * @param {(params: object) => Promise<object>} [n.neuanlage] Kanal
 *   `database:neuanlage` (4T-002251); ohne ihn keine Neuanlage.
 * @param {Function} n.t Übersetzung.
 * @param {Function} [n.hat] Gibt es einen Schlüssel?
 * @param {(() => string|null)|string|null} [n.sprache] Aktive Sprache.
 * @param {(iso: string) => string} n.zeitpunkt Zeit-Formatierung der Oberfläche.
 * @param {(key: string) => void} n.hinweis Hinweis in der Statuszeile.
 * @param {() => void} n.beiGeschrieben Den Block neu befüllen.
 * @param {(aktiv: boolean) => void} n.blaetternSperren Blättern und «Bearbeiten»
 *   der übrigen Zeilen sperren oder freigeben; `false` meldet zugleich das Ende
 *   eines Blocks unter einer lesenden Zeile (4T-002325).
 * @param {boolean} [n.sammelnd] Der sammelnde Modus des Positions-Bereichs
 *   (4T-002253): `auftrag` sammelt, die Zeile bleibt vorgemerkt und gesperrt.
 * @param {(anweisung: {tabelle: string, id: string}) => void} [n.zuruecknehmen]
 *   Nimmt im sammelnden Modus die Vormerkung einer Zeile zurück, die auf ihren
 *   gelesenen Stand zurückgesetzt wurde.
 * @returns {{anschliessen: Function, beginneNeu: Function, inBearbeitung: Function,
 *   zeigtBlock: Function, gebeSperrenFrei: Function, speichereOffene: Function}}
 */
export function erzeugeZeilenBearbeitung(n) {
  const t = n.t;
  const sprache = () => (typeof n.sprache === 'function' ? n.sprache() : n.sprache || null);
  // Die Zeile in Bearbeitung (vom Beginn bis zum Ende), und die Zeile, unter
  // der ein Konflikt-Block steht.
  let aktiv = null;
  let angezeigt = null;
  const sammelnd = n.sammelnd === true;

  function uebernimm(zustand) {
    aktiv = zustand;
    OFFEN.add(zustand);
    n.blaetternSperren(true);
  }

  // Eine Zeile, deren Liste neu gezeichnet wurde, gibt ihre Sperre zurück.
  function raeumeAuf() {
    if (aktiv && !aktiv.tr.isConnected) {
      const alt = aktiv;
      alt.gueltig = false;
      aktiv = null;
      OFFEN.delete(alt);
      void alt.sperrAblauf.freigeben();
      n.blaetternSperren(false);
    }
    if (angezeigt && !angezeigt.tr.isConnected) angezeigt = null;
  }

  // Der Block der zuletzt angezeigten Zeile entfällt, sobald eine andere beginnt.
  // 4T-002325: `angezeigt` fällt vor dem Zeichnen weg, damit `zeichneBlock`
  // kein Ende meldet; das Nachholen übernimmt das Ende der neuen Handlung.
  function vergissAngezeigt() {
    if (!angezeigt) return;
    const alt = angezeigt;
    angezeigt = null;
    alt.sperrAblauf.vergiss();
    alt.loeschBefunde = null;
    zeichne(alt);
  }

  // Die Zeile bleibt lesend, ihr Block (Konflikt, abgewiesenes Löschen) darunter.
  function zeigeAn(zustand) {
    zustand.phase = LESEND;
    OFFEN.delete(zustand);
    if (aktiv === zustand) aktiv = null;
    angezeigt = zustand;
    zeichne(zustand);
    n.blaetternSperren(false);
  }

  // 4T-002251: Eine Neuanlage verschwindet ohne Spur, nach dem Speichern oder
  // beim Verwerfen; die Kennung bleibt verbraucht (E5.1).
  function entferneNeu(zustand) {
    zustand.gueltig = false;
    OFFEN.delete(zustand);
    if (aktiv === zustand) aktiv = null;
    entferneNeueZeile(zustand.tr);
    n.blaetternSperren(false);
  }

  function beende(zustand) {
    zustand.phase = LESEND;
    zustand.entwurf = null;
    zustand.befunde = null;
    zustand.auftrag = null;
    void zustand.sperrAblauf.freigeben();
    OFFEN.delete(zustand);
    if (aktiv === zustand) aktiv = null;
    zeichne(zustand);
    n.blaetternSperren(false);
  }

  // 4T-002253: der sammelnde Modus (`listen-sammeln.js`).
  const sammler = erzeugeSammler({
    offen: OFFEN,
    aktiv: () => aktiv,
    uebernimm: (zustand) => uebernimm(zustand),
    loese: (zustand) => void (aktiv === zustand && (aktiv = null)),
    zeichne: (zustand) => zeichne(zustand),
    frei: () => n.blaetternSperren(false),
    phasen: { LESEND, BEARBEITEN, FRAGE },
    speichern: () => speichern(),
  });

  function neuerZustand(tr, info) {
    const zustand = {
      tr,
      aktionen: info.aktionen,
      tabellenPfad: info.tabellenPfad,
      kennung: info.kennung,
      neu: info.neu === true,
      aendern: info.aendern !== false,
      loeschen: info.loeschen === true,
      loeschBefunde: null,
      sperre: null,
      sperrKonflikt: null,
      phase: LESEND,
      gueltig: true,
      daten: null,
      felder: [],
      entwurf: null,
      befunde: null,
      auftrag: null,
      sendet: false,
      hinweis: null,
      lesend: new Map(),
      verweise: erzeugeVerweisHilfe((tabelle) => n.datensaetze({ tabelle })),
    };
    zustand.sperrAblauf = erzeugeSperrAblauf({
      seite: zustand,
      sende: n.sperre,
      t,
      hat: n.hat,
      zeitpunkt: n.zeitpunkt,
      schluessel: () => String(zustand.gueltig),
      zeichne: () => zeichne(zustand),
      hinweis: n.hinweis,
      weiter: {
        bearbeiten: () => void lade(zustand),
        loeschen: () => void frageLoeschen(zustand),
      },
    });
    zustand.raeume = raeumeAuf;
    return zustand;
  }

  // --- Ablauf ------------------------------------------------------------------------

  // Beginn mit Sperre, für das Bearbeiten wie für das Löschen (4T-002251).
  async function beginne(tr, info, zweck = ZWECK_BEARBEITEN) {
    raeumeAuf();
    if (aktiv || !tr.isConnected) return;
    vergissAngezeigt();
    if (sammler.vorgemerkt.has(tr)) return void sammler.wieder(sammler.vorgemerkt.get(tr), zweck);
    const zustand = neuerZustand(tr, info);
    zustand.phase = BEGINNT;
    uebernimm(zustand);
    zeichne(zustand);
    await zustand.sperrAblauf.nehmen(zweck);
    // Belegt oder gescheitert: Die Zeile bleibt lesend, der Block steht darunter.
    if (zustand.sperrKonflikt) zeigeAn(zustand);
  }

  // 4T-002251 (Festlegungen 1 bis 3): die Neuanlage oben im Gitter, ohne Sperre;
  // der Ablauf steht in `listen-neu.js`, hier der Kern, an dem er arbeitet.
  const kern = {
    frei() {
      raeumeAuf();
      if (aktiv) return false;
      vergissAngezeigt();
      return true;
    },
    oeffne(tr, info) {
      const zustand = neuerZustand(tr, info);
      verbinde(tr, info);
      zustand.phase = BEGINNT;
      uebernimm(zustand);
      zeichne(zustand);
      return zustand;
    },
    gilt: (zustand) => aktiv === zustand && zustand.gueltig,
    entferne: (zustand) => entferneNeu(zustand),
    lade: (zustand) => lade(zustand),
  };

  // Nach gehaltener Sperre, bei einer Neuanlage ohne sie: der frische Stand.
  // Eine Neuanlage liest den leeren Stand mit `kennung: null`.
  async function liesStand(zustand) {
    if (aktiv && aktiv !== zustand) {
      void zustand.sperrAblauf.freigeben();
      return null;
    }
    if (!aktiv) uebernimm(zustand);
    if (angezeigt === zustand) angezeigt = null;
    zustand.phase = BEGINNT;
    zeichne(zustand);
    let antwort;
    try {
      antwort = await n.datensatz({
        tabelle: zustand.tabellenPfad,
        kennung: zustand.neu ? null : zustand.kennung,
        sprache: sprache(),
      });
    } catch {
      antwort = null;
    }
    const daten = bereiterStand(antwort);
    if (daten) await zustand.verweise.aufloesen(daten);
    if (aktiv !== zustand || !zustand.gueltig) return null;
    if (daten && (zustand.neu || istBearbeitbar(daten))) {
      zustand.daten = daten;
      return daten;
    }
    if (zustand.neu) {
      n.hinweis('database.form.newFailed');
      entferneNeu(zustand);
      return null;
    }
    zustand.hinweis = t('database.list.rowNotEditable');
    beende(zustand);
    return null;
  }

  // Nach dem frischen Stand die Feld-Elemente.
  async function lade(zustand) {
    const daten = await liesStand(zustand);
    if (!daten) return;
    zustand.felder = felderDerZeile(zustand.tr, daten.fields);
    zustand.entwurf = {};
    for (const feld of zustand.felder) {
      const zelle = daten.zellen.find((z) => z && z.name === feld.name);
      zustand.entwurf[feld.name] = zelle ? String(zelle.text || '') : '';
    }
    zustand.phase = BEARBEITEN;
    zeichne(zustand);
    fokussiere(zustand.tr, null);
  }

  function speichern() {
    const zustand = aktiv;
    if (!zustand || zustand.phase !== BEARBEITEN || zustand.sendet) return;
    const auftrag = baueAuftrag({
      art: zustand.neu ? ART_ANLEGEN : ART_AENDERN,
      tabellenPfad: zustand.tabellenPfad,
      kennung: zustand.kennung,
      entwurf: zustand.entwurf,
      erwartet: zustand.neu ? null : zustand.daten.erwartet || {},
      felderDesKoerpers: zustand.felder.map((f) => f.name),
    });
    // Ohne Änderung kein Auftrag (B4); die Zeile kehrt ins Lesen zurück.
    if (auftrag === null) {
      if (sammelnd && zustand.vorgemerkt) return void sammler.vergiss(zustand, n.zuruecknehmen);
      n.hinweis('database.form.nothingChanged');
      beende(zustand);
      return;
    }
    return sende(zustand, auftrag);
  }

  // Eine Neuanlage schreibt ohne Sperr-Ablauf (Festlegung 3), alles andere über
  // ihn, der danach freigibt.
  async function schicke(zustand, auftrag) {
    zustand.sendet = true;
    zeichne(zustand);
    const senden = (a) => n.auftrag({ auftrag: a });
    let ergebnis;
    try {
      ergebnis =
        zustand.neu || sammelnd
          ? await senden(auftrag)
          : await zustand.sperrAblauf.sendeAuftrag(auftrag, senden);
    } catch {
      ergebnis = null;
    }
    zustand.sendet = false;
    return ergebnis;
  }

  async function sende(zustand, auftrag) {
    const ergebnis = await schicke(zustand, auftrag);
    if (aktiv !== zustand || !zustand.gueltig) return;
    if (ergebnis && ergebnis.ok === true) {
      if (sammelnd) return void sammler.merke(zustand, false);
      if (zustand.neu) entferneNeu(zustand);
      else beende(zustand);
      n.hinweis('database.form.saved');
      n.beiGeschrieben();
      return;
    }
    // Die Eingaben bleiben stehen, die Zeile in Bearbeitung (B5).
    zustand.auftrag = auftrag;
    zustand.befunde = verarbeiteErgebnis(ergebnis, {
      t,
      hat: n.hat,
      sprache: sprache(),
      felder: zustand.felder.map((f) => f.name),
    });
    zeichne(zustand);
    fokussiere(zustand.tr, zustand.befunde.fokus);
  }

  function verwerfen() {
    if (!aktiv || aktiv.phase !== BEARBEITEN || aktiv.sendet) return;
    if (sammler.hat(aktiv)) sammler.zurueck(aktiv);
    else if (aktiv.neu) entferneNeu(aktiv);
    else beende(aktiv);
  }

  // «Neu laden» bei einer Fremd-Änderung: Entwurf verwerfen, Sperre freigeben,
  // den Block neu befüllen; die Zeile zeigt danach den vorgefundenen Stand.
  function neuLaden(zustand) {
    beende(zustand);
    n.beiGeschrieben();
  }

  // 4T-002251 (Festlegung 4): Nach gehaltener Sperre der frische Stand, dann
  // die Rückfrage unter der Zeile.
  async function frageLoeschen(zustand) {
    if (!(await liesStand(zustand))) return;
    zustand.phase = FRAGE;
    zeichne(zustand);
  }

  // «Ja, löschen»: ein Auftrag mit `erwartet` über den Sperr-Ablauf, der die
  // Sperre danach freigibt, auch bei einer Abweisung.
  async function loesche(zustand) {
    if (aktiv !== zustand || zustand.phase !== FRAGE || zustand.sendet) return;
    const auftrag = baueAuftrag({
      art: ART_LOESCHEN,
      tabellenPfad: zustand.tabellenPfad,
      kennung: zustand.kennung,
      erwartet: zustand.daten.erwartet || {},
    });
    const ergebnis = await schicke(zustand, auftrag);
    if (aktiv !== zustand || !zustand.gueltig) return;
    if (ergebnis && ergebnis.ok === true) {
      if (sammelnd) return void sammler.merke(zustand, true);
      beende(zustand);
      n.hinweis('database.form.deleted');
      n.beiGeschrieben();
      return;
    }
    // Lösch-Schutz oder Fremd-Änderung: Befund unter der Zeile, die Zeile bleibt.
    const befunde = verarbeiteErgebnis(ergebnis, { t, hat: n.hat, sprache: sprache(), felder: [] });
    if (befunde.fremd) befunde.kopf.push(befunde.fremd);
    zustand.loeschBefunde = befunde;
    zustand.daten = null;
    void zustand.sperrAblauf.freigeben();
    zeigeAn(zustand);
  }

  // --- Zeichnen ----------------------------------------------------------------------

  function zeichneAktionen(zustand) {
    const zelle = zustand.aktionen;
    zelle.textContent = '';
    if (zustand.neu && zustand.phase !== BEARBEITEN && !zustand.vorgemerkt) return;
    if (zustand.phase === BEARBEITEN) {
      zelle.appendChild(knopf('db-list-save', t('database.list.save'), speichern, zustand.sendet));
      zelle.appendChild(
        knopf('db-list-cancel', t('database.list.cancel'), verwerfen, zustand.sendet),
      );
      const befunde = baueKopfBefunde(zustand.befunde);
      if (befunde) zelle.appendChild(befunde);
      return;
    }
    if (zustand.hinweis) {
      zelle.appendChild(el('span', 'db-list-row-note', zustand.hinweis));
      zustand.tr.classList.add('db-list-row-readonly');
      return;
    }
    if (!istGeloescht(zustand)) leseKnoepfe(zelle, zustand.tr, zustand);
  }

  // Der Block unter der Zeile: Konflikt der Sperre, Wahl der Fremd-Änderung,
  // Lösch-Rückfrage oder Befund eines abgewiesenen Löschens.
  function zeichneBlock(zustand) {
    const tr = zustand.tr;
    const alt = tr.nextElementSibling;
    if (alt && alt.classList.contains('db-list-row-block')) alt.remove();
    const zelle = el('td', 'db-list-block');
    zelle.colSpan = tr.cells.length;
    zustand.sperrAblauf.zeichneKonflikt(zelle);
    const befunde = zustand.befunde;
    if (zustand.phase === BEARBEITEN && befunde && befunde.fremd && zustand.auftrag) {
      const auftrag = zustand.auftrag;
      zelle.appendChild(
        baueFremdWahl({
          text: befunde.fremd,
          t,
          neuLaden: () => neuLaden(zustand),
          erzwingen: () => void sende(zustand, erzwungen(auftrag)),
        }),
      );
    }
    if (zustand.phase === FRAGE) {
      const frage = baueLoeschFrage({
        t,
        ja: () => void loesche(zustand),
        nein: () => (sammler.hat(zustand) ? sammler.zurueck(zustand) : beende(zustand)),
      });
      for (const b of frage.querySelectorAll('button')) b.disabled = zustand.sendet;
      zelle.appendChild(frage);
    }
    const loeschBefunde = zustand.phase === LESEND ? baueKopfBefunde(zustand.loeschBefunde) : null;
    if (loeschBefunde) zelle.appendChild(loeschBefunde);
    if (!zelle.firstChild) {
      // 4T-002325: Der Block einer lesenden Zeile ist zu Ende («Nur lesen»); ohne
      // Zeile in Bearbeitung meldet die Naht das, und die Befüllung holt nach.
      if (angezeigt === zustand && !zustand.sperrKonflikt) {
        angezeigt = null;
        if (!aktiv) n.blaetternSperren(false);
      }
      return;
    }
    const zeile = el('tr', 'db-list-row-block');
    zeile.appendChild(zelle);
    abschirmen(zeile, () => true);
    tr.after(zeile);
  }

  function zeichne(zustand) {
    if (!zustand.tr.isConnected) return;
    zustand.tr.classList.toggle(ZEILE_BEARBEITEN_KLASSE, zustand.phase === BEARBEITEN);
    zustand.tr.classList.toggle('db-list-row-busy', zustand.phase === BEGINNT || zustand.sendet);
    zeichneZellen(zustand, zustand.phase === BEARBEITEN, sprache());
    if (zustand.vorgemerkt && zustand.phase !== BEARBEITEN) zeigeVorgemerkt(zustand, t);
    zeichneAktionen(zustand);
    zeichneBlock(zustand);
  }

  // --- Anschluss an das Gitter ---------------------------------------------------------

  // «Bearbeiten» und «Löschen» einer lesenden Zeile, je nach ihren Handgriffen
  // (4T-002251).
  function leseKnoepfe(zelle, tr, info) {
    if (info.aendern !== false) {
      zelle.appendChild(
        knopf('db-list-edit', t('database.list.edit'), () => void beginne(tr, info), !!aktiv),
      );
    }
    if (info.loeschen === true) {
      const loeschen = () => void beginne(tr, info, ZWECK_LOESCHEN);
      zelle.appendChild(knopf('db-list-delete', t('database.list.delete'), loeschen, !!aktiv));
    }
  }

  // Wie eine Zeile auf Maus-Druck und Klick antwortet: «durch» an die zentralen
  // Handler (Klick öffnet die Maske), «abschirmen» ohne Eingriff in die
  // Auswahl (Eingaben in Bearbeitung), «halten» mit verhinderter Auswahl.
  function lageDes(tr, ziel, info) {
    if (aktiv && aktiv.tr === tr) return istEingabe(ziel) ? 'abschirmen' : 'halten';
    if (ziel instanceof Element && ziel.closest('td.db-list-actions')) return 'halten';
    if (innererTreffer(tr, ziel)) return 'durch';
    // 4T-002251: Ohne «Bearbeiten» ist eine Feld-Zelle kein Ziel des Doppelklicks.
    return info.aendern !== false && bearbeitbareZelle(tr, ziel) ? 'halten' : 'durch';
  }

  /**
   * Schließt eine Zeile des Gitters an: «Bearbeiten» und «Löschen» in ihrer
   * Aktions-Zelle, Doppelklick in eine bearbeitbare Zelle, Tastatur in der
   * Bearbeitung.
   *
   * @param {HTMLTableRowElement} tr Die Zeile, mit `data-db-list-field` an den
   *   bearbeitbaren Zellen.
   * @param {{tabellenPfad: string, kennung: string, aktionen: HTMLElement,
   *   aendern?: boolean, loeschen?: boolean}} info `aendern` (ohne Angabe wahr)
   *   bietet «Bearbeiten» und den Doppelklick, `loeschen` «Löschen» (4T-002251).
   */
  function anschliessen(tr, info) {
    raeumeAuf();
    leseKnoepfe(info.aktionen, tr, info);
    verbinde(tr, info);
  }

  // Maus und Tastatur einer Zeile, bestehend oder neu.
  function verbinde(tr, info) {
    tr.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const lage = lageDes(tr, event.target, info);
      if (lage === 'durch') return;
      event.stopPropagation();
      if (lage === 'halten') event.preventDefault();
    });
    tr.addEventListener('click', (event) => {
      if (lageDes(tr, event.target, info) !== 'durch') event.stopPropagation();
    });
    tr.addEventListener('dblclick', (event) => {
      if (aktiv || info.aendern === false || info.neu) return;
      if (tr.classList.contains('db-list-row-readonly')) return;
      if (innererTreffer(tr, event.target) || !bearbeitbareZelle(tr, event.target)) return;
      event.preventDefault();
      void beginne(tr, info);
    });
    tr.addEventListener('keydown', (event) => {
      if (!aktiv || aktiv.tr !== tr || aktiv.phase !== BEARBEITEN) return;
      if (event.defaultPrevented || event.isComposing) return;
      const ziel = event.target;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        verwerfen();
      } else if (event.key === 'Enter') {
        if (ziel instanceof Element && ziel.closest('button')) return;
        if (ziel instanceof HTMLTextAreaElement && event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        speichern();
      }
    });
  }

  return {
    anschliessen,
    /**
     * Eröffnet eine Neuanlage oben im Gitter der Liste (4T-002251).
     *
     * @param {HTMLElement} container Das Element `div.db-list`.
     * @param {{tabellenPfad: string}} ziel Die Tabelle der Liste.
     * @returns {Promise<void>}
     */
    beginneNeu: (container, ziel) =>
      eroeffneNeuanlage({
        container,
        ...ziel,
        t,
        neuanlage: n.neuanlage,
        hinweis: n.hinweis,
        kern,
      }),
    /** @returns {boolean} Ist eine Zeile dieser Liste in Bearbeitung? */
    inBearbeitung() {
      raeumeAuf();
      return aktiv !== null;
    },
    /**
     * 4T-002325: Steht unter einer lesenden Zeile ein Block (Befund eines
     * abgewiesenen Löschens, Konflikt einer fremden Sperre)? Er hält die
     * Neu-Befüllung an wie eine Zeile in Bearbeitung.
     *
     * @returns {boolean}
     */
    zeigtBlock: () => angezeigt !== null && angezeigt.tr.isConnected,
    /** Gibt alle gehaltenen Sperren dieser Liste frei (4T-002253, sammelnd). */
    gebeSperrenFrei: () => sammler.gebeFrei(),
    /** Merkt eine offen bearbeitete Zeile vor; false, wenn sie abgewiesen bleibt. */
    speichereOffene: () => sammler.speichereOffene(),
  };
}
