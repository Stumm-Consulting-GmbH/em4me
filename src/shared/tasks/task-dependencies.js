// 4T-000983 (Epic 3E-000196): Kennungen und Abhängigkeiten der Task-Zeile —
// aus `task-markers.js` ausgezogen, Funktions-Rümpfe unverändert.
//
// Inhalt: Gültigkeit und Vergabe der Task-Kennung, die Mutatoren der
// Kennungs- und Vorgänger-Segmente sowie die Blockierungs-Flags über die
// Task-Menge eines Bereichs.
//
// Abgrenzung zum Kern: `stripIdAndDependsOn` bleibt dort, weil es ein
// reiner Segment-Filter ohne Kennungs-Logik ist und die Wiederholungs-
// Schicht ihn braucht — läge er hier, entstünde ein Zyklus zwischen den
// beiden Schwester-Modulen.
//
// Import-Richtung: nur der Kern `task-markers.js` wird geladen.
// Prozessneutral wie der Kern (CJS, kein Electron, kein DOM).
'use strict';

const { DEPENDS_SYMBOL, ID_SYMBOL, findLastSegment, leadingWs } = require('./task-markers.js');

// --- Abhaengigkeiten (4T-000508, Epic 3E-000096) -----------------------------------------

// Gueltige Task-ID (Referenz-Format: a-z, A-Z, 0-9, '_', '-').
const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;

function isValidTaskId(id) {
  return typeof id === 'string' && TASK_ID_RE.test(id);
}

// ID-Segment setzen oder entfernen (Dialog- und Autocomplete-Weg).
function setTaskId(model, id) {
  const idx = findLastSegment(model, (s) => s.kind === 'id');
  if (id == null || id === '') {
    if (idx >= 0) model.segments.splice(idx, 1);
    model.id = null;
    return;
  }
  if (!isValidTaskId(id)) throw new Error(`Ungueltige Task-ID: ${id}`);
  if (idx >= 0) {
    const seg = model.segments[idx];
    seg.raw = `${leadingWs(seg.raw)}${ID_SYMBOL} ${id}`;
    seg.id = id;
  } else {
    model.segments.push({ kind: 'id', id, raw: ` ${ID_SYMBOL} ${id}` });
  }
  model.id = id;
}

// Vorgaenger-Liste setzen oder entfernen (Dialog-Weg). ids: Array gueltiger
// IDs (dedupliziert in Eingabe-Reihenfolge); leer entfernt das Segment.
function setDependsOn(model, ids) {
  const clean = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw == null ? '' : raw).trim();
    if (!isValidTaskId(id) || clean.includes(id)) continue;
    clean.push(id);
  }
  const idx = findLastSegment(model, (s) => s.kind === 'dependsOn');
  if (clean.length === 0) {
    if (idx >= 0) model.segments.splice(idx, 1);
    model.dependsOn = [];
    return;
  }
  const value = clean.join(', ');
  if (idx >= 0) {
    const seg = model.segments[idx];
    seg.raw = `${leadingWs(seg.raw)}${DEPENDS_SYMBOL} ${value}`;
    seg.ids = clean;
  } else {
    model.segments.push({ kind: 'dependsOn', ids: clean, raw: ` ${DEPENDS_SYMBOL} ${value}` });
  }
  model.dependsOn = clean;
}

// Neue, im Bereich eindeutige Task-ID (Eindeutigkeits-Pruefung ist die
// bewusste Abweichung von der Referenz, Workshop-Punkt 9). Sechs Zeichen
// aus [a-z0-9]; der Zufalls-Generator ist injizierbar (Tests), der
// Sicherheits-Deckel verhindert theoretische Endlos-Schleifen.
function generateTaskId(existingIds, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 1000; attempt++) {
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += alphabet[Math.min(alphabet.length - 1, Math.floor(random() * alphabet.length))];
    }
    if (!existing.has(id)) return id;
  }
  // Deckel erreicht (praktisch unerreichbar): laengere ID aus Zaehler.
  let n = existing.size;
  let fallback = `id${n}`;
  while (existing.has(fallback)) fallback = `id${++n}`;
  return fallback;
}

// Offene Status-Typen im Sinne der Blockierung (Workshop-Punkt 9:
// Blockierung nur zwischen offenen Status-Typen; unbekannte Zeichen ohne
// Typ zaehlen nicht als offen).
const OPEN_STATUS_TYPES = new Set(['TODO', 'IN_PROGRESS', 'ON_HOLD']);

// Blockierungs-Flags ueber die Task-Menge eines Bereichs (Datei-Grenzen
// egal, die Menge kommt vom Aufrufer). tasks: Array { id, dependsOn,
// statusType }. Rueckgabe pro Index { blocked, blocking, duplicateId }:
// - blocked: offene Task mit mindestens einem offenen Vorgaenger.
// - blocking: offene Task mit ID, auf die mindestens eine andere offene
//   Task per Vorgaenger-Bezug verweist.
// - duplicateId: die ID der Task ist im Bereich mehrfach vergeben (weicher
//   Hinweis plus Abfrage-Filter; Definition nicht-rekursiv, Zyklen sind
//   damit tolerant).
function computeDependencyFlags(tasks) {
  const idCounts = new Map();
  const openById = new Map(); // id -> hat mindestens eine OFFENE Task mit dieser ID
  for (const task of tasks) {
    if (!task.id) continue;
    idCounts.set(task.id, (idCounts.get(task.id) || 0) + 1);
    if (OPEN_STATUS_TYPES.has(task.statusType)) {
      openById.set(task.id, true);
    } else if (!openById.has(task.id)) {
      openById.set(task.id, false);
    }
  }
  const referencedOpen = new Set(); // IDs, auf die eine offene Task verweist
  for (const task of tasks) {
    if (!OPEN_STATUS_TYPES.has(task.statusType)) continue;
    for (const dep of task.dependsOn || []) referencedOpen.add(dep);
  }
  return tasks.map((task) => {
    const open = OPEN_STATUS_TYPES.has(task.statusType);
    const blocked = open && (task.dependsOn || []).some((dep) => openById.get(dep) === true);
    const blocking = open && !!task.id && referencedOpen.has(task.id);
    const duplicateId = !!task.id && (idCounts.get(task.id) || 0) > 1;
    return { blocked, blocking, duplicateId };
  });
}

module.exports = {
  isValidTaskId,
  setTaskId,
  setDependsOn,
  generateTaskId,
  computeDependencyFlags,
};
