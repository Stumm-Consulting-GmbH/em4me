// 4T-0988 (Epic 3E-0196): zyklenfreies Leaf der Einstellungs-Seite.
//
// Hier liegt, was alle übrigen Module des Ordners brauchen und was
// seinerseits kein anderes Modul der Seite braucht: der Seiten-Zustand,
// der Vergleichs-Helfer der dirty-Hooks und die Standard-Zeile der
// Bereichs-Formulare. Das Modul importiert bewusst nichts aus dem Ordner.
'use strict';

import { t } from '../../i18n.js';

// --- Seiten-Zustand -----------------------------------------------------------
// Lebt pro Fenster über die Lebensdauer einer geöffneten Seite (Einfach-
// Instanz). draft ist der zentrale Entwurfs-Kontext, den die Bereichs-
// Renderfunktionen lesen und schreiben; Bereichswechsel verwirft nichts.
export const pageState = {
  activeSectionId: 'appearance',
  draft: null,
  // Bereichs-ID -> lokalisierter Fehlertext des letzten Apply-Versuchs.
  errors: new Map(),
  // Zählt pro Neu-Öffnen hoch; asynchrone Nachlade-Pfade (Appearance aus
  // dem Store) verwerfen ihr Ergebnis, wenn zwischenzeitlich neu geöffnet
  // wurde.
  generation: 0,
};
export function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildSettingsRow(labelKey, inputEl) {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const label = document.createElement('label');
  label.htmlFor = inputEl.id;
  label.textContent = t(labelKey);
  row.append(label, inputEl);
  return row;
}

// Nur für Tests: seiteninterner Zustand lesbar (Bereichswechsel- und
// Validierungs-Verhalten ohne DOM-Introspektion prüfbar).
export function settingsPageStateForTests() {
  return pageState;
}
