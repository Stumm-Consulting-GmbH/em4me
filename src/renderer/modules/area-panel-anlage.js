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

// --- 4T-002067 (Epic 3E-000341): Erhalt einer offenen Eingabe ---------------
// Der Neuaufbau des Panels (renderAreaPanel) leert Baum und Dateiliste, und
// genau dort haengen die beiden Eingaben. Ausgeloest wird er von jeder
// Aenderung am Bestand, auch vom Echo der eigenen Anlage; ohne Erhalt
// verschwand die Eingabe samt getipptem Namen. Das Panel haelt deshalb vor dem
// Leeren die offene Eingabe fest und setzt dasselbe Element danach wieder ein —
// mit seinem Tasten-Hoerer, seinem Wert und, falls es ihn hatte, dem Fokus samt
// Schreibmarke. Fehlt der Ort zum Wiedereinhaengen, wird die Eingabe verworfen,
// und der Anwender erfaehrt es. Beide Schritte laufen im token-geschuetzten,
// synchronen Abschnitt des Neuaufbaus; dazwischen liegt kein await.

function merkeEingabe(huelle, input) {
  const fokus = document.activeElement === input;
  return {
    huelle,
    input,
    fokus,
    start: input.selectionStart,
    ende: input.selectionEnd,
    richtung: input.selectionDirection || 'none',
  };
}

function setzeFokusZurueck(merker) {
  if (!merker.fokus) return; // Fremden Fokus nicht an sich ziehen.
  merker.input.focus();
  try {
    merker.input.setSelectionRange(merker.start, merker.ende, merker.richtung);
  } catch {
    // Schreibmarke nicht setzbar: Der Fokus genuegt.
  }
}

function verwirfEingabe(merker) {
  merker.huelle.remove();
  // Waehrend einer laufenden Anlage meldet deren Ergebnis selbst; ein zweiter
  // Hinweis «verworfen» widerspraeche dem angelegten Objekt.
  if (merker.input.dataset.anlageLaeuft === '1') return;
  showStatusbarHint('areaPanel.inputDiscarded', { duration: 4000, error: true });
}

/**
 * Haelt eine offene Ordner-Eingabe im Baum vor dem Leeren fest.
 *
 * @param {HTMLElement} baum Baum-Container des Panels.
 * @returns {object|null} Merker fuer setzeOrdnerEingabeWieder, oder null.
 */
export function merkeOrdnerEingabe(baum) {
  const zeile = baum.querySelector('.area-new-folder-row');
  const input = zeile && zeile.querySelector('.area-new-folder-input');
  return input ? merkeEingabe(zeile, input) : null;
}

/**
 * Setzt die festgehaltene Ordner-Eingabe hinter die Ordner-Zeile mit gleichem
 * Pfad; fehlt sie (Ordner verschwunden, Eltern-Ordner zugeklappt, anderer
 * Bereich), wird die Eingabe mit Hinweis verworfen.
 *
 * @param {HTMLElement} baum Neu befuellter Baum-Container.
 * @param {object|null} merker Ergebnis von merkeOrdnerEingabe.
 * @param {(a: string, b: string) => boolean} istGleicherPfad Pfad-Vergleich des Panels.
 */
export function setzeOrdnerEingabeWieder(baum, merker, istGleicherPfad) {
  if (!merker) return;
  const ziel = merker.huelle.dataset.ordner;
  const anker = [...baum.querySelectorAll('.area-dir-row')].find((zeile) =>
    istGleicherPfad(zeile.title, ziel),
  );
  if (!anker) {
    verwirfEingabe(merker);
    return;
  }
  anker.insertAdjacentElement('afterend', merker.huelle);
  setzeFokusZurueck(merker);
}

/**
 * Haelt eine offene Datei-Eingabe in der Dateiliste vor dem Leeren fest.
 *
 * @param {HTMLElement} liste Dateilisten-Container des Panels.
 * @returns {object|null} Merker fuer setzeDateiEingabeWieder, oder null.
 */
export function merkeDateiEingabe(liste) {
  const input = liste.querySelector('.area-new-file-input');
  return input ? merkeEingabe(input, input) : null;
}

/**
 * Setzt die festgehaltene Datei-Eingabe vorn in die Dateiliste, wenn die Liste
 * noch ihren Ziel-Ordner zeigt und dieser noch besteht; sonst wird sie mit
 * Hinweis verworfen.
 *
 * @param {HTMLElement} liste Neu befuellter Dateilisten-Container.
 * @param {object|null} merker Ergebnis von merkeDateiEingabe.
 * @param {(ordner: string) => boolean} ortBesteht Zeigt die Liste diesen Ordner, und besteht er?
 */
export function setzeDateiEingabeWieder(liste, merker, ortBesteht) {
  if (!merker) return;
  if (!ortBesteht(merker.input.dataset.ordner)) {
    verwirfEingabe(merker);
    return;
  }
  liste.prepend(merker.input);
  setzeFokusZurueck(merker);
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
      // 4T-002067: Eine noch offene Eingabe fuer den bisherigen Ordner ersetzt
      // der Anwender hier selbst; sie geht ohne Hinweis «verworfen».
      const alt = els.areaFiles.querySelector('.area-new-file-input');
      if (alt) alt.remove();
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
    // 4T-002067: Ziel-Ordner am Feld, damit der Neuaufbau pruefen kann, ob die
    // Dateiliste noch diesen Ordner zeigt (setzeDateiEingabeWieder).
    input.dataset.ordner = bruecke.ausgewaehlterOrdner(paneIdx);
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
      input.dataset.anlageLaeuft = '1';
      const result = await api.areaCreateFile(dir, name);
      delete input.dataset.anlageLaeuft;
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
    // 4T-002067: Pfad der Ordner-Zeile, hinter die der Neuaufbau die Eingabe
    // wieder einhaengt (setzeOrdnerEingabeWieder).
    zeile.dataset.ordner = dirPath;
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
      input.dataset.anlageLaeuft = '1';
      const result = await api.areaCreateFolder(dirPath, name);
      delete input.dataset.anlageLaeuft;
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
