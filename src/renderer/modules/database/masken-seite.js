// 4T-001939 (Epic 3E-000257, Bauplan B1 bis B8): Die Einzel-Maske eines
// Datensatzes — eine System-Seite, die einen Datensatz zeigt und seine Felder
// in der Eingabe-Form ihres Typs anbietet.
//
// **Muster ist die Beleg-Ansicht** (`beleg-ansicht-seite.js`): eine Instanz je
// Fenster, an einen Gegenstand aus Tabellen-Datei und Kennung gebunden, und
// erneutes Öffnen für einen anderen Gegenstand bindet die bestehende Instanz
// um. Anders als dort kann hier eine Bearbeitung offen sein; ein Umbinden mit
// ungespeicherter Bearbeitung fragt deshalb in der Seite selbst nach, mit einem
// Bestätigungs-Block und nicht mit einem Dialog des Betriebssystems, damit auch
// ein Ablauf-Fall ihn bedienen kann (Bauplan B2).
//
// **Registriert wird beim Laden des Moduls**, wie bei den beiden Geschwistern;
// `app-init.js` lädt das Modul für die Registrierung und reicht die beiden
// Einstiege an den Zeilen-Zugang weiter, der selbst nichts importiert.
//
// **Die Daten kommen fertig aus EINEM Kanal** (`database:datensatz`, 4T-001938):
// Definition, Zellen, Anzeige-Form, Erwartung, Bearbeitbarkeit und der
// erzeugte Masken-Körper aus demselben, frisch gelesenen Stand. Die Seite
// rechnet keine Bedingung und legt keinen Wert aus, sie zeigt.
//
// **Speichern und Löschen schreiben über die Schreib-Schnittstelle** (4T-001940,
// Bauplan B4 bis B6): Den Auftrag baut und das Ergebnis ordnet
// `masken-speichern.js`, den Satz bildet `auftrag-text.js`; die Seite schickt,
// zeigt und lädt danach neu. Die frühere Naht `setzeMaskenAktionen` ist mit dem
// direkten Import entfallen.
//
// **Die Sperre der Bearbeitung** (4T-001941, Bauplan B2 bis B4) nimmt und gibt
// `masken-sperre.js` über den Kanal `database:sperre`; die Seite ruft sie an
// den Übergängen: Bearbeiten und Beginn des Löschens nehmen, Ergebnis des
// Auftrags, Verwerfen, Neu laden, Umbinden, Schließen des Reiters und Ende des
// Fensters geben frei.
//
// **Die Verweis-Felder** (4T-001942, Bauplan B2 und B3): Beim Lesen holt
// `masken-verweise.js` die Listen ihrer Ziel-Tabellen, bevor die Seite zeichnet;
// jedes Feld-Element bekommt Liste und Lade-Funktion über `optionen(feld)`.
//
// **Die Masken-Datei** (4T-001943, Bauplan B1, B3): Der Körper kommt aus der
// geltenden Masken-Datei oder ist erzeugt; `masken-datei.js` zeigt die Quelle im
// Kopf und bietet bei der erzeugten Maske den Handgriff zum Herausschreiben.
//
// **Verwendet von** (4T-001945, Bauplan B3): Aktion und Liste der verweisenden
// Datensätze stehen in `masken-verwendung.js`; die Seite ruft sein Zeichnen beim
// Aufbau des Kopfs und verwirft beim Umbinden.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from '../app/system-pages.js';
import { showStatusbarHint } from '../views/views.js';
import { renderTabbar } from '../views/tabbar.js';
import { applyTeilbaumSchritte } from '../render-mermaid.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { oeffneBelegAnsicht } from './beleg-ansicht-seite.js';
import { baueFeldElement, MODUS_BEARBEITEN, MODUS_LESEN } from './masken-felder.js';
import { closeTab } from '../tabs/tabs.js';
import { ART_LOESCHEN, erzeugeSpeicherAblauf, markiereFeld } from './masken-speichern.js';
import { loeseBeschriftung } from '../../../shared/database/beschriftung.js';
import { hinweisSatz } from '../../../shared/database/table-hinweise.js';
import { localTimestamp } from '../time-format.js';
import { erzeugeSperrAblauf, ZWECK_BEARBEITEN, ZWECK_LOESCHEN } from './masken-sperre.js';
import { erzeugeVerweisHilfe } from './masken-verweise.js';
import { dateiName, koerperStand, zeichneQuelle } from './masken-datei.js';
import { erzeugeVerwendungsHilfe } from './masken-verwendung.js';

export const MASKEN_PAGE_ID = 'database-form';

// Seiten-Zustand. Flüchtig wie bei den Geschwistern: Er überlebt das Schließen
// der Seite nicht. `neu` kennzeichnet eine Neuanlage, deren Kennung zwar
// gezogen, deren Datensatz aber noch nicht geschrieben ist; gelesen wird dann
// der leere Datensatz (`kennung: null` am Kanal).
const seite = {
  container: null,
  tabellenPfad: null,
  kennung: null,
  neu: false,
  daten: null,
  laden: false,
  modus: MODUS_LESEN,
  // Feld-Name → Zell-Text; nur im Bearbeiten gesetzt.
  entwurf: null,
  // Der Gegenstand, auf den umgebunden werden soll, solange der
  // Bestätigungs-Block steht; sonst null.
  ausstehend: null,
  // 4T-001940: die zugeordneten Befunde des letzten abgewiesenen Auftrags, der
  // Auftrag selbst (für «erzwingen»), die offene Lösch-Rückfrage, ein laufender
  // Auftrag und das Feld, das nach dem Zeichnen den Fokus bekommt.
  befunde: null,
  auftrag: null,
  loeschFrage: false,
  sendet: false,
  fokus: null,
  // 4T-001941: die gehaltene Sperre (Tabelle, Kennung, Stand) und der
  // angezeigte Konflikt (Antwort, Zweck, Grund).
  sperre: null,
  sperrKonflikt: null,
};

// Anfrage-Zähler und Gegenstand der laufenden Anfrage (Muster der
// Beleg-Ansicht, Begründung dort).
let anfrage = 0;
let laufendFuer = null;
// 4T-001942: die Ziel-Listen der Verweis-Felder, verworfen mit jedem Lesen.
const verweise = erzeugeVerweisHilfe((tabelle) => api.databaseDatensaetze({ tabelle }));
// 4T-001945: «Verwendet von», auf Anforderung gelesen.
const verwendung = erzeugeVerwendungsHilfe({ oeffne: oeffneMaske, zeichneNeu: () => zeichne() });

// --- Zugang ------------------------------------------------------------------

/**
 * Öffnet die Maske für einen Datensatz.
 *
 * **Das Wurzel-Tor des Aus-Zustands** steht hier und nicht an den Zugängen
 * (Linie aus 4T-001761): Ist die Erweiterung «Datenbank» abgeschaltet, kehrt
 * die Funktion ohne Meldung zurück.
 *
 * @param {string} tabellenPfad Pfad der Tabellen-Datei.
 * @param {string|null} kennung Interne Kennung, oder null für den leeren
 *   Datensatz einer Neuanlage ohne gezogene Kennung.
 * @param {{neu?: boolean}} [optionen] `neu: true` für eine eben eröffnete
 *   Neuanlage mit gezogener Kennung, deren Datensatz noch nicht existiert.
 */
export function oeffneMaske(tabellenPfad, kennung, optionen = {}) {
  if (!isExtensionActive('database')) return;
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '') return;
  if (kennung !== null && (typeof kennung !== 'string' || kennung === '')) return;
  const neu = kennung === null || !!(optionen && optionen.neu === true);
  const anderer =
    seite.tabellenPfad !== tabellenPfad || seite.kennung !== kennung || seite.neu !== neu;
  if (anderer && hatUngespeicherteBearbeitung()) {
    seite.ausstehend = { tabellenPfad, kennung, neu };
    openSystemPage(MASKEN_PAGE_ID, { nextToPath: seite.tabellenPfad });
    zeichne();
    return;
  }
  binde(tabellenPfad, kennung, neu, anderer);
}

function binde(tabellenPfad, kennung, neu, anderer) {
  seite.tabellenPfad = tabellenPfad;
  seite.kennung = kennung;
  seite.neu = neu;
  seite.ausstehend = null;
  if (anderer) {
    seite.daten = null;
    seite.modus = MODUS_LESEN;
    seite.entwurf = null;
    ablauf.vergiss();
    verwendung.verwirf();
    // 4T-001941 (B2): Wer umbindet, verlässt die Bearbeitung des alten Gegenstands.
    void sperrAblauf.freigeben();
    sperrAblauf.vergiss();
  }
  openSystemPage(MASKEN_PAGE_ID, { nextToPath: tabellenPfad });
  // Eine laufende Bearbeitung desselben Datensatzes behält ihren gelesenen
  // Stand; frisch geholt wird nur im Lesen.
  if (seite.modus === MODUS_LESEN) void holeUndZeichne();
  else zeichne();
}

/**
 * Eröffnet eine Neuanlage in einer Tabelle und öffnet die Maske mit der
 * gezogenen Kennung (Bauplan B8). Gezogen wird beim Eröffnen (E5.1); eine
 * Neuanlage, die nie gespeichert wird, hinterlässt eine Lücke in der
 * Nummernfolge, und das ist gewollt.
 *
 * @param {string} tabellenPfad Pfad der Tabellen-Datei.
 * @returns {Promise<string|null>} Die gezogene Kennung, oder null.
 */
export async function neuerDatensatz(tabellenPfad) {
  if (!isExtensionActive('database')) return null;
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '') return null;
  let ergebnis;
  try {
    ergebnis = await api.databaseNeuanlage({ tabelle: tabellenPfad });
  } catch {
    ergebnis = null;
  }
  if (ergebnis && ergebnis.ok === true && typeof ergebnis.kennung === 'string') {
    oeffneMaske(tabellenPfad, ergebnis.kennung, { neu: true });
    return ergebnis.kennung;
  }
  const lage = ergebnis && Array.isArray(ergebnis.lagen) ? ergebnis.lagen[0] : null;
  const text = lageSatz(
    ergebnis && ergebnis.code,
    { ...(lage || {}), tabelle: tabellenName(tabellenPfad) },
    'database.form.newFailed',
  );
  showStatusbarHint('database.form.newFailed', { text, duration: 4000, error: true });
  return null;
}

/**
 * Der Weg des Kommandos «Neuer Datensatz»: die Tabelle des aktiven Reiters,
 * sonst ein Hinweis in der Statuszeile (Bauplan B8).
 *
 * @returns {Promise<void>}
 */
export async function neuerDatensatzFuerAktivenReiter() {
  if (!isExtensionActive('database')) return;
  const pane = state.panes[state.activePaneIndex];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const pfad =
    tab && !tab.systemPage && !tab.manualPage && typeof tab.path === 'string' && tab.path !== ''
      ? tab.path
      : null;
  let istTabelle = false;
  if (pfad) {
    try {
      const definition = await api.databaseTable({ filePath: pfad, tabelle: pfad });
      istTabelle = !!(definition && definition.gefunden && definition.istTabelle);
    } catch {
      istTabelle = false;
    }
  }
  if (!istTabelle) {
    showStatusbarHint('database.form.noTableActive', { duration: 3000, error: true });
    return;
  }
  await neuerDatensatz(pfad);
}

/**
 * Ist die Seite in diesem Fenster offen? (Prüffälle und Fehlersuche.)
 *
 * @returns {boolean}
 */
export function maskeOffen() {
  return !!findSystemTabAcrossPanes(MASKEN_PAGE_ID);
}

// Verdrahtungs-Schnittstelle zum Öffnen ohne direkten Modul-Import (Muster
// `scg:open-change-log`), für die End-zu-End-Suite. `recordId: null` öffnet
// den leeren Datensatz einer Neuanlage ohne gezogene Kennung.
document.addEventListener('scg:open-form', (ev) => {
  const detail = (ev && ev.detail) || {};
  const kennung = typeof detail.recordId === 'string' ? detail.recordId : null;
  oeffneMaske(detail.filePath, kennung);
});

// --- Daten ---------------------------------------------------------------------

// Die Antwort des Kanals in der Gestalt der Anzeige. Eine fehlende oder
// unvollständige Antwort wird zur gestörten Lage und nie zum leeren Datensatz.
function alsStand(antwort) {
  const a = antwort && typeof antwort === 'object' ? antwort : null;
  if (!a || typeof a.status !== 'string') return { status: 'error', code: null };
  if (a.status !== 'ready') return { status: a.status, code: a.code || null };
  if (!Array.isArray(a.fields) || !Array.isArray(a.zellen)) return { status: 'error', code: null };
  return { ...a, koerper: koerperStand(a.koerper) };
}

function gegenstandSchluessel() {
  return `${seite.tabellenPfad}\n${seite.kennung}\n${seite.neu}`;
}

async function holeUndZeichne() {
  const pfad = seite.tabellenPfad;
  if (!pfad) return;
  const schluessel = gegenstandSchluessel();
  if (laufendFuer === schluessel) return;
  const meine = ++anfrage;
  laufendFuer = schluessel;
  seite.laden = true;
  zeichne();
  let antwort;
  try {
    antwort = await api.databaseDatensatz({
      tabelle: pfad,
      kennung: seite.neu ? null : seite.kennung,
      sprache: state.language || null,
    });
  } catch {
    antwort = null;
  }
  // 4T-001942 (B2): Die Verweise werden aufgelöst, bevor die Seite zeichnet;
  // eine überholte Anfrage verwirft die Listen der laufenden nicht.
  const daten = alsStand(antwort);
  if (meine === anfrage) await verweise.aufloesen(daten);
  if (meine !== anfrage) return;
  laufendFuer = null;
  seite.laden = false;
  seite.daten = daten;
  zeichne();
  aktualisiereReiter();
}

// Der Reiter-Titel nennt die Anzeige-Form, und die kennt die Seite erst nach
// der Antwort; der Streifen wird deshalb danach neu gezeichnet.
function aktualisiereReiter() {
  const ort = findSystemTabAcrossPanes(MASKEN_PAGE_ID);
  if (ort) renderTabbar(ort.paneIdx);
}

// --- Bausteine -------------------------------------------------------------------

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

function knopf(className, key, beiKlick, { aus = false } = {}) {
  const b = el('button', `db-form-btn ${className}`, t(key));
  b.type = 'button';
  b.disabled = aus;
  b.addEventListener('click', beiKlick);
  return b;
}

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

function tabellenName(pfad) {
  return dateiName(pfad).replace(/\.md$/i, '');
}

/**
 * Der Satz zu einer Lage mit Code: zuerst der eigene Satz der Maske, dann der
 * Satz der Schreib-Schnittstelle, sonst der Rückfall. Ein Satz, dessen
 * Platzhalter sich hier nicht füllen lassen (eine Angabe, die es beim Lesen
 * nicht gibt), fällt ebenfalls zurück, statt Klammern zu zeigen. Seit
 * 4T-001940 trägt kein Satz der Schnittstelle mehr die Position; die eigenen
 * Sätze bleiben für die beiden Lagen, deren Wortlaut vom Speichern spricht.
 *
 * @param {string|null} code Code der Lage.
 * @param {object} werte Einsetz-Werte (`tabelle`, `tabellen`, `id`).
 * @param {string} rueckfallKey Schlüssel des Rückfalls.
 * @returns {string}
 */
function lageSatz(code, werte, rueckfallKey) {
  if (typeof code === 'string' && code !== '') {
    for (const key of [`database.form.error.${code}`, `database.auftrag.${code}`]) {
      if (!hatSchluessel(key)) continue;
      let text = t(key);
      for (const [name, wert] of Object.entries(werte || {})) {
        if (wert === null || wert === undefined || typeof wert === 'object') continue;
        text = text.split(`{${name}}`).join(String(wert));
      }
      if (!/\{[a-zA-Z]+\}/.test(text)) return text;
    }
  }
  return t(rueckfallKey);
}

function istBearbeitbar(daten) {
  return !(daten && daten.editable && daten.editable.erfuellt === false);
}

// Die Aussage «nicht bearbeitbar» mit dem Meldungstext der Bedingung in der
// Sprache des Anwenders, sonst dem Grund der Auswertung.
function nichtBearbeitbarText(editable) {
  const meldung = loeseBeschriftung(editable.meldung, state.language || null);
  let grund = meldung;
  if (!grund) {
    const key = `database.form.notEditableReason.${editable.grund}`;
    grund = hatSchluessel(key) ? t(key) : t('database.form.notEditableReason.default');
  }
  return t('database.form.notEditable').replace('{reason}', grund);
}

function hatUngespeicherteBearbeitung() {
  if (seite.modus !== MODUS_BEARBEITEN || !seite.entwurf) return false;
  const daten = seite.daten;
  if (!daten || daten.status !== 'ready') return false;
  return daten.zellen.some((zelle) => {
    const entwurf = seite.entwurf[zelle.name];
    return typeof entwurf === 'string' && entwurf !== String(zelle.text || '');
  });
}

// --- Speichern und Löschen (4T-001940, Bauplan B4 bis B6) ------------------------

// Der Ablauf selbst steht in `masken-speichern.js`; hier bleibt, was den
// Zustand der Seite nach dem Ergebnis setzt.
const ablauf = erzeugeSpeicherAblauf({
  seite,
  // 4T-001941 (B2): Nach dem Ergebnis gibt der Sperr-Ablauf die Sperre frei,
  // bevor die Seite ihren Zustand setzt.
  sende: (auftrag) => sperrAblauf.sendeAuftrag(auftrag, (a) => api.databaseAuftrag({ auftrag: a })),
  t,
  hat: hatSchluessel,
  sprache: () => state.language || null,
  schluessel: gegenstandSchluessel,
  zeichne: () => zeichne(),
  hinweis: (key) => showStatusbarHint(key, { duration: 3000 }),
  gelungen,
  neuLaden,
  loeschenAbgebrochen: () => void sperrAblauf.freigeben(),
});

// 4T-001941 (Bauplan B2 bis B4): Der Sperr-Ablauf; nach gehaltener Sperre geht
// es mit dem Bearbeiten beziehungsweise der Lösch-Rückfrage weiter.
const sperrAblauf = erzeugeSperrAblauf({
  seite,
  sende: (params) => api.databaseSperre(params),
  t,
  hat: hatSchluessel,
  zeitpunkt: localTimestamp,
  schluessel: gegenstandSchluessel,
  zeichne: () => zeichne(),
  hinweis: (key) => showStatusbarHint(key, { duration: 4000 }),
  weiter: { bearbeiten: beginneBearbeiten, loeschen: () => ablauf.fragLoeschen() },
});

// Nach Erfolg neu lesen und lesend zeigen (B5); nach dem Löschen schließt die
// Seite ihren Reiter.
function gelungen(art) {
  seite.entwurf = null;
  seite.modus = MODUS_LESEN;
  if (art === ART_LOESCHEN) {
    showStatusbarHint('database.form.deleted', { duration: 3000 });
    const ort = findSystemTabAcrossPanes(MASKEN_PAGE_ID);
    if (ort) void closeTab(ort.paneIdx, ort.tabIdx);
    return;
  }
  seite.neu = false;
  showStatusbarHint('database.form.saved', { duration: 3000 });
  void holeUndZeichne();
}

// «Neu laden» bei einer Fremd-Änderung: Bearbeitung verwerfen, frisch lesen.
function neuLaden() {
  seite.entwurf = null;
  seite.modus = MODUS_LESEN;
  void sperrAblauf.freigeben();
  void holeUndZeichne();
}

// --- Modus-Wechsel ---------------------------------------------------------------

// «Bearbeiten» nimmt zuerst die Sperre (B2); erst danach werden die Felder frei.
function bearbeiten() {
  const daten = seite.daten;
  if (!daten || daten.status !== 'ready' || !istBearbeitbar(daten)) return;
  void sperrAblauf.nehmen(ZWECK_BEARBEITEN);
}

function beginneBearbeiten() {
  const daten = seite.daten;
  if (!daten || daten.status !== 'ready' || !istBearbeitbar(daten)) return;
  seite.entwurf = {};
  for (const zelle of daten.zellen) seite.entwurf[zelle.name] = String(zelle.text || '');
  seite.modus = MODUS_BEARBEITEN;
  ablauf.vergiss();
  zeichne();
  const erstes = seite.container && seite.container.querySelector('.db-form-input');
  if (erstes && typeof erstes.focus === 'function') erstes.focus();
}

function verwerfen() {
  seite.entwurf = null;
  seite.modus = MODUS_LESEN;
  ablauf.vergiss();
  void sperrAblauf.freigeben();
  zeichne();
}

// --- Seiten-Aufbau -----------------------------------------------------------------

function kopfZeile(daten) {
  if (!seite.neu) {
    const anzeige = (daten && daten.anzeige) || seite.kennung || '';
    return t('database.form.headRecord').replace('{record}', anzeige);
  }
  return seite.kennung
    ? t('database.form.headNew').replace('{id}', seite.kennung)
    : t('database.form.headNewNoId');
}

function zeichneAktionen(kopf, daten) {
  if (!daten || daten.status !== 'ready') return;
  const leiste = el('div', 'db-form-actions');
  const bearbeitbar = istBearbeitbar(daten);
  if (seite.modus === MODUS_BEARBEITEN) {
    leiste.appendChild(
      knopf('db-form-save', 'database.form.action.save', ablauf.speichern, { aus: seite.sendet }),
    );
    leiste.appendChild(knopf('db-form-discard', 'database.form.action.discard', verwerfen));
  } else {
    if (bearbeitbar)
      leiste.appendChild(knopf('db-form-edit', 'database.form.action.edit', bearbeiten));
    if (bearbeitbar && !seite.neu) {
      // Löschen fragt in der Seite zurück (B6).
      leiste.appendChild(
        knopf(
          'db-form-delete',
          'database.form.action.delete',
          () => void sperrAblauf.nehmen(ZWECK_LOESCHEN),
          { aus: seite.sendet },
        ),
      );
    }
    if (!seite.neu && seite.kennung) {
      leiste.appendChild(
        knopf('db-form-changelog', 'database.form.action.changeLog', () =>
          oeffneBelegAnsicht(seite.tabellenPfad, seite.kennung),
        ),
      );
    }
  }
  kopf.appendChild(leiste);
}

function zeichneBestaetigung(wurzel) {
  if (!seite.ausstehend) return;
  const block = el('div', 'db-form-confirm');
  block.setAttribute('role', 'alert');
  block.appendChild(el('p', 'db-form-confirm-text', t('database.form.confirm.text')));
  const leiste = el('div', 'db-form-confirm-actions');
  leiste.appendChild(
    knopf('db-form-confirm-discard', 'database.form.confirm.discard', () => {
      const ziel = seite.ausstehend;
      seite.entwurf = null;
      seite.modus = MODUS_LESEN;
      if (ziel) binde(ziel.tabellenPfad, ziel.kennung, ziel.neu, true);
    }),
  );
  leiste.appendChild(
    knopf('db-form-confirm-back', 'database.form.confirm.back', () => {
      seite.ausstehend = null;
      zeichne();
    }),
  );
  block.appendChild(leiste);
  wurzel.appendChild(block);
}

// Die Lagen aus Bauplan B3, jede mit eigenem Text und keine als Ausfall der
// Seite: kein Zugriff, Fehler mit Code; bereit ergibt null.
function lageText(daten) {
  if (daten.status === 'ready') return null;
  if (daten.status === 'unavailable') return t('database.form.noAccess');
  return lageSatz(
    daten.code,
    { tabelle: tabellenName(seite.tabellenPfad), id: seite.kennung },
    'database.form.readError',
  );
}

function zeichneHinweise(wurzel, hints) {
  if (hints.length === 0) return;
  const block = el('div', 'db-form-hints');
  block.appendChild(el('span', 'db-form-hints-title', t('database.form.hints')));
  const liste = el('ul', 'db-form-hints-list');
  for (const hinweis of hints) {
    const punkt = el('li', 'db-form-hint', hinweisSatz(hinweis, t));
    punkt.dataset.formCode = String(hinweis.code || '');
    liste.appendChild(punkt);
  }
  block.appendChild(liste);
  wurzel.appendChild(block);
}

// Der Körper: Markdown-Segmente als erzeugte Teilbäume (Klasse «erzeugter
// Teilbaum» des Wächters render-teilbaum-schritte: Darstellung und Befüllung
// ohne Bearbeitbarkeit, denn die Blöcke sind nicht das offene Dokument, sondern
// aus der Definition oder der Masken-Datei erzeugt), Feld-Segmente als
// Feld-Elemente. Die Nachbehandlung läuft erst, wenn die Blöcke im Dokument
// hängen.
function zeichneKoerper(wurzel, daten) {
  const koerper = el('div', 'db-form-body');
  const bloecke = [];
  const felder = new Map(daten.fields.map((feld) => [feld.name, feld]));
  const zellen = new Map(daten.zellen.map((zelle) => [zelle.name, zelle]));
  for (const segment of daten.koerper.segmente) {
    if (segment && segment.art === 'markdown') {
      if (String(segment.text || '').trim() === '') continue;
      const block = el('div', 'db-form-md markdown-body');
      block.innerHTML = api.renderMarkdown(String(segment.text), seite.tabellenPfad);
      koerper.appendChild(block);
      bloecke.push(block);
    } else if (segment && segment.art === 'feld') {
      const feld = felder.get(segment.name) || { name: segment.name, type: 'string' };
      const entwurf = seite.entwurf ? seite.entwurf[segment.name] : undefined;
      const element = koerper.appendChild(
        baueFeldElement({
          feld,
          zelle: zellen.get(segment.name) || null,
          modus: seite.modus,
          text: typeof entwurf === 'string' ? entwurf : undefined,
          sprache: state.language || null,
          ...verweise.optionen(feld),
          beiAenderung: (name, text) => {
            if (seite.entwurf) seite.entwurf[name] = text;
          },
        }),
      );
      markiereFeld(element, seite.befunde);
    }
  }
  wurzel.appendChild(koerper);
  return bloecke;
}

function zeichne() {
  const container = seite.container;
  if (!container || !container.isConnected) return;
  container.innerHTML = '';
  const wurzel = el('div', 'db-form-page');
  wurzel.dataset.formMode = seite.modus;
  const daten = seite.daten;

  const kopf = el('div', 'db-form-head');
  const titel = el('div', 'db-form-titles');
  titel.appendChild(el('h3', 'db-form-heading', tabellenName(seite.tabellenPfad)));
  titel.appendChild(el('div', 'db-form-record', kopfZeile(daten)));
  zeichneQuelle(titel, seite);
  kopf.appendChild(titel);
  zeichneAktionen(kopf, daten);
  wurzel.appendChild(kopf);
  verwendung.zeichne(kopf, wurzel, seite);

  zeichneBestaetigung(wurzel);
  sperrAblauf.zeichneKonflikt(wurzel);
  ablauf.zeichneLage(wurzel);
  if (seite.laden) wurzel.appendChild(el('p', 'db-form-note', t('database.form.loading')));

  let bloecke = [];
  if (daten) {
    const lage = lageText(daten);
    if (lage) {
      wurzel.appendChild(el('p', 'db-form-note db-form-lage', lage));
    } else {
      if (!istBearbeitbar(daten)) {
        wurzel.appendChild(el('p', 'db-form-not-editable', nichtBearbeitbarText(daten.editable)));
      }
      zeichneHinweise(wurzel, daten.koerper.hints);
      bloecke = zeichneKoerper(wurzel, daten);
    }
  }
  container.appendChild(wurzel);
  for (const block of bloecke) applyTeilbaumSchritte(block, seite.tabellenPfad);
  // Das erste betroffene Feld eines abgewiesenen Auftrags bekommt einmal den
  // Fokus (B5).
  const fokus = seite.fokus;
  seite.fokus = null;
  const ziel = fokus
    ? [...wurzel.querySelectorAll('.db-form-field')].find((f) => f.dataset.field === fokus)
    : null;
  const eingabe = ziel && ziel.querySelector('.db-form-input');
  if (eingabe && typeof eingabe.focus === 'function') eingabe.focus();
}

// --- Registrierung -------------------------------------------------------------

registerSystemPage({
  id: MASKEN_PAGE_ID,
  titleKey: 'database.form.pageTitle',
  // Der Reiter nennt Tabellen-Datei und Anzeige-Form des Datensatzes, bei der
  // Neuanlage die Tabellen-Datei und «neu» (Bauplan B2).
  title() {
    if (!seite.tabellenPfad) return t('database.form.pageTitle');
    const datei = dateiName(seite.tabellenPfad);
    if (seite.neu) return t('database.form.tabTitleNew').replace('{file}', datei);
    const daten = seite.daten;
    const anzeige = (daten && daten.anzeige) || seite.kennung || '';
    return t('database.form.tabTitle').replace('{file}', datei).replace('{record}', anzeige);
  },
  onOpen() {
    // Frischer Seiten-Zustand je Neu-Öffnen; der gebundene Gegenstand bleibt
    // stehen, er ist gerade gesetzt worden.
    seite.daten = null;
    seite.modus = MODUS_LESEN;
    seite.entwurf = null;
    seite.ausstehend = null;
    ablauf.vergiss();
    sperrAblauf.vergiss();
    seite.sendet = false;
  },
  mount(container) {
    seite.container = container;
    zeichne();
    if (seite.tabellenPfad && !seite.daten && !seite.laden) void holeUndZeichne();
  },
  onClose() {
    seite.container = null;
    // 4T-001941 (B2): Wer den Reiter schließt, beendet die Bearbeitung.
    void sperrAblauf.freigeben();
    sperrAblauf.vergiss();
  },
});

// 4T-001941 (B2): Schließen oder Neuladen des Fensters gibt die Sperre frei
// (Muster der Notiz- und Eigenschafts-Panels). Der Kanal-Aufruf ist abgeschickt,
// bevor das Fenster geht; bleibt er dennoch aus, hält der Prozess die Sperre bis
// zu seinem Ende, und danach übernimmt ein Neustart auf diesem Rechner sie als
// Absturz-Rest.
window.addEventListener('beforeunload', () => {
  void sperrAblauf.freigeben();
});
