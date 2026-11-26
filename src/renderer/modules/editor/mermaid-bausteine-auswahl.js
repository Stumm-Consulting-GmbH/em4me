// 4T-002617 (Epic 3E-000391): Auswahl der Mermaid-Gerüste und -Bausteine (V5, V7).
//
// Eine Quelle für alle Zugänge (Kommando, Kontextmenü, Knopf der Format-
// Toolbar): Aus der Lage der Schreibmarke entstehen die Einträge in der Form
// der Kontextmenü-Einträge `{ key, dataId, disabled, action }` (Muster
// buildHeadingMenuItems in format-toolbar.js).
//   - außerhalb jedes Code-Blocks: die vier Gerüste, keine Bausteine (AK2);
//   - im Körper eines Mermaid-Blocks mit bekannter Art: die Bausteine dieser
//     Art, keine Gerüste;
//   - sonst (unbekannte Art, keine Kopfzeile, Öffner- oder Schluss-Zeile,
//     anderer Code-Block, Syntax-Baum reicht noch nicht bis zur Stelle): ein
//     ausgegrauter Hinweis-Eintrag. Der unvollständige Baum bietet bewusst
//     keine Gerüste an, weil die Stelle in einem noch nicht geparsten Zaun
//     liegen kann (kein Zaun im Zaun).
// Die Ausführung läuft über die übergebene Einfüge-Funktion (dispatchInsert
// aus editor-format.js, ein Dispatch, ein Rückgängig-Schritt). Sie wird
// hineingereicht statt importiert, damit editor-format.js dieses Modul für das
// Kommando insert.mermaid laden kann, ohne einen Import-Zyklus zu bilden.
// Menü-Element und Menü-Helfer kommen beim Anzeigen über einen Laufzeit-Import
// (Muster zeigeHinweis in editor-format.js): app-state.js greift beim Laden auf
// das Fenster-DOM zu, und ein statischer Bezug zöge das in jeden Lader von
// editor-format.js.
'use strict';

import { t } from '../../i18n.js';
import { zaunAnStelle } from './editor-zaun-kontext.js';
import {
  ARTEN,
  KATALOG,
  platzhalterTexte,
  geruestEinfuegen,
  bausteinEinfuegen,
} from '../../../shared/mermaid-bausteine.js';

/**
 * Lage der Schreibmarke für die Auswahl.
 *
 * @param {import('@codemirror/state').EditorState} state Editor-Zustand.
 * @param {number} pos Stelle der Schreibmarke.
 * @returns {{ modus: 'geruest' } | { modus: 'baustein', art: string,
 *   koerperVon: number, koerperBis: number } | { modus: 'hinweis' }}
 */
export function mermaidLage(state, pos) {
  const zaun = zaunAnStelle(state, pos);
  if (!zaun) return { modus: 'geruest' };
  if (zaun.unvollstaendig) return { modus: 'hinweis' };
  // Die Art kommt aus dem Dokument; geerbte Schlüssel wie `constructor` oder
  // `toString` sind keine Art des Katalogs (Object.hasOwn statt Indizierung).
  if (
    zaun.sprache === 'mermaid' &&
    zaun.imKoerper &&
    zaun.art &&
    Object.hasOwn(KATALOG, zaun.art)
  ) {
    return {
      modus: 'baustein',
      art: zaun.art,
      koerperVon: zaun.koerperVon,
      koerperBis: zaun.koerperBis,
    };
  }
  return { modus: 'hinweis' };
}

// Die Lage wird beim Klick neu gelesen: Zwischen Öffnen und Klick kann sich das
// Dokument oder die Schreibmarke geändert haben. Passt sie nicht mehr zum
// Eintrag, bleibt der Klick ohne Wirkung, statt an falscher Stelle einzufügen.
function lageJetzt(view) {
  return mermaidLage(view.state, view.state.selection.main.head);
}

/**
 * Einträge der Auswahl an der Schreibmarke einer View.
 *
 * @param {import('@codemirror/view').EditorView} view Editor.
 * @param {{ einfuegen: Function, heute: string }} opts einfuegen: (view,
 *   compute) => boolean, compute: (text, pos) => { changes, selFrom, selTo };
 *   heute: Tagesdatum JJJJ-MM-TT für den Zeitplan.
 * @returns {Array<{key: string, dataId: string, disabled?: boolean, action: Function}>}
 */
export function mermaidAuswahlEintraege(view, { einfuegen, heute }) {
  const lage = lageJetzt(view);
  if (lage.modus === 'geruest') {
    return ARTEN.map((art) => ({
      key: `mermaid.bausteine.art.${art}`,
      dataId: `mermaid-geruest-${art}`,
      action: () => {
        if (lageJetzt(view).modus !== 'geruest') return false;
        const texte = platzhalterTexte(t);
        return einfuegen(view, (text, pos) => geruestEinfuegen(text, pos, art, { texte, heute }));
      },
    }));
  }
  if (lage.modus === 'baustein') {
    const art = lage.art;
    return KATALOG[art].bausteine.map((baustein) => ({
      key: `mermaid.bausteine.baustein.${art}.${baustein.id}`,
      dataId: `mermaid-baustein-${art}-${baustein.id}`,
      action: () => {
        const jetzt = lageJetzt(view);
        if (jetzt.modus !== 'baustein' || jetzt.art !== art) return false;
        const opts = {
          texte: platzhalterTexte(t),
          heute,
          koerperVon: jetzt.koerperVon,
          koerperBis: jetzt.koerperBis,
        };
        return einfuegen(view, (text, pos) => bausteinEinfuegen(text, pos, art, baustein.id, opts));
      },
    }));
  }
  return [
    {
      key: 'mermaid.bausteine.hinweis',
      dataId: 'mermaid-bausteine-hinweis',
      disabled: true,
      action: () => false,
    },
  ];
}

// Anker unterhalb der Schreibmarke; ohne messbare Lage (etwa außerhalb des
// sichtbaren Bereichs) die Editor-Ecke (Muster anchorForPos im Datums-Wähler).
function ankerAnSchreibmarke(view) {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (coords) return { x: coords.left, y: coords.bottom + 4 };
  const rect = view.dom.getBoundingClientRect();
  return { x: rect.left + 40, y: rect.top + 40 };
}

/**
 * Zeigt die Einträge als Kontextmenü-Popup an der Schreibmarke (Kommando-Weg,
 * Vorbild openCalendarPickerAtSelection). Schließen über die gemeinsamen Wege
 * des Kontextmenüs (Außenklick, Escape, Klick auf einen Eintrag).
 *
 * @param {import('@codemirror/view').EditorView} view Editor.
 * @param {Array<object>} eintraege Einträge aus mermaidAuswahlEintraege.
 * @returns {Promise<void>} erfüllt, sobald das Menü steht.
 */
export async function zeigeMermaidAuswahl(view, eintraege) {
  const [{ contextMenu }, { appendContextMenuItem, placeContextMenuAt }] = await Promise.all([
    import('../app/app-state.js'),
    import('../dialogs/context-menu-utils.js'),
  ]);
  const { x, y } = ankerAnSchreibmarke(view);
  contextMenu.innerHTML = '';
  for (const eintrag of eintraege) appendContextMenuItem(contextMenu, eintrag);
  placeContextMenuAt(contextMenu, x, y);
}
