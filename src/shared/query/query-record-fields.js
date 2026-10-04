'use strict';

// 4T-002039 (Epic 3E-000258): Feld-Katalog der Datensatz-Ebene (`RECORDS`).
// Das Modul beantwortet eine Frage: welchen Wert ein Feld-Name im Kontext eines
// Datensatzes hat. Gegenstück zu `query-task-fields.js` der Aufgaben-Ebene; die
// Feld-Auflösung selbst bleibt im Kern `perspective-query-eval.js`, der hier nur
// nachfragt, nachdem `this.` und `file.` bereits beantwortet sind.
//
// Der Kontext eines Datensatzes (`ctx.record`) kommt vom Erzeuger der Ebene:
//   { table, id, path, display, values, refs }
// `values` ist die Zuordnung vom klein geschriebenen Feld-Namen auf den Wert
// des Werte-Modells, so wie der Tabellen-Bestand für die Abfrage sie liefert
// (Zahl als Zahl, Datum als Datums-Wert, Verweis als Verweis-Wert); `refs` je
// Verweis-Feld die Auslegung der Zelle samt Befund. Beides sind Einträge eines
// Zwischenspeichers und werden hier nur gelesen.
//
// **Rangfolge bei Namensgleichheit** (Festlegung in 4T-002039, Kapitel «Lösung»):
// `record.id` und `record.table` sind die eigenen Angaben des Datensatzes und
// gehen einem Feld vor, das wörtlich so heißt (ein Punkt im Feld-Namen ist
// zulässig). Das ist dieselbe Regel wie bei `file.` auf den übrigen Ebenen: Das
// Wort der Sprache gewinnt, damit derselbe Satz überall dasselbe bedeutet und
// eine Tabelle ihn nicht durch einen Feld-Namen umdeuten kann. Reserviert sind
// genau diese beiden Namen; ein Feld namens `record` bleibt unter seinem Namen
// erreichbar. Ein Feld `id` verdeckt nichts, weil die Kennung nie unter dem
// nackten Namen `id` steht.
//
// **Pfad-Navigation** (4T-002041, E6.2, Festlegung 7 des Epics): Nach den
// eigenen Angaben geht das Feld vor, das wörtlich so heißt wie der ganze Name.
// Sonst wird der Name Segment für Segment gelesen: Der längste Anfang aus ganzen
// Segmenten, der ein Feld nennt, liefert den Wert; ist er ein Datensatz-Verweis,
// geht es mit dem Rest beim Ziel-Datensatz nach denselben Regeln weiter, auch
// über mehrere Tabellen und Stufen. Ohne Punkt-Felder ist das genau «das erste
// Segment». Leer, ins Leere, mehrdeutig und ein Pfad über ein Feld, das kein
// Datensatz-Verweis ist, ergeben «fehlend»; mehrdeutig meldet der Navigator
// zusätzlich für den Hinweis am Block. Jeder Schritt verbraucht mindestens ein
// Segment, ein Pfad über einen Selbstbezug endet deshalb nach der genannten
// Segment-Zahl und kann nicht im Kreis laufen.
//
// **Vergleich eines Verweises mit Text** (Festlegung 8 des Epics): nach der
// Auflösungs-Ordnung einer Verweis-Zelle (E5.4), also so, als stünde der Text in
// der Zelle. Das trägt die Gegenrichtung aus E6.2 ohne neue Syntax.
//
// Das Ziel eines Verweises liest allein der Haupt-Prozess. Der Erzeuger der
// Ebene reicht dafür einen Navigator herein (`ctx.recordNav`):
//   target(ref)          Kontext des Ziel-Datensatzes oder null
//   matches(ref, text)   Vergleich nach Festlegung 8
//   ambiguous()          meldet einen mehrdeutigen Verweis
// Ohne Navigator bleibt ein Punkt-Name ein wörtlicher Feld-Name.
//
// Ein Name, den die Tabelle nicht führt, ist «fehlend» (`null`) und fällt nicht
// auf das Frontmatter der Tabellen-Datei zurück: Dort stehen Definition und
// Steckbrief, keine Werte des Datensatzes.
//
// Prozess-neutral (kein Electron, kein DOM, kein Datei-Zugriff), ohne Import:
// Das Modul bleibt ein Blatt des Ordners.

const OWN_FIELDS = new Map([
  ['record.id', (record) => record.id],
  ['record.table', (record) => record.table],
]);

const AMBIGUOUS = 'ambiguous';

function isRecordRef(v) {
  return !!v && typeof v === 'object' && v.kind === 'record';
}

// Der Wert eines Feldes, das der Datensatz führt. Ein mehrdeutiger Verweis ist
// «fehlend» (so liefert ihn der Tabellen-Bestand) und wird dem Navigator gemeldet.
function fieldValue(record, name, nav) {
  const value = record.values.get(name);
  if (value === null && nav && record.refs instanceof Map) {
    const ref = record.refs.get(name);
    if (ref && ref.status === AMBIGUOUS) nav.ambiguous();
  }
  return value === undefined ? null : value;
}

/**
 * Wert eines Feld-Namens im Kontext eines Datensatzes.
 * @param {string} lower  klein geschriebener Feld-Name
 * @param {{ table: string, id: string, values: Map<string, unknown>, refs?: Map<string, object> }} record
 * @param {{ target: Function, ambiguous: Function }|null} [nav]  Navigator des Erzeugers
 * @returns {unknown} Wert des Werte-Modells oder null («fehlend»)
 */
function resolveRecordField(lower, record, nav) {
  const own = OWN_FIELDS.get(lower);
  if (own) return own(record);
  if (!(record.values instanceof Map)) return null;
  if (record.values.has(lower)) return fieldValue(record, lower, nav);
  if (!nav) return null;
  for (let cut = lower.lastIndexOf('.'); cut > 0; cut = lower.lastIndexOf('.', cut - 1)) {
    const head = lower.slice(0, cut);
    if (!record.values.has(head)) continue;
    const value = fieldValue(record, head, nav);
    if (!isRecordRef(value)) return null;
    const target = nav.target(value);
    return target ? resolveRecordField(lower.slice(cut + 1), target, nav) : null;
  }
  return null;
}

/**
 * Vergleich nach Festlegung 8: ein Datensatz-Verweis gegen Text oder Zahl.
 * @returns {boolean|undefined} undefined, wenn die Regel nicht greift (keine
 *   Seite ein Verweis, beide Seiten Verweise, kein Text, kein Navigator); der
 *   Aufrufer vergleicht dann wie bisher.
 */
function recordRefEquals(a, b, nav) {
  if (!nav || isRecordRef(a) === isRecordRef(b)) return undefined;
  const [ref, other] = isRecordRef(a) ? [a, b] : [b, a];
  if (typeof other !== 'string' && typeof other !== 'number') return undefined;
  return nav.matches(ref, String(other));
}

module.exports = { resolveRecordField, recordRefEquals };
