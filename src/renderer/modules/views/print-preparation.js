// --- Druck-Vorbereitung (4T-001478, Epic 3E-000177) -----------------------------
// Aus pdf-export.js herausgeloest: die Vorbereitungs- und Ruecknahme-Strecke,
// die PDF-Ausgabe und Druck GEMEINSAM brauchen. Verschieden ist allein der
// Endpunkt — eine Datei schreiben (pdf-export.js) oder den Systemdialog des
// Betriebssystems oeffnen (print.js). Erhoben in 4T-001416.
//
// Der Ablauf ist unveraendert der aus 4T-000303/4T-000024 erarbeitete:
//   1. optionaler Vorbereitungs-Schritt im Normal-Layout (Zielpfad-Dialog)
//   2. Inhalt herstellen (Quelltext-Print-Block oder Wechsel auf 'rendered')
//   3. Theme fuer die Druck-Dauer auf Hell zwingen (Variante B+)
//   4. fuenf Idle-Barrieren plus Reflow-Wait
//   5. Endpunkt
//   finally: vollstaendige Ruecknahme in umgekehrter Reihenfolge
'use strict';

import { getPaneEls, state } from '../app/app-state.js';
import { syncEditorForPane } from '../editor/editor.js';
import {
  rerenderAllMermaidBlocks,
  waitForMermaidIdle,
  waitForWikiEmbedsIdle,
} from '../render-mermaid.js';
// 4T-000355 (Epic 3E-000065): Idle-Barriere, damit die Ausgabe die befuellten
// Abfrage-Listen druckt statt des leeren Platzhalters.
import { waitForFrontmatterQueriesIdle } from '../query/frontmatter-query-view.js';
// 4T-000435 (Epic 3E-000081): Idle-Barriere des Journal-Navigations-Blocks.
import { waitForJournalNavIdle } from '../calendar/journal-nav-view.js';
// 4T-001066 (Epic 3E-000212): Idle-Barriere des Journal-Timeline-Blocks.
import { waitForJournalTimelineIdle } from '../calendar/journal-timeline-view.js';
// 4T-000412 (Epic 3E-000078): Idle-Barriere der Skript-Bloecke.
import { waitForPerspectiveScriptsIdle } from '../query/perspective-script-view.js';
// 4T-000311 (Epic 3E-000055): Druck-Aufbereitung der Quelltext-Ansicht.
import { buildPdfSourcePrintElement } from './pdf-source-print.js';
// 4T-000465 (Epic 3E-000086): Farb-Overrides aus dem aktiven Hell-Schema.
import { pdfColorOverrides } from '../color-schemes.js';
import { syncToolbarToActiveTab } from '../tabs/tabs.js';

import { renderPaneContent } from './pane-render.js';
import { applyContentViewClass } from './view-modes.js';

// Variante B+: statt einzelne Container-Selektoren im Print-CSS zu
// ueberschreiben (Spezifitaets-Falle aus 4T-000024), werden die CSS-Custom-
// Properties am Wurzel-Element per JS auf die Light-Werte gesetzt und
// data-theme fuer die Print-Dauer auf 'light' gezwungen. Damit folgen ALLE
// theme-abhaengigen Container automatisch dem Light-Schema (inkl. der
// data-theme-praefixierten hljs- und Dark-Bloecke). Mermaid wird im
// Light-Theme neu gerendert; im finally wird alles zurueckgestellt.
//
// Werte-Satz (4T-000465, Epic 3E-000086, Export-Option 2): die Farben des aktiven
// HELL-Schemas, geliefert von pdfColorOverrides() (Farbschema-Modul). Ohne
// eigenes Schema sind das exakt die :root-Light-Werte aus styles.css; ein
// eigenes Hell-Schema wird farbtreu gedruckt, die Ausgabe bleibt stets hell (nie
// das dunkle Schema). Die --syntax-*-Variablen fehlen bewusst: sie wirken nur
// im CodeMirror-Editor, der im Print versteckt ist.

// Reentranz-Schutz: Menuepunkte und Kuerzel duerfen waehrend eines laufenden
// Laufs keinen zweiten starten (der Print-Zustand ist global). 4T-001478: Der
// Schutz liegt in der Klammer und sperrt damit BEIDE Endpunkte gemeinsam —
// ein Druck waehrend eines laufenden PDF-Exports naehme dessen Print-Zustand
// mitten im Lauf zurueck.
let printRunning = false;

// Nur fuer Tests und Diagnose; der Schutz selbst greift in withPrintPreparation.
export function isPrintPreparationRunning() {
  return printRunning;
}

// Zwei rAF-Ticks plus kurzer Timeout: Print-Klassen, Variablen-Override und
// Mermaid-DOM-Tausch muessen im Layout angekommen sein, bevor der Endpunkt
// den Frame rastert (Reflow-Wait aus 4T-000024, rAF-basiert statt fix 50 ms).
function waitForReflow() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 50));
    });
  });
}

/**
 * Fuehrt einen Ausgabe-Lauf unter vollstaendiger Druck-Vorbereitung aus.
 *
 * @param {object} steps
 * @param {(tab: object) => Promise<any>} [steps.prepare] Optionaler Schritt VOR
 *   der Druck-Vorbereitung, solange das Fenster noch im Normal-Layout steht
 *   (der Zielpfad-Dialog der PDF-Ausgabe). Ein falsy Rueckgabewert bricht den
 *   Lauf still ab — ohne Hinweis, wie der Dialog-Abbruch es immer getan hat.
 * @param {(context: any) => Promise<{ok: boolean, error?: string}>} steps.output
 *   Der Endpunkt. Bekommt den Rueckgabewert von `prepare`.
 * @returns {Promise<{ok: boolean, canceled?: boolean, error?: string}>}
 *   `canceled` heisst: nichts ist geschehen und nichts ist zu melden.
 */
export async function withPrintPreparation(steps) {
  const paneIdx = state.activePaneIndex;
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return { ok: false, canceled: true };
  const tab = pane.tabs[pane.activeIndex];
  // Einstellungs-Tab (System-Seite) ist von jeder Ausgabe ausgenommen (die
  // Menuepunkte sind deaktiviert; der Guard deckt den Kuerzel-Pfad ab).
  // Handbuch-Tabs sind bewusst einbezogen.
  if (!tab || tab.systemPage) return { ok: false, canceled: true };
  if (printRunning) return { ok: false, canceled: true };
  printRunning = true;

  const els = getPaneEls(paneIdx);
  const root = document.documentElement;
  const savedViewMode = tab.viewMode;
  const savedTheme = root.getAttribute('data-theme') || '';
  const savedVars = {};
  let printStateApplied = false;
  let modeChanged = false;
  // 4T-000311: die Ausgabe folgt der aktiven Ansicht — die Quelltext-Ansicht
  // druckt den Quelltext (dedizierter Print-Block, CodeMirror ist wegen
  // Virtualisierung nicht druckbar); alle anderen Modi drucken gerendert.
  const sourceMode = tab.viewMode === 'source';
  let sourcePrintEl = null;
  try {
    // 1. Vorbereitungs-Schritt im Normal-Layout (Zielpfad-Dialog der
    //    PDF-Ausgabe; der Druck hat keinen). Abbruch: still, kein Hinweis.
    let context = null;
    if (steps.prepare) {
      context = await steps.prepare(tab);
      if (!context) return { ok: false, canceled: true };
    }

    // 2. Inhalt: Quelltext-Ansicht baut den Print-Block aus dem
    //    Dokumenttext auf (Zeilennummern gemaess Tab-Toggle, 4T-000311);
    //    Geteilt und Live schalten temporaer auf 'rendered' (befuellt das
    //    Render-Pane frisch, falls der Inhalt seit dem letzten Render
    //    geaendert wurde); der Modus wird im finally wiederhergestellt.
    if (sourceMode) {
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
    if (!sourceMode) {
      await waitForMermaidIdle();
      await rerenderAllMermaidBlocks();
      // 4T-000355: Abfrage-Listen fertig befüllen lassen, sonst druckt die
      // Ausgabe den leeren Platzhalter statt der Datei-Liste.
      await waitForFrontmatterQueriesIdle();
      // 4T-000435 (Epic 3E-000081): Journal-Navigation fertig befüllen lassen
      // (sonst erscheint die Perioden-Beschriftung als Platzhalter).
      await waitForJournalNavIdle();
      // 4T-001066 (Epic 3E-000212): Journal-Timeline fertig aufbauen lassen
      // (sonst druckt die Ausgabe den leeren Platzhalter statt des Gitters).
      await waitForJournalTimelineIdle();
      // 4T-000412 (Epic 3E-000078): Skript-Blöcke fertig ausführen lassen
      // (Ergebnis, Fehler oder Timeout), bevor gedruckt wird.
      await waitForPerspectiveScriptsIdle();
      // 4T-001487 (Epic 3E-000199): Wiki-Einbettungen fertig auflösen lassen.
      // Ohne diese Barriere druckte die Ausgabe den leeren Platzhalter — bei
      // Bildern seit 4T-001486 (sie sind seither asynchron), bei
      // Markdown-Einbettungen seit jeher. Am laufenden Programm gemessen:
      // Mit verzögerter Auflösung enthielt das PDF weder das Bild noch den
      // eingebetteten Text.
      await waitForWikiEmbedsIdle();
    }
    await waitForReflow();

    // 5. Endpunkt. Ein `canceled` des Endpunkts wird durchgereicht — der
    //    Abbruch im Systemdialog ist kein Fehler und darf nichts melden.
    const result = await steps.output(context);
    if (result && result.ok) return { ok: true };
    if (result && result.canceled) return { ok: false, canceled: true };
    return { ok: false, error: (result && result.error) || '' };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    // Vollstaendige Ruecknahme in umgekehrter Reihenfolge; laeuft auch bei
    // Abbruch im Vorbereitungs-Schritt (dann ohne Print-Zustand) und bei
    // Fehlern.
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
    if (printStateApplied && savedTheme !== 'light' && !sourceMode) {
      await rerenderAllMermaidBlocks();
    }
    printRunning = false;
  }
}
