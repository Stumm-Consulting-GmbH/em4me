// 4T-000759 (Epic 3E-000142): Suchergebnis-Panel — Trefferliste der Suche über
// Handbuch bzw. Einstellungen, gruppiert nach Seite bzw. Bereich.
//
// Entscheidung des Product Owners vom 2026-07-27 nach einer Mockup-Runde:
// Die Treffer erscheinen als Liste in einem Sidebar-Panel, nicht als
// Aufklappen unter der Suchleiste und nicht als reine Durchlauf-Suche.
// Tragender Grund: Beim Nachschlagen lautet die eigentliche Frage, WO ein
// Begriff steht (im Handbuch die Seite, in den Einstellungen der Bereich),
// und nur die gruppierte Liste beantwortet sie.
//
// 4T-001525 (Epic 3E-000169): Dazu gekommen ist die Auswahl je Fundstelle für
// das bereichsweite Ersetzen — eine zweite Ebene neben dem Auswahl-Index,
// sichtbar nur im Ersetzen-Modus. Ohne ihn ist dieses Panel unverändert das
// von 4T-000759.
//
// Dieses Modul zeigt an und wählt aus; es sucht nicht und springt nicht.
// Den Trefferbestand reicht der Suchlauf über zeigeTreffer herein (4T-000760),
// den Sprung führt ein registrierter Handler aus. Der Schnitt hält das
// Panel frei von Wissen über die Herkunft der Treffer und ist die
// Voraussetzung dafür, dass später ein dritter Lieferant (bereichsweite
// Dokument-Suche) ohne zweites Bedienbild andocken kann.
'use strict';

import { t } from '../../i18n.js';
import { getPaneEls, state } from '../app/app-state.js';
import { applySidebarVisibility } from '../panels/panels.js';
import { reportMenuStateNow } from '../tabs/tabs.js';
import { persistSetting } from '../views/views.js';
import { ensurePanelTabActive, oeffnePanel, registerSidebarPanel } from '../sidebar-layout.js';
import { api } from '../app/api.js';
// 4T-001525 (Epic 3E-000169): Die Auswahl je Fundstelle liegt in einem
// eigenen Modul; hier bleibt das Anzeigen und Anwaehlen.
import * as auswahl from './search-auswahl.js';

// Laufender Trefferbestand. Bewusst Modul-Zustand und nicht in state: Er
// gehört zum laufenden Suchlauf, überlebt keinen Neustart und wird nie
// persistiert.
let bestand = {
  treffer: [],
  gruppen: [],
  abgeschnitten: false,
  // 'manual' | 'settings' | 'document' | null
  raum: null,
  auswahl: -1,
};

// Zugeklappte Gruppen (Gruppen-Kennung). Bleibt über einen neuen Suchlauf
// hinweg erhalten, damit eine bewusst zugeklappte Seite nicht bei jedem
// Tastendruck wieder aufspringt.
const zugeklappt = new Set();

// Zeigt das Panel seine Ankreuzfelder? Ohne Ersetzen-Modus bleibt es Zeichen
// für Zeichen das Panel von 4T-000759 (kein zusätzliches Element im Baum).
// Die Auswahl selbst liegt in search-auswahl.js (4T-001525).
let ersetzenModus = false;

let sprungHandler = null;

// 4T-001531 (Epic 3E-000175): Die laufende Tag-Umbenennung, solange ihre
// Vorschau steht. Sie hängt an der Anfrage des Bestands: Ein Suchlauf mit einem
// anderen Muster zeigt andere Fundstellen, und ein Balken darüber verspräche
// eine Umbenennung, die zu dieser Liste nicht mehr gehört.
// { alt, neu, kinder, anfrage, ausfuehren(), abbrechen() }
let umbenennung = null;

// Die Anfrage als ein Wert. JSON statt einer selbstgebauten Trennung: Muster und
// Flags sind beliebige Zeichenketten, und ein Trennzeichen, das in keiner von
// beiden vorkommen kann, gibt es nicht.
function kennungDerAnfrage(muster, flags) {
  return JSON.stringify([muster || '', flags || '']);
}

/**
 * Zeigt eine Tag-Umbenennung zur Bestätigung an: Fundstellen als Trefferliste,
 * darüber der Balken mit beiden Namen und den Knöpfen.
 *
 * **Warum die Bestätigung hier steht und nicht in einem Dialog:** Die Vorschau
 * IST die Trefferliste (Entscheidung E5 des Epics), und der Anwender darf
 * einzelne Stellen abwählen, bevor er zusagt. Ein modaler Dialog legte sich
 * genau über die Liste, die er lesen soll.
 */
export function zeigeUmbenennung(daten) {
  const { alt, neu, kinder, muster, flags, treffer, gruppen, abgeschnitten, vorratModus } = daten;
  zeigeTreffer({ treffer, gruppen, abgeschnitten, vorratModus, raum: 'area', muster, flags });
  setzeErsetzenModus(true);
  umbenennung = {
    alt,
    neu,
    kinder: kinder || 0,
    anfrage: kennungDerAnfrage(muster, flags),
    ausfuehren: typeof daten.ausfuehren === 'function' ? daten.ausfuehren : null,
    abbrechen: typeof daten.abbrechen === 'function' ? daten.abbrechen : null,
  };
  zeichneAllePanes();
}

/**
 * Beendet die Vorschau — nach dem Lauf, nach dem Abbruch, nach fremder Suche.
 *
 * Der Ersetzen-Modus geht dabei aus. Er könnte theoretisch auch von der
 * Suchleiste stammen, praktisch nicht: Ihre Anfrage müsste dafür Zeichen für
 * Zeichen der Tag-Ausdruck sein, den niemand von Hand tippt. Ihr nächster Lauf
 * setzt den Modus ohnehin aus ihrem eigenen Zustand neu.
 */
export function beendeUmbenennung() {
  if (!umbenennung) return;
  umbenennung = null;
  setzeErsetzenModus(false);
  zeichneAllePanes();
}

// Der Balken lebt nur zu SEINER Liste. Ein neuer Suchlauf mit anderer Anfrage
// zieht ihn mit sich fort, statt über fremden Treffern stehen zu bleiben.
function pruefeUmbenennungsBestand(muster, flags) {
  if (!umbenennung) return;
  if (umbenennung.anfrage === kennungDerAnfrage(muster, flags)) return;
  umbenennung = null;
  ersetzenModus = false;
}

// Verdrahtungs-Punkt für den Suchlauf (4T-000760): Der Handler bekommt den
// Treffer und führt Öffnen und Anspringen aus.
export function setzeSprungHandler(fn) {
  sprungHandler = typeof fn === 'function' ? fn : null;
}

export function zeigeTreffer({
  treffer,
  gruppen,
  abgeschnitten,
  raum,
  vorratModus,
  muster,
  flags,
}) {
  // 4T-001525: Die Auswahl überlebt jeden Lauf mit derselben Anfrage — auch
  // den, den ein Reiter-Wechsel auslöst — und keinen mit einer anderen.
  auswahl.pruefeAnfrage(raum, muster, flags);
  // 4T-001531: Derselbe Maßstab für den Balken der Tag-Umbenennung.
  pruefeUmbenennungsBestand(muster, flags);
  bestand = {
    treffer: Array.isArray(treffer) ? treffer : [],
    gruppen: Array.isArray(gruppen) ? gruppen : [],
    abgeschnitten: !!abgeschnitten,
    raum: raum || null,
    // 4T-000616: 'direkt' meldet einen Bereich oberhalb des Vorrats-Deckels.
    vorratModus: vorratModus || null,
    auswahl: Array.isArray(treffer) && treffer.length > 0 ? 0 : -1,
  };
  zeichneAllePanes();
}

export function leereTreffer(raum = null) {
  auswahl.leereAuswahl();
  // 4T-001531: Ohne Treffer gibt es nichts umzubenennen; der Balken ginge
  // sonst als Zusage über eine leere Liste weiter.
  umbenennung = null;
  bestand = {
    treffer: [],
    gruppen: [],
    abgeschnitten: false,
    raum,
    vorratModus: null,
    auswahl: -1,
  };
  zeichneAllePanes();
}

// Auswahl-Index, damit der Suchlauf die Liste und den aktiven Treffer der
// Leiste synchron halten kann (F3 bewegt beide).
// 4T-001561 (Epic 3E-000280): `fokus` holt den Tastatur-Fokus auf die neu
// gewaehlte Zeile. Er ist bewusst NICHT die Vorgabe: Diese Funktion ruft auch
// die Suchleiste (F3 ueber setzeRaumIndex), und dort gehoert der Fokus in ihr
// Eingabefeld — ihn ins Panel zu ziehen naehme dem Anwender die Tastatur unter
// den Fingern weg.
export function setzeAuswahl(index, { fokus = false } = {}) {
  if (index < -1 || index >= bestand.treffer.length) return;
  bestand.auswahl = index;
  const treffer = bestand.treffer[index];
  zeichneAllePanes(fokus && treffer ? zeilenSchluessel(treffer) : null);
}

export function aktuelleAuswahl() {
  return bestand.auswahl;
}

// --- Auswahl für das Ersetzen (4T-001525) -----------------------------------

// Die Treffer einer Gruppe. Sie liegen in Gruppen-Reihenfolge hintereinander,
// der Startindex ergibt sich also aus den Anzahlen der Gruppen davor.
function trefferDerGruppe(gruppenIndex) {
  let start = 0;
  for (let i = 0; i < gruppenIndex; i++) start += bestand.gruppen[i].anzahl;
  return bestand.treffer.slice(start, start + bestand.gruppen[gruppenIndex].anzahl);
}

/**
 * Schaltet die Ankreuzfelder ein und aus.
 *
 * Gerufen von der Suchleiste, wenn sie in den Ersetzen-Modus geht (search.js).
 * Die Auswahl selbst bleibt dabei bestehen: Ein versehentliches Schließen der
 * Ersetzen-Zeile soll nicht die Arbeit einer Minute wegwerfen.
 */
export function setzeErsetzenModus(an) {
  const neu = !!an;
  if (neu === ersetzenModus) return;
  ersetzenModus = neu;
  zeichneAllePanes();
}

/**
 * Die ausgewählten Fundstellen, nach Datei gebündelt.
 *
 * Genau die Form, die der Kanal `areaReplace:run` entgegennimmt (4T-001524):
 * absoluter Pfad und die Offsets im gesuchten Text. Nur der Bereichs-Raum
 * liefert etwas — Handbuch und Einstellungen sind schreibgeschützt, und ein
 * Treffer ohne Datei-Kennung hätte kein Ziel.
 *
 * @returns {Array<{pfad: string, offsets: number[]}>}
 */
export function ausgewaehlteFundstellen() {
  if (bestand.raum !== 'area') return [];
  return auswahl.ausgewaehlteFundstellen(bestand.treffer);
}

// Nur für Prüffälle und für den Nachlauf des Ersetzens: die Zahl der
// ausgewählten Fundstellen, ohne die Bündelung zu bauen.
export function anzahlAusgewaehlt() {
  return auswahl.anzahlAusgewaehlt(bestand.treffer);
}

// Nach dem Neuzeichnen liegt der Tastatur-Fokus sonst wieder am Anfang: Das
// Umschalten eines Ankreuzfelds zeichnet die Liste neu, und das eben benutzte
// Feld ist danach ein anderes DOM-Element. Der Schlüssel überlebt das
// Neuzeichnen, also bekommt das neue Feld den Fokus darüber zurück.
function zeichneAllePanes(fokusSchluessel = null) {
  for (let p = 0; p < state.panes.length; p++) {
    if (state.searchResults.visibleByPane[p]) zeichne(p);
  }
  if (!fokusSchluessel) return;
  const els = getPaneEls(state.activePaneIndex);
  if (!els || !els.searchResultsList) return;
  // 4T-001561: Ankreuzfelder UND Trefferzeilen tragen einen Schluessel; gesucht
  // wird deshalb ueber das Merkmal statt ueber die Klasse. Die Schluessel-Raeume
  // sind getrennt (Zeilen tragen ein eigenes Praefix), eine Verwechslung von
  // Feld und Zeile ist damit ausgeschlossen.
  for (const el of els.searchResultsList.querySelectorAll('[data-schluessel]')) {
    if (el.dataset.schluessel === fokusSchluessel) {
      el.focus();
      return;
    }
  }
}

// Der Schluessel einer Trefferzeile. Eigener Praefix, damit er nie mit dem
// Schluessel des Ankreuzfelds derselben Fundstelle zusammenfaellt.
function zeilenSchluessel(treffer) {
  return `zeile\u0000${auswahl.schluessel(treffer)}`;
}

// Ein Ankreuzfeld als Geschwister VOR seiner Zeile.
//
// Bewusst kein Element innerhalb der Zeile und kein Behälter um sie herum: Die
// Zeile ist ein <button>, ein Ankreuzfeld darin wäre ungültiges HTML, und ein
// Behälter darum bräche die Geschwister-Beziehung von Gruppen- und
// Trefferzeile, auf der die Anzeige und die Ablauf-Prüfung aufsetzen. Die
// Paarung von Feld und Zeile leistet das Raster im Stylesheet.
function baueAnkreuzfeld({ klasse, schluessel: sch, gewaehlt, unbestimmt, beschriftung, aendern }) {
  const feld = document.createElement('input');
  feld.type = 'checkbox';
  feld.className = klasse;
  feld.dataset.schluessel = sch;
  feld.checked = gewaehlt;
  feld.indeterminate = !!unbestimmt;
  feld.setAttribute('aria-label', beschriftung);
  feld.title = beschriftung;
  feld.addEventListener('change', () => aendern(feld.checked));
  return feld;
}

function statusText() {
  if (bestand.raum === 'document') return t('searchResults.documentScope');
  if (bestand.raum === null) return t('searchResults.noQuery');
  if (bestand.treffer.length === 0) return t('searchResults.empty');
  const anzahl = String(bestand.treffer.length);
  const gruppen = String(bestand.gruppen.length);
  // 4T-000616: Im Bereichs-Raum sind die Gruppen Dateien, in den uebrigen
  // Raeumen Seiten bzw. Bereiche. Ein eigener Schluessel statt eines
  // zusammengesetzten Satzes, damit jede Sprache ihre eigene Wendung waehlen
  // kann.
  const schluessel = bestand.raum === 'area' ? 'searchResults.countFiles' : 'searchResults.count';
  let text = t(schluessel).replace('{n}', anzahl).replace('{g}', gruppen);
  if (bestand.abgeschnitten) text += ` ${t('searchResults.truncated')}`;
  // Der Rueckfall-Modus des Vorrats ist kein Fehler, aber er erklaert, warum
  // die Suche in einem sehr grossen Bereich traeger reagiert.
  if (bestand.vorratModus === 'direkt') text += ` ${t('searchResults.directMode')}`;
  return text;
}

function baueGruppenKopf(gruppe, offen) {
  const kopf = document.createElement('button');
  kopf.type = 'button';
  kopf.className = 'search-results-group';
  kopf.dataset.gruppe = gruppe.gruppe;
  kopf.setAttribute('aria-expanded', offen ? 'true' : 'false');

  const caret = document.createElement('span');
  caret.className = 'search-results-caret';
  caret.textContent = offen ? '▾' : '▸';
  const titel = document.createElement('span');
  titel.className = 'search-results-group-title';
  titel.textContent = gruppe.titel || gruppe.gruppe;
  const anzahl = document.createElement('span');
  anzahl.className = 'search-results-group-count';
  anzahl.textContent = String(gruppe.anzahl);

  kopf.append(caret, titel, anzahl);
  kopf.addEventListener('click', () => {
    if (zugeklappt.has(gruppe.gruppe)) zugeklappt.delete(gruppe.gruppe);
    else zugeklappt.add(gruppe.gruppe);
    zeichneAllePanes();
  });
  return kopf;
}

// Ein Treffer als Zeile: Kontext-Ausschnitt mit hervorgehobenem Fund. Die
// Hervorhebung nutzt die Offsets, die der Kern mitliefert; hier wird nicht
// noch einmal gesucht.
function baueTrefferZeile(treffer, index) {
  const zeile = document.createElement('button');
  zeile.type = 'button';
  zeile.className = 'search-results-item';
  zeile.dataset.index = String(index);
  // 4T-001561: Der Schluessel ueberlebt das Neuzeichnen und traegt damit den
  // Fokus; der Index taete es nicht, weil er sich mit jedem Lauf verschiebt.
  zeile.dataset.schluessel = zeilenSchluessel(treffer);
  if (index === bestand.auswahl) zeile.classList.add('selected');

  const vor = treffer.ausschnitt.slice(0, treffer.von);
  const fund = treffer.ausschnitt.slice(treffer.von, treffer.bis);
  const nach = treffer.ausschnitt.slice(treffer.bis);
  zeile.append(document.createTextNode(vor));
  const mark = document.createElement('mark');
  mark.className = 'search-results-match';
  mark.textContent = fund;
  zeile.appendChild(mark);
  zeile.append(document.createTextNode(nach));

  // 4T-001531 (Epic 3E-000175): Eine Fundstelle der Tag-Umbenennung sagt, was
  // aus ihr wird. Bei einem mitwandernden Kind ist das die Bedingung der
  // Entscheidung E4; bei den übrigen ist es dieselbe Auskunft, weil eine Liste,
  // in der nur manche Zeilen ihr Ziel nennen, den Rest fragwürdig macht.
  const zusatz = treffer.zusatz;
  if (zusatz && zusatz.neu) {
    const ziel = document.createElement('span');
    ziel.className = 'search-results-rename-target';
    if (zusatz.kind) ziel.classList.add('kind');
    ziel.textContent = ` → ${zusatz.neu}`;
    ziel.title = zusatz.kind ? t('tagRename.childHint') : '';
    zeile.appendChild(ziel);
  }

  zeile.addEventListener('click', () => {
    bestand.auswahl = index;
    zeichneAllePanes();
    if (sprungHandler) sprungHandler(treffer, index);
  });
  return zeile;
}

// 4T-001531 (Epic 3E-000175): Der Balken über der Vorschau einer
// Tag-Umbenennung. Er nennt beide Namen, die Zahl der mitwandernden Kinder
// (Bedingung der Entscheidung E4: sie werden ausgewiesen, nicht stillschweigend
// mitgenommen) und trägt die beiden Knöpfe.
function zeichneUmbenennung(els) {
  const balken = els.searchResultsRename;
  if (!balken) return;
  // Ohne laufende Umbenennung wird NICHTS angefasst, solange der Balken schon
  // leer und versteckt ist. Das ist dieselbe Linie wie beim Ersetzen-Modus:
  // Ohne ihn bleibt die Liste Zeichen für Zeichen die von 4T-000759 — und hier
  // zusätzlich eine Vorsichtsmaßnahme, weil dieses Zeichnen unmittelbar vor der
  // Fokus-Rückgabe der Tastatur-Führung liegt (4T-001561). Zwei DOM-Schreib-
  // vorgänge je Tastendruck, die im Regelfall nichts bewirken, verschieben
  // deren Zeitfenster, ohne irgendetwas zu leisten.
  if (!umbenennung) {
    if (!balken.hidden) {
      balken.innerHTML = '';
      balken.hidden = true;
    }
    return;
  }
  balken.innerHTML = '';
  balken.hidden = false;

  const satz = document.createElement('div');
  satz.className = 'search-results-rename-text';
  satz.textContent = t('tagRename.bar')
    .replace('{alt}', umbenennung.alt)
    .replace('{neu}', umbenennung.neu)
    .replace('{n}', String(auswahl.anzahlAusgewaehlt(bestand.treffer)));
  balken.appendChild(satz);

  if (umbenennung.kinder > 0) {
    const kinder = document.createElement('div');
    kinder.className = 'search-results-rename-children';
    kinder.textContent = t('tagRename.children').replace('{n}', String(umbenennung.kinder));
    balken.appendChild(kinder);
  }

  const knoepfe = document.createElement('div');
  knoepfe.className = 'search-results-rename-buttons';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'search-results-rename-ok';
  ok.textContent = t('tagRename.run');
  ok.disabled = auswahl.anzahlAusgewaehlt(bestand.treffer) === 0;
  ok.addEventListener('click', () => {
    const lauf = umbenennung && umbenennung.ausfuehren;
    if (lauf) void lauf();
  });
  const abbruch = document.createElement('button');
  abbruch.type = 'button';
  abbruch.className = 'search-results-rename-cancel';
  abbruch.textContent = t('dialog.cancel');
  abbruch.addEventListener('click', () => {
    const zurueck = umbenennung && umbenennung.abbrechen;
    beendeUmbenennung();
    if (zurueck) zurueck();
  });
  knoepfe.append(ok, abbruch);
  balken.appendChild(knoepfe);
}

function zeichne(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.searchResultsList || !els.searchResultsStatus) return;

  zeichneUmbenennung(els);
  els.searchResultsStatus.textContent = statusText();
  els.searchResultsStatus.classList.toggle(
    'empty',
    bestand.raum !== null && bestand.raum !== 'document' && bestand.treffer.length === 0,
  );

  const liste = els.searchResultsList;
  liste.innerHTML = '';
  // 4T-001525: Ankreuzfelder gibt es im Ersetzen-Modus und nur im
  // Bereichs-Raum. Handbuch und Einstellungen sind schreibgeschuetzt
  // (Abgrenzung von 3E-000142); dort waere eine Auswahl zum Ersetzen eine
  // Zusage, die niemand einloest. Die Klasse schaltet das Raster, das
  // Ankreuzfeld und Zeile paart; ohne sie ist die Liste die unveraenderte
  // von 4T-000759.
  const zeigeAuswahl = ersetzenModus && bestand.raum === 'area';
  liste.classList.toggle('auswahl-modus', zeigeAuswahl);
  if (bestand.treffer.length === 0) return;

  // Die Treffer liegen in Gruppen-Reihenfolge; ein einziger Durchlauf
  // genuegt, um sie den Gruppen zuzuordnen.
  let index = 0;
  for (let g = 0; g < bestand.gruppen.length; g++) {
    const gruppe = bestand.gruppen[g];
    const offen = !zugeklappt.has(gruppe.gruppe);
    if (zeigeAuswahl) {
      const gruppenTreffer = trefferDerGruppe(g);
      const zustand = auswahl.gruppenZustand(gruppenTreffer);
      const sch = `gruppe\u0000${gruppe.gruppe}`;
      liste.appendChild(
        baueAnkreuzfeld({
          klasse: 'search-results-check search-results-check-group',
          schluessel: sch,
          gewaehlt: zustand === 'ganz',
          unbestimmt: zustand === 'teilweise',
          beschriftung: t('searchResults.selectGroup'),
          aendern: (an) => {
            // Teilweise ausgewaehlt heisst beim naechsten Klick «alles»: Der
            // Anwender greift zum Gruppen-Feld, um die Gruppe als Ganzes zu
            // setzen, nicht um seine Teilauswahl zu spiegeln.
            auswahl.waehleAlle(gruppenTreffer, an);
            zeichneAllePanes(sch);
          },
        }),
      );
    }
    liste.appendChild(baueGruppenKopf(gruppe, offen));
    for (let i = 0; i < gruppe.anzahl; i++) {
      const treffer = bestand.treffer[index];
      if (treffer && offen) {
        if (zeigeAuswahl) {
          const sch = auswahl.schluessel(treffer);
          liste.appendChild(
            baueAnkreuzfeld({
              klasse: 'search-results-check',
              schluessel: sch,
              gewaehlt: auswahl.istGewaehlt(treffer),
              unbestimmt: false,
              beschriftung: t('searchResults.selectMatch'),
              aendern: (an) => {
                auswahl.waehle(treffer, an);
                zeichneAllePanes(sch);
              },
            }),
          );
        }
        liste.appendChild(baueTrefferZeile(treffer, index));
      }
      index++;
    }
  }

  const gewaehlt = liste.querySelector('.search-results-item.selected');
  if (gewaehlt) gewaehlt.scrollIntoView({ block: 'nearest' });
}

// --- Tastatur ---------------------------------------------------------------
// Pfeiltasten bewegen die Auswahl, Enter löst den Sprung aus. Nur wirksam,
// wenn der Fokus im Panel liegt; die Suchleiste behält sonst ihre eigene
// Tastatur-Führung (dort ist Enter der Sprung zum nächsten Treffer).
function bewege(schritt) {
  if (bestand.treffer.length === 0) return;
  const naechster = Math.min(Math.max(bestand.auswahl + schritt, 0), bestand.treffer.length - 1);
  // 4T-001561: Die Bewegung kommt aus dem Panel, also bleibt der Fokus dort.
  // Ohne diese Rueckgabe zeichnet der erste Druck die Liste neu, das
  // fokussierte Element verschwindet, der Fokus faellt auf BODY — und der
  // zweite Druck erreicht diesen Handler nicht mehr.
  setzeAuswahl(naechster, { fokus: true });
}

function onKeydown(ev) {
  const imPanel = ev.target && ev.target.closest && ev.target.closest('.sidebar-searchresults');
  if (!imPanel) return;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    bewege(1);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    bewege(-1);
  } else if (ev.key === 'Enter') {
    const treffer = bestand.treffer[bestand.auswahl];
    if (treffer && sprungHandler) {
      ev.preventDefault();
      sprungHandler(treffer, bestand.auswahl);
    }
  }
}

// --- Sichtbarkeit und Registrierung -----------------------------------------

// Bewusst ohne Empty-State-Kopplung (Muster der Lesezeichen aus 4T-000330):
// Das Panel gehört nicht zum Dokument, sondern zum Handbuch und zu den
// Einstellungen. Beide lassen sich ohne offene Datei benutzen, und ein
// Panel, das der Schalter nicht einblenden kann, wäre eine Sackgasse.
export function applySearchResultsVisibility(paneIdx) {
  const els = getPaneEls(paneIdx);
  if (!els || !els.searchResultsSection) return;
  const visible = !!state.searchResults.visibleByPane[paneIdx];
  els.searchResultsSection.hidden = !visible;
  applySidebarVisibility(paneIdx);
  if (visible) zeichne(paneIdx);
  updateSearchResultsToggleButton();
}

export function updateSearchResultsToggleButton() {
  const btn = document.getElementById('btn-search-results');
  if (!btn) return;
  const visible = !!state.searchResults.visibleByPane[state.activePaneIndex];
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

export async function toggleSearchResultsPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  const next = !state.searchResults.visibleByPane[paneIdx];
  state.searchResults.visibleByPane[paneIdx] = next;
  if (next) await ensurePanelTabActive('searchresults', paneIdx);
  applySearchResultsVisibility(paneIdx);
  await persistSearchResultsSettings();
  if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
    reportMenuStateNow();
  }
}

// Öffnet das Panel, ohne zu schalten: Der Suchlauf zeigt Treffer an, und ein
// unsichtbares Panel wäre eine Sackgasse (4T-000760 nutzt das).
//
// 4T-001533 (Epic 3E-000175): Ein sichtbares Panel ist nicht schon ein
// sichtbares Panel. Es liegt in der Finde-Gruppe der linken Sidebar hinter
// Gliederung, Unterseiten und Datei-Graph; steht einer von denen vorn, ist die
// Trefferliste da und trotzdem nicht zu sehen. Der Reiter wird deshalb IMMER
// nach vorn geholt, auch wenn das Panel bereits als sichtbar gilt — genau die
// Sackgasse, die der Absatz darüber ausschließen will.
//
// **Gefunden hat das der Product Owner am gebauten Programm** (2026-09-08), und
// die Prüffälle konnten es nicht finden: Sie starten mit geschlossenem Panel,
// und dann schaltet dieselbe Funktion es ein und aktiviert den Reiter dabei.
// Wer die Gliederung offen hat und dann umbenennt, sah den Dialog verschwinden
// und sonst nichts.
//
// 4T-001641 (Epic 3E-000297): Die Fallunterscheidung steht seither in
// `oeffnePanel` — dieselbe Regel, an einer Stelle, fuer alle Oeffner.
export async function zeigeSuchPanel(paneIdx) {
  if (paneIdx < 0 || paneIdx >= state.panes.length) return;
  await oeffnePanel('searchresults', paneIdx);
}

export async function persistSearchResultsSettings() {
  await persistSetting('searchResults.visibleColumn0', !!state.searchResults.visibleByPane[0]);
  await persistSetting('searchResults.visibleColumn1', !!state.searchResults.visibleByPane[1]);
}

export async function loadSearchResultsSettings() {
  const v0 = await api.getSetting('searchResults.visibleColumn0');
  const v1 = await api.getSetting('searchResults.visibleColumn1');
  state.searchResults.visibleByPane[0] = !!v0;
  state.searchResults.visibleByPane[1] = !!v1;
}

export function initSearchResultsPanel() {
  document.addEventListener('keydown', onKeydown);
}

registerSidebarPanel({
  id: 'searchresults',
  titleKey: 'searchResults.title',
  buttonId: 'btn-search-results',
  sectionClass: 'sidebar-searchresults',
  getVisible: (paneIdx) => !!(state.searchResults && state.searchResults.visibleByPane[paneIdx]),
  // 4T-001641: der reine Schalter fuer oeffnePanel. Hier deckungsgleich mit
  // getVisible; das Feld steht trotzdem eigens da, weil die Deckung eine
  // Eigenschaft dieses Panels ist und keine des Modells.
  getPreference: (paneIdx) => !!(state.searchResults && state.searchResults.visibleByPane[paneIdx]),
  applyVisibility: applySearchResultsVisibility,
  toggle: toggleSearchResultsPanel,
});
