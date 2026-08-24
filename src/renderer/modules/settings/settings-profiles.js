// 4T-0450 (Epic 3E-0083): Bereich „Eigenschafts-Profile" (Profil-Ordner,
// Zuordnungs-Feld, Standard-Profil und Profil-Liste der Bereichsdatei).
'use strict';

import { normalizeProfilesConfig } from '../../../shared/property-profiles.js';
import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { openOrJumpToPath } from '../bookmarks/bookmarks.js';
import { showStatusbarHint } from '../views/views.js';
import { refreshSettingsButtons, renderActiveSection } from './settings-mount.js';
import { buildSettingsRow, jsonEqual, pageState } from './settings-shared.js';
// 4T-1160 (Epic 3E-0219, E13): Die Bindungs-Liste der Zuordnungs-Wege liegt
// in einem eigenen Modul (Datei-Budget); der Bereich bleibt einer.
import { renderBindungen } from './settings-profil-bindungen.js';

// Spiegelt applyProfilesSection (normalisierte Konfiguration gegen den
// Snapshot).
export function dirtyProfilesSection(draft) {
  const values = draft.profiles;
  if (!values || !values.hasArea) return false;
  const out = normalizeProfilesConfig({
    folder: values.folder,
    assignField: values.assignField,
    defaultProfile: values.defaultProfile,
    bindings: values.bindings,
  });
  return !jsonEqual(out, draft.profilesSnapshot);
}

// --- Bereich Eigenschafts-Profile (4T-0450, Epic 3E-0083) -------------------------
// propertyProfiles-Sektion der Bereichsdatei (Profil-Ordner, Zuordnungs-
// Feldname, Standard-Profil) plus Liste der erkannten Profile mit
// Definitions-Anzahl und Validierungs-Hinweisen. Nur bei Fenstern mit
// Bereich; persistiert wird bei Anwenden/OK über profiles:setAreaConfig,
// dessen Broadcast die Editoren ohne Neustart nachzieht (4T-0448/4T-0449).

export async function readProfilesFromConfig() {
  let result;
  try {
    result = await api.profilesList();
  } catch {
    result = null;
  }
  const config = result && result.config ? result.config : null;
  const part = {
    folder: config && config.folder ? config.folder : '',
    assignField: config ? config.assignField : '',
    defaultProfile: config && config.defaultProfile ? config.defaultProfile : '',
    // 4T-1160: Bindungen als eigene Kopie in den Entwurf — die Zeilen
    // mutieren sie, und der Snapshot muss davon unberührt bleiben.
    bindings:
      config && Array.isArray(config.bindings)
        ? config.bindings.map((b) => ({
            profile: b.profile,
            tags: [...(b.tags || [])],
            folders: [...(b.folders || [])],
          }))
        : [],
  };
  return {
    draft: {
      hasArea: !!(result && result.hasArea),
      areaName: (result && result.areaName) || '',
      ...part,
      folderMissing: !!(result && result.folderMissing),
      list: result && Array.isArray(result.profiles) ? result.profiles : [],
    },
    snapshot: normalizeProfilesConfig(part),
  };
}

// 4T-1143 (Epic 3E-0218, E4): Lokalisierter Text eines Validierungs-
// Hinweises. Die Meldung je Code ist ein ganzer Satz mit {ort} und, wo eine
// konkrete Erwartung besteht, {expected}; der Ort entsteht aus zwei eigenen
// Schlüsseln (oberste Ebene bzw. Kind-Definition mit ihrem Pfad zum
// Eltern-Feld, {index} 1-basiert). Profil-Ebene-Meldungen (yaml, extends…)
// tragen keinen {ort} und höchstens {name}.
function profileErrorText(err) {
  let text = t('settings.profiles.error.' + err.code);
  if (text.includes('{ort}')) {
    const child = Array.isArray(err.path) && err.path.length > 0;
    const ort = t(child ? 'settings.profiles.hintLocationChild' : 'settings.profiles.hintLocation')
      .replace('{index}', String((typeof err.index === 'number' ? err.index : -1) + 1))
      .replace('{name}', err.name || '—')
      .replace('{path}', child ? err.path.join(' › ') : '');
    text = text.replace('{ort}', ort);
  } else {
    text = text.replace('{name}', err.name || '—');
  }
  if (text.includes('{expected}')) {
    const expected = Array.isArray(err.expected)
      ? err.expected.join(', ')
      : err.expected === null || err.expected === undefined
        ? ''
        : String(err.expected);
    text = text.replace('{expected}', expected);
  }
  return text;
}

// Profil-Liste des Bereichs frisch laden und den Bereich neu rendern
// (Aktualisieren-Button und Nachzug nach dem Anwenden).
async function refreshProfilesList(values) {
  let result;
  try {
    result = await api.profilesList();
  } catch {
    result = null;
  }
  if (!pageState.draft || pageState.draft.profiles !== values) return;
  values.list = result && Array.isArray(result.profiles) ? result.profiles : [];
  values.folderMissing = !!(result && result.folderMissing);
  if (pageState.activeSectionId === 'propertyProfiles') renderActiveSection();
}

export function renderProfilesSection(container, draft) {
  const values = draft.profiles;
  if (!values) {
    const loading = document.createElement('p');
    loading.className = 'settings-row-hint';
    loading.textContent = t('settings.profiles.loading');
    container.appendChild(loading);
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.profiles.intro');
  container.appendChild(intro);
  if (!values.hasArea) {
    const hint = document.createElement('p');
    hint.className = 'settings-row-hint';
    hint.textContent = t('settings.profiles.noArea');
    container.appendChild(hint);
    return;
  }

  // Profil-Ordner (wurzel-relativ; OS-Auswahl wie beim Vorlagen-Ordner).
  const folderWrap = document.createElement('div');
  folderWrap.className = 'settings-templates-folder-row';
  const folderInput = document.createElement('input');
  folderInput.type = 'text';
  folderInput.id = 'settings-profiles-folder';
  folderInput.className = 'settings-input settings-templates-folder';
  folderInput.placeholder = t('settings.profiles.folderPlaceholder');
  folderInput.value = values.folder;
  folderInput.addEventListener('input', () => {
    values.folder = folderInput.value;
  });
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.id = 'settings-profiles-folder-browse';
  browseBtn.className = 'btn';
  browseBtn.textContent = t('settings.profiles.folderBrowse');
  browseBtn.addEventListener('click', async () => {
    let result;
    try {
      result = await api.profilesChooseFolder();
    } catch {
      result = null;
    }
    if (!result || !result.ok || !result.path) return;
    // Auswahl innerhalb des Bereichs wurzel-relativ speichern (umzugsfest);
    // außerhalb bleibt der absolute Pfad (die Bereichs-Grenze weist ihn
    // beim Lesen ab, sichtbar über den Ordner-fehlt-Hinweis).
    let value = result.path;
    if (state.areaPath) {
      const rel = api.relative(state.areaPath, result.path);
      if (rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) value = rel;
    }
    values.folder = value;
    folderInput.value = value;
    // Mutation nach dem await — Dirty-Erkennung explizit nachziehen (4T-0554).
    refreshSettingsButtons();
  });
  const folderRow = document.createElement('div');
  folderRow.className = 'settings-row';
  const folderLabel = document.createElement('label');
  folderLabel.htmlFor = folderInput.id;
  folderLabel.textContent = t('settings.profiles.folderLabel');
  folderWrap.append(folderInput, browseBtn);
  folderRow.append(folderLabel, folderWrap);
  container.appendChild(folderRow);

  // Zuordnungs-Feldname (leer = Default class).
  const assignInput = document.createElement('input');
  assignInput.type = 'text';
  assignInput.id = 'settings-profiles-assign-field';
  assignInput.className = 'settings-input';
  assignInput.placeholder = t('settings.profiles.assignFieldPlaceholder');
  assignInput.value = values.assignField;
  assignInput.addEventListener('input', () => {
    values.assignField = assignInput.value;
  });
  container.appendChild(buildSettingsRow('settings.profiles.assignFieldLabel', assignInput));

  // Standard-Profil (Auswahl aus den erkannten Profilen; ein konfigurierter,
  // aber nicht gefundener Name bleibt als markierte Option erhalten).
  const defaultSelect = document.createElement('select');
  defaultSelect.id = 'settings-profiles-default';
  defaultSelect.className = 'settings-input';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = t('settings.profiles.defaultProfileNone');
  defaultSelect.appendChild(noneOpt);
  // 4T-0517: interne Profile (Ereignis) stehen nicht zur Wahl als
  // bereichsweites Standard-Profil — sie sind an ihr Zuordnungs-Feld
  // gebunden (PO-Freigabe 2026-07-15).
  const names = values.list.filter((p) => !p.internal).map((p) => p.name);
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    defaultSelect.appendChild(opt);
  }
  if (values.defaultProfile && !names.includes(values.defaultProfile)) {
    const opt = document.createElement('option');
    opt.value = values.defaultProfile;
    opt.textContent = t('settings.profiles.defaultProfileMissing').replace(
      '{name}',
      values.defaultProfile,
    );
    defaultSelect.appendChild(opt);
  }
  defaultSelect.value = values.defaultProfile || '';
  defaultSelect.addEventListener('change', () => {
    values.defaultProfile = defaultSelect.value;
  });
  container.appendChild(buildSettingsRow('settings.profiles.defaultProfileLabel', defaultSelect));

  // 4T-1160 (E13): Bindungen an Schlagwort und Ordner. Sie stehen zwischen
  // der Grund-Konfiguration und der Profil-Liste, weil sie zur Konfiguration
  // gehören und die Liste den angewendeten Stand zeigt.
  renderBindungen(container, values);

  // Liste der erkannten Profile (angewendeter Stand der Bereichsdatei).
  const listHeading = document.createElement('h4');
  listHeading.className = 'settings-export-group-title';
  listHeading.textContent = t('settings.profiles.listHeading');
  container.appendChild(listHeading);
  const listHint = document.createElement('p');
  listHint.className = 'settings-row-hint';
  listHint.textContent = t('settings.profiles.listHint');
  container.appendChild(listHint);
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.id = 'settings-profiles-refresh';
  refreshBtn.className = 'btn';
  refreshBtn.textContent = t('settings.profiles.listRefresh');
  refreshBtn.addEventListener('click', () => void refreshProfilesList(values));
  container.appendChild(refreshBtn);
  // 4T-0517: interne Profile erscheinen auch ohne (oder bei fehlendem)
  // Profil-Ordner — die Hinweise bleiben, die Liste rendert trotzdem,
  // sobald sie Einträge hat.
  if (values.folderMissing) {
    const missing = document.createElement('p');
    missing.className = 'settings-row-hint';
    missing.textContent = t('settings.profiles.folderMissing');
    container.appendChild(missing);
    if (values.list.length === 0) return;
  } else if (values.list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-row-hint';
    empty.textContent = t('settings.profiles.listEmpty');
    container.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'settings-profiles-list';
  for (const profile of values.list) {
    const row = document.createElement('div');
    row.className = profile.internal
      ? 'settings-profiles-item is-internal'
      : 'settings-profiles-item';
    if (profile.internal) {
      // Internes Profil: nicht änderbar, nicht löschbar — Name ohne
      // Öffnen-Affordanz (keine Datei dahinter).
      const nameSpan = document.createElement('span');
      nameSpan.className = 'settings-profiles-item-name-static';
      nameSpan.textContent = profile.name;
      row.appendChild(nameSpan);
    } else {
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'settings-profiles-item-name';
      openBtn.textContent = profile.name;
      openBtn.title = t('settings.profiles.openFile');
      openBtn.addEventListener('click', () => void openOrJumpToPath(profile.path));
      row.appendChild(openBtn);
    }
    const meta = document.createElement('span');
    meta.className = 'settings-profiles-item-meta';
    const parts = [
      t('settings.profiles.fieldCount').replace('{count}', String(profile.fieldCount)),
    ];
    if (profile.internal) parts.push(t('settings.profiles.internalProfile'));
    if (profile.errors.length > 0) {
      parts.push(
        t('settings.profiles.hintCount').replace('{count}', String(profile.errors.length)),
      );
    }
    meta.textContent = parts.join(' · ');
    if (profile.errors.length > 0) meta.classList.add('has-errors');
    row.appendChild(meta);
    list.appendChild(row);
    // 4T-1143 (E4): Hinweise stehen ausgeschrieben unter ihrem Profil, in
    // der Reihenfolge der Definitionen; die Kurzinfo entfällt, weil der
    // Text sichtbar ist. Zähler und Hervorhebung der Zeile bleiben.
    if (profile.errors.length > 0) {
      const hints = document.createElement('ul');
      hints.className = 'settings-profiles-item-hints';
      for (const err of profile.errors) {
        const item = document.createElement('li');
        item.textContent = profileErrorText(err);
        hints.appendChild(item);
      }
      list.appendChild(hints);
    }
  }
  container.appendChild(list);
}

export async function applyProfilesSection(draft) {
  const values = draft.profiles;
  if (!values || !values.hasArea) return;
  const out = normalizeProfilesConfig({
    folder: values.folder,
    assignField: values.assignField,
    defaultProfile: values.defaultProfile,
    bindings: values.bindings,
  });
  if (JSON.stringify(out) === JSON.stringify(draft.profilesSnapshot)) return;
  let result;
  try {
    result = await api.profilesSetAreaConfig(out);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    // Defekte Bereichsdatei wird nie überschrieben; sichtbarer Hinweis.
    showStatusbarHint(null, {
      text: t('settings.profiles.areaWriteFailed'),
      error: true,
      duration: 4000,
    });
    return;
  }
  draft.profilesSnapshot = out;
  // Profil-Liste auf den frisch angewendeten Stand ziehen.
  void refreshProfilesList(values);
}
