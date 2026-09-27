// 4T-001792 (Epic 3E-000255, E10.14): Die lesende Beleg-Ansicht am Datensatz —
// was an einem Datensatz wann von wem geändert wurde.
//
// **Muster ist die Historien-Seite** (`../views/history-page.js`): eine nur
// lesende System-Seite, eine Instanz je Fenster, an einen Gegenstand gebunden,
// und erneutes Öffnen für einen anderen Gegenstand bindet die bestehende
// Instanz um. Gebunden ist diese Seite an **zwei** Dinge, an die Tabellen-Datei
// und an die interne Kennung des Datensatzes; erst beide zusammen bezeichnen
// ihren Gegenstand.
//
// **Registriert wird beim Laden des Moduls**, wie beim Geschwister
// `datenbank-uebersicht-seite.js`. Dessen Begründung gilt hier unverändert: Die
// Registrierung legt einen Eintrag in eine Karte, mehr nicht, und das Modul
// liegt in keinem Import-Zyklus zu `tabs`/`views`, der den früheren Ort in
// einer init-Funktion nötig machte. Anders als das Geschwister hat die Seite
// heute noch keinen Zugang, der sie importiert, denn der Zugang an der
// Datensatz-Zeile ist der letzte Bau-Schritt des Vorgangs. Bis dahin lädt
// `app-init.js` das Modul als Seiteneffekt, damit die Registrierung steht.
//
// **Die Daten kommen fertig aus EINEM Kanal** (`database:changeLog`). Die Seite
// baut keine zweite Auswertung: Reihenfolge, Befunde des Lesens und die
// Auskunft über die Verkettung entstehen im Haupt-Prozess, und eine eigene
// Prüfung hier wäre eine zweite Quelle für dieselbe Aussage.
//
// **Nur lesend, und zwar nachweisbar** (Bauplan S10): Die Seite erzeugt kein
// Bedien-Element für Ändern, Löschen oder Anlegen, und sie ruft außer dem einen
// lesenden Kanal keinen weiteren. Ein Wächter-Fall hält das am Quelltext fest.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  registerSystemPage,
  openSystemPage,
  findSystemTabAcrossPanes,
} from '../app/system-pages.js';
// 4T-001761 (Epic 3E-000253): Der Schalt-Zustand der Erweiterung «Datenbank».
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
// 4T-001792 (Bauplan S9): Die lokale Zeitpunkt-Anzeige aus dem gemeinsamen
// Modul, dasselbe Format wie in der Historien-Seite.
import { localTimestamp } from '../time-format.js';
// Die Arten und die beiden Gründe einer Unterbrechung kommen aus dem
// Format-Modul und nicht als Zeichenketten hierher: Wer sie abschreibt, hat
// beim nächsten Zusatz eine zweite Wahrheit.
import {
  ART_EXTERNAL,
  ART_MERGED,
  LUECKE_BESCHAEDIGT,
} from '../../../shared/database/change-record.js';

export const BELEG_ANSICHT_PAGE_ID = 'database-change-log';

// 4T-001792 (Bauplan S7): Das Fenster der Anzeige. Mit den Vorgaben der
// Verdichtung trägt ein Datensatz selten mehr als rund 200 Belege; 500 deckt
// das mit Abstand und bleibt flüssig. Nur eine Tabelle mit abgeschalteter
// Verdichtung kommt darüber, und dort sagt die Angabe unter dem Kopf, dass es
// mehr gibt. Kein stilles Abschneiden.
export const MAX_BELEGE = 500;

// Seiten-Zustand: der gebundene Gegenstand, die geholte Auskunft und das
// Lade-Kennzeichen. Flüchtig, er überlebt das Schließen der Seite nicht
// (Muster des Geschwisters).
const seite = {
  container: null,
  tabellenPfad: null,
  kennung: null,
  daten: null,
  laden: false,
};

// Laufende Nummer der Anfragen. Sie trennt die Antwort der jüngsten Anfrage von
// der einer überholten: Wer während des Ladens auf einen anderen Datensatz
// umbindet, soll dessen Belege sehen und nicht die des alten, und die Seite
// darf dabei nicht im Lade-Zustand hängen bleiben.
let anfrage = 0;
// Der Gegenstand der laufenden Anfrage, oder null. Er hält die DOPPELTE Frage
// auf: Beim Öffnen stoßen zwei Wege das Holen unmittelbar hintereinander an,
// der Zugang und das Montieren des Seiten-DOM. Ein bloßes Lade-Kennzeichen
// genügte dafür nicht, weil es auch das Umbinden auf einen anderen Datensatz
// abwiese und die Seite dann im Lade-Zustand stehen blieb.
let laufendFuer = null;

// --- Zugang ------------------------------------------------------------------

/**
 * Öffnet die Beleg-Ansicht für einen Datensatz.
 *
 * **Das Wurzel-Tor des Aus-Zustands** steht hier und nicht an den Zugängen:
 * Ist die Erweiterung «Datenbank» abgeschaltet, kehrt die Funktion sofort
 * zurück, ohne Meldung. Eine abgeschaltete Funktion meldet sich nicht, sie ist
 * nicht da (Linie aus 4T-001761).
 *
 * Erneutes Öffnen für einen anderen Datensatz bindet die bestehende Instanz um
 * (Vorbild `openHistoryPage`); der Reiter entsteht neben dem Reiter der
 * Tabellen-Datei und wandert beim Umbinden mit.
 *
 * @param {string} tabellenPfad Pfad der Tabellen-Datei.
 * @param {string} kennung Interne Kennung des Datensatzes.
 */
export function oeffneBelegAnsicht(tabellenPfad, kennung) {
  if (!isExtensionActive('database')) return;
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '') return;
  if (typeof kennung !== 'string' || kennung === '') return;
  const umbinden = seite.tabellenPfad !== tabellenPfad || seite.kennung !== kennung;
  seite.tabellenPfad = tabellenPfad;
  seite.kennung = kennung;
  if (umbinden) seite.daten = null;
  openSystemPage(BELEG_ANSICHT_PAGE_ID, { nextToPath: tabellenPfad });
  void holeUndZeichne();
}

/**
 * Ist die Seite in diesem Fenster offen? (Prüffälle und Fehlersuche.)
 *
 * @returns {boolean} true, wenn ein Reiter der Seite steht.
 */
export function belegAnsichtOffen() {
  return !!findSystemTabAcrossPanes(BELEG_ANSICHT_PAGE_ID);
}

// Verdrahtungs-Schnittstelle zum Öffnen ohne direkten Modul-Import (Muster
// `scg:open-system-page` in `system-pages.js` und `scg:open-manual-page`):
// genutzt von der End-zu-End-Suite, solange der Zugang an der Datensatz-Zeile
// noch nicht besteht. Sie trägt die beiden Angaben des Gegenstands, die das
// allgemeine Seiten-Ereignis nicht kennt.
document.addEventListener('scg:open-change-log', (ev) => {
  const detail = (ev && ev.detail) || {};
  oeffneBelegAnsicht(detail.filePath, detail.recordId);
});

// --- Daten -------------------------------------------------------------------

// Die Antwort des Kanals in der Gestalt, mit der die Anzeige arbeitet. Eine
// fehlende oder unvollständige Antwort wird zur gestörten Lage und nie zur
// leeren Liste: «keine Belege» und «nicht gelesen» sind zwei Aussagen.
function alsStand(antwort) {
  const a = antwort && typeof antwort === 'object' ? antwort : null;
  if (!a) return { status: 'error', belege: [], befunde: [], luecken: [] };
  const verkettung = a.verkettung && typeof a.verkettung === 'object' ? a.verkettung : {};
  return {
    status: typeof a.status === 'string' ? a.status : 'error',
    belege: Array.isArray(a.belege) ? a.belege : [],
    befunde: Array.isArray(a.befunde) ? a.befunde : [],
    luecken: Array.isArray(verkettung.luecken) ? verkettung.luecken : [],
  };
}

async function holeUndZeichne() {
  const pfad = seite.tabellenPfad;
  const kennung = seite.kennung;
  if (!pfad || !kennung) return;
  if (laufendFuer && laufendFuer.pfad === pfad && laufendFuer.kennung === kennung) return;
  const meine = ++anfrage;
  laufendFuer = { pfad, kennung };
  seite.laden = true;
  zeichne();
  let antwort;
  try {
    antwort = await api.databaseChangeLog({ filePath: pfad, recordId: kennung });
  } catch {
    antwort = null;
  }
  // Eine jüngere Anfrage läuft: Diese Antwort gehört zu einem Gegenstand, an
  // dem die Seite nicht mehr hängt. Der Gegenstand der laufenden Anfrage bleibt
  // stehen, weil die jüngere ihn bereits gesetzt hat.
  if (meine !== anfrage) return;
  laufendFuer = null;
  seite.laden = false;
  seite.daten = alsStand(antwort);
  zeichne();
}

// --- Bausteine ---------------------------------------------------------------

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

// Der Dateiname ohne Ordner, ohne Umweg über einen Kanal: Die Seite ruft
// ausschließlich ihren eigenen (Bauplan S10, Muster `baseName` der
// Historien-Seite).
function dateiName(pfad) {
  const text = String(pfad || '');
  const idx = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return idx >= 0 ? text.slice(idx + 1) : text;
}

// Die Art als übersetztes Wort. Ein unbekannter Wert fällt auf einen
// allgemeinen Satz mit dem Wort in Klammern zurück und bleibt nie leer; ein
// Beleg ohne auslegbare Art trägt seinen Befund und braucht hier kein Wort.
function artWort(art) {
  if (typeof art !== 'string' || art === '') return '';
  const schluessel = `database.changeLog.kind.${art}`;
  const text = t(schluessel);
  if (text !== schluessel) return text;
  return t('database.changeLog.kind.unknown').replace('{kind}', art);
}

// Der Satz zu einem Befund des Lesens (Bauplan S6). Der Vorrat steht in dieser
// Ansicht und nicht im Hinweis-Katalog der Tabellen-Definition: Jener
// beschreibt Fehlerlagen einer Definition und speist die Übersicht der
// Datenbank, in deren Liste ein Beleg-Befund nicht gehört.
function befundText(code) {
  const schluessel = `database.changeLog.issue.${code}`;
  const text = t(schluessel);
  if (text !== schluessel) return text;
  return t('database.changeLog.issue.unknown').replace('{code}', String(code || ''));
}

// Ein Wert mit seiner Beschriftung. Drei Lagen, drei Gestalten: Der **fehlende**
// Wert und der **leere** Wert tragen je eine eigene, übersetzte Kennzeichnung
// und sehen verschieden aus; ein vorhandener Wert erscheint unverfälscht mit
// erhaltenen Zeilenumbrüchen. Gesetzt wird er über `textContent`, nie als
// Auszeichnung: Der Inhalt einer Zelle ist der Text des Anwenders und kein
// Markup.
function wertBlock(klasse, labelKey, wert) {
  const block = el('div', `db-changelog-value ${klasse}`);
  block.appendChild(el('span', 'db-changelog-value-label', t(labelKey)));
  if (wert === null || wert === undefined) {
    block.appendChild(
      el('span', 'db-changelog-value-missing', t('database.changeLog.valueMissing')),
    );
  } else if (wert === '') {
    block.appendChild(el('span', 'db-changelog-value-empty', t('database.changeLog.valueEmpty')));
  } else {
    block.appendChild(el('div', 'db-changelog-value-text', String(wert)));
  }
  return block;
}

// --- Ein Beleg ---------------------------------------------------------------

function zeichneKopfzeile(eintrag, beleg) {
  const kopf = el('div', 'db-changelog-entry-head');
  kopf.appendChild(
    el('span', 'db-changelog-time', beleg.zeitpunkt ? localTimestamp(beleg.zeitpunkt) : ''),
  );
  kopf.appendChild(el('span', 'db-changelog-kind', artWort(beleg.art)));
  // Verdichtete Belege und Belege über eine Änderung von außen zeigen KEINEN
  // Urheber. Bei der Spanne gibt es viele, bei der Fremd-Änderung keinen
  // bekannten; einen zu nennen wäre in beiden Fällen eine Behauptung.
  const ohneUrheber = beleg.art === ART_MERGED || beleg.art === ART_EXTERNAL;
  if (!ohneUrheber) {
    kopf.appendChild(el('span', 'db-changelog-user', beleg.benutzer || ''));
    kopf.appendChild(el('span', 'db-changelog-machine', beleg.rechner || ''));
  }
  eintrag.appendChild(kopf);
}

function zeichneVerdichtung(eintrag, beleg) {
  const v = beleg.verdichtung;
  if (!v) return;
  const block = el('div', 'db-changelog-merged');
  block.appendChild(
    el(
      'span',
      'db-changelog-merged-count',
      t('database.changeLog.merged.replaced').replace('{count}', String(v.anzahl)),
    ),
  );
  block.appendChild(
    el(
      'span',
      'db-changelog-merged-since',
      t('database.changeLog.merged.since').replace('{since}', localTimestamp(v.seit)),
    ),
  );
  const arten = (v.arten || []).map((art) => artWort(art)).filter((wort) => wort !== '');
  block.appendChild(
    el(
      'span',
      'db-changelog-merged-kinds',
      t('database.changeLog.merged.kinds').replace('{kinds}', arten.join(', ')),
    ),
  );
  block.appendChild(
    el('span', 'db-changelog-merged-note', t('database.changeLog.merged.noAuthor')),
  );
  eintrag.appendChild(block);
}

function zeichneFelder(eintrag, beleg) {
  const felder = Array.isArray(beleg.felder) ? beleg.felder : [];
  if (felder.length === 0) return;
  // Ein Beleg über eine festgestellte Änderung von außen hält keine eigene
  // Änderung fest, sondern eine Abweichung. Seine beiden Werte heißen deshalb
  // «erwartet» und «vorgefunden» und nicht «vorher» und «nachher».
  const extern = beleg.art === ART_EXTERNAL;
  const altKey = extern ? 'database.changeLog.col.expected' : 'database.changeLog.col.old';
  const neuKey = extern ? 'database.changeLog.col.found' : 'database.changeLog.col.new';
  const block = el('div', 'db-changelog-fields');
  for (const feld of felder) {
    const zeile = el('div', 'db-changelog-field');
    zeile.appendChild(el('span', 'db-changelog-field-name', String(feld.name || '')));
    zeile.appendChild(wertBlock('db-changelog-value-old', altKey, feld.alt));
    zeile.appendChild(wertBlock('db-changelog-value-new', neuKey, feld.neu));
    block.appendChild(zeile);
  }
  eintrag.appendChild(block);
}

function belegEintrag(beleg) {
  const klassen = ['db-changelog-entry'];
  if (beleg.art) klassen.push(`db-changelog-kind-${beleg.art}`);
  if (beleg.beschaedigt) klassen.push('db-changelog-damaged');
  const eintrag = el('li', klassen.join(' '));
  zeichneKopfzeile(eintrag, beleg);
  // Ein unlesbarer Beleg erscheint als Zeile mit seinem Befund, nie
  // stillschweigend ausgelassen (Bauplan S5).
  if (beleg.beschaedigt) {
    eintrag.appendChild(el('p', 'db-changelog-issue', befundText(beleg.code)));
    return eintrag;
  }
  if (beleg.art === ART_EXTERNAL) {
    eintrag.appendChild(el('p', 'db-changelog-external', t('database.changeLog.external.note')));
  }
  zeichneVerdichtung(eintrag, beleg);
  zeichneFelder(eintrag, beleg);
  return eintrag;
}

// Eine Unterbrechung der Spur als eigene, hervorgehobene Zeile. Die beiden
// Gründe sehen verschieden aus: Beim nicht anschließenden Wert steht das Feld
// im Satz, beim unlesbaren Beleg gibt es keines.
function lueckenEintrag(luecke) {
  const beschaedigt = luecke.grund === LUECKE_BESCHAEDIGT;
  const eintrag = el(
    'li',
    `db-changelog-break db-changelog-break-${beschaedigt ? 'damaged' : 'value'}`,
  );
  eintrag.textContent = beschaedigt
    ? t('database.changeLog.break.damaged')
    : t('database.changeLog.break.value').replace('{field}', String(luecke.feld || ''));
  return eintrag;
}

// --- Seiten-Aufbau -----------------------------------------------------------

function seitenTitel() {
  return t('database.changeLog.heading')
    .replace('{record}', String(seite.kennung || ''))
    .replace('{file}', dateiName(seite.tabellenPfad));
}

// Die Liste der Belege, **jüngster zuerst**. Maßgeblich bleibt die Reihenfolge
// der Datei, sie wird nur umgekehrt gezeigt; sortiert wird nicht nach dem
// Zeitpunkt, weil zwei Rechner-Uhren auseinanderlaufen dürfen (Bauplan S3).
//
// **Das Fenster schneidet erst hier**, nach der Auswertung der Verkettung im
// Haupt-Prozess. Eine Unterbrechung am unteren Rand des Fensters bleibt damit
// sichtbar; wer zuerst schneidet, verliert sie, weil der älteste gezeigte Beleg
// dann keinen Vorgänger mehr hätte, an dem er scheitern könnte.
//
// Die Positionen der Unterbrechungen zählen in der Datei-Reihenfolge. Eine
// Unterbrechung an Position p fällt zwischen Beleg p-1 und Beleg p auf; in der
// umgekehrten Anzeige liegt diese Stelle unmittelbar UNTER dem Beleg p.
function zeichneListe(wurzel, daten) {
  const belege = daten.belege;
  const gesamt = belege.length;
  const abPosition = Math.max(0, gesamt - MAX_BELEGE);
  if (gesamt > MAX_BELEGE) {
    wurzel.appendChild(
      el(
        'p',
        'db-changelog-window',
        t('database.changeLog.window')
          .replace('{shown}', String(gesamt - abPosition))
          .replace('{total}', String(gesamt)),
      ),
    );
  }
  const luecken = new Map();
  for (const luecke of daten.luecken) {
    if (typeof luecke.position !== 'number') continue;
    if (!luecken.has(luecke.position)) luecken.set(luecke.position, []);
    luecken.get(luecke.position).push(luecke);
  }
  const liste = el('ol', 'db-changelog-list');
  for (let position = gesamt - 1; position >= abPosition; position--) {
    liste.appendChild(belegEintrag(belege[position]));
    for (const luecke of luecken.get(position) || []) liste.appendChild(lueckenEintrag(luecke));
  }
  wurzel.appendChild(liste);
}

// Befunde des Lesens, die NICHT zu einem gezeigten Beleg gehören. Sie stammen
// von Belegen anderer Datensätze oder von Belegen, deren Zuordnung selbst
// unlesbar ist. Genannt werden sie, weil die Datei dann mehr enthält, als diese
// Seite zeigen kann, und Schweigen darüber die Geschichte vollständiger
// aussehen ließe, als sie ist.
function zeichneFremdeBefunde(wurzel, daten) {
  const eigene = daten.belege.filter((beleg) => beleg.beschaedigt).length;
  const weitere = daten.befunde.length - eigene;
  if (weitere <= 0) return;
  wurzel.appendChild(
    el(
      'p',
      'db-changelog-note db-changelog-other-issues',
      t('database.changeLog.otherIssues').replace('{count}', String(weitere)),
    ),
  );
}

// Die vier Lagen aus Bauplan S8, jede mit eigenem Text und keine als Ausfall
// der Seite: Laden, kein Zugriff, nicht lesbar, keine Belege.
function lageText(daten) {
  if (daten.status === 'unavailable') return 'database.changeLog.noAccess';
  if (daten.status !== 'ready') return 'database.changeLog.readError';
  if (daten.belege.length === 0) return 'database.changeLog.empty';
  return null;
}

function zeichne() {
  const container = seite.container;
  if (!container || !container.isConnected) return;
  container.innerHTML = '';
  const wurzel = el('div', 'db-changelog-page');

  const kopf = el('div', 'db-changelog-head');
  kopf.appendChild(el('h3', 'db-changelog-heading', seitenTitel()));
  const knopf = el('button', 'db-changelog-refresh', t('database.changeLog.refresh'));
  knopf.type = 'button';
  knopf.disabled = seite.laden;
  knopf.addEventListener('click', () => void holeUndZeichne());
  kopf.appendChild(knopf);
  wurzel.appendChild(kopf);

  if (seite.laden) {
    wurzel.appendChild(el('p', 'db-changelog-note', t('database.changeLog.loading')));
  }
  const daten = seite.daten;
  if (daten) {
    const lage = lageText(daten);
    if (lage) wurzel.appendChild(el('p', 'db-changelog-note db-changelog-empty', t(lage)));
    else zeichneListe(wurzel, daten);
    zeichneFremdeBefunde(wurzel, daten);
  }
  container.appendChild(wurzel);
}

// --- Registrierung -----------------------------------------------------------

registerSystemPage({
  id: BELEG_ANSICHT_PAGE_ID,
  titleKey: 'database.changeLog.pageTitle',
  // Der Reiter nennt Datensatz und Tabelle, damit zwei nacheinander geöffnete
  // Gegenstände unterscheidbar bleiben; der titleKey ist der Rückfall, solange
  // nichts gebunden ist.
  title() {
    if (!seite.kennung) return t('database.changeLog.pageTitle');
    return t('database.changeLog.tabTitle')
      .replace('{record}', String(seite.kennung))
      .replace('{file}', dateiName(seite.tabellenPfad));
  },
  onOpen() {
    // Frischer Seiten-Zustand je Neu-Öffnen (Muster der Einstellungs-Seite).
    // Der gebundene Gegenstand bleibt stehen: Er ist gerade gesetzt worden.
    seite.daten = null;
  },
  mount(container) {
    seite.container = container;
    zeichne();
    if (seite.tabellenPfad && !seite.daten && !seite.laden) void holeUndZeichne();
  },
  onClose() {
    seite.container = null;
  },
});
