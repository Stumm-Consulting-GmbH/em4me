// --- Bilder des Foliensatzes (4T-002295, Epic 3E-000349) --------------------
// Story 4S-001085. Schwester-Datei von folien-export-pptx.js; der Ablauf ist
// derselbe, nur das Ziel ist ein Ordner mit einem PNG je Folie statt einer
// PowerPoint-Datei.
//
// **Ablauf.** Foliensatz lesen, Ordner über den Dialog des Hauptprozesses
// (`presentationImages:chooseFolder`, Vorgabe der Ordner des Dokuments), dann
// unter der gemeinsamen Druck-Vorbereitung die Druck-Fläche anhängen und je
// Folie das eigenständige Dokument aus `baueFolienDokument` bauen. Bilder und
// Schreiben entstehen im Hauptprozess (`presentationImages:export`); die Seite
// greift auf keine Datei zu. Der Auftrag geht erst nach dem Ende der
// Vorbereitung, aus demselben Grund wie beim PowerPoint-Export (sonst zeigte
// das Fenster während der Bild-Erzeugung nur die Druck-Fläche).
//
// **Farben wie in der Vorführung:** Die Klammer läuft mit
// `hellErzwingen: false`, wie beim PowerPoint-Export (4T-002294).
//
// **Keine Notizen:** Ein Bild hat kein Notizen-Feld; der Auftrag trägt sie
// nicht, und die Meldung nennt sie nicht, auch nicht als entfallen.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { state, withDialog } from '../app/app-state.js';

import { folienDokumente } from './folien-export-pptx.js';
import {
  basisName,
  entferneDruckFlaeche,
  haengeDruckFlaecheAn,
  leseFoliensatz,
  meldeKeinFoliensatz,
  meldeLauf,
  ordnerVon,
} from './folien-export.js';
import { withPrintPreparation } from './print-preparation.js';
import { showStatusbarHint } from './views.js';

// Ein laufender Export; ein zweiter Start wartet nicht, sondern entfällt.
let laeuft = false;

/** Der letzte Abschnitt eines Pfades, für die Meldung (Muster HTML-Export). */
function ordnerName(pfad) {
  const teile = String(pfad || '')
    .split(/[\\/]/)
    .filter(Boolean);
  return teile.length ? teile[teile.length - 1] : '';
}

/**
 * Die Erfolgs-Meldung: Zahl der Bilder und der Name des Ordners.
 *
 * @param {{bilder?: number, ordner?: string}|null|undefined} antwort
 * @param {(key: string) => string} [uebersetze]
 * @returns {string}
 */
export function bilderMeldung(antwort, uebersetze = t) {
  const n = antwort && Number.isInteger(antwort.bilder) ? antwort.bilder : 0;
  const zahl =
    n === 1
      ? uebersetze('presentation.export.bilderOne')
      : uebersetze('presentation.export.bilderMany').replace('{n}', String(n));
  return uebersetze('presentation.export.bilderOk')
    .replace('{bilder}', zahl)
    .replace('{ordner}', ordnerName(antwort && antwort.ordner));
}

/**
 * Die Fehler-Meldung zu einer Angabe des Hauptprozesses; die Gründe teilen
 * ihre Texte mit dem PowerPoint-Export.
 *
 * @param {{folie?: number|null, grund?: string}|null|undefined} fehler
 * @param {(key: string) => string} [uebersetze]
 * @returns {string}
 */
export function bilderFehlerText(fehler, uebersetze = t) {
  const grund = fehler && typeof fehler.grund === 'string' ? fehler.grund : 'unbekannt';
  const schluessel = `presentation.export.pptxGrund.${grund}`;
  let grundText = uebersetze(schluessel);
  if (grundText === schluessel) grundText = uebersetze('presentation.export.pptxGrund.unbekannt');
  const folie = fehler && Number.isInteger(fehler.folie) && fehler.folie > 0 ? fehler.folie : null;
  if (folie) {
    return uebersetze('presentation.export.bilderFehlerFolie')
      .replace('{folie}', String(folie))
      .replace('{error}', grundText);
  }
  return uebersetze('presentation.export.bilderFehler').replace('{error}', grundText);
}

function meldeBilderFehler(text) {
  showStatusbarHint('presentation.export.bilderFehler', { duration: 4000, error: true, text });
}

/**
 * Exportiert den Foliensatz des aktiven Dokuments als Ordner mit einem Bild
 * je Folie. Returnt true bei geschriebenen Bildern.
 *
 * @returns {Promise<boolean>}
 */
export async function exportiereFoliensatzAlsBilder() {
  if (laeuft || typeof api.exportFolienBilder !== 'function') return false;
  laeuft = true;
  let flaeche = null;
  let modell = null;
  let auftrag = null;
  try {
    const outcome = await withPrintPreparation({
      hellErzwingen: false,
      prepare: async (tab) => {
        modell = leseFoliensatz(tab);
        if (!modell) {
          meldeKeinFoliensatz();
          return null;
        }
        const wahl = await withDialog(() =>
          api.chooseFolienBilderOrdner({ suggestedDir: tab.path ? ordnerVon(tab.path) : null }),
        );
        if (!wahl || !wahl.ok || !wahl.path) return null;
        meldeLauf();
        const name = basisName(tab) || t('presentation.export.ordnerOhneName');
        flaeche = haengeDruckFlaecheAn(state.activePaneIndex, tab, modell, false);
        return {
          zielOrdner: wahl.path,
          unterordner: t('presentation.export.unterordner').replace('{name}', name),
        };
      },
      output: async (ziel) => {
        try {
          const dokumente = await folienDokumente(flaeche, modell.folien);
          auftrag = {
            ...ziel,
            folien: dokumente.map(({ html, breite, hoehe }) => ({ html, breite, hoehe })),
          };
          return { ok: true };
        } finally {
          entferneDruckFlaeche(flaeche);
          flaeche = null;
        }
      },
    });
    if (outcome.canceled) return false;
    if (!outcome.ok) {
      meldeBilderFehler(
        t('presentation.export.bilderFehler').replace('{error}', outcome.error || ''),
      );
      return false;
    }
    const antwort = await api.exportFolienBilder(auftrag);
    if (!antwort || !antwort.ok) {
      meldeBilderFehler(bilderFehlerText(antwort && antwort.fehler));
      return false;
    }
    showStatusbarHint('presentation.export.bilderOk', {
      duration: 3000,
      text: bilderMeldung(antwort),
    });
    return true;
  } finally {
    // Nur die eigene Fläche: Ein abgewiesener zweiter Lauf darf den
    // Druck-Zustand eines laufenden anderen nicht zurücknehmen.
    if (flaeche) entferneDruckFlaeche(flaeche);
    laeuft = false;
  }
}
