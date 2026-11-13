// 4T-002389 (Epic 3E-000265, Schritt 3, F4 A): Die beiden Handgriffe der
// Kartei-Form im Anzeige-Prozess — «Neue Karteikarte» und «Als Karteikarte
// aufnehmen».
//
// **Kein eigener Kanal.** Beide Handgriffe sind ein gewöhnlicher Auftrag der
// Schreib-Schnittstelle (`database:auftrag`), ein Anlegen mit der Angabe
// `karteikarte`: `{ name }` für die neue Datei `<Name>.md` im Ordner der
// Tabelle, `{ aufnehmen }` für ein vorhandenes Dokument. Prüfung, Kennung,
// Hochwasserstand und Beleg liegen damit an der einen Stelle, durch die jede
// Änderung an Datensätzen läuft.
//
// **Die Anwendung schreibt nie ungefragt in ein Dokument.** Beide Handgriffe
// schreiben erst auf ausdrückliches Wählen des Anwenders: «Neue Karteikarte»
// nach der Eingabe des Schlüssels, «Als Karteikarte aufnehmen» über den Knopf
// am Befund der Konsistenz-Prüfung oder das Kommando am geöffneten Dokument.
//
// **Welche Kartei-Tabelle gemeint ist**, sagt der Überblick der Datenbank
// (`datenbankAuskunft`, Feld `storage` je Tabelle) zusammen mit der Regel der
// Karteikarte: Das Dokument liegt im selben Ordner wie die Tabellen-Datei
// (`imOrdnerDerTabelle`, dieselbe Funktion wie im Haupt-Prozess).
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { showStatusbarHint } from '../views/views.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
import { loeseErgebnisAuf, tabellenName } from '../../../shared/database/auftrag-text.js';
import { imOrdnerDerTabelle } from '../../../shared/database/karteikarte.js';
import { pathCompareKey } from '../../../shared/platform.js';
import { datenbankAuskunft, verwirfDatenbankAuskunft } from './datenbank-bereich.js';

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

function einsetzen(key, werte) {
  let text = t(key);
  for (const [name, wert] of Object.entries(werte)) text = text.split(`{${name}}`).join(wert);
  return text;
}

function dateiNameOhneEndung(pfad) {
  const name = String(pfad).split(/[\\/]/).pop() || '';
  const punkt = name.lastIndexOf('.');
  return punkt > 0 ? name.slice(0, punkt) : name;
}

// Die Abweisung der Schnittstelle als Satz in der Statuszeile, gebildet wie in
// der Maske (`loeseErgebnisAuf`); ohne auslegbare Lage der allgemeine Satz.
function meldeAbweisung(ergebnis) {
  const saetze = loeseErgebnisAuf(ergebnis, { t, hat: hatSchluessel }).map((l) => l.text);
  const text = saetze.length > 0 ? saetze.join(' ') : t('database.card.failed');
  showStatusbarHint('database.card.failed', { text, duration: 6000, error: true });
}

async function sende(anweisung) {
  try {
    return await api.databaseAuftrag({ auftrag: { anweisungen: [anweisung] } });
  } catch {
    return null;
  }
}

/**
 * «Neue Karteikarte»: fragt nach dem Schlüssel und legt die Karteikarte an.
 *
 * @param {string} tabellenPfad Pfad der Kartei-Tabelle.
 * @param {{nachher?: Function}} [optionen] Rückruf nach dem Anlegen (Neu-Zeichnen).
 * @returns {Promise<boolean>} Ob eine Karteikarte entstanden ist.
 */
export async function neueKarteikarte(tabellenPfad, { nachher } = {}) {
  if (!isExtensionActive('database')) return false;
  if (typeof tabellenPfad !== 'string' || tabellenPfad === '') return false;
  const name = await showNameInputDialog({
    title: t('database.card.new'),
    description: einsetzen('database.card.newDescription', {
      tabelle: tabellenName(tabellenPfad),
    }),
    okLabel: t('database.card.newOk'),
    validate: (wert) => (wert === '' ? 'database.card.nameEmpty' : null),
  });
  if (typeof name !== 'string' || name === '') return false;
  // 4T-002545 (Epic 3E-000368): «Neue Karteikarte» legt ein leeres Feld-Gerüst
  // an und fordert deshalb die Ausnahme von der Pflicht-Prüfung ausdrücklich an.
  const ergebnis = await sende({
    tabelle: tabellenPfad,
    art: 'create',
    karteikarte: { name },
    pflichtAussetzen: true,
  });
  if (!ergebnis || ergebnis.ok !== true) {
    meldeAbweisung(ergebnis || {});
    return false;
  }
  verwirfDatenbankAuskunft();
  showStatusbarHint('database.card.created', {
    text: einsetzen('database.card.created', { name }),
    duration: 3000,
  });
  if (typeof nachher === 'function') nachher();
  return true;
}

/**
 * «Als Karteikarte aufnehmen»: trägt die nächste Kennung in den Dateikopf eines
 * Dokuments im Ordner der Kartei-Tabelle ein.
 *
 * @param {string} tabellenPfad Pfad der Kartei-Tabelle.
 * @param {string} dokumentPfad Pfad des Dokuments.
 * @param {{nachher?: Function}} [optionen] Rückruf nach dem Aufnehmen.
 * @returns {Promise<boolean>} Ob das Dokument aufgenommen ist.
 */
export async function nimmAlsKarteikarteAuf(tabellenPfad, dokumentPfad, { nachher } = {}) {
  if (!isExtensionActive('database')) return false;
  if (typeof tabellenPfad !== 'string' || typeof dokumentPfad !== 'string') return false;
  const ergebnis = await sende({
    tabelle: tabellenPfad,
    art: 'create',
    karteikarte: { aufnehmen: dokumentPfad },
  });
  if (!ergebnis || ergebnis.ok !== true) {
    meldeAbweisung(ergebnis || {});
    return false;
  }
  verwirfDatenbankAuskunft();
  showStatusbarHint('database.card.adopted', {
    text: einsetzen('database.card.adopted', { name: dateiNameOhneEndung(dokumentPfad) }),
    duration: 3000,
  });
  if (typeof nachher === 'function') nachher();
  return true;
}

// Der Pfad des Dokuments im aktiven Reiter, oder null bei einer System- oder
// Handbuch-Seite.
function aktiverPfad() {
  const pane = state.panes[state.activePaneIndex];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  return tab && !tab.systemPage && !tab.manualPage && typeof tab.path === 'string' && tab.path
    ? tab.path
    : null;
}

// Die Kartei-Tabelle zum Pfad: die Tabellen-Datei selbst oder die Tabelle, in
// deren Ordner das Dokument liegt. Bei zwei Kartei-Tabellen im Ordner keine.
async function karteiTabelleZu(pfad) {
  if (pfad === null) return null;
  const auskunft = await datenbankAuskunft();
  const karteien = auskunft.tabellen.filter(
    (e) => e && e.storage === 'cards' && typeof e.path === 'string',
  );
  const selbst = karteien.find((e) => pathCompareKey(e.path) === pathCompareKey(pfad));
  if (selbst) return selbst.path;
  const imOrdner = karteien.filter((e) => imOrdnerDerTabelle(pfad, e.path));
  return imOrdner.length === 1 ? imOrdner[0].path : null;
}

/**
 * Der Weg des Kommandos «Neue Karteikarte»: die Kartei-Tabelle des aktiven
 * Dokuments, sonst ein Hinweis in der Statuszeile (Muster «Neuer Datensatz»).
 *
 * @returns {Promise<void>}
 */
export async function neueKarteikarteFuerAktivenReiter() {
  if (!isExtensionActive('database')) return;
  const tabelle = await karteiTabelleZu(aktiverPfad());
  if (tabelle === null) {
    showStatusbarHint('database.card.noCardTable', { duration: 4000, error: true });
    return;
  }
  await neueKarteikarte(tabelle);
}

/**
 * Der Weg des Kommandos «Als Karteikarte aufnehmen»: das aktive Dokument in den
 * Ordner seiner Kartei-Tabelle aufnehmen; ob es schon eine Kennung trägt, prüft
 * die Schreib-Schnittstelle und meldet es.
 *
 * @returns {Promise<void>}
 */
export async function aktivesDokumentAufnehmen() {
  if (!isExtensionActive('database')) return;
  const pfad = aktiverPfad();
  const tabelle = await karteiTabelleZu(pfad);
  if (tabelle === null || pathCompareKey(tabelle) === pathCompareKey(pfad)) {
    showStatusbarHint('database.card.noCardTable', { duration: 4000, error: true });
    return;
  }
  await nimmAlsKarteikarteAuf(tabelle, pfad);
}
