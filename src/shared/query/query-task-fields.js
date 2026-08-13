'use strict';

// 4T-0987 (Epic 3E-0196): Task-Feld-Katalog des TASKS-Scopes, herausgelöst
// aus perspective-query-eval.js. Bildet die Feld-Namen der Abfrage auf das
// Task-Modell und die vom Aufrufer vorberechneten Zusatz-Angaben ab
// (Dringlichkeit, Blockierungs- und Duplikat-Flags). Prozess-neutral (kein
// Electron, kein DOM); die Feld-Auflösung selbst bleibt im Kern, der hier
// nur nachfragt.

// 4T-0502 (Epic 3E-0096): Prioritaets-Rang des Marker-Kerns fuer das
// Task-Feld priority.rank (Ordnung der sechs Stufen, 0 = dringlichste).
const { priorityRank, TASK_DATE_FIELDS } = require('../tasks/task-markers.js');
const { parseIsoLocalMs } = require('./query-format.js');

// 4T-0502 (Epic 3E-0096): Termin-Feld des Task-Modells -> Abfrage-Datum.
// Fehlende und ungueltige Werte sind null (nicht rechenbar); die Existenz-
// und Gueltigkeits-Fragen tragen die Zusatz-Felder <feld>.set/<feld>.invalid.
function taskDateToQueryValue(v) {
  if (!v || v.invalid) return null;
  const ms = parseIsoLocalMs(v.time ? `${v.date} ${v.time}` : v.date);
  return ms === null ? null : { kind: 'date', ms };
}

// Task-Feld-Katalog des TASKS-Scopes. undefined = kein Task-Feld (der
// Aufrufer faellt auf die Frontmatter der Traeger-Datei zurueck); null =
// Task-Feld ohne Wert. Die festen Feld-Namen verdecken gleichnamige
// Frontmatter-Properties (Referenz-Verhalten des Scopes, dokumentiert).
function resolveTaskField(lower, task) {
  const model = task.model || {};
  if (TASK_DATE_FIELDS.includes(lower)) return taskDateToQueryValue(model[lower]);
  const dotIdx = lower.indexOf('.');
  if (dotIdx > 0) {
    const base = lower.slice(0, dotIdx);
    const sub = lower.slice(dotIdx + 1);
    if (TASK_DATE_FIELDS.includes(base)) {
      if (sub === 'set') return model[base] != null;
      if (sub === 'invalid') return model[base] ? !!model[base].invalid : false;
      return undefined;
    }
    if (base === 'priority' && sub === 'rank') return priorityRank(model.priority);
    if (base === 'status' && sub === 'type') return task.statusType || null;
    // 4T-0508: ID-Zusatz-Felder ("hat ID" und Duplikat-Filter der
    // Eindeutigkeits-Pruefung; Flags kommen vorberechnet vom Aufrufer).
    if (base === 'id' && sub === 'set') return !!model.id;
    if (base === 'id' && sub === 'duplicate') return task.duplicateId === true;
    return undefined;
  }
  switch (lower) {
    case 'happens': {
      // Fruehestes gueltiges aus faellig/geplant/Start (Referenz-Semantik).
      let min = null;
      for (const f of ['due', 'scheduled', 'start']) {
        const v = taskDateToQueryValue(model[f]);
        if (v && (min === null || v.ms < min.ms)) min = v;
      }
      return min;
    }
    case 'priority':
      return model.priority || 'normal';
    case 'status':
      return model.statusChar != null ? model.statusChar : null;
    case 'description':
      return typeof task.description === 'string' ? task.description : null;
    case 'heading':
      return task.heading || null;
    case 'tags':
      return Array.isArray(task.tags) ? task.tags : [];
    case 'recurrence':
      return model.recurrence ? model.recurrence.text : null;
    case 'id':
      return model.id || null;
    case 'dependson':
      return Array.isArray(model.dependsOn) ? model.dependsOn : [];
    case 'line':
      return typeof task.line === 'number' ? task.line : null;
    case 'urgency':
      // 4T-0505: Dringlichkeits-Score — vorberechnet vom Aufrufer
      // (computeUrgency mit injiziertem Bezugstag, siehe backlinks.js).
      return typeof task.urgency === 'number' ? task.urgency : null;
    case 'blocked':
      // 4T-0508: Blockierungs-Flags (offene Vorgaenger / blockiert andere),
      // vorberechnet ueber die Task-Menge des Bereichs (computeDependencyFlags).
      return task.blocked === true;
    case 'blocking':
      return task.blocking === true;
    default:
      return undefined;
  }
}

module.exports = {
  taskDateToQueryValue,
  resolveTaskField,
};
