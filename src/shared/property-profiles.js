// 4T-0447/4T-0448 (Epic 3E-0083): Eigenschafts-Profile — Auflösung über
// mehrere Profile und die gemeinsame Editor-Logik beider Panels.
//
// Diese Datei ist zugleich die **Fassade** der Eigenschafts-Profile: Alle
// Verbraucher (Profil-Katalog, IPC, Editoren, Einstellungen, Tests) laden
// sie und bekommen von hier auch das Datei-Format weitergereicht, das seit
// dem Definitions-Ausbau der Stufe 1 in `property-profiles-format.js` liegt
// (Schnitt in 4T-1145, Epic 3E-0218: dort das Lesen EINER Profil-Datei,
// hier das Zusammenführen MEHRERER und ihre Wirkung in den Editoren).
//
// Auflösung für eine Datei (4T-0447): Vereinigung der Feld-Definitionen aus
// den zugeordneten Profilen samt ihren Eltern-Ketten plus dem Standard-
// Profil mit seiner Kette, als eine einzige geordnete Folge mit
// deterministischen Konflikt-Regeln. Blöcke einer Datei erben dieselbe
// Auflösung (PO-Entscheidung 4; keine eigene Block-Zuordnung in v1).
//
// Vererbung (4T-1142/3E-0218, E2): `resolveProfileFields` läuft die
// Eltern-Ketten ab, `attachHeritageHints` liefert die Zyklus- und
// Fehlt-Hinweise der Profil-Liste; die Angaben selbst liest das
// Format-Modul (`parseProfileHeritage`).
//
// Prozess-neutral (kein Electron, kein DOM): Main (Datenpfad, Auflösung)
// und Renderer (Editoren, Einstellungen) laden dasselbe Modul.
'use strict';

const {
  PROFILE_FIELD_TYPES,
  DEFAULT_ASSIGN_FIELD,
  normalizeProfilesConfig,
  parseProfileFields,
  parseProfileHeritage,
  buildHint,
  cleanString,
  scalarToString,
} = require('./property-profiles-format.js');

// 4T-1142: Vererbungs-Hinweise je Profil für die Profil-Liste der
// Einstellungen — ein Zyklus in der Eltern-Beziehung (extendsCycle, benannt
// mit dem Profil des ersten Wiedersehens) und ein nicht vorhandenes
// Eltern-Profil (extendsMissing, benannt mit dem fehlenden Namen), beide
// weich: Die Auflösung bricht die Kette nur ab. Liefert die Profil-Liste
// mit den je Profil ergänzten Hinweisen in der Gestalt der
// Definitions-Hinweise ({ code, index: -1, name }); Profile ohne Befund
// bleiben dasselbe Objekt. Hinweis-Texte: 4T-1143.
function attachHeritageHints(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  const byName = new Map();
  for (const p of list) {
    const key = cleanString(p && p.name).toLowerCase();
    if (key !== '' && !byName.has(key)) byName.set(key, p);
  }
  return list.map((p) => {
    const hints = [];
    const visited = new Set();
    let current = p;
    while (current) {
      const key = cleanString(current.name).toLowerCase();
      if (visited.has(key)) {
        hints.push(buildHint('extendsCycle', -1, cleanString(current.name)));
        break;
      }
      visited.add(key);
      const parentName = cleanString(current.parent);
      if (parentName === '') break;
      const parentProfile = byName.get(parentName.toLowerCase());
      if (!parentProfile) {
        hints.push(buildHint('extendsMissing', -1, parentName));
        break;
      }
      current = parentProfile;
    }
    if (hints.length === 0) return p;
    return { ...p, errors: [...(Array.isArray(p.errors) ? p.errors : []), ...hints] };
  });
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
// profiles: Katalog [{ name, fields, parent, exclude }] (geparste
// Profil-Dateien; parent/exclude aus parseProfileHeritage, optional);
// assigned: Zuordnungs-Werte des Dokuments in Frontmatter-Reihenfolge;
// defaultProfile: Profil-Name des Bereichs-Standard-Profils oder null.
// Liefert { fields, missing }: fields sind die Definitionen ergänzt um
// { profile, fromDefault } (Herkunfts-Kennzeichnung der Editoren), missing
// die zugeordneten bzw. als Standard gesetzten, aber nicht vorhandenen
// Profil-Namen (Hinweis-Grundlage der Einstellungen; ein fehlendes
// Eltern-Profil gehört bewusst nicht hinein, sein Hinweis hängt über
// attachHeritageHints am Profil).
//
// 4T-1142 (Epic 3E-0218, E2): Die Auflösung bleibt eine einzige geordnete
// Folge. Je zugeordnetem Profil in Nennungs-Reihenfolge läuft seine
// Eltern-Kette von unten nach oben, danach das Standard-Profil mit seiner
// Kette. Jedes Profil wird genau einmal verarbeitet, über alle Ketten
// hinweg; ein Wiedersehen beendet die Kette und trägt damit zugleich das
// Standard-Profil in einer Kette und den Zyklus. Bei gleichem Feldnamen
// gewinnt der erste Treffer der Folge (das eigene Feld überschreibt so das
// gleichnamige geerbte ohne eigene Regel). Ein Ausschluss (`exclude`)
// sammelt sich aus den bereits durchlaufenen Profilen einer Kette und
// unterdrückt allein die gleichnamigen Felder der weiter oben liegenden
// Profile dieser Kette; beim Wechsel auf die nächste Kette ist er zurückgesetzt.
function resolveProfileFields(profiles, { defaultProfile, assigned } = {}) {
  const byName = new Map();
  for (const p of Array.isArray(profiles) ? profiles : []) {
    const key = cleanString(p && p.name).toLowerCase();
    if (key !== '' && !byName.has(key)) byName.set(key, p);
  }
  const ordered = [];
  const missing = [];
  const seenProfiles = new Set();
  const walkChain = (rawName, fromDefault) => {
    const name = cleanString(rawName);
    if (name === '') return;
    const startKey = name.toLowerCase();
    if (seenProfiles.has(startKey)) return; // Standard-Profil auch zugeordnet: einmal zählt
    if (!byName.has(startKey)) {
      seenProfiles.add(startKey);
      missing.push(name);
      return;
    }
    const chainExclude = new Set();
    let currentKey = startKey;
    // Ein fehlendes Eltern-Profil oder ein Wiedersehen beendet die Kette
    // still; die Hinweise dazu hängen am Profil (attachHeritageHints).
    while (byName.has(currentKey) && !seenProfiles.has(currentKey)) {
      seenProfiles.add(currentKey);
      const profile = byName.get(currentKey);
      ordered.push({ profile, fromDefault, exclude: new Set(chainExclude) });
      for (const ex of Array.isArray(profile.exclude) ? profile.exclude : []) {
        const exKey = cleanString(ex).toLowerCase();
        if (exKey !== '') chainExclude.add(exKey);
      }
      currentKey = cleanString(profile.parent).toLowerCase();
      if (currentKey === '') break;
    }
  };
  for (const name of Array.isArray(assigned) ? assigned : []) walkChain(name, false);
  walkChain(defaultProfile, true);
  const fields = [];
  const seenFields = new Set();
  for (const { profile, fromDefault, exclude } of ordered) {
    for (const def of Array.isArray(profile.fields) ? profile.fields : []) {
      const key = def.name.toLowerCase();
      if (exclude.has(key)) continue;
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
  // 4T-1145: aus property-profiles-format.js weitergereicht (Fassade).
  PROFILE_FIELD_TYPES,
  DEFAULT_ASSIGN_FIELD,
  normalizeProfilesConfig,
  parseProfileFields,
  // 4T-1142: Vererbung zwischen Profilen.
  parseProfileHeritage,
  attachHeritageHints,
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
