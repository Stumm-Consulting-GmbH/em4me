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
// 4T-1159 (Epic 3E-0219): Bindungen der Bereichs-Sektion.
const { normalizeBindings } = require('./property-profiles-config.js');
// 4T-1176 (Epic 3E-0220, E7): Erzeugung der Abfrage zu einem Profil. Eigene
// Fachlichkeit in eigener Datei; die Fassade reicht sie weiter wie alles
// andere.
const { erzeugeProfilAbfrage } = require('./property-profiles-abfrage.js');
// 4T-1161 (Epic 3E-0219): Die Editor-Logik liegt seit dem Datei-Schnitt im
// eigenen Modul; die Fassade reicht sie weiter (alle Verbraucher laden hier).
const {
  isEmptyPropertyValue,
  valueMatchesType,
  valueMatchesDefinition,
  fieldDefinitionHint,
  valueSourceHint,
  profileFieldSuggestions,
  emptyValueForType,
  emptyValueForDefinition,
  buildProfileFillMap,
  profileSuggestGroups,
} = require('./property-profiles-editor.js');

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
//
// 4T-1159 (Epic 3E-0219, E13): Die Folge ist **vierstufig**, von der
// ausdrücklichsten zur allgemeinsten Aussage:
//   1. Zuordnungs-Feld des Dokuments, in Nennungs-Reihenfolge
//   2. Schlagwort des Dokuments   (Bindung aus der Bereichsdatei)
//   3. Ordner-Pfad des Dokuments  (Bindung aus der Bereichsdatei)
//   4. Standard-Profil des Bereichs
// Innerhalb jeder Stufe gelten die Regeln aus E2 unverändert; über alle
// Stufen hinweg gewinnt bei gleichem Feldnamen der erste Treffer, und jedes
// Profil wird genau einmal verarbeitet. Die Wege **kumulieren**: Ein Dokument
// mit Zuordnungs-Feld UND passendem Ordner trägt die Felder aus beiden.
// Ohne Bindungen und ohne `tags`/`folder` verhält sich die Auflösung exakt
// wie vor der Erweiterung — das ist die Rückwärts-Verträglichkeits-Auflage
// mitten in der laufenden Auflösung.

// 4T-1159 (Epic 3E-0219, E13): Trifft ein Ordner-Pfad des Dokuments eine
// Bindung? Ein gebundener Pfad bindet den Ordner UND seine Unterordner —
// sonst müsste jede Unterteilung nachgepflegt werden. Verglichen wird auf
// dem bereichs-relativen Pfad, case-insensitiv wie alle Pfad-Vergleiche der
// Anwendung, und **an ganzen Ordner-Namen**: «10 Projekte Archiv» darf nicht
// unter «10 Projekte» fallen, was ein reiner Zeichenketten-Präfix täte.
function ordnerTrifft(bindung, ordner) {
  if (typeof ordner !== 'string') return false;
  const o = ordner
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  const b = cleanString(bindung)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  if (b === '') return false;
  return o === b || o.startsWith(b + '/');
}

// Die Profil-Namen einer Bindungs-Stufe, in der Reihenfolge der
// Bindungs-Liste. Mehrere Treffer derselben Stufe verhalten sich damit wie
// mehrere Namen im Zuordnungs-Feld: der zuerst genannte gewinnt.
//
// `art` ist 'tags' oder 'folders'; `bezug` die Schlagwort-Liste des Dokuments
// bzw. sein bereichs-relativer Ordner.
function gebundeneProfile(bindings, art, bezug) {
  if (!Array.isArray(bindings) || bindings.length === 0) return [];
  const namen = [];
  const tagSatz =
    art === 'tags'
      ? new Set((Array.isArray(bezug) ? bezug : []).map((t) => cleanString(t).toLowerCase()))
      : null;
  for (const bindung of bindings) {
    if (!bindung || typeof bindung !== 'object') continue;
    const eintraege = Array.isArray(bindung[art]) ? bindung[art] : [];
    const trifft =
      art === 'tags'
        ? eintraege.some((t) => tagSatz.has(cleanString(t).toLowerCase()))
        : eintraege.some((f) => ordnerTrifft(f, bezug));
    if (!trifft) continue;
    const name = cleanString(bindung.profile);
    if (name !== '' && !namen.includes(name)) namen.push(name);
  }
  return namen;
}

function resolveProfileFields(profiles, { defaultProfile, assigned, bindings, tags, folder } = {}) {
  const byName = new Map();
  for (const p of Array.isArray(profiles) ? profiles : []) {
    const key = cleanString(p && p.name).toLowerCase();
    if (key !== '' && !byName.has(key)) byName.set(key, p);
  }
  const ordered = [];
  const missing = [];
  const seenProfiles = new Set();
  // 4T-1161 (Epic 3E-0219, E5): Welche Stufe der Folge gerade läuft — sie
  // wird am zuerst erreichten Profil festgehalten, damit das Symbol sagen
  // kann, WARUM dieses Profil gilt (Nachvollziehbarkeit aus E13).
  let stufe = 'assigned';
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
    // 4T-1171 (Epic 3E-0220): Wie tief in der Eltern-Kette dieses Profil
    // steht — 0 für das zugeordnete Profil selbst, 1 für dessen Eltern, und
    // so fort. Der Zähler läuft mit der Schleife, die es ohnehin gibt; ein
    // zweiter Durchlauf, der die Tiefe im Nachhinein rekonstruiert, wäre
    // eine zweite Wahrheit über dieselbe Ordnung.
    let tiefe = 0;
    // Ein fehlendes Eltern-Profil oder ein Wiedersehen beendet die Kette
    // still; die Hinweise dazu hängen am Profil (attachHeritageHints).
    while (byName.has(currentKey) && !seenProfiles.has(currentKey)) {
      seenProfiles.add(currentKey);
      const profile = byName.get(currentKey);
      ordered.push({ profile, fromDefault, stufe, tiefe, exclude: new Set(chainExclude) });
      for (const ex of Array.isArray(profile.exclude) ? profile.exclude : []) {
        const exKey = cleanString(ex).toLowerCase();
        if (exKey !== '') chainExclude.add(exKey);
      }
      currentKey = cleanString(profile.parent).toLowerCase();
      if (currentKey === '') break;
      tiefe += 1;
    }
  };
  // 4T-1159 (Epic 3E-0219, E13): Die Folge wird vierstufig. Sie bleibt EINE
  // geordnete Folge — die neuen Wege gehen hinein, nicht daneben, und
  // bekommen deshalb auch keinen eigenen Mechanismus: `seenProfiles` sorgt
  // dafür, dass jedes Profil genau einmal verarbeitet wird, `seenFields`
  // dafür, dass bei gleichem Feldnamen der erste Treffer der Folge gewinnt.
  // Daraus fallen die drei Konstellationen aus Kapitel 6.13 von selbst
  // richtig aus: Die Wege kumulieren, ein Weg auf ein bereits erreichtes
  // Profil fügt nichts hinzu, und ein Widerspruch zwischen Schlagwort und
  // Ordner ist keiner, sobald die Ordnung feststeht.
  for (const name of Array.isArray(assigned) ? assigned : []) walkChain(name, false);
  stufe = 'tag';
  for (const name of gebundeneProfile(bindings, 'tags', tags)) walkChain(name, false);
  stufe = 'folder';
  for (const name of gebundeneProfile(bindings, 'folders', folder)) walkChain(name, false);
  stufe = 'default';
  walkChain(defaultProfile, true);
  const fields = [];
  const seenFields = new Set();
  // 4T-1171 (Epic 3E-0220): Je Feld kommen Weg und Vererbungs-Tiefe mit. Sie
  // fallen hier ohne Zusatzaufwand an, weil `ordered` beide bereits trägt.
  // `fromDefault` bleibt daneben unverändert stehen, obwohl es inhaltlich
  // `stufe === 'default'` entspricht: Es hat eigene Verbraucher, und die
  // Auflage A2 (Rückwärts-Verträglichkeit) macht diesen Task nicht zum Ort,
  // eine ausgelieferte Angabe abzulösen.
  for (const { profile, fromDefault, stufe: feldStufe, tiefe, exclude } of ordered) {
    for (const def of Array.isArray(profile.fields) ? profile.fields : []) {
      const key = def.name.toLowerCase();
      if (exclude.has(key)) continue;
      if (seenFields.has(key)) continue;
      seenFields.add(key);
      fields.push({ ...def, profile: profile.name, fromDefault, stufe: feldStufe, tiefe });
    }
  }
  // 4T-1161 (E5): Das ZUERST aufgelöste Profil trägt das Symbol am Dokument
  // (AK3 der Story). Es ist das erste Element der Folge — kein Sonderfall,
  // sondern dieselbe Ordnung, die auch die Felder bestimmt. `stufe` sagt,
  // über welchen Weg es gefunden wurde, und speist den Tooltip.
  const fuehrend = ordered.length > 0 ? ordered[0] : null;
  const leading = fuehrend
    ? { profile: fuehrend.profile.name, icon: fuehrend.profile.icon || null, stufe: fuehrend.stufe }
    : null;
  // 4T-1171 (Epic 3E-0220): Die beteiligten Profile als geordnete Kette, für
  // das Feld-Formular der Stufe 3 — es zeigt sie als Ebenen und bietet je
  // Ebene die fehlenden Felder zur Übernahme an. Dieselbe Ordnung wie oben,
  // nur ohne die internen Arbeits-Felder (`exclude`, das Profil-Objekt).
  // `leading` bleibt daneben stehen: Es ist zwar `chain[0]`, hat aber einen
  // eigenen Verbraucher und eine eigene Zusicherung aus 4T-1161.
  const chain = ordered.map(({ profile, fromDefault, stufe: kettenStufe, tiefe }) => ({
    profile: profile.name,
    icon: profile.icon || null,
    stufe: kettenStufe,
    tiefe,
    fromDefault,
  }));
  return { fields, missing, leading, chain };
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
  // 4T-1159: Bindungen und ihre Auswertung in der Folge.
  normalizeBindings,
  gebundeneProfile,
  ordnerTrifft,
  // 4T-1176: Erzeugung der Abfrage zu einem Profil (aus
  // property-profiles-abfrage.js weitergereicht).
  erzeugeProfilAbfrage,
  // 4T-0448: gemeinsame Editor-Logik (4T-1161: aus
  // property-profiles-editor.js weitergereicht — die Fassade bleibt der eine
  // Ort, an dem Verbraucher laden, und reicht deshalb alles weiter).
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
