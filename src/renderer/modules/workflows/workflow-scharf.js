// 4T-002422 (Epic 3E-000366, Story 4S-001133): Das eine Kommando der
// Scharf-Schaltung hinter den drei Bedienorten (Entscheidung 2e): Spalte
// «Scharf» der Seite «Workflow-Läufe» (workflow-laeufe-spalten.js), Knopf
// neben «Starten» über dem Block (workflow-scharf-knopf.js) und Eintrag im
// Kontextmenü des Bereichs-Panels (area-panel-menus.js).
//
// **Ablauf von `schalteScharf`:** Zuerst meldet das Fenster seine
// ungespeicherten Stände (`flushPendingBuffers`), damit der Hauptprozess die
// Prüfsumme über denselben Text rechnet, den der Editor zeigt. Beim Scharf-
// Schalten prüft das Fenster vor dem Aufruf mit allen Rückfragen
// (`pruefeWorkflow`, dieselbe Prüfung wie Kopfzeile und Start) und weist bei
// einem Befund mit Zeile und Grund selbst ab; der Hauptprozess prüft dahinter
// fail-closed noch einmal (src/main/ipc/workflow-armed.js). Das Ergebnis geht
// als Hinweis in die Statusleiste und an die Zuhörer (`onScharfGeaendert`), an
// denen die Seite «Workflow-Läufe» und der Knopf über dem Block nachziehen.
//
// Eigener Zustand: die Zuhörer.
'use strict';

import { intlLocale, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { einsetzen } from './workflow-lauf-texte.js';
import { befundZeile, pruefeWorkflow } from './workflow-pruefung.js';
import { flushPendingBuffers } from './workflow-window.js';

/** Die Zustände der Scharf-Schaltung, wie der Hauptprozess sie liefert. */
export const SCHARF = Object.freeze({
  an: 'armed',
  aus: 'notArmed',
  geaendert: 'definitionChanged',
});

const zuhoerer = new Set();

/**
 * Meldet eine Änderung der Scharf-Schaltung an.
 *
 * @param {(pfad: string, ergebnis: object) => void} cb
 * @returns {() => void} Abmeldung.
 */
export function onScharfGeaendert(cb) {
  zuhoerer.add(cb);
  return () => zuhoerer.delete(cb);
}

function melde(pfad, ergebnis) {
  for (const cb of zuhoerer) {
    try {
      cb(pfad, ergebnis);
    } catch (err) {
      console.warn('[Workflows] Zuhörer der Scharf-Schaltung fehlgeschlagen:', err);
    }
  }
}

/**
 * Eine Wanduhr-Zeit `JJJJ-MM-TTTHH:MM` in der Sprache der Oberfläche, ohne
 * Sekunden (der Zeitplan rechnet in Minuten).
 *
 * @param {string|null} wand
 * @returns {string}
 */
export function wanduhrText(wand) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(wand || ''));
  if (!m) return wand ? String(wand) : '';
  const datum = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return datum.toLocaleString(intlLocale() || undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Der Scharf-Zustand einer Workflow-Datei aus dem Hauptprozess.
 *
 * @param {string} pfad absoluter Pfad.
 * @returns {Promise<{ok: boolean, isWorkflow?: boolean, scheduled?: boolean,
 *   status?: string, nextDue?: string|null, code?: string}>}
 */
export async function scharfZustand(pfad) {
  if (typeof api.workflowArmedState !== 'function') return { ok: false, code: 'unexpected' };
  try {
    return (await api.workflowArmedState(pfad)) || { ok: false, code: 'unexpected' };
  } catch (err) {
    console.warn('[Workflows] Scharf-Zustand nicht abrufbar:', err && err.message);
    return { ok: false, code: 'unexpected' };
  }
}

/**
 * Der Grund einer Abweisung in der Sprache der Oberfläche.
 *
 * @param {{code?: string, findings?: object[]}} antwort
 * @returns {string}
 */
export function abweisungsGrund(antwort) {
  const befunde = Array.isArray(antwort.findings) ? antwort.findings : [];
  if (antwort.code === 'findings' && befunde.length > 0) return befundZeile(befunde[0]);
  const key = `workflow.scharf.fehler.${antwort.code}`;
  const text = t(key);
  return text === key ? t('workflow.scharf.fehler.unexpected') : text;
}

function nameAus(pfad, name) {
  if (typeof name === 'string' && name !== '') return name;
  return String(pfad)
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '');
}

function abgewiesen(pfad, antwort) {
  const text = einsetzen(t('workflow.scharf.abgewiesen'), { grund: abweisungsGrund(antwort) });
  showStatusbarHint(null, { text, error: true, duration: 5000 });
  melde(pfad, antwort);
  return antwort;
}

/**
 * Schaltet einen Workflow scharf oder entschärft ihn — das Kommando hinter
 * allen drei Bedienorten.
 *
 * @param {string} pfad absoluter Pfad der Workflow-Datei.
 * @param {boolean} an true schaltet scharf, false entschärft.
 * @param {{name?: string, text?: string}} [opts] Name für den Hinweis; `text`
 *   ist der Stand im Editor, wenn der Aufrufer ihn hat (Knopf über dem Block).
 * @returns {Promise<object>} die Antwort des Hauptprozesses oder der Abweisung.
 */
export async function schalteScharf(pfad, an, opts = {}) {
  if (typeof api.workflowSetArmed !== 'function') return { ok: false, code: 'unexpected' };
  if (an && typeof opts.text === 'string') {
    const analyse = pruefeWorkflow(opts.text, { fileName: pfad });
    if (analyse.isWorkflow && !analyse.armable && analyse.findings.length > 0) {
      return abgewiesen(pfad, { ok: false, code: 'findings', findings: analyse.findings });
    }
  }
  let antwort;
  try {
    await flushPendingBuffers();
    antwort = await api.workflowSetArmed(pfad, an);
  } catch (err) {
    console.warn('[Workflows] Scharf-Schaltung fehlgeschlagen:', err && err.message);
    antwort = { ok: false, code: 'unexpected' };
  }
  if (!antwort || !antwort.ok) return abgewiesen(pfad, antwort || { ok: false });
  const name = nameAus(pfad, opts.name);
  const text = an
    ? einsetzen(t('workflow.scharf.geschaltet'), { name, due: wanduhrText(antwort.nextDue) })
    : einsetzen(t('workflow.scharf.entschaerft'), { name });
  showStatusbarHint(null, { text, duration: 4000 });
  melde(pfad, antwort);
  return antwort;
}

/**
 * Der Hinweis-Text zum Zustand, für Knopf und Seite.
 *
 * @param {string} status Zustand aus `SCHARF`.
 * @param {string|null} nextDue nächster Lauf.
 * @returns {string}
 */
export function scharfTitel(status, nextDue) {
  if (status === SCHARF.an) {
    return einsetzen(t('workflow.scharf.titelAn'), { due: wanduhrText(nextDue) });
  }
  if (status === SCHARF.geaendert) return t('workflow.scharf.titelGeaendert');
  return t('workflow.scharf.titelAus');
}
