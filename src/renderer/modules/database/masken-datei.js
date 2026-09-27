// 4T-001943 (Epic 3E-000257, Bauplan B1, B3): Die Quelle der Maske im Kopf der
// Einzel-Maske — die Masken-Datei, aus der der Körper stammt, oder der
// Handgriff «Maske als Datei speichern», solange die Maske erzeugt ist.
//
// **Ein eigenes Modul, weil die Masken-Seite ihr Budget ausschöpft** (Übergabe
// aus 4T-001942): Die Seite ruft `zeichneQuelle` beim Aufbau des Kopfs und
// `koerperStand` beim Übernehmen der Antwort; alles Übrige zur Datei steht hier.
//
// **Der Handgriff erscheint nur im Lesen und nur bei der erzeugten Maske.** Gilt
// eine Masken-Datei, nennt der Kopf ihren Namen; eine zweite Datei zu schreiben
// wäre dann eine, die nicht gilt. Nach dem Schreiben öffnet die Maske die Datei
// nicht von selbst und liest auch nicht neu: Der Katalog kennt die Datei erst,
// wenn der Index sie gesehen hat, und das nächste Öffnen der Maske zeigt sie.
// Ein zweiter Klick überschreibt nichts, der Kanal meldet die vorhandene Datei.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { showStatusbarHint } from '../views/views.js';
import { MODUS_LESEN } from './masken-felder.js';

// Laufende Schreib-Anfrage je Seite; ein Doppelklick schickt nicht zweimal.
let schreibt = false;

/**
 * Der Dateiname eines Pfads, mit beiden Trennzeichen.
 *
 * @param {string} pfad
 * @returns {string}
 */
export function dateiName(pfad) {
  const text = String(pfad || '');
  const idx = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return idx >= 0 ? text.slice(idx + 1) : text;
}

/**
 * Der Körper einer Antwort des Kanals `database:datensatz` in der Gestalt der
 * Anzeige. Eine unvollständige Angabe wird zur erzeugten Maske ohne Segmente,
 * nie zu einer erfundenen Datei.
 *
 * @param {object} koerper Das Feld `koerper` der Antwort.
 * @returns {{quelle: 'datei'|'erzeugt', pfad: string|null, segmente: Array<object>,
 *   hints: Array<object>}}
 */
export function koerperStand(koerper) {
  const k = koerper && typeof koerper === 'object' ? koerper : {};
  const ausDatei = k.quelle === 'datei' && typeof k.pfad === 'string' && k.pfad !== '';
  return {
    quelle: ausDatei ? 'datei' : 'erzeugt',
    pfad: ausDatei ? k.pfad : null,
    segmente: Array.isArray(k.segmente) ? k.segmente : [],
    hints: Array.isArray(k.hints) ? k.hints : [],
  };
}

function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

// Der Satz zu einer Antwort des Kanals, die keinen Erfolg meldet.
function fehlerSatz(antwort) {
  if (antwort && antwort.status === 'unavailable') return t('database.form.noAccess');
  const code = antwort && typeof antwort.code === 'string' ? antwort.code : '';
  if (code === 'formDateiVorhanden')
    return t('database.form.fileExists').replace('{file}', dateiName(antwort.pfad));
  const key = `database.auftrag.${code}`;
  if (code !== '' && hatSchluessel(key) && !/\{[a-zA-Z]+\}/.test(t(key))) return t(key);
  return t('database.form.fileWriteFailed');
}

async function schreibe(seite) {
  if (schreibt || !seite.tabellenPfad) return;
  schreibt = true;
  let antwort;
  try {
    antwort = await api.databaseMaskeSchreiben({
      tabelle: seite.tabellenPfad,
      sprache: state.language || null,
    });
  } catch {
    antwort = null;
  }
  schreibt = false;
  if (antwort && antwort.status === 'ready' && typeof antwort.pfad === 'string') {
    const text = t('database.form.fileWritten').replace('{file}', dateiName(antwort.pfad));
    showStatusbarHint('database.form.fileWritten', { text, duration: 4000 });
    return;
  }
  showStatusbarHint('database.form.fileWritten', {
    text: fehlerSatz(antwort),
    duration: 5000,
    error: true,
  });
}

/**
 * Zeichnet die Quelle der Maske unter die Kopfzeile: den Namen der
 * Masken-Datei, oder im Lesen der erzeugten Maske den Handgriff.
 *
 * @param {HTMLElement} knoten Der Titel-Block des Kopfs.
 * @param {object} seite Der Zustand der Masken-Seite.
 */
export function zeichneQuelle(knoten, seite) {
  const daten = seite && seite.daten;
  if (!knoten || !daten || daten.status !== 'ready' || !daten.koerper) return;
  const koerper = daten.koerper;
  if (koerper.quelle === 'datei') {
    const zeile = document.createElement('div');
    zeile.className = 'db-form-source';
    zeile.textContent = t('database.form.sourceFile').replace('{file}', dateiName(koerper.pfad));
    zeile.title = koerper.pfad;
    knoten.appendChild(zeile);
    return;
  }
  if (seite.modus !== MODUS_LESEN) return;
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'db-form-btn db-form-write-file';
  knopf.textContent = t('database.form.action.writeFile');
  knopf.addEventListener('click', () => void schreibe(seite));
  knoten.appendChild(knopf);
}
