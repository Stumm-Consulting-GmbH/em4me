// 4T-001349 (Epic 3E-000170): Anlage-Wege des Bereichs-Panels — die
// Inline-Eingaben fuer eine neue Markdown-Datei und einen neuen Unterordner
// samt ihrer Fehler-Meldung.
//
// Ausgezogen aus area-panel.js, das mit den beiden Eingaben sein
// Groessen-Budget ueberschritten haette. Der Schnitt folgt derselben
// Verantwortlichkeits-Linie wie area-panel-menus.js: Dort steht, WELCHE
// Handlungen an einer Stelle des Panels angeboten werden, hier, wie eine
// dieser Handlungen ihren Namen ERFRAGT und ausfuehrt, und in area-panel.js
// bleibt die DARSTELLUNG von Baum und Dateiliste. Die Zeilenzahl war der
// Anlass des Schnitts, nicht sein Kriterium (Datei-Groessen-Budget, Konzept
// "Test-Strategie und Qualitaetssicherung", Kapitel 9).
//
// Die Abhaengigkeit laeuft nur in eine Richtung: area-panel.js ruft hierher.
// Was dieses Modul vom Panel braucht — Neuaufbau, Listing-Verwerfung, Auswahl
// und Aufklapp-Zustand —, reicht der Aufrufer einmal als Bruecke herein,
// statt dass hier zurueckimportiert wuerde (kein Zyklus,
// Entwicklungsrichtlinien zum Modul-Schnitt).
//
// Eigener Zustand: keiner.
'use strict';

import { t } from '../i18n.js';
import { api } from './app/api.js';
import { getPaneEls, state } from './app/app-state.js';
import { showStatusbarHint } from './views/views.js';
// 4T-000427 (Epic 3E-000080): Ordner-Regel-Trigger fuer eine neu angelegte
// Datei (gemeinsamer Einhak-Punkt der App-Anlagen).
import { openCreatedFileWithRule } from './templates.js';

// Fehler-Meldung beider Anlage-Wege. Die Namens-Regeln liegen im Hauptprozess
// und bleiben dort die EINE Quelle; hier wird allein der zurueckgemeldete Code
// in seinen Hinweis uebersetzt. Ein leerer Name kommt gar nicht erst an, den
// faengt die Eingabe selbst ab.
function meldeAnlageFehler(result, existiertKey, fehlerKey) {
  if (result && result.error === 'exists') {
    showStatusbarHint(existiertKey, { duration: 2500, error: true });
    return;
  }
  if (result && result.error === 'invalid name') {
    showStatusbarHint('areaPanel.newNameInvalid', { duration: 2500, error: true });
    return;
  }
  showStatusbarHint(fehlerKey, { duration: 2500, error: true });
}

/**
 * Baut die beiden Anlage-Wege gegen eine Panel-Bruecke.
 *
 * @param {object} bruecke Rueckrufe des Panels.
 * @param {(paneIdx: number) => Promise<void>} bruecke.render Neuaufbau einer Pane.
 * @param {(dirPath: string) => void} bruecke.listingVerwerfen Listing-Zwischenspeicher eines Ordners verwerfen.
 * @param {(paneIdx: number) => string} bruecke.ausgewaehlterOrdner Aktuell ausgewaehlter Ordner.
 * @param {(a: string, b: string) => boolean} bruecke.istGleicherPfad Pfad-Vergleich des Panels.
 * @param {(paneIdx: number, dirPath: string) => boolean} bruecke.istAufgeklappt Aufklapp-Zustand.
 * @param {(paneIdx: number, dirPath: string, auf: boolean) => void} bruecke.setzeAufgeklappt Aufklapp-Zustand setzen.
 * @returns {{neueDatei: Function, neuerOrdner: Function}} Die beiden Anlage-Wege.
 */
export function erstelleAnlageWege(bruecke) {
  // 4T-000328: Inline-Eingabe fuer "Neue Datei in diesem Ordner" — erscheint am
  // Kopf der Dateiliste; Enter legt an und oeffnet, Escape bricht ab.
  // 4T-001349 (Epic 3E-000170): `dirPath` waehlt den Ziel-Ordner. Er wird zuvor
  // ausgewaehlt, weil die Dateiliste den ausgewaehlten Ordner zeigt — die
  // Eingabe stuende sonst ueber einer Liste, in die die neue Datei nicht faellt,
  // und die angelegte Datei erschiene nirgends (AK3). Ohne Angabe bleibt es beim
  // bisherigen Verhalten des "+"-Knopfs am Listenkopf.
  async function neueDatei(paneIdx, dirPath) {
    const els = getPaneEls(paneIdx);
    if (!els || !els.areaFiles || !state.areaPath) return;
    if (dirPath && !bruecke.istGleicherPfad(bruecke.ausgewaehlterOrdner(paneIdx), dirPath)) {
      state.areaPanel.selectedDirByPane[paneIdx] = dirPath;
      await bruecke.render(paneIdx);
    }
    const offen = els.areaFiles.querySelector('.area-new-file-input');
    if (offen) {
      offen.focus();
      return;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'area-new-file-input';
    input.placeholder = t('areaPanel.newFilePlaceholder');
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        input.remove();
        return;
      }
      if (e.key !== 'Enter') return;
      const name = input.value.trim();
      // 4T-001349 (AK6): Der leere Name wird gemeldet statt stillschweigend
      // ignoriert — die Eingabe blieb sonst ohne jede Rueckmeldung stehen.
      if (!name) {
        showStatusbarHint('areaPanel.newNameEmpty', { duration: 2500, error: true });
        return;
      }
      const dir = bruecke.ausgewaehlterOrdner(paneIdx);
      const result = await api.areaCreateFile(dir, name);
      if (result && result.ok) {
        input.remove();
        bruecke.listingVerwerfen(dir);
        await bruecke.render(paneIdx);
        // 4T-000427 (Epic 3E-000080): Datei-Anlage über die App durchläuft den
        // Ordner-Regel-Trigger (Vorlage füllen, öffnen, Cursor-Sprung).
        await openCreatedFileWithRule(paneIdx, result.path);
        return;
      }
      meldeAnlageFehler(result, 'areaPanel.newFileExists', 'areaPanel.newFileError');
    });
    els.areaFiles.prepend(input);
    input.focus();
  }

  // 4T-001349 (Epic 3E-000170): Inline-Eingabe fuer "Neuer Unterordner in
  // diesem Ordner" — sie erscheint im Baum unmittelbar unter der angeklickten
  // Ordner-Zeile und auf der Einrueckung ihrer Kinder, also genau dort, wo der
  // neue Ordner danach steht. Enter legt an, Escape bricht ab; das Abbrechen
  // entfernt allein die Eingabe (AK9, es ist bis dahin nichts angelegt).
  async function neuerOrdner(paneIdx, dirPath) {
    const els = getPaneEls(paneIdx);
    if (!els || !els.areaTree || !state.areaPath || !dirPath) return;
    // Aufklappen, damit der Platz der Kinder ueberhaupt sichtbar ist; erst
    // danach steht die Ziel-Zeile im neu gebauten Baum.
    if (!bruecke.istAufgeklappt(paneIdx, dirPath)) {
      bruecke.setzeAufgeklappt(paneIdx, dirPath, true);
      await bruecke.render(paneIdx);
    }
    const offen = els.areaTree.querySelector('.area-new-folder-input');
    if (offen) {
      offen.focus();
      return;
    }
    const zeilen = [...els.areaTree.querySelectorAll('.area-dir-row')];
    const anker = zeilen.find((zeile) => bruecke.istGleicherPfad(zeile.title, dirPath));
    if (!anker) return;
    // Eigene Zeile mit der Einrueckung der Kind-Ebene (dieselbe Staffel wie
    // die Ordner-Zeilen des Baums); die Eingabe fuellt sie aus.
    const zeile = document.createElement('div');
    zeile.className = 'area-new-folder-row';
    zeile.style.paddingLeft = `${(parseInt(anker.style.paddingLeft, 10) || 6) + 14}px`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'area-new-folder-input';
    input.placeholder = t('areaPanel.newFolderPlaceholder');
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        zeile.remove();
        return;
      }
      if (e.key !== 'Enter') return;
      const name = input.value.trim();
      if (!name) {
        showStatusbarHint('areaPanel.newNameEmpty', { duration: 2500, error: true });
        return;
      }
      const result = await api.areaCreateFolder(dirPath, name);
      if (result && result.ok) {
        zeile.remove();
        bruecke.listingVerwerfen(dirPath);
        await bruecke.render(paneIdx);
        return;
      }
      meldeAnlageFehler(result, 'areaPanel.newFolderExists', 'areaPanel.newFolderError');
    });
    zeile.appendChild(input);
    anker.insertAdjacentElement('afterend', zeile);
    input.focus();
  }

  return { neueDatei, neuerOrdner };
}
