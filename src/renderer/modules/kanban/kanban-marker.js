// 4T-001903 (Epic 3E-000318): Termin und Angaben auf der Karte — die
// Abzeichen-Reihe unter dem Karten-Text, die relative Lesart der Termine und
// der angezeigte Text ohne die Spannen eines Vorbild-Termins.
//
// **Keine eigene Abzeichen-Komponente.** Jedes Abzeichen entsteht aus
// `taskMarkerBadgeSpec`, derselben Beschreibung, aus der Lese-Ansicht,
// Live-Ansicht und Aufgaben-Abfragen ihre Abzeichen bauen: gleiche Klassen,
// gleicher Text, gleiche Überfällig- und Ungültig-Kennzeichnung (Paritäts-
// Checkliste der Entwicklungsrichtlinien). Die Beschriftungen kommen aus
// derselben Quelle wie dort (`getTaskMarkersConfig`), damit ein Sprachwechsel
// sie an allen Stellen gleich nachzieht.
//
// **Nur für die Anzeige.** Das Herausnehmen der Vorbild-Spannen arbeitet auf
// dem Fragment, das die Zeichnung ohnehin baut, nie auf dem Dokument (Muster
// `kanban-tags.js`). Die Regel des Herausnehmens ist dieselbe wie beim
// Umschreiben (`ohneSpannen` im Format-Kern), damit Anzeige und Dokument nach
// dem ersten Bearbeiten denselben Text zeigen.
//
// **Abhängigkeits-frei wie die Zeichnung** (Injektions-Bauweise): kein
// `app-state`, kein `api`, kein `i18n`. Übersetzung, Sprache und Bezugs-Zeitpunkt
// kommen als Optionen herein.
'use strict';

import { getTaskMarkersConfig, taskMarkerBadgeSpec } from '../../../shared/markdown/plugins.js';
import { DATE_MARKER_SYMBOLS, parseTaskLine } from '../../../shared/tasks/task-markers.js';
import { ohneSpannen } from '../../../shared/kanban/kanban-operationen.js';

export const MARKER_KLASSE = 'kanban-karte-marker';
export const FREMD_KLASSE = 'kanban-marker-fremd';

// Die Termin-Felder, die relativ gelesen werden: die in die Zukunft weisenden
// Planungs-Angaben. Erstellt-, Erledigt- und Abbruch-Datum sind Protokoll und
// bleiben absolut — «vor 12 Tagen erledigt» sagte weniger als das Datum.
const RELATIVE_FELDER = new Set(['due', 'scheduled', 'start']);

// Befund-Codes des Format-Kerns am Vorbild-Termin, für die es einen Satz gibt.
// Ein unbekannter Code erscheint als er selbst — eine Erweiterung des Kerns
// darf den Hinweis nicht stumm machen.
const BEFUND_SCHLUESSEL = {
  terminUnlesbar: 'kanban.termin.terminUnlesbar',
  uhrzeitOhneDatum: 'kanban.termin.uhrzeitOhneDatum',
};

const zweistellig = (n) => String(n).padStart(2, '0');

/**
 * Das Datum eines Zeitpunkts in lokaler Zeit als `YYYY-MM-DD` — dieselbe
 * Rechnung, mit der die Lese-Ansicht «überfällig» bestimmt (`isDueOverdue`).
 */
export function lokalesDatum(jetzt = new Date()) {
  return `${jetzt.getFullYear()}-${zweistellig(jetzt.getMonth() + 1)}-${zweistellig(jetzt.getDate())}`;
}

// Abstand zweier Kalendertage in ganzen Tagen. Gerechnet wird in UTC, damit
// eine Umstellung auf Sommer- oder Winterzeit keinen halben Tag einschmuggelt.
function tagAbstand(datum, heute) {
  const tag = (iso) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((tag(datum) - tag(heute)) / 86400000);
}

/**
 * Der relative Text eines Termins: «heute», «morgen», «gestern», «in 3 Tagen»,
 * «vor 2 Tagen», mit angehängter Uhrzeit, wenn es eine gibt.
 *
 * Formuliert wird wie in der Journal-Navigation (`periodRelationLine`) über
 * `Intl.RelativeTimeFormat` mit `numeric: 'auto'`: Die Laufzeit kennt Einzahl,
 * Mehrzahl und die Wörter für die Nachbartage in allen fünf Sprachen, eine
 * eigene Übersetzungs-Tabelle entfällt.
 *
 * @param {{date: string, time?: string|null}} wert
 * @param {{jetzt?: Date, locale?: string}} [optionen]
 * @returns {string}
 */
export function relativerTermin(wert, optionen = {}) {
  const jetzt = optionen.jetzt instanceof Date ? optionen.jetzt : new Date();
  const abstand = tagAbstand(wert.date, lokalesDatum(jetzt));
  let text;
  try {
    text = new Intl.RelativeTimeFormat(optionen.locale || undefined, { numeric: 'auto' }).format(
      abstand,
      'day',
    );
  } catch {
    // Eine unbekannte Sprach-Kennung darf die Karte nicht leeren; die Laufzeit
    // nimmt dann ihre eigene Vorgabe.
    text = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(abstand, 'day');
  }
  return wert.time ? `${text} ${wert.time}` : text;
}

function absolut(wert) {
  return wert.time ? `${wert.date} ${wert.time}` : wert.date;
}

/**
 * Die Karten-Zeile, wie die Karte sie zeigt: bei einem **lesbaren**
 * Vorbild-Termin ohne dessen Spannen gelesen, sonst wie im Modell.
 *
 * Gelesen wird die bereinigte Zeile neu und nicht bloß der Text gekürzt: Das
 * Vorbild hängt seinen Termin ans Zeilenende, und ein Termin-Marker davor zählt
 * für den Aufgaben-Kern erst dann als Marker, wenn nichts Fremdes mehr hinter
 * ihm steht. So zeigt die Karte vor dem Umschreiben dieselben Abzeichen, die
 * sie danach auch trägt.
 *
 * Ein unlesbarer Termin bleibt im Text stehen: Er lässt sich nicht deuten, und
 * sein Rohtext ist die einzige vollständige Auskunft über ihn.
 *
 * @param {object} karte Karte aus dem Modell des Format-Kerns.
 * @returns {{beschreibung: string, segmente: Array<object>}}
 */
export function angezeigteZeile(karte) {
  const aufgabe = karte && karte.aufgabe;
  const modell = {
    beschreibung: aufgabe ? aufgabe.description : String((karte && karte.text) || ''),
    segmente: aufgabe && Array.isArray(aufgabe.segments) ? aufgabe.segments : [],
  };
  const termin = karte && karte.vorbildTermin;
  if (!termin || !termin.lesbar || typeof karte.roh !== 'string') return modell;
  const bereinigt = parseTaskLine(ohneSpannen(karte.roh.replace(/\r$/, ''), termin.spannen));
  if (!bereinigt) return modell;
  return { beschreibung: bereinigt.description, segmente: bereinigt.segments };
}

/**
 * Das Fragment der Karte ohne die Spannen eines lesbaren Vorbild-Termins; die
 * Folgezeilen bleiben, wie sie sind (dort liest der Format-Kern keinen Termin).
 *
 * @param {string} fragment Markdown-Fragment aus `kartenFragment`.
 * @param {object} karte Karte aus dem Modell des Format-Kerns.
 * @returns {string}
 */
export function ohneVorbildTermin(fragment, karte) {
  const termin = karte && karte.vorbildTermin;
  if (!termin || !termin.lesbar) return fragment;
  const bruch = fragment.indexOf('\n');
  const erste = bruch < 0 ? fragment : fragment.slice(0, bruch);
  if (erste !== String(karte.text)) return fragment;
  const neu = angezeigteZeile(karte).beschreibung.replace(/[ \t]+$/, '');
  return bruch < 0 ? neu : neu + fragment.slice(bruch);
}

function abzeichen(spec) {
  const el = document.createElement('span');
  el.className = spec.cls;
  el.textContent = spec.text;
  if (spec.title) el.title = spec.title;
  return el;
}

// Ein Termin-Abzeichen, auf Wunsch relativ gelesen; der Titel trägt dann das
// absolute Datum, damit die genaue Angabe einen Zeiger entfernt bleibt.
function terminAbzeichen(seg, labels, optionen) {
  const spec = taskMarkerBadgeSpec(seg, labels);
  if (optionen.relativ === true && RELATIVE_FELDER.has(seg.field) && !seg.value.invalid) {
    spec.text = `${DATE_MARKER_SYMBOLS[seg.field]} ${relativerTermin(seg.value, optionen)}`;
    spec.title = spec.title ? `${spec.title}: ${absolut(seg.value)}` : absolut(seg.value);
  }
  return spec;
}

function vorbildAbzeichen(termin, labels, optionen, t) {
  if (!termin.lesbar) {
    const roh = termin.rohText || '';
    const code = termin.befund ? termin.befund.code : '';
    return abzeichen({
      cls: `task-marker task-marker-date task-marker-due task-marker-invalid ${FREMD_KLASSE}`,
      text: roh,
      title: BEFUND_SCHLUESSEL[code] ? t(BEFUND_SCHLUESSEL[code]) : String(code),
    });
  }
  const seg = {
    kind: 'date',
    field: 'due',
    raw: '',
    value: { date: termin.datum, time: termin.uhrzeit, invalid: false },
  };
  const spec = terminAbzeichen(seg, labels, optionen);
  spec.cls += ` ${FREMD_KLASSE}`;
  const hinweis = t('kanban.termin.fremd');
  spec.title = optionen.relativ === true ? `${absolut(seg.value)}\n${hinweis}` : hinweis;
  const el = abzeichen(spec);
  if (optionen.aenderbar !== false) el.dataset.kanbanTermin = 'vorbild';
  return el;
}

/**
 * Die Abzeichen-Reihe einer Karte: zuerst ein etwaiger Vorbild-Termin (er steht
 * im Text vor den Marker-Segmenten), dann je Marker-Segment der Karten-Zeile
 * ein Abzeichen in der Reihenfolge der Zeile. Ohne Angabe gibt es keine Reihe.
 *
 * Das Termin-Abzeichen trägt im änderbaren Dokument die Kennung
 * `data-kanban-termin`; über sie findet die Bedienung den Klick zum Wähler. Im
 * nicht änderbaren Dokument fehlt sie, das Abzeichen ist dann reine Anzeige.
 *
 * @param {object} karte Karte aus dem Modell.
 * @param {object} [optionen]
 * @param {Function} [optionen.t] Übersetzungs-Funktion.
 * @param {boolean} [optionen.relativ] Schalter «Termine relativ anzeigen».
 * @param {string} [optionen.locale] Sprach-Kennung für die relative Lesart.
 * @param {Date} [optionen.jetzt] Bezugs-Zeitpunkt (Vorgabe: jetzt).
 * @param {boolean} [optionen.aenderbar] Erbt die Änderbarkeit des Dokuments.
 * @param {object} [optionen.labels] Beschriftungen (Vorgabe: die der Lese-Ansicht).
 * @returns {HTMLElement|null}
 */
export function baueMarkerReihe(karte, optionen = {}) {
  const t = typeof optionen.t === 'function' ? optionen.t : (key) => key;
  const labels = optionen.labels || (getTaskMarkersConfig() || {}).labels || {};
  const segmente = angezeigteZeile(karte).segmente;
  const elemente = [];
  if (karte && karte.vorbildTermin) {
    const termin = karte.vorbildTermin;
    const zeile = typeof karte.roh === 'string' ? karte.roh.replace(/\r$/, '') : '';
    const rohText = termin.spannen.map((s) => zeile.slice(s.von, s.bis).trim()).join(' ');
    elemente.push(vorbildAbzeichen({ ...termin, rohText }, labels, optionen, t));
  }
  for (const seg of segmente) {
    const spec =
      seg.kind === 'date'
        ? terminAbzeichen(seg, labels, optionen)
        : taskMarkerBadgeSpec(seg, labels);
    const el = abzeichen(spec);
    if (seg.kind === 'date' && seg.field === 'due' && optionen.aenderbar !== false) {
      el.dataset.kanbanTermin = 'due';
    }
    elemente.push(el);
  }
  if (elemente.length === 0) return null;
  const reihe = document.createElement('div');
  reihe.className = MARKER_KLASSE;
  for (const el of elemente) reihe.appendChild(el);
  return reihe;
}

/**
 * Das anklickbare Termin-Abzeichen an einer Zeiger-Stelle der Karte, sonst null.
 *
 * @param {EventTarget|null} ziel
 * @returns {HTMLElement|null}
 */
export function terminAbzeichenAn(ziel) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const el = ziel.closest('[data-kanban-termin]');
  if (!el || typeof el.closest !== 'function' || !el.closest('.kanban-karte')) return null;
  return el;
}
