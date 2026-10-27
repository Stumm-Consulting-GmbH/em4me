// 4T-002350 (Epic 3E-000184): Der Lauf-Stand im Fenster — dieselbe Aussage in
// der Statusleiste und auf der Seite «Workflow-Läufe» (Story 4S-001106, AK1 und
// AK3; A1 der Konzept-Stufe).
//
// **Der Hinweis und die Seite lesen denselben Lauf.** Der Start
// (workflow-start.js) meldet jeden verbuchten Lauf hierher, nachdem der
// Hauptprozess ihn in die Begleitdatei geschrieben hat, und zwar mit dem
// vollständigen Ergebnis, aus dem auch der Hinweis «Workflow ‹Name› abgebrochen
// in Zeile N: Grund» entsteht. Die Seite zieht daraufhin nach und setzt für
// diesen Lauf denselben Grund-Text ein (`grundText` aus workflow-lauf-texte.js);
// Zeile und Code stehen ohnehin gleich in der Begleitdatei.
//
// **Ohne das Ergebnis im Speicher** — nach einem Neustart oder für einen Lauf
// aus einem anderen Fenster — kennt die Begleitdatei nur Zeile und Code (Form
// aus 4T-002348). Der Grund entsteht dann aus dem Text des Codes, die
// Einzel-Angaben wie Dateiname oder Befehl stehen als «…»; ein Abbruch in einem
// aufgerufenen Workflow nennt allein diese Tatsache.
//
// Eigener Zustand: die Ergebnisse der Läufe dieses Fensters je Datei (der
// jüngste je Datei) und die Zuhörer.
'use strict';

import { intlLocale, t } from '../../i18n.js';
import { einsetzen, fehlschlagSchluessel, grundText } from './workflow-lauf-texte.js';

const ergebnisse = new Map(); // Schlüssel des Pfads -> { startedAt, status, ergebnis }
const zuhoerer = new Set();

// Derselbe Ort aus Reiter, Ordner-Liste und Index, verschieden geschrieben
// (Muster `gleicherPfad` in workflow-start.js).
function schluessel(pfad) {
  return String(pfad).replace(/\\/g, '/').toLowerCase();
}

/**
 * Ein Lauf ist verbucht (aufgerufen vom Start nach `workflow:recordRun`).
 *
 * @param {string} pfad absoluter Pfad der Workflow-Datei.
 * @param {{status: string, startedAt?: number}} run die verbuchten Angaben.
 * @param {object|null} ergebnis das Ergebnis, aus dem der Hinweis entstand.
 */
export function laufVerbucht(pfad, run, ergebnis) {
  if (typeof pfad !== 'string' || pfad === '' || !run) return;
  ergebnisse.set(schluessel(pfad), {
    startedAt: Number.isFinite(run.startedAt) ? run.startedAt : null,
    status: run.status,
    ergebnis: ergebnis || null,
  });
  for (const cb of zuhoerer) {
    try {
      cb(pfad);
    } catch (err) {
      console.warn('[Workflows] Zuhörer des Lauf-Stands fehlgeschlagen:', err && err.message);
    }
  }
}

/**
 * Zuhörer für jeden verbuchten Lauf dieses Fensters; Rückgabe meldet ab.
 *
 * @param {(pfad: string) => void} cb
 * @returns {() => void}
 */
export function onLaufVerbucht(cb) {
  zuhoerer.add(cb);
  return () => zuhoerer.delete(cb);
}

/** Vergisst alle gemerkten Ergebnisse (Prüffälle). */
export function laufStandZuruecksetzen() {
  ergebnisse.clear();
}

// Das gemerkte Ergebnis, wenn es zu genau diesem letzten Lauf gehört: gleicher
// Status und gleiche Sekunde des Beginns (die Begleitdatei hält sekundengenau).
function gemerktesErgebnis(pfad, lastRun) {
  const eintrag = ergebnisse.get(schluessel(pfad));
  if (!eintrag || !eintrag.ergebnis || eintrag.status !== lastRun.status) return null;
  const at = Date.parse(lastRun.at);
  if (!Number.isFinite(at) || eintrag.startedAt === null) return null;
  return Math.floor(at / 1000) === Math.floor(eintrag.startedAt / 1000) ? eintrag.ergebnis : null;
}

// Der Text eines Schlüssels mit «…» an jeder Einzel-Angabe; null, wenn die
// Sprachdatei den Schlüssel nicht kennt.
function ohneAngaben(key) {
  const vorlage = t(key);
  return vorlage === key ? null : vorlage.replace(/\{\w+\}/g, '…');
}

/**
 * Der Grund eines Abbruchs allein aus seinem Code (Lauf-Stand der Begleitdatei).
 *
 * @param {string} code Code aus `lastRun.code`.
 * @returns {string}
 */
export function grundAusCode(code) {
  if (code === 'workflowFailed') return t('workflow.seite.grundUnterWorkflow');
  const text = ohneAngaben(fehlschlagSchluessel(code)) || ohneAngaben(`workflow.befund.${code}`);
  if (text !== null) return text;
  // Lauter Nachschlage-Vorgang wie in workflow-lauf-texte.js: Konsole und Code.
  console.warn(`[Workflows] Kein Text für den Code '${code}'.`);
  return String(code);
}

/**
 * Der Grund des letzten Laufs: aus dem gemerkten Ergebnis, sonst aus dem Code.
 *
 * @param {string} pfad absoluter Pfad der Workflow-Datei.
 * @param {{at: string, status: string, code?: string}} lastRun
 * @returns {string}
 */
export function laufGrund(pfad, lastRun) {
  const ergebnis = gemerktesErgebnis(pfad, lastRun);
  if (ergebnis) return grundText(ergebnis);
  return typeof lastRun.code === 'string' ? grundAusCode(lastRun.code) : '';
}

/**
 * Das Ergebnis des letzten Laufs als Text der Seite: dieselbe Zeile und derselbe
 * Grund wie der Hinweis in der Statusleiste.
 *
 * @param {string} pfad absoluter Pfad der Workflow-Datei.
 * @param {{at: string, status: string, line?: number, code?: string}} lastRun
 * @returns {string}
 */
export function ergebnisText(pfad, lastRun) {
  const mitZeile = Number.isInteger(lastRun.line);
  switch (lastRun.status) {
    case 'ok':
      return t('workflow.seite.ergebnis.ok');
    case 'canceled':
      return t('workflow.seite.ergebnis.canceled');
    case 'stopped':
      return einsetzen(t('workflow.seite.ergebnis.stopped'), { line: lastRun.line });
    case 'failed': {
      const key = mitZeile
        ? 'workflow.seite.ergebnis.failed'
        : 'workflow.seite.ergebnis.failedOhneZeile';
      return einsetzen(t(key), { line: lastRun.line, reason: laufGrund(pfad, lastRun) });
    }
    default:
      return t('workflow.seite.ergebnis.unbekannt');
  }
}

/**
 * Zeitpunkt des letzten Laufs in der Sprache der Oberfläche (Muster der
 * Bereichs-Statistik: feste Stellenzahl, Reihenfolge nach der Sprache).
 *
 * @param {string} at UTC ISO-8601 aus der Begleitdatei.
 * @returns {string}
 */
export function zeitpunktText(at) {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return String(at);
  return new Date(ms).toLocaleString(intlLocale() || undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
