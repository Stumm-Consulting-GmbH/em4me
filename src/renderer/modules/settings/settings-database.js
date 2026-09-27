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
// 4T-001795: Neu zeichnen, nachdem ein Anwenden am Sperr-Ordner gescheitert
// ist; die Meldung gehört an die Zeile des Feldes (Muster
// settings-attachments.js).
import { renderActiveSection } from './settings-mount.js';
import { loeseBeschriftung } from '../../../shared/database/beschriftung.js';
import { wirksameRueckfallSprache } from '../../../shared/database/database-steckbrief.js';
// 4T-001795 (Epic 3E-000255, E9): Vorgabe-Name und Gültigkeits-Regel des
// Sperr-Ordners. **Dieselbe** Regel wie im Haupt-Prozess und keine zweite: Ein
// Name, den die Oberfläche annimmt, der Haupt-Prozess aber verwirft, hieße, die
// Sperre liegt in einem Ordner, den niemand mehr sucht.
import {
  DEFAULT_LOCK_FOLDER_NAME,
  LOCK_FOLDER_NAME_CODES,
  MAX_LOCK_FOLDER_NAME_LENGTH,
  pruefeSperrOrdnerName,
} from '../../../shared/database/lock-folder-name.js';

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
  // 4T-001795: Der Kanal liefert den **wirksamen** Namen; ohne eigene Angabe
  // ist das der Vorgabe-Name. Ein leeres Feld stünde für nichts, denn einen
  // Bereich ohne Sperr-Ordner gibt es nicht.
  const lockFolderName =
    konfig && typeof konfig.lockFolderName === 'string' && konfig.lockFolderName !== ''
      ? konfig.lockFolderName
      : DEFAULT_LOCK_FOLDER_NAME;
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
      lockFolderName,
    },
    snapshot: { overviewOnOpen, lockFolderName },
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
  const stand = draft.databaseSnapshot || {};
  if (values.overviewOnOpen !== !!stand.overviewOnOpen) return true;
  // Ein leeres Feld ist eine Änderung und keine Rückkehr zur Vorgabe: Der leere
  // Name ist nach der Gültigkeits-Regel unzulässig, und wer ihn abschickt, soll
  // die Meldung dazu sehen statt still auf dem Vorgabe-Namen zu landen.
  return values.lockFolderName !== (stand.lockFolderName || DEFAULT_LOCK_FOLDER_NAME);
}

/**
 * Schreibt Anzeige-Einstellung und Namen des Sperr-Ordners in die Bereichsdatei.
 *
 * @param {object} draft Entwurf der Einstellungs-Seite.
 * @returns {Promise<void>}
 */
export async function applyDatabaseSection(draft) {
  if (!dirtyDatabaseSection(draft)) return;
  const raus = {
    overviewOnOpen: draft.database.overviewOnOpen === true,
    lockFolderName: draft.database.lockFolderName,
  };
  let ergebnis;
  try {
    ergebnis = await api.setAreaDatabaseConfig(raus);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok) {
    // Eine defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis
    // statt stiller Wirkungslosigkeit (Muster applyAreaLinksSection).
    //
    // 4T-001795: Trägt der Fehlschlag einen Code, ist er einer des
    // Sperr-Ordners und bekommt seinen eigenen Text. Die Meldung erscheint
    // zusätzlich an der Zeile des Feldes, weil die Statusleiste vergeht und der
    // Anwender dort nachsehen muss, wo er die Eingabe gemacht hat.
    const text = ergebnis && ergebnis.code ? sperrOrdnerMeldung(ergebnis) : null;
    draft.database.lockFolderMeldung = text;
    showStatusbarHint(null, { text: text || t('settings.database.writeFailed'), error: true });
    if (text) renderActiveSection();
    return;
  }
  draft.database.lockFolderMeldung = null;
  draft.databaseSnapshot = { ...raus };
}

// 4T-001795: Die Gründe, für die dieser Bedienort einen eigenen Text führt.
// Acht kommen aus der geteilten Gültigkeits-Regel, vier entstehen erst im
// Vorgang der Umbenennung (src/main/database/lock-folder-rename.js). Die Liste
// steht ausdrücklich und nicht als Vermutung über den Katalog: Ein Grund, den
// niemand hier eingetragen hat, bekommt den Ersatz-Text mit seinem Code, statt
// dem Anwender einen rohen Schlüssel zu zeigen.
const SPERR_ORDNER_GRUENDE = Object.freeze([
  ...Object.values(LOCK_FOLDER_NAME_CODES),
  'lockFolderTaken',
  'lockFolderBusy',
  'lockFolderRenameFailed',
  'lockFolderRollbackFailed',
]);

// 4T-001795: Je Grund ein eigener Text. Die Codes sind sprachneutral und
// entstehen im Haupt-Prozess; übersetzt wird hier, am Bedienort.
function sperrOrdnerMeldung(ergebnis) {
  const code = ergebnis.code;
  if (code === 'lockFolderBusy' && (!ergebnis.benutzer || !ergebnis.rechner)) {
    return t('settings.database.lockFolderError.lockFolderBusyUnknown');
  }
  if (!SPERR_ORDNER_GRUENDE.includes(code)) {
    return t('settings.database.lockFolderError.unknown').replace('{code}', String(code));
  }
  return t(`settings.database.lockFolderError.${code}`)
    .replace('{max}', String(MAX_LOCK_FOLDER_NAME_LENGTH))
    .replace('{user}', String(ergebnis.benutzer || ''))
    .replace('{machine}', String(ergebnis.rechner || ''))
    .replace('{old}', String(ergebnis.alt || ''))
    .replace('{new}', String(ergebnis.neu || ''));
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

  baueSperrOrdnerZeile(container, values);
}

/**
 * Das Eingabefeld für den Namen des Sperr-Ordners (4T-001795, AK1, AK12).
 *
 * **Ein gewöhnliches beschriftetes Textfeld**, kein eigenes Bedienelement: Die
 * Beschriftung zeigt über `for` auf das Feld, die Meldungs-Zeile hängt über
 * `aria-describedby` daran, und der Fehlerzustand steht in `aria-invalid`. Damit
 * ist das Feld mit der Tabulator-Taste erreichbar und mit der Tastatur
 * bedienbar, und wer es vorgelesen bekommt, hört Beschriftung, Erklärung und
 * Meldung in einem Zug.
 */
function baueSperrOrdnerZeile(container, values) {
  const feld = document.createElement('input');
  feld.type = 'text';
  feld.id = 'settings-database-lock-folder';
  feld.className = 'settings-input';
  feld.value = typeof values.lockFolderName === 'string' ? values.lockFolderName : '';
  container.appendChild(buildSettingsRow('settings.database.lockFolder', feld));

  const erklaerung = document.createElement('p');
  erklaerung.className = 'settings-row-hint';
  erklaerung.id = 'settings-database-lock-folder-hint';
  erklaerung.textContent = t('settings.database.lockFolderHint');
  container.appendChild(erklaerung);

  const meldung = document.createElement('p');
  meldung.className = 'settings-row-hint settings-database-lock-folder-error';
  meldung.id = 'settings-database-lock-folder-message';
  container.appendChild(meldung);
  feld.setAttribute('aria-describedby', `${erklaerung.id} ${meldung.id}`);

  // Die Prüfung läuft schon bei der Eingabe über dieselbe geteilte Funktion wie
  // im Haupt-Prozess; verbindlich bleibt die dortige, weil allein sie das
  // Dateisystem und die lebenden Sperren sieht.
  const zeige = () => {
    const geprueft = pruefeSperrOrdnerName(values.lockFolderName);
    const text = geprueft.ok
      ? values.lockFolderMeldung || ''
      : sperrOrdnerMeldung({ code: geprueft.code });
    meldung.textContent = text;
    meldung.hidden = text === '';
    feld.setAttribute('aria-invalid', geprueft.ok ? 'false' : 'true');
  };
  feld.addEventListener('input', () => {
    values.lockFolderName = feld.value;
    // Eine Meldung aus einem früheren Anwenden gehört zum alten Namen und
    // verfällt mit der ersten Tastatur-Eingabe.
    values.lockFolderMeldung = null;
    zeige();
  });
  zeige();
}
