// 4T-002349 (Epic 3E-000184): Der Knopf «Starten» in der Kopfzeile über dem
// `workflow`-Block der Live-Ansicht (Regel S2, Story 4S-001105, AK3).
//
// Er hängt sich über `registriereKopfAktion` in die Kopfzeile aus
// dem Baustein workflow-kopfzeile.js (4T-002351) und berührt ihn nicht. Er startet jede
// Workflow-Datei, auch außerhalb des Workflow-Ordners (AK3 der Story), mit dem
// Stand im Editor.
//
// **Inaktiv** (Entscheidung der Sitzung vom 2026-10-23, E4, im Rahmen der
// freigegebenen Stories): bei einem Befund der Prüfung, bei einem noch nie
// gespeicherten Dokument («Zuerst speichern») und außerhalb eines Bereichs,
// weil der Hauptprozess die Datei in der Bereichs-Wurzel verlangt. Der Befund
// folgt der Analyse der Kopfzeile und sperrt den Knopf; Speicherort und Bereich
// können sich ändern, ohne dass die Kopfzeile neu entsteht, deshalb prüft der
// Klick sie erneut und meldet den Grund in der Statusleiste.
//
// **Zwei Ansichten** (Nachzug vom 2026-10-24 auf die Entscheidung des Product
// Owners vom 2026-10-23): Derselbe Knopf sitzt in der Kopfzeile der
// Live-Ansicht und in der der gerenderten Ansicht samt Vorschau der geteilten
// Ansicht. Pfad und Text liest er deshalb aus `dokument()` des Kontexts, nicht
// aus dem Editor; die Live-Ansicht liefert dort den Stand im Editor, die
// gerenderte den Stand des Reiters, aus dem sie gerendert ist.
'use strict';

import { t } from '../../i18n.js';
import { state } from '../app/app-state.js';
import { showStatusbarHint } from '../views/views.js';
import { registriereKopfAktion } from './workflow-kopfzeile.js';
import { starteWorkflow } from './workflow-start.js';

/**
 * Ob der Knopf startet, und der Schlüssel seines Hinweis-Texts.
 *
 * @param {object} analyse Ergebnis von `pruefeWorkflow`.
 * @param {string} pfad Pfad des Dokuments, leer ohne Speicherort.
 * @param {string|null} bereich Wurzel des Bereichs des Fensters.
 * @returns {{aktiv: boolean, befund: boolean, key: string}}
 */
export function knopfZustand(analyse, pfad, bereich) {
  if (!analyse || !analyse.ok) {
    return { aktiv: false, befund: true, key: 'workflow.start.inaktivBefund' };
  }
  if (!pfad) return { aktiv: false, befund: false, key: 'workflow.start.inaktivUngespeichert' };
  if (!bereich) return { aktiv: false, befund: false, key: 'workflow.start.inaktivBereich' };
  return { aktiv: true, befund: false, key: 'workflow.start.titel' };
}

function zustandJetzt(analyse, dokument) {
  return knopfZustand(analyse, dokument().path, state.areaPath || null);
}

function setzeZustand(knopf, zustand) {
  knopf.disabled = zustand.befund;
  knopf.setAttribute('aria-disabled', String(!zustand.aktiv));
  knopf.title = t(zustand.key);
}

/**
 * Die Kopf-Aktion: hängt den Knopf in die rechte Spalte der Kopfzeile.
 *
 * @param {{element: HTMLElement, analyse: object,
 *   dokument: () => {path: string, text: string}}} kopf
 */
export function baueStartKnopf({ element, analyse, dokument }) {
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'cm-wf-starten';
  knopf.textContent = t('workflow.start.knopf');
  setzeZustand(knopf, zustandJetzt(analyse, dokument));
  knopf.addEventListener('mousedown', (e) => e.preventDefault());
  knopf.addEventListener('click', (e) => {
    e.preventDefault();
    const zustand = zustandJetzt(analyse, dokument);
    setzeZustand(knopf, zustand);
    if (!zustand.aktiv) {
      showStatusbarHint(zustand.key, { error: true, duration: 3000 });
      return;
    }
    const { path, text } = dokument();
    void starteWorkflow({ path, text });
  });
  element.appendChild(knopf);
}

let registriert = false;

/** Meldet den Knopf einmal an der Kopfzeile an. */
export function registriereStartKnopf() {
  if (registriert) return;
  registriert = true;
  registriereKopfAktion(baueStartKnopf);
}
