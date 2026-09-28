// 4T-001885 (Epic 3E-000189): Einstellungs-Abschnitt «Eigene Angaben» — die
// Angaben des geöffneten Buches beziehungsweise Bücherregals.
//
// **Was er führt.** Beim Buch Titel, Autor, Beschreibung und Titelbild; beim
// Regal dieselben vier und zusätzlich die Darstellung als Kacheln oder Zeilen.
// Genau die Angaben, die Buch und Regal **heute schon tragen** — der Abschnitt
// bearbeitet sie, er erfindet keine neuen und verlegt keine (Reißleine des
// Epics, Story 4S-000994).
//
// **Wo er steht.** An erster Stelle des bereichsgebundenen Blocks, der bei
// geöffnetem Buch «Aktuelles Buch» heißt. In einem gewöhnlichen Bereich
// erscheint er nicht; dort gibt es die Angaben nicht, die er bearbeitet.
//
// **Wohin er schreibt: an dieselbe Stelle wie bisher.** Die vier Angaben stehen
// im Frontmatter der Buch- beziehungsweise Regal-Datei, die Darstellung im
// globalen Speicher unter dem Regal-Ordner. Ein zweiter Ablage-Ort für dieselbe
// Angabe entsteht nicht (AK6); wer sie am bisherigen Ort ändert, sieht die
// Änderung hier, und umgekehrt (AK18).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { leseDarstellung, schreibeDarstellung } from '../books/shelf-darstellung.js';
import { showStatusbarHint } from '../views/views.js';
import { KONTEXT_BUCH, KONTEXT_REGAL, einstellungsKontext } from './settings-kontext.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';

const FELDER = ['title', 'author', 'description', 'cover'];

// Der Anteil des Entwurfs, den ein Anwenden vergleicht: die vier Angaben plus
// die Darstellung des Regals. Alles Übrige (Kontext, Ladezustand, Auskunft zum
// Bild) ist Anzeige und nie Gegenstand eines Schreibvorgangs.
function vergleichsStand(werte) {
  if (!werte) return null;
  const stand = {};
  for (const feld of FELDER) stand[feld] = werte[feld] || '';
  stand.darstellung = werte.darstellung || 'tiles';
  return stand;
}

/**
 * Liest die eigenen Angaben des gebundenen Gegenstands für den Entwurf.
 *
 * Der Kontext kommt aus der Bindung des Fensters und steht damit sofort fest;
 * die Werte kommen aus dem Hauptprozess und werden nachgereicht. In einem
 * gewöhnlichen Bereich wird gar nicht erst gefragt.
 *
 * @returns {Promise<{draft: object, snapshot: object|null}>} Entwurf und Vergleichs-Stand.
 */
export async function readBookInfoFromConfig() {
  const kontext = einstellungsKontext();
  if (kontext !== KONTEXT_BUCH && kontext !== KONTEXT_REGAL) {
    return { draft: { kontext, geladen: true, vorhanden: false }, snapshot: null };
  }
  let ergebnis;
  try {
    ergebnis = kontext === KONTEXT_BUCH ? await api.books.getInfo() : await api.shelves.getInfo();
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    return { draft: { kontext, geladen: true, vorhanden: false }, snapshot: null };
  }
  const werte = {
    kontext,
    geladen: true,
    vorhanden: true,
    shelfDir: ergebnis.shelfDir || null,
    title: ergebnis.title || '',
    author: ergebnis.author || '',
    description: ergebnis.description || '',
    cover: ergebnis.cover || '',
    coverGefunden: ergebnis.coverGefunden === undefined ? null : ergebnis.coverGefunden,
    // Der Verweis, zu dem die Auskunft darueber gehoert. Aendert der Anwender
    // das Feld, passt die Auskunft nicht mehr und verschwindet.
    coverGemessen: ergebnis.cover || '',
    darstellung: 'tiles',
  };
  if (kontext === KONTEXT_REGAL) werte.darstellung = await leseDarstellung(werte.shelfDir);
  return { draft: werte, snapshot: vergleichsStand(werte) };
}

/**
 * Sichtbarkeits-Bedingung des Abschnitts.
 *
 * Ohne Entwurf ist die Antwort «nein», sonst entscheidet der Kontext, den der
 * Entwurf beim Aufbau festgehalten hat. Er steht synchron zur Verfügung — die
 * Navigation wartet also auf nichts, und der Abschnitt erscheint nicht erst
 * nachträglich.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {boolean} true, wenn der Abschnitt erscheinen soll.
 */
export function sichtbarBookInfoSection(draft) {
  const werte = draft && draft.bookInfo;
  if (!werte) return false;
  return werte.kontext === KONTEXT_BUCH || werte.kontext === KONTEXT_REGAL;
}

/**
 * Meldet, ob der Entwurf ungesicherte Änderungen trägt.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {boolean} true bei Änderungen.
 */
export function dirtyBookInfoSection(draft) {
  const werte = draft.bookInfo;
  if (!sichtbarBookInfoSection(draft) || !werte.vorhanden) return false;
  return !jsonEqual(vergleichsStand(werte), draft.bookInfoSnapshot);
}

/**
 * Schreibt die Angaben an ihre bisherigen Stellen.
 *
 * Zwei Ablagen, zwei Schreibvorgänge: die vier Angaben in das Frontmatter der
 * Buch- bzw. Regal-Datei, die Darstellung in den globalen Speicher. Geschrieben
 * wird nur, was sich geändert hat.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {Promise<void>}
 */
export async function applyBookInfoSection(draft) {
  if (!dirtyBookInfoSection(draft)) return;
  const werte = draft.bookInfo;
  const alt = draft.bookInfoSnapshot || {};
  const angabenGeaendert = FELDER.some((feld) => (werte[feld] || '') !== (alt[feld] || ''));
  if (angabenGeaendert) {
    const raus = {};
    for (const feld of FELDER) raus[feld] = werte[feld] || '';
    let ergebnis;
    try {
      ergebnis =
        werte.kontext === KONTEXT_BUCH
          ? await api.books.setInfo(raus)
          : await api.shelves.setInfo(raus);
    } catch {
      ergebnis = null;
    }
    if (!ergebnis || !ergebnis.ok) {
      // Eine defekte oder nicht schreibbare Datei wird nie überschrieben;
      // sichtbarer Hinweis statt stiller Wirkungslosigkeit (Muster
      // applyAreaLinksSection und applyDatabaseSection).
      showStatusbarHint(null, { text: t('settings.bookInfo.writeFailed'), error: true });
      return;
    }
  }
  if (werte.kontext === KONTEXT_REGAL && (werte.darstellung || 'tiles') !== alt.darstellung) {
    await schreibeDarstellung(werte.shelfDir, werte.darstellung);
  }
  // Der geschriebene Verweis ist nicht mehr gemessen; die Auskunft zum Bild
  // entfaellt, bis die Seite ihn erneut liest.
  werte.coverGemessen = null;
  draft.bookInfoSnapshot = vergleichsStand(werte);
}

// --- Bausteine der Anzeige ----------------------------------------------------

function textZeile(container, labelKey, id, werte, feld, { mehrzeilig = false } = {}) {
  const eingabe = document.createElement(mehrzeilig ? 'textarea' : 'input');
  eingabe.id = id;
  eingabe.className = 'settings-input';
  if (mehrzeilig) eingabe.rows = 3;
  else eingabe.type = 'text';
  eingabe.value = werte[feld] || '';
  eingabe.addEventListener('input', () => {
    werte[feld] = eingabe.value;
  });
  container.appendChild(buildSettingsRow(labelKey, eingabe));
  return eingabe;
}

function hinweisZeile(container, text, klasse = 'settings-row-hint') {
  const p = document.createElement('p');
  p.className = klasse;
  p.textContent = text;
  container.appendChild(p);
  return p;
}

/**
 * Zeichnet den Einstellungs-Abschnitt.
 *
 * @param {HTMLElement} container Ziel-Element.
 * @param {object} draft Entwurf der Einstellungs-Seite.
 */
export function renderBookInfoSection(container, draft) {
  const werte = draft.bookInfo;
  if (!werte || !werte.geladen) {
    hinweisZeile(container, t('settings.bookInfo.loading'));
    return;
  }
  // Guard für den Übergangs-Moment eines Bindungs-Wechsels (Muster
  // renderDatabaseSection); regulär ist der Abschnitt dann nicht erreichbar.
  if (!sichtbarBookInfoSection(draft)) return;
  if (!werte.vorhanden) {
    hinweisZeile(container, t('settings.bookInfo.unavailable'));
    return;
  }

  const buch = werte.kontext === KONTEXT_BUCH;
  hinweisZeile(container, t(buch ? 'settings.bookInfo.hintBook' : 'settings.bookInfo.hintShelf'));

  textZeile(container, 'settings.bookInfo.bookTitle', 'settings-book-info-title', werte, 'title');
  textZeile(container, 'settings.bookInfo.author', 'settings-book-info-author', werte, 'author');
  textZeile(
    container,
    'settings.bookInfo.description',
    'settings-book-info-description',
    werte,
    'description',
    { mehrzeilig: true },
  );
  const cover = textZeile(
    container,
    'settings.bookInfo.cover',
    'settings-book-info-cover',
    werte,
    'cover',
  );
  hinweisZeile(container, t('settings.bookInfo.coverHint'));
  // Die Bild-Datei liegt im Dateisystem und ist nicht in der Hand der
  // Anwendung: Ihr Fehlen ist kein Fehler, sondern eine Auskunft. Gemessen ist
  // der Stand beim Laden — wer den Verweis gerade tippt, bekommt die Auskunft
  // nach dem nächsten Öffnen der Seite (Abgrenzung der Story 4S-000994).
  if (werte.coverGefunden === false && (werte.cover || '') === werte.coverGemessen) {
    const fehlt = hinweisZeile(container, t('settings.bookInfo.coverMissing'));
    fehlt.id = 'settings-book-info-cover-missing';
    cover.setAttribute('aria-describedby', fehlt.id);
  }

  if (buch) return;

  const darstellung = document.createElement('select');
  darstellung.id = 'settings-book-info-view-mode';
  darstellung.className = 'settings-input';
  for (const modus of ['tiles', 'rows']) {
    const option = document.createElement('option');
    option.value = modus;
    // Dieselben Beschriftungen wie am Umschalter der Regal-Ansicht; eine
    // zweite Übersetzung derselben beiden Wörter wäre eine zweite Wahrheit.
    option.textContent = t(modus === 'tiles' ? 'shelfView.tiles' : 'shelfView.rows');
    darstellung.appendChild(option);
  }
  darstellung.value = werte.darstellung === 'rows' ? 'rows' : 'tiles';
  darstellung.addEventListener('change', () => {
    werte.darstellung = darstellung.value;
  });
  container.appendChild(buildSettingsRow('settings.bookInfo.viewMode', darstellung));
  hinweisZeile(container, t('settings.bookInfo.viewModeHint'));
}
