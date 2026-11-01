// 4T-002406 (Epic 3E-000266, Entscheidung F7 Option A): Dokument und Einzel-Maske
// einer Karteikarte — das Klick-Ziel eines Datensatzes und der Handgriff «In der
// Maske öffnen».
//
// **Das Klick-Ziel.** In der Kartei-Form ist der Datensatz ein Dokument, und das
// Dokument ist die erste Ansicht (E7.6). Ein Datensatz-Treffer der Suche, ein
// Datensatz-Verweis im Abfrage-Ergebnis und ein Verweis `[[Tabelle#^…]]` im
// Fließtext öffnen deshalb bei einer Karteikarte ihr Dokument; bei einer Tabelle
// in Tabellen-Form bleibt das Ziel die Einzel-Maske. Alle drei Wege laufen über
// `openRecordHit` (`query/record-hit-click.js`); dort meldet sich die Weiche
// dieses Moduls an. Die Zeile einer Listen-Maske und des Positions-Bereichs geht
// nicht über die Weiche, sie bleibt der Weg in die Einzel-Maske.
//
// **Woher die Weiche die Karteikarte kennt.** Weder der Treffer der Suche
// (`sprung` mit Tabelle und Kennung) noch die Auskunft über einen Verweis
// (`{ tabelle, kennung }`) noch die Herkunft einer Abfrage-Zeile tragen den Pfad
// der Karteikarte. Er wird deshalb beim Klick nachgereicht, über den Kanal
// `database:karteikarte`, der dieselbe Auflösung fragt wie die Beleg-Ansicht.
// Eine Tabelle, die der zuletzt bereite Überblick in Tabellen-Form führt, fragt
// nicht und öffnet ohne Umweg die Maske; das hält den Bestands-Weg unverändert.
//
// **Der Handgriff am Dokument** (`aktiveKarteikarteInMaske`): öffnet die
// Einzel-Maske des Datensatzes, den das aktive Dokument trägt. Die Erkennung
// steht in `karteikarte-erkennung.js`, weil auch die Kommando-Palette sie fragt.
// Den Gegen-Handgriff «Karteikarte öffnen» zeichnet die Maske selbst
// (`masken-fehlt.js`), weil er dort an die Stelle von «Im Tabellen-Dokument
// zeigen» tritt.
//
// **Geöffnet wird die Maske über das Ereignis `scg:open-form`**, nicht über
// einen Import der Masken-Seite, damit deren Tor des Aus-Zustands die eine
// Stelle bleibt. Im Aus-Zustand der Erweiterung «Datenbank» übernimmt die Weiche
// nichts, und der Handgriff tut nichts.
'use strict';

import { api } from '../app/api.js';
import { activeTab, state } from '../app/app-state.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { setzeDatensatzWeiche } from '../query/record-hit-click.js';
import { openInPane } from '../tabs/tabs.js';
import { showStatusbarHint } from '../views/views.js';
import { pathCompareKey } from '../../../shared/platform.js';
import { tabellenSofort } from './datenbank-bereich.js';
import { karteikarteImReiter } from './karteikarte-erkennung.js';

// Öffnet die Einzel-Maske eines Datensatzes über das Ereignis der Masken-Seite.
function oeffneMaskeUeberEreignis(tabelle, kennung) {
  document.dispatchEvent(
    new CustomEvent('scg:open-form', { detail: { filePath: tabelle, recordId: kennung } }),
  );
}

/**
 * Öffnet das Dokument einer Karteikarte in der aktiven Spalte.
 *
 * @param {string} datei Pfad der Karteikarte.
 * @returns {Promise<void>}
 */
export async function oeffneKarteikarte(datei) {
  if (typeof datei !== 'string' || datei === '') return;
  await openInPane(state.activePaneIndex, [datei]);
}

// Führt der zuletzt bereite Überblick die Tabelle in Tabellen-Form? Dann ist
// das Ziel ohne Frage die Maske. Unbekannt heißt: fragen.
function inTabellenForm(tabellenPfad) {
  const tabellen = tabellenSofort();
  if (!Array.isArray(tabellen)) return false;
  const schluessel = pathCompareKey(tabellenPfad);
  const eintrag = tabellen.find(
    (e) => e && typeof e.path === 'string' && pathCompareKey(e.path) === schluessel,
  );
  return !!eintrag && eintrag.storage !== 'cards';
}

/**
 * Öffnet einen Datensatz nach seiner Ablage-Form: die Karteikarte als Dokument,
 * sonst die Einzel-Maske. Fehlt die Antwort des Kanals oder wirft er, bleibt es
 * bei der Maske.
 *
 * @param {{path: string, id: string}} hit Tabellen-Pfad und Kennung.
 * @returns {Promise<'dokument'|'maske'>} Was geöffnet wurde (Prüffälle).
 */
export async function oeffneDatensatz(hit) {
  let antwort;
  try {
    antwort = await api.databaseKarteikarte({ tabelle: hit.path, kennung: hit.id });
  } catch {
    antwort = null;
  }
  if (antwort && typeof antwort.datei === 'string' && antwort.datei !== '') {
    await oeffneKarteikarte(antwort.datei);
    return 'dokument';
  }
  oeffneMaskeUeberEreignis(hit.path, hit.id);
  return 'maske';
}

/**
 * Die Weiche für `openRecordHit`: übernimmt den Klick, wenn der Datensatz eine
 * Karteikarte sein kann, und liefert dann true.
 *
 * @param {{path: string, id: string}} hit
 * @returns {boolean}
 */
export function datensatzWeiche(hit) {
  if (!isExtensionActive('database')) return false;
  if (typeof api.databaseKarteikarte !== 'function') return false;
  if (!hit || typeof hit.path !== 'string' || typeof hit.id !== 'string') return false;
  if (inTabellenForm(hit.path)) return false;
  void oeffneDatensatz(hit);
  return true;
}

setzeDatensatzWeiche(datensatzWeiche);

/**
 * Der Weg des Kommandos «In der Maske öffnen»: die Einzel-Maske des Datensatzes,
 * den das aktive Dokument als Karteikarte trägt, sonst ein Hinweis in der
 * Statuszeile.
 *
 * @returns {Promise<boolean>} Ob die Maske angefordert wurde.
 */
export async function aktiveKarteikarteInMaske() {
  if (!isExtensionActive('database')) return false;
  const karte = await karteikarteImReiter(activeTab());
  if (karte === null) {
    showStatusbarHint('database.card.noCardActive', { duration: 4000, error: true });
    return false;
  }
  oeffneMaskeUeberEreignis(karte.tabelle, karte.kennung);
  return true;
}
