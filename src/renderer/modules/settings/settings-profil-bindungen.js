// 4T-001160 (Epic 3E-000219, E13): Die Bindungs-Liste des Einstellungs-Bereichs
// «Eigenschafts-Profile» — je Zeile ein Profil mit seinen Schlagworten und
// Ordner-Pfaden.
//
// Eigene Datei, damit `settings-profiles.js` nicht ans Datei-Budget stößt;
// die Naht ist zugleich fachlich sauber: Dort steht die Konfiguration des
// Profil-ORDNERS, hier die der Zuordnungs-WEGE. Der Bereich selbst bleibt
// einer (Struktur-Prüfschritt der Konzept-Stufe, Kapitel 6.17: keine neue
// Einstellungs-Sektion).
//
// Der Schreibweg ist der vorhandene: Die Zeilen mutieren `values.bindings`,
// und `applyProfilesSection` schreibt die ganze Sektion über
// `profiles:setAreaConfig`. Die Normalisierung läuft dabei durch dieselbe
// Funktion wie im Datenpfad (`normalizeProfilesConfig`), damit Bedienfläche
// und Bereichsdatei nicht auseinanderlaufen.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { refreshSettingsButtons } from './settings-mount.js';

// Text-Liste einer Eingabe: durch Komma getrennt, getrimmt, ohne Leere.
// Bewusst dieselbe Form beim Lesen und Schreiben, damit die Zeile zeigt, was
// gespeichert wird.
function ausEingabe(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function alsEingabe(liste) {
  return (Array.isArray(liste) ? liste : []).join(', ');
}

// Eine Bindungs-Zeile: Profil-Auswahl, Schlagworte, Ordner-Pfade, Entfernen.
function baueZeile(bindung, values, neuRendern) {
  const zeile = document.createElement('div');
  zeile.className = 'settings-profil-bindung';

  // Profil: Auswahl aus den erkannten Profilen. Ein gebundener, aber nicht
  // gefundener Name bleibt als markierte Option erhalten — dieselbe Regel
  // wie beim Standard-Profil (AK4: die Bindung wird gekennzeichnet, nicht
  // stillschweigend verworfen).
  const profilSelect = document.createElement('select');
  profilSelect.className = 'settings-input settings-profil-bindung-profil';
  const namen = (Array.isArray(values.list) ? values.list : [])
    .filter((p) => !p.internal)
    .map((p) => p.name);
  for (const name of namen) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    profilSelect.appendChild(opt);
  }
  if (bindung.profile && !namen.includes(bindung.profile)) {
    const opt = document.createElement('option');
    opt.value = bindung.profile;
    opt.textContent = t('settings.profiles.bindingProfileMissing').replace(
      '{name}',
      bindung.profile,
    );
    opt.className = 'is-missing';
    profilSelect.appendChild(opt);
  }
  profilSelect.value = bindung.profile || '';
  profilSelect.addEventListener('change', () => {
    bindung.profile = profilSelect.value;
    refreshSettingsButtons();
  });

  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.className = 'settings-input';
  tagsInput.placeholder = t('settings.profiles.bindingTagsPlaceholder');
  tagsInput.value = alsEingabe(bindung.tags);
  tagsInput.addEventListener('input', () => {
    bindung.tags = ausEingabe(tagsInput.value);
  });

  const ordnerInput = document.createElement('input');
  ordnerInput.type = 'text';
  ordnerInput.className = 'settings-input';
  ordnerInput.placeholder = t('settings.profiles.bindingFoldersPlaceholder');
  ordnerInput.value = alsEingabe(bindung.folders);
  ordnerInput.addEventListener('input', () => {
    bindung.folders = ausEingabe(ordnerInput.value);
  });

  // Ordner-Auswahl über denselben Wähler wie der Profil-Ordner; die Auswahl
  // wird wurzel-relativ abgelegt (umzugsfest) und an die Liste angehängt.
  const waehlen = document.createElement('button');
  waehlen.type = 'button';
  waehlen.className = 'btn';
  waehlen.textContent = t('settings.profiles.bindingFolderBrowse');
  waehlen.addEventListener('click', async () => {
    let result;
    try {
      result = await api.profilesChooseFolder();
    } catch {
      result = null;
    }
    if (!result || !result.ok || !result.path) return;
    let wert = result.path;
    if (state.areaPath) {
      const rel = api.relative(state.areaPath, result.path);
      if (rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) wert = rel;
    }
    const liste = ausEingabe(ordnerInput.value);
    if (!liste.includes(wert)) liste.push(wert);
    ordnerInput.value = liste.join(', ');
    bindung.folders = liste;
    // Mutation nach dem await — Dirty-Erkennung explizit nachziehen (4T-000554).
    refreshSettingsButtons();
  });

  const entfernen = document.createElement('button');
  entfernen.type = 'button';
  entfernen.className = 'btn settings-profil-bindung-entfernen';
  entfernen.textContent = t('settings.profiles.bindingRemove');
  entfernen.title = t('settings.profiles.bindingRemove');
  entfernen.addEventListener('click', () => {
    const idx = values.bindings.indexOf(bindung);
    if (idx >= 0) values.bindings.splice(idx, 1);
    neuRendern();
    refreshSettingsButtons();
  });

  const ordnerWrap = document.createElement('div');
  ordnerWrap.className = 'settings-templates-folder-row';
  ordnerWrap.append(ordnerInput, waehlen);

  zeile.append(profilSelect, tagsInput, ordnerWrap, entfernen);
  return zeile;
}

/**
 * Rendert die Bindungs-Liste in den Einstellungs-Bereich.
 *
 * @param {HTMLElement} container Der Bereichs-Container.
 * @param {object} values Der Entwurfs-Zustand (`draft.profiles`).
 */
export function renderBindungen(container, values) {
  if (!Array.isArray(values.bindings)) values.bindings = [];

  const heading = document.createElement('h4');
  heading.className = 'settings-export-group-title';
  heading.textContent = t('settings.profiles.bindingsHeading');
  container.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint';
  hint.textContent = t('settings.profiles.bindingsHint');
  container.appendChild(hint);

  const liste = document.createElement('div');
  liste.className = 'settings-profil-bindungen';
  container.appendChild(liste);

  const neuRendern = () => {
    liste.innerHTML = '';
    if (values.bindings.length === 0) {
      const leer = document.createElement('p');
      leer.className = 'settings-row-hint';
      leer.textContent = t('settings.profiles.bindingsEmpty');
      liste.appendChild(leer);
      return;
    }
    const kopf = document.createElement('div');
    kopf.className = 'settings-profil-bindung settings-profil-bindung-kopf';
    for (const key of [
      'settings.profiles.bindingProfileLabel',
      'settings.profiles.bindingTagsLabel',
      'settings.profiles.bindingFoldersLabel',
    ]) {
      const span = document.createElement('span');
      span.textContent = t(key);
      kopf.appendChild(span);
    }
    kopf.appendChild(document.createElement('span'));
    liste.appendChild(kopf);
    for (const bindung of values.bindings) {
      liste.appendChild(baueZeile(bindung, values, neuRendern));
    }
  };
  neuRendern();

  const hinzu = document.createElement('button');
  hinzu.type = 'button';
  hinzu.id = 'settings-profiles-binding-add';
  hinzu.className = 'btn';
  hinzu.textContent = t('settings.profiles.bindingAdd');
  hinzu.addEventListener('click', () => {
    values.bindings.push({ profile: '', tags: [], folders: [] });
    neuRendern();
    refreshSettingsButtons();
  });
  container.appendChild(hinzu);
}
