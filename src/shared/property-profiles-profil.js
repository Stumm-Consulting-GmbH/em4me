// 4T-001186 (Epic 3E-000221): Profil-Ebene einer Profil-Datei — was ein Profil
// ÜBER SICH sagt: sein Eltern-Profil (`extends`), die von der Vererbung
// ausgenommenen Feldnamen (`exclude`) und sein Symbol (`icon`).
//
// **Eigene Datei seit dem zweiten Schnitt der Stufe 4.** Der übrige Teil des
// Format-Moduls liest die FELD-Ebene: was eine einzelne Definition sagt. Das
// sind zwei Gegenstände, die nichts miteinander zu tun haben außer der Datei,
// aus der sie stammen — und die Feld-Ebene ist mit jedem Typ-Ausbau gewachsen,
// zuletzt um die abgeleiteten und die strukturierten Typen. Der Schnitt folgt
// damit derselben Naht-Logik wie die des Options- und des Hinweis-Moduls: Hier
// liegt, was ein PROFIL beschreibt, dort, was ein FELD beschreibt.
//
// Blatt-nahes Modul: Es lädt allein den Hinweis-Bauplan und die beiden
// Normalisierer der Feld-Ebene, nichts aus der Fassade. Der Import-Graph
// bleibt gerichtet (Fassade → Format → Profil → Hinweise).
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { buildHint } = require('./property-profiles-hinweise.js');

// Die beiden Normalisierer der Feld-Ebene, hier in ihrer eigenen Fassung.
// Ein Import aus dem Format-Modul waere ein Zyklus, denn jenes laedt dieses;
// die gemeinsame Heimat waere ein drittes Modul fuer zwei Zeilen. Beide sind
// bewusst identisch zu ihren Vorbildern - wer eine aendert, aendert beide.
function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function scalarToString(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}

// 4T-001142 (Epic 3E-000218): Profil-Ebene der Vererbung (E2). `extends` nennt
// höchstens ein Eltern-Profil; eine Liste mit mehr als einem Eintrag ist der
// Hinweis-Fall extendsMultiple und keine Mehrfach-Vererbung (tolerant zählt
// der erste Eintrag). `exclude` nennt Feldnamen, die aus der geerbten Kette
// nicht übernommen werden (Skalar oder Liste; nicht verwertbare Einträge
// entfallen still, wie in einer Werte-Liste). Hinweis-Texte: 4T-001143.
// 4T-001161 (Epic 3E-000219, E5): Symbol-Angabe eines Profils normalisieren.
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
    // 4T-001161: dieselbe Objekt-Form wie der normale Weg — ein früher
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
  // 4T-001161 (Epic 3E-000219, E5): Symbol des Profils (`icon`). Ein freies
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
module.exports = { parseProfileHeritage };
