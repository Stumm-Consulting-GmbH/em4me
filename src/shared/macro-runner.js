// 4T-000522 (Epic 3E-000094): Ausführungs-Kern der Makros — strikt
// sequenziell mit await pro Schritt. Reine Funktion ohne DOM-/Electron-
// Abhängigkeit: alle Wirkungen kommen über deps herein (Node-testbar,
// Muster command-palette-filter.js). Fehler-Semantik (PO-Festlegung):
// schlägt ein Schritt fehl oder ist sein Kommando im Kontext nicht
// ausführbar, bricht die Sequenz ab; der Aufrufer zeigt den Statusbar-
// Hinweis. Makro-in-Makro läuft über resolveMacro mit Tiefen-Limit
// (MACRO_MAX_CALL_DEPTH) statt über den Kommando-Dispatcher, damit die
// Aufruf-Kette messbar bleibt (Rekursions-Schutz).
'use strict';

const { MACRO_COMMAND_PREFIX, MACRO_MAX_CALL_DEPTH } = require('./commands/command-placement.js');

// deps:
//   executeCommand(commandId) -> boolean|Promise<boolean>; false = Schritt
//     fehlgeschlagen oder im Kontext nicht ausführbar.
//   sleep(ms) -> Promise; Verzögerungs-Schritte.
//   resolveMacro(macroId) -> Makro-Objekt oder null (Sub-Makro-Schritte).
// Rückgabe: { ok: true } oder
//   { ok: false, reason: 'command'|'depth', macro, stepIndex, step } —
//   macro/stepIndex benennen den auslösenden Schritt der ÄUSSERSTEN
//   betroffenen Ebene (für den verständlichen Hinweis).
async function runMacroSequence(macro, deps, depth = 0) {
  if (!macro || !Array.isArray(macro.steps)) {
    return { ok: false, reason: 'command', macro, stepIndex: -1, step: null };
  }
  if (depth >= MACRO_MAX_CALL_DEPTH) {
    return { ok: false, reason: 'depth', macro, stepIndex: -1, step: null };
  }
  for (let i = 0; i < macro.steps.length; i++) {
    const step = macro.steps[i];
    if (step.type === 'delay') {
      await deps.sleep(step.seconds * 1000);
      continue;
    }
    if (step.type !== 'command') continue;
    if (step.commandId.startsWith(MACRO_COMMAND_PREFIX)) {
      const childId = step.commandId.slice(MACRO_COMMAND_PREFIX.length);
      const child = typeof deps.resolveMacro === 'function' ? deps.resolveMacro(childId) : null;
      if (!child) return { ok: false, reason: 'command', macro, stepIndex: i, step };
      const result = await runMacroSequence(child, deps, depth + 1);
      if (!result.ok) {
        // Tiefen-Abbruch auf den auslösenden Schritt dieser Ebene mappen;
        // Kommando-Abbrüche behalten die innere Fundstelle.
        if (result.reason === 'depth' && result.stepIndex === -1) {
          return { ok: false, reason: 'depth', macro, stepIndex: i, step };
        }
        return result;
      }
      continue;
    }
    const executed = await deps.executeCommand(step.commandId);
    if (executed === false) return { ok: false, reason: 'command', macro, stepIndex: i, step };
  }
  return { ok: true };
}

module.exports = { runMacroSequence };
