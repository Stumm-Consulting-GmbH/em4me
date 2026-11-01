// 4T-002404 (Epic 3E-000266, F3 A, S3): Die Befunde einer Karteikarte nach dem
// Speichern im Anzeige-Prozess — gehalten je Dokument und gezeichnet an zwei
// der drei Orte: als Hinweis je Feld im Eigenschafts-Bereich und als Markierung
// der Dateikopf-Zeile in der Lese-Ansicht. Die Meldung in der Statusleiste
// bildet dieses Modul als Satz; zeigen lässt sie der Speicher-Weg
// (`save-export.js`), weil die Statusleiste dort liegt.
//
// **Woher die Befunde kommen.** Allein aus dem Ergebnis des Speicherns
// (`file:save`, `file:saveAs`, Angabe `karteiBefunde`): Der Haupt-Prozess prüft
// nach dem Schreiben und weist nie ab (`speicher-pruefung.js`). Fehlt die
// Angabe, ist die Datei keine Karteikarte, und frühere Befunde entfallen.
//
// **Wo sie gehalten werden: je Dokument-Pfad in diesem Modul, nicht am Reiter.**
// Die Markierung der Dateikopf-Zeile entsteht in der Nachverarbeitung jedes
// Zeichnens, und die kennt den Pfad des Dokuments, aber keinen Reiter; der
// Eigenschafts-Bereich zeichnet bei jedem Wechsel des Reiters neu. Beide lesen
// deshalb über den Pfad. Dasselbe Dokument in zwei Spalten zeigt so dieselben
// Befunde. Die Befunde gelten für den Stand, den diese Sitzung gespeichert hat:
// Das nächste Speichern ersetzt sie, ein Neuladen nach einer Änderung von außen
// verwirft sie (`verwirfKarteiBefunde`), und mit dem Ende der Sitzung sind sie
// fort; die vollständige Liste liefert jederzeit die Konsistenz-Prüfung.
//
// **Ein Blatt.** Das Modul liest weder Sitzungs-Zustand noch Fenster-Bereiche;
// es bekommt die Behälter herein, in denen es zeichnet. Sonst geriete es in den
// eingefrorenen Import-Zyklus des Anzeige-Prozesses, in dem der Speicher-Weg
// liegt (`scripts/ordner-import-ausnahme.json`).
//
// Im Aus-Zustand der Erweiterung «Datenbank» zeichnet es nichts und entfernt,
// was es gezeichnet hat.
'use strict';

import { t } from '../../i18n.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { pathCompareKey } from '../../../shared/platform.js';
import { befundText } from './konsistenz-befund-text.js';

// Klassen der beiden Zeichen; die Hinweis-Klasse des Eigenschafts-Bereichs
// gibt dem Feld-Hinweis dieselbe Gestalt wie dem Hinweis der Profile.
const FELD_HINWEIS = 'properties-field-kartei-hint';
const KOPF_MARKE = 'frontmatter-kartei-befunde';
// Klasse am Feld und an der Zeile, solange Befunde bestehen.
const MARKIERT = 'has-kartei-befunde';
const ZEICHEN = '⚠';

const befundeJePfad = new Map();

function schluessel(pfad) {
  return typeof pfad === 'string' && pfad !== '' ? pathCompareKey(pfad) : null;
}

// Was zwei Befund-Listen vergleichbar macht: Code, Feld und Wert je Befund.
function fingerabdruck(befunde) {
  return JSON.stringify(
    (befunde || []).map((b) => [b.code, b.feld, b.felder, b.wert, b.regel, b.kennungen]),
  );
}

/**
 * Übernimmt die Befunde aus dem Ergebnis eines Speicherns.
 *
 * @param {string} pfad Pfad des gespeicherten Dokuments.
 * @param {Array<object>|undefined} befunde Angabe `karteiBefunde` des Ergebnisses.
 * @returns {{anzahl: number, geaendert: boolean}} Zahl der Befunde und ob sie
 *   sich gegenüber dem vorigen Speichern geändert haben.
 */
export function uebernimmKarteiBefunde(pfad, befunde) {
  const key = schluessel(pfad);
  if (key === null) return { anzahl: 0, geaendert: false };
  const vorher = befundeJePfad.get(key) || [];
  const neu = Array.isArray(befunde) && isExtensionActive('database') ? befunde : [];
  if (neu.length > 0) befundeJePfad.set(key, neu);
  else befundeJePfad.delete(key);
  return { anzahl: neu.length, geaendert: fingerabdruck(vorher) !== fingerabdruck(neu) };
}

/** Verwirft die Befunde eines Dokuments, etwa nach einer Änderung von außen. */
export function verwirfKarteiBefunde(pfad) {
  const key = schluessel(pfad);
  if (key !== null) befundeJePfad.delete(key);
}

/**
 * Die gehaltenen Befunde eines Dokuments; leer im Aus-Zustand der Erweiterung.
 *
 * @param {string|null} pfad
 * @returns {Array<object>}
 */
export function karteiBefundeVon(pfad) {
  const key = schluessel(pfad);
  if (key === null || !isExtensionActive('database')) return [];
  return befundeJePfad.get(key) || [];
}

/**
 * Der Satz der Statusleiste zur Zahl der Befunde.
 *
 * @param {number} anzahl
 * @returns {string}
 */
export function karteiBefundMeldung(anzahl) {
  if (anzahl === 1) return t('database.card.savedFindingsOne');
  return t('database.card.savedFindings').split('{anzahl}').join(String(anzahl));
}

// Die Felder eines Befunds: `feld` bei Pflicht, Typ, Prüfregel und Verweis,
// `felder` bei Datensatz-Regel und Schlüssel-Dublette.
function felderVon(befund) {
  if (typeof befund.feld === 'string') return [befund.feld];
  return Array.isArray(befund.felder) ? befund.felder.map(String) : [];
}

function befundeDesFeldes(befunde, name) {
  const gesucht = String(name || '')
    .trim()
    .toLowerCase();
  if (gesucht === '') return [];
  return befunde.filter((b) => felderVon(b).some((f) => f.toLowerCase() === gesucht));
}

/**
 * Zeichnet den Hinweis je Feld in den Feldern des Eigenschafts-Bereichs.
 * Ein Feld ohne Befund verliert seinen Hinweis; der Hinweis der Profile
 * (`applyFieldHint`) bleibt unberührt.
 *
 * @param {HTMLElement|null} felder Der Behälter `.properties-fields`.
 * @param {string|null} pfad Pfad des Dokuments, das die Felder zeigen.
 */
export function zeichneKarteiFeldHinweise(felder, pfad) {
  if (!felder) return;
  const befunde = karteiBefundeVon(pfad);
  for (const feldEl of felder.querySelectorAll('.properties-field')) {
    const vorhanden = feldEl.querySelector(`.${FELD_HINWEIS}`);
    const eingabe = feldEl.querySelector('.properties-field-key');
    const eigene = befundeDesFeldes(befunde, eingabe ? eingabe.value : '');
    if (eigene.length === 0) {
      if (vorhanden) vorhanden.remove();
      feldEl.classList.remove(MARKIERT);
      continue;
    }
    const kopf = feldEl.querySelector('.properties-field-head') || feldEl;
    const hinweis = vorhanden || document.createElement('span');
    hinweis.className = `properties-field-hint ${FELD_HINWEIS}`;
    hinweis.textContent = ZEICHEN;
    hinweis.title = eigene.map((b) => befundText(b)).join('\n');
    hinweis.dataset.karteiBefunde = String(eigene.length);
    hinweis.hidden = false;
    if (!vorhanden) kopf.appendChild(hinweis);
    feldEl.classList.add(MARKIERT);
  }
}

/**
 * Markiert die Dateikopf-Zeile der Lese-Ansicht, solange das Dokument Befunde
 * hat. Die Zeile eines eingebetteten Dokuments bleibt unberührt.
 *
 * @param {HTMLElement|null} container Der gezeichnete Inhalt.
 * @param {string|null} pfad Pfad des gezeichneten Dokuments.
 */
export function markiereKarteiDateikopf(container, pfad) {
  if (!container) return;
  const befunde = karteiBefundeVon(pfad);
  for (const kopf of container.querySelectorAll('.frontmatter-header')) {
    if (kopf.closest('.wiki-embed-md-body')) continue;
    const vorhanden = kopf.querySelector(`.${KOPF_MARKE}`);
    if (befunde.length === 0) {
      if (vorhanden) vorhanden.remove();
      kopf.classList.remove(MARKIERT);
      continue;
    }
    const marke = vorhanden || document.createElement('span');
    marke.className = KOPF_MARKE;
    marke.textContent = `${ZEICHEN} ${befunde.length}`;
    const titel = [t('database.card.findingsTitle'), ...befunde.map((b) => befundText(b))];
    marke.title = titel.join('\n');
    marke.dataset.karteiBefunde = String(befunde.length);
    if (!vorhanden) kopf.appendChild(marke);
    kopf.classList.add(MARKIERT);
  }
}
