// --- Drucken (4T-001479, Epic 3E-000177) ----------------------------------------
// Der zweite Endpunkt der gemeinsamen Druck-Vorbereitung (print-preparation.js).
// Wo der PDF-Export eine Datei schreibt, oeffnet der Druck den Druckdialog des
// Betriebssystems (Entscheidung E3 des Epics): Drucker, Seitenbereich, Kopien
// und Duplex kommen von dort, aus den Export-Einstellungen werden nur Format,
// Ausrichtung und Raender vorbelegt.
//
// Ein Zielpfad-Dialog entfaellt — deshalb uebergibt dieser Weg kein `prepare`.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';

import { withPrintPreparation } from './print-preparation.js';
import { showStatusbarHint } from './views.js';

// Druckt den Inhalt des aktiven Tabs ueber den Systemdialog. Returnt true,
// wenn der Druckauftrag abgesetzt wurde.
export async function printActiveTab() {
  const outcome = await withPrintPreparation({
    output: () => api.printToSystemPrinter(),
  });

  if (outcome.ok) {
    showStatusbarHint('print.statusOk', { duration: 1500 });
    return true;
  }
  // Abbruch im Systemdialog und die Guards der Klammer (kein Reiter,
  // Einstellungs-Seite, laufender zweiter Lauf) melden sich nicht.
  if (outcome.canceled) return false;
  showStatusbarHint('print.statusError', {
    duration: 3000,
    error: true,
    text: t('print.statusError').replace('{error}', outcome.error || ''),
  });
  return false;
}
