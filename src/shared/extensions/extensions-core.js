// 4T-0993 (Epic 3E-0196): Ableitungen des Erweiterungs-Zustands.
//
// Funktions-Auszug aus src/shared/extensions/extensions.js: die reinen Ableitungen aus
// der persistierten Disabled-Liste — Bereinigung des Store-Werts, transitive
// Mit-Deaktivierung über Abhängigkeiten, Aktiv-Zustand einer ID sowie die
// drei Filter-Mengen für Funktions-Katalog, Kommandos und Einstellungs-
// Bereiche. Das deklarative Manifest bleibt in extensions.js als dokumentierte
// einzige Quelle und begründete Ausnahme des Datei-Größen-Budgets
// (Entscheidung E2 der Bestandsaufnahme 4T-0964).
//
// Import-Richtung einseitig extensions-core.js -> extensions.js und damit
// zyklenfrei: Die Registry-Liste kommt über die Zugriffs-Funktion
// allExtensions() herein (kein beschreibbares Export-Binding), das live
// mutierte Array der externen Erweiterungen bleibt mit seinen
// Mutations-Funktionen in der Registry-Datei. Weil das Laden dieses Moduls
// die Registry mitlädt, greift ihre Selbst-Validierung beim Laden unverändert.
//
// Bewusst NICHT ausgezogen ist validateExtensionRegistry: Die Validierung
// hängt an registerExternalExtension, das als Mutations-Funktion des
// Laufzeit-Arrays in der Registry-Datei bleibt; ein Auszug hätte einen Zyklus
// erzwungen (Begründung im Kopf von extensions.js).
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM) — Main
// (Menü-Filterung), Preload (Pipeline-Aufbau) und Renderer (Lebenszyklus,
// Settings-UI) laden dasselbe Modul. Verbraucher importieren direkt aus
// dieser Datei; extensions.js exportiert die hier liegenden Namen NICHT
// erneut (Entscheidung E3: Fassaden nur als bewusste Subsystem-APIs).
//
// Die übernommenen Kommentare stehen unverändert im Wortlaut ihrer Herkunft.
'use strict';

const { allExtensions, isExtensionId } = require('./extensions.js');

// --- Disabled-Zustand ---------------------------------------------------------------
// Bereinigt einen (auch defekten) Store-Wert zur Liste bekannter IDs:
// Nicht-Arrays werden zur leeren Liste, unbekannte IDs und Duplikate
// verworfen (robust gegen künftige Zu- und Abgänge von Erweiterungen).
function normalizeDisabledIds(raw, list = allExtensions()) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !isExtensionId(id, list) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

// Effektiv deaktivierte IDs: die bewusst deaktivierten plus transitiv alle
// Erweiterungen, deren Abhängigkeiten (direkt oder indirekt) deaktiviert
// sind. Reine Funktion; die Eingabe wird zuerst normalisiert.
function effectiveDisabledSet(rawDisabled, list = allExtensions()) {
  const disabled = new Set(normalizeDisabledIds(rawDisabled, list));
  // Fixpunkt-Iteration: solange neue abhängige Erweiterungen dazukommen,
  // weiter prüfen (Registry ist klein; Zyklen sind per Validierung
  // ausgeschlossen).
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of list) {
      if (disabled.has(m.id)) continue;
      if ((m.dependencies || []).some((dep) => disabled.has(dep))) {
        disabled.add(m.id);
        grew = true;
      }
    }
  }
  return disabled;
}

// Effektiver Aktiv-Zustand einer ID. Unbekannte IDs sind Kern und damit
// immer aktiv.
function isExtensionEnabled(id, rawDisabled, list = allExtensions()) {
  if (!isExtensionId(id, list)) return true;
  return !effectiveDisabledSet(rawDisabled, list).has(id);
}

// 4T-0941: Katalog-Schlüssel aller effektiv deaktivierten Erweiterungen —
// Grundlage der Kennzeichnung auf der generierten Funktions-Seite.
//
// Zwei Quellen, beide am Manifest: Bei den meisten Erweiterungen IST der
// `descKey` der Katalog-Schlüssel ihrer Zeile; gebündelte Erweiterungen mit
// eigenen `extension.*`-Texten nennen ihre Zeilen in `featureKeys`. Die
// Zuordnung wird damit an einer Stelle gepflegt und nicht doppelt geführt.
function disabledFeatureKeySet(rawDisabled, list = allExtensions()) {
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const keys = new Set();
  for (const m of list) {
    if (!disabled.has(m.id)) continue;
    if (typeof m.descKey === 'string' && m.descKey.startsWith('help.feature.')) keys.add(m.descKey);
    for (const k of m.featureKeys || []) keys.add(k);
  }
  return keys;
}

// Kommando-IDs aller effektiv deaktivierten Erweiterungen — Grundlage der
// Filterung in Dispatcher, Editor-Keymap, Menü und Handbuch-Generatoren.
function disabledCommandIdSet(rawDisabled, list = allExtensions()) {
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const commands = new Set();
  for (const m of list) {
    if (!disabled.has(m.id)) continue;
    for (const cmdId of m.commands || []) commands.add(cmdId);
  }
  return commands;
}

// Bereichs-IDs der Einstellungs-Seite, deren Erweiterung effektiv
// deaktiviert ist — die Bereichsnavigation blendet sie aus (4T-0295).
function disabledSettingsSectionIdSet(rawDisabled, list = allExtensions()) {
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const sections = new Set();
  for (const m of list) {
    if (!disabled.has(m.id)) continue;
    for (const sectionId of m.settingsSections || []) sections.add(sectionId);
  }
  return sections;
}

module.exports = {
  normalizeDisabledIds,
  effectiveDisabledSet,
  isExtensionEnabled,
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
};
