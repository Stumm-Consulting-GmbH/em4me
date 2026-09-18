// 4T-001759 (Epic 3E-000253): Die Übersichts-Seite der Datenbank — Steckbrief,
// Tabellen und Fehlerlagen an einer Stelle.
//
// **Vorbild ist die Seite der Bereichs-Statistik** (`area-stats-page.js`):
// System-Seite im Reiter-System, eine Instanz je Fenster, lesend, ohne
// Bearbeiten und ohne Sitzungs-Ablage. Die Zugänge sind dieselben drei —
// Ansichtsmenü, Kontextmenü des Bereichs-Panels und Kommando.
//
// **Registriert wird beim Laden des Moduls** und nicht über eine
// init-Funktion. Vorbild ist `settings-page.js`, das es seit jeher so hält; die
// beiden Nachbarn mit init-Funktion begründen sie mit ihren Import-Zyklen zu
// `tabs`/`views`, die hier keiner ist. Die Registrierung legt einen Eintrag in
// eine Karte, mehr nicht, und das Modul wird ohnehin von jedem der drei Zugänge
// importiert.
//
// **Die Daten kommen fertig aus dem einen Helfer** (`datenbank-bereich.js`).
// Die Seite baut keine zweite Auswertung: Steckbrief, Tabellen samt ihrer
// Feld-Zahl und die Fehlerlagen stehen im Überblick des Katalog-Kanals, und
// eine eigene Erhebung wäre eine zweite Quelle für dieselbe Aussage.
//
// **Die Fehlerlagen stehen hier im Klartext**, während der Einstellungs-Bereich
// aus 4T-001758 nur ihre Zahl nennt. Das ist die Arbeitsteilung aus jenem
// Vorgang: Die Kurzform sagt, DASS etwas nicht stimmt, diese Seite sagt, WAS.
// Den Satz zu einem Code baut seit 4T-001584 das Katalog-Modul, weil der
// Datensatz-Block dieselben Codes zeigt; diese Seite reicht allein ihr
// Übersetzungs-Werkzeug hinein.
'use strict';

import { intlLocale, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from '../app/system-pages.js';
import { showStatusbarHint } from '../views/views.js';
// 4T-001761 (Epic 3E-000253): Der Schalt-Zustand der Erweiterung «Datenbank».
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { datenbankAuskunft, verwirfDatenbankAuskunft } from './datenbank-bereich.js';
import { loeseBeschriftung } from '../../../shared/database/beschriftung.js';
import { hinweisSatz } from '../../../shared/database/table-hinweise.js';
import { wirksameRueckfallSprache } from '../../../shared/database/database-steckbrief.js';

export const DATENBANK_UEBERSICHT_PAGE_ID = 'database-overview';

// Seiten-Zustand: die geholte Auskunft und das Lade-Kennzeichen. Flüchtig, er
// überlebt das Schließen der Seite nicht (Muster der Bereichs-Statistik).
const seite = {
  container: null,
  daten: null,
  laden: false,
};

// --- Zugang ------------------------------------------------------------------

/**
 * Öffnet die Übersichts-Seite (Ansichtsmenü, Kontextmenü, Kommando).
 *
 * Ohne gebundenen Bereich bleibt es beim lokalisierten Hinweis statt einer
 * leeren Seite — dasselbe Wächter-Muster wie bei der Bereichs-Statistik, das
 * den Kürzel- und den Kontextmenü-Weg mit abdeckt.
 *
 * **Das Wurzel-Tor des Aus-Zustands** (4T-001761, Epic 3E-000253): Ist die
 * Erweiterung «Datenbank» abgeschaltet, kehrt die Funktion sofort zurück. Sie
 * steht bewusst HIER und nicht an den Zugängen: Alle vier — Ansichtsmenü,
 * Kommando-Palette, Kontextmenü des Bereichs-Panels und die Option «Übersicht
 * beim Öffnen des Bereichs zeigen» — laufen durch diese eine Tür, und vier
 * einzelne Tore wären vier Gelegenheiten, eines zu vergessen. Ohne Hinweis:
 * Eine abgeschaltete Funktion meldet sich nicht, sie ist nicht da.
 */
export function oeffneDatenbankUebersicht() {
  if (!isExtensionActive('database')) return;
  if (!state.areaPath) {
    showStatusbarHint('database.overview.noArea', { duration: 3000, error: true });
    return;
  }
  openSystemPage(DATENBANK_UEBERSICHT_PAGE_ID);
  void holeUndZeichne();
}

/**
 * Ist die Seite in diesem Fenster offen? (Prüffälle und Fehlersuche.)
 *
 * @returns {boolean} true, wenn ein Reiter der Seite steht.
 */
export function datenbankUebersichtOffen() {
  return !!findSystemTabAcrossPanes(DATENBANK_UEBERSICHT_PAGE_ID);
}

// --- Öffnen beim Binden des Bereichs -----------------------------------------

// Der Bereich, dessen Auskunft noch aussteht. Solange er gesetzt ist, nimmt die
// Index-Meldung einen neuen Anlauf; eine bereite Antwort löscht ihn, und damit
// endet der Anlauf nach genau einer Entscheidung.
let wartetAufBereich = null;

/**
 * Zeigt die Übersicht, wenn der Anwender das für diesen Bereich eingestellt hat.
 *
 * Aufgerufen wird sie an genau zwei Stellen: im Bereichs-Wechsel-Zweig der
 * Fenster-Meldung (app-broadcasts.js) für jeden späteren Bindungs-Wechsel und
 * am Ende von `init()` für das frisch gestartete Fenster. Die zweite Stelle ist
 * nicht Bequemlichkeit, sondern Notwendigkeit: Ein neu erzeugtes Bereichs-
 * Fenster bekommt seine Fenster-Meldung im did-finish-load-Handler, also
 * WÄHREND die Sitzung noch wiederhergestellt wird — und die Wiederherstellung
 * baut die Spalten neu auf, sodass ein vorher geöffneter Reiter verschwände.
 *
 * **Der Index kann noch im Aufbau sein.** Dann ist «keine Datenbank» keine
 * Aussage über den Bestand, und die Seite bliebe zu Unrecht zu. Die Antwort
 * wird deshalb nicht als Nein gewertet, sondern der Bereich vorgemerkt; die
 * nächste Index-Meldung nimmt einen neuen Anlauf. Eine Schleife entsteht daraus
 * nicht, weil die Vormerkung mit der ersten bereiten Antwort fällt und jeder
 * Anlauf an die Meldung des Index gebunden ist.
 *
 * **Und die Auskunft wird immer geholt**, auch wenn die Option aus ist: Zwei
 * Verbraucher entscheiden synchron über sie (Kontextmenü des Bereichs-Panels
 * und die Bedingung des Menü-Zugangs), und sie können nicht warten. Der eine
 * Aufruf je Bindung ist der Preis dafür, dass beide beim ersten Klick eine
 * Antwort haben.
 *
 * **Und im Aus-Zustand entsteht gar keine Anfrage** (4T-001761, Epic
 * 3E-000253): Der Schalter wird VOR der Auskunft und vor dem Lesen der
 * Bereichs-Konfiguration geprüft. Das Wurzel-Tor in
 * `oeffneDatenbankUebersicht` allein verhinderte zwar das Öffnen, aber nicht
 * die beiden Anfragen davor, und eine abgeschaltete Erweiterung darf bei jedem
 * Binden eines Bereichs nichts kosten.
 *
 * **Die Option selbst bleibt stehen.** Sie liegt in der Bereichsdatei, wird
 * hier nur gelesen und beim Abschalten weder gelöscht noch umgeschrieben
 * (AK6); beim Wiedereinschalten wirkt sie beim nächsten Binden unverändert.
 *
 * @returns {Promise<void>}
 */
export async function zeigeUebersichtBeimBinden() {
  const bereich = state.areaPath;
  wartetAufBereich = null;
  if (!isExtensionActive('database')) return;
  if (!bereich) return;
  const auskunft = await datenbankAuskunft();
  // Der Bereich kann während der Anfrage gewechselt haben; die Antwort gehört
  // dann zum alten und darf nichts mehr öffnen.
  if (state.areaPath !== bereich) return;
  if (auskunft.status !== 'ready') {
    wartetAufBereich = bereich;
    return;
  }
  if (!auskunft.istDatenbankBereich) return;
  let konfig;
  try {
    konfig = await api.getAreaDatabaseConfig();
  } catch {
    konfig = null;
  }
  if (state.areaPath !== bereich) return;
  if (!konfig || konfig.overviewOnOpen !== true) return;
  oeffneDatenbankUebersicht();
}

// Der Index meldet sein Fertigwerden und jede Änderung seines Bestands. Nur der
// vorgemerkte Fall geht diese Seite an; ohne Vormerkung tut die Meldung hier
// nichts, damit nicht jedes Speichern im Bereich eine Anfrage nach sich zieht.
if (typeof api.onBacklinksInvalidated === 'function') {
  api.onBacklinksInvalidated(() => {
    if (wartetAufBereich && wartetAufBereich === state.areaPath) void zeigeUebersichtBeimBinden();
  });
}

// --- Daten -------------------------------------------------------------------

// `frisch` verwirft die gehaltene Auskunft zuvor — der Weg des Knopfes
// «Aktualisieren». Beim Öffnen genügt der gehaltene Stand: Er wird bei jeder
// Änderung im Bereich ohnehin verworfen.
async function holeUndZeichne({ frisch = false } = {}) {
  if (seite.laden) return;
  seite.laden = true;
  if (frisch) verwirfDatenbankAuskunft();
  zeichne();
  const auskunft = await datenbankAuskunft();
  seite.laden = false;
  seite.daten = auskunft;
  zeichne();
}

// --- Bausteine ---------------------------------------------------------------

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

function abschnitt(wurzel, titelKey) {
  const block = el('section', 'db-overview-section');
  block.appendChild(el('h4', 'db-overview-section-title', t(titelKey)));
  wurzel.appendChild(block);
  return block;
}

// Eine lesende Zeile aus Beschriftung und Wert. Kein Eingabefeld, auch kein
// deaktiviertes: Hier wird nichts bearbeitet (Linie aus 4T-001758).
function auskunftsZeile(block, labelKey, wert) {
  const zeile = el('div', 'db-overview-row');
  zeile.appendChild(el('span', 'db-overview-row-label', t(labelKey)));
  zeile.appendChild(el('span', 'db-overview-row-value', wert));
  block.appendChild(zeile);
}

// Name und Beschreibung aus dem Steckbrief, in der Sprache des Anwenders.
// Dieselbe Auflösung wie im Einstellungs-Bereich, über dieselbe Funktion des
// gemeinsamen Beschriftungs-Moduls.
function steckbriefTexte(steckbrief) {
  if (!steckbrief) return { name: null, beschreibung: null };
  const sprache = intlLocale();
  const rueckfall = wirksameRueckfallSprache(steckbrief);
  return {
    name: loeseBeschriftung(steckbrief.name, sprache, rueckfall),
    beschreibung: loeseBeschriftung(steckbrief.description, sprache, rueckfall),
  };
}

// --- Fehlerlagen im Klartext -------------------------------------------------

/**
 * Lokalisierter Satz zu einer Fehlerlage.
 *
 * **Gebaut wird er im Katalog-Modul** (4T-001584) und nicht mehr hier: Seit der
 * Datensatz-Block dieselben Codes als Sätze zeigt, übersetzen zwei Anzeigen
 * denselben Vorrat, und zwei Bauer hießen früher oder später zwei
 * Formulierungen. Diese Seite reicht allein ihr Übersetzungs-Werkzeug hinein.
 *
 * **Der Vorrat kennt seit demselben Vorgang keine Ausnahme mehr.** Er umfasst
 * jeden Code des Katalogs, auch die Befunde am Datensatz-Block; ein Prüffall
 * hält ihn gegen die fünf Sprachfassungen und meldet jeden Code, der künftig
 * ohne Satz dazukäme.
 *
 * @param {object} hinweis Hinweis in der Gestalt aus table-hinweise.js.
 * @returns {string} Der Satz in der Sprache der Oberfläche.
 */
export function hinweisText(hinweis) {
  return hinweisSatz(hinweis, t);
}

// Alle Fehlerlagen der Datenbank in einer Liste: erst die am Steckbrief, dann
// die je Tabelle mit ihrem Tabellen-Namen davor. Eine Tabelle mit fehlerhafter
// Definition steht damit MIT ihrem Befund da und fehlt nicht einfach — die
// Linie des Katalogs, hier bis zur Anzeige durchgezogen.
function fehlerZeilen(daten) {
  const zeilen = [];
  for (const hinweis of daten.hints || [])
    zeilen.push({ quelle: null, text: hinweisText(hinweis) });
  for (const tabelle of daten.tabellen || []) {
    for (const hinweis of tabelle.hints || [])
      zeilen.push({ quelle: tabelle.name, text: hinweisText(hinweis) });
  }
  return zeilen;
}

// --- Seiten-Aufbau -----------------------------------------------------------

function zeichne() {
  const container = seite.container;
  if (!container || !container.isConnected) return;
  container.innerHTML = '';
  const wurzel = el('div', 'db-overview-page');

  const kopf = el('div', 'db-overview-head');
  kopf.appendChild(el('h3', 'db-overview-heading', seitenTitel()));
  const knopf = el('button', 'db-overview-refresh', t('database.overview.refresh'));
  knopf.type = 'button';
  knopf.disabled = seite.laden;
  knopf.addEventListener('click', () => void holeUndZeichne({ frisch: true }));
  kopf.appendChild(knopf);
  wurzel.appendChild(kopf);

  if (seite.laden) wurzel.appendChild(el('p', 'db-overview-note', t('database.overview.loading')));
  const daten = seite.daten;
  if (daten && !daten.istDatenbankBereich) {
    // Zwei Lagen, zwei Sätze: Der Index im Aufbau ist ein Wartezustand, ein
    // Bereich ohne Steckbrief eine Auskunft. Beide als «keine Datenbank» zu
    // zeigen, hieße dem Anwender sagen, es gebe hier nichts, während gerade
    // noch gesucht wird.
    const key =
      daten.status === 'indexing' ? 'database.overview.indexing' : 'database.overview.noDatabase';
    wurzel.appendChild(el('p', 'db-overview-note db-overview-empty', t(key)));
  } else if (daten) {
    zeichneAbschnitte(wurzel, daten);
  }
  container.appendChild(wurzel);
}

// Der Titel trägt den Namen der Datenbank, sobald er bekannt ist, sonst den des
// Bereichs: Der Anwender erkennt an ihm, worüber die Seite spricht.
function seitenTitel() {
  const name = seite.daten ? steckbriefTexte(seite.daten.steckbrief).name : null;
  const zusatz = name || state.areaName;
  return zusatz
    ? `${t('database.overview.pageTitle')} — ${zusatz}`
    : t('database.overview.pageTitle');
}

function zeichneAbschnitte(wurzel, daten) {
  const steckbrief = abschnitt(wurzel, 'database.overview.section.profile');
  const texte = steckbriefTexte(daten.steckbrief);
  auskunftsZeile(steckbrief, 'database.overview.name', texte.name || t('database.overview.noName'));
  auskunftsZeile(
    steckbrief,
    'database.overview.description',
    texte.beschreibung || t('database.overview.noDescription'),
  );

  const tabellen = abschnitt(wurzel, 'database.overview.section.tables');
  zeichneTabellen(tabellen, daten.tabellen || []);

  const fehler = abschnitt(wurzel, 'database.overview.section.issues');
  zeichneFehler(fehler, fehlerZeilen(daten));
}

function zeichneTabellen(block, liste) {
  if (liste.length === 0) {
    block.appendChild(el('p', 'db-overview-empty', t('database.overview.noTables')));
    return;
  }
  const tabelle = el('table', 'db-overview-table');
  const kopf = document.createElement('thead');
  const kopfZeile = document.createElement('tr');
  kopfZeile.appendChild(el('th', null, t('database.overview.col.table')));
  kopfZeile.appendChild(el('th', null, t('database.overview.col.fields')));
  kopf.appendChild(kopfZeile);
  tabelle.appendChild(kopf);
  const koerper = document.createElement('tbody');
  for (const eintrag of liste) {
    const zeile = document.createElement('tr');
    zeile.appendChild(el('td', 'db-overview-table-name', eintrag.name));
    zeile.appendChild(el('td', 'db-overview-table-fields', String(eintrag.felder || 0)));
    koerper.appendChild(zeile);
  }
  tabelle.appendChild(koerper);
  block.appendChild(tabelle);
}

function zeichneFehler(block, zeilen) {
  if (zeilen.length === 0) {
    block.appendChild(el('p', 'db-overview-empty', t('database.overview.noIssues')));
    return;
  }
  const liste = el('ul', 'db-overview-issues');
  for (const zeile of zeilen) {
    const punkt = el('li', 'db-overview-issue');
    if (zeile.quelle) punkt.appendChild(el('span', 'db-overview-issue-source', zeile.quelle));
    punkt.appendChild(el('span', 'db-overview-issue-text', zeile.text));
    liste.appendChild(punkt);
  }
  block.appendChild(liste);
}

// --- Registrierung -----------------------------------------------------------

registerSystemPage({
  id: DATENBANK_UEBERSICHT_PAGE_ID,
  titleKey: 'database.overview.pageTitle',
  // Dynamischer Reiter-Titel «Datenbank: <Name>» (Muster der Bereichs-
  // Statistik); der titleKey bleibt der Rückfall ohne bekannten Namen.
  title() {
    const name = seite.daten ? steckbriefTexte(seite.daten.steckbrief).name : null;
    const zusatz = name || state.areaName;
    return zusatz
      ? `${t('database.overview.pageTitle')}: ${zusatz}`
      : t('database.overview.pageTitle');
  },
  onOpen() {
    // Frischer Seiten-Zustand je Neu-Öffnen (Muster der Einstellungs-Seite).
    seite.daten = null;
  },
  mount(container) {
    seite.container = container;
    zeichne();
    if (!seite.daten && !seite.laden) void holeUndZeichne();
  },
  onClose() {
    seite.container = null;
  },
});
