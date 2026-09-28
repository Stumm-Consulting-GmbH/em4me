// 4T-000993 (Epic 3E-000196): Ableitungen des Erweiterungs-Zustands.
//
// Funktions-Auszug aus src/shared/extensions/extensions.js: die reinen Ableitungen aus
// der persistierten Disabled-Liste — Bereinigung des Store-Werts, transitive
// Mit-Deaktivierung über Abhängigkeiten, Aktiv-Zustand einer ID, der
// Abhängigkeits-Schutz in der Gegenrichtung (4T-001877), die Ableitung der
// Modus-Stufe zum Schalter-Satz eines festen Arbeitsmodus (4T-001880), die
// Gegenrichtung dazu samt der Einmal-Entscheidung des Start-Modus (4T-001881)
// sowie die drei Filter-Mengen für Funktions-Katalog, Kommandos und
// Einstellungs-Bereiche. Das deklarative Manifest bleibt in extensions.js als
// dokumentierte einzige Quelle und begründete Ausnahme des Datei-Größen-Budgets
// (Entscheidung E2 der Bestandsaufnahme 4T-000964).
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

const { allExtensions, isExtensionId, EXTENSION_MODE_LEVELS } = require('./extensions.js');

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

// 4T-001877 (Epic 3E-000187): Abhängigkeits-Schutz — die Gegenrichtung der
// Ableitung oben. Geliefert werden die Kennungen aller Erweiterungen, die
// `id` als Grundlage deklariert haben und derzeit **wirksam** sind; solange
// die Liste nicht leer ist, ist der Schalter der Grundlage gesperrt.
//
// Reine Funktion ohne DOM und ohne Prozess-Bezug, damit neben der
// Einstellungs-Seite auch der gebündelte Profil-Wechsel der Arbeitsmodi
// (Epic 3E-000185) dieselbe Regel fährt statt einer zweiten Auslegung.
//
// Drei Eigenschaften, die aus dem Aufbau folgen und deshalb nicht eigens
// geprüft werden müssen:
//   - Eine bereits unwirksame Abhängige sperrt nicht. Der Maßstab ist der
//     effektive Satz, nicht die roh gespeicherte Liste; damit bleibt ein
//     mitgebrachter Stand (Grundlage aus, Abhängige als an gespeichert)
//     jederzeit wieder einschaltbar.
//   - Eine unbekannte Kennung sperrt nichts: `isExtensionId` weist sie ab,
//     und eine Abhängigkeit auf eine nicht registrierte Kennung findet in
//     der Schleife keinen Gegenpart.
//   - Externe Erweiterungen sperren nichts, weil ihre Registrierung kein
//     `dependencies`-Feld übernimmt (extensions.js, registerExternalExtension).
function blockingDependentIds(id, rawDisabled, list = allExtensions()) {
  if (!isExtensionId(id, list)) return [];
  const disabled = effectiveDisabledSet(rawDisabled, list);
  const out = [];
  for (const m of list) {
    if (m.id === id || disabled.has(m.id)) continue;
    if ((m.dependencies || []).includes(id)) out.push(m.id);
  }
  return out;
}

// Ist der Schalter dieser Erweiterung wegen einer aktiven Abhängigen
// gesperrt? Kurzform von blockingDependentIds für Aufrufer, die allein die
// Ja-Nein-Frage stellen.
function isExtensionLocked(id, rawDisabled, list = allExtensions()) {
  return blockingDependentIds(id, rawDisabled, list).length > 0;
}

// 4T-001880 (Epic 3E-000185): Die Kennungen, die in einem festen Arbeitsmodus
// abgeschaltet sind — abgeleitet aus der Pflicht-Angabe `modeLevel` am
// Manifest, nicht aus einer zweiten Liste je Modus. Eine neue Erweiterung
// landet damit von selbst in ihren Modi, statt in einer Zuordnungs-Tabelle
// vergessen zu werden.
//
// Geliefert wird eine Liste in Registry-Reihenfolge, weil der Aufrufer sie
// unmittelbar als Wert von `extensions.disabled` schreibt (Muster
// normalizeDisabledIds, das ebenfalls eine Liste liefert).
//
// Drei Eigenschaften, die aus dem Aufbau folgen:
//   - Die drei Mengen sind ineinander geschachtelt. Abgeschaltet ist, wessen
//     Stufe HÖHER liegt als der gewählte Modus; mit wachsendem Modus kann eine
//     Kennung nur hinzukommen, nie wegfallen. Ein Modus nimmt deshalb nichts
//     weg, was ein kleinerer enthält.
//   - Externe Erweiterungen bleiben außerhalb: Sie tragen keine Stufe, und ein
//     Eintrag ohne gültige Stufe wird übersprungen. Ihre eigene Schalter-Achse
//     bleibt unberührt, und eine externe Kennung gerät nie in
//     `extensions.disabled`.
//   - Eine unbekannte Stufen-Angabe des Aufrufers schaltet nichts ab, statt
//     alles: Dieselbe Fail-Safe-Richtung wie bei isExtensionEnabled, wo eine
//     unbekannte Kennung als Kern gilt. Ein Modus, den es nicht gibt, darf dem
//     Anwender nichts wegnehmen.
function disabledIdsForModeLevel(level, list = allExtensions()) {
  const rang = EXTENSION_MODE_LEVELS.indexOf(level);
  if (rang < 0) return [];
  const out = [];
  for (const m of list) {
    const eigen = EXTENSION_MODE_LEVELS.indexOf(m && m.modeLevel);
    if (eigen < 0) continue;
    if (eigen > rang) out.push(m.id);
  }
  return out;
}

// 4T-001881 (Epic 3E-000185): Die Gegenrichtung von disabledIdsForModeLevel —
// welcher der drei festen Arbeitsmodi entspricht diesem Schalter-Stand?
// Geliefert wird seine Stufe oder `null` für «Angepasst», also für einen
// Stand, den der Anwender über Einzel-Schalter von jedem festen Modus weg
// gestellt hat.
//
// Der Modus ist damit eine MOMENTAUFNAHME des Schalter-Stands und kein eigener
// Zustand: Er wird bei jeder Anzeige neu abgeleitet, nirgends gespeichert und
// hält den Anwender an nichts fest (Story 4S-000992, AK20).
//
// Gemessen wird gegen die ROH gespeicherte Liste, nicht gegen den effektiven
// Satz: Ein Modus schreibt genau diese Liste, und der Anwender stellt genau
// diese Schalter. Die Eingabe wird zuvor normalisiert, weshalb ein Stand mit
// unbekannten Kennungen nicht zum Fehler führt, sondern schlicht ohne sie
// gemessen wird (AK29).
//
// Die drei Mengen sind wegen der Schachtelung verschieden groß, solange die
// Registry je Stufe mindestens einen Eintrag trägt; ein Stand kann deshalb
// höchstens einem Modus entsprechen. Die Reihenfolge der Prüfung ist trotzdem
// die der Stufen, damit die Antwort auch bei einer leeren Stufe bestimmt
// bleibt (dann gewinnt der kleinere Modus).
function modeLevelForDisabledIds(rawDisabled, list = allExtensions()) {
  const ist = new Set(normalizeDisabledIds(rawDisabled, list));
  for (const level of EXTENSION_MODE_LEVELS) {
    const soll = disabledIdsForModeLevel(level, list);
    if (soll.length !== ist.size) continue;
    if (soll.every((id) => ist.has(id))) return level;
  }
  return null;
}

// 4T-001881: Der Start-Modus einer neuen Installation (Entscheidung E11 des
// Epics 3E-000185 vom 2026-09-22).
const START_MODE_LEVEL = 'beginner';

// 4T-001881: Einmal-Entscheidung beim App-Start — ist der Schalter-Satz des
// Einsteiger-Modus zu schreiben? Geliefert wird die zu schreibende Liste oder
// `null`, wenn nichts zu tun ist (Muster startupSchemeState in
// shared/color-schemes.js, dort ebenfalls als reine Funktion neben dem Store).
//
// Zwei Merkmale, beide am Store gemessen, und BEIDE müssen fehlen:
//   hasStoredState  Der Store trägt bereits einen Schalter-Stand. Dann bleibt
//                   er unberührt — auch wenn er die leere Liste ist. Ein
//                   Update beschneidet niemandem den Funktionsumfang
//                   (Entscheidung E2, für Bestands-Einrichtungen unverändert
//                   gültig).
//   hasSeenTour     Der Erststart-Merker der geführten Tour ist gesetzt. Er
//                   ist die EINE Erkennung des ersten Starts im Bestand
//                   (tour.js, maybeStartTourOnFirstRun); eine zweite daneben
//                   liefe früher oder später auseinander. Wer die Tour schon
//                   gesehen hat, hat die Anwendung schon benutzt — auch wenn
//                   er nie einen Erweiterungs-Schalter angefasst hat.
//
// Bewusst in Kauf genommen: Eine Einrichtung aus der Zeit VOR der geführten
// Tour trägt weder Merker noch Schalter-Stand und gilt damit als erster Start.
// Das ist kein Sonderfall dieser Regel, sondern die Lage im Bestand: Für sie
// läuft schon heute die Tour an. Die Story nennt denselben Maßstab — wo kein
// eigener Stand vorliegt, gilt der Einsteiger-Modus (4S-000992, Abgrenzung).
//
// Geschrieben wird genau einmal, ohne zusätzlichen Marker: Der Schreibvorgang
// legt den Schlüssel an, und von da an greift hasStoredState.
function startupDisabledIds({ hasStoredState, hasSeenTour }, list = allExtensions()) {
  if (hasStoredState || hasSeenTour) return null;
  return disabledIdsForModeLevel(START_MODE_LEVEL, list);
}

// Effektiver Aktiv-Zustand einer ID. Unbekannte IDs sind Kern und damit
// immer aktiv.
function isExtensionEnabled(id, rawDisabled, list = allExtensions()) {
  if (!isExtensionId(id, list)) return true;
  return !effectiveDisabledSet(rawDisabled, list).has(id);
}

// 4T-000941: Katalog-Schlüssel aller effektiv deaktivierten Erweiterungen —
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
// deaktiviert ist — die Bereichsnavigation blendet sie aus (4T-000295).
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
  blockingDependentIds,
  isExtensionLocked,
  disabledIdsForModeLevel,
  modeLevelForDisabledIds,
  START_MODE_LEVEL,
  startupDisabledIds,
  isExtensionEnabled,
  disabledCommandIdSet,
  disabledFeatureKeySet,
  disabledSettingsSectionIdSet,
};
