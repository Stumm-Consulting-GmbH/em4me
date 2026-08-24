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
// Die Bereichsdatei-Sektion `propertyProfiles` liegt seit 4T-1159 in
// property-profiles-config.js; von hier wird sie nur weitergereicht.
//
// Feld-Definition im Profil-Frontmatter (`fields`-Liste; erweitertes Format
// 4T-1141/3E-0218, Typ-Ausbau 4T-1155/3E-0219 — der Feldname bleibt die
// einzige Pflichtangabe, jede bestehende Profil-Datei bleibt unverändert
// gültig):
//   { name       Feldname (Pflicht, eindeutig pro Definitions-Ebene)
//     type       'string' | 'multistring' | 'number' | 'boolean' | 'date' |
//                'multiline' | 'link' | 'time' (Default 'string';
//                'multistring' bei multiple ohne erklärten Typ)
//     values     optional: fester Wertebereich (Werte-Liste)
//     valuesFrom optional: Quelle des Wertevorrats { note, query } — wird
//                gelesen und geführt, ausgewertet wird sie in 4T-1157/1158;
//                schließt values aus (values gewinnt, Hinweis)
//     multiple   optional: mehrere Werte. Seit 4T-1155 für jeden Typ außer
//                boolean und multiline; nur beim historischen Paar
//                string/multistring wechselt dabei der Typ-Name, sonst
//                trägt die Vielzahl allein dieses Flag
//     default    optional: Vorbelegung beim Anlegen über den Editor
//     options    optional: typ-eigene Angaben als Unterobjekt (E9); seit
//                4T-1155 je Typ geprüft, Katalog in
//                property-profiles-options.js
//     fields     optional: verschachtelte Kind-Definitionen, rekursiv nach
//                demselben Schema (Objekt-Typen bedient erst Stufe 4);
//                Kind-Definitionen und ihre Hinweise tragen `path` (die
//                Eltern-Feldnamen von außen nach innen) }
//
// Die neuen Angaben erscheinen nur dann am Definitions-Objekt, wenn die
// Profil-Datei sie trägt: Die belegten Bestands-Formen liefern exakt
// dieselben Objekte wie vor der Erweiterung (Rückwärts-Verträglichkeit,
// tragende Auflage über alle vier Stufen).
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

// 4T-1155 (Epic 3E-0219): der Katalog typ-eigener Angaben und ihre Prüfung
// liegen in einem eigenen Blatt-Modul; hier wird nur je Definition gefragt.
const { normalizeOptions } = require('./property-profiles-options.js');
// 4T-1159 (Epic 3E-0219): Die Bereichs-Sektion liegt seit den Bindungen im
// eigenen Modul; das Format-Modul reicht sie nur noch weiter (die Fassade
// bleibt damit der eine Ort, an dem alle Verbraucher laden).
const { DEFAULT_ASSIGN_FIELD, normalizeProfilesConfig } = require('./property-profiles-config.js');

// Die editierbaren Eigenschafts-Typen — bewusst deckungsgleich mit
// PROPERTY_TYPES des Properties-Editors ohne den internen 'readonly'-
// Fallback (der ist Inferenz-Ergebnis verschachtelter YAML-Strukturen,
// keine definierbare Vorgabe).
// 4T-1155 (Epic 3E-0219, E11): um `link` (Verweis auf eine Datei) und `time`
// (Uhrzeit) erweitert. Die beiden Objekt-Typen bleiben Stufe 4 vorbehalten;
// ihre Kind-Definitionen trägt das Format seit 4T-1141 bereits.
const PROFILE_FIELD_TYPES = [
  'string',
  'multistring',
  'number',
  'boolean',
  'date',
  'multiline',
  'link',
  'time',
];

// 4T-1155: Typen ohne sinnvolle Mehrfach-Darstellung. Seit der Entkopplung
// des Mehrfach-Modus vom festen Wertebereich (E11) gilt `multiple` für jeden
// anderen Typ; nur diese beiden bleiben der Hinweis-Fall multipleType —
// ein Wahrheitswert hat seine zwei Werte per Konstruktion, ein mehrzeiliger
// Text ist Freitext.
const MULTIPLE_INCAPABLE_TYPES = ['boolean', 'multiline'];

// 4T-1155: Uhrzeit im 24-Stunden-Format, Sekunden optional. Gegenstück zur
// ISO-Prüfung des Datums; ein Zeit-Wert steht im Metadaten-Block in
// Anführungszeichen, weil YAML `09:30` sonst als Sexagesimal-Zahl liest
// (Konzept 6.12).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
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
  // string, date, multiline, link, time: String-Skalar; date zusätzlich im
  // ISO-Format und time im 24-Stunden-Format (ein nicht darstellbarer Wert
  // wäre im Editor nicht als Vorgabe verwendbar). Ein Verweis-Default bleibt
  // ungeprüfter Text: Die Schreibweise eines Ziels ist freie Nutzer-Eingabe,
  // und ein nicht auflösbares Ziel ist eine Frage des Bedienelements, keine
  // des Formats (4T-1155).
  const s = scalarToString(raw);
  if (s === null) return { ok: false };
  if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false };
  if (type === 'time' && !TIME_RE.test(s)) return { ok: false };
  return { ok: true, value: s };
}

// 4T-1141 (Epic 3E-0218): typ-eigene Angaben (`options`, E9). Muss ein
// einfaches Objekt sein.
//
// 4T-1155 (Epic 3E-0219): Der Inhalt wird nicht mehr blind kopiert, sondern
// je erklärtem Typ gegen den Katalog unten geprüft. Die weiche Linie bleibt
// dabei unverändert und wird ausdrücklich NICHT verschärft: Eine unbekannte
// oder unpassend belegte Option entfällt einzeln, das Feld bleibt wirksam,
// und die übrigen Optionen desselben Objekts bleiben es auch. Damit darf
// eine Profil-Datei, die für eine spätere Stufe geschrieben wurde, heute
// schon dastehen, ohne Schaden anzurichten.
//
// Ein Prüfer liefert den normalisierten Wert oder null (= Wert nicht
// bildbar, Hinweis-Code optionValue); `expected` ist die maschinen-lesbare
// Erwartung für die Meldung.
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
  // 4T-1155: seit der Entkopplung des Mehrfach-Modus nennt die Erwartung
  // nicht mehr einen Ziel-Typ, sondern die mehrfach-fähigen Typen; die
  // Prüfstelle setzt sie beim Melden.
  multipleType: { key: 'multiple', expected: null },
  optionUnknown: { key: 'options', expected: null }, // expected: die zulässigen Schlüssel
  optionValue: { key: 'options', expected: null }, // expected: die erwartete Form
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
  // 4T-1161: Symbol-Angabe eines Profils (genau ein Graphem).
  icon: { key: 'icon', expected: 'single-grapheme' },
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
//   multipleType           multiple an einem Typ ohne Mehrfach-Darstellung
//   values                 Werte-Liste nicht bildbar (kein Array, leer nach
//                          Normalisierung oder Typ ohne Wertebereich)
//   default                Default passt nicht zum Typ (nur Default entfällt)
//   defaultOutsideValues   Default außerhalb des Wertebereichs (bleibt —
//                          weiche Haltung, Hinweis für die Profil-Pflege)
//   options                Options-Objekt nicht bildbar (entfällt, Feld bleibt)
//   optionUnknown          Options-Schlüssel am erklärten Typ nicht vorgesehen
//                          (entfällt einzeln, Feld und übrige Optionen bleiben)
//   optionValue            Options-Schlüssel vorgesehen, Wert nicht bildbar
//                          (entfällt einzeln; auch der Fall min über max)
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

    // 4T-1155 (E11): Der Mehrfach-Modus gilt jetzt für jeden Typ, bei dem
    // mehrere Werte sinnvoll sind — die Typ-Regel aus 4T-1141 ist damit
    // aufgelöst. Nur `boolean` und `multiline` bleiben der Hinweis-Fall.
    //
    // Das historische Paar string/multistring bleibt erhalten: Ein
    // Mehrfach-Textfeld heißt weiterhin `multistring`, damit jede bestehende
    // Profil-Datei und jeder Verbraucher unverändert gültig bleiben. Bei
    // allen anderen Typen trägt die Vielzahl das Flag, nicht der Typ-Name —
    // ein Verweis-Feld mit mehreren Zielen bleibt `link` mit multiple.
    const hasValues = entry.values !== undefined && entry.values !== null;
    if (multiple && MULTIPLE_INCAPABLE_TYPES.includes(type)) {
      return fail(
        'multipleType',
        name,
        PROFILE_FIELD_TYPES.filter((t) => !MULTIPLE_INCAPABLE_TYPES.includes(t)),
      );
    }
    if (multiple && (type === 'string' || type === 'multistring')) type = 'multistring';

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

    // 4T-1155: Ein Feld hat einen Wertevorrat, wenn eine feste Liste oder
    // eine brauchbare Quelle dasteht; davon hängt ab, ob die Optionen der
    // Auswahl gelten. Vorgezogen berechnet, weil die Options-Prüfung sie
    // braucht und der valuesFrom-Block weiter unten steht — die Reihenfolge
    // der Hinweise bleibt dadurch unverändert.
    const valuesFromNorm =
      !hasValues && entry.valuesFrom !== undefined && entry.valuesFrom !== null
        ? normalizeValuesFrom(entry.valuesFrom)
        : null;
    const hasValueSource = values !== null || valuesFromNorm !== null;

    if (entry.options !== undefined && entry.options !== null) {
      const geprueft = normalizeOptions(entry.options, type, hasValueSource);
      if (geprueft === null) fail('options', name);
      else {
        for (const hint of geprueft.hints) fail(hint.code, name, hint.expected);
        def.options = geprueft.options;
      }
    }

    if (entry.valuesFrom !== undefined && entry.valuesFrom !== null) {
      if (hasValues) {
        // Widerspruch: fester Wertebereich und Quelle zugleich — values
        // gewinnt, die Quelle entfällt mit Hinweis (Konzept 6.12).
        fail('valuesFromConflict', name);
      } else if (valuesFromNorm === null) {
        fail('valuesFrom', name);
      } else {
        def.valuesFrom = valuesFromNorm;
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
// 4T-1161 (Epic 3E-0219, E5): Symbol-Angabe eines Profils normalisieren.
// Genau EIN Graphem; alles andere entfällt mit Hinweis, das Profil bleibt
// wirksam (weiche Linie). `Intl.Segmenter` zählt Graphem-Cluster und liegt
// damit richtig bei Emoji aus mehreren Code-Punkten; ohne die Schnittstelle
// (sehr alte Laufzeit) zählt der Code-Punkt-Fallback, der im schlimmsten
// Fall ein zusammengesetztes Emoji abweist statt eines durchzulassen.
function grapheme(s) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;
  }
  return [...s].length;
}

function normalizeIcon(raw, errors) {
  if (raw === undefined || raw === null) return null;
  const s = cleanString(raw);
  if (s === '') return null;
  if (grapheme(s) !== 1) {
    errors.push(buildHint('icon', -1, null));
    return null;
  }
  return s;
}

function parseProfileHeritage(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    // 4T-1161: dieselbe Objekt-Form wie der normale Weg — ein früher
    // Ausstieg, der eine andere Gestalt liefert, ist eine Falle für jeden
    // Verbraucher, der die Schlüssel-Menge liest.
    return { parent: null, exclude: [], icon: null, errors };
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
  // 4T-1161 (Epic 3E-0219, E5): Symbol des Profils (`icon`). Ein freies
  // Zeichen und keine ID aus dem internen Icon-Satz — der ist auf Kommandos
  // zugeschnitten und führt für Dokument-Arten wie Person, Sitzung oder Buch
  // keine Entsprechung (PO-Entscheidung vom 2026-08-23, gekennzeichnete
  // Abweichung von «Vorhandenes wiederverwenden»).
  //
  // Geprüft wird die Länge in **Graphemen**, nicht in Code-Einheiten: Ein
  // Emoji mit Variantenselektor oder Hautton besteht aus mehreren
  // Code-Punkten und wäre nach `length` fälschlich zu lang.
  const icon = normalizeIcon(data.icon, errors);
  return { parent, exclude, icon, errors };
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
