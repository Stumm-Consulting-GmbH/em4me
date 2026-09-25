// 4T-001579 (Epic 3E-000283): Überlauf-Messung und Pull-up-Menüs der
// Statusleiste.
// 4T-001580 (Epic 3E-000283): der Falt-Modus der Einstellung («automatisch»
// oder «immer zusammengeklappt», E2 des Epics) mit Laden, Setzen und
// Fenster-Broadcast; die Einstellungs-Oberfläche selbst liegt in
// `settings/statusbar-settings.js`.
//
// Die Leiste bleibt in jeder Fensterbreite vollständig bedienbar: Reicht der
// Platz nicht, klappen ihre Elemente in ein linkes und ein rechtes
// Pull-up-Menü, statt über den rechten Fensterrand hinauszulaufen.
//
// **Gemessen wird, nicht geschwellt** (E1 des Epics). Eine Pixel-Schwelle wäre
// zwangsläufig falsch, weil die Element-Menge veränderlich ist: eigene
// Kommando-Schaltflächen, ausgeblendete Standard-Schalter, je Sprache andere
// Beschriftungen. Maßgeblich ist `scrollWidth > clientWidth` der Leiste —
// dieselbe Messgröße, mit der schon der abgelöste Kommando-Überlauf gearbeitet
// hat (Muster `updateCommandButtonOverflow` in command-placement.js, dort
// entfallen).
//
// **Kein Schwingen** (Punkt 1 des Lösungsansatzes). Zwei Eigenschaften tragen
// das: Jeder Durchlauf beginnt beim vollen Bestand, das Ergebnis ist damit eine
// Funktion der Breite und nicht des Vorzustands; und der Menü-Knopf wird
// eingeblendet, **bevor** das erste Element seiner Seite verschwindet, sodass
// die nächste Messung seinen Platz mitzählt.
//
// **Reihenfolge des Abbaus** (Punkt 3, E3 und E6): innerhalb einer Zone von
// hinten nach vorn — die DOM-Reihenfolge **ist** die eingestellte
// Anzeige-Reihenfolge, weil `applyPanelButtonOrder` und `renderCommandButtons`
// sie in den DOM schreiben; linke und rechte Zone abwechselnd; die mittlere
// zuletzt, deren Elemente das rechte Menü aufnimmt.
//
// **Der Meldungs-Bereich ist nie Kandidat** (E5). `#statusbar-hint` ist ein
// `span` und liegt zudem absolut über der Leiste; die Kandidaten-Suche sieht
// nur `button` und `select` innerhalb der Zonen und kann ihn deshalb gar nicht
// erfassen.
//
// **Warum eine Beobachtung und keine Aufrufe aus den Nachbar-Modulen.** Die
// Element-Menge der Leiste ändert sich aus vielen Richtungen
// (Erweiterungs-Gates, Ausblend-Liste, Kommando-Platzierung, Wort-Statistik,
// Zoom-Anzeige, Ansichts-Schalter je Reiter). Ein Aufruf je Quelle wäre
// unvollständig und würde zudem einen Import aus `command-placement.js` in
// dieses Modul zurückführen — das ergäbe einen Ordner-Zyklus über die
// eingefrorene Bestands-Komponente (`scripts/ordner-import-ausnahme.json`),
// die technisch nicht wachsen darf. Ein `MutationObserver` auf der Leiste plus
// ein `ResizeObserver` für die Fensterbreite lösen beides: vollständig und
// ohne Gegen-Import.
'use strict';

import { t } from '../i18n.js';

import { api } from './app/api.js';
import { contextMenu } from './app/app-state.js';
import { STATUSBAR_HIDE_TARGETS } from '../../shared/commands/command-placement.js';
// 4T-001765 (Epic 3E-000186): die dritte Sichtbarkeits-Achse der Leiste und
// das Laden ihres Modus. Einseitiger Bezug — jenes Modul kennt dieses nicht
// (kein Gegen-Import zwischen Nachbar-Modulen).
import {
  KLASSE_UNVERFUEGBAR_VERSTECKT,
  initStatusbarUnavailableModeFromStore,
  wendeUnverfuegbarModusAn,
} from './statusbar-availability.js';
import {
  appendContextMenuItem,
  hideContextMenu,
  placeContextMenuAt,
  registerContextMenuCloseHook,
} from './dialogs/context-menu-utils.js';

// Klasse des eingeklappten Zustands. Bewusst eine eigene neben
// `sb-user-hidden`: Beide Zustände gelten unabhängig voneinander, denn ein vom
// Anwender ausgeblendetes Element wandert nicht ins Menü (AK10), ein
// eingeklapptes schon.
const KLASSE_EINGEKLAPPT = 'sb-collapsed';

// 4T-001580 (E2 des Epics): Die beiden Werte der Einstellung. `auto` ist die
// Vorgabe und klappt nur bei gemessenem Platzmangel zusammen; `always` hält
// die Schaltflächen unabhängig von der Breite in den beiden Menüs. Ein
// dritter Wert «nie» ist ausgeschlossen, weil er den mit diesem Epic
// behobenen Mangel wiederherstellte. Der Meldungs-Bereich bleibt in beiden
// Zuständen sichtbar (E5) — er ist kein Kandidat, siehe Modul-Kopf.
export const STATUSBAR_COLLAPSE_AUTO = 'auto';
export const STATUSBAR_COLLAPSE_ALWAYS = 'always';
export const STATUSBAR_COLLAPSE_MODES = [STATUSBAR_COLLAPSE_AUTO, STATUSBAR_COLLAPSE_ALWAYS];
export const STATUSBAR_COLLAPSE_MODE_KEY = 'statusbar.collapseMode';

// Ansichts-Schalter ohne Eintrag in der Ausblend-Liste: Mindmap, Canvas und
// Tafel kamen später hinzu. Ihre Kurznamen kommen aus dem Ansichtsmenü, damit
// keine zweite Beschriftungs-Liste entsteht.
const ZUSATZ_ANSICHTEN = [
  ['mindmap', 'menu.view.mindmap'],
  ['canvas', 'menu.view.canvas'],
  // 4T-001847 (Epic 3E-000110): der siebte Modus, aus demselben Grund hier.
  ['kanban', 'menu.view.kanban'],
];

// Je Seite die aktuell eingeklappten Elemente in Leisten-Reihenfolge;
// Neuaufbau bei jedem Durchlauf. Behälter statt neu zugewiesener Arrays, damit
// ihre Identität stabil bleibt.
const eingeklappt = { links: [], rechts: [] };

// 4T-001580: Laufzeit-Wahrheit des Fensters. Bis
// `initStatusbarCollapseModeFromStore()` gelaufen ist, gilt die Vorgabe.
let faltModus = STATUSBAR_COLLAPSE_AUTO;

let geplant = false;
let amFalten = false;
let beobachter = null;
let offenerKnopf = null;
let beschriftungsKeys = null;

// --- DOM-Zugriffe ----------------------------------------------------------------

function leisteEl() {
  return document.querySelector('footer.statusbar');
}

function knopfEl(seite) {
  return document.getElementById(
    seite === 'links' ? 'btn-statusbar-collapse-left' : 'btn-statusbar-collapse-right',
  );
}

// Ein Element ist Kandidat, wenn es überhaupt in der Leiste steht: Das
// `hidden`-Attribut tragen die Erweiterungs-Gates sowie Wort-Statistik und
// Zoom-Anzeige in eigener Verwaltung, die Klasse `sb-user-hidden` die
// Ausblend-Liste des Anwenders (AK10 — was ausgeblendet ist, erscheint auch im
// Menü nicht). Der eigene Eingeklappt-Zustand zählt ausdrücklich NICHT dazu,
// sonst käme ein eingeklapptes Element nie zurück.
//
// 4T-001765 (Epic 3E-000186): Dritter Ausschluss aus derselben Erwägung wie
// der zweite — die Klasse `sb-unavailable-hidden` trägt den Zustand «nicht
// aktivierbar und ausgeblendet». Ohne ihn wanderte ein ausgeblendeter Schalter
// in ein Pull-up-Menü und tauchte dort wieder auf; die Messung rechnet so mit
// der verkleinerten Element-Menge (AK6 jenes Tasks).
function kandidatenIn(zonenSelektor) {
  const zone = document.querySelector(zonenSelektor);
  if (!zone) return [];
  return [...zone.querySelectorAll('button, select')].filter(
    (el) =>
      !el.classList.contains('statusbar-collapse-toggle') &&
      !el.hidden &&
      !el.classList.contains('sb-user-hidden') &&
      !el.classList.contains(KLASSE_UNVERFUEGBAR_VERSTECKT),
  );
}

function sammleZonen() {
  return {
    links: kandidatenIn('.statusbar-left'),
    mitte: kandidatenIn('.statusbar-center'),
    rechts: kandidatenIn('.statusbar-right'),
  };
}

// --- Abbau-Reihenfolge (reine Funktion) ------------------------------------------

/**
 * Baut die Reihenfolge, in der die Elemente der Leiste ins Menü wandern.
 *
 * @param {{links: any[], mitte: any[], rechts: any[]}} zonen Elemente je Zone
 *   in Anzeige-Reihenfolge (die DOM-Reihenfolge der Leiste).
 * @returns {{element: any, ziel: 'links'|'rechts'}[]} Abbau-Reihenfolge mit dem
 *   aufnehmenden Menü je Element.
 */
export function abbauReihenfolge(zonen) {
  const quelle = zonen || {};
  const links = [...(quelle.links || [])].reverse();
  const rechts = [...(quelle.rechts || [])].reverse();
  const mitte = [...(quelle.mitte || [])].reverse();
  const plan = [];
  // Links und rechts wechseln sich ab, beginnend links (Punkt 3 nennt die
  // linke Zone zuerst). Würde eine Seite zuerst vollständig geräumt, stünde
  // sie leer, während die andere noch voll ist — bei 17 Elementen links gegen
  // 7 rechts ein deutlich sichtbares Ungleichgewicht.
  for (let i = 0; i < Math.max(links.length, rechts.length); i++) {
    if (i < links.length) plan.push({ element: links[i], ziel: 'links' });
    if (i < rechts.length) plan.push({ element: rechts[i], ziel: 'rechts' });
  }
  // E3: Die mittlere Zone trägt die am häufigsten gebrauchten Schalter und
  // klappt deshalb zuletzt; ihre Elemente nimmt das rechte Menü auf.
  for (const element of mitte) plan.push({ element, ziel: 'rechts' });
  return plan;
}

// --- Beschriftung eines Elements -------------------------------------------------

// Kurznamen der Standard-Elemente aus dem Hide-Ziel-Modell — dieselbe Quelle,
// aus der auch die Ausblend-Liste ihre Beschriftungen nimmt (keine zweite
// Pflege-Liste). Einmal je Sitzung aufgelöst, weil die Elemente statisch in
// index.html stehen.
function labelKeyFuer(el) {
  if (!beschriftungsKeys) {
    beschriftungsKeys = new Map();
    for (const ziel of STATUSBAR_HIDE_TARGETS) {
      const treffer = ziel.elementId
        ? document.getElementById(ziel.elementId)
        : document.querySelector(ziel.selector);
      if (treffer) beschriftungsKeys.set(treffer, ziel.labelKey);
    }
    for (const [ansicht, key] of ZUSATZ_ANSICHTEN) {
      const btn = document.querySelector(`.view-toggle .view-btn[data-view="${ansicht}"]`);
      if (btn) beschriftungsKeys.set(btn, key);
    }
  }
  return beschriftungsKeys.get(el) || null;
}

// Rückfall-Kette: Kurzname aus dem Modell, sonst der Tooltip (nutzerdefinierte
// Kommando-Buttons tragen dort Anzeigename plus Kommando-Label), sonst das
// Vorlese-Label.
function beschriftung(el) {
  const key = labelKeyFuer(el);
  if (key) return t(key);
  if (el.title) return el.title;
  return el.getAttribute('aria-label') || '';
}

// Kennung eines Elements für die Selektor-Kennung seines Menü-Eintrags. Die
// Ansichts-Schalter tragen keine Element-ID; ihr Präfix `view:` ist dasselbe
// wie im Hide-Ziel-Modell und verhindert eine Verwechslung mit einer ID.
function eintragsKennung(el) {
  if (el.id) return el.id;
  if (el.dataset.view) return `view:${el.dataset.view}`;
  if (el.dataset.commandId) return el.dataset.commandId;
  return el.tagName.toLowerCase();
}

// Ein eingeklapptes Element, dessen Wirkung selbst ein Popup am gemeinsamen
// `#context-menu` ist (im Bestand die Dokument-Historie), setzt dieses Popup
// an sein eigenes Rechteck — und das ist im eingeklappten Zustand leer. Die
// Viewport-Klemmung von `placeContextMenuAt` schob das Popup dann in die
// linke obere Fenster-Ecke: Inhalt und Wirkung vollständig, die Lage nicht,
// und damit AK6 («wirkt wie in der Leiste») nur halb erfüllt.
//
// Die Behebung bleibt in diesem Modul, weil der Sonderfall hier entsteht: Das
// fremde Popup weiß nichts davon, dass sein Anker gerade nicht sichtbar ist.
// Geprüft wird genau das — ein offenes Menü und ein Anker ohne Fläche —, und
// gesetzt wird das Popup dann an den Pull-up-Knopf, also an die Stelle, an der
// der Anwender geklickt hat. Die Regel gilt generisch für jedes eingeklappte
// Element mit anker-gebundenem Popup, nicht nur für die Historie.
//
// Der synchrone Fall ist der des Bestands (`showHistoryMenu` baut sein Menü im
// Klick-Handler auf). Öffnete ein Element sein Popup erst später, greift die
// Ausrichtung nicht; dann bleibt es bei der Lage, die es selbst setzt.
function richteFremdesPopupAus(anker, knopf) {
  if (!knopf || contextMenu.hidden) return;
  const ankerRect = anker.getBoundingClientRect();
  if (ankerRect.width > 0 || ankerRect.height > 0) return;
  platziereUeberKnopf(knopf);
}

// Ein Menü-Eintrag trägt Beschriftung und Zustand des Elements und löst
// dieselbe Wirkung aus (AK6): Geklickt wird das Element selbst, damit es bei
// einem einzigen Weg bleibt und kein Handler ein zweites Mal verdrahtet wird.
function eintragFuer(el, seite) {
  const dataId = `statusbar-overflow-${eintragsKennung(el)}`;
  const label = beschriftung(el);
  // Ein Auswahl-Feld — im Bestand die Sprach-Wahl — hat keine Klick-Wirkung.
  // Seine Optionen werden zum Untermenü, damit die Wirkung dieselbe bleibt.
  if (el.tagName === 'SELECT') {
    return {
      label,
      dataId,
      submenu: [...el.options].map((option) => ({
        label: option.textContent,
        dataId: `${dataId}-${option.value}`,
        checked: option.value === el.value,
        action: () => {
          el.value = option.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
      })),
    };
  }
  // Das Zustands-Häkchen bekommen nur die Umschalter der Leiste; bei den
  // übrigen (Wort-Statistik, Zoom-Anzeige) reservierte es eine Spalte ohne
  // Aussage.
  const istUmschalter = el.classList.contains('btn-toggle') || el.classList.contains('view-btn');
  return {
    label,
    dataId,
    ...(istUmschalter ? { checked: el.classList.contains('active') } : {}),
    disabled: el.disabled === true,
    action: () => {
      el.click();
      richteFremdesPopupAus(el, knopfEl(seite));
    },
  };
}

// Setzt das gemeinsame Menü als Pull-up über den Knopf: Erst wird es an einer
// Hilfs-Position gemessen, dann so gesetzt, dass seine Unterkante über der
// Oberkante des Knopfes liegt und es ihn nicht verdeckt; am rechten Knopf
// schließt es rechtsbündig ab. Befund des Product Owners bei der Abnahme am
// 2026-09-14: Mit der Oberkante knapp über dem Knopf gesetzt, klemmte die
// Viewport-Begrenzung das Menü nach oben und schob es genau über den Knopf.
const PULLUP_ABSTAND = 4;
function platziereUeberKnopf(knopf) {
  const rect = knopf.getBoundingClientRect();
  placeContextMenuAt(contextMenu, rect.left, 0);
  const menue = contextMenu.getBoundingClientRect();
  const rechts = knopf.id === 'btn-statusbar-collapse-right';
  let x = rechts ? rect.right - menue.width : rect.left;
  if (x + menue.width > window.innerWidth) x = window.innerWidth - menue.width - PULLUP_ABSTAND;
  if (x < PULLUP_ABSTAND) x = PULLUP_ABSTAND;
  let y = rect.top - menue.height - PULLUP_ABSTAND;
  if (y < PULLUP_ABSTAND) y = PULLUP_ABSTAND;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

// --- Pull-up-Menü ----------------------------------------------------------------

// Das Menü nutzt das gemeinsame `#context-menu`: Damit gelten die vorhandenen
// Schließ-Wege (Klick außerhalb, Escape) ohne eigenen Code. Der Besitz-Merker
// `offenerKnopf` wird deshalb in der gemeinsamen Schließ-Funktion
// zurückgesetzt und nicht nur auf dem eigenen Weg (Oberflächen-Leitlinie zum
// geteilten Element) — sonst behielte ein Knopf `aria-expanded="true"`,
// nachdem ein fremdes Menü das Element übernommen hat.
registerContextMenuCloseHook(() => {
  if (offenerKnopf) offenerKnopf.setAttribute('aria-expanded', 'false');
  offenerKnopf = null;
});

function zeigeMenue(seite, knopf) {
  const eintraege = eingeklappt[seite];
  if (eintraege.length === 0) return;
  contextMenu.innerHTML = '';
  for (const { element } of eintraege) {
    appendContextMenuItem(contextMenu, eintragFuer(element, seite));
  }
  platziereUeberKnopf(knopf);
  knopf.setAttribute('aria-expanded', 'true');
  offenerKnopf = knopf;
}

// --- Messung und Faltung ---------------------------------------------------------

function laeuftUeber(leiste) {
  return leiste.scrollWidth > leiste.clientWidth;
}

/**
 * Stellt den vollen Bestand her und klappt so lange ein, bis die Leiste
 * passt.
 *
 * @param {boolean} alleEinklappen Modus «immer zusammengeklappt» (4T-001580):
 *   Ist der Wert wahr, wird unabhängig von der Breite der gesamte Plan
 *   eingeklappt. Die Mess-Logik bleibt davon unberührt, sie entscheidet in
 *   diesem Zustand nur nicht mehr über die Sichtbarkeit. Den Wert liefert
 *   `falteJetzt()` aus dem Falt-Modus der Einstellung.
 */
function falte(alleEinklappen) {
  const leiste = leisteEl();
  const knoepfe = { links: knopfEl('links'), rechts: knopfEl('rechts') };
  if (!leiste || !knoepfe.links || !knoepfe.rechts) return;
  const plan = abbauReihenfolge(sammleZonen());
  // Voller Bestand als Ausgangspunkt jedes Durchlaufs — die Grundlage der
  // Schwing-Freiheit (siehe Modul-Kopf).
  for (const { element } of plan) element.classList.remove(KLASSE_EINGEKLAPPT);
  knoepfe.links.hidden = true;
  knoepfe.rechts.hidden = true;
  eingeklappt.links.length = 0;
  eingeklappt.rechts.length = 0;
  for (const eintrag of plan) {
    if (!alleEinklappen && !laeuftUeber(leiste)) break;
    // Der Knopf erscheint vor dem Einklappen, damit die nächste Messung
    // seinen Platz mitzählt; jedes Menü erscheint nur, wenn es mindestens ein
    // Element trägt (Punkt 2).
    knoepfe[eintrag.ziel].hidden = false;
    eintrag.element.classList.add(KLASSE_EINGEKLAPPT);
    // `unshift`, damit das Menü seine Einträge in Leisten-Reihenfolge führt
    // und sich als Fortsetzung der Leiste liest.
    eingeklappt[eintrag.ziel].unshift(eintrag);
  }
}

function falteJetzt() {
  amFalten = true;
  try {
    // 4T-001580: Die Einstellung entscheidet allein darüber, ob der ganze Plan
    // eingeklappt wird; die Messung selbst bleibt unberührt und läuft weiter.
    falte(faltModus === STATUSBAR_COLLAPSE_ALWAYS);
  } finally {
    amFalten = false;
    // Die eigenen Klassen- und Attribut-Änderungen haben Datensätze erzeugt.
    // Sie werden verworfen, damit die Beobachtung nicht auf sich selbst
    // reagiert und in eine Endlos-Kette läuft.
    if (beobachter) beobachter.takeRecords();
  }
}

// Plant einen Mess-Durchlauf auf das nächste Bild. Mehrere Auslöser innerhalb
// eines Bildes werden zu einem Durchlauf zusammengefasst.
function planeStatusleistenFaltung() {
  if (amFalten || geplant) return;
  geplant = true;
  requestAnimationFrame(() => {
    geplant = false;
    falteJetzt();
  });
}

// --- Falt-Modus der Einstellung (4T-001580) --------------------------------------

/**
 * Bringt einen beliebigen (auch defekten) Stand auf einen der beiden Werte.
 *
 * Jeder Wert außer `always` fällt auf die Vorgabe zurück — dieselbe
 * Rückfall-Regel wie beim Höhen-Modell der Seitenleiste
 * (`setPanelHeightMode` in sidebar-layout.js).
 *
 * @param {*} wert Rohwert aus Speicher, Broadcast oder Einstellungs-Entwurf.
 * @returns {'auto'|'always'} Gültiger Modus.
 */
export function normalisiereFaltModus(wert) {
  return wert === STATUSBAR_COLLAPSE_ALWAYS ? STATUSBAR_COLLAPSE_ALWAYS : STATUSBAR_COLLAPSE_AUTO;
}

export function getStatusbarCollapseMode() {
  return faltModus;
}

/**
 * App-Start: persistierten Modus laden (Muster `initPanelToggleOrderFromStore`
 * in sidebar-layout.js).
 *
 * Läuft als erster Schritt von `initStatusbarOverflow()`, damit die erste
 * Messung bereits den gewählten Modus sieht und die Leiste nicht sichtbar von
 * ausgeklappt nach eingeklappt springt. Ein fehlender oder defekter Stand
 * ergibt die Vorgabe `auto` (AK2). Eigene exportierte Funktion, damit der
 * Auslieferungs-Zustand ohne Fenster prüfbar bleibt.
 *
 * @returns {Promise<'auto'|'always'>} Der geladene Modus.
 */
export async function initStatusbarCollapseModeFromStore() {
  let gespeichert;
  try {
    gespeichert = await api.getSetting(STATUSBAR_COLLAPSE_MODE_KEY);
  } catch (err) {
    console.warn('Falt-Modus der Statusleiste laden fehlgeschlagen:', err);
  }
  faltModus = normalisiereFaltModus(gespeichert);
  return faltModus;
}

/**
 * Modus setzen — normalisiert, faltet neu, benachrichtigt offene
 * Einstellungs-Entwürfe und persistiert.
 *
 * `persist: false` für den Empfang des Fenster-Broadcasts
 * (`statusbarCollapseMode:changed`), damit der Speicher nicht doppelt
 * geschrieben wird; ein unveränderter Modus ist ein No-op (Muster
 * `setPanelHeightMode`/`setPanelToggleOrder`).
 *
 * @param {*} wert Gewünschter Modus.
 * @param {{persist?: boolean}} [opts] Persistierung steuern.
 * @returns {Promise<'auto'|'always'>} Der wirksame Modus.
 */
export async function setStatusbarCollapseMode(wert, { persist = true } = {}) {
  const naechster = normalisiereFaltModus(wert);
  if (naechster === faltModus) return faltModus;
  faltModus = naechster;
  // Sofort neu falten: Die Wirkung tritt ohne Neustart ein (AK5). Ein
  // geplanter Durchlauf wäre hier nicht gleichwertig — bei `always` ändert
  // sich weder Breite noch Bestand, die Beobachter feuern also nicht.
  falteJetzt();
  document.dispatchEvent(new CustomEvent('scg:statusbar-collapse-mode-changed'));
  if (persist) {
    try {
      await api.setSetting(STATUSBAR_COLLAPSE_MODE_KEY, naechster);
    } catch (err) {
      console.warn('Falt-Modus der Statusleiste speichern fehlgeschlagen:', err);
    }
  }
  return faltModus;
}

// --- Init ------------------------------------------------------------------------

/**
 * Verdrahtet Menü-Knöpfe, Breiten- und Bestands-Beobachtung und bringt die
 * Leiste einmal auf Stand. Einmalig aus `init()` von app-init.js, nach dem
 * Aufbau der Leiste (Panel-Reihenfolge, Kommando-Platzierung, Hide-Liste).
 *
 * 4T-001580: Der persistierte Falt-Modus wird hier geladen und nicht als
 * eigener Schritt in `init()` von app-init.js, wo die Nachbar-Module ihren
 * Store-Stand holen. Der Grund ist gemessen und nicht gewählt: `app-init.js`
 * ist der Verdrahtungs-Knoten des Anzeige-Prozesses und stand mit `4T-001579`
 * bei genau 500 Code-Zeilen, also auf seinem Budget
 * (`scripts/lint-datei-groessen.js`); jede weitere Zeile dort ist eine
 * Budget-Überschreitung, und die Antwort darauf ist der Schnitt jenes Knotens
 * und keine Folge von Ausnahmen. Der Modus gehört ohnehin in dieses Modul,
 * und die Ladung vor der Verdrahtung ist die Zusicherung, dass die erste
 * Messung ihn schon sieht. Deshalb ist der Aufruf asynchron; `init()` wartet
 * ihn ab.
 */
export async function initStatusbarOverflow() {
  await initStatusbarCollapseModeFromStore();
  // 4T-001765 (Epic 3E-000186): Der Modus für nicht aktivierbare Schalter
  // wird hier mitgeladen und nicht in `init()` von app-init.js — dieselbe
  // Begründung wie beim Falt-Modus darüber (Datei-Budget des
  // Verdrahtungs-Knotens), und die erste Messung sieht ihn so ebenfalls schon.
  // Der Nachzug danach gilt dem Fall, dass die Leiste ihren Zustand bereits
  // gesetzt hat, bevor der Modus geladen war; lief der erste Sync noch nicht,
  // setzt er beides selbst und der Aufruf ist ein No-op.
  await initStatusbarUnavailableModeFromStore();
  wendeUnverfuegbarModusAn();
  const leiste = leisteEl();
  if (!leiste) return;
  for (const seite of ['links', 'rechts']) {
    const knopf = knopfEl(seite);
    if (!knopf) continue;
    knopf.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      zeigeMenue(seite, e.currentTarget);
    });
  }
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => planeStatusleistenFaltung()).observe(leiste);
  }
  if (typeof MutationObserver === 'function') {
    beobachter = new MutationObserver(() => planeStatusleistenFaltung());
    beobachter.observe(leiste, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'disabled'],
    });
  }
  // Sprachwechsel ändert die Breite der Beschriftungen und damit den Überlauf.
  document.addEventListener('i18n-language-changed', () => planeStatusleistenFaltung());
  falteJetzt();
}
