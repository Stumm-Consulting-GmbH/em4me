// 4T-001048 (Epic 3E-000151): Einstellungs-Bereich der Mindmap-Ansicht.
//
// Liegt hier und nicht bei den übrigen Mindmap-Modulen, weil die
// Registrierung ein Modul-Seiteneffekt ist: Ein Import aus dem Mindmap-Ordner
// zöge die Settings-Seite in die Lade-Kette von app-state (Begründung im Kopf
// von mindmap/mindmap-einstellungen.js). Der Ordner settings/ ist ohnehin die
// Heimat der Bereiche, und app-init lädt sie dort als Seiteneffekt.
//
// Der Bereich hängt an der Erweiterung: Ist sie aus, verschwindet er über das
// Registry-Feld settingsSections aus der Navigation.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  MINDMAP_GRENZEN,
  MINDMAP_LAYOUTS,
  MINDMAP_LINIENFUEHRUNGEN,
  MINDMAP_VORGABEN,
  normalisiereMindmapOptionen,
} from '../../../shared/mindmap-optionen.js';
import {
  MINDMAP_SETTINGS_KEY,
  applyMindmapVoreinstellung,
  getMindmapVoreinstellung,
} from '../mindmap/mindmap-einstellungen.js';
import { buildSettingsRow, jsonEqual } from './settings-shared.js';
import { registerSettingsSection } from './settings-page.js';

function entwurf(draft) {
  if (!draft.mindmap) draft.mindmap = getMindmapVoreinstellung();
  return draft.mindmap;
}

function auswahl(id, werte, labelPraefix, draft, feld) {
  const el = document.createElement('select');
  el.id = id;
  for (const wert of werte) {
    const option = document.createElement('option');
    option.value = wert;
    option.textContent = t(`${labelPraefix}.${wert}`);
    el.appendChild(option);
  }
  el.value = entwurf(draft)[feld];
  el.addEventListener('change', () => {
    entwurf(draft)[feld] = el.value;
  });
  return el;
}

function zahl(id, draft, feld) {
  const el = document.createElement('input');
  el.type = 'number';
  el.id = id;
  el.min = String(MINDMAP_GRENZEN[feld].von);
  el.max = String(MINDMAP_GRENZEN[feld].bis);
  el.step = '1';
  el.value = String(entwurf(draft)[feld]);
  el.addEventListener('change', () => {
    // Eine unbrauchbare Eingabe wird nicht abgewiesen, sondern fällt auf die
    // Vorgabe zurück; die Auflösung verwirft Unzulässiges ohnehin still.
    const wert = Number.parseInt(el.value, 10);
    entwurf(draft)[feld] = Number.isNaN(wert) ? MINDMAP_VORGABEN[feld] : wert;
  });
  return el;
}

function renderMindmapSection(container, draft) {
  entwurf(draft);
  const hinweis = document.createElement('p');
  hinweis.className = 'settings-hint';
  hinweis.textContent = t('settings.mindmap.hint');
  container.appendChild(hinweis);
  container.appendChild(
    buildSettingsRow(
      'settings.mindmap.layout',
      auswahl(
        'settings-mindmap-layout',
        MINDMAP_LAYOUTS,
        'settings.mindmap.layout',
        draft,
        'layout',
      ),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.mindmap.linienfuehrung',
      auswahl(
        'settings-mindmap-linien',
        MINDMAP_LINIENFUEHRUNGEN,
        'settings.mindmap.linienfuehrung',
        draft,
        'linienfuehrung',
      ),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.mindmap.farbEinfrierEbene',
      zahl('settings-mindmap-farbebene', draft, 'farbEinfrierEbene'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.mindmap.anfangsTiefe',
      zahl('settings-mindmap-tiefe', draft, 'anfangsTiefe'),
    ),
  );
  container.appendChild(
    buildSettingsRow(
      'settings.mindmap.hoechstBreite',
      zahl('settings-mindmap-breite', draft, 'hoechstBreite'),
    ),
  );
}

async function applyMindmapSection(draft) {
  if (!draft.mindmap) return;
  const gueltig = { ...MINDMAP_VORGABEN, ...normalisiereMindmapOptionen(draft.mindmap) };
  await api.setSetting(MINDMAP_SETTINGS_KEY, gueltig);
  applyMindmapVoreinstellung(gueltig);
  draft.mindmap = getMindmapVoreinstellung();
}

function dirtyMindmapSection(draft) {
  if (!draft.mindmap) return false;
  const gueltig = { ...MINDMAP_VORGABEN, ...normalisiereMindmapOptionen(draft.mindmap) };
  return !jsonEqual(gueltig, getMindmapVoreinstellung());
}

registerSettingsSection({
  id: 'mindmap',
  titleKey: 'settings.mindmap.title',
  render: renderMindmapSection,
  apply: applyMindmapSection,
  dirty: dirtyMindmapSection,
});
