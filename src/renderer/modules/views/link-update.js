// --- Verweis-Nachfuehrung beim Umbenennen (4T-0345/4T-0346, Epic 3E-0062) ---
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
// Vorschau und Ergebnis-Bericht der Verweis-Anpassung sowie der Nachzug im
// eigenen Fenster, wenn der Hauptprozess ein Link-Update angewendet hat.
'use strict';

// 4T-0345 (Epic 3E-0062): History-Isolation, damit der programmatische Link-
// Fix eine eigene Undo-Einheit bildet (nicht mit Nutzer-Eingaben gruppiert).
import { isolateHistory } from '@codemirror/commands';
import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { toLogicalName } from '../../../shared/subpages.js';
// 4T-0345: Rewrite-Kern fuer den Buffer-Fix offener dirty Tabs beim
// automatischen Link-Update (shared Modul aus 4T-0344, esbuild-Interop).
import { computeLinkRewrites } from '../../../shared/link-rewrite.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { showLinkPreviewDialog, showLinkReportDialog } from '../dialogs/dialogs.js';

import { invalidatePaneRenderCache, renderPaneContent } from './pane-render.js';
import { renderTabbar } from './tabbar.js';

// 4T-0346 (Epic 3E-0062): Anzeigename einer Datei im Vorschau-/Bericht-Dialog
// (Basename, Unterseiten in Slash-Schreibweise).
function linkUpdateDisplayName(p) {
  return toLogicalName(api.basename(p));
}

// 4T-0346: ob ein Pfad in einem offenen Tab ungespeicherte Aenderungen hat
// (Dirty-Kennzeichnung; der Main fuehrt keinen Dirty-Status).
function isPathDirty(p) {
  return state.panes.some((pane) => pane.tabs.some((tb) => tb.path === p && tb.dirty));
}

// 4T-0346: Vorschau-Datenpfad. Holt die betroffenen Dateien (Dry-Run aus
// 4T-0345), ergaenzt die Dirty-Kennzeichnung aus den eigenen Tabs und zeigt den
// Vorschau-Dialog. Liefert true (Fortfahren) oder false (Abbrechen).
export async function runLinkUpdatePreview(oldPath, newBase) {
  let preview;
  try {
    preview = await api.renameLinkUpdatePreview(oldPath, newBase);
  } catch {
    preview = null;
  }
  const items = preview && preview.ok && Array.isArray(preview.items) ? preview.items : [];
  const rows = items.map((it) => ({
    text: linkUpdateDisplayName(it.path),
    detail:
      t('linkUpdate.hits').replace('{n}', String(it.count)) +
      (isPathDirty(it.path) ? ` · ${t('linkUpdate.dirty')}` : ''),
  }));
  const summary =
    items.length > 0 ? t('linkUpdate.preview.summary').replace('{n}', String(items.length)) : '';
  return showLinkPreviewDialog({
    title: t('linkUpdate.preview.title'),
    summary,
    sections: [{ rows, emptyText: t('linkUpdate.preview.empty') }],
    continueLabel: t('linkUpdate.preview.continue'),
    cancelLabel: t('dialog.cancel'),
  });
}

// 4T-0346: Ergebnis-Bericht aus dem file:rename-Ergebnis (umbenannt, angepasst,
// fehlgeschlagen).
export function showLinkUpdateReport(result) {
  const lu = result.linkUpdate || { updated: [], failed: [] };
  const renamedRows = (result.renamed || [result.path]).map((p) => ({
    text: linkUpdateDisplayName(p),
  }));
  const updatedRows = (lu.updated || []).map((u) => ({
    text: linkUpdateDisplayName(u.path),
    detail:
      t('linkUpdate.hits').replace('{n}', String(u.count)) +
      (isPathDirty(u.path) ? ` · ${t('linkUpdate.report.inBuffer')}` : ''),
  }));
  const failedRows = (lu.failed || []).map((f) => ({
    text: linkUpdateDisplayName(f.path),
    detail: f.error || '',
  }));
  return showLinkReportDialog({
    title: t('linkUpdate.report.title'),
    sections: [
      {
        title: t('linkUpdate.report.renamed'),
        rows: renamedRows,
        emptyText: t('linkUpdate.report.empty'),
      },
      {
        title: t('linkUpdate.report.updated'),
        rows: updatedRows,
        emptyText: t('linkUpdate.report.empty'),
      },
      {
        title: t('linkUpdate.report.failed'),
        rows: failedRows,
        emptyText: t('linkUpdate.report.empty'),
      },
    ],
    okLabel: t('dialog.ok'),
  });
}

// 4T-0345 (Epic 3E-0062): angewendetes Link-Update im Renderer nachziehen.
// Nicht-dirty Tabs auf angepasste Pfade laden den vom Main bereits gefixten
// Disk-Stand nach; dirty Tabs erhalten den Fix auf ihrem Buffer-Stand als eine
// Undo-Transaktion und bleiben dirty. Der Buffer wird frisch geparst, damit
// eigene ungespeicherte Link-Aenderungen keine Positions-Verschiebung erzeugen.
// Jedes Fenster verarbeitet den Broadcast selbst (Mehrfach-Instanzen).
export async function handleLinkUpdateApplied(payload) {
  if (!payload || !Array.isArray(payload.renames)) return;
  const renames = payload.renames;
  const updatedPaths = new Set((payload.updated || []).map((u) => u && u.path).filter(Boolean));
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    let touchedPane = false;
    for (let i = 0; i < pane.tabs.length; i++) {
      const tab = pane.tabs[i];
      if (!tab.path || tab.manualPage || tab.systemPage) continue;
      const isActive = i === pane.activeIndex;
      if (tab.dirty) {
        // Buffer-Fix: frisch parsen, ganzes Dokument in einem Dispatch (= eine
        // Undo-Einheit). Der Editor-Update-Listener zieht tab.content und den
        // Dirty-Stand nach (Fix ist ungespeichert, Tab bleibt dirty).
        const res = computeLinkRewrites(tab.content, { renames, contextPath: tab.path });
        if (!res.changed) continue;
        const view = paneEditors[p];
        if (isActive && view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: res.newContent },
            // Eigene Undo-Einheit: ein Strg+Z nimmt nur den Link-Fix zurueck,
            // ohne die vorherige Nutzer-Eingabe mit rueckgaengig zu machen.
            annotations: isolateHistory.of('full'),
          });
        } else {
          // Nicht sichtbarer Tab: nur den Buffer aktualisieren; der Doc-Aufbau
          // beim Aktivieren (syncEditorForPane) nutzt tab.content.
          tab.content = res.newContent;
        }
        touchedPane = true;
      } else if (updatedPaths.has(tab.path)) {
        // Nicht-dirty: den vom Main gefixten Disk-Stand nachladen (kein Dialog,
        // da nicht dirty).
        try {
          const data = await api.readFile(tab.path);
          if (data && data.ok) {
            tab.content = data.content;
            tab.originalContent = data.content;
            tab.dirty = false;
            if (isActive) {
              invalidatePaneRenderCache();
              renderPaneContent(p);
            }
            touchedPane = true;
          }
        } catch {
          /* Lesefehler: Tab unveraendert lassen */
        }
      }
    }
    if (touchedPane) renderTabbar(p);
  }
}
