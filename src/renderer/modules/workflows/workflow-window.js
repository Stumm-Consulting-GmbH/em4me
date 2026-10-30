// 4T-002348 (Epic 3E-000184): Die Fenster-Seite der Workflow-Ausführung —
// Bearbeitung eines ungespeicherten Puffers, der Empfänger für Aufträge des
// Hauptprozesses, die Fenster-Handgriffe `open` und `close` und das Melden
// ausstehender Puffer-Stände vor einem Inhalts-Schritt.
//
// **Weiche zum Editor-Puffer** (A3, S-c): Hält ein Fenster den ungespeicherten
// Stand der Ziel-Datei, wirkt die Änderung dort und nicht auf der Platte. Der
// Hauptprozess bildet die Bearbeitung vollständig (fertiger Text); hier wird
// sie mit derselben Regel angewendet wie auf der Platte
// (`src/shared/workflows/workflow-edit.js`):
//   - aktives Dokument: eine einzige Editor-Transaktion über den geänderten
//     Bereich (gemeinsamer Anfang und gemeinsames Ende beider Texte), damit
//     Rückgängig in einem Schritt wirkt und die Schreibmarke außerhalb der
//     Änderung stehen bleibt;
//   - nicht aktives Dokument: der ungespeicherte Stand des Reiters, über
//     dieselbe Übernahme wie die Aufgaben-Abfrage (`uebernimmInPuffer`).
// Gespeichert wird nicht: Die ungespeicherte Arbeit bleibt ungespeichert.
//
// **Fenster-Handgriffe:** `open` über den gewöhnlichen Öffnen-Weg
// (`openInPane`, mit seinem Zweig für ein bereits geöffnetes Dokument),
// `close` über `closeTab` mit der gewohnten Speicher-Rückfrage. Entscheidung
// des Product Owners vom 2026-10-23 (Empfehlungen E3 und E6 pauschal
// übernommen): «Abbrechen» beendet den Lauf mit `closeCanceled`; ein nicht
// geöffnetes Dokument zu schließen gelingt ohne Änderung.
//
// **Pflege-Befehle** (4T-002424, Regeln P1, P3 und P5): `completeTask` hakt die
// vom Hauptprozess gefundene Aufgaben-Zeile über `toggleTaskFromQuery` ab,
// denselben Weg wie die Aufgaben-Abfrage (Erledigt-Datum, Wiederholung, Weiche
// über aktiven Reiter, anderes Fenster, ungespeicherten Reiter und Platte).
// Vor `delete` schließt `schliesseVorDemLoeschen` die Reiter dieses Fensters
// auf das Ziel, wie das Löschen im Bereichs-Panel (`views/file-trash.js`):
// Ein offener Reiter mit ungespeichertem Stand könnte die Datei sonst nach dem
// Löschen wieder schreiben; «Abbrechen» der Speicher-Rückfrage beendet den
// Lauf mit `closeCanceled`, bevor gelöscht ist.
//
// Die Lauf-Steuerung, die diese Funktionen aufruft, entsteht mit 4T-002349.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { showLinkPreviewDialog } from '../dialogs/dialogs.js';
import { flushIndexOverlay, paneEditors } from '../editor/editor.js';
import { closeTab, openInPane } from '../tabs/tabs.js';
import { findOpenTab, toggleTaskFromQuery, uebernimmInPuffer } from '../task-query-actions.js';
import { applyContentEdit } from '../../../shared/workflows/workflow-edit.js';
import { einsetzen } from './workflow-lauf-texte.js';

// Der kleinste Bereich, in dem sich zwei Texte unterscheiden.
function geaenderterBereich(alt, neu) {
  let anfang = 0;
  const kuerzer = Math.min(alt.length, neu.length);
  while (anfang < kuerzer && alt[anfang] === neu[anfang]) anfang++;
  let ende = 0;
  while (ende < kuerzer - anfang && alt[alt.length - 1 - ende] === neu[neu.length - 1 - ende]) {
    ende++;
  }
  return { from: anfang, to: alt.length - ende, insert: neu.slice(anfang, neu.length - ende) };
}

/**
 * Wendet eine Bearbeitung auf den Stand eines in diesem Fenster geöffneten
 * Dokuments an, ohne zu speichern.
 *
 * @param {string} path Pfad der Datei.
 * @param {object} edit Bearbeitung für `applyContentEdit`.
 * @returns {{ok: true, changed: boolean}|{ok: false, code: string}}
 */
export function applyBufferEdit(path, edit) {
  const open = findOpenTab(path);
  if (!open) return { ok: false, code: 'bufferUnavailable' };
  const aktiv = state.panes[open.paneIdx].activeIndex === open.tabIdx;
  const view = aktiv ? paneEditors[open.paneIdx] : null;
  const alt = view ? view.state.doc.toString() : String(open.tab.content ?? '');
  const ergebnis = applyContentEdit(alt, edit);
  if (!ergebnis.ok) return ergebnis;
  if (!ergebnis.changed) return { ok: true, changed: false };
  if (view) {
    view.dispatch({ changes: geaenderterBereich(alt, ergebnis.text), userEvent: 'input' });
  } else {
    uebernimmInPuffer(open, ergebnis.text);
  }
  return { ok: true, changed: true };
}

/**
 * Meldet die ausstehenden Puffer-Stände aller geänderten Dokumente dieses
 * Fensters sofort, damit der Hauptprozess vor einem Inhalts-Schritt weiß, wer
 * den ungespeicherten Stand hält.
 *
 * @returns {Promise<void>}
 */
export async function flushPendingBuffers() {
  const offen = [];
  for (const pane of state.panes) {
    for (const tab of pane.tabs) if (tab.dirty && tab.path) offen.push(flushIndexOverlay(tab));
  }
  await Promise.all(offen);
}

// Schließt alle Reiter dieses Fensters auf die Datei; false bei «Abbrechen».
async function schliesseDokument(path) {
  let geschlossen = 0;
  for (let p = state.panes.length - 1; p >= 0; p--) {
    const pane = state.panes[p];
    if (!pane) continue;
    for (let i = pane.tabs.length - 1; i >= 0; i--) {
      if (pane.tabs[i].path !== path) continue;
      if (!(await closeTab(p, i))) return { ok: false, geschlossen };
      geschlossen++;
    }
  }
  return { ok: true, geschlossen };
}

/**
 * Führt den Fenster-Handgriff eines Schritt-Ergebnisses aus dem Hauptprozess
 * aus und bildet das Ergebnis des Schritts.
 *
 * @param {{ok: true, line: number, keyword: string,
 *   window: {action: 'open'|'close'|'editOwnBuffer'|'completeTask', path: string,
 *   edit?: object, line?: number, taskText?: string}}} ergebnis
 * @returns {Promise<object>} Ergebnis in der Form des Hauptprozesses
 *   (`{ ok: true, line, keyword, effect }` oder `{ ok: false, line, keyword, code, detail }`).
 */
export async function runWindowAction(ergebnis) {
  const { line, keyword, window: handgriff } = ergebnis;
  const pfad = handgriff.path;
  const erfolg = (kind, via) => ({ ok: true, line, keyword, effect: { kind, paths: [pfad], via } });
  const fehlschlag = (code) => ({ ok: false, line, keyword, code, detail: { path: pfad } });
  if (handgriff.action === 'editOwnBuffer') {
    const res = applyBufferEdit(pfad, handgriff.edit);
    if (!res.ok) return fehlschlag(res.code);
    return erfolg(res.changed ? 'edited' : 'unchanged', 'ownBuffer');
  }
  if (handgriff.action === 'open') {
    await openInPane(state.activePaneIndex, [pfad]);
    return erfolg('opened', 'window');
  }
  if (handgriff.action === 'completeTask') {
    const ziel = { path: pfad, line: handgriff.line, taskText: handgriff.taskText };
    if (!(await toggleTaskFromQuery(ziel))) return fehlschlag('taskConflict');
    return erfolg('edited', 'taskToggle');
  }
  if (handgriff.action === 'close') {
    const res = await schliesseDokument(pfad);
    if (!res.ok) return fehlschlag('closeCanceled');
    return erfolg(res.geschlossen > 0 ? 'closed' : 'unchanged', 'window');
  }
  return fehlschlag('invalidStep');
}

/**
 * Die eine Bestätigung vor dem ersten Schritt eines Laufs mit `delete`
 * (Regel P1): nennt alle Ziele mit Pfad, «Ja» oder «Nein».
 *
 * @param {string} name Name des Workflows.
 * @param {string[]} ziele Pfade relativ zur Bereichs-Wurzel.
 * @returns {Promise<boolean>} true für «Ja».
 */
export function bestaetigeLoeschZiele(name, ziele) {
  return showLinkPreviewDialog({
    title: einsetzen(t('workflow.loeschen.titel'), { name }),
    summary: einsetzen(t('workflow.loeschen.text'), { n: ziele.length }),
    sections: [{ rows: ziele.map((ziel) => ({ text: ziel })) }],
    continueLabel: t('workflow.dialog.ja'),
    cancelLabel: t('workflow.dialog.nein'),
  });
}

/**
 * Die Frage eines `confirm`-Schritts (Regel P4) mit «Ja» und «Nein».
 *
 * @param {string} name Name des laufenden Workflows.
 * @param {string} frage Text der Frage.
 * @returns {Promise<boolean>} true für «Ja».
 */
export function frageJaNein(name, frage) {
  return showLinkPreviewDialog({
    title: einsetzen(t('workflow.frage.titel'), { name }),
    summary: frage,
    sections: [],
    continueLabel: t('workflow.dialog.ja'),
    cancelLabel: t('workflow.dialog.nein'),
  });
}

// Bereichs-relative Form eines Pfads, mit `/` und ohne Rücksicht auf Groß- und
// Kleinschreibung (derselbe Ort kann verschieden geschrieben sein).
function relativForm(pfad) {
  return String(pfad).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Schließt vor `delete` alle Reiter dieses Fensters auf das Ziel oder auf eine
 * Datei darunter, mit der gewohnten Speicher-Rückfrage.
 *
 * @param {string} relPfad Ziel des Schritts, relativ zur Bereichs-Wurzel.
 * @returns {Promise<boolean>} false bei «Abbrechen».
 */
export async function schliesseVorDemLoeschen(relPfad) {
  if (!state.areaPath) return true;
  const ziel = relativForm(relPfad);
  const trifft = (tab) => {
    if (!tab.path) return false;
    const rel = relativForm(api.relative(state.areaPath, tab.path));
    return rel === ziel || rel.startsWith(`${ziel}/`);
  };
  for (;;) {
    let treffer = null;
    for (let p = 0; p < state.panes.length && !treffer; p++) {
      const idx = state.panes[p].tabs.findIndex(trifft);
      if (idx >= 0) treffer = [p, idx];
    }
    if (!treffer) return true;
    if (!(await closeTab(treffer[0], treffer[1]))) return false;
  }
}

// Auftrag aus dem Hauptprozess: Dieses Fenster hält den ungespeicherten Stand
// einer Datei, die ein Workflow in einem anderen Fenster bearbeitet. Die
// Antwort trägt dieselbe Kennung; ohne sie endet der Schritt dort nach der
// Frist mit `bufferUnavailable`.
async function beantworteAuftrag(auftrag) {
  if (!auftrag || typeof auftrag.requestId !== 'string') return;
  let res;
  try {
    res =
      typeof auftrag.path === 'string'
        ? applyBufferEdit(auftrag.path, auftrag.edit)
        : { ok: false, code: 'invalidStep' };
  } catch (err) {
    console.error('Workflow-Auftrag im Puffer gescheitert:', err);
    res = { ok: false, code: 'bufferUnavailable' };
  }
  await api.workflowBufferEditDone({
    requestId: auftrag.requestId,
    ok: res.ok,
    code: res.ok ? null : res.code,
    changed: res.ok ? res.changed : null,
  });
}
// Am Modulkopf angemeldet wie die Aufträge der Erinnerungen und der
// Aufgaben-Abfrage.
api.onWorkflowBufferEdit?.((auftrag) => {
  beantworteAuftrag(auftrag).catch((err) =>
    console.error('Antwort auf einen Workflow-Auftrag nicht zugestellt:', err),
  );
});
