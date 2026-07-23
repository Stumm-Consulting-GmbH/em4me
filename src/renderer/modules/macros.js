// 4T-0522 (Epic 3E-0094): Makros der Kommando-Platzierung im Renderer.
//
// Registriert jedes konfigurierte Makro als reguläres Registry-Kommando
// (registerDynamicCommand, Namensraum macro.<id>) — damit sind Makros
// ohne Sonderpfad kürzel-fähig (Tastenkürzel-Editor), palette-findbar
// und über Statusbar-Buttons und Kontextmenü-Sektion platzierbar. Die
// Klartext-Namen werden über den Laufzeit-Übersetzungs-Mechanismus der
// Erweiterungs-i18n als synthetische Keys aufgelöst (Muster
// contributionTitleKey im extension-host). Die Ausführung übernimmt der
// reine Runner (shared/macro-runner.js) mit executeCommandById als
// Schritt-Ausführung; ein Abbruch zeigt den Statusbar-Hinweis. Kein
// Auto-Start (PO-Festlegung); parallele Läufe werden nicht gesperrt
// (Kommandos sind einzeln dispatchte Registry-Aufrufe).
//
// Verdrahtung über initMacros (app-init.js injiziert Handler-Map und
// Dispatch-Rebuild — Zyklus-Vermeidung, Muster initCommandPalette); die
// Synchronisation hängt an 'scg:command-placement-changed' und
// 'scg:extensions-changed' und rendert das Statusbar-Segment nach, weil
// dessen Buttons registrierte macro.-Kommandos voraussetzen.
'use strict';

import { t, registerExtensionTranslations } from '../i18n.js';
import {
  COMMANDS,
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../shared/commands.js';
import {
  COMMAND_PLACEMENT_EXTENSION_ID,
  MACRO_COMMAND_PREFIX,
  macroCommandId,
} from '../../shared/command-placement.js';
import { runMacroSequence } from '../../shared/macro-runner.js';
import { executeCommandById } from './command-palette.js';
import { getCommandPlacement, renderCommandButtons } from './command-placement.js';
import { isExtensionActive } from './extension-lifecycle.js';
import { showStatusbarHint } from './views.js';

// Namensraum der synthetischen Label-Keys (ext.<ns>.<macroId>); bewusst
// kein realer Erweiterungs-Ordnername.
const MACRO_I18N_NAMESPACE = 'command-placement-macros';

let wiring = null; // { registerHandler, unregisterHandler, refreshHotkeys }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notifyAbort(result) {
  const name = result.macro && result.macro.name ? result.macro.name : '?';
  const key =
    result.reason === 'depth'
      ? 'commandPlacement.macroDepthExceeded'
      : 'commandPlacement.macroAborted';
  const text = t(key)
    .replace('{name}', name)
    .replace('{step}', String((result.stepIndex ?? 0) + 1));
  showStatusbarHint(key, { error: true, duration: 3000, text });
}

// Führt ein Makro aus. macroOrId: Makro-Objekt oder Makro-ID; opts.macros
// erlaubt eine abweichende Makro-Liste (Testlauf des Einstellungs-
// Entwurfs — auch Sub-Makro-Schritte lösen dann gegen den Entwurf auf).
// Rückgabe: Promise<boolean> (false = abgebrochen, Hinweis gezeigt).
export async function runMacro(macroOrId, opts = {}) {
  const list = Array.isArray(opts.macros) ? opts.macros : getCommandPlacement().macros;
  const macro =
    typeof macroOrId === 'string' ? list.find((m) => m.id === macroOrId) || null : macroOrId;
  if (!macro) return false;
  const result = await runMacroSequence(macro, {
    executeCommand: (commandId) => executeCommandById(commandId),
    sleep,
    resolveMacro: (macroId) => list.find((m) => m.id === macroId) || null,
  });
  if (!result.ok) notifyAbort(result);
  return result.ok;
}

// Gleicht die dynamischen macro.-Kommandos mit der Konfiguration ab:
// alle bestehenden abmelden, dann den aktuellen Bestand registrieren
// (im Aus-Zustand der Erweiterung: keinen). Danach die Dispatch-Map
// auffrischen, damit nutzer-belegte Makro-Kürzel sofort (wieder) wirken.
export function syncMacroCommands() {
  if (!wiring) return;
  const existing = COMMANDS.filter(
    (c) => c.dynamic === true && c.id.startsWith(MACRO_COMMAND_PREFIX),
  ).map((c) => c.id);
  for (const id of existing) {
    unregisterDynamicCommand(id);
    wiring.unregisterHandler(id);
  }
  const active = isExtensionActive(COMMAND_PLACEMENT_EXTENSION_ID);
  const macros = active ? getCommandPlacement().macros : [];
  const bundle = {};
  for (const m of macros) bundle[m.id] = m.name;
  registerExtensionTranslations(MACRO_I18N_NAMESPACE, { en: bundle }, 'en');
  for (const m of macros) {
    const commandId = macroCommandId(m.id);
    registerDynamicCommand({ id: commandId, labelKey: `ext.${MACRO_I18N_NAMESPACE}.${m.id}` });
    wiring.registerHandler(commandId, () => {
      void runMacro(m.id);
      // Kein Rückgabewert false: der Start selbst gilt als verarbeitet;
      // Kontext-Fehler einzelner Schritte meldet der Abbruch-Hinweis.
    });
  }
  wiring.refreshHotkeys();
}

export function initMacros(w) {
  wiring = w;
  document.addEventListener('scg:command-placement-changed', () => {
    syncMacroCommands();
    // Statusbar-Buttons auf macro.-Kommandos brauchen den frischen
    // Registrierungs-Stand (Segment-Render filtert unbekannte IDs).
    renderCommandButtons();
  });
  document.addEventListener('scg:extensions-changed', () => {
    syncMacroCommands();
    renderCommandButtons();
  });
  syncMacroCommands();
}
