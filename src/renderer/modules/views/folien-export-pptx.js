// --- PowerPoint-Datei des Foliensatzes (4T-002294, Epic 3E-000349) -------------
// Story 4S-001084. Schwester-Datei von folien-export.js, nach dessen
// Zeilen-Budget ausgelagert; der Ablauf folgt dem PDF-Export dort.
//
// **Ablauf.** Foliensatz lesen, Speicherort über den Dialog des Hauptprozesses
// (`pptx:chooseTarget`, Vorschlag `<Dokumentname>.pptx` neben dem Dokument),
// dann unter der gemeinsamen Druck-Vorbereitung die Druck-Fläche anhängen und
// je Folie das eigenständige Dokument aus `baueFolienDokument` bauen — dasselbe,
// das auch das Publikums-Fenster zeigt, in Entwurfsgröße und ohne Skript.
// Bilder, Datei und Schreiben entstehen im Hauptprozess
// (`presentationPptx:export`); die Seite greift auf keine Datei zu.
//
// **Warum der Auftrag erst nach der Vorbereitung geht** (Ausführungs-
// Entscheidung der Sitzung, 2026-10-17): Die Bilder brauchen je Folie rund
// 150 bis 300 ms. Liefe der Auftrag innerhalb der Klammer, stünde das Fenster
// für die ganze Dauer im Druck-Zustand, der nur die Druck-Fläche zeigt. Die
// Dokumente sind nach dem Bau eigenständig; die Klammer endet deshalb mit
// ihnen, und der Lauf-Hinweis der Statusleiste trägt die Wartezeit. Ein
// zweiter Start während des Laufs bleibt ohne Wirkung.
//
// **Farben wie in der Vorführung, nicht wie auf Papier** (4T-002294,
// Nachbesserung vom 2026-10-17): Das Bild je Folie zeigt, was der Beamer
// zeigt. Die Klammer läuft deshalb mit `hellErzwingen: false`: Theme der
// Anwendung, Mermaid-Blöcke und Diagramme zu Tabellen bleiben, wie die Ansicht
// sie gezeichnet hat; ohne die Option kam ein Mermaid-Diagramm hell auf eine
// dunkle Folie. Die helle Ausgabe (4T-000465) bleibt PDF, Druck und HTML.
//
// **Notizen gehen immer mit** (Ausführungs-Entscheidung vom 2026-10-17 in
// 4T-002290): Der Schalter «Sprecher-Notizen mitgeben» gilt für PDF und HTML,
// nicht hier. Jede Notiz geht als Markdown-Klartext, ungerendert, weil das
// Notizen-Feld der Datei reiner Text ist.
'use strict';

import { t } from '../../i18n.js';

import { api } from '../app/api.js';
import { state, tabDisplayName, withDialog } from '../app/app-state.js';
import { HUELLE_KLASSE } from '../presentation/presentation-folie.js';

import { notizenMitText } from './folien-export-notizen.js';
import {
  FOLIEN_ANKER,
  baueFolienDokument,
  basisName,
  entferneDruckFlaeche,
  folienMeldung,
  haengeDruckFlaecheAn,
  leseFoliensatz,
  meldeKeinFoliensatz,
  meldeLauf,
} from './folien-export.js';
import { EXPORT_REGELN, sammleInhaltsRegeln, variablenBlock } from './html-export.js';
import { withPrintPreparation } from './print-preparation.js';
import { showStatusbarHint } from './views.js';

// Ein laufender Export; ein zweiter Start wartet nicht, sondern entfällt.
let laeuft = false;

/** Das Format der Datei aus dem Kopf: «4:3» oder sonst «16:9». */
export function pptxFormat(kopf) {
  return kopf && kopf.size === '4:3' ? '4:3' : '16:9';
}

/**
 * Die Notizen einer Folie als Klartext-Liste: nur solche mit Text, Zeilenenden
 * vereinheitlicht, außen ohne Leerraum.
 *
 * @param {object} folie Folie des Format-Kerns.
 * @returns {string[]}
 */
export function notizenKlartext(folie) {
  return notizenMitText(folie).map((n) => n.text.replace(/\r\n?/g, '\n').trim());
}

/**
 * Baut je gezeichneter Folie der Druck-Fläche das eigenständige Dokument und
 * hängt ihre Notizen an.
 *
 * @param {Element} flaeche Die Druck-Fläche.
 * @param {Array<object>} folien Folien des Format-Kerns.
 * @returns {Promise<Array<{html: string, breite: number, hoehe: number, notizen: string[]}>>}
 */
export async function folienDokumente(flaeche, folien) {
  const doc = flaeche.ownerDocument;
  // Die Stile einmal für alle Folien statt je Folie aus allen Stilblättern.
  const basisStile = [
    variablenBlock(doc, doc.defaultView),
    sammleInhaltsRegeln(doc, FOLIEN_ANKER),
    EXPORT_REGELN,
  ];
  const huellen = Array.from(flaeche.querySelectorAll(`.${HUELLE_KLASSE}`));
  const ergebnis = [];
  for (let i = 0; i < huellen.length; i += 1) {
    const dokument = await baueFolienDokument(huellen[i], { basisStile });
    if (!dokument) throw new Error(`Folie ${i + 1} ohne Inhalt`);
    ergebnis.push({ ...dokument, notizen: notizenKlartext(folien[i]) });
  }
  return ergebnis;
}

/**
 * Die Fehler-Meldung zu einer Angabe des Hauptprozesses.
 *
 * @param {{folie?: number|null, grund?: string}|null|undefined} fehler
 * @param {(key: string) => string} [uebersetze]
 * @returns {string}
 */
export function pptxFehlerText(fehler, uebersetze = t) {
  const grund = fehler && typeof fehler.grund === 'string' ? fehler.grund : 'unbekannt';
  const schluessel = `presentation.export.pptxGrund.${grund}`;
  let grundText = uebersetze(schluessel);
  if (grundText === schluessel) grundText = uebersetze('presentation.export.pptxGrund.unbekannt');
  const folie = fehler && Number.isInteger(fehler.folie) && fehler.folie > 0 ? fehler.folie : null;
  if (folie) {
    return uebersetze('presentation.export.pptxFehlerFolie')
      .replace('{folie}', String(folie))
      .replace('{error}', grundText);
  }
  return uebersetze('presentation.export.pptxFehler').replace('{error}', grundText);
}

function meldePptxFehler(text) {
  showStatusbarHint('presentation.export.pptxFehler', { duration: 4000, error: true, text });
}

/**
 * Exportiert den Foliensatz des aktiven Dokuments als PowerPoint-Datei, je
 * Folie ein Bild und ihre Notizen im Notizen-Feld. Returnt true bei
 * geschriebener Datei.
 *
 * @returns {Promise<boolean>}
 */
export async function exportiereFoliensatzAlsPptx() {
  if (laeuft || typeof api.exportFolienPptx !== 'function') return false;
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
        const name = basisName(tab);
        const suggestedPath = tab.path
          ? tab.path.replace(/\.(md|markdown|mdown|mkd)$/i, '') + '.pptx'
          : null;
        const suggestedName = !tab.path && name ? `${name}.pptx` : null;
        const ziel = await withDialog(() =>
          api.choosePptxExportTarget({ suggestedPath, suggestedName }),
        );
        if (!ziel || !ziel.ok || !ziel.path) return null;
        meldeLauf();
        flaeche = haengeDruckFlaecheAn(state.activePaneIndex, tab, modell, false);
        return { zielPfad: ziel.path, titel: String(tabDisplayName(tab) || '') };
      },
      output: async (ziel) => {
        try {
          const folien = await folienDokumente(flaeche, modell.folien);
          auftrag = { ...ziel, format: pptxFormat(modell.kopf), folien };
          return { ok: true };
        } finally {
          entferneDruckFlaeche(flaeche);
          flaeche = null;
        }
      },
    });
    if (outcome.canceled) return false;
    if (!outcome.ok) {
      meldePptxFehler(t('presentation.export.pptxFehler').replace('{error}', outcome.error || ''));
      return false;
    }
    const antwort = await api.exportFolienPptx(auftrag);
    if (!antwort || !antwort.ok) {
      meldePptxFehler(pptxFehlerText(antwort && antwort.fehler));
      return false;
    }
    const meldung = folienMeldung('presentation.export.pptxOk', {
      folien: antwort.folien,
      mitgegeben: antwort.notizen,
    });
    showStatusbarHint('presentation.export.pptxOk', { duration: 3000, text: meldung.text });
    return true;
  } finally {
    // Nur die eigene Fläche: Ein abgewiesener zweiter Lauf darf den
    // Druck-Zustand eines laufenden anderen nicht zurücknehmen.
    if (flaeche) entferneDruckFlaeche(flaeche);
    laeuft = false;
  }
}
