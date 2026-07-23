// 4T-0446 (Epic 3E-0083): Eigenschafts-Profile — Profil-Datei-Format,
// Definitions-Validierung und Bereichs-Konfiguration.
//
// Ein Profil ist eine normale Markdown-Datei im Profil-Ordner des Bereichs;
// ihr Frontmatter-Schlüssel `fields` trägt die zentralen Feld-Definitionen
// für die Eigenschafts-Editoren (Dokument-Properties und Block-Panel), der
// Datei-Inhalt ist freie Beschreibung. Profil-Name = Datei-Titel (Dateiname
// ohne .md). Dokumente ordnen sich über ein Frontmatter-Feld zu (Default
// `class`, pro Bereich umbenennbar); zusätzlich kann ein Bereichs-Standard-
// Profil für alle Dateien gelten (Architekturentscheidung 1 des Epics).
//
// Bereichsdatei-Sektion `propertyProfiles` (Area_Settings.mdda, Sektions-
// Muster mit Fehler-Isolation; Vorbilder templates-/journals-Sektion):
//   propertyProfiles: {
//     folder         Profil-Ordner relativ zur Bereichs-Wurzel
//     assignField    Zuordnungs-Feldname im Frontmatter (Default 'class')
//     defaultProfile Profil-Name des Standard-Profils oder null
//   }
//
// Feld-Definition im Profil-Frontmatter (`fields`-Liste):
//   { name     Feldname (Pflicht, eindeutig pro Profil)
//     type     'string' | 'multistring' | 'number' | 'boolean' | 'date' |
//              'multiline' (Default 'string'; 'multistring' bei multiple)
//     values   optional: fester Wertebereich (Werte-Liste)
//     multiple optional, nur mit values: Mehrfach-Auswahl (Wert ist Liste,
//              effektiver Typ 'multistring')
//     default  optional: Vorbelegung beim Anlegen über den Editor }
//
// Validierung ist weich nach dem Fehler-Isolations-Muster der Bereichsdatei
// und der PO-Entscheidung 3 (Hinweise statt Blockade): defekte Einzel-
// Definitionen entfallen und werden als Hinweis gesammelt (nie ein Wurf),
// die übrigen Definitionen des Profils bleiben wirksam. Definitions-Fehler
// sind u.a. unbekannter Typ, `multiple` ohne `values` und Duplikat-Feldnamen
// (Task-Vorgabe); ein unpassender Default setzt nur den Default aus.
//
// Prozess-neutral (kein Electron, kein DOM): Main (Datenpfad, Auflösung)
// und Renderer (Editoren, Einstellungen) laden dasselbe Modul.
'use strict';

// Die sechs editierbaren Eigenschafts-Typen — bewusst identisch zu
// PROPERTY_TYPES des Properties-Editors ohne den internen 'readonly'-
// Fallback (der ist Inferenz-Ergebnis verschachtelter YAML-Strukturen,
// keine definierbare Vorgabe).
const PROFILE_FIELD_TYPES = ['string', 'multistring', 'number', 'boolean', 'date', 'multiline'];

// Default des Zuordnungs-Feldnamens (belegtes Nutzungs-Muster des PO,
// Referenz-Analyse Metadata_Menu.md §4: Alias `Class`).
const DEFAULT_ASSIGN_FIELD = 'class';

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Normalisiert die propertyProfiles-Sektion auf { folder, assignField,
// defaultProfile } oder null (keine Konfiguration). Tolerant: defekte oder
// fehlende Teile fallen auf null bzw. den Default, nie auf einen Wurf.
function normalizeProfilesConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const folder = cleanString(value.folder) || null;
  const assignRaw = cleanString(value.assignField);
  const defaultProfile = cleanString(value.defaultProfile) || null;
  if (folder === null && assignRaw === '' && defaultProfile === null) return null;
  return { folder, assignField: assignRaw || DEFAULT_ASSIGN_FIELD, defaultProfile };
}

// Skalar -> getrimmter String; null bei Nicht-Skalaren (verschachtelte
// Strukturen sind in Werte-Listen nicht definierbar).
function scalarToString(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}

// Werte-Liste passend zum Feld-Typ normalisieren: number-Felder erhalten
// endliche Zahlen (numerische Strings werden konvertiert), alle übrigen
// String-Werte; leere und doppelte Einträge entfallen. null = Werte-Liste
// ist für diesen Typ nicht bildbar (Definitions-Fehler beim Aufrufer).
function normalizeValuesList(list, type) {
  const out = [];
  for (const raw of list) {
    if (type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(cleanString(raw) || NaN);
      if (!Number.isFinite(n) || out.includes(n)) continue;
      out.push(n);
    } else {
      const s = scalarToString(raw);
      if (s === null || s === '' || out.includes(s)) continue;
      out.push(s);
    }
  }
  return out.length > 0 ? out : null;
}

// Default-Wert gegen den Feld-Typ prüfen/normalisieren. Liefert
// { ok: true, value } oder { ok: false } (Default entfällt, Feld bleibt).
function normalizeDefault(raw, type) {
  if (type === 'multistring') {
    const list = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const item of list) {
      const s = scalarToString(item);
      if (s === null) return { ok: false };
      if (s !== '' && !out.includes(s)) out.push(s);
    }
    return { ok: true, value: out };
  }
  if (type === 'number') {
    return typeof raw === 'number' && Number.isFinite(raw)
      ? { ok: true, value: raw }
      : { ok: false };
  }
  if (type === 'boolean') {
    return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false };
  }
  // string, date, multiline: String-Skalar; date zusätzlich im ISO-Format
  // (ein Nicht-Datum als Datums-Default wäre im Editor nicht darstellbar).
  const s = scalarToString(raw);
  if (s === null) return { ok: false };
  if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false };
  return { ok: true, value: s };
}

// Parst die Feld-Definitionen aus dem Frontmatter-Objekt einer Profil-Datei.
// Liefert { fields, errors }: fields sind die gültigen, normalisierten
// Definitionen { name, type, values, multiple, default }, errors die
// gesammelten Hinweise { code, index, name } (index = Position in der
// fields-Liste, name falls bekannt). Fehler-Codes:
//   fieldsNotList          `fields` ist keine Liste (Profil ohne Wirkung)
//   entry                  Definition ist kein Objekt
//   name                   Feldname fehlt oder ist leer
//   duplicate              Feldname doppelt (case-insensitiv)
//   type                   unbekannter Typ
//   multipleWithoutValues  multiple ohne values
//   multipleType           multiple mit explizitem Nicht-multistring-Typ
//   values                 Werte-Liste nicht bildbar (kein Array, leer nach
//                          Normalisierung oder Typ ohne Wertebereich)
//   default                Default passt nicht zum Typ (nur Default entfällt)
//   defaultOutsideValues   Default außerhalb des Wertebereichs (bleibt —
//                          weiche Haltung, Hinweis für die Profil-Pflege)
function parseProfileFields(data) {
  const fields = [];
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { fields, errors };
  const raw = data.fields;
  if (raw === undefined || raw === null) return { fields, errors };
  if (!Array.isArray(raw)) {
    errors.push({ code: 'fieldsNotList', index: -1, name: null });
    return { fields, errors };
  }
  const seen = new Set();
  raw.forEach((entry, index) => {
    const fail = (code, name) => errors.push({ code, index, name: name || null });
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail('entry');
    const name = cleanString(entry.name);
    if (name === '') return fail('name');
    if (seen.has(name.toLowerCase())) return fail('duplicate', name);

    const multiple = entry.multiple === true;
    const declaredType = cleanString(entry.type);
    let type = declaredType || (multiple ? 'multistring' : 'string');
    if (!PROFILE_FIELD_TYPES.includes(type)) return fail('type', name);

    const hasValues = entry.values !== undefined && entry.values !== null;
    if (multiple && !hasValues) return fail('multipleWithoutValues', name);
    if (multiple && declaredType !== '' && declaredType !== 'multistring') {
      return fail('multipleType', name);
    }
    if (multiple) type = 'multistring';

    let values = null;
    if (hasValues) {
      // Wertebereiche gibt es für Auswahl-Typen; boolean hat seine zwei
      // Werte per Konstruktion, multiline ist Freitext.
      if (!Array.isArray(entry.values) || type === 'boolean' || type === 'multiline') {
        return fail('values', name);
      }
      values = normalizeValuesList(entry.values, type === 'multistring' ? 'string' : type);
      if (values === null) return fail('values', name);
    }
    // multistring mit Wertebereich IST die Mehrfach-Auswahl (multiple
    // implizit; die Task-Vorgabe koppelt multiple an values).
    const effectiveMultiple = multiple || (type === 'multistring' && values !== null);

    let defaultValue = null;
    if (entry.default !== undefined && entry.default !== null) {
      const norm = normalizeDefault(entry.default, type);
      if (!norm.ok) {
        fail('default', name);
      } else {
        defaultValue = norm.value;
        if (values !== null) {
          const items = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
          if (!items.every((v) => values.includes(v))) fail('defaultOutsideValues', name);
        }
      }
    }

    seen.add(name.toLowerCase());
    fields.push({ name, type, values, multiple: effectiveMultiple, default: defaultValue });
  });
  return { fields, errors };
}

// Zuordnungs-Werte eines Dokuments: die Profil-Namen aus dem Zuordnungs-Feld
// des Frontmatters (String oder Liste; Feldname case-insensitiv, weil die
// Schreibweise im Frontmatter freie Nutzer-Eingabe ist). Reihenfolge bleibt
// erhalten — sie trägt die Konflikt-Regel der Auflösung (zuerst genanntes
// Profil gewinnt, 4T-0447).
function assignedProfileNames(frontmatterData, assignField) {
  if (!frontmatterData || typeof frontmatterData !== 'object' || Array.isArray(frontmatterData)) {
    return [];
  }
  const wanted = (cleanString(assignField) || DEFAULT_ASSIGN_FIELD).toLowerCase();
  let value;
  for (const key of Object.keys(frontmatterData)) {
    if (key.toLowerCase() === wanted) {
      value = frontmatterData[key];
      break;
    }
  }
  const out = [];
  const push = (v) => {
    const s = scalarToString(v);
    if (s !== null && s !== '' && !out.includes(s)) out.push(s);
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);
  return out;
}

// 4T-0447 (Epic 3E-0083): Definitions-Auflösung pro Datei. Vereinigung der
// Feld-Definitionen aus den zugeordneten Profilen plus Standard-Profil mit
// deterministischen Konflikt-Regeln (Task-Vorgabe, im Handbuch dokumentiert):
// bei gleichem Feldnamen gewinnt das zugeordnete Profil vor dem Standard-
// Profil, bei mehreren zugeordneten Profilen das in der Zuordnungs-Liste
// zuerst genannte. Profil- und Feldnamen matchen case-insensitiv (Windows-
// Dateisystem bzw. freie Frontmatter-Schreibweise). Blöcke einer Datei erben
// dieselbe Auflösung (PO-Entscheidung 4; keine eigene Block-Zuordnung in v1).
//
// profiles: Katalog [{ name, fields }] (geparste Profil-Dateien);
// assigned: Zuordnungs-Werte des Dokuments in Frontmatter-Reihenfolge;
// defaultProfile: Profil-Name des Bereichs-Standard-Profils oder null.
// Liefert { fields, missing }: fields sind die Definitionen ergänzt um
// { profile, fromDefault } (Herkunfts-Kennzeichnung der Editoren), missing
// die zugeordneten bzw. als Standard gesetzten, aber nicht vorhandenen
// Profil-Namen (Hinweis-Grundlage der Einstellungen).
function resolveProfileFields(profiles, { defaultProfile, assigned } = {}) {
  const byName = new Map();
  for (const p of Array.isArray(profiles) ? profiles : []) {
    const key = cleanString(p && p.name).toLowerCase();
    if (key !== '' && !byName.has(key)) byName.set(key, p);
  }
  const ordered = [];
  const missing = [];
  const seenProfiles = new Set();
  const push = (rawName, fromDefault) => {
    const name = cleanString(rawName);
    if (name === '') return;
    const key = name.toLowerCase();
    if (seenProfiles.has(key)) return; // Standard-Profil auch zugeordnet: einmal zählt
    seenProfiles.add(key);
    const profile = byName.get(key);
    if (profile) ordered.push({ profile, fromDefault });
    else missing.push(name);
  };
  for (const name of Array.isArray(assigned) ? assigned : []) push(name, false);
  push(defaultProfile, true);
  const fields = [];
  const seenFields = new Set();
  for (const { profile, fromDefault } of ordered) {
    for (const def of Array.isArray(profile.fields) ? profile.fields : []) {
      const key = def.name.toLowerCase();
      if (seenFields.has(key)) continue;
      seenFields.add(key);
      fields.push({ ...def, profile: profile.name, fromDefault });
    }
  }
  return { fields, missing };
}

// --- 4T-0448 (Epic 3E-0083): Editor-Logik (Vorschläge und weiche Hinweise) --------
// Reine Funktionen, gemeinsam für Properties-Editor und Block-Panel
// (ein Verhalten, zwei Oberflächen — Task-Vorgabe 4T-0449).

// Leerer Eigenschafts-Wert: Feld angelegt, aber ohne Inhalt — dafür gibt es
// keinen Hinweis (weiche Haltung; ein leeres Feld ist kein Verstoß).
function isEmptyPropertyValue(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// Passt der Ist-Wert (JS-Wert aus YAML bzw. Block-Daten) zum definierten Typ?
function valueMatchesType(value, type) {
  switch (type) {
    case 'string':
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
    default:
      return true;
  }
}

// Weicher Validierungs-Hinweis eines Werts gegen seine Definition:
// null (konform oder leer), 'typeMismatch' (Ist-Wert entspricht nicht dem
// definierten Typ) oder 'outsideValues' (Wert bzw. ein Listen-Eintrag liegt
// außerhalb des festen Wertebereichs). Keine Blockade, keine Wert-Änderung
// (PO-Entscheidung 3) — die Editoren zeigen Icon plus Tooltip.
function fieldDefinitionHint(def, value) {
  if (!def || isEmptyPropertyValue(value)) return null;
  if (!valueMatchesType(value, def.type)) return 'typeMismatch';
  if (Array.isArray(def.values) && def.values.length > 0) {
    const items = Array.isArray(value) ? value : [value];
    const allowed = (item) => def.values.some((v) => v === item || String(v) === String(item));
    if (!items.every(allowed)) return 'outsideValues';
  }
  return null;
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
      def.default !== null && def.default !== undefined ? def.default : emptyValueForType(def.type);
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
  PROFILE_FIELD_TYPES,
  DEFAULT_ASSIGN_FIELD,
  normalizeProfilesConfig,
  parseProfileFields,
  assignedProfileNames,
  resolveProfileFields,
  // 4T-0448: gemeinsame Editor-Logik.
  isEmptyPropertyValue,
  fieldDefinitionHint,
  profileFieldSuggestions,
  // 4T-0491: Komplett-Übernahme.
  emptyValueForType,
  buildProfileFillMap,
  profileSuggestGroups,
};
