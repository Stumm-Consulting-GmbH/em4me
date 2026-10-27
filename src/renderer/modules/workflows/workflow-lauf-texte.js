// 4T-002349 (Epic 3E-000184): Die Texte am Ende eines Workflow-Laufs.
//
// Ein abgebrochener Lauf meldet sich in der Statusleiste als «Workflow ‹Name›
// abgebrochen in Zeile N: Grund» (A1, Story 4S-001105, AK7). Der Grund kommt
// aus drei Quellen: einem Befund der Prüfung vor dem Laufen (Texte unter
// `workflow.befund.<code>`, `befundText` aus workflow-pruefung.js), einem
// Fehlschlag zur Laufzeit (Texte unter `workflow.fehlschlag.<code>`, die Codes
// des Ablauf-Kerns und des Hauptprozesses) und, bei einem verschachtelten
// Workflow, dem Ergebnis des inneren Laufs, das sich als Kette fortsetzt.
//
// Ein Code ohne Text meldet sich in der Konsole und erscheint als Code
// (lauter Nachschlage-Vorgang, Entwicklungsrichtlinien, Kapitel 1).
'use strict';

import { t } from '../../i18n.js';
import { befundText } from './workflow-pruefung.js';

// Der Text zu einem Schlüssel oder null, wenn die Sprachdatei ihn nicht kennt.
function text(key) {
  const wert = t(key);
  return wert === key ? null : wert;
}

/**
 * Setzt Werte in eine Vorlage `{name}` ein; ein fehlender Wert bleibt leer.
 *
 * @param {string} vorlage
 * @param {object} werte
 * @returns {string}
 */
export function einsetzen(vorlage, werte) {
  return vorlage.replace(/\{(\w+)\}/g, (_, name) =>
    werte[name] === undefined || werte[name] === null ? '' : String(werte[name]),
  );
}

/**
 * Der i18n-Schlüssel eines Laufzeit-Codes.
 *
 * @param {string} code
 * @returns {string}
 */
export function fehlschlagSchluessel(code) {
  return `workflow.fehlschlag.${code}`;
}

// Ort und Grund eines Ergebnisses als «in Zeile N: Grund» oder «: Grund».
function ortUndGrund(ergebnis, mitZeile, ohneZeile) {
  const werte = { name: ergebnis.workflow, line: ergebnis.line, reason: grundText(ergebnis) };
  const key = typeof ergebnis.line === 'number' ? mitZeile : ohneZeile;
  return einsetzen(t(key), werte);
}

/**
 * Der Grund eines fehlgeschlagenen Laufs in der Sprache der Anwendung.
 *
 * @param {{code: string, detail?: object, befund?: boolean}} ergebnis
 * @returns {string}
 */
export function grundText(ergebnis) {
  if (ergebnis.befund) return befundText({ code: ergebnis.code, detail: ergebnis.detail || {} });
  const detail = ergebnis.detail || {};
  if (ergebnis.code === 'workflowFailed' && detail.inner) {
    return ortUndGrund(
      detail.inner,
      'workflow.fehlschlag.workflowFailed',
      'workflow.fehlschlag.workflowFailedOhneZeile',
    );
  }
  const vorlage = text(fehlschlagSchluessel(ergebnis.code));
  if (vorlage === null) {
    console.warn(`[Workflows] Kein Text für den Fehlschlag-Code '${ergebnis.code}'.`);
    return ergebnis.code;
  }
  return einsetzen(vorlage, detail);
}

/**
 * Der Hinweis am Ende eines Laufs, der nicht gelungen ist.
 *
 * @param {object} ergebnis `stopped` oder `failed` aus dem Ablauf-Kern oder der Vorbereitung.
 * @returns {string}
 */
export function abbruchText(ergebnis) {
  if (ergebnis.status === 'stopped') {
    return einsetzen(t('workflow.lauf.beendet'), {
      name: ergebnis.workflow,
      line: ergebnis.line,
      text: ergebnis.text,
    });
  }
  return ortUndGrund(ergebnis, 'workflow.lauf.abgebrochen', 'workflow.lauf.abgebrochenOhneZeile');
}
