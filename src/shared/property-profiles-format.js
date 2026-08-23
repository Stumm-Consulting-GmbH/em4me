// 4T-0446 (Epic 3E-0083): Eigenschafts-Profile — Datei-Format der Profile,
// Definitions-Parsing und Bereichs-Konfiguration.
//
// Eigene Datei seit dem Definitions-Ausbau der Stufe 1 (4T-1145, Epic
// 3E-0218): Der Schnitt folgt der Naht, die der Gegenstand ohnehin führt.
// Hier liegt, was eine Profil-DATEI liest und normalisiert; die Auflösung
// über mehrere Profile und die gemeinsame Editor-Logik bleiben in der
// Fassade `property-profiles.js`, die alles Öffentliche weiterreicht. Alle
// Verbraucher laden unverändert die Fassade.
//
// Ein Profil ist eine normale Markdown-Datei im Profil-Ordner des Bereichs;
// ihr Frontmatter-Schlüssel `fields` trägt die zentralen Feld-Definitionen
// für die Eigenschafts-Editoren (Dokument-Properties und Block-Panel), der
// Datei-Inhalt ist freie Beschreibung. Profil-Name = Datei-Titel (Dateiname
// ohne .md).
//
// Bereichsdatei-Sektion `propertyProfiles` (Area_Settings.mdda, Sektions-
// Muster mit Fehler-Isolation; Vorbilder templates-/journals-Sektion):
//   propertyProfiles: {
//     folder         Profil-Ordner relativ zur Bereichs-Wurzel
//     assignField    Zuordnungs-Feldname im Frontmatter (Default 'class')
//     defaultProfile Profil-Name des Standard-Profils oder null
//   }
//
// Feld-Definition im Profil-Frontmatter (`fields`-Liste; erweitertes Format
// 4T-1141/3E-0218 — der Feldname bleibt die einzige Pflichtangabe, jede
// bestehende Profil-Datei bleibt unverändert gültig):
//   { name       Feldname (Pflicht, eindeutig pro Definitions-Ebene)
//     type       'string' | 'multistring' | 'number' | 'boolean' | 'date' |
//                'multiline' (Default 'string'; 'multistring' bei multiple)
//     values     optional: fester Wertebereich (Werte-Liste)
//     valuesFrom optional: Quelle des Wertevorrats { note, query } — wird
//                gelesen und geführt, die Auswertung folgt in Stufe 2 (E12);
//                schließt values aus (values gewinnt, Hinweis)
//     multiple   optional: Mehrfach-Auswahl (effektiver Typ 'multistring');
//                vom festen Wertebereich entkoppelt (E11), die Typ-Regel
//                multistring bleibt bis zum Typ-Ausbau der Stufe 2
//     default    optional: Vorbelegung beim Anlegen über den Editor
//     options    optional: typ-eigene Angaben als Unterobjekt (E9) — wird
//                geführt, in dieser Stufe wertet kein Typ eine Option aus
//     fields     optional: verschachtelte Kind-Definitionen, rekursiv nach
//                demselben Schema (Objekt-Typen bedient erst Stufe 4);
//                Kind-Definitionen und ihre Hinweise tragen `path` (die
//                Eltern-Feldnamen von außen nach innen) }
//
// Die neuen Angaben erscheinen nur dann am Definitions-Objekt, wenn die
// Profil-Datei sie trägt: Die belegten Bestands-Formen liefern exakt
// dieselben Objekte wie vor der Erweiterung (Rückwärts-Verträglichkeit,
// tragende Auflage der Stufe 1).
//
// Profil-Ebene der Vererbung (4T-1142/3E-0218, E2): Der Metadaten-Block
// einer Profil-Datei kann neben `fields` die Angaben `extends` (höchstens
// ein Eltern-Profil) und `exclude` (Feldnamen, die aus der geerbten Kette
// nicht übernommen werden) tragen; `parseProfileHeritage` normalisiert
// beide, die Kette selbst läuft in der Fassade.
//
// Validierung ist weich nach dem Fehler-Isolations-Muster der Bereichsdatei
// und der PO-Entscheidung 3 (Hinweise statt Blockade): defekte Einzel-
// Definitionen entfallen und werden als Hinweis gesammelt (nie ein Wurf),
// die übrigen Definitionen des Profils bleiben wirksam; ein unpassender
// Default setzt nur den Default aus.
//
// Prozess-neutral (kein Electron, kein DOM): Main (Datenpfad, Auflösung)
// und Renderer (Editoren, Einstellungen) laden dieselbe Kette.
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

// 4T-1141 (Epic 3E-0218): typ-eigene Angaben (`options`, E9). Muss ein
// einfaches Objekt sein; der Inhalt wird flach kopiert und unbewertet
// geführt — welche Schlüssel je Typ gelten, definiert erst der Typ-Ausbau.
// null = nicht bildbar (Hinweis beim Aufrufer, das Feld bleibt).
function normalizeOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return { ...raw };
}

// 4T-1141 (Epic 3E-0218): Quelle des Wertevorrats (`valuesFrom`, E12).
// Trägt `note` (Pfad einer Werte-Notiz) und/oder `query` (Abfrage-Text);
// beides wird gelesen, nicht ausgewertet (das Lesen der Quellen ist Stufe 2).
// null = kein Objekt oder keine verwendbare Unter-Angabe (Hinweis beim
// Aufrufer, das Feld bleibt).
function normalizeValuesFrom(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const note = cleanString(raw.note) || null;
  const query = cleanString(raw.query) || null;
  if (note === null && query === null) return null;
  return { note, query };
}

// 4T-1143 (Epic 3E-0218, E4): Ortsbezug des Hinweis-Datensatzes. Jeder
// Hinweis trägt neben { code, index, name } die betroffene Angabe (`key`)
// und, wo eine konkrete Erwartung besteht, ihre maschinen-lesbare, nicht
// übersetzte Form (`expected`) — die Übersetzung setzt sie ein, statt sie
// zu erzeugen. Kontextabhängige Erwartungen (Typ-Satz, erklärter Typ,
// Wertebereich) setzt die Prüfstelle beim Melden; für die übrigen Codes
// steht die Erwartung hier fest.
const HINT_META = {
  fieldsNotList: { key: 'fields', expected: 'list' },
  entry: { key: null, expected: 'object' },
  name: { key: 'name', expected: null },
  duplicate: { key: 'name', expected: null },
  type: { key: 'type', expected: null }, // expected: der zulässige Typ-Satz
  multipleType: { key: 'multiple', expected: 'multistring' },
  values: { key: 'values', expected: 'list' },
  default: { key: 'default', expected: null }, // expected: der erklärte Typ
  defaultOutsideValues: { key: 'default', expected: null }, // expected: der Wertebereich
  options: { key: 'options', expected: 'object' },
  valuesFrom: { key: 'valuesFrom', expected: ['note', 'query'] },
  valuesFromConflict: { key: 'valuesFrom', expected: 'values' },
  childFieldsNotList: { key: 'fields', expected: 'list' },
  extendsMultiple: { key: 'extends', expected: 'single' },
  extendsMissing: { key: 'extends', expected: null },
  extendsCycle: { key: 'extends', expected: null },
};

// Baut einen Hinweis in der einheitlichen Gestalt { code, index, name, key,
// expected } (plus `path` bei Kind-Definitionen, vom Aufrufer ergänzt).
function buildHint(code, index, name, expected) {
  const meta = HINT_META[code] || { key: null, expected: null };
  return {
    code,
    index,
    name: name || null,
    key: meta.key,
    expected: expected !== undefined ? expected : meta.expected,
  };
}

// Parst die Feld-Definitionen aus dem Frontmatter-Objekt einer Profil-Datei.
// Liefert { fields, errors }: fields sind die gültigen, normalisierten
// Definitionen { name, type, values, multiple, default } plus — nur wenn die
// Datei sie trägt — { options, valuesFrom, fields, path }, errors die
// gesammelten Hinweise { code, index, name, key, expected } (index =
// Position in der jeweiligen Definitions-Liste, name falls bekannt, key die
// betroffene Angabe, expected die maschinen-lesbare Erwartung; Hinweise aus
// Kind-Definitionen tragen zusätzlich `path`). Fehler-Codes:
//   fieldsNotList          `fields` ist keine Liste (Profil ohne Wirkung)
//   entry                  Definition ist kein Objekt
//   name                   Feldname fehlt oder ist leer
//   duplicate              Feldname doppelt (case-insensitiv, je Ebene)
//   type                   unbekannter Typ
//   multipleType           multiple mit explizitem Nicht-multistring-Typ
//   values                 Werte-Liste nicht bildbar (kein Array, leer nach
//                          Normalisierung oder Typ ohne Wertebereich)
//   default                Default passt nicht zum Typ (nur Default entfällt)
//   defaultOutsideValues   Default außerhalb des Wertebereichs (bleibt —
//                          weiche Haltung, Hinweis für die Profil-Pflege)
//   options                Options-Objekt nicht bildbar (entfällt, Feld bleibt)
//   valuesFrom             Quelle nicht bildbar (entfällt, Feld bleibt)
//   valuesFromConflict     values und valuesFrom zugleich (values gilt,
//                          valuesFrom entfällt)
//   childFieldsNotList     Kind-`fields` ist keine Liste (entfällt, Feld bleibt)
// `multiple` ohne `values` ist seit der Entkopplung des Mehrfach-Modus (E11)
// gültig; der frühere Code multipleWithoutValues ist ersatzlos entfallen.
//
// Eine Definitions-Liste (oben wie verschachtelt) läuft durch dieselbe
// Prüfung mit Fehler-Isolation je Definition; `path` sind die Eltern-
// Feldnamen von außen nach innen (oberste Ebene: leer, ohne `path`-Angabe).
function parseDefinitionList(rawList, path, errors) {
  const fields = [];
  const seen = new Set();
  rawList.forEach((entry, index) => {
    const fail = (code, name, expected) => {
      const err = buildHint(code, index, name, expected);
      if (path.length > 0) err.path = path;
      errors.push(err);
    };
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail('entry');
    const name = cleanString(entry.name);
    if (name === '') return fail('name');
    if (seen.has(name.toLowerCase())) return fail('duplicate', name);

    const multiple = entry.multiple === true;
    const declaredType = cleanString(entry.type);
    let type = declaredType || (multiple ? 'multistring' : 'string');
    if (!PROFILE_FIELD_TYPES.includes(type)) return fail('type', name, PROFILE_FIELD_TYPES);

    // multiple ist vom festen Wertebereich entkoppelt (E11, 4T-1141); die
    // Typ-Regel bleibt, bis der Typ-Ausbau der Stufe 2 weitere Typen mit
    // Mehrfach-Darstellung bringt (PO-Bestätigung vom 2026-08-23).
    const hasValues = entry.values !== undefined && entry.values !== null;
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
        fail('default', name, type);
      } else {
        defaultValue = norm.value;
        if (values !== null) {
          const items = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
          if (!items.every((v) => values.includes(v))) fail('defaultOutsideValues', name, values);
        }
      }
    }

    const def = { name, type, values, multiple: effectiveMultiple, default: defaultValue };
    if (path.length > 0) def.path = path;

    if (entry.options !== undefined && entry.options !== null) {
      const options = normalizeOptions(entry.options);
      if (options === null) fail('options', name);
      else def.options = options;
    }

    if (entry.valuesFrom !== undefined && entry.valuesFrom !== null) {
      if (hasValues) {
        // Widerspruch: fester Wertebereich und Quelle zugleich — values
        // gewinnt, die Quelle entfällt mit Hinweis (Konzept 6.12).
        fail('valuesFromConflict', name);
      } else {
        const valuesFrom = normalizeValuesFrom(entry.valuesFrom);
        if (valuesFrom === null) fail('valuesFrom', name);
        else def.valuesFrom = valuesFrom;
      }
    }

    if (entry.fields !== undefined && entry.fields !== null) {
      if (!Array.isArray(entry.fields)) fail('childFieldsNotList', name);
      else def.fields = parseDefinitionList(entry.fields, [...path, name], errors);
    }

    seen.add(name.toLowerCase());
    fields.push(def);
  });
  return fields;
}

function parseProfileFields(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { fields: [], errors };
  const raw = data.fields;
  if (raw === undefined || raw === null) return { fields: [], errors };
  if (!Array.isArray(raw)) {
    errors.push(buildHint('fieldsNotList', -1, null));
    return { fields: [], errors };
  }
  return { fields: parseDefinitionList(raw, [], errors), errors };
}

// 4T-1142 (Epic 3E-0218): Profil-Ebene der Vererbung (E2). `extends` nennt
// höchstens ein Eltern-Profil; eine Liste mit mehr als einem Eintrag ist der
// Hinweis-Fall extendsMultiple und keine Mehrfach-Vererbung (tolerant zählt
// der erste Eintrag). `exclude` nennt Feldnamen, die aus der geerbten Kette
// nicht übernommen werden (Skalar oder Liste; nicht verwertbare Einträge
// entfallen still, wie in einer Werte-Liste). Hinweis-Texte: 4T-1143.
function parseProfileHeritage(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { parent: null, exclude: [], errors };
  }
  let parent = null;
  const rawExtends = data.extends;
  if (rawExtends !== undefined && rawExtends !== null) {
    if (Array.isArray(rawExtends)) {
      const names = rawExtends.map((v) => scalarToString(v)).filter((s) => s !== null && s !== '');
      parent = names.length > 0 ? names[0] : null;
      if (rawExtends.length > 1) {
        errors.push(buildHint('extendsMultiple', -1, parent));
      }
    } else {
      const s = scalarToString(rawExtends);
      parent = s !== null && s !== '' ? s : null;
    }
  }
  const exclude = [];
  const pushExclude = (v) => {
    const s = scalarToString(v);
    if (s !== null && s !== '' && !exclude.includes(s)) exclude.push(s);
  };
  const rawExclude = data.exclude;
  if (Array.isArray(rawExclude)) rawExclude.forEach(pushExclude);
  else if (rawExclude !== undefined && rawExclude !== null) pushExclude(rawExclude);
  return { parent, exclude, errors };
}

module.exports = {
  PROFILE_FIELD_TYPES,
  DEFAULT_ASSIGN_FIELD,
  normalizeProfilesConfig,
  parseProfileFields,
  parseProfileHeritage,
  buildHint,
  // Von der Fassade mitbenutzte Normalisierer (Auflösung und Editor-Logik
  // vergleichen Namen nach denselben Regeln wie das Parsen).
  cleanString,
  scalarToString,
};
