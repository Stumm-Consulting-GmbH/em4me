// 4T-001847 (Epic 3E-000110): Andock-Stelle der Tafel-Ansicht.
// 4T-001848 (Epic 3E-000110): dazu die Zeichnung selbst.
//
// **Die eine Stelle, an der die Tafel den Renderer-Zustand berührt.** Die
// Zeichnung (`kanban-tafel.js`) kennt weder `api` noch `i18n` noch den
// Fenster-Zustand; alles davon wird hier gereicht — dasselbe Muster wie bei
// `canvas-pane.js` und aus demselben Grund.
//
// **Warum der Zugang hereingereicht und nicht importiert wird** (Muster
// `canvas-pane.js`): Der Fenster-Zustand gehört `app-state.js`; ein Import von
// dort zöge diesen Ordner in den großen Datei-Zyklus des Renderers, den der
// Ordner-Import-Wächter als Ratsche eingefroren hat. `api` und `i18n` bilden
// keinen Kreis und bleiben gewöhnliche Importe.
//
// **Gezeichnet wird aus dem Puffer, nie von der Platte** (Regel der
// Puffer-Aktualität): Die Quelle ist `tab.content` des geöffneten Dokuments,
// also derselbe Stand, den der Editor zeigt. Der verzögerte Nachzug hält sie
// beim Tippen aktuell.
'use strict';

import { intlLocale, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { leseTafel } from '../../../shared/kanban/kanban-core.js';
import {
  einstellungenAusModell,
  setzeTafelEinstellung,
} from '../../../shared/kanban/kanban-einstellungen.js';
import { wirksameEinstellungen } from '../../../shared/kanban/kanban-wirksam.js';
import { zeigeTafelEinstellungsDialog } from './kanban-einstellungs-dialog.js';
import { dokumentIstLeer } from '../../../shared/commands/command-availability.js';
import { feldwahlAus } from '../../../shared/kanban/kanban-angaben.js';
import { ladeAngaben } from './kanban-angaben.js';
import { istKanbanErweiterungAn, istTafelModusVerfuegbar } from './kanban-modus.js';
import { createKartenBedienung, zeilenAenderung } from './kanban-bedienung.js';
import { erzeugeNotizAusKarte, notizMoeglich, standardWerkzeuge } from './kanban-notiz-erzeugen.js';
import { createSpaltenBedienung } from './kanban-spalten.js';
import { createZiehBedienung } from './kanban-ziehen.js';
import { tagVerweisAn } from './kanban-tags.js';
import { kartenVerweisAn, markiereDatumsVerweise } from './kanban-verweise.js';
import {
  initTafelSuche,
  inFilterLeiste,
  nachTafelZeichnung,
  pruefeTafelSuche,
} from './kanban-suche.js';
import { lokalesDatum } from './kanban-marker.js';
import {
  kanbanAnzeigeStand,
  ladeKanbanAnzeige,
  setzeKanbanAnzeigeBeiWechsel,
} from './kanban-anzeige-schalter.js';
import {
  KARTE_KLASSE,
  merkeZustand,
  stelleZustandHer,
  waehleKarte,
  zeichneTafel,
} from './kanban-tafel.js';

// Takt des verzögerten Nachzugs, gleich dem der Mindmap und der Canvas: Der
// Anwender soll die Antwort als unmittelbar empfinden, ohne dass jeder
// Tastendruck den Abgleich auslöst.
const KANBAN_RENDER_DEBOUNCE_MS = 200;

let umgebung = null;

// Zuletzt gemeldete Verfügbarkeit je Spalte; siehe pruefeVerfuegbarkeit.
const verfuegbar = [];
// 4T-001852: dazu die zuletzt gemeldete Leere des Dokuments je Spalte. Sie
// entscheidet über das Umwandeln in eine Tafel und wechselt beim ersten
// getippten Zeichen.
const leer = [];
const timer = [];
// Stand der letzten Zeichnung je Spalte (Muster paneRenderCache in
// pane-render.js). Ohne ihn liefe bei jedem Takt des Nachzugs eine volle
// Zeichnung samt Render-Aufruf je Karte, auch wenn sich nichts geändert hat.
const gezeichnet = [];
// Container, deren Bedien-Zuhörer bereits hängen. Der Container überlebt jede
// Zeichnung; ein Zuhörer je Zeichnung wäre ein Zuhörer zu viel.
const verdrahtet = new WeakSet();
// 4T-001849: Die Karten-Bedienung je Spalte. Sie hängt am Container und lebt
// deshalb genauso lange wie er; der Zustand einer angefangenen Handlung
// (offene Eingabe) überlebt damit jede Zwischen-Zeichnung.
const bedienungen = [];
// 4T-001850: Das Verschieben per Maus je Spalte, aus demselben Grund am
// Container und mit derselben Lebensdauer wie die Karten-Bedienung.
const ziehBedienungen = [];
// 4T-001851: Die Spalten-Bedienung je Spalte, aus demselben Grund am Container.
const spaltenBedienungen = [];
// 4T-001955: Die wirksamen Einstellungen der zuletzt gezeichneten Tafel je
// Spalte — Tafel vor Vorgabe, aus demselben Stand wie die Zeichnung.
const wirksamJe = [];

// 4T-001848: Der Schritt-Satz des erzeugten Teilbaums. Ohne ihn bliebe auf der
// Karte alles inert, was die Render-Kette erst befüllt oder bedienbar macht
// (Wächter 4T-001130). Er wird **hereingereicht statt importiert**, nach dem
// Muster `registriereCanvasTeilbaumSchritte` und aus demselben Grund: Ein
// Import von `render-mermaid.js` zöge diesen Ordner in den eingefrorenen
// Datei-Zyklus des Renderers. Ohne Registrierung bleibt die Karte
// unverarbeitet statt zu scheitern — der Aufrufer ist auch der jsdom-Prüffall,
// der ohne Preload läuft.
let teilbaumSchritte = null;

/** Reicht den Schritt-Satz des erzeugten Teilbaums herein. */
export function registriereKanbanTeilbaumSchritte(fn) {
  if (typeof fn === 'function') teilbaumSchritte = fn;
}

/**
 * Verdrahtet die Tafel-Ansicht mit dem Fenster-Zustand.
 *
 * @param {object} zugang
 * @param {Function} zugang.getPaneEls (paneIdx) => Pane-Elemente.
 * @param {Function} zugang.aktivesDokument (paneIdx) => geöffnetes Dokument oder null.
 * @param {Function} [zugang.beiVerfuegbarkeitsWechsel] (paneIdx, jetzt) => void.
 * @param {Function} [zugang.bereichsWurzel] () => string|null (4T-001955). Die
 *   Wurzel des geöffneten Bereichs, gegen die der Zielordner einer Tafel
 *   relativ gespeichert wird.
 * @param {Function} [zugang.istAenderbar] (paneIdx) => boolean (4T-001848). Sagt,
 *   ob das Dokument der Spalte gerade geschrieben werden darf. Hereingereicht
 *   statt ermittelt, weil die Antwort am Reiter-Zustand und an der EditorView
 *   der Spalte hängt und beide dem Fenster-Zustand gehören.
 * @param {Function} [zugang.schreibeDokument] (paneIdx, {vonZeile, bisZeile, text})
 *   => boolean (4T-001849). Ersetzt den Zeilen-Bereich im Editor der Spalte als
 *   **eine** Transaktion. Hereingereicht statt importiert, weil ein Import von
 *   `editor.js` einen Zyklus editor -> kanban-pane -> editor bildete.
 * @param {Function} [zugang.statusUmschalten] (paneIdx, zeilenNummer) => boolean
 *   (4T-001849). Der Statuswechsel der Anwendung samt Automatik-Daten und
 *   Wiederholung; `zeilenNummer` ist 1-basiert wie im Editor. Hereingereicht
 *   aus demselben Grund wie der Schreibweg: Die Kette lebt am Editor.
 * @param {Function} [zugang.statusAufText] (text, zeilenNummer) => {text}|null
 *   (4T-001850). Derselbe Statuswechsel wie `statusUmschalten`, aber als
 *   Text-Rechnung statt als eigener Schreibvorgang: Beim Verschieben in eine
 *   Spalte, die abhakt, müssen beide Änderungen **eine** Transaktion sein.
 *   `zeilenNummer` ist 1-basiert wie im Editor.
 * @param {Function} [zugang.rueckgaengig] (paneIdx) => boolean (Nachtrag zu
 *   4T-001849 vom 2026-09-21). Ein Schritt zurück in der Historie der Spalte.
 *   Der Tafel-Modus blendet den Editor aus wie der Canvas-Modus; sein
 *   Tastenkürzel-Verzeichnis ist damit unerreichbar, und `Strg+Z` käme sonst
 *   nirgends an. Hereingereicht aus demselben Grund wie der Schreibweg.
 * @param {Function} [zugang.wiederholen] (paneIdx) => boolean.
 * @param {Function} [zugang.zeigeKontextmenue] (paneIdx, {x, y, eintraege})
 *   => void (4T-001849). Baut das gemeinsame Kontextmenü des Fensters; der
 *   Kanban-Ordner darf die Menü-Helfer nicht importieren, weil sie am
 *   Fenster-Zustand hängen.
 * @param {Function} [zugang.schliesseKontextmenue] () => void.
 * @param {Function} [zugang.bestaetigeSpaltenLoeschung] (paneIdx, {titel, anzahl})
 *   => Promise<boolean> (4T-001851). Die Rückfrage vor dem Löschen einer **nicht
 *   leeren** Spalte über den Rückfrage-Dialog des Bestands. Hereingereicht, weil
 *   der Dialog im Hauptprozess lebt und der Kanban-Ordner die Prozess-Brücke
 *   nicht importieren darf. Fehlt der Rückruf, wird eine nicht leere Spalte
 *   nicht gelöscht: Ohne Rückfrage-Weg gibt es die zugesagte Rückfrage nicht.
 */
export function initKanbanPane(zugang) {
  umgebung = zugang || null;
  gezeichnet.length = 0;
  bedienungen.length = 0;
  ziehBedienungen.length = 0;
  spaltenBedienungen.length = 0;
  wirksamJe.length = 0;
  tagesJournalBekannt.length = 0;
  // 4T-001904: Die Anzeige-Schalter der Tafel. Ein Wechsel — aus Menü,
  // Kommando-Palette oder einem anderen Fenster — zeichnet sofort alle offenen
  // Tafeln neu (AK3). Gelesen wird die gespeicherte Einstellung einmal beim
  // Start; ein Fehlschlag lässt die Vorgabe stehen.
  setzeKanbanAnzeigeBeiWechsel(zeichneAlleKanbanNeu);
  ladeKanbanAnzeige().catch(() => {});
  // 4T-001907: Die Suche der Tafel fragt über diesen Weg, ob im Bereich gerade
  // die Tafel-Ansicht offen ist; den Fenster-Zustand kennt sie selbst nicht.
  initTafelSuche({
    t,
    lage: (paneIdx) => {
      const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
      if (!tab || tab.viewMode !== 'kanban') return null;
      const els = umgebung.getPaneEls(paneIdx);
      return els && els.kanbanEl ? { tab, container: els.kanbanEl } : null;
    },
  });
}

/**
 * Zeichnet jede bereits gezeichnete Tafel neu — der Weg eines Anzeige-Schalters
 * (4T-001904). Eine Spalte, die gerade keine Tafel zeigt, bleibt unberührt und
 * liest den Schalter bei ihrer nächsten Zeichnung ohnehin frisch.
 */
export function zeichneAlleKanbanNeu() {
  for (const paneIdx of gezeichnet.keys()) renderKanban(paneIdx);
}

// 4T-001904: Ein Tag der Karte führt ins Tag-Panel, genau wie ein Tag der
// Lese-Ansicht. Gerufen wird **derselbe** Weg (`activateLink`, Zweig `#tag:`)
// und nicht eine Kopie seiner Logik. Laufzeit-Import aus demselben Grund wie
// beim Hinweis darüber und bei der Canvas-Fläche: Ein statischer Bezug auf
// `views/` zöge diesen Ordner in den eingefrorenen Datei-Zyklus des Renderers.
// 4T-001958: Seither nimmt jeder Verweis der Karte diesen Weg, mit den Angaben,
// die auch die Lese-Ansicht übergibt (Wiki-Verweis, Basis einer Einbettung).
function oeffneVerweis(paneIdx, href, { wiki = false, basis = null } = {}) {
  import('../views/link-navigation.js')
    .then((modul) =>
      basis
        ? modul.activateLink(paneIdx, href, wiki, basis)
        : modul.activateLink(paneIdx, href, wiki),
    )
    .catch(() => {});
}

// 4T-001958 (Story 4S-000986): Der Journal-Eintrag eines Tages, über den Weg
// des Journals samt Auswahl bei mehreren Tages-Journalen. Laufzeit-Import aus
// demselben Grund wie beim Verweis darüber.
function oeffneTagesnotiz(datum) {
  import('../calendar/journals.js').then((modul) => modul.oeffneTagesnotiz(datum)).catch(() => {});
}

// 4T-001958: Gibt es im Bereich ein Tages-Journal? Die letzte Antwort je Spalte
// wird sofort nach dem Zeichnen angewandt, damit der Verweis-Stil beim Tippen
// nicht flackert; die frische Antwort kommt danach. Der Zähler verwirft eine
// Antwort, die von einer jüngeren Anfrage überholt ist.
const tagesJournalBekannt = [];
const tagesJournalAnfrage = [];
let tagesJournalZaehler = 0;

function aktualisiereDatumsVerweise(paneIdx, container, wirksam) {
  const an = !!(wirksam && wirksam.datumZurTagesnotiz && wirksam.datumZurTagesnotiz.wert === true);
  const nummer = ++tagesJournalZaehler;
  tagesJournalAnfrage[paneIdx] = nummer;
  const hinweis = t('kanban.termin.tagesnotiz');
  markiereDatumsVerweise(container, an && tagesJournalBekannt[paneIdx] === true, hinweis);
  if (!an) return;
  import('../calendar/journals.js')
    .then((modul) => modul.tagesJournaleStill())
    .then((journale) => {
      if (tagesJournalAnfrage[paneIdx] !== nummer) return;
      tagesJournalBekannt[paneIdx] = Array.isArray(journale) && journale.length > 0;
      markiereDatumsVerweise(container, tagesJournalBekannt[paneIdx], hinweis);
    })
    .catch(() => {});
}

// 4T-001903: Der Kalender-Wähler der Anwendung — derselbe, den Aufgaben-Dialog
// und Aufgaben-Abfrage öffnen. Laufzeit-Import aus demselben Grund wie beim
// Tag-Verweis: Ein statischer Bezug zöge diesen Ordner in den eingefrorenen
// Datei-Zyklus. Ein Fehlschlag gilt als Abbruch des Wählers.
function waehleTermin(optionen) {
  return import('../calendar/date-picker.js')
    .then((modul) => modul.showDateTimePicker(optionen))
    .catch(() => null);
}

// Einen Rückruf des Zugangs aufrufen, wenn es ihn gibt (Muster `rufeZugang`
// der räumlichen Arbeitsfläche). Fehlt er, ist die Antwort «nichts geschehen».
function rufeZugang(name, ...args) {
  if (!umgebung || typeof umgebung[name] !== 'function') return false;
  return umgebung[name](...args);
}

// 4T-001849: Der Hinweis in der Statusleiste kommt über einen Laufzeit-Import,
// wie bei der räumlichen Arbeitsfläche und aus demselben Grund: Ein statischer
// Bezug auf `views.js` bildete einen Ordner-übergreifenden Zyklus — jenes Modul
// ruft `renderKanban` —, und der Ordner-Import-Wächter ist eine Ratsche. Ein
// Fehlschlag bleibt folgenlos: Der Hinweis ist Beiwerk, das Verwerfen der
// Änderung ist schon geschehen.
function zeigeHinweis(schluessel) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(schluessel, { error: true, duration: 2500 }))
    .catch(() => {});
}

/**
 * Stellt den neuen Text der Tafel in das Dokument — als **eine** Transaktion
 * und damit als ein Rückgängig-Schritt (AK5).
 *
 * **Der Abgleich vor der Übernahme** ist die Vorsichtsregel der räumlichen
 * Arbeitsfläche (`schreibeFlaeche` in canvas-pane.js) und gilt hier für das
 * **ganze** Dokument statt für einen Abschnitt darin: Bei einer Tafel ist das
 * Dokument die Fläche. Weicht der Stand von dem ab, auf dem die Zeichnung
 * beruht, wird die Änderung **verworfen** statt fremde Arbeit zu überschreiben
 * (AK6); danach zeichnet die Tafel aus dem Dokument neu, damit die Anzeige
 * nicht auf einem Stand stehen bleibt, den es nirgends gibt.
 *
 * Geschrieben wird nur der Zeilen-Bereich, der sich unterscheidet: Eine
 * Transaktion über das ganze Dokument setzte Schreibmarke und Faltungen des
 * Editors zurück, obwohl sich eine Zeile geändert hat.
 *
 * @returns {boolean} `true`, wenn geschrieben wurde.
 */
function schreibeTafelText(paneIdx, { ausgangsstand, text }) {
  if (!umgebung || typeof umgebung.schreibeDokument !== 'function') return false;
  const tab = umgebung.aktivesDokument(paneIdx);
  if (!tab || typeof tab.content !== 'string' || tab.content !== ausgangsstand) {
    zeigeHinweis('kanban.verworfen');
    renderKanban(paneIdx);
    return false;
  }
  const aenderung = zeilenAenderung(ausgangsstand, text);
  if (!aenderung) return false;
  const ok = umgebung.schreibeDokument(paneIdx, aenderung) !== false;
  if (!ok) {
    zeigeHinweis('kanban.verworfen');
    renderKanban(paneIdx);
  }
  return ok;
}

/**
 * Schaltet den Status einer Karte über die Status-Kette der Anwendung.
 *
 * Derselbe Ausgangsstands-Abgleich wie beim Schreibweg darüber und aus
 * demselben Grund: Der Weg schreibt über eine **Zeilen-Nummer**, und eine
 * Zeilen-Nummer aus einem anderen Stand zeigt auf eine andere Zeile.
 */
function schalteKartenStatus(paneIdx, { ausgangsstand, zeile }) {
  if (!umgebung || typeof umgebung.statusUmschalten !== 'function') return false;
  const tab = umgebung.aktivesDokument(paneIdx);
  if (!tab || typeof tab.content !== 'string' || tab.content !== ausgangsstand) {
    zeigeHinweis('kanban.verworfen');
    renderKanban(paneIdx);
    return false;
  }
  // Die Zeilen-Nummern des Modells sind 0-basiert, die des Editors 1-basiert.
  return umgebung.statusUmschalten(paneIdx, zeile + 1) !== false;
}

/**
 * Legt eine Karte in der Spalte der gewählten Karte an — der Weg des Kommandos
 * aus Menü und Kommando-Palette (4T-001849).
 *
 * Ohne gewählte Karte entsteht sie in der ersten Spalte: Das Kommando kennt
 * keinen Zeiger und damit keinen Ort, und die erste Spalte ist der Anfang der
 * Tafel. Jede Fehl-Lage wird **gesagt** statt still verworfen (Guard-Muster der
 * räumlichen Arbeitsfläche); ein stiller Fehlschlag wäre für den Nutzer nicht
 * von einem Fehler zu unterscheiden.
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeKanbanKarteAn(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const bedienung = bedienungen[paneIdx];
  if (!tab || tab.viewMode !== 'kanban' || !bedienung) {
    zeigeHinweis('kanban.nurInAnsicht');
    return false;
  }
  if (!istTafelAenderbar(paneIdx)) {
    zeigeHinweis('kanban.nurLesbar');
    return false;
  }
  const spalte = bedienung.gewaehlteSpalte();
  return bedienung.legeAn(spalte == null ? 0 : spalte) !== false;
}

/**
 * Archiviert die gewählte Karte der Tafel — der Weg des Kommandos aus Menü und
 * Kommando-Palette (4T-001906).
 *
 * Dieselben Fehl-Lagen wie beim Anlegen darüber werden gesagt. **Ohne gewählte
 * Karte geschieht nichts:** Anders als eine neue Karte hat das Archivieren ohne
 * Wahl keinen Gegenstand, und eine erste oder letzte Karte zu raten hieße, die
 * falsche aus der Spalte zu nehmen.
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function archiviereKanbanKarte(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const bedienung = bedienungen[paneIdx];
  if (!tab || tab.viewMode !== 'kanban' || !bedienung) {
    zeigeHinweis('kanban.nurInAnsicht');
    return false;
  }
  if (!istTafelAenderbar(paneIdx)) {
    zeigeHinweis('kanban.nurLesbar');
    return false;
  }
  return bedienung.archiviereGewaehlte() !== false;
}

/**
 * «Notiz aus Karte erzeugen…» an der gewählten Karte — der Weg des Kommandos
 * aus der Kommando-Palette (4T-001956). Dieselben Fehl-Lagen wie beim
 * Archivieren darüber werden gesagt; ohne gewählte Karte geschieht nichts.
 *
 * @param {number} paneIdx
 * @returns {boolean|Promise<boolean>}
 */
export function erzeugeKanbanNotiz(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const bedienung = bedienungen[paneIdx];
  if (!tab || tab.viewMode !== 'kanban' || !bedienung) {
    zeigeHinweis('kanban.nurInAnsicht');
    return false;
  }
  if (!istTafelAenderbar(paneIdx)) {
    zeigeHinweis('kanban.nurLesbar');
    return false;
  }
  return bedienung.notizAusGewaehlter();
}

// 4T-001956: Der Ablauf «Notiz aus Karte erzeugen…» für eine Karte der Spalte.
// Er bekommt Pfad der Tafel, Bereichs-Wurzel und die wirksamen Einstellungen
// herein und schreibt über denselben Weg wie jede Bedien-Handlung.
function notizAusKarte(paneIdx, { spalte, karte, modell, ausgangsstand }) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  return erzeugeNotizAusKarte(
    {
      karte: modell,
      spalte,
      karteNr: karte,
      ausgangsstand,
      quelle: () => {
        const stand = gezeichnet[paneIdx];
        return stand && typeof stand.content === 'string' ? stand.content : null;
      },
      aenderbar: () => istTafelAenderbar(paneIdx),
      wendeAn: (operation, angaben) => bedienungen[paneIdx].wendeAn(operation, angaben),
      tafelPfad: tab && tab.path ? tab.path : null,
      bereichsWurzel: rufeZugang('bereichsWurzel') || null,
      einstellungen: wirksamJe[paneIdx] || null,
    },
    standardWerkzeuge(zeigeHinweis),
  );
}

/**
 * Legt eine Spalte am Ende der Tafel an — der Weg des Kommandos aus Menü und
 * Kommando-Palette (4T-001851).
 *
 * Wortgleich zum Karten-Kommando darüber und aus demselben Grund: Jede Fehl-Lage
 * wird **gesagt** statt still verworfen; ein stiller Fehlschlag wäre für den
 * Nutzer nicht von einem Fehler zu unterscheiden. Einen Ort braucht die Handlung
 * hier nicht — eine neue Spalte entsteht immer am Ende.
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeKanbanSpalteAn(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const bedienung = spaltenBedienungen[paneIdx];
  if (!tab || tab.viewMode !== 'kanban' || !bedienung) {
    zeigeHinweis('kanban.nurInAnsicht');
    return false;
  }
  if (!istTafelAenderbar(paneIdx)) {
    zeigeHinweis('kanban.nurLesbar');
    return false;
  }
  return bedienung.legeAn() !== false;
}

// 4T-001955: Der Zielordner einer Tafel wird relativ gespeichert — zur
// Bereichs-Wurzel, ohne geöffneten Bereich zum Ordner der Tafel —, damit die
// Einstellung einen Umzug des Bereichs übersteht. Die Wurzel des Bereichs
// selbst heißt `/`, wie beim Vorbild die Wurzel des Tresors; der Ordner der
// Tafel ohne Bereich ist die Vorgabe und wird nicht eigens gespeichert. Ein
// Ordner außerhalb des Bereichs wird abgewiesen, wie beim Anlegen einer Datei
// aus einer Vorlage (`templates:createFile`, Bereichs-Grenze).
async function waehleZielordner(paneIdx) {
  if (!api || typeof api.templatesChooseFolder !== 'function') return null;
  const antwort = await api.templatesChooseFolder('target');
  if (!antwort || !antwort.ok || typeof antwort.path !== 'string') return null;
  const wurzel = rufeZugang('bereichsWurzel');
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const basis = wurzel || (tab && tab.path ? api.dirname(tab.path) : null);
  if (!basis) return null;
  const relativ = api.relative(basis, antwort.path).replace(/\\/g, '/');
  if (/^[A-Za-z]:|^\//.test(relativ) || (wurzel && relativ.split('/')[0] === '..')) {
    zeigeHinweis('kanban.einstellungen.ordnerAusserhalb');
    return null;
  }
  if (relativ === '') return wurzel ? '/' : null;
  return relativ;
}

// 4T-001955: Die Vorlage aus der Vorlagen-Auswahl der Anwendung — derselbe
// Weg wie bei «Neue Datei aus Vorlage» samt seinen Hinweisen (kein Ordner,
// leer, nicht lesbar). Laufzeit-Import aus demselben Grund wie beim
// Tag-Verweis. Gespeichert wird der Pfad in der Vorlagen-Quelle; eine Vorlage
// einer verknüpften Quelle trägt deren Kürzel in der Schreibweise, mit der
// auch eine Ordner-Regel ihre Vorlage benennt (`@kuerzel:Pfad`).
function waehleVorlage() {
  return import('../templates.js')
    .then((modul) => modul.pickTemplateEntry())
    .then((eintrag) => {
      if (!eintrag || typeof eintrag.relPath !== 'string') return null;
      const pfad = eintrag.relPath.replace(/\\/g, '/');
      return eintrag.sourceKey ? `@${eintrag.sourceKey}:${pfad}` : pfad;
    })
    .catch(() => null);
}

/**
 * Öffnet den Dialog «Einstellungen dieser Tafel…» und schreibt die
 * geänderten Einstellungen (4T-001955) — der Weg von Menü, Kommando-Palette
 * und Kontextmenü.
 *
 * Dieselben Fehl-Lagen wie bei den übrigen Tafel-Kommandos werden gesagt.
 * **Geschrieben wird als eine Transaktion** über den Schreibweg der Tafel und
 * damit als ein Rückgängig-Schritt, und zwar gegen den Stand, auf dem der
 * Dialog geöffnet wurde: Hat sich das Dokument inzwischen geändert, wird die
 * Änderung verworfen und gesagt (`kanban.verworfen`), statt fremde Arbeit zu
 * überschreiben. Ohne Änderung im Dialog wird nichts geschrieben.
 *
 * @param {number} paneIdx
 * @returns {Promise<boolean>} `true`, wenn geschrieben wurde.
 */
export async function oeffneKanbanTafelEinstellungen(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const stand = gezeichnet[paneIdx];
  if (!tab || tab.viewMode !== 'kanban' || !stand || typeof stand.content !== 'string') {
    zeigeHinweis('kanban.nurInAnsicht');
    return false;
  }
  if (!istTafelAenderbar(paneIdx)) {
    zeigeHinweis('kanban.nurLesbar');
    return false;
  }
  const ausgangsstand = stand.content;
  const werte = einstellungenAusModell(leseTafel(ausgangsstand)).werte;
  const aenderungen = await zeigeTafelEinstellungsDialog({
    t,
    werte,
    vorgaben: wirksameEinstellungen({}, kanbanAnzeigeStand()),
    waehleOrdner: () => waehleZielordner(paneIdx),
    waehleVorlage,
  });
  if (!Array.isArray(aenderungen) || aenderungen.length === 0) return false;
  const text = wendeTafelEinstellungenAn(ausgangsstand, aenderungen);
  if (text === null) {
    zeigeHinweis('kanban.einstellungen.nichtGeschrieben');
    return false;
  }
  return schreibeTafelText(paneIdx, { ausgangsstand, text });
}

/**
 * Wendet die Änderungen des Dialogs nacheinander auf den Text an, je
 * Einstellung über den Format-Kern (`setzeTafelEinstellung`, nur der eine
 * Schlüssel). Scheitert eine, wird keine geschrieben: `null`.
 *
 * @param {string} text
 * @param {Array<{name: string, wert: *}>} aenderungen
 * @returns {string|null}
 */
export function wendeTafelEinstellungenAn(text, aenderungen) {
  let stand = text;
  for (const { name, wert } of aenderungen) {
    const ergebnis = setzeTafelEinstellung(stand, { name, wert });
    if (!ergebnis.ok) return null;
    stand = ergebnis.text;
  }
  return stand;
}

/**
 * Erbt die Fläche der Spalte gerade die Änderbarkeit ihres Dokuments?
 *
 * **Die eine Auskunfts-Stelle** (Entscheidung des Bestands vom 2026-09-09,
 * verankert im Konzept der räumlichen Arbeitsfläche): Die Bedien-Vorgänge
 * dieser Ausbaustufe fragen sie und tragen keine eigene Bedingung.
 *
 * **Der fehlende Rückruf heißt hier «ja» und nicht «nein»** — dieselbe
 * benannte Ausnahme von der Fail-closed-Regel wie bei der Canvas: Diese Frage
 * entscheidet allein, ob die Fläche eine Handlung **anbietet**; der
 * Schreibweg ist eigens gesichert und liefert ohne Zugang gar nichts.
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function istTafelAenderbar(paneIdx) {
  if (!umgebung || typeof umgebung.istAenderbar !== 'function') return true;
  return umgebung.istAenderbar(paneIdx) === true;
}

// Die Bedien-Zuhörer der Fläche. Ansehen und Auswählen (Story 4S-000972, AK8)
// schreiben nichts und bleiben deshalb auch im nicht änderbaren Dokument
// erlaubt; die schreibenden Handlungen liegen seit 4T-001849 in der
// Karten-Bedienung daneben und fragen dort die Änderbarkeit.
function verdrahteContainer(container, paneIdx) {
  if (verdrahtet.has(container)) return;
  verdrahtet.add(container);
  // 4T-001849: Die Karten-Bedienung. Sie bekommt alles herein, was sie über
  // das Fenster wissen muss — Dokument-Text, Änderbarkeit, Schreibweg,
  // Status-Kette, Kontextmenü —, und importiert selbst nichts davon.
  bedienungen[paneIdx] = createKartenBedienung({
    container,
    t,
    // **Der Ausgangsstand ist der Text der letzten Zeichnung, nicht der des
    // Dokuments.** Die Karten-Koordinaten der gezeichneten Fläche gelten für
    // genau diesen Stand; gegen ihn misst der Schreibweg, und weicht das
    // Dokument inzwischen ab, wird die Handlung verworfen (AK6). Der Text des
    // Dokuments wäre hier die falsche Quelle — er stimmte immer mit sich
    // selbst überein, und die Prüfung liefe leer.
    quelle: () => {
      const stand = gezeichnet[paneIdx];
      return stand && typeof stand.content === 'string' ? stand.content : null;
    },
    modell: () => {
      const stand = gezeichnet[paneIdx];
      return leseTafel(stand && stand.content != null ? stand.content : '');
    },
    aenderbar: () => istTafelAenderbar(paneIdx),
    schreibe: (daten) => schreibeTafelText(paneIdx, daten),
    statusUmschalten: (daten) => schalteKartenStatus(paneIdx, daten),
    // Nachtrag zu 4T-001849: Rückgängig und Wiederholen laufen über DIESELBE
    // Historie wie im Editor — die Bedien-Handlungen der Tafel schreiben als
    // gewöhnliche Transaktionen hinein. Eine zweite Undo-Logik entsteht nicht.
    beiRueckgaengig: () => rufeZugang('rueckgaengig', paneIdx),
    beiWiederholen: () => rufeZugang('wiederholen', paneIdx),
    neuZeichnen: () => renderKanban(paneIdx),
    // 4T-001955: Zeitstempel und Obergrenze des Archivs aus der Kette.
    einstellungen: () => wirksamJe[paneIdx] || null,
    zeigeHinweis,
    oeffneVerweis: (href, angaben) => oeffneVerweis(paneIdx, href, angaben),
    oeffneTagesnotiz,
    // 4T-001956: «Notiz aus Karte erzeugen…».
    notizAusKarte: (daten) => notizAusKarte(paneIdx, daten),
    notizMoeglich,
    waehleTermin,
    zeigeMenue: (daten) => {
      if (umgebung && typeof umgebung.zeigeKontextmenue === 'function') {
        umgebung.zeigeKontextmenue(paneIdx, daten);
      }
    },
    schliesseMenue: () => {
      if (umgebung && typeof umgebung.schliesseKontextmenue === 'function') {
        umgebung.schliesseKontextmenue();
      }
    },
  });
  // 4T-001851: Die Spalten-Bedienung. Sie benutzt den Schreibweg der
  // Karten-Bedienung statt eines zweiten — eine Handlung, eine Transaktion, ein
  // Rückgängig-Schritt — und bekommt die Rückfrage vor dem Löschen einer nicht
  // leeren Spalte als Rückruf herein: Der Dialog lebt im Hauptprozess, und der
  // Kanban-Ordner darf die Prozess-Brücke nicht importieren.
  spaltenBedienungen[paneIdx] = createSpaltenBedienung({
    container,
    t,
    modell: () => {
      const stand = gezeichnet[paneIdx];
      return leseTafel(stand && stand.content != null ? stand.content : '');
    },
    aenderbar: () => istTafelAenderbar(paneIdx),
    // Der Schreibweg der Karten-Bedienung meldet einen Befund und zeichnet neu;
    // eine zweite Melde- oder Zeichen-Stelle entstuende sonst daneben.
    wendeAn: (operation, angaben) => bedienungen[paneIdx].wendeAn(operation, angaben),
    zeigeMenue: (daten) => {
      if (umgebung && typeof umgebung.zeigeKontextmenue === 'function') {
        umgebung.zeigeKontextmenue(paneIdx, daten);
      }
    },
    bestaetigeLoeschen: (daten) => rufeZugang('bestaetigeSpaltenLoeschung', paneIdx, daten),
    // 4T-001955: «Einstellungen dieser Tafel…» im Kontextmenü des
    // Spalten-Kopfs. Eine Tafel-Fläche mit eigenem Kontextmenü gibt es nicht;
    // der Spalten-Kopf ist das nächstgelegene, und der Eintrag wirkt dort auf
    // die ganze Tafel, nicht auf die Spalte.
    tafelEintraege: () => [
      { separator: true },
      {
        label: t('command.kanban.boardSettings'),
        dataId: 'kanban-board-settings',
        action: () => oeffneKanbanTafelEinstellungen(paneIdx),
      },
    ],
  });
  // 4T-001850: Das Verschieben per Maus. Es benutzt den Schreibweg der
  // Karten-Bedienung statt eines zweiten und bekommt den Statuswechsel als
  // **Text-Rechnung** herein: Verschieben und Abhaken müssen zusammen eine
  // Transaktion sein, und der Weg über den Editor schriebe selbst (AK8).
  ziehBedienungen[paneIdx] = createZiehBedienung({
    container,
    modell: () => {
      const stand = gezeichnet[paneIdx];
      return leseTafel(stand && stand.content != null ? stand.content : '');
    },
    aenderbar: () => istTafelAenderbar(paneIdx),
    wendeAn: (operation, angaben) => bedienungen[paneIdx].wendeAn(operation, angaben),
    // 4T-001851: Auch eine offene Titel-Eingabe hält den Zug an; sonst risse ein
    // Mausdruck auf dem Spalten-Kopf das Feld weg, in das gerade geschrieben wird.
    blockiert: () => bedienungen[paneIdx].blockiert() || spaltenBedienungen[paneIdx].blockiert(),
    waehleNachZeichnung: (ziel) => bedienungen[paneIdx].waehleNachZeichnung(ziel),
    statusAufText: (text, zeilenNummer) => rufeZugang('statusAufText', text, zeilenNummer),
  });
  container.addEventListener('mousedown', (ereignis) => {
    const ziel = ereignis.target;
    // 4T-001904: Der Griff zu einem Tag ist der Weg ins Tag-Panel und keine
    // Wahl der Karte; die Auswahl bleibt, wo sie war.
    // 4T-001907: ebenso der Griff ins Filter-Feld.
    // 4T-001958: ebenso der Griff zu jedem anderen Verweis der Karte.
    if (tagVerweisAn(ziel) || kartenVerweisAn(ziel) || inFilterLeiste(ziel)) return;
    const karte =
      ziel && typeof ziel.closest === 'function' ? ziel.closest(`.${KARTE_KLASSE}`) : null;
    waehleKarte(container, karte);
  });
  // Tastatur-Erreichbarkeit: Die Karten tragen `tabindex`, der Fokus wählt
  // sie, und Escape hebt die Auswahl auf (Muster der Canvas-Fläche).
  container.addEventListener('focusin', (ereignis) => {
    const ziel = ereignis.target;
    // 4T-001904: Ein angeklicktes Tag nimmt den Fokus als Verweis an sich; auch
    // das wählt die Karte nicht; 4T-001958: ebenso jeder andere Verweis.
    if (tagVerweisAn(ziel) || kartenVerweisAn(ziel)) return;
    const karte =
      ziel && typeof ziel.closest === 'function' ? ziel.closest(`.${KARTE_KLASSE}`) : null;
    if (karte) waehleKarte(container, karte);
  });
  container.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') waehleKarte(container, null);
  });
}

/**
 * Zeichnet die Tafel der Spalte.
 *
 * @param {number} paneIdx
 * @returns {Element|null} Container der Tafel-Ansicht dieser Spalte.
 */
export function renderKanban(paneIdx) {
  if (!umgebung) return null;
  const tab = umgebung.aktivesDokument(paneIdx);
  // 4T-001907: Ein anderes Dokument im Bereich beendet den Filter der Tafel.
  pruefeTafelSuche(paneIdx, tab);
  if (!tab || tab.viewMode !== 'kanban') return null;
  const els = umgebung.getPaneEls(paneIdx);
  const container = (els && els.kanbanEl) || null;
  if (!container) return null;
  verdrahteContainer(container, paneIdx);
  // 4T-001849: Eine offene Eingabe überlebt den Takt des Nachzugs. Die
  // Zeichnung baut den Baum neu auf; sie nähme dem Anwender mitten im Wort
  // das Feld weg, in das er schreibt.
  const bedienung = bedienungen[paneIdx];
  if (bedienung && bedienung.blockiert()) return container;
  // 4T-001851: Ebenso eine offene Titel-Eingabe einer Spalte, aus demselben Grund.
  const spaltenBedienung = spaltenBedienungen[paneIdx];
  if (spaltenBedienung && spaltenBedienung.blockiert()) return container;
  // 4T-001850: Ebenso während eines laufenden Zuges. Die Zeichnung baut den
  // Baum neu auf und nähme dem Anwender die Karte weg, die er gerade hält.
  const ziehen = ziehBedienungen[paneIdx];
  if (ziehen && ziehen.blockiert()) return container;

  const pfad = tab.path || '';
  const aenderbar = istTafelAenderbar(paneIdx);
  // Die Sprache gehört in den Schlüssel, weil die Texte der leeren Zustände
  // und der Befunde im gezeichneten Baum stecken (Muster paneRenderCache).
  // Gelesen wird sie am Dokument-Element und nicht aus `app-state.js`, dessen
  // Import diesen Ordner in den eingefrorenen Datei-Zyklus zöge.
  const sprache = document.documentElement.lang || '';
  // 4T-001904: Der Stand der Anzeige-Schalter gehört ebenso in den Schlüssel —
  // umgeschaltet ist die Tafel ein anderes Bild aus demselben Text. Verglichen
  // wird über die Identität des Schalter-Stands, der bei jedem Wechsel ersetzt
  // wird.
  const schalter = kanbanAnzeigeStand();
  // 4T-001903: Überfällig-Kennzeichen und relative Termine hängen am heutigen
  // Tag; nach einem Datumswechsel ist dasselbe Dokument ein anderes Bild.
  const heute = lokalesDatum();
  const stand = gezeichnet[paneIdx];
  // Der Nachzug beim Tippen läuft im festen Takt, auch wenn kein Zeichen
  // dazugekommen ist. Ein unveränderter Stand wird deshalb übersprungen statt
  // neu gezeichnet; der Vergleich läuft über die Identität des Puffers.
  if (
    stand &&
    stand.content === tab.content &&
    stand.pfad === pfad &&
    stand.aenderbar === aenderbar &&
    stand.sprache === sprache &&
    stand.schalter === schalter &&
    stand.heute === heute &&
    container.firstChild
  ) {
    // 4T-001957: Die Karten bleiben, die Angaben der verlinkten Notizen werden
    // trotzdem neu gelesen — die Notiz kann sich geändert haben, ohne dass die
    // Tafel es hat (Story AK7).
    aktualisiereAngaben(container, stand.model, stand.wirksam, pfad);
    // 4T-001958: Ein Tages-Journal kann entstanden oder verschwunden sein.
    aktualisiereDatumsVerweise(paneIdx, container, stand.wirksam);
    return container;
  }

  const zustand = merkeZustand(container);
  // Nachtrag zu 4T-001849: Der Tastatur-Fokus gehört zum gemerkten Stand wie
  // Roll-Lage und Auswahl. Die Zeichnung baut den Baum neu auf; die
  // fokussierte Karte gibt es danach nicht mehr, und ohne Nachzug fiele der
  // Fokus auf den Dokument-Rumpf — `Strg+Z` erreichte die Tafel nicht mehr.
  if (bedienung) bedienung.vorRender();
  const model = leseTafel(tab.content == null ? '' : tab.content);
  // 4T-001955: Tafel vor Vorgabe. Beide Quellen stehen schon im Schlüssel der
  // Zeichnung (Text und Schalter-Stand); ein eigener Eintrag entfällt.
  const wirksam = wirksameEinstellungen(einstellungenAusModell(model).werte, schalter);
  wirksamJe[paneIdx] = wirksam;
  zeichneTafel(container, model, {
    t,
    pfad,
    // Dieselbe Render-Kette, die Lese-Ansicht und Canvas-Karte benutzen; der
    // Pfad ist der Bezug für Verweise und Bilder.
    renderMarkdown: (text, basis, optionen) => api.renderMarkdown(text, basis, optionen),
    // 4T-002021: Der Text der Karte ist das Dokument ihrer Diagramme.
    nachRender: (knoten, basis, dokumentText) => {
      if (teilbaumSchritte) teilbaumSchritte(knoten, basis, { dokumentText });
    },
    aenderbar,
    // 4T-001904: Schalter «Tags am Kartenfuß»; seit 4T-001955 aus der
    // Auflösungs-Kette, die globale Einstellung ist die Vorgabe darunter.
    tagsAmFuss: wirksam.tagsAmFuss.wert === true,
    // 4T-001903: Schalter «Termine relativ anzeigen», gelesen in der Sprache
    // der Oberfläche; ebenso aus der Kette (4T-001955).
    terminRelativ: wirksam.termineRelativ.wert === true,
    locale: intlLocale(),
  });
  stelleZustandHer(container, zustand);
  // 4T-001849: Nach dem Löschen rückt die Auswahl auf die Nachbarkarte. Der
  // Schritt steht **nach** der Wiederherstellung, weil er sie gezielt
  // überstimmt: Die gelöschte Zeile gibt es nicht mehr.
  if (bedienung) bedienung.nachRender();
  // 4T-001907: Ein offener Filter gilt auch für die neu gezeichneten Karten (AK9).
  nachTafelZeichnung(paneIdx, { tab, container, model });
  gezeichnet[paneIdx] = {
    content: tab.content,
    pfad,
    aenderbar,
    sprache,
    schalter,
    heute,
    model,
    wirksam,
  };
  // 4T-001957: Die Karten stehen; die Angaben werden nachgetragen.
  aktualisiereAngaben(container, model, wirksam, pfad);
  // 4T-001958: Das Datum als Verweis auf die Tagesnotiz, nach der Einstellung.
  aktualisiereDatumsVerweise(paneIdx, container, wirksam);
  return container;
}

/**
 * 4T-001957 (Story 4S-000985): Angaben der verlinkten Notizen nachtragen —
 * eine gebündelte Anfrage je Zeichnen, nur mit eingeschalteter Erweiterung und
 * nicht leerer Feldwahl (Entscheidung C2). Die Zeichnung wartet nicht darauf.
 */
function aktualisiereAngaben(container, model, wirksam, pfad) {
  const feldwahl =
    istKanbanErweiterungAn() && wirksam && wirksam.feldwahl
      ? feldwahlAus(wirksam.feldwahl.wert)
      : [];
  ladeAngaben(container, {
    model,
    feldwahl,
    pfad,
    lade: (anfrage) => api.kanbanNotizAngaben(anfrage),
    t,
  }).catch(() => {});
}

/**
 * Meldet den Wechsel der Verfügbarkeit — und nur ihn.
 *
 * Aus einem Dokument wird während des Schreibens eine Tafel und umgekehrt: Der
 * Kopf-Schlüssel wird getippt oder gelöscht, und Schaltfläche wie Menü-Eintrag
 * müssen nachziehen. Gemeldet wird ausschließlich der **Wechsel**, weil der
 * Menü-Zustand über die Prozess-Brücke geht und ihn im Tipp-Takt zu senden die
 * teurere Hälfte dieser Regel wäre (Muster `pruefeVerfuegbarkeit` der Canvas).
 */
function pruefeVerfuegbarkeit(paneIdx) {
  if (!umgebung) return;
  const tab = umgebung.aktivesDokument(paneIdx);
  // 4T-001852: Gemessen werden ZWEI Lagen. Die zweite ist «das Dokument ist
  // leer»: Am ersten getippten Zeichen verliert das Umwandeln seine Grundlage,
  // und am letzten gelöschten bekommt es sie zurück. Sie hängt an derselben
  // Meldung, weil es die einzige ist, die im Tipp-Takt läuft; gemeldet wird
  // weiterhin ausschließlich der **Wechsel**.
  const jetzt = istTafelModusVerfuegbar(tab);
  const leerJetzt = !!tab && dokumentIstLeer(tab.content);
  if (verfuegbar[paneIdx] === jetzt && leer[paneIdx] === leerJetzt) return;
  verfuegbar[paneIdx] = jetzt;
  leer[paneIdx] = leerJetzt;
  if (typeof umgebung.beiVerfuegbarkeitsWechsel === 'function') {
    umgebung.beiVerfuegbarkeitsWechsel(paneIdx, jetzt);
  }
}

/** Verzögerte Aktualisierung nach einer Dokument-Änderung. */
export function scheduleKanbanRender(paneIdx) {
  if (timer[paneIdx]) clearTimeout(timer[paneIdx]);
  timer[paneIdx] = setTimeout(() => {
    timer[paneIdx] = null;
    pruefeVerfuegbarkeit(paneIdx);
    renderKanban(paneIdx);
  }, KANBAN_RENDER_DEBOUNCE_MS);
}
