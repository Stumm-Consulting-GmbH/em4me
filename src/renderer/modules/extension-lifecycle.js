// 4T-0292 (Epic 3E-0052): Renderer-Lebenszyklus des Erweiterungs-Systems.
//
// Hält den Schalt-Zustand der internen Erweiterungen im Fenster (rohe
// Disabled-Liste aus dem Store plus daraus berechneter effektiver
// Disabled-Satz inklusive Abhängigkeiten) und führt das Umschalten durch:
// Preload-Pipeline neu aufbauen (api.configureExtensions), Laufzeit-Hooks
// der betroffenen Erweiterungen rufen (activate/deactivate für UI-Mounts,
// angehängt über attachExtensionRuntime) und die Konsumenten über das
// Dokument-Event 'scg:extensions-changed' benachrichtigen (Re-Render,
// Dispatcher-/Keymap-Neuaufbau und Live-Rebuild hängen zyklenfrei in
// app-init.js — Muster 'scg:taskstates-changed').
//
// Bewusst KEIN Import aus App-Modulen (nur api.js und die Electron-freie
// Registry src/shared/extensions.js): Feature-Module können sich künftig
// während ihrer Modul-Body-Evaluierung hier anhängen — ein (transitiver)
// Rück-Import würde die Registrierung in der TDZ treffen (Begründung im
// Kopf-Kommentar von sidebar-layout.js). Der Persist-Helfer mit
// Statusbar-Feedback (persistSetting, views.js) wird deshalb zur Laufzeit
// von app-init.js angehängt; bis dahin gilt der schlanke api-Fallback.
'use strict';

import { api } from './api.js';
import {
  EXTENSIONS_DISABLED_KEY,
  effectiveDisabledSet,
  normalizeDisabledIds,
} from '../../shared/extensions.js';

let persistFn = async (key, value) => {
  try {
    await api.setSetting(key, value);
    return true;
  } catch (err) {
    console.warn('setSetting fehlgeschlagen:', key, err);
    return false;
  }
};

export function attachExtensionPersistence(fn) {
  if (typeof fn === 'function') persistFn = fn;
}

// --- Laufzeit-Zustand ---------------------------------------------------------------
// rawDisabled ist der persistierte Stand (nur bewusst deaktivierte IDs);
// effectiveDisabled enthält zusätzlich die abhängig mit-deaktivierten.
let rawDisabled = [];
let effectiveDisabled = new Set();

export function getDisabledExtensionIds() {
  return [...rawDisabled];
}

// Effektiver Aktiv-Zustand für Renderer-Konsumenten (Live-Modus-
// Dekorationen, UI-Guards). Unbekannte IDs sind Kern und immer aktiv.
export function isExtensionActive(id) {
  return !effectiveDisabled.has(id);
}

// --- Laufzeit-Hooks (attach-Muster) ---------------------------------------------------
// Feature-Module hängen pro Erweiterungs-ID ihre An-/Abmelde-Logik an
// (UI-Mounts wie Panels und Statusbar-Buttons, Index-Anmeldungen).
// deactivate läuft beim Übergang aktiv -> inaktiv, activate umgekehrt;
// beim Anhängen wird der Hook auf den aktuellen Zustand gebracht, falls
// die Erweiterung bereits effektiv deaktiviert ist.
const runtimeHooks = new Map(); // id -> { activate?, deactivate? }

export function attachExtensionRuntime(id, hooks) {
  if (typeof id !== 'string' || !hooks || typeof hooks !== 'object') return;
  runtimeHooks.set(id, hooks);
  if (effectiveDisabled.has(id) && typeof hooks.deactivate === 'function') {
    runHook(id, 'deactivate');
  }
}

function runHook(id, kind) {
  const hooks = runtimeHooks.get(id);
  const fn = hooks && hooks[kind];
  if (typeof fn !== 'function') return;
  // Isolation: ein fehlerhafter Einzel-Hook darf das Umschalten der
  // übrigen Erweiterungen nicht abbrechen (Entwicklungsrichtlinien §3).
  try {
    fn();
  } catch (err) {
    console.warn(`Erweiterungs-Hook ${kind} fehlgeschlagen:`, id, err);
  }
}

// --- Anwenden und Persistenz ----------------------------------------------------------
// Wendet eine Disabled-Liste an. Der Empfangspfad des Multi-Window-
// Broadcasts ruft mit { persist: false } auf (der Auslöser hat den Store
// bereits geschrieben). Unveränderter effektiver Zustand ist ein No-op
// (false); sonst true.
export async function applyExtensionsState(ids, { persist = true } = {}) {
  const nextRaw = normalizeDisabledIds(ids);
  const nextEffective = effectiveDisabledSet(nextRaw);
  const changed = [];
  for (const id of nextEffective) {
    if (!effectiveDisabled.has(id)) changed.push(id);
  }
  for (const id of effectiveDisabled) {
    if (!nextEffective.has(id)) changed.push(id);
  }
  const rawChanged = JSON.stringify(nextRaw) !== JSON.stringify(rawDisabled);
  if (changed.length === 0 && !rawChanged) return false;
  const prevEffective = effectiveDisabled;
  rawDisabled = nextRaw;
  effectiveDisabled = nextEffective;
  // Preload-Pipeline dem Schalt-Zustand nachführen (beide markdown-it-
  // Instanzen; idempotent, unveränderter Satz ist dort ein No-op).
  try {
    api.configureExtensions(nextRaw);
  } catch (err) {
    console.warn('configureExtensions (Preload) fehlgeschlagen:', err);
  }
  // Laufzeit-Hooks der Übergänge: erst Abmelden, dann Anmelden.
  for (const id of changed) {
    if (nextEffective.has(id)) runHook(id, 'deactivate');
    else if (prevEffective.has(id)) runHook(id, 'activate');
  }
  if (changed.length > 0) {
    document.dispatchEvent(new CustomEvent('scg:extensions-changed', { detail: { changed } }));
  }
  if (persist) await persistFn(EXTENSIONS_DISABLED_KEY, nextRaw);
  return true;
}

// App-Start: persistierten Stand laden und die Preload-Pipeline
// konfigurieren, bevor die Panes gerendert werden. Kein Event-Dispatch —
// der Erst-Render folgt ohnehin.
export async function initExtensionsFromStore() {
  let stored;
  try {
    stored = await api.getSetting(EXTENSIONS_DISABLED_KEY);
  } catch (err) {
    console.warn('extensions.disabled laden fehlgeschlagen:', err);
  }
  rawDisabled = normalizeDisabledIds(stored);
  effectiveDisabled = effectiveDisabledSet(rawDisabled);
  try {
    api.configureExtensions(rawDisabled);
  } catch (err) {
    console.warn('configureExtensions (Preload) fehlgeschlagen:', err);
  }
}

// Nur für Tests: Modul-Zustand zurücksetzen (überlebt sonst zwischen
// Testfällen desselben Imports).
export function resetExtensionStateForTests() {
  rawDisabled = [];
  effectiveDisabled = new Set();
  runtimeHooks.clear();
}
