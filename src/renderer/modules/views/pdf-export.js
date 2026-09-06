// --- PDF-Export (4T-000303, Epic 3E-000054) -------------------------------------
// 4T-000989 (Epic 3E-000196): aus views.js in den Ordner views/ ausgezogen.
// 4T-001478 (Epic 3E-000177): Vorbereitung und Ruecknahme sind nach
// print-preparation.js gewandert, weil der Druck dieselbe Strecke braucht.
// Hier bleibt, was wirklich PDF ist: der Zielpfad-Dialog und der Datei-Endpunkt.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { tabDisplayName, withDialog } from '../app/app-state.js';

import { withPrintPreparation } from './print-preparation.js';
import { showStatusbarHint } from './views.js';

// Exportiert den gerenderten Inhalt des aktiven Tabs als PDF. Ablauf:
// Zielpfad-Dialog ZUERST (das Fenster steht dabei noch im Normal-Layout),
// dann die gemeinsame Druck-Vorbereitung, Druck im Main (pdf:print liest die
// Export-Einstellungen aus dem Store), Feedback in der Statusbar, Ruecknahme
// in der Klammer. Returnt true bei geschriebener Datei.
export async function exportActiveTabAsPdf() {
  const outcome = await withPrintPreparation({
    // Zielpfad: Tab mit Pfad -> <basename>.pdf im selben Ordner;
    // pfadloser Tab (Unbenannt, Handbuch) -> Anzeigename im Home-
    // Verzeichnis (Aufloesung im Main). Abbruch: still, kein Hinweis.
    prepare: async (tab) => {
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
      if (!target || !target.ok || !target.path) return null;
      return target;
    },
    // printToPDF mit den Export-Einstellungen, danach Datei schreiben.
    output: (target) => api.printPdfToFile(target.path),
  });

  if (outcome.ok) {
    showStatusbarHint('pdf.statusOk', { duration: 1500 });
    return true;
  }
  if (outcome.canceled) return false;
  showStatusbarHint('pdf.statusError', {
    duration: 3000,
    error: true,
    text: t('pdf.statusError').replace('{error}', outcome.error || ''),
  });
  return false;
}
