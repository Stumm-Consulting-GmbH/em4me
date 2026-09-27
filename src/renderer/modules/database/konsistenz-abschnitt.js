// 4T-001944 (Epic 3E-000257, Bauplan B4): Der Abschnitt der Konsistenz-Prüfung
// auf der Übersichts-Seite der Datenbank — Aktion, Zähler je Tabelle, Dauer und
// die Befund-Liste, aus der ein Klick in die Maske führt.
//
// **Ein eigenes Modul mit eigenem Zustand**, weil die Übersichts-Seite ihn
// sonst neben ihrer Auskunft ein zweites Mal führen müsste und ihr Zeilen-Budget
// nicht trägt. Die Seite ruft zwei Dinge: den Knopf, der die Prüfung startet,
// und das Zeichnen des Abschnitts; beides bekommt ihr Neu-Zeichnen als Rückruf.
//
// **Das Ergebnis lebt allein im Seiten-Zustand** und verschwindet mit der Seite
// (`verwirfKonsistenz` beim Neu-Öffnen). Gespeichert wird nichts, und die
// Prüfung selbst ändert keine Datei: Berichtigt wird in der Maske, in der der
// Anwender entscheidet.
//
// **Die Sätze entstehen wie die Sätze der Schreib-Schnittstelle**, über die
// Einsetzung aus `auftrag-text.js`: Listen mit «und», Feld- und Tabellen-Namen
// in Anführung, Platzhalter ohne Angabe samt Leerraum entfernt.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { setzeTextEin } from '../../../shared/database/auftrag-text.js';
import { oeffneMaske } from './masken-seite.js';

// Höchstens so viele Befunde stehen in der Liste; darüber sagt ein Hinweis,
// wie viele es sind (Muster der Beleg-Ansicht). Kein stilles Abschneiden.
export const MAX_BEFUNDE = 500;

const PRAEFIX = 'database.konsistenz.';

// Seiten-Zustand. `anfrage` zählt die Läufe, damit die Antwort eines
// verworfenen Laufs nichts mehr zeichnet.
const zustand = {
  ergebnis: null,
  laeuft: false,
  anfrage: 0,
};

/** Verwirft Ergebnis und laufende Anfrage (Neu-Öffnen der Seite). */
export function verwirfKonsistenz() {
  zustand.ergebnis = null;
  zustand.laeuft = false;
  zustand.anfrage += 1;
}

/** @returns {boolean} Läuft gerade eine Prüfung? */
export function konsistenzLaeuft() {
  return zustand.laeuft;
}

/**
 * Startet die Prüfung einer oder aller Tabellen.
 *
 * @param {string|null} tabelle Pfad der Tabelle, oder null für alle.
 * @param {Function} zeichneNeu Neu-Zeichnen der Seite.
 * @returns {Promise<void>}
 */
export async function starteKonsistenzPruefung(tabelle, zeichneNeu) {
  if (zustand.laeuft) return;
  zustand.anfrage += 1;
  const nummer = zustand.anfrage;
  zustand.laeuft = true;
  zustand.ergebnis = null;
  zeichneNeu();
  let antwort;
  try {
    antwort = await api.databaseKonsistenz({ tabelle: tabelle || null });
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
 * Der Knopf «Konsistenz prüfen» für den Kopf (alle Tabellen) oder eine
 * Tabellen-Zeile (eine Tabelle).
 *
 * @param {{tabelle: string|null, textKey: string, className: string,
 *   zeichneNeu: Function}} p
 * @returns {HTMLButtonElement}
 */
export function konsistenzKnopf({ tabelle, textKey, className, zeichneNeu }) {
  const knopf = el('button', className, t(textKey));
  knopf.type = 'button';
  knopf.disabled = zustand.laeuft;
  knopf.addEventListener('click', () => void starteKonsistenzPruefung(tabelle, zeichneNeu));
  return knopf;
}

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

/**
 * Der Satz zu einem Befund in der Sprache der Oberfläche.
 *
 * @param {object} befund Ein Befund aus `konsistenz-pruefung.js`.
 * @param {{sprache?: string|null, rueckfallSprache?: string|null}} [umgebung]
 * @returns {string}
 */
export function befundText(befund, umgebung = {}) {
  const b = befund && typeof befund === 'object' ? befund : {};
  // Die zweite Fassung für den Verweis ohne Ziel-Angabe, wie beim Regel-Werk.
  const code =
    b.code === 'konsistenzVerweisTabelleUnbekannt' && b.zieltabelle === null
      ? 'konsistenzVerweisTabelleFehlt'
      : b.code;
  const key = `${PRAEFIX}${code}`;
  if (typeof code !== 'string' || !hatSchluessel(key)) return String(b.code || '');
  return setzeTextEin(t(key), b, { t, hat: hatSchluessel, ...umgebung });
}

/**
 * Der Datensatz eines Befunds als «Anzeige-Form (Kennung)», die Kennung allein
 * ohne Anzeige-Form, leer ohne Datensatz.
 *
 * @param {object} befund
 * @returns {string}
 */
export function datensatzText(befund) {
  if (!befund || typeof befund.id !== 'string') return '';
  return befund.anzeige ? `${befund.anzeige} (${befund.id})` : befund.id;
}

function einsetzen(key, werte) {
  let text = t(key);
  for (const [name, wert] of Object.entries(werte)) text = text.split(`{${name}}`).join(wert);
  return text;
}

function zaehlerTabelle(tabellen) {
  const tabelle = el('table', 'db-overview-table db-consistency-counts');
  const kopf = document.createElement('tr');
  for (const key of ['col.table', 'col.records', 'col.findings'])
    kopf.appendChild(el('th', null, t(PRAEFIX + key)));
  const thead = document.createElement('thead');
  thead.appendChild(kopf);
  tabelle.appendChild(thead);
  const koerper = document.createElement('tbody');
  for (const eintrag of tabellen) {
    const zeile = document.createElement('tr');
    zeile.appendChild(el('td', null, eintrag.name));
    zeile.appendChild(el('td', null, String(eintrag.datensaetze)));
    zeile.appendChild(el('td', 'db-consistency-count', String(eintrag.befunde)));
    koerper.appendChild(zeile);
  }
  tabelle.appendChild(koerper);
  return tabelle;
}

// Die Zelle des Datensatzes: mit Kennung und Tabellen-Pfad ein Knopf in die
// Maske, sonst Text.
function datensatzZelle(befund) {
  const zelle = el('td', 'db-consistency-record');
  const text = datensatzText(befund);
  if (text === '' || typeof befund.pfad !== 'string' || befund.pfad === '') {
    zelle.textContent = text;
    return zelle;
  }
  const knopf = el('button', 'db-consistency-open', text);
  knopf.type = 'button';
  knopf.title = t(PRAEFIX + 'open');
  knopf.addEventListener('click', () => oeffneMaske(befund.pfad, befund.id));
  zelle.appendChild(knopf);
  return zelle;
}

function befundListe(befunde, umgebung) {
  const tabelle = el('table', 'db-overview-table db-consistency-findings');
  const kopf = document.createElement('tr');
  for (const key of ['col.table', 'col.record', 'col.field', 'col.text'])
    kopf.appendChild(el('th', null, t(PRAEFIX + key)));
  const thead = document.createElement('thead');
  thead.appendChild(kopf);
  tabelle.appendChild(thead);
  const koerper = document.createElement('tbody');
  for (const befund of befunde.slice(0, MAX_BEFUNDE)) {
    const zeile = el('tr', 'db-consistency-finding');
    zeile.dataset.code = befund.code;
    zeile.appendChild(el('td', null, befund.tabelle || ''));
    zeile.appendChild(datensatzZelle(befund));
    const feld = befund.feld || (Array.isArray(befund.felder) ? befund.felder.join(', ') : '');
    zeile.appendChild(el('td', null, feld));
    zeile.appendChild(el('td', 'db-consistency-text', befundText(befund, umgebung)));
    koerper.appendChild(zeile);
  }
  tabelle.appendChild(koerper);
  return tabelle;
}

/**
 * Zeichnet den Abschnitt, sobald eine Prüfung läuft oder ein Ergebnis vorliegt.
 *
 * @param {HTMLElement} wurzel Die Seite.
 * @param {{sprache?: string|null, rueckfallSprache?: string|null}} umgebung Für
 *   die Meldungs-Texte der Prüfregeln.
 */
export function zeichneKonsistenz(wurzel, umgebung = {}) {
  if (!zustand.laeuft && !zustand.ergebnis) return;
  const block = el('section', 'db-overview-section db-consistency');
  block.appendChild(
    el('h4', 'db-overview-section-title', t('database.overview.section.consistency')),
  );
  wurzel.appendChild(block);
  if (zustand.laeuft) {
    block.appendChild(el('p', 'db-overview-note', t(PRAEFIX + 'running')));
    return;
  }
  const ergebnis = zustand.ergebnis;
  if (ergebnis.status !== 'ready') {
    block.appendChild(el('p', 'db-overview-empty', t(PRAEFIX + 'unavailable')));
    return;
  }
  const befunde = Array.isArray(ergebnis.befunde) ? ergebnis.befunde : [];
  const tabellen = Array.isArray(ergebnis.tabellen) ? ergebnis.tabellen : [];
  const datensaetze = tabellen.reduce((summe, e) => summe + (e.datensaetze || 0), 0);
  const zusammenfassung = einsetzen(PRAEFIX + 'summary', {
    dauer: String(ergebnis.dauerMs || 0),
    tabellen: String(tabellen.length),
    datensaetze: String(datensaetze),
    befunde: String(befunde.length),
  });
  block.appendChild(el('p', 'db-overview-note db-consistency-summary', zusammenfassung));
  if (tabellen.length > 0) block.appendChild(zaehlerTabelle(tabellen));
  if (befunde.length === 0) {
    block.appendChild(el('p', 'db-overview-empty db-consistency-none', t(PRAEFIX + 'none')));
    return;
  }
  if (befunde.length > MAX_BEFUNDE)
    block.appendChild(
      el(
        'p',
        'db-overview-note db-consistency-limit',
        einsetzen(PRAEFIX + 'limit', {
          shown: String(MAX_BEFUNDE),
          total: String(befunde.length),
        }),
      ),
    );
  block.appendChild(befundListe(befunde, umgebung));
}
