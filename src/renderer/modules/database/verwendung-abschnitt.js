// 4T-001945 (Epic 3E-000257, Bauplan B3): Der Abschnitt «Verwendet von» auf der
// Übersichts-Seite der Datenbank — welche Tabellen mit welchen Verweis-Spalten
// und welche Masken-Dateien eine Tabelle benutzen.
//
// **Ein eigenes Modul mit eigenem Zustand**, nach dem Muster des Abschnitts der
// Konsistenz-Prüfung (`konsistenz-abschnitt.js`): Die Seite ruft den Knopf je
// Tabellen-Zeile und das Zeichnen des Abschnitts; beides bekommt ihr
// Neu-Zeichnen als Rückruf.
//
// **Gelesen wird auf Anforderung**, über den Kanal `database:verwendung` mit
// `kennung: null`, nie beim Öffnen der Seite. Das Ergebnis lebt allein im
// Seiten-Zustand und verschwindet beim Neu-Öffnen (`verwirfVerwendung`).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { dateiName } from './masken-datei.js';

const PRAEFIX = 'database.usage.';

// Seiten-Zustand. `anfrage` zählt die Anfragen, damit die Antwort einer
// überholten nichts mehr zeichnet.
const zustand = {
  tabelle: null,
  ergebnis: null,
  laeuft: false,
  anfrage: 0,
};

/** Verwirft Ergebnis und laufende Anfrage (Neu-Öffnen der Seite). */
export function verwirfVerwendung() {
  zustand.tabelle = null;
  zustand.ergebnis = null;
  zustand.laeuft = false;
  zustand.anfrage += 1;
}

/**
 * Holt die Verwendung einer Tabelle.
 *
 * @param {{name: string, path: string}} eintrag Die Tabellen-Zeile des Überblicks.
 * @param {Function} zeichneNeu Neu-Zeichnen der Seite.
 * @returns {Promise<void>}
 */
export async function starteVerwendung(eintrag, zeichneNeu) {
  zustand.anfrage += 1;
  const nummer = zustand.anfrage;
  zustand.tabelle = eintrag.name;
  zustand.laeuft = true;
  zustand.ergebnis = null;
  zeichneNeu();
  let antwort;
  try {
    antwort = await api.databaseVerwendung({ tabelle: eintrag.path, kennung: null });
  } catch {
    antwort = null;
  }
  if (nummer !== zustand.anfrage) return;
  zustand.laeuft = false;
  zustand.ergebnis = antwort && typeof antwort === 'object' ? antwort : { status: 'unavailable' };
  zeichneNeu();
}

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

/**
 * Der Knopf «Verwendung» einer Tabellen-Zeile. Eine Tabelle ohne Pfad bekommt
 * keinen; er könnte nichts nachweisen.
 *
 * @param {{eintrag: object, zeichneNeu: Function}} p
 * @returns {HTMLButtonElement|null}
 */
export function verwendungKnopf({ eintrag, zeichneNeu }) {
  if (!eintrag || typeof eintrag.path !== 'string' || eintrag.path === '') return null;
  const knopf = el('button', 'db-overview-usage', t(PRAEFIX + 'action'));
  knopf.type = 'button';
  knopf.addEventListener('click', () => void starteVerwendung(eintrag, zeichneNeu));
  return knopf;
}

function kopfZeile(tabelle, keys) {
  const thead = document.createElement('thead');
  const zeile = document.createElement('tr');
  for (const key of keys) zeile.appendChild(el('th', null, t(PRAEFIX + key)));
  thead.appendChild(zeile);
  tabelle.appendChild(thead);
}

function tabellenListe(tabellen) {
  const tabelle = el('table', 'db-overview-table db-usage-tables');
  kopfZeile(tabelle, ['col.table', 'col.columns']);
  const koerper = document.createElement('tbody');
  for (const eintrag of tabellen) {
    const zeile = el('tr', 'db-usage-table');
    zeile.appendChild(el('td', 'db-usage-table-name', eintrag.name));
    const felder = Array.isArray(eintrag.felder) ? eintrag.felder.join(', ') : '';
    zeile.appendChild(el('td', 'db-usage-table-columns', felder));
    koerper.appendChild(zeile);
  }
  tabelle.appendChild(koerper);
  return tabelle;
}

function maskenListe(masken) {
  const tabelle = el('table', 'db-overview-table db-usage-forms');
  kopfZeile(tabelle, ['col.form']);
  const koerper = document.createElement('tbody');
  for (const maske of masken) {
    const zeile = el('tr', 'db-usage-form');
    const zelle = el('td', 'db-usage-form-name', dateiName(maske.pfad));
    zelle.title = maske.pfad;
    zeile.appendChild(zelle);
    koerper.appendChild(zeile);
  }
  tabelle.appendChild(koerper);
  return tabelle;
}

/**
 * Zeichnet den Abschnitt, sobald eine Anfrage läuft oder ein Ergebnis vorliegt.
 *
 * @param {HTMLElement} wurzel Die Seite.
 */
export function zeichneVerwendung(wurzel) {
  if (!zustand.laeuft && !zustand.ergebnis) return;
  const block = el('section', 'db-overview-section db-usage');
  block.appendChild(el('h4', 'db-overview-section-title', t('database.overview.section.usage')));
  wurzel.appendChild(block);
  const gegenstand = t(PRAEFIX + 'subject')
    .split('{table}')
    .join(zustand.tabelle || '');
  block.appendChild(el('p', 'db-overview-note db-usage-subject', gegenstand));
  if (zustand.laeuft) {
    block.appendChild(el('p', 'db-overview-note', t(PRAEFIX + 'running')));
    return;
  }
  const ergebnis = zustand.ergebnis;
  if (ergebnis.status !== 'ready') {
    block.appendChild(el('p', 'db-overview-empty db-usage-failed', t(PRAEFIX + 'failed')));
    return;
  }
  const tabellen = Array.isArray(ergebnis.tabellen) ? ergebnis.tabellen : [];
  const masken = Array.isArray(ergebnis.masken) ? ergebnis.masken : [];
  if (tabellen.length === 0 && masken.length === 0) {
    block.appendChild(el('p', 'db-overview-empty db-usage-none', t(PRAEFIX + 'none')));
    return;
  }
  if (tabellen.length > 0) {
    block.appendChild(el('h5', 'db-usage-subtitle', t(PRAEFIX + 'tables')));
    block.appendChild(tabellenListe(tabellen));
  }
  if (masken.length > 0) {
    block.appendChild(el('h5', 'db-usage-subtitle', t(PRAEFIX + 'forms')));
    block.appendChild(maskenListe(masken));
  }
}
