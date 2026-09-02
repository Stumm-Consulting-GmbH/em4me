// 4T-000448/4T-000491 (Epic 3E-000083/3E-000093): Editor-Logik der Eigenschafts-
// Profile — die Wirkung EINER Definition in den beiden Panels: weiche
// Hinweise, Vorschlags-Listen und die Komplett-Übernahme.
//
// Eigene Datei seit 4T-001161 (Epic 3E-000219), beim Erreichen des Datei-Budgets.
// Die Naht folgt der, die der Gegenstand ohnehin führt: In der Fassade
// `property-profiles.js` liegt die AUFLÖSUNG über mehrere Profile, hier die
// Wirkung einer aufgelösten Definition an der Oberfläche. Alle Verbraucher
// laden unverändert die Fassade, die alles Öffentliche weiterreicht.
//
// Reine Funktionen, gemeinsam für Properties-Editor und Block-Panel (ein
// Verhalten, zwei Oberflächen — Task-Vorgabe 4T-000449).
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { cleanString, DERIVED_TYPES } = require('./property-profiles-format.js');

// 4T-001185 (Epic 3E-000221, E1): Ein abgeleitetes Feld hat keinen eigenen Wert.
// Es wird deshalb weder vorgeschlagen noch übernommen — beides legte es als
// gewöhnliches Feld im Metadaten-Block an und schriebe damit genau den Wert in
// die Datei, den E1 dort verbietet. Die Prüfung steht hier einmal, weil
// Vorschlags-Menü und Komplett-Übernahme dieselbe Regel brauchen.
function istAbgeleiteteDefinition(def) {
  return !!def && DERIVED_TYPES.includes(def.type);
}

// --- 4T-000448 (Epic 3E-000083): Editor-Logik (Vorschläge und weiche Hinweise) --------
// Reine Funktionen, gemeinsam für Properties-Editor und Block-Panel
// (ein Verhalten, zwei Oberflächen — Task-Vorgabe 4T-000449).

// Leerer Eigenschafts-Wert: Feld angelegt, aber ohne Inhalt — dafür gibt es
// keinen Hinweis (weiche Haltung; ein leeres Feld ist kein Verstoß).
function isEmptyPropertyValue(v) {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  // 4T-001186 (Epic 3E-000221): Ein Objekt ohne gesetzte Kind-Felder ist leer wie
  // eine leere Liste. Ohne diese Zeile trüge ein frisch angelegtes Objekt-Feld
  // sofort einen Hinweis, obwohl der Anwender nur noch nichts eingetragen hat —
  // und ein leeres Feld ist nie ein Verstoß (weiche Haltung, E10).
  if (istEinfachesObjekt(v)) return Object.keys(v).length === 0;
  return false;
}

// Ein einfaches Objekt: kein Array, kein null, kein Datum o. Ä. Die Prüfung
// steht hier einmal, weil Typ-Prüfung, Leer-Frage und Leer-Wert sie teilen.
function istEinfachesObjekt(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Passt der Ist-Wert (JS-Wert aus YAML bzw. Block-Daten) zum definierten Typ?
// 4T-001155 (Epic 3E-000219): um 'link' und 'time' erweitert. Ein Verweis ist
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
    // 4T-001186 (Epic 3E-000221, E11): die beiden strukturierten Typen. Geprüft
    // wird hier nur die GESTALT — ein Objekt beziehungsweise eine Liste von
    // Objekten. Ob die Kind-Werte zu ihren Kind-Definitionen passen, prüft
    // `valueMatchesDefinition`, weil dafür die Definition nötig ist.
    case 'object':
      return istEinfachesObjekt(value);
    case 'objectlist':
      return Array.isArray(value) && value.every((item) => istEinfachesObjekt(item));
    default:
      return true;
  }
}

// 4T-001155 (Epic 3E-000219): Passt der Ist-Wert zur Definition, also zum Typ
// **und** zum Mehrfach-Modus? Seit der Entkopplung (E11) tragen auch Typen
// mehrere Werte, deren Name das nicht mehr verrät — ein Verweis-Feld mit
// `multiple` erwartet eine Liste, obwohl sein Typ 'link' heißt. Das
// historische 'multistring' prüft seine Liste weiterhin selbst und läuft
// deshalb nicht doppelt durch die Listen-Regel.
function valueMatchesDefinition(value, def) {
  if (def.multiple === true && def.type !== 'multistring') {
    return Array.isArray(value) && value.every((item) => valueMatchesType(item, def.type));
  }
  if (!valueMatchesType(value, def.type)) return false;
  // 4T-001186 (Epic 3E-000221): Bei den Objekt-Typen geht die Prüfung eine Ebene
  // tiefer — die Gestalt allein sagt nichts über den Inhalt.
  //
  // **Ein nicht gesetztes Kind-Feld ist dabei kein Verstoß.** Geprüft werden
  // nur die Kind-Werte, die dastehen. AK4 der Story verlangt sogar
  // ausdrücklich, dass ein fehlendes Kind-Feld als fehlend erkennbar bleibt,
  // statt aufgefüllt zu werden; es dann als Typ-Abweichung zu melden wäre der
  // Widerspruch dazu.
  //
  // **Ein Kind-Wert, den keine Definition erklärt, ist ebenfalls kein
  // Verstoß.** Die Definitions-Liste ist ein Angebot und keine Schranke —
  // dieselbe Haltung, mit der ein Dokument Felder tragen darf, die kein Profil
  // kennt.
  if (def.type === 'object') return kindWerteVertraeglich(value, def.fields);
  if (def.type === 'objectlist') {
    return value.every((eintrag) => kindWerteVertraeglich(eintrag, def.fields));
  }
  return true;
}

// Passen die gesetzten Kind-Werte eines Objekts zu ihren Kind-Definitionen?
// Ohne erklärte Kinder passt jedes Objekt (ein Objekt-Typ ohne `fields` ist
// zulässig, siehe Format-Modul).
function kindWerteVertraeglich(objekt, kinder) {
  if (!Array.isArray(kinder) || kinder.length === 0) return true;
  if (!istEinfachesObjekt(objekt)) return false;
  for (const kind of kinder) {
    const name = cleanString(kind && kind.name);
    if (name === '') continue;
    const wert = objekt[name];
    if (wert === undefined || isEmptyPropertyValue(wert)) continue;
    if (!valueMatchesDefinition(wert, kind)) return false;
  }
  return true;
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

// 4T-001157 (Epic 3E-000219, E12): Hinweis zur QUELLE eines Wertevorrats, im
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
    // 4T-001185: Ein abgeleitetes Feld ist kein Angebot — es entsteht nicht
    // durch Anlegen, sondern durch Rechnen.
    if (istAbgeleiteteDefinition(def)) continue;
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

// --- 4T-000491 (Epic 3E-000093): Komplett-Übernahme von Profil-Feldern -----------
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
  // 4T-001186 (Epic 3E-000221): leeres Objekt bzw. leere Liste. Die Begründung des
  // typgerechten Leer-Werts oben — «echtes unbelegt ist nicht stabil
  // darstellbar» — trägt hier NICHT weiter: Ein nicht gesetztes Kind-Feld ist
  // sehr wohl darstellbar, und AK4 der Story verlangt, dass es als fehlend
  // erkennbar bleibt. Ein neues Objekt-Feld entsteht deshalb leer, und seine
  // Kind-Felder werden ausdrücklich NICHT vorbelegt.
  if (type === 'object') return {};
  if (type === 'objectlist') return [];
  return '';
}

// 4T-001156 (Epic 3E-000219): Leer-Wert einer ganzen Definition. Seit der
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
    // 4T-001185: abgeleitete Felder werden nie übernommen (Begründung oben).
    if (istAbgeleiteteDefinition(def)) continue;
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
  // 4T-000448: weiche Hinweise und Vorschläge.
  isEmptyPropertyValue,
  valueMatchesType,
  valueMatchesDefinition,
  fieldDefinitionHint,
  // 4T-001157: Hinweis zur Quelle eines Wertevorrats.
  valueSourceHint,
  profileFieldSuggestions,
  // 4T-000491: Komplett-Übernahme.
  emptyValueForType,
  // 4T-001156: Leer-Wert einer ganzen Definition (Mehrfach-Modus).
  emptyValueForDefinition,
  buildProfileFillMap,
  profileSuggestGroups,
};
