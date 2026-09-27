// 4T-001789 (Epic 3E-000255): Die Meldung der drei Begleit-Fehlschläge des
// Umbenennens, an einer Stelle für alle drei Bedienwege.
//
// Das Mitziehen der Änderungsbelege kann auf drei Wegen ausgelöst werden:
// Umbenennen-Dialog, Titel-Zeile und Verschieben im Buch. Alle drei zeigen
// denselben Sachverhalt und müssen denselben Text zeigen; drei Kopien der
// Zuordnung liefen früher oder später auseinander, und die abweichende Stelle
// meldete sich nicht, sie zeigte nur einen anderen Text.
//
// Die Platzhalter tragen Dateinamen OHNE Ordner: Der Anwender kennt seine
// Datei am Namen, und ein vollständiger Pfad sprengte die Hinweis-Fläche.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';

// Die Rollback-Meldung steht länger, weil sie zwei Namen trägt, die der
// Anwender abschreiben muss.
const DAUER_MS = 4000;
const RUECKNAHME_DAUER_MS = 8000;

function nurName(pfad) {
  if (typeof pfad !== 'string' || pfad === '') return '';
  return api.basename(pfad);
}

/**
 * Text und Anzeigedauer zu einer Begleit-Fehlschlag-Kennung.
 *
 * @param {string|undefined} code Kennung aus dem Hauptprozess.
 * @param {object} [felder] Ergebnis-Objekt mit companionPath bzw. from/to.
 * @returns {{text: string, dauerMs: number}|null} null, wenn die Kennung keine
 *   Begleit-Kennung ist; dann gilt die bisherige Behandlung des Aufrufers.
 */
export function begleitFehlerMeldung(code, felder = {}) {
  if (code === 'companion') {
    return { text: t('rename.companionFailed'), dauerMs: DAUER_MS };
  }
  if (code === 'companion-exists') {
    return {
      text: t('rename.companionExists').replace('{name}', nurName(felder.companionPath)),
      dauerMs: DAUER_MS,
    };
  }
  if (code === 'companion-rollback') {
    return {
      text: t('rename.companionRollbackFailed')
        .replace('{from}', nurName(felder.from))
        .replace('{to}', nurName(felder.to)),
      dauerMs: RUECKNAHME_DAUER_MS,
    };
  }
  return null;
}
