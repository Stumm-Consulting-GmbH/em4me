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
//
// 4T-002463 (Epic 3E-000367, Story 4S-001146, Entscheidung 3c): dazu das
// Ereignis eines Workflows in Worten (`ereignisInWorten`, für die Spalte
// «Nächster Lauf», den Hinweis beim Scharf-Schalten und den Tooltip des
// Schalters) und die Herkunft eines Laufs durch ein Ereignis
// (`ereignisHerkunft`, für die Spalte «Letzter Lauf»). Je Ereignis ein Text;
// Ordner und Muster setzen eigene Vorlagen um ihn herum, damit jede Sprache
// die Reihenfolge selbst wählt.
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
 * Das Ereignis einer Regel in Worten, etwa «bei neuer Datei in ‹Eingang›».
 *
 * @param {{event: string, in?: (string|null), matching?: (string|null)}|null} regel
 *   gelesene Ereignis-Regel (`meta.event` des Format-Kerns).
 * @returns {string} leer ohne Regel; ein Ereignis ohne Text erscheint als Name.
 */
export function ereignisInWorten(regel) {
  if (!regel || typeof regel.event !== 'string') return '';
  let satz = text(`workflow.ereignis.bei.${regel.event}`);
  if (satz === null) {
    console.warn(`[Workflows] Kein Text für das Ereignis '${regel.event}'.`);
    satz = regel.event;
  }
  if (typeof regel.in === 'string' && regel.in !== '') {
    satz = einsetzen(t('workflow.ereignis.mitOrt'), { ereignis: satz, ort: regel.in });
  }
  if (typeof regel.matching === 'string' && regel.matching !== '') {
    satz = einsetzen(t('workflow.ereignis.mitMuster'), { ereignis: satz, muster: regel.matching });
  }
  return satz;
}

/**
 * Die Herkunft eines Laufs durch ein Ereignis, etwa «Ereignis: neue Datei
 * ‹Eingang/Brief.md›».
 *
 * @param {{type?: string, file?: string}|null} ereignis `lastRun.event` aus dem
 *   Lauf-Stand; Pfade relativ zur Bereichs-Wurzel.
 * @returns {string}
 */
export function ereignisHerkunft(ereignis) {
  const art =
    ereignis && typeof ereignis.type === 'string'
      ? text(`workflow.ereignis.name.${ereignis.type}`)
      : null;
  if (art === null) return t('workflow.seite.herkunftEreignis');
  const mitDatei = typeof ereignis.file === 'string' && ereignis.file !== '';
  const key = mitDatei
    ? 'workflow.seite.herkunftEreignisDatei'
    : 'workflow.seite.herkunftEreignisArt';
  return einsetzen(t(key), { ereignis: art, datei: ereignis.file });
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
    // 4T-002424: `confirm` mit «Nein» endet wie `stop`; der Text nennt die Frage.
    const text = ergebnis.declined
      ? einsetzen(t('workflow.lauf.verneint'), { question: ergebnis.text })
      : ergebnis.text;
    return einsetzen(t('workflow.lauf.beendet'), {
      name: ergebnis.workflow,
      line: ergebnis.line,
      text,
    });
  }
  return ortUndGrund(ergebnis, 'workflow.lauf.abgebrochen', 'workflow.lauf.abgebrochenOhneZeile');
}
