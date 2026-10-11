// 4T-000303/4T-000304 (Epic 3E-000054): Abbildung der Export-Einstellungen auf
// printToPDF-Optionen. Electron-frei und damit unit-testbar (Muster
// menu-state.js): der IPC-Handler pdf:print in main.js reicht die rohen
// Store-Werte (export.pdf.*) herein; hier werden sie validiert, auf die
// Defaults zurueckgefallen und in das Options-Objekt fuer
// webContents.printToPDF uebersetzt. Liegt unter src/shared, weil auch
// der Einstellungs-Bereich Export (Renderer, 4T-000304) Formate,
// Rand-Stufen und Defaults aus derselben Quelle liest.
'use strict';

// 4T-002163 (Epic 3E-000149): die Geometrie der Folie fuer den Foliensatz-PDF.
const { folienGeometrie } = require('./presentation/presentation-darstellung.js');

// Formate: Auswahl der Einstellungs-Seite (4T-000304). printToPDF kennt
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

// Defaults gemaess Product-Owner-Entscheidung (3E-000054): A4, Hochformat,
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
// immer an (Code-Block-, Callout- und Tabellen-Hintergruende, 4T-000024).
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

// 4T-001479 (Epic 3E-000177): Dieselben Einstellungen, anderer Endpunkt.
// webContents.print() rechnet die Raender in PIXELN statt in Zoll und verlangt
// einen marginType; Format und Ausrichtung heissen gleich. Alles Weitere —
// Drucker, Seitenbereich, Kopien, Duplex — kommt vom Systemdialog und wird
// hier bewusst NICHT gesetzt (Entscheidung E3 des Epics).
const CSS_PIXEL_PRO_ZOLL = 96;

function printSystemOptions(raw) {
  const settings = normalizePdfExportSettings(raw);
  const rand = Math.round(PDF_MARGIN_PRESETS[settings.margins] * CSS_PIXEL_PRO_ZOLL);
  return {
    // silent: false ist der Default und heisst: der Systemdialog oeffnet sich.
    // Er wird ausdruecklich nicht gesetzt, damit er nicht versehentlich
    // ueberschrieben wird, wenn hier je etwas hinzukommt.
    pageSize: settings.pageSize,
    landscape: settings.landscape,
    printBackground: true,
    margins: { marginType: 'custom', top: rand, bottom: rand, left: rand, right: rand },
  };
}

// 4T-002163 (Epic 3E-000149): PDF des Foliensatzes. Das Seitenformat ist die
// Folie (Story 4S-001054, AK3): Entwurfsgroesse der Folie in CSS-Pixeln
// (1280 x 720 bei 16:9, 960 x 720 bei 4:3), umgerechnet in Zoll, ohne Rand,
// mit Hintergruenden. Die Seiten-Einstellungen des Dokument-Exports
// (export.pdf.*) wirken hier bewusst NICHT (AK7); ein unbekanntes Format
// faellt wie in der Ansicht auf 16:9.
//
// Querformat ergibt sich aus Breite > Hoehe; `landscape` bleibt false. Ein
// `landscape: true` tauschte nach der Chromium-Quelle (PrintSettings::
// SetOrientation dreht das Seitenformat) Breite und Hoehe und ergaebe ein
// Hochformat. Das ist am Quelltext gelesen und nicht am Programm gemessen;
// die manuelle Abnahme von 4T-002163 prueft es an der PDF-Datei.
function folienPdfOptionen(size) {
  const geometrie = folienGeometrie(size);
  return {
    pageSize: {
      width: geometrie.breite / CSS_PIXEL_PRO_ZOLL,
      height: geometrie.hoehe / CSS_PIXEL_PRO_ZOLL,
    },
    landscape: false,
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: false,
  };
}

module.exports = {
  PDF_PAGE_SIZES,
  PDF_MARGIN_PRESETS,
  PDF_EXPORT_DEFAULTS,
  normalizePdfExportSettings,
  printToPdfOptions,
  printSystemOptions,
  folienPdfOptionen,
};
