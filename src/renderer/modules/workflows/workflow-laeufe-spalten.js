// 4T-002422 (Epic 3E-000366, Story 4S-001133): Die Spalten der Stufe 2 auf der
// Seite «Workflow-Läufe» — «Scharf» und «Nächster Lauf», die Vermerke
// «nachgeholt» und «verfallen» beim letzten Lauf und das aufklappbare Journal
// des letzten Laufs (Entscheidungen 2d, 2e und 2g).
//
// Ausgezogen aus workflow-laeufe-seite.js, damit die Seite den Aufbau der
// Tabelle trägt und dieses Modul die Zellen der Zeitsteuerung. Die Daten kommen
// unverändert aus dem Kanal `workflow:runs` (src/main/ipc/workflow-runs.js):
// `scheduled`, `armed`, `nextDue`, `skipped` und im letzten Lauf `origin` und
// `journal`.
//
// **Schalter nur bei `trigger: schedule` und nie bei einem fremden Eintrag**
// (2e, 2h); er ruft dasselbe Kommando wie Knopf und Kontextmenü
// (`schalteScharf`). **Nächster Lauf** steht nur bei einem scharfen Workflow
// (AK6 der Story). **Journal** nur, wenn der letzte Lauf eines trägt; ein Lauf
// ohne Journal (Stand der Stufe 1) zeigt keines, ein leeres Journal sagt
// «Keine Datei berührt».
//
// Eigener Zustand: keiner.
'use strict';

import { t } from '../../i18n.js';
import { zeitpunktText } from './workflow-lauf-stand.js';
import { einsetzen } from './workflow-lauf-texte.js';
import { SCHARF, scharfTitel, schalteScharf, wanduhrText } from './workflow-scharf.js';

/** Die Spalten-Schlüssel der Tabelle, in ihrer Reihenfolge. */
export const SPALTEN = Object.freeze([
  'name',
  'ort',
  'scharf',
  'naechsterLauf',
  'letzterLauf',
  'ergebnis',
  'laeufe',
]);

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

/**
 * Zelle «Scharf»: Schalter bei einem eigenen Workflow mit Zeitplan, sonst leer;
 * bei geänderter Definition dazu der Hinweis.
 *
 * @param {object} w Eintrag aus `workflow:runs`.
 * @returns {HTMLTableCellElement}
 */
export function scharfZelle(w) {
  const zelle = el('td', 'wf-runs-armed');
  if (w.foreign === true || w.scheduled !== true) return zelle;
  const status = w.armed || SCHARF.aus;
  zelle.dataset.status = status;
  const schalter = el('input', 'wf-runs-arm');
  schalter.type = 'checkbox';
  schalter.checked = status === SCHARF.an;
  schalter.setAttribute(
    'aria-label',
    einsetzen(t('workflow.seite.scharfSchalter'), { name: w.name }),
  );
  schalter.title = scharfTitel(status, w.nextDue);
  schalter.addEventListener('change', () => {
    schalter.disabled = true;
    void schalteScharf(w.absPath, schalter.checked, { name: w.name }).finally(() => {
      schalter.disabled = false;
    });
  });
  zelle.appendChild(schalter);
  if (status === SCHARF.geaendert) {
    zelle.appendChild(el('span', 'wf-runs-armed-changed', t('workflow.seite.definitionGeaendert')));
  }
  return zelle;
}

/**
 * Zelle «Nächster Lauf»: nur bei einem scharfen Workflow.
 *
 * @param {object} w Eintrag aus `workflow:runs`.
 * @returns {HTMLTableCellElement}
 */
export function naechsterLaufZelle(w) {
  const zelle = el('td', 'wf-runs-next');
  if (w.foreign !== true && w.armed === SCHARF.an && w.nextDue) {
    zelle.textContent = wanduhrText(w.nextDue);
  }
  return zelle;
}

// Ist der verfallene Termin jünger als der letzte Lauf?
function verfallJuenger(w) {
  if (!w.skipped || !w.skipped.due) return false;
  if (!w.lastRun) return true;
  return Date.parse(w.skipped.at) >= Date.parse(w.lastRun.at);
}

/**
 * Ergänzt die Zelle «Letzter Lauf» um die Herkunft «nachgeholt» (2d) und den
 * Vermerk «verfallen» mit dem verfallenen Termin.
 *
 * @param {HTMLTableCellElement} zelle Zelle mit dem Zeitpunkt des letzten Laufs.
 * @param {object} w Eintrag aus `workflow:runs`.
 */
export function ergaenzeLetztenLauf(zelle, w) {
  if (w.lastRun && w.lastRun.origin === 'catch-up') {
    zelle.appendChild(el('span', 'wf-runs-origin', ` (${t('workflow.seite.nachgeholt')})`));
  }
  if (verfallJuenger(w)) {
    const vermerk = einsetzen(t('workflow.seite.verfallen'), { due: wanduhrText(w.skipped.due) });
    const zeile = el('div', 'wf-runs-skipped', vermerk);
    if (w.skipped.at) zeile.title = zeitpunktText(w.skipped.at);
    zelle.appendChild(zeile);
  }
}

// Die Zeile mit dem Journal; zu Beginn verborgen.
function journalZeile(w, spalten) {
  const zeile = el('tr', 'wf-runs-journal');
  zeile.hidden = true;
  const zelle = el('td', 'wf-runs-journal-cell');
  zelle.colSpan = spalten;
  zelle.appendChild(el('div', 'wf-runs-journal-title', t('workflow.seite.journal.titel')));
  const eintraege = w.lastRun.journal;
  if (eintraege.length === 0) {
    zelle.appendChild(el('p', 'wf-runs-journal-empty', t('workflow.seite.journal.leer')));
  } else {
    const liste = el('ul', 'wf-runs-journal-list');
    for (const e of eintraege) {
      const text = einsetzen(t('workflow.seite.journal.zeile'), {
        line: e.line,
        command: e.command,
        path: e.path,
      });
      liste.appendChild(el('li', null, text));
    }
    zelle.appendChild(liste);
  }
  if (w.lastRun.journalTruncated === true) {
    zelle.appendChild(el('p', 'wf-runs-journal-truncated', t('workflow.seite.journal.gekuerzt')));
  }
  zeile.appendChild(zelle);
  return zeile;
}

/**
 * Hängt den Knopf «Journal» an die Zelle «Letzter Lauf» und liefert die
 * aufklappbare Zeile dazu, oder null ohne Journal.
 *
 * @param {HTMLTableCellElement|null} laufZelle Zelle «Letzter Lauf»; nicht die
 *   Zelle «Ergebnis», deren Text dem Hinweis der Statusleiste gleicht.
 * @param {object} w Eintrag aus `workflow:runs`.
 * @param {number} spalten Zahl der Spalten der Tabelle.
 * @returns {HTMLTableRowElement|null}
 */
export function journalAufklapper(laufZelle, w, spalten) {
  if (!laufZelle || w.foreign === true || !w.lastRun) return null;
  if (!Array.isArray(w.lastRun.journal)) return null;
  const zeile = journalZeile(w, spalten);
  const knopf = el(
    'button',
    'wf-runs-journal-toggle',
    einsetzen(t('workflow.seite.journal.knopf'), { n: w.lastRun.journal.length }),
  );
  knopf.type = 'button';
  knopf.setAttribute('aria-expanded', 'false');
  knopf.addEventListener('click', () => {
    zeile.hidden = !zeile.hidden;
    knopf.setAttribute('aria-expanded', String(!zeile.hidden));
  });
  laufZelle.appendChild(knopf);
  return zeile;
}
