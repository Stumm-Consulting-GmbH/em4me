// 4T-0303/4T-0304 (Epic 3E-0054): Abbildung der Export-Einstellungen auf
// printToPDF-Optionen. Electron-frei und damit unit-testbar (Muster
// menu-state.js): der IPC-Handler pdf:print in main.js reicht die rohen
// Store-Werte (export.pdf.*) herein; hier werden sie validiert, auf die
// Defaults zurueckgefallen und in das Options-Objekt fuer
// webContents.printToPDF uebersetzt. Liegt unter src/shared, weil auch
// der Einstellungs-Bereich Export (Renderer, 4T-0304) Formate,
// Rand-Stufen und Defaults aus derselben Quelle liest.
'use strict';

// Formate: Auswahl der Einstellungs-Seite (4T-0304). printToPDF kennt
// weitere (A0-A6, Tabloid, Ledger); die App bietet die fuenf gaengigen an.
const PDF_PAGE_SIZES = ['A4', 'A3', 'A5', 'Letter', 'Legal'];

// Rand-Stufen -> printToPDF-Randwerte in Zoll (CDP-Konvention). Mapping:
// schmal ~1 cm (0.4"), normal ~2 cm (0.8"), breit ~3 cm (1.2"). 'normal'
// entspricht damit einem gaengigen Dokument-Rand; 'narrow' liegt nahe am
// Chromium-Default (1 cm).
const PDF_MARGIN_PRESETS = {
  narrow: 0.4,
  normal: 0.8,
  wide: 1.2,
};

// Defaults gemaess Product-Owner-Entscheidung (3E-0054): A4, Hochformat,
// normaler Rand. Greifen auch bei fehlenden oder ungueltigen Store-Werten.
const PDF_EXPORT_DEFAULTS = {
  pageSize: 'A4',
  landscape: false,
  margins: 'normal',
};

// Rohe Store-Werte -> validierte Einstellungen. Unbekannte Formate und
// Rand-Stufen sowie Nicht-Boolean-Ausrichtung fallen auf die Defaults.
function normalizePdfExportSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    pageSize: PDF_PAGE_SIZES.includes(src.pageSize) ? src.pageSize : PDF_EXPORT_DEFAULTS.pageSize,
    landscape: typeof src.landscape === 'boolean' ? src.landscape : PDF_EXPORT_DEFAULTS.landscape,
    margins: Object.prototype.hasOwnProperty.call(PDF_MARGIN_PRESETS, src.margins)
      ? src.margins
      : PDF_EXPORT_DEFAULTS.margins,
  };
}

// Validierte Einstellungen -> printToPDF-Optionen. printBackground bleibt
// immer an (Code-Block-, Callout- und Tabellen-Hintergruende, 4T-0024).
function printToPdfOptions(raw) {
  const settings = normalizePdfExportSettings(raw);
  const margin = PDF_MARGIN_PRESETS[settings.margins];
  return {
    pageSize: settings.pageSize,
    landscape: settings.landscape,
    printBackground: true,
    margins: { top: margin, bottom: margin, left: margin, right: margin },
  };
}

module.exports = {
  PDF_PAGE_SIZES,
  PDF_MARGIN_PRESETS,
  PDF_EXPORT_DEFAULTS,
  normalizePdfExportSettings,
  printToPdfOptions,
};
