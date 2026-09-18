// 4T-001758 (Epic 3E-000253): Einstellungs-Bereich «Datenbank» — die Auskunft
// zur Datenbank des gebundenen Bereichs und die eine Option, ihre Übersicht
// beim Öffnen zu zeigen.
//
// **Gruppe «Aktueller Bereich».** Das ist keine Wahl, sondern die Regel für
// bereichsgebundene Konfiguration (Entwicklungsrichtlinien, Kapitel 10); sie
// bringt die Sichtbarkeits-Steuerung ohne gebundenen Bereich mit. Vorbild des
// Aufbaus ist `settings-area-links.js` mit Entwurf, `dirty` und `apply`.
//
// **Sichtbar nur in einem Datenbank-Bereich.** Über die Gruppen-Regel hinaus
// trägt die Sektion eine eigene Sichtbarkeits-Bedingung: In einem Bereich ohne
// Datenbank hat sie nichts zu sagen — die Auskunft wäre leer und die Option
// ohne Gegenstand. Ein Abschnitt, der in jedem Bereich steht und in den
// meisten nichts enthält, ist Rauschen für jeden Anwender, der keine Datenbank
// führt; und weil die Bereichs-Art am Steckbrief hängt, entsteht die Sektion
// in dem Moment, in dem der Anwender ihn schreibt.
//
// **Die Auskunft ist lesend und in Kurzform.** Name, Beschreibung, Zahl der
// Tabellen und die ZAHL der Fehlerlagen. Die einzelnen Fehlerlagen im Klartext
// gehören auf die Übersichts-Seite, die dafür den Hinweis-Katalog übersetzt;
// hier stünde eine zweite, notwendig kürzere Fassung derselben Meldungen.
'use strict';

import { t, intlLocale } from '../../i18n.js';
import { api } from '../app/api.js';
import { datenbankAuskunft } from '../database/datenbank-bereich.js';
import { showStatusbarHint } from '../views/views.js';
import { buildSettingsRow } from './settings-shared.js';
import { loeseBeschriftung } from '../../../shared/database/beschriftung.js';
import { wirksameRueckfallSprache } from '../../../shared/database/database-steckbrief.js';

/**
 * Liest den Stand des Einstellungs-Bereichs für den Entwurf.
 *
 * Zwei Quellen: die Datenbank-Auskunft des Bereichs über den einen Helfer und
 * die Anzeige-Einstellung aus der Bereichsdatei. Beide Fehlerfälle enden im
 * Zustand «kein Datenbank-Bereich», und dann erscheint die Sektion nicht.
 *
 * @returns {Promise<{draft: object, snapshot: object}>} Entwurf und Vergleichs-Stand.
 */
export async function readDatabaseFromConfig() {
  const auskunft = await datenbankAuskunft();
  let konfig;
  try {
    konfig = await api.getAreaDatabaseConfig();
  } catch {
    konfig = null;
  }
  const overviewOnOpen = !!(konfig && konfig.overviewOnOpen);
  return {
    draft: {
      hasArea: !!(konfig && konfig.hasArea),
      istDatenbankBereich: auskunft.istDatenbankBereich,
      steckbrief: auskunft.steckbrief,
      tabellenZahl: auskunft.tabellen.length,
      // Fehlerlagen der ganzen Datenbank: die am Steckbrief plus die je
      // Tabelle. Beide zählen, weil beide den Anwender betreffen.
      fehlerZahl:
        auskunft.hints.length +
        auskunft.tabellen.reduce((summe, tab) => summe + (tab.hints ? tab.hints.length : 0), 0),
      overviewOnOpen,
    },
    snapshot: { overviewOnOpen },
  };
}

/**
 * Sichtbarkeits-Bedingung der Sektion. Ohne geladenen Entwurf ist die Antwort
 * «nein»: Solange die Auskunft aussteht, ist unbekannt, ob der Bereich eine
 * Datenbank führt, und ein Abschnitt, der erst erscheint und dann verschwindet,
 * wäre die schlechtere Auskunft als einer, der später dazukommt.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {boolean} true, wenn die Sektion erscheinen soll.
 */
export function sichtbarDatabaseSection(draft) {
  const values = draft && draft.database;
  return !!(values && values.hasArea && values.istDatenbankBereich);
}

/**
 * Meldet, ob der Entwurf ungesicherte Änderungen trägt.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {boolean} true bei Änderungen.
 */
export function dirtyDatabaseSection(draft) {
  const values = draft.database;
  if (!sichtbarDatabaseSection(draft)) return false;
  return values.overviewOnOpen !== !!(draft.databaseSnapshot || {}).overviewOnOpen;
}

/**
 * Schreibt die Anzeige-Einstellung in die Bereichsdatei.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {Promise<void>}
 */
export async function applyDatabaseSection(draft) {
  if (!dirtyDatabaseSection(draft)) return;
  const raus = { overviewOnOpen: draft.database.overviewOnOpen === true };
  let ergebnis;
  try {
    ergebnis = await api.setAreaDatabaseConfig(raus);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    // Eine defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis
    // statt stiller Wirkungslosigkeit (Muster applyAreaLinksSection).
    showStatusbarHint(null, { text: t('settings.database.writeFailed'), error: true });
    return;
  }
  draft.databaseSnapshot = { ...raus };
}

// Name und Beschreibung aus dem Steckbrief, in der Sprache des Anwenders.
// Fehlt eine Angabe, bleibt die Zeile bei ihrem Ersatz-Text: Der Steckbrief hat
// keine Pflichtangabe, und eine Datenbank ohne Namen ist kein Fehlerfall.
function steckbriefTexte(values) {
  const steckbrief = values.steckbrief;
  if (!steckbrief) return { name: null, beschreibung: null };
  // Die BCP-47-Form und nicht die Katalog-Kennung: Eine eingespielte eigene
  // Sprache heißt dort `custom:<code>`, und eine Datenbank kennt nur den Code.
  const sprache = intlLocale();
  const rueckfall = wirksameRueckfallSprache(steckbrief);
  return {
    name: loeseBeschriftung(steckbrief.name, sprache, rueckfall),
    beschreibung: loeseBeschriftung(steckbrief.description, sprache, rueckfall),
  };
}

// Eine lesende Zeile: Beschriftung links, Wert rechts. Bewusst kein
// deaktiviertes Eingabefeld, weil ein solches zum Bearbeiten einlädt und die
// Auskunft hier nirgends bearbeitet wird.
function baueAuskunftsZeile(container, labelKey, wert) {
  const zeile = document.createElement('div');
  zeile.className = 'settings-row';
  const label = document.createElement('label');
  label.textContent = t(labelKey);
  const text = document.createElement('span');
  text.className = 'settings-row-hint';
  text.textContent = wert;
  zeile.append(label, text);
  container.appendChild(zeile);
}

/**
 * Zeichnet den Einstellungs-Bereich.
 *
 * @param {HTMLElement} container Ziel-Element.
 * @param {object} draft Entwurf der Einstellungs-Seite.
 */
export function renderDatabaseSection(container, draft) {
  const values = draft.database;
  if (!values) {
    const laden = document.createElement('p');
    laden.className = 'settings-row-hint';
    laden.textContent = t('settings.database.loading');
    container.appendChild(laden);
    return;
  }
  // Guard für den Übergangs-Moment eines Bereichs-Wechsels (Muster
  // renderAreaLinksSection); regulär ist die Sektion dann nicht erreichbar.
  if (!sichtbarDatabaseSection(draft)) return;

  const hinweis = document.createElement('p');
  hinweis.className = 'settings-row-hint';
  hinweis.textContent = t('settings.database.hint');
  container.appendChild(hinweis);

  const { name, beschreibung } = steckbriefTexte(values);
  baueAuskunftsZeile(container, 'settings.database.name', name || t('settings.database.noName'));
  baueAuskunftsZeile(
    container,
    'settings.database.description',
    beschreibung || t('settings.database.noDescription'),
  );
  baueAuskunftsZeile(container, 'settings.database.tables', String(values.tabellenZahl));
  baueAuskunftsZeile(
    container,
    'settings.database.issues',
    values.fehlerZahl === 0 ? t('settings.database.noIssues') : String(values.fehlerZahl),
  );

  const schalter = document.createElement('input');
  schalter.type = 'checkbox';
  schalter.id = 'settings-database-overview-on-open';
  schalter.checked = values.overviewOnOpen === true;
  schalter.addEventListener('change', () => {
    values.overviewOnOpen = schalter.checked;
  });
  container.appendChild(buildSettingsRow('settings.database.overviewOnOpen', schalter));
}
