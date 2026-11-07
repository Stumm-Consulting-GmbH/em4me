// 4T-002422 (Epic 3E-000366, Story 4S-001133): Der Knopf «Scharf» neben
// «Starten» in der Kopfzeile über dem `workflow`-Block (Entscheidung 2e),
// zweiter Bedienort der Scharf-Schaltung nach dem Muster von
// workflow-start-knopf.js.
//
// **Nur bei `trigger: schedule` und `trigger: event`** (AK1 und AK3 der
// Story 4S-001133; Stufe 3: 4T-002463, Story 4S-001146): Bei jedem anderen
// Auslöser entsteht kein Knopf; bei einem Ereignis-Workflow nennt sein Tooltip
// das Ereignis in Worten. Er hängt sich über `registriereKopfAktion` in die
// Kopfzeile beider Ansichten und berührt den Baustein nicht.
//
// **Zustand:** Der Scharf-Zustand liegt im Lauf-Stand des Hauptprozesses;
// der Knopf fragt ihn beim Aufbau ab (`scharfZustand`) und zeigt ihn als
// gedrückten Schalter mit Haken. Weil die Kopfzeile nicht bei jeder Änderung
// neu entsteht, fragt der Klick den Zustand erneut, bevor er umschaltet: Ein
// scharfer Workflow wird entschärft, jeder andere — auch «Definition
// geändert» — scharf geschaltet. Nach jeder Scharf-Schaltung an einem der drei
// Orte zieht der Knopf nach (`onScharfGeaendert`), solange er im Dokument hängt.
//
// **Inaktiv** wie «Starten» bei einem noch nie gespeicherten Dokument und
// außerhalb eines Bereichs, weil der Lauf-Stand an der Datei im Bereich hängt;
// ein Befund sperrt ihn nicht, weil Entschärfen immer möglich bleiben muss —
// das Scharf-Schalten weist ihn dann mit Zeile und Grund ab.
'use strict';

import { t } from '../../i18n.js';
import { state } from '../app/app-state.js';
import { showStatusbarHint } from '../views/views.js';
import { registriereKopfAktion } from './workflow-kopfzeile.js';
import {
  SCHARF,
  onScharfGeaendert,
  scharfTitel,
  istSchaltbar,
  scharfZustand,
  schalteScharf,
} from './workflow-scharf.js';

/**
 * Zeigt den Zustand am Knopf.
 *
 * @param {HTMLButtonElement} knopf
 * @param {{status?: string, nextDue?: string|null, event?: object|null}} zustand
 */
export function zeigeScharf(knopf, zustand) {
  const status = zustand && zustand.status ? zustand.status : SCHARF.aus;
  const an = status === SCHARF.an;
  knopf.dataset.status = status;
  knopf.setAttribute('aria-pressed', String(an));
  knopf.textContent = t(an ? 'workflow.scharf.knopfAn' : 'workflow.scharf.knopf');
  knopf.title = scharfTitel(
    status,
    zustand ? zustand.nextDue : null,
    zustand && zustand.event ? zustand.event : null,
  );
}

// Der Grund, aus dem der Knopf nicht schaltet, oder null.
function sperrGrund(pfad) {
  if (!pfad) return 'workflow.start.inaktivUngespeichert';
  if (!state.areaPath) return 'workflow.start.inaktivBereich';
  return null;
}

// `ereignis` ist die Regel aus dem Aufbau der Kopfzeile; die Antwort des
// Hauptprozesses ist jünger und geht vor, wenn sie das Feld trägt.
async function aktualisiere(knopf, pfad, ereignis) {
  if (sperrGrund(pfad)) return;
  const zustand = await scharfZustand(pfad);
  if (!zustand || !zustand.ok) return;
  zeigeScharf(knopf, { ...zustand, event: zustand.event !== undefined ? zustand.event : ereignis });
}

/**
 * Die Kopf-Aktion: hängt den Knopf rechts neben «Starten».
 *
 * @param {{element: HTMLElement, analyse: object,
 *   dokument: () => {path: string, text: string}}} kopf
 */
export function baueScharfKnopf({ element, analyse, dokument }) {
  if (!analyse || !analyse.meta || !istSchaltbar(analyse.meta.trigger)) return;
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'cm-wf-scharf';
  const ereignis = analyse.meta.event || null;
  zeigeScharf(knopf, { status: SCHARF.aus, event: ereignis });
  const { path: anfangsPfad } = dokument();
  const grund = sperrGrund(anfangsPfad);
  knopf.setAttribute('aria-disabled', String(grund !== null));
  if (grund) knopf.title = t(grund);
  void aktualisiere(knopf, anfangsPfad, ereignis);
  const abmelden = onScharfGeaendert((pfad) => {
    if (!knopf.isConnected) {
      abmelden();
      return;
    }
    if (pfad === dokument().path) void aktualisiere(knopf, pfad, ereignis);
  });
  knopf.addEventListener('mousedown', (e) => e.preventDefault());
  knopf.addEventListener('click', async (e) => {
    e.preventDefault();
    const { path, text } = dokument();
    const sperre = sperrGrund(path);
    knopf.setAttribute('aria-disabled', String(sperre !== null));
    if (sperre) {
      showStatusbarHint(sperre, { error: true, duration: 3000 });
      return;
    }
    const jetzt = await scharfZustand(path);
    const an = !(jetzt && jetzt.ok && jetzt.status === SCHARF.an);
    const name = analyse.meta.name;
    await schalteScharf(path, an, { name, text });
  });
  element.appendChild(knopf);
}

let registriert = false;

/** Meldet den Knopf einmal an der Kopfzeile an (nach «Starten»). */
export function registriereScharfKnopf() {
  if (registriert) return;
  registriert = true;
  registriereKopfAktion(baueScharfKnopf);
}
