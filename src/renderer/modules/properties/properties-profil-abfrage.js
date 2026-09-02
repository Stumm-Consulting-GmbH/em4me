// 4T-001176 (Epic 3E-000220, E7): Kommando «Profil-Abfrage einfügen» — Profil
// wählen, Abfrage erzeugen, an der Cursor-Position einfügen.
//
// Der erzeugte TEXT entsteht prozess-neutral in
// `shared/property-profiles-abfrage.js`; hier steht allein die Bedienung.
// Dieser Schnitt ist der Grund, warum der Umfang der Abfrage auf Unit-Ebene
// prüfbar ist, ohne ein Fenster zu bauen.
//
// **Es entsteht keine eigene Ansicht** (E7, Variante A verworfen). Eingefügt
// wird ein gewöhnlicher `perspective-query`-Fence; er läuft über die
// vorhandene Ergebnis-Ausgabe und ist danach Inhalt wie jeder andere —
// änderbar, verschiebbar, löschbar.
'use strict';

import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { showStatusbarHint } from '../views/views.js';
import { showTemplateSelectDialog } from '../templates.js';
import { t } from '../../i18n.js';
import { erzeugeProfilAbfrage } from '../../../shared/property-profiles.js';
import { HINWEIS_ZUORDNUNGS_FELD } from '../../../shared/property-profiles-abfrage.js';

// Der beschreibbare Haupt-Editor der aktiven Spalte, oder null. Guard-Muster
// von `insertEventsBlock`: derselbe Anspruch an den Ort, an dem eingefügt wird.
function beschreibbarerEditor() {
  const pane = state.panes[state.activePaneIndex];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const view = paneEditors[state.activePaneIndex];
  if (!tab || !tab.editMode || tab.viewMode === 'rendered' || !view || view.state.readOnly) {
    return null;
  }
  return view;
}

/**
 * Der einzufügende Text zu einem Abfrage-Text und einer Cursor-Lage.
 *
 * Ausgelagert und ausgeführt, weil hier zwei Zusagen der Story hängen: Der
 * Block landet **an der Cursor-Position** (AK1) und er ist ein gewöhnlicher
 * `perspective-query`-Fence (AK5/AK6) — kein eigenes Konstrukt, keine eigene
 * Ansicht. Der führende Umbruch entsteht nur mitten in einer nicht-leeren
 * Zeile; sonst risse der Fence die Zeile auf, in der er beginnt.
 *
 * @param {string} abfrageText Der erzeugte Abfrage-Text.
 * @param {object} editorState CodeMirror-State (doc und selection).
 * @returns {string} Der einzufügende Text.
 */
export function baueAbfrageEinfuegung(abfrageText, editorState) {
  const range = editorState.selection.main;
  const line = editorState.doc.lineAt(range.from);
  const vorsatz = line.length > 0 && range.from > line.from ? '\n' : '';
  return `${vorsatz}\`\`\`perspective-query\n${abfrageText}\n\`\`\`\n`;
}

// Profil-Namen des Bereichs für die Auswahl. Der interne Ereignis-Eintrag ist
// bewusst dabei: Er ist ein Profil wie jedes andere, und die Frage «welche
// Dokumente tragen es» ist bei ihm genauso sinnvoll.
function profilNamen(liste) {
  const namen = [];
  for (const p of Array.isArray(liste) ? liste : []) {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (name !== '' && !namen.includes(name)) namen.push(name);
  }
  return namen;
}

/**
 * Führt das Kommando aus: Profil erfragen, Abfrage erzeugen, Fence an der
 * Cursor-Position einfügen.
 *
 * @returns {Promise<boolean>} true, wenn ein Block eingefügt wurde.
 */
export async function fuegeProfilAbfrageEin() {
  if (!beschreibbarerEditor()) {
    showStatusbarHint('profileQuery.hint.noEditor', { error: true, duration: 3000 });
    return false;
  }

  let liste;
  try {
    liste = await api.profilesList();
  } catch {
    liste = null;
  }
  const namen = liste && liste.ok ? profilNamen(liste.profiles) : [];
  if (namen.length === 0) {
    showStatusbarHint('profileQuery.hint.noProfiles', { error: true, duration: 3000 });
    return false;
  }

  // Bei genau einem Profil gibt es nichts zu wählen (Muster `pickJournal`).
  const profil =
    namen.length === 1
      ? namen[0]
      : await showTemplateSelectDialog(t('profileQuery.pick.title'), namen);
  if (!profil) return false;

  const config = liste.config || {};
  const abfrage = erzeugeProfilAbfrage({
    profil,
    assignField: config.assignField,
    defaultProfile: config.defaultProfile,
    bindings: config.bindings,
  });
  if (!abfrage) return false;

  // Erneut prüfen: Zwischen dem ersten Guard und hier lagen der IPC-Aufruf und
  // der Auswahl-Dialog, und in dieser Zeit kann der Reiter gewechselt, der
  // Lese-Modus eingeschaltet oder die Datei geschlossen worden sein.
  const view = beschreibbarerEditor();
  if (!view) {
    showStatusbarHint('profileQuery.hint.noEditor', { error: true, duration: 3000 });
    return false;
  }

  const range = view.state.selection.main;
  const block = baueAbfrageEinfuegung(abfrage.text, view.state);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: block },
    selection: { anchor: range.from + block.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();

  // Der Zweig über das Zuordnungs-Feld steht auch dann im Text, wenn die
  // Abfrage-Sprache ein Feld dieses Namens nicht ansprechen kann — still
  // weglassen wäre die schlechtere Antwort. Der Hinweis sagt, warum der Fence
  // dann rot ist; ohne ihn bliebe der Grund im Dunkeln.
  if (abfrage.hinweise.includes(HINWEIS_ZUORDNUNGS_FELD)) {
    showStatusbarHint('profileQuery.hint.assignFieldNotAddressable', {
      error: true,
      duration: 6000,
    });
  }
  return true;
}
