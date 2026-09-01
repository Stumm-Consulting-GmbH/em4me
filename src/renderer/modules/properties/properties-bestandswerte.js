// 4T-1340 (Epic 3E-0238): Werte-Vorschläge aus dem vorhandenen Bestand.
//
// Die zweite Werte-Quelle der Eigenschafts-Felder, neben dem definierten
// Wertevorrat eines Profils. Sie holt die im Bereich für dieses Feld bereits
// vergebenen Werte und hängt sie an dasselbe Bedienelement, das der Vorrat
// bedient — ein Verhalten, zwei Herkünfte.
//
// **Beide Herkünfte bleiben unterscheidbar** (Entscheidung E2 des Epics): Ein
// Wertevorrat drückt eine Absicht aus, die ein zufällig getippter Bestandswert
// nicht hat. In der Auswahlliste trennt eine eigene Gruppe, in der
// Vorschlagsliste die Zusatz-Beschriftung der Zeile. Beides sind die Mittel,
// die das Bedienelement selbst mitbringt; ein eigener Aufbau wäre eine zweite
// Darstellung derselben Sache.
//
// **Auf Verlangen**, wie die Abfrage-Quelle: Geholt wird erst, wenn ein Feld
// sein Bedienelement bekommt. Der Aus-Zustand der Erweiterung ist im
// Hauptprozess verankert und liefert eine leere Liste; hier bleibt deshalb
// keine zweite Gate-Prüfung stehen, die auseinanderlaufen könnte.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';

let listenSeq = 0;

// Ein Fehler ist eine leere Liste, keine Ausnahme — dieselbe Regel wie bei der
// Abfrage-Quelle. Eine ausbleibende Vorschlagsliste ist verkraftbar, ein
// aufgerissenes Bedienelement nicht.
async function ladeBestandsWerte(feld, filePath) {
  if (!feld || typeof api.propertiesUsedValues !== 'function') return [];
  try {
    const antwort = await api.propertiesUsedValues({ filePath: filePath || null, feld });
    if (!antwort || antwort.status !== 'ready') return [];
    return Array.isArray(antwort.values) ? antwort.values : [];
  } catch {
    return [];
  }
}

/**
 * Bestands-Werte an ein Auswahl-Bedienelement oder eine Vorschlagsliste hängen.
 *
 * @param {HTMLElement} el Auswahl-Element (`select`) oder Träger der Liste.
 * @param {object} opts { feld, filePath, input } — `input` bei der Textform.
 * @returns {Promise<string[]>} die geholten Werte (für den Prüf-Zugang).
 */
export function attachBestandsWerte(el, opts) {
  const { feld = null, filePath = null, input = null } = opts || {};
  return ladeBestandsWerte(feld, filePath).then((werte) => {
    // AK4: Kommt die Eigenschaft im Bereich nirgends vor, entsteht keine
    // leere Liste — ein leeres Dropdown ist schlechter als keines.
    if (!el || !el.isConnected || werte.length === 0) return werte;
    if (el.tagName === 'SELECT') return ergaenzeAuswahl(el, werte);
    if (input) ergaenzeVorschlagsliste(el, input, werte);
    return werte;
  });
}

// Auswahlliste: eigene Gruppe hinter den definierten Werten, vor dem Sentinel
// «Eigener Wert…». Bereits vorhandene Werte werden nicht doppelt angeboten —
// steht ein Bestandswert schon im Vorrat, ist er dort besser aufgehoben.
function ergaenzeAuswahl(select, werte) {
  const vorhanden = new Set([...select.options].map((o) => o.value));
  const neue = werte.filter((w) => !vorhanden.has(w));
  if (neue.length === 0) return werte;
  const gruppe = document.createElement('optgroup');
  gruppe.label = t('properties.valueFromArea');
  for (const wert of neue) {
    const opt = document.createElement('option');
    opt.value = wert;
    opt.textContent = wert;
    gruppe.appendChild(opt);
  }
  const sentinel = select.querySelector('option[value="__custom__"]');
  if (sentinel) select.insertBefore(gruppe, sentinel);
  else select.appendChild(gruppe);
  return werte;
}

// Vorschlagsliste am Text-Feld. Trägt das Feld bereits eine Liste (der
// Wertevorrat war zuerst da), werden die Werte dort ergänzt statt eine zweite
// anzulegen: Ein Eingabefeld kann nur auf EINE Liste zeigen, und eine zweite
// verdrängte die erste stillschweigend.
function ergaenzeVorschlagsliste(traeger, input, werte) {
  const vorhandeneId = input.getAttribute('list');
  let dl = vorhandeneId ? traeger.querySelector(`datalist#${CSS.escape(vorhandeneId)}`) : null;
  const neu = !dl;
  if (neu) {
    dl = document.createElement('datalist');
    dl.id = `properties-bestand-values-${listenSeq++}`;
  }
  const vorhanden = new Set([...dl.querySelectorAll('option')].map((o) => o.value));
  for (const wert of werte) {
    if (vorhanden.has(wert)) continue;
    const opt = document.createElement('option');
    opt.value = wert;
    // Die Zusatz-Beschriftung ist der Herkunfts-Hinweis: Das Bedienelement
    // zeigt sie neben dem Wert, während die Werte des Vorrats ohne sie
    // stehen. Damit sind beide Herkünfte in EINER Liste unterscheidbar.
    opt.label = t('properties.valueFromArea');
    dl.appendChild(opt);
  }
  if (neu) {
    traeger.appendChild(dl);
    input.setAttribute('list', dl.id);
  }
}
