// --- PDF-Export (4T-0303, Epic 3E-0054) -------------------------------------
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { getPaneEls, state, tabDisplayName, withDialog } from '../app/app-state.js';
import { syncEditorForPane } from '../editor/editor.js';
import { rerenderAllMermaidBlocks, waitForMermaidIdle } from '../render-mermaid.js';
// 4T-0355 (Epic 3E-0065): Idle-Barriere, damit der PDF-Export die befuellten
// Abfrage-Listen druckt statt des leeren Platzhalters.
import { waitForFrontmatterQueriesIdle } from '../query/frontmatter-query-view.js';
// 4T-0435 (Epic 3E-0081): Idle-Barriere des Journal-Navigations-Blocks.
import { waitForJournalNavIdle } from '../calendar/journal-nav-view.js';
// 4T-1066 (Epic 3E-0212): Idle-Barriere des Journal-Timeline-Blocks.
import { waitForJournalTimelineIdle } from '../calendar/journal-timeline-view.js';
// 4T-0412 (Epic 3E-0078): Idle-Barriere der Skript-Bloecke fuer den PDF-Export.
import { waitForPerspectiveScriptsIdle } from '../query/perspective-script-view.js';
// 4T-0311 (Epic 3E-0055): Druck-Aufbereitung der Quelltext-Ansicht.
import { buildPdfSourcePrintElement } from './pdf-source-print.js';
// 4T-0465 (Epic 3E-0086): PDF-Farb-Overrides aus dem aktiven Hell-Schema.
import { pdfColorOverrides } from '../color-schemes.js';
import { syncToolbarToActiveTab } from '../tabs/tabs.js';

import { renderPaneContent } from './pane-render.js';
import { showStatusbarHint } from './views.js';
import { applyContentViewClass } from './view-modes.js';

// Variante B+: statt einzelne Container-Selektoren im Print-CSS zu
// ueberschreiben (Spezifitaets-Falle aus 4T-0024), werden die CSS-Custom-
// Properties am Wurzel-Element per JS auf die Light-Werte gesetzt und
// data-theme fuer die Print-Dauer auf 'light' gezwungen. Damit folgen ALLE
// theme-abhaengigen Container automatisch dem Light-Schema (inkl. der
// data-theme-praefixierten hljs- und Dark-Bloecke). Mermaid wird im
// Light-Theme neu gerendert; im finally wird alles zurueckgestellt.
//
// Werte-Satz (4T-0465, Epic 3E-0086, Export-Option 2): die Farben des aktiven
// HELL-Schemas, geliefert von pdfColorOverrides() (Farbschema-Modul). Ohne
// eigenes Schema sind das exakt die :root-Light-Werte aus styles.css; ein
// eigenes Hell-Schema wird farbtreu gedruckt, der Druck bleibt stets hell (nie
// das dunkle Schema). Die --syntax-*-Variablen fehlen bewusst: sie wirken nur
// im CodeMirror-Editor, der im Print versteckt ist.

// Reentranz-Schutz: Menuepunkt und Kuerzel duerfen waehrend eines laufenden
// Exports keinen zweiten Lauf starten (der Print-Zustand ist global).
let pdfExportRunning = false;

// Zwei rAF-Ticks plus kurzer Timeout: Print-Klassen, Variablen-Override und
// Mermaid-DOM-Tausch muessen im Layout angekommen sein, bevor printToPDF
// den Frame rastert (Reflow-Wait aus 4T-0024, rAF-basiert statt fix 50 ms).
function waitForReflow() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 50));
    });
  });
}

// Exportiert den gerenderten Inhalt des aktiven Tabs als PDF. Ablauf:
// Zielpfad-Dialog ZUERST (das Fenster steht dabei noch im Normal-Layout),
// dann Modus-/Theme-Vorbereitung, Druck im Main (pdf:print liest die
// Export-Einstellungen aus dem Store), Feedback in der Statusbar, im
// finally vollstaendige Ruecknahme. Returnt true bei geschriebener Datei.
export async function exportActiveTabAsPdf() {
  const paneIdx = state.activePaneIndex;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return false;
  const tab = pane.tabs[pane.activeIndex];
  // Einstellungs-Tab (System-Seite) ist vom Export ausgenommen (Menuepunkt
  // ist deaktiviert; der Guard deckt den Kuerzel-Pfad ab). Handbuch-Tabs
  // sind bewusst exportierbar.
  if (!tab || tab.systemPage) return false;
  if (pdfExportRunning) return false;
  pdfExportRunning = true;

  const els = getPaneEls(paneIdx);
  const root = document.documentElement;
  const savedViewMode = tab.viewMode;
  const savedTheme = root.getAttribute('data-theme') || '';
  const savedVars = {};
  let printStateApplied = false;
  let modeChanged = false;
  // 4T-0311: der Export folgt der aktiven Ansicht — die Quelltext-Ansicht
  // druckt den Quelltext (dedizierter Print-Block, CodeMirror ist wegen
  // Virtualisierung nicht druckbar); alle anderen Modi drucken gerendert.
  const sourceExport = tab.viewMode === 'source';
  let sourcePrintEl = null;
  try {
    // 1. Zielpfad: Tab mit Pfad -> <basename>.pdf im selben Ordner;
    //    pfadloser Tab (Unbenannt, Handbuch) -> Anzeigename im Home-
    //    Verzeichnis (Aufloesung im Main). Abbruch: still, kein Hinweis.
    let suggestedPath = null;
    let suggestedName = null;
    if (tab.path) {
      suggestedPath = tab.path.replace(/\.(md|markdown|mdown|mkd)$/i, '') + '.pdf';
    } else {
      const base = tabDisplayName(tab)
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
      if (base) suggestedName = `${base}.pdf`;
    }
    const target = await withDialog(() =>
      api.choosePdfExportTarget({ suggestedPath, suggestedName }),
    );
    if (!target || !target.ok || !target.path) return false;

    // 2. Inhalt: Quelltext-Ansicht baut den Print-Block aus dem
    //    Dokumenttext auf (Zeilennummern gemaess Tab-Toggle, 4T-0311);
    //    Geteilt und Live schalten temporaer auf 'rendered' (befuellt das
    //    Render-Pane frisch, falls der Inhalt seit dem letzten Render
    //    geaendert wurde); der Modus wird im finally wiederhergestellt.
    if (sourceExport) {
      sourcePrintEl = buildPdfSourcePrintElement(tab.content, {
        showLineNumbers: !!tab.showLineNumbers,
      });
      els.content.appendChild(sourcePrintEl);
      document.body.classList.add('printing-source');
    } else if (tab.viewMode !== 'rendered') {
      modeChanged = true;
      tab.viewMode = 'rendered';
      applyContentViewClass(els.content, 'view-rendered');
      renderPaneContent(paneIdx);
    }

    // 3. Theme fuer die Print-Dauer auf Light zwingen (B+). Gilt auch fuer
    //    den Quelltext-Druck (hljs-Farben haengen an data-theme).
    for (const [key, value] of Object.entries(pdfColorOverrides())) {
      savedVars[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, value);
    }
    root.setAttribute('data-theme', 'light');
    root.classList.add('printing');
    document.body.classList.add('printing');
    printStateApplied = true;

    // 4. Mermaid: erst laufende Renders abwarten (Queue-Barriere), dann
    //    alle Bloecke im Light-Theme neu rendern; danach Reflow-Wait.
    //    Beim Quelltext-Druck entfaellt Mermaid (kein gerendertes DOM im
    //    Druckbild; die versteckten Panes bleiben unangetastet).
    if (!sourceExport) {
      await waitForMermaidIdle();
      await rerenderAllMermaidBlocks();
      // 4T-0355: Abfrage-Listen fertig befüllen lassen, sonst druckt der
      // Export den leeren Platzhalter statt der Datei-Liste.
      await waitForFrontmatterQueriesIdle();
      // 4T-0435 (Epic 3E-0081): Journal-Navigation fertig befüllen lassen
      // (der Export druckt die Perioden-Beschriftung statt des Platzhalters).
      await waitForJournalNavIdle();
      // 4T-1066 (Epic 3E-0212): Journal-Timeline fertig aufbauen lassen
      // (sonst druckt der Export den leeren Platzhalter statt des Gitters).
      await waitForJournalTimelineIdle();
      // 4T-0412 (Epic 3E-0078): Skript-Blöcke fertig ausführen lassen
      // (Ergebnis, Fehler oder Timeout), bevor der Export druckt.
      await waitForPerspectiveScriptsIdle();
    }
    await waitForReflow();

    // 5. Druck im Main (printToPDF mit den Export-Einstellungen).
    const result = await api.printPdfToFile(target.path);
    if (result && result.ok) {
      showStatusbarHint('pdf.statusOk', { duration: 1500 });
      return true;
    }
    showStatusbarHint('pdf.statusError', {
      duration: 3000,
      error: true,
      text: t('pdf.statusError').replace('{error}', (result && result.error) || ''),
    });
    return false;
  } catch (err) {
    showStatusbarHint('pdf.statusError', {
      duration: 3000,
      error: true,
      text: t('pdf.statusError').replace('{error}', (err && err.message) || String(err)),
    });
    return false;
  } finally {
    // Vollstaendige Ruecknahme in umgekehrter Reihenfolge; laeuft auch bei
    // Abbruch im Dialog (dann ohne Print-Zustand) und bei Fehlern.
    if (sourcePrintEl) {
      sourcePrintEl.remove();
      document.body.classList.remove('printing-source');
    }
    if (printStateApplied) {
      document.body.classList.remove('printing');
      root.classList.remove('printing');
      for (const [key, value] of Object.entries(savedVars)) {
        if (value) root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      }
      if (savedTheme) root.setAttribute('data-theme', savedTheme);
      else root.removeAttribute('data-theme');
    }
    if (modeChanged) {
      tab.viewMode = savedViewMode;
      applyContentViewClass(els.content, `view-${savedViewMode}`);
      syncEditorForPane(paneIdx);
      syncToolbarToActiveTab();
    }
    // Mermaid zurueck ins aktive Theme (No-op, wenn das Theme Light war
    // und die Cache-Treffer greifen; beim Quelltext-Druck lief kein
    // Light-Re-Render).
    if (printStateApplied && savedTheme !== 'light' && !sourceExport) {
      await rerenderAllMermaidBlocks();
    }
    pdfExportRunning = false;
  }
}
