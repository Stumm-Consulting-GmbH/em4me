// 4T-001881 (Epic 3E-000185): Das Bedienelement der Tour-Station «Arbeitsmodus».
//
// Die Karte der Station trägt die drei festen Modi zur Wahl. Anders als in den
// Einstellungen gibt es hier keinen Entwurf und kein «Anwenden»: Ein Klick
// wirkt sofort über denselben Weg (applyExtensionsState) und damit auch in
// allen weiteren Fenstern; die Tour muss dafür weder beendet noch ein Fenster
// neu geladen werden (Story 4S-000992, AK9).
//
// Angezeigt wird der Modus, der dem aktuellen Schalter-Stand entspricht —
// beim allerersten Start ist das «Einsteiger», weil der Start-Modus ihn
// gesetzt hat (E11, Einmal-Entscheidung in src/main/app/settings-store.js).
// Damit stimmt die Vorwahl beim ersten Start mit der Zusage überein UND eine
// später von Hand aufgerufene Tour zeigt den wirklichen Stand, statt ihn
// ungefragt zurückzustellen (AK24). Entspricht der Stand keinem festen Modus,
// ist keine Schaltfläche gewählt und die Zeile darunter sagt «Angepasst».
//
// Die Beschriftungen sind dieselben wie im Einstellungs-Bereich
// (`settings.extensions.mode.*`). Bewusst keine eigenen `tour.*`-Texte: Ein
// Modus trägt EINEN Namen, und zwei Übersetzungen desselben Namens liefen
// auseinander.
'use strict';

import {
  disabledIdsForModeLevel,
  modeLevelForDisabledIds,
} from '../../../shared/extensions/extensions-core.js';
import { EXTENSION_MODE_LEVELS } from '../../../shared/extensions/extensions.js';
import { t } from '../../i18n.js';
import {
  applyExtensionsState,
  getDisabledExtensionIds,
} from '../extensions/extension-lifecycle.js';

// Beschriftung und Kurzbeschreibung einer Stufe. Bewusst nicht aus dem
// Einstellungs-Bereich importiert und dort auch nicht von hier: Die beiden
// Bedien-Orte teilen die SCHLÜSSEL, nicht den Code — eine Abhängigkeit
// zwischen Tour und Einstellungs-Seite wäre für zwei t()-Aufrufe zu teuer.
function modusName(level) {
  return t(`settings.extensions.mode.name.${level}`);
}

function modusBeschreibung(level) {
  return t(`settings.extensions.mode.desc.${level}`);
}

// Baut die Wahl als fertiges Element. Der Aufrufer hängt es in die Karte.
export function baueArbeitsmodusWahl() {
  const wrapper = document.createElement('div');
  wrapper.className = 'tour-modes';

  const knoepfe = new Map();
  const stand = document.createElement('div');
  stand.className = 'tour-modes-state';

  // Vorwahl und Zustands-Zeile aus dem laufenden Schalter-Stand ableiten.
  const zeigeStand = () => {
    const aktiv = modeLevelForDisabledIds(getDisabledExtensionIds());
    for (const [level, btn] of knoepfe) {
      const gewaehlt = level === aktiv;
      btn.setAttribute('aria-pressed', gewaehlt ? 'true' : 'false');
      btn.classList.toggle('is-active', gewaehlt);
    }
    stand.textContent = aktiv
      ? t('settings.extensions.mode.active').replace('{name}', modusName(aktiv))
      : t('settings.extensions.mode.custom');
  };

  for (const level of EXTENSION_MODE_LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn tour-mode';
    btn.id = `tour-mode-${level}`;
    btn.dataset.modeLevel = level;
    const name = document.createElement('span');
    name.className = 'tour-mode-name';
    name.textContent = modusName(level);
    const desc = document.createElement('span');
    desc.className = 'tour-mode-desc';
    desc.textContent = modusBeschreibung(level);
    btn.append(name, desc);
    btn.addEventListener('click', async () => {
      // Doppel-Klick-Schutz während des asynchronen Anwendens (Muster der
      // Aktions-Schaltflächen des Einstellungs-Bereichs).
      btn.disabled = true;
      try {
        await applyExtensionsState(disabledIdsForModeLevel(level));
      } catch (err) {
        console.warn('Arbeitsmodus anwenden fehlgeschlagen:', level, err);
      } finally {
        btn.disabled = false;
        // Gemessen statt angenommen: Die Zeile zeigt den Stand NACH dem
        // Anwenden, nicht die Absicht des Klicks.
        zeigeStand();
      }
    });
    knoepfe.set(level, btn);
    wrapper.appendChild(btn);
  }

  wrapper.appendChild(stand);
  zeigeStand();
  return wrapper;
}
