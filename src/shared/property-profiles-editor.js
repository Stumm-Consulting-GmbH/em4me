// 4T-0448/4T-0491 (Epic 3E-0083/3E-0093): Editor-Logik der Eigenschafts-
// Profile — die Wirkung EINER Definition in den beiden Panels: weiche
// Hinweise, Vorschlags-Listen und die Komplett-Übernahme.
//
// Eigene Datei seit 4T-1161 (Epic 3E-0219), beim Erreichen des Datei-Budgets.
// Die Naht folgt der, die der Gegenstand ohnehin führt: In der Fassade
// `property-profiles.js` liegt die AUFLÖSUNG über mehrere Profile, hier die
// Wirkung einer aufgelösten Definition an der Oberfläche. Alle Verbraucher
// laden unverändert die Fassade, die alles Öffentliche weiterreicht.
//
// Reine Funktionen, gemeinsam für Properties-Editor und Block-Panel (ein
// Verhalten, zwei Oberflächen — Task-Vorgabe 4T-0449).
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { cleanString } = require('./property-profiles-format.js');

// --- 4T-0448 (Epic 3E-0083): Editor-Logik (Vorschläge und weiche Hinweise) --------
// Reine Funktionen, gemeinsam für Properties-Editor und Block-Panel
// (ein Verhalten, zwei Oberflächen — Task-Vorgabe 4T-0449).

// Leerer Eigenschafts-Wert: Feld angelegt, aber ohne Inhalt — dafür gibt es
// keinen Hinweis (weiche Haltung; ein leeres Feld ist kein Verstoß).
function isEmptyPropertyValue(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// Passt der Ist-Wert (JS-Wert aus YAML bzw. Block-Daten) zum definierten Typ?
// 4T-1155 (Epic 3E-0219): um 'link' und 'time' erweitert. Ein Verweis ist
// für die Typ-Prüfung ein einzeiliger Text — er trägt die Wiki-Schreibweise,
// und ob sein Ziel existiert, ist eine Frage des Bedienelements und nicht
// des Werts (Konzept 6.12).
function valueMatchesType(value, type) {
  switch (type) {
    case 'string':
    case 'link':
      return typeof value === 'string' && !value.includes('\n');
    case 'multiline':
      return typeof value === 'string';
    case 'multistring':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'time':
      return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
    default:
      return true;
  }
}

// 4T-1155 (Epic 3E-0219): Passt der Ist-Wert zur Definition, also zum Typ
// **und** zum Mehrfach-Modus? Seit der Entkopplung (E11) tragen auch Typen
// mehrere Werte, deren Name das nicht mehr verrät — ein Verweis-Feld mit
// `multiple` erwartet eine Liste, obwohl sein Typ 'link' heißt. Das
// historische 'multistring' prüft seine Liste weiterhin selbst und läuft
// deshalb nicht doppelt durch die Listen-Regel.
function valueMatchesDefinition(value, def) {
  if (def.multiple === true && def.type !== 'multistring') {
    return Array.isArray(value) && value.every((item) => valueMatchesType(item, def.type));
  }
  return valueMatchesType(value, def.type);
}

// Weicher Validierungs-Hinweis eines Werts gegen seine Definition:
// null (konform oder leer), 'typeMismatch' (Ist-Wert entspricht nicht dem
// definierten Typ) oder 'outsideValues' (Wert bzw. ein Listen-Eintrag liegt
// außerhalb des festen Wertebereichs). Keine Blockade, keine Wert-Änderung
// (PO-Entscheidung 3) — die Editoren zeigen Icon plus Tooltip.
function fieldDefinitionHint(def, value) {
  if (!def || isEmptyPropertyValue(value)) return null;
  if (!valueMatchesDefinition(value, def)) return 'typeMismatch';
  if (Array.isArray(def.values) && def.values.length > 0) {
    const items = Array.isArray(value) ? value : [value];
    const allowed = (item) => def.values.some((v) => v === item || String(v) === String(item));
    if (!items.every(allowed)) return 'outsideValues';
  }
  return null;
}

// 4T-1157 (Epic 3E-0219, E12): Hinweis zur QUELLE eines Wertevorrats, im
// Unterschied zu `fieldDefinitionHint`, der den WERT betrifft. Fehlt die
// Quelle oder liefert sie nichts, bleibt das Feld bedienbar, der Vorrat ist
// leer, und ein Hinweis steht am Feld (E12, letzte Festlegung).
//
// Reine Funktion und deshalb hier statt in der DOM-Schicht: Beide Panels
// zeigen denselben Hinweis, und geprüft werden soll die Regel, nicht ihre
// Darstellung. Liefert 'emptySource' oder null.
function valueSourceHint(def) {
  if (!def || !def.valuesFrom) return null;
  const hatWerte = Array.isArray(def.values) && def.values.length > 0;
  return hatWerte ? null : 'emptySource';
}

// Vorschlags-Liste für „Eigenschaft hinzufügen": zuerst die aufgelösten,
// noch nicht gesetzten Definitions-Felder (source 'profile', mit Profil-
// Kennzeichnung), danach die Heuristik-Vorschläge (source 'heuristic',
// [{ name, type }] — die bisherigen Standard-Feldnamen des Editors).
// Bereits gesetzte Feldnamen entfallen (case-insensitiv).
function profileFieldSuggestions(resolvedFields, existingKeys, heuristics) {
  const taken = new Set(
    (Array.isArray(existingKeys) ? existingKeys : [])
      .map((k) => cleanString(k).toLowerCase())
      .filter((k) => k !== ''),
  );
  const out = [];
  for (const def of Array.isArray(resolvedFields) ? resolvedFields : []) {
    const key = def.name.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({ source: 'profile', name: def.name, type: def.type, def });
  }
  for (const h of Array.isArray(heuristics) ? heuristics : []) {
    const name = cleanString(h && h.name);
    if (name === '' || taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    out.push({ source: 'heuristic', name, type: cleanString(h.type) || 'string', def: null });
  }
  return out;
}

// --- 4T-0491 (Epic 3E-0093): Komplett-Übernahme von Profil-Feldern -----------
// Reine Funktionen für den Bulk-Schreibpfad, gemeinsam für Properties-Editor
// und Block-Panel (ein Verhalten, zwei Oberflächen).

// Typgerechter Leer-Wert eines Profil-Felds ohne Default. Bewusst identisch zu
// defaultValueForType des Properties-Editors (ohne den DOM-internen
// 'readonly'-Fall): Zahl 0, Boolean false, Mehrfach-Liste leer, alle übrigen
// Typen (Text, Mehrzeilig, Datum) leerer Text. „Echtes unbelegt" für
// Zahl/Boolean ist in den Editoren nicht stabil darstellbar (leeres Zahlenfeld
// liest als 0, Checkbox als false) — PO-Festlegung 2026-07-11. Der Dokument-
// Schreibpfad übersetzt leere Text-/Listen-Stubs zusätzlich in bare
// YAML-Schlüssel; der Block-Pfad speichert die Werte typgerecht als JSON.
function emptyValueForType(type) {
  if (type === 'multistring') return [];
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  return '';
}

// 4T-1156 (Epic 3E-0219): Leer-Wert einer ganzen Definition. Seit der
// Entkopplung des Mehrfach-Modus (E11) genügt der Typ nicht mehr: Ein
// Verweis-Feld mit `multiple` braucht die leere Liste, obwohl sein Typ
// 'link' den Leer-Text ergäbe. `multistring` trägt seine Vielzahl weiterhin
// im Typ und läuft deshalb unverändert durch.
function emptyValueForDefinition(def) {
  if (!def) return '';
  if (def.multiple === true && def.type !== 'multistring') return [];
  return emptyValueForType(def.type);
}

// Feld-Map für die Komplett-Übernahme: aus einer (ggf. auf ein Profil
// gefilterten) Definitions-Liste die noch nicht gesetzten Felder mit
// Default-Wert bzw. typgerechtem Leer-Wert. existingKeys sind die bereits
// vorhandenen Feldnamen (case-insensitiv); bestehende Felder bleiben außen vor,
// Duplikat-Definitionen zählen einmal (erste gewinnt). Reihenfolge und
// Einfüge-Reihenfolge der Map = Definitions-Reihenfolge (neue Felder ans Ende).
function buildProfileFillMap(fields, existingKeys) {
  const taken = new Set(
    (Array.isArray(existingKeys) ? existingKeys : [])
      .map((k) => cleanString(k).toLowerCase())
      .filter((k) => k !== ''),
  );
  const map = {};
  for (const def of Array.isArray(fields) ? fields : []) {
    const name = cleanString(def && def.name);
    if (name === '') continue;
    const key = name.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    map[name] =
      def.default !== null && def.default !== undefined
        ? def.default
        : emptyValueForDefinition(def);
  }
  return map;
}

// Menü-Struktur des Vorschlags-Menüs (PO-Festlegung 2026-07-11): eine einzige,
// nach Profilen gruppierte Liste. `profileGroups` trägt pro aufgelöstem Profil
// mit mindestens einem fehlenden Feld eine Gruppe (Reihenfolge = Auflösungs-
// Reihenfolge) mit den Einzel-Vorschlägen (`fields`) und der Komplett-Feld-Map
// (`map`, für den klickbaren Profil-Kopf); `otherFields` sind die profillosen
// Heuristik-Vorschläge. Ohne Auflösung leere Gruppen. Baut auf
// profileFieldSuggestions auf (gleiche Dedup- und Reihenfolge-Regeln).
function profileSuggestGroups(resolvedFields, existingKeys, heuristics) {
  const flat = profileFieldSuggestions(resolvedFields, existingKeys, heuristics);
  const order = [];
  const byProfile = new Map();
  const otherFields = [];
  for (const s of flat) {
    if (s.source === 'profile' && s.def) {
      const key = cleanString(s.def.profile).toLowerCase();
      if (!byProfile.has(key)) {
        byProfile.set(key, { profile: s.def.profile, fields: [] });
        order.push(key);
      }
      byProfile.get(key).fields.push(s);
    } else {
      otherFields.push(s);
    }
  }
  const profileGroups = order.map((key) => {
    const grp = byProfile.get(key);
    const map = buildProfileFillMap(
      grp.fields.map((s) => s.def),
      existingKeys,
    );
    return { profile: grp.profile, fields: grp.fields, map };
  });
  return { profileGroups, otherFields };
}

module.exports = {
  // 4T-0448: weiche Hinweise und Vorschläge.
  isEmptyPropertyValue,
  valueMatchesType,
  valueMatchesDefinition,
  fieldDefinitionHint,
  // 4T-1157: Hinweis zur Quelle eines Wertevorrats.
  valueSourceHint,
  profileFieldSuggestions,
  // 4T-0491: Komplett-Übernahme.
  emptyValueForType,
  // 4T-1156: Leer-Wert einer ganzen Definition (Mehrfach-Modus).
  emptyValueForDefinition,
  buildProfileFillMap,
  profileSuggestGroups,
};
