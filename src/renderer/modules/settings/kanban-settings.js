// 4T-001955 (Epic 3E-000319): Einstellungs-Abschnitt «Kanban-Tafel» — die
// globalen Vorgaben der Tafel.
//
// Nach dem Vorbild `mindmap-settings.js`: Registrierung als Modul-Seiteneffekt,
// geladen von app-init; der Abschnitt hängt über das Registry-Feld
// `settingsSections` an der Erweiterung `kanban` und verschwindet mit ihr.
//
// **Ein Speicher, zwei Bedienorte.** Die beiden Häkchen im Untermenü
// «Ansicht → Kanban-Tafel» schreiben dieselben Schlüssel; beide lesen und
// schreiben über `kanban-anzeige-schalter.js` und den Einstellungs-Weg der
// Anwendung. Eine zweite Wahrheit entsteht nicht. Welche Vorgaben es gibt,
// steht in der Liste `src/shared/kanban-anzeige.js`; dieser Abschnitt zeigt
// sie alle. Zielordner, Vorlage und Feldwahl gibt es nur je Tafel — im Dialog
// «Einstellungen dieser Tafel…», nicht hier.
'use strict';

import { t } from '../../i18n.js';
import { KANBAN_VORGABEN, normalisiereKanbanAnzeige } from '../../../shared/kanban-anzeige.js';
import { kanbanAnzeigeStand, setzeKanbanVorgabe } from '../kanban/kanban-anzeige-schalter.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';
import { registerSettingsSection } from './settings-page.js';

// Beschriftung je Vorgabe; der Schlüssel des Speichers ist kein Anzeige-Text.
const BESCHRIFTUNG = Object.freeze({
  'kanban.tagsAmFuss': 'settings.kanban.tagsAmFuss',
  'kanban.terminRelativ': 'settings.kanban.terminRelativ',
  'kanban.archivZeitstempel': 'settings.kanban.archivZeitstempel',
  'kanban.archivObergrenze': 'settings.kanban.archivObergrenze',
  'kanban.datumTagesnotiz': 'settings.kanban.datumTagesnotiz',
});

function entwurf(draft) {
  if (!draft.kanban) draft.kanban = { ...kanbanAnzeigeStand() };
  return draft.kanban;
}

function eingabe(vorgabe, draft) {
  const el = document.createElement('input');
  el.id = `settings-${vorgabe.schluessel.replace('.', '-')}`;
  if (vorgabe.art === 'zahl') {
    el.type = 'number';
    el.step = '1';
    el.value = String(entwurf(draft)[vorgabe.schluessel]);
    el.addEventListener('change', () => {
      // Eine unbrauchbare Eingabe fällt auf die Vorgabe zurück, wie beim
      // Vorbild der Mindmap; 0 und darunter heißt unbegrenzt.
      const wert = Number.parseInt(el.value, 10);
      entwurf(draft)[vorgabe.schluessel] = Number.isNaN(wert) ? vorgabe.vorgabe : wert;
    });
    return el;
  }
  el.type = 'checkbox';
  el.checked = entwurf(draft)[vorgabe.schluessel] === true;
  el.addEventListener('change', () => {
    entwurf(draft)[vorgabe.schluessel] = el.checked;
  });
  return el;
}

function renderKanbanSection(container, draft) {
  entwurf(draft);
  const hinweis = document.createElement('p');
  hinweis.className = 'settings-hint';
  hinweis.textContent = t('settings.kanban.hint');
  container.appendChild(hinweis);
  for (const vorgabe of KANBAN_VORGABEN) {
    container.appendChild(
      buildSettingsRow(BESCHRIFTUNG[vorgabe.schluessel], eingabe(vorgabe, draft)),
    );
  }
}

async function applyKanbanSection(draft) {
  if (!draft.kanban) return;
  const neu = normalisiereKanbanAnzeige(draft.kanban);
  const alt = kanbanAnzeigeStand();
  // Geschrieben wird nur, was sich geändert hat: Jeder Schreibvorgang baut die
  // Menüs aller Fenster neu.
  for (const vorgabe of KANBAN_VORGABEN) {
    if (neu[vorgabe.schluessel] !== alt[vorgabe.schluessel]) {
      await setzeKanbanVorgabe(vorgabe.schluessel, neu[vorgabe.schluessel]);
    }
  }
  draft.kanban = { ...kanbanAnzeigeStand() };
}

function dirtyKanbanSection(draft) {
  if (!draft.kanban) return false;
  return !jsonEqual(normalisiereKanbanAnzeige(draft.kanban), kanbanAnzeigeStand());
}

registerSettingsSection({
  id: 'kanban',
  titleKey: 'settings.kanban.title',
  render: renderKanbanSection,
  apply: applyKanbanSection,
  dirty: dirtyKanbanSection,
});
