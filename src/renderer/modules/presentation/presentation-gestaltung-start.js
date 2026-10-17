// 4T-002282 (Epic 3E-000348): Der Einstieg des Dialogs «Gestaltung dieser
// Präsentation…» aus Kommando-Palette, Menü und Tastenbelegung.
//
// Ein Blatt-Modul: Es stellt dem Dialog (presentation-gestaltung-dialog.js)
// den Zugang zum Fenster zusammen — Editor der Spalte, Änderbarkeit, Katalog
// und Speicher der eigenen Themes, Namens-Dialog und Statusleisten-Hinweis —,
// damit der Dialog selbst ohne Fenster-Zustand prüfbar bleibt. Importiert
// wird es allein von app-commands.js und app-menu-bindings.js; kein Modul,
// das es importiert, importiert dieses zurück.
'use strict';

import { t } from '../../i18n.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { showNameInputDialog } from '../dialogs/dialogs.js';
import { persistSetting, showStatusbarHint } from '../views/views.js';
import { PRESENTATION_THEMES_KEY } from '../../../shared/presentation/presentation-eigene-themes.js';
import { eigeneThemes, setzeEigeneThemes } from './presentation-themes-stand.js';
import { istPraesentationsModusVerfuegbar } from './presentation-modus.js';
import { oeffneGestaltungsDialog } from './presentation-gestaltung-dialog.js';

/**
 * Darf der Kopf des Reiters geschrieben werden? Eine Präsentation, weder
 * Handbuch- noch System-Seite, im Änderungs-Modus (dieselbe Regel wie
 * `praesentationAenderbar` im Verfügbarkeits-Katalog), dazu ein Editor, der
 * nicht schreibgeschützt ist.
 */
export function istGestaltungAenderbar(tab, view) {
  return (
    !!tab &&
    !tab.manualPage &&
    !tab.systemPage &&
    !!tab.editMode &&
    istPraesentationsModusVerfuegbar(tab) &&
    !!view &&
    !view.state.readOnly
  );
}

/**
 * Öffnet den Dialog für die Spalte.
 *
 * @param {number} paneIdx
 * @returns {Promise<boolean>} true, wenn geschrieben wurde.
 */
export function oeffneGestaltungDerSpalte(paneIdx) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  const view = paneEditors[paneIdx] || null;
  return oeffneGestaltungsDialog({
    t,
    view,
    aenderbar: istGestaltungAenderbar(tab, view),
    eigeneThemes,
    speichereThemes: async (zustand) => {
      const ok = await persistSetting(PRESENTATION_THEMES_KEY, zustand);
      if (ok) setzeEigeneThemes(zustand);
      return ok;
    },
    frageName: showNameInputDialog,
    hinweis: (schluessel) => showStatusbarHint(schluessel, { error: true, duration: 2500 }),
  });
}
