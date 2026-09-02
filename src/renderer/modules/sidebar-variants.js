// 4T-000624 (Epic 3E-000119): Benannte Sidebar-Varianten — Laufzeit-Zustand,
// Lebenszyklus (speichern, anwenden, umbenennen, überschreiben, löschen)
// und die beiden Dialoge (Namens-Dialog, Auswahl-Popup).
//
// Eine Variante friert die Anordnung (Layout-Modell) UND die Roh-
// Sichtbarkeit der Panels beider Spalten ein (PO-Entscheidung 2026-07-17).
// Anwenden ersetzt den einen Arbeits-Zustand `sidebar.layout` (die
// Normalisierung läuft dabei gegen die aktuelle Panel-Menge, alte
// Varianten überleben so Panel-Zu- und -Abgänge) und schaltet die
// Sichtbarkeit über die regulären Panel-Toggles nach; spätere Umbauten
// ändern die Variante nicht („Überschreiben" ist der explizite Rückweg).
//
// Ablage der globalen Liste im Einstellungs-Store unter
// `sidebar.layoutVariants`; der Main broadcastet Änderungen an alle
// Fenster (Kanal `sidebarLayoutVariants:changed`, Muster sidebar.layout).
// Innerhalb eines Fensters meldet das Dokument-Event
// `scg:sidebar-variants-changed` jede Listen-Änderung (Einstellungs-UI,
// Menü-Meldung).
'use strict';

import { normalizeSidebarVariantList } from '../../shared/sidebar-variants.js';
import { api } from './app/api.js';
import { state } from './app/app-state.js';
import { t } from '../i18n.js';
import { showNameInputDialog } from './dialogs/dialogs.js';
import {
  applySidebarLayout,
  getSidebarLayout,
  knownPanelIds,
  sidebarPanelById,
} from './sidebar-layout.js';
import {
  panelRawVisible,
  reportMenuStateNow,
  setSidebarVariantsMenuProvider,
} from './tabs/tabs.js';
import { persistSetting } from './views/views.js';

let globalVariants = [];

// 4T-000625 (Epic 3E-000119): Bereichs-Varianten — Liste aus der
// sidebarLayouts-Sektion der Bereichsdatei des Fenster-Bereichs, dazu der
// Bereichs-Kontext (hasArea/areaName) aus derselben IPC-Antwort. Ohne
// Bereich bleibt die Liste leer und die Bereichs-Gruppe entfällt überall.
let areaVariants = [];
let areaHasArea = false;
let areaName = null;

// Eindeutige IDs nach dem Muster der Farbschemas (settings-page.js).
let variantIdCounter = 0;
function nextVariantId() {
  variantIdCounter += 1;
  return `variant-${Date.now()}-${variantIdCounter}`;
}

function fireChanged() {
  document.dispatchEvent(new CustomEvent('scg:sidebar-variants-changed'));
  // 4T-000626 (Epic 3E-000119): jede Listen-Änderung zieht das Untermenü
  // „Sidebar-Anordnungen" nach (Meldeweg-Muster 3E-000104).
  reportMenuStateNow();
}

async function persistGlobalVariants() {
  await persistSetting('sidebar.layoutVariants', globalVariants.map(cloneVariant));
  fireChanged();
}

function cloneVariant(variant) {
  return JSON.parse(JSON.stringify(variant));
}

export function getGlobalVariants() {
  return globalVariants;
}

export function getAreaVariants() {
  return areaVariants;
}

export function hasAreaVariantContext() {
  return areaHasArea;
}

export function areaVariantAreaName() {
  return areaName;
}

// Gruppen-Beschriftung „Bereich <Name>" (Menü, Verwaltung, Picker).
export function areaGroupLabel() {
  return t('sidebarVariants.areaGroup').replace('{name}', areaName || '');
}

// 4T-000625: Bereichs-Varianten des Fensters frisch laden (Bereichs-Wechsel
// über onWindowDisplayInfo, Broadcast sidebarVariants:changed, eigener
// Schreib-Erfolg). Feuert das Änderungs-Event nur bei echter Änderung
// (JSON-Vergleich, Muster refreshProfileResolution).
export async function refreshAreaVariants() {
  if (typeof api.sidebarVariantsGetConfig !== 'function') return;
  let res;
  try {
    res = await api.sidebarVariantsGetConfig();
  } catch (err) {
    console.warn('Bereichs-Varianten laden fehlgeschlagen:', err);
    return;
  }
  const nextHasArea = !!(res && res.hasArea);
  const nextName = res && res.areaName ? res.areaName : null;
  const nextList = normalizeSidebarVariantList(res ? res.config : []);
  const changed =
    nextHasArea !== areaHasArea ||
    nextName !== areaName ||
    JSON.stringify(nextList) !== JSON.stringify(areaVariants);
  areaHasArea = nextHasArea;
  areaName = nextName;
  areaVariants = nextList;
  if (changed) fireChanged();
}

// Bereichs-Liste in die Bereichsdatei schreiben und den lokalen Stand
// nachziehen (der Broadcast erreicht zusätzlich alle übrigen Fenster).
async function persistAreaVariants(nextList) {
  if (typeof api.sidebarVariantsSetAreaConfig !== 'function') return false;
  let res;
  try {
    res = await api.sidebarVariantsSetAreaConfig(nextList.map(cloneVariant));
  } catch (err) {
    console.warn('Bereichs-Varianten schreiben fehlgeschlagen:', err);
    return false;
  }
  if (!res || res.ok === false) {
    console.warn('Bereichs-Varianten schreiben abgelehnt:', res && res.error);
    return false;
  }
  areaVariants = normalizeSidebarVariantList(res.config);
  fireChanged();
  return true;
}

export async function saveAreaVariant(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '' || !areaHasArea) return null;
  const data = captureCurrentVariantData();
  const next = areaVariants.map(cloneVariant);
  const existing = next.find((v) => v.name === trimmed);
  if (existing) {
    existing.layout = data.layout;
    existing.visibility = data.visibility;
  } else {
    next.push({ id: nextVariantId(), name: trimmed, ...data });
  }
  const ok = await persistAreaVariants(next);
  return ok ? areaVariants.find((v) => v.name === trimmed) || null : null;
}

export async function renameAreaVariant(id, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const next = areaVariants.map(cloneVariant);
  const variant = next.find((v) => v.id === id);
  if (!variant || trimmed === '' || variant.name === trimmed) return false;
  variant.name = trimmed;
  return persistAreaVariants(next);
}

export async function overwriteAreaVariant(id) {
  const next = areaVariants.map(cloneVariant);
  const variant = next.find((v) => v.id === id);
  if (!variant) return false;
  const data = captureCurrentVariantData();
  variant.layout = data.layout;
  variant.visibility = data.visibility;
  return persistAreaVariants(next);
}

export async function deleteAreaVariant(id) {
  const next = areaVariants.filter((v) => v.id !== id).map(cloneVariant);
  if (next.length === areaVariants.length) return false;
  return persistAreaVariants(next);
}

export function findAreaVariantById(id) {
  return areaVariants.find((v) => v.id === id) || null;
}

// App-Start: persistierte Liste laden (Muster loadSidebarPanelHeights).
export async function initSidebarVariantsFromStore() {
  let stored;
  try {
    stored = await api.getSetting('sidebar.layoutVariants');
  } catch (err) {
    console.warn('Sidebar-Varianten laden fehlgeschlagen:', err);
  }
  globalVariants = normalizeSidebarVariantList(stored);
}

// Empfangspfad des Multi-Window-Broadcasts (der Auslöser hat den Store
// bereits geschrieben — kein erneutes Persistieren).
export function setGlobalVariantsFromBroadcast(value) {
  globalVariants = normalizeSidebarVariantList(value);
  fireChanged();
}

// Snapshot der aktuellen Anordnung: Layout-Modell plus Roh-Sichtbarkeit
// beider Spalten für jedes bekannte Panel.
export function captureCurrentVariantData() {
  const visibility = {};
  for (const id of knownPanelIds()) {
    visibility[id] = [panelRawVisible(id, 0), panelRawVisible(id, 1)];
  }
  return { layout: JSON.parse(JSON.stringify(getSidebarLayout())), visibility };
}

// Speichern aus der aktuellen Anordnung. Existiert in der Liste bereits
// eine Variante gleichen Namens, wird sie überschrieben (Speichern unter
// demselben Namen ist der natürliche Aktualisierungs-Weg); sonst entsteht
// ein neuer Eintrag.
export async function saveGlobalVariant(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') return null;
  const data = captureCurrentVariantData();
  const existing = globalVariants.find((v) => v.name === trimmed);
  let saved;
  if (existing) {
    existing.layout = data.layout;
    existing.visibility = data.visibility;
    saved = existing;
  } else {
    saved = { id: nextVariantId(), name: trimmed, ...data };
    globalVariants.push(saved);
  }
  await persistGlobalVariants();
  return saved;
}

export async function renameGlobalVariant(id, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const variant = globalVariants.find((v) => v.id === id);
  if (!variant || trimmed === '' || variant.name === trimmed) return false;
  variant.name = trimmed;
  await persistGlobalVariants();
  return true;
}

export async function overwriteGlobalVariant(id) {
  const variant = globalVariants.find((v) => v.id === id);
  if (!variant) return false;
  const data = captureCurrentVariantData();
  variant.layout = data.layout;
  variant.visibility = data.visibility;
  await persistGlobalVariants();
  return true;
}

export async function deleteGlobalVariant(id) {
  const before = globalVariants.length;
  globalVariants = globalVariants.filter((v) => v.id !== id);
  if (globalVariants.length === before) return false;
  await persistGlobalVariants();
  return true;
}

// Anwenden: Layout ersetzen (normalisiert, persistiert, broadcastet) und
// die Roh-Sichtbarkeit über die regulären Panel-Toggles der vorhandenen
// Panes nachziehen (der Toggle-Pfad der Module persistiert und meldet den
// Menü-Stand selbst). Sichtbarkeits-Einträge unbekannter Panels entfallen.
export async function applySidebarVariant(variant) {
  if (!variant) return false;
  await applySidebarLayout(variant.layout);
  const visibility = variant.visibility || {};
  for (const [id, cols] of Object.entries(visibility)) {
    const def = sidebarPanelById(id);
    if (!def || typeof def.toggle !== 'function' || !Array.isArray(cols)) continue;
    for (let paneIdx = 0; paneIdx < state.panes.length && paneIdx < 2; paneIdx++) {
      const desired = cols[paneIdx];
      if (typeof desired !== 'boolean') continue;
      if (panelRawVisible(id, paneIdx) !== desired) def.toggle(paneIdx);
    }
  }
  return true;
}

export function findGlobalVariantById(id) {
  return globalVariants.find((v) => v.id === id) || null;
}

// --- Dialoge -----------------------------------------------------------------

// Namens-Dialog für „Aktuelle Anordnung als Variante speichern".
// Gleicher Name wie eine bestehende Variante desselben Geltungsbereichs
// überschreibt diese (siehe saveGlobalVariant/saveAreaVariant); der Dialog
// validiert nur den leeren Namen. 4T-000625: bei geöffnetem Bereich wählt
// eine Checkbox das Ziel (global oder Bereichsdatei); Namens-Kollisionen
// zwischen den Geltungsbereichen sind erlaubt (Epic-Entscheidung 3).
export async function showSaveVariantDialog() {
  const opts = {
    title: t('sidebarVariants.saveDialogTitle'),
    placeholder: t('sidebarVariants.namePlaceholder'),
    validate: (value) => (value === '' ? 'sidebarVariants.errorEmptyName' : null),
  };
  if (areaHasArea) {
    opts.checkboxes = [
      {
        id: 'area',
        label: t('sidebarVariants.saveToArea').replace('{name}', areaName || ''),
        checked: false,
      },
    ];
  }
  const result = await showNameInputDialog(opts);
  if (result == null) return null;
  if (typeof result === 'string') return saveGlobalVariant(result);
  if (result.checkboxes && result.checkboxes.area) return saveAreaVariant(result.value);
  return saveGlobalVariant(result.value);
}

// 4T-000625: Speichern-Dialog der Bereichs-Sektion — legt direkt im
// geöffneten Bereich ab (ohne Ziel-Option; PO-Testbefund 0.77.0: die
// Bereichs-Verwaltung liegt in der Einstellungs-Gruppe „Aktueller
// Bereich" mit eigenem Speichern-Knopf).
export async function showSaveAreaVariantDialog() {
  if (!areaHasArea) return null;
  const name = await showNameInputDialog({
    title: t('sidebarVariants.saveDialogTitle'),
    placeholder: t('sidebarVariants.namePlaceholder'),
    validate: (value) => (value === '' ? 'sidebarVariants.errorEmptyName' : null),
  });
  if (name == null) return null;
  return saveAreaVariant(name);
}

// Umbenennen-Dialog: lehnt leere und im selben Geltungsbereich bereits
// vergebene Namen ab (das stille Zusammenlegen zweier Varianten wäre beim
// Umbenennen ein wahrscheinliches Versehen). scope: 'global' | 'area'.
export async function showRenameVariantDialog(variant, scope = 'global') {
  const list = scope === 'area' ? areaVariants : globalVariants;
  const name = await showNameInputDialog({
    title: t('sidebarVariants.renameDialogTitle'),
    initialValue: variant.name,
    placeholder: t('sidebarVariants.namePlaceholder'),
    validate: (value) => {
      if (value === '') return 'sidebarVariants.errorEmptyName';
      const other = list.find((v) => v.name === value && v.id !== variant.id);
      return other ? 'sidebarVariants.errorDuplicateName' : null;
    },
  });
  if (name == null) return false;
  return scope === 'area'
    ? renameAreaVariant(variant.id, name)
    : renameGlobalVariant(variant.id, name);
}

// Auswahl-Popup (Muster showTemplatePickerDialog): filterbare Liste mit
// Gruppen-Überschrift, Pfeil-Navigation, Enter wählt, Esc/Backdrop bricht
// ab. Einträge: [{ variant, group }].
function showVariantPickerDialog(entries) {
  const modal = document.querySelector('#sidebar-variant-picker-modal');
  const filterInput = document.querySelector('#sidebar-variant-picker-filter');
  const list = document.querySelector('#sidebar-variant-picker-list');
  const btnCancel = document.querySelector('#btn-sidebar-variant-picker-cancel');
  if (!modal || !list) return Promise.resolve(null);

  return new Promise((resolve) => {
    let activeIdx = 0;
    let visible = [];

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      filterInput.removeEventListener('input', renderList);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onCancel = () => finish(null);

    const setActive = (idx) => {
      activeIdx = Math.max(0, Math.min(idx, visible.length - 1));
      const buttons = list.querySelectorAll('button');
      buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
      const current = buttons[activeIdx];
      if (current) current.scrollIntoView({ block: 'nearest' });
    };

    const renderList = () => {
      const needle = filterInput.value.trim().toLowerCase();
      visible = entries.filter(
        (e) => needle === '' || e.variant.name.toLowerCase().includes(needle),
      );
      list.innerHTML = '';
      let lastGroup = null;
      visible.forEach((entry, idx) => {
        if (entry.group !== lastGroup && entry.group !== '') {
          const groupLi = document.createElement('li');
          groupLi.className = 'template-picker-group';
          groupLi.textContent = entry.group;
          list.appendChild(groupLi);
        }
        lastGroup = entry.group;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = entry.variant.name;
        btn.addEventListener('click', () => finish(entry));
        btn.addEventListener('mousemove', () => setActive(idx));
        li.appendChild(btn);
        list.appendChild(li);
      });
      if (visible.length === 0) {
        const li = document.createElement('li');
        li.className = 'template-picker-empty';
        li.textContent = t('sidebarVariants.picker.noMatch');
        list.appendChild(li);
      }
      setActive(0);
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIdx - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (visible[activeIdx]) finish(visible[activeIdx]);
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    filterInput.value = '';
    filterInput.placeholder = t('sidebarVariants.picker.filterPlaceholder');
    renderList();
    modal.addEventListener('keydown', onKeydown, true);
    filterInput.addEventListener('input', renderList);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    modal.hidden = false;
    setTimeout(() => filterInput.focus(), 0);
  });
}

// 4T-000626 (Epic 3E-000119): Provider der Menü-Listen — der Renderer meldet
// die effektiven Varianten (global plus Bereich) im Menü-State, der Main
// baut daraus das Untermenü „Sidebar-Anordnungen" (kein zweiter
// Mechanismus). Registrierung beim Modul-Laden per Injektion (Zyklus-
// Vermeidung, siehe setSidebarVariantsMenuProvider in tabs.js).
setSidebarVariantsMenuProvider(() => ({
  global: globalVariants.map((v) => ({ id: v.id, name: v.name })),
  area: areaHasArea ? areaVariants.map((v) => ({ id: v.id, name: v.name })) : [],
  areaName: areaHasArea ? areaName : null,
}));

// Kommando `sidebar.applyVariant`: Auswahl-Popup über alle Varianten
// (globale Gruppe plus Bereichs-Gruppe bei geöffnetem Bereich), die
// gewählte anwenden.
export async function showApplyVariantPicker() {
  const entries = globalVariants.map((variant) => ({
    variant,
    group: t('sidebarVariants.globalGroup'),
  }));
  if (areaHasArea) {
    for (const variant of areaVariants) {
      entries.push({ variant, group: areaGroupLabel() });
    }
  }
  const chosen = await showVariantPickerDialog(entries);
  if (!chosen) return false;
  return applySidebarVariant(chosen.variant);
}
